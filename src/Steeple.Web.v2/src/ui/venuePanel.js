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
import { getListing, searchListings } from '../data/catalog.js';
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
  const text = el('p', { class: 'sheet__address', text: venue.address });
  // role=status rather than a live region on the button: the confirmation is a
  // state of the page, and it must not re-announce the button's own name.
  const said = el('span', { class: 'copyaddr__said', role: 'status' });

  const button = el('button', {
    type: 'button',
    class: 'copyaddr',
    title: 'Copy the address',
    'aria-label': `Copy the address — ${venue.address}`,
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
      await navigator.clipboard.writeText(venue.address);
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

  function show(venue) {
    const token = (showing += 1);
    hero.show({ url: null, name: venue.shortName });

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
      el('div', { class: 'standing' }, [
        addressLine(venue),
        el('p', { class: 'verified verified--quiet' }, [
          el('span', { class: 'verified__dot', 'aria-hidden': 'true' }),
          VERIFIED_LABEL,
        ]),
      ]),
    ]);

    const drafts = draftRooms(venue);
    const rooms = publishedRooms(venue);
    const banners = new Map(rooms.map((room) => [room.id, createBanner('dm-banner spacecard__photo')]));
    for (const room of rooms) banners.get(room.id).show({ url: null, name: room.name });

    replaceChildren(body, [
      el('section', { class: 'spaces' }, [
        el('h2', { class: 'spaces__title' }, [
          'Spaces to rent',
          el('span', { class: 'spaces__count', text: String(rooms.length) }),
        ]),
        el(
          'ul',
          { class: `spaces__grid${rooms.length === 1 ? ' spaces__grid--one' : ''}` },
          rooms.map((room) => spaceCard(venue, room, banners.get(room.id)))
        ),
        drafts.length > 0 &&
          el('p', {
            class: 'aside',
            text: `${drafts.map((room) => room.name.replace(/\s*\(coming soon\)$/, '')).join(', ')} is being prepared and is not listed yet.`,
          }),
      ]),
      el('p', { class: 'prose prose--sm', text: venue.description }),
      el('dl', { class: 'facts facts--pair' }, [
        el('div', { class: 'facts__pair' }, [
          el('dt', { class: 'eyebrow', text: 'Parking' }),
          el('dd', { text: venue.parking }),
        ]),
        el('div', { class: 'facts__pair' }, [
          el('dt', { class: 'eyebrow', text: 'Getting there' }),
          el('dd', { text: venue.transit }),
        ]),
      ]),
    ]);

    // The head's photograph and the cards' come from two calls, and the head
    // waits for its own: a picture that lands and is then replaced by a better
    // one is a page that flickers. If the room detail cannot answer, the search
    // row's picture stands in — the sheet is never left with a hole in it.
    // A church with nothing published has no room detail to ask, so the search
    // row is all there is and it may paint the moment it lands.
    let settled = rooms.length === 0;
    let fallback = null;
    let painted = false;

    // Whichever call can answer with a picture paints, and only the first of
    // them does: the two land in whatever order the network gives them, and a
    // head that takes the row's photograph after the detail's has arrived is
    // both a flicker and the wrong frame — the same one the first card below is
    // already showing.
    const paintHero = (url) => {
      if (!url || painted || token !== showing) return;
      painted = true;
      hero.show({ url, name: venue.shortName });
    };

    // steeple's funnel is room-first and has no venue endpoint (CONTRACT4 §5),
    // so the church's pictures are the pictures of its spaces.
    // Only the pictures are asked for here, so a refused search costs pictures
    // and nothing else: the cards keep their lettered plates and the sheet is
    // whole without them.
    searchListings({ suburb: venue.suburb })
      .then(({ items }) => {
        if (token !== showing) return;
        const mine = items.filter((item) => item.venueSlug === venue.id);
        fallback = mine[0]?.primaryPhotoUrl ?? null;
        if (settled) paintHero(fallback);
        for (const item of mine) {
          banners.get(item.roomSlug)?.show({ url: item.primaryPhotoUrl, name: item.name });
        }
      })
      .catch(() => {});

    if (rooms.length === 0) return;

    getListing(venue.id, rooms[0].id)
      .catch(() => null)
      .then((listing) => {
        settled = true;
        if (token !== showing) return;
        const second = listing?.photos?.[1];
        // The card crop, not the full plate: this is a band 160px high.
        paintHero(second?.cardUrl ?? second?.url ?? listing?.primaryPhotoUrl ?? fallback);
      });
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
