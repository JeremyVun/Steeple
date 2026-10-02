#!/usr/bin/env node

import assert from 'node:assert/strict';

import * as api from '../src/data/api.js';

let checks = 0;

async function check(label, work) {
  await work();
  checks += 1;
  console.log(`ok  ${label}`);
}

function json(body, { status = 200, headers = {} } = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

function hangingJson(signal, onAbort, { status = 200, headers = {} } = {}) {
  const body = new ReadableStream({
    start(controller) {
      signal.addEventListener(
        'abort',
        () => {
          onAbort?.();
          controller.error(new DOMException('aborted', 'AbortError'));
        },
        { once: true }
      );
    },
  });
  return new Response(body, { status, headers: { 'content-type': 'application/json', ...headers } });
}

async function settled(work) {
  for (let attempt = 0; attempt < 24; attempt += 1) {
    if (work()) return;
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  assert.fail('the request did not reach its controlled state');
}

await check('read deadlines keep running while a successful body stalls', async () => {
  const nativeSetTimeout = globalThis.setTimeout;
  let deadline = null;
  let bodyAborted = false;
  globalThis.setTimeout = (callback, delay, ...args) => {
    if (delay === 4000) {
      deadline = () => callback(...args);
      return 1;
    }
    return nativeSetTimeout(callback, delay, ...args);
  };
  globalThis.fetch = async (_url, { signal }) => hangingJson(signal, () => {
    bodyAborted = true;
  });
  try {
    const pending = api.searchListings();
    await settled(() => deadline);
    deadline();
    await assert.rejects(pending, (error) => error.timedOut === true && error.aborted === false);
    assert.equal(bodyAborted, true);
  } finally {
    globalThis.setTimeout = nativeSetTimeout;
  }
});

await check('caller cancellation remains attached while a read body stalls', async () => {
  let bodyAborted = false;
  globalThis.fetch = async (_url, { signal }) => hangingJson(signal, () => {
    bodyAborted = true;
  });
  const controller = new AbortController();
  const pending = api.searchListings({}, { signal: controller.signal });
  await Promise.resolve();
  controller.abort();
  await assert.rejects(pending, (error) => error.aborted === true && error.timedOut === false);
  assert.equal(bodyAborted, true);
});

await check('write deadlines keep running while a successful body stalls', async () => {
  const nativeSetTimeout = globalThis.setTimeout;
  let deadline = null;
  let bodyAborted = false;
  globalThis.setTimeout = (callback, delay, ...args) => {
    if (delay === 15000) {
      deadline = () => callback(...args);
      return 1;
    }
    return nativeSetTimeout(callback, delay, ...args);
  };
  globalThis.fetch = async (_url, { signal }) => hangingJson(signal, () => {
    bodyAborted = true;
  });
  try {
    const pending = api.createSession({ provider: 'dev', idToken: 'body@example.com' });
    await settled(() => deadline);
    deadline();
    await assert.rejects(pending, (error) => error.timedOut === true && error.status === 0);
    assert.equal(bodyAborted, true);
  } finally {
    globalThis.setTimeout = nativeSetTimeout;
  }
});

await check('a stalled rate-limit body keeps its Retry-After for refresh recovery', async () => {
  const nativeSetTimeout = globalThis.setTimeout;
  let deadline = null;
  globalThis.setTimeout = (callback, delay, ...args) => {
    if (delay === 15000) {
      deadline = () => callback(...args);
      return 1;
    }
    return nativeSetTimeout(callback, delay, ...args);
  };
  globalThis.fetch = async (_url, { signal }) =>
    hangingJson(signal, () => {}, { status: 429, headers: { 'retry-after': '7' } });
  try {
    const pending = api.refreshSession();
    await settled(() => deadline);
    deadline();
    await assert.rejects(
      pending,
      (error) => error.timedOut === true && error.status === 0 && error.retryAfterMs === 7000
    );
  } finally {
    globalThis.setTimeout = nativeSetTimeout;
  }
});

const person = (id, name = 'Recovery Person') => ({
  accessToken: `access-${id}`,
  user: {
    id,
    displayName: name,
    email: `${id}@example.com`,
    createdAtUtc: '2026-10-02T00:00:00Z',
  },
  isNewUser: false,
});

await check('a rate-limited refresh retains the person and retries after Retry-After', async () => {
  const nativeSetTimeout = globalThis.setTimeout;
  let retry = null;
  let phase = 'boot';
  let refreshes = 0;
  globalThis.setTimeout = (callback, delay, ...args) => {
    if (delay === 7000) {
      retry = () => callback(...args);
      return 1;
    }
    return nativeSetTimeout(callback, delay, ...args);
  };
  globalThis.fetch = async (url, init = {}) => {
    if (url.endsWith('/auth/sessions') && init.method === 'POST') return json(person('signed-in'));
    if (url.endsWith('/auth/sessions') && init.method === 'DELETE') return new Response(null, { status: 204 });
    if (url.endsWith('/auth/refresh')) {
      refreshes += 1;
      if (phase === 'boot') return json({ code: 'invalid_refresh_token' }, { status: 401 });
      if (phase === 'limited') {
        return json({ code: 'rate_limited' }, { status: 429, headers: { 'retry-after': '7' } });
      }
      return json(person('refreshed'));
    }
    if (url.endsWith('/me')) return json(person('refreshed').user);
    throw new Error(`unexpected request ${url}`);
  };
  const session = await import('../src/data/session.js?review-recovery-session');
  try {
    await Promise.resolve();
    await session.signIn({ email: 'signed-in@example.com' });
    phase = 'limited';
    await assert.rejects(
      session.withAccess(async () => {
        throw new api.ApiError('expired', 401);
      }),
      (error) => error.status === 429 && error.retryAfterMs === 7000
    );
    assert.equal(session.currentUser()?.id, 'signed-in');
    assert.equal(session.isSignedIn(), true);
    await settled(() => retry);
    const before = refreshes;
    await session.fetchCurrentUser();
    assert.equal(refreshes, before);
    phase = 'healthy';
    retry();
    await settled(() => session.currentUser()?.id === 'refreshed');
    assert.equal(session.accessToken(), 'access-refreshed');
    assert.equal(session.currentUser()?.id, 'refreshed');
  } finally {
    await session.signOut();
    globalThis.setTimeout = nativeSetTimeout;
  }
});

function wireRoom(number) {
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

function detail(roomSlug = 'hall') {
  return {
    roomId: `id-${roomSlug}`,
    roomSlug,
    roomName: 'Hall',
    description: 'A hall.',
    capacity: 20,
    pricePerHour: 40,
    currency: 'USD',
    houseRules: 'Be kind.',
    amenities: [],
    accessibility: [],
    activities: [],
    photos: [],
    venue: {
      venueId: 'venue-one',
      name: 'Venue One',
      slug: 'venue-one',
      venueType: 'church',
      addressLine: '1 Main Street',
      suburb: 'Arlington',
      postcode: '22201',
      contactEmail: null,
      parkingInfo: '',
      transitInfo: '',
      isIdentityVerified: true,
      latitude: 38.9,
      longitude: -77.1,
    },
  };
}

await check('catalogue invalidation clears sitemap, removes deleted rooms, and ignores an older read', async () => {
  let sitemap = [{ venueSlug: 'venue-one', roomSlug: 'hall' }];
  let deferredSitemap = null;
  globalThis.fetch = async (url) => {
    if (url.includes('/sitemap')) {
      if (deferredSitemap) return deferredSitemap;
      return json(sitemap);
    }
    if (url.includes('/listings/by-slug/venue-one/hall')) return json(detail());
    throw new Error(`unexpected request ${url}`);
  };
  const catalog = await import('../src/data/catalog.js?review-recovery-catalog');
  const original = await catalog.readVenue('venue-one');
  assert.equal(original.rooms.length, 1);

  sitemap = [];
  catalog.forgetVenues();
  assert.equal(await catalog.readVenue('venue-one'), null);
  assert.equal(catalog.heldVenue('venue-one'), null);

  let resolveOldSitemap;
  deferredSitemap = new Promise((resolve) => {
    resolveOldSitemap = () => resolve(json([{ venueSlug: 'venue-one', roomSlug: 'hall' }]));
  });
  catalog.forgetVenues();
  const stale = catalog.readVenue('venue-one');
  await Promise.resolve();
  catalog.forgetVenues();
  deferredSitemap = null;
  resolveOldSitemap();
  await stale;
  assert.equal(catalog.heldVenue('venue-one'), null);
});

await check('an explicit retry bypasses an outage cooldown but not Retry-After', async () => {
  let state = 'outage';
  let calls = 0;
  globalThis.fetch = async (url) => {
    if (!url.includes('/listings/search')) throw new Error(`unexpected request ${url}`);
    calls += 1;
    if (state === 'outage') return json({ code: 'temporarily_unavailable' }, { status: 503 });
    if (state === 'rate-limited') {
      return json({ code: 'rate_limited' }, { status: 429, headers: { 'retry-after': '60' } });
    }
    return json({ items: [], totalCount: 0, page: 1, pageSize: 100 });
  };
  const catalog = await import('../src/data/catalog.js?review-recovery-retry');
  await assert.rejects(catalog.searchListings(), (error) => error.status === 503);
  state = 'healthy';
  await catalog.searchListings({}, { retry: true });
  assert.equal(calls, 2);

  catalog.forgetVenues();
  state = 'rate-limited';
  await assert.rejects(catalog.searchListings(), (error) => error.status === 429);
  state = 'healthy';
  await assert.rejects(catalog.searchListings({}, { retry: true }), (error) => error.status === 429);
  assert.equal(calls, 3);
});

await check('discovery fetches the next page and declares a bounded partial result', async () => {
  let total = 101;
  const pages = [];
  globalThis.fetch = async (url) => {
    const request = new URL(url, 'http://steeple.test');
    const page = Number(request.searchParams.get('page'));
    pages.push(page);
    const start = (page - 1) * 100;
    const end = Math.min(start + 100, total);
    return json({
      items: Array.from({ length: Math.max(0, end - start) }, (_, index) => wireRoom(start + index + 1)),
      totalCount: total,
      page,
      pageSize: 100,
    });
  };
  const catalog = await import('../src/data/catalog.js?review-recovery-paging');
  const complete = await catalog.searchListings();
  assert.equal(complete.items.length, 101);
  assert.equal(complete.total, 101);
  assert.equal(complete.complete, true);
  assert.deepEqual(pages, [1, 2]);

  total = 1001;
  pages.length = 0;
  catalog.forgetVenues();
  const bounded = await catalog.searchListings();
  assert.equal(bounded.items.length, 1000);
  assert.equal(bounded.total, 1001);
  assert.equal(bounded.complete, false);
  assert.deepEqual(pages, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
});

console.log(`\n${checks} recovery checks passed`);
