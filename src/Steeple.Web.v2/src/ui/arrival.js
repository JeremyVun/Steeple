// Adopt the first-frame markup; the fallback and ARRIVAL must say the same thing.

import { bus, rollTo, setView, state } from '../core/bus.js';
import { reportArrival, setArrivalHandler } from '../core/intent.js';
import { ARRIVAL } from './copy.js';
import { el, steepleMark } from './dom.js';

/** Roll down, then open what was asked for once the surface has arrived. */
function roll(land = null) {
  rollTo(1, { land });
}

function build() {
  return el('section', { id: 'arrival', class: 'arrival is-open', 'aria-labelledby': 'arrival-title' }, [
    el('div', { class: 'arrival__sheet' }, [
      el('header', { class: 'arrival__header' }, [
        el('div', { class: 'arrival__brand' }, [steepleMark(25), el('span', { text: ARRIVAL.wordmark })]),
        el('a', { class: 'pill arrival__host', href: 'desk', 'data-intent': 'desk' }, ARRIVAL.ctaHost),
      ]),
      el('div', { class: 'arrival__copy' }, [
        el('p', { class: 'eyebrow arrival__eyebrow', text: ARRIVAL.eyebrow }),
        el('h1', { id: 'arrival-title', class: 'arrival__title' }, [
          el('span', { text: ARRIVAL.title }), ' ', el('span', { text: ARRIVAL.titleEnd }),
        ]),
        el('p', { class: 'arrival__line', text: ARRIVAL.line }),
        el('a', { class: 'pill pill--primary arrival__cta', href: 'browse', 'data-intent': 'village' }, [
          ARRIVAL.cta,
          el('span', { class: 'arrival__arrow', 'aria-hidden': 'true' }),
        ]),
      ]),
      el('div', { class: 'arrival__footer' }, [
        el('a', { class: 'arrival__scroll', href: 'browse', 'data-intent': 'village', 'aria-label': ARRIVAL.scroll },
          el('span', { class: 'arrival__down', 'aria-hidden': 'true' })),
      ]),
    ]),
  ]);
}

export function createArrival() {
  const element = document.getElementById('arrival') ?? build();
  // Large text gets a native scroll surface; ordinary frames leave gestures to the canvas.
  const fit = new ResizeObserver(() => {
    element.classList.toggle('is-scrollable', element.scrollHeight > element.clientHeight + 1);
  });
  fit.observe(element);
  fit.observe(element.querySelector('.arrival__sheet'));
  element.addEventListener('wheel', (event) => {
    if (element.classList.contains('is-scrollable')) event.stopPropagation();
  }, { passive: true });

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
