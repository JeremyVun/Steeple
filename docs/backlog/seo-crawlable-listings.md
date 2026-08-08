# Crawlable listing pages — moved

This brief is superseded by:

- [`seo/design.md`](seo/design.md) — adopted behaviour and architecture; and
- [`seo/build_plan.md`](seo/build_plan.md) — implementation order and verification.

The earlier proposal used a separate server-rendered landing page that linked into the hash-routed
map. The adopted design instead keeps one clean `/space/{venueSlug}/{roomSlug}` URL throughout:
the server returns a semantic listing document, then progressively opens the existing map, room
sheet and correctly centred venue at that same URL.
