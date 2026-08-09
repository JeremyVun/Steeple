// THE SESSION — who steeple thinks this tab is, and the proof it asks for.
//
// The rotating refresh token is an httpOnly cookie, the short-lived access
// token and profile live only in this module's memory, and no identity data is
// written to either browser storage. A reload proves the cookie by refreshing
// once, then asks GET /me who owns it.
//
// Tabs coordinate through an opaque BroadcastChannel event. The event says
// only that a session appeared or disappeared; a sibling that hears "in"
// obtains the profile from steeple for itself. Nothing profile-shaped crosses
// the channel.

import * as api from './api.js';

const LEGACY_KEY = 'steeple-village-session';
const CHANNEL = 'steeple-village-session';

/** Remove the profile/tombstone written before identity became memory-only. */
function purgeLegacyProfile() {
  for (const area of [globalThis.localStorage, globalThis.sessionStorage]) {
    try {
      area?.removeItem(LEGACY_KEY);
    } catch {
      // Storage can be disabled. There is then nothing durable to migrate.
    }
  }
}

purgeLegacyProfile();

/** @typedef {{id:string,displayName:string,email:string|null,createdAtUtc:string}} Person */

/** The person this document has fetched from steeple. Never persisted. */
let held = null;
/** The bearer for this document. Never persisted. */
let access = null;
/** Explicit sign-out suppresses cookie probing until a new sign-in event. */
let suppressed = false;
/** The cookie probe has already been refused; only a sign-in can change that. */
let cookieRefused = false;
/** Invalidates network answers that return after sign-out or an identity change. */
let generation = 0;
let refreshing = null;
let restoring = null;
const watchers = new Set();

export const REASON = {
  signedIn: 'signedIn',
  signedOut: 'signedOut',
  expired: 'expired',
  refreshed: 'refreshed',
};

const channel =
  typeof window !== 'undefined' && typeof window.BroadcastChannel === 'function'
    ? new window.BroadcastChannel(CHANNEL)
    : null;

function notify(reason) {
  for (const watch of watchers) watch(held, reason);
}

function broadcast(state, reason) {
  try {
    channel?.postMessage({ type: 'session', state, reason });
  } catch {
    // Closing a document can close its channel before outstanding work settles.
  }
}

function personFrom(me) {
  return {
    id: me.id,
    displayName: me.displayName,
    email: me.email,
    createdAtUtc: me.createdAtUtc,
  };
}

function hold(user, reason, { announce = true } = {}) {
  held = user ? { user } : null;
  if (!user) access = null;
  if (announce) notify(reason);
}

function drop(reason, { announce = true } = {}) {
  generation += 1;
  suppressed = true;
  refreshing = null;
  restoring = null;
  hold(null, reason, { announce });
}

/** The person signed in in this document, or null while boot is unresolved. */
export function currentUser() {
  return held?.user ?? null;
}

/** Only a profile fetched from steeple earns signed-in UI. */
export const isSignedIn = () => Boolean(held);

/**
 * The memory-only bearer for analytics' optional attribution. All application
 * work uses withAccess() so it can refresh and retry.
 */
export const accessToken = () => (held ? access : null);

/** @param {(session: object|null, reason: string) => void} watch */
export function onSessionChange(watch) {
  watchers.add(watch);
  return () => watchers.delete(watch);
}

/**
 * Exchange a provider credential for steeple's cookie-backed web session.
 * @param {{provider:string,idToken:string,nonce?:string|null,displayName?:string|null,turnstileToken?:string|null}} credential
 * @returns {Promise<Person>}
 */
export async function signInWithProvider({
  provider,
  idToken,
  nonce = null,
  displayName = null,
  turnstileToken = null,
}) {
  const answer = await api.createSession({
    provider,
    idToken,
    nonce,
    turnstileToken,
    displayName: displayName?.trim() || null,
    device: { platform: 'web', label: 'Steeple Village' },
    refreshTransport: 'cookie',
  });

  generation += 1;
  suppressed = false;
  cookieRefused = false;
  refreshing = null;
  restoring = null;
  access = answer.accessToken;
  hold(answer.user, REASON.signedIn);
  broadcast('in', REASON.signedIn);
  return answer.user;
}

/** Development-only dev-provider helper. */
export function signIn({ email, displayName = null, turnstileToken = null }) {
  const address = String(email ?? '').trim().toLowerCase();
  const name = String(displayName ?? '').trim();
  return signInWithProvider({
    provider: 'dev',
    idToken: name ? `${address}|${name}` : address,
    displayName: name || null,
    turnstileToken,
  });
}

/** Clear this tab first, tell siblings, then revoke the shared cookie. */
export async function signOut() {
  const token = access;
  drop(REASON.signedOut);
  purgeLegacyProfile();
  broadcast('out', REASON.signedOut);
  try {
    await api.deleteSession(token);
  } catch {
    // Local privacy is unconditional; revocation remains best-effort.
  }
}

/**
 * Rotate the cookie-backed pair once per tab. Refusal is null; outage rejects.
 *
 * A refusal is also an answer worth keeping. The probe is the only honest way
 * to learn whether an httpOnly cookie exists, but the answer cannot change on
 * its own: nothing but a sign-in in this browser mints one, and both ways that
 * can happen — here, or in a sibling tab over the channel — clear this. Without
 * it, every panel that asks who you are re-probes and the console fills with
 * 401s that were never news (2026-08-09).
 */
