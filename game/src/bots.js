// HELIX BREACH — the bots. Five opponents (and four teammates) who walk the map on
// a waypoint graph, hold sites, react to what they see and hear, strafe and burst
// fire when engaged, and play the objective: attackers plant the spike, defenders
// defuse it. One bot, one state machine; perception runs at 10 Hz, movement at
// the fixed 60 Hz step. Bots never climb the mid platform — it is the player's perch.
import * as THREE from 'three';
import { G } from './state.js';
import { WEAPONS, createLoadout } from './weapons.js';
import { findPath, nearestNode, SITES } from './world.js';
import { segmentBlocked } from './combat.js';

const BOT_NAMES = {
  vanguard: ['IRIS', 'JUNO', 'MIRA', 'SABLE'],
  ember: ['ASH', 'CINDER', 'ROOK', 'VEX', 'ONYX'],
};
const BOT_SKILL = [0.5, 0.58, 0.66, 0.72, 0.78];
const BOT_WEAPONS = ['vk47', 'vk47', 'kx9', 'vk47', 'lw88'];

const _eye = new THREE.Vector3();
const _to = new THREE.Vector3();

function makeBotMesh(scene, team) {
  const group = new THREE.Group();
  const trim = team === 'vanguard' ? 0x35c4ff : 0xff5a3c;
  const suit = team === 'vanguard' ? 0x2b4a6b : 0x6b2b22;
  const suitMat = new THREE.MeshStandardMaterial({ color: suit, roughness: 0.85, metalness: 0.1 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x1a1f2a, roughness: 0.9, metalness: 0.1 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: trim, emissiveIntensity: 1.4 });
  const visorMat = new THREE.MeshStandardMaterial({ color: 0x0a0f1c, roughness: 0.25, metalness: 0.7 });

  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.75, 0.24), darkMat);
  legL.position.set(-0.14, 0.375, 0);
  const legR = legL.clone();
  legR.position.x = 0.14;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.7, 0.36), suitMat);
  torso.position.set(0, 1.1, 0);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.09, 0.38), trimMat);
  stripe.position.set(0, 1.32, 0);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.32, 0.32), suitMat);
  head.position.set(0, 1.62, 0);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.05), visorMat);
  visor.position.set(0, 1.64, -0.17);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.12, 0.85), darkMat);
  gun.position.set(0.22, 1.28, -0.35);
  group.add(legL, legR, torso, stripe, head, visor, gun);
  group.traverse((m) => { if (m.isMesh) { m.castShadow = true; } });
  scene.add(group);
  return { group, head, torso, legL, legR, gun };
}

