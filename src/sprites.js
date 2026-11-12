// Sprite factory. Units, buildings and props are modelled in units.js / buildings.js
// and drawn by the r3d renderer into 8-bit palette images; this module caches them,
// applies the per-team colour lookup, and paints the 2D effects and interface art.
import { c, teamLUT, PAL, R, SHADOW } from './palette.js';
import { rng } from './map.js';
import { Img } from './img.js';
import { render, sph, cap, box, slab, fru, mat, rot, aim, hash2, norm, scl as scl3, TEX } from './r3d.js';
import { unitModel, corpseModel, UNIT_VIEW } from './units.js';
import { buildingModel, buildingView, B_PAD, boulder } from './buildings.js';

export { Img };
const LUTS = [];
export function lut(team) { return LUTS[team] || (LUTS[team] = teamLUT(team)); }
const OUT = c('outline', 0);
const cache = new Map();
function memo(key, fn) { let v = cache.get(key); if (v === undefined) { v = fn(); cache.set(key, v); } return v; }

// ------------------------------------------------------------------ units
// dir: 0 = facing the viewer (south), then clockwise in 45 degree steps (1 = SW, 2 = W ... 7 = SE)
export const UNIT_OFF = { x: UNIT_VIEW.ox - 16, y: UNIT_VIEW.oy - 26 }; // draw at (tileX - x, tileY - y)
export function unitSprite(type, faction, team, frame, carry, chopping, dir = 0) {
  const k = `u${type}${faction}${frame}${carry || ''}${chopping ? 'c' : ''}${dir}`;
  return memo(k + '/' + team, () => memo(k, () => render(unitModel(type, faction, frame, carry, chopping), { ...UNIT_VIEW, yaw: dir * 45 })).toCanvas(lut(team)));
}
export function corpseSprite(type, faction, team, stage) {
  return memo(`corpse${type}${faction}${stage}/${team}`, () => {
    let im;
    if (stage < 2) {
      im = new Img(UNIT_VIEW.w, UNIT_VIEW.h);
      const r = rng(type.length * 7 + faction);
      if (type !== 'siege') for (let k = 0; k < 90; k++) { const a = r.int(628) / 100, d = Math.sqrt(r.int(100) / 100); im.set(36 + Math.cos(a) * d * 13, 52 + Math.sin(a) * d * 6, c('blood', 1 + r.int(3))); }
      im.blit(render(corpseModel(type, faction), { ...UNIT_VIEW, shadow: false }), 0, 0);
    } else {
      im = new Img(UNIT_VIEW.w, UNIT_VIEW.h); const B = (i) => c('bone', i), x = 28, y = 50;
      if (type === 'siege') { im.line(x - 2, y + 2, x + 16, y - 1, c('wood', 3), 2); im.line(x + 4, y + 5, x + 12, y - 4, c('wood', 2), 2); im.shade(x + 2, y - 1, 3, 3, (nx, ny) => (nx * nx + ny * ny > 0.5 ? c('wood', 2) : c('wood', 4))); }
      else {
        im.shade(x, y, 3, 3, (nx, ny) => B(nx + ny < -0.3 ? 5 : nx + ny > 0.6 ? 2 : 4)); im.set(x - 1, y, c('gray', 1)); im.set(x + 1, y, c('gray', 1)); im.set(x, y + 2, c('gray', 2));
        im.line(x + 4, y + 1, x + 13, y + 2, B(3)); for (let k = 0; k < 4; k++) { im.line(x + 5 + k * 2, y - 2, x + 5 + k * 2, y + 4, B(4)); im.set(x + 5 + k * 2, y - 2, B(5)); }
        im.line(x + 13, y + 2, x + 19, y - 1, B(3)); im.line(x + 13, y + 2, x + 18, y + 5, B(3)); im.line(x + 5, y - 2, x + 2, y - 6, B(3));
        if (type === 'knight') { im.shade(x + 18, y - 6, 4, 2, () => B(4)); for (let k = 0; k < 4; k++) im.line(x + 10 + k * 2, y - 9, x + 11 + k * 2, y - 4, B(3)); }
        im.outline(c('bone', 0));
      }
    }
    return im.toCanvas(lut(team));
  });
}

