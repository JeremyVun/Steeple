#!/usr/bin/env node

import assert from 'node:assert/strict';

import * as api from '../src/data/api.js';
import * as correspondence from '../src/data/correspondence.js';
import {
  NotificationStreamParseError,
  consumeNotificationStream,
} from '../src/data/notificationStream.js';
import * as session from '../src/data/session.js';

const encoder = new TextEncoder();
let checks = 0;

async function check(label, work) {
  await work();
  checks += 1;
  console.log(`ok  ${label}`);
}

function bodyFrom(chunks, { keepOpen = false, onCancel = null } = {}) {
  return new ReadableStream({
    pull(controller) {
      if (chunks.length) controller.enqueue(chunks.shift());
      else if (!keepOpen) controller.close();
    },
    cancel(reason) {
      onCancel?.(reason);
    },
  });
}

function eventResponse(text, options = {}) {
  return {
    body: bodyFrom([encoder.encode(text)], options),
  };
}

function jsonResponse(body, { status = 200, headers = {} } = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

function streamResponse(body = bodyFrom([], { keepOpen: true }), headers = {}) {
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/event-stream; charset=utf-8', ...headers },
  });
}

await check('split UTF-8 and mixed line endings dispatch complete invalidations', async () => {
  const source = [
    ': heartbeat\r\n',
    'event: invalidate\r\n',
    'data: {"label":"café ☕"}\r\n',
    '\r\n',
    'event: invalidate\r',
    'data: {}\r',
    '\r',
    'event: invalidate\n',
    'data: {"future":true}\n',
    '\n',
  ].join('');
  const chunks = [...encoder.encode(source)].map((byte) => Uint8Array.of(byte));
  const found = [];
  let bytes = 0;
  await consumeNotificationStream(
    { body: bodyFrom(chunks) },
    {
      onInvalidate: (payload) => found.push(payload),
      onBytes: (count) => {
        bytes += count;
      },
    }
  );
  assert.deepEqual(found, [{ label: 'café ☕' }, {}, { future: true }]);
  assert.equal(bytes, encoder.encode(source).byteLength);
});

await check('batched frames ignore comments, fields, and unknown event types', async () => {
  const found = [];
  await consumeNotificationStream(
    eventResponse(
      ': hello\nretry: 1\nid: private\n\n' +
        'event: future\ndata: not-json\n\n' +
        'event: invalidate\ndata: {\ndata: }\n\n'
    ),
    { onInvalidate: (payload) => found.push(payload) }
  );
  assert.deepEqual(found, [{}]);
});

await check('malformed known data fails and cancels the reader', async () => {
  let cancelled = false;
  await assert.rejects(
    consumeNotificationStream(
      eventResponse('event: invalidate\ndata: []\n\n', {
        keepOpen: true,
        onCancel: () => {
          cancelled = true;
        },
      }),
      { onInvalidate: () => assert.fail('malformed data dispatched') }
    ),
    NotificationStreamParseError
  );
  assert.equal(cancelled, true);
});

await check('an incomplete frame is bounded to 8 KiB', async () => {
  await assert.rejects(
    consumeNotificationStream(eventResponse(`data: ${'x'.repeat(8192)}`, { keepOpen: true }), {
      onInvalidate: () => assert.fail('oversize frame dispatched'),
    }),
    /exceeded 8 KiB/
  );
});

await check('CRLF counts both wire bytes toward the frame bound', async () => {
  const shell = 'event: future\r\ndata: \r\n\r\n';
  const room = 8192 - encoder.encode(shell).byteLength;
  await consumeNotificationStream(eventResponse(`event: future\r\ndata: ${'x'.repeat(room)}\r\n\r\n`), {
    onInvalidate: () => assert.fail('unknown event dispatched'),
  });
  await assert.rejects(
    consumeNotificationStream(
      eventResponse(`event: future\r\ndata: ${'x'.repeat(room + 1)}\r\n\r\n`, { keepOpen: true }),
      { onInvalidate: () => assert.fail('oversize event dispatched') }
    ),
    /exceeded 8 KiB/
  );
});

await check('EOF discards an unterminated event', async () => {
  const found = [];
  await consumeNotificationStream(eventResponse('event: invalidate\ndata: {}\n'), {
    onInvalidate: (payload) => found.push(payload),
  });
  assert.deepEqual(found, []);
});

await check('abort cancels a blocked read', async () => {
  let cancelled = false;
  const controller = new AbortController();
  const consuming = consumeNotificationStream(
    {
      body: bodyFrom([], {
        keepOpen: true,
        onCancel: () => {
          cancelled = true;
        },
      }),
    },
    { signal: controller.signal, onInvalidate: () => {} }
  );
  controller.abort();
  await assert.rejects(consuming, (error) => error.name === 'AbortError');
  assert.equal(cancelled, true);
});

