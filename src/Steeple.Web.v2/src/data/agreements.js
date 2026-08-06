// WHAT SIGNING IN AGREES TO — the two documents, and whether this person has.
//
// Steeple records acceptance per (person, document, version): `GET /me` says
// what is on file and `POST /me/agreements` adds a row
// (`docs/contracts/identity.md`). A bump of a version here is what makes the
// next sign-in ask again, which is the whole mechanism — there is no "accepted
// everything forever" flag.
//
// The documents live beside this app as plain pages (`public/terms.html`,
// `public/privacy.html`). They began as the deprecated v1 web's text at v1's own
// version (`Steeple.Web.v1/Configuration/LegalDocuments.cs`, 2026-07-04) and were
// corrected where v1's words described a product v2 no longer is — payments taken
// through Steeple, a correspondence rather than an email to the venue, one cookie
// instead of two — so both moved to 2026-08-07 together. **Bump a version here in
// the same change as the page it belongs to**, or people will be asked to accept
// words that did not move.

import * as api from './api.js';
import * as session from './session.js';

/** The documents, in the order they are shown. */
export const DOCUMENTS = [
  { docType: 'tos', version: '2026-08-07', label: 'Terms & safety', href: 'terms.html' },
  { docType: 'privacy', version: '2026-08-07', label: 'Privacy policy', href: 'privacy.html' },
];

const isCurrent = (accepted, doc) =>
  (accepted ?? []).some((row) => row.docType === doc.docType && row.version === doc.version);

/**
 * Which of the current documents this person has not accepted yet.
 *
 * An unanswerable question — no session, or steeple away — answers "none
 * outstanding": an acceptance nobody can record is not a gate anybody should be
 * held at, and the next sign-in asks again anyway.
 *
 * @returns {Promise<Array<typeof DOCUMENTS[number]>>}
 */
export async function outstanding() {
  if (!session.isSignedIn()) return [];
  try {
    const me = await session.withAccess((token) => api.getMe(token));
    return DOCUMENTS.filter((doc) => !isCurrent(me?.agreements, doc));
  } catch {
    return [];
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
