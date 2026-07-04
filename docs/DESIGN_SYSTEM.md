# Steeple — Design System (canonical tokens & UI standards)

> **Status:** Adopted 2026-07-04. The **single source of truth for Steeple's visual and
> interaction language across all surfaces** (Web funnel, Flutter app; Admin may adopt
> pragmatically). `src/Steeple.Web/wwwroot/css/site.css` is the as-built **web binding**
> of these tokens; the Flutter theme (`/mobile/lib/app/theme/`) must be a 1:1 binding of
> the same tokens. **No component ships styled with raw values — everything derives from
> a token in this doc.**
>
> Change rule: a token change is one PR touching **this doc + `site.css` + mobile
> `tokens.dart`** (once each exists). If a surface disagrees with this doc, the surface is
> wrong. Additive tokens (new semantic role, new status) are free; changing an existing
> token's value or meaning needs a line in the decision log at the bottom.

## 1. Brand personality — what the UI must feel like

Steeple is a **neighbourly noticeboard, not a SaaS booking engine** (PRD: community-first,
free-first, warm, non-corporate). Every visual decision serves that:

1. **Paper, not white.** Backgrounds are warm paper (`#FBF7F0`), never pure white page
   backgrounds; white is reserved for cards sitting *on* paper. Dark mode is warm
   charcoal-brown, never neutral gray or pure black.
2. **Serif for moments, sans for work.** The brand serif appears in headings, the
   wordmark, prices, and "moment" copy (approval banners). All functional UI (body,
   labels, buttons, forms) is the platform sans. Never set body text in the serif.
3. **Sage means trust and free; terracotta means action and paid.** Sage (`#5B7553`) is
   the color of the FREE badge, selected filters, verified checks, success. Terracotta
   (`#C0623F`) is the primary CTA, paid-price accents, and warmth. The two never compete
   inside one component — one accent per component.
4. **Soft geometry.** Pills for interactive chips/buttons, 14px radius cards, generous
   whitespace. No sharp corners, no hairline-dense data-table aesthetics.
5. **Honest and calm.** No urgency mechanics (countdown timers, "3 people are viewing"),
   no exclamation-mark copy, no dark patterns. Trust claims are precise: "Identity
   verified (SSO)" — never "vetted" or "safe" (PRD Trust framing is binding).
6. **Accessibility is brand.** Accessibility filters are a first-class product feature;
   the UI itself must be WCAG 2.2 AA (§9). An inaccessible screen is off-brand, period.

## 2. Color

### 2.1 Primitives (the palette — never referenced directly by components)

| Primitive | Light | Dark | Web CSS var |
|---|---|---|---|
| paper | `#FBF7F0` | `#1E1A15` | `--paper` |
| paper-deep | `#F3ECE0` | `#262119` | `--paper-deep` |
| card | `#FFFFFF` | `#2D271F` | `--card` |
| ink | `#2A2620` | `#F1EAE0` | `--ink` |
| ink-soft | `#5C544A` | `#C9C0B2` | `--ink-soft` |
| ink-faint | `#6B6253` | `#A29786` | `--ink-faint` |
| sage | `#5B7553` | `#5B7553` (fills) | `--sage` |
| sage-deep | `#46603F` | `#9DB894` (text/icons) | `--sage-deep` |
| sage-tint | `#E7EEE3` | `#2F3B2B` | `--sage-tint` |
| terracotta | `#C0623F` | `#C0623F` (fills) | `--terracotta` |
| terracotta-strong | `#B0552F` | `#B0552F` | *(new — see note)* |
| terracotta-deep | `#A44D2E` | `#E0906B` (text/icons) | `--terracotta-deep` |
| terracotta-tint | `#F6E4DB` | `#422A1E` | `--terracotta-tint` |
| line | `#E6DECF` | `#3A332A` | `--line` |
| line-strong | `#D8CEBA` | `#4A4235` | `--line-strong` |

> **`terracotta-strong` (added 2026-07-04, accessibility-driven):** white text on
> `#C0623F` measures ≈4.2:1 — AA for large/bold text only. Filled primary buttons use
> `terracotta-strong #B0552F` (≈4.8:1 with white — full AA). Web's `.btn-primary` should
> migrate from `#C0623F` on next touch; the visual delta is negligible. `#C0623F` remains
> correct where text is large/bold or absent (badges, map pins, accents).

