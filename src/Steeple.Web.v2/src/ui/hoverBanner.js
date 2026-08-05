// A little paper label for whatever the visitor is pointing at. Fixed at the
// top of the page rather than pinned to the model, so it never jitters.

import { getVenue, getRoom } from '../data/venues.js';
import { el } from './dom.js';

export function createHoverBanner() {
  const title = el('span', { class: 'label__title' });
  const meta = el('span', { class: 'label__meta' });
  const element = el('div', { class: 'label', 'aria-hidden': 'true' }, [title, meta]);

  return {
    element,
    show({ venueId, roomId }) {
      const venue = venueId ? getVenue(venueId) : null;
      if (!venue) {
        element.classList.remove('is-open');
        return;
      }
      const room = roomId ? getRoom(venueId, roomId) : null;
      title.textContent = room ? room.name : venue.shortName;
      meta.textContent = room ? venue.shortName : venue.suburb;
      element.classList.add('is-open');
    },
    hide() {
      element.classList.remove('is-open');
    },
  };
}
