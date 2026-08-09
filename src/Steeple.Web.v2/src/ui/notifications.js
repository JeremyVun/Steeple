// WHAT STEEPLE WROTE TO YOU — messages in the one inbox.
//
// The API writes an inbox (`GET /me/notifications`): a booking landed at a
// host's venue, a card was declined, an occurrence was refunded, a listing went
// live, a session is tomorrow. This file owns the reading of it — the fetch, the
// held rows, the one sentence each row is said in (`lineFor`), the deep link it
// opens onto, and the read receipt.
//
// It used to show them as corner slips: a transient that appeared once, marked
// itself read on sight and was gone twelve seconds later. That was ambience for
// a guest and a dead end for a host — news with nothing to press, arriving on a
// surface that then said "No requests yet" (owner review, 2026-08-09). Slips are
// gone. Every row is a **message in the inbox**: clickable, unread until it is
// opened, opened onto the surface that owns the fact, and marked read then and
// only then. People already know this shape; it is the one shape that lets a
// person act on what they were told.
//
// Nothing here is a bell and nothing here is a badge — the inbox is a place you
// go, and a message that goes unread nags nobody. The fact itself is never only
// here: the booking, the failed charge, the refund all live on the letter and
// the desk, which are read from steeple every time they are opened.
//
//   createNotifications({ announce }) -> { read, rows, wake, onRoll, open }

import { bus, rollTo, state } from '../core/bus.js';
import { track } from '../data/analytics.js';
import { markNotificationsRead, notifications } from '../data/correspondence.js';
import * as session from '../data/session.js';
import { followDeepLink } from './deepLink.js';

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
    case 'listingApproved':
      return `Your listing is live — ${where || 'your space'} can now be found and booked.`;
    case 'applicationMessage':
      return at.senderName
        ? `${at.senderName} sent you a message about ${where || 'your request'}.`
        : `There\u2019s a new message about ${where || 'your request'}.`;
    case 'applicationApproved': {
      const confirmed = `Your booking is confirmed — ${where || 'your space'}.`;
      return at.messageAdded
        ? `${confirmed} There\u2019s also a message from ${at.venueName || 'the host'}.`
        : confirmed;
    }
    case 'applicationDeclined':
      return `Your request for ${where || 'a space'} wasn\u2019t accepted.`;
    case 'ratingReceived':
      // Content-free by design: under the double blind the rating itself is
      // withheld until this person rates back, so saying what it was here would
      // be either a lie or a leak. The nudge and the honest truth are the same
      // sentence (D10).
      return `${ratedBy(at) ?? 'Someone'} rated a booking with you \u2014 rate back to see it.`;
    default:
      return null;
  }
}

/**
 * Who wrote the rating that just arrived.
 *
 * Steeple sends the same payload to both sides \u2014 the room, the venue and the
 * organizer, never a rater \u2014 because the notification is content-free on
 * purpose. The one thing that distinguishes the two readers is which of those
 * names is their own: a person told that a rating landed on a booking they
 * organized was rated by the venue, and everybody else on that booking keeps
 * its doors. Unsure is answered by naming nobody rather than by guessing.
 */
function ratedBy(payload) {
  const me = session.currentUser()?.displayName ?? null;
  if (!me) return null;
  if (payload.organizerName && payload.organizerName === me) return payload.venueName ?? null;
  return payload.organizerName ?? null;
}

/**
 * Whether this build prints this row as a message in the inbox. Having a
 * sentence IS the test: `lineFor`'s switch is the one place a new server-side
 * type is taught, and a type it has never heard of stays unprinted.
 */
export function isAmbient(row) {
  return Boolean(lineFor(row));
}

/** What the message's one way on should be called, for each kind. */
const ACTION_LABEL = {
  paymentFailed: 'Fix it',
  occurrenceRefunded: 'See the booking',
  bookingReceived: 'Open it',
  bookingReminder: 'See the details',
  listingApproved: 'View your listing',
  applicationMessage: 'Read message',
  applicationApproved: 'See your booking',
  applicationDeclined: 'See request',
  ratingReceived: 'Open the booking',
};

export function actionLabelFor(row) {
  if (row?.type === 'applicationApproved' && row.payload?.messageAdded) {
    return 'See booking & message';
  }
  return ACTION_LABEL[row?.type] ?? 'Open it';
}

export function createNotifications({ announce } = {}) {
  // Everything steeple last answered with, printable rows only, newest first.
  let held = [];
  // One read in flight at a time, and never a poll: this is asked when somebody
  // arrives, when the person changes, and when the inbox is opened.
  let reading = null;
  let asked = false;
  // Rows this page has already spoken aloud. The screen reader is the one
  // channel that cannot re-read a row later, so it must not repeat itself
  // either — and unlike the old slip, saying it here marks nothing read.
  const announced = new Set();

  async function pull() {
    if (!session.isSignedIn()) {
      held = [];
      return held;
    }
    const answer = await notifications({ pageSize: 24 });
    if (!answer.ok) return held;
    held = (answer.value.items ?? []).filter(isAmbient);
    bus.emit('notifications:change', { rows: held });
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

  /** Everything printable this browser holds — the inbox prints from this. */
  const rows = () => held;

  /**
   * A message, opened.
   *
   * Three things happen, in this order and for this reason: steeple is told the
   * row was read (a receipt this browser also applies locally, so the row stops
   * being bold before the round trip lands); the inbox is told to redraw; and
   * the deep link the row carries is followed to the surface that owns the fact
   * — the same follower an email CTA for the same event uses, so the two can
   * never land in different places (`ui/deepLink.js`).
   *
   * A row with no link is still a message and is still read when it is pressed;
   * it simply has nowhere further to go.
   */
  async function open(row) {
    if (!row) return false;
    track('notification_opened', { type: row.type, channel: 'web' });
    if (!row.readAt) {
      row.readAt = new Date().toISOString();
      announced.add(row.id);
      bus.emit('notifications:change', { rows: held });
      markNotificationsRead([row.id]);
    }
    const link = row.payload?.deepLink;
    if (!link) return false;
    if (state.roll < 1) rollTo(1);
    return followDeepLink(link);
  }

  /**
   * Say what has just arrived — to the screen reader alone.
   *
   * Nothing is drawn and nothing is marked read: this is the one channel that
   * cannot go back and look, so it is told once and the message stays unread in
   * the inbox for the press that opens it.
   */
  function announceNew() {
    // Under the title page nothing is said: somebody who has not arrived yet is
    // not being kept from anything.
    if (state.roll < 1) return;
    const fresh = held.filter((row) => !row.readAt && !announced.has(row.id));
    if (!fresh.length) return;
    for (const row of fresh) announced.add(row.id);
    announce?.(
      fresh.length === 1
        ? `${lineFor(fresh[0])} It is in your inbox.`
        : `${fresh.length} new messages in your inbox.`
    );
  }

  function wake() {
    return read({ again: true }).then(announceNew);
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
    announced.clear();
    asked = false;
    // Whoever is reading now has a different inbox — an empty one until this
    // answers, and the surfaces printing from it must not keep the last
    // person's messages on the page in the meantime.
    bus.emit('notifications:change', { rows: held });
    if (signedIn) wake();
  });

  // A remembered session means there may already be something to say; a visitor
  // who lands straight on the product surface (?world=off, a deep link) never
  // crosses the roll, so the first read cannot wait on it.
  if (session.isSignedIn() && state.roll >= 1) wake();
  else if (session.isSignedIn()) read();

  return { read, rows, wake, onRoll, open, lineFor };
}
