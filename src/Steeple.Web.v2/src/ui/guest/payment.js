// THE CARD STEP — the plainest honest version of "steeple needs a way to pay".
//
// A venue is booked with money now (docs/contracts/payments.md), so every
// request needs a method on file before it can be sent: without one the submit
// answers 402 and this step is what the sheet opens instead of failing. The same
// step, in different words, is how a card is replaced later — after a failed
// charge, or when the old one expires.
//
// It is deliberately minimal, and it is deliberately not a card form. Under the
// mock gateway steeple records display data only — the brand and the last four
// digits — and there is no field anywhere in this app or that API that a card
// number could travel in. **Never add one here.** When Stripe arrives, the
// `clientSecret` and `publishableKey` this step already receives feed Elements,
// Elements owns the number, and `saveMockCard` retires with the mock.
//
//   createCardStep({ announce, onSaved, onCancel, words }) -> { element, open, reset, focus, setMethod }
//
// `open()` asks steeple for the setup intent; `onSaved` runs once the method is
// recorded, which is the caller's cue to try its send again.

import { paymentState, saveMockCard, startCardSetup } from '../../data/correspondence.js';
import { el, replaceChildren } from '../dom.js';

const BRANDS = ['Visa', 'Mastercard', 'American Express', 'Discover'];

// The words belong to the moment, not to the step. Before a request goes out it
// is a gate; from the account or after a failed charge it is a replacement, and
// telling somebody a payment method "is needed first" when they already have one
// on file is telling them something untrue.
const GATE_WORDS = {
  eyebrow: 'Before you send',
  title: 'A payment method is needed first',
  blurb:
    'Venues here are paid by the hour, so Steeple keeps a card on file before a request goes out. Nothing is charged until a booking is confirmed.',
  save: 'Save and send',
  cancel: 'Back to your request',
};

const REPLACE_WORDS = {
  eyebrow: 'Your payment method',
  title: 'Use a different card',
  blurb:
    'Steeple keeps one card on file. Saving another replaces it, and every booking you already hold charges to the new one from now on.',
  save: 'Save this card',
  cancel: 'Keep the card I have',
};

export { GATE_WORDS, REPLACE_WORDS };

/** "Visa ···· 4242" — the whole of what Steeple knows about a card. */
export function cardLine(method) {
  if (!method?.brand || !method?.last4) return null;
  return `${method.brand} ···· ${method.last4}`;
}

export function createCardStep({ announce, onSaved, onCancel, words = GATE_WORDS } = {}) {
  const say = { ...GATE_WORDS, ...words };
  let clientSecret = null;
  let busy = false;
  let problem = '';
  let opening = false;
  // The card steeple already holds, when this step has been told about one.
  let method = null;

  const body = el('div', { class: 'identity__body' });
  const heading = el('h2', { class: 'identity__title', text: say.title });
  const blurb = el('p', { class: 'prose prose--sm', text: say.blurb });
  const element = el(
    'section',
    { class: 'identity identity--card', tabindex: '-1', 'aria-label': 'A way to pay' },
    [el('p', { class: 'eyebrow', text: say.eyebrow }), heading, blurb, body]
  );

  const brand = el('input', {
    class: 'field__input',
    id: 'card-brand',
    type: 'text',
    list: 'card-brands',
    autocomplete: 'off',
    placeholder: 'Visa',
  });
  const brands = el(
    'datalist',
    { id: 'card-brands' },
    BRANDS.map((name) => el('option', { value: name }))
  );
  const last4 = el('input', {
    class: 'field__input',
    id: 'card-last4',
    type: 'text',
    inputmode: 'numeric',
    maxlength: '4',
    autocomplete: 'off',
    placeholder: '4242',
  });

  const submit = el('button', { type: 'submit', class: 'pill pill--primary' }, say.save);

  const form = el('form', { class: 'identity__form cardform', novalidate: true }, [
    el('div', { class: 'field' }, [
      el('label', { class: 'field__label', for: 'card-brand', text: 'Card' }),
      brand,
      brands,
    ]),
    el('div', { class: 'field' }, [
      el('label', { class: 'field__label', for: 'card-last4', text: 'Last four digits' }),
      last4,
    ]),
    submit,
  ]);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    save();
  });

  async function save() {
    if (busy) return;
    const digits = last4.value.trim();
    const name = brand.value.trim() || BRANDS[0];
    if (!/^\d{4}$/.test(digits)) {
      problem = 'The last four digits, as four digits.';
      render();
      last4.focus();
      return;
    }
    if (!clientSecret) {
      const reopened = await open();
      if (!reopened) return;
    }
    busy = true;
    problem = '';
    render();
    const answer = await saveMockCard({ clientSecret, brand: name, last4: digits });
    busy = false;
    if (!answer.ok) {
      problem = answer.problem;
      render();
      announce?.(problem);
      return;
    }
    method = answer.value?.method ?? { brand: name, last4: digits };
    // Spent: a setup intent is confirmed once, and a second save opens another.
    clientSecret = null;
    announce?.(`${name} ending ${digits} saved.${onSaved ? ' Sending your request.' : ''}`);
    render();
    onSaved?.(answer.value);
  }

  function note() {
    return problem ? el('p', { class: 'identity__problem', role: 'alert', text: problem }) : null;
  }

  /** The card on file, printed as the only two things Steeple knows about it. */
  function held() {
    const line = cardLine(method);
    if (!line) return null;
    return el('div', { class: 'cardheld' }, [
      el('span', { class: 'cardheld__mark', 'aria-hidden': 'true' }),
      el('div', { class: 'cardheld__body' }, [
        el('span', { class: 'cardheld__brand', text: line }),
        el('span', { class: 'cardheld__note', text: 'On file with Steeple' }),
      ]),
    ]);
  }

  function render() {
    element.classList.toggle('is-signing', busy || opening);
    heading.textContent = say.title;
    blurb.textContent = say.blurb;
    submit.textContent = say.save;
    replaceChildren(body, [
      held(),
      form,
      el('p', {
        class: 'identity__fineprint',
        text: 'Steeple never sees or stores a full card number — only the brand and the last four digits, so you can tell your cards apart.',
      }),
      note(),
      el('div', { class: 'identity__actions identity__actions--quiet' }, [
        onCancel
          ? el('button', { type: 'button', class: 'linkish', onclick: () => onCancel() }, say.cancel)
          : null,
      ].filter(Boolean)),
    ].filter(Boolean));
    // Set from the flag, never only to true: the form node survives a redraw,
    // so a control disabled while waiting stays disabled unless it is told.
    const busyNow = busy || opening;
    for (const control of body.querySelectorAll('button, input')) control.disabled = busyNow;
  }

  /** Ask steeple to open the setup intent. False when it could not. */
  async function open() {
    opening = true;
    render();
    const answer = await startCardSetup();
    opening = false;
    if (!answer.ok) {
      problem = answer.problem;
      clientSecret = null;
      render();
      return false;
    }
    clientSecret = answer.value.clientSecret;
    problem = '';
    render();
    return true;
  }

  /** Ask steeple what card it holds, so this step can print it. Best effort. */
  async function readMethod() {
    const answer = await paymentState();
    if (!answer.ok) return null;
    method = answer.value?.method ?? null;
    render();
    return method;
  }

  render();

  return {
    element,
    open,
    readMethod,
    setMethod(next) {
      method = next ?? null;
      render();
    },
    reset() {
      problem = '';
      busy = false;
      clientSecret = null;
      brand.value = '';
      last4.value = '';
      render();
    },
    focus: () => element.focus(),
  };
}
