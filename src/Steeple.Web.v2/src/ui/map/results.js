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

export function createResults() {
  const rowFor = new Map();

  const list = el('ul', { class: 'dm-results', 'aria-label': 'Spaces on this map' });
  const empty = el('p', {
    class: 'dm-empty',
    text: 'Nothing here answers that yet. Widen the search — a different day, a smaller group, fewer filters.',
    hidden: true,
  });
  const element = el('div', { class: 'dm-listing' }, [list, empty]);

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

  function render(items) {
    const shown = new Set();

    for (const item of items) {
      const row = rowNode(item);
      const { text, free } = priceText(item);

      row.banner.show({ url: item.primaryPhotoUrl, name: item.name });
      row.name.textContent = item.name;
      row.where.textContent = `${item.venueShortName} · ${item.suburb}`;
      row.meta.textContent = `Seats ${item.capacity}`;
      row.price.textContent = text;
      row.price.classList.toggle('is-free', free);
      row.row.setAttribute(
        'aria-label',
        `${item.name} at ${item.venueName}, ${item.suburb}. Seats ${item.capacity}, ${spokenPrice(item)}.`
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

  return { element, render, setCurrent, setHovered };
}
