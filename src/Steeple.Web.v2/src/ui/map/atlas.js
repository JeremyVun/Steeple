// THE MAP — a real one. Leaflet 1.9 over OpenStreetMap raster tiles, the same
// stack steeple's own web funnel runs, pannable and zoomable and browseable.
//
// The tiles are toned toward the paper palette in styles/map.css rather than
// re-drawn: the brand is a filter and a wash over honest cartography, so the
// instrument sits inside the painted world instead of being pasted onto it.
// `?map=` chooses the toning — 'simple' by default, 'dusk' by lamplight.
//
// Two-way sync with the scene: hovering a pin warms that church in the world,
// activating one flies the camera to it, the current church is marked here, and
// churches a host has placed but not yet published stand as quiet inert marks.
//
// There is no "you are here". A pin the visitor plants themselves is a promise
// the map cannot keep — every distance measured from it was straight-line
// guesswork dressed as a walking time. The map answers where the churches are;
// how long it takes to reach one is a question for a real routing service.

import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

import { setHover, setView, state } from '../../core/bus.js';
import { afterBoot } from '../../core/idle.js';
import { track } from '../../data/analytics.js';
import { AREA_CENTER, knownVenues } from '../../data/catalog.js';
import { placedVenues } from '../../data/store.js';
import { priceBand, publishedRooms } from '../copy.js';
import { el } from '../dom.js';

const TILES = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION = '© OpenStreetMap contributors';

// Where a venue's tag is set relative to its pin, for the five the beachhead
// opened with. Hand-placed, the way a cartographer would: the Vienna pair stand
// almost on top of each other, so one takes the sky above its pin and the other
// the ground below it, and the eastern tags are set inboard or they run off the
// sheet. A venue nobody has hand-placed takes the default and reads fine.
const NAME_SET = {
  'grace-community-vienna': 'above',
  'vienna-presbyterian': 'below',
  'dunn-loring-umc': 'left',
  'merrifield-fellowship': 'left',
};

// The teardrop of steeple's design system §8.6, at its drawn size: terracotta
// body, paper stroke so it reads on any ground, one white eye.
const TEARDROP =
  '<svg class="dm-pin__mark" viewBox="0 0 30 38" width="30" height="38" aria-hidden="true" focusable="false">' +
  '<path class="dm-pin__body" d="M15 37.4C15 37.4 27.6 21.9 27.6 13.4 27.6 6.5 22 1 15 1S2.4 6.5 2.4 13.4C2.4 21.9 15 37.4 15 37.4Z"/>' +
  '<circle class="dm-pin__eye" cx="15" cy="13.3" r="4.6"/>' +
  '</svg>';

const escapeHtml = (text) =>
  String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// A pin answers the question the map is asked: what would this cost. The name
// is the answer to a question you only ask once you have picked a church, so it
// waits under the price and comes out when the pointer arrives — and it is on
// the pin's accessible name the whole time, where a screen reader gets it first.
const churchIcon = (venue) =>
  L.divIcon({
    className: `dm-pin dm-pin--${NAME_SET[venue.id] ?? 'right'}`,
    html:
      `${TEARDROP}<span class="dm-pin__tag">` +
      '<span class="dm-pin__price"></span>' +
      `<span class="dm-pin__who">${escapeHtml(venue.shortName)}</span></span>`,
    iconSize: [30, 38],
    iconAnchor: [15, 38],
  });

/**
 * How much more map a gesture buys than it used to (CONTRACT5 §2.3). One
 * number, applied to the drag; the wheel is tuned to the same figure by
 * measurement below, because Leaflet will not take a multiplier for it.
 */
const FASTER = 1.3;

