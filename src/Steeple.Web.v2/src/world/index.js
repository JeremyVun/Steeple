// WORLD — sky, ground, the five churches, their rooms, and the quiet life around
// them. Two staging styles share every model: `atlas` lays them out across rolling
// country, `diorama` stands them between cut paper flats.
//
// Contract: CONTRACT.md §4 — buildWorld(engine) -> World.

import * as THREE from 'three';
import { VENUES } from '../data/venues.js';
import { state, bus } from '../core/bus.js';
import { Builder } from './builder.js';
import { C } from './palette.js';
import { paperMaterial, glowMaterial, timeUniform } from './materials.js';
import { buildSky } from './sky.js';
import { buildBackdrop } from './backdrop.js';
import { buildChurch } from './churches.js';
import { buildAnnexShell, buildAnnexScaffold, buildParking, buildMetro } from './props.js';
import { createRoomCard } from './rooms.js';
import { buildClouds, buildBirds, buildMotes } from './ambient.js';
import { damp } from './rng.js';
import * as atlas from './stage-atlas.js';
import * as diorama from './stage-diorama.js';
import { effectiveRoom } from '../data/store.js';
import { createCorrespondence } from '../flows/world/index.js';

const LIT = new THREE.Color('#FFC271');
const RESTING_GLOW = new THREE.Color('#9AA69C');
// Tone mapping flattens small differences, so "resting" has to be a real step
// down in linear space to read as visibly at rest without ever hiding anything.
const FULL = new THREE.Color(1.04, 1.0, 0.94);
const RESTING_BODY = new THREE.Color(0.30, 0.35, 0.34);

const _lo = new THREE.Vector3();
const _hi = new THREE.Vector3();

const METRO_SITE = {
  atlas: { x: 318, z: 34, ry: 0.16 },
  diorama: { x: 252, z: 36, ry: 0.2 },
};

function haloMesh(radius, color, opacity) {
  const mesh = new THREE.Mesh(
    new THREE.RingGeometry(radius * 0.72, radius, 44),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(color),
      transparent: true,
      opacity,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    })
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.renderOrder = 3;
  return mesh;
}

