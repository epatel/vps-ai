# architecture

How the GitHub-issue-driven autonomous agent system fits together end to end, and its deployment shape.

The system turns a new GitHub issue on `epatel/vps-ai` into a reviewed PR, then deploys merged changes. It runs on `ai.memention.net` (Ubuntu 24.04, x86_64).

## Pipeline

```mermaid
flowchart TD
    A[Issue opened on epatel/vps-ai] -->|webhook| B[webhook-receiver.py<br/>HMAC verify, behind nginx]
    B --> C[monitor-issues.sh<br/>fetch issue, write issues/issue-N.md]
    C --> D[run-agent.sh<br/>pull main, create worktree .worktrees/issue-N]
    D --> E[Claude runs in worktree<br/>branch issue-N, --dangerously-skip-permissions]
    E --> F[push issue-N branch, open PR]
    F --> G[comment summary on issue + close it]
    G -->|PR merged / push to main| H[webhook triggers git pull on server]
    H --> I[post-merge git hook<br/>restart services, rebuild Flutter apps]
```

Steps 6/7: a comment is posted when the agent starts; after it finishes the `issue-N` branch is pushed and a PR opened for review. The agent's summary is posted as a comment and the issue is closed.

`monitor-issues.sh` writes `issues/issue-N.md` *before* spawning the agent, so that file's existence does not mean the run succeeded. The retry guard therefore keys off the `**Status:**` field in it — `in-progress` when the agent is spawned, then `done` or `failed` written back by `run-agent.sh`. A run is skipped only when the status is `done`, when the recorded pid is still alive, or when a `run-agent.sh` wrapper for that issue is still running; anything else (notably a crashed run) is cleaned up and retried. Without this a crashed run left a stale marker that silently blocked every future attempt at the issue. Only `action=opened` spawns the monitor from the webhook, so this matters for manual retries: `bash monitor-issues.sh N`.

`run-agent.sh` runs under `set -euo pipefail`, so any failed step aborts it. An `EXIT` trap (`report_failure`) catches a non-zero exit and posts a failure comment naming the stage that died (tracked in `$STAGE`), the exit code, and the last 2 KB of `.agent-issue-N.output` — falling back to `.agent-issue-N.log` when the agent produced no output. On failure the issue is left open and the worktree is left in place for debugging; the next run for that issue removes it.

## Components

| File | Role |
|---|---|
| `webhook-receiver.py` | HTTP webhook server (behind nginx); validates HMAC, dispatches events |
| `monitor-issues.sh` | Fetches issue from GitHub, writes `issues/issue-N.md`, spawns the agent |
| `run-agent.sh` | Pulls `main`, creates the worktree, runs Claude, pushes branch + opens PR |
| `github-helper.py` | GitHub API helper (comments, PRs, close) |
| `post-progress.sh` | Lets running agents post progress to the issue |
| `hooks/post-merge` | Restarts services + rebuilds Flutter apps when their files change |
| `setup-hooks.sh` | Installs git hooks from `hooks/` |
| `setup-server.sh` | One-time server provisioning |
| `.system-prompt.md` | System prompt given to every agent |
| `.env.issues` | Config (gitignored) |
| `issues/` | Issue tracking files (`issue-N.md`) |
| `projects/` | Project directories (apps, games, services) |
| `.worktrees/` | Temporary agent worktrees (gitignored) |

## Services / systemd

Services run under systemd. The `post-merge` hook restarts a service when its
project files change on merge/pull. To add a service, edit `hooks/post-merge`
and add an entry to `SERVICE_MAP`:

```bash
["projects/my-project"]="my-service"
```

Then run `bash setup-hooks.sh` to reinstall the hook.
