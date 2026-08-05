// FILTERING — everything that is a preference rather than a question, folded
// behind the funnel at the end of the search pill.
//
// Three groups, in the order a visitor thinks of them: what the group does,
// what the room has, and who can get into it. Only the first is ever likely to
// be touched, which is exactly why the other two are behind a disclosure.
//
// The vocabularies are steeple's ActivityType / Amenity / AccessibilityFeature
// enums as labels — the same decoding the seed carries. The API publishes no
// vocabulary endpoint, so this list is a compile-time mirror of the server's
// (CONTRACT4 §5).

import { el } from '../dom.js';

export const ACTIVITIES = [
  'Children',
  'Sports',
  'Community',
  'Religious',
  'Arts',
  'Education',
  'Music',
];

const AMENITIES = [
  'Parking',
  'Kitchen',
  'Restrooms',
  'Wi-Fi',
  'Audio/visual',
  'Stage',
  'Piano',
  'Tables',
  'Chairs',
  'Heating',
  'Air conditioning',
];

const ACCESSIBILITY = [
  'Step-free access',
  'Accessible restroom',
  'Accessible parking',
  'Hearing loop',
  'Lift access',
];

const GROUPS = [
  { key: 'activities', label: 'What your group does', options: ACTIVITIES },
  { key: 'amenities', label: 'What the space has', options: AMENITIES },
  { key: 'accessibility', label: 'Getting in and around', options: ACCESSIBILITY },
];

/**
 * The funnel's contents. Owns its three sets, tells the pill whenever one of
 * them changes, and can be told what to hold when the choice was made
 * elsewhere (the bus still lets anything set the activity filters).
 */
export function createFilterPanel({ onChange = () => {} } = {}) {
  const chosen = {
    activities: new Set(),
    amenities: new Set(),
    accessibility: new Set(),
  };
  const chipFor = new Map();

  function toggle(key, option) {
    const set = chosen[key];
    if (set.has(option)) set.delete(option);
    else set.add(option);
    paint();
    onChange();
  }

  const groups = GROUPS.map(({ key, label, options }) =>
    el('section', { class: 'dm-group' }, [
      el('h3', { class: 'eyebrow dm-group__label', text: label }),
      el(
        'div',
        { class: 'dm-group__chips', role: 'group', 'aria-label': label },
        options.map((option) => {
          const chip = el(
            'button',
            {
              type: 'button',
              class: 'pill pill--filter',
              'aria-pressed': 'false',
              dataset: { filter: option },
              onclick: () => toggle(key, option),
            },
            option
          );
          chipFor.set(`${key}:${option}`, chip);
          return chip;
        })
      ),
    ])
  );

  const clear = el(
    'button',
    {
      type: 'button',
      class: 'linkish dm-group__clear',
      onclick: () => {
        clearAll();
        onChange();
      },
    },
    'Clear all'
  );

  const element = el('div', { class: 'dm-filters' }, [...groups, clear]);

  function paint() {
    for (const [id, chip] of chipFor) {
      const [key, option] = id.split(/:(.*)/s);
      const on = chosen[key].has(option);
      chip.classList.toggle('is-on', on);
      chip.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    clear.hidden = count() === 0;
  }

  function count() {
    return chosen.activities.size + chosen.amenities.size + chosen.accessibility.size;
  }

  function clearAll() {
    for (const set of Object.values(chosen)) set.clear();
    paint();
  }

  paint();

  return {
    element,
    count,
    values: () => ({
      activities: [...chosen.activities],
      amenities: [...chosen.amenities],
      accessibility: [...chosen.accessibility],
    }),
    activities: () => chosen.activities,
    /** Adopt an activity set chosen somewhere else, without re-announcing it. */
    setActivities(activities) {
      chosen.activities = new Set(activities);
      paint();
    },
    clearAll,
    focus: () => chipFor.values().next().value?.focus(),
  };
}
