---
name: focused-refactor
description: Solidify ONE bounded concept (an Order, a Cart, a Document, a Job, a Subscription …) by applying state-machines, adt-types, and clean-modules together as an ordered recipe. Use when a single entity simultaneously has flag-soup lifecycle (`isPaid`, `isShipped`, `isCancelled`), anemic data with logic scattered across callers, AND no clear module ownership — so fixing any one alone leaves the other two still leaking. Skip when only one of the three smells is present (route to the individual skill instead) or when the concept isn't actually bounded yet.
---

# Focused Refactor

A concept in real trouble usually has three smells at once: an implicit lifecycle, invariants checked by callers, and no module owner. Fixing one alone leaves the others leaking. This skill fixes the order and the gate. For each discipline, defer to `state-machines`, `adt-types`, and `clean-modules`.

## When to use

All three smells on **one** concept. With one smell, use that skill directly. If the "concept" is two tangled things (payment and shipping lifecycles of an Order), split it first and run this on each part. Skip prototypes and code that is not load-bearing.

## Method

0. **Gate: pin current behavior.** Write characterization tests at the public seam — what callers observe ("a shipped order rejects refund"), not internal fields. Run them green. Existing tests that bind to internals do not count. If seam tests cannot be written, the refactor is unsafe to start: decompose further or add observability first.
1. **Name the concept.** One-sentence purpose. List where the data is defined, where the flags live, the mutating call sites (rough count), and the directories with logic about it. If it is not one concept, stop.
2. **Lifecycle** (`state-machines`). States, events, a transition table with explicit rejections. Stop at the table. It is the spec for step 3.
3. **Encapsulation** (`adt-types`). One operation per legal transition, plus the queries callers need. Per-state invariants come from the table. The state field is private and the transition function lives inside the type.
4. **Boundary** (`clean-modules`). The module's only export is the ADT's operations. Add a boundary lint that fails the build.
5. **Verify.**
   1. Phase-0 tests are green. A red test is either a real behavior change (fix the production code) or a test bound to internals (rewrite it at the seam, confirm it passes on the old code, re-run).
   2. Each empty cell of the transition table has a new test that tries it through the public API and sees the rejection.
   3. A grep finds no private field access, no flag flips, no free functions that mutate the entity.
   4. Swapping the internal representation would change zero call sites outside the module.

Why this order: the transition table defines the ADT's operations, and the ADT's operations define the module's surface. Any other order guesses an interface and redraws it later.

## Output format

1. **Concept** — name, purpose, current locations.
2. **Characterization tests** — the seam tests and a green baseline. Report behavior that resisted seam testing as a gate finding.
3. **States and transitions** — table or `stateDiagram-v2`.
4. **ADT skeleton** — in the user's language, private state, constructors enforcing invariants.
5. **Module layout** — the public surface and the lint rule.
6. **Migration plan** — independently shippable steps: introduce alongside → migrate callers in batches → delete the old shape → enforce the lint. Each step green against the phase-0 tests.
7. **Verification checklist** — the step 5 checks for this concept.

## Anti-patterns to refuse

Sequencing traps only. Discipline-level ones live in the sub-skills.

- **Skipping or deferring the gate** because "we have tests". Tests of internals break in step 3 and give false signal.
- **Skipping the table** because "the lifecycle is obvious". Filling it is where the bugs surface.
- **All phases in one PR.** Introduce alongside, migrate in batches, delete last.
- **A `getRawState()` escape hatch.** A caller's need is the next operation, added on purpose.
- **Fanning out** to a second concept mid-refactor. Finish this one, queue the next.

## Quick mode

For ≤ ~5 states, one file, < 20 call sites: a one-paragraph concept, 2–3 seam tests green, a `stateDiagram-v2`, the ADT skeleton, and one grep or lint rule. The gate, the illegal-transition tests, and the grep stay. Skip the representation-swap check unless asked.
