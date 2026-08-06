// The title page. Text sits directly on the sky over a soft paper wash, and
// everything on it is one gesture: roll down into the product. The two calls to
// action differ only in where they land — a guest looking for a hall, or a
// church with one to share — so the second is set quietly beside the first.
//
// The markup itself is printed into index.html so it is on screen before any
// script has arrived (the first paint must not wait on this module); this file
// adopts that DOM and wires it. The build path below is the same markup for any
// page that lacks it — keep the two, and ui/copy.js ARRIVAL, saying one thing.

import { bus, rollTo, setView, state } from '../core/bus.js';
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
      el('div', { class: 'arrival__actions' }, [
        el('button', { type: 'button', class: 'pill pill--primary arrival__cta' }, ARRIVAL.cta),
        el('button', { type: 'button', class: 'pill arrival__host' }, ARRIVAL.ctaHost),
      ]),
      el('p', { class: 'arrival__hint', text: ARRIVAL.hint }),
      // The invitation to scroll, drawn rather than written: a thread down off
      // the page and the smallest chevron. It answers to a click for anyone who
      // would rather ask than scroll.
      el('button', { type: 'button', class: 'arrival__scroll', 'aria-label': ARRIVAL.scroll }, [
        el('span', { class: 'arrival__thread', 'aria-hidden': 'true' }),
        el('span', { class: 'arrival__chevron', 'aria-hidden': 'true' }),
      ]),
    ]),
  ]);
}

export function createArrival() {
  const element = document.getElementById('arrival') ?? build();

  // Property assignment, not addEventListener: adopting the same page twice
  // (a village boot that fell back to flat) must not double the handlers.
  element.querySelector('.arrival__cta').onclick = () => roll();
  element.querySelector('.arrival__host').onclick = () => roll(() => setView('desk'));
  element.querySelector('.arrival__scroll').onclick = () => roll();

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
