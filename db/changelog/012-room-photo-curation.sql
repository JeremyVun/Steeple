--liquibase formatted sql

-- Curated room photography. The 002 seed shipped picsum placeholders keyed by room slug, which
-- served their purpose while the funnel was wireframe-grade but put a bear in the Music Room.
-- Every room_photos row now carries a real, venue-appropriate photograph hosted on Unsplash's
-- image CDN, with explicit imgix sizing so the API's three URL columns are honest:
--   "Url"      1600x1000  the listing gallery
--   "CardUrl"   800x500   search results and venue cards (ListingMappings uses this for
--                         PrimaryPhotoUrl, falling back to "Url")
--   "ThumbUrl"  400x250   manage/admin lists
-- Captions describe what the photograph actually shows rather than repeating the room name.
-- 002-seed.sql is left untouched: it has been applied everywhere and its checksum must not move.

--changeset steeple:012-room-photo-curation

-- Fellowship Hall
UPDATE room_photos SET
    "Url"      = 'https://images.unsplash.com/photo-1679205691826-9157415559c2?w=1600&h=1000&fit=crop&q=80&auto=format',
    "CardUrl"  = 'https://images.unsplash.com/photo-1679205691826-9157415559c2?w=800&h=500&fit=crop&q=80&auto=format',
    "ThumbUrl" = 'https://images.unsplash.com/photo-1679205691826-9157415559c2?w=400&h=250&fit=crop&q=80&auto=format',
    "Caption"  = 'The hall set out for a gathering, with the stage at the far end'
WHERE "Id" = 'c0000000-0000-0000-0000-000000000001';

-- Fellowship Hall — view 2
UPDATE room_photos SET
    "Url"      = 'https://images.unsplash.com/photo-1759477274116-e3cb02d2b9d8?w=1600&h=1000&fit=crop&q=80&auto=format',
    "CardUrl"  = 'https://images.unsplash.com/photo-1759477274116-e3cb02d2b9d8?w=800&h=500&fit=crop&q=80&auto=format',
    "ThumbUrl" = 'https://images.unsplash.com/photo-1759477274116-e3cb02d2b9d8?w=400&h=250&fit=crop&q=80&auto=format',
    "Caption"  = 'Round tables laid for a community dinner'
WHERE "Id" = 'c0000000-0000-0000-0000-000000000002';

-- Fellowship Hall — view 3
UPDATE room_photos SET
    "Url"      = 'https://images.unsplash.com/photo-1775918427144-51f0bf53f8c4?w=1600&h=1000&fit=crop&q=80&auto=format',
    "CardUrl"  = 'https://images.unsplash.com/photo-1775918427144-51f0bf53f8c4?w=800&h=500&fit=crop&q=80&auto=format',
    "ThumbUrl" = 'https://images.unsplash.com/photo-1775918427144-51f0bf53f8c4?w=400&h=250&fit=crop&q=80&auto=format',
    "Caption"  = 'The hall dressed for a large reception'
WHERE "Id" = 'c0000000-0000-0000-0000-000000000003';

-- Youth Activity Room
UPDATE room_photos SET
    "Url"      = 'https://images.unsplash.com/photo-1763310225230-6e15b125935a?w=1600&h=1000&fit=crop&q=80&auto=format',
    "CardUrl"  = 'https://images.unsplash.com/photo-1763310225230-6e15b125935a?w=800&h=500&fit=crop&q=80&auto=format',
    "ThumbUrl" = 'https://images.unsplash.com/photo-1763310225230-6e15b125935a?w=400&h=250&fit=crop&q=80&auto=format',
    "Caption"  = 'Low tables and chairs set out for a children''s session'
WHERE "Id" = 'c0000000-0000-0000-0000-000000000004';

