// Pointer, wheel and keyboard. The scene itself is scenery: the pointer never
// picks a building — churches and rooms are chosen through the instruments
// (map pins, room lists) or the keyboard. Dragging nudges the ambient drift
// sideways, and Esc comes back up. Nothing here follows the pointer or zooms:
// the framing must hold still while a hand crosses the screen for a control.
//
// On the title page every one of these gestures means the same thing — begin —
// and they all reach the roll rather than the camera.

import { bus, state, setView, setHover, rollTo, scrubRoll } from '../core/bus.js';
import { getVenue } from '../data/venues.js';
import { clamp } from './easing.js';

const SHALLOWER = {
  room: 'venue',
  venue: 'village',
  village: 'arrival',
  // Where a correspondence view lands if we have no record of where it was
  // opened from — a cold deep link straight into a letter, say.
  apply: 'room',
  journal: 'village',
  desk: 'village',
  letter: 'village',
};

/** The correspondence views: opened from somewhere, and returned to it. */
const CORRESPONDENCE = new Set(['apply', 'journal', 'desk', 'letter']);

const CLICK_SLOP = 6;

/** Dust at the end of a gesture, not a tick anybody meant. */
const TICK_FLOOR = 2;
/** A push in the same direction inside this window is the last one still arriving. */
const TICK_QUIET = 260;

/**
 * A wheel has no hand on it: one tick is a whole intention, and the roll answers
 * it in full. The tail of a trackpad flick keeps its direction, so a tick the
 * other way is always a person changing their mind and is honoured at once.
 */
function createTicker() {
  let at = 0;
  let heading = 0;

  return function tick(deltaY) {
    const direction = Math.sign(deltaY);
    if (!direction || Math.abs(deltaY) < TICK_FLOOR) return 0;
    const now = performance.now();
    const fresh = direction !== heading || now - at > TICK_QUIET;
    at = now;
    heading = direction;
    return fresh ? direction : 0;
  };
}

