// Terrain art: the ground is painted per pixel from the tile map so that grass,
// dirt, sand and water blend along ragged, organic borders instead of tile edges.
import { c, R, SHADOW } from './palette.js';
import { Img } from './img.js';
import { render, sph, fru, cap, mat, hash2, TEX } from './r3d.js';
import { boulder } from './buildings.js';
import { rng, T_GRASS, T_FOREST, T_WATER, T_ROCK, T_DIRT, T_STUMP } from './map.js';

// ------------------------------------------------------------------ tileable noise
const NS = 256;
function makeNoise(seed, cells) { // value noise, tiles at 256px
  const r = rng(seed), g = new Float32Array(cells * cells); for (let i = 0; i < g.length; i++) g[i] = r.int(10000) / 10000;
  const out = new Float32Array(NS * NS), cs = NS / cells;
  for (let y = 0; y < NS; y++) for (let x = 0; x < NS; x++) {
    const fx = x / cs, fy = y / cs, ix = Math.floor(fx), iy = Math.floor(fy); let tx = fx - ix, ty = fy - iy;
    tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
    const a = g[(iy % cells) * cells + ix % cells], b = g[(iy % cells) * cells + (ix + 1) % cells], d = g[((iy + 1) % cells) * cells + ix % cells], e = g[((iy + 1) % cells) * cells + (ix + 1) % cells];
    out[y * NS + x] = (a + (b - a) * tx) * (1 - ty) + (d + (e - d) * tx) * ty;
  }
  return out;
}
function fbm(seed) { const a = makeNoise(seed, 4), b = makeNoise(seed + 1, 8), d = makeNoise(seed + 2, 16), e = makeNoise(seed + 3, 32), o = new Float32Array(NS * NS); for (let i = 0; i < o.length; i++) o[i] = a[i] * 0.45 + b[i] * 0.28 + d[i] * 0.17 + e[i] * 0.10; return o; }
let NZ = null;
function noises() { return NZ || (NZ = { a: fbm(11), b: fbm(57), wx: makeNoise(91, 16), wy: makeNoise(92, 16), fine: makeNoise(93, 64) }); }
const BAY = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const hsh = (x, y) => hash2(x, y);

