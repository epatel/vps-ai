# Double-check questions

Questions for each pass of `double-check`. Use the ones that apply to the change. Do not answer every question in the report. Report only what you found.

## 1. Completeness

- Does each part of the intent map to a hunk in the diff? Which part has no hunk?
- After a rename or signature change, does a search for the old name or old call shape find no hits? Search strings, config, docs, and templates too, not only code.
- Do sibling implementations of the same interface, other platforms, or other backends need the same change?
- Does a new case (enum value, status, error type, message kind) appear in every `switch`, `match`, mapping, and serializer?
- Are there tests for the new behavior, and are tests for the old behavior updated or removed?
- Do the README, docs, comments, changelog, and agent instructions describe the new behavior?
- Do config, environment variables, feature flags, schema migrations, and dependency manifests need a change?
- Do generated files, lockfiles, or snapshots need to be regenerated?
- Are new user-visible strings localized, if the project localizes?
- Do logging, metrics, or error reporting need to cover the new path?

## 2. Correctness

- What did existing callers rely on before the change? Is that behavior still true, or is every caller updated?
- What happens with empty, null, zero, negative, very large, duplicate, and unicode input?
- What happens at each boundary: the first and last item, off-by-one, time zones, end of month, leap years?
- Are errors handled, propagated, or deliberately ignored, with a reason? Is any error now swallowed?
- Is the order of operations still right? Is something used before it is initialized, or after it is released?
- Are async calls awaited? Can two runs interleave? Is shared state still consistent?
- Do the types say the truth? Look for new casts, `any`, `!`, `unwrap`, and ignored warnings.
- Is a cache, memo, or index still valid after the change?

## 3. Safety

- Does untrusted input reach a query, shell, path, template, regex, or deserializer?
- Are secrets, tokens, or personal data logged, committed, or sent somewhere new?
- Are permission and ownership checks still applied on every new path?
- Can an operation delete, overwrite, or migrate data that cannot be recovered? Is there a dry run, a backup, or a guard?
- Does the change break the compatibility of a public API, a file format, a wire format, or stored data? Can an older client or older data still work?
- What happens when a dependency is slow, down, or returns garbage? Are there timeouts, retries with limits, and a clear failure?
- Can a loop, retry, recursion, or allocation grow without bound?
- How do you roll the change back? Does a migration have a down path, or is it safe to leave in place?

## 4. Simplicity

- Does a helper, library function, or pattern for this already exist in the codebase?
- Is there a branch, parameter, option, or layer that no caller uses?
- Is an abstraction added for one use?
- Can a flag or special case go away if you change the data shape?
- Does the change touch files that the intent does not need?
- Are there leftovers: debug output, commented-out code, unused imports, TODOs without an owner?
- Do names say what the code does now, after the change?

## 5. Verification

- Which commands build, test, lint, and type-check this project? Read the Makefile, package scripts, CI config, or CLAUDE.md. Run them.
- Which tests exercise the changed lines? If none, write one, or exercise the behavior directly and say how.
- Does each confirmed bug have a failing test or a repro that passes after the fix?
- Does the full suite still pass, not only the new tests?
- If the change is visible to a user, did you run the app and see the change work?
