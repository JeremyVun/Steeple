// THE HEAD — what this page says it is, kept true while nobody reloads it.
//
// steeple writes the head of a listing document itself and that response is the
// authority: a crawler, a share-card scraper and a reader with no JavaScript
// see it and nothing else (design SEO-D7). Sharing a URL causes a fresh server
// request, so nothing here is ever what a remote machine reads.
//
// What this file owns is the session. The app moves between rooms, the browse
// surface, an inbox and a desk without asking for another document, so the
// title, the description, the canonical, the social tags and the structured
// data would otherwise go on describing the first place this tab opened. A tab
// still reading "Art Studio at …" three rooms later is a small lie told all
// day, and a canonical left pointing at a listing while the address bar says
// `/journal` is a large one.
//
// THREE RULES HOLD IT TOGETHER.
//
//   · Every node it writes carries `data-steeple-route-meta`, and every write
//     removes that whole set before adding the next one (SEO-D7). There is no
//     path here that can leave two canonicals or two `ld+json` blocks behind —
//     the server's own nodes carry the same mark and are replaced by the same
//     sweep.
//   · The words are not written twice. `./metaText.js` is this browser's copy
//     of the API's `SeoText`/`WebDocumentRenderer` formatting, and one table of
//     worked examples (`tests/fixtures/seo-formats.json`) is asserted from both
//     suites so neither side can move alone.
//   · The document steeple rendered is left alone while the app is still
//     standing on the route it was rendered for. That head is richer than
//     anything this file can rebuild — steeple knows the venue's street and
//     postcode as separate fields, and its own type — so replacing it the
//     instant the app booted would be a downgrade for nothing. The moment the
//     visitor goes anywhere else, this file owns the head for the rest of the
//     session.
//
// Only what is known is said. A room whose listing has not landed yet is
// described from the search summary that opened it and completed when the
// listing arrives; a room steeple has no listing for at all is the unavailable
// state, which is `noindex` and carries no listing claims (SEO-D10).

import { state } from '../core/bus.js';
import { basePath, classify, parse, pathFor } from '../core/router.js';
import { bootstrappedListing, heldRoom, heldVenue } from '../data/catalog.js';
import { HOME_LABEL } from './copy.js';
import { listingDescription, listingTitle, SITE_META, squash, UNAVAILABLE } from './metaText.js';

const SITE = 'Steeple';

/**
 * The served area is one Northern Virginia beachhead by policy, and a
 * PostalAddress without a country is not much of an address. The same constant,
 * for the same reason, as the renderer's.
 */
const ADDRESS_COUNTRY = 'US';

/** An absolute URL for a path this deployment owns, prefix and all. */
const absolute = (path) => new URL(path, window.location.origin).href;

/** A photograph, wherever it is kept: `media/…` is ours, a CDN URL is already whole. */
const absoluteMedia = (url) => (url ? new URL(url, document.baseURI).href : null);

const home = () => absolute(basePath());

export function createMetadata() {
  // The route the document in front of us was served for, and whether steeple
  // wrote a listing head for it (the boot payload is the proof — an ordinary
  // shell has none). Read before anything navigates.
  const served = bootstrappedListing
    ? { venueId: bootstrappedListing.venueSlug, roomId: bootstrappedListing.roomSlug }
    : null;
  const arrived = parse();
  let pristine = Boolean(
    served && !arrived.legacy && arrived.view === 'room'
      && arrived.venueId === served.venueId && arrived.roomId === served.roomId
  );

  let written = null;

  /**
   * Say what this page is, now.
   *
   * @param {{unavailable?: boolean}} options `unavailable` is the caller's
   *   verdict, not a guess this file may make: only ui/index.js knows whether
   *   the listing read has come back empty or is merely still on its way.
   */
  function update({ unavailable = false } = {}) {
    // Still standing exactly where steeple rendered the head we are looking at.
    const stillServed =
      pristine
      && !unavailable
      && state.view === 'room'
      && state.venueId === served.venueId
      && state.roomId === served.roomId;
    if (stillServed) return;

    const description = describe(unavailable);
    const key = JSON.stringify(description);
    if (key === written) return;
    pristine = false;
    written = key;
    render(description);
  }

  return { update };
}

// ─── what each route says ────────────────────────────────────────────────────

