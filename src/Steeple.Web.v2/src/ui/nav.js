// The top line of the browse surface: wordmark + breadcrumb, left. Every level
// above the current one is a button that ascends to it.
//
// The wordmark is the way back out of the product altogether — it rolls the
// page back up to the title, and wears a small chevron so that is discoverable
// rather than a secret. Getting back to all the spaces is the breadcrumb's job.

import { state, setView, rollTo } from '../core/bus.js';
import { heldRoom, heldVenue } from '../data/catalog.js';
import { HOME_LABEL } from './copy.js';
import { el, replaceChildren, steepleMark } from './dom.js';

export function createNav() {
  const wordmark = el(
    'button',
    {
      type: 'button',
      class: 'wordmark',
      'aria-label': 'Steeple — roll back up to the top of the page',
      title: 'Back to the top',
      onclick: () => (state.roll > 0 ? rollTo(0) : setView('village')),
    },
    [
      el('span', { class: 'wordmark__up', 'aria-hidden': 'true' }),
      steepleMark(16),
      el('span', { class: 'wordmark__word', text: 'Steeple' }),
    ]
  );

  const trail = el('ol', { class: 'crumbs' });
  const element = el('div', { class: 'nav' }, [
    wordmark,
    el('nav', { class: 'crumbs__nav', 'aria-label': 'Where you are' }, trail),
  ]);

  const hostingLabel = (venue) => (venue ? `Hosting at ${venue.shortName}` : 'Hosting');

  function crumb(label, onSelect, current) {
    const content = current
      ? el('span', { class: 'crumb crumb--current', 'aria-current': 'true', text: label })
      : el('button', { type: 'button', class: 'crumb', onclick: onSelect }, label);
    return el('li', { class: 'crumbs__item' }, [
      content,
      !current && el('span', { class: 'crumbs__sep', 'aria-hidden': 'true', text: '→' }),
    ]);
  }

  function update() {
    const { view, venueId, roomId } = state;
    if (view === 'arrival') return;

    const venue = venueId ? heldVenue(venueId) : null;
    const room = venue && roomId ? heldRoom(venueId, roomId) : null;
    const items = [crumb(HOME_LABEL, () => setView('village'), view === 'village')];

    if (view === 'journal') {
      items.push(crumb('Inbox', null, true));
    } else if (view === 'desk') {
      items.push(crumb(hostingLabel(venue), null, true));
    } else if (view === 'letter') {
      if (state.mode === 'host') {
        items.push(crumb(hostingLabel(venue), () => setView('desk', { venueId }), false));
        items.push(crumb(room ? `Request for ${room.name}` : 'A request', null, true));
      } else {
        items.push(crumb('Inbox', () => setView('journal'), false));
        items.push(
          crumb(venue ? `Request to ${venue.shortName}` : 'Your request', null, true)
        );
      }
    } else {
      if (venue) {
        items.push(
          crumb(
            venue.shortName,
            () => setView('venue', { venueId: venue.id }),
            view === 'venue'
          )
        );
      }
      if (room) {
        items.push(
          crumb(room.name, view === 'apply' ? () => setView('room', { venueId, roomId }) : null, view !== 'apply')
        );
      }
      // The same words the sheet's own eyebrow uses (CONTRACT5 §1.2).
      if (view === 'apply') items.push(crumb('Booking request', null, true));
    }

    replaceChildren(trail, items);
  }

  return {
    element,
    update,
    setOpen(open) {
      element.classList.toggle('is-open', open);
      element.toggleAttribute('inert', !open);
      element.setAttribute('aria-hidden', open ? 'false' : 'true');
    },
  };
}
