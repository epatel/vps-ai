---
name: adt-types
description: Turn anemic records whose fields are read and written across the codebase into Abstract Data Types with hidden representation and invariants enforced inside. Use when callers reach into a struct's fields, when invariants are re-checked at every call site, when changing the internal representation would ripple through the codebase, or when free functions taking a record as first argument carry its logic. Skip for transparent data (DTOs, on-the-wire payloads, value objects without invariants) where representation IS the contract.
---

# Abstract Data Types

You know the Parnas/Liskov idea and how each language hides fields. This skill fixes the defaults to apply when you do it.

## When to use

- Field access scattered across call sites (`cart.items.push(x)`, `cart.total = …`).
- Invariants checked by callers (`if (cart.total < 0) throw …`) or derived values recomputed by them.
- Callers depend on the representation (sort the array in place, index by position), so it cannot change.
- An anemic record surrounded by free functions that take it first and mutate it.
- Two representations of the same thing, half-converted, with bugs at the seams.

Skip for DTOs, JSON/protobuf payloads, config objects, invariant-free value objects (`Point {x, y}`), and throwaway scripts.

## Method

1. **Invariants first.** Write what makes an instance valid. If you cannot list invariants, you do not know what the type is yet. Stop and ask.
2. **Operations from the callers.** Grep every call site and collapse them into the few operations they actually need. One caller is not enough to justify an operation.
3. **Hide the representation.** Make storage private with the language's real mechanism. Derived values (`total`) become operations, never settable fields. Collections go out as copies or read-only views.
4. **Enforce inside.** Constructors validate, mutators preserve. A check that cannot run inside (needs I/O) makes the operation return an error, not succeed silently.
5. **Migrate one caller at a time.** Make the field private first and let the compiler or a grep for `\.field\b` list the sites. A temporary shim is fine; delete it when the last caller moves.

Done when only code inside the type touches the representation — swapping `Vec` for `HashMap` changes no caller.

## Output format

1. **Type & invariants** — name, one-sentence summary, bulleted invariants.
2. **Operations** — minimal interface with signatures.
3. **Skeleton** — in the user's language: private fields, constructor enforcing invariants, operations stubbed.
4. **Caller migration** — 1–3 before/after pairs.
5. **Caller fan-out** — rough count of sites touching the old representation, to size the migration.

## Anti-patterns to refuse

- **Getter and setter per field.** Same anemic record, more punctuation. Operations are behaviors (`add`, `checkout`).
- **Leaking the live collection** from a getter.
- **Setters that bypass invariants** (`setTotal`). Derive it.
- **Interface explosion.** 30 operations means the callers' logic moved in. The type owns *its* invariants, not theirs.
- **Big-bang rewrite.** Introduce alongside the old shape, migrate, delete the old shape last.
- **Premature ADT** on a 2-field point or a prototype.

## Quick mode

For one record: invariants in 1–3 bullets, operation signatures, and the constructor plus one mutator showing enforcement. Skip the migration plan under ~10 call sites.