// ------------------------------------------------------------------ buildings
export const BUILD_OFF = { x: B_PAD.l, y: B_PAD.t }; // draw at (tileX - x, tileY - y)
function buildingImg(type, faction, stage) {
  return memo(`b${type}${type === 'mine' ? 0 : faction}${stage}`, () => {
    const m = buildingModel(type, faction, stage), v = buildingView(m), n = m.n;
    const im = new Img(v.w, v.h), top = render(m.prims, v);
    // trodden earth under and around the building
    if (type !== 'mine') {
      const D = R.dirt, cx = B_PAD.l + n * 16 - 2, cy = B_PAD.t + n * 16 + 3, rx = n * 16 + 2, ry = n * 16 + 1;
      for (let y = 0; y < v.h; y++) for (let x = 0; x < v.w; x++) {
        const dx = (x - cx) / rx, dy = (y - cy) / ry, q = Math.pow(Math.abs(dx), 3.2) + Math.pow(Math.abs(dy), 3.2) + (hash2(x >> 2, y >> 2) - 0.5) * 0.22 + (hash2(x >> 3, (y >> 3) + 9) - 0.5) * 0.3;
        if (q < 0.8 || (q < 0.92 && hash2(x, y + 3) > 0.55)) im.d[y * v.w + x] = D[Math.max(2, Math.min(6, Math.round(4.1 + (hash2(x, y) - 0.5) * 1.5 + (hash2(x >> 2, y >> 2) - 0.5) * 1.3 - (q > 0.66 ? 0.8 : 0))))];
      }
    }
    for (let i = 0; i < top.d.length; i++) {
      const t = top.d[i]; if (!t) continue;
      if (t === SHADOW && im.d[i]) im.d[i] = Math.max(R.dirt[0], im.d[i] - 2); else im.d[i] = t;
    }
    return im;
  });
}
export function buildingSprite(type, faction, team, stage) {
  return memo(`b${type}${faction}${stage}/${team}`, () => buildingImg(type, faction, stage).toCanvas(lut(team)));
}

export function rubbleSprite(size) {
  return memo('rubble' + size, () => {
    const r = rng(size * 31), P = [], m = mat('stone', 1, 7, { tex: TEX.noise(0.2, 1) }), w = size * 32;
    for (let k = 0; k < size * size * 4; k++) { const x = (r.int(1000) / 1000 - 0.5) * (w - 16), y = (r.int(1000) / 1000 - 0.5) * (w - 14) / 0.74; P.push(boulder([x, y, 0], 2.5 + r.int(40) / 10, k + size * 9, r.int(3) ? m : mat('rock', 1, 6), 0.7)); }
    for (let k = 0; k < size * 3; k++) { const x = (r.int(1000) / 1000 - 0.5) * (w - 24), y = (r.int(1000) / 1000 - 0.5) * (w - 24), a = r.int(628) / 100, l = 6 + r.int(8); P.push(cap([x, y, 1], [x + Math.cos(a) * l, y + Math.sin(a) * l, 1 + r.int(5)], 1.1, mat('wood', 0, 4))); }
    const top = render(P, { w: w + 8, h: w + 8, ox: w / 2 + 4, oy: w / 2 + 4, ky: 0.74, kz: 0.8 });
    const im = new Img(w + 8, w + 8), D = R.dirt;
    for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) { const dx = (x - im.w / 2) / (w / 2), dy = (y - im.h / 2) / (w / 2), q = dx * dx + dy * dy + (hash2(x >> 1, y >> 1) - 0.5) * 0.5; if (q < 0.85) im.d[y * im.w + x] = (q > 0.6 && ((x + y) & 1)) ? 0 : (hash2(x, y) < 0.12 ? c('gray', 1) : D[1 + ((hash2(x, y + 5) * 3) | 0)]); }
    im.blit(top, 0, 0);
    return im.toCanvas(lut(0));
  });
}

