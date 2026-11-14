// Glue between game events / player actions and the music, sfx and speech systems.
import * as sfx from './sfx.js';
import * as speech from './speech.js';
import * as music from './music.js';
import { UNITS } from '../data.js';

let G = null, R = null, me = -1, fac = 0, addMsg = () => {}, V = { w: 464, h: 448 };
let ambT = 0, birdT = 0, buildT = 0, fireT = 0, lastCombat = 0, alertT = 0;

export function attach(game, renderer, mySlot, msgFn, VIEW) {
  G = game; R = renderer; me = mySlot; addMsg = msgFn; V = VIEW;
  fac = me >= 0 ? game.players[me].faction : 0;
  sfx.setListener(() => ({ x: (R.cam.x + VIEW.w / 2) / 32, y: (R.cam.y + VIEW.h / 2) / 32, halfW: VIEW.w / 64, halfH: VIEW.h / 64 }));
  speech.preload([...new Set(game.players.map(p => p.faction))]);
  preloadScreams();
  music.playlist(fac ? 'warband' : 'kingdom');
  setTimeout(() => speech.narrate(fac, 'welcome'), 900);
  birdT = performance.now() + 4000;
}
export function detach() { G = null; R = null; speech.stopAll(); }

const seen = (x, y) => !R || R.revealAll || me < 0 || !!R.visible[Math.floor(y) * G.w + Math.floor(x)];

// ---------------------------------------------------------------- simulation events
const MELEE = { worker: ['hit', 'club'], soldier: ['sword', 'axe'], knight: ['lance', 'bite'] };
// recorded death screams (assets/sfx/death, see CREDITS.md): pool name -> clip count
const SCREAMS = { human_m: 11, human_f: 5, orc_m: 13, orc_f: 5 };
const screamPool = (type, f) => (f ? (type === 'archer' ? 'orc_f' : 'orc_m') : (type === 'archer' ? 'human_f' : 'human_m'));
const lastScream = {};
function scream(type, f, o) {
  const pool = screamPool(type, f), n = SCREAMS[pool];
  let i = Math.floor(Math.random() * n); if (n > 1 && i === lastScream[pool]) i = (i + 1) % n; lastScream[pool] = i;
  sfx.playClip(`death/${pool}_${i}.mp3`, o);
}
export function preloadScreams() { const p = []; for (const k in SCREAMS) for (let i = 0; i < SCREAMS[k]; i++) p.push(`death/${k}_${i}.mp3`); sfx.preloadClips(p); }
export function event(ev) {
  if (!G) return;
  const pos = (x, y) => ({ x: x + 0.5, y: y + 0.5 });
  switch (ev.t) {
    case 'attack': {
      if (!seen(ev.x, ev.y) && !seen(ev.tx, ev.ty)) break;
      lastCombat = performance.now();
      const o = pos(ev.x, ev.y);
      if (ev.missile === 'rock') sfx.play('launch', o);
      else if (ev.missile) sfx.play(ev.type === 'archer' && ev.f === 1 ? 'spear' : 'bow', o);
      else if (ev.building) { sfx.play(ev.f ? 'club' : 'axe', pos(ev.tx, ev.ty)); }
      else { const m = MELEE[ev.type] || ['hit', 'hit']; sfx.play(m[ev.f] || m[0], o); if (ev.type === 'knight' && ev.f === 1 && Math.random() < 0.5) sfx.play('axe', o); }
      break;
    }
    case 'impact': if (seen(ev.x, ev.y)) sfx.play('arrowHit', pos(ev.x, ev.y)); break;
    case 'boom': if (seen(ev.x, ev.y)) sfx.play('boom', pos(ev.x, ev.y)); break;
    case 'die': {
      if (!seen(ev.x, ev.y) && ev.owner !== me) break;
      const o = pos(ev.x + ev.size / 2 - 0.5, ev.y + ev.size / 2 - 0.5);
      if (!ev.unit) { if (!ev.silent) sfx.play('collapse', o); break; }
      scream(ev.type, ev.faction, o);
      if (ev.type === 'knight') sfx.play(ev.faction ? 'dieWolf' : 'dieHorse', { ...o, delay: 0.15 });
      if (ev.type === 'siege') sfx.play('dieSiege', o);
      break;
    }
    case 'tree': if (seen(ev.x, ev.y)) sfx.play('treeFall', pos(ev.x, ev.y)); break;
    case 'sfx': if (seen(ev.x, ev.y)) sfx.play(ev.s, pos(ev.x, ev.y)); break;
    case 'mined': if (seen(ev.x, ev.y)) sfx.play('mine', { ...pos(ev.x, ev.y), vol: 0.6 }); break;
    case 'deposit': if (ev.p === me) sfx.play(ev.kind === 'gold' ? 'coins' : 'logs', { vol: 0.35 }); break;
    case 'built': if (ev.p === me) { sfx.play('done'); speech.unitLine('worker', fac, 'done'); } break;
    case 'trained': if (ev.p === me) { sfx.play('ready', { vol: 0.6 }); speech.unitLine(ev.type, fac, 'ready'); } break;
    case 'msg': if (ev.p === me && ev.code) { sfx.play('error'); speech.narrate(fac, ev.code, 2500); } break;
    case 'attacked':
      if (ev.p === me && performance.now() - alertT > 12000 && !onScreen(ev.x, ev.y)) {
        alertT = performance.now(); sfx.play(fac ? 'orchorn' : 'warhorn'); speech.narrate(fac, 'attacked', 12000);
      }
      break;
    case 'defeat': if (ev.p !== me && me >= 0 && G.players[ev.p].team !== G.players[me].team) speech.narrate(fac, 'fallen'); break;
    case 'over': {
      const won = me >= 0 && G.players[me].team === ev.team;
      music.stinger(won ? 'victory' : 'defeat', fac ? 'warband' : 'kingdom');
      setTimeout(() => speech.narrate(fac, won ? 'victory' : 'defeat', 0), 600);
      break;
    }
  }
}
function onScreen(x, y) { return x * 32 >= R.cam.x - 32 && x * 32 <= R.cam.x + V.w + 32 && y * 32 >= R.cam.y - 32 && y * 32 <= R.cam.y + V.h + 32; }

