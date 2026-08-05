// Vegetation and village fabric, instanced. One draw call per species; per-instance
// tint keeps a thousand trees from looking like a thousand copies.

import * as THREE from 'three';
import { Builder } from './builder.js';
import { buildTree, buildHouse, buildCar, treeCardShape } from './props.js';
import { swayMaterial, paperMaterial } from './materials.js';
import { makeRng, rngRange } from './rng.js';

const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();
const _c = new THREE.Color();

const TREE_KINDS = 4;
// Weighted so the ochre tree stays an accent, not a habit.
const KIND_TABLE = [0, 0, 0, 0, 1, 1, 2, 2, 0, 3];

const treeGeoCache = [];
function treeGeometry(kind) {
  if (!treeGeoCache[kind]) {
    const b = new Builder();
    buildTree(b, kind, 1, kind);
    treeGeoCache[kind] = b.build();
  }
  return treeGeoCache[kind];
}

/** placements: [{x,y,z,kind,scale,rot,tint}] */
export function buildTreeInstances(placements, { sway = true } = {}) {
  const byKind = [];
  for (let k = 0; k < TREE_KINDS; k++) byKind.push([]);
  for (const p of placements) byKind[p.kind % TREE_KINDS].push(p);

  const material = sway ? swayMaterial({ instanced: true, amp: 1.15, freq: 0.5, base: 3 }) : paperMaterial();
  const meshes = [];
  for (let k = 0; k < TREE_KINDS; k++) {
    const list = byKind[k];
    if (!list.length) continue;
    const mesh = new THREE.InstancedMesh(treeGeometry(k), material, list.length);
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      _p.set(p.x, p.y, p.z);
      _e.set(0, p.rot ?? 0, 0);
      _q.setFromEuler(_e);
      _s.set(p.scale ?? 1, p.scaleY ?? p.scale ?? 1, p.scale ?? 1);
      _m.compose(_p, _q, _s);
      mesh.setMatrixAt(i, _m);
      const t = p.tint ?? 1;
      _c.setRGB(t, t * (p.warm ?? 1), t * (p.cool ?? 1));
      mesh.setColorAt(i, _c);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.frustumCulled = false;
    meshes.push(mesh);
  }
  return meshes;
}

const HOUSE_COLORWAYS = [
  [['#E7DCC4', '#FBF4E6'], ['#A24C2E', '#D07A52']],
  [['#DCCBAF', '#F4EAD6'], ['#414D3D', '#6E7C61']],
  [['#CDB9A0', '#EEDFC6'], ['#8E4529', '#BC6742']],
  [['#D9CCB4', '#F6EEDE'], ['#6E5A44', '#93795C']],
];

const houseGeoCache = [];
function houseGeometry(kind) {
  if (!houseGeoCache[kind]) {
    const [wall, roof] = HOUSE_COLORWAYS[kind % HOUSE_COLORWAYS.length];
    const b = new Builder();
    buildHouse(b, wall, roof, 11, 9, 7);
    houseGeoCache[kind] = b.build();
  }
  return houseGeoCache[kind];
}

