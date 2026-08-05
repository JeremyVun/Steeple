// Roads, drives and the W&OD trail — flat ribbons laid on whatever ground the
// active style provides. All routes merge into a single mesh.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ribbonGeometry, curvePoints, paint } from './builder.js';
import { C } from './palette.js';

export function pathsMesh(routes, heightAt, material) {
  const parts = [];
  const sampled = new Map();
  for (const r of routes) {
    const pts = curvePoints(r.points, r.samples ?? Math.max(28, r.points.length * 14));
    sampled.set(r.name, pts);
    if (r.edge) {
      parts.push(paint(ribbonGeometry(pts, r.width + 3.2, heightAt, (r.lift ?? 0.5) - 0.2, r.taper !== false), r.edge));
    }
    parts.push(paint(ribbonGeometry(pts, r.width, heightAt, r.lift ?? 0.5, r.taper !== false), r.color ?? C.asphalt));
    if (r.centerLine) {
      parts.push(paint(ribbonGeometry(pts, 0.9, heightAt, (r.lift ?? 0.5) + 0.14, false), r.centerLine));
    }
  }
  if (!parts.length) return { mesh: null, sampled };
  const mesh = new THREE.Mesh(mergeGeometries(parts, false), material);
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  return { mesh, sampled };
}