await check('wire opening uses bearer headers and leaves the URL credential-free', async () => {
  let request;
  globalThis.fetch = async (url, init) => {
    request = { url, init };
    return streamResponse(bodyFrom([encoder.encode('event: invalidate\ndata: {}\n\n')]));
  };
  const controller = new AbortController();
  const response = await api.openNotificationStream('secret-token', { signal: controller.signal });
  assert.equal(request.url, 'api/v1/me/notifications/stream');
  assert.equal(request.init.headers.authorization, 'Bearer secret-token');
  assert.equal(request.init.headers.accept, 'text/event-stream');
  assert.equal(request.init.cache, 'no-store');
  assert.equal(request.url.includes('secret-token'), false);
  await response.body.cancel();
});

await check('stream admission and snapshot errors retain Retry-After', async () => {
  globalThis.fetch = async (url) =>
    jsonResponse(
      { code: 'rate_limited', detail: 'Wait.' },
      { status: 429, headers: { 'retry-after': url.includes('/stream') ? '7' : '11' } }
    );
  await assert.rejects(api.openNotificationStream('token'), (error) => {
    assert.equal(error.status, 429);
    assert.equal(error.retryAfterMs, 7000);
    return true;
  });
  await assert.rejects(api.getMyNotifications('token'), (error) => {
    assert.equal(error.retryAfterMs, 11000);
    return true;
  });
});

await check('a stalled admission error body is canceled without delaying the throw', async () => {
  let cancelled = false;
  globalThis.fetch = async () =>
    new Response(
      bodyFrom([], {
        keepOpen: true,
        onCancel: () => {
          cancelled = true;
        },
      }),
      { status: 503, headers: { 'content-type': 'application/problem+json', 'retry-after': '5' } }
    );
  await assert.rejects(api.openNotificationStream('token'), (error) => {
    assert.equal(error.status, 503);
    assert.equal(error.retryAfterMs, 5000);
    return true;
  });
  await Promise.resolve();
  assert.equal(cancelled, true);
});

