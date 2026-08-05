// PUTTING A SHEET DOWN — the phone's way back (CONTRACT6 §2.2).
//
// On a desktop a property sheet is a column beside the map and the map is
// always there, so leaving one is a small decision. On a phone the sheet used
// to be the whole page: the map vanished, the breadcrumb is hidden at that
// width, and the only mark left at the top left was the wordmark's chevron —
// which rolls the page back to the title. The way back was invisible and the
// one thing that looked like it was a trapdoor.
//
// Three changes, one idea: a property sheet on a phone is a sheet OVER the map,
// not a page instead of it.
//
//   · A band of map stands above it. You never lose your place, and the pin you
//     came from is panned into that band — so the fastest path to the next
//     church is not "back, then tap": it is tapping the next pin through the
//     band, and the sheet changes under your thumb.
//   · The sheet wears a handle, the same one the results sheet has, and you put
//     it down by dragging it down. A short drag springs back; a real one, or a
//     flick, retreats exactly one level (CONTRACT6 §1.2) — room to venue, venue
//     to the map. Never to the title page: that is the chevron's job and only
//     the chevron's.
//   · The handle is a real button as well, for anyone not using a finger, and
//     the sheet's head carries the same step in words.
//
// This module owns the gesture and nothing else. What "one level up" means is
// the caller's to say, so this file can never disagree with the breadcrumb.

import { state } from '../core/bus.js';
import { el } from './dom.js';

/** How much map stands above a property sheet on a phone. Shared with the CSS
 *  (`--sheet-band`, set from ui/index.js) and with ui/map/index.js, which tells
 *  the map how much of its foot is covered. One number, one place. */
export const SHEET_BAND = 172;

const NARROW = '(max-width: 900px)';

/** Past this the sheet is being thrown down, not nudged: pixels per millisecond. */
const FLICK = 0.5;

/** And past this much travel it is a decision however slowly it was made. */
const COMMITTED = 96;

/**
 * @param {object} options
 * @param {HTMLElement} options.element  the sheet
 * @param {() => void} options.onBack    one level up — the caller decides what that is
 * @param {string} options.spoken        where that is, for the handle's own name
 * @returns {{handle: HTMLElement}}
 */
export function createPutDown({ element, onBack, spoken }) {
  const handle = el('button', {
    type: 'button',
    class: 'sheet__grab',
    'aria-label': `Put this down — back to ${spoken}`,
  });
  handle.append(el('span', { class: 'sheet__grab-bar', 'aria-hidden': 'true' }));

  const narrow = window.matchMedia(NARROW);

  let dragging = false;
  let startY = 0;
  let lastY = 0;
  let lastAt = 0;
  let travelled = 0;
  let moved = false;
  let velocity = 0;
  let frame = 0;

  const draw = (y) => {
    element.style.transform = y ? `translate3d(0, ${Math.round(y)}px, 0)` : '';
  };

  function release() {
    element.classList.remove('is-dragging');
    draw(0);
  }

  /** Down and out, then the view changes — the sheet is seen to be put down. */
  function commit() {
    if (state.reducedMotion) {
      release();
      onBack();
      return;
    }
    element.classList.remove('is-dragging');
    element.classList.add('is-going');
    element.style.transform = 'translate3d(0, 100%, 0)';
    setTimeout(() => {
      element.classList.remove('is-going');
      release();
      onBack();
    }, 190);
  }

  handle.addEventListener('pointerdown', (event) => {
    if (!narrow.matches) return;
    dragging = true;
    travelled = 0;
    moved = false;
    velocity = 0;
    startY = event.clientY;
    lastY = event.clientY;
    lastAt = event.timeStamp;
    element.classList.add('is-dragging');
    handle.setPointerCapture(event.pointerId);
  });

  handle.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    const dy = event.clientY - startY;
    travelled = Math.max(travelled, Math.abs(dy));
    const dt = event.timeStamp - lastAt;
    if (dt > 0) velocity = (event.clientY - lastY) / dt;
    lastY = event.clientY;
    lastAt = event.timeStamp;
    // Down follows the finger; up is resisted, because there is nothing above
    // this sheet to reveal — only the map it is already standing on.
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => draw(dy > 0 ? dy : dy / 4));
  });

  function letGo(event) {
    if (!dragging) return;
    dragging = false;
    cancelAnimationFrame(frame);
    handle.releasePointerCapture?.(event.pointerId);
    moved = travelled >= 6;
    const dy = event.clientY - startY;
    if (dy > COMMITTED || (dy > 12 && velocity > FLICK)) commit();
    else release();
  }

  handle.addEventListener('pointerup', letGo);
  handle.addEventListener('pointercancel', letGo);

  // A press that did not travel is a press. The handle is a button first: it is
  // the whole affordance for anyone reading the page rather than holding it.
  // A click with no pointer behind it (detail 0) came from a key, and a key is
  // never the tail of a drag however far the last one went.
  handle.addEventListener('click', (event) => {
    if (!narrow.matches) return;
    event.preventDefault();
    if (event.detail !== 0 && moved) {
      moved = false;
      return;
    }
    onBack();
  });

  return { handle };
}