-- Youth Activity Room — view 2
UPDATE room_photos SET
    "Url"      = 'https://images.unsplash.com/photo-1763310225537-f7161d5c93e9?w=1600&h=1000&fit=crop&q=80&auto=format',
    "CardUrl"  = 'https://images.unsplash.com/photo-1763310225537-f7161d5c93e9?w=800&h=500&fit=crop&q=80&auto=format',
    "ThumbUrl" = 'https://images.unsplash.com/photo-1763310225537-f7161d5c93e9?w=400&h=250&fit=crop&q=80&auto=format',
    "Caption"  = 'The play corner, with storage along the back wall'
WHERE "Id" = 'c0000000-0000-0000-0000-000000000005';

-- Youth Activity Room — view 3
UPDATE room_photos SET
    "Url"      = 'https://images.unsplash.com/photo-1545558014-8692077e9b5c?w=1600&h=1000&fit=crop&q=80&auto=format',
    "CardUrl"  = 'https://images.unsplash.com/photo-1545558014-8692077e9b5c?w=800&h=500&fit=crop&q=80&auto=format',
    "ThumbUrl" = 'https://images.unsplash.com/photo-1545558014-8692077e9b5c?w=400&h=250&fit=crop&q=80&auto=format',
    "Caption"  = 'Games and building blocks from the room''s supply cupboard'
WHERE "Id" = 'c0000000-0000-0000-0000-000000000006';

-- Music Room
UPDATE room_photos SET
    "Url"      = 'https://images.unsplash.com/photo-1776209572628-b0f61f1b8e38?w=1600&h=1000&fit=crop&q=80&auto=format',
    "CardUrl"  = 'https://images.unsplash.com/photo-1776209572628-b0f61f1b8e38?w=800&h=500&fit=crop&q=80&auto=format',
    "ThumbUrl" = 'https://images.unsplash.com/photo-1776209572628-b0f61f1b8e38?w=400&h=250&fit=crop&q=80&auto=format',
    "Caption"  = 'The upright piano, with the stool drawn up'
WHERE "Id" = 'c0000000-0000-0000-0000-000000000007';

-- Music Room — view 2
UPDATE room_photos SET
    "Url"      = 'https://images.unsplash.com/photo-1609965461134-00bb9e6589ed?w=1600&h=1000&fit=crop&q=80&auto=format',
    "CardUrl"  = 'https://images.unsplash.com/photo-1609965461134-00bb9e6589ed?w=800&h=500&fit=crop&q=80&auto=format',
    "ThumbUrl" = 'https://images.unsplash.com/photo-1609965461134-00bb9e6589ed?w=400&h=250&fit=crop&q=80&auto=format',
    "Caption"  = 'Tall windows fill the room with afternoon light'
WHERE "Id" = 'c0000000-0000-0000-0000-000000000008';

-- Music Room — view 3
UPDATE room_photos SET
    "Url"      = 'https://images.unsplash.com/photo-1780245992134-65c003e08c99?w=1600&h=1000&fit=crop&q=80&auto=format',
    "CardUrl"  = 'https://images.unsplash.com/photo-1780245992134-65c003e08c99?w=800&h=500&fit=crop&q=80&auto=format',
    "ThumbUrl" = 'https://images.unsplash.com/photo-1780245992134-65c003e08c99?w=400&h=250&fit=crop&q=80&auto=format',
    "Caption"  = 'Sheet music waiting on the stand by the window'
WHERE "Id" = 'c0000000-0000-0000-0000-000000000009';

-- Garden Meeting Room
UPDATE room_photos SET
    "Url"      = 'https://images.unsplash.com/photo-1594125675297-a8dee22b0350?w=1600&h=1000&fit=crop&q=80&auto=format',
    "CardUrl"  = 'https://images.unsplash.com/photo-1594125675297-a8dee22b0350?w=800&h=500&fit=crop&q=80&auto=format',
    "ThumbUrl" = 'https://images.unsplash.com/photo-1594125675297-a8dee22b0350?w=400&h=250&fit=crop&q=80&auto=format',
    "Caption"  = 'The meeting table, with the garden window behind'
