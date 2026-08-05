// HOSTING — the church's side of a request (CONTRACT2 §5).
//
//   createHostFlows({ announce, porch }) -> { element }
//
// Self-managing: it owns the quiet mode switch on the porch, the 'desk' view,
// the host lens on 'letter', and the listing flow that puts a church on the
// map and takes the scaffolding off a room. All truth lives in data/store.js.
//
// Rendering language is a flag, like ?style=: ?desk=board (default) sets each
// waiting request as a card on a board; ?desk=ledger sets the same requests as
// day-book lines with the schedule ribbon drawn small beside each one. Same
// truth, same interactions, different instrument.

import { bus, setDesk, setMode, setView, state } from '../../core/bus.js';
import { managedVenues, refreshManaged } from '../../data/correspondence.js';
import * as session from '../../data/session.js';
import {
  currentOrganizerId,
  getApplication,
  hostVenueId,
  mirrorManagedVenues,
  placedVenues,
} from '../../data/store.js';
import { el } from '../dom.js';
import { createDesk } from './desk.js';
import { createLetterPage } from './letter.js';
import { createListingFlow } from './listing.js';
import { deskVenues } from './model.js';

const HOST_VIEWS = new Set(['desk', 'letter']);

// Clicking away from the desk puts it down, the way a page is set aside. These
// are the things a click can land on that are not "away": the sheet itself, the
// top line and the porch — which are how you leave on purpose — and anything
// modal, which has its own way out and must be answered first.
const NOT_AWAY =
  '.desk, .letterpage, .listing, .listing__layer, .nav, .porch, [role="dialog"], .modal__layer';

function setOpen(node, open) {
  node.classList.toggle('is-open', open);
  node.toggleAttribute('inert', !open);
  node.setAttribute('aria-hidden', open ? 'false' : 'true');
}

