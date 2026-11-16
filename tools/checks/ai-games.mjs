import { Game } from '../../src/sim.js';
import { UNITS, BUILDINGS } from '../../src/data.js';
function check(g) {
  const errs = [];
  const seen = new Map();
  for (const e of g.ents) {
    if (e.dead) continue;
    if (e.unit && !e.hidden) {
      const i = g.idx(e.x, e.y);
      if (g.uocc[i] !== e.id) errs.push(`uocc mismatch unit ${e.id} ${e.type} at ${e.x},${e.y} has ${g.uocc[i]}`);
      if (seen.has(i)) errs.push(`two units on tile ${e.x},${e.y}`);
      seen.set(i, e.id);
      if (!g.walkableTerrain(e.x, e.y) || g.bocc[i]) errs.push(`unit ${e.id} on blocked tile`);
    }
  }
  for (let i = 0; i < g.uocc.length; i++) if (g.uocc[i]) { const e = g.get(g.uocc[i]); if (!e || e.hidden || g.idx(e.x, e.y) !== i) errs.push(`stale uocc at ${i % g.w},${(i / g.w) | 0} id ${g.uocc[i]}`); }
  for (let i = 0; i < g.bocc.length; i++) if (g.bocc[i]) { const e = g.get(g.bocc[i]); if (!e) errs.push(`stale bocc ${i}`); }
  for (const e of g.ents) {
    if (e.dead) continue;
    if (e.hp > e.maxHp) errs.push(`hp over max ${e.type}`);
    if (e.unit && e.hidden) { const b = g.get(e.inside); e._hid = (e._hid || 0) + 1; if (!b && e._hid > 3) errs.push(`unit ${e.id} hidden inside nothing`); if (e._hid > 400) errs.push(`unit ${e.id} ${e.type} hidden for ${e._hid * 20} ticks in ${b && b.type} order ${JSON.stringify(e.order)}`); } else e._hid = 0;
    if (e.unit && e.order && (e.order.type === 'attack' || e.order.type === 'repair' || e.order.type === 'follow') && !g.get(e.order.target)) { e._stale = (e._stale || 0) + 1; if (e._stale > 3) errs.push(`unit ${e.id} keeps an order on a dead target (${e.order.type})`); } else e._stale = 0;
    if (!e.unit && e.train && e.train.length > 5) errs.push('queue too long');
    if (e.unit && e.carry && !UNITS[e.type].worker) errs.push('non-worker carrying');
  }
  for (const p of g.players) if (!p.defeated && p.foodCap !== g.ents.filter(e => e.owner === p.id && !e.unit && e.built && !e.dead).reduce((n, e) => n + (BUILDINGS[e.type].food || 0), 0) && g.tick % 10 === 0) errs.push(`foodCap wrong for p${p.id}`);
  for (const p of g.players) if (p.gold < 0 || p.wood < 0 || !Number.isInteger(p.gold)) errs.push(`bad res p${p.id} ${p.gold} ${p.wood}`);
  return errs;
}
const seed = +process.argv[2] || 1, n = +process.argv[3] || 2, size = +process.argv[4] || 64, T = +process.argv[5] || 60000;
const mk = () => new Game({ seed, size, players: Array.from({ length: n }, (_, i) => ({ name: 'c' + i, faction: i % 2, color: i, ai: true, level: process.env.LV ? +process.env.LV.split(',')[i] : 1 })) });
const g = mk(), g2 = process.env.DET ? mk() : null;
let errCount = 0;
const t0 = Date.now(); let maxStep = 0;
for (let t = 0; t < T && !g.over; t++) {
  const s = performance.now(); g.step([]); maxStep = Math.max(maxStep, performance.now() - s); g.events.length = 0;
  if (g2) { g2.step([]); g2.events.length = 0; if (g.hash() !== g2.hash()) { console.log('DESYNC at', t); break; } }
  if (t % 20 === 0) { const e = check(g); if (e.length && errCount++ < 5) console.log('tick', t, e.slice(0, 4)); }
  if (t % 6000 === 0) console.log(t, g.players.map(p => `g${p.gold} w${p.wood} f${p.food}/${p.foodCap} k${p.kills} ents${g.ents.filter(e => e.owner === p.id).length} wave${p.aiState.wave}${p.defeated ? ' DEAD' : ''}`).join(' | '));
}
console.log('seed', seed, 'end tick', g.tick, 'over', g.over, 'winner', g.winner, 'errs', errCount, 'ms', Date.now() - t0, 'maxStep', maxStep.toFixed(1));
const idle = g.ents.filter(e => e.unit && UNITS[e.type].worker && !e.order && !e.hidden).length;
console.log('idle workers', idle, 'mines', g.ents.filter(e => e.type === 'mine').map(m => m.gold).join(','));
