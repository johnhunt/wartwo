// Building models for the r3d renderer. Origin = centre of the footprint on the
// ground; buildings are drawn turned slightly so a lit front and a shaded side show.
import { sph, cap, box, slab, fru, roof, cvx, mat, rot, aim, xform, add, scl, norm, hash2, TEX, ID } from './r3d.js';

export const B_SIZE = { hall: 4, farm: 2, barracks: 3, mill: 3, stable: 3, forge: 3, tower: 2, mine: 3 };

const STONE = mat('stone', 1, 8, { tex: TEX.brick(8, 4, 0.2) });
const DSTONE = mat('stone', 0, 6, { tex: TEX.brick(8, 4, 0.18) });
const CAPSTONE = mat('stone', 3, 9);
const SLATE = mat('slate', 0, 6, { tex: TEX.shingles(5, 3, 0.2) });
const TEAMROOF = mat('team', 1, 7, { tex: TEX.shingles(5, 3, 0.16) });
const TEAM = mat('team', 1, 7);
const WOODROOF = mat('wood', 1, 7, { tex: TEX.shingles(4, 3, 0.2) });
const THATCH = mat('straw', 1, 7, { tex: TEX.thatch() });
const THATCHC = mat('straw', 1, 7, { tex: TEX.streaks(0.3) });
const HIDE = mat('leather', 1, 7, { tex: TEX.streaks(0.2) });
const PLANK = mat('wood', 2, 7, { tex: TEX.planks(4, 0.2) });
const DPLANK = mat('wood', 0, 5, { tex: TEX.planks(3, 0.2) });
const LOGW = mat('wood', 1, 7, { tex: TEX.logs(4) });
const DLOGW = mat('leather', 0, 5, { tex: TEX.logs(4) });
const BEAM = mat('wood', 1, 6);
const DBEAM = mat('wood', 0, 4);
const BONE = mat('bone', 1, 5);
const GOLD = mat('gold', 2, 7, { spec: 0.5 });
const IRON = mat('steel', 0, 6, { spec: 0.4 });
const DARK = mat('gray', 0, 1, { glow: 0.02 });
const GLOWWIN = mat('straw', 5, 7, { glow: 0.85 });
const FIRE = mat('fire', 3, 7, { glow: 0.8, tex: (lp) => ({ d: (hash2(lp[0] * 2, lp[2] * 2) - 0.5) * 0.5 }) });
const HAY = mat('straw', 2, 7, { tex: TEX.noise(0.35, 1.6) });
const ROCK = mat('rock', 1, 8, { tex: TEX.noise(0.16, 0.9) });
const DIRT = mat('dirt', 1, 6, { tex: TEX.noise(0.25, 1.3) });
// half-timbered wall: pale plaster with dark beams
const TIMBER = mat('cloth', 2, 5, { tex: (lp, n) => {
  if (n[2] > 0.7) return 0;
  const u = (Math.abs(n[0]) > Math.abs(n[1]) ? lp[1] : lp[0]) + 200, v = lp[2] + 200, k = u % 13, q = v % 13;
  if (k < 1.6 || q < 1.5 || Math.abs((k - q + 26) % 13 - 6.5) < 0.8) return { ramp: 'wood', lo: 0, hi: 5 };
  return (hash2(Math.floor(u / 2), Math.floor(v / 2)) - 0.5) * 0.12;
} });

// faceted boulder: a convex lump cut by random planes
export function boulder(cn, r, seed, m = ROCK, squash = 1) {
  const R3 = Array.isArray(r) ? r : [r, r, r], P = [[0, 0, -1, 0]];
  for (let i = 0; i < 16; i++) {
    const a = hash2(seed, i) * Math.PI * 2, e = (hash2(i, seed + 7) * 1.2 - 0.1) * Math.PI / 2;
    const n = [Math.cos(a) * Math.cos(e), Math.sin(a) * Math.cos(e), Math.sin(e)];
    P.push([n[0], n[1], n[2], Math.hypot(R3[0] * n[0], R3[1] * n[1], R3[2] * n[2]) * (0.74 + hash2(seed + 3, i * 5) * 0.26) * (n[2] > 0.7 ? squash : 1)]);
  }
  const b = cvx(cn, P, m); b.bound = Math.max(...R3) * 1.3; return b;
}
const late = (...ps) => ps.flat().map(p => (p.late = true, p));
const FRONT = rot(0, -90, 0); // local z -> +y
const SIDE = rot(0, 0, 90); // local z -> +x

