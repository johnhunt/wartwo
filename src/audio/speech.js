// Unit and narrator speech. Uses the browser's built-in voices (Web Speech API),
// giving every unit type its own voice, pitch and pace. If no voices are available
// (or the player chooses "retro"), lines are spoken as crunchy formant-synth
// babble in the style of early sound cards and shown as subtitles.
import { ac, ctx, bus, settings } from './core.js';
import { babble } from './voice.js';

// --------------------------------------------------------------------------- script
const K = 0, W = 1; // factions: Kingdom of Vale, Ashen Warband
export const LINES = {
  [K]: {
    worker: {
      select: ['Aye?', 'What needs doing?', "At your service, m'lord.", 'Yes, master?', 'Ready for an honest day\'s toil.', 'Hm? Oh, it\'s you.'],
      ack: ['Right away.', 'Aye, aye.', "I'll see to it.", 'As you wish.', 'Off I go, then.', 'Consider it done.'],
      work: ['Back to the grindstone.', "Another day, another copper.", 'Mind your fingers, mind your toes.', 'Hard work never hurt nobody. Much.'],
      build: ["I'll have it up in no time.", 'Hammer and nails, coming up.', 'One fine building, on its way.'],
      attack: ['I\'m no soldier, but alright!', 'Have at ye, with me pitchfork!'],
      ready: ['Ready to work, my lord.', 'Where do you need me?'],
      done: ["That's that built, m'lord!", 'All finished!', 'Another fine job, if I say so meself.'],
      annoyed: ["I've got work to be doing, you know.", 'Stop poking me!', 'Me back is killing me as it is.', "Click me once more and I'm joining the Warband.", 'Do I look like I\'ve nothing better to do?', "I've a wife and six children, and none of them poke me this much!"],
    },
    soldier: {
      select: ['Sir!', 'Awaiting orders.', 'My blade is yours.', 'Ready, sir!', 'Steel and courage, sir.'],
      ack: ['At once!', 'Forward!', 'By your command.', 'Moving out!', 'Understood, sir!'],
      attack: ['For Vale!', 'Have at them!', 'To arms!', 'Charge!', 'No quarter!'],
      ready: ['Sword and shield, ready!', 'Reporting for duty, sir!'],
      annoyed: ['This armour chafes, you know.', 'I only joined for the free soup.', 'Sir, with respect, is this a drill?', "Poke me again and I'll report you to the sergeant."],
    },
    archer: {
      select: ['Yes?', 'Arrows nocked.', 'Eyes on the horizon.', 'Ready.', 'Speak, my lord.'],
      ack: ['On my way.', 'Understood.', 'Swift as the wind.', 'Moving.', 'I go.'],
      attack: ['Loose!', 'Target sighted!', 'Fire at will!', "They won't see it coming."],
      ready: ['Bow strung and ready.', 'Archer, ready to serve.'],
      annoyed: ['I could shoot an apple off your head from here.', 'Careful. My aim wavers when I am vexed.', 'Find someone else to pester.', 'I am counting my arrows. One for each poke.'],
    },
    knight: {
      select: ['My liege?', 'For honour!', 'My steed is ready.', 'Command me.', 'Your champion awaits.'],
      ack: ['Onward!', 'As you command.', 'Ride!', 'With haste!', 'It shall be done.'],
      attack: ['For the King!', 'Lances down!', 'Ride them down!', 'For glory!'],
      ready: ['Lancer, reporting for duty.', 'My lance is yours, my liege.'],
      annoyed: ['A knight does not care to be prodded.', 'My horse grows impatient with you.', 'I polished this armour for three hours.', 'Is there a dragon, or are you merely bored?'],
    },
    siege: {
      select: ['Engine ready!', 'Loaded and waiting.', 'Point us at something big.', 'Mangonel crew here!'],
      ack: ['Heave!', 'Rolling out.', 'Mind the wheels!', 'Push, lads, push!'],
      attack: ['Fire the engine!', 'Let fly!', 'Bring down the walls!', 'Stone away!'],
      ready: ['Siege engine assembled!', 'Mangonel ready to roll!'],
      annoyed: ['Do you know how heavy this thing is?', 'One more poke and we load YOU into it.', 'Careful, it bites.'],
    },
    narrator: {
      attacked: ['We are under attack, my lord!', 'Our people are under attack!', 'The enemy is upon us!'],
      gold: ['Not enough gold, my lord.', 'Our treasury is too thin. Mine more gold.'],
      wood: ['We need more lumber.', 'Not enough lumber, my lord.'],
      food: ['We need more farms to feed our people.', 'Our granaries are empty. Build more farms.'],
      built: ['Construction complete.'],
      cantBuild: ['We cannot build there.'],
      requires: ['We lack the buildings required.'],
      mine: ['A gold mine has run dry.'],
      noTrees: ['There are no trees nearby.'],
      fallen: ['An enemy has been vanquished!'],
      victory: ['Victory is ours! The realm rejoices!'],
      defeat: ['We have been defeated. Vale has fallen.'],
      welcome: ['The realm awaits your command, my lord.'],
    },
  },
  [W]: {
    worker: {
      select: ['Hrrm?', 'What now?', 'Drudge here.', 'Yes, boss?', 'Grrh. More work?', 'Drudge listening.'],
      ack: ['Fine.', 'Drudge go.', 'Okay, okay.', 'Yes, boss.', 'Hrrm. On it.', 'If boss say so.'],
      work: ['Dig, dig, dig.', 'Chop, chop. Drudge hate chop.', 'Work never end.'],
      build: ['Drudge build good hut.', 'Stack wood. Bang nails.'],
      attack: ['Drudge fight? Okay.', 'Bonk them!'],
      ready: ['Drudge ready to work.', 'New drudge. Same work.'],
      done: ['Build is done!', 'Finished, boss!', 'Hut built. Drudge rest now?'],
      annoyed: ['Why boss poke?', 'Drudge tired. Go away.', 'Poke again, Drudge bite.', 'Drudge want nap!', 'Drudge quit. No. Drudge no allowed quit.'],
    },
    soldier: {
      select: ['Who to smash?', 'Brute ready!', 'Grrraah?', 'Speak!', 'Brute listen.'],
      ack: ['Smash later.', 'Going!', 'Hrr. Fine.', 'Brute obey.', 'Move. Yes.'],
      attack: ['Smash them!', 'Blood and ash!', 'Crush!', 'Break their bones!'],
      ready: ['Brute hungry for battle!', 'Brute ready to smash!'],
      annoyed: ['Brute not toy!', 'Stop it, or Brute smash you!', 'Rrrgh. Brute getting angry.', 'Brute count to ten. Brute only know three.'],
    },
    archer: {
      select: ['Spear ready.', 'Hunt?', 'Yes, chief?', 'I see far.'],
      ack: ['Hunting.', 'Tracking.', 'Me go quick.', 'Quiet like shadow.'],
      attack: ['Spear find heart!', 'Throw!', 'Pierce them!', 'Hunt them!'],
      ready: ['Spears sharp!', 'Thrower ready for hunt.'],
      annoyed: ['Next spear go in you.', 'You annoying, like fly.', 'I aim for flies. You next.'],
    },
    knight: {
      select: ['Wolf hungry.', 'Ride?', 'Teeth ready!', 'Hrr. Where to?'],
      ack: ['Run, wolf, run!', 'Fast as fang!', 'Rrrah, go!', 'We ride!'],
      attack: ['Feast, wolf!', 'Hunt them down!', 'Tear them apart!', 'Fresh meat!'],
      ready: ['Wolf rider ready to hunt!', 'Wolf and rider, ready!'],
      annoyed: ['Wolf will eat you.', 'Even wolf think you strange.', 'Wolf bite hand that poke.'],
    },
    siege: {
      select: ['Big rock ready.', 'Boulders!', 'Point and throw?', 'Hurler here.'],
      ack: ['Push! Push!', 'Rolling.', 'Heavy! Going.', 'Grunt. Push.'],
      attack: ['Throw big rock!', 'Smash walls!', 'Rocks fly!', 'Boom!'],
      ready: ['Rock hurler built!', 'Rocks loaded!'],
      annoyed: ['Rock hurler fall on you.', 'Why you bother us?', 'We throw you over wall.'],
    },
    narrator: {
      attacked: ['Enemies attack us!', 'Warband is under attack!', 'They come! To arms!'],
      gold: ['Need more gold!', 'Not enough gold, chieftain.'],
      wood: ['Need more wood!', 'Not enough lumber!'],
      food: ['Need more granaries!', 'Warband hungry. Build granary.'],
      built: ['Building done.'],
      cantBuild: ['Cannot build there!'],
      requires: ['Need other building first!'],
      mine: ['Gold mine is empty!'],
      noTrees: ['No trees here!'],
      fallen: ['Enemy crushed!'],
      victory: ['Victory! The land burns for the Warband!'],
      defeat: ['The Warband is broken.'],
      welcome: ['Warband awaits, chieftain.'],
    },
  },
};

