// The camera rig: holds the live pose, flies it between compositions, and hands
// a paper-wash amount to the renderer for the reduced-motion cut.
//
// A flight never chases a frozen destination — the target composition keeps
// breathing while the camera travels, so the ambient drift is continuous through
// arrival, flight and settle. Retargeting mid-flight keeps the momentum: the new
// leg starts from wherever the camera actually is, with an ease that does not
// stall.

import * as THREE from 'three';
import { state } from '../core/bus.js';
import { clamp, flightEase, retargetEase, easeInOutCubic } from './easing.js';

const UP = new THREE.Vector3(0, 1, 0);
const _travel = new THREE.Vector3();
const _side = new THREE.Vector3();
const _mid = new THREE.Vector3();
const _gaze = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _target = new THREE.Vector3();

const DEG = Math.PI / 180;

// The roll's crane. The camera moves in over the village, settles toward the
// ground and swings its gaze down onto it, so the valley slides up out of the
// top of the frame and the warm painted ground fills the page — which is the
// whole conceit: that ground is the paper the map is printed on.
const CRANE = { pitch: 47 * DEG, drop: 0.62, push: 0.5 };

function makePose() {
  return { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 45, roll: 0 };
}

function copyPose(to, source) {
  to.pos.copy(source.pos);
  to.look.copy(source.look);
  to.fov = source.fov;
  to.roll = source.roll;
}

const FADE_OUT = 0.17;
const FADE_IN = 0.28;

function durationFor(prev, next) {
  if (prev === 'arrival') return next === 'village' ? 1.65 : 1.4;
  if (next === 'arrival') return 1.5;
  if (prev === 'village' && next === 'venue') return 1.2;
  if (prev === 'venue' && next === 'room') return 0.95;
  if (prev === 'room' && next === 'venue') return 0.85;
  if (prev === 'venue' && next === 'village') return 1.1;
  if (prev === 'room' && next === 'village') return 1.3;
  // Wave 2. Sitting down to write is a dolly, not a flight — short and level.
  // Taking up a post at the church door, or opening the journal, is a move
  // between two places and keeps the village's usual pace.
  if (prev === 'room' && next === 'apply') return 0.85;
  if (prev === 'apply' && next === 'room') return 0.75;
  if (next === 'apply' || prev === 'apply') return 1.0;
  if (next === 'desk' || prev === 'desk') return 1.35;
  if (next === 'journal' || prev === 'journal') return 1.15;
  if (next === 'letter' || prev === 'letter') return 1.05;
  if (prev === next) return 1.0; // stepping sideways between churches or rooms
  return 1.1;
}

