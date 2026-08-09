// Words and numbers. Every count here is computed from what the catalog
// answered with (src/data/catalog.js) — nothing shown to a visitor is
// estimated, rounded, or invented — and read through the store, so a room a
// host has just published counts from the moment it is published.

import { heldRoom } from '../data/catalog.js';
import { effectiveRoom, roomEdits } from '../data/store.js';

// Also printed verbatim in index.html's pre-rendered splash — change both.
export const ARRIVAL = {
  eyebrow: 'Community space in the Washington, DC area',
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

/**
 * The space as it stands now: what the catalog answered about it, with any host
 * edits this browser is still holding laid over the top.
 *
 * The order is the whole of it. This used to read the village's scenery and
 * apply the edits to that, which meant a seed space was shown as the scenery
 * described it however far steeple had moved on — no photographs among other
 * things, because the scenery keeps photo ids and the catalog keeps URLs — and
 * a space the scenery had never heard of was not shown at all. `effectiveRoom`
 * remains the answer for a room only this browser knows: one a host has placed
 * and not yet sent.
 */
export function liveRoom(venueId, roomId) {
  const base = heldRoom(venueId, roomId) ?? effectiveRoom(venueId, roomId);
  if (!base) return null;
  const edits = roomEdits(venueId, roomId);
  return edits ? { ...base, ...edits } : base;
}

const liveRooms = (venue) => venue.rooms.map((room) => liveRoom(venue.id, room.id) ?? room);

export function publishedRooms(venue) {
  return liveRooms(venue).filter((room) => room.status === 'published');
}

export function draftRooms(venue) {
  return liveRooms(venue).filter((room) => room.status !== 'published');
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/**
 * "9 spaces across 5 venues" — the search's own answer, not an estimate. It
 * used to be counted from the bundled scenery, which was true only while the
 * scenery was the catalog.
 */
export function resultLine(items) {
  if (items.length === 0) return 'No spaces match this search';
  const venues = new Set(items.map((item) => item.venueSlug)).size;
  return `${plural(items.length, 'space', 'spaces')} across ${plural(venues, 'venue', 'venues')}`;
}

/**
 * The same answer, clipped by where the map is looking: once a visitor has
 * panned or zoomed, the list says what is on the sheet in front of them, and
 * the head says so in the map's own terms rather than the search's.
 */
export function inViewLine(items) {
  if (items.length === 0) return 'No spaces in view';
  return `${plural(items.length, 'space', 'spaces')} in view`;
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
