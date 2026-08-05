// THE WEEKLY OPEN-HOURS PAINTER — the same week the ribbon draws, but the host
// is holding the brush. Drag along a day to open it, drag across open time to
// close it again; arrows and Space do the same from the keyboard. Windows are
// the runs of painted half hours, so two windows on one day can never overlap
// and setOpenHours (replace-all) always accepts them.

import { DAY_LABELS, openHoursFor, setOpenHours } from '../../data/store.js';
import { el, replaceChildren } from '../dom.js';
import { DAY_SHORT, fmtTime, fmtTimeRange, minutesOf } from './model.js';

const DAY_START = 6 * 60;
const DAY_END = 23 * 60;
const STEP = 30;
const SLOTS = (DAY_END - DAY_START) / STEP;

const slotTime = (index) => {
  const total = DAY_START + index * STEP;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};
const slotOf = (time) => Math.round((minutesOf(time) - DAY_START) / STEP);

/** Maximal runs of painted half hours, in the shape setOpenHours wants. */
function windowsFrom(painted) {
  const windows = [];
  for (let day = 0; day < 7; day += 1) {
    let run = null;
    for (let i = 0; i <= SLOTS; i += 1) {
      const on = i < SLOTS && painted[day].has(i);
      if (on && run === null) run = i;
      if (!on && run !== null) {
        windows.push({ day, start: slotTime(run), end: slotTime(i) });
        run = null;
      }
    }
  }
  return windows;
}

