// Room sheet — the listing itself, set like a page from a catalogue.
// Every field comes from the data: nothing summarised away, nothing added.
//
// The picture is the one thing here that arrives late: the words are on the
// page the instant the sheet opens, and the photograph fills in behind them
// when the catalog answers. A room with no photograph gets its own lettered
// plate rather than a hole in the page.

import { setView } from '../core/bus.js';
import { getListing } from '../data/catalog.js';
import { priceParts, seatsText } from './copy.js';
import { chipList, el, replaceChildren } from './dom.js';
import { createBanner } from './map/banner.js';
import { createPutDown } from './rail.js';

export function createRoomPanel({ onRequest }) {
  const hero = createBanner('dm-banner dm-banner--hero');
  const head = el('header', { class: 'sheet__head' });
  let showing = 0;
  const body = el('div', { class: 'sheet__body' });
  const cta = el(
    'button',
    { type: 'button', class: 'pill pill--primary pill--wide', onclick: () => onRequest() },
    'Request this space'
  );
  const foot = el('footer', { class: 'sheet__foot' }, [cta]);

  const element = el('article', { class: 'sheet sheet--room' }, [head, body, foot]);

  // One level up from a room is its church — never the map, and never the
  // title page. The sheet's own step says the same thing in words; on a phone
  // the handle says it with the gesture (ui/rail.js).
  let up = () => {};
  const { handle } = createPutDown({
    element,
    onBack: () => up(),
    spoken: 'the church',
  });
  element.prepend(handle);

  function show(venue, room) {
    up = () => setView('venue', { venueId: venue.id });
    handle.setAttribute('aria-label', `Put this down — back to ${venue.shortName}`);
    const { amount, unit, free } = priceParts(room);
    const token = (showing += 1);
    hero.show({ url: null, name: room.name });

    replaceChildren(head, [
      hero.element,
      el(
        'button',
        { type: 'button', class: 'linkish sheet__up', onclick: () => up() },
        `← ${venue.shortName} · ${venue.suburb}`
      ),
      el('h1', { class: 'sheet__title', text: room.name }),
      el('div', { class: 'headline' }, [
        el('p', { class: `price${free ? ' price--free' : ''}` }, [
          el('span', { class: 'price__amount', text: amount }),
          unit && el('span', { class: 'price__unit', text: unit }),
        ]),
        el('p', { class: 'headline__capacity', text: seatsText(room) }),
      ]),
    ]);

    // A refused read leaves the lettered plate standing: the photograph is the
    // one thing on this sheet the catalog owns, and a room whose picture cannot
    // be read is better set as its own initial than as somebody else's picture.
    getListing(venue.id, room.id)
      .catch(() => null)
      .then((listing) => {
        if (token !== showing) return;
        hero.show({ url: listing?.primaryPhotoUrl ?? null, name: room.name });
      });

    replaceChildren(body, [
      el('p', { class: 'prose', text: room.description }),

      el('section', { class: 'block block--access' }, [
        el('h2', { class: 'eyebrow', text: 'Accessibility' }),
        el(
          'ul',
          { class: 'ticks' },
          room.accessibility.map((feature) =>
            el('li', { class: 'ticks__item' }, [
              el('span', { class: 'ticks__mark', 'aria-hidden': 'true' }),
              feature,
            ])
          )
        ),
      ]),

      el('section', { class: 'block' }, [
        el('h2', { class: 'eyebrow', text: 'Amenities' }),
        chipList(room.amenities),
      ]),

      el('section', { class: 'block' }, [
        el('h2', { class: 'eyebrow', text: 'Welcomes' }),
        chipList(room.activities, 'chip chip--activity'),
      ]),

      el('section', { class: 'block block--rules' }, [
        el('h2', { class: 'eyebrow', text: 'House rules' }),
        el('p', { class: 'prose prose--sm', text: room.houseRules }),
      ]),
    ]);
  }

  let wasOpen = false;

  return {
    element,
    show,
    focusCta: () => cta.focus(),
    /**
     * `behind` is the sheet held open under the booking overlay: on the page,
     * under the veil, and out of reach of pointer, keyboard and screen reader
     * until the overlay is put down (CONTRACT5 §1.1).
     */
    setOpen(open, behind = false) {
      element.classList.toggle('is-open', open);
      element.classList.toggle('is-behind', open && behind);
      element.toggleAttribute('inert', !open || behind);
      element.setAttribute('aria-hidden', open && !behind ? 'false' : 'true');
      // Only a sheet that was shut comes back at the top. Coming out from under
      // the booking overlay is not opening — it is finding the page as you left
      // it, scroll and all.
      if (open && !wasOpen) body.scrollTop = 0;
      wasOpen = open;
    },
  };
}
