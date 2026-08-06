// WHERE THE MONEY GOES — payout onboarding, honestly mocked.
//
// Steeple's payments rails are live machinery over a mock gateway
// (docs/contracts/payments.md): the endpoints, the states and the wire shapes
// are final, and only the gateway behind them is a stand-in. Onboarding is the
// one place that shows through, because the `url` steeple hands back
// (`mock-onboarding:acct_mock_…`) is deliberately **not navigable** — at
// Stripe-time it becomes the hosted account-link and is followed unchanged.
//
// So this screen exists, and it says what it is. It asks for nothing a bank
// would ask for: no account number, no tax id, no document — there is no field
// here that such a thing could travel in, exactly as there is none for a card
// number anywhere in this app. Finishing calls `…/onboarding/mock-complete`,
// which is the mock's one-step stand-in for hosted KYC plus the `account.updated`
// webhooks plus the opt-in switch.
//
//   createPayoutScreen({ announce, onDone }) -> { element, open, close, isOpen }

import { track } from '../../data/analytics.js';
import { finishMockPayouts, startPayouts, venuePayments } from '../../data/correspondence.js';
import { el, replaceChildren } from '../dom.js';

export function createPayoutScreen({ announce, onDone } = {}) {
  let venueId = null;
  let venueName = '';
  let state = null;
  let busy = false;
  let problem = '';
  let opener = null;

  const body = el('div', { class: 'payoutscreen__body' });
  const sheet = el(
    'section',
    {
      class: 'payoutscreen',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': 'Set up payouts',
      tabindex: '-1',
    },
    [
      el('p', { class: 'eyebrow', text: 'Payouts' }),
      el('h2', { class: 'payoutscreen__title', text: 'Where your bookings are paid out' }),
      body,
    ]
  );
  const element = el('div', { class: 'modal__layer payoutscreen__layer', hidden: true }, [sheet]);

  const note = () =>
    problem ? el('p', { class: 'identity__problem', role: 'alert', text: problem }) : null;

  function connected() {
    return [
      el('p', { class: 'verified' }, [
        el('span', { class: 'verified__dot', 'aria-hidden': 'true' }),
        'Payouts are set up',
      ]),
      el('p', {
        class: 'prose prose--sm',
        text: `${venueName || 'This venue'} can receive the money from its bookings. Payments run on Steeple’s test gateway for now, so nothing has actually moved yet — the moment the real one is connected, everything charged since is paid out on the normal schedule.`,
      }),
      note(),
      el('div', { class: 'payoutscreen__actions' }, [
        el('button', { type: 'button', class: 'pill pill--primary', onclick: () => close() }, 'Back to the desk'),
      ]),
    ];
  }

  function form() {
    return [
      el('p', {
        class: 'prose prose--sm',
        text: 'Steeple sends each booking’s payment on to the venue. Confirming here is all it takes while payments are on the test gateway — the real thing will ask your bank details on its own secure page, and Steeple will never see or hold them.',
      }),
      el('ul', { class: 'payoutscreen__list' }, [
        el('li', { text: 'Money from a booking is paid out to the venue, not held by Steeple.' }),
        el('li', { text: 'Cancelling a booking refunds the group in full, from the same account.' }),
        el('li', { text: 'You can change where payouts land at any time.' }),
      ]),
      note(),
      el('div', { class: 'payoutscreen__actions' }, [
        el(
          'button',
          {
            type: 'button',
            class: 'pill pill--primary',
            dataset: { action: 'payouts-finish' },
            onclick: () => finish(),
          },
          'Confirm and finish'
        ),
        el('button', { type: 'button', class: 'linkish', onclick: () => close() }, 'Not now'),
      ]),
      el('p', {
        class: 'payoutscreen__fineprint',
        text: 'Nothing on this screen is a bank detail, and there is no field here one could be typed into. Steeple’s payments are simulated until the real gateway is connected.',
      }),
    ];
  }

  /**
   * Before steeple has answered there is nothing to confirm — and finishing
   * onboarding that has not begun answers `400 invalid_payment`, which would be
   * this screen's own fault. So the way on does not exist until it can work.
   */
  function preparing() {
    return [
      el('p', { class: 'prose prose--sm', text: 'Opening this with Steeple…' }),
      note(),
      el('div', { class: 'payoutscreen__actions' }, [
        el('button', { type: 'button', class: 'linkish', onclick: () => close() }, 'Not now'),
      ]),
    ];
  }

  function render() {
    sheet.classList.toggle('is-working', busy);
    const shown = state?.payoutsEnabled ? connected() : state ? form() : preparing();
    replaceChildren(body, shown.filter(Boolean));
    // Set from the flag, never only to true: the sheet survives a redraw, so a
    // control disabled while waiting stays disabled unless it is told back.
    for (const control of body.querySelectorAll('button, input')) control.disabled = busy;
  }

  /** Begin — or resume — onboarding at steeple, then show the mock's own screen. */
  async function begin() {
    busy = true;
    problem = '';
    render();
    const opened = await startPayouts(venueId);
    if (!opened.ok) {
      problem = opened.problem;
      busy = false;
      render();
      return;
    }
    const read = await venuePayments(venueId);
    busy = false;
    if (read.ok) state = read.value;
    render();
  }

  async function finish() {
    if (busy) return;
    busy = true;
    problem = '';
    render();
    const answer = await finishMockPayouts(venueId);
    busy = false;
    if (!answer.ok) {
      problem = answer.problem;
      render();
      announce?.(answer.problem);
      return;
    }
    state = answer.value;
    render();
    announce?.('Payouts are set up. Payments are simulated until the real gateway is connected.');
    onDone?.(answer.value);
  }

  function open({ id, name } = {}, from = null) {
    track('payout_step_opened', { state: 'prompt' });
    venueId = id;
    venueName = name ?? '';
    state = null;
    problem = '';
    opener = from ?? document.activeElement;
    element.hidden = false;
    // A transition needs a frame to start from, and the layer has only just
    // been given one. Reading the layout is that frame.
    void element.offsetHeight;
    element.classList.add('is-open');
    render();
    sheet.focus();
    begin();
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
