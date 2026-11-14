// Unit models: posable figures built from primitives for the r3d renderer.
// Everything faces +y (towards the viewer); the renderer turns them to any of 8 facings.
import { sph, cap, box, slab, fru, cvx, mat, rot, aim, xform, add, sub, scl, norm, lerp3, hash2, TEX, ID } from './r3d.js';

const M_STEEL = mat('steel', 0, 8, { spec: 0.45, shin: 10 });
const M_DSTEEL = mat('steel', 0, 6, { spec: 0.4, shin: 8 });
const M_GOLD = mat('gold', 1, 7, { spec: 0.5 });
const M_TEAM = mat('team', 0, 7);
const M_LEATHER = mat('leather', 1, 6);
const M_DLEATHER = mat('leather', 0, 4);
const M_WOOD = mat('wood', 2, 8);
const M_DWOOD = mat('wood', 1, 5);
const M_BONE = mat('bone', 1, 5);
const M_BLACK = mat('gray', 0, 3);
const M_CLOTH = mat('cloth', 1, 5);
const M_ROCK = mat('rock', 2, 8);
const M_OBSID = mat('obsid', 0, 4, { spec: 0.6, shin: 16 });
const M_BRASS = mat('gold', 1, 7, { spec: 0.6, shin: 9 });
const M_EMBER = mat('fire', 3, 7, { glow: 0.9 });
// cracks in the Warband's ashen hide glow like banked coals
const emberCrack = (lp, k = 1) => { const u = lp[0] * 0.8 + lp[2] * 1.3 + Math.sin(lp[2] * 1.1 + lp[0]) * 1.1; return Math.abs(((u % 4.6) + 4.6) % 4.6 - 2.3) < 0.34 * k && hash2(Math.floor(u / 4.6), Math.floor((lp[2] + 40) / 7)) > 0.45; };
const M_STRING = mat('bone', 3, 5, { noShadow: true });
const skinM = (f) => f ? mat('gskin', 1, 7, { tex: (lp) => (emberCrack(lp, 0.8) ? { ramp: 'fire', abs: 0.45 } : 0) }) : mat('skin', 1, 7);

// ---------------------------------------------------------------- poses
// leg swing s in -1..1 (left leg forward when positive), lift = which foot is off the ground
function walkPose(frame) {
  const i = frame.startsWith('walk') ? +frame[4] : -1;
  if (i < 0) return { s: 0, bob: 0, liftL: 0, liftR: 0 };
  return [{ s: 1, bob: 0, liftL: 0, liftR: 0 }, { s: 0.15, bob: 1, liftL: 0, liftR: 2.2 }, { s: -1, bob: 0, liftL: 0, liftR: 0 }, { s: -0.15, bob: 1, liftL: 2.2, liftR: 0 }][i];
}

const LOOKS = {
  worker: [
    { head: 'cap', torso: 'tunic', weapon: 'pick' },
    { head: 'bald', torso: 'bare', weapon: 'pick', bulk: 0.6 },
  ],
  soldier: [
    { head: 'helm', torso: 'plate', weapon: 'sword', shield: true, pauldron: true },
    { head: 'horn', torso: 'bare', weapon: 'axe', bulk: 1.25, pauldron: true },
  ],
  archer: [
    { head: 'hood', torso: 'jerkin', weapon: 'bow', quiver: true },
    { head: 'mohawk', torso: 'bare', weapon: 'spear', bulk: 0.8, warpaint: true },
  ],
  knight: [
    { head: 'greathelm', torso: 'plate', weapon: 'lance', shield: true, pauldron: true, mounted: 8 },
    { head: 'skull', torso: 'bare', weapon: 'axe', bulk: 1, pauldron: true, mounted: 5.5 },
  ],
};

function headTex(look, f) {
  const sk = f ? 'gskin' : 'skin';
  const eyes = (lp) => lp[1] > 2.2 && lp[2] > -0.3 && lp[2] < 1.25 && Math.abs(lp[0]) > 0.75 && Math.abs(lp[0]) < 2.5;
  const brow = (lp) => f && lp[1] > 2.0 && lp[2] >= 1.25 && lp[2] < 2.1;
  return (lp) => {
    const x = lp[0], y = lp[1], z = lp[2];
    const face = y > 1.2 && z < 1.9 - Math.max(0, Math.abs(x) - 2.6) * 2;
    switch (look.head) {
      case 'helm': // open-faced steel helmet with a nasal bar and team crest
        if (face && z > -3.2) { if (Math.abs(x) < 0.55 && z > -0.8) return { ramp: 'steel', d: 0.1 }; if (eyes(lp)) return { ramp: 'gray', abs: 0 }; return { ramp: sk }; }
        if (Math.abs(x) < 0.9 && z > 1.5) return { ramp: 'team', d: 0.1 };
        return 0;
      case 'greathelm': // full helm with a dark eye slit
        if (y > 1.5 && z > 0.1 && z < 1.3 && Math.abs(x) < 3.4) return { ramp: 'gray', abs: 0 };
        if (y > 2 && Math.abs(x) < 0.5 && z < 0.2) return -0.25;
        return 0;
      case 'hood': // team-coloured hood
        if (face && z > -3 && z < 1.3) { if (eyes(lp)) return { ramp: 'gray', abs: 0 }; return { ramp: sk }; }
        return { ramp: 'team', lo: 0, hi: 6, d: (hash2(x * 2, z * 2) - 0.5) * 0.06 };
      case 'cap': // straw hat is separate; hair at the back
        if (eyes(lp)) return { ramp: 'gray', abs: 0 };
        if (y < 0.4 || z > 2.4) return { ramp: 'leather', lo: 0, hi: 5 };
        return 0;
      case 'horn': case 'skull':
        if (z > 1.6 && look.head === 'horn') return { ramp: 'steel', lo: 0, hi: 6 };
        if (eyes(lp)) return { ramp: 'fire', abs: 0.75 };
        if (brow(lp)) return -0.28;
        return 0;
      case 'mohawk':
        if (eyes(lp)) return { ramp: 'fire', abs: 0.75 };
        if (brow(lp)) return -0.28;
        if (look.warpaint && y > 1.5 && z < -0.3 && z > -1.4) return { ramp: 'team', d: 0.1 };
        return 0;
      default:
        if (eyes(lp)) return { ramp: f ? 'fire' : 'gray', abs: f ? 0.75 : 0 };
        if (brow(lp)) return -0.28;
        return 0;
    }
  };
}

