# Headless checks

No test framework, just Node scripts that drive the deterministic simulation directly. Run them from the repo root.

| Script | What it does | Example |
| --- | --- | --- |
| `ai-games.mjs <seed> <players> <size> <maxTicks>` | Computer-vs-computer game with invariant checks (tile occupancy, resources). `DET=1` runs two copies and compares hashes; `LV=0,2` sets difficulty per player. Every game should end `over true`, `errs 0`. | `node tools/checks/ai-games.mjs 3 2 64 300000` |
| `fuzz.mjs <seed>` | One "human" issuing random and malformed commands against two computer players, on two game copies that must stay in sync. | `node tools/checks/fuzz.mjs 1` |
| `movement.mjs` | Crowd scenarios (groups crossing in gaps, pockets, blocked targets). Units should arrive, not give up. | `node tools/checks/movement.mjs` |
| `lockstep.mjs <seed> <humans> [dropAtFrame] [maxLag]` | Simulated multiplayer: one Game + Lockstep per peer over a mock lobby with random latency, optionally dropping a peer. Hashes must match. | `node tools/checks/lockstep.mjs 6 4 3000 9` |
