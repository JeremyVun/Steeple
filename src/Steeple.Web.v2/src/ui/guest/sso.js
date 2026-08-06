// The identity beat — one calm step at the commitment point, and nowhere else.
//
// Steeple verifies a person once so a host knows a real neighbour is asking;
// the wording of the trust chip is fixed brand language, and it is only ever
// shown once a real session exists. Nothing here pretends: signing in calls
// steeple's own /auth/sessions, and what comes back is an account the API will
// recognise when the request is sent a moment later.
//
// Two states, one panel:
//   · no session  — the ways in this build was given. In production that is
//     Google and Apple, and nothing else; in a dev build it is also the people
//     already seeded in this village, offered by name, and a plain email + name
//     for anyone else, because the dev provider creates the account the first
//     time it sees an address.
//   · a session   — the person, the chip, whatever they have not yet agreed to,
//     and one button that carries on.
//
// Which providers exist is not a flag this file keeps: a build made without
// `VITE_GOOGLE_CLIENT_ID` has no Google button because there is no client id to
// render one with (data/providers.js). Same for Apple, and same for Turnstile —
// with no site key there is no widget and every token this panel sends is null,
// which is exactly what the local loop has always sent (v2_migration D1/D7).

import { DOCUMENTS, accept as acceptAgreements, outstanding } from '../../data/agreements.js';
import {
  SignInCancelled,
  appleConfigured,
  googleConfigured,
  mountGoogleButton,
  signInWithApple,
} from '../../data/providers.js';
import * as session from '../../data/session.js';
import * as turnstile from '../../data/turnstile.js';
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

