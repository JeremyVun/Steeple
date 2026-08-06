// THE SESSION — who steeple thinks you are, and the proof it asks for.
//
// One module owns it. Nothing else in the app reads a token, and nothing else
// decides when one has expired: callers hand this module a piece of work that
// needs a bearer, and it runs it — refreshing once, quietly, if the access token
// has gone stale under them.
//
// Two things live in two different places, on purpose:
//
//   · the ROTATING REFRESH TOKEN is not here at all. It is an httpOnly cookie
//     steeple sets (`refreshTransport: 'cookie'`, CONTRACTS — identity) and the
//     browser presents by itself on every same-origin /api call. Script cannot
//     read it, which is the whole point: a ninety-day credential in
//     localStorage is a ninety-day credential in reach of anything that gets
//     onto the page.
//   · the ACCESS TOKEN lives in this module's memory and nowhere else. It is
//     worth fifteen minutes, and a reload simply asks for another.
//
// What localStorage still holds is the non-secret half — who is signed in, and
// why that last changed — so a reload shows the right name before the network
// answers, and so the OTHER TABS of this browser can be told. Tabs share one
// session: when one signs in, the rest adopt the person; when one signs out,
// the rest let go, and they are told whether that was asked for ('signedOut')
// or done to them ('expired').
//
// Two tabs also refresh at the same instant, which used to be fatal: rotation
// treats a re-presented token as theft and kills the family. steeple now
// answers a token rotated moments ago with its successor instead (the rotation
// grace window), so a race costs nothing — this file only has to not make the
// race worse, which it does by keeping one refresh in flight per tab and by
// re-reading what the other tabs have said before starting one.
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

/** The person this tab believes is signed in, or null. Never a token. */
let held = null;
/** The bearer, in memory only, for as long as this document lives. */
let access = null;
/** A refresh token found in storage from before the cookie: spent once, then gone. */
let inherited = null;
let loaded = false;
const watchers = new Set();

/**
 * Why the session changed, told to every watcher alongside the session itself.
 * Only 'expired' is news to the person — they did not ask for it — and the
 * interface says so out loud rather than letting a chip vanish (D6). The reason
 * is written down beside the profile so a sibling tab can relay the right one.
 */
export const REASON = {
  signedIn: 'signedIn',
  signedOut: 'signedOut',
  expired: 'expired',
  refreshed: 'refreshed',
};

function readRecord() {
  try {
    const raw = storage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Adopt what is written down. A record naming a person is a session; a record
 * naming nobody is a tombstone left by a sign-out, and carries the reason for it.
 */
function adopt(record) {
  held = record?.user?.id ? { user: record.user } : null;
  return held;
}

function load() {
  if (loaded) return held;
  loaded = true;
  const record = readRecord();
  adopt(record);

  // A session written before the refresh token moved into the cookie. Take the
  // pair out of storage and into memory at once — leaving it a moment longer
  // than necessary is the thing this change exists to stop — and spend the
  // refresh token once, on the rotation that moves this browser onto the cookie.
  if (record && (record.refreshToken || record.accessToken)) {
    inherited = record.refreshToken ?? null;
    write(held?.user ?? null, REASON.refreshed, { tell: false });
  }

  return held;
}

/** Write the non-secret record, and (unless told not to) tell this tab's watchers. */
function write(user, reason, { tell = true } = {}) {
  held = user ? { user } : null;
  loaded = true;
  if (!user) access = null;
  storage.setItem(KEY, JSON.stringify({ user: user ?? null, reason, stamp: Date.now() }));
  if (tell) notify(reason);
}

function notify(reason) {
  for (const watch of watchers) watch(held, reason);
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
 * nothing polls. It fires for what another tab did, too.
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
 * The refresh token is asked for as a cookie and never touches this file.
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
    refreshTransport: 'cookie',
  });
  access = session.accessToken;
  inherited = null;
  write(session.user, REASON.signedIn);
  return session.user;
}

/**
 * Sign out: here, and at steeple.
 *
 * The local half is unconditional and happens first. The revocation that
 * follows no longer depends on holding a live access token — steeple accepts
 * the refresh cookie as proof for this one call, which is what makes a sign-out
 * after a long lunch actually revoke something instead of failing quietly.
 *
 * `everywhere` revokes every session this person holds rather than this one
 * (`DELETE /me/sessions` — the shared-computer answer, CONTRACTS §4).
 *
 * @returns {Promise<void>} resolves once the revocation has been attempted.
 */
