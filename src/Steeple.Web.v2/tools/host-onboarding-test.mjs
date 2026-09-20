// Host Stripe onboarding through real browser input against disposable host venues.
// Payment responses are controlled at the browser boundary so no Stripe key is needed.

import {
  agreeCurrent,
  closeBrowsers,
  isEnvironmentNoise,
  launch,
  mintVenue,
  signInPage,
  stamp,
} from './fixtures.mjs';

const startUrl = new URL(process.argv[2] ?? 'http://localhost:5173/?q=low&world=off');
const prefix = startUrl.pathname.endsWith('/') ? startUrl.pathname : `${startUrl.pathname}/`;
const appUrl = (path, query = '') => new URL(`${prefix}${path.replace(/^\//, '')}${query}`, startUrl.origin).href;

let checks = 0;
let failures = 0;
const problems = [];
const screenshotPath = process.env.STEEPLE_SHOT ?? null;

function check(label, value, detail = '') {
  checks += 1;
  if (!value) failures += 1;
  console.log(`${value ? '  ok  ' : ' FAIL '} ${label}${detail ? ` — ${detail}` : ''}`);
}

async function until(page, predicate, argument = null, label = 'condition') {
  try {
    await page.waitForFunction(predicate, { timeout: 30000, polling: 100 }, argument);
  } catch {
    const snapshot = await page.evaluate(() => ({
      url: location.href,
      view: window.__steeple?.state?.view ?? null,
      signedIn: window.__steeple?.session?.isSignedIn?.() ?? false,
      text: document.querySelector('.hostdesk')?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 500) ?? '',
    })).catch(() => null);
    throw new Error(`timed out waiting for ${label}${snapshot ? ` — ${JSON.stringify(snapshot)}` : ''}`);
  }
}

async function untilNode(predicate, label) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`timed out waiting for ${label}`);
}

async function press(page, selector) {
  await page.waitForSelector(selector, { visible: true, timeout: 30000 });
  await page.click(selector);
}

const state = (status, extra = {}) => ({
  onboardingStarted: status !== 'notStarted',
  detailsSubmitted: ['pending', 'restricted', 'ready'].includes(status),
  chargesEnabled: status === 'ready',
  payoutsEnabled: status === 'ready',
  optedIn: false,
  dashboardUrl: null,
  mock: false,
  status,
  requirementsDue: status === 'incomplete' ? ['business_profile.url'] : [],
  disabledReason: status === 'restricted' ? 'Stripe needs updated business details.' : null,
  testMode: true,
  canOpenDashboard: status === 'ready',
  onlinePaymentsAvailable: false,
  ...extra,
});

const email = `host-onboarding-${stamp}@example.test`;
const first = await mintVenue({
  email,
  name: 'Stripe Host',
  venueName: `Stripe Hall A ${stamp}`,
  roomName: 'Meeting room',
});
const second = await mintVenue({
  email,
  name: 'Stripe Host',
  venueName: `Stripe Hall B ${stamp}`,
  roomName: 'Community room',
});
await agreeCurrent(second.token);

const states = new Map([
  [first.venueId, state('incomplete')],
  [second.venueId, state('ready')],
]);
const paymentCalls = [];
const external = [];
let failStart = false;
let mockStart = false;
let unsafeStart = false;
let delayReadVenue = null;
const delayedReads = [];
let delayDashboard = false;
let delayedDashboard = null;
let expectedUnavailableError = false;

