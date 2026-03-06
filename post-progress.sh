#!/usr/bin/env bash
#
# post-progress.sh — Post a progress comment on a GitHub issue
#
# Usage: post-progress.sh <issue_number> <message>
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# Support being called from a worktree — walk up to find .env.issues
ENV_FILE="$SCRIPT_DIR/.env.issues"
if [[ ! -f "$ENV_FILE" ]]; then
  ENV_FILE="$(git rev-parse --show-toplevel 2>/dev/null)/.env.issues"
fi
if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: Cannot find .env.issues" >&2
  exit 1
fi
source "$ENV_FILE"

ISSUE_NUM="$1"
MESSAGE="$2"

python3 -c "
import json, urllib.request, sys

data = json.dumps({'body': sys.argv[1]}).encode()
req = urllib.request.Request(
    'https://api.github.com/repos/${GITHUB_REPO}/issues/${ISSUE_NUM}/comments',
    data=data, method='POST', headers={
        'Authorization': 'token ${GITHUB_TOKEN}',
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json',
    })
with urllib.request.urlopen(req) as r:
    print(f'Progress posted (HTTP {r.status})')
" "$MESSAGE"
