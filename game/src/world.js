// HELIX BREACH — the map: Helix Yard, a dusk industrial yard, 64 x 48 m.
// Two lanes (A Long west, B Long east), a mid corridor with a climbable platform,
// and two bomb sites: A REACTOR (west-north) and B DEPOT (east-north).
// Everything is data: boxes with a material tag, a waypoint graph bots walk on,
// spawn points and site zones. No imported models, no network.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

// [x, y, z, w, h, d, material, collide?] — y is the box centre.
const BOXES = [
  // Outer walls + ground
  [0, 2.5, -24.3, 64.6, 5, 0.6, 'wall'],
  [0, 2.5, 24.3, 64.6, 5, 0.6, 'wall'],
  [-32.3, 2.5, 0, 0.6, 5, 48.6, 'wall'],
  [32.3, 2.5, 0, 0.6, 5, 48.6, 'wall'],
  [0, -0.2, 0, 64.6, 0.4, 48.6, 'ground'],
  // Site A — REACTOR (west-north)
  [-26, 2, -19, 6, 4, 3, 'wallDark'],
  [-22, 3.2, -19.5, 8, 0.8, 0.8, 'containerTeal'],
  [-22, 0.55, -9.5, 10, 1.1, 0.6, 'wall'],
  [-18, 0.55, -16, 1.2, 1.1, 1.2, 'crate'],
  [-26, 0.55, -12, 1.2, 1.1, 1.2, 'crate'],
  [-20, 1.1, -18, 1.2, 2.2, 1.2, 'crate'],
  [-28, 1.2, -15, 2.4, 2.4, 6, 'containerBlue'],
  // Site B — DEPOT (east-north)
  [26, 1.2, -17, 6, 2.4, 2.4, 'containerRust'],
  [24, 3.6, -17, 6, 2.4, 2.4, 'containerTeal'],
  [22, 0.55, -9.5, 10, 1.1, 0.6, 'wall'],
  [18, 0.55, -16, 1.2, 1.1, 1.2, 'crate'],
  [26, 0.55, -11, 1.2, 1.1, 1.2, 'crate'],
  // Mid platform (climbable) + its steps, south side
  [0, 1.1, -2, 8, 2.2, 6, 'floor'],
  [0, 0.365, 2.6, 8, 0.73, 0.8, 'floor'],
  [0, 0.735, 1.8, 8, 1.47, 0.8, 'floor'],
  // Mid cover blocks (doorway gaps left open between them)
  [-10, 1.5, 8, 4, 3, 1, 'wall'],
  [10, 1.5, 8, 4, 3, 1, 'wall'],
  [-10, 1.5, -8, 4, 3, 1, 'wall'],
  [10, 1.5, -8, 4, 3, 1, 'wall'],
  [-4, 0.55, 2, 1.2, 1.1, 1.2, 'crate'],
  [4, 0.55, -2, 1.2, 1.1, 1.2, 'crate'],
  [3, 0.55, -12, 1.2, 1.1, 1.2, 'crate'],
  // A Long cover
  [-26, 0.55, 12, 1.2, 1.1, 1.2, 'crate'],
  [-24, 1.1, 4, 1.2, 2.2, 1.2, 'crate'],
  [-28, 0.55, -4, 1.2, 1.1, 1.2, 'crate'],
  [-29, 1.2, 16, 2.4, 2.4, 5, 'containerTeal'],
  // B Long cover
  [26, 0.55, 12, 1.2, 1.1, 1.2, 'crate'],
  [24, 1.1, 4, 1.2, 2.2, 1.2, 'crate'],
  [28, 0.55, -4, 1.2, 1.1, 1.2, 'crate'],
  [29, 1.2, 16, 2.4, 2.4, 5, 'containerRust'],
  // Spawn areas
  [-12, 0.55, 18, 1.2, 1.1, 1.2, 'crate'],
  [12, 0.55, 18, 1.2, 1.1, 1.2, 'crate'],
  [6, 0.55, 16, 1.2, 1.1, 1.2, 'crate'],
  [-8, 0.55, -19, 1.2, 1.1, 1.2, 'crate'],
  [8, 0.55, -19, 1.2, 1.1, 1.2, 'crate'],
  // Hazard curbs at the site mouths (flat decor, no collision)
  [-22, 0.06, -9.2, 10, 0.12, 0.5, 'hazard', false],
  [22, 0.06, -9.2, 10, 0.12, 0.5, 'hazard', false],
];

