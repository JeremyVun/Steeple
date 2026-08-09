// The title page. Text sits directly on the sky over a soft paper wash, and
// everything on it is one gesture: roll down into the product. The two calls to
// action differ only in where they land — a guest looking for a hall, or a
// church with one to share — so the second is set quietly beside the first.
//
// The markup itself is printed into index.html so it is on screen before any
// script has arrived (the first paint must not wait on this module); this file
// adopts that DOM and wires it. The build path below is the same markup for any
// page that lacks it — keep the two, and ui/copy.js ARRIVAL, saying one thing.
//
// The presses themselves have been answered since before this module existed:
// the controls are real links to their clean routes and core/intent.js has been
// recording what was asked for. This file says only what a press *means* once
// there is a roll to mean it with; main.js decides when that is (releaseArrival).

import { bus, rollTo, setView, state } from '../core/bus.js';
import { reportArrival, setArrivalHandler } from '../core/intent.js';
import { ARRIVAL } from './copy.js';
import { el, steepleMark } from './dom.js';

/** Roll down, then open what was asked for once the surface has arrived. */
function roll(land = null) {
  rollTo(1, { land });
}

function build() {
  return el('div', { id: 'arrival', class: 'arrival is-open' }, [
    el('div', { class: 'arrival__sheet' }, [
      el('p', { class: 'eyebrow arrival__eyebrow', text: ARRIVAL.eyebrow }),
      el('div', { class: 'arrival__mark' }, steepleMark(34)),
      el('h1', { class: 'arrival__wordmark', text: ARRIVAL.wordmark }),
      el('p', { class: 'arrival__line', text: ARRIVAL.line }),
      // Links, not buttons, and the same links index.html prints: a press must
      // record its destination in the address bar even on a page where no
      // handler has arrived (core/intent.js). Base-relative, like the printed
      // ones — `browse`, not `/browse` — so a stripped prefix survives.
      el('div', { class: 'arrival__actions' }, [
        el(
          'a',
          { class: 'pill pill--primary arrival__cta', href: 'browse', 'data-intent': 'village' },
          ARRIVAL.cta
        ),
        el('a', { class: 'pill arrival__host', href: 'desk', 'data-intent': 'desk' }, ARRIVAL.ctaHost),
      ]),
      el('p', { class: 'arrival__hint', text: ARRIVAL.hint }),
      // The invitation to scroll, drawn rather than written: a thread down off
      // the page and the smallest chevron. It answers to a click for anyone who
      // would rather ask than scroll.
      el(
        'a',
        {
          class: 'arrival__scroll',
          href: 'browse',
          'data-intent': 'village',
          'aria-label': ARRIVAL.scroll,
        },
        [
          el('span', { class: 'arrival__thread', 'aria-hidden': 'true' }),
          el('span', { class: 'arrival__chevron', 'aria-hidden': 'true' }),
        ]
      ),
    ]),
  ]);
}

export function createArrival() {
  const element = document.getElementById('arrival') ?? build();

  // One handler for all three controls, held by core/intent.js and used only
  // once main.js has released the page to the roll. Handing it over rather than
  // attaching our own is what keeps a press answered exactly once: the same
  // press must not both write the route and run the cinematic.
  setArrivalHandler((destination) => {
    reportArrival(destination, 'cinematic');
    roll(destination === 'desk' ? () => setView('desk') : null);
  });

  // Once the roll is under way the sheet's fade *is* the roll — the published
  // --roll-title, followed frame by frame, not a transition of its own.
  bus.on('roll:change', () => {
    element.classList.toggle('is-going', state.roll > 0);
  });

  return {
    element,
    setOpen(open) {
      element.classList.toggle('is-open', open);
      element.toggleAttribute('inert', !open);
      element.setAttribute('aria-hidden', open ? 'false' : 'true');
    },
  };
}
