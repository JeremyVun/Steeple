#!/usr/bin/env node
// THE WORDS A ROUTE IS DESCRIBED IN — this browser's half of one set of rules.
//
// A listing is described twice. steeple renders the head of the document a
// crawler, a share-card scraper and a JavaScript-less reader see; the app
// rewrites it as somebody moves between rooms in one session without asking for
// another document (design SEO-D7). If the two drift, the same URL has two
// descriptions depending on how it was arrived at — and nobody would ever see
// both, which is exactly why a test has to.
//
//   §1  the shared table's listings: title and meta description
//   §2  …its money and its hourly rates
//   §3  …its token labels, against data/vocabulary.js
//   §4  …its unavailable page, against ui/metaText.js
//   §5  index.html's own head is the site defaults ui/metadata.js restores,
//       marked as the route's so the same file's set is swept and not doubled
//
//   node tools/metadata-test.mjs        (part of `npm test`)
//
// No browser, no server, no flags. The table is `tests/fixtures/seo-formats.json`
// at the repository root; `tests/Steeple.Api.Tests/Services/Seo/SeoFormatGoldenTests.cs`
// asserts the very same rows from the API side. Neither side may move alone: a
// change to one implementation that the other does not follow turns one of the
// two suites red, whichever it was.
//
// The DOM half of the metadata owner — that a navigation replaces the marked
// head nodes atomically and leaves no second canonical — is browser work and
// lives in tools/listing-test.mjs §3.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ACCESS_LABELS, ACTIVITY_LABELS, AMENITY_LABELS, toLabels } from '../src/data/vocabulary.js';
import {
  listingDescription,
  listingTitle,
  money,
  rate,
  SITE_META,
  UNAVAILABLE,
} from '../src/ui/metaText.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');

const table = JSON.parse(readFileSync(resolve(root, 'tests/fixtures/seo-formats.json'), 'utf8'));
const indexHtml = readFileSync(resolve(here, '../index.html'), 'utf8');

let failures = 0;

