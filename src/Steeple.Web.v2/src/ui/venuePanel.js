// Venue sheet — who the church is, what it opens up, and how you get there.
//
// The order is the point (CONTRACT5 §3.1). A visitor who has chosen a church
// has one question left — which room — so the rooms come first, as cards with
// their own picture, price and size, directly under the name. What kind of
// place this is, where to park and how to arrive are the things you read after
// you have seen what there is; they are below.
//
// The church itself has no photograph — steeple photographs rooms, not
// buildings — so the sheet borrows one, and deliberately not the same frame the
// first card is already showing: the room detail carries several views, and the
// second of them makes a header that does not repeat the page under it.
// Pictures arrive after the words: the catalog is a fetch, and a sheet that
// waits for a photograph before it says anything is broken on a slow line.

import { setView, setHover } from '../core/bus.js';
import { readVenue } from '../data/catalog.js';
import { addressCopy } from './addressCopy.js';
import { draftRooms, HOME_LABEL, priceParts, publishedRooms, seatsText, VERIFIED_LABEL } from './copy.js';
import { el, replaceChildren } from './dom.js';
import { createBanner } from './map/banner.js';
import { createPutDown, sheetScroller } from './rail.js';

// The two practicalities wear the marks the street wears: the parking sign as
// it stands at the entrance of every lot in Virginia, and the arrow a maps app
// points with. Line-drawn to the same weight as the copy mark above.
const PARKING_ICON =
  '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">' +
  '<rect x="1.9" y="1.9" width="12.2" height="12.2" rx="3.4" fill="none" stroke="currentColor" stroke-width="1.3"/>' +
  '<path d="M6.4 11.6V4.9h2.2a1.95 1.95 0 0 1 0 3.9H6.4" fill="none" stroke="currentColor" ' +
  'stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const DIRECTIONS_ICON =
  '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">' +
  '<path d="M13.9 2.4 2.7 6.8l4.6 1.9 1.9 4.6Z" fill="none" stroke="currentColor" ' +
  'stroke-width="1.45" stroke-linejoin="round"/></svg>';

/**
 * The address, and a quiet way to take it with you (ui/addressCopy.js — the
 * booking letter says it the same way, because it is the same act).
 */
function addressLine(venue) {
  // Until the venue has been read in full, the suburb is the whole of what a
  // search answer knows about where it is. It is a true, smaller answer.
  return addressCopy(venue.address ?? `${venue.suburb}, Virginia`);
}

function priceTag(room) {
  const { amount, unit, free } = priceParts(room);
  return el('span', { class: `price price--sm${free ? ' price--free' : ''}` }, [
    el('span', { class: 'price__amount', text: amount }),
    unit && el('span', { class: 'price__unit', text: unit }),
  ]);
}

/**
 * One practicality: its mark, what it answers, and the venue's own words.
 *
 * The mark is hand-written markup, never anything from the data (ui/dom.js's
 * rule) — only the label and the words come from the venue.
 */
function practicality(icon, label, words) {
  const mark = el('span', { class: 'facts__mark' });
  mark.innerHTML = icon;
  return el('div', { class: 'facts__pair' }, [
    el('dt', { class: 'eyebrow facts__label' }, [mark, label]),
    el('dd', { text: words }),
  ]);
}

/** One space, offered: the picture, the name, what it holds and what it costs. */
function spaceCard(venue, room, banner) {
  return el(
    'li',
    { class: 'spaces__item' },
    el(
      'button',
      {
        type: 'button',
        class: 'spacecard',
        onclick: () => setView('room', { venueId: venue.id, roomId: room.id }),
        onpointerenter: () => setHover(venue.id, room.id),
        onpointerleave: () => setHover(venue.id, null),
      },
      [
        banner.element,
        el('span', { class: 'spacecard__body' }, [
          el('span', { class: 'spacecard__name', text: room.name }),
          el('span', { class: 'spacecard__meta' }, [
            el('span', { class: 'spacecard__seats', text: seatsText(room) }),
            priceTag(room),
          ]),
        ]),
      ]
    )
  );
}