function torsoMat(look, f) {
  const sk = f ? 'gskin' : 'skin';
  switch (look.torso) {
    case 'plate': return mat('steel', 0, 8, { spec: 0.4, shin: 10, tex: (lp) => {
      if (lp[2] < -3.2 && lp[2] > -4.6) return { ramp: 'gold', lo: 1, hi: 7, d: 0.1 }; // brass belt
      if (lp[2] > 4.4) return { ramp: 'gold', lo: 1, hi: 7, d: 0.05 }; // gorget
      if (lp[2] <= -4.6) return { ramp: 'team', d: (Math.floor(lp[0] + 20) & 1) ? 0.06 : -0.06 }; // tabard skirt
      if (lp[1] > 0 && Math.abs(lp[0]) < 2.1 && lp[2] < 3.6) return { ramp: 'team', d: 0.12 }; // tabard
      return 0;
    } });
    case 'tunic': return mat('team', 0, 7, { tex: (lp) => (lp[2] < -2.6 && lp[2] > -3.9) ? { ramp: 'leather', lo: 0, hi: 4 } : (lp[2] > 4.2 && lp[1] > 0 && Math.abs(lp[0]) < 1.6 ? { ramp: sk } : 0) });
    case 'jerkin': return mat('leather', 1, 7, { tex: (lp) => {
      if (lp[2] < -2.8 && lp[2] > -4) return { ramp: 'gray', lo: 0, hi: 3 };
      if (lp[2] <= -4) return { ramp: 'team', lo: 0, hi: 6 };
      if (lp[1] > 0 && Math.abs(lp[0] - lp[2] * 0.7) < 1.1) return { ramp: 'leather', lo: 0, hi: 3 }; // baldric
      return (hash2(lp[0] * 2, lp[2] * 2) - 0.5) * 0.08;
    } });
    default: return mat(sk, 1, 7, { tex: (lp) => { // bare chest with harness
      if (lp[2] < -2.8) return { ramp: 'leather', lo: 0, hi: 5, d: Math.abs(lp[0]) < 1.2 && lp[1] > 0 && lp[2] > -4.4 ? 0.3 : 0 };
      if (lp[1] > 0 && Math.abs(Math.abs(lp[0]) - (2.5 - lp[2] * 0.45)) < 0.9 && lp[2] > -2.8) return { ramp: 'leather', lo: 0, hi: 4 };
      if (f && emberCrack(lp)) return { ramp: 'fire', abs: 0.55 };
      if (lp[1] > 2 && lp[2] > 0.4 && lp[2] < 1.3 && Math.abs(lp[0]) > 0.6) return -0.14; // pecs
      return 0;
    } });
  }
}

