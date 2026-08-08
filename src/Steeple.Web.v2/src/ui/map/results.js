// The results — the spaces the search found, set out beside their pins.
//
// A result is a listing, not a church: the search asks about rooms, so the
// answer is rooms, and the church is the line under the name. Results and pins
// stay one truth — the same hover warms the world, the same activation opens
// the space, and a church with nothing matching still stands on the map,
// resting.
//
// Every result carries a banner, and on the page the banner leads: two cards
// across the column, each under its own photograph, because a room is chosen by
// the look of it long before the price is read. On a phone, where a sheet is
// read a detent at a time, the same five parts fall back into a line beside a
// thumbnail — see the narrow block in styles/map.css.

import { setHover, setView, state } from '../../core/bus.js';
import { priceParts, spokenPrice } from '../copy.js';
import { el } from '../dom.js';
import { createBanner } from './banner.js';

// Free arrives as an omitted field, as null, and as a host's 0 (ui/copy.js):
// all three are the same offer, and "$0/hr" is not a thing anyone says.
function priceText(item) {
  const { amount, unit, free } = priceParts(item);
  return { text: unit ? `${amount}${unit}` : amount, free };
}

/**
 * The earned average, folded into the line it belongs on rather than given a
 * node of its own — a sixth part would mean laying the row out twice again.
 *
 * Steeple sends nothing at all until a space has a revealed rating, and nothing
 * is what this prints: no "0", no empty stars, no "not rated yet". A space
 * nobody has rated is not a space that was rated badly (D4).
 */
function ratingText(item) {
  const rating = item.rating ?? null;
  if (!rating) return null;
  return `★ ${rating.averageStars.toFixed(1)} (${rating.count})`;
}

function ratingSpoken(item) {
  const rating = item.rating ?? null;
  if (!rating) return '';
  return ` Rated ${rating.averageStars.toFixed(1)} out of 5 from ${rating.count} ${
    rating.count === 1 ? 'rating' : 'ratings'
  }.`;
}

export function createResults({ onRetry = () => {} } = {}) {
  const rowFor = new Map();

  const list = el('ul', { class: 'dm-results', 'aria-label': 'Spaces on this map' });
  // What an empty list means depends on who emptied it: the search itself, or
  // the map being zoomed past everything the search found (ui/map/index.js
  // passes the second sentence). The default is the search's.
  const WIDEN =
    'Nothing here answers that yet. Widen the search — a different day, a smaller group, fewer filters.';
  const empty = el('p', { class: 'dm-empty', text: WIDEN, hidden: true });

  // When steeple answered and refused, the column says so and shows nothing.
  // An empty list under a refusal would read as "nothing matches", which is a
  // claim about the spaces; the rooms the seed knows would read as an answer to
  // a question that was never answered. Neither is true, so neither is printed.
  const troubleSaid = el('p', { class: 'dm-trouble__said' });
  const troubleAgain = el(
    'button',
    // Its own quiet, in map.css: the host desk's `.pill--quiet` is styled in
    // host.css, which loads after this surface's stylesheet.
    { type: 'button', class: 'pill dm-trouble__again', onclick: () => onRetry() },
    'Try again'
  );
  const trouble = el('div', { class: 'dm-trouble', role: 'status', hidden: true }, [
    troubleSaid,
    troubleAgain,
  ]);

  const element = el('div', { class: 'dm-listing' }, [list, empty, trouble]);

  function warm(venueSlug, roomSlug) {
    if (state.view === 'village' || state.view === 'venue') setHover(venueSlug, roomSlug);
  }

  function cool(venueSlug) {
    if (state.hoverVenueId === venueSlug) setHover(null, null);
  }

  /** Rows are kept and re-ordered rather than rebuilt: pictures must not blink. */
  function rowNode(item) {
    const held = rowFor.get(item.id);
    if (held) return held;

    const banner = createBanner();
    const name = el('span', { class: 'dm-row__name' });
    const where = el('span', { class: 'dm-row__where' });
    const meta = el('span', { class: 'dm-row__meta' });
    const price = el('span', { class: 'dm-row__price' });

    // Five parts, flat: the picture, the name, the church it belongs to, the
    // seats and the price. The stylesheet lays the same five out twice — a card
    // under its photograph on the page, a line beside a thumbnail on a phone —
    // so neither shape has to be a component of its own.
    const row = el(
      'button',
      {
        type: 'button',
        class: 'dm-row',
        dataset: { venue: item.venueSlug, room: item.roomSlug },
        onclick: () => setView('room', { venueId: item.venueSlug, roomId: item.roomSlug }),
        onpointerenter: () => warm(item.venueSlug, item.roomSlug),
        onpointerleave: () => cool(item.venueSlug),
        onfocus: () => warm(item.venueSlug, item.roomSlug),
        onblur: () => cool(item.venueSlug),
      },
      [banner.element, name, where, meta, price]
    );

    const made = {
      item: el('li', { class: 'dm-results__item' }, row),
      row,
      banner,
      name,
      where,
      meta,
      price,
    };
    rowFor.set(item.id, made);
    return made;
  }

  function render(items, { emptyText = WIDEN } = {}) {
    const shown = new Set();
    trouble.hidden = true;
    empty.textContent = emptyText;

    for (const item of items) {
      const row = rowNode(item);
      const { text, free } = priceText(item);

      row.banner.show({ url: item.primaryPhotoUrl, name: item.name });
      row.name.textContent = item.name;
      row.where.textContent = `${item.venueShortName} · ${item.suburb}`;
      row.meta.textContent = [`Seats ${item.capacity}`, ratingText(item)]
        .filter(Boolean)
        .join(' · ');
      row.price.textContent = text;
      row.price.classList.toggle('is-free', free);
      row.row.setAttribute(
        'aria-label',
        `${item.name} at ${item.venueName}, ${item.suburb}. Seats ${item.capacity}, ${spokenPrice(
          item
        )}.${ratingSpoken(item)}`
      );

      list.append(row.item);
      shown.add(item.id);
    }

    for (const [id, row] of rowFor) {
      if (shown.has(id)) continue;
      row.item.remove();
      rowFor.delete(id);
    }

    empty.hidden = items.length > 0;
  }

  /**
   * The search could not be answered. The rows go, because a previous answer
   * standing under this sentence is the old answer to a new question.
   *
   * @param {{message:string}} failure — data/catalog.js `readFailure`
   */
  function showTrouble(failure) {
    render([]);
    empty.hidden = true;
    troubleSaid.textContent = failure.message;
    trouble.hidden = false;
  }

  function setCurrent(venueId, roomId) {
    for (const { row } of rowFor.values()) {
      const current =
        row.dataset.venue === venueId && (roomId === null || row.dataset.room === roomId);
      row.classList.toggle('is-current', current);
      if (current) row.setAttribute('aria-current', 'true');
      else row.removeAttribute('aria-current');
    }
  }

  function setHovered(venueId, roomId) {
    for (const { row } of rowFor.values()) {
      row.classList.toggle(
        'is-hovered',
        row.dataset.venue === venueId && (!roomId || row.dataset.room === roomId)
      );
    }
  }

  return { element, render, showTrouble, setCurrent, setHovered };
}