function check(label, actual, expected) {
  const ok = actual === expected;
  if (!ok) failures += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`);
  if (!ok) {
    console.log(`       expected: ${JSON.stringify(expected)}`);
    console.log(`       actual:   ${JSON.stringify(actual)}`);
  }
}

// ── §1 · §2 the listing's own words ─────────────────────────────────────────
console.log('\n── §1 titles and descriptions ───────────────────────────────');
for (const row of table.listings) {
  const listing = {
    name: row.roomName,
    venueName: row.venueName,
    suburb: row.suburb,
    capacity: row.capacity,
    pricePerHour: row.pricePerHour,
    currency: row.currency,
    description: row.description,
  };
  check(`${row.case} — title`, listingTitle(listing), row.title);
  check(`${row.case} — description`, listingDescription(listing), row.metaDescription);
}

console.log('\n── §2 money and the hourly rate ─────────────────────────────');
for (const row of table.money) {
  check(`${row.amount} ${row.currency}`, money(row.amount, row.currency), row.money);
  check(`${row.amount} ${row.currency} per hour`, rate(row.amount, row.currency), row.rate);
}

// ── §3 the vocabulary ───────────────────────────────────────────────────────
console.log('\n── §3 token labels ──────────────────────────────────────────');
const REGISTRY = {
  activity: ACTIVITY_LABELS,
  amenity: AMENITY_LABELS,
  accessibility: ACCESS_LABELS,
};
for (const [family, entries] of Object.entries(table.labels)) {
  if (family === '//') continue;
  // A word steeple learned after this bundle shipped belongs to no registry and
  // is humanized by both sides. `toLabels` does that on any registry.
  const registry = REGISTRY[family] ?? {};
  for (const [token, label] of Object.entries(entries)) {
    if (token === '//') continue;
    check(`${family}.${token}`, toLabels([token], registry)[0], label);
  }
}

// ── §4 a space that is not there ────────────────────────────────────────────
console.log('\n── §4 the unavailable words ─────────────────────────────────');
for (const key of ['title', 'heading', 'prose', 'browse', 'home']) {
  check(`unavailable.${key}`, UNAVAILABLE[key], table.unavailable[key]);
}

// ── §5 the site's own defaults ──────────────────────────────────────────────
//
// index.html is what a crawler reads at `/`; SITE_META is what the tab says
// once a visitor has been to a listing and come back up. They are the same
// words or the site describes itself two ways.
console.log('\n── §5 index.html is the site defaults ───────────────────────');

const between = (open, close, from = 0) => {
  const start = indexHtml.indexOf(open, from);
  if (start < 0) return null;
  const end = indexHtml.indexOf(close, start + open.length);
  return end < 0 ? null : indexHtml.slice(start + open.length, end);
};

/**
 * The whole opening tag of the one head element carrying `key="value"` — read
 * as a tag rather than by a fixed attribute order, because these elements now
 * carry three or four attributes and nothing should depend on which came first.
 */
function element(key, value) {
  const at = indexHtml.indexOf(`${key}="${value}"`);
  if (at < 0) return null;
  return indexHtml.slice(indexHtml.lastIndexOf('<', at), indexHtml.indexOf('>', at) + 1);
}

/** Its `content` attribute. */
function content(key, value) {
  const tag = element(key, value);
  const found = tag && /content="([^"]*)"/.exec(tag);
  return found ? found[1] : null;
}

check('<title>', between('<title>', '</title>'), SITE_META.title);
check('meta description', content('name', 'description'), SITE_META.description);
check('og:title', content('property', 'og:title'), SITE_META.ogTitle);
check('og:description', content('property', 'og:description'), SITE_META.ogDescription);
check('twitter:title', content('name', 'twitter:title'), SITE_META.ogTitle);
check('twitter:description', content('name', 'twitter:description'), SITE_META.ogDescription);

const linkedDataTag = element('type', 'application/ld+json');
const siteLinkedData = JSON.parse(between(linkedDataTag, '</script>'));
check('ld+json name', siteLinkedData.name, 'Steeple');
check('ld+json description', siteLinkedData.description, SITE_META.linkedDataDescription);

// ── §6 the printed head is the route's, and says so ─────────────────────────
//
// ui/metadata.js removes every `[data-steeple-route-meta]` node before it
// writes the next route's set (SEO-D7). Whatever this file prints that the
// owner also writes has to carry that mark or the app leaves two — two
// canonicals on a legacy `#/room/…` link, a `/` canonical standing on a
// noindex browse surface. The DOM proof is tools/listing-test.mjs §3; this is
// the cheap static half, and it is the one that fails while the file is being
// edited rather than an hour later.
console.log('\n── §6 the printed head is marked as the route’s ─────────────');

const marked = (tag) => /\sdata-steeple-route-meta[\s/>]/.test(tag ?? '');

// Exactly ui/metadata.js's own set, in the order render() writes it.
for (const [key, value] of [
  ['name', 'description'],
  ['rel', 'canonical'],
  ['property', 'og:type'],
  ['property', 'og:site_name'],
  ['property', 'og:title'],
  ['property', 'og:description'],
  ['name', 'twitter:card'],
  ['name', 'twitter:title'],
  ['name', 'twitter:description'],
  ['type', 'application/ld+json'],
]) {
  check(`${value} is the route's`, marked(element(key, value)), true);
}

// And nothing the document owns rather than the route: sweeping the viewport
// off a phone or the base out from under every relative URL would be worse than
// the duplicate this all guards against.
for (const [key, value] of [
  ['name', 'viewport'],
  ['name', 'theme-color'],
  ['rel', 'icon'],
]) {
  check(`${value} is the document's`, marked(element(key, value)), false);
}
check(
  "base is the document's",
  marked(indexHtml.slice(indexHtml.indexOf('<base'), indexHtml.indexOf('>', indexHtml.indexOf('<base')) + 1)),
  false
);

console.log(
  failures === 0
    ? '\nthe two sides say the same words.\n'
    : `\n${failures} difference(s) — one side moved without the other.\n`
);
process.exit(failures === 0 ? 0 : 1);
