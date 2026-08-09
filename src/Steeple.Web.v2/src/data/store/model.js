// Stable product vocabulary shared by the mirror, wire mapping and dev fixture.

export const APP_STATUS = {
  pending: 'pending',
  needsInfo: 'needsInfo',
  counterOffered: 'counterOffered',
  approved: 'approved',
  declined: 'declined',
  withdrawn: 'withdrawn',
  expired: 'expired',
};

export const UNDECIDED = new Set([
  APP_STATUS.pending,
  APP_STATUS.needsInfo,
  APP_STATUS.counterOffered,
]);

export const COUNTER_STATUS = {
  open: 'open',
  accepted: 'accepted',
  declinedByOrganizer: 'declinedByOrganizer',
  superseded: 'superseded',
  lapsed: 'lapsed',
};

export const DAY_LABELS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

export const DAY_TOKENS = DAY_LABELS.map((day) => day.toLowerCase());

/** The label the demo fixture's letters are written under. Not an identity. */
export const GUEST_ID = 'maria-alvarez';

export const ORGANIZERS = {
  'maria-alvarez': { name: 'Maria Alvarez', org: 'Little Sparrows Playgroup', verified: true, joined: '2025-09' },
  'daniel-okafor': { name: 'Daniel Okafor', org: 'Vienna Woods Chess Club', verified: true, joined: '2024-11' },
  'priya-raman': { name: 'Priya Raman', org: 'ESL Conversation Circle', verified: true, joined: '2025-03' },
  'sam-whitfield': { name: 'Sam Whitfield', org: 'Vienna Community Chorale', verified: true, joined: '2024-06' },
};