### 2.2 Semantic tokens (what components actually reference)

Flutter names are the camelCase of the token (e.g. `surfaceRaised`), exposed via a
`ThemeExtension<SteepleColors>` — see §11.

| Semantic token | Binds to (light / dark) | Used for |
|---|---|---|
| `background` | paper | Screen/page background |
| `surface` | paper-deep | Grouped/inset areas, sheets' secondary zones, skeleton base |
| `surfaceRaised` | card | Cards, sheets, dialogs, popups |
| `textPrimary` | ink | Headings, primary copy |
| `textSecondary` | ink-soft | Supporting copy, card meta |
| `textTertiary` | ink-faint | Placeholders, captions, disabled text |
| `border` | line | Default card/divider borders |
| `borderStrong` | line-strong | Input borders, emphasized dividers |
| `actionPrimary` | terracotta-strong | Filled primary buttons (white label) |
| `actionPrimaryPressed` | terracotta-deep light / `#9C4826` dark | Pressed state |
| `accent` | terracotta | Paid-price text-on-tint, decorative accents, tab badge dot |
| `link` | sage-deep | Links, text buttons, secondary-button labels |
| `selected` | sage (fill) + sage-tint (bg) + sage-deep (fg) | Selected chips/toggles, active states |
| `focus` | sage @ 35% alpha, 3px ring | Focus indicator (all surfaces) |
| `overlay` | ink @ 40% light / black @ 55% dark | Scrims behind sheets/dialogs |

### 2.3 Status colors (semantic, for state chips/banners — see §8.4 for mappings)

| Role | Light fg / bg | Dark fg / bg |
|---|---|---|
| `success` | `#46603F` / `#E7EEE3` | `#9DB894` / `#2F3B2B` |
| `warning` | `#7A5510` / `#F5EAD4` | `#D9B36A` / `#3D311B` |
| `info` | `#3F5A73` / `#E2EAF1` | `#93B0C7` / `#26313B` |
| `danger` | `#9C2F23` / `#F6DFDA` | `#E08A7C` / `#42241F` |
| `neutral` | `#5C544A` / `#EFE9DD` | `#C9C0B2` / `#322C24` |

`danger` is deliberately redder than terracotta (which is an *action* color, not an error
color) — destructive buttons and error text use `danger`, never terracotta.

### 2.4 Approved text/background pairs (contrast-validated)

| Pair | Ratio | Verdict |
|---|---|---|
| ink on paper | ≈14:1 | AAA |
| ink-soft on paper | ≈7:1 | AAA-small |
| ink-faint on paper | ≈5.6:1 | AA — fine for captions/placeholders |
| sage-deep on paper / on sage-tint | ≈6.5:1 / ≈5.4:1 | AA |
| white on sage `#5B7553` | ≈5.1:1 | AA (FREE badge, pins) |
| white on terracotta-strong `#B0552F` | ≈4.8:1 | AA (primary buttons) |
| white on terracotta `#C0623F` | ≈4.2:1 | **Large/bold text only** |
| dark: textPrimary on background | ≈14.5:1 | AAA |
| dark: sage-deep(`#9DB894`) on background | ≈8:1 | AA |

New pairs must be checked (any WCAG contrast checker) before use; add them here.

## 3. Typography

| Face | Light on | Notes |
|---|---|---|
| **Brand serif** | Web: `Iowan Old Style, Palatino Linotype, Palatino, Georgia, serif` (system stack, no webfont). Mobile: **bundle Lora** (variable, OFL) — the one bundled font MOBILE_DESIGN §4's size budget allows | Headings, wordmark, prices, "moment" copy |
| **Sans** | `system-ui` on web; platform default on mobile (SF Pro / Roboto) — never bundled | Everything else |

Type scale (sizes in logical px/sp at 1.0 text scale; must survive user text scaling to
2.0 without clipped containers — no fixed-height text boxes):

