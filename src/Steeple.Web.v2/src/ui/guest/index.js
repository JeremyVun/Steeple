// GUEST REQUESTS — Workstream B (CONTRACT2 §4). One module owning the apply
// composer, the identity beat, the inbox, and a request opened in the guest's
// lens.
//
//   createGuestFlows({ announce, porch }) -> { element }
//
// Self-managing: it listens to the bus and shows or hides itself. Nothing in
// here holds product truth — every fact, status and rule comes from
// data/store.js, and every mutation goes back through it.
//
// Hit-testing rule this layer obeys absolutely: the root never takes pointer
// events, a closed surface is `visibility: hidden` + `inert`, and only the
// sheet itself opts back in. A closed surface must not swallow the village.

import { bus, setView, state } from '../../core/bus.js';
import { refreshMine } from '../../data/correspondence.js';
import * as session from '../../data/session.js';
import { getApplication, guestApplications } from '../../data/store.js';
import { getVenue } from '../../data/venues.js';
import { el, replaceChildren } from '../dom.js';
import { createComposer } from './composer.js';
import { createJournal } from './journal.js';
import { createLetterView } from './letter.js';
import { isYourMove, plural } from './copy.js';

// An exploration flag in the house style (CONTRACT2 §0), parsed once by the bus
// as `state.letter`: the same truth and the same interaction, set in two hands.
//   stationery — warm printed sheet, the canonical direction
//   ledger     — the parish register: hairline rules, tabular, administrative

// Clicking away from the inbox puts it down. These are the things a click can
// land on that are not "away": any guest sheet (a closed one never takes an
// event at all), the top line and the porch — which are how you leave on
// purpose — and anything modal, which has its own way out.
const NOT_AWAY = '.guest__surface, .sent, .nav, .porch, [role="dialog"], .modal__layer';