export function createHostFlows({ announce, porch, askToSignIn } = {}) {
  const desk = createDesk({
    variant: state.desk,
    onOpenLetter: (application) =>
      setView('letter', {
        applicationId: application.id,
        venueId: application.venueId,
        roomId: application.roomId,
      }),
    onListing: (options) => openListing(options),
    onVariant: setDesk,
    onVenue: (venueId) => setView('desk', { venueId }),
  });

  const letterPage = createLetterPage({
    announce,
    onBackToDesk: () => setView('desk', { venueId: state.venueId ?? deskVenue() }),
  });

  const listing = createListingFlow({
    announce,
    onChanged: () => desk.render(),
    onClose: () => {
      setOpen(desk.element, state.view === 'desk' && state.mode === 'host');
      setOpen(letterPage.element, state.view === 'letter' && state.mode === 'host');
      // A host who has just listed a venue is keeping that venue's door now,
      // so the desk they come back to is its own — and steeple is asked again,
      // because a venue that did not exist a minute ago is one of theirs now.
      readDesk({ again: true }).then(() => {
        const listed = deskVenue();
        if (state.view === 'desk' && listed && listed !== state.venueId) {
          setView('desk', { venueId: listed });
        }
        desk.render();
      });
      switchButton.focus?.();
    },
  });

  const element = el('div', { class: 'hostdesk', dataset: { desk: state.desk } }, [
    desk.element,
    letterPage.element,
    listing.element,
  ]);

  // ── whose doors these are ─────────────────────────────────────────────────
  //
  // A desk exists because steeple says this person manages a venue, and for no
  // other reason (v2_migration D4). `GET /manage/venues` is asked once per
  // session and again whenever the person changes; the requests waiting at
  // those venues are `GET /manage/applications`, scoped to them.

  let reading = null;
  // Whether steeple has been asked yet, for whoever is signed in now.
  let read = false;

  /** The venue slugs this desk may show. Empty means there is no desk. */
  const mine = () => deskVenues(placedVenues()).map((v) => v.id);

  async function readVenues() {
    if (!session.isSignedIn()) {
      desk.setReading(false);
      return [];
    }
    desk.setReading(true);
    const answer = await managedVenues();
    desk.setReading(false);
    if (answer.ok) mirrorManagedVenues(answer.value);
    const slugs = mine();
    if (slugs.length) await refreshManaged(slugs);
    return slugs;
  }

  /** Ask steeple, once, unless `again` insists (a listing just landed, or the desk was opened). */
  function readDesk({ again = false } = {}) {
    if (read && !again && !reading) return Promise.resolve(mine());
    read = true;
    reading ??= readVenues().finally(() => {
      reading = null;
    });
    return reading;
  }

  // A different person keeps different doors. Asked again on every change of
  // session, and the desk leaves with whoever was signed in (D6).
  session.onSessionChange((held) => {
    read = false;
    if (!held) {
      desk.setReading(false);
      wanted = false;
      // Hosting belongs to whoever was signed in. Signing out leaves it, and
      // leaves it empty — a desk must never outlive the session that earned it.
      if (state.mode === 'host') {
        setMode('guest');
        setView('village');
      }
      return;
    }
    if (wanted) {
      enterHosting();
      return;
    }
    if (state.mode === 'host') readDesk().then(render);
  });

  /** The venue the desk opens on: the one it was left on, or the first held. */
  function deskVenue() {
    const slugs = mine();
    if (!slugs.length) return null;
    const held = hostVenueId();
    return slugs.includes(held) ? held : slugs[0];
  }

  /**
   * "I have space to share", answered honestly.
   *
   * There are exactly three ways this can end, and a desk is only one of them:
   *
   *   · nobody is signed in       — the way in is signing in, and the link is
   *                                 held so pressing it once is enough;
   *   · signed in, no venue       — the listing flow, which is the thing that
   *                                 would give them one;
   *   · signed in, ≥1 real venue  — the desk, scoped to those venues.
   *
   * A stranger must never be shown a desk. The seeded churches are the village's
   * scenery, not anybody's business, and the old switch opened straight onto one
   * of them with its demo correspondence on the board (v2_migration D4).
   */
  function enterHosting() {
    desk.setTab('letters');
    if (!session.isSignedIn()) {
      wanted = true;
      announce?.('Sign in to list a space.');
      askToSignIn?.();
      return;
    }
    wanted = false;
    readDesk().then(() => {
      if (!session.isSignedIn()) return;
      const venueId = deskVenue();
      if (!venueId) {
        setMode('host');
        openListing({ step: 'place' });
        return;
      }
      setView('desk', { venueId });
    });
  }

  /** Somebody pressed the switch while signed out; carry them on afterwards. */
  let wanted = false;

  // Switching instrument redraws the desk and nothing else on the page.
  bus.on('desk:change', ({ desk: next }) => {
    element.dataset.desk = next;
    desk.setVariant(next);
  });

  // ── the quiet mode switch ─────────────────────────────────────────────────

  const switchButton = el('button', {
    type: 'button',
    class: 'porchswitch',
    dataset: { action: 'mode' },
    onclick: () => {
      if (state.mode === 'host') {
        setMode('guest');
        setView('village');
        return;
      }
      enterHosting();
    },
  });
  porch?.append(switchButton);

  function renderSwitch() {
    const host = state.mode === 'host';
    switchButton.textContent = host ? 'Back to browsing' : 'I have space to share';
    switchButton.classList.toggle('is-host', host);
    switchButton.setAttribute(
      'aria-label',
      host ? 'Stop hosting and browse spaces' : 'Switch to hosting — the requests at your venue'
    );
  }

  function openListing(options) {
    setOpen(desk.element, false);
    setOpen(letterPage.element, false);
    listing.open(options);
  }

  // ── routing ───────────────────────────────────────────────────────────────

  let announced = '';
  // Which request the letter page is set for, so opening one asks steeple for
  // its thread and a redraw after a decision does not ask again.
  let shown = null;

  // Whether the last render was already showing the board, so arriving at it can
  // be told from redrawing it. `render()` runs on every bus and store change, so
  // only the arrival may ask steeple again — otherwise the answer's own mirror
  // would trigger the next read, and the desk would poll itself forever.
  let wasDesk = false;

  function render() {
    const host = state.mode === 'host';
    const isDesk = host && state.view === 'desk';
    const isLetter = host && state.view === 'letter';
    const arrivedAtDesk = isDesk && !wasDesk;
    wasDesk = isDesk;
    renderSwitch();

    if (!isDesk && !isLetter && listing.isOpen()) listing.close();

    // A cold link to `#/desk` or a request while signed out is not a desk
    // either: hosting is somebody's, and this browser is nobody at the moment.
    // Left until the next microtask so the address bar is corrected with the
    // view (core/bus.js will not write a hash back while it is reading one).
    if ((isDesk || isLetter) && !session.isSignedIn()) {
      queueMicrotask(() => {
        if (session.isSignedIn() || !HOST_VIEWS.has(state.view)) return;
        setMode('guest');
        setView('village');
      });
      setOpen(desk.element, false);
      setOpen(letterPage.element, false);
      return;
    }

    if (isDesk) {
      // The first read decides whether there is a desk here at all, so the view
      // is settled again once it lands rather than left on an empty one — and a
      // signed-in person who keeps no venue is taken to the flow that would
      // give them one rather than left on an empty board.
      // Opening the board is a question, not a memory: between one visit and the
      // next a guest can withdraw, accept a counter, or take the slot elsewhere,
      // and a board that answered once at sign-in would still be showing the
      // request as waiting on you.
      readDesk({ again: arrivedAtDesk }).then(() => {
        if (state.mode !== 'host' || state.view !== 'desk') return;
        const settled = deskVenue();
        if (!settled) {
          if (!listing.isOpen()) openListing({ step: 'place' });
          return;
        }
        if (!state.venueId) render();
      });
      const venueId = state.venueId ?? deskVenue();
      if (!state.venueId && venueId) {
        setView('desk', { venueId });
        return;
      }
      desk.setVenue(venueId);
      desk.render();
    }

    if (isLetter) {
      const application = getApplication(state.applicationId);
      if (!application) {
        setView('desk', { venueId: deskVenue() });
        return;
      }
      if (state.venueId !== application.venueId) {
        setView('letter', {
          applicationId: application.id,
          venueId: application.venueId,
          roomId: application.roomId,
        });
        return;
      }
      if (shown !== application.id) {
        shown = application.id;
        letterPage.show(application.id, { refresh: true });
      } else {
        letterPage.show(application.id);
      }
    }
    if (!isLetter) shown = null;

    setOpen(desk.element, isDesk && !listing.isOpen());
    setOpen(letterPage.element, isLetter && !listing.isOpen());

    const spoken = isDesk ? desk.spoken() : isLetter ? letterPage.spoken() : '';
    if (spoken && spoken !== announced) {
      announced = spoken;
      // ui/index.js announces the view change after us; land after it.
      queueMicrotask(() => announce?.(spoken));
    }
    if (!spoken) announced = '';
  }

  bus.on('view:change', () => {
    // Leaving the correspondence for the world leaves the desk behind.
    if (state.mode === 'host' && !HOST_VIEWS.has(state.view)) setMode('guest');
    // A cold link to a request sent by someone else can only be a host's:
    // the guest's inbox holds their own requests, not the parish's.
    if (state.view === 'letter' && state.mode === 'guest') {
      const application = getApplication(state.applicationId);
      if (application && application.organizerId !== currentOrganizerId()) {
        setMode('host');
        return;
      }
    }
    render();
  });

  bus.on('mode:change', () => {
    renderSwitch();
    // Entering host mode leads to the desk, whichever way it was entered.
    queueMicrotask(() => {
      if (state.mode === 'host' && !HOST_VIEWS.has(state.view)) {
        setView('desk', { venueId: deskVenue() });
      } else {
        render();
      }
    });
  });

  bus.on('store:change', ({ type }) => {
    if (listing.isOpen()) return;
    if (state.view === 'desk' && state.mode === 'host') desk.render();
    else if (
      state.view === 'letter' &&
      state.mode === 'host' &&
      type === 'reset'
    ) {
      setView('desk', { venueId: deskVenue() });
    }
  });

  // A click on the page behind the desk closes the desk, and does nothing else:
  // the visitor was reaching past it, not through it. Capture, because the
  // surfaces underneath stop their own events before they ever bubble here.
  document.addEventListener(
    'click',
    (event) => {
      if (state.mode !== 'host' || state.view !== 'desk') return;
      if (listing.isOpen()) return;
      if (event.target?.closest?.(NOT_AWAY)) return;
      event.preventDefault();
      event.stopPropagation();
      setView('village');
    },
    { capture: true }
  );

  // Esc inside an open drawer closes the drawer before the journey ascends.
  element.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (listing.isOpen()) return; // the listing handles its own Esc
    if (!letterPage.isDrawerOpen()) return;
    event.preventDefault();
    event.stopPropagation();
    letterPage.closeDrawer();
    announce?.('Closed. The request is still open and undecided.');
  });

  render();

  return { element };
}
