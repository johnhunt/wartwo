// A tiny software renderer that turns simple 3D shapes into shaded, outlined,
// palette-indexed pixel art. Every unit and building is modelled once from
// ellipsoids, capsules, convex blocks and cones, then drawn from any facing with
// consistent lighting (sun from the upper left) and a ground shadow.
//
// Model space: x = right, y = towards the viewer (south), z = up. Units are pixels.
// The projection is the classic top-down oblique: sx = x, sy = y*ky - z*kz.
import { R, c, SHADOW } from './palette.js';
import { Img } from './img.js';

export const ID = [1, 0, 0, 0, 1, 0, 0, 0, 1];
export function mul(a, b) { const o = new Array(9); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) o[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j]; return o; }
export function rotZ(a) { const s = Math.sin(a), k = Math.cos(a); return [k, -s, 0, s, k, 0, 0, 0, 1]; }
export function rotX(a) { const s = Math.sin(a), k = Math.cos(a); return [1, 0, 0, 0, k, -s, 0, s, k]; }
export function rotY(a) { const s = Math.sin(a), k = Math.cos(a); return [k, 0, s, 0, 1, 0, -s, 0, k]; }
export const deg = (d) => d * Math.PI / 180;
// yaw about z, then pitch about x, then roll about y (degrees)
export function rot(yaw = 0, pitch = 0, roll = 0) { return mul(rotZ(deg(yaw)), mul(rotX(deg(pitch)), rotY(deg(roll)))); }
export function mv(M, v) { return [M[0] * v[0] + M[1] * v[1] + M[2] * v[2], M[3] * v[0] + M[4] * v[1] + M[5] * v[2], M[6] * v[0] + M[7] * v[1] + M[8] * v[2]]; }
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scl = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export function norm(a) { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
export function hash2(i, j) { let h = (Math.imul(i | 0, 374761393) + Math.imul(j | 0, 668265263)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }

// ------------------------------------------------------------------ materials
// {ramp, lo, hi, spec, tex(lp, n, wp) -> brightness delta | {ramp,lo,hi,d}}
export function mat(ramp, lo = 1, hi = R[ramp].length - 1, extra) { return Object.assign({ ramp, lo, hi }, extra); }

// ------------------------------------------------------------------ primitives
export function sph(cn, r, m, M) { return { k: 0, c: cn, r: typeof r === 'number' ? [r, r, r] : r, m, M: M || ID }; }
export function cap(a, b, r, m) { return { k: 1, a, b, r, m }; }
export function cvx(cn, planes, m, M) { return { k: 2, c: cn, p: planes, m, M: M || ID }; }
export function fru(cn, r0, r1, h, m, M) { return { k: 3, c: cn, r0, r1, h, m, M: M || ID }; }
// box centred on cn with half sizes h
export function box(cn, h, m, M) { const r = cvx(cn, [[1, 0, 0, h[0]], [-1, 0, 0, h[0]], [0, 1, 0, h[1]], [0, -1, 0, h[1]], [0, 0, 1, h[2]], [0, 0, -1, h[2]]], m, M); r.bound = Math.hypot(h[0], h[1], h[2]) + 0.5; return r; }
// box standing on z = cn[2]
export function slab(cn, h, m, M) { return box([cn[0], cn[1], cn[2] + h[2]], h, m, M); }
// roof with the ridge along local x, base at cn. inset > 0 slopes the ends as well (hip roof)
export function roof(cn, hx, hy, hz, m, M, inset = 0) {
  const l = Math.hypot(hz, hy), p = [[0, hz / l, hy / l, hz * hy / l], [0, -hz / l, hy / l, hz * hy / l], [0, 0, -1, 0]];
  if (inset > 0) { const l2 = Math.hypot(hz, inset); p.push([hz / l2, 0, inset / l2, hz * hx / l2], [-hz / l2, 0, inset / l2, hz * hx / l2]); }
  else p.push([1, 0, 0, hx], [-1, 0, 0, hx]);
  const r = cvx(cn, p, m, M); r.bound = Math.hypot(hx, hy, hz) + 1; return r;
}
// rotation whose local z axis points along d (x axis as close to `hint` as possible)
export function aim(d, hint = [1, 0, 0]) {
  const z = norm(d); let k = hint[0] * z[0] + hint[1] * z[1] + hint[2] * z[2];
  if (Math.abs(k) > 0.98) { hint = [0, 1, 0]; k = z[1]; }
  const x = norm([hint[0] - z[0] * k, hint[1] - z[1] * k, hint[2] - z[2] * k]);
  const y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
  return [x[0], y[0], z[0], x[1], y[1], z[1], x[2], y[2], z[2]];
}
// transform a list of prims: p' = M*p + t
export function xform(prims, M, t = [0, 0, 0]) {
  return prims.map(p => {
    if (p.k === 1) return { ...p, a: add(mv(M, p.a), t), b: add(mv(M, p.b), t) };
    return { ...p, c: add(mv(M, p.c), t), M: mul(M, p.M) };
  });
}

const N = [0, 0, 0], LP = [0, 0, 0];
let TFAR = 0;
// returns nearest t > 0 or Infinity; fills N (world normal) and LP (local hit position)
function hit(p, ox, oy, oz, dx, dy, dz) {
  if (p.k === 1) {
    const a = p.a, b = p.b, r = p.r;
    const bax = b[0] - a[0], bay = b[1] - a[1], baz = b[2] - a[2], oax = ox - a[0], oay = oy - a[1], oaz = oz - a[2];
    const baba = bax * bax + bay * bay + baz * baz, bard = bax * dx + bay * dy + baz * dz, baoa = bax * oax + bay * oay + baz * oaz;
    const rdoa = dx * oax + dy * oay + dz * oaz, oaoa = oax * oax + oay * oay + oaz * oaz;
    let t = Infinity;
    const A = baba - bard * bard;
    if (A > 1e-9) {
      const B = baba * rdoa - baoa * bard, C = baba * oaoa - baoa * baoa - r * r * baba, h = B * B - A * C;
      if (h < 0) return Infinity;
      const tb = (-B - Math.sqrt(h)) / A, y = baoa + tb * bard;
      if (y > 0 && y < baba) t = tb;
    }
    if (t === Infinity) {
      { const B = rdoa, C = oaoa - r * r, h = B * B - C; if (h > 0) t = -B - Math.sqrt(h); }
      { const cx = ox - b[0], cy = oy - b[1], cz = oz - b[2], B = dx * cx + dy * cy + dz * cz, C = cx * cx + cy * cy + cz * cz - r * r, h = B * B - C; if (h > 0) { const t2 = -B - Math.sqrt(h); if (t2 < t) t = t2; } }
    }
    if (!(t > 1e-4) || t === Infinity) return Infinity;
    const px = oax + dx * t, py = oay + dy * t, pz = oaz + dz * t;
    let hh = baba > 0 ? (px * bax + py * bay + pz * baz) / baba : 0; hh = hh < 0 ? 0 : hh > 1 ? 1 : hh;
    N[0] = (px - hh * bax) / r; N[1] = (py - hh * bay) / r; N[2] = (pz - hh * baz) / r;
    LP[0] = px; LP[1] = py; LP[2] = pz; TFAR = t + r;
    return t;
  }
  const M = p.M, cn = p.c;
  const qx = ox - cn[0], qy = oy - cn[1], qz = oz - cn[2];
  // into local space (M is orthonormal: inverse = transpose)
  const lox = M[0] * qx + M[3] * qy + M[6] * qz, loy = M[1] * qx + M[4] * qy + M[7] * qz, loz = M[2] * qx + M[5] * qy + M[8] * qz;
  const ldx = M[0] * dx + M[3] * dy + M[6] * dz, ldy = M[1] * dx + M[4] * dy + M[7] * dz, ldz = M[2] * dx + M[5] * dy + M[8] * dz;
  let t = Infinity, nx = 0, ny = 0, nz = 1;
  if (p.k === 0) {
    const r = p.r, sx = lox / r[0], sy = loy / r[1], sz = loz / r[2], ex = ldx / r[0], ey = ldy / r[1], ez = ldz / r[2];
    const A = ex * ex + ey * ey + ez * ez, B = sx * ex + sy * ey + sz * ez, C = sx * sx + sy * sy + sz * sz - 1, h = B * B - A * C;
    if (h < 0) return Infinity;
    const sq = Math.sqrt(h); t = (-B - sq) / A; if (!(t > 1e-4)) return Infinity;
    TFAR = (-B + sq) / A;
    nx = (sx + ex * t) / r[0]; ny = (sy + ey * t) / r[1]; nz = (sz + ez * t) / r[2];
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
  } else if (p.k === 2) {
    let t0 = -Infinity, t1 = Infinity; const P = p.p;
    for (let i = 0; i < P.length; i++) {
      const q = P[i], den = q[0] * ldx + q[1] * ldy + q[2] * ldz, dist = q[0] * lox + q[1] * loy + q[2] * loz - q[3];
      if (den > -1e-9 && den < 1e-9) { if (dist > 0) return Infinity; continue; }
      const tt = -dist / den;
      if (den < 0) { if (tt > t0) { t0 = tt; nx = q[0]; ny = q[1]; nz = q[2]; } } else if (tt < t1) t1 = tt;
      if (t0 > t1) return Infinity;
    }
    if (!(t0 > 1e-4)) return Infinity; t = t0; TFAR = t1;
  } else {
    const k = (p.r1 - p.r0) / p.h, r0 = p.r0, h = p.h;
    const A = ldx * ldx + ldy * ldy - k * k * ldz * ldz, B = lox * ldx + loy * ldy - k * (r0 + k * loz) * ldz, C = lox * lox + loy * loy - (r0 + k * loz) * (r0 + k * loz);
    let far = -Infinity;
    const tryT = (tt, cx, cy, cz) => { if (tt > far) far = tt; if (tt > 1e-4 && tt < t) { t = tt; nx = cx; ny = cy; nz = cz; } };
    if (A > 1e-9 || A < -1e-9) {
      const hh = B * B - A * C;
      if (hh >= 0) {
        const sq = Math.sqrt(hh);
        for (const tt of [(-B - sq) / A, (-B + sq) / A]) {
          const z = loz + ldz * tt; if (z < 0 || z > h) continue;
          const rr = r0 + k * z; if (rr < 0) continue;
          const x = lox + ldx * tt, y = loy + ldy * tt, l = Math.hypot(x, y, k * rr) || 1;
          tryT(tt, x / l, y / l, -k * rr / l);
        }
      }
    }
    if (ldz > 1e-9 || ldz < -1e-9) {
      for (const [zc, rr, sn] of [[h, p.r1, 1], [0, r0, -1]]) {
        const tt = (zc - loz) / ldz, x = lox + ldx * tt, y = loy + ldy * tt;
        if (x * x + y * y <= rr * rr) tryT(tt, 0, 0, sn);
      }
    }
    if (t === Infinity) return Infinity; TFAR = far;
  }
  LP[0] = lox + ldx * t; LP[1] = loy + ldy * t; LP[2] = loz + ldz * t;
  N[0] = M[0] * nx + M[1] * ny + M[2] * nz; N[1] = M[3] * nx + M[4] * ny + M[5] * nz; N[2] = M[6] * nx + M[7] * ny + M[8] * nz;
  return t;
}

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
export const LIGHT = norm([-0.62, 0.34, 0.70]);
const RIM = norm([0.8, -0.25, 0.45]);
const SUN_GROUND = norm([-0.55, 0.26, 1.25]); // steeper sun for ground shadows keeps them short

// o: {w,h,ox,oy,scale,yaw(deg),ky,kz,shadow,outline,dither,ambient}
// (ox,oy) is the screen position of the model origin.
export function render(prims, o) {
  const w = o.w, h = o.h, S = o.scale || 1, ky = o.ky ?? 0.62, kz = o.kz ?? 0.95;
  const im = new Img(w, h), dither = o.dither ?? 0.7;
  const yaw = deg(o.yaw || 0), cy = Math.cos(yaw), sy = Math.sin(yaw);
  // view -> model: rotate by -yaw about z
  const toM = (v) => [v[0] * cy + v[1] * sy, -v[0] * sy + v[1] * cy, v[2]];
  const Dv = norm([0, kz, ky]), D = toM(Dv), RIMm = toM(RIM), L = toM(LIGHT), LG = toM(SUN_GROUND), Hh = norm(add(LIGHT, Dv)), Hm = toM(Hh);
  const dx = -D[0], dy = -D[1], dz = -D[2];
  const n = prims.length;
  // screen-space bounds per prim for quick rejection
  const bx0 = new Float32Array(n), bx1 = new Float32Array(n), by0 = new Float32Array(n), by1 = new Float32Array(n);
  const bs = new Float32Array(n * 4); // bounding spheres for shadow rays
  for (let i = 0; i < n; i++) {
    const p = prims[i]; let cn, rad;
    if (p.k === 1) { cn = lerp3(p.a, p.b, 0.5); rad = Math.hypot(p.a[0] - p.b[0], p.a[1] - p.b[1], p.a[2] - p.b[2]) / 2 + p.r; }
    else if (p.k === 0) { cn = p.c; rad = Math.max(p.r[0], p.r[1], p.r[2]); }
    else if (p.k === 3) { cn = add(p.c, mv(p.M, [0, 0, p.h / 2])); rad = Math.hypot(Math.max(p.r0, p.r1), p.h / 2); }
    else { rad = 0; for (const q of p.p) rad = Math.max(rad, Math.abs(q[3])); rad *= 1.75; cn = p.c; if (p.bound) rad = p.bound; }
    bs[i * 4] = cn[0]; bs[i * 4 + 1] = cn[1]; bs[i * 4 + 2] = cn[2]; bs[i * 4 + 3] = rad * rad;
    const vx = cn[0] * cy - cn[1] * sy, vy = cn[0] * sy + cn[1] * cy;
    const sx = o.ox + vx * S, syy = o.oy + (vy * ky - cn[2] * kz) * S, rr = rad * S + 1.5;
    bx0[i] = sx - rr; bx1[i] = sx + rr; by0[i] = syy - rr; by1[i] = syy + rr;
  }
  const depth = new Float32Array(w * h).fill(Infinity), who = new Int16Array(w * h).fill(-1), lvl = new Int8Array(w * h);
  const ramp = new Array(w * h);
  const amb = o.ambient ?? 0.26;
  const inShadow = (px, py, pz, self, Lv) => {
    for (let i = 0; i < n; i++) {
      if (prims[i].m.noShadow) continue;
      const ex = bs[i * 4] - px, ey = bs[i * 4 + 1] - py, ez = bs[i * 4 + 2] - pz, tc = ex * Lv[0] + ey * Lv[1] + ez * Lv[2];
      if (ex * ex + ey * ey + ez * ez - tc * tc > bs[i * 4 + 3]) continue;
      const t = hit(prims[i], px, py, pz, Lv[0], Lv[1], Lv[2]); if (t < Infinity && (i !== self || t > 0.5)) return true;
    }
    return false;
  };
  for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
    const fx = px + 0.5, fy = py + 0.5;
    // point on the ground plane under this pixel (view space), then back along the view ray
    const gx = (fx - o.ox) / S, gy = (fy - o.oy) / (S * ky);
    const g = toM([gx, gy, 0]);
    const ox = g[0] + D[0] * 400, oy = g[1] + D[1] * 400, oz = g[2] + D[2] * 400;
    let best = Infinity, bi = -1, nx = 0, ny = 0, nz = 0, lx = 0, ly = 0, lz = 0;
    for (let i = 0; i < n; i++) {
      if (fx < bx0[i] || fx > bx1[i] || fy < by0[i] || fy > by1[i]) continue;
      const t = hit(prims[i], ox, oy, oz, dx, dy, dz);
      if (t < best) { best = t; bi = i; nx = N[0]; ny = N[1]; nz = N[2]; lx = LP[0]; ly = LP[1]; lz = LP[2]; }
    }
    const pi = py * w + px;
    if (bi < 0) {
      if (o.shadow !== false && inShadow(g[0], g[1], 0.05, -1, LG)) im.d[pi] = SHADOW;
      continue;
    }
    const p = prims[bi], m = p.m;
    const wx = ox + dx * best, wy = oy + dy * best, wz = oz + dz * best;
    let ndl = nx * L[0] + ny * L[1] + nz * L[2]; if (ndl < 0) ndl = 0;
    let I = amb + 0.64 * ndl + 0.10 * nz;
    // a second, weaker light from behind on the right picks out the shaded edge of every form
    const rim = nx * RIMm[0] + ny * RIMm[1] + nz * RIMm[2]; if (rim > 0.35 && ndl < 0.3) I += (rim - 0.35) * 0.42;
    if (o.selfShadow !== false && ndl > 0.05 && !m.glow && inShadow(wx + nx * 0.3, wy + ny * 0.3, wz + nz * 0.3, bi, L)) I = amb + 0.10 * nz + 0.10 * ndl;
    if (m.spec) { const nh = nx * Hm[0] + ny * Hm[1] + nz * Hm[2]; if (nh > 0) I += m.spec * Math.pow(nh, m.shin || 10); }
    if (o.ground !== false && wz < 5) I -= (5 - wz) * 0.022; // contact darkening
    let rp = m.ramp, lo = m.lo, hi = m.hi;
    if (m.glow) I = m.glow;
    else if (o.capRamp && nz > 0.9 && wz > 7 && !p.late && p.k !== 1) { rp = o.capRamp; lo = 1; hi = 6; I = I * 0.7 + (Math.floor(ly / 3 + 50) & 1 ? 0.06 : -0.04); }
    if (m.tex && rp === m.ramp) {
      const r = m.tex([lx, ly, lz], [nx, ny, nz], [wx, wy, wz]);
      if (typeof r === 'number') I += r; else if (r) { if (r.ramp) { rp = r.ramp; lo = r.lo ?? 1; hi = r.hi ?? R[rp].length - 1; } if (r.abs !== undefined) I = r.abs; else I += r.d || 0; }
    }
    I = I < 0 ? 0 : I > 1 ? 1 : I;
    let v = lo + I * (hi - lo) + (BAYER[(py & 3) * 4 + (px & 3)] / 16 - 0.47) * dither;
    v = Math.round(v); v = v < lo ? lo : v > hi ? hi : v;
    depth[pi] = best; who[pi] = bi; lvl[pi] = v; ramp[pi] = R[rp];
  }
  // interior lines: darken the far side of depth steps so limbs and layers read clearly
  const thr = o.edge ?? 2.2;
  for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
    const pi = py * w + px; if (who[pi] < 0) continue;
    let v = lvl[pi]; const d = depth[pi];
    let step = 0;
    if (px > 0 && who[pi - 1] >= 0 && d - depth[pi - 1] > thr) step = 1;
    else if (px < w - 1 && who[pi + 1] >= 0 && d - depth[pi + 1] > thr) step = 1;
    else if (py > 0 && who[pi - w] >= 0 && d - depth[pi - w] > thr) step = 1;
    else if (py < h - 1 && who[pi + w] >= 0 && d - depth[pi + w] > thr) step = 1;
    if (step) v = Math.max(0, v - (o.edgeDark ?? 3));
    const rp = ramp[pi]; im.d[pi] = rp[v < 0 ? 0 : v >= rp.length ? rp.length - 1 : v];
  }
  if (o.outline !== false) im.outline(c('outline', 0), SHADOW);
  return im;
}

