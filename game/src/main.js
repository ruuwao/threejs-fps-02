// HELIX BREACH — bootstrap and the game loop. A fixed 60 Hz simulation step drives
// the player, the bots and the round logic; rendering runs as fast as the browser
// will go. The `?shot=start|play|buy|end&seed=N` mode stages a deterministic scene
// and sets window.__shotReady for screenshots.
import * as THREE from 'three';
import { G, mulberry32, resetMatchState } from './state.js';
import { PALETTE } from './palette.js';
import { makeTextures } from './textures.js';
import { createWorld } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createLoadout, currentWeapon, spreadFor, startReload, finishReload, buyWeapon, buyGrenade, buyArmor, WEAPONS } from './weapons.js';
import { createEffects } from './effects.js';
import { createAudio } from './audio.js';
import { createCombat, segmentBlocked } from './combat.js';
import { createBots } from './bots.js';
import { createRounds } from './rounds.js';
import { createHud } from './hud.js';

const params = new URLSearchParams(location.search);
const shotMode = params.get('shot');
const seed = parseInt(params.get('seed') || '1337', 10);
const rng = mulberry32(seed);
G.random = rng;
resetMatchState(); // before any combatant exists — it clears the roster

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.sky);
scene.fog = new THREE.Fog(PALETTE.sky, 55, 160);
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 400);
scene.add(camera);

const textures = makeTextures();
const world = createWorld(scene, textures);
const effects = createEffects(scene, textures);
const audio = createAudio(G.settings);

// The player combatant. Its pos IS the player's position vector — one source.
const player = createPlayer(world.colliders);
const playerCombatant = {
  id: 0, team: 'vanguard', name: 'GHOST', isPlayer: true, alive: true,
  hp: 100, armor: 0, money: 800, kills: 0, deaths: 0,
  pos: player.state.position, yaw: Math.PI, velX: 0, velZ: 0,
  loadout: createLoadout(), hasSpike: false, mesh: null, bot: null,
  lastDamageAt: -10, deathAt: -10,
};
G.combatants.push(playerCombatant);

// The player's hitbox: three transparent boxes that follow the capsule.
const hitboxMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
const hitHead = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.34, 0.36), hitboxMat);
const hitBody = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.72, 0.4), hitboxMat);
const hitLegs = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.72, 0.38), hitboxMat);
hitHead.userData = { player: true, part: 'head' };
hitBody.userData = { player: true, part: 'body' };
hitLegs.userData = { player: true, part: 'legs' };
scene.add(hitHead, hitBody, hitLegs);

const combat = createCombat(scene, world, effects, audio, (attacker, target, part) => {
  if (attacker.isPlayer) {
    hud.hitmarker(true);
    audio.hitmarker(true);
    hud.addFeed(`You eliminated ${target.name}${part === 'head' ? ' — HEADSHOT' : ''}`, 'good');
  } else if (target.isPlayer) {
    hud.addFeed(`${attacker.name} eliminated you`, 'bad');
  } else if (attacker.team === playerCombatant.team) {
    hud.addFeed(`${attacker.name} eliminated ${target.name}`, 'good');
  } else {
    hud.addFeed(`${attacker.name} eliminated ${target.name}`, 'bad');
  }
  target.deaths += 1;
  rounds.dropSpike(target);
  if (target.isPlayer) {
    input.releaseLock();
    playerCombatant.deathAt = G.time;
  }
});
combat.setPlayerTarget(hitHead);
combat.setPlayerTarget(hitBody);
combat.setPlayerTarget(hitLegs);
combat.setWorldTargets(world.shootables);

const bots = createBots(scene, world, combat, effects, audio, rng);
const hud = createHud({
  onDeploy: () => {
    audio.unlock();
    hud.showMenu(false);
    rounds.startRound();
    input.requestLock();
  },
  onRematch: () => {
    hud.showMatchEnd(false);
    rounds.startMatch();
    hud.showMenu(false);
    rounds.startRound();
    input.requestLock();
  },
  onBuy: (kind, id) => {
    const p = playerCombatant;
    let msg = null;
    if (kind === 'weapon') msg = buyWeapon(p, id);
    else if (kind === 'grenade') msg = buyGrenade(p, id);
    else if (kind === 'armor') msg = buyArmor(p);
    else if (kind === 'ammo') {
      if (p.money >= 200 && p.loadout.reserve.p9 < WEAPONS.p9.reserve) { p.money -= 200; p.loadout.reserve.p9 = WEAPONS.p9.reserve; msg = 'Bought P9 ammo'; }
      else msg = 'Ammo full';
    }
    if (msg) { hud.addFeed(msg, msg.startsWith('Bought') ? 'good' : 'bad'); if (msg.startsWith('Bought')) audio.buy(); else audio.denied(); }
  },
});
const rounds = createRounds({ world, bots, audio, hud, rng, player });
rounds.makeSpikeMesh(scene);

