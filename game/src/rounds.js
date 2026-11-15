// HELIX BREACH — the match skeleton. Rounds, freeze time, the buy phase, the spike
// (plant / defuse / fuse), the economy, side switches and overtime. First to five
// round wins takes the match; at 4–4 the next round is sudden death.
import { G } from './state.js';
import { SITES, SPAWNS } from './world.js';
import { WEAPONS } from './weapons.js';
import * as THREE from 'three';

const FREEZE_TIME = 4;
const ROUND_TIME = 100;
const FUSE_TIME = 40;
const PLANT_TIME = 4;
const DEFUSE_TIME = 5;
const WIN_ROUNDS = 5;
const SWITCH_AFTER = 4;
const WIN_BONUS = 3000;
const LOSS_BONUS = 1900;
const LOSS_STREAK_BONUS = 500;

export function createRounds(deps) {
  const { world, bots, audio, hud, rng } = deps;
  let spikeMesh = null;

  function makeSpikeMesh(scene) {
    const geo = new THREE.BoxGeometry(0.34, 0.22, 0.5);
    const mat = new THREE.MeshStandardMaterial({ color: 0x1a1f2a, emissive: 0xf5a524, emissiveIntensity: 1.2, roughness: 0.4, metalness: 0.6 });
    spikeMesh = new THREE.Mesh(geo, mat);
    spikeMesh.castShadow = true;
    scene.add(spikeMesh);
    const light = new THREE.PointLight(0xf5a524, 6, 6, 2);
    light.position.y = 0.6;
    spikeMesh.add(light);
    spikeMesh.visible = false;
  }

  function resetCombatant(c, spawn, survived) {
    c.pos.set(spawn[0], 0, spawn[1]);
    c.alive = true;
    c.hp = 100;
    if (!survived) {
      c.armor = 0;
      c.loadout.primary = null;
      c.loadout.current = 'p9';
      c.loadout.mag = { p9: WEAPONS.p9.mag };
      c.loadout.reserve = { p9: WEAPONS.p9.reserve };
      c.loadout.grenades = { frag: 0, smoke: 0, flash: 0 };
    }
    c.loadout.reloading = false;
    c.loadout.cooldown = 0;
    c.loadout.bloom = 0;
    if (c.mesh) { c.mesh.visible = true; c.mesh.rotation.set(0, c.yaw, 0); }
  }

  function startMatch() {
    G.wins = { vanguard: 0, ember: 0 };
    G.round = 1;
    G.attacking = 'vanguard';
    G.lossStreak = { vanguard: 0, ember: 0 };
    G.phase = 'menu';
    G.matchWinner = null;
    for (const c of G.combatants) {
      c.money = 800; c.kills = 0; c.deaths = 0; c.armor = 0;
    }
    bots.setupMatch();
  }

  function startRound() {
    G.phase = 'freeze';
    G.phaseAt = G.time;
    G.roundTimer = ROUND_TIME;
    G.spike = { state: 'carried', carrier: null, site: null, progress: 0, fuse: FUSE_TIME, defuser: null, planter: null, x: 0, z: 0 };
    G.feed = [];
    G.banner = null;
    // Player spawns with their team; bots take the rest.
    const player = G.combatants[0];
    const survived = player.alive;
    const spawnList = SPAWNS[player.team];
    resetCombatant(player, spawnList[0], survived);
    player.yaw = player.team === 'vanguard' ? 0 : Math.PI;
    deps.player.reset(spawnList[0][0], spawnList[0][1], player.yaw);
    bots.assignRound(SPAWNS);
    // Spike carrier: the player when their team attacks, else a random attacker bot.
    if (player.team === G.attacking) {
      G.spike.carrier = 0;
      player.hasSpike = true;
    } else {
      const attackers = bots.bots.filter((i) => G.combatants[i].team === G.attacking);
      const carrier = attackers[Math.floor(rng() * attackers.length)];
      G.spike.carrier = carrier;
      G.combatants[carrier].hasSpike = true;
    }
    for (const c of G.combatants) if (c !== G.combatants[G.spike.carrier]) c.hasSpike = false;
    if (spikeMesh) spikeMesh.visible = false;
    hud.showBuy(false);
    hud.banner(`ROUND ${G.round}`, `${G.attacking === 'vanguard' ? 'VANGUARD' : 'EMBER'} attacks — ${G.attacking === player.team ? 'plant the spike' : 'defend the sites'}`);
  }

  function endRound(winner, reason) {
    if (G.phase === 'roundEnd' || G.phase === 'matchEnd') return;
    const player = G.combatants[0];
    const playerWon = winner === player.team;
    G.wins[winner] += 1;
    const loser = winner === 'vanguard' ? 'ember' : 'vanguard';
    G.lossStreak[loser] = Math.min(2, G.lossStreak[loser] + 1);
    G.lossStreak[winner] = 0;
    for (const c of G.combatants) {
      if (c.team === winner) c.money += WIN_BONUS;
      else c.money += LOSS_BONUS + LOSS_STREAK_BONUS * G.lossStreak[c.team];
      c.money = Math.min(16000, c.money);
    }
    // Bots spend their money: rifles for the attackers, armour for the holders.
    for (const i of bots.bots) {
      const c = G.combatants[i];
      if (!c.alive) continue;
      if (c.loadout.primary !== 'vk47' && c.money >= 2700) {
        c.money -= 2700;
        c.loadout.primary = 'vk47';
        c.loadout.current = 'vk47';
        c.loadout.mag.vk47 = WEAPONS.vk47.mag;
        c.loadout.reserve.vk47 = WEAPONS.vk47.reserve;
      }
      if (c.armor === 0 && c.money >= 1000) { c.money -= 1000; c.armor = 50; }
    }
    G.phase = 'roundEnd';
    G.phaseAt = G.time;
    G.roundEndReason = reason;
    G.roundWinner = winner;
    if (playerWon) { audio.roundWin(); hud.banner('ROUND WON', reason); }
    else { audio.roundLose(); hud.banner('ROUND LOST', reason); }
    hud.showBuy(false);
    G.spike.state = 'done';
    if (spikeMesh) spikeMesh.visible = false;
  }

  function nextRound() {
    if (G.wins.vanguard >= WIN_ROUNDS || G.wins.ember >= WIN_ROUNDS) {
      G.phase = 'matchEnd';
      G.phaseAt = G.time;
      G.matchWinner = G.wins.vanguard > G.wins.ember ? 'vanguard' : 'ember';
      hud.banner(G.matchWinner === G.combatants[0].team ? 'VICTORY' : 'DEFEAT', `${G.wins.vanguard} – ${G.wins.ember}`);
      if (G.matchWinner === G.combatants[0].team) audio.roundWin(); else audio.roundLose();
      return;
    }
    if (G.round === SWITCH_AFTER) {
      G.attacking = G.attacking === 'vanguard' ? 'ember' : 'vanguard';
      for (const c of G.combatants) c.team = c.team === 'vanguard' ? 'ember' : 'vanguard';
      hud.banner('SIDES SWITCHED', `${G.attacking === 'vanguard' ? 'VANGUARD' : 'EMBER'} now attacks`);
    }
    G.round += 1;
    startRound();
  }

  // The player holding E near a site with the spike, or near the planted spike.
  function playerObjective(dt, holdingE) {
    const player = G.combatants[0];
    if (!player.alive || G.phase !== 'live') return;
    const s = G.spike;
    if (s.state === 'carried' && s.carrier === 0 && holdingE) {
      for (const siteId of ['A', 'B']) {
        const site = SITES[siteId];
        if (Math.abs(player.pos.x - site.cx) < site.hx && Math.abs(player.pos.z - site.cz) < site.hz) {
          s.state = 'planting';
          s.site = siteId;
          s.progress = 0;
          s.planter = 0;
          return;
        }
      }
    }
    if (s.state === 'planting' && s.planter === 0) {
      const site = SITES[s.site];
      const inside = Math.abs(player.pos.x - site.cx) < site.hx && Math.abs(player.pos.z - site.cz) < site.hz;
      if (holdingE && inside) {
        s.progress += dt / PLANT_TIME;
        if (Math.floor(s.progress * 8) !== Math.floor((s.progress - dt / PLANT_TIME) * 8)) audio.beep();
        if (s.progress >= 1) {
          s.state = 'planted';
          s.fuse = FUSE_TIME;
          player.money += 300;
          hud.addFeed('You planted the spike', 'good');
          audio.beep(true);
          // Defenders rotate; attackers hold.
          for (const i of bots.bots) {
            const c = G.combatants[i];
            if (c.team !== G.attacking) { c.bot.state = 'rotate'; c.bot.path = []; }
          }
        }
      } else {
        s.state = 'carried';
        s.progress = 0;
      }
      return;
    }
    if (s.state === 'planted' && player.team !== G.attacking && holdingE) {
      const d = Math.hypot(player.pos.x - s.x, player.pos.z - s.z);
      if (d < 2.2 && !s.defuser) {
        s.state = 'defusing';
        s.defuser = 0;
        s.progress = 0;
      }
    }
    if (s.state === 'defusing' && s.defuser === 0) {
      const d = Math.hypot(player.pos.x - s.x, player.pos.z - s.z);
      if (holdingE && d < 2.2) {
        s.progress += dt / DEFUSE_TIME;
        if (Math.floor(s.progress * 10) !== Math.floor((s.progress - dt / DEFUSE_TIME) * 10)) audio.defuseTick();
        if (s.progress >= 1) {
          s.state = 'done';
          player.money += 300;
          hud.addFeed('You defused the spike', 'good');
          endRound(player.team, 'Spike defused');
        }
      } else {
        s.state = 'planted';
        s.defuser = null;
        s.progress = 0;
      }
    }
  }

  // The spike on the ground: attackers pick it up by walking over it.
  function spikePickup() {
    const s = G.spike;
    if (s.state !== 'dropped') return;
    for (const c of G.combatants) {
      if (!c.alive || c.team !== G.attacking) continue;
      if (Math.hypot(c.pos.x - s.x, c.pos.z - s.z) < 1.4) {
        s.state = 'carried';
        s.carrier = c.id;
        c.hasSpike = true;
        if (c.isPlayer) hud.addFeed('You picked up the spike', 'good');
        if (spikeMesh) spikeMesh.visible = false;
        return;
      }
    }
  }

  function dropSpike(c) {
    if (!c.hasSpike) return;
    c.hasSpike = false;
    const s = G.spike;
    if (s.state === 'carried' || s.state === 'planting') {
      s.state = 'dropped';
      s.x = c.pos.x; s.z = c.pos.z;
      s.progress = 0; s.planter = null;
      if (spikeMesh) {
        spikeMesh.visible = true;
        spikeMesh.position.set(s.x, 0.15, s.z);
      }
    }
    if (s.defuser === c.id) { s.defuser = null; s.state = 'planted'; }
  }

  function step(dt) {
    const now = G.time;
    if (G.phase === 'freeze') {
      if (now - G.phaseAt >= FREEZE_TIME) {
        G.phase = 'live';
        G.phaseAt = now;
        hud.showBuy(false);
      }
      return;
    }
    if (G.phase === 'roundEnd') {
      if (now - G.phaseAt >= 3.5) nextRound();
      return;
    }
    if (G.phase !== 'live') return;
    const s = G.spike;
    // Bot plant / defuse completion.
    if (s.state === 'planting' && s.planter !== null && s.planter !== 0 && s.progress >= 1) {
      s.state = 'planted';
      s.fuse = FUSE_TIME;
      s.x = G.combatants[s.planter].pos.x;
      s.z = G.combatants[s.planter].pos.z;
      hud.addFeed(`${G.combatants[s.planter].name} planted the spike`, 'bad');
      audio.beep(true);
      if (spikeMesh) { spikeMesh.visible = true; spikeMesh.position.set(s.x, 0.15, s.z); }
    }
    if (s.state === 'defusing' && s.defuser !== null && s.defuser !== 0 && s.progress >= 1) {
      s.state = 'done';
      hud.addFeed(`${G.combatants[s.defuser].name} defused the spike`, 'bad');
      endRound(G.combatants[s.defuser].team, 'Spike defused');
      return;
    }
    if (s.state === 'planted') {
      s.fuse -= dt;
      if (s.fuse <= 0) {
        endRound(G.attacking, 'Spike detonated');
        return;
      }
    } else if (s.state !== 'planted' && s.state !== 'defusing') {
      G.roundTimer -= dt;
      if (G.roundTimer <= 0) {
        endRound(G.attacking === 'vanguard' ? 'ember' : 'vanguard', 'Time expired — spike not planted');
        return;
      }
    }
    spikePickup();
    // Elimination.
    let vanguardAlive = 0, emberAlive = 0;
    for (const c of G.combatants) {
      if (!c.alive) continue;
      if (c.team === 'vanguard') vanguardAlive += 1; else emberAlive += 1;
    }
    if (vanguardAlive === 0 || emberAlive === 0) {
      const winner = vanguardAlive > 0 ? 'vanguard' : 'ember';
      if (s.state === 'planted' || s.state === 'defusing') {
        // The fuse decides: defenders still have a chance to defuse.
        if (winner === G.attacking) { endRound(winner, 'Enemy team eliminated'); return; }
        // Defenders alive, attackers dead, spike planted: let the fuse run.
      } else {
        endRound(winner, 'Enemy team eliminated');
        return;
      }
    }
  }

  return { makeSpikeMesh, startMatch, startRound, endRound, step, playerObjective, dropSpike, spikePickup };
}
