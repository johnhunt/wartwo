// Procedural pixel art. Everything is drawn as 8-bit palette indices, then
// converted with a per-team lookup table (team colours are a remapped ramp).
import { c, teamLUT, PAL } from './palette.js';
import { rng } from './map.js';

export class Img {
  constructor(w, h) { this.w = w; this.h = h; this.d = new Uint8Array(w * h); }
  set(x, y, col) { x |= 0; y |= 0; if (x >= 0 && y >= 0 && x < this.w && y < this.h && col) this.d[y * this.w + x] = col; }
  get(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h ? this.d[y * this.w + x] : 0; }
  rect(x, y, w, h, col) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, col); }
  line(x0, y0, x1, y1, col, th = 1) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1; let err = dx + dy;
    for (;;) {
      if (th === 1) this.set(x0, y0, col); else this.rect(x0 - (th >> 1), y0 - (th >> 1), th, th, col);
      if (x0 === x1 && y0 === y1) break; const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; } if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  ellipse(cx, cy, rx, ry, col) {
    for (let y = -ry; y <= ry; y++) for (let x = -rx; x <= rx; x++) if ((x * x) / (rx * rx + 0.01) + (y * y) / (ry * ry + 0.01) <= 1.05) this.set(cx + x, cy + y, col);
  }
  // shaded ellipse: fn(nx,ny) -> colour, nx/ny in -1..1
  shade(cx, cy, rx, ry, fn) {
    for (let y = -ry; y <= ry; y++) for (let x = -rx; x <= rx; x++) {
      const nx = x / (rx + 0.01), ny = y / (ry + 0.01); if (nx * nx + ny * ny <= 1.05) this.set(cx + x, cy + y, fn(nx, ny, x, y));
    }
  }
  poly(pts, col) { // scanline fill
    let minY = 1e9, maxY = -1e9; for (const p of pts) { minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); }
    for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
      const xs = [];
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        if ((a[1] <= y + 0.5 && b[1] > y + 0.5) || (b[1] <= y + 0.5 && a[1] > y + 0.5)) xs.push(a[0] + (y + 0.5 - a[1]) / (b[1] - a[1]) * (b[0] - a[0]));
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) for (let x = Math.round(xs[k]); x < Math.round(xs[k + 1]); x++) this.set(x, y, typeof col === 'function' ? col(x, y) : col);
    }
  }
  outline(col) {
    const o = new Uint8Array(this.d);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (this.d[y * this.w + x]) continue;
      if (this.get(x - 1, y) || this.get(x + 1, y) || this.get(x, y - 1) || this.get(x, y + 1)) o[y * this.w + x] = col;
    }
    this.d = o; return this;
  }
  blit(src, ox, oy, flip) { for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) { const v = src.d[y * src.w + (flip ? src.w - 1 - x : x)]; if (v) this.set(ox + x, oy + y, v); } }
  toCanvas(lut) {
    const cv = document.createElement('canvas'); cv.width = this.w; cv.height = this.h;
    const ctx = cv.getContext('2d'); const id = ctx.createImageData(this.w, this.h);
    const u32 = new Uint32Array(id.data.buffer);
    for (let i = 0; i < this.d.length; i++) u32[i] = lut[this.d[i]];
    ctx.putImageData(id, 0, 0); return cv;
  }
}

const LUTS = [];
export function lut(team) { return LUTS[team] || (LUTS[team] = teamLUT(team)); }
const OUT = () => c('gray', 1);
const T = (i) => c('team', i);

// ------------------------------------------------------------------ terrain
const TR = rng(1234);
const rnd = (n) => TR.int(n);

function noiseFill(img, ramp, lo, hi, x0 = 0, y0 = 0, w = img.w, h = img.h) {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
    const v = lo + ((rnd(100) < 55) ? 1 : 0) + ((rnd(100) < 15) ? 1 : 0) - ((rnd(100) < 12) ? 1 : 0);
    img.set(x, y, c(ramp, Math.max(lo - 1, Math.min(hi, v))));
  }
}

export function grassTile(v) {
  const im = new Img(32, 32); noiseFill(im, 'grass', 4, 6);
  // light blotches
  for (let k = 0; k < 3; k++) { const x = rnd(32), y = rnd(32); im.shade(x, y, 3 + rnd(3), 2 + rnd(2), () => rnd(3) ? c('grass', 6) : c('grass', 5)); }
  for (let k = 0; k < 10; k++) { const x = rnd(32), y = rnd(30) + 2; im.set(x, y, c('grass', 8)); im.set(x, y - 1, c('grass', 7)); im.set(x + 1, y + 1, c('grass', 3)); }
  if (v === 3) for (let k = 0; k < 4; k++) { const x = rnd(30) + 1, y = rnd(30) + 1; im.set(x, y, rnd(2) ? c('straw', 5) : c('bone', 4)); im.set(x + 1, y, c('grass', 2)); }
  return im;
}
export function dirtTile() {
  const im = new Img(32, 32); noiseFill(im, 'dirt', 4, 6);
  for (let k = 0; k < 8; k++) { const x = rnd(32), y = rnd(32); im.set(x, y, c('dirt', 2)); im.set(x + 1, y, c('dirt', 7)); }
  return im;
}
export function waterTile(frame) {
  const im = new Img(32, 32);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) im.set(x, y, c('water', 3 + (((x + y * 2 + frame * 3) % 11 === 0) ? 1 : 0) + (rnd(100) < 8 ? -1 : 0)));
  const r = rng(77 + frame);
  for (let k = 0; k < 5; k++) { const x = r.int(28), y = r.int(30); im.line(x, y, x + 3, y, c('water', 6)); im.set(x + 1, y - 1, c('water', 8)); }
  return im;
}
export function stumpTile() {
  const im = grassTile(0);
  im.ellipse(16, 18, 5, 2, c('grass', 2));
  im.ellipse(15, 16, 4, 2, c('wood', 3)); im.ellipse(15, 15, 3, 1, c('wood', 7)); im.set(15, 15, c('wood', 4));
  for (let k = 0; k < 5; k++) im.set(8 + rnd(16), 18 + rnd(6), c('wood', 6));
  return im;
}

