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
import { draftRooms, HOME_LABEL, priceParts, publishedRooms, seatsText, VERIFIED_LABEL } from './copy.js';
import { el, replaceChildren } from './dom.js';
import { createBanner } from './map/banner.js';
import { createPutDown } from './rail.js';

// Two sheets of paper, one behind the other — the plainest drawing of "take a
// copy of this" there is. Hand-written markup, never anything from the data.
const COPY_ICON =
  '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" focusable="false">' +
  '<rect x="5.4" y="1.6" width="9" height="9" rx="2" fill="none" stroke="currentColor" stroke-width="1.4"/>' +
  '<path d="M10.6 13.2a2 2 0 0 1-2 2H3.6a2 2 0 0 1-2-2V6.4a2 2 0 0 1 2-2" fill="none" ' +
  'stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>';

const TICK_ICON =
  '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" focusable="false">' +
  '<path d="M3 8.6 6.4 12 13 4.6" fill="none" stroke="currentColor" stroke-width="1.7" ' +
  'stroke-linecap="round" stroke-linejoin="round"/></svg>';

/**
 * The address, and a quiet way to take it with you. A church's address is the
 * one thing on this sheet that is meant to leave it — it goes into a maps app,
 * a group chat, a flyer — so it is one press away, and the press says so.
 *
 * The clipboard is not always ours to write to (an insecure origin, a browser
 * that asks first, a refusal). When it is not, the address is selected instead
 * so the copy the visitor makes by hand is still the right one, and the words
 * under the button say which of the two happened.
 */
function addressLine(venue) {
  // Until the venue has been read in full, the suburb is the whole of what a
  // search answer knows about where it is. It is a true, smaller answer.
  const address = venue.address ?? `${venue.suburb}, Virginia`;
  const text = el('p', { class: 'sheet__address', text: address });
  // role=status rather than a live region on the button: the confirmation is a
  // state of the page, and it must not re-announce the button's own name.
  const said = el('span', { class: 'copyaddr__said', role: 'status' });

  const button = el('button', {
    type: 'button',
    class: 'copyaddr',
    title: 'Copy the address',
    'aria-label': `Copy the address — ${address}`,
  });
  button.innerHTML = COPY_ICON;

  let settle = 0;

  function confirm(word, ok) {
    clearTimeout(settle);
    button.innerHTML = ok ? TICK_ICON : COPY_ICON;
    button.classList.toggle('is-done', ok);
    said.textContent = word;
    settle = setTimeout(() => {
      button.innerHTML = COPY_ICON;
      button.classList.remove('is-done');
      said.textContent = '';
    }, 2400);
  }

  function select() {
    const range = document.createRange();
    range.selectNodeContents(text);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }

  button.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(address);
      confirm('Address copied', true);
    } catch {
      select();
      confirm('Selected — copy it from here', false);
    }
  });

  return el('div', { class: 'addressline' }, [text, button, said]);
}

function priceTag(room) {
  const { amount, unit, free } = priceParts(room);
  return el('span', { class: `price price--sm${free ? ' price--free' : ''}` }, [
    el('span', { class: 'price__amount', text: amount }),
    unit && el('span', { class: 'price__unit', text: unit }),
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
    const held = body.scrollTop;

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
      venue.description && el('p', { class: 'prose prose--sm', text: venue.description }),
      (venue.parking || venue.transit) &&
        el('dl', { class: 'facts facts--pair' }, [
          venue.parking &&
            el('div', { class: 'facts__pair' }, [
              el('dt', { class: 'eyebrow', text: 'Parking' }),
              el('dd', { text: venue.parking }),
            ]),
          venue.transit &&
            el('div', { class: 'facts__pair' }, [
              el('dt', { class: 'eyebrow', text: 'Getting there' }),
              el('dd', { text: venue.transit }),
            ]),
        ]),
    ]);

    body.scrollTop = held;

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
      if (open && !wasOpen) body.scrollTop = 0;
      wasOpen = open;
    },
  };
}
