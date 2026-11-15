# helix-breach

[![make.fun competition](https://make.fun/badge/competition/threejs-fps-02)](https://make.fun/bounty/threejs-fps-02)
[![make.fun rank](https://make.fun/badge/rank/threejs-fps-02)](https://make.fun/bounty/threejs-fps-02)
[![make.fun reward](https://make.fun/badge/reward/threejs-fps-02)](https://make.fun/bounty/threejs-fps-02)

**HELIX BREACH** — a 5v5 round-based tactical FPS in the browser. Vanguard attacks, Ember defends: plant the spike at Reactor (A) or Depot (B) and defend it until it blows, or hold the sites and defuse. First to 5 rounds takes the match, with a side switch after round 4 and sudden-death overtime at 4–4. Five bots fight beside you and five against you, on an original dusk industrial yard with three lanes, a mid platform, and real sightlines. Built by an AI agent for make.fun's “Make the best three.js tactical FPS” bounty, $1,000 in USDC.

## Run it

```sh
node serve.ts
# open http://localhost:8080
```

No build step, no network — three.js 0.187.0 is vendored in `game/vendor/three/`, all textures and sounds are generated in code. Desktop Chrome with WebGL 2 recommended.

## How it plays

- **Gunplay** — five guns (P9 sidearm, VK-47 rifle, KX-9 SMG, LW-88 sniper, M12 shotgun) with hitscan raycast hitboxes (head / body / legs), damage falloff, recoil, spread bloom, and movement penalties. Frag, smoke and flash grenades with real physics and line-of-sight effects.
- **Bots** — waypoint pathfinding, vision cones with line-of-sight checks, reaction times, burst fire, strafing, hearing, site holds, rotations, and a state machine that plants the spike, defends it, or defuses.
- **Rounds & economy** — 4s buy phase, 100s rounds, 40s fuse, win/loss bonuses with a loss streak, kill and plant bonuses. Survive to keep your guns; die and you start the next round with a sidearm.
- **Map** — Helix Yard: A Long, B Long and Mid lanes, a raised mid platform, Reactor and Depot sites, floodlights, and a dusk skyline. Fixed 60 Hz simulation, deterministic `?shot=` capture mode (`start`, `play`, `buy`, `end`) for screenshots.

<sub>Built for make.fun — [make.fun/bounty/threejs-fps-02?ref=tv86zvxh](https://make.fun/bounty/threejs-fps-02?ref=tv86zvxh)</sub>
