// SCENERY — the 3D village's dataset, and the seed data/bundledCatalog.js
// answers from when nothing served /api/v1. Transcribed from steeple
// db/changelog/002-seed.sql with Amenity / AccessibilityFeature / ActivityType
// bitmasks decoded to labels.
//
// It is not the product's data. Every surface a visitor reads — the pins, the
// list, the venue and room sheets, the request — goes through data/catalog.js,
// which answers from steeple and borrows from here only what the wire has no
// field for. A venue a host listed this morning is on the map and openable
// because of that; it used to be invisible everywhere but a hand-typed URL.
//
// World positions project real lat/lng onto the village plane:
//   x = (lng - CENTER.lng) * 8000   (east = +x)
//   z = -(lat - CENTER.lat) * 10000 (north = -z)
// These anchors are canonical; the world may add artistic terrain around them
// but venues must sit at these positions so relative geography stays honest.

export const CENTER = { lat: 38.888, lng: -77.26475 };

export const ACTIVITY_TYPES = [
  'Children',
  'Sports',
  'Community',
  'Religious',
  'Arts',
  'Education',
  'Music',
];

const pos = (lat, lng) => ({
  x: Math.round((lng - CENTER.lng) * 8000 * 10) / 10,
  z: Math.round(-(lat - CENTER.lat) * 10000 * 10) / 10,
});

/**
 * Room photographs, matched to steeple's own curation (db/changelog/012-room-photo-curation.sql).
 * Each room lists Unsplash photo ids in gallery order — the first is the cover — and the same
 * imgix sizing the API serves, so the offline catalog and the live one show the same pictures at
 * the same crops. Ids only: the sizes belong to whoever is asking for the image.
 */
export const photoUrl = (photoId, width, height) =>
  `https://images.unsplash.com/${photoId}?w=${width}&h=${height}&fit=crop&q=80&auto=format`;

