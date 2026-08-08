// THE APPLY FLOW — asking a church for a space.
//
// One sheet laid over the village: a heading naming the space, a note in the
// guest's own words, the two facts a church needs (what the group does, how
// many are coming) and the week card where the hours are chosen. Every rule
// shown here is the store's own (validateApplication); nothing is checked twice
// in different words.
//
// The sheet is an overlay over the room it is about, and there is exactly one
// way out of it — `onLeave`, which puts the guest back on that room. The back
// arrow at the top left, a click on the paper around the sheet, and Escape all
// take it. The identity step is one level deeper, so those three close that
// first: you never lose a written request to a key you pressed to dismiss a
// card.

import { track } from '../../data/analytics.js';
import { getRoomAvailability, getListing, heldVenue, readFailure } from '../../data/catalog.js';
import { effectiveRoom, todayIso, addDays, validateApplication } from '../../data/store.js';
import { priceParts } from '../copy.js';
import { el, replaceChildren } from '../dom.js';
import {
  formatDate,
  occurrenceCount,
  plural,
  scheduleSentence,
} from './copy.js';
import { createCardStep } from './payment.js';
import { isSignedIn } from '../../data/session.js';
import { sendRequest } from './send.js';
import { createIdentityStep } from './sso.js';
import { createWeekCard } from './weekCard.js';

/** How far ahead one availability read reaches. The feed allows up to 92 days. */
const WEEKS_AHEAD = 6;

const INTENT_LIMIT = 2000;
const COUNT_FROM = 1600;

// Drafts survive leaving the request — a stray click on the village must never
// cost a guest the paragraph they just wrote.
const drafts = new Map();

const blankDraft = (venueId, roomId, room) => ({
  venueId,
  roomId,
  activityType: room.activities.length === 1 ? room.activities[0] : null,
  groupSize: '',
  organizationName: '',
  frequency: 'oneOff',
  startDate: null,
  endDate: null,
  daysOfWeekMask: 0,
  startTime: null,
  endTime: null,
  intentText: '',
});