// ------------------------------------------------------------------ effects
// Flames, smoke and explosions are modelled like everything else: glowing cones and blobs
// rendered through r3d, so they have volume and sit in the same oblique view as the buildings.
const VIEW_DIR = [0, 0.837, 0.546]; // unit vector towards the camera for the default projection
// self-lit material: hottest low down and where the surface faces the viewer, cooling to dark red at the rim
function flameMat(top, heat, seed) {
  return mat('fire', 0, 7, {
    glow: 1, noShadow: true, tex: (lp, n, wp) => {
      const f = Math.max(0, n[0] * VIEW_DIR[0] + n[1] * VIEW_DIR[1] + n[2] * VIEW_DIR[2]);
      const t = Math.max(0, Math.min(1, wp[2] / top));
      return { abs: heat * (1.08 - 0.72 * t) * (0.34 + 0.66 * Math.pow(f, 0.8)) + (hash2(wp[0] * 1.5 + seed, wp[2] * 1.5 - seed) - 0.5) * 0.14 };
    },
  });
}
const SMOKE = mat('gray', 3, 10, { noShadow: true, tex: TEX.noise(0.12, 0.8) });
// copy `src` onto `dst`, thinning it with an ordered pattern (0 = solid ... 3 = wisps) to fake translucency
function blitThin(dst, src, level) {
  for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) {
    const v = src.d[y * src.w + x]; if (!v) continue;
    if (level === 1 && (x & 1) && (y & 1)) continue;
    if (level === 2 && ((x + y) & 1)) continue;
    if (level >= 3 && ((x & 1) || (y & 1))) continue;
    dst.d[y * src.w + x] = v;
  }
}

export const FIRE_FRAMES = 8;
// A looping building fire. The canvas carries .ax/.ay: the pixel that sits on the burning spot.
export function fireSprite(frame, big) {
  return memo('fire' + frame + big, () => {
    const S = big ? 1.3 : 0.85, w = Math.round(40 * S) + 2, h = Math.round(64 * S), ax = Math.round(16 * S), ay = h - Math.round(6 * S);
    const ph = (k) => Math.sin((frame / FIRE_FRAMES + k) * Math.PI * 2), TOP = 30;
    const view = { w, h, ox: ax, oy: ay, scale: S, shadow: false, outline: false, selfShadow: false, ground: false, dither: 0.9, edge: 1.6, edgeDark: 1 };
    // tongues: [x, y, base radius, height, phase]
    const P = [], fm = flameMat(TOP, 1, frame * 7.3);
    for (const [x, y, r, ht, k] of [[0, 0, 5.6, 27, 0], [-5.6, 1.5, 4.3, 17, 0.37], [5.4, 1, 4.4, 19, 0.71], [-1.5, 4.5, 4, 13, 0.18], [2.5, -3.5, 4.2, 22, 0.55], [-9, -1, 3, 10, 0.86], [9, 2.5, 2.9, 9, 0.24]]) {
      const hh = ht * (0.74 + 0.26 * ph(k)), lean = aim([0.16 * ph(k + 0.3) + 0.08, 0.05 * ph(k * 2 + 0.1), 1]);
      P.push(sph([x, y, r * 0.7], [r, r, r * 0.9], fm), fru([x, y, r * 0.6], r * 0.96, 0, hh, fm, lean));
    }
    // licks of flame that break off and rise
    for (const k of [0.1, 0.6]) {
      const u = (frame / FIRE_FRAMES + k) % 1, r = 1.5 * (1 - u) + 0.4;
      P.push(sph([(k - 0.35) * 9 + u * 2.5, 0, 19 + u * 10], [r, r, r * 1.6], fm));
    }
    const im = new Img(w, h);
    // smoke puffs drift up and downwind, growing and thinning as they go
    for (const k of [0, 1 / 3, 2 / 3]) {
      const u = (frame / FIRE_FRAMES + k) % 1, r = 4 + u * 4.5;
      const puff = [sph([2 + u * 9 + Math.sin(k * 20) * 2, -1, 24 + u * 24], [r, r, r * 0.85], SMOKE), sph([-1 + u * 7, 1, 21 + u * 21], [r * 0.7, r * 0.7, r * 0.6], SMOKE)];
      blitThin(im, render(puff, { ...view, dither: 0.6 }), u < 0.3 ? 1 : u < 0.7 ? 2 : 3);
    }
    im.blit(render(P, view), 0, 0);
    const cv = im.toCanvas(lut(0)); cv.ax = ax; cv.ay = ay; return cv;
  });
}
// Explosion, 5 frames on a 48x48 canvas centred on (24,24): a fireball that swells, breaks up and leaves smoke.
export function boomSprite(frame) {
  return memo('boom' + frame, () => {
    const r = rng(1234), u = () => r.int(2001) / 1000 - 1;
    const grow = [0.38, 0.72, 1, 0.8, 0.45][frame], spread = [1.5, 4.5, 7.5, 10, 12][frame], heat = [1.12, 1, 0.82, 0.6, 0.42][frame];
    const view = { w: 48, h: 48, ox: 24, oy: 31, shadow: false, outline: false, selfShadow: false, ground: false, dither: 0.9, edge: 1.8, edgeDark: 1 };
    const fire = [], smoke = [], fm = flameMat(40, heat, frame * 5.1);
    for (let k = 0; k < 9; k++) {
      const d = norm([u(), u(), u() * 0.8 + 0.3]), rad = (k ? 4.2 + (k % 3) : 7) * grow, c0 = k ? scl3(d, spread) : [0, 0, 0];
      fire.push(sph([c0[0], c0[1], 7 + c0[2]], [rad, rad, rad], fm));
      if (frame >= 2) { const sr = 3.4 + (k % 3) * 1.2 + (frame - 2) * 0.8; smoke.push(sph([c0[0] * 1.15, c0[1] * 1.15, 9 + c0[2] * 1.1 + (frame - 2) * 4], [sr, sr, sr * 0.85], SMOKE)); }
    }
    // sparks thrown clear on a ballistic arc
    const t = frame + 1;
    for (let k = 0; k < 8; k++) { const dx = u(), dy = u(), up = 2.2 + (k % 3) * 0.7; fire.push(sph([dx * 4.6 * t, dy * 4.6 * t, Math.max(0.6, 7 + up * t - 0.42 * t * t)], Math.max(0.5, 1.5 - frame * 0.22), fm)); }
    const im = new Img(48, 48);
    if (smoke.length) blitThin(im, render(smoke, { ...view, dither: 0.6 }), frame - 2);
    im.blit(render(fire, view), 0, 0);
    return im.toCanvas(lut(0));
  });
}
export function missileSprite(kind) {
  return memo('mis' + kind, () => {
    let im;
    if (kind === 'rock') im = render([boulder([0, 0, 0], [4, 4, 4.6], 77, mat('rock', 2, 8, { tex: TEX.noise(0.2, 1.4) }))], { w: 12, h: 12, ox: 6, oy: 9, ky: 0.74, kz: 0.8, shadow: false });
    else { im = new Img(15, 5); im.line(1, 2, 11, 2, c('wood', 7)); im.line(2, 3, 10, 3, c('wood', 3)); im.set(12, 2, c('steel', 8)); im.set(13, 2, c('steel', 9)); im.set(12, 1, c('steel', 6)); im.set(12, 3, c('steel', 4)); im.set(0, 1, c('bone', 5)); im.set(1, 1, c('bone', 4)); im.set(0, 3, c('bone', 3)); im.set(1, 3, c('bone', 3)); im.set(0, 2, c('bone', 4)); im.outline(OUT); }
    return im.toCanvas(lut(0));
  });
}