WHERE "Id" = 'c0000000-0000-0000-0000-000000000010';

-- Garden Meeting Room — view 2
UPDATE room_photos SET
    "Url"      = 'https://images.unsplash.com/photo-1785047919481-79a9b5585131?w=1600&h=1000&fit=crop&q=80&auto=format',
    "CardUrl"  = 'https://images.unsplash.com/photo-1785047919481-79a9b5585131?w=800&h=500&fit=crop&q=80&auto=format',
    "ThumbUrl" = 'https://images.unsplash.com/photo-1785047919481-79a9b5585131?w=400&h=250&fit=crop&q=80&auto=format',
    "Caption"  = 'The window seat looking out over the garden'
WHERE "Id" = 'c0000000-0000-0000-0000-000000000011';

-- Garden Meeting Room — view 3
UPDATE room_photos SET
    "Url"      = 'https://images.unsplash.com/photo-1745816384569-28163a18b4fe?w=1600&h=1000&fit=crop&q=80&auto=format',
    "CardUrl"  = 'https://images.unsplash.com/photo-1745816384569-28163a18b4fe?w=800&h=500&fit=crop&q=80&auto=format',
    "ThumbUrl" = 'https://images.unsplash.com/photo-1745816384569-28163a18b4fe?w=400&h=250&fit=crop&q=80&auto=format',
    "Caption"  = 'Planting along the garden windowsill'
WHERE "Id" = 'c0000000-0000-0000-0000-000000000012';

-- Gymnasium
UPDATE room_photos SET
    "Url"      = 'https://images.unsplash.com/photo-1555688695-bd7b47dd8a8a?w=1600&h=1000&fit=crop&q=80&auto=format',
    "CardUrl"  = 'https://images.unsplash.com/photo-1555688695-bd7b47dd8a8a?w=800&h=500&fit=crop&q=80&auto=format',
    "ThumbUrl" = 'https://images.unsplash.com/photo-1555688695-bd7b47dd8a8a?w=400&h=250&fit=crop&q=80&auto=format',
    "Caption"  = 'The full court, seen from the baseline'
WHERE "Id" = 'c0000000-0000-0000-0000-000000000013';

-- Gymnasium — view 2
UPDATE room_photos SET
    "Url"      = 'https://images.unsplash.com/photo-1768554630751-6448593749eb?w=1600&h=1000&fit=crop&q=80&auto=format',
    "CardUrl"  = 'https://images.unsplash.com/photo-1768554630751-6448593749eb?w=800&h=500&fit=crop&q=80&auto=format',
    "ThumbUrl" = 'https://images.unsplash.com/photo-1768554630751-6448593749eb?w=400&h=250&fit=crop&q=80&auto=format',
    "Caption"  = 'The hoop at the near end, with wall bars alongside'
WHERE "Id" = 'c0000000-0000-0000-0000-000000000014';

-- Gymnasium — view 3
UPDATE room_photos SET
    "Url"      = 'https://images.unsplash.com/photo-1694173563800-a73d4a0f248e?w=1600&h=1000&fit=crop&q=80&auto=format',
    "CardUrl"  = 'https://images.unsplash.com/photo-1694173563800-a73d4a0f248e?w=800&h=500&fit=crop&q=80&auto=format',
    "ThumbUrl" = 'https://images.unsplash.com/photo-1694173563800-a73d4a0f248e?w=400&h=250&fit=crop&q=80&auto=format',
    "Caption"  = 'The floor marked out and ready for a session'
WHERE "Id" = 'c0000000-0000-0000-0000-000000000015';

-- Classroom B
UPDATE room_photos SET
    "Url"      = 'https://images.unsplash.com/photo-1580582932707-520aed937b7b?w=1600&h=1000&fit=crop&q=80&auto=format',
    "CardUrl"  = 'https://images.unsplash.com/photo-1580582932707-520aed937b7b?w=800&h=500&fit=crop&q=80&auto=format',
    "ThumbUrl" = 'https://images.unsplash.com/photo-1580582932707-520aed937b7b?w=400&h=250&fit=crop&q=80&auto=format',
    "Caption"  = 'The classroom looking towards the board'
