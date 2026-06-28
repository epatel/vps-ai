# Issue #118: Fix serve emoji-mixer

## Problem
`https://ai.memention.net/emoji-mixer/` returned **404**, and the status page
showed emoji-mixer as down.

## Root cause
The nginx config had drifted. `/etc/nginx/sites-enabled/ai.memention.net` was a
**regular file**, not a symlink to `sites-available` as CLAUDE.md expects. The two
files diverged:

- `sites-available/ai.memention.net` had the `/emoji-mixer` location block but was
  missing newer additions (kanban-demo, sl-chat/sl-mcp/wcag includes).
- `sites-enabled/ai.memention.net` (the **live** config) had those newer additions
  but was **missing the `/emoji-mixer` block**.

So requests for `/emoji-mixer` fell through to the catch-all `location /`
(landing), producing `/home/epatel/vps-ai/projects/landing/emoji-mixer` → 404.

A stray `ai.memention.net.bak-wcag-20260627-185955` file also sat inside
`sites-enabled`, so nginx loaded it as a second server block — the source of the
`conflicting server name "ai.memention.net"` warnings.

## Fix (server-side, /etc/nginx)
1. Built a merged config = live `sites-enabled` content **+** the `/emoji-mixer`
   location block, written to `sites-available/ai.memention.net` (now the complete
   superset / source of truth). Old file backed up to
   `sites-available/ai.memention.net.bak-emoji-<ts>`.
2. Removed the stray `sites-enabled/ai.memention.net.bak-wcag-*` file (kills the
   conflicting-server warning).
3. Replaced the diverged `sites-enabled/ai.memention.net` regular file with a
   **symlink** to `sites-available/ai.memention.net`, restoring the CLAUDE.md
   invariant so future edits to `sites-available` take effect.
4. `sudo nginx -t && sudo systemctl reload nginx`.

## Verification
- `GET /emoji-mixer/` → 200, `<title>Emoji Mixer</title>`
- `GET /emoji-mixer` → 301 → 200; `/emoji-mixer/index.html` → 200
- No regressions: `/`, `/status/`, `/kanban-demo/` all 200
- `nginx -t` clean, conflicting-server warning gone
- Status page (`/status/json`) now reports Emoji Mixer **up**
