// A lantern by the door, and light in the windows behind it.
//
// The village's correspondence is legible from the air: a church with letters
// waiting keeps a lantern lit by its door; a church with a booking in the book
// has warm, steady light in its windows and a pool of it on the path; a church
// that has said no is simply quiet. Filters still own the body of the building
// (lit vs resting) — this owns the lantern and the windows, and only leans on
// the filter state enough that a resting church's lantern rests a little too.
//
// Two rendering languages, chosen by `?lantern=` (see README):
//   lamp   (default) — a lantern on a crook, the way a porch light is left on.
//   window — no lamp at all: the building's own openings carry the whole signal.

import * as THREE from 'three';
import { Builder } from '../../world/builder.js';
import { paperMaterial, glowMaterial } from '../../world/materials.js';
import { C } from '../../world/palette.js';
import { damp } from '../../world/rng.js';

const WAITING = new THREE.Color('#FFC271'); // a letter is waiting to be read
const SETTLED = new THREE.Color('#FFE0B0'); // a booking is in the book
const UNLIT = new THREE.Color('#7C7F72');

const _q = new THREE.Quaternion();

/**
 * A soft head of light: a fan whose centre carries the colour and whose rim
 * fades to nothing. Additive, so the rim is genuinely invisible — a disc with a
 * hard edge reads as a paper parasol, which is not what a lamp does.
 */
function glowFan(radius, color, segments = 30) {
  const geo = new THREE.CircleGeometry(radius, segments);
  const position = geo.attributes.position;
  const c = new THREE.Color(color);
  const colors = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) {
    const r = Math.hypot(position.getX(i), position.getY(i)) / radius;
    const k = Math.pow(1 - Math.min(1, r), 2.1);
    colors[i * 3] = c.r * k;
    colors[i * 3 + 1] = c.g * k;
    colors[i * 3 + 2] = c.b * k;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    })
  );
  mesh.renderOrder = 3;
  return mesh;
}

/**
 * @param sites [{ venueId, lantern: Vector3 (ground), door: Vector3, facing: number }]
 */
