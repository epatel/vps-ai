# Two-Tier CLAUDE.md Pattern

## Problem

Claude Code loads `CLAUDE.md` files automatically: the ones in the working directory and its ancestors at session start, and the ones in subdirectories (such as `features/<name>/CLAUDE.md`) the first time the agent reads a file in that subtree. Once loaded, a file stays in context for the rest of the session. A session that touches five features carries all five full contracts, even when it only needed one of them in detail. As features grow, this waste compounds.

## Solution

Split each feature CLAUDE.md into two tiers:

**`CLAUDE.md`** (auto-loaded) — slim overview, enough for the agent to orient and decide if it needs more. Stays under ~15 lines.

Contains:
- One-line purpose
- Node/component list (names only, no details)
- Key constraints and gotchas (the things that cause mistakes)
- A plain-path pointer to `CLAUDE_full.md` saying *when* to read it

**`CLAUDE_full.md`** (read on demand) — the full contract. Only read when the agent is actually changing this feature.

Contains:
- Full node documentation (expects, produces, hook guidance)
- Context keys table with types and ownership
- Existing hooks from other features
- Code examples and constraints
- Everything that was in the original single CLAUDE.md

**Do not use `@CLAUDE_full.md`.** An `@path` reference inside a CLAUDE.md is an import: Claude Code expands it the moment the CLAUDE.md loads, so the "on demand" file is loaded every time and the split saves nothing. Name the file as plain text or a markdown link, and the agent reads it with its file tools when the pointer's condition applies.

## Example

```
features/place_order/
  CLAUDE.md            ← ~10 lines, auto-loaded
  CLAUDE_full.md       ← ~60 lines, read when needed
  place_order.dart
```

### CLAUDE.md (auto-loaded)

```markdown
# Feature: place-order

Order processing pipeline: validate_cart → calculate_totals → charge_payment → confirm_order

Key constraints:
- Do NOT set `ctx['total']` directly — add to `ctx['discounts']` instead
- inventory hooks into validate_cart.before (can abort for out-of-stock)

Before adding a hook or changing a node, read `CLAUDE_full.md` in this directory
(node docs, context keys, code examples).
```

### CLAUDE_full.md (on demand)

Contains the full node documentation, context keys table, existing hooks list, and code examples.

## When to split

- **Single CLAUDE.md** — full contract fits in ≤40 lines. Typically features with ≤2 nodes or simple contracts. The file IS the full documentation; no `CLAUDE_full.md` needed.
- **Split** — contract exceeds ~40 lines, or feature has 3+ nodes with detailed hook guidance. The slim CLAUDE.md: purpose + node list + key constraints + pointer.

## Token savings

The saving comes from sessions that pass through a feature without changing it — reading a file to trace a call, or editing a neighbouring feature. Those sessions load the feature's CLAUDE.md but have no need for its full contract.

Example: a 60-line contract, in a project with 8 features where a typical session touches 4 and changes 1. Unsplit, the session carries 4 × 60 = 240 lines. Split into 10 + 50, it carries 4 × 10 + 1 × 50 = 90 lines — under 40% of the original, and the gap widens as features and contracts grow. A session that only ever works on one feature saves little; that is the case where a single file is fine.

## Relationship to cards

If the project uses a card system (`cards/` directory with index), the two-tier CLAUDE.md handles all per-feature documentation. Do not create per-feature cards that duplicate CLAUDE.md/CLAUDE_full.md content.

CLAUDE_full.md (or the single CLAUDE.md for small features) should include content that might otherwise go in a domain card:
- **Public surface** — entry-point function/class
- **Owns / Does not own** — explicit boundary statements
- **All hooks** — static and dynamic, inbound ("hooked by") and outbound ("hooks into")

Cards are reserved for cross-cutting concerns: architecture, shared patterns, decision rationale.