export function createRig(engine, compositions) {
  const camera = engine.camera;
  const target = makePose();
  const from = makePose();
  const current = makePose();
  const arc = new THREE.Vector3();

  let flying = false;
  let interrupted = false;
  let elapsedIn = 0;
  let duration = 1;
  let started = false;

  let cutPhase = null; // 'out' | 'in'
  let cutTime = 0;
  let fade = 0;
  let now = 0; // world clock, so a flight can start between frames

  function evaluate(pose, elapsed) {
    // Off the title page the roll owns the camera and its only job is the
    // crane. Whichever church the browse surface is showing is a matter for
    // the printed layer, not for the framing.
    const view = state.roll > 0 ? 'arrival' : state.view;
    compositions.evaluate(pose, view, state.venueId, state.roomId, elapsed);
  }

  function planArc() {
    _travel.subVectors(target.pos, from.pos);
    const distance = _travel.length();
    if (distance < 1e-3) {
      arc.set(0, 0, 0);
      return;
    }
    const t = compositions.tune.arc;
    // Rising out of a venue swings up and away; diving into one keeps its
    // momentum and only breathes upward — no rollercoaster over the top.
    const descending = _travel.y < -1;
    const lift = clamp(distance * t.lift, 4, 150) * (descending ? 0.3 : 1);
    _side.set(-_travel.z, 0, _travel.x);
    const sideLength = _side.length();
    if (sideLength > 1e-3) {
      _side.divideScalar(sideLength);
      // Bow away from the middle of the village so the arc reads as a swing
      // around the subject rather than a straight slide.
      _mid.addVectors(from.pos, target.pos).multiplyScalar(0.5).sub(compositions.center);
      if (_side.dot(_mid) < 0) _side.negate();
    } else {
      _side.set(0, 0, 0);
    }
    arc.copy(UP).multiplyScalar(lift).addScaledVector(_side, clamp(distance * t.bow, 0, 170));
  }

  function beginFlight(previousView, nextView) {
    if (!started) {
      // Deep link or first paint: no journey to perform yet.
      evaluate(target, now);
      copyPose(current, target);
      return;
    }
    if (state.reducedMotion) {
      cutPhase = 'out';
      cutTime = 0;
      flying = false;
      return;
    }
    interrupted = flying;
    copyPose(from, current);
    evaluate(target, now);
    planArc();
    duration = durationFor(previousView, nextView) * (interrupted ? 0.82 : 1);
    elapsedIn = 0;
    flying = true;
  }

  /**
   * Crane the camera down by `p` of the way, and answer with where it is now
   * looking. The move is eased against the roll so the first of a scroll only
   * lifts the title off the page, and the village holds its framing until the
   * gesture is clearly meant. Reduced motion never gets here: that visitor is
   * given a crossfade instead.
   */
  function craneDown(pose, raw) {
    const p = raw * raw * (3 - 2 * raw);
    _gaze.subVectors(pose.look, pose.pos);
    const reach = _gaze.length();
    if (reach < 1e-4) return pose.look;
    _gaze.divideScalar(reach);
    _axis.crossVectors(_gaze, UP);
    if (_axis.lengthSq() < 1e-8) return pose.look;
    _axis.normalize();
    camera.position.addScaledVector(_gaze, reach * CRANE.push * p);
    camera.position.y -= (camera.position.y - pose.look.y) * CRANE.drop * p;
    _gaze.applyAxisAngle(_axis, -CRANE.pitch * p);
    return _target.copy(camera.position).addScaledVector(_gaze, reach);
  }

  function apply(pose) {
    camera.position.copy(pose.pos);
    camera.up.set(0, 1, 0);
    const rolling = state.roll > 0 && !state.reducedMotion;
    camera.lookAt(rolling ? craneDown(pose, state.roll) : pose.look);
    if (pose.roll > 1e-6 || pose.roll < -1e-6) camera.rotateZ(pose.roll);
    if (Math.abs(camera.fov - pose.fov) > 1e-4) {
      camera.fov = pose.fov;
      camera.updateProjectionMatrix();
    }
  }

  function update(dt, elapsed) {
    started = true;
    now = elapsed;

    if (cutPhase === 'out') {
      cutTime += dt;
      fade = clamp(cutTime / FADE_OUT, 0, 1);
      if (cutTime >= FADE_OUT) {
        evaluate(target, elapsed);
        copyPose(current, target);
        cutPhase = 'in';
        cutTime = 0;
      }
      apply(current);
      return;
    }

    evaluate(target, elapsed);

    if (cutPhase === 'in') {
      cutTime += dt;
      fade = 1 - clamp(cutTime / FADE_IN, 0, 1);
      if (cutTime >= FADE_IN) {
        cutPhase = null;
        fade = 0;
      }
      copyPose(current, target);
      apply(current);
      return;
    }

    if (flying) {
      elapsedIn += dt;
      const raw = clamp(elapsedIn / duration, 0, 1);
      const k = interrupted ? retargetEase(raw) : flightEase(raw);
      // The gaze leads the move: the camera turns toward where it is going
      // before it finishes getting there.
      const kLook = easeInOutCubic(clamp(raw * 1.22, 0, 1));
      current.pos.lerpVectors(from.pos, target.pos, k);
      current.pos.addScaledVector(arc, Math.sin(Math.PI * raw));
      current.look.lerpVectors(from.look, target.look, kLook);
      current.fov = from.fov + (target.fov - from.fov) * k;
      current.roll = from.roll + (target.roll - from.roll) * k;
      if (raw >= 1) {
        flying = false;
        interrupted = false;
      }
    } else {
      copyPose(current, target);
    }

    apply(current);
  }

  return {
    update,
    beginFlight,
    /** Paper wash for the reduced-motion cut, 0..1. */
    get fade() {
      return fade;
    },
    get inFlight() {
      return flying || cutPhase !== null;
    },
    /** 0..1 through the current flight (1 when settled). */
    get progress() {
      return flying ? clamp(elapsedIn / duration, 0, 1) : 1;
    },
  };
}
