// ATLAS — the continuous painted miniature. Rolling sage terrain, honest
// geography, roads that actually go somewhere, a pond catching the low sun.

import * as THREE from 'three';
import { C, rgb, mix } from './palette.js';
import { fbm, smoothstep, clamp, makeRng, rngRange } from './rng.js';
import { paperMaterial, smoothPaperMaterial } from './materials.js';
import { pathsMesh } from './paths.js';
import {
  buildTreeInstances,
  buildHouseInstances,
  buildCarInstances,
  scatterRing,
  scatterAlong,
} from './scatter.js';

export const LAYOUT = {
  'oakton-baptist': { x: -332, z: -24, ry: -0.30 },
  'grace-community-vienna': { x: -8, z: -152, ry: 0.05 },
  'vienna-presbyterian': { x: 94, z: -184, ry: 0.44 },
  'dunn-loring-umc': { x: 332, z: -122, ry: 0.22 },
  'merrifield-fellowship': { x: 330, z: 168, ry: -0.42 },
};

const EXTENT = 1640;
const POND = { x: -158, z: 214, r: 58 };

function baseHeight(x, z) {
  let h = 44 * fbm(x * 0.0031, z * 0.0031, 3) - 19;
  h += 13 * fbm(x * 0.0102 + 11, z * 0.0102 - 7, 2) - 6.5;
  h += 4.5 * fbm(x * 0.031 - 3, z * 0.031 + 5, 1) - 2.2;
  const d = Math.hypot(x, z);
  // A modest rim: high enough to close the valley, low enough that the paper
  // ridges beyond it still read.
  h += 34 * smoothstep(320, 660, d);
  h -= 460 * smoothstep(700, 800, d);
  return h;
}

const pads = [];
for (const [id, l] of Object.entries(LAYOUT)) {
  // Flat enough that the church and every room card it presents stand level.
  pads.push({ id, x: l.x, z: l.z, h: baseHeight(l.x, l.z), r0: 96, r1: 168 });
}
const pondBase = baseHeight(POND.x, POND.z);

export function heightAt(x, z) {
  let h = baseHeight(x, z);
  for (const p of pads) {
    const d = Math.hypot(x - p.x, z - p.z);
    if (d < p.r1) h += (p.h - h) * smoothstep(p.r1, p.r0, d);
  }
  const pd = Math.hypot(x - POND.x, z - POND.z);
  if (pd < POND.r * 1.5) {
    const t = smoothstep(POND.r * 1.35, POND.r * 0.15, pd);
    h += (pondBase - 11 - h) * t;
  }
  return h;
}

export const WATER_Y = pondBase - 7.4;

