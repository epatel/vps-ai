#!/usr/bin/env bash
#
# externals.sh — check and update the parts of vps_ai that come from other repos.
#
#   bash externals.sh status          what is out of date, and the next step for each
#   bash externals.sh aihealth <tag>  re-pin aihealth (docs) and reinstall it locally + on the server
#
# Sources (siblings of this checkout, override with AISETUP / SKILLS):
#   ai-setup     -> projects/landing/{setup,cards/} (pushed in by its `make publish`)
#                   and the setup record .claude/agent-setup.json (applied by a refresh)
#   agent-skills -> .claude/skills/* (copied in by a setup refresh)
#   ai-health    -> .venv/ here and on the server (gitignored, never pulled)
#
set -euo pipefail

cd "$(dirname "$0")"
AISETUP="${AISETUP:-../ai-setup}"
SKILLS="${SKILLS:-../agent-skills}"
VPS="${VPS:-epatel@ai.memention.net}"
DIR="${DIR:-vps-ai}"
LIVE="${LIVE:-https://ai.memention.net}"
AIHEALTH_REPO="https://github.com/epatel/ai-health"

remote() { ssh -o BatchMode=yes "$VPS" "cd $DIR && $1"; }
version_of() { grep -Eo '[0-9]+(\.[0-9]+)+' | head -1; }

status_aisetup() {
  echo "== ai-setup ($AISETUP) -> projects/landing/"
  [ -d "$AISETUP" ] || { echo "  not checked out"; return; }
  echo "  repo: $(git -C "$AISETUP" log -1 --format='%h %cs %s')"
  local local_out live_out
  local_out="$(make --no-print-directory -C "$AISETUP" status VPS="$PWD" 2>&1 || true)"
  live_out="$(make --no-print-directory -C "$AISETUP" live_diff 2>&1 || true)"
  printf '%s\n%s\n' "$local_out" "$live_out" | sed 's/^/  /'
  # Clean output is exactly one "in sync with <path>" line and "live site matches site/".
  if [[ "$local_out" != "in sync with "* || "$local_out" == *$'\n'* || "$local_out" == *"needs writing"* ||
        "$live_out" != "live site matches site/" ]]; then
    echo "  next: run 'make setup_publish MSG=...' (= ai-setup make publish)"
  else
    echo "  up to date"
  fi
}

status_record() {
  echo "== setup record (.claude/agent-setup.json)"
  local applied live
  applied="$(python3 -I -c 'import json; print(json.load(open(".claude/agent-setup.json"))["version"])')"
  live="$(curl -fsL "$LIVE/setup" | sed -n 's/^Version: \([^ ]*\).*/\1/p' | head -1)"
  echo "  applied: $applied   live: ${live:-unreachable}"
  if [[ -n "$live" && "$live" > "$applied" ]]; then
    echo "  next: refresh — ask Claude in this repo to 'read $LIVE/setup and apply it' (update mode)"
  else
    echo "  up to date"
  fi
}

status_skills() {
  echo "== agent-skills ($SKILLS) -> .claude/skills/"
  [ -d "$SKILLS" ] || { echo "  not checked out"; return; }
  echo "  repo: $(git -C "$SKILLS" log -1 --format='%h %cs %s')"
  local dir name stale=0
  for dir in .claude/skills/*/; do
    name="$(basename "$dir")"
    if [ ! -d "$SKILLS/$name" ]; then
      echo "  gone upstream: $name"; stale=1
    elif ! diff -rq -x .DS_Store "$dir" "$SKILLS/$name" >/dev/null; then
      echo "  differs: $name"; stale=1
    fi
  done
  if [ "$stale" = 1 ]; then
    echo "  next: make sure ai-setup's changelog has 'Affects: skill:<name>' and is published, then refresh"
  else
    echo "  all installed skills match"
  fi
}

status_aihealth() {
  echo "== ai-health -> .venv/ (local + server)"
  local pinned latest localv serverv
  pinned="$(grep -o 'ai-health@v[0-9.]*' CLAUDE.md | head -1 | version_of)"
  latest="$(git ls-remote --tags --refs "$AIHEALTH_REPO" | sed 's|.*/||' | sort -V | tail -1 | version_of)"
  localv="$( (.venv/bin/aihealth --version 2>/dev/null || true) | version_of)"
  serverv="$( (remote '.venv/bin/aihealth --version' 2>/dev/null || true) | version_of)"
  echo "  pinned: ${pinned:-?}  latest: ${latest:-?}  local: ${localv:-none}  server: ${serverv:-none}"
  if [ "$latest" != "$pinned" ]; then
    echo "  next: make aihealth_update V=v$latest  (scores can shift between versions)"
  elif [ "$localv" != "$pinned" ] || [ "$serverv" != "$pinned" ]; then
    echo "  next: make aihealth_update V=v$pinned  (reinstall the pinned version)"
  else
    echo "  up to date"
  fi
}

cmd_aihealth() {
  local tag="${1:?usage: externals.sh aihealth <tag, e.g. v0.3.2>}"
  local spec="git+$AIHEALTH_REPO@$tag"
  git ls-remote --exit-code --tags "$AIHEALTH_REPO" "refs/tags/$tag" >/dev/null || { echo "no tag $tag" >&2; exit 1; }
  sed -i.bak "s|ai-health@v[0-9.]*|ai-health@$tag|g" CLAUDE.md README.md && rm -f CLAUDE.md.bak README.md.bak
  [ -x .venv/bin/python ] || python3 -m venv .venv
  .venv/bin/pip install -q --upgrade "$spec"
  echo "local:  $(.venv/bin/aihealth --version)"
  remote "[ -x .venv/bin/python ] || python3 -m venv .venv; .venv/bin/pip install -q --upgrade '$spec' && .venv/bin/aihealth --version" |
    sed 's/^/server: /'
  echo "next: record the new pin in project-plan.md Decisions, commit CLAUDE.md + README.md, push"
}

case "${1:-}" in
  status)   status_aisetup; status_record; status_skills; status_aihealth ;;
  aihealth) shift; cmd_aihealth "$@" ;;
  *)        echo "usage: $0 status | aihealth <tag>" >&2; exit 2 ;;
esac
