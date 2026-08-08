// A REQUEST — one application, opened. On the left, the space it names (photo
// first — a host with many rooms identifies by sight), what was asked and by
// whom, and the message thread with its reply box: writing back is part of
// reading a letter, not a separate decision. On the right, the week: the
// schedule ribbon, what it collides with, and the decision pair — Approve and
// Decline — with "suggest another time" as the quiet third way. Approve seals
// it and gets out of the way.

import { state } from '../../core/bus.js';
import * as wire from '../../data/correspondence.js';
import {
  APP_STATUS,
  COUNTER_STATUS,
  DAY_LABELS,
  UNDECIDED,
  bookingFor,
  countersFor,
  effectiveRoom,
  getApplication,
  maskToDays,
  daysToMask,
  occurrencesFor,
  threadFor,
  todayIso,
} from '../../data/store.js';
import { el, replaceChildren } from '../dom.js';
import {
  DAY_INITIAL,
  STATUS_WORD,
  fmtDate,
  fmtDateRange,
  fmtTimeRange,
  joinedText,
  organizerOf,
  readSchedule,
  scheduleDays,
  scheduleLine,
  scheduleOf,
  venueOf,
} from './model.js';
import { createRibbon, ribbonSpoken } from './ribbon.js';

const VERIFIED_LABEL = 'Identity verified';
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

function declineDraft(room, organizer) {
  return `Thank you for asking about ${room?.name ?? 'the space'}. We are not able to host ${
    organizer.org ?? 'your group'
  } on these dates, and we are sorry to say no. If another time or another of our rooms would suit, we would be glad to hear from you again.`;
}

function labelled(label, control, hint) {
  return el('div', { class: 'field' }, [
    el('label', { class: 'eyebrow', for: control.id, text: label }),
    control,
    hint ? el('p', { class: 'field__hint', text: hint }) : null,
  ]);
}