// Tree tile: 32x44 (12px overhang above). Base underneath is darker forest floor.
export function treeTile(v) {
  const im = new Img(32, 44);
  for (let y = 12; y < 44; y++) for (let x = 0; x < 32; x++) im.set(x, y, c('forest', 1 + (rnd(100) < 30 ? 1 : 0)));
  const trees = v % 2 ? [[9, 30], [23, 26], [16, 42]] : [[8, 38], [22, 34], [14, 24]];
  trees.sort((a, b) => a[1] - b[1]);
  for (const [tx, ty] of trees) pine(im, tx + rnd(3) - 1, ty, 9 + rnd(3), 22 + rnd(5), v);
  return im;
}
function pine(im, cx, base, hw, h, v) {
  im.rect(cx - 1, base - 4, 3, 4, c('wood', 2));
  const layers = 4;
  for (let l = 0; l < layers; l++) {
    const top = base - h + (l * h / layers) | 0, bot = base - 3 - ((layers - 1 - l) * 3);
    const w = (hw * (l + 2) / (layers + 1)) | 0;
    im.poly([[cx, top], [cx + w + 1, bot], [cx - w - 1, bot]], (x, y) => {
      const t = (x - cx) / (w + 1); const shade = t < -0.25 ? 6 : t < 0.2 ? 4 : 2;
      return c('pine', shade + ((x * 7 + y * 3) % 5 === 0 ? -1 : 0) + ((y - top) < 2 ? 1 : 0));
    });
    // dark underside
    im.line(cx - w, bot, cx + w, bot, c('pine', 0));
  }
}
export function rockTile(v) {
  const im = new Img(32, 44);
  for (let y = 12; y < 44; y++) for (let x = 0; x < 32; x++) im.set(x, y, c('rock', 2 + (rnd(100) < 30 ? 1 : 0)));
  const lumps = [[10, 36, 10, 10], [23, 32, 9, 12], [15, 26, 9, 9]];
  for (const [x, y, rx, ry] of lumps) {
    const ox = x + rnd(3) - 1;
    im.shade(ox, y, rx, ry, (nx, ny) => {
      const l = -nx * 0.6 - ny * 0.8; const n = (rnd(100) < 20 ? 1 : 0);
      return c('rock', Math.max(1, Math.min(9, 4 + Math.round(l * 3) + n)));
    });
    im.line(ox - 2, y - 2, ox + 2, y + 3, c('rock', 1));
  }
  return im;
}

// edge overlay: draws fringe of ramp along sides in mask (1=N,2=E,4=S,8=W)
export function edgeOverlay(mask, ramp, lo, width, foam) {
  const im = new Img(32, 32);
  const r = rng(mask * 31 + width);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const j = (r.int(3));
    const dN = y, dS = 31 - y, dW = x, dE = 31 - x;
    let d = 99;
    if (mask & 1) d = Math.min(d, dN); if (mask & 2) d = Math.min(d, dE); if (mask & 4) d = Math.min(d, dS); if (mask & 8) d = Math.min(d, dW);
    const wv = width + ((((x + y) * 5) % 7) > 3 ? 1 : 0) + (j === 0 ? -1 : 0);
    if (d < wv) im.set(x, y, c(ramp, lo + (d < 2 ? 2 : d < wv - 2 ? 1 : 0)));
    else if (foam && d < wv + 2) im.set(x, y, c('foam', d === wv ? 2 : 0));
  }
  return im;
}
export function cornerOverlay(corner, ramp, lo, width, foam) { // corner 0=NE 1=SE 2=SW 3=NW
  const im = new Img(32, 32);
  const cx = corner === 0 || corner === 1 ? 31 : 0, cy = corner === 1 || corner === 2 ? 31 : 0;
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const d = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
    if (d < width + 1) im.set(x, y, c(ramp, lo + 1));
    else if (foam && d < width + 3) im.set(x, y, c('foam', 1));
  }
  return im;
}

