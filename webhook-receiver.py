#!/usr/bin/env python3
"""GitHub Webhook Receiver for VPS Agent Manager.

Listens on localhost:5000 (behind nginx) for GitHub webhook events:
- issues (action=opened) → spawns monitor-issues.sh
- pull_request (action=closed, merged=true) → git pull + cleanup
- ping → responds OK

Validates HMAC-SHA256 signatures using WEBHOOK_SECRET from .env.issues.
"""

import hashlib
import hmac
import json
import os
import subprocess
import sys
from http.server import HTTPServer, BaseHTTPRequestHandler

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ENV_FILE = os.path.join(SCRIPT_DIR, ".env.issues")
LOG_FILE = os.path.join(SCRIPT_DIR, ".issues-monitor.log")


def load_env():
    """Load .env.issues into a dict."""
    env = {}
    if not os.path.exists(ENV_FILE):
        print(f"ERROR: Missing {ENV_FILE}", file=sys.stderr)
        sys.exit(1)
    with open(ENV_FILE) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" in line:
                key, _, value = line.partition("=")
                env[key.strip()] = value.strip()
    return env


def log(msg):
    """Append a timestamped message to the log file."""
    import datetime
    ts = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with open(LOG_FILE, "a") as f:
        f.write(f"[{ts}] webhook: {msg}\n")
    print(f"[{ts}] webhook: {msg}")


CONFIG = load_env()
WEBHOOK_SECRET = CONFIG.get("WEBHOOK_SECRET", "")


def verify_signature(payload, signature):
    """Verify GitHub HMAC-SHA256 webhook signature."""
    if not WEBHOOK_SECRET:
        log("WARNING: No WEBHOOK_SECRET configured, skipping signature check")
        return True
    if not signature:
        return False
    if not signature.startswith("sha256="):
        return False
    expected = hmac.new(
        WEBHOOK_SECRET.encode(), payload, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(f"sha256={expected}", signature)


class WebhookHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path != "/webhook":
            self.send_error(404)
            return

        content_length = int(self.headers.get("Content-Length", 0))
        payload = self.rfile.read(content_length)

        # Verify signature
        signature = self.headers.get("X-Hub-Signature-256", "")
        if not verify_signature(payload, signature):
            log("Rejected: invalid signature")
            self.send_error(403, "Invalid signature")
            return

        # Parse event
        event = self.headers.get("X-GitHub-Event", "")
        try:
            data = json.loads(payload)
        except json.JSONDecodeError:
            self.send_error(400, "Invalid JSON")
            return

        log(f"Received event: {event}")

        if event == "ping":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"status": "pong"}).encode())
            log("Ping received, responded with pong")
            return

        if event == "issues" and data.get("action") == "opened":
            issue_num = data["issue"]["number"]
            issue_title = data["issue"]["title"]
            log(f"New issue #{issue_num}: {issue_title}")

            # Spawn monitor-issues.sh in background
            subprocess.Popen(
                ["bash", os.path.join(SCRIPT_DIR, "monitor-issues.sh"), str(issue_num)],
                stdout=open(LOG_FILE, "a"),
                stderr=subprocess.STDOUT,
                start_new_session=True,
            )
            log(f"Spawned monitor-issues.sh for issue #{issue_num}")

            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"status": "processing", "issue": issue_num}).encode())
            return

        if event == "issues" and data.get("action") == "reopened":
            issue_num = data["issue"]["number"]
            log(f"Issue #{issue_num} reopened, closing it")

            # Close the issue via GitHub API
            env = CONFIG
            token = env.get("GITHUB_TOKEN", "")
            repo = env.get("GITHUB_REPO", "")
            if token and repo:
                subprocess.Popen(
                    ["python3", os.path.join(SCRIPT_DIR, "github-helper.py"),
                     "close-issue", str(issue_num), repo, token],
                    stdout=open(LOG_FILE, "a"),
                    stderr=subprocess.STDOUT,
                    start_new_session=True,
                )

            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"status": "closed", "issue": issue_num}).encode())
            return

        if event == "pull_request" and data.get("action") == "closed":
            pr = data.get("pull_request", {})
            if pr.get("merged"):
                pr_title = pr.get("title", "")
                log(f"PR merged: {pr_title}")

                # Git pull to trigger post-merge hook
                subprocess.Popen(
                    ["bash", "-c", f"""
                        cd '{SCRIPT_DIR}'
                        git add -u
                        git commit -m "Auto-commit local changes before merge" --quiet || true
                        git fetch origin main --quiet 2>/dev/null
                        git diff --name-only origin/main 2>/dev/null | while read -r f; do
                            if [ -f "$f" ] && ! git ls-files --error-unmatch "$f" &>/dev/null; then
                                rm -f "$f"
                            fi
                        done
                        git merge origin/main --ff-only 2>&1
                    """],
                    stdout=open(LOG_FILE, "a"),
                    stderr=subprocess.STDOUT,
                    start_new_session=True,
                )
                log("Triggered git pull for merge")

                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"status": "pulling"}).encode())
                return

        # Unhandled event/action — acknowledge but ignore
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps({"status": "ignored", "event": event}).encode())

    def do_GET(self):
        """Health check endpoint."""
        if self.path == "/webhook":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"status": "ok", "service": "vps-ai-webhook"}).encode())
        else:
            self.send_error(404)

    def log_message(self, format, *args):
        """Suppress default stderr logging, we use our own."""
        pass


def main():
    host = "127.0.0.1"
    port = 5000
    server = HTTPServer((host, port), WebhookHandler)
    log(f"Webhook receiver started on {host}:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        log("Webhook receiver shutting down")
        server.server_close()


if __name__ == "__main__":
    main()
