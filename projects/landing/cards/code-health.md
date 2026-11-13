# Code Health Feedback

## Problem

A coding agent judges its own change by whether the tests pass. Tests do not notice that a function grew to 150 lines, that nesting went five deep, or that a block was copied a third time. Those regressions pile up one session at a time, and a reviewer only sees them once refactoring has become expensive. Asking for clean code in CLAUDE.md does not help much: it is a request with no measurement behind it, and nothing tells the agent when it slipped.

## Solution

Give the agent a measurement and feed it back at the moment of the change. [aihealth](https://github.com/epatel/ai-health) scores code health from 1 to 10 using explainable smells (Brain Method, Deep Nesting, Cognitive Complexity, Code Duplication, Large File and others), and reports a *delta*: did this change make the touched code healthier or worse, with `path:line` and a fix hint for each new or worsened smell.

Install it in the project's own venv and wire it in through the harness, not prose:

| Piece | Where | What it does |
|---|---|---|
| aihealth, pinned to a release tag | `.venv/` in the project (gitignored) | Nothing global; the project chooses the version, so everyone gets the same scores |
| `PostToolUse` hook on `Edit\|Write` | `.claude/settings.json` | After each edit of a supported file, checks that file against `HEAD`. Silent unless it got worse; then Claude gets the regressions next to the edit result |
| `Stop` hook | `.claude/settings.json` | Before Claude finishes, checks all uncommitted changes. If health degraded, Claude gets one more turn to fix them or to say why they are intended. It never fires twice in a row |
| MCP server | `.mcp.json` | Tools the agent calls itself: `review_changes`, `preview_change` (score proposed content before writing it), `score_file`, `scan_project`, `explain_smell` |
| One CLAUDE.md section | `CLAUDE.md` | How to install the pinned version, and `.venv/bin/aihealth delta` before committing as the manual check |

Supported: Python, Dart/Flutter, Swift/SwiftUI, Rust, Go, TypeScript/TSX, JavaScript/JSX, C, C++, Objective-C(++), shell scripts (bash, zsh), Makefiles and CMake. Needs Python 3.11+ and git 2.24+, and works only in a git repository. The venv is a tool venv: a Flutter, Rust or JavaScript project gets one too.

## Applying it to a project

The install doc in the aihealth repo is the source of truth for exact commands and JSON: `https://github.com/epatel/ai-health/blob/main/AGENT-INSTALL.md`, section **In a project's venv**. Fetch it and follow it; if it differs from the summary below, it wins.

1. **Pick the release.** Find the latest tag: `git ls-remote --tags --refs https://github.com/epatel/ai-health | sed 's|.*/||' | sort -V | tail -1`. Pin it; do not follow `main`. A new minor version can score the same code differently (see the repo's `CHANGELOG.md`).
2. **Install into `.venv/`.** Create it with `python3 -m venv .venv` if the project has none (check `python3 --version` first: macOS ships 3.9, so use a 3.11+ interpreter such as `python3.12` from Homebrew or uv), then `.venv/bin/pip install "git+https://github.com/epatel/ai-health@<tag>"` and check `.venv/bin/aihealth --version`. Make sure `.venv/` is in `.gitignore`. If aihealth is already in the venv, compare its version with the tag and offer the upgrade (see Rules of thumb). Never install it globally from this pattern.
3. **Commit the pin.** The venv is not committed, so the pin must live somewhere that is. A Python project with a dev requirements file or dev extras adds `aihealth @ git+https://github.com/epatel/ai-health@<tag>` there. Any other project puts the exact install command in the CLAUDE.md section (step 6).
4. **`.mcp.json`** at the repo root: add the `aihealth` server with `"command": ".venv/bin/aihealth", "args": ["mcp"]`. Merge with existing servers; never replace the file. Project MCP servers need each person's approval the first time Claude Code sees them.
5. **Hooks** in `.claude/settings.json`: merge the `PostToolUse` and `Stop` entries from the install doc into any hooks already there. Keep their `[ -x "$CLAUDE_PROJECT_DIR/.venv/bin/aihealth" ]` guard, so a clone that has not installed aihealth yet is not blocked.
6. **CLAUDE.md:** add the short `## Code health` section from the install doc, plus the pinned install command when step 3 did not put it in a requirements file. Do not add rules the hooks already enforce.
7. **Baseline:** run `.venv/bin/aihealth scan . --save --max-findings 5` and show the user the project score and worst files. `--save` keeps it in `.aihealth/health.db` (it gitignores itself) so later scans show the trend. Add `--report` if the user wants the full list as a file: it writes `AI-HEALTH.md` in the project (renders on GitHub; leave it uncommitted unless asked). If the scan includes generated code, vendored code or deliberately bad fixtures, propose an `.aihealth.toml` at the repo root with `[scan] exclude = [...]` for them.
8. **Verify the hook** by running it once by hand. A real edit proves nothing, because the hook is silent on a healthy edit and on a broken one alike:
   ```bash
   echo "{\"cwd\":\"$PWD\",\"tool_input\":{\"file_path\":\"$PWD/<a supported file>\"}}" | .venv/bin/aihealth hook post-edit; echo "exit=$?"
   ```
   Expect no output and `exit=0`.

Show each file change before making it. Do not commit unless asked.

## Rules of thumb

- **Feedback, not a gate.** The hooks give the agent information and one extra turn. They never block an edit. A regression the change needs (a new parser that is complex by nature) is fine once the agent says why.
- **Judge the delta, not the score.** A legacy project scoring 4 is not a problem to fix in this setup. The point is that each change leaves the code it touches no worse.
- **Upgrade on purpose.** Changing the pinned tag can change scores. Save a scan before and after (`--save`); `aihealth history` marks the version change, so a jump in the trend is explained. Update the pin in the same commit.
- **The installed version is what runs.** The hooks and MCP server use whatever is in `.venv/`. Check `.venv/bin/aihealth --version` against the pin whenever the setup is refreshed, since an old install silently skips languages added later.
- **Dependency clash → global form.** aihealth pins tree-sitter, mcp, fastapi and uvicorn ranges. If they clash with a Python project's own pins, use the install doc's **For a project** form instead (a global install, `"command": "aihealth"`, `command -v` guarded hooks). Hooks for one form do nothing for the other, so the whole team uses the same form.
- **Refactoring is separate work.** Do not refactor the worst files found by the baseline scan unless the user asks; list them as candidates.
- **CI is optional.** `aihealth scan . --fail-under N` gates on the project score, and `aihealth delta --base main` checks a branch. Suggest it only if the project already has CI.

## When to apply

⚗️ Experimental. Recommend it when most of the code the agent edits is in a supported language and agents make regular code changes. Recommend declining for documentation-only repositories, for projects mostly in unsupported languages (Java, Kotlin, C#, Ruby, PHP), and when the user does not want a tool from outside the project's own stack.