export async function signOut({ everywhere = false } = {}) {
  const token = access;
  inherited = null;
  write(null, REASON.signedOut);
  try {
    await (everywhere ? api.deleteAllSessions(token) : api.deleteSession(token));
  } catch {
    // Nothing to say and nothing to undo: this browser is signed out either
    // way, and an unrevoked refresh token expires on its own.
  }
}

let refreshing = null;

/**
 * Rotate the pair, once at a time however many callers ask at once.
 *
 * Resolves to the new access token, or to null when steeple refused — in which
 * case the session is dropped here and the person is told. It *rejects* only
 * when nothing answered at all: an API that is not running must not cost anyone
 * their sign-in.
 */
function refresh() {
  // Another tab may have signed this browser out while this one was waiting for
  // an answer. Ask storage before asking the network.
  if (!adopt(readRecord())) {
    access = null;
    return Promise.resolve(null);
  }

  refreshing ??= api
    .refreshSession(inherited ? { refreshToken: inherited, refreshTransport: 'cookie' } : {})
    .then((pair) => {
      inherited = null;
      access = pair.accessToken;
      return access;
    })
    .catch((error) => {
      if (!error?.status) throw error;
      // The refresh token is spent, revoked, or was never good: this browser is
      // signed out. Say so plainly rather than leaving a session that cannot do
      // anything — and say it to the person too, since nobody asked for this
      // (ui/notice.js).
      inherited = null;
      write(null, REASON.expired);
      return null;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

/**
 * Run one piece of work that needs a bearer token, refreshing if the API answers
 * 401 — or straight away, when this document has no access token yet, which is
 * every reload of a signed-in browser now that the token lives in memory. A
 * second 401 is an answer, not a hiccup: the session is dropped and the error is
 * raised for the caller to say something calm about.
 *
 * @template T
 * @param {(accessToken: string) => Promise<T>} work
 * @returns {Promise<T>}
 */
export async function withAccess(work) {
  if (!load()) throw new api.ApiError('not signed in', 401);

  let token = access;
  if (!token) {
    token = await refresh();
    if (!token) throw new api.ApiError('not signed in', 401);
  }

  try {
    return await work(token);
  } catch (error) {
    if (error?.status !== 401) throw error;
    let fresh = null;
    try {
      fresh = await refresh();
    } catch {
      throw error;
    }
    if (!fresh) throw error;
    return work(fresh);
  }
}

/**
 * Ask the API who this browser belongs to and hold the answer. Used at boot to
 * find out whether a remembered session is still good: with no access token in
 * memory, the cookie is presented first and the answer is a fresh pair, or a
 * refusal that signs the browser out.
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
    write(user, REASON.refreshed);
    return user;
  } catch (error) {
    // A dead session goes; an API that simply is not running does not cost the
    // guest their sign-in — it will be there again when the API is.
    // The refresh inside withAccess may already have said so; say it once.
    if (error?.status === 401 && load()) write(null, REASON.expired);
    return currentUser();
  }
}

// One session, however many tabs. The `storage` event fires in every OTHER
// document of this origin, which is the only news a tab gets about what its
// siblings did — a person signing in next door, or signing out.
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('storage', (event) => {
    // A null key is localStorage.clear(): everything went, including us.
    if (event.key !== null && event.key !== KEY) return;

    const record = readRecord();
    const before = held?.user?.id ?? null;
    const after = record?.user?.id ?? null;

    if (before === after) {
      // The same person, told again — a refreshed profile, not a change. Take
      // the newer copy quietly; there is nothing to announce.
      if (after) adopt(record);
      return;
    }

    loaded = true;
    // Whoever is here now, this tab holds no bearer for them: its own access
    // token belonged to the person who just left, and the next piece of work
    // will ask the cookie for a new one.
    access = null;
    inherited = null;
    adopt(record);
    notify(after ? REASON.signedIn : record?.reason === REASON.expired ? REASON.expired : REASON.signedOut);
  });
}
