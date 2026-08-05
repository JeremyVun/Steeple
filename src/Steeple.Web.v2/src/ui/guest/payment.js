// THE CARD STEP — the plainest honest version of "steeple needs a way to pay".
//
// A venue is booked with money now (docs/contracts/payments.md), so every
// request needs a method on file before it can be sent: without one the submit
// answers 402 and this step is what the sheet opens instead of failing.
//
// It is deliberately minimal, and it is deliberately not a card form. Under the
// mock gateway steeple records display data only — the brand and the last four
// digits — and there is no field anywhere in this app or that API that a card
// number could travel in. **Never add one here.** When Stripe arrives, the
// `clientSecret` and `publishableKey` this step already receives feed Elements,
// Elements owns the number, and `saveMockCard` retires with the mock.
//
//   createCardStep({ announce, onSaved, onCancel }) -> { element, open, reset, focus }
//
// `open()` asks steeple for the setup intent; `onSaved` runs once the method is
// recorded, which is the caller's cue to try its send again.

import { saveMockCard, startCardSetup } from '../../data/correspondence.js';
import { el, replaceChildren } from '../dom.js';

const BRANDS = ['Visa', 'Mastercard', 'American Express', 'Discover'];

export function createCardStep({ announce, onSaved, onCancel }) {
  let clientSecret = null;
  let busy = false;
  let problem = '';
  let opening = false;

  const body = el('div', { class: 'identity__body' });
  const element = el(
    'section',
    { class: 'identity identity--card', tabindex: '-1', 'aria-label': 'A way to pay' },
    [
      el('p', { class: 'eyebrow', text: 'Before you send' }),
      el('h2', { class: 'identity__title', text: 'A payment method is needed first' }),
      el('p', {
        class: 'prose prose--sm',
        text: 'Venues here are paid by the hour, so steeple keeps a card on file before a request goes out. Nothing is charged until a booking is confirmed.',
      }),
      body,
    ]
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

  const form = el('form', { class: 'identity__form', novalidate: true }, [
    el('div', { class: 'field' }, [
      el('label', { class: 'field__label', for: 'card-brand', text: 'Card' }),
      brand,
      brands,
    ]),
    el('div', { class: 'field' }, [
      el('label', { class: 'field__label', for: 'card-last4', text: 'Last four digits' }),
      last4,
    ]),
    el('button', { type: 'submit', class: 'pill pill--primary' }, 'Save and send'),
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
    announce?.(`${name} ending ${digits} saved. Sending your request.`);
    render();
    onSaved?.(answer.value);
  }

  function note() {
    return problem ? el('p', { class: 'identity__problem', role: 'alert', text: problem }) : null;
  }

  function render() {
    element.classList.toggle('is-signing', busy || opening);
    replaceChildren(body, [
      form,
      el('p', {
        class: 'identity__fineprint',
        text: 'Steeple never sees or stores a full card number — only the brand and the last four digits, so you can tell your cards apart.',
      }),
      note(),
      el('div', { class: 'identity__actions identity__actions--quiet' }, [
        onCancel
          ? el('button', { type: 'button', class: 'linkish', onclick: () => onCancel() }, 'Back to your request')
          : null,
      ].filter(Boolean)),
    ]);
    // Set from the flag, never only to true: the form node survives a redraw,
    // so a control disabled while waiting stays disabled unless it is told.
    const held = busy || opening;
    for (const control of body.querySelectorAll('button, input')) control.disabled = held;
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

  render();

  return {
    element,
    open,
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
