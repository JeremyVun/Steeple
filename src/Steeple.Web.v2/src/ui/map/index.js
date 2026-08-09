// DISCOVERY — the browse surface itself, past the roll.
//
// The map is not an instrument beside the product any more: it is the product.
// It takes the left and the whole height of the page; beside it the search pill
// asks where, when, how many and what else, and under that the spaces it found
// read as rows. Nothing here hides — the page does not fold itself away,
// because there is nothing behind it to reveal.
//
// One query drives everything on the surface. searchListings answers it, and
// the answer is the list, the count, and which pins stand and which rest. Pins
// and rows are the same truth, and the only spatial navigation in the
// experience — the scene itself never picks buildings. At the title page the
// whole surface is simply not on the page yet; the roll brings it up.
//
// On a narrow page the two columns become one: the map takes the whole page and
// the list is a sheet drawn up over it (./sheet.js).
//
// Under an open letter, desk or listing it stays on the page and steps back
// from the pointer: still the page, but not answering for it.

import { bus, CORRESPONDENCE_VIEWS, state } from '../../core/bus.js';
import { forgetVenues, knownVenues } from '../../data/catalog.js';
import { inViewLine, resultLine } from '../copy.js';
import { el } from '../dom.js';
import { SHEET_BAND } from '../rail.js';
import { createAtlas } from './atlas.js';
import { createResults } from './results.js';
import { createSearch } from './search.js';
import { createSheet } from './sheet.js';