// ------------------------------------------------------------------ units
// a: {skin, faction, frame:'idle'|'walk0'|'walk1'|'atk0'|'atk1', weapon, shield, bulk, helm}
function humanoid(im, o, ox = 0, oy = 0, rider = false) {
  const f = o.frame, sk = o.faction ? 'gskin' : 'skin';
  const walk = f === 'walk0' ? 1 : f === 'walk1' ? -1 : 0;
  const bulk = o.bulk || 0;
  const X = 16 + ox, Y = oy;
  const pants = o.faction ? c('leather', 2) : c('leather', 3), boot = c('leather', 1);
  if (!rider) {
    // back leg / front leg
    im.line(X - 1, Y + 21, X - 1 - walk * 2, Y + 27, pants, 2); im.rect(X - 2 - walk * 2, Y + 27, 3, 1, boot);
    im.line(X + 2, Y + 21, X + 2 + walk * 2, Y + 27, pants, 2); im.rect(X + 1 + walk * 2, Y + 27, 4, 1, boot);
  }
  // back arm (behind body)
  im.line(X - 3 - bulk, Y + 14, X - 4 - bulk, Y + 19, c(sk, 2), 2);
  // torso
  const tw = 6 + bulk * 2, tx = X - 3 - bulk, ty = Y + 13 - bulk;
  for (let y = 0; y < 9 + bulk; y++) for (let x = 0; x < tw; x++) {
    let col;
    if (o.faction === 0) col = o.armorSteel ? c('steel', x < 2 ? 5 : x > tw - 2 ? 2 : 4) : T(x < 2 ? 4 : x > tw - 2 ? 1 : 3);
    else col = y < 3 ? c(sk, x < 2 ? 4 : 3) : c('leather', x < 2 ? 4 : 3);
    im.set(tx + x, ty + y, col);
  }
  if (o.faction === 0) { // tabard stripe & belt
    if (o.armorSteel) for (let y = 2; y < 9; y++) im.set(X, ty + y, T(3)), im.set(X + 1, ty + y, T(4));
    im.rect(tx, ty + 7 + bulk, tw, 1, c('leather', 1)); im.set(X, ty + 7 + bulk, c('gold', 5));
  } else {
    im.rect(tx, ty + 6 + bulk, tw, 2, T(2)); // team coloured loincloth/sash
    im.set(tx + tw - 2, ty + 1, T(4)); im.set(tx + 1, ty, c('bone', 3)); im.set(tx + tw - 1, ty, c('bone', 3)); // shoulder spikes
  }
  // head
  const hx = X + 1, hy = Y + 9 - bulk;
  im.shade(hx, hy, 3, 3, (nx, ny) => c(sk, nx < -0.2 || ny < -0.4 ? 4 : nx > 0.4 ? 2 : 3));
  im.set(hx + 2, hy, c('gray', 0));
  if (o.faction === 1) { im.set(hx + 3, hy + 2, c('bone', 4)); im.rect(hx - 2, hy + 2, 3, 1, c(sk, 2)); } // tusk/jaw
  if (o.helm === 'steel') { for (let x = -3; x <= 3; x++) for (let y = -3; y <= -1; y++) if (x * x + y * y <= 10) im.set(hx + x, hy + y, c('steel', x < 0 ? 6 : 4)); im.rect(hx - 3, hy - 1, 7, 1, c('steel', 3)); }
  else if (o.helm === 'hood') { for (let x = -3; x <= 3; x++) for (let y = -4; y <= 1; y++) if (x * x + (y + 1) * (y + 1) <= 11 && !(x > 0 && y > -2)) im.set(hx + x, hy + y, c('leather', x < 0 ? 4 : 3)); }
  else if (o.helm === 'horn') { im.rect(hx - 3, hy - 3, 6, 2, c('leather', 2)); im.line(hx - 3, hy - 3, hx - 5, hy - 6, c('bone', 4)); im.line(hx + 2, hy - 3, hx + 4, hy - 6, c('bone', 4)); }
  else if (o.helm === 'cap') { im.rect(hx - 3, hy - 3, 7, 2, c('straw', 3)); im.rect(hx - 4, hy - 1, 9, 1, c('straw', 2)); }
  else if (o.helm === 'mohawk') { im.line(hx - 2, hy - 3, hx + 1, hy - 4, c('gray', 2), 2); }
  // front arm + weapon
  let hand, wdir;
  if (f === 'atk0') { hand = [X + 3, Y + 8]; wdir = [-1, -3]; }
  else if (f === 'atk1') { hand = [X + 6, Y + 15]; wdir = [3, 1]; }
  else { hand = [X + 4, Y + 19]; wdir = [2, 3]; }
  if (o.weapon === 'bow') { hand = f === 'atk0' ? [X + 7, Y + 14] : [X + 6, Y + 15]; }
  if (o.weapon === 'lance') { hand = [X + 5, Y + 16]; }
  if (o.weapon === 'spear') { hand = f === 'atk0' ? [X + 2, Y + 10] : f === 'atk1' ? [X + 6, Y + 13] : [X + 4, Y + 17]; }
  im.line(X + 2 + bulk, Y + 14 - bulk, hand[0], hand[1], c(sk, 3), 2);
  const W = o.weapon;
  if (W === 'sword') {
    const L = 7; const ex = hand[0] + wdir[0] * L / 3, ey = hand[1] + wdir[1] * L / 3;
    im.line(hand[0], hand[1], ex, ey, c('steel', 6)); im.line(hand[0] + 1, hand[1], ex + 1, ey, c('steel', 3));
    im.set(hand[0], hand[1], c('gold', 4));
  } else if (W === 'axe') {
    const ex = hand[0] + wdir[0] * 2.4, ey = hand[1] + wdir[1] * 2.4;
    im.line(hand[0], hand[1], ex, ey, c('wood', 4));
    im.shade(Math.round(ex), Math.round(ey), 2, 3, (nx) => c('steel', nx < 0 ? 6 : 3));
  } else if (W === 'pick' || W === 'hatchet') {
    const ex = hand[0] + wdir[0] * 1.8, ey = hand[1] + wdir[1] * 1.8;
    im.line(hand[0], hand[1], ex, ey, c('wood', 5));
    im.line(ex - 2 * Math.sign(wdir[1] || 1), ey - 1, ex + 2, ey + 1, c('steel', 5));
  } else if (W === 'bow') {
    const bx = hand[0] + 1, pull = f === 'atk0' ? 3 : 0;
    for (let y = -6; y <= 6; y++) im.set(bx + Math.round(2 - (y * y) / 18), hand[1] + y, c('wood', 6));
    im.line(bx, hand[1] - 6, bx - pull, hand[1], c('bone', 4)); im.line(bx - pull, hand[1], bx, hand[1] + 6, c('bone', 4));
    if (f === 'atk0') im.line(bx - pull, hand[1], bx + 5, hand[1], c('wood', 3));
  } else if (W === 'spear') {
    const dx = f === 'atk1' ? 3 : 0.6, dy = f === 'atk1' ? -0.3 : -3;
    const sx = hand[0] - dx * 1.5, sy = hand[1] - dy * 1.5, ex = hand[0] + dx * 2.5, ey = hand[1] + dy * 2.5;
    im.line(sx, sy, ex, ey, c('wood', 4)); im.line(ex, ey, ex + dx * 0.7, ey + dy * 0.7, c('steel', 6), 2);
  } else if (W === 'lance') {
    const tip = f === 'atk1' ? [hand[0] + 14, hand[1] - 1] : [hand[0] + 11, hand[1] - 8];
    im.line(hand[0] - 3, hand[1] + 1, tip[0], tip[1], c('wood', 6), 1);
    im.line(hand[0] - 3, hand[1] + 2, tip[0], tip[1] + 1, c('wood', 4), 1);
    if (o.faction === 0) im.rect(hand[0] + 3, hand[1] - 3, 3, 2, T(4));
  }
  if (o.shield) {
    const sx = X - 4 - bulk, sy = Y + 16;
    if (o.faction === 0) { im.shade(sx, sy, 3, 4, (nx, ny) => (Math.abs(nx) > 0.65 || ny < -0.75) ? c('steel', 5) : T(nx < 0 ? 4 : 2)); im.set(sx, sy, c('gold', 6)); }
    else { im.shade(sx, sy, 3, 3, (nx, ny) => (nx * nx + ny * ny > 0.6) ? c('wood', 2) : c('wood', 5)); im.set(sx, sy, c('bone', 4)); im.set(sx - 1, sy - 1, T(3)); }
  }
  if (o.carry === 'gold') { im.shade(X + 4, Y + 12, 3, 3, (nx, ny) => c('gold', nx + ny < -0.3 ? 7 : 4)); }
  if (o.carry === 'wood') { im.rect(X - 6, Y + 11, 10, 3, c('wood', 4)); im.rect(X - 6, Y + 11, 10, 1, c('wood', 7)); im.set(X - 6, Y + 12, c('wood', 8)); im.set(X + 3, Y + 12, c('wood', 8)); }
}

