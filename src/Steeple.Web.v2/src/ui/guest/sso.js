// The identity beat — one calm step at the commitment point, and nowhere else.
//
// Steeple verifies a person once so a host knows a real neighbour is asking;
// the wording of the trust chip is fixed brand language, and it is only ever
// shown once a real session exists. Nothing here pretends: signing in calls
// steeple's own /auth/sessions, and what comes back is an account the API will
// recognise when the request is sent a moment later.
//
// Two states, one panel:
//   · no session  — the people already seeded in this village, offered by name,
//     and a plain email + name for anyone else. Any email works: the dev
//     provider creates the account the first time it sees one.
//   · a session   — the person, the chip, and one button that carries on.

import * as session from '../../data/session.js';
import { VERIFIED_LABEL } from '../copy.js';
import { el, replaceChildren } from '../dom.js';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * One-tap addresses for the local loop and the harnesses — a shortcut past
 * typing, and nothing more. They are not identities and they are not a table
 * the product reads: whoever signs in with one of them is the account steeple
 * mints for that address, with steeple's own id and steeple's own name. The
 * seeded-persona mapping that used to stand behind these died with D4.
 *
 * Dev builds only. Production sees provider buttons and the email form (D7).
 */
const DEV = import.meta.env?.DEV === true;

export const PERSONAS = DEV
  ? [
      { email: 'maria@demo.steeple.test', name: 'Maria Alvarez', org: 'Little Sparrows Playgroup' },
      { email: 'daniel@demo.steeple.test', name: 'Daniel Okafor', org: 'Vienna Woods Chess Club' },
      { email: 'priya@demo.steeple.test', name: 'Priya Raman', org: 'ESL Conversation Circle' },
    ]
  : [];

function joinedText(iso) {
  if (!iso) return 'With Steeple';
  const [year, month] = String(iso).split('-');
  return month ? `With Steeple since ${MONTHS[Number(month) - 1]} ${year}` : 'With Steeple';
}

