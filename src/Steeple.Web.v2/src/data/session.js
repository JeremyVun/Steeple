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

function keep(next) {
  held = next;
  loaded = true;
  if (next) storage.setItem(KEY, JSON.stringify(next));
  else storage.removeItem(KEY);
  for (const watch of watchers) watch(next);
}

/** The person signed in on this browser, or null. */
export function currentUser() {
  return load()?.user ?? null;
}

/** Whether a real session exists — the only thing that earns the trust chip. */
export const isSignedIn = () => Boolean(load());

/** Told whenever the session appears, changes person, or goes. */
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
  keep({
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    user: session.user,
  });
  return session.user;
}

/** Forget the session on this browser. The server keeps its own record. */
export function signOut() {
  keep(null);
}

let refreshing = null;

/** Rotate the pair, once at a time however many callers ask at once. */
function refresh() {
  const session = load();
  if (!session?.refreshToken) return Promise.resolve(null);
  refreshing ??= api
    .refreshSession(session.refreshToken)
    .then((pair) => {
      keep({ ...load(), accessToken: pair.accessToken, refreshToken: pair.refreshToken });
      return pair.accessToken;
    })
    .catch(() => {
      // The refresh token is spent or revoked: this browser is signed out. Say
      // so plainly rather than leaving a session that cannot do anything.
      keep(null);
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
    keep({ ...load(), user });
    return user;
  } catch (error) {
    // A dead session goes; an API that simply is not running does not cost the
    // guest their sign-in — it will be there again when the API is.
    if (error?.status === 401) keep(null);
    return currentUser();
  }
}