const input = createInput(canvas, (locked) => {
  if (!locked && (G.phase === 'live' || G.phase === 'freeze') && !shotMode) {
    G.paused = true;
    hud.banner('PAUSED', 'Click the game to resume');
  } else if (locked) {
    G.paused = false;
    hud.clearBanner();
  }
});

// The viewmodel: a low-poly rifle built from boxes, parented to the camera.
const gunGroup = new THREE.Group();
{
  const dark = new THREE.MeshStandardMaterial({ color: 0x1c212b, roughness: 0.5, metalness: 0.7 });
  const accent = new THREE.MeshStandardMaterial({ color: 0xf5a524, roughness: 0.4, metalness: 0.5 });
  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.13, 0.5), dark);
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.42), dark);
  barrel.position.set(0, 0.03, -0.42);
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.2, 0.1), dark);
  mag.position.set(0, -0.14, -0.05);
  mag.rotation.x = 0.25;
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.06, 0.1), accent);
  sight.position.set(0, 0.1, -0.1);
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.11, 0.22), dark);
  stock.position.set(0, -0.01, 0.34);
  gunGroup.add(receiver, barrel, mag, sight, stock);
  gunGroup.position.set(0.28, -0.26, -0.5);
  camera.add(gunGroup);
}
const muzzleTip = new THREE.Object3D();
muzzleTip.position.set(0.28, -0.22, -1.0);
camera.add(muzzleTip);

