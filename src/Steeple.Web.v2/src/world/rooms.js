// A room presents itself as a little open-sided model of itself: a paper plinth
// on the grass, three walls that fold up like a pop-up page, a lantern that warms
// the inside, and just enough furniture to say what the room is for.

import * as THREE from 'three';
import { Builder, roundedRectShape } from './builder.js';
import { paperMaterial, glowMaterial } from './materials.js';
import { C } from './palette.js';

const W = 24; // width across the front
const D = 19; // depth
const H = 12; // wall height

// A model of a room, not a building — but an honest one: a hall for 200 stands
// noticeably larger than a meeting room for 18.
const SCALE_MIN = 0.52;
const SCALE_MAX = 0.72;
function scaleFor(capacity = 0) {
  const t = Math.max(0, Math.min(1, (capacity - 18) / 182));
  return SCALE_MIN + (SCALE_MAX - SCALE_MIN) * Math.sqrt(t);
}

const WALL = ['#D9C7A6', '#F6EDDA'];
const WALL_IN = ['#E5CB9C', '#FCF2DE'];

function wallCard(w, h, color, { inner = false } = {}) {
  const b = new Builder();
  b.card(roundedRectShape(w, h, 0.8), 0.9, color, {
    y: h / 2,
    bevelSize: 0.3,
    curveSegments: 2,
    shade: 0.82,
  });
  if (inner) {
    b.slab(w - 2.0, 0.7, 0.5, C.terracotta, { y: h - 1.4, z: 0.65 });
    b.slab(w - 6, 4.2, 0.35, ['#C4A473', '#E4CB9E'], { y: h * 0.34, z: 0.6 });
  }
  return b;
}

function hingeGroup(mesh, { x = 0, z = 0, ry = 0 } = {}) {
  const pivot = new THREE.Group();
  pivot.position.set(x, 0, z);
  pivot.rotation.y = ry;
  const hinge = new THREE.Group();
  hinge.rotation.x = -Math.PI / 2;
  hinge.add(mesh);
  pivot.add(hinge);
  pivot.userData.hinge = hinge;
  return pivot;
}