export function createBots(scene, world, combat, effects, audio, rng) {
  const bots = []; // combatant indices of bots
  let thinkI = 0;

  function spawnBot(index, team, name, skill, weaponId, spawnPos) {
    const c = G.combatants[index];
    c.team = team;
    c.name = name;
    c.isPlayer = false;
    c.alive = true;
    c.hp = 100;
    c.armor = 0;
    c.money = 800;
    c.kills = 0; c.deaths = 0;
    c.pos = new THREE.Vector3(spawnPos[0], 0, spawnPos[1]);
    c.yaw = team === 'vanguard' ? 0 : Math.PI;
    c.velX = 0; c.velZ = 0;
    c.loadout = createLoadout();
    c.loadout.primary = weaponId;
    c.loadout.current = weaponId;
    c.loadout.mag[weaponId] = WEAPONS[weaponId].mag;
    c.loadout.reserve[weaponId] = WEAPONS[weaponId].reserve;
    const parts = makeBotMesh(scene, team);
    c.mesh = parts.group;
    parts.head.userData = { bot: index, part: 'head' };
    parts.torso.userData = { bot: index, part: 'body' };
    parts.legL.userData = { bot: index, part: 'legs' };
    parts.legR.userData = { bot: index, part: 'legs' };
    combat.registerBotMeshes([parts.head, parts.torso, parts.legL, parts.legR]);
    c.bot = {
      skill, weaponId, state: 'advance', path: [], pathI: 0,
      holdNode: null, holdYaw: c.yaw, target: null, reactAt: 0,
      burstLeft: 0, nextShotAt: 0, burstHeat: 0,
      lastSeen: null, lastSeenAt: -10, heardPos: null, heardAt: -10,
      strafeDir: 1, strafeAt: 0, aimYaw: c.yaw, aimPitch: 0,
      role: 'mid', site: null, plantAt: 0, thinkOffset: index * 0.1,
    };
    bots.push(index);
    return c;
  }

  function setupMatch() {
    // Clear old bot meshes.
    for (const i of bots) {
      const c = G.combatants[i];
      if (c.mesh) scene.remove(c.mesh);
    }
    bots.length = 0;
    G.combatants.length = 1; // keep the player at index 0
    const names = { vanguard: [...BOT_NAMES.vanguard], ember: [...BOT_NAMES.ember] };
    let vi = 0, ei = 0;
    for (let i = 0; i < 9; i += 1) {
      const team = i < 4 ? 'vanguard' : 'ember';
      const idx = G.combatants.length;
      G.combatants.push({ id: idx });
      const name = team === 'vanguard' ? names.vanguard[vi] : names.ember[ei];
      const skill = BOT_SKILL[(team === 'vanguard' ? vi : ei) % BOT_SKILL.length];
      const weapon = BOT_WEAPONS[(team === 'vanguard' ? vi : ei) % BOT_WEAPONS.length];
      spawnBot(idx, team, name, skill, weapon, [0, 0]);
      if (team === 'vanguard') vi += 1; else ei += 1;
    }
  }

  function assignRound(spawns) {
    const attackers = G.attacking;
    let ai = 0, di = 0;
    for (const idx of bots) {
      const c = G.combatants[idx];
      const spawn = spawns[c.team][(c.team === 'vanguard' ? ai : di) % spawns[c.team].length];
      const survived = c.alive;
      c.pos.set(spawn[0], 0, spawn[1]);
      c.yaw = c.team === 'vanguard' ? 0 : Math.PI;
      c.alive = true; c.hp = 100;
      if (!survived) {
        // Died last round: the gun and the armour are gone.
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
      c.mesh.visible = true;
      c.mesh.rotation.set(0, c.yaw, 0);
      c.mesh.position.copy(c.pos);
      const b = c.bot;
      b.state = 'advance';
      b.target = null; b.lastSeen = null; b.heardPos = null;
      b.burstLeft = 0; b.burstHeat = 0;
      const isAttacker = c.team === attackers;
      const from = nearestNode(c.pos.x, c.pos.z);
      if (isAttacker) {
        // Two to A, two to B, one through mid.
        const site = ai % 5 === 4 ? 'mid' : ai % 2 === 0 ? 'A' : 'B';
        const dest = site === 'A' ? 'sa1' : site === 'B' ? 'sb1' : 'm3'; // mid pushes past the platform, not onto it
        b.role = site === 'mid' ? 'mid' : site.toLowerCase();
        b.site = site === 'mid' ? (ai % 2 === 0 ? 'A' : 'B') : site;
        b.path = findPath(from, dest);
        b.pathI = 0;
        ai += 1;
      } else {
        // Two hold A, two hold B, one holds mid.
        const holds = ['sa1', 'sb1', 'sa0', 'sb0', 'm1']; // mid hold stays south of the platform
        const hold = holds[di % holds.length];
        b.role = 'hold';
        b.site = hold.startsWith('sa') ? 'A' : hold.startsWith('sb') ? 'B' : null;
        b.holdNode = hold;
        b.path = findPath(from, hold);
        b.pathI = 0;
        di += 1;
      }
    }
  }

  function visibleEnemy(bot, now) {
    const c = G.combatants[bot];
    const eye = _eye.set(c.pos.x, c.pos.y + 1.55, c.pos.z);
    let best = null, bestD = 46;
    for (let i = 0; i < G.combatants.length; i += 1) {
      const t = G.combatants[i];
      if (t.team === c.team || !t.alive) continue;
      const dx = t.pos.x - c.pos.x, dy = (t.pos.y + 1.2) - eye.y, dz = t.pos.z - c.pos.z;
      const dist = Math.hypot(dx, dy, dz);
      if (dist > bestD) continue;
      // Field of view: 100 degrees around the bot's facing.
      const ang = Math.atan2(-dx, -dz);
      let diff = ang - c.yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      if (Math.abs(diff) > 0.95 && dist > 4) continue;
      _to.set(t.pos.x, t.pos.y + 1.2, t.pos.z);
      if (segmentBlocked(eye, _to, world.colliders, effects.smokeClouds)) continue;
      best = i; bestD = dist;
    }
    return best;
  }

  function think(idx, now, dt, random) {
    const c = G.combatants[idx];
    const b = c.bot;
    if (!c.alive) return;
    const seen = visibleEnemy(idx, now);
    if (seen !== null) {
      if (b.target !== seen) {
        b.target = seen;
        b.reactAt = now + (0.55 - b.skill * 0.35) + random() * 0.15;
        b.burstLeft = 0;
      }
      const t = G.combatants[seen];
      b.lastSeen = { x: t.pos.x, y: t.pos.y, z: t.pos.z };
      b.lastSeenAt = now;
      if (b.state !== 'engage') b.state = 'engage';
    } else if (b.target !== null) {
      if (now - b.lastSeenAt > 1.6) { b.target = null; if (b.state === 'engage') b.state = b.role === 'hold' ? 'hold' : 'advance'; }
    }
    // Hearing: a shot within 28 m draws a bot to investigate.
    if (b.heardPos && now - b.heardAt < 6 && b.state !== 'engage' && b.role !== 'hold') {
      b.state = 'investigate';
    }
    // Objective: the spike is planted — defenders rotate, attackers converge.
    if (G.spike.state === 'planted' && G.spike.site) {
      if (c.team !== G.attacking && b.state !== 'engage' && b.state !== 'defuse') {
        const siteNode = G.spike.site === 'A' ? 'sa0' : 'sb0';
        if (!b.path.length || b.path[b.path.length - 1] !== siteNode) {
          b.path = findPath(nearestNode(c.pos.x, c.pos.z), siteNode);
          b.pathI = 0;
          b.state = 'rotate';
        }
      }
      if (c.team === G.attacking && b.state !== 'engage' && b.role !== 'hold') {
        const siteNode = G.spike.site === 'A' ? 'sa0' : 'sb0';
        if (!b.path.length || b.path[b.path.length - 1] !== siteNode) {
          b.path = findPath(nearestNode(c.pos.x, c.pos.z), siteNode);
          b.pathI = 0;
          b.state = 'rotate';
        }
      }
    }
    // Defuse: a defender at the planted site with a clear moment starts defusing.
    if (G.spike.state === 'planted' && c.team !== G.attacking && b.target === null) {
      const site = SITES[G.spike.site];
      const dx = c.pos.x - site.cx, dz = c.pos.z - site.cz;
      if (Math.abs(dx) < site.hx && Math.abs(dz) < site.hz && G.spike.defuser === null) {
        b.state = 'defuse';
        G.spike.defuser = idx;
        G.spike.state = 'defusing';
        G.spike.progress = 0;
      }
    }
  }

  function hearShot(pos) {
    for (const idx of bots) {
      const c = G.combatants[idx];
      if (!c.alive) continue;
      const d = Math.hypot(c.pos.x - pos.x, c.pos.z - pos.z);
      if (d < 28) {
        c.bot.heardPos = { x: pos.x, z: pos.z };
        c.bot.heardAt = G.time;
      }
    }
  }

  // Move toward a point on the ground plane, sliding along AABBs. Each axis is
  // applied and then reverted if it creates a NEW penetration: a collider the bot
  // already overlapped is never resolved on this axis, or the bot gets clamped to
  // a face it never approached and teleports through the wall. No step-up: bot
  // waypoints route around the mid platform (it is the player's perch).
  // Scratch vectors are reused — no allocation.
  const _box = new THREE.Box3();
  const _bmin = new THREE.Vector3();
  const _bmax = new THREE.Vector3();
  const _oldBox = new THREE.Box3();
  const _omin = new THREE.Vector3();
  const _omax = new THREE.Vector3();
  const _muzzle = new THREE.Vector3();
  function moveBot(c, tx, tz, speed, dt) {
    const dx = tx - c.pos.x, dz = tz - c.pos.z;
    const len = Math.hypot(dx, dz);
    if (len < 0.05) return true;
    const vx = (dx / len) * speed, vz = (dz / len) * speed;
    c.velX = vx; c.velZ = vz;
    const oldX = c.pos.x;
    c.pos.x += vx * dt;
    _box.set(_bmin.set(c.pos.x - 0.38, 0, c.pos.z - 0.38), _bmax.set(c.pos.x + 0.38, 1.72, c.pos.z + 0.38));
    _oldBox.set(_omin.set(oldX - 0.38, 0, c.pos.z - 0.38), _omax.set(oldX + 0.38, 1.72, c.pos.z + 0.38));
    for (const col of world.colliders) {
      if (_box.intersectsBox(col) && !_oldBox.intersectsBox(col)) { c.pos.x = oldX; break; }
    }
    const oldZ = c.pos.z;
    c.pos.z += vz * dt;
    _box.set(_bmin.set(c.pos.x - 0.38, 0, c.pos.z - 0.38), _bmax.set(c.pos.x + 0.38, 1.72, c.pos.z + 0.38));
    _oldBox.set(_omin.set(c.pos.x - 0.38, 0, oldZ - 0.38), _omax.set(c.pos.x + 0.38, 1.72, oldZ + 0.38));
    for (const col of world.colliders) {
      if (_box.intersectsBox(col) && !_oldBox.intersectsBox(col)) { c.pos.z = oldZ; break; }
    }
    return len < 0.6;
  }

  function stepBot(idx, now, dt, random) {
    const c = G.combatants[idx];
    const b = c.bot;
    if (!c.alive) {
      // Fall over and fade.
      if (c.mesh.visible) {
        c.mesh.rotation.x = Math.max(-Math.PI / 2, c.mesh.rotation.x - dt * 4);
        if (now - c.deathAt > 4) c.mesh.visible = false;
      }
      return;
    }
    const w = WEAPONS[c.loadout.current];
    // Aim the mesh at the target or the move direction.
    let wantYaw = c.yaw;
    if (b.target !== null) {
      const t = G.combatants[b.target];
      wantYaw = Math.atan2(-(t.pos.x - c.pos.x), -(t.pos.z - c.pos.z));
    }
    let dyaw = wantYaw - c.yaw;
    while (dyaw > Math.PI) dyaw -= Math.PI * 2;
    while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    c.yaw += dyaw * Math.min(1, dt * 10);
    c.mesh.rotation.y = c.yaw;

    if (b.state === 'engage' && b.target !== null) {
      const t = G.combatants[b.target];
      // Strafe perpendicular to the target, switching sides regularly.
      if (now > b.strafeAt) { b.strafeDir *= -1; b.strafeAt = now + 0.8 + random() * 0.9; }
      const dx = t.pos.x - c.pos.x, dz = t.pos.z - c.pos.z;
      const dist = Math.hypot(dx, dz) || 1;
      const px = -dz / dist * b.strafeDir, pz = dx / dist * b.strafeDir;
      const keep = dist > 14 ? 1 : dist < 6 ? -1 : 0;
      moveBot(c, c.pos.x + px + (dx / dist) * keep, c.pos.z + pz + (dz / dist) * keep, 2.6, dt);
      // Fire in bursts once the reaction time has passed.
      if (now >= b.reactAt && c.loadout.cooldown <= now) {
        if (b.burstLeft <= 0) {
          b.burstLeft = 3 + Math.floor(random() * 3);
          b.nextShotAt = now + 0.45 + random() * 0.5;
        }
        if (now >= b.nextShotAt) {
          const res = combat.botShot(c, t, random);
          b.burstHeat += 1;
          b.burstLeft -= 1;
          c.loadout.cooldown = now + w.interval;
          b.nextShotAt = now + w.interval;
          effects.muzzle(_muzzle.set(c.pos.x, c.pos.y + 1.3, c.pos.z));
          if (b.burstLeft <= 0) { b.burstHeat = 0; b.nextShotAt = now + 0.5 + random() * 0.6; }
        }
      }
      return;
    }

    if (b.state === 'defuse') {
      // Channel the defuse; any damage or a spotted enemy cancels it.
      if (b.target !== null) { b.state = 'engage'; if (G.spike.defuser === idx) { G.spike.defuser = null; G.spike.state = 'planted'; } return; }
      G.spike.progress += dt / 5;
      if (Math.floor(G.spike.progress * 20) !== Math.floor((G.spike.progress - dt / 5) * 20)) audio.defuseTick();
      return;
    }

    if (b.state === 'plant') {
      G.spike.progress += dt / 4;
      return;
    }

    // Advance / rotate / investigate / hold: walk the path.
    if (b.path.length && b.pathI < b.path.length) {
      const node = world.nodes[b.path[b.pathI]];
      const arrived = moveBot(c, node[0], node[1], 3.4, dt);
      if (arrived) b.pathI += 1;
      if (b.pathI >= b.path.length) {
        if (b.state === 'advance' && b.role === 'hold') {
          b.state = 'hold';
          b.holdYaw = c.yaw;
        } else if (b.state === 'advance') {
          // Attacker at the end of the route: hold the site entrance.
          b.state = 'hold';
          b.holdYaw = c.yaw;
        } else if (b.state === 'investigate') {
          b.state = 'advance';
          b.heardPos = null;
          b.path = [];
        } else if (b.state === 'rotate') {
          b.state = 'hold';
        }
      }
    } else if (b.state === 'hold') {
      // Slow scan: sweep the view across the approach.
      c.yaw = b.holdYaw + Math.sin(now * 0.45) * 0.9;
      c.mesh.rotation.y = c.yaw;
    }
    // The spike carrier plants when it reaches its site.
    if (G.spike.carrier === idx && G.spike.state === 'carried' && b.site) {
      const site = SITES[b.site];
      if (Math.abs(c.pos.x - site.cx) < site.hx && Math.abs(c.pos.z - site.cz) < site.hz) {
        b.state = 'plant';
        G.spike.state = 'planting';
        G.spike.progress = 0;
        G.spike.planter = idx;
        G.spike.site = b.site;
      }
    }
  }

  function step(now, dt, random) {
    // Staggered perception: one bot thinks per step in rotation.
    thinkI = (thinkI + 1) % Math.max(1, bots.length);
    const thinkIdx = bots[thinkI];
    if (thinkIdx !== undefined) think(thinkIdx, now, dt, random);
    for (const idx of bots) stepBot(idx, now, dt, random);
    // Sync meshes.
    for (const idx of bots) {
      const c = G.combatants[idx];
      if (c.alive) c.mesh.position.copy(c.pos);
    }
  }

  return { setupMatch, assignRound, step, hearShot, bots };
}
