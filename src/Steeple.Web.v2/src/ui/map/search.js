// THE SEARCH PILL — one segmented control asking the four questions steeple's
// own funnel asks: where, when, how many, and anything else.
//
// Every segment is a quiet uppercase label over the live value, so the control
// reads as a sentence about the search you are already running rather than as
// a form waiting to be filled in. Touch any of it and the whole surface answers
// at once: the list, the pins, and the count are one query's three faces.
//
// The query goes through data/catalog.js and nowhere else. Its schedule terms
// are inert against the bundled seed and answered by the live API — the pill
// sends them either way, because a control that quietly drops what you asked
// for is worse than one that cannot yet honour it.
//
// The bus's `filters:change` carries the activity chips and the venue ids that
// still match. bus.setFilters derives that set from the chips alone, which was
// true when chips were the only filter; the pill derives it from the results of
// the whole query instead, and emits the same shape (CONTRACT4 §2).

import { bus, state } from '../../core/bus.js';
import { getGeofence, getSuburbs, readFailure, searchListings } from '../../data/catalog.js';
import { el } from '../dom.js';
import { createFilterPanel } from './filters.js';

// What the Where segment says when it is not holding a suburb. The area's own
// name stands here once the catalog answers: this is the control that decides
// where the search is looking, so it is the honest place to say where that is.
// The geofence names itself for a page title — "Vienna & nearby (Northern
// Virginia)" — and the parenthetical is the part a segment this wide cannot
// take, so it is trimmed rather than allowed to push the other questions.
const ANYWHERE = 'Anywhere nearby';

// .NET's DayOfWeek, which is what the API speaks: Sunday is 0.
const DAYS = [
  { n: 1, short: 'Mon', long: 'Monday' },
  { n: 2, short: 'Tue', long: 'Tuesday' },
  { n: 3, short: 'Wed', long: 'Wednesday' },
  { n: 4, short: 'Thu', long: 'Thursday' },
  { n: 5, short: 'Fri', long: 'Friday' },
  { n: 6, short: 'Sat', long: 'Saturday' },
  { n: 0, short: 'Sun', long: 'Sunday' },
];

const BANDS = [
  { id: 'Morning', hint: '6am – noon', startTime: '06:00', endTime: '12:00' },
  { id: 'Afternoon', hint: 'noon – 5pm', startTime: '12:00', endTime: '17:00' },
  { id: 'Evening', hint: '5pm – 10pm', startTime: '17:00', endTime: '22:00' },
];

const CAPACITIES = [10, 25, 50, 100, 200];

const PIN_ICON =
  '<svg viewBox="0 0 16 20" width="11" height="14" aria-hidden="true" focusable="false">' +
  '<path d="M8 19s6.4-7.9 6.4-11A6.4 6.4 0 0 0 1.6 8c0 3.1 6.4 11 6.4 11Z" fill="none" stroke="currentColor" stroke-width="1.6"/>' +
  '<circle cx="8" cy="7.7" r="2.2" fill="currentColor"/></svg>';

const FUNNEL_ICON =
  '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" focusable="false">' +
  '<path d="M1.5 2.5h13l-5 5.6v5l-3 1.4v-6.4Z" fill="none" stroke="currentColor" ' +
  'stroke-width="1.5" stroke-linejoin="round"/></svg>';

function icon(markup, className) {
  const span = el('span', { class: className, 'aria-hidden': 'true' });
  span.innerHTML = markup; // hand-written markup, never data
  return span;
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** "9 spaces across 5 venues" — the search's own answer, not an estimate. */
export function resultLine(items) {
  if (items.length === 0) return 'No spaces match this search';
  const churches = new Set(items.map((item) => item.venueSlug)).size;
  return `${plural(items.length, 'space', 'spaces')} across ${plural(churches, 'venue', 'venues')}`;
}

const prettyDate = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
};

