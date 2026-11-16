// Simulated lockstep session: N peers, each with its own Game + Lockstep, joined by a mock lobby with random latency.
import { Game } from '../../src/sim.js';
import { Lockstep } from '../../src/net.js';
import { rng } from '../../src/map.js';
const seed = +process.argv[2] || 1, N = +process.argv[3] || 2, dropAt = +process.argv[4] || 0, maxLag = +process.argv[5] || 4;
const r = rng(seed * 991);
const players = Array.from({ length: N }, (_, i) => ({ name: 'p' + i, faction: i % 2, color: i, peer: 'peer' + i })).concat([{ name: 'cpu', faction: 1, color: N, ai: true, peer: null }]);
const queue = []; let frame = 0; const gone = new Set();
const peers = players.filter(p => p.peer).map((p, i) => {
  const handlers = {};
  const lobby = { selfId: p.peer, on: (ev, fn) => { handlers[ev] = fn; }, send: (kind, data, targets) => { for (const t of targets) if (!gone.has(p.peer)) queue.push({ at: frame + 1 + r.int(maxLag), to: t, kind, data: JSON.parse(JSON.stringify(data)), from: p.peer }); } };
  const game = new Game({ seed, size: 64, players });
  return { id: p.peer, slot: i, game, handlers, ls: new Lockstep(game, players, i, lobby), hashes: new Map() };
});
const byId = Object.fromEntries(peers.map(p => [p.id, p]));
let stalls = 0, bad = 0;
for (frame = 0; frame < 9000; frame++) {
  for (let i = queue.length - 1; i >= 0; i--) if (queue[i].at <= frame) { const m = queue.splice(i, 1)[0]; const p = byId[m.to]; if (p && !gone.has(m.to) && p.handlers[m.kind]) p.handlers[m.kind](m.data, m.from); }
  if (dropAt && frame === dropAt) { const v = peers[N - 1]; gone.add(v.id); for (const p of peers) if (p !== v) p.handlers.peerLeave && p.handlers.peerLeave(v.id); console.log('peer', v.id, 'dropped at frame', frame, 'tick', v.game.tick); }
  for (const p of peers) {
    if (gone.has(p.id)) continue;
    if (r.int(5) === 0) { const mine = p.game.ents.filter(e => e.owner === p.slot && e.unit); if (mine.length) p.ls.issue({ t: ['move', 'amove', 'stop', 'smart'][r.int(4)], ids: mine.slice(0, 1 + r.int(5)).map(e => e.id), x: r.int(64), y: r.int(64), target: 0 }); }
    if (p.ls.ready()) { p.ls.step(); p.game.events.length = 0; if (p.game.tick % 50 === 0) p.hashes.set(p.game.tick, p.game.hash()); } else stalls++;
    if (p.ls.desync) bad++;
  }
}
const live = peers.filter(p => !gone.has(p.id));
let mismatch = 0, compared = 0; for (const [t, h] of live[0].hashes) for (const p of live.slice(1)) if (p.hashes.has(t)) { compared++; if (p.hashes.get(t) !== h) mismatch++; }
console.log(`seed ${seed} peers ${N}: ticks ${live.map(p => p.game.tick).join('/')} stalled frames ${stalls} hashes compared ${compared} mismatched ${mismatch} desync flags ${bad}` + (dropAt ? ` dropped player defeated: ${live[0].game.players[N - 1].defeated}` : ''));