// ------------------------------------------------------------------ interface
// weathered carved stone
export function stonePanel(w, h, seed = 3) {
  const r = rng(seed), im = new Img(w, h), U = R.ui;
  const bw = 44, bh = 26;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const row = Math.floor(y / bh), xo = x + (row & 1 ? bw / 2 : 0) + ((hash2(row, seed) * 12) | 0), col = Math.floor(xo / bw), lx = xo - col * bw, ly = y - row * bh;
    let v = 4.2 + (hash2(col + seed * 3, row) - 0.5) * 1.8 + (hash2(x >> 2, y >> 2) - 0.5) * 1.0 + (hash2(x, y) - 0.5) * 1.5 + (hash2((x + y) >> 4, (x - y) >> 4) - 0.5) * 0.9;
    if (lx < 1 || ly < 1) v = 1; else if (lx < 2 || ly < 2) v += 1.6; else if (lx > bw - 2 || ly > bh - 2) v -= 1.5;
    im.d[y * w + x] = U[Math.max(0, Math.min(8, Math.round(v)))];
  }
  // cracks and pits
  for (let k = 0; k < (w * h) / 2600; k++) { let x = r.int(w), y = r.int(h); for (let j = 0; j < 6 + r.int(12); j++) { im.set(x, y, U[1]); im.set(x + 1, y + 1, U[6]); x += r.int(3) - 1 + (j & 1); y += 1 - (r.int(4) === 0 ? 2 : 0); } }
  for (let k = 0; k < (w * h) / 500; k++) { const x = r.int(w), y = r.int(h); im.set(x, y, U[2]); im.set(x + 1, y + 1, U[6]); }
  return im.toCanvas(lut(0));
}
export function woodPanel(w, h) {
  const im = new Img(w, h), Wd = R.wood;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const plank = Math.floor(x / 96), g = Math.sin((y + plank * 5) * 1.3 + Math.sin(x * 0.045 + plank) * 2.4);
    let v = 3 + g * 0.8 + (hash2(x >> 3, y + plank * 7) - 0.5) * 1.3 + (hash2(x, y) - 0.5) * 0.6;
    if (x % 96 === 0) v = 0; else if (x % 96 === 1) v += 1.2;
    im.d[y * w + x] = Wd[Math.max(0, Math.min(6, Math.round(v)))];
  }
  im.rect(0, 0, w, 1, Wd[7]); im.rect(0, 1, w, 1, Wd[5]); im.rect(0, h - 1, w, 1, Wd[0]); im.rect(0, h - 2, w, 1, Wd[1]);
  for (let x = 6; x < w; x += 96) for (const dx of [0, 84]) { im.set(x + dx, 3, c('steel', 6)); im.set(x + dx + 1, 3, c('steel', 3)); im.set(x + dx, 4, c('steel', 2)); im.set(x + dx + 1, 4, c('steel', 1)); }
  return im.toCanvas(lut(0));
}
// ornate bronze frame, drawn straight onto a 2D context. inset = sunken panel
const pc = (ramp, i) => { const k = c(ramp, i); return `rgb(${PAL[k * 3]},${PAL[k * 3 + 1]},${PAL[k * 3 + 2]})`; };
export function frame(ctx, x, y, w, h, style = 'gold') {
  const rp = style === 'ui' ? 'ui' : 'gold', hi = style === 'ui' ? 8 : style === 'gold' ? 5 : 3, mid = style === 'ui' ? 5 : style === 'gold' ? 3 : 2, lo = style === 'gold' ? 1 : 0;
  ctx.fillStyle = '#000'; ctx.fillRect(x - 3, y - 3, w + 6, 1); ctx.fillRect(x - 3, y + h + 2, w + 6, 1); ctx.fillRect(x - 3, y - 3, 1, h + 6); ctx.fillRect(x + w + 2, y - 3, 1, h + 6);
  ctx.fillStyle = pc(rp, hi); ctx.fillRect(x - 2, y - 2, w + 4, 1); ctx.fillRect(x - 2, y - 2, 1, h + 4);
  ctx.fillStyle = pc(rp, lo); ctx.fillRect(x - 2, y + h + 1, w + 4, 1); ctx.fillRect(x + w + 1, y - 2, 1, h + 4);
  ctx.fillStyle = pc(rp, mid); ctx.fillRect(x - 1, y - 1, w + 2, 1); ctx.fillRect(x - 1, y - 1, 1, h + 2); ctx.fillRect(x - 1, y + h, w + 2, 1); ctx.fillRect(x + w, y - 1, 1, h + 2);
  ctx.fillStyle = pc(rp, lo); ctx.fillRect(x, y, w, 1); ctx.fillRect(x, y, 1, h);
  // corner studs
  for (const [cx, cy] of [[x - 3, y - 3], [x + w, y - 3], [x - 3, y + h], [x + w, y + h]]) { ctx.fillStyle = '#000'; ctx.fillRect(cx - 1, cy - 1, 5, 5); ctx.fillStyle = pc(rp, mid); ctx.fillRect(cx, cy, 3, 3); ctx.fillStyle = pc(rp, hi + 1); ctx.fillRect(cx, cy, 2, 1); ctx.fillRect(cx, cy, 1, 2); ctx.fillStyle = pc(rp, lo); ctx.fillRect(cx + 2, cy + 1, 1, 2); ctx.fillRect(cx + 1, cy + 2, 2, 1); }
}

