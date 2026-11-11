# Wartwo — Tides of Iron

An original real-time strategy game in the style of the mid-90s classics. It runs in the browser
at 640×480 with a 256-colour indexed palette, and you can play multiplayer peer-to-peer.
There's no build step, no server and no assets to download.

**Kingdom of Vale** vs. **the Ashen Warband**: mine gold, cut lumber, build farms for food, raise an
army and wipe out every enemy building and unit.

## Run it

It's a static site, so any web server will do:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000. ES modules don't load from `file://`, so it has to be served.
It also works as-is on GitHub Pages.

## Features

- Tile-based maps (64/96/128) generated from a seed: grassland, forests you can harvest, lakes with sandy shores, rocky outcrops, gold mines
- Workers mine gold (they go inside the mine) and chop trees (forests get cleared), then carry the loads back to a Town Hall or Lumber Mill
- 7 buildings (hall, farm, barracks, lumber mill, stables, forge, guard tower) built with scaffolding, plus a tech tree
- 5 units per faction: worker, infantry, ranged, cavalry and siege (siege does splash damage)
- Food limit, training queues, rally points, damaged buildings catch fire, corpses and rubble
- Fog of war (unexplored areas are black, explored ones dithered), minimap, a 9-unit selection limit, control groups, attack-move, stand ground
- Computer opponent that builds, expands to new mines, defends and attacks in waves
- All graphics are generated in code, with no image files. Units and buildings are modelled from simple 3D shapes and drawn by a small built-in software renderer into shaded, outlined, 256-colour pixel art: 8 facings, walk and attack cycles, ground shadows, and team colours remapped from one shared colour ramp
- Terrain is painted per pixel from the tile map, so grass, dirt, beaches and water meet along ragged natural borders. Water is animated, and units walk behind trees and rocks
- Sound effects are synthesized with WebAudio

## Multiplayer

Choose **Multiplayer**, then host a game or join one from the list. Players find each other through
public Nostr relays (via [Trystero](https://github.com/dmotz/trystero), vendored in `vendor/`) and
then connect directly over WebRTC data channels. You don't need an account or a server.

The simulation is deterministic: integer maths, a seeded RNG, no trigonometry. Peers exchange
only player commands, using a lockstep protocol with 100 ms turns and ~300 ms input delay, and they
compare state hashes regularly so a desync gets spotted. If a player disconnects, the game carries
on for everyone else. Computer players run inside the shared simulation, so you can add them to
online games too.

## Controls

| Input | Action |
|---|---|
| Left click / drag | Select / box-select (Shift adds, double-click selects all of that type on screen) |
| Right click | Smart order: move, attack, harvest, return goods, set rally point |
| A / M / S / H | Attack (or attack-move), move, stop, stand ground |
| G / R | Harvest, return goods |
| B / V | Basic / advanced building menu, then use the hotkeys shown on the buttons |
| Ctrl+1–9, 1–9 | Assign / recall a control group (press twice to centre the view) |
| Arrows / screen edge | Scroll |
| Space | Jump to the last alert |
| Enter | Chat |
| F10 | Menu |
| P | Pause (single player) |

## Code layout

- `src/sim.js`: deterministic game simulation (A* pathfinding, combat, economy, construction)
- `src/ai.js`: computer opponent (runs inside the simulation)
- `src/map.js`: seeded map generator and RNG
- `src/net.js`: P2P lobby and lockstep driver
- `src/render.js`: viewport, fog, minimap and HUD
- `src/r3d.js`: software renderer that turns 3D primitives into palette-indexed pixel art
- `src/units.js`, `src/buildings.js`: unit and building models for both factions
- `src/terrain.js`: ground painter, water animation, trees and rocks
- `src/sprites.js`: sprite cache, effects, icons, portraits and interface art
- `src/img.js`: indexed-colour image buffer
- `src/palette.js`: 256-colour palette and team colour remapping
- `src/sfx.js`: synthesized sound
- `src/main.js`: menus, input and the main loop
