#!/usr/bin/env bash
#
# monitor-issues.sh — Fetch a GitHub issue and spawn a Claude agent for it.
#
# Usage: monitor-issues.sh <issue_number>
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ISSUES_DIR="$SCRIPT_DIR/issues"
ENV_FILE="$SCRIPT_DIR/.env.issues"
LOG_FILE="$SCRIPT_DIR/.issues-monitor.log"

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <issue_number>" >&2
  exit 1
fi

ISSUE_NUM="$1"

# Load config
if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE" >&2
  exit 1
fi
source "$ENV_FILE"

mkdir -p "$ISSUES_DIR" "$SCRIPT_DIR/projects"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG_FILE"
}

# Pull latest so we work on fresh code
git -C "$SCRIPT_DIR" fetch origin main --quiet 2>/dev/null
git -C "$SCRIPT_DIR" diff --name-only origin/main 2>/dev/null | while read -r f; do
  if [[ -f "$SCRIPT_DIR/$f" ]] && ! git -C "$SCRIPT_DIR" ls-files --error-unmatch "$f" &>/dev/null; then
    rm -f "$SCRIPT_DIR/$f"
  fi
done
git -C "$SCRIPT_DIR" merge origin/main --ff-only 2>/dev/null || true

# Skip if already processed
ISSUE_FILE="$ISSUES_DIR/issue-${ISSUE_NUM}.md"
if [[ -f "$ISSUE_FILE" ]]; then
  log "Issue #${ISSUE_NUM} already processed, skipping."
  exit 0
fi

log "Fetching issue #${ISSUE_NUM}..."

# Fetch the issue from GitHub
ISSUE_JSON=$(curl -s \
  -H "Authorization: token $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/$GITHUB_REPO/issues/$ISSUE_NUM")

# Validate response
if ! echo "$ISSUE_JSON" | python3 -c "import sys,json; d=json.load(sys.stdin); assert 'number' in d" 2>/dev/null; then
  log "ERROR: Could not fetch issue #${ISSUE_NUM}"
  exit 1
fi

# Skip pull requests
if echo "$ISSUE_JSON" | python3 -c "import sys,json; sys.exit(0 if 'pull_request' in json.load(sys.stdin) else 1)" 2>/dev/null; then
  log "Issue #${ISSUE_NUM} is a pull request, skipping."
  exit 0
fi

# Extract fields
ISSUE_TITLE=$(echo "$ISSUE_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin)['title'])")
ISSUE_BODY=$(echo "$ISSUE_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin).get('body','') or '')")
ISSUE_USER=$(echo "$ISSUE_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin)['user']['login'])")
ISSUE_LABELS=$(echo "$ISSUE_JSON" | python3 -c "import sys,json; print(', '.join(l['name'] for l in json.load(sys.stdin).get('labels',[])))")
ISSUE_DATE=$(echo "$ISSUE_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin)['created_at'])")
ISSUE_URL=$(echo "$ISSUE_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin)['html_url'])")

log "Issue #${ISSUE_NUM}: ${ISSUE_TITLE}"

# Create the issue file
cat > "$ISSUE_FILE" <<EOF
# Issue #${ISSUE_NUM}: ${ISSUE_TITLE}

- **Author:** ${ISSUE_USER}
- **Created:** ${ISSUE_DATE}
- **Labels:** ${ISSUE_LABELS}
- **URL:** ${ISSUE_URL}
- **Status:** assigned

## Description

${ISSUE_BODY}
EOF

log "Created $ISSUE_FILE"

# Build the agent prompt
AGENT_PROMPT="You have been assigned GitHub issue #${ISSUE_NUM} in the repo ${GITHUB_REPO}.

Title: ${ISSUE_TITLE}

Description:
${ISSUE_BODY}

The issue file is at: ./issues/issue-${ISSUE_NUM}.md
You are working in an isolated git worktree on branch issue-${ISSUE_NUM}. Do NOT switch branches.
New projects go under ./projects/<project-name>/.

Follow the instructions in your system prompt. Remember to output the ---ISSUE-COMMENT--- block at the end."

log "Spawning Claude agent for issue #${ISSUE_NUM}..."

# Run the agent wrapper in the background
nohup bash "$SCRIPT_DIR/run-agent.sh" "$ISSUE_NUM" "$AGENT_PROMPT" \
  >> "$SCRIPT_DIR/.agent-issue-${ISSUE_NUM}.log" 2>&1 &

AGENT_PID=$!
log "Agent wrapper PID: $AGENT_PID for issue #${ISSUE_NUM}"
echo "$AGENT_PID" > "$ISSUES_DIR/.agent-${ISSUE_NUM}.pid"

log "Done."