// Grenades in flight: a pool of three, thrown by the player or the bots.
const grenades = [];
for (let i = 0; i < 3; i += 1) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), new THREE.MeshStandardMaterial({ color: 0x222831, roughness: 0.6, metalness: 0.5 }));
  mesh.visible = false;
  scene.add(mesh);
  grenades.push({ active: false, mesh, pos: new THREE.Vector3(), vel: new THREE.Vector3(), type: 'frag', fuse: 0, bounced: false, owner: null });
}
const _gMin = new THREE.Vector3();
const _gMax = new THREE.Vector3();
function throwGrenade(owner, origin, dir, type) {
  const g = grenades.find((x) => !x.active);
  if (!g) return;
  g.active = true;
  g.type = type;
  g.owner = owner;
  g.pos.copy(origin);
  g.vel.copy(dir).multiplyScalar(16);
  g.vel.y += 3.5;
  g.fuse = 1.5;
  g.bounced = false;
  g.mesh.visible = true;
  g.mesh.position.copy(g.pos);
}
function stepGrenades(dt) {
  for (const g of grenades) {
    if (!g.active) continue;
    g.fuse -= dt;
    g.vel.y -= 14 * dt;
    g.pos.addScaledVector(g.vel, dt);
    // Bounce off colliders and the ground.
    _gMin.set(g.pos.x - 0.11, g.pos.y - 0.11, g.pos.z - 0.11);
    _gMax.set(g.pos.x + 0.11, g.pos.y + 0.11, g.pos.z + 0.11);
    for (const c of world.colliders) {
      if (_gMin.x < c.max.x && _gMax.x > c.min.x && _gMin.y < c.max.y && _gMax.y > c.min.y && _gMin.z < c.max.z && _gMax.z > c.min.z) {
        // Reflect the dominant axis.
        const px = Math.min(g.pos.x - c.min.x, c.max.x - g.pos.x);
        const py = Math.min(g.pos.y - c.min.y, c.max.y - g.pos.y);
        const pz = Math.min(g.pos.z - c.min.z, c.max.z - g.pos.z);
        if (py <= px && py <= pz) { g.vel.y = Math.abs(g.vel.y) * 0.45; g.pos.y = c.max.y + 0.11; }
        else if (px <= pz) { g.vel.x *= -0.45; g.pos.x += g.vel.x > 0 ? 0.05 : -0.05; }
        else { g.vel.z *= -0.45; g.pos.z += g.vel.z > 0 ? 0.05 : -0.05; }
        g.bounced = true;
      }
    }
    if (g.pos.y < 0.11) { g.pos.y = 0.11; g.vel.y = Math.abs(g.vel.y) * 0.45; g.vel.x *= 0.7; g.vel.z *= 0.7; g.bounced = true; }
    g.mesh.position.copy(g.pos);
    if (g.fuse <= 0) detonate(g);
  }
}
function detonate(g) {
  g.active = false;
  g.mesh.visible = false;
  if (g.type === 'smoke') {
    effects.smoke(g.pos);
    audio.explosion(20);
    return;
  }
  if (g.type === 'flash') {
    // Blind anyone looking at it with a clear line of sight.
    const p = playerCombatant;
    const toFlash = new THREE.Vector3().copy(g.pos).sub(camera.position);
    const dist = toFlash.length();
    const viewDir = camera.getWorldDirection(new THREE.Vector3());
    if (p.alive && dist < 32 && viewDir.dot(toFlash.normalize()) > 0.1 && !segmentBlocked(camera.position, g.pos, world.colliders, null)) {
      G.flash = Math.min(1, 1.4 - dist / 30);
    }
    for (const i of bots.bots) {
      const c = G.combatants[i];
      if (!c.alive) continue;
      const d = Math.hypot(c.pos.x - g.pos.x, c.pos.z - g.pos.z);
      if (d < 26) { c.bot.blindUntil = G.time + 2; c.bot.target = null; }
    }
    audio.beep(true);
    return;
  }
  // Frag: radial damage with line-of-sight, then the show.
  effects.explosion(g.pos);
  audio.explosion(Math.hypot(g.pos.x - camera.position.x, g.pos.z - camera.position.z));
  G.shake = Math.min(1, G.shake + 0.5);
  for (const c of G.combatants) {
    if (!c.alive || c === g.owner) continue;
    const d = Math.hypot(c.pos.x - g.pos.x, c.pos.y + 1 - g.pos.y, c.pos.z - g.pos.z);
    if (d > 7) continue;
    const chest = new THREE.Vector3(c.pos.x, c.pos.y + 1.1, c.pos.z);
    if (segmentBlocked(g.pos, chest, world.colliders, null)) continue;
    const dmg = 120 * (1 - d / 7) + 10;
    combat.applyDamage(c, dmg, 'body', g.owner);
  }
}

// --- Firing ---
const _origin = new THREE.Vector3();
const _dir = new THREE.Vector3();
let switchAt = 0;
let stepSounds = 0;

function playerFire(now) {
  const p = playerCombatant;
  const loadout = p.loadout;
  const w = currentWeapon(loadout);
  if (loadout.reloading || now < loadout.cooldown || now < switchAt) return;
  if (loadout.mag[w.id] <= 0) {
    audio.dryFire();
    loadout.cooldown = now + 0.3;
    startReload(loadout, now);
    return;
  }
  loadout.mag[w.id] -= 1;
  loadout.cooldown = now + w.interval;
  const moveSpeed = player.groundSpeed();
  const spread = spreadFor(w, moveSpeed, player.state.crouched, !player.state.onGround, loadout.bloom, loadout.scoped);
  camera.getWorldPosition(_origin);
  camera.getWorldDirection(_dir);
  const hits = combat.fire(p, _origin, _dir, spread, rng);
  for (const h of hits) {
    const res = combat.applyDamage(h.target, h.damage, h.part, p);
    if (res) {
      hud.hitmarker(res === 'kill');
      audio.hitmarker(res === 'kill');
      if (res === 'kill') hud.addFeed(`You eliminated ${h.target.name}${h.part === 'head' ? ' — HEADSHOT' : ''}`, 'good');
    }
  }
  loadout.bloom = Math.min(0.05, loadout.bloom + w.bloom);
  player.recoil(w.recoil * (1 + rng() * 0.4), (rng() - 0.5) * w.recoil * 0.7);
  muzzleTip.getWorldPosition(_origin);
  effects.muzzle(_origin);
  audio.shot(w.sound, 0, true);
  bots.hearShot(p.pos);
  G.shake = Math.min(1, G.shake + 0.08);
  gunGroup.position.z = -0.5 + 0.09; // kick; eased back in the render step
  if (loadout.mag[w.id] === 0) startReload(loadout, now);
}

