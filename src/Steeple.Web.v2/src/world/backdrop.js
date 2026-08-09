// Distance, made of paper. Concentric silhouette ridges ring the valley: each is a
// single strip whose top edge rolls and sprouts treelines, tinted further toward the
// page the further out it stands. Orbiting the village slides them past each other.

import * as THREE from 'three';
import { rgb, mix } from './palette.js';
import { makeRng } from './rng.js';

/** One ridge: a vertical strip of card standing on the horizon. */
export function buildRidge({
  radius,
  baseY = -30,
  height = 90,
  roll = 0.35,
  color = '#8CA67E',
  rimColor = null,
  rimSize = 3.2,
  treeline = 0.55,
  seed = 7,
  segments = 320,
}) {
  const rng = makeRng(seed);
  const bumps = [];
  const bumpCount = Math.round(treeline * 130);
  for (let i = 0; i < bumpCount; i++) {
    bumps.push({
      a: rng() * Math.PI * 2,
      w: 0.006 + rng() * 0.014,
      h: (0.035 + rng() * 0.10) * height,
      kind: rng() < 0.35 ? 1 : 0,
    });
  }
  const hills = [];
  for (let i = 0; i < 5; i++) {
    hills.push({ f: 1 + i, p: rng() * 6.283, a: (roll * height) / (1 + i * 1.1) });
  }

  const profile = (a) => {
    let h = height;
    for (const s of hills) h += Math.sin(a * s.f + s.p) * s.a;
    for (const b of bumps) {
      let d = Math.abs(((a - b.a + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      const t = Math.max(0, 1 - d / b.w);
      h += b.h * (b.kind ? Math.pow(t, 0.65) : t * t * (3 - 2 * t));
    }
    return h;
  };

  const pos = [];
  const col = [];
  const idx = [];
  const base = rgb(color);
  const rim = rgb(rimColor ?? mix(color, '#FBF7F0', 0.35));
  const foot = rgb(mix(color, '#3E5240', 0.3));

  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const x = Math.cos(a) * radius;
    const z = Math.sin(a) * radius;
    const h = profile(a);
    // bottom, below-rim, top
    pos.push(x, baseY, z, x, baseY + h - rimSize, z, x, baseY + h, z);
    col.push(...foot, ...base, ...rim);
  }
  for (let i = 0; i < segments; i++) {
    const a = i * 3;
    const b = (i + 1) * 3;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
    idx.push(a + 1, b + 1, a + 2, b + 1, b + 2, a + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();

  const mesh = new THREE.Mesh(
    g,
    new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: true })
  );
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return mesh;
}

/** Layered rings, graded toward paper. Returns the group and the ridge meshes. */
export function buildBackdrop() {
  const group = new THREE.Group();
  const rings = [
    { radius: 800, height: 156, color: '#7B9A6D', treeline: 0.85, roll: 0.30, seed: 13, baseY: -70 },
    { radius: 1080, height: 186, color: '#92AA82', treeline: 0.58, roll: 0.34, seed: 29, baseY: -70 },
    { radius: 1450, height: 208, color: '#ADBF9D', treeline: 0.36, roll: 0.38, seed: 53, baseY: -70 },
    { radius: 1950, height: 228, color: '#C9D4BE', treeline: 0.18, roll: 0.40, seed: 83, baseY: -70 },
  ];
  const meshes = rings.map((r) => {
    const m = buildRidge(r);
    group.add(m);
    return m;
  });
  // The nearest ring is the edge of the staged world: past it the camera starts
  // seeing the scenery from behind.
  return { group, meshes, inner: rings[0].radius };
}