// details on a south-facing wall at y = yf
function win(x, yf, z, hw = 1.6, hh = 2.6, lit = false) {
  return [box([x, yf + 0.25, z], [hw + 0.9, 0.3, hh + 0.9], CAPSTONE), box([x, yf + 0.5, z], [hw, 0.3, hh], lit ? GLOWWIN : DARK)];
}
function winE(xf, y, z, hw = 1.6, hh = 2.6) { return [box([xf + 0.25, y, z], [0.3, hw + 0.9, hh + 0.9], CAPSTONE), box([xf + 0.5, y, z], [0.3, hw, hh], DARK)]; }
function door(x, yf, hw, h, m = DPLANK, frame = CAPSTONE) {
  return [
    box([x, yf + 0.3, h / 2 + 0.5], [hw + 1.6, 0.4, h / 2 + 0.5], frame), fru([x, yf - 0.1, h], hw + 1.6, hw + 1.6, 0.8, frame, FRONT),
    box([x, yf + 0.7, h / 2], [hw, 0.4, h / 2], m), fru([x, yf + 0.3, h], hw, hw, 0.8, m, FRONT),
    sph([x + hw * 0.5, yf + 1.2, h * 0.55], 0.7, IRON),
  ];
}
function flag(x, y, z0, h, len = 8) {
  return late([cap([x, y, z0], [x, y, z0 + h], 0.6, DBEAM), sph([x, y, z0 + h + 0.6], 1, GOLD),
    box([x + len / 2 + 0.4, y, z0 + h - 2.6], [len / 2, 0.45, 2.4], TEAM), box([x + len + 1.2, y, z0 + h - 3.4], [1.4, 0.45, 1.5], TEAM)]);
}
function banner(x, yf, z, hw = 3, hh = 7) { // hanging cloth on a front wall
  return late([box([x, yf + 0.7, z], [hw, 0.35, hh], mat('team', 1, 7, { tex: (lp) => (lp[2] < -hh + 1.6 ? { ramp: 'gold', d: 0.1 } : Math.abs(lp[0]) < 1 && Math.abs(lp[2] - 1) < 2.6 || Math.abs(lp[2] - 1.8) < 0.9 && Math.abs(lp[0]) < 2.2 ? { ramp: 'gold', d: 0.15 } : 0) })),
    cap([x - hw - 0.6, yf + 0.8, z + hh], [x + hw + 0.6, yf + 0.8, z + hh], 0.6, GOLD)]);
}
function crenel(cx, cy, hx, hy, z, m = CAPSTONE, step = 6) {
  const P = [];
  for (let x = -hx + 1.5; x <= hx - 1; x += step) { P.push(box([cx + x, cy + hy - 1.2, z + 2], [1.6, 1.3, 2], m), box([cx + x, cy - hy + 1.2, z + 2], [1.6, 1.3, 2], m)); }
  for (let y = -hy + 1.5 + step; y <= hy - 1 - step; y += step) { P.push(box([cx + hx - 1.2, cy + y, z + 2], [1.3, 1.6, 2], m), box([cx - hx + 1.2, cy + y, z + 2], [1.3, 1.6, 2], m)); }
  return P;
}
function roundTower(x, y, r, h, roofH, roofMat = TEAMROOF) {
  const P = [fru([x, y, 0], r + 0.6, r, h, STONE)];
  P.push(fru([x, y, h - 1], r, r + 2.2, 3, CAPSTONE), fru([x, y, h + 2], r + 2.2, r + 2.2, 2.4, STONE));
  for (let a = 0; a < 8; a++) { const an = a * Math.PI / 4 + 0.2; P.push(box([x + Math.cos(an) * (r + 1), y + Math.sin(an) * (r + 1), h + 6], [1.5, 1.5, 1.8], CAPSTONE, rot(an * 180 / Math.PI))); }
  for (const dz of [0.45, 0.72]) P.push(box([x - r * 0.3, y + r * 0.95 + 0.3, h * dz], [0.8, 0.5, 2.4], DARK));
  if (roofH) P.push(...late([fru([x, y, h + 4.4], r + 1.2, 0.3, roofH, roofMat), sph([x, y, h + 4.4 + roofH], 1.2, GOLD)]));
  return P;
}
function palisade(x0, y0, x1, y1, h = 14, m = DLOGW, step = 4.6) {
  const P = [], n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / step));
  for (let i = 0; i <= n; i++) { const t = i / n, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t, hh = h + (hash2(i, x0 + y0) - 0.5) * 3; P.push(fru([x, y, 0], 2.4, 2.2, hh - 3.4, m), fru([x, y, hh - 3.4], 2.2, 0.2, 3.6, mat('wood', 3, 8))); }
  return P;
}
function tusk(x, y, z, h, lean = 1, r = 2.2) { // curved bone tusk rising from the ground
  const P = []; let a = [x, y, z];
  for (let i = 0; i < 5; i++) { const t = i / 5, b = [x + lean * Math.sin(t * 1.5) * h * 0.42, y + Math.sin(t * 1.2) * 1.5, z + h * (t + 0.2)]; P.push(cap(a, b, r * (1 - t * 0.75), BONE)); a = b; }
  return P;
}
function skull(x, y, z, s = 1) {
  return [sph([x, y, z], [3 * s, 2.6 * s, 2.8 * s], mat('bone', 1, 5, { tex: (lp) => (lp[1] > 0.6 * s && lp[2] < 0.6 * s && lp[2] > -1.2 * s && Math.abs(lp[0]) > 0.5 * s && Math.abs(lp[0]) < 2.1 * s ? { ramp: 'gray', abs: 0 } : 0) })),
    sph([x, y + 0.9 * s, z - 2.4 * s], [1.9 * s, 1.6 * s, 1.4 * s], BONE)];
}
function logPile(x, y, n = 3, len = 9, axisX = true) {
  const P = [];
  for (let r = 0; r < n; r++) for (let k = 0; k < n - r; k++) {
    const o = (k - (n - r - 1) / 2) * 4.6, z = 2.4 + r * 4;
    const a = axisX ? [x - len, y + o, z] : [x + o, y - len, z], b = axisX ? [x + len, y + o, z] : [x + o, y + len, z];
    P.push(cap(a, b, 2.3, mat('wood', 1, 6, { tex: TEX.noise(0.2, 1.2) })), sph(axisX ? add(b, [1.6, 0, 0]) : add(b, [0, 1.6, 0]), axisX ? [1, 2, 2] : [2, 1, 2], mat('wood', 6, 9)));
  }
  return P;
}
function hayBale(x, y, r = 5) { return [fru([x, y, 0], r, r, r * 0.9, HAY), fru([x, y, r * 0.9], r, r * 0.6, r * 0.5, HAY)]; }
function fence(x0, y0, x1, y1, m = BEAM) {
  const P = [], n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / 9));
  for (let i = 0; i <= n; i++) { const t = i / n; P.push(cap([x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, 0], [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, 7], 0.9, m)); }
  P.push(cap([x0, y0, 5.4], [x1, y1, 5.4], 0.7, m), cap([x0, y0, 2.8], [x1, y1, 2.8], 0.7, m));
  return P;
}
function chimney(x, y, z0, h, smokeGlow = false) {
  const P = [slab([x, y, z0], [3.2, 3.2, h / 2], DSTONE), slab([x, y, z0 + h], [4, 4, 1], CAPSTONE)];
  if (smokeGlow) P.push(slab([x, y, z0 + h + 1.6], [2.4, 2.4, 0.4], FIRE));
  return P;
}