WHERE "Id" = 'c0000000-0000-0000-0000-000000000016';

-- Classroom B — view 2
UPDATE room_photos SET
    "Url"      = 'https://images.unsplash.com/photo-1604134967494-8a9ed3adea0d?w=1600&h=1000&fit=crop&q=80&auto=format',
    "CardUrl"  = 'https://images.unsplash.com/photo-1604134967494-8a9ed3adea0d?w=800&h=500&fit=crop&q=80&auto=format',
    "ThumbUrl" = 'https://images.unsplash.com/photo-1604134967494-8a9ed3adea0d?w=400&h=250&fit=crop&q=80&auto=format',
    "Caption"  = 'Desks and chairs arranged for a class'
WHERE "Id" = 'c0000000-0000-0000-0000-000000000017';

-- Classroom B — view 3
UPDATE room_photos SET
    "Url"      = 'https://images.unsplash.com/photo-1519406596751-0a3ccc4937fe?w=1600&h=1000&fit=crop&q=80&auto=format',
    "CardUrl"  = 'https://images.unsplash.com/photo-1519406596751-0a3ccc4937fe?w=800&h=500&fit=crop&q=80&auto=format',
    "ThumbUrl" = 'https://images.unsplash.com/photo-1519406596751-0a3ccc4937fe?w=400&h=250&fit=crop&q=80&auto=format',
    "Caption"  = 'Wall maps and a reading table at the back of the room'
WHERE "Id" = 'c0000000-0000-0000-0000-000000000018';

-- Renovation Annex
UPDATE room_photos SET
    "Url"      = 'https://images.unsplash.com/photo-1668910251266-081835549c07?w=1600&h=1000&fit=crop&q=80&auto=format',
    "CardUrl"  = 'https://images.unsplash.com/photo-1668910251266-081835549c07?w=800&h=500&fit=crop&q=80&auto=format',
    "ThumbUrl" = 'https://images.unsplash.com/photo-1668910251266-081835549c07?w=400&h=250&fit=crop&q=80&auto=format',
    "Caption"  = 'The annex room, newly floored and awaiting fit-out'
WHERE "Id" = 'c0000000-0000-0000-0000-000000000019';

-- Renovation Annex — view 2
UPDATE room_photos SET
    "Url"      = 'https://images.unsplash.com/photo-1757742690834-aa581b9f53b2?w=1600&h=1000&fit=crop&q=80&auto=format',
    "CardUrl"  = 'https://images.unsplash.com/photo-1757742690834-aa581b9f53b2?w=800&h=500&fit=crop&q=80&auto=format',
    "ThumbUrl" = 'https://images.unsplash.com/photo-1757742690834-aa581b9f53b2?w=400&h=250&fit=crop&q=80&auto=format',
    "Caption"  = 'Daylight through the annex windows'
WHERE "Id" = 'c0000000-0000-0000-0000-000000000020';

-- Renovation Annex — view 3
UPDATE room_photos SET
    "Url"      = 'https://images.unsplash.com/photo-1768321901750-f7b96d774456?w=1600&h=1000&fit=crop&q=80&auto=format',
    "CardUrl"  = 'https://images.unsplash.com/photo-1768321901750-f7b96d774456?w=800&h=500&fit=crop&q=80&auto=format',
    "ThumbUrl" = 'https://images.unsplash.com/photo-1768321901750-f7b96d774456?w=400&h=250&fit=crop&q=80&auto=format',
    "Caption"  = 'Building work continuing in the annex'
WHERE "Id" = 'c0000000-0000-0000-0000-000000000021';

