#!/usr/bin/env bash
#
# setup-server.sh — One-time server provisioning for VPS Agent Manager
#
# Run as root on ai.memention.net (Ubuntu 24.04):
#   sudo bash setup-server.sh
#
set -euo pipefail

REPO_DIR="${1:-$HOME/vps-ai}"
WEBHOOK_USER="${SUDO_USER:-$(whoami)}"

echo "=== VPS Agent Manager Setup ==="
echo "Repo dir: $REPO_DIR"
echo "Webhook user: $WEBHOOK_USER"

# --- 1. Install system packages ---
echo ""
echo "--- Installing system packages ---"
apt-get update
apt-get install -y nginx python3 curl git jq

# --- 2. Install Node.js (for Claude CLI) ---
if ! command -v node &>/dev/null; then
  echo ""
  echo "--- Installing Node.js ---"
  curl -fsSL https://deb.nodesource.com/setup_lts.x | bash -
  apt-get install -y nodejs
fi

# --- 3. Install Claude CLI ---
if ! command -v claude &>/dev/null; then
  echo ""
  echo "--- Installing Claude CLI ---"
  npm install -g @anthropic-ai/claude-code
fi

# --- 4. Set up repo directory ---
if [[ ! -d "$REPO_DIR" ]]; then
  echo ""
  echo "--- Cloning repository ---"
  sudo -u "$WEBHOOK_USER" git clone https://github.com/epatel/vps-ai.git "$REPO_DIR"
fi

# --- 5. Create .env.issues template ---
ENV_FILE="$REPO_DIR/.env.issues"
if [[ ! -f "$ENV_FILE" ]]; then
  echo ""
  echo "--- Creating .env.issues template ---"
  cat > "$ENV_FILE" <<'EOF'
GITHUB_TOKEN=<your-fine-grained-pat>
GITHUB_REPO=epatel/vps-ai
WEBHOOK_SECRET=<your-webhook-secret>
# Optional: override auto-detected host description
# HOST_DESCRIPTION="Ubuntu 24.04 LTS (x86_64)"
EOF
  chown "$WEBHOOK_USER:$WEBHOOK_USER" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  echo "Created $ENV_FILE — edit it with your credentials!"
fi

# --- 6. Create projects directory ---
mkdir -p "$REPO_DIR/projects"
chown "$WEBHOOK_USER:$WEBHOOK_USER" "$REPO_DIR/projects"

# --- 7. Install git hooks ---
echo ""
echo "--- Installing git hooks ---"
sudo -u "$WEBHOOK_USER" bash "$REPO_DIR/setup-hooks.sh"

# --- 8. Configure nginx ---
echo ""
echo "--- Configuring nginx ---"
cat > /etc/nginx/sites-available/ai.memention.net <<'NGINX'
server {
    listen 80;
    server_name ai.memention.net;

    location /webhook {
        proxy_pass http://127.0.0.1:5000/webhook;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        return 200 'VPS Agent Manager running.\n';
        add_header Content-Type text/plain;
    }
}
NGINX

ln -sf /etc/nginx/sites-available/ai.memention.net /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

nginx -t && systemctl reload nginx
echo "nginx configured and reloaded"

# --- 9. Create systemd service for webhook receiver ---
echo ""
echo "--- Creating systemd service ---"
cat > /etc/systemd/system/vps-ai-webhook.service <<EOF
[Unit]
Description=VPS AI Webhook Receiver
After=network.target

[Service]
Type=simple
User=$WEBHOOK_USER
WorkingDirectory=$REPO_DIR
ExecStart=/usr/bin/python3 $REPO_DIR/webhook-receiver.py
Restart=always
RestartSec=5
StandardOutput=append:$REPO_DIR/.issues-monitor.log
StandardError=append:$REPO_DIR/.issues-monitor.log

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable vps-ai-webhook
systemctl start vps-ai-webhook
echo "vps-ai-webhook service started and enabled"

# --- 10. Set up HTTPS with certbot (if not already done) ---
if ! command -v certbot &>/dev/null; then
  echo ""
  echo "--- Installing certbot ---"
  apt-get install -y certbot python3-certbot-nginx
fi

if [[ ! -d "/etc/letsencrypt/live/ai.memention.net" ]]; then
  echo ""
  echo "--- Obtaining SSL certificate ---"
  echo "Run manually: certbot --nginx -d ai.memention.net"
  echo "(Skipping automatic cert — requires DNS to be pointed at this server)"
fi

echo ""
echo "=== Setup complete ==="
echo ""
echo "Next steps:"
echo "  1. Edit $ENV_FILE with your GitHub token and webhook secret"
echo "  2. Run: sudo certbot --nginx -d ai.memention.net"
echo "  3. Add webhook on GitHub repo settings:"
echo "     URL: https://ai.memention.net/webhook"
echo "     Content type: application/json"
echo "     Secret: (same as WEBHOOK_SECRET in .env.issues)"
echo "     Events: Issues, Pull requests"
echo "  4. Restart webhook: sudo systemctl restart vps-ai-webhook"
echo "  5. Test: open an issue on the GitHub repo"
