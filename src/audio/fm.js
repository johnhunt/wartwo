// Two-operator FM voices in the style of the Yamaha OPL2/OPL3 chips found on
// Sound Blaster cards (modulator -> carrier, OPL waveforms, simple ADSR), plus
// a synthesized percussion kit like the OPL "rhythm mode".
import { ac, noise, setWave, mtof } from './core.js';

// cw/mw: carrier/modulator waveform (OPL 0-5); cr/mr: frequency ratios;
// idx: modulation index; ia/id/is: index attack/decay/sustain; a/d/s/r: amplitude envelope;
// fb: extra stacked modulator (approximates OPL feedback); vib: vibrato cents; ens: chorus pair
export const PATCH = {
  brass:   { cw: 0, mw: 0, cr: 1, mr: 1, idx: 2.6, ia: 0.07, id: 0.25, is: 0.6, a: 0.03, d: 0.25, s: 0.8, r: 0.14, fb: 0.45, vib: 7, vibR: 5.2, vibD: 0.25, gain: 0.30 },
  horn:    { cw: 0, mw: 0, cr: 1, mr: 1, idx: 1.7, ia: 0.09, id: 0.3, is: 0.7, a: 0.05, d: 0.3, s: 0.85, r: 0.18, fb: 0.3, vib: 5, vibR: 5, vibD: 0.3, gain: 0.30 },
  strings: { cw: 0, mw: 0, cr: 1, mr: 1, idx: 1.5, ia: 0.2, id: 0.4, is: 0.85, a: 0.16, d: 0.4, s: 0.9, r: 0.35, vib: 13, vibR: 5.6, vibD: 0.15, ens: 7, gain: 0.17 },
  flute:   { cw: 0, mw: 0, cr: 1, mr: 1, idx: 0.55, ia: 0.03, id: 0.2, is: 0.6, a: 0.035, d: 0.2, s: 0.85, r: 0.08, vib: 11, vibR: 5.4, vibD: 0.2, breath: 0.05, gain: 0.30 },
  recorder:{ cw: 0, mw: 0, cr: 1, mr: 2, idx: 0.35, ia: 0.02, id: 0.1, is: 0.7, a: 0.02, d: 0.1, s: 0.9, r: 0.05, vib: 6, vibR: 5, vibD: 0.25, breath: 0.07, gain: 0.30 },
  shawm:   { cw: 1, mw: 0, cr: 1, mr: 1, idx: 2.3, ia: 0.03, id: 0.2, is: 0.8, a: 0.025, d: 0.2, s: 0.9, r: 0.08, fb: 0.7, vib: 14, vibR: 6, vibD: 0.2, gain: 0.19 },
  fiddle:  { cw: 1, mw: 0, cr: 1, mr: 1, idx: 1.9, ia: 0.04, id: 0.2, is: 0.75, a: 0.025, d: 0.15, s: 0.85, r: 0.08, fb: 0.35, vib: 12, vibR: 6.2, vibD: 0.12, gain: 0.20 },
  harp:    { cw: 0, mw: 0, cr: 1, mr: 1, idx: 2.4, ia: 0.0, id: 0.35, is: 0.03, a: 0.002, d: 1.4, s: 0, r: 0.6, gain: 0.30 },
  lute:    { cw: 0, mw: 0, cr: 1, mr: 3, idx: 1.5, ia: 0.0, id: 0.12, is: 0.0, a: 0.002, d: 0.7, s: 0, r: 0.25, gain: 0.28 },
  harpsi:  { cw: 2, mw: 0, cr: 1, mr: 4, idx: 1.9, ia: 0.0, id: 0.2, is: 0.15, a: 0.001, d: 0.9, s: 0, r: 0.15, gain: 0.16 },
  organ:   { cw: 0, mw: 0, cr: 1, mr: 2, idx: 0.8, ia: 0.0, id: 1, is: 1, a: 0.04, d: 0.2, s: 1, r: 0.12, vib: 3, vibR: 6, vibD: 0, gain: 0.15 },
  hurdy:   { cw: 1, mw: 0, cr: 1, mr: 1, idx: 1.6, ia: 0.05, id: 0.3, is: 0.9, a: 0.08, d: 0.3, s: 1, r: 0.2, fb: 0.5, gain: 0.12 },
  choir:   { cw: 0, mw: 0, cr: 1, mr: 1, idx: 0.9, ia: 0.3, id: 0.5, is: 0.8, a: 0.35, d: 0.5, s: 0.9, r: 0.6, vib: 16, vibR: 4.8, vibD: 0.3, ens: 9, gain: 0.17 },
  bass:    { cw: 0, mw: 0, cr: 1, mr: 1, idx: 2.0, ia: 0.0, id: 0.25, is: 0.45, a: 0.01, d: 0.4, s: 0.75, r: 0.1, gain: 0.36 },
  pizz:    { cw: 0, mw: 0, cr: 1, mr: 1, idx: 2.6, ia: 0.0, id: 0.15, is: 0.0, a: 0.002, d: 0.45, s: 0, r: 0.12, gain: 0.38 },
  lowbrass:{ cw: 1, mw: 0, cr: 1, mr: 1, idx: 2.8, ia: 0.05, id: 0.25, is: 0.65, a: 0.04, d: 0.3, s: 0.8, r: 0.16, fb: 0.9, vib: 5, vibR: 5, vibD: 0.3, gain: 0.26 },
  bell:    { cw: 0, mw: 0, cr: 1, mr: 3.5, idx: 3.2, ia: 0.0, id: 1.2, is: 0.0, a: 0.001, d: 2.6, s: 0, r: 1.2, gain: 0.13 },
  timpani: { cw: 0, mw: 0, cr: 1, mr: 1.58, idx: 1.8, ia: 0.0, id: 0.25, is: 0.0, a: 0.002, d: 1.1, s: 0, r: 0.7, drop: 0.6, gain: 0.55 },
};

