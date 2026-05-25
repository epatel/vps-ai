# Two-Tier CLAUDE.md Pattern

## Problem

Claude Code auto-loads every `CLAUDE.md` it finds in the directory hierarchy. A detailed CLAUDE.md burns context tokens on every turn — even when the agent only needs a quick orientation. As features grow, this waste compounds.

## Solution

Split each CLAUDE.md into two tiers:

**`CLAUDE.md`** (always loaded) — slim overview, enough for the agent to orient and decide if it needs more. Should stay under ~50 lines.

Contains:
- One-line purpose
- Node/component list (names only, no details)
- Key constraints and gotchas (the things that cause mistakes)
- `@CLAUDE_full.md` reference for details

**`CLAUDE_full.md`** (loaded on demand) — the full contract. Only read when the agent is actually working on this feature.

Contains:
- Full node documentation (expects, produces, hook guidance)
- Context keys table with types and ownership
- Existing hooks from other features
- Code examples and constraints
- Everything that was in the original single CLAUDE.md

## Example

```
features/place_order/
  CLAUDE.md            ← ~30 lines, auto-loaded
  CLAUDE_full.md       ← ~60 lines, read when needed
  place_order.dart
```

### CLAUDE.md (always loaded)

```markdown
# Feature: place-order

Order processing pipeline: validate_cart → calculate_totals → charge_payment → confirm_order

Key constraints:
- Do NOT set `ctx['total']` directly — add to `ctx['discounts']` instead
- inventory hooks into validate_cart.before (can abort for out-of-stock)

For full node docs, context keys, and code examples see @CLAUDE_full.md
```

### CLAUDE_full.md (on demand)

Contains the full node documentation, context keys table, existing hooks list, and code examples.

## When to split

- **Single CLAUDE.md** — full contract fits in ≤40 lines. Typically features with ≤2 nodes or simple contracts. The file IS the full documentation; no `@CLAUDE_full.md` reference needed.
- **Split** — contract exceeds ~40 lines, or feature has 3+ nodes with detailed hook guidance. The slim CLAUDE.md stays under ~15 lines: purpose + node list + key constraints + reference.

The threshold is about agent cost: a 40-line file loaded every turn is ~2000 lines across a 50-turn session — acceptable. Beyond that, the savings from splitting justify the extra file.

## Token savings

A 60-line CLAUDE.md loaded on every turn across a 50-turn conversation costs ~3000 lines of context. Split into a 20-line overview + 40-line detail file, the overview costs ~1000 lines. The detail file is loaded maybe 3-5 times → ~120-200 lines. Total: ~1200 lines vs ~3000 lines — roughly 60% savings on that file's context cost.

## Relationship to cards

If the project uses a card system (`cards/` directory with index), the two-tier CLAUDE.md handles all per-feature documentation. Do not create per-feature cards that duplicate CLAUDE.md/CLAUDE_full.md content.

CLAUDE_full.md (or the single CLAUDE.md for small features) should include content that might otherwise go in a domain card:
- **Public surface** — entry-point function/class
- **Owns / Does not own** — explicit boundary statements
- **All hooks** — static and dynamic, inbound ("hooked by") and outbound ("hooks into")

Cards are reserved for cross-cutting concerns: architecture, shared patterns, decision rationale.
