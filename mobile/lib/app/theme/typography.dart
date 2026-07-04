import 'package:flutter/material.dart';

import 'tokens.dart';

/// DESIGN_SYSTEM §3 type scale bound onto Flutter's [TextTheme] slots.
///
/// Serif slots (Lora) carry `fontVariations` so the variable font renders the
/// exact weight; sans slots leave `fontFamily` unset — the platform default
/// (SF Pro / Roboto) is deliberate, never bundled. Sizes are logical px at 1.0
/// text scale; layouts must survive user scaling to 2.0 (§9.3), so nothing here
/// may be paired with a fixed-height container.
abstract final class SteepleTypography {
  static const _serifWeight = FontWeight.w600;
  static const _serifVariations = [FontVariation('wght', 600)];

  /// `displaySerif` — screen heroes, listing detail title (28/34).
  static const displaySerif = TextStyle(
    fontFamily: SteepleTokens.serifFamily,
    fontWeight: _serifWeight,
    fontVariations: _serifVariations,
    fontSize: 28,
    height: 34 / 28,
    letterSpacing: -0.28, // -0.01em on serif headings
  );

  /// `headlineSerif` — section heads, card-stack titles (22/28).
  static const headlineSerif = TextStyle(
    fontFamily: SteepleTokens.serifFamily,
    fontWeight: _serifWeight,
    fontVariations: _serifVariations,
    fontSize: 22,
    height: 28 / 22,
    letterSpacing: -0.22,
  );

  /// `priceSerif` — price displays ("FREE", "$25/hr"). Custom style: not a
  /// TextTheme slot; badge widgets reference it directly (22/26).
  static const priceSerif = TextStyle(
    fontFamily: SteepleTokens.serifFamily,
    fontWeight: _serifWeight,
    fontVariations: _serifVariations,
    fontSize: 22,
    height: 26 / 22,
    letterSpacing: -0.22,
  );

  /// `titleLg` — app-bar titles, dialog titles (18/24).
  static const titleLg = TextStyle(fontWeight: FontWeight.w600, fontSize: 18, height: 24 / 18);

  /// `title` — card titles, list-row primary (16/22).
  static const title = TextStyle(fontWeight: FontWeight.w600, fontSize: 16, height: 22 / 16);

  /// `body` — default body copy (16/24).
  static const body = TextStyle(fontWeight: FontWeight.w400, fontSize: 16, height: 24 / 16);

  /// `bodySm` — card meta, secondary copy (14/20).
  static const bodySm = TextStyle(fontWeight: FontWeight.w400, fontSize: 14, height: 20 / 14);

  /// `label` — eyebrows, filter-group legends (12/16, +0.08em, UPPERCASE).
  /// Uppercasing is the caller's job (`text.toUpperCase()`) — never the serif.
  static const label = TextStyle(
    fontWeight: FontWeight.w700,
    fontSize: 12,
    height: 16 / 12,
    letterSpacing: 0.96, // +0.08em at 12px
  );

  /// `button` — all button labels (16/20).
  static const button = TextStyle(fontWeight: FontWeight.w600, fontSize: 16, height: 20 / 16);

  /// `caption` — timestamps, photo captions, footnotes (12/16).
  static const caption = TextStyle(fontWeight: FontWeight.w400, fontSize: 12, height: 16 / 12);

  /// The §3 scale on Material slots (mapping fixed by DESIGN_SYSTEM §3 table).
  static TextTheme textTheme(Color textPrimary) => TextTheme(
        headlineMedium: displaySerif.copyWith(color: textPrimary),
        headlineSmall: headlineSerif.copyWith(color: textPrimary),
        titleLarge: titleLg.copyWith(color: textPrimary),
        titleMedium: title.copyWith(color: textPrimary),
        bodyLarge: body.copyWith(color: textPrimary),
        bodyMedium: bodySm.copyWith(color: textPrimary),
        labelSmall: label.copyWith(color: textPrimary),
        labelLarge: button.copyWith(color: textPrimary),
        bodySmall: caption.copyWith(color: textPrimary),
      );
}