export async function buildWorld(engine) {
  const { scene } = engine;
  const style = state.style === 'diorama' ? 'diorama' : 'atlas';
  const quality = state.quality;
  const stageModule = style === 'atlas' ? atlas : diorama;

  buildSky(scene, style, quality);

  const backdrop = buildBackdrop(style);
  scene.add(backdrop.group);

  const stage = stageModule.buildStage(scene, { quality });
  const heightAt = stage.heightAt;
  const layout = stage.layout;

  const root = new THREE.Group();
  scene.add(root);

  const anchors = new Map();
  const pickables = [];
  const churchPicks = [];
  const churches = new Map();
  const roomCards = new Map(); // venueId -> Map(roomId -> card)
  const allCards = []; // flat, so the update loop never allocates an iterator entry
  const sites = []; // where letters arrive: each church's door and lantern spot
  const plots = new Map(); // venueId -> what a room card needs to be placed later
  let annex = null;

  let presentedVenue = null;
  let hoverVenue = null;
  let hoverRoom = null;
  let matching = new Set(VENUES.map((v) => v.id));
  let correspondence = null;
  const placedPicks = [];

  /**
   * Put one room's card out on the grass at the offset its church reserved for
   * it. Called at build for everything already published, and again live when a
   * host publishes a listing — the world gains a room without being rebuilt.
   */
  function addRoomCard(venueId, roomId) {
    const plot = plots.get(venueId);
    if (!plot) return null;
    if (plot.rooms.has(roomId)) return plot.rooms.get(roomId);
    const room = effectiveRoom(venueId, roomId);
    if (!room) return null;

    const { l, meta, anchorRooms } = plot;
    const slot = meta.rooms[roomId] ?? { x: 0, z: 56, ry: 0 };
    const cos = Math.cos(l.ry);
    const sin = Math.sin(l.ry);
    const wx = l.x + slot.x * cos + slot.z * sin;
    const wz = l.z - slot.x * sin + slot.z * cos;
    const wy = heightAt(wx, wz);

    const card = createRoomCard(venueId, room);
    card.group.position.set(wx, wy + 0.5, wz);
    card.group.rotation.y = l.ry + slot.ry;
    card.setOpen(0);
    card.open = 0;
    card.target = presentedVenue === venueId ? 1 : 0;
    card.hover = 0;
    card.venueId = venueId;
    card.roomId = roomId;
    root.add(card.group);
    plot.rooms.set(roomId, card);
    allCards.push(card);

    // The card faces its own open side; that is where the camera belongs.
    const facing = l.ry + slot.ry;
    anchorRooms.set(roomId, {
      position: new THREE.Vector3(wx, wy + card.centerY, wz),
      normal: new THREE.Vector3(Math.sin(facing), 0.2, Math.cos(facing)).normalize(),
      radius: card.radius,
    });
    growGrounds(venueId);
    refreshPickables();
    return card;
  }

  /** The grounds the camera frames: the building plus every card it presents. */
  function growGrounds(venueId) {
    const anchor = anchors.get(venueId);
    if (!anchor) return;
    const grounds = anchor.grounds.copy(anchor.box);
    for (const spot of anchor.rooms.values()) {
      const r = spot.radius;
      // Conservative below: a card may stand on ground lower than the church's.
      grounds.expandByPoint(
        _lo.set(
          spot.position.x - r,
          Math.min(anchor.position.y, spot.position.y - r),
          spot.position.z - r
        )
      );
      grounds.expandByPoint(
        _hi.set(spot.position.x + r, spot.position.y + r * 0.4, spot.position.z + r)
      );
    }
  }

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
    const glowMat = glowMaterial('#FFD9A0');
    const bodyMesh = body.mesh(bodyMat);
    const glowMesh = glow.mesh(glowMat, { cast: false, receive: false });
    group.add(bodyMesh);
    if (glowMesh) group.add(glowMesh);

    const halo = haloMesh(Math.max(meta.footprint.x, meta.footprint.z) * 0.92, C.terracotta, 0);
    halo.position.y = 0.6;
    group.add(halo);

    const pick = new THREE.Mesh(
      new THREE.BoxGeometry(meta.footprint.x + 26, 74, meta.footprint.z + 26),
      new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false })
    );
    pick.position.y = 30;
    pick.userData = { venueId: venue.id };
    pick.renderOrder = -1;
    group.add(pick);
    churchPicks.push(pick);

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

    // Room cards, laid out at the offsets each church design reserved for them
    const roomMap = new Map();
    const anchorRooms = new Map();
    roomCards.set(venue.id, roomMap);
    plots.set(venue.id, { l, meta, groundY, rooms: roomMap, anchorRooms });

    for (const room of venue.rooms) {
      // The host's own edits decide what stands in the world: a room published
      // in an earlier session is out on the grass when the visitor arrives.
      if ((effectiveRoom(venue.id, room.id) ?? room).status !== 'published') continue;
      addRoomCard(venue.id, room.id);
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
      grounds: box.clone(), // the building and the rooms it presents
      rooms: anchorRooms,
      door: sites[sites.length - 1].door,
      // Which way the door faces: the direction a host looks when they step out.
      doorNormal: new THREE.Vector3(Math.sin(l.ry), 0, Math.cos(l.ry)),
    });
    growGrounds(venue.id);

    churches.set(venue.id, {
      id: venue.id,
      group,
      halo,
      bodyMat,
      glowMat,
      baseY: groundY,
      lit: 1,
      litTarget: 1,
      hover: 0,
      hoverTarget: 0,
    });
  }

  // The Metro motif — the reason Dunn Loring's transit line reads the way it does
  {
    const site = METRO_SITE[style];
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
  const clouds = buildClouds(style, quality);
  scene.add(clouds.group);
  const birds = buildBirds(quality);
  scene.add(birds.mesh);
  const motes = quality === 'low' ? null : buildMotes(quality, timeUniform);
  if (motes) scene.add(motes);

  // ---- World surface -------------------------------------------------------

  pickables.push(...churchPicks);

  function refreshPickables() {
    pickables.length = 0;
    pickables.push(...churchPicks);
    for (let i = 0; i < placedPicks.length; i++) pickables.push(placedPicks[i]);
    if (presentedVenue) {
      const rooms = roomCards.get(presentedVenue);
      if (rooms) for (const card of rooms.values()) pickables.push(card.pick);
    }
  }

  function present(venueId) {
    if (presentedVenue === venueId) return;
    presentedVenue = venueId;
    for (const [id, rooms] of roomCards) {
      for (const card of rooms.values()) card.target = id === venueId ? 1 : 0;
    }
    stage.presentVenue?.(venueId);
    refreshPickables();
  }

  const world = {
    anchors,
    pickables,
    style,
    /** Radius of the nearest scenery ring — how far the camera may pull back. */
    horizon: backdrop.inner,

    setHighlight(venueId = null, roomId = null) {
      hoverVenue = venueId;
      hoverRoom = roomId;
      for (const [id, ch] of churches) {
        ch.hoverTarget = id === venueId && !roomId ? 1 : 0;
      }
    },

    setFiltered(ids) {
      matching = ids && ids.size ? ids : new Set(VENUES.map((v) => v.id));
      for (const [id, ch] of churches) ch.litTarget = matching.has(id) ? 1 : 0;
    },

    setView(view, venueId = null) {
      // 'apply' and 'letter' keep the room cards presented: the correspondence
      // happens at the church, not over a folded-away world.
      const presenting = ['venue', 'room', 'apply', 'letter', 'desk'].includes(view);
      present(presenting ? venueId : null);
    },

    update(dt, elapsed) {
      timeUniform.value = elapsed;

      for (const { ring, speed } of clouds.rings) ring.rotation.y += speed * dt;
      birds.update(elapsed);
      stage.update?.(dt, elapsed);
      correspondence?.update(dt, elapsed, restingFor);

      for (const ch of churches.values()) {
        ch.lit = damp(ch.lit, ch.litTarget, 4.5, dt);
        ch.hover = damp(ch.hover, ch.hoverTarget, 9, dt);

        // Filters own the body of the building; correspondence owns the light
        // in its windows. A church with a booking burns steady, not flickering.
        const settled = correspondence ? correspondence.windowWarmth(ch.id) : 0;
        const flicker = Math.sin(elapsed * 0.6 + ch.baseY) * (1 - settled) + settled;
        const pulse = 0.94 + 0.06 * flicker;
        const warmth =
          (0.24 + 0.76 * ch.lit) * pulse + ch.hover * 0.42 + settled * 0.5 * (0.4 + 0.6 * ch.lit);
        ch.glowMat.color.copy(RESTING_GLOW).lerp(LIT, Math.min(1, warmth)).multiplyScalar(0.46 + 0.5 * warmth);
        ch.bodyMat.color.copy(RESTING_BODY).lerp(FULL, Math.min(1, ch.lit * 0.9 + ch.hover * 0.16));
        ch.group.position.y = ch.baseY + ch.hover * 2.2;
        ch.halo.material.opacity = ch.hover * 0.45;
        ch.halo.scale.setScalar(0.94 + ch.hover * 0.08);
      }

      for (let i = 0; i < allCards.length; i++) {
        const card = allCards[i];
        const hovered = card.venueId === hoverVenue && card.roomId === hoverRoom;
        card.hover = damp(card.hover, hovered ? 1 : 0, 9, dt);
        if (Math.abs(card.open - card.target) > 0.0008) {
          card.open = damp(card.open, card.target, 5.5, dt);
          card.setOpen(card.open);
        }
        if (card.open > 0.002) {
          const flicker = 0.92 + 0.08 * Math.sin(elapsed * 1.3 + i);
          const k = (0.82 + card.hover * 0.5) * flicker;
          for (let m = 0; m < card.glowMats.length; m++) {
            card.glowMats[m].color.copy(LIT).multiplyScalar(k);
          }
          card.halo.material.opacity = (0.2 + card.hover * 0.26) * card.open;
          card.group.scale.setScalar(1 + card.hover * 0.035);
        }
      }
    },
  };

  /** How lit a church is under the current filter — the lanterns rest with it. */
  function restingFor(venueId) {
    return churches.get(venueId)?.lit ?? 1;
  }

  // The correspondence layer: lanterns, ribbons, the post, and the churches a
  // host has placed. It reads data/store.js and stages the world's reaction.
  correspondence = createCorrespondence({
    engine,
    parent: root,
    sites,
    anchors,
    venues: VENUES,
    layout,
    heightAt,
    roomCards,
    addRoomCard,
    annex,
    onWorldChange() {
      // Fires synchronously during createCorrespondence, before the
      // assignment above lands; the initial sync below covers that pass.
      if (!correspondence) return;
      placedPicks.length = 0;
      for (const pick of correspondence.placedPicks()) placedPicks.push(pick);
      refreshPickables();
    },
  });
  world.correspondence = correspondence;
  world.addRoomCard = addRoomCard;
  correspondence.placedPicks().forEach((pick) => placedPicks.push(pick));
  refreshPickables();

  bus.on('view:change', ({ view, venueId }) => world.setView(view, venueId));
  bus.on('filters:change', ({ matching: m }) => world.setFiltered(m));
  bus.on('hover:change', ({ venueId, roomId }) => world.setHighlight(venueId, roomId));

  world.setFiltered(state.matching);
  if (state.view === 'venue' || state.view === 'room') present(state.venueId);

  return world;
}
