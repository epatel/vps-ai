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
- 2026-10-15 — Re-ran `ai.memention.net/setup` (v2026-10-15, update mode). Added
  Standing Defaults (copied card; this repo keeps `venv/`, which `hooks/post-merge`
  expects) and Hooks Over Prose (a `PreToolUse` hook blocks edits to files listed
  in `projects/landing/ai-setup.manifest`). Declined the feature-first and two-tier
  patterns. The choices are recorded in `.claude/agent-setup.json`, so re-reading the setup now runs a refresh.

## Current state / handoff

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
