// Shared audio plumbing: one AudioContext, three buses (music / sfx / speech),
// persistent settings, and the "Sound Blaster" output colouring.
const store = {
  get(k, d) { try { const v = localStorage.getItem('wartwo.audio.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('wartwo.audio.' + k, JSON.stringify(v)); } catch { /* ignore */ } },
};

export const settings = {
  music: store.get('music', 0.6),     // 0..1
  sfx: store.get('sfx', 0.8),
  speech: store.get('speech', 0.9),
  voiceMode: store.get('voiceMode', 'voices'), // 'voices' | 'retro' | 'off'
};
export function setSetting(k, v) { settings[k] = v; store.set(k, v); applyVolumes(); }

export let ac = null;
export const bus = {};
let unlocked = false;
const onUnlock = [];

// freeze every sound (music included) while the game is paused
let held = false;
export function holdAudio(on) { held = on; if (ac) { if (on) ac.suspend(); else ac.resume(); } }

export function whenUnlocked(fn) { if (unlocked) fn(); else onUnlock.push(fn); }

export function ctx() {
  if (ac) { if (ac.state === 'suspended' && !held) ac.resume(); return ac; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  // phones get a slightly larger output buffer: far fewer crackles for a few ms of extra latency
  ac = new AC({ latencyHint: window.matchMedia?.('(pointer: coarse)').matches ? 'balanced' : 'interactive' });
  const master = ac.createGain(); master.gain.value = 0.9;
  // gentle limiter so stacked battle sounds never clip harshly
  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -10; comp.knee.value = 8; comp.ratio.value = 6; comp.attack.value = 0.004; comp.release.value = 0.15;
  master.connect(comp); comp.connect(ac.destination);
  // The music bus gets the 90s sound card character: band-limited around ~11 kHz
  // and a touch of DAC grit.
  bus.music = ac.createGain();
  const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 9500; lp.Q.value = 0.5;
  const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 35;
  const grit = ac.createWaveShaper(); grit.curve = stepCurve(1024); grit.oversample = 'none';
  bus.music.connect(hp); hp.connect(lp); lp.connect(grit); grit.connect(master);
  bus.master = master;
  bus.sfx = ac.createGain(); bus.sfx.connect(master);
  bus.speech = ac.createGain(); bus.speech.connect(master);
  applyVolumes();
  return ac;
}

function stepCurve(levels) {
  const n = 4096, c = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; c[i] = Math.round(Math.tanh(x * 1.15) * levels / 2) / (levels / 2); }
  return c;
}

export function applyVolumes() {
  if (!ac) return;
  const t = ac.currentTime;
  bus.music.gain.setTargetAtTime(settings.music * settings.music * 1.25, t, 0.05);
  bus.sfx.gain.setTargetAtTime(settings.sfx * settings.sfx * 0.9, t, 0.05);
  bus.speech.gain.setTargetAtTime(settings.speech * settings.speech, t, 0.05);
}

// Browsers only allow audio after a user gesture.
function unlock() {
  if (unlocked) return;
  const a = ctx(); if (!a) return;
  // play a silent buffer (needed on iOS Safari)
  const b = a.createBuffer(1, 1, 22050), s = a.createBufferSource(); s.buffer = b; s.connect(a.destination); s.start(0);
  unlocked = true;
  for (const fn of onUnlock.splice(0)) { try { fn(); } catch (e) { console.error(e); } }
}
for (const ev of ['pointerdown', 'keydown', 'touchend']) window.addEventListener(ev, unlock, { capture: true });

// ---- shared sources ----------------------------------------------------------
let noiseBuf = null, brownBuf = null;
export function noise() {
  if (!noiseBuf) {
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}
export function brown() {
  if (!brownBuf) {
    brownBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const d = brownBuf.getChannelData(0); let v = 0;
    for (let i = 0; i < d.length; i++) { v = (v + (Math.random() * 2 - 1) * 0.04) * 0.995; d[i] = v * 6; }
  }
  return brownBuf;
}

// OPL2/OPL3 operator waveforms, built as PeriodicWaves from their Fourier series.
// The Fourier coefficients are shared; the PeriodicWave itself belongs to one context (live or offline).
const coef = {}, waves = new WeakMap();
export function oplWave(n, cx = ac) {
  if (!n) return null; // 0 = plain sine
  let per = waves.get(cx); if (!per) waves.set(cx, per = {});
  if (per[n]) return per[n];
  if (coef[n]) return (per[n] = cx.createPeriodicWave(coef[n][0], coef[n][1]));
  const N = 2048, H = 48, samp = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const s = Math.sin(2 * Math.PI * i / N), ph = i / N;
    samp[i] = n === 1 ? Math.max(0, s)                       // half-sine
      : n === 2 ? Math.abs(s)                                // abs-sine
        : n === 3 ? ((ph % 0.5) < 0.25 ? Math.abs(s) : 0)    // quarter / pulse-sine
          : n === 4 ? (ph < 0.5 ? Math.sin(4 * Math.PI * ph) : 0) // OPL3 "alternating"
            : n === 5 ? (s >= 0 ? 1 : -1) * 0.8              // OPL3 square
              : s;
  }
  let mean = 0; for (const v of samp) mean += v; mean /= N;
  const re = new Float32Array(H), im = new Float32Array(H);
  for (let k = 1; k < H; k++) {
    let a = 0, b = 0;
    for (let i = 0; i < N; i++) { const w = 2 * Math.PI * k * i / N; a += (samp[i] - mean) * Math.cos(w); b += (samp[i] - mean) * Math.sin(w); }
    re[k] = a / N; im[k] = b / N;
  }
  coef[n] = [re, im];
  return (per[n] = cx.createPeriodicWave(re, im));
}
export function setWave(osc, n) { const w = oplWave(n, osc.context); if (w) osc.setPeriodicWave(w); else osc.type = 'sine'; }

export const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
