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
import { outstanding as outstandingAgreements } from '../data/agreements.js';
import { track } from '../data/analytics.js';
import { heldVenue, readVenue } from '../data/catalog.js';
import * as session from '../data/session.js';
import { el } from './dom.js';
import { liveRoom } from './copy.js';
import { createAccount } from './account.js';
import { createCardPanel } from './cardPanel.js';
import { createDeepLink } from './deepLink.js';
import { createNotice } from './notice.js';
import { createNotifications } from './notifications.js';
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
  // Everything but the title page: that markup is printed in index.html and was
  // on screen long before this module arrived — createArrival adopts it, and
  // wiping it here would blank the one thing the visitor is already reading.
  for (const child of [...root.children]) {
    if (child.id !== 'arrival') child.remove();
  }
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
  // One panel for the card on file, opened from the two places it matters: the
  // account on the shelf, and a booked date whose charge failed.
  const cardPanel = createCardPanel({ announce: announcer.say });
  const guest = createGuestFlows({
    announce: announcer.say,
    porch,
    onFixPayment: () => cardPanel.open(),
    // Read lazily: the ambient surface is made further down, once the slip it
    // speaks through exists. The inbox only ever asks at render time.
    ambientRows: () => ambient.ambient(),
  });
  // Hosting is somebody's, so the switch has to be able to ask who. The panel
  // itself is made below — this is called on a click, long after.
  const host = createHostFlows({
    announce: announcer.say,
    porch,
    askToSignIn: () => signIn.open(null, { trigger: 'host' }),
  });

  // Last onto the shelf, so it sits at the end of the line where an account
  // belongs — a monogram when there is somebody to be, one quiet word when
  // there is not (D6). Both open something: the card, or the way in.
  const signIn = createSignInPanel({ announce: announcer.say });
  const account = createAccount({
    announce: announcer.say,
    onSignIn: () => signIn.open(),
    onCard: () => cardPanel.open(),
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

  // The two documents, asked for wherever the session came from.
  //
  // The identity panel asks whoever signs in through it — which is every sign-in
  // a person performs — but a session can appear without it: a remembered one on
  // the next visit, one restored by a deep link, one a sibling tab made. Somebody
  // who has never accepted the current version must still be asked, so the
  // question is also put here, at the session rather than at one door onto it
  // (v2_migration D7).
  //
  // **It waits for a quiet moment.** This prompt is a layer over everything, and
  // everything includes a desk somebody is answering from, a listing half
  // written, an open letter. Dropping it on top of those interrupts work to ask
  // a question that has kept for months and can keep a minute longer — so it is
  // asked on the map, with nothing else layered over it, and until then it is
  // simply remembered. (Found by tools/correspondence-test.mjs, which stalled at
  // a desk this panel had covered.)
  let owedAnAcceptance = false;
  /** Whether the panel on screen is one this asked for, rather than the person. */
  let askingHere = false;

  const nothingElseIsAsking = () =>
    state.view === 'village' &&
    ![...document.querySelectorAll('#ui .modal__layer, #ui .listing__layer')].some(
      (node) => !node.hidden
    ) &&
    ![...document.querySelectorAll('#ui .identity')].some((node) =>
      node.checkVisibility ? node.checkVisibility() : !node.hidden
    );

  function offerAgreements() {
    if (!owedAnAcceptance || !session.isSignedIn() || !nothingElseIsAsking()) return;
    owedAnAcceptance = false;
    askingHere = true;
    signIn.open(null, { trigger: 'agreements' });
  }

  /**
   * Somebody who has gone somewhere else has answered this prompt the way people
   * answer prompts they did not ask for: by leaving. It gets out of the way and
   * waits for the next quiet moment rather than sitting over a desk or a letter
   * — a panel nobody opened must never be a panel somebody has to dismiss.
   */
  function withdrawAgreements() {
    if (!askingHere) return;
    askingHere = false;
    if (signIn.isOpen()) signIn.close();
    owedAnAcceptance = true;
  }

  async function askAboutAgreements() {
    if (!session.isSignedIn()) return;
    const owed = await outstandingAgreements();
    owedAnAcceptance = Boolean(owed.length) && session.isSignedIn();
    offerAgreements();
  }

  session.onSessionChange((held, reason) => {
    if (!held) owedAnAcceptance = false;
    if (held && reason === session.REASON.signedIn) askAboutAgreements();
  });
  // And on the way in, for a session this browser was already holding.
  if (session.isSignedIn()) session.fetchCurrentUser().then(() => askAboutAgreements());

  // What steeple wrote while this person was away — ambient, not a tab. It
  // borrows the same slip the session notice uses, because it is the same kind
  // of thing: a word about something that happened to you (ui/notifications.js).
  const ambient = createNotifications({ notice, announce: announcer.say });

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
    signIn.element,
    cardPanel.element
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

  // A venue nobody searched for — a link out of an email, a deep link, one that
  // sat beyond the last page of results — is not on the surface yet, so there is
  // nothing to build a sheet from. It is read once, and the sheets are built the
  // ordinary way when it lands. A venue steeple has never heard of simply never
  // arrives, and the surface stays on the map, which is the truth.
  const asked = new Set();
  function readIfUnknown(venueId) {
    if (!venueId || heldVenue(venueId) || asked.has(venueId)) return;
    asked.add(venueId);
    readVenue(venueId).finally(() => {
      if (state.venueId === venueId) render();
    });
  }

  function render({ rebuild = false } = {}) {
    const { view, venueId, roomId } = state;
    readIfUnknown(venueId);
    const venue = venueId ? heldVenue(venueId) : null;
    // The room sheet is the listing, and a Draft is not one. steeple settles
    // this for every room it has ever heard of — Draft and Unlisted answer 404
    // to the public — so the only Drafts that reach here are the two this
    // browser knows of itself: the seed's deliberate one, and a space a host has
    // written but not yet sent. A deep link to either lands on the map.
    const shown = venue && roomId ? liveRoom(venueId, roomId) : null;
    const room = shown?.status === 'published' ? shown : null;
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

  bus.on('view:change', ({ view, previous }) => {
    render();
    announcer.view();
    // Somebody coming to read their correspondence — the guest's inbox or the
    // host's board. Arrival only: `view:change` does not fire for a redraw, and
    // a deep link straight into a letter is not an inbox that was opened
    // (`docs/contracts/analytics.md` `inbox_opened`).
    if (view !== previous?.view && (view === 'journal' || view === 'desk')) {
      track('inbox_opened', { surface: view === 'desk' ? 'host' : 'guest' });
    }
    // Back on the map with nothing over it: the moment an acceptance that has
    // been waiting may be asked for without interrupting anything. Anywhere
    // else, a prompt already up steps aside.
    if (view === 'village') offerAgreements();
    else withdrawAgreements();
  });

  bus.on('mode:change', () => {
    render();
    // Entering hosting is going somewhere, even when the view has not moved yet.
    if (state.mode !== 'guest') withdrawAgreements();
  });

  bus.on('roll:change', () => {
    render();
    // Arriving at the product surface is when there is room for a quiet word.
    ambient.onRoll();
  });

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

  // Somebody arriving from a notification email. Read once, after the surfaces
  // exist to be sent to (contracts/web.md — deep links).
  createDeepLink({ notice, announce: announcer.say, signIn });

  return { element: root, announce: announcer.say };
}
