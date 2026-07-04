--liquibase formatted sql

-- Identity & trust core (ROADMAP Phase 1, SYSTEM_DESIGN §6): SSO-only users, their provider
-- logins, rotating hashed refresh tokens, and per-version ToS/Privacy acceptance records.
-- Hand-maintained SQL is the source of truth; the EF configurations in Steeple.Persistence
-- mirror these tables column-for-column.

--changeset steeple:003-identity
CREATE TABLE users (
    "Id" uuid NOT NULL,
    "DisplayName" character varying(200) NOT NULL,
    "Email" character varying(320),
    "CreatedAtUtc" timestamp with time zone NOT NULL,
    -- Set when the account is deleted (DELETE /api/v1/me): the row is anonymized, never removed,
    -- so agreement records and (later) bookings/ratings keep their referential integrity.
    "DeletedAtUtc" timestamp with time zone,
    CONSTRAINT "PK_users" PRIMARY KEY ("Id")
);

CREATE TABLE user_logins (
    "Id" uuid NOT NULL,
    "UserId" uuid NOT NULL,
    "Provider" integer NOT NULL,
    "Subject" character varying(255) NOT NULL,
    "CreatedAtUtc" timestamp with time zone NOT NULL,
    CONSTRAINT "PK_user_logins" PRIMARY KEY ("Id"),
    CONSTRAINT "FK_user_logins_users_UserId" FOREIGN KEY ("UserId") REFERENCES users ("Id") ON DELETE CASCADE
);

CREATE TABLE refresh_tokens (
    "Id" uuid NOT NULL,
    "UserId" uuid NOT NULL,
    -- One family per sign-in (= the access token's `sid` claim). Rotation stays inside the
    -- family; reuse of a rotated token revokes the whole family.
    "FamilyId" uuid NOT NULL,
    -- SHA-256 hex of the opaque token. The raw token is never stored.
    "TokenHash" character varying(64) NOT NULL,
    "DeviceLabel" character varying(100),
    "Platform" character varying(20),
    "CreatedAtUtc" timestamp with time zone NOT NULL,
    "ExpiresAtUtc" timestamp with time zone NOT NULL,
    "RevokedAtUtc" timestamp with time zone,
    CONSTRAINT "PK_refresh_tokens" PRIMARY KEY ("Id"),
    CONSTRAINT "FK_refresh_tokens_users_UserId" FOREIGN KEY ("UserId") REFERENCES users ("Id") ON DELETE CASCADE
);

CREATE TABLE user_agreements (
    "Id" uuid NOT NULL,
    "UserId" uuid NOT NULL,
    "DocType" integer NOT NULL,
    "Version" character varying(50) NOT NULL,
    "AcceptedAtUtc" timestamp with time zone NOT NULL,
    CONSTRAINT "PK_user_agreements" PRIMARY KEY ("Id"),
    CONSTRAINT "FK_user_agreements_users_UserId" FOREIGN KEY ("UserId") REFERENCES users ("Id") ON DELETE CASCADE
);

-- (Provider, Subject) is the SSO identity key for find-or-create.
CREATE UNIQUE INDEX "IX_user_logins_Provider_Subject" ON user_logins ("Provider", "Subject");
CREATE INDEX "IX_user_logins_UserId" ON user_logins ("UserId");
-- Cross-provider duplicate-email detection ("sign in with your original provider" — no auto-link).
CREATE INDEX "IX_users_Email" ON users ("Email");
CREATE UNIQUE INDEX "IX_refresh_tokens_TokenHash" ON refresh_tokens ("TokenHash");
CREATE INDEX "IX_refresh_tokens_UserId" ON refresh_tokens ("UserId");
CREATE INDEX "IX_refresh_tokens_FamilyId" ON refresh_tokens ("FamilyId");
CREATE UNIQUE INDEX "IX_user_agreements_UserId_DocType_Version" ON user_agreements ("UserId", "DocType", "Version");
--rollback DROP TABLE user_agreements;
--rollback DROP TABLE refresh_tokens;
--rollback DROP TABLE user_logins;
--rollback DROP TABLE users;