// ---------------------------------------------------------------- Kingdom of Vale
const KINGDOM = {
  hall() {
    const P = [], cy = 14;
    P.push(slab([0, cy, 0], [38, 23, 17], STONE));
    P.push(slab([0, cy, 34], [38.6, 23.6, 1.2], CAPSTONE));
    P.push(...late(roof([0, cy, 36.4], 41, 26, 20, SLATE, ID, 22)));
    P.push(...late(cap([-19, cy, 56.6], [19, cy, 56.6], 1, GOLD)));
    for (const x of [-27, -15, 15, 27]) P.push(...win(x, cy + 23, 22, 1.7, 3.4, x === 15));
    for (const y of [cy - 8, cy + 8]) P.push(...winE(38, y, 22, 1.7, 3.4));
    // gatehouse
    P.push(slab([0, cy + 27, 0], [11, 5, 15], STONE), ...late(roof([0, cy + 27, 30], 7.5, 13, 11, TEAMROOF, rot(90))));
    P.push(...door(0, cy + 32, 5.6, 15.5));
    P.push(...late(box([0, cy + 32.6, 25.6], [2.6, 0.4, 2.6], GOLD, rot(0, 0, 45))));
    P.push(slab([0, cy + 36, 0], [9, 3, 0.8], CAPSTONE), slab([0, cy + 40, 0], [11, 2.4, 0.4], CAPSTONE));
    // front corner towers
    P.push(...roundTower(-38, cy + 20, 10.5, 46, 22), ...roundTower(38, cy + 20, 10.5, 46, 22));
    P.push(...flag(-38, cy + 20, 72, 13), ...flag(38, cy + 20, 72, 13));
    // great tower at the back
    P.push(slab([-12, cy - 15, 0], [13, 12, 37], DSTONE), slab([-12, cy - 15, 74], [14.6, 13.6, 1.5], CAPSTONE), ...crenel(-12, cy - 15, 14.6, 13.6, 77));
    P.push(...win(-12, cy - 3, 62, 1.8, 4), ...winE(1, cy - 15, 62, 1.8, 4));
    P.push(...late(fru([-12, cy - 15, 77], 7, 0.4, 16, TEAMROOF)), ...flag(-12, cy - 15, 92, 16, 10));
    P.push(...banner(-22, cy + 23.2, 22, 2.6, 6), ...banner(22, cy + 23.2, 22, 2.6, 6));
    return P;
  },
  farm() {
    const P = [];
    P.push(slab([-6, -6, 0], [15, 10, 7.5], TIMBER), ...late(roof([-6, -6, 15], 17.5, 13, 13, THATCH)));
    P.push(...door(-10, 4, 3.2, 9, DPLANK, BEAM), ...win(1.5, 4, 8.5, 1.6, 2, true));
    P.push(...late(chimney(-15, -9, 14, 13)));
    // crop rows
    P.push(slab([8, 22, 0], [21, 9.5, 0.5], mat('dirt', 0, 5, { tex: (lp) => { const k = ((lp[1] + 100) % 4.8); return k < 2.6 ? { ramp: 'straw', lo: 2, hi: 7, d: (hash2(Math.floor(lp[0] * 1.7), Math.floor(lp[1])) - 0.5) * 0.7 + 0.1 } : (hash2(lp[0], lp[1]) - 0.5) * 0.2; } })));
    for (let i = 0; i < 12; i++) P.push(sph([-10 + (i % 6) * 7.4, 18 + ((i / 6) | 0) * 9.6, 1.8], [1.5, 1.2, 2.6], mat('straw', 3, 7, { tex: TEX.noise(0.4, 2) })));
    P.push(...hayBale(21, -4, 5.4), ...fence(-26, 12, -26, 32), ...fence(-26, 32, 29, 32));
    P.push(...flag(13, -12, 0, 30, 7));
    return P;
  },
  barracks() {
    const P = [], cy = 6;
    P.push(slab([-4, cy, 0], [32, 17, 13], STONE), slab([-4, cy, 26], [32.6, 17.6, 1], CAPSTONE));
    P.push(...late(roof([-4, cy, 28], 35, 20, 17, SLATE)), ...late(cap([-39, cy, 45], [31, cy, 45], 1, CAPSTONE)));
    for (const x of [-27, -17, 9, 19]) P.push(...win(x, cy + 17, 17, 1.5, 3, x === -17));
    P.push(...winE(28, cy, 17, 1.6, 3));
    P.push(...door(-4, cy + 17, 6.4, 15));
    P.push(...late(box([-4, cy + 17.9, 21.6], [3.2, 0.3, 3], mat('team', 1, 7, { tex: (lp) => (Math.abs(lp[0] - lp[2]) < 0.75 || Math.abs(lp[0] + lp[2]) < 0.75 ? { ramp: 'steel', d: 0.3 } : 0) }))));
    // corner turret
    P.push(...roundTower(31, cy + 13, 9, 38, 17));
    P.push(...flag(31, cy + 13, 59, 12));
    P.push(...banner(-22, cy + 17.2, 16, 2.4, 5.4));
    // training yard: weapon rack, target dummy
    P.push(cap([-33, 31, 0], [-33, 31, 9], 0.8, BEAM), cap([-20, 31, 0], [-20, 31, 9], 0.8, BEAM), cap([-34, 31, 8], [-19, 31, 8], 0.7, BEAM));
    for (const x of [-30, -26.5, -23]) P.push(cap([x, 32, 1], [x, 31.6, 14], 0.5, x === -26.5 ? IRON : BEAM), sph([x, 31.6, 15], [1, 0.5, 1.8], IRON));
    P.push(cap([12, 33, 0], [12, 33, 13], 1, BEAM), cap([7.5, 33, 10], [16.5, 33, 10], 0.9, BEAM), sph([12, 33, 9], [3, 2.4, 4], HAY), sph([12, 33, 15], 2.2, HAY));
    P.push(slab([-4, cy + 20, 0], [9, 2.4, 0.5], CAPSTONE));
    return P;
  },
  mill() {
    const P = [], cy = 2;
    P.push(slab([-8, cy, 0], [24, 15, 11], TIMBER), ...late(roof([-8, cy, 22], 27, 18, 17, WOODROOF)));
    P.push(...door(-14, cy + 15, 5, 12, DPLANK, BEAM), ...win(1, cy + 15, 13, 1.8, 2.6), ...winE(16, cy, 13, 1.8, 2.6));
    // open saw shed
    for (const [x, y] of [[20, cy - 8], [38, cy - 8], [20, cy + 14], [38, cy + 14]]) P.push(cap([x, y, 0], [x, y, 15], 1.2, BEAM));
    P.push(...late(roof([29, cy + 3, 15], 12, 14, 7, WOODROOF)));
    P.push(slab([29, cy + 6, 0], [7, 2.4, 3], PLANK), cap([22, cy + 6, 7.4], [36, cy + 6, 7.4], 2.4, mat('wood', 1, 6, { tex: TEX.noise(0.2, 1.2) })));
    P.push(fru([29, cy + 8.6, 8], 6.4, 6.4, 0.7, mat('steel', 1, 9, { spec: 0.5, tex: (lp) => { const r = Math.hypot(lp[0], lp[1]), a = Math.atan2(lp[1], lp[0]); return r > 5 ? (Math.sin(a * 12) > 0 ? 0.2 : -0.5) : r < 1.5 ? -0.5 : 0; } }), FRONT));
    P.push(...logPile(-22, 28, 3, 10), ...logPile(8, 30, 2, 8));
    // stump with axe
    P.push(fru([27, 30, 0], 4, 3.6, 4.5, mat('wood', 2, 8, { tex: (lp, n) => n[2] > 0.5 ? 0.25 - (Math.floor(Math.hypot(lp[0], lp[1]) * 1.2) & 1) * 0.2 : TEX.noise(0.2)(lp) })), cap([27, 30, 5], [31, 30, 12], 0.7, BEAM), sph([27.4, 30, 6.2], [2.2, 0.7, 1.6], IRON, rot(0, 0, 30)));
    P.push(...flag(-28, cy - 10, 0, 44, 8));
    return P;
  },
  stable() {
    const P = [], cy = 2;
    P.push(slab([0, cy, 0], [36, 16, 9], PLANK));
    P.push(...late(roof([0, cy, 18], 39, 19.5, 15, WOODROOF)), ...late(cap([-39, cy, 33.2], [39, cy, 33.2], 0.9, BEAM)));
    // stall openings with half doors
    for (const x of [-25, -8.4, 8.4, 25]) {
      P.push(box([x, cy + 16.2, 8], [6, 0.4, 8], DARK), box([x, cy + 16.6, 4], [6, 0.4, 4], mat('wood', 2, 7, { tex: (lp) => (Math.abs(Math.abs(lp[0]) - Math.abs(lp[2]) * 1.4) < 0.9 ? -0.3 : TEX.planks(3)(lp, [0, 1, 0])) })));
      P.push(cap([x - 6.6, cy + 16.6, 0], [x - 6.6, cy + 16.6, 17], 1, BEAM));
    }
    P.push(cap([31.6, cy + 16.6, 0], [31.6, cy + 16.6, 17], 1, BEAM));
    // a horse looking out
    P.push(sph([8.4, cy + 18.4, 11.6], [2.1, 3.6, 2.4], mat('wood', 1, 6), rot(0, -30, 0)), sph([8.4, cy + 15, 13], [2.4, 3, 3.4], mat('wood', 1, 6)));
    P.push(...hayBale(-27, 30, 5.6), ...hayBale(-15, 33, 4.6));
    P.push(slab([16, 31, 0], [8, 3, 2.2], DPLANK), slab([16, 31, 3.6], [6.6, 1.9, 0.5], mat('water', 3, 7)));
    P.push(...fence(30, 22, 30, 40), ...fence(-2, 40, 30, 40));
    P.push(...late(box([0, cy + 19.9, 24.5], [3.6, 0.4, 3.6], mat('team', 1, 7, { tex: (lp) => (lp[0] * lp[0] + lp[2] * lp[2] < 4 ? { ramp: 'gold', d: 0.2 } : 0) }))));
    P.push(...flag(-34, cy - 8, 0, 40, 8));
    return P;
  },
  forge() {
    const P = [], cy = 0;
    P.push(slab([-4, cy, 0], [27, 17, 11.5], DSTONE), slab([-4, cy, 23], [27.6, 17.6, 1], CAPSTONE));
    P.push(...late(roof([-4, cy, 25], 30, 20, 15, SLATE)));
    // glowing furnace mouth and big chimney
    P.push(box([-12, cy + 17.3, 7.5], [8.4, 0.4, 8], CAPSTONE), fru([-12, cy + 17, 15], 8.4, 8.4, 0.7, CAPSTONE, FRONT));
    P.push(box([-12, cy + 17.8, 6.5], [6, 0.4, 6.5], FIRE), fru([-12, cy + 17.5, 13], 6, 6, 0.7, FIRE, FRONT));
    P.push(box([-12, cy + 18.3, 2], [6, 0.4, 2.2], mat('gray', 0, 3)));
    P.push(...win(8, cy + 17, 14, 1.8, 2.8, true), ...winE(23, cy, 14, 1.8, 2.8));
    P.push(slab([14, cy - 8, 0], [6, 6, 24], STONE), slab([14, cy - 8, 48], [7.2, 7.2, 1.4], CAPSTONE), ...late(slab([14, cy - 8, 50.6], [4.6, 4.6, 0.5], FIRE)));
    // anvil, quench trough, weapon stock
    P.push(slab([10, 31, 0], [3, 2.4, 2.4], mat('wood', 1, 5)), slab([10, 31, 4.8], [4.6, 2, 1.5], mat('steel', 0, 7, { spec: 0.5 })), fru([15.6, 31, 5.6], 1.4, 0.2, 2.6, mat('steel', 0, 7), SIDE));
    P.push(slab([-22, 30, 0], [7, 3, 2.4], DPLANK), slab([-22, 30, 4], [5.8, 2, 0.5], mat('water', 2, 6)));
    P.push(cap([26, 26, 0], [26, 26, 10], 0.9, BEAM), cap([34, 26, 0], [34, 26, 10], 0.9, BEAM), cap([25, 26, 9], [35, 26, 9], 0.7, BEAM));
    for (const x of [27.6, 30, 32.4]) P.push(box([x, 26.8, 8], [0.7, 0.3, 6.4], mat('steel', 2, 9, { spec: 0.5 })));
    P.push(...banner(-27, cy + 17.2, 14, 2.4, 5), ...flag(-28, cy - 12, 0, 46, 8));
    return P;
  },
  tower() {
    const P = [];
    P.push(fru([0, 2, 0], 15, 13.5, 6, DSTONE), fru([0, 2, 6], 12.6, 11.4, 40, STONE));
    P.push(fru([0, 2, 44], 11.4, 15, 4.5, CAPSTONE), fru([0, 2, 48.5], 15, 15, 3.4, STONE));
    for (let a = 0; a < 10; a++) { const an = a * Math.PI / 5 + 0.3; P.push(box([Math.cos(an) * 13.6, 2 + Math.sin(an) * 13.6, 54], [1.9, 1.7, 2.3], CAPSTONE, rot(an * 180 / Math.PI))); }
    P.push(...door(-3, 13.6, 3.6, 11));
    P.push(box([-4, 13.6, 26], [0.9, 0.5, 3], DARK), box([4.6, 12.4, 36], [0.9, 0.5, 2.6], DARK));
    P.push(...late(fru([0, 2, 51.6], 9.6, 9, 5, DSTONE), fru([0, 2, 56.6], 11.6, 0.3, 17, TEAMROOF), sph([0, 2, 73.6], 1.3, GOLD)));
    P.push(...flag(0, 2, 74, 11, 8));
    P.push(...banner(-3, 12.6, 38, 2.2, 4.6));
    return P;
  },
};

