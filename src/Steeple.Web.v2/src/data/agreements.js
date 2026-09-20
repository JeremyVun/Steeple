// WHAT SIGNING IN AGREES TO — the two documents, and whether this person has.
//
// Steeple records acceptance per (person, document, version): `GET /me` says
// what is on file and `POST /me/agreements` adds a row
// (`docs/contracts/identity.md`). A bump of a version here is what makes the
// next sign-in ask again, which is the whole mechanism — there is no "accepted
// everything forever" flag.
//
// Bump the page, API policy and both clients together whenever document text changes.
// The production API is the authority; this client prompt cannot bypass its gate.

import * as api from './api.js';
import * as session from './session.js';

/** The documents, in the order they are shown. */
export const DOCUMENTS = [
  { docType: 'tos', version: '2026-09-20', label: 'Terms & safety', href: 'terms.html' },
  { docType: 'privacy', version: '2026-09-20', label: 'Privacy policy', href: 'privacy.html' },
];

const isCurrent = (accepted, doc) =>
  (accepted ?? []).some((row) => row.docType === doc.docType && row.version === doc.version);

/**
 * Which of the current documents this person has not accepted yet.
 *
 * If the record cannot be read, keep the gate open. Acceptance writes are idempotent.
 *
 * @returns {Promise<Array<typeof DOCUMENTS[number]>>}
 */
export async function outstanding() {
  if (!session.isSignedIn()) return [];
  try {
    const me = await session.withAccess((token) => api.getMe(token));
    return DOCUMENTS.filter((doc) => !isCurrent(me?.agreements, doc));
  } catch {
    // An unreadable acceptance record cannot grant access. The idempotent write
    // will either record the user's explicit acceptance or leave this gate open.
    return DOCUMENTS;
  }
}

/**
 * Record acceptance of each document handed in. Idempotent per (person, doc,
 * version) at steeple, so a double press costs nothing.
 *
 * @param {Array<{docType:string,version:string}>} documents
 * @returns {Promise<{ok:boolean}>}
 */
export async function accept(documents = DOCUMENTS) {
  try {
    for (const doc of documents) {
      await session.withAccess((token) =>
        api.acceptAgreement(doc.docType, doc.version, { accessToken: token })
      );
    }
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
