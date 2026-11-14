# nginx-conventions

How nginx serves projects on `ai.memention.net`, and the rules for adding a new location block.

Nginx config lives at `/etc/nginx/sites-available/ai.memention.net` on the
server. `sites-enabled` is a **symlink** to `sites-available` — always edit
`sites-available`.

A verbatim copy is tracked in `nginx/ai.memention.net.conf`. Edits happen on
the live file, by issue agents with sudo or by hand, and the repo copy follows:

- **After a live edit:** copy the file into the repo and commit it. An agent
  does this from its worktree with `cp /etc/nginx/sites-available/ai.memention.net nginx/ai.memention.net.conf`;
  from a local checkout, use `make nginx_pull`.
- **Checking drift:** `make server_status` shows `nginx: in sync` or
  `OUT OF SYNC`, and `bash deploy-server.sh nginx-diff` on the server shows
  the diff.
- **When a pull brings a repo change that is not live yet:** `deploy-server.sh post`
  prints the review and apply commands (`sudo cp … && sudo nginx -t && sudo systemctl reload nginx`).
  Nothing applies the change automatically.
- **Keep the copy verbatim, without comments or reformatting.** The drift check is a byte comparison.
- **Missing pieces on a rebuilt server:** the file needs the Let's Encrypt certificate and the
  `include`s from the sibling repos it names (sl-chat, sl-mcp,
  wcag_checker_frontend, luni-demo).
- **Never replace the symlink with a copy, and never leave backups in `sites-enabled/`.** nginx
  loads every file there. A regular file there silently becomes the served
  config. A backup with the same `server_name` triggers "conflicting server name"
  warnings. `make server_status` reports a broken symlink as `SPLIT`. Keep backups outside `/etc/nginx/sites-enabled/`. `setup-server.sh` installs it only when
  those exist, and otherwise installs a minimal bootstrap config.

When adding a new project that needs to be served:

- **Static sites**: add an `alias` location block pointing to the project directory
- **Python services**: add a `proxy_pass` location block to the service port
- **WebSocket services**: add a separate location block with `proxy_http_version 1.1` and `Upgrade` headers
- **Flutter web apps**: use `alias` to `build/web/` with `try_files` for SPA routing

The catch-all `location /` serves the landing page. New location blocks must be
added **before** it (nginx uses longest prefix match, but the catch-all `alias`
can interfere).

After editing:

```bash
sudo nginx -t && sudo systemctl reload nginx
```
