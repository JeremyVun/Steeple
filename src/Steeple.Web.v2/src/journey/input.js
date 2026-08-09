// The gestures that move between the splash and the product. The scene is
// scenery: it has no selectable objects and dragging never steers the camera.

import { bus, state, setView, rollTo, scrubRoll } from '../core/bus.js';

const SHALLOWER = {
  room: 'venue',
  venue: 'village',
  village: 'arrival',
  apply: 'room',
  journal: 'village',
  desk: 'village',
  letter: 'village',
};

const CORRESPONDENCE = new Set(['apply', 'journal', 'desk', 'letter']);
const CLICK_SLOP = 6;
const TICK_FLOOR = 2;
const TICK_QUIET = 260;

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

export function createInput(engine) {
  const { canvas } = engine;
  const drag = { active: false, touch: false, x: 0, y: 0, moved: 0, startedAt: 0 };
  const opened = { view: null, venueId: null, roomId: null };

  bus.on('view:change', ({ view, previous }) => {
    if (!CORRESPONDENCE.has(view)) {
      opened.view = null;
      return;
    }
    if (previous && !CORRESPONDENCE.has(previous.view)) {
      opened.view = previous.view;
      opened.venueId = previous.venueId;
      opened.roomId = previous.roomId;
    }
  });

  function ascend() {
    if (state.roll > 0 && SHALLOWER[state.view] === 'arrival') return;
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
    if (next === 'room' && state.venueId && state.roomId)
      setView('room', { venueId: state.venueId, roomId: state.roomId });
    else if (next === 'venue' && state.venueId) setView('venue', { venueId: state.venueId });
    else if (next === 'arrival') setView('arrival');
    else setView('village');
  }

  function capture(on, pointerId) {
    try {
      if (on) canvas.setPointerCapture?.(pointerId);
      else canvas.releasePointerCapture?.(pointerId);
    } catch {
      // The browser may already have taken the pointer away.
    }
  }

  canvas.addEventListener('pointermove', (event) => {
    if (!drag.active || !event.buttons) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    drag.moved += Math.abs(dx) + Math.abs(dy);
    drag.x = event.clientX;
    drag.y = event.clientY;
    if (drag.touch && state.view === 'arrival') scrubRoll(-dy);
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

  canvas.addEventListener('pointercancel', (event) => {
    if (!drag.active) return;
    drag.active = false;
    capture(false, event.pointerId);
    if (drag.touch) scrubRoll(0, { done: true });
  });

  canvas.addEventListener('pointerup', (event) => {
    if (!drag.active) return;
    drag.active = false;
    capture(false, event.pointerId);
    if (drag.touch) scrubRoll(0, { done: true });
    if (drag.moved > CLICK_SLOP || performance.now() - drag.startedAt > 600) return;
    if (state.view === 'arrival') rollTo(1);
  });

  const wheelTick = createTicker();
  canvas.addEventListener(
    'wheel',
    (event) => {
      if (event.ctrlKey || state.roll >= 1) return;
      event.preventDefault();
      const direction = wheelTick(event.deltaY);
      if (direction) rollTo(direction > 0 ? 1 : 0);
    },
    { passive: false }
  );

  function uiHasFocus() {
    const element = document.activeElement;
    if (!element || element === document.body || element === canvas) return false;
    return document.getElementById('ui')?.contains(element) ?? false;
  }

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
    if (event.key === 'Escape') {
      if (dialogIsOpen()) return;
      event.preventDefault();
      ascend();
      return;
    }
    if (state.view !== 'arrival' || uiHasFocus()) return;
    if (!['Enter', ' ', 'ArrowDown', 'PageDown'].includes(event.key)) return;
    event.preventDefault();
    rollTo(1);
  });
}
