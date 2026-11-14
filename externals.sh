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

# Fail fast when the server is down instead of waiting on OS connect timeouts.
remote() { ssh -o BatchMode=yes -o ConnectTimeout=5 "$VPS" "cd $DIR && $1"; }
fetch() { curl -fsL --connect-timeout 5 --max-time 15 "$@"; }
SERVER_UP=1
probe_server() {
  fetch -o /dev/null "$LIVE/" 2>/dev/null && return
  SERVER_UP=0
  echo "!! $LIVE is unreachable: skipping live-site and server checks"
}
version_of() { grep -Eo '[0-9]+(\.[0-9]+)+' | head -1; }

status_aisetup() {
  echo "== ai-setup ($AISETUP) -> projects/landing/"
  [ -d "$AISETUP" ] || { echo "  not checked out"; return; }
  echo "  repo: $(git -C "$AISETUP" log -1 --format='%h %cs %s')"
  local local_out live_out="live site: skipped (server unreachable)"
  local_out="$(make --no-print-directory -C "$AISETUP" status VPS="$PWD" 2>&1 || true)"
  [ "$SERVER_UP" = 0 ] || live_out="$(make --no-print-directory -C "$AISETUP" live_diff 2>&1 || true)"
  printf '%s\n%s\n' "$local_out" "$live_out" | sed 's/^/  /'
  if [ "$SERVER_UP" = 0 ]; then
    echo "  live site not checked"
  elif aisetup_clean "$local_out" "$live_out"; then
    echo "  up to date"
  else
    echo "  next: run 'make setup_publish MSG=...' (= ai-setup make publish)"
  fi
}

# Clean output is exactly one "in sync with <path>" line and "live site matches site/".
aisetup_clean() {
  [[ "$1" == "in sync with "* && "$1" != *$'\n'* && "$1" != *"needs writing"* &&
     "$2" == "live site matches site/" ]]
}

status_record() {
  echo "== setup record (.claude/agent-setup.json)"
  local applied live
  applied="$(python3 -I -c 'import json; print(json.load(open(".claude/agent-setup.json"))["version"])')"
  live=""
  [ "$SERVER_UP" = 0 ] || live="$(fetch "$LIVE/setup" | sed -n 's/^Version: \([^ ]*\).*/\1/p' | head -1 || true)"
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
  # The pin is `ai-health@<commit SHA>"  # <tag>`: the version comes from the tag label.
  pinned="$(grep -oE 'ai-health@[0-9a-f]{40}" +# v[0-9.]+' CLAUDE.md | head -1 | sed 's/.*# //' | version_of)"
  latest="$(git ls-remote --tags --refs "$AIHEALTH_REPO" | sed 's|.*/||' | sort -V | tail -1 | version_of)"
  localv="$( (.venv/bin/aihealth --version 2>/dev/null || true) | version_of)"
  serverv=""
  [ "$SERVER_UP" = 0 ] || serverv="$( (remote '.venv/bin/aihealth --version' 2>/dev/null || true) | version_of)"
  echo "  pinned: ${pinned:-?}  latest: ${latest:-?}  local: ${localv:-none}  server: ${serverv:-none}"
  echo "  $(aihealth_next "$pinned" "$latest" "$localv" "$serverv")"
}

# aihealth_next PINNED LATEST LOCAL SERVER -> the next step for ai-health.
aihealth_next() {
  if [ "$2" != "$1" ]; then
    echo "next: make aihealth_update V=v$2  (scores can shift between versions)"
  elif [ "$3" != "$1" ]; then
    echo "next: make aihealth_update V=v$1  (reinstall the pinned version)"
  elif [ "$SERVER_UP" = 0 ]; then
    echo "local up to date (server not checked)"
  elif [ "$4" != "$1" ]; then
    echo "next: make aihealth_update V=v$1  (reinstall the pinned version)"
  else
    echo "up to date"
  fi
}

# aihealth_sha TAG -> the commit the tag points to (the ^{} line, present for annotated tags).
aihealth_sha() {
  git ls-remote "$AIHEALTH_REPO" "refs/tags/$1" "refs/tags/$1^{}" | sort -k2 | tail -1 | cut -f1
}

# repin_files SHA TAG: rewrite the install commands (old @tag form or @sha  # tag form).
repin_files() {
  sed -E -i.bak "s|ai-health@[0-9A-Za-z.]+\"( +# v[0-9.]+)?|ai-health@$1\"  # $2|g" CLAUDE.md README.md &&
    rm -f CLAUDE.md.bak README.md.bak
}

# repin_record SHA TAG: the setup record's aihealth tools entry (pin = commit, min = version).
repin_record() {
  python3 -I - "$1" "${2#v}" <<'PY'
import json, sys
p = ".claude/agent-setup.json"
rec = json.load(open(p))
entry = rec.setdefault("tools", {}).setdefault("aihealth", {"pattern": "code-health", "form": "project-venv"})
entry["pin"], entry["min"] = sys.argv[1], sys.argv[2]
open(p, "w").write(json.dumps(rec, indent=2) + "\n")
PY
}

cmd_aihealth() {
  local tag="${1:?usage: externals.sh aihealth <tag, e.g. v0.3.2>}"
  local sha
  sha="$(aihealth_sha "$tag")"
  [ -n "$sha" ] || { echo "no tag $tag" >&2; exit 1; }
  local spec="git+$AIHEALTH_REPO@$sha"
  echo "aihealth $tag -> commit $sha"
  repin_files "$sha" "$tag"
  repin_record "$sha" "$tag"
  [ -x .venv/bin/python ] || python3 -m venv .venv
  .venv/bin/pip install -q --upgrade "$spec"
  echo "local:  $(.venv/bin/aihealth --version)"
  remote "[ -x .venv/bin/python ] || python3 -m venv .venv; .venv/bin/pip install -q --upgrade '$spec' && .venv/bin/aihealth --version" |
    sed 's/^/server: /'
  echo "next: record the new pin in project-plan.md Decisions, commit CLAUDE.md + README.md + .claude/agent-setup.json, push"
}

case "${1:-}" in
  status)   probe_server; status_aisetup; status_record; status_skills; status_aihealth ;;
  aihealth) shift; cmd_aihealth "$@" ;;
  *)        echo "usage: $0 status | aihealth <tag>" >&2; exit 2 ;;
esac
