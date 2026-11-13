// Deterministic lockstep simulation. Integer math only (no trig, no Math.random).
import { REPAIR_TICKS, REPAIR_HP, REPAIR_GOLD, REPAIR_WOOD, UNITS, BUILDINGS, def, START_GOLD, START_WOOD, MINE_GOLD, CARRY, MINE_TIME, CHOP_TIME, QUEUE_MAX, MAX_SELECT, TPS } from './data.js';
import { generateMap, rng, T_GRASS, T_FOREST, T_WATER, T_ROCK, T_DIRT, T_STUMP } from './map.js';
import { aiTick, aiInit } from './ai.js';

const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0], [1, -1], [1, 1], [-1, 1], [-1, -1]];

export class Game {
  constructor(opts) {
    // opts: {seed, size, players:[{name, faction, color, ai}]}
    this.opts = opts;
    this.seed = opts.seed;
    const map = generateMap(opts.seed, opts.players.length, opts.size);
    this.w = map.w; this.h = map.h;
    this.terrain = map.terrain;
    this.uocc = new Int32Array(this.w * this.h);
    this.bocc = new Int32Array(this.w * this.h);
    this.ents = []; this.byId = new Map(); this.nextId = 1;
    this.tick = 0; this.rng = rng(opts.seed ^ 0x5bd1e995);
    this.events = []; this.missiles = [];
    this.terrainVersion = 0;
    this.players = opts.players.map((p, i) => ({
      id: i, name: p.name, faction: p.faction, color: p.color, ai: !!p.ai, gold: START_GOLD, wood: START_WOOD,
      food: 0, foodCap: 0, defeated: false, has: {}, team: p.team ?? i, level: p.level === 0 || p.level === 2 ? p.level : 1, kills: 0, lost: 0, goldMined: 0, woodCut: 0,
    }));
    // pathfinding scratch
    const N = this.w * this.h;
    this.pf = { g: new Int32Array(N), came: new Int32Array(N), stamp: new Uint32Array(N), closed: new Uint32Array(N), gen: 0, heap: new Int32Array(N * 8), hf: new Int32Array(N * 8) };
    for (const m of map.mines) { const e = this.spawn('mine', -1, m.x, m.y); e.gold = MINE_GOLD; e.built = true; }
    map.starts.forEach((s, i) => {
      const hall = this.spawn('hall', i, s.x, s.y); hall.built = true; hall.hp = hall.maxHp;
      for (let k = 0; k < 3; k++) { const t = this.freeTileNear(hall, s.x + 2, s.y + 5); if (t) this.spawn('worker', i, t[0], t[1]); }
    });
    this.starts = map.starts;
    this.winner = -1; this.over = false;
    this.updatePlayers();
    for (const p of this.players) if (p.ai) aiInit(this, p);
  }

