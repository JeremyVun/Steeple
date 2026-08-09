// THE LISTING FLOW — four ways in, one wizard.
//
// A host describes a space here and steeple ends up holding it: the venue, the
// room, its photograph, its open hours, and a request to publish. The local
// store is kept alongside as the village's own record, so the desk goes on
// working whether or not the API answered (CONTRACT6 §3).
//
// What is being written decides which steps there are, and `open()` reads that
// off its arguments — a venue and a room is an edit, a venue alone is another
// space at it, neither is a venue nobody has listed yet:
//
//   venue       {}                      Place · Describe · Availability · Publish
//   add-room    {venueId}               Describe · Availability · Publish
//   room        {venueId, roomId}       Describe · Availability · Publish
//   venue-edit  {venueId, entry}        the Place form alone, over PATCH
//
// There was a Verify step between Place and Describe until 2026-08-06. Hosting
// cannot be entered without a session — "I have space to share" signs somebody
// in first — so it confirmed a fact nobody had disputed, and its only real work
// was catching a session that died mid-flow. That is now the Publish step's own
// blocker, which opens the one sign-in panel there is (`askToSignIn`). The
// host's name is public on the listing, so Publish says whose it will be.
//
// Three rules run through the whole file.
//
// Nothing is offered that the rules forbid. Publishing needs open hours, a
// photograph, an hourly price and a session; while any of those is missing the
// publish button is not merely refused when pressed — it is disabled, and the
// step says what is left and takes you to it. The old flow offered the button
// regardless and answered a press by sending the host back to Availability,
// which is how a rule became a bounce.
//
// What is shown after a write is what the service said. A room the moderation
// gate holds back comes back from the API as a draft with a publish request
// against it, and that is what the host reads: with a moderator, not live, and
// not pretended live either.
//
// Nothing is asked for twice. Reopened, a listing already published or already
// with a moderator reads as a statement and its button is the way out — it
// carries anything typed since and asks for nothing, and a stage with nothing
// new to say never touches the wire. Until 2026-08-07 the footer went on
// offering "Publish this space" under "has been sent for review", and the press
// re-sent hours, room and ask that steeple already held.

import {
  addBlackout,
  adoptRoomSlug,
  adoptVenueSlug,
  blackoutsFor,
  editRoom,
  effectiveRoom,
  openHoursFor,
  placedVenues,
  removeBlackout,
  setHostVenue,
  todayIso,
  upsertPlacedVenue,
} from '../../data/store.js';
import { track } from '../../data/analytics.js';
import { prepareRoomPhoto } from '../../data/photo.js';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

import { ACTIVITY_TYPES, CENTER } from '../../data/venues.js';
import {
  ACCESS_LABELS,
  ACTIVITY_LABELS,
  AMENITY_LABELS,
  toLabels,
} from '../../data/vocabulary.js';
import { VERIFIED_LABEL } from '../copy.js';
import { el, replaceChildren } from '../dom.js';
import * as manage from './manage.js';
import {
  ACCESS_VOCABULARY,
  AMENITY_VOCABULARY,
  fmtDate,
  hoursSummary,
  venueOf,
} from './model.js';
import { createHoursPainter } from './painter.js';

const STEP_LABEL = {
  place: 'Place',
  describe: 'Describe',
  availability: 'Availability',
  publish: 'Publish',
};

// Each way in has its own steps, and the rail draws those and no others: a
// numbered step you can never reach is a promise the flow does not keep.
const FLOWS = {
  venue: ['place', 'describe', 'availability', 'publish'],
  'add-room': ['describe', 'availability', 'publish'],
  room: ['describe', 'availability', 'publish'],
  'venue-edit': ['place'],
};

// The head over the rail, per way in. The add-room title names the venue,
// because "a space" on its own is the one thing this step must not be vague
// about \u2014 the host has one venue in mind and the flow is bound to it.
const HEAD = {
  venue: {
    eyebrow: 'List a space',
    title: (venue, _rooms, at = 'place') =>
      at === 'place' ? 'Tell us about the venue' : `Add a space at ${venue}`,
  },
  'add-room': {
    eyebrow: 'Add a space',
    title: (venue, rooms) =>
      rooms > 0 ? `Another space at ${venue}` : `A space at ${venue}`,
  },
  room: { eyebrow: 'Edit this listing', title: (venue) => `A space at ${venue}` },
  'venue-edit': { eyebrow: 'Venue details', title: (venue) => venue },
};

const slugify = (text) =>
  String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);

// Only ever a guess, and only until steeple answers the create with the slug it
// minted — at which point `adoptVenueSlug` makes that the id here.
const venueSlug = (text) => `placed-${slugify(text) || 'church'}`;

/** Strip what discovery said about a draft from what the host is now writing. */
const withoutDraftNote = (text) =>
  text
    .replace(/\s*\(coming soon\)/i, '')
    .replace(/\s*Listing is being prepared[^.]*\./i, '')
    .trim();

/** '120 Maple Avenue East, Vienna 22180' as the API's three fields. */
function splitAddress(address = '', suburb = '') {
  const parts = String(address).split(',');
  const tail = parts.length > 1 ? parts.pop().trim() : '';
  const zip = /(\d{5})\s*$/.exec(tail)?.[1] ?? '';
  return {
    addressLine: parts.join(',').trim() || String(address).trim(),
    suburb: suburb || tail.replace(zip, '').trim(),
    postcode: zip,
  };
}

/**
 * '400 S Maple Ave, Falls Church, VA, United States' read for the API's three
 * fields: the street is the first segment, the locality the second, and a ZIP
 * is taken from anywhere in the label when one is printed there.
 */
function partsFromLabel(label) {
  const bits = String(label)
    .split(',')
    .map((bit) => bit.trim())
    .filter(Boolean);
  return {
    addressLine: bits[0] ?? String(label).trim(),
    suburb: (bits[1] ?? '').replace(/\b\d{5}(?:-\d{4})?\b/, '').trim(),
    postcode: /\b(\d{5})(?:-\d{4})?\b/.exec(String(label))?.[1] ?? '',
  };
}

// The teardrop of the design system, at minimap size: the marker on the real
// map, and — faint — the ghost that holds the map's ground before there is one.
const PIN_SVG =
  '<svg viewBox="0 0 30 38" width="30" height="38" aria-hidden="true" focusable="false">' +
  '<path class="minimap__pin-body" d="M15 37.4C15 37.4 27.6 21.9 27.6 13.4 27.6 6.5 22 1 15 1S2.4 6.5 2.4 13.4C2.4 21.9 15 37.4 15 37.4Z"/>' +
  '<circle class="minimap__pin-eye" cx="15" cy="13.3" r="4.6"/></svg>';

/** The empty frame's own mark: a picture, drawn in the line the paper uses. */
const PHOTO_SVG =
  '<svg viewBox="0 0 44 32" width="44" height="32" aria-hidden="true" focusable="false">' +
  '<rect class="shotpick__mark-line" x="1" y="1" width="42" height="30" rx="4.5"/>' +
  '<circle class="shotpick__mark-line" cx="13" cy="11" r="3.4"/>' +
  '<path class="shotpick__mark-line" d="M3.5 27.5 16 15.5l7.5 7 6-5 11 10"/></svg>';

