// Computer opponent. Runs inside the deterministic simulation on every peer.
import { UNITS, BUILDINGS } from './data.js';

export function aiInit(g, p) {
  p.aiState = { wave: 0, lastAttack: 0, buildIdx: 0, rally: null };
}

const BUILD_PLAN = [
  ['farm', 4], ['barracks', 6], ['farm', 7], ['mill', 8], ['farm', 9], ['barracks', 10], ['stable', 10], ['farm', 11],
  ['forge', 12], ['tower', 12], ['farm', 13], ['farm', 15], ['tower', 16], ['farm', 18], ['farm', 20],
];

function cmd(g, p, c) { c.p = p.id; g.exec(c); }

export function aiTick(g, p) {
  const st = p.aiState;
  const mine = [], workers = [], army = [], blds = [];
  for (const e of g.ents) {
    if (e.dead || e.owner !== p.id) continue;
    if (e.unit) { if (UNITS[e.type].worker) workers.push(e); else army.push(e); mine.push(e); } else blds.push(e);
  }
  const hall = blds.find(b => b.type === 'hall' && b.built) || blds.find(b => b.type === 'hall');
  const count = t => blds.filter(b => b.type === t).length;
  const pending = t => workers.some(w => w.order && w.order.type === 'build' && w.order.btype === t);
  const freeFood = p.foodCap - p.food - g.queued(p.id);
  const totalUnits = workers.length + army.length;

  // --- economy: assign idle workers
  if (hall) {
    let gold = 0, wood = 0;
    for (const w of workers) if (w.order && w.order.type === 'gather') { if (w.order.kind === 'gold') gold++; else wood++; }
    const mineEnt = bestMine(g, p, blds);
    // too much lumber, not enough gold: move some woodcutters to the mine
    if (mineEnt && p.wood > 2500 && p.gold < 1500) {
      let n = 0;
      for (const w of workers) if (n < 2 && w.order && w.order.type === 'gather' && w.order.kind === 'wood' && !w.carry && !w.hidden) { cmd(g, p, { t: 'gather', ids: [w.id], target: mineEnt.id }); n++; }
    }
    for (const w of workers) {
      if (w.hidden || (w.order && w.order.type !== 'move')) continue;
      if (w.order && w.order.type === 'move') continue;
      if (mineEnt && (p.wood > 1500 || gold < 2 || wood >= Math.max(2, (gold + wood) * 0.3))) { cmd(g, p, { t: 'gather', ids: [w.id], target: mineEnt.id }); gold++; }
      else { const tr = g.nearestTree(hall.x + 2, hall.y + 2, 20); if (tr) { cmd(g, p, { t: 'gather', ids: [w.id], x: tr[0], y: tr[1] }); wood++; } }
    }
    // train workers
    const wantWorkers = 9 + Math.min(6, (g.tick / 2400) | 0);
    if (workers.length < wantWorkers && hall.built && hall.train.length === 0 && freeFood > 0) cmd(g, p, { t: 'train', ids: [hall.id], utype: 'worker' });
  }

  // --- construction
  const builder = workers.find(w => w.order && w.order.type === 'gather' && w.order.kind === 'wood' && !w.hidden && !w.carry) || workers.find(w => !w.hidden && !w.order);
  const building = workers.some(w => w.order && w.order.type === 'build');
  if (builder && hall && !building) {
    let want = null;
    if (freeFood <= 2 && p.foodCap < 60 && !blds.some(b => b.type === 'farm' && !b.built)) want = 'farm';
    else {
      for (const [t, n] of BUILD_PLAN) {
        const have = count(t);
        const need = BUILD_PLAN.filter(x => x[0] === t && x[1] <= totalUnits).length;
        if (have < need && !pending(t)) { want = t; break; }
      }
    }
    if (want) {
      const d = BUILDINGS[want];
      if ((!d.req || p.has[d.req]) && p.gold >= d.gold && p.wood >= d.wood) {
        const spot = findSpot(g, p, want, hall);
        if (spot) cmd(g, p, { t: 'build', ids: [builder.id], btype: want, x: spot[0], y: spot[1] });
      }
    }
  }

  // --- expansion: when the home mine runs low, build a new hall by another mine
  if (hall && builder && !building && p.gold >= 1200 && p.wood >= 800 && count('hall') < 4) {
    const home = bestMine(g, p, blds);
    const halls = blds.filter(b => b.type === 'hall');
    const homeOk = home && home.gold > 2500 && halls.some(h => g.distEnt(h, home) < 8);
    if (!homeOk && !blds.some(b => b.type === 'hall' && !b.built)) {
      let target = null, bd = 1e9;
      for (const m of g.ents) {
        if (m.dead || m.type !== 'mine' || m.gold < 3000) continue;
        if (g.ents.some(e => !e.dead && e.type === 'hall' && g.distEnt(e, m) < 9)) continue;
        const d = g.distEnt(m, hall); if (d < bd) { bd = d; target = m; }
      }
      if (target) { const spot = spotNearMine(g, target); if (spot) cmd(g, p, { t: 'build', ids: [builder.id], btype: 'hall', x: spot[0], y: spot[1] }); }
    }
  }

  // --- military production
  for (const b of blds) {
    if (b.type !== 'barracks' || !b.built || b.train.length >= 2) continue;
    if (freeFood <= 0) break;
    const opts = ['soldier', 'soldier', 'archer'];
    if (p.has.stable) opts.push('knight', 'knight');
    if (p.has.forge && army.filter(a => a.type === 'siege').length < 2) opts.push('siege');
    const u = opts[g.rng.int(opts.length)];
    const ud = UNITS[u];
    if ((!ud.req || p.has[ud.req]) && p.gold >= ud.gold + 200 && p.wood >= ud.wood) cmd(g, p, { t: 'train', ids: [b.id], utype: u });
  }

  // --- defence: enemies near base
  if (hall) {
    let threat = null;
    for (const e of g.ents) {
      if (e.dead || e.hidden || e.owner < 0 || !g.enemies(p.id, e.owner) || !e.unit) continue;
      if (g.distEnt(e, hall) < 14) { threat = e; break; }
    }
    if (threat) {
      const idle = army.filter(a => !a.order || a.order.type !== 'attack');
      if (idle.length) cmd(g, p, { t: 'amove', ids: idle.map(a => a.id), x: threat.x, y: threat.y });
      return;
    }
  }

  // --- attack waves
  const idleArmy = army.filter(a => !a.order);
  const need = 6 + st.wave * 3;
  if (idleArmy.length >= Math.min(need, 22) && g.tick - st.lastAttack > 600) {
    const target = pickTarget(g, p, hall || idleArmy[0]);
    if (target) {
      st.wave++; st.lastAttack = g.tick;
      cmd(g, p, { t: 'amove', ids: idleArmy.map(a => a.id), x: target.x, y: target.y });
    }
  } else if (hall) {
    // gather idle army near the base front
    const gx = hall.x + 2 + (hall.x < g.w / 2 ? 6 : -6), gy = hall.y + 2 + (hall.y < g.h / 2 ? 6 : -6);
    const loose = idleArmy.filter(a => Math.abs(a.x - gx) > 4 || Math.abs(a.y - gy) > 4);
    if (loose.length) cmd(g, p, { t: 'move', ids: loose.map(a => a.id), x: Math.max(1, Math.min(g.w - 2, gx)), y: Math.max(1, Math.min(g.h - 2, gy)) });
  }
}

