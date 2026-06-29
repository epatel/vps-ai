---
name: focused-refactor
description: Solidify ONE bounded concept (an Order, a Cart, a Document, a Job, a Subscription …) by applying state-machines, adt-types, and clean-modules together as an ordered recipe. Use when a single entity simultaneously has flag-soup lifecycle (`isPaid`, `isShipped`, `isCancelled`), anemic data with logic scattered across callers, AND no clear module ownership — so fixing any one alone leaves the other two still leaking. Skip when only one of the three smells is present (route to the individual skill instead) or when the concept isn't actually bounded yet.
---

# Focused Refactor

When a domain concept is in real trouble, it usually has all three diseases at once: its **lifecycle is implicit** (booleans flipped from many places), its **invariants live outside the type** (every caller re-validates), and its **boundary is leaky** (fields read from everywhere, no single owner). Fixing one without the others gives you a clean state machine that's still mutated externally, or an encapsulated ADT that exposes 30 transitions because nobody decided which were legal.

This skill is the **recipe** for fixing all three together, in an order where each step's output feeds the next. It does not re-explain the disciplines — for depth on each, defer to the sub-skills (`state-machines`, `adt-types`, `clean-modules`). The contribution here is the sequencing.

## When to use

The trifecta on **one** concept:

- **Flag-soup lifecycle.** The entity carries 3+ correlated booleans / a stringly-typed `status`, transitions happen via direct field flips, and impossible combinations are reachable.
- **Anemic data with external logic.** Invariants are checked at call sites, not inside the type. Free functions taking the entity as their first argument and mutating it are the de-facto operations.
- **No clear module owner.** The entity's fields are read and written from many directories. Helpers about it live wherever someone needed them; there is no single public surface.

If only **one** of the three is present, this skill is overkill — route to the right individual skill:

- One smell only → go to `state-machines`, `adt-types`, or `clean-modules` directly.
- The "concept" isn't actually one concept (it's two tangled things, like an Order's payment lifecycle plus its shipping lifecycle) → split first, then run this skill on each piece.
- The concept is throwaway / prototype / not load-bearing → the abstraction tax exceeds the lifetime; leave it.

## The method

A **phase-0 gate**, then five phases in order. The order is load-bearing — see "Why this order" below. Phase 0 is non-negotiable: if it can't be completed, the refactor isn't safe to start yet.

### Phase 0 — Pin current behavior (the gate)

Before changing anything, write characterization tests at the **public seam** — the level callers observe today, not white-box assertions about internal fields. Tests written against `order.isPaid && order.shippedAt != null` will all need rewriting in phase 3 and give you false-positive failures during the refactor. Tests written against observable behavior — "after marking paid then shipped, the summary reads X"; "an unpaid order can be cancelled"; "a shipped order rejects refund" — survive the entire refactor and are the trustworthy oracle for "did I break anything."

Run the tests. Confirm a green baseline. This is the safety net every later phase relies on.

This phase is a **gate, not a step**. If you can't write characterization tests — because the behavior is too entangled, non-deterministic, or you can't tell what's load-bearing vs incidental — **the refactor is unsafe to start**. The right response isn't "skip the tests"; it's "decompose further first" or "invest in observability so the seams become visible." Then come back.

A note on existing tests: don't assume they cover you. They're often unit tests of the internals you're about to delete; audit before relying on them. If they bind to internals, they're not the safety net you need — write seam-level ones anyway.

### Phase 1 — Pick the one bounded concept

Name the entity. Write its purpose in one sentence. List its current locations:

- Where is the data defined? (record/class)
- Where are the booleans/status fields?
- Which call sites mutate it? (rough count)
- Which directories own logic *about* it?

If you can't pin it to one concept, stop — you're being asked to refactor two things tangled together, and the recipe will produce mush. Either split the concept first, or pick the smaller of the two and do it alone.

### Phase 2 — Lifecycle (`state-machines`)

Defer to the **`state-machines`** skill. The output is:

- Named states (no booleans).
- Events that drive transitions.
- A transition table where illegal moves are explicit rejections, not silent no-ops.

Stop here when you have the table. Do **not** encapsulate yet, do **not** move modules yet. The transition list is the spec for the next phase — it tells you exactly which operations the type needs to expose, and which invariants must hold per state.

### Phase 3 — Encapsulation (`adt-types`)

Defer to the **`adt-types`** skill. The state machine from phase 2 hands you:

- The **operations** of the ADT — one per legal transition, plus query operations callers genuinely need.
- The **invariants** — per-state requirements, derivable from the transition table.

Now hide the representation. The state field becomes private. Direct field access becomes operation calls. Constructors enforce per-state invariants; transition operations preserve them. The transition function from phase 2 lives **inside** the ADT — it is not a free function next to it.

After phase 3 the type is sound: no caller can construct an invalid instance or trigger an illegal transition. But the *imports* are still a mess — many files still reach into the old representation. That's phase 4.

### Phase 4 — Boundary (`clean-modules`)

Defer to the **`clean-modules`** skill. The ADT from phase 3 hands you:

- The **public surface** — exactly the ADT's operations, nothing else.
- The **internals to hide** — the state representation, helpers, the transition function.

Move the entity into its own module (or designate the existing one). Make the public surface the module's *only* export. Every other file imports from this surface or doesn't import at all. Add a lint rule that fails the build if anything else is imported from inside.

### Phase 5 — Verify the seams

Four checks:

1. **Phase 0 characterization tests are green.** No regression in observable behavior. If a test went red, either the refactor changed behavior (a real bug) or the test was actually white-box and your phase 0 wasn't strict enough — fix the test, not the production code, and re-establish the baseline.
2. **Illegal transitions are rejected through the public API.** For each empty cell in the phase-2 transition table, a *new* test attempts that transition via the ADT operations and confirms the rejection. Phase 0 captured "what works"; these capture "what must fail."
3. **Grep for old patterns.** No `entity.privateField`, no direct boolean flips, no free functions mutating the entity. The lint rule from phase 4 catches these in CI; the manual grep is for the local copy.
4. **Try a representation swap (mentally).** If you replaced the internal storage tomorrow (array → map, struct → record), how many call sites would change? The answer should be **zero outside the module**. If it's nonzero, a leak survived; find it.

When all four pass, the refactor is done. The combined test suite (phase-0 characterizations + phase-5 illegal-transition tests) is now a regression net for whoever touches this module next.

## Why this order

- **Lifecycle before encapsulation.** Without states and transitions, you don't know which operations the ADT should expose or which invariants matter per case. Encapsulating first is a guess at the API.
- **Encapsulation before module boundary.** The module's public surface *is* the ADT's operations. Drawing the module boundary before the ADT exists means guessing at the surface and then redrawing it.
- **Module boundary last.** Once the ADT is the type and the operations are the API, the module's job collapses to "export this, hide everything else." It becomes a mechanical step rather than a design decision.

Reversed orderings fail predictably: module-first guesses the surface, ADT-first guesses the operations, state-machine-after-encapsulation either re-exposes private fields or rebuilds the type a second time.

## Output format

Return:

1. **The concept** — name, one-sentence purpose, current locations (data, fields, mutating call sites, owning dirs).
2. **Characterization tests** — the seam-level tests pinning current behavior, plus a green-baseline confirmation. Flag any behavior that resisted being tested at the seam — that's a gate finding, not a step you skip. (Phase 0.)
3. **States & transitions** — table or mermaid `stateDiagram-v2`. (Phase 2.)
4. **ADT skeleton** — type + operations in the user's language, with private state and constructors that enforce per-state invariants. (Phase 3.)
5. **Module layout** — directory shape, the single public surface, the lint rule that locks it. (Phase 4.)
6. **Migration plan** — ordered, independently shippable steps. Typically: introduce the ADT alongside the old shape → migrate call sites in batches → delete the old shape → enforce the lint rule. Each step ships green against the phase-0 tests.
7. **Verification checklist** — the four phase-5 checks instantiated for this concept.

Keep it tight. Each section points at the deeper sub-skill for elaboration; this skill's job is the recipe, not the encyclopedia.

## Anti-patterns to refuse

These are the *sequencing* traps. The discipline-level ones (leaking the internal collection, junk-drawer modules, allowing every transition, etc.) live in the sub-skills' own anti-pattern lists — don't duplicate them here.

- **Skipping phase 0 because "we have tests already."** Existing tests are usually unit tests of the internals you're about to delete — they'll break in phase 3 even when behavior is preserved, giving you false signal. Audit them; if they bind to internals, write seam-level ones anyway.
- **Treating phase 0 as a step you can defer.** It's a gate. If characterization tests can't be written, the refactor is unsafe to start — fix that first, don't push through.
- **Doing all three phases at once in one PR.** The migration must be incremental — introduce alongside, migrate in batches, then delete. A 200-file rewrite is unreviewable and ships broken.
- **Skipping phase 2 because "the lifecycle is obvious."** If it were obvious, the booleans wouldn't be tangled. Write the table; the act of filling it in is where the bugs surface.
- **Leaving a `legacy` escape hatch on the new module.** A `getRawState()` or `mutateInternals()` operation defeats every preceding phase. If a caller needs something the API doesn't expose, that need is the next operation — add it intentionally or push the caller's logic into the module.
- **Fanning out beyond the one concept.** Mid-refactor it's tempting to also tighten up `Customer` while you're in there. Don't. Finish this concept first; queue the next one.

## Quick mode

For a small concept (≤ ~5 states, single file currently, < 20 call sites):

1. One-paragraph concept identification.
2. 2–3 characterization tests at the public seam, green baseline confirmed. **Phase 0 stays — this is what makes it a refactor instead of a rewrite.**
3. Mermaid `stateDiagram-v2` (skip the full transition table).
4. ADT code skeleton with operations.
5. Single grep / lint rule that prevents regression.

Skip phase 5's representation-swap thought experiment unless the user asks. The phase-0 tests staying green + illegal-transition tests + grep are non-negotiable.
