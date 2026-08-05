// THE INBOX — every request the guest has sent, and everything the churches
// have said back. Sorted by whose move it is, because that is the only question
// a waiting organizer actually has.

import * as session from '../../data/session.js';
import {
  bookingFor,
  effectiveRoom,
  guestApplications,
  occurrencesFor,
} from '../../data/store.js';
import { getVenue } from '../../data/venues.js';
import { el, replaceChildren } from '../dom.js';
import { lineFor } from '../notifications.js';
import { verifiedChip } from './sso.js';
import {
  isYourMove,
  plural,
  scheduleLine,
  statusLabel,
  statusNote,
  statusTone,
  timeAgo,
} from './copy.js';

const GROUPS = [
  { key: 'yours', title: 'Waiting on you', note: 'These need an answer from you before they can move.' },
  { key: 'waiting', title: 'With the hosts', note: 'Sent, and waiting for an answer.' },
  { key: 'settled', title: 'Settled', note: null },
  { key: 'closed', title: 'Closed', note: null },
];

export function createJournal({ announce, onOpen, onBrowse, ambientRows }) {
  const head = el('header', { class: 'journal__head' });
  const body = el('div', { class: 'journal__body' });
  const element = el('div', { class: 'guest__surface guest__surface--journal' }, [
    el('article', { class: 'journal' }, [head, body]),
  ]);

  // The names on a request are the request's own — steeple sends them with it,
  // and a venue this browser has never had in its scenery still reads properly.
  const roomNameOf = (app) => app.roomName ?? effectiveRoom(app.venueId, app.roomId)?.name ?? app.roomId;
  const venueNameOf = (app) => getVenue(app.venueId)?.shortName ?? app.venueName ?? app.venueId;

  function letterRow(app) {
    const venue = getVenue(app.venueId);
    const booking = app.status === 'approved' ? bookingFor(app.id) : null;
    const dates = booking ? occurrencesFor(booking.id).length : 0;

    const open = () => onOpen?.(app);
    return el('li', { class: 'jitem' }, [
      el(
        'button',
        {
          type: 'button',
          class: 'jrow',
          dataset: { tone: statusTone(app.status), status: app.status, id: app.id },
          onclick: open,
        },
        [
          el('span', { class: 'jrow__status' }, [
            el('span', { class: 'jrow__seal', 'aria-hidden': 'true' }),
            el('span', { text: statusLabel(app.status) }),
          ]),
          el('span', { class: 'jrow__space' }, [
            el('span', { class: 'jrow__room', text: roomNameOf(app) }),
            el('span', {
              class: 'jrow__venue',
              text: [venueNameOf(app), venue?.suburb].filter(Boolean).join(' · '),
            }),
          ]),
          el('span', { class: 'jrow__when', text: scheduleLine(app) }),
          el('span', { class: 'jrow__note', text: statusNote(app, { occurrences: dates }) }),
          el('span', { class: 'jrow__excerpt', text: app.intentText }),
          el('span', { class: 'jrow__sent', text: `Sent ${timeAgo(app.createdAt)}` }),
        ]
      ),
    ]);
  }

  /**
   * What steeple wrote while this person was away, at the head of the inbox.
   *
   * Not a second inbox and not a badge: three lines at most, the newest first,
   * read from the ambient surface's own cache (`ui/notifications.js`). A
   * reminder is worth seeing here whether or not its slip was caught in the
   * corner, so nothing is hidden on the strength of having been read.
   */
  function comingUp() {
    const rows = (ambientRows?.() ?? []).slice(0, 3);
    const lines = rows.map((row) => ({ row, text: lineFor(row) })).filter((one) => one.text);
    if (!lines.length) return null;
    return el('section', { class: 'jnotes' }, [
      el('h2', { class: 'eyebrow', text: 'Lately' }),
      el(
        'ul',
        { class: 'jnotes__list' },
        lines.map(({ row, text }) =>
          el('li', { class: 'jnotes__item', dataset: { kind: row.type } }, [
            el('span', { class: 'jnotes__dot', 'aria-hidden': 'true' }),
            el('span', { class: 'jnotes__line', text }),
          ])
        )
      ),
    ]);
  }

  function bucket(app) {
    if (isYourMove(app.status)) return 'yours';
    if (app.status === 'pending') return 'waiting';
    if (app.status === 'approved') return 'settled';
    return 'closed';
  }

  function render() {
    const apps = guestApplications();
    // Whose inbox this is is a fact about the session: the line names whoever is
    // signed in, and the trust chip is only earned by a session that exists.
    // The group beside their name is the one they gave with a request, when they
    // gave one — it belongs to the application, not to the account.
    const person = session.currentUser();
    const org = apps.find((a) => a.organizationName)?.organizationName ?? null;
    const needing = apps.filter((a) => isYourMove(a.status)).length;

    replaceChildren(head, [
      el('div', {}, [
        el('p', { class: 'eyebrow', text: 'Your requests' }),
        el('h1', { class: 'journal__title', text: 'Inbox' }),
        el('p', {
          class: 'journal__who',
          text: person ? (org ? `${org} · ${person.displayName}` : person.displayName) : '',
        }),
      ]),
      el('div', { class: 'journal__aside' }, [
        session.isSignedIn() ? verifiedChip() : null,
        el('p', {
          class: 'journal__tally',
          text: needing
            ? `${plural(needing, 'request', 'requests')} waiting on you`
            : apps.length
              ? `${plural(apps.length, 'request', 'requests')}, nothing waiting on you`
              : 'No requests yet',
        }),
      ]),
    ]);

    if (!apps.length) {
      replaceChildren(body, [
        comingUp(),
        el('p', { class: 'prose journal__empty', text: 'Nothing here yet. Find a space that suits your group and send your first request.' }),
        el('button', { type: 'button', class: 'pill', onclick: () => onBrowse?.() }, 'Find a space'),
      ]);
      return;
    }

    const sections = [comingUp()].filter(Boolean);
    for (const group of GROUPS) {
      const items = apps.filter((a) => bucket(a) === group.key);
      if (!items.length) continue;
      sections.push(
        el('section', { class: `jgroup jgroup--${group.key}` }, [
          el('div', { class: 'jgroup__head' }, [
            el('h2', { class: 'eyebrow', text: group.title }),
            group.note && el('p', { class: 'jgroup__note', text: group.note }),
          ]),
          el('ul', { class: 'jlist' }, items.map(letterRow)),
        ])
      );
    }
    sections.push(
      el('div', { class: 'journal__foot' }, [
        el('button', { type: 'button', class: 'linkish', onclick: () => onBrowse?.() }, 'Find another space'),
      ])
    );
    replaceChildren(body, sections);
  }

  function spoken() {
    const apps = guestApplications();
    const needing = apps.filter((a) => isYourMove(a.status));
    const lines = apps.map(
      (app) =>
        `${roomNameOf(app)} at ${venueNameOf(app)}: ${statusLabel(app.status).toLowerCase()}, ${scheduleLine(app)}`
    );
    return [
      `Inbox. ${plural(apps.length, 'request', 'requests')} in all,`,
      needing.length
        ? `${plural(needing.length, 'request', 'requests')} waiting on you.`
        : 'none waiting on you.',
      lines.join('. '),
    ].join(' ');
  }

  return { element, render, spoken };
}
