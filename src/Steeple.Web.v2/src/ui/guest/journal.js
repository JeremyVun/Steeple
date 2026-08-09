// THE INBOX — one inbox for everything addressed to this person: every message
// steeple has written to them, every request they have sent and what the venues
// said back, and — when they keep a venue — every request and booking a group
// has made with them. Sorted by whose move it is, because that is the only
// question a waiting person actually has. A hosting row opens the same letter
// the desk does (ui/host/index.js flips the lens on its own).
//
// Everything on this page is a thing you can press. That is the whole of the
// 2026-08-09 rework: news used to arrive here as flat unclickable lines under
// "Lately" while the hosting list showed only undecided requests, so a host on
// an instant-book venue read "Jeremy Vun booked some room" directly above "No
// requests yet" and had nowhere to go. Messages are now rows — unread until
// opened, and opening one is what marks it read (ui/notifications.js) — and the
// hosting side carries its settled and closed rows the way the guest side
// always has.

import * as session from '../../data/session.js';
import {
  UNDECIDED,
  bookingFor,
  effectiveRoom,
  guestApplications,
  hostedApplications,
  occurrencesFor,
  placedVenues,
} from '../../data/store.js';
import { heldVenue } from '../../data/catalog.js';
import { el, replaceChildren } from '../dom.js';
import { actionLabelFor, lineFor } from '../notifications.js';
import { verifiedChip } from './sso.js';
import {
  invitesGuestRating,
  isYourMove,
  messageWhen,
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

// The hosting side of the same inbox, in the host's own words — every state a
// request at somebody's venue can be in, open or decided. The desk is still
// where a venue is *managed*; this is the correspondence view of the same
// facts, and a settled booking is correspondence (owner review, 2026-08-09: a
// host on an instant-book venue has no undecided requests at all, and an inbox
// that showed only those showed them nothing).
const HOSTING_STATUS = {
  pending: { label: 'Waiting on you', tone: 'yours', note: 'A group is waiting for your answer.' },
  needsInfo: { label: 'You asked a question', tone: 'waiting', note: 'Waiting on their reply.' },
  counterOffered: {
    label: 'You suggested another time',
    tone: 'waiting',
    note: 'Waiting on their answer.',
  },
  approved: { label: 'Booked', tone: 'settled', note: null },
  declined: { label: 'You declined', tone: 'closed', note: 'You could not host this one.' },
  withdrawn: { label: 'Withdrawn', tone: 'closed', note: 'The group withdrew this request.' },
  expired: { label: 'Expired', tone: 'closed', note: 'This one expired without an answer.' },
};

// A booking this venue took whose dates have run out and which is still owed
// the host's rating. It keeps its settled bucket and its settled tone — it is
// an invitation, never a task that has gone wrong (D9) — and only its words
// change.
const HOSTING_FINISHED = {
  label: 'Finished',
  tone: 'settled',
  note: 'How was the group? You can rate them.',
};

export function createJournal({
  announce,
  onOpen,
  onOpenHosting,
  onBrowse,
  messageRows,
  onOpenMessage,
}) {
  const head = el('header', { class: 'journal__head' });
  const body = el('div', { class: 'journal__body' });
  const element = el('div', { class: 'guest__surface guest__surface--journal' }, [
    el('article', { class: 'journal' }, [head, body]),
  ]);

  // The names on a request are the request's own — steeple sends them with it,
  // and a venue this browser has never had in its scenery still reads properly.
  const roomNameOf = (app) => app.roomName ?? effectiveRoom(app.venueId, app.roomId)?.name ?? app.roomId;
  const venueNameOf = (app) => heldVenue(app.venueId)?.shortName ?? app.venueName ?? app.venueId;

  /**
   * A finished booking of this person's still owed their rating.
   *
   * The row keeps its bucket and its tone: rating is an invitation, not a task
   * that has gone wrong, so nothing here moves or reddens (D9). What it gets is
   * a question in the note and a `nudge` marker for styling to hang off.
   */
  const invitesRating = (app) => invitesGuestRating(bookingFor(app.id));

  /**
   * The same invitation, read from the other side of the letter.
   *
   * Not `invitesGuestRating`: that one asks after `byOrganizer`, which is the
   * organizer's own rating. A host owes `byVenue`, and steeple has already
   * decided whether they may still write it — `canRate` on a hosting read is
   * computed for the host who asked, so this only reads the answer (D2, D3).
   */
  const invitesHostRating = (app) => {
    const booking = bookingFor(app.id);
    const ratings = booking?.ratings;
    if (!ratings || ratings.byVenue) return false;
    return (
      ratings.canRate === true &&
      (booking.status === 'completed' || booking.status === 'cancelled')
    );
  };

  /**
   * The hosting rows in the guest side's own three buckets: what is still open,
   * what is settled (a booking standing, or one just finished and still owed a
   * word about how it went), and what is closed.
   *
   * Approved is settled whatever its dates have done, exactly as it is for the
   * guest — a booking that has run its course is not a request that failed.
   */
  function hostingRows() {
    const all = hostedApplications();
    const open = all.filter((a) => UNDECIDED.has(a.status));
    const decided = all.filter((a) => !UNDECIDED.has(a.status));
    return {
      open,
      settled: decided.filter((a) => a.status === 'approved'),
      closed: decided.filter((a) => a.status !== 'approved'),
      rateable: decided.filter(invitesHostRating),
    };
  }

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
          dataset: {
            tone: statusTone(app.status),
            status: app.status,
            id: app.id,
            ...(invitesRating(app) ? { nudge: 'rate' } : {}),
          },
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
          el('span', { class: 'jrow__meta' }, [
            el('span', { class: 'jrow__when', text: scheduleLine(app) }),
            el('span', { class: 'jrow__note', text: statusNote(app, { occurrences: dates, booking }) }),
          ]),
          quoted(app.intentText),
          el('span', { class: 'jrow__sent', text: `Sent ${timeAgo(app.createdAt)}` }),
        ]
      ),
    ]);
  }

  /**
   * What the group said they were coming for, set as the quotation it is.
   *
   * Rendered only when there are words: an empty span still took its share of
   * the row's rhythm, and a rule down the side of nothing is furniture.
   */
  const quoted = (text) => (text ? el('span', { class: 'jrow__excerpt', text }) : null);

  /**
   * One request a group has sent to a venue this person keeps. The headline is
   * who is asking — the one fact a host reads first — and the row opens the
   * host's letter, decisions and all.
   */
  function hostingRow(app) {
    const rateable = invitesHostRating(app);
    const held = HOSTING_STATUS[app.status] ?? HOSTING_STATUS.pending;
    const words = rateable ? HOSTING_FINISHED : held;
    const booking = app.status === 'approved' ? bookingFor(app.id) : null;
    // A booking says where it stands; every other state says its own sentence,
    // which is already written above. The date count is only claimed when this
    // browser actually holds the occurrences — the inbox's hosting read is a
    // list pass with no detail reads in it, so most of the time it does not
    // (data/correspondence.js `refreshHosted`), and a made-up "1 date held"
    // would be worse than the plain truth.
    const dates = booking ? occurrencesFor(booking.id).length : 0;
    const note =
      words.note ??
      (booking?.status === 'cancelled'
        ? 'This booking was cancelled.'
        : booking?.status === 'completed'
          ? 'This booking has run its course.'
          : dates
            ? `${plural(dates, 'date', 'dates')} held.`
            : 'Confirmed.');
    const who = app.organizationName ?? app.organizerName ?? 'A group';
    return el('li', { class: 'jitem' }, [
      el(
        'button',
        {
          type: 'button',
          class: 'jrow jrow--hosting',
          dataset: {
            tone: words.tone,
            status: app.status,
            id: app.id,
            ...(rateable ? { nudge: 'rate' } : {}),
          },
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
          el('span', { class: 'jrow__meta' }, [
            el('span', { class: 'jrow__when', text: scheduleLine(app) }),
            el('span', { class: 'jrow__note', text: note }),
          ]),
          quoted(app.intentText),
          el('span', { class: 'jrow__sent', text: `Sent ${timeAgo(app.createdAt)}` }),
        ]
      ),
    ]);
  }

  /** Every message steeple has written to this person, newest first. */
  const messages = () =>
    (messageRows?.() ?? []).map((row) => ({ row, text: lineFor(row) })).filter((one) => one.text);

  // How many messages are printed before the rest are folded away. Unread ones
  // are never folded — an inbox that hides what somebody has not read yet is
  // the one thing this shape must not do.
  const FIRST_FEW = 6;
  let showAllMessages = false;

  /**
   * One message: what happened, when, and the way to it.
   *
   * A press opens the surface that owns the fact and marks this row read, in
   * that order and through one seam (`ui/notifications.js` `open`) — so the row
   * a person just read stops being bold, and one they never pressed stays bold
   * across reloads. Unread is weight and a mark, never a count and never red.
   */
  function messageRow({ row, text }) {
    const unread = !row.readAt;
    return el('li', { class: 'jitem' }, [
      el(
        'button',
        {
          type: 'button',
          class: 'jmsg',
          dataset: { kind: row.type, id: row.id, ...(unread ? { unread: 'yes' } : {}) },
          onclick: () => onOpenMessage?.(row),
        },
        [
          el('span', { class: 'jmsg__mark', 'aria-hidden': 'true' }),
          el('span', { class: 'jmsg__line' }, [
            unread ? el('span', { class: 'visually-hidden', text: 'Unread. ' }) : null,
            el('span', { text }),
          ]),
          el('span', { class: 'jmsg__when', text: messageWhen(row.createdAtUtc) }),
          el('span', { class: 'jmsg__go', text: actionLabelFor(row) }),
        ]
      ),
    ]);
  }

  function messagesSection(lines) {
    if (!lines.length) return null;
    const unread = lines.filter((one) => !one.row.readAt).length;
    const folded = !showAllMessages && lines.length > FIRST_FEW;
    const shown = folded
      ? lines.filter((one, at) => at < FIRST_FEW || !one.row.readAt)
      : lines;
    return el('section', { class: 'jgroup jgroup--messages' }, [
      el('div', { class: 'jgroup__head' }, [
        el('h2', { class: 'eyebrow', text: 'Messages' }),
        unread
          ? el('p', { class: 'jgroup__note', text: `${unread} unread` })
          : null,
      ]),
      el('ul', { class: 'jlist' }, shown.map(messageRow)),
      folded
        ? el(
            'button',
            {
              type: 'button',
              class: 'linkish jmsg__more',
              onclick: () => {
                showAllMessages = true;
                render();
              },
            },
            `Show earlier messages (${lines.length - shown.length})`
          )
        : null,
    ]);
  }

  /**
   * What is actually waiting on this person, and what to call it.
   *
   * A nudge nobody counts is a nudge nobody sees, so a finished booking still
   * owed a rating counts here beside the requests that need an answer. It is
   * not a request, though, and calling it one would be a small lie — so the
   * moment the count stops being purely requests the noun goes away and the
   * line reads "3 waiting on you" (D8).
   *
   * Hosting rows contribute their pending requests. When the host surface adds
   * its own rate-eligible rows, they belong in `extra` — the naming rule then
   * holds for both sides without another branch.
   */
  function tally(apps, hosted, extra = 0) {
    const requests =
      apps.filter((a) => isYourMove(a.status)).length +
      hosted.filter((a) => a.status === 'pending').length;
    const rateable = apps.filter(invitesRating).length + extra;
    return {
      count: requests + rateable,
      /** The count in words: with a noun while everything in it is a request. */
      phrase: rateable
        ? String(requests + rateable)
        : plural(requests, 'request', 'requests'),
    };
  }

  function bucket(app) {
    if (isYourMove(app.status)) return 'yours';
    if (app.status === 'pending') return 'waiting';
    if (app.status === 'approved') return 'settled';
    return 'closed';
  }

  /** The hosting side, in the three buckets, under one heading. */
  function hostingSection({ open, settled, closed }) {
    // Deliberately not "Open · Booked · Closed": every row already prints its
    // own status in that column, and a heading that repeats the word under it
    // ("BOOKED / Booked") is furniture.
    const buckets = [
      { key: 'open', title: 'Still open', items: open },
      { key: 'settled', title: 'Bookings', items: settled },
      { key: 'closed', title: 'Closed', items: closed },
    ].filter((one) => one.items.length);
    if (!buckets.length) return null;
    return el('section', { class: 'jgroup jgroup--hosting' }, [
      el('div', { class: 'jgroup__head' }, [
        el('h2', { class: 'eyebrow', text: 'Hosting' }),
        el('p', { class: 'jgroup__note', text: 'Requests and bookings at your spaces.' }),
      ]),
      // One bucket needs no sub-heading: a host with nothing but bookings is
      // reading a list of bookings, and naming it twice is furniture.
      ...buckets.flatMap((one) => [
        buckets.length > 1 ? el('p', { class: 'jsub', text: one.title }) : null,
        el('ul', { class: 'jlist', dataset: { bucket: one.key } }, one.items.map(hostingRow)),
      ]),
    ]);
  }

  function render() {
    const apps = guestApplications();
    // Everything at this person's venues, when they keep any — open, booked and
    // closed alike. The desk is where a venue is managed; this is the same
    // facts as correspondence, and a host whose venue books instantly has no
    // open requests at all (owner review, 2026-08-09).
    const hosting = hostingRows();
    const { open: hosted, rateable: hostedRateable } = hosting;
    const lines = messages();
    const unread = lines.filter((one) => !one.row.readAt).length;
    // Whose inbox this is is a fact about the session: the line names whoever is
    // signed in, and the trust chip is only earned by a session that exists.
    // The group beside their name is the one they gave with a request, when they
    // gave one — it belongs to the application, not to the account.
    const person = session.currentUser();
    const org = apps.find((a) => a.organizationName)?.organizationName ?? null;
    const { count: needing, phrase } = tally(apps, hosted, hostedRateable.length);
    const total = apps.length + hosting.open.length + hosting.settled.length + hosting.closed.length;
    // Whether there is a hosting side to this inbox at all — asked of the
    // venues, not of the rows, so a host with an empty inbox is still read as a
    // host and never told to go and find a space for their group.
    const keepsVenue = placedVenues().some((v) => v.remoteId);

    replaceChildren(head, [
      el('div', {}, [
        el('p', { class: 'eyebrow', text: 'Correspondence' }),
        el('h1', { class: 'journal__title', text: 'Inbox' }),
        el('p', {
          class: 'journal__who',
          text: person ? (org ? `${org} · ${person.displayName}` : person.displayName) : '',
        }),
      ]),
      el('div', { class: 'journal__aside' }, [
        session.isSignedIn() ? verifiedChip() : null,
        // Unread mail is not a request waiting on anybody (D8) — so it is
        // counted on its own line, in its own words, rather than folded into
        // the tally. Without it the head said "Nothing waiting on you" over
        // three bold unread messages, which is true and reads as a denial.
        unread
          ? el('p', { class: 'journal__unread' }, [
              el('span', { class: 'journal__dot', 'aria-hidden': 'true' }),
              el('span', { text: `${unread} unread` }),
            ])
          : null,
        el('p', {
          class: 'journal__tally',
          // Only ever what is waiting: news is not a task, and inflating this
          // with unread messages would make the one line a person trusts lie
          // to them (D8 — and never the word "request" unless every one of
          // them is one).
          text: needing
            ? `${phrase} waiting on you`
            : total || lines.length || keepsVenue
              ? 'Nothing waiting on you'
              : 'No requests yet',
        }),
      ]),
    ]);

    // Nothing at all — no messages, no requests, nothing hosted. Which sentence
    // that deserves is a fact about who they are: somebody who keeps a space is
    // waiting for a group to find it, and telling them to go and find a space
    // for their group is answering a question they did not ask.
    if (!total && !lines.length) {
      replaceChildren(
        body,
        keepsVenue
          ? [
              el('p', {
                class: 'prose journal__empty',
                text: 'Nothing yet. When a group books one of your spaces or asks about it, it arrives here — and steeple writes to you here too.',
              }),
              el('div', { class: 'journal__foot' }, [
                el('button', { type: 'button', class: 'linkish', onclick: () => onBrowse?.() }, 'Find a space'),
              ]),
            ]
          : [
              el('p', {
                class: 'prose journal__empty',
                text: 'Nothing here yet. Find a space that suits your group and send your first request.',
              }),
              el('button', { type: 'button', class: 'pill', onclick: () => onBrowse?.() }, 'Find a space'),
            ]
      );
      return;
    }

    // Messages first — they are the newest thing on the page and the only part
    // of it that arrived rather than being asked for — then what this person is
    // hosting, then their own requests by whose move it is.
    const sections = [messagesSection(lines), hostingSection(hosting)].filter(Boolean);
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
    // The foot is for whoever is reading. Somebody who only keeps spaces is not
    // looking for one, and "Find another space" under a list of their own
    // bookings answers a question they did not ask — so a pure host's inbox
    // simply ends, the way a page of correspondence does. A host who has also
    // sent requests of their own is both, and keeps the nudge.
    if (!keepsVenue || apps.length) {
      sections.push(
        el('div', { class: 'journal__foot' }, [
          el('button', { type: 'button', class: 'linkish', onclick: () => onBrowse?.() }, 'Find another space'),
        ])
      );
    }
    replaceChildren(body, sections);
  }

  function spoken() {
    const apps = guestApplications();
    const hosting = hostingRows();
    const { open: hosted, rateable: hostedRateable } = hosting;
    const { count: needing, phrase } = tally(apps, hosted, hostedRateable.length);
    const lines = apps.map(
      (app) =>
        `${roomNameOf(app)} at ${venueNameOf(app)}: ${statusLabel(app.status).toLowerCase()}, ${scheduleLine(app)}`
    );
    const whoAsks = (app) => app.organizationName ?? app.organizerName ?? 'A group';
    const hostingLines = [
      ...hosted.map((app) => `${whoAsks(app)} asks for ${roomNameOf(app)}, ${scheduleLine(app)}`),
      ...hosting.settled.map(
        (app) =>
          `${whoAsks(app)} in ${roomNameOf(app)}, ${scheduleLine(app)}${
            invitesHostRating(app) ? ' — finished, and you can rate them' : ''
          }`
      ),
    ];
    const unread = messages().filter((one) => !one.row.readAt).length;
    const total = apps.length + hosted.length + hosting.settled.length + hosting.closed.length;
    return [
      'Inbox.',
      unread ? `${plural(unread, 'unread message', 'unread messages')}.` : '',
      total ? `${plural(total, 'request', 'requests')} in all,` : '',
      total ? (needing ? `${phrase} waiting on you.` : 'none waiting on you.') : '',
      hostingLines.length ? `Hosting: ${hostingLines.join('. ')}.` : '',
      lines.join('. '),
    ]
      .filter(Boolean)
      .join(' ');
  }

  /**
   * What this inbox would say is waiting on this person — the same tally the
   * head prints, in the same words, so the porch's badge and the page it opens
   * can never disagree about how many there are or what to call them.
   */
  function waiting() {
    const apps = guestApplications();
    const { open: hosted, rateable } = hostingRows();
    return tally(apps, hosted, rateable.length);
  }

  /** How many messages in this inbox nobody has opened yet. */
  const unread = () => messages().filter((one) => !one.row.readAt).length;

  return { element, render, spoken, waiting, unread };
}
