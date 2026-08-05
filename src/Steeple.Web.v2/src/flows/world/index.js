// CORRESPONDENCE — the world's half of the letters.
//
// Both lenses (guest and host) look at the same village, so the village itself
// carries the state of every conversation: a lantern by the door where letters
// are waiting, steady window light where a booking is in the book, a week
// ribbon on the room that is spoken for, a letter that folds and flies when one
// is sent, wax and a bell when one is answered, and the scaffolding coming off
// the annex the moment its listing is published.
//
// Nothing here is invented: every signal is read from data/store.js, and it is
// re-derived on every 'store:change'.

import { bus, state } from '../../core/bus.js';
import { store, todayIso, weekdayOf } from '../../data/store.js';
import { createLanterns } from './lanterns.js';
import { createPost } from './envelope.js';
import { createBell } from './bell.js';
import { createRibbons } from './ribbons.js';
import { createPlacedVenues, fitDataToStage } from './placed.js';

const SCAFFOLD_STRIKE = 1.6; // seconds for the scaffolding to be lifted away

export function createCorrespondence(kit) {
  const {
    engine,
    parent,
    sites,
    anchors,
    venues,
    layout,
    heightAt,
    roomCards,
    addRoomCard,
    annex,
    onWorldChange,
  } = kit;

  // `?lantern=lamp|window` (state.lantern) — how a church shows what its post
  // has brought: a lamp by the door, or the building's own windows.
  const lanterns = createLanterns({ parent, sites, variant: state.lantern });
  const post = createPost({ parent, camera: engine.camera });
  const bell = createBell({ reducedMotion: state.reducedMotion });
  const ribbons = createRibbons({ store, todayIso, weekdayOf });
  const placed = createPlacedVenues({
    parent,
    store,
    heightAt,
    project: fitDataToStage(venues, layout),
    anchors,
    onChange: onWorldChange,
  });

  // Where the post is actually delivered: a step out from the door and a little
  // above the path, so a letter arriving — or wax being pressed — is never
  // swallowed by a portico or a porch roof.
  const doors = new Map();
  for (const site of sites) {
    const drop = site.door.clone();
    drop.x += Math.sin(site.facing) * 11;
    drop.z += Math.cos(site.facing) * 11;
    drop.y += 7;
    doors.set(site.venueId, drop);
  }

  // ── ribbons on every card the world has already put out ────────────────────
  function attachRibbons() {
    for (const [venueId, rooms] of roomCards) {
      for (const [roomId, card] of rooms) ribbons.attach(venueId, roomId, card);
    }
  }

  // ── lanterns ───────────────────────────────────────────────────────────────
  function deriveSignals() {
    const signals = store.venueSignals();
    for (const site of sites) {
      const s = signals.get(site.venueId);
      const undecided = s ? s.pending + s.needsInfo + s.counterOffered : 0;
      lanterns.setSignal(site.venueId, { undecided, approved: s ? s.approved : 0 });
    }
  }

  // ── the annex: scaffolding struck, and the room joins the world ────────────
  const strike = { t: -1, done: annex ? false : true };

  function annexPublished() {
    const room = store.effectiveRoom('oakton-baptist', 'renovation-annex');
    return room?.status === 'published';
  }

  function joinAnnexToWorld() {
    const card = addRoomCard?.('oakton-baptist', 'renovation-annex');
    if (card) {
      ribbons.attach('oakton-baptist', 'renovation-annex', card);
      onWorldChange?.();
    }
  }

  function strikeScaffolding({ animate }) {
    if (!annex || strike.done) return;
    if (annex.glowMat) annex.glowMat.color.set('#FFDFA6');
    if (!animate) {
      annex.scaffold.visible = false;
      strike.done = true;
      strike.t = -1;
      return;
    }
    strike.t = 0;
    annex.scaffoldMat.transparent = true;
  }

  function updateStrike(dt) {
    if (strike.t < 0) return;
    strike.t += dt;
    const k = Math.min(1, strike.t / SCAFFOLD_STRIKE);
    // Lifted away by an unseen hand, like flats struck between scenes.
    const e = k * k;
    annex.scaffold.position.y = annex.scaffoldY + e * 40;
    annex.scaffold.rotation.z = e * 0.12;
    annex.scaffold.scale.setScalar(1 - e * 0.18);
    annex.scaffoldMat.opacity = Math.max(0, 1 - Math.max(0, (k - 0.15) / 0.5));
    if (k >= 1) {
      annex.scaffold.visible = false;
      strike.t = -1;
      strike.done = true;
    }
  }

  // ── the post ───────────────────────────────────────────────────────────────
  function sendLetter(venueId) {
    const door = doors.get(venueId) ?? anchors.get(venueId)?.door;
    if (!door) return;
    lanterns.hold(venueId);
    post.send({ door, onArrive: () => lanterns.release(venueId) });
  }

  function sealAt(venueId) {
    const door = doors.get(venueId) ?? anchors.get(venueId)?.door;
    if (!door) return;
    post.press({ door });
    bell.ring();
  }

  // ── wiring ─────────────────────────────────────────────────────────────────
  bus.on('store:change', (event) => {
    switch (event.type) {
      case 'submit':
        sendLetter(event.venueId);
        break;
      case 'approve':
      case 'counter-accepted':
        sealAt(event.venueId);
        break;
      case 'room-edit':
        if (event.published && event.venueId === 'oakton-baptist' && event.roomId === 'renovation-annex') {
          strikeScaffolding({ animate: true });
          joinAnnexToWorld();
        }
        break;
      case 'venue-placed':
      case 'reset':
        placed.refresh();
        break;
      default:
        break;
    }
    deriveSignals();
    ribbons.refresh();
  });

  attachRibbons();
  deriveSignals();
  placed.refresh();
  // The store persists: an annex published in an earlier session is simply
  // finished when the visitor arrives.
  if (annexPublished()) strikeScaffolding({ animate: false });

  return {
    variant: state.lantern,
    placedPicks: () => placed.picks(),

    windowWarmth(venueId) {
      return lanterns.windowWarmth(venueId);
    },

    update(dt, elapsed, restingFor) {
      updateStrike(dt);
      post.update(dt);
      lanterns.update(dt, elapsed, engine.camera, restingFor);
    },

    /** Verification surface — what the world believes about the letters. */
    debug: {
      lantern(venueId) {
        const lamp = lanterns.lampFor(venueId);
        if (!lamp) return null;
        return {
          waiting: Number(lamp.waiting.toFixed(3)),
          settled: Number(lamp.settled.toFixed(3)),
          visible: lamp.bulb.visible,
          bloom: Number(lamp.bloom.material.opacity.toFixed(3)),
        };
      },
      ribbonMask: (venueId, roomId) => ribbons.maskOf(venueId, roomId),
      get envelopeFlying() {
        return post.busy;
      },
      get letter() {
        return post.letter;
      },
      get scaffoldStruck() {
        return strike.done;
      },
      get bellArmed() {
        return bell.armed;
      },
      get placedCount() {
        return placed.count;
      },
    },
  };
}