-- Art Studio
UPDATE room_photos SET
    "Url"      = 'https://images.unsplash.com/photo-1747311585699-d7a659864cac?w=1600&h=1000&fit=crop&q=80&auto=format',
    "CardUrl"  = 'https://images.unsplash.com/photo-1747311585699-d7a659864cac?w=800&h=500&fit=crop&q=80&auto=format',
    "ThumbUrl" = 'https://images.unsplash.com/photo-1747311585699-d7a659864cac?w=400&h=250&fit=crop&q=80&auto=format',
    "Caption"  = 'Easels and stools set up for a painting class'
WHERE "Id" = 'c0000000-0000-0000-0000-000000000022';

-- Art Studio — view 2
UPDATE room_photos SET
    "Url"      = 'https://images.unsplash.com/photo-1740710543611-80b658171bc3?w=1600&h=1000&fit=crop&q=80&auto=format',
    "CardUrl"  = 'https://images.unsplash.com/photo-1740710543611-80b658171bc3?w=800&h=500&fit=crop&q=80&auto=format',
    "ThumbUrl" = 'https://images.unsplash.com/photo-1740710543611-80b658171bc3?w=400&h=250&fit=crop&q=80&auto=format',
    "Caption"  = 'A worktable with brushes and materials to hand'
WHERE "Id" = 'c0000000-0000-0000-0000-000000000023';

-- Art Studio — view 3
UPDATE room_photos SET
    "Url"      = 'https://images.unsplash.com/photo-1517697471339-4aa32003c11a?w=1600&h=1000&fit=crop&q=80&auto=format',
    "CardUrl"  = 'https://images.unsplash.com/photo-1517697471339-4aa32003c11a?w=800&h=500&fit=crop&q=80&auto=format',
    "ThumbUrl" = 'https://images.unsplash.com/photo-1517697471339-4aa32003c11a?w=400&h=250&fit=crop&q=80&auto=format',
    "Caption"  = 'Brushes from the studio''s shared supply'
WHERE "Id" = 'c0000000-0000-0000-0000-000000000024';

-- Community Lounge
UPDATE room_photos SET
    "Url"      = 'https://images.unsplash.com/photo-1776245228843-7fc058aa19a7?w=1600&h=1000&fit=crop&q=80&auto=format',
    "CardUrl"  = 'https://images.unsplash.com/photo-1776245228843-7fc058aa19a7?w=800&h=500&fit=crop&q=80&auto=format',
    "ThumbUrl" = 'https://images.unsplash.com/photo-1776245228843-7fc058aa19a7?w=400&h=250&fit=crop&q=80&auto=format',
    "Caption"  = 'The lounge, with soft seating around the low tables'
WHERE "Id" = 'c0000000-0000-0000-0000-000000000025';

-- Community Lounge — view 2
UPDATE room_photos SET
    "Url"      = 'https://images.unsplash.com/photo-1759691555407-3c5834e6991e?w=1600&h=1000&fit=crop&q=80&auto=format',
    "CardUrl"  = 'https://images.unsplash.com/photo-1759691555407-3c5834e6991e?w=800&h=500&fit=crop&q=80&auto=format',
    "ThumbUrl" = 'https://images.unsplash.com/photo-1759691555407-3c5834e6991e?w=400&h=250&fit=crop&q=80&auto=format',
    "Caption"  = 'Sofas and armchairs arranged for a small group'
WHERE "Id" = 'c0000000-0000-0000-0000-000000000026';

-- Community Lounge — view 3
UPDATE room_photos SET
    "Url"      = 'https://images.unsplash.com/photo-1565031491910-e57fac031c41?w=1600&h=1000&fit=crop&q=80&auto=format',
    "CardUrl"  = 'https://images.unsplash.com/photo-1565031491910-e57fac031c41?w=800&h=500&fit=crop&q=80&auto=format',
    "ThumbUrl" = 'https://images.unsplash.com/photo-1565031491910-e57fac031c41?w=400&h=250&fit=crop&q=80&auto=format',
    "Caption"  = 'A quieter corner of the lounge'
