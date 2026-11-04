# Review rubric

Checks per asset type. Every check names the finding class it usually produces (ROT / REDUNDANT / GAP / QUESTION).

## Universal (all instruction files)

- **Dead referents** — every mentioned path, binary, script, URL, env var: verify it exists/runs. Missing → ROT. Absolute paths into other repos or venvs are high-risk; check them all.
- **Model naming** — references to specific model names/IDs: are they current-generation? Instructions like "use Opus for X" written for an older family → ROT (update) or QUESTION (if it encodes a cost preference).
- **Superseded tool guidance** — instructions describing workarounds for limitations the current harness no longer has (manual context tricks, "you cannot do X", output-format hacks for old renderers) → ROT.
- **Native-behavior narration** — step-by-step guidance for things the current model does unprompted (how to plan, how to search a codebase, "think carefully", generic code-quality sermons) → REDUNDANT. One sentence of project-specific constraint beats a page of generic method.
- **Duplication** — same fact in 2+ files → REDUNDANT everywhere except its canonical home; replace with a pointer.
- **Contradictions** — two files giving conflicting instructions → QUESTION unless one side is provably rot.
- **Date rot** — relative dates ("recently", "the new X"), stale status sections ("currently migrating…") older than a few months → QUESTION.

## CLAUDE.md / AGENTS.md

- **Context budget** — loaded every session. Anything only needed for specific tasks → GAP: move to a card/skill with a routing line.
- **`@` imports** — resolve each one; broken import → ROT. Imports nest at most four hops deep, and relative paths resolve from the importing file, not the cwd → a chain deeper than four, or a path written relative to the cwd, is ROT. `@` inside code spans and fenced blocks is not an import.
- **AGENTS.md** — Claude Code reads it natively only when no CLAUDE.md exists in the working directory or above. If both exist and AGENTS.md holds shared content, CLAUDE.md must `@AGENTS.md` it, or that content never loads → ROT. Content duplicated in both → REDUNDANT.
- **Routing quality** — if the project has a card index (or another routing manifest such as `AGENT_FILES/`): does every entry link to a real file, and does each name a *trigger situation* rather than a topic? Dead link or orphan card → ROT; topic-style trigger → GAP; large doc pile with no index → GAP.
- **Eager imports of lazy docs** — an `@path` reference to a card, `CLAUDE_full.md`, or any other file meant to load on demand is an import that loads it every session → ROT: replace with a plain path or markdown link plus a "read when…" condition.
- **Known stack** — a card that only restates a mainstream framework, library or design pattern used the standard way (how go_router works, what a singleton is) → REDUNDANT: replace it with one line in a "Known stack" section of CLAUDE.md naming the concept, its paths, and any local twist. A Known stack line that needs a paragraph to be accurate → GAP: promote it to a card. Show the user each card before deleting it.
- **Hooks vs prose** — "always/never/before each X" behavioral rules in prose that the harness could enforce via hooks or permission settings → GAP (note it; implement only if mechanical).

## Skills (SKILL.md)

- **Frontmatter** — `name` (kebab-case, matches dir), `description` present and trigger-rich: says *when to use*, covers indirect phrasings, mentions the trigger command if any. Vague one-liner → GAP.
- **Progressive disclosure** — SKILL.md body should be scannable (roughly a screen or two); long templates, question banks, checklists belong in sibling files referenced from the body. Monolith → REDUNDANT (restructure).
- **Runnability** — commands in the skill: run the cheap ones (`--help`, `--version`). Broken invocation → ROT. Hard-coded interpreter/venv paths → ROT-prone; prefer project-relative or documented setup.
- **Overlap with built-ins** — a local skill duplicating a built-in or plugin skill that now exists → QUESTION (deprecate?).
- **Orphan skills** — skill for a feature/workflow the project no longer has → QUESTION.

## Agents (.claude/agents/*.md)

- Frontmatter valid (`name`, `description`, optional `tools`, `model`); description states delegation criteria clearly.
- `model` pins to an old model → ROT (update or remove to inherit).
- `tools` lists tools that no longer exist or omits ones the agent's task now needs → ROT/GAP.
- Agent whose job the main loop now does well solo → QUESTION.

## Commands (.claude/commands/*.md)

- Commands are the legacy mechanism; skills supersede them for anything with logic. Non-trivial command → GAP: convert to a skill. Trivial prompt-alias → leave.

## Settings & hooks (.claude/settings*.json)

- Valid JSON; hook scripts exist and are executable → else ROT.
- **Path rules** — every file-editing tool checks `Edit(...)` rules; `Write(...)` and `NotebookEdit(...)` path rules are accepted but never consulted → ROT: rewrite as `Edit(...)`. `../` is not a documented path form → ROT: use an absolute `//path` in `settings.local.json`, or a hook that resolves the path.
- **Skill symlinks** — a project `.claude/skills/<name>` that is a symlink into a home directory breaks for collaborators and fresh clones → ROT: replace with a committed copy.
- Hooks calling moved/renamed binaries (e.g. command wrappers or proxies the hook rewrites through) → verify with `which`.
- Permission allowlist entries for tools/commands no longer used → REDUNDANT (list them, don't silently remove — QUESTION if unsure).
- MCP servers configured but unreachable → QUESTION (may be environment-specific).

## Global setup (report-only, Phase 4)

All checks above, plus:

- **Blast radius** — for each proposed change, note which kinds of projects rely on it. A global skill's description change affects triggering everywhere.
- **Global vs local placement** — skills default to project level. A global skill that is domain-specific (refactoring, design tokens, a framework, a document type) rather than wanted in every project → GAP: propose copying it into the projects that use it (`.claude/skills/`, committed) and removing the global copy once none rely on it. A project that uses a global-only skill → GAP in that project (Phase 3: copy it in). A global plugin install that a project depends on → propose `--scope project`. Project instruction duplicated across many CLAUDE.md files → propose promoting to global.
- **Index/registration consistency** — global CLAUDE.md mentions of skills/triggers must match skills actually present in `~/.claude/skills/`.
