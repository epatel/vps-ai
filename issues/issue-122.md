# Issue #122: Add calender

## Requests
1. Create a calendar generator, served from `/calender`
2. Investigate how other pages/services are served
3. Select year and month
4. Show the month as lines — goal is to print as portrait A4
5. Make it possible to add notes that end up on the printout
6. Option to add Swedish red days (static page or server — to be decided)

## Status: Done

## Result
New static project `projects/calender/` (single self-contained `index.html`),
served by nginx at <https://ai.memention.net/calender/>.

- **Year/month picker** with `←`/`→` and *Idag* buttons.
- **One line per day**: the day rows are flex children of a fixed A4 content box
  (190 × 277 mm), so 28–31 days always fill exactly one portrait page.
- **Notes**: click a day line and type — saved in `localStorage`
  (`calender.v1.*`) and printed. Plus a ruled free-text notes block at the
  bottom of the page. Export/import as JSON.
- **Swedish red days**: decided it needs **no server**. Every red day is either
  a fixed date or derived from Easter Sunday, computed in the browser
  (Gregorian computus). Holiday eves (*helgdagsaftnar*) are a separate toggle.
- Extras: ISO week numbers, weekend shading, header title, Swedish/English.

## Serving (investigated pattern)
Other static projects use an nginx `alias` block in
`/etc/nginx/sites-available/ai.memention.net` before the catch-all `location /`.
Same pattern used here, plus `/calendar` → `/calender/` redirects for the
alternative spelling. Also registered in `projects/status-page/server.py`
(`SERVICES`) and given a card on the landing page.

## Tests
`node projects/calender/test-holidays.js` — checks Easter-derived holidays,
Midsummer/All Saints Saturday rules, holiday eves and ISO week numbers against
Swedish almanac reference dates for 2023–2030. Rendering, note persistence,
toggles and single-page A4 PDF output verified with headless Chromium.
