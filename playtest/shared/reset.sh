#!/usr/bin/env bash
# Playtest state reset — runs before every case (app.init). Restores the DB to
# "Liquibase seed + fixed test accounts + one pending application", so every run
# starts from the same world regardless of what the previous actor did.
#
# Assumes the dev loop from playtest/README.md: compose postgres (steeple-postgres,
# :5433) + API via `dotnet run` on :5200 (Development, so the dev identity provider
# is registered). BASE_URL/RUN_ID arrive from the harness but aren't needed here.
set -euo pipefail

API_URL="${STEEPLE_API_URL:-http://localhost:5200}"

# Fixed test identities (subjects match what the dev sign-in derives from the email,
# so browser sign-ins land on these same accounts).
HOST_USER="99999999-0000-0000-0000-000000000001"     # pastor.dave@steeple.test — manages Grace Community
ORGANIZER_USER="99999999-0000-0000-0000-000000000002" # jordan@steeple.test — owns the seeded pending request
GRACE_VENUE="11111111-1111-1111-1111-111111111111"
FELLOWSHIP_HALL="10000000-0000-0000-0000-000000000001"

SEED_VENUES="'11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','33333333-3333-3333-3333-333333333333','44444444-4444-4444-4444-444444444444','55555555-5555-5555-5555-555555555555'"
SEED_ROOMS="'10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000003','40000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000001'"

docker exec steeple-postgres psql -U steeple -d steeple -v ON_ERROR_STOP=1 -q <<SQL
-- Everything mutable goes; the Liquibase seed (venues/rooms/photos/open hours) stays.
TRUNCATE ratings, booking_occurrences, bookings,
         application_counter_offers, application_messages, applications,
         notifications, devices, refresh_tokens, user_agreements, user_logins,
         venue_managers, venue_verification_documents, venue_verification_requests,
         users CASCADE;

-- Rooms/venues created by earlier host runs (cascades take their photos/hours/blackouts).
DELETE FROM rooms  WHERE "Id" NOT IN ($SEED_ROOMS);
DELETE FROM venues WHERE "Id" NOT IN ($SEED_VENUES);
-- Photos/blackouts added to *seed* rooms by earlier runs (seed photos predate 2026-06-14).
DELETE FROM room_photos WHERE "CreatedAtUtc" > '2026-06-14';
TRUNCATE room_blackout_dates;

-- Fixed accounts. Subject = 'dev:<email>' matches DevIdTokenVerifier, so signing in
-- through the /login dev form as these emails resumes these exact accounts.
INSERT INTO users ("Id","DisplayName","Email","CreatedAtUtc") VALUES
  ('$HOST_USER','Pastor Dave','pastor.dave@steeple.test',now()),
  ('$ORGANIZER_USER','Jordan Rivera','jordan@steeple.test',now());
INSERT INTO user_logins ("Id","UserId","Provider","Subject","CreatedAtUtc") VALUES
  ('99999999-0000-0000-0000-000000000011','$HOST_USER',100,'dev:pastor.dave@steeple.test',now()),
  ('99999999-0000-0000-0000-000000000012','$ORGANIZER_USER',100,'dev:jordan@steeple.test',now());
INSERT INTO venue_managers ("Id","VenueId","UserId","CreatedAtUtc") VALUES
  ('99999999-0000-0000-0000-000000000021','$GRACE_VENUE','$HOST_USER',now());
SQL

# One pending application (Jordan → Fellowship Hall, one-off ~3 weeks out) so host
# review journeys/studies always have a real request waiting. Via the API so the
# payload tracks the wire contract instead of the table shape.
START_DATE="$(date -v+21d +%F 2>/dev/null || date -d '+21 days' +%F)"
ACCESS="$(curl -sf -X POST "$API_URL/api/v1/auth/sessions" \
  -H 'Content-Type: application/json' \
  -d '{"provider":"dev","idToken":"jordan@steeple.test|Jordan Rivera","turnstileToken":"x","device":{"platform":"web","label":"playtest-reset"}}' \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["accessToken"])')"

curl -sf -o /dev/null -X POST "$API_URL/api/v1/listings/$FELLOWSHIP_HALL/applications" \
  -H "Authorization: Bearer $ACCESS" \
  -H 'Content-Type: application/json' \
  -H "Idempotency-Key: reset-$(uuidgen)" \
  -d "{\"activityType\":\"education\",\"groupSize\":12,
       \"schedule\":{\"frequency\":\"oneOff\",\"startDate\":\"$START_DATE\",\"startTime\":\"18:00\",\"endTime\":\"20:00\"},
       \"intentText\":\"Evening ESL conversation class for our nonprofit — about 12 adults, quiet, chairs in a circle, done by 8pm.\",
       \"turnstileToken\":\"x\"}"

echo "reset ok — seed restored, pastor.dave/jordan accounts ready, 1 pending application ($START_DATE)"
