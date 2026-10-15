# Setup changelog

Changes to `https://ai.memention.net/setup` and its pattern cards that an existing project may need to act on. Newest first. Read by the setup's refresh mode (entries with a version greater than the project's `.claude/agent-setup.json`) and update mode (all entries, as a checklist).

Each entry: a version heading, then one item per change with `Affects:` (pattern IDs from the setup's table, `copied:<path>`, or `all`) and `Action:` (what to do in a project that applied it — "none" if the change needs no project edits).

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
