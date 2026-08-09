// Stable product vocabulary shared by the mirror, wire mapping and dev fixture.

import { WIRE_TOKEN_SETS } from '../wireTokens.js';

export const APP_STATUS = Object.freeze(
  Object.fromEntries(WIRE_TOKEN_SETS.applicationStatuses.map((token) => [token, token]))
);

export const UNDECIDED = new Set([
  APP_STATUS.pending,
  APP_STATUS.needsInfo,
  APP_STATUS.counterOffered,
]);

export const COUNTER_STATUS = Object.freeze(
  Object.fromEntries(WIRE_TOKEN_SETS.counterOfferStatuses.map((token) => [token, token]))
);

export const DAY_LABELS = WIRE_TOKEN_SETS.weekdays.map(
  (day) => day[0].toUpperCase() + day.slice(1)
);

export const DAY_TOKENS = WIRE_TOKEN_SETS.weekdays;

/** The label the demo fixture's letters are written under. Not an identity. */
export const GUEST_ID = 'maria-alvarez';

export const ORGANIZERS = {
  'maria-alvarez': { name: 'Maria Alvarez', org: 'Little Sparrows Playgroup', verified: true, joined: '2025-09' },
  'daniel-okafor': { name: 'Daniel Okafor', org: 'Vienna Woods Chess Club', verified: true, joined: '2024-11' },
  'priya-raman': { name: 'Priya Raman', org: 'ESL Conversation Circle', verified: true, joined: '2025-03' },
  'sam-whitfield': { name: 'Sam Whitfield', org: 'Vienna Community Chorale', verified: true, joined: '2024-06' },
};