const oneLineAddress = (venue) =>
  [venue.addressLine, [venue.suburb, venue.postcode].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(', ');

function labelled(label, control, hint) {
  return el('div', { class: 'field' }, [
    el('label', { class: 'eyebrow', for: control.id, text: label }),
    control,
    hint ? el('p', { class: 'field__hint', text: hint }) : null,
  ]);
}

/**
 * A field chosen from a vocabulary rather than typed into: the name at the
 * left, the choices beside it, so three of them read as one aligned block
 * instead of three ragged stacks.
 */
function chosen(label, controls, extra = '') {
  return el('div', { class: `chosen${extra ? ` ${extra}` : ''}` }, [
    el('p', { class: 'eyebrow chosen__label', text: label }),
    el('div', { class: 'chosen__value' }, controls.filter(Boolean)),
  ]);
}

function toggleSet(name, options, selected, onToggle) {
  return el(
    'div',
    { class: 'toggles', role: 'group', 'aria-label': name },
    options.map((option) =>
      el(
        'button',
        {
          type: 'button',
          class: `chip chip--toggle${selected.has(option) ? ' is-on' : ''}`,
          'aria-pressed': selected.has(option) ? 'true' : 'false',
          dataset: { value: option },
          onclick: (event) => {
            const on = !selected.has(option);
            if (on) selected.add(option);
            else selected.delete(option);
            event.currentTarget.classList.toggle('is-on', on);
            event.currentTarget.setAttribute('aria-pressed', on ? 'true' : 'false');
            onToggle?.();
          },
        },
        option
      )
    )
  );
}

export function createListingFlow({ announce, onChanged, onClose, askToSignIn }) {
  const rail = el('ol', { class: 'steps' });
  const body = el('div', { class: 'listing__body' });
  const foot = el('footer', { class: 'listing__foot' });
  const eyebrow = el('p', { class: 'eyebrow', text: HEAD.venue.eyebrow });
  const title = el('h1', {
    class: 'sheet__title',
    id: 'listing-title',
    text: HEAD.venue.title(),
  });
  const sheet = el(
    'section',
    {
      class: 'listing',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': 'listing-title',
      tabindex: '-1',
    },
    [el('header', { class: 'listing__head' }, [eyebrow, title, rail]), body, foot]
  );
  const element = el('div', { class: 'listing__layer', hidden: true }, sheet);

  const painter = createHoursPainter({ announce });
  painter.onChange(() => {
    onChanged?.();
    if (step === 'availability') renderFoot();
  });

  // Signing in happens inside the sign-in panel, which knows nothing of this
  // flow's footer. Without this the way forward stays greyed out behind a
  // session that already exists — and the Publish step's own list of what is
  // missing would go on naming a session that is now here.
  manage.onSession(() => {
    if (element.hidden || !draft) return;
    if (manage.signedIn()) draft.offline = null;
    renderBody();
  });

  let step = 'place';
  let draft = null;
  let done = new Set();
  let busy = false;
  let notice = null;
  let outcome = null;

  const say = (text, tone = 'plain', action = null) => {
    notice = text ? { text, tone, action } : null;
  };

  // ── talking to steeple ────────────────────────────────────────────────────
  //
  // Each stage is skipped when it has already succeeded, so the same sequence
  // serves a step's own advance and the final publish: whatever the API missed
  // earlier — because it was down, or because the host was not signed in yet —
  // is caught up before the publish request is made.

  /** True while this listing can only ever be local: one of the village's own. */
  const localOnly = () => draft.localOnly;

  /**
   * Whether there is anything to carry. `draft.sent` is what steeple last
   * answered with (a read that landed, or a save it accepted); with no answer to
   * measure against, an edit cannot be ruled out and the write goes as it always
   * did. `draft.sentHours` is the same fact about the hours.
   */
  const roomChanged = () =>
    !draft.sent || JSON.stringify(seedSnapshot(draft.room)) !== JSON.stringify(draft.sent);
  const unsentPhoto = () => Boolean(draft.room?.photo?.file && !draft.room.photo.sent);
  const hoursSnapshot = () =>
    JSON.stringify([
      openHoursFor(draft.venueId, draft.roomId),
      blackoutsFor(draft.venueId, draft.roomId),
    ]);

  /** Whether steeple is a party to this listing at all, right now. */
  const withSteeple = () => !draft.localOnly && draft.offline !== true;

  /**
   * The local record's own id. Two venues can honestly carry one name, and a
   * slug that repeats does not make a second record — it overwrites the first,
   * taking its address, its rooms and its place at steeple with it.
   */
  function freeVenueId(name) {
    const base = venueSlug(name);
    const taken = new Set(placedVenues().map((v) => v.id));
    if (!taken.has(base)) return base;
    for (let n = 2; ; n += 1) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
  }

  /**
   * The same, for a space. A venue holds more than one, two of them can honestly
   * carry one name, and the store keys a room's open hours, its closed days and
   * its edits by `venue/room` — so a repeated id is not a second space, it is
   * the first one overwritten. This used to be the constant 'main-space'.
   */
  function freeRoomId(venueId, name) {
    const base = slugify(name) || 'space';
    const taken = new Set(roomsHere(venueId).map((r) => r.id));
    if (!taken.has(base)) return base;
    for (let n = 2; ; n += 1) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
  }

  const roomsHere = (venueId) => venueOf(venueId, placedVenues())?.rooms ?? [];

  /**
   * The venue's rooms with this draft's own among them.
   *
   * Written as `[thisRoom]` — as it was while a venue could only ever have one —
   * every other space at the venue vanishes from the desk the moment the venue
   * is saved again, taking its hours and its published state with it.
   */
  function roomsAfter(venueId) {
    const room = {
      id: draft.roomId,
      name: draft.room.name,
      description: draft.room.description,
      capacity: draft.room.capacity,
      pricePerHour: localPrice(),
      houseRules: draft.room.houseRules,
      status: 'draft',
      amenities: [...draft.room.amenities],
      accessibility: [...draft.room.accessibility],
      activities: [...draft.room.activities],
    };
    const rooms = [...roomsHere(venueId)];
    const at = rooms.findIndex((r) => r.id === room.id);
    if (at < 0) return [...rooms, room];
    // A room already here keeps what steeple said about it — its remote id, its
    // status, the photograph it was published with; the draft only overwrites
    // the fields the host has been typing into.
    rooms[at] = { ...rooms[at], ...room, status: rooms[at].status ?? room.status };
    return rooms;
  }

  function mirrorVenue(remote = null) {
    const id = draft.venueId ?? freeVenueId(draft.venue.name);
    draft.venueId = id;
    if (draft.room) draft.roomId ??= freeRoomId(id, draft.room.name);
    upsertPlacedVenue({
      id,
      remoteId: remote?.id ?? draft.remote.venueId ?? null,
      name: draft.venue.name.trim(),
      shortName: draft.venue.name.trim().split(/\s+/).slice(0, 2).join(' '),
      description: draft.venue.description.trim(),
      address: oneLineAddress(draft.venue),
      suburb: draft.venue.suburb.trim() || 'Placed by you',
      // Where it stands is steeple's answer, not this browser's guess. Until
      // the API has one, the village centre stands in.
      lat: remote?.latitude ?? draft.remote.position?.lat ?? CENTER.lat,
      lng: remote?.longitude ?? draft.remote.position?.lng ?? CENTER.lng,
      // The mark is steeple's to give. Its own answer wins over the session
      // this browser is holding, which proves only that somebody is signed in.
      verified: remote ? remote.isIdentityVerified === true : draft.verified,
      // A draft with no room of its own — the venue editor — is editing the
      // venue and nothing else. `upsertPlacedVenue` leaves out what is not named.
      ...(draft.room ? { rooms: roomsAfter(id) } : {}),
    });
    setHostVenue(id);
  }

  async function pushVenue() {
    if (localOnly() || !manage.signedIn()) return { ok: true, skipped: true };
    // A way in with no Place step never touched the venue, so it has nothing to
    // say about one. A PATCH from here would be an edit nobody made — and
    // steeple stamps those (ProviderEditedAtUtc).
    if (!steps().includes('place') && draft.remote.venueId) return { ok: true, skipped: true };
    const fresh = !draft.remote.venueId;
    // An address typed by hand rather than picked carries its locality inside
    // the one line; the parts steeple keeps are read from it rather than asked
    // for again — the form stopped asking for suburb and ZIP (2026-08-07).
    if (!draft.venue.suburb.trim()) {
      const parts = splitAddress(draft.venue.addressLine);
      draft.venue.addressLine = parts.addressLine;
      draft.venue.suburb = parts.suburb;
      draft.venue.postcode = draft.venue.postcode.trim() || parts.postcode;
    }
    const answer = await manage.saveVenue(draft);
    if (answer.ok) {
      draft.remote.venueId = answer.value.id;
      draft.remote.position = { lat: answer.value.latitude, lng: answer.value.longitude };
      // steeple named it; this browser only guessed. Everything already written
      // under the guess travels to the real slug before anything else is said
      // about the venue — including the desk's own re-read, which drops a
      // second record of one venue and would take the draft's rooms with it.
      if (adoptVenueSlug(draft.venueId, answer.value.slug).ok) {
        draft.venueId = answer.value.slug ?? draft.venueId;
      }
      mirrorVenue(answer.value);
      onChanged?.();
      // The pin is gone because this is the answer to it: steeple read the
      // address and put the venue somewhere, and the host is told where.
      if (fresh) {
        say(`${answer.value.name} is on the map.`, 'quiet');
      }
    }
    return answer;
  }

  async function pushRoom() {
    if (localOnly() || !draft.remote.venueId) return { ok: true, skipped: true };
    // A room at steeple carries an hourly price by definition. Describe never
    // asks for one — Publish does, and says so in blockers() — so sending the
    // room before there is a price only collects a refusal on a step that did
    // not ask the question, which is a wall rather than a rule.
    if (!hasPrice(draft.room.pricePerHour)) return { ok: true, skipped: true };
    // An edit nobody made is still an edit at steeple: a live listing PATCHed
    // with what it already says is stamped for the operator's review feed
    // (ProviderEditedAtUtc). The same rule pushVenue keeps for a flow with no
    // Place step. Unknown counts as changed — only a proven no-op is skipped.
    if (draft.remote.roomId && !roomChanged() && !unsentPhoto()) {
      return { ok: true, skipped: true };
    }
    // Never PATCH an existing room from the summary's blanks: the full room
    // must have been read (and folded into this draft) at least once, or the
    // save would send fabricated empties back as if the host had cleared them.
    if (draft.remote.roomId && !draft.hydrated) {
      const primed = await hydrateRoom();
      if (!primed.ok) return primed;
    }
    const answer = await manage.saveRoom(draft);
    if (!answer.ok) return answer;
    draft.remote.roomId = answer.value.id;
    draft.hydrated = true; // the answer is the full room — nothing left unread
    draft.sent = seedSnapshot(draft.room); // what steeple now holds, to measure the next edit by
    if (adoptRoomSlug(draft.venueId, draft.roomId, answer.value.slug).ok) {
      draft.roomId = answer.value.slug ?? draft.roomId;
    }
    editRoom(draft.venueId, draft.roomId, {}, answer.value);
    if (draft.room.photo?.file && !draft.room.photo.sent) {
      const photo = await manage.savePhoto(draft);
      if (!photo.ok) return photo;
      draft.room.photo.sent = true;
      draft.room.photo.remoteUrl = photo.value?.cardUrl ?? null;
      editRoom(draft.venueId, draft.roomId, { photo: draft.room.photo.remoteUrl });
    }
    onChanged?.();
    return answer;
  }

  async function pushHours() {
    if (localOnly() || !draft.remote.roomId) return { ok: true, skipped: true };
    // This stage is a replace-all, so hours nobody painted are not re-sent: the
    // press that leaves an already-listed space would otherwise write the same
    // rules over themselves, and fail on a session that has quietly gone.
    const painted = hoursSnapshot();
    if (painted === draft.sentHours) return { ok: true, skipped: true };
    const answer = await manage.saveHours(
      draft,
      openHoursFor(draft.venueId, draft.roomId),
      blackoutsFor(draft.venueId, draft.roomId),
      todayIso()
    );
    if (answer.ok) draft.sentHours = painted;
    return answer;
  }

  /**
   * Everything steeple has not been told yet, in the order it will accept it.
   * Stops at the first answer that is not a yes and hands it back whole.
   */
  async function pushEverything() {
    for (const stage of [pushVenue, pushRoom, pushHours]) {
      const answer = await stage();
      if (!answer.ok) return answer;
    }
    return { ok: true };
  }

  /** A refusal in the host's reading, with the way to the field that fixes it. */
  function reportProblem(answer) {
    if (answer.reach === 'offline') {
      say('Steeple could not be reached. What you have written is kept here.', 'quiet');
      return;
    }
    // Not the same as away: this browser stopped waiting, and the write may be
    // finishing at steeple. Nothing is promised "kept here" over a maybe, and the
    // way on is to send it again — the idempotency key makes that free (D8).
    if (answer.reach === 'slow') {
      say(answer.detail, 'quiet');
      return;
    }
    if (answer.reach === 'signin') {
      // The one sign-in there is, opened over this flow. Nothing written here is
      // lost by it: the draft is on the page and in the store behind it.
      say('Sign in before this can be sent to Steeple.', 'warn', {
        label: 'Sign in',
        act: () => askToSignIn?.(),
      });
      return;
    }
    // Where the field that offends lives, and what the way there is called.
    const WHERE = {
      invalid_venue: { step: 'place', label: 'Edit the venue' },
      geofence_rejected: { step: 'place', label: 'Edit the address' },
      invalid_room: { step: 'describe', label: 'Edit the space' },
    };
    const at = WHERE[answer.code];
    say(answer.detail, 'warn', at && at.step !== step ? at : null);
  }

  // ── steps ─────────────────────────────────────────────────────────────────

  function placeStep() {
    const editing = draft.entry === 'venue-edit';
    const field = (id, key, label, placeholder, type = 'text') => {
      const input = el('input', {
        class: 'input',
        id,
        type,
        value: draft.venue[key],
        placeholder,
        oninput: (event) => {
          draft.venue[key] = event.target.value;
          renderFoot();
        },
      });
      return labelled(label, input);
    };

    const description = el('textarea', {
      class: 'input input--area',
      id: 'place-description',
      rows: '4',
      placeholder: 'A hall with two meeting rooms, a short walk from the shops.',
      oninput: (event) => {
        draft.venue.description = event.target.value;
        renderFoot();
      },
    });
    description.value = draft.venue.description;

    // Where the venue stands, redrawn on its own. A suggestion picked answers
    // the address field's own question, so it must not cost the host the caret
    // they are typing with — only this much of the step is drawn again.
    const mark = el('div', { class: 'place__mark' });
    // The map alone, as big as the column: it is the confirmation, and needs
    // no caption to say so. Its ground is reserved from the first frame — a
    // quiet framed slot with a ghost of the pin — so the sheet never changes
    // size and no field moves when the real map arrives.
    const drawMark = () => {
      const at = placeMark();
      replaceChildren(mark, [
        at ? miniMap(at.at) : ghostSlot(),
      ]);
    };
    drawMark();

    // The street address suggests as it is typed. Steeple asks once the input
    // could mean somewhere (three characters), 300ms after the last keystroke,
    // and a suggestion picked fills all three address fields with parts the
    // provider resolved — an address chosen here is one that geocodes.
    function addressField() {
      let items = [];
      let active = -1;
      let timer = 0;
      let asking = null;

      const list = el('ul', { class: 'suggest', id: 'place-address-suggest', role: 'listbox' });
      list.hidden = true;
      // Steeple being asked, said inside the field's own right edge: the room
      // for it is reserved whether or not it shows, so nothing moves, and the
      // CSS holds it back a quarter-second so a fast answer never flickers one.
      const waitMark = el('span', { class: 'suggest__busy', 'aria-hidden': 'true' });
      const input = el('input', {
        class: 'input',
        id: 'place-address',
        type: 'text',
        value: draft.venue.addressLine,
        placeholder: '400 Maple Avenue West',
        autocomplete: 'off',
        role: 'combobox',
        'aria-expanded': 'false',
        'aria-autocomplete': 'list',
        'aria-controls': 'place-address-suggest',
        oninput: (event) => {
          draft.venue.addressLine = event.target.value;
          // The preview belongs to the address that was picked. A line edited by
          // hand afterwards is an address nobody has resolved, so the preview
          // goes with it rather than standing under a different address.
          if (draft.picked) {
            draft.picked = null;
            drawMark();
          }
          renderFoot();
          ask(event.target.value);
        },
        onkeydown: (event) => {
          if (list.hidden) return;
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            const step = event.key === 'ArrowDown' ? 1 : -1;
            active = (active + step + items.length) % items.length;
            draw();
          } else if (event.key === 'Enter' && active >= 0) {
            event.preventDefault();
            pick(items[active]);
          } else if (event.key === 'Escape') {
            // With the list open, Escape is the list's alone — the sheet
            // underneath must not read the same press as "leave the flow".
            event.stopPropagation();
            close();
          }
        },
        // Delayed so a mousedown on a suggestion still lands before the list goes.
        onblur: () => setTimeout(close, 150),
      });

      // Closed means nothing is coming: a question still in flight would
      // otherwise answer after the press that dismissed it and open the list
      // again, over a host who had moved on.
      function close() {
        clearTimeout(timer);
        asking?.abort();
        waiting(false);
        items = [];
        active = -1;
        draw();
      }

      function waiting(on) {
        waitMark.classList.toggle('is-on', on);
        input.setAttribute('aria-busy', String(on));
      }

      // The list is fixed to the viewport rather than laid into the sheet: an
      // absolutely-positioned box still counts toward a scroll ancestor's
      // scrollable overflow, so laying it in would grow the sheet's scrollbar
      // the moment suggestions appear. A scroll anywhere would desync a fixed
      // box from its field, so it closes the list instead.
      function place() {
        const at = input.getBoundingClientRect();
        list.style.top = `${at.bottom + 4}px`;
        list.style.left = `${at.left}px`;
        list.style.width = `${at.width}px`;
      }

      const onScroll = (event) => {
        if (!list.contains(event.target)) close();
      };

      function draw() {
        const opening = list.hidden && items.length > 0;
        const closing = !list.hidden && items.length === 0;
        list.hidden = items.length === 0;
        input.setAttribute('aria-expanded', String(!list.hidden));
        if (opening) {
          place();
          window.addEventListener('scroll', onScroll, true);
        }
        if (closing) window.removeEventListener('scroll', onScroll, true);
        replaceChildren(
          list,
          items.map((s, i) =>
            el(
              'li',
              {
                class: `suggest__item${i === active ? ' suggest__item--active' : ''}`,
                role: 'option',
                'aria-selected': String(i === active),
                onmousedown: (event) => {
                  event.preventDefault();
                  pick(s);
                },
              },
              [el('span', { text: s.label })]
            )
          )
        );
      }

      function pick(s) {
        // The provider breaks the address into parts when it can; when it only
        // gives the label, the label is read for them. Either way the host is
        // never asked to retype what they just picked.
        const parts = partsFromLabel(s.label);
        draft.venue.addressLine = s.addressLine ?? parts.addressLine;
        draft.venue.suburb = s.suburb ?? parts.suburb;
        draft.venue.postcode = s.postcode ?? parts.postcode;
        // The field keeps the whole label that was picked: a line cut to the
        // street alone reads as information thrown away, and no longer says
        // *which* Maple Avenue was chosen.
        input.value = s.label;
        // The provider resolved this suggestion to a coordinate before offering
        // it, so where the address falls can be shown at once. It is the
        // provider's reading and not steeple's answer — `placeMark` keeps the
        // two apart, and nothing here is sent or stored as a position.
        draft.picked =
          Number.isFinite(s.latitude) && Number.isFinite(s.longitude)
            ? { lat: s.latitude, lng: s.longitude }
            : null;
        track('address_suggestion_picked', {});
        close();
        drawMark();
        renderFoot();
      }

      function ask(text) {
        clearTimeout(timer);
        asking?.abort();
        waiting(false);
        const q = text.trim();
        if (q.length < 3) {
          close();
          return;
        }
        timer = setTimeout(async () => {
          asking = new AbortController();
          waiting(true);
          const got = await manage.suggestAddresses(q, { signal: asking.signal });
          // The field may have moved on while steeple was answering — and if it
          // has, a newer question is the one being waited on, not this one.
          if (input.value.trim() !== q) return;
          waiting(false);
          items = got;
          active = -1;
          draw();
        }, 300);
      }

      return labelled(
        'Street address',
        el('div', { class: 'suggest__anchor' }, [input, waitMark, list])
      );
    }

    return [
      el('p', {
        class: 'prose',
        text: editing
          ? // The rename that cannot break a link: steeple derives a listing's
            // address from the name once, when it is created, and never again.
            'What groups read about the venue. Renaming it never changes its web address, and a new street address is put back on the map.'
          : 'A venue is the building or location where your spaces are. Add its details and address first; next, you’ll describe the room or space groups can hire.',
      }),
      noticeBlock(),
      // Two kinds of question, so two columns — the same reading as Describe.
      // What groups read about the venue stands at the left, where the venue is
      // stands at the right with the map under it. As one stack, a venue name
      // was given the same long line as a paragraph about the place.
      el('div', { class: 'place' }, [
        el('div', { class: 'place__words' }, [
          field('place-name', 'name', 'Venue name', 'St Andrew’s Church'),
          addressField(),
          labelled('About the venue', description),
        ]),
        el('div', { class: 'place__where' }, [mark]),
      ]),
    ];
  }

  /** Steeple's own answer for where the venue stands, when it has given one. */
  const savedMark = () =>
    draft.remote.position ? { at: draft.remote.position, sure: true } : null;

  /**
   * What the Place step can honestly draw. Steeple's answer whenever there is
   * one — it is what the map is showing the world. Failing that, the coordinate
   * the provider attached to the suggestion the host picked, which is a preview
   * of where that address falls and is never called more than that. An address
   * typed and left unpicked has no coordinate at all, and is not guessed at.
   */
  const placeMark = () => savedMark() ?? (draft.picked ? { at: draft.picked, sure: false } : null);

  /**
   * The real map, small: the same OpenStreetMap tiles the discovery surface
   * runs, framed on the coordinate, with the teardrop of the design system on
   * the spot. Still — it confirms a place, it is not for browsing. Leaflet can
   * only size itself once the element is laid out, so the map is raised a frame
   * after the block lands in the document.
   */
  /** The map's reserved ground before an address has been picked. */
  function ghostSlot() {
    const ghost = el('span', { class: 'minimap__ghost' });
    ghost.innerHTML = PIN_SVG; // static markup, no data in it
    return el('div', { class: 'minimap minimap--waiting', 'aria-hidden': 'true' }, [ghost]);
  }

  function miniMap(at) {
    const element = el('div', { class: 'minimap', 'aria-hidden': 'true' });
    requestAnimationFrame(() => {
      if (!element.isConnected) return;
      const map = L.map(element, {
        zoomControl: false,
        attributionControl: true,
        dragging: false,
        scrollWheelZoom: false,
        doubleClickZoom: false,
        boxZoom: false,
        keyboard: false,
        touchZoom: false,
        inertia: false,
      });
      map.attributionControl.setPrefix('');
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap contributors',
        className: 'minimap__tiles',
      }).addTo(map);
      map.setView([at.lat, at.lng], 15);
      L.marker([at.lat, at.lng], {
        interactive: false,
        keyboard: false,
        icon: L.divIcon({
          className: 'minimap__pin',
          html: PIN_SVG,
          iconSize: [30, 38],
          iconAnchor: [15, 38],
        }),
      }).addTo(map);
    });
    return element;
  }

  /** Where the venue stands, once somebody can say. Quiet, and only then. */
  function placedBlock(mark = savedMark()) {
    if (!mark) return null;
    const { at, sure } = mark;
    return el('section', { class: `placed${sure ? '' : ' placed--soft'}` }, [
      miniMap(at),
      el('div', { class: 'placed__words' }, [
        el('p', { class: 'eyebrow', text: 'On the map' }),
        el('p', {
          class: 'prose prose--sm',
          text: sure
            ? 'This is where groups browsing the map will find the venue.'
            : 'Where the address you picked sits. Check the pin looks right before you continue.',
        }),
      ]),
    ]);
  }

  function describeStep() {
    const room = draft.room;
    const amenities = new Set(room.amenities);
    const access = new Set(room.accessibility);
    const activities = new Set(room.activities);
    draft.sets = { amenities, access, activities };

    const name = el('input', {
      class: 'input',
      id: 'room-name',
      type: 'text',
      value: room.name,
      placeholder: 'Main space',
      oninput: (event) => {
        room.name = event.target.value;
        renderFoot();
      },
    });
    const description = el('textarea', {
      class: 'input input--area',
      id: 'room-description',
      rows: '3',
      placeholder: 'A bright hall with a stage, a kitchen through the side door, and chairs for eighty.',
      oninput: (event) => {
        room.description = event.target.value;
        renderFoot();
      },
    });
    description.value = room.description ?? '';

    const capacity = el('input', {
      class: 'input input--num',
      id: 'room-capacity',
      type: 'number',
      min: '1',
      value: String(room.capacity ?? ''),
      oninput: (event) => {
        room.capacity = Number(event.target.value);
        renderFoot();
      },
    });

    // One number. Zero reads as Free, in sage, as it does everywhere else —
    // and says plainly that a free space is not something steeple can publish.
    const priceNote = el('p', { class: 'field__hint' });
    const priceWord = el('span', { class: 'price price--sm' });
    const price = el('input', {
      class: 'input input--num',
      id: 'room-price',
      type: 'number',
      min: '0',
      step: '1',
      value: room.pricePerHour == null ? '' : String(room.pricePerHour),
      oninput: (event) => {
        room.pricePerHour = event.target.value === '' ? null : Number(event.target.value);
        drawPrice();
        renderFoot();
      },
    });

    function drawPrice() {
      const free = isFree(room.pricePerHour);
      priceWord.textContent = free ? 'Free' : '';
      priceWord.classList.toggle('price--free', free);
      priceNote.textContent = free && withSteeple() ? FREE_NOTE : '';
      priceWord.hidden = !free;
    }
    drawPrice();

    const rules = el('textarea', {
      class: 'input input--area',
      id: 'room-rules',
      rows: '2',
      placeholder: 'No alcohol. Chairs stacked at the end.',
      oninput: (event) => {
        room.houseRules = event.target.value;
      },
    });
    rules.value = room.houseRules ?? '';

    // Two kinds of question, so two shapes. What the host writes about the room
    // stands in a column of its own; what steeple needs to show it — the
    // photograph, the seats, the hourly price — stands beside it; and the three
    // vocabularies are chosen from underneath, on one aligned ledger. The step
    // used to be a single tall stack that no window could hold at once.
    return [
      noticeBlock(),
      el('div', { class: 'describe' }, [
        el('div', { class: 'describe__words' }, [
          labelled('Name', name),
          labelled('Description', description),
          labelled('House rules', rules),
        ]),
        el('div', { class: 'describe__facts' }, [
          photoField(),
          el('div', { class: 'describe__nums' }, [
            labelled('Capacity', capacity),
            el('div', { class: 'field' }, [
              el('label', { class: 'eyebrow', for: 'room-price', text: 'Price' }),
              el('div', { class: 'field__inline' }, [
                el('span', { class: 'field__prefix', text: '$' }),
                price,
                el('span', { class: 'field__suffix', text: 'per hour' }),
                priceWord,
              ]),
              priceNote,
            ]),
          ]),
        ]),
      ]),
      el('div', { class: 'chosens' }, [
        chosen('Amenities', [toggleSet('Amenities', AMENITY_VOCABULARY, amenities)]),
        chosen('Accessibility', [toggleSet('Accessibility features', ACCESS_VOCABULARY, access)]),
        welcomeField(activities),
      ]),
    ];
  }

  /**
   * The photograph steeple will not publish a space without — shown as the one
   * thing it is, a picture of the room, at the size a picture deserves. The
   * frame is the control: the file input lies over it, so a click anywhere
   * opens the picker and a chosen photograph fills the frame it will be seen
   * in rather than being named in a filename. It is also the step's give — the
   * frame takes whatever height the written column leaves, so the picture is as
   * large as the step can afford and nothing stands empty under it.
   */
  function photoField() {
    const tile = el('label', { class: 'shotpick', for: 'room-photo' });
    const input = el('input', {
      class: 'shotpick__input',
      id: 'room-photo',
      type: 'file',
      // The tile is a picture once it holds one, so the field says its own name.
      'aria-label': 'Photograph of the room',
      accept: 'image/jpeg,image/png,image/webp',
      onchange: async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        // A photograph is sized here, before it is sent (data/photo.js): what
        // the frame shows from this moment is the file steeple will be given,
        // not the twelve-megapixel one this browser was handed.
        const mine = (picking += 1);
        refused = null;
        working = true;
        drawPreview();
        const prepared = await prepareRoomPhoto(file);
        if (mine !== picking) return; // a second choice overtook this one
        working = false;
        if (!prepared.ok) {
          takeAway();
          refused = prepared.detail;
          drawPreview();
          announce?.(prepared.detail);
          return;
        }
        hold({ file: prepared.file, url: URL.createObjectURL(prepared.file), name: file.name, sent: false });
        drawPreview();
        renderFoot();
        announce?.(`${file.name} attached.`);
      },
    });

    // The picked file is read and re-encoded off the main path, so two quick
    // choices can be in flight at once: only the last one may land.
    let picking = 0;
    let working = false;
    let refused = null;

    /** Hold a prepared photograph, and let go of the last one's object URL. */
    function hold(photo) {
      const stale = draft.room.photo?.url;
      draft.room.photo = photo;
      if (stale && stale !== photo?.url && stale.startsWith('blob:')) URL.revokeObjectURL(stale);
    }

    function takeAway() {
      hold(null);
      working = false;
      input.value = '';
      renderFoot();
    }

    const remove = el(
      'button',
      {
        type: 'button',
        class: 'shotpick__remove',
        // The button stands inside the label that opens the picker: taking the
        // photograph away must not ask for another one in the same click.
        onclick: (event) => {
          event.preventDefault();
          event.stopPropagation();
          refused = null;
          takeAway();
          drawPreview();
        },
      },
      'Remove'
    );

    /**
     * What an empty frame says: the one thing it wants, and how to frame it —
     * or, when the last file could not be used, why, in the place the host is
     * already looking. A refusal is never a wall: the frame is still the picker.
     */
    function invitation() {
      const mark = el('span', { class: 'shotpick__mark' });
      mark.innerHTML = PHOTO_SVG; // static markup, no data in it
      return el('span', { class: 'shotpick__empty' }, [
        mark,
        el('span', { class: 'shotpick__prompt', text: refused ? 'Try another photograph' : 'Add a photograph' }),
        el('span', {
          class: `shotpick__hint${refused ? ' shotpick__hint--refused' : ''}`,
          text: refused ?? 'One wide shot of the whole space.',
        }),
      ]);
    }

    /** The moment a picked file is being read and sized down, said plainly. */
    const preparing = () =>
      el('span', { class: 'shotpick__empty' }, [
        el('span', { class: 'shotpick__prompt', text: 'Preparing the photograph…' }),
      ]);

    function drawPreview() {
      const photo = draft.room.photo;
      const busy = working && !photo;
      replaceChildren(tile, [
        input,
        ...(photo
          ? [
              el('img', { class: 'shotpick__thumb', src: photo.url ?? photo.remoteUrl, alt: '' }),
              el('span', { class: 'shotpick__veil', 'aria-hidden': 'true', text: 'Replace photograph' }),
              remove,
            ]
          : [busy ? preparing() : invitation()]),
      ]);
      tile.classList.toggle('is-filled', Boolean(photo));
      tile.classList.toggle('is-refused', Boolean(refused));
      tile.setAttribute('aria-busy', busy ? 'true' : 'false');
    }
    drawPreview();

    return tile;
  }

  /**
   * Welcoming everyone is the default and costs nothing; narrowing starts from
   * everything and asks the host to turn off what they cannot host, which is
   * how a hall keeper actually thinks about it.
   */
  function welcomeField(activities) {
    const chips = el('div', { class: 'welcome__chips' });

    // The chips are the sentence: what is on is what may ask. Nothing here says
    // so in words — the footer already names what a listing still owes, which is
    // where the host looks when the way forward is greyed out.
    function draw() {
      replaceChildren(
        chips,
        draft.room.welcomeAll
          ? []
          : [toggleSet('Activities', ACTIVITY_TYPES, activities, () => renderFoot())]
      );
    }

    const choose = (all) => {
      // Narrowing starts from everything; going back to everyone remembers what
      // was turned off, so the choice can be tried both ways without retyping.
      if (all) draft.room.narrowed = [...activities];
      draft.room.welcomeAll = all;
      activities.clear();
      const next = all ? ACTIVITY_TYPES : (draft.room.narrowed ?? ACTIVITY_TYPES);
      for (const activity of next.length ? next : ACTIVITY_TYPES) activities.add(activity);
      draw();
      renderFoot();
    };

    const segment = (label, all) =>
      el(
        'button',
        {
          type: 'button',
          class: `segment${draft.room.welcomeAll === all ? ' is-on' : ''}`,
          dataset: { welcome: all ? 'all' : 'some' },
          'aria-pressed': draft.room.welcomeAll === all ? 'true' : 'false',
          onclick: (event) => {
            for (const other of event.currentTarget.parentElement.children)
              other.classList.toggle('is-on', other === event.currentTarget);
            choose(all);
          },
        },
        label
      );

    draw();
    return chosen(
      'Who can use it',
      [
        el('div', { class: 'segments segments--flat', role: 'group', 'aria-label': 'Who can use it' }, [
          segment('Everyone', true),
          segment('Some activities only', false),
        ]),
        chips,
      ],
      'welcome'
    );
  }

  function availabilityStep() {
    painter.load(draft.venueId, draft.roomId);
    const blackoutDate = el('input', {
      class: 'input',
      id: 'blackout-date',
      type: 'date',
      min: todayIso(),
    });
    const blackoutReason = el('input', {
      class: 'input',
      id: 'blackout-reason',
      type: 'text',
      // steeple keeps 200 characters of reason and refuses the whole rule set
      // over a longer one. A field that took more would trade a note nobody
      // reads for the week's open hours.
      maxlength: '200',
      placeholder: 'Parish festival',
    });
    const list = el('ul', { class: 'blackouts' });

    function drawBlackouts() {
      const entries = blackoutsFor(draft.venueId, draft.roomId);
      replaceChildren(
        list,
        entries.length
          ? entries.map((entry) =>
              el('li', { class: 'blackouts__item' }, [
                el('span', { text: `${fmtDate(entry.date, true)}${entry.reason ? ` · ${entry.reason}` : ''}` }),
                el(
                  'button',
                  {
                    type: 'button',
                    class: 'linkish',
                    dataset: { remove: entry.date },
                    onclick: () => {
                      removeBlackout(draft.venueId, draft.roomId, entry.date);
                      drawBlackouts();
                      onChanged?.();
                      announce?.(`${fmtDate(entry.date, true)} is open again.`);
                    },
                  },
                  'Remove'
                ),
              ])
            )
          : [el('li', { class: 'blackouts__empty', text: 'No closed days.' })]
      );
    }
    drawBlackouts();

    const add = el(
      'button',
      {
        type: 'button',
        class: 'pill pill--sm',
        dataset: { action: 'add-blackout' },
        onclick: () => {
          if (!blackoutDate.value) {
            blackoutDate.focus();
            return;
          }
          // A day already gone cannot be set aside: steeple refuses a whole
          // rule set over one past date, and keeping it here alone would show
          // the host a closed day the service has never heard of.
          if (blackoutDate.value < todayIso()) {
            blackoutDate.reportValidity();
            blackoutDate.focus();
            return;
          }
          addBlackout(draft.venueId, draft.roomId, blackoutDate.value, blackoutReason.value);
          announce?.(`${fmtDate(blackoutDate.value, true)} set aside.`);
          blackoutDate.value = '';
          blackoutReason.value = '';
          drawBlackouts();
          onChanged?.();
        },
      },
      'Add closed day'
    );

    return [
      el('p', {
        class: 'prose',
        text: 'Paint the hours the room can be used. Drag along a day to open it, drag back to close it. Arrows and Space do the same.',
      }),
      noticeBlock(),
      painter.element,
      el('section', { class: 'closed' }, [
        el('h3', { class: 'eyebrow', text: 'Closed days' }),
        el('p', { class: 'prose prose--sm', text: 'Dates set aside here are skipped when a booking is made.' }),
        // Labels on one line, the controls they name on the next, in one grid:
        // nested field boxes let the date picker's extra height push its label
        // out of line with the one beside it.
        el('div', { class: 'closed__form' }, [
          el('label', { class: 'eyebrow', for: 'blackout-date', text: 'Date' }),
          el('label', { class: 'eyebrow', for: 'blackout-reason', text: 'Reason' }),
          el('span', { 'aria-hidden': 'true' }),
          blackoutDate,
          blackoutReason,
          add,
        ]),
        list,
      ]),
    ];
  }

  // ── publishing ────────────────────────────────────────────────────────────

  const FREE_NOTE = 'Steeple lists spaces by the hour, so a free space cannot be published yet.';

  /** The brand's own mark, in the small form the desk uses. */
  const verifiedChip = () =>
    el('span', { class: 'verified verified--sm' }, [
      el('span', { class: 'verified__dot', 'aria-hidden': 'true' }),
      VERIFIED_LABEL,
    ]);

  // Free is a price a host chose; an empty field is a price they have not
  // written yet. Both stop a listing going live, and they are not the same
  // sentence, so they are not the same question either.
  const isFree = (price) => price != null && price !== '' && Number(price) === 0;
  const hasPrice = (price) => price != null && price !== '' && Number(price) > 0;

  // Seats are counted, not measured. steeple's room takes a whole number and
  // answers a fraction with a parse failure rather than a sentence, so the
  // question is asked here, where the field is.
  const seats = (capacity) => Number.isInteger(Number(capacity)) && Number(capacity) > 0;

  // Shown, rather than typed: the store has always said free with a null, and
  // a room read back from it must read the same as one being written now.
  const shownFree = (price) => !hasPrice(price);

  /** What the local store should hold for this price: null when it is free. */
  const localPrice = () => (hasPrice(draft.room.pricePerHour) ? Number(draft.room.pricePerHour) : null);

  /** What still stands between this space and a listing, in the order it matters. */
  function blockers() {
    const list = [];
    if (openHoursFor(draft.venueId, draft.roomId).length === 0) {
      list.push({ id: 'hours', step: 'availability', label: 'Set the open hours', text: 'Open hours, so nobody asks for a time you cannot give.' });
    }
    if (!withSteeple()) return list;
    if (!manage.signedIn()) {
      // The only blocker with no field behind it: it is answered by the sign-in
      // panel, over this flow, and the draft is still here afterwards.
      list.push({
        id: 'session',
        label: 'Sign in',
        text: 'A signed-in account to list it under.',
        act: () => askToSignIn?.(),
      });
    }
    if (!draft.room.photo) {
      list.push({ id: 'photo', step: 'describe', label: 'Add a photograph', text: 'A photograph. Steeple will not publish a space it cannot show.' });
    }
    if (!hasPrice(draft.room.pricePerHour)) {
      list.push({
        id: 'price',
        step: 'describe',
        label: 'Set an hourly price',
        text: isFree(draft.room.pricePerHour) ? FREE_NOTE : 'An hourly price.',
      });
    }
    return list;
  }

  /**
   * Publish reads in the same two columns Place does: the ledger at the left,
   * where the venue stands at the right. Stacked, the map sat below the fold
   * of a long summary and read as an afterthought rather than a confirmation.
   */
  function publishLayout(words) {
    const where = placedBlock();
    if (!where) return words;
    return [
      el('div', { class: 'publish' }, [
        el('div', { class: 'publish__words' }, words),
        el('div', { class: 'publish__where' }, [where]),
      ]),
    ];
  }

  /**
   * Where the space stands at steeple, in the Publish step's one word — with the
   * village's own record read first, because a room published here while steeple
   * was away is live in this browser and unknown to the service, and the two
   * must not be blurred (the desk marks it "On this device").
   */
  const standing = () => {
    const room = effectiveRoom(draft.venueId, draft.roomId);
    if (room?.keptLocally === true) return 'kept';
    return manage.publishState(room ?? draft.room);
  };

  /**
   * A listing steeple has already answered — on the map, or sitting with a
   * moderator. There is nothing left to ask for, so Publish reads as a statement
   * and its button is the way out. Until 2026-08-07 the footer went on offering
   * "Publish this space" under "has been sent for review": the flow asking a
   * second time for what it had already been given.
   */
  function settled() {
    if (outcome || !draft?.room) return null;
    const state = standing();
    return state === 'published' || state === 'review' ? state : null;
  }

  function publishStep() {
    const room = effectiveRoom(draft.venueId, draft.roomId) ?? draft.room;
    const state = outcome?.state ?? standing();

    const summary = el('dl', { class: 'facts' }, [
      el('dt', { class: 'eyebrow', text: 'Space' }),
      el('dd', { text: `${room.name} · seats ${room.capacity}` }),
      el('dt', { class: 'eyebrow', text: 'Price' }),
      el('dd', {}, [
        shownFree(room.pricePerHour)
          ? el('span', { class: 'price price--sm price--free', text: 'Free' })
          : el('span', { class: 'price price--sm', text: `$${room.pricePerHour}/hr` }),
      ]),
      el('dt', { class: 'eyebrow', text: 'Open hours' }),
      el('dd', { text: hoursSummary(draft.venueId, draft.roomId) }),
      el('dt', { class: 'eyebrow', text: 'Welcomes' }),
      el('dd', {
        text: draft.room.welcomeAll
          ? 'Every kind of group'
          : draft.room.activities.length
            ? draft.room.activities.join(', ')
            : 'Nothing chosen yet',
      }),
      // The one disclosure the Verify step used to make, said where it matters:
      // the host's name goes out with the listing, and the mark beside it is a
      // fact about the session, never a decoration.
      el('dt', { class: 'eyebrow', text: 'Listed by' }),
      el('dd', { class: 'facts__by' }, [
        el('span', { text: manage.whoAmI()?.displayName ?? 'You' }),
        manage.signedIn() ? verifiedChip() : null,
      ].filter(Boolean)),
    ]);

    if (state === 'published') {
      return publishLayout([
        el('p', { class: 'prose', text: `${room.name} is published. Groups can find it and send you a request.` }),
        noticeBlock(),
        summary,
      ]);
    }

    if (state === 'review') {
      return publishLayout([
        el('section', { class: 'guide guide--review' }, [
          el('h3', { class: 'eyebrow', text: 'In review' }),
          el('p', {
            class: 'prose',
            text: `Thanks for listing! As this is your first listing, ${room.name} has been sent for review. We'll be in touch shortly!`,
          }),
        ]),
        noticeBlock(),
        summary,
      ]);
    }

    if (state === 'kept') {
      return [
        el('section', { class: 'guide guide--quiet' }, [
          el('h3', { class: 'eyebrow', text: 'Kept here' }),
          el('p', {
            class: 'prose',
            text: `Steeple could not be reached, so ${room.name} is held on this device with everything you wrote. Open it again when Steeple is back and publish from here.`,
          }),
        ]),
        noticeBlock(),
        summary,
      ];
    }

    const left = blockers();
    if (left.length) {
      return [
        el('section', { class: 'guide' }, [
          el('h3', { class: 'eyebrow', text: left.length === 1 ? 'One thing first' : 'A few things first' }),
          el('ul', { class: 'guide__list' }, left.map((item) => el('li', { text: item.text }))),
          el(
            'div',
            { class: 'guide__actions' },
            left.map((item) =>
              el(
                'button',
                {
                  type: 'button',
                  class: 'pill pill--primary pill--sm',
                  dataset: { action: `fix-${item.id}` },
                  // Most of what is missing is a field on another step. The
                  // session is not — it is answered where sign-in lives.
                  onclick: () => (item.act ? item.act() : go(item.step)),
                },
                item.label
              )
            )
          ),
        ]),
        noticeBlock(),
        summary,
      ];
    }

    return publishLayout([
      el('p', {
        class: 'prose',
        text: withSteeple()
          ? 'Everything is in place. Steeple reads a new listing before it goes on the map, so this may sit with a moderator for a short while.'
          : 'Everything is in place. Publishing puts this space on the map and opens it to requests.',
      }),
      noticeBlock(),
      summary,
    ]);
  }

  /**
   * Publishing locally: the village's own record. For one of the five that is
   * the whole truth — steeple has no manager for them, and never had. For a
   * venue steeple has simply not heard of yet, it is a listing kept here, said
   * in those words and marked so the desk can say them too.
   */
  function publishHere() {
    const kept = !localOnly();
    const local = editRoom(draft.venueId, draft.roomId, { status: 'published', keptLocally: kept });
    if (!local.ok) {
      say(local.errors?.status ?? 'That space cannot be published yet.', 'warn');
      return false;
    }
    outcome = { state: kept ? 'kept' : 'published' };
    say('');
    announce?.(
      kept
        ? `Steeple could not be reached. ${draft.room.name} is kept on this device.`
        : `${draft.room.name} is published.`
    );
    return true;
  }

  /** The publish press: everything steeple has not been told, then the ask. */
  async function publish() {
    const carried = await pushEverything();
    if (!carried.ok) {
      if (carried.reach === 'offline') {
        draft.offline = true;
        publishHere();
        return;
      }
      reportProblem(carried);
      announce?.(carried.detail);
      return;
    }

    if (!draft.remote.roomId) {
      publishHere();
      return;
    }

    const answer = await manage.askToPublish(draft);
    if (!answer.ok) {
      if (answer.reach === 'offline') {
        draft.offline = true;
        publishHere();
        return;
      }
      reportProblem(answer);
      announce?.(answer.detail);
      return;
    }

    // What the service says it is, not what was asked for.
    editRoom(draft.venueId, draft.roomId, {}, answer.value);
    outcome = { state: manage.publishState(answer.value) };
    say('');
    onChanged?.();
    announce?.(
      outcome.state === 'published'
        ? `${answer.value.name} is published. Groups can find it and send you a request.`
        : `${answer.value.name} has been sent to Steeple for review.`
    );
  }

  // ── frame ─────────────────────────────────────────────────────────────────

  function noticeBlock() {
    if (!notice) return null;
    return el('section', { class: `notice notice--${notice.tone}`, role: 'status' }, [
      el('p', { class: 'notice__text', text: notice.text }),
      notice.action
        ? el(
            'button',
            {
              type: 'button',
              class: 'pill pill--sm',
              dataset: { action: 'notice' },
              // The reason travels with the host to the field it is about —
              // unless what it wants is not a field at all, but the sign-in.
              onclick: () =>
                notice.action.act
                  ? notice.action.act()
                  : go(notice.action.step, { keepNotice: true }),
            },
            notice.action.label
          )
        : null,
    ]);
  }

  /** The steps this way in actually has, in order. */
  const steps = () => FLOWS[draft.entry];

  function reachable(id) {
    const list = steps();
    // A room that already exists can be looked at from any of its three steps —
    // it has a name, hours and a state before this flow was ever opened.
    if (draft.entry === 'room') return list.includes(id);
    const order = list.indexOf(id);
    const at = list.indexOf(step);
    return order <= at || done.has(list[order - 1]);
  }

  function canAdvance() {
    if (busy) return false;
    if (outcome) return true;
    // Leaving a listing steeple already holds is never blocked by what a new one
    // would still need — a session that went while this was open included.
    if (step === 'publish' && settled()) return true;
    if (step === 'place')
      return (
        draft.venue.name.trim().length > 1 &&
        draft.venue.description.trim().length > 0 &&
        draft.venue.addressLine.trim().length > 4
      );
    if (step === 'describe')
      return (
        draft.room.name.trim().length > 1 &&
        draft.room.description.trim().length > 0 &&
        seats(draft.room.capacity) &&
        (draft.sets?.activities.size ?? draft.room.activities.length) > 0
      );
    if (step === 'availability') return openHoursFor(draft.venueId, draft.roomId).length > 0;
    return blockers().length === 0;
  }

  function advanceLabel() {
    if (busy) return 'Working…';
    if (outcome) return 'Done';
    if (step === 'place') return draft.entry === 'venue-edit' ? 'Save changes' : 'Continue';
    if (step === 'describe') return 'Set availability';
    if (step === 'availability') return settled() ? 'Review the listing' : 'Review and publish';
    if (settled()) return 'Done';
    return 'Publish this space';
  }

  function footHint() {
    if (!canAdvance() || busy) {
      if (step === 'place') return 'A name, a line about the venue, and where it is.';
      if (step === 'describe')
        return Number(draft.room.capacity) > 0 && !seats(draft.room.capacity)
          ? 'Seats are counted in whole numbers.'
          : 'A name, a description, a capacity, and who may use it.';
      if (step === 'availability') return 'Paint at least one open window to carry on.';
      if (step === 'publish') return blockers()[0]?.text ?? '';
    }
    return '';
  }

  function renderRail() {
    // One step is not a journey: the venue editor is a form with a save on it,
    // and a rail reading "1 Place" over it would be scaffolding around a door.
    const list = steps();
    rail.hidden = list.length < 2;
    replaceChildren(
      rail,
      list.map((id, index) =>
        el(
          'li',
          { class: 'steps__item' },
          el(
            'button',
            {
              type: 'button',
              class: `steps__step${id === step ? ' is-on' : ''}${
                done.has(id) ? ' is-done' : ''
              }`,
              dataset: { step: id },
              'aria-current': id === step ? 'step' : null,
              disabled: busy || !reachable(id),
              onclick: () => go(id),
            },
            [
              el('span', { class: 'steps__num', 'aria-hidden': 'true', text: String(index + 1) }),
              el('span', { text: STEP_LABEL[id] }),
            ]
          )
        )
      )
    );
  }

  function renderFoot() {
    const list = steps();
    const index = list.indexOf(step);
    const hint = footHint();

    replaceChildren(foot, [
      el('div', { class: 'listing__hint' }, [
        hint ? el('p', { class: 'field__hint', text: hint }) : null,
      ]),
      el('div', { class: 'listing__buttons' }, [
        el(
          'button',
          {
            type: 'button',
            class: 'linkish',
            dataset: { action: 'close' },
            disabled: busy,
            onclick: () => close(),
          },
          'Close'
        ),
        index > 0 && !outcome && reachable(list[index - 1])
          ? el(
              'button',
              {
                type: 'button',
                class: 'pill',
                dataset: { action: 'back' },
                disabled: busy,
                onclick: () => go(list[index - 1]),
              },
              'Back'
            )
          : null,
        el(
          'button',
          {
            type: 'button',
            class: 'pill pill--primary',
            dataset: { action: 'advance' },
            disabled: !canAdvance(),
            onclick: advance,
          },
          advanceLabel()
        ),
      ]),
    ]);
  }

  /** Keep what this step is worth locally. The wire is asked for separately. */
  function commitStep() {
    if (step === 'place') {
      // The mark follows the session, and the session is what the venue is
      // being written under. It was the Verify step's one lasting act.
      if (draft.entry === 'venue') draft.verified = manage.signedIn();
      mirrorVenue();
      announce?.(`${draft.venue.name} saved.`);
    }
    if (step === 'describe') {
      if (draft.sets) {
        draft.room.amenities = [...draft.sets.amenities];
        draft.room.accessibility = [...draft.sets.access];
        draft.room.activities = [...draft.sets.activities];
      }
      // A space added to a venue already kept here has no id until now: it takes
      // one from the name just written, and the venue's own record is where a
      // room first exists at all — an edit over nothing writes nothing.
      if (!draft.roomId) {
        draft.roomId = freeRoomId(draft.venueId, draft.room.name);
        mirrorVenue();
      }
      editRoom(draft.venueId, draft.roomId, {
        name: draft.room.name.trim(),
        description: draft.room.description,
        capacity: Number(draft.room.capacity),
        pricePerHour: localPrice(),
        houseRules: draft.room.houseRules,
        amenities: draft.room.amenities,
        accessibility: draft.room.accessibility,
        activities: draft.room.activities,
      });
      announce?.(`${draft.room.name} saved.`);
    }
    done.add(step);
    onChanged?.();
  }

  /**
   * Forward. A step commits locally first, then tells steeple what it can; a
   * refusal keeps the host on the step that owns the field, with the service's
   * own sentence to read.
   */
  async function advance() {
    if (busy || !canAdvance()) return;
    // Once the answer is in, the button is a way out and nothing is in flight.
    if (outcome) {
      close();
      return;
    }
    if (step === 'publish' && settled()) {
      if (await leaveSettled()) close();
      else renderStep();
      return;
    }
    const at = step;
    busy = true;
    say('');
    renderFoot();
    renderRail();
    try {
      if (at === 'publish') {
        await publish();
        return;
      }
      commitStep();
      const answer =
        at === 'place'
          ? await pushVenue()
          : at === 'describe'
            ? await pushRoom()
            : at === 'availability'
              ? await pushHours()
              : { ok: true };
      if (!answer.ok && answer.reach !== 'offline') {
        reportProblem(answer);
        announce?.(answer.detail);
        return;
      }
      if (!answer.ok) reportProblem(answer);
      const list = steps();
      const next = list[list.indexOf(at) + 1];
      // No next step is an ending of its own: the venue editor's whole flow is
      // this one save, so what follows is the answer to it and the way out.
      if (next) step = next;
      else if (answer.ok) settleEdit();
    } finally {
      busy = false;
      renderStep();
    }
  }

  /**
   * The way out of a listing steeple has already answered. Whatever was typed
   * since still goes — the rail may be jumped, and a step reached that way has
   * written to this browser's record and nowhere else — but nothing is asked for
   * a second time, and a stage with nothing to carry never touches the wire.
   */
  async function leaveSettled() {
    busy = true;
    say('');
    renderFoot();
    try {
      const carried = await pushEverything();
      if (carried.ok) return true;
      reportProblem(carried);
      announce?.(carried.detail);
      return false;
    } finally {
      busy = false;
    }
  }

  /** The venue editor's ending — steeple agreed, and there is nowhere to go. */
  function settleEdit() {
    outcome = { state: 'saved' };
    say(`${draft.venue.name} is saved.`, 'quiet');
    announce?.(`${draft.venue.name} is saved.`);
  }

  function go(next, { keepNotice = false } = {}) {
    if (busy || next === step) return;
    if (step !== 'publish' && canAdvance()) commitStep();
    if (!keepNotice) say('');
    step = next;
    renderStep();
  }

  /**
   * Draw the step as it now stands, and nothing else. A session appearing or
   * going redraws this much — the Publish step's list of what is missing is
   * about the session — but must not take the focus off whatever asked for it.
   */
  function renderBody() {
    const head = HEAD[draft.entry];
    eyebrow.textContent = head.eyebrow;
    title.textContent = head.title(
      draft.venue.name,
      roomsHere(draft.venueId).length,
      step
    );
    const build = {
      place: placeStep,
      describe: describeStep,
      availability: availabilityStep,
      publish: publishStep,
    }[step];
    replaceChildren(body, build().filter(Boolean));
    renderRail();
    renderFoot();
  }

  function renderStep() {
    const list = steps();
    renderBody();
    body.scrollTop = 0;
    const first = body.querySelector('input, textarea, button, [tabindex="0"]');
    (first ?? sheet).focus({ preventScroll: true });
    announce?.(
      list.length > 1
        ? `${STEP_LABEL[step]}, step ${list.indexOf(step) + 1} of ${list.length}.`
        : title.textContent
    );
  }

  /** A blank space, ready to be described. */
  const blankRoom = (name = '') => ({
    name,
    description: '',
    capacity: 40,
    pricePerHour: null,
    houseRules: '',
    amenities: [],
    accessibility: [],
    activities: [...ACTIVITY_TYPES],
    welcomeAll: true,
    photo: null,
  });

  /**
   * Open on what the arguments describe.
   *
   *   {}                     a venue nobody has listed — the whole four steps
   *   {venueId}              another space at a venue already kept here
   *   {venueId, roomId}      the listing that space already has
   *   {venueId, entry:'venue-edit'}   the venue's own details, over PATCH
   */
  function open({ venueId = null, roomId = null, step: at = null, entry: want = null } = {}) {
    const placed = placedVenues();
    const venue = venueId ? venueOf(venueId, placed) : null;
    const room = venue && roomId ? effectiveRoom(venueId, roomId) : null;
    done = new Set();
    notice = null;
    outcome = null;
    busy = false;
    hydration = null; // a read in flight for a previous draft answers only that draft

    if (venue) {
      const address = splitAddress(venue.address, venue.suburb);
      const editing = want === 'venue-edit';
      draft = {
        entry: editing ? 'venue-edit' : room ? 'room' : 'add-room',
        venueId,
        roomId: room ? roomId : null,
        // The five villages steeple seeded have no manager on this API, so a
        // room inside one can only ever be listed in this browser's own record.
        localOnly: !venue.placed,
        offline: null,
        // The mark is the venue's, and steeple gives it: standing at this desk
        // does not confer one, and this browser cannot award itself a fact.
        verified: venue.verified === true,
        remote: { venueId: venue.remoteId ?? null, roomId: room?.remoteId ?? null, position: null },
        // Where the address the host last picked from the suggestions falls —
        // the provider's reading, shown as a preview until steeple answers.
        picked: null,
        venue: {
          name: venue.name,
          description: venue.description ?? '',
          ...address,
        },
        // The venue editor has no space in hand at all — it is the property
        // being written, not a room in it.
        room: editing
          ? null
          : room
            ? {
                // "(coming soon)" and "listing is being prepared" are what
                // discovery said while the space was a draft, not what the space
                // is. The host is finishing the listing now, so both start clean.
                name: withoutDraftNote(room.name),
                description: withoutDraftNote(room.description ?? ''),
                capacity: room.capacity,
                // The store says free with a null; the field says it with a zero.
                pricePerHour: room.pricePerHour ?? 0,
                houseRules: room.houseRules ?? '',
                amenities: [...room.amenities],
                accessibility: [...room.accessibility],
                activities: [...room.activities],
                welcomeAll: room.activities.length === ACTIVITY_TYPES.length,
                photo: room.photo
                  ? { remoteUrl: room.photo, url: room.photo, name: 'Photograph', sent: true }
                  : null,
              }
            : blankRoom(''),
      };
      if (venue.lat != null) draft.remote.position = { lat: venue.lat, lng: venue.lng };
      // A room steeple already holds opened from the store's mirror, which a
      // fresh browser only carries as the venue-detail summary — so the full
      // room is read before any of it may be sent back (hydrateRoom).
      draft.hydrated = !draft.remote.roomId;
      draft.seededRoom = draft.hydrated || !draft.room ? null : seedSnapshot(draft.room);
      // Nothing has been sent from here yet, and the hours in this browser's
      // record are taken as steeple's until the host paints over them.
      draft.sent = null;
      draft.sentHours = room ? hoursSnapshot() : null;
      step = editing ? 'place' : (at ?? 'describe');
    } else {
      draft = {
        entry: 'venue',
        venueId: null,
        roomId: null,
        localOnly: false,
        offline: null,
        verified: manage.signedIn(),
        remote: { venueId: null, roomId: null, position: null },
        picked: null,
        venue: { name: '', description: '', addressLine: '', suburb: '', postcode: '' },
        room: blankRoom(),
        hydrated: true,
        seededRoom: null,
        sent: null,
        sentHours: null,
      };
      step = 'place';
    }

    element.hidden = false;
    renderStep();
    if (!draft.hydrated) hydrateRoom();
    return true;
  }

  /** The editable fields as open() seeded them — "untouched" is measured against this. */
  const seedSnapshot = (room) => ({
    name: room.name,
    description: room.description,
    capacity: room.capacity,
    pricePerHour: room.pricePerHour,
    houseRules: room.houseRules,
    amenities: [...room.amenities],
    accessibility: [...room.accessibility],
    activities: [...room.activities],
  });

  /**
   * Read the full room as steeple holds it, mirror it, and fold it into this
   * draft. The venue-detail summary the mirror starts from omits description,
   * rules and the three vocabularies — open() seeded those as blanks, and a
   * blank sent back over PATCH means "the host cleared this". Folding replaces
   * only the fields the host has not touched since open(); pushRoom refuses to
   * PATCH until one read has landed. One read in flight at a time; a failed
   * read reports as the usual verdict and may be retried by the next caller.
   */
  let hydration = null;
  function hydrateRoom() {
    if (draft.hydrated) return Promise.resolve({ ok: true });
    hydration ??= (async () => {
      const mine = draft;
      const answer = await manage.readRoom(mine.remote.roomId);
      hydration = null;
      if (!answer.ok || draft !== mine) return answer;
      editRoom(mine.venueId, mine.roomId, {}, answer.value);
      foldServerRoom(answer.value);
      mine.hydrated = true;
      if (!element.hidden && !busy && !outcome && draft === mine) {
        // Redraw so the folded fields are visible, without stealing the caret.
        const focused = document.activeElement?.id;
        renderBody();
        if (focused) element.querySelector(`#${CSS.escape(focused)}`)?.focus();
      }
      return { ok: true };
    })();
    return hydration;
  }

  /** steeple's full room over the draft, everywhere the host has not written since open(). */
  function foldServerRoom(dto) {
    const truth = {
      name: withoutDraftNote(dto.name),
      description: withoutDraftNote(dto.description ?? ''),
      capacity: dto.capacity,
      pricePerHour: dto.pricePerHour ?? 0,
      houseRules: dto.houseRules ?? '',
      amenities: toLabels(dto.amenities, AMENITY_LABELS),
      accessibility: toLabels(dto.accessibility, ACCESS_LABELS),
      activities: toLabels(dto.activities, ACTIVITY_LABELS),
    };
    const seeded = draft.seededRoom ?? {};
    const untouched = (key) => JSON.stringify(draft.room[key] ?? null) === JSON.stringify(seeded[key] ?? null);
    for (const [key, value] of Object.entries(truth)) {
      if (untouched(key)) draft.room[key] = value;
    }
    // What steeple holds, whatever the host has written over it here: the answer
    // an edit is measured against, so a save nobody asked for is never sent.
    draft.sent = seedSnapshot(truth);
    draft.room.welcomeAll = draft.room.activities.length === ACTIVITY_TYPES.length;
    if (!draft.room.photo) {
      const url = dto.photos?.find((p) => p.isPrimary)?.cardUrl ?? dto.photos?.[0]?.cardUrl ?? null;
      if (url) draft.room.photo = { remoteUrl: url, url, name: 'Photograph', sent: true };
    }
  }

  function close() {
    if (element.hidden || busy) return;
    element.hidden = true;
    onClose?.();
  }

  // Capture on window: the flow owns Escape while it is open, wherever focus
  // happens to be, and the journey never hears it — but not while something is
  // open *over* it. The sign-in panel a blocker opens is a layer of its own, and
  // Escape there belongs to it; closing the draft underneath as well would look
  // like the work went with the panel.
  window.addEventListener(
    'keydown',
    (event) => {
      if (element.hidden || event.key !== 'Escape') return;
      if (document.querySelector('.modal__layer:not([hidden])')) return;
      // The open address-suggestion list is a layer of its own too: that press
      // closes the list (the field's handler), never the flow underneath it.
      if (document.querySelector('.suggest:not([hidden])')) return;
      event.stopPropagation();
      event.preventDefault();
      close();
    },
    true
  );

  return {
    element,
    open,
    close,
    isOpen: () => !element.hidden,
    step: () => step,
  };
}
