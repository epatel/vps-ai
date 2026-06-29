# CSS adapter

Emit `tokens.css` from `design-tokens.json` as CSS custom properties. Goal: components reference semantic variables only; switching theme overrides just the semantic block.

## Structure

Emit two tiers so dark mode is a small diff:

1. **Primitives** under `:root` — every primitive as `--{group}-{step}`.
2. **Semantic** under `:root` (light, the default) — each as `--color-{key}` referencing a primitive var with `var()`. Override the same names under a dark selector.

```css
:root {
  /* primitives */
  --color-neutral-0: #ffffff;
  --color-neutral-900: #0f172a;
  --color-neutral-950: #020617;
  --color-accent-500: #3b82f6;
  --color-accent-600: #2563eb;
  --space-4: 16px;
  --radius-md: 8px;
  --font-size-base: 16px;
  --font-weight-semibold: 600;

  /* semantic — light (default) */
  --color-bg: var(--color-neutral-0);
  --color-surface: var(--color-neutral-0);
  --color-text-primary: var(--color-neutral-900);
  --color-border: var(--color-neutral-200);
  --color-accent: var(--color-accent-600);
  --color-on-accent: var(--color-neutral-0);
}

/* explicit dark */
:root[data-theme="dark"] {
  --color-bg: var(--color-neutral-950);
  --color-surface: var(--color-neutral-900);
  --color-text-primary: var(--color-neutral-50);
  --color-border: var(--color-neutral-800);
  --color-accent: var(--color-accent-500);
  --color-on-accent: var(--color-neutral-950);
}

/* auto: follow OS only when no explicit choice is set */
@media (prefers-color-scheme: dark) {
  :root:not([data-theme]) {
    --color-bg: var(--color-neutral-950);
    /* …same overrides as [data-theme="dark"] */
  }
}
```

## Rules

- **Naming**: `color.text-primary` → `--color-text-primary`; `space.4` → `--space-4`; `radius.md` → `--radius-md`; `font.size.base` → `--font-size-base`. Mechanical, no abbreviation.
- **Only semantic vars are overridden** in the dark/auto blocks. Primitives stay fixed. This keeps the dark block to the handful of names that actually flip.
- **Theme switching** is a `data-theme` attribute on `<html>` (`data-theme="dark"` | `"light"` | absent = follow OS). Toggle in JS by setting/removing the attribute; persist the choice however the app already persists prefs.
- **Adding a theme**: emit another `:root[data-theme="x"]` block overriding the semantic names. No other change.
- **Shadows**: emit as `--shadow-sm/md/lg`. If the dark theme softens elevation, override those vars in the dark block too.
- Dimensions carry units (`16px`); weights/line-heights are unitless numbers.

Keep the auto block's overrides identical to the explicit dark block — generate both from the same `semantic.dark` map to avoid drift.