// --------------------------------------------------------------------------- voice cast
// gender preference, Web Speech pitch/rate, and babble parameters (f0 Hz, formant size, rate, roughness)
const CAST = {
  [K]: {
    worker: { g: 'm', pitch: 1.15, rate: 1.05, b: [150, 1.0, 1.1, 0] },
    soldier: { g: 'm', pitch: 0.85, rate: 1.0, b: [120, 0.95, 1.0, 0.05] },
    archer: { g: 'f', pitch: 1.1, rate: 1.05, b: [230, 1.17, 1.1, 0] },
    knight: { g: 'm', pitch: 0.7, rate: 0.9, b: [100, 0.9, 0.85, 0.05] },
    siege: { g: 'm', pitch: 1.3, rate: 1.15, b: [170, 1.02, 1.25, 0] },
    narrator: { g: 'm', pitch: 0.95, rate: 0.92, b: [115, 0.95, 0.9, 0] },
  },
  [W]: {
    worker: { g: 'm', pitch: 0.55, rate: 0.95, b: [100, 0.84, 1.0, 0.35] },
    soldier: { g: 'm', pitch: 0.2, rate: 0.8, b: [72, 0.76, 0.85, 0.9] },
    archer: { g: 'f', pitch: 0.55, rate: 0.95, b: [165, 0.95, 1.0, 0.3] },
    knight: { g: 'm', pitch: 0.4, rate: 1.1, b: [92, 0.8, 1.15, 0.6] },
    siege: { g: 'm', pitch: 0.7, rate: 1.0, b: [105, 0.85, 1.0, 0.4] },
    narrator: { g: 'm', pitch: 0.1, rate: 0.78, b: [68, 0.72, 0.8, 1] },
  },
};

