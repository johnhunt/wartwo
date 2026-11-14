// Arranger + look-ahead sequencer + jukebox.
import { ac, ctx, bus, whenUnlocked } from './core.js';
import { playNote, DRUM, DRUM_KEYS, PATCH } from './fm.js';
import { SONGS, GROOVES, MODES, PLAYLISTS } from './songs.js';

const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
export function parseNote(s) {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(s); if (!m) throw new Error('bad note ' + s);
  return 12 * (+m[3] + 1) + PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}
function parseBar(str) {
  const out = []; let t = 0;
  for (const tok of str.trim().split(/\s+/)) {
    const [n, l] = tok.split('.'); const len = +l;
    if (n !== 'R') out.push({ t, len, midi: parseNote(n) });
    t += len;
  }
  return { notes: out, len: t };
}

function chordTones(song, tok) {
  const scale = MODES[song.mode], root = PC[song.root[0]] + (song.root[1] === '#' ? 1 : song.root[1] === 'b' ? -1 : 0);
  const deg = parseInt(tok, 10) - 1, q = tok.replace(/^\d/, '');
  const at = (i) => root + scale[i % 7] + 12 * Math.floor(i / 7);
  const r = at(deg);
  let third = at(deg + 2), fifth = at(deg + 4);
  if (q === 'M') { third = r + 4; fifth = r + 7; }
  if (q === 'm') { third = r + 3; fifth = r + 7; }
  if (fifth - r === 6 && !q) fifth = r + 7; // avoid diminished fifths in the drone/bass
  const pcs = q === 'p' ? [r % 12, (r + 7) % 12] : [r % 12, third % 12, fifth % 12];
  return { root: r % 12, third: (q === 'p' ? r + 7 : third) % 12, fifth: fifth % 12, pcs, power: q === 'p' };
}
// lowest midi note >= lo with pitch class pc
const near = (pc, lo) => lo + ((pc - lo) % 12 + 12) % 12;

// ---------------------------------------------------------------- arranger
export function arrange(id) {
  const song = SONGS[id]; const sig = song.sig; const ev = []; let t0 = 0;
  const I = song.inst;
  const P = { lead: 0.05, lead2: -0.1, harm: 0.45, pad: -0.35, bass: 0, arp: 0.5, drone: -0.5, oct: 0.15 }; // OPL3-style stereo seats
  for (let pi = 0; pi < song.order.length; pi++) {
    const [secName, layerStr] = song.order[pi];
    const sec = song.sections[secName], L = new Set(layerStr.split(/\s+/));
    const chords = sec.chords.split(/\s+/);
    sec.mel.forEach((barStr, bi) => {
      const bar = parseBar(barStr);
      if (bar.len !== sig) console.warn(`song ${id} ${secName} bar ${bi + 1} is ${bar.len}/${sig}`);
      const ch = chordTones(song, chords[bi] || '1');
      const T = t0 + bi * sig, last = bi === sec.mel.length - 1;
      const strong = (bi % 2 === 0) ? 1 : 0.88;
      // melody
      for (const n of bar.notes) {
        const vel = (n.t % (sig / (sig === 12 ? 2 : 4)) === 0 ? 1 : 0.85) * strong;
        if (L.has('lead')) ev.push({ t: T + n.t, len: n.len, midi: n.midi, inst: I.lead, vel, pan: P.lead });
        if (L.has('lead2')) ev.push({ t: T + n.t, len: n.len, midi: n.midi + (I.lead2 === 'bell' ? 12 : 0), inst: I.lead2, vel: vel * 0.9, pan: P.lead2 });
        if (L.has('harm')) { // nearest chord tone 3..9 semitones below
          let h = null; for (let d = 3; d <= 9; d++) if (ch.pcs.includes(((n.midi - d) % 12 + 12) % 12)) { h = n.midi - d; break; }
          if (h !== null) ev.push({ t: T + n.t, len: n.len, midi: h, inst: I.harm, vel: vel * 0.6, pan: P.harm });
        }
        if (L.has('oct')) ev.push({ t: T + n.t, len: n.len, midi: n.midi - 12, inst: I.oct, vel: vel * 0.55, pan: P.oct });
      }
      // pad: close triad around G3..F4
      if (L.has('pad')) for (const pc of ch.pcs) ev.push({ t: T, len: sig, midi: near(pc, 55), inst: I.pad, vel: 0.55, pan: P.pad });
      // drone: root + fifth, low
      if (L.has('drone') && bi % 2 === 0) { const r = near(ch.root, 38); ev.push({ t: T, len: sig * 2, midi: r, inst: I.drone, vel: 0.6, pan: P.drone }); ev.push({ t: T, len: sig * 2, midi: r + 7, inst: I.drone, vel: 0.45, pan: P.drone }); }
      // bass
      if (L.has('bass')) {
        const r = near(ch.root, 36), f5 = near(ch.fifth, r);
        const B = (t, len, m, v = 0.9) => ev.push({ t: T + t, len, midi: m, inst: I.bass, vel: v, pan: P.bass });
        switch (song.bassPat) {
          case 'roots': B(0, sig, r); break;
          case 'halves': B(0, 8, r); B(8, 8, last ? r : f5, 0.8); break;
          case 'march': B(0, 4, r); B(4, 4, f5, 0.75); B(8, 4, r, 0.85); B(12, 4, f5 - 12 >= 33 ? f5 - 12 : f5, 0.75); break;
          case 'drive': for (let s = 0; s < 16; s += 2) B(s, 2, s === 12 ? r + 12 : r, s % 4 === 0 ? 0.95 : 0.7); break;
          case 'six': B(0, 6, r); B(6, 6, f5, 0.8); break;
        }
      }
      // arpeggio
      if (L.has('arp')) {
        const base = near(ch.root, 55), tones = [base, near(ch.third, base), near(ch.fifth, base)]; tones.sort((a, b) => a - b);
        const seq = { up8: [0, 1, 2, 3, 2, 1, 0, 1], lute8: [0, 2, 1, 2, 3, 2, 1, 2], pulse8: [0, 0, 2, 0, 0, 2, 1, 2], harp6: [0, 1, 2, 3, 2, 1], jig6: [0, 2, 3, 1, 2, 3] }[song.arpPat];
        const pick = (k) => k === 3 ? tones[0] + 12 : tones[k];
        if (song.arpPat === 'ost16') { for (let s = 0; s < 16; s++) ev.push({ t: T + s, len: 1, midi: [tones[0], tones[2], tones[0] + 12, tones[2]][s % 4], inst: I.arp, vel: s % 4 === 0 ? 0.6 : 0.42, pan: P.arp }); }
        else seq.forEach((k, i) => ev.push({ t: T + i * 2, len: 2, midi: pick(k), inst: I.arp, vel: i === 0 ? 0.7 : 0.5, pan: P.arp }));
      }
      // timpani: downbeat, with a roll into the next section
      if (L.has('timp')) {
        const r = near(ch.root, 38);
        if (last) for (let s = 8; s < sig; s++) ev.push({ t: T + s, len: 1, midi: r, inst: 'timpani', vel: 0.25 + 0.06 * (s - 8), pan: -0.2 });
        else ev.push({ t: T, len: 4, midi: r, inst: 'timpani', vel: 0.8, pan: -0.2 });
      }
      // drums
      if (L.has('drums') || (L.has('fill') && last)) {
        const g = GROOVES[song.drums]; const pat = (L.has('fill') && last) ? g.fill : g.main;
        if (L.has('drums') || last) for (const key in pat) {
          const s = pat[key]; for (let i = 0; i < s.length && i < sig; i++) {
            const c = s[i]; if (c === '.') continue;
            ev.push({ t: T + i, drum: DRUM_KEYS[key], vel: c === 'X' ? 1 : c === 'r' ? 0.5 : 0.72 });
            if (c === 'r') ev.push({ t: T + i + 0.5, drum: DRUM_KEYS[key], vel: 0.45 });
          }
        }
      }
    });
    t0 += sec.mel.length * sig;
  }
  ev.sort((a, b) => a.t - b.t);
  return { id, song, events: ev, length: t0, spb: 60 / song.bpm / 4 };
}

