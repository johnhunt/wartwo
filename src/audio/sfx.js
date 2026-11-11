// Synthesized sound effects. Every sound has random variation (pitch, timing,
// variant) so repeated hits never sound identical, and world sounds are panned
// and attenuated according to where they happen relative to the camera.
import { ac, ctx, bus, noise, brown, setWave } from './core.js';
import { voice } from './voice.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// ---- primitives --------------------------------------------------------------
function chain(dest, pan, vol) {
  const g = ac.createGain(); g.gain.value = vol;
  if (pan) { const p = ac.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); g.connect(p); p.connect(dest); } else g.connect(dest);
  return g;
}
function nz(d, t, { type = 'bandpass', f = 2000, q = 1, dur = 0.1, vol = 0.5, att = 0.001, sweep = 0, buf = null, shape = 'exp' }) {
  const s = ac.createBufferSource(); s.buffer = buf || noise();
  const fl = ac.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
  if (sweep) fl.frequency.exponentialRampToValueAtTime(Math.max(30, f * sweep), t + dur);
  const g = ac.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + att);
  if (shape === 'exp') g.gain.exponentialRampToValueAtTime(0.0008, t + dur); else g.gain.linearRampToValueAtTime(0, t + dur);
  s.connect(fl); fl.connect(g); g.connect(d); s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
}
function tn(d, t, { f = 440, f1 = null, dur = 0.2, vol = 0.4, wave = 'sine', att = 0.002, fall = null, opl = 0 }) {
  const o = ac.createOscillator(); if (opl) setWave(o, opl); else o.type = wave;
  o.frequency.setValueAtTime(f, t); if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(15, f1), t + (fall ?? dur));
  const g = ac.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + att); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  o.connect(g); g.connect(d); o.start(t); o.stop(t + dur + 0.05);
}
// FM metal: inharmonic partials for clangs, anvils, bells
function metal(d, t, { f = 900, ratio = 2.76, idx = 3, dur = 0.5, vol = 0.3 }) {
  const c = ac.createOscillator(), m = ac.createOscillator(), mg = ac.createGain(), g = ac.createGain();
  c.frequency.value = f; m.frequency.value = f * ratio; mg.gain.setValueAtTime(f * idx, t); mg.gain.exponentialRampToValueAtTime(f * 0.05, t + dur);
  m.connect(mg); mg.connect(c.frequency); c.connect(g);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.001); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  g.connect(d); c.start(t); m.start(t); c.stop(t + dur + 0.05); m.stop(t + dur + 0.05);
}