// ---------------------------------------------------------------- Ashen Warband
function hut(x, y, r, wallH, roofH, wallM = DLOGW, roofM = HIDE) {
  const P = [fru([x, y, 0], r, r - 0.6, wallH, wallM)];
  P.push(...late(fru([x, y, wallH - 1], r + 3.4, r * 0.34, roofH * 0.62, roofM), fru([x, y, wallH - 1 + roofH * 0.62], r * 0.34, 0.8, roofH * 0.38, roofM)));
  // poles poking out of the top
  for (let k = 0; k < 4; k++) { const a = k * 1.7 + 0.4; P.push(...late(cap([x, y, wallH + roofH - 3], [x + Math.cos(a) * 3.6, y + Math.sin(a) * 3.6, wallH + roofH + 4.6], 0.55, DBEAM))); }
  return P;
}
function hutDoor(x, y, r, hw, h) { return [box([x, y + r + 0.1, h / 2], [hw + 1.5, 0.6, h / 2 + 1.2], DBEAM), box([x, y + r + 0.5, h / 2 - 0.4], [hw, 0.5, h / 2], DARK)]; }
function wbanner(x, y, h, len = 5.5) { // ragged war banner on a crooked pole
  return late([cap([x, y, 0], [x + 0.8, y, h], 0.75, DBEAM), cap([x - 3, y, h - 2], [x + 4.6, y, h - 1.4], 0.55, DBEAM), fru([x + 0.8, y, h], 0.9, 0, 3, BONE),
    box([x + 0.8, y + 0.2, h - 2 - len], [3.2, 0.4, len], mat('team', 1, 7, { tex: (lp) => (lp[2] < -len + 2.4 && (Math.floor(lp[0] + 10) & 1) ? { ramp: 'team', abs: 0.05 } : lp[0] * lp[0] + (lp[2] - 1.4) * (lp[2] - 1.4) < 2.8 ? { ramp: 'bone', d: 0.2 } : 0) }))]);
}
const WARBAND = {
  hall() {
    const P = [], cy = 6;
    P.push(...hut(0, cy, 33, 15, 50, DLOGW, THATCHC));
    P.push(...late(fru([0, cy, 14.5], 37.2, 34.4, 4.2, mat('team', 1, 7, { tex: (lp) => (Math.sin(Math.atan2(lp[1], lp[0]) * 14) > 0.3 && lp[2] < 2.6 ? { ramp: 'bone', d: 0.1 } : 0) }))));
    // entrance with tusks and a skull
    P.push(slab([0, cy + 34, 0], [9.5, 5, 9], DLOGW), ...late(roof([0, cy + 34, 18], 6, 12, 6, HIDE, rot(90))));
    P.push(box([0, cy + 39.3, 7], [6, 0.4, 7.4], DARK));
    P.push(...tusk(-13, cy + 39, 0, 26, 1, 3), ...tusk(13, cy + 39, 0, 26, -1, 3));
    P.push(...late(skull(0, cy + 40, 21.6, 1.35)));
    // side hut
    P.push(...hut(-40, cy - 12, 14, 10, 24, DLOGW, HIDE), ...hut(41, cy - 6, 12.5, 9, 21, DLOGW, HIDE));
    P.push(...palisade(-54, cy + 14, -22, cy + 42, 14), ...palisade(22, cy + 42, 54, cy + 16, 14));
    P.push(...wbanner(-27, cy + 44, 34), ...wbanner(27, cy + 44, 34));
    // fire pit
    P.push(fru([40, cy + 36, 0], 5, 4.4, 2, ROCK), ...late(sph([40, cy + 36, 3.4], [3, 3, 3.6], FIRE)));
    return P;
  },
  farm() {
    const P = [];
    P.push(...hut(-8, -8, 13, 8, 22, DLOGW, THATCHC), ...hutDoor(-8, -8, 12.6, 3, 8));
    // pig pen
    P.push(fru([10, 19, 0], 17, 17, 0.5, mat('dirt', 0, 4, { tex: TEX.noise(0.4, 1.2) })));
    P.push(...palisade(-10, 30, 28, 32, 7, DLOGW, 5.4), ...palisade(28, 28, 28, 6, 7, DLOGW, 5.4), ...palisade(-11, 26, -11, 12, 7, DLOGW, 5.4));
    for (const [x, y, a] of [[6, 18, 30], [17, 23, -70]]) { P.push(sph([x, y, 3.6], [3.2, 4.8, 3], mat('skin', 2, 6), rot(a)), sph(add([x, y, 3.8], scl([-Math.sin(a * Math.PI / 180), Math.cos(a * Math.PI / 180), 0], 4.6)), 2.1, mat('skin', 2, 6))); }
    P.push(...wbanner(16, -12, 30, 5), fru([21, 2, 0], 4.4, 3.6, 7, mat('leather', 1, 6, { tex: TEX.streaks(0.2) })), sph([21, 2, 7.4], [3.8, 3.8, 1.6], HAY));
    return P;
  },
  barracks() {
    const P = [], cy = 4;
    // palisade ring with a gate at the front
    for (let k = 0; k < 26; k++) { const a = k / 26 * Math.PI * 2 + 0.12, x = Math.cos(a) * 40, y = cy + Math.sin(a) * 30; if (Math.abs(x) < 9 && y > cy) continue; const h = 17 + (hash2(k, 3) - 0.5) * 4; P.push(fru([x, y, 0], 2.9, 2.6, h - 4, DLOGW), fru([x, y, h - 4], 2.6, 0.2, 4.4, mat('wood', 3, 8))); }
    P.push(fru([0, cy, 0], 37, 37, 0.5, mat('dirt', 0, 4, { tex: TEX.noise(0.3, 1.1) })));
    P.push(...hut(0, cy - 10, 17, 11, 30, DLOGW, HIDE), ...hutDoor(0, cy - 10, 16.6, 4, 10));
    P.push(...late(sph([0, cy - 10, 19], [14, 14, 4], mat('team', 1, 6))));
    // gate posts, lintel and skulls
    P.push(fru([-11, cy + 29, 0], 3.2, 2.8, 25, DLOGW), fru([11, cy + 29, 0], 3.2, 2.8, 25, DLOGW), ...late(cap([-15, cy + 29, 24], [15, cy + 29, 24], 2, DBEAM)));
    P.push(...late(skull(0, cy + 30.6, 25.5, 1.2), fru([-11, cy + 29, 25], 2, 0, 6, BONE), fru([11, cy + 29, 25], 2, 0, 6, BONE)));
    // weapon racks and a bonfire in the yard
    P.push(cap([-27, cy + 8, 0], [-27, cy + 8, 11], 0.9, DBEAM), cap([-18, cy + 12, 0], [-18, cy + 12, 11], 0.9, DBEAM), cap([-28, cy + 7.6, 10], [-17, cy + 12.4, 10], 0.8, DBEAM));
    for (const t of [0.25, 0.55, 0.85]) { const x = -27 + 9 * t, y = cy + 8.6 + 4 * t; P.push(cap([x, y + 1, 0.5], [x, y, 16], 0.55, BEAM), sph([x, y, 15.6], [2.6, 0.7, 2.1], IRON, rot(25))); }
    P.push(fru([23, cy + 12, 0], 4.6, 4, 2, ROCK), ...late(sph([23, cy + 12, 4], [3, 3, 4.2], FIRE)));
    P.push(...wbanner(-36, cy + 26, 36, 6.4), ...wbanner(36, cy + 26, 36, 6.4));
    return P;
  },
  mill() {
    const P = [], cy = 0;
    // lean-to of heavy logs with a hide roof
    P.push(slab([-10, cy - 4, 0], [22, 11, 9.5], DLOGW));
    P.push(...late(roof([-10, cy - 2, 19], 25, 15, 11, HIDE)));
    P.push(box([-10, cy + 7.3, 7], [7, 0.4, 7.4], DARK), cap([-18, cy + 7.6, 0], [-18, cy + 7.6, 16], 1.3, DBEAM), cap([-2, cy + 7.6, 0], [-2, cy + 7.6, 16], 1.3, DBEAM));
    for (const x of [-30, -22, 2, 10]) P.push(...late(fru([x, cy + 12, 18], 1.3, 0, 5, BONE, rot(0, 40, 0))));
    // saw pit: trestles carrying a trunk with a big two-man saw
    for (const x of [12, 34]) { P.push(cap([x, cy + 18, 0], [x + 2, cy + 22, 12], 1.2, DBEAM), cap([x + 4, cy + 26, 0], [x + 2, cy + 22, 12], 1.2, DBEAM)); }
    P.push(cap([6, cy + 22, 13.6], [41, cy + 22, 13.6], 3.1, mat('wood', 1, 6, { tex: TEX.noise(0.2, 1.2) })), sph([42.6, cy + 22, 13.6], [1, 2.8, 2.8], mat('wood', 6, 9)));
    P.push(box([24, cy + 22.4, 15], [0.5, 1.6, 9], mat('steel', 0, 8, { spec: 0.4, tex: (lp) => ((Math.floor(lp[2] * 1.2 + 20) & 1) && lp[1] > 0.6 ? -0.6 : 0) }), rot(0, 0, 24)), cap([19.6, cy + 22.4, 23.6], [22.6, cy + 22.4, 24.6], 0.9, DBEAM));
    P.push(...logPile(-24, cy + 29, 3, 10), ...logPile(8, cy + 36, 2, 7));
    P.push(fru([34, cy - 12, 0], 4.2, 3.8, 4.6, mat('wood', 2, 8)), ...wbanner(-34, cy - 14, 40, 6));
    return P;
  },
  stable() {
    const P = [], cy = 0;
    // rocky den mound with a cave mouth
    const rk = mat('rock', 1, 8, { tex: TEX.noise(0.12, 0.7) });
    P.push(boulder([-6, cy - 6, 0], [32, 22, 30], 11, rk), boulder([-26, cy + 2, 0], [16, 15, 19], 12, rk), boulder([20, cy, 0], [18, 16, 22], 13, rk), boulder([4, cy - 14, 0], [18, 13, 40], 14, rk), boulder([-16, cy - 10, 0], [12, 12, 35], 15, rk));
    P.push(boulder([-34, cy + 16, 0], 6, 16, rk), boulder([38, cy + 12, 0], 7, 17, rk));
    P.push(sph([-6, cy + 13.6, 0], [10, 6, 13], mat('gray', 0, 1, { glow: 0.02 })));
    // rib arches over the entrance
    for (const s of [-1, 1]) { P.push(...tusk(-6 + s * 13, cy + 18, 0, 22, -s, 2.2)); }
    P.push(...late(skull(-6, cy + 16.6, 16.6, 1.25)));
    // hide kennel
    P.push(sph([28, cy + 22, 0], [10, 9, 9.5], mat('fur', 1, 6, { tex: TEX.noise(0.35, 1.5) })), sph([28, cy + 30.2, 0], [4.4, 2, 6], DARK));
    P.push(...late(sph([28, cy + 22, 8.6], [5.6, 5.4, 2.2], mat('team', 1, 6))));
    // bones and a stake fence
    for (const [x, y, a] of [[-26, 30, 20], [-14, 36, -50], [6, 32, 80]]) { const d = [Math.cos(a * Math.PI / 180) * 4, Math.sin(a * Math.PI / 180) * 4, 0]; P.push(cap(add([x, y, 1], scl(d, -1)), add([x, y, 1], d), 0.8, BONE), sph(add([x, y, 1], d), 1.3, BONE), sph(add([x, y, 1], scl(d, -1)), 1.3, BONE)); }
    P.push(...palisade(-44, cy + 18, -34, cy + 38, 9, DLOGW, 5.2));
    P.push(...wbanner(-38, cy - 6, 40, 6));
    return P;
  },
  forge() {
    const P = [], cy = 0;
    P.push(fru([-4, cy, 0], 25, 22, 17, mat('rock', 1, 7, { tex: TEX.brick(9, 5, 0.22) })));
    P.push(...late(fru([-4, cy, 16], 26, 9, 15, HIDE), fru([-4, cy, 31], 9.6, 7.6, 8, mat('rock', 1, 6, { tex: TEX.brick(6, 4, 0.2) })), fru([-4, cy, 39.2], 6, 6, 0.6, FIRE)));
    // furnace mouth
    P.push(box([-4, cy + 23.8, 6.5], [8.6, 0.6, 7.6], mat('rock', 0, 4)), box([-4, cy + 24.4, 5.6], [6.2, 0.5, 6], FIRE));
    // giant rib bones arching over the roof
    for (const x of [-22, -4, 14]) for (const s of [-1, 1]) {
      let a = [x, cy + s * 23, 6];
      for (let i = 1; i <= 5; i++) { const t = i / 5, b = [x, cy + s * (23 - 15 * t * t), 6 + 34 * Math.sin(t * 1.35)]; P.push(...late(cap(a, b, 1.9 - t, BONE))); a = b; }
    }
    // anvil stone, tongs, slag heap
    P.push(fru([27, 26, 0], 5, 4.4, 5, ROCK), slab([27, 26, 5], [4.6, 2.4, 1.3], IRON));
    P.push(sph([-28, 30, 0], [7.6, 5.4, 4.6], mat('gray', 1, 5, { tex: TEX.noise(0.5, 1.6) })), sph([-26, 31, 2.6], [2.4, 2, 2], FIRE));
    P.push(...wbanner(30, cy - 14, 42, 6));
    return P;
  },
  tower() {
    const P = [];
    // four splayed legs with cross bracing
    const feet = [[-14, 14], [14, 14], [-13, -8], [13, -8]], top = [[-8, 9], [8, 9], [-8, -3], [8, -3]];
    for (let i = 0; i < 4; i++) P.push(cap([feet[i][0], feet[i][1], 0], [top[i][0], top[i][1], 36], 1.7, DBEAM));
    P.push(cap([-13, 14, 5], [7, 9.6, 30], 0.9, BEAM), cap([13, 14, 5], [-7, 9.6, 30], 0.9, BEAM), cap([-11.6, 12, 16], [11.6, 12, 16], 1, DBEAM));
    P.push(cap([13.4, 12, 6], [8.6, -3, 30], 0.8, BEAM), cap([12, -6, 6], [8.6, 8, 30], 0.8, BEAM));
    // platform with hide walls
    P.push(slab([0, 3, 36], [12.6, 10, 1.2], DPLANK), slab([0, 3, 38], [12, 9.4, 4], mat('leather', 1, 6, { tex: TEX.planks(5, 0.25) })));
    P.push(box([0, 12.7, 42.6], [5, 0.5, 2.6], TEAM));
    for (const [x, y] of [[-11.6, 12], [11.6, 12], [-11.6, -6], [11.6, -6]]) P.push(cap([x, y, 38], [x, y, 54], 0.9, DBEAM));
    P.push(...late(fru([0, 3, 53], 17, 0.5, 15, HIDE)));
    for (let k = 0; k < 6; k++) { const a = k * 1.05 + 0.3; P.push(...late(fru([Math.cos(a) * 14.6, 3 + Math.sin(a) * 12, 53.6], 1.1, 0, 5, BONE, aim([Math.cos(a) * 0.7, Math.sin(a) * 0.7, 0.6])))); }
    P.push(...late(skull(0, 13.4, 33, 1)));
    P.push(...late(cap([0, 3, 66], [0.6, 3, 80], 0.6, DBEAM), box([4.2, 3, 76], [3.6, 0.4, 2.6], TEAM)));
    // ladder
    P.push(cap([-4, 16, 0], [-3, 11, 36], 0.6, BEAM), cap([1, 16, 0], [2, 11, 36], 0.6, BEAM));
    for (let z = 5; z < 36; z += 5.5) P.push(cap([-4 + z / 36, 16 - z * 0.14, z], [1 + z / 36, 16 - z * 0.14, z], 0.5, BEAM));
    return P;
  },
};

