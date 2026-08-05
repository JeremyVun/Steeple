// INTERFACE subsystem — the printed layer over the village.
// Contract: CONTRACT.md §4 Interface, CONTRACT3 §"the discovery panel".
// Everything here is DOM inside #ui; it talks to the rest of the experience
// only through core/bus.js and data/store.js.
//
// The page is two acts joined by the roll (core/bus.js, journey/roll.js). Act
// one is the title sheet over the living village; act two is ./browse, the
// paper surface the whole product happens on — the map as the hero, its list
// beside it, and the property sheets over that. Each wave-2/3 directory is
// owned by one workstream and is self-managing — it subscribes to bus events
// and controls its own visibility: ./map (discovery), ./guest, ./host. The
// `porch` is the shared top-right shelf their entry affordances mount into.

import { bus, CORRESPONDENCE_VIEWS, state, setView } from '../core/bus.js';
import * as session from '../data/session.js';
import { getVenue } from '../data/venues.js';
import { el } from './dom.js';
import { liveRoom } from './copy.js';
import { createAccount } from './account.js';
import { createNotice } from './notice.js';
import { createSignInPanel } from './signIn.js';
import { createAnnouncer } from './announcer.js';
import { createArrival } from './arrival.js';
import { createBrowse } from './browse.js';
import { createHoverBanner } from './hoverBanner.js';
import { createNav } from './nav.js';
import { SHEET_BAND } from './rail.js';
import { createRoomPanel } from './roomPanel.js';
import { createStyleSwitcher } from './styleSwitcher.js';
import { createVenuePanel } from './venuePanel.js';
import { createDiscovery } from './map/index.js';
import { createGuestFlows } from './guest/index.js';
import { createHostFlows } from './host/index.js';

