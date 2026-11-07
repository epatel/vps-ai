# Code Health Feedback

## Problem

A coding agent judges its own change by whether the tests pass. Tests do not notice that a function grew to 150 lines, that nesting went five deep, or that a block was copied a third time. Those regressions pile up one session at a time, and a reviewer only sees them once refactoring has become expensive. Asking for clean code in CLAUDE.md does not help much: it is a request with no measurement behind it, and nothing tells the agent when it slipped.

## Solution

Give the agent a measurement and feed it back at the moment of the change. [aihealth](https://github.com/epatel/ai-health) scores code health from 1 to 10 using explainable smells (Brain Method, Deep Nesting, Cognitive Complexity, Code Duplication, Large File and others), and reports a *delta*: did this change make the touched code healthier or worse, with `path:line` and a fix hint for each new or worsened smell.

Wire it in through the harness, not prose:

| Piece | Where | What it does |
|---|---|---|
| `PostToolUse` hook on `Edit\|Write` | `.claude/settings.json` | After each edit of a supported file, checks that file against `HEAD`. Silent unless it got worse; then Claude gets the regressions next to the edit result |
| `Stop` hook | `.claude/settings.json` | Before Claude finishes, checks all uncommitted changes. If health degraded, Claude gets one more turn to fix them or to say why they are intended. It never fires twice in a row |
| MCP server | `.mcp.json` | Tools the agent calls itself: `review_changes`, `preview_change` (score proposed content before writing it), `score_file`, `scan_project`, `explain_smell` |
| One CLAUDE.md section | `CLAUDE.md` | Says the hooks exist and that `aihealth delta` before committing is the manual check |

Supported: Python, Dart/Flutter, Swift/SwiftUI, Rust, TypeScript/TSX, JavaScript/JSX, C, C++, Objective-C(++), shell scripts (bash, zsh), Makefiles and CMake. Needs Python 3.11+ and git 2.24+, and works only in a git repository.

## Applying it to a project

The install doc in the aihealth repo is the source of truth for exact commands and JSON: `https://github.com/epatel/ai-health/blob/main/AGENT-INSTALL.md`, section **For a project**. Fetch it and follow it; if it differs from the summary below, it wins.

1. **CLI** — check `command -v aihealth`. If it is missing, ask the user before installing: `uv tool install "git+https://github.com/epatel/ai-health"` (or `pipx install …`) installs it for their whole machine, outside the project. Do not use `claude mcp add --scope user` or edit `~/.claude/settings.json`; this pattern is project-scoped.
2. **`.mcp.json`** at the repo root — add the `aihealth` server (`"command": "aihealth", "args": ["mcp"]`). Merge with existing servers; never replace the file. Project MCP servers need each person's approval the first time Claude Code sees them.
3. **Hooks** in `.claude/settings.json` — merge the `PostToolUse` and `Stop` entries from the install doc into any hooks already there. Keep their `command -v aihealth >/dev/null 2>&1 && … || true` guard: collaborators who have not installed aihealth must not be blocked.
4. **CLAUDE.md** — add the short `## Code health` section from the install doc. Do not add rules the hooks already enforce.
5. **Baseline** — run `aihealth scan . --max-findings 5` and show the user the project score and worst files. If the scan includes generated code, vendored code or deliberately bad fixtures, propose an `.aihealth.toml` at the repo root with `[scan] exclude = [...]` for them.
6. **Verify** — make one small edit to a supported file and confirm the post-edit hook runs without error. It stays silent unless health got worse, which is the expected result for a harmless edit.

Show each file change before making it. Do not commit unless asked.

## Rules of thumb

- **Feedback, not a gate.** The hooks give the agent information and one extra turn. They never block an edit. A regression the change needs (a new parser that is complex by nature) is fine once the agent says why.
- **Judge the delta, not the score.** A legacy project scoring 4 is not a problem to fix in this setup. The point is that each change leaves the code it touches no worse.
- **Refactoring is separate work.** Do not refactor the worst files found by the baseline scan unless the user asks; list them as candidates.
- **CI is optional.** `aihealth scan . --fail-under N` gates on the project score, and `aihealth delta --base main` checks a branch. Suggest it only if the project already has CI.

## When to apply

⚗️ Experimental. Recommend it when most of the code the agent edits is in a supported language and agents make regular code changes. Recommend declining for documentation-only repositories, for projects mostly in unsupported languages (Go, Java, Kotlin, C#, Ruby, PHP), and when the user does not want a tool from outside the project's own stack.