export function createSearch({ announce = () => {}, onResults = () => {}, onTrouble = () => {} } = {}) {
  const query = {
    suburb: null,
    mode: 'once', // 'once' | 'weekly'
    date: null,
    days: new Set(),
    band: null,
    minCapacity: 0,
  };

  let suburbs = [];
  let anywhere = ANYWHERE;
  let openSegment = null;
  let run = 0;
  let publishing = false;

  // ── the query, as the catalog speaks it ────────────────────────────────────

  function catalogQuery() {
    const { activities, amenities, accessibility } = filterPanel.values();
    const band = BANDS.find((b) => b.id === query.band);
    const weekly = query.mode === 'weekly' && query.days.size > 0;
    return {
      suburb: query.suburb,
      minCapacity: query.minCapacity,
      activities,
      amenities,
      accessibility,
      date: query.mode === 'once' ? query.date : null,
      daysOfWeek: weekly ? [...query.days].sort((a, b) => a - b) : null,
      timeOfDay: query.band,
      startTime: band?.startTime ?? null,
      endTime: band?.endTime ?? null,
    };
  }

  // The whole query's answer, said in the shape the world already listens for.
  function publish(items) {
    publishing = true;
    state.filters = new Set(filterPanel.activities());
    state.matching = new Set(items.map((item) => item.venueSlug));
    bus.emit('filters:change', { filters: state.filters, matching: state.matching });
    publishing = false;
  }

  let announceTimer = 0;

  async function search() {
    const token = (run += 1);
    let answer;
    try {
      answer = await searchListings(catalogQuery());
    } catch (error) {
      // steeple answered and refused. The seed cannot stand in for a search —
      // it knows nothing of open hours or bookings — so the surface says it has
      // no answer rather than showing rooms nobody vouched for.
      if (token !== run) return;
      const failure = readFailure(error);
      paint();
      publish([]);
      onTrouble(failure);
      clearTimeout(announceTimer);
      announceTimer = setTimeout(() => announce(failure.message), 350);
      return;
    }
    const { items } = answer;
    if (token !== run) return; // a later question has already been asked
    paint();
    publish(items);
    onResults(items);
    clearTimeout(announceTimer);
    announceTimer = setTimeout(() => announce(`${resultLine(items)}.`), 350);
  }

  // A filter set elsewhere — the debug API, a flow — is still a filter: adopt
  // it and ask the question again rather than letting the pill lie.
  bus.on('filters:change', ({ filters }) => {
    if (publishing) return;
    const mine = filterPanel.activities();
    if (filters.size === mine.size && [...filters].every((f) => mine.has(f))) return;
    filterPanel.setActivities(filters);
    search();
  });

  // ── segments ───────────────────────────────────────────────────────────────

  const bar = el('div', { class: 'dm-bar' });
  const popover = el('div', { class: 'dm-pop', hidden: true });
  const element = el('div', { class: 'dm-search', role: 'search' }, [bar, popover]);

  const panels = new Map();
  const segments = new Map();

  /** A segment: the uppercase question, and under it the standing answer. */
  function segment(id, label, { widest = false } = {}) {
    const value = el('span', { class: 'dm-seg__value' });
    const node = el(
      'div',
      { class: `dm-seg dm-seg--${id}${widest ? ' dm-seg--wide' : ''}`, dataset: { segment: id } },
      [el('span', { class: 'dm-seg__label', text: label }), value]
    );
    segments.set(id, { node, value });
    return { node, value };
  }

  // The button covers the whole segment; the label and the value stay outside
  // it, where they can be read. Its own name is kept true in paint().
  function openButton(id) {
    return el('button', {
      type: 'button',
      class: 'dm-seg__open',
      'aria-expanded': 'false',
      'aria-haspopup': 'true',
      onclick: () => setOpen(openSegment === id ? null : id),
    });
  }

  // ── where ──────────────────────────────────────────────────────────────────

  const whereInput = el('input', {
    type: 'text',
    class: 'dm-seg__input',
    id: 'dm-where',
    placeholder: anywhere,
    autocomplete: 'off',
    role: 'combobox',
    'aria-expanded': 'false',
    'aria-controls': 'dm-suburbs',
    'aria-autocomplete': 'list',
    'aria-label': 'Where — search a suburb',
  });

  const where = segment('where', 'Where', { widest: true });
  where.value.append(icon(PIN_ICON, 'dm-seg__icon'), whereInput);

  const suburbList = el('ul', { class: 'dm-typeahead', id: 'dm-suburbs', role: 'listbox' });
  panels.set('where', suburbList);

  let active = -1;
  let options = [];

  function renderSuburbs() {
    const typed = whereInput.value.trim().toLowerCase();
    const matches = suburbs.filter((s) => s.toLowerCase().includes(typed));
    // Index 0 is always "the whole area" — the way back out of a suburb.
    options = [anywhere, ...matches];
    active = -1;
    suburbList.textContent = '';
    for (const [i, name] of options.entries()) {
      const whole = i === 0;
      suburbList.append(
        el(
          'li',
          {
            class: `dm-typeahead__item${whole ? ' is-anywhere' : ''}`,
            id: `dm-suburb-${i}`,
            role: 'option',
            'aria-selected':
              (whole && !query.suburb) || name === query.suburb ? 'true' : 'false',
            onmousedown: (event) => {
              event.preventDefault(); // choosing must not blur the input first
              chooseSuburb(whole ? null : name);
            },
          },
          [whole ? null : icon(PIN_ICON, 'dm-typeahead__icon'), name]
        )
      );
    }
  }

  function highlight(next) {
    const items = [...suburbList.children];
    if (items.length === 0) return;
    active = (next + items.length) % items.length;
    for (const [i, item] of items.entries()) item.classList.toggle('is-active', i === active);
    whereInput.setAttribute('aria-activedescendant', items[active].id);
    items[active].scrollIntoView({ block: 'nearest' });
  }

  function chooseSuburb(name) {
    query.suburb = name;
    whereInput.value = name ?? '';
    setOpen(null);
    search();
  }

  whereInput.addEventListener('focus', () => setOpen('where'));
  whereInput.addEventListener('input', () => {
    setOpen('where');
    renderSuburbs();
  });
  whereInput.addEventListener('blur', () => {
    // Half-typed text is not a place: the input goes back to what is being asked.
    whereInput.value = query.suburb ?? '';
  });
  whereInput.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      highlight(active + (event.key === 'ArrowDown' ? 1 : -1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      // Whatever is highlighted, or the first real suburb the typing matched;
      // index 0 is the whole area, which means no suburb at all.
      const at = active >= 0 ? active : options.length > 1 ? 1 : 0;
      chooseSuburb(at === 0 ? null : options[at]);
    }
  });

  // A refused read leaves the vocabulary as it stands: an empty typeahead over
  // "the whole area" is a control with nothing to offer yet, and the seed's
  // suburbs would be a list of places this search cannot actually look in.
  getSuburbs()
    .then((list) => {
      suburbs = list;
      if (openSegment === 'where') renderSuburbs();
    })
    .catch(() => {});

  // The search area names itself. Until it answers the segment says "Anywhere
  // nearby", which is true of every geofence steeple could hand back.
  getGeofence()
    .then((fence) => {
      const named = String(fence?.areaName ?? '').replace(/\s*\([^)]*\)\s*$/, '').trim();
      if (!named) return;
      anywhere = named;
      whereInput.setAttribute('placeholder', named);
      whereInput.setAttribute('aria-label', `Where — ${named}. Search a suburb.`);
      if (openSegment === 'where') renderSuburbs();
    })
    .catch(() => {});

  // ── when ───────────────────────────────────────────────────────────────────

  const when = segment('when', 'When');
  when.node.append(openButton('when'));

  const modeSwitch = el('div', { class: 'dm-switch', role: 'group', 'aria-label': 'How often' });
  const modeButtons = [
    { mode: 'once', label: 'Just once' },
    { mode: 'weekly', label: 'Weekly on…' },
  ].map(({ mode, label }) => {
    const button = el(
      'button',
      {
        type: 'button',
        class: 'dm-switch__option',
        'aria-pressed': 'false',
        dataset: { mode },
        onclick: () => {
          query.mode = mode;
          search();
        },
      },
      label
    );
    modeSwitch.append(button);
    return button;
  });

  const dateInput = el('input', {
    type: 'date',
    class: 'dm-date',
    'aria-label': 'The date you need it',
    oninput: () => {
      query.date = dateInput.value || null;
      search();
    },
  });
  const onceRow = el('div', { class: 'dm-when__once' }, dateInput);

  const dayChips = DAYS.map((day) =>
    el(
      'button',
      {
        type: 'button',
        class: 'pill pill--day',
        'aria-pressed': 'false',
        'aria-label': day.long,
        dataset: { day: String(day.n) },
        onclick: () => {
          if (query.days.has(day.n)) query.days.delete(day.n);
          else query.days.add(day.n);
          search();
        },
      },
      day.short
    )
  );
  const weeklyRow = el(
    'div',
    { class: 'dm-when__weekly', role: 'group', 'aria-label': 'The days you meet' },
    dayChips
  );

  const bandChips = BANDS.map((band) =>
    el(
      'button',
      {
        type: 'button',
        class: 'pill pill--band',
        'aria-pressed': 'false',
        dataset: { band: band.id },
        onclick: () => {
          query.band = query.band === band.id ? null : band.id;
          search();
        },
      },
      [el('span', { class: 'dm-band__name', text: band.id }), el('span', { class: 'dm-band__hint', text: band.hint })]
    )
  );

  panels.set(
    'when',
    el('div', { class: 'dm-when' }, [
      modeSwitch,
      onceRow,
      weeklyRow,
      el('div', { class: 'dm-group' }, [
        el('h3', { class: 'eyebrow dm-group__label', text: 'Time of day' }),
        el('div', { class: 'dm-group__chips', role: 'group', 'aria-label': 'Time of day' }, bandChips),
      ]),
      el(
        'button',
        {
          type: 'button',
          class: 'linkish dm-group__clear',
          onclick: () => {
            query.date = null;
            query.days.clear();
            query.band = null;
            dateInput.value = '';
            search();
          },
        },
        'Any time'
      ),
    ])
  );

  // ── how many ───────────────────────────────────────────────────────────────

  const many = segment('many', 'How many');
  many.node.append(openButton('many'));

  const capacityInput = el('input', {
    type: 'number',
    class: 'dm-capacity__input',
    min: '0',
    step: '5',
    'aria-label': 'At least this many people',
    oninput: () => {
      query.minCapacity = Math.max(0, Number(capacityInput.value) || 0);
      search();
    },
  });

  const capacityChips = CAPACITIES.map((n) =>
    el(
      'button',
      {
        type: 'button',
        class: 'pill pill--capacity',
        'aria-pressed': 'false',
        dataset: { capacity: String(n) },
        onclick: () => {
          query.minCapacity = query.minCapacity === n ? 0 : n;
          capacityInput.value = query.minCapacity || '';
          search();
        },
      },
      `${n}+`
    )
  );

  panels.set(
    'many',
    el('div', { class: 'dm-capacity' }, [
      el('div', { class: 'dm-group__chips', role: 'group', 'aria-label': 'Group size' }, capacityChips),
      el('label', { class: 'dm-capacity__exact' }, [
        'Room for at least ',
        capacityInput,
        ' people',
      ]),
    ])
  );

  // ── filters ────────────────────────────────────────────────────────────────

  const filterPanel = createFilterPanel({ onChange: () => search() });
  const filterCount = el('span', { class: 'dm-seg__badge', hidden: true });
  const filterButton = el(
    'button',
    {
      type: 'button',
      class: 'dm-seg dm-seg--filters',
      'aria-expanded': 'false',
      'aria-haspopup': 'true',
      dataset: { segment: 'filters' },
      onclick: () => setOpen(openSegment === 'filters' ? null : 'filters'),
    },
    [
      icon(FUNNEL_ICON, 'dm-seg__funnel'),
      el('span', { class: 'dm-seg__filters-label', text: 'Filters' }),
      filterCount,
    ]
  );
  panels.set('filters', filterPanel.element);

  bar.append(where.node, when.node, many.node, filterButton);

  // ── opening and closing ────────────────────────────────────────────────────

  function triggerFor(id) {
    if (id === 'where') return whereInput;
    if (id === 'filters') return filterButton;
    return segments.get(id)?.node.querySelector('.dm-seg__open');
  }

  function setOpen(id, { moveFocus = false } = {}) {
    if (openSegment === id) return;
    openSegment = id;

    for (const [key, { node }] of segments) node.classList.toggle('is-open', key === id);
    filterButton.classList.toggle('is-open', id === 'filters');
    for (const key of panels.keys()) {
      triggerFor(key)?.setAttribute('aria-expanded', key === id ? 'true' : 'false');
    }

    popover.hidden = !id;
    popover.textContent = '';
    if (!id) return;

    if (id === 'where') renderSuburbs();
    popover.className = `dm-pop dm-pop--${id}`;
    popover.append(panels.get(id));
    place(id);
    if (moveFocus) popover.querySelector('button, input')?.focus();
  }

  /** The panel hangs under the segment that asked for it, never off the bar. */
  function place(id) {
    const anchor = id === 'filters' ? filterButton : segments.get(id)?.node;
    if (!anchor) return;
    const bounds = bar.getBoundingClientRect();
    const seg = anchor.getBoundingClientRect();
    popover.style.left = '0px';
    const width = popover.getBoundingClientRect().width;
    const left = Math.min(Math.max(seg.left - bounds.left, 0), Math.max(bounds.width - width, 0));
    popover.style.left = `${Math.round(left)}px`;
  }

  // A click anywhere else is an answer too: the panel closes and the search
  // stands as it is. In capture, because the printed layer stops its own
  // pointer events from reaching the world — and so from reaching this.
  document.addEventListener(
    'pointerdown',
    (event) => {
      if (!openSegment || element.contains(event.target)) return;
      setOpen(null);
    },
    { capture: true }
  );

  element.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !openSegment) return;
    event.preventDefault();
    event.stopPropagation();
    const trigger = triggerFor(openSegment);
    setOpen(null);
    trigger?.focus();
  });

  window.addEventListener('resize', () => {
    if (openSegment) place(openSegment);
  });

  // ── what the pill says it is holding ───────────────────────────────────────

  function whenSummary() {
    const band = query.band;
    if (query.mode === 'once' && query.date) {
      return band ? `${prettyDate(query.date)} · ${band.toLowerCase()}` : prettyDate(query.date);
    }
    if (query.mode === 'weekly' && query.days.size > 0) {
      const chosen = DAYS.filter((d) => query.days.has(d.n));
      const days =
        chosen.length > 3
          ? `${chosen.length} days a week`
          : `Every ${chosen.map((d) => d.short).join(', ')}`;
      return band ? `${days} · ${band.toLowerCase()}` : days;
    }
    return band ? `${band}s` : 'Any time';
  }

  function paint() {
    where.node.classList.toggle('is-set', Boolean(query.suburb));
    // Never over the top of someone mid-word.
    if (document.activeElement !== whereInput) whereInput.value = query.suburb ?? '';

    const summary = whenSummary();
    when.value.textContent = summary;
    when.node.classList.toggle('is-set', summary !== 'Any time');
    when.node
      .querySelector('.dm-seg__open')
      ?.setAttribute('aria-label', `When — ${summary}. A date, or the days you meet.`);
    for (const button of modeButtons) {
      const on = button.dataset.mode === query.mode;
      button.classList.toggle('is-on', on);
      button.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    onceRow.hidden = query.mode !== 'once';
    weeklyRow.hidden = query.mode !== 'weekly';
    for (const chip of dayChips) {
      const on = query.days.has(Number(chip.dataset.day));
      chip.classList.toggle('is-on', on);
      chip.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    for (const chip of bandChips) {
      const on = chip.dataset.band === query.band;
      chip.classList.toggle('is-on', on);
      chip.setAttribute('aria-pressed', on ? 'true' : 'false');
    }

    many.value.textContent = query.minCapacity ? `${query.minCapacity}+ people` : 'Any size';
    many.node.classList.toggle('is-set', query.minCapacity > 0);
    many.node
      .querySelector('.dm-seg__open')
      ?.setAttribute(
        'aria-label',
        `How many — ${many.value.textContent}. The smallest space that will hold you.`
      );
    for (const chip of capacityChips) {
      const on = Number(chip.dataset.capacity) === query.minCapacity;
      chip.classList.toggle('is-on', on);
      chip.setAttribute('aria-pressed', on ? 'true' : 'false');
    }

    const filters = filterPanel.count();
    filterCount.textContent = filters ? String(filters) : '';
    filterCount.hidden = filters === 0;
    filterButton.classList.toggle('is-set', filters > 0);
    filterButton.setAttribute(
      'aria-label',
      filters === 0 ? 'Filters' : `Filters — ${filters} chosen`
    );
  }

  paint();
  search();

  return {
    element,
    search,
    isOpen: () => openSegment !== null,
    close: () => {
      const trigger = triggerFor(openSegment);
      setOpen(null);
      trigger?.focus();
    },
  };
}
