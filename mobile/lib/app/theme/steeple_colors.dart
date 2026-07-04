import 'package:flutter/material.dart';

import 'tokens.dart';

/// A status role for tint-background chips and banners (DESIGN_SYSTEM §2.3).
@immutable
class StatusColors {
  const StatusColors({required this.fg, required this.bg});

  final Color fg;
  final Color bg;

  StatusColors lerpTo(StatusColors other, double t) => StatusColors(
        fg: Color.lerp(fg, other.fg, t)!,
        bg: Color.lerp(bg, other.bg, t)!,
      );
}

/// The semantic color roles of DESIGN_SYSTEM §2.2/§2.3 — what components
/// actually reference. Read via `context.steepleColors`; never `Colors.*`
/// and never a primitive from tokens.dart directly.
@immutable
class SteepleColors extends ThemeExtension<SteepleColors> {
  const SteepleColors({
    required this.background,
    required this.surface,
    required this.surfaceRaised,
    required this.textPrimary,
    required this.textSecondary,
    required this.textTertiary,
    required this.border,
    required this.borderStrong,
    required this.actionPrimary,
    required this.actionPrimaryPressed,
    required this.accent,
    required this.link,
    required this.selectedFill,
    required this.selectedBg,
    required this.selectedFg,
    required this.focus,
    required this.overlay,
    required this.shadow,
    required this.success,
    required this.warning,
    required this.info,
    required this.danger,
    required this.neutral,
  });

  final Color background; // screen background (paper)
  final Color surface; // inset/grouped areas, skeleton base (paper-deep)
  final Color surfaceRaised; // cards, sheets, dialogs (card)
  final Color textPrimary;
  final Color textSecondary;
  final Color textTertiary;
  final Color border;
  final Color borderStrong;
  final Color actionPrimary; // filled primary buttons (white label)
  final Color actionPrimaryPressed;
  final Color accent; // paid-price accents, tab badge dot — never buttons
  final Color link; // links, text buttons, secondary-button labels
  final Color selectedFill; // sage — FREE badge, free pins, selected borders
  final Color selectedBg; // sage-tint — selected chip background
  final Color selectedFg; // sage-deep — selected chip text
  final Color focus; // 3px focus ring
  final Color overlay; // scrims behind sheets/dialogs
  final Color shadow; // warm-tinted elevation (ink, never black)
  final StatusColors success;
  final StatusColors warning;
  final StatusColors info;
  final StatusColors danger;
  final StatusColors neutral;

  /// Warm-tinted elevation shadows (DESIGN_SYSTEM §5). Dark mode returns none —
  /// depth comes from `surfaceRaised` + `border` steps instead.
  List<BoxShadow> get elevation1 => shadow.a == 0
      ? const []
      : [
          BoxShadow(color: shadow.withValues(alpha: 0.06), offset: const Offset(0, 1), blurRadius: 2),
          BoxShadow(color: shadow.withValues(alpha: 0.05), offset: const Offset(0, 1), blurRadius: 3),
        ];

  List<BoxShadow> get elevation2 => shadow.a == 0
      ? const []
      : [
          BoxShadow(color: shadow.withValues(alpha: 0.08), offset: const Offset(0, 6), blurRadius: 18),
          BoxShadow(color: shadow.withValues(alpha: 0.05), offset: const Offset(0, 2), blurRadius: 6),
        ];

  List<BoxShadow> get elevation3 => shadow.a == 0
      ? const []
      : [BoxShadow(color: shadow.withValues(alpha: 0.13), offset: const Offset(0, 18), blurRadius: 44)];