function horse(im, faction, f) {
  const walk = f === 'walk0' ? 1 : f === 'walk1' ? -1 : 0;
  if (faction === 0) {
    const coat = (i) => c('wood', i + 1);
    // legs
    for (const [lx, ph] of [[9, 1], [12, -1], [20, -1], [23, 1]]) { im.line(lx, 22, lx + walk * ph * 2, 28, coat(1), 2); im.set(lx + walk * ph * 2, 29, c('gray', 2)); }
    im.shade(16, 19, 9, 4, (nx, ny) => coat(ny < -0.3 ? 5 : nx > 0.5 ? 2 : 4));
    // neck & head
    im.poly([[22, 18], [26, 10], [29, 11], [26, 19]], (x) => coat(x < 25 ? 4 : 3));
    im.rect(26, 9, 4, 4, coat(4)); im.set(29, 12, c('gray', 1)); im.set(27, 9, c('gray', 1));
    im.line(23, 12, 25, 9, c('gray', 2), 1);
    // tail
    im.line(7, 17, 5, 24, c('gray', 3), 2);
    // caparison (team blanket)
    im.rect(11, 15, 10, 6, T(3)); im.rect(11, 20, 10, 1, T(1)); im.rect(11, 15, 10, 1, T(5));
  } else {
    const fur = (i) => c('gray', 5 + i);
    for (const [lx, ph] of [[9, 1], [12, -1], [20, -1], [23, 1]]) { im.line(lx, 22, lx + walk * ph * 2, 28, fur(1), 2); }
    im.shade(16, 20, 9, 4, (nx, ny) => fur(ny < -0.3 ? 5 : nx > 0.5 ? 1 : 3));
    im.poly([[22, 15], [30, 16], [30, 20], [23, 22]], (x) => fur(3));
    im.line(23, 15, 24, 11, fur(2), 2); im.line(26, 15, 27, 11, fur(2), 2);
    im.set(28, 17, c('fire', 6)); im.rect(29, 19, 2, 1, c('bone', 4));
    im.line(7, 18, 3, 15, fur(2), 2);
    im.rect(12, 15, 8, 3, T(2));
  }
}

function siege(im, faction, f) {
  const wood = (i) => faction ? c('leather', i) : c('wood', i + 2);
  im.rect(5, 20, 22, 4, wood(4)); im.rect(5, 20, 22, 1, wood(6)); im.rect(5, 23, 22, 1, wood(2));
  for (const wx of [9, 23]) { im.shade(wx, 25, 3, 3, (nx, ny) => (nx * nx + ny * ny > 0.5) ? wood(1) : wood(4)); im.set(wx, 25, c('steel', 4)); }
  im.line(12, 20, 16, 13, wood(3), 2); im.line(20, 20, 16, 13, wood(3), 2);
  const tip = f === 'atk1' ? [27, 6] : f === 'atk0' ? [5, 10] : [24, 15];
  im.line(16, 14, tip[0], tip[1], wood(5), 2);
  im.shade(tip[0], tip[1], 2, 2, () => faction ? c('bone', 3) : c('steel', 3));
  if (f !== 'atk1') im.shade(tip[0], tip[1] - 2, 2, 2, (nx, ny) => c('rock', nx + ny < 0 ? 6 : 3));
  if (faction === 1) { im.set(5, 19, c('bone', 4)); im.set(26, 19, c('bone', 4)); im.line(4, 18, 4, 15, c('bone', 4)); }
  im.rect(14, 21, 4, 2, T(3));
}

const UNIT_LOOK = {
  worker: [{ weapon: 'pick', helm: 'cap' }, { weapon: 'pick', helm: 'mohawk', bulk: 0 }],
  soldier: [{ weapon: 'sword', helm: 'steel', shield: true, armorSteel: true }, { weapon: 'axe', helm: 'horn', bulk: 1, shield: false }],
  archer: [{ weapon: 'bow', helm: 'hood' }, { weapon: 'spear', helm: 'mohawk', bulk: 0 }],
  knight: [{ weapon: 'lance', helm: 'steel', armorSteel: true, shield: true }, { weapon: 'axe', helm: 'horn', bulk: 0 }],
};

const unitCache = new Map();
export function unitSprite(type, faction, team, frame, carry, chopping) {
  const key = type + faction + team + frame + (carry || '') + (chopping ? 'c' : '');
  let cv = unitCache.get(key); if (cv) return cv;
  const im = new Img(32, 32);
  if (type === 'siege') siege(im, faction, frame);
  else if (type === 'knight') { horse(im, faction, frame); humanoid(im, { ...UNIT_LOOK.knight[faction], faction, frame: frame.startsWith('walk') ? 'idle' : frame }, -1, -8, true); }
  else {
    const look = { ...UNIT_LOOK[type][faction], faction, frame, carry };
    if (type === 'worker' && chopping) look.weapon = 'hatchet';
    if (type === 'worker' && carry) look.weapon = 'none';
    humanoid(im, look);
  }
  im.outline(OUT());
  cv = im.toCanvas(lut(team)); unitCache.set(key, cv); return cv;
}

export function corpseSprite(type, faction, team, stage) {
  const key = 'corpse' + type + faction + team + stage;
  let cv = unitCache.get(key); if (cv) return cv;
  const im = new Img(32, 32);
  if (stage < 2) {
    im.ellipse(16, 26, 9, 3, c('blood', 2)); im.ellipse(14, 26, 5, 2, c('blood', 3));
    if (type === 'siege') { im.line(6, 24, 26, 22, c('wood', 4), 2); im.line(10, 27, 20, 20, c('wood', 3), 2); }
    else {
      im.rect(10, 24, 11, 3, faction ? c('leather', 3) : T(3)); im.shade(22, 25, 2, 2, () => c(faction ? 'gskin' : 'skin', 3));
      if (type === 'knight') im.shade(14, 22, 8, 3, () => faction ? c('gray', 7) : c('wood', 4));
    }
  } else { // bones
    im.rect(11, 25, 9, 1, c('bone', 3)); im.shade(21, 25, 2, 2, () => c('bone', 4)); im.set(21, 25, c('gray', 1)); im.line(13, 24, 16, 27, c('bone', 2));
  }
  cv = im.outline(c('gray', 1)).toCanvas(lut(team)); unitCache.set(key, cv); return cv;
}

