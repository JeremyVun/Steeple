// The week, printed on the room's own doorstep.
//
// A room that is committed to somebody shows it: seven small tiles along the
// front lip of its card, Sunday to Saturday, with the weekdays it is spoken for
// painted terracotta. It is a stripe of colour at the village, a readable week
// once the camera comes down to the card, and it is never a chart.

import * as THREE from 'three';
import { Builder } from '../../world/builder.js';
import { paperMaterial } from '../../world/materials.js';
import { rgb } from '../../world/palette.js';

const TILE_H = 0.55;
const GAP = 0.55;

const BASE = '#E3D8C0';
const FREE = rgb(BASE);
const TAKEN = rgb('#C0623F');

/** One mesh per card: seven tiles laid in a row, recoloured in place. */
function buildStrip(width) {
  const tileW = (width - GAP * 6) / 7;
  const b = new Builder();
  for (let day = 0; day < 7; day++) {
    const x = -width / 2 + tileW / 2 + day * (tileW + GAP);
    b.slab(tileW, TILE_H, 2.4, BASE, { x, shade: 0.86 });
  }
  const geo = b.build();
  const mesh = new THREE.Mesh(geo, paperMaterial({ warmth: 0.42 }));
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  // Cut card has darker edges; remember each vertex's share of the flat colour
  // so a repaint can keep the cut and only change the pigment.
  const color = geo.attributes.color;
  const shades = new Float32Array(color.count);
  for (let i = 0; i < color.count; i++) shades[i] = color.getX(i) / FREE[0];
  mesh.userData.shades = shades;
  mesh.userData.perTile = color.count / 7;
  return mesh;
}

function paintStrip(mesh, mask) {
  const color = mesh.geometry.attributes.color;
  const { shades, perTile } = mesh.userData;
  for (let day = 0; day < 7; day++) {
    const c = mask & (1 << day) ? TAKEN : FREE;
    for (let i = 0; i < perTile; i++) {
      const at = day * perTile + i;
      const s = shades[at];
      color.setXYZ(at, c[0] * s, c[1] * s, c[2] * s);
    }
  }
  color.needsUpdate = true;
}

export function createRibbons({ store, todayIso, weekdayOf }) {
  const strips = new Map(); // `${venueId}/${roomId}` -> mesh

  function maskFor(venueId, roomId) {
    const today = todayIso();
    let mask = 0;
    for (const occurrence of store.roomOccurrences(venueId, roomId)) {
      if (occurrence.date < today) continue;
      mask |= 1 << weekdayOf(occurrence.date);
    }
    return mask;
  }

  return {
    /** Attach a ribbon to a room card (idempotent). */
    attach(venueId, roomId, card) {
      const key = `${venueId}/${roomId}`;
      if (strips.has(key) || !card.ribbonMount) return;
      const mesh = buildStrip(card.ribbonWidth ?? 20);
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      card.ribbonMount.add(mesh);
      strips.set(key, mesh);
      this.refreshOne(venueId, roomId);
    },

    refreshOne(venueId, roomId) {
      const mesh = strips.get(`${venueId}/${roomId}`);
      if (!mesh) return;
      const mask = maskFor(venueId, roomId);
      mesh.visible = mask !== 0;
      if (mask !== mesh.userData.mask) {
        mesh.userData.mask = mask;
        if (mask) paintStrip(mesh, mask);
      }
    },

    refresh() {
      for (const key of strips.keys()) {
        const slash = key.indexOf('/');
        this.refreshOne(key.slice(0, slash), key.slice(slash + 1));
      }
    },

    /** For tests: which weekdays a room's ribbon is currently showing. */
    maskOf(venueId, roomId) {
      return strips.get(`${venueId}/${roomId}`)?.userData.mask ?? 0;
    },
  };
}
