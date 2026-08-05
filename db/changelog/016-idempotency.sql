--liquibase formatted sql

-- Idempotency ledger for manage creates (`docs/backlog/v2_migration/design.md` D8). The
-- applications module hangs its key off the created row (a filtered unique index on
-- (OrganizerId, IdempotencyKey) in 004), which works only because an application carries its
-- owner as a column. A venue does not — ownership lives in venue_managers — so the per-user
-- uniqueness that makes the guard race-safe cannot be expressed on venues. This tiny keyed
-- table gives both venue and room creates exact per-user scope, and the primary key IS the
-- guard: two overlapping POSTs with one key can only insert one row, and the loser rolls back
-- its whole create with it (one SaveChanges = one transaction).
--
-- Rows are permanent (no TTL) — same stance as the applications key, which lives on its row
-- forever. CreatedAtUtc exists so a future sweep has something to sort on.
-- Hand-maintained SQL is the source of truth; IdempotencyRecordConfiguration mirrors it
-- column-for-column.

--changeset steeple:016-idempotency
CREATE TABLE idempotency_records (
    "UserId" uuid NOT NULL,
    -- Which create the key was spent on, e.g. 'manage.venue.create'. Part of the key so one
    -- client key reused across two different endpoints can't answer with the wrong resource.
    "Scope" character varying(64) NOT NULL,
    -- The client-supplied Idempotency-Key header value (a GUID).
    "Key" uuid NOT NULL,
    -- The id of the resource the original request created.
    "ResourceId" uuid NOT NULL,
    "CreatedAtUtc" timestamp with time zone NOT NULL,
    CONSTRAINT "PK_idempotency_records" PRIMARY KEY ("UserId", "Scope", "Key"),
    CONSTRAINT "FK_idempotency_records_users_UserId" FOREIGN KEY ("UserId")
        REFERENCES users ("Id") ON DELETE CASCADE
);
--rollback DROP TABLE idempotency_records;
