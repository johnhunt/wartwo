// 256-colour indexed palette, VGA style. Sprites are drawn as palette indices,
// then converted to RGBA. Team colours occupy a remappable ramp (like the 90s classics).

export const PAL = new Uint8Array(256 * 3);
const ramps = {};
let next = 1; // index 0 = transparent

function hex(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
function addRamp(name, from, to, n) {
  const a = hex(from), b = hex(to), idx = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : i / (n - 1);
    PAL[next * 3] = Math.round(a[0] + (b[0] - a[0]) * t);
    PAL[next * 3 + 1] = Math.round(a[1] + (b[1] - a[1]) * t);
    PAL[next * 3 + 2] = Math.round(a[2] + (b[2] - a[2]) * t);
    idx.push(next++);
  }
  ramps[name] = idx;
  return idx;
}
// Team colour ramp MUST be first block so remap is easy: 6 shades.
export const TEAM_RAMP = addRamp('team', '#300000', '#ff4040', 6);
export const TEAM_COLORS = [
  ['#3a0606', '#e83030'], // red
  ['#06103a', '#3c78ff'], // blue
  ['#08300c', '#38d040'], // green
  ['#2a0838', '#b858e8'], // violet
  ['#3a1a02', '#f89820'], // orange
  ['#2c2a06', '#f0e040'], // yellow
  ['#082c2c', '#38d8d8'], // teal
  ['#202020', '#e8e8e8'], // white
];
export const TEAM_NAMES = ['Red', 'Blue', 'Green', 'Violet', 'Orange', 'Yellow', 'Teal', 'White'];

addRamp('black', '#000000', '#000000', 1);
addRamp('white', '#ffffff', '#ffffff', 1);
addRamp('grass', '#1c3a10', '#7aa834', 10);
addRamp('forest', '#06160a', '#3f7428', 8);
addRamp('pine', '#0a2414', '#4f8a3c', 8);
addRamp('water', '#081c40', '#4a90c8', 10);
addRamp('foam', '#a8d0e8', '#f0faff', 3);
addRamp('sand', '#6a5428', '#d8c080', 6);
addRamp('dirt', '#3a2610', '#a07848', 8);
addRamp('rock', '#2a2420', '#a89888', 10);
addRamp('stone', '#30343c', '#c8ccd4', 10);
addRamp('wood', '#2a1406', '#b07838', 10);
addRamp('straw', '#5a4010', '#e8c860', 6);
addRamp('gold', '#5a3800', '#fff08a', 8);
addRamp('skin', '#5a2c18', '#f0b890', 6);
addRamp('gskin', '#1a3010', '#90c050', 6);
addRamp('steel', '#303844', '#e8f0f8', 8);
addRamp('leather', '#2a1608', '#8a5a30', 6);
addRamp('fire', '#801000', '#fff060', 8);
addRamp('blood', '#300000', '#a01010', 4);
addRamp('ui', '#1a1410', '#8a7660', 10);
addRamp('bone', '#6a6050', '#f0e8d0', 5);
addRamp('gray', '#101010', '#f0f0f0', 16);
addRamp('purple', '#200830', '#a070c0', 6);
addRamp('roofr', '#3a0c08', '#c04830', 6);
// fill the rest with a grayscale so the palette is a full 256
while (next < 256) { const v = Math.round((next - 0) % 256); PAL[next * 3] = PAL[next * 3 + 1] = PAL[next * 3 + 2] = v; next++; }

export const R = ramps;
export function c(name, i) { const r = ramps[name]; return r[Math.max(0, Math.min(r.length - 1, i))]; }
export function rgb(index) { return `rgb(${PAL[index * 3]},${PAL[index * 3 + 1]},${PAL[index * 3 + 2]})`; }

// Build a 256-entry RGBA lookup with team ramp replaced
export function teamLUT(team) {
  const lut = new Uint32Array(256);
  const [d, l] = TEAM_COLORS[team % TEAM_COLORS.length].map(hex);
  for (let i = 0; i < 256; i++) {
    let r = PAL[i * 3], g = PAL[i * 3 + 1], b = PAL[i * 3 + 2];
    const ti = TEAM_RAMP.indexOf(i);
    if (ti >= 0) { const t = ti / (TEAM_RAMP.length - 1); r = Math.round(d[0] + (l[0] - d[0]) * t); g = Math.round(d[1] + (l[1] - d[1]) * t); b = Math.round(d[2] + (l[2] - d[2]) * t); }
    lut[i] = i === 0 ? 0 : (255 << 24) | (b << 16) | (g << 8) | r;
  }
  return lut;
}
export function teamCSS(team) { return TEAM_COLORS[team % TEAM_COLORS.length][1]; }
