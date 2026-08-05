--liquibase formatted sql

--changeset steeple:011-application-organization-name
-- Who's asking, beyond a personal display name: the organizer's group/organization,
-- captured optionally at apply time and shown prominently to the host (2026-07 discovery
-- study: a request reading only "our nonprofit" was the sole reason a host refused to
-- approve). Optional by design — requiring it would tax the apply hot path.
ALTER TABLE applications ADD COLUMN "OrganizationName" character varying(200);
--rollback ALTER TABLE applications DROP COLUMN "OrganizationName";