export function createLanterns({ parent, sites, variant = 'lamp' }) {
  const lamps = new Map();
  const list = [];

  // Every post in the village is one static mesh: the parts that move are the
  // glow, the halo and the pool, and those are the only per-venue draws.
  const posts = new Builder();

  for (const site of sites) {
    const p = site.lantern;
    const bulbY = p.y + 12.4;

    if (variant === 'lamp') {
      posts.cyl(0.34, 0.5, 13.4, 6, ['#5E4C39', '#836B51'], { x: p.x, y: p.y, z: p.z });
      posts.slab(4.6, 0.42, 0.42, ['#5E4C39', '#836B51'], {
        x: p.x + Math.sin(site.facing) * 2.3,
        y: p.y + 13.2,
        z: p.z + Math.cos(site.facing) * 2.3,
        ry: site.facing,
      });
      posts.cone(1.5, 1.2, 6, ['#8E4529', '#B96545'], {
        x: p.x + Math.sin(site.facing) * 4.3,
        y: bulbY + 0.7,
        z: p.z + Math.cos(site.facing) * 4.3,
      });
    }

    const bulbAt = new THREE.Vector3(
      p.x + (variant === 'lamp' ? Math.sin(site.facing) * 4.3 : 0),
      variant === 'lamp' ? bulbY : site.door.y + 2.5,
      p.z + (variant === 'lamp' ? Math.cos(site.facing) * 4.3 : 0)
    );
    if (variant === 'window') bulbAt.copy(site.door);

    // The flame. In `window` mode this is the doorway itself, a tall pane.
    const shell = new Builder();
    if (variant === 'lamp') {
      shell.add(new THREE.OctahedronGeometry(1.45, 0), '#FFE0A8', {
        x: bulbAt.x,
        y: bulbAt.y,
        z: bulbAt.z,
        sy: 1.35,
        shade: 1,
      });
    } else {
      shell.slab(5.0, 8.0, 0.6, '#FFE0A8', {
        x: bulbAt.x,
        y: bulbAt.y - 4,
        z: bulbAt.z,
        ry: site.facing,
        shade: 1,
      });
    }
    const bulbMat = glowMaterial('#FFE0A8');
    const bulb = shell.mesh(bulbMat, { cast: false, receive: false });
    parent.add(bulb);

    // The soft head of light around the flame: a billboard, so it reads as
    // glow from the valley floor and from the air alike.
    const bloom = glowFan(variant === 'lamp' ? 5.0 : 9.0, '#FFC178');
    bloom.position.copy(bulbAt);
    parent.add(bloom);

    // What the light does to the ground it stands on.
    const pool = glowFan(variant === 'lamp' ? 13 : 18, '#FFD59A', 34);
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(bulbAt.x, p.y + 0.5, bulbAt.z);
    parent.add(pool);

    const lamp = {
      venueId: site.venueId,
      bulb,
      bulbMat,
      bloom,
      pool,
      baseBloom: bloom.scale.x,
      // 0 = dark, 1 = a letter waiting; `settled` is the steady booking light.
      waiting: 0,
      waitingTarget: 0,
      settled: 0,
      settledTarget: 0,
      held: false, // a letter is still in the air; light when it lands
      phase: (site.lantern.x + site.lantern.z) * 0.017,
    };
    lamps.set(site.venueId, lamp);
    list.push(lamp);
  }

  const postMesh = posts.mesh(paperMaterial({ warmth: 0.42 }));
  if (postMesh) parent.add(postMesh);

  return {
    /** Correspondence for one church, as counts from store.venueSignals(). */
    setSignal(venueId, { undecided = 0, approved = 0 } = {}) {
      const lamp = lamps.get(venueId);
      if (!lamp) return;
      lamp.waitingTarget = undecided > 0 ? 1 : 0;
      lamp.settledTarget = approved > 0 ? 1 : 0;
    },

    /** Hold a newly-lit lantern dark until its letter has actually arrived. */
    hold(venueId) {
      const lamp = lamps.get(venueId);
      if (lamp) lamp.held = true;
    },

    release(venueId) {
      const lamp = lamps.get(venueId);
      if (lamp) lamp.held = false;
    },

    /** How warm this church's own windows should burn, 0..1 — read by the world. */
    windowWarmth(venueId) {
      return lamps.get(venueId)?.settled ?? 0;
    },

    lampFor(venueId) {
      return lamps.get(venueId) ?? null;
    },

    update(dt, elapsed, camera, restingFor) {
      camera.getWorldQuaternion(_q);
      const eye = camera.position;
      for (let i = 0; i < list.length; i++) {
        const lamp = list[i];
        const waitTarget = lamp.held ? 0 : lamp.waitingTarget;
        lamp.waiting = damp(lamp.waiting, waitTarget, 2.6, dt);
        lamp.settled = damp(lamp.settled, lamp.held ? 0 : lamp.settledTarget, 2.0, dt);

        // A lit lantern breathes; a booking's light does not — it is settled.
        const breath = 0.9 + 0.1 * Math.sin(elapsed * 0.9 + lamp.phase);
        const rest = restingFor ? restingFor(lamp.venueId) : 1;
        const dim = 0.45 + 0.55 * rest;
        const flame = Math.max(lamp.waiting * breath, lamp.settled * 0.86);
        const level = flame * dim;

        lamp.bulbMat.color
          .copy(UNLIT)
          .lerp(lamp.settled > lamp.waiting ? SETTLED : WAITING, Math.min(1, level * 1.5))
          .multiplyScalar(0.34 + 0.78 * level);
        // A light seen from a mile off does not shrink to nothing: the head of
        // glow keeps a floor on its apparent size, so a church with letters
        // waiting is legible from the air without shouting up close.
        const far = Math.min(3.2, Math.max(1, eye.distanceTo(lamp.bloom.position) / 300));
        lamp.bloom.material.opacity = 0.85 * level;
        lamp.bloom.quaternion.copy(_q);
        lamp.bloom.scale.setScalar((0.7 + 0.5 * level) * far);
        lamp.pool.material.opacity = (0.30 + 0.45 * lamp.settled) * dim * (level > 0.02 ? 1 : 0);
        lamp.pool.scale.setScalar(0.8 + 0.35 * lamp.settled);
      }
    },
  };
}

void C;
