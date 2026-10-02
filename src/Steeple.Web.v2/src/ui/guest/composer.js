import { track } from '../../data/analytics.js';
import { checkRoomAvailability } from '../../data/api.js';
import { getRoomAvailability, getListing, readFailure } from '../../data/catalog.js';
import { toWireSchedule } from '../../data/correspondence.js';
import { isEnabled } from '../../data/flags.js';
import { FEATURE_FLAG_KEYS } from '../../data/wireTokens.js';
import { addDays, todayIso, validateApplication } from '../../data/store.js';
import { weekdayOf } from '../../data/store/schedule.js';
import { el, replaceChildren } from '../dom.js';
import { formatDate, formatTime, scheduleSentence } from './copy.js';
import { estimateSchedule, scheduleErrors, timeChoices, venueToday } from './composerSchedule.js';
import { createCardStep } from './payment.js';
import { isSignedIn } from '../../data/session.js';
import { sendRequest } from './send.js';
import { createIdentityStep } from './sso.js';
import { createWeekCard } from './weekCard.js';

const drafts = new Map();
const plural = (count, noun) => `${count} ${noun}${count === 1 ? '' : 's'}`;
const scheduleFields = ['schedule', 'frequency', 'startDate', 'endDate', 'startTime', 'endTime', 'daysOfWeekMask'];
const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const blankDraft = (venueId, roomId, room) => ({
  venueId, roomId, activityType: room.activities.length === 1 ? room.activities[0] : null,
  groupSize: '', organizationName: '', frequency: 'oneOff', startDate: null, endDate: null,
  daysOfWeekMask: 0, startTime: null, endTime: null, intentText: '',
});

