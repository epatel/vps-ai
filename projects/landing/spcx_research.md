# SPCX (SpaceX) — data verification for `spcx.html`

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