export function createAtlas() {
  const element = el('div', { class: 'dm-map', role: 'application', 'aria-label': 'Map of the five venues. Drag to pan, scroll to zoom.' });

  // Pace, measured in what actually happens rather than in what the number
  // says. Leaflet puts the wheel through a sigmoid and then rounds the result
  // *up* to the nearest zoomSnap, so the snap, not wheelPxPerZoomLevel, was
  // setting the pace: at 0.25 the smallest possible scroll still moved a
  // quarter of a level, and a 60px notch — raw value 0.35 — was rounded up to
  // 0.5. A finer snap hands the rate back to the wheel, and 21px per level puts
  // a notch at 0.65: the 30% asked for, and no more lurching on a small scroll.
  // + and − still take a whole level each. Numbers verified with real wheel
  // input by tools/map-feel.mjs; re-run it after touching either of them.
  const map = L.map(element, {
    zoomSnap: 0.05,
    zoomDelta: 1,
    wheelPxPerZoomLevel: 21,
    keyboardPanDelta: 104,
    zoomControl: false,
    attributionControl: true,
    // The world behind is the hero: no inertia flinging, no double-click surprise.
    inertia: false,
    doubleClickZoom: false,
  });

  // The drag, at the same pace. Leaflet's drag is 1:1 with the pointer and has
  // no option to be anything else, so the gain is applied at the one seam it
  // offers: `predrag` fires with the pane's next position already worked out
  // and still writable — the same hook Leaflet's own bounds-viscosity and
  // world-wrap corrections use.
  const draggable = map.dragging?._draggable;
  draggable?.on('predrag', () => {
    const travelled = draggable._newPos.subtract(draggable._startPos);
    draggable._newPos = draggable._startPos.add(travelled.multiplyBy(FASTER));
  });

  // A view has to exist before anything may be added to the map; the real
  // framing is fitted to the churches once the panel has given the map a size.
  map.setView([AREA_CENTER.lat, AREA_CENTER.lng], 12);
  L.control.zoom({ position: 'topright' }).addTo(map);
  map.attributionControl.setPrefix('');

  // Added with the map, not deferred behind the boot (core/idle.js) like the
  // opening search is: without a grid layer, the early framing of the
  // not-yet-sized container settles a NaN zoom that throws at the next
  // invalidateSize and takes the whole boot down (Leaflet 1.9, 2026-08-06).
  L.tileLayer(TILES, {
    maxZoom: 19,
    minZoom: 9,
    attribution: ATTRIBUTION,
    // Part of the toning: the tiles are laid slightly transparent over the
    // card's own paper, so the whole sheet takes the warmth of the brand.
    opacity: 0.92,
    className: 'dm-tiles',
  }).addTo(map);

  // The frame is drawn around the venues the catalog has answered with, so it
  // grows with the beachhead rather than around a hard-coded five.
  let bounds = L.latLngBounds([[AREA_CENTER.lat, AREA_CENTER.lng]]);
  // Tight enough that the Vienna pair and Dunn Loring separate their names,
  // loose enough that the outer three keep their labels on the sheet.
  const PADDING = [24, 28];

  // On a phone the search pill stands on the head of the map and a sheet covers
  // its foot. The element keeps its full size — only the part you can see
  // shrinks — so the framing is padded by however much is covered rather than
  // the map being resized under them.
  let covered = { top: 0, bottom: 0 };

  // A visitor's own pan is theirs: once they have moved the map, nothing
  // re-frames it behind their back. An animated re-framing raises the same
  // events a hand does and only finishes some time after it is asked for, so
  // the map's own movement is claimed for as long as it can still be running.
  let framingUntil = 0;
  let ownPan = false;
  map.on('dragstart zoomstart', () => {
    if (performance.now() > framingUntil) ownPan = true;
  });

  // What somebody did with the map, counted once per gesture rather than once
  // per frame of it — and never for the map's own re-framing, which raises the
  // same events a hand does (`analytics.md` — `map_interacted`).
  map.on('dragend', () => {
    if (performance.now() > framingUntil) track('map_interacted', { kind: 'pan' });
  });
  map.on('zoomend', () => {
    if (performance.now() > framingUntil) track('map_interacted', { kind: 'zoom' });
  });

  function frameChurches({ animate = false } = {}) {
    framingUntil = performance.now() + (animate ? 900 : 80);
    map.invalidateSize({ animate: false });
    map.fitBounds(bounds, {
      paddingTopLeft: [PADDING[0], PADDING[1] + covered.top],
      paddingBottomRight: [PADDING[0], PADDING[1] + covered.bottom],
      animate,
    });
    ownPan = false;
  }

  // ── venue pins ─────────────────────────────────────────────────────────────
  //
  // One pin per venue the catalog has answered with — the seed's five while
  // steeple is away, every published venue when it is there, and a venue a host
  // listed this morning the moment a search returns it. The map used to be
  // built from the village's scenery, which meant a real venue had no pin, no
  // sheet and no way in but a hand-typed URL (review issue 7).
  const markerFor = new Map();
  const placeOf = new Map();

  function addPin(venue) {
    const marker = L.marker([venue.lat, venue.lng], {
      icon: churchIcon(venue),
      keyboard: true,
      riseOnHover: true,
      title: `${venue.name}, ${venue.suburb}`,
    }).addTo(map);

    const node = marker.getElement();
    node.setAttribute('role', 'button');
    node.dataset.venue = venue.id;
    // A pin is a button and answers like one. Leaflet has a keyboard path of
    // its own, but it is keypress-based and does not know about Space, so the
    // pin states its own contract rather than inheriting half of one.
    node.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      event.stopPropagation();
      setView('venue', { venueId: venue.id });
    });
    node.addEventListener('focus', () => warm(venue.id));
    node.addEventListener('blur', () => cool(venue.id));

    marker.on('mouseover', () => warm(venue.id));
    marker.on('mouseout', () => cool(venue.id));
    marker.on('click', () => {
      track('map_interacted', { kind: 'pin' });
      setView('venue', { venueId: venue.id });
    });

    markerFor.set(venue.id, marker);
    placeOf.set(venue.id, venue);
  }

  /**
   * The roster, reconciled. Pins are kept rather than rebuilt — a marker torn
   * down and made again loses the focus a keyboard was holding on it — and a
   * venue that has left the catalog's answers takes its pin with it.
   */
  function setVenues(venues) {
    const roster = venues.filter((v) => Number.isFinite(v.lat) && Number.isFinite(v.lng));
    const standing = new Set(roster.map((v) => v.id));
    for (const [id, marker] of markerFor) {
      if (standing.has(id)) continue;
      marker.remove();
      markerFor.delete(id);
      placeOf.delete(id);
    }
    for (const venue of roster) {
      const held = markerFor.get(venue.id);
      if (!held) {
        addPin(venue);
        label(venue.id, priceBand(publishedRooms(venue).map((room) => room.pricePerHour)));
        continue;
      }
      placeOf.set(venue.id, venue);
      const at = held.getLatLng();
      if (at.lat !== venue.lat || at.lng !== venue.lng) held.setLatLng([venue.lat, venue.lng]);
    }

    // A frame drawn around venues that were not there yet is the wrong frame,
    // and the first answer is exactly when that happens. It is only redrawn
    // while the framing is still this module's — a visitor's own pan is theirs.
    const next = L.latLngBounds(roster.map((v) => [v.lat, v.lng]));
    if (!next.isValid() || next.equals(bounds)) return;
    bounds = next;
    if (!ownPan) frameChurches();
  }

  // ── what a pin says ────────────────────────────────────────────────────────
  //
  // The tag carries the price and, under it, the church — so the map answers
  // "what would this cost" at a glance and "whose is it" when you point at one.
  // A church whose spaces do not answer the search has no price to quote, so
  // its tag falls back to its name: it is still there, it just has nothing for
  // you today. Whichever it is showing, the accessible name leads with the
  // church, because that is what a pin is.
  function label(venueId, band) {
    const node = markerFor.get(venueId)?.getElement();
    const venue = placeOf.get(venueId);
    if (!node || !venue) return;
    node.querySelector('.dm-pin__price').textContent = band ? band.text : venue.shortName;
    node.dataset.shows = band ? 'price' : 'name';
    node.setAttribute(
      'aria-label',
      band
        ? `${venue.name}, ${venue.suburb}. ${band.spoken}.`
        : `${venue.name}, ${venue.suburb}. Nothing here answers this search.`
    );
  }

  // The seed's own venues and prices stand from the first frame, so the map is
  // never blank and no pin is ever an empty chip while the catalog is still
  // answering. The first answer that came from steeple replaces them
  // (data/catalog.js — the roster is provisional until then).
  setVenues(knownVenues());

  function warm(venueId) {
    if (state.view === 'village' || state.view === 'venue') setHover(venueId, null);
  }

  function cool(venueId) {
    if (state.hoverVenueId === venueId) setHover(null, null);
  }

  // ── churches a host has placed but not yet published ───────────────────────
  const placedLayer = L.layerGroup().addTo(map);

  function renderPlaced() {
    placedLayer.clearLayers();
    for (const venue of placedVenues()) {
      if (!Number.isFinite(venue?.lat) || !Number.isFinite(venue?.lng)) continue;
      if (markerFor.has(venue.id)) continue;
      L.marker([venue.lat, venue.lng], {
        interactive: false,
        keyboard: false,
        icon: L.divIcon({
          className: 'dm-newpin',
          html:
            '<span class="dm-newpin__dot" aria-hidden="true"></span>' +
            `<span class="dm-newpin__name">${escapeHtml(venue.shortName ?? venue.name ?? 'New venue')}</span>`,
          iconSize: [12, 12],
          iconAnchor: [6, 6],
        }),
      }).addTo(placedLayer);
    }
  }

  renderPlaced();

  // Which church the map has already brought forward, so a re-render of the
  // same one never fights a pan the visitor made themselves. A church arrived
  // at by deep link starts already accounted for: the cold framing shows the
  // whole area, and only a choice made here brings one pin forward.
  let centred = state.venueId;

  return {
    element,
    map,
    /** The Leaflet map only knows its size once the panel has one. */
    resize: () => frameChurches(),
    /** A new page shape, but the visitor's own pan and zoom are theirs to keep. */
    remeasure: () => map.invalidateSize({ animate: false }),
    frameChurches,
    renderPlaced,
    /** Every venue the catalog has answered with, pinned (see setVenues). */
    setVenues,
    /**
     * How much of the map's head and foot something else is standing on. The
     * map is re-measured either way; it is only re-framed while the framing is
     * still the one this module chose, and never into a band too thin to read.
     *
     * A property sheet covers the foot too, and passes `reframe: false`: it is
     * opened *about* one church, so the map's answer is to bring that church
     * into the strip left over (setCurrent, below), not to pull back and show
     * all five.
     */
    setCovered({ top = 0, bottom = 0, reframe = true }) {
      const next = { top: Math.max(0, Math.round(top)), bottom: Math.max(0, Math.round(bottom)) };
      const changed = next.top !== covered.top || next.bottom !== covered.bottom;
      const band = element.clientHeight - next.top - next.bottom;
      covered = next;
      map.invalidateSize({ animate: false });
      if (reframe && changed && !ownPan && band > 150) {
        frameChurches({ animate: !state.reducedMotion });
      }
    },
    focusVenue(venueId) {
      markerFor.get(venueId)?.getElement()?.focus();
    },
    setCurrent(venueId) {
      for (const [id, marker] of markerFor) {
        const node = marker.getElement();
        if (!node) continue;
        const current = id === venueId;
        node.classList.toggle('is-current', current);
        if (current) node.setAttribute('aria-current', 'true');
        else node.removeAttribute('aria-current');
        // Leaflet stacks pins by latitude, so two venues at one address stack
        // in whatever order they arrived and the chosen one can end up under
        // the others. The one being read about comes to the top.
        marker.setZIndexOffset(current ? 1000 : 0);
      }
      // The sheet that opens beside the map is about a place: bring the place
      // under the eye rather than leaving the visitor to hunt for its pin.
      if (venueId && venueId !== centred) {
        const marker = markerFor.get(venueId);
        // Centred in what can be seen, not in the element: on a phone the
        // bottom of the map is under the sheet.
        if (marker) {
          const point = map.latLngToContainerPoint(marker.getLatLng());
          const shift = (covered.bottom - covered.top) / 2;
          map.panTo(map.containerPointToLatLng([point.x, point.y + shift]), {
            animate: !state.reducedMotion,
            duration: 0.7,
          });
        }
      }
      centred = venueId;
    },
    setHovered(venueId) {
      for (const [id, marker] of markerFor) {
        marker.getElement()?.classList.toggle('is-hovered', id === venueId);
      }
    },
    /**
     * Price the map from the search's own answer, so a narrowed search quotes
     * the rooms that actually match rather than everything the church owns.
     * The results and the pins stay one truth (./results.js).
     */
    setPrices(items) {
      const byVenue = new Map();
      for (const item of items) {
        if (!byVenue.has(item.venueSlug)) byVenue.set(item.venueSlug, []);
        byVenue.get(item.venueSlug).push(item.pricePerHour);
      }
      for (const id of markerFor.keys()) label(id, priceBand(byVenue.get(id) ?? []));
    },
    /** Filtered-out churches rest: dimmed, still pinned, still named. */
    setMatching(matching) {
      for (const [id, marker] of markerFor) {
        marker.getElement()?.classList.toggle('is-resting', !matching.has(id));
      }
    },
  };
}