// ---------------------------------------------------------------- player
// The score is not synthesised live. Each few seconds of music are rendered ahead of time on an
// OfflineAudioContext (off the main thread, not in real time) and played back as plain buffers,
// well before they are needed. Playback then costs almost nothing and cannot stutter when the
// game is busy or the device is slow, and it sounds exactly as the live synth did.
const CHUNK = 6, AHEAD = 14, LEAD = 0.02;
class Player {
  constructor(arr, startAt, loops) {
    this.a = arr; this.start = startAt; this.loops = loops; this.done = false; this.c = 0; this.busy = false; this.srcs = new Set();
    this.total = arr.length * arr.spb * loops; this.endAt = Infinity;
    this.out = ac.createGain(); this.out.gain.value = arr.song.gain || 1; this.out.connect(bus.music);
  }
  // notes that begin inside chunk c, as [time within chunk, event]
  notes(c) {
    const { events, length, spb } = this.a, L = length * spb, t0 = c * CHUNK, t1 = Math.min(this.total, t0 + CHUNK), out = [];
    for (let lp = Math.floor(t0 / L); lp < this.loops && lp * L < t1; lp++) for (const e of events) { const t = lp * L + e.t * spb; if (t >= t0 && t < t1) out.push([t - t0, e]); }
    return out;
  }
  pump() {
    if (this.dead || this.busy || this.finished) return;
    const t0 = this.c * CHUNK;
    if (t0 >= this.total) { this.finished = true; this.done = true; this.endAt = this.start + this.total; return; }
    if (this.c > 0 && this.start + t0 > ac.currentTime + AHEAD) return;
    const notes = this.notes(this.c), spb = this.a.spb, c = this.c++;
    if (!notes.length) return;
    let end = CHUNK; for (const [t, e] of notes) end = Math.max(end, t + (e.drum ? 1.6 : e.len * spb + (PATCH[e.inst] || PATCH.organ).r * 4 + 0.1));
    let off;
    try { off = new OfflineAudioContext(2, Math.ceil((end + LEAD) * ac.sampleRate), ac.sampleRate); } catch { this.live(notes, t0); return; }
    for (const [t, e] of notes) { if (e.drum) DRUM[e.drum](off.destination, t + LEAD, e.vel); else playNote(off.destination, t + LEAD, e.midi, e.len * spb * 0.97, e.inst, e.vel, e.pan); }
    this.busy = true;
    off.startRendering().then((buf) => {
      this.busy = false; if (this.dead) return;
      // rendered later than it was due (first chunk, or a very slow device): slide the whole tune back rather than clip it
      const now = ac.currentTime + 0.06; if (this.start + t0 - LEAD < now) this.start = now - t0 + LEAD;
      const s = ac.createBufferSource(); s.buffer = buf; s.connect(this.out); s.start(this.start + t0 - LEAD);
      this.srcs.add(s); s.onended = () => { this.srcs.delete(s); s.disconnect(); };
      this.pump();
    }, () => { this.busy = false; this.live(notes, t0); });
  }
  // fallback for browsers without offline rendering: schedule the chunk's notes directly
  live(notes, t0) {
    const spb = this.a.spb, now = ac.currentTime + 0.05; if (this.start + t0 < now) this.start = now - t0;
    for (const [t, e] of notes) { const at = this.start + t0 + t; if (e.drum) DRUM[e.drum](this.out, at, e.vel); else playNote(this.out, at, e.midi, e.len * spb * 0.97, e.inst, e.vel, e.pan); }
  }
  fadeOut(sec = 1.5) {
    const t = ac.currentTime; this.out.gain.setValueAtTime(this.out.gain.value, t); this.out.gain.linearRampToValueAtTime(0, t + sec); this.done = true; this.dead = true;
    setTimeout(() => { for (const s of this.srcs) { try { s.stop(); } catch { /* not started */ } } this.out.disconnect(); }, sec * 1000 + 200);
  }
}