function mine() {
  const P = [];
  const rk = mat('rock', 1, 8, { tex: (lp, n, wp) => {
    const h = hash2(Math.floor(wp[0] * 0.9 + wp[2] * 0.6), Math.floor(wp[1] * 0.9 - wp[2] * 0.4));
    if (h > 0.965) return { ramp: 'gold', lo: 3, hi: 7, d: 0.35 };
    return (h - 0.5) * 0.16 + (hash2(Math.floor(wp[2] / 5 + wp[0] / 14), 5) - 0.5) * 0.1;
  } });
  P.push(boulder([0, -6, 0], [38, 22, 26], 1, rk), boulder([-25, 2, 0], [18, 17, 18], 2, rk), boulder([25, 0, 0], [20, 18, 20], 3, rk), boulder([8, -14, 0], [19, 13, 33], 4, rk), boulder([-13, -12, 0], [15, 12, 29], 5, rk));
  P.push(boulder([-36, 14, 0], 7, 6, rk), boulder([38, 16, 0], 6, 7, rk), boulder([0, 4, 0], [16, 16, 23], 8, rk));
  // timbered entrance
  P.push(sph([0, 18.5, 0], [11.6, 6, 17], mat('gray', 0, 1, { glow: 0.02 })));
  P.push(cap([-11.6, 24, 0], [-10.6, 24, 17], 2, BEAM), cap([11.6, 24, 0], [10.6, 24, 17], 2, BEAM), cap([-14, 24, 18], [14, 24, 18], 2.3, BEAM));
  // rails and an ore cart
  P.push(cap([-3.6, 22, 0.4], [-5, 44, 0.4], 0.6, IRON), cap([3.6, 22, 0.4], [5, 44, 0.4], 0.6, IRON));
  for (let y = 26; y < 44; y += 4.4) P.push(cap([-6.5, y, 0.2], [6.5, y, 0.2], 0.7, DBEAM));
  P.push(slab([24, 36, 2.4], [5.4, 7, 3.4], mat('wood', 1, 6, { tex: TEX.planks(3) })), sph([24, 36, 9], [4.4, 6, 2.6], mat('gold', 2, 7, { spec: 0.6, tex: TEX.noise(0.6, 2) })));
  for (const y of [32, 40]) for (const x of [18.4, 29.6]) P.push(fru([x, y, 2.4], 2.4, 2.4, 1, IRON, x < 24 ? rot(0, 0, -90) : SIDE));
  // nuggets
  for (const [x, y, r] of [[-22, 32, 2.4], [-27, 28, 1.8], [-17, 37, 1.6], [12, 42, 1.5], [-31, 36, 1.4]]) P.push(sph([x, y, r * 0.6], r, mat('gold', 2, 7, { spec: 0.7, tex: TEX.noise(0.4, 2.5) })));
  P.push(cap([-36, 26, 0], [-34, 26, 13], 0.7, DBEAM), fru([-34, 26, 11], 1.6, 1.2, 3, IRON), sph([-34, 26, 15], 1.5, mat('fire', 4, 7, { glow: 0.95 })));
  return P;
}

