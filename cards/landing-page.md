# landing-page

The root landing page at `projects/landing/index.html` and how to add a card for a new project.

The root URL (`/`) serves `projects/landing/index.html` — a static page with
clickable cards linking to each project. It fetches `/status/json` to show live
status dots (green/orange/red) on each card.

When adding a new project:

1. Add a card to `projects/landing/index.html` inside the `<div class="cards">` block
2. Use a `data-path` attribute on the status dot to match the service path in `projects/status-page/server.py`
3. For projects not served through nginx (e.g. Poem), link to the GitHub source and omit the status dot
4. Pick a badge type: `game`, `app`, `tool`, or `api` (`guide` is reserved for the "Agent setup" section below the projects grid)

## Extra pages under the landing site

Because `location /` is an `alias` for `projects/landing/`, anything inside that
directory is already served — a small standalone page needs **no nginx block and
no status-page entry**. Put it at `projects/landing/<name>/index.html` and it is
reachable at `/<name>/`; link it from the landing page with a card that omits
the status dot (there is no service to probe).

Use this for single-page tools that belong to the site rather than being
projects in their own right. Current examples:

- `projects/landing/test-hdr/` → `/test-hdr/` — drop an image to view it in HDR,
  inspect its HDR metadata (parsed client-side) and see its headroom above SDR
  white, measured by applying an Ultra HDR gain map when the file carries one
- `projects/landing/spcx.html` → `/spcx.html`

Anything that needs its own backend, build step, or health check is a real
project under `projects/` with its own nginx block instead.

`projects/landing/setup` holds the structured-docs onboarding instructions
(the pattern menu fetched via `https://ai.memention.net/setup`), and
`projects/landing/cards/` holds the pattern cards it links to plus
`check-agent-docs.py`, the verifier its Step 4 downloads. All three are linked
from the "Agent setup" section of the landing page.

Edits to the files `ai-setup.manifest` lists are blocked by a hook
(`.claude/hooks/protect-ai-setup.py`) — change them at their source. Their source is the
separate `ai-setup` repo (`~/Development/claude/ai-setup`, `site/`), which syncs
them in with `make sync` / `make publish`. `projects/landing/ai-setup.manifest`
lists every file it owns with its hash; a hand edit here is reported as drift
and blocks the next sync until it is pulled back with `make pull` there. Files
in `cards/` that are not in the manifest are never touched by the sync.
