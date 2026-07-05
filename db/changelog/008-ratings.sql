--liquibase formatted sql

-- Ratings and review comments (Phase 6 Slice 1). HiddenAtUtc supports reactive Admin
-- moderation; hidden rows are excluded from aggregates and public review reads.

--changeset steeple:008-ratings
CREATE TABLE ratings (
    "Id" uuid NOT NULL,
    "BookingId" uuid NOT NULL,
    "RaterId" uuid NOT NULL,
    -- 1 = Organizer, 2 = Venue. This is the ratee; it also enforces one rating per direction.
    "RateeType" integer NOT NULL,
    "Stars" smallint NOT NULL,
    "Comment" text,
    "CreatedAtUtc" timestamp with time zone NOT NULL,
    "HiddenAtUtc" timestamp with time zone,
    -- Denormalized from the booking at write time for cheap venue/organizer aggregates.
    "VenueId" uuid NOT NULL,
    "OrganizerId" uuid NOT NULL,
    CONSTRAINT "PK_ratings" PRIMARY KEY ("Id"),
    CONSTRAINT "FK_ratings_bookings_BookingId" FOREIGN KEY ("BookingId") REFERENCES bookings ("Id") ON DELETE CASCADE,
    CONSTRAINT "FK_ratings_users_RaterId" FOREIGN KEY ("RaterId") REFERENCES users ("Id") ON DELETE RESTRICT,
    CONSTRAINT "FK_ratings_venues_VenueId" FOREIGN KEY ("VenueId") REFERENCES venues ("Id") ON DELETE CASCADE,
    CONSTRAINT "FK_ratings_users_OrganizerId" FOREIGN KEY ("OrganizerId") REFERENCES users ("Id") ON DELETE RESTRICT,
    CONSTRAINT "CK_ratings_ratee_type" CHECK ("RateeType" IN (1, 2)),
    CONSTRAINT "CK_ratings_stars" CHECK ("Stars" >= 1 AND "Stars" <= 5),
    CONSTRAINT "CK_ratings_comment_length" CHECK ("Comment" IS NULL OR char_length("Comment") <= 1000)
);

CREATE UNIQUE INDEX "UX_ratings_BookingId_RateeType" ON ratings ("BookingId", "RateeType");
CREATE INDEX "IX_ratings_VenueId_visible" ON ratings ("VenueId") WHERE "HiddenAtUtc" IS NULL;
CREATE INDEX "IX_ratings_OrganizerId_visible" ON ratings ("OrganizerId") WHERE "HiddenAtUtc" IS NULL;
--rollback DROP TABLE ratings;
