// The post: a letter folds, flies, and is answered with a seal.
//
// Stop-motion paper, not a cartoon. The fold happens in a handful of visible
// steps, the flight is one calm arc with no bounce at either end, and the whole
// journey is under two seconds. Both objects are built once and reused, and both
// hold roughly the same size on screen at any depth, so the moment reads from
// the room card and from a mile up.

import * as THREE from 'three';
import { Builder, roundedRectShape } from '../../world/builder.js';
import { paperMaterial } from '../../world/materials.js';
import { C } from '../../world/palette.js';
import { clamp } from '../../world/rng.js';

const FOLD = 0.42;
const FLY = 1.15;
const LAND = 0.22;

const SEAL_PRESS = 0.2;
const SEAL_HOLD = 0.85;
const SEAL_FADE = 0.75;

const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _v = new THREE.Vector3();
const _look = new THREE.Vector3();

/** Stop-motion: hold each value for a frame of an imaginary 15fps camera. */
const step = (t, frames) => Math.min(1, Math.floor(t * frames) / (frames - 1));

function buildEnvelope() {
  const group = new THREE.Group();

  const paper = new Builder();
  paper.card(roundedRectShape(9.2, 6.2, 0.5), 0.55, ['#EFE3CC', '#FCF6E9'], {
    bevelSize: 0.16,
    curveSegments: 2,
    shade: 0.86,
  });
  // The address side: a terracotta stamp and two ruled lines.
  paper.slab(1.7, 1.3, 0.2, C.terracotta, { x: 3.0, y: 1.6, z: 0.34 });
  paper.slab(4.2, 0.28, 0.18, ['#B7AA92', '#CFC3A9'], { x: -1.4, y: 0.4, z: 0.34 });
  paper.slab(3.2, 0.28, 0.18, ['#B7AA92', '#CFC3A9'], { x: -1.9, y: -0.7, z: 0.34 });
  const body = paper.mesh(paperMaterial({ warmth: 0.4 }), { cast: false, receive: false });
  group.add(body);

  // The flap, hinged along the envelope's top edge.
  const flapB = new Builder();
  const tri = new THREE.Shape();
  tri.moveTo(-4.6, 0);
  tri.lineTo(4.6, 0);
  tri.lineTo(0, -3.4);
  tri.closePath();
  flapB.card(tri, 0.4, ['#E4D6BB', '#F6EDDC'], { bevelSize: 0.12, curveSegments: 1, shade: 0.8 });
  const flapMesh = flapB.mesh(paperMaterial({ warmth: 0.4 }), { cast: false, receive: false });
  const hinge = new THREE.Group();
  hinge.position.set(0, 3.1, 0.1);
  hinge.add(flapMesh);
  group.add(hinge);

  group.visible = false;
  group.userData.isLetter = true;
  return { group, hinge };
}

function buildSeal() {
  const group = new THREE.Group();
  const b = new Builder();
  b.add(new THREE.CylinderGeometry(3.0, 3.2, 0.8, 22), ['#8E4529', '#C0623F'], {
    rx: Math.PI / 2,
    shade: 0.9,
  });
  // A steeple pressed into the wax — the same mark the wordmark uses.
  b.slab(0.55, 2.4, 0.5, '#E9B893', { y: -0.6, z: 0.45 });
  b.cone(1.35, 1.5, 4, '#E9B893', { y: 0.8, z: 0.45 });
  const wax = b.mesh(paperMaterial({ warmth: 0.45 }), { cast: false, receive: false });
  group.add(wax);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(3.1, 4.0, 34),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color('#FFD9A0'),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      fog: false,
    })
  );
  group.add(ring);
  group.visible = false;
  return { group, ring, wax };
}

