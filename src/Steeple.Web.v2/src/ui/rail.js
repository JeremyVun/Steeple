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
// The handle pulls both ways, because a sheet you can only put down is a handle
// that lies. Two places it stands (the results sheet's own vocabulary, one
// detent shorter):
//
//   resting  the map keeps its band above the sheet — where a sheet opens
//   raised   the sheet has the page, band and all, for reading a long listing
//
// Raising is a lift of the rail, not a taller sheet: the sheet always fills the
// rail, so the gesture lifts the rail's top to the top line, translates the
// sheet back down to where it stood, and from there the drag is transform only.
// Landing back at rest slides it down and then hands the layout back to the CSS
// in the same frame it arrives — the one place the two pictures are identical.
//
// This module owns the gesture and nothing else. What "one level up" means is
// the caller's to say, so this file can never disagree with the breadcrumb.

import { bus, state } from '../core/bus.js';
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

/** How long a sheet takes to reach a detent it was let go near. */
const SETTLE = 190;

/** And how long it takes to leave, once the view has let go of it: the closing
 *  transition `.sheet` carries in styles/panels.css (opacity 170ms, visibility
 *  at 230). Nothing may touch the sheet's transform until it is out of sight. */
const GONE = 250;

/**
 * Which box scrolls a property sheet. On a phone the sheet is one page and
 * scrolls whole — picture, name, spaces — while wider it is a head that stays
 * put over a scrolling body (styles/panels.css). The sheets keep a reader's
 * place across a repaint, and they have to keep it in the box that holds it.
 *
 * @param {HTMLElement} element  the sheet
 * @param {HTMLElement} body     its body
 */