// ---- catalogue ------------------------------------------------------------------
// each entry: (dest, t, opts) => void
const S = {
  // UI
  click: (d, t) => { nz(d, t, { f: 3200, q: 4, dur: 0.03, vol: 0.35 }); tn(d, t, { f: 1500, dur: 0.03, vol: 0.06, wave: 'square' }); },
  select: (d, t) => { nz(d, t, { f: 1800, q: 6, dur: 0.04, vol: 0.25 }); },
  error: (d, t) => { tn(d, t, { f: 140, dur: 0.12, vol: 0.18, wave: 'square' }); tn(d, t + 0.13, { f: 110, dur: 0.16, vol: 0.18, wave: 'square' }); },
  menu: (d, t) => { nz(d, t, { f: 600, q: 0.6, dur: 0.25, vol: 0.18, att: 0.08, sweep: 3 }); },
  place: (d, t) => { tn(d, t, { f: 110, f1: 55, dur: 0.25, vol: 0.5 }); nz(d, t, { type: 'lowpass', f: 700, dur: 0.2, vol: 0.4, buf: brown() }); },

  // melee
  sword: (d, t) => {
    const f = rnd(1100, 1900);
    metal(d, t, { f, ratio: pick([2.76, 3.11, 2.41]), idx: rnd(2, 4), dur: rnd(0.25, 0.45), vol: 0.32 });
    metal(d, t + 0.004, { f: f * 1.47, ratio: 1.73, idx: 2, dur: 0.18, vol: 0.1 });
    nz(d, t, { type: 'highpass', f: 3000, dur: 0.06, vol: 0.35 });
  },
  axe: (d, t) => { nz(d, t, { f: rnd(500, 800), q: 2, dur: 0.12, vol: 0.55 }); metal(d, t + 0.003, { f: rnd(500, 750), ratio: 2.2, idx: 2, dur: 0.22, vol: 0.14 }); tn(d, t, { f: 150, f1: 70, dur: 0.12, vol: 0.4 }); },
  club: (d, t) => { nz(d, t, { type: 'lowpass', f: 900, dur: 0.12, vol: 0.7, buf: brown() }); tn(d, t, { f: 120, f1: 60, dur: 0.15, vol: 0.5 }); },
  hit: (d, t) => { nz(d, t, { f: rnd(700, 1100), q: 1.2, dur: 0.09, vol: 0.5 }); tn(d, t, { f: 180, f1: 90, dur: 0.08, vol: 0.3 }); },
  lance: (d, t) => { nz(d, t, { f: 400, q: 0.7, dur: 0.18, vol: 0.4, att: 0.05, sweep: 3 }); metal(d, t + 0.12, { f: 1300, ratio: 2.9, idx: 2.5, dur: 0.3, vol: 0.2 }); },
  bite: (d, t) => { voice(d, t, { dur: 0.22, f0: [[0, 330], [0.2, 200]], v: [[0, 'a'], [0.2, 'uh']], size: 0.75, rough: 0.8, breath: 0.3, gain: 0.35 }); nz(d, t + 0.05, { f: 1500, q: 2, dur: 0.06, vol: 0.4 }); },

  // missiles
  bow: (d, t) => { tn(d, t, { f: rnd(170, 230), f1: 140, dur: 0.18, vol: 0.5, opl: 1 }); nz(d, t + 0.01, { f: 2500, q: 0.8, dur: 0.22, vol: 0.35, att: 0.04, sweep: 0.4 }); },
  spear: (d, t) => { nz(d, t, { f: 900, q: 0.8, dur: 0.3, vol: 0.35, att: 0.06, sweep: 0.5 }); tn(d, t, { f: 110, dur: 0.1, vol: 0.2 }); },
  arrowHit: (d, t) => { nz(d, t, { f: rnd(1600, 2600), q: 3, dur: 0.04, vol: 0.4 }); tn(d, t, { f: 420, f1: 300, dur: 0.05, vol: 0.12, wave: 'triangle' }); },
  launch: (d, t) => {
    const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(70, t); o.frequency.linearRampToValueAtTime(95, t + 0.25); o.frequency.linearRampToValueAtTime(60, t + 0.4);
    const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 600; f.Q.value = 4; const g = ac.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.25, t + 0.05); g.gain.linearRampToValueAtTime(0, t + 0.4);
    o.connect(f); f.connect(g); g.connect(d); o.start(t); o.stop(t + 0.45); // creak
    tn(d, t + 0.38, { f: 90, f1: 45, dur: 0.3, vol: 0.6 }); nz(d, t + 0.38, { f: 500, q: 0.6, dur: 0.5, vol: 0.35, att: 0.05, sweep: 0.3 });
  },
  boom: (d, t) => {
    nz(d, t, { type: 'lowpass', f: 700, dur: 1.4, vol: 0.5, buf: brown(), sweep: 0.2 });
    tn(d, t, { f: 80, f1: 28, dur: 0.9, vol: 0.45, fall: 0.5 });
    for (let i = 0; i < 9; i++) nz(d, t + 0.08 + Math.random() * 0.6, { f: rnd(1500, 4500), q: 3, dur: 0.03, vol: rnd(0.1, 0.25) }); // debris
  },

  // deaths (formant screams)
  dieHuman: (d, t) => { const p = rnd(260, 360); voice(d, t, { dur: rnd(0.5, 0.75), f0: [[0, p], [0.1, p * 1.15], [0.6, p * 0.55]], v: [[0, 'ae'], [0.15, 'a'], [0.6, 'uh']], size: rnd(0.98, 1.08), breath: 0.15, gain: 0.45, vib: 30, vibR: 9 }); },
  dieWorker: (d, t) => { const p = rnd(220, 290); voice(d, t, { dur: 0.55, f0: [[0, p * 1.2], [0.5, p * 0.6]], v: [[0, 'o'], [0.4, 'uh']], size: 1.05, breath: 0.2, gain: 0.4, vib: 40, vibR: 7 }); },
  dieWoman: (d, t) => { const p = rnd(430, 520); voice(d, t, { dur: rnd(0.55, 0.7), f0: [[0, p], [0.12, p * 1.12], [0.6, p * 0.6]], v: [[0, 'ae'], [0.15, 'a'], [0.55, 'uh']], size: 1.18, breath: 0.15, gain: 0.4, vib: 35, vibR: 9 }); },
  dieOrcess: (d, t) => { const p = rnd(220, 270); voice(d, t, { dur: 0.7, f0: [[0, p * 1.2], [0.6, p * 0.6]], v: [[0, 'a'], [0.6, 'uh']], size: 0.95, rough: 0.6, breath: 0.25, gain: 0.45 }); },
  dieOrc: (d, t) => { const p = rnd(120, 160); voice(d, t, { dur: rnd(0.7, 0.9), f0: [[0, p * 1.3], [0.15, p * 1.4], [0.8, p * 0.5]], v: [[0, 'o'], [0.2, 'aw'], [0.7, 'uh']], size: 0.78, rough: 1, breath: 0.25, gain: 0.55 }); },
  dieHorse: (d, t) => { voice(d, t, { dur: 1.0, f0: [[0, 700], [0.25, 950], [0.7, 520], [1.0, 300]], v: [[0, 'i'], [0.3, 'e'], [0.8, 'a']], size: 1.4, breath: 0.35, gain: 0.35, vib: 120, vibR: 17 }); nz(d, t + 0.6, { type: 'lowpass', f: 400, dur: 0.4, vol: 0.5, buf: brown() }); },
  dieWolf: (d, t) => { voice(d, t, { dur: 0.6, f0: [[0, 800], [0.1, 1000], [0.6, 450]], v: [[0, 'i'], [0.5, 'u']], size: 1.3, breath: 0.3, gain: 0.35, vib: 60, vibR: 11 }); },
  dieSiege: (d, t) => { nz(d, t, { f: 900, q: 1.5, dur: 0.15, vol: 0.7 }); for (let i = 0; i < 6; i++) nz(d, t + 0.1 + i * rnd(0.05, 0.12), { f: rnd(300, 900), q: 3, dur: 0.08, vol: 0.35 }); tn(d, t, { f: 90, f1: 40, dur: 0.4, vol: 0.4 }); },
  collapse: (d, t) => {
    nz(d, t, { type: 'lowpass', f: 400, dur: 2.2, vol: 0.45, buf: brown(), att: 0.1, sweep: 0.4 });
    for (let i = 0; i < 18; i++) nz(d, t + Math.random() * 1.6, { f: rnd(400, 2500), q: 2, dur: rnd(0.04, 0.12), vol: rnd(0.1, 0.35) });
    tn(d, t, { f: 60, f1: 30, dur: 1.5, vol: 0.35, fall: 1.2 });
  },

  // economy
  chop: (d, t) => { nz(d, t, { f: rnd(900, 1400), q: 3, dur: 0.08, vol: 1.0 }); tn(d, t, { f: rnd(300, 380), f1: 200, dur: 0.07, vol: 0.5, wave: 'triangle' }); },
  treeFall: (d, t) => {
    for (let i = 0; i < 5; i++) nz(d, t + i * 0.03, { f: rnd(1500, 3000), q: 4, dur: 0.03, vol: 0.3 }); // crack
    nz(d, t + 0.1, { f: 3000, q: 0.5, dur: 0.9, vol: 0.25, att: 0.3, sweep: 0.5 }); // leaves rushing
    nz(d, t + 0.9, { type: 'lowpass', f: 300, dur: 0.4, vol: 0.7, buf: brown() }); tn(d, t + 0.9, { f: 70, f1: 40, dur: 0.3, vol: 0.4 });
  },
  pick: (d, t) => { metal(d, t, { f: rnd(2300, 2800), ratio: 1.41, idx: 1.5, dur: 0.15, vol: 0.18 }); nz(d, t, { f: 3500, q: 3, dur: 0.03, vol: 0.2 }); },
  mine: (d, t) => { for (let i = 0; i < 3; i++) S.pick(d, t + i * 0.16 + rnd(0, 0.03)); nz(d, t + 0.5, { type: 'lowpass', f: 600, dur: 0.3, vol: 0.3, buf: brown() }); },
  coins: (d, t) => { for (let i = 0; i < 5; i++) metal(d, t + i * rnd(0.03, 0.06), { f: rnd(2600, 4200), ratio: 2.4, idx: 1, dur: 0.25, vol: 0.09 }); },
  logs: (d, t) => { for (let i = 0; i < 3; i++) { tn(d, t + i * 0.09, { f: rnd(180, 260), f1: 120, dur: 0.12, vol: 0.35, wave: 'triangle' }); nz(d, t + i * 0.09, { f: 700, q: 2, dur: 0.06, vol: 0.3 }); } },

  // construction
  hammer: (d, t) => { const f = rnd(1600, 2200); metal(d, t, { f, ratio: 1.6, idx: 1.2, dur: 0.12, vol: 0.12 }); nz(d, t, { f: 1200, q: 2, dur: 0.05, vol: 0.45 }); tn(d, t, { f: 260, f1: 160, dur: 0.06, vol: 0.2, wave: 'triangle' }); },
  saw: (d, t) => { for (let i = 0; i < 4; i++) nz(d, t + i * 0.2, { f: i % 2 ? 2600 : 3400, q: 3, dur: 0.18, vol: 0.18, att: 0.06, shape: 'lin' }); },
  build: (d, t) => { S.place(d, t); S.hammer(d, t + 0.2); S.hammer(d, t + 0.45); },
  anvil: (d, t) => { metal(d, t, { f: 1150, ratio: 2.46, idx: 1.8, dur: 0.9, vol: 0.25 }); metal(d, t + 0.35, { f: 1180, ratio: 2.46, idx: 1.8, dur: 0.9, vol: 0.22 }); },
  bell: (d, t) => { metal(d, t, { f: 523, ratio: 3.5, idx: 2.5, dur: 2.5, vol: 0.2 }); metal(d, t + 0.7, { f: 392, ratio: 3.5, idx: 2.5, dur: 2.5, vol: 0.18 }); },
  fire: (d, t) => { for (let i = 0; i < 6; i++) nz(d, t + Math.random() * 0.5, { f: rnd(1500, 5000), q: 2, dur: 0.02, vol: rnd(0.05, 0.15) }); nz(d, t, { type: 'lowpass', f: 500, dur: 0.6, vol: 0.12, att: 0.2, buf: brown() }); },

  // creatures (building / unit select flavour)
  moo: (d, t) => voice(d, t, { dur: 1.1, f0: [[0, 120], [0.3, 140], [1.0, 105]], v: [[0, 'u'], [0.4, 'o'], [1, 'u']], size: 0.7, breath: 0.15, gain: 0.45, attack: 0.15 }),
  pig: (d, t) => { for (let i = 0; i < 3; i++) voice(d, t + i * 0.16, { dur: 0.12, f0: [[0, 180], [0.1, 140]], v: [[0, 'o'], [0.1, 'uh']], size: 0.9, rough: 1, breath: 0.5, gain: 0.4 }); },
  neigh: (d, t) => { voice(d, t, { dur: 1.1, f0: [[0, 500], [0.15, 900], [0.6, 780], [1.1, 400]], v: [[0, 'i'], [0.3, 'e'], [1.0, 'a']], size: 1.4, breath: 0.3, gain: 0.3, vib: 140, vibR: 16 }); },
  howl: (d, t) => { voice(d, t, { dur: 1.6, f0: [[0, 400], [0.4, 720], [1.2, 680], [1.6, 450]], v: [[0, 'u'], [0.5, 'o'], [1.5, 'u']], size: 1.1, breath: 0.15, gain: 0.32, attack: 0.25, vib: 25, vibR: 5 }); },
  growl: (d, t) => voice(d, t, { dur: 0.6, f0: [[0, 90], [0.6, 80]], v: [[0, 'uh'], [0.6, 'o']], size: 0.75, rough: 1, breath: 0.4, gain: 0.45, attack: 0.1 }),
  creak: (d, t) => { const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(55, t); o.frequency.linearRampToValueAtTime(80, t + 0.5); const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 6; const g = ac.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.3, t + 0.1); g.gain.linearRampToValueAtTime(0, t + 0.55); o.connect(f); f.connect(g); g.connect(d); o.start(t); o.stop(t + 0.6); },
  wardrum: (d, t) => { for (let i = 0; i < 3; i++) { tn(d, t + i * 0.32, { f: 95, f1: 40, dur: 0.6, vol: 0.9, fall: 0.2 }); nz(d, t + i * 0.32, { type: 'lowpass', f: 500, dur: 0.2, vol: 0.4, buf: brown() }); } },
  warhorn: (d, t) => { hornBlast(d, t, 98, 0.7, 0.4); hornBlast(d, t + 0.75, 87, 1.0, 0.4); },
  orchorn: (d, t) => { hornBlast(d, t, 73, 1.2, 0.45, 1); voice(d, t, { dur: 1.2, f0: [[0, 73], [1.2, 70]], v: [[0, 'o'], [1.2, 'u']], size: 0.7, rough: 0.6, gain: 0.2 }); },
  fanfare: (d, t) => { hornBlast(d, t, 392, 0.14, 0.18); hornBlast(d, t + 0.15, 392, 0.14, 0.18); hornBlast(d, t + 0.3, 523, 0.5, 0.2); },
  ready: (d, t) => { hornBlast(d, t, 262, 0.18, 0.16); hornBlast(d, t + 0.2, 392, 0.35, 0.16); },
  done: (d, t) => { hornBlast(d, t, 523, 0.15, 0.14); hornBlast(d, t + 0.15, 659, 0.15, 0.14); hornBlast(d, t + 0.3, 784, 0.45, 0.16); },

  // ambience
  bird: (d, t) => { const b = rnd(2500, 4200); const n = 2 + Math.floor(Math.random() * 4); for (let i = 0; i < n; i++) tn(d, t + i * rnd(0.09, 0.16), { f: b, f1: b * rnd(1.2, 1.5), dur: 0.07, vol: 0.06, fall: 0.06 }); },
  crow: (d, t) => { for (let i = 0; i < 2; i++) voice(d, t + i * 0.35, { dur: 0.22, f0: [[0, 520], [0.2, 420]], v: [[0, 'a'], [0.2, 'aw']], size: 1.35, rough: 0.7, breath: 0.5, gain: 0.15 }); },
  wind: (d, t) => { nz(d, t, { f: 500, q: 1.5, dur: 3.5, vol: 0.08, att: 1.2, sweep: 1.8, shape: 'lin' }); },
};

