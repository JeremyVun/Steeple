// DIORAMA — the village as a paper theatre. The ground is a stack of cut contour
// cards; the distance is a set of silhouette flats; and entering a venue unfolds
// its own little stage set, the way a pop-up book opens on a page.

import * as THREE from 'three';
import { Builder, blobShape } from './builder.js';
import { paperMaterial } from './materials.js';
import { smoothstep, lerp, makeRng, rngRange, fbm } from './rng.js';
import { pathsMesh } from './paths.js';
import { treeCardShape } from './props.js';
import {
  buildTreeInstances,
  buildHouseInstances,
  buildCarInstances,
  buildTreeCards,
  scatterRing,
  scatterAlong,
} from './scatter.js';

export const LAYOUT = {
  'oakton-baptist': { x: -268, z: -6, ry: -0.36 },
  'grace-community-vienna': { x: -36, z: -140, ry: 0.03 },
  'vienna-presbyterian': { x: 64, z: -198, ry: 0.52 },
  'dunn-loring-umc': { x: 246, z: -100, ry: 0.28 },
  'merrifield-fellowship': { x: 258, z: 152, ry: -0.48 },
};

// Each card is cut from the same wobble formula the height field samples, so the
// ground you see is exactly the ground things stand on.
const ISLANDS = [
  { x: 0, z: 0, R: 640, w: 0.09, p: 0.4, sq: 0.86, y0: -8, top: 0, color: '#8FA97E' },
  { x: 0, z: -20, R: 520, w: 0.13, p: 1.9, sq: 0.9, y0: 0, top: 5, color: '#7E9A6E' },
  { x: -266, z: 4, R: 190, w: 0.15, p: 2.7, sq: 0.94, y0: 5, top: 13, color: '#8CA87A' },
  { x: 12, z: -166, R: 250, w: 0.13, p: 0.9, sq: 0.84, y0: 5, top: 14, color: '#8CA87A' },
  { x: 16, z: -170, R: 172, w: 0.10, p: 4.2, sq: 0.92, y0: 14, top: 23, color: '#9CB588' },
  { x: -74, z: -320, R: 116, w: 0.19, p: 3.3, sq: 0.9, y0: 14, top: 30, color: '#A8BE94' },
  { x: 248, z: -98, R: 172, w: 0.14, p: 5.1, sq: 0.95, y0: 5, top: 13, color: '#8CA87A' },
  { x: 260, z: 150, R: 166, w: 0.13, p: 1.4, sq: 0.93, y0: 5, top: 10, color: '#95AF82' },
  { x: -186, z: 292, R: 96, w: 0.21, p: 2.2, sq: 0.88, y0: 5, top: 14, color: '#9CB588' },
  { x: 132, z: 44, R: 82, w: 0.2, p: 6.0, sq: 0.9, y0: 5, top: 12, color: '#98B184' },
].sort((a, b) => a.top - b.top);

function islandRadius(isl, a) {
  return (
    isl.R *
    (1 +
      isl.w * 0.6 * Math.sin(a * 2 + isl.p) +
      isl.w * 0.35 * Math.sin(a * 3 - isl.p * 1.7) +
      isl.w * 0.2 * Math.sin(a * 5 + isl.p * 0.6))
  );
}

export function heightAt(x, z) {
  let h = -8;
  for (const isl of ISLANDS) {
    const dx = x - isl.x;
    const sy = -(z - isl.z) / isl.sq;
    const d = Math.hypot(dx, sy);
    if (d > isl.R * 1.5) continue;
    const r = islandRadius(isl, Math.atan2(sy, dx));
    const t = smoothstep(r + 1.5, r - 5, d);
    if (t > 0) h = lerp(h, isl.top, t);
  }
  return h;
}

/** How far inside an island edge a point sits — keeps scatter off the bevels. */
function edgeClearance(x, z) {
  let best = 1;
  for (const isl of ISLANDS) {
    const dx = x - isl.x;
    const sy = -(z - isl.z) / isl.sq;
    const d = Math.hypot(dx, sy);
    const r = islandRadius(isl, Math.atan2(sy, dx));
    const band = Math.abs(d - r);
    if (band < 9) best = Math.min(best, band / 9);
  }
  return best;
}