function iconBg(im, hue = 'slate') {
  const S = R[hue];
  for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) {
    const dx = (x - im.w * 0.42) / im.w, dy = (y - im.h * 0.4) / im.h, v = 3.2 - (dx * dx + dy * dy) * 9 + (hash2(x, y) - 0.5) * 0.9 + (((x + y) & 1) ? 0.25 : -0.25);
    im.d[y * im.w + x] = S[Math.max(0, Math.min(4, Math.round(v)))];
  }
}
const I_STEEL = mat('steel', 1, 9, { spec: 0.6, shin: 8 }), I_GOLD = mat('gold', 1, 7, { spec: 0.6 }), I_WOOD = mat('wood', 2, 8), I_LEATHER = mat('leather', 1, 7), I_TEAM = mat('team', 1, 7, { spec: 0.2 });
function iconModel(name) {
  const P = [];
  const sword = (a, b, s = 1) => { const d = [b[0] - a[0], 0, b[2] - a[2]], l = Math.hypot(d[0], d[2]), u = [d[0] / l, 0, d[2] / l], at = (k) => [a[0] + u[0] * k, a[1], a[2] + u[2] * k]; P.push(cap(at(0), at(6 * s), 1.3 * s, I_LEATHER), sph(at(-1), 2 * s, I_GOLD), cap([at(7 * s)[0] - u[2] * 5 * s, a[1], at(7 * s)[2] + u[0] * 5 * s], [at(7 * s)[0] + u[2] * 5 * s, a[1], at(7 * s)[2] - u[0] * 5 * s], 1.3 * s, I_GOLD), box(at(7 * s + (l - 7 * s) / 2), [1.9 * s, 0.7, (l - 9 * s) / 2], I_STEEL, aim(u)), sph(at(l - 1.5 * s), [1.7 * s, 0.6, 3 * s], I_STEEL, aim(u))); };
  const shield = (x, z, s = 1, m = I_TEAM) => P.push(sph([x, 0, z], [10 * s, 2.4, 12 * s], Object.assign({}, m, { tex: (lp) => { const r = lp[0] * lp[0] / (100 * s * s) + lp[2] * lp[2] / (144 * s * s); return r > 0.72 ? { ramp: 'steel', d: 0.15 } : lp[0] * lp[0] + lp[2] * lp[2] < 7 * s * s ? { ramp: 'gold', d: 0.3 } : (Math.abs(lp[0]) < 1.4 * s || Math.abs(lp[2] - 1) < 1.4 * s) ? { ramp: 'cloth', lo: 3, hi: 5, d: 0.2 } : 0; } })));
  switch (name) {
    case 'move': // marching boot
      P.push(cap([-2, 0, 4], [-2, 0, 14], 5, I_LEATHER), sph([2, 0, -4], [9.5, 5, 5], I_LEATHER), sph([8, 0, -5], [5, 4.6, 4], mat('leather', 2, 7)), fru([-2, 0, 12], 5.8, 6.4, 3.4, mat('leather', 3, 7), rot(0, 0, 0)), box([2, 0, -9.4], [10, 4.6, 1.1], mat('leather', 0, 3)));
      for (const z of [0, 4, 8]) P.push(cap([-0.5, 4.8, z], [3, 4.4, z + 1], 0.6, I_GOLD));
      break;
    case 'stop': shield(0, 0, 1.05); break;
    case 'attack': sword([-12, 0, -11], [12, 0, 12], 1.05); break;
    case 'hold': sword([10, -3, -12], [-9, -3, 13], 0.9); sword([-10, -3, -12], [9, -3, 13], 0.9); shield(0, -1, 0.8); break;
    case 'gather': {
      const u = [0.62, 0, 0.78]; P.push(cap([-10, 0, -12], [6, 0, 8], 1.4, I_WOOD));
      for (let k = -4; k <= 4; k++) { const t = k / 4; P.push(sph([6 - u[2] * 12 * t - u[0] * t * t * 5, 0, 8 + u[0] * 12 * t - u[2] * t * t * 5], [2 - Math.abs(t) * 0.9, 1.4, 2 - Math.abs(t) * 0.9], I_STEEL)); }
      P.push(boulder([9, 2, -13], [6, 5, 6], 5, mat('gold', 2, 7, { spec: 0.7, tex: TEX.noise(0.4, 2) })), boulder([2, 3, -13], [3.4, 3, 3.6], 6, mat('gold', 2, 7, { spec: 0.7 })));
      break;
    }
    case 'return': // sack of gold
      P.push(sph([0, 0, -3], [11, 8, 10], mat('cloth', 1, 5, { tex: TEX.noise(0.15, 1.2) })), fru([0, 0, 5], 4.2, 6.5, 5, mat('cloth', 1, 5)), fru([0, 0, 4.4], 4.8, 4.8, 1.6, I_LEATHER));
      P.push(sph([0, 7, -3], [4.6, 1.6, 4.6], mat('gold', 2, 7, { spec: 0.6, tex: (lp) => (Math.abs(lp[0]) < 1 && Math.abs(lp[2]) < 3 ? -0.5 : 0) })));
      for (const [x, z] of [[-10, -11], [-5, -12.4], [9, -11.6], [12, -9]]) P.push(sph([x, 4, z], [2.4, 2.2, 1.4], I_GOLD));
      break;
    case 'build': case 'build2':
      P.push(cap([-10, 0, -12], [4, 0, 6], 1.5, I_WOOD), box([6, 0, 8.6], [4, 3.6, 7.4], I_STEEL, rot(0, 0, 38)));
      if (name === 'build2') { P.push(slab([9, 2, -13], [7, 4, 3], mat('stone', 2, 8, { tex: TEX.brick(6, 3) })), slab([10, 2, -7], [4, 3, 2], mat('stone', 2, 8)), fru([-10, 2, 4], 2.6, 0, 6, I_GOLD), fru([-10, 2, 2], 2.6, 2.6, 2, I_GOLD)); }
      break;
    case 'cancel': P.push(cap([-10, 0, -10], [10, 0, 10], 2.9, mat('blood', 1, 3, { spec: 0.6, tex: () => 0.25 })), cap([-10, 0.5, 10], [10, 0.5, -10], 2.9, mat('roofr', 2, 6, { spec: 0.5 }))); break;
    case 'back': {
      let a = [10, 0, -8]; for (let k = 1; k <= 7; k++) { const t = k / 7, an = -0.5 + t * 3.0, b = [Math.cos(an) * 9, 0, 1 + Math.sin(an) * 8]; P.push(cap(a, b, 2.3, I_GOLD)); a = b; }
      P.push(fru([-8.6, 0, 2], 5.6, 0, 9, I_GOLD, aim([-0.25, 0, -1])));
      break;
    }
  }
  return P;
}
// command icons 46x38
export function cmdIcon(name, team) {
  return memo('icon' + name + '/' + team, () => {
    const im = new Img(46, 38); iconBg(im, name === 'cancel' ? 'ui' : 'slate');
    im.blit(render(iconModel(name), { w: 46, h: 38, ox: 23, oy: 19, ky: 0.3, kz: 1, shadow: false, ground: false, selfShadow: false, edge: 2 }), 0, 0);
    return im.toCanvas(lut(team));
  });
}
// entity portrait: a close-up of the unit model, or a miniature of the building
export function entIcon(type, faction, team, isUnit) {
  return memo('port' + type + faction + '/' + team, () => {
    const im = new Img(46, 38); iconBg(im, faction ? 'leather' : 'slate');
    if (isUnit) {
      const v = type === 'siege' ? { scale: 1.45, ox: 22, oy: 33, yaw: 40 } : type === 'knight' ? { scale: 1.6, ox: 19, oy: faction ? 70 : 78, yaw: 28 } : { scale: 2.2, ox: 23, oy: faction ? 69 : 72, yaw: 22 };
      im.blit(render(unitModel(type, faction, 'idle', null, false), { w: 46, h: 38, shadow: false, ground: false, edge: 3, ...v }), 0, 0);
      return im.toCanvas(lut(team));
    }
    const cv = im.toCanvas(lut(team)), ctx = cv.getContext('2d'), s = buildingSprite(type, faction, team, 2), src = buildingImg(type, faction, 2);
    // crop to the building itself (ignore the earth patch and shadow)
    let x0 = 1e9, y0 = 1e9, x1 = 0, y1 = 0; const D0 = R.dirt[0], D1 = R.dirt[R.dirt.length - 1];
    for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) { const v = src.d[y * src.w + x]; if (!v || v === SHADOW || (v >= D0 && v <= D1)) continue; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    const sw = x1 - x0 + 1, sh = y1 - y0 + 1, k = Math.min(44 / sw, 36 / sh);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(s, x0, y0, sw, sh, (46 - sw * k) / 2, (38 - sh * k) / 2, sw * k, sh * k);
    return cv;
  });
}
// tiny resource icons for the top bar
export function resIcon(kind) {
  return memo('res' + kind, () => {
    let P;
    if (kind === 'gold') P = [boulder([0, 0, 0], [6, 5, 7], 5, mat('gold', 2, 7, { spec: 0.7, tex: TEX.noise(0.3, 2) })), boulder([-5, 2, 0], 3, 8, mat('gold', 2, 7, { spec: 0.7 }))];
    else if (kind === 'wood') { const m = mat('wood', 2, 7, { tex: TEX.noise(0.2, 1.5) }); P = []; for (const [y, z] of [[-2.5, 2.4], [2.5, 2.4], [0, 6.4]]) P.push(cap([-5, y, z], [5, y, z], 2.4, m), sph([6.4, y, z], [0.8, 2.1, 2.1], mat('wood', 6, 9))); }
    else P = [sph([0, 0, 4], [6.5, 5, 4.6], mat('straw', 3, 7, { tex: (lp) => (Math.abs(lp[0]) < 0.8 ? -0.3 : TEX.noise(0.2, 2)(lp)) })), sph([0, 0, 1.4], [6.8, 5.2, 2], mat('leather', 2, 6))];
    return render(P, { w: 18, h: 14, ox: 9, oy: 10, ky: 0.6, kz: 0.9, shadow: false, yaw: kind === 'wood' ? 30 : 0 }).toCanvas(lut(0));
  });
}
// mouse pointers
export function cursorSprite(kind) {
  return memo('cur' + kind, () => {
    const ramp = { own: 'grass', enemy: 'roofr', neutral: 'straw' }[kind] || 'gold', hi = R[ramp].length - 1;
    const im = new Img(16, 20);
    im.poly([[1, 1], [1, 15], [4.6, 11.6], [7.4, 18], [10.4, 16.6], [7.6, 10.6], [12.4, 10.6]], (x, y) => c(ramp, x <= 2 || (y - x) < 1 ? hi : x + y > 19 ? hi - 4 : hi - 2));
    im.outline(OUT);
    return im.toCanvas(lut(0));
  });
}