function weaponPrims(kind, hand, d, f, opt = {}) {
  const P = [], at = (k) => add(hand, scl(d, k));
  const side = norm([d[1] * 0 - d[2] * 0 + 1, 0.05, 0]); // roughly x
  switch (kind) {
    case 'sword': // broad, leaf-bladed, brass hilted
      P.push(cap(at(-2.4), at(1.2), 0.85, M_DLEATHER), sph(at(-2.9), 1.3, M_BRASS));
      P.push(cap(add(at(1.6), [-2.4, 0, 0]), add(at(1.6), [2.4, 0, 0]), 0.9, M_GOLD));
      P.push(sph(at(9), [1.9, 0.55, 7.6], M_STEEL, aim(d)));
      break;
    case 'axe': {
      P.push(cap(at(-4), at(11), 0.85, M_DWOOD));
      const M = aim(d, opt.flat || [0, 1, 0]);
      const bm = f ? M_DSTEEL : M_STEEL;
      // Vale forges steel; the Warband knaps volcanic glass whose edge still glows
      const head = f ? mat('obsid', 0, 3, { spec: 0.45, shin: 16, tex: (lp) => (lp[0] * lp[0] / 30 + lp[2] * lp[2] / 17 > 0.7 ? { ramp: 'fire', abs: 0.85 } : 0) }) : mat('steel', 0, 9, { spec: 0.5, tex: (lp) => (lp[0] * lp[0] / 21 + lp[2] * lp[2] / 12 > 0.62 ? 0.28 : -0.12) });
      P.push(sph(at(9.6), f ? [5.6, 0.8, 4.2] : [4.6, 0.75, 3.5], head, M));
      P.push(sph(at(9.6), [1.5, 1.2, 2.2], bm, M), sph(at(11.6), 0.9, M_BONE));
      break;
    }
    case 'pick': {
      P.push(cap(at(-3), at(9), 0.8, M_WOOD));
      const M = aim(d, opt.flat || [0, 1, 0]);
      const a = add(at(9), scl([M[0], M[3], M[6]], 4.6)), b = add(at(9), scl([M[0], M[3], M[6]], -4.6));
      P.push(cap(at(9.2), add(a, scl(d, -1.6)), 0.8, M_STEEL), cap(at(9.2), add(b, scl(d, -1.6)), 0.8, M_STEEL), sph(at(9.2), 1.2, M_STEEL));
      break;
    }
    case 'hatchet': {
      P.push(cap(at(-3), at(8.5), 0.8, M_WOOD));
      const M = aim(d, opt.flat || [0, 1, 0]);
      P.push(sph(add(at(7.6), scl([M[0], M[3], M[6]], 2.2)), [2.9, 0.7, 2.3], M_STEEL, M));
      break;
    }
    case 'spear':
      P.push(cap(at(-13), at(15), 0.75, M_WOOD), sph(at(17.8), [1.6, 0.8, 3.8], M_OBSID, aim(d)), sph(at(14.8), 1.0, M_EMBER), cap(at(13.6), at(14.6), 1.1, M_TEAM));
      break;
    case 'lance':
      P.push(cap(at(-9), at(22), 0.8, M_WOOD), sph(at(24.5), [1.1, 1.1, 3.2], M_STEEL, aim(d)), fru(at(0.5), 2.3, 0.9, 3, M_STEEL, aim(d)));
      // pennant
      P.push(box(add(at(19), [0, 0, -1.8]), [0.4, 2.6, 1.6], M_TEAM, aim([0, 0, 1], d)));
      break;
  }
  return P;
}

