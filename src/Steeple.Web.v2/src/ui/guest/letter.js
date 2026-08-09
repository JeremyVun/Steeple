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
import { getListing, heldVenue } from '../../data/catalog.js';
import { addressCopy } from '../addressCopy.js';
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

export function createLetterView({ announce, onBack, onBrowse, onOpenRoom, onFixPayment }) {
  let applicationId = null;
  // The space this letter is about, as the catalog knows it: the photograph,
  // the seats, the price, and the venue's street address. A request carries
  // none of that — it carries ids and what was asked — so the listing is read
  // once per letter (memoised per room in data/catalog.js, and free when the
  // room has already been opened) and the page redraws when it lands.
  let listing = null;
  let confirming = null; // 'withdraw' | 'declineCounter' | null
  // What steeple said when it last refused something here. It is not the
  // store's, so it is held apart and cleared the moment anything is tried again.
  let refusal = '';
  let working = false;
  let fetching = false;

  const body = el('article', { class: 'opened', tabindex: '-1' });
  const element = el('div', { class: 'guest__surface guest__surface--opened' }, [body]);

  // What this letter is about — the room, the status, the when/who/what — stays
  // where it was put; everything being said about it scrolls under that, the way
  // the host's own letter is built (host.css `.letterpage__cols`). A thread that
  // has grown long must not push the room's name off the top of the sheet.
  const scroller = el('div', { class: 'opened__scroll' });

  // A letter opens at the newest thing on it, which is the bottom, the way every
  // conversation anybody has ever read does. It holds across the redraw the wire's
  // answer causes, and is dropped the moment the reader scrolls for themselves.
  let toBottom = false;
  scroller.addEventListener('wheel', () => { toBottom = false; }, { passive: true });
  scroller.addEventListener('touchmove', () => { toBottom = false; }, { passive: true });

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

  // The rating being written, held out of the redraw. `render()` rebuilds this
  // page on every move, and a two-step confirm is a redraw — so the stars and
  // the words have to survive one, exactly as the reply box does.
  let stars = 0;
  const rateNote = el('textarea', {
    class: 'field__input field__input--note',
    id: 'letter-rate-note',
    rows: '3',
    maxlength: '1000',
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

  function particulars(app, venue) {
    const group = organizationOf(app);
    const where = addressOf(venue);
    const rows = [
      ['When', scheduleSentence(app)],
      // Where you are actually going on the day. The street is the venue's
      // own, from the listing — until that lands, the suburb is a true,
      // smaller answer, and it is one press away either way because an address
      // is the one thing on this page meant to leave it (ui/addressCopy.js).
      where ? ['Where', addressCopy(where, { textClass: 'particulars__address' })] : null,
      ['Who', [plural(app.groupSize, 'person', 'people'), group].filter(Boolean).join(' · ')],
      ['What', app.activityType],
    ].filter(Boolean);
    return el('dl', { class: 'particulars' }, rows.flatMap(([term, value]) => [
      el('dt', { class: 'eyebrow', text: term }),
      typeof value === 'string'
        ? el('dd', { class: 'particulars__value', text: value })
        : el('dd', { class: 'particulars__value' }, [value]),
    ]));
  }

  /**
   * The venue's street when steeple has said it, its suburb until then, and
   * nothing at all when neither is known — a letter that cannot say where does
   * not print a "Where" with a guess in it.
   */
  function addressOf(venue) {
    // `address` is the whole line as the catalog holds it (data/catalog.js
    // `noteListing`); `addressLine` is the same line on a listing's own venue.
    return listing?.venue?.addressLine ?? venue.address ?? (venue.suburb ? `${venue.suburb}, Virginia` : null);
  }

  /**
   * Which space this is, with its photograph — the card the guest pressed to
   * ask for it in the first place, and the way back to it (owner review,
   * 2026-08-09: there was no way from a request to the space it is about).
   *
   * Its own class, never the host letter's `.spacecard`: host.css loads after
   * guest.css, and a shared name is a surface silently restyled by the other.
   */
  function spaceCard(app, venue, room) {
    const photo = listing?.primaryPhotoUrl ?? listing?.photos?.[0]?.cardUrl ?? null;
    const capacity = listing?.capacity ?? room.capacity ?? null;
    const price = listing?.pricePerHour ?? room.pricePerHour ?? null;
    const facts = [
      venue.shortName ?? venue.name,
      capacity ? `Seats ${capacity}` : null,
      price == null ? null : `$${price}/hr`,
    ].filter(Boolean);
    return el(
      'button',
      {
        type: 'button',
        class: 'openedspace',
        'aria-label': `Open ${listing?.name ?? room.name}`,
        onclick: () => onOpenRoom?.(app.venueId, app.roomId),
      },
      [
        photo
          ? el('img', { class: 'openedspace__photo', src: photo, alt: '' })
          : el('span', { class: 'openedspace__photo openedspace__photo--none', 'aria-hidden': 'true' }),
        el('span', { class: 'openedspace__body' }, [
          el('span', { class: 'openedspace__name', text: listing?.name ?? room.name }),
          el('span', { class: 'openedspace__meta', text: facts.join(' · ') }),
        ]),
      ]
    );
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

  /**
   * How it went — the one place an organizer rates a space.
   *
   * Everything here is steeple's call and none of it is this browser's: whether
   * a rating may still be written (`canRate`), and whether the venue's own
   * rating has been revealed yet (it is simply present, or it is not). No date
   * arithmetic on `rateByUtc`, no local reveal rule, and nothing at all when the
   * booking carries no `ratings` block — a booking mirrored before this existed,
   * or one steeple has said nothing about, renders as silence rather than as a
   * greyed-out invitation (D3, D4).
   *
   * The gate is deliberately narrower than the API's: steeple would take a
   * rating from the first past date, but a rating is immutable and there is only
   * one, so a year's term would be judged in week one. The invitation waits for
   * the booking to be over — cancelled included, because a no-show that became a
   * cancellation is exactly when a warning is worth writing (D2).
   */
  function ratingBlock(app, venue, booking) {
    const ratings = booking?.ratings ?? null;
    if (!ratings) return null;
    // On this letter the reader is the organizer: `byOrganizer` is theirs to
    // write, `byVenue` is the one that has to be earned back.
    const mine = ratings.byOrganizer ?? null;
    const theirs = ratings.byVenue ?? null;
    const settled = booking.status === 'completed' || booking.status === 'cancelled';

    if (settled && ratings.canRate === true && !mine) return rateForm(app, venue, booking, theirs);
    if (mine || theirs) {
      return el(
        'section',
        { class: 'rate rate--done', dataset: { state: mine ? (theirs ? 'both' : 'mine') : 'theirs' } },
        [
          el('h2', { class: 'eyebrow', text: 'How it went' }),
          mine && ratingFact('Your rating', mine),
          theirs && ratingFact(`${venue.shortName}'s rating`, theirs),
          // Only said while there is something still to arrive. A rating that
          // was never written has nothing to wait for and says nothing (D9).
          mine && !theirs
            ? el('p', {
                class: 'rate__reveal',
                text: `${venue.shortName}'s rating arrives when it's revealed.`,
              })
            : null,
        ].filter(Boolean)
      );
    }
    return null;
  }

  /** A rating already written, printed as the fact it now is. */
  function ratingFact(who, rating) {
    return el('div', { class: 'rate__fact' }, [
      el('p', { class: 'rate__factline' }, [
        el('span', { class: 'rate__who', text: who }),
        el('span', { class: 'rate__glyphs', 'aria-hidden': 'true', text: starGlyphs(rating.stars) }),
        el('span', { class: 'visually-hidden', text: `${rating.stars} out of 5 stars` }),
      ]),
      rating.comment ? el('p', { class: 'prose prose--sm rate__comment', text: rating.comment }) : null,
    ].filter(Boolean));
  }

  const starGlyphs = (n) => '★'.repeat(n) + '☆'.repeat(Math.max(0, 5 - n));

  /**
   * The form: five stars, an optional note, and a commit that says it is final.
   *
   * `theirs` sharpens the closing line when the venue's rating is already in
   * hand. Note that under the double-blind rule it cannot be, from this data:
   * steeple withholds the other side's rating until you have written yours, and
   * the wire carries no "they have rated" hint — so a venue that rates first is
   * invisible here by design, and the reciprocity nudge reaches the organizer as
   * a `ratingReceived` notification instead (D10). The branch stays because it
   * is one ternary and it is the truth the moment either of those changes.
   *
   * Native radios, in reading order, so the stars are arrow-key navigable and
   * announced as a group without a line of script — the labels carry the words
   * ("3 stars") and the glyph is decoration over them. The fill is painted on
   * change rather than through a redraw, because a redraw here would take the
   * words already typed into the note with it.
   */
  function rateForm(app, venue, booking, theirs) {
    const labels = [];
    const glyphs = [];
    const radios = [];
    // Shape as well as colour. A pale *filled* star reads as a rating already
    // given and greyed out — the empty ones have to be a different glyph, which
    // is also how the fact lines print a rating.
    const paint = () =>
      labels.forEach((node, at) => {
        const lit = at < stars;
        node.classList.toggle('is-on', lit);
        glyphs[at].textContent = lit ? '★' : '☆';
      });
    const inputs = [1, 2, 3, 4, 5].flatMap((n) => {
      const id = `letter-rate-${n}`;
      const glyph = el('span', { class: 'rate__glyph', 'aria-hidden': 'true', text: '☆' });
      const label = el('label', { class: 'rate__star', for: id }, [
        glyph,
        el('span', { class: 'visually-hidden', text: n === 1 ? '1 star' : `${n} stars` }),
      ]);
      labels.push(label);
      glyphs.push(glyph);
      const input = el('input', {
        type: 'radio',
        class: 'rate__input',
        name: 'letter-rate',
        id,
        value: String(n),
        checked: stars === n ? 'checked' : null,
        onchange: () => {
          stars = n;
          paint();
        },
      });
      radios.push(input);
      return [input, label];
    });
    paint();

    const asked = confirming === 'rate';
    return el('section', { class: 'rate', dataset: { state: theirs ? 'invited' : 'open' } }, [
      el('h2', { class: 'rate__ask', text: 'How was the space?' }),
      el('fieldset', { class: 'rate__stars' }, [
        el('legend', { class: 'visually-hidden', text: 'How was the space?' }),
        ...inputs,
      ]),
      el('label', {
        class: 'field__label rate__notelabel',
        for: 'letter-rate-note',
        text: 'A few words, if you like (optional)',
      }),
      rateNote,
      asked
        ? el('div', { class: 'rate__confirm' }, [
            el('p', {
              class: 'prose prose--sm',
              text: "Your rating is final — steeple doesn't allow edits.",
            }),
            el('div', { class: 'rate__actions' }, [
              el(
                'button',
                {
                  type: 'button',
                  class: 'pill pill--primary',
                  dataset: { action: 'rate-send' },
                  onclick: () =>
                    move(
                      () => wire.rateBooking(booking.id, { stars, comment: rateNote.value }),
                      () => 'Your rating is in.'
                    ).then((sent) => {
                      // Only a rating steeple took empties the form. What comes
                      // back is the booking re-read, so the block below has
                      // already become the fact of it.
                      if (sent) {
                        stars = 0;
                        rateNote.value = '';
                      }
                    }),
                },
                'Yes, send it'
              ),
              el(
                'button',
                {
                  type: 'button',
                  class: 'linkish',
                  onclick: () => {
                    confirming = null;
                    render();
                    // Back where they were, not at the top of a rebuilt page.
                    body.querySelector('[data-action="rate-open"]')?.focus();
                  },
                },
                'Not yet'
              ),
            ]),
          ])
        : el('div', { class: 'rate__actions' }, [
            el(
              'button',
              {
                type: 'button',
                class: 'pill',
                dataset: { action: 'rate-open' },
                onclick: () => {
                  // Never choose for them: the ask moves to the stars and waits.
                  if (!stars) {
                    announce?.('Choose a star rating first.');
                    radios[0]?.focus();
                    return;
                  }
                  confirming = 'rate';
                  render();
                  // The page is rebuilt by that redraw, which drops keyboard
                  // focus on the floor. The step that just appeared is what
                  // was asked for, so it is what receives it.
                  body.querySelector('[data-action="rate-send"]')?.focus();
                },
              },
              'Rate this space'
            ),
          ]),
      el('p', {
        class: 'rate__reveal',
        text: theirs
          ? `${venue.shortName} has rated this booking — rate back to see it.`
          : `${venue.shortName} sees your rating once they've rated you back, or after the window closes.`,
      }),
    ]);
  }

  // A booked request still has two people who may need to say something to each
  // other, so the reply box outlives the decision (2026-08-09): steeple takes a
  // message on an approved application without moving its status. Declined,
  // withdrawn and expired are closed, and the thread stands as a record.
  const canWrite = (app) => UNDECIDED.has(app.status) || app.status === APP_STATUS.approved;

  function threadBlock(app, venue) {
    const messages = threadFor(app.id);
    if (!messages.length && !canWrite(app)) return null;
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
      canWrite(app) && replyBlock(app, venue),
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
            // What was just said is the newest thing on the letter: show it.
            toBottom = true;
            render();
            toBottom = false;
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

    const held = scroller.scrollTop;
    replaceChildren(scroller, [
      // The space first, as on the host's own letter: which room this is about
      // is the first question, and a photograph answers it faster than words.
      spaceCard(app, venue, room),
      counter && counterBlock(app, venue, counter),
      booking && occurrenceBlock(app),
      // After what this booking was, before anything still being said about it.
      booking && ratingBlock(app, venue, booking),
      intentBlock(app, venue),
      threadBlock(app, venue),
      closingBlock(app, venue),
    ]);
    replaceChildren(body, [
      letterhead(app, venue, room),
      el('p', { class: 'opened__state', text: statusNote(app, {
        occurrences: booking ? occurrencesFor(booking.id).length : 0,
        booking,
      }) }),
      // What steeple said the last time this page asked it for something. It
      // stands above the request because it is about the request, not about a
      // field in it.
      refusal ? el('p', { class: 'opened__refusal', role: 'alert', text: refusal }) : null,
      particulars(app, venue),
      scroller,
    ]);
    // Being taken out of the page and put back is what a redraw is; the reader's
    // place in the thread is not the redraw's to lose.
    scroller.scrollTop = toBottom ? scroller.scrollHeight : held;
    // Set from the flag, never only to true: the page is rebuilt here, but the
    // habit is what keeps a control from staying dead after a redraw that is not.
    for (const control of body.querySelectorAll('button')) control.disabled = working;
  }

  /**
   * The space this letter is about, asked of the catalog.
   *
   * A request that is still only in the mirror has no venue and no room to read
   * yet; the wire's own answer brings both, so this is tried again from there.
   * A room the catalog cannot answer for — unlisted since, or steeple down —
   * leaves the card with what the request itself carries and no photograph,
   * which is the honest smaller version of it, never an error on a letter.
   */
  function readSpace(id) {
    const app = getApplication(id);
    if (!app?.venueId || !app?.roomId || listing) return;
    getListing(app.venueId, app.roomId)
      .then((answer) => {
        if (applicationId !== id || !answer) return;
        listing = answer;
        render();
      })
      .catch(() => {});
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
        booking,
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
        stars = 0;
        rateNote.value = '';
        listing = null;
      }
      applicationId = id;
      fetching = true;
      toBottom = true;
      render();
      readSpace(id);
      // The thread lives behind the detail read, and only steeple has it. The
      // mirror draws the page at once; this makes it true a moment later — and
      // a cold link with nothing mirrored yet waits here rather than bouncing.
      wire.openApplication(id).then((answer) => {
        if (applicationId !== id) return;
        fetching = false;
        if (!answer.ok) refusal = answer.problem;
        render();
        toBottom = false;
        // A cold link arrives with nothing mirrored, so the room to read was
        // not known a moment ago. Now it is.
        readSpace(id);
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
