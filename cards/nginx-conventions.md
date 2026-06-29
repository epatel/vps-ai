# nginx-conventions

How nginx serves projects on `ai.memention.net`, and the rules for adding a new location block.

Nginx config lives at `/etc/nginx/sites-available/ai.memention.net` on the
server. `sites-enabled` is a **symlink** to `sites-available` — always edit
`sites-available`.

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