// --- Fixed-step simulation ---
let lastTime = performance.now();
let acc = 0;
const STEP = 1 / 60;
let shotSteps = 0;
let shotReady = false;

function step(now) {
  const dt = STEP;
  G.time = now;
  const p = playerCombatant;
  // Pointer look.
  if (input.state.locked) {
    const look = input.takeLook();
    const sens = p.loadout.scoped ? 0.45 : 1;
    player.look(look.x, look.y, sens * G.settings.sensitivity);
    p.yaw = player.state.yaw;
  }
  // Movement (only while alive and in a playing phase).
  if (p.alive && (G.phase === 'live' || G.phase === 'freeze')) {
    player.step(dt, input.state.keys, WEAPONS[p.loadout.current].speed);
  }
  p.velX = player.state.velocity.x;
  p.velZ = player.state.velocity.z;
  // Hitboxes follow the capsule.
  const eyeY = p.pos.y + player.state.eye;
  hitHead.position.set(p.pos.x, p.pos.y + player.state.height - 0.17, p.pos.z);
  hitBody.position.set(p.pos.x, p.pos.y + player.state.height - 0.7, p.pos.z);
  hitLegs.position.set(p.pos.x, p.pos.y + 0.36, p.pos.z);

  // Key presses.
  for (const code of input.takePresses()) {
    if (code === 'KeyR') { if (startReload(p.loadout, now)) audio.reload(); }
    else if (code === 'Digit1' && p.loadout.primary) { p.loadout.current = p.loadout.primary; p.loadout.scoped = false; switchAt = now + 0.4; }
    else if (code === 'Digit2') { p.loadout.current = 'p9'; p.loadout.scoped = false; switchAt = now + 0.4; }
    else if (code === 'KeyB') hud.toggleBuy();
    else if (code === 'KeyQ') {
      const order = ['frag', 'smoke', 'flash'];
      const i = order.indexOf(p.loadout.selectedGrenade);
      p.loadout.selectedGrenade = order[(i + 1) % order.length];
      hud.addFeed(`Selected ${p.loadout.selectedGrenade} grenade`, '');
    }
    else if (code === 'KeyG') {
      const type = p.loadout.selectedGrenade;
      if (p.loadout.grenades[type] > 0 && (G.phase === 'live')) {
        p.loadout.grenades[type] -= 1;
        camera.getWorldPosition(_origin);
        camera.getWorldDirection(_dir);
        throwGrenade(p, _origin.clone().addScaledVector(_dir, 0.5), _dir, type);
        audio.click();
      }
    }
    else if (code === 'KeyM') audio.setMuted(!G.settings.muted);
    else if (code === 'Digit3' || code === 'Digit4' || code === 'Digit5' || code === 'Digit6' || code === 'Digit7' || code === 'Digit8' || code === 'Digit9') {
      const map = { Digit3: ['weapon', 'lw88'], Digit4: ['weapon', 'm12'], Digit5: ['ammo', 'p9'], Digit6: ['armor', 'armor'], Digit7: ['grenade', 'frag'], Digit8: ['grenade', 'smoke'], Digit9: ['grenade', 'flash'] };
      const [kind, id] = map[code];
      hud.onBuyRef ? hud.onBuyRef(kind, id) : null;
    }
  }
  // Wheel cycles weapons.
  const wheel = input.takeWheel();
  if (wheel !== 0 && p.loadout.primary) {
    p.loadout.current = p.loadout.current === 'p9' ? p.loadout.primary : 'p9';
    p.loadout.scoped = false;
    switchAt = now + 0.4;
  }
  // ADS.
  const w = currentWeapon(p.loadout);
  p.loadout.scoped = input.state.firingAlt && w.zoom > 1 && !p.loadout.reloading;
  // Firing.
  if (input.state.firing && p.alive && (G.phase === 'live' || G.phase === 'freeze')) {
    if (w.auto) playerFire(now);
    else if (!playerFire._held) playerFire(now);
  }
  playerFire._held = input.state.firing;
  // Reload completion.
  if (p.loadout.reloading && now >= p.loadout.reloadEnd) {
    finishReload(p.loadout);
    audio.click();
  }
  // Bloom decay.
  p.loadout.bloom = Math.max(0, p.loadout.bloom - dt * 0.03);
  // Objective channel (plant / defuse).
  rounds.playerObjective(dt, input.state.keys.has('KeyE'));
  // Bots, grenades, round logic.
  if (G.phase === 'live' || G.phase === 'freeze') bots.step(now, dt, rng);
  stepGrenades(dt);
  rounds.step(dt);
  effects.update(dt);
  // Footsteps.
  const speed = player.groundSpeed();
  if (p.alive && player.state.onGround && speed > 2) {
    stepSounds += dt * speed;
    if (stepSounds > 2.4) { stepSounds = 0; audio.footstep(speed > 4); }
  }
  // Flash decay and shake decay.
  G.flash = Math.max(0, G.flash - dt * 0.45);
  G.shake = Math.max(0, G.shake - dt * 2.2);
  // Match end / menu overlays.
  if (G.phase === 'matchEnd' && !hud._matchShown) {
    hud._matchShown = true;
    hud.showMatchEnd(true, G.matchWinner, `Score ${G.wins.vanguard} – ${G.wins.ember} · Rounds ${G.round}`);
    input.releaseLock();
  }
  if (G.phase !== 'matchEnd') hud._matchShown = false;
}