const FEMALE = /female|woman|zira|susan|hazel|samantha|victoria|karen|moira|tessa|fiona|serena|libby|sonia|jenny|aria|emma|ava|allison|kate|catherine|zoe|salli|joanna|kendra|kimberly|ivy|amy|olivia|natasha|clara|heera|veena|sara|linda|nicky|martha|shelley|sandy|flo|grandma|ellie|isla|lily/i;
const MALE = /male|man\b|david|mark|george|daniel|alex|fred|ryan|guy|james|thomas|oliver|arthur|brian|joey|justin|matthew|russell|lee|rishi|aaron|eddy|reed|ralph|rocko|grandpa|albert|bruce|junior|gordon/i;

let voices = { m: [], f: [], any: [] };
function loadVoices() {
  if (!('speechSynthesis' in window)) return;
  const all = speechSynthesis.getVoices().filter(v => /^en(-|_|$)/i.test(v.lang));
  const pref = (v) => (/^en-GB/i.test(v.lang) ? 0 : /^en-(IE|AU|NZ|ZA)/i.test(v.lang) ? 1 : 2) + (v.localService ? 0 : 0.5);
  all.sort((a, b) => pref(a) - pref(b) || a.name.localeCompare(b.name));
  voices = { m: all.filter(v => MALE.test(v.name) && !/female/i.test(v.name)), f: all.filter(v => FEMALE.test(v.name)), any: all };
}
if ('speechSynthesis' in window) { loadVoices(); speechSynthesis.addEventListener?.('voiceschanged', loadVoices); }

