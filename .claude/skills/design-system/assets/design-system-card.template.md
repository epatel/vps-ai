# design-system

The project's design tokens: color, spacing, typography, radii, shadows, with light + dark themes. `design-tokens.json` is the source of truth; the adapters below are generated from it.

## Model

Three layers. **Primitives** are raw values (`neutral.500`, `space.4`) with no role. **Semantic** tokens name roles (`bg`, `text-primary`, `accent`) and alias primitives; this is the only layer that changes per theme and the only layer components read. **Component** tokens are added only when a widget must deviate from a semantic role — none by default.

## Files

| File | Role |
|---|---|
| `<path>/design-tokens.json` | canonical source (DTCG) |
| `<path>/tokens.css` | CSS custom properties (generated) |
| `<path>/app_tokens.dart` | ColorScheme + ThemeExtensions (generated) |

Edit the JSON, then regenerate the adapters. Hand edits to adapters are overwritten.

## Semantic colors

Every key exists in both themes; only the target shifts.

| Role | Light | Dark |
|---|---|---|
| `bg` | neutral.0 | neutral.950 |
| `surface` | neutral.0 | neutral.900 |
| `surface-raised` | neutral.50 | neutral.800 |
| `surface-sunken` | neutral.100 | neutral.950 |
| `text-primary` | neutral.900 | neutral.50 |
| `text-secondary` | neutral.600 | neutral.300 |
| `text-muted` | neutral.400 | neutral.500 |
| `border` | neutral.200 | neutral.800 |
| `border-strong` | neutral.300 | neutral.700 |
| `accent` | accent.600 | accent.500 |
| `accent-hover` | accent.700 | accent.400 |
| `on-accent` | neutral.0 | neutral.950 |
| `focus-ring` | accent.500 | accent.400 |

Status (`success`/`warning`/`danger`/`info`) share primitives across themes; `on-status` is neutral.0.

## Scales

- **space**: 0,4,8,12,16,20,24,32,40,48,64,96 px (`space.0…24`, 4px base)
- **radius**: none 0, sm 4, md 8, lg 12, xl 16, full 9999
- **font.size**: xs 12 … 4xl 36; **weight**: regular/medium/semibold/bold; **line-height**: tight 1.2 … relaxed 1.7

## Consuming

<!-- keep only the stacks present in this project -->

**CSS** — reference semantic vars; never primitives directly.
```css
.card { background: var(--color-surface); color: var(--color-text-primary);
        padding: var(--space-4); border-radius: var(--radius-md); }
```
Theme: set `data-theme="dark"` (or `"light"`) on `<html>`; absent = follow OS.

**Flutter** — read tokens off the theme extension.
```dart
final c = Theme.of(context).extension<AppColors>()!;
final s = Theme.of(context).extension<AppSpacing>()!;
Container(color: c.surface, padding: EdgeInsets.all(s.s4));
```
Theme: `MaterialApp(theme: lightTheme, darkTheme: darkTheme, themeMode: …)`.

## Adding a theme

Add a sibling under `semantic` (e.g. `semantic.high-contrast`) with the same key set, re-aliased, and regenerate. Adapters gain one more map; component code doesn't change. If adding a theme forces component edits, a primitive leaked through the semantic layer — fix that instead.
