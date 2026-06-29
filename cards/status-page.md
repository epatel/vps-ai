# status-page

The service monitor at `projects/status-page/server.py`, how to register a project with it, and its event-log endpoint.

## Registering a project

`projects/status-page/server.py` monitors all services. When adding a new project:

1. Add an entry to the `SERVICES` list in `server.py`
2. Use `check_type="port"` for backend services, `"file"` for static sites
3. For POST-only services, add `{"port_only": True}` to skip the GET-based nginx check
4. For APIs with no root route, add `{"check_path": "/path/to/health"}`
5. The status page checks nginx routing — it detects fallback/catch-all responses as "degraded"

## Event log

The status page exposes `POST /status/log` for posting deploy/notification
events (JSON `{"source": "...", "message": "..."}`, Bearer token auth via the
`STATUS_LOG_TOKEN` env var). The last 200 events are kept in
`projects/status-page/.events.jsonl` (gitignored, restored on restart); the
last five render in the "Recent Events" panel below METRICS.

The token lives in a systemd drop-in
(`/etc/systemd/system/status-page.service.d/env.conf`) on the server and as the
`STATUS_LOG_TOKEN` GitHub Actions secret. The Flutter deploy workflow posts a
success/failure event per matrix project; other hooks or scripts can post via
the same endpoint.

The page also serves `/status/json`, consumed by the landing page to show live
status dots.
