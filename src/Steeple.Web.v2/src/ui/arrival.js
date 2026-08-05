// The title page. Text sits directly on the sky over a soft paper wash, and
// everything on it is one gesture: roll down into the product. The two calls to
// action differ only in where they land — a guest looking for a hall, or a
// church with one to share — so the second is set quietly beside the first.

import { bus, rollTo, setView, state } from '../core/bus.js';
import { ARRIVAL } from './copy.js';
import { el, steepleMark } from './dom.js';

/** Roll down, then open what was asked for once the surface has arrived. */
function roll(land = null) {
  rollTo(1, { land });
}

export function createArrival() {
  const cta = el(
    'button',
    {
      type: 'button',
      class: 'pill pill--primary arrival__cta',
      onclick: () => roll(),
    },
    ARRIVAL.cta
  );

  const host = el(
    'button',
    {
      type: 'button',
      class: 'pill arrival__host',
      onclick: () => roll(() => setView('desk')),
    },
    ARRIVAL.ctaHost
  );

  // The invitation to scroll, drawn rather than written: a thread down off the
  // page and the smallest chevron. It answers to a click for anyone who would
  // rather ask than scroll.
  const scroll = el(
    'button',
    {
      type: 'button',
      class: 'arrival__scroll',
      'aria-label': ARRIVAL.scroll,
      onclick: () => roll(),
    },
    [
      el('span', { class: 'arrival__thread', 'aria-hidden': 'true' }),
      el('span', { class: 'arrival__chevron', 'aria-hidden': 'true' }),
    ]
  );

  const element = el('div', { class: 'arrival is-open' }, [
    el('div', { class: 'arrival__sheet' }, [
      el('p', { class: 'eyebrow arrival__eyebrow', text: ARRIVAL.eyebrow }),
      el('div', { class: 'arrival__mark' }, steepleMark(34)),
      el('h1', { class: 'arrival__wordmark', text: ARRIVAL.wordmark }),
      el('p', { class: 'arrival__line', text: ARRIVAL.line }),
      el('div', { class: 'arrival__actions' }, [cta, host]),
      el('p', { class: 'arrival__hint', text: ARRIVAL.hint }),
      scroll,
    ]),
  ]);

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
