// Everything in the village that is not a church: the unfinished annex, the
// parking lot, cars, the Metro motif, houses, and the trees — model and cut-out.

import * as THREE from 'three';
import { roundedRectShape } from './builder.js';
import { C } from './palette.js';

const TRIM = '#FBF6EC';

/** The annex itself: a small hall waiting to be finished, and then simply a room. */
export function buildAnnexShell(b, g) {
  b.slab(16, 7, 13, ['#C9BBA0', '#E4D9C2'], {});
  for (let i = 0; i < 5; i++) {
    b.slab(0.7, 4.5, 0.7, C.timber, { x: -6.4 + i * 3.2, y: 7, z: 5.6 });
    b.slab(0.7, 4.5, 0.7, C.timber, { x: -6.4 + i * 3.2, y: 7, z: -5.6 });
  }
  b.slab(16.6, 0.6, 0.7, C.timber, { y: 11.2, z: 5.6 });
  b.slab(16.6, 0.6, 0.7, C.timber, { y: 11.2, z: -5.6 });
  b.gable(17, 4, 13.6, ['#8A6A4B', '#A8845E'], { y: 11.4 });
  // Windows and a door that only light up once the listing is published.
  g.slab(3.6, 3.0, 0.7, C.glass, { x: -4.2, y: 2.4, z: 6.5 });
  g.slab(3.6, 3.0, 0.7, C.glass, { x: 4.2, y: 2.4, z: 6.5 });
  b.slab(3.4, 5.2, 0.8, C.terracotta, { x: 0, y: 0, z: 6.5 });
}

/** The scaffolding that comes down on publish: poles, planks, tarps, a mixer. */
export function buildAnnexScaffold(b) {
  for (const sx of [-9.4, 9.4]) {
    for (const sz of [-7.2, 0, 7.2]) {
      b.slab(0.42, 15, 0.42, '#9BA08C', { x: sx, z: sz });
    }
    for (let lvl = 1; lvl <= 3; lvl++) {
      b.slab(0.42, 0.42, 15, '#9BA08C', { x: sx, y: lvl * 4.6, z: 0 });
      b.slab(2.6, 0.5, 15.2, ['#B99A6E', '#D6BC93'], { x: sx + (sx > 0 ? -1.1 : 1.1), y: lvl * 4.6, z: 0 });
    }
  }
  b.slab(0.42, 0.42, 20, '#9BA08C', { y: 13.8, z: 0, ry: Math.PI / 2 });
  for (const sz of [-7.2, 7.2]) {
    b.slab(20, 0.42, 0.42, '#9BA08C', { y: 15, z: sz });
    b.slab(0.4, 15, 0.4, '#9BA08C', { x: 0, z: sz, ry: 0 });
  }
  // tarp, tied back over the open frame
  b.add(new THREE.BoxGeometry(21.6, 14, 0.35), ['#D8DCCB', '#EFF1E4'], { y: 7.6, z: 8.4, rx: 0.09 });
  b.add(new THREE.BoxGeometry(8, 13, 0.35), ['#CFD4C1', '#E6E9DA'], { x: -12, y: 7.2, z: 2, ry: Math.PI / 2, rx: 0.06 });
  b.slab(1.2, 5.2, 1.2, C.stoneWarm, { x: 13, z: -9 });
  b.slab(3.4, 1.2, 3.4, ['#B9AE9E', '#D2C8B6'], { x: 13, y: 0, z: -9 });
}

/**
 * A church a host has just placed on the map: a modest chapel, built plainly so
 * it reads as new to the village rather than as one of the five landmarks.
 */
export function buildPlacedChapel(b, g) {
  const TRIM_ = '#FBF6EC';
  b.slab(15, 10, 24, ['#E2D3B6', '#F7EFDF'], {});
  b.gable(17, 8, 26, ['#A24C2E', '#D07A52'], { y: 10 });
  b.slab(17.4, 0.7, 26.4, TRIM_, { y: 9.6 });
  for (const s of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      g.slab(2.0, 4.0, 0.8, C.glass, { x: s * 7.4, y: 3.4, z: -7 + i * 7, ry: Math.PI / 2 });
      b.slab(2.6, 4.8, 0.5, TRIM_, { x: s * 7.6, y: 3.0, z: -7 + i * 7, ry: Math.PI / 2 });
    }
  }
  // Porch, door, and a slim bell cote — enough for a silhouette at distance.
  b.slab(6.0, 7.2, 0.9, TRIM_, { z: 12 });
  b.slab(4.4, 6.4, 1.2, C.terracottaDeep, { z: 12.4 });
  b.slab(9, 0.8, 4.4, ['#A24C2E', '#D07A52'], { y: 8.2, z: 14.4 });
  for (const s of [-1, 1]) b.slab(0.6, 8.2, 0.6, TRIM_, { x: s * 3.8, z: 16.2 });
  b.slab(4.2, 6.5, 1.8, TRIM_, { y: 17.6, z: 10.4 });
  b.gable(5.4, 2.2, 2.6, ['#A24C2E', '#D07A52'], { y: 24.1, z: 10.4 });
  g.slab(2.2, 2.6, 0.6, '#F3D9A6', { y: 19.2, z: 11.2 });
  b.slab(0.42, 3.8, 0.42, TRIM_, { y: 26.3, z: 10.4 });
  b.slab(2.0, 0.42, 0.42, TRIM_, { y: 28.7, z: 10.4 });
}