const ROUTES = [
  {
    name: 'maple',
    points: [[-200, -84], [-100, -96], [-36, -102], [30, -126], [96, -158], [170, -196]],
    width: 11,
    color: '#B2A895',
    edge: '#CFC4AC',
    centerLine: '#EFE6D2',
    lift: 0.45,
  },
  {
    name: 'wod',
    points: [[-180, -232], [-80, -240], [20, -246], [110, -258], [190, -276]],
    width: 6,
    color: '#DDCBA9',
    edge: '#C6B18B',
    lift: 0.55,
  },
  {
    name: 'blake',
    points: [[-116, -98], [-190, -56], [-250, 8], [-284, 88], [-336, 146]],
    width: 10,
    color: '#B2A895',
    edge: '#CFC4AC',
    lift: 0.45,
  },
  {
    name: 'gallows',
    points: [[290, -218], [294, -140], [292, -58], [302, 44], [320, 154], [298, 252]],
    width: 10,
    color: '#B2A895',
    edge: '#CFC4AC',
    centerLine: '#EFE6D2',
    lift: 0.45,
  },
  {
    name: 'valley-lane',
    points: [[-286, 100], [-232, 172], [-150, 224], [-40, 258], [80, 264], [190, 240], [292, 190]],
    width: 8.5,
    color: '#BBB09C',
    edge: '#D4C9B1',
    lift: 0.45,
  },
  {
    name: 'mill-path',
    points: [[-28, -100], [-14, -40], [8, 40], [-12, 120], [-70, 186], [-108, 212]],
    width: 5.5,
    color: '#DDCBA9',
    edge: '#C6B18B',
    lift: 0.5,
  },
];

function islandCards(group) {
  const b = new Builder();
  for (const isl of ISLANDS) {
    const shape = blobShape(isl.R, isl.w, isl.p, 64, isl.sq);
    const th = isl.top - isl.y0;
    b.card(shape, th, isl.color, {
      rx: -Math.PI / 2,
      x: isl.x,
      y: (isl.top + isl.y0) / 2,
      z: isl.z,
      bevelSize: 0.9,
      curveSegments: 3,
      shade: 0.74,
      under: 0.6,
    });
  }
  const mesh = b.mesh(paperMaterial({ flat: true, warmth: 0.5 }));
  mesh.frustumCulled = false;
  group.add(mesh);
  return mesh;
}

/** A folding flat: hinged along its bottom edge so it can lie down and stand up. */
function foldingCard(shape, thickness, color, { x, z, ry, thick = 1.2 }) {
  const pivot = new THREE.Group();
  pivot.position.set(x, 0, z);
  pivot.rotation.y = ry;
  const b = new Builder();
  b.card(shape, thick, color, { bevelSize: 0.4, curveSegments: 4, shade: 0.8 });
  const mesh = b.mesh(paperMaterial({ warmth: 0.45 }), { receive: false });
  const hinge = new THREE.Group();
  hinge.add(mesh);
  hinge.rotation.x = -Math.PI / 2 + 0.02;
  pivot.add(hinge);
  pivot.userData.hinge = hinge;
  void thickness;
  return pivot;
}

function hillCardShape(w, h, seed) {
  const rng = makeRng(seed);
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  const steps = 30;
  const bumps = [];
  for (let i = 0; i < 6; i++) bumps.push({ p: rngRange(rng, -0.5, 0.5), w: rngRange(rng, 0.04, 0.12), h: rngRange(rng, 0.25, 0.62) });
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = (t - 0.5) * w;
    let y = h * (0.42 + 0.3 * Math.sin(t * 3.1 + seed) + 0.16 * Math.sin(t * 7.7 - seed * 0.7));
    for (const bp of bumps) {
      const d = Math.abs(t - 0.5 - bp.p);
      if (d < bp.w) y += h * bp.h * (1 - d / bp.w) * (1 - d / bp.w);
    }
    s.lineTo(x, Math.max(h * 0.2, y));
  }
  s.lineTo(w / 2, 0);
  s.closePath();
  return s;
}

