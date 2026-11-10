// 256-colour indexed palette, VGA style. Sprites are drawn as palette indices,
// then converted to RGBA. Team colours occupy a remappable ramp (like the 90s classics).
// Ramps are hue-shifted (cool shadows, warm highlights) the way hand-made palettes were.

export const PAL = new Uint8Array(256 * 3);
const ramps = {};
let next = 1; // index 0 = transparent

function hex(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
// stops: list of hex colours spread evenly over n entries
function multi(stops, t) {
  const s = stops.map(hex), f = t * (s.length - 1), i = Math.min(s.length - 2, Math.floor(f)), k = f - i;
  return [0, 1, 2].map(j => Math.round(s[i][j] + (s[i + 1][j] - s[i][j]) * k));
}
function addRamp(name, stops, n) {
  const idx = [];
  if (stops.length === 1) stops = [stops[0], stops[0]];
  for (let i = 0; i < n; i++) {
    const col = multi(stops, n === 1 ? 0 : i / (n - 1));
    PAL[next * 3] = col[0]; PAL[next * 3 + 1] = col[1]; PAL[next * 3 + 2] = col[2];
    idx.push(next++);
  }
  ramps[name] = idx;
  return idx;
}
// Team colour ramp MUST be first block so remap is easy.
export const TEAM_RAMP = addRamp('team', ['#200000', '#ff4040'], 8);
// [deep shadow, mid, bright, highlight]
export const TEAM_COLORS = [
  ['#3a0408', '#a01018', '#e83428', '#ffa078'], // red
  ['#060c3a', '#1838a0', '#3c78f0', '#a0d0ff'], // blue
  ['#04280c', '#127a24', '#38c840', '#b0f890'], // green
  ['#24062e', '#6c2494', '#b058e0', '#e8b0ff'], // violet
  ['#3a1602', '#a85008', '#f08c18', '#ffd880'], // orange
  ['#2c2404', '#8a7a0c', '#e8d430', '#fffcb0'], // yellow
  ['#042828', '#0c7878', '#30d0c8', '#b0fff0'], // teal
  ['#1c1c24', '#6c6c78', '#c8c8d0', '#ffffff'], // white
];
export const TEAM_NAMES = ['Red', 'Blue', 'Green', 'Violet', 'Orange', 'Yellow', 'Teal', 'White'];

addRamp('black', ['#000000'], 1);
addRamp('white', ['#ffffff'], 1);
addRamp('outline', ['#0a0810'], 1);
addRamp('grass', ['#14301a', '#27521c', '#3f7a22', '#6aa22e', '#a8cc50'], 10);
addRamp('forest', ['#060f0c', '#14301a', '#274a1c'], 6);
addRamp('pine', ['#041410', '#0c3024', '#1a5a2a', '#3c8a30', '#86ba48'], 10);
addRamp('water', ['#0a1438', '#12306e', '#2060a8', '#4898d0', '#98d4ec'], 10);
addRamp('foam', ['#a8d4e8', '#f4fcff'], 3);
addRamp('sand', ['#4a3418', '#8a6c38', '#c4a860', '#ecd898'], 8);
addRamp('dirt', ['#24140a', '#4c3018', '#7a5830', '#a88858'], 8);
addRamp('rock', ['#17141a', '#3c363a', '#6c6460', '#a09688', '#d4cab8'], 10);
addRamp('stone', ['#1c1e2a', '#474c5c', '#7c8490', '#b4b8bc', '#e8e8e0'], 10);
addRamp('wood', ['#1a0c08', '#4a2812', '#84531f', '#b98538', '#e4be78'], 10);
addRamp('straw', ['#3c2608', '#86621a', '#c8a030', '#f4dc78'], 8);
addRamp('gold', ['#3c2000', '#96600a', '#e8b418', '#fff078', '#ffffe0'], 8);
addRamp('skin', ['#3e1a14', '#8a4a30', '#cc8858', '#f4bc8c', '#ffe0c0'], 8);
addRamp('gskin', ['#0c2010', '#285018', '#4f8424', '#8cb840', '#c8e078'], 8);
addRamp('steel', ['#141826', '#39445c', '#6c7c94', '#a8b8cc', '#e4f0f8', '#ffffff'], 10);
addRamp('leather', ['#180a06', '#4a2812', '#7e4e24', '#b0803c', '#d8b070'], 8);
addRamp('fire', ['#5a0800', '#c82800', '#f87808', '#ffc820', '#fff8a0'], 8);
addRamp('blood', ['#280004', '#a81010'], 4);
addRamp('ui', ['#120e0c', '#3a2e26', '#6c5a48', '#a89478'], 10);
addRamp('bone', ['#4a4030', '#a09474', '#e0d4b0', '#fff8e0'], 6);
addRamp('gray', ['#101010', '#f0f0f0'], 16);
addRamp('purple', ['#1a0628', '#5c2c84', '#b080d0'], 6);
addRamp('roofr', ['#2a0808', '#74180e', '#b83c1c', '#e8743c', '#ffb880'], 8);
addRamp('slate', ['#10162a', '#2c3e64', '#547498', '#8cacc8', '#c8e0ec'], 8);
addRamp('fur', ['#141012', '#3c3430', '#6c6258', '#a09886', '#d0c8b4'], 8);
addRamp('cloth', ['#2a2418', '#6c6044', '#b0a47c', '#e4dcb8'], 6);
export const SHADOW = addRamp('shadow', ['#000000'], 1)[0]; // translucent in the LUT
// fill the rest with a grayscale so the palette is a full 256
while (next < 256) { const v = next; PAL[next * 3] = PAL[next * 3 + 1] = PAL[next * 3 + 2] = v; next++; }

export const R = ramps;
export function c(name, i) { const r = ramps[name]; return r[Math.max(0, Math.min(r.length - 1, i | 0))]; }
export function rgb(index) { return `rgb(${PAL[index * 3]},${PAL[index * 3 + 1]},${PAL[index * 3 + 2]})`; }

// Build a 256-entry RGBA lookup with team ramp replaced
export function teamLUT(team) {
  const lut = new Uint32Array(256);
  const stops = TEAM_COLORS[team % TEAM_COLORS.length];
  for (let i = 0; i < 256; i++) {
    let r = PAL[i * 3], g = PAL[i * 3 + 1], b = PAL[i * 3 + 2];
    const ti = TEAM_RAMP.indexOf(i);
    if (ti >= 0) [r, g, b] = multi(stops, ti / (TEAM_RAMP.length - 1));
    lut[i] = i === 0 ? 0 : (((i === SHADOW ? 96 : 255) << 24) | (b << 16) | (g << 8) | r) >>> 0;
  }
  return lut;
}
export function teamCSS(team) { return TEAM_COLORS[team % TEAM_COLORS.length][2]; }