/** Oakton's parking lot — the suburban truth of the listing. */
export function buildParking(b) {
  const shape = roundedRectShape(54, 32, 6);
  b.card(shape, 0.8, ['#8B8A82', '#A6A79C'], { rx: -Math.PI / 2, y: 0.3, bevel: false });
  for (let i = 0; i < 8; i++) {
    const x = -21 + i * 6;
    b.slab(0.5, 0.25, 10, C.lineWhite, { x, y: 0.85, z: -6.5 });
    b.slab(0.5, 0.25, 10, C.lineWhite, { x, y: 0.85, z: 7 });
  }
  b.slab(48, 0.25, 0.6, C.lineWhite, { y: 0.85, z: 0.3 });
  for (let i = 0; i < 2; i++) {
    b.slab(5.4, 0.3, 10, ['#9A6E58', '#B98C72'], { x: -24 + i * 6, y: 0.8, z: -6.5 });
  }
}

/** Cars, parked and patient. */
export function buildCar(b, color) {
  b.slab(3.2, 1.5, 6.6, [color, color], { y: 0.5 });
  b.slab(2.9, 1.3, 3.4, ['#5E6A6E', '#93A6AC'], { y: 2.0, z: -0.3 });
  for (const sx of [-1.5, 1.5]) {
    for (const sz of [-2.2, 2.2]) {
      b.add(new THREE.CylinderGeometry(0.62, 0.62, 0.5, 8), '#3A3730', { x: sx, y: 0.62, z: sz, rz: Math.PI / 2 });
    }
  }
}

/** The tiny Metro motif near Dunn Loring — canopy, pylon, a sliver of track. */
export function buildMetro(b, g) {
  b.slab(46, 2.2, 18, ['#B7AB94', '#DCD2BE'], {});
  b.slab(44, 0.5, 3, C.lineWhite, { y: 2.3, z: 6.5 });
  for (const sx of [-16, 0, 16]) {
    b.slab(0.9, 8, 0.9, TRIM, { x: sx, y: 2.2, z: -3 });
    b.slab(0.9, 8, 0.9, TRIM, { x: sx, y: 2.2, z: 3 });
  }
  b.add(new THREE.BoxGeometry(42, 1.0, 15), ['#A24C2E', '#D07A52'], { y: 11.4, rz: 0 });
  b.slab(42.6, 0.7, 1.0, C.terracottaDeep, { y: 10.9, z: 7.4 });
  b.slab(42.6, 0.7, 1.0, C.terracottaDeep, { y: 10.9, z: -7.4 });
  for (let i = 0; i < 4; i++) {
    g.slab(1.6, 0.6, 1.6, '#FFE3B0', { x: -13.5 + i * 9, y: 10.6 });
  }
  // benches
  for (const sx of [-9, 9]) {
    b.slab(6, 0.5, 1.6, C.timber, { x: sx, y: 3.6, z: 0 });
    b.slab(6, 1.6, 0.4, C.timber, { x: sx, y: 4.1, z: -0.8 });
  }
  // brown-line pylon with the M
  b.slab(1.6, 16, 1.6, ['#6E6152', '#8B7C68'], { x: -26, z: 8 });
  b.slab(9, 6, 0.9, ['#5B4E40', '#6E6152'], { x: -26, y: 16, z: 8 });
  g.slab(7.4, 4.6, 0.5, '#F5E2BD', { x: -26, y: 16, z: 8.6 });
  b.slab(0.9, 3.4, 0.6, C.terracottaDeep, { x: -27.6, y: 16, z: 9.0 });
  b.slab(0.9, 3.4, 0.6, C.terracottaDeep, { x: -24.4, y: 16, z: 9.0 });
  b.slab(0.8, 2.2, 0.6, C.terracottaDeep, { x: -26.8, y: 16.4, z: 9.0, rz: -0.7 });
  b.slab(0.8, 2.2, 0.6, C.terracottaDeep, { x: -25.2, y: 16.4, z: 9.0, rz: 0.7 });
  // rails, on a low ballast bank so they never float off the ground
  b.slab(50, 0.9, 8, ['#B0A48C', '#C9BEA6'], { y: -0.5, z: -12 });
  for (let i = 0; i < 9; i++) {
    b.slab(2.0, 0.4, 6, ['#6B5138', '#87694A'], { x: -24 + i * 6, y: 0.4, z: -12 });
  }
  for (const sz of [-13.5, -10.5]) {
    b.slab(50, 0.5, 0.5, ['#8B8272', '#A79C88'], { y: 0.8, z: sz });
  }
}

