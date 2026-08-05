// The five landmarks. Each is a character, not a box: a classic white steeple, a
// stone tower with a clock, a gym the size of a barn, a brick porch, a modern fin.
// Built at the origin facing +z; the stage places and rotates them.

import * as THREE from 'three';
import { Builder, roundedRectShape, archTopGeometry } from './builder.js';
import { C } from './palette.js';

const WALL_IVORY = ['#E7DAC2', '#FCF7EC'];
const WALL_WARM = ['#E2D3B6', '#F7EFDF'];
const WALL_STONE = ['#C6AC85', '#EBD9BB'];
const WALL_BRICK = ['#A55F45', '#CE8464'];
const ROOF_TERRA = ['#A24C2E', '#D07A52'];
const ROOF_SLATE = ['#414D3D', '#6E7C61'];
const ROOF_CLAY = ['#8E4529', '#BC6742'];
const TRIM = '#FBF6EC';
const SHADOWED = '#D6C9AE';

/** Tall arched window: a pane plus a rounded head, pushed slightly proud of the wall. */
function archWindow(b, g, x, y, z, w, h, ry = 0, frame = TRIM) {
  b.slab(w + 1.1, h + 1.4, 0.5, frame, { x, y: y - 0.6, z, ry });
  g.slab(w, h, 0.9, C.glass, { x, y, z, ry });
  g.add(archTopGeometry(w / 2, 0.9), C.glass, { x, y: y + h, z, ry });
  b.add(archTopGeometry(w / 2 + 0.55, 0.5), frame, { x, y: y + h, z, ry });
}

function squareWindow(b, g, x, y, z, w, h, ry = 0, frame = TRIM) {
  b.slab(w + 1.0, h + 1.0, 0.45, frame, { x, y: y - 0.5, z, ry });
  g.slab(w, h, 0.85, C.glass, { x, y, z, ry });
}

/** A rank of windows along a wall. `offset` is the wall plane, `center` slides the
 *  rank along it; ry near ±90° means the wall runs in Z instead of X. */
function windowRow(b, g, o) {
  const { count, spacing, y, offset, center = 0, w, h, ry = 0, arched = true, frame = TRIM } = o;
  const alongZ = Math.abs(Math.sin(ry)) > 0.5;
  for (let i = 0; i < count; i++) {
    const t = center + (i - (count - 1) / 2) * spacing;
    const x = alongZ ? offset : t;
    const z = alongZ ? t : offset;
    if (arched) archWindow(b, g, x, y, z, w, h, ry, frame);
    else squareWindow(b, g, x, y, z, w, h, ry, frame);
  }
}

function doors(b, x, y, z, w, h, color = C.terracottaDeep) {
  b.slab(w + 1.6, h + 1.2, 0.6, TRIM, { x, y, z });
  b.slab(w, h, 1.0, color, { x, y, z: z + 0.2 });
  b.slab(0.35, h, 1.2, TRIM, { x, y, z: z + 0.35 });
}

function steps(b, x, y, z, w, count, rise = 0.55, run = 1.5) {
  for (let i = 0; i < count; i++) {
    b.slab(w - i * 1.2, rise, run * (count - i), C.stone, {
      x,
      y: y + i * rise,
      z: z + (run * (count - i)) / 2,
    });
  }
}

function colonnade(b, count, spacing, x0, y, z, h, r = 1.0) {
  for (let i = 0; i < count; i++) {
    const x = x0 + (i - (count - 1) / 2) * spacing;
    b.cyl(r, r * 1.12, h, 8, TRIM, { x, y, z });
    b.slab(r * 3, 0.7, r * 3, TRIM, { x, y: y + h, z });
  }
}

function cross(b, x, y, z, h = 4.5, thick = 0.5, color = TRIM) {
  b.slab(thick, h, thick, color, { x, y, z });
  b.slab(h * 0.52, thick, thick, color, { x, y: y + h * 0.66, z });
}

/** A clipped hedge card — cheap greenery that reads as paper-cut topiary. */
function hedge(b, x, z, len, h, ry = 0, color = ['#3F5A3D', '#6F8A5F']) {
  b.slab(len, h * 0.7, 3.4, color, { x, y: 0, z, ry });
  b.slab(len - 1.2, h * 0.42, 2.4, color[1], { x, y: h * 0.66, z, ry });
}