// Paints ground for the tile rectangle [tx0,tx0+tw) x [ty0,ty0+th). tileAt(x,y) -> terrain type.
// Returns an Img (0 = open water, left transparent so the animated water shows through).
export function paintGround(tileAt, tx0, ty0, tw, th) {
  const N = noises(), W = tw * 32, H = th * 32, im = new Img(W, H), d = im.d;
  // local copy of the tile types with a 2 tile border
  const gw = tw + 4, gh = th + 4, tt = new Uint8Array(gw * gh);
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) { let t = tileAt(tx0 + x - 2, ty0 + y - 2); if (t === T_STUMP) t = T_GRASS; tt[y * gw + x] = t; }
  const G = R.grass, DI = R.dirt, SA = R.sand, FO = R.forest, RK = R.rock, WA = R.water, FM = R.foam;
  for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
    const wx = tx0 * 32 + px, wy = ty0 * 32 + py, ni = (wy & 255) * NS + (wx & 255);
    const n1 = N.a[ni], n2 = N.b[ni], fine = N.fine[ni];
    // warp the lookup so borders wander
    const ux = px + (N.wx[ni] - 0.5) * 22 + (fine - 0.5) * 5, uy = py + (N.wy[ni] - 0.5) * 22 + (N.fine[((wy + 97) & 255) * NS + ((wx + 31) & 255)] - 0.5) * 5;
    const fx = ux / 32 - 0.5 + 2, fy = uy / 32 - 0.5 + 2, ix = Math.floor(fx), iy = Math.floor(fy), kx = fx - ix, ky = fy - iy;
    const i0 = iy * gw + ix, w00 = (1 - kx) * (1 - ky), w10 = kx * (1 - ky), w01 = (1 - kx) * ky, w11 = kx * ky;
    const t00 = tt[i0], t10 = tt[i0 + 1], t01 = tt[i0 + gw], t11 = tt[i0 + gw + 1];
    const cov = (k) => (t00 === k ? w00 : 0) + (t10 === k ? w10 : 0) + (t01 === k ? w01 : 0) + (t11 === k ? w11 : 0);
    const cw = cov(T_WATER), bay = BAY[(py & 3) * 4 + (px & 3)] / 16, r = hsh(wx, wy);
    let col;
    if (cw > 0.5) {
      if (cw < 0.53) col = (fine > 0.36) ? FM[r < 0.5 ? 2 : 1] : WA[7];
      else if (cw < 0.56) col = fine > 0.6 ? FM[0] : WA[7];
      else if (cw < 0.72) col = ((0.72 - cw) / 0.16 > bay * 0.9 + 0.05) ? WA[cw < 0.63 ? 7 : 6] : 0;
      else col = 0;
    } else if (cw > 0.27) {
      // beach: wet and dark at the waterline, pale and dry further up
      const s = (0.5 - cw) / 0.23; let v = 1.5 + s * 4.4 + (n2 - 0.5) * 1.6 + (bay - 0.5) * 0.9;
      if (r < 0.05) v -= 1.5; else if (r > 0.96) v += 1.2;
      if (cw < 0.31 && fine > 0.5) col = G[3 + (r < 0.5 ? 1 : 0)]; // grass creeping onto the sand
      else col = SA[Math.max(1, Math.min(7, Math.round(v)))];
    } else {
      const cd = cov(T_DIRT), cf = cov(T_FOREST), cr = cov(T_ROCK);
      if (cr > 0.5) {
        let v = 2.6 + n2 * 3 + (bay - 0.5) + (r < 0.07 ? -1.5 : r > 0.93 ? 1.6 : 0);
        if (cr < 0.58) v -= 1.2;
        col = RK[Math.max(1, Math.min(6, Math.round(v)))];
      } else if (cd > 0.5) {
        let v = 3.2 + n1 * 2.6 + (bay - 0.5) * 0.9;
        if (cd < 0.56) v -= 1.4; // darker rim under the grass edge
        if (r < 0.04) v -= 1.6; else if (r > 0.95) v += 1.5; else if (fine > 0.7) v += 0.7; else if (fine < 0.28) v -= 0.7;
        col = DI[Math.max(1, Math.min(7, Math.round(v)))];
      } else if (cf > 0.52) {
        let v = 1.6 + n2 * 2.4 + (bay - 0.5) * 0.8 + (r > 0.95 ? 1 : 0);
        if (cf < 0.6) v += 1;
        col = FO[Math.max(0, Math.min(5, Math.round(v)))];
      } else {
        // grass: broad mottling + fine grain + stray blades
        let v = 3.6 + n1 * 3.2 + (n2 - 0.5) * 1.4 + (bay - 0.5) * 0.9;
        if (r < 0.06) v -= 1.3; else if (r > 0.94) v += 1.3;
        if (cf > 0.3) v -= (cf - 0.3) * 6; // shade near the trees
        if (cd > 0.36 && fine > 0.55 - (cd - 0.36) * 2) col = DI[3 + (r < 0.5 ? 1 : 0)]; // worn patches near paths
        else if (cr > 0.36 && fine > 0.6) col = RK[3 + (r < 0.5 ? 1 : 0)];
        else col = G[Math.max(1, Math.min(8, Math.round(v)))];
      }
    }
    d[py * W + px] = col;
  }
  // decals: tufts, flowers, pebbles, stumps
  for (let ty = 0; ty < th; ty++) for (let tx = 0; tx < tw; tx++) {
    const X = tx0 + tx, Y = ty0 + ty, t = tileAt(X, Y), bx = tx * 32, by = ty * 32;
    const land = (x, y) => { const v = im.get(x, y); return v >= G[0] && v <= G[G.length - 1]; };
    if (t === T_GRASS || t === T_STUMP) {
      for (let k = 0; k < 5; k++) {
        const x = bx + ((hsh(X * 7 + k, Y) * 30) | 0) + 1, y = by + ((hsh(X, Y * 5 + k) * 28) | 0) + 3, q = hsh(X + k * 3, Y - k);
        if (!land(x, y) || !land(x, y - 2)) continue;
        if (q < 0.5) { im.set(x, y, G[2]); im.set(x, y - 1, G[7]); im.set(x, y - 2, G[8]); im.set(x + 1, y - 1, G[8]); im.set(x - 1, y, G[7]); im.set(x + 1, y, G[2]); }
        else if (q < 0.8) { im.set(x, y, G[8]); im.set(x + 1, y - 1, G[9]); im.set(x + 1, y + 1, G[2]); }
        else if (q < 0.86) { const fc = q < 0.82 ? c('gold', 5) : q < 0.84 ? c('white', 0) : c('roofr', 5); im.set(x, y, fc); im.set(x + 1, y, fc); im.set(x, y + 1, G[2]); im.set(x + 1, y + 1, G[3]); im.set(x, y - 1, fc); im.set(x - 1, y, fc); im.set(x, y, c('gold', 3)); }
        else if (q > 0.965) { im.set(x, y, RK[6]); im.set(x + 1, y, RK[5]); im.set(x, y + 1, RK[2]); im.set(x + 1, y + 1, RK[2]); im.set(x, y - 1, RK[7]); }
      }
    } else if (t === T_DIRT) {
      for (let k = 0; k < 3; k++) {
        const x = bx + ((hsh(X * 3 + k, Y + 9) * 28) | 0) + 2, y = by + ((hsh(X - 4, Y * 3 + k) * 28) | 0) + 2, q = hsh(X + k, Y + k * 7);
        const v = im.get(x, y); if (v < DI[0] || v > DI[7]) continue;
        if (q < 0.4) { im.set(x, y, DI[7]); im.set(x + 1, y, DI[6]); im.set(x, y + 1, DI[1]); im.set(x + 1, y + 1, DI[1]); }
        else if (q < 0.6) { im.set(x, y, RK[6]); im.set(x + 1, y, RK[5]); im.set(x - 1, y + 1, DI[1]); im.set(x, y + 1, RK[3]); im.set(x + 1, y + 1, DI[1]); }
        else if (q < 0.75) { for (let j = 0; j < 5; j++) im.set(x + j, y + ((j * 3) % 2), DI[1]); }
      }
    }
    if (t === T_STUMP) im.blit(stumpImg((hsh(X, Y) * 3) | 0), bx + 4 + ((hsh(X, Y + 1) * 6) | 0), by + 2 + ((hsh(X + 1, Y) * 5) | 0));
  }
  return im;
}

