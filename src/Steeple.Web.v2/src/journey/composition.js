// Camera compositions — where the camera *wants* to be for a given view, at a
// given moment. Pure framing math: no transitions, no input. Every function is
// allocation-free (module scratch vectors, single-threaded by construction).
//
// All village framing derives from the bounding box of world.anchors, never from
// hardcoded extents.

import * as THREE from 'three';
import { state } from '../core/bus.js';
import { getApplication, hostVenueId } from '../data/store.js';
import { approach, clamp } from './easing.js';

const DEG = Math.PI / 180;
const UP = new THREE.Vector3(0, 1, 0);

const _v = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _subject = new THREE.Vector3();
const _corner = new THREE.Vector3();
const _pad = new THREE.Vector3();

/** Atlas camera language. Angles in degrees, distances in world units. */
const TUNE = {
  arrival: { fov: 42, elevation: 13, fill: 0.66, fx: 0, fy: -0.26, roll: 0 },
  // A wider lens keeps the whole valley in one frame from inside its own rim.
  village: { fov: 52, elevation: 20, fill: 0.80, fx: 0, fy: -0.04, roll: 0 },
  venue: { fov: 40, elevation: 20, radius: 34, fill: 0.98, fx: 0.24, fy: -0.04, roll: 0 },
  room: { fov: 42, elevation: 22, radius: 10.2, fill: 0.68, fx: 0.31, fy: 0.03, roll: 0 },
  apply: { fov: 38, elevation: 18, radius: 10.2, fill: 0.82, fx: 0.34, fy: 0.04, roll: 0 },
  letter: { fov: 40, elevation: 21, radius: 34, fill: 0.74, fx: 0.33, fy: -0.03, roll: 0 },
  journal: { fov: 50, elevation: 21, fill: 0.72, fx: 0.30, fy: -0.03, roll: 0 },
  desk: { fov: 52, elevation: 12, fx: 0.46, fy: -0.05, roll: 0, eye: 0.26, hold: 0.74, swing: 0.55 },
  orbit: { rate: 0.031, rate2: 0.019 },
  arc: { lift: 0.18, bow: 0.08 },
  tilt: {
    village: 0.85, venue: 0.75, room: 1.0, arrival: 0.5,
    apply: 1.0, letter: 0.85, journal: 0.8, desk: 0.55,
  },
  // Stay inside the valley's own rim, never above the map.
  reach: 0.84,
};

/** The staged world faces +z by default. */
const FRONT_AZ = 0;