function planter(b, x, z, w = 5, d = 3.4) {
  b.slab(w, 1.6, d, C.stoneWarm, { x, z });
  b.slab(w - 1.2, 1.1, d - 1.2, ['#3F5A3D', '#7A9A62'], { x, y: 1.4, z });
}

// ---------------------------------------------------------------------------

function grace(b, g) {
  const naveW = 19;
  const naveD = 38;
  const wallH = 13;

  // Nave
  b.slab(naveW, wallH, naveD, WALL_IVORY, { z: -6 });
  b.gable(naveW + 2.4, 11.5, naveD + 2.2, ROOF_TERRA, { y: wallH, z: -6 });
  b.slab(naveW + 3, 0.9, naveD + 2.8, TRIM, { y: wallH - 0.7, z: -6 });

  const naveRow = { count: 4, spacing: 8.2, y: 5.0, center: -8, w: 2.5, h: 6.0, ry: Math.PI / 2 };
  windowRow(b, g, { ...naveRow, offset: naveW / 2 - 0.1 });
  windowRow(b, g, { ...naveRow, offset: -naveW / 2 + 0.1 });

  // Tower + spire, standing clear of the nave so the silhouette reads from afar
  const tz = 19;
  b.slab(11.5, 33, 11.5, WALL_IVORY, { z: tz });
  b.slab(12.8, 1.2, 12.8, TRIM, { y: 32.2, z: tz });
  // belfry: four corner piers with the bell chamber glowing between them
  b.slab(10.4, 9, 10.4, ['#D8C9AC', '#EFE4CE'], { y: 33.4, z: tz });
  for (const [ox, oz] of [[-4.4, -4.4], [4.4, -4.4], [-4.4, 4.4], [4.4, 4.4]]) {
    b.slab(2.0, 9.2, 2.0, TRIM, { x: ox, y: 33.4, z: tz + oz });
  }
  g.slab(6.8, 6.0, 6.8, '#E9C288', { y: 34.8, z: tz });
  b.slab(12.4, 1.4, 12.4, TRIM, { y: 42.4, z: tz });
  b.cone(8.1, 26, 4, ['#E8DECB', '#FFFDF6'], { y: 43.6, z: tz, ry: Math.PI / 4 });
  b.cyl(0.45, 0.45, 2.6, 6, TRIM, { y: 69.4, z: tz });
  cross(b, 0, 71.8, tz, 4.8, 0.5, '#F3D9A6');

  // South face: door, portico, steps
  doors(b, 0, 0, tz + 5.9, 5.4, 8.8);
  archWindow(b, g, 0, 17.5, tz + 5.85, 3.0, 4.4);
  colonnade(b, 4, 4.6, 0, 0, tz + 10.2, 10.6, 0.9);
  b.gable(6.6, 3.6, 16.4, ROOF_TERRA, { y: 11.3, z: tz + 10.2, ry: Math.PI / 2 });
  b.slab(17, 0.7, 7.2, TRIM, { y: 10.7, z: tz + 10.2 });
  steps(b, 0, 0, tz + 13.4, 12, 3);

  // Fellowship hall — the big welcoming wing, west
  const hx = -27;
  b.slab(31, 11.5, 27, WALL_WARM, { x: hx, z: -5 });
  b.gable(29, 6.2, 33, ROOF_TERRA, { x: hx, y: 11.5, z: -5, ry: Math.PI / 2 });
  b.slab(33.6, 0.8, 29.6, TRIM, { x: hx, y: 11, z: -5 });
  for (let i = 0; i < 4; i++) {
    squareWindow(b, g, hx - 10.5 + i * 7, 5.4, 8.6, 4.6, 5.4);
  }
  squareWindow(b, g, hx - 8, 5.4, -18.6, 4.6, 5.4);
  squareWindow(b, g, hx + 4, 5.4, -18.6, 4.6, 5.4);
  doors(b, hx + 9, 0, 8.7, 5.0, 7.4, C.terracotta);
  b.slab(9, 0.7, 5.2, ROOF_TERRA, { x: hx + 9, y: 8.2, z: 10.6 });
  b.slab(0.5, 8.2, 0.5, TRIM, { x: hx + 5.2, z: 12.9 });
  b.slab(0.5, 8.2, 0.5, TRIM, { x: hx + 12.8, z: 12.9 });
  steps(b, hx + 9, 0, 13, 7, 2);
  // connector
  b.slab(6, 9, 12, WALL_IVORY, { x: -13, z: -2 });
  b.gable(7, 2.6, 12, ROOF_TERRA, { x: -13, y: 9, z: -2 });

  // grounds
  hedge(b, -1, 34.5, 26, 2.4);
  planter(b, -9.5, 32);
  planter(b, 9.5, 32);

  return {
    footprint: { x: 46, z: 46 },
    rooms: {
      'fellowship-hall': { x: -46, z: 42, ry: 0.1 },
      'youth-activity-room': { x: 36, z: 34, ry: -0.55 },
    },
    // Where correspondence arrives: the front door, and the patch of ground
    // beside it where a lantern can stand without fouling the portico.
    door: { x: 0, y: 6, z: 27 },
    lantern: { x: -11.5, z: 30 },
  };
}

