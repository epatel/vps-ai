#!/usr/bin/env bash
#
# run-agent.sh — Run a Claude agent for an issue in an isolated git worktree.
#                Always pushes a branch and creates a PR for review.
#
# Usage: run-agent.sh <issue_number> <prompt>
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/.env.issues"

ISSUE_NUM="$1"
AGENT_PROMPT="$2"
# Auto-detect host description, or use override from .env.issues
HOST_DESCRIPTION="${HOST_DESCRIPTION:-$(uname -n) ($(lsb_release -ds 2>/dev/null || uname -s), $(uname -m))}"
SYSTEM_PROMPT="$(sed -e "s|{{REPO_ROOT}}|$SCRIPT_DIR|g" -e "s|{{HOST_DESCRIPTION}}|$HOST_DESCRIPTION|g" "$SCRIPT_DIR/.system-prompt.md")"
HELPER="$SCRIPT_DIR/github-helper.py"
AUTH_REMOTE="https://x-access-token:${GITHUB_TOKEN}@github.com/${GITHUB_REPO}.git"
AGENT_OUTPUT_FILE="$SCRIPT_DIR/.agent-issue-${ISSUE_NUM}.output"

WORKTREE_DIR="$SCRIPT_DIR/.worktrees/issue-${ISSUE_NUM}"
BRANCH_NAME="issue-${ISSUE_NUM}"

echo "=== Agent starting for issue #${ISSUE_NUM} at $(date) ==="

# Pull latest main before creating worktree so agent works on fresh code
echo "Pulling latest main..."
git -C "$SCRIPT_DIR" fetch "$AUTH_REMOTE" main 2>&1
git -C "$SCRIPT_DIR" diff --name-only FETCH_HEAD 2>/dev/null | while read -r f; do
  if [[ -f "$SCRIPT_DIR/$f" ]] && ! git -C "$SCRIPT_DIR" ls-files --error-unmatch "$f" &>/dev/null; then
    rm -f "$SCRIPT_DIR/$f"
  fi
done
git -C "$SCRIPT_DIR" merge FETCH_HEAD --ff-only 2>&1 || echo "WARNING: Could not fast-forward main"

# Clean up any leftover worktree/branch from a previous run
git -C "$SCRIPT_DIR" worktree remove "$WORKTREE_DIR" --force 2>/dev/null || true
git -C "$SCRIPT_DIR" branch -D "$BRANCH_NAME" 2>/dev/null || true

# Create an isolated worktree for this issue
mkdir -p "$SCRIPT_DIR/.worktrees"
git -C "$SCRIPT_DIR" worktree add -b "$BRANCH_NAME" "$WORKTREE_DIR" main 2>&1 || {
  echo "ERROR: Could not create worktree for issue #${ISSUE_NUM}"
  exit 1
}

echo "Worktree created at $WORKTREE_DIR"

# Notify on the issue that the agent is starting
python3 "$HELPER" post-comment-text "Agent is starting work on this issue..." "$ISSUE_NUM" "$GITHUB_REPO" "$GITHUB_TOKEN"

# Run Claude with the system prompt, working inside the worktree
cd "$WORKTREE_DIR"
export PATH="$HOME/.local/bin:$HOME/.npm-global/bin:$PATH"
unset CLAUDECODE
claude --print \
  --dangerously-skip-permissions \
  --system-prompt "$SYSTEM_PROMPT" \
  -p "$AGENT_PROMPT" \
  > "$AGENT_OUTPUT_FILE" 2>&1

echo "=== Agent finished for issue #${ISSUE_NUM} at $(date) ==="
cat "$AGENT_OUTPUT_FILE"

# Push branch and create PR
cd "$SCRIPT_DIR"
echo "=== Pushing branch and creating PR ==="

git -C "$WORKTREE_DIR" push -u "$AUTH_REMOTE" "$BRANCH_NAME" 2>&1 || echo "WARNING: Failed to push branch"

# Get the issue title for the PR
ISSUE_TITLE=$(python3 -c "
import sys
for line in open('$SCRIPT_DIR/issues/issue-${ISSUE_NUM}.md'):
    if line.startswith('# Issue'):
        print(line.split(':', 1)[-1].strip())
        break
")

# Extract comment body for PR description
PR_BODY=$(python3 -c "
content = open('$AGENT_OUTPUT_FILE').read()
start = content.find('---ISSUE-COMMENT---')
end = content.find('---END-COMMENT---')
if start != -1 and end != -1:
    print(content[start+19:end].strip())
else:
    print('Automated changes for issue #${ISSUE_NUM}')
")

# Create PR via GitHub API
echo "Creating PR..."
python3 "$HELPER" create-pr "$GITHUB_REPO" "$GITHUB_TOKEN" "$BRANCH_NAME" "Fix #${ISSUE_NUM}: $ISSUE_TITLE" "$PR_BODY" 2>&1 | tee /tmp/pr-output-${ISSUE_NUM}.txt

PR_URL=$(grep -oP 'https://\S+' /tmp/pr-output-${ISSUE_NUM}.txt || echo "")
rm -f /tmp/pr-output-${ISSUE_NUM}.txt

if [[ -n "$PR_URL" ]]; then
  echo -e "\n\nPull request: ${PR_URL}" >> "$AGENT_OUTPUT_FILE"
fi

# Post comment and close issue
python3 "$HELPER" post-comment "$AGENT_OUTPUT_FILE" "$ISSUE_NUM" "$GITHUB_REPO" "$GITHUB_TOKEN"
python3 "$HELPER" close-issue "$ISSUE_NUM" "$GITHUB_REPO" "$GITHUB_TOKEN"

# Clean up worktree and local branch
echo "Cleaning up..."
git -C "$SCRIPT_DIR" worktree remove "$WORKTREE_DIR" --force 2>/dev/null || true
git -C "$SCRIPT_DIR" branch -D "$BRANCH_NAME" 2>/dev/null || true

echo "=== Done for issue #${ISSUE_NUM} ==="