// Waypoint graph bots walk: id -> [x, z]. Edges are bidirectional.
const NODES = {
  v0: [0, 20], v1: [-6, 20], v2: [6, 20],
  e0: [0, -20], e1: [-6, -20], e2: [6, -20],
  s0: [-16, 12], s1: [0, 12], s2: [16, 12],
  a0: [-26, 15], a1: [-26, 7], a2: [-26, -1], a3: [-26, -9], a4: [-23, -14],
  b0: [26, 15], b1: [26, 7], b2: [26, -1], b3: [26, -9], b4: [23, -14],
  m0: [0, 16], m1: [0, 8], m2: [0, 0], m3: [0, -8], m4: [0, -15],
  n0: [-13, -8], n1: [13, -8],
  sa0: [-22, -14], sa1: [-17, -17], sa2: [-27, -17],
  sb0: [22, -14], sb1: [17, -17], sb2: [27, -17],
};
const EDGES = [
  ['v0', 'v1'], ['v0', 'v2'], ['v0', 'm0'], ['v1', 's0'], ['v2', 's2'], ['v0', 's1'],
  ['s0', 'a0'], ['s0', 's1'], ['s1', 's2'], ['s2', 'b0'], ['s1', 'm0'], ['s1', 'm1'],
  ['a0', 'a1'], ['a1', 'a2'], ['a2', 'a3'], ['a3', 'a4'], ['a1', 's0'], ['a2', 'n0'], ['a4', 'sa0'], ['a4', 'sa2'],
  ['b0', 'b1'], ['b1', 'b2'], ['b2', 'b3'], ['b3', 'b4'], ['b1', 's2'], ['b2', 'n1'], ['b4', 'sb0'], ['b4', 'sb2'],
  ['m0', 'm1'], ['m1', 'n0'], ['m1', 'n1'], ['m3', 'n0'], ['m3', 'n1'], ['m4', 'e0'], ['m4', 'n0'], ['m4', 'n1'], ['m3', 'm4'],
  ['n0', 'sa0'], ['n0', 'sa1'], ['n1', 'sb0'], ['n1', 'sb1'],
  ['e0', 'e1'], ['e0', 'e2'], ['e1', 'n0'], ['e2', 'n1'], ['e0', 'm4'],
  ['sa0', 'sa1'], ['sa0', 'sa2'], ['sb0', 'sb1'], ['sb0', 'sb2'],
];

export const SITES = {
  A: { name: 'REACTOR', cx: -22, cz: -14, hx: 6, hz: 5 },
  B: { name: 'DEPOT', cx: 22, cz: -14, hx: 6, hz: 5 },
};
export const SPAWNS = {
  vanguard: [[-4, 20], [0, 20], [4, 20], [-8, 18], [8, 18]],
  ember: [[-4, -20], [0, -20], [4, -20], [-8, -18], [8, -18]],
};

// Breadth-first shortest path over the waypoint graph. Returns node ids.
export function findPath(from, to) {
  if (from === to) return [from];
  const prev = { [from]: null };
  const queue = [from];
  while (queue.length) {
    const cur = queue.shift();
    for (const nb of EDGES.filter((e) => e[0] === cur || e[1] === cur).map((e) => (e[0] === cur ? e[1] : e[0]))) {
      if (!(nb in prev)) {
        prev[nb] = cur;
        if (nb === to) {
          const path = [to];
          let p = cur;
          while (p) { path.unshift(p); p = prev[p]; }
          return path;
        }
        queue.push(nb);
      }
    }
  }
  return [from, to];
}

export function nearestNode(x, z) {
  let best = 'v0';
  let bestD = Infinity;
  for (const [id, [nx, nz]] of Object.entries(NODES)) {
    const d = (nx - x) * (nx - x) + (nz - z) * (nz - z);
    if (d < bestD) { bestD = d; best = id; }
  }
  return best;
}

