// Tiny formant synthesizer (glottal sawtooth -> three resonant formant filters).
// Used for battle cries, death screams, animal noises and the retro "babble" speech mode.
import { ac, noise } from './core.js';

export const VOWELS = {
  a: [730, 1090, 2440], e: [530, 1840, 2480], i: [290, 2250, 2900], o: [570, 840, 2410], u: [320, 870, 2240],
  ae: [660, 1720, 2410], uh: [560, 1190, 2390], er: [490, 1350, 1690], aw: [640, 1000, 2400],
};
const FG = [1, 0.55, 0.28]; // formant gains

// opts: { f0: [[t,hz],...], v: [[t,'a'],...], dur, size (formant scale), rough, breath, gain, pan, curve }
export function voice(dest, t, o) {
  const dur = o.dur, size = o.size || 1, end = t + dur;
  const out = ac.createGain(); out.gain.value = 0;
  out.gain.setValueAtTime(0, t); out.gain.linearRampToValueAtTime(o.gain ?? 0.5, t + (o.attack ?? 0.02));
  out.gain.setTargetAtTime(0, end - (o.release ?? 0.08), (o.release ?? 0.08) / 3);
  let tail = out;
  if (o.pan) { const p = ac.createStereoPanner(); p.pan.value = o.pan; out.connect(p); tail = p; }
  tail.connect(dest);
  const src = ac.createGain(); src.gain.value = 1;
  const osc = ac.createOscillator(); osc.type = 'sawtooth';
  const f0 = o.f0 || [[0, 140]];
  osc.frequency.setValueAtTime(f0[0][1], t); for (const [dt, hz] of f0.slice(1)) osc.frequency.linearRampToValueAtTime(hz, t + dt);
  const oscs = [osc]; osc.connect(src);
  if (o.vib) { const l = ac.createOscillator(); l.frequency.value = o.vibR || 6; const lg = ac.createGain(); lg.gain.value = o.vib; l.connect(lg); lg.connect(osc.detune); oscs.push(l); }
  if (o.rough) { // growl: subharmonic + noisy amplitude modulation
    const sub = ac.createOscillator(); sub.type = 'sawtooth'; sub.frequency.setValueAtTime(f0[0][1] / 2, t);
    for (const [dt, hz] of f0.slice(1)) sub.frequency.linearRampToValueAtTime(hz / 2, t + dt);
    const sg = ac.createGain(); sg.gain.value = o.rough * 0.8; sub.connect(sg); sg.connect(src); oscs.push(sub);
    const am = ac.createOscillator(); am.type = 'square'; am.frequency.value = 23 + Math.random() * 12;
    const ag = ac.createGain(); ag.gain.value = o.rough * 0.35; am.connect(ag); ag.connect(src.gain); oscs.push(am);
  }
  if (o.breath) {
    const n = ac.createBufferSource(); n.buffer = noise(); const ng = ac.createGain(); ng.gain.value = o.breath;
    n.connect(ng); ng.connect(src); n.start(t, Math.random()); n.stop(end + 0.1);
  }
  const vs = o.v || [[0, 'a']];
  for (let k = 0; k < 3; k++) {
    const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = [7, 9, 11][k];
    const v0 = VOWELS[vs[0][1]];
    bp.frequency.setValueAtTime(v0[k] * size, t);
    for (const [dt, name] of vs.slice(1)) bp.frequency.linearRampToValueAtTime(VOWELS[name][k] * size, t + dt);
    const g = ac.createGain(); g.gain.value = FG[k] * 4;
    src.connect(bp); bp.connect(g); g.connect(out);
  }
  for (const s of oscs) { s.start(t); s.stop(end + 0.15); }
}

// "Babble" speech: turns a line of text into syllables with consonant clicks and
// a pitch contour (falling for statements, rising for questions), like the
// garbled voices of early sound-card games. prof: {pitch, size, rate, rough}
const VOW_FOR = { a: 'a', e: 'e', i: 'i', o: 'o', u: 'u', y: 'i' };
export function babble(dest, text, prof, t0) {
  const words = text.toLowerCase().replace(/[^a-z' ?!.,]/g, '').split(/\s+/).filter(Boolean);
  const q = /\?\s*$/.test(text), ex = /!\s*$/.test(text);
  const syl = []; for (const w of words) { const m = w.match(/[aeiouy]+/g) || ['a']; m.forEach((v, i) => syl.push({ v: VOW_FOR[v[0]] || 'uh', c: w[0], end: i === m.length - 1 })); }
  let t = t0; const n = syl.length, rate = prof.rate || 1;
  syl.forEach((s, i) => {
    const pos = i / Math.max(1, n - 1);
    let p = prof.pitch * (1.1 - 0.25 * pos); if (q && i >= n - 2) p *= 1.3; if (ex && i === 0) p *= 1.2;
    const d = (0.11 + (s.end ? 0.05 : 0)) / rate;
    if ('ptkbdgcq'.includes(s.c)) noiseClick(dest, t, 0.018, 2500 * prof.size, 0.18);
    else if ('sfzhx'.includes(s.c)) noiseClick(dest, t, 0.05, 5000 * prof.size, 0.08);
    const nxt = syl[i + 1] ? syl[i + 1].v : 'uh';
    voice(dest, t + 0.012, { dur: d, f0: [[0, p], [d, p * 0.93]], v: [[0, s.v], [d, s.end ? 'uh' : nxt]], size: prof.size, rough: prof.rough, breath: 0.04, gain: 0.32, attack: 0.012, release: 0.03 });
    t += d + (s.end ? 0.035 / rate : 0.008);
  });
  return t - t0;
}
function noiseClick(dest, t, dur, f, vol) {
  const s = ac.createBufferSource(); s.buffer = noise(); const b = ac.createBiquadFilter(); b.type = 'bandpass'; b.frequency.value = f; b.Q.value = 1.5;
  const g = ac.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(b); b.connect(g); g.connect(dest); s.start(t, Math.random()); s.stop(t + dur + 0.02);
}
