# Card format

The `design-system` card follows the project's context-cards convention. The essentials needed to produce a compliant card:

## Shape

```markdown
# <name>

<one-line what-this-is>

<body>
```

No frontmatter. The card's **trigger lives in the index entry** in `CLAUDE.md`, not in the card — duplicating it adds noise.

## Rules

- **Self-contained.** A card must read correctly opened cold, with no other card loaded. No "see also card X" links. If two cards genuinely share content, hoist it into a third and point the index at all three — never chain them.
- **Trigger phrasing** (index entry, after the em-dash): describe the *situation*, not the topic. "anything touching color, spacing, typography, theming" beats "design tokens module".
- **Diagrams** use fenced ```mermaid blocks, not ASCII — mermaid renders inline.
- **Size cap ~150 lines.** Past that, split by sub-trigger (`design-system-color`, `design-system-type`) rather than letting one card become a wiki article.
- **Index entry format**: `- [name](cards/name.md) — trigger`.

## Where design-system fits

It's a shared-pattern card: a system-wide concern used by every feature, with no natural home in a single feature directory. Place its index entry under the architecture/shared section, near the top. It is effectively a singleton — one design-system card (or its split children), not one per feature.

If a feature has a co-located `CLAUDE.md`, that file still owns the feature's own contract; it should *reference the token roles by name* (e.g. "uses `color.accent`"), not redefine them. The design-system card stays the single source for what the roles are.

## What the card body must cover

So a future session can work without opening the JSON:

1. The three-layer model in two sentences (primitive → semantic → component).
2. File locations: where the JSON, CSS, and/or Dart live, and that the JSON is canonical.
3. The semantic key set and the light/dark mapping (a compact table).
4. How to consume in each target stack present (the `var(--…)` and `Theme.of(context).extension` access patterns).
5. How to add a theme (new semantic map; primitives don't move).

Keep each inline and terse. The card documents the contract; it is not a tutorial.
