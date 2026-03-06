# VPS Agent Manager

An autonomous AI agent system that turns GitHub issues into code. Open an issue, and a Claude agent picks it up, writes the code, and either merges it directly or creates a PR for review.

Running on `ai.memention.net`.

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

A post-merge git hook auto-restarts systemd services when their project files change.

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

### GitHub token permissions (fine-grained PAT)

- **Issues**: Read and write
- **Pull requests**: Read and write
- **Contents**: Read and write

### Webhook configuration

Add a webhook on the repo:
- **URL:** `https://ai.memention.net/webhook`
- **Content type:** `application/json`
- **Secret:** matches `WEBHOOK_SECRET`
- **Events:** Issues, Pull requests

## Usage

Just open an issue. The agent handles the rest.

```bash
# Manual trigger for a specific issue
bash monitor-issues.sh <issue_number>

# Watch logs
tail -f .issues-monitor.log
tail -f .agent-issue-N.log
```

## Projects

Agent-created projects live under `projects/`. Services are managed via systemd — add entries to `hooks/post-merge` to auto-restart on deploy.
