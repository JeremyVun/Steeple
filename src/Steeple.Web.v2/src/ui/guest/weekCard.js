// THE WEEK CARD — the room's real week, printed like a timetable, where the
// guest paints the hours they want.
//
// The schema holds one time band and a set of weekdays (daysOfWeekMask), so the
// card works that way too:
//   · drag down a column       → set the band, and select that day alone
//   · click anywhere free      → an hour, starting at the square clicked. One
//     rule, on every day: a bare click never carries hours over from somewhere
//     else, and never moves a booking to a time nobody aimed at.
//   · click a day not selected → weekly only: add that weekday, band unchanged
//   · click inside the band    → weekly only: drop that weekday (never the last)
//   · keyboard: arrows move the cursor, Enter paints or toggles, Shift+↑/↓
//     trims or extends the end, PageUp/PageDown change week
//
// The week is steeple's, not this browser's. `setHours` carries the room's
// weekly open hours (RoomDetail.openHours, through catalog.js) and
// `setAvailability` carries what is actually free on each date —
// `GET /listings/{id}/availability`: open hours minus blackouts minus the
// bookings already confirmed. A slot the room keeps open but that is not free
// is one somebody else is holding; anything outside the open hours, in the
// past, or on a closed date is inert and reads as quietly unavailable.
//
// Paging to another week asks for that week (`onWeek`), because the feed is
// dated rather than weekly and a calendar must never guess at a date it has not
// been told about.

import { DAY_LABELS, addDays, daysToMask, maskToDays, todayIso, weekdayOf } from '../../data/store.js';
import { el, replaceChildren } from '../dom.js';
import { formatDate, formatTime, formatTimeRange } from './copy.js';

const SLOT_MINUTES = 30;

// Three reasons a card has no grid to draw, and they are not the same reason.
const LOADING = 'Reading this space’s open hours…';
const NO_HOURS = 'This space has no open hours published yet.';
const UNREACHABLE = 'Steeple could not be reached, so this week is not known yet.';

const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
const toTime = (m) =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const weekStartOf = (isoDate) => addDays(isoDate, -weekdayOf(isoDate));

