// Words and numbers. Every count here is computed from src/data/venues.js —
// nothing shown to a visitor is estimated, rounded, or invented — and read
// through the store, so a room a host has just published counts from the
// moment it is published rather than from the seed data.

import { getRoom, VENUES } from '../data/venues.js';
import { effectiveRoom } from '../data/store.js';

export const ARRIVAL = {
  eyebrow: 'Community space in Northern Virginia',
  wordmark: 'Steeple',
  line: 'Affordable halls, studios and gyms to rent by the hour from neighborhood venues — for playgroups, classes, rehearsals and clubs.',
  cta: 'Find a space',
  ctaHost: 'Host a space',
  hint: 'Or scroll to browse the spaces nearby.',
  scroll: 'Scroll down to the spaces nearby',
};

/** Where the breadcrumb, the back links and the announcer all come home to. */
export const HOME_LABEL = 'All spaces';

export const VERIFIED_LABEL = 'Identity verified (SSO)';

/** The space as it stands now: the seed data with any host edits applied. */
export function liveRoom(venueId, roomId) {
  return effectiveRoom(venueId, roomId) ?? getRoom(venueId, roomId);
}

const liveRooms = (venue) => venue.rooms.map((room) => liveRoom(venue.id, room.id) ?? room);

export function publishedRooms(venue) {
  return liveRooms(venue).filter((room) => room.status === 'published');
}

export function draftRooms(venue) {
  return liveRooms(venue).filter((room) => room.status !== 'published');
}

/** Published rooms accepting every selected activity, and the venues holding them. */
export function countMatches(filters) {
  const wanted = [...filters];
  let spaces = 0;
  let churches = 0;
  for (const venue of VENUES) {
    const matches = publishedRooms(venue).filter((room) =>
      wanted.every((activity) => room.activities.includes(activity))
    );
    if (matches.length > 0) churches += 1;
    spaces += matches.length;
  }
  return { spaces, churches };
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

export function resultLine(filters) {
  const { spaces, churches } = countMatches(filters);
  if (spaces === 0) return 'No spaces match every activity selected';
  return `${plural(spaces, 'space', 'spaces')} across ${plural(churches, 'venue', 'venues')}`;
}

export function filterSummary(filters) {
  const chosen = [...filters];
  if (chosen.length === 0) return 'every activity';
  if (chosen.length === 1) return chosen[0].toLowerCase();
  return `${chosen.slice(0, -1).join(', ').toLowerCase()} and ${chosen.at(-1).toLowerCase()}`;
}

/**
 * Price for display: { amount: '$45', unit: '/hr' } or { amount: 'Free' }.
 *
 * Free is written three ways underneath — the API omits the field, the store
 * keeps null, a host's draft carries 0 — and all three mean the same thing to
 * a visitor. "$0/hr" is a price nobody charges and a phrase nobody says.
 */
const isFree = (price) => price === null || price === undefined || Number(price) === 0;

export function priceParts(room) {
  if (isFree(room.pricePerHour)) return { amount: 'Free', unit: null, free: true };
  return { amount: `$${room.pricePerHour}`, unit: '/hr', free: false };
}

export function priceText(room) {
  const { amount, unit } = priceParts(room);
  return unit ? `${amount}${unit}` : amount;
}

/**
 * What a whole venue costs, in as few characters as the truth allows — a map
 * pin has room for about ten of them and one question to answer.
 *
 * A church holds one to three spaces at different rates, so a single figure
 * would be a lie either way round: "from $15" hides that the hall you want is
 * $45, and "$45" hides the $15 room. The band says both ends and nothing else.
 *
 * The spoken form is not the printed one: an en dash and a slash are shorthand
 * for the eye, and a screen reader should hear the sentence they stand for.
 *
 * @param {Array<number|null|undefined>} prices  one per space on offer
 * @returns {{text: string, spoken: string}|null} null when there is nothing on offer
 */
export function priceBand(prices) {
  if (prices.length === 0) return null;
  const paid = prices.filter((p) => !isFree(p)).map(Number).sort((a, b) => a - b);
  if (paid.length === 0) return { text: 'Free', spoken: 'free to use' };
  const [low] = paid;
  const high = paid.at(-1);
  if (paid.length < prices.length) {
    return { text: `Free–$${high}/hr`, spoken: `free to $${high} per hour` };
  }
  if (low === high) return { text: `$${low}/hr`, spoken: `$${low} per hour` };
  return { text: `$${low}–${high}/hr`, spoken: `$${low} to $${high} per hour` };
}

export function spokenPrice(room) {
  return isFree(room.pricePerHour) ? 'free to use' : `$${room.pricePerHour} per hour`;
}

export function seatsText(room) {
  return `Seats ${room.capacity}`;
}

export function joinList(items) {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}
