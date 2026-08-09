// WORLD — sky, ground, the five churches, and the quiet life around them. Atlas
// lays the village out across rolling country.
//
// Contract: CONTRACT.md §4 — buildWorld(engine) -> World.

import * as THREE from 'three';
import { VENUES } from '../data/venues.js';
import { state } from '../core/bus.js';
import { Builder } from './builder.js';
import { paperMaterial, glowMaterial, timeUniform } from './materials.js';
import { buildSky } from './sky.js';
import { buildBackdrop } from './backdrop.js';
import { buildChurch } from './churches.js';
import { buildAnnexShell, buildAnnexScaffold, buildParking, buildMetro } from './props.js';
import { buildClouds, buildBirds, buildMotes } from './ambient.js';
import * as atlas from './stage-atlas.js';
import { createCorrespondence } from '../flows/world/index.js';

const LIT = new THREE.Color('#FFC271');
const RESTING_GLOW = new THREE.Color('#9AA69C');
const FULL = new THREE.Color(1.04, 1.0, 0.94);
const RESTING_BODY = new THREE.Color(0.30, 0.35, 0.34);

const METRO_SITE = { x: 318, z: 34, ry: 0.16 };

export async function buildWorld(engine) {
  const { scene } = engine;
  const quality = state.quality;

  buildSky(scene, quality);

  const backdrop = buildBackdrop();
  scene.add(backdrop.group);

  const { heightAt, layout } = atlas.buildStage(scene, { quality });

  const root = new THREE.Group();
  scene.add(root);

  const anchors = new Map();
  const churches = new Map();
  const sites = []; // where letters arrive: each church's door and lantern spot
  let annex = null;

  let correspondence = null;

  for (const venue of VENUES) {
    const l = layout[venue.id];
    const groundY = heightAt(l.x, l.z);
    const { body, glow, meta } = buildChurch(venue.id);

    if (meta.parking) {
      const pb = new Builder();
      buildParking(pb);
      body.merge(pb, { x: meta.parking.x, z: meta.parking.z });
    }

    const group = new THREE.Group();
    group.position.set(l.x, groundY, l.z);
    group.rotation.y = l.ry;

    const bodyMat = paperMaterial({ warmth: 0.46 });
    bodyMat.color.copy(RESTING_BODY).lerp(FULL, 0.9);
    const glowMat = glowMaterial('#FFD9A0');
    const bodyMesh = body.mesh(bodyMat);
    const glowMesh = glow.mesh(glowMat, { cast: false, receive: false });
    group.add(bodyMesh);
    if (glowMesh) group.add(glowMesh);

    root.add(group);

    // The unfinished annex stands apart from the church it belongs to, so that
    // its scaffolding can be struck on publish without touching the building.
    if (meta.annex) {
      const shellB = new Builder();
      const shellGlowB = new Builder();
      buildAnnexShell(shellB, shellGlowB);
      const scaffoldB = new Builder();
      buildAnnexScaffold(scaffoldB);

      const annexGroup = new THREE.Group();
      annexGroup.position.set(meta.annex.x, 0, meta.annex.z);
      annexGroup.add(shellB.mesh(paperMaterial({ warmth: 0.46 })));
      const annexGlowMat = glowMaterial('#C7C6B4');
      const annexGlow = shellGlowB.mesh(annexGlowMat, { cast: false, receive: false });
      if (annexGlow) annexGroup.add(annexGlow);

      const scaffoldMat = paperMaterial({ warmth: 0.42 });
      const scaffold = scaffoldB.mesh(scaffoldMat, { receive: false });
      annexGroup.add(scaffold);
      group.add(annexGroup);

      annex = {
        group: annexGroup,
        scaffold,
        scaffoldMat,
        scaffoldY: scaffold.position.y,
        glowMat: annexGlowMat,
      };
    }

    // What this church actually occupies, in world space, so the camera can
    // frame a broad campus and a tall spire on their own terms.
    group.updateMatrixWorld(true);
    const box = new THREE.Box3()
      .setFromBufferAttribute(bodyMesh.geometry.attributes.position)
      .applyMatrix4(group.matrixWorld);

    const cos = Math.cos(l.ry);
    const sin = Math.sin(l.ry);
    const place = (p) => ({
      x: l.x + p.x * cos + p.z * sin,
      z: l.z - p.x * sin + p.z * cos,
    });
    const doorAt = place(meta.door ?? { x: 0, z: 24 });
    const lanternAt = place(meta.lantern ?? { x: -11, z: 27 });
    sites.push({
      venueId: venue.id,
      door: new THREE.Vector3(doorAt.x, groundY + (meta.door?.y ?? 6), doorAt.z),
      lantern: new THREE.Vector3(lanternAt.x, heightAt(lanternAt.x, lanternAt.z), lanternAt.z),
      facing: l.ry,
    });

    anchors.set(venue.id, {
      position: new THREE.Vector3(l.x, groundY, l.z),
      box, // the building itself
      door: sites[sites.length - 1].door,
      // Which way the door faces: the direction a host looks when they step out.
      doorNormal: new THREE.Vector3(Math.sin(l.ry), 0, Math.cos(l.ry)),
    });
    churches.set(venue.id, {
      id: venue.id,
      glowMat,
      baseY: groundY,
    });
  }

  // The Metro motif — the reason Dunn Loring's transit line reads the way it does
  {
    const site = METRO_SITE;
    const b = new Builder();
    const g = new Builder();
    buildMetro(b, g);
    const grp = new THREE.Group();
    grp.position.set(site.x, heightAt(site.x, site.z), site.z);
    grp.rotation.y = site.ry;
    grp.add(b.mesh(paperMaterial({ warmth: 0.44 })));
    const gm = g.mesh(glowMaterial('#FFDFA6'), { cast: false, receive: false });
    if (gm) grp.add(gm);
    root.add(grp);
  }

  // Ambient life
  const clouds = buildClouds(quality);
  scene.add(clouds.group);
  const birds = buildBirds(quality);
  scene.add(birds.mesh);
  const motes = quality === 'low' ? null : buildMotes(quality, timeUniform);
  if (motes) scene.add(motes);

  const world = {
    anchors,
    /** Radius of the nearest scenery ring — how far the camera may pull back. */
    horizon: backdrop.inner,

    update(dt, elapsed) {
      timeUniform.value = elapsed;

      for (const { ring, speed } of clouds.rings) ring.rotation.y += speed * dt;
      birds.update(elapsed);
      correspondence?.update(dt, elapsed, restingFor);

      for (const ch of churches.values()) {
        const settled = correspondence ? correspondence.windowWarmth(ch.id) : 0;
        const flicker = Math.sin(elapsed * 0.6 + ch.baseY) * (1 - settled) + settled;
        const pulse = 0.94 + 0.06 * flicker;
        const warmth = pulse + settled * 0.5;
        ch.glowMat.color
          .copy(RESTING_GLOW)
          .lerp(LIT, Math.min(1, warmth))
          .multiplyScalar(0.46 + 0.5 * warmth);
      }
    },
  };

  const restingFor = () => 1;

  // The correspondence layer: lanterns, the post, and churches a host has
  // placed. It reads data/store.js and stages the splash's visible reaction.
  correspondence = createCorrespondence({
    engine,
    parent: root,
    sites,
    anchors,
    venues: VENUES,
    layout,
    heightAt,
    annex,
  });
  world.correspondence = correspondence;

  return world;
}
