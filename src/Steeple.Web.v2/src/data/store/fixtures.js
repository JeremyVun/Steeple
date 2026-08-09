import { APP_STATUS, COUNTER_STATUS, DAY_LABELS, GUEST_ID } from './model.js';
import { addDays, daysToMask, nextWeekday } from './schedule.js';

const EXPIRY_DAYS = 14;
const MS_DAY = 86400000;
const SEED_VERSION = 1;

/** An empty village: what a production build starts from, and starts with. */
function empty() {
  return {
    seedVersion: SEED_VERSION,
    applications: [],
    counterOffers: [],
    messages: [],
    bookings: [],
    occurrences: [],
    openHours: {},
    blackouts: {},
    roomEdits: {},
    placedVenues: [],
    homePin: null,
    hostVenueId: 'grace-community-vienna',
  };
}

export function createStoreSeed({ demo, venues, today, roomKey, materializeDates }) {
  // The demo correspondence is a fixture of the dev village — the letters the
  // desk finds waiting, the hours its rooms keep. It is not somebody's data and
  // it does not ship: a production build starts every namespace empty.
  if (!demo) return empty();

  const at = (daysAgo) => new Date(Date.now() - daysAgo * MS_DAY).toISOString();
  const expiry = (createdAt) => new Date(Date.parse(createdAt) + EXPIRY_DAYS * MS_DAY).toISOString();

  const openHours = {};
  for (const venue of venues) {
    for (const room of venue.rooms) {
      if (room.status !== 'published') continue;
      openHours[roomKey(venue.id, room.id)] = DAY_LABELS.map((_, day) => ({
        day,
        start: '08:00',
        end: '22:00',
      }));
    }
  }

  const festival = nextWeekday(addDays(today, 15), 6);
  const blackouts = {
    'grace-community-vienna/fellowship-hall': [{ date: festival, reason: 'Parish festival' }],
  };

  const applications = [];
  const counterOffers = [];
  const messages = [];
  const bookings = [];
  const occurrences = [];

  const add = (app) => (applications.push(app), app);
  const bookSeed = (app) => {
    const booking = {
      id: `booking-${app.id}`,
      applicationId: app.id,
      venueId: app.venueId,
      roomId: app.roomId,
      organizerId: app.organizerId,
      frequency: app.frequency,
      startDate: app.startDate,
      endDate: app.endDate ?? app.startDate,
      daysOfWeekMask: app.daysOfWeekMask,
      startTime: app.startTime,
      endTime: app.endTime,
      status: 'confirmed',
      createdAt: app.decidedAt,
    };
    bookings.push(booking);
    const key = roomKey(app.venueId, app.roomId);
    for (const date of materializeDates(app, blackouts[key] ?? [])) {
      occurrences.push({
        id: `${booking.id}-${date}`,
        bookingId: booking.id,
        roomKey: key,
        date,
        start: app.startTime,
        end: app.endTime,
        status: 'scheduled',
      });
    }
  };

  // Maria, pending — the letter the host desk will find waiting.
  add({
    id: 'app-sparrows-mornings',
    venueId: 'grace-community-vienna',
    roomId: 'youth-activity-room',
    organizerId: GUEST_ID,
    activityType: 'Children',
    groupSize: 24,
    frequency: 'weekly',
    startDate: nextWeekday(addDays(today, 7), 2),
    endDate: addDays(nextWeekday(addDays(today, 7), 2), 70),
    daysOfWeekMask: daysToMask([2, 4]),
    startTime: '09:30',
    endTime: '11:30',
    intentText:
      'Little Sparrows is a parent-run playgroup for children under four. We would love a regular Tuesday and Thursday morning: songs, free play and a shared snack, with every child accompanied by a parent or carer. We bring our own mats and toys and leave the room as we found it.',
    status: APP_STATUS.pending,
    createdAt: at(2),
    decidedAt: null,
    expiresAt: expiry(at(2)),
  });

  // Maria, needsInfo — a question in the thread, ball in her court.
  add({
    id: 'app-sparrows-craft',
    venueId: 'dunn-loring-umc',
    roomId: 'art-studio',
    organizerId: GUEST_ID,
    activityType: 'Children',
    groupSize: 18,
    frequency: 'oneOff',
    startDate: nextWeekday(addDays(today, 10), 6),
    endDate: null,
    daysOfWeekMask: null,
    startTime: '10:00',
    endTime: '12:00',
    intentText:
      'A one-off family craft morning for our playgroup: simple painting and collage for little ones, with parents alongside. Around twelve children and six adults.',
    status: APP_STATUS.needsInfo,
    createdAt: at(4),
    decidedAt: null,
    expiresAt: expiry(at(4)),
  });
  messages.push({
    id: 'msg-craft-question',
    applicationId: 'app-sparrows-craft',
    sender: 'host',
    body: 'Lovely to hear from you. Could you tell us how many adults will be with the children, and whether you plan to use paints? We cover the tables for messy work and can have that ready.',
    sentAt: at(1),
  });

  // Maria, counterOffered — the host proposed Thursdays instead.
  add({
    id: 'app-sparrows-stories',
    venueId: 'vienna-presbyterian',
    roomId: 'garden-meeting-room',
    organizerId: GUEST_ID,
    activityType: 'Community',
    groupSize: 14,
    frequency: 'weekly',
    startDate: nextWeekday(addDays(today, 7), 2),
    endDate: addDays(nextWeekday(addDays(today, 7), 2), 56),
    daysOfWeekMask: daysToMask([2]),
    startTime: '10:00',
    endTime: '11:30',
    intentText:
      'A quiet weekly story and rhyme hour for parents and babies, run with our neighborhood library volunteer. We would keep numbers small and the room calm.',
    status: APP_STATUS.counterOffered,
    createdAt: at(5),
    decidedAt: null,
    expiresAt: expiry(at(5)),
  });
  counterOffers.push({
    id: 'counter-stories-thursday',
    applicationId: 'app-sparrows-stories',
    frequency: 'weekly',
    startDate: nextWeekday(addDays(today, 7), 4),
    endDate: addDays(nextWeekday(addDays(today, 7), 4), 56),
    daysOfWeekMask: daysToMask([4]),
    startTime: '10:00',
    endTime: '11:30',
    message:
      'Tuesday mornings are held by our quilting circle through the autumn. Thursdays at the same hour are free, and the garden is at its quietest then — would that suit your group?',
    status: COUNTER_STATUS.open,
    createdAt: at(1),
    respondedAt: null,
  });

  // Maria, approved — a booking mid-term, occurrences behind and ahead.
  const lounge = add({
    id: 'app-sparrows-lounge',
    venueId: 'dunn-loring-umc',
    roomId: 'community-lounge',
    organizerId: GUEST_ID,
    activityType: 'Community',
    groupSize: 16,
    frequency: 'weekly',
    startDate: nextWeekday(addDays(today, -21), 3),
    endDate: addDays(nextWeekday(addDays(today, -21), 3), 63),
    daysOfWeekMask: daysToMask([3]),
    startTime: '09:30',
    endTime: '11:30',
    intentText:
      'A weekly coffee morning for new parents in the neighborhood — a chance to meet, share advice and let the littlest ones nap in the quiet.',
    status: APP_STATUS.approved,
    createdAt: at(31),
    decidedAt: at(28),
    expiresAt: expiry(at(31)),
  });
  bookSeed(lounge);

  // Maria, declined — a kind no, kept in the record.
  add({
    id: 'app-sparrows-sports',
    venueId: 'oakton-baptist',
    roomId: 'gymnasium',
    organizerId: GUEST_ID,
    activityType: 'Children',
    groupSize: 40,
    frequency: 'oneOff',
    startDate: nextWeekday(addDays(today, -14), 6),
    endDate: null,
    daysOfWeekMask: null,
    startTime: '15:00',
    endTime: '17:00',
    intentText:
      'An afternoon of soft play and parachute games for our playgroup families and friends — a summer get-together before the new term.',
    status: APP_STATUS.declined,
    createdAt: at(20),
    decidedAt: at(16),
    declineNote:
      'Thank you for thinking of us. The gym floor is being resurfaced that fortnight and we cannot host visiting groups. Grace Community or Vienna Presbyterian may well have space — we are sorry to miss you.',
    expiresAt: expiry(at(20)),
  });
  messages.push({
    id: 'msg-sports-decline',
    applicationId: 'app-sparrows-sports',
    sender: 'host',
    body: 'Thank you for thinking of us. The gym floor is being resurfaced that fortnight and we cannot host visiting groups. Grace Community or Vienna Presbyterian may well have space — we are sorry to miss you.',
    sentAt: at(16),
  });

  // The chorale, approved — Thursday evenings in the hall the chess club wants.
  const chorale = add({
    id: 'app-chorale-thursdays',
    venueId: 'grace-community-vienna',
    roomId: 'fellowship-hall',
    organizerId: 'sam-whitfield',
    activityType: 'Music',
    groupSize: 48,
    frequency: 'weekly',
    startDate: nextWeekday(addDays(today, -35), 4),
    endDate: addDays(nextWeekday(addDays(today, -35), 4), 105),
    daysOfWeekMask: daysToMask([4]),
    startTime: '19:00',
    endTime: '21:30',
    intentText:
      'The Vienna Community Chorale rehearses weekly ahead of our winter concerts. We are around fifty singers, we use the stage and piano, and we finish by half past nine.',
    status: APP_STATUS.approved,
    createdAt: at(42),
    decidedAt: at(40),
    expiresAt: expiry(at(42)),
  });
  bookSeed(chorale);

  // The chess club, pending — asks for Thursday evenings too. The desk's
  // schedule ribbon shows exactly where it collides with the chorale.
  add({
    id: 'app-chess-club',
    venueId: 'grace-community-vienna',
    roomId: 'fellowship-hall',
    organizerId: 'daniel-okafor',
    activityType: 'Community',
    groupSize: 24,
    frequency: 'weekly',
    startDate: nextWeekday(addDays(today, 5), 4),
    endDate: addDays(nextWeekday(addDays(today, 5), 4), 84),
    daysOfWeekMask: daysToMask([4]),
    startTime: '18:30',
    endTime: '21:00',
    intentText:
      'Vienna Woods Chess Club is looking for a regular club night. Twenty to twenty-four players, quiet by nature; we bring our own boards and clocks and only need tables, chairs and good light.',
    status: APP_STATUS.pending,
    createdAt: at(1),
    decidedAt: null,
    expiresAt: expiry(at(1)),
  });

  // The conversation circle, pending and clean — approvable on the spot.
  add({
    id: 'app-esl-evenings',
    venueId: 'grace-community-vienna',
    roomId: 'youth-activity-room',
    organizerId: 'priya-raman',
    activityType: 'Education',
    groupSize: 16,
    frequency: 'weekly',
    startDate: nextWeekday(addDays(today, 6), 1),
    endDate: addDays(nextWeekday(addDays(today, 6), 1), 77),
    daysOfWeekMask: daysToMask([1, 3]),
    startTime: '18:00',
    endTime: '19:30',
    intentText:
      'Our ESL conversation circle pairs new neighbors with volunteer partners for an hour and a half of practice and coffee. We are settled, friendly and tidy — sixteen of us on a good evening.',
    status: APP_STATUS.pending,
    createdAt: at(3),
    decidedAt: null,
    expiresAt: expiry(at(3)),
  });

  return {
    seedVersion: SEED_VERSION,
    applications,
    counterOffers,
    messages,
    bookings,
    occurrences,
    openHours,
    blackouts,
    roomEdits: {},
    placedVenues: [],
    homePin: null,
    hostVenueId: 'grace-community-vienna',
  };
}