function viennaPres(b, g) {
  const naveW = 20;
  const naveD = 38;
  const wallH = 15;

  b.slab(naveW, wallH, naveD, WALL_STONE, { z: -2 });
  b.gable(naveW + 2.4, 13, naveD + 2, ROOF_SLATE, { y: wallH, z: -2 });
  b.slab(naveW + 3, 0.9, naveD + 2.6, C.stoneWarm, { y: wallH - 0.7, z: -2 });
  // quoins
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      b.slab(2.2, wallH, 2.2, '#EBDCC0', { x: sx * (naveW / 2 - 0.4), z: -2 + sz * (naveD / 2 - 0.4) });
    }
  }

  // transept
  b.slab(30, 12.5, 13, WALL_STONE, { z: -6 });
  b.gable(14.2, 8, 31.5, ROOF_SLATE, { y: 12.5, z: -6, ry: Math.PI / 2 });

  // Gothic windows down each side
  for (let i = 0; i < 4; i++) {
    const z = -18 + i * 9.5;
    archWindow(b, g, naveW / 2 - 0.2, 5.6, z, 2.4, 7.2, Math.PI / 2, '#E9D8B8');
    archWindow(b, g, -naveW / 2 + 0.2, 5.6, z, 2.4, 7.2, Math.PI / 2, '#E9D8B8');
  }

  // South front: rose window, deep-set door
  b.slab(naveW + 1.4, 20, 1.6, WALL_STONE, { z: naveD / 2 - 2.2 });
  g.add(new THREE.CylinderGeometry(3.4, 3.4, 1.2, 12), '#F6D89E', {
    y: 19,
    z: naveD / 2 - 1.4,
    rx: Math.PI / 2,
  });
  b.add(new THREE.TorusGeometry(3.9, 0.65, 6, 14), '#EDDCBC', { y: 19, z: naveD / 2 - 1.2 });
  for (let i = 0; i < 6; i++) {
    b.slab(0.45, 6.6, 0.55, '#EDDCBC', { y: 15.7, z: naveD / 2 - 1.2, rz: (i / 6) * Math.PI });
  }
  doors(b, 0, 0, naveD / 2 - 1.2, 5.2, 9, '#6B4A31');
  b.add(archTopGeometry(2.6, 1.2), '#6B4A31', { y: 9, z: naveD / 2 - 1.0 });
  steps(b, 0, 0, naveD / 2 + 0.4, 11, 4);

  // Bell tower, north-east corner — the historic silhouette
  const tx = 15.5;
  const tz = 11;
  b.slab(13, 34, 13, WALL_STONE, { x: tx, z: tz });
  for (let i = 0; i < 3; i++) {
    b.slab(13.6 - i * 0.4, 0.8, 13.6 - i * 0.4, '#E4D2B2', { x: tx, y: 24 + i * 1.1, z: tz });
  }
  // louvred belfry openings
  for (const [dx, dz, ry] of [[0, 6.6, 0], [0, -6.6, 0], [6.6, 0, Math.PI / 2], [-6.6, 0, Math.PI / 2]]) {
    b.slab(5.4, 8, 0.7, '#4A4335', { x: tx + dx, y: 15, z: tz + dz, ry });
    b.add(archTopGeometry(2.7, 0.7), '#4A4335', { x: tx + dx, y: 23, z: tz + dz, ry });
  }
  // clock face
  b.add(new THREE.CylinderGeometry(3.5, 3.5, 0.9, 16), '#F6EEDC', { x: tx, y: 29.5, z: tz + 6.7, rx: Math.PI / 2 });
  b.add(new THREE.TorusGeometry(3.7, 0.5, 6, 16), C.terracotta, { x: tx, y: 29.5, z: tz + 6.9 });
  // Hands run out from the hub, not across it — otherwise the face reads as a cross.
  b.cyl(0.45, 0.45, 0.5, 8, C.terracottaDeep, { x: tx, y: 29.5, z: tz + 7.35, rx: Math.PI / 2 });
  b.slab(0.4, 2.4, 0.4, C.terracottaDeep, { x: tx, y: 30.6, z: tz + 7.3 });
  b.slab(1.7, 0.4, 0.4, C.terracottaDeep, { x: tx + 0.85, y: 29.5, z: tz + 7.3 });
  // crenellated cap
  for (let i = 0; i < 4; i++) {
    for (const s of [-1, 1]) {
      b.slab(2.2, 2.6, 2.2, '#E4D2B2', { x: tx + (i - 1.5) * 3.6, y: 34.6, z: tz + s * 5.4 });
      b.slab(2.2, 2.6, 2.2, '#E4D2B2', { x: tx + s * 5.4, y: 34.6, z: tz + (i - 1.5) * 3.6 });
    }
  }
  b.cone(7.6, 11, 4, ROOF_SLATE, { x: tx, y: 36.8, z: tz, ry: Math.PI / 4 });
  cross(b, tx, 48, tz, 3.8, 0.45, '#E8D3A6');

  // Music room wing, west
  b.slab(17, 10, 15, WALL_STONE, { x: -18, z: 2 });
  b.gable(18.4, 7, 16.2, ROOF_SLATE, { x: -18, y: 10, z: 2 });
  archWindow(b, g, -18, 4.6, 9.7, 3.4, 4.6);
  archWindow(b, g, -26.6, 4.6, 2, 3.0, 4.4, Math.PI / 2);
  b.slab(1.6, 4.6, 1.6, C.stoneWarm, { x: -18, y: 17, z: -3.5 });

  // Garden room + garden, east
  b.slab(14, 9, 13, WALL_WARM, { x: 12, z: -20 });
  b.slab(15.4, 0.9, 14.4, C.stoneWarm, { x: 12, y: 9, z: -20 });
  b.slab(15.4, 1.2, 14.4, ROOF_SLATE, { x: 12, y: 9.6, z: -20 });
  squareWindow(b, g, 12, 4.6, -13.3, 7.4, 4.8);
  hedge(b, 12, -30, 20, 2.2);
  hedge(b, 23, -22, 14, 2.2, Math.PI / 2);
  planter(b, 4, -29, 4, 3);
  // arbor
  for (const s of [-1, 1]) {
    b.slab(0.6, 6, 0.6, C.timber, { x: 12 + s * 3, z: -27.5 });
  }
  b.slab(7.4, 0.5, 0.6, C.timber, { x: 12, y: 6.2, z: -27.5 });
  b.slab(0.6, 0.5, 4, C.timber, { x: 12, y: 6.5, z: -27.5 });

  return {
    footprint: { x: 48, z: 46 },
    rooms: {
      'music-room': { x: -46, z: 26, ry: 0.55 },
      'garden-meeting-room': { x: 36, z: -46, ry: 2.55 },
    },
    door: { x: 0, y: 6, z: 20 },
    lantern: { x: -10.5, z: 23 },
  };
}

