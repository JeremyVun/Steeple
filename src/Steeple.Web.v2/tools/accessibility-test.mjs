// Focused WCAG smoke over browse, room detail, inbox, and opened correspondence.
// Starts its own flat dev server and supplies only the identity response needed
// to reach private correspondence; no external API or database is required.

import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { AxePuppeteer } from '@axe-core/puppeteer';
import puppeteer from 'puppeteer';

const port = await new Promise((resolve, reject) => {
  const probe = createServer();
  probe.once('error', reject);
  probe.listen(0, '127.0.0.1', () => {
    const address = probe.address();
    probe.close(() => resolve(address.port));
  });
});
const origin = `http://127.0.0.1:${port}`;
const vite = spawn(
  process.execPath,
  ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
  { env: { ...process.env, VITE_WORLD: 'off', VITE_DEBUG: 'on' }, stdio: ['ignore', 'pipe', 'pipe'] }
);

let browser;
const stop = () => {
  browser?.close().catch(() => {});
  vite.kill('SIGTERM');
};
process.on('exit', stop);
process.on('SIGINT', () => process.exit(130));

async function waitForServer() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      if ((await fetch(origin)).ok) return;
    } catch {
      // Vite is still opening its socket.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('accessibility server did not start');
}

await waitForServer();
browser = await puppeteer.launch({ headless: true, pipe: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
await page.setRequestInterception(true);
page.on('request', (request) => {
  const url = new URL(request.url());
  if (!url.pathname.startsWith('/api/')) return request.continue();
  if (url.pathname.endsWith('/auth/sessions') && request.method() === 'POST') {
    return request.respond({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        accessToken: 'a11y-access',
        user: {
          id: '11111111-1111-1111-1111-111111111111',
          displayName: 'Accessibility Reader',
          email: 'reader@example.test',
          createdAtUtc: '2026-01-01T00:00:00Z',
        },
      }),
    });
  }
  return request.respond({ status: 503, contentType: 'application/json', body: '{}' });
});

await page.goto(`${origin}/browse?world=off`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.__steepleReady === true', { timeout: 20000 });
await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important}' });
await page.waitForSelector('.browse');

let failures = 0;
async function audit(name, selector) {
  await page.waitForSelector(selector, { visible: true, timeout: 10000 });
  await new Promise((resolve) => setTimeout(resolve, 100));
  const results = await new AxePuppeteer(page)
    .include(selector)
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  const violations = results.violations.filter((item) => item.impact === 'critical' || item.impact === 'serious');
  if (!violations.length) {
    console.log(`ok    ${name}`);
    return;
  }
  failures += violations.length;
  for (const violation of violations) {
    console.error(`FAIL  ${name}: ${violation.id} — ${violation.help}`);
    for (const node of violation.nodes) {
      console.error(`      ${node.target.join(' ')} — ${node.failureSummary.replace(/\s+/g, ' ')}`);
    }
  }
}

await audit('browse', '.browse');

await page.evaluate(() => {
  window.__steeple.setView('room', {
    venueId: 'grace-community-vienna',
    roomId: 'fellowship-hall',
  });
});
await audit('room sheet', '.sheet--room');

await page.evaluate(async () => {
  await window.__steeple.session.signIn({ email: 'reader@example.test', displayName: 'Accessibility Reader' });
  window.__steeple.store.mirrorApplication({
    id: 'a11y-application',
    venueSlug: 'grace-community-vienna',
    venueName: 'Grace Community',
    roomSlug: 'fellowship-hall',
    roomName: 'Fellowship Hall',
    roomId: '22222222-2222-2222-2222-222222222222',
    organizer: {
      id: '11111111-1111-1111-1111-111111111111',
      displayName: 'Accessibility Reader',
    },
    organizationName: 'Neighbourhood Reading Group',
    activityType: 'community',
    groupSize: 12,
    intentText: 'A weekly reading group for neighbours.',
    status: 'pending',
    schedule: {
      frequency: 'oneOff',
      startDate: '2026-09-10',
      endDate: '2026-09-10',
      daysOfWeek: null,
      startTime: '18:00',
      endTime: '20:00',
    },
    createdAtUtc: '2026-08-09T00:00:00Z',
    expiresAtUtc: '2026-08-23T00:00:00Z',
    messages: [],
    counterOffer: null,
  }, { thread: true });
  window.__steeple.setMode('guest');
  window.__steeple.setView('journal');
});
await audit('inbox', '.guest__surface--journal');

await page.evaluate(() => {
  window.__steeple.setView('letter', {
    applicationId: 'a11y-application',
    venueId: 'grace-community-vienna',
    roomId: 'fellowship-hall',
  });
});
await audit('letter', '.guest__surface--opened');

await browser.close();
browser = null;
vite.kill('SIGTERM');
process.exitCode = failures ? 1 : 0;