// --- Render ---
const _camPos = new THREE.Vector3();
function render(dt) {
  const p = playerCombatant;
  const st = player.state;
  const bob = Math.sin(st.bobPhase * 2) * 0.03 * Math.min(1, player.groundSpeed() / 4.6);
  const shakeAmp = G.shake * 0.05;
  const eye = p.alive ? st.eye : 0.5; // death cam: the view drops to the ground
  _camPos.set(
    st.position.x + (Math.random() - 0.5) * shakeAmp,
    st.position.y + eye + bob + (Math.random() - 0.5) * shakeAmp,
    st.position.z + (Math.random() - 0.5) * shakeAmp,
  );
  camera.position.copy(_camPos);
  camera.rotation.set(0, 0, 0);
  camera.rotateY(st.yaw + st.recoilYaw);
  camera.rotateX(st.pitch + st.recoilPitch);
  // FOV: scope zoom or a touch of ADS zoom.
  const w = currentWeapon(p.loadout);
  const targetFov = p.loadout.scoped ? 70 / w.zoom : input.state.firingAlt ? 55 : 70;
  camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 12);
  camera.updateProjectionMatrix();
  // Viewmodel kick recovery and bob.
  gunGroup.position.z += (-0.5 - gunGroup.position.z) * Math.min(1, dt * 14);
  gunGroup.position.y = -0.26 + Math.sin(st.bobPhase * 2) * 0.008 * Math.min(1, player.groundSpeed() / 4.6);
  if (p.loadout.reloading) gunGroup.rotation.x = 0.5;
  else gunGroup.rotation.x = 0;
  renderer.render(scene, camera);
}

function frame(nowMs) {
  requestAnimationFrame(frame);
  const now = nowMs / 1000;
  let dt = (nowMs - lastTime) / 1000;
  lastTime = nowMs;
  if (dt > 0.25) dt = 0.25;
  if (!G.paused) {
    acc += dt;
    let n = 0;
    while (acc >= STEP && n < 5) {
      step(G.time + STEP);
      acc -= STEP;
      n += 1;
    }
    if (n === 5) acc = 0;
  }
  const spread = spreadFor(currentWeapon(playerCombatant.loadout), player.groundSpeed(), player.state.crouched, !player.state.onGround, playerCombatant.loadout.bloom, playerCombatant.loadout.scoped);
  hud.update(dt, player, spread);
  hud.updateScoreboard(input.state.keys.has('Tab'));
  render(dt);
  if (shotMode && !shotReady) {
    shotSteps += 1;
    if (shotSteps > 6) { shotReady = true; window.__shotReady = true; }
  }
}