WHERE "Id" = 'c0000000-0000-0000-0000-000000000027';

-- Main Hall
UPDATE room_photos SET
    "Url"      = 'https://images.unsplash.com/photo-1784476457176-b4ee6cefdbcd?w=1600&h=1000&fit=crop&q=80&auto=format',
    "CardUrl"  = 'https://images.unsplash.com/photo-1784476457176-b4ee6cefdbcd?w=800&h=500&fit=crop&q=80&auto=format',
    "ThumbUrl" = 'https://images.unsplash.com/photo-1784476457176-b4ee6cefdbcd?w=400&h=250&fit=crop&q=80&auto=format',
    "Caption"  = 'The main hall with seating set for a service'
WHERE "Id" = 'c0000000-0000-0000-0000-000000000028';

-- Main Hall — view 2
UPDATE room_photos SET
    "Url"      = 'https://images.unsplash.com/photo-1761258779622-454cbecb2006?w=1600&h=1000&fit=crop&q=80&auto=format',
    "CardUrl"  = 'https://images.unsplash.com/photo-1761258779622-454cbecb2006?w=800&h=500&fit=crop&q=80&auto=format',
    "ThumbUrl" = 'https://images.unsplash.com/photo-1761258779622-454cbecb2006?w=400&h=250&fit=crop&q=80&auto=format',
    "Caption"  = 'The hall''s platform end, under the roof lantern'
WHERE "Id" = 'c0000000-0000-0000-0000-000000000029';

-- Main Hall — view 3
UPDATE room_photos SET
    "Url"      = 'https://images.unsplash.com/photo-1781371004994-05d1940e4bc1?w=1600&h=1000&fit=crop&q=80&auto=format',
    "CardUrl"  = 'https://images.unsplash.com/photo-1781371004994-05d1940e4bc1?w=800&h=500&fit=crop&q=80&auto=format',
    "ThumbUrl" = 'https://images.unsplash.com/photo-1781371004994-05d1940e4bc1?w=400&h=250&fit=crop&q=80&auto=format',
    "Caption"  = 'Rows of seating across the hall floor'
WHERE "Id" = 'c0000000-0000-0000-0000-000000000030';

