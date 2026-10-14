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
- **`@` imports** — resolve each one; broken import → ROT.
- **Routing quality** — if the project has a card index (or another routing manifest such as `AGENT_FILES/`): does every entry link to a real file, and does each name a *trigger situation* rather than a topic? Dead link or orphan card → ROT; topic-style trigger → GAP; large doc pile with no index → GAP.
- **Eager imports of lazy docs** — an `@path` reference to a card, `CLAUDE_full.md`, or any other file meant to load on demand is an import that loads it every session → ROT: replace with a plain path or markdown link plus a "read when…" condition.
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
- Hooks calling moved/renamed binaries (e.g. command wrappers or proxies the hook rewrites through) → verify with `which`.
- Permission allowlist entries for tools/commands no longer used → REDUNDANT (list them, don't silently remove — QUESTION if unsure).
- MCP servers configured but unreachable → QUESTION (may be environment-specific).

## Global setup (report-only, Phase 4)

All checks above, plus:

- **Blast radius** — for each proposed change, note which kinds of projects rely on it. A global skill's description change affects triggering everywhere.
- **Global vs local placement** — global skill used by only one project → propose moving it local; project instruction duplicated across many CLAUDE.md files → propose promoting to global.
- **Index/registration consistency** — global CLAUDE.md mentions of skills/triggers must match skills actually present in `~/.claude/skills/`.
