// THE WORDS A ROUTE IS DESCRIBED IN — this browser's half of one set of rules.
//
// steeple writes the head of a listing document itself, in
// `src/Steeple.Api/Services/Seo/SeoText.cs` and `WebDocumentRenderer.cs`, and
// that response is the authority: a scraper, a crawler and a person with no
// JavaScript read it and nothing else. What happens after the handoff is this
// file's: the app moves between rooms without asking for another document, so
// the title and the meta description have to be rewritten here — in exactly
// the words steeple would have used, or the same room has two descriptions
// depending on how somebody arrived at it.
//
// "Exactly" is not a promise a comment can keep, so it is pinned instead:
// `tests/fixtures/seo-formats.json` holds one table of worked examples, the
// API test suite asserts C# produces them and tools/metadata-test.mjs asserts
// this file does. Neither side can move alone.
//
// Nothing here imports anything. It is arithmetic on strings, and it runs
// under plain node so the table can be checked without a browser.

/** Every run of whitespace — host prose is full of newlines — as one space. */
export function squash(text) {
  if (typeof text !== 'string') return '';
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * An already-squashed string bounded to `max`, cut at a word boundary and
 * ended with an ellipsis. Never a mid-word stump, never a dangling comma.
 */
export function clip(text, max) {
  if (text.length <= max) return text;
  const cut = text.lastIndexOf(' ', Math.min(max - 1, text.length - 1));
  const head = cut > max / 2 ? text.slice(0, cut) : text.slice(0, max - 1);
  return `${head.replace(/[ ,;:.—-]+$/, '')}…`;
}

/** `$45` for dollars, `45 AUD` for anything else; whole amounts written whole. */
export function money(amount, currency) {
  const figure = String(Number(Number(amount).toFixed(2)));
  return String(currency).toUpperCase() === 'USD' ? `$${figure}` : `${figure} ${String(currency).toUpperCase()}`;
}

/**
 * The hourly rate as a phrase. `Free` is what a legacy row with no price says:
 * free listings were removed from the product, but old rows outlive decisions.
 */
export function rate(pricePerHour, currency) {
  const amount = Number(pricePerHour);
  if (!Number.isFinite(amount) || amount <= 0) return 'Free';
  return `${money(amount, currency)}/hr`;
}

/** Beyond this a search engine writes its own description. */
const DESCRIPTION_MAX = 160;

const SITE = 'Steeple';

/**
 * `{Room} at {Venue}, {Suburb} · Steeple`. A venue with no suburb drops the
 * clause rather than printing the gap where it would have been.
 *
 * @param {{name: string, venueName: string, suburb?: string|null}} listing
 */
export function listingTitle(listing) {
  const where = squash(listing.suburb);
  const venue = squash(listing.venueName);
  const place = where.length === 0 ? venue : `${venue}, ${where}`;
  return `${squash(listing.name)} at ${place} · ${SITE}`;
}

/**
 * One factual line: the space, the venue, the suburb, what it holds, what it
 * costs, and as much of the host's own words as there is room for.
 *
 * @param {{name: string, venueName: string, suburb?: string|null, capacity: number,
 *   pricePerHour: number, currency: string, description?: string|null}} listing
 */
export function listingDescription(listing) {
  const suburb = squash(listing.suburb);
  let facts = `${squash(listing.name)} at ${squash(listing.venueName)}`;
  if (suburb.length > 0) facts += ` in ${suburb}`;
  facts += `. Seats ${listing.capacity}, ${rate(listing.pricePerHour, listing.currency)}.`;

  const prose = squash(listing.description);
  // Only when there is room for a readable clause of them, rather than a stub.
  if (prose.length > 0 && facts.length + 32 < DESCRIPTION_MAX) facts += ` ${prose}`;

  return clip(facts, DESCRIPTION_MAX);
}

/**
 * The site's own words — index.html's, verbatim, because that file is what a
 * crawler reads at `/` and this is what the same visitor's tab says once they
 * have been somewhere and come back. tools/metadata-test.mjs reads both.
 */
export const SITE_META = Object.freeze({
  title: 'Steeple — Community space to rent in Northern Virginia',
  description:
    'Steeple — rent affordable halls, studios and gyms by the hour from Northern Virginia venues. Five real listings, explored as one continuous scene.',
  ogTitle: 'Steeple — community space to rent in Northern Virginia',
  ogDescription:
    'Halls, studios and rooms in Northern Virginia venues, by the hour. Find one near you, see when it is open, and book it.',
  linkedDataDescription: 'Halls, studios and rooms in Northern Virginia venues, rented by the hour.',
});

/**
 * A space that is not there, in steeple's own words: verbatim from
 * `WebDocumentRenderer.RenderListingNotFound`, so a visitor who reloads the URL
 * reads the same sentence from the server that the app just gave them. Pinned
 * on both sides by `tests/fixtures/seo-formats.json`.
 */
export const UNAVAILABLE = Object.freeze({
  title: `Space unavailable · ${SITE}`,
  heading: "This space isn't available",
  prose:
    'The link may be out of date, or the space may have been taken off Steeple. There are other spaces nearby.',
  browse: 'Browse spaces',
  home: 'Steeple home',
});