  static const light = SteepleColors(
    background: SteepleTokens.paperLight,
    surface: SteepleTokens.paperDeepLight,
    surfaceRaised: SteepleTokens.cardLight,
    textPrimary: SteepleTokens.inkLight,
    textSecondary: SteepleTokens.inkSoftLight,
    textTertiary: SteepleTokens.inkFaintLight,
    border: SteepleTokens.lineLight,
    borderStrong: SteepleTokens.lineStrongLight,
    actionPrimary: SteepleTokens.terracottaStrong,
    actionPrimaryPressed: SteepleTokens.terracottaDeepLight,
    accent: SteepleTokens.terracotta,
    link: SteepleTokens.sageDeepLight,
    selectedFill: SteepleTokens.sage,
    selectedBg: SteepleTokens.sageTintLight,
    selectedFg: SteepleTokens.sageDeepLight,
    focus: Color(0x595B7553), // sage @ 35%
    overlay: Color(0x662A2620), // ink @ 40%
    shadow: SteepleTokens.inkLight,
    success: StatusColors(fg: SteepleTokens.successFgLight, bg: SteepleTokens.successBgLight),
    warning: StatusColors(fg: SteepleTokens.warningFgLight, bg: SteepleTokens.warningBgLight),
    info: StatusColors(fg: SteepleTokens.infoFgLight, bg: SteepleTokens.infoBgLight),
    danger: StatusColors(fg: SteepleTokens.dangerFgLight, bg: SteepleTokens.dangerBgLight),
    neutral: StatusColors(fg: SteepleTokens.neutralFgLight, bg: SteepleTokens.neutralBgLight),
  );

  static const dark = SteepleColors(
    background: SteepleTokens.paperDark,
    surface: SteepleTokens.paperDeepDark,
    surfaceRaised: SteepleTokens.cardDark,
    textPrimary: SteepleTokens.inkDark,
    textSecondary: SteepleTokens.inkSoftDark,
    textTertiary: SteepleTokens.inkFaintDark,
    border: SteepleTokens.lineDark,
    borderStrong: SteepleTokens.lineStrongDark,
    actionPrimary: SteepleTokens.terracottaStrong,
    actionPrimaryPressed: SteepleTokens.actionPrimaryPressedDark,
    accent: SteepleTokens.terracotta,
    link: SteepleTokens.sageDeepDark,
    selectedFill: SteepleTokens.sage,
    selectedBg: SteepleTokens.sageTintDark,
    selectedFg: SteepleTokens.sageDeepDark,
    focus: Color(0x595B7553),
    overlay: Color(0x8C000000), // black @ 55%
    shadow: Color(0x00000000), // shadows barely read in dark — none (§5)
    success: StatusColors(fg: SteepleTokens.successFgDark, bg: SteepleTokens.successBgDark),
    warning: StatusColors(fg: SteepleTokens.warningFgDark, bg: SteepleTokens.warningBgDark),
    info: StatusColors(fg: SteepleTokens.infoFgDark, bg: SteepleTokens.infoBgDark),
    danger: StatusColors(fg: SteepleTokens.dangerFgDark, bg: SteepleTokens.dangerBgDark),
    neutral: StatusColors(fg: SteepleTokens.neutralFgDark, bg: SteepleTokens.neutralBgDark),
  );

  @override
  SteepleColors copyWith() => this;

  @override
  SteepleColors lerp(SteepleColors? other, double t) {
    if (other is! SteepleColors) return this;
    Color c(Color a, Color b) => Color.lerp(a, b, t)!;
    return SteepleColors(
      background: c(background, other.background),
      surface: c(surface, other.surface),
      surfaceRaised: c(surfaceRaised, other.surfaceRaised),
      textPrimary: c(textPrimary, other.textPrimary),
      textSecondary: c(textSecondary, other.textSecondary),
      textTertiary: c(textTertiary, other.textTertiary),
      border: c(border, other.border),
      borderStrong: c(borderStrong, other.borderStrong),
      actionPrimary: c(actionPrimary, other.actionPrimary),
      actionPrimaryPressed: c(actionPrimaryPressed, other.actionPrimaryPressed),
      accent: c(accent, other.accent),
      link: c(link, other.link),
      selectedFill: c(selectedFill, other.selectedFill),
      selectedBg: c(selectedBg, other.selectedBg),
      selectedFg: c(selectedFg, other.selectedFg),
      focus: c(focus, other.focus),
      overlay: c(overlay, other.overlay),
      shadow: c(shadow, other.shadow),
      success: success.lerpTo(other.success, t),
      warning: warning.lerpTo(other.warning, t),
      info: info.lerpTo(other.info, t),
      danger: danger.lerpTo(other.danger, t),
      neutral: neutral.lerpTo(other.neutral, t),
    );
  }
}

/// `context.steepleColors.surfaceRaised` — the one way components read color.
extension SteepleColorsContext on BuildContext {
  SteepleColors get steepleColors => Theme.of(this).extension<SteepleColors>()!;
}
