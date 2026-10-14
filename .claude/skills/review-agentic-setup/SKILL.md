---
name: review-agentic-setup
description: Review and modernize a project's agentic setup — CLAUDE.md / AGENTS.md, agent docs (cards/ index, per-feature CLAUDE.md / CLAUDE_full.md, project-plan.md), local .claude/ skills, agents, commands, and hooks — against the capabilities of the model currently running this skill. Applies updates to project-local files directly; for global skills (~/.claude/skills, ~/.claude/CLAUDE.md) it only produces an update plan, never edits. Use when the user asks to review, refresh, audit, or modernize the agentic/Claude setup of a project, when instruction files reference outdated models or tools, or periodically as models and tooling improve. Trigger: /review-agentic-setup [path]
---

# Review Agentic Setup

Agentic setups (instruction files, skills, agent docs) are written against the models and tools that existed at the time. Models and harnesses improve continuously, so these files rot: they over-explain things newer models do natively, reference removed tools or renamed features, hard-code paths that moved, and miss capabilities that didn't exist yet.

**You — the model running this skill right now — are the reference.** Review every instruction against what you actually need and what your harness actually supports today. Do not preserve guidance just because it was once correct.

Target: the project at `[path]` if given, else the current working directory.

## Ground rules

- **Project-local files: apply updates directly.** Surgical edits, smallest diff that fixes the finding. Never rewrite a file wholesale when editing sections will do.
- **Global files (`~/.claude/skills/`, `~/.claude/CLAUDE.md`, `~/.claude/agents/`, `~/.claude/settings.json`): read-only.** Findings go into an update plan (Phase 4). Never edit, move, or delete anything under `~/.claude/` — global changes affect every project and the user applies them deliberately.
- **Preserve intent.** If an instruction looks odd but you can't show it's obsolete, keep it and flag it as a question in the report instead of deleting it. User-authored constraints (e.g. "never use library X") are policy, not rot.
- **Verify before declaring rot.** An instruction referencing a path, binary, command, or model is only stale if you checked that the referent is actually gone or renamed. Run the check (`ls`, `which`, `--help`) — don't assume.
- If the project is a git repo, work on the current branch and leave changes uncommitted for the user to review (commit only if asked). If not a git repo, write a backup list of touched files in the report.

## Phase 1 — Inventory

Enumerate every agentic asset. Typical locations:

| Asset | Where to look |
|---|---|
| Project instructions | `CLAUDE.md`, `AGENTS.md`, `*.md` referenced via `@` imports from CLAUDE.md |
| Agent docs | `cards/` + the card index in CLAUDE.md, per-feature `CLAUDE.md` / `CLAUDE_full.md`, `project-plan.md`, `docs/` files addressed to agents; older layouts may use an `AGENT_FILES/` dir with its own routing manifest |
| Local skills | `.claude/skills/*/SKILL.md` + sibling reference files |
| Local agents | `.claude/agents/*.md` |
| Local commands | `.claude/commands/*.md` (legacy — candidates for skill conversion) |
| Settings & hooks | `.claude/settings.json`, `.claude/settings.local.json` (hooks, permissions, MCP) |
| Skill libraries | plugin-style dirs like `skill-library/*/skills/*/SKILL.md`, `.claude-plugin/plugin.json` |
| Global (read-only) | `~/.claude/CLAUDE.md` + its `@` imports, `~/.claude/skills/`, `~/.claude/agents/`, `~/.claude/settings.json` |

Build the inventory as a table (file, kind, size, last modified) before reviewing anything. If the tree is large, prefer batch/sandboxed execution over reading raw output into context.

## Phase 2 — Review

Review each asset against `references/rubric.md` (read it now). Classify every finding:

- **ROT** — provably outdated: dead path, removed tool, renamed feature, superseded model name, instruction contradicting current harness behavior. → fix in Phase 3.
- **REDUNDANT** — tells the current model something it does natively (e.g. long explanations of how to plan, verbose step-by-step for things one sentence covers), or duplicates another file. → shrink or delete in Phase 3.
- **GAP** — a current capability the setup ignores where it would clearly help (skills that should have trigger-rich descriptions, hooks that could replace "always remember to…" prose, missing routing manifest for a large doc pile). → add in Phase 3, smallest useful version.
- **QUESTION** — looks wrong but intent is unclear, or fixing it changes behavior the user may rely on. → report only, do not change.

Cross-file pass after per-file review: contradictions between CLAUDE.md, cards, and skills; the same fact stated in three places (pick one home, link from the others); instructions in always-loaded files that belong in load-on-demand cards or skills.

## Phase 3 — Apply project-local updates

Fix ROT, REDUNDANT, and GAP findings in project-local files only.

- Skills: keep `SKILL.md` lean (frontmatter + when-to-use + how-to-run); push long material to sibling reference files loaded on demand. Descriptions must be trigger-rich — state *when* to use, including indirect phrasings — since the description is all the model sees before deciding to load it.
- CLAUDE.md: it loads into every session — every line costs context forever. Move task-specific material into cards/skills with a routing line ("read X when doing Y") instead.
- Verify each edit: referenced paths exist, referenced commands run, `@` imports resolve, card manifest entries match actual files.
- Keep a running changelog of every edit (file, finding class, one-line rationale) for the report.

## Phase 4 — Global skills review (plan only)

Review `~/.claude/skills/*`, `~/.claude/CLAUDE.md` and its imports, and `~/.claude/agents/` with the same rubric, but **write no changes**. Instead produce `GLOBAL_UPDATE_PLAN_<YYYY-MM-DD>.md` in the target project root containing, per finding:

- File and location
- Finding class (ROT / REDUNDANT / GAP / QUESTION) and rationale
- The concrete proposed edit — exact replacement text or a precise diff-style description, ready to apply verbatim in a later session
- Risk note: what other projects/sessions could be affected

Order the plan by impact, safe-and-obvious fixes first. End it with a one-command hint for applying it later (e.g. "open this file in any session and ask Claude to apply section N").

## Phase 5 — Report

Finish with a summary the user can act on:

1. What was changed (project-local), grouped by file, from the changelog.
2. What was proposed but not applied (path to the global update plan).
3. Open QUESTIONs needing a human decision.
4. A one-line health verdict of the setup and when to re-run this skill (after major model/harness releases, or ~quarterly).

## Re-running

The skill is idempotent by design: on a healthy setup it should produce near-zero findings. If a previous `GLOBAL_UPDATE_PLAN_*.md` exists, read it first — unapplied items either carry forward or get dropped with a stated reason.
