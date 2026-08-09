// The splash camera's live composition. The scene is scenery now: product
// navigation never changes its subject, so this module owns only the wide
// arrival framing used by the poster handoff and the cinematic roll.

import * as THREE from 'three';
import { state } from '../core/bus.js';

const DEG = Math.PI / 180;
const UP = new THREE.Vector3(0, 1, 0);
const FRONT_AZ = 0;

const _v = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _corner = new THREE.Vector3();

// These are the existing splash values. Keep them stable: the checked-in
// posters were photographed from this composition.
const TUNE = {
  fov: 42,
  elevation: 13,
  fill: 0.66,
  fx: 0,
  fy: -0.26,
  roll: 0,
  reach: 0.84,
  tilt: 0.5,
};

export function createCompositions(engine, world) {
  const camera = engine.camera;
  const bounds = new THREE.Box3();
  const center = new THREE.Vector3();
  const size = new THREE.Vector3();
  const fitPoints = [];
  let fitCount = 0;
  let fitAspect = null;

  function fitPoint(x, y, z) {
    const point = fitPoints[fitCount] ?? (fitPoints[fitCount] = new THREE.Vector3());
    fitCount++;
    return point.set(x, y, z);
  }

  // Cheap enough to run every frame: a host-owned venue may join the scenery
  // while this page is open.
  function measure() {
    bounds.makeEmpty();
    fitCount = 0;
    for (const anchor of world.anchors.values()) bounds.expandByPoint(anchor.position);
    if (bounds.isEmpty()) bounds.set(_v.set(-200, 0, -140), _corner.set(200, 0, 140));

    bounds.getSize(size);
    const spread = Math.max(size.x, size.z, 1);
    const footprint = Math.max(26, spread * 0.075);
    const height = Math.max(58, spread * 0.12);

    for (const anchor of world.anchors.values()) {
      const point = anchor.position;
      const box = anchor.box;
      if (box) {
        for (let i = 0; i < 8; i++) {
          fitPoint(
            i & 1 ? box.max.x : box.min.x,
            i & 2 ? box.max.y : box.min.y,
            i & 4 ? box.max.z : box.min.z
          );
        }
      } else {
        fitPoint(point.x - footprint, point.y, point.z - footprint);
        fitPoint(point.x + footprint, point.y, point.z + footprint);
        fitPoint(point.x - footprint, point.y + height, point.z + footprint);
        fitPoint(point.x + footprint, point.y + height, point.z - footprint);
      }
    }

    if (!fitCount) {
      fitPoint(-200, 0, -140);
      fitPoint(200, height, 140);
    }
    bounds.min.y = Math.min(bounds.min.y, 0);
    bounds.max.y = bounds.min.y + height;
    bounds.getCenter(center);
  }

  function basis(direction) {
    _fwd.copy(direction).negate();
    _right.crossVectors(_fwd, UP);
    if (_right.lengthSq() < 1e-8) _right.set(1, 0, 0);
    _right.normalize();
    _up.crossVectors(_right, _fwd).normalize();
  }

  function cameraDirection(azimuth, elevationDeg) {
    const elevation = elevationDeg * DEG;
    const radius = Math.cos(elevation);
    return _dir
      .set(Math.sin(azimuth) * radius, Math.sin(elevation), Math.cos(azimuth) * radius)
      .normalize();
  }

  function fitBounds() {
    const halfHeight =
      Math.tan(TUNE.fov * 0.5 * DEG) * TUNE.fill * (1 - Math.abs(TUNE.fy));
    const halfWidth =
      halfHeight * (fitAspect ?? camera.aspect) * (1 - Math.abs(TUNE.fx));
    let distance = 1;
    for (let i = 0; i < fitCount; i++) {
      _v.subVectors(fitPoints[i], center);
      const depth = _v.dot(_fwd);
      distance = Math.max(
        distance,
        Math.abs(_v.dot(_right)) / halfWidth - depth,
        Math.abs(_v.dot(_up)) / halfHeight - depth
      );
    }
    return distance;
  }

  function composeLook(out, distance) {
    const halfHeight = Math.tan(TUNE.fov * 0.5 * DEG) * distance;
    const halfWidth = halfHeight * camera.aspect;
    out.copy(center);
    out.addScaledVector(_right, -TUNE.fx * halfWidth);
    out.addScaledVector(_up, -TUNE.fy * halfHeight);
  }

  function evaluate(pose, elapsed) {
    measure();
    const azimuth = state.reducedMotion
      ? FRONT_AZ
      : FRONT_AZ + Math.sin(elapsed * 0.021) * 0.09;
    const elevation =
      TUNE.elevation + (state.reducedMotion ? 0 : Math.sin(elapsed * 0.017) * 1.2);
    basis(cameraDirection(azimuth, elevation));
    const breath = state.reducedMotion ? 0 : Math.sin(elapsed * 0.037 + 2.1) * 0.02;
    const distance = Math.min(
      fitBounds() * (1 + breath),
      (world.horizon ?? 620) * TUNE.reach
    );
    pose.pos.copy(center).addScaledVector(_dir, distance);
    composeLook(pose.look, distance);
    pose.fov = TUNE.fov;
    pose.roll = state.reducedMotion ? 0 : Math.sin(elapsed * 0.043) * TUNE.roll * DEG;
  }

  measure();

  return {
    evaluate,
    setFitAspect(aspect) {
      fitAspect = aspect;
    },
    get tilt() {
      return TUNE.tilt;
    },
  };
}
