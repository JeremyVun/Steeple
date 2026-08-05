// Geometry kit. Everything in the village is built from a handful of stylised
// primitives that carry their own vertex colours, then merged down to a single
// buffer per material — a whole church costs one or two draw calls.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rgb } from './palette.js';

/** Half-cylinder oriented as a window head: flat side down, extruded along Z. */
export function archTopGeometry(r, depth, seg = 10) {
  const g = new THREE.CylinderGeometry(r, r, depth, seg, 1, false, -Math.PI / 2, Math.PI);
  g.rotateX(-Math.PI / 2);
  return g;
}

/** Write a flat colour, or a vertical gradient, into a geometry's colour attribute. */
export function paint(geo, color) {
  const pos = geo.attributes.position;
  const n = pos.count;
  const arr = new Float32Array(n * 3);
  if (Array.isArray(color)) {
    const [lo, hi] = color.map(rgb);
    geo.computeBoundingBox();
    const bb = geo.boundingBox;
    const y0 = bb.min.y;
    const span = Math.max(1e-5, bb.max.y - y0);
    for (let i = 0; i < n; i++) {
      const t = (pos.getY(i) - y0) / span;
      arr[i * 3] = lo[0] + (hi[0] - lo[0]) * t;
      arr[i * 3 + 1] = lo[1] + (hi[1] - lo[1]) * t;
      arr[i * 3 + 2] = lo[2] + (hi[2] - lo[2]) * t;
    }
  } else {
    const c = rgb(color);
    for (let i = 0; i < n; i++) {
      arr[i * 3] = c[0];
      arr[i * 3 + 1] = c[1];
      arr[i * 3 + 2] = c[2];
    }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

/** Multiply existing vertex colours by a factor where the face points sideways —
 *  gives cut card stock its darker edge without a second material. */
export function edgeShade(geo, factor = 0.86, downFactor = 0.7) {
  const nrm = geo.attributes.normal;
  const col = geo.attributes.color;
  if (!nrm || !col) return geo;
  for (let i = 0; i < col.count; i++) {
    const ny = nrm.getY(i);
    let f = 1;
    if (ny < 0.35) f = factor + (1 - factor) * Math.max(0, ny / 0.35);
    if (ny < -0.4) f *= downFactor;
    col.setXYZ(i, col.getX(i) * f, col.getY(i) * f, col.getZ(i) * f);
  }
  return geo;
}

/** Triangular prism: base w along X, apex h up, length d along Z. Flat-shaded roof. */
export function gableGeometry(w, h, d) {
  const x = w / 2;
  const z = d / 2;
  const v = [
    // left slope
    -x, 0, z, 0, h, z, 0, h, -z,
    -x, 0, z, 0, h, -z, -x, 0, -z,
    // right slope
    0, h, z, x, 0, z, x, 0, -z,
    0, h, z, x, 0, -z, 0, h, -z,
    // gable ends
    -x, 0, z, x, 0, z, 0, h, z,
    x, 0, -z, -x, 0, -z, 0, h, -z,
    // underside
    -x, 0, -z, x, 0, -z, x, 0, z,
    -x, 0, -z, x, 0, z, -x, 0, z,
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((v.length / 3) * 2), 2));
  g.computeVertexNormals();
  return g;
}

/** Hipped roof: rectangular base w×d, ridge of length ridge along X at height h. */
export function hipGeometry(w, d, h, ridge = w * 0.4) {
  const x = w / 2;
  const z = d / 2;
  const r = ridge / 2;
  const v = [
    // front slope
    -x, 0, z, x, 0, z, r, h, 0,
    -x, 0, z, r, h, 0, -r, h, 0,
    // back slope
    x, 0, -z, -x, 0, -z, -r, h, 0,
    x, 0, -z, -r, h, 0, r, h, 0,
    // ends
    x, 0, z, x, 0, -z, r, h, 0,
    -x, 0, -z, -x, 0, z, -r, h, 0,
    // underside
    -x, 0, -z, x, 0, -z, x, 0, z,
    -x, 0, -z, x, 0, z, -x, 0, z,
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((v.length / 3) * 2), 2));
  g.computeVertexNormals();
  return g;
}