// ------------------------------------------------------------------ textures
export const TEX = {
  // coursed stone blocks on vertical walls
  brick: (bw = 7, bh = 4, depth = 0.2) => (lp, n) => {
    if (n[2] > 0.7) return hash2(lp[0] * 1.3, lp[1] * 1.3) * 0.08;
    const u = Math.abs(n[0]) > Math.abs(n[1]) ? lp[1] : lp[0], v = lp[2];
    const row = Math.floor(v / bh), uu = u + (row & 1 ? bw / 2 : 0) + 100, col = Math.floor(uu / bw);
    if (v - row * bh < 1 || uu - col * bw < 1) return -depth;
    return (hash2(row, col) - 0.5) * 0.22 + (v - row * bh > bh - 1.2 ? 0.05 : 0);
  },
  planks: (pw = 4, depth = 0.2) => (lp, n) => {
    const u = Math.abs(n[0]) > Math.abs(n[1]) ? lp[1] : lp[0], col = Math.floor((u + 100) / pw);
    if (u + 100 - col * pw < 1) return -depth;
    return (hash2(col, 7) - 0.5) * 0.16 + (hash2(col, Math.floor(lp[2] / 3)) - 0.5) * 0.08;
  },
  // horizontal planks / floor boards on top faces use x,y
  boards: (pw = 4, depth = 0.18) => (lp) => { const col = Math.floor((lp[1] + 100) / pw); return (lp[1] + 100 - col * pw < 1) ? -depth : (hash2(col, Math.floor(lp[0] / 9)) - 0.5) * 0.14; },
  logs: (lh = 4) => (lp, n) => {
    if (n[2] > 0.7) return 0;
    const v = lp[2] / lh, f = v - Math.floor(v);
    return (f < 0.2 ? -0.3 : f < 0.45 ? -0.05 : f < 0.8 ? 0.12 : -0.02) + (hash2(Math.floor(v), Math.floor((lp[0] + lp[1]) / 5)) - 0.5) * 0.1;
  },
  shingles: (sw = 5, sh = 3, depth = 0.22) => (lp, n) => {
    const v = lp[2], row = Math.floor(v / sh), u = (Math.abs(n[0]) > Math.abs(n[1]) ? lp[1] : lp[0]) + (row & 1 ? sw / 2 : 0) + 100, col = Math.floor(u / sw);
    if (v - row * sh < 0.9) return -depth;
    if (u - col * sw < 0.9) return -depth * 0.6;
    return (hash2(row, col) - 0.5) * 0.24;
  },
  thatch: () => (lp, n) => {
    const u = (Math.abs(n[0]) > Math.abs(n[1]) ? lp[1] : lp[0]) + 100, v = lp[2];
    const band = Math.floor(v / 5);
    return (hash2(Math.floor(u * 0.9), band) - 0.5) * 0.3 + (v - band * 5 < 1 ? -0.2 : 0) + (hash2(Math.floor(u), Math.floor(v)) - 0.5) * 0.1;
  },
  // radial thatch/hide for cones: streaks running down the slope
  streaks: (amt = 0.28) => (lp) => { const a = Math.atan2(lp[1], lp[0]), band = Math.floor(lp[2] / 6); return (hash2(Math.floor(a * 9 + band * 3), band) - 0.5) * amt + (lp[2] - band * 6 < 1 ? -0.18 : 0); },
  noise: (amt = 0.15, s = 1) => (lp) => (hash2(Math.floor(lp[0] * s + lp[2] * s * 0.7), Math.floor(lp[1] * s - lp[2] * s * 0.5)) - 0.5) * amt,
};