export function buildHouseInstances(placements) {
  const material = paperMaterial();
  const byKind = new Map();
  for (const p of placements) {
    const k = p.kind % HOUSE_COLORWAYS.length;
    if (!byKind.has(k)) byKind.set(k, []);
    byKind.get(k).push(p);
  }
  const meshes = [];
  for (const [k, list] of byKind) {
    const mesh = new THREE.InstancedMesh(houseGeometry(k), material, list.length);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    list.forEach((p, i) => {
      _p.set(p.x, p.y, p.z);
      _e.set(0, p.rot ?? 0, 0);
      _q.setFromEuler(_e);
      const s = p.scale ?? 1;
      _s.set(s, s, s);
      _m.compose(_p, _q, _s);
      mesh.setMatrixAt(i, _m);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;
    meshes.push(mesh);
  }
  return meshes;
}

const CAR_COLORS = ['#C0623F', '#5D7A88', '#E7DCC4', '#6E7C61', '#B9AE9E', '#8E4529'];
let carGeos = null;
export function buildCarInstances(placements) {
  if (!carGeos) {
    carGeos = CAR_COLORS.map((c) => {
      const b = new Builder();
      buildCar(b, c);
      return b.build();
    });
  }
  const material = paperMaterial();
  const byKind = new Map();
  placements.forEach((p) => {
    const k = p.kind % CAR_COLORS.length;
    if (!byKind.has(k)) byKind.set(k, []);
    byKind.get(k).push(p);
  });
  const meshes = [];
  for (const [k, list] of byKind) {
    const mesh = new THREE.InstancedMesh(carGeos[k], material, list.length);
    mesh.castShadow = true;
    list.forEach((p, i) => {
      _p.set(p.x, p.y, p.z);
      _e.set(0, p.rot ?? 0, 0);
      _q.setFromEuler(_e);
      _s.set(1, 1, 1);
      _m.compose(_p, _q, _s);
      mesh.setMatrixAt(i, _m);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;
    meshes.push(mesh);
  }
  return meshes;
}

/** Flat cut-out trees — the paper-theatre understorey. Merged, one draw call. */
export function buildTreeCards(placements) {
  const b = new Builder();
  const greens = [
    ['#3B5738', '#6F9060'],
    ['#33502F', '#5F8351'],
    ['#456347', '#89A96E'],
  ];
  for (const p of placements) {
    const h = p.h ?? 22;
    const shape = treeCardShape(p.kind ?? 0, h);
    b.card(shape, p.thickness ?? 1.1, greens[(p.kind ?? 0) % greens.length], {
      x: p.x,
      y: p.y,
      z: p.z,
      ry: p.rot ?? 0,
      bevelSize: 0.28,
      curveSegments: 4,
    });
  }
  const mesh = b.mesh(swayMaterial({ amp: 0.8, freq: 0.42, base: 2 }), { receive: false });
  if (mesh) mesh.frustumCulled = false;
  return mesh;
}

/** Poisson-ish scatter in an annulus, keeping clear of the given exclusion discs. */
export function scatterRing(seed, { r0, r1, count, avoid = [], heightAt, cx = 0, cz = 0, filter }) {
  const rng = makeRng(seed);
  const out = [];
  let guard = 0;
  while (out.length < count && guard++ < count * 40) {
    const a = rng() * Math.PI * 2;
    const r = Math.sqrt(rngRange(rng, (r0 * r0) / (r1 * r1), 1)) * r1;
    const x = cx + Math.cos(a) * r;
    const z = cz + Math.sin(a) * r;
    let ok = true;
    for (const av of avoid) {
      const dx = x - av.x;
      const dz = z - av.z;
      if (dx * dx + dz * dz < av.r * av.r) {
        ok = false;
        break;
      }
    }
    if (ok && filter && !filter(x, z)) ok = false;
    if (!ok) continue;
    out.push({
      x,
      z,
      y: heightAt ? heightAt(x, z) : 0,
      kind: KIND_TABLE[Math.floor(rng() * KIND_TABLE.length)],
      scale: rngRange(rng, 0.72, 1.5),
      rot: rng() * Math.PI * 2,
      tint: rngRange(rng, 0.86, 1.14),
      warm: rngRange(rng, 0.95, 1.06),
      cool: rngRange(rng, 0.92, 1.04),
    });
  }
  return out;
}

/** Trees strung along a curve — hedgerows, avenues, the trail's green edge. */
export function scatterAlong(seed, points, { spacing = 26, offset = 16, jitter = 8, heightAt, kinds = [0, 2, 3] }) {
  const rng = makeRng(seed);
  const out = [];
  for (let i = 0; i < points.length; i += Math.max(1, Math.round(spacing / 4))) {
    for (const side of [-1, 1]) {
      if (rng() < 0.4) continue;
      const p = points[i];
      const a = points[Math.max(0, i - 1)];
      const bpt = points[Math.min(points.length - 1, i + 1)];
      let dx = bpt.x - a.x;
      let dz = bpt.z - a.z;
      const len = Math.hypot(dx, dz) || 1;
      const nx = (-dz / len) * side;
      const nz = (dx / len) * side;
      const d = offset + rngRange(rng, -jitter, jitter);
      const x = p.x + nx * d;
      const z = p.z + nz * d;
      out.push({
        x,
        z,
        y: heightAt ? heightAt(x, z) : 0,
        kind: kinds[Math.floor(rng() * kinds.length)],
        scale: rngRange(rng, 0.7, 1.25),
        rot: rng() * Math.PI * 2,
        tint: rngRange(rng, 0.88, 1.12),
        warm: rngRange(rng, 0.96, 1.05),
        cool: rngRange(rng, 0.93, 1.03),
      });
    }
  }
  return out;
}