const stumps = [];
function stumpImg(v) {
  if (stumps[v]) return stumps[v];
  const wood = mat('wood', 1, 7, { tex: (lp, n) => (n[2] > 0.5 ? { ramp: 'wood', lo: 4, hi: 9, d: 0.2 - (Math.floor(Math.hypot(lp[0], lp[1]) * 1.1) & 1) * 0.22 } : (hash2(Math.floor(Math.atan2(lp[1], lp[0]) * 5), 3) - 0.5) * 0.4) });
  const P = [fru([0, 0, 0], 4.4 + v * 0.4, 3.4 + v * 0.3, 4 + v, wood), cap([-3, 2, 0.5], [-6, 4, 0.2], 1.2, mat('wood', 1, 5)), cap([3, 2, 0.5], [6.4, 3, 0.2], 1.1, mat('wood', 1, 5))];
  if (v === 1) P.push(cap([-9, -3, 0.8], [-3, -6, 0.8], 0.9, mat('wood', 2, 6)));
  const im = render(P, { w: 26, h: 24, ox: 12, oy: 16, ky: 0.7, kz: 0.85 });
  // a few wood chips
  for (let k = 0; k < 5; k++) im.set(3 + ((hash2(k, v) * 20) | 0), 16 + ((hash2(v, k) * 6) | 0), c('wood', 7 + (k & 1)));
  return (stumps[v] = im);
}

// ------------------------------------------------------------------ water
// 64x64 tileable, animated by sliding wave trains. frames: 8
export const WATER_FRAMES = 8;
export function waterFrame(f) {
  const im = new Img(64, 64), W = R.water, ph = f / WATER_FRAMES * Math.PI * 2, T = Math.PI * 2 / 64;
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const wob = Math.sin((x * 2 + y) * T * 1 + 1.3) * 1.6;
    const h = Math.sin((x + 3 * y + wob * 2) * T + ph) * 0.9 + Math.sin((-2 * x + 4 * y) * T - ph + 1.7 + wob * 0.3) * 0.7 + Math.sin((3 * x + 2 * y) * T + ph * 2 + 4) * 0.45 + Math.sin((5 * y - x) * T - ph * 2 + 0.6) * 0.35;
    let v = 3.0 + h * 0.8 + (BAY[(y & 3) * 4 + (x & 3)] / 16 - 0.5) * 0.9 + (hash2(x, y) - 0.5) * 0.7;
    v = Math.max(1, Math.min(5, Math.round(v)));
    if (h > 1.95 && hash2(x >> 1, y) > 0.5) v = 7; else if (h > 1.7 && hash2(x, y >> 1) > 0.35) v = 6;
    im.d[y * 64 + x] = W[v];
  }
  return im;
}