function nearestMine(g, from) {
  let best = null, bd = 1e9;
  for (const e of g.ents) if (!e.dead && e.type === 'mine') { const d = g.distEnt(e, from); if (d < bd) { bd = d; best = e; } }
  return best;
}

function bestMine(g, p, blds) {
  const halls = blds.filter(b => b.type === 'hall' && b.built);
  let best = null, bd = 1e9;
  for (const m of g.ents) {
    if (m.dead || m.type !== 'mine') continue;
    for (const h of halls) { const d = g.distEnt(m, h); if (d < bd) { bd = d; best = m; } }
  }
  return best;
}

function spotNearMine(g, m) {
  for (let r = 4; r <= 7; r++) for (let y = m.y - r - 3; y <= m.y + 2 + r; y++) for (let x = m.x - r - 3; x <= m.x + 2 + r; x++) {
    if (!g.inMap(x, y) || !g.inMap(x + 3, y + 3)) continue;
    const d = g.distRect(m.x + 1, m.y + 1, x, y, 4); if (d !== r) continue;
    if (g.canPlace('hall', x, y)) return [x, y];
  }
  return null;
}

function pickTarget(g, p, from) {
  let best = null, bd = 1e9;
  for (const e of g.ents) {
    if (e.dead || e.owner < 0 || !g.enemies(p.id, e.owner)) continue;
    const d = g.distEnt(e, from) + (e.unit ? 10 : 0);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

function findSpot(g, p, type, hall) {
  const s = BUILDINGS[type].size;
  const cx = hall.x + 2, cy = hall.y + 2;
  const mineE = nearestMine(g, hall);
  for (let r = 3; r < 16; r++) {
    for (let k = 0; k < r * 8; k++) {
      // deterministic walk around the ring
      const side = (k / (r * 2)) | 0, off = k % (r * 2);
      let x, y;
      if (side === 0) { x = cx - r + off; y = cy - r; } else if (side === 1) { x = cx + r; y = cy - r + off; } else if (side === 2) { x = cx + r - off; y = cy + r; } else { x = cx - r; y = cy + r - off; }
      if (type === 'tower') { /* towers anywhere */ }
      if (!g.inMap(x - 1, y - 1) || !g.inMap(x + s, y + s)) continue;
      // keep a ring of free tiles around for paths
      let ok = true;
      for (let yy = y - 1; yy <= y + s && ok; yy++) for (let xx = x - 1; xx <= x + s && ok; xx++) if (!g.passable(xx, yy)) ok = false;
      if (!ok || !g.canPlace(type, x, y)) continue;
      if (mineE && g.distRect(mineE.x + 1, mineE.y + 1, x, y, s) < 4) continue; // don't block mining lane
      if (mineE && type !== 'hall') { // don't sit between hall and mine
        const mx = mineE.x + 1, my = mineE.y + 1;
        const minX = Math.min(mx, cx), maxX = Math.max(mx, cx), minY = Math.min(my, cy), maxY = Math.max(my, cy);
        if (x + s > minX - 1 && x < maxX + 1 && y + s > minY - 1 && y < maxY + 1) continue;
      }
      return [x, y];
    }
  }
  return null;
}