// ------------------------------------------------------------------ buildings
function wallStone(im, x, y, w, h) {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const row = (j / 4) | 0, off = row % 2 ? 3 : 0;
    const mortar = j % 4 === 3 || ((i + off) % 7 === 6);
    im.set(x + i, y + j, mortar ? c('stone', 2) : c('stone', 5 + ((i * 13 + row * 7) % 3 === 0 ? 1 : 0) - (i > w - 3 ? 1 : 0) + (i < 2 ? 1 : 0)));
  }
}
function wallWood(im, x, y, w, h, dark) {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const plank = i % 4 === 3; im.set(x + i, y + j, c('wood', plank ? 2 : (dark ? 4 : 5) + ((j * 3 + i) % 11 === 0 ? 1 : 0)));
  }
}
function wallLog(im, x, y, w, h) { // horizontal logs
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const r = j % 4; im.set(x + i, y + j, c('wood', r === 0 ? 6 : r === 3 ? 2 : 4)); }
}
function roofGable(im, x, y, w, h, ramp, team) { // trapezoid w/ tiles
  im.poly([[x, y + h], [x + 3, y], [x + w - 3, y], [x + w, y + h]], (px, py) => {
    const row = (py - y) % 3; const sh = (px - x) < w * 0.5 ? 1 : 0;
    if (team) return T(row === 2 ? 1 : 2 + sh + ((px + py) % 5 === 0 ? 1 : 0));
    return c(ramp, row === 2 ? 1 : 2 + sh * 2 + ((px * 3 + py) % 7 === 0 ? 1 : 0));
  });
  im.line(x + 3, y, x + w - 3, y, team ? T(5) : c(ramp, 5));
}
function roofCone(im, cx, top, base, hw, ramp) {
  im.poly([[cx, top], [cx + hw, base], [cx - hw, base]], (px, py) => {
    const t = (px - cx) / hw; const band = ((py - top) % 4 === 0);
    return c(ramp, (band ? 1 : 0) + (t < -0.3 ? 5 : t < 0.3 ? 3 : 2));
  });
}
function door(im, x, y, w, h, glow) {
  im.rect(x, y + 2, w, h - 2, glow ? c('fire', 5) : c('wood', 1)); im.rect(x + 1, y, w - 2, 2, glow ? c('fire', 5) : c('wood', 1));
  if (!glow) for (let i = 1; i < w; i += 2) im.line(x + i, y + 2, x + i, y + h - 1, c('wood', 3));
}
function windowAt(im, x, y) { im.rect(x, y, 3, 4, c('gray', 1)); im.set(x + 1, y + 1, c('straw', 5)); }
function flag(im, x, y, h = 10) { im.line(x, y, x, y + h, c('wood', 2)); im.rect(x + 1, y, 6, 4, T(4)); im.rect(x + 1, y + 3, 5, 1, T(2)); im.set(x + 6, y + 1, T(5)); }
function spikes(im, x, y, w) { for (let i = 0; i < w; i += 4) { im.line(x + i, y, x + i + 1, y - 4, c('bone', 3)); im.set(x + i + 1, y - 4, c('bone', 5)); } }
function ground(im, w, h, ramp = 'dirt') { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (rnd(100) < 85) im.set(x, y, c(ramp, 3 + rnd(2))); }

