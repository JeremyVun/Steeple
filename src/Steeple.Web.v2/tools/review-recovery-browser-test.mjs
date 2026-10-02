#!/usr/bin/env node

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import puppeteer from 'puppeteer';

const port = await new Promise((resolve) => {
  const probe = createServer();
  probe.listen(0, '127.0.0.1', () => {
    const found = probe.address().port;
    probe.close(() => resolve(found));
  });
});
const origin = `http://127.0.0.1:${port}`;
const profile = await mkdtemp(join(tmpdir(), 'steeple-review-recovery-browser-'));
const vite = spawn(
  process.execPath,
  ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
  { env: { ...process.env, VITE_WORLD: 'off', VITE_DEBUG: 'on' }, stdio: ['ignore', 'ignore', 'pipe'] }
);
let viteError = '';
vite.stderr.on('data', (chunk) => {
  viteError += chunk;
});

let browser = null;
let mode = 'outage';
let searches = [];

function room(number) {
  return {
    roomId: `room-${number}`,
    venueId: `venue-${number}`,
    roomSlug: `room-${number}`,
    venueSlug: `venue-${number}`,
    roomName: `Room ${number}`,
    venueName: `Venue ${number}`,
    suburb: 'Arlington',
    primaryPhotoUrl: null,
    capacity: 20,
    pricePerHour: 40,
    currency: 'USD',
    latitude: 38.9,
    longitude: -77.1,
    activities: [],
    amenities: [],
    accessibility: [],
  };
}

function response(request, body, status = 200, headers = {}) {
  return request.respond({
    status,
    contentType: 'application/json',
    headers,
    body: JSON.stringify(body),
  });
}

async function intercept(request) {
  const url = new URL(request.url());
  if (url.origin !== origin || !url.pathname.startsWith('/api/')) return request.continue();
  const path = url.pathname.replace('/api/v1', '');
  if (path === '/flags') return response(request, {});
  if (path === '/auth/refresh') return response(request, { code: 'invalid_refresh_token' }, 401);
  if (path === '/suburbs') return response(request, []);
  if (path === '/geofence') {
    return response(request, {
      areaName: 'Arlington',
      center: { latitude: 38.9, longitude: -77.1 },
      beachhead: { south: 38, north: 40, west: -78, east: -76 },
    });
  }
  if (path === '/listings/search') {
    const page = Number(url.searchParams.get('page') ?? '1');
    searches.push(page);
    if (mode === 'outage') return response(request, { code: 'temporarily_unavailable' }, 500);
    if (mode === 'rate-limited') {
      return response(request, { code: 'rate_limited' }, 429, { 'retry-after': '60' });
    }
    const total = mode === 'partial' ? 1001 : 101;
    const first = (page - 1) * 100;
    const items = Array.from({ length: Math.max(0, Math.min(100, total - first)) }, (_, index) => room(first + index + 1));
    return response(request, { items, totalCount: total, page, pageSize: 100 });
  }
  if (path === '/events') return request.respond({ status: 204 });
  return response(request, { items: [], totalCount: 0, page: 1, pageSize: 100 });
}

async function waitForServer() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      if ((await fetch(origin)).ok) return;
    } catch {
      // Vite has not bound its owned port yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Vite did not start at ${origin}: ${viteError}`);
}

async function openBrowse() {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await page.setRequestInterception(true);
  page.on('request', (request) => void intercept(request).catch(() => {}));
  await page.goto(`${origin}/browse?world=off`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('window.__steepleReady === true');
  return page;
}

async function waitFor(page, predicate) {
  await page.waitForFunction(predicate, { timeout: 20000 });
}

try {
  await waitForServer();
  browser = await puppeteer.launch({
    headless: true,
    pipe: true,
    userDataDir: profile,
    args: ['--no-sandbox', '--lang=en-US'],
  });

  mode = 'outage';
  searches = [];
  {
    const page = await openBrowse();
    await waitFor(page, 'document.querySelector(".dm-trouble")?.hidden === false');
    assert.deepEqual(searches, [1]);
    mode = 'healthy';
    await page.click('.dm-trouble__again');
    await waitFor(page, 'document.querySelectorAll(".dm-row").length === 101');
    assert.deepEqual(searches, [1, 1, 2]);
    await page.close();
    console.log('ok  Retry asks a recovered catalogue immediately and renders both pages');
  }

  mode = 'rate-limited';
  searches = [];
  {
    const page = await openBrowse();
    await waitFor(page, 'document.querySelector(".dm-trouble")?.hidden === false');
    assert.deepEqual(searches, [1]);
    mode = 'healthy';
    await page.click('.dm-trouble__again');
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.deepEqual(searches, [1]);
    await page.close();
    console.log('ok  Retry respects a server rate-limit cooldown');
  }

  mode = 'partial';
  searches = [];
  {
    const page = await openBrowse();
    await waitFor(page, 'document.querySelector(".dm-count")?.textContent.includes("Showing 1000 of 1001 spaces")');
    assert.deepEqual(searches, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    await page.close();
    console.log('ok  A bounded discovery result declares its exact total');
  }
} finally {
  await browser?.close();
  vite.kill('SIGTERM');
  await rm(profile, { recursive: true, force: true });
}