export function createDiscovery({ announce = () => {} } = {}) {
  // `search` is built below, out of this: the way back from a refused search is
  // to ask it again.
  const results = createResults({ onRetry: () => search.search() });

  // ── head ───────────────────────────────────────────────────────────────────
  //
  // One line, and it is the answer: what the search found. There used to be an
  // eyebrow naming the area above it, and it was the wrong place for that fact
  // twice over — it repeated the Where segment standing directly above it, and
  // it went on saying the whole area after the search had been narrowed to one
  // suburb. Where a search is looking belongs to the control that changes it
  // (./search.js), not to a heading over the answers.
  const count = el('h2', { class: 'dm-count' });
  const head = el('header', { class: 'dm-head' }, count);

  // ── the map ────────────────────────────────────────────────────────────────
  const atlas = createAtlas();
  const mapwrap = el('div', { class: 'dm-mapwrap' }, atlas.element);

  // ── the search, and everything it answers ──────────────────────────────────
  const list = el('div', { class: 'dm-list' }, results.element);

  // Which suburb the map was last framed for, so choosing one is answered with
  // a move exactly once — narrowing the same search (a date, a capacity) must
  // not yank the map, and neither must the same suburb answering again.
  let framedSuburb = null;

  // The search's whole answer, and what the map is letting through. The rows
  // are the answer clipped to where the map is looking — a visitor zoomed onto
  // one corner is asking about that corner, and a list still saying the whole
  // area would be a claim about spaces that are not in front of them. `null`
  // until the first answer, so the map settling during boot prints nothing.
  let answered = null;
  let troubled = false;

  const onMap = (item) =>
    !Number.isFinite(item.lat) ||
    !Number.isFinite(item.lng) ||
    atlas.map.getBounds().contains([item.lat, item.lng]);

  const EDGE =
    'The spaces this search found lie beyond the edges of the map. Pull back to bring them in.';

  /**
   * Say what the answer looks like from here. `whole` is for the moment a new
   * answer is about to re-frame the map around itself — clipping against the
   * view it is leaving would print the old place's count over the new answer.
   */
  function showAnswer({ whole = false } = {}) {
    const shown = whole ? answered : answered.filter(onMap);
    const clipped = shown.length < answered.length;
    count.textContent = clipped ? inViewLine(shown) : resultLine(answered);
    results.render(shown, clipped && shown.length === 0 ? { emptyText: EDGE } : {});
    results.setCurrent(state.venueId, state.roomId);
  }

  const search = createSearch({
    announce,
    onResults: (items, { suburb = null } = {}) => {
      answered = items;
      troubled = false;
      // Pins first: an answer may be the first sight of a venue — one a host
      // listed this morning, one beyond the last page of results — and it has
      // to be on the map before it can be priced or rested.
      atlas.setVenues(knownVenues());
      atlas.setPrices(items);
      atlas.setMatching(state.matching);
      // A chosen suburb is a spatial command, not just a filter: the map goes
      // to the venues that answered it. Back to "Anywhere" pulls back to the
      // whole area; a suburb with nothing to show moves nothing (the count
      // line already says so, and there is no honest place to go).
      const framing = suburb !== framedSuburb;
      showAnswer({ whole: framing });
      if (framing) {
        framedSuburb = suburb;
        const points = items
          .filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lng))
          .map((item) => [item.lat, item.lng]);
        if (suburb && points.length > 0) {
          atlas.frameTo(points);
        } else if (!suburb) {
          atlas.flyHome();
        }
      }
      // A new question is a new page of answers: read it from the top.
      list.scrollTop = 0;
    },
    // steeple answered the search and refused it. Everything the last answer
    // put on the surface goes with it: the count, the rows, and the prices over
    // the pins. A price bubble is a quote against a query, so leaving the
    // previous one standing over a question that was never answered is the same
    // false availability in a smaller font. The churches stay pinned and rest
    // (search.js publishes an empty matching set) — they are still there; what
    // is not known is which of them can take you.
    onTrouble: (failure) => {
      troubled = true;
      count.textContent = 'No answer just now';
      results.showTrouble(failure);
      atlas.setPrices([]);
      list.scrollTop = 0;
    },
  });

  // The other half of the clipping: the map came to rest somewhere new — a
  // visitor's pan or zoom, or its own framing landing — and the list follows.
  // Leaflet says moveend for zooms too. Nothing to re-say while the surface is
  // showing trouble, or before the first answer.
  atlas.map.on('moveend', () => {
    if (answered && !troubled) showAnswer();
  });

  const panel = el('div', { class: 'dm-panel' }, [head, list]);
  const card = el('div', { class: 'dm-card' }, [mapwrap, search.element, panel]);

  // Which sheet is standing on the map's foot — the results, or a property sheet
  // laid over them (`coverForSheet` below). Declared here because the results
  // sheet reports where it settled 340ms after it gets there, which is long
  // enough for a property sheet to have opened in front of it: a listing route
  // opens the room, tells the map it is covered to the waist, brings the venue
  // into the band that is left — and then the results sheet's own settle would
  // land and say the map is covered to the middle instead. The venue was then
  // centred in a band nobody was looking at.
  let sheetCovering = false;

  const sheet = createSheet({
    card,
    panel,
    above: search.element,
    announce,
    onSettle: (covered) => {
      if (!sheetCovering) atlas.setCovered(covered);
    },
  });
  panel.prepend(sheet.handle);

  const element = el(
    'section',
    {
      class: 'discovery',
      'aria-label': 'The spaces on this map',
      dataset: { map: state.map || 'simple' },
    },
    [card]
  );

  // ── keyboard ───────────────────────────────────────────────────────────────
  // While the surface owns focus, Esc belongs to whatever the search pill has
  // open. With nothing of its own to close it lets the key by: Esc means what it
  // has always meant everywhere else.
  element.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (!search.isOpen() || !element.contains(document.activeElement)) return;
    event.preventDefault();
    event.stopPropagation();
    search.close();
  });

  // ── row/pin sync ──────────────────────────────────────────────────────────

  // On a phone a property sheet stands over the map's foot exactly as the
  // results sheet does, leaving a band of it above (CONTRACT6 §2.2). Whichever
  // of them is on the page, the map is told how much of it can still be seen —
  // otherwise the church you just chose is panned to the middle of a strip that
  // is under a sheet, which is the same as not panning to it at all.
  const narrow = window.matchMedia('(max-width: 900px)');
  const OVER_THE_MAP = new Set(['venue', 'room', 'apply']);

  function coverForSheet() {
    if (!narrow.matches) return;
    if (OVER_THE_MAP.has(state.view)) {
      sheetCovering = true;
      // Not a re-framing: the sheet is about one church, so the map's answer is
      // to bring that church into the band, not to pull back to all five.
      atlas.setCovered({
        top: 0,
        bottom: Math.max(0, card.clientHeight - SHEET_BAND),
        reframe: false,
      });
    } else if (sheetCovering) {
      sheetCovering = false;
      sheet.apply(); // the results sheet says how much it covers again
    }
  }

  function syncView() {
    element.dataset.view = state.view;
    element.toggleAttribute('inert', CORRESPONDENCE_VIEWS.has(state.view));
    coverForSheet();
    atlas.setCurrent(state.venueId);
    results.setCurrent(state.venueId, state.roomId);
  }

  // The map is the page now, so a new page shape is a new map shape.
  window.addEventListener('resize', () => queueMicrotask(() => atlas.remeasure()));

  bus.on('view:change', syncView);

  bus.on('filters:change', () => atlas.setMatching(state.matching));

  bus.on('hover:change', ({ venueId, roomId }) => {
    atlas.setHovered(venueId);
    results.setHovered(venueId, roomId);
  });

  // The map and the catalog are shared truth: another module, or a reset, may
  // place a church or publish a room while this surface is on the page.
  bus.on('store:change', ({ type }) => {
    if (type === 'venue-placed' || type === 'reset') atlas.renderPlaced();
    if (type !== 'room-edit' && type !== 'reset') return;
    // Publishing or editing a space is the one moment a venue the catalog is
    // holding stops being true, so it is read again rather than remembered.
    forgetVenues();
    search.search();
  });

  syncView();

  return {
    element,
    /** The map cannot measure itself until the surface is laid out on the page. */
    ready: () => {
      atlas.resize();
      sheet.apply();
    },
    focusVenue: (venueId) => atlas.focusVenue(venueId),
  };
}
