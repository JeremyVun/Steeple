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
import { markNotificationsRead, notifications, openNotificationStream } from '../data/correspondence.js';
import { consumeNotificationStream } from '../data/notificationStream.js';
import { createNotificationFeed } from '../data/notificationFeed.js';
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
  const feed = createNotificationFeed({
    snapshot: () => notifications({ pageSize: 24 }),
    markRead: markNotificationsRead,
    openStream: openNotificationStream,
    consumeStream: consumeNotificationStream,
    printable: isAmbient,
    changed: (rows) => bus.emit('notifications:change', { rows }),
    announce: (rows) => announce?.(rows.length === 1
      ? `${lineFor(rows[0])} It is in your inbox.`
      : `${rows.length} new messages in your inbox.`),
  });
  let pagePresent = true;
  const sync = () => feed.reconcile(session.currentUser()?.id ?? null,
    pagePresent && globalThis.document?.visibilityState !== 'hidden' && state.roll >= 1);
  const offSession = session.onSessionChange(sync);
  const pagehide = () => { pagePresent = false; sync(); };
  const pageshow = () => { pagePresent = true; sync(); };
  const online = () => { sync(); feed.wake(); };
  globalThis.document?.addEventListener('visibilitychange', sync);
  globalThis.window?.addEventListener('pagehide', pagehide);
  globalThis.window?.addEventListener('pageshow', pageshow);
  globalThis.window?.addEventListener('online', online);
  sync();

  async function open(row) {
    if (!row) return false;
    track('notification_opened', { type: row.type, channel: 'web' });
    void feed.receipt(row);
    const link = row.payload?.deepLink;
    if (!link) return false;
    if (state.roll < 1) rollTo(1);
    return followDeepLink(link);
  }
  function dispose() {
    offSession();
    globalThis.document?.removeEventListener('visibilitychange', sync);
    globalThis.window?.removeEventListener('pagehide', pagehide);
    globalThis.window?.removeEventListener('pageshow', pageshow);
    globalThis.window?.removeEventListener('online', online);
    feed.dispose();
  }
  return { read: feed.read, rows: feed.rows, wake: feed.wake, onRoll: sync, open, lineFor, dispose };
}
