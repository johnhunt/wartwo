// Tiny synthesized sound effects (WebAudio), no assets needed.
let ac = null, master = null, noiseBuf = null;
export let muted = false;
export function setMuted(m) { muted = m; }
function ctx() {
  if (!ac) {
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
    ac = new AC(); master = ac.createGain(); master.gain.value = 0.25; master.connect(ac.destination);
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ac.state === 'suspended') ac.resume();
  return ac;
}
function tone(freq, dur, type = 'square', vol = 0.3, slide = 0, delay = 0) {
  const a = ctx(); if (!a || muted) return;
  const t = a.currentTime + delay, o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
}
function noise(dur, vol = 0.3, freq = 2000, q = 1, delay = 0) {
  const a = ctx(); if (!a || muted) return;
  const t = a.currentTime + delay, s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  s.buffer = noiseBuf; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f); f.connect(g); g.connect(master); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
}
const last = {};
export function play(name) {
  const now = performance.now(); if (last[name] && now - last[name] < 70) return; last[name] = now;
  switch (name) {
    case 'click': tone(880, 0.04, 'square', 0.12); break;
    case 'ack': tone(330, 0.07, 'triangle', 0.25); tone(495, 0.09, 'triangle', 0.2, 0, 0.07); break;
    case 'select': tone(660, 0.05, 'triangle', 0.2); break;
    case 'sword': noise(0.12, 0.35, 3500, 4); tone(1200 + Math.random() * 400, 0.08, 'square', 0.05); break;
    case 'hit': noise(0.08, 0.3, 900, 2); break;
    case 'bow': noise(0.15, 0.2, 5000, 1); tone(300, 0.1, 'sine', 0.1, 200); break;
    case 'launch': noise(0.3, 0.3, 400, 1); tone(120, 0.25, 'sawtooth', 0.15, -60); break;
    case 'boom': noise(0.5, 0.6, 180, 0.7); tone(70, 0.4, 'sine', 0.4, -40); break;
    case 'chop': noise(0.06, 0.35, 1400, 6); tone(220, 0.04, 'square', 0.08); break;
    case 'build': for (let i = 0; i < 3; i++) { noise(0.05, 0.3, 2200, 5, i * 0.12); } break;
    case 'die': tone(220, 0.35, 'sawtooth', 0.15, -150); break;
    case 'collapse': noise(0.9, 0.5, 250, 0.6); noise(0.6, 0.3, 700, 1, 0.2); break;
    case 'done': tone(523, 0.12, 'triangle', 0.25); tone(659, 0.12, 'triangle', 0.25, 0, 0.12); tone(784, 0.25, 'triangle', 0.25, 0, 0.24); break;
    case 'ready': tone(392, 0.1, 'triangle', 0.25); tone(523, 0.18, 'triangle', 0.25, 0, 0.1); break;
    case 'alert': tone(440, 0.15, 'square', 0.15); tone(349, 0.25, 'square', 0.15, 0, 0.16); break;
    case 'error': tone(160, 0.15, 'square', 0.15); break;
    case 'deposit': tone(990, 0.04, 'sine', 0.06); break;
  }
}