const initialsOf = (name) =>
  String(name ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join('');

export function verifiedChip(text = VERIFIED_LABEL) {
  return el('p', { class: 'verified' }, [
    el('span', { class: 'verified__dot', 'aria-hidden': 'true' }),
    text,
  ]);
}

// The words belong to the moment, not to the panel: a guest is naming
// themselves before they send, a host before they list. Everything else — the
// sign-in itself, the chip, the people this village knows — is the same beat,
// so it is the same component with its sentences passed in.
const GUEST_WORDS = {
  eyebrow: 'Before you send',
  title: 'Confirm who you are',
  blurb:
    'Steeple confirms a person once, so the host reading your request knows a real neighbour is asking. Your name and your group travel with it; nothing else about you is shared.',
  carryOn: (name) => `Continue as ${name}`,
  cancel: 'Back to your request',
  formEyebrow: 'Sign in',
  peopleEyebrow: 'Sign in as',
  signedOutAgain: 'Signed out. Choose who is asking.',
  missingEmail: 'An email address, so the host can be told who asked.',
};

/**
 * @param onVerify  called when the person carries on as who they are signed in as
 * @param onCancel  the way out; the way back is left to the caller when absent
 * @param words     overrides for {@link GUEST_WORDS}
 * @param requireSession
 *   For a flow that **cannot be entered without a session at all**. Listing a
 *   space is one: "I have space to share" signs somebody in before the flow
 *   opens (v2_migration D4, owner decision 2026-08-05), so the signed-out half
 *   of its Verify step could only ever be reached by a session dying mid-flow.
 *   Rendering a second sign-in form there asked a signed-in host to sign in
 *   again and gave the dead branch somewhere to hide; with this set, no session
 *   says so plainly and points at the one way in there is.
 */
export function createIdentityStep({ announce, onVerify, onCancel, words = {}, requireSession = false }) {
  const say = { ...GUEST_WORDS, ...words };
  let busy = false;
  let problem = '';

  const body = el('div', { class: 'identity__body' });

  const element = el('section', {
    class: 'identity',
    tabindex: '-1',
    'aria-label': say.title,
  }, [
    say.eyebrow ? el('p', { class: 'eyebrow', text: say.eyebrow }) : null,
    el('h2', { class: 'identity__title', text: say.title }),
    el('p', { class: 'prose prose--sm', text: say.blurb }),
    body,
  ].filter(Boolean));

  // ── the person, once there is one ─────────────────────────────────────────

  function personCard(user) {
    return el('div', { class: 'identity__card' }, [
      el('span', {
        class: 'identity__initials',
        'aria-hidden': 'true',
        text: initialsOf(user.displayName),
      }),
      el('div', {}, [
        el('p', { class: 'identity__name', text: user.displayName }),
        el('p', { class: 'identity__org', text: user.email ?? '' }),
        el('p', {
          class: 'identity__since',
          text: joinedText((user.createdAtUtc ?? '').slice(0, 7)),
        }),
      ]),
    ]);
  }

  function signedIn(user) {
    const carryOn = el(
      'button',
      {
        type: 'button',
        class: 'pill pill--primary',
        onclick: () => {
          announce?.(`${VERIFIED_LABEL}. ${user.displayName}.`);
          onVerify?.();
        },
      },
      say.carryOn(user.displayName)
    );
    return [
      personCard(user),
      verifiedChip(),
      note(),
      el('div', { class: 'identity__actions' }, [
        carryOn,
        el(
          'button',
          {
            type: 'button',
            class: 'linkish',
            onclick: () => {
              session.signOut();
              announce?.(say.signedOutAgain);
              render();
              focusFirst();
            },
          },
          'Not you — sign in as someone else'
        ),
        onCancel
          ? el('button', { type: 'button', class: 'linkish', onclick: () => onCancel() }, say.cancel)
          : null,
      ].filter(Boolean)),
    ];
  }

  // ── signing in ────────────────────────────────────────────────────────────

  async function enter(email, displayName) {
    if (busy) return;
    busy = true;
    problem = '';
    render();
    try {
      const user = await session.signIn({ email, displayName });
      announce?.(`${VERIFIED_LABEL}. ${user.displayName}.`);
    } catch (error) {
      problem =
        error?.status === 0
          ? 'Steeple could not be reached just now. Try again in a moment.'
          : (error?.detail ??
            'That sign-in did not go through. Check the address and try again.');
    } finally {
      busy = false;
      render();
      focusFirst();
    }
  }

  const email = el('input', {
    class: 'field__input',
    id: 'identity-email',
    type: 'email',
    autocomplete: 'email',
    placeholder: 'you@example.org',
  });
  const name = el('input', {
    class: 'field__input',
    id: 'identity-name',
    type: 'text',
    autocomplete: 'name',
    placeholder: 'Your name',
  });

  const form = el('form', { class: 'identity__form', novalidate: true }, [
    el('div', { class: 'field' }, [
      el('label', { class: 'field__label', for: 'identity-email', text: 'Email' }),
      email,
    ]),
    el('div', { class: 'field' }, [
      el('label', { class: 'field__label', for: 'identity-name', text: 'Your name' }),
      name,
    ]),
    el('button', { type: 'submit', class: 'pill' }, 'Continue'),
  ]);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const address = email.value.trim();
    if (!address.includes('@')) {
      problem = say.missingEmail;
      render();
      email.focus();
      return;
    }
    enter(address, name.value.trim());
  });

  function note() {
    return problem ? el('p', { class: 'identity__problem', role: 'alert', text: problem }) : null;
  }

  // Signed out, the panel shows one thing at a time: the people this village
  // knows, or a pair of fields for anyone else. Both on screen at once made a
  // sign-in card taller than the request behind it. Which comes first is the
  // caller's to say — the organizers this village knows are the people asking
  // for a room, not the people who keep one.
  // With no one-tap addresses to offer — every build that is not a dev build —
  // there is only one way in, and no switch between two.
  const opensOn = () => (PERSONAS.length ? (say.start ?? 'people') : 'email');
  let asking = opensOn();

  function swapTo(next) {
    asking = next;
    problem = '';
    render();
    focusFirst();
  }

  const quietActions = (...extra) =>
    el('div', { class: 'identity__actions identity__actions--quiet' }, [
      ...extra,
      onCancel
        ? el('button', { type: 'button', class: 'linkish', onclick: () => onCancel() }, say.cancel)
        : null,
    ].filter(Boolean));

  function people() {
    return [
      say.peopleEyebrow
        ? el('p', { class: 'eyebrow identity__eyebrow', text: say.peopleEyebrow })
        : null,
      el(
        'div',
        { class: 'identity__people' },
        PERSONAS.map((persona) =>
          el(
            'button',
            {
              type: 'button',
              class: 'identity__person',
              disabled: busy,
              onclick: () => enter(persona.email, persona.name),
            },
            [
              el('span', { class: 'identity__initials', 'aria-hidden': 'true', text: initialsOf(persona.name) }),
              el('span', { class: 'identity__personwords' }, [
                el('span', { class: 'identity__name', text: persona.name }),
                el('span', { class: 'identity__org', text: persona.org }),
              ]),
            ]
          )
        )
      ),
      note(),
      quietActions(
        el(
          'button',
          { type: 'button', class: 'linkish', onclick: () => swapTo('email') },
          'Someone else — use an email'
        )
      ),
    ];
  }

  function byEmail() {
    return [
      say.formEyebrow
        ? el('p', { class: 'eyebrow identity__eyebrow', text: say.formEyebrow })
        : null,
      form,
      el('p', {
        class: 'identity__fineprint',
        text: 'Any address works here — the account is made the first time it is used.',
      }),
      note(),
      quietActions(
        PERSONAS.length
          ? el(
              'button',
              { type: 'button', class: 'linkish', onclick: () => swapTo('people') },
              'Choose from the list instead'
            )
          : null
      ),
    ];
  }

  /**
   * A flow whose door is a session has no sign-in form inside it. Being here
   * without one means the session ended under somebody, so that is what it says.
   */
  function sessionGone() {
    return [
      el('p', {
        class: 'prose prose--sm',
        text: 'You have been signed out. Sign in from the top of the page and what you have written here is still waiting.',
      }),
      note(),
      quietActions(),
    ];
  }

  const signedOut = () =>
    requireSession ? sessionGone() : asking === 'email' ? byEmail() : people();

  function render() {
    const user = session.currentUser();
    element.classList.toggle('is-verified', Boolean(user));
    element.classList.toggle('is-signing', busy);
    replaceChildren(body, user ? signedIn(user) : signedOut().filter(Boolean));
    // Set from the flag, never only to true: the sign-in form survives a redraw,
    // so a field disabled while waiting stays disabled unless it is told back.
    for (const control of body.querySelectorAll('button, input')) control.disabled = busy;
  }

  function focusFirst() {
    const first = body.querySelector('.pill--primary, .identity__person, input');
    first?.focus();
  }

  session.onSessionChange(() => {
    if (!element.hidden) render();
  });

  render();

  return {
    element,
    focus: () => element.focus(),
    /** Only a real session earns the chip, and only it lets a request be sent. */
    get verified() {
      return session.isSignedIn();
    },
    /** Say something here — a refusal from the send that is about who is asking. */
    say(message) {
      problem = message ?? '';
      render();
    },
    reset() {
      problem = '';
      busy = false;
      asking = opensOn();
      render();
      // A session remembered from a previous visit may have gone stale while
      // the browser was closed. Ask before the guest commits to it rather than
      // after: an expired access token refreshes itself here, and a dead one
      // puts the panel back to signing in with nothing lost.
      if (session.isSignedIn()) session.fetchCurrentUser().then(() => render());
    },
  };
}