export function createVenuePanel() {
  const hero = createBanner('dm-banner dm-banner--hero');
  const head = el('header', { class: 'sheet__head' });
  let showing = 0;
  const body = el('div', { class: 'sheet__body' });

  const element = el('article', { class: 'sheet sheet--venue' }, [head, body]);

  // One level up is the map, and it is said in three places that cannot
  // disagree: the breadcrumb, the step at the top of this sheet, and — on a
  // phone, where the breadcrumb is not on the page — the handle you put the
  // sheet down by (ui/rail.js).
  const back = () => setView('village');
  const { handle } = createPutDown({ element, onBack: back, spoken: HOME_LABEL.toLowerCase() });
  element.prepend(handle);

  // Banners are kept for as long as the sheet is about the same venue. The
  // catalog answers a venue in two instalments (data/catalog.js — a search
  // summary, then the room details), and a card whose photograph is torn down
  // and remade between them blinks for no reason a visitor could name.
  let banners = new Map();
  let showingVenue = null;
  let heroUrl = null;

  function bannerFor(room) {
    let held = banners.get(room.id);
    if (!held) {
      held = createBanner('dm-banner spacecard__photo');
      banners.set(room.id, held);
    }
    held.show({ url: room.primaryPhotoUrl ?? null, name: room.name });
    return held;
  }

  /**
   * The sheet, from whatever the catalog holds about this venue now.
   *
   * A venue arrives in two instalments and this runs for each: a search answer
   * names it, says where it is and lists the spaces that matched; the full read
   * adds the address, the description, how to park, how to arrive, and the
   * spaces that did not match the search in hand. For the seed's venues the
   * bundled record is already whole, so the second paint changes nothing and is
   * invisible — which is the point.
   */
  function paint(venue) {
    const token = (showing += 1);
    // Reading down a sheet is not interrupted by the rest of it arriving.
    const scroller = sheetScroller(element, body);
    const held = scroller.scrollTop;

    replaceChildren(head, [
      hero.element,
      // The way back stands at the top of the sheet, under the picture and
      // above the name — where the room sheet's has always been, and where it
      // is on the page whatever the sheet is scrolled to. It used to be a line
      // at the foot of a page you had to reach the end of to find.
      el(
        'button',
        { type: 'button', class: 'linkish sheet__up', onclick: back },
        `← ${HOME_LABEL}`
      ),
      el('p', { class: 'eyebrow', text: `${venue.suburb} · Virginia` }),
      el('h1', { class: 'sheet__title', text: venue.name }),
      // Where it is and that it is who it says it is: one line, because the
      // height belongs to the rooms below. The verified mark is a fact about
      // the church, not an award — it is set as a footnote in the same key as
      // the address rather than as a filled badge shouting beside it.
      // The mark is a fact steeple holds about this venue, not decoration on
      // every sheet. It was printed unconditionally while the only venues that
      // could be opened were the seed's, every one of which is verified; the
      // first venue a host listed would have worn it without having earned it.
      el('div', { class: 'standing' }, [
        addressLine(venue),
        venue.verified &&
          el('p', { class: 'verified verified--quiet' }, [
            el('span', { class: 'verified__dot', 'aria-hidden': 'true' }),
            VERIFIED_LABEL,
          ]),
      ]),
    ]);

    const drafts = draftRooms(venue);
    const rooms = publishedRooms(venue);
    const cardFor = new Map(rooms.map((room) => [room.id, bannerFor(room)]));

    replaceChildren(body, [
      el('section', { class: 'spaces' }, [
        el('h2', { class: 'spaces__title' }, [
          'Spaces to rent',
          el('span', { class: 'spaces__count', text: String(rooms.length) }),
        ]),
        el(
          'ul',
          { class: `spaces__grid${rooms.length === 1 ? ' spaces__grid--one' : ''}` },
          rooms.map((room) => spaceCard(venue, room, cardFor.get(room.id)))
        ),
        drafts.length > 0 &&
          el('p', {
            class: 'aside',
            text: `${drafts.map((room) => room.name.replace(/\s*\(coming soon\)$/, '')).join(', ')} is being prepared and is not listed yet.`,
          }),
      ]),
      // Under the cards are three different kinds of thing — what sort of place
      // this is, and two practicalities — and set as three paragraphs they read
      // as one. The description is a named section in the same voice as the
      // spaces above it, and each practicality wears its own mark.
      venue.description &&
        el('section', { class: 'about' }, [
          el('h2', { class: 'about__title', text: 'About this place' }),
          el('p', { class: 'prose prose--sm', text: venue.description }),
        ]),
      (venue.parking || venue.transit) &&
        el('dl', { class: 'facts facts--pair' }, [
          venue.parking && practicality(PARKING_ICON, 'Parking', venue.parking),
          venue.transit && practicality(DIRECTIONS_ICON, 'Getting there', venue.transit),
        ]),
    ]);

    scroller.scrollTop = held;

    // The venue has no photograph of its own — steeple photographs rooms, not
    // buildings — so the head borrows the *second* view of the first space,
    // which is a header that does not repeat the card directly under it. Only
    // the first picture to arrive is painted: a plate that lands and is then
    // replaced by a better one is a page that flickers.
    const first = rooms[0];
    const second = first?.photos?.[1];
    const url = second?.cardUrl ?? second?.url ?? first?.primaryPhotoUrl ?? null;
    if (url && url !== heroUrl && token === showing) {
      heroUrl = url;
      hero.show({ url, name: venue.shortName });
    }
  }

  /**
   * Open the sheet on a venue, and finish it when the catalog has read the
   * whole of it. `readVenue` answers from what it is already holding when it
   * can, so a venue opened twice costs one read (data/catalog.js).
   */
  function show(venue) {
    if (showingVenue !== venue.id) {
      showingVenue = venue.id;
      banners = new Map();
      heroUrl = null;
      hero.show({ url: null, name: venue.shortName });
    }
    const opened = venue.id;
    paint(venue);
    readVenue(opened)
      .then((whole) => {
        if (whole && showingVenue === opened) paint(whole);
      })
      .catch(() => {});
  }

  let wasOpen = false;

  return {
    element,
    show,
    /** Same contract as the room sheet's: see ui/roomPanel.js. */
    setOpen(open, behind = false) {
      element.classList.toggle('is-open', open);
      element.classList.toggle('is-behind', open && behind);
      element.toggleAttribute('inert', !open || behind);
      element.setAttribute('aria-hidden', open && !behind ? 'false' : 'true');
      if (open && !wasOpen) element.scrollTop = body.scrollTop = 0;
      wasOpen = open;
    },
  };
}