// --- Shot staging ---
function stageShot() {
  if (shotMode === 'start') {
    rounds.startMatch();
    rounds.startRound();
    G.phase = 'menu'; // freeze the timer behind the menu
    hud.showMenu(true);
    // Menu camera: a slow orbit is faked by a fixed vantage over the yard.
    player.reset(-6, 26, -0.2);
    player.state.pitch = -0.08;
    camera.position.set(-6, 3.2, 26);
  } else if (shotMode === 'play') {
    rounds.startMatch();
    hud.showMenu(false);
    rounds.startRound();
    G.phase = 'live';
    G.phaseAt = G.time;
    // The player pushes mid with a rifle; two bots trade fire ahead.
    playerCombatant.loadout.primary = 'vk47';
    playerCombatant.loadout.current = 'vk47';
    playerCombatant.loadout.mag.vk47 = WEAPONS.vk47.mag;
    playerCombatant.loadout.reserve.vk47 = WEAPONS.vk47.reserve;
    player.reset(-2, 16, -0.1);
    player.state.pitch = -0.02;
    // Stage two bots in view, mid-fight with each other (not the player):
    // one on A Long, one on B Long, both clear of the mid platform.
    const ember = bots.bots.filter((i) => G.combatants[i].team === 'ember');
    const vg = bots.bots.filter((i) => G.combatants[i].team === 'vanguard');
    if (ember[0] !== undefined && vg[0] !== undefined) {
      const e = G.combatants[ember[0]]; const v = G.combatants[vg[0]];
      e.pos.set(-9, 0, -4); e.yaw = 0.6; e.bot.state = 'engage'; e.bot.target = vg[0]; e.bot.reactAt = 0;
      v.pos.set(8, 0, 6); v.yaw = Math.PI - 0.6; v.bot.state = 'engage'; v.bot.target = ember[0]; v.bot.reactAt = 0;
    }
    if (ember[1] !== undefined) { const c = G.combatants[ember[1]]; c.pos.set(6, 0, -10); c.yaw = Math.PI * 0.5; }
  } else if (shotMode === 'buy') {
    rounds.startMatch();
    hud.showMenu(false);
    rounds.startRound();
    player.reset(-24, 22, -0.05);
    hud.showBuy(true);
  } else if (shotMode === 'end') {
    rounds.startMatch();
    hud.showMenu(false);
    rounds.startRound();
    G.phase = 'roundEnd';
    G.phaseAt = G.time;
    G.wins.vanguard = 3;
    G.wins.ember = 2;
    hud.banner('ROUND WON', 'Enemy team eliminated');
    player.reset(-10, 14, -0.6);
  }
  // Run the sim a little so the scene is alive before the screenshot.
  // __shotReady is set by the frame loop only after real renders.
  for (let i = 0; i < 120; i += 1) step(G.time + STEP);
  if (shotMode === 'play') {
    // The staged bots walk off (or die) during the sim, so re-frame them into
    // the open mid-south ground for the cover, duelling each other. Revive them
    // if the staging fight killed them — this is a screenshot set-up only.
    const ember = bots.bots.filter((i) => G.combatants[i].team === 'ember');
    const vg = bots.bots.filter((i) => G.combatants[i].team === 'vanguard');
    if (ember[0] !== undefined && vg[0] !== undefined) {
      const e = G.combatants[ember[0]]; const v = G.combatants[vg[0]];
      for (const [c, x, z, yaw] of [[e, -6, 6, 0.9], [v, 4, 5, Math.PI - 0.9]]) {
        c.alive = true; c.hp = 100;
        c.pos.set(x, 0, z); c.yaw = yaw;
        c.mesh.visible = true; c.mesh.rotation.set(0, yaw, 0); c.mesh.position.copy(c.pos);
      }
      e.bot.state = 'engage'; e.bot.target = vg[0]; e.bot.reactAt = 0; e.bot.lastSeenAt = G.time;
      v.bot.state = 'engage'; v.bot.target = ember[0]; v.bot.reactAt = 0; v.bot.lastSeenAt = G.time;
    }
  }
  // The round-start banner would cover the action/buy shots: clear it here
  // (the 'end' shot keeps its ROUND WON banner on purpose).
  if (shotMode === 'play' || shotMode === 'buy') hud.clearBanner();
}

// --- Boot ---
rounds.startMatch();
hud.showMenu(true);
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
canvas.addEventListener('click', () => {
  if ((G.phase === 'live' || G.phase === 'freeze') && !input.state.locked && !shotMode) input.requestLock();
});
if (shotMode) stageShot();
// Debug handle: inspect the live scene from the console.
window.__helix = { scene, G, bots, player, combatants: G.combatants };
requestAnimationFrame(frame);
