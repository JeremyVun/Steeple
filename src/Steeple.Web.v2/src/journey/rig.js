// The splash camera and its roll crane. Product views are printed over a
// stopped renderer, so there are no scene-depth flights to plan or retarget.

import * as THREE from 'three';
import { state } from '../core/bus.js';

const UP = new THREE.Vector3(0, 1, 0);
const _gaze = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _target = new THREE.Vector3();
const CRANE = { pitch: (47 * Math.PI) / 180, drop: 0.62, push: 0.5 };

function makePose() {
  return { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 45, roll: 0 };
}

export function createRig(engine, compositions) {
  const camera = engine.camera;
  const pose = makePose();

  function craneDown(raw) {
    const progress = raw * raw * (3 - 2 * raw);
    _gaze.subVectors(pose.look, pose.pos);
    const reach = _gaze.length();
    if (reach < 1e-4) return pose.look;
    _gaze.divideScalar(reach);
    _axis.crossVectors(_gaze, UP);
    if (_axis.lengthSq() < 1e-8) return pose.look;
    _axis.normalize();
    camera.position.addScaledVector(_gaze, reach * CRANE.push * progress);
    camera.position.y -= (camera.position.y - pose.look.y) * CRANE.drop * progress;
    _gaze.applyAxisAngle(_axis, -CRANE.pitch * progress);
    return _target.copy(camera.position).addScaledVector(_gaze, reach);
  }

  function apply() {
    camera.position.copy(pose.pos);
    camera.up.set(0, 1, 0);
    const rolling = state.roll > 0 && !state.reducedMotion;
    camera.lookAt(rolling ? craneDown(state.roll) : pose.look);
    if (pose.roll > 1e-6 || pose.roll < -1e-6) camera.rotateZ(pose.roll);
    if (Math.abs(camera.fov - pose.fov) > 1e-4) {
      camera.fov = pose.fov;
      camera.updateProjectionMatrix();
    }
  }

  return {
    update(_dt, elapsed) {
      compositions.evaluate(pose, elapsed);
      apply();
    },
  };
}
