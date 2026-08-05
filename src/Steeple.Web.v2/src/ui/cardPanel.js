// THE CARD ON FILE, REACHABLE — the same step, lifted out of the request sheet.
//
// The card step belongs to the moment a request is sent (ui/guest/payment.js),
// but a card outlives that moment: it expires, it gets cancelled, a charge on it
// fails and a booked date is now at risk. So the same panel is openable from
// wherever that matters — the account card on the shelf, and the failure line on
// an opened letter — and it is one panel, not a second way of doing the same
// thing.
//
// Same non-negotiable as the step it wraps: brand and last four digits only, and
// no field anywhere here a card number could travel in.

import { createCardStep, REPLACE_WORDS } from './guest/payment.js';
import { el } from './dom.js';

export function createCardPanel({ announce } = {}) {
  let opener = null;

  const card = createCardStep({
    announce,
    words: REPLACE_WORDS,
    onCancel: () => close(),
    onSaved: () => {
      // Saved is the whole business here — there is no send waiting behind it.
      // The panel stays open for one beat so the new card is seen on file, and
      // the person closes it themselves.
      announce?.('Your card has been replaced. Anything still to be charged uses it.');
    },
  });

  const sheet = el(
    'div',
    {
      class: 'cardpanel',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': 'Your payment method',
    },
    [card.element]
  );

  const element = el('div', { class: 'modal__layer cardpanel__layer', hidden: true }, [sheet]);

  function open(from = null) {
    opener = from ?? document.activeElement;
    element.hidden = false;
    // A transition needs a frame to start from, and the layer has only just
    // been given one. Reading the layout is that frame.
    void element.offsetHeight;
    element.classList.add('is-open');
    card.reset();
    // What steeple holds, asked rather than assumed: a card saved on another
    // device is still this person's card.
    card.readMethod();
    card.focus();
  }

  function close() {
    if (element.hidden) return;
    element.classList.remove('is-open');
    element.hidden = true;
    opener?.focus?.();
    opener = null;
  }

  const isOpen = () => !element.hidden;

  element.addEventListener('pointerdown', (event) => {
    if (event.target === element) close();
  });

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

  for (const type of ['pointerdown', 'pointerup', 'click', 'wheel']) {
    element.addEventListener(type, (event) => event.stopPropagation());
  }

  return { element, open, close, isOpen };
}
