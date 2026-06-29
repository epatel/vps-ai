---
name: clean-modules
description: Restore module-boundary discipline — one public surface per module, dependencies flowing one direction, internals not imported across modules. Use when you see circular imports, deep relative paths (`../../../foo/bar`), confusion about "where does this live", helpers from one module imported all over the codebase, or a "utils" / "common" / "shared" module that has become the de-facto kitchen sink. Skip for single-file scripts and very small projects (< ~5 modules).
---

# Clean Modules

A module's job is to **hide stuff**. Code inside a module can change freely; code that crosses the boundary is the contract. When the boundary blurs, refactoring becomes a cross-codebase event and small changes ripple unpredictably. This skill restores the boundary: every module has one public surface, dependencies flow one way, internals stay internal.

The discipline is older than the labels people give it (Clean Architecture, Hexagonal, Onion, Ports & Adapters). The labels disagree on details; the underlying rules are the same and are what this skill enforces.

## When to use

Real smells:

- **Circular imports** — `A` imports `B` imports `A`. The runtime patches it with hoisting or lazy loads; the design is broken.
- **Deep relative paths** — `import { foo } from '../../../auth/internal/helpers'`. The `../../../` is the boundary screaming.
- **"Where does this live?"** — the same concept (a `User`, a `Money`) is defined in 3 places, or its definition lives somewhere unexpected because someone needed it there once.
- **Internals leaking** — `module/index.ts` exports a clean API, but half the codebase imports from `module/internal/foo.ts` directly.
- **Kitchen-sink module** — `utils`, `common`, `shared`, `lib`, `core` has 80 unrelated helpers and is imported by everything. It's not a module; it's a junk drawer.
- **Layer inversion** — domain code imports framework code; pure logic imports the database client; the inner layer reaches outward.
- **One change, fifty files** — a rename or signature change in one module touches files all over the tree because callers depend on internals.

Skip for:

- Single-file scripts, notebooks, throwaway tools.
- Projects with < ~5 modules — the overhead of formal boundaries exceeds the benefit.
- Prototype phases where the right module shape isn't known yet.

## The method

### Phase 1 — Map the current import graph

You can't fix what you can't see. Run a tool or generate the graph by hand:

- **JS/TS:** `madge`, `dependency-cruiser`, or `import/no-cycle` ESLint rule.
- **Python:** `pydeps`, `import-linter`, or `grimp`.
- **Go:** `go list -deps` + simple parsing; `go-cleanarch`.
- **Java/Kotlin:** `jdeps`, ArchUnit.
- **Rust:** `cargo-modules`, `cargo-deps`.

Look for: cycles, fan-in (modules everyone imports), fan-out (modules that import everything), and any edge that crosses a layer the wrong way.

### Phase 2 — Decide the layers and direction

State the dependency rule explicitly. The classic shape is three or four layers, each only allowed to import from layers *below* (or "more inward"):

```
infra (db, http, fs, third-party)   ← may import app, domain
   ↑
application (use cases, orchestration)  ← may import domain
   ↑
domain (pure rules, value objects, ADTs)  ← imports nothing project-internal
```

Other shapes work — feature modules with an explicit "shared kernel," ports-and-adapters, etc. — but the rule is the same: pick a direction and *enforce it*. Without enforcement, layers decay back into mush within months.

### Phase 3 — Define one public surface per module

Each module exposes a single entry point — `index.ts`, `mod.rs`, `__init__.py`, a single Java package's public types. Everything else is internal:

- **Public:** named exports, intended for outside use.
- **Internal:** marked private (`internal/` subdir, underscore prefix, package-private, `pub(crate)`, etc.).

The contract is *only* what the public surface exports. Internals can be reorganized at will. If a caller wants something internal, the answer is: either promote it to public (with intent), or move the calling code into the module.

### Phase 4 — Fix violations one at a time

Don't big-bang. For each violation found in phase 1:

- **Cycle:** move the shared piece into a lower layer that both can depend on, or invert one direction with an interface (the higher layer defines the interface, the lower implements it).
- **Deep relative path:** the import is reaching past a boundary. Either re-export from the public surface, or move the consumer into the same module.
- **Junk-drawer module:** identify the actual concepts hiding inside (`utils/date.ts`, `utils/money.ts`, `utils/string.ts` are three modules, not one). Split, then delete `utils`.
- **Layer inversion:** the inner layer should not know about the outer. Define an interface in the inner layer; have the outer layer implement it (Dependency Inversion).

### Phase 5 — Lock the rules in CI

Discipline without enforcement decays. Add a check that fails the build on violations:

- **JS/TS:** `dependency-cruiser` rules, `eslint-plugin-boundaries`, `import/no-restricted-paths`.
- **Python:** `import-linter` contracts.
- **Java/Kotlin:** ArchUnit tests.
- **Rust:** module privacy already enforces a lot; add `clippy` lints for the rest.
- **Go:** custom `go vet` check or `go-cleanarch`.

The rules now live in a file the team can argue about, not in a Slack thread someone forgot.

## Output format

Return:

1. **Current state** — top 3–5 violations with file/line examples.
2. **Proposed layer rule** — one diagram (mermaid) and a one-sentence statement.
3. **Public surface per affected module** — what's exported, what's hidden.
4. **Fix plan** — ordered list of moves, each one safe to ship independently.
5. **Enforcement** — the specific lint rule / config snippet to commit.

## Anti-patterns to refuse

- **One module per file.** Modules are about hiding implementation; a 1-file "module" with 1 export hides nothing. Group by concept.
- **`shared` / `common` / `utils` as a permanent home.** It's a temporary holding area at best. If it survives more than a sprint, split it.
- **Re-exporting everything from the index.** That's a public surface in name only. Curate. If everything is public, nothing is hidden.
- **Layer rule without enforcement.** "We agreed in the doc that domain doesn't import infra" is a wish, not a rule. Enforce in CI or expect drift.
- **Refactor the whole tree at once.** Moves should be independently shippable. A 200-file rename PR is unreviewable; it will land broken.
- **Architecture-by-acronym.** Don't impose Hexagonal/Clean/Onion ceremony on a codebase that doesn't need it. The smells drive the structure, not the other way around.

## Quick mode

For a single offending module:

1. Name the violation in one sentence.
2. The fix as a 2–4-step move list.
3. The single lint rule that prevents recurrence.

Skip the layer diagram if the project only has 2–3 modules.
