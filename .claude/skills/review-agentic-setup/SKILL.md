---
name: review-agentic-setup
description: Review and modernize a project's agentic setup — CLAUDE.md / AGENTS.md, agent docs (cards/ index, per-feature CLAUDE.md / CLAUDE_full.md, project-plan.md), local .claude/ skills, agents, commands, and hooks — against the capabilities of the model currently running this skill. Applies updates to project-local files only; it never reviews or edits ~/.claude. Use when the user asks to review, refresh, audit, or modernize the agentic/Claude setup of a project, when instruction files reference outdated models or tools, or periodically as models and tooling improve. Trigger: /review-agentic-setup [path]
---

# Review Agentic Setup

Agentic setups (instruction files, skills, agent docs) are written against the models and tools that existed at the time. Models and harnesses improve continuously, so these files rot: they over-explain things newer models do natively, reference removed tools or renamed features, hard-code paths that moved, and miss capabilities that didn't exist yet.

**You — the model running this skill right now — are the reference.** Review every instruction against what you actually need and what your harness actually supports today. Do not preserve guidance just because it was once correct.

Target: the project at `[path]` if given, else the current working directory.

## Ground rules

- **Project-local files: apply updates directly.** Surgical edits, smallest diff that fixes the finding. Never rewrite a file wholesale when editing sections will do.
- **Project scope only.** Review and change files inside the target project. Do not review, edit, move, or delete anything under `~/.claude/`: personal setup affects every project and is outside this skill. Look there only to find a skill the project depends on (Phase 3).
- **Upstream-owned files: report, don't edit.** If `.claude/agent-setup.json` exists, the project follows https://ai.memention.net/setup. Skills it records as `skill:<name>` and files under `copied` come from upstream, and a setup refresh replaces them. For those, put findings in the report as proposed upstream changes and leave the files as they are. Everything else the setup wrote (CLAUDE.md, cards it generated) is project-local.
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

Build the inventory as a table (file, kind, size, last modified) before reviewing anything. If the tree is large, prefer batch/sandboxed execution over reading raw output into context.

**Setup version.** If `.claude/agent-setup.json` exists, compare its `version` with the `Version:` line at the top of https://ai.memention.net/setup. Versions are `YYYY-MM-DD` with optional `.2`, `.3`, and compare as strings. If the record is older, read the changelog that line links to and list the entries newer than the record whose `Affects:` names something in the record's `applied` or `copied`. `skill:*` matches any applied skill, and entries that offer a new pattern or skill count too. This review does not apply them: report them under "Setup refresh due" and tell the user to run the setup's refresh mode (ask Claude to refresh the setup from https://ai.memention.net/setup). If the page cannot be fetched, say the version was not checked.

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
- Skill placement: skills belong at project level. If the project depends on a skill that exists only under `~/.claude/skills/`, copy it into `.claude/skills/` (a real directory, not a symlink) so collaborators and fresh clones get it. Mention that the personal copy is now redundant here; never remove it yourself.
- CLAUDE.md: it loads into every session — every line costs context forever. Move task-specific material into cards/skills with a routing line ("read X when doing Y") instead.
- Verify each edit: referenced paths exist, referenced commands run, `@` imports resolve, card manifest entries match actual files.
- Keep a running changelog of every edit (file, finding class, one-line rationale) for the report.

## Phase 4 — Report

Finish with a summary the user can act on:

1. What was changed (project-local), grouped by file, from the changelog.
2. What was proposed but not applied (upstream-owned files).
   If the setup record is behind, add a **Setup refresh due** line: record version → current version, plus the pending changelog items from Phase 1.
3. Open QUESTIONs needing a human decision.
4. A one-line health verdict of the setup and when to re-run this skill (after major model/harness releases, or ~quarterly).

## Re-running

The skill is idempotent by design: on a healthy setup it should produce near-zero findings.
