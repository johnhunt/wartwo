// Deterministic map generation.
export const T_GRASS = 0, T_FOREST = 1, T_WATER = 2, T_ROCK = 3, T_DIRT = 4, T_STUMP = 5;

export function rng(seed) {
  let s = seed >>> 0;
  const f = () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0);
  };
  f.int = (n) => f() % n;
  f.state = () => s;
  f.setState = (v) => { s = v >>> 0; };
  return f;
}

function valueNoise(w, h, cell, r) {
  const gw = Math.ceil(w / cell) + 2, gh = Math.ceil(h / cell) + 2;
  const g = new Float64Array(gw * gh);
  for (let i = 0; i < g.length; i++) g[i] = r.int(10000) / 10000;
  const out = new Float64Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const fx = x / cell, fy = y / cell, ix = Math.floor(fx), iy = Math.floor(fy);
    let tx = fx - ix, ty = fy - iy;
    tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
    const a = g[iy * gw + ix], b = g[iy * gw + ix + 1], c2 = g[(iy + 1) * gw + ix], d = g[(iy + 1) * gw + ix + 1];
    out[y * w + x] = (a + (b - a) * tx) * (1 - ty) + (c2 + (d - c2) * tx) * ty;
  }
  return out;
}

// Returns {w,h,terrain,starts:[{x,y}], mines:[{x,y}]}
export function generateMap(seed, players, size) {
  const W = size, H = size;
  const r = rng(seed * 7919 + 13);
  const n1 = valueNoise(W, H, 12, r), n2 = valueNoise(W, H, 6, r), n3 = valueNoise(W, H, 5, r), n4 = valueNoise(W, H, 9, r);
  const terrain = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const e = n1[i] * 0.7 + n2[i] * 0.3;
    let t = T_GRASS;
    if (e < 0.30) t = T_WATER;
    else if (n3[i] > 0.62 && e > 0.36) t = T_FOREST;
    else if (n4[i] > 0.80 && e > 0.45) t = T_ROCK;
    else if (n2[i] > 0.72 && n3[i] < 0.3) t = T_DIRT;
    terrain[i] = t;
  }
  // border of forest/rock for a framed look
  for (let x = 0; x < W; x++) for (let k = 0; k < 2; k++) { if (terrain[k * W + x] !== T_WATER) terrain[k * W + x] = T_FOREST; if (terrain[(H - 1 - k) * W + x] !== T_WATER) terrain[(H - 1 - k) * W + x] = T_FOREST; }
  for (let y = 0; y < H; y++) for (let k = 0; k < 2; k++) { if (terrain[y * W + k] !== T_WATER) terrain[y * W + k] = T_FOREST; if (terrain[y * W + W - 1 - k] !== T_WATER) terrain[y * W + W - 1 - k] = T_FOREST; }

  const m = 9;
  const corners = [[m, m], [W - m - 4, H - m - 4], [W - m - 4, m], [m, H - m - 4], [W / 2 - 2, m], [W / 2 - 2, H - m - 4], [m, H / 2 - 2], [W - m - 4, H / 2 - 2]];
  // order corners so 2 players are diagonal
  const starts = [];
  for (let p = 0; p < players; p++) starts.push({ x: corners[p][0] | 0, y: corners[p][1] | 0 });

  const set = (x, y, t) => { if (x >= 1 && y >= 1 && x < W - 1 && y < H - 1) terrain[y * W + x] = t; };
  const clearCircle = (cx, cy, rad, t = T_GRASS) => {
    for (let y = cy - rad; y <= cy + rad; y++) for (let x = cx - rad; x <= cx + rad; x++) {
      const dx = x - cx, dy = y - cy; if (dx * dx + dy * dy <= rad * rad) set(x, y, t);
    }
  };
  const mines = [];
  const center = { x: W / 2, y: H / 2 };
  for (const s of starts) {
    clearCircle(s.x + 2, s.y + 2, 8);
    // mine placed toward the map edge-ish, offset from hall
    const dx = s.x < center.x ? -1 : 1, dy = s.y < center.y ? -1 : 1;
    let mx = s.x + 2 + dx * 6 - 1, my = s.y + 2 - 1;
    if (r.int(2)) { mx = s.x + 2 - 1; my = s.y + 2 + dy * 6 - 1; }
    mx = Math.max(3, Math.min(W - 6, mx)); my = Math.max(3, Math.min(H - 6, my));
    mines.push({ x: mx, y: my });
    // forest patch on the other side
    const fx = s.x + 2 + (r.int(2) ? dx * 7 : -dx * 2), fy = s.y + 2 + (mx === s.x + 1 ? dy * 7 : -dy * 7);
    for (let y = fy - 3; y <= fy + 3; y++) for (let x = fx - 4; x <= fx + 4; x++) {
      const ddx = x - fx, ddy = y - fy; if (ddx * ddx / 16 + ddy * ddy / 9 <= 1 + (r.int(10) / 20)) set(x, y, T_FOREST);
    }
    // keep hall area clear again (inner)
    clearCircle(s.x + 2, s.y + 2, 4);
    for (let y = my - 1; y <= my + 3; y++) for (let x = mx - 1; x <= mx + 3; x++) set(x, y, T_GRASS);
  }
  // extra mines in middle
  const extra = players <= 2 ? 2 : 3;
  for (let i = 0; i < extra; i++) {
    // fixed directions (no trig: keeps generation bit-identical across browsers)
    const dirs = extra === 2 ? [[1, -1], [-1, 1]] : [[0, -1], [1, 1], [-1, 1]];
    const rad = Math.floor(W * 0.13);
    const mx = Math.floor(center.x) + dirs[i][0] * rad - 1, my = Math.floor(center.y) + dirs[i][1] * rad - 1;
    clearCircle(mx + 1, my + 1, 3);
    mines.push({ x: mx, y: my });
  }
  // Ensure connectivity: carve dirt roads from each start to center
  for (const s of starts) {
    let x = s.x + 2, y = s.y + 2;
    const tx = Math.floor(center.x), ty = Math.floor(center.y);
    let guard = 0;
    while ((x !== tx || y !== ty) && guard++ < 500) {
      if (r.int(3) && x !== tx) x += Math.sign(tx - x); else if (y !== ty) y += Math.sign(ty - y); else x += Math.sign(tx - x);
      for (let oy = 0; oy < 2; oy++) for (let ox = 0; ox < 2; ox++) {
        const i = (y + oy) * W + x + ox; if (terrain[i] === T_WATER || terrain[i] === T_ROCK || terrain[i] === T_FOREST) terrain[i] = T_DIRT;
      }
    }
  }
  clearCircle(Math.floor(center.x), Math.floor(center.y), 2, T_DIRT);
  // clean single water/rock tiles (look bad)
  for (let pass = 0; pass < 2; pass++) for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const t = terrain[y * W + x]; if (t !== T_WATER && t !== T_ROCK) continue;
    let same = 0; for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (terrain[(y + oy) * W + x + ox] === t) same++;
    if (same <= 1) terrain[y * W + x] = T_GRASS;
  }
  return { w: W, h: H, terrain, starts, mines };
}