/** The pop-up set for one venue: a paper page that spreads under the church, two
 *  tree wings that swing up at the sides, and a low hedge across the front. */
function buildStageSet(id, l) {
  const set = new THREE.Group();
  const fwd = new THREE.Vector2(Math.sin(l.ry), Math.cos(l.ry));
  const side = new THREE.Vector2(fwd.y, -fwd.x);
  const y = heightAt(l.x, l.z);
  const seed = id.length * 37 + 11;

  // The page: a pale paper apron the whole venue stands on.
  const pageB = new Builder();
  pageB.card(blobShape(96, 0.12, seed * 0.7, 56, 0.86), 0.4, ['#9DB77E', '#B7CB98'], {
    rx: -Math.PI / 2,
    bevelSize: 0.35,
    curveSegments: 3,
    shade: 0.86,
  });
  const page = pageB.mesh(paperMaterial({ flat: false, warmth: 0.45 }), { cast: false });
  page.position.set(l.x, y + 0.14, l.z);
  page.rotation.y = l.ry;
  page.scale.setScalar(0.01);
  set.add(page);

  const pieces = [];
  for (const s of [-1, 1]) {
    const px = l.x + side.x * 104 * s + fwd.x * 12;
    const pz = l.z + side.y * 104 * s + fwd.y * 12;
    const clump = new Builder();
    for (let i = 0; i < 3; i++) {
      const h = 27 - i * 5.5;
      clump.card(treeCardShape(i === 1 ? 1 : 0, h), 1.4, ['#3E5F3B', '#7C9C60'], {
        x: (i - 1) * 9 * s,
        y: 0,
        z: i * 1.2,
        bevelSize: 0.4,
        curveSegments: 4,
        shade: 0.8,
      });
    }
    const mesh = clump.mesh(paperMaterial({ warmth: 0.45 }), { receive: false });
    const pivot = new THREE.Group();
    pivot.position.set(px, heightAt(px, pz), pz);
    pivot.rotation.y = l.ry + s * 0.4;
    const hinge = new THREE.Group();
    hinge.add(mesh);
    hinge.rotation.x = -Math.PI / 2 + 0.02;
    pivot.add(hinge);
    pivot.userData.hinge = hinge;
    set.add(pivot);
    pieces.push(pivot);
  }

  const hx = l.x + fwd.x * 88;
  const hz = l.z + fwd.y * 88;
  const hedgeB = new Builder();
  hedgeB.card(hillCardShape(150, 13, seed), 1.3, ['#41603C', '#7B9A5E'], {
    bevelSize: 0.4,
    curveSegments: 4,
    shade: 0.82,
  });
  const front = new THREE.Group();
  front.position.set(hx, heightAt(hx, hz), hz);
  front.rotation.y = l.ry;
  const fh = new THREE.Group();
  fh.rotation.x = -Math.PI / 2 + 0.02;
  fh.add(hedgeB.mesh(paperMaterial({ warmth: 0.45 }), { receive: false }));
  front.add(fh);
  front.userData.hinge = fh;
  set.add(front);
  pieces.push(front);

  set.userData.pieces = pieces;
  set.userData.page = page;
  set.visible = false;
  return set;
}

