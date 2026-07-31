# Kalender

A print-friendly month calendar generator, served at
[ai.memention.net/calender/](https://ai.memention.net/calender/).

Pick a year and a month; the page renders that month as **one line per day**,
laid out to fill exactly one **A4 portrait** page. Notes typed into the day
lines are saved in the browser and come along on the printout. Swedish red days
(*röda dagar*) can be switched on and off.

## Features

| Feature | Notes |
| --- | --- |
| Year + month picker | ±5/+10 years around the current year, `←`/`→` and *Idag* buttons |
| One line per day | Rows flex to fill the page — 28 to 31 days always fit on one sheet |
| Day notes | Click a line and type; `Enter`/`↑`/`↓` moves between days |
| Notes block | Ruled free-text area at the bottom of the page (toggleable) |
| Swedish red days | Public holidays in red, holiday eves (*helgdagsaftnar*) in grey |
| ISO week numbers | Shown on Mondays and on the first day of the month |
| Weekend shading | Light grey background for Saturdays and Sundays |
| Header title | Free-text heading, e.g. *Familjen Anderssons kalender* |
| Language | Swedish or English month/weekday/holiday names |
| Export / import | Notes as a JSON file, for backup or moving between browsers |

Everything is stored in `localStorage` under the `calender.v1.*` keys — there is
no account, no server-side state and no network traffic.

## Static, not a service

The issue that created this project asked whether the Swedish red days would
need a backend. They do not: every red day is either a fixed date or derived
from Easter Sunday, which is computed in the browser with the Gregorian
computus. So this project is a **single static `index.html`** with no build
step, no dependencies and no systemd unit.

Red days implemented (13 per year, plus every Sunday):

Nyårsdagen · Trettondedag jul · Långfredagen · Påskdagen · Annandag påsk ·
Första maj · Kristi himmelsfärdsdag · Pingstdagen · Sveriges nationaldag ·
Midsommardagen · Alla helgons dag · Juldagen · Annandag jul

Holiday eves shown (not red days, but usually short days): Trettondagsafton ·
Skärtorsdagen · Påskafton · Valborgsmässoafton · Pingstafton · Midsommarafton ·
Allhelgonaafton · Julafton · Nyårsafton.

## Printing

Use the **Skriv ut / PDF** button (or ⌘/Ctrl-P). The print stylesheet sets
`@page { size: A4 portrait; margin: 10mm }` and hides the control panel, so what
you see in the white sheet on screen is what lands on paper.

Enable *Background graphics* in the browser's print dialog if you want the
weekend shading and the ruled note lines on the printout.

## Development

The file is self-contained — open it directly:

```bash
xdg-open projects/calender/index.html          # or just drag it into a browser
python3 -m http.server -d projects/calender    # http://localhost:8000/
```

### Tests

The holiday and ISO-week math is checked against reference dates from the
Swedish almanac for 2023–2030:

```bash
node projects/calender/test-holidays.js
```

The test extracts the functions straight out of `index.html`, so there is no
second copy of the logic to drift out of sync.

## Deployment

Static site served by nginx via an `alias` block — see `nginx.conf.example`
and `cards/nginx-conventions.md`. No build and no restart needed; a merge to
`main` is enough.
