// LIVE NOTIFICATION TRANSPORT — direct API, Vite and nginx must flush an
// initial invalidation and a later PostgreSQL-triggered invalidation while the
// same response remains open.
//
//   STEEPLE_PROXY_ORIGINS='vite=http://localhost:5173,nginx=http://localhost:8180' \
//     node tools/notification-stream-proxy-test.mjs
//
// Needs the Development API and disposable migrated database named by the
// ordinary fixture variables. Add a stripped-prefix origin after the fixture
// proxy has removed the prefix, for example nginx-prefix=http://localhost:8181/steeple.

import { createHmac, randomUUID } from 'node:crypto';

import { agreeCurrent, API, mintGuest, mintNotification, stamp } from './fixtures.mjs';

const DIRECT_ORIGIN = new URL(API).origin;
const OPEN_MS = Number(process.env.STEEPLE_STREAM_OPEN_MS ?? 10_000);
const EVENT_MS = Number(process.env.STEEPLE_STREAM_EVENT_MS ?? 10_000);
const PROXY_ORIGINS = (process.env.STEEPLE_PROXY_ORIGINS ?? '')
  .split(',')
  .filter(Boolean)
  .map((entry) => {
    const separator = entry.indexOf('=');
    if (separator < 1) throw new Error(`invalid STEEPLE_PROXY_ORIGINS entry: ${entry}`);
    return [entry.slice(0, separator), entry.slice(separator + 1).replace(/\/$/, '')];
  });