export function createPost({ parent, camera }) {
  const envelope = buildEnvelope();
  const seal = buildSeal();
  parent.add(envelope.group);
  parent.add(seal.group);

  const from = new THREE.Vector3();
  const to = new THREE.Vector3();
  const control = new THREE.Vector3();

  let flight = null; // { t, onArrive }
  let sealing = null; // { t, onDone }

  /** Keep the paper about the same size on screen wherever the camera is. */
  function screenScale(at) {
    return clamp(camera.position.distanceTo(at) * 0.026, 0.45, 3.0);
  }

  return {
    get busy() {
      return flight !== null;
    },

    /** For verification: where the letter is, and how big. */
    get letter() {
      const g = envelope.group;
      return {
        visible: g.visible,
        phase: flight ? (flight.t < FOLD ? 'fold' : flight.t < FOLD + FLY ? 'fly' : 'land') : 'idle',
        position: [g.position.x, g.position.y, g.position.z],
        scale: g.scale.x,
      };
    },

    /**
     * Post a letter: it folds in the visitor's hands (just in front of the
     * camera, or at `origin` if the world knows where the letter was written)
     * and flies to the church door.
     */
    send({ origin = null, door, onArrive = null }) {
      camera.getWorldDirection(_fwd);
      _right.crossVectors(_fwd, camera.up).normalize();
      if (origin) {
        from.copy(origin);
      } else {
        // Near enough to be in the visitor's hands, and always nearer than
        // whatever they are looking at, so the letter is never posted inside it.
        const reach = clamp(camera.position.distanceTo(door) * 0.12, 22, 48);
        from.copy(camera.position).addScaledVector(_fwd, reach).addScaledVector(_right, reach * 0.22);
        from.y -= reach * 0.15;
      }
      to.copy(door);
      // The arc leans away from the ground and a little to the side, so the
      // letter travels across the frame rather than straight at the door.
      control.addVectors(from, to).multiplyScalar(0.5);
      const span = from.distanceTo(to);
      control.y += clamp(span * 0.22, 8, 90);
      control.addScaledVector(_right, clamp(span * 0.08, 2, 40));
      flight = { t: 0, onArrive };
      envelope.group.visible = true;
      envelope.group.position.copy(from);
      return true;
    },

    /** The answer: wax pressed at the door, and (if allowed) a bell. */
    press({ door, onDone = null }) {
      seal.group.position.copy(door);
      seal.group.visible = true;
      sealing = { t: 0, onDone };
    },

    update(dt) {
      if (flight) {
        flight.t += dt;
        const total = FOLD + FLY + LAND;
        const g = envelope.group;

        if (flight.t < FOLD) {
          // Folded shut in visible steps, held in front of the camera.
          const k = step(flight.t / FOLD, 6);
          envelope.hinge.rotation.x = -2.15 * (1 - k);
          g.position.copy(from);
          camera.getWorldQuaternion(_q);
          g.quaternion.copy(_q);
          g.scale.setScalar(screenScale(from) * (0.86 + 0.14 * k));
        } else if (flight.t < FOLD + FLY) {
          const raw = (flight.t - FOLD) / FLY;
          // Ease out of the hand, ease into the door.
          const t = raw < 0.5 ? 2 * raw * raw : 1 - Math.pow(-2 * raw + 2, 2) / 2;
          const u = 1 - t;
          _a.copy(from).multiplyScalar(u * u);
          _b.copy(control).multiplyScalar(2 * u * t);
          _v.copy(to).multiplyScalar(t * t);
          g.position.copy(_a).add(_b).add(_v);
          // Face along the path, tilted like a thrown card, stepped in time.
          _look.copy(to).sub(g.position).normalize();
          const spin = step(raw, 14) * Math.PI * 0.9;
          g.up.set(0, 1, 0);
          g.lookAt(_look.add(g.position));
          g.rotateZ(0.5 + Math.sin(spin) * 0.32);
          g.rotateX(-0.35);
          envelope.hinge.rotation.x = 0;
          g.scale.setScalar(screenScale(g.position) * (1 - 0.12 * t));
        } else {
          const k = (flight.t - FOLD - FLY) / LAND;
          g.position.copy(to);
          g.scale.setScalar(screenScale(to) * (0.88 - 0.5 * k));
        }

        if (flight.t >= total) {
          const done = flight.onArrive;
          flight = null;
          envelope.group.visible = false;
          done?.();
        }
      }

      if (sealing) {
        sealing.t += dt;
        const g = seal.group;
        camera.getWorldQuaternion(_q);
        g.quaternion.copy(_q);
        // The seal is the answer to a letter: it is allowed to be the biggest
        // thing in the frame for a moment.
        const base = screenScale(g.position) * 0.55;
        if (sealing.t < SEAL_PRESS) {
          const k = step(sealing.t / SEAL_PRESS, 5);
          g.scale.setScalar(base * (1.7 - 0.7 * k));
          seal.ring.material.opacity = 0;
        } else if (sealing.t < SEAL_PRESS + SEAL_HOLD) {
          const k = (sealing.t - SEAL_PRESS) / SEAL_HOLD;
          g.scale.setScalar(base);
          seal.ring.scale.setScalar(1 + 1.5 * k);
          seal.ring.material.opacity = 0.5 * (1 - k) * (1 - k);
        } else {
          // Paper does not dissolve: the seal is simply taken indoors — it
          // shrinks back against the door and is gone.
          const k = (sealing.t - SEAL_PRESS - SEAL_HOLD) / SEAL_FADE;
          g.scale.setScalar(base * Math.max(0.001, 1 - k * k));
          seal.ring.material.opacity = 0;
          g.visible = k < 1;
          if (k >= 1) {
            const done = sealing.onDone;
            sealing = null;
            seal.group.visible = false;
            done?.();
          }
        }
      }
    },
  };
}
