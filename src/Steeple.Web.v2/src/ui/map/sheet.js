// THE SHEET — the results list on a phone, drawn up over a full-bleed map.
//
// A narrow page cannot give the map a column and the list a column, so it gives
// them the same one and lets the visitor say how it is shared. Three detents:
//
//   top     the list fills the page, the map is behind it (the pill still shows)
//   middle  roughly the old split — map above, list below
//   bottom  the map has the page, with the handle peeking off the foot
//
// The drag is transform only. Height is set at the two moments a gesture is not
// running — when it starts and where it lands — so nothing is ever laid out
// mid-drag. Leaflet is told how much of its foot is covered once the sheet has
// settled, never during, because re-measuring a map sixty times a second is how
// a phone gets warm.

import { state } from '../../core/bus.js';
import { el } from '../dom.js';

const NARROW = '(max-width: 900px)';
const PEEK = 40; // the handle, and just enough paper under it to read as a sheet
const ORDER = ['top', 'middle', 'bottom'];
const SPOKEN = {
  top: 'The list fills the page.',
  middle: 'The list and the map share the page.',
  bottom: 'The map has the page.',
};

// Past this a flick is a decision, not a nudge: pixels per millisecond.
const FLICK = 0.45;

export function createSheet({ card, panel, above, onSettle = () => {}, announce = () => {} }) {
  const handle = el('button', {
    type: 'button',
    class: 'dm-grab',
    'aria-label': 'Change how much of the list you can see',
  });
  handle.append(el('span', { class: 'dm-grab__bar', 'aria-hidden': 'true' }));

  const narrow = window.matchMedia(NARROW);
  let detent = 'middle';
  let dragging = false;
  let moved = 0;
  let frame = 0;

  function geometry() {
    const height = card.clientHeight;
    // The search pill keeps its place at the top of the page whatever the sheet
    // does — you must always be able to ask a different question.
    const inset = Math.round(above.getBoundingClientRect().bottom - card.getBoundingClientRect().top + 8);
    const middle = Math.round(height * 0.48);
    return {
      height,
      top: Math.min(inset, middle - 40),
      middle,
      bottom: Math.max(height - PEEK, middle + 40),
    };
  }

  const offsetOf = (name) => geometry()[name];

  function draw(y) {
    panel.style.transform = `translate3d(0, ${Math.round(y)}px, 0)`;
  }

  /** The sheet's own height, so the list scrolls inside what can be seen. */
  function fit(y) {
    panel.style.height = `${Math.round(card.clientHeight - y)}px`;
  }

  function settle(next, { spoken = true } = {}) {
    detent = next;
    const y = offsetOf(next);
    panel.dataset.detent = next;
    panel.classList.remove('is-dragging');
    fit(y);
    draw(y);
    handle.setAttribute('aria-label', `Change how much of the list you can see. ${SPOKEN[next]}`);
    if (spoken) announce(SPOKEN[next]);

    const { height, top } = geometry();
    const land = () => onSettle({ top, bottom: height - y });
    if (state.reducedMotion) land();
    else setTimeout(land, 340);
  }

  function cycle(step) {
    const at = ORDER.indexOf(detent);
    settle(ORDER[(at + step + ORDER.length) % ORDER.length]);
  }

  // ── the drag ───────────────────────────────────────────────────────────────

  let startY = 0;
  let startOffset = 0;
  let lastY = 0;
  let lastAt = 0;
  let velocity = 0;

  handle.addEventListener('pointerdown', (event) => {
    if (!narrow.matches) return;
    dragging = true;
    moved = 0;
    startY = event.clientY;
    lastY = event.clientY;
    lastAt = event.timeStamp;
    velocity = 0;
    startOffset = offsetOf(detent);
    // The whole sheet is drawn for the length of the gesture: the one layout a
    // drag is allowed happens before it moves.
    fit(offsetOf('top'));
    panel.classList.add('is-dragging');
    handle.setPointerCapture(event.pointerId);
  });

  handle.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    const { top, bottom } = geometry();
    const y = Math.min(Math.max(startOffset + (event.clientY - startY), top), bottom);
    moved = Math.max(moved, Math.abs(event.clientY - startY));
    const dt = event.timeStamp - lastAt;
    if (dt > 0) velocity = (event.clientY - lastY) / dt;
    lastY = event.clientY;
    lastAt = event.timeStamp;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => draw(y));
  });

  function release(event) {
    if (!dragging) return;
    dragging = false;
    cancelAnimationFrame(frame);
    handle.releasePointerCapture?.(event.pointerId);
    if (moved < 6) return settle(detent, { spoken: false });

    const geo = geometry();
    const y = Math.min(Math.max(startOffset + (event.clientY - startY), geo.top), geo.bottom);

    // A flick carries on the way it was going: the next detent past where the
    // finger let go, so a short push moves one and a long throw moves as far as
    // it was thrown. A slow drag simply lands on whichever detent is nearest.
    if (Math.abs(velocity) > FLICK) {
      const down = velocity > 0;
      const carried = (down ? ORDER : [...ORDER].reverse()).find((name) =>
        down ? geo[name] > y + 1 : geo[name] < y - 1
      );
      return settle(carried ?? (down ? ORDER.at(-1) : ORDER[0]));
    }

    const nearest = ORDER.reduce((best, name) =>
      Math.abs(geo[name] - y) < Math.abs(geo[best] - y) ? name : best
    );
    settle(nearest);
  }

  handle.addEventListener('pointerup', release);
  handle.addEventListener('pointercancel', release);

  // A press that did not travel is a press: the handle is a real button and
  // steps through the detents for anyone not using a finger.
  handle.addEventListener('click', (event) => {
    if (!narrow.matches) return;
    if (moved >= 6) {
      moved = 0;
      return;
    }
    event.preventDefault();
    cycle(1);
  });

  handle.addEventListener('keydown', (event) => {
    if (!narrow.matches) return;
    const step = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0;
    if (!step) return;
    event.preventDefault();
    const at = ORDER.indexOf(detent);
    settle(ORDER[Math.min(Math.max(at + step, 0), ORDER.length - 1)]);
  });

  // ── the page changing shape under it ───────────────────────────────────────

  function apply() {
    if (narrow.matches) {
      panel.classList.add('is-sheet');
      settle(detent, { spoken: false });
    } else {
      panel.classList.remove('is-sheet', 'is-dragging');
      panel.style.transform = '';
      panel.style.height = '';
      delete panel.dataset.detent;
      onSettle({ top: 0, bottom: 0 });
    }
  }

  narrow.addEventListener('change', apply);
  window.addEventListener('resize', () => {
    if (!dragging) apply();
  });

  return { handle, apply, detent: () => detent, cycle };
}
