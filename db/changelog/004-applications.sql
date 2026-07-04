--liquibase formatted sql

-- Apply → approve loop (ROADMAP Phase 2, SYSTEM_DESIGN §5/§7): venue-manager authz links,
-- intent-first applications with their proposed venue-local schedule, the ask/answer message
-- thread, the notifications inbox (inbox = truth), and push-device registrations (rows only —
-- the /me/devices endpoint lands with mobile, Phase 4). Hand-maintained SQL is the source of
-- truth; the EF configurations in Steeple.Persistence mirror these tables column-for-column.

--changeset steeple:004-applications
-- Providers: which users may act for a venue (approve/decline/ask). Rows are created by the
-- founder via Admin during the concierge phase; provider self-service arrives in Phase 5.
CREATE TABLE venue_managers (
    "Id" uuid NOT NULL,
    "VenueId" uuid NOT NULL,
    "UserId" uuid NOT NULL,
    "CreatedAtUtc" timestamp with time zone NOT NULL,
    CONSTRAINT "PK_venue_managers" PRIMARY KEY ("Id"),
    CONSTRAINT "FK_venue_managers_venues_VenueId" FOREIGN KEY ("VenueId") REFERENCES venues ("Id") ON DELETE CASCADE,
    CONSTRAINT "FK_venue_managers_users_UserId" FOREIGN KEY ("UserId") REFERENCES users ("Id") ON DELETE CASCADE
);

CREATE TABLE applications (
    "Id" uuid NOT NULL,
    "RoomId" uuid NOT NULL,
    "OrganizerId" uuid NOT NULL,
    -- Single ActivityType value (not a flags mask): "what will happen in the room".
    "ActivityType" integer NOT NULL,
    "GroupSize" integer NOT NULL,
    -- Proposed schedule, venue-local wall-clock (SYSTEM_DESIGN §5): dates + HH:mm times mean
    -- what a person means in the venue's timezone. Materialization to UTC happens at approval
    -- (Phase 3 bookings) — applications never hold slots.
    "Frequency" integer NOT NULL,
    "StartDate" date NOT NULL,
    -- Mandatory when recurring (bounded recurrence) — enforced in the service.
    "EndDate" date,
    "DayOfWeek" integer,
    "StartTime" time without time zone NOT NULL,
    "EndTime" time without time zone NOT NULL,
    "IntentText" character varying(2000) NOT NULL,
    -- Pending → (NeedsInfo ⇄) → Approved | Declined | Withdrawn | Expired; transitions are
    -- validated in the Applications service, stored as int (repo convention).
    "Status" integer NOT NULL,
    -- Client-supplied Idempotency-Key (CONTRACTS §2): replays of the same submit return the
    -- original application instead of creating a duplicate.
    "IdempotencyKey" uuid,
    "CreatedAtUtc" timestamp with time zone NOT NULL,
    "DecidedAtUtc" timestamp with time zone,
    "ExpiresAtUtc" timestamp with time zone NOT NULL,
    CONSTRAINT "PK_applications" PRIMARY KEY ("Id"),
    CONSTRAINT "FK_applications_rooms_RoomId" FOREIGN KEY ("RoomId") REFERENCES rooms ("Id") ON DELETE CASCADE,
    CONSTRAINT "FK_applications_users_OrganizerId" FOREIGN KEY ("OrganizerId") REFERENCES users ("Id") ON DELETE CASCADE
);

-- The "ask" thread: either party may write while the application is undecided.
CREATE TABLE application_messages (
    "Id" uuid NOT NULL,
    "ApplicationId" uuid NOT NULL,
    "SenderId" uuid NOT NULL,
    "Body" character varying(2000) NOT NULL,
    "SentAtUtc" timestamp with time zone NOT NULL,
    CONSTRAINT "PK_application_messages" PRIMARY KEY ("Id"),
    CONSTRAINT "FK_application_messages_applications_ApplicationId" FOREIGN KEY ("ApplicationId") REFERENCES applications ("Id") ON DELETE CASCADE,
    CONSTRAINT "FK_application_messages_users_SenderId" FOREIGN KEY ("SenderId") REFERENCES users ("Id") ON DELETE CASCADE
);

-- Inbox = truth (SYSTEM_DESIGN §8): every user-facing event is a row here first; email/push
-- fan-out is best-effort on top. Payload is the event's JSON document (rendered by clients).
CREATE TABLE notifications (
    "Id" uuid NOT NULL,
    "UserId" uuid NOT NULL,
    "Type" integer NOT NULL,
    "PayloadJson" text NOT NULL,
    "CreatedAtUtc" timestamp with time zone NOT NULL,
    "ReadAtUtc" timestamp with time zone,
    CONSTRAINT "PK_notifications" PRIMARY KEY ("Id"),
    CONSTRAINT "FK_notifications_users_UserId" FOREIGN KEY ("UserId") REFERENCES users ("Id") ON DELETE CASCADE
);

-- FCM push registrations. Schema rides with this phase; the register/unregister endpoints and
-- the push adapter land with mobile (ROADMAP Phase 4).
CREATE TABLE devices (
    "Id" uuid NOT NULL,
    "UserId" uuid NOT NULL,
    "FcmToken" character varying(512) NOT NULL,
    "Platform" character varying(20) NOT NULL,
    "CreatedAtUtc" timestamp with time zone NOT NULL,
    "LastSeenAtUtc" timestamp with time zone NOT NULL,
    CONSTRAINT "PK_devices" PRIMARY KEY ("Id"),
    CONSTRAINT "FK_devices_users_UserId" FOREIGN KEY ("UserId") REFERENCES users ("Id") ON DELETE CASCADE
);

-- One manager row per (venue, user); the reverse lookup drives the provider inbox.
CREATE UNIQUE INDEX "IX_venue_managers_VenueId_UserId" ON venue_managers ("VenueId", "UserId");
CREATE INDEX "IX_venue_managers_UserId" ON venue_managers ("UserId");
-- Provider inbox (applications for a room) and organizer inbox (my applications), newest first.
CREATE INDEX "IX_applications_RoomId_CreatedAtUtc" ON applications ("RoomId", "CreatedAtUtc");
CREATE INDEX "IX_applications_OrganizerId_CreatedAtUtc" ON applications ("OrganizerId", "CreatedAtUtc");
-- The lazy expiry sweep scans undecided applications past their ExpiresAtUtc.
CREATE INDEX "IX_applications_Status_ExpiresAtUtc" ON applications ("Status", "ExpiresAtUtc");
-- Idempotent submits: a replayed (organizer, key) resolves to the original application.
CREATE UNIQUE INDEX "IX_applications_OrganizerId_IdempotencyKey" ON applications ("OrganizerId", "IdempotencyKey")
    WHERE "IdempotencyKey" IS NOT NULL;
CREATE INDEX "IX_application_messages_ApplicationId_SentAtUtc" ON application_messages ("ApplicationId", "SentAtUtc");
-- Inbox reads are per-user, newest first, cursor-paginated.
CREATE INDEX "IX_notifications_UserId_CreatedAtUtc" ON notifications ("UserId", "CreatedAtUtc");
CREATE UNIQUE INDEX "IX_devices_FcmToken" ON devices ("FcmToken");
CREATE INDEX "IX_devices_UserId" ON devices ("UserId");
--rollback DROP TABLE devices;
--rollback DROP TABLE notifications;
--rollback DROP TABLE application_messages;
--rollback DROP TABLE applications;
--rollback DROP TABLE venue_managers;