// Sprites are generated on first use. To avoid hitches mid-battle, queue everything a
// match can need and render it a little at a time from the main loop.
const warmQ = [];
export function prewarm(factions) {
  const frames = ['idle', 'walk0', 'walk1', 'walk2', 'walk3', 'atk0', 'atk1', 'atk2'];
  const img = (type, f, fr, carry, chop, dir) => () => memo(`u${type}${f}${fr}${carry || ''}${chop ? 'c' : ''}${dir}`, () => render(unitModel(type, f, fr, carry, chop), { ...UNIT_VIEW, yaw: dir * 45 }));
  warmQ.push(() => buildingImg('mine', 0, 2));
  for (const f of factions) {
    for (const t of ['hall', 'farm', 'barracks', 'mill', 'stable', 'forge', 'tower']) warmQ.push(() => buildingImg(t, f, 2));
    for (const fr of ['idle', 'walk0', 'walk2', 'walk1', 'walk3']) for (let d = 0; d < 8; d++) for (const carry of [null, 'gold', 'wood']) warmQ.push(img('worker', f, fr, carry, false, d));
    for (const fr of ['atk0', 'atk1', 'atk2']) for (let d = 0; d < 8; d++) warmQ.push(img('worker', f, fr, null, true, d), img('worker', f, fr, null, false, d));
    for (const t of ['soldier', 'archer', 'knight', 'siege']) for (const fr of frames) for (let d = 0; d < 8; d++) warmQ.push(img(t, f, fr, null, false, d));
    for (const t of ['hall', 'farm', 'barracks', 'mill', 'stable', 'forge', 'tower']) for (const st of [0, 1]) warmQ.push(() => buildingImg(t, f, st));
  }
}
export function warmStep(budgetMs = 5) { const t0 = performance.now(); while (warmQ.length && performance.now() - t0 < budgetMs) warmQ.shift()(); return warmQ.length; }

export function paletteCSS(i) { return `rgb(${PAL[i * 3]},${PAL[i * 3 + 1]},${PAL[i * 3 + 2]})`; }