// Builds a humanoid. Returns prims.
function humanoid(look, f, frame, carry) {
  const P = [], b = look.bulk || 0, sk = skinM(f), sn = f ? 'gskin' : 'skin';
  const wp = walkPose(frame), mount = look.mounted || 0;
  const z0 = mount + wp.bob * 0.8 * (mount ? 0 : 1);
  const atk = frame.startsWith('atk') ? +frame[3] : -1;
  const lean = atk === 1 ? 1.6 : atk === 2 ? 2.2 : atk === 0 ? -0.8 : (f ? 1 : 0); // forward lean of the chest
  const hipW = 2.7 + b * 0.5, shW = 6.6 + b * 1.5;
  const pants = f ? mat('char', 1, 5) : (look.torso === 'plate' ? M_DSTEEL : mat('leather', 1, 5));
  const boot = f ? mat('leather', 0, 3) : (look.torso === 'plate' ? M_STEEL : mat('leather', 0, 4));
  // legs
  for (const sgn of [-1, 1]) {
    const s = wp.s * -sgn, lift = sgn < 0 ? wp.liftR : wp.liftL; // right leg is at -x
    let H, K, F;
    if (mount) { H = [sgn * hipW, -0.5, 12 + mount]; K = [sgn * (5.2 + b * 0.5), 3.2, 9.5 + mount]; F = [sgn * (5.6 + b * 0.5), 1.2, 3.6 + mount]; }
    else { H = [sgn * hipW, 0, 11.5 + z0 * 0.5]; F = [sgn * (hipW + 0.2), s * 4.6, 1.9 + lift + (s < -0.5 ? 0.8 : 0)]; K = add(lerp3(H, F, 0.5), [0, 1.3 + lift * 0.9, 0]); }
    P.push(cap(H, K, 2.5 + b * 0.35, pants), cap(K, F, 2.1 + b * 0.3, mount ? boot : pants));
    P.push(sph(add(F, [0, 1.3, -0.3]), [2.4 + b * 0.2, 3.3, 1.9], boot));
  }
  // torso
  const tz = 17.6 + z0, tc = [0, lean * 0.45, tz];
  P.push(sph(tc, [5.5 + b * 1.3, 3.9 + b * 0.7, 6.3], torsoMat(look, f)));
  if (f && !mount) P.push(box([0, 3.6 + b * 0.4, 9.6 + z0], [2.2, 0.6, 3], M_TEAM)); // war-cloth
  if (f) P.push(sph([0, lean * 0.45, 12.6 + z0], [5.2 + b, 3.8 + b * 0.6, 2.6], mat('leather', 0, 5, { tex: (lp) => Math.abs(lp[0]) < 1.3 && lp[1] > 0 ? { ramp: 'bone', d: 0.1 } : 0 })));
  if (look.quiver) { P.push(cap([3, -3.6, 15 + z0], [5.2, -4.4, 24.5 + z0], 1.7, M_DLEATHER)); for (const k of [-1, 0, 1]) P.push(cap([5.2 + k, -4.4, 24.5 + z0], [5.6 + k * 1.3, -4.6, 27.5 + z0], 0.55, k ? M_CLOTH : M_TEAM)); }
  // head
  const hc = [0, 0.7 + lean * 0.9 + (f ? 1.6 : 0), 27.2 + z0 - (f ? 1.3 : 0)];
  const hr = look.head === 'helm' || look.head === 'greathelm' || look.head === 'hood' ? 5.2 : 4.8; // big heads read at this size
  const headBase = look.head === 'helm' || look.head === 'greathelm' ? mat('steel', 0, 8, { spec: 0.45, shin: 9 }) : mat(sn, 1, 7);
  P.push(sph(hc, hr, Object.assign({}, headBase, { tex: headTex(look, f) })));
  if (f) { // jaw, tusks, ears
    P.push(sph(add(hc, [0, 2.3, -2.5]), [3.3, 2.6, 2.1], sk));
    for (const s of [-1, 1]) { P.push(cap(add(hc, [s * 2.1, 4.2, -2.4]), add(hc, [s * 2.4, 4.6, -0.6]), 0.62, M_BONE)); P.push(sph(add(hc, [s * 4.6, 0.2, 0.6]), [1.9, 0.8, 1.2], sk, rot(0, 0, s * -25))); }
  } else if (look.head !== 'greathelm' && look.head !== 'helm') P.push(sph(add(hc, [0, 4.1, -0.9]), 0.9, sk)); // nose
  switch (look.head) {
    case 'cap': P.push(fru(add(hc, [0, 0, 1.7]), 6.8, 6.2, 0.9, mat('straw', 1, 7, { tex: TEX.streaks(0.2) })), fru(add(hc, [0, 0, 2.6]), 3.9, 2.6, 2.6, mat('straw', 2, 7))); break;
    case 'helm': // kettle helm with a brass brim and a tall plume that trails behind
      P.push(fru(add(hc, [0, 0, 1.4]), 6.4, 5.6, 0.9, M_BRASS), fru(add(hc, [0, 0, 4.6]), 1.1, 0.7, 1.6, M_BRASS));
      P.push(sph(add(hc, [0, -0.8, 8.4]), [1.3, 1.9, 3.4], M_TEAM), sph(add(hc, [0, -3, 8.2]), [1.2, 2, 2.6], M_TEAM), sph(add(hc, [0, -5, 6.4]), [1.1, 1.8, 2.2], M_TEAM), sph(add(hc, [0, -6.4, 4]), [0.9, 1.4, 1.9], M_TEAM));
      break;
    case 'greathelm': // winged helm
      P.push(fru(add(hc, [0, 0, 4]), 1.4, 0.4, 3.4, M_BRASS), sph(add(hc, [0, 0.4, 0.9]), [5.5, 5.4, 0.9], M_BRASS));
      for (const k of [-1, 1]) P.push(sph(add(hc, [k * 5.6, -1.2, 5.2]), [0.9, 2.4, 4.6], M_TEAM, rot(0, 0, k * 28)), sph(add(hc, [k * 6.6, -2.6, 4]), [0.7, 2, 3.4], M_BRASS, rot(0, 0, k * 40)));
      break;
    case 'hood': // long-tailed hood with a pheasant feather
      P.push(fru(add(hc, [0, -1, 3.4]), 3.6, 0.6, 5.4, mat('team', 0, 6), rot(0, -52, 0)), cap(add(hc, [0, -5.4, 6.2]), add(hc, [0, -7.6, 1.6]), 1.1, mat('team', 0, 5)), sph(add(hc, [0, -7.8, 0.6]), 1.3, M_BRASS));
      P.push(cap(add(hc, [3.4, 0.6, 3]), add(hc, [5.6, -3, 9.6]), 0.6, mat('autumn', 3, 7)));
      break;
    case 'horn': // sweeping ram horns
      for (const s of [-1, 1]) { P.push(cap(add(hc, [s * 3.6, -0.6, 2.6]), add(hc, [s * 7.4, -1.6, 4.6]), 1.6, M_BONE), cap(add(hc, [s * 7.4, -1.6, 4.6]), add(hc, [s * 9.2, 0.6, 2]), 1.25, M_BONE), cap(add(hc, [s * 9.2, 0.6, 2]), add(hc, [s * 8.2, 3, 0.2]), 0.8, M_BONE)); }
      break;
    case 'skull': P.push(sph(add(hc, [0, -0.2, 2.2]), [3.9, 4.2, 2.9], mat('bone', 1, 5, { tex: (lp) => lp[1] > 2 && lp[2] < 0.6 && Math.abs(lp[0]) > 0.7 && Math.abs(lp[0]) < 2.7 ? { ramp: 'gray', abs: 0 } : 0 }))); for (const s of [-1, 1]) P.push(cap(add(hc, [s * 3.2, 0, 3.2]), add(hc, [s * 5.4, -1, 6.8]), 0.8, M_BONE)); break;
    case 'mohawk': // a crest of stiffened hair like a flame
      for (let k = 0; k < 6; k++) P.push(fru(add(hc, [0, 3 - k * 1.5, 3.4]), 1.3, 0, 4.2 + (k === 1 || k === 2 ? 2.6 : k === 3 ? 1.4 : 0), k % 2 ? M_TEAM : mat('team', 3, 7), rot(0, -14 - k * 5, 0)));
      break;
    case 'bald': // a drudge's topknot bound in team cloth, and stubby horn buds
      P.push(sph(add(hc, [0, -1.6, 4.6]), [1.5, 1.7, 2.4], M_BLACK), fru(add(hc, [0, -1.6, 3.6]), 1.7, 1.5, 1.2, M_TEAM));
      for (const s of [-1, 1]) P.push(fru(add(hc, [s * 3.2, 0.8, 3]), 1, 0, 2.4, M_BONE, rot(0, 0, s * -30)));
      break;
  }
  // arms. right arm = -x (weapon), left arm = +x (shield / bow)
  const shz = 21.6 + z0, RS = [-shW, lean * 0.6, shz], LS = [shW, lean * 0.6, shz];
  const sleeve = look.torso === 'plate' ? M_STEEL : look.torso === 'tunic' ? mat('team', 0, 6) : look.torso === 'jerkin' ? mat('team', 0, 6) : sk;
  const armR = 2.0 + b * 0.5;
  let RE, RH, LE, LH, wd = null, wopt = {};
  const sw = mount ? 0 : wp.s;
  // defaults: relaxed, swinging with the walk
  RE = add(RS, [-1.0, sw * 1.6, -5]); RH = add(RE, [0.4, 1.6 + sw * 2.6, -4.6]);
  LE = add(LS, [1.0, -sw * 1.6, -5]); LH = add(LE, [-0.4, 1.6 - sw * 2.6, -4.6]);
  let W = look.weapon;
  if (carry) W = null; else if (look.weaponOverride) W = look.weaponOverride;
  if (W === 'sword' || W === 'axe' || W === 'pick' || W === 'hatchet') {
    const heavy = W !== 'sword';
    if (atk === 0) { RE = add(RS, [-2, -1.5, 3.5]); RH = add(RE, [0.6, -1.4, 4.6]); wd = norm([-0.15, -0.55, 0.8]); }
    else if (atk === 1) { RE = add(RS, [-0.6, 4, 0.2]); RH = add(RE, [1.6, 4.6, 0.4]); wd = norm([0.25, 0.85, 0.45]); }
    else if (atk === 2) { RE = add(RS, [-0.2, 3.4, -3.4]); RH = add(RE, [1.8, 4.2, -3]); wd = norm([0.3, 0.85, -0.42]); }
    else { RE = add(RS, [-1.4, 0.8 + sw * 1.2, -4.8]); RH = add(RE, [-0.2, 3.4 + sw * 1.6, -2.2]); wd = norm(heavy ? [-0.25, 0.25, 0.94] : [-0.2, 0.45, 0.87]); }
    wopt.flat = atk >= 0 ? [1, 0, 0] : [0, 1, 0.2];
  } else if (W === 'spear') {
    if (atk === 0) { RE = add(RS, [-1.6, -2.4, 2.6]); RH = add(RE, [0.2, -2.6, 3.4]); wd = norm([0.05, 1, 0.12]); }
    else if (atk === 1 || atk === 2) { RE = add(RS, [0, 4.2, 0.6]); RH = add(RE, [1.2, 4.4, -1.2 * atk]); W = null; LE = add(LS, [1.6, -2, -4]); LH = add(LE, [0.5, -2, -3]); }
    else { RE = add(RS, [-1.6, 1.2, -4.4]); RH = add(RE, [-0.6, 3, -1.6]); wd = norm([-0.06, 0.1, 1]); }
  } else if (W === 'lance') {
    if (atk === 1) { RE = add(RS, [-0.8, 3.6, -3]); RH = add(RE, [0.6, 5, -0.6]); wd = norm([0.1, 1, -0.02]); }
    else if (atk === 0 || atk === 2) { RE = add(RS, [-1.2, -1, -4.4]); RH = add(RE, [0.4, 3.4, -1.2]); wd = norm([0.08, 1, 0.06]); }
    else { RE = add(RS, [-1.2, 0.6, -4.6]); RH = add(RE, [0, 3.2, -1.6]); wd = norm([-0.1, 0.42, 0.9]); }
  } else if (W === 'bow') {
    const draw = atk === 0;
    if (atk >= 0) { LE = add(LS, [-0.6, 4.4, -0.6]); LH = add(LE, [-1.6, 5, 0.4]); RE = add(RS, [-0.8, draw ? -1.2 : 2.6, -1.2]); RH = draw ? [-1.6, 1.6 + lean, shz - 0.4] : add(RE, [2, 3.6, -0.6]); }
    else { LE = add(LS, [1.2, 1.2 - sw * 1.2, -4.8]); LH = add(LE, [-0.4, 3.6 - sw * 1.6, -2.2]); }
    // the bow itself (left hand)
    const up = atk >= 0 ? [0, 0, 1] : norm([0.25, 0.25, 0.93]), fw = atk >= 0 ? [0, 1, 0] : norm([0, 0.95, -0.25]);
    const pts = []; for (let k = -3; k <= 3; k++) pts.push(add(LH, add(scl(up, k * 2.9), scl(fw, 0.8 - (k * k) * 0.36))));
    for (let k = 0; k < 6; k++) P.push(cap(pts[k], pts[k + 1], 0.8, k === 2 || k === 3 ? M_DLEATHER : M_WOOD));
    const nock = draw ? RH : add(LH, scl(fw, -2.4));
    P.push(cap(pts[0], nock, 0.4, M_STRING), cap(nock, pts[6], 0.4, M_STRING));
    if (draw) P.push(cap(RH, add(LH, [0, 4.5, 0]), 0.5, M_WOOD), sph(add(LH, [0, 5.2, 0]), 0.85, M_STEEL));
  }
  if (carry === 'gold') {
    RE = add(RS, [-0.6, 3, -3.8]); RH = [-3.2, 6.2 + lean, 15.6 + z0]; LE = add(LS, [0.6, 3, -3.8]); LH = [3.2, 6.2 + lean, 15.6 + z0];
    P.push(sph([0, 6.4 + lean, 16.6 + z0], [3.9, 3.3, 3.9], mat('cloth', 0, 5, { tex: (lp) => lp[2] > 1.9 ? { ramp: 'gold', lo: 3, hi: 7, d: 0.25 + (hash2(lp[0] * 3, lp[1] * 3) - 0.5) * 0.5 } : (hash2(lp[0] * 2, lp[2] * 2) - 0.5) * 0.1 })));
    P.push(sph([0, 6.4 + lean, 20.2 + z0], [2.6, 2.3, 1.2], mat('gold', 3, 7, { spec: 0.6, tex: (lp) => (hash2(lp[0] * 3, lp[1] * 3) - 0.5) * 0.5 })));
  } else if (carry === 'wood') {
    RE = add(RS, [-1.2, 2, 1.6]); RH = add(RE, [1, 1.4, 3.4]);
    const lg = mat('wood', 2, 8, { tex: (lp) => (hash2(Math.floor(lp[0] * 1.5), Math.floor(lp[2] * 1.5)) - 0.5) * 0.18 });
    for (const [ox, oz] of [[-7.2, 26.4], [-4.4, 27.4], [-5.9, 29.6]]) { P.push(cap([ox, -7.5, oz + z0 - 0.5], [ox, 8.5, oz + z0 + 0.8], 1.7, lg)); P.push(sph([ox, 9.6, oz + z0 + 0.9], [1.5, 0.8, 1.5], mat('wood', 6, 9))); }
  }
  P.push(cap(RS, RE, armR, sleeve), cap(RE, RH, armR - 0.25, f || look.torso !== 'plate' ? sk : M_DSTEEL), sph(RH, 2.05, look.torso === 'plate' ? M_DLEATHER : sk));
  P.push(cap(LS, LE, armR, sleeve), cap(LE, LH, armR - 0.25, f || look.torso !== 'plate' ? sk : M_DSTEEL), sph(LH, 2.05, look.torso === 'plate' ? M_DLEATHER : sk));
  if (look.pauldron) {
    if (f) { P.push(sph(add(RS, [-0.4, 0, 1.2]), [3.6, 3.3, 2.9], M_TEAM)); P.push(fru(add(RS, [-0.8, 0, 3]), 1.6, 0, 5.4, M_OBSID, rot(0, 0, -25))); P.push(sph(add(LS, [0.4, 0, 0.8]), [3.2, 3, 2.5], M_DLEATHER)); }
    else for (const S of [RS, LS]) P.push(sph(add(S, [0, 0, 1.1]), [3.6, 3.4, 2.8], M_BRASS));
  }
  if (wd && W) P.push(...weaponPrims(W, RH, wd, f, wopt));
  if (look.shield && !carry) {
    const sc = add(LH, [1.8, 1.2, 1.8]), M = rot(mount ? -62 : -38, 4, 0);
    P.push(sph(sc, [6, 1.3, 6.2], mat('team', 1, 7, { spec: 0.2, tex: (lp) => {
      const r = lp[0] * lp[0] / 27 + lp[2] * lp[2] / 41;
      if (r > 0.72) return { ramp: 'gold', d: 0.1 };
      const q = lp[0] * lp[0] + lp[2] * lp[2];
      if (q < 3.4) return { ramp: 'gold', d: 0.3 };
      if (q < 17 && Math.abs(Math.sin(Math.atan2(lp[2], lp[0]) * 4)) > 0.72) return { ramp: 'gold', d: 0.1 }; // the rising sun of Vale
      return 0;
    } }), M));
  }
  return P;
}