export function createInput(engine, world, compositions, rig) {
  const { canvas } = engine;
  void rig;
  const drag = { active: false, touch: false, x: 0, y: 0, moved: 0, startedAt: 0 };
  const azLimit = compositions.tune.orbit.mode === 'orbit' ? 2.2 : 0.5;

  // Where the visitor was standing when they opened a letter, the journal or
  // the desk. Coming back up returns them there rather than to a guess.
  const opened = { view: null, venueId: null, roomId: null };

  bus.on('view:change', ({ view, previous }) => {
    if (!CORRESPONDENCE.has(view)) {
      opened.view = null;
      return;
    }
    // Stepping between correspondence views (a letter opened from the desk)
    // keeps the original way back.
    if (previous && !CORRESPONDENCE.has(previous.view)) {
      opened.view = previous.view;
      opened.venueId = previous.venueId;
      opened.roomId = previous.roomId;
    }
  });

  function ascend(fromGround) {
    // A stray click on open ground should not throw the viewer out of the
    // village back to the title; Esc still does.
    if (fromGround && (state.view === 'village' || state.view === 'journal')) return;
    // The way back to the title page is the roll, and only the roll: Esc must
    // never tip a visitor out of the product they are standing in.
    if (state.roll > 0 && SHALLOWER[state.view] === 'arrival') return;
    // A letter belongs to a correspondence: it closes back onto the board it
    // was read from. The desk is that board for a host no matter how they got
    // here — entering host mode from the village must not skip it on the way out.
    if (state.view === 'letter') {
      if (state.mode === 'host') return setView('desk', { venueId: state.venueId });
      if (opened.view !== 'village' && opened.view !== 'room' && opened.view !== 'venue')
        return setView('journal');
    }
    if (CORRESPONDENCE.has(state.view) && opened.view) {
      const { view, venueId, roomId } = opened;
      if (view === 'room' && venueId && roomId) return setView('room', { venueId, roomId });
      if (view === 'venue' && venueId) return setView('venue', { venueId });
      if (view === 'arrival') return setView('village');
      return setView(view);
    }
    const next = SHALLOWER[state.view];
    if (!next) return;
    if (next === 'room' && state.venueId && state.roomId) {
      setView('room', { venueId: state.venueId, roomId: state.roomId });
    } else if (next === 'venue' && state.venueId) {
      setView('venue', { venueId: state.venueId });
    } else if (next === 'arrival') {
      setView('arrival');
    } else {
      setView('village');
    }
  }

  function descend(venueId, roomId) {
    if (state.view === 'arrival') return setView('village');
    if (roomId) return setView('room', { venueId, roomId });
    if (venueId) return setView('venue', { venueId });
  }

  /** Pointer capture is a nicety: never let it break a drag or a synthetic event. */
  function capture(on, pointerId) {
    try {
      if (on) canvas.setPointerCapture?.(pointerId);
      else canvas.releasePointerCapture?.(pointerId);
    } catch {
      /* pointer already gone */
    }
  }

  // ── Pointer ────────────────────────────────────────────────────────────────
  // Moving the pointer moves nothing: the camera answers to a deliberate drag,
  // never to where the pointer happens to be resting. A drag sweeps sideways
  // only — nothing the visitor does changes how close the camera stands.
  canvas.addEventListener('pointermove', (event) => {
    if (!drag.active || !event.buttons) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    drag.moved += Math.abs(dx) + Math.abs(dy);
    drag.x = event.clientX;
    drag.y = event.clientY;
    // A finger on the title page is drawing the page up, not turning the
    // village: the same drag anywhere else still sweeps the camera sideways.
    if (drag.touch && state.view === 'arrival') {
      scrubRoll(-dy);
      return;
    }
    compositions.nudge.az = clamp(compositions.nudge.az - dx * 0.0022, -azLimit, azLimit);
    canvas.style.cursor = 'grabbing';
  });

  canvas.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    drag.active = true;
    drag.touch = event.pointerType === 'touch';
    drag.x = event.clientX;
    drag.y = event.clientY;
    drag.moved = 0;
    drag.startedAt = performance.now();
    capture(true, event.pointerId);
  });

  // A gesture the browser takes away from us — a system swipe, a phone call —
  // still has to let go of the roll, or the page is left stranded mid-scrub.
  canvas.addEventListener('pointercancel', (event) => {
    if (!drag.active) return;
    drag.active = false;
    capture(false, event.pointerId);
    canvas.style.cursor = '';
    if (drag.touch) scrubRoll(0, { done: true });
  });

  canvas.addEventListener('pointerup', (event) => {
    if (!drag.active) return;
    drag.active = false;
    capture(false, event.pointerId);
    canvas.style.cursor = '';
    if (drag.touch) scrubRoll(0, { done: true });
    if (drag.moved > CLICK_SLOP || performance.now() - drag.startedAt > 600) return;
    // A click on the world only ever does one thing now: leave the title page.
    // Buildings are chosen through the map and the lists, never the scenery.
    if (state.view === 'arrival') rollTo(1);
  });

  // The wheel does not zoom, and it never has. On the title page it is the
  // roll, and one tick of it is the whole roll: down into the product, or —
  // while that is still running — back up to the title. Past the roll the world
  // leaves the wheel to the printed layer.
  const wheelTick = createTicker();

  canvas.addEventListener(
    'wheel',
    (event) => {
      if (event.ctrlKey) return; // a pinch is the browser's gesture, not ours
      if (state.roll >= 1) return;
      event.preventDefault();
      const direction = wheelTick(event.deltaY);
      if (direction) rollTo(direction > 0 ? 1 : 0);
    },
    { passive: false }
  );

  // ── Keyboard ───────────────────────────────────────────────────────────────
  function focusList() {
    if (state.view === 'village' || state.view === 'arrival' || !state.venueId) {
      const ids = [...world.anchors.keys()];
      // Left to right as they read on screen.
      ids.sort((a, b) => world.anchors.get(a).position.x - world.anchors.get(b).position.x);
      return ids;
    }
    const anchor = world.anchors.get(state.venueId);
    if (!anchor?.rooms) return [];
    // The world is the truth about what is out on the grass — a room published
    // this session stands there too, and belongs in the tab order.
    const order = getVenue(state.venueId)?.rooms.map((r) => r.id) ?? [];
    const ids = order.filter((id) => anchor.rooms.has(id));
    for (const id of anchor.rooms.keys()) if (!ids.includes(id)) ids.push(id);
    return ids;
  }

  function cycle(step) {
    const ids = focusList();
    if (!ids.length) return;
    const inVillage = state.view === 'village' || state.view === 'arrival' || !state.venueId;
    const currentId = inVillage ? state.hoverVenueId : state.hoverRoomId;
    const at = ids.indexOf(currentId);
    const index = at < 0 ? (step > 0 ? 0 : ids.length - 1) : (at + step + ids.length) % ids.length;
    const next = ids[index];
    if (inVillage) setHover(next, null);
    else setHover(state.venueId, next);
  }

  function uiHasFocus() {
    const el = document.activeElement;
    if (!el || el === document.body || el === canvas) return false;
    return document.getElementById('ui')?.contains(el) ?? false;
  }

  /** A dialog only counts while it is actually on screen — the request modal
   *  lives in the DOM from boot, closed. */
  function dialogIsOpen() {
    const nodes = document.querySelectorAll(
      '#ui [role="dialog"], #ui dialog[open], #ui [data-modal="open"]'
    );
    for (const node of nodes) {
      if (node.checkVisibility ? node.checkVisibility() : node.offsetParent !== null) return true;
    }
    return false;
  }

  window.addEventListener('keydown', (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const key = event.key;

    if (key === 'Escape') {
      if (dialogIsOpen()) return;
      event.preventDefault();
      ascend(false);
      return;
    }

    if (state.view === 'arrival' && !uiHasFocus()) {
      if (key === 'Enter' || key === ' ' || key === 'ArrowDown' || key === 'PageDown') {
        event.preventDefault();
        rollTo(1);
        return;
      }
    }

    if (key === 'Tab') {
      if (uiHasFocus()) return; // the overlay's own tab order comes first
      event.preventDefault();
      cycle(event.shiftKey ? -1 : 1);
      return;
    }

    if (uiHasFocus()) return;

    if (key === 'ArrowRight' || key === 'ArrowDown') {
      event.preventDefault();
      cycle(1);
    } else if (key === 'ArrowLeft' || key === 'ArrowUp') {
      event.preventDefault();
      cycle(-1);
    } else if (key === 'Enter' || key === ' ') {
      event.preventDefault();
      const inVillage = state.view === 'village';
      if (inVillage) {
        descend(state.hoverVenueId ?? focusList()[0], null);
      } else if (state.hoverVenueId && state.hoverVenueId !== state.venueId) {
        descend(state.hoverVenueId, null);
      } else {
        descend(state.venueId, state.hoverRoomId ?? focusList()[0]);
      }
    }
  });

  return {
    update() {},
  };
}