const cache = {};
const jb = { cur: null, list: [], idx: 0, mode: null, listeners: [], timer: null, after: null };
function arrangement(id) { return cache[id] || (cache[id] = arrange(id)); }

function tick() {
  if (!ac || !jb.cur) return;
  jb.cur.pump();
  if (jb.cur.done && !jb.cur.dead && ac.currentTime > jb.cur.endAt + 1.5) {
    if (jb.after) { const f = jb.after; jb.after = null; f(); }
    else nextInList();
  }
}

function start(id, loops) {
  if (!ctx()) return;
  if (jb.cur && !jb.cur.dead) jb.cur.fadeOut(1.2);
  const a = arrangement(id);
  jb.cur = new Player(a, ac.currentTime + 0.25, loops);
  jb.nowPlaying = a.song.title;
  for (const l of jb.listeners) l(a.song.title);
  jb.cur.pump();
  if (!jb.timer) jb.timer = setInterval(tick, 250);
}
function nextInList() {
  if (!jb.list.length) { jb.cur = null; return; }
  const id = jb.list[jb.idx % jb.list.length]; jb.idx++;
  const s = SONGS[id];
  start(id, s.loop === false ? 1 : 2);
}
function shuffle(a, avoidFirst) {
  const r = a.slice(); for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; }
  if (avoidFirst && r.length > 1 && r[0] === avoidFirst) r.push(r.shift());
  return r;
}

// Public API ------------------------------------------------------------------
export function playlist(name) {
  if (jb.mode === name || !PLAYLISTS[name]) return;
  jb.mode = name; jb.after = null;
  const prev = jb.cur ? jb.cur.a.id : null;
  jb.list = name === 'menu' || name === 'lobby' ? PLAYLISTS[name].slice() : shuffle(PLAYLISTS[name], prev);
  jb.idx = 0;
  whenUnlocked(() => { if (jb.mode === name) nextInList(); });
}
// Play a one-shot (victory / defeat) and then continue with `thenList`.
export function stinger(id, thenList) {
  jb.mode = 'stinger:' + id;
  whenUnlocked(() => {
    start(id, 1);
    jb.after = () => { jb.mode = null; if (thenList) playlist(thenList); };
  });
}
// "Next track": in single-song lists (menu, lobby) step through the whole soundtrack instead
const JUKEBOX = ['title', 'banners', 'highway', 'siege', 'ashbone', 'wardrums', 'burning', 'tavern'];
export function skip() {
  if (jb.list.length <= 1) { const cur = jb.cur ? jb.cur.a.id : 'title'; const i = JUKEBOX.indexOf(cur); jb.list = JUKEBOX.slice(i + 1).concat(JUKEBOX.slice(0, i + 1)); jb.idx = 0; }
  whenUnlocked(nextInList);
}
export function stop() { jb.mode = null; jb.list = []; if (jb.cur && !jb.cur.dead) jb.cur.fadeOut(1); jb.cur = null; }
export function onTrack(fn) { jb.listeners.push(fn); if (jb.nowPlaying) fn(jb.nowPlaying); }
export function nowPlaying() { return jb.nowPlaying || ''; }
