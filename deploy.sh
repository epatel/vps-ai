#!/usr/bin/env bash
#
# deploy.sh — local half of `make deploy`.
#
# Pushes main to GitHub, waits for the webhook to pull it on the server (or
# pulls directly if it does not), then runs `deploy-server.sh post` there for
# the steps a pull does not cover. Flutter web apps deploy via GitHub Actions.
#
# Env: VPS (ssh target), DIR (repo dir on the server), WAIT (seconds).
#
set -euo pipefail

VPS="${VPS:-epatel@ai.memention.net}"
DIR="${DIR:-vps-ai}"
WAIT="${WAIT:-60}"

die() { echo "deploy: $*" >&2; exit 1; }
remote() { ssh -o BatchMode=yes "$VPS" "cd $DIR && $1"; }
server_head() { remote "git rev-parse HEAD"; }

preflight() {
  [ "$(git rev-parse --abbrev-ref HEAD)" = main ] || die "not on main"
  [ -z "$(git status --porcelain --untracked-files=no)" ] || die "commit or stash tracked changes first"
  git fetch -q origin main
  git merge-base --is-ancestor origin/main HEAD || die "local main is behind origin/main, pull first"
  [ -z "$(remote 'git status --porcelain --untracked-files=no')" ] ||
    die "server has tracked changes that would block the pull, see make server_status"
}

wait_for_server() {
  local new="$1" i
  echo "deploy: waiting up to ${WAIT}s for the webhook pull"
  for ((i = 0; i < WAIT; i++)); do
    [ "$(server_head)" = "$new" ] && return 0
    sleep 1
  done
  echo "deploy: webhook did not pull, pulling directly"
  remote "bash deploy-server.sh pull"
}

preflight
old="$(server_head)"
new="$(git rev-parse HEAD)"
echo "deploy: pushing ${new:0:7} (server at ${old:0:7})"
git push origin main
[ "$old" = "$new" ] || wait_for_server "$new"
remote "bash deploy-server.sh post $old"