function oaktonBaptist(b, g) {
  // Sanctuary
  b.slab(21, 13, 27, WALL_IVORY, { x: -14, z: 0 });
  b.hip(29, 23, 8, ROOF_TERRA, { x: -14, y: 13, ry: Math.PI / 2, ridge: 11 });
  b.slab(23.6, 0.8, 29.6, TRIM, { x: -14, y: 12.6 });
  windowRow(b, g, { count: 3, spacing: 7.4, y: 5.2, offset: 13.7, center: -14, w: 3.2, h: 5.6 });
  windowRow(b, g, {
    count: 3, spacing: 7.6, y: 5.2, offset: -24.6, center: -2, w: 2.8, h: 5.2, ry: Math.PI / 2,
  });
  doors(b, -14, 0, 13.7, 6.4, 8, C.terracotta);
  b.slab(13, 0.8, 6, ROOF_TERRA, { x: -14, y: 8.8, z: 16.4 });
  b.slab(0.55, 8.8, 0.55, TRIM, { x: -19, z: 18.9 });
  b.slab(0.55, 8.8, 0.55, TRIM, { x: -9, z: 18.9 });
  steps(b, -14, 0, 19.4, 9, 2);
  // little tower
  b.slab(8, 20, 8, WALL_IVORY, { x: -23.5, z: 9 });
  b.slab(9, 0.9, 9, TRIM, { x: -23.5, y: 19.6, z: 9 });
  g.slab(5.4, 3.6, 5.4, '#E9C288', { x: -23.5, y: 20.6, z: 9 });
  b.cone(6.2, 13, 4, ['#E5D9C2', '#FBF6EC'], { x: -23.5, y: 22.6, z: 9, ry: Math.PI / 4 });
  cross(b, -23.5, 36.2, 9, 3.4, 0.42, '#F0DBAD');

  // Gymnasium — the barn-sized volume this church is known for
  const gx = 20;
  b.slab(42, 17, 32, WALL_WARM, { x: gx, z: -2 });
  b.slab(43, 4.2, 33, ['#7E9670', '#9BB187'], { x: gx, y: 0, z: -2 });
  b.gable(34, 7, 44, ROOF_TERRA, { x: gx, y: 17, z: -2, ry: Math.PI / 2 });
  b.slab(44.6, 0.9, 34.6, TRIM, { x: gx, y: 16.4, z: -2 });
  for (let i = 0; i < 5; i++) {
    squareWindow(b, g, gx - 14 + i * 7, 12.5, 14.1, 4.6, 3.0);
  }
  for (let i = 0; i < 4; i++) {
    squareWindow(b, g, 41.1, 12.5, -14 + i * 8, 4.6, 3.0, Math.PI / 2);
  }
  doors(b, gx - 2, 0, 14.2, 8.4, 8.6, C.terracottaDeep);
  b.slab(15, 1.0, 6.4, ROOF_TERRA, { x: gx - 2, y: 9.4, z: 17.2 });
  b.slab(0.6, 9.4, 0.6, TRIM, { x: gx - 8.4, z: 19.9 });
  b.slab(0.6, 9.4, 0.6, TRIM, { x: gx + 4.4, z: 19.9 });

  // Classroom block behind
  b.slab(24, 9, 13, WALL_IVORY, { x: 4, z: -25 });
  b.slab(25, 1.2, 14, ROOF_TERRA, { x: 4, y: 9, z: -25 });
  for (let i = 0; i < 3; i++) squareWindow(b, g, -4 + i * 8, 4.6, -18.3, 5.0, 4.2);

  // Connector
  b.slab(10, 9, 9, WALL_IVORY, { x: -3, z: 4 });
  b.slab(11, 1.0, 10, ROOF_TERRA, { x: -3, y: 9, z: 4 });

  return {
    footprint: { x: 62, z: 48 },
    rooms: {
      'gymnasium': { x: 56, z: 34, ry: -0.62 },
      'classroom-b': { x: -20, z: -52, ry: 3.34 },
      // Kept clear of the lot and the sanctuary: the annex's card stands on the
      // grass in front of the annex itself, for the day its listing goes up.
      'renovation-annex': { x: -68, z: 22, ry: 0.75 },
    },
    annex: { x: -44, z: -26 },
    parking: { x: 8, z: 54 },
    door: { x: -14, y: 6, z: 17 },
    lantern: { x: -5, z: 20 },
  };
}

