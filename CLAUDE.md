# VPS Agent Manager

GitHub-issue-driven autonomous agent system on `ai.memention.net` (Ubuntu 24.04, x86_64).

## How it works

1. A **GitHub Webhook** fires when a new issue is opened on `epatel/vps-ai`
2. The **webhook receiver** (`webhook-receiver.py`) validates the HMAC signature and dispatches the event
3. It runs `monitor-issues.sh` which fetches the issue details from GitHub
4. For each new issue, it creates `issues/issue-N.md` and spawns `run-agent.sh`
5. `run-agent.sh` pulls latest `main`, creates an isolated **git worktree** at `.worktrees/issue-N/`, and runs Claude there
6. A comment is posted on the issue that the agent has started
7. After the agent finishes, it pushes the `issue-N` branch and creates a **PR** for review
8. Posts the agent's summary as a comment on the GitHub issue and closes it
9. When a PR is merged (or code is pushed to main), the webhook triggers `git pull` on the server
10. A **post-merge git hook** auto-restarts services and rebuilds Flutter web apps when their source files change

## Directory structure

```
├── CLAUDE.md                 <- this file
├── webhook-receiver.py       <- HTTP webhook server (behind nginx)
├── monitor-issues.sh         <- fetches issue & spawns agent
├── run-agent.sh              <- agent runner (worktree + post-processing)
├── github-helper.py          <- GitHub API helper (comments, PRs, close)
├── post-progress.sh          <- lets agents post progress to issues
├── setup-hooks.sh            <- installs git hooks from hooks/
├── setup-server.sh           <- one-time server provisioning
├── hooks/
│   └── post-merge            <- restarts services + rebuilds Flutter apps
├── .system-prompt.md         <- system prompt given to every agent
├── .env.issues               <- config (gitignored)
├── .gitignore
├── issues/                   <- issue tracking files (issue-N.md)
├── projects/                 <- project directories
└── .worktrees/               <- temporary agent worktrees (gitignored)
```

## Setup after cloning

```bash
# One-time server setup
sudo bash setup-server.sh

# Or manually:
# Install git hooks
bash setup-hooks.sh

# Create .env.issues
cat > .env.issues << 'EOF'
GITHUB_TOKEN=<fine-grained-pat>
GITHUB_REPO=epatel/vps-ai
WEBHOOK_SECRET=<random-secret>
EOF
chmod 600 .env.issues
```

### GitHub token permissions (fine-grained PAT)

- **Issues**: Read and write
- **Pull requests**: Read and write
- **Contents**: Read and write

## Agent execution environment

- Claude runs inside an isolated git worktree: `.worktrees/issue-N/`
- Working directory is the worktree root (a copy of `main`)
- The agent is on branch `issue-N` — it must NOT switch branches
- System prompt is loaded from `.system-prompt.md`
- The agent has `--dangerously-skip-permissions` (full autonomy)

## Services

Services are managed via systemd. The post-merge hook automatically restarts
them when their project files change on merge/pull.

To add a new service, edit `hooks/post-merge` and add an entry to `SERVICE_MAP`:
```bash
["projects/my-project"]="my-service"
```
Then run `bash setup-hooks.sh` to reinstall the hook.

## Flutter web projects

Flutter web apps are built **on the server**, not in CI or by agents. The post-merge
hook auto-detects any `projects/*/` directory with a `pubspec.yaml` and rebuilds it
when source files (`lib/`, `web/`, `pubspec.*`) change.

- Build output (`build/`) is **gitignored** — never commit it
- The `--base-href /<project-name>/` flag is applied automatically
- CI (`.github/workflows/build-flutter-web.yml`) validates builds on push/PR but does not deploy
- Adding a new Flutter project requires no config changes — just create it under `projects/`

## Landing page

The root URL (`/`) serves `projects/landing/index.html` — a static page with clickable
cards linking to each project. When adding a new project:

1. Add a card to `projects/landing/index.html` inside the `<div class="cards">` block
2. Use a `data-path` attribute on the status dot to match the service path in `projects/status-page/server.py`
3. For projects not served through nginx (e.g. Poem), link to the GitHub source and omit the status dot
4. Pick a badge type: `game`, `app`, `tool`, or `api`

The page fetches `/status/json` to show live status dots (green/orange/red) on each card.

## Configuration (`.env.issues`)

```
GITHUB_TOKEN=<fine-grained-pat>
GITHUB_REPO=epatel/vps-ai
WEBHOOK_SECRET=<random-secret>
# Optional:
# HOST_DESCRIPTION=<custom-description>
```

## Webhook setup

Add a webhook on `epatel/vps-ai` repo settings:
- **URL:** `https://ai.memention.net/webhook`
- **Content type:** `application/json`
- **Secret:** matches `WEBHOOK_SECRET` in `.env.issues`
- **Events:** Issues, Pull requests, Pushes

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
