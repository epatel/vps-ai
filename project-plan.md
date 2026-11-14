# Project Plan: VPS Agent Manager (ai.memention.net)

## Goal
Maintain a reliable, GitHub-issue-driven autonomous agent system on
`ai.memention.net` that turns issues into reviewed PRs, and that hosts a
growing set of small web apps/games and Python services under `projects/`.
Every change keeps the issue→worktree→PR→deploy pipeline working and keeps
`CLAUDE.md`/`README.md` in sync with the code.

## Non-goals
- Refactoring or rewriting the individual `projects/*` apps unless an issue asks for it.
- Documenting the issue-authorization key scheme or `public.pem` in `CLAUDE.md`/`README.md` (intentionally kept out of public docs).
- Requiring Flutter on the server (Flutter web builds happen in GitHub Actions).

## Milestones
- [ ] (ongoing) Keep the webhook → monitor → run-agent → PR pipeline healthy
- [ ] (ongoing) Keep the status page + landing page accurate as projects are added
- [ ] (ongoing) Keep docs (`CLAUDE.md`, `README.md`) in sync with system changes

## Decisions
- 2026-06-29 — Adopted structured-docs patterns from `ai.memention.net/setup`:
  Shared Project Plan, Context Cards, and Agent Skills. Locked.
- 2026-06-29 — Installed all 8 project-scoped skills from `epatel/agent-skills`
  under `.claude/skills/` (adt-types, backward-planning, clean-modules,
  design-system, focused-refactor, makefile-actions, project-discovery,
  state-machines). Useful when agents work on the separate `projects/*`. Locked.
- 2026-11-04 — Re-copied all 9 installed skills from `epatel/agent-skills`
  (bcbd8a0; none had local edits) and applied the 2026-10-16.3 card-maintenance
  wording to `CLAUDE.md`. Setup refreshed to v2026-11-04.2: installed
  `double-check`; declined Known Stack and `minimal-repro`.