function dunnLoring(b, g) {
  b.slab(19, 12, 30, WALL_BRICK, { z: -2 });
  b.gable(21, 9, 32, ROOF_SLATE, { y: 12, z: -2 });
  b.slab(21.6, 0.9, 32.6, TRIM, { y: 11.6, z: -2 });
  b.slab(20.4, 1.1, 31.4, TRIM, { y: 0.2, z: -2 });

  const dlRow = { count: 4, spacing: 7.2, y: 4.8, center: -2, w: 2.8, h: 5.6, ry: Math.PI / 2 };
  windowRow(b, g, { ...dlRow, offset: 9.6 });
  windowRow(b, g, { ...dlRow, offset: -9.6 });

  // Bell cote over the front gable — friendly, not grand
  b.slab(6.4, 8, 2.2, TRIM, { y: 18.4, z: 12.4 });
  b.add(archTopGeometry(2.2, 2.3), '#5D4A33', { y: 24.4, z: 12.4 });
  b.gable(7.6, 2.6, 3.2, ROOF_TERRA, { y: 26.4, z: 12.4 });
  b.cone(1.05, 2.4, 7, '#C9A45E', { y: 21.4, z: 12.4 });
  cross(b, 0, 29, 12.4, 3.2, 0.4, TRIM);

  // Welcoming porch
  doors(b, 0, 0, 13.2, 6.0, 8.2, C.terracotta);
  b.slab(18, 1.0, 9, ROOF_TERRA, { y: 9.6, z: 17.6 });
  b.slab(18.8, 0.7, 9.8, TRIM, { y: 9.2, z: 17.6 });
  for (const x of [-7.8, -2.6, 2.6, 7.8]) b.slab(0.7, 9.2, 0.7, TRIM, { x, z: 21.6 });
  steps(b, 0, 0, 22.2, 12, 2);
  b.slab(19, 0.8, 10, C.stone, { y: -0.4, z: 17.6 });

  // Studio + lounge wing, west, with a big north light
  b.slab(22, 10, 18, WALL_WARM, { x: -20, z: -6 });
  b.gable(23.4, 5.4, 19.4, ROOF_TERRA, { x: -20, y: 10, z: -6 });
  b.slab(24, 0.8, 20, TRIM, { x: -20, y: 9.6, z: -6 });
  squareWindow(b, g, -20, 5.2, 3.2, 12.5, 5.2);
  squareWindow(b, g, -31.1, 5.2, -6, 8.5, 5.2, Math.PI / 2);
  b.slab(2.6, 5, 2.6, C.clay, { x: -27, y: 13.4, z: -12 });
  b.slab(3.2, 0.8, 3.2, C.stoneWarm, { x: -27, y: 18.2, z: -12 });
  b.slab(7, 9, 8, WALL_BRICK, { x: -11, z: 0 });
  b.slab(7.8, 1.0, 8.8, ROOF_TERRA, { x: -11, y: 9, z: 0 });

  // Community garden beds
  for (let i = 0; i < 3; i++) {
    b.slab(9, 1.4, 4, C.timber, { x: 18, z: -14 + i * 6.5 });
    b.slab(8.2, 0.9, 3.2, ['#4A6540', '#87A56C'], { x: 18, y: 1.2, z: -14 + i * 6.5 });
  }
  hedge(b, 18, 8, 14, 2.0, Math.PI / 2);

  return {
    footprint: { x: 46, z: 44 },
    rooms: {
      'art-studio': { x: -46, z: 24, ry: 0.62 },
      'community-lounge': { x: 36, z: 34, ry: -0.62 },
    },
    door: { x: 0, y: 6, z: 17 },
    lantern: { x: -11.5, z: 21 },
  };
}

