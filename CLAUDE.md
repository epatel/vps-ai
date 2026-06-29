# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# VPS Agent Manager

GitHub-issue-driven autonomous agent system on `ai.memention.net` (Ubuntu 24.04,
x86_64). A new issue on `epatel/vps-ai` becomes a git-worktree agent run that
opens a reviewed PR; merged changes are pulled and deployed on the server.
Stack: Python + shell orchestration, with independent apps/games/services under
`projects/`.

Always read @project-plan.md before starting — it holds the shared goal and
current state for work fanned out across issue-driven agents.

## Context Cards

Lazy-loaded reference cards under `cards/`. Open one when its trigger matches:

- [architecture](cards/architecture.md) — how the issue→worktree→PR→deploy pipeline fits together, components, systemd services
- [server-setup](cards/server-setup.md) — provisioning, GitHub PAT, `.env.issues`, webhook configuration
- [deploy-pipeline](cards/deploy-pipeline.md) — post-merge hook + Flutter-web GitHub Actions build and restricted-key rsync deploy
- [nginx-conventions](cards/nginx-conventions.md) — serving a project through nginx, location-block rules
- [status-page](cards/status-page.md) — registering a project with the status monitor and the `/status/log` event endpoint
- [landing-page](cards/landing-page.md) — the root landing page and adding a project card

## Agent execution environment

- Claude runs inside an isolated git worktree: `.worktrees/issue-N/`
- Working directory is the worktree root (a copy of `main`)
- The agent is on branch `issue-N` — it must NOT switch branches
- System prompt is loaded from `.system-prompt.md`
- The agent has `--dangerously-skip-permissions` (full autonomy)

## Logs

All gitignored:
- `.issues-monitor.log` — webhook and issue processing activity
- `.agent-issue-N.log` — full agent wrapper output
- `.agent-issue-N.output` — raw Claude output (used for comment extraction)

## Manual commands

```bash
# Run monitor manually for a specific issue
bash monitor-issues.sh <issue_number>

# Watch logs
tail -f .issues-monitor.log
tail -f .agent-issue-N.log

# Reinstall git hooks after editing hooks/
bash setup-hooks.sh
```

## Keeping documentation up to date

When you change how the system works, update both `CLAUDE.md` (and the relevant
`cards/` file) and `README.md` in the same change so they stay in sync with the
code:

- `CLAUDE.md` + `cards/` — guidance for agents working in this repo (internal detail, conventions)
- `README.md` — public-facing overview of the system

This applies to changes such as: new/renamed scripts or services, directory
structure changes, the issue/webhook flow, the deploy pipeline, nginx/systemd
conventions, and adding a new project.

**Do not document the issue-authorization key scheme or `public.pem` in
either file** — that mechanism is intentionally kept out of the public docs.