await check('invalid success responses are canceled', async () => {
  let cancelled = false;
  globalThis.fetch = async () =>
    new Response(
      bodyFrom([], {
        keepOpen: true,
        onCancel: () => {
          cancelled = true;
        },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );
  await assert.rejects(api.openNotificationStream('token'), /invalid event stream/);
  assert.equal(cancelled, true);
});

await check('caller cancellation aborts a stream still opening', async () => {
  globalThis.fetch = async (_url, { signal }) =>
    new Promise((_resolve, reject) => {
      signal.addEventListener(
        'abort',
        () => reject(new DOMException('withdrawn', 'AbortError')),
        { once: true }
      );
    });
  const controller = new AbortController();
  const opening = api.openNotificationStream('token', { signal: controller.signal });
  controller.abort();
  await assert.rejects(opening, (error) => error.aborted === true && error.timedOut === false);
});

await check('the ten-second opening deadline aborts an unanswered fetch', async () => {
  const nativeSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (fn, delay, ...args) => {
    if (delay === 10000) {
      queueMicrotask(() => fn(...args));
      return 1;
    }
    return nativeSetTimeout(fn, delay, ...args);
  };
  globalThis.fetch = async (_url, { signal }) =>
    new Promise((_resolve, reject) => {
      signal.addEventListener(
        'abort',
        () => reject(new DOMException('deadline', 'AbortError')),
        { once: true }
      );
    });
  try {
    await assert.rejects(
      api.openNotificationStream('token'),
      (error) => error.timedOut === true && error.aborted === false
    );
  } finally {
    globalThis.setTimeout = nativeSetTimeout;
  }
});

await check('the opening deadline is separate from the four-second read deadline', async () => {
  const nativeSetTimeout = globalThis.setTimeout;
  let streamDeadline;
  globalThis.setTimeout = (fn, delay, ...args) => {
    if (delay === 10000) {
      streamDeadline = () => fn(...args);
      return 1;
    }
    return nativeSetTimeout(fn, delay, ...args);
  };
  globalThis.fetch = async () => streamResponse(bodyFrom([], { keepOpen: true }));
  try {
    const response = await api.openNotificationStream('token');
    assert.equal(typeof streamDeadline, 'function');
    assert.equal(response.body.locked, false);
    await response.body.cancel();
  } finally {
    globalThis.setTimeout = nativeSetTimeout;
  }
});

const user = (id, name) => ({
  accessToken: `access-${id}`,
  user: {
    id,
    displayName: name,
    email: `${id}@example.com`,
    createdAtUtc: '2026-09-05T00:00:00Z',
  },
  isNewUser: false,
});

await check('one stream 401 refreshes once and returns the retry promptly', async () => {
  const streamTokens = [];
  let refreshes = 0;
  globalThis.fetch = async (url, init = {}) => {
    if (url.endsWith('/auth/sessions')) return jsonResponse(user('a', 'A'));
    if (url.endsWith('/auth/refresh')) {
      refreshes += 1;
      return jsonResponse(user('fresh', 'A'));
    }
    if (url.endsWith('/notifications/stream')) {
      streamTokens.push(init.headers.authorization);
      if (streamTokens.length === 1) return jsonResponse({ code: 'unauthorized' }, { status: 401 });
      return streamResponse();
    }
    throw new Error(`unexpected fetch ${url}`);
  };
  await session.signIn({ email: 'a@example.com', displayName: 'A' });
  const response = await correspondence.openNotificationStream();
  assert.deepEqual(streamTokens, ['Bearer access-a', 'Bearer access-fresh']);
  assert.equal(refreshes, 1);
  await response.body.cancel();
});

await check('a second stream 401 expires the session', async () => {
  let streamCalls = 0;
  globalThis.fetch = async (url) => {
    if (url.endsWith('/notifications/stream')) {
      streamCalls += 1;
      return jsonResponse({ code: 'unauthorized' }, { status: 401 });
    }
    if (url.endsWith('/auth/refresh')) return jsonResponse(user('still-refused', 'A'));
    throw new Error(`unexpected fetch ${url}`);
  };
  await assert.rejects(correspondence.openNotificationStream(), (error) => error.status === 401);
  assert.equal(streamCalls, 2);
  assert.equal(session.isSignedIn(), false);
});

await check('abort during refresh prevents the retry stream from opening', async () => {
  let streamCalls = 0;
  let releaseRefresh;
  let refreshStarted;
  const refreshing = new Promise((resolve) => {
    refreshStarted = resolve;
  });
  globalThis.fetch = async (url) => {
    if (url.endsWith('/auth/sessions')) return jsonResponse(user('abort', 'Abort'));
    if (url.endsWith('/notifications/stream')) {
      streamCalls += 1;
      return jsonResponse({ code: 'unauthorized' }, { status: 401 });
    }
    if (url.endsWith('/auth/refresh')) {
      refreshStarted();
      return new Promise((resolve) => {
        releaseRefresh = () => resolve(jsonResponse(user('abort-fresh', 'Abort')));
      });
    }
    throw new Error(`unexpected fetch ${url}`);
  };
  await session.signIn({ email: 'abort@example.com', displayName: 'Abort' });
  const controller = new AbortController();
  const opening = correspondence.openNotificationStream({ signal: controller.signal });
  await refreshing;
  controller.abort();
  releaseRefresh();
  await assert.rejects(opening, (error) => error.aborted === true);
  assert.equal(streamCalls, 1);
});

await check('sign-out during a stream refresh cannot restore the old session', async () => {
  let streamCalls = 0;
  let releaseRefresh;
  let refreshStarted;
  const refreshing = new Promise((resolve) => {
    refreshStarted = resolve;
  });
  globalThis.fetch = async (url, init = {}) => {
    if (url.endsWith('/auth/sessions') && init.method === 'POST') {
      return jsonResponse(user('signout-race', 'Signout Race'));
    }
    if (url.endsWith('/auth/sessions') && init.method === 'DELETE') {
      return new Response(null, { status: 204 });
    }
    if (url.endsWith('/notifications/stream')) {
      streamCalls += 1;
      return jsonResponse({ code: 'unauthorized' }, { status: 401 });
    }
    if (url.endsWith('/auth/refresh')) {
      refreshStarted();
      return new Promise((resolve) => {
        releaseRefresh = () => resolve(jsonResponse(user('restored-old', 'Old')));
      });
    }
    throw new Error(`unexpected fetch ${url}`);
  };
  await session.signIn({ email: 'signout-race@example.com', displayName: 'Signout Race' });
  const opening = correspondence.openNotificationStream();
  await refreshing;
  const signingOut = session.signOut();
  assert.equal(session.isSignedIn(), false);
  releaseRefresh();
  await signingOut;
  await assert.rejects(opening, (error) => error.status === 401);
  await Promise.resolve();
  assert.equal(session.isSignedIn(), false);
  assert.equal(session.accessToken(), null);
  assert.equal(streamCalls, 1);
});

await check('an identity switch cancels a stale opened response', async () => {
  let releaseStream;
  let streamStarted;
  let cancelled = false;
  const openingStarted = new Promise((resolve) => {
    streamStarted = resolve;
  });
  globalThis.fetch = async (url, init = {}) => {
    if (url.endsWith('/auth/sessions')) {
      const credential = JSON.parse(init.body);
      const id = credential.idToken.startsWith('b@') ? 'b' : 'a2';
      return jsonResponse(user(id, id.toUpperCase()));
    }
    if (url.endsWith('/notifications/stream')) {
      streamStarted();
      return new Promise((resolve) => {
        releaseStream = () =>
          resolve(
            streamResponse(
              bodyFrom([], {
                keepOpen: true,
                onCancel: () => {
                  cancelled = true;
                },
              })
            )
          );
      });
    }
    throw new Error(`unexpected fetch ${url}`);
  };
  await session.signIn({ email: 'a2@example.com', displayName: 'A2' });
  const opening = correspondence.openNotificationStream();
  await openingStarted;
  await session.signIn({ email: 'b@example.com', displayName: 'B' });
  releaseStream();
  await assert.rejects(opening, (error) => error.status === 401);
  assert.equal(cancelled, true);
  assert.equal(session.currentUser()?.id, 'b');
});

globalThis.fetch = async (url) => {
  if (url.endsWith('/auth/session')) return new Response(null, { status: 204 });
  throw new Error(`unexpected fetch ${url}`);
};
await session.signOut();

console.log(`\n${checks} notification stream transport checks passed`);