try {
  const browser = await launch();
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  page.on('pageerror', (error) => problems.push(error.message));
  page.on('console', (message) => {
    if (message.type() !== 'error' || isEnvironmentNoise(message)) return;
    if (expectedUnavailableError && /503 \(Service Unavailable\)/.test(message.text())) {
      expectedUnavailableError = false;
      return;
    }
    problems.push(message.text());
  });
  await page.setRequestInterception(true);
  page.on('request', async (request) => {
    const url = new URL(request.url());
    if (url.hostname === 'connect.stripe.com' || url.hostname === 'express.stripe.com') {
      external.push(url.href);
      return void request.abort();
    }
    if (!url.pathname.includes('/api/v1/')) return void request.continue();
    if (url.pathname.endsWith('/api/v1/flags')) {
      return void request.respond({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ 'payments.enabled': false, 'payments.onboarding': true }),
      });
    }
    const match = url.pathname.match(/\/manage\/venues\/([^/]+)\/payments(?:\/(.*))?$/);
    if (!match) return void request.continue();
    const venueId = decodeURIComponent(match[1]);
    const operation = match[2] ?? '';
    paymentCalls.push({ method: request.method(), venueId, operation, authenticated: request.headers().authorization?.startsWith('Bearer ') === true });
    const respond = (body, status = 200) => request.respond({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (request.method() === 'GET') {
      if (delayReadVenue === venueId) {
        delayReadVenue = null;
        delayedReads.push({ request, body: states.get(venueId) ?? state('notStarted') });
        return;
      }
      return void respond(states.get(venueId) ?? state('notStarted'));
    }
    if (operation === 'onboarding/mock-complete') {
      const ready = state('ready', { optedIn: true, mock: true, canOpenDashboard: false });
      states.set(venueId, ready);
      return void respond(ready);
    }
    if (operation === 'onboarding') {
      if (failStart) {
        failStart = false;
        return void respond({ code: 'payment_provider_unavailable', detail: 'Stripe is unavailable right now. Try again.' }, 503);
      }
      if (mockStart) {
        mockStart = false;
        states.set(venueId, state('incomplete', { mock: true }));
        return void respond({ url: 'mock-onboarding:acct_mock_test', mock: true });
      }
      if (unsafeStart) {
        unsafeStart = false;
        return void respond({ url: 'https://connect.stripe.com.evil.test/setup', mock: false });
      }
      return void respond({ url: 'https://connect.stripe.com/setup/test', mock: false });
    }
    if (operation === 'opt-in') {
      const held = states.get(venueId);
      const optedIn = JSON.parse(request.postData() ?? '{}').optedIn === true;
      if (held?.status !== 'ready' && optedIn) return void respond({ code: 'payment_account_not_ready', detail: 'Finish Stripe setup before choosing online payments.' }, 409);
      const updated = { ...held, optedIn };
      states.set(venueId, updated);
      return void respond(updated);
    }
    if (operation === 'dashboard') {
      if (delayDashboard) {
        delayDashboard = false;
        delayedDashboard = request;
        return;
      }
      return void respond({ url: 'https://connect.stripe.com/express/test', mock: false });
    }
    return void respond({}, 404);
  });

  await page.goto(startUrl.href, { waitUntil: 'domcontentloaded' });
  await until(page, () => window.__steepleReady === true, null, 'app boot');
  await signInPage(page, email, 'Stripe Host');

  await page.goto(
    appUrl(`/desk/${first.venueSlug}`, `?q=low&world=off&paymentVenue=${first.venueId}&paymentReturn=return`),
    { waitUntil: 'domcontentloaded' }
  );
  await until(page, () => /Stripe setup is incomplete/.test(document.querySelector('.payoutscreen')?.textContent ?? ''), null, 'incomplete return');
  check('a return restores the session before reading Stripe state', paymentCalls.some((call) => call.venueId === first.venueId && call.method === 'GET' && call.authenticated));
  check('the return marker is consumed once', !new URL(page.url()).searchParams.has('paymentReturn'), page.url());
  check('an incomplete return is not treated as completion', await page.$eval('.payoutscreen', (node) => /Continue setup/.test(node.textContent) && !/Stripe setup ready/.test(node.textContent)));

  delayReadVenue = first.venueId;
  await press(page, '[data-action="payouts-refresh"]');
  await untilNode(() => delayedReads.length === 1, 'delayed first-venue read');
  await page.keyboard.press('Escape');
  await page.select('#desk-venue', second.venueSlug);
  await until(page, () => document.querySelector('.desk [data-action="payouts"]')?.textContent === 'Manage payouts', null, 'second venue selection');
  await press(page, '.desk [data-action="payouts"]');
  await until(page, () => /Stripe setup ready/.test(document.querySelector('.payoutscreen')?.textContent ?? ''), null, 'second venue payout screen');
  const delayedRead = delayedReads.shift();
  await delayedRead.request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(delayedRead.body) });
  await new Promise((resolve) => setTimeout(resolve, 200));
  check('a late read cannot replace a reopened venue', await page.$eval('.payoutscreen', (node) => /Stripe setup ready/.test(node.textContent) && !/Stripe setup is incomplete/.test(node.textContent)));

  unsafeStart = true;
  await page.goto(
    appUrl(`/desk/${first.venueSlug}`, `?q=low&world=off&paymentVenue=${first.venueId}&paymentReturn=refresh`),
    { waitUntil: 'domcontentloaded' }
  );
  await until(page, () => /invalid link/.test(document.querySelector('[role="alert"]')?.textContent ?? ''), null, 'unsafe URL refusal');
  check('a Stripe-looking subdomain is not opened', external.length === 0);
  check('refresh asks for a fresh link only after authentication', paymentCalls.some((call) => call.venueId === first.venueId && call.operation === 'onboarding' && call.authenticated));
  check('a refresh marker is removed before retry', !new URL(page.url()).searchParams.has('paymentReturn'), page.url());

  await press(page, '[data-action="payouts-refresh"]');
  await until(page, () => Boolean(document.querySelector('[data-action="payouts-start"]')), null, 'incomplete refresh');
  await press(page, '[data-action="payouts-start"]');
  await untilNode(() => external.length > 0, 'Stripe redirect');
  check('continue setup follows an exact Stripe HTTPS destination', external.at(-1) === 'https://connect.stripe.com/setup/test');

  await page.goto(
    appUrl(`/desk/${first.venueSlug}`, `?q=low&world=off&paymentVenue=${second.venueId}&paymentReturn=return`),
    { waitUntil: 'domcontentloaded' }
  );
  await until(page, () => /Stripe setup ready/.test(document.querySelector('.payoutscreen')?.textContent ?? ''), null, 'ready return');
  check('the returned venue wins over the desk URL', new URL(page.url()).pathname.endsWith(`/desk/${second.venueSlug}`), page.url());
  check('the ready state says guest payments remain inactive', /Online booking payments are not active yet/.test(await page.$eval('.payoutscreen', (node) => node.textContent)));
  check('ready does not promise cross-border payout eligibility', !/can receive payouts/i.test(await page.$eval('.payoutscreen', (node) => node.textContent)));
  if (screenshotPath) await page.screenshot({ path: screenshotPath });

  await press(page, '.payoutscreen__check');
  await until(page, () => document.querySelector('.payoutscreen__check')?.checked === true, null, 'opt-in save');
  check('the preference is saved through the opt-in endpoint', states.get(second.venueId)?.optedIn === true);

  states.set(second.venueId, state('restricted', { optedIn: true, disabledReason: 'requirements.past_due' }));
  await press(page, '[data-action="payouts-refresh"]');
  await until(page, () => document.querySelector('.payoutscreen__check')?.checked === true && document.querySelector('.payoutscreen__check')?.disabled === false, null, 'readiness loss');
  check('readiness loss stays plain and does not expose provider codes', await page.$eval('.payoutscreen', (node) => /Stripe needs your attention/.test(node.textContent) && !/requirements\.past_due/.test(node.textContent)));
  await press(page, '.payoutscreen__check');
  await until(page, () => document.querySelector('.payoutscreen__check')?.checked === false, null, 'opt-out after readiness loss');
  check('an opted-in host can still opt out after readiness loss', states.get(second.venueId)?.optedIn === false);
  check('opting back in remains guarded until ready', await page.$eval('.payoutscreen__check', (node) => node.disabled === true));

  states.set(second.venueId, state('ready', { canOpenDashboard: true }));
  await press(page, '[data-action="payouts-refresh"]');
  await until(page, () => Boolean(document.querySelector('[data-action="payouts-dashboard"]')), null, 'dashboard action');
  await press(page, '[data-action="payouts-dashboard"]');
  await untilNode(() => external.some((url) => url.includes('/express/test')), 'dashboard redirect');
  check('the dashboard uses a fresh authenticated endpoint', paymentCalls.some((call) => call.operation === 'dashboard' && call.authenticated));

  states.set(second.venueId, state('incomplete'));
  await page.goto(appUrl(`/desk/${second.venueSlug}`), { waitUntil: 'domcontentloaded' });
  await until(page, () => Boolean(document.querySelector('[data-action="payouts"]')), null, 'desk payout action');
  await press(page, '[data-action="payouts"]');
  await until(page, () => Boolean(document.querySelector('[data-action="payouts-start"]')), null, 'onboarding screen');
  failStart = true;
  expectedUnavailableError = true;
  await press(page, '[data-action="payouts-start"]');
  await until(page, () => /Stripe is unavailable right now/.test(document.querySelector('[role="alert"]')?.textContent ?? ''), null, 'provider error');
  check('provider failures stay on the onboarding screen', new URL(page.url()).origin === startUrl.origin);

  mockStart = true;
  await press(page, '[data-action="payouts-start"]');
  await until(page, () => Boolean(document.querySelector('[data-action="payouts-finish"]')), null, 'mock completion action');
  check('the synthetic mock URL is never used as a destination', !external.some((url) => url.startsWith('mock-onboarding:')));
  await press(page, '[data-action="payouts-finish"]');
  await until(page, () => /Stripe setup ready/.test(document.querySelector('.payoutscreen')?.textContent ?? ''), null, 'mock ready state');

  states.set(second.venueId, state('ready', { canOpenDashboard: true }));
  await press(page, '[data-action="payouts-refresh"]');
  await until(page, () => Boolean(document.querySelector('[data-action="payouts-dashboard"]')), null, 'delayed dashboard action');
  const externalBeforeSignOut = external.length;
  delayDashboard = true;
  await press(page, '[data-action="payouts-dashboard"]');
  await untilNode(() => Boolean(delayedDashboard), 'delayed dashboard response');
  await page.evaluate(() => window.__steeple.session.signOut());
  await delayedDashboard.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ url: 'https://connect.stripe.com/express/stale', mock: false }) });
  await new Promise((resolve) => setTimeout(resolve, 200));
  check('sign-out closes and invalidates the payout screen', await page.$eval('.payoutscreen__layer', (node) => node.hidden));
  check('a dashboard answer after sign-out cannot redirect', external.length === externalBeforeSignOut);

  check('the flow works under the supplied deployment prefix', new URL(page.url()).pathname.startsWith(prefix));
  check('the page raised no unexpected errors', problems.length === 0, [...new Set(problems)].join(' | '));
} finally {
  await closeBrowsers();
}

console.log(`\n${checks - failures}/${checks} checks passed`);
process.exit(failures === 0 ? 0 : 1);