export function createHoursPainter({ announce } = {}) {
  const painted = Array.from({ length: 7 }, () => new Set());
  let target = { venueId: null, roomId: null };
  let focus = { day: 1, slot: slotOf('09:00') };
  let drag = null;
  let onChange = null;

  const cells = Array.from({ length: 7 }, () => []);
  const axis = el('div', { class: 'ribbon__axis', 'aria-hidden': 'true' });
  const grid = el('div', {
    class: 'paint__grid',
    role: 'grid',
    'aria-label': 'Weekly open hours. Arrow keys move, Space opens or closes a half hour, Shift with arrows paints.',
  });
  const summary = el('div', { class: 'paint__summary' });
  const status = el('p', { class: 'paint__status', role: 'status' });

  const quick = el('div', { class: 'paint__quick' }, [
    el(
      'button',
      { type: 'button', class: 'linkish', onclick: () => preset(8, 22) },
      'Open every day, 8 am – 10 pm'
    ),
    el(
      'button',
      { type: 'button', class: 'linkish', onclick: () => copyFirst() },
      'Copy the first day across'
    ),
    el('button', { type: 'button', class: 'linkish', onclick: () => clearAll() }, 'Clear the week'),
  ]);

  const element = el('div', { class: 'paint' }, [
    axis,
    grid,
    quick,
    summary,
    status,
  ]);

  // ── the grid ──────────────────────────────────────────────────────────────
  for (let t = DAY_START; t <= DAY_END; t += 120) {
    const tick = el('span', {
      class: 'ribbon__tick',
      text: fmtTime(`${String(Math.floor(t / 60)).padStart(2, '0')}:00`),
    });
    tick.style.left = `${((t - DAY_START) / (DAY_END - DAY_START)) * 100}%`;
    axis.append(tick);
  }

  for (let day = 0; day < 7; day += 1) {
    const row = el('div', { class: 'paint__row', role: 'row', 'aria-label': DAY_LABELS[day] }, [
      el('span', { class: 'paint__day', 'aria-hidden': 'true', text: DAY_SHORT[day] }),
    ]);
    const track = el('div', { class: 'paint__track' });
    for (let slot = 0; slot < SLOTS; slot += 1) {
      const cell = el('div', {
        class: 'paint__cell',
        role: 'gridcell',
        tabindex: '-1',
        dataset: { day: String(day), slot: String(slot) },
      });
      cells[day].push(cell);
      track.append(cell);
    }
    row.append(track);
    grid.append(row);
  }

  function labelCell(day, slot) {
    const cell = cells[day][slot];
    const on = painted[day].has(slot);
    cell.classList.toggle('is-on', on);
    cell.setAttribute('aria-selected', on ? 'true' : 'false');
    cell.setAttribute(
      'aria-label',
      `${DAY_LABELS[day]} ${fmtTime(slotTime(slot))}, ${on ? 'open' : 'closed'}`
    );
    cell.tabIndex = day === focus.day && slot === focus.slot ? 0 : -1;
  }

  function paintAll() {
    for (let day = 0; day < 7; day += 1) for (let slot = 0; slot < SLOTS; slot += 1) labelCell(day, slot);
    renderSummary();
  }

  function renderSummary() {
    const windows = windowsFrom(painted);
    if (!windows.length) {
      replaceChildren(summary, [
        el('p', {
          class: 'prose prose--sm',
          text: 'The week is closed. Nothing can be asked for until an hour is open.',
        }),
      ]);
      return;
    }
    const byDay = new Map();
    for (const w of windows) byDay.set(w.day, [...(byDay.get(w.day) ?? []), w]);
    replaceChildren(summary, [
      el(
        'dl',
        { class: 'paint__list' },
        [...byDay.entries()].flatMap(([day, list]) => [
          el('dt', { text: DAY_LABELS[day] }),
          el('dd', { text: list.map((w) => fmtTimeRange(w.start, w.end)).join(' · ') }),
        ])
      ),
    ]);
  }

  function commit(reason) {
    if (!target.venueId) return { ok: false };
    const windows = windowsFrom(painted);
    const result = setOpenHours(target.venueId, target.roomId, windows);
    const said = windows.length
      ? `${windows.length} open ${windows.length === 1 ? 'window' : 'windows'} saved across ${
          new Set(windows.map((w) => w.day)).size
        } days.`
      : 'The week is closed — no open hours saved.';
    status.textContent = result.ok ? said : result.errors.hours;
    if (reason !== 'silent') announce?.(result.ok ? said : result.errors.hours);
    onChange?.(windows, result);
    return result;
  }

  function apply(day, from, to, mode) {
    const lo = Math.min(from, to);
    const hi = Math.max(from, to);
    for (let slot = lo; slot <= hi; slot += 1) {
      if (mode === 'paint') painted[day].add(slot);
      else painted[day].delete(slot);
      labelCell(day, slot);
    }
    renderSummary();
  }

  function cellFrom(event) {
    const node = event.target.closest?.('.paint__cell');
    if (!node) return null;
    return { day: Number(node.dataset.day), slot: Number(node.dataset.slot) };
  }

  grid.addEventListener('pointerdown', (event) => {
    const at = cellFrom(event);
    if (!at) return;
    event.preventDefault();
    grid.setPointerCapture?.(event.pointerId);
    drag = { day: at.day, anchor: at.slot, mode: painted[at.day].has(at.slot) ? 'erase' : 'paint' };
    focus = { day: at.day, slot: at.slot };
    apply(at.day, at.slot, at.slot, drag.mode);
    cells[at.day][at.slot].focus({ preventScroll: true });
  });

  grid.addEventListener('pointermove', (event) => {
    if (!drag) return;
    const node = document.elementFromPoint(event.clientX, event.clientY)?.closest?.('.paint__cell');
    if (!node || Number(node.dataset.day) !== drag.day) return;
    apply(drag.day, drag.anchor, Number(node.dataset.slot), drag.mode);
  });

  const endDrag = (event) => {
    if (!drag) return;
    grid.releasePointerCapture?.(event.pointerId);
    drag = null;
    commit();
  };
  grid.addEventListener('pointerup', endDrag);
  grid.addEventListener('pointercancel', endDrag);

  grid.addEventListener('keydown', (event) => {
    const step = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] }[
      event.key
    ];
    if (step) {
      event.preventDefault();
      const day = Math.min(6, Math.max(0, focus.day + step[0]));
      const slot = Math.min(SLOTS - 1, Math.max(0, focus.slot + step[1]));
      if (event.shiftKey && day === focus.day) {
        apply(day, focus.slot, slot, painted[day].has(focus.slot) ? 'paint' : 'erase');
      }
      const previous = focus;
      focus = { day, slot };
      labelCell(previous.day, previous.slot);
      labelCell(day, slot);
      cells[day][slot].focus({ preventScroll: true });
      if (event.shiftKey) commit('silent');
      return;
    }
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      const slot = event.key === 'Home' ? 0 : SLOTS - 1;
      const previous = focus;
      focus = { day: focus.day, slot };
      labelCell(previous.day, previous.slot);
      labelCell(focus.day, slot);
      cells[focus.day][slot].focus({ preventScroll: true });
      return;
    }
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      const on = painted[focus.day].has(focus.slot);
      apply(focus.day, focus.slot, focus.slot, on ? 'erase' : 'paint');
      commit();
    }
  });

  function preset(fromHour, toHour) {
    const from = slotOf(`${String(fromHour).padStart(2, '0')}:00`);
    const to = slotOf(`${String(toHour).padStart(2, '0')}:00`) - 1;
    for (let day = 0; day < 7; day += 1) {
      painted[day].clear();
      for (let slot = from; slot <= to; slot += 1) painted[day].add(slot);
    }
    paintAll();
    commit();
  }

  function copyFirst() {
    const source = painted.findIndex((set) => set.size > 0);
    if (source < 0) {
      status.textContent = 'Paint one day first, then copy it across.';
      announce?.('Paint one day first, then copy it across.');
      return;
    }
    for (let day = 0; day < 7; day += 1) painted[day] = new Set(painted[source]);
    paintAll();
    commit();
  }

  function clearAll() {
    for (const set of painted) set.clear();
    paintAll();
    commit();
  }

  function load(venueId, roomId) {
    target = { venueId, roomId };
    for (const set of painted) set.clear();
    for (const window of openHoursFor(venueId, roomId)) {
      for (let slot = slotOf(window.start); slot < slotOf(window.end); slot += 1) {
        if (slot >= 0 && slot < SLOTS) painted[window.day].add(slot);
      }
    }
    status.textContent = '';
    paintAll();
  }

  return {
    element,
    load,
    windows: () => windowsFrom(painted),
    focusGrid: () => cells[focus.day][focus.slot].focus(),
    onChange: (fn) => {
      onChange = fn;
    },
  };
}
