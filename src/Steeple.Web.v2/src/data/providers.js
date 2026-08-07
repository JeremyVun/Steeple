// THE PROVIDERS — Google and Apple, and the two scripts that carry them.
//
// This is the only file in the app that knows a third party exists. Each
// provider loads its own SDK the first time somebody actually goes to sign in
// — never at boot, because a visit that ends on the map should not pay for a
// sign-in that never happens — asks it for an ID token, and hands back exactly
// the shape `POST /auth/sessions` wants (`docs/contracts/identity.md`). Nothing
// here holds a session: that is data/session.js's alone.
//
// **A provider with no client id configured is not offered at all.** Reading
// the env var is the whole feature flag (v2_migration D1/D7): a build made
// without `VITE_GOOGLE_CLIENT_ID` renders no Google button, and a local dev
// build with neither is the dev-provider panel exactly as it was.
//
// The nonce binds the token to this attempt. Google puts the value we hand it
// into the token's `nonce` claim verbatim, and the API compares the two
// (`OidcIdTokenVerifier`). Apple's JS library SHA-256-hashes the nonce before
// it travels, and we send steeple the raw one — the same convention the mobile
// app already follows (`mobile/lib/core/auth/api_session_manager.dart`, which
// hashes by hand because its native SDK does not). Keeping both clients on one
// convention means one answer fixes both if the deployed environment disagrees.

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '';
const APPLE_CLIENT_ID = import.meta.env.VITE_APPLE_CLIENT_ID ?? '';
const APPLE_REDIRECT_URI = import.meta.env.VITE_APPLE_REDIRECT_URI ?? '';

const GOOGLE_SDK = 'https://accounts.google.com/gsi/client';
const APPLE_SDK =
  'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js';

/** Whether this build was given a Google client id. */
export const googleConfigured = () => Boolean(GOOGLE_CLIENT_ID);

/**
 * Whether this build was given an Apple Services ID **and** the redirect URI
 * Apple will check it against. Apple refuses the popup without both, so half a
 * configuration is no configuration.
 */
export const appleConfigured = () => Boolean(APPLE_CLIENT_ID && APPLE_REDIRECT_URI);

/** Whether there is a real way in at all, or only the dev provider. */
export const anyProviderConfigured = () => googleConfigured() || appleConfigured();

/** A sign-in the person themselves called off. Not a failure to report. */
export class SignInCancelled extends Error {
  constructor() {
    super('sign-in cancelled');
    this.name = 'SignInCancelled';
  }
}

const scripts = new Map();

/** One tag per URL, however many callers ask, and the promise is the answer. */
function loadScript(src) {
  if (scripts.has(src)) return scripts.get(src);
  const loading = new Promise((resolve, reject) => {
    const tag = document.createElement('script');
    tag.src = src;
    tag.async = true;
    tag.defer = true;
    tag.addEventListener('load', () => resolve(true));
    tag.addEventListener('error', () => {
      scripts.delete(src);
      reject(new Error(`${src} could not be loaded`));
    });
    document.head.append(tag);
  });
  scripts.set(src, loading);
  return loading;
}

/** 128 bits of randomness as hex — long enough to be a nonce, short enough to read. */
export function newNonce() {
  const bytes = new Uint8Array(16);
  globalThis.crypto?.getRandomValues?.(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Google's own button, rendered into a container this app owns.
 *
 * The ID token arrives at the callback rather than as a return value — that is
 * the shape of Google Identity Services — so the caller hands in what to do
 * with it. The nonce is minted per mount and travels with the token.
 *
 * @param {HTMLElement} container
 * @param {{onCredential:(c:{provider:string,idToken:string,nonce:string,displayName:null})=>void,
 *          onError?:(e:Error)=>void}} handlers
 */
// GIS keeps exactly one initialize() per page and warns on every repeat, so the
// nonce and the callback's handlers are minted once and the handlers swapped on
// each later mount. The nonce is therefore per page-load rather than per mount —
// still single-use at the API, which is what it is for.
let googleAttempt = null;

export async function mountGoogleButton(container, { onCredential, onError } = {}) {
  if (!googleConfigured()) return false;
  try {
    await loadScript(GOOGLE_SDK);
  } catch (error) {
    onError?.(error);
    return false;
  }
  const google = globalThis.google?.accounts?.id;
  if (!google) {
    onError?.(new Error('Google Identity Services did not start'));
    return false;
  }

  if (googleAttempt) {
    googleAttempt.handlers = { onCredential, onError };
  } else {
    googleAttempt = { nonce: newNonce(), handlers: { onCredential, onError } };
    google.initialize({
      client_id: GOOGLE_CLIENT_ID,
      nonce: googleAttempt.nonce,
      ux_mode: 'popup',
      // Nothing is auto-selected: a shared browser must never sign somebody in
      // because the last person here used it.
      auto_select: false,
      itp_support: true,
      callback: (response) => {
        const { onCredential: credential, onError: failed } = googleAttempt.handlers;
        if (!response?.credential) {
          failed?.(new Error('Google returned no credential'));
          return;
        }
        credential?.({
          provider: 'google',
          idToken: response.credential,
          nonce: googleAttempt.nonce,
          // Google's ID token already carries the name; steeple reads it there.
          displayName: null,
        });
      },
    });
  }

  container.replaceChildren();
  google.renderButton(container, {
    type: 'standard',
    theme: 'outline',
    size: 'large',
    shape: 'pill',
    text: 'continue_with',
    logo_alignment: 'center',
  });
  return true;
}

/**
 * Sign in with Apple, in a popup this call owns.
 *
 * `response_type=code id_token` is the whole flow: the ID token comes back in
 * the authorization response, so there is no code to exchange, no client secret
 * to sign, and no `.p8` anywhere near this app (SYSTEM_DESIGN §17, 2026-07-04).
 * Apple sends the person's name exactly once — in this response, never in the
 * token — so it travels as `displayName`, which the API honours only when it is
 * creating the account.
 *
 * @returns {Promise<{provider:string,idToken:string,nonce:string,displayName:string|null}>}
 * @throws {SignInCancelled} when the person closed the popup themselves.
 */
export async function signInWithApple() {
  if (!appleConfigured()) throw new Error('Apple sign-in is not configured');
  await loadScript(APPLE_SDK);
  const AppleID = globalThis.AppleID;
  if (!AppleID?.auth) throw new Error('Sign in with Apple did not start');

  const nonce = newNonce();
  // init is not idempotent in a useful way — re-initializing per attempt is
  // what keeps each attempt's nonce its own.
  AppleID.auth.init({
    clientId: APPLE_CLIENT_ID,
    scope: 'name email',
    redirectURI: APPLE_REDIRECT_URI,
    responseType: 'code id_token',
    responseMode: 'web_message',
    usePopup: true,
    nonce,
  });

  let answer;
  try {
    answer = await AppleID.auth.signIn();
  } catch (error) {
    // Apple's own vocabulary for "they pressed cancel", which is not an error
    // anybody needs a sentence about.
    if (error?.error === 'popup_closed_by_user' || error?.error === 'user_cancelled_authorize') {
      throw new SignInCancelled();
    }
    throw new Error(error?.error ?? 'Apple sign-in did not complete');
  }

  const idToken = answer?.authorization?.id_token ?? null;
  if (!idToken) throw new Error('Apple returned no identity token');

  const given = answer?.user?.name?.firstName ?? '';
  const family = answer?.user?.name?.lastName ?? '';
  const displayName = `${given} ${family}`.trim();

  return { provider: 'apple', idToken, nonce, displayName: displayName || null };
}
