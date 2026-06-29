---
name: adt-types
description: Turn anemic data structures whose fields are read and written directly across the codebase into Abstract Data Types — types defined by their *operations*, with representation hidden behind a small interface and invariants enforced inside. Use when callers reach into a struct's fields, when invariants are re-checked at every call site, when changing the internal representation would ripple through the codebase, or when you see "anemic" records carrying logic that lives in their callers. Skip for transparent data containers (DTOs, value objects, on-the-wire payloads) where representation IS the contract.
---

# Abstract Data Types

An ADT is a type defined by **what you can do with it**, not how it's stored. Callers see operations; representation is hidden. Invariants are enforced *inside* the type, once, instead of being re-checked by every caller. The point is modular reasoning: you can change the internals freely as long as the operations behave the same.

This is the Parnas / Liskov tradition — "On the Criteria To Be Used in Decomposing Systems into Modules" and "Programming with Abstract Data Types." It's distinct from *algebraic* data types (sum types, tagged unions), which are about the *shape* of data; ADTs are about hiding shape behind behavior.

## When to use

Real smells:

- **Field access scattered across the codebase.** `cart.items.push(x)`, `cart.items.length`, `cart.total = …` from many call sites — there's no `Cart`, just a bag of fields with `Cart` written on it.
- **Invariants enforced at the call site.** Every caller does `if (cart.total < 0) throw …` or recomputes `total` from `items`. The invariant should live inside the type, not in the callers.
- **Representation is load-bearing.** Callers depend on the fact that `users` is specifically an array (they `.sort()` it in place, index by position, etc.). You can't switch to a `Map` without touching them all.
- **"Anemic domain model."** A record with no methods, surrounded by free functions that all take it as the first argument and mutate it. Those functions are the operations — they want to live on the type.
- **Two equivalent representations exist** (e.g., `Money` as `{cents: int}` vs `{amount: Decimal, currency: string}`) and the codebase has half-converted between them, with bugs at the seams.

Skip for:

- **Transparent data** — DTOs, JSON payloads, protobuf messages, config objects. Their *shape is the contract*; hiding it is harmful.
- **Value objects with no invariants** — a 2D `Point {x, y}` doesn't need encapsulation; the fields are the API.
- **Throwaway scripts** — the abstraction tax exceeds the lifetime.

## The method

### Phase 1 — Name the type and its invariants

Write down what makes a valid instance. "A `Cart` always has a non-negative `total` equal to the sum of `items[].price * items[].qty`. Empty carts are allowed; carts with negative quantities are not." If you can't list the invariants, you don't yet know what the type *is* — only what it stores.

### Phase 2 — Identify the operations from the callers

Grep every existing call site. Collapse them into a small set of operations the callers actually need. For a cart that's likely:

- `Cart.empty()` (constructor)
- `cart.add(item, qty)` / `cart.remove(itemId)`
- `cart.total()` (derived, never stored as a settable field)
- `cart.lineCount()`
- `cart.items()` — returning an *immutable view*, not the internal array

Resist exposing operations "just in case." Every operation is a future migration tax. If only one caller needs it, it's not part of the ADT yet.

### Phase 3 — Hide the representation

Make the storage private. The boundary is language-specific:

- **JS/TS:** `#privateField` or closure capture; export only the class/factory.
- **Python:** `_underscore_prefix` by convention; `__name_mangling` if you mean it. Use `@property` for derived values.
- **Java/Kotlin/Swift/C#:** `private` fields, public methods.
- **Rust:** `pub struct` with private fields, `impl` block of `pub fn`.
- **Go:** lowercase field names; export only methods.
- **C++:** `class` with `private:` data, `public:` methods.

The internal shape is now free to change. You can swap `Vec<Item>` for `HashMap<ItemId, Item>` without a single caller noticing — that's the test that the abstraction is real.

### Phase 4 — Move invariant enforcement inside

Every check that callers used to do (`if (cart.total < 0)`, `if (items.empty)`, deduplication, normalization) moves into the constructor and mutating operations. Constructors validate; mutators preserve. After this, **no operation can leave the instance in an invalid state** — that's the whole game.

If a check is impossible inside (e.g., needs DB access), the operation should *return* an error (`Result`/`Either`/exception), not silently succeed and leave the invariant broken.

### Phase 5 — Migrate callers to the interface

Replace direct field access with operation calls, one call site at a time. Tools that help:

- Make the field private *first*; let the compiler/linter find the call sites.
- For dynamic languages, grep for `\.fieldname\b` and audit each.
- Keep a thin shim if needed during migration (`get items() { return [...this.#items] }`), and delete it once callers move.

The migration is done when the only code that touches the representation is inside the ADT itself.

## Output format

Return:

1. **The type & invariants** — name, one-sentence summary, bulleted invariants.
2. **Operations** — minimal interface, with signatures.
3. **Skeleton implementation** — code, in the user's language, with private fields and operations stubbed. Constructor enforces invariants.
4. **Caller migration** — 1–3 representative before/after pairs.
5. **Caller fan-out** — rough count of sites that touch the old representation, so the user can size the migration.

## Anti-patterns to refuse

- **Getters and setters for every field.** That's not encapsulation — it's the same anemic record with extra punctuation. Operations should be *behaviors* (`add`, `checkout`), not field mirrors.
- **Leaking the internal collection.** Returning the live `items` array from a getter destroys encapsulation; callers will mutate it. Return a copy or an immutable view.
- **Operations that bypass invariants.** A `setTotal()` that lets callers write any number defeats the invariant; remove it. Totals should be derived.
- **Premature ADT.** A 2-field point or a 1-day prototype doesn't need this. Apply when invariants exist or representation is changing.
- **Big-bang rewrite.** Introduce the ADT alongside the old shape, migrate one caller at a time behind the new operations, delete the old shape last.
- **Interface explosion.** If your "minimal interface" has 30 operations, you've absorbed your callers' logic into the type. Push some back out — the ADT should have *its* invariants, not theirs.

## Quick mode

For a single record being upgraded:

1. Invariants in 1–3 bullets.
2. Operations as a code-block signature list.
3. Constructor + one mutator implementation showing invariant enforcement.

Skip the migration plan if the call sites are <10 — the user can see them in their editor.
