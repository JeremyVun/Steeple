// THE BROWSE SURFACE — the product, and the printed half of the roll.
//
// One sheet of paper holding everything past the title page: the top line, the
// map and its list, and the property sheets that open beside them. It rises
// from the foot of the page as the world cranes down onto its own ground, and
// the two motions are one — the village's ground becoming the paper the map is
// printed on.
//
// The roll itself belongs to journey/roll.js. This module only reads it, and
// publishes the numbers the stylesheet does the rest with:
//   --roll        0..1, the roll exactly as it stands
//   --roll-fall   1..0, how far the surface still has to rise
//   --roll-title  1..0, how much of the title is left
//   --roll-wash   1..0, and of the paper it was printed on
//   --roll-sheet  1..0, how much of an overlay sheet is still on the page
// plus `.roll-landed` on the root while the roll is at rest in the product.
//
// The sheets — a desk, an inbox, a letter, the listing flow — are laid over
// this surface rather than inside it, so they need their own number: they leave
// ahead of the paper and are clear of it well before it lands. That number
// starts moving on the first frame of a roll-up, which is the whole point. A
// sheet that sits still over a moving page is the page looking broken.
//
// The surface never gives the page back to a gesture. Scrolling got the
// visitor in; scrolling around the product must only ever be scrolling, or the
// top of the list becomes a trapdoor to the title page. The one way back up is
// the wordmark, which says what it does.

import { bus, state } from '../core/bus.js';
import { el } from './dom.js';

const smoothstep = (edge0, edge1, x) => {
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
};

export function createBrowse() {
  const element = el('div', { class: 'browse' });
  const root = document.documentElement;

  // The weather off the title page, carried onto the paper: a cloud shadow
  // crossing the sheet, and now and then a bird over the top line. It is under
  // everything and takes no pointer events — the product never notices it.
  element.append(
    el('div', { class: 'browse__sky', 'aria-hidden': 'true' }, [
      el('div', { class: 'browse__cloud' }),
      el('div', { class: 'browse__cloud browse__cloud--high' }),
      el('div', { class: 'browse__bird' }),
    ])
  );

  function render() {
    const p = state.roll;
    // Four beats, in order and overlapping: the title lifts off the page, the
    // paper it was printed on dissolves after it, the village gives up the
    // frame, the surface arrives. The words go first and quickly — text held
    // half-transparent over a moving village is not a fade, it is a mess.
    const risen = smoothstep(0.18, 0.95, p);
    root.style.setProperty('--roll', p.toFixed(4));
    root.style.setProperty('--roll-fall', (1 - risen).toFixed(4));
    root.style.setProperty('--roll-title', (1 - smoothstep(0, 0.17, p)).toFixed(4));
    root.style.setProperty('--roll-wash', (1 - smoothstep(0.08, 0.44, p)).toFixed(4));
    // The sheets go ahead of the paper and are clear of it well before it
    // lands. A linear ramp off the very top, deliberately: every eased number
    // above starts slowly, and the sheet is the thing that has to be seen
    // moving in the first frames or the page reads as hung.
    root.style.setProperty('--roll-sheet', Math.max(0, (p - 0.3) / 0.7).toFixed(4));
    // At rest nothing is transformed: Leaflet measures a plain page, and the
    // paper takes pointer events instead of passing them to the world behind.
    element.classList.toggle('is-landed', p >= 1);
    root.classList.toggle('roll-landed', p >= 1);
    element.toggleAttribute('inert', p < 1);
  }

  bus.on('roll:change', render);
  render();

  return {
    element,
    /** The surface holds the whole of the product; everything mounts into it. */
    mount(nodes) {
      element.append(...nodes);
    },
    /** A letter or a desk is laid over the surface: quiet the page beneath it. */
    setUnder(under) {
      element.classList.toggle('is-under', under);
    },
  };
}
