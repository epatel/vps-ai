<a href="https://claude.ai"><img src="made-with-claude.png" height="32" alt="Made with Claude"></a>

# VPS Agent Manager

An autonomous AI agent system that turns GitHub issues into code. Open an issue, and a Claude agent picks it up, writes the code, and either merges it directly or creates a PR for review.

Running on [`ai.memention.net`](https://ai.memention.net)

## How it works

1. Open a GitHub issue describing what you want
2. A webhook fires and the server picks it up
3. A comment is posted on the issue that the agent has started
4. Claude runs in an isolated git worktree, working on the task
5. When done, a PR is created for review
6. The agent posts a summary comment on the issue and closes it

## Architecture

```
GitHub Issue
    │
    ▼
webhook-receiver.py  ◄── nginx reverse proxy (HTTPS)
    │
    ▼
monitor-issues.sh    ◄── fetches issue, creates issue-N.md
    │
    ▼
run-agent.sh         ◄── creates worktree, runs Claude, handles output
    │
    └──► push branch + create PR
```

A post-merge git hook auto-restarts systemd services and rebuilds Flutter web apps when their source files change.

## Deploy pipeline

```mermaid
graph TD
    A[Push to main / Merge PR] --> B[GitHub sends webhook]
    B --> C[webhook-receiver.py]
    C --> D[git pull on server]
    D --> E[post-merge hook runs]
    E --> F{What changed?}
    F -->|Service files| G[systemctl restart service]
    F -->|Flutter source| H[flutter build web]
    F -->|Other files| I[No action needed]

    J[Push to main / PR opened] --> K[GitHub Actions CI]
    K --> L[Validate Flutter build]
    L --> M[Build succeeds/fails]

    style H fill:#4FC3F7,color:#000
    style G fill:#81C784,color:#000
    style L fill:#FFB74D,color:#000
```

**Key points:**
- **Build output is not stored in git** — Flutter apps are built on the server after each pull
- **CI is validation only** — GitHub Actions checks that Flutter projects compile, but does not deploy
- The `--base-href /<project-name>/` flag is applied automatically by the post-merge hook
- Adding a new Flutter project requires no workflow changes — any `projects/*/` directory with a `pubspec.yaml` is auto-detected
- The [status page](https://ai.memention.net/status) shows a live badge when a flutter build is running, including which project(s) are being built

## Setup

```bash
# One-time server provisioning
sudo bash setup-server.sh

# Create config
cat > .env.issues << 'EOF'
GITHUB_TOKEN=<fine-grained-pat>
GITHUB_REPO=epatel/vps-ai
WEBHOOK_SECRET=<random-secret>
EOF
chmod 600 .env.issues
```

Beyond that, a few things live outside this repo and must be configured by hand — see [Manual configuration](#manual-configuration) below.

## Usage

Just open an issue. The agent handles the rest.

```bash
# Manual trigger for a specific issue
bash monitor-issues.sh <issue_number>

# Watch logs
tail -f .issues-monitor.log
tail -f .agent-issue-N.log
```

## Manual configuration

### GitHub fine-grained PAT

Create a token at GitHub → Settings → Developer settings → Fine-grained personal access tokens, scoped to the `epatel/vps-ai` repo, with:
- **Issues**: Read and write
- **Pull requests**: Read and write
- **Contents**: Read and write

Put it in `.env.issues` as `GITHUB_TOKEN`.

### GitHub webhook

In the repo's **Settings → Webhooks**, create a webhook with:
- **URL:** `https://ai.memention.net/webhook`
- **Content type:** `application/json`
- **Secret:** must match `WEBHOOK_SECRET` in `.env.issues`
- **Events:** **Issues**, **Pull requests**, and **Pushes** (Issues triggers the agent; Pull requests and Pushes trigger `git pull` + the post-merge hook on the server)

### Nginx

Nginx is the single public entry point for everything on `ai.memention.net`. It handles TLS, reverse-proxies the webhook and backend services, and serves static and Flutter web projects directly from disk. The config lives at `/etc/nginx/sites-available/ai.memention.net`; `sites-enabled` is a symlink to it, so always edit the `sites-available` copy.

The config is organized as a set of `location` blocks, one per project, in front of a catch-all that serves the landing page. The block type depends on what the project is:

- **Static sites** — an `alias` pointing at the project directory
- **Flutter web apps** — an `alias` to `build/web/` plus `try_files` for SPA routing
- **Python / HTTP services** — a `proxy_pass` to the service's local port
- **WebSocket services** — a dedicated block with `proxy_http_version 1.1` and the `Upgrade` headers
- **Webhook** — a `proxy_pass` to the local webhook receiver

Because nginx uses longest-prefix match and the root `location /` is an `alias` for the landing page, new project blocks must be added **before** the catch-all or they will be shadowed by it. After editing, validate and reload:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

### Systemd service

The webhook receiver runs as a systemd service. See `setup-server.sh` for the service definition. If the service file changes, reload and restart manually:
```bash
sudo systemctl daemon-reload
sudo systemctl restart vps-ai-webhook
```

## Projects

Agent-created projects live under `projects/`. Services are managed via systemd — add entries to `hooks/post-merge` to auto-restart on deploy.

| Project | Description |
|---------|-------------|
| [asteroids](projects/asteroids/) | Multiplayer Asteroids arcade game with WebSocket networking |
| [badge](projects/badge/) | E-paper badge designer/writer over BLE |
| [breakout](projects/breakout/) | Classic Breakout brick-breaker game (single-page HTML) |
| [drop](projects/drop/) | Instant cross-device sharing (text, links, images, files) via paired PWA |
| [flutter_demo](projects/flutter_demo/) | Flutter web demo app |
| [poem](projects/poem/) | A poem about working with AI |
| [scramble](projects/scramble/) | Vectrex-style arcade flight shooter with terrain and enemies |
| [status-page](projects/status-page/) | Server status dashboard with live flutter build indicator (Python + systemd service) |
| [todo-api](projects/todo-api/) | REST API for todos with JWT auth (Python/Flask) |
| [todo-app](projects/todo-app/) | Flutter web frontend for the todo API |
| [trumps48hours](projects/trumps48hours/) | Sci-fi countdown timer with particle effects |
