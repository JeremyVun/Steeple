// ARRIVING FROM AN EMAIL — `?goto=<url-encoded path>` (contracts/web.md).
//
// Every notification steeple sends carries a deep link, and every email CTA is
// `{WebBaseUrl}/?goto=<encoded deepLink>` — a query parameter rather than a
// path, because this SPA ships no server-side routes and nginx soft-404s
// anything it does not have a file for.
//
// The grammar is steeple's, and it is short:
//   /inbox/applications/{id}  → that request, opened
//   /inbox                    → the inbox
//   /bookings/{id}            → the request that booking came from, opened —
//                               which is where this app renders a booking today
//   /space/{venueSlug}/{roomSlug} → the listing
//
// Three outcomes, and only three:
//   · signed in and it resolves  → that surface opens;
//   · signed out                 → sign in first, then the same link is
//                                  followed, so a CTA never costs somebody
//                                  their place;
//   · anything else              → the village, and one quiet line saying so.
//
// The parameter is read once and taken out of the address bar immediately: a
// reload should land where the person now is, not where the email pointed a
// week ago.

import { rollTo, setView, state } from '../core/bus.js';
import * as api from '../data/api.js';
import { openApplication } from '../data/correspondence.js';
import * as session from '../data/session.js';
import { getApplication } from '../data/store.js';

/** Take `goto` off the URL and hand it back. Null when there was none. */
function claim() {
  if (typeof window === 'undefined') return null;
  const url = new URL(window.location.href);
  const asked = url.searchParams.get('goto');
  if (!asked) return null;
  url.searchParams.delete('goto');
  history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  // Only a path from steeple's own registry is followed — never an absolute URL
  // somebody put in a query string.
  return asked.startsWith('/') && !asked.startsWith('//') ? asked : null;
}

const parts = (path) => path.replace(/^\/+/, '').split('/').filter(Boolean);

/**
 * Follow one deep link. Returns false when it could not be honoured, which is
 * the caller's cue to say so quietly.
 *
 * Exported because an email is not the only thing that carries one: every
 * notification steeple writes carries the same `deepLink` in its payload, and
 * the ambient surface that shows those (`ui/notifications.js`) must land in
 * exactly the same place a CTA for the same event would. One grammar, one
 * follower — two would drift apart the first time the grammar grew.
 */
export async function followDeepLink(path) {
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//')) return false;
  return follow(path);
}

async function follow(path) {
  const [head, ...rest] = parts(path);

  if (head === 'space' && rest[0] && rest[1]) {
    setView('room', { venueId: rest[0], roomId: rest[1] });
    return true;
  }

  if (head === 'inbox' && !rest.length) {
    setView('journal');
    return true;
  }

  if (head === 'inbox' && rest[0] === 'applications' && rest[1]) {
    return openLetter(rest[1]);
  }

  if (head === 'bookings' && rest[0]) {
    // A booking is rendered as the request it came from — that letter carries
    // the dates, the thread and the decision. The booking names its own
    // application, so one read is enough to get there.
    const answer = await session
      .withAccess((token) => api.getBooking(rest[0], token))
      .catch(() => null);
    if (!answer?.applicationId) return false;
    return openLetter(answer.applicationId);
  }

  return false;
}

async function openLetter(applicationId) {
  const answer = await openApplication(applicationId);
  if (!answer.ok && !getApplication(applicationId)) return false;
  const app = getApplication(applicationId);
  setView('letter', {
    applicationId,
    venueId: app?.venueId ?? null,
    roomId: app?.roomId ?? null,
  });
  return true;
}

/**
 * Wire the arrival. Called once at boot with the way to say something quiet.
 *
 * @param {{notice?: {show: Function}, announce?: Function, signIn?: {open: Function}}} surfaces
 */
export function createDeepLink({ notice, announce, signIn } = {}) {
  const asked = claim();
  if (!asked) return { pending: () => null };

  let pending = asked;

  // Somebody sent here by an email is not arriving at the front door: the title
  // page is not the thing they were promised, so the page is already rolled
  // down to the product by the time the link resolves.
  const arrive = () => {
    if (state.roll < 1) rollTo(1);
  };

  function lost(line) {
    pending = null;
    arrive();
    setView('village');
    notice?.show(line);
    announce?.(line);
  }

  async function attempt() {
    const path = pending;
    if (!path) return;
    pending = null;
    arrive();
    const landed = await follow(path);
    if (!landed) {
      pending = path;
      lost('That link could not be opened. It may have been answered already.');
    }
  }

  if (session.isSignedIn()) {
    // A remembered session may be dead. Ask first: signing somebody out on the
    // way in from an email is worse than making them wait a moment.
    session.fetchCurrentUser().then(() => {
      if (session.isSignedIn()) return attempt();
      askToSignIn();
    });
  } else {
    askToSignIn();
  }

  function askToSignIn() {
    notice?.show('Sign in to open this.', {
      label: 'Sign in',
      onPick: () => signIn?.open(),
    });
    announce?.('Sign in to open the link you followed.');
    signIn?.open();
    // The link is held, not spent: whoever signs in next is taken there.
    const stop = session.onSessionChange((held) => {
      if (!held) return;
      stop();
      attempt();
    });
  }

  return { pending: () => pending };
}
