# deploy-pipeline

How code reaches the server: the post-merge git hook for services, and the GitHub Actions build+rsync deploy for Flutter web apps.

## On merge / push to main

When a PR is merged (or code is pushed to `main`), the webhook triggers
`git pull` on the server, and the `hooks/post-merge` git hook auto-restarts
systemd services whose project files changed and rebuilds Flutter web apps.
Flutter is **not** required on the server — the post-merge hook does not build
Flutter projects (GitHub Actions does, see below).

## Flutter web projects

Built and deployed by **GitHub Actions** (`.github/workflows/build-flutter-web.yml`).
On push to `main`, the workflow detects which `projects/*/` directories changed,
runs `flutter build web` in each, and `rsync`s the output into
`~/vps-ai/projects/<name>/build/web/` on the server.

- Build output (`build/`) is **gitignored** — never commit it
- The `--base-href /<project-name>/` flag is applied automatically
- Pull requests build but do not deploy
- Adding a new Flutter project requires no config changes — just create it under `projects/`

## Restricted deploy key

Deploy is over SSH using a restricted key:

- `DEPLOY_SSH_KEY` (GitHub secret) — private ed25519 key
- `DEPLOY_KNOWN_HOSTS` (GitHub secret) — output of `ssh-keyscan -t ed25519 ai.memention.net`
- The matching public key sits in `epatel@ai.memention.net:~/.ssh/authorized_keys`,
  prefixed with `command="rrsync -wo /home/epatel/vps-ai/projects",no-pty,no-agent-forwarding,no-port-forwarding,no-X11-forwarding`
  so the key can only `rsync` into subpaths under `~/vps-ai/projects/`
