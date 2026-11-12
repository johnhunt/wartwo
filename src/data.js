// Game data. All times are in simulation ticks (20 ticks = 1 second).
export const TICK_MS = 50;
export const TPS = 1000 / TICK_MS;
export const TILE = 32;

export const FACTIONS = [
  { id: 0, name: 'Kingdom of Vale', short: 'Kingdom' },
  { id: 1, name: 'Ashen Warband', short: 'Warband' },
];

// Units. names[faction]
export const UNITS = {
  worker: {
    names: ['Serf', 'Drudge'], hp: 30, armor: 0, dmg: 3, pierce: 2, range: 1, sight: 4, speed: 10,
    cd: 24, gold: 400, wood: 0, time: 200, food: 1, from: 'hall', key: 'w', worker: true,
  },
  soldier: {
    names: ['Man-at-Arms', 'Brute'], hp: 60, armor: 2, dmg: 6, pierce: 3, range: 1, sight: 4, speed: 10,
    cd: 20, gold: 600, wood: 0, time: 260, food: 1, from: 'barracks', key: 's',
  },
  archer: {
    names: ['Bowman', 'Spear Thrower'], hp: 40, armor: 0, dmg: 3, pierce: 6, range: 4, sight: 6, speed: 10,
    cd: 22, gold: 500, wood: 50, time: 280, food: 1, from: 'barracks', req: 'mill', key: 'a', missile: 'arrow',
  },
  knight: {
    names: ['Lancer', 'Wolf Rider'], hp: 90, armor: 4, dmg: 8, pierce: 4, range: 1, sight: 5, speed: 6,
    cd: 20, gold: 800, wood: 100, time: 340, food: 1, from: 'barracks', req: 'stable', key: 'k',
  },
  siege: {
    names: ['Mangonel', 'Rock Hurler'], hp: 110, armor: 0, dmg: 70, pierce: 0, range: 8, sight: 8, speed: 16,
    cd: 70, gold: 900, wood: 300, time: 460, food: 1, from: 'barracks', req: 'forge', key: 'c', missile: 'rock', splash: 1, minRange: 2,
  },
};
export const UNIT_ORDER = ['worker', 'soldier', 'archer', 'knight', 'siege'];

export const BUILDINGS = {
  hall: {
    names: ['Town Hall', 'Great Lodge'], size: 4, hp: 1200, armor: 20, sight: 6, gold: 1200, wood: 800, time: 900,
    food: 5, depot: ['gold', 'wood'], trains: ['worker'], key: 'h',
  },
  farm: {
    names: ['Farm', 'Granary'], size: 2, hp: 400, armor: 20, sight: 3, gold: 500, wood: 250, time: 400, food: 4, key: 'f',
  },
  barracks: {
    names: ['Barracks', 'War Pit'], size: 3, hp: 800, armor: 20, sight: 3, gold: 700, wood: 450, time: 600,
    trains: ['soldier', 'archer', 'knight', 'siege'], key: 'b',
  },
  mill: {
    names: ['Lumber Mill', 'Sawpit'], size: 3, hp: 600, armor: 20, sight: 3, gold: 600, wood: 450, time: 500, depot: ['wood'], key: 'l',
  },
  stable: {
    names: ['Stables', 'Wolf Den'], size: 3, hp: 500, armor: 20, sight: 3, gold: 1000, wood: 300, time: 600, req: 'barracks', key: 't',
  },
  forge: {
    names: ['Forge', 'Bonesmith'], size: 3, hp: 775, armor: 20, sight: 3, gold: 800, wood: 450, time: 600, req: 'mill', key: 'o',
  },
  tower: {
    names: ['Guard Tower', 'Watch Spire'], size: 2, hp: 400, armor: 20, sight: 9, gold: 500, wood: 200, time: 500, req: 'mill', key: 'g',
    attack: { dmg: 4, pierce: 12, range: 6, cd: 25, missile: 'arrow' },
  },
  mine: { names: ['Gold Mine', 'Gold Mine'], size: 3, hp: 25500, armor: 20, sight: 1, neutral: true },
};
export const BUILD_ORDER = ['farm', 'barracks', 'mill', 'stable', 'forge', 'tower', 'hall'];

export const START_GOLD = 2000;
export const START_WOOD = 1000;
export const MINE_GOLD = 40000;
export const TREE_WOOD = 100;
export const CARRY = 100;
export const MINE_TIME = 90;   // ticks inside mine
export const CHOP_TIME = 70;   // ticks chopping
export const MAX_SELECT = 9;
export const QUEUE_MAX = 5;

export function isUnit(type) { return !!UNITS[type]; }
export function def(type) { return UNITS[type] || BUILDINGS[type]; }
export function nameOf(type, faction) { const d = def(type); return d.names[faction] || d.names[0]; }
