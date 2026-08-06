// The experience, said out loud. #a11y mirrors every view change in words a
// screen reader can act on — accessibility is part of the brand, not a bolt-on.

import { state } from '../core/bus.js';
import { heldResults, heldVenue } from '../data/catalog.js';
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
      return `${HOME_LABEL}. ${resultLine(heldResults())}. Filter by what your group does, or open a venue to see the spaces it rents out.`;
    }

    const venue = heldVenue(venueId);
    if (!venue) return `${HOME_LABEL}.`;

    if (view === 'venue') {
      const rooms = publishedRooms(venue);
      const list = rooms
        .map((room) => `${room.name}, seats ${room.capacity}, ${spokenPrice(room)}`)
        .join('. ');
      // A venue steeple has answered for but not yet been read in full has no
      // description to read out. The sentence goes on without it.
      const about = venue.description ? `${venue.description} ` : '';
      // Said only where it is true, exactly as the sheet prints it.
      const mark = venue.verified ? `${VERIFIED_LABEL}. ` : '';
      return `${venue.name}, ${venue.suburb}. ${mark}${about}${rooms.length} spaces to rent. ${list}.`;
    }

    const room = liveRoom(venueId, roomId);
    if (!room) return `${venue.name}, ${venue.suburb}.`;
    // Only what is known: a listing read that has not landed yet leaves the
    // paragraph and the rules out of the sentence rather than saying 'undefined'.
    return [
      `${room.name} at ${venue.name}, ${venue.suburb}.`,
      `Seats ${room.capacity}, ${spokenPrice(room)}.`,
      room.description,
      room.accessibility?.length && `Accessibility: ${joinList(room.accessibility)}.`,
      room.amenities?.length && `Amenities: ${joinList(room.amenities)}.`,
      room.activities?.length && `Welcomes ${joinList(room.activities)}.`,
      room.houseRules && `House rules: ${room.houseRules}`,
      'One action here: request this space.',
    ]
      .filter(Boolean)
      .join(' ');
  }

  return {
    view: () => say(describeView()),
    filters: () => {
      const summary = filterSummary(state.filters);
      say(
        state.filters.size === 0
          ? `Filters cleared. ${resultLine(heldResults())}.`
          : `Filtered by ${summary}. ${resultLine(heldResults())}.`
      );
    },
    say,
  };
}