export function createComposer({ announce, onSent, onLeave }) {
  let venue = null;
  let room = null;
  let draft = null;
  let roomHours = null;
  let bookingMode = null;
  let timezone = null;
  let timezoneFailed = false;
  let paymentsEnabled = null;
  let opened = null;
  let generation = 0;
  let checkVersion = 0;
  let checkTimer = null;
  let availability = { state: 'empty', result: null };
  let sending = false;
  let attempted = false;
  let refusal = '';
  const touched = new Set();
  const asked = new Map();

  const identity = createIdentityStep({ announce, onVerify: () => dispatch(), onCancel: () => closeIdentity() });
  identity.element.hidden = true;
  const card = createCardStep({
    announce,
    words: {
      eyebrow: 'Test payments',
      title: 'Add a test payment method',
      blurb: 'This test payment step records a card brand and four digits. No real money is charged. Use sample details to continue.',
    },
    onSaved: () => { closeCard(); dispatch(); },
    onCancel: () => closeCard(),
  });
  card.element.hidden = true;
  const week = createWeekCard({
    announce,
    onChange: (schedule) => { Object.assign(draft, schedule); touched.add('schedule'); renderSchedule(); scheduleChanged(); },
    onWeek: (start) => loadWeek(start),
  });

  const back = el('button', { type: 'button', class: 'letter__back', onclick: () => leaveSheet() }, '← Back to the space');
  const head = el('header', { class: 'letter__head' });
  const whenCol = el('section', { class: 'composer__section', 'aria-labelledby': 'composer-when' });
  const noteCol = el('section', { class: 'composer__section', 'aria-labelledby': 'composer-plans' });
  const flow = el('div', { class: 'composer__flow' }, [whenCol, noteCol]);
  const foot = el('aside', { class: 'letter__foot', 'aria-labelledby': 'composer-review' });
  const columns = el('div', { class: 'letter__columns' }, [flow, foot]);
  const sheet = el('form', { class: 'letter__sheet composer', novalidate: true, tabindex: '-1', 'aria-label': 'Booking details' }, [
    el('div', { class: 'letter__nav' }, [back]), head, columns, identity.element, card.element,
  ]);
  sheet.addEventListener('submit', (event) => {
    if (event.target !== sheet) return;
    event.preventDefault();
    seal();
  });
  const backdrop = el('div', { class: 'letter__backdrop', 'aria-hidden': 'true' });
  const element = el('div', { class: 'guest__surface guest__surface--letter' }, [backdrop, sheet]);
  const isOpen = () => element.classList.contains('is-open');
  function leaveSheet() {
    if (!card.element.hidden) return closeCard();
    if (!identity.element.hidden) return closeIdentity();
    onLeave?.();
  }
  let pressedOutside = false;
  element.addEventListener('pointerdown', (event) => { pressedOutside = event.target === backdrop; });
  backdrop.addEventListener('click', () => { if (pressedOutside) leaveSheet(); pressedOutside = false; });
  window.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !isOpen() || event.metaKey || event.ctrlKey || event.altKey) return;
    event.preventDefault(); event.stopPropagation(); leaveSheet();
  }, { capture: true });

  const field = (label, input, note = null) => el('div', { class: 'field' }, [
    el('label', { class: 'field__label', for: input.id, text: label }), input, note,
  ]);
  const input = (id, type, props = {}) => el('input', { id: `letter-${id}`, type, class: 'field__input', ...props });
  const startDate = input('date', 'date', { required: true, 'aria-describedby': 'composer-schedule-error composer-timezone' });
  const endDate = input('until', 'date', { required: true, 'aria-describedby': 'composer-schedule-error' });
  const startTime = el('select', { id: 'letter-start', class: 'field__input', required: true, 'aria-describedby': 'composer-schedule-error composer-timezone' });
  const endTime = el('select', { id: 'letter-end', class: 'field__input', required: true, 'aria-describedby': 'composer-schedule-error composer-timezone' });
  const dateLabel = el('label', { class: 'field__label', for: startDate.id });
  const lastDateField = field('Last date', endDate);
  const dateRow = el('div', { class: 'composer__dates' }, [el('div', { class: 'field' }, [dateLabel, startDate]), lastDateField]);
  const frequency = el('fieldset', { class: 'composer__frequency' }, [el('legend', { class: 'visually-hidden', text: 'How often' })]);
  for (const [value, label] of [['oneOff', 'One time'], ['weekly', 'Every week']]) {
    const radio = input(`freq-${value}`, 'radio', { name: 'letter-frequency', value, class: 'choice__input' });
    radio.addEventListener('change', () => {
      if (draft.frequency === value) return;
      draft.frequency = value;
      draft.endDate = value === 'weekly' ? (draft.endDate ?? (draft.startDate ? addDays(draft.startDate, 56) : null)) : null;
      if (value === 'weekly' && !draft.daysOfWeekMask && draft.startDate) draft.daysOfWeekMask = 1 << weekdayOf(draft.startDate);
      touched.add('frequency'); renderSchedule(); scheduleChanged();
    });
    frequency.append(el('label', { class: 'choice choice--segment', for: radio.id }, [radio, el('span', { text: label })]));
  }
  const weekdays = el('fieldset', { class: 'composer__weekdays' }, [el('legend', { class: 'field__label', text: 'Days of the week' })]);
  const dayChoices = el('div', { class: 'composer__days' });
  for (let day = 0; day < 7; day += 1) {
    const checkbox = input(`day-${day}`, 'checkbox', { class: 'choice__input', 'aria-label': days[day], 'aria-describedby': 'composer-schedule-error' });
    checkbox.addEventListener('change', () => {
      draft.daysOfWeekMask ^= 1 << day;
      touched.add('daysOfWeekMask'); renderSchedule(); scheduleChanged();
    });
    dayChoices.append(el('label', { class: 'choice composer__day', for: checkbox.id }, [checkbox, el('span', { text: days[day].slice(0, 3) })]));
  }
  weekdays.append(dayChoices);
  for (const [control, key] of [[startDate, 'startDate'], [endDate, 'endDate'], [startTime, 'startTime'], [endTime, 'endTime']]) {
    control.addEventListener('change', () => {
      draft[key] = control.value || null;
      if (key === 'startDate' && control.validity.valid && draft.frequency === 'weekly' && !draft.daysOfWeekMask && draft.startDate) draft.daysOfWeekMask = 1 << weekdayOf(draft.startDate);
      touched.add(key);
      if (control.type !== 'date') renderSchedule();
      scheduleChanged();
    });
  }
  for (const control of [startDate, endDate]) control.addEventListener('blur', () => requestAnimationFrame(renderSchedule));
  const timeNote = el('p', { id: 'composer-timezone', class: 'composer__hint' });
  const scheduleNote = el('p', { id: 'composer-schedule-error', class: 'composer__error', role: 'status' });
  const availabilityBox = el('div', { class: 'composer__availability', role: 'status', tabindex: '-1' });
  const calendar = el('details', { class: 'composer__calendar' }, [
    el('summary', { text: 'View the weekly calendar' }),
    el('div', { class: 'composer__calendar-scroll', role: 'region', tabindex: '0', 'aria-label': 'Weekly availability calendar' }, [week.element]),
  ]);
  calendar.addEventListener('toggle', () => { if (calendar.open) loadWeek(week.weekStart()); });
  replaceChildren(whenCol, [
    el('h2', { id: 'composer-when', text: 'When would you like to come?' }), frequency, weekdays, dateRow,
    el('div', { class: 'composer__times' }, [field('Start time', startTime), field('End time', endTime)]),
    timeNote, scheduleNote, availabilityBox, calendar,
  ]);

  const intent = el('textarea', { id: 'letter-intent', class: 'field__input field__input--note', rows: '6', maxlength: '2200', required: true,
    spellcheck: 'true', 'aria-describedby': 'composer-intent-note composer-intent-count',
    placeholder: 'Who your group is, what you would do in the space, and anything the host would want to know.',
  });
  const intentNote = el('p', { id: 'composer-intent-note', class: 'field__note' });
  const count = el('p', { id: 'composer-intent-count', class: 'field__count' });
  const activity = el('select', { id: 'letter-activity', class: 'field__input', required: true, 'aria-describedby': 'composer-activity-note' });
  const activityNote = el('p', { id: 'composer-activity-note', class: 'field__note' });
  const size = input('size', 'number', { min: '1', step: '1', inputmode: 'numeric', required: true, 'aria-describedby': 'composer-size-note' });
  const sizeNote = el('p', { id: 'composer-size-note', class: 'field__note' });
  const organization = input('organization', 'text', { maxlength: '200', autocomplete: 'organization', placeholder: 'Optional' });
  for (const [control, key] of [[intent, 'intentText'], [size, 'groupSize'], [organization, 'organizationName'], [activity, 'activityType']]) {
    control.addEventListener('input', () => { draft[key] = control.value; touched.add(key); renderFoot(); });
  }
  replaceChildren(noteCol, [
    el('h2', { id: 'composer-plans', text: 'Tell the host about your event' }),
    el('div', { class: 'composer__event-facts' }, [field('Activity', activity, activityNote), field('People', size, sizeNote)]),
    field('Group or organisation', organization),
    field('Your plans', intent, el('div', { class: 'field__underline' }, [intentNote, count])),
  ]);

  const summary = el('div', { class: 'composer__estimate' });
  const commitment = el('div', { class: 'composer__note' });
  const payment = el('div', { class: 'composer__note' });
  const rules = el('section', { class: 'composer__rules' });
  const errors = el('div', { class: 'letter__errors', role: 'alert' });
  const unready = el('p', { class: 'letter__unready', id: 'composer-unready' });
  const send = el('button', { type: 'submit', class: 'pill pill--primary pill--wide', 'aria-describedby': 'composer-unready' });
  const reviewTitle = el('h2', { id: 'composer-review', text: 'Your request' });
  replaceChildren(foot, [reviewTitle, summary, commitment, payment, rules, errors, unready, send]);
  const sendLabel = () => isSignedIn() ? (bookingMode === 'instant' ? 'Book this space' : 'Send request') :
    (bookingMode === 'instant' ? 'Sign in to book' : 'Sign in to send request');
  const money = (value) => new Intl.NumberFormat('en-US', { style: 'currency', currency: room.currency ?? 'USD', currencyDisplay: 'code', maximumFractionDigits: 2 }).format(value);
  const scheduleProblems = () => scheduleErrors(draft, { today: venueToday(timezone), windows: roomHours });
  function validate() {
    const errors = { ...validateApplication(draft, { room }).errors };
    for (const key of scheduleFields) delete errors[key];
    if (errors.intentText && !draft.intentText.trim()) errors.intentText = 'Tell the host what your group would like to do.';
    Object.assign(errors, scheduleProblems());
    return { ok: Object.keys(errors).length === 0, errors };
  }
  const estimate = () => estimateSchedule(draft, room.pricePerHour);

  function renderHead() {
    const priced = estimate();
    replaceChildren(head, [
      el('div', { class: 'letter__heading' }, [
        el('p', { class: 'eyebrow', text: bookingMode === 'instant' ? 'Book a space' : 'Request a space' }),
        el('h1', { class: 'letter__title', text: room.name }),
        el('p', { class: 'letter__from', text: `${venue.name} · ${venue.suburb} · Seats ${room.capacity}` }),
      ]),
      el('p', { class: 'composer__headline-price' }, [
        el('strong', { text: money(priced?.total ?? room.pricePerHour) }),
        el('span', { text: priced ? ` estimate · ${plural(priced.sessions, 'session')}` : ' / hour' }),
      ]),
    ]);
  }

  function renderSchedule() {
    const weekly = draft.frequency === 'weekly';
    for (const radio of frequency.querySelectorAll('input')) radio.checked = radio.value === draft.frequency;
    weekdays.hidden = !weekly;
    for (const [day, checkbox] of [...dayChoices.querySelectorAll('input')].entries()) checkbox.checked = Boolean(draft.daysOfWeekMask & (1 << day));
    dateLabel.textContent = weekly ? 'First date' : 'Date';
    lastDateField.hidden = !weekly;
    dateRow.classList.toggle('is-weekly', weekly);
    if (document.activeElement !== startDate) {
      startDate.value = draft.startDate ?? '';
      startDate.min = venueToday(timezone) ?? '';
    }
    if (document.activeElement !== endDate) {
      endDate.value = draft.endDate ?? '';
      endDate.min = draft.startDate ?? startDate.min;
      endDate.max = draft.startDate ? addDays(draft.startDate, 366) : '';
    }
    for (const [control, key, isEnd] of [[startTime, 'startTime', false], [endTime, 'endTime', true]]) {
      if (document.activeElement === control) continue;
      replaceChildren(control, [el('option', { value: '', text: 'Choose time' }), ...timeChoices(draft, roomHours, isEnd).map(({ time, allowed }) =>
        el('option', { value: time, disabled: !allowed, text: formatTime(time) }))]);
      control.value = draft[key] ?? '';
    }
    timeNote.textContent = timezone ? `Times are local to the venue · ${timezone.replaceAll('_', ' ')}` : timezoneFailed
      ? 'Times are local to the venue. The timezone could not be loaded.'
      : 'Times are local to the venue. The timezone is being checked.';
    week.setSchedule(draft, { resetDates: true }); week.render();
  }

  function renderSummary() {
    const priced = estimate();
    const row = (label, value, className = '') => el('div', { class: `composer__receipt-row ${className}` }, [el('span', { text: label }), el('strong', { text: value })]);
    replaceChildren(summary, priced ? [
      el('p', { class: 'composer__schedule', text: scheduleSentence(draft) }),
      row(`${plural(priced.hours, 'hour')} × ${money(room.pricePerHour)}`, `${money(priced.perSession)} / session`),
      row('Sessions', String(priced.sessions)),
      row('Estimated total', money(priced.total), 'composer__total'),
      el('p', { class: 'composer__hint', text: 'Based on the current hourly rate and all selected dates. The final price is set when the booking is confirmed.' }),
    ] : [
      el('p', { class: 'composer__schedule', text: `${money(room.pricePerHour)} / hour` }),
      el('p', { class: 'composer__hint', text: 'Choose valid dates and times to see the estimated cost.' }),
    ]);
    reviewTitle.textContent = bookingMode === 'instant' ? 'Your booking' : 'Your request';
    replaceChildren(commitment, [
      el('h3', { text: bookingMode === 'instant' ? 'This space books instantly' : 'The host approves your request' }),
      el('p', { text: bookingMode === 'instant'
        ? 'Submitting can confirm your booking immediately. If you already have several upcoming bookings, the host may need to approve this one.'
        : 'Nothing is booked until the host accepts your request.' }),
    ]);
    replaceChildren(payment, [
      el('h3', { text: paymentsEnabled === true ? 'Test payments' : paymentsEnabled === false ? 'Payment arranged with the host' : 'Checking payment options' }),
      el('p', { text: paymentsEnabled === true
        ? 'A test payment method is required before sending. No real money is charged.'
        : paymentsEnabled === false ? 'Online booking payments are not available on Steeple. Arrange payment directly with the host.'
          : 'Payment details will appear here before you send.' }),
    ]);
    rules.hidden = !room.houseRules?.trim();
    replaceChildren(rules, rules.hidden ? [] : [el('h3', { text: 'House rules' }), el('p', { text: room.houseRules })]);
    renderHead();
  }

  function renderAvailability() {
    const { state, result } = availability;
    availabilityBox.hidden = state === 'empty';
    availabilityBox.classList.toggle('is-warning', state === 'failed' || state === 'conflict');
    if (state === 'empty') return;
    let children;
    if (state === 'checking') children = [el('p', { text: 'Checking all selected dates…' })];
    else if (state === 'ready') children = [el('p', { text: `${plural(result.totalOccurrences, 'session')} ${result.totalOccurrences === 1 ? 'looks' : 'look'} available right now. Availability is checked again when you submit.` })];
    else if (state === 'conflict') children = [
      el('strong', { text: `${result.conflicts.length} of ${result.totalOccurrences} dates are unavailable` }),
      el('p', { text: 'Change the dates, weekdays or times. Closed dates are included in your request; they are not skipped.' }),
      el('ul', { tabindex: '0', 'aria-label': 'Unavailable dates' }, result.conflicts.map(({ date, reason }) => el('li', { text: `${formatDate(date)} · ${({ blackout: 'closed that day', booked: 'already booked', outsideOpenHours: 'outside opening hours' })[reason] ?? 'unavailable'}` }))),
    ];
    else children = [
      el('strong', { text: 'Availability could not be checked' }),
      el('p', { text: 'Try again before sending. Your dates and plans are still here.' }),
      el('button', { type: 'button', class: 'composer__retry', text: 'Try again', onclick: () => scheduleChanged(0) }),
    ];
    replaceChildren(availabilityBox, children);
  }

  function renderFoot(problem) {
    if (!draft || !room) return;
    if (problem !== undefined) refusal = problem ?? '';
    const result = validate();
    const visibleError = (key) => (attempted || touched.has(key) || (scheduleFields.includes(key) && touched.has('schedule'))) ? result.errors[key] : null;
    const mark = (control, key, note) => {
      const message = visibleError(key);
      control.setAttribute('aria-invalid', String(Boolean(message)));
      note.textContent = message ? `⚠ ${message}` : '';
      note.classList.toggle('is-wrong', Boolean(message));
    };
    mark(intent, 'intentText', intentNote); mark(activity, 'activityType', activityNote); mark(size, 'groupSize', sizeNote);
    if (!sizeNote.textContent) sizeNote.textContent = `Up to ${room.capacity} people`;
    const scheduleError = scheduleFields.map(visibleError).find(Boolean);
    scheduleNote.textContent = scheduleError ? `⚠ ${scheduleError}` : '';
    scheduleNote.hidden = !scheduleError;
    for (const [control, key] of [[startDate, 'startDate'], [endDate, 'endDate'], [startTime, 'startTime'], [endTime, 'endTime']]) control.setAttribute('aria-invalid', String(Boolean(visibleError(key) || visibleError('schedule'))));
    count.textContent = intent.value.length >= 1600 ? `${Math.max(2000 - intent.value.length, 0)} characters left` : '';
    count.classList.toggle('is-over', intent.value.length > 2000);
    const firstScheduleError = Object.values(scheduleProblems())[0];
    unready.textContent = firstScheduleError ?? Object.values(result.errors)[0] ??
      (availability.state !== 'ready' ? 'Check availability before sending.' : paymentsEnabled === null ? 'Checking payment options.' : '');
    unready.hidden = !unready.textContent;
    send.disabled = sending;
    if (!sending) send.textContent = sendLabel();
    replaceChildren(errors, refusal ? [el('p', { class: 'letter__error', text: refusal })] : []);
    renderSummary(); renderAvailability();
  }

  function scheduleChanged(delay = 500) {
    clearTimeout(checkTimer);
    const version = ++checkVersion;
    refusal = '';
    availability = { state: Object.keys(scheduleProblems()).length ? 'empty' : 'checking', result: null };
    renderFoot();
    if (availability.state === 'empty') return;
    const current = generation;
    const schedule = toWireSchedule(draft);
    checkTimer = setTimeout(async () => {
      try {
        if (!timezone) await loadWeek(addDays(todayIso(), 1));
        if (current !== generation || version !== checkVersion) return;
        if (!timezone) throw new Error('Venue timezone unavailable');
        const result = await checkRoomAvailability(draft.remoteRoomId, schedule);
        if (current !== generation || version !== checkVersion) return;
        if (!result || !Number.isInteger(result.totalOccurrences) || result.totalOccurrences !== estimate()?.sessions || !Array.isArray(result.conflicts)) throw new Error('Incomplete availability answer');
        availability = { state: result.available && !result.conflicts.length ? 'ready' : 'conflict', result };
      } catch {
        if (current !== generation || version !== checkVersion) return;
        availability = { state: 'failed', result: null };
      }
      renderFoot();
    }, delay);
  }

  async function loadWeek(from) {
    if (!draft?.remoteRoomId) return;
    if (asked.has(from)) return asked.get(from);
    const current = generation;
    const today = venueToday(timezone) ?? addDays(todayIso(), 1);
    const start = from < today ? today : from;
    const work = (async () => {
      const answer = await getRoomAvailability(draft.remoteRoomId, { from: start, to: addDays(start, 41) });
      if (current !== generation) return;
      if (!answer || !venueToday(answer.timezone)) {
        asked.delete(from);
        timezoneFailed = !timezone;
        renderSchedule(); renderFoot();
        return;
      }
      timezone = answer.timezone;
      timezoneFailed = false;
      week.setToday(venueToday(timezone));
      week.setAvailability(answer.days); renderSchedule(); renderFoot();
    })();
    asked.set(from, work);
    return work;
  }

  function focusField(key) {
    const fields = { intentText: intent, activityType: activity, groupSize: size, startDate, endDate, startTime, endTime,
      daysOfWeekMask: dayChoices.querySelector('input'), schedule: startTime };
    const target = fields[key] ?? startDate;
    target?.focus(); target?.scrollIntoView({ block: 'center' });
  }
  function seal() {
    if (sending || !draft || !room) return;
    attempted = true;
    const result = validate();
    if (!result.ok) {
      renderFoot(null);
      const key = Object.keys(scheduleProblems())[0] ?? Object.keys(result.errors)[0];
      focusField(key); announce?.(result.errors[key]); return;
    }
    if (availability.state !== 'ready' || paymentsEnabled === null) {
      renderFoot(); availabilityBox.focus(); availabilityBox.scrollIntoView({ block: 'center' }); return;
    }
    if (isSignedIn()) dispatch(); else openIdentity();
  }
  function openIdentity() {
    track('sso_started', { surface: 'apply', trigger: 'send' });
    identity.reset(); identity.element.hidden = false; sheet.classList.add('is-signing');
    columns.setAttribute('inert', ''); identity.focus(); identity.element.scrollIntoView({ block: 'center' });
    announce?.('Sign in to send these booking details.');
  }
  function closeIdentity() {
    identity.element.hidden = true; sheet.classList.remove('is-signing'); columns.removeAttribute('inert'); renderFoot(); send.focus();
  }
  function openCard() {
    track('card_step_opened', { reason: 'apply' });
    identity.element.hidden = true; card.reset(); card.element.hidden = false; sheet.classList.add('is-signing');
    columns.setAttribute('inert', ''); card.open(); card.focus(); card.element.scrollIntoView({ block: 'center' });
  }
  function closeCard() {
    card.element.hidden = true; sheet.classList.remove('is-signing'); columns.removeAttribute('inert'); renderFoot(); send.focus();
  }
  async function dispatch() {
    if (sending) return;
    sending = true;
    columns.setAttribute('inert', '');
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
      if (identity.element.hidden && card.element.hidden) columns.removeAttribute('inert');
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
      if (result.retake) focusField('startTime');
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

  async function loadRoom(venueId, roomId, current) {
    try {
      const listing = await getListing(venueId, roomId);
      if (current !== generation) return;
      if (!listing) throw new Error('Space unavailable');
      venue = { name: listing.venueName, shortName: listing.venueShortName ?? listing.venueName, suburb: listing.suburb };
      room = { ...listing, houseRules: listing.houseRules ?? '', activities: listing.activities ?? [] };
      bookingMode = listing.bookingMode ?? 'manual'; roomHours = listing.openHours ?? null;
      draft = drafts.get(opened) ?? blankDraft(venueId, roomId, room);
      draft.remoteRoomId = listing.roomId; drafts.set(opened, draft);
      intent.value = draft.intentText; size.value = draft.groupSize; size.max = String(room.capacity);
      organization.value = draft.organizationName ?? '';
      replaceChildren(activity, [el('option', { value: '', text: 'Choose activity' }), ...room.activities.map((name) => el('option', { value: name, text: name }))]);
      activity.value = draft.activityType ?? '';
      week.setRoom(venueId, roomId, { reset: true }); week.setHours(roomHours); calendar.open = false;
      replaceChildren(columns, [flow, foot]); renderSchedule(); scheduleChanged(); sheet.scrollTop = 0;
      loadWeek(addDays(todayIso(), 1));
    } catch (error) {
      if (current !== generation) return;
      replaceChildren(head, []);
      replaceChildren(columns, [el('p', { class: 'prose', text: readFailure(error).message }),
        el('button', { type: 'button', class: 'pill', text: 'Try again', onclick: () => open(venueId, roomId) })]);
    }
  }
  function open(venueId, roomId) {
    if (!venueId || !roomId) return false;
    track('application_started', { roomId: `${venueId}/${roomId}` });
    opened = `${venueId}/${roomId}`; const current = ++generation;
    clearTimeout(checkTimer); ++checkVersion;
    venue = null; room = null; draft = null; roomHours = null; timezone = null; timezoneFailed = false; bookingMode = null; paymentsEnabled = null;
    attempted = false; refusal = ''; touched.clear(); asked.clear();
    identity.reset(); identity.element.hidden = true; card.element.hidden = true;
    sheet.classList.remove('is-signing', 'is-away'); columns.removeAttribute('inert');
    replaceChildren(head, []); replaceChildren(columns, [el('p', { class: 'prose', text: 'Opening this space…' })]);
    isEnabled(FEATURE_FLAG_KEYS.paymentsEnabled).then((enabled) => { if (current === generation) { paymentsEnabled = enabled; renderFoot(); } });
    loadRoom(venueId, roomId, current); return true;
  }
  function spoken() {
    if (!venue || !room) return 'Opening this space.';
    return `${room.name} at ${venue.name}. Seats ${room.capacity}. Choose your dates and times, then tell the host about your event. Review the estimated cost before sending.`;
  }
  return { element, open, spoken, focus: () => sheet.focus(), refresh: () => { if (room) renderFoot(); } };
}
