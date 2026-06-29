# Flutter adapter

Emit `app_tokens.dart` from `design-tokens.json`. Flutter's `ThemeData`/`ColorScheme` only covers a subset of semantic roles, so the idiomatic approach is: map what fits into `ColorScheme`, and carry the full semantic set (plus spacing/radii/type) in `ThemeExtension`s. Resolve all aliases to literal values when emitting — Dart has no `{...}` references.

## What goes where

- **`ColorScheme`** — the roles Material widgets read automatically: `surface`, `onSurface`, `primary`, `onPrimary`, `error`, `onError`, `outline`. Map semantic tokens onto these so stock widgets theme correctly.
- **`ThemeExtension` (`AppColors`)** — the complete semantic color set, including roles `ColorScheme` lacks (`surfaceRaised`, `textSecondary`, `textMuted`, `borderStrong`, `accentHover`, `focusRing`, status colors). This is what app code reads.
- **`ThemeExtension`s for non-color tokens** — `AppSpacing`, `AppRadii`, `AppTypography`. These are theme-independent, so a single instance is reused by both light and dark themes.

## Pattern

```dart
import 'package:flutter/material.dart';

// hex helper for emitted literals
Color _c(int v) => Color(0xFF000000 | v);

@immutable
class AppColors extends ThemeExtension<AppColors> {
  const AppColors({
    required this.bg,
    required this.surface,
    required this.surfaceRaised,
    required this.textPrimary,
    required this.textSecondary,
    required this.textMuted,
    required this.border,
    required this.borderStrong,
    required this.accent,
    required this.accentHover,
    required this.onAccent,
    required this.focusRing,
    required this.success,
    required this.warning,
    required this.danger,
    required this.info,
    required this.onStatus,
  });

  final Color bg, surface, surfaceRaised;
  final Color textPrimary, textSecondary, textMuted;
  final Color border, borderStrong;
  final Color accent, accentHover, onAccent, focusRing;
  final Color success, warning, danger, info, onStatus;

  // Resolve every field from the JSON's semantic.light / semantic.dark maps —
  // these are the canonical values, not a place to hand-author colors.
  static const light = AppColors(
    bg: Color(0xFFFFFFFF),            // {semantic.light.bg}      → neutral.0
    surface: Color(0xFFFFFFFF),       // {semantic.light.surface} → neutral.0
    textPrimary: Color(0xFF0F172A),   // → neutral.900
    accent: Color(0xFF2563EB),        // → accent.600
    onAccent: Color(0xFFFFFFFF),      // → neutral.0
    // …remaining fields resolved the same way from semantic.light…
  );

  static const dark = AppColors(
    bg: Color(0xFF020617),            // → neutral.950
    surface: Color(0xFF0F172A),       // → neutral.900
    textPrimary: Color(0xFFF8FAFC),   // → neutral.50
    accent: Color(0xFF3B82F6),        // → accent.500 (one step lighter on dark)
    onAccent: Color(0xFF020617),      // → neutral.950
    // …remaining fields resolved the same way from semantic.dark…
  );

  @override
  AppColors copyWith({Color? bg, Color? surface /* …all fields… */}) =>
      AppColors(
        bg: bg ?? this.bg,
        surface: surface ?? this.surface,
        // …
      );

  @override
  AppColors lerp(ThemeExtension<AppColors>? other, double t) {
    if (other is! AppColors) return this;
    return AppColors(
      bg: Color.lerp(bg, other.bg, t)!,
      surface: Color.lerp(surface, other.surface, t)!,
      // …lerp every field…
    );
  }
}

@immutable
class AppSpacing extends ThemeExtension<AppSpacing> {
  const AppSpacing();
  final double s1 = 4, s2 = 8, s3 = 12, s4 = 16, s5 = 20, s6 = 24,
      s8 = 32, s10 = 40, s12 = 48, s16 = 64, s24 = 96;
  // (theme-independent; implement copyWith/lerp returning the same const)
}

@immutable
class AppRadii extends ThemeExtension<AppRadii> {
  const AppRadii();
  final double sm = 4, md = 8, lg = 12, xl = 16, full = 9999;
}
```

Build the themes:

```dart
ThemeData _theme(AppColors c, Brightness b) => ThemeData(
      brightness: b,
      colorScheme: ColorScheme(
        brightness: b,
        surface: c.surface,
        onSurface: c.textPrimary,
        primary: c.accent,
        onPrimary: c.onAccent,
        secondary: c.accent,
        onSecondary: c.onAccent,
        error: c.danger,
        onError: c.onStatus,
        outline: c.border,
      ),
      extensions: [c, const AppSpacing(), const AppRadii()],
    );

final lightTheme = _theme(AppColors.light, Brightness.light);
final darkTheme = _theme(AppColors.dark, Brightness.dark);

// MaterialApp(theme: lightTheme, darkTheme: darkTheme, themeMode: ThemeMode.system)
```

Consume in widgets:

```dart
final colors = Theme.of(context).extension<AppColors>()!;
final space = Theme.of(context).extension<AppSpacing>()!;
Container(color: colors.surface, padding: EdgeInsets.all(space.s4));
```

## Rules

- **Emit literal `Color(0xFFRRGGBB)`** — resolve every alias at generation time. Add the source semantic name as a trailing `//` comment if it aids review.
- **Naming**: `text-primary` → `textPrimary` (camelCase). Spacing/radius steps → `s4`, `md`.
- **Generate `copyWith` and `lerp` for every field** of each extension; missing fields silently drop on theme interpolation. For theme-independent extensions, `lerp` can return `this`.
- **Adding a theme**: add another `static const AppColors x = …`, build one more `ThemeData`, and wire it to whatever drives `themeMode`. Spacing/radii instances are shared unchanged.
- Use `ThemeMode.system` for OS-follow; switch to `.light`/`.dark` for an explicit user choice.