/** A little village house — scale, life, and somewhere for the light to land. */
export function buildHouse(b, wall, roof, w = 11, d = 9, h = 7) {
  b.slab(w, h, d, wall, {});
  b.gable(w + 1.4, h * 0.62, d + 1.2, roof, { y: h });
  b.slab(w + 1.8, 0.5, d + 1.6, '#F3EBDA', { y: h - 0.4 });
  b.slab(1.5, 3.2, 1.5, '#C4B79E', { x: w * 0.26, y: h + 1.6, z: -d * 0.18 });
  b.slab(2.6, 3.4, 0.5, '#7C5B3E', { y: 0, z: d / 2 });
  b.slab(2.2, 2.0, 0.5, '#EBDCBE', { x: -w * 0.28, y: 3.4, z: d / 2 });
  b.slab(2.2, 2.0, 0.5, '#EBDCBE', { x: w * 0.28, y: 3.4, z: d / 2 });
}

/** A stylised tree; kind is 0 broadleaf, 1 conifer, 2 poplar, 3 blossom. */
export function buildTree(b, kind, scale = 1, tint = 0) {
  const greens = [
    ['#3F5E3A', '#89A76A'],
    ['#37563A', '#6F9459'],
    ['#4A6845', '#97B472'],
    ['#55663C', '#A9BC72'],
  ];
  const leaf = greens[(kind + tint) % greens.length];
  if (kind === 1) {
    b.cyl(0.55, 0.9, 4.2 * scale, 6, ['#5B4630', '#7A6045'], {});
    for (let i = 0; i < 3; i++) {
      const t = i / 3;
      b.cone((5.2 - i * 1.35) * scale, (7.5 - i * 1.2) * scale, 7, leaf, { y: (3.4 + t * 7.6) * scale });
    }
  } else if (kind === 2) {
    b.cyl(0.45, 0.8, 5 * scale, 6, ['#5B4630', '#7A6045'], {});
    b.add(new THREE.SphereGeometry(3.4 * scale, 7, 8), leaf, { y: 10.5 * scale, sy: 2.1, sx: 0.85, sz: 0.85 });
  } else {
    // Kind 3 is the one that has already turned — warm ochre against all that sage.
    const crown = kind === 3 ? ['#A8763A', '#E0BE72'] : leaf;
    b.cyl(0.7, 1.15, 4.6 * scale, 6, ['#5B4630', '#7A6045'], {});
    b.add(new THREE.SphereGeometry(4.6 * scale, 7, 6), crown, { y: 8.4 * scale, sy: 0.86 });
    b.add(new THREE.SphereGeometry(3.1 * scale, 6, 5), crown, { x: 3.0 * scale, y: 6.4 * scale, sy: 0.9 });
    b.add(new THREE.SphereGeometry(2.7 * scale, 6, 5), crown, { x: -2.7 * scale, y: 7.2 * scale, z: 1.6 * scale, sy: 0.9 });
  }
}

/** Flat cut-out tree — the paper-theatre cousin of the model above. */
export function treeCardShape(kind, h = 20) {
  if (kind === 1) {
    const s = new THREE.Shape();
    s.moveTo(-1.0, 0);
    s.lineTo(-1.0, h * 0.18);
    s.lineTo(-h * 0.28, h * 0.2);
    s.lineTo(-h * 0.17, h * 0.42);
    s.lineTo(-h * 0.23, h * 0.42);
    s.lineTo(-h * 0.12, h * 0.68);
    s.lineTo(-h * 0.16, h * 0.68);
    s.lineTo(0, h);
    s.lineTo(h * 0.16, h * 0.68);
    s.lineTo(h * 0.12, h * 0.68);
    s.lineTo(h * 0.23, h * 0.42);
    s.lineTo(h * 0.17, h * 0.42);
    s.lineTo(h * 0.28, h * 0.2);
    s.lineTo(1.0, h * 0.18);
    s.lineTo(1.0, 0);
    s.closePath();
    return s;
  }
  // A round crown that wraps down past the horizontal, so it never reads as a
  // mushroom cap balanced on a stick.
  const s = new THREE.Shape();
  const r = h * 0.36;
  const cy = h - r * 1.02;
  const trunk = h * 0.032 + 0.4;
  const steps = 34;
  const span = 1.4;
  s.moveTo(-trunk, 0);
  for (let i = 0; i <= steps; i++) {
    const a = Math.PI * (span - (i / steps) * (span * 2 - 1));
    const wob = 1 + 0.11 * Math.sin(a * 3 + kind * 2.1) + 0.055 * Math.sin(a * 5 - kind);
    s.lineTo(Math.cos(a) * r * wob, Math.max(trunk, cy + Math.sin(a) * r * wob * 1.02));
  }
  s.lineTo(trunk, 0);
  s.closePath();
  return s;
}
