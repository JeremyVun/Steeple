--liquibase formatted sql

-- Host ownership / lease-authority verification. The app stores review metadata and links to
-- externally hosted/signed documents only; it does not custody raw deeds, leases, IDs, or other
-- sensitive document contents.

--changeset steeple:007-venue-verification
CREATE TABLE venue_verification_requests (
    "Id" uuid NOT NULL,
    "VenueId" uuid NOT NULL,
    "RequestedByUserId" uuid NOT NULL,
    "Status" integer NOT NULL,
    "ContactName" character varying(200) NOT NULL,
    "ContactEmail" character varying(320),
    "EvidenceSummary" character varying(4000) NOT NULL,
    "AttestedAuthority" boolean NOT NULL,
    "RequestedAtUtc" timestamp with time zone NOT NULL,
    "DecidedAtUtc" timestamp with time zone,
    "DecidedBy" character varying(320),
    "DecisionNote" character varying(1000),
    CONSTRAINT "PK_venue_verification_requests" PRIMARY KEY ("Id"),
    CONSTRAINT "FK_venue_verification_requests_venues_VenueId" FOREIGN KEY ("VenueId") REFERENCES venues ("Id") ON DELETE CASCADE,
    CONSTRAINT "FK_venue_verification_requests_users_RequestedByUserId" FOREIGN KEY ("RequestedByUserId") REFERENCES users ("Id") ON DELETE RESTRICT
);

CREATE TABLE venue_verification_documents (
    "Id" uuid NOT NULL,
    "RequestId" uuid NOT NULL,
    "Label" character varying(200) NOT NULL,
    "ExternalUrl" character varying(1000) NOT NULL,
    "CreatedAtUtc" timestamp with time zone NOT NULL,
    CONSTRAINT "PK_venue_verification_documents" PRIMARY KEY ("Id"),
    CONSTRAINT "FK_venue_verification_documents_requests_RequestId" FOREIGN KEY ("RequestId") REFERENCES venue_verification_requests ("Id") ON DELETE CASCADE
);

CREATE INDEX "IX_venue_verification_requests_Status_RequestedAtUtc" ON venue_verification_requests ("Status", "RequestedAtUtc");
CREATE INDEX "IX_venue_verification_requests_VenueId_RequestedAtUtc" ON venue_verification_requests ("VenueId", "RequestedAtUtc");
CREATE INDEX "IX_venue_verification_requests_RequestedByUserId" ON venue_verification_requests ("RequestedByUserId");
CREATE UNIQUE INDEX "UX_venue_verification_requests_VenueId_Pending" ON venue_verification_requests ("VenueId") WHERE "Status" = 0;
CREATE INDEX "IX_venue_verification_documents_RequestId" ON venue_verification_documents ("RequestId");
--rollback DROP TABLE venue_verification_documents;
--rollback DROP TABLE venue_verification_requests;