export function buildStage(scene, { quality }) {
  const group = new THREE.Group();
  scene.add(group);

  islandCards(group);

  // A pond, collaged on: pale shore, then water, then a lighter shallow.
  const pondB = new Builder();
  const PX = -110;
  const PZ = 215;
  pondB.card(blobShape(58, 0.2, 2.1, 40, 0.72), 0.5, ['#C6B78C', '#DCCFA6'], {
    rx: -Math.PI / 2, x: PX, y: 5.6, z: PZ, bevelSize: 0.3, curveSegments: 3, shade: 0.9,
  });
  pondB.card(blobShape(47, 0.22, 2.6, 40, 0.7), 0.4, ['#3F7C8A', '#68A0A6'], {
    rx: -Math.PI / 2, x: PX, y: 6.1, z: PZ, bevelSize: 0.25, curveSegments: 3, shade: 0.95,
  });
  pondB.card(blobShape(30, 0.24, 4.1, 32, 0.66), 0.3, ['#69A2A8', '#93C0BC'], {
    rx: -Math.PI / 2, x: PX + 6, y: 6.45, z: PZ + 4, bevelSize: 0.2, curveSegments: 3, shade: 0.97,
  });
  const pond = pondB.mesh(paperMaterial({ flat: false, warmth: 0.3 }), { cast: false });
  pond.frustumCulled = false;
  group.add(pond);

  const { mesh: roads, sampled } = pathsMesh(ROUTES, heightAt, paperMaterial({ flat: false, warmth: 0.35 }));
  if (roads) group.add(roads);

  const avoid = Object.values(LAYOUT).map((l) => ({ x: l.x, z: l.z, r: 90 }));
  avoid.push({ x: PX, z: PZ, r: 66 });
  for (const [, pts] of sampled) {
    for (let i = 0; i < pts.length; i += 3) avoid.push({ x: pts[i].x, z: pts[i].z, r: 12 });
  }

  const treeCount = quality === 'low' ? 300 : 480;
  const placements = scatterRing(2024, {
    r0: 40,
    r1: 560,
    count: treeCount,
    avoid,
    heightAt,
    filter: (x, z) => edgeClearance(x, z) > 0.55 && fbm(x * 0.005 + 9, z * 0.005 - 4, 2) < 0.74,
  });
  placements.push(
    ...scatterAlong(777, sampled.get('wod'), { spacing: 20, offset: 13, jitter: 5, heightAt, kinds: [0, 2, 3] })
  );
  placements.push(
    ...scatterAlong(888, sampled.get('valley-lane'), { spacing: 30, offset: 19, jitter: 7, heightAt, kinds: [0, 2] })
  );
  placements.push(
    ...scatterAlong(999, sampled.get('mill-path'), { spacing: 26, offset: 15, jitter: 6, heightAt, kinds: [0, 0, 3] })
  );
  for (const m of buildTreeInstances(placements)) group.add(m);

  // Cut-out understorey: flat trees hugging the island rims, and a foreground ring
  // of clumps that the camera drifts past.
  const rng = makeRng(31415);

  // Field patches: torn paper laid on the contour cards so no island is one flat fill.
  const patchB = new Builder();
  const PATCH = [['#B9BC80', '#C9CB8E'], ['#A6BC85', '#B4C793'], ['#CBC08A', '#D8CE9B'], ['#7C9A68', '#8CA876']];
  for (const isl of ISLANDS) {
    if (isl.R > 560 || isl.R < 70) continue;
    const n = (isl.R > 300 ? 6 : 2) + Math.floor(rng() * 3);
    for (let i = 0; i < n; i++) {
      const a = rng() * Math.PI * 2;
      const rr = islandRadius(isl, a) * rngRange(rng, 0.2, 0.62);
      const x = isl.x + Math.cos(a) * rr;
      const z = isl.z - Math.sin(a) * rr * isl.sq;
      let clear = true;
      for (const l of Object.values(LAYOUT)) if (Math.hypot(x - l.x, z - l.z) < 80) clear = false;
      if (!clear) continue;
      patchB.card(blobShape(rngRange(rng, 26, 54), 0.22, rng() * 6.283, 30, rngRange(rng, 0.6, 1)), 0.5, PATCH[Math.floor(rng() * PATCH.length)], {
        rx: -Math.PI / 2,
        x,
        y: isl.top + 0.3,
        z,
        bevelSize: 0.3,
        curveSegments: 3,
        shade: 0.9,
      });
    }
  }
  const patchMesh = patchB.mesh(paperMaterial({ flat: false, warmth: 0.5 }), { cast: false });
  if (patchMesh) {
    patchMesh.frustumCulled = false;
    group.add(patchMesh);
  }

  const cards = [];
  // A loose ring of cut-out clumps just outside the village: whichever way the
  // camera drifts, a few of them slide through the foreground as framing flats.
  for (let i = 0; i < (quality === 'low' ? 76 : 118); i++) {
    const a = rng() * Math.PI * 2;
    const r = rngRange(rng, 470, 630);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r * 0.9;
    cards.push({
      x,
      y: heightAt(x, z) - 2,
      z,
      kind: Math.floor(rng() * 3),
      h: rngRange(rng, 22, 44),
      rot: a + Math.PI / 2 + rngRange(rng, -0.5, 0.5),
      thickness: 1.8,
    });
  }
  const cardMesh = buildTreeCards(cards);
  if (cardMesh) group.add(cardMesh);

  // A handful of houses, staged in clusters rather than sprawled
  const houses = [];
  for (const [cx, cz, n, seed] of [
    [-150, -96, 7, 5],
    [120, -230, 6, 9],
    [196, 96, 6, 13],
    [-20, 178, 6, 17],
    [60, 300, 6, 23],
    [-250, 150, 5, 29],
  ]) {
    const hr = makeRng(seed * 101);
    for (let i = 0; i < n; i++) {
      const x = cx + rngRange(hr, -60, 60);
      const z = cz + rngRange(hr, -46, 46);
      if (edgeClearance(x, z) < 0.6) continue;
      if (Math.hypot(x - PX, z - PZ) < 82) continue;
      let clear = true;
      for (const l of Object.values(LAYOUT)) if (Math.hypot(x - l.x, z - l.z) < 92) clear = false;
      if (!clear) continue;
      houses.push({ x, z, y: heightAt(x, z), rot: rngRange(hr, 0, 6.28), kind: Math.floor(hr() * 4), scale: rngRange(hr, 0.9, 1.25) });
    }
  }
  for (const m of buildHouseInstances(houses)) group.add(m);

  const cars = [];
  const lot = LAYOUT['oakton-baptist'];
  for (let i = 0; i < 8; i++) {
    const lx = 8 + ((i % 4) - 1.5) * 6;
    const lz = 54 + (i < 4 ? -6.5 : 7);
    const c = Math.cos(lot.ry);
    const s = Math.sin(lot.ry);
    const x = lot.x + lx * c + lz * s;
    const z = lot.z - lx * s + lz * c;
    cars.push({ x, z, y: heightAt(x, z) + 0.9, rot: lot.ry, kind: i });
  }
  for (const m of buildCarInstances(cars)) group.add(m);

  // Pop-up sets, one per venue
  const sets = new Map();
  for (const [id, l] of Object.entries(LAYOUT)) {
    const set = buildStageSet(id, l);
    group.add(set);
    sets.set(id, set);
  }

  // Flat list so the per-frame loop allocates nothing.
  const setList = [];
  for (const [id, set] of sets) setList.push({ id, set, opened: 0 });
  let openId = null;

  return {
    group,
    heightAt,
    layout: LAYOUT,
    sampled,
    presentVenue(venueId) {
      openId = venueId;
      if (venueId && sets.has(venueId)) sets.get(venueId).visible = true;
    },
    update(dt) {
      for (let i = 0; i < setList.length; i++) {
        const s = setList[i];
        const target = s.id === openId ? 1 : 0;
        if (Math.abs(s.opened - target) < 0.001) {
          if (target === 0 && s.set.visible) s.set.visible = false;
          continue;
        }
        s.opened += (target - s.opened) * Math.min(1, dt * 4.2);
        s.set.visible = true;
        // A little overshoot on the way up: paper has a spring in it.
        const e = s.opened < 1 ? 1 - Math.pow(1 - s.opened, 3) : 1;
        const ang = -Math.PI / 2 + (Math.PI / 2 + 0.02) * e - 0.05 * Math.sin(e * Math.PI);
        const pieces = s.set.userData.pieces;
        for (let p = 0; p < pieces.length; p++) pieces[p].userData.hinge.rotation.x = ang;
        s.set.userData.page.scale.setScalar(Math.max(0.01, e));
      }
    },
  };
}
