// SIGNING IN FROM THE SHELF — the same beat, reachable without a flow.
//
// The identity panel belongs to the moment a name is needed: before a request
// goes, before a space is listed. Someone arriving to read what a host said
// back has no such moment, so the shelf offers one — and it offers *this*
// panel (ui/guest/sso.js), the one the flows use, with its own words. There is
// one sign-in in steeple; this is a second door onto it, not a second one.
//
// It is a layer of its own over everything, because it can be opened from
// anywhere: the village, an open letter, the desk.

import * as session from '../data/session.js';
import { createIdentityStep } from './guest/sso.js';
import { el } from './dom.js';

const WORDS = {
  eyebrow: 'Your account',
  title: 'Sign in to Steeple',
  blurb:
    'Signing in keeps your requests and everything the hosts say back in one place. Steeple confirms a person once, so a host knows a real neighbour is asking; your name and your group travel with a request, and nothing else about you is shared.',
  carryOn: (name) => `Continue as ${name}`,
  cancel: 'Not now',
  formEyebrow: 'Sign in',
  peopleEyebrow: 'Sign in as',
  signedOutAgain: 'Signed out. Choose who you are.',
  missingEmail: 'An email address, so steeple knows who to keep your requests for.',
};

export function createSignInPanel({ announce } = {}) {
  let opener = null;

  const identity = createIdentityStep({
    announce,
    words: WORDS,
    onVerify: () => close(),
    onCancel: () => close(),
  });

  // No chrome of its own: the identity panel is already a sheet of paper, and
  // two boxes around one question is two boxes too many.
  const sheet = el(
    'div',
    {
      class: 'signin',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': WORDS.title,
    },
    [identity.element]
  );

  const element = el('div', { class: 'modal__layer signin__layer', hidden: true }, [sheet]);

  function open(from = null) {
    opener = from ?? document.activeElement;
    element.hidden = false;
    // A transition needs a frame to start from, and the layer has only just
    // been given one. Reading the layout is that frame — asking for the next
    // one instead leaves the panel at opacity 0 wherever frames are scarce.
    void element.offsetHeight;
    element.classList.add('is-open');
    identity.reset();
    identity.focus();
  }

  function close() {
    if (element.hidden) return;
    element.classList.remove('is-open');
    element.hidden = true;
    opener?.focus?.();
    opener = null;
  }

  const isOpen = () => !element.hidden;

  // The way out that costs nothing: the paper around the panel.
  element.addEventListener('pointerdown', (event) => {
    if (event.target === element) close();
  });

  // Escape belongs to whatever is open, and while this is open it is this.
  // Stopped dead: the journey's own Escape would take a view level with it.
  window.addEventListener(
    'keydown',
    (event) => {
      if (event.key !== 'Escape' || !isOpen()) return;
      event.preventDefault();
      event.stopPropagation();
      close();
    },
    { capture: true }
  );

  // Signing in from anywhere ends the panel's business: it opened to ask one
  // question and the session answered it.
  session.onSessionChange((held) => {
    if (held && isOpen()) close();
  });

  // A layer of its own has to stop its own events reaching the world behind,
  // exactly as ui/index.js does for every other surface.
  for (const type of ['pointerdown', 'pointerup', 'click', 'wheel']) {
    element.addEventListener(type, (event) => event.stopPropagation());
  }

  return { element, open, close, isOpen };
}
