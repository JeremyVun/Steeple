// PUBLIC FEATURE FLAGS — one fail-closed snapshot from Steeple.
//
// The API owns rule evaluation. The browser receives only its allowlisted
// boolean result and keeps that snapshot in memory for the life of the page.

import { getPublicFlags } from './api.js';

let heldSnapshot = null;

async function snapshot() {
  if (!heldSnapshot) {
    heldSnapshot = getPublicFlags({ platform: 'web' }).catch((error) => {
      heldSnapshot = null;
      throw error;
    });
  }
  return heldSnapshot;
}

/** Unknown flags and an unavailable flags endpoint are both safely off. */
export async function isEnabled(key) {
  try {
    const flags = await snapshot();
    return flags?.[key] === true;
  } catch {
    return false;
  }
}