function describe(unavailable) {
  const { view, venueId, roomId } = state;
  const venue = venueId ? heldVenue(venueId) : null;
  const room = venue && roomId ? heldRoom(venueId, roomId) : null;
  const policy = classify(view);
  const canonical = pathFor(state);

  if (view === 'arrival') {
    return {
      view,
      title: SITE_META.title,
      robots: 'index,follow',
      canonical: home(),
      description: SITE_META.description,
      og: {
        'og:type': 'website',
        'og:site_name': SITE,
        'og:title': SITE_META.ogTitle,
        'og:description': SITE_META.ogDescription,
        'og:url': home(),
      },
      twitter: {
        'twitter:card': 'summary',
        'twitter:title': SITE_META.ogTitle,
        'twitter:description': SITE_META.ogDescription,
      },
      linkedData: {
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: SITE,
        description: SITE_META.linkedDataDescription,
        url: home(),
      },
    };
  }

  // A room steeple has no listing for. The same words the served 404 uses, and
  // the same refusal to be indexed — the app cannot change the status code of a
  // response that already said 200, but it can stop claiming to be a listing.
  if (view === 'room' && unavailable) {
    return { view, title: UNAVAILABLE.title, robots: 'noindex' };
  }

  if (view === 'room' && room) {
    return listingDescriptor(venue, room, canonical);
  }

  // A listing named but not yet read. It is still the canonical listing URL, so
  // it keeps the listing's own policy and address and gains the rest a moment
  // later — marking it noindex for the length of one read would be a claim
  // about the room rather than about what this browser has got round to.
  if (view === 'room') {
    return {
      view,
      title: titleFor(view, venue, room),
      robots: 'index,follow',
      canonical: canonical ? absolute(canonical) : null,
    };
  }

  // Follow, but do not index: the browse surface and a venue sheet are ways
  // through to listings rather than pages of their own, and neither carries a
  // canonical — a cross-page canonical on a noindex document is a mixed signal
  // and the noindex alone does the work (SEO-D7).
  const robots = policy === 'private' ? 'noindex,nofollow' : 'noindex,follow';
  return { view, title: titleFor(view, venue, room), robots };
}

function titleFor(view, venue, room) {
  const place = venue
    ? [venue.name, venue.suburb].filter(Boolean).join(', ')
    : null;

  switch (view) {
    case 'village':
      return `${HOME_LABEL} · ${SITE}`;
    case 'venue':
      return place ? `${place} · ${SITE}` : `A venue · ${SITE}`;
    case 'room':
      // Named, but not yet described: the listing read is still on its way.
      return room && venue ? listingTitle(facts(venue, room)) : `A space · ${SITE}`;
    case 'apply':
      return room ? `Request ${squash(room.name)} · ${SITE}` : `Request a space · ${SITE}`;
    case 'journal':
      return `Inbox · ${SITE}`;
    case 'desk':
      return venue ? `${venue.shortName ?? venue.name} · Hosting · ${SITE}` : `Hosting · ${SITE}`;
    case 'letter':
      return venue ? `Request to ${venue.shortName ?? venue.name} · ${SITE}` : `Your request · ${SITE}`;
    default:
      return SITE;
  }
}

/** The room and its venue as the shared formatting rules want them. */
const facts = (venue, room) => ({
  name: room.name,
  venueName: venue.name,
  suburb: venue.suburb,
  capacity: room.capacity,
  pricePerHour: room.pricePerHour,
  currency: room.currency ?? 'USD',
  description: room.description,
});

function listingDescriptor(venue, room, canonicalPath) {
  const canonical = absolute(canonicalPath ?? basePath());
  const said = facts(venue, room);
  const title = listingTitle(said);
  const description = listingDescription(said);
  const photos = (room.photos ?? [])
    .map((photo) => absoluteMedia(photo.url))
    .filter(Boolean);
  const cover = photos[0] ?? absoluteMedia(room.primaryPhotoUrl) ?? null;

  return {
    view: 'room',
    title,
    robots: 'index,follow',
    canonical,
    description,
    og: {
      'og:type': 'place',
      'og:site_name': SITE,
      'og:title': title,
      'og:description': description,
      'og:url': canonical,
      // A card with no picture in it is a summary card; claiming the large one
      // reserves space for a photograph that does not exist.
      ...(cover ? { 'og:image': cover, 'og:image:alt': `${squash(room.name)} at ${squash(venue.name)}` } : {}),
    },
    twitter: {
      'twitter:card': cover ? 'summary_large_image' : 'summary',
      'twitter:title': title,
      'twitter:description': description,
      ...(cover ? { 'twitter:image': cover } : {}),
    },
    linkedData: graph(venue, room, canonical, photos, said),
  };
}

/**
 * The structured data of SEO-D8, as much of it as this browser holds. It is a
 * subset of the document steeple renders and never a different claim: what the
 * catalog was not told — a venue with no listing read behind it has no street
 * or postcode — is left out rather than guessed at.
 */
