import { Game } from '../../src/sim.js';
import { rng } from '../../src/map.js';
// fuzz: player 0 is a "human" issuing random (sometimes malformed) commands; two copies must stay in sync
const seed = +process.argv[2] || 1;
const mk = () => new Game({ seed, size: 64, players: [{ name: 'h', faction: 0, color: 0 }, { name: 'c', faction: 1, color: 1, ai: true }, { name: 'c2', faction: 0, color: 2, ai: true }] });
const a = mk(), b = mk(), r = rng(seed * 77);
const types = ['move', 'amove', 'attack', 'smart', 'stop', 'hold', 'gather', 'ret', 'build', 'train', 'cancel', 'rally', 'repair', 'bogus'];
const bt = ['farm', 'barracks', 'mill', 'stable', 'forge', 'tower', 'hall', 'mine', 'constructor', 'x'], ut = ['worker', 'soldier', 'archer', 'knight', 'siege', 'toString'];
const junk = [undefined, null, NaN, 1e9, -5, 'a', 3.7, {}, Infinity];
let n = 0;
for (let t = 0; t < 40000 && !a.over; t++) {
  const cmds = [];
  if (r.int(6) === 0) {
    const mine = a.ents.filter(e => e.owner === 0), any = a.ents;
    const pick = () => (r.int(4) ? mine : any)[r.int((r.int(4) ? mine : any).length || 1)]?.id ?? 999999;
    const c = { p: 0, t: types[r.int(types.length)], ids: Array.from({ length: 1 + r.int(9) }, pick), x: r.int(64), y: r.int(64), target: r.int(2) ? pick() : 0, btype: bt[r.int(bt.length)], utype: ut[r.int(ut.length)] };
    if (r.int(25) === 0) c[['x', 'y', 'ids', 'target', 'btype', 'utype'][r.int(6)]] = junk[r.int(junk.length)];
    if (r.int(60) === 0) delete c.x;
    cmds.push(c); n++;
  }
  a.step(JSON.parse(JSON.stringify(cmds))); b.step(JSON.parse(JSON.stringify(cmds))); a.events.length = b.events.length = 0;
  if (a.hash() !== b.hash()) { console.log('DESYNC', t); process.exit(1); }
  if (t % 50 === 0) for (const e of a.ents) if (e.unit && !e.hidden && a.uocc[a.idx(e.x, e.y)] !== e.id) { console.log('uocc bad', t, e.type); process.exit(1); }
}
console.log('fuzz seed', seed, 'ok, cmds', n, 'tick', a.tick, 'over', a.over);