// ------------------------------------------------------------------ trees
// One pine drawn tier by tier, lit from the upper left.
function pine(im, cx, base, hw, h, seed) {
  const P = R.pine, r = rng(seed);
  // trunk
  for (let y = base - 7; y <= base; y++) for (let x = -1; x <= 1; x++) im.set(cx + x, y, c('wood', x < 0 ? 4 : x === 0 ? 3 : 1));
  im.set(cx - 2, base, c('wood', 2)); im.set(cx + 2, base, c('wood', 1));
  const tiers = Math.max(4, Math.round(h / 6.5));
  for (let t = 0; t < tiers; t++) {
    const k = t / (tiers - 1); // 0 = bottom tier
    const w = Math.round(hw * (1 - k * 0.78)), yb = Math.round(base - 5 - k * (h - 11)), th = Math.round(8 - k * 2.5) + 2, top = yb - th;
    const jag = []; for (let x = -w - 1; x <= w + 1; x++) jag.push(r.int(3));
    for (let x = -w; x <= w; x++) {
      const ax = Math.abs(x) / (w + 0.5);
      const y0 = Math.round(top + ax * (th - 2)); // sloping shoulders
      const y1 = yb - Math.round(ax * ax * 2) + jag[x + w + 1] - 1; // drooping, ragged skirt
      for (let y = y0; y <= y1; y++) {
        const u = x / (w + 0.5), depth = (y - y0) / Math.max(1, y1 - y0);
        let v = 3.5 - u * 2.7 + depth * 1.7; // lighter on the left and at the bough tips
        if (y - top < 2 && t < tiers - 1) v -= 1.6; // shaded under the tier above
        if (y >= y1 - 1) v += (u < 0.3 ? 1.4 : 0.4);
        if (((x * 5 + y * 3 + seed) % 7) === 0) v -= 1.3; else if (((x * 3 - y * 2 + seed) % 5) === 0) v += 0.8;
        if (y === y1 && jag[x + w + 1] === 2) v += 0.6;
        im.set(cx + x, y, P[Math.max(1, Math.min(9, Math.round(v)))]);
      }
    }
    // deep shadow line under this tier's skirt on the right
    for (let x = 1; x <= w; x++) if (!im.get(cx + x, yb + 2)) { /* open air */ }
  }
  // tip
  const ty = Math.round(base - h + 4); im.set(cx, ty - 2, P[7]); im.set(cx, ty - 1, P[6]); im.set(cx - 1, ty, P[7]); im.set(cx, ty, P[5]); im.set(cx + 1, ty, P[3]);
}
// A forest tile: a clump of 3 pines, 48 wide x 64 tall; the tile sits at (8, 30) inside it.
export const TREE = { w: 48, h: 64, ox: 8, oy: 32 };
export function treeClump(v) {
  const im = new Img(TREE.w, TREE.h), r = rng(900 + v * 17);
  // soft shadow on the ground
  for (let y = 0; y < 14; y++) for (let x = 0; x < 40; x++) { const dx = (x - 20) / 20, dy = (y - 7) / 7; if (dx * dx + dy * dy < 1 && ((x + y) & 1 || dx * dx + dy * dy < 0.6)) im.d[(TREE.oy + 20 + y) * TREE.w + 8 + x] = SHADOW; }
  const lay = [[[14, 44], [34, 50], [23, 61]], [[32, 45], [13, 52], [26, 62]], [[22, 43], [36, 54], [12, 60]], [[13, 46], [30, 48], [22, 62]]][v % 4];
  const trees = lay.map(([x, y], i) => ({ x: x + r.int(3) - 1, y: y - (i === 2 ? r.int(2) : 0), hw: 10 + r.int(3) + (i === 2 ? 1 : 0), h: 34 + r.int(9) + (v > 3 ? 4 : 0) }));
  trees.sort((a, b) => a.y - b.y);
  for (const t of trees) {
    const one = new Img(TREE.w, TREE.h); pine(one, t.x, t.y, t.hw, t.h, 31 + v * 13 + t.x);
    one.outline(R.pine[0]);
    im.blit(one, 0, 0);
  }
  return im;
}

// ------------------------------------------------------------------ rocks
export const ROCKV = { w: 56, h: 64, ox: 12, oy: 30 };
export function rockClump(v) {
  const m = mat('rock', 1, 8, { tex: TEX.noise(0.14, 0.8) }), P = [];
  const lay = [[[-3, -1, 13, 26], [8, 5, 9, 15], [-9, 8, 6, 8]], [[4, -2, 12, 30], [-8, 3, 10, 17], [7, 9, 6, 7]], [[0, 0, 14, 21], [-9, -5, 8, 27], [9, 7, 7, 10]], [[-5, 2, 11, 19], [7, -2, 11, 24], [0, 10, 6, 6]]][v % 4];
  let i = 0; for (const [x, y, r, h] of lay) P.push(boulder([x, y, 0], [r, r * 0.85, h], v * 10 + i++, m));
  P.push(boulder([13 - v * 2, 12, 0], 3.2, v + 40, m), boulder([-13 + v, 12, 0], 2.6, v + 50, m));
  return render(P, { w: ROCKV.w, h: ROCKV.h, ox: ROCKV.ox + 16, oy: ROCKV.oy + 17, ky: 0.74, kz: 0.8, edge: 3, edgeDark: 2 });
}

export const MINI_COL = { [T_GRASS]: [63, 122, 34], [T_DIRT]: [122, 88, 48], [T_STUMP]: [74, 118, 40], [T_FOREST]: [18, 62, 34], [T_WATER]: [26, 76, 150], [T_ROCK]: [118, 110, 104] };