function horse(frame, f) {
  const P = [], wp = walkPose(frame), s = wp.s, bob = wp.bob * 0.6;
  const coat = mat('cloth', 1, 5, { tex: (lp) => (hash2(lp[0] * 0.5, lp[1] * 0.5 + lp[2] * 0.4) > 0.62 ? -0.16 : 0) }); // Vale greys, dappled
  const dark = mat('slate', 0, 4);
  const z = 14.5 + bob;
  P.push(sph([0, -1, z], [4.7, 9.6, 5.1], coat), sph([0, 6.6, z + 0.6], [4.6, 4.8, 5.5], coat), sph([0, -7.6, z + 0.4], [4.9, 4.6, 5.2], coat));
  const nb = [0, 9, z + 3], nt = [0, 13.2, z + 9.6];
  P.push(cap(nb, nt, 2.9, coat), cap(add(nb, [0, -2.6, 2.4]), add(nt, [0, -2.2, 1.6]), 1.5, dark)); // neck + mane
  const hd = rot(0, -34, 0);
  P.push(sph([0, 15.6, z + 9.4], [2.4, 4.9, 2.7], coat, hd), sph([0, 18.2, z + 7.4], [1.9, 2.2, 1.9], mat('cloth', 0, 3), hd), sph([0, 15.2, z + 11], [1.7, 3.2, 1.2], M_BRASS, hd), fru([0, 13.6, z + 12.4], 0.8, 0, 3.4, M_TEAM));
  for (const k of [-1, 1]) P.push(fru([k * 1.5, 13, z + 11.6], 0.95, 0, 2.4, coat), sph([k * 2.1, 15.9, z + 10.2], 0.62, mat('gray', 0, 1)));
  P.push(cap([0, -11.6, z + 2], [0, -14.6, z - 4.5], 1.6, dark), cap([0, -14.6, z - 4.5], [0, -14.2, z - 9], 1.2, dark)); // tail
  // legs: diagonal pairs move together
  for (const [x, y, ph] of [[-3, 6.6, 1], [3, 6.6, -1], [-3.2, -7.4, -1], [3.2, -7.4, 1]]) {
    const sw = s * ph, H = [x, y, 11.5 + bob], F = [x, y + sw * 4.4, 1.7 + (sw > 0.5 ? 1.4 : 0)], K = add(lerp3(H, F, 0.5), [0, y > 0 ? 0.8 : -1.2, 0]);
    P.push(cap(H, K, 2.0, coat), cap(K, F, 1.45, coat), sph(add(F, [0, 0.4, -0.4]), [1.7, 2, 1.4], dark));
  }
  // caparison
  P.push(sph([0, -1.5, z + 0.5], [5.3, 6.4, 5.2], mat('team', 0, 7, { tex: (lp) => (lp[2] < -2.6 ? { ramp: 'gold', d: 0.05 } : (Math.abs(lp[1]) > 4.6 ? -0.15 : 0)) })));
  P.push(sph([0, 8.2, z + 0.2], [4.9, 2.2, 5.2], mat('team', 0, 6)));
  P.push(cap([0, 16.5, z + 8.6], [-3.5, 3, z + 7], 0.35, M_DLEATHER)); // rein
  return P;
}

