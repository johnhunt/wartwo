// movement stress scenarios: how many units reach their goal, how long it takes, how many give up far away
import { Game } from '../../src/sim.js';
function mk() {
  const g = new Game({ seed: 5, size: 64, players: [{ name: 'a', faction: 0, color: 0 }, { name: 'b', faction: 1, color: 1 }] });
  for (const e of g.ents.slice()) if (e.unit) g.kill(e, -1, true);
  g.ents = g.ents.filter(e => !e.dead);
  // flat arena in the middle
  for (let y = 14; y < 50; y++) for (let x = 14; x < 50; x++) g.terrain[g.idx(x, y)] = 0;
  g.terrainVersion++; return g;
}
const wall = (g, x0, y0, x1, y1) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) g.terrain[g.idx(x, y)] = 3; g.terrainVersion++; };
function group(g, owner, x0, y0, n, type = 'soldier') { const out = []; for (let i = 0; i < n; i++) out.push(g.spawn(type, owner, x0 + (i % 4), y0 + ((i / 4) | 0))); return out; }
function run(name, g, orders, T = 1500) {
  g.step(orders.map(o => o.cmd));
  let doneAt = -1;
  const ok = (u, o) => !u.dead && Math.max(Math.abs(u.x - o.cmd.x), Math.abs(u.y - o.cmd.y)) <= (o.r || 4);
  for (let t = 1; t < T; t++) { g.step([]); g.events.length = 0; if (doneAt < 0 && orders.every(o => o.units.every(u => ok(u, o)))) { doneAt = t; break; } }
  let arrived = 0, gaveUp = 0, total = 0;
  for (const o of orders) for (const u of o.units) { total++; if (ok(u, o)) arrived++; else if (!u.order) gaveUp++; }
  console.log(name.padEnd(34), 'arrived', arrived + '/' + total, 'gave up', gaveUp, doneAt > 0 ? 'all there at tick ' + doneAt : 'NOT all after ' + T);
}
const mvc = (p, units, x, y, t = 'move') => ({ units, cmd: { p, t, ids: units.map(u => u.id), x, y } });
{ const g = mk(); const a = group(g, 0, 16, 30, 12), b = group(g, 0, 44, 30, 12); run('two groups swap sides, open', g, [mvc(0, a, 45, 31), mvc(0, b, 17, 31)]); }
{ const g = mk(); wall(g, 31, 14, 32, 29); wall(g, 31, 32, 32, 49); const a = group(g, 0, 16, 30, 12), b = group(g, 0, 44, 30, 12); run('swap through a 2-wide gap', g, [mvc(0, a, 45, 31), mvc(0, b, 17, 31)], 3000); }
{ const g = mk(); wall(g, 31, 14, 32, 30); wall(g, 31, 32, 32, 49); const a = group(g, 0, 16, 30, 12), b = group(g, 0, 44, 30, 12); run('swap through a 1-wide gap', g, [mvc(0, a, 45, 31), mvc(0, b, 17, 31)], 4000); }
{ const g = mk(); wall(g, 31, 14, 32, 30); wall(g, 31, 32, 32, 49); const a = group(g, 0, 16, 30, 12); run('one group through a 1-wide gap', g, [mvc(0, a, 45, 31)], 3000); }
{ const g = mk(); wall(g, 24, 20, 40, 21); wall(g, 39, 20, 40, 44); wall(g, 24, 43, 40, 44); const a = group(g, 0, 30, 30, 9); run('out of a U-shaped pocket', g, [mvc(0, a, 46, 32)], 3000); }
{ const g = mk(); const idle = group(g, 0, 30, 28, 16); const a = group(g, 0, 16, 30, 9); run('through a crowd of idle friends', g, [mvc(0, a, 45, 30)]); }
{ const g = mk(); const en = group(g, 1, 30, 28, 16, 'worker'); for (const e of en) e.owner = -1; const a = group(g, 0, 16, 30, 9); run('round a block of neutral units', g, [mvc(0, a, 45, 30)]); }
{ const g = mk(); wall(g, 31, 14, 32, 30); wall(g, 31, 32, 32, 49); const holder = g.spawn('soldier', 0, 31, 31); holder.order = { type: 'hold' }; const a = group(g, 0, 16, 30, 6); run('1-wide gap plugged by a holder', g, [mvc(0, a, 45, 31)], 1500); }
{ const g = mk(); const a = group(g, 0, 16, 30, 16); const farm = g.spawn('farm', 1, 40, 30); farm.built = true; g.step([{ p: 0, t: 'attack', ids: a.map(u => u.id), target: farm.id }]); let eng = 0; for (let t = 0; t < 500; t++) { g.step([]); g.events.length = 0; } eng = a.filter(u => g.distEnt(u, farm) <= 1).length; console.log('16 soldiers attack a farm'.padEnd(34), 'adjacent', eng, '/ 12 slots, idle', a.filter(u => !u.order).length, 'farm hp', farm.dead ? 'dead' : farm.hp); }
