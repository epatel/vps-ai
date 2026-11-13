#!/usr/bin/env bash
#
# deploy-server.sh — server-side half of `make deploy` (runs in ~/vps-ai over ssh).
#
#   bash deploy-server.sh status          report HEAD, drift, hooks, services
#   bash deploy-server.sh pull            fetch + ff-only merge main (runs hooks/post-merge)
#   bash deploy-server.sh post <old-head> apply what a pull does not (see below)
#
# `post` reinstalls git hooks when hooks/ differs from .git/hooks/, restarts
# vps-ai-webhook when webhook-receiver.py changed, and warns about changes that
# need a manual step (nginx, systemd units).
#
set -euo pipefail

cd "$(dirname "$0")"

services() { grep -o '\]="[^"]*"' hooks/post-merge | cut -d'"' -f2; }

hooks_in_sync() {
  local hook
  for hook in hooks/*; do
    cmp -s "$hook" ".git/hooks/$(basename "$hook")" || return 1
  done
}

cmd_status() {
  git fetch -q origin main
  echo "server HEAD:   $(git log -1 --format='%h %s' HEAD)"
  echo "behind origin: $(git rev-list --count HEAD..origin/main) commit(s)"
  echo "ahead origin:  $(git rev-list --count origin/main..HEAD) commit(s)"
  local dirty
  dirty="$(git status --porcelain --untracked-files=no)"
  if [ -n "$dirty" ]; then echo "tracked changes on server (block ff-only pulls):"; echo "$dirty"; else echo "tracked changes: none"; fi
  if hooks_in_sync; then echo "git hooks:     in sync"; else echo "git hooks:     OUT OF SYNC (bash setup-hooks.sh)"; fi
  echo "webhook:       $(systemctl is-active vps-ai-webhook || true)"
  local svc
  for svc in $(services); do
    printf '%-14s %s\n' "$svc:" "$(systemctl is-active "$svc" || true)"
  done
  if [ -x .venv/bin/aihealth ]; then
    echo "aihealth:      $(.venv/bin/aihealth --version 2>/dev/null || echo unknown)"
  else
    echo "aihealth:      not installed (.venv missing)"
  fi
}

cmd_pull() {
  if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
    echo "pull: tracked changes on server would block the merge:" >&2
    git status --short --untracked-files=no >&2
    exit 1
  fi
  git fetch -q origin main
  git merge --ff-only origin/main
}

cmd_post() {
  local old="${1:?usage: deploy-server.sh post <old-head>}"
  local new
  new="$(git rev-parse HEAD)"
  changed() { [ "$old" != "$new" ] && git diff --name-only "$old" "$new" -- "$@" | grep -q .; }

  [ "$old" = "$new" ] && echo "post-deploy: nothing new"

  if ! hooks_in_sync; then
    echo "post-deploy: hooks/ differs from .git/hooks, reinstalling"
    bash setup-hooks.sh
  fi
  if changed webhook-receiver.py; then
    echo "post-deploy: webhook-receiver.py changed, restarting vps-ai-webhook"
    sudo systemctl restart vps-ai-webhook
  fi
  if changed nginx/; then
    echo "post-deploy: WARNING nginx/ changed — apply it to the live config, then: sudo nginx -t && sudo systemctl reload nginx"
  fi
  if changed setup-server.sh; then
    echo "post-deploy: WARNING setup-server.sh changed — if a unit file changed, update it and run: sudo systemctl daemon-reload"
  fi
  echo "post-deploy: done at $(git rev-parse --short HEAD)"
}

case "${1:-}" in
  status) cmd_status ;;
  pull)   cmd_pull ;;
  post)   shift; cmd_post "$@" ;;
  *)      echo "usage: $0 status | pull | post <old-head>" >&2; exit 2 ;;
esac