  idx(x, y) { return y * this.w + x; }
  inMap(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  walkableTerrain(x, y) { const t = this.terrain[y * this.w + x]; return t === T_GRASS || t === T_DIRT || t === T_STUMP; }
  passable(x, y) { return this.inMap(x, y) && this.walkableTerrain(x, y) && !this.bocc[y * this.w + x]; }
  free(x, y) { return this.passable(x, y) && !this.uocc[y * this.w + x]; }
  isTree(x, y) { return this.inMap(x, y) && this.terrain[y * this.w + x] === T_FOREST; }
  get(id) { const e = this.byId.get(id); return e && !e.dead ? e : null; }

  spawn(type, owner, x, y) {
    const d = def(type), unit = !!UNITS[type];
    const e = {
      id: this.nextId++, type, owner, x, y, px: x, py: y, unit, size: unit ? 1 : d.size, hp: d.hp, maxHp: d.hp,
      order: null, path: null, pi: 0, mp: 0, mt: 1, facing: 1, cd: 0, anim: 0, wait: 0, carry: 0, carryKind: null,
      hidden: false, dead: false, built: unit, progress: 0, dmgTaken: 0, train: [], rally: null, scanT: 0, lastHit: 0,
    };
    this.ents.push(e); this.byId.set(e.id, e);
    if (unit) this.uocc[this.idx(x, y)] = e.id;
    else for (let yy = 0; yy < e.size; yy++) for (let xx = 0; xx < e.size; xx++) this.bocc[this.idx(x + xx, y + yy)] = e.id;
    return e;
  }

  emit(ev) { this.events.push(ev); }

  // ---------------------------------------------------------------- geometry
  distRect(x, y, rx, ry, rs) { // chebyshev distance from tile to square rect
    const dx = x < rx ? rx - x : x > rx + rs - 1 ? x - (rx + rs - 1) : 0;
    const dy = y < ry ? ry - y : y > ry + rs - 1 ? y - (ry + rs - 1) : 0;
    return dx > dy ? dx : dy;
  }
  distEnt(a, b) { // between entity a (any) and b (any)
    if (a.size === 1) return this.distRect(a.x, a.y, b.x, b.y, b.size);
    if (b.size === 1) return this.distRect(b.x, b.y, a.x, a.y, a.size);
    const dx = Math.max(0, a.x - (b.x + b.size - 1), b.x - (a.x + a.size - 1));
    const dy = Math.max(0, a.y - (b.y + b.size - 1), b.y - (a.y + a.size - 1));
    return Math.max(dx, dy);
  }
  enemies(a, b) { return a !== b && a >= 0 && b >= 0 && this.players[a].team !== this.players[b].team; }

  freeTileNear(rectEnt, prefX, prefY, maxR = 12) {
    const rx = rectEnt ? rectEnt.x : prefX, ry = rectEnt ? rectEnt.y : prefY, rs = rectEnt ? rectEnt.size : 1;
    for (let r = rectEnt ? 1 : 0; r <= maxR; r++) {
      let best = null, bd = 1e9;
      for (let y = ry - r; y <= ry + rs - 1 + r; y++) for (let x = rx - r; x <= rx + rs - 1 + r; x++) {
        if (this.distRect(x, y, rx, ry, rs) !== r) continue;
        if (!this.free(x, y)) continue;
        const d = (x - prefX) * (x - prefX) + (y - prefY) * (y - prefY);
        if (d < bd) { bd = d; best = [x, y]; }
      }
      if (best) return best;
    }
    return null;
  }

  // ---------------------------------------------------------------- pathfinding (A*, 8-dir)
  findPath(sx, sy, gx, gy, gs, range, avoidUnits, selfId) {
    const W = this.w, H = this.h, pf = this.pf;
    pf.gen++; const gen = pf.gen;
    const heap = pf.heap, hf = pf.hf; let hn = 0;
    const hcost = (x, y) => { const d = this.distRect(x, y, gx, gy, gs) - range; return d > 0 ? d * 10 : 0; };
    const push = (node, f) => { let i = hn++; while (i > 0) { const p = (i - 1) >> 1; if (hf[p] <= f) break; heap[i] = heap[p]; hf[i] = hf[p]; i = p; } heap[i] = node; hf[i] = f; };
    const pop = () => {
      const top = heap[0]; const ln = heap[--hn], lf = hf[hn]; let i = 0;
      while (true) { let l = i * 2 + 1; if (l >= hn) break; if (l + 1 < hn && hf[l + 1] < hf[l]) l++; if (hf[l] >= lf) break; heap[i] = heap[l]; hf[i] = hf[l]; i = l; }
      heap[i] = ln; hf[i] = lf; return top;
    };
    const s = sy * W + sx;
    pf.g[s] = 0; pf.stamp[s] = gen; pf.came[s] = -1; push(s, hcost(sx, sy));
    let best = s, bestH = hcost(sx, sy), expanded = 0;
    const limit = 6000;
    while (hn > 0) {
      const cur = pop();
      if (pf.closed[cur] === gen) continue;
      pf.closed[cur] = gen;
      const cx = cur % W, cy = (cur / W) | 0;
      const h = hcost(cx, cy);
      if (h === 0) { best = cur; bestH = 0; break; }
      if (h < bestH || (h === bestH && pf.g[cur] < pf.g[best])) { bestH = h; best = cur; }
      if (++expanded > limit) break;
      for (let d = 0; d < 8; d++) {
        const nx = cx + DIRS[d][0], ny = cy + DIRS[d][1];
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const ni = ny * W + nx;
        if (pf.closed[ni] === gen) continue;
        if (!this.walkableTerrain(nx, ny) || this.bocc[ni]) continue;
        if (avoidUnits && this.uocc[ni] && this.uocc[ni] !== selfId && this.distRect(nx, ny, sx, sy, 1) <= 7) { const ob = this.byId.get(this.uocc[ni]); if (ob && ob.mp === 0 && !ob.path) continue; } // route around units that are standing still
        if (d >= 4) { // no corner cutting
          if (!this.passable(cx + DIRS[d][0], cy) || !this.passable(cx, cy + DIRS[d][1])) continue;
        }
        const ng = pf.g[cur] + (d >= 4 ? 14 : 10);
        if (pf.stamp[ni] === gen && pf.g[ni] <= ng) continue;
        pf.stamp[ni] = gen; pf.g[ni] = ng; pf.came[ni] = cur;
        push(ni, ng + hcost(nx, ny));
      }
    }
    if (best === s) return [];
    const path = [];
    for (let n = best; n !== s; n = pf.came[n]) path.push(n);
    path.reverse();
    return path;
  }

  // Move unit toward square rect within range. Returns 'arrived' | 'moving' | 'stuck'
  // strict: only being truly in range counts (fighting, building); otherwise a crowded destination is 'close enough'
  moveToward(u, gx, gy, gs, range, strict) {
    if (this.distRect(u.x, u.y, gx, gy, gs) <= range) { u.path = null; return 'arrived'; }
    if (u.mp > 0) return 'moving';
    const goalKey = gx * 100003 + gy * 31 + gs * 7 + range;
    if (!u.path || u.goalKey !== goalKey || u.pi >= u.path.length) {
      u.path = this.findPath(u.x, u.y, gx, gy, gs, range, u.wait >= 2, u.id); u.pi = 0; u.goalKey = goalKey;
      if (u.path.length === 0) { u.stuck = (u.stuck || 0) + 1; return u.stuck > 3 ? 'stuck' : 'moving'; }
    }
    const n = u.path[u.pi], nx = n % this.w, ny = (n / this.w) | 0;
    if (!this.passable(nx, ny)) { u.path = null; return 'moving'; }
    const occ = this.uocc[n];
    if (occ && occ !== u.id) {
      u.wait++;
      const other = this.get(occ);
      if (other && other.mp === 0 && !this.enemies(u.owner, other.owner)) {
        // two friends walking into each other simply trade places
        if (other.path && other.pi < other.path.length && other.path[other.pi] === this.idx(u.x, u.y)) { this.stepTo(other, u.x, u.y); other.pi++; other.wait = 0; this.stepTo(u, nx, ny); u.pi++; u.wait = 0; u.stuck = 0; return 'moving'; }
        // an idle friend in the way steps aside
        if (!other.order && other.owner === u.owner && u.wait === 1) this.nudge(other, u);
      }
      const still = other && other.mp === 0 && !other.path;
      // close to goal and blocked by a stationary unit: good enough
      if (!strict && still && this.distRect(u.x, u.y, gx, gy, gs) <= range + 2 && u.wait > 3) { u.path = null; u.wait = 0; return 'arrived'; }
      // look for a way round: at once if the blocker is standing still, after a moment if it is on the move
      if (still ? (u.wait === 2 || u.wait % 10 === 0) : (u.wait === 6 || u.wait % 12 === 0)) u.path = null;
      if (u.wait > 45) { u.wait = 0; u.path = null; return 'stuck'; }
      return 'moving';
    }
    // step
    this.uocc[this.idx(u.x, u.y)] = 0;
    this.stepTo(u, nx, ny);
    u.pi++; u.wait = 0; u.stuck = 0;
    return 'moving';
  }
  stepTo(u, nx, ny) {
    const dx = nx - u.x, dy = ny - u.y;
    this.uocc[this.idx(nx, ny)] = u.id;
    u.px = u.x; u.py = u.y; u.x = nx; u.y = ny;
    const sp = UNITS[u.type].speed;
    u.mt = u.mp = (dx && dy) ? ((sp * 14 / 10) | 0) : sp;
    if (dx) u.facing = dx;
    u.dir = dy < 0 ? 0 : dy > 0 ? 2 : 1;
  }
  // ask an idle unit to move off its tile, away from whoever wants through
  nudge(o, from) {
    let best = null, bd = -1;
    for (const [dx, dy] of DIRS) {
      const x = o.x + dx, y = o.y + dy; if (!this.free(x, y)) continue;
      if (dx && dy && (!this.passable(o.x + dx, o.y) || !this.passable(o.x, o.y + dy))) continue;
      const d = (x - from.x) * (x - from.x) + (y - from.y) * (y - from.y); if (d > bd) { bd = d; best = [x, y]; }
    }
    if (best) this.setOrder(o, { type: 'move', x: best[0], y: best[1] });
  }

  // ---------------------------------------------------------------- commands
  // cmd: {p, t, ids, x, y, target, btype, utype, q}
  exec(cmd) {
    if (!cmd || typeof cmd !== 'object') return;
    const P = this.players[cmd.p]; if (!P || P.defeated) return;
    // commands arrive from other peers: never trust their shape
    if ('x' in cmd || 'y' in cmd) {
      if (!Number.isFinite(cmd.x) || !Number.isFinite(cmd.y)) return;
      cmd.x = Math.max(0, Math.min(this.w - 1, Math.floor(cmd.x))); cmd.y = Math.max(0, Math.min(this.h - 1, Math.floor(cmd.y)));
    }
    const own = (Array.isArray(cmd.ids) ? cmd.ids : []).slice(0, 64).map(id => this.get(id)).filter(e => e && e.owner === cmd.p);
    switch (cmd.t) {
      case 'move': case 'amove': {
        if (cmd.x === undefined) break;
        const units = own.filter(e => e.unit);
        const spots = this.formation(cmd.x, cmd.y, units.length);
        units.forEach((u, i) => { const s = spots[i] || [cmd.x, cmd.y]; this.setOrder(u, { type: cmd.t, x: s[0], y: s[1] }); });
        break;
      }
      case 'attack': {
        const t = this.get(cmd.target); if (!t) break;
        for (const u of own) if (u.unit && this.canAttack(u)) this.setOrder(u, { type: 'attack', target: t.id });
        break;
      }
      case 'smart': if (cmd.x !== undefined) this.smart(cmd.p, own, cmd); break;
      case 'stop': for (const u of own) if (u.unit) this.setOrder(u, null); break;
      case 'hold': for (const u of own) if (u.unit) this.setOrder(u, { type: 'hold' }); break;
      case 'gather': {
        for (const u of own) if (u.unit && UNITS[u.type].worker) this.orderGather(u, cmd.target, cmd.x, cmd.y);
        break;
      }
      case 'repair': {
        const t = this.get(cmd.target); if (!this.canRepair(cmd.p, t)) break;
        for (const u of own) if (u.unit && UNITS[u.type].worker) this.setOrder(u, { type: 'repair', target: t.id });
        break;
      }
      case 'ret': for (const u of own) if (u.unit && u.carry) this.setOrder(u, { type: 'gather', kind: u.carryKind, phase: 'ret', mine: u.lastMine, tx: u.lastTx, ty: u.lastTy }); break;
      case 'build': {
        const u = own.find(e => e.unit && UNITS[e.type].worker); if (!u) break;
        const b = Object.hasOwn(BUILDINGS, cmd.btype) ? BUILDINGS[cmd.btype] : null; if (!b || b.neutral || cmd.x === undefined) break;
        if (b.req && !P.has[b.req]) { this.emit({ t: 'msg', p: cmd.p, text: 'Requires ' + b.names[P.faction].toLowerCase(), code: 'requires' }); break; }
        if (P.gold < b.gold || P.wood < b.wood) { this.emit({ t: 'msg', p: cmd.p, text: P.gold < b.gold ? 'Not enough gold' : 'Not enough lumber', code: P.gold < b.gold ? 'gold' : 'wood' }); break; }
        this.setOrder(u, { type: 'build', btype: cmd.btype, x: cmd.x, y: cmd.y, tries: 0 });
        break;
      }
      case 'train': {
        const b = own.find(e => !e.unit && e.built && BUILDINGS[e.type].trains && BUILDINGS[e.type].trains.includes(cmd.utype) && e.train.length < QUEUE_MAX && !e.upg);
        if (!b) break;
        const d = UNITS[cmd.utype];
        if (d.req && !P.has[d.req]) { this.emit({ t: 'msg', p: cmd.p, text: 'Requires ' + BUILDINGS[d.req].names[P.faction].toLowerCase(), code: 'requires' }); break; }
        if (P.gold < d.gold) { this.emit({ t: 'msg', p: cmd.p, text: 'Not enough gold', code: 'gold' }); break; }
        if (P.wood < d.wood) { this.emit({ t: 'msg', p: cmd.p, text: 'Not enough lumber', code: 'wood' }); break; }
        if (P.food + this.queued(cmd.p) + d.food > P.foodCap) { this.emit({ t: 'msg', p: cmd.p, text: 'Not enough food. Build more farms.', code: 'food' }); break; }
        P.gold -= d.gold; P.wood -= d.wood;
        b.train.push({ type: cmd.utype, t: 0 });
        break;
      }
      case 'cancel': {
        const b = own.find(e => !e.unit); if (!b) break;
        if (!b.built) { const d = BUILDINGS[b.type]; P.gold += (d.gold * 3 / 4) | 0; P.wood += (d.wood * 3 / 4) | 0; this.kill(b, -1, true); break; }
        const it = b.train.pop(); if (it) { const d = UNITS[it.type]; P.gold += d.gold; P.wood += d.wood; }
        break;
      }
      case 'resign': {
        if (P.defeated) break;
        this.emit({ t: 'msg', p: -1, text: P.name + ' has left the battle.' });
        for (const e of this.ents) if (e.owner === cmd.p && !e.dead) this.kill(e, -1);
        this.updatePlayers();
        break;
      }
      case 'rally': if (cmd.x !== undefined) for (const b of own) if (!b.unit) b.rally = { x: cmd.x, y: cmd.y, target: cmd.target || 0 }; break;
    }
  }

  canRepair(p, t) { return !!t && !t.unit && t.built && t.owner >= 0 && t.hp < t.maxHp && !this.enemies(p, t.owner); }

  queued(p) { let n = 0; for (const e of this.ents) if (e.owner === p && !e.unit && !e.dead) n += e.train.length; return n; }

  formation(cx, cy, n) {
    const out = []; if (n <= 1) return [[cx, cy]];
    const seen = new Set();
    for (let r = 0; r < 8 && out.length < n; r++) {
      for (let y = cy - r; y <= cy + r && out.length < n; y++) for (let x = cx - r; x <= cx + r && out.length < n; x++) {
        if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) !== r) continue;
        const k = y * this.w + x; if (seen.has(k)) continue; seen.add(k);
        if (this.inMap(x, y) && this.passable(x, y)) out.push([x, y]);
      }
    }
    return out;
  }

  smart(p, own, cmd) {
    const t = cmd.target ? this.get(cmd.target) : null;
    const workers = own.filter(e => e.unit && UNITS[e.type].worker), fighters = own.filter(e => e.unit && !UNITS[e.type].worker);
    const buildings = own.filter(e => !e.unit);
    for (const b of buildings) b.rally = { x: cmd.x, y: cmd.y, target: t ? t.id : 0 };
    const tree = this.isTree(cmd.x, cmd.y);
    // workers
    for (const u of workers) {
      if (t && t.type === 'mine') this.orderGather(u, t.id);
      else if (!t && tree) this.orderGather(u, 0, cmd.x, cmd.y);
      else if (t && t.owner === p && !t.unit && u.carry && BUILDINGS[t.type].depot && BUILDINGS[t.type].depot.includes(u.carryKind) && t.built) this.setOrder(u, { type: 'gather', kind: u.carryKind, phase: 'ret', depot: t.id, mine: u.lastMine, tx: u.lastTx, ty: u.lastTy });
      else if (this.canRepair(p, t)) this.setOrder(u, { type: 'repair', target: t.id });
      else if (t && this.enemies(p, t.owner)) this.setOrder(u, { type: 'attack', target: t.id });
      else this.setOrder(u, { type: 'move', x: cmd.x, y: cmd.y });
    }
    if (fighters.length) {
      if (t && this.enemies(p, t.owner)) { for (const u of fighters) this.setOrder(u, { type: 'attack', target: t.id }); }
      else if (t && t.owner === p && t.unit) { for (const u of fighters) this.setOrder(u, { type: 'follow', target: t.id }); }
      else { const spots = this.formation(cmd.x, cmd.y, fighters.length); fighters.forEach((u, i) => { const s = spots[i] || [cmd.x, cmd.y]; this.setOrder(u, { type: 'move', x: s[0], y: s[1] }); }); }
    }
  }

  orderGather(u, mineId, tx, ty) {
    const m = mineId ? this.get(mineId) : null;
    if (m && m.type === 'mine') { u.lastMine = m.id; u.lastTx = undefined; this.setOrder(u, { type: 'gather', kind: 'gold', mine: m.id, phase: u.carry && u.carryKind === 'gold' ? 'ret' : 'go' }); }
    else if (tx !== undefined) { u.lastMine = 0; u.lastTx = tx; u.lastTy = ty; this.setOrder(u, { type: 'gather', kind: 'wood', tx, ty, phase: u.carry && u.carryKind === 'wood' ? 'ret' : 'go' }); }
  }

  setOrder(u, o) {
    if (u.hidden) return; // inside a mine / building
    u.order = o; u.path = null; u.wait = 0; u.stuck = 0;
  }

  canAttack(e) { if (e.unit) return true; const b = BUILDINGS[e.type]; return !!(b.attack && e.built); }
  atk(e) { if (e.unit) return UNITS[e.type]; return BUILDINGS[e.type].attack; }

  // ---------------------------------------------------------------- tick
  step(cmds) {
    for (const c of cmds) this.exec(c);
    this.tick++;
    for (const p of this.players) if (p.ai && !p.defeated && (this.tick + p.id * 7) % 10 === 0) aiTick(this, p);
    const ents = this.ents;
    for (let i = 0; i < ents.length; i++) {
      const e = ents[i]; if (e.dead) continue;
      if (e.unit) this.updateUnit(e); else this.updateBuilding(e);
    }
    this.updateMissiles();
    if (this.ents.some(e => e.dead)) this.ents = this.ents.filter(e => !e.dead);
    if (this.tick % 10 === 0) this.updatePlayers();
  }

  updatePlayers() {
    for (const p of this.players) { p.food = 0; p.foodCap = 0; p.has = {}; p.alive = 0; p.units = 0; p.busy = 0; }
    for (const e of this.ents) {
      if (e.owner < 0 || e.dead) continue;
      const p = this.players[e.owner]; p.alive++;
      if (e.unit) { p.food += UNITS[e.type].food; p.units++; }
      else if (!e.built || e.train.length) p.busy++;
      else if (e.built) { p.foodCap += BUILDINGS[e.type].food || 0; p.has[e.type] = (p.has[e.type] || 0) + 1; }
    }
    for (const p of this.players) {
      if (!p.defeated && p.alive === 0) { p.defeated = true; this.emit({ t: 'defeat', p: p.id }); }
    }
    const teams = new Set(this.players.filter(p => !p.defeated).map(p => p.team));
    if (!this.over && teams.size <= 1 && this.players.length > 1) { this.over = true; this.winner = [...teams][0] ?? -1; this.emit({ t: 'over', team: this.winner }); }
    else if (!this.over && this.players.length === 1 && this.players[0].defeated) { this.over = true; this.emit({ t: 'over', team: -1 }); }
    // Stalemate: nobody has a unit left, nothing is being built or trained and nobody can pay for a new unit.
    // Buildings can't hurt each other, so the battle could never end: call it a draw.
    else if (!this.over && !this.missiles.length && this.players.every(p => p.defeated || (!p.units && !p.busy && !this.canTrainAny(p)))) {
      this.over = true; this.emit({ t: 'over', team: -1, draw: true });
    }
  }

  canTrainAny(p) {
    for (const t in UNITS) { const d = UNITS[t]; if (p.has[d.from] && (!d.req || p.has[d.req]) && p.gold >= d.gold && p.wood >= d.wood) return true; }
    return false;
  }

  updateBuilding(b) {
    const d = BUILDINGS[b.type];
    if (d.neutral) return;
    if (!b.built) {
      b.progress++;
      b.hp = Math.max(1, ((b.maxHp * (10 + (90 * b.progress / d.time | 0)) / 100) | 0) - b.dmgTaken);
      if (b.progress >= d.time) {
        b.built = true; b.hp = Math.max(1, b.maxHp - b.dmgTaken);
        const w = this.get(b.builder); if (w) this.popOut(w, b);
        if (w) w.order = null;
        this.emit({ t: 'built', p: b.owner, id: b.id, type: b.type, x: b.x, y: b.y, builder: w ? w.id : 0 });
        this.updatePlayers();
      }
      return;
    }
    if (b.train.length) {
      const it = b.train[0]; const ud = UNITS[it.type];
      if (it.t < ud.time) it.t++;
      if (it.t >= ud.time) {
        const tgt = b.rally || { x: b.x + b.size, y: b.y + b.size };
        const spot = this.freeTileNear(b, tgt.x, tgt.y, 6);
        if (spot) {
          b.train.shift();
          const u = this.spawn(it.type, b.owner, spot[0], spot[1]);
          this.emit({ t: 'trained', p: b.owner, id: u.id, type: u.type });
          if (b.rally) {
            const rt = b.rally.target ? this.get(b.rally.target) : null;
            if (ud.worker && rt && rt.type === 'mine') this.orderGather(u, rt.id);
            else if (ud.worker && !rt && this.isTree(b.rally.x, b.rally.y)) this.orderGather(u, 0, b.rally.x, b.rally.y);
            else this.setOrder(u, { type: 'move', x: b.rally.x, y: b.rally.y });
          }
          this.updatePlayers();
        }
      }
    }
    if (d.attack) {
      if (b.cd > 0) b.cd--;
      if ((this.tick + b.id) % 4 === 0 || (b.target && !this.get(b.target))) {
        const tg = b.target ? this.get(b.target) : null;
        if (!tg || this.distEnt(b, tg) > d.attack.range) b.target = this.findEnemy(b, d.attack.range)?.id || 0;
      }
      const tg = b.target ? this.get(b.target) : null;
      if (tg && b.cd === 0 && this.distEnt(b, tg) <= d.attack.range) { this.doAttack(b, tg, d.attack); }
    }
  }

  // something that can hurt us (soldiers, towers) as opposed to workers and plain buildings
  isThreat(o) { return o.unit ? !UNITS[o.type].worker : this.canAttack(o); }
  findEnemy(e, range, threatsOnly) {
    let best = null, bd = 1e9;
    const skip = e.skipUntil > this.tick ? e.skipId : 0;
    for (const o of this.ents) {
      if (o.dead || o.hidden || o.owner < 0 || o.id === skip || !this.enemies(e.owner, o.owner)) continue;
      if (threatsOnly && !this.isThreat(o)) continue;
      const d = this.distEnt(e, o); if (d > range) continue;
      // prefer things that fight back, then units, then buildings
      const score = d * 10 + (o.unit ? (this.canAttack(o) && !UNITS[o.type].worker ? 0 : 30) : (this.canAttack(o) ? 20 : 200));
      if (score < bd) { bd = score; best = o; }
    }
    return best;
  }

  doAttack(a, t, ad) {
    a.cd = ad.cd; a.anim = 10;
    if (a.unit) { const dx = t.x + (t.size >> 1) - a.x; if (dx) a.facing = dx > 0 ? 1 : -1; }
    const d = this.distEnt(a, t);
    if (ad.missile) {
      const sx = a.x + a.size / 2, sy = a.y + a.size / 2, tx = t.x + t.size / 2, ty = t.y + t.size / 2;
      const fl = Math.max(4, d * (ad.missile === 'rock' ? 4 : 2));
      this.missiles.push({ kind: ad.missile, sx, sy, tx, ty, target: t.id, tt: fl, t: 0, owner: a.owner, src: a.id, dmg: ad.dmg, pierce: ad.pierce, splash: ad.splash || 0, ax: t.x, ay: t.y });
      this.emit({ t: 'attack', type: a.type, f: a.owner >= 0 ? this.players[a.owner].faction : 0, owner: a.owner, missile: ad.missile, x: a.x, y: a.y, tx: t.x, ty: t.y, target: t.owner });
    } else {
      this.damage(t, ad.dmg, ad.pierce, a);
      this.emit({ t: 'attack', type: a.type, f: a.owner >= 0 ? this.players[a.owner].faction : 0, owner: a.owner, x: a.x, y: a.y, tx: t.x, ty: t.y, target: t.owner, building: !t.unit });
    }
  }

  damage(t, dmg, pierce, src) {
    if (t.dead) return;
    const armor = def(t.type).armor;
    let v = Math.max(0, dmg - armor) + pierce;
    v = Math.max(1, (v * (50 + this.rng.int(51)) / 100) | 0);
    if (t.type === 'mine') return;
    if (!t.built && !t.unit) t.dmgTaken += v;
    t.hp -= v; t.lastHit = this.tick;
    if (t.hp <= 0) { this.kill(t, src ? src.owner : -1); return; }
    // retaliation
    if (src && t.unit && !src.dead && !UNITS[t.type].worker && src.id) {
      if (!t.order) { t.order = { type: 'attack', target: src.id, auto: true }; t.path = null; }
      // standing ground: answer back without ever leaving the post
      else if (t.order.type === 'hold' && !t.order.sub && this.distEnt(t, src) <= UNITS[t.type].range) t.order.sub = src.id;
    }
    if (t.owner >= 0) this.emit({ t: 'attacked', p: t.owner, x: t.x, y: t.y });
  }

  kill(e, by, silent) {
    if (e.dead) return;
    e.dead = true;
    if (e.unit) { if (!e.hidden) this.uocc[this.idx(e.x, e.y)] = 0; }
    else {
      for (let yy = 0; yy < e.size; yy++) for (let xx = 0; xx < e.size; xx++) this.bocc[this.idx(e.x + xx, e.y + yy)] = 0;
      // release units inside
      for (const o of this.ents) if (!o.dead && o.hidden && o.inside === e.id) { this.popOut(o, e); o.order = null; }
    }
    if (by >= 0 && e.owner >= 0 && by !== e.owner) { this.players[by].kills++; }
    if (e.owner >= 0) this.players[e.owner].lost++;
    this.emit({ t: 'die', id: e.id, type: e.type, owner: e.owner, x: e.x, y: e.y, size: e.size, unit: e.unit, silent, faction: e.owner >= 0 ? this.players[e.owner].faction : 0 });
  }

  popOut(u, b, towardX, towardY) {
    const tx = towardX ?? b.x + b.size, ty = towardY ?? b.y + b.size;
    const s = this.freeTileNear(b, tx, ty, 8);
    u.hidden = false; u.inside = 0;
    if (s) { u.x = u.px = s[0]; u.y = u.py = s[1]; this.uocc[this.idx(u.x, u.y)] = u.id; u.mp = 0; }
    else { u.hidden = true; u.inside = b.id; } // try again later
  }

  nearestDepot(u, kind) {
    let best = null, bd = 1e9;
    for (const e of this.ents) {
      if (e.dead || e.unit || e.owner !== u.owner || !e.built) continue;
      const dp = BUILDINGS[e.type].depot; if (!dp || !dp.includes(kind)) continue;
      const d = this.distEnt(u, e); if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  // Connected areas of walkable ground (buildings and units ignored), relabelled whenever the terrain changes.
  // Lets workers and the AI skip trees and mines on the far side of water or rock instead of pathing at them forever.
  regions() {
    if (this.regVer === this.terrainVersion) return this.reg;
    const W = this.w, H = this.h, reg = this.reg || (this.reg = new Int32Array(W * H)), stack = this.regStack || (this.regStack = new Int32Array(W * H));
    reg.fill(0); let label = 0;
    for (let i = 0; i < W * H; i++) {
      if (reg[i] || !this.walkableTerrain(i % W, (i / W) | 0)) continue;
      let n = 0; stack[n++] = i; reg[i] = ++label;
      while (n) {
        const c = stack[--n], x = c % W, y = (c / W) | 0;
        for (let d = 0; d < 4; d++) {
          const nx = x + DIRS[d][0], ny = y + DIRS[d][1]; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const ni = ny * W + nx; if (!reg[ni] && this.walkableTerrain(nx, ny)) { reg[ni] = label; stack[n++] = ni; }
        }
      }
    }
    this.regVer = this.terrainVersion; return reg;
  }
  regionAt(x, y) { return this.inMap(x, y) ? this.regions()[y * this.w + x] : 0; }
  // can something standing in region `reg` get next to this square rect (a tree, mine or building)?
  touches(reg, rx, ry, rs) {
    const R = this.regions();
    for (let y = ry - 1; y <= ry + rs; y++) for (let x = rx - 1; x <= rx + rs; x++) {
      if (x >= rx && x < rx + rs && y >= ry && y < ry + rs) continue;
      if (this.inMap(x, y) && R[y * this.w + x] === reg) return true;
    }
    return false;
  }

  nearestMine(from, maxD) {
    let best = null, bd = maxD + 1;
    for (const e of this.ents) if (!e.dead && e.type === 'mine') { const d = this.distEnt(from, e); if (d < bd) { bd = d; best = e; } }
    return best;
  }

  // reg: only trees reachable from that walkable region; forId: only trees with a free tile to stand on for that unit
  nearestTree(x, y, maxR = 14, reg = 0, forId = 0) {
    for (let r = 0; r <= maxR; r++) {
      let best = null, bd = 1e9;
      for (let yy = y - r; yy <= y + r; yy++) for (let xx = x - r; xx <= x + r; xx++) {
        if (Math.max(Math.abs(xx - x), Math.abs(yy - y)) !== r) continue;
        if (!this.isTree(xx, yy)) continue;
        // must have a walkable neighbour
        let ok = false; for (const [dx, dy] of DIRS) if (this.passable(xx + dx, yy + dy) && (!forId || !this.uocc[this.idx(xx + dx, yy + dy)] || this.uocc[this.idx(xx + dx, yy + dy)] === forId)) { ok = true; break; }
        if (!ok || (reg && !this.touches(reg, xx, yy, 1))) continue;
        const d = (xx - x) * (xx - x) + (yy - y) * (yy - y);
        if (d < bd) { bd = d; best = [xx, yy]; }
      }
      if (best) return best;
    }
    return null;
  }

  updateUnit(u) {
    if (u.mp > 0) u.mp--;
    if (u.cd > 0) u.cd--;
    if (u.anim > 0) u.anim--;
    if (u.hidden) { this.updateHidden(u); return; }
    const d = UNITS[u.type];
    let o = u.order;
    // auto acquire
    if ((!o || o.type === 'amove' || o.type === 'hold') && !d.worker && (this.tick + u.id) % 5 === 0) {
      const en = this.findEnemy(u, o && o.type === 'hold' ? d.range : d.sight);
      if (en) {
        if (!o) { u.order = o = { type: 'attack', target: en.id, auto: true, hx: u.x, hy: u.y }; u.path = null; }
        else if (o.type === 'amove' && !o.sub) { o.sub = en.id; u.path = null; }
        else if (o.type === 'hold') o.sub = en.id;
      }
    }
    // busy knocking down a building or chasing a worker while soldiers or towers are in sight: deal with those first
    if (o && !d.worker && (this.tick + u.id) % 10 === 0 && (o.type === 'amove' ? o.sub : o.type === 'attack' && o.auto)) {
      const cur = this.get(o.type === 'amove' ? o.sub : o.target);
      if (cur && !this.isThreat(cur)) { const en = this.findEnemy(u, d.sight, true); if (en) { if (o.type === 'amove') o.sub = en.id; else o.target = en.id; u.path = null; } }
    }
    if (!o) return;
    switch (o.type) {
      case 'move': {
        const r = this.moveToward(u, o.x, o.y, 1, 0);
        if (r !== 'moving' && u.mp === 0) u.order = null;
        break;
      }
      case 'follow': {
        const t = this.get(o.target); if (!t || t.hidden) { u.order = null; break; }
        this.moveToward(u, t.x, t.y, 1, 1);
        break;
      }
      case 'amove': {
        if (o.sub) {
          const t = this.get(o.sub);
          if (!t || t.hidden || this.distEnt(u, t) > d.sight + 2) { o.sub = 0; u.path = null; }
          else { this.fight(u, t, d); break; }
        }
        const r = this.moveToward(u, o.x, o.y, 1, 0);
        if (r !== 'moving' && u.mp === 0) u.order = null;
        break;
      }
      case 'hold': {
        if (o.sub) { const t = this.get(o.sub); if (t && this.distEnt(u, t) <= d.range) { if (u.mp === 0 && u.cd === 0) this.doAttack(u, t, d); } else o.sub = 0; }
        break;
      }
      case 'attack': {
        const t = this.get(o.target);
        if (!t || t.hidden || (o.auto && this.distEnt(u, t) > d.sight + 3)) { u.order = null; u.path = null; break; }
        this.fight(u, t, d);
        break;
      }
      case 'gather': this.updateGather(u, o); break;
      case 'build': this.updateBuild(u, o); break;
      case 'repair': {
        const b = this.get(o.target); if (!this.canRepair(u.owner, b)) { u.order = null; break; }
        const r = this.moveToward(u, b.x, b.y, b.size, 1, true);
        if (r === 'stuck') { u.order = null; break; }
        if (r !== 'arrived' || u.mp > 0) break;
        const dx = b.x + (b.size >> 1) - u.x; if (dx) u.facing = dx > 0 ? 1 : -1;
        if (u.anim === 0) { u.anim = 10; this.emit({ t: 'sfx', s: 'hammer', x: u.x, y: u.y }); }
        if ((this.tick + u.id) % REPAIR_TICKS === 0) {
          const P = this.players[u.owner];
          if (P.gold < REPAIR_GOLD || P.wood < REPAIR_WOOD) { this.emit({ t: 'msg', p: u.owner, text: 'Not enough resources to repair', code: P.gold < REPAIR_GOLD ? 'gold' : 'wood' }); u.order = null; break; }
          P.gold -= REPAIR_GOLD; P.wood -= REPAIR_WOOD; b.hp = Math.min(b.maxHp, b.hp + REPAIR_HP);
        }
        break;
      }
    }
  }

  fight(u, t, d) {
    const dist = this.distEnt(u, t);
    if (dist <= d.range && (!d.minRange || dist >= d.minRange)) {
      u.path = null;
      if (u.mp === 0 && u.cd === 0) this.doAttack(u, t, d);
    } else if (d.minRange && dist < d.minRange) {
      // too close: siege just waits (or attack-move continues)
      if (u.order.type === 'amove') u.order.sub = 0; else if (u.order.auto) u.order = null;
    } else {
      const r = this.moveToward(u, t.x, t.y, t.size, d.range, true);
      if (r === 'stuck') {
        // no way in (surrounded by friends, walled off): leave this one alone for a while and find something else
        if (u.order.type === 'amove' || u.order.auto) { u.skipId = t.id; u.skipUntil = this.tick + 100; }
        if (u.order.type === 'amove') u.order.sub = 0; else u.order = null;
      }
    }
  }

  hide(u, b) {
    this.uocc[this.idx(u.x, u.y)] = 0; u.hidden = true; u.inside = b.id; u.path = null; u.mp = 0;
  }

  updateHidden(u) {
    const b = this.get(u.inside);
    if (!b) { // building vanished; find somewhere to stand
      const s = this.freeTileNear(null, u.x, u.y, 10);
      if (s) { u.hidden = false; u.x = u.px = s[0]; u.y = u.py = s[1]; this.uocc[this.idx(u.x, u.y)] = u.id; u.order = null; } return;
    }
    if (b.type === 'mine' && u.order && u.order.type === 'gather') {
      if (u.timer > 0) { u.timer--; return; }
      const take = Math.min(CARRY, b.gold);
      const dep = this.nearestDepot(u, 'gold');
      this.popOut(u, b, dep ? dep.x + (dep.size >> 1) : undefined, dep ? dep.y + (dep.size >> 1) : undefined);
      if (u.hidden) return;
      b.gold -= take; u.carry = take; u.carryKind = 'gold'; u.order.phase = 'ret'; u.path = null;
      this.emit({ t: 'mined', p: u.owner, x: u.x, y: u.y });
      if (b.gold <= 0) { this.emit({ t: 'msg', p: u.owner, text: 'A gold mine has collapsed!', code: 'mine' }); this.kill(b, -1); }
      return;
    }
    if (b.built && b.type !== 'mine') { this.popOut(u, b); u.order = null; }
    else if (u.hidden && b.unit === false && b.type === 'mine' && !u.order) this.popOut(u, b);
  }

  updateGather(u, o) {
    if (o.phase === 'ret') {
      if (!u.carry) { o.phase = 'go'; return; }
      let dep = o.depot ? this.get(o.depot) : null;
      if (!dep || !dep.built || dep.owner !== u.owner) { dep = this.nearestDepot(u, u.carryKind); o.depot = dep ? dep.id : 0; }
      if (!dep) { u.order = null; return; }
      const r = this.moveToward(u, dep.x, dep.y, dep.size, 1, true);
      if (r === 'arrived' && u.mp === 0) {
        const P = this.players[u.owner];
        if (u.carryKind === 'gold') { P.gold += u.carry; P.goldMined += u.carry; } else { P.wood += u.carry; P.woodCut += u.carry; }
        this.emit({ t: 'deposit', p: u.owner, kind: u.carryKind });
        u.carry = 0; o.depot = 0;
        if (o.kind === 'gold' && !this.get(o.mine)) { const m = this.nearestMine(dep, 12); o.mine = m ? m.id : 0; if (m) u.lastMine = m.id; }
        if (o.kind === 'gold' && o.mine) { o.phase = 'go'; }
        else if (o.kind === 'wood' && o.tx !== undefined) { o.phase = 'go'; }
        else u.order = null;
      } else if (r === 'stuck') { o.depot = 0; }
      return;
    }
    if (o.kind === 'gold') {
      const m = this.get(o.mine); if (!m) { u.order = null; return; }
      if (o.phase === 'go') {
        if (!this.touches(this.regionAt(u.x, u.y), m.x, m.y, m.size)) { u.order = null; return; }
        const r = this.moveToward(u, m.x, m.y, m.size, 1, true);
        if (r === 'arrived' && u.mp === 0) { this.hide(u, m); u.timer = MINE_TIME; o.fails = 0; }
        else if (r === 'stuck' && (o.fails = (o.fails || 0) + 1) > 6) u.order = null; // a crowded entrance clears; a walled-off mine doesn't
      }
    } else {
      if (o.phase === 'go') {
        const reg = this.regionAt(u.x, u.y);
        if (!this.isTree(o.tx, o.ty) || !this.touches(reg, o.tx, o.ty, 1)) {
          const t = this.nearestTree(o.tx, o.ty, 14, reg, u.id) || this.nearestTree(o.tx, o.ty, 14, reg); if (!t) { u.order = null; this.emit({ t: 'msg', p: u.owner, text: 'No trees nearby', code: 'noTrees' }); return; }
          o.tx = t[0]; o.ty = t[1]; u.path = null;
        }
        const r = this.moveToward(u, o.tx, o.ty, 1, 1, true);
        if (r === 'arrived' && u.mp === 0) { o.phase = 'chop'; u.timer = CHOP_TIME; const dx = o.tx - u.x; if (dx) u.facing = dx > 0 ? 1 : -1; }
        else if (r === 'stuck') { // every spot by this tree is taken: choose one with room
          const t = this.nearestTree(u.x, u.y, 12, reg, u.id); if (t && (t[0] !== o.tx || t[1] !== o.ty)) { o.tx = t[0]; o.ty = t[1]; u.path = null; } else u.order = null;
        }
      } else if (o.phase === 'chop') {
        if (!this.isTree(o.tx, o.ty)) { o.phase = 'go'; return; }
        u.anim = 6;
        if (u.timer % 14 === 0) this.emit({ t: 'sfx', s: 'chop', x: u.x, y: u.y });
        if (--u.timer <= 0) {
          this.terrain[this.idx(o.tx, o.ty)] = T_STUMP; this.terrainVersion++;
          this.emit({ t: 'tree', x: o.tx, y: o.ty });
          u.carry = CARRY; u.carryKind = 'wood'; u.lastTx = o.tx; u.lastTy = o.ty; o.phase = 'ret'; u.path = null;
        }
      }
    }
  }

  canPlace(btype, x, y, ignoreId) {
    const s = BUILDINGS[btype].size;
    for (let yy = y; yy < y + s; yy++) for (let xx = x; xx < x + s; xx++) {
      if (!this.passable(xx, yy)) return false;
      const o = this.uocc[this.idx(xx, yy)]; if (o && o !== ignoreId) return false;
    }
    // halls may not be placed right next to a mine
    if (btype === 'hall') for (const e of this.ents) if (e.type === 'mine' && this.distRect(e.x + 1, e.y + 1, x, y, s) < 4) return false;
    return true;
  }

  updateBuild(u, o) {
    const b = BUILDINGS[o.btype], s = b.size;
    const r = this.moveToward(u, o.x, o.y, s, 1, true);
    if (r === 'moving') return;
    if (u.mp > 0) return;
    if (r === 'stuck') { this.emit({ t: 'msg', p: u.owner, text: "Can't reach building site", code: 'cantBuild' }); u.order = null; return; }
    if (!this.canPlace(o.btype, o.x, o.y, u.id)) {
      if (++o.tries > 40) { this.emit({ t: 'msg', p: u.owner, text: "Can't build there", code: 'cantBuild' }); u.order = null; }
      return;
    }
    const P = this.players[u.owner];
    if (P.gold < b.gold || P.wood < b.wood) { this.emit({ t: 'msg', p: u.owner, text: P.gold < b.gold ? 'Not enough gold' : 'Not enough lumber', code: P.gold < b.gold ? 'gold' : 'wood' }); u.order = null; return; }
    P.gold -= b.gold; P.wood -= b.wood;
    const e = this.spawn(o.btype, u.owner, o.x, o.y);
    e.built = false; e.progress = 0; e.hp = (e.maxHp / 10) | 0; e.builder = u.id;
    this.hide(u, e);
    u.order = { type: 'constructing', target: e.id };
    this.emit({ t: 'sfx', s: 'build', x: o.x, y: o.y });
  }

  updateMissiles() {
    const keep = [];
    for (const m of this.missiles) {
      m.t++;
      const t = this.get(m.target);
      if (t) { m.tx = t.x + t.size / 2; m.ty = t.y + t.size / 2; m.ax = t.x; m.ay = t.y; }
      if (m.t < m.tt) { keep.push(m); continue; }
      const src = this.get(m.src) || { owner: m.owner };
      if (m.splash) {
        const ax = Math.floor(m.tx), ay = Math.floor(m.ty);
        for (const e of this.ents) if (!e.dead && !e.hidden && e.type !== 'mine' && this.distRect(ax, ay, e.x, e.y, e.size) <= m.splash) {
          const dd = this.distRect(ax, ay, e.x, e.y, e.size);
          this.damage(e, dd === 0 ? m.dmg : (m.dmg / 2) | 0, m.pierce, src);
        }
        this.emit({ t: 'boom', x: m.tx, y: m.ty });
      } else if (t) { this.damage(t, m.dmg, m.pierce, src); this.emit({ t: 'impact', x: t.x, y: t.y, kind: m.kind }); }
    }
    this.missiles = keep;
  }

  hash() {
    let h = this.tick | 0;
    for (const e of this.ents) { h = (Math.imul(h, 31) + e.id * 7 + e.x * 131 + e.y * 1031 + e.hp) | 0; }
    for (const p of this.players) h = (Math.imul(h, 17) + p.gold + p.wood * 3) | 0;
    return h >>> 0;
  }
}

export { MAX_SELECT, TPS };