function wolf(frame) {
  const P = [], wp = walkPose(frame), s = wp.s, bob = wp.bob * 0.7;
  const fur = mat('fur', 1, 7, { tex: (lp) => (hash2(lp[0] * 2.2, lp[1] * 1.2 + lp[2] * 2) - 0.5) * 0.3 });
  const dfur = mat('fur', 0, 4, { tex: (lp) => (hash2(lp[0] * 2.2, lp[1] * 1.2 + lp[2] * 2) - 0.5) * 0.3 });
  const z = 11 + bob;
  P.push(sph([0, -3, z], [4.5, 8.6, 4.4], fur), sph([0, 5, z + 1.6], [5.4, 5.6, 5.6], fur), sph([0, 5, z + 4.6], [3.6, 5.2, 3.2], dfur));
  P.push(cap([0, 8, z + 2], [0, 12, z + 2.8], 3.3, fur));
  P.push(sph([0, 13.6, z + 3], [3.6, 3.9, 3.3], fur), sph([0, 17.4, z + 1.8], [2.1, 3.3, 1.8], mat('fur', 2, 7)), sph([0, 17.2, z + 0.2], [1.8, 2.8, 1], dfur), sph([0, 20.2, z + 2.2], 0.9, M_BLACK));
  for (const k of [-1, 1]) { P.push(fru([k * 2.3, 11.8, z + 5.2], 1.4, 0, 3.4, dfur, rot(0, -12, k * 14))); P.push(sph([k * 1.9, 16, z + 3.6], 0.72, mat('fire', 4, 7, { glow: 0.9 }))); P.push(cap([k * 1.3, 18.8, z + 0.6], [k * 1.3, 19, z - 1], 0.42, M_BONE)); }
  P.push(cap([0, -11, z + 1], [0, -15.5, z + 3.2], 2.1, fur), sph([0, -17.4, z + 4], [1.6, 2.6, 1.7], dfur));
  for (const [x, y, ph] of [[-3.3, 6.4, 1], [3.3, 6.4, -1], [-3.2, -8, -1], [3.2, -8, 1]]) {
    const sw = s * ph, H = [x, y, 9 + bob], F = [x, y + sw * 4.6, 1.6 + (sw > 0.5 ? 1.3 : 0)], K = add(lerp3(H, F, 0.5), [0, y > 0 ? 0.6 : -1.8, 0]);
    P.push(cap(H, K, 2.1, fur), cap(K, F, 1.5, fur), sph(add(F, [0, 1, -0.4]), [1.8, 2.4, 1.3], dfur));
  }
  P.push(sph([0, -2.4, z + 1.2], [4.9, 4.6, 4.2], mat('team', 0, 6, { tex: (lp) => lp[2] < -1.6 ? { ramp: 'bone', d: 0 } : 0 })));
  return P;
}