export function createWorld(scene, textures) {
  const group = new THREE.Group();
  scene.add(group);
  const materials = {};
  const matFor = (name) => {
    if (materials[name]) return materials[name];
    let m;
    if (name === 'ground') {
      m = new THREE.MeshStandardMaterial({ map: textures.asphalt, roughness: 0.95, metalness: 0.02 });
    } else if (name === 'hazard') {
      m = new THREE.MeshStandardMaterial({ map: textures.hazard, roughness: 0.8, metalness: 0.05 });
    } else if (name.startsWith('container')) {
      m = new THREE.MeshStandardMaterial({ map: textures[name], roughness: 0.6, metalness: 0.35 });
    } else if (name === 'crate') {
      m = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.crate), roughness: 0.85, metalness: 0.05 });
    } else if (name === 'floor') {
      m = new THREE.MeshStandardMaterial({ map: textures.concrete, roughness: 0.9, metalness: 0.05 });
    } else {
      m = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE[name] || '#39415a'), roughness: name === 'wallDark' ? 0.95 : 0.9, metalness: 0.05 });
    }
    materials[name] = m;
    return m;
  };

  const colliders = [];
  const shootables = [];
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  for (const [x, y, z, w, h, d, mat, collide = true] of BOXES) {
    const mesh = new THREE.Mesh(boxGeo, matFor(mat));
    mesh.scale.set(w, h, d);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.updateMatrixWorld(true);
    group.add(mesh);
    if (collide) {
      colliders.push(new THREE.Box3().setFromObject(mesh));
      shootables.push(mesh);
    }
  }

  // Site ground markers + floating signs.
  for (const [key, site] of Object.entries(SITES)) {
    const mark = new THREE.Mesh(
      new THREE.PlaneGeometry(site.hx * 2, site.hz * 2),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(key === 'A' ? PALETTE.siteA : PALETTE.siteB), transparent: true, opacity: 0.14, depthWrite: false }),
    );
    mark.rotation.x = -Math.PI / 2;
    mark.position.set(site.cx, 0.03, site.cz);
    group.add(mark);
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(3, 3),
      new THREE.MeshBasicMaterial({ map: key === 'A' ? textures.signA : textures.signB, transparent: true, side: THREE.DoubleSide }),
    );
    sign.position.set(site.cx, 4.6, site.cz);
    group.add(sign);
  }

  // Floodlight poles with amber heads; two carry real point lights.
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x1a1f2a, roughness: 0.6, metalness: 0.5 });
  const headMat = new THREE.MeshStandardMaterial({ color: 0x2a2113, emissive: new THREE.Color(PALETTE.hazard), emissiveIntensity: 1.6 });
  for (const [px, pz, lit] of [[-16, 4, true], [16, 4, false], [-16, -16, false], [16, -16, true]]) {
    const pole = new THREE.Mesh(boxGeo, poleMat);
    pole.scale.set(0.3, 7, 0.3);
    pole.position.set(px, 3.5, pz);
    pole.castShadow = true;
    group.add(pole);
    const head = new THREE.Mesh(boxGeo, headMat);
    head.scale.set(1.1, 0.5, 0.7);
    head.position.set(px, 7.1, pz);
    group.add(head);
    if (lit) {
      const light = new THREE.PointLight(new THREE.Color(PALETTE.hazard), 260, 30, 2);
      light.position.set(px, 6.6, pz);
      scene.add(light);
    }
  }

  // Distant skyline silhouettes + a pale moon disc, for depth beyond the walls.
  const skyMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#0a0f1c') });
  const skyline = [
    [-48, 9, -30, 10, 18, 10], [-58, 7, 10, 8, 14, 10], [48, 11, -34, 12, 22, 10],
    [58, 8, 6, 9, 16, 10], [-40, 13, 34, 12, 26, 10], [44, 10, 36, 10, 20, 10],
    [0, 15, -52, 14, 30, 10], [-20, 8, -48, 8, 16, 10], [24, 12, -50, 10, 24, 10],
  ];
  for (const [x, y, z, w, h, d] of skyline) {
    const m = new THREE.Mesh(boxGeo, skyMat);
    m.scale.set(w, h, d);
    m.position.set(x, y, z);
    group.add(m);
  }
  const moon = new THREE.Mesh(
    new THREE.CircleGeometry(3.2, 24),
    new THREE.MeshBasicMaterial({ color: new THREE.Color('#dfe8ff'), fog: false }),
  );
  moon.position.set(-38, 34, -60);
  moon.lookAt(0, 0, 0);
  group.add(moon);

  // Light: cool moon key with shadows, warm amber flood fill, sky/ground gradient.
  const sky = new THREE.HemisphereLight(new THREE.Color('#2a3a5a'), new THREE.Color('#141821'), 1.15);
  scene.add(sky);
  const key = new THREE.DirectionalLight(new THREE.Color('#cdd8ff'), 2.3);
  key.position.set(20, 32, 12);
  key.target.position.set(0, 0, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -42;
  key.shadow.camera.right = 42;
  key.shadow.camera.top = 42;
  key.shadow.camera.bottom = -42;
  key.shadow.camera.far = 90;
  key.shadow.bias = -0.0006;
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight(new THREE.Color('#f5a524'), 0.55);
  fill.position.set(-14, 10, 18);
  scene.add(fill);

  return { colliders, shootables, group, nodes: NODES };
}