| Token | Face / weight | Size / line | Flutter `TextTheme` slot | Use |
|---|---|---|---|---|
| `displaySerif` | serif 600 | 28 / 34 | `headlineMedium` | Screen heroes, listing detail title |
| `headlineSerif` | serif 600 | 22 / 28 | `headlineSmall` | Section heads, card-stack titles |
| `titleLg` | sans 600 | 18 / 24 | `titleLarge` | App-bar titles, dialog titles |
| `title` | sans 600 | 16 / 22 | `titleMedium` | Card titles, list-row primary |
| `body` | sans 400 | 16 / 24 | `bodyLarge` | Default body copy |
| `bodySm` | sans 400 | 14 / 20 | `bodyMedium` | Card meta, secondary copy |
| `label` | sans 700, +0.08em tracking, UPPERCASE | 12 / 16 | `labelSmall` | Eyebrows, filter-group legends |
| `button` | sans 600 | 16 / 20 | `labelLarge` | All button labels |
| `caption` | sans 400 | 12 / 16 | `bodySmall` | Timestamps, photo captions, footnotes |
| `priceSerif` | serif 600 | 22 / 26 | (custom style) | Price displays ("FREE", "$25/hr") |

Letter-spacing on serif headings: `-0.01em` (matches web). Never uppercase the serif.

## 4. Spacing & layout

4-pt grid. Tokens: `space1=4, space2=8, space3=12, space4=16, space5=20, space6=24,
space8=32, space10=40, space12=48`.

- Screen gutter (mobile): `space4` (16). Card internal padding: `space4`.
- Vertical gap between list cards: `space3` (12); between sections: `space6` (24).
- Web keeps its `--gap`/`--wrap`/`--app` shell values (as-built) — they are the web
  binding of this rhythm at desktop widths.

## 5. Shape & elevation

| Token | Value | Use |
|---|---|---|
| `radiusSm` | 9 | Inputs, thumbnails, small controls |
| `radiusMd` | 14 | Cards, dialogs, map container, popups |
| `radiusXl` | 20 | Bottom sheets (top corners), full-screen modals |
| `radiusPill` | 999 | Buttons, chips, badges, toggles |

Elevation is **warm-tinted** (shadow color = ink `#2A2620`, never black) and used
sparingly — prefer a `border` + `elevation1`:

| Token | Value (web as-built) | Use |
|---|---|---|
| `elevation1` | `0 1px 2px ink@6%, 0 1px 3px ink@5%` (`--shadow-sm`) | Cards at rest, chips |
| `elevation2` | `0 6px 18px ink@8%, 0 2px 6px ink@5%` (`--shadow-md`) | Sticky bars, popups, apply card |
| `elevation3` | `0 18px 44px ink@13%` (`--shadow-lg`) | Sheets, dialogs |

Dark mode: shadows barely read — use `surfaceRaised` + `border` steps for depth instead.

## 6. Iconography

- **Flutter:** built-in Material icons, **always the `_rounded` variant**
  (`Icons.search_rounded`) — no extra icon dependency. Default size 24; inline-with-text 18.
- **Web:** the existing hand-drawn inline SVGs (stroke `currentColor`, 1.5–2px stroke) —
  matches rounded style.
- Icons are never the sole carrier of meaning (pair with text or a semantic label).

## 7. Motion & haptics

| Token | Value | Use |
|---|---|---|
| `durFast` | 120ms | Chips, toggles, hover/pressed states |
| `durBase` | 200ms | Sheet/dialog entrances, list insertions, tab cross-fade |
| `durSlow` | 320ms | Hero image transition (card → detail), map camera moves |
| `curveStandard` | ease-out-cubic | Default |
| `curveEmphasis` | spring, low bounce | Hero transition, approval "moment" banner |

Rules: respect reduced-motion on all surfaces (web as-built does; Flutter checks
`MediaQuery.disableAnimations` — hero falls back to fade). Never animate layout on
scroll. Haptics (mobile): light impact on apply-submitted and approval seen; selection
click on filter chips; never on scroll or errors.

## 8. Component specs (canonical set)

Anything below exists **once**, in shared widget/CSS form, and features consume it —
no feature re-implements a status chip or an empty state.

### 8.1 Buttons

Pill-shaped, min touch target 44×44 (48 standard height), `button` type style.

| Variant | Fill / border / label | Use |
|---|---|---|
| Primary | `actionPrimary` / none / white | The one main action per screen ("Ask to book") |
| Secondary | transparent / `borderStrong` / `link` | Coequal or dismissive actions |
| Text | none / none / `link` | Inline, low-emphasis |
| Destructive | `danger` fg on `danger` bg-tint (outlined) → solid `danger` in confirm dialogs | Cancel booking, delete account |
| Disabled | `borderStrong` fill / `textTertiary` label | Any variant, disabled |
| SSO | Per provider brand guidelines (Apple: black/white per HIG; Google: official button spec) | Exempt from palette — compliance beats brand |

