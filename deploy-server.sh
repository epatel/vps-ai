#!/usr/bin/env bash
#
# deploy-server.sh — server-side half of `make deploy` (runs in ~/vps-ai over ssh).
#
#   bash deploy-server.sh status          report HEAD, drift, hooks, nginx, services
#   bash deploy-server.sh pull            fetch + ff-only merge main (runs hooks/post-merge)
#   bash deploy-server.sh post <old-head> apply what a pull does not (see below)
#   bash deploy-server.sh nginx-diff      diff the repo's nginx site config against the live one
#
# `post` reinstalls git hooks when hooks/ differs from .git/hooks/, restarts
# vps-ai-webhook when webhook-receiver.py changed, and warns about changes that
# need a manual step (nginx, systemd units).
#
set -euo pipefail

cd "$(dirname "$0")"

NGINX_REPO=nginx/ai.memention.net.conf
NGINX_LIVE=/etc/nginx/sites-available/ai.memention.net

services() { grep -o '\]="[^"]*"' hooks/post-merge | cut -d'"' -f2; }

nginx_state() {
  local enabled=/etc/nginx/sites-enabled/ai.memention.net
  if [ -e "$enabled" ] && [ "$(readlink "$enabled")" != "$NGINX_LIVE" ]; then
    echo "SPLIT: $enabled is not a symlink to $NGINX_LIVE, so nginx serves a different file"
  elif [ ! -r "$NGINX_LIVE" ]; then echo "live config not readable ($NGINX_LIVE)"
  elif cmp -s "$NGINX_REPO" "$NGINX_LIVE"; then echo "in sync"
  else echo "OUT OF SYNC (bash deploy-server.sh nginx-diff)"
  fi
}

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
  echo "nginx:         $(nginx_state)"
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
  # Same lock as the webhook's pull, so the two never merge at the same time.
  exec 9>"$(git rev-parse --git-dir)/vps-ai-pull.lock"
  flock -w 120 9 || { echo "pull: another pull still holds the lock after 120s" >&2; exit 1; }
  timeout 120 git fetch -q origin main
  timeout 600 git merge --ff-only origin/main
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
  if changed "$NGINX_REPO"; then
    if [ "$(nginx_state)" = "in sync" ]; then
      echo "post-deploy: $NGINX_REPO changed and already matches the live config; nothing to apply"
    else
      echo "post-deploy: WARNING $NGINX_REPO changed and differs from the live config. Review, then apply:"
      echo "  bash deploy-server.sh nginx-diff"
      echo "  sudo cp $NGINX_REPO $NGINX_LIVE && sudo nginx -t && sudo systemctl reload nginx"
    fi
  fi
  # Other files under nginx/ (snippets) are installed by setup-server.sh, by hand.
  if changed nginx/ ":(exclude)$NGINX_REPO"; then
    echo "post-deploy: WARNING nginx/ snippets changed — install them (see setup-server.sh), then: sudo nginx -t && sudo systemctl reload nginx"
  fi
  if changed setup-server.sh; then
    echo "post-deploy: WARNING setup-server.sh changed — if a unit file changed, update it and run: sudo systemctl daemon-reload"
  fi
  echo "post-deploy: done at $(git rev-parse --short HEAD)"
}

cmd_nginx_diff() {
  # Exit 0 when in sync, 1 when they differ (diff's own convention).
  diff -u --label "repo $NGINX_REPO" --label "live $NGINX_LIVE" "$NGINX_REPO" "$NGINX_LIVE"
}

case "${1:-}" in
  status)     cmd_status ;;
  pull)       cmd_pull ;;
  post)       shift; cmd_post "$@" ;;
  nginx-diff) cmd_nginx_diff ;;
  *)          echo "usage: $0 status | pull | post <old-head> | nginx-diff" >&2; exit 2 ;;
esac
