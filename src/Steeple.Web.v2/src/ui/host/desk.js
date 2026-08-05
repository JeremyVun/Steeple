// HOSTING — the requests waiting at a church that keeps its doors open, and the
// spaces it lists. Requests still undecided stand up as cards; the ones already
// answered lie down in a list. Two rendering languages share this truth
// (?desk=board | ledger): the board sets each request as a card, the ledger
// sets the same week as a day-book line with the schedule ribbon beside it.

import { placedVenues, setHostVenue } from '../../data/store.js';
import { priceText } from '../copy.js';
import { el, replaceChildren } from '../dom.js';
import {
  STATUS_WORD,
  deskLetters,
  deskVenues,
  fmtDate,
  hoursSummary,
  organizerOf,
  readSchedule,
  roomsOf,
  scheduleLine,
  scheduleOf,
  venueOf,
} from './model.js';
import { createRibbon } from './ribbon.js';

const VERIFIED_LABEL = 'Identity verified (SSO)';
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

function verifiedChip(text = VERIFIED_LABEL, className = 'verified verified--sm') {
  return el('span', { class: className }, [
    el('span', { class: 'verified__dot', 'aria-hidden': 'true' }),
    text,
  ]);
}

export function createDesk({ variant: opening, onOpenLetter, onListing, onVariant, onVenue }) {
  const head = el('header', { class: 'desk__head' });
  const body = el('div', { class: 'desk__body' });
  const foot = el('footer', { class: 'desk__foot' });
  const element = el('section', { class: 'desk', 'aria-label': 'Hosting' }, [head, body, foot]);

  let tab = 'letters';
  let venueId = null;
  // The instrument the same truth is set in. `?desk=` opens on one of them;
  // after that it is a switch on the desk, and changing it costs one render.
  let variant = opening;

  // ── the requests ──────────────────────────────────────────────────────────

  function signalOf(application) {
    const read = readSchedule(application.venueId, application.roomId, scheduleOf(application));
    const note = read.notes[0];
    return { tone: note.tone, text: note.text, read };
  }

  function letterCard(application) {
    const organizer = organizerOf(application);
    const room = venueOf(application.venueId, placedVenues())?.rooms.find(
      (r) => r.id === application.roomId
    );
    const signal = signalOf(application);
    const intent = application.intentText;

    return el(
      'button',
      {
        type: 'button',
        class: 'card',
        dataset: { status: application.status, application: application.id },
        onclick: () => onOpenLetter(application),
      },
      [
        el('span', { class: 'card__status', text: STATUS_WORD[application.status] }),
        el('span', { class: 'card__from', text: organizer.org ?? organizer.name }),
        // The mark is a fact about the person who asked, not a decoration on
        // the card: an organizer steeple has not confirmed does not carry one.
        el('span', {
          class: 'card__who',
          text: organizer.verified
            ? organizer.org
              ? `${organizer.name} · ${VERIFIED_LABEL}`
              : VERIFIED_LABEL
            : organizer.org
              ? organizer.name
              : '',
        }),
        el('span', {
          class: 'card__room',
          text: `${room?.name ?? application.roomId} · ${plural(application.groupSize, 'person', 'people')}`,
        }),
        el('span', { class: 'card__when', text: scheduleLine(application) }),
        el('span', { class: 'card__intent', text: intent }),
        el('span', { class: `card__signal card__signal--${signal.tone}`, text: signal.text }),
      ]
    );
  }

  function ledgerRow(application) {
    const organizer = organizerOf(application);
    const room = venueOf(application.venueId, placedVenues())?.rooms.find(
      (r) => r.id === application.roomId
    );
    const signal = signalOf(application);
    const ribbon = createRibbon({ compact: true });
    ribbon.update({
      venueId: application.venueId,
      roomId: application.roomId,
      proposal: scheduleOf(application),
      exceptApplicationId: application.id,
    });

    return el(
      'button',
      {
        type: 'button',
        class: 'row',
        dataset: { status: application.status, application: application.id },
        onclick: () => onOpenLetter(application),
      },
      [
        el('span', { class: 'row__main' }, [
          el('span', { class: 'row__from', text: organizer.org ?? organizer.name }),
          el('span', {
            class: 'row__room',
            text: `${room?.name ?? application.roomId} · ${plural(
              application.groupSize,
              'person',
              'people'
            )} · ${organizer.name}`,
          }),
          el('span', { class: 'row__when', text: scheduleLine(application) }),
        ]),
        el('span', { class: 'row__ribbon' }, ribbon.element),
        el('span', { class: 'row__side' }, [
          el('span', { class: 'card__status', text: STATUS_WORD[application.status] }),
          el('span', { class: `card__signal card__signal--${signal.tone}`, text: signal.text }),
        ]),
      ]
    );
  }

  function recordRow(application) {
    const organizer = organizerOf(application);
    const room = venueOf(application.venueId, placedVenues())?.rooms.find(
      (r) => r.id === application.roomId
    );
    return el(
      'li',
      { class: 'record__item' },
      el(
        'button',
        {
          type: 'button',
          class: 'record__row',
          dataset: { status: application.status, application: application.id },
          onclick: () => onOpenLetter(application),
        },
        [
          el('span', { class: 'record__who', text: organizer.org ?? organizer.name }),
          el('span', { class: 'record__room', text: room?.name ?? application.roomId }),
          el('span', { class: 'record__when', text: scheduleLine(application) }),
          el('span', {
            class: 'record__status',
            dataset: { status: application.status },
            text: application.decidedAt
              ? `${STATUS_WORD[application.status]} ${fmtDate(application.decidedAt.slice(0, 10))}`
              : STATUS_WORD[application.status],
          }),
        ]
      )
    );
  }

  // ── the spaces ────────────────────────────────────────────────────────────

  function spaceRow(room) {
    const published = room.status === 'published';
    // A room whose publish request steeple has recorded is not a draft the host
    // forgot: it is with a moderator, and nothing more is asked of them.
    const review = !published && Boolean(room.publishRequestedAt);
    // Published in this browser's record while steeple was away: live here,
    // unknown to the service, and the desk should not blur the two.
    const kept = published && room.keptLocally === true;
    const hours = hoursSummary(venueId, room.id);
    return el('li', { class: 'space' }, [
      el('div', { class: 'space__main' }, [
        el('span', { class: 'space__name', text: room.name }),
        el('span', { class: 'space__meta' }, [
          `Seats ${room.capacity} · `,
          el('span', {
            class: `price price--sm${room.pricePerHour == null ? ' price--free' : ''}`,
            text: priceText(room),
          }),
        ]),
        el('span', { class: `space__hours${hours.startsWith('No open') ? ' is-missing' : ''}`, text: hours }),
      ]),
      el('div', { class: 'space__side' }, [
        el('span', {
          class: `tag tag--${kept || review ? 'review' : published ? 'published' : 'draft'}`,
          text: kept ? 'On this device' : published ? 'Published' : review ? 'With Steeple' : 'Draft',
        }),
        el(
          'button',
          {
            type: 'button',
            class: 'pill pill--sm',
            dataset: { room: room.id, action: published || review ? 'edit' : 'finish' },
            onclick: () => onListing({ venueId, roomId: room.id, step: 'describe' }),
          },
          published || review ? 'Edit listing' : 'Finish this listing'
        ),
        el(
          'button',
          {
            type: 'button',
            class: 'pill pill--sm',
            dataset: { room: room.id, action: 'hours' },
            onclick: () => onListing({ venueId, roomId: room.id, step: 'availability' }),
          },
          'Open hours'
        ),
      ]),
    ]);
  }

  // ── the frame ─────────────────────────────────────────────────────────────

  function renderHead(venue, letters) {
    const options = deskVenues(placedVenues());
    const select = el(
      'select',
      {
        class: 'select',
        id: 'desk-venue',
        onchange: (event) => {
          setHostVenue(event.target.value);
          onVenue(event.target.value);
        },
      },
      options.map((option) =>
        el('option', { value: option.id, selected: option.id === venueId }, `${option.shortName}`)
      )
    );

    replaceChildren(head, [
      el('div', { class: 'desk__title' }, [
        el('p', { class: 'eyebrow', text: 'Hosting' }),
        el('h1', { class: 'sheet__title', text: venue?.name ?? 'Your venue' }),
        // A venue wears the mark once steeple has confirmed it — never on the
        // strength of standing on this desk. One newly listed here has not
        // been through the gate yet, and says nothing rather than something
        // untrue.
        el('p', { class: 'desk__address' }, [
          venue?.address ?? '',
          venue?.address && venue?.verified ? el('span', { class: 'desk__dot', text: '·' }) : null,
          venue?.verified ? verifiedChip() : null,
        ]),
      ]),
      el('div', { class: 'desk__switch' }, [
        el('label', { class: 'eyebrow', for: 'desk-venue', text: 'Venue' }),
        select,
      ]),
      el('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Requests and spaces' }, [
        el(
          'button',
          {
            type: 'button',
            class: `tab${tab === 'letters' ? ' is-on' : ''}`,
            role: 'tab',
            'aria-selected': tab === 'letters' ? 'true' : 'false',
            onclick: () => {
              tab = 'letters';
              render();
            },
          },
          `Requests · ${letters.live.length}`
        ),
        el(
          'button',
          {
            type: 'button',
            class: `tab${tab === 'spaces' ? ' is-on' : ''}`,
            role: 'tab',
            'aria-selected': tab === 'spaces' ? 'true' : 'false',
            onclick: () => {
              tab = 'spaces';
              render();
            },
          },
          `Spaces · ${roomsOf(venueId, placedVenues()).length}`
        ),
      ]),
    ]);
  }

  function renderFoot() {
    replaceChildren(foot, [
      el('div', { class: 'desk__variant' }, [
        el('span', { class: 'eyebrow', text: 'Layout' }),
        el('div', { class: 'segments segments--flat' }, [
          el(
            'button',
            {
              type: 'button',
              class: `segment${variant === 'board' ? ' is-on' : ''}`,
              onclick: () => onVariant('board'),
            },
            'Board'
          ),
          el(
            'button',
            {
              type: 'button',
              class: `segment${variant === 'ledger' ? ' is-on' : ''}`,
              onclick: () => onVariant('ledger'),
            },
            'Ledger'
          ),
        ]),
      ]),
      el(
        'button',
        {
          type: 'button',
          class: 'pill',
          onclick: () => onListing({ step: 'place' }),
        },
        'List a space'
      ),
    ]);
  }

  function render() {
    const placed = placedVenues();
    const venue = venueOf(venueId, placed);
    const letters = deskLetters(venueId);
    renderHead(venue, letters);
    renderFoot();

    if (tab === 'spaces') {
      const rooms = roomsOf(venueId, placed);
      replaceChildren(body, [
        el('p', {
          class: 'desk__count',
          text: `${plural(rooms.filter((r) => r.status === 'published').length, 'space is', 'spaces are')} published${
            rooms.some((r) => r.status !== 'published')
              ? `, ${rooms.filter((r) => r.status !== 'published').length} still in draft`
              : ''
          }.`,
        }),
        el('ul', { class: 'spaces' }, rooms.map(spaceRow)),
      ]);
      return;
    }

    const live = letters.live;
    const record = letters.record;
    replaceChildren(body, [
      el('p', {
        class: 'desk__count',
        text: live.length
          ? `${plural(live.length, 'request is', 'requests are')} waiting on an answer.`
          : 'No requests are waiting. Everything already answered is listed below.',
      }),
      live.length
        ? el(
            'div',
            { class: variant === 'ledger' ? 'rows' : 'cards' },
            live.map(variant === 'ledger' ? ledgerRow : letterCard)
          )
        : null,
      record.length
        ? el('section', { class: 'record' }, [
            el('h2', { class: 'eyebrow', text: 'Answered' }),
            el('ul', { class: 'record__list' }, record.map(recordRow)),
          ])
        : null,
    ]);
  }

  return {
    element,
    setVenue(id) {
      venueId = id;
    },
    setTab(next) {
      tab = next;
    },
    setVariant(next) {
      if (next === variant) return;
      variant = next;
      render();
    },
    venueId: () => venueId,
    render,
    spoken() {
      const venue = venueOf(venueId, placedVenues());
      const letters = deskLetters(venueId);
      const lines = letters.live.map((application) => {
        const organizer = organizerOf(application);
        const signal = signalOf(application);
        return `${organizer.org ?? organizer.name}, ${scheduleLine(application)}. ${signal.text}`;
      });
      return `Hosting at ${venue?.name ?? 'this venue'}. ${
        letters.live.length
          ? `${plural(letters.live.length, 'request is', 'requests are')} waiting. ${lines.join(' ')}`
          : 'No requests are waiting.'
      } ${letters.record.length ? `${plural(letters.record.length, 'request', 'requests')} already answered.` : ''}`;
    },
  };
}
