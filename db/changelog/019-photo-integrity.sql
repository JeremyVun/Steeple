--liquibase formatted sql

-- Every uploaded photo owns its object prefix and its display position. Older builds could create
-- duplicate sort orders/primaries and could point multiple rows at one content-hash prefix.

--changeset steeple:019-photo-integrity

-- Preserve every row while assigning a deterministic, gap-free display order.
WITH ranked AS (
    SELECT "Id",
           (row_number() OVER (
               PARTITION BY "RoomId"
               ORDER BY "SortOrder", "CreatedAtUtc", "Id"
           ) - 1)::integer AS repaired_sort_order
    FROM room_photos
)
UPDATE room_photos AS photo
SET "SortOrder" = ranked.repaired_sort_order
FROM ranked
WHERE photo."Id" = ranked."Id"
  AND photo."SortOrder" <> ranked.repaired_sort_order;

-- Keep the earliest displayed primary and demote every duplicate primary.
WITH ranked_primaries AS (
    SELECT "Id",
           row_number() OVER (
               PARTITION BY "RoomId"
               ORDER BY "SortOrder", "CreatedAtUtc", "Id"
           ) AS primary_rank
    FROM room_photos
    WHERE "IsPrimary" = true
)
UPDATE room_photos AS photo
SET "IsPrimary" = false
FROM ranked_primaries
WHERE photo."Id" = ranked_primaries."Id"
  AND ranked_primaries.primary_rank > 1;

-- Shared content-hash objects cannot be cloned transactionally from PostgreSQL into either the
-- local store or S3. Reclassify every member of a duplicate group as a legacy URL-only row: its
-- existing URLs remain renderable, while deleting either row cannot delete the shared bytes.
-- All uploads after this changeset receive row-owned prefixes and a non-null unique StorageKey.
WITH shared_keys AS (
    SELECT "StorageKey"
    FROM room_photos
    WHERE "StorageKey" IS NOT NULL
    GROUP BY "StorageKey"
    HAVING count(*) > 1
)
UPDATE room_photos AS photo
SET "StorageKey" = NULL
FROM shared_keys
WHERE photo."StorageKey" = shared_keys."StorageKey";

CREATE UNIQUE INDEX "IX_room_photos_StorageKey"
    ON room_photos ("StorageKey")
    WHERE "StorageKey" IS NOT NULL;

DROP INDEX IF EXISTS "IX_room_photos_RoomId_SortOrder";
CREATE UNIQUE INDEX "IX_room_photos_RoomId_SortOrder"
    ON room_photos ("RoomId", "SortOrder");

CREATE UNIQUE INDEX "IX_room_photos_RoomId_IsPrimary"
    ON room_photos ("RoomId")
    WHERE "IsPrimary" = true;

--rollback DROP INDEX "IX_room_photos_RoomId_IsPrimary";
--rollback DROP INDEX "IX_room_photos_RoomId_SortOrder";
--rollback CREATE INDEX "IX_room_photos_RoomId_SortOrder" ON room_photos ("RoomId", "SortOrder");
--rollback DROP INDEX "IX_room_photos_StorageKey";
