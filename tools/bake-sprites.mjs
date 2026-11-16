#!/usr/bin/env node
// Pre-renders every unit frame and building into assets/sprites.bin.gz so the game starts instantly
// instead of ray-tracing its art in the browser (minutes of CPU on a phone).
//
//   node tools/bake-sprites.mjs
//
// Run it after changing anything in src/palette.js, r3d.js, img.js, units.js, buildings.js or sprites.js.
// The game checks a hash of those files against the pack and ignores a stale pack, so forgetting to
// re-bake never shows wrong art; it only makes start-up slow again. Needs the `playwright` package.
import http from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createRequire } from 'node:module';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = createRequire(import.meta.url)('playwright');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mp3': 'audio/mpeg', '.gz': 'application/octet-stream' };
const BAKE_PAGE = `<!doctype html><script type="module">
  import { bakeAll } from '/src/sprites.js';
  const bytes = await bakeAll(); let s = ''; for (let i = 0; i < bytes.length; i += 32768) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 32768));
  window.__pack = btoa(s);
</script>`;
const server = http.createServer(async (req, res) => {
  try {
    if (req.url === '/__bake') { res.writeHead(200, { 'content-type': 'text/html' }); res.end(BAKE_PAGE); return; }
    const file = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!file.startsWith(root)) throw new Error('outside root');
    res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' }); res.end(await readFile(file));
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  page.on('pageerror', e => console.error('page error:', e.message));
  page.on('console', m => { if (m.type() === 'error') console.error('console:', m.text()); });
  await page.goto(base + '/__bake');
  console.log('rendering (this takes a few minutes)...');
  await page.waitForFunction(() => window.__pack, null, { timeout: 30 * 60 * 1000, polling: 1000 });
  const raw = Buffer.from(await page.evaluate(() => window.__pack), 'base64'), gz = gzipSync(raw, { level: 9 });
  await writeFile(path.join(root, 'assets', 'sprites.bin.gz'), gz);
  const n = raw.readUInt32LE(0), head = JSON.parse(raw.subarray(4, 4 + n).toString());
  console.log(`baked ${head.items.length} images, version ${head.version}: ${(raw.length / 1e6).toFixed(1)} MB raw, ${(gz.length / 1024).toFixed(0)} KB packed`);
} finally { await browser.close(); server.close(); }
