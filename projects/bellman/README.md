# The Stockholm Mystery — A Pub Walk

A mobile-first, single-page web app for a self-guided mystery game through five
taverns in Gamla stan. Players walk between pubs, scan a QR code at each stop,
read the story, solve a small puzzle, and assemble the answers into the final
reveal.

## Tech

- **Vanilla HTML / CSS / ES modules** — no build step, no dependencies.
- **Hash-based router** in `scripts/app.js` (`#/`, `#/stop/:id`, `#/finale`).
- **Local storage** for game state (`scripts/state.js`) — no backend needed.
- **Mobile-first** responsive layout, with a candlelit 18th-century theme
  (parchment cards, ember accents, animated candle flicker).

## Running locally

Because the app uses ES modules, it must be served over HTTP (not `file://`).
Any static server works; some easy options:

```sh
# Python
python3 -m http.server 8000

# Node
npx serve .
```

Then open <http://localhost:8000> in your browser. Resize the window narrow,
or use device-emulation in DevTools, to see the mobile layout.

## Project structure

```
index.html              — App shell + atmospheric overlays
qr-codes.html           — Printable sheet of QR codes for each pub
styles/main.css         — Theme, layout, typography, components
scripts/
  app.js                — Router + view rendering
  state.js              — localStorage-backed progress / answers
  stops.js              — Stop data: stories, riddles, answers, walking dirs
  puzzles.js            — Puzzle renderers (one per mechanic)
  dom.js                — Tiny DOM helpers
vendor/
  qrcode-generator.mjs  — Kazuhiko Arase's QR encoder, MIT (vendored)
assets/qr/              — Pre-generated SVG QR codes (one per stop)
tools/
  generate-qr.mjs       — Regenerate the static SVGs at a given base URL
```

## Deep links / QR codes

Each pub displays a QR code that links directly into its stop, e.g.
`https://yourdomain.example/index.html#/stop/wirstroms`.

**Two ways to produce printable QR codes:**

1. **`qr-codes.html`** — open in a browser, set your base URL, click "Print".
   The page renders QR codes client-side (using the vendored encoder), so
   you can re-target them to any host without rebuilding anything. Each
   card is sized to print one-per-page on A4.

2. **`assets/qr/<stop-id>.svg`** — pre-rendered static SVGs, ready to drop
   into a print sheet, slide deck, or framed printout. Regenerate with:

   ```sh
   node tools/generate-qr.mjs https://your-deployed-site.example
   ```

**Unlock model — by design:** The home page enforces linear unlock (you must
solve stop N before stop N+1 appears unlocked on the landing list), but the
QR codes deep-link straight to each stop. A player who scans the QR at pub 3
without having solved 1 and 2 will land on stop 3's page and can read &
play it — they just won't have the keepsakes needed to assemble the final
verse. This is intentional: walk-ups, latecomers, and out-of-order groups
get a working stop page; the puzzle chain naturally enforces the sequence
through the keepsake clues.

## Walking directions

Each stop carries structured walking directions to the next stop, including
turn-by-turn steps, walk time, distance, landmarks, and deep links to both
Google Maps and Apple Maps. The directions appear as a card on the
stop page after the puzzle is solved. Edit them in `scripts/stops.js`
under each stop's `directions.walking` block.

## Adding / editing a stop

Edit `scripts/stops.js`. Each entry has `id`, `num`, `title`, `location`,
`intro`, `story`, and `puzzle: { prompt, answer, hint }`. Answers are matched
case-insensitively against the player's trimmed input.

## Resetting progress

A "Reset progress" link in the footer clears localStorage and returns to
the landing page.

## Deployment

This is a plain static site — drop the directory onto Netlify, Vercel,
GitHub Pages, S3+CloudFront, or any other static host. No build needed.
