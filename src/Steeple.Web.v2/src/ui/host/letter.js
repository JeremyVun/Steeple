// A REQUEST — one application, opened. On the left, what was asked and by
// whom, with the trust the platform can honestly vouch for. On the right, the
// week: the schedule ribbon, what it collides with, and the four things a host
// can do about it. Approve seals it and gets out of the way.

import { state } from '../../core/bus.js';
import {
  APP_STATUS,
  COUNTER_STATUS,
  DAY_LABELS,
  UNDECIDED,
  approve,
  askQuestion,
  bookingFor,
  counterOffer,
  countersFor,
  decline,
  effectiveRoom,
  getApplication,
  maskToDays,
  daysToMask,
  occurrencesFor,
  sendMessage,
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

const VERIFIED_LABEL = 'Identity verified (SSO)';
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

const QUESTION_STARTERS = [
  'How many adults will be with the group?',
  'Will you need the kitchen or the stage?',
  'Who should we call on the day if something is locked?',
];

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
  const head = el('header', { class: 'letter__head' });
  const left = el('div', { class: 'letter__left' });
  const week = el('section', { class: 'letter__week' });
  const actions = el('div', { class: 'letter__actions' });
  const drawer = el('div', { class: 'letter__drawer' });
  const right = el('div', { class: 'letter__right' }, [week, actions, drawer]);
  const sheet = el('article', { class: 'letter__sheet' }, [
    head,
    el('div', { class: 'letter__cols' }, [left, right]),
  ]);
  const seal = el('div', { class: 'seal' });
  const element = el('div', { class: 'letterpage' }, [sheet, seal]);

  const ribbon = createRibbon();
  const verdict = el('div', { class: 'verdict' });
  const scheduleText = el('p', { class: 'letter__when' });

  let application = null;
  let mode = 'none'; // none | ask | decline | counter | clash
  let counter = null;
  let sealTimer = 0;

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

  function openAsk() {
    mode = 'ask';
    const box = el('textarea', {
      class: 'input input--area',
      id: 'ask-body',
      rows: '4',
      placeholder: 'A short question, in your own words.',
    });
    const send = el(
      'button',
      {
        type: 'button',
        class: 'pill pill--primary',
        dataset: { action: 'send-question' },
        onclick: () => {
          const body = box.value.trim();
          if (!body) {
            box.focus();
            announce?.('Write the question first.');
            return;
          }
          const result =
            application.status === APP_STATUS.pending
              ? askQuestion(application.id, body)
              : sendMessage(application.id, 'host', body);
          if (!result.ok) {
            announce?.('That question could not be sent.');
            return;
          }
          announce?.(
            `Question sent. The request now waits on ${organizerOf(application).name} and shows as question asked.`
          );
          show(application.id);
        },
      },
      'Send the question'
    );

    replaceChildren(drawer, [
      el('h3', { class: 'eyebrow', text: 'Ask a question' }),
      el('p', {
        class: 'prose prose--sm',
        text: 'The request stays open while you wait, and their answer brings it back to you.',
      }),
      labelled('Your question', box),
      el(
        'ul',
        { class: 'starters' },
        QUESTION_STARTERS.map((text) =>
          el(
            'li',
            {},
            el(
              'button',
              {
                type: 'button',
                class: 'linkish',
                onclick: () => {
                  box.value = box.value ? `${box.value.trim()} ${text}` : text;
                  box.focus();
                },
              },
              text
            )
          )
        )
      ),
      el('div', { class: 'drawer__foot' }, [send, cancelButton()]),
    ]);
    revealDrawer();
    renderActions();
    box.focus();
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
            onclick: () => {
              const result = decline(application.id, box.value);
              if (!result.ok) {
                announce?.('That request can no longer be declined.');
                return;
              }
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
        onclick: () => {
          const result = counterOffer(application.id, counter, message.value);
          if (!result.ok) {
            note.textContent = result.errors?.schedule ?? 'That counter could not be offered.';
            announce?.(note.textContent);
            return;
          }
          announce?.(
            `Counter-offer sent: ${scheduleLine(counter)}. The request waits with ${
              organizerOf(application).name
            } now.`
          );
          show(application.id);
        },
      },
      'Send the counter-offer'
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
      el('h3', { class: 'eyebrow', text: 'Counter-offer a different time' }),
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
    announce?.('Counter-offer editor open. The ribbon follows what you change.');
  }

  function showClash(clashes) {
    mode = 'clash';
    const dates = [...new Set(clashes.map((c) => c.date))].sort();
    replaceChildren(drawer, [
      el('h3', { class: 'eyebrow eyebrow--alert', text: 'Already taken' }),
      el('p', {
        class: 'prose prose--sm',
        text: `${plural(dates.length, 'date is', 'dates are')} held by a booking this venue has already made, so this cannot be approved as it stands.`,
      }),
      el(
        'ul',
        { class: 'clashlist' },
        clashes
          .slice(0, 6)
          .map((clash) =>
            el('li', {
              text: `${fmtDate(clash.date, true)} · ${fmtTimeRange(clash.start, clash.end)} is held`,
            })
          )
      ),
      dates.length > 6
        ? el('p', { class: 'field__hint', text: `and ${dates.length - 6} more.` })
        : null,
      el('div', { class: 'drawer__foot' }, [
        el(
          'button',
          {
            type: 'button',
            class: 'pill pill--primary',
            dataset: { action: 'counter-instead' },
            onclick: () => openCounter(),
          },
          'Offer another time'
        ),
        cancelButton('Look again'),
      ]),
    ]);
    revealDrawer();
    renderActions();
    announce?.(
      `This cannot be approved: ${plural(dates.length, 'date collides', 'dates collide')} with a booking already made. A counter-offer is the way through.`
    );
  }

  function cancelButton(label = 'Cancel') {
    return el(
      'button',
      { type: 'button', class: 'linkish', dataset: { action: 'cancel' }, onclick: closeDrawer },
      label
    );
  }

  function onApprove() {
    const result = approve(application.id);
    if (!result.ok) {
      if (result.clashes?.length) showClash(result.clashes);
      else announce?.('That request can no longer be approved.');
      return;
    }
    const dates = result.occurrences.map((o) => o.date);
    sealed(dates);
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
          'Back to requests'
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

    replaceChildren(actions, [
      button('Approve', 'approve', 'pill pill--primary', onApprove),
      button(
        application.status === APP_STATUS.pending ? 'Ask a question' : 'Write back',
        'ask',
        'pill',
        openAsk
      ),
      button('Counter-offer', 'counter', 'pill', () => openCounter()),
      button('Decline', 'decline', 'pill pill--quiet', openDecline),
    ]);
  }

  // ── the left-hand page ────────────────────────────────────────────────────

  function trustBlock(organizer) {
    return el('section', { class: 'trust' }, [
      el('h2', { class: 'eyebrow', text: 'Who is asking' }),
      el('p', { class: 'trust__name', text: organizer.name }),
      organizer.org ? el('p', { class: 'trust__org', text: organizer.org }) : null,
      el('div', { class: 'trust__signals' }, [
        organizer.verified
          ? el('span', { class: 'verified verified--sm' }, [
              el('span', { class: 'verified__dot', 'aria-hidden': 'true' }),
              VERIFIED_LABEL,
            ])
          : null,
        joinedText(organizer) ? el('span', { class: 'chip', text: joinedText(organizer) }) : null,
      ]),
    ]);
  }

  function threadBlock() {
    const messages = threadFor(application.id);
    if (!messages.length) return null;
    return el('section', { class: 'thread' }, [
      el('h2', { class: 'eyebrow', text: 'Messages' }),
      el(
        'ol',
        { class: 'thread__list' },
        messages.map((message) =>
          el('li', { class: `thread__item thread__item--${message.sender}` }, [
            el('p', {
              class: 'thread__by',
              text: `${message.sender === 'host' ? 'You wrote' : `${organizerOf(application).name} wrote`} · ${fmtDate(
                message.sentAt.slice(0, 10)
              )}`,
            }),
            el('p', { class: 'prose prose--sm', text: message.body }),
          ])
        )
      ),
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

  /** The listing as it stands, so a decision is made against the real room. */
  function spaceBlock(room) {
    return el('section', { class: 'space-note' }, [
      el('h2', { class: 'eyebrow', text: 'The space they are asking for' }),
      el('p', { class: 'space-note__line' }, [
        `${room.name} · seats ${room.capacity} · `,
        el('span', {
          class: `price price--sm${room.pricePerHour == null ? ' price--free' : ''}`,
          text: room.pricePerHour == null ? 'Free' : `$${room.pricePerHour}/hr`,
        }),
      ]),
      el('p', {
        class: 'field__hint',
        text: `Welcomes ${room.activities.join(', ')}. ${room.houseRules}`,
      }),
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

  function show(applicationId) {
    application = getApplication(applicationId);
    if (!application) return false;
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
        class: 'letter__meta',
        text: `${room?.name ?? application.roomId} · ${plural(
          application.groupSize,
          'person',
          'people'
        )} in a room for ${room?.capacity ?? '—'} · ${application.activityType} · sent ${fmtDate(
          application.createdAt.slice(0, 10)
        )}`,
      }),
    ]);

    replaceChildren(left, [
      el('section', { class: 'intent' }, [
        el('h2', { class: 'eyebrow', text: 'What they would like to do' }),
        el('p', { class: 'intent__body', text: application.intentText }),
      ]),
      trustBlock(organizer),
      threadBlock(),
      counterHistoryBlock(),
      undecided ? null : outcomeBlock(),
      room ? spaceBlock(room) : null,
    ]);

    replaceChildren(week, [
      el('h2', { class: 'eyebrow', text: 'The week they are asking for' }),
      scheduleText,
      ribbon.element,
      legend(),
      verdict,
    ]);

    refreshWeek();
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
      joinedText(organizer) ? `${joinedText(organizer)}.` : '',
      application.intentText,
      ribbonSpoken(application.venueId, application.roomId, scheduleOf(application), application.id),
      read.notes.map((n) => n.text).join(' '),
      UNDECIDED.has(application.status)
        ? 'Four decisions are open: approve, ask a question, counter-offer, decline.'
        : '',
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
