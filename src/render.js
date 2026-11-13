import { TILE, UNITS, BUILDINGS, def, nameOf, TPS } from './data.js';
import { T_FOREST, T_ROCK } from './map.js';
import * as S from './sprites.js';
import { c, rgb, teamCSS } from './palette.js';
import { paintGround, waterFrame, WATER_FRAMES, treeClump, rockClump, TREE, ROCKV, MINI_COL } from './terrain.js';

export const VIEW = { x: 176, y: 16, w: 464, h: 448 };
export const MINI = { x: 24, y: 14, s: 128 };
const CHUNK = 8;
const UO = S.UNIT_OFF, BO = S.BUILD_OFF;

function h2(x, y) { let h = (x * 374761393 + y * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return (h ^ (h >>> 16)) >>> 0; }

export class Renderer {
  constructor(canvas, game, me) {
    this.cv = canvas; this.ctx = canvas.getContext('2d'); this.ctx.imageSmoothingEnabled = false;
    this.g = game; this.me = me;
    this.cam = { x: 0, y: 0 };
    const N = game.w * game.h;
    this.explored = new Uint8Array(N); this.visible = new Uint8Array(N);
    this.chunks = new Map();
    this.effects = []; this.texts = []; this.frame = 0; this.revealAll = false;
    const l0 = S.lut(0);
    this.waterPat = []; for (let f = 0; f < WATER_FRAMES; f++) this.waterPat.push(this.ctx.createPattern(waterFrame(f).toCanvas(l0), 'repeat'));
    this.trees = [0, 1, 2, 3, 4, 5].map(v => treeClump(v).toCanvas(l0));
    this.rocks = [0, 1, 2, 3].map(v => rockClump(v).toCanvas(l0));
    this.panel = S.stonePanel(176, 480);
    this.topbar = S.woodPanel(640, 16);
    this.fogCv = document.createElement('canvas'); this.fogCv.width = this.fogCv.height = 18;
    this.mini = document.createElement('canvas'); this.mini.width = this.mini.height = MINI.s;
    this.miniFog = document.createElement('canvas'); this.miniFog.width = game.w; this.miniFog.height = game.h;
    this.miniVer = -1;
    const st = game.starts[me] || game.starts[0];
    if (st) this.centerOn(st.x * TILE + 64, st.y * TILE + 64);
    this.computeVis();
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
    // a changed tile repaints the 3x3 tiles around it in whichever chunks they touch
    for (let cy = ((y - 1) / CHUNK) | 0; cy <= ((y + 1) / CHUNK) | 0; cy++) for (let cx = ((x - 1) / CHUNK) | 0; cx <= ((x + 1) / CHUNK) | 0; cx++) {
      const ch = this.chunks.get(cx + ',' + cy); if (ch && !ch.dirty) ch.patch.push([x, y]);
    }
  }
  chunkReady(cx, cy) { const ch = this.chunks.get(cx + ',' + cy); return ch && !ch.dirty; }
  drawChunk(cx, cy) {
    const k = cx + ',' + cy; let ch = this.chunks.get(k);
    if (!ch) { const cv = document.createElement('canvas'); cv.width = cv.height = CHUNK * TILE; ch = { cv, dirty: true, patch: [] }; this.chunks.set(k, ch); }
    const x0 = cx * CHUNK, y0 = cy * CHUNK, tile = (x, y) => this.tileAt(x, y);
    if (ch.dirty) {
      const ctx = ch.cv.getContext('2d'); ctx.clearRect(0, 0, ch.cv.width, ch.cv.height);
      ctx.drawImage(paintGround(tile, x0, y0, CHUNK, CHUNK).toCanvas(S.lut(0)), 0, 0);
      ch.dirty = false; ch.patch.length = 0;
    } else if (ch.patch.length) {
      const ctx = ch.cv.getContext('2d');
      for (const [x, y] of ch.patch) { const px = (x - 1 - x0) * TILE, py = (y - 1 - y0) * TILE; ctx.clearRect(px, py, 96, 96); ctx.drawImage(paintGround(tile, x - 1, y - 1, 3, 3).toCanvas(S.lut(0)), px, py); }
      ch.patch.length = 0;
    }
    return ch;
  }

  // ------------------------------------------------------------ events from sim
  onEvent(ev) {
    if (ev.t === 'tree') { this.invalidateTile(ev.x, ev.y); this.miniVer = -1; }
    else if (ev.t === 'die') {
      if (ev.unit) this.effects.push({ k: 'corpse', x: ev.x, y: ev.y, type: ev.type, faction: ev.faction, team: this.g.players[ev.owner]?.color ?? 0, t: 0, life: 30 * TPS });
      else if (ev.type !== 'mine' || true) { if (!ev.silent) this.effects.push({ k: 'rubble', x: ev.x, y: ev.y, size: ev.size, t: 0, life: 60 * TPS }); for (let i = 0; i < ev.size * 2; i++) this.effects.push({ k: 'boom', x: ev.x + (h2(i, ev.x) % (ev.size * 10)) / 10, y: ev.y + (h2(ev.y, i) % (ev.size * 10)) / 10, t: -i * 2, life: 15 }); }
    } else if (ev.t === 'boom') this.effects.push({ k: 'boom', x: ev.x - 0.5, y: ev.y - 0.5, t: 0, life: 15 });
  }

  // ------------------------------------------------------------ main draw
  draw(alpha, ui) {
    const ctx = this.ctx, g = this.g; this.frame++;
    // animation runs on the clock, not the frame count, so it looks the same on 60 Hz and 144 Hz screens
    const now = performance.now(), dtf = Math.min(4, (now - (this.lastT ?? now)) / (1000 / 60)); this.lastT = now;
    if (this.frame % 6 === 0) this.computeVis();
    ctx.save();
    ctx.beginPath(); ctx.rect(VIEW.x, VIEW.y, VIEW.w, VIEW.h); ctx.clip();
    ctx.translate(VIEW.x - this.cam.x, VIEW.y - this.cam.y);
    // water first: the ground chunks are transparent over open water
    ctx.fillStyle = this.waterPat[Math.floor(now / 400) % WATER_FRAMES]; ctx.fillRect(this.cam.x, this.cam.y, VIEW.w, VIEW.h);
    const CP = CHUNK * TILE;
    const cx0 = Math.floor(this.cam.x / CP), cy0 = Math.floor(this.cam.y / CP), cx1 = Math.floor((this.cam.x + VIEW.w - 1) / CP), cy1 = Math.floor((this.cam.y + VIEW.h - 1) / CP);
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      if (cx * CHUNK >= g.w || cy * CHUNK >= g.h) continue;
      ctx.drawImage(this.drawChunk(cx, cy).cv, cx * CP, cy * CP);
    }
    // paint one chunk just outside the view per frame so scrolling stays smooth
    pre: for (let cy = cy0 - 1; cy <= cy1 + 1; cy++) for (let cx = cx0 - 1; cx <= cx1 + 1; cx++) {
      if (cx < 0 || cy < 0 || cx * CHUNK >= g.w || cy * CHUNK >= g.h || this.chunkReady(cx, cy)) continue;
      this.drawChunk(cx, cy); break pre;
    }
    const tx0 = Math.floor(this.cam.x / TILE), ty0 = Math.floor(this.cam.y / TILE), tx1 = Math.min(g.w - 1, tx0 + 15), ty1 = Math.min(g.h - 1, ty0 + 15);
    // ground effects
    for (const f of this.effects) {
      if (f.k === 'rubble') ctx.drawImage(S.rubbleSprite(f.size), f.x * TILE - 4, f.y * TILE - 4);
      else if (f.k === 'corpse' && this.visible[f.y * g.w + f.x]) ctx.drawImage(S.corpseSprite(f.type, f.faction, f.team, f.t > f.life * 0.5 ? 2 : 0), f.x * TILE - UO.x, f.y * TILE - UO.y);
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
    const posOf1 = (e) => {
      if (e.unit && e.mp <= 0) {
        // melee fighters lean in on whatever they are hitting, so blows visibly connect
        const o = e.order, t = o && UNITS[e.type].range === 1 && (e.cd > 0 || e.anim > 0) ? g.get(o.type === 'attack' ? o.target : o.sub) : null;
        if (t && g.distEnt(e, t) <= 1) {
          const dx = Math.sign(Math.max(t.x, Math.min(t.x + t.size - 1, e.x)) - e.x), dy = Math.sign(Math.max(t.y, Math.min(t.y + t.size - 1, e.y)) - e.y);
          const m = (e.anim > 6 ? 5 : e.anim > 2 ? 9 : 5) * (dx && dy ? 0.75 : 1) * (t.unit ? 1 : 0.6);
          return [e.x * TILE + dx * m, e.y * TILE + dy * m * 0.8];
        }
      }
      if (!e.unit || e.mp <= 0) return [e.x * TILE, e.y * TILE];
      const f = Math.max(0, Math.min(1, (e.mp - alpha) / e.mt));
      return [(e.x - (e.x - e.px) * f) * TILE, (e.y - (e.y - e.py) * f) * TILE];
    };
    // Units going into a mine or building walk in through the wall and fade, and fade back in on the way out,
    // rather than blinking out of existence. Purely cosmetic: tracked on the render side.
    const FADE = 240, posOf0 = posOf1;
    const inside = (e, b) => [Math.max(b.x, Math.min(b.x + b.size - 1, e.x)) * TILE, Math.max(b.y, Math.min(b.y + b.size - 1, e.y)) * TILE];
    for (const e of g.ents) {
      if (!e.unit || e.dead) continue;
      if (e.hidden && !e._in) { const b = g.get(e.inside); e._in = true; e._inT = now; e._from = e._px !== undefined ? [e._px, e._py] : null; e._door = b ? inside(e, b) : null; e._bld = b ? { x: b.x, y: b.y, size: b.size } : null; }
      else if (!e.hidden && e._in) { e._in = false; e._outT = now; e._door = e._bld ? inside(e, e._bld) : null; }
      if (e.hidden && e._from && e._door && now - e._inT < FADE && (this.ally(e.owner) || this.visible[e.y * g.w + e.x])) {
        const p = (now - e._inT) / FADE, x = e._from[0] + (e._door[0] - e._from[0]) * p, y = e._from[1] + (e._door[1] - e._from[1]) * p;
        const dx = e._door[0] - e._from[0], dy = e._door[1] - e._from[1], P = g.players[e.owner];
        if (dx || dy) e._dir = Math.round(Math.atan2(-dx, dy) / (Math.PI / 4) + 8) % 8;
        ctx.globalAlpha = 1 - p * p;
        ctx.drawImage(S.unitSprite(e.type, P.faction, P.color, 'walk' + (Math.floor(now / 100) & 3), e.carry ? e.carryKind : null, false, e._dir ?? 0), Math.round(x) - UO.x, Math.round(y) - UO.y);
        ctx.globalAlpha = 1;
      }
    }
    const fadeIn = (e) => (e._outT && e._door && now - e._outT < FADE ? (now - e._outT) / FADE : 1);
    const posOf = (e) => {
      const q = posOf0(e), p = e.unit ? fadeIn(e) : 1;
      return p < 1 ? [q[0] + (e._door[0] - e.x * TILE) * (1 - p), q[1] + (e._door[1] - e.y * TILE) * (1 - p)] : q;
    };
    // trees and rocks join the depth sort so units can walk behind them
    for (let y = Math.max(0, ty0 - 1); y <= Math.min(g.h - 1, ty1 + 2); y++) for (let x = Math.max(0, tx0 - 1); x <= Math.min(g.w - 1, tx1 + 1); x++) {
      const t = g.terrain[y * g.w + x];
      if (t === T_FOREST) list.push({ prop: this.trees[h2(x, y) % 6], x, y, size: 1, id: 0, ox: TREE.ox, oy: TREE.oy });
      else if (t === T_ROCK) list.push({ prop: this.rocks[h2(x, y) % 4], x, y, size: 1, id: 0, ox: ROCKV.ox, oy: ROCKV.oy });
    }
    list.sort((a, b) => (a.y + a.size) - (b.y + b.size) || a.id - b.id);
    for (const e of list) if (!e.prop && sel.has(e.id)) { const [px, py] = posOf(e); this.selBox(e, px, py); }
    for (const e of list) {
      if (e.prop) { ctx.drawImage(e.prop, e.x * TILE - e.ox, e.y * TILE - e.oy); continue; }
      const [px, py] = posOf(e); e._px = px; e._py = py;
      const P = g.players[e.owner], team = P ? P.color : 0, fac = P ? P.faction : 0;
      if (e.unit) {
        let frame = 'idle';
        const chopping = e.order && e.order.type === 'gather' && e.order.phase === 'chop';
        if (chopping) { const ph = (g.tick + e.id * 3) % 14; frame = ph < 5 ? 'atk0' : ph < 9 ? 'atk1' : 'atk2'; }
        else if (e.anim > 0) frame = e.type === 'siege' ? (e.anim > 7 ? 'atk0' : 'atk1') : e.anim > 6 ? 'atk0' : e.anim > 3 ? 'atk1' : 'atk2';
        else if (e.mp > 0 || (e.path && e.order)) frame = 'walk' + (((g.tick >> 1) + e.id) & 3);
        const sp = S.unitSprite(e.type, fac, team, frame, e.carry ? e.carryKind : null, chopping, this.dirOf(e));
        const a = fadeIn(e); if (a < 1) ctx.globalAlpha = 0.25 + 0.75 * a;
        ctx.drawImage(sp, Math.round(px) - UO.x, Math.round(py) - UO.y);
        ctx.globalAlpha = 1;
      } else {
        const d = BUILDINGS[e.type];
        const stage = e.built ? 2 : (e.progress / d.time < 0.4 ? 0 : 1);
        ctx.drawImage(S.buildingSprite(e.type, fac, team, stage), px - BO.x, py - BO.y);
        if (e.built && e.type !== 'mine' && e.hp < e.maxHp / 2) {
          const big = e.hp < e.maxHp / 4, fr = (Math.floor(now / 66) + e.id) % S.FIRE_FRAMES, s = e.size * TILE;
          const flame = (f, isBig, x, y) => { const sp = S.fireSprite(f % S.FIRE_FRAMES, isBig); ctx.drawImage(sp, Math.round(x) - sp.ax, Math.round(y) - sp.ay); };
          // back to front so nearer flames overlap the ones behind
          if (big) flame(fr + 5, false, px + s * 0.72 + 8, py + s * 0.3);
          flame(fr, big, px + s * 0.5, py + s * 0.45);
          if (big) flame(fr + 3, false, px + s * 0.2 + 8, py + s * 0.7);
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
    for (const f of this.effects) if (f.k === 'boom' && f.t >= 0) ctx.drawImage(S.boomSprite(Math.min(4, Math.floor(f.t / 3))), f.x * TILE - 8, f.y * TILE - 8);
    // health bars for selected
    for (const e of list) if (!e.prop && sel.has(e.id) && e.type !== 'mine') this.hpBar(e, e._px, e._py);
    // rally point
    if (ui.selection.length === 1) { const b = g.get(ui.selection[0]); if (b && !b.unit && b.rally && b.owner === this.me) this.rallyFlag(b.rally.x * TILE, b.rally.y * TILE); }
    // building ghost
    if (ui.mode === 'place' && ui.mouse.inView) this.ghost(ui);
    // fog of war: hard black over the unknown, with soft edges bleeding into known ground
    if (!this.revealAll && this.me >= 0) {
      const fw = 18, fc = this.fogCv.getContext('2d'), id = fc.createImageData(fw, fw), fx0 = tx0 - 1, fy0 = ty0 - 1;
      ctx.fillStyle = '#000';
      for (let y = 0; y < fw; y++) for (let x = 0; x < fw; x++) {
        const X = fx0 + x, Y = fy0 + y, inb = X >= 0 && Y >= 0 && X < g.w && Y < g.h, i = Y * g.w + X;
        const a = !inb ? 255 : !this.explored[i] ? 255 : !this.visible[i] ? 105 : 0;
        id.data[(y * fw + x) * 4 + 3] = a;
        if (inb && !this.explored[i]) { // solid black only where no known ground is adjacent, so the edge stays soft
          let near = false; for (let oy = -1; oy <= 1 && !near; oy++) for (let ox = -1; ox <= 1; ox++) { const xx = X + ox, yy = Y + oy; if (xx >= 0 && yy >= 0 && xx < g.w && yy < g.h && this.explored[yy * g.w + xx]) { near = true; break; } }
          if (!near) ctx.fillRect(X * TILE, Y * TILE, TILE, TILE);
        }
      }
      fc.putImageData(id, 0, 0);
      ctx.imageSmoothingEnabled = true; ctx.drawImage(this.fogCv, fx0 * TILE, fy0 * TILE, fw * TILE, fw * TILE); ctx.imageSmoothingEnabled = false;
    }
    // effects aging
    for (const f of this.effects) f.t += dtf;
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
    this.flushText();
  }

  // 8-way facing, tracked on the render side only (0 = towards the viewer, clockwise)
  dirOf(e) {
    const g = this.g; let dx = 0, dy = 0;
    if (e.mp > 0) { dx = e.x - e.px; dy = e.y - e.py; }
    else {
      const o = e.order; let t = null;
      if (o && (o.type === 'attack' || o.type === 'repair') && o.target && (e.anim > 0 || !e.path)) t = g.get(o.target);
      if (t) { dx = t.x + (t.size - 1) / 2 - e.x; dy = t.y + (t.size - 1) / 2 - e.y; }
      else if (o && o.type === 'gather' && o.phase === 'chop') { dx = o.tx - e.x; dy = o.ty - e.y; }
    }
    if (dx || dy) e._dir = Math.round(Math.atan2(-dx, dy) / (Math.PI / 4) + 8) % 8;
    else if (e._dir === undefined) e._dir = e.facing < 0 ? 1 : 7;
    return e._dir;
  }
  selBox(e, px, py) {
    const ctx = this.ctx; const col = e.owner === this.me ? '#30ff30' : e.owner < 0 ? '#ffe838' : this.ally(e.owner) ? '#38d0ff' : '#ff3030';
    const s = e.size * TILE, x = Math.round(px), y = Math.round(py);
    if (e.unit) { // ring on the ground under the unit
      ctx.strokeStyle = '#000'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(x + 16, y + 25, 13, 7, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(x + 16, y + 25, 13, 7, 0, 0, Math.PI * 2); ctx.stroke();
      return;
    }
    const L = Math.min(12, s / 3); ctx.fillStyle = '#000';
    const corner = (cx, cy, sx, sy, c2, o) => { ctx.fillStyle = c2; ctx.fillRect(sx > 0 ? cx - o : cx - L + 1, cy - o * sy, L + o, 1 + o * 2); ctx.fillRect(cx - o * sx, sy > 0 ? cy - o : cy - L + 1, 1 + o * 2, L + o); };
    for (const [c2, o] of [['#000', 1], [col, 0]]) { corner(x, y, 1, 1, c2, o); corner(x + s - 1, y, -1, 1, c2, o); corner(x, y + s - 1, 1, -1, c2, o); corner(x + s - 1, y + s - 1, -1, -1, c2, o); }
  }
  hpBar(e, px, py) {
    const ctx = this.ctx, s = e.size * TILE, w = e.unit ? 24 : s - 8, f = Math.max(0, e.hp / e.maxHp), x = Math.round(px) + (s - w) / 2, y = Math.round(py) + (e.unit ? -8 : s + 2);
    ctx.fillStyle = '#000'; ctx.fillRect(x - 1, y - 1, w + 2, 5);
    ctx.fillStyle = '#3a1410'; ctx.fillRect(x, y, w, 3);
    const hi = f > 0.5 ? '#58e838' : f > 0.25 ? '#f0d820' : '#f03820', lo = f > 0.5 ? '#1c8a18' : f > 0.25 ? '#a07808' : '#981008';
    const fw = Math.max(1, Math.round(w * f)); ctx.fillStyle = lo; ctx.fillRect(x, y, fw, 3); ctx.fillStyle = hi; ctx.fillRect(x, y, fw, 1);
  }
  rallyFlag(x, y) {
    const ctx = this.ctx; ctx.save(); ctx.translate(VIEW.x - this.cam.x, VIEW.y - this.cam.y);
    ctx.fillStyle = '#000'; ctx.fillRect(x + 13, y + 3, 4, 26); ctx.fillRect(x + 16, y + 3, 12, 9); ctx.fillStyle = '#b98538'; ctx.fillRect(x + 14, y + 4, 2, 24); ctx.fillStyle = '#4a2812'; ctx.fillRect(x + 15, y + 4, 1, 24); ctx.fillStyle = teamCSS(this.g.players[this.me].color); ctx.fillRect(x + 16, y + 4, 11, 7); ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(x + 16, y + 8, 11, 3);
    ctx.restore();
  }
  ghost(ui) {
    const ctx = this.ctx, g = this.g, d = BUILDINGS[ui.buildType], s = d.size;
    const [tx, ty] = ui.placeAt;
    const P = g.players[this.me];
    ctx.globalAlpha = 0.6; ctx.drawImage(S.buildingSprite(ui.buildType, P.faction, P.color, 2), tx * TILE - BO.x, ty * TILE - BO.y); ctx.globalAlpha = 1;
    for (let y = ty; y < ty + s; y++) for (let x = tx; x < tx + s; x++) {
      let ok = g.passable(x, y) && this.explored[y * g.w + x];
      const o = g.inMap(x, y) ? g.uocc[y * g.w + x] : 0; if (o && !ui.selection.includes(o)) ok = false;
      ctx.fillStyle = ok ? 'rgba(40,220,40,0.35)' : 'rgba(230,30,30,0.45)'; ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
    }
    if (ui.buildType === 'hall' && !g.canPlace('hall', tx, ty, -1)) { ctx.fillStyle = 'rgba(230,30,30,0.3)'; ctx.fillRect(tx * TILE, ty * TILE, s * TILE, s * TILE); }
  }

  // ------------------------------------------------------------ HUD
  text(s, x, y, col = '#f0d878', size = 10, align = 'left', bold = true, serif = false) {
    if (s !== '' && s != null) this.texts.push({ s: String(s), x, y, col, size, align, bold, serif });
  }
  // Text is drawn last, at the display's real resolution on the overlay canvas, so it stays sharp
  // however far the 640x480 picture is scaled up. Without an overlay it falls back to the game canvas.
  flushText() {
    const ov = Renderer.overlay, ctx = ov ? ov.getContext('2d') : this.ctx, k = ov ? ov.width / 640 : 1;
    if (ov) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, ov.width, ov.height); }
    ctx.textBaseline = 'top'; ctx.lineJoin = 'round';
    for (const t of this.texts) {
      ctx.font = `${t.bold ? 'bold ' : ''}${t.size * k}px ${t.serif ? 'Georgia, "Times New Roman", serif' : '"Trebuchet MS", Verdana, sans-serif'}`; ctx.textAlign = t.align;
      const x = Math.round(t.x * k), y = Math.round(t.y * k);
      ctx.fillStyle = 'rgba(0,0,0,.85)'; ctx.fillText(t.s, x + k, y + k);
      ctx.strokeStyle = '#000'; ctx.lineWidth = Math.max(2, 2 * k); ctx.strokeText(t.s, x, y);
      ctx.fillStyle = t.col; ctx.fillText(t.s, x, y);
    }
    this.texts.length = 0;
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
      const col = MINI_COL;
      for (let i = 0; i < g.w * g.h; i++) { const q = col[g.terrain[i]], k = 0.88 + (h2(i % g.w, (i / g.w) | 0) % 100) / 400; id.data[i * 4] = q[0] * k; id.data[i * 4 + 1] = q[1] * k; id.data[i * 4 + 2] = q[2] * k; id.data[i * 4 + 3] = 255; }
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
    S.frame(ctx, MINI.x, MINI.y, MINI.s, MINI.s, 'gold');
  }

  // static interface art, composed once
  hudBack() {
    if (this._hud) return this._hud;
    const cv = document.createElement('canvas'); cv.width = 640; cv.height = 480; const x = cv.getContext('2d');
    x.drawImage(this.panel, 0, 0); x.drawImage(this.topbar, 176, 0); x.drawImage(this.topbar, 176, 464);
    // panel edge trim along the viewport
    x.fillStyle = '#000'; x.fillRect(175, 0, 1, 480); x.fillStyle = rgb(c('gold', 2)); x.fillRect(172, 0, 3, 480); x.fillStyle = rgb(c('gold', 5)); x.fillRect(172, 0, 1, 480); x.fillStyle = rgb(c('gold', 1)); x.fillRect(174, 0, 1, 480);
    x.fillStyle = 'rgba(0,0,0,.45)'; x.fillRect(0, 0, 172, 2); x.fillRect(0, 478, 172, 2); x.fillRect(0, 0, 2, 480);
    for (let y = 30; y < 480; y += 60) { x.fillStyle = '#000'; x.fillRect(171, y - 1, 5, 5); x.fillStyle = rgb(c('gold', 6)); x.fillRect(172, y, 3, 3); x.fillStyle = rgb(c('gold', 2)); x.fillRect(173, y + 1, 2, 2); }
    // sunken wells for the info box and command buttons
    const well = (wx, wy, w, h) => { x.fillStyle = 'rgba(8,6,10,.72)'; x.fillRect(wx, wy, w, h); };
    well(8, 150, 160, 112); S.frame(x, 8, 150, 160, 112, 'steel');
    for (let i = 0; i < 9; i++) { const bx = 8 + (i % 3) * 54, by = 272 + ((i / 3) | 0) * 46; well(bx, by, 50, 42); S.frame(x, bx + 2, by + 2, 46, 38, 'ui'); }
    // menu button
    const g = x.createLinearGradient(0, 440, 0, 458); g.addColorStop(0, rgb(c('ui', 6))); g.addColorStop(1, rgb(c('ui', 2))); x.fillStyle = g; x.fillRect(8, 440, 160, 18); S.frame(x, 8, 440, 160, 18, 'gold');
    // viewport frame shadow
    x.clearRect(VIEW.x, VIEW.y, VIEW.w, VIEW.h);
    return (this._hud = cv);
  }

  drawHUD(ui) {
    const ctx = this.ctx, g = this.g, P = g.players[this.me];
    ctx.drawImage(this.hudBack(), 0, 0);
    // resources
    if (P) {
      const gx = 300;
      ctx.drawImage(S.resIcon('gold'), gx - 6, 1); this.text(String(P.gold), gx + 14, 2);
      ctx.drawImage(S.resIcon('wood'), gx + 84, 1); this.text(String(P.wood), gx + 104, 2);
      ctx.drawImage(S.resIcon('food'), gx + 174, 1); this.text(`${P.food}/${P.foodCap}`, gx + 194, 2, P.food >= P.foodCap ? '#ff7060' : '#f0d878');
    }
    this.text(ui.netStatus || '', 186, 2, '#c8c0a8', 9, 'left', false);
    this.drawMinimap(ui);
    // info box
    const ib = { x: 8, y: 150, w: 160, h: 112 };
    const sel = ui.selection.map(id => g.get(id)).filter(Boolean);
    if (sel.length === 1) this.infoSingle(sel[0], ib);
    else if (sel.length > 1) {
      sel.forEach((e, i) => {
        const x = ib.x + 5 + (i % 3) * 52, y = ib.y + 5 + ((i / 3) | 0) * 36;
        const PP = g.players[e.owner];
        ctx.drawImage(S.entIcon(e.type, PP.faction, PP.color, e.unit), 0, 4, 46, 30, x, y, 46, 30);
        ctx.fillStyle = '#000'; ctx.fillRect(x, y + 30, 46, 3); const f = e.hp / e.maxHp; ctx.fillStyle = f > 0.5 ? '#3c3' : f > 0.25 ? '#dd2' : '#d22'; ctx.fillRect(x, y + 31, 46 * f, 1);
        this.bevel(x - 1, y - 1, 48, 35, false);
      });
    }
    // buttons
    ui.buttons = this.buttonsFor(sel, ui);
    ui.buttons.forEach((b, i) => {
      const x = 8 + (i % 3) * 54, y = 272 + ((i / 3) | 0) * 46; b.rect = [x, y, 50, 42];
      if (!b.icon) return;
      const down = ui.hoverBtn === b.id && ui.mouseDown ? 1 : 0;
      ctx.drawImage(b.icon, x + 2 + down, y + 2 + down);
      if (b.disabled) { ctx.fillStyle = 'rgba(0,0,0,0.62)'; ctx.fillRect(x + 2, y + 2, 46, 38); }
      S.frame(ctx, x + 2, y + 2, 46, 38, ui.hoverBtn === b.id && !b.disabled ? 'gold' : 'steel');
      if (b.hot) this.text(b.hot === 'Escape' ? 'Esc' : b.hot.toUpperCase(), x + 46, y + 28, '#fff', 9, 'right');
    });
    this.text('Menu (F10)', 88, 443, '#f0d878', 10, 'center');
    if (ui.paused && !ui.banner) { this.text('PAUSED', VIEW.x + VIEW.w / 2, VIEW.y + 190, '#f0d878', 22, 'center', true, true); this.text('Press P to resume', VIEW.x + VIEW.w / 2, VIEW.y + 220, '#e0e0e0', 10, 'center', false); }
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
      const bx = VIEW.x + 40, by = VIEW.y + 170, bw = VIEW.w - 80;
      ctx.drawImage(this.panel, 0, 0, Math.min(176, bw), 60, bx, by, bw, 60); ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(bx, by, bw, 60); S.frame(ctx, bx, by, bw, 60, 'gold');
      this.text(ui.banner, VIEW.x + VIEW.w / 2, VIEW.y + 182, '#f0d878', 20, 'center', true, true);
      if (ui.subBanner) this.text(ui.subBanner, VIEW.x + VIEW.w / 2, VIEW.y + 210, '#e0e0e0', 10, 'center', false);
    }
  }

  infoSingle(e, ib) {
    const g = this.g, ctx = this.ctx, P = g.players[e.owner], fac = P ? P.faction : 0;
    ctx.drawImage(S.entIcon(e.type, fac, P ? P.color : 0, e.unit), ib.x + 6, ib.y + 6); S.frame(ctx, ib.x + 6, ib.y + 6, 46, 38, 'gold');
    this.text(nameOf(e.type, fac), ib.x + 60, ib.y + 6, '#f0d878', 12, 'left', true, true);
    if (P) this.text(P.name, ib.x + 60, ib.y + 21, teamCSS(P.color), 9, 'left', false);
    const d = def(e.type);
    if (e.type === 'mine') { this.text('Gold left: ' + e.gold, ib.x + 8, ib.y + 50, '#f0d878', 10); return; }
    ctx.fillStyle = '#000'; ctx.fillRect(ib.x + 59, ib.y + 44, 96, 5); const f = e.hp / e.maxHp; ctx.fillStyle = f > 0.5 ? '#1c8a18' : f > 0.25 ? '#a07808' : '#981008'; ctx.fillRect(ib.x + 60, ib.y + 45, 94 * f, 3); ctx.fillStyle = f > 0.5 ? '#58e838' : f > 0.25 ? '#f0d820' : '#f03820'; ctx.fillRect(ib.x + 60, ib.y + 45, 94 * f, 1);
    this.text(`${Math.max(0, e.hp)}/${e.maxHp}`, ib.x + 60, ib.y + 32, '#e0e0e0', 9, 'left', false);
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
      e.train.forEach((t, i) => { ctx.imageSmoothingEnabled = true; ctx.drawImage(S.entIcon(t.type, fac, P.color, true), 0, 0, 46, 38, ib.x + 8 + i * 30, ib.y + 82, 28, 23); ctx.imageSmoothingEnabled = false; this.bevel(ib.x + 8 + i * 30, ib.y + 82, 28, 23, false); });
    } else {
      line(`Armor: ${d.armor}`);
      if (d.food) line(`Provides food: ${d.food}`);
      if (d.attack) line(`Damage: ${d.attack.dmg + d.attack.pierce}  Range: ${d.attack.range}`);
      if (d.depot) line('Accepts: ' + d.depot.map(k => k === 'gold' ? 'gold' : 'lumber').join(', '));
      if (e.type === 'hall' && P) { line(`Gold mined: ${P.goldMined}`); line(`Lumber cut: ${P.woodCut}`); }
    }
  }
  progress(x, y, f) { const ctx = this.ctx; ctx.fillStyle = '#000'; ctx.fillRect(x, y, 144, 8); const w = 142 * Math.min(1, f); ctx.fillStyle = '#1c7a1c'; ctx.fillRect(x + 1, y + 1, w, 6); ctx.fillStyle = '#58d848'; ctx.fillRect(x + 1, y + 1, w, 2); this.bevel(x, y, 144, 8, true); }

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
        B.push({ id: 'repair', icon: S.cmdIcon('repair', team), label: 'Repair a building (or right-click it)', hot: 'e', act: { k: 'target', t: 'repair' } });
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
