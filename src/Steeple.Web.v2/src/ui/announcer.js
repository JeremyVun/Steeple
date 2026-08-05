// The experience, said out loud. #a11y mirrors every view change in words a
// screen reader can act on — accessibility is part of the brand, not a bolt-on.

import { state } from '../core/bus.js';
import { getVenue } from '../data/venues.js';
import {
  ARRIVAL,
  filterSummary,
  HOME_LABEL,
  joinList,
  liveRoom,
  publishedRooms,
  resultLine,
  spokenPrice,
  VERIFIED_LABEL,
} from './copy.js';

export function createAnnouncer() {
  const region = document.getElementById('a11y');
  let last = '';

  function say(text) {
    if (!region || text === last) return;
    last = text;
    region.textContent = text;
  }

  function describeView() {
    const { view, venueId, roomId } = state;

    if (view === 'arrival') return `Steeple. ${ARRIVAL.line} ${ARRIVAL.hint}`;

    if (view === 'village') {
      return `${HOME_LABEL}. ${resultLine(state.filters)}. Filter by what your group does, or open a venue to see the spaces it rents out.`;
    }

    const venue = getVenue(venueId);
    if (!venue) return `${HOME_LABEL}.`;

    if (view === 'venue') {
      const rooms = publishedRooms(venue);
      const list = rooms
        .map((room) => `${room.name}, seats ${room.capacity}, ${spokenPrice(room)}`)
        .join('. ');
      return `${venue.name}, ${venue.suburb}. ${VERIFIED_LABEL}. ${venue.description} ${rooms.length} spaces to rent. ${list}.`;
    }

    const room = liveRoom(venueId, roomId);
    if (!room) return `${venue.name}, ${venue.suburb}.`;
    return [
      `${room.name} at ${venue.name}, ${venue.suburb}.`,
      `Seats ${room.capacity}, ${spokenPrice(room)}.`,
      room.description,
      `Accessibility: ${joinList(room.accessibility)}.`,
      `Amenities: ${joinList(room.amenities)}.`,
      `Welcomes ${joinList(room.activities)}.`,
      `House rules: ${room.houseRules}`,
      'One action here: request this space.',
    ].join(' ');
  }

  return {
    view: () => say(describeView()),
    filters: () => {
      const summary = filterSummary(state.filters);
      say(
        state.filters.size === 0
          ? `Filters cleared. ${resultLine(state.filters)}.`
          : `Filtered by ${summary}. ${resultLine(state.filters)}.`
      );
    },
    say,
  };
}
