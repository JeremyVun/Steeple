// THE LISTING FLOW — Place, Verify, Describe, Availability, Publish.
//
// A host describes a space here and steeple ends up holding it: the venue, the
// room, its photograph, its open hours, and a request to publish. The local
// store is kept alongside as the village's own record, so the desk goes on
// working whether or not the API answered (CONTRACT6 §3).
//
// Two rules run through the whole file.
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

import {
  addBlackout,
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
import { ACTIVITY_TYPES, CENTER, VENUES } from '../../data/venues.js';
import { createIdentityStep } from '../guest/sso.js';
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

const STEPS = [
  { id: 'place', label: 'Place' },
  { id: 'verify', label: 'Verify' },
  { id: 'describe', label: 'Describe' },
  { id: 'availability', label: 'Availability' },
  { id: 'publish', label: 'Publish' },
];

// The identity beat is the guest's, said in the host's words.
const HOST_IDENTITY = {
  eyebrow: 'Verify',
  title: 'Sign in to Steeple',
  blurb:
    'Signing in once puts a verified mark on everything you list. Groups see the mark and your name; nothing else about your account.',
  carryOn: (name) => `Continue as ${name}`,
  signedOutAgain: 'Signed out.',
  missingEmail: 'An email address, so your listings have an owner.',
  // The step's own title already says what this is.
  formEyebrow: null,
  start: 'email',
};

// The square of village ground the confirmation is drawn on: honest to lat/lng,
// wide enough to hold the five churches with room around them.
const HALF_LAT = 0.0326;
const HALF_LNG = 0.042;
const toPlan = (lat, lng) => ({
  x: 0.5 + (lng - CENTER.lng) / (2 * HALF_LNG),
  y: 0.5 - (lat - CENTER.lat) / (2 * HALF_LAT),
});

const COMPASS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];

function bearingLine(lat, lng) {
  const dNorth = (lat - CENTER.lat) * 111.32;
  const dEast = (lng - CENTER.lng) * 111.32 * Math.cos((CENTER.lat * Math.PI) / 180);
  const km = Math.hypot(dNorth, dEast);
  if (km < 0.15) return 'in the middle of the village';
  const angle = (Math.atan2(dEast, dNorth) * 180) / Math.PI;
  const point = COMPASS[Math.round(((angle + 360) % 360) / 45) % 8];
  return `${km.toFixed(1)} km ${point} of the village centre`;
}

const slug = (text) =>
  `placed-${text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'church'}`;

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

