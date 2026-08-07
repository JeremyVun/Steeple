// THE INBOX — one inbox for everything addressed to this person: every request
// they have sent and what the venues said back, and — when they keep a venue —
// every request a group has sent them. Sorted by whose move it is, because that
// is the only question a waiting person actually has. A hosting row opens the
// same letter the desk does (ui/host/index.js flips the lens on its own).

import * as session from '../../data/session.js';
import {
  UNDECIDED,
  bookingFor,
  effectiveRoom,
  guestApplications,
  hostedApplications,
  occurrencesFor,
} from '../../data/store.js';
import { heldVenue } from '../../data/catalog.js';
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

// The hosting side of the same inbox, in the host's own words. Everything a
// request can be while it is still open; a decided one lives on the desk's
// record, not here.
const HOSTING_STATUS = {
  pending: { label: 'Waiting on you', tone: 'yours', note: 'A group is waiting for your answer.' },
  needsInfo: { label: 'You asked a question', tone: 'waiting', note: 'Waiting on their reply.' },
  counterOffered: {
    label: 'You suggested another time',
    tone: 'waiting',
    note: 'Waiting on their answer.',
  },
};

export function createJournal({ announce, onOpen, onOpenHosting, onBrowse, ambientRows }) {
  const head = el('header', { class: 'journal__head' });
  const body = el('div', { class: 'journal__body' });
  const element = el('div', { class: 'guest__surface guest__surface--journal' }, [
    el('article', { class: 'journal' }, [head, body]),
  ]);

  // The names on a request are the request's own — steeple sends them with it,
  // and a venue this browser has never had in its scenery still reads properly.
  const roomNameOf = (app) => app.roomName ?? effectiveRoom(app.venueId, app.roomId)?.name ?? app.roomId;
  const venueNameOf = (app) => heldVenue(app.venueId)?.shortName ?? app.venueName ?? app.venueId;

  function letterRow(app) {
    const venue = heldVenue(app.venueId);
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
   * One request a group has sent to a venue this person keeps. The headline is
   * who is asking — the one fact a host reads first — and the row opens the
   * host's letter, decisions and all.
   */
  function hostingRow(app) {
    const words = HOSTING_STATUS[app.status];
    const who = app.organizationName ?? app.organizerName ?? 'A group';
    return el('li', { class: 'jitem' }, [
      el(
        'button',
        {
          type: 'button',
          class: 'jrow jrow--hosting',
          dataset: { tone: words.tone, status: app.status, id: app.id },
          onclick: () => onOpenHosting?.(app),
        },
        [
          el('span', { class: 'jrow__status' }, [
            el('span', { class: 'jrow__seal', 'aria-hidden': 'true' }),
            el('span', { text: words.label }),
          ]),
          el('span', { class: 'jrow__space' }, [
            el('span', { class: 'jrow__room', text: who }),
            el('span', {
              class: 'jrow__venue',
              text: [roomNameOf(app), venueNameOf(app)].filter(Boolean).join(' · '),
            }),
          ]),
          el('span', { class: 'jrow__when', text: scheduleLine(app) }),
          el('span', { class: 'jrow__note', text: words.note }),
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
    // The open requests at this person's venues, when they keep any. Decided
    // ones live on the desk's record — the inbox carries what still moves.
    const hosted = hostedApplications().filter((a) => UNDECIDED.has(a.status));
    // Whose inbox this is is a fact about the session: the line names whoever is
    // signed in, and the trust chip is only earned by a session that exists.
    // The group beside their name is the one they gave with a request, when they
    // gave one — it belongs to the application, not to the account.
    const person = session.currentUser();
    const org = apps.find((a) => a.organizationName)?.organizationName ?? null;
    const needing =
      apps.filter((a) => isYourMove(a.status)).length +
      hosted.filter((a) => a.status === 'pending').length;
    const total = apps.length + hosted.length;

    replaceChildren(head, [
      el('div', {}, [
        el('p', { class: 'eyebrow', text: 'Requests' }),
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
            : total
              ? `${plural(total, 'request', 'requests')}, nothing waiting on you`
              : 'No requests yet',
        }),
      ]),
    ]);

    if (!total) {
      replaceChildren(body, [
        comingUp(),
        el('p', { class: 'prose journal__empty', text: 'Nothing here yet. Find a space that suits your group and send your first request.' }),
        el('button', { type: 'button', class: 'pill', onclick: () => onBrowse?.() }, 'Find a space'),
      ]);
      return;
    }

    const sections = [comingUp()].filter(Boolean);
    if (hosted.length) {
      sections.push(
        el('section', { class: 'jgroup jgroup--hosting' }, [
          el('div', { class: 'jgroup__head' }, [
            el('h2', { class: 'eyebrow', text: 'Hosting' }),
            el('p', { class: 'jgroup__note', text: 'Requests from groups for your spaces.' }),
          ]),
          el('ul', { class: 'jlist' }, hosted.map(hostingRow)),
        ])
      );
    }
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
    const hosted = hostedApplications().filter((a) => UNDECIDED.has(a.status));
    const needing =
      apps.filter((a) => isYourMove(a.status)).length +
      hosted.filter((a) => a.status === 'pending').length;
    const lines = apps.map(
      (app) =>
        `${roomNameOf(app)} at ${venueNameOf(app)}: ${statusLabel(app.status).toLowerCase()}, ${scheduleLine(app)}`
    );
    const hostingLines = hosted.map(
      (app) =>
        `${app.organizationName ?? app.organizerName ?? 'A group'} asks for ${roomNameOf(app)}, ${scheduleLine(app)}`
    );
    return [
      `Inbox. ${plural(apps.length + hosted.length, 'request', 'requests')} in all,`,
      needing
        ? `${plural(needing, 'request', 'requests')} waiting on you.`
        : 'none waiting on you.',
      hostingLines.length ? `Hosting: ${hostingLines.join('. ')}.` : '',
      lines.join('. '),
    ]
      .filter(Boolean)
      .join(' ');
  }

  return { element, render, spoken };
}