function env(param, t, peak, a, d, s, r, tOff) {
  param.setValueAtTime(0, t);
  param.linearRampToValueAtTime(peak, t + Math.max(0.001, a));
  if (s < 1) param.setTargetAtTime(peak * s, t + a, Math.max(0.005, d / 3));
  param.setTargetAtTime(0, Math.max(tOff, t + a), Math.max(0.005, r / 3));
}

export function playNote(dest, t, midi, dur, name, vel = 1, pan = 0) {
  const p = PATCH[name] || PATCH.organ;
  const f = mtof(midi), tOff = t + dur, end = tOff + p.r * 4 + 0.05;
  const out = ac.createGain(); out.gain.value = p.gain * vel;
  let tail = out;
  if (pan) { const pn = ac.createStereoPanner(); pn.pan.value = pan; out.connect(pn); tail = pn; }
  tail.connect(dest);
  const amp = ac.createGain(); amp.connect(out);
  env(amp.gain, t, 1, p.a, p.d, p.s, p.r, tOff);

  // Modulation depth envelope, shared by every operator pair of this note.
  const dev = p.idx * f * p.mr * (0.75 + 0.25 * vel);
  const depth = ac.createGain(); depth.gain.value = 0;
  if (p.ia > 0) { depth.gain.setValueAtTime(dev * 0.25, t); depth.gain.linearRampToValueAtTime(dev, t + p.ia); }
  else depth.gain.setValueAtTime(dev, t);
  depth.gain.setTargetAtTime(dev * p.is, t + p.ia, Math.max(0.01, p.id / 3));
  // Self-modulated ("feedback") and half-sine modulators produce a DC offset, which would shift
  // the carrier off pitch and make every partial inharmonic (a clangy, ring-modulated sound).
  // A gentle high-pass on the modulation path removes it.
  const dcBlock = ac.createBiquadFilter(); dcBlock.type = 'highpass'; dcBlock.frequency.value = Math.min(20, f * p.mr * 0.25); dcBlock.Q.value = 0.5;
  dcBlock.connect(depth);
  const oscs = [], detunable = [];
  // Each carrier gets its own modulator with the same detune, so the frequency ratio stays exact.
  const mkPair = (cents) => {
    const m = ac.createOscillator(); setWave(m, p.mw); m.frequency.value = f * p.mr; m.detune.value = cents;
    const mg = ac.createGain(); mg.gain.value = p.ens ? 0.5 : 1; m.connect(mg); mg.connect(dcBlock); // chorus pairs share the depth
    oscs.push(m); detunable.push(m);
    if (p.fb) {
      const m2 = ac.createOscillator(); m2.frequency.value = f * p.mr; m2.detune.value = cents;
      const g2 = ac.createGain(); g2.gain.value = p.fb * f * p.mr; m2.connect(g2); g2.connect(m.frequency);
      oscs.push(m2); detunable.push(m2);
    }
    const c = ac.createOscillator(); setWave(c, p.cw); c.frequency.value = f * p.cr; c.detune.value = cents;
    if (p.drop) { c.frequency.setValueAtTime(f * p.cr * Math.pow(2, p.drop / 12), t); c.frequency.exponentialRampToValueAtTime(f * p.cr, t + 0.12); }
    c.connect(amp); oscs.push(c); detunable.push(c);
    return c;
  };
  const carriers = p.ens ? [mkPair(-p.ens), mkPair(p.ens)] : [mkPair(0)];
  if (p.ens) out.gain.value *= 0.7;
  for (const c of carriers) depth.connect(c.frequency);
  if (p.vib) { // vibrato moves carriers and modulators together, keeping the spectrum harmonic
    const lfo = ac.createOscillator(); lfo.frequency.value = p.vibR;
    const lg = ac.createGain(); lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(p.vib, t + (p.vibD || 0) + 0.15);
    lfo.connect(lg); for (const o of detunable) lg.connect(o.detune); oscs.push(lfo);
  }
  if (p.breath) {
    const n = ac.createBufferSource(); n.buffer = noise(); n.loop = true;
    const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = Math.min(9000, f * 2); bp.Q.value = 2;
    const ng = ac.createGain(); ng.gain.setValueAtTime(0, t); ng.gain.linearRampToValueAtTime(p.breath * 3, t + 0.02); ng.gain.setTargetAtTime(p.breath, t + 0.03, 0.05); ng.gain.setTargetAtTime(0, tOff, 0.03);
    n.connect(bp); bp.connect(ng); ng.connect(out); n.start(t, Math.random()); n.stop(end);
  }
  for (const o of oscs) { o.start(t); o.stop(end); }
}

