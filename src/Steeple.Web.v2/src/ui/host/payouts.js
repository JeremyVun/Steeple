import { track } from '../../data/analytics.js';
import {
  finishMockPayouts,
  openPayoutDashboard,
  setPayoutOptIn,
  startPayouts,
  venuePayments,
} from '../../data/correspondence.js';
import { el, replaceChildren } from '../dom.js';

const STRIPE_HOSTS = new Set(['connect.stripe.com']);

export function stripeDestination(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' &&
      STRIPE_HOSTS.has(url.hostname) &&
      !url.username &&
      !url.password &&
      !url.port
      ? url.href
      : null;
  } catch {
    return null;
  }
}

function statusOf(state) {
  if (state?.status) return state.status;
  if (state?.payoutsEnabled) return 'ready';
  return state?.onboardingStarted ? 'incomplete' : 'notStarted';
}

function requirementLabel(value) {
  const words = String(value ?? '')
    .split('.')
    .filter(Boolean)
    .map((part) => part.replaceAll('_', ' '));
  if (!words.length) return 'More information';
  const label = words.join(': ');
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function createPayoutScreen({ announce, onDone } = {}) {
  let venueId = null;
  let venueName = '';
  let mode = 'onboarding';
  let state = null;
  let busy = false;
  let problem = '';
  let mockStarted = false;
  let opener = null;
  let generation = 0;

  const body = el('div', { class: 'payoutscreen__body' });
  const title = el('h2', { class: 'payoutscreen__title', text: 'Set up payouts' });
  const sheet = el(
    'section',
    {
      class: 'payoutscreen',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': 'payoutscreen-title',
      tabindex: '-1',
    },
    [el('p', { class: 'eyebrow', text: 'Payouts' }), title, body]
  );
  title.id = 'payoutscreen-title';
  const element = el('div', { class: 'modal__layer payoutscreen__layer', hidden: true }, [sheet]);

  const note = () =>
    problem
      ? el('p', { class: 'identity__problem', role: 'alert' }, [
          el('span', { 'aria-hidden': 'true', text: '⚠ ' }),
          problem,
        ])
      : null;

  const action = (label, onclick, { primary = false, name = null } = {}) =>
    el(
      'button',
      {
        type: 'button',
        class: primary ? 'pill pill--primary' : 'linkish',
        ...(name ? { dataset: { action: name } } : {}),
        onclick,
      },
      label
    );

  function requirements() {
    if (!state?.requirementsDue?.length) return null;
    return el('div', { class: 'payoutscreen__requirements' }, [
      el('p', { class: 'prose prose--sm', text: 'Stripe still needs:' }),
      el('ul', { class: 'payoutscreen__list' }, state.requirementsDue.map((item) => el('li', { text: requirementLabel(item) }))),
    ]);
  }

  function preference() {
    const ready = statusOf(state) === 'ready';
    const canChange = ready || Boolean(state?.optedIn);
    const input = el('input', {
      type: 'checkbox',
      class: 'payoutscreen__check',
      checked: Boolean(state?.optedIn),
      disabled: !canChange || busy,
      onchange: (event) => savePreference(event.currentTarget.checked),
    });
    return el('label', { class: `payoutscreen__preference${canChange ? '' : ' is-disabled'}` }, [
      input,
      el('span', {}, [
        el('span', { class: 'payoutscreen__preference-title', text: 'Use online payments when available' }),
        el('span', {
          class: 'payoutscreen__preference-note',
          text: ready
            ? 'This saves your preference. Online booking payments are not active yet.'
            : state?.optedIn
              ? 'Online payments cannot start while Stripe setup needs attention. You can turn this preference off.'
              : 'Finish Stripe setup before saving this preference.',
        }),
      ]),
    ]);
  }

  function controls({ setup = false, refresh = true, backPrimary = false } = {}) {
    return el('div', { class: 'payoutscreen__actions' }, [
      setup
        ? action(statusOf(state) === 'notStarted' ? 'Set up with Stripe' : 'Continue setup', begin, {
            primary: true,
            name: 'payouts-start',
          })
        : null,
      mockStarted
        ? action('Complete test setup', finishMock, { primary: true, name: 'payouts-finish' })
        : null,
      refresh ? action('Refresh status', read, { name: 'payouts-refresh' }) : null,
      state?.canOpenDashboard
        ? action('Open Stripe dashboard', dashboard, { name: 'payouts-dashboard' })
        : null,
      action('Back to the desk', close, { primary: backPrimary }),
    ].filter(Boolean));
  }

  function onboardingContent() {
    const status = statusOf(state);
    const copy = {
      notStarted: ['Connect this venue to Stripe', 'Stripe collects your business and bank details on its secure site. Steeple stores your setup status.'],
      incomplete: ['Stripe setup is incomplete', 'Continue on Stripe to provide the remaining information. Returning to Steeple does not mark setup as complete.'],
      pending: ['Stripe is reviewing your details', 'Refresh this status after Stripe finishes its review.'],
      restricted: ['Stripe needs your attention', 'Open Stripe to review the account and provide anything it still needs.'],
      ready: ['Stripe setup is complete', `Stripe has accepted the setup details for ${venueName || 'this venue'}. Online booking payments are not active on Steeple.`],
    }[status] ?? ['Stripe setup needs attention', 'Refresh the status or continue setup on Stripe.'];
    title.textContent = copy[0];
    return [
      el('p', {
        class: `payoutscreen__status payoutscreen__status--${status}`,
        text: status === 'ready' ? 'Stripe setup ready' : status === 'notStarted' ? 'Not started' : copy[0],
      }),
      el('p', { class: 'prose prose--sm', text: copy[1] }),
      requirements(),
      state?.testMode
        ? el('p', { class: 'payoutscreen__test', text: 'Stripe is in test mode. No real money can move.' })
        : null,
      preference(),
      note(),
      controls({ setup: ['notStarted', 'incomplete', 'restricted'].includes(status) }),
    ];
  }

  function legacyContent() {
    title.textContent = state?.payoutsEnabled ? 'Payouts are set up' : 'Set up payouts';
    if (state?.payoutsEnabled) {
      return [
        el('p', { class: 'verified' }, [
          el('span', { class: 'verified__dot', 'aria-hidden': 'true' }),
          'Payouts are set up',
        ]),
        el('p', { class: 'prose prose--sm', text: 'Payments are simulated on the test gateway. No real money can move.' }),
        note(),
        controls({ refresh: false, backPrimary: true }),
      ];
    }
    return [
      el('p', { class: 'prose prose--sm', text: 'This test setup simulates payout onboarding. It does not ask for bank, tax, or identity details.' }),
      note(),
      controls({ refresh: false }),
    ];
  }

  function preparing() {
    title.textContent = 'Set up payouts';
    return [
      el('p', {
        class: 'prose prose--sm',
        text: problem ? 'Stripe setup could not be checked.' : 'Checking Stripe setup…',
      }),
      note(),
      controls({ setup: problem && mode === 'legacy', refresh: Boolean(problem) && mode !== 'legacy' }),
    ];
  }

  function render() {
    sheet.classList.toggle('is-working', busy);
    const shown = state ? (mode === 'legacy' ? legacyContent() : onboardingContent()) : preparing();
    replaceChildren(body, shown.filter(Boolean));
    for (const control of body.querySelectorAll('button, input')) control.disabled = busy || control.disabled;
  }

  const isCurrent = (run, id) => generation === run && venueId === id && !element.hidden;

  async function read() {
    if (busy) return;
    const run = generation;
    const id = venueId;
    busy = true;
    problem = '';
    render();
    const answer = await venuePayments(id);
    if (!isCurrent(run, id)) return;
    busy = false;
    if (answer.ok) {
      state = answer.value;
      onDone?.(state);
    } else {
      problem = answer.problem;
    }
    render();
  }

  async function begin() {
    if (busy) return;
    const run = generation;
    const id = venueId;
    busy = true;
    problem = '';
    render();
    const opened = await startPayouts(id);
    if (!isCurrent(run, id)) return;
    busy = false;
    if (!opened.ok) {
      problem = opened.problem;
      render();
      return;
    }
    if (opened.value?.mock === true) {
      mockStarted = true;
      await read();
      return;
    }
    const destination = opened.value?.mock === false && stripeDestination(opened.value?.url);
    if (!destination) {
      problem = 'Stripe returned an invalid link. Refresh the status and try again.';
      render();
      return;
    }
    window.location.assign(destination);
  }

  async function finishMock() {
    if (busy || !mockStarted) return;
    const run = generation;
    const id = venueId;
    busy = true;
    problem = '';
    render();
    const answer = await finishMockPayouts(id);
    if (!isCurrent(run, id)) return;
    busy = false;
    if (!answer.ok) {
      problem = answer.problem;
      announce?.(answer.problem);
    } else {
      state = answer.value;
      mockStarted = false;
      announce?.('Test payout setup is complete.');
      onDone?.(state);
    }
    render();
  }

  async function savePreference(optedIn) {
    if (busy) return;
    const run = generation;
    const id = venueId;
    busy = true;
    problem = '';
    render();
    const answer = await setPayoutOptIn(id, optedIn);
    if (!isCurrent(run, id)) return;
    busy = false;
    if (answer.ok) {
      state = answer.value;
      announce?.(optedIn ? 'Online payment preference saved.' : 'Online payment preference turned off.');
      onDone?.(state);
    } else {
      problem = answer.problem;
      const refreshed = await venuePayments(id);
      if (!isCurrent(run, id)) return;
      if (refreshed.ok) state = refreshed.value;
    }
    render();
  }

  async function dashboard() {
    if (busy) return;
    const run = generation;
    const id = venueId;
    busy = true;
    problem = '';
    render();
    const answer = await openPayoutDashboard(id);
    if (!isCurrent(run, id)) return;
    busy = false;
    if (!answer.ok) {
      problem = answer.problem;
      render();
      return;
    }
    const destination = answer.value?.mock === false && stripeDestination(answer.value?.url);
    if (!destination) {
      problem = 'Stripe returned an invalid dashboard link. Try again.';
      render();
      return;
    }
    window.location.assign(destination);
  }

  function open({ id, name, paymentMode = 'onboarding', returnAction = null } = {}, from = null) {
    generation += 1;
    busy = false;
    track('payout_step_opened', {
      state: returnAction ? 'onboarding' : 'prompt',
      ...(returnAction ? { returnAction } : {}),
    });
    venueId = id;
    venueName = name ?? '';
    mode = paymentMode;
    state = null;
    problem = '';
    mockStarted = false;
    opener = from ?? document.activeElement;
    element.hidden = false;
    void element.offsetHeight;
    element.classList.add('is-open');
    render();
    sheet.focus();
    if (returnAction === 'refresh') begin();
    else if (mode === 'legacy' && !returnAction) begin();
    else read();
  }

  function close() {
    if (element.hidden) return;
    generation += 1;
    busy = false;
    element.classList.remove('is-open');
    element.hidden = true;
    opener?.focus?.();
    opener = null;
    venueId = null;
    venueName = '';
    state = null;
    problem = '';
    mockStarted = false;
  }

  const isOpen = () => !element.hidden;

  element.addEventListener('pointerdown', (event) => {
    if (event.target === element) close();
  });
  window.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !isOpen()) return;
    event.preventDefault();
    event.stopPropagation();
    close();
  }, { capture: true });
  for (const type of ['pointerdown', 'pointerup', 'click', 'wheel']) {
    element.addEventListener(type, (event) => event.stopPropagation());
  }

  return { element, open, close, isOpen };
}