function drawBuilding(type, faction) {
  const S = { hall: 4, farm: 2, barracks: 3, mill: 3, stable: 3, forge: 3, tower: 2, mine: 3 }[type];
  const W = S * 32, H = S * 32 + 16; // 16px of overhang above
  const im = new Img(W, H);
  const o = 16; // y offset of footprint
  const K = faction === 0;
  if (type === 'mine') {
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) { const d = ((x - 48) ** 2) / 2304 + ((y - 40) ** 2) / 1700; if (d < 1) im.set(x, y + o - 4, c('rock', Math.max(1, Math.min(9, 6 - Math.round(d * 3) - (x > 52 ? 1 : 0) + (rnd(100) < 15 ? 1 : 0))))); }
    for (let k = 0; k < 8; k++) { const x = 16 + rnd(64), y = 20 + rnd(40); im.shade(x, y + o - 4, 3, 2, (nx, ny) => c('rock', nx + ny < 0 ? 8 : 4)); }
    im.ellipse(48, 62 + o, 14, 12, c('gray', 0)); im.rect(34, 62 + o, 29, 14, c('gray', 0));
    im.rect(32, 52 + o, 3, 26, c('wood', 4)); im.rect(62, 52 + o, 3, 26, c('wood', 4)); im.rect(30, 50 + o, 37, 4, c('wood', 5)); im.rect(30, 50 + o, 37, 1, c('wood', 7));
    for (let k = 0; k < 14; k++) { const x = 20 + rnd(56), y = 30 + rnd(50); im.set(x, y + o - 4, c('gold', 6)); im.set(x + 1, y + o - 4, c('gold', 4)); im.set(x, y + o - 5, c('gold', 7)); }
    im.line(40, 78 + o, 58, 78 + o, c('wood', 2));
    for (let k = 0; k < 6; k++) im.shade(70 + rnd(16), 76 + rnd(10) + o, 2, 2, () => c('gold', 5 + rnd(2)));
    return im;
  }
  ground(im, W, S * 32, 'dirt'); // footprint gets drawn shifted
  const base = new Img(W, H); base.blit(im, 0, o); im.d = base.d;
  const fy = o; // footprint top
  switch (type) {
    case 'hall':
      if (K) {
        wallStone(im, 8, fy + 46, 112, 58);
        roofGable(im, 4, fy + 20, 120, 28, 'roofr');
        wallStone(im, 40, fy + 16, 48, 40); roofGable(im, 36, fy - 10, 56, 28, 'roofr');
        wallStone(im, 96, fy + 4, 22, 70); for (let i = 0; i < 22; i += 5) im.rect(96 + i, fy, 3, 4, c('stone', 6)); flag(im, 106, fy - 14, 14);
        door(im, 56, fy + 80, 16, 24); im.rect(54, fy + 78, 20, 2, c('stone', 7));
        for (const wx of [20, 34, 88, 104]) windowAt(im, wx, fy + 64);
        windowAt(im, 50, fy + 30); windowAt(im, 75, fy + 30);
        im.rect(8, fy + 102, 112, 2, c('stone', 2));
        flag(im, 12, fy + 8, 12);
      } else {
        for (const [cx, hw, t, b] of [[30, 26, fy + 8, fy + 62], [98, 26, fy + 8, fy + 62]]) { wallLog(im, cx - hw + 6, b - 4, (hw - 6) * 2, 40); roofCone(im, cx, t, b + 2, hw, 'straw'); spikes(im, cx - hw + 8, b + 36, (hw - 8) * 2); }
        wallLog(im, 30, fy + 50, 68, 54); roofCone(im, 64, fy - 14, fy + 56, 42, 'straw');
        im.rect(30, fy + 50, 68, 2, c('wood', 1));
        door(im, 56, fy + 82, 16, 22, false); im.shade(64, fy + 70, 5, 5, (nx, ny) => c('bone', nx < 0 ? 4 : 2)); im.set(62, fy + 70, c('gray', 0)); im.set(66, fy + 70, c('gray', 0));
        flag(im, 64, fy - 26, 14); spikes(im, 30, fy + 104, 68);
        im.rect(36, fy + 58, 6, 8, T(3)); im.rect(86, fy + 58, 6, 8, T(3));
      }
      break;
    case 'farm':
      for (let y = fy + 34; y < fy + 64; y++) for (let x = 2; x < 62; x++) im.set(x, y, (y % 4 < 2) ? c('straw', 3 + ((x * 7) % 3 === 0 ? 1 : 0)) : c('dirt', 3));
      if (K) { wallWood(im, 6, fy + 18, 32, 20); roofGable(im, 3, fy + 2, 38, 18, 'straw'); door(im, 16, fy + 26, 8, 12); windowAt(im, 30, fy + 24); }
      else { wallLog(im, 8, fy + 20, 30, 18); roofCone(im, 23, fy - 4, fy + 24, 19, 'straw'); door(im, 18, fy + 26, 8, 12); im.line(44, fy + 30, 62, fy + 30, c('wood', 3)); for (let x = 44; x < 62; x += 5) im.line(x, fy + 26, x, fy + 34, c('wood', 4)); }
      im.rect(44, fy + 10, 14, 4, T(3)); im.line(44, fy + 10, 44, fy + 28, c('wood', 2));
      break;
    case 'barracks':
      if (K) {
        wallStone(im, 4, fy + 40, 88, 52); roofGable(im, 0, fy + 10, 96, 32, 'roofr');
        door(im, 38, fy + 66, 20, 26); for (const wx of [14, 26, 66, 78]) windowAt(im, wx, fy + 52);
        // crossed swords sign
        im.rect(40, fy + 46, 16, 14, T(3)); im.line(42, fy + 48, 54, fy + 58, c('steel', 6)); im.line(54, fy + 48, 42, fy + 58, c('steel', 6));
        flag(im, 6, fy - 4, 14); flag(im, 84, fy - 4, 14);
      } else {
        for (let i = 0; i < 88; i += 4) im.rect(4 + i, fy + 30 + ((i * 7) % 5), 3, 62 - ((i * 7) % 5), c('wood', 3 + (i % 8 === 0 ? 1 : 0)));
        for (let i = 0; i < 88; i += 4) { im.line(5 + i, fy + 30 + ((i * 7) % 5), 5 + i, fy + 24 + ((i * 7) % 5), c('wood', 5)); }
        roofCone(im, 48, fy - 6, fy + 54, 30, 'leather');
        door(im, 38, fy + 68, 20, 24, true);
        im.shade(48, fy + 60, 6, 5, (nx) => c('bone', nx < 0 ? 4 : 2)); im.set(46, fy + 60, c('gray', 0)); im.set(50, fy + 60, c('gray', 0));
        spikes(im, 4, fy + 92, 88); flag(im, 48, fy - 18, 14); im.rect(16, fy + 50, 8, 12, T(3)); im.rect(72, fy + 50, 8, 12, T(3));
      }
      break;
    case 'mill':
      if (K) { wallWood(im, 6, fy + 36, 60, 50); roofGable(im, 2, fy + 10, 68, 28, 'wood'); door(im, 28, fy + 62, 16, 24); windowAt(im, 12, fy + 50); windowAt(im, 54, fy + 50); }
      else { wallLog(im, 6, fy + 36, 60, 50); roofCone(im, 36, fy - 4, fy + 42, 34, 'straw'); door(im, 28, fy + 62, 16, 24); spikes(im, 6, fy + 86, 60); }
      // log pile
      for (let r = 0; r < 3; r++) for (let k = 0; k < 4 - r; k++) { const lx = 70 + k * 6 + r * 3, ly = fy + 82 - r * 6; im.shade(lx, ly, 3, 3, (nx, ny) => (nx * nx + ny * ny < 0.3) ? c('wood', 8) : c('wood', 4)); }
      // saw blade
      im.shade(80, fy + 50, 8, 8, (nx, ny) => (nx * nx + ny * ny > 0.75) ? c('steel', 4) : c('steel', 6)); im.set(80, fy + 50, c('gray', 2)); im.rect(73, fy + 58, 14, 2, c('wood', 3));
      im.rect(8, fy + 30, 8, 6, T(3));
      break;
    case 'stable':
      if (K) { wallWood(im, 4, fy + 38, 88, 52); roofGable(im, 0, fy + 10, 96, 30, 'roofr'); }
      else { wallLog(im, 4, fy + 38, 88, 52); roofGable(im, 0, fy + 10, 96, 30, 'leather'); spikes(im, 4, fy + 90, 88); }
      door(im, 34, fy + 56, 28, 34); im.line(34, fy + 56, 62, fy + 90, c('wood', 4)); im.line(62, fy + 56, 34, fy + 90, c('wood', 4));
      im.shade(14, fy + 80, 7, 5, (nx, ny) => c('straw', ny < 0 ? 5 : 3)); im.shade(82, fy + 80, 7, 5, (nx, ny) => c('straw', ny < 0 ? 5 : 3));
      im.rect(44, fy + 44, 8, 8, T(3)); flag(im, 88, fy - 2, 12);
      break;
    case 'forge':
      if (K) { wallStone(im, 6, fy + 36, 76, 54); roofGable(im, 2, fy + 12, 84, 26, 'stone'); }
      else { wallLog(im, 6, fy + 36, 76, 54); roofCone(im, 44, fy - 2, fy + 42, 40, 'leather'); spikes(im, 6, fy + 90, 76); }
      wallStone(im, 66, fy - 6, 12, 40); im.rect(65, fy - 8, 14, 3, c('stone', 7));
      door(im, 30, fy + 62, 22, 28, true);
      im.rect(54, fy + 80, 12, 4, c('steel', 2)); im.rect(57, fy + 84, 6, 6, c('steel', 1)); im.rect(52, fy + 79, 16, 1, c('steel', 5));
      im.rect(12, fy + 48, 8, 10, T(3));
      break;
    case 'tower':
      if (K) {
        wallStone(im, 14, fy + 4, 36, 56); for (let i = 0; i < 40; i += 6) im.rect(12 + i, fy - 2, 4, 6, c('stone', 6)); im.rect(12, fy + 2, 40, 3, c('stone', 7));
        im.rect(28, fy + 20, 4, 8, c('gray', 1)); door(im, 26, fy + 44, 12, 16); flag(im, 32, fy - 16, 12);
      } else {
        for (const lx of [16, 44]) im.line(lx, fy + 60, lx + (lx < 30 ? 4 : -4), fy + 20, c('wood', 3), 3);
        im.line(18, fy + 50, 44, fy + 30, c('wood', 2), 2); im.line(46, fy + 50, 20, fy + 30, c('wood', 2), 2);
        wallLog(im, 12, fy + 6, 40, 16); roofCone(im, 32, fy - 14, fy + 8, 24, 'leather'); spikes(im, 12, fy + 22, 40);
        im.rect(28, fy + 10, 8, 8, T(3)); flag(im, 32, fy - 26, 12);
      }
      break;
  }
  return im;
}

