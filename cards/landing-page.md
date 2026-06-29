# landing-page

The root landing page at `projects/landing/index.html` and how to add a card for a new project.

The root URL (`/`) serves `projects/landing/index.html` — a static page with
clickable cards linking to each project. It fetches `/status/json` to show live
status dots (green/orange/red) on each card.

When adding a new project:

1. Add a card to `projects/landing/index.html` inside the `<div class="cards">` block
2. Use a `data-path` attribute on the status dot to match the service path in `projects/status-page/server.py`
3. For projects not served through nginx (e.g. Poem), link to the GitHub source and omit the status dot
4. Pick a badge type: `game`, `app`, `tool`, or `api`

`projects/landing/setup` holds the structured-docs onboarding instructions
(the pattern menu fetched via `https://ai.memention.net/setup`).
