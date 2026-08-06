// WHAT STEEPLE WROTE WHILE YOU WERE AWAY — ambient, never a tab.
//
// The API has been writing an inbox for a while and this app has never read it
// (`GET /me/notifications`): a booking landed at a host's venue, a card was
// declined, an occurrence was refunded, a session is a week out, a session is
// tomorrow. Every one of those already has a **zero-click** channel — the email
// — and the deep link in it lands on the surface that owns the fact.
//
// So in-app this is deliberately not a second inbox with its own bell and its
// own unread count. There is one inbox in this product and it is the
// correspondence. What a visitor gets here is ambience: arrive, and the one
// thing that is about to happen to you is on the page, in the same quiet hand
// the session slip uses, with the way to it a press away. Nothing to click to
// find out; nothing to dismiss to get on.
//
// What that costs, and why it is the right cost: an ambient slip is shown once
// and marked read, so it does not nag on every visit. The fact itself is never
// only here — the booking, the failed charge, the refund all live on the letter
// and the desk, which are read from steeple every time they are opened. Losing
// a slip loses a reminder, never a fact.
//
//   createNotifications({ notice, announce }) -> { read, ambient }

import { rollTo, state } from '../core/bus.js';
import { track } from '../data/analytics.js';
import { markNotificationsRead, notifications } from '../data/correspondence.js';
import * as session from '../data/session.js';
import { followDeepLink } from './deepLink.js';

/**
 * The types that are worth saying without being asked. Everything else steeple
 * writes (an application received, a decision, a message) already lands on a
 * surface this person visits *for that reason*, and repeating it in the corner
 * would be the product talking over itself.
 */
const AMBIENT = new Set(['bookingReminder', 'paymentFailed', 'occurrenceRefunded', 'bookingReceived']);

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** A yyyy-MM-dd or an instant as the short date a person reads. */
function shortDate(value) {
  if (!value) return '';
  const at = /^\d{4}-\d{2}-\d{2}$/.test(String(value))
    ? new Date(`${value}T12:00:00`)
    : new Date(value);
  if (Number.isNaN(at.getTime())) return '';
  return `${MONTHS[at.getMonth()]} ${at.getDate()}`;
}

/**
 * One inbox row as one calm sentence, or null when this app has nothing to say
 * about it. An unknown type is deliberately silent rather than generic: the set
 * only ever grows, and a row this build has never heard of is better unsaid
 * than said badly.
 */
export function lineFor(row) {
  const at = row?.payload ?? {};
  const where = [at.roomName, at.venueName].filter(Boolean).join(' at ');
  switch (row?.type) {
    case 'bookingReminder':
      return at.reminderKind === 'tomorrow'
        ? `Tomorrow: ${where || 'your booking'}.`
        : `Coming up: ${where || 'your booking'}${at.localDate ? ` on ${shortDate(at.localDate)}` : ''}.`;
    case 'paymentFailed':
      return `A payment for ${where || 'your booking'} did not go through.`;
    case 'occurrenceRefunded':
      return `You have been refunded for ${where || 'a session'}${at.localDate ? ` on ${shortDate(at.localDate)}` : ''}.`;
    case 'bookingReceived':
      return `${at.organizerName ?? 'A group'} booked ${at.roomName ?? 'a space'}${at.localDate ? ` from ${shortDate(at.localDate)}` : ''}.`;
    default:
      return null;
  }
}

/** What the slip's one way on should be called, for each kind. */
const ACTION_LABEL = {
  paymentFailed: 'Fix it',
  occurrenceRefunded: 'See the booking',
  bookingReceived: 'Open it',
  bookingReminder: 'See the details',
};

export function createNotifications({ notice, announce } = {}) {
  // Everything steeple last answered with, ambient rows only, newest first.
  let held = [];
  // One read in flight at a time, and never a poll: this is asked when somebody
  // arrives and when the person changes, and at no other moment.
  let reading = null;
  let asked = false;
  // Rows already shown as a slip in this page's life. Steeple's own read receipt
  // is the durable half; this stops a second slip inside one visit while that
  // receipt is still travelling.
  const shown = new Set();

  async function pull() {
    if (!session.isSignedIn()) {
      held = [];
      return held;
    }
    const answer = await notifications({ pageSize: 24 });
    if (!answer.ok) return held;
    held = (answer.value.items ?? []).filter((row) => AMBIENT.has(row.type) && lineFor(row));
    return held;
  }

  function read({ again = false } = {}) {
    if (asked && !again && !reading) return Promise.resolve(held);
    asked = true;
    reading ??= pull().finally(() => {
      reading = null;
    });
    return reading;
  }

  /** The one thing most worth saying, or null when there is nothing. */
  function next() {
    return held.find((row) => !row.readAt && !shown.has(row.id)) ?? null;
  }

  /** Say it, once, and tell steeple it was delivered. */
  function speak() {
    // Under the title page nothing is said: somebody who has not arrived yet is
    // not being kept from anything, and a slip over the splash is an interruption
    // of a page they have not read.
    if (state.roll < 1) return;
    const row = next();
    if (!row) return;
    const line = lineFor(row);
    if (!line) return;
    shown.add(row.id);
    const link = row.payload?.deepLink;
    notice?.show(
      line,
      link
        ? {
            label: ACTION_LABEL[row.type] ?? 'Open it',
            onPick: () => {
              if (state.roll < 1) rollTo(1);
              followDeepLink(link);
            },
          }
        : null
    );
    announce?.(line);
    // Shown is delivered here — this app has no bell to press, so the slip
    // appearing on the page is the moment steeple's notification was opened.
    track('notification_opened', { type: row.type, channel: 'web' });
    markNotificationsRead([row.id]);
    // Held so `ambient()` stops offering it as unread the moment it was said.
    row.readAt = new Date().toISOString();
  }

  /** Everything ambient this browser holds — the journal prints from this. */
  const ambient = () => held;

  function wake() {
    read({ again: true }).then(speak);
  }

  // Arriving at the product surface is the moment: the roll landing is what
  // "visiting" means in this app, and it is when the page has room for a word.
  let wasRolled = state.roll >= 1;
  const onRoll = () => {
    const rolled = state.roll >= 1;
    if (rolled && !wasRolled) wake();
    wasRolled = rolled;
  };

  session.onSessionChange((signedIn) => {
    held = [];
    shown.clear();
    asked = false;
    if (signedIn) wake();
  });

  // A remembered session means there may already be something to say; a visitor
  // who lands straight on the product surface (?world=off, a deep link) never
  // crosses the roll, so the first read cannot wait on it.
  if (session.isSignedIn() && state.roll >= 1) wake();
  else if (session.isSignedIn()) read();

  return { read, ambient, wake, onRoll, lineFor };
}
