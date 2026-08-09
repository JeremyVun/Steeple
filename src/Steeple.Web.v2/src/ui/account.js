// WHO YOU ARE, on the shelf at the top right.
//
// Signing in happens where it is needed — inside a request, inside a listing —
// but who you are must be answerable at any moment, not only mid-flow. That is
// a small thing until the browser is shared, or the wrong email was typed, and
// then it is the only thing.
//
// So the shelf carries the account in both states (D6): a monogram and a card
// when there is somebody, and one quiet word — Sign in — when there is not. The
// word opens the very panel the flows open (ui/guest/sso.js); there is one way
// into steeple and this is a second door onto it, not a second way.
//
// It talks to nothing but data/session.js and whoever hands it that panel.
// Signing out here puts the request sheet's identity block back to signing in,
// and the host flow's with it, because both watch the same session
// (CONTRACT6 §1.1) — no module here calls another's code.

import { CORRESPONDENCE_VIEWS, setView, state } from '../core/bus.js';
import { paymentState } from '../data/correspondence.js';
import { isEnabled } from '../data/flags.js';
import * as session from '../data/session.js';
import { el, replaceChildren } from './dom.js';
import { cardLine } from './guest/payment.js';

/** Two letters at most: a monogram, not an abbreviation. */
function initials(person) {
  const words = String(person?.displayName ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return (person?.email ?? '?').trim()[0]?.toUpperCase() ?? '?';
  const letters = words.length === 1 ? [words[0][0]] : [words[0][0], words.at(-1)[0]];
  return letters.join('').toUpperCase();
}

const firstName = (person) =>
  String(person?.displayName ?? '').trim().split(/\s+/)[0] || (person?.email ?? 'Account');

export function createAccount({ announce = () => {}, onSignIn = null, onCard = null } = {}) {
  // The card steeple holds for this person, as `GET /me/payments` last answered.
  // Null means the question has not been asked — which is a different sentence
  // from "no card on file", and the card prints neither until it knows.
  let payments = null;
  let paymentsEnabled = false;
  const mark = el('span', { class: 'account__mark', 'aria-hidden': 'true' });
  const who = el('span', { class: 'account__who' });

  const trigger = el(
    'button',
    {
      type: 'button',
      class: 'account',
      'aria-expanded': 'false',
      'aria-haspopup': 'true',
      'aria-controls': 'account-card',
      onclick: () => {
        // Signed out the chip is not a menu — it is the door. There is nothing
        // to show about an account that does not exist yet.
        if (!session.isSignedIn()) return onSignIn?.();
        setOpen(!open);
      },
    },
    [mark, who]
  );

  // The card is not a child of the shelf. The shelf rides inside the browse
  // surface, which is one stacking context under a letter or a desk, so a card
  // hung off the button here opens underneath whichever sheet is on the page —
  // the button on top of it and its own contents behind. It is mounted at the
  // top of the interface instead (ui/index.js) and set under the button by
  // measurement, the same way the search pill places its panels.
  // It is a dialog, and says so for two reasons. It is one: a named surface
  // with controls of its own, opened from a button, dismissed on its own terms.
  // And the inbox and the desk each close on a click that lands anywhere they
  // do not recognise — they listen in capture on `document` and stop the event
  // dead, so a press on Sign out over an open inbox closed the inbox and never
  // reached the button. Both of them recognise a dialog. That list is theirs to
  // keep, not this module's to work around.
  const card = el('div', {
    class: 'account__card',
    id: 'account-card',
    role: 'dialog',
    'aria-label': 'Your account',
    'aria-modal': 'false',
    hidden: true,
  });
  const element = el('div', { class: 'account__wrap' }, trigger);

  let open = false;

  function place() {
    const seat = trigger.getBoundingClientRect();
    card.style.top = `${Math.round(seat.bottom + 9)}px`;
    card.style.right = `${Math.max(8, Math.round(window.innerWidth - seat.right))}px`;
  }

  function setOpen(next) {
    open = next && session.isSignedIn();
    trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
    card.hidden = !open;
    element.classList.toggle('is-open', open);
    if (open) {
      place();
      // Asked when the card is opened, not on every page load: nobody needs a
      // flags or payments read to look at a map. The public flag fails closed,
      // so a missing flags endpoint can never expose an unavailable card flow.
      readPaymentsFlag();
    }
  }

  async function readPaymentsFlag() {
    paymentsEnabled = await isEnabled('payments.enabled');
    if (!open) return;
    render();
    if (paymentsEnabled) readPayments();
  }

  /** What steeple holds on file. Best effort — a failure simply says nothing. */
  function readPayments() {
    if (!session.isSignedIn()) return;
    paymentState().then((answer) => {
      if (!answer.ok) return;
      payments = answer.value;
      if (open) render();
    });
  }

  /**
   * The money half of an account, and only what Steeple actually knows: a brand
   * and four digits. No card number has ever been here to print.
   */
  function paymentBlock() {
    if (!onCard || !paymentsEnabled) return null;
    const line = payments?.hasPaymentMethod ? cardLine(payments.method) : null;
    return el('div', { class: 'account__payment' }, [
      el('p', { class: 'account__paylabel', text: 'Payment method' }),
      el('p', {
        class: `account__method${line ? '' : ' is-none'}`,
        text: line ?? (payments ? 'No card on file' : 'Checking…'),
      }),
      el(
        'button',
        {
          type: 'button',
          class: 'linkish account__cardedit',
          dataset: { action: 'card' },
          onclick: () => {
            setOpen(false);
            onCard();
          },
        },
        line ? 'Use a different card' : 'Add a card'
      ),
    ]);
  }

  window.addEventListener('resize', () => {
    if (open) place();
  });

  // Leaving is local the instant it is asked for; steeple is told straight
  // after and its answer changes nothing here (data/session.js). A revocation
  // that cannot be delivered must never leave somebody signed in on a browser
  // they asked to be signed out of.
  function signOut() {
    const person = session.currentUser();
    session.signOut();
    setOpen(false);
    // Every surface that asks who you are reads the session, so most of the
    // page corrects itself. A correspondence is the exception: an inbox, a desk
    // or a letter is somebody's, and once it is nobody's the honest place to
    // stand is the map.
    if (CORRESPONDENCE_VIEWS.has(state.view)) setView('village', {}, { history: 'replace' });
    announce(`Signed out${person ? ` of ${person.displayName}` : ''}.`);
    trigger.focus();
  }

  function render() {
    const person = session.currentUser();
    element.hidden = false;
    element.classList.toggle('is-out', !person);

    if (!person) {
      setOpen(false);
      mark.textContent = '';
      mark.hidden = true;
      who.textContent = 'Sign in';
      trigger.setAttribute('aria-label', 'Sign in to Steeple');
      trigger.setAttribute('aria-haspopup', 'dialog');
      trigger.setAttribute('aria-expanded', 'false');
      return;
    }

    mark.hidden = false;
    mark.textContent = initials(person);
    who.textContent = firstName(person);
    trigger.setAttribute('aria-label', `Your account — ${person.displayName}`);
    trigger.setAttribute('aria-haspopup', 'true');
    replaceChildren(card, [
      el('p', { class: 'account__name', text: person.displayName }),
      person.email && el('p', { class: 'account__email', text: person.email }),
      paymentBlock(),
      el(
        'button',
        { type: 'button', class: 'linkish account__out', onclick: () => signOut() },
        'Sign out'
      ),
    ]);
  }

  // In capture, because the printed layer stops its own pointer events from
  // reaching the page (ui/index.js) and so from reaching this.
  document.addEventListener(
    'pointerdown',
    (event) => {
      if (!open || element.contains(event.target) || card.contains(event.target)) return;
      setOpen(false);
    },
    { capture: true }
  );

  // Escape belongs to whatever is open, and while this is open it is this —
  // wherever focus happens to be sitting. It closes the card and stops there:
  // the journey's own Escape would take a view level with it.
  window.addEventListener(
    'keydown',
    (event) => {
      if (event.key !== 'Escape' || !open) return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      trigger.focus();
    },
    { capture: true }
  );

  // The card is a layer of its own now, so it has to stop its own pointer and
  // wheel events reaching the world behind, exactly as ui/index.js does for
  // every other surface.
  for (const type of ['pointerdown', 'pointerup', 'click', 'wheel']) {
    card.addEventListener(type, (event) => event.stopPropagation());
  }

  session.onSessionChange((held) => {
    // A card is the person's, not the browser's: what was read for whoever was
    // here before must not be printed on the next person's account.
    payments = null;
    if (!held) setOpen(false);
    render();
  });
  render();

  // Identity is restored from the cookie rather than a persisted profile.
  session.fetchCurrentUser().then(render);

  return { element, card, render };
}
