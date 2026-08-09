// THE SCHEDULE RIBBON — a request laid against the week the room actually has.
// One lane per weekday, time running left to right: the hours the room is open
// (sage), what it already stands behind (graphite), what is being asked for
// (terracotta), and — drawn on top, so it cannot be missed — where the two
// collide. Calm at a glance: a clean request has no dark bar in it.

import { DAY_LABELS } from '../../data/store.js';
import { el, replaceChildren } from '../dom.js';
import { fmtTime, fmtTimeRange, minutesOf, weekLanes } from './model.js';

const pct = (value) => `${Math.round(value * 10000) / 100}%`;

function span(axis, start, end) {
  const from = (minutesOf(start) - axis.start) / (axis.end - axis.start);
  const to = (minutesOf(end) - axis.start) / (axis.end - axis.start);
  return { left: pct(Math.max(0, from)), width: pct(Math.max(0.004, Math.min(1, to) - Math.max(0, from))) };
}

function bar(className, axis, start, end, children = []) {
  const { left, width } = span(axis, start, end);
  const node = el('div', { class: className, 'aria-hidden': 'true' }, children);
  node.style.left = left;
  node.style.width = width;
  return node;
}

function overlaps(a, b) {
  const start = a.start > b.start ? a.start : b.start;
  const end = a.end < b.end ? a.end : b.end;
  return start < end ? { start, end } : null;
}

/** A lane read out loud, for the live region and for the row's title. */
function laneSentence(lane, held = false) {
  const parts = [lane.label];
  parts.push(lane.open.length ? `open ${lane.open.map((w) => fmtTimeRange(w.start, w.end)).join(' and ')}` : 'closed');
  if (lane.booked.length)
    parts.push(
      `already held ${lane.booked.map((b) => `${fmtTimeRange(b.start, b.end)} by ${b.label}`).join(', ')}`
    );
  if (lane.proposed)
    parts.push(
      held
        ? `held ${fmtTimeRange(lane.proposed.start, lane.proposed.end)} by this booking`
        : `asked for ${fmtTimeRange(lane.proposed.start, lane.proposed.end)}${lane.clash ? ' — this collides' : ''}`
    );
  return `${parts.join(', ')}.`;
}

export function createRibbon({ compact = false } = {}) {
  const axisRow = el('div', { class: 'ribbon__axis', 'aria-hidden': 'true' });
  const lanesRow = el('div', { class: 'ribbon__lanes' });
  const heldRow = el('ul', { class: 'held' });
  const element = el('div', { class: `ribbon${compact ? ' ribbon--compact' : ''}` }, [
    axisRow,
    lanesRow,
    compact ? null : heldRow,
  ]);

  // `held` is the ribbon on a booked letter: the lanes are not a proposal being
  // weighed, they are dates this venue already stands behind, and a lane marked
  // "free" over a booking of one's own is simply untrue.
  function update({ venueId, roomId, proposal, ghost = null, exceptApplicationId = null, held = false }) {
    const { lanes, axis } = weekLanes(venueId, roomId, proposal, { exceptApplicationId });

    const ticks = [];
    const step = axis.end - axis.start > 12 * 60 ? 120 : 60;
    const first = Math.ceil(axis.start / step) * step;
    lanesRow.style.setProperty('--tick-step', pct(step / (axis.end - axis.start)));
    lanesRow.style.setProperty('--tick-offset', pct((first - axis.start) / (axis.end - axis.start)));
    for (let t = first; t <= axis.end; t += step) {
      const tick = el('span', {
        class: 'ribbon__tick',
        text: compact ? '' : fmtTime(`${String(Math.floor(t / 60)).padStart(2, '0')}:00`),
      });
      tick.style.left = pct((t - axis.start) / (axis.end - axis.start));
      ticks.push(tick);
    }
    replaceChildren(axisRow, ticks);

    replaceChildren(
      lanesRow,
      lanes.map((lane) => {
        const track = el('div', { class: 'lane__track' });
        for (const window of lane.open) track.append(bar('lane__open', axis, window.start, window.end));
        for (const taken of lane.booked) track.append(bar('lane__booked', axis, taken.start, taken.end));
        if (ghost && ghost.days.has(lane.day)) {
          track.append(bar('lane__ghost', axis, ghost.start, ghost.end));
        }
        if (lane.proposed) {
          track.append(bar('lane__proposed', axis, lane.proposed.start, lane.proposed.end));
          for (const taken of lane.booked) {
            const hit = overlaps(lane.proposed, taken);
            if (hit) track.append(bar('lane__collide', axis, hit.start, hit.end));
          }
        }

        return el(
          'div',
          {
            class: `lane${lane.proposed ? ' lane--asked' : ''}${lane.clash ? ' lane--clash' : ''}`,
            title: laneSentence(lane, held),
          },
          [
            compact ? null : el('span', { class: 'lane__day', text: lane.short }),
            track,
            compact || !lane.proposed
              ? null
              : el('span', {
                  class: 'lane__note',
                  text: held ? 'held' : lane.clash ? 'collides' : 'free',
                }),
          ]
        );
      })
    );

    if (!compact) {
      // What the room already stands behind, named beside the ribbon rather
      // than crammed inside a bar too narrow to hold a word.
      const bars = new Map();
      for (const lane of lanes) {
        for (const booked of lane.booked) {
          const key = `${booked.label}/${booked.start}/${booked.end}`;
          const entry = bars.get(key) ?? { ...booked, days: [] };
          entry.days.push(lane.day);
          bars.set(key, entry);
        }
      }
      replaceChildren(
        heldRow,
        [...bars.values()].map((entry) =>
          el('li', { class: 'held__item' }, [
            el('span', { class: 'held__mark', 'aria-hidden': 'true' }),
            `${entry.days.map((d) => `${DAY_LABELS[d]}s`).join(', ')} ${fmtTimeRange(
              entry.start,
              entry.end
            )} · ${entry.label}`,
          ])
        )
      );
    }

    return lanes;
  }

  return { element, update, sentence: laneSentence };
}

/** The same week, said in words — the ribbon's job for a screen reader. */
export function ribbonSpoken(venueId, roomId, proposal, exceptApplicationId = null, held = false) {
  const { lanes } = weekLanes(venueId, roomId, proposal, { exceptApplicationId });
  return lanes
    .filter((lane) => lane.proposed)
    .map((lane) => laneSentence(lane, held))
    .join(' ');
}