export const VENUES = [
  {
    id: 'grace-community-vienna',
    name: 'Grace Community Church of Vienna',
    shortName: 'Grace Community',
    description:
      'A welcoming congregation in the heart of Vienna with a large fellowship hall and several flexible meeting spaces available to local community groups during the week.',
    address: '120 Maple Avenue East, Vienna 22180',
    suburb: 'Vienna',
    lat: 38.9012,
    lng: -77.2653,
    position: pos(38.9012, -77.2653),
    contactEmail: 'hall@gracevienna.org',
    parking:
      'Free on-site lot with about 40 spaces, plus unmetered street parking along Maple Avenue East.',
    transit:
      'On the Fairfax Connector 463 bus route and a short walk from the Vienna shops. Vienna/Fairfax-GMU Metro (Orange line) is a few minutes away by car.',
    verified: true,
    rooms: [
      {
        id: 'fellowship-hall',
        name: 'Fellowship Hall',
        description:
          'Our largest space — a bright open hall with a stage, kitchen access, and seating for community dinners, performances, and large gatherings.',
        capacity: 200,
        pricePerHour: 45,
        houseRules:
          'No alcohol. Clean-up required before departure. Amplified music until 9pm only.',
        status: 'published',
        amenities: ['Parking', 'Kitchen', 'Restrooms', 'Audio/visual', 'Tables', 'Chairs', 'Heating', 'Air conditioning', 'Stage'],
        accessibility: ['Step-free access', 'Accessible restroom', 'Accessible parking'],
        activities: ['Community', 'Religious', 'Arts', 'Music'],
        photos: [
          { id: 'photo-1679205691826-9157415559c2', caption: 'The hall set out for a gathering, with the stage at the far end' },
          { id: 'photo-1759477274116-e3cb02d2b9d8', caption: 'Round tables laid for a community dinner' },
          { id: 'photo-1775918427144-51f0bf53f8c4', caption: 'The hall dressed for a large reception' },
        ],
      },
      {
        id: 'youth-activity-room',
        name: 'Youth Activity Room',
        description:
          "A carpeted multipurpose room ideal for children's programs, tutoring, and small group activities.",
        capacity: 30,
        pricePerHour: 15,
        houseRules:
          'Adult supervision required for under-18 groups. Leave the room as you found it.',
        status: 'published',
        amenities: ['Restrooms', 'Wi-Fi', 'Tables', 'Chairs', 'Heating', 'Air conditioning'],
        accessibility: ['Step-free access', 'Accessible restroom'],
        activities: ['Children', 'Community', 'Education'],
        photos: [
          { id: 'photo-1763310225230-6e15b125935a', caption: "Low tables and chairs set out for a children's session" },
          { id: 'photo-1763310225537-f7161d5c93e9', caption: 'The play corner, with storage along the back wall' },
          { id: 'photo-1545558014-8692077e9b5c', caption: "Games and building blocks from the room's supply cupboard" },
        ],
      },
    ],
  },
  {
    id: 'vienna-presbyterian',
    name: 'Vienna Presbyterian Church',
    shortName: 'Vienna Presbyterian',
    description:
      'Historic church near the W&OD trail offering a sanctuary annex and music room for recitals, rehearsals, and quiet community meetings.',
    address: '124 Park Street NE, Vienna 22180',
    suburb: 'Vienna',
    lat: 38.9018,
    lng: -77.2589,
    position: pos(38.9018, -77.2589),
    contactEmail: 'rentals@viennapres.org',
    parking:
      'On-site lot behind the church with additional parking on Park Street NE. Bike racks by the W&OD trail entrance.',
    transit:
      'Steps from the W&OD trail for cyclists and walkers. Fairfax Connector buses stop on Maple Avenue, two blocks south.',
    verified: true,
    rooms: [
      {
        id: 'music-room',
        name: 'Music Room',
        description:
          'Acoustically warm room with an upright piano, perfect for choir rehearsals, recitals, and small concerts.',
        capacity: 40,
        pricePerHour: 35,
        houseRules: 'Piano use included. No food or drink near the instrument.',
        status: 'published',
        amenities: ['Restrooms', 'Chairs', 'Heating', 'Air conditioning', 'Piano'],
        accessibility: ['Step-free access'],
        activities: ['Arts', 'Education', 'Music'],
        photos: [
          { id: 'photo-1776209572628-b0f61f1b8e38', caption: 'The upright piano, with the stool drawn up' },
          { id: 'photo-1609965461134-00bb9e6589ed', caption: 'Tall windows fill the room with afternoon light' },
          { id: 'photo-1780245992134-65c003e08c99', caption: 'Sheet music waiting on the stand by the window' },
        ],
      },
      {
        id: 'garden-meeting-room',
        name: 'Garden Meeting Room',
        description:
          'A calm, light-filled room overlooking the church garden — a natural fit for support groups and small community meetings.',
        capacity: 18,
        pricePerHour: 20,
        houseRules:
          'Quiet hours respected — adjacent to the sanctuary. No amplified sound.',
        status: 'published',
        amenities: ['Restrooms', 'Wi-Fi', 'Tables', 'Chairs', 'Heating'],
        accessibility: ['Step-free access', 'Accessible restroom', 'Hearing loop'],
        activities: ['Community', 'Religious'],
        photos: [
          { id: 'photo-1594125675297-a8dee22b0350', caption: 'The meeting table, with the garden window behind' },
          { id: 'photo-1785047919481-79a9b5585131', caption: 'The window seat looking out over the garden' },
          { id: 'photo-1745816384569-28163a18b4fe', caption: 'Planting along the garden windowsill' },
        ],
      },
    ],
  },
  {
    id: 'oakton-baptist',
    name: 'Oakton Baptist Church',
    shortName: 'Oakton Baptist',
    description:
      'Spacious suburban church with an indoor gymnasium and classrooms — popular for youth sports, camps, and weekend programs.',
    address: '10100 Blake Lane, Oakton 22124',
    suburb: 'Oakton',
    lat: 38.8901,
    lng: -77.3008,
    position: pos(38.8901, -77.3008),
    contactEmail: 'facilities@oaktonbaptist.org',
    parking: 'Large free parking lot with accessible bays right by the main entrance.',
    transit:
      'Best reached by car. The Fairfax Connector 605 stops on Blake Lane; Vienna Metro (Orange line) is about 10 minutes away by car.',
    verified: true,
    rooms: [
      {
        id: 'gymnasium',
        name: 'Gymnasium',
        description:
          'Full-size indoor gym with basketball hoops and floor markings for multiple sports. Ideal for youth leagues and active community programs.',
        capacity: 120,
        pricePerHour: 60,
        houseRules:
          'Non-marking shoes required on the court. No outside food on the gym floor.',
        status: 'published',
        amenities: ['Parking', 'Restrooms', 'Heating', 'Air conditioning'],
        accessibility: ['Step-free access', 'Accessible parking'],
        activities: ['Children', 'Sports', 'Community'],
        photos: [
          { id: 'photo-1555688695-bd7b47dd8a8a', caption: 'The full court, seen from the baseline' },
          { id: 'photo-1768554630751-6448593749eb', caption: 'The hoop at the near end, with wall bars alongside' },
          { id: 'photo-1694173563800-a73d4a0f248e', caption: 'The floor marked out and ready for a session' },
        ],
      },
      {
        id: 'classroom-b',
        name: 'Classroom B',
        description:
          'Comfortable classroom with whiteboards and Wi-Fi, suited to tutoring, ESL classes, and small workshops.',
        capacity: 25,
        pricePerHour: 25,
        houseRules: 'Erase whiteboards after use. Stack chairs before leaving.',
        status: 'published',
        amenities: ['Restrooms', 'Wi-Fi', 'Audio/visual', 'Tables', 'Chairs', 'Heating', 'Air conditioning'],
        accessibility: ['Step-free access', 'Accessible restroom', 'Lift access'],
        activities: ['Children', 'Community', 'Education'],
        photos: [
          { id: 'photo-1580582932707-520aed937b7b', caption: 'The classroom looking towards the board' },
          { id: 'photo-1604134967494-8a9ed3adea0d', caption: 'Desks and chairs arranged for a class' },
          { id: 'photo-1519406596751-0a3ccc4937fe', caption: 'Wall maps and a reading table at the back of the room' },
        ],
      },
      {
        id: 'renovation-annex',
        name: 'Renovation Annex (coming soon)',
        description:
          'A new annex currently under renovation. Listing is being prepared and is not yet published.',
        capacity: 50,
        pricePerHour: 40,
        houseRules: 'TBD.',
        status: 'draft',
        amenities: ['Restrooms', 'Heating'],
        accessibility: ['Step-free access'],
        activities: ['Community'],
        photos: [
          { id: 'photo-1668910251266-081835549c07', caption: 'The annex room, newly floored and awaiting fit-out' },
          { id: 'photo-1757742690834-aa581b9f53b2', caption: 'Daylight through the annex windows' },
          { id: 'photo-1768321901750-f7b96d774456', caption: 'Building work continuing in the annex' },
        ],
      },
    ],
  },
  {
    id: 'dunn-loring-umc',
    name: 'Dunn Loring United Methodist Church',
    shortName: 'Dunn Loring UMC',
    description:
      'Friendly neighborhood church near the Dunn Loring Metro with an arts studio and a free community lounge for local groups.',
    address: '2316 Gallows Road, Dunn Loring 22027',
    suburb: 'Dunn Loring',
    lat: 38.8989,
    lng: -77.2287,
    position: pos(38.8989, -77.2287),
    contactEmail: 'office@dunnloringumc.org',
    parking:
      'Free on-site parking off Gallows Road, with step-free access to the lounge and studio.',
    transit:
      'A 6-minute walk from Dunn Loring–Merrifield Metro (Orange line). Several Metrobus routes stop on Gallows Road outside.',
    verified: true,
    rooms: [
      {
        id: 'art-studio',
        name: 'Art Studio',
        description:
          'Wipe-clean studio with sinks, easels, and abundant natural light — built for painting classes, craft workshops, and maker meetups.',
        capacity: 24,
        pricePerHour: 30,
        houseRules: 'Cover tables before messy work. Dispose of materials responsibly.',
        status: 'published',
        amenities: ['Restrooms', 'Wi-Fi', 'Tables', 'Chairs', 'Heating', 'Air conditioning'],
        accessibility: ['Step-free access', 'Accessible restroom'],
        activities: ['Children', 'Arts', 'Education'],
        photos: [
          { id: 'photo-1747311585699-d7a659864cac', caption: 'Easels and stools set up for a painting class' },
          { id: 'photo-1740710543611-80b658171bc3', caption: 'A worktable with brushes and materials to hand' },
          { id: 'photo-1517697471339-4aa32003c11a', caption: "Brushes from the studio's shared supply" },
        ],
      },
      {
        id: 'community-lounge',
        name: 'Community Lounge',
        description:
          'Cozy lounge with comfortable seating and a coffee station — a favorite of neighborhood associations and support groups.',
        capacity: 20,
        pricePerHour: 18,
        houseRules: 'Reset furniture and tidy the coffee station before you leave.',
        status: 'published',
        amenities: ['Restrooms', 'Wi-Fi', 'Chairs', 'Heating', 'Air conditioning'],
        accessibility: ['Step-free access', 'Accessible restroom', 'Hearing loop'],
        activities: ['Community', 'Religious'],
        photos: [
          { id: 'photo-1776245228843-7fc058aa19a7', caption: 'The lounge, with soft seating around the low tables' },
          { id: 'photo-1759691555407-3c5834e6991e', caption: 'Sofas and armchairs arranged for a small group' },
          { id: 'photo-1565031491910-e57fac031c41', caption: 'A quieter corner of the lounge' },
        ],
      },
    ],
  },
  {
    id: 'merrifield-fellowship',
    name: 'Merrifield Fellowship Church',
    shortName: 'Merrifield Fellowship',
    description:
      'Modern church near the Mosaic District offering a flexible main hall for events, classes, and worship gatherings.',
    address: '2920 Eskridge Road, Merrifield 22031',
    suburb: 'Merrifield',
    lat: 38.8742,
    lng: -77.2289,
    position: pos(38.8742, -77.2289),
    contactEmail: 'hello@merrifieldfellowship.org',
    parking:
      'Shared parking structure next door (free evenings and weekends) plus a small on-site lot.',
    transit:
      'A 10-minute walk from the Mosaic District. Dunn Loring Metro (Orange line) is one stop away on the 1A/1B Metrobus.',
    verified: true,
    rooms: [
      {
        id: 'main-hall',
        name: 'Main Hall',
        description:
          'A versatile contemporary hall with a small stage, full A/V, and movable seating — works for everything from worship services to community workshops.',
        capacity: 150,
        pricePerHour: 50,
        houseRules:
          'A/V technician available on request. Decorations must be free-standing — no wall fixings.',
        status: 'published',
        amenities: ['Parking', 'Kitchen', 'Restrooms', 'Wi-Fi', 'Audio/visual', 'Tables', 'Chairs', 'Heating', 'Air conditioning', 'Stage'],
        accessibility: ['Step-free access', 'Accessible restroom', 'Accessible parking', 'Hearing loop'],
        activities: ['Community', 'Religious', 'Arts', 'Education', 'Music'],
        photos: [
          { id: 'photo-1784476457176-b4ee6cefdbcd', caption: 'The main hall with seating set for a service' },
          { id: 'photo-1761258779622-454cbecb2006', caption: "The hall's platform end, under the roof lantern" },
          { id: 'photo-1781371004994-05d1940e4bc1', caption: 'Rows of seating across the hall floor' },
        ],
      },
    ],
  },
];

export function getVenue(venueId) {
  return VENUES.find((v) => v.id === venueId) ?? null;
}

export function getRoom(venueId, roomId) {
  return getVenue(venueId)?.rooms.find((r) => r.id === roomId) ?? null;
}

