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

// The look of the game lives here. Shadows fall away into teal and plum instead of grey, lights
// climb towards gold; Vale is ivory stone, brass and verdigris roofs, the Warband is ash, char and ember.
addRamp('black', ['#000000'], 1);
addRamp('white', ['#ffffff'], 1);
addRamp('outline', ['#160c20'], 1);
addRamp('grass', ['#0c2630', '#17502e', '#35802a', '#7cb22e', '#d2dc5c'], 10);
addRamp('forest', ['#050d14', '#0c2a26', '#1c4a26'], 6);
addRamp('pine', ['#04101c', '#082c34', '#12583c', '#3a8c38', '#a4c64c'], 10);
addRamp('water', ['#081638', '#0a3a6c', '#1278a0', '#3cbcc4', '#b0f0dc'], 10);
addRamp('foam', ['#a8e4e0', '#f6fffc'], 3);
addRamp('sand', ['#4a2c20', '#906438', '#d0a85c', '#f6de98'], 8);
addRamp('dirt', ['#28101a', '#58281c', '#8c5630', '#c08e5a'], 8);
addRamp('rock', ['#181226', '#3c3452', '#6c6884', '#a4a2ac', '#e0dcc8'], 10);
addRamp('stone', ['#261c38', '#5a4c68', '#978a8c', '#d2c4a6', '#f8eed2'], 10);
addRamp('wood', ['#1e0a14', '#52261c', '#8e5424', '#c68c3c', '#f2ca80'], 10);
addRamp('straw', ['#402010', '#8c5e18', '#d09c2c', '#f8dc70'], 8);
addRamp('gold', ['#3a1c08', '#8e520e', '#dca01c', '#ffe468', '#fffbd8'], 8);
addRamp('skin', ['#3e1a1c', '#8a4830', '#cc8858', '#f4bc8c', '#ffe0c0'], 8);
addRamp('gskin', ['#1a1226', '#443a56', '#746e8a', '#a8a6ba', '#e0e0e8'], 8); // the Warband's ashen hide
addRamp('steel', ['#141630', '#383e64', '#6a7a9c', '#a8bacc', '#e4f2f4', '#ffffff'], 10);
addRamp('leather', ['#1c080e', '#4e1c18', '#843e20', '#b6723a', '#deb070'], 8);
addRamp('fire', ['#5a0800', '#c82800', '#f87808', '#ffc820', '#fff8a0'], 8);
addRamp('blood', ['#280004', '#a81010'], 4);
addRamp('ui', ['#120e0c', '#3a2e26', '#6c5a48', '#a89478'], 10);
addRamp('bone', ['#4a3c38', '#a09078', '#e2d4b0', '#fff8e0'], 6);
addRamp('gray', ['#101010', '#f0f0f0'], 16);
addRamp('purple', ['#1a0628', '#5c2c84', '#b080d0'], 6);
addRamp('roofr', ['#2a0808', '#74180e', '#b83c1c', '#e8743c', '#ffb880'], 8);
addRamp('slate', ['#061a2c', '#0c4252', '#1a7472', '#4cb09a', '#b8e8c8'], 8); // verdigris roofs of Vale
addRamp('fur', ['#120c16', '#2e2434', '#56485a', '#8a7c86', '#c0b6b0'], 8);
addRamp('cloth', ['#30242c', '#74644c', '#b8a880', '#ecdfba'], 6);
addRamp('char', ['#0a080e', '#221a20', '#40302e', '#68503c'], 6);      // burnt timber
addRamp('obsid', ['#08040e', '#1e1030', '#4a2a6c', '#9c7cd0', '#f0e4ff'], 6); // volcanic glass
addRamp('autumn', ['#2a0c14', '#6c2014', '#b8501a', '#eca02c', '#fce078'], 8);
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
    lut[i] = i === 0 ? 0 : i === SHADOW ? ((104 << 24) | (48 << 16) | (10 << 8) | 20) >>> 0 : ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0; // shadows are deep plum, not black
  }
  return lut;
}
export function teamCSS(team) { return TEAM_COLORS[team % TEAM_COLORS.length][2]; }
