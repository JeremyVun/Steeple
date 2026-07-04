import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'steeple_colors.dart';
import 'tokens.dart';
import 'typography.dart';

export 'steeple_colors.dart';
export 'tokens.dart';
export 'typography.dart';

/// Assembles the light/dark [ThemeData] from the token bindings so component
/// defaults are on-system without per-widget styling (DESIGN_SYSTEM §11).
///
/// Brand rules encoded here rather than in widgets: pill buttons at 48px with
/// one primary per screen; app bars blend with paper until content scrolls
/// under; sheets get `radiusXl` top corners and the `overlay` scrim; snackbars
/// are ink-on-paper pills; inputs are `surfaceRaised` with a sage focus ring.
abstract final class SteepleTheme {
  static ThemeData light() => _build(SteepleColors.light, Brightness.light);
  static ThemeData dark() => _build(SteepleColors.dark, Brightness.dark);

  static ThemeData _build(SteepleColors c, Brightness brightness) {
    final textTheme = SteepleTypography.textTheme(c.textPrimary);
    final isDark = brightness == Brightness.dark;

    final colorScheme = ColorScheme(
      brightness: brightness,
      primary: c.actionPrimary,
      onPrimary: Colors.white,
      secondary: c.selectedFill,
      onSecondary: Colors.white,
      error: c.danger.fg,
      onError: c.danger.bg,
      surface: c.background,
      onSurface: c.textPrimary,
      surfaceContainerHighest: c.surface,
      surfaceContainerHigh: c.surfaceRaised,
      outline: c.borderStrong,
      outlineVariant: c.border,
      shadow: c.shadow,
      scrim: c.overlay,
    );

    final pill = RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(SteepleTokens.radiusPill),
    );

    return ThemeData(
      useMaterial3: true,
      brightness: brightness,
      colorScheme: colorScheme,
      textTheme: textTheme,
      scaffoldBackgroundColor: c.background,
      splashFactory: InkSparkle.splashFactory,
      dividerColor: c.border,
      extensions: [c],

      appBarTheme: AppBarTheme(
        backgroundColor: c.background,
        foregroundColor: c.textPrimary,
        elevation: 0,
        scrolledUnderElevation: 1,
        shadowColor: c.shadow.withValues(alpha: 0.06),
        surfaceTintColor: Colors.transparent,
        centerTitle: false,
        titleTextStyle: SteepleTypography.titleLg.copyWith(color: c.textPrimary),
        systemOverlayStyle: isDark ? SystemUiOverlayStyle.light : SystemUiOverlayStyle.dark,
      ),

      // §8.8 bottom tab bar: active = sage-deep, inactive = textTertiary,
      // surfaceRaised bg. The hairline top border lives in the shell scaffold.
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: c.surfaceRaised,
        surfaceTintColor: Colors.transparent,
        indicatorColor: c.selectedBg,
        height: 64,
        labelTextStyle: WidgetStateProperty.resolveWith(
          (states) => SteepleTypography.caption.copyWith(
            fontWeight: FontWeight.w600,
            color: states.contains(WidgetState.selected) ? c.selectedFg : c.textTertiary,
          ),
        ),
        iconTheme: WidgetStateProperty.resolveWith(
          (states) => IconThemeData(
            size: 24,
            color: states.contains(WidgetState.selected) ? c.selectedFg : c.textTertiary,
          ),
        ),
      ),

      // §8.1 Primary — the one main action per screen.
      filledButtonTheme: FilledButtonThemeData(
        style: ButtonStyle(
          minimumSize: const WidgetStatePropertyAll(
            Size(SteepleTokens.touchTargetMin, SteepleTokens.buttonHeight),
          ),
          padding: const WidgetStatePropertyAll(
            EdgeInsets.symmetric(horizontal: SteepleTokens.space6),
          ),
          shape: WidgetStatePropertyAll(pill),
          textStyle: const WidgetStatePropertyAll(SteepleTypography.button),
          backgroundColor: WidgetStateProperty.resolveWith((states) {
            if (states.contains(WidgetState.disabled)) return c.borderStrong;
            if (states.contains(WidgetState.pressed)) return c.actionPrimaryPressed;
            return c.actionPrimary;
          }),
          foregroundColor: WidgetStateProperty.resolveWith(
            (states) => states.contains(WidgetState.disabled) ? c.textTertiary : Colors.white,
          ),
        ),
      ),

