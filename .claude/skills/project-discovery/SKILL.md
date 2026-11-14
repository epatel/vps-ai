---
name: project-discovery
description: Generate a compact architecture digest of an unfamiliar codebase via tree-sitter — entry points, hot internal API, per-file class/function map, external deps, orphan callables. Use when the user asks to explore, orient on, summarize, or get an overview of a repo, or when starting work on a project you haven't seen before. Supports Python, JS, TS, Go, Ruby, Rust, Java, Kotlin, Swift, Dart/Flutter, C#, PHP, Scala, Lua, C, C++ (including Arduino `.ino`).
---

# Project Discovery

Generate a markdown digest plus a YAML lookup index for any codebase, optimized for LLM project orientation.

## When to use

- The user asks: "what does this project do", "give me an overview", "summarize this repo", "explore this codebase", "what's the architecture".
- You're about to do non-trivial work in an unfamiliar repo and need to orient first.

## How to run

The extractor ships with this skill in `scripts/`. Its dependencies (`scripts/requirements.txt`: tree-sitter, tree-sitter-language-pack, PyYAML) go in a project-local tool venv, `.venv-tools/project-discovery/`, at the root of the project this skill is installed in. They never go into the system Python, the user's home directory, or the skill directory, which is committed.

```bash
SKILL=<this skill's base directory>
PROJECT=$(git -C "${CLAUDE_PROJECT_DIR:-.}" rev-parse --show-toplevel 2>/dev/null || echo "${CLAUDE_PROJECT_DIR:-$PWD}")
VENV="$PROJECT/.venv-tools/project-discovery"
```

1. **Detect.** If `"$VENV/bin/python"` runs, skip to step 4.
2. **Ask before installing.** Ask the user before installing anything. Say that the skill needs its three packages installed into `.venv-tools/project-discovery/` in this project: about 30 s, with network access. Install only after a yes. If the user says no, stop and say the digest is unavailable. Do not improvise a substitute tool.
3. **Install.** Use a Python 3.9+ interpreter (`python3 --version`), then:
   ```bash
   python3 -m venv "$VENV" && "$VENV/bin/pip" install -q -r "$SKILL/scripts/requirements.txt"
   ```
   If `git -C "$PROJECT" check-ignore -q .venv-tools/` fails, propose adding `.venv-tools/` to the project's `.gitignore`, and add it only after a yes. If the install fails, for example with `ensurepip is not available` on Debian or Ubuntu, report the error. Do not switch to another install method without asking.
4. **Run:**
   ```bash
   OUT=${TMPDIR:-/tmp}/wc-$$
   "$VENV/bin/python" -I "$SKILL/scripts/extract.py" \
     <ROOT> \
     "$OUT-index.yaml" \
     --symbols-only --internal-only \
     --summary "$OUT-summary.md"
   ```

Earlier versions used `~/.cache/project-discovery/venv`. If that directory exists, tell the user it is no longer used and can be deleted. Do not delete it yourself.

`<ROOT>` defaults to the current working directory if the user didn't specify a path. `$OUT` embeds the shell PID so concurrent sessions don't clobber each other's output; remember the resolved paths for follow-up queries.

## What you get

- `$OUT-summary.md` (~2–10k tokens) — the digest. Read this and present its contents to the user.
- `$OUT-index.yaml` — full per-symbol index keyed by name with `defined`/`called` lists. Use as a lookup table for follow-up "where is X defined / called" questions: grep, `yq`, or read directly.

## Summary sections

1. File count + language mix.
2. External dependencies — top-level third-party packages (Python modules, npm packages). The standard library, Node built-ins, and modules defined in the project are excluded.
3. Entry points (`main`/`cli`/`run`/`start` defs + well-known filenames like `main.py`, `app.py`, `index.js`).
4. Hot internal API — top 20 most-called project-defined names.
5. Architecture — top 30 core (non-test) files, each with its classes and functions.
6. Test file count summary.
7. Orphan callable defs — defined but never called internally; usually framework-dispatched (migrations, route handlers, test cases).

## Notes

- Calls to externally-imported names are pruned in Python and JS/TS via per-file import resolution + receiver-root matching. Other languages match by bare name only.
- External deps are listed for Python, JS/TS (npm packages) and Dart (`package:` imports; the project's own pubspec name excluded). Other languages show none.
- Name-based matching has no type inference: `local_var.foo()` where the project also defines `foo` will be counted as internal even if the receiver came from an external library. Treat hot-API counts as approximate.
- Re-run any time; ~5s for ~100k LOC.
