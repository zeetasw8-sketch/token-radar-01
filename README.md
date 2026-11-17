# Token Radar — make.fun `token-radar-01`

[![make.fun](https://make.fun/badge/token-radar-01.svg)](https://make.fun)
[![rank](https://make.fun/badge/token-radar-01/zeetasw8-sketch/token-radar-01/rank.svg)](https://make.fun)
[![reward](https://make.fun/badge/token-radar-01/zeetasw8-sketch/token-radar-01/reward.svg)](https://make.fun)

> **Status 17 Nov 2026 ~20:32 WIB: repo created on GitHub.**
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

## The model — `radar-3-loglog`

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
  - `log-log fit = OLS ln(mcap_usd) = a + b × ln(tvl_usd)` over tokenised peers
    (mcap > 0, TVL ≥ $5M, n = 128), fitted **per category** when the category
    has ≥ 5 peers, else the global fit; categories with 5 ≤ n < 10 are shrunk
    toward the global fit with `w = n / (n + 5)`; n ≥ 10 uses the category fit
    unshrunk. The fit is computed from the snapshot at runtime — deterministic,
    no network, no hardcoded slopes. (Global fit on the sealed snapshot:
    a = 6.9646, b = 0.5223; category slopes run ~0.44 RWA to ~1.78 Dexs.)
  - `predicted ratio = clamp(exp(a + b × ln(TVL)) / TVL, [0.02, 1.00])`
  - `base = tvl_usd × predicted ratio`
  - `growth = clamp(change_7d, -60, 120)%`, `growthMult = 1 + (growth / 100) × 0.5`
  - `maturity = 0.6 + min(age_days, 1095) / 1095 × 0.4` (age unknown: 365)
  - `implied = max(1, round(base × growthMult × maturity))`
- **Why log-log instead of a flat median multiple per category:** the market's
  mcap does not scale 1-for-1 with TVL — fitted slopes run ~0.44 to ~1.78 by
  category, so a flat ratio overstates small protocols and understates large
  ones in steep categories (Lending, Dexs). The log-log fit is the snapshot's
  own answer to what the market pays per TVL dollar in each line of business,
  at each size.
- **Honest limit:** split-half validation of this log-log method (× growth ×
  maturity) on the sealed snapshot's 128 tokenised peers gives a median error
  of 0.5088 log10, about **3.2×** (within 2× 32.0%, within 3× 46.1%) — better
  than the old median-peer baseline's 0.6804 log10, about 4.8× (within 2×
  25.8%), but the ≤3× target is **still not met**. The board is a ranking
  signal, not a valuation. No row is presented as a price. Method and full
  numbers: [`LOGLOG.md`](LOGLOG.md) and [`BACKTEST.md`](BACKTEST.md) §D.
- **Farm plans:** each row carries 6 steps with netted scenario economics
  (gas by first chain; P(qualify) 25%/10%/4%/1% by rank tier ≤10/≤40/≤100/else;
  allocation 0.02% of implied value, uncapped; EV = P × allocation − gas cost;
  FARM when EV > $50 and net > $10/hr, THIN when EV > $0, else SKIP). All
  scenario assumptions, not measurements. Calibrated 17 Nov 2026 on this
  180-row board: **FARM 56 (31.1%), THIN 64 (35.6%), SKIP 60 (33.3%)** — the
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
├── lib/model.ts            # radar-3-loglog model (log-log fits, implied value, exclusions)
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