export function createWeekCard({ announce, onChange, onWeek }) {
  let venueId = null;
  let roomId = null;
  let schedule = null;
  // The room's weekly open hours ({day, start, end}), and what steeple says is
  // still free on each dated day. Both arrive from the wire; neither is guessed.
  let openWindows = [];
  let byDate = new Map();
  let emptyLine = LOADING;
  let weekStart = weekStartOf(todayIso());
  let origin = 8 * 60;
  let slots = 28;
  let cursor = { day: weekdayOf(todayIso()), slot: 0 };
  // Which real date each selected weekday was painted on — how a weekly pattern
  // knows where it starts even when the guest browses to another week.
  let dayDates = new Map();

  const drag = { active: false, day: 0, from: 0, to: 0, moved: false };

  const range = el('p', { class: 'week__range' });
  const jump = el('button', {
    class: 'linkish week__jump',
    type: 'button',
    hidden: true,
    onclick: () => {
      if (schedule?.startDate) setWeek(weekStartOf(schedule.startDate), 'The week of your date.');
    },
  });
  const prev = el(
    'button',
    {
      class: 'week__step',
      type: 'button',
      'aria-label': 'Previous week',
      onclick: () => setWeek(addDays(weekStart, -7)),
    },
    '‹'
  );
  const next = el(
    'button',
    {
      class: 'week__step',
      type: 'button',
      'aria-label': 'Next week',
      onclick: () => setWeek(addDays(weekStart, 7)),
    },
    '›'
  );

  const heads = el('div', { class: 'week__heads' });
  const hours = el('div', { class: 'week__hours' });
  const grid = el('div', {
    class: 'week__grid',
    role: 'grid',
    'aria-label': 'Open hours this week — choose when your group would come',
  });
  const marks = el('div', { class: 'week__marks', 'aria-hidden': 'true' });
  const body = el('div', { class: 'week__body' }, [hours, grid, marks]);
  const note = el('p', { class: 'week__note' });

  const element = el('div', { class: 'week' }, [
    el('div', { class: 'week__bar' }, [
      prev,
      el('div', { class: 'week__barmid' }, [range, jump]),
      next,
    ]),
    heads,
    body,
    note,
  ]);

  // ── the room's week, as data ───────────────────────────────────────────────

  const windowsFor = (day) => openWindows.filter((w) => w.day === day);
  const dateOf = (day) => addDays(weekStart, day);

  const fits = (windows, start) =>
    windows.some((w) => toMin(w.start) <= start && start + SLOT_MINUTES <= toMin(w.end));

  function isOpen(day, slot) {
    return fits(windowsFor(day), origin + slot * SLOT_MINUTES);
  }

  /** What steeple last said about this date; null while it has not been asked. */
  const dayOf = (day) => byDate.get(dateOf(day)) ?? null;

  /**
   * Open, but not free: somebody already holds it. Only a date steeple has
   * answered for can say this — an unanswered one is left open rather than
   * invented as busy.
   */
  function heldAt(day, slot) {
    const known = dayOf(day);
    if (!known) return false;
    const start = origin + slot * SLOT_MINUTES;
    if (!isOpen(day, slot)) return false;
    return !fits(known.free, start);
  }

  const blackoutOn = (day) => (dayOf(day)?.isBlackout ? { date: dateOf(day) } : null);
  const isPast = (day) => dateOf(day) < todayIso();
  const usable = (day, slot) => !isPast(day) && isOpen(day, slot) && !heldAt(day, slot);

  const bandSlots = () => {
    if (!schedule?.startTime || !schedule.endTime) return null;
    const from = (toMin(schedule.startTime) - origin) / SLOT_MINUTES;
    const to = (toMin(schedule.endTime) - origin) / SLOT_MINUTES;
    return Number.isFinite(from) && to > from ? { from, to } : null;
  };

  const selectedDays = () =>
    schedule?.frequency === 'weekly'
      ? maskToDays(schedule.daysOfWeekMask ?? 0)
      : schedule?.startDate
        ? [weekdayOf(schedule.startDate)]
        : [];

  // ── changing the schedule ──────────────────────────────────────────────────

  function commit(days, from, to, spoken) {
    const ordered = [...new Set(days)].sort((a, b) => a - b);
    if (!ordered.length) return;
    for (const day of ordered) {
      if (!dayDates.has(day) || weekStartOf(dayDates.get(day)) === weekStart) {
        dayDates.set(day, dateOf(day));
      }
    }
    for (const day of [...dayDates.keys()]) if (!ordered.includes(day)) dayDates.delete(day);

    const startDate = ordered.map((d) => dayDates.get(d)).sort()[0];
    const next = {
      ...schedule,
      startDate,
      startTime: toTime(origin + from * SLOT_MINUTES),
      endTime: toTime(origin + to * SLOT_MINUTES),
      daysOfWeekMask: daysToMask(ordered),
    };
    if (next.frequency !== 'weekly') {
      next.startDate = dayDates.get(ordered[0]);
      next.endDate = null;
    }
    schedule = next;
    onChange?.(next);
    render();
    if (spoken) announce?.(spoken);
  }

  /** Trim a band so it never runs into a booking or past the room's open hours. */
  function fit(day, from, to) {
    let end = from + 1;
    while (end < to && usable(day, end)) end += 1;
    return { from, to: Math.max(end, from + 1) };
  }

  function paint(day, fromSlot, toSlot) {
    const lo = Math.min(fromSlot, toSlot);
    const hi = Math.max(fromSlot, toSlot) + 1;
    if (!usable(day, lo)) return;
    const band = fit(day, lo, hi);
    commit(
      [day],
      band.from,
      band.to,
      `${DAY_LABELS[day]} ${formatTimeRange(
        toTime(origin + band.from * SLOT_MINUTES),
        toTime(origin + band.to * SLOT_MINUTES)
      )} chosen.`
    );
  }

  function tapped(day, slot) {
    const band = bandSlots();
    if (!band) return paint(day, slot, slot + 1);

    // A one-off request has one date, so the only thing another day can mean is
    // "come this day instead" — and the square that was clicked says which hour.
    // Reusing the old band's hours here was the bug that sent a Wednesday
    // 11–12 to a Tuesday morning nobody had pointed at.
    if (schedule.frequency !== 'weekly') {
      const days = selectedDays();
      const inBand = days.includes(day) && slot >= band.from && slot < band.to;
      if (inBand) {
        say('These are the hours you have chosen. Drag the column to change them.');
        return;
      }
      return paint(day, slot, slot + 1);
    }

    // Weekly: the band is the term's one time, and days are added to or taken
    // from it. A click on a day already in the set edits the set, not the hours.
    const days = selectedDays();
    const inBand = slot >= band.from && slot < band.to;
    if (!days.includes(day)) {
      if (!usable(day, band.from)) {
        say(`${DAY_LABELS[day]} is not open then.`);
        return;
      }
      return commit([...days, day], band.from, band.to, `${DAY_LABELS[day]} added.`);
    }
    if (!inBand) return paint(day, slot, slot + 1);
    if (days.length > 1) {
      const kept = days.filter((d) => d !== day);
      return commit(kept, band.from, band.to, `${DAY_LABELS[day]} removed.`);
    }
    say('This is the only day chosen. Pick another day to add one.');
  }

  function say(text) {
    note.textContent = text;
    announce?.(text);
  }

  function setWeek(iso, spoken) {
    weekStart = iso;
    render();
    onWeek?.(weekStart);
    announce?.(spoken ?? `Week of ${formatDate(weekStart)}.`);
  }

  // ── pointer painting ───────────────────────────────────────────────────────

  const cellAt = (target) => target?.closest?.('[data-day]');

  function slotFromY(clientY) {
    const rect = grid.getBoundingClientRect();
    const h = rect.height / slots;
    return clamp(Math.floor((clientY - rect.top) / h), 0, slots - 1);
  }

  grid.addEventListener('pointerdown', (event) => {
    const cell = cellAt(event.target);
    if (!cell || event.button !== 0) return;
    const day = Number(cell.dataset.day);
    const slot = Number(cell.dataset.slot);
    moveCursor(day, slot, false);
    if (!usable(day, slot)) {
      say(
        isPast(day)
          ? 'That day has passed.'
          : blackoutOn(day)
            ? 'The venue is closed that day.'
            : heldAt(day, slot)
              ? 'Another group already holds that hour.'
              : 'The room is not open then.'
      );
      return;
    }
    drag.active = true;
    drag.day = day;
    drag.from = slot;
    drag.to = slot;
    drag.moved = false;
    try {
      grid.setPointerCapture(event.pointerId);
    } catch {
      /* synthetic pointer, nothing to capture */
    }
    preview();
    event.preventDefault();
  });

  grid.addEventListener('pointermove', (event) => {
    if (!drag.active) return;
    const slot = slotFromY(event.clientY);
    if (slot === drag.to) return;
    drag.to = slot;
    drag.moved = true;
    preview();
  });

  function endDrag(event) {
    if (!drag.active) return;
    drag.active = false;
    try {
      grid.releasePointerCapture(event.pointerId);
    } catch {
      /* nothing captured */
    }
    element.classList.remove('is-painting');
    if (drag.moved) paint(drag.day, drag.from, drag.to);
    else tapped(drag.day, drag.from);
  }

  grid.addEventListener('pointerup', endDrag);
  grid.addEventListener('pointercancel', endDrag);

  function preview() {
    element.classList.add('is-painting');
    const lo = Math.min(drag.from, drag.to);
    const hi = Math.max(drag.from, drag.to) + 1;
    const band = fit(drag.day, lo, hi);
    drawMarks({ day: drag.day, from: band.from, to: band.to });
  }

  // ── keyboard ───────────────────────────────────────────────────────────────

  function moveCursor(day, slot, focus = true) {
    cursor = { day: clamp(day, 0, 6), slot: clamp(slot, 0, slots - 1) };
    for (const cell of grid.querySelectorAll('[data-day]')) {
      const on = Number(cell.dataset.day) === cursor.day && Number(cell.dataset.slot) === cursor.slot;
      cell.tabIndex = on ? 0 : -1;
      if (on && focus) cell.focus();
    }
  }

  grid.addEventListener('keydown', (event) => {
    const { day, slot } = cursor;
    const band = bandSlots();
    const keys = {
      ArrowUp: () => (event.shiftKey && band ? trim(-1) : moveCursor(day, slot - 1)),
      ArrowDown: () => (event.shiftKey && band ? trim(1) : moveCursor(day, slot + 1)),
      ArrowLeft: () => (day === 0 ? stepWeek(-1, 6) : moveCursor(day - 1, slot)),
      ArrowRight: () => (day === 6 ? stepWeek(1, 0) : moveCursor(day + 1, slot)),
      Home: () => moveCursor(day, 0),
      End: () => moveCursor(day, slots - 1),
      PageUp: () => stepWeek(-1, day),
      PageDown: () => stepWeek(1, day),
      Enter: () => tapped(day, slot),
      ' ': () => tapped(day, slot),
    };
    const run = keys[event.key];
    if (!run) return;
    event.preventDefault();
    run();
    if (event.key === 'Enter' || event.key === ' ') moveCursor(cursor.day, cursor.slot);
  });

  function stepWeek(direction, day) {
    setWeek(addDays(weekStart, direction * 7));
    moveCursor(day, cursor.slot);
  }

  function trim(delta) {
    const band = bandSlots();
    if (!band) return;
    const to = clamp(band.to + delta, band.from + 1, slots);
    if (to === band.to) return;
    const days = selectedDays();
    const fitted = fit(days[0] ?? cursor.day, band.from, to);
    commit(
      days,
      fitted.from,
      fitted.to,
      formatTimeRange(
        toTime(origin + fitted.from * SLOT_MINUTES),
        toTime(origin + fitted.to * SLOT_MINUTES)
      )
    );
  }

  // ── drawing ────────────────────────────────────────────────────────────────

  function drawMarks(previewBand = null) {
    const nodes = [];
    const today = todayIso();

    for (let day = 0; day < 7; day += 1) {
      const date = dateOf(day);
      // Hours the room keeps shut, drawn as the paper showing through.
      let run = null;
      for (let slot = 0; slot <= slots; slot += 1) {
        const shut = slot < slots && !isOpen(day, slot);
        if (shut && run === null) run = slot;
        if (!shut && run !== null) {
          nodes.push(mark('shut', day, run, slot));
          run = null;
        }
      }
      if (date < today) nodes.push(mark('past', day, 0, slots));

      // Held hours are drawn from the difference steeple reported: open here,
      // not free there. One run of slots, one bar — the same shape the old
      // occurrence list drew, derived rather than remembered.
      let busy = null;
      for (let slot = 0; slot <= slots; slot += 1) {
        const taken = slot < slots && heldAt(day, slot);
        if (taken && busy === null) busy = slot;
        if (!taken && busy !== null) {
          nodes.push(mark('busy', day, busy, slot, [el('span', { class: 'mark__label', text: 'Held' })]));
          busy = null;
        }
      }
    }

    const band = previewBand ? null : bandSlots();
    if (previewBand) {
      nodes.push(mark('band is-preview', previewBand.day, previewBand.from, previewBand.to));
    } else if (band) {
      // A timetable entry, not a sentence: the hours read in the column's own
      // width, and the request's summary carries the full wording.
      const label = `${formatTime(toTime(origin + band.from * SLOT_MINUTES), {
        suffix: false,
      })}–${formatTime(toTime(origin + band.to * SLOT_MINUTES), { suffix: false })}`;
      for (const day of selectedDays()) {
        const date = dateOf(day);
        const outside =
          schedule.frequency === 'weekly'
            ? date < schedule.startDate || (schedule.endDate && date > schedule.endDate)
            : date !== schedule.startDate;
        if (outside && schedule.frequency !== 'weekly') continue;
        nodes.push(
          mark(`band${outside ? ' is-outside' : ''}`, day, band.from, band.to, [
            el('span', { class: 'mark__label', text: label }),
          ])
        );
      }
    }
    replaceChildren(marks, nodes);
  }

  function mark(kind, day, from, to, children = []) {
    return el(
      'div',
      {
        class: `mark mark--${kind.split(' ')[0]}${kind.includes(' ') ? ` ${kind.split(' ').slice(1).join(' ')}` : ''}`,
        style: `grid-column:${day + 1};margin-top:calc(${from} * var(--slot));height:calc(${to - from} * var(--slot))`,
      },
      children
    );
  }

  function render() {
    if (!venueId || !roomId) return;
    const windows = openWindows;
    if (!windows.length) {
      replaceChildren(heads, []);
      replaceChildren(grid, [el('p', { class: 'week__empty', text: emptyLine })]);
      replaceChildren(marks, []);
      return;
    }

    origin = Math.min(...windows.map((w) => toMin(w.start)));
    const finish = Math.max(...windows.map((w) => toMin(w.end)));
    slots = Math.round((finish - origin) / SLOT_MINUTES);
    element.style.setProperty('--slots', String(slots));

    const first = dateOf(0);
    const last = dateOf(6);
    range.textContent = `${formatDate(first)} – ${formatDate(last)}`;
    const strayDate =
      schedule?.frequency !== 'weekly' && schedule?.startDate && weekStartOf(schedule.startDate) !== weekStart;
    jump.hidden = !strayDate;
    if (strayDate) jump.textContent = `Your date is ${formatDate(schedule.startDate)} — show that week`;

    const today = todayIso();
    replaceChildren(heads, [
      el('span', { class: 'week__corner', 'aria-hidden': 'true' }),
      ...DAY_LABELS.map((name, day) => {
        const date = dateOf(day);
        const blackout = blackoutOn(day);
        return el(
          'div',
          {
            class: `week__head${date === today ? ' is-today' : ''}${date < today ? ' is-past' : ''}`,
            title: blackout ? `Closed — ${blackout.reason}` : null,
          },
          [
            el('span', { class: 'week__dayname', text: name.slice(0, 3) }),
            el('span', { class: 'week__daynum', text: String(Number(date.slice(8))) }),
            blackout && el('span', { class: 'week__closed', text: 'closed' }),
          ]
        );
      }),
    ]);

    replaceChildren(
      hours,
      Array.from({ length: Math.ceil((slots * SLOT_MINUTES) / 60) }, (_, i) =>
        el('span', { class: 'week__hour', text: formatTime(toTime(origin + i * 60)) })
      )
    );

    const rows = [];
    for (let slot = 0; slot < slots; slot += 1) {
      const cells = DAY_LABELS.map((name, day) => {
        const open = isOpen(day, slot);
        const held = heldAt(day, slot);
        const past = isPast(day);
        const free = open && !held && !past;
        const time = toTime(origin + slot * SLOT_MINUTES);
        return el('div', {
          class: `week__cell${free ? '' : ' is-inert'}${slot % 2 ? ' is-half' : ''}`,
          role: 'gridcell',
          tabindex: -1,
          dataset: { day: String(day), slot: String(slot) },
          'aria-disabled': free ? null : 'true',
          'aria-label': `${name} ${formatDate(dateOf(day), { short: true })}, ${formatTime(time)}${
            free ? '' : held ? ', already held' : past ? ', past' : ', closed'
          }`,
        });
      });
      rows.push(el('div', { class: 'week__row', role: 'row' }, cells));
    }
    replaceChildren(grid, rows);
    moveCursor(cursor.day, cursor.slot, false);
    drawMarks();
  }

  return {
    element,
    setRoom(nextVenueId, nextRoomId) {
      if (venueId === nextVenueId && roomId === nextRoomId) return;
      venueId = nextVenueId;
      roomId = nextRoomId;
      dayDates = new Map();
      openWindows = [];
      byDate = new Map();
      emptyLine = LOADING;
      weekStart = weekStartOf(todayIso());
      cursor = { day: weekdayOf(todayIso()), slot: 0 };
      note.textContent = '';
    },
    /** The room's weekly open hours, as steeple publishes them. */
    setHours(windows) {
      openWindows = windows ?? [];
      emptyLine = windows ? NO_HOURS : UNREACHABLE;
    },
    /** What is still free, by date. Merged: paging back must not forget a week. */
    setAvailability(days) {
      for (const day of days ?? []) byDate.set(day.date, day);
    },
    /** The week currently on screen — what a caller should ask steeple about. */
    weekStart: () => weekStart,
    setSchedule(next) {
      schedule = next;
      if (next?.startDate && !dayDates.size) {
        for (const day of next.frequency === 'weekly'
          ? maskToDays(next.daysOfWeekMask ?? 0)
          : [weekdayOf(next.startDate)]) {
          dayDates.set(day, addDays(next.startDate, (day - weekdayOf(next.startDate) + 7) % 7));
        }
      }
    },
    setNote: (text) => {
      note.textContent = text ?? '';
    },
    render,
  };
}
