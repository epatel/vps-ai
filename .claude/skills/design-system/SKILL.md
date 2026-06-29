---
name: design-system
description: Set up or extend a project's design-system definitions — color, spacing, typography/styles, and fonts — with light and dark themes and a theming structure ready for more variants. Emits a framework-agnostic token source plus CSS and/or Flutter adapters, and writes a self-contained context card documenting them. Use this whenever the user wants to scaffold design tokens, a theme, a color/spacing/type scale, dark mode, or a "design system" — even if they only mention one piece like "set up my colors" or "add dark mode tokens".
---

# Design System Setup

Establish a layered set of design tokens (color, spacing, typography, fonts, radii, shadows) with light + dark themes and room for more, then emit them as real files and document them as a context card.

## What this produces

1. `design-tokens.json` — the framework-agnostic source of truth (DTCG-style: `$value` / `$type`, aliases via `{group.token}`). Everything else is generated from this.
2. Adapter files for the target stack:
   - Web → `tokens.css` (CSS custom properties + theme switch)
   - Flutter → `app_tokens.dart` (`ColorScheme` + `ThemeExtension`s)
3. A `design-system` card under `cards/` and an index entry appended to `CLAUDE.md`.

The JSON is canonical; the adapters are derived. Re-running the skill regenerates the adapters from the JSON, so edits go in the JSON.

## Token model

Three layers: **primitives** (raw theme-independent values, never consumed by components) → **semantic** (per-theme role aliases like `color.bg`, `color.accent` — the only layer components read and the only one that changes per theme) → **component** (optional, deferred). Theming swaps the semantic layer; primitives don't move.

Read `references/token-architecture.md` for the full model, naming rules, and the rationale behind the default scales before building.

## Procedure

### Step 0 — Orient

- Confirm the target stack (web, Flutter, or both). If unstated, infer from the repo (`pubspec.yaml` → Flutter; `package.json` / CSS → web) and state the assumption.
- Locate output paths. Default: `design-tokens.json` at repo root or in an existing `tokens/`/`design/` dir; CSS next to the app's global styles; Dart under `lib/theme/`. Ask only if there's no obvious home.

### Step 1 — Inputs

Gather what the brand actually fixes, and default the rest from `assets/design-tokens.template.json`:

- Accent/brand color (a single seed hex is enough — derive a ramp if no full ramp is given).
- Heading + body font families (else a system stack).
- Anything explicitly specified (corner style, base spacing unit, density).

Don't block on a full brand spec. The template is a working neutral starting point; ship that and let the user adjust the JSON.

### Step 2 — Build the layers

Start from `assets/design-tokens.template.json` and adapt:

- Replace the accent ramp with the brand's; regenerate `color.accent.*` if only a seed was given.
- Set `font.family.*`.
- Keep both `semantic.light` and `semantic.dark` complete — every key present in one must exist in the other, or themes break on switch. Verify parity before writing.
- Adjust spacing/radius/type scales only if the user asked; the defaults are deliberately conventional.

### Step 3 — Emit adapters

Write `design-tokens.json` first (resolved, valid JSON). Then per target:

- **Web** — read `references/css.md`, emit `tokens.css`.
- **Flutter** — read `references/flutter.md`, emit `app_tokens.dart`.

Resolve aliases when emitting (the adapter files hold literal values, not `{...}` references). Keep names mechanical: `color.text-primary` → `--color-text-primary` / `AppColors.textPrimary`.

### Step 4 — Write the card

Read `references/card-format.md`, then write `cards/design-system.md` from `assets/design-system-card.template.md`. The card must be self-contained: the token layers, the light/dark semantic map, file locations, how to consume in each stack, and how to add a theme — all inline, no "see also" links. If it would exceed ~150 lines, split by sub-trigger (`design-system-color`, `design-system-type`) rather than letting it sprawl.

### Step 5 — Index entry

Append to `CLAUDE.md` under a shared-patterns/architecture section:

```
- [design-system](cards/design-system.md) — anything touching color, spacing, typography, theming, or component styling
```

Phrase the trigger as the situation, not the topic.

### Step 6 — Verify

- `design-tokens.json` parses; every alias resolves to a real primitive.
- `semantic.light` and `semantic.dark` have identical key sets.
- Each emitted adapter compiles/lints in its stack.
- The card reads cold without any other card.

## Conventions

- Lowercase, hyphenated semantic names (`text-primary`, `surface-raised`); numeric primitive steps (`neutral.500`, `space.4`).
- Components reference **semantic** tokens only. A primitive in component code is a smell — add a semantic token instead.
- One source of truth (`design-tokens.json`). Hand-editing an adapter is throwaway; it's overwritten on regen.
