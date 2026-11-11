// Prints every voice line as JSON for tools/render-voices.py
import { LINES } from '../src/audio/voice-lines.js';
const out = [];
for (const f of [0, 1]) for (const role in LINES[f]) for (const kind in LINES[f][role]) LINES[f][role][kind].forEach((text, i) => out.push({ f, role, kind, i, text }));
console.log(JSON.stringify(out));