/** A few strokes of furniture — enough for the silhouette to name the room. */
function furnish(b, g, roomId) {
  switch (roomId) {
    case 'fellowship-hall':
    case 'main-hall': {
      // A stage across the back and ranks of chairs facing it: the silhouette
      // of a room that seats a crowd.
      b.slab(15, 1.6, 5.4, ['#8A6A4B', '#A8845E'], { z: -5.4 });
      b.slab(16, 0.5, 0.6, C.terracotta, { y: 1.6, z: -2.8 });
      b.slab(1.1, 2.4, 1.1, C.timber, { x: -4.6, y: 1.6, z: -4.6 });
      for (let row = 0; row < 3; row++) {
        const cz = 0.4 + row * 3.6;
        for (let i = 0; i < 5; i++) {
          const cx = (i - 2) * 3.2;
          b.slab(2.0, 0.4, 2.0, ['#A9553A', '#CE7C5C'], { x: cx, y: 1.4, z: cz });
          b.slab(2.0, 2.2, 0.4, ['#A9553A', '#CE7C5C'], { x: cx, y: 1.4, z: cz + 0.9 });
          for (const q of [-1, 1]) b.slab(0.32, 1.4, 0.32, C.timber, { x: cx + q * 0.7, z: cz });
        }
      }
      g.slab(11, 4.4, 0.5, '#FFDFA6', { y: 4.6, z: -7.6 });
      break;
    }
    case 'music-room': {
      b.slab(8, 3.4, 4.6, ['#4A3524', '#6E5138'], { x: -3, y: 0, z: -3 });
      b.slab(8.6, 0.6, 5.2, ['#2E2418', '#4A3B29'], { x: -3, y: 3.4, z: -3 });
      b.slab(7.2, 0.7, 0.5, '#F7F1E2', { x: -3, y: 2.6, z: -0.8 });
      for (const s of [-1, 1]) b.slab(0.5, 3.4, 0.5, '#4A3524', { x: -3 + s * 3.4, z: -0.9 });
      b.slab(4, 0.5, 3.4, ['#C9BCA3', '#E8DFCC'], { x: 5, y: 1.6, z: 1 });
      b.slab(4, 3.2, 0.5, ['#C9BCA3', '#E8DFCC'], { x: 5, y: 1.6, z: -0.6 });
      for (const s of [-1, 1]) b.slab(0.45, 1.6, 0.45, C.timber, { x: 5 + s * 1.5, z: 1 });
      break;
    }
    case 'gymnasium': {
      b.slab(18, 0.35, 13, ['#D8B98C', '#EBD4AE'], { y: 0.1, z: -1 });
      b.slab(16, 0.2, 0.3, C.terracotta, { y: 0.5, z: -1 });
      b.add(new THREE.TorusGeometry(2.6, 0.15, 5, 18), C.terracotta, { y: 0.55, z: -1, rx: Math.PI / 2 });
      b.slab(0.7, 9, 0.7, ['#8C9384', '#B0B6A4'], { z: -8.2 });
      b.slab(6, 4, 0.5, '#F7F1E2', { y: 6.4, z: -7.9 });
      b.slab(3, 2, 0.55, C.terracotta, { y: 5.4, z: -7.7 });
      b.add(new THREE.TorusGeometry(1.5, 0.22, 5, 14), '#D2805C', { y: 4.6, z: -6.6, rx: Math.PI / 2 });
      break;
    }
    case 'art-studio': {
      for (const s of [-1, 1]) {
        b.slab(0.5, 6, 0.5, C.timber, { x: s * 4 - 0.8, z: -2, rz: s * 0.12 });
        b.slab(0.5, 6, 0.5, C.timber, { x: s * 4 + 0.8, z: 0.4, rz: -s * 0.12 });
        b.slab(5, 4, 0.4, '#FBF6EA', { x: s * 4, y: 3.6, z: -1.2, rx: -0.16 });
      }
      b.slab(1.6, 3.2, 0.4, C.terracotta, { x: 3.6, y: 3.8, z: -1.0, rx: -0.16 });
      b.slab(9, 1.4, 4, ['#C9BCA3', '#E8DFCC'], { y: 2.2, z: 4 });
      for (const s of [-1, 1]) b.slab(0.5, 2.2, 0.5, C.timber, { x: s * 3.8, z: 4 });
      break;
    }
    case 'community-lounge': {
      // A rug, a long sofa and an armchair drawn up to a low table.
      b.slab(11, 0.3, 8, ['#B98F6E', '#D6B08C'], { y: 0.1, z: 0.4 });
      b.slab(10, 1.5, 4.0, ['#B96545', '#D98D68'], { y: 0.9, z: -3.6 });
      b.slab(10, 2.6, 1.1, ['#8E4529', '#B96545'], { y: 1.9, z: -5.2 });
      for (const s of [-1, 1]) {
        b.slab(0.9, 1.9, 4.0, ['#8E4529', '#B96545'], { x: s * 4.6, y: 1.1, z: -3.6 });
      }
      b.slab(4.4, 1.5, 4.0, ['#B96545', '#D98D68'], { x: -6.8, y: 0.9, z: 1.6, ry: 0.55 });
      b.slab(4.4, 2.4, 1.0, ['#8E4529', '#B96545'], { x: -8.0, y: 1.8, z: 0.9, ry: 0.55 });
      b.slab(5.4, 0.5, 3.4, ['#A8845E', '#C9A67C'], { y: 1.7, z: 1.4, x: 1.4 });
      for (const s of [-1, 1]) {
        b.slab(0.4, 1.5, 0.4, C.timber, { x: 1.4 + s * 2.2, y: 0.75, z: 1.4 });
      }
      b.slab(1.1, 1.3, 1.1, '#F7F1E2', { x: 1.4, y: 2.6, z: 1.4 });
      break;
    }
    default: {
      // tables and chairs — the honest default of a community room
      for (let i = 0; i < 2; i++) {
        b.slab(11, 0.6, 4.2, ['#C9BCA3', '#E8DFCC'], { y: 2.2, z: -3 + i * 6.4 });
        for (const s of [-1, 1]) {
          b.slab(0.5, 2.2, 0.5, C.timber, { x: s * 4.8, z: -3 + i * 6.4 });
        }
        for (const s of [-1, 1]) {
          for (let k = 0; k < 2; k++) {
            const cx = (k - 0.5) * 5;
            b.slab(2.2, 0.4, 2.2, ['#A9553A', '#CE7C5C'], { x: cx, y: 1.5, z: -3 + i * 6.4 + s * 3.6 });
            b.slab(2.2, 2.4, 0.4, ['#A9553A', '#CE7C5C'], { x: cx, y: 1.5, z: -3 + i * 6.4 + s * 4.6 });
            for (const q of [-1, 1]) b.slab(0.35, 1.5, 0.35, C.timber, { x: cx + q * 0.8, z: -3 + i * 6.4 + s * 3.6 });
          }
        }
      }
      break;
    }
  }
}