- 2026-11-13 — Setup refreshed to v2026-11-13: re-copied `review-agentic-setup`
  (940b48c) and applied Code Health Feedback. aihealth v0.3.1 lives in a
  gitignored tool venv `.venv/` (kept apart from the services' `venv/`), and
  `run-agent.sh` symlinks it into each issue worktree so server agents get the
  hooks too. Baseline: project score 6.71.
- 2026-11-13 — Setup refreshed to v2026-11-13.2: re-copied `review-agentic-setup`
  (2d8dd9a, project scope only; no local edits, no `GLOBAL_UPDATE_PLAN_*` files
  to clean up).
- 2026-10-15 — Re-ran `ai.memention.net/setup` (v2026-10-15, update mode). Added
  Standing Defaults (copied card; this repo keeps `venv/`, which `hooks/post-merge`
  expects) and Hooks Over Prose (a `PreToolUse` hook blocks edits to files listed
  in `projects/landing/ai-setup.manifest`). Declined the feature-first and two-tier
  patterns. The choices are recorded in `.claude/agent-setup.json`, so re-reading the setup now runs a refresh.
- 2026-11-14 — Webhook hardened. With an empty `WEBHOOK_SECRET` it now refuses every
  request (403) instead of skipping the signature check. The PR-merged handler does
  the same ff-only pull as push, with no auto-commit or file deletion on the server.
  The live nginx site config is tracked verbatim in `nginx/ai.memention.net.conf`:
  live edits get copied back (`make nginx_pull`, or `cp` from an agent worktree),
  and `make server_status` reports drift. Locked.
- 2026-11-14 — Setup refreshed to v2026-11-14.3:
  - Copied `review-agentic-setup` again (0b639fe: report-only mode, numeric version compare) and `project-discovery` (asks first, installs into the gitignored `.venv-tools/project-discovery/`). Neither had local edits.
  - Replaced the copied `cards/standing-defaults.md`, which was unedited (migration runner refuses a newer database).
  - Recorded tools in `.claude/agent-setup.json`: aihealth v0.3.1 in the project venv, python ≥3.11, git ≥2.24.
  - No project has a `migrate()` copied from the card, so no code changed.

## Current state / handoff

- 2026-11-14 — nginx on the server cleaned up (live, reloaded):
  - `sites-enabled/ai.memention.net` had become a regular file (edited 2026-10-21) instead of the symlink, so `sites-available/` was a stale Sep 7 copy with `/drop/` at 55M.
  - The served file was copied to `sites-available/`, and `sites-enabled/` is a symlink again. `/drop/` stays at `client_max_body_size 205M`, which fits the 200 MB `MAX_UPLOAD_SIZE`.
  - Removed the unused `sites-enabled/ai.memention.net.bak-omai`, which caused the "conflicting server name" warnings.
  - Removed omai-recept from serving: the nginx `include` for `/omai/` is gone, and `omai-recept.service` (port 8097) is stopped, disabled and its unit file deleted. Its directory `/home/epatel/omai-recept` (812 MB) is still on disk.
  - Backups are on the server in `/tmp/nginx-backup.EMD7/`: the three nginx files, the config before the omai change, and `omai-recept.service`.
  - `nginx/ai.memention.net.conf` now matches the served file, and `make server_status` flags a broken symlink as `SPLIT`.

- 2026-10-21 (#125) — `projects/drop/`: upload limit raised to 200MB
  (server, both clients, nginx `client_max_body_size 205M` live + example);
  uploads now stream to `uploads/.tmp/` and are moved into place instead of being
  buffered in RAM. Desktop pairing screen gained a "join another device" code
  field, so two desktops pair with just the code (the joiner takes the room's
  `token_b`/"phone" slot; the server detaches it from its own placeholder room).

- 2026-08-17 — `projects/landing/test-hdr/`: the page now reports actual HDR
  headroom for gain-map JPEGs. It extracts the appended gain-map image (MPF
  MPEntry offsets, falling back to the GContainer `Item:Length` tail), parses
  that image's own `hdrgm` XMP (which the primary image does not carry), and
  applies the gain map in JS to measure the real peak — the float16 probe alone
  always reads 1.000, because `createImageBitmap` returns the SDR base
  rendition. Shows a headline "HDR headroom N× SDR white (+n stops)" banner.

- 2026-08-11 — Added `projects/landing/test-hdr/index.html`, served at
  `/test-hdr/` by the existing landing catch-all (no nginx change, no status
  entry). Drag-and-drop/paste an image; it renders with
  `dynamic-range-limit: no-limit` next to an SDR-clamped copy, probes the
  browser/display (`dynamic-range`, `color-gamut`, float16 canvas, canvas tone
  mapping) and parses HDR metadata client-side: JPEG segments + ICC + XMP
  `hdrgm` gain map + MPF, PNG `cICP`/`mDCv`/`cLLi`, ISOBMFF (AVIF/HEIC) `colr`
  nclx/ICC + `clli`/`mdcv` + `tmap` gain-map item, WebP. Linked from the
  landing page (no status dot).

- 2026-08-10 — `projects/calender/`: added Swedish flag days (*allmänna
  flaggdagar*, SFS 1982:270) as a separate toggle from the red days. Marked with
  a blue ⚑; the flag day's own name is printed only when the row is not already
  labelled by a holiday or eve. Riksdag election day is derived (2nd Sunday in
  September, every 4th year from 2018); EU parliament elections are left out.
  Covered by `test-holidays.js`.

- 2026-07-31 (#122) — Added `projects/calender/`, a static single-page printable
  A4 month calendar (year/month picker, one line per day, per-day + page notes
  in localStorage, Swedish red days computed client-side from Easter, no
  backend). Served via an nginx `alias` block at `/calender/` (with `/calendar`
  redirects), registered in the status page `SERVICES` list and on the landing
  page.

Initial project plan created as part of applying the `ai.memention.net/setup`
patterns. Context cards live under `cards/` (indexed from `CLAUDE.md`). Agents
working an issue should read this file first and update Current state +
Decisions before finishing.

## Open questions
- None currently.
