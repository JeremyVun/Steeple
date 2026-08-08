// HOSTING — a desk in three parts: Bookings, Requests, Spaces.
//
// **Bookings** is the primary noun now, and it is deliberate. A venue books
// instantly by default (docs/backlog/booking-modes.md), so most hosts never
// answer a request at all — what they have is a list of confirmed dates, who
// holds them, and what has been paid for each. The one lever over a confirmed
// booking is the host's cancel, and it is asymmetric: it frees every remaining
// date and refunds everything charged, so it is asked for twice and never
// offered casually.
//
// **Requests** exists only where requests do — a venue in `manual` mode, or one
// that has just left manual with answers still owed. An instant venue's desk has
// no Requests tab at all: a tab that can only ever be empty is a tab that
// teaches the wrong model of the product.
//
// **Spaces** is the rooms, and how the venue takes bookings. The venue's own
// name and address are corrected where they are read — the pencil beside the
// address in the head — rather than in a second copy of them further down.
//
// Two rendering languages share the request pile (?desk=board | ledger): the
// board sets each request as a card, the ledger sets the same week as a day-book
// line with the schedule ribbon beside it.

import * as wire from '../../data/correspondence.js';
import {
  occurrencesFor,
  placedVenues,
  setHostVenue,
  todayIso,
  venueBookings,
} from '../../data/store.js';
import { priceText } from '../copy.js';
import { el, replaceChildren } from '../dom.js';
import {
  FAILURE_LADDER_HOST,
  RESCIND_WARNING,
  chargeWord,
  isTrouble,
  money,
  nextChargeLine,
  paymentLine,
} from '../money.js';
import {
  STATUS_WORD,
  deskLetters,
  deskVenues,
  fmtDate,
  fmtTimeRange,
  hoursSummary,
  organizerOf,
  readSchedule,
  roomsOf,
  scheduleLine,
  scheduleOf,
  venueOf,
} from './model.js';
import { publishState } from './manage.js';
import { createRibbon } from './ribbon.js';

const VERIFIED_LABEL = 'Identity verified';
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// How a venue takes bookings, in one short sentence each. The host is choosing
// between "the calendar answers for me" and "I answer" — nothing else.
const MODE_WORDS = {
  instant: {
    label: 'Books instantly',
    blurb: 'A group that fits your open hours books on the spot, and you are told.',
  },
  manual: {
    label: 'I approve each request',
    blurb: 'Nothing is booked or charged until you say yes.',
  },
};

const PENCIL_ICON =
  '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" focusable="false">' +
  '<path d="M1.6 14.4 2.4 11.3 10.9 2.8a1.9 1.9 0 0 1 2.7 2.7l-8.5 8.5Z" fill="none" ' +
  'stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>' +
  '<path d="M10.2 3.5 12.9 6.2" fill="none" stroke="currentColor" stroke-width="1.4" ' +
  'stroke-linecap="round"/></svg>';

/**
 * One reading of where a room stands, for the tag on its row and the line that
 * counts them — which used to call a room whose publish request steeple has
 * recorded "still in draft", the one thing it is not. `kept` is the room this
 * browser published while steeple was away: live here, unknown to the service.
 */
const roomState = (room) =>
  room.status === 'published' && room.keptLocally === true ? 'kept' : publishState(room);

const STATE_WORDS = {
  published: { tag: 'Published', tone: 'published', counted: 'published' },
  review: { tag: 'In review', tone: 'review', counted: 'in review' },
  draft: { tag: 'Draft', tone: 'draft', counted: 'in draft' },
  kept: { tag: 'On this device', tone: 'review', counted: 'on this device only' },
};

function verifiedChip(text = VERIFIED_LABEL, className = 'verified verified--sm') {
  return el('span', { class: className }, [
    el('span', { class: 'verified__dot', 'aria-hidden': 'true' }),
    text,
  ]);
}