function siege(frame, f) {
  const P = [], atk = frame.startsWith('atk') ? +frame[3] : -1, wi = frame.startsWith('walk') ? +frame[4] : 0;
  const wood = f ? mat('char', 1, 5, { tex: TEX.boards(3) }) : mat('wood', 2, 8, { tex: TEX.boards(3) });
  const beam = f ? mat('char', 1, 5) : mat('wood', 2, 7);
  const iron = f ? M_BONE : M_BRASS;
  P.push(slab([0, 0, 4.6], [6.4, 12, 1.5], wood));
  P.push(slab([0, 9.5, 7.6], [6.4, 1.2, 1.2], beam), slab([0, -9.5, 7.6], [6.4, 1.2, 1.2], beam));
  const wm = mat(f ? 'leather' : 'wood', 1, 7, { tex: (lp) => {
    const r = Math.hypot(lp[0], lp[1]); if (r > 3.9) return { ramp: f ? 'bone' : 'steel', lo: 0, hi: 5 }; if (r < 1.4) return { ramp: 'steel', lo: 1, hi: 6 };
    const a = Math.atan2(lp[1], lp[0]) + wi * 0.4; return Math.abs(Math.sin(a * 3)) < 0.42 ? 0.12 : -0.3;
  } });
  for (const y of [-7.6, 7.6]) { P.push(fru([6.5, y, 5.2], 5.2, 5.2, 2.2, wm, rot(0, 0, 90))); P.push(fru([-6.5, y, 5.2], 5.2, 5.2, 2.2, wm, rot(0, 0, -90))); }
  // A-frame and crossbar
  for (const s of [-1, 1]) { P.push(cap([s * 5.2, -5, 7.6], [s * 4.6, 1.5, 19.5], 1.25, beam), cap([s * 5.2, 7, 7.6], [s * 4.6, 1.5, 19.5], 1.15, beam)); }
  P.push(cap([-5.4, 1.5, 19.5], [5.4, 1.5, 19.5], 1.55, f ? M_DLEATHER : M_LEATHER));
  P.push(cap([-5, -2, 8.6], [5, -2, 8.6], 1.5, mat('cloth', 0, 4))); // rope skein
  // throwing arm
  const piv = [0, -2, 8.8];
  const dir = atk === 1 ? norm([0, 0.2, 0.98]) : atk === 2 ? norm([0, 0.1, 0.99]) : norm([0, -0.86, 0.5]);
  const tip = add(piv, scl(dir, 17));
  P.push(cap(piv, tip, 1.2, beam), sph(tip, [3, 3, 1.6], iron, aim(add(scl(dir, 0.2), atk >= 1 ? [0, 1, 0] : [0, 0.4, 1]))));
  if (atk < 1) P.push(sph(add(tip, [0, 0.4, 2.2]), 2.5, f ? mat('char', 1, 5, { tex: (lp) => (hash2(lp[0] * 2, lp[1] * 2 + lp[2]) > 0.6 ? { ramp: 'fire', abs: 0.85 } : 0) }) : mat('rock', 2, 8, { tex: TEX.noise(0.3, 1.5) })));
  // team colours
  P.push(slab([0, 12.2, 5.2], [4.6, 0.5, 2.1], M_TEAM), slab([0, -12.2, 5.2], [4.6, 0.5, 2.1], M_TEAM));
  if (f) { for (const x of [-4.5, -1.5, 1.5, 4.5]) P.push(fru([x, 12.4, 6.2], 1, 0, 4.4, M_BONE, rot(0, 62, 0))); P.push(sph([0, 1.5, 21.6], [2.1, 2, 2.2], M_BONE)); }
  else { P.push(cap([5.6, -11, 8], [5.6, -11, 22], 0.55, M_DWOOD), box([5.6, -8.6, 19.6], [0.4, 2.4, 1.9], M_TEAM)); }
  return P;
}

