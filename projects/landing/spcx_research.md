# SPCX (SpaceX) — data verification for `spcx.html`

> **Latest pass: 2026-08-03 — see [Pass 2](#pass-2--2026-08-03) at the end.**
> Pass 1 below is retained for history; several of its figures are now stale.

## Pass 1 — 2026-07-01

Research date: **2026-07-01**. Purpose: sync the lock-up tracker's values and
dates with public sources. Figures are journalistic/aggregator sources compiled
post-IPO; primary truth remains the SpaceX **424B4 / S-1 on SEC EDGAR**.

## Sources

- CNBC — IPO recap: <https://www.cnbc.com/2026/06/12/spacex-ipo-spcx-live-updates.html>
- CNBC — early-release lock-up: <https://www.cnbc.com/2026/05/21/spacex-insiders-will-get-to-sell-shares-earlier-than-usual-after-the-ipo.html>
- BiyaPay — lock-up schedule, float, greenshoe, Musk block (most detailed): <https://www.biyapay.com/en/blogdetail/4087-spacex-spcx-lockup-expiration-schedule-20262027-fl>
- StockAlarm — lock-up + financials: <https://pro.stockalarm.io/blog/spacex-ipo-lockup-financials>
- Darrow Wealth — employee lock-up dates: <https://darrowwealthmanagement.com/blog/spacex-ipo-employee-lockup-release-dates/>
- Modern Financial Planning — release schedule: <https://www.modernfp.com/blog/2026/6/8/spacex-shares-release-schedule-post-ipo>
- TradingView — quote: <https://www.tradingview.com/symbols/NASDAQ-SPCX/>
- Seeking Alpha — Nasdaq-100 inclusion: <https://seekingalpha.com/news/4607865-spacex-to-join-nasdaq-100-effective-july-7-2026>
- RIMES / CME Group — index inclusion mechanics (MSCI/Nasdaq-100/S&P 500)

## Verified — matches the page (no change)

| Field | Value | Notes |
|---|---|---|
| IPO pricing date | **Jun 11, 2026** | ✓ |
| First trade | **Jun 12, 2026** | ✓ |
| IPO price | **$135 / sh** | ✓ |
| Ticker / exchange | **SPCX / Nasdaq** | ✓ |
| 180-day full expiry | **Dec 8, 2026** | ✓ (Jun 11 + 180d; ModernFP's "Dec 9" is off by one) |
| Q2 tranche | **20%** of block, late Jul / early Aug | ✓ |
| Bonus tranche | **+10% if ≥ $175.50 (30% over IPO) on 5 of 10 days into Q2** | ✓ exact |
| Fixed tranches | **7%** each at T+70/90/105/120/135 | ✓ |
| Q3 tranche | **28%** of block, late Oct / early Nov | ✓ |
| Musk lock-up | **366 days, expires ~Jun 12, 2027, no early release** | ✓ |
| MSCI inclusion | **Jun 25, 2026** (close of 10th trading day, seasoning waived) | ✓ |
| Nasdaq-100 | **effective Jul 7, 2026** (fast-track, 15 trading days) | ✓ confirmed by Seeking Alpha |
| S&P 500 | **mid-2027+, 12-mo seasoning, no fast-track** | ✓ |

## Discrepancies found → corrections applied to `spcx.html`

### 1. Last price was stale
- Page had **$153.23 (+13.5%)** "as of Jun 26 close".
- Sources: day-1 close **$160.95**; current **$170.86** (Jul 1, 2026).
- **Fix:** last price → **$170.86**, delta → **+26.6%** vs IPO, as-of → **Jul 1, 2026**.

### 2. Market cap
- Page had **$2.02T**.
- Sources: **~$2.16T** (TradingView, Jul 1); IPO-day valuation ~$1.77T→$2.1T (CNBC).
- **Fix:** market cap → **$2.16T** (fully diluted).

### 3. Float understated (greenshoe exercised)
- Page used **555.6M** shares as the float.
- Sources: base offering **555.6M** + greenshoe **83,333,333 fully exercised** = **638.9M** float (≈4.88% of basic count).
- **Fix:** float basis for lock-up math → **638.9M**; label notes "incl. greenshoe".

### 4. Locked-block size was WRONG (biggest error)
- Page derived the "180-day locked block" as **fully diluted − float ≈ 12.62B**.
- That is wrong: it swept in **Musk's 6.4B shares** (separate **366-day** lock) and
  an extended-investor group that unlocks in 2027 — none of which are in the
  180-day block.
- Sources: the **180-day block ≈ 4.56B shares**. Anchors:
  - Q2 20% = **911.5M** → block ≈ 4.56B
  - Q3 28% ≈ **1.3B** (BiyaPay: 9.94% of the 13.076B basic count)
  - 5×7% (T+70..135) ≈ **1.6B** total
  - Dec tail 17% ≈ **775M** (BiyaPay range 328–798M)
- **Fix:** `LOCKED` constant → **4.56B** (explicit; no longer FD − float).
  Per-step shares now read ~912M (20%), ~319M (7%), ~1.28B (28%), ~775M (17%),
  matching sources instead of being ~2.7× too high.

### 5. Basic share count
- Page implied ~13.18B (from the stale $2.02T / $153.23).
- Source (BiyaPay): **13.0759B basic shares**.
- **Fix:** `FD` constant → **13.08B**.

### 6. Musk block detail
- **Fix:** extended (T+366) entry now names **~6.4B shares (Class B + options)**.

## Not independently verified (left as-is; flagged)

These sit on the page but were outside this pass — no primary source pulled.
Verify against the S-1/424B4 and FY filings before relying on them:

- FY2025 segment revenue: Starlink $11.4B, Space $4.1B, xAI/AI $3.2B; EBITDA $6.6B.
- Starlink: 10.3M subs, +105% YoY, 164 markets, $1.6T TAM.
- Starship milestones; Musk voting ~82.4% (plausible via Class B supervoting;
  BiyaPay lists ~48.95% *economic* stake — voting ≠ economic).

---

# Pass 2 — 2026-08-03

Cross-check triggered by comparing the page against <https://spcx.cx/>.
Validated against ~10 sources including **SpaceX IR** and **Nasdaq IR** primary
releases, which resolve the disagreements between aggregators.

## Sources added this pass

- SpaceX IR — Q2 2026 earnings date (**primary**): <https://ir.spacex.com/updates/releases-details/2026/SpaceX-to-Post-Second-Quarter-2026-Results-and-Host-Webcast-on-August-4-2026-2026-g8layJlbFm/default.aspx>
- Nasdaq IR — Nasdaq-100 inclusion (**primary**): <https://ir.nasdaq.com/news-releases/news-release-details/space-exploration-technologies-corporation-join-nasdaq-100>
- CNBC — earnings date sets first unlock: <https://www.cnbc.com/2026/07/21/spacex-spcx-earnings-lock-up-expiration.html>
- CNBC — greenshoe fully exercised: <https://www.cnbc.com/2026/06/15/spacex-ipo-spcx-greenshoe-overallotment.html>
- Investing.com — $123B unlock: <https://www.investing.com/news/stock-market-news/spacex-ipo-lockup-expiry-123b-in-shares-set-to-unlock-in-early-august-2026-93CH-4796311>
- Seeking Alpha — MSCI early inclusion: <https://seekingalpha.com/news/4601647-msci-early-index-inclusion-rules-spacex-ipo>
- companiesmarketcap — market cap: <https://companiesmarketcap.com/spacex/marketcap/>
- Morningstar — S-1 financials: <https://www.morningstar.com/stocks/6-charts-spacexs-s-1-financials>
- spcx.cx — competing tracker (see caveat below)
- purepowerpicks, tokenomist.ai — secondary lock-up trackers

## Confirmed — no change needed

The **structure** of the page held up completely. Pass 1's biggest correction
(`LOCKED` = 4.56B, not FD − float) is now independently confirmed: SpaceX IR /
CNBC put the 20% tranche at **911.5M shares**, so the block = **4.5575B**.

Also re-confirmed: float **638,888,888** (555,555,555 + 83,333,333 greenshoe,
CNBC); basic **13.08B**; tranche shape 20 / 7×5 / 28 / 17; bonus terms verbatim;
Musk **6.4B / 366 days / no early release**; **Dec 8, 2026** full expiry;
Nasdaq-100 **Jul 7, 2026** (Nasdaq IR).

The FY2025 figures flagged "not independently verified" in Pass 1 now **check
out**: consolidated revenue $18.7B, Starlink $11.4B (+50%, 63% segment EBITDA
margin), launch ~22% ≈ $4.1B, AI ~17% ≈ $3.2B with ~$6.35B op. loss, adjusted
EBITDA $6.6B, Starlink 10.3M subs / 164 markets as of Mar 31, 2026.
Still unverified: Space segment −$657M op. loss, Starship flight-test count,
Musk ~82.4% voting.

## Discrepancies found → corrections applied to `spcx.html`

### 1. First unlock date was wrong — and the page was misreporting live
- Page had **`2026-08-01` (~T+51)**, which on Aug 3 rendered the 20% / 911.5M
  tranche as **already released when it had not happened**.
- SpaceX IR: Q2 2026 results **Aug 4, after close**. Lock-up permits sales from
  the second full trading day after → **Aug 6, 2026** (CNBC, Investing.com).
- **Fix:** date → `2026-08-06`, `t` → **T+56**, `when` → "Aug 6, 2026", desc now
  states the Aug 4 print and the two-trading-day rule.

### 2. Market cap was stale by ~52%
- Page had **$2.16T** "as of Jul 1" and Pass 1 copy framed the stock as
  **+26.6% vs IPO**.
- Reality: SPCX closed **$108.37 on Jul 31, 2026** — *below* the $135 IPO price,
  down ~52% from its **$225.64** high. Market cap ≈ **$1.42T**
  (companiesmarketcap $1.427T; spcx.cx implied $1.36T on a different count).
- **Fix:** market cap is **no longer hardcoded**. Added `LAST_CLOSE` /
  `LAST_CLOSE_AS_OF` constants; the cell derives `LAST_CLOSE × FD`, the % vs IPO,
  and colours it red/green from the sign. **To refresh, update only those two
  constants** — the displayed cap, delta, and as-of all follow.

### 3. Bonus tranche is dead, not conditional
- Page presented **+10% if ≥ $175.50** as an open possibility.
- With SPCX near $108 into the Aug 4 print, ≥$175.50 on 5 of the 10 trading days
  ending on the release is unreachable. spcx.cx tracks it explicitly:
  *"above on 0 of 10 trading days"*.
- **Fix:** bonus text rewritten as **NOT triggered**, new `.bonus.dead` style
  (dimmed rather than amber), and the Dec 8 entry now explains that its **17%**
  = the 7% tail **plus** the 10% trigger tranche that never fired. The tranche
  arithmetic was already correct for the not-fired case (sums to 100%).

### 4. T+90 was off by one day
- Jun 11 + 90 = **Sep 9**, page had **Sep 10**. Corroborated by the tokenomist /
  StockMKTNewz timeline, which matches every other page date exactly
  (Aug 20, Sep 9, Sep 24, Oct 9, Oct 24, Dec 8).
- **Fix:** → `2026-09-09`, and noted Rule 144 / 701 eligibility begins here.

### 5. MSCI effective date was wrong
- Page had **Jun 25, 2026** (a Pass 1 *derivation* from the 10th-trading-day
  rule, not a reported date).
- MSCI added SPCX to its standard and large-cap indexes effective
  **Jun 29, 2026** (17 days after listing). **Jun 26** was the separate *Russell*
  reconstitution — likely the source of the confusion.
- **Fix:** date → `2026-06-29`; desc rewritten as reported fact rather than
  earliest-possible estimate; fine print now names the Russell date.

## Caveat: do NOT sync this page to spcx.cx

spcx.cx disagrees with `spcx.html` on the schedule, and **spcx.cx is the wrong
one** on the material point:

- It states *"Q2 2026 results are scheduled for Sep 2, 2026"* and dates the 20%
  unlock to **Sep 4** — a stale estimate never updated after SpaceX IR announced
  Aug 4 on Jul 20. It consequently orders T+70 **before** the earnings tranche,
  which only holds under its wrong September assumption.
- It anchors to **Jun 12 (first trade)** rather than **Jun 11 (pricing)**,
  shifting every date +1 (Dec 9, Jun 14 2027). The 424B4 lock-up runs from the
  prospectus/pricing date, and most sources say Dec 8 — so our Jun 11 anchor
  stands.

Where it is useful: it independently confirms the 0-of-10 price-trigger status
and the "17% if the trigger never fired, 7% if it did" split at Dec 8.

## Maintenance note

The two things that rot fastest are `LAST_CLOSE` (+ its as-of) and the two
estimated windows — `~T+143` Q3 earnings and, until it passes, any earnings-
triggered date. Q3 2026 results have not been scheduled yet; when SpaceX IR
announces the date, set the Q3 entry to the second trading day after it and drop
the `~` from `~T+143`.