/** Closed blob outline — the silhouette language of every paper cut-out here. */
export function blobShape(radius, wobble, seedPhase, points = 48, squash = 1) {
  const shape = new THREE.Shape();
  for (let i = 0; i <= points; i++) {
    const a = (i / points) * Math.PI * 2;
    const r =
      radius *
      (1 +
        wobble * 0.6 * Math.sin(a * 2 + seedPhase) +
        wobble * 0.35 * Math.sin(a * 3 - seedPhase * 1.7) +
        wobble * 0.2 * Math.sin(a * 5 + seedPhase * 0.6));
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r * squash;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  return shape;
}

export function roundedRectShape(w, h, r) {
  const s = new THREE.Shape();
  const x = w / 2;
  const y = h / 2;
  s.moveTo(-x + r, -y);
  s.lineTo(x - r, -y);
  s.quadraticCurveTo(x, -y, x, -y + r);
  s.lineTo(x, y - r);
  s.quadraticCurveTo(x, y, x - r, y);
  s.lineTo(-x + r, y);
  s.quadraticCurveTo(-x, y, -x, y - r);
  s.lineTo(-x, -y + r);
  s.quadraticCurveTo(-x, -y, -x + r, -y);
  s.closePath();
  return s;
}

export class Builder {
  constructor() {
    this.parts = [];
  }

  /** geo is consumed. Transform order is deliberately readable: scale, shape it
   *  with rz/rx, turn it in plan with ry, then place it. opts:
   *  {x,y,z,rx,ry,rz,sx,sy,sz,shade} */
  add(geo, color, opts = {}) {
    if (geo.index) geo = geo.toNonIndexed();
    paint(geo, color);
    if (opts.shade !== false) edgeShade(geo, opts.shade ?? 0.88, opts.under ?? 0.72);
    const { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1 } = opts;
    if (sx !== 1 || sy !== 1 || sz !== 1) geo.scale(sx, sy, sz);
    if (rz) geo.rotateZ(rz);
    if (rx) geo.rotateX(rx);
    if (ry) geo.rotateY(ry);
    if (x || y || z) geo.translate(x, y, z);
    if (!geo.attributes.uv) {
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
    }
    this.parts.push(geo);
    return this;
  }

  box(w, h, d, color, opts = {}) {
    return this.add(new THREE.BoxGeometry(w, h, d), color, opts);
  }

  /** Box whose origin is its bottom face centre — how buildings actually sit. */
  slab(w, h, d, color, opts = {}) {
    return this.add(new THREE.BoxGeometry(w, h, d), color, { ...opts, y: (opts.y ?? 0) + h / 2 });
  }

  gable(w, h, d, color, opts = {}) {
    return this.add(gableGeometry(w, h, d), color, opts);
  }

  hip(w, d, h, color, opts = {}) {
    return this.add(hipGeometry(w, d, h, opts.ridge ?? w * 0.4), color, opts);
  }

  cyl(rt, rb, h, seg, color, opts = {}) {
    return this.add(new THREE.CylinderGeometry(rt, rb, h, seg), color, { ...opts, y: (opts.y ?? 0) + h / 2 });
  }

  cone(r, h, seg, color, opts = {}) {
    return this.add(new THREE.ConeGeometry(r, h, seg), color, { ...opts, y: (opts.y ?? 0) + h / 2 });
  }

  sphere(r, color, opts = {}) {
    return this.add(new THREE.SphereGeometry(r, opts.seg ?? 8, opts.seg2 ?? 6), color, opts);
  }

  /** A thin standing card — the paper cut-out primitive. */
  card(shape, thickness, color, opts = {}) {
    const g = new THREE.ExtrudeGeometry(shape, {
      depth: thickness,
      bevelEnabled: opts.bevel !== false,
      bevelThickness: opts.bevelSize ?? 0.35,
      bevelSize: opts.bevelSize ?? 0.35,
      bevelSegments: 1,
      curveSegments: opts.curveSegments ?? 8,
    });
    g.translate(0, 0, -thickness / 2);
    return this.add(g, color, opts);
  }

  merge(other, opts = {}) {
    for (const p of other.parts) {
      const g = p.clone();
      const { x = 0, y = 0, z = 0, ry = 0, sx = 1, sy = 1, sz = 1 } = opts;
      if (sx !== 1 || sy !== 1 || sz !== 1) g.scale(sx, sy, sz);
      if (ry) g.rotateY(ry);
      g.translate(x, y, z);
      this.parts.push(g);
    }
    return this;
  }

  get empty() {
    return this.parts.length === 0;
  }

  build() {
    if (!this.parts.length) return null;
    const geo = mergeGeometries(this.parts, false);
    this.parts.length = 0;
    return geo;
  }

  mesh(material, { cast = true, receive = true } = {}) {
    const geo = this.build();
    if (!geo) return null;
    const m = new THREE.Mesh(geo, material);
    m.castShadow = cast;
    m.receiveShadow = receive;
    return m;
  }
}

/** Flat ribbon following ground-projected points — roads, trails, garden paths. */
export function ribbonGeometry(points, width, heightAt, yLift = 0.35, taperEnds = true) {
  const n = points.length;
  const pos = [];
  const col = [];
  const idx = [];
  const halfWidths = [];
  for (let i = 0; i < n; i++) {
    let w = width / 2;
    if (taperEnds) {
      const t = Math.min(i, n - 1 - i) / Math.max(1, n * 0.12);
      w *= Math.min(1, 0.35 + 0.65 * Math.min(1, t));
    }
    halfWidths.push(w);
  }
  for (let i = 0; i < n; i++) {
    const p = points[i];
    const a = points[Math.max(0, i - 1)];
    const b = points[Math.min(n - 1, i + 1)];
    let dx = b.x - a.x;
    let dz = b.z - a.z;
    const len = Math.hypot(dx, dz) || 1;
    dx /= len;
    dz /= len;
    const nx = -dz;
    const nz = dx;
    const w = halfWidths[i];
    pos.push(p.x + nx * w, heightAt(p.x + nx * w, p.z + nz * w) + yLift, p.z + nz * w);
    pos.push(p.x - nx * w, heightAt(p.x - nx * w, p.z - nz * w) + yLift, p.z - nz * w);
  }
  for (let i = 0; i < n - 1; i++) {
    const a = i * 2;
    idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  void col;
  return g;
}

/** Sample a Catmull-Rom through waypoints, projected on the ground. */
export function curvePoints(waypoints, samples) {
  const curve = new THREE.CatmullRomCurve3(
    waypoints.map((p) => new THREE.Vector3(p[0], 0, p[1])),
    false,
    'catmullrom',
    0.35
  );
  return curve.getSpacedPoints(samples);
}
