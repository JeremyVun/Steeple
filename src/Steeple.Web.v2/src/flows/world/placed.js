// Churches a host has placed, standing where the host put them.
//
// The five landmarks are staged by hand; a placed church cannot be. It is set
// down at its own projected lat/lng, mapped into whichever staging the visitor
// is looking at by the same fit that carries the five — so a church placed
// beside the W&OD trail appears beside the W&OD trail in both styles.

import * as THREE from 'three';
import { Builder } from '../../world/builder.js';
import { paperMaterial, glowMaterial } from '../../world/materials.js';
import { buildPlacedChapel } from '../../world/props.js';
import { CENTER } from '../../data/venues.js';

/**
 * Least-squares fit of the five known churches: data coordinates (as
 * data/venues.js projects lat/lng) onto the coordinates this style stages them
 * at. Uniform scale and offset only — the arrangement is honest, the
 * compression is the style's.
 */
export function fitDataToStage(venues, layout) {
  let dn = 0;
  let dx = 0;
  let dz = 0;
  let sx = 0;
  let sz = 0;
  for (const venue of venues) {
    const l = layout[venue.id];
    if (!l) continue;
    dn++;
    dx += venue.position.x;
    dz += venue.position.z;
    sx += l.x;
    sz += l.z;
  }
  if (!dn) return (lat, lng) => ({ x: 0, z: 0 });
  dx /= dn;
  dz /= dn;
  sx /= dn;
  sz /= dn;
  let num = 0;
  let den = 0;
  for (const venue of venues) {
    const l = layout[venue.id];
    if (!l) continue;
    const ax = venue.position.x - dx;
    const az = venue.position.z - dz;
    num += ax * (l.x - sx) + az * (l.z - sz);
    den += ax * ax + az * az;
  }
  const scale = den > 1e-6 ? num / den : 1;
  return (lat, lng) => {
    const px = (lng - CENTER.lng) * 8000;
    const pz = -(lat - CENTER.lat) * 10000;
    return { x: sx + (px - dx) * scale, z: sz + (pz - dz) * scale };
  };
}

export function createPlacedVenues({ parent, store, heightAt, project, anchors }) {
  const built = new Map();

  function build(venue) {
    const at = project(venue.lat, venue.lng);
    const y = heightAt(at.x, at.z);
    const group = new THREE.Group();
    group.position.set(at.x, y, at.z);
    // Face the middle of the village: a new church joins the neighbourhood.
    group.rotation.y = Math.atan2(-at.x, -at.z);

    const body = new Builder();
    const glow = new Builder();
    buildPlacedChapel(body, glow);
    const bodyMesh = body.mesh(paperMaterial({ warmth: 0.46 }));
    group.add(bodyMesh);
    const glowMesh = glow.mesh(glowMaterial('#FFD9A0'), { cast: false, receive: false });
    if (glowMesh) group.add(glowMesh);

    parent.add(group);
    group.updateMatrixWorld(true);
    const box = new THREE.Box3()
      .setFromBufferAttribute(bodyMesh.geometry.attributes.position)
      .applyMatrix4(group.matrixWorld);

    anchors.set(venue.id, {
      position: new THREE.Vector3(at.x, y, at.z),
      box,
      door: new THREE.Vector3(
        at.x + Math.sin(group.rotation.y) * 16,
        y + 7,
        at.z + Math.cos(group.rotation.y) * 16
      ),
    });

    built.set(venue.id, { group });
  }

  return {
    refresh() {
      const live = new Set();
      for (const venue of store.placedVenues()) {
        if (typeof venue.lat !== 'number' || typeof venue.lng !== 'number') continue;
        live.add(venue.id);
        if (!built.has(venue.id)) {
          build(venue);
        }
      }
      // A demo reset takes the placed churches away again.
      for (const [id, entry] of built) {
        if (live.has(id)) continue;
        parent.remove(entry.group);
        anchors.delete(id);
        built.delete(id);
      }
    },

    get count() {
      return built.size;
    },
  };
}
