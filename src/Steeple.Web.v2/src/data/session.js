// THE SESSION — who steeple thinks you are, and the tokens that prove it.
//
// One module owns the pair. Nothing else in the app reads a token, and nothing
// else decides when one has expired: callers hand this module a piece of work
// that needs a bearer, and it runs it — refreshing once, quietly, if the access
// token has gone stale under them (CONTRACTS §4: access tokens are short, the
// refresh token rotates on every use and reusing a rotated one revokes the
// whole family, so exactly one refresh may ever be in flight).
//
// Persistence is localStorage, so a signed-in guest stays signed in across a
// reload — the same promise the rest of the funnel makes about a draft.
//
// The sign-in itself is steeple's dev provider (Auth:DevLoginEnabled, which
// exists only in appsettings.Development.json): the "ID token" is an email, or
// `email|Display Name`, and the account is created on first use. When Google
// and Apple arrive, only `signIn` changes — the rest of this file already
// speaks in provider tokens.

import * as api from './api.js';

const KEY = 'steeple-village-session';

const memory = new Map();
const storage = (() => {
  try {
    const probe = '__steeple-session-probe';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return localStorage;
  } catch {
    return {
      getItem: (k) => memory.get(k) ?? null,
      setItem: (k, v) => memory.set(k, v),
      removeItem: (k) => memory.delete(k),
    };
  }
})();

/** @typedef {{id:string,displayName:string,email:string|null,createdAtUtc:string}} Person */

let held = null;
let loaded = false;
const watchers = new Set();

function load() {
  if (loaded) return held;
  loaded = true;
  try {
    const raw = storage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    held = parsed?.accessToken && parsed?.user ? parsed : null;
  } catch {
    held = null;
  }
  return held;
}

/**
 * Why the session changed, told to every watcher alongside the session itself.
 * Only 'expired' is news to the person — they did not ask for it — and the
 * interface says so out loud rather than letting a chip vanish (D6).
 */
export const REASON = {
  signedIn: 'signedIn',
  signedOut: 'signedOut',
  expired: 'expired',
  refreshed: 'refreshed',
};

function keep(next, reason) {
  held = next;
  loaded = true;
  if (next) storage.setItem(KEY, JSON.stringify(next));
  else storage.removeItem(KEY);
  for (const watch of watchers) watch(next, reason);
}

/** The person signed in on this browser, or null. */
export function currentUser() {
  return load()?.user ?? null;
}

/** Whether a real session exists — the only thing that earns the trust chip. */
export const isSignedIn = () => Boolean(load());

/**
 * Told whenever the session appears, changes person, or goes — with the
 * {@link REASON} it changed for. This is the only channel: surfaces subscribe,
 * nothing polls.
 *
 * @param {(session: object|null, reason: string) => void} watch
 */
export function onSessionChange(watch) {
  watchers.add(watch);
  return () => watchers.delete(watch);
}

/**
 * Sign in through steeple's dev provider. Any email works — the account is
 * created the first time it is seen, and the same email always lands on the
 * same account.
 *
 * @param {{email:string, displayName?:string|null}} who
 * @returns {Promise<Person>}
 * @throws {api.ApiError} status 0 when nothing answered; otherwise steeple's
 *   own problem document, `code` and all.
 */
export async function signIn({ email, displayName = null }) {
  const address = String(email ?? '').trim().toLowerCase();
  const name = String(displayName ?? '').trim();
  const session = await api.createSession({
    provider: 'dev',
    idToken: name ? `${address}|${name}` : address,
    turnstileToken: null,
    displayName: name || null,
    device: { platform: 'web', label: 'Steeple Village' },
  });
  keep(
    {
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      user: session.user,
    },
    REASON.signedIn
  );
  return session.user;
}

/**
 * Sign out: here, and at steeple.
 *
 * The local half is unconditional and happens first. A revocation that fails —
 * the API is down, the access token is already stale — must not leave someone
 * signed in on a browser they asked to be signed out of; the server call is
 * best-effort by design, and its failure is not the guest's problem.
 *
 * `everywhere` revokes every session this person holds rather than this one
 * (`DELETE /me/sessions` — the shared-computer answer, CONTRACTS §4).
 *
 * @returns {Promise<void>} resolves once the revocation has been attempted.
 */
export async function signOut({ everywhere = false } = {}) {
  const token = load()?.accessToken ?? null;
  keep(null, REASON.signedOut);
  if (!token) return;
  try {
    await (everywhere ? api.deleteAllSessions(token) : api.deleteSession(token));
  } catch {
    // Nothing to say and nothing to undo: the pair is gone from this browser
    // either way, and an unrevoked refresh token expires on its own.
  }
}

let refreshing = null;

/** Rotate the pair, once at a time however many callers ask at once. */
function refresh() {
  const session = load();
  if (!session?.refreshToken) return Promise.resolve(null);
  refreshing ??= api
    .refreshSession(session.refreshToken)
    .then((pair) => {
      keep(
        { ...load(), accessToken: pair.accessToken, refreshToken: pair.refreshToken },
        REASON.refreshed
      );
      return pair.accessToken;
    })
    .catch(() => {
      // The refresh token is spent or revoked: this browser is signed out. Say
      // so plainly rather than leaving a session that cannot do anything — and
      // say it to the person too, since nobody asked for this (ui/notice.js).
      keep(null, REASON.expired);
      return null;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

/**
 * Run one piece of work that needs a bearer token, refreshing once if the API
 * answers 401. A second 401 is an answer, not a hiccup: the session is dropped
 * and the error is raised for the caller to say something calm about.
 *
 * @template T
 * @param {(accessToken: string) => Promise<T>} work
 * @returns {Promise<T>}
 */
export async function withAccess(work) {
  const session = load();
  if (!session) throw new api.ApiError('not signed in', 401);
  try {
    return await work(session.accessToken);
  } catch (error) {
    if (error?.status !== 401) throw error;
    const fresh = await refresh();
    if (!fresh) throw error;
    return work(fresh);
  }
}

/**
 * Ask the API who this token belongs to and hold the answer. Used at boot to
 * find out whether a remembered session is still good — an expired access
 * token refreshes itself here, and a dead one signs the browser out.
 *
 * @returns {Promise<Person|null>} null when there is no session, or none left.
 */
export async function fetchCurrentUser() {
  if (!load()) return null;
  try {
    const me = await withAccess((token) => api.getMe(token));
    const user = {
      id: me.id,
      displayName: me.displayName,
      email: me.email,
      createdAtUtc: me.createdAtUtc,
    };
    keep({ ...load(), user }, REASON.refreshed);
    return user;
  } catch (error) {
    // A dead session goes; an API that simply is not running does not cost the
    // guest their sign-in — it will be there again when the API is.
    // The refresh inside withAccess may already have said so; say it once.
    if (error?.status === 401 && load()) keep(null, REASON.expired);
    return currentUser();
  }
}
