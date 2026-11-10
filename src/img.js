// Indexed-colour image: one byte per pixel, 0 = transparent.
export class Img {
  constructor(w, h) { this.w = w; this.h = h; this.d = new Uint8Array(w * h); }
  set(x, y, col) { x |= 0; y |= 0; if (x >= 0 && y >= 0 && x < this.w && y < this.h && col) this.d[y * this.w + x] = col; }
  get(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h ? this.d[y * this.w + x] : 0; }
  clear(x, y) { if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.d[y * this.w + x] = 0; }
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
  ellipse(cx, cy, rx, ry, col) { this.shade(cx, cy, rx, ry, () => col); }
  // shaded ellipse: fn(nx,ny,x,y) -> colour, nx/ny in -1..1
  shade(cx, cy, rx, ry, fn) {
    for (let y = -ry; y <= ry; y++) for (let x = -rx; x <= rx; x++) {
      const nx = x / (rx + 0.01), ny = y / (ry + 0.01); if (nx * nx + ny * ny <= 1.05) this.set(cx + x, cy + y, fn(nx, ny, x, y));
    }
  }
  poly(pts, col) { // scanline fill; col may be fn(x,y)
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
  // 1px outline around opaque pixels; `skip` is an index treated as empty (e.g. shadow)
  outline(col, skip = -1) {
    const o = new Uint8Array(this.d), w = this.w, h = this.h, d = this.d;
    const solid = (x, y) => { if (x < 0 || y < 0 || x >= w || y >= h) return false; const v = d[y * w + x]; return v !== 0 && v !== skip; };
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (solid(x, y)) continue;
      if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) o[y * w + x] = col;
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