/** The Apple mark, at the weight their guidance asks for beside the words. */
function appleMark() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 16 20');
  svg.setAttribute('width', '15');
  svg.setAttribute('height', '18');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute(
    'd',
    'M13.2 10.6c0-2.1 1.7-3.1 1.8-3.2-1-1.4-2.5-1.6-3-1.7-1.3-.1-2.5.8-3.2.8-.6 0-1.7-.7-2.8-.7-1.4 0-2.7.8-3.5 2.1-1.5 2.6-.4 6.4 1 8.5.7 1 1.6 2.2 2.7 2.1 1.1 0 1.5-.7 2.8-.7s1.7.7 2.8.7c1.2 0 1.9-1 2.6-2.1.8-1.2 1.2-2.4 1.2-2.4-.1 0-2.3-.9-2.4-3.4zM11.1 4.3c.6-.7 1-1.7.9-2.7-.9 0-2 .6-2.6 1.3-.6.6-1.1 1.7-.9 2.6 1 .1 2-.5 2.6-1.2z'
  );
  path.setAttribute('fill', 'currentColor');
  svg.append(path);
  return svg;
}

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
export function createIdentityStep({
  announce,
  onVerify,
  onCancel,
  onSettled,
  words = {},
  requireSession = false,
}) {
  const say = { ...GUEST_WORDS, ...words };
  let busy = false;
  let problem = '';

  const body = el('div', { class: 'identity__body' });

  // Turnstile renders an iframe, and an iframe that is moved in the DOM reloads
  // itself — so its host sits outside the part of this panel that redraws, and
  // is mounted exactly once. With no site key it is an empty hidden div.
  const check = el('div', { class: 'identity__check', hidden: !turnstile.configured() });
  const guard = turnstile.mount(check);

  const element = el('section', {
    class: 'identity',
    tabindex: '-1',
    'aria-label': say.title,
  }, [
    say.eyebrow ? el('p', { class: 'eyebrow', text: say.eyebrow }) : null,
    el('h2', { class: 'identity__title', text: say.title }),
    el('p', { class: 'prose prose--sm', text: say.blurb }),
    body,
    check,
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

  /**
   * The two documents, said once, where the person is about to agree to them.
   *
   * Steeple records acceptance against a version, so this is shown whenever the
   * version on file is not the current one — first sign-in, and again the day
   * the words change (`docs/contracts/identity.md`). It is a sentence and two
   * links, not a scroll-to-the-bottom ceremony: the pages are one press away and
   * they are short.
   */
  function agreementNote(documents) {
    const link = (doc) =>
      el('a', { class: 'linkish', href: doc.href, target: '_blank', rel: 'noopener' }, doc.label);
    const parts = [];
    documents.forEach((doc, index) => {
      if (index > 0) parts.push(index === documents.length - 1 ? ' and ' : ', ');
      parts.push(link(doc));
    });
    return el('p', { class: 'identity__legal prose prose--sm' }, ['Continuing accepts Steeple’s ', ...parts, '.']);
  }

  async function agreeAndCarryOn(user) {
    if (busy) return;
    busy = true;
    problem = '';
    render();
    const answer = await acceptAgreements(owed ?? DOCUMENTS);
    busy = false;
    if (!answer.ok) {
      problem = 'Steeple could not record that just now. Try again in a moment.';
      render();
      focusFirst();
      return;
    }
    owed = [];
    render();
    announce?.(`${VERIFIED_LABEL}. ${user.displayName}.`);
    onVerify?.();
  }

  function signedIn(user) {
    const toAgree = owed ?? [];
    const carryOn = el(
      'button',
      {
        type: 'button',
        class: 'pill pill--primary',
        onclick: () => {
          if (toAgree.length) {
            agreeAndCarryOn(user);
            return;
          }
          announce?.(`${VERIFIED_LABEL}. ${user.displayName}.`);
          onVerify?.();
        },
      },
      toAgree.length ? 'Agree and continue' : say.carryOn(user.displayName)
    );
    return [
      personCard(user),
      verifiedChip(),
      toAgree.length ? agreementNote(toAgree) : null,
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

  /**
   * One attempt, whichever door it came through.
   *
   * Every way in ends the same: a person, a chip, and — if steeple has not
   * recorded this version of the documents for them — one thing left to agree
   * to. A Turnstile token is spent by the verification it passes, so a finished
   * attempt asks for a fresh one: the send that follows needs its own.
   */
  async function arrive(work) {
    if (busy) return;
    busy = true;
    problem = '';
    render();
    try {
      const user = await work();
      announce?.(`${VERIFIED_LABEL}. ${user.displayName}.`);
      await readAgreements();
      guard.reset();
    } catch (error) {
      // Somebody closing the provider's own window has not failed at anything
      // and is owed no sentence about it.
      if (!(error instanceof SignInCancelled)) {
        problem = error?.timedOut
          ? 'Steeple is taking longer than usual to answer. Try again in a moment.'
          : error?.status === 0
            ? 'Steeple could not be reached just now. Try again in a moment.'
            : (error?.detail ??
              'That sign-in did not go through. Check the address and try again.');
        guard.reset();
      }
    } finally {
      busy = false;
      render();
      focusFirst();
      // A panel whose only question has been answered says so, and whoever
      // opened it decides what that is worth: the shelf shuts, a flow waits for
      // the person to press on. A panel still owed an acceptance is not done.
      if (session.isSignedIn() && !problem && !owed?.length) onSettled?.();
    }
  }

  const enter = (email, displayName) =>
    arrive(() => session.signIn({ email, displayName, turnstileToken: guard.token() }));

  const enterWithApple = () =>
    arrive(async () => {
      const credential = await signInWithApple();
      return session.signInWithProvider({ ...credential, turnstileToken: guard.token() });
    });

  /**
   * What this person still owes an acceptance for. `null` until steeple has
   * been asked, which is what keeps the panel from flashing an agreement prompt
   * at somebody who accepted the documents a year ago.
   */
  let owed = null;

  async function readAgreements() {
    if (!session.isSignedIn()) {
      owed = null;
      return;
    }
    owed = await outstanding();
    render();
    // A panel opened only to carry this question has nothing left to ask when
    // the answer is "nothing" — and it is the one that has to be told, because
    // it did not go through `arrive()` to get here.
    if (!owed.length) onSettled?.();
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

  // ── the ways in this build was given ──────────────────────────────────────
  //
  // Built once. Google renders its own button into a node it keeps, and a node
  // rebuilt on every redraw is a button that flickers and a nonce that changes
  // under an attempt already in flight.

  const googleHost = el('div', { class: 'identity__google' });
  let googleMounted = false;

  const providers =
    googleConfigured() || appleConfigured()
      ? el('div', { class: 'identity__providers' }, [
          googleConfigured() ? googleHost : null,
          appleConfigured()
            ? el(
                'button',
                {
                  type: 'button',
                  class: 'provider provider--apple',
                  onclick: () => enterWithApple(),
                },
                [appleMark(), el('span', { class: 'provider__label', text: 'Continue with Apple' })]
              )
            : null,
        ].filter(Boolean))
      : null;

  function ensureGoogle() {
    if (googleMounted || !googleConfigured()) return;
    googleMounted = true;
    mountGoogleButton(googleHost, {
      onCredential: (credential) =>
        arrive(() => session.signInWithProvider({ ...credential, turnstileToken: guard.token() })),
      onError: () => {
        problem = 'Google sign-in could not start just now. Try again in a moment.';
        render();
      },
    });
  }

  /**
   * A build with no provider configured and no dev provider to fall back on.
   * It cannot sign anybody in and says so, rather than showing a form that
   * every submission of would be refused.
   */
  const noWayIn = () => [
    el('p', {
      class: 'prose prose--sm',
      text: 'Signing in is not available on this build. Please try again later.',
    }),
    note(),
    quietActions(),
  ];

  function signedOut() {
    if (requireSession) return sessionGone();
    const ways = [];
    if (providers) {
      ensureGoogle();
      ways.push(providers);
    }
    // The dev provider is a development tool, not a second front door: a
    // production build has no email form and no persona shortcuts (D7).
    if (DEV) {
      if (providers) ways.push(el('p', { class: 'eyebrow identity__eyebrow', text: 'Or, in development' }));
      ways.push(...(asking === 'email' ? byEmail() : people()));
      return ways;
    }
    if (!providers) return noWayIn();
    ways.push(note(), quietActions());
    return ways;
  }

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
    /**
     * Whether this panel has nothing left to ask.
     *
     * `owed === null` is "steeple has not been asked yet", and it counts as
     * unsettled on purpose: the read is a round trip, and a panel that called
     * itself finished during it would be closed by the very session change that
     * started the read (`fetchCurrentUser` rotates the pair and tells every
     * watcher), taking the agreement prompt with it before it rendered.
     */
    settled: () => !busy && session.isSignedIn() && owed !== null && owed.length === 0,
    /** The Turnstile token this panel is holding, for the write that follows. */
    turnstileToken: () => guard.token(),
    resetTurnstile: () => guard.reset(),
    reset() {
      problem = '';
      busy = false;
      asking = opensOn();
      render();
      // A session remembered from a previous visit may have gone stale while
      // the browser was closed. Ask before the guest commits to it rather than
      // after: an expired access token refreshes itself here, and a dead one
      // puts the panel back to signing in with nothing lost. The same read
      // answers what this person still owes an acceptance for.
      if (session.isSignedIn()) {
        session.fetchCurrentUser().then(() => {
          render();
          readAgreements();
        });
      }
    },
  };
}