One primary button per screen. Loading state = inline spinner replacing the label, button
stays same width (no layout jump).

### 8.2 Chips

- **Filter chip (interactive):** pill, `surfaceRaised` bg + `borderStrong`; selected →
  `sage-tint` bg + `sage` border + `sage-deep` 600 text (exactly web's `.chip`).
- **Static tag chip:** `sage-tint` bg, `sage-deep` text, no border (web `.chip-static`);
  overflow chip ("+3") uses `surface` bg + `textTertiary`.

### 8.3 Badges

- **FREE:** solid sage, white 700 text, pill — the single most brand-loaded element;
  never restyle it.
- **Price:** `surfaceRaised` bg, ink text, `borderStrong` border, pill.
- **Verified (SSO):** sage-outlined pill with check glyph + "Identity verified (SSO)";
  never reword to imply vetting.

### 8.4 Status chip — the one mapping for all wire statuses

Tint-background chips (`bg` + `fg` from §2.3), `bodySm` 600 label. Wire token → role:

| Wire status (CONTRACTS §5) | Role | Label |
|---|---|---|
| application `pending` | warning | "Pending" |
| application `needsInfo` | info | "Needs info" |
| application `approved` | success | "Approved" |
| application `declined` | danger | "Declined" |
| application `withdrawn` / `expired` | neutral | "Withdrawn" / "Expired" |
| booking `confirmed` | success | "Confirmed" |
| booking `completed` | neutral | "Completed" |
| booking `cancelled` | danger | "Cancelled" |
| occurrence `scheduled` | info | "Scheduled" |
| occurrence `occurred` | neutral | "Went ahead" |
| occurrence `noShow` | danger | "No-show" |
| occurrence `cancelled` | neutral | "Cancelled" |
| *(unknown token)* | neutral | humanized raw token |

### 8.5 Listing card

`surfaceRaised`, `radiusMd`, `border`, `elevation1`. Anatomy: 4:3 photo (CDN thumb-400
variant; placeholder = sage-tint→paper-deep gradient with serif initial), FREE/price
badge top-left, then `title` room name, `bodySm` venue name + suburb (textSecondary),
`bodySm` capacity ("Up to 60") with 600-weight number, static tag chips (max 3 + "+n").
Whole card is one tap target with a semantic label ("<room>, <venue>, free, seats 60").

### 8.6 Map pins

Teardrop, 30×38, paper stroke 2.5, white center dot (web `map.js` as-built):
free = sage fill, paid = terracotta fill. **Selected:** scale 1.15 + ink stroke replacing
paper. **Cluster:** ink circle, paper `title` count. One pre-rasterized bitmap per state
(MOBILE_DESIGN §4 rule 3) — pin colors are frozen here so the rasterized set stays small.

### 8.7 Feedback surfaces

- **EmptyState:** dashed `borderStrong` border, `radiusMd`, centered icon (not emoji on
  mobile), `headlineSerif` title, `bodySm` textSecondary body, optional secondary button.
  Always says what to *do* ("Widen your search area").
- **ErrorView:** renders an `AppError` (MOBILE_CONTRACTS §4): icon + plain-language title
  + retry button when retryable. Never shows codes/stack traces; `danger` role for icon.
- **Skeletons:** `surface`-colored blocks mirroring the real layout, subtle 1.2s shimmer
  (disabled under reduced motion). Skeleton on first load; stale-while-revalidate content
  + thin progress indicator on refresh — never blank the screen for a refetch.
- **Offline banner:** `warning` tint bar under the app bar, "You're offline — showing
  saved results". Non-blocking (MOBILE_DESIGN §5 offline stance).
- **Snackbar/toast:** ink bg (dark: surfaceRaised), paper text, pill, bottom-floating;
  one at a time; only for transient confirmations ("Application withdrawn").

### 8.8 Navigation chrome (mobile)

- **Bottom tab bar:** 4 tabs — Explore, Inbox, Bookings, Profile (route table:
  MOBILE_CONTRACTS §7). Active = sage-deep icon+label; inactive = textTertiary; unread
  badge = terracotta dot. `surfaceRaised` bg, top `border` hairline.
- **App bar:** `background` bg (blends with screen), no elevation until content scrolls
  under (then `elevation1`), `titleLg` title. Large-title pattern only on Explore.
- **Bottom sheets:** `radiusXl` top corners, grabber handle, `overlay` scrim — used for
  filters and the SSO gate.

### 8.9 Forms (apply flow)

Inputs: `surfaceRaised` bg, `borderStrong` border, `radiusSm`, `space3` internal padding;
focus = `focus` ring + sage border. Labels above inputs (`label` style), helper/error text
below (`caption`; error in `danger` fg + icon — color never alone). The intent textarea
is the apply flow's hero: give it room (min 5 lines), placeholder written as a friendly
example ("Toddler playgroup, about 15 of us, Tuesday mornings…"), live character guidance
only if a server limit exists. Group size / schedule pickers use native platform pickers.

## 9. Accessibility contract (hard rules, all surfaces)

1. WCAG 2.2 AA minimum; text pairs only from §2.4 or newly validated.
2. Touch targets ≥44×44 logical px (48 standard); web interactive elements equivalent.
3. Full dynamic-type support to 2.0 scale — layouts reflow, never clip (no fixed-height
   text containers; `prototypeItem` sized at current text scale).
4. Every interactive element has a semantic label; map pins expose room+venue+price;
   decorative images are marked decorative, listing photos get meaningful alt/labels.
5. Color never carries meaning alone (status chips have labels, errors have icons).
6. Focus visible everywhere (web `--focus` ring; Flutter default focus highlights on
   keyboard/switch access).
7. Reduced motion honored (§7); no autoplaying motion.
8. Screen-reader pass (VoiceOver + TalkBack) on the browse→apply path before each release.

## 10. Voice & microcopy

- **US English** in all user-facing copy (the beachhead is Virginia): "neighborly",
  "center". Sentence case everywhere — headings, buttons, tabs. No exclamation marks.
- Warm, plain, concrete. Say "space" or "hall", not "listing"/"inventory"/"asset". Name
  the church: "Ask St. Andrew's", not "Contact host".
- Buttons are verb phrases: "Ask to book", "Send answer", "Cancel booking".
- Trust copy is precise and modest (§1.5). The apply gate explains *why*:
  "Sign in so St. Andrew's knows who's asking."
- Errors: what happened + what to do, no codes: "Couldn't send your application. Check
  your connection and try again."
- Dates/times shown in the **venue's timezone** with explicit day names ("Tuesdays
  9:00–11:30 AM"); relative stamps for inbox ("2h ago"), absolute on detail.

## 11. Implementation contract

**Flutter** (`/mobile/lib/app/theme/`):
- `tokens.dart` — every §2–§7 value as `static const` (the only file with raw hex).
- `steeple_colors.dart` — `ThemeExtension<SteepleColors>` exposing §2.2/§2.3 semantic
  roles; light + dark instances. Components read `context.steepleColors.x`, never
  `Colors.*`, never a primitive directly.
- `typography.dart` — §3 scale onto `TextTheme` slots; Lora loaded via `fontFamily` for
  serif slots only.
- `theme.dart` — assembles `ThemeData` (light/dark), component themes (buttons, chips,
  inputs, sheets) so defaults are on-system without per-widget styling.
- Lint/review rule: **no raw `Color(0x…)`, no `Colors.*`, no `TextStyle(fontSize:…)`
  outside `app/theme/`.** Shared widgets in `core/widgets/` implement §8.

**Web:** `site.css` `:root` vars are the token binding; new CSS must use vars, never raw
hex. Web has no dark theme yet — when it lands it reuses this doc's dark column.

## 12. Decision log

| Date | Decision | Rationale |
|---|---|---|
| 2026-07-04 | Canonicalized the as-built web palette/type/shape as the cross-surface system | Web slice already embodies the PRD's community-first brand; mobile must match it, not fork it |
| 2026-07-04 | Added `terracotta-strong #B0552F` for filled-button fills | White-on-`#C0623F` fails AA for standard button labels (≈4.2:1) |
| 2026-07-04 | Mobile brand serif = bundled Lora; body = platform sans | Iowan Old Style isn't on Android; one bundled variable font fits the size budget |
| 2026-07-04 | `danger` split from terracotta | Terracotta is the action color; destructive/error must not look like the primary CTA |
| 2026-07-04 | US English for product copy | Beachhead is NoVA; brand defaults previously mixed AU spelling |
