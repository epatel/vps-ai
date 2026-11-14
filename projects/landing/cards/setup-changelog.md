# Setup changelog

Changes to `https://ai.memention.net/setup` and its pattern cards that an existing project may need to act on. Newest first. Read by the setup's refresh mode (entries with a version greater than the project's `.claude/agent-setup.json`) and update mode (all entries, as a checklist).

Each entry: a version heading, then one item per change with `Affects:` (pattern IDs from the setup's table, `copied:<path>`, or `all`) and `Action:` (what to do in a project that applied it — "none" if the change needs no project edits).

## 2026-11-14.4

### Agent skills come from release tags; the record keeps `skills_release`
- Affects: skill:*
- Action: agent-skills now publishes releases tagged `vYYYY.MM.DD`, and the setup copies skills from the latest tag instead of `main`. The first release is `v2026.11.14`.
  - For each skill in `applied`, compare `.claude/skills/<name>` with that release.
  - A skill named in the items below: copy it again from the release. Replace it if unedited; otherwise propose a merge.
  - Any other skill that differs: show the diff and ask before replacing it.
  - Then record `"skills_release": "v2026.11.14"` in `.claude/agent-setup.json`.

### project-discovery: exact dependency pins, rebuild on change, Python 3.10+
- Affects: skill:project-discovery
- Action: copy `project-discovery` again from release `v2026.11.14`. Replace it if unedited; otherwise propose a merge. Its `requirements.txt` now pins exact versions tested together (PyYAML 6.0.3, tree-sitter 0.26.0, tree-sitter-language-pack 1.22.1), which need Python 3.10+. The skill keeps a copy of the pins inside its venv and asks to rebuild the venv when they differ. A `.venv-tools/project-discovery/` built before this change has no such copy, so the skill asks to rebuild it once. No other project edits.

### code-health: pin the release's commit, not its tag
- Affects: code-health
- Action: a tag can be moved after the fact; a commit cannot. Resolve the commit of the tag the project already pins, for example `git ls-remote https://github.com/epatel/ai-health "refs/tags/v0.3.1" "refs/tags/v0.3.1^{}" | sort -k2 | tail -1 | cut -f1`.
  - Change the committed pin from `@<tag>` to `@<SHA>  # <tag>`: in dev requirements, or the install command in the `## Code health` section of `CLAUDE.md`.
  - In the setup record, set the `aihealth` entry's `pin` to the SHA and `min` to the tag's version.
  - It is the same release, so no reinstall and no score change. Show the diff first. If the project has its own tooling that writes the pin (a re-pin script, a Makefile target), point it at the commit too.

## 2026-11-14.3

### Checker: AGENTS.md, ~~~ fences, `*` index lines
- Affects: all
- Action: none required. `check-agent-docs.py` now reads a card index kept in `AGENTS.md`, checks `@` imports in `AGENTS.md` files, ignores `~~~` fenced examples, accepts `* [name](cards/…)` index lines, and no longer treats `.claude/CLAUDE.md` as a per-feature doc. A project whose index lives in `AGENTS.md` stops getting "card is not in the index" warnings. Re-run it in Step 4 as usual and act on any new ERROR.

### hooks-over-prose: Bash rules match the text as written; Stop hooks need a loop guard
- Affects: hooks-over-prose
- Action: check the project's `.claude/settings.json`:
  - **Bash deny rules that guard a command with several spellings** (such as `Bash(git push --force:*)`, which misses `git push -f` and `git push origin main --force`): tell the user, and propose the card's `PreToolUse` hook (`no-force-push.sh`) or a similar one. Show the diff and apply it only after a yes.
  - **Stop hooks that exit `2`:** each must exit `0` when the input's `stop_hook_active` is true. Propose that guard for any that lack it.

### standing-defaults: migration runner refuses a newer database; no transaction control inside steps
- Affects: standing-defaults, copied:cards/standing-defaults.md
- Action: refresh the copied card. If its hash matches the record, show the diff and replace it; otherwise propose a merge. Record the new hash either way. Then look for a `migrate()` in the project that was copied from the card. Propose the version check: raise when `user_version > len(MIGRATIONS)`. Show the change and apply it only after the user's yes. Also flag any migration step that contains `BEGIN`/`COMMIT`/`ROLLBACK`, `VACUUM`, or `PRAGMA foreign_keys`/`journal_mode`; the card explains why those break the runner.

### review-agentic-setup: setup versions compare numerically
- Affects: skill:review-agentic-setup
- Action: copy `review-agentic-setup` again from `https://github.com/epatel/agent-skills`. Replace the directory if the project did not edit it; otherwise propose a merge. Versions now compare by date, then the same-day suffix as a number (`2026-11-13.10` is newer than `2026-11-13.2`). The setup's own record section says the same. No other project edits.

## 2026-11-14.2

### review-agentic-setup: report-only mode, used by the setup before scoping
- Affects: skill:review-agentic-setup
- Action: copy `review-agentic-setup` again from `https://github.com/epatel/agent-skills`. Replace the directory if the project did not edit it; otherwise propose a merge. The skill has a report-only mode (`--report-only`) that runs the inventory, review and report, writes nothing, and lists every fix as a proposed change. The setup's update mode now runs it this way before presenting scope, and applies only the fixes the user confirms. No other project edits.

### review-agentic-setup: old copies that review ~/.claude
- Affects: skill:review-agentic-setup
- Action: check the project's `.claude/skills/review-agentic-setup/SKILL.md`. If it mentions a "global update plan", a `GLOBAL_UPDATE_PLAN` file, or a Phase that reviews `~/.claude`, it predates 2026-11-13.2. Copy the skill again; the item above covers how. If `GLOBAL_UPDATE_PLAN_*.md` files or a matching line in `.git/info/exclude` remain from an earlier run, tell the user. They are the user's to keep or delete; do not remove them.

### project-discovery: project-local tool venv, asks before installing
- Affects: skill:project-discovery
- Action: copy `project-discovery` again from `https://github.com/epatel/agent-skills`. Replace the directory if the project did not edit it; otherwise propose a merge. The skill now asks before installing its dependencies, and puts them in `.venv-tools/project-discovery/` in the project instead of `~/.cache/project-discovery/venv`. Propose adding `.venv-tools/` to `.gitignore` if it is not ignored. If `~/.cache/project-discovery/venv` exists, tell the user it is no longer used; do not delete it.

### agent-skills is MIT licensed
- Affects: skill:*
- Action: none. The skills you copied may now be reused under the MIT licence (`LICENSE` in `https://github.com/epatel/agent-skills`). `ste-writing` keeps its own MIT notice in `ste-writing/LICENSE.txt`.

### Feature-First: only for code that already has a pipeline or hook engine
- Affects: feature-first, feature-first-advanced
- Action: the pattern now applies only when the code has an explicit pipeline, middleware or hook engine, and every documented node, context key and hook must be traceable to code. Check each per-feature `CLAUDE.md` / `CLAUDE_full.md`. List any node, context key or hook you cannot find in the code, and propose removing it or marking it as planned; show the diff and apply only with the user's yes. If the project has no such engine at all, say so and ask whether to keep the docs. Do not delete them unasked.

## 2026-11-14

### Installing tools: detect, check the version, ask whether and where
- Affects: all
- Action: the setup has a new *Installing tools* section in Step 3, and cards that need tools have a `## Requires` table. Nothing is installed without the user's yes, and the user chooses where. Collect the tools the record's applied patterns use (code-health: python 3.11+, git 2.24+, aihealth; hook scripts from hooks-over-prose: whatever they call). Run detection for each tool and report what was found. Write a `tools` entry in `.claude/agent-setup.json` for each (`pattern`, `min`, `pin` if pinned, `form`), describing how the project already gets the tool; do not install or move anything to fit. Offer an install only for a tool that is missing or older than its minimum, using the location options in *Installing tools*.

### code-health: no automatic global install; separate tool venv on a dependency clash
- Affects: code-health
- Action: the card now detects an existing aihealth (project `.venv/`, then `PATH`) and asks before installing. When aihealth's dependencies clash with the project's, it offers `.venv-tools/` instead of a global install. A project already on the global form keeps it: record `"form": "user"` or `"existing"`, and do not move it unless the user asks. A project using the project venv needs no edits beyond the `tools` entry.

### hooks-over-prose: hook examples check their tools
- Affects: hooks-over-prose
- Action: the example hook now exits 0 when `jq` or the formatter is missing (`command -v … || exit 0`, `[ -x … ]`). Check the project's own hook scripts under `.claude/hooks/`. For each tool a script calls without such a guard, propose adding one (show the diff), so a fresh clone without the tool is not blocked.

## 2026-11-13.2

### review-agentic-setup: project scope only
- Affects: skill:review-agentic-setup
- Action: re-copy `review-agentic-setup` from `https://github.com/epatel/agent-skills` (replace the directory if the project did not edit it, else propose a merge). The skill no longer reviews `~/.claude` or writes a `GLOBAL_UPDATE_PLAN_*.md`, so it no longer offers a global review either. It still copies a skill found only in `~/.claude/skills/` into the project. If the project has a `GLOBAL_UPDATE_PLAN_*.md` and a matching line in `.git/info/exclude` from an earlier run, tell the user. Those files are theirs to keep or delete. No other project edits.

## 2026-11-13

### code-health: Go supported (aihealth 0.3.0)
- Affects: code-health
- Action: aihealth 0.3.0 scores Go. If the project applied code-health and has Go code, propose moving the pin to the latest tag (`git ls-remote --tags --refs https://github.com/epatel/ai-health | sed 's|.*/||' | sort -V | tail -1`): reinstall into `.venv/`, update the committed pin, and save a scan before and after (`--save`) so `aihealth history` marks the version. An older install silently skips `.go` files. If the project declined code-health because it is mostly Go, offer it again. Projects without Go code need no action; the upgrade does not change other languages' scores.

## 2026-11-08

### code-health: install in the project's venv, pinned to a release
- Affects: code-health
- Action: aihealth now has tagged releases (a new minor version can change scores) and recommends a project-venv install. Check the project's form. With the global form (`"command": "aihealth"` in `.mcp.json`, `command -v aihealth` hooks), propose switching to the venv form from `https://ai.memention.net/cards/code-health.md`: install into `.venv/` at the latest tag, point `.mcp.json` and both hooks at `.venv/bin/aihealth` with the `[ -x … ]` guard, commit the pin (dev requirements, or the install command in the `## Code health` section of `CLAUDE.md`), and use `.venv/bin/aihealth` there. Show the diff of each file first. Keep the global form only if aihealth's dependencies clash with the project's; then still pin the install to the latest tag. Either way, if `aihealth --version` says `0.1.0`, the install predates the first release and may skip shell, C and C++ files. Save a scan (`--save`) after the change so `aihealth history` marks the version.

## 2026-11-07

### New pattern: Code Health Feedback
- Affects: new pattern `code-health`
- Action: offer it, experimental. Recommend it when agents regularly change code in a language aihealth supports (Python, Dart/Flutter, Swift, Rust, TypeScript/JavaScript, C, C++, Objective-C, shell, Make, CMake); recommend declining for documentation-only repos and projects mostly in other languages. If accepted, follow `https://ai.memention.net/cards/code-health.md`: add the `aihealth` server to `.mcp.json`, merge its two guarded hooks into `.claude/settings.json`, add the short `## Code health` section to `CLAUDE.md`, and report a baseline scan. Ask before installing the CLI. No other project edits.

## 2026-11-04.3

### review-agentic-setup: reports when the setup record is behind
- Affects: skill:review-agentic-setup
- Action: re-copy `review-agentic-setup` from `https://github.com/epatel/agent-skills` (replace the directory if the project did not edit it, else propose a merge). It now compares `.claude/agent-setup.json`'s `version` with the live setup's `Version:` line. When the record is older, it lists the pending changelog items that apply to the project under "Setup refresh due" and points to refresh mode. It still applies none of them itself. Before this, a review ran on an outdated project said nothing about re-copied or new skills. No other project edits.

## 2026-11-04.2

### New skills: double-check, minimal-repro
- Affects: skill:*
- Action: offer each skill that is in neither `applied` nor `declined`, in the refresh summary; install only those the user accepts (copy the directory from `https://github.com/epatel/agent-skills` into `.claude/skills/`, commit it, record `skill:<name>` in `applied`, and record declined ones in `declined`). `double-check` reviews a change for completeness, correctness, safety and simplicity, then verifies it. Recommend it for any project where agents make code changes. `minimal-repro` builds a small separate program with the project's versions to reproduce a bug, test a fix or probe an API. Recommend it when the project depends on libraries or frameworks whose behaviour is hard to test in place. No other project edits.

## 2026-11-04

### focused-refactor, backward-planning, state-machines trimmed; review-agentic-setup global review on request
- Affects: skill:focused-refactor, skill:backward-planning, skill:state-machines, skill:review-agentic-setup
- Action: re-copy each installed skill named above (replace the directory if the project did not edit it, else propose a merge). `focused-refactor` and `backward-planning` keep the same method, output format and anti-patterns in about half the length. `state-machines` drops the diagram that repeated its example transition table. `review-agentic-setup` now reviews `~/.claude` (Phase 4, the global update plan) only when the user asks for it, and otherwise offers it in one line. No other project edits.

## 2026-10-23

### review-agentic-setup: leaves upstream files alone, checks Known Stack
- Affects: skill:review-agentic-setup
- Action: re-copy `review-agentic-setup` from `https://github.com/epatel/agent-skills` (replace the directory if the project did not edit it, else propose a merge). It now reads `.claude/agent-setup.json` and reports, instead of editing, findings in skills recorded as `skill:<name>` and in files under `copied`, which a refresh would overwrite. Its rubric flags cards that only restate a mainstream framework (demote to a Known stack line) and Known stack lines that need a paragraph (promote to a card). The global update plan is excluded from git via `.git/info/exclude`. No other project edits.

### Structure skills trimmed to their rules; fixes
- Affects: skill:adt-types, skill:state-machines, skill:clean-modules, skill:focused-refactor
- Action: re-copy each installed skill named above (replace the directory if the project did not edit it, else propose a merge). The three structure skills drop textbook material the model already knows and keep their rules, output formats and anti-patterns. `state-machines`' example now gives every reachable state a row. `clean-modules` no longer suggests clippy for boundary rules. `focused-refactor` Phase 5 now says to fix production code when a characterization test catches a real behavior change. No other project edits.

### design-system: `color-scheme` in CSS themes; ste-writing license
- Affects: skill:design-system, skill:ste-writing
- Action: re-copy each installed skill named above. In a `tokens.css` made from `design-system`, add `color-scheme: light;` to the `:root` block and `color-scheme: dark;` to both dark blocks, so native controls and scrollbars follow the theme. `ste-writing` now ships the MIT `LICENSE.txt` of the text it adapts; no project edits.

## 2026-10-21

### makefile-actions: quote `$(MAKE)` in the menu
- Affects: skill:makefile-actions
- Action: re-copy `makefile-actions` from `https://github.com/epatel/agent-skills` (replace the directory if the project did not edit it, else propose a merge). In a Makefile made from it, change `select` to call `"$(MAKE)" --no-print-directory menu`, with the quotes: on macOS `$(MAKE)` can expand to an Xcode path containing a space, and the numbered menu then fails with "bash: /Applications/Xcode: No such file or directory".

## 2026-10-16.3

### Known Stack pattern added
- Affects: new pattern `known-stack`
- Action: offer it, experimental. Recommend it when the project is built mostly from mainstream frameworks and patterns used the standard way. Then add a Known stack section to `CLAUDE.md` (one line per concept, with paths and the local twist), and propose removing architecture or domain cards that only restate those concepts. Show the user each card before deleting it. Recommend declining when the architecture is mostly bespoke.

### Maintenance rule scoped to commits
- Affects: context-cards
- Action: in the rule below the card index, replace "When a change adds … update or add the card in the same change" with "When you commit a change that adds … update or add the card in that commit", and add "Proposed diffs and answers need no card edits." The old wording made agents add card edits to every diff they proposed. Keep the rest of the rule.

## 2026-10-16.2

### project-discovery: real dependencies, more languages
- Affects: skill:project-discovery
- Action: re-copy `project-discovery` from `https://github.com/epatel/agent-skills`. Its summary's "External deps" listed imported names and standard-library modules (`Path`, `json`) instead of third-party packages, and it pruned calls into the project's own modules imported via `sys.path` as external. It now also indexes Kotlin, Swift, Dart, C#, PHP, Scala, Lua and Arduino `.ino` (as C++). No other project edits.

## 2026-10-16

### Updated agent-skills: review rubric, Makefile template, design-system without cards
- Affects: skill:review-agentic-setup, skill:makefile-actions, skill:design-system, skill:state-machines, skill:backward-planning, skill:clean-modules, skill:adt-types, skill:ste-writing
- Action: re-copy each installed skill named above from `https://github.com/epatel/agent-skills` (replace the directory if the project did not edit it, else propose a merge). `review-agentic-setup` now checks `Write(...)` path rules, `../` paths, import depth, AGENTS.md loading and symlinked skills. In a Makefile made from `makefile-actions`, change `select` to call `$(MAKE) --no-print-directory menu` instead of `make menu`. The other skills changed wording and diagrams only.

### Skills install at project level only
- Affects: skill:*
- Action: if the project relies on a skill from `epatel/agent-skills` that exists only in `~/.claude/skills/` (it triggers here but has no `.claude/skills/<name>`), copy it into `.claude/skills/`, commit it and record it as `skill:<name>`. Tell the user the personal copy can be removed once no other project relies on it; do not change `~/.claude/` yourself. Install plugins from `anthropic-agent-skills` with `--scope project` only.

## 2026-10-15

### Refresh with nothing to do no longer asks
- Affects: all
- Action: none. When a refresh finds nothing to apply, offer or ask, the agent shows the summary and updates the record without waiting for confirmation.

## 2026-10-14.2

### Anthropic's skills marketplace as a second skill source
- Affects: all
- Action: if the project's work matches a plugin from `anthropics/skills` (web frontend → `example-skills`; office documents → `document-skills`; Claude API code → `claude-api`) and the user does not already have its skills available from any source (a user-scope install, another marketplace, or skills built into their Claude account), offer to enable it in `.claude/settings.json` (setup Step 3, Agent Skills). Otherwise skip without asking. Record the answer as `plugin:<name>@anthropic-agent-skills` in `applied` or `declined`.

## 2026-10-14

First versioned release; the setup now writes `.claude/agent-setup.json` and supports refresh mode.

### Setup record and refresh mode
- Affects: all
- Action: write `.claude/agent-setup.json` at the end of the run (format at the end of the setup file). Projects set up before this normally have no record and run in update mode once (a record older than this entry is still valid: refresh takes every entry); from then on, re-reading the setup refreshes them.

### `@CLAUDE_full.md` defeated the two-tier split
- Affects: two-tier
- Action: in every slim per-feature `CLAUDE.md`, replace `@CLAUDE_full.md` with a plain-path pointer and a condition, e.g. "Before adding a hook or changing a node, read `CLAUDE_full.md` in this directory". An `@` reference is an import and loaded the full contract every time. Keep slim files under ~15 lines.

### Cards must be linked, never `@`-imported
- Affects: context-cards
- Action: in the card index, replace any `@cards/<name>.md` with a markdown link `[name](cards/name.md) — trigger`.

### Maintenance rule below the card index
- Affects: context-cards
- Action: if the index has no rule telling agents to keep cards current, add this below it:
  > When a change adds non-obvious logic, settles an architectural choice, or makes a card above wrong, update or add the card in the same change and keep this index in sync. Cards stay self-contained: no card links to another.

### Commands block in CLAUDE.md
- Affects: context-cards
- Action: if `CLAUDE.md` has no commands section, add one under the overview: the exact commands to set up, run, test (including a single test), lint and build, taken from the Makefile, package scripts, CI config or README. Run each cheap one before writing it down. If the project has none you can discover, ask the user for them — never invent commands. Do not restructure an existing overview just to match the template.

### Migration runner was not transactional
- Affects: standing-defaults, copied:cards/standing-defaults.md
- Action: update the copied card to the current one (replace it if its hash in the record still matches; propose a merge if the project edited it). In project code that used the old example (`with conn:` around `executescript`), wrap each migration as `BEGIN; <sql>; PRAGMA user_version = N; COMMIT;` in one `executescript` call and roll back on error — `executescript` commits first and ignores `with conn:`, so a failed migration left the schema half-changed. Show the user before changing code.

### Hooks Over Prose pattern added
- Affects: new pattern `hooks-over-prose`
- Action: offer it; recommend it when CLAUDE.md contains "always / never / before every" rules a script could check, otherwise recommend declining. Use `Edit(...)` permission rules (a `Write(...)` path rule is never checked); for sibling directories use a hook, since `../` is not a documented path form.

### Skills: copy into the project, and they live-reload
- Affects: skill:*
- Action: project skills under `.claude/skills/` must be real directories, not symlinks into a home directory — replace any symlink with a copy and commit it. No new session is needed after installing a skill; run `/reload-skills` only if `.claude/skills/` did not exist when the session started. Re-copy `project-discovery` if installed: it no longer depends on a machine-specific path.

### Verifier script
- Affects: all
- Action: run `check-agent-docs.py` (setup Step 4) and fix every ERROR. It catches broken and eager `@` imports, dead or missing index entries, card-to-card links and size limits. Never commit a `CLAUDE.md` under test fixtures — Claude Code loads it as a real instruction.

### AGENTS.md is read natively
- Affects: all
- Action: none required. If the project keeps shared instructions in `AGENTS.md`, a separate `CLAUDE.md` is only needed for Claude-specific lines (it imports `@AGENTS.md`).
