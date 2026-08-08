// Room sheet — the listing itself, set like a page from a catalogue.
// Every field comes from the data: nothing summarised away, nothing added.
//
// What arrives late is whatever the search answer could not carry. A summary
// names the space, prices it, sizes it and lists what it has; the listing adds
// the photograph, the description and the house rules. The head is on the page
// in the same frame as the press that opened it, and the rest fills in behind.
// A room with no photograph gets its own lettered plate rather than a hole in
// the page, and a paragraph that has not arrived is absent rather than empty.

import { setView } from '../core/bus.js';
import { getListing } from '../data/catalog.js';
import { priceParts, seatsText } from './copy.js';
import { chipList, el, replaceChildren } from './dom.js';
import { createBanner } from './map/banner.js';
import { createPutDown, sheetScroller } from './rail.js';

/** The fields a source actually answered for — the rest are somebody else's. */
const said = (values) =>
  Object.fromEntries(Object.entries(values).filter(([, v]) => v !== null && v !== undefined));

/** What everyone who has been here says, in one line beside the price. */
function ratingLine(room) {
  const rating = room.rating ?? null;
  if (!rating) return null;
  const count = `${rating.count} ${rating.count === 1 ? 'rating' : 'ratings'}`;
  const average = rating.averageStars.toFixed(1);
  return el('p', { class: 'headline__rating' }, [
    // Printed once and read once: the glyph is decoration over the sentence
    // below it, not a word anybody wants spelled out.
    el('span', { 'aria-hidden': 'true' }, [
      el('span', { class: 'headline__star', text: '★' }),
      ` ${average} · ${count}`,
    ]),
    el('span', { class: 'visually-hidden', text: `Rated ${average} out of 5 from ${count}` }),
  ]);
}

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
    const token = (showing += 1);
    hero.show({ url: room.primaryPhotoUrl ?? null, name: room.name });
    paint(venue, room);

    // The listing is the whole of the space, and the search summary that opened
    // this sheet is a part of it. A refused read leaves the part standing —
    // better a page with no photograph on it than somebody else's.
    getListing(venue.id, room.id)
      .catch(() => null)
      .then((listing) => {
        if (token !== showing || !listing) return;
        hero.show({ url: listing.primaryPhotoUrl ?? null, name: room.name });
        // The listing fills the gaps and settles nothing that was already
        // known: a host's own unpublished edit is what this browser is holding
        // about the space, and steeple has not been told about it yet.
        paint(venue, { ...listing, ...said(room), id: room.id });
      });
  }

  function paint(venue, room) {
    const { amount, unit, free } = priceParts(room);
    const scroller = sheetScroller(element, body);
    const held = scroller.scrollTop;

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
        // Steeple sends no rating at all until a space has a revealed one, and
        // nothing is what an unrated space says here: no "0", no empty stars,
        // no "not rated yet". Absence of signal is not negative signal (D4).
        ratingLine(room),
      ]),
    ]);

    const access = room.accessibility ?? [];
    const amenities = room.amenities ?? [];
    const activities = room.activities ?? [];

    replaceChildren(body, [
      room.description && el('p', { class: 'prose', text: room.description }),

      access.length > 0 &&
        el('section', { class: 'block block--access' }, [
          el('h2', { class: 'eyebrow', text: 'Accessibility' }),
          el(
            'ul',
            { class: 'ticks' },
            access.map((feature) =>
              el('li', { class: 'ticks__item' }, [
                el('span', { class: 'ticks__mark', 'aria-hidden': 'true' }),
                feature,
              ])
            )
          ),
        ]),

      amenities.length > 0 &&
        el('section', { class: 'block' }, [
          el('h2', { class: 'eyebrow', text: 'Amenities' }),
          chipList(amenities),
        ]),

      activities.length > 0 &&
        el('section', { class: 'block' }, [
          el('h2', { class: 'eyebrow', text: 'Welcomes' }),
          chipList(activities, 'chip chip--activity'),
        ]),

      room.houseRules &&
        el('section', { class: 'block block--rules' }, [
          el('h2', { class: 'eyebrow', text: 'House rules' }),
          el('p', { class: 'prose prose--sm', text: room.houseRules }),
        ]),
    ]);

    scroller.scrollTop = held;
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
      if (open && !wasOpen) element.scrollTop = body.scrollTop = 0;
      wasOpen = open;
    },
  };
}
