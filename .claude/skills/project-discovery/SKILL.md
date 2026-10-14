---
name: project-discovery
description: Generate a compact architecture digest of an unfamiliar codebase via tree-sitter — entry points, hot internal API, per-file class/function map, external deps, orphan callables. Use when the user asks to explore, orient on, summarize, or get an overview of a repo, or when starting work on a project you haven't seen before. Supports Python, JS, TS, Go, Ruby, Rust, Java, C, C++.
---

# Project Discovery

Generate a markdown digest plus a YAML lookup index for any codebase, optimized for LLM project orientation.

## When to use

- The user asks: "what does this project do", "give me an overview", "summarize this repo", "explore this codebase", "what's the architecture".
- You're about to do non-trivial work in an unfamiliar repo and need to orient first.

## How to run

The extractor ships with this skill in `scripts/`. Set `SKILL` to this skill's base directory (the directory containing this `SKILL.md`). Its dependencies go in a venv under the user cache — never into the system Python, and never inside the skill directory, which may be committed to a project.

```bash
SKILL=<this skill's base directory>
VENV=${XDG_CACHE_HOME:-$HOME/.cache}/project-discovery/venv
[ -x "$VENV/bin/python" ] || { python3 -m venv "$VENV" && "$VENV/bin/pip" install -q -r "$SKILL/scripts/requirements.txt"; }
OUT=${TMPDIR:-/tmp}/wc-$$
"$VENV/bin/python" -I "$SKILL/scripts/extract.py" \
  <ROOT> \
  "$OUT-index.yaml" \
  --symbols-only --internal-only \
  --summary "$OUT-summary.md"
```

The first run creates the venv and installs tree-sitter (needs network, ~30s); later runs reuse it. If the install fails, report the error to the user rather than improvising a substitute tool.

`<ROOT>` defaults to the current working directory if the user didn't specify a path. `$OUT` embeds the shell PID so concurrent sessions don't clobber each other's output; remember the resolved paths for follow-up queries.

## What you get

- `$OUT-summary.md` (~2–10k tokens) — the digest. Read this and present its contents to the user.
- `$OUT-index.yaml` — full per-symbol index keyed by name with `defined`/`called` lists. Use as a lookup table for follow-up "where is X defined / called" questions: grep, `yq`, or read directly.

## Summary sections

1. File count + language mix.
2. External dependencies (real third-party libraries, project-internal absolute imports excluded).
3. Entry points (`main`/`cli`/`run`/`start` defs + well-known filenames like `main.py`, `app.py`, `index.js`).
4. Hot internal API — top 20 most-called project-defined names.
5. Architecture — top 30 core (non-test) files, each with its classes and functions.
6. Test file count summary.
7. Orphan callable defs — defined but never called internally; usually framework-dispatched (migrations, route handlers, test cases).

## Notes

- Calls to externally-imported names are pruned in Python and JS/TS via per-file import resolution + receiver-root matching. Other languages match by bare name only.
- Name-based matching has no type inference: `local_var.foo()` where the project also defines `foo` will be counted as internal even if the receiver came from an external library. Treat hot-API counts as approximate.
- Re-run any time; ~5s for ~100k LOC.
