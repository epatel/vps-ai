---
name: clean-modules
description: Restore module boundaries — one public surface per module, dependencies flowing one direction, no internals imported across modules, rules enforced in CI. Use when you see circular imports, deep relative paths (`../../../foo/bar`), confusion about "where does this live", one module's helpers imported all over the codebase, domain code importing framework or database code, or a "utils" / "common" / "shared" module that has become a kitchen sink. Skip for single-file scripts and projects under ~5 modules.
---

# Clean Modules

You know layering, dependency inversion, and the dependency tools of each ecosystem (madge, dependency-cruiser, import-linter, ArchUnit, jdeps, cargo-modules). This skill fixes the procedure and the rules to hold.

## When to use

- Circular imports.
- Deep relative paths reaching into another module's internals.
- The same concept (`User`, `Money`) defined in several places.
- `module/index.ts` is clean but callers import `module/internal/foo.ts`.
- A `utils` / `common` / `shared` / `core` junk drawer imported by everything.
- Inner layers importing outer ones (domain → database client).
- One rename touching fifty files.

Skip for single-file scripts, notebooks, projects under ~5 modules, and prototypes whose shape is not known yet.

## Method

1. **Map the import graph with a tool**, not by eye. Find cycles, high fan-in, high fan-out, and wrong-way edges.
2. **State the dependency rule** in one sentence and one diagram. Default shape, arrows meaning "may import":

   ```mermaid
   graph TD
       infra["infra — db, http, fs, third-party"] --> app["application — use cases"]
       infra --> domain["domain — pure rules, value objects, ADTs"]
       app --> domain
   ```

   `domain` imports nothing project-internal. Feature modules with a shared kernel, or ports and adapters, are fine too — the smells choose the shape, not an acronym.
3. **One public surface per module** (`index.ts`, `__init__.py`, `mod.rs`, a package's public types). Everything else is internal. A caller needing an internal either gets it promoted on purpose or moves into the module.
4. **Fix one violation per change**, each shippable alone:
   - Cycle → move the shared piece down, or invert one edge with an interface owned by the inner side.
   - Deep import → re-export from the surface, or move the consumer in.
   - Junk drawer → split by the concepts inside (`date`, `money`, `string`), then delete it.
   - Layer inversion → interface in the inner layer, implementation in the outer.
5. **Enforce the rule in CI**, or it decays within months. Use a boundary checker that fails the build: `dependency-cruiser` / `eslint-plugin-boundaries` (JS/TS), `import-linter` contracts (Python), ArchUnit (JVM), `go-cleanarch` or a `go list` check (Go). In Rust, crate and `pub(crate)` visibility do most of it; split crates where a boundary must be hard, since clippy has no boundary lints.

## Output format

1. **Current state** — top 3–5 violations with file:line examples.
2. **Layer rule** — the diagram and the one-sentence rule.
3. **Public surface per affected module** — exported vs hidden.
4. **Fix plan** — ordered moves, each independently shippable.
5. **Enforcement** — the exact rule or config to commit.

## Anti-patterns to refuse

- **One module per file.** A one-export module hides nothing. Group by concept.
- **`utils` as a permanent home.** Split it before it outlives a sprint.
- **Re-exporting everything from the index.** If everything is public, nothing is hidden.
- **A layer rule only in a doc.** Without CI it is a wish.
- **Whole-tree refactor in one PR.** Unreviewable, lands broken.
- **Architecture-by-acronym** on a codebase that does not need the ceremony.

## Quick mode

For one offending module: the violation in one sentence, a 2–4-step move list, and the single rule that prevents recurrence. Skip the diagram for 2–3 modules.