export function createUI(_engine, _world) {
  const root = document.getElementById('ui');
  root.textContent = '';
  if (state.reducedMotion) document.documentElement.classList.add('reduced-motion');
  // How much map stands above a property sheet on a phone. One number, declared
  // in ui/rail.js, spent by styles/panels.css and by ui/map/index.js — which
  // has to tell Leaflet how much of its foot is covered by the same sheet.
  root.style.setProperty('--sheet-band', `${SHEET_BAND}px`);

  const announcer = createAnnouncer();
  const arrival = createArrival();
  const nav = createNav();
  const banner = createHoverBanner();
  const scenery = createStyleSwitcher();
  const venuePanel = createVenuePanel();
  const roomPanel = createRoomPanel({
    onRequest: () => setView('apply', { venueId: state.venueId, roomId: state.roomId }),
  });

  const porch = el('div', { class: 'porch' });
  const discovery = createDiscovery({ announce: announcer.say });
  const guest = createGuestFlows({ announce: announcer.say, porch });
  const host = createHostFlows({ announce: announcer.say, porch });

  // Last onto the shelf, so it sits at the end of the line where an account
  // belongs — a monogram when there is somebody to be, one quiet word when
  // there is not (D6). Both open something: the card, or the way in.
  const signIn = createSignInPanel({ announce: announcer.say });
  const account = createAccount({
    announce: announcer.say,
    onSignIn: () => signIn.open(),
  });
  porch.append(account.element);

  // A session can end without anybody asking — a refresh token spent while the
  // tab sat open. The chip going quiet is not an explanation.
  const notice = createNotice();
  session.onSessionChange((held, reason) => {
    if (held || reason !== session.REASON.expired) return;
    notice.show("You've been signed out.", {
      label: 'Sign in again',
      onPick: () => signIn.open(),
    });
  });

  const rail = el('div', { class: 'rail' }, [venuePanel.element, roomPanel.element]);
  const browse = createBrowse();
  browse.mount([nav.element, porch, discovery.element, rail]);

  // Pointer input on the printed layer belongs to the printed layer — it must
  // never reach the journey's drag or click-empty-ground handling. The
  // discovery panel is the load-bearing case: a wheel over the map zooms the
  // map, and a drag across it pans the map, neither moves the camera.
  //
  // A surface that is inert is not a surface: it is scenery behind whatever is
  // over it. It must not eat the click that closes that thing — the room panel
  // held open behind the booking sheet is exactly this case.
  for (const surface of [
    nav.element,
    venuePanel.element,
    roomPanel.element,
    scenery.element,
    porch,
    discovery.element,
    guest.element,
    host.element,
  ]) {
    for (const type of ['pointerdown', 'pointerup', 'click', 'wheel']) {
      surface.addEventListener(type, (event) => {
        if (!surface.hasAttribute('inert')) event.stopPropagation();
      });
    }
  }

  root.append(
    browse.element,
    arrival.element,
    banner.element,
    scenery.element,
    guest.element,
    host.element,
    // The account's card is a layer, not a child of the shelf: the shelf rides
    // inside the browse surface and a letter or a desk lies over the whole of
    // it. See ui/account.js. The sign-in panel and the notice are layers for
    // the same reason — either can be opened over any surface there is.
    account.card,
    notice.element,
    signIn.element
  );

  // Leaflet can only measure itself once the panel is on the page.
  discovery.ready();

  // Which subject each sheet is currently set for. A sheet is only re-set when
  // the subject changes or the store says the subject did: re-running show()
  // rebuilds the sheet's DOM, which costs it its scroll position and starts its
  // photograph again — and `apply` opens and closes over a sheet that has to
  // come back exactly as it was left (CONTRACT5 §1.1).
  let venueShown = null;
  let roomShown = null;

  function render({ rebuild = false } = {}) {
    const { view, venueId, roomId } = state;
    const venue = venueId ? getVenue(venueId) : null;
    const room = venue && roomId ? liveRoom(venueId, roomId) : null;
    const venueKey = venue ? venue.id : null;
    const roomKey = venue && room ? `${venue.id}/${room.id}` : null;

    if (venue && (rebuild || venueKey !== venueShown)) venuePanel.show(venue);
    if (venue && room && (rebuild || roomKey !== roomShown)) roomPanel.show(venue, room);
    venueShown = venueKey;
    roomShown = roomKey;

    const correspondence = CORRESPONDENCE_VIEWS.has(view);
    const rolled = state.roll > 0;
    // The title sheet is gone long before the roll lands; past that it is only
    // in the way.
    arrival.setOpen(state.roll < 0.4);
    nav.setOpen(rolled);
    // The scenery switch is an instrument of the 3D village, and the village is
    // only on screen at the title page — over the map it would mean nothing.
    scenery.setOpen(!rolled);
    porch.classList.toggle('is-open', rolled);
    browse.setUnder(correspondence);
    // Asking for a space is an overlay over the space, not a page after it:
    // the listing stays on the page under the veil, held open and out of reach,
    // so putting the sheet down hands the room straight back. Anything else and
    // the guest is returned to the search they left three steps ago.
    const behindSheet = view === 'apply';
    venuePanel.setOpen(view === 'venue' && !!venue);
    roomPanel.setOpen((view === 'room' || behindSheet) && !!room, behindSheet);
    nav.update();

    // The banner names what the pointer is over *in the world*; on the browse
    // surface the pin says its own name.
    if (rolled || (view !== 'village' && view !== 'venue')) banner.hide();
    document.documentElement.dataset.view = view;
    document.documentElement.dataset.mode = state.mode;
  }

  bus.on('view:change', () => {
    render();
    announcer.view();
  });

  bus.on('mode:change', () => render());

  bus.on('roll:change', () => render());

  bus.on('filters:change', () => announcer.filters());

  // Publishing a space, or editing one, changes what discovery may honestly
  // say about it — the sheets are re-read from the store. So does a change of
  // person: host edits are kept per account, and a sheet must never show one
  // person's draft to the next (data/store.js).
  bus.on('store:change', ({ type }) => {
    if (type !== 'room-edit' && type !== 'reset' && type !== 'identity') return;
    render({ rebuild: true });
  });

  bus.on('hover:change', ({ venueId, roomId }) => {
    if (!venueId || state.roll > 0 || (state.view !== 'village' && state.view !== 'venue')) {
      banner.hide();
    } else banner.show({ venueId, roomId });
  });

  render();
  announcer.view();

  return { element: root, announce: announcer.say };
}