function merrifield(b, g) {
  // Main hall — one clean mono-pitch volume
  b.slab(36, 12, 27, WALL_IVORY, { z: -2 });
  b.add(new THREE.BoxGeometry(39, 1.5, 31), ['#C9BCA3', '#F0E8D8'], { y: 17.8, z: -2, rz: -0.145 });
  b.add(new THREE.BoxGeometry(39.4, 0.9, 31.4), ROOF_TERRA, { y: 16.9, z: -2, rz: -0.145 });
  // clerestory band under the slope
  g.add(new THREE.BoxGeometry(35, 3.0, 26), '#F7D9A2', { y: 13.2, z: -2 });

  // Full-height glazing to the south
  g.slab(26, 11.5, 1.2, C.glass, { z: 11.6 });
  for (let i = 0; i < 6; i++) {
    b.slab(0.7, 12.2, 1.8, TRIM, { x: -13 + i * 5.2, z: 11.8 });
  }
  b.slab(27.6, 0.9, 1.9, TRIM, { y: 11.6, z: 11.8 });
  b.slab(27.6, 0.9, 1.9, TRIM, { y: -0.2, z: 11.8 });

  // Entrance: cantilevered canopy + terracotta fin with a cut cross
  b.slab(16, 0.9, 8.5, ['#B2A78E', '#E9E0CE'], { y: 8.6, z: 15.4 });
  b.slab(16.4, 0.6, 0.9, C.terracotta, { y: 8.4, z: 19.4 });
  b.slab(0.9, 8.6, 0.9, TRIM, { x: -7, z: 19 });
  doors(b, 0, 0, 12.4, 7.2, 8.2, '#8E4529');

  const fx = -22.5;
  b.slab(3.0, 32, 5.5, ['#9C4B2F', '#CE7852'], { x: fx, z: 8 });
  b.slab(3.4, 1.2, 5.9, C.terracottaDeep, { x: fx, y: 31.6, z: 8 });
  g.slab(3.4, 6.4, 1.1, '#FFE2AE', { x: fx, y: 19, z: 8 });
  g.slab(3.4, 1.1, 3.4, '#FFE2AE', { x: fx, y: 21.6, z: 8 });

  // Low side wing with a planted roof
  b.slab(17, 7.5, 16, WALL_WARM, { x: 26, z: -6 });
  b.slab(18, 1.0, 17, C.stoneWarm, { x: 26, y: 7.5, z: -6 });
  b.slab(17.4, 0.9, 16.4, ['#6C8A5E', '#93AF7C'], { x: 26, y: 8.4, z: -6 });
  squareWindow(b, g, 26, 3.8, 2.2, 9.5, 4.0);
  squareWindow(b, g, 34.6, 3.8, -6, 8.0, 4.0, Math.PI / 2);

  // Plaza: low wall, planters, a paved apron
  b.slab(44, 0.6, 16, ['#CDC0A8', '#E6DCC8'], { y: -0.2, z: 24 });
  b.slab(30, 1.5, 0.9, C.stoneWarm, { z: 31.4 });
  planter(b, -17, 26, 6, 4);
  planter(b, 17, 26, 6, 4);
  planter(b, 0, 30.6, 8, 3);

  // Mosaic-district neighbour: the shared parking deck, three clean decks deep
  b.slab(20, 11, 24, ['#C6BAA2', '#E8E0CE'], { x: 42, z: 14 });
  for (let i = 0; i < 3; i++) {
    b.slab(21, 1.1, 25, ['#B5A88E', '#D8CFBA'], { x: 42, y: 2.4 + i * 3.4, z: 14 });
    b.slab(20.6, 0.5, 0.8, C.terracotta, { x: 42, y: 3.5 + i * 3.4, z: 26.4 });
  }
  b.slab(21, 1.3, 25, ['#B5A88E', '#DCD3BE'], { x: 42, y: 11, z: 14 });
  for (const sx of [-9, 9]) b.slab(1.6, 12.4, 1.6, ['#B0A38A', '#D4CBB6'], { x: 42 + sx, z: 2 });

  return {
    footprint: { x: 52, z: 44 },
    rooms: {
      'main-hall': { x: 2, z: 52, ry: 0 },
    },
    door: { x: 0, y: 6, z: 16 },
    lantern: { x: 11, z: 19 },
  };
}

const BUILDERS = {
  'grace-community-vienna': grace,
  'vienna-presbyterian': viennaPres,
  'oakton-baptist': oaktonBaptist,
  'dunn-loring-umc': dunnLoring,
  'merrifield-fellowship': merrifield,
};

export function buildChurch(venueId) {
  const body = new Builder();
  const glow = new Builder();
  const meta = BUILDERS[venueId](body, glow);
  return { body, glow, meta };
}