function terrainMesh() {
  const seg = 168;
  const geo = new THREE.PlaneGeometry(EXTENT, EXTENT, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const n = pos.count;
  const colors = new Float32Array(n * 3);

  // Fields, not a lawn: a quilt of pasture, hay and turned earth with soft seams.
  // Ordered so the noise's fat middle lands on sage and only the tails turn to hay.
  const FIELDS = [
    rgb('#C9BD84'),
    rgb('#A3B77C'),
    rgb('#7E9A6A'),
    rgb('#6E8C5F'),
    rgb('#87A46C'),
    rgb('#9BB177'),
    rgb('#C4BA83'),
  ];
  const sand = rgb('#DCCBA4');
  const crest = rgb('#C7D0A2');

  for (let i = 0; i < n; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = heightAt(x, z);
    pos.setY(i, h);

    const f = fbm(x * 0.0082 + 13, z * 0.0082 - 21, 2) * 1.2;
    const idx = clamp(f, 0, 0.999) * FIELDS.length;
    const i0 = Math.min(FIELDS.length - 1, Math.floor(idx));
    const i1 = Math.min(FIELDS.length - 1, i0 + 1);
    const seam = smoothstep(0.88, 1.0, idx - i0);
    const a = FIELDS[i0];
    const b2 = FIELDS[i1];
    let r = a[0] + (b2[0] - a[0]) * seam;
    let g = a[1] + (b2[1] - a[1]) * seam;
    let b = a[2] + (b2[2] - a[2]) * seam;

    // Fine grain so no field is a flat fill
    const grain = (fbm(x * 0.028, z * 0.028, 2) - 0.5) * 0.055;
    r += grain;
    g += grain * 0.9;
    b += grain * 0.6;

    // Ridgetops catch the low sun
    const lift = smoothstep(8, 42, h) * 0.34;
    r += (crest[0] - r) * lift;
    g += (crest[1] - g) * lift;
    b += (crest[2] - b) * lift;

    const pd = Math.hypot(x - POND.x, z - POND.z);
    const shore = smoothstep(POND.r * 1.3, POND.r * 0.9, pd) * 0.62;
    r += (sand[0] - r) * shore;
    g += (sand[1] - g) * shore;
    b += (sand[2] - b) * shore;

    colors[i * 3] = r;
    colors[i * 3 + 1] = g;
    colors[i * 3 + 2] = b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, smoothPaperMaterial({ warmth: 0.5 }));
  mesh.receiveShadow = true;
  return mesh;
}

// Roads run past the churches, never through them: each venue fronts onto a lane.
const ROUTES = [
  {
    name: 'maple',
    points: [[-560, -80], [-330, -96], [-150, -110], [-8, -112], [96, -138], [270, -152], [470, -138], [640, -126]],
    width: 13,
    color: '#B2A895',
    edge: '#CFC4AC',
    centerLine: '#EFE6D2',
  },
  {
    name: 'gallows',
    points: [[366, -430], [380, -260], [388, -122], [392, 20], [398, 170], [372, 330], [344, 470]],
    width: 12,
    color: '#B2A895',
    edge: '#CFC4AC',
    centerLine: '#EFE6D2',
  },
  {
    name: 'blake',
    points: [[-60, -132], [-160, -70], [-250, -8], [-330, 66], [-430, 96], [-540, 116]],
    width: 11,
    color: '#B2A895',
    edge: '#CFC4AC',
  },
  {
    name: 'wod',
    points: [[-600, -288], [-380, -262], [-160, -232], [40, -226], [230, -252], [420, -286], [610, -318]],
    width: 6.5,
    color: '#DCC9A6',
    edge: '#C8B48F',
    lift: 0.62,
  },
  {
    name: 'eskridge',
    points: [[394, 196], [280, 230], [150, 258], [30, 272]],
    width: 9,
    color: '#B2A895',
    edge: '#CFC4AC',
  },
  {
    name: 'lake-lane',
    points: [[-340, 74], [-296, 140], [-232, 200], [-126, 256], [10, 272]],
    width: 8.5,
    color: '#BBB09C',
    edge: '#D2C7AF',
  },
];

export function buildStage(scene, { quality }) {
  const group = new THREE.Group();
  scene.add(group);

  group.add(terrainMesh());

  // Lift generously: the terrain mesh interpolates between samples, so a ribbon
  // that hugs the true height field sinks into every convex rise.
  const roadMat = paperMaterial({ flat: false, warmth: 0.35 });
  const routes = ROUTES.map((r) => ({ ...r, lift: (r.lift ?? 0.5) + 1.6 }));
  const { mesh: roads, sampled } = pathsMesh(routes, heightAt, roadMat);
  if (roads) group.add(roads);

  // Pond
  const water = new THREE.Mesh(
    new THREE.CircleGeometry(POND.r * 0.98, 44),
    new THREE.MeshLambertMaterial({
      color: new THREE.Color('#3E8496'),
      transparent: true,
      opacity: 0.96,
      emissive: new THREE.Color('#C08A50'),
      emissiveIntensity: 0.16,
    })
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(POND.x, WATER_Y, POND.z);
  water.receiveShadow = false;
  group.add(water);

  // Vegetation
  const avoid = Object.values(LAYOUT).map((l) => ({ x: l.x, z: l.z, r: 92 }));
  avoid.push({ x: POND.x, z: POND.z, r: POND.r * 1.05 });
  for (const [name, pts] of sampled) {
    if (name === 'wod') continue;
    for (let i = 0; i < pts.length; i += 3) avoid.push({ x: pts[i].x, z: pts[i].z, r: 13 });
  }

  // Woods gather in copses; a few strays stand alone in the fields.
  const woods = quality === 'low' ? 460 : 760;
  const strays = quality === 'low' ? 150 : 250;
  const placements = scatterRing(1337, {
    r0: 40,
    r1: 700,
    count: woods,
    avoid,
    heightAt,
    filter: (x, z) => fbm(x * 0.0046 + 7, z * 0.0046 + 19, 2) > 0.58,
  });
  placements.push(
    ...scatterRing(9001, {
      r0: 60,
      r1: 690,
      count: strays,
      avoid,
      heightAt,
      filter: (x, z) => fbm(x * 0.0046 + 7, z * 0.0046 + 19, 2) <= 0.58,
    })
  );
  placements.push(
    ...scatterAlong(4242, sampled.get('wod'), { spacing: 22, offset: 15, jitter: 7, heightAt, kinds: [0, 2, 3] })
  );
  placements.push(
    ...scatterAlong(515, sampled.get('maple'), { spacing: 34, offset: 21, jitter: 6, heightAt, kinds: [0, 2] })
  );
  placements.push(
    ...scatterAlong(616, sampled.get('gallows'), { spacing: 40, offset: 24, jitter: 7, heightAt, kinds: [0, 2] })
  );
  for (const m of buildTreeInstances(placements)) group.add(m);

  // Houses along the lanes — scale, and somewhere for the golden light to land
  const rng = makeRng(90210);
  const houses = [];
  const laneNames = ['maple', 'gallows', 'lake-lane', 'eskridge'];
  for (const name of laneNames) {
    const pts = sampled.get(name);
    for (let i = 6; i < pts.length - 6; i += 5) {
      for (const side of [-1, 1]) {
        if (rng() < 0.52) continue;
        const p = pts[i];
        const a = pts[i - 1];
        const b2 = pts[i + 1];
        let dx = b2.x - a.x;
        let dz = b2.z - a.z;
        const len = Math.hypot(dx, dz) || 1;
        const off = rngRange(rng, 26, 40) * side;
        const x = p.x + (-dz / len) * off;
        const z = p.z + (dx / len) * off;
        let clear = true;
        for (const l of Object.values(LAYOUT)) {
          if (Math.hypot(x - l.x, z - l.z) < 96) clear = false;
        }
        if (Math.hypot(x - POND.x, z - POND.z) < POND.r * 1.2) clear = false;
        if (!clear || Math.hypot(x, z) > 700) continue;
        houses.push({
          x,
          z,
          y: heightAt(x, z),
          rot: Math.atan2(-dz, dx) + (side > 0 ? Math.PI / 2 : -Math.PI / 2) + rngRange(rng, -0.12, 0.12),
          kind: Math.floor(rng() * 4),
          scale: rngRange(rng, 0.85, 1.2),
        });
      }
    }
  }
  for (const m of buildHouseInstances(houses)) group.add(m);

  // Cars idling in the lots
  const cars = [];
  const lot = LAYOUT['oakton-baptist'];
  for (let i = 0; i < 10; i++) {
    const lx = lot.x + 8 + ((i % 5) - 2) * 6;
    const lz = lot.z + 54 + (i < 5 ? -6.5 : 7);
    const p = rotateAbout(lx, lz, lot.x, lot.z, lot.ry);
    cars.push({ x: p.x, z: p.z, y: heightAt(p.x, p.z) + 0.9, rot: lot.ry, kind: i });
  }
  const mer = LAYOUT['merrifield-fellowship'];
  for (let i = 0; i < 4; i++) {
    const p = rotateAbout(mer.x + 42, mer.z + 8 + i * 5.5, mer.x, mer.z, mer.ry);
    cars.push({ x: p.x, z: p.z, y: heightAt(p.x, p.z) + 0.6, rot: mer.ry + Math.PI / 2, kind: i + 2 });
  }
  for (const m of buildCarInstances(cars)) group.add(m);

  return {
    group,
    heightAt,
    layout: LAYOUT,
    sampled,
    presentVenue() {},
    update() {},
  };
}

export function rotateAbout(x, z, cx, cz, ry) {
  const dx = x - cx;
  const dz = z - cz;
  const c = Math.cos(ry);
  const s = Math.sin(ry);
  return { x: cx + dx * c + dz * s, z: cz - dx * s + dz * c };
}

void mix;