// ---------------------------------------------------------------- player actions
const BLD_SOUND = {
  hall: ['bell', 'wardrum'], farm: ['moo', 'pig'], barracks: ['sword', 'growl'], mill: ['saw', 'saw'], stable: ['neigh', 'howl'],
  forge: ['anvil', 'anvil'], tower: ['creak', 'creak'], mine: ['mine', 'mine'],
};
export function selected(ents) {
  if (!ents.length) return;
  const e = ents[0]; const owner = e.owner, f = owner >= 0 ? G.players[owner].faction : 0;
  if (e.unit) {
    if (owner === me) speech.select(e.type, f, e.id); else sfx.play('select');
  } else if (!e.built) sfx.play('hammer');
  else { const s = BLD_SOUND[e.type]; if (s) sfx.play(s[f] || s[0]); }
}
// kind: 'ack' | 'attack' | 'work' | 'build'
export function ordered(ents, kind) {
  const u = ents.find(e => e.unit); if (!u) return;
  speech.order(u.type, fac, kind === 'work' && !UNITS[u.type].worker ? 'ack' : kind);
}

// ---------------------------------------------------------------- ambience (call every frame)
export function ambience(now) {
  if (!G || !R) return;
  if (now - ambT < 250) return; ambT = now;
  const tx0 = R.cam.x / 32, ty0 = R.cam.y / 32, tx1 = tx0 + V.w / 32, ty1 = ty0 + V.h / 32;
  const inView = (e) => e.x + e.size > tx0 && e.x < tx1 && e.y + e.size > ty0 && e.y < ty1 && !e.dead;
  if (now > buildT) { // construction noise
    const sites = G.ents.filter(e => !e.unit && !e.built && inView(e) && seen(e.x, e.y));
    if (sites.length) { const s = sites[Math.floor(Math.random() * sites.length)]; sfx.play(Math.random() < 0.8 ? 'hammer' : 'saw', { x: s.x + s.size / 2, y: s.y + s.size / 2, vol: 0.7 }); }
    buildT = now + 350 + Math.random() * 500;
  }
  if (now > fireT) { // burning buildings crackle
    const burning = G.ents.filter(e => !e.unit && e.built && e.type !== 'mine' && e.hp < e.maxHp / 2 && inView(e) && seen(e.x, e.y));
    if (burning.length) { const b = burning[Math.floor(Math.random() * burning.length)]; sfx.play('fire', { x: b.x + b.size / 2, y: b.y + b.size / 2, vol: b.hp < b.maxHp / 4 ? 1 : 0.6 }); }
    fireT = now + 500 + Math.random() * 400;
  }
  if (now > birdT) { // wildlife & weather when things are quiet
    const quiet = now - lastCombat > 8000;
    const x = tx0 + Math.random() * (tx1 - tx0), y = ty0 + Math.random() * (ty1 - ty0);
    const r = Math.random();
    if (quiet && r < 0.6) sfx.play('bird', { x, y, vol: 0.8 });
    else if (r < 0.8) sfx.play('crow', { x, y, vol: 0.6 });
    else sfx.play('wind', { vol: 0.8 });
    birdT = now + 6000 + Math.random() * 14000;
  }
}