export function createListingFlow({ announce, onChanged, onClose }) {
  const rail = el('ol', { class: 'steps' });
  const body = el('div', { class: 'listing__body' });
  const foot = el('footer', { class: 'listing__foot' });
  const sheet = el(
    'section',
    {
      class: 'listing',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': 'listing-title',
      tabindex: '-1',
    },
    [
      el('header', { class: 'listing__head' }, [
        el('p', { class: 'eyebrow', text: 'List a space' }),
        el('h1', { class: 'sheet__title', id: 'listing-title', text: 'A space with room to spare' }),
        rail,
      ]),
      body,
      foot,
    ]
  );
  const element = el('div', { class: 'listing__layer', hidden: true }, sheet);

  const painter = createHoursPainter({ announce });
  painter.onChange(() => {
    onChanged?.();
    if (step === 'availability') renderFoot();
  });

  const identity = createIdentityStep({
    announce,
    words: HOST_IDENTITY,
    onVerify: () => advance(),
  });

  // Signing in happens inside the identity panel, which knows nothing of this
  // flow's footer. Without this the way forward stays greyed out behind a
  // session that already exists.
  manage.onSession(() => {
    if (element.hidden || !draft) return;
    if (manage.signedIn()) draft.offline = null;
    renderRail();
    renderFoot();
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

  /** Whether steeple is a party to this listing at all, right now. */
  const withSteeple = () => !draft.localOnly && draft.offline !== true;

  const OFFLINE_NOTE =
    'Steeple could not be reached. You can carry on — what you write is kept on this device until it is back.';

  /**
   * The local record's own id. Two venues can honestly carry one name, and a
   * slug that repeats does not make a second record — it overwrites the first,
   * taking its address, its rooms and its place at steeple with it.
   */
  function freeVenueId(name) {
    const base = slug(name);
    const taken = new Set(placedVenues().map((v) => v.id));
    if (!taken.has(base)) return base;
    for (let n = 2; ; n += 1) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
  }

  function mirrorVenue(remote = null) {
    const id = draft.venueId ?? freeVenueId(draft.venue.name);
    draft.venueId = id;
    draft.roomId = draft.roomId ?? 'main-space';
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
      verified: draft.verified,
      rooms: [
        {
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
        },
      ],
    });
    setHostVenue(id);
  }

  async function pushVenue() {
    if (localOnly() || !manage.signedIn()) return { ok: true, skipped: true };
    const fresh = !draft.remote.venueId;
    const answer = await manage.saveVenue(draft);
    if (answer.ok) {
      draft.remote.venueId = answer.value.id;
      draft.remote.position = { lat: answer.value.latitude, lng: answer.value.longitude };
      mirrorVenue(answer.value);
      onChanged?.();
      // The pin is gone because this is the answer to it: steeple read the
      // address and put the venue somewhere, and the host is told where.
      if (fresh) {
        say(
          `${answer.value.name} is on the map, ${bearingLine(answer.value.latitude, answer.value.longitude)}.`,
          'quiet'
        );
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
    const answer = await manage.saveRoom(draft);
    if (!answer.ok) return answer;
    draft.remote.roomId = answer.value.id;
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

  function pushHours() {
    if (localOnly() || !draft.remote.roomId) return Promise.resolve({ ok: true, skipped: true });
    return manage.saveHours(
      draft,
      openHoursFor(draft.venueId, draft.roomId),
      blackoutsFor(draft.venueId, draft.roomId),
      todayIso()
    );
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
    if (answer.reach === 'signin') {
      say('Sign in before this can be sent to Steeple.', 'warn', { label: 'Sign in', step: 'verify' });
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
      rows: '2',
      placeholder: 'A parish hall and two meeting rooms, a short walk from the shops.',
      oninput: (event) => {
        draft.venue.description = event.target.value;
        renderFoot();
      },
    });
    description.value = draft.venue.description;

    return [
      el('p', {
        class: 'prose',
        text: 'Steeple puts the venue on the map from its address, so groups can see how far it is before they ask.',
      }),
      noticeBlock(),
      el('div', { class: 'place__fields' }, [
        field('place-name', 'name', 'Venue name', 'St Andrew’s Church'),
        labelled('About the venue', description),
        field('place-address', 'addressLine', 'Street address', '400 Maple Avenue West'),
        el('div', { class: 'field__pair' }, [
          field('place-suburb', 'suburb', 'Suburb or town', 'Vienna'),
          field('place-postcode', 'postcode', 'ZIP code', '22180'),
        ]),
      ]),
      placedBlock(),
    ];
  }

  /** Where steeple put it, once steeple has said. Quiet, and only then. */
  function placedBlock() {
    const at = draft.remote.position;
    if (!at) return null;
    const plan = el('div', { class: 'plan plan--still', 'aria-hidden': 'true' });
    for (const venue of VENUES) {
      const spot = toPlan(venue.lat, venue.lng);
      const dot = el('span', { class: 'plan__known', title: venue.shortName });
      dot.style.left = `${spot.x * 100}%`;
      dot.style.top = `${spot.y * 100}%`;
      plan.append(dot);
    }
    const here = toPlan(at.lat, at.lng);
    const pin = el('span', { class: 'plan__pin' });
    pin.style.left = `${Math.min(100, Math.max(0, here.x * 100))}%`;
    pin.style.top = `${Math.min(100, Math.max(0, here.y * 100))}%`;
    plan.append(el('span', { class: 'plan__north', text: 'N' }), pin);

    return el('section', { class: 'placed' }, [
      plan,
      el('div', { class: 'placed__words' }, [
        el('p', { class: 'eyebrow', text: 'On the map' }),
        el('p', {
          class: 'prose prose--sm',
          text: `Steeple found the address ${bearingLine(at.lat, at.lng)}. Everyone browsing sees it there.`,
        }),
        el('p', {
          class: 'field__hint',
          text: `${at.lat.toFixed(4)}, ${at.lng.toFixed(4)}`,
        }),
      ]),
    ]);
  }

  function verifyStep() {
    identity.reset();
    // A host who cannot sign in is owed the reason. Asked once, on the step
    // where signing in is the whole business, and only when there is no session
    // to sign in with.
    if (!manage.signedIn() && draft.offline == null) {
      manage.reachable().then((up) => {
        draft.offline = !up;
        if (step !== 'verify') return;
        if (!up) say(OFFLINE_NOTE, 'quiet');
        renderStep();
      });
    }
    return [noticeBlock(), identity.element];
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

    return [
      el('p', {
        class: 'prose',
        text: 'This is what a group reads before they ask. The fuller it is, the fewer questions you answer twice.',
      }),
      noticeBlock(),
      labelled('Name', name),
      labelled('Description', description),
      el('div', { class: 'field__pair' }, [
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
      photoField(),
      el('div', { class: 'field' }, [
        el('p', { class: 'eyebrow', text: 'Amenities' }),
        toggleSet('Amenities', AMENITY_VOCABULARY, amenities),
      ]),
      el('div', { class: 'field' }, [
        el('p', { class: 'eyebrow', text: 'Accessibility' }),
        toggleSet('Accessibility features', ACCESS_VOCABULARY, access),
      ]),
      welcomeField(activities),
      labelled('House rules', rules),
    ];
  }

  /** The photograph steeple will not publish a space without. */
  function photoField() {
    const preview = el('div', { class: 'shotpick__preview' });
    const input = el('input', {
      class: 'shotpick__input',
      id: 'room-photo',
      type: 'file',
      accept: 'image/jpeg,image/png,image/webp',
      onchange: (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        draft.room.photo = { file, url: URL.createObjectURL(file), name: file.name, sent: false };
        drawPreview();
        renderFoot();
        announce?.(`${file.name} attached.`);
      },
    });

    function drawPreview() {
      const photo = draft.room.photo;
      replaceChildren(
        preview,
        photo
          ? [
              // The file input says which file it is; this says it is readable.
              el('img', { class: 'shotpick__thumb', src: photo.url ?? photo.remoteUrl, alt: '' }),
              el(
                'button',
                {
                  type: 'button',
                  class: 'linkish',
                  onclick: () => {
                    draft.room.photo = null;
                    input.value = '';
                    drawPreview();
                    renderFoot();
                  },
                },
                'Remove'
              ),
            ]
          : []
      );
    }
    drawPreview();

    return el('div', { class: 'field shotpick' }, [
      el('label', { class: 'eyebrow', for: 'room-photo', text: 'Photograph' }),
      el('div', { class: 'shotpick__row' }, [input, preview]),
      el('p', { class: 'field__hint', text: 'One photograph of the room. Steeple will not publish a space it cannot show.' }),
    ]);
  }

  /**
   * Welcoming everyone is the default and costs nothing; narrowing starts from
   * everything and asks the host to turn off what they cannot host, which is
   * how a hall keeper actually thinks about it.
   */
  function welcomeField(activities) {
    const chips = el('div', { class: 'welcome__chips' });
    const hint = el('p', { class: 'field__hint' });

    function draw() {
      replaceChildren(
        chips,
        draft.room.welcomeAll
          ? []
          : [toggleSet('Activities', ACTIVITY_TYPES, activities, () => {
              hint.textContent = narrowHint();
              renderFoot();
            })]
      );
      hint.textContent = draft.room.welcomeAll
        ? 'Every kind of group may ask. You answer each request yourself.'
        : narrowHint();
    }

    const narrowHint = () =>
      activities.size ? 'Turn off anything you cannot host.' : 'Leave at least one kind of group.';

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
    return el('div', { class: 'field welcome' }, [
      el('p', { class: 'eyebrow', text: 'Who can use it' }),
      el('div', { class: 'segments segments--flat', role: 'group', 'aria-label': 'Who can use it' }, [
        segment('Everyone', true),
        segment('Some activities only', false),
      ]),
      chips,
      hint,
    ]);
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
      list.push({ id: 'session', step: 'verify', label: 'Sign in', text: 'A signed-in account to list it under.' });
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

  function publishStep() {
    const room = effectiveRoom(draft.venueId, draft.roomId) ?? draft.room;
    const state = outcome?.state ?? manage.publishState(room);

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
    ]);

    if (state === 'published') {
      return [
        el('p', { class: 'prose', text: `${room.name} is published. Groups can find it and send you a request.` }),
        summary,
        placedBlock(),
      ];
    }

    if (state === 'review') {
      return [
        el('section', { class: 'guide guide--review' }, [
          el('h3', { class: 'eyebrow', text: 'With Steeple' }),
          el('p', {
            class: 'prose',
            text: `${room.name} has been sent for review. Steeple reads a new listing before it goes on the map; nothing more is needed from you.`,
          }),
        ]),
        summary,
        placedBlock(),
      ];
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
                  onclick: () => go(item.step),
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

    return [
      el('p', {
        class: 'prose',
        text: withSteeple()
          ? 'Everything is in place. Steeple reads a new listing before it goes on the map, so this may sit with a moderator for a short while.'
          : 'Everything is in place. Publishing puts this space on the map and opens it to requests.',
      }),
      noticeBlock(),
      summary,
      placedBlock(),
    ];
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
              // The reason travels with the host to the field it is about.
              onclick: () => go(notice.action.step, { keepNotice: true }),
            },
            notice.action.label
          )
        : null,
    ]);
  }

  function reachable(id) {
    if (draft.entry === 'room') return id !== 'place' && (id !== 'verify' || !manage.signedIn());
    const order = STEPS.findIndex((s) => s.id === id);
    const at = STEPS.findIndex((s) => s.id === step);
    return order <= at || done.has(STEPS[order - 1]?.id);
  }

  function canAdvance() {
    if (busy) return false;
    if (step === 'place')
      return (
        draft.venue.name.trim().length > 1 &&
        draft.venue.description.trim().length > 0 &&
        draft.venue.addressLine.trim().length > 4 &&
        draft.venue.suburb.trim().length > 1 &&
        draft.venue.postcode.trim().length > 2
      );
    if (step === 'verify') return manage.signedIn() || draft.offline === true;
    if (step === 'describe')
      return (
        draft.room.name.trim().length > 1 &&
        draft.room.description.trim().length > 0 &&
        seats(draft.room.capacity) &&
        (draft.sets?.activities.size ?? draft.room.activities.length) > 0
      );
    if (step === 'availability') return openHoursFor(draft.venueId, draft.roomId).length > 0;
    if (outcome) return true;
    return blockers().length === 0;
  }

  function advanceLabel() {
    if (busy) return 'Working…';
    if (step === 'place') return 'Continue';
    if (step === 'verify') return 'Describe the space';
    if (step === 'describe') return 'Set availability';
    if (step === 'availability') return 'Review and publish';
    return outcome ? 'Done' : 'Publish this space';
  }

  function footHint() {
    if (!canAdvance() || busy) {
      if (step === 'place') return 'A name, a line about the venue, and where it is.';
      if (step === 'describe')
        return Number(draft.room.capacity) > 0 && !seats(draft.room.capacity)
          ? 'Seats are counted in whole numbers.'
          : 'A name, a description, a capacity, and who may use it.';
      if (step === 'availability') return 'Paint at least one open window to carry on.';
      if (step === 'verify') return 'Sign in once and the verified mark follows your listings.';
      if (step === 'publish') return blockers()[0]?.text ?? '';
    }
    return '';
  }

  function renderRail() {
    replaceChildren(
      rail,
      STEPS.map((entry, index) =>
        el(
          'li',
          { class: 'steps__item' },
          el(
            'button',
            {
              type: 'button',
              class: `steps__step${entry.id === step ? ' is-on' : ''}${
                done.has(entry.id) ? ' is-done' : ''
              }`,
              dataset: { step: entry.id },
              'aria-current': entry.id === step ? 'step' : null,
              disabled: busy || !reachable(entry.id),
              onclick: () => go(entry.id),
            },
            [
              el('span', { class: 'steps__num', 'aria-hidden': 'true', text: String(index + 1) }),
              el('span', { text: entry.label }),
            ]
          )
        )
      )
    );
  }

  function renderFoot() {
    const index = STEPS.findIndex((s) => s.id === step);
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
        index > 0 && reachable(STEPS[index - 1].id)
          ? el(
              'button',
              {
                type: 'button',
                class: 'pill',
                dataset: { action: 'back' },
                disabled: busy,
                onclick: () => go(STEPS[index - 1].id),
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
      mirrorVenue();
      announce?.(`${draft.venue.name} saved.`);
    }
    if (step === 'verify' && draft.entry === 'venue') {
      draft.verified = manage.signedIn();
      upsertPlacedVenue({ id: draft.venueId, verified: draft.verified });
    }
    if (step === 'describe') {
      if (draft.sets) {
        draft.room.amenities = [...draft.sets.amenities];
        draft.room.accessibility = [...draft.sets.access];
        draft.room.activities = [...draft.sets.activities];
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
    if (step === 'publish' && outcome) {
      close();
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
        at === 'place' || at === 'verify'
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
      step = STEPS[STEPS.findIndex((s) => s.id === at) + 1].id;
    } finally {
      busy = false;
      renderStep();
    }
  }

  function go(next, { keepNotice = false } = {}) {
    if (busy || next === step) return;
    if (step !== 'publish' && canAdvance()) commitStep();
    if (!keepNotice) say('');
    step = next;
    renderStep();
  }

  function renderStep() {
    const build = {
      place: placeStep,
      verify: verifyStep,
      describe: describeStep,
      availability: availabilityStep,
      publish: publishStep,
    }[step];
    replaceChildren(body, build().filter(Boolean));
    renderRail();
    renderFoot();
    body.scrollTop = 0;
    const first = body.querySelector('input, textarea, button, [tabindex="0"]');
    (first ?? sheet).focus({ preventScroll: true });
    announce?.(
      `${STEPS.find((s) => s.id === step).label}, step ${STEPS.findIndex((s) => s.id === step) + 1} of ${STEPS.length}.`
    );
  }

  function open({ venueId = null, roomId = null, step: at = null } = {}) {
    const placed = placedVenues();
    const venue = venueId ? venueOf(venueId, placed) : null;
    const room = venueId && roomId ? effectiveRoom(venueId, roomId) : null;
    done = new Set();
    notice = null;
    outcome = null;
    busy = false;

    if (venue && room) {
      const address = splitAddress(venue.address, venue.suburb);
      draft = {
        entry: 'room',
        venueId,
        roomId,
        // The five villages steeple seeded have no manager on this API, so a
        // room inside one can only ever be listed in this browser's own record.
        localOnly: !venue.placed,
        offline: null,
        verified: true,
        remote: { venueId: venue.remoteId ?? null, roomId: room.remoteId ?? null, position: null },
        venue: {
          name: venue.name,
          description: venue.description ?? '',
          ...address,
        },
        room: {
          // "(coming soon)" and "listing is being prepared" are what discovery
          // said while the space was a draft, not what the space is. The host
          // is finishing the listing now, so both start clean.
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
          photo: room.photo ? { remoteUrl: room.photo, url: room.photo, name: 'Photograph', sent: true } : null,
        },
      };
      if (venue.lat != null) draft.remote.position = { lat: venue.lat, lng: venue.lng };
      done.add('place');
      done.add('verify');
      step = at ?? 'describe';
    } else {
      draft = {
        entry: 'venue',
        venueId: null,
        roomId: null,
        localOnly: false,
        offline: null,
        verified: manage.signedIn(),
        remote: { venueId: null, roomId: null, position: null },
        venue: { name: '', description: '', addressLine: '', suburb: '', postcode: '' },
        room: {
          name: 'Main space',
          description: '',
          capacity: 40,
          pricePerHour: null,
          houseRules: '',
          amenities: [],
          accessibility: [],
          activities: [...ACTIVITY_TYPES],
          welcomeAll: true,
          photo: null,
        },
      };
      step = 'place';
    }

    element.hidden = false;
    renderStep();
    return true;
  }

  function close() {
    if (element.hidden || busy) return;
    element.hidden = true;
    onClose?.();
  }

  // Capture on window: the flow owns Escape while it is open, wherever focus
  // happens to be, and the journey never hears it.
  window.addEventListener(
    'keydown',
    (event) => {
      if (element.hidden || event.key !== 'Escape') return;
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
