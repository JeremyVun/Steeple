--liquibase formatted sql

-- Phase 5 — provider self-service (ROADMAP Phase 5, SYSTEM_DESIGN §9/§10).
-- Moderation model: providers create/edit freely; a never-approved room asks for publish
-- ("PublishRequestedAtUtc") and the founder approves in Admin (stamps "FirstPublishedAtUtc").
-- Once approved, unlist/relist is provider-controlled. Provider edits to live listings set
-- "ProviderEditedAtUtc" so Admin gets a review feed without blocking the edit.
-- Media pipeline: uploaded photos store variant URLs + the object-store key alongside the
-- legacy external "Url" (which stays the full-size image for old rows and clients).

--changeset steeple:006-manage
ALTER TABLE rooms ADD COLUMN "PublishRequestedAtUtc" timestamp with time zone;
ALTER TABLE rooms ADD COLUMN "FirstPublishedAtUtc" timestamp with time zone;
ALTER TABLE rooms ADD COLUMN "ProviderEditedAtUtc" timestamp with time zone;
ALTER TABLE venues ADD COLUMN "ProviderEditedAtUtc" timestamp with time zone;

-- Concierge-seeded rooms were founder-vetted; treat already-published as already-approved
-- (RoomStatus Published = 1).
UPDATE rooms SET "FirstPublishedAtUtc" = "CreatedAtUtc" WHERE "Status" = 1;

ALTER TABLE room_photos ADD COLUMN "StorageKey" character varying(500);
ALTER TABLE room_photos ADD COLUMN "ThumbUrl" character varying(1000);
ALTER TABLE room_photos ADD COLUMN "CardUrl" character varying(1000);
ALTER TABLE room_photos ADD COLUMN "CreatedAtUtc" timestamp with time zone NOT NULL DEFAULT now();

-- Moderation-queue scans (Admin) touch only flagged rows; partial indexes keep them free.
CREATE INDEX "IX_rooms_PublishRequestedAtUtc" ON rooms ("PublishRequestedAtUtc") WHERE "PublishRequestedAtUtc" IS NOT NULL;
CREATE INDEX "IX_rooms_ProviderEditedAtUtc" ON rooms ("ProviderEditedAtUtc") WHERE "ProviderEditedAtUtc" IS NOT NULL;
CREATE INDEX "IX_venues_ProviderEditedAtUtc" ON venues ("ProviderEditedAtUtc") WHERE "ProviderEditedAtUtc" IS NOT NULL;
--rollback DROP INDEX "IX_venues_ProviderEditedAtUtc";
--rollback DROP INDEX "IX_rooms_ProviderEditedAtUtc";
--rollback DROP INDEX "IX_rooms_PublishRequestedAtUtc";
--rollback ALTER TABLE room_photos DROP COLUMN "CreatedAtUtc";
--rollback ALTER TABLE room_photos DROP COLUMN "CardUrl";
--rollback ALTER TABLE room_photos DROP COLUMN "ThumbUrl";
--rollback ALTER TABLE room_photos DROP COLUMN "StorageKey";
--rollback ALTER TABLE venues DROP COLUMN "ProviderEditedAtUtc";
--rollback ALTER TABLE rooms DROP COLUMN "ProviderEditedAtUtc";
--rollback ALTER TABLE rooms DROP COLUMN "FirstPublishedAtUtc";
--rollback ALTER TABLE rooms DROP COLUMN "PublishRequestedAtUtc";
