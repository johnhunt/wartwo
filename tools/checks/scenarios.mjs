// Small targeted situations for the computer player.
import { Game } from '../../src/sim.js';
// 1. the AI loses its hall mid-game: it should raise a new one and carry on
{
  const g = new Game({ seed: 3, size: 64, players: [{ name: 'a', faction: 0, color: 0, ai: true }, { name: 'b', faction: 1, color: 1, ai: true }] });
  let killedAt = 0, rebuiltAt = 0;
  for (let t = 0; t < 12000 && !g.over; t++) {
    g.step([]); g.events.length = 0;
    const p = g.players[1], hall = g.ents.find(e => e.owner === 1 && e.type === 'hall');
    if (!killedAt && g.tick === 2500) { g.kill(hall, -1); p.gold = Math.max(p.gold, 1500); p.wood = Math.max(p.wood, 1000); killedAt = g.tick; }
    else if (killedAt && !rebuiltAt && hall && hall.built) rebuiltAt = g.tick;
  }
  console.log('AI hall destroyed at', killedAt, rebuiltAt ? `-> rebuilt by tick ${rebuiltAt}` : '-> NEVER rebuilt');
}
