// A SPACE THAT IS NOT THERE — the sheet that opens where the listing would have.
//
// steeple answers a direct visit to a listing it cannot show with a designed
// page and a real 404 (design SEO-D10). Inside a session there is no second
// response to give: a link followed from an inbox, a bookmark opened after the
// host took the space down, a slug that was never a room — the document already
// said 200 and no amount of JavaScript changes what the server said. What the
// app can do is stop pretending: put the same words on the page, in the place
// the listing was going to open, and let ui/metadata.js mark the head noindex.
//
// The words are the served page's, to the letter. Somebody who reloads the URL
// should read the same sentence from the server that they just read from the
// app, or the two disagree about what happened to the space.
//
// It is a property sheet like the other two, not a dialog and not an error
// screen: the map stays where it was, the sheet puts down the same way, and the
// way on is a way on rather than a retreat.

import { rollTo, setView, state } from '../core/bus.js';
import { el } from './dom.js';
import { UNAVAILABLE } from './metaText.js';
import { createPutDown } from './rail.js';

export function createUnavailablePanel() {
  const head = el('header', { class: 'sheet__head' }, [
    el('h1', { class: 'sheet__title', text: UNAVAILABLE.heading }),
  ]);

  // The way on sits under the sentence rather than at the foot of the sheet.
  // A room sheet ends in a CTA because everything above it is the case for
  // pressing it; here there is nothing above it, and an action pinned to the
  // bottom of an otherwise empty page reads as a page that failed to load.
  const actions = el('div', { class: 'sheet__ways' }, [
    el(
      'button',
      {
        type: 'button',
        class: 'pill pill--primary pill--wide',
        onclick: () => setView('village'),
      },
      UNAVAILABLE.browse
    ),
    el(
      'button',
      {
        type: 'button',
        class: 'linkish sheet__away',
        // The wordmark's own move, so the two can never mean different things.
        onclick: () => (state.roll > 0 ? rollTo(0) : setView('village')),
      },
      UNAVAILABLE.home
    ),
  ]);

  const body = el('div', { class: 'sheet__body' }, [
    el('p', { class: 'prose', text: UNAVAILABLE.prose }),
    actions,
  ]);

  const element = el('article', { class: 'sheet sheet--unavailable' }, [head, body]);

  const { handle } = createPutDown({
    element,
    onBack: () => setView('village'),
    spoken: 'the map',
  });
  element.prepend(handle);

  let wasOpen = false;

  return {
    element,
    setOpen(open) {
      element.classList.toggle('is-open', open);
      element.toggleAttribute('inert', !open);
      element.setAttribute('aria-hidden', open ? 'false' : 'true');
      if (open && !wasOpen) element.scrollTop = body.scrollTop = 0;
      wasOpen = open;
    },
  };
}
