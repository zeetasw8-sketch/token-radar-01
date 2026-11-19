# Token Radar — make.fun `token-radar-01`

[![make.fun](https://make.fun/badge/token-radar-01.svg)](https://make.fun)
[![rank](https://make.fun/badge/token-radar-01/zeetasw8-sketch/token-radar-01/rank.svg)](https://make.fun)
[![reward](https://make.fun/badge/token-radar-01/zeetasw8-sketch/token-radar-01/reward.svg)](https://make.fun)

> **Status 19 Nov 2026 ~01:00 WIB: model radar-4-slope-median built, gate 7/7 PASS, screenshots re-rendered — ready to resubmit (see SUBMISSION.md).**
> Previous status 17 Nov 2026 ~20:32 WIB: repo created on GitHub.
> Public repo https://github.com/zeetasw8-sketch/token-radar-01 (owner
> zeetasw8-sketch), created via web. Code committed locally, push pending
> GitHub CLI auth — `gh` is not logged in on this VM yet.

## What this is

A token launch radar for the make.fun bounty **"Build the best token launch
radar"** (competition `token-radar-01`, closes **14 Dec 2026 17:00 WIB**,
$1,325 total prize — 1st $1,000, 2nd–5th $50, 6th–10th $25).

It reads a sealed snapshot of all DefiLlama protocols, finds the ones **without
a token** that are **not** a wrapped/staked product of an already-trading
token, and ranks them by **implied launch value**. The deliverable is a web
dashboard (board, per-protocol detail, farm steps) plus `board.json`
(≥100 rows with implied value + farm plan) and `dossier.json` (audit trail).

## The model — `radar-4-slope-median`

Implemented in [`lib/model.ts`](lib/model.ts) — one sealed snapshot in, one
ranked board out:

- **Coverage:** the board covers every slug in the snapshot's watchlist (the
  floor, never a ceiling) and adds pre-token protocols below the watchlist
  floor — the early rows the radar exists to find. A protocol is pre-token
  when its snapshot entry records no token (no market cap, no CoinGecko id,
  no symbol). Live-token protocols are kept apart and shown with the market's
  own values, never mixed into the ranked board.
- **Implied value** follows only from the snapshot's own figures, never from
  a hardcoded list of names:
  - `slope-median fit = ln(mcap_usd) = a_cat + 0.55 × ln(tvl_usd)` over tokenised
    peers (mcap > 0, TVL ≥ $5M, n = 128), after trimming peers whose
    log(mcap/TVL) falls outside the central 60% (78 kept). ONE slope for every
    category — cross-validated (grid 0.45–0.80, plateau 0.52–0.60, midpoint
    0.55) — because a slope is not identifiable per category from 5–15 noisy
    peers. `a_cat` is the median of `(ln(mcap) − 0.55 × ln(TVL))` over the
    category's trimmed peers, shrunk toward the global median intercept with
    `w = n / (n + 10)` for every category, however few peers it has. The fit
    is computed from the snapshot at runtime — deterministic, no network, no
    hardcoded intercepts.
  - `predicted ratio = clamp(exp(a_cat + 0.55 × ln(TVL)) / TVL, [0.02, 1.00])`
  - `base = tvl_usd × predicted ratio`
  - `growth = clamp(change_7d, -60, 120)%`, `growthMult = 1 + (growth / 100) × 0.5`
  - `maturity = 0.6 + min(age_days, 1095) / 1095 × 0.4` (age unknown: 365)
  - `implied = max(1, round(base × growthMult × maturity))`
- **Why one slope + median intercepts instead of a slope per category
  (radar-3):** radar-3's Dexs slope (~1.78) sent Bittensor dTAO — 56 days old,
  7d −6.6% — to rank #1 at $226M with a raw ratio of 3.66 clamped to 1.00:
  the board's #1 row was a clamp artefact. Under radar-4 no board row hits
  the clamp, dTAO ranks 21st at $16M, and the top is a smooth gradient
  (Steakhouse $80M, Gauntlet $62M, Veda $59M). Median intercepts are also
  robust where OLS means are not: one peer with mcap/TVL 400 cannot move a
  median.
- **Honest limit:** validation of this method on the sealed snapshot's 128
  tokenised peers: deterministic split-half median error 0.5147 log10, about
  **3.3×** (within 2× 27.3%, within 3× 47.7%); leave-one-out 0.5029 log10,
  about **3.2×**; mean over 100 seeded split-half trials 0.520 (3.3×) vs
  0.565 (3.7×) for radar-3, confirmed on 100 fresh trials (0.522 vs 0.559).
  The ≤3× target is **still not met**. The board is a ranking signal, not a
  valuation. No row is presented as a price. Method and full numbers:
  [`RADAR4.md`](RADAR4.md) and [`BACKTEST.md`](BACKTEST.md) §E.
- **Farm plans:** each row carries 6 steps with netted scenario economics
  (gas by first chain; P(qualify) 25%/10%/4%/1% by rank tier ≤10/≤40/≤100/else;
  allocation 0.02% of implied value, uncapped; EV = P × allocation − gas cost;
  FARM when EV > $50 and net > $10/hr, THIN when EV > $0, else SKIP). All
  scenario assumptions, not measurements. Calibrated 17 Nov 2026 on this
  180-row board: **FARM 51 (28.3%), THIN 77 (42.8%), SKIP 52 (28.9%)** — the
  previous parameters (P 35/25/15/8%, 0.1% capped at $2,000) put 175/180 rows
  on FARM and barely discriminated.
- **Exclusions** (classification rules, applied to every protocol alike):
  categories CEX, Bridge, Canonical Bridge, Liquid Staking, Liquid
  Restaking, Restaked BTC; names ending in a version marker (V2, v2, 2.0…);
  names carrying a whole word wrapped/staked/staking or beginning with an
  exchange name; names that are a wrapped asset ticker or a pegged /
  yield-bearing / receipt-token product; plus a verified list of children of
  tokenised parents (`PARENT_EXCLUDED` in `lib/model.ts`, 18 slugs verified
  live against DefiLlama on 17 Nov 2026 — early rows only, none is a
  watchlist slug).

## How to run

Requires **Node ≥ 22.18** (type-stripping runs `.ts` directly; Node 24
verified locally). Zero dependencies, zero network access at grading time.

```bash
node main.ts [--snapshot data/protocols-2026-11-17.json] [--fees data/fees-overview-2026-11-17.json]
node main.ts --help
```

Outputs (project root):

- `board.json` — ranked tokenless candidates, ≥100 rows when input allows
- `dossier.json` — audit trail: counts, exclusion reasons, peer multiples,
  methodology

The dashboard in `dashboard/` is static (no network): open
`dashboard/index.html` to browse the board, per-protocol detail and farm
steps. The 3 screenshots (board, detail, filtered) live in
`dashboard/screenshots/`.

## Repo layout

```text
├── main.ts                 # Node ≥22.18 entrypoint: snapshot → board.json + dossier.json
├── lib/model.ts            # radar-4-slope-median model (slope-median fits, implied value, exclusions)
├── dashboard/              # static no-network dashboard (board, detail, farm steps)
├── data/                   # input snapshot(s)
├── board.json              # generated ranked board
├── dossier.json            # generated audit trail
├── LICENSE                 # MIT
└── .makefun/
    ├── owner.json          # make.fun owner wallet
    └── freshness.json      # kit anchor (drand round 34033355)
```

## Submission

- Competition: `token-radar-01` on [make.fun](https://make.fun)
- Owner wallet: `7quNSmAwm7p6omEVmvXgPs6p6rM6VrmeQAoJK1KsWne4`
  (account `@silver-panda-60`)
- License: MIT (OSI-approved)
- Transcripts bundle: built with the kit CLI
  (`makefun bundle --repo <path> --out <bundle.tar.gz> --muse-usage <file>`)

## License

MIT — see [LICENSE](LICENSE).
