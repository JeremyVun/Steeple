// A REQUEST, OPENED — one application in full: what was asked, in the guest's
// own words; everything the host has said back; and whichever single decision
// is genuinely the guest's to make right now.

import {
  APP_STATUS,
  ORGANIZERS,
  UNDECIDED,
  acceptCounter,
  bookingFor,
  declineCounter,
  effectiveRoom,
  getApplication,
  occurrencesFor,
  openCounterFor,
  sendMessage,
  threadFor,
  todayIso,
  withdraw,
} from '../../data/store.js';
import { getVenue } from '../../data/venues.js';
import { priceParts } from '../copy.js';
import { el, replaceChildren } from '../dom.js';
import {
  formatDate,
  formatTimeRange,
  plural,
  scheduleSentence,
  statusLabel,
  statusNote,
  statusTone,
  timeAgo,
} from './copy.js';

export function createLetterView({ announce, onBack, onBrowse }) {
  let applicationId = null;
  let confirming = null; // 'withdraw' | 'declineCounter' | null

  const body = el('article', { class: 'opened', tabindex: '-1' });
  const element = el('div', { class: 'guest__surface guest__surface--opened' }, [body]);

  const reply = el('textarea', {
    class: 'field__input field__input--note',
    id: 'letter-reply',
    rows: '4',
    maxlength: '2000',
  });

  // ── pieces ────────────────────────────────────────────────────────────────

  function letterhead(app, venue, room) {
    const { amount, unit, free } = priceParts(room);
    return el('header', { class: 'opened__head', dataset: { tone: statusTone(app.status) } }, [
      el('div', { class: 'opened__heading' }, [
        el(
          'button',
          { type: 'button', class: 'linkish opened__up', onclick: () => onBack?.() },
          '← Inbox'
        ),
        el('h1', { class: 'opened__title', text: room.name }),
        el('p', { class: 'opened__from', text: `${venue.name} · ${venue.suburb}` }),
      ]),
      el('div', { class: 'opened__stamp' }, [
        el('p', { class: 'opened__status' }, [
          el('span', { class: 'opened__seal', 'aria-hidden': 'true' }),
          statusLabel(app.status),
        ]),
        el('p', { class: 'opened__sent', text: `Sent ${timeAgo(app.createdAt)}` }),
        el('p', { class: `price price--sm${free ? ' price--free' : ''}` }, [
          el('span', { class: 'price__amount', text: amount }),
          unit && el('span', { class: 'price__unit', text: unit }),
        ]),
      ]),
    ]);
  }

  function particulars(app) {
    const group = organizationOf(app);
    const rows = [
      ['When', scheduleSentence(app)],
      ['Who', [plural(app.groupSize, 'person', 'people'), group].filter(Boolean).join(' · ')],
      ['What', app.activityType],
    ];
    return el('dl', { class: 'particulars' }, rows.flatMap(([term, value]) => [
      el('dt', { class: 'eyebrow', text: term }),
      el('dd', { class: 'particulars__value', text: value }),
    ]));
  }

  function intentBlock(app, venue) {
    return el('section', { class: 'opened__note' }, [
      el('p', { class: 'opened__salutation', text: `Your note to ${venue.shortName}` }),
      el('p', { class: 'prose opened__prose', text: app.intentText }),
      el('p', { class: 'opened__sign', text: nameOf(app) }),
      el('p', { class: 'opened__signorg', text: organizationOf(app) }),
    ]);
  }

  // A request the service filed is signed by the person the service recorded;
  // one this browser filed alone is signed by the organizer the store knows.
  // Same two lines either way — nothing on the page announces which it was.
  const nameOf = (app) => app.organizerName ?? ORGANIZERS[app.organizerId]?.name ?? '';
  const organizationOf = (app) => app.organizationName ?? ORGANIZERS[app.organizerId]?.org ?? '';

  function counterBlock(app, venue, counter) {
    const decline = el(
      'button',
      {
        type: 'button',
        class: 'linkish',
        onclick: () => {
          confirming = confirming === 'declineCounter' ? null : 'declineCounter';
          render();
        },
      },
      'Keep my original time'
    );

    const declineNote = el('textarea', {
      class: 'field__input field__input--note',
      rows: '3',
      id: 'counter-note',
      placeholder: 'A line back to the host, if you would like to explain.',
    });

    const confirm = el('div', { class: 'counter__confirm' }, [
      el('label', { class: 'field__label', for: 'counter-note', text: 'Anything to say alongside it' }),
      declineNote,
      el('div', { class: 'counter__actions' }, [
        el(
          'button',
          {
            type: 'button',
            class: 'pill',
            onclick: () => {
              const note = declineNote.value;
              const result = declineCounter(app.id, note);
              confirming = null;
              announce?.(
                result.ok
                  ? `Your original time stands, and ${venue.shortName} has been told. The request is with the host again.`
                  : 'That suggestion is no longer open.'
              );
            },
          },
          'Send that back'
        ),
        el(
          'button',
          { type: 'button', class: 'linkish', onclick: () => { confirming = null; render(); } },
          'Cancel'
        ),
      ]),
    ]);

    return el('section', { class: 'counter' }, [
      el('p', { class: 'eyebrow', text: `${venue.shortName} suggests another time` }),
      counter.message && el('p', { class: 'prose counter__message', text: counter.message }),
      el('div', { class: 'counter__pair' }, [
        el('div', { class: 'counter__side' }, [
          el('h3', { class: 'counter__label', text: 'You asked for' }),
          el('p', { class: 'counter__sched', text: scheduleSentence(app) }),
        ]),
        el('div', { class: 'counter__side counter__side--theirs' }, [
          el('h3', { class: 'counter__label', text: 'The host suggests' }),
          el('p', { class: 'counter__sched', text: scheduleSentence(counter) }),
        ]),
      ]),
      el('div', { class: 'counter__actions' }, [
        el(
          'button',
          {
            type: 'button',
            class: 'pill pill--primary',
            onclick: () => {
              const result = acceptCounter(app.id);
              confirming = null;
              announce?.(
                result.ok
                  ? `Accepted. ${effectiveRoom(app.venueId, app.roomId)?.name} is booked — ${plural(
                      result.occurrences.length,
                      'date',
                      'dates'
                    )} held.`
                  : 'That time has since been taken. The host will need to suggest another.'
              );
              if (!result.ok) render();
            },
          },
          'Accept this time'
        ),
        decline,
      ]),
      confirming === 'declineCounter' && confirm,
    ]);
  }

  function occurrenceBlock(app) {
    const booking = bookingFor(app.id);
    if (!booking) return null;
    const dates = occurrencesFor(booking.id);
    const today = todayIso();
    const ahead = dates.filter((o) => o.date >= today);
    return el('section', { class: 'held' }, [
      el('div', { class: 'held__head' }, [
        el('h2', { class: 'eyebrow', text: 'Dates held for you' }),
        el('p', {
          class: 'held__tally',
          text: ahead.length
            ? `${plural(ahead.length, 'date', 'dates')} still to come of ${dates.length}`
            : `${plural(dates.length, 'date', 'dates')}, all now past`,
        }),
      ]),
      el(
        'ul',
        { class: 'held__list' },
        dates.map((o) =>
          el('li', { class: `held__item${o.date < today ? ' is-past' : ''}` }, [
            el('span', { class: 'held__date', text: formatDate(o.date, { weekday: true, short: true }) }),
            el('span', { class: 'held__time', text: formatTimeRange(o.start, o.end) }),
          ])
        )
      ),
    ]);
  }

  function threadBlock(app, venue) {
    const messages = threadFor(app.id);
    if (!messages.length && !UNDECIDED.has(app.status)) return null;
    const you = nameOf(app);
    return el('section', { class: 'thread' }, [
      el('h2', { class: 'eyebrow', text: messages.length ? 'What has been said' : 'Say something' }),
      el(
        'ol',
        { class: 'thread__list' },
        messages.map((m) =>
          el('li', { class: `thread__item thread__item--${m.sender}` }, [
            el('p', { class: 'thread__who' }, [
              el('span', { class: 'thread__name', text: m.sender === 'host' ? venue.shortName : you || 'You' }),
              el('span', { class: 'thread__when', text: timeAgo(m.sentAt) }),
            ]),
            el('p', { class: 'prose thread__body', text: m.body }),
          ])
        )
      ),
      UNDECIDED.has(app.status) && replyBlock(app, venue),
    ]);
  }

  function replyBlock(app, venue) {
    const asking = app.status === APP_STATUS.needsInfo;
    const button = el(
      'button',
      {
        type: 'button',
        class: `pill${asking ? ' pill--primary' : ''}`,
        onclick: () => {
          const text = reply.value.trim();
          if (!text) {
            announce?.('Write your answer first.');
            reply.focus();
            return;
          }
          const result = sendMessage(app.id, 'guest', text);
          if (!result.ok) {
            announce?.('That note could not be sent.');
            return;
          }
          reply.value = '';
          announce?.(
            asking
              ? `Your answer has gone to ${venue.shortName}. The request is back with the host, waiting for a decision.`
              : `Your note has gone to ${venue.shortName}.`
          );
        },
      },
      asking ? 'Send your answer' : 'Send this note'
    );

    return el('div', { class: `reply${asking ? ' reply--asked' : ''}` }, [
      el('label', {
        class: 'field__label',
        for: 'letter-reply',
        text: asking ? 'Your answer' : 'Add a note',
      }),
      reply,
      asking &&
        el('p', {
          class: 'reply__hint',
          text: 'Answering puts the request back with the host.',
        }),
      button,
    ]);
  }

  function closingBlock(app, venue) {
    if (app.status === APP_STATUS.declined) {
      // The kind note is often already in the thread; print it once, not twice.
      const said = threadFor(app.id).some((m) => m.body === app.declineNote);
      const note = app.declineNote && !said ? app.declineNote : null;
      return el('section', { class: 'closing closing--declined' }, [
        note && el('h2', { class: 'eyebrow', text: `${venue.shortName} could not host this` }),
        note && el('p', { class: 'prose closing__note', text: note }),
        el('button', { type: 'button', class: 'pill', onclick: () => onBrowse?.() }, 'Find another space'),
      ]);
    }
    if (!UNDECIDED.has(app.status)) return null;

    if (confirming === 'withdraw') {
      return el('section', { class: 'closing closing--confirm' }, [
        el('p', {
          class: 'prose prose--sm',
          text: 'Withdrawing takes this request back from the host. You can always ask again.',
        }),
        el('div', { class: 'closing__actions' }, [
          el(
            'button',
            {
              type: 'button',
              class: 'pill',
              onclick: () => {
                withdraw(app.id);
                confirming = null;
                announce?.('Withdrawn. The request is closed and the host has been told.');
              },
            },
            'Yes, withdraw it'
          ),
          el(
            'button',
            { type: 'button', class: 'linkish', onclick: () => { confirming = null; render(); } },
            'Keep it with the host'
          ),
        ]),
      ]);
    }
    return el('section', { class: 'closing' }, [
      el(
        'button',
        {
          type: 'button',
          class: 'linkish',
          onclick: () => { confirming = 'withdraw'; render(); },
        },
        'Withdraw this request'
      ),
    ]);
  }

  // ── render ────────────────────────────────────────────────────────────────

  function render() {
    const app = applicationId ? getApplication(applicationId) : null;
    if (!app) {
      replaceChildren(body, [
        el('p', { class: 'prose', text: 'That request is not in your inbox.' }),
        el('button', { type: 'button', class: 'pill', onclick: () => onBack?.() }, 'Inbox'),
      ]);
      return;
    }
    const venue = getVenue(app.venueId);
    const room = effectiveRoom(app.venueId, app.roomId);
    if (!venue || !room) return;
    const counter = openCounterFor(app.id);
    const booking = app.status === APP_STATUS.approved ? bookingFor(app.id) : null;

    replaceChildren(body, [
      letterhead(app, venue, room),
      el('p', { class: 'opened__state', text: statusNote(app, {
        occurrences: booking ? occurrencesFor(booking.id).length : 0,
      }) }),
      particulars(app),
      counter && counterBlock(app, venue, counter),
      booking && occurrenceBlock(app),
      intentBlock(app, venue),
      threadBlock(app, venue),
      closingBlock(app, venue),
    ]);
  }

  function spoken() {
    const app = applicationId ? getApplication(applicationId) : null;
    if (!app) return 'That request is not in your inbox.';
    const venue = getVenue(app.venueId);
    const room = effectiveRoom(app.venueId, app.roomId);
    const counter = openCounterFor(app.id);
    const booking = bookingFor(app.id);
    const messages = threadFor(app.id);
    return [
      `Your request for ${room?.name} at ${venue?.name}.`,
      `${statusLabel(app.status)}. ${statusNote(app, {
        occurrences: booking ? occurrencesFor(booking.id).length : 0,
      })}`,
      `You asked for ${scheduleSentence(app)}, for ${plural(app.groupSize, 'person', 'people')}, ${app.activityType}.`,
      counter
        ? `The host suggests ${scheduleSentence(counter)}. You can accept it or keep your original time.`
        : '',
      messages.length ? `${plural(messages.length, 'message', 'messages')} in the thread.` : '',
      app.status === APP_STATUS.needsInfo ? 'Answering returns the request to the host.' : '',
    ]
      .filter(Boolean)
      .join(' ');
  }

  return {
    element,
    open(id) {
      if (applicationId !== id) {
        confirming = null;
        reply.value = '';
      }
      applicationId = id;
      render();
      return Boolean(getApplication(id));
    },
    render,
    spoken,
    /** After a decision rebuilds the page, keyboard focus comes back to it. */
    focusBody: () => body.focus({ preventScroll: true }),
    get applicationId() {
      return applicationId;
    },
  };
}