export function createGuestFlows({ announce, porch, onFixPayment, ambientRows } = {}) {
  document.documentElement.dataset.letter = state.letter;

  const wash = el('div', { class: 'guest__wash', 'aria-hidden': 'true' });

  const composer = createComposer({
    announce,
    onLeave: () => setView('room', { venueId: state.venueId, roomId: state.roomId }),
    onSent: (application, { instant = false } = {}) => {
      // Out of the way: the world flies the envelope, the guest keeps their place.
      setView('room', { venueId: application.venueId, roomId: application.roomId });
      showConfirmation(application, instant);
    },
  });

  const journal = createJournal({
    announce,
    onOpen: (app) =>
      setView('letter', { applicationId: app.id, venueId: app.venueId, roomId: app.roomId }),
    onBrowse: () => setView('village'),
    // What steeple wrote while this person was away, printed as lines at the
    // head of the inbox rather than as a second inbox of its own.
    ambientRows,
  });

  const letter = createLetterView({
    announce,
    onBack: () => setView('journal'),
    onBrowse: () => setView('village'),
    // A failed charge on a booked date is the one thing on this page that is
    // fixed somewhere else. The panel is the shelf's, so it is handed in.
    onFixPayment,
  });

  const surfaces = [
    { view: 'apply', surface: composer },
    { view: 'journal', surface: journal },
    { view: 'letter', surface: letter },
  ];

  // ── the confirmation slip ─────────────────────────────────────────────────

  const confirmation = el('aside', {
    class: 'sent',
    role: 'status',
    hidden: true,
  });
  let confirmationTimer = null;
  let confirmationView = null;

  function showConfirmation(application, instant = false) {
    confirmationView = state.view;
    const venue = getVenue(application.venueId);
    const where = venue?.shortName ?? application.venueName ?? 'the venue';
    replaceChildren(confirmation, [
      // An instant venue answered the send with the booking itself. Saying it is
      // "on its way" would be describing something that has already arrived.
      el('p', {
        class: 'sent__line',
        text: instant
          ? `Booked. ${application.roomName ?? 'The space'} at ${where} is yours.`
          : `Your request is on its way to ${where}.`,
      }),
      el(
        'button',
        {
          type: 'button',
          class: 'linkish',
          onclick: () => {
            hideConfirmation();
            setView('letter', {
              applicationId: application.id,
              venueId: application.venueId,
              roomId: application.roomId,
            });
          },
        },
        'Open it in your inbox'
      ),
    ]);
    confirmation.hidden = false;
    requestAnimationFrame(() => confirmation.classList.add('is-open'));
    clearTimeout(confirmationTimer);
    confirmationTimer = setTimeout(hideConfirmation, 9000);
  }

  function hideConfirmation() {
    clearTimeout(confirmationTimer);
    confirmationView = null;
    confirmation.classList.remove('is-open');
    confirmation.hidden = true;
  }

  // ── the porch: a word, and a count of what is waiting ─────────────────────

  const tabCount = el('span', { class: 'letters__count' });
  const tab = el(
    'button',
    {
      type: 'button',
      class: 'letters',
      onclick: () => setView('journal'),
    },
    [el('span', { class: 'letters__word', text: 'Inbox' }), tabCount]
  );
  porch?.append(tab);

  // An inbox is somebody's. Signed out there is nobody for it to belong to, so
  // there is no tab and no count — not an empty one (D6).
  function renderTab() {
    const guest = state.mode === 'guest' && session.isSignedIn();
    tab.hidden = !guest;
    if (!guest) return;
    const waiting = guestApplications().filter((a) => isYourMove(a.status)).length;
    tabCount.textContent = waiting ? String(waiting) : '';
    tabCount.hidden = !waiting;
    tab.classList.toggle('is-on', state.view === 'journal' || state.view === 'letter');
    tab.setAttribute(
      'aria-label',
      waiting
        ? `Inbox — ${plural(waiting, 'request needs', 'requests need')} you`
        : 'Inbox'
    );
  }

  // ── visibility ────────────────────────────────────────────────────────────

  const element = el('div', { class: 'guest' }, [
    wash,
    composer.element,
    journal.element,
    letter.element,
    confirmation,
  ]);

  function setOpen(surface, open) {
    surface.element.classList.toggle('is-open', open);
    surface.element.toggleAttribute('inert', !open);
    surface.element.setAttribute('aria-hidden', open ? 'false' : 'true');
  }

  let spokenFor = null;

  function render() {
    const guest = state.mode === 'guest';
    let active = null;

    // The inbox and an opened letter are correspondence: they exist for one
    // person and cannot be shown to nobody. A cold link to either while signed
    // out lands in the village rather than on an empty sheet. Asking for a
    // space is not correspondence yet — it is a draft, and naming yourself is a
    // step inside it (ui/guest/composer.js). The host's lens on the same views
    // is the desk's business, not this module's.
    //
    // Left until the next microtask so the address bar is corrected with the
    // view: a hash being applied is being read, and core/bus.js will not write
    // one back while it is reading — a cold link that lands in the village
    // would otherwise leave a letter's address in the bar.
    if (guest && !session.isSignedIn() && (state.view === 'journal' || state.view === 'letter')) {
      queueMicrotask(() => {
        if (!session.isSignedIn() && (state.view === 'journal' || state.view === 'letter')) {
          setView('village');
        }
      });
      return;
    }

    for (const { view, surface } of surfaces) {
      const open = guest && state.view === view;
      if (open) active = { view, surface };
      setOpen(surface, open);
    }

    if (active?.view === 'apply') {
      if (!composer.open(state.venueId, state.roomId)) {
        setOpen(composer, false);
        active = null;
      }
    } else if (active?.view === 'journal') {
      journal.render();
    } else if (active?.view === 'letter') {
      const id = state.applicationId;
      if (!letter.open(id)) {
        // A cold link to a request that is not ours: go where it does exist.
        setOpen(letter, false);
        active = null;
      } else {
        const app = getApplication(id);
        // A cold-loaded request carries only an id; the rest is the store's to say.
        if (app && !state.venueId) {
          state.venueId = app.venueId;
          state.roomId = app.roomId;
        }
      }
    }

    element.classList.toggle('is-open', Boolean(active));
    wash.classList.toggle('is-on', Boolean(active));
    // The slip belongs to the moment the request left; move on and it goes.
    if (confirmationView && state.view !== confirmationView) hideConfirmation();
    renderTab();

    // The shared announcer speaks for every view change; ours must land after
    // it, so the guest hears the request and not the listing behind it.
    const key = `${state.view}:${state.applicationId ?? state.roomId ?? ''}`;
    if (active && key !== spokenFor) {
      spokenFor = key;
      setTimeout(() => {
        if (state.view === active.view) announce?.(active.surface.spoken());
      }, 0);
    } else if (!active) {
      spokenFor = null;
    }
  }

  // A click on the page behind the inbox closes the inbox, and does nothing
  // else: the visitor was reaching past it, not through it. Only the inbox — a
  // request being read or written is not something to lose to a stray click.
  // Capture, because the surfaces underneath stop their own events before they
  // ever bubble this far.
  document.addEventListener(
    'click',
    (event) => {
      if (state.mode !== 'guest' || state.view !== 'journal') return;
      if (event.target?.closest?.(NOT_AWAY)) return;
      event.preventDefault();
      event.stopPropagation();
      setView('village');
    },
    { capture: true }
  );

  // The inbox is steeple's, not this browser's: it is read whenever the person
  // changes and whenever the inbox is opened, and the mirror is redrawn from
  // whatever comes back (D4). Nothing polls; nothing waits for it either — the
  // mirror draws immediately and the answer corrects it.
  let reading = null;
  function readInbox() {
    if (!session.isSignedIn()) return;
    reading ??= refreshMine().finally(() => {
      reading = null;
    });
  }

  bus.on('view:change', () => {
    if (state.view === 'journal' || state.view === 'letter') readInbox();
    render();
  });
  bus.on('mode:change', render);
  // Who is signed in decides whether the inbox exists at all. Told, never
  // polled (data/session.js).
  //
  // Deliberately not the whole render: the request sheet asks for a name in the
  // middle of itself, and a full render re-opens the composer — which puts the
  // identity step away at the exact moment somebody has just used it.
  session.onSessionChange((held) => {
    if (held) readInbox();
    renderTab();
    if (state.view === 'journal' || state.view === 'letter') render();
  });
  // The stationery/ledger flag is set entirely in CSS off this one attribute,
  // so switching it live is the attribute and nothing else. Nothing on the page
  // offers the switch yet — `?letter=` still opens on one of them.
  bus.on('letter:change', ({ letter }) => {
    document.documentElement.dataset.letter = letter;
  });
  // A mutation rebuilds whichever surface is open. Rebuilding must not cost the
  // keyboard its place: what was focused is put back, or the page takes focus.
  bus.on('store:change', () => {
    renderTab();
    if (state.mode !== 'guest') return;
    if (state.view === 'journal') {
      const openId = document.activeElement?.closest?.('.jrow')?.dataset.id;
      journal.render();
      if (openId) journal.element.querySelector(`.jrow[data-id="${openId}"]`)?.focus();
    } else if (state.view === 'letter') {
      const held = letter.element.contains(document.activeElement);
      letter.render();
      if (held) letter.focusBody();
    } else if (state.view === 'apply') {
      composer.refresh();
    }
  });

  render();
  // A remembered session means there is already an inbox to be right about, so
  // the badge is true from the first paint rather than from the first visit.
  readInbox();

  return { element };
}