export function sheetScroller(element, body) {
  return window.matchMedia(NARROW).matches ? element : body;
}

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
  /** A put-down in flight: the sheet is off the page and on its way out, and
   *  the view change it caused must leave its transform where it is. */
  let going = false;
  let detent = 'resting';
  let startY = 0;
  let startOffset = 0;
  let startDetent = 'resting';
  let lastY = 0;
  let lastAt = 0;
  let travelled = 0;
  let moved = false;
  let velocity = 0;
  let frame = 0;

  /** Where a detent stands, in pixels down from the top line. */
  const offsetOf = (name) => (name === 'raised' ? 0 : SHEET_BAND);

  /** Where the sheet was last put, so a gesture that is taken away rather than
   *  finished can still be landed from where it stood. */
  let drawn = 0;

  const draw = (y) => {
    drawn = y;
    element.style.transform = y ? `translate3d(0, ${Math.round(y)}px, 0)` : '';
  };

  /** The rail holds both property sheets, and it is the rail that is lifted. */
  const rail = () => element.parentElement;

  /** The sheet standing on the page as the CSS lays it out, with the map's band
   *  above it: no lift, no transform, nothing of this module left on it. */
  function rest() {
    rail()?.classList.remove('is-lifted');
    element.classList.remove('is-dragging', 'is-going', 'is-settling');
    element.style.transform = '';
    detent = 'resting';
  }

  /** Give the sheet the whole page to move in without moving it: the rail's top
   *  goes to the top line and the sheet is translated back down to where it was
   *  standing. Nothing is transitioned across this — it is the same picture. */
  function lift(from) {
    rail()?.classList.add('is-lifted');
    draw(from);
  }

  function slide(to, after) {
    element.classList.remove('is-dragging');
    if (state.reducedMotion) {
      draw(to);
      after?.();
      return;
    }
    element.classList.add('is-settling');
    draw(to);
    setTimeout(() => {
      element.classList.remove('is-settling');
      after?.();
    }, SETTLE);
  }

  function settle(next) {
    detent = next;
    if (next === 'raised') slide(offsetOf('raised'));
    else slide(offsetOf('resting'), rest);
  }

  /** Down and out, then the view changes — the sheet is seen to be put down.
   *
   * What must not happen on the way out is the put-down played backwards. The
   * sheet leaves on an inline transform, and `.sheet` carries a transform
   * transition of its own for opening and closing: clearing that transform
   * while the sheet is still on the page does not take it off the foot of the
   * page, it *animates it back up* from there to where the CSS wants a closed
   * sheet to sit — six hundred pixels of listing flying up out of the floor and
   * fading, in the same half second the visitor just threw it away. So the
   * marks of the gesture come off last, once the sheet is out of sight, and
   * the view change that the put-down itself causes is not allowed to take
   * them off early (`going`, read by the view:change below). */
  function commit() {
    if (state.reducedMotion) {
      rest();
      onBack();
      return;
    }
    element.classList.remove('is-dragging', 'is-settling');
    element.classList.add('is-going');
    element.style.transform = 'translate3d(0, 100%, 0)';
    setTimeout(() => {
      going = true;
      onBack();
      setTimeout(() => {
        going = false;
        rest();
      }, GONE);
    }, SETTLE);
  }

  handle.addEventListener('pointerdown', (event) => {
    if (!narrow.matches) return;
    dragging = true;
    travelled = 0;
    moved = false;
    velocity = 0;
    startY = event.clientY;
    startDetent = detent;
    startOffset = offsetOf(detent);
    lastY = event.clientY;
    lastAt = event.timeStamp;
    element.classList.add('is-dragging');
    lift(startOffset);
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
    // Down follows the finger the whole way — past the map's band is how a
    // sheet is put down. Up stops at the top line: there is nothing above the
    // page to reveal, and a sheet under the top line is a sheet you cannot leave.
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => draw(Math.max(0, startOffset + dy)));
  });

  /** One step down from wherever the gesture began. */
  const downFrom = (from) => (from === 'raised' ? settle('resting') : commit());

  /** Land the sheet from wherever it has got to. */
  function land(y) {
    if (!dragging) return;
    dragging = false;
    cancelAnimationFrame(frame);
    moved = travelled >= 6;
    const at = Math.max(0, y);
    const flicked = moved && Math.abs(velocity) > FLICK;

    // A flick moves exactly one place, the way it was thrown — raised to rest,
    // rest to the map — because a throw is a step, not a distance.
    if (flicked) return velocity < 0 ? settle('raised') : downFrom(startDetent);
    // Otherwise it lands where it was let go: past the band it is a put-down,
    // and short of that it is whichever place it is nearer.
    if (at > offsetOf('resting') + COMMITTED) return commit();
    settle(at < offsetOf('resting') / 2 ? 'raised' : 'resting');
  }

  function letGo(event) {
    if (!dragging) return;
    handle.releasePointerCapture?.(event.pointerId);
    land(startOffset + (event.clientY - startY));
  }

  handle.addEventListener('pointerup', letGo);
  handle.addEventListener('pointercancel', letGo);

  // A gesture can be taken away rather than finished: the capture handed to
  // something else, a context menu, the window losing focus, the tab going to
  // the back. It must still land, because a sheet left mid-gesture is lifted —
  // its foot hangs below the page by however far it was pulled, and the last
  // inches of a listing quietly cannot be reached. It reads as a sheet at rest
  // that will not scroll to its end, which is the worst kind of broken: silent.
  const abandon = () => {
    if (!dragging) return;
    velocity = 0;
    land(drawn);
  };

  handle.addEventListener('lostpointercapture', abandon);
  window.addEventListener('blur', abandon);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) abandon();
  });
  // Whatever the handle did or did not see, a pointer that has been let go
  // anywhere on the page is a gesture that is over.
  window.addEventListener('pointerup', letGo, true);
  window.addEventListener('pointercancel', letGo, true);

  // The last word on it: a sheet nobody is holding stands where the CSS puts
  // it. If it is ever found lifted at rest — by any road, including one not
  // thought of here — the next thing anyone does to it puts it back. Not on
  // `scroll` alone: a sheet already at the short end of itself fires no scroll
  // however hard it is pushed, which is precisely the state being healed.
  function heal() {
    if (dragging || detent !== 'resting') return;
    if (element.classList.contains('is-settling') || element.classList.contains('is-going')) return;
    if (rail()?.classList.contains('is-lifted')) rest();
  }

  for (const type of ['wheel', 'touchstart', 'pointerdown', 'scroll']) {
    element.addEventListener(type, heal, { passive: true });
  }

  // A press that did not travel is a press. The handle is a button first: it is
  // the whole affordance for anyone reading the page rather than holding it,
  // and it stays the way out of the sheet whichever place the sheet is standing.
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

  // The two places, for anyone holding a keyboard rather than the sheet. The
  // lift is a layout change, so the sheet is put where it already looks before
  // it is asked to move — otherwise there is no distance to transition over.
  handle.addEventListener('keydown', (event) => {
    if (!narrow.matches) return;
    const step = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0;
    if (!step) return;
    event.preventDefault();
    if (step < 0) {
      if (detent === 'raised') return;
      lift(offsetOf('resting'));
      void element.offsetHeight;
      settle('raised');
    } else if (detent === 'raised') settle('resting');
  });

  // A sheet is raised for as long as it is the sheet being read. Anything that
  // changes what is on the page — the room under this venue, the map, a letter
  // over both — puts the rail back where the CSS wants it.
  bus.on('view:change', () => {
    if (dragging) return;
    // The one view change a put-down makes for itself is answered by the
    // put-down, when the sheet has left. Anything after that is somebody
    // asking for a different page, and puts the rail back at once.
    if (going) {
      going = false;
      return;
    }
    rest();
  });
  narrow.addEventListener('change', rest);

  return { handle };
}