function refresh() {
  if (suppressed || cookieRefused) return Promise.resolve(null);
  if (refreshing) return refreshing;

  const started = generation;
  // Scheduled rather than called, so that `refreshing` below is assigned before
  // the request goes out. Called straight through, two callers in the same tick
  // both found the single-flight slot still empty and both reached the wire —
  // which is why a signed-out boot probed the cookie twice in the built bundle,
  // where ui/index.js runs inside session.js's own evaluation tick. The dev
  // graph orders those two apart and never showed it.
  const request = Promise.resolve()
    .then(() => api.refreshSession({}))
    .then((pair) => {
      if (started !== generation || suppressed) return null;
      access = pair.accessToken;
      return access;
    })
    .catch((error) => {
      // An outage is not an answer: it rethrows, and the cookie stays unknown.
      if (!error?.status) throw error;
      cookieRefused = true;
      if (started === generation) access = null;
      return null;
    })
    .finally(() => {
      if (refreshing === request) refreshing = null;
    });
  refreshing = request;
  return request;
}

function expireIfHeld() {
  if (!held) return;
  drop(REASON.expired);
  broadcast('out', REASON.expired);
}

/**
 * Run bearer-authenticated work, refreshing when memory is empty and once
 * after a 401. A second refusal drops a profile that can no longer act.
 * @template T
 * @param {(accessToken:string) => Promise<T>} work
 * @returns {Promise<T>}
 */
export async function withAccess(work) {
  if (restoring) await restoring;
  if (suppressed) throw new api.ApiError('not signed in', 401);
  const started = generation;

  let token = access;
  if (!token) {
    token = await refresh();
    if (!token) {
      expireIfHeld();
      throw new api.ApiError('not signed in', 401);
    }
  }

  try {
    const result = await work(token);
    if (started !== generation || suppressed) throw new api.ApiError('session changed', 401);
    return result;
  } catch (error) {
    if (started !== generation || suppressed) throw new api.ApiError('session changed', 401);
    if (error?.status !== 401) throw error;
  }

  access = null;
  let fresh;
  try {
    fresh = await refresh();
  } catch {
    throw new api.ApiError('session refresh did not answer', 0);
  }
  if (!fresh) {
    expireIfHeld();
    throw new api.ApiError('not signed in', 401);
  }

  try {
    const result = await work(fresh);
    if (started !== generation || suppressed) throw new api.ApiError('session changed', 401);
    return result;
  } catch (error) {
    if (started !== generation || suppressed) throw new api.ApiError('session changed', 401);
    if (error?.status === 401) expireIfHeld();
    throw error;
  }
}

/**
 * Restore identity from the httpOnly refresh cookie, single-flight: rotate,
 * then GET /me. With no cookie this is an ordinary signed-out boot and emits
 * nothing; there is no persisted profile from which to infer an expiry.
 *
 * @returns {Promise<Person|null>}
 */
export function fetchCurrentUser(reason = REASON.refreshed) {
  if (suppressed) return Promise.resolve(null);
  if (restoring) return restoring;

  const started = generation;
  const request = (async () => {
    let token = access;
    try {
      token ??= await refresh();
      if (!token || started !== generation || suppressed) return currentUser();

      let me;
      try {
        me = await api.getMe(token);
      } catch (error) {
        if (error?.status !== 401) return currentUser();
        access = null;
        token = await refresh();
        if (!token || started !== generation || suppressed) {
          expireIfHeld();
          return currentUser();
        }
        try {
          me = await api.getMe(token);
        } catch (retryError) {
          if (retryError?.status === 401) expireIfHeld();
          return currentUser();
        }
      }

      if (started !== generation || suppressed) return currentUser();
      const user = personFrom(me);
      hold(user, reason);
      return user;
    } catch {
      // An unreachable API leaves the cookie untouched. A later call retries.
      return currentUser();
    }
  })().finally(() => {
    if (restoring === request) restoring = null;
  });

  restoring = request;
  return request;
}

if (channel) {
  channel.addEventListener('message', (event) => {
    const message = event.data;
    if (message?.type !== 'session') return;

    if (message.state === 'out') {
      drop(message.reason === REASON.expired ? REASON.expired : REASON.signedOut);
      purgeLegacyProfile();
      return;
    }
    if (message.state !== 'in') return;

    const replaced = Boolean(held);
    generation += 1;
    suppressed = false;
    // A sibling tab signed in, so there is a cookie now whatever this tab was
    // last told.
    cookieRefused = false;
    access = null;
    held = null;
    refreshing = null;
    restoring = null;
    // The event intentionally does not say whether this is the same person.
    // Drop any old profile immediately; it must not remain on screen while the
    // new profile is fetched.
    if (replaced) notify(REASON.signedOut);
    // The profile itself never crosses the channel. Fetch it from steeple.
    void fetchCurrentUser(REASON.signedIn);
  });
}

// Identity is a network fact now. Start resolving it as soon as the module is
// evaluated; UI subscribers installed during the same boot hear the result.
void fetchCurrentUser();