function graph(venue, room, canonical, photos, said) {
  const address = { '@type': 'PostalAddress' };
  if (venue.street) address.streetAddress = venue.street;
  if (venue.suburb) address.addressLocality = venue.suburb;
  if (venue.postcode) address.postalCode = venue.postcode;
  address.addressCountry = ADDRESS_COUNTRY;

  // Amenities and physical access are `LocationFeatureSpecification` entries.
  // `accessibilityFeature` is about media content and `isAccessibleForFree` is
  // about admission price; neither describes a step-free door.
  const features = [...(room.amenities ?? []), ...(room.accessibility ?? [])].map((name) => ({
    '@type': 'LocationFeatureSpecification',
    name,
    value: true,
  }));

  const venueNode = {
    '@type': venue.venueType === 'church' ? 'PlaceOfWorship' : 'Place',
    '@id': `${canonical}#venue`,
    name: venue.name,
    address,
  };
  // The public aggregate is the venue's, across all its spaces, so it is stated
  // of the venue. Nothing at all until there is a revealed rating: absence of
  // signal is not a zero.
  if (room.rating && room.rating.count > 0) {
    venueNode.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: Math.round(room.rating.averageStars * 10) / 10,
      ratingCount: room.rating.count,
      bestRating: 5,
      worstRating: 1,
    };
  }

  const roomNode = {
    '@type': 'Place',
    '@id': `${canonical}#room`,
    name: room.name,
  };
  const prose = squash(said.description);
  if (prose) roomNode.description = prose;
  roomNode.url = canonical;
  if (photos.length > 0) roomNode.image = photos;
  roomNode.address = address;
  if (Number.isFinite(venue.lat) && Number.isFinite(venue.lng)) {
    roomNode.geo = { '@type': 'GeoCoordinates', latitude: venue.lat, longitude: venue.lng };
  }
  roomNode.maximumAttendeeCapacity = room.capacity;
  if (features.length > 0) roomNode.amenityFeature = features;
  roomNode.containedInPlace = venueNode;

  const price = Number(room.pricePerHour ?? 0);
  const offer = {
    '@type': 'Offer',
    '@id': `${canonical}#offer`,
    url: canonical,
    price,
    priceCurrency: said.currency,
    // The room is where this offer is taken up; the offer is not the room.
    availableAtOrFrom: { '@id': `${canonical}#room` },
    priceSpecification: {
      '@type': 'UnitPriceSpecification',
      price,
      priceCurrency: said.currency,
      unitCode: 'HUR',
      unitText: 'hour',
      referenceQuantity: { '@type': 'QuantitativeValue', value: 1, unitCode: 'HUR', unitText: 'hour' },
    },
  };

  // Steeple → this room. No venue step: `/venue/{slug}` is deliberately noindex
  // and client-only, and a breadcrumb must not point a crawler at a page it has
  // been told not to index.
  const breadcrumb = {
    '@type': 'BreadcrumbList',
    '@id': `${canonical}#breadcrumb`,
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: SITE, item: home() },
      {
        '@type': 'ListItem',
        position: 2,
        name: `${squash(room.name)} at ${squash(venue.name)}`,
        item: canonical,
      },
    ],
  };

  return {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebSite', '@id': `${home()}#website`, name: SITE, url: home() },
      roomNode,
      offer,
      breadcrumb,
    ],
  };
}

// ─── writing it ──────────────────────────────────────────────────────────────

function render(description) {
  document.title = description.title;

  const head = document.head;
  for (const node of head.querySelectorAll('[data-steeple-route-meta]')) node.remove();

  const add = (tag, attributes, text = null) => {
    const node = document.createElement(tag);
    for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
    node.setAttribute('data-steeple-route-meta', '');
    if (text !== null) node.textContent = text;
    head.append(node);
  };

  if (description.description) add('meta', { name: 'description', content: description.description });
  if (description.canonical) add('link', { rel: 'canonical', href: description.canonical });
  add('meta', { name: 'robots', content: description.robots });
  for (const [property, content] of Object.entries(description.og ?? {})) {
    add('meta', { property, content });
  }
  for (const [name, content] of Object.entries(description.twitter ?? {})) {
    add('meta', { name, content });
  }
  if (description.linkedData) {
    // `<` is escaped even though a script's textContent is never parsed as
    // markup: this node is read back as text by view-source, by a save-page and
    // by anything that serializes the DOM, and a house-rules box containing
    // `</script>` must not be able to close its own block in any of them.
    add(
      'script',
      { type: 'application/ld+json' },
      JSON.stringify(description.linkedData).replace(/</g, '\\u003c')
    );
  }
}