const bCache = new Map();
export function buildingSprite(type, faction, team, stage) {
  const key = type + faction + team + stage;
  let cv = bCache.get(key); if (cv) return cv;
  let im;
  if (stage === 0) { // foundation + scaffolding
    const s = { hall: 4, farm: 2, barracks: 3, mill: 3, stable: 3, forge: 3, tower: 2 }[type];
    im = new Img(s * 32, s * 32 + 16); const g = new Img(s * 32, s * 32); ground(g, s * 32, s * 32, 'dirt'); im.blit(g, 0, 16);
    const W = s * 32, top = 16 + W * 0.35;
    for (let x = 6; x < W - 4; x += 12) im.line(x, 16 + W - 4, x, top, c('wood', 5), 2);
    for (let y = top; y < 16 + W - 4; y += 10) im.line(4, y, W - 4, y, c('wood', 4), 2);
    im.line(6, 16 + W - 6, W - 6, top, c('wood', 3)); im.line(W - 6, 16 + W - 6, 6, top, c('wood', 3));
    for (let k = 0; k < 6; k++) im.rect(4 + rnd(W - 12), 16 + W - 8 + rnd(4), 7, 2, c('wood', 6));
  } else {
    im = drawBuilding(type, faction);
    if (stage === 1) { const W = im.w; for (let x = 4; x < W - 2; x += 14) im.line(x, im.h - 2, x, 16 + W * 0.3, c('wood', 5), 2); for (let y = 16 + W * 0.35 | 0; y < im.h - 2; y += 14) im.line(2, y, W - 2, y, c('wood', 4), 2); }
  }
  im.outline(c('gray', 1));
  cv = im.toCanvas(lut(team)); bCache.set(key, cv); return cv;
}

export function rubbleSprite(size) {
  const key = 'rubble' + size; let cv = bCache.get(key); if (cv) return cv;
  const im = new Img(size * 32, size * 32);
  for (let k = 0; k < size * size * 14; k++) { const x = 4 + rnd(size * 32 - 8), y = 4 + rnd(size * 32 - 8); im.shade(x, y, 2 + rnd(3), 1 + rnd(2), (nx, ny) => c('rock', nx + ny < 0 ? 5 : 2)); }
  for (let k = 0; k < size * 4; k++) { const x = rnd(size * 32), y = rnd(size * 32); im.line(x, y, x + 6, y + 2, c('wood', 1), 2); }
  cv = im.toCanvas(lut(0)); bCache.set(key, cv); return cv;
}

export function fireSprite(frame, big) {
  const key = 'fire' + frame + big; let cv = bCache.get(key); if (cv) return cv;
  const r = rng(frame * 13 + (big ? 5 : 0)); const s = big ? 24 : 16; const im = new Img(s, s + 6);
  for (let k = 0; k < (big ? 60 : 30); k++) {
    const x = s / 2 + (r.int(s) - s / 2) * 0.6, y = s + 4 - r.int(s);
    const hgt = (s + 4 - y) / s; im.set(x, y, c('fire', Math.max(0, 7 - Math.round(hgt * 7) + r.int(2))));
    im.set(x + 1, y, c('fire', Math.max(0, 6 - Math.round(hgt * 6))));
  }
  for (let k = 0; k < 6; k++) im.set(s / 2 + r.int(6) - 3, r.int(6), c('gray', 4));
  cv = im.toCanvas(lut(0)); bCache.set(key, cv); return cv;
}

