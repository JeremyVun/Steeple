// WHO YOU ARE, on the shelf at the top right.
//
// Signing in happens where it is needed — inside a request, inside a listing —
// and until this there was nowhere at all to see who steeple thinks you are, or
// to stop being them. That is a small thing until the browser is shared, or the
// wrong email was typed, and then it is the only thing.
//
// Signed out it is not on the page. A door out of a room you are not in is
// clutter, and the porch is already carrying two words; the way *in* belongs to
// the flows that need a name, not to a header.
//
// It talks to nothing but data/session.js. Signing out here puts the request
// sheet's identity block back to signing in, and the host flow's with it,
// because both watch the same session (CONTRACT6 §1.1) — no module here calls
// another's code.

import { CORRESPONDENCE_VIEWS, setView, state } from '../core/bus.js';
import * as session from '../data/session.js';
import { el, replaceChildren } from './dom.js';

/** Two letters at most: a monogram, not an abbreviation. */
function initials(person) {
  const words = String(person?.displayName ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return (person?.email ?? '?').trim()[0]?.toUpperCase() ?? '?';
  const letters = words.length === 1 ? [words[0][0]] : [words[0][0], words.at(-1)[0]];
  return letters.join('').toUpperCase();
}

const firstName = (person) =>
  String(person?.displayName ?? '').trim().split(/\s+/)[0] || (person?.email ?? 'Account');

export function createAccount({ announce = () => {} } = {}) {
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
      onclick: () => setOpen(!open),
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
    if (open) place();
  }

  window.addEventListener('resize', () => {
    if (open) place();
  });

  function signOut() {
    const person = session.currentUser();
    session.signOut();
    setOpen(false);
    // Every surface that asks who you are reads the session, so most of the
    // page corrects itself. A correspondence is the exception: an inbox, a desk
    // or a letter is somebody's, and once it is nobody's the honest place to
    // stand is the map.
    if (CORRESPONDENCE_VIEWS.has(state.view)) setView('village');
    announce(`Signed out${person ? ` of ${person.displayName}` : ''}.`);
    trigger.focus();
  }

  function render() {
    const person = session.currentUser();
    element.hidden = !person;
    if (!person) {
      setOpen(false);
      return;
    }
    mark.textContent = initials(person);
    who.textContent = firstName(person);
    trigger.setAttribute('aria-label', `Your account — ${person.displayName}`);
    replaceChildren(card, [
      el('p', { class: 'account__name', text: person.displayName }),
      person.email && el('p', { class: 'account__email', text: person.email }),
      el(
        'button',
        { type: 'button', class: 'linkish account__out', onclick: signOut },
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

  session.onSessionChange(render);
  render();

  // A session remembered from a previous visit may have gone stale while the
  // browser was closed: ask steeple who this is, quietly. A dead session signs
  // this browser out; an API that is simply not running costs nothing.
  if (session.isSignedIn()) session.fetchCurrentUser().then(render);

  return { element, card, render };
}