export function createDesk({
  variant: opening,
  onOpenLetter,
  onListing,
  onVariant,
  onVenue,
  onSetUpPayouts,
  announce,
}) {
  const head = el('header', { class: 'desk__head' });
  const body = el('div', { class: 'desk__body' });
  const foot = el('footer', { class: 'desk__foot' });
  const element = el('section', { class: 'desk', 'aria-label': 'Hosting' }, [head, body, foot]);

  let tab = 'bookings';
  let venueId = null;
  // Which booking is being cancelled, if any: a rescind is a two-press action,
  // and the warning is the first press.
  let rescinding = null;
  let working = false;
  // What steeple last said no to here. Not the store's, so it is held apart and
  // cleared the moment anything is tried again.
  let refusal = '';
  // Where this venue stands with payouts (`GET /manage/venues/{id}/payments`),
  // as the host flow last read it. Null = not asked yet, which is not the same
  // sentence as "not set up" and must never be printed as one.
  let payouts = null;
  // Whether steeple is still being asked what this person looks after. "None
  // yet" and "not asked yet" are different sentences and must read differently.
  let reading = true;
  // The instrument the same truth is set in. `?desk=` opens on one of them;
  // after that it is a switch on the desk, and changing it costs one render.
  let variant = opening;

  // ── the requests ──────────────────────────────────────────────────────────

  // The room a request names. steeple sends the room's name with the request,
  // so a desk can print it before it has read its own venue back.
  const roomOnRequest = (application) =>
    venueOf(application.venueId, placedVenues())?.rooms?.find((r) => r.id === application.roomId) ??
    (application.roomName ? { name: application.roomName } : null);

  function signalOf(application) {
    const read = readSchedule(application.venueId, application.roomId, scheduleOf(application));
    const note = read.notes[0];
    return { tone: note.tone, text: note.text, read };
  }

  function letterCard(application) {
    const organizer = organizerOf(application);
    const room = roomOnRequest(application);
    const signal = signalOf(application);
    const intent = application.intentText;

    return el(
      'button',
      {
        type: 'button',
        class: 'card',
        dataset: { status: application.status, application: application.id },
        onclick: () => onOpenLetter(application),
      },
      [
        el('span', { class: 'card__status', text: STATUS_WORD[application.status] }),
        el('span', { class: 'card__from', text: organizer.org ?? organizer.name }),
        // The mark is a fact about the person who asked, not a decoration on
        // the card: an organizer steeple has not confirmed does not carry one.
        el('span', {
          class: 'card__who',
          text: organizer.verified
            ? organizer.org
              ? `${organizer.name} · ${VERIFIED_LABEL}`
              : VERIFIED_LABEL
            : organizer.org
              ? organizer.name
              : '',
        }),
        el('span', {
          class: 'card__room',
          text: `${room?.name ?? application.roomId} · ${plural(application.groupSize, 'person', 'people')}`,
        }),
        el('span', { class: 'card__when', text: scheduleLine(application) }),
        el('span', { class: 'card__intent', text: intent }),
        el('span', { class: `card__signal card__signal--${signal.tone}`, text: signal.text }),
      ]
    );
  }

  function ledgerRow(application) {
    const organizer = organizerOf(application);
    const room = roomOnRequest(application);
    const signal = signalOf(application);
    const ribbon = createRibbon({ compact: true });
    ribbon.update({
      venueId: application.venueId,
      roomId: application.roomId,
      proposal: scheduleOf(application),
      exceptApplicationId: application.id,
    });

    return el(
      'button',
      {
        type: 'button',
        class: 'row',
        dataset: { status: application.status, application: application.id },
        onclick: () => onOpenLetter(application),
      },
      [
        el('span', { class: 'row__main' }, [
          el('span', { class: 'row__from', text: organizer.org ?? organizer.name }),
          el('span', {
            class: 'row__room',
            text: `${room?.name ?? application.roomId} · ${plural(
              application.groupSize,
              'person',
              'people'
            )} · ${organizer.name}`,
          }),
          el('span', { class: 'row__when', text: scheduleLine(application) }),
        ]),
        el('span', { class: 'row__ribbon' }, ribbon.element),
        el('span', { class: 'row__side' }, [
          el('span', { class: 'card__status', text: STATUS_WORD[application.status] }),
          el('span', { class: `card__signal card__signal--${signal.tone}`, text: signal.text }),
        ]),
      ]
    );
  }

  function recordRow(application) {
    const organizer = organizerOf(application);
    const room = roomOnRequest(application);
    return el(
      'li',
      { class: 'record__item' },
      el(
        'button',
        {
          type: 'button',
          class: 'record__row',
          dataset: { status: application.status, application: application.id },
          onclick: () => onOpenLetter(application),
        },
        [
          el('span', { class: 'record__who', text: organizer.org ?? organizer.name }),
          el('span', { class: 'record__room', text: room?.name ?? application.roomId }),
          el('span', { class: 'record__when', text: scheduleLine(application) }),
          el('span', {
            class: 'record__status',
            dataset: { status: application.status },
            text: application.decidedAt
              ? `${STATUS_WORD[application.status]} ${fmtDate(application.decidedAt.slice(0, 10))}`
              : STATUS_WORD[application.status],
          }),
        ]
      )
    );
  }

  // ── the bookings ──────────────────────────────────────────────────────────

  /** Confirmed bookings with a date still to come, soonest first. */
  function standing() {
    const today = todayIso();
    return venueBookings(venueId)
      .filter((booking) => booking.status === 'confirmed')
      .map((booking) => ({
        booking,
        dates: occurrencesFor(booking.id).filter((o) => o.status !== 'cancelled'),
      }))
      .filter((entry) => entry.dates.some((o) => o.date >= today))
      .sort((a, b) => (a.dates[0]?.date < b.dates[0]?.date ? -1 : 1));
  }

  /** One move on a booking, at steeple. Nothing changes here unless it answers. */
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
    rescinding = null;
    render();
    if (said) announce?.(said);
    return answer.value;
  }

  function dateChip(occurrence, side = 'host') {
    const word = chargeWord(occurrence.paymentStatus, side);
    return el(
      'li',
      {
        class: `dates__item${occurrence.date < todayIso() ? ' is-past' : ''}`,
        dataset: { charge: occurrence.paymentStatus ?? 'none' },
      },
      [
        el('span', { class: 'dates__day', text: fmtDate(occurrence.date, true) }),
        el('span', { class: 'dates__hours', text: fmtTimeRange(occurrence.start, occurrence.end) }),
        word
          ? el('span', {
              class: `dates__charge dates__charge--${isTrouble(occurrence.paymentStatus) ? 'trouble' : occurrence.paymentStatus}`,
              text: word,
            })
          : null,
      ].filter(Boolean)
    );
  }

  function rescindBlock(booking) {
    if (rescinding !== booking.id) {
      return el(
        'button',
        {
          type: 'button',
          class: 'linkish booking__rescind',
          dataset: { booking: booking.id, action: 'cancel' },
          onclick: () => {
            rescinding = booking.id;
            refusal = '';
            render();
          },
        },
        'Cancel this booking'
      );
    }

    const reason = el('textarea', {
      class: 'field__input field__input--note',
      id: 'rescind-note',
      rows: '3',
      maxlength: '500',
      placeholder: 'A line to the group, if you can give one.',
    });

    return el('div', { class: 'booking__confirm' }, [
      el('p', { class: 'prose prose--sm booking__warning', text: RESCIND_WARNING }),
      el('label', { class: 'field__label', for: 'rescind-note', text: 'Why, in your words' }),
      reason,
      el('div', { class: 'booking__actions' }, [
        el(
          'button',
          {
            type: 'button',
            class: 'pill',
            dataset: { booking: booking.id, action: 'cancel-confirm' },
            onclick: () =>
              move(
                () => wire.cancelBooking(booking.id, reason.value),
                'Cancelled. Every remaining date is free again and the group has been refunded in full.'
              ),
          },
          'Yes, cancel it'
        ),
        el(
          'button',
          {
            type: 'button',
            class: 'linkish',
            onclick: () => {
              rescinding = null;
              render();
            },
          },
          'Keep the booking'
        ),
      ]),
    ]);
  }

  function bookingCard({ booking, dates }) {
    const today = todayIso();
    const ahead = dates.filter((o) => o.date >= today);
    const trouble = dates.filter((o) => isTrouble(o.paymentStatus));
    const each = paymentLine(booking, 'host');
    const next = nextChargeLine(booking);

    return el(
      'article',
      { class: 'booking', dataset: { booking: booking.id, room: booking.roomId } },
      [
        el('header', { class: 'booking__head' }, [
          el('div', { class: 'booking__heading' }, [
            el('h3', { class: 'booking__room', text: booking.roomName ?? booking.roomId }),
            el('p', {
              class: 'booking__who',
              text: booking.organizerName ?? 'The group',
            }),
          ]),
          el('div', { class: 'booking__stamp' }, [
            el('span', { class: 'tag tag--published', text: 'Confirmed' }),
            each ? el('p', { class: 'booking__rate', text: each }) : null,
          ].filter(Boolean)),
        ]),
        el('p', { class: 'booking__when', text: scheduleLine(booking) }),
        el('p', {
          class: 'booking__tally',
          text: `${plural(ahead.length, 'date', 'dates')} still to come of ${dates.length}`,
        }),
        next ? el('p', { class: 'booking__next', text: next }) : null,
        trouble.length
          ? el('p', { class: 'booking__trouble', text: FAILURE_LADDER_HOST })
          : null,
        el('ul', { class: 'dates' }, dates.map((o) => dateChip(o, 'host'))),
        rescindBlock(booking),
      ].filter(Boolean)
    );
  }

  // ── payouts ───────────────────────────────────────────────────────────────
  //
  // Payout state gates nothing in the mock era (docs/contracts/payments.md):
  // priced bookings charge whether or not a venue has onboarded. So this is a
  // prompt, never a wall — and it is only shown once there is real money behind
  // it, because "set up payouts" before a single booking is a chore with no
  // reason attached to it.

  function payoutPrompt(entries) {
    if (!payouts || payouts.payoutsEnabled) return null;
    const owed = entries.reduce((total, entry) => {
      const amount = Number(entry.booking.payment?.perOccurrenceAmount ?? 0);
      if (!Number.isFinite(amount) || entry.booking.payment?.mode !== 'inApp') return total;
      return total + amount * entry.dates.filter((o) => o.paymentStatus === 'succeeded').length;
    }, 0);
    const priced = entries.some((entry) => entry.booking.payment?.mode === 'inApp');
    if (!priced) return null;
    const currency = entries.find((e) => e.booking.payment?.currency)?.booking.payment?.currency;

    return el('section', { class: 'payout', dataset: { state: payouts.onboardingStarted ? 'started' : 'none' } }, [
      el('p', { class: 'eyebrow', text: 'Payouts' }),
      el('p', {
        class: 'prose prose--sm',
        text: owed > 0
          ? `Set up payouts to receive ${money(owed, currency)}. It is held safely until then — nothing is lost by waiting.`
          : 'Set up payouts so the money from your bookings can reach you.',
      }),
      el(
        'button',
        {
          type: 'button',
          class: 'pill pill--primary',
          dataset: { action: 'payouts' },
          onclick: () => onSetUpPayouts?.(venueId),
        },
        payouts.onboardingStarted ? 'Finish setting up payouts' : 'Set up payouts'
      ),
    ]);
  }

  function payoutConnected() {
    if (!payouts?.payoutsEnabled) return null;
    return el('p', { class: 'payout payout--done', dataset: { state: 'connected' } }, [
      el('span', { class: 'verified__dot', 'aria-hidden': 'true' }),
      'Payouts are set up. Payments are simulated while Steeple is on its test gateway — no money moves yet.',
    ]);
  }

  // ── the spaces ────────────────────────────────────────────────────────────

  function bookingModeBlock(venue) {
    const mode = venue?.bookingMode === 'manual' ? 'manual' : 'instant';
    return el('section', { class: 'settings', 'aria-label': 'How this venue takes bookings' }, [
      el('p', { class: 'eyebrow', text: 'How this venue takes bookings' }),
      el(
        'div',
        { class: 'settings__modes' },
        ['instant', 'manual'].map((option) =>
          el('label', { class: `mode${mode === option ? ' is-on' : ''}` }, [
            el('input', {
              type: 'radio',
              class: 'mode__input',
              name: 'booking-mode',
              value: option,
              checked: mode === option,
              onchange: () => {
                if (option === mode) return;
                move(
                  () => wire.setBookingMode(venue.remoteId, option),
                  option === 'instant'
                    ? 'This venue books instantly now. Requests already waiting still need your answer.'
                    : 'New asks will wait for your approval now. Bookings already confirmed stand.'
                ).then((answer) => {
                  if (answer) onVenue?.(venueId, { reread: true });
                });
              },
            }),
            el('span', { class: 'mode__body' }, [
              el('span', { class: 'mode__label', text: MODE_WORDS[option].label }),
              el('span', { class: 'mode__blurb', text: MODE_WORDS[option].blurb }),
            ]),
          ])
        )
      ),
    ]);
  }

  /**
   * The venue itself, as a thing that can be corrected. A name typed in a hurry
   * and an address that has changed are both ordinary, and this sits beside the
   * address in the head rather than under a second printing of it lower down.
   */
  function editVenue() {
    const button = el('button', {
      type: 'button',
      class: 'deskedit',
      dataset: { action: 'edit-venue' },
      'aria-label': 'Edit venue details',
      title: 'Edit venue details',
      onclick: () => onListing({ venueId, entry: 'venue-edit' }),
    });
    button.innerHTML = PENCIL_ICON; // hand-written markup, never data
    return button;
  }

  /**
   * Where this venue's spaces stand, counted the way the rows are tagged.
   *
   * "0 spaces are published" is true and useless — the answer to a question
   * nobody asked, on the one screen that owes the host what to do next. A venue
   * registered and abandoned before its first space lands exactly there. And a
   * space a moderator is reading was counted as one the host had left in draft,
   * which asks them for work that is not theirs to do.
   */
  function countLine(rooms) {
    if (!rooms.length) return 'No spaces here yet. Add one and Steeple will put it on the map.';
    const tally = new Map();
    for (const room of rooms) {
      const state = roomState(room);
      tally.set(state, (tally.get(state) ?? 0) + 1);
    }
    // Only the first part carries the noun: "1 space published, 1 in review."
    const said = ['published', 'review', 'draft', 'kept']
      .filter((state) => tally.has(state))
      .map((state, at) => {
        const n = tally.get(state);
        const counted = STATE_WORDS[state].counted;
        return at === 0 ? `${plural(n, 'space', 'spaces')} ${counted}` : `${n} ${counted}`;
      });
    return `${said.join(', ')}.`;
  }

  function spaceRow(room) {
    const state = roomState(room);
    const words = STATE_WORDS[state];
    const hours = hoursSummary(venueId, room.id);
    return el('li', { class: 'space' }, [
      el('div', { class: 'space__main' }, [
        el('span', { class: 'space__name', text: room.name }),
        el('span', { class: 'space__meta' }, [
          `Seats ${room.capacity} · `,
          el('span', {
            class: `price price--sm${room.pricePerHour == null ? ' price--free' : ''}`,
            text: priceText(room),
          }),
        ]),
        el('span', { class: `space__hours${hours.startsWith('No open') ? ' is-missing' : ''}`, text: hours }),
      ]),
      el('div', { class: 'space__side' }, [
        el('span', { class: `tag tag--${words.tone}`, text: words.tag }),
        // One button, and the open hours are a step along the rail it opens
        // (listing.js FLOWS) — a second button for them said the hours were a
        // different thing from the listing they belong to.
        el(
          'button',
          {
            type: 'button',
            class: 'pill pill--sm',
            dataset: { room: room.id, action: state === 'draft' ? 'finish' : 'edit' },
            onclick: () => onListing({ venueId, roomId: room.id, step: 'describe' }),
          },
          state === 'draft' ? 'Finish this listing' : 'Edit listing'
        ),
      ]),
    ]);
  }

  // ── the frame ─────────────────────────────────────────────────────────────

  /**
   * Whether this desk has a Requests tab at all.
   *
   * A manual venue always does. An instant venue does not — with one exception
   * that is not a hedge: a venue that has just left manual mode can still owe
   * answers, and a tab that vanishes with somebody's ask still inside it would
   * strand them (mode changes bind new asks only). So the tab survives exactly
   * as long as there is something in it.
   */
  const hasRequests = (venue, letters) =>
    venue?.bookingMode === 'manual' || letters.live.length > 0;

  function renderHead(venue, letters) {
    const options = deskVenues(placedVenues());
    const select = el(
      'select',
      {
        class: 'select',
        id: 'desk-venue',
        onchange: (event) => {
          setHostVenue(event.target.value);
          onVenue(event.target.value);
        },
      },
      options.map((option) =>
        el('option', { value: option.id, selected: option.id === venueId }, `${option.shortName}`)
      )
    );

    replaceChildren(head, [
      el('div', { class: 'desk__title' }, [
        el('p', { class: 'eyebrow', text: 'Hosting' }),
        el('h1', { class: 'sheet__title', text: venue?.name ?? 'Your venue' }),
        // A venue wears the mark once steeple has confirmed it — never on the
        // strength of standing on this desk. One newly listed here has not
        // been through the gate yet, and says nothing rather than something
        // untrue.
        el('p', { class: 'desk__address' }, [
          venue?.address ?? '',
          venue ? editVenue() : null,
          venue?.address && venue?.verified ? el('span', { class: 'desk__dot', text: '·' }) : null,
          venue?.verified ? verifiedChip() : null,
        ]),
      ]),
      // One venue needs no chooser: the desk is that venue's.
      options.length > 1
        ? el('div', { class: 'desk__switch' }, [
            el('label', { class: 'eyebrow', for: 'desk-venue', text: 'Venue' }),
            select,
          ])
        : null,
      el(
        'div',
        { class: 'tabs', role: 'tablist', 'aria-label': 'Bookings, requests and spaces' },
        [
          deskTab('bookings', `Bookings · ${standing().length}`),
          hasRequests(venue, letters) ? deskTab('letters', `Requests · ${letters.live.length}`) : null,
          deskTab('spaces', `Spaces · ${roomsOf(venueId, placedVenues()).length}`),
        ].filter(Boolean)
      ),
    ]);
  }

  const deskTab = (id, label) =>
    el(
      'button',
      {
        type: 'button',
        class: `tab${tab === id ? ' is-on' : ''}`,
        role: 'tab',
        dataset: { tab: id },
        'aria-selected': tab === id ? 'true' : 'false',
        onclick: () => {
          tab = id;
          rescinding = null;
          refusal = '';
          render();
        },
      },
      label
    );

  function renderFoot() {
    replaceChildren(foot, [
      // The layout switch sets the request pile in one of two hands and touches
      // nothing else, so it is only offered where there is a request pile.
      tab !== 'letters' ? null : el('div', { class: 'desk__variant' }, [
        el('span', { class: 'eyebrow', text: 'Layout' }),
        el('div', { class: 'segments segments--flat' }, [
          el(
            'button',
            {
              type: 'button',
              class: `segment${variant === 'board' ? ' is-on' : ''}`,
              onclick: () => onVariant('board'),
            },
            'Board'
          ),
          el(
            'button',
            {
              type: 'button',
              class: `segment${variant === 'ledger' ? ' is-on' : ''}`,
              onclick: () => onVariant('ledger'),
            },
            'Ledger'
          ),
        ]),
      ]),
      // Two different things, and the desk used to offer only the second of
      // them under the first one's name. A host who has a venue and wants
      // another space was sent back through venue registration — the only way
      // out of a venue with no rooms was to register a second venue.
      el('div', { class: 'desk__actions' }, [
        el(
          'button',
          {
            type: 'button',
            class: 'linkish',
            dataset: { action: 'new-venue' },
            onclick: () => onListing({ step: 'place' }),
          },
          'List another venue'
        ),
        el(
          'button',
          {
            type: 'button',
            class: 'pill pill--primary',
            dataset: { action: 'add-space' },
            onclick: () => onListing({ venueId }),
          },
          'Add a space'
        ),
      ]),
    ].filter(Boolean));
  }

  function render() {
    const placed = placedVenues();

    // A desk belongs to a venue steeple says this person looks after. With none
    // there is no desk at all — no venue named, no chooser over other people's
    // churches, no requests, no chip. The old desk opened onto a seeded church
    // with its demo correspondence on the board, to anybody who pressed the
    // switch, signed in or not (v2_migration D4). Nothing is printed here
    // instead: whoever routed here is on their way to the listing flow.
    if (!deskVenues(placed).length) {
      replaceChildren(head, []);
      replaceChildren(foot, []);
      replaceChildren(body, [
        el('p', {
          class: 'prose',
          text: reading
            ? 'Reading the venues you look after…'
            : 'You do not look after a venue on Steeple yet.',
        }),
      ]);
      return;
    }

    const venue = venueOf(venueId, placed);
    const letters = deskLetters(venueId);
    // A tab that is no longer there cannot be the one you are standing on.
    if (tab === 'letters' && !hasRequests(venue, letters)) tab = 'bookings';
    renderHead(venue, letters);
    renderFoot();

    // What steeple said no to, above whichever pile it was said about.
    const said = refusal
      ? el('p', { class: 'desk__refusal', role: 'alert', text: refusal })
      : null;

    if (tab === 'spaces') {
      const rooms = roomsOf(venueId, placed);
      replaceChildren(body, [
        said,
        el('p', { class: 'desk__count', text: countLine(rooms) }),
        rooms.length ? el('ul', { class: 'spaces' }, rooms.map(spaceRow)) : null,
        venue?.remoteId ? bookingModeBlock(venue) : null,
      ].filter(Boolean));
      if (working) for (const control of body.querySelectorAll('button, input')) control.disabled = true;
      return;
    }

    if (tab === 'bookings') {
      const entries = standing();
      replaceChildren(body, [
        said,
        payoutPrompt(entries),
        payoutConnected(),
        el('p', {
          class: 'desk__count',
          text: entries.length
            ? `${plural(entries.length, 'booking is', 'bookings are')} confirmed with dates still to come.`
            : venue?.bookingMode === 'manual'
              ? 'Nothing is booked yet. Requests you approve land here.'
              : 'Nothing is booked yet. A group that fits your open hours books here on the spot.',
        }),
        entries.length ? el('div', { class: 'bookings' }, entries.map(bookingCard)) : null,
      ].filter(Boolean));
      // Set from the flag, never only to true: these cards survive a redraw, so
      // a control disabled while waiting stays disabled unless it is told back.
      for (const control of body.querySelectorAll('button, input, textarea')) control.disabled = working;
      return;
    }

    const live = letters.live;
    const record = letters.record;
    replaceChildren(body, [
      said,
      el('p', {
        class: 'desk__count',
        text: live.length
          ? `${plural(live.length, 'request is', 'requests are')} waiting on an answer.`
          : 'No requests are waiting. Everything already answered is listed below.',
      }),
      live.length
        ? el(
            'div',
            { class: variant === 'ledger' ? 'rows' : 'cards' },
            live.map(variant === 'ledger' ? ledgerRow : letterCard)
          )
        : null,
      record.length
        ? el('section', { class: 'record' }, [
            el('h2', { class: 'eyebrow', text: 'Answered' }),
            el('ul', { class: 'record__list' }, record.map(recordRow)),
          ])
        : null,
    ].filter(Boolean));
  }

  return {
    element,
    setVenue(id) {
      venueId = id;
    },
    /** Told once steeple has answered what this person looks after. */
    setReading(next) {
      reading = next;
    },
    setTab(next) {
      tab = next;
      rescinding = null;
      refusal = '';
    },
    /** Where this venue stands with payouts, as the host flow last read it. */
    setPayouts(next) {
      payouts = next ?? null;
    },
    setVariant(next) {
      if (next === variant) return;
      variant = next;
      render();
    },
    venueId: () => venueId,
    render,
    spoken() {
      const venue = venueOf(venueId, placedVenues());
      const letters = deskLetters(venueId);
      const entries = standing();
      const booked = entries
        .map(({ booking, dates }) => {
          const ahead = dates.filter((o) => o.date >= todayIso());
          const trouble = dates.some((o) => isTrouble(o.paymentStatus));
          return `${booking.organizerName ?? 'A group'}, ${booking.roomName ?? 'a space'}, ${scheduleLine(
            booking
          )}. ${plural(ahead.length, 'date', 'dates')} to come.${trouble ? ' A payment has failed on it.' : ''}`;
        })
        .join(' ');
      const waiting = letters.live.length
        ? `${plural(letters.live.length, 'request is', 'requests are')} waiting on you.`
        : '';
      return `Hosting at ${venue?.name ?? 'this venue'}. ${
        entries.length ? `${plural(entries.length, 'booking is', 'bookings are')} confirmed. ${booked}` : 'Nothing is booked yet.'
      } ${waiting}`.trim();
    },
  };
}