// scaffolding around a footprint of n tiles
function scaffold(n, h, sc) {
  const P = [], r = (n * 16 - 5) / sc, m = mat('wood', 3, 8), yb = (n * 16 - 6) / sc;
  for (const x of [-r, -r / 3, r / 3, r]) P.push(cap([x, yb, 0], [x, yb, h], 0.8, m));
  for (let z = 9; z < h; z += 10) P.push(cap([-r - 1.5, yb, z], [r + 1.5, yb, z], 0.7, m));
  P.push(slab([-r / 3, yb - 2, h * 0.5], [r * 0.62, 1.8, 0.5], mat('wood', 2, 7, { tex: TEX.boards(3) })));
  P.push(cap([-r, yb, 1], [-r / 3, yb, h - 2], 0.55, BEAM), cap([r, yb, 1], [r / 3, yb, h - 2], 0.55, BEAM));
  // ladder and a stack of timber
  P.push(cap([r * 0.55, yb + 4, 0], [r * 0.55, yb, h], 0.5, BEAM), cap([r * 0.75, yb + 4, 0], [r * 0.75, yb, h], 0.5, BEAM));
  for (let z = 4; z < h; z += 5) P.push(cap([r * 0.55, yb + 4 - z * 4 / h, z], [r * 0.75, yb + 4 - z * 4 / h, z], 0.45, BEAM));
  return P;
}
function site(n) { // freshly staked-out plot
  const P = [], r = n * 16 - 5;
  const st = mat('stone', 2, 8, { tex: TEX.brick(7, 3) });
  P.push(slab([0, r * 0.95, 0], [r, 2.2, 2], st), slab([0, -r * 0.8, 0], [r, 2.2, 2.6], st), slab([-r, 0.07 * r, 0], [2.2, r * 0.88, 2.2], st), slab([r, 0.07 * r, 0], [2.2, r * 0.88, 2.2], st));
  for (const [x, y] of [[-r, -r * 0.8], [r, -r * 0.8], [-r, r * 0.95], [r, r * 0.95]]) P.push(cap([x, y, 0], [x, y, 15], 1.1, BEAM));
  P.push(cap([-r, -r * 0.8, 14], [r, -r * 0.8, 14], 0.8, BEAM));
  P.push(...logPile(-r * 0.35, r * 0.2, n > 2 ? 3 : 2, r * 0.3));
  P.push(slab([r * 0.45, -r * 0.1, 0], [r * 0.25, r * 0.2, 2.4], st), slab([r * 0.5, -r * 0.12, 4.8], [r * 0.16, r * 0.14, 1.6], st));
  if (n > 2) { P.push(cap([r * 0.2, r * 0.55, 0], [r * 0.34, r * 0.5, 12], 0.7, BEAM), cap([r * 0.48, r * 0.55, 0], [r * 0.34, r * 0.5, 12], 0.7, BEAM), cap([r * 0.34, r * 0.3, 0], [r * 0.34, r * 0.5, 12], 0.7, BEAM)); }
  return P;
}