export function createComposer({ announce, onSent, onLeave }) {
  let venue = null;
  let room = null;
  let draft = null;
  let attempted = false;
  const touched = new Set();

  // What steeple says about this room, once it has been asked: its weekly open
  // hours, the dates it is closed, and whether a request here books the space
  // outright or asks the host for it.
  let roomHours = null;
  let closedDates = [];
  let bookingMode = null;
  let asked = new Set();

  const week = createWeekCard({
    announce,
    onChange: (schedule) => {
      Object.assign(draft, schedule);
      touched.add('schedule');
      renderWhen();
      renderFoot();
    },
    onWeek: (start) => loadAvailability(start),
  });

  const identity = createIdentityStep({
    announce,
    // The guest has already asked to send; naming themselves is the last beat.
    onVerify: () => dispatch(),
    onCancel: () => closeIdentity(),
  });
  identity.element.hidden = true;

  // A card on file is the last thing steeple asks for, and only when it has to:
  // the step opens on a 402 and gets out of the way again the moment it is done.
  const card = createCardStep({
    announce,
    onSaved: () => {
      closeCard();
      dispatch();
    },
    onCancel: () => closeCard(),
  });
  card.element.hidden = true;

  // The way back, where a way back belongs: an arrow at the top left, before
  // anything the sheet asks for.
  const back = el(
    'button',
    {
      type: 'button',
      class: 'letter__back',
      'aria-label': 'Back to the space',
      onclick: () => leaveSheet(),
    },
    [el('span', { class: 'letter__backglyph', 'aria-hidden': 'true', text: '←' })]
  );

  const head = el('header', { class: 'letter__head' });
  const noteCol = el('div', { class: 'letter__col letter__col--note' });
  const whenCol = el('div', { class: 'letter__col letter__col--when' });
  const columns = el('div', { class: 'letter__columns' }, [noteCol, whenCol]);
  const foot = el('footer', { class: 'letter__foot' });
  const sheet = el('form', { class: 'letter__sheet', novalidate: true }, [
    el('div', { class: 'letter__nav' }, [back]),
    head,
    columns,
    foot,
    identity.element,
    card.element,
  ]);
  sheet.addEventListener('submit', (event) => {
    event.preventDefault();
    seal();
  });

  // The paper around the sheet, as a thing a mouse can land on. It stops below
  // the top line so the breadcrumb and the porch stay reachable over an open
  // request — they are ways out too, and a modal that swallows them is a trap.
  const backdrop = el('div', { class: 'letter__backdrop', 'aria-hidden': 'true' });

  const element = el('div', { class: 'guest__surface guest__surface--letter' }, [backdrop, sheet]);

  const isOpen = () => element.classList.contains('is-open');
  const signing = () => !identity.element.hidden;
  const paying = () => !card.element.hidden;

  /** The one exit. One step deeper closes first; otherwise the room returns. */
  function leaveSheet() {
    if (paying()) return closeCard();
    if (signing()) return closeIdentity();
    onLeave?.();
  }

  // Only a press that both starts and ends on the backdrop counts — a text
  // selection dragged out of the note must not throw the request away.
  let pressedOutside = false;
  backdrop.addEventListener('pointerdown', () => {
    pressedOutside = true;
  });
  element.addEventListener('pointerdown', (event) => {
    if (event.target !== backdrop) pressedOutside = false;
  });
  backdrop.addEventListener('click', () => {
    if (!pressedOutside) return;
    pressedOutside = false;
    leaveSheet();
  });

  // Escape, wherever focus sits inside the request. Capture, and stop: the
  // journey's own Escape would guess at where to go back to, and this sheet
  // knows exactly.
  window.addEventListener(
    'keydown',
    (event) => {
      if (event.key !== 'Escape' || !isOpen()) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      event.preventDefault();
      event.stopPropagation();
      leaveSheet();
    },
    { capture: true }
  );

  // ── fields ────────────────────────────────────────────────────────────────

  const intent = el('textarea', {
    class: 'field__input field__input--note',
    id: 'letter-intent',
    rows: '7',
    maxlength: String(INTENT_LIMIT + 200),
    spellcheck: 'true',
    placeholder: 'Who your group is, what you would do in the space, and anything the host would want to know.',
  });
  intent.addEventListener('input', () => {
    draft.intentText = intent.value;
    touched.add('intentText');
    renderCount();
    renderFoot();
  });

  const count = el('p', { class: 'field__count' });
  const intentNote = el('p', { class: 'field__note' });

  // Group size: a stepper, because the number is small, bounded by the room's
  // own capacity, and most often nudged rather than typed. The field stays a
  // real spinbutton, so a screen reader hears the value, its floor and its
  // ceiling, and the arrow keys work without anyone being told they do.
  const size = el('input', {
    class: 'stepper__value',
    id: 'letter-size',
    type: 'number',
    min: '1',
    step: '1',
    inputmode: 'numeric',
    placeholder: '—',
  });

  const fewer = el(
    'button',
    { type: 'button', class: 'stepper__step', 'aria-label': 'Fewer people', onclick: () => stepSize(-1) },
    '−'
  );
  const more = el(
    'button',
    { type: 'button', class: 'stepper__step', 'aria-label': 'More people', onclick: () => stepSize(1) },
    '+'
  );
  const stepper = el('div', { class: 'stepper' }, [
    fewer,
    size,
    more,
    el('span', { class: 'stepper__unit', 'aria-hidden': 'true', text: 'people' }),
  ]);

  /** The typed value as an integer, or null while the field is empty. */
  const sizeValue = () => {
    const raw = String(draft.groupSize ?? '').trim();
    if (!raw) return null;
    const n = Number(raw);
    return Number.isInteger(n) ? n : null;
  };

  const clampSize = (n) => Math.min(Math.max(n, 1), room.capacity);

  function setSize(next, spoken) {
    draft.groupSize = String(next);
    size.value = draft.groupSize;
    touched.add('groupSize');
    syncStepper();
    renderNote();
    renderFoot();
    if (spoken) announce?.(spoken);
  }

  function stepSize(delta) {
    const now = sizeValue();
    const next = clampSize(now === null ? 1 : now + delta);
    if (next === now) return;
    setSize(next, `${plural(next, 'person', 'people')}.`);
  }

  /** The buttons stop where the room does; the value says so out loud. */
  function syncStepper() {
    const now = sizeValue();
    fewer.disabled = now === null || now <= 1;
    more.disabled = now !== null && now >= room.capacity;
    size.max = String(room.capacity);
    size.setAttribute('aria-valuemin', '1');
    size.setAttribute('aria-valuemax', String(room.capacity));
    if (now === null) size.removeAttribute('aria-valuetext');
    else size.setAttribute('aria-valuetext', plural(now, 'person', 'people'));
  }

  // Focusing a number that is already there means replacing it, not editing a
  // digit of it: a number field has no text selection to fall back on, so
  // clearing one by hand is four backspaces at the wrong end of the caret.
  size.addEventListener('focus', () => size.select?.());

  size.addEventListener('input', () => {
    draft.groupSize = size.value;
    touched.add('groupSize');
    syncStepper();
    renderNote();
    renderFoot();
  });
  // Typing past the room's capacity is a mistake worth catching gently, and
  // when the guest has finished typing rather than in the middle of it.
  size.addEventListener('change', () => {
    const now = sizeValue();
    if (now === null) return;
    const held = clampSize(now);
    if (held === now) return;
    setSize(held, `${room.name} seats up to ${room.capacity}.`);
  });

  // Who is asking, in their own words. The host is shown this beside the name
  // on the request; it is the request's fact, not the account's — the same
  // person writes for the playgroup one week and the chess club the next
  // (v2_migration D1, which is where the hardcoded email→organization table
  // died). Optional, because plenty of people are only themselves.
  const organization = el('input', {
    class: 'field__input',
    id: 'letter-organization',
    type: 'text',
    maxlength: '200',
    autocomplete: 'organization',
    placeholder: 'Little Sparrows Playgroup',
  });
  organization.addEventListener('input', () => {
    draft.organizationName = organization.value;
    touched.add('organizationName');
  });

  const sizeNote = el('p', { class: 'field__note' });
  const activities = el('div', { class: 'choices' });
  const activityNote = el('p', { class: 'field__note' });

  const frequency = el('div', { class: 'choices choices--segment' });
  const until = el('div', { class: 'field field--until' });
  const summary = el('p', { class: 'letter__summary' });
  const scheduleNote = el('p', { class: 'field__note' });

  const errors = el('div', { class: 'letter__errors', role: 'status' });
  // Why the send is not ready yet, said quietly: one thing at a time, in the
  // store's own words. Nothing is wrong until a send is attempted, so this is
  // never red — it is the button's caption, not a scolding.
  const unready = el('p', { class: 'letter__unready' });
  const send = el('button', { type: 'submit', class: 'pill pill--primary pill--wide' }, 'Send request');

  // A venue that books instantly is not being asked a question, so the button
  // does not pretend it is. Until steeple has said which kind this is, the
  // neutral wording stands (docs/contracts/payments.md — RoomDetail.bookingMode).
  const sendLabel = () => (bookingMode === 'instant' ? 'Book this space' : 'Send request');

  // ── render ────────────────────────────────────────────────────────────────

  function renderCount() {
    const length = intent.value.length;
    count.textContent =
      length >= COUNT_FROM
        ? `${plural(Math.max(INTENT_LIMIT - length, 0), 'character', 'characters')} left`
        : '';
    count.classList.toggle('is-over', length > INTENT_LIMIT);
  }

  function renderNote() {
    const value = Number(draft.groupSize);
    sizeNote.textContent =
      Number.isInteger(value) && value > 0 && value <= room.capacity
        ? `${room.name} seats up to ${room.capacity}.`
        : `Seats up to ${room.capacity}.`;
  }

  function fieldError(field) {
    if (!attempted && !touched.has(field)) return null;
    return validate().errors[field] ?? null;
  }

  let cachedDraft = null;
  let cachedResult = null;
  function validate() {
    const key = JSON.stringify(draft);
    if (key !== cachedDraft) {
      cachedDraft = key;
      // The room is handed in, because it may be one only the catalog knows —
      // and the hours check only runs once steeple has said what the hours are.
      // A browser that has not been told them refuses nothing on its own account.
      cachedResult = validateApplication(draft, { windows: roomHours, room });
    }
    return cachedResult;
  }

  // ── what steeple says about this room ─────────────────────────────────────

  /**
   * The room's own truth: steeple's id for it, its open hours, and whether a
   * request here is the booking. Fetched once per opening of the sheet; until
   * it lands the week card says it is reading rather than showing an empty week.
   */
  async function loadRoom(venueId, roomId) {
    let listing;
    try {
      listing = await getListing(venueId, roomId);
    } catch (error) {
      // steeple answered and refused. This sheet is the commitment point, and
      // its open hours are the whole of what it knows about when this space is
      // free — a browser that was refused them would take a date on nothing but
      // the village's scenery. So the sheet says it cannot open rather than
      // standing there ready to be filled in.
      if (opened !== `${venueId}/${roomId}`) return;
      unreachable(readFailure(error).message);
      return;
    }
    if (opened !== `${venueId}/${roomId}`) return;
    if (!listing) {
      if (!room) unreachable();
      return;
    }
    // A room the village has no scenery for is still a room: everything the
    // sheet prints about it is on the listing, so the sheet is built from that.
    if (!room) {
      venue = venueFrom(listing);
      room = roomFrom(listing);
      mount(venueId, roomId);
    }
    draft.remoteRoomId = listing.roomId ?? draft.remoteRoomId ?? null;
    bookingMode = listing.bookingMode ?? null;
    roomHours = listing.openHours ?? null;
    week.setHours(roomHours);
    cachedDraft = null;
    week.render();
    renderFoot();
    if (draft.remoteRoomId) loadAvailability(week.weekStart());
  }

  /** The listing's own words, in the shapes this sheet has always printed. */
  const roomFrom = (listing) => ({
    id: listing.roomSlug,
    name: listing.name,
    description: listing.description,
    capacity: listing.capacity,
    pricePerHour: listing.pricePerHour,
    houseRules: listing.houseRules ?? '',
    activities: listing.activities ?? [],
    amenities: listing.amenities ?? [],
    accessibility: listing.accessibility ?? [],
    status: 'published',
  });

  const venueFrom = (listing) => ({
    id: listing.venueSlug,
    name: listing.venueName,
    shortName: listing.venueShortName ?? listing.venueName,
    suburb: listing.suburb,
  });

  function unreachable(said = 'Steeple could not open this space just now. Try again in a moment.') {
    replaceChildren(head, []);
    replaceChildren(columns, [el('p', { class: 'prose', text: said })]);
    replaceChildren(foot, []);
  }

  /** One week of real availability, and the five after it, asked once each. */
  async function loadAvailability(from) {
    const roomId = draft?.remoteRoomId;
    if (!roomId || asked.has(from)) return;
    asked.add(from);
    const to = addDays(from, WEEKS_AHEAD * 7 - 1);
    const answer = await getRoomAvailability(roomId, { from: laterOf(from), to });
    if (!answer || !draft || draft.remoteRoomId !== roomId) return;
    for (const day of answer.days) if (day.isBlackout) closedDates.push({ date: day.date, reason: null });
    week.setAvailability(answer.days);
    week.render();
    renderSummary();
  }

  // The feed refuses a `from` in the past — a week already begun is asked for
  // from today, which is all of it that can still be booked anyway.
  const laterOf = (from) => (from < todayIso() ? todayIso() : from);

  function renderHead() {
    const { amount, unit, free } = priceParts(room);
    replaceChildren(head, [
      el('div', { class: 'letter__heading' }, [
        el('p', { class: 'eyebrow', text: 'Booking request' }),
        el('h1', { class: 'letter__title', text: room.name }),
        el('p', { class: 'letter__from', text: `${venue.name} · ${venue.suburb}` }),
      ]),
      el('div', { class: 'letter__stamp' }, [
        el('p', { class: 'letter__date', text: formatDate(todayIso()) }),
        el('p', { class: `price price--sm${free ? ' price--free' : ''}` }, [
          el('span', { class: 'price__amount', text: amount }),
          unit && el('span', { class: 'price__unit', text: unit }),
        ]),
      ]),
    ]);
  }

  function renderNoteColumn() {
    const accepted = room.activities;
    replaceChildren(
      activities,
      accepted.map((activity) => {
        const id = `activity-${activity.toLowerCase()}`;
        const input = el('input', {
          type: 'radio',
          name: 'letter-activity',
          id,
          class: 'choice__input',
          value: activity,
          checked: draft.activityType === activity,
        });
        input.addEventListener('change', () => {
          draft.activityType = activity;
          touched.add('activityType');
          renderFoot();
          announce?.(`${activity} chosen.`);
        });
        return el('label', { class: 'choice', for: id }, [input, el('span', { text: activity })]);
      })
    );

    replaceChildren(noteCol, [
      el('div', { class: 'field' }, [
        el('label', { class: 'field__label', for: 'letter-intent', text: 'Your plans' }),
        intent,
        el('div', { class: 'field__underline' }, [intentNote, count]),
      ]),
      el('fieldset', { class: 'field field--choices' }, [
        el('legend', { class: 'field__label', text: 'The kind of activity' }),
        activities,
        activityNote,
      ]),
      el('div', { class: 'field field--inline' }, [
        el('label', { class: 'field__label', for: 'letter-size', text: 'Group size' }),
        stepper,
        sizeNote,
      ]),
      el('div', { class: 'field' }, [
        el('label', {
          class: 'field__label',
          for: 'letter-organization',
          text: 'Your group or organisation',
        }),
        organization,
        el('p', {
          class: 'field__note',
          text: 'Optional — shown to the host as who is asking.',
        }),
      ]),
      // Not decoration: the terms the request is made under, printed where a
      // form would print them — small, complete, before you send.
      el('aside', { class: 'letter__rules' }, [
        el('h2', { class: 'eyebrow', text: 'The house rules here' }),
        el('p', { class: 'prose prose--sm', text: room.houseRules }),
      ]),
    ]);
    renderNote();
  }

  function renderWhen() {
    const weekly = draft.frequency === 'weekly';
    replaceChildren(
      frequency,
      [
        ['oneOff', 'One time'],
        ['weekly', 'Every week'],
      ].map(([value, label]) => {
        const id = `letter-freq-${value}`;
        const input = el('input', {
          type: 'radio',
          name: 'letter-frequency',
          id,
          class: 'choice__input',
          value,
          checked: draft.frequency === value,
        });
        input.addEventListener('change', () => setFrequency(value));
        return el('label', { class: 'choice choice--segment', for: id }, [
          input,
          el('span', { text: label }),
        ]);
      })
    );

    if (weekly) {
      const end = el('input', {
        class: 'field__input field__input--date',
        id: 'letter-until',
        type: 'date',
        min: draft.startDate ? addDays(draft.startDate, 7) : addDays(todayIso(), 7),
        max: draft.startDate ? addDays(draft.startDate, 366) : addDays(todayIso(), 366),
        value: draft.endDate ?? '',
      });
      end.addEventListener('change', () => {
        draft.endDate = end.value || null;
        touched.add('endDate');
        week.setSchedule(draft);
        week.render();
        renderFoot();
        renderSummary();
      });
      replaceChildren(until, [
        el('label', { class: 'field__label', for: 'letter-until', text: 'Weekly until' }),
        end,
      ]);
      until.hidden = false;
    } else {
      until.hidden = true;
      replaceChildren(until, []);
    }

    week.setSchedule(draft);
    week.render();
    renderSummary();
  }

  function setFrequency(value) {
    if (draft.frequency === value) return;
    draft.frequency = value;
    touched.add('schedule');
    if (value === 'weekly') {
      draft.endDate = draft.endDate ?? (draft.startDate ? addDays(draft.startDate, 56) : null);
      if (!draft.daysOfWeekMask && draft.startDate) {
        draft.daysOfWeekMask = 1 << new Date(...dateArgs(draft.startDate)).getDay();
      }
    } else {
      draft.endDate = null;
    }
    renderWhen();
    renderFoot();
    announce?.(value === 'weekly' ? 'Repeating every week.' : 'A single visit.');
  }

  const dateArgs = (iso) => {
    const [y, m, d] = iso.split('-').map(Number);
    return [y, m - 1, d];
  };

  function renderSummary() {
    if (!draft.startTime) {
      summary.textContent = '';
      summary.hidden = true;
      week.setNote('');
      scheduleNote.textContent = '';
      return;
    }
    summary.hidden = false;
    const blackouts = closedDates;
    const dates = occurrenceCount(draft, blackouts);
    const lines = [scheduleSentence(draft)];
    if (draft.frequency === 'weekly' && draft.endDate && dates) {
      lines.push(`${plural(dates, 'date', 'dates')} in all.`);
    }
    replaceChildren(summary, [
      el('span', { class: 'letter__summaryline', text: lines[0] }),
      lines[1] && el('span', { class: 'letter__summarycount', text: lines[1] }),
    ]);

    const notes = [];
    const skipped = blackouts.filter((b) => {
      if (draft.frequency !== 'weekly') return b.date === draft.startDate;
      return (
        draft.endDate &&
        b.date >= draft.startDate &&
        b.date <= draft.endDate &&
        draft.daysOfWeekMask & (1 << new Date(...dateArgs(b.date)).getDay())
      );
    });
    for (const b of skipped) {
      notes.push(
        b.reason
          ? `${formatDate(b.date)} is set aside for the ${b.reason.toLowerCase()}, so that week is skipped.`
          : `${formatDate(b.date)} is a closed day here, so that week is skipped.`
      );
    }
    // Dates another group already holds are not listed twice: the week card
    // draws them as held and will not let one be painted.
    scheduleNote.textContent = notes.join(' ');
  }

  // What the service said when it refused the last send, if it did. It is the
  // one message here that is not the store's own, so it is held separately and
  // cleared the moment the guest tries again.
  let refusal = '';

  function renderFoot(problem) {
    if (problem !== undefined) refusal = problem ?? '';
    const result = validate();
    // A request that is not ready yet cannot be sent, and the button says so by
    // being still — with the one thing it is waiting for printed beside it.
    if (!sending) {
      send.textContent = sendLabel();
      send.disabled = !result.ok;
    }
    unready.textContent = result.ok ? '' : (Object.values(result.errors)[0] ?? '');
    unready.hidden = result.ok;
    intentNote.textContent = fieldError('intentText') ?? '';
    activityNote.textContent = fieldError('activityType') ?? '';
    sizeNote.classList.toggle('is-wrong', Boolean(fieldError('groupSize')));
    if (fieldError('groupSize')) sizeNote.textContent = fieldError('groupSize');
    else renderNote();

    const scheduleProblem =
      fieldError('schedule') ?? fieldError('startDate') ?? fieldError('startTime') ??
      fieldError('endTime') ?? fieldError('endDate') ?? fieldError('daysOfWeekMask');
    week.setNote(scheduleProblem ?? '');

    const outstanding = attempted
      ? Object.entries(result.errors)
          .filter(([field]) => !SHOWN_INLINE.has(field))
          .map(([, message]) => message)
      : [];
    replaceChildren(
      errors,
      [...(refusal ? [refusal] : []), ...outstanding].map((message) =>
        el('p', { class: 'letter__error', text: message })
      )
    );

    renderSummary();
  }

  const SHOWN_INLINE = new Set([
    'intentText', 'activityType', 'groupSize', 'schedule',
    'startDate', 'startTime', 'endTime', 'endDate', 'daysOfWeekMask',
  ]);

  function renderFootShell() {
    replaceChildren(foot, [
      // What is about to be asked for, stated once, immediately above the act
      // of asking for it — the only place a summary is worth the room.
      summary,
      errors,
      unready,
      send,
    ]);
  }

  // ── the commitment point ──────────────────────────────────────────────────

  function seal() {
    attempted = true;
    const result = validate();
    if (!result.ok) {
      renderFoot(null);
      const first = Object.keys(result.errors)[0];
      announce?.(`Not quite ready. ${Object.values(result.errors)[0]}`);
      focusField(first);
      return;
    }
    // Who is asking is settled last — but a guest already signed in has
    // settled it: the request just goes. The step opens only for the sign-in.
    if (isSignedIn()) dispatch();
    else openIdentity();
  }

  function focusField(field) {
    if (field === 'intentText') intent.focus();
    else if (field === 'groupSize') size.focus();
    else if (field === 'activityType') activities.querySelector('input')?.focus();
    else week.element.querySelector('[data-day][tabindex="0"]')?.focus();
  }

  function openIdentity() {
    // The provider has not been chosen yet at this gate, so the event carries
    // what brought somebody here instead (`analytics.md` — `sso_started`).
    track('sso_started', { surface: 'apply', trigger: 'send' });
    identity.reset();
    identity.element.hidden = false;
    sheet.classList.add('is-signing');
    columns.setAttribute('inert', '');
    identity.focus();
    announce?.('Confirm who you are before the request is sent.');
  }

  function closeIdentity() {
    identity.element.hidden = true;
    sheet.classList.remove('is-signing');
    columns.removeAttribute('inert');
    renderFoot();
    intent.focus();
  }

  function openCard() {
    track('card_step_opened', { reason: 'apply' });
    identity.element.hidden = true;
    card.reset();
    card.element.hidden = false;
    sheet.classList.add('is-signing');
    columns.setAttribute('inert', '');
    card.open();
    card.focus();
  }

  function closeCard() {
    card.element.hidden = true;
    sheet.classList.remove('is-signing');
    columns.removeAttribute('inert');
    renderFoot();
  }

  let sending = false;

  async function dispatch() {
    if (sending) return;
    sending = true;
    send.disabled = true;
    send.textContent = 'Sending';
    identity.element.setAttribute('inert', '');
    let result;
    try {
      // The identity step holds the Turnstile widget, so it holds the token the
      // submit needs; with no site key configured it answers null, which is
      // what this send has always carried.
      result = await sendRequest(draft, { turnstileToken: identity.turnstileToken?.() ?? null });
    } finally {
      sending = false;
      send.disabled = false;
      send.textContent = sendLabel();
      identity.element.removeAttribute('inert');
    }

    if (!result.ok) {
      attempted = true;
      // A spent check has to be asked again before the next press, or the retry
      // carries a token steeple has already refused.
      if (result.refused) identity.resetTurnstile?.();
      // A refusal from the service belongs beside the send, where the request
      // still is — not behind a card the guest has to dismiss first.
      // A sign-in that died between opening this step and pressing send: the
      // step is still the right place to stand, so it says so itself.
      if (result.signedOut) {
        // The send may have gone straight past the step (a signed-in guest),
        // so make sure the step is actually on screen to say so.
        identity.reset();
        identity.element.hidden = false;
        sheet.classList.add('is-signing');
        columns.setAttribute('inert', '');
        identity.say(result.problem);
        renderFoot(null);
        identity.focus();
        announce?.(result.problem);
        return;
      }
      // steeple wants a way to pay before it will take a request. That is a
      // step, not a refusal: it opens where the identity step stood, and the
      // send picks up again by itself when the card is saved.
      if (result.needsCard) {
        openCard();
        announce?.('A payment method is needed before this can be sent.');
        return;
      }
      closeIdentity();
      renderFoot(result.problem);
      announce?.(
        result.retake
          ? result.problem
          : `This request could not be sent. ${result.problem}`
      );
      // Nothing was filed anywhere. The written request is still here, exactly
      // as it was, and the week card is the way to another time.
      if (result.retake) week.element.querySelector('[data-day][tabindex="0"]')?.focus();
      return;
    }
    drafts.delete(`${draft.venueId}/${draft.roomId}`);
    identity.element.hidden = true;
    card.element.hidden = true;
    sheet.classList.remove('is-signing');
    columns.removeAttribute('inert');
    sheet.classList.add('is-away');
    // Instant venues answer the submit with the booking itself, so the sentence
    // is what happened, not what is about to. An instant venue can still answer
    // "pending": a guest holding several upcoming bookings with no card on file
    // is asked for the host's approval this time (the spam cap, booking-modes.md)
    // — the sheet says why rather than quietly downgrading the promise.
    const held = bookingMode === 'instant' && !result.instant;
    announce?.(
      result.instant
        ? `Booked. ${room.name} at ${venue.shortName} is yours — it is in your inbox.`
        : held
          ? `You have a few bookings coming up already, so this one has gone to ${venue.shortName} to approve. It is waiting in your inbox.`
          : `Your request is on its way to ${venue.shortName}. It is waiting in your inbox.`
    );
    const settle = () => {
      sheet.classList.remove('is-away');
      onSent?.(result.application, { instant: result.instant, held });
    };
    setTimeout(settle, document.documentElement.classList.contains('reduced-motion') ? 60 : 900);
  }

  // ── opening ───────────────────────────────────────────────────────────────

  /**
   * Open the sheet on a space.
   *
   * The village's own scenery is a shortcut, not the source: a room it has never
   * heard of — every room a host lists — is opened from the catalog a moment
   * later, and the sheet says it is reading until then. Only ids it cannot use
   * at all are refused (v2_migration D4).
   */
  function open(venueId, roomId) {
    if (!venueId || !roomId) return false;
    // The top of the apply funnel, and a moment no server ever sees: a sheet
    // opened and left is still a person who wanted this room.
    track('application_started', { roomId: `${venueId}/${roomId}` });
    opened = `${venueId}/${roomId}`;
    venue = heldVenue(venueId) ?? null;
    room = effectiveRoom(venueId, roomId) ?? null;

    roomHours = null;
    closedDates = [];
    bookingMode = null;
    asked = new Set();
    identity.reset();
    identity.element.hidden = true;
    card.element.hidden = true;
    sheet.classList.remove('is-signing', 'is-away');
    columns.removeAttribute('inert');

    if (room && venue) mount(venueId, roomId);
    else waiting();
    loadRoom(venueId, roomId);
    return true;
  }

  /** Which space the sheet is open on, so a late answer for another is dropped. */
  let opened = null;

  function waiting() {
    replaceChildren(head, []);
    replaceChildren(columns, [el('p', { class: 'prose', text: 'Opening this space…' })]);
    replaceChildren(foot, []);
  }

  /** Build the sheet, once there is a room to build it about. */
  function mount(venueId, roomId) {
    const key = `${venueId}/${roomId}`;
    draft = drafts.get(key) ?? blankDraft(venueId, roomId, room);
    drafts.set(key, draft);
    attempted = false;
    touched.clear();
    cachedDraft = null;
    replaceChildren(columns, [noteCol, whenCol]);

    intent.value = draft.intentText;
    size.value = draft.groupSize;
    organization.value = draft.organizationName ?? '';
    syncStepper();
    week.setRoom(venueId, roomId);
    week.setSchedule(draft);

    renderHead();
    renderNoteColumn();
    replaceChildren(whenCol, [
      el('h2', { class: 'eyebrow', text: 'When you would come' }),
      el('div', { class: 'field field--freq' }, [frequency, until]),
      week.element,
      scheduleNote,
    ]);
    renderWhen();
    renderFootShell();
    renderCount();
    renderFoot(null);
    sheet.scrollTop = 0;
  }

  function spoken() {
    if (!venue || !room) return 'Opening this space.';
    return [
      `Your request to ${venue.name} about ${room.name}, ${venue.suburb}.`,
      `Seats ${room.capacity}. Welcomes ${room.activities.join(', ')}.`,
      'Write your plans, choose one activity and a group size, then paint your hours on the week card.',
      draft.startTime ? `Chosen so far: ${scheduleSentence(draft)}.` : 'No hours chosen yet.',
    ].join(' ');
  }

  return {
    element,
    open,
    spoken,
    focus: () => sheet.focus?.(),
    refresh: () => {
      if (!venue || !room) return;
      week.render();
      renderFoot();
    },
  };
}
