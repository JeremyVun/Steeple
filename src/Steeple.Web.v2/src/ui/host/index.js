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
import { currentOrganizerId, getApplication, hostVenueId } from '../../data/store.js';
import { el } from '../dom.js';
import { createDesk } from './desk.js';
import { createLetterPage } from './letter.js';
import { createListingFlow } from './listing.js';

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

export function createHostFlows({ announce, porch } = {}) {
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
    onBackToDesk: () => setView('desk', { venueId: state.venueId ?? hostVenueId() }),
  });

  const listing = createListingFlow({
    announce,
    onChanged: () => desk.render(),
    onClose: () => {
      setOpen(desk.element, state.view === 'desk' && state.mode === 'host');
      setOpen(letterPage.element, state.view === 'letter' && state.mode === 'host');
      // A host who has just listed a venue is keeping that venue's door now,
      // so the desk they come back to is its own, not the one they left.
      const listed = hostVenueId();
      if (state.view === 'desk' && listed && listed !== state.venueId) {
        setView('desk', { venueId: listed });
      }
      desk.render();
      switchButton.focus?.();
    },
  });

  const element = el('div', { class: 'hostdesk', dataset: { desk: state.desk } }, [
    desk.element,
    letterPage.element,
    listing.element,
  ]);

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
      } else {
        desk.setTab('letters');
        setView('desk', { venueId: hostVenueId() });
      }
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

  function render() {
    const host = state.mode === 'host';
    const isDesk = host && state.view === 'desk';
    const isLetter = host && state.view === 'letter';
    renderSwitch();

    if (!isDesk && !isLetter && listing.isOpen()) listing.close();

    if (isDesk) {
      const venueId = state.venueId ?? hostVenueId();
      if (!state.venueId) {
        setView('desk', { venueId });
        return;
      }
      desk.setVenue(venueId);
      desk.render();
    }

    if (isLetter) {
      const application = getApplication(state.applicationId);
      if (!application) {
        setView('desk', { venueId: hostVenueId() });
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
      letterPage.show(application.id);
    }

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
        setView('desk', { venueId: hostVenueId() });
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
      setView('desk', { venueId: hostVenueId() });
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
