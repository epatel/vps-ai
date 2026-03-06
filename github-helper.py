#!/usr/bin/env python3
"""GitHub API helper for issue monitoring system.

Commands:
  post-comment <output_file> <issue_num> <repo> <token>
  close-issue <issue_num> <repo> <token>
  create-pr <repo> <token> <branch> <title> <body>
  detect-mode <worktree_dir>  — prints "new-project", "modify", or "mixed"
"""

import json
import subprocess
import sys
import urllib.request


def github_api(method, url, token, data=None):
    """Make a GitHub API request."""
    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(url, data=body, method=method, headers={
        "Authorization": f"token {token}",
        "Accept": "application/vnd.github+json",
        "Content-Type": "application/json",
    })
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status, json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode())


def post_comment(output_file, issue_num, repo, token):
    """Extract comment from agent output and post to GitHub issue."""
    with open(output_file) as f:
        content = f.read()

    marker_start = "---ISSUE-COMMENT---"
    marker_end = "---END-COMMENT---"
    start = content.find(marker_start)
    end = content.find(marker_end)

    if start != -1 and end != -1:
        body = content[start + len(marker_start):end].strip()
    else:
        tail = content[-2000:]
        body = (
            f"Agent completed work on this issue.\n\n"
            f"<details><summary>Agent output (tail)</summary>\n\n"
            f"```\n{tail}\n```\n</details>"
        )

    body += "\n\n---\n*Posted by Claude agent*"

    status, resp = github_api(
        "POST",
        f"https://api.github.com/repos/{repo}/issues/{issue_num}/comments",
        token, {"body": body}
    )
    if status < 300:
        print(f"Comment posted (HTTP {status})")
    else:
        print(f"Failed to post comment: HTTP {status} - {resp}", file=sys.stderr)
        sys.exit(1)

    return body


def close_issue(issue_num, repo, token):
    """Close a GitHub issue."""
    status, resp = github_api(
        "PATCH",
        f"https://api.github.com/repos/{repo}/issues/{issue_num}",
        token, {"state": "closed"}
    )
    if status < 300:
        print(f"Issue #{issue_num} closed (HTTP {status})")
    else:
        print(f"Failed to close issue: HTTP {status} - {resp}", file=sys.stderr)


def create_pr(repo, token, branch, title, body):
    """Create a pull request."""
    status, resp = github_api(
        "POST",
        f"https://api.github.com/repos/{repo}/pulls",
        token, {
            "title": title,
            "body": body + "\n\n---\n*Created by Claude agent*",
            "head": branch,
            "base": "main",
        }
    )
    if status < 300:
        pr_url = resp["html_url"]
        print(f"PR created: {pr_url} (HTTP {status})")
        return pr_url
    else:
        print(f"Failed to create PR: HTTP {status} - {resp}", file=sys.stderr)
        return None


def detect_mode(worktree_dir):
    """Detect if the agent created new files only or modified existing ones.
    Returns: 'new-project', 'modify', or 'mixed'
    """
    result = subprocess.run(
        ["git", "-C", worktree_dir, "diff", "--name-status", "main"],
        capture_output=True, text=True
    )
    if result.returncode != 0:
        print("new-project")
        return

    has_new = False
    has_modified = False
    for line in result.stdout.strip().split("\n"):
        if not line:
            continue
        status = line[0]
        if status == "A":
            has_new = True
        elif status in ("M", "D", "R"):
            has_modified = True

    if has_modified:
        print("modify" if not has_new else "mixed")
    else:
        print("new-project")


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    cmd = sys.argv[1]

    if cmd == "post-comment":
        post_comment(sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5])
    elif cmd == "close-issue":
        close_issue(sys.argv[2], sys.argv[3], sys.argv[4])
    elif cmd == "create-pr":
        create_pr(sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5], sys.argv[6])
    elif cmd == "detect-mode":
        detect_mode(sys.argv[2])
    else:
        print(f"Unknown command: {cmd}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
