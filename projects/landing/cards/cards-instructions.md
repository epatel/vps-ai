# Context Cards — Setup

A system for compressing project knowledge into small, lazy-loaded reference cards instead of stuffing everything into one giant `CLAUDE.md` or relying on grep-and-pray.

Reference this file from a project's `CLAUDE.md` to bootstrap a card index for that project.

## The model

- **Overview** — 2-3 sentences in `CLAUDE.md` above the index. Always loaded. What the product does, who it's for, the one or two stack facts that change every answer ("Rails 7 + Postgres", "Flutter + Riverpod"). Too small to lazy-load and too universal to make conditional, so it isn't a card.
- **Index** — always loaded. One line per card: `- [name](cards/name.md) — trigger`.
- **Card** — loaded on demand when its trigger matches the situation.

Card shape:

```markdown
# <name>

<one-line what-this-is>

<body>
```

No frontmatter. The trigger lives in the **index entry** (where the LLM actually reads it to decide whether to open the card); duplicating it inside the card adds noise without adding function. Add structured metadata only when tooling exists that consumes it.

Use mermaid (```` ```mermaid ```` fenced blocks) for diagrams — flows, component connections, state transitions — instead of ASCII art. Mermaid renders inline; ASCII does not.

**The one rule: cards are self-contained.** No "see also card X" links. If two cards share content, hoist it into a third card and let the index point to all three. Transitive loading recreates the wiki problem this is meant to avoid.

## Three card types

| Type | Captures | Example |
|---|---|---|
| **domain** | A bounded slice of the system | `auth`, `billing`, `search-index` |
| **feature** | A specific capability or flow within a domain | `magic-link-login`, `subscription-renewal` |
| **decision** | A choice plus rationale (mini-ADR) | `postgres-over-mongo`, `monorepo-layout` |

Cards live under `cards/` flat — type is conveyed by the index section, not the path.

## Coexistence with per-feature CLAUDE.md

When features have their own directory with a co-located `CLAUDE.md` (e.g., `lib/features/<name>/CLAUDE.md`), **do not create a separate domain or feature card** for that feature. The co-located CLAUDE.md is auto-discovered by Claude Code and should be the single source of truth for that feature's contract.

Cards are for content with no natural home directory:
- **Architecture** — system topology, data flow (spans all features)
- **Decisions** — rationale for choices (not owned by one feature)
- **Shared patterns** — hook-wiring semantics, engine API (used by all features)

**Rule of thumb:** If the content describes one feature's internal contract (nodes, context keys, hook guidance, boundary), it belongs in that feature's co-located CLAUDE.md. If it describes how multiple features interact or a system-wide concern, it belongs in a card.

## The architecture card

One additional, **singleton** card belongs at the top of the index: `architecture`. It captures how components connect, data flows end to end, and the deployment shape — content that doesn't fit any single domain because it spans them.

Trigger: cross-domain work, dataflow debugging, or onboarding.

This is the card most likely to drift into wiki-article territory because it's cross-cutting by nature. Hold the self-containment rule strictly: describe connections in flat prose ("auth issues a JWT that billing verifies"), never `see cards/auth.md`. If it grows past ~150 lines, split by sub-trigger (`architecture-dataflow`, `architecture-deploy`) rather than letting it become a hub.

## Procedure — populating cards from an existing project

### Step 0 — Orient

Before discovering individual domains, produce the always-loaded and cross-cutting context:

1. **Overview** — write 2-3 sentences directly into `CLAUDE.md` above where the index will go. What the product does, who uses it, key stack/runtime facts.
2. **Architecture card** — one card capturing components, connections, data flow, deployment shape. Content sources: top-level README, `docker-compose.yml` / `k8s/`, deployment configs, the dependency graph between top-level modules.

### Step 1 — Discover domains

- Walk top-level structure: `src/`, services, packages, modules.
- Group by **bounded context**, not by layer. `auth/` is a domain; `controllers/` is not.
- Target 5–15 domain cards. Too few and each becomes a mini-wiki; too many and the index bloats.

For each domain card, capture:
- **Purpose** — one sentence.
- **Public surface** — the entry points other domains call.
- **Key types and concepts** — the 3–7 names that recur throughout.
- **Owns / does not own** — explicit scope boundary.

### Step 2 — Discover features within domains

Look for: user-facing flows, named jobs, scheduled tasks, API endpoints with non-trivial logic.

A feature deserves a card when it has invariants, ordering constraints, or non-obvious failure modes. Skip CRUD that is "just save the thing."

For each feature card, capture:
- **Trigger** — the user action or event that starts it.
- **Steps** — the actual flow, 3–10 bullets.
- **Invariants** — what must remain true throughout.
- **Failure modes** — known ways it breaks.

### Step 3 — Distill decisions

Sources to mine:
- Existing `docs/adr/` or `docs/decisions/` directories.
- README sections titled "Why X" or "Architecture".
- Long commit messages explaining tradeoffs.
- Comments containing "because", "we chose", "instead of".
- PRs with substantial review discussion.

For each decision card, capture:
- **The choice** — one sentence.
- **Alternatives considered** — bullets.
- **Why this won** — the deciding constraints.
- **When to revisit** — the signal that would invalidate this decision.

### Step 4 — Build the index

Append to the project's `CLAUDE.md` (or create `CARDS.md` and import it):

```markdown
## About this project

<2-3 sentences: what it is, who it's for, key stack facts>

## Cards

### Architecture
- [architecture](cards/architecture.md) — cross-domain work, dataflow, onboarding

### Domains
- [auth](cards/auth.md) — anything touching login, sessions, identity
- [billing](cards/billing.md) — subscriptions, invoices, payment flows

### Features
- [magic-link-login](cards/magic-link-login.md) — passwordless email login flow
- [subscription-renewal](cards/subscription-renewal.md) — recurring charge + grace period

### Decisions
- [postgres-over-mongo](cards/postgres-over-mongo.md) — primary datastore choice
- [monorepo-layout](cards/monorepo-layout.md) — package boundaries and tooling
```

The trigger phrase after the em-dash is the **only** thing the LLM uses to decide whether to open the card. Phrase it as the situation, not the topic: "anything touching login" beats "auth module".

Add to `CLAUDE.md` to keep it and the cards up to date.

### Step 5 — Verify

- Every card is readable in isolation. Open each one cold; if it requires another card to make sense, fix it.
- Index entries name the **trigger**, not the topic.
- Total index stays under ~150 lines so it pays its always-loaded cost.
- No card references another card by name.

## Maintenance

- New non-obvious logic lands → new feature card.
- A PR debates an architectural choice → new decision card.
- A card goes stale → update or delete it. Do not append `DEPRECATED:` notes; git history is the audit log.
- A card grows past ~150 lines → split by sub-trigger or it has become a wiki article.

## How to use from a project

### Bootstrap (one-time)

In a session in the target project, prompt:

```
See https://ai.memention.net/cards
Build index cards and add index entries to CLAUDE.md
```

This loads the procedure, runs Steps 0–5 against the project, writes the cards under `cards/`, and appends the index to `CLAUDE.md`.

### Steady state

After bootstrap, the project's `CLAUDE.md` only needs the **index itself** — not a permanent `@`-import of this setup file. The setup file is build-time scaffolding; once cards exist, the index of markdown links is self-explanatory at runtime and the procedure is dead weight in context.

Re-import this setup file on demand when **extending** the system: adding cards for a new domain, retiring stale ones, or restructuring after a major refactor.
