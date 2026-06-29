# server-setup

One-time provisioning: cloning, the GitHub PAT, `.env.issues`, and the webhook configuration.

## Setup after cloning

```bash
# One-time server setup
sudo bash setup-server.sh

# Or manually:
# Install git hooks
bash setup-hooks.sh

# Create .env.issues
cat > .env.issues << 'EOF'
GITHUB_TOKEN=<fine-grained-pat>
GITHUB_REPO=epatel/vps-ai
WEBHOOK_SECRET=<random-secret>
EOF
chmod 600 .env.issues
```

## `.env.issues`

```
GITHUB_TOKEN=<fine-grained-pat>
GITHUB_REPO=epatel/vps-ai
WEBHOOK_SECRET=<random-secret>
# Optional:
# HOST_DESCRIPTION=<custom-description>
```

## GitHub token permissions (fine-grained PAT)

- **Issues**: Read and write
- **Pull requests**: Read and write
- **Contents**: Read and write

## Webhook setup

Add a webhook on `epatel/vps-ai` repo settings:

- **URL:** `https://ai.memention.net/webhook`
- **Content type:** `application/json`
- **Secret:** matches `WEBHOOK_SECRET` in `.env.issues`
- **Events:** Issues, Pull requests, Pushes
