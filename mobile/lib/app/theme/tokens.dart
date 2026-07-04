import 'dart:ui';

/// The raw design-token values from `docs/DESIGN_SYSTEM.md` §2–§7.
///
/// This is the ONLY file in the app allowed to contain raw hex/size literals.
/// Nothing outside `lib/app/theme/` may reference these primitives directly —
/// components read the semantic roles on [SteepleColors] and the [TextTheme]
/// instead (DESIGN_SYSTEM §11 lint rule).
abstract final class SteepleTokens {
  // §2.1 Primitives — light
  static const paperLight = Color(0xFFFBF7F0);
  static const paperDeepLight = Color(0xFFF3ECE0);
  static const cardLight = Color(0xFFFFFFFF);
  static const inkLight = Color(0xFF2A2620);
  static const inkSoftLight = Color(0xFF5C544A);
  static const inkFaintLight = Color(0xFF6B6253);
  static const sage = Color(0xFF5B7553); // fills, both modes
  static const sageDeepLight = Color(0xFF46603F);
  static const sageTintLight = Color(0xFFE7EEE3);
  static const terracotta = Color(0xFFC0623F); // accents/badges, both modes
  static const terracottaStrong = Color(0xFFB0552F); // filled buttons, both modes
  static const terracottaDeepLight = Color(0xFFA44D2E);
  static const terracottaTintLight = Color(0xFFF6E4DB);
  static const lineLight = Color(0xFFE6DECF);
  static const lineStrongLight = Color(0xFFD8CEBA);

  // §2.1 Primitives — dark (warm charcoal-brown, never neutral gray)
  static const paperDark = Color(0xFF1E1A15);
  static const paperDeepDark = Color(0xFF262119);
  static const cardDark = Color(0xFF2D271F);
  static const inkDark = Color(0xFFF1EAE0);
  static const inkSoftDark = Color(0xFFC9C0B2);
  static const inkFaintDark = Color(0xFFA29786);
  static const sageDeepDark = Color(0xFF9DB894); // text/icons on dark
  static const sageTintDark = Color(0xFF2F3B2B);
  static const terracottaDeepDark = Color(0xFFE0906B);
  static const terracottaTintDark = Color(0xFF422A1E);
  static const lineDark = Color(0xFF3A332A);
  static const lineStrongDark = Color(0xFF4A4235);
  static const actionPrimaryPressedDark = Color(0xFF9C4826);

  // §2.3 Status colors (fg / bg per mode)
  static const successFgLight = Color(0xFF46603F);
  static const successBgLight = Color(0xFFE7EEE3);
  static const successFgDark = Color(0xFF9DB894);
  static const successBgDark = Color(0xFF2F3B2B);
  static const warningFgLight = Color(0xFF7A5510);
  static const warningBgLight = Color(0xFFF5EAD4);
  static const warningFgDark = Color(0xFFD9B36A);
  static const warningBgDark = Color(0xFF3D311B);
  static const infoFgLight = Color(0xFF3F5A73);
  static const infoBgLight = Color(0xFFE2EAF1);
  static const infoFgDark = Color(0xFF93B0C7);
  static const infoBgDark = Color(0xFF26313B);
  static const dangerFgLight = Color(0xFF9C2F23);
  static const dangerBgLight = Color(0xFFF6DFDA);
  static const dangerFgDark = Color(0xFFE08A7C);
  static const dangerBgDark = Color(0xFF42241F);
  static const neutralFgLight = Color(0xFF5C544A);
  static const neutralBgLight = Color(0xFFEFE9DD);
  static const neutralFgDark = Color(0xFFC9C0B2);
  static const neutralBgDark = Color(0xFF322C24);

  // §3 Typography
  static const serifFamily = 'Lora'; // the one bundled font; sans = platform default

  // §4 Spacing — 4-pt grid
  static const double space1 = 4;
  static const double space2 = 8;
  static const double space3 = 12;
  static const double space4 = 16;
  static const double space5 = 20;
  static const double space6 = 24;
  static const double space8 = 32;
  static const double space10 = 40;
  static const double space12 = 48;

  /// Screen gutter (§4): horizontal padding for screen-level content.
  static const double gutter = space4;

  // §5 Shape
  static const double radiusSm = 9;
  static const double radiusMd = 14;
  static const double radiusXl = 20;
  static const double radiusPill = 999;

  // §8.1 Touch targets
  static const double touchTargetMin = 44;
  static const double buttonHeight = 48;

  // §7 Motion
  static const durFast = Duration(milliseconds: 120);
  static const durBase = Duration(milliseconds: 200);
  static const durSlow = Duration(milliseconds: 320);
}