export function createCompositions(engine, world) {
  const camera = engine.camera;
  const tune = TUNE;

  const bounds = new THREE.Box3();
  const center = new THREE.Vector3();
  const size = new THREE.Vector3();

  // The one piece of live viewer input folded into every composition: an
  // azimuth nudge from a deliberate drag. The camera never follows the pointer
  // and never zooms under it, so reaching for a panel control leaves the
  // framing exactly where the visitor left it.
  const nudge = { az: 0 };

  // Framing fits the churches themselves, not the empty ground around them:
  // each anchor contributes its footprint corners at ground level and at roof
  // height. Points, not a box, so a low camera is not pushed miles back by a
  // corner of grass.
  const fitPoints = [];
  let fitCount = 0;

  function fitPoint(x, y, z) {
    const p = fitPoints[fitCount] ?? (fitPoints[fitCount] = new THREE.Vector3());
    fitCount++;
    return p.set(x, y, z);
  }

  /** Cheap enough to run every frame: the world may restage while we watch. */
  function measure() {
    bounds.makeEmpty();
    fitCount = 0;
    for (const anchor of world.anchors.values()) bounds.expandByPoint(anchor.position);
    if (bounds.isEmpty()) {
      bounds.set(_v.set(-200, 0, -140), _corner.set(200, 0, 140));
    }
    bounds.getSize(size);
    const spread = Math.max(size.x, size.z, 1);
    // Fall back to a padded footprint only if the world does not say how big
    // its buildings actually are.
    const footprint = Math.max(26, spread * 0.075);
    const height = Math.max(58, spread * 0.12);
    for (const anchor of world.anchors.values()) {
      const p = anchor.position;
      const b = anchor.box;
      if (b) {
        for (let i = 0; i < 8; i++) {
          fitPoint(
            i & 1 ? b.max.x : b.min.x,
            i & 2 ? b.max.y : b.min.y,
            i & 4 ? b.max.z : b.min.z
          );
        }
      } else {
        fitPoint(p.x - footprint, p.y, p.z - footprint);
        fitPoint(p.x + footprint, p.y, p.z + footprint);
        fitPoint(p.x - footprint, p.y + height, p.z + footprint);
        fitPoint(p.x + footprint, p.y + height, p.z - footprint);
      }
    }
    if (!fitCount) {
      fitPoint(-200, 0, -140);
      fitPoint(200, height, 140);
    }
    bounds.min.y = Math.min(bounds.min.y, 0);
    bounds.max.y = bounds.min.y + height;
    bounds.getCenter(center);
    bounds.getSize(size);
  }
  measure();

  function basis(dir) {
    _fwd.copy(dir).negate();
    _right.crossVectors(_fwd, UP);
    if (_right.lengthSq() < 1e-8) _right.set(1, 0, 0);
    _right.normalize();
    _up.crossVectors(_right, _fwd).normalize();
  }

  /** Unit vector pointing from the subject toward the camera. */
  function direction(azimuth, elevationDeg, out) {
    const el = elevationDeg * DEG;
    const c = Math.cos(el);
    return out.set(Math.sin(azimuth) * c, Math.sin(el), Math.cos(azimuth) * c).normalize();
  }

  // Normally the window's own aspect — but the fit is a function of it, so the
  // boot may pin it to the poster photograph's aspect for a moment: the first
  // live frame then stands exactly where the photograph was taken from, and
  // the journey eases this back to null once the crossfade has landed
  // (journey/index.js). Null means the camera's truth.
  let fitAspect = null;

  /**
   * Smallest distance along `dir` that keeps the whole bounding box inside the
   * frame. Exact: lateral/vertical offsets in the camera basis do not change as
   * the camera slides along a fixed direction toward a fixed target.
   */
  function fitBounds(fov, fx, fy, fill) {
    const ty = Math.tan(fov * 0.5 * DEG) * fill * (1 - Math.abs(fy));
    const tx = ty * (fitAspect ?? camera.aspect) * (1 - Math.abs(fx));
    let d = 1;
    for (let i = 0; i < fitCount; i++) {
      _v.subVectors(fitPoints[i], center);
      const z = _v.dot(_fwd);
      d = Math.max(d, Math.abs(_v.dot(_right)) / tx - z, Math.abs(_v.dot(_up)) / ty - z);
    }
    return d;
  }

  /** Distance that fits a sphere of `radius` into `fill` of the frame height. */
  function fitRadius(radius, fov, fill) {
    return radius / Math.max(0.02, Math.tan(fov * 0.5 * DEG) * fill);
  }

  /** The same exact fit as `fitBounds`, for one box around one subject. */
  function fitBox(box, subject, fov, fx, fy, fill) {
    const ty = Math.tan(fov * 0.5 * DEG) * fill * (1 - Math.abs(fy));
    const tx = ty * (fitAspect ?? camera.aspect) * (1 - Math.abs(fx));
    let d = 1;
    for (let i = 0; i < 8; i++) {
      _corner.set(
        i & 1 ? box.max.x : box.min.x,
        i & 2 ? box.max.y : box.min.y,
        i & 4 ? box.max.z : box.min.z
      );
      _v.subVectors(_corner, subject);
      const z = _v.dot(_fwd);
      d = Math.max(d, Math.abs(_v.dot(_right)) / tx - z, Math.abs(_v.dot(_up)) / ty - z);
    }
    return d;
  }

  /**
   * The staged world is finite: past the nearest scenery ring the camera is
   * outside the theatre, looking at the backs of the flats. Wide framings pull
   * back only as far as the style allows.
   */
  const maxReach = (world.horizon ?? 620) * tune.reach;
  function withinWorld(d) {
    return Math.min(d, maxReach);
  }

  /**
   * Point the camera at `subject` but place it at normalized frame coordinates
   * (fx, fy) instead of dead centre — the overlay panel gets the other side.
   */
  function composeLook(out, subject, distance, fov, fx, fy) {
    const halfH = Math.tan(fov * 0.5 * DEG) * distance;
    const halfW = halfH * camera.aspect;
    out.copy(subject);
    out.addScaledVector(_right, -fx * halfW);
    out.addScaledVector(_up, -fy * halfH);
    return out;
  }

  const focusPoint = new THREE.Vector3();
  let focusWeight = 0;
  let lastElapsed = 0;

  /** Ease the framing bias toward whatever the visitor is currently looking at. */
  function trackFocus(elapsed) {
    const dt = clamp(elapsed - lastElapsed, 0, 0.1);
    lastElapsed = elapsed;
    const focus = world.anchors.get(state.hoverVenueId);
    if (focus) {
      if (focusWeight < 0.002) focusPoint.copy(focus.position);
      else focusPoint.lerp(focus.position, 1 - Math.exp(-8 * dt));
      focusWeight = approach(focusWeight, 1, 4.5, dt);
    } else {
      focusWeight = approach(focusWeight, 0, 4.5, dt);
    }
  }

  function breathe(elapsed, amount) {
    if (state.reducedMotion) return 0;
    return Math.sin(elapsed * 0.037 + 2.1) * amount;
  }

  // Where the camera was drifting when the visitor last saw the whole village.
  // Venue and room approaches are built around this, so going deeper never
  // whips the camera to the far side of the valley.
  let ambientAz = FRONT_AZ;

  /** Slow ambient orbit around the village. */
  function ambientAzimuth(elapsed) {
    const o = tune.orbit;
    if (state.reducedMotion) {
      ambientAz = FRONT_AZ + nudge.az;
    } else {
      ambientAz = FRONT_AZ + elapsed * o.rate + Math.sin(elapsed * o.rate2) * 0.12 + nudge.az;
    }
    return ambientAz;
  }

  function arrival(pose, elapsed) {
    const t = tune.arrival;
    const az = (ambientAz = state.reducedMotion
      ? FRONT_AZ + nudge.az
      : FRONT_AZ + Math.sin(elapsed * 0.021) * 0.09 + nudge.az);
    const el = t.elevation + (state.reducedMotion ? 0 : Math.sin(elapsed * 0.017) * 1.2);
    direction(az, el, _dir);
    basis(_dir);
    const d = withinWorld(fitBounds(t.fov, t.fx, t.fy, t.fill) * (1 + breathe(elapsed, 0.02)));
    pose.pos.copy(center).addScaledVector(_dir, d);
    composeLook(pose.look, center, d, t.fov, t.fx, t.fy);
    pose.fov = t.fov;
    pose.roll = state.reducedMotion ? 0 : Math.sin(elapsed * 0.043) * t.roll * DEG;
    return pose;
  }

  function village(pose, elapsed) {
    const t = tune.village;
    const az = ambientAzimuth(elapsed);
    const el =
      t.elevation + (state.reducedMotion ? 0 : (0.5 + 0.5 * Math.sin(elapsed * 0.041 + 0.4)) * 2.6);
    direction(az, el, _dir);
    basis(_dir);
    const d = withinWorld(fitBounds(t.fov, t.fx, t.fy, t.fill) * (1 + breathe(elapsed, 0.025)));
    pose.pos.copy(center).addScaledVector(_dir, d);
    composeLook(pose.look, center, d, t.fov, t.fx, t.fy);
    // A focused church (hover or keyboard) gently biases the framing toward
    // itself — eased in and out, never a snap.
    if (focusWeight > 0.002) {
      pose.look.lerp(_v.copy(focusPoint).setY(pose.look.y), 0.17 * focusWeight);
    }
    pose.fov = t.fov;
    pose.roll = state.reducedMotion ? 0 : Math.sin(elapsed * 0.033 + 1.2) * t.roll * DEG;
    return pose;
  }

  const CARD_CONE = 0.62; // ~35°: how wide a berth the camera gives a room card

  function wrapPi(a) {
    return a - Math.PI * 2 * Math.round(a / (Math.PI * 2));
  }

  /**
   * A room card sitting on the camera's own axis looms into the foreground and
   * hides the church behind it. Slide the azimuth to the nearest edge of the
   * card's cone so the cards present themselves *beside* their church instead.
   */
  function clearOfCards(anchor, az) {
    if (!anchor.rooms || anchor.rooms.size === 0) return az;
    for (let pass = 0; pass < 3; pass++) {
      let worst = 0;
      let push = 0;
      for (const spot of anchor.rooms.values()) {
        const rx = spot.position.x - anchor.position.x;
        const rz = spot.position.z - anchor.position.z;
        if (rx * rx + rz * rz < 4) continue;
        const delta = wrapPi(az - Math.atan2(rx, rz));
        const over = CARD_CONE - Math.abs(delta);
        if (over > worst) {
          worst = over;
          push = (delta >= 0 ? 1 : -1) * over;
        }
      }
      if (worst <= 0.0005) break;
      az += push;
    }
    return az;
  }

  /**
   * Three-quarter framing of a church, shot from outside the village so the rest
   * of the valley layers up behind it.
   */
  function venueDirection(venueId, anchor, elapsed, elevationDeg, out) {
    let outwardX = anchor.position.x - center.x;
    let outwardZ = anchor.position.z - center.z;
    const len = Math.hypot(outwardX, outwardZ) || 1;
    outwardX /= len;
    outwardZ /= len;
    // Blend "away from the village" with the side the visitor is already on,
    // then swing off-axis for a three-quarter view.
    const blended = Math.atan2(
      0.45 * outwardX + 0.55 * Math.sin(ambientAz),
      0.45 * outwardZ + 0.55 * Math.cos(ambientAz)
    );
    let hash = 0;
    for (let i = 0; i < venueId.length; i++) hash = (hash * 31 + venueId.charCodeAt(i)) | 0;
    const swing = ((hash & 1 ? 1 : -1) * (19 + (Math.abs(hash) % 11))) * DEG;
    const drift = state.reducedMotion ? 0 : Math.sin(elapsed * 0.09 + (hash & 7)) * 0.035;
    const az = clearOfCards(anchor, ambientAz + clamp(blended - ambientAz + swing + drift, -0.85, 0.85));
    return direction(az, elevationDeg, out);
  }

  function venue(pose, venueId, elapsed, t = tune.venue) {
    const anchor = world.anchors.get(venueId);
    if (!anchor) return village(pose, elapsed);
    const el = t.elevation + (state.reducedMotion ? 0 : Math.sin(elapsed * 0.06) * 1.6);
    venueDirection(venueId, anchor, elapsed, el, _dir);
    basis(_dir);
    // Every church is a different animal — a barn of a gym, a spire twice the
    // height of its nave. Frame what is actually there, weighted low so the
    // grounds and the rooms on them stay in the picture.
    let d;
    const grounds = anchor.grounds ?? anchor.box;
    if (grounds) {
      _subject.set(
        (grounds.min.x + grounds.max.x) * 0.5,
        grounds.min.y + (grounds.max.y - grounds.min.y) * 0.45,
        (grounds.min.z + grounds.max.z) * 0.5
      );
      d = fitBox(grounds, _subject, t.fov, t.fx, t.fy, t.fill);
    } else {
      _subject.copy(anchor.position).addScaledVector(UP, t.radius * 0.52);
      d = fitRadius(t.radius, t.fov, t.fill);
    }
    d *= 1 + breathe(elapsed, 0.012);
    pose.pos.copy(_subject).addScaledVector(_dir, d);
    composeLook(pose.look, _subject, d, t.fov, t.fx, t.fy);
    pose.fov = t.fov;
    pose.roll = state.reducedMotion ? 0 : Math.sin(elapsed * 0.05 + 0.6) * t.roll * DEG;
    return pose;
  }

  function room(pose, venueId, roomId, elapsed, t = tune.room) {
    const anchor = world.anchors.get(venueId);
    const spot = anchor?.rooms?.get(roomId);
    if (!spot) return venue(pose, venueId, elapsed);

    const el = t.elevation + (state.reducedMotion ? 0 : Math.sin(elapsed * 0.07 + 1.4) * 1.4);
    let az;
    if (spot.normal && (spot.normal.x !== 0 || spot.normal.z !== 0)) {
      az = Math.atan2(spot.normal.x, spot.normal.z);
    } else if (anchor.position.distanceToSquared(spot.position) > 1) {
      az = Math.atan2(spot.position.x - anchor.position.x, spot.position.z - anchor.position.z);
    } else {
      az = ambientAz;
    }
    if (!state.reducedMotion) az += Math.sin(elapsed * 0.08) * 0.03;
    direction(az, el, _dir);
    basis(_dir);
    // The room card knows its own size; the framing is the card, hero-sized.
    const radius = spot.radius ?? t.radius;
    const d = fitRadius(radius, t.fov, t.fill) * (1 + breathe(elapsed, 0.01));
    _subject.copy(spot.position);
    pose.pos.copy(_subject).addScaledVector(_dir, d);
    composeLook(pose.look, _subject, d, t.fov, t.fx, t.fy);
    pose.fov = t.fov;
    pose.roll = state.reducedMotion ? 0 : Math.sin(elapsed * 0.06 + 2.2) * t.roll * DEG;
    return pose;
  }

  // ── Wave 2: the correspondence views ───────────────────────────────────────

  /**
   * Writing the letter. The same approach the room framing chose — the card's
   * own open side — carried a step nearer and a shade lower, until the room is
   * at the distance you would sit to write about it. The card holds one side of
   * the frame; the stationery gets the other.
   */
  function applyView(pose, venueId, roomId, elapsed) {
    const t = tune.apply;
    const anchor = world.anchors.get(venueId);
    const spot = anchor?.rooms?.get(roomId);
    if (!spot) return venue(pose, venueId, elapsed, tune.letter);
    room(pose, venueId, roomId, elapsed, t);
    // Sit down to it: the gaze drops to the table, not the roofline.
    const drop = (spot.radius ?? t.radius) * 0.24;
    pose.look.y -= drop;
    pose.pos.y -= drop * 0.5;
    return pose;
  }

  /**
   * A letter, open. The church it is addressed to, held at a courteous
   * distance so the sheet can lie over the world without covering it.
   */
  function letterView(pose, venueId, roomId, elapsed) {
    let id = venueId;
    if (!id && state.applicationId) {
      // A cold deep link carries only the application: the store knows the rest.
      const application = getApplication(state.applicationId);
      if (application) id = application.venueId;
    }
    if (id && world.anchors.has(id)) return venue(pose, id, elapsed, tune.letter);
    measure();
    return journalView(pose, elapsed);
  }

  /**
   * The journal. Nothing in the world is the subject, so the village itself is
   * the page's border: the whole valley, further off than the map view and
   * pushed to one side, still breathing behind the correspondence.
   */
  function journalView(pose, elapsed) {
    const t = tune.journal;
    const az = ambientAzimuth(elapsed);
    const el = t.elevation + (state.reducedMotion ? 0 : Math.sin(elapsed * 0.035) * 1.4);
    direction(az, el, _dir);
    basis(_dir);
    const d = withinWorld(fitBounds(t.fov, t.fx, t.fy, t.fill) * (1 + breathe(elapsed, 0.02)));
    pose.pos.copy(center).addScaledVector(_dir, d);
    composeLook(pose.look, center, d, t.fov, t.fx, t.fy);
    pose.fov = t.fov;
    pose.roll = state.reducedMotion ? 0 : Math.sin(elapsed * 0.029 + 0.8) * t.roll * DEG;
    return pose;
  }

  /**
   * The desk. The host is not a visitor: they stand at their own door, on their
   * own step, and look out at the village their space serves. The camera is
   * placed from the church's door anchor and its measured height — never from a
   * fixed number — and looks back across the valley.
   */
  function deskView(pose, venueId, elapsed) {
    const t = tune.desk;
    const id = venueId ?? hostVenueId();
    const anchor = world.anchors.get(id) ?? world.anchors.get(venueId);
    if (!anchor) {
      measure();
      return journalView(pose, elapsed);
    }
    const box = anchor.box ?? anchor.grounds;
    const height = box ? box.max.y - box.min.y : 40;
    const spread = box ? Math.max(box.max.x - box.min.x, box.max.z - box.min.z) : 60;
    const door = anchor.door ?? anchor.position;

    // Stand outside the village on the church's own side of it and look back
    // in: the host's building holds one shoulder of the frame, at a low angle
    // that puts the eye near its door, and everything they serve lies beyond it.
    _v.subVectors(anchor.position, center);
    _v.y = 0;
    if (_v.lengthSq() < 1e-4) {
      // A church standing exactly at the middle of its own village: fall back
      // to the way its door faces.
      if (anchor.doorNormal) _v.copy(anchor.doorNormal);
      else _v.set(0, 0, 1);
    }
    _v.normalize();
    const drift = state.reducedMotion ? 0 : Math.sin(elapsed * 0.045) * 0.05;
    const az = Math.atan2(_v.x, _v.z) + t.swing + drift;
    const el = t.elevation + (state.reducedMotion ? 0 : Math.sin(elapsed * 0.05 + 1.1) * 0.7);
    direction(az, el, _dir);
    basis(_dir);

    // The eye rests at the height of the doorway, not the roof: a person on the
    // step, not a drone over the parish.
    _subject.copy(door);
    _subject.y = door.y + height * t.eye;
    const d = fitRadius(spread * t.hold, t.fov, 1);
    pose.pos.copy(_subject).addScaledVector(_dir, d);
    composeLook(pose.look, _subject, d, t.fov, t.fx, t.fy);
    pose.fov = t.fov;
    pose.roll = state.reducedMotion ? 0 : Math.sin(elapsed * 0.041 + 2.0) * t.roll * DEG;
    return pose;
  }

  return {
    tune,
    nudge,
    center,
    bounds,
    remeasure: measure,
    /** Pin (or release, with null) the aspect every fit composes against. */
    setFitAspect(aspect) {
      fitAspect = aspect;
    },
    /** Fill `pose` with the composition this view wants right now. */
    evaluate(pose, view, venueId, roomId, elapsed) {
      trackFocus(elapsed);
      switch (view) {
        case 'village':
          measure();
          return village(pose, elapsed);
        case 'venue':
          return venue(pose, venueId, elapsed);
        case 'room':
          return room(pose, venueId, roomId, elapsed);
        case 'apply':
          return applyView(pose, venueId, roomId, elapsed);
        case 'letter':
          return letterView(pose, venueId, roomId, elapsed);
        case 'journal':
          measure();
          return journalView(pose, elapsed);
        case 'desk':
          return deskView(pose, venueId, elapsed);
        default:
          measure();
          return arrival(pose, elapsed);
      }
    },
    /** Depth of field / tilt-shift weight for the current view. */
    tiltFor(view) {
      return tune.tilt[view] ?? tune.tilt.village;
    },
  };
}