      // §8.1 Secondary — coequal/dismissive actions.
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: ButtonStyle(
          minimumSize: const WidgetStatePropertyAll(
            Size(SteepleTokens.touchTargetMin, SteepleTokens.buttonHeight),
          ),
          padding: const WidgetStatePropertyAll(
            EdgeInsets.symmetric(horizontal: SteepleTokens.space6),
          ),
          shape: WidgetStatePropertyAll(pill),
          textStyle: const WidgetStatePropertyAll(SteepleTypography.button),
          side: WidgetStateProperty.resolveWith(
            (states) => BorderSide(
              color: states.contains(WidgetState.disabled) ? c.border : c.borderStrong,
            ),
          ),
          foregroundColor: WidgetStateProperty.resolveWith(
            (states) => states.contains(WidgetState.disabled) ? c.textTertiary : c.link,
          ),
        ),
      ),

      // §8.1 Text — inline, low-emphasis.
      textButtonTheme: TextButtonThemeData(
        style: ButtonStyle(
          minimumSize: const WidgetStatePropertyAll(
            Size(SteepleTokens.touchTargetMin, SteepleTokens.touchTargetMin),
          ),
          shape: WidgetStatePropertyAll(pill),
          textStyle: const WidgetStatePropertyAll(SteepleTypography.button),
          foregroundColor: WidgetStateProperty.resolveWith(
            (states) => states.contains(WidgetState.disabled) ? c.textTertiary : c.link,
          ),
        ),
      ),

      // §8.9 Forms: surfaceRaised fill, borderStrong border, radiusSm, sage focus.
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: c.surfaceRaised,
        contentPadding: const EdgeInsets.all(SteepleTokens.space3),
        hintStyle: SteepleTypography.body.copyWith(color: c.textTertiary),
        helperStyle: SteepleTypography.caption.copyWith(color: c.textSecondary),
        errorStyle: SteepleTypography.caption.copyWith(color: c.danger.fg),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(SteepleTokens.radiusSm),
          borderSide: BorderSide(color: c.borderStrong),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(SteepleTokens.radiusSm),
          borderSide: BorderSide(color: c.selectedFill, width: 2),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(SteepleTokens.radiusSm),
          borderSide: BorderSide(color: c.danger.fg),
        ),
        focusedErrorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(SteepleTokens.radiusSm),
          borderSide: BorderSide(color: c.danger.fg, width: 2),
        ),
      ),

      // §8.8 bottom sheets: radiusXl top corners, overlay scrim.
      bottomSheetTheme: BottomSheetThemeData(
        backgroundColor: c.surfaceRaised,
        surfaceTintColor: Colors.transparent,
        modalBarrierColor: c.overlay,
        showDragHandle: true,
        dragHandleColor: c.borderStrong,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(SteepleTokens.radiusXl)),
        ),
      ),

      dialogTheme: DialogThemeData(
        backgroundColor: c.surfaceRaised,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(SteepleTokens.radiusMd)),
        titleTextStyle: SteepleTypography.titleLg.copyWith(color: c.textPrimary),
        contentTextStyle: SteepleTypography.body.copyWith(color: c.textSecondary),
      ),

      // §8.7 snackbar: ink bg (dark: surfaceRaised), paper text, pill, floating.
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        backgroundColor: isDark ? c.surfaceRaised : c.textPrimary,
        contentTextStyle: SteepleTypography.bodySm.copyWith(
          color: isDark ? c.textPrimary : c.background,
        ),
        shape: pill,
        elevation: 2,
      ),

      cardTheme: CardThemeData(
        color: c.surfaceRaised,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(SteepleTokens.radiusMd),
          side: BorderSide(color: c.border),
        ),
      ),

      dividerTheme: DividerThemeData(color: c.border, thickness: 1, space: 1),

      progressIndicatorTheme: ProgressIndicatorThemeData(
        color: c.selectedFill,
        linearTrackColor: c.surface,
      ),

      // Focus ring (§2.2 `focus`): keyboard/switch-access visibility.
      focusColor: c.focus,
    );
  }
}