let checks = 0;
let failures = 0;
function check(label, ok, detail = '') {
  checks++;
  if (!ok) failures++;
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail ? ` — ${detail}` : ''}`);
}
const eq = (label, got, want) => check(label, got === want, `got ${JSON.stringify(got)}`);

async function deadline(ms, label, action) {
  let timer;
  try {
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} exceeded ${ms}ms`)), ms);
      timer.unref?.();
    });
    return await Promise.race([action, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

function streamUrl(origin) {
  return `${origin.replace(/\/$/, '')}/api/v1/me/notifications/stream`;
}

async function openStream(origin, token) {
  const controller = new AbortController();
  const response = await deadline(OPEN_MS, `opening ${origin}`, fetch(streamUrl(origin), {
    headers: {
      accept: 'text/event-stream',
      authorization: `Bearer ${token}`,
    },
    cache: 'no-store',
    signal: controller.signal,
  }));
  if (!response.ok) {
    const body = await response.text();
    controller.abort();
    return { response, body, controller, reader: null, buffer: '' };
  }
  return { response, body: null, controller, reader: response.body.getReader(), buffer: '' };
}

async function nextFrame(stream, timeout = EVENT_MS) {
  for (;;) {
    const boundary = stream.buffer.indexOf('\n\n');
    if (boundary >= 0) {
      const frame = stream.buffer.slice(0, boundary);
      stream.buffer = stream.buffer.slice(boundary + 2);
      return frame;
    }
    const part = await deadline(timeout, 'waiting for stream bytes', stream.reader.read());
    if (part.done) throw new Error('stream ended before the expected frame');
    stream.buffer += new TextDecoder().decode(part.value).replaceAll('\r\n', '\n').replaceAll('\r', '\n');
  }
}

async function closeStream(stream) {
  stream.controller.abort();
  await stream.reader?.cancel().catch(() => {});
}

function jwt({ sub = randomUUID(), exp, includeExp = true }) {
  const key = process.env.STEEPLE_JWT_SIGNING_KEY;
  if (!key) throw new Error('STEEPLE_JWT_SIGNING_KEY is required for the JWT lifetime checks');
  const now = Math.floor(Date.now() / 1000);
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const claims = {
    iss: 'steeple-api',
    aud: 'steeple',
    sub,
    sid: randomUUID(),
    nbf: now - 1,
    ...(includeExp ? { exp } : {}),
  };
  const unsigned = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(claims)}`;
  return `${unsigned}.${createHmac('sha256', Buffer.from(key, 'base64')).update(unsigned).digest('base64url')}`;
}

const streams = [];
try {
  const guest = await mintGuest({
    email: `stream-proxy-${stamp}@example.org`,
    name: 'Stream Priya',
  });
  await agreeCurrent(guest.token);

  const anonymous = await fetch(streamUrl(DIRECT_ORIGIN), { headers: { accept: 'text/event-stream' } });
  eq('an anonymous stream is refused', anonymous.status, 401);

  for (const [name, origin] of [['direct', DIRECT_ORIGIN], ...PROXY_ORIGINS]) {
    const stream = await openStream(origin, guest.token);
    streams.push(stream);
    eq(`${name} opens the event stream`, stream.response.status, 200);
    check(
      `${name} returns the SSE content type`,
      /^text\/event-stream(?:;|$)/i.test(stream.response.headers.get('content-type') ?? ''),
      stream.response.headers.get('content-type') ?? ''
    );
    check(
      `${name} disables transformed caches`,
      /no-store/.test(stream.response.headers.get('cache-control') ?? '')
        && /no-transform/.test(stream.response.headers.get('cache-control') ?? ''),
      stream.response.headers.get('cache-control') ?? ''
    );
    eq(`${name} flushes the initial invalidation`, await nextFrame(stream), 'event: invalidate\ndata: {}');
    check(`${name} keeps credentials out of the URL`, !stream.response.url.includes(guest.token), stream.response.url);
  }

  const notificationId = mintNotification({
    userId: guest.user.id,
    type: 8,
    payload: { fixture: 'notification-stream-proxy', stamp },
  });
  for (let index = 0; index < streams.length; index += 1) {
    const name = [['direct', DIRECT_ORIGIN], ...PROXY_ORIGINS][index][0];
    eq(`${name} flushes a committed arrival on the open response`, await nextFrame(streams[index]), 'event: invalidate\ndata: {}');
  }
  check('the committed fixture has a stable id', /^[0-9a-f-]{36}$/.test(notificationId), notificationId);
  eq('the direct stream flushes an idle heartbeat', await nextFrame(streams[0], 40_000), ': heartbeat');

  for (const stream of streams.splice(0)) await closeStream(stream);

  const held = [];
  for (let index = 0; index < 4; index += 1) {
    const stream = await openStream(DIRECT_ORIGIN, guest.token);
    held.push(stream);
    eq(`the user holds stream ${index + 1}`, stream.response.status, 200);
    await nextFrame(stream);
  }
  const capped = await openStream(DIRECT_ORIGIN, guest.token);
  eq('the fifth stream for one user is capped', capped.response.status, 429);
  eq('the user cap supplies Retry-After', capped.response.headers.get('retry-after'), '60');

  const other = await mintGuest({ email: `stream-other-${stamp}@example.org`, name: 'Stream Omar' });
  await agreeCurrent(other.token);
  const unaffected = await openStream(DIRECT_ORIGIN, other.token);
  eq('another user remains unaffected by the user cap', unaffected.response.status, 200);
  await nextFrame(unaffected);
  await closeStream(unaffected);

  await closeStream(held.pop());
  let released = null;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    released = await openStream(DIRECT_ORIGIN, guest.token);
    if (released.response.status === 200) break;
    await closeStream(released);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  eq('cancelling a stream releases its permit', released.response.status, 200);
  await nextFrame(released);
  await closeStream(released);
  for (const stream of held) await closeStream(stream);

  if (process.env.STEEPLE_JWT_SIGNING_KEY) {
    const noExpiry = await openStream(DIRECT_ORIGIN, jwt({ includeExp: false }));
    eq('a signed token without exp is refused', noExpiry.response.status, 401);

    const expiry = Math.floor(Date.now() / 1000) + 3;
    const expiring = await openStream(DIRECT_ORIGIN, jwt({ exp: expiry }));
    eq('a future signed token opens a stream', expiring.response.status, 200);
    await nextFrame(expiring);
    const ended = await deadline(8_000, 'waiting for credential expiry', expiring.reader.read());
    check('the socket closes at its JWT expiry despite middleware skew', ended.done, JSON.stringify(ended));
    await closeStream(expiring);

    if (process.env.STEEPLE_TEST_PROCESS_CAP === '1') {
      const processHeld = await Promise.all(Array.from({ length: 256 }, () =>
        openStream(DIRECT_ORIGIN, jwt({ exp: Math.floor(Date.now() / 1000) + 600 }))));
      check(
        '256 subscriptions fill the actual process cap',
        processHeld.every((stream) => stream.response.status === 200),
        JSON.stringify(processHeld.reduce((counts, stream) => {
          counts[stream.response.status] = (counts[stream.response.status] ?? 0) + 1;
          return counts;
        }, {}))
      );
      const processCapped = await openStream(
        DIRECT_ORIGIN,
        jwt({ exp: Math.floor(Date.now() / 1000) + 600 })
      );
      eq('the 257th process subscription is capped', processCapped.response.status, 429);
      await closeStream(processHeld.pop());
      let processReleased = null;
      for (let attempt = 0; attempt < 20; attempt += 1) {
        processReleased = await openStream(
          DIRECT_ORIGIN,
          jwt({ exp: Math.floor(Date.now() / 1000) + 600 })
        );
        if (processReleased.response.status === 200) break;
        await closeStream(processReleased);
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      eq('a cancelled process-cap stream releases its permit', processReleased.response.status, 200);
      await closeStream(processReleased);
      for (const stream of processHeld) await closeStream(stream);
    }

    if (process.env.STEEPLE_TEST_REQUEST_LIMIT === '1') {
      const limitedToken = jwt({ exp: Math.floor(Date.now() / 1000) + 600 });
      const statuses = [];
      for (let offset = 0; offset < 300; offset += 20) {
        const batch = await Promise.all(Array.from({ length: 20 }, () =>
          fetch(`${DIRECT_ORIGIN}/api/v1/me/notifications?pageSize=1`, {
            headers: { authorization: `Bearer ${limitedToken}` },
          })));
        statuses.push(...batch.map((response) => response.status));
        await Promise.all(batch.map((response) => response.body?.cancel().catch(() => {})));
      }
      eq('a fresh account receives 300 requests in the global window', statuses.filter((status) => status === 200).length, 300);
      const limitedRead = await fetch(`${DIRECT_ORIGIN}/api/v1/me/notifications?pageSize=1`, {
        headers: { authorization: `Bearer ${limitedToken}` },
      });
      eq('the next ordinary inbox read hits the global limit', limitedRead.status, 429);
      await limitedRead.body?.cancel().catch(() => {});
      const limitedStream = await openStream(DIRECT_ORIGIN, limitedToken);
      eq('a stream open shares the exhausted global limit', limitedStream.response.status, 429);
    }

    if (process.env.STEEPLE_TEST_MAX_LIFETIME === '1') {
      const lifetime = await openStream(DIRECT_ORIGIN, guest.token);
      eq('the five-minute lifetime stream opens', lifetime.response.status, 200);
      await nextFrame(lifetime);
      const ended = await deadline(310_000, 'waiting for the five-minute stream lifetime', lifetime.reader.read());
      check('the server closes the stream after five minutes', ended.done, JSON.stringify(ended));
      await closeStream(lifetime);
      const renewed = await openStream(DIRECT_ORIGIN, guest.token);
      eq('the client can renew after the five-minute close', renewed.response.status, 200);
      await nextFrame(renewed);
      await closeStream(renewed);
    }
  } else {
    console.log('  skip JWT expiry checks — set STEEPLE_JWT_SIGNING_KEY to the disposable API key');
  }
} finally {
  for (const stream of streams) await closeStream(stream);
}

console.log(`\n${checks - failures}/${checks} checks passed`);
process.exit(failures ? 1 : 0);
