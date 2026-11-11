// Unit and narrator speech, Warcraft-2 style: every line is a pre-rendered
// recording in assets/voice/ (made offline with a neural TTS voice per unit by
// tools/render-voices.py). Lines are fetched and decoded on demand, cached, and
// a new line cuts off the previous one, just like the classic games.
import { ac, ctx, bus, settings } from './core.js';
import { LINES } from './voice-lines.js';

const BASE = new URL('../../assets/voice/', import.meta.url);
const cache = new Map();   // path -> Promise<AudioBuffer|null>
function clip(f, role, kind, i) {
  const path = `${'kw'[f]}/${role}_${kind}_${i}.mp3`;
  if (!cache.has(path)) {
    cache.set(path, fetch(new URL(path, BASE)).then(r => (r.ok ? r.arrayBuffer() : Promise.reject(r.status)))
      .then(b => new Promise((res, rej) => ctx().decodeAudioData(b, res, rej)))
      .catch(() => null));
  }
  return cache.get(path);
}
// Warm the cache for the factions in play so the first click answers instantly.
export function preload(factions) {
  if (!ctx()) return;
  for (const f of factions) for (const role in LINES[f]) for (const kind in LINES[f][role]) LINES[f][role][kind].forEach((_, i) => clip(f, role, kind, i));
}

let current = null, currentNarr = false, currentEnd = 0, seq = 0;
const lastPick = {};
function choose(key, n) { let i = Math.floor(Math.random() * n); if (n > 1 && lastPick[key] === i) i = (i + 1) % n; lastPick[key] = i; return i; }

async function say(f, role, kind, i, narrator) {
  if (settings.voiceMode === 'off') return;
  const a = ctx(); if (!a) return;
  if (!narrator && currentNarr && a.currentTime < currentEnd) return; // never talk over the narrator
  const my = ++seq;
  const buf = await clip(f, role, kind, i);
  if (!buf || my !== seq) return; // a newer line was requested while this one loaded
  if (current) { try { current.stop(); } catch { /* already ended */ } }
  const src = a.createBufferSource(); src.buffer = buf; src.connect(bus.speech); src.start();
  current = src; currentNarr = !!narrator; currentEnd = a.currentTime + buf.duration;
}
function line(f, role, kind, narrator) {
  const arr = LINES[f][role] && LINES[f][role][kind]; if (!arr || !arr.length) return false;
  say(f, role, kind, choose(f + role + kind, arr.length), narrator); return true;
}

// --------------------------------------------------------------------------- game-facing API
const ROLE = (type) => (LINES[0][type] ? type : 'soldier');
let clickId = 0, clickN = 0, clickT = 0, annoyIdx = {};

// player selected a unit (id) of given type/faction
export function select(type, f, id) {
  const now = performance.now(), role = ROLE(type);
  if (id === clickId && now - clickT < 1500) clickN++; else clickN = 1;
  clickId = id; clickT = now;
  const L = LINES[f][role];
  if (clickN >= 4 && L.annoyed) {
    const k = f + role; const i = (annoyIdx[k] = ((annoyIdx[k] ?? -1) + 1)) % L.annoyed.length;
    say(f, role, 'annoyed', i);
  } else line(f, role, 'select');
}
// player gave an order: kind = 'ack' | 'attack' | 'work' | 'build'
export function order(type, f, kind) {
  const role = ROLE(type); if (!line(f, role, kind)) line(f, role, 'ack');
}
export function unitLine(type, f, kind) { line(f, ROLE(type), kind); }
let narrT = {};
export function narrate(f, key, minGapMs = 4000) {
  const now = performance.now(); if (narrT[key] && now - narrT[key] < minGapMs) return; narrT[key] = now;
  line(f, 'narrator', key, true);
}
export function stopAll() { seq++; if (current) { try { current.stop(); } catch { /* ended */ } current = null; } }
export function preview(f) { say(f, 'narrator', 'welcome', 0, true); }