export function createLetterPage({ announce, onBackToDesk }) {
  const head = el('header', { class: 'letterpage__head' });
  const left = el('div', { class: 'letterpage__left' });
  const week = el('section', { class: 'letterpage__week' });
  // What this letter asks of the host once there is nothing left to decide.
  // Above the decisions rather than among them: the decision row is sticky and
  // is a row of pills, and a form is neither.
  const invitation = el('div', { class: 'letterpage__invite' });
  const actions = el('div', { class: 'letterpage__actions' });
  const drawer = el('div', { class: 'letterpage__drawer' });
  const right = el('div', { class: 'letterpage__right' }, [week, invitation, actions, drawer]);
  const sheet = el('article', { class: 'letterpage__sheet' }, [
    head,
    el('div', { class: 'letterpage__cols' }, [left, right]),
  ]);
  const seal = el('div', { class: 'seal' });
  const element = el('div', { class: 'letterpage' }, [sheet, seal]);

  const ribbon = createRibbon();
  const verdict = el('div', { class: 'verdict' });
  const scheduleText = el('p', { class: 'letterpage__when' });

  let application = null;
  let mode = 'none'; // none | decline | counter | clash
  let counter = null;
  let sealTimer = 0;
  let working = false;

  // The rating being written, held out of the redraw. The two-step confirm
  // rebuilds this column, and a redraw that takes the stars and the words with
  // it would be a form that forgets what it was told (the guest letter holds
  // its own the same way). The ids are the host's alone — both letters are
  // mounted at once, and two `letter-rate-3` on one page is one id.
  let stars = 0;
  let confirmingRate = false;
  const rateNote = el('textarea', {
    class: 'input input--area',
    id: 'host-rate-note',
    rows: '3',
    maxlength: '1000',
  });

  /**
   * One decision, at steeple.
   *
   * A host's four moves are all writes on the same seam, and none of them is
   * taken here: the answer that comes back is the application, and the mirror is
   * written from it (data/correspondence.js). A refusal changes nothing on the
   * page except the sentence explaining it — a desk that shows an approval the
   * service refused is worse than one that shows nothing.
   *
   * @returns {Promise<object|null>} the application as steeple now holds it
   */
  async function move(work, { onRefusal = null } = {}) {
    if (working) return null;
    working = true;
    setBusy(true);
    const answer = await work();
    working = false;
    setBusy(false);
    if (!answer.ok) {
      if (onRefusal?.(answer)) return null;
      announce?.(answer.problem);
      sayRefusal(answer.problem);
      return null;
    }
    return answer.value;
  }

  const setBusy = (on) => {
    for (const control of element.querySelectorAll('button')) control.disabled = on;
  };

  /** A line from the service, printed where the decisions are. */
  function sayRefusal(text) {
    let slip = actions.querySelector('.letterpage__refusal');
    if (!slip) {
      slip = el('p', { class: 'letterpage__refusal', role: 'alert' });
      actions.append(slip);
    }
    slip.textContent = text ?? '';
  }

  // ── the week, redrawn whenever the counter draft moves ────────────────────

  function proposal() {
    return mode === 'counter' && counter ? counter : scheduleOf(application);
  }

  function refreshWeek() {
    const current = proposal();
    ribbon.update({
      venueId: application.venueId,
      roomId: application.roomId,
      proposal: current,
      exceptApplicationId: application.id,
      ghost:
        mode === 'counter'
          ? {
              days: new Set(scheduleDays(application)),
              start: application.startTime,
              end: application.endTime,
            }
          : null,
    });
    scheduleText.textContent = scheduleLine(current);
    const read = readSchedule(application.venueId, application.roomId, current);
    replaceChildren(verdict, [
      el('p', { class: 'verdict__count', text: read.countLine }),
      ...read.notes.map((note) =>
        el('p', { class: `verdict__note verdict__note--${note.tone}`, text: note.text })
      ),
    ]);
    return read;
  }

  function legend() {
    return el('ul', { class: 'legend' }, [
      el('li', { class: 'legend__item legend__item--open' }, 'Open'),
      el('li', { class: 'legend__item legend__item--booked' }, 'Already booked'),
      el('li', { class: 'legend__item legend__item--proposed' }, 'This request'),
      el('li', { class: 'legend__item legend__item--collide' }, 'Where they collide'),
    ]);
  }

  // ── decisions ─────────────────────────────────────────────────────────────

  /** Open the drawer without losing the week: the ribbon is the whole point. */
  function revealDrawer(anchor = 'drawer') {
    drawer.classList.add('is-open');
    if (anchor === 'week') right.scrollTop = 0;
    else drawer.scrollIntoView({ block: 'nearest', behavior: 'instant' });
  }

  function closeDrawer() {
    mode = 'none';
    counter = null;
    replaceChildren(drawer, []);
    drawer.classList.remove('is-open');
    refreshWeek();
    renderActions();
  }

  function openDecline() {
    mode = 'decline';
    const room = effectiveRoom(application.venueId, application.roomId);
    const box = el('textarea', {
      class: 'input input--area',
      id: 'decline-note',
      rows: '5',
    });
    box.value = declineDraft(room, organizerOf(application));

    replaceChildren(drawer, [
      el('h3', { class: 'eyebrow', text: 'Decline, kindly' }),
      el('p', {
        class: 'prose prose--sm',
        text: 'A note goes with the answer. This one is written for you — change anything that is not true of your venue.',
      }),
      labelled('Your note', box),
      el('div', { class: 'drawer__foot' }, [
        el(
          'button',
          {
            type: 'button',
            class: 'pill pill--primary',
            dataset: { action: 'send-decline' },
            onclick: async () => {
              const declined = await move(() =>
                wire.decide(application.id, 'decline', box.value.trim() || null)
              );
              if (!declined) return;
              announce?.('Request declined, with your note. It is now answered.');
              onBackToDesk();
            },
          },
          'Send the decline'
        ),
        cancelButton(),
      ]),
    ]);
    revealDrawer();
    renderActions();
    box.focus();
  }

  function openCounter(seed) {
    mode = 'counter';
    counter = { ...scheduleOf(application), ...(seed ?? {}) };
    if (!counter.daysOfWeekMask && counter.frequency === 'weekly') {
      counter.daysOfWeekMask = daysToMask([new Date().getDay()]);
    }

    const note = el('p', { class: 'field__hint' });
    const send = el(
      'button',
      {
        type: 'button',
        class: 'pill pill--primary',
        dataset: { action: 'send-counter' },
        onclick: async () => {
          const who = organizerOf(application).name;
          const said = scheduleLine(counter);
          const updated = await move(
            () => wire.counterOffer(application.id, counter, message.value),
            {
              onRefusal: (answer) => {
                // The route lives behind a flag at steeple. Off, it is simply
                // not there — a feature this venue does not have, not a fault.
                note.textContent =
                  answer.reach === 'unavailable'
                    ? 'Suggesting another time is not available here yet.'
                    : answer.problem;
                announce?.(note.textContent);
                return true;
              },
            }
          );
          if (!updated) return;
          announce?.(`Offer sent: ${said}. The request waits with ${who} now.`);
          show(application.id);
        },
      },
      'Send the offer'
    );

    const message = el('textarea', {
      class: 'input input--area',
      id: 'counter-message',
      rows: '2',
      placeholder: 'Why this time instead — a sentence is plenty.',
    });

    function sync() {
      const read = refreshWeek();
      const blocked = read.blocked;
      send.disabled = blocked;
      note.textContent = blocked
        ? 'That time is already taken. Move it and the collision clears.'
        : 'The ribbon above shows their request faintly and your offer solid.';
    }

    const dayToggles = el(
      'div',
      { class: 'days', role: 'group', 'aria-label': 'Weekdays for the counter-offer' },
      DAY_LABELS.map((label, day) =>
        el(
          'button',
          {
            type: 'button',
            class: 'day',
            dataset: { day: String(day) },
            'aria-pressed': 'false',
            onclick: (event) => {
              const days = new Set(maskToDays(counter.daysOfWeekMask ?? 0));
              if (days.has(day)) days.delete(day);
              else days.add(day);
              counter.daysOfWeekMask = daysToMask([...days]);
              event.currentTarget.setAttribute('aria-pressed', days.has(day) ? 'true' : 'false');
              event.currentTarget.classList.toggle('is-on', days.has(day));
              sync();
            },
          },
          [
            el('span', { 'aria-hidden': 'true', text: DAY_INITIAL[day] }),
            el('span', { class: 'visually-hidden', text: label }),
          ]
        )
      )
    );

    const startDate = el('input', {
      class: 'input',
      id: 'counter-start',
      type: 'date',
      min: todayIso(),
      value: counter.startDate,
      oninput: (event) => {
        counter.startDate = event.target.value;
        sync();
      },
    });
    const endDate = el('input', {
      class: 'input',
      id: 'counter-end',
      type: 'date',
      min: todayIso(),
      value: counter.endDate ?? '',
      oninput: (event) => {
        counter.endDate = event.target.value;
        sync();
      },
    });
    const startTime = el('input', {
      class: 'input',
      id: 'counter-from',
      type: 'time',
      step: '900',
      value: counter.startTime,
      oninput: (event) => {
        if (event.target.value) counter.startTime = event.target.value;
        sync();
      },
    });
    const endTime = el('input', {
      class: 'input',
      id: 'counter-to',
      type: 'time',
      step: '900',
      value: counter.endTime,
      oninput: (event) => {
        if (event.target.value) counter.endTime = event.target.value;
        sync();
      },
    });

    const weekly = el('div', { class: 'counter__weekly' }, [
      el('div', { class: 'field__pair' }, [
        labelled('First week', startDate),
        labelled('Weekly until', endDate),
      ]),
    ]);

    function setFrequency(frequency) {
      counter.frequency = frequency;
      weekly.hidden = frequency !== 'weekly';
      if (dayToggles.parentElement) dayToggles.parentElement.hidden = frequency !== 'weekly';
      for (const button of frequencyRow.querySelectorAll('.segment')) {
        const on = button.dataset.frequency === frequency;
        button.classList.toggle('is-on', on);
        button.setAttribute('aria-pressed', on ? 'true' : 'false');
      }
      sync();
    }

    const frequencyRow = el(
      'div',
      { class: 'segments segments--flat', role: 'group', 'aria-label': 'How often' },
      [
        el(
          'button',
          {
            type: 'button',
            class: 'segment',
            dataset: { frequency: 'oneOff' },
            onclick: () => setFrequency('oneOff'),
          },
          'One-off'
        ),
        el(
          'button',
          {
            type: 'button',
            class: 'segment',
            dataset: { frequency: 'weekly' },
            onclick: () => setFrequency('weekly'),
          },
          'Weekly until'
        ),
      ]
    );

    replaceChildren(drawer, [
      el('h3', { class: 'eyebrow', text: 'Suggest another time' }),
      el('p', {
        class: 'field__hint',
        text: 'Their request stays open while they consider it — accepting books the space, declining returns it to you.',
      }),
      el('div', { class: 'counter__head' }, [
        labelled('How often', frequencyRow),
        labelled('Weekdays', dayToggles),
      ]),
      weekly,
      el('div', { class: 'field__pair' }, [labelled('From', startTime), labelled('Until', endTime)]),
      labelled('A note with the offer', message),
      note,
      el('div', { class: 'drawer__foot' }, [send, cancelButton()]),
    ]);
    revealDrawer('week');

    for (const button of dayToggles.querySelectorAll('.day')) {
      const on = maskToDays(counter.daysOfWeekMask ?? 0).includes(Number(button.dataset.day));
      button.classList.toggle('is-on', on);
      button.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    setFrequency(counter.frequency);
    renderActions();
    announce?.('Suggest another time. The ribbon follows what you change.');
  }

  function cancelButton(label = 'Cancel') {
    return el(
      'button',
      { type: 'button', class: 'linkish', dataset: { action: 'cancel' }, onclick: closeDrawer },
      label
    );
  }

  async function onApprove() {
    const id = application.id;
    const approved = await move(() => wire.decide(id, 'approve'), {
      onRefusal: (answer) => {
        // The exclusion constraint fired: another group has those dates and the
        // request was declined at steeple as it happened. That is a moment on
        // this desk, not an error message.
        if (answer.code === 'slot_taken') {
          takenElsewhere();
          return true;
        }
        return false;
      },
    });
    if (!approved) return;
    const booking = bookingFor(id);
    sealed(booking ? occurrencesFor(booking.id).map((o) => o.date) : []);
  }

  /** Approving lost the race. Say what happened, and where it leaves things. */
  function takenElsewhere() {
    // The request is decided now — redraw the page as the declined thing it is,
    // and then explain it, in that order.
    show(application.id);
    mode = 'clash';
    replaceChildren(drawer, [
      el('h3', { class: 'eyebrow eyebrow--alert', text: 'Already taken' }),
      el('p', {
        class: 'prose prose--sm',
        text: 'Those dates went to another booking before this could be approved, so Steeple has declined this request. The group has been told.',
      }),
      el('div', { class: 'drawer__foot' }, [
        el(
          'button',
          {
            type: 'button',
            class: 'pill pill--primary',
            dataset: { action: 'back-to-desk' },
            onclick: onBackToDesk,
          },
          'Back'
        ),
      ]),
    ]);
    revealDrawer();
    announce?.(
      'Those dates were taken before this could be approved. Steeple has declined the request and told the group.'
    );
  }

  function sealed(dates) {
    replaceChildren(seal, [
      el('div', { class: 'seal__card' }, [
        el('p', { class: 'eyebrow', text: 'Approved' }),
        el('p', { class: 'seal__title', text: 'The space is theirs' }),
        el('p', {
          class: 'seal__line',
          text: dates.length
            ? `${plural(dates.length, 'date', 'dates')} booked · ${fmtDateRange(dates[0], dates.at(-1))}`
            : 'Booked.',
        }),
        el(
          'button',
          {
            type: 'button',
            class: 'pill',
            dataset: { action: 'back-to-desk' },
            onclick: onBackToDesk,
          },
          'Back'
        ),
      ]),
    ]);
    element.classList.add('is-sealed');
    announce?.(
      `Approved. ${plural(dates.length, 'date is', 'dates are')} booked${
        dates.length ? `, ${fmtDateRange(dates[0], dates.at(-1))}` : ''
      }. The request is answered.`
    );
    clearTimeout(sealTimer);
    sealTimer = setTimeout(() => {
      if (element.classList.contains('is-sealed') && state.applicationId === application.id) {
        onBackToDesk();
      }
    }, 3600);
  }

  /**
   * Nothing is being decided any more — but a booking that has run its course
   * may still owe this venue a word about how it went, and the right-hand
   * column is where a host looks for what this letter asks of them.
   */
  function renderInvitation() {
    replaceChildren(invitation, UNDECIDED.has(application.status) ? [] : [ratingBlock()].filter(Boolean));
  }

  function renderActions() {
    if (!UNDECIDED.has(application.status)) {
      replaceChildren(actions, []);
      return;
    }
    const button = (label, action, className, handler) =>
      el(
        'button',
        {
          type: 'button',
          class: className,
          dataset: { action },
          'aria-expanded': mode === action ? 'true' : null,
          onclick: handler,
        },
        label
      );

    // Two decisions, and one quiet third way. Writing back is not here at all —
    // the reply box lives on the thread, where a person looks for it.
    replaceChildren(actions, [
      button('Approve', 'approve', 'pill pill--primary', onApprove),
      button('Decline', 'decline', 'pill pill--quiet', openDecline),
      button('Suggest another time', 'counter', 'linkish', () => openCounter()),
    ]);
  }

  // ── how it went ───────────────────────────────────────────────────────────

  /** The group, as this venue would name them out loud. */
  const theirName = () => {
    const organizer = organizerOf(application);
    return organizer.org ?? organizer.name;
  };

  const starGlyphs = (n) => '★'.repeat(n) + '☆'.repeat(Math.max(0, 5 - n));

  /**
   * The venue's half of a rating, on the letter of the request it came from.
   *
   * Every judgement here is steeple's: whether a rating may still be written
   * (`canRate`, computed for whoever asked), and whether the organizer's own is
   * revealed yet — it is present, or it is not. No arithmetic on `rateByUtc`,
   * no local reveal rule, and nothing at all when the booking carries no
   * `ratings` block: a booking mirrored before this existed renders as silence,
   * never as a greyed-out invitation (D3, D4).
   *
   * The gate is narrower than the API's on purpose. Steeple would take a rating
   * from the first past date, but there is one rating per side and no edits —
   * so the invitation waits for the booking to be over. Cancelled counts:
   * a no-show that became a cancellation is exactly when a warning is worth
   * writing (D2).
   *
   * Note what is *not* here: any test of whether the organizer has rated. Under
   * the double blind their rating is withheld until this venue has written its
   * own, so "they rated first" and "they have not rated" are the same wire on
   * this side of it. The nudge to rate back arrives as a notification instead.
   */
  function ratingBlock() {
    const booking = bookingFor(application.id);
    const ratings = booking?.ratings ?? null;
    if (!ratings) return null;
    // On this letter the reader keeps the venue: `byVenue` is theirs to write,
    // `byOrganizer` is the one that has to be earned back.
    const mine = ratings.byVenue ?? null;
    const theirs = ratings.byOrganizer ?? null;
    const settled = booking.status === 'completed' || booking.status === 'cancelled';

    if (settled && ratings.canRate === true && !mine) return rateForm(booking, theirs);
    if (mine || theirs) {
      return el(
        'section',
        {
          class: 'ratemark ratemark--done',
          dataset: { state: mine ? (theirs ? 'both' : 'mine') : 'theirs' },
        },
        [
          el('h2', { class: 'eyebrow', text: 'How it went' }),
          mine && ratingFact('Your rating', mine),
          theirs && ratingFact(`${theirName()}'s rating`, theirs),
          // Only said while there is still something to arrive.
          mine && !theirs
            ? el('p', {
                class: 'ratemark__reveal',
                text: `${theirName()}'s rating arrives when it's revealed.`,
              })
            : null,
        ].filter(Boolean)
      );
    }
    return null;
  }

  /** A rating already written, printed as the fact it now is. */
  function ratingFact(who, rating) {
    return el('div', { class: 'ratemark__fact' }, [
      el('p', { class: 'ratemark__factline' }, [
        el('span', { class: 'ratemark__who', text: who }),
        el('span', {
          class: 'ratemark__glyphs',
          'aria-hidden': 'true',
          text: starGlyphs(rating.stars),
        }),
        el('span', { class: 'visually-hidden', text: `${rating.stars} out of 5 stars` }),
      ]),
      rating.comment
        ? el('p', { class: 'prose prose--sm ratemark__comment', text: rating.comment })
        : null,
    ].filter(Boolean));
  }

  /**
   * Five stars, an optional note, and a commit that says it is final.
   *
   * Native radios in reading order, so the row is arrow-key navigable and
   * announced as a group without a line of script: the labels carry the words
   * ("3 stars") and the glyph is decoration over them. The fill is painted on
   * change rather than through a redraw, which would take the words already
   * typed into the note with it. Shape changes as well as colour — a pale
   * *filled* star reads as a rating already given and greyed out.
   */
  function rateForm(booking, theirs) {
    const who = theirName();
    const labels = [];
    const glyphs = [];
    const radios = [];
    const paint = () =>
      labels.forEach((node, at) => {
        const lit = at < stars;
        node.classList.toggle('is-on', lit);
        glyphs[at].textContent = lit ? '★' : '☆';
      });
    const inputs = [1, 2, 3, 4, 5].flatMap((n) => {
      const id = `host-rate-${n}`;
      const glyph = el('span', { class: 'ratemark__glyph', 'aria-hidden': 'true', text: '☆' });
      const label = el('label', { class: 'ratemark__star', for: id }, [
        glyph,
        el('span', { class: 'visually-hidden', text: n === 1 ? '1 star' : `${n} stars` }),
      ]);
      labels.push(label);
      glyphs.push(glyph);
      const input = el('input', {
        type: 'radio',
        class: 'ratemark__input',
        name: 'host-rate',
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

    return el('section', { class: 'ratemark', dataset: { state: theirs ? 'invited' : 'open' } }, [
      el('h2', { class: 'ratemark__ask', text: 'How was the group?' }),
      el('fieldset', { class: 'ratemark__stars' }, [
        el('legend', { class: 'visually-hidden', text: 'How was the group?' }),
        ...inputs,
      ]),
      el('label', {
        class: 'eyebrow ratemark__notelabel',
        for: 'host-rate-note',
        text: 'A few words, if you like (optional)',
      }),
      rateNote,
      confirmingRate
        ? el('div', { class: 'ratemark__confirm' }, [
            el('p', {
              class: 'prose prose--sm',
              text: "Your rating is final — steeple doesn't allow edits.",
            }),
            el('div', { class: 'ratemark__actions' }, [
              el(
                'button',
                {
                  type: 'button',
                  class: 'pill pill--primary',
                  dataset: { action: 'rate-send' },
                  onclick: async () => {
                    const sent = await move(() =>
                      wire.rateBooking(booking.id, { stars, comment: rateNote.value })
                    );
                    // Only a rating steeple took empties the form. A refusal
                    // leaves it exactly as it stands, under the line explaining
                    // why (the refusal slip lives in this same column).
                    if (!sent) return;
                    stars = 0;
                    rateNote.value = '';
                    confirmingRate = false;
                    announce?.('Your rating is in.');
                    show(application.id);
                  },
                },
                'Yes, send it'
              ),
              el(
                'button',
                {
                  type: 'button',
                  class: 'linkish',
                  dataset: { action: 'rate-cancel' },
                  onclick: () => {
                    confirmingRate = false;
                    renderInvitation();
                    // Back where they were, not at the top of a rebuilt column.
                    invitation.querySelector('[data-action="rate-open"]')?.focus();
                  },
                },
                'Not yet'
              ),
            ]),
          ])
        : el('div', { class: 'ratemark__actions' }, [
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
                  confirmingRate = true;
                  renderInvitation();
                  // That redraw drops keyboard focus on the floor, and the step
                  // that just appeared is what was asked for.
                  invitation.querySelector('[data-action="rate-send"]')?.focus();
                },
              },
              'Rate this group'
            ),
          ]),
      el('p', {
        class: 'ratemark__reveal',
        text: theirs
          ? `${who} has rated this booking — rate back to see it.`
          : `${who} sees your rating once they've rated you back, or after the window closes.`,
      }),
    ]);
  }

  /** Whatever the rating block is currently saying, said aloud. */
  function ratingSpoken() {
    const ratings = bookingFor(application.id)?.ratings ?? null;
    if (!ratings) return '';
    const mine = ratings.byVenue ?? null;
    const theirs = ratings.byOrganizer ?? null;
    const said = [
      mine ? `Your rating: ${mine.stars} out of 5.` : '',
      theirs ? `${theirName()} rated this ${theirs.stars} out of 5.` : '',
    ].filter(Boolean);
    if (said.length) return said.join(' ');
    const booking = bookingFor(application.id);
    const settled = booking.status === 'completed' || booking.status === 'cancelled';
    return settled && ratings.canRate === true ? 'This booking has finished — you can rate the group.' : '';
  }

  // ── the left-hand page ────────────────────────────────────────────────────

  /**
   * What the platform can honestly say about the person, worn as chips.
   *
   * The rating summary is steeple's and it arrives whole or not at all: an
   * organizer nobody has rated yet has no summary, and no chip — not "no
   * ratings", not an empty row of stars. A group's first booking should not
   * read as a warning about them, and the no-show count rides the same rule,
   * which is why it is invisible until there is a rating to put it beside (D4).
   */
  function trustChips(organizer) {
    const rated = organizer.ratingSummary ?? null;
    const chips = [
      organizer.verified
        ? el('span', { class: 'verified verified--sm' }, [
            el('span', { class: 'verified__dot', 'aria-hidden': 'true' }),
            VERIFIED_LABEL,
          ])
        : null,
      rated
        ? el('span', { class: 'chip ratemark__chip' }, [
            // The mark is decoration over the sentence beside it: read as a
            // glyph it is a noise, read as the sentence it is the fact.
            el('span', { 'aria-hidden': 'true' }, [
              el('span', { class: 'ratemark__mark', text: '★' }),
              ` ${rated.averageStars.toFixed(1)} · ${plural(rated.ratingCount, 'rating', 'ratings')}`,
            ]),
            el('span', {
              class: 'visually-hidden',
              text: `Rated ${rated.averageStars.toFixed(1)} out of 5 from ${plural(
                rated.ratingCount,
                'rating',
                'ratings'
              )}`,
            }),
          ])
        : null,
      rated && rated.noShowCount > 0
        ? el('span', {
            class: 'chip ratemark__chip ratemark__chip--flag',
            text: `${plural(rated.noShowCount, 'no-show', 'no-shows')} this year`,
          })
        : null,
      joinedText(organizer) ? el('span', { class: 'chip', text: joinedText(organizer) }) : null,
    ].filter(Boolean);
    return chips.length ? el('div', { class: 'letterpage__chips' }, chips) : null;
  }

  /**
   * Only when the title carries the group's name does this have a job left to
   * do: naming the person behind it, once. Everyone else is already named in
   * the title, and their trust chips live in the head beside it.
   */
  function trustBlock(organizer) {
    if (!organizer.org) return null;
    return el('section', { class: 'trust' }, [
      el('h2', { class: 'eyebrow', text: 'Who is asking' }),
      el('p', { class: 'trust__name', text: organizer.name }),
    ]);
  }

  /**
   * The correspondence, and the way to add to it. The reply box lives here — on
   * the thread, where a person looks for it — not among the decisions: writing
   * back keeps the request open, and their answer brings it back to you.
   */
  function threadBlock() {
    const messages = threadFor(application.id);
    const undecided = UNDECIDED.has(application.status);
    if (!messages.length && !undecided) return null;
    const who = organizerOf(application).name;

    const box = el('textarea', {
      class: 'input input--area',
      id: 'reply-body',
      rows: '2',
      placeholder: `Write back to ${who}…`,
    });
    const send = el(
      'button',
      {
        type: 'button',
        class: 'pill',
        dataset: { action: 'send-reply' },
        onclick: async () => {
          const body = box.value.trim();
          if (!body) {
            box.focus();
            announce?.('Write the message first.');
            return;
          }
          const updated = await move(() => wire.ask(application.id, body));
          if (!updated) return;
          announce?.(`Sent. The request stays open and now waits on ${who}.`);
          show(application.id);
        },
      },
      'Send'
    );

    return el('section', { class: 'thread' }, [
      el('h2', { class: 'eyebrow', text: 'Messages' }),
      messages.length
        ? el(
            'ol',
            { class: 'thread__list' },
            messages.map((message) =>
              el('li', { class: `thread__item thread__item--${message.sender}` }, [
                el('p', {
                  class: 'thread__by',
                  text: `${message.sender === 'host' ? 'You wrote' : `${who} wrote`} · ${fmtDate(
                    message.sentAt.slice(0, 10)
                  )}`,
                }),
                el('p', { class: 'prose prose--sm', text: message.body }),
              ])
            )
          )
        : null,
      undecided ? el('div', { class: 'thread__reply' }, [box, send]) : null,
    ]);
  }

  function counterHistoryBlock() {
    const counters = countersFor(application.id);
    if (!counters.length) return null;
    const word = {
      [COUNTER_STATUS.open]: 'waiting with them',
      [COUNTER_STATUS.accepted]: 'accepted',
      [COUNTER_STATUS.declinedByOrganizer]: 'declined by them',
      [COUNTER_STATUS.superseded]: 'superseded',
      [COUNTER_STATUS.lapsed]: 'lapsed',
    };
    return el('section', { class: 'counters' }, [
      el('h2', { class: 'eyebrow', text: 'Times you have offered' }),
      el(
        'ul',
        { class: 'counters__list' },
        counters.map((entry) =>
          el('li', { class: 'counters__item' }, [
            el('span', { class: 'counters__when', text: scheduleLine(entry) }),
            el('span', { class: 'counters__status', text: word[entry.status] ?? entry.status }),
            entry.message ? el('p', { class: 'prose prose--sm', text: entry.message }) : null,
          ])
        )
      ),
    ]);
  }

  /**
   * Which space this is, identifiable at a glance — a host with many rooms
   * knows them by sight, not by re-reading their own listing copy. Photo, name,
   * the two facts a decision leans on, and nothing echoed back.
   */
  function spaceBlock(room, venue) {
    const facts = [
      venue?.shortName ?? null,
      `Seats ${room.capacity}`,
      room.pricePerHour == null ? 'Free' : `$${room.pricePerHour}/hr`,
    ].filter(Boolean);
    return el('section', { class: 'spacecard' }, [
      room.photo
        ? el('img', { class: 'spacecard__photo', src: room.photo, alt: '' })
        : el('span', { class: 'spacecard__photo spacecard__photo--none', 'aria-hidden': 'true' }),
      el('span', { class: 'spacecard__body' }, [
        el('span', { class: 'spacecard__name', text: room.name }),
        el('span', { class: 'spacecard__meta', text: facts.join(' · ') }),
      ]),
    ]);
  }

  function outcomeBlock() {
    if (application.status === APP_STATUS.approved) {
      const booking = bookingFor(application.id);
      const dates = booking ? occurrencesFor(booking.id).map((o) => o.date) : [];
      return el('section', { class: 'outcome outcome--approved' }, [
        el('h2', { class: 'eyebrow', text: 'Booked' }),
        el('p', {
          class: 'prose prose--sm',
          text: `${
            dates.length
              ? `${plural(dates.length, 'date', 'dates')} held for them, ${fmtDateRange(
                  dates[0],
                  dates.at(-1)
                )}`
              : 'Approved'
          }${application.decidedAt ? ` · answered ${fmtDate(application.decidedAt.slice(0, 10))}` : ''}.`,
        }),
      ]);
    }
    if (application.status === APP_STATUS.declined) {
      // The note already stands in the messages; do not say it twice.
      const inThread = threadFor(application.id).some((m) => m.body === application.declineNote);
      return el('section', { class: 'outcome' }, [
        el('h2', { class: 'eyebrow', text: 'Declined' }),
        el('p', {
          class: 'prose prose--sm',
          text: application.decidedAt
            ? `Answered ${fmtDate(application.decidedAt.slice(0, 10))}, with the note above.`
            : 'Answered.',
        }),
        application.declineNote && !inThread
          ? el('p', { class: 'prose prose--sm', text: application.declineNote })
          : null,
      ]);
    }
    return el('section', { class: 'outcome' }, [
      el('h2', { class: 'eyebrow', text: STATUS_WORD[application.status] }),
      el('p', {
        class: 'prose prose--sm',
        text: 'Nothing more is asked of you on this one.',
      }),
    ]);
  }

  // ── show ──────────────────────────────────────────────────────────────────

  function show(applicationId, { refresh = false } = {}) {
    // A different letter is a different rating. A redraw of the same one is not
    // — the detail read landing behind an open letter must not take the stars
    // somebody has already chosen with it.
    const another = application?.id !== applicationId;
    application = getApplication(applicationId);
    if (!application) return false;
    if (another) {
      stars = 0;
      rateNote.value = '';
      confirmingRate = false;
    }
    // The desk's list read carries no thread — only the detail read does. Asked
    // once when the letter is opened, never on the redraws a decision causes.
    if (refresh) {
      wire.openApplication(applicationId).then((answer) => {
        if (!answer.ok || application?.id !== applicationId) return;
        show(applicationId);
      });
    }
    clearTimeout(sealTimer);
    element.classList.remove('is-sealed');
    mode = 'none';
    counter = null;
    replaceChildren(drawer, []);
    drawer.classList.remove('is-open');

    const organizer = organizerOf(application);
    const venue = venueOf(application.venueId);
    const room = effectiveRoom(application.venueId, application.roomId);
    const undecided = UNDECIDED.has(application.status);

    replaceChildren(head, [
      el(
        'button',
        { type: 'button', class: 'linkish sheet__up', dataset: { action: 'back' }, onclick: onBackToDesk },
        venue?.shortName ? `← Requests at ${venue.shortName}` : '← Requests'
      ),
      el('p', { class: 'eyebrow', text: `Request · ${STATUS_WORD[application.status]}` }),
      el('h1', { class: 'sheet__title', text: organizer.org ?? organizer.name }),
      el('p', {
        class: 'letterpage__meta',
        text: `About ${plural(application.groupSize, 'person', 'people')} · ${
          application.activityType
        } · Sent ${fmtDate(application.createdAt.slice(0, 10))}`,
      }),
      trustChips(organizer),
    ]);

    replaceChildren(left, [
      // The space first: with many rooms, "which one is this about" is the
      // first question, and a photo answers it faster than any line of text.
      room ? spaceBlock(room, venue) : null,
      el('section', { class: 'intent' }, [
        el('h2', { class: 'eyebrow', text: 'Plans' }),
        el('p', { class: 'intent__body', text: application.intentText }),
      ]),
      trustBlock(organizer),
      threadBlock(),
      counterHistoryBlock(),
      undecided ? null : outcomeBlock(),
    ]);

    replaceChildren(week, [
      el('h2', { class: 'eyebrow', text: 'When' }),
      scheduleText,
      ribbon.element,
      legend(),
      verdict,
    ]);

    refreshWeek();
    renderInvitation();
    renderActions();
    return true;
  }

  function spoken() {
    if (!application) return '';
    const organizer = organizerOf(application);
    const room = effectiveRoom(application.venueId, application.roomId);
    const read = readSchedule(application.venueId, application.roomId, scheduleOf(application));
    return [
      `A request from ${organizer.org ?? organizer.name}, ${organizer.name}. ${STATUS_WORD[application.status]}.`,
      `${room?.name ?? ''} for ${plural(application.groupSize, 'person', 'people')}, ${application.activityType}.`,
      scheduleLine(application),
      organizer.verified ? `${VERIFIED_LABEL}.` : '',
      organizer.ratingSummary
        ? `Rated ${organizer.ratingSummary.averageStars.toFixed(1)} out of 5 from ${plural(
            organizer.ratingSummary.ratingCount,
            'rating',
            'ratings'
          )}${
            organizer.ratingSummary.noShowCount > 0
              ? `, with ${plural(organizer.ratingSummary.noShowCount, 'no-show', 'no-shows')} this year`
              : ''
          }.`
        : '',
      joinedText(organizer) ? `${joinedText(organizer)}.` : '',
      application.intentText,
      ribbonSpoken(application.venueId, application.roomId, scheduleOf(application), application.id),
      read.notes.map((n) => n.text).join(' '),
      UNDECIDED.has(application.status)
        ? 'You can approve, decline, suggest another time, or write back on the thread.'
        : ratingSpoken(),
    ]
      .filter(Boolean)
      .join(' ');
  }

  return {
    element,
    show,
    spoken,
    application: () => application,
    closeDrawer,
    isDrawerOpen: () => mode !== 'none',
  };
}