--rollback UPDATE room_photos SET "Url" = 'https://picsum.photos/seed/fellowship-hall-1/1200/800', "CardUrl" = NULL, "ThumbUrl" = NULL, "Caption" = 'Grace Community Fellowship Hall' WHERE "Id" = 'c0000000-0000-0000-0000-000000000001';
--rollback UPDATE room_photos SET "Url" = 'https://picsum.photos/seed/fellowship-hall-2/1200/800', "CardUrl" = NULL, "ThumbUrl" = NULL, "Caption" = 'Grace Community Fellowship Hall — view 2' WHERE "Id" = 'c0000000-0000-0000-0000-000000000002';
--rollback UPDATE room_photos SET "Url" = 'https://picsum.photos/seed/fellowship-hall-3/1200/800', "CardUrl" = NULL, "ThumbUrl" = NULL, "Caption" = 'Grace Community Fellowship Hall — view 3' WHERE "Id" = 'c0000000-0000-0000-0000-000000000003';
--rollback UPDATE room_photos SET "Url" = 'https://picsum.photos/seed/youth-activity-room-1/1200/800', "CardUrl" = NULL, "ThumbUrl" = NULL, "Caption" = 'Youth Activity Room' WHERE "Id" = 'c0000000-0000-0000-0000-000000000004';
--rollback UPDATE room_photos SET "Url" = 'https://picsum.photos/seed/youth-activity-room-2/1200/800', "CardUrl" = NULL, "ThumbUrl" = NULL, "Caption" = 'Youth Activity Room — view 2' WHERE "Id" = 'c0000000-0000-0000-0000-000000000005';
--rollback UPDATE room_photos SET "Url" = 'https://picsum.photos/seed/youth-activity-room-3/1200/800', "CardUrl" = NULL, "ThumbUrl" = NULL, "Caption" = 'Youth Activity Room — view 3' WHERE "Id" = 'c0000000-0000-0000-0000-000000000006';
--rollback UPDATE room_photos SET "Url" = 'https://picsum.photos/seed/music-room-1/1200/800', "CardUrl" = NULL, "ThumbUrl" = NULL, "Caption" = 'Vienna Presbyterian Music Room' WHERE "Id" = 'c0000000-0000-0000-0000-000000000007';
--rollback UPDATE room_photos SET "Url" = 'https://picsum.photos/seed/music-room-2/1200/800', "CardUrl" = NULL, "ThumbUrl" = NULL, "Caption" = 'Vienna Presbyterian Music Room — view 2' WHERE "Id" = 'c0000000-0000-0000-0000-000000000008';
--rollback UPDATE room_photos SET "Url" = 'https://picsum.photos/seed/music-room-3/1200/800', "CardUrl" = NULL, "ThumbUrl" = NULL, "Caption" = 'Vienna Presbyterian Music Room — view 3' WHERE "Id" = 'c0000000-0000-0000-0000-000000000009';
--rollback UPDATE room_photos SET "Url" = 'https://picsum.photos/seed/garden-meeting-room-1/1200/800', "CardUrl" = NULL, "ThumbUrl" = NULL, "Caption" = 'Garden Meeting Room' WHERE "Id" = 'c0000000-0000-0000-0000-000000000010';
--rollback UPDATE room_photos SET "Url" = 'https://picsum.photos/seed/garden-meeting-room-2/1200/800', "CardUrl" = NULL, "ThumbUrl" = NULL, "Caption" = 'Garden Meeting Room — view 2' WHERE "Id" = 'c0000000-0000-0000-0000-000000000011';
--rollback UPDATE room_photos SET "Url" = 'https://picsum.photos/seed/garden-meeting-room-3/1200/800', "CardUrl" = NULL, "ThumbUrl" = NULL, "Caption" = 'Garden Meeting Room — view 3' WHERE "Id" = 'c0000000-0000-0000-0000-000000000012';
--rollback UPDATE room_photos SET "Url" = 'https://picsum.photos/seed/gymnasium-1/1200/800', "CardUrl" = NULL, "ThumbUrl" = NULL, "Caption" = 'Oakton Baptist Gymnasium' WHERE "Id" = 'c0000000-0000-0000-0000-000000000013';
--rollback UPDATE room_photos SET "Url" = 'https://picsum.photos/seed/gymnasium-2/1200/800', "CardUrl" = NULL, "ThumbUrl" = NULL, "Caption" = 'Oakton Baptist Gymnasium — view 2' WHERE "Id" = 'c0000000-0000-0000-0000-000000000014';
--rollback UPDATE room_photos SET "Url" = 'https://picsum.photos/seed/gymnasium-3/1200/800', "CardUrl" = NULL, "ThumbUrl" = NULL, "Caption" = 'Oakton Baptist Gymnasium — view 3' WHERE "Id" = 'c0000000-0000-0000-0000-000000000015';
--rollback UPDATE room_photos SET "Url" = 'https://picsum.photos/seed/classroom-b-1/1200/800', "CardUrl" = NULL, "ThumbUrl" = NULL, "Caption" = 'Oakton Baptist Classroom B' WHERE "Id" = 'c0000000-0000-0000-0000-000000000016';
--rollback UPDATE room_photos SET "Url" = 'https://picsum.photos/seed/classroom-b-2/1200/800', "CardUrl" = NULL, "ThumbUrl" = NULL, "Caption" = 'Oakton Baptist Classroom B — view 2' WHERE "Id" = 'c0000000-0000-0000-0000-000000000017';
--rollback UPDATE room_photos SET "Url" = 'https://picsum.photos/seed/classroom-b-3/1200/800', "CardUrl" = NULL, "ThumbUrl" = NULL, "Caption" = 'Oakton Baptist Classroom B — view 3' WHERE "Id" = 'c0000000-0000-0000-0000-000000000018';
--rollback UPDATE room_photos SET "Url" = 'https://picsum.photos/seed/renovation-annex-1/1200/800', "CardUrl" = NULL, "ThumbUrl" = NULL, "Caption" = 'Renovation Annex' WHERE "Id" = 'c0000000-0000-0000-0000-000000000019';
--rollback UPDATE room_photos SET "Url" = 'https://picsum.photos/seed/renovation-annex-2/1200/800', "CardUrl" = NULL, "ThumbUrl" = NULL, "Caption" = 'Renovation Annex — view 2' WHERE "Id" = 'c0000000-0000-0000-0000-000000000020';
--rollback UPDATE room_photos SET "Url" = 'https://picsum.photos/seed/renovation-annex-3/1200/800', "CardUrl" = NULL, "ThumbUrl" = NULL, "Caption" = 'Renovation Annex — view 3' WHERE "Id" = 'c0000000-0000-0000-0000-000000000021';
--rollback UPDATE room_photos SET "Url" = 'https://picsum.photos/seed/art-studio-1/1200/800', "CardUrl" = NULL, "ThumbUrl" = NULL, "Caption" = 'Dunn Loring Art Studio' WHERE "Id" = 'c0000000-0000-0000-0000-000000000022';
--rollback UPDATE room_photos SET "Url" = 'https://picsum.photos/seed/art-studio-2/1200/800', "CardUrl" = NULL, "ThumbUrl" = NULL, "Caption" = 'Dunn Loring Art Studio — view 2' WHERE "Id" = 'c0000000-0000-0000-0000-000000000023';
--rollback UPDATE room_photos SET "Url" = 'https://picsum.photos/seed/art-studio-3/1200/800', "CardUrl" = NULL, "ThumbUrl" = NULL, "Caption" = 'Dunn Loring Art Studio — view 3' WHERE "Id" = 'c0000000-0000-0000-0000-000000000024';
--rollback UPDATE room_photos SET "Url" = 'https://picsum.photos/seed/community-lounge-1/1200/800', "CardUrl" = NULL, "ThumbUrl" = NULL, "Caption" = 'Dunn Loring Community Lounge' WHERE "Id" = 'c0000000-0000-0000-0000-000000000025';
--rollback UPDATE room_photos SET "Url" = 'https://picsum.photos/seed/community-lounge-2/1200/800', "CardUrl" = NULL, "ThumbUrl" = NULL, "Caption" = 'Dunn Loring Community Lounge — view 2' WHERE "Id" = 'c0000000-0000-0000-0000-000000000026';
--rollback UPDATE room_photos SET "Url" = 'https://picsum.photos/seed/community-lounge-3/1200/800', "CardUrl" = NULL, "ThumbUrl" = NULL, "Caption" = 'Dunn Loring Community Lounge — view 3' WHERE "Id" = 'c0000000-0000-0000-0000-000000000027';
--rollback UPDATE room_photos SET "Url" = 'https://picsum.photos/seed/main-hall-1/1200/800', "CardUrl" = NULL, "ThumbUrl" = NULL, "Caption" = 'Merrifield Main Hall' WHERE "Id" = 'c0000000-0000-0000-0000-000000000028';
--rollback UPDATE room_photos SET "Url" = 'https://picsum.photos/seed/main-hall-2/1200/800', "CardUrl" = NULL, "ThumbUrl" = NULL, "Caption" = 'Merrifield Main Hall — view 2' WHERE "Id" = 'c0000000-0000-0000-0000-000000000029';
--rollback UPDATE room_photos SET "Url" = 'https://picsum.photos/seed/main-hall-3/1200/800', "CardUrl" = NULL, "ThumbUrl" = NULL, "Caption" = 'Merrifield Main Hall — view 3' WHERE "Id" = 'c0000000-0000-0000-0000-000000000030';
