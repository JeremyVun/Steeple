// Two ways of drawing the same village. Switching reloads the page and keeps
// the deep link, so the visitor stays exactly where they were.

import { state, setStyle } from '../core/bus.js';
import { el } from './dom.js';

const STYLES = [
  { id: 'diorama', label: 'Diorama' },
  { id: 'atlas', label: 'Atlas' },
];

export function createStyleSwitcher() {
  const buttons = STYLES.map(({ id, label }) =>
    el(
      'button',
      {
        type: 'button',
        class: `segment${state.style === id ? ' is-on' : ''}`,
        'aria-pressed': state.style === id ? 'true' : 'false',
        onclick: () => setStyle(id),
      },
      label
    )
  );

  const element = el(
    'div',
    { class: 'scenery' },
    el('div', { class: 'segments', role: 'group', 'aria-labelledby': 'scenery-label' }, [
      el('h2', { class: 'eyebrow segments__label', id: 'scenery-label', text: 'Scenery' }),
      ...buttons,
    ])
  );

  return {
    element,
    setOpen(open) {
      element.classList.toggle('is-open', open);
      element.toggleAttribute('inert', !open);
      element.setAttribute('aria-hidden', open ? 'false' : 'true');
    },
  };
}