export function createRoomCard(venueId, room) {
  const group = new THREE.Group();
  const pieces = [];

  // Plinth: a paper page laid on the grass
  const plinth = new Builder();
  plinth.card(roundedRectShape(W + 4, D + 4, 3.2), 1.5, ['#D8CDB6', '#F4ECDC'], {
    rx: -Math.PI / 2,
    y: 0.75,
    bevelSize: 0.6,
    curveSegments: 3,
    shade: 0.76,
  });
  plinth.card(roundedRectShape(W - 1.5, D - 1.5, 2.2), 0.5, ['#E8D9BC', '#FAF2E2'], {
    rx: -Math.PI / 2,
    y: 1.7,
    bevelSize: 0.3,
    curveSegments: 3,
    shade: 0.8,
  });
  const base = plinth.mesh(paperMaterial({ warmth: 0.4 }));
  group.add(base);

  const glow = new Builder();
  const body = new Builder();

  // The floor is the lamp: a warm pool of light with the furniture standing in it.
  glow.slab(W - 4.2, 0.4, D - 4.2, '#F3CE8C', { y: 1.85, shade: 1 });
  body.slab(W - 11, 0.18, D - 9, ['#B4694A', '#D08A66'], { y: 2.25, shade: 1 });
  furnish(body, glow, room.id);

  const interior = body.mesh(paperMaterial({ warmth: 0.45 }));
  interior.position.y = 2.2;
  group.add(interior);

  const glowMesh = glow.mesh(glowMaterial('#FFDFA6'), { cast: false, receive: false });
  glowMesh.position.y = 2.2;
  group.add(glowMesh);

  // Three folding walls
  const back = hingeGroup(wallCard(W, H, WALL_IN, { inner: true }).mesh(paperMaterial({ warmth: 0.4 }), { receive: false }), {
    z: -D / 2,
  });
  back.position.y = 1.6;
  group.add(back);
  pieces.push(back);

  for (const s of [-1, 1]) {
    const side = hingeGroup(wallCard(D, H - 1.5, WALL, {}).mesh(paperMaterial({ warmth: 0.4 }), { receive: false }), {
      x: (s * W) / 2,
      ry: (s * Math.PI) / 2,
    });
    side.position.y = 1.6;
    group.add(side);
    pieces.push(side);
  }

  // A lantern on a shepherd's crook, and a terracotta pennant on the other side
  const LX = -W / 2 - 2.6;
  const LZ = D / 2 + 0.5;
  const LY = 14.6;
  const post = new Builder();
  post.cyl(0.4, 0.55, 19, 6, ['#6E5A44', '#93795C'], { x: LX, y: 1.5, z: LZ });
  post.slab(5.6, 0.5, 0.5, ['#6E5A44', '#93795C'], { x: LX + 2.8, y: 20.3, z: LZ });
  post.cyl(0.24, 0.24, 2.2, 4, '#93795C', { x: LX + 5.3, y: 18.2, z: LZ });
  post.cone(2.9, 2.0, 6, ['#9C4B2F', '#C4693F'], { x: LX + 5.3, y: 16.9, z: LZ });
  post.slab(3.0, 4.6, 0.45, C.terracotta, { x: W / 2 + 2.6, y: 13.4, z: LZ });
  post.slab(0.55, 16, 0.55, ['#6E5A44', '#93795C'], { x: W / 2 + 1.1, y: 1.5, z: LZ });
  const postMesh = post.mesh(paperMaterial({ warmth: 0.4 }));
  group.add(postMesh);

  const lanternB = new Builder();
  lanternB.add(new THREE.OctahedronGeometry(3.0, 0), '#FFE0A8', {
    x: LX + 5.3,
    y: LY,
    z: LZ,
    sy: 1.3,
    shade: 1,
  });
  const lantern = lanternB.mesh(glowMaterial('#FFE0A8'), { cast: false, receive: false });
  group.add(lantern);

  // A pool of warm light on the grass
  const halo = new THREE.Mesh(
    new THREE.CircleGeometry(W * 0.74, 28),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color('#FFD9A0'),
      transparent: true,
      opacity: 0.24,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    })
  );
  halo.rotation.x = -Math.PI / 2;
  halo.position.y = 0.35;
  halo.renderOrder = 2;
  group.add(halo);

  // Where the booking ribbon is printed: the front lip of the plinth, flat on
  // the paper, so it reads when the camera comes down to the card and is a
  // half-centimetre of colour from the village.
  const ribbonMount = new THREE.Group();
  ribbonMount.position.set(0, 1.55, D / 2 + 1.4);
  group.add(ribbonMount);

  // Invisible generous pick target
  const pick = new THREE.Mesh(
    new THREE.BoxGeometry(W + 8, 20, D + 8),
    new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false })
  );
  pick.position.y = 9;
  pick.userData = { venueId, roomId: room.id };
  pick.renderOrder = -1;
  group.add(pick);

  const glowMats = [glowMesh.material, lantern.material];

  // The whole card is a model of a room, so it stands at model scale beside a
  // full-size church. The outer group is what the world positions and lifts.
  const outer = new THREE.Group();
  const scale = scaleFor(room.capacity);
  group.scale.setScalar(scale);
  outer.add(group);

  return {
    group: outer,
    // What the camera should frame: the middle of the open room, and a radius
    // that holds the plinth, the raised walls and the lantern.
    centerY: 8.0 * scale,
    radius: 17.0 * scale,
    pick,
    halo,
    glowMats,
    pieces,
    ribbonMount,
    ribbonWidth: W - 2,
    setOpen(t) {
      const e = t <= 0 ? 0 : t >= 1 ? 1 : 1 - Math.pow(1 - t, 3);
      group.visible = t > 0.002;
      const ang = -Math.PI / 2 + (Math.PI / 2) * e;
      for (const p of pieces) p.userData.hinge.rotation.x = ang;
      const s = 0.35 + 0.65 * e;
      base.scale.set(s, 1, s);
      interior.scale.setScalar(e);
      glowMesh.scale.setScalar(e);
      postMesh.scale.set(1, e, 1);
      lantern.position.y = -14 * (1 - e);
      halo.scale.setScalar(0.4 + 0.6 * e);
      halo.material.opacity = 0.3 * e;
      ribbonMount.visible = e > 0.4;
      ribbonMount.scale.setScalar(0.55 + 0.45 * e);
    },
  };
}
