// HELIX BREACH — the visible feedback: tracers, impact sparks, muzzle flashes,
// smoke that actually blocks sight, and explosions. One tracer pool and one
// particle pool, both reused every frame — nothing is allocated in the hot loop.
import * as THREE from 'three';

const TRACERS = 24;
const PARTICLES = 256;

export function createEffects(scene, textures) {
  // Tracer pool: thin additive lines that fade in ~70 ms.
  const tracers = [];
  for (let i = 0; i < TRACERS; i += 1) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const mat = new THREE.LineBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    const line = new THREE.Line(geo, mat);
    line.frustumCulled = false;
    scene.add(line);
    tracers.push({ line, life: 0 });
  }
  let tracerI = 0;

  // Particle pool: one Points cloud, positions/velocities/life in flat arrays.
  const pGeo = new THREE.BufferGeometry();
  const pPos = new Float32Array(PARTICLES * 3);
  const pCol = new Float32Array(PARTICLES * 3);
  for (let i = 0; i < PARTICLES; i += 1) pPos[i * 3 + 1] = -100;
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
  const pMat = new THREE.PointsMaterial({ size: 0.09, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false });
  const points = new THREE.Points(pGeo, pMat);
  points.frustumCulled = false;
  scene.add(points);
  const pVel = new Float32Array(PARTICLES * 3);
  const pLife = new Float32Array(PARTICLES);
  let particleI = 0;

  // Muzzle flash: one sprite + one light, moved to whoever just fired.
  const flashMat = new THREE.SpriteMaterial({ map: textures.flash, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const flashSprite = new THREE.Sprite(flashMat);
  flashSprite.scale.set(0.7, 0.7, 1);
  scene.add(flashSprite);
  const flashLight = new THREE.PointLight(0xffc46b, 0, 12, 2);
  scene.add(flashLight);
  let flashLife = 0;

  // Smoke clouds: sprite clusters that grow, drift and block line of sight.
  const smokes = [];
  const smokeClouds = []; // {x,y,z,r} — combat's LOS test consults these.

  function spawnParticle(x, y, z, vx, vy, vz, life, r, g, b) {
    const i = particleI;
    particleI = (particleI + 1) % PARTICLES;
    pPos[i * 3] = x; pPos[i * 3 + 1] = y; pPos[i * 3 + 2] = z;
    pVel[i * 3] = vx; pVel[i * 3 + 1] = vy; pVel[i * 3 + 2] = vz;
    pLife[i] = life;
    pCol[i * 3] = r; pCol[i * 3 + 1] = g; pCol[i * 3 + 2] = b;
  }

  return {
    smokeClouds,
    tracer(a, b) {
      const t = tracers[tracerI];
      tracerI = (tracerI + 1) % TRACERS;
      const arr = t.line.geometry.attributes.position.array;
      arr[0] = a.x; arr[1] = a.y; arr[2] = a.z;
      arr[3] = b.x; arr[4] = b.y; arr[5] = b.z;
      t.line.geometry.attributes.position.needsUpdate = true;
      t.line.material.opacity = 0.9;
      t.life = 0.07;
    },
    impact(point, normal) {
      for (let i = 0; i < 10; i += 1) {
        const s = 1.5 + Math.random() * 3;
        spawnParticle(point.x, point.y, point.z,
          normal.x * s + (Math.random() - 0.5) * 2, normal.y * s + Math.random() * 2.5, normal.z * s + (Math.random() - 0.5) * 2,
          0.25 + Math.random() * 0.3, 1, 0.75, 0.3);
      }
    },
    muzzle(pos) {
      flashSprite.position.copy(pos);
      flashSprite.material.opacity = 1;
      flashSprite.material.rotation = Math.random() * Math.PI;
      flashLight.position.copy(pos);
      flashLight.intensity = 60;
      flashLife = 0.05;
    },
    explosion(pos) {
      for (let i = 0; i < 60; i += 1) {
        const a = Math.random() * Math.PI * 2;
        const e = Math.random() * Math.PI;
        const s = 3 + Math.random() * 9;
        spawnParticle(pos.x, pos.y + 0.3, pos.z,
          Math.sin(e) * Math.cos(a) * s, Math.abs(Math.cos(e)) * s * 0.9 + 2, Math.sin(e) * Math.sin(a) * s,
          0.5 + Math.random() * 0.7, 1, 0.45 + Math.random() * 0.3, 0.12);
      }
      flashSprite.position.copy(pos);
      flashSprite.scale.set(4, 4, 1);
      flashSprite.material.opacity = 1;
      flashLight.position.copy(pos);
      flashLight.intensity = 400;
      flashLife = 0.16;
    },
    smoke(pos) {
      const group = new THREE.Group();
      for (let i = 0; i < 9; i += 1) {
        const mat = new THREE.SpriteMaterial({ map: textures.smoke, transparent: true, opacity: 0.55, depthWrite: false });
        const sp = new THREE.Sprite(mat);
        sp.position.set((Math.random() - 0.5) * 2.4, (Math.random() - 0.5) * 1.4 + 1.2, (Math.random() - 0.5) * 2.4);
        sp.scale.set(2.2, 2.2, 1);
        group.add(sp);
      }
      group.position.copy(pos);
      scene.add(group);
      const cloud = { x: pos.x, y: pos.y + 1.2, z: pos.z, r: 3.2 };
      smokeClouds.push(cloud);
      smokes.push({ group, life: 12, cloud });
    },
    update(dt) {
      for (const t of tracers) {
        if (t.life > 0) {
          t.life -= dt;
          t.line.material.opacity = Math.max(0, t.life / 0.07) * 0.9;
        }
      }
      let any = false;
      for (let i = 0; i < PARTICLES; i += 1) {
        if (pLife[i] <= 0) continue;
        any = true;
        pLife[i] -= dt;
        if (pLife[i] <= 0) { pPos[i * 3 + 1] = -100; continue; }
        pVel[i * 3 + 1] -= 9 * dt;
        pPos[i * 3] += pVel[i * 3] * dt;
        pPos[i * 3 + 1] += pVel[i * 3 + 1] * dt;
        pPos[i * 3 + 2] += pVel[i * 3 + 2] * dt;
        if (pPos[i * 3 + 1] < 0.02) { pPos[i * 3 + 1] = 0.02; pVel[i * 3 + 1] = 0; }
      }
      if (any) {
        pGeo.attributes.position.needsUpdate = true;
        pGeo.attributes.color.needsUpdate = true;
      }
      if (flashLife > 0) {
        flashLife -= dt;
        flashSprite.material.opacity = Math.max(0, flashLife / 0.16);
        flashLight.intensity = Math.max(0, flashLife / 0.16) * 120;
        if (flashLife <= 0) flashSprite.scale.set(0.7, 0.7, 1);
      }
      for (let i = smokes.length - 1; i >= 0; i -= 1) {
        const s = smokes[i];
        s.life -= dt;
        const grow = 1 + (12 - Math.max(0, s.life)) * 0.12;
        for (const sp of s.group.children) sp.scale.set(2.2 * grow, 2.2 * grow, 1);
        if (s.life <= 0) {
          scene.remove(s.group);
          const ci = smokeClouds.indexOf(s.cloud);
          if (ci >= 0) smokeClouds.splice(ci, 1);
          smokes.splice(i, 1);
        }
      }
    },
    reset() {
      for (const t of tracers) { t.life = 0; t.line.material.opacity = 0; }
      for (let i = 0; i < PARTICLES; i += 1) { pLife[i] = 0; pPos[i * 3 + 1] = -100; }
      pGeo.attributes.position.needsUpdate = true;
      for (const s of smokes) scene.remove(s.group);
      smokes.length = 0;
      smokeClouds.length = 0;
    },
  };
}
