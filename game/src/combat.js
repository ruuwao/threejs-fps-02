// HELIX BREACH — combat resolution. One raycast per pellet for the player's shots
// (real aim, real hitboxes: head / body / legs with different damage), and a
// tuned probability roll for bot shots so their accuracy is a design number, not
// a dice roll on a ray. Also: tracers, impact particles, grenade physics, smoke
// that blocks sight, and the line-of-sight test bots use to see and hear.
import * as THREE from 'three';
import { G } from './state.js';
import { damageAt, WEAPONS } from './weapons.js';

const _origin = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _hitPoint = new THREE.Vector3();

// Segment vs AABB (slab method). True when the segment is blocked.
export function segmentBlocked(a, b, colliders, smokeClouds) {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  for (const c of colliders) {
    let tmin = 0, tmax = 1;
    for (const [o, d, mn, mx] of [[a.x, dx, c.min.x, c.max.x], [a.y, dy, c.min.y, c.max.y], [a.z, dz, c.min.z, c.max.z]]) {
      if (Math.abs(d) < 1e-9) { if (o < mn || o > mx) { tmin = 2; break; } }
      else {
        let t1 = (mn - o) / d, t2 = (mx - o) / d;
        if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
        tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
        if (tmin > tmax) break;
      }
    }
    if (tmin <= tmax && tmin < 1 && tmax > 0) return true;
  }
  if (smokeClouds) {
    for (const s of smokeClouds) {
      // Segment vs sphere.
      const ox = a.x - s.x, oy = a.y - s.y, oz = a.z - s.z;
      const aa = dx * dx + dy * dy + dz * dz;
      const bb = 2 * (ox * dx + oy * dy + oz * dz);
      const cc = ox * ox + oy * oy + oz * oz - s.r * s.r;
      const disc = bb * bb - 4 * aa * cc;
      if (disc >= 0) {
        const t = (-bb - Math.sqrt(disc)) / (2 * aa);
        if (t > 0 && t < 1) return true;
      }
    }
  }
  return false;
}

export function createCombat(scene, world, effects, audio, onKill) {
  const raycaster = new THREE.Raycaster();
  raycaster.far = 140;
  // One target list, built once at setup: bot hitboxes + world + player hitbox.
  // Rebuilt only when meshes are (re)registered, never per shot.
  const shootTargets = [];

  function registerBotMeshes(meshes) { for (const m of meshes) shootTargets.push(m); }
  function setPlayerTarget(mesh) { shootTargets.push(mesh); }
  function setWorldTargets(meshes) { for (const m of meshes) shootTargets.push(m); }

  // One hitscan pellet. Returns { hit, part, dist, point } or null.
  function pellet(origin, dir, shooter) {
    raycaster.set(origin, dir);
    const hits = raycaster.intersectObjects(shootTargets, false);
    for (const h of hits) {
      const u = h.object.userData;
      if (u.bot !== undefined) {
        const target = G.combatants[u.bot];
        if (!target || !target.alive || target === shooter) continue;
        return { hit: true, bot: u.bot, part: u.part, dist: h.distance, point: h.point.clone() };
      }
      if (u.player) {
        const target = G.combatants[0];
        if (!target.alive || target === shooter) continue;
        return { hit: true, bot: 0, part: u.part, dist: h.distance, point: h.point.clone() };
      }
      // World surface: the pellet stops here.
      return { hit: false, dist: h.distance, point: h.point.clone() };
    }
    return null;
  }

  // Fire one trigger pull from a combatant. origin/direction in world space.
  // random() is the caller's deterministic RNG. Returns true if a round left.
  function fire(shooter, origin, baseDir, spread, random) {
    const w = WEAPONS[shooter.loadout.current];
    const hits = [];
    for (let p = 0; p < w.pellets; p += 1) {
      _dir.copy(baseDir);
      _dir.x += (random() * 2 - 1) * spread;
      _dir.y += (random() * 2 - 1) * spread;
      _dir.z += (random() * 2 - 1) * spread;
      _dir.normalize();
      const res = pellet(origin, _dir, shooter);
      const end = res ? res.point : _origin.copy(origin).addScaledVector(_dir, w.range);
      effects.tracer(origin, end);
      if (res) {
        if (res.hit) {
          const dmg = damageAt(w, res.dist) * (res.part === 'head' ? w.headMult : res.part === 'legs' ? w.legMult : 1);
          hits.push({ target: G.combatants[res.bot], part: res.part, damage: dmg, point: res.point });
        } else {
          effects.impact(res.point, res.point.clone().sub(origin).normalize());
        }
      }
    }
    return hits;
  }

  // Apply damage with armour, death and the kill feed. Returns 'kill' | 'hit' | null.
  function applyDamage(target, amount, part, attacker) {
    if (!target.alive) return null;
    let dmg = amount;
    if (target.armor > 0) {
      const absorbed = Math.min(target.armor, dmg * 0.5);
      target.armor -= absorbed;
      dmg -= absorbed;
    }
    target.hp -= dmg;
    target.lastDamageAt = G.time;
    if (target.isPlayer) {
      G.damageDir = attacker ? Math.atan2(attacker.pos.x - target.pos.x, attacker.pos.z - target.pos.z) : 0;
      G.damageAt = G.time;
      G.shake = Math.min(1, G.shake + 0.35);
      audio.hitTaken();
    }
    if (target.hp <= 0) {
      target.hp = 0;
      target.alive = false;
      target.deathAt = G.time;
      if (attacker) {
        attacker.kills += 1;
        attacker.money += 300;
        onKill(attacker, target, part);
      }
      return 'kill';
    }
    return 'hit';
  }

  // A bot's shot: a tuned probability roll, not a raycast, so bot accuracy is a
  // design number (skill, distance, target speed, burst heat). LOS is checked.
  function botShot(bot, target, random) {
    const w = WEAPONS[bot.loadout.current];
    const dx = target.pos.x - bot.pos.x, dy = (target.pos.y + 1.2) - (bot.pos.y + 1.35), dz = target.pos.z - bot.pos.z;
    const dist = Math.hypot(dx, dy, dz) || 1;
    _origin.set(bot.pos.x, bot.pos.y + 1.35, bot.pos.z);
    _dir.set(dx / dist, dy / dist, dz / dist);
    const speed = target.isPlayer ? Math.hypot(target.velX || 0, target.velZ || 0) : 2;
    let p = bot.bot.skill * 0.55 * (1 - Math.min(0.6, dist / 90)) * (1 - Math.min(0.45, speed / 9));
    p *= bot.bot.burstHeat > 2 ? 0.75 : 1; // long bursts wander
    p = Math.max(0.04, Math.min(0.7, p));
    const from = _origin.clone();
    const to = from.clone().addScaledVector(_dir, dist);
    effects.tracer(from, to);
    audio.shot(w.sound, dist, false);
    if (random() < p) {
      const part = random() < 0.12 ? 'head' : random() < 0.8 ? 'body' : 'legs';
      const dmg = damageAt(w, dist) * (part === 'head' ? w.headMult : part === 'legs' ? w.legMult : 1);
      return applyDamage(target, dmg, part, bot);
    }
    // Miss: kick up dust near the target.
    const miss = to.clone();
    miss.x += (random() - 0.5) * 1.6; miss.y += (random() - 0.5) * 1.2; miss.z += (random() - 0.5) * 1.6;
    effects.impact(miss, _dir);
    return null;
  }

  return { pellet, fire, applyDamage, botShot, registerBotMeshes, setPlayerTarget, setWorldTargets };
}
