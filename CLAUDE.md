# Wartwo: notes for Claude

## Branch workflow (standing instruction from the owner)
- After **every** change: commit, push the working branch, then **merge it into `public`** and push `public`.
  `public` is the branch GitHub Pages serves, so the owner can try every change straight away.

## Project
- Static browser RTS, no build step: `python3 -m http.server` then open `index.html`.
- The simulation (`src/sim.js`, `src/ai.js`, `src/map.js`) must stay deterministic: integer maths, seeded RNG, no `Math.random`/trig.
  Lockstep multiplayer depends on it. Events emitted for audio/render may carry extra fields freely.
- Unit speech is **pre-rendered** audio in `assets/voice/` (not realtime TTS). Lines live in `src/audio/voice-lines.js`;
  after editing them, re-render with `python tools/render-voices.py` (Kokoro-82M neural TTS, Python 3.10–3.12, ffmpeg with rubberband).
