// TURNSTILE — Cloudflare's "are you a browser" check, where steeple asks for one.
//
// Two places take a token: signing in (`POST /auth/sessions`) and sending a
// request (`POST /listings/{id}/applications`). Both fields exist on the wire
// already and both have been sending null; this is what fills them.
//
// **No site key, no widget.** `VITE_TURNSTILE_SITE_KEY` absent — every local
// build, every harness run — and this module renders nothing, returns null, and
// costs one boolean. The API is the same shape from the other side: without
// `Turnstile__SecretKey` it does not check, so the dev loop is untouched
// (v2_migration D7).
//
// A widget is mounted into a host element the caller owns and keeps: Turnstile
// renders an iframe, and moving an iframe in the DOM reloads it, so a surface
// that redraws must hand this a node it never replaces.

const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY ?? '';

const SDK = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

/** Whether this build was given a site key at all. */
export const configured = () => Boolean(SITE_KEY);

let loading = null;

function loadSdk() {
  loading ??= new Promise((resolve, reject) => {
    const tag = document.createElement('script');
    tag.src = SDK;
    tag.async = true;
    tag.defer = true;
    tag.addEventListener('load', () => resolve(true));
    tag.addEventListener('error', () => {
      loading = null;
      reject(new Error('Turnstile could not be loaded'));
    });
    document.head.append(tag);
  });
  return loading;
}

/**
 * A widget in one host element.
 *
 * The handle is deliberately dull: `token()` is whatever Cloudflare last
 * answered with (null until it has, and null again once it expires), and
 * `reset()` asks for a fresh one — which is what a refused submit needs, since
 * a token is spent by the first verification.
 *
 * Unconfigured builds get a handle that says null forever, so callers never
 * branch on whether Turnstile exists; they just pass what they were given.
 *
 * @param {HTMLElement} host
 * @param {{onToken?:(token:string|null)=>void}} [handlers]
 * @returns {{token:()=>string|null, reset:()=>void, ready:Promise<boolean>}}
 */
export function mount(host, { onToken } = {}) {
  if (!configured() || !host) {
    return { token: () => null, reset: () => {}, ready: Promise.resolve(false) };
  }

  let token = null;
  let widgetId = null;

  const settle = (next) => {
    token = next;
    onToken?.(next);
  };

  const ready = loadSdk()
    .then(() => {
      const turnstile = globalThis.turnstile;
      if (!turnstile) return false;
      widgetId = turnstile.render(host, {
        sitekey: SITE_KEY,
        theme: 'light',
        size: 'flexible',
        callback: (value) => settle(value),
        'expired-callback': () => settle(null),
        // A check that could not run is not a person who failed it: the token
        // stays null and steeple refuses the write with its own words, rather
        // than this surface inventing a verdict.
        'error-callback': () => settle(null),
      });
      return true;
    })
    .catch(() => false);

  return {
    token: () => token,
    reset: () => {
      settle(null);
      if (widgetId !== null) globalThis.turnstile?.reset?.(widgetId);
    },
    ready,
  };
}
