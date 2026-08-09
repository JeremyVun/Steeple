// THE BATCHER — what this browser saw somebody do, posted in batches.
//
// Steeple's own events are emitted server-side and always have been: a booking
// confirmed, an application decided, a photo uploaded. What no server can see
// is the half of the funnel that happens before a write — a map dragged, a
// request sheet opened and abandoned, a sign-in panel that was closed again —
// and v1's `IWebAnalytics` was retired with v1, so web has been emitting
// nothing at all. This is the thing that fills that gap
// (`docs/contracts/analytics.md`, `POST /api/v1/events`).
//
// Three rules it never breaks:
//   · **Nothing waits for it.** `track()` pushes onto a queue and returns; the
//     post happens on a timer, unawaited, and a failure is dropped on the floor.
//     Analytics that can slow an interaction down is a bug, not a measurement.
//   · **Only the client-sourced taxonomy rows.** The API's allowlist is the
//     real gate — a server-authoritative name sent from here is silently
//     dropped — but sending one would still be a lie about where it came from.
//   · **The last batch is not lost.** A page being closed flushes through
//     `sendBeacon`, which survives unload. Beacons carry no Authorization
//     header, so those events reach steeple without a `userId`; that is the
//     documented cost of not losing them.

import * as api from './api.js';
import * as session from './session.js';

/** Rows a client may submit (`docs/contracts/analytics.md` — the allowlist). */
const CLIENT_EVENTS = new Set([
  'map_interacted',
  'application_started',
  'sso_started',
  'notification_opened',
  'inbox_opened',
  'decision_pressed',
  'card_step_opened',
  'payout_step_opened',
  'arrival_settled',
]);

/** The API drops batches over 50; go early rather than lose one. */
const MAX_BATCH = 25;
const FLUSH_AFTER_MS = 4000;

const SESSION_KEY = 'steeple-analytics-session';

// Storage classification (cleanup P2): this is an anonymous random visit id,
// not a profile/client id, and is the only durable value in this module. It
// contains no free text, identity, or location; event batches remain memory-
// only. sessionStorage may therefore keep this presentation-neutral telemetry
// correlation for the life of one tab.

const newId = () =>
  globalThis.crypto?.randomUUID?.() ??
  `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;

/**
 * One id per browsing session, so a funnel can be followed across events
 * without anybody being identified. It lives in sessionStorage on purpose: a
 * new tab is a new visit, and closing the browser ends it.
 */
const sessionId = (() => {
  try {
    const held = sessionStorage.getItem(SESSION_KEY);
    if (held) return held;
    const made = newId();
    sessionStorage.setItem(SESSION_KEY, made);
    return made;
  } catch {
    return newId();
  }
})();

let queue = [];
let timer = null;

/**
 * Record one interaction. Returns immediately, always.
 *
 * @param {string} name  a client-sourced taxonomy row
 * @param {object} [props]
 */
export function track(name, props = {}) {
  if (!CLIENT_EVENTS.has(name)) return;
  queue.push({ name, occurredAt: new Date().toISOString(), props });
  if (queue.length >= MAX_BATCH) {
    flush();
    return;
  }
  timer ??= setTimeout(() => {
    timer = null;
    flush();
  }, FLUSH_AFTER_MS);
}

/** Whatever is waiting, sent now. Best effort by design. */
export function flush() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  const events = queue;
  queue = [];
  if (!events.length) return;
  // The token as it stands, never a refresh: a batch is not worth rotating a
  // pair for, and an anonymous row is a row steeple still keeps.
  const token = session.isSignedIn() ? session.accessToken() : null;
  api.postEvents({ sessionId, events }, { accessToken: token }).catch(() => {
    // Measurement is not the product. A batch that could not be delivered is
    // gone, and nobody is told about it.
  });
}

/**
 * The last batch, on the way out. `sendBeacon` hands the bytes to the browser
 * to deliver after this page is gone — which is the only way an unload-time
 * post survives — at the cost of choosing neither headers nor a response.
 */
function beacon() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  const events = queue;
  queue = [];
  if (!events.length) return;
  const body = JSON.stringify({ sessionId, events });
  try {
    // Document-relative, exactly as api.js's own base is, so this holds behind
    // a stripped sub-path prefix too.
    const sent = navigator.sendBeacon?.(
      'api/v1/events',
      new Blob([body], { type: 'application/json' })
    );
    if (sent) return;
  } catch {
    // Falls through to the ordinary post, which may or may not get away.
  }
  api.postEvents({ sessionId, events }, {}).catch(() => {});
}

/**
 * `pagehide` is the reliable one — `unload` never fires on mobile Safari and
 * bfcache pages skip it — and a tab merely being hidden is the commonest way a
 * visit ends without ending, so both send what is waiting.
 */
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', beacon);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') beacon();
  });
}