function hornBlast(d, t, f, dur, vol, rough) {
  const c = ac.createOscillator(), m = ac.createOscillator(), mg = ac.createGain(), g = ac.createGain();
  setWave(c, rough ? 1 : 0); c.frequency.value = f; m.frequency.value = f; mg.gain.setValueAtTime(f * 0.5, t); mg.gain.linearRampToValueAtTime(f * (rough ? 4 : 2.6), t + 0.08);
  m.connect(mg); mg.connect(c.frequency); c.connect(g);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.05); g.gain.setValueAtTime(vol, t + dur - 0.05); g.gain.linearRampToValueAtTime(0, t + dur + 0.08);
  g.connect(d); c.start(t); m.start(t); c.stop(t + dur + 0.1); m.stop(t + dur + 0.1);
}

// ---- playback ---------------------------------------------------------------------
let listener = null; // () => {x, y, halfW, halfH} in tiles
export function setListener(fn) { listener = fn; }
const lastAt = {};
const LIMIT = { chop: 45, hammer: 60, sword: 35, axe: 35, hit: 35, bow: 40, arrowHit: 30, fire: 300, coins: 120, logs: 120 };

// play(name, {x, y, vol, delay}) — x/y in tiles for positional sounds
export function play(name, o = {}) {
  const a = ctx(); if (!a || !S[name]) return;
  const now = performance.now(); const lim = LIMIT[name] ?? 60;
  if (lastAt[name] && now - lastAt[name] < lim) return; lastAt[name] = now;
  let pan = 0, vol = o.vol ?? 1;
  if (o.x !== undefined && listener) {
    const L = listener(); const dx = (o.x - L.x) / L.halfW, dy = (o.y - L.y) / L.halfH;
    const dist = Math.max(Math.abs(dx), Math.abs(dy));
    if (dist > 2.2) return;
    pan = Math.max(-0.85, Math.min(0.85, dx * 0.7));
    vol *= dist <= 1 ? 1 : Math.max(0.15, 1 - (dist - 1) * 0.7);
  }
  const d = chain(bus.sfx, pan, vol);
  S[name](d, a.currentTime + 0.01 + (o.delay || 0));
}
export const names = Object.keys(S);