// ---- percussion -------------------------------------------------------------
function noiseHit(dest, t, { type = 'bandpass', freq = 2000, q = 1, dur = 0.1, vol = 0.5, attack = 0.001, pan = 0, sweep = 0 }) {
  const s = ac.createBufferSource(); s.buffer = noise();
  const f = ac.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
  if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq * sweep), t + dur);
  const g = ac.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  s.connect(f); f.connect(g);
  if (pan) { const p = ac.createStereoPanner(); p.pan.value = pan; g.connect(p); p.connect(dest); } else g.connect(dest);
  s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
}
function toneHit(dest, t, { f0 = 150, f1 = 50, dur = 0.3, vol = 0.8, wave = 'sine', fall = 0.08, pan = 0 }) {
  const o = ac.createOscillator(); o.type = wave; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + fall);
  const g = ac.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.003); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  o.connect(g);
  if (pan) { const p = ac.createStereoPanner(); p.pan.value = pan; g.connect(p); p.connect(dest); } else g.connect(dest);
  o.start(t); o.stop(t + dur + 0.05);
}

export const DRUM = {
  // field bass drum (kingdom) / great war drum (warband)
  kick: (d, t, v) => { toneHit(d, t, { f0: 130, f1: 48, dur: 0.35, vol: 0.9 * v }); noiseHit(d, t, { type: 'lowpass', freq: 900, dur: 0.04, vol: 0.3 * v }); },
  war: (d, t, v) => { toneHit(d, t, { f0: 95, f1: 38, dur: 0.7, vol: 1.0 * v, fall: 0.2 }); noiseHit(d, t, { type: 'lowpass', freq: 400, dur: 0.25, vol: 0.5 * v, sweep: 0.5 }); },
  // tabor: a medieval snare drum with a gut snare
  tabor: (d, t, v) => { noiseHit(d, t, { freq: 2200, q: 0.9, dur: 0.12, vol: 0.45 * v, pan: -0.15 }); toneHit(d, t, { f0: 260, f1: 180, dur: 0.07, vol: 0.25 * v, wave: 'triangle', pan: -0.15 }); },
  clap: (d, t, v) => { for (let i = 0; i < 3; i++) noiseHit(d, t + i * 0.011, { freq: 1300, q: 1.4, dur: 0.06, vol: 0.4 * v }); noiseHit(d, t + 0.03, { freq: 1100, q: 1, dur: 0.18, vol: 0.25 * v }); },
  tomlo: (d, t, v) => { toneHit(d, t, { f0: 140, f1: 85, dur: 0.45, vol: 0.75 * v, fall: 0.15, pan: 0.25 }); noiseHit(d, t, { type: 'lowpass', freq: 600, dur: 0.06, vol: 0.2 * v, pan: 0.25 }); },
  tomhi: (d, t, v) => { toneHit(d, t, { f0: 210, f1: 140, dur: 0.32, vol: 0.6 * v, fall: 0.12, pan: -0.3 }); noiseHit(d, t, { type: 'lowpass', freq: 900, dur: 0.05, vol: 0.18 * v, pan: -0.3 }); },
  tamb: (d, t, v) => { noiseHit(d, t, { type: 'highpass', freq: 7000, dur: 0.11, vol: 0.22 * v, pan: 0.4 }); for (const f of [5200, 6900, 8400]) toneHit(d, t, { f0: f, f1: f, dur: 0.09, vol: 0.02 * v, wave: 'square', fall: 0.05, pan: 0.4 }); },
  hat: (d, t, v) => noiseHit(d, t, { type: 'highpass', freq: 8000, dur: 0.05, vol: 0.18 * v, pan: 0.3 }),
  cymbal: (d, t, v) => noiseHit(d, t, { type: 'highpass', freq: 5000, dur: 1.4, vol: 0.22 * v, attack: 0.004 }),
  bodhran: (d, t, v) => { toneHit(d, t, { f0: 110, f1: 70, dur: 0.22, vol: 0.7 * v, fall: 0.06 }); noiseHit(d, t, { freq: 450, q: 1.2, dur: 0.08, vol: 0.25 * v }); },
  bones: (d, t, v) => { noiseHit(d, t, { freq: 3200, q: 6, dur: 0.035, vol: 0.4 * v, pan: -0.4 }); },
  anvil: (d, t, v) => { for (const [f, g] of [[1150, 0.18], [2830, 0.1], [4100, 0.06]]) toneHit(d, t, { f0: f, f1: f, dur: 0.6, vol: g * v, fall: 0.1 }); },
};
export const DRUM_KEYS = { k: 'kick', K: 'war', s: 'tabor', c: 'clap', t: 'tomlo', T: 'tomhi', h: 'tamb', x: 'hat', y: 'cymbal', b: 'bodhran', o: 'bones', a: 'anvil' };
