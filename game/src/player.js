// The human player: a capsule approximated by an AABB, moved with acceleration and
// friction, resolved against the map's AABB colliders one axis at a time, with a
// step-up so crates and platform steps can be climbed. Crouching lowers the eye
// and the capsule; jumping is a single vertical impulse with gravity.
import * as THREE from 'three';

const HALF = 0.38; // half-width of the capsule
const STAND_HEIGHT = 1.72;
const CROUCH_HEIGHT = 1.15;
const EYE_STAND = 1.62;
const EYE_CROUCH = 1.02;
const STEP_UP = 0.75;
const GRAVITY = 22;

export function createPlayer(colliders) {
  const state = {
    position: new THREE.Vector3(0, 0, 20), // feet
    velocity: new THREE.Vector3(),
    yaw: 0, pitch: 0,
    eye: EYE_STAND,
    height: STAND_HEIGHT,
    crouched: false,
    onGround: true,
    recoilPitch: 0, recoilYaw: 0,
    bobPhase: 0,
  };

  // Write the capsule box into a target box (no allocation in the hot loop).
  function setBox(target, px, py, pz, height) {
    target.min.set(px - HALF, py, pz - HALF);
    target.max.set(px + HALF, py + height, pz + HALF);
    return target;
  }

  // Move the capsule by (dx, dy, dz), resolving collisions per axis. Returns whether
  // the feet ended on the ground. A collider the capsule already overlapped before
  // this axis moved is never resolved on this axis — that overlap belongs to the
  // other axis, and resolving it here is what used to teleport the capsule through
  // walls. On x/z a blocked move is reverted (the capsule slides along the wall);
  // on y it lands on top or bonks its head.
  const scratch = new THREE.Box3();
  const oldBox = new THREE.Box3();
  const liftedBox = new THREE.Box3();
  function moveAxis(axis, delta) {
    if (delta === 0) return false;
    const p = state.position;
    const oldVal = axis === 0 ? p.x : axis === 1 ? p.y : p.z;
    if (axis === 0) p.x += delta;
    else if (axis === 1) p.y += delta;
    else p.z += delta;
    setBox(oldBox, axis === 0 ? oldVal : p.x, axis === 1 ? oldVal : p.y, axis === 2 ? oldVal : p.z, state.height);
    setBox(scratch, p.x, p.y, p.z, state.height);
    for (const c of colliders) {
      if (!scratch.intersectsBox(c)) continue;
      if (oldBox.intersectsBox(c)) continue; // already overlapping: not this axis's doing
      if (axis === 1) {
        if (delta < 0) { p.y = c.max.y; state.onGround = true; }
        else p.y = c.min.y - state.height;
        state.velocity.y = 0;
      } else {
        // Step-up: if the blocker top is close above the feet and there is headroom,
        // lift the capsule onto it instead of stopping.
        const rise = c.max.y - p.y;
        if (rise > 0 && rise <= STEP_UP) {
          setBox(liftedBox, p.x, p.y + rise, p.z, state.height);
          let blocked = false;
          for (const c2 of colliders) {
            if (c2 !== c && liftedBox.intersectsBox(c2)) { blocked = true; break; }
          }
          if (!blocked) { p.y += rise; state.onGround = true; setBox(scratch, p.x, p.y, p.z, state.height); continue; }
        }
        // Revert this axis: the capsule slides along the wall instead of being
        // clamped to a face it never approached.
        if (axis === 0) p.x = oldVal;
        else p.z = oldVal;
        setBox(scratch, p.x, p.y, p.z, state.height);
      }
      setBox(scratch, p.x, p.y, p.z, state.height);
    }
    return true;
  }

  return {
    state,
    reset(x, z, yaw) {
      state.position.set(x, 0, z);
      state.velocity.set(0, 0, 0);
      state.yaw = yaw; state.pitch = 0;
      state.crouched = false; state.height = STAND_HEIGHT; state.eye = EYE_STAND;
      state.recoilPitch = 0; state.recoilYaw = 0; state.onGround = true;
    },
    look(dx, dy, sensitivity) {
      state.yaw -= dx * 0.0021 * sensitivity;
      state.pitch -= dy * 0.0021 * sensitivity;
      const lim = 1.55;
      state.pitch = Math.max(-lim, Math.min(lim, state.pitch));
    },
    recoil(pitch, yaw) { state.recoilPitch += pitch; state.recoilYaw += yaw; },
    groundSpeed() {
      return Math.hypot(state.velocity.x, state.velocity.z);
    },
    step(dt, keys, speedScale) {
      const p = state;
      const crouch = keys.has('ControlLeft') || keys.has('ControlRight');
      const wantHeight = crouch ? CROUCH_HEIGHT : STAND_HEIGHT;
      p.crouched = crouch;
      p.height += (wantHeight - p.height) * Math.min(1, dt * 14);
      p.eye += ((crouch ? EYE_CROUCH : EYE_STAND) - p.eye) * Math.min(1, dt * 14);

      const walk = keys.has('ShiftLeft') || keys.has('ShiftRight');
      const base = 4.6 * speedScale * (crouch ? 0.42 : walk ? 0.52 : 1);
      const fwd = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
      const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
      const sin = Math.sin(p.yaw); const cos = Math.cos(p.yaw);
      let mx = (-sin * fwd + cos * strafe);
      let mz = (-cos * fwd - sin * strafe);
      const len = Math.hypot(mx, mz) || 1;
      mx /= len; mz /= len;
      const mag = (fwd !== 0 || strafe !== 0) ? 1 : 0;
      // Acceleration toward the wish velocity, friction when no input.
      const accel = p.onGround ? 42 : 8;
      p.velocity.x += mx * base * mag * accel * dt;
      p.velocity.z += mz * base * mag * accel * dt;
      if (p.onGround) {
        const damp = Math.max(0, 1 - dt * (mag ? 6 : 11));
        p.velocity.x *= damp; p.velocity.z *= damp;
        const sp = Math.hypot(p.velocity.x, p.velocity.z);
        if (sp > base) { p.velocity.x *= base / sp; p.velocity.z *= base / sp; }
      }
      if ((keys.has('Space')) && p.onGround) {
        p.velocity.y = 7.6; p.onGround = false;
      }
      p.velocity.y -= GRAVITY * dt;
      p.onGround = false;
      moveAxis(0, p.velocity.x * dt);
      moveAxis(2, p.velocity.z * dt);
      moveAxis(1, p.velocity.y * dt);
      if (p.position.y < 0) { p.position.y = 0; p.velocity.y = 0; p.onGround = true; }
      // Recoil recovery + head bob.
      p.recoilPitch *= Math.max(0, 1 - dt * 9);
      p.recoilYaw *= Math.max(0, 1 - dt * 9);
      const sp2 = Math.hypot(p.velocity.x, p.velocity.z);
      if (p.onGround && sp2 > 0.5) p.bobPhase += dt * sp2 * 1.6;
    },
  };
}
