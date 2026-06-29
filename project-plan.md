# Project Plan: VPS Agent Manager (ai.memention.net)

## Goal
Maintain a reliable, GitHub-issue-driven autonomous agent system on
`ai.memention.net` that turns issues into reviewed PRs, and that hosts a
growing set of small web apps/games and Python services under `projects/`.
Every change keeps the issue→worktree→PR→deploy pipeline working and keeps
`CLAUDE.md`/`README.md` in sync with the code.

## Non-goals
- Refactoring or rewriting the individual `projects/*` apps unless an issue asks for it.
- Documenting the issue-authorization key scheme or `public.pem` in `CLAUDE.md`/`README.md` (intentionally kept out of public docs).
- Requiring Flutter on the server (Flutter web builds happen in GitHub Actions).

## Milestones
- [ ] (ongoing) Keep the webhook → monitor → run-agent → PR pipeline healthy
- [ ] (ongoing) Keep the status page + landing page accurate as projects are added
- [ ] (ongoing) Keep docs (`CLAUDE.md`, `README.md`) in sync with system changes

## Decisions
- 2026-06-29 — Adopted structured-docs patterns from `ai.memention.net/setup`:
  Shared Project Plan, Context Cards, and Agent Skills. Locked.
- 2026-06-29 — Installed all 8 project-scoped skills from `epatel/agent-skills`
  under `.claude/skills/` (adt-types, backward-planning, clean-modules,
  design-system, focused-refactor, makefile-actions, project-discovery,
  state-machines). Useful when agents work on the separate `projects/*`. Locked.

## Current state / handoff
Initial project plan created as part of applying the `ai.memention.net/setup`
patterns. Context cards live under `cards/` (indexed from `CLAUDE.md`). Agents
working an issue should read this file first and update Current state +
Decisions before finishing.

## Open questions
- None currently.