function hash(s) { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; }
function voiceFor(f, role) {
  const c = CAST[f][role]; const pool = (c.g === 'f' ? voices.f : voices.m).length ? (c.g === 'f' ? voices.f : voices.m) : voices.any;
  if (!pool.length) return null;
  // narrators get the first (best) voice, units spread over the remaining ones
  return role === 'narrator' ? pool[0] : pool[(hash(f + role) % pool.length)];
}
export function hasVoices() { return voices.any.length > 0; }

// --------------------------------------------------------------------------- output
let subtitle = null; // callback(text, role) for retro mode
export function onSubtitle(fn) { subtitle = fn; }
let busyUntil = 0, narratorUntil = 0;
let retroIn = null;
function retroBus() {
  if (retroIn) return retroIn;
  retroIn = ac.createGain();
  const crush = ac.createWaveShaper(); const n = 2048, cv = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; cv[i] = Math.round(x * 14) / 14; } // ~5-bit
  crush.curve = cv; const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3800;
  retroIn.connect(crush); crush.connect(lp); lp.connect(bus.speech);
  return retroIn;
}

const lastPick = {};
function choose(key, arr) { // avoid repeating the same line twice in a row
  let i = Math.floor(Math.random() * arr.length);
  if (arr.length > 1 && lastPick[key] === i) i = (i + 1) % arr.length;
  lastPick[key] = i; return arr[i];
}

function say(f, role, text, narrator) {
  if (settings.voiceMode === 'off' || !text) return;
  const now = performance.now();
  if (!narrator && now < narratorUntil) return; // never talk over the narrator
  const useWeb = settings.voiceMode === 'voices' && 'speechSynthesis' in window && hasVoices();
  const c = CAST[f][role];
  if (useWeb) {
    const u = new SpeechSynthesisUtterance(text);
    const v = voiceFor(f, role); if (v) { u.voice = v; u.lang = v.lang; }
    u.pitch = c.pitch; u.rate = c.rate; u.volume = Math.min(1, settings.speech * 1.1);
    speechSynthesis.cancel(); speechSynthesis.speak(u);
    const est = 400 + text.length * 70 / c.rate;
    busyUntil = now + est; if (narrator) narratorUntil = now + est;
  } else {
    const a = ctx(); if (!a) return;
    const [p, size, rate, rough] = c.b;
    const dur = babble(retroBus(), text, { pitch: p * (0.95 + Math.random() * 0.1), size, rate, rough }, a.currentTime + 0.02);
    busyUntil = now + dur * 1000; if (narrator) narratorUntil = now + dur * 1000;
    if (subtitle) subtitle(text, role);
  }
}

// --------------------------------------------------------------------------- game-facing API
const ROLE = (type) => (LINES[0][type] ? type : 'soldier');
let clickId = 0, clickN = 0, clickT = 0, annoyIdx = {};

// player selected a unit (id) of given type/faction
export function select(type, f, id) {
  const now = performance.now(), role = ROLE(type);
  if (id === clickId && now - clickT < 1500) clickN++; else clickN = 1;
  clickId = id; clickT = now;
  const L = LINES[f][role];
  if (clickN >= 4 && L.annoyed) {
    const k = f + role; const i = (annoyIdx[k] = ((annoyIdx[k] ?? -1) + 1)) % L.annoyed.length;
    say(f, role, L.annoyed[i]);
  } else say(f, role, choose(f + role + 's', L.select));
}
// player gave an order: kind = 'ack' | 'attack' | 'work' | 'build'
export function order(type, f, kind) {
  const role = ROLE(type), L = LINES[f][role];
  const arr = L[kind] || L.ack; say(f, role, choose(f + role + kind, arr));
}
export function unitLine(type, f, kind) { const role = ROLE(type), L = LINES[f][role]; if (L[kind]) say(f, role, choose(f + role + kind, L[kind])); }
let narrT = {};
export function narrate(f, key, minGapMs = 4000) {
  const now = performance.now(); if (narrT[key] && now - narrT[key] < minGapMs) return; narrT[key] = now;
  const arr = LINES[f].narrator[key]; if (arr) say(f, 'narrator', choose(f + 'n' + key, arr), true);
}
export function stopAll() { if ('speechSynthesis' in window) speechSynthesis.cancel(); }
export function preview(f) { say(f, 'narrator', LINES[f].narrator.welcome[0], true); }