// Returns {prims, w, h, ox, oy} for a unit frame.
export function unitModel(type, faction, frame, carry, chopping) {
  let P;
  if (type === 'siege') P = siege(frame, faction);
  else if (type === 'knight') {
    const look = LOOKS.knight[faction];
    P = (faction ? wolf(frame) : horse(frame, faction)).concat(xform(humanoid(look, faction, frame.startsWith('walk') ? 'idle' : frame, null), ID, [0, -1.5, frame.startsWith('walk') ? walkPose(frame).bob * 0.6 : 0]));
  } else {
    const look = { ...LOOKS[type][faction] };
    if (type === 'worker' && chopping) look.weaponOverride = 'hatchet';
    P = humanoid(look, faction, frame, carry);
  }
  return P;
}

// lying body for corpses
export function corpseModel(type, faction) {
  if (type === 'siege') {
    const wood = faction ? mat('leather', 0, 5) : mat('wood', 1, 6);
    return [cap([-9, -3, 1.5], [8, 2, 2], 1.4, wood), cap([-4, 5, 1.5], [6, -6, 4], 1.3, wood), cap([2, 6, 1.2], [9, 4, 1.6], 1.2, wood), fru([-6, -6, 0], 4.6, 4.6, 1.8, mat('wood', 0, 5)), sph([5, -1, 2], 2.4, M_ROCK)];
  }
  const look = { ...LOOKS[type === 'knight' ? 'soldier' : type][faction], shield: false, weapon: null, mounted: 0 };
  let P = xform(humanoid(look, faction, 'idle', null), rot(72, -84, 0), [-4, -3, 4.5]);
  if (type === 'knight') P = P.concat(xform(faction ? wolf('idle') : horse('idle', 0), rot(-20, 0, 82), [5, 2, 5]));
  return P;
}
export const UNIT_VIEW = { w: 72, h: 72, ox: 36, oy: 52 };
