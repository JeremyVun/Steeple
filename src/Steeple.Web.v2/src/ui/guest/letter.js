// A REQUEST, OPENED — one application in full: what was asked, in the guest's
// own words; everything the host has said back; and whichever single decision
// is genuinely the guest's to make right now.

import * as wire from '../../data/correspondence.js';
import {
  APP_STATUS,
  ORGANIZERS,
  UNDECIDED,
  bookingFor,
  effectiveRoom,
  getApplication,
  occurrencesFor,
  openCounterFor,
  threadFor,
  todayIso,
} from '../../data/store.js';
import { heldVenue } from '../../data/catalog.js';
import { priceParts } from '../copy.js';
import { el, replaceChildren } from '../dom.js';
import {
  FAILURE_LADDER,
  chargeWord,
  isTrouble,
  nextChargeLine,
  paymentLine,
  wasCharged,
} from '../money.js';
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

export function createLetterView({ announce, onBack, onBrowse, onFixPayment }) {
  let applicationId = null;
  let confirming = null; // 'withdraw' | 'declineCounter' | null
  // What steeple said when it last refused something here. It is not the
  // store's, so it is held apart and cleared the moment anything is tried again.
  let refusal = '';
  let working = false;
  let fetching = false;

  const body = el('article', { class: 'opened', tabindex: '-1' });
  const element = el('div', { class: 'guest__surface guest__surface--opened' }, [body]);

  /**
   * One move on this letter, at steeple.
   *
   * Nothing on the page changes before the answer arrives, and nothing changes
   * at all if the answer is no: the mirror is written by the wire itself
   * (data/correspondence.js), so a refusal leaves the letter exactly as it
   * stands rather than as this browser hoped it would (D5).
   */
  async function move(work, said) {
    if (working) return null;
    working = true;
    refusal = '';
    render();
    const answer = await work();
    working = false;
    if (!answer.ok) {
      refusal = answer.problem;
      render();
      announce?.(answer.problem);
      return null;
    }
    confirming = null;
    render();
    if (said) announce?.(said(answer.value));
    return answer.value;
  }

  const reply = el('textarea', {
    class: 'field__input field__input--note',
    id: 'letter-reply',
    rows: '4',
    maxlength: '2000',
  });

  // ── pieces ────────────────────────────────────────────────────────────────

  function letterhead(app, venue, room) {
    // A room this browser has no listing for has no price either, and "Free" is
    // what `priceParts` says about a price it was not given. Free listings were
    // removed in July: a missing figure now means unknown, never free, so the
    // head prints nothing rather than the one word that would be a lie about
    // money. What this booking actually costs is on the held block below, from
    // the booking's own snapshot.
    const priced = room.pricePerHour !== null && room.pricePerHour !== undefined;
    const { amount, unit, free } = priceParts(room);
    return el('header', { class: 'opened__head', dataset: { tone: statusTone(app.status) } }, [
      el('div', { class: 'opened__heading' }, [
        el(
          'button',
          { type: 'button', class: 'linkish opened__up', onclick: () => onBack?.() },
          '← Inbox'
        ),
        el('h1', { class: 'opened__title', text: room.name }),
        el('p', {
          class: 'opened__from',
          text: [venue.name, venue.suburb].filter(Boolean).join(' · '),
        }),
      ]),
      el('div', { class: 'opened__stamp' }, [
        el('p', { class: 'opened__status' }, [
          el('span', { class: 'opened__seal', 'aria-hidden': 'true' }),
          statusLabel(app.status),
        ]),
        el('p', { class: 'opened__sent', text: `Sent ${timeAgo(app.createdAt)}` }),
        priced
          ? el('p', { class: `price price--sm${free ? ' price--free' : ''}` }, [
              el('span', { class: 'price__amount', text: amount }),
              unit && el('span', { class: 'price__unit', text: unit }),
            ])
          : null,
      ].filter(Boolean)),
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

  // Every name on a request comes with the request. The village's own scenery
  // fills in what steeple has no field for — a short name, a suburb — and never
  // the other way round.
  const nameOf = (app) => app.organizerName ?? ORGANIZERS[app.organizerId]?.name ?? '';
  const organizationOf = (app) => app.organizationName ?? ORGANIZERS[app.organizerId]?.org ?? '';
  const roomNameOf = (app) => app.roomName ?? effectiveRoom(app.venueId, app.roomId)?.name ?? app.roomId;

  /** The venue as this page prints it, with or without scenery to draw on. */
  function venueOf(app) {
    const scenery = heldVenue(app.venueId);
    if (scenery) return scenery;
    const name = app.venueName ?? app.venueId;
    return { name, shortName: name, suburb: '' };
  }

  /** The room as this page prints it. Price is scenery's when steeple has none. */
  function roomOf(app) {
    return (
      effectiveRoom(app.venueId, app.roomId) ?? {
        name: roomNameOf(app),
        pricePerHour: null,
        capacity: app.groupSize,
      }
    );
  }

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
            onclick: async () => {
              const note = declineNote.value.trim();
              const declined = await move(
                () => wire.respondToCounter(app.id, false),
                () =>
                  `Your original time stands, and ${venue.shortName} has been told. The request is with the host again.`
              );
              // The line back is a message on the same thread, sent after the
              // decline lands — never instead of it.
              if (declined && note) await move(() => wire.sendMessage(app.id, note), null);
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
            onclick: () =>
              move(
                () => wire.respondToCounter(app.id, true),
                (updated) => {
                  const booking = bookingFor(updated.id);
                  const dates = booking ? occurrencesFor(booking.id).length : 0;
                  return `Accepted. ${roomNameOf(updated)} is booked${
                    dates ? ` — ${plural(dates, 'date', 'dates')} held` : ''
                  }.`;
                }
              ),
          },
          'Accept this time'
        ),
        decline,
      ]),
      confirming === 'declineCounter' && confirm,
    ]);
  }

  /**
   * The dates a yes actually holds, and what has happened to the money for each.
   *
   * Everything printed here comes from the booking's own **detail** read — the
   * one `wire.openApplication` pulls alongside the request. A list read names
   * bookings and carries no occurrence set at all, so a page can never be the
   * source of a date or a charge state (docs/contracts/payments.md; the
   * counter-offer eraser is the cautionary tale for reading anything off one).
   */
  function occurrenceBlock(app) {
    const booking = bookingFor(app.id);
    if (!booking) return null;
    const dates = occurrencesFor(booking.id);
    const today = todayIso();
    const ahead = dates.filter((o) => o.date >= today);
    const each = paymentLine(booking, 'guest');
    const next = nextChargeLine(booking);
    const failed = dates.some((o) => isTrouble(o.paymentStatus));
    const paid = dates.filter((o) => wasCharged(o.paymentStatus)).length;

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
      // The money, said before the dates it applies to — a person reading this
      // wants "what does it cost and when" before "which Tuesdays".
      each
        ? el('div', { class: 'held__money' }, [
            el('p', { class: 'held__rate', text: each }),
            next ? el('p', { class: 'held__next', text: next }) : null,
            paid ? el('p', { class: 'held__paid', text: `${plural(paid, 'date', 'dates')} paid so far.` }) : null,
          ].filter(Boolean))
        : null,
      failed ? failureBlock() : null,
      el(
        'ul',
        { class: 'held__list' },
        dates.map((o) => {
          const word = chargeWord(o.paymentStatus, 'guest');
          return el(
            'li',
            {
              class: `held__item${o.date < today ? ' is-past' : ''}`,
              dataset: { charge: o.paymentStatus ?? 'none' },
            },
            [
              el('span', { class: 'held__date', text: formatDate(o.date, { weekday: true, short: true }) }),
              el('span', { class: 'held__time', text: formatTimeRange(o.start, o.end) }),
              word
                ? el('span', {
                    class: `held__charge held__charge--${isTrouble(o.paymentStatus) ? 'trouble' : o.paymentStatus}`,
                    text: word,
                  })
                : null,
            ].filter(Boolean)
          );
        })
      ),
    ].filter(Boolean));
  }

  /**
   * A charge that did not go through, and exactly what happens next.
   *
   * Steeple's own ladder, in steeple's own order (payments.md §5): the card is
   * retried, and a date still unpaid 24 hours before it starts is released. Said
   * once, calmly, with the one thing that fixes it a press away — never as an
   * accusation, and never as a threat with no remedy attached.
   */
  function failureBlock() {
    return el('div', { class: 'held__failed', role: 'status' }, [
      el('p', { class: 'held__failedtitle', text: 'A payment did not go through' }),
      el('p', { class: 'prose prose--sm', text: FAILURE_LADDER }),
      onFixPayment
        ? el(
            'button',
            {
              type: 'button',
              class: 'pill pill--primary',
              dataset: { action: 'fix-payment' },
              onclick: () => onFixPayment(),
            },
            'Update your payment method'
          )
        : null,
    ].filter(Boolean));
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
        onclick: async () => {
          const text = reply.value.trim();
          if (!text) {
            announce?.('Write your answer first.');
            reply.focus();
            return;
          }
          const sent = await move(
            () => wire.sendMessage(app.id, text),
            () =>
              asking
                ? `Your answer has gone to ${venue.shortName}. The request is back with the host, waiting for a decision.`
                : `Your note has gone to ${venue.shortName}.`
          );
          // Only a note steeple took is a note that has been sent, so the box is
          // only emptied then — a failure leaves the words where they were typed.
          if (sent) {
            reply.value = '';
            render();
          }
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
              onclick: () =>
                move(
                  () => wire.withdraw(app.id),
                  () => 'Withdrawn. The request is closed and the host has been told.'
                ),
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
      // A cold link arrives before the wire answers: say it is being fetched
      // rather than that it does not exist, which is not yet known.
      replaceChildren(body, [
        el('p', {
          class: 'prose',
          text: fetching ? 'Opening this request…' : (refusal || 'That request is not in your inbox.'),
        }),
        el('button', { type: 'button', class: 'pill', onclick: () => onBack?.() }, 'Inbox'),
      ]);
      return;
    }
    const venue = venueOf(app);
    const room = roomOf(app);
    const counter = openCounterFor(app.id);
    const booking = app.status === APP_STATUS.approved ? bookingFor(app.id) : null;

    replaceChildren(body, [
      letterhead(app, venue, room),
      el('p', { class: 'opened__state', text: statusNote(app, {
        occurrences: booking ? occurrencesFor(booking.id).length : 0,
      }) }),
      // What steeple said the last time this page asked it for something. It
      // stands above the request because it is about the request, not about a
      // field in it.
      refusal ? el('p', { class: 'opened__refusal', role: 'alert', text: refusal }) : null,
      particulars(app),
      counter && counterBlock(app, venue, counter),
      booking && occurrenceBlock(app),
      intentBlock(app, venue),
      threadBlock(app, venue),
      closingBlock(app, venue),
    ]);
    // Set from the flag, never only to true: the page is rebuilt here, but the
    // habit is what keeps a control from staying dead after a redraw that is not.
    for (const control of body.querySelectorAll('button')) control.disabled = working;
  }

  function spoken() {
    const app = applicationId ? getApplication(applicationId) : null;
    if (!app) return 'That request is not in your inbox.';
    const venue = venueOf(app);
    const room = roomOf(app);
    const counter = openCounterFor(app.id);
    const booking = bookingFor(app.id);
    const messages = threadFor(app.id);
    const dates = booking ? occurrencesFor(booking.id) : [];
    const trouble = dates.some((o) => isTrouble(o.paymentStatus));
    return [
      `Your request for ${room?.name} at ${venue?.name}.`,
      `${statusLabel(app.status)}. ${statusNote(app, {
        occurrences: booking ? occurrencesFor(booking.id).length : 0,
      })}`,
      booking ? (paymentLine(booking, 'guest') ?? '') : '',
      booking ? (nextChargeLine(booking) ?? '') : '',
      trouble ? `A payment did not go through. ${FAILURE_LADDER}` : '',
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
        refusal = '';
        reply.value = '';
      }
      applicationId = id;
      fetching = true;
      render();
      // The thread lives behind the detail read, and only steeple has it. The
      // mirror draws the page at once; this makes it true a moment later — and
      // a cold link with nothing mirrored yet waits here rather than bouncing.
      wire.openApplication(id).then((answer) => {
        if (applicationId !== id) return;
        fetching = false;
        if (!answer.ok) refusal = answer.problem;
        render();
      });
      return true;
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
