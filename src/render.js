import { TILE, UNITS, BUILDINGS, def, nameOf, TPS } from './data.js';
import { T_GRASS, T_FOREST, T_WATER, T_ROCK, T_DIRT, T_STUMP } from './map.js';
import * as S from './sprites.js';
import { c, rgb, teamCSS } from './palette.js';

export const VIEW = { x: 176, y: 16, w: 464, h: 448 };
export const MINI = { x: 24, y: 14, s: 128 };
const CHUNK = 16;

function h2(x, y) { let h = (x * 374761393 + y * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return (h ^ (h >>> 16)) >>> 0; }

export class Renderer {
  constructor(canvas, game, me) {
    this.cv = canvas; this.ctx = canvas.getContext('2d'); this.ctx.imageSmoothingEnabled = false;
    this.g = game; this.me = me;
    this.cam = { x: 0, y: 0 };
    const N = game.w * game.h;
    this.explored = new Uint8Array(N); this.visible = new Uint8Array(N);
    this.chunks = new Map();
    this.effects = []; this.frame = 0; this.revealAll = false;
    this.tiles = {
      grass: [0, 1, 2, 3].map(v => S.grassTile(v).toCanvas(S.lut(0))),
      dirt: [0, 1].map(() => S.dirtTile().toCanvas(S.lut(0))),
      water: [0, 1, 2, 3].map(f => S.waterTile(f)),
      stump: [S.stumpTile().toCanvas(S.lut(0))],
      tree: [0, 1, 2, 3].map(v => S.treeTile(v).toCanvas(S.lut(0))),
      rock: [0, 1, 2].map(v => S.rockTile(v).toCanvas(S.lut(0))),
    };
    this.waterCv = this.tiles.water.map(i => i.toCanvas(S.lut(0)));
    this.shore = []; this.shoreC = []; this.dirtE = [];
    for (let m = 0; m < 16; m++) { this.shore[m] = S.edgeOverlay(m, 'sand', 2, 5, true).toCanvas(S.lut(0)); this.dirtE[m] = S.edgeOverlay(m, 'grass', 3, 4, false).toCanvas(S.lut(0)); }
    for (let k = 0; k < 4; k++) this.shoreC[k] = S.cornerOverlay(k, 'sand', 2, 5, true).toCanvas(S.lut(0));
    this.panel = S.stonePanel(176, 480);
    this.topbar = S.woodPanel(640, 16);
    this.mini = document.createElement('canvas'); this.mini.width = this.mini.height = MINI.s;
    this.miniFog = document.createElement('canvas'); this.miniFog.width = game.w; this.miniFog.height = game.h;
    this.miniVer = -1;
    this.fogPat = this.makeFogPattern();
    const st = game.starts[me] || game.starts[0];
    if (st) this.centerOn(st.x * TILE + 64, st.y * TILE + 64);
    this.computeVis();
  }

  makeFogPattern() {
    const cv = document.createElement('canvas'); cv.width = cv.height = 32; const x = cv.getContext('2d');
    x.fillStyle = 'rgba(0,0,0,0.55)'; x.fillRect(0, 0, 32, 32);
    x.fillStyle = 'rgba(0,0,0,0.35)'; for (let j = 0; j < 32; j++) for (let i = (j % 2); i < 32; i += 2) x.fillRect(i, j, 1, 1);
    return cv;
  }

  centerOn(px, py) { this.cam.x = px - VIEW.w / 2; this.cam.y = py - VIEW.h / 2; this.clampCam(); }
  clampCam() {
    this.cam.x = Math.max(0, Math.min(this.g.w * TILE - VIEW.w, this.cam.x));
    this.cam.y = Math.max(0, Math.min(this.g.h * TILE - VIEW.h, this.cam.y));
    this.cam.x = Math.round(this.cam.x); this.cam.y = Math.round(this.cam.y);
  }

  ally(owner) { if (owner === this.me) return true; if (owner < 0 || this.me < 0) return false; return this.g.players[owner].team === this.g.players[this.me].team; }

  computeVis() {
    const g = this.g, W = g.w, H = g.h, vis = this.visible;
    vis.fill(0);
    if (this.revealAll || this.me < 0) { vis.fill(1); this.explored.fill(1); return; }
    for (const e of g.ents) {
      if (e.dead || e.owner < 0 || !this.ally(e.owner) || (e.hidden && e.type !== 'worker')) continue;
      const sr = def(e.type).sight + (e.unit ? 0 : 1);
      const ex = e.hidden ? (g.get(e.inside)?.x ?? e.x) : e.x, ey = e.hidden ? (g.get(e.inside)?.y ?? e.y) : e.y;
      const cx = ex + (e.size - 1) / 2, cy = ey + (e.size - 1) / 2;
      const r2 = (sr + e.size / 2) * (sr + e.size / 2);
      for (let y = Math.max(0, Math.floor(cy - sr - e.size)); y <= Math.min(H - 1, Math.ceil(cy + sr + e.size)); y++)
        for (let x = Math.max(0, Math.floor(cx - sr - e.size)); x <= Math.min(W - 1, Math.ceil(cx + sr + e.size)); x++) {
          const dx = x - cx, dy = y - cy; if (dx * dx + dy * dy <= r2) { vis[y * W + x] = 1; this.explored[y * W + x] = 1; }
        }
    }
  }

  isVisible(e) {
    if (this.revealAll || this.me < 0) return true;
    const W = this.g.w;
    for (let y = e.y; y < e.y + e.size; y++) for (let x = e.x; x < e.x + e.size; x++) if (this.visible[y * W + x]) return true;
    return false;
  }
  isExplored(e) {
    if (this.revealAll || this.me < 0) return true;
    const W = this.g.w;
    for (let y = e.y; y < e.y + e.size; y++) for (let x = e.x; x < e.x + e.size; x++) if (this.explored[y * W + x]) return true;
    return false;
  }

  // ------------------------------------------------------------ terrain chunks
  tileAt(x, y) { const g = this.g; if (x < 0 || y < 0 || x >= g.w || y >= g.h) return T_FOREST; return g.terrain[y * g.w + x]; }
  invalidateTile(x, y) {
    for (const [dx, dy] of [[0, 0], [0, 1], [1, 0], [-1, 0], [0, -1]]) {
      const k = ((x + dx) / CHUNK | 0) + ',' + ((y + dy) / CHUNK | 0); const ch = this.chunks.get(k); if (ch) ch.dirty = true;
    }
  }
  drawChunk(cx, cy) {
    const k = cx + ',' + cy; let ch = this.chunks.get(k);
    if (!ch) { const cv = document.createElement('canvas'); cv.width = CHUNK * TILE; cv.height = CHUNK * TILE + 12; ch = { cv, dirty: true }; this.chunks.set(k, ch); }
    if (!ch.dirty) return ch;
    const x0 = cx * CHUNK, y0 = cy * CHUNK, ctx = ch.cv.getContext('2d'); ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, ch.cv.width, ch.cv.height);
    for (let ty = 0; ty < CHUNK; ty++) for (let tx = 0; tx < CHUNK; tx++) {
      const X = x0 + tx, Y = y0 + ty; if (X >= this.g.w || Y >= this.g.h) continue;
      const t = this.tileAt(X, Y), hv = h2(X, Y), px = tx * TILE, py = ty * TILE + 12;
      if (t === T_WATER) {
        ctx.drawImage(this.waterCv[hv % 4], px, py);
        const land = (a, b) => this.tileAt(a, b) !== T_WATER;
        const m = (land(X, Y - 1) ? 1 : 0) | (land(X + 1, Y) ? 2 : 0) | (land(X, Y + 1) ? 4 : 0) | (land(X - 1, Y) ? 8 : 0);
        if (m) ctx.drawImage(this.shore[m], px, py);
        if (!(m & 3) && land(X + 1, Y - 1)) ctx.drawImage(this.shoreC[0], px, py);
        if (!(m & 6) && land(X + 1, Y + 1)) ctx.drawImage(this.shoreC[1], px, py);
        if (!(m & 12) && land(X - 1, Y + 1)) ctx.drawImage(this.shoreC[2], px, py);
        if (!(m & 9) && land(X - 1, Y - 1)) ctx.drawImage(this.shoreC[3], px, py);
      } else if (t === T_DIRT) {
        ctx.drawImage(this.tiles.dirt[hv % 2], px, py);
        const gr = (a, b) => { const q = this.tileAt(a, b); return q === T_GRASS || q === T_STUMP; };
        const m = (gr(X, Y - 1) ? 1 : 0) | (gr(X + 1, Y) ? 2 : 0) | (gr(X, Y + 1) ? 4 : 0) | (gr(X - 1, Y) ? 8 : 0);
        if (m) ctx.drawImage(this.dirtE[m], px, py);
      } else if (t === T_STUMP) ctx.drawImage(this.tiles.stump[0], px, py);
      else ctx.drawImage(this.tiles.grass[hv % 7 === 0 ? 3 : hv % 3], px, py);
    }
    // tall stuff (trees, rocks) drawn in row order with overhang
    for (let ty = 0; ty < CHUNK; ty++) for (let tx = 0; tx < CHUNK; tx++) {
      const X = x0 + tx, Y = y0 + ty; if (X >= this.g.w || Y >= this.g.h) continue;
      const t = this.tileAt(X, Y), hv = h2(X, Y), px = tx * TILE, py = ty * TILE;
      if (t === T_FOREST) ctx.drawImage(this.tiles.tree[hv % 4], px, py);
      else if (t === T_ROCK) ctx.drawImage(this.tiles.rock[hv % 3], px, py);
    }
    ch.dirty = false; return ch;
  }

  // ------------------------------------------------------------ events from sim
  onEvent(ev) {
    if (ev.t === 'tree') { this.invalidateTile(ev.x, ev.y); this.miniVer = -1; }
    else if (ev.t === 'die') {
      if (ev.unit) this.effects.push({ k: 'corpse', x: ev.x, y: ev.y, type: ev.type, faction: ev.faction, team: this.g.players[ev.owner]?.color ?? 0, t: 0, life: 30 * TPS });
      else if (ev.type !== 'mine' || true) { if (!ev.silent) this.effects.push({ k: 'rubble', x: ev.x, y: ev.y, size: ev.size, t: 0, life: 60 * TPS }); for (let i = 0; i < ev.size * 2; i++) this.effects.push({ k: 'boom', x: ev.x + (h2(i, ev.x) % (ev.size * 10)) / 10, y: ev.y + (h2(ev.y, i) % (ev.size * 10)) / 10, t: -i * 2, life: 12 }); }
    } else if (ev.t === 'boom') this.effects.push({ k: 'boom', x: ev.x - 0.5, y: ev.y - 0.5, t: 0, life: 12 });
  }

  // ------------------------------------------------------------ main draw
  draw(alpha, ui) {
    const ctx = this.ctx, g = this.g; this.frame++;
    if (this.frame % 6 === 0) this.computeVis();
    ctx.save();
    ctx.beginPath(); ctx.rect(VIEW.x, VIEW.y, VIEW.w, VIEW.h); ctx.clip();
    ctx.translate(VIEW.x - this.cam.x, VIEW.y - this.cam.y);
    // terrain
    const cx0 = Math.floor(this.cam.x / (CHUNK * TILE)), cy0 = Math.floor(this.cam.y / (CHUNK * TILE));
    const cx1 = Math.floor((this.cam.x + VIEW.w) / (CHUNK * TILE)), cy1 = Math.floor((this.cam.y + VIEW.h + 12) / (CHUNK * TILE));
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      if (cx * CHUNK >= g.w || cy * CHUNK >= g.h) continue;
      const ch = this.drawChunk(cx, cy); ctx.drawImage(ch.cv, cx * CHUNK * TILE, cy * CHUNK * TILE - 12);
    }
    const tx0 = Math.floor(this.cam.x / TILE), ty0 = Math.floor(this.cam.y / TILE), tx1 = Math.min(g.w - 1, tx0 + 15), ty1 = Math.min(g.h - 1, ty0 + 15);
    // water shimmer
    const wf = (this.frame >> 4) % 4;
    for (let y = ty0; y <= ty1; y++) for (let x = tx0; x <= tx1; x++) {
      if (g.terrain[y * g.w + x] !== T_WATER) continue; const hv = h2(x, y);
      if ((hv + wf) % 4 === 0) { ctx.fillStyle = 'rgba(200,230,255,0.5)'; ctx.fillRect(x * TILE + (hv % 20) + 4, y * TILE + ((hv >> 5) % 22) + 4 + (wf & 1), 4, 1); }
    }
    // ground effects
    for (const f of this.effects) {
      if (f.k === 'rubble') ctx.drawImage(S.rubbleSprite(f.size), f.x * TILE, f.y * TILE);
      else if (f.k === 'corpse' && this.visible[f.y * g.w + f.x]) ctx.drawImage(S.corpseSprite(f.type, f.faction, f.team, f.t > f.life * 0.5 ? 2 : 0), f.x * TILE, f.y * TILE);
    }
    // placement grid for building ghost under entities
    const sel = new Set(ui.selection);
    // entities sorted by y
    const list = [];
    for (const e of g.ents) {
      if (e.dead || e.hidden) continue;
      if (e.x + e.size < tx0 - 1 || e.x > tx1 + 1 || e.y + e.size < ty0 - 1 || e.y > ty1 + 2) continue;
      if (e.unit) { if (!this.ally(e.owner) && !this.isVisible(e)) continue; }
      else if (!this.isExplored(e)) continue;
      list.push(e);
    }
    const posOf = (e) => {
      if (!e.unit || e.mp <= 0) return [e.x * TILE, e.y * TILE];
      const f = Math.max(0, Math.min(1, (e.mp - alpha) / e.mt));
      return [(e.x - (e.x - e.px) * f) * TILE, (e.y - (e.y - e.py) * f) * TILE];
    };
    list.sort((a, b) => (a.y + a.size) - (b.y + b.size) || a.id - b.id);
    for (const e of list) {
      const [px, py] = posOf(e); e._px = px; e._py = py;
      const P = g.players[e.owner], team = P ? P.color : 0, fac = P ? P.faction : 0;
      if (sel.has(e.id)) this.selBox(e, px, py);
      if (e.unit) {
        let frame = 'idle';
        const chopping = e.order && e.order.type === 'gather' && e.order.phase === 'chop';
        if (e.anim > 0) frame = e.anim > 5 ? 'atk0' : 'atk1';
        else if (e.mp > 0 || (e.path && e.order)) frame = ((g.tick >> 2) + e.id) % 2 ? 'walk0' : 'walk1';
        if (chopping) frame = (g.tick >> 3) % 2 ? 'atk0' : 'atk1';
        const sp = S.unitSprite(e.type, fac, team, frame, e.carry ? e.carryKind : null, chopping);
        ctx.save(); ctx.translate(Math.round(px) + 16, Math.round(py));
        if (e.facing < 0) ctx.scale(-1, 1);
        ctx.drawImage(sp, -16, 0); ctx.restore();
      } else {
        const d = BUILDINGS[e.type];
        const stage = e.built ? 2 : (e.progress / d.time < 0.5 ? 0 : 1);
        ctx.drawImage(S.buildingSprite(e.type, fac, team, stage), px, py - 16);
        if (e.built && e.type !== 'mine' && e.hp < e.maxHp / 2) {
          const big = e.hp < e.maxHp / 4; const fr = ((this.frame >> 3) + e.id) % 4;
          ctx.drawImage(S.fireSprite(fr, big), px + e.size * 16 - (big ? 12 : 8), py + e.size * 8 - 8);
          if (big) ctx.drawImage(S.fireSprite((fr + 2) % 4, false), px + e.size * 6, py + e.size * 18 - 16);
        }
      }
    }
    // missiles
    for (const m of g.missiles) {
      const t = Math.min(1, (m.t + alpha) / m.tt);
      const x = (m.sx + (m.tx - m.sx) * t) * TILE, yb = (m.sy + (m.ty - m.sy) * t) * TILE;
      const arc = m.kind === 'rock' ? Math.sin(t * Math.PI) * 40 : Math.sin(t * Math.PI) * 10;
      const tx = Math.floor(x / TILE), ty = Math.floor(yb / TILE);
      if (!this.revealAll && this.me >= 0 && !this.visible[ty * g.w + tx]) continue;
      const sp = S.missileSprite(m.kind);
      ctx.save(); ctx.translate(x, yb - arc);
      if (m.kind !== 'rock') ctx.rotate(Math.atan2((m.ty - m.sy) * TILE - Math.cos(t * Math.PI) * 10 * Math.PI, (m.tx - m.sx) * TILE));
      ctx.drawImage(sp, -sp.width / 2, -sp.height / 2); ctx.restore();
    }
    for (const f of this.effects) if (f.k === 'boom' && f.t >= 0) ctx.drawImage(S.boomSprite(Math.min(3, (f.t / 3) | 0)), f.x * TILE, f.y * TILE);
    // health bars for selected
    for (const e of list) if (sel.has(e.id) && e.type !== 'mine') this.hpBar(e, e._px, e._py);
    // rally point
    if (ui.selection.length === 1) { const b = g.get(ui.selection[0]); if (b && !b.unit && b.rally && b.owner === this.me) this.rallyFlag(b.rally.x * TILE, b.rally.y * TILE); }
    // building ghost
    if (ui.mode === 'place' && ui.mouse.inView) this.ghost(ui);
    // fog
    if (!this.revealAll && this.me >= 0) {
      for (let y = ty0; y <= ty1; y++) for (let x = tx0; x <= tx1; x++) {
        const i = y * g.w + x;
        if (!this.explored[i]) { ctx.fillStyle = '#000'; ctx.fillRect(x * TILE, y * TILE, TILE, TILE); }
        else if (!this.visible[i]) ctx.drawImage(this.fogPat, x * TILE, y * TILE);
      }
      // soften black edges
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      for (let y = ty0; y <= ty1; y++) for (let x = tx0; x <= tx1; x++) {
        const i = y * g.w + x; if (!this.explored[i]) continue;
        if (x > 0 && !this.explored[i - 1]) ctx.fillRect(x * TILE, y * TILE, 6, TILE);
        if (x < g.w - 1 && !this.explored[i + 1]) ctx.fillRect(x * TILE + 26, y * TILE, 6, TILE);
        if (y > 0 && !this.explored[i - g.w]) ctx.fillRect(x * TILE, y * TILE, TILE, 6);
        if (y < g.h - 1 && !this.explored[i + g.w]) ctx.fillRect(x * TILE, y * TILE + 26, TILE, 6);
      }
    }
    // effects aging
    for (const f of this.effects) f.t++;
    this.effects = this.effects.filter(f => f.t < f.life);
    // drag box
    ctx.restore();
    if (ui.drag && ui.drag.active) {
      ctx.strokeStyle = '#3f3'; ctx.lineWidth = 1;
      const x0 = Math.min(ui.drag.x0, ui.drag.x1), y0 = Math.min(ui.drag.y0, ui.drag.y1);
      ctx.strokeRect(x0 + 0.5, y0 + 0.5, Math.abs(ui.drag.x1 - ui.drag.x0), Math.abs(ui.drag.y1 - ui.drag.y0));
    }
    // click markers
    if (ui.marker && ui.marker.t > 0) {
      ui.marker.t--; const mx = ui.marker.x - this.cam.x + VIEW.x, my = ui.marker.y - this.cam.y + VIEW.y, r = ui.marker.t / 2;
      ctx.strokeStyle = ui.marker.color; ctx.beginPath(); ctx.ellipse(mx, my, r + 2, (r + 2) / 2, 0, 0, Math.PI * 2); ctx.stroke();
    }
    this.drawHUD(ui);
  }

  selBox(e, px, py) {
    const ctx = this.ctx; const col = e.owner === this.me ? '#28f028' : e.owner < 0 ? '#f0f028' : this.ally(e.owner) ? '#28c8f0' : '#f02828';
    ctx.strokeStyle = col; ctx.lineWidth = 1;
    const s = e.size * TILE; ctx.strokeRect(Math.round(px) + 0.5, Math.round(py) + 0.5, s - 1, s - 1);
  }
  hpBar(e, px, py) {
    const ctx = this.ctx, s = e.size * TILE, w = s - 4, f = Math.max(0, e.hp / e.maxHp);
    ctx.fillStyle = '#000'; ctx.fillRect(px + 2, py + s - 3, w, 3);
    ctx.fillStyle = f > 0.5 ? '#2c2' : f > 0.25 ? '#dd2' : '#d22'; ctx.fillRect(px + 2, py + s - 2, Math.max(1, Math.round(w * f)), 1);
  }
  rallyFlag(x, y) {
    const ctx = this.ctx; ctx.save(); ctx.translate(VIEW.x - this.cam.x, VIEW.y - this.cam.y);
    ctx.fillStyle = '#542'; ctx.fillRect(x + 14, y + 6, 2, 22); ctx.fillStyle = teamCSS(this.g.players[this.me].color); ctx.fillRect(x + 16, y + 6, 9, 6);
    ctx.restore();
  }
  ghost(ui) {
    const ctx = this.ctx, g = this.g, d = BUILDINGS[ui.buildType], s = d.size;
    const [tx, ty] = ui.placeAt;
    const P = g.players[this.me];
    ctx.globalAlpha = 0.6; ctx.drawImage(S.buildingSprite(ui.buildType, P.faction, P.color, 2), tx * TILE, ty * TILE - 16); ctx.globalAlpha = 1;
    for (let y = ty; y < ty + s; y++) for (let x = tx; x < tx + s; x++) {
      let ok = g.passable(x, y) && this.explored[y * g.w + x];
      const o = g.inMap(x, y) ? g.uocc[y * g.w + x] : 0; if (o && !ui.selection.includes(o)) ok = false;
      ctx.fillStyle = ok ? 'rgba(40,220,40,0.35)' : 'rgba(230,30,30,0.45)'; ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
    }
    if (ui.buildType === 'hall' && !g.canPlace('hall', tx, ty, -1)) { ctx.fillStyle = 'rgba(230,30,30,0.3)'; ctx.fillRect(tx * TILE, ty * TILE, s * TILE, s * TILE); }
  }

  // ------------------------------------------------------------ HUD
  text(s, x, y, col = '#f0d878', size = 10, align = 'left', bold = true) {
    const ctx = this.ctx; ctx.font = `${bold ? 'bold ' : ''}${size}px "Trebuchet MS", Verdana, sans-serif`; ctx.textAlign = align; ctx.textBaseline = 'top';
    ctx.fillStyle = '#000'; ctx.fillText(s, x + 1, y + 1); ctx.fillStyle = col; ctx.fillText(s, x, y);
  }
  bevel(x, y, w, h, inset) {
    const ctx = this.ctx; ctx.fillStyle = inset ? '#1a1410' : '#b8a488'; ctx.fillRect(x, y, w, 1); ctx.fillRect(x, y, 1, h);
    ctx.fillStyle = inset ? '#b8a488' : '#1a1410'; ctx.fillRect(x, y + h - 1, w, 1); ctx.fillRect(x + w - 1, y, 1, h);
  }

  drawMinimap(ui) {
    const g = this.g, ctx = this.ctx, mc = this.mini.getContext('2d');
    if (this.miniVer !== g.terrainVersion) {
      this.miniVer = g.terrainVersion;
      const id = mc.createImageData(g.w, g.h);
      const col = { [T_GRASS]: [62, 110, 30], [T_DIRT]: [120, 90, 50], [T_STUMP]: [70, 110, 36], [T_FOREST]: [14, 52, 20], [T_WATER]: [24, 60, 130], [T_ROCK]: [110, 98, 88] };
      for (let i = 0; i < g.w * g.h; i++) { const q = col[g.terrain[i]]; id.data[i * 4] = q[0]; id.data[i * 4 + 1] = q[1]; id.data[i * 4 + 2] = q[2]; id.data[i * 4 + 3] = 255; }
      const tmp = document.createElement('canvas'); tmp.width = g.w; tmp.height = g.h; tmp.getContext('2d').putImageData(id, 0, 0);
      this.miniBase = tmp;
    }
    if (this.frame % 10 === 1 || !this.miniFogDone) {
      const fc = this.miniFog.getContext('2d'); const id = fc.createImageData(g.w, g.h);
      for (let i = 0; i < g.w * g.h; i++) id.data[i * 4 + 3] = this.revealAll || this.me < 0 ? 0 : !this.explored[i] ? 255 : !this.visible[i] ? 110 : 0;
      fc.putImageData(id, 0, 0); this.miniFogDone = true;
    }
    mc.imageSmoothingEnabled = false;
    mc.drawImage(this.miniBase, 0, 0, MINI.s, MINI.s);
    const sc = MINI.s / g.w;
    for (const e of g.ents) {
      if (e.dead || e.hidden) continue;
      if (e.unit && !this.ally(e.owner) && !this.isVisible(e)) continue;
      if (!e.unit && !this.isExplored(e)) continue;
      mc.fillStyle = e.owner < 0 ? '#ffe040' : teamCSS(g.players[e.owner].color);
      const s = Math.max(2, e.size * sc); mc.fillRect(e.x * sc, e.y * sc, s, s);
    }
    mc.drawImage(this.miniFog, 0, 0, MINI.s, MINI.s);
    mc.strokeStyle = '#fff'; mc.lineWidth = 1;
    mc.strokeRect(this.cam.x / TILE * sc + 0.5, this.cam.y / TILE * sc + 0.5, VIEW.w / TILE * sc, VIEW.h / TILE * sc);
    if (ui.ping && ui.ping.t > 0) { ui.ping.t--; mc.strokeStyle = ui.ping.t % 10 < 5 ? '#f22' : '#ff2'; mc.strokeRect(ui.ping.x * sc - 4, ui.ping.y * sc - 4, 8, 8); }
    ctx.drawImage(this.mini, MINI.x, MINI.y);
    this.bevel(MINI.x - 2, MINI.y - 2, MINI.s + 4, MINI.s + 4, true);
  }

  drawHUD(ui) {
    const ctx = this.ctx, g = this.g, P = g.players[this.me];
    ctx.drawImage(this.panel, 0, 0);
    ctx.drawImage(this.topbar, 0, 0);
    ctx.drawImage(this.topbar, 0, 464);
    this.bevel(0, 0, 176, 480, false);
    // resources
    if (P) {
      const gx = 300;
      this.goldIcon(gx, 3); this.text(String(P.gold), gx + 14, 2);
      this.woodIcon(gx + 90, 3); this.text(String(P.wood), gx + 104, 2);
      this.foodIcon(gx + 180, 3); this.text(`${P.food}/${P.foodCap}`, gx + 194, 2, P.food >= P.foodCap ? '#ff7060' : '#f0d878');
    }
    this.text(ui.netStatus || '', 186, 2, '#c8c0a8', 9, 'left', false);
    this.drawMinimap(ui);
    // info box
    const ib = { x: 8, y: 150, w: 160, h: 112 };
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(ib.x, ib.y, ib.w, ib.h); this.bevel(ib.x, ib.y, ib.w, ib.h, true);
    const sel = ui.selection.map(id => g.get(id)).filter(Boolean);
    if (sel.length === 1) this.infoSingle(sel[0], ib);
    else if (sel.length > 1) {
      sel.forEach((e, i) => {
        const x = ib.x + 4 + (i % 3) * 52, y = ib.y + 4 + ((i / 3) | 0) * 36;
        const PP = g.players[e.owner];
        ctx.drawImage(S.entIcon(e.type, PP.faction, PP.color, e.unit), 0, 0, 46, 38, x, y, 46, 30);
        ctx.fillStyle = '#000'; ctx.fillRect(x, y + 30, 46, 3); const f = e.hp / e.maxHp; ctx.fillStyle = f > 0.5 ? '#2c2' : f > 0.25 ? '#dd2' : '#d22'; ctx.fillRect(x, y + 31, 46 * f, 1);
        this.bevel(x, y, 46, 30, false);
      });
    }
    // buttons
    ui.buttons = this.buttonsFor(sel, ui);
    ui.buttons.forEach((b, i) => {
      const x = 8 + (i % 3) * 54, y = 272 + ((i / 3) | 0) * 46; b.rect = [x, y, 50, 42];
      ctx.fillStyle = '#000'; ctx.fillRect(x, y, 50, 42);
      if (b.icon) ctx.drawImage(b.icon, x + 2, y + 2);
      if (b.disabled) { ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(x + 2, y + 2, 46, 38); }
      this.bevel(x, y, 50, 42, ui.hoverBtn === b.id && ui.mouseDown);
      if (ui.hoverBtn === b.id) { ctx.strokeStyle = '#f0d878'; ctx.strokeRect(x + 1.5, y + 1.5, 47, 39); }
      if (b.hot) this.text(b.hot === 'Escape' ? 'Esc' : b.hot.toUpperCase(), x + 47, y + 29, '#fff', 9, 'right');
    });
    // menu button
    ctx.fillStyle = '#3a2c20'; ctx.fillRect(8, 440, 160, 18); this.bevel(8, 440, 160, 18, false); this.text('Menu (F10)', 88, 443, '#f0d878', 10, 'center');
    // status line
    let status = '';
    const hb = ui.buttons.find(b => b.id === ui.hoverBtn);
    if (hb) status = hb.label + (hb.cost ? '   ' + hb.cost : '');
    else if (ui.mode === 'target') status = ui.targetLabel + ' — click a target (Esc to cancel)';
    else if (ui.mode === 'place') status = 'Place ' + nameOf(ui.buildType, P.faction) + ' (Esc to cancel, Shift for more)';
    const now = performance.now();
    this.text(status, 184, 466, '#f0d878', 10);
    // floating messages in viewport
    ui.msgs.filter(m => now - m.t < 5000).slice(-3).forEach((m, i, arr) => this.text(m.text, VIEW.x + 8, VIEW.y + VIEW.h - 18 - (arr.length - 1 - i) * 14, '#fff', 10));
    if (ui.banner) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(VIEW.x + 40, VIEW.y + 170, VIEW.w - 80, 60); this.bevel(VIEW.x + 40, VIEW.y + 170, VIEW.w - 80, 60, false);
      this.text(ui.banner, VIEW.x + VIEW.w / 2, VIEW.y + 184, '#f0d878', 18, 'center');
      if (ui.subBanner) this.text(ui.subBanner, VIEW.x + VIEW.w / 2, VIEW.y + 208, '#e0e0e0', 10, 'center', false);
    }
  }

  goldIcon(x, y) { const ctx = this.ctx; ctx.fillStyle = '#7a5000'; ctx.fillRect(x, y + 3, 11, 7); ctx.fillStyle = '#f8d040'; ctx.fillRect(x + 1, y + 2, 9, 6); ctx.fillStyle = '#fff4a0'; ctx.fillRect(x + 2, y + 3, 3, 2); }
  woodIcon(x, y) { const ctx = this.ctx; ctx.fillStyle = '#4a2a0e'; ctx.fillRect(x, y + 2, 12, 8); ctx.fillStyle = '#a06830'; ctx.fillRect(x, y + 2, 12, 3); ctx.fillRect(x, y + 6, 12, 3); ctx.fillStyle = '#e0b070'; ctx.fillRect(x + 10, y + 2, 2, 3); ctx.fillRect(x + 10, y + 6, 2, 3); }
  foodIcon(x, y) { const ctx = this.ctx; ctx.fillStyle = '#5a3810'; ctx.fillRect(x + 1, y + 1, 9, 10); ctx.fillStyle = '#e8c860'; ctx.fillRect(x + 2, y + 2, 7, 8); ctx.fillStyle = '#8a6020'; ctx.fillRect(x + 2, y + 5, 7, 1); }

  infoSingle(e, ib) {
    const g = this.g, ctx = this.ctx, P = g.players[e.owner], fac = P ? P.faction : 0;
    ctx.drawImage(S.entIcon(e.type, fac, P ? P.color : 0, e.unit), ib.x + 4, ib.y + 4); this.bevel(ib.x + 4, ib.y + 4, 46, 38, false);
    this.text(nameOf(e.type, fac), ib.x + 56, ib.y + 6, '#f0d878', 11);
    if (P) this.text(P.name, ib.x + 56, ib.y + 20, teamCSS(P.color), 9, 'left', false);
    const d = def(e.type);
    if (e.type === 'mine') { this.text('Gold left: ' + e.gold, ib.x + 8, ib.y + 50, '#f0d878', 10); return; }
    ctx.fillStyle = '#000'; ctx.fillRect(ib.x + 4, ib.y + 44, 46, 4); const f = e.hp / e.maxHp; ctx.fillStyle = f > 0.5 ? '#2c2' : f > 0.25 ? '#dd2' : '#d22'; ctx.fillRect(ib.x + 4, ib.y + 45, 46 * f, 2);
    this.text(`${Math.max(0, e.hp)}/${e.maxHp}`, ib.x + 56, ib.y + 32, '#e0e0e0', 9, 'left', false);
    let y = ib.y + 54;
    const line = (s) => { this.text(s, ib.x + 8, y, '#e8dcc0', 9, 'left', false); y += 12; };
    if (e.unit) {
      line(`Armor: ${d.armor}`); line(`Damage: ${Math.max(1, (d.pierce / 2) | 0)}-${d.dmg + d.pierce}`); line(`Range: ${d.range}   Sight: ${d.sight}`); line(`Speed: ${Math.round(200 / d.speed)}`);
      if (e.carry) line(`Carrying ${e.carry} ${e.carryKind === 'gold' ? 'gold' : 'lumber'}`);
    } else if (!e.built) {
      line('Under construction');
      this.progress(ib.x + 8, ib.y + 74, e.progress / d.time);
    } else if (e.train.length) {
      line('Training: ' + nameOf(e.train[0].type, fac));
      this.progress(ib.x + 8, ib.y + 70, e.train[0].t / UNITS[e.train[0].type].time);
      e.train.forEach((t, i) => { ctx.drawImage(S.entIcon(t.type, fac, P.color, true), 0, 0, 46, 38, ib.x + 8 + i * 30, ib.y + 82, 28, 23); this.bevel(ib.x + 8 + i * 30, ib.y + 82, 28, 23, false); });
    } else {
      line(`Armor: ${d.armor}`);
      if (d.food) line(`Provides food: ${d.food}`);
      if (d.attack) line(`Damage: ${d.attack.dmg + d.attack.pierce}  Range: ${d.attack.range}`);
      if (d.depot) line('Accepts: ' + d.depot.map(k => k === 'gold' ? 'gold' : 'lumber').join(', '));
      if (e.type === 'hall' && P) { line(`Gold mined: ${P.goldMined}`); line(`Lumber cut: ${P.woodCut}`); }
    }
  }
  progress(x, y, f) { const ctx = this.ctx; ctx.fillStyle = '#000'; ctx.fillRect(x, y, 144, 8); ctx.fillStyle = '#2a8a2a'; ctx.fillRect(x + 1, y + 1, 142 * Math.min(1, f), 6); this.bevel(x, y, 144, 8, true); }

  buttonsFor(sel, ui) {
    const g = this.g, P = g.players[this.me]; if (!P) return [];
    const own = sel.filter(e => e.owner === this.me);
    if (!own.length || own.length !== sel.length) return [];
    const fac = P.faction, team = P.color;
    const costStr = (d) => `Gold ${d.gold}  Lumber ${d.wood}` + (d.food ? `  Food ${d.food}` : '');
    const B = [];
    const units = own.filter(e => e.unit), blds = own.filter(e => !e.unit);
    if (units.length) {
      if (ui.menu === 'build' || ui.menu === 'build2') {
        const list = ui.menu === 'build' ? ['farm', 'barracks', 'mill', 'hall'] : ['stable', 'forge', 'tower'];
        for (const t of list) {
          const d = BUILDINGS[t];
          B.push({ id: 'b_' + t, icon: S.entIcon(t, fac, team, false), label: 'Build ' + nameOf(t, fac), hot: d.key, cost: costStr(d) + (d.req && !P.has[d.req] ? '  (requires ' + nameOf(d.req, fac) + ')' : ''), disabled: d.req && !P.has[d.req], act: { k: 'place', btype: t } });
        }
        while (B.length < 8) B.push({ id: 'pad' + B.length, icon: null, label: '', act: null, blank: true });
        B.push({ id: 'back', icon: S.cmdIcon('back', team), label: 'Back', hot: 'Escape', act: { k: 'menu', menu: null } });
        return B.filter(b => !b.blank || true).map(b => b.blank ? { ...b, icon: null } : b);
      }
      B.push({ id: 'move', icon: S.cmdIcon('move', team), label: 'Move', hot: 'm', act: { k: 'target', t: 'move' } });
      B.push({ id: 'stop', icon: S.cmdIcon('stop', team), label: 'Stop', hot: 's', act: { k: 'cmd', t: 'stop' } });
      B.push({ id: 'attack', icon: S.cmdIcon('attack', team), label: 'Attack / attack-move', hot: 'a', act: { k: 'target', t: 'attack' } });
      const workers = units.filter(u => UNITS[u.type].worker);
      if (workers.length === units.length) {
        B.push({ id: 'gather', icon: S.cmdIcon('gather', team), label: 'Harvest gold / lumber', hot: 'g', act: { k: 'target', t: 'gather' } });
        if (units.some(u => u.carry)) B.push({ id: 'ret', icon: S.cmdIcon('return', team), label: 'Return goods', hot: 'r', act: { k: 'cmd', t: 'ret' } });
        else B.push({ id: 'pad1', icon: null, label: '' });
        B.push({ id: 'hold', icon: S.cmdIcon('hold', team), label: 'Stand ground', hot: 'h', act: { k: 'cmd', t: 'hold' } });
        B.push({ id: 'build', icon: S.cmdIcon('build', team), label: 'Build basic structure', hot: 'b', act: { k: 'menu', menu: 'build' } });
        B.push({ id: 'build2', icon: S.cmdIcon('build2', team), label: 'Build advanced structure', hot: 'v', act: { k: 'menu', menu: 'build2' } });
      } else {
        B.push({ id: 'hold', icon: S.cmdIcon('hold', team), label: 'Stand ground', hot: 'h', act: { k: 'cmd', t: 'hold' } });
      }
      return B;
    }
    // buildings
    const b = blds[0];
    if (!b.built) return [Object.assign({ id: 'pad0', icon: null, label: '' }), { id: 'pad1', icon: null, label: '' }, { id: 'pad2', icon: null, label: '' }, { id: 'pad3', icon: null, label: '' }, { id: 'pad4', icon: null, label: '' }, { id: 'pad5', icon: null, label: '' }, { id: 'pad6', icon: null, label: '' }, { id: 'pad7', icon: null, label: '' }, { id: 'cancel', icon: S.cmdIcon('cancel', team), label: 'Cancel construction (75% refund)', hot: 'Escape', act: { k: 'cmd', t: 'cancel' } }];
    const d = BUILDINGS[b.type];
    if (d.trains) for (const ut of d.trains) {
      const ud = UNITS[ut];
      B.push({ id: 't_' + ut, icon: S.entIcon(ut, fac, team, true), label: 'Train ' + nameOf(ut, fac), hot: ud.key, cost: costStr(ud) + (ud.req && !P.has[ud.req] ? '  (requires ' + nameOf(ud.req, fac) + ')' : ''), disabled: ud.req && !P.has[ud.req], act: { k: 'train', utype: ut } });
    }
    if (b.train.length) { while (B.length < 8) B.push({ id: 'pad' + B.length, icon: null, label: '' }); B.push({ id: 'cancel', icon: S.cmdIcon('cancel', team), label: 'Cancel last unit (full refund)', hot: 'Escape', act: { k: 'cmd', t: 'cancel' } }); }
    return B;
  }

  screenToWorld(sx, sy) { return [sx - VIEW.x + this.cam.x, sy - VIEW.y + this.cam.y]; }
  entityAt(wx, wy) {
    const g = this.g; const tx = Math.floor(wx / TILE), ty = Math.floor(wy / TILE);
    let best = null;
    for (const e of g.ents) {
      if (e.dead || e.hidden) continue;
      const px = e._px ?? e.x * TILE, py = e._py ?? e.y * TILE, s = e.size * TILE;
      if (wx >= px && wx < px + s && wy >= py && wy < py + s) {
        if (e.unit && !this.ally(e.owner) && !this.isVisible(e)) continue;
        if (!e.unit && !this.isExplored(e)) continue;
        if (!best || (e.unit && !best.unit)) best = e;
      }
    }
    return best;
  }
}