export function missileSprite(kind) {
  const key = 'mis' + kind; let cv = bCache.get(key); if (cv) return cv;
  let im;
  if (kind === 'rock') { im = new Img(8, 8); im.shade(4, 4, 3, 3, (nx, ny) => c('rock', nx + ny < 0 ? 7 : 3)); im.outline(c('gray', 1)); }
  else { im = new Img(10, 3); im.line(0, 1, 8, 1, c('wood', 6)); im.set(9, 1, c('steel', 7)); im.set(0, 0, c('bone', 4)); im.set(0, 2, c('bone', 4)); }
  cv = im.toCanvas(lut(0)); bCache.set(key, cv); return cv;
}

export function boomSprite(frame) {
  const key = 'boom' + frame; let cv = bCache.get(key); if (cv) return cv;
  const im = new Img(32, 32); const r = rng(frame + 99); const rad = 4 + frame * 3;
  for (let k = 0; k < 80; k++) { const a = r.int(628) / 100, d = r.int(rad * 10) / 10; im.set(16 + Math.cos(a) * d, 16 + Math.sin(a) * d * 0.8, c('fire', Math.max(0, 7 - frame * 2 - r.int(3)))); }
  cv = im.toCanvas(lut(0)); bCache.set(key, cv); return cv;
}

// ------------------------------------------------------------------ UI
export function stonePanel(w, h, seed = 3) {
  const r = rng(seed); const im = new Img(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const blk = (((x / 24) | 0) * 7 + ((y / 16) | 0) * 13) % 4; const seam = y % 16 === 0 || (x + ((y / 16) | 0) % 2 * 12) % 24 === 0;
    im.set(x, y, seam ? c('ui', 1) : c('ui', 3 + (blk === 0 ? 1 : 0) + (r.int(100) < 18 ? 1 : 0) - (r.int(100) < 10 ? 1 : 0)));
  }
  return im.toCanvas(lut(0));
}
export function woodPanel(w, h) {
  const im = new Img(w, h); const r = rng(9);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) im.set(x, y, c('wood', 3 + ((y + ((x / 40) | 0) * 2) % 5 === 0 ? -1 : 0) + (r.int(100) < 10 ? 1 : 0)));
  im.rect(0, 0, w, 1, c('wood', 6)); im.rect(0, h - 1, w, 1, c('wood', 1));
  return im.toCanvas(lut(0));
}

// command icons 46x38
const iconCache = new Map();
export function cmdIcon(name, team) {
  const key = name + team; let cv = iconCache.get(key); if (cv) return cv;
  const im = new Img(46, 38);
  for (let y = 0; y < 38; y++) for (let x = 0; x < 46; x++) im.set(x, y, c('ui', 2 + ((x + y) % 9 === 0 ? 1 : 0)));
  const st = c('steel', 6), st2 = c('steel', 3), wd = c('wood', 5);
  switch (name) {
    case 'move': im.poly([[14, 8], [24, 8], [26, 22], [32, 26], [32, 30], [14, 30]], (x) => c('leather', x < 20 ? 5 : 3)); im.rect(14, 28, 18, 2, c('leather', 1)); break;
    case 'stop': im.shade(23, 19, 10, 12, (nx, ny) => (Math.abs(nx) > 0.75 || ny < -0.8) ? c('steel', 5) : T(nx < 0 ? 4 : 2)); im.rect(21, 12, 4, 14, c('gold', 6)); im.rect(16, 16, 14, 4, c('gold', 6)); break;
    case 'attack': im.line(12, 30, 32, 8, st, 2); im.line(13, 30, 33, 9, st2); im.line(10, 24, 18, 32, c('gold', 5), 2); im.rect(9, 31, 4, 3, wd); break;
    case 'hold': im.shade(23, 19, 10, 12, (nx, ny) => c('steel', nx < 0 ? 6 : 3)); im.line(14, 30, 32, 8, st, 2); break;
    case 'amove': im.line(8, 30, 26, 10, st, 2); im.line(9, 24, 15, 31, c('gold', 5), 2); im.poly([[28, 14], [38, 22], [28, 30]], c('gold', 6)); break;
    case 'gather': im.line(12, 32, 30, 10, wd, 2); im.poly([[22, 6], [38, 12], [34, 16], [26, 11]], st); im.shade(34, 28, 5, 4, (nx, ny) => c('gold', nx + ny < 0 ? 7 : 4)); break;
    case 'return': im.shade(23, 22, 11, 9, (nx, ny) => c('leather', nx + ny < 0 ? 5 : 3)); im.rect(19, 10, 8, 4, c('leather', 2)); im.shade(23, 22, 3, 3, () => c('gold', 6)); break;
    case 'build': im.line(14, 32, 28, 14, wd, 3); im.rect(22, 8, 16, 8, st2); im.rect(22, 8, 16, 2, st); break;
    case 'build2': im.line(14, 32, 28, 14, wd, 3); im.rect(22, 8, 16, 8, st2); im.rect(22, 8, 16, 2, st); im.poly([[6, 6], [14, 6], [10, 0]], c('gold', 6)); im.rect(4, 22, 10, 10, c('stone', 6)); im.rect(4, 22, 10, 2, c('stone', 8)); break;
    case 'cancel': im.line(12, 8, 34, 30, c('blood', 3), 4); im.line(34, 8, 12, 30, c('blood', 3), 4); break;
    case 'back': im.poly([[10, 19], [22, 8], [22, 14], [36, 14], [36, 24], [22, 24], [22, 30]], c('gold', 5)); break;
  }
  im.outline(c('gray', 1));
  cv = im.toCanvas(lut(team)); iconCache.set(key, cv); return cv;
}

// entity portrait icon (scaled sprite on a background)
export function entIcon(type, faction, team, isUnit) {
  const key = 'e' + type + faction + team; let cv = iconCache.get(key); if (cv) return cv;
  cv = document.createElement('canvas'); cv.width = 46; cv.height = 38; const ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(stonePanel(46, 38, 11), 0, 0);
  if (isUnit) { const s = unitSprite(type, faction, team, 'idle'); ctx.drawImage(s, 4, 6, 24, 24, 3, -1, 40, 40); }
  else { const s = buildingSprite(type, faction, team, 2); ctx.drawImage(s, 0, 0, s.width, s.height, 4, 1, 38, 38 * s.height / s.width); }
  iconCache.set(key, cv); return cv;
}

export function paletteCSS(i) { return `rgb(${PAL[i * 3]},${PAL[i * 3 + 1]},${PAL[i * 3 + 2]})`; }