// stage: 0 = site, 1 = walls up with scaffolding, 2 = finished
export function buildingModel(type, faction, stage) {
  const n = B_SIZE[type];
  if (type === 'mine') return { prims: mine(), yaw: 0, n, scale: 1.05, dy: 6 };
  if (stage === 0) return { prims: site(n), yaw: 16, n, scale: 1, dy: 2 };
  let P = (faction ? WARBAND : KINGDOM)[type]();
  if (stage === 1) {
    let top = 0; P = P.filter(p => !p.late); for (const p of P) { const z = p.k === 1 ? Math.max(p.a[2], p.b[2]) : p.k === 3 ? p.c[2] + p.h : p.c[2]; if (z > top) top = z; }
    const sc = (FIT[faction][type] || {}).scale || 1; P = P.concat(scaffold(n, Math.max(14, Math.min(top * 0.55, 26)), sc));
    return { prims: P, yaw: type === 'tower' ? 14 : 18, n, ...(FIT[faction][type] || {}), capRamp: 'wood' };
  }
  return { prims: P, yaw: type === 'tower' ? 14 : 18, n, ...(FIT[faction][type] || {}) };
}
// per-building scale and vertical shift so each one fills its footprint
const FIT = [
  { hall: { scale: 1.18, dy: 14 }, farm: { scale: 1.2, dy: 4 }, barracks: { scale: 1.3, dy: 14 }, mill: { scale: 1.3, dy: 12 }, stable: { scale: 1.25, dy: 12 }, forge: { scale: 1.35, dy: 14 }, tower: { scale: 1.3, dy: 14 } },
  { hall: { scale: 1.16, dy: 12 }, farm: { scale: 1.15, dy: 4 }, barracks: { scale: 1.12, dy: 8 }, mill: { scale: 1.15, dy: 6 }, stable: { scale: 1.1, dy: 8 }, forge: { scale: 1.25, dy: 10 }, tower: { scale: 1.3, dy: 10 } },
];
// sprite layout: footprint top-left is at (PADL, PADT) inside the image
// room around the footprint for tall roofs, flags and overhanging rock (too little crops the mine's outcrop)
export const B_PAD = { l: 22, t: 72, r: 46, b: 10 };
export function buildingView(m) { const n = m.n; return { w: n * 32 + B_PAD.l + B_PAD.r, h: n * 32 + B_PAD.t + B_PAD.b, ox: B_PAD.l + n * 16, oy: B_PAD.t + n * 16 + (m.dy || 0), scale: m.scale || 1, yaw: m.yaw, ky: 0.74, kz: 0.8, edge: 3, edgeDark: 2, capRamp: m.capRamp }; }
