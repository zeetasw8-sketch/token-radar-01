# Backtest — token-radar-01, sealed snapshot (17 Nov 2026 ~15:25 WIB)

Run: `node entry/scripts/backtest.mjs` → `entry/scripts/backtest.json`.
Node stdlib only, offline, deterministic, no network, no make.fun key.
Input: the SEALED kit snapshot
`kit/extracted/token-radar-01-kit/input/snapshot.json`
(758 protokol, watchlist 40, floor $50jt, as_of 2026-11-14; exactly 10 fields
per protocol, **no fees field** — there is no fee leg in this backtest,
unlike the 17 Nov public prototype which blended a fee leg 50/50).

> **Note 17 Nov 2026 ~16:30 WIB: the shipped model is now `radar-3-loglog`
> (§D below). Sections A–C document the superseded median-peer baseline
> (`radar-2-peer`) and are kept verbatim as the baseline record — their
> numbers are the "old model" figures quoted in the README/dashboard, not
> the current model's. `backtest.mjs` still re-implements the old model;
> the log-log numbers in §D come from `scripts/loglog-test.mjs` /
> `scripts/loglog.json` on the exact same split-half protocol.

The script re-implements `lib/model.ts` (`radar-2-peer`) in plain JS rather
than importing the TS model, so the numbers below are an independent
re-derivation of the same rules. Cross-checked with an independent Python
recomputation: split-half pooled figures match exactly
(0.6804 log10, 4.79x, within-3x 37.5%), and the board size (177 = 40
watchlist + 137 early rows) reproduces too.

## Verdict up front: target NOT achieved

**Target median error ≤3x: TIDAK TERCAPAI on the sealed snapshot.**
Pooled split-half median error is **0.6804 in log10 ≈ 4.79x**
(direction average 0.6959 ≈ 5.02x). Only 37.5% of held-out market caps land
within 3x. Do not claim otherwise in the dossier or dashboard.

## A) Split-half peer validation (n = 128)

Peer medians trained on half the tokenised protocols (mcap_usd > 0,
TVL ≥ $5M), tested on the other half, both directions. Peers sorted by
slug, split 64/64 at the midpoint; pooled = every peer tested exactly once.
Primary metric is the FULL shipped model (peer multiple × growth ×
maturity) vs actual mcap; TVL-only (multiple alone) is a diagnostic.

| Metric (full model) | Train H0 → test H1 | Train H1 → test H0 | Pooled (n=128) | Avg of directions |
|---|---|---|---|---|
| Median abs error (log10) | 0.6288 | 0.7630 | **0.6804** | 0.6959 |
| Median abs error (×) | 4.25x | 5.79x | **4.79x** | 5.02x |
| Median abs % error | 85.9% | 98.4% | **90.4%** | 92.1% |
| Within 2x of actual mcap | 28.1% | 23.4% | **25.8%** | 25.8% |
| Within 3x | 39.1% | 35.9% | **37.5%** | 37.5% |
| Within 5x | 54.7% | 46.9% | **50.8%** | 50.8% |

TVL-only diagnostic (pooled): 0.6890 log10 ≈ 4.89x, within 3x 32.8%,
within 5x 51.6%. The full model is only marginally better than the bare
multiple — growth and maturity are a small refinement, not the source of
the error. The error is the dispersion of mcap/TVL itself inside each
category: the market pays wildly different multiples for protocols in the
same line of business, and a median cannot see that.

Comparison with the public prototype (17 Nov, n=207, TVL+fees blend):
0.639 log10 (~3.35x), within 3x 38.2%. The sealed result is slightly
worse, on a smaller peer set (128 vs 207) and without any fee leg.
Note also that the sealed result does **not** reproduce the "about 3.3x"
figure quoted in `lib/model.ts` — the coordinator should correct or
justify that figure; this deterministic split-half gives ~4.8x.

Honest reading: the peer-median method is a **rough order-of-magnitude
ranking tool, not a valuation**. A typical implied value is wrong by a
factor of ~5. The board must be presented as a ranking, and the dossier
must say so — do not quote implied values as if they were prices. This
test validates the peer-multiple method only; it cannot validate the
tokenless ranking itself (tokenless protocols have no mcap to check
against).

## B) Sensitivity: top-20 under four variants (sealed board, 177 rows)

Baseline = peer-multiple model as shipped. Variants keep the same board
construction (watchlist floor + early rows below $50M, same exclusions)
and change one thing each.

| Variant | Top-20 overlap vs baseline | Gauntlet rank | Polymarket rank | Sentora rank |
|---|---|---|---|---|
| (i) Peer multiple (baseline) | 20/20 | 2 | — not on board — | — not on board — |
| (ii) Flat multiple 0.25 (starter) | 17/20 | 2 | — not on board — | — not on board — |
| (iii) No growth | 19/20 | 3 | — not on board — | — not on board — |
| (iv) No maturity | 19/20 | 2 | — not on board — | — not on board — |

Baseline top-20: steakhouse-financial, gauntlet, veda, usdd, upshift,
bittensor-dtao, onre, nonce-capital, opentrade, plume-vaults, symbiotic,
rockawayx, hive-protocol, hyperithm, r25, k3-capital, tori-finance,
lightning-network, axis, lofty.

Flat 0.25 drops tori-finance, axis, lofty out of the top-20 and brings in
b14g, lagoon, clearstar. No-growth drops lofty for b14g. No-maturity drops
hyperithm for saturn. The top 5 (steakhouse-financial, gauntlet, veda,
usdd, upshift) appear in every variant; only their order shifts.

**Polymarket and Sentora are not on the sealed board at all**, in any
variant: `polymarket-international` (TVL $320,193,439) and
`sentora-curator` (TVL $2,757,585,593) sit above the $50M floor and are
not in the 40-slug watchlist, so `buildBoard` never selects them. Their
sensitivity "rank" is N/A, not 0 — the board simply does not cover
above-floor non-watchlist protocols. If the dossier wants to feature
either name, the watchlist (or the floor rule) has to change first; the
backtest cannot rank what the board does not contain.

Stability of the ranking is not accuracy of the values: no variant
rescues the ~4.8x median error in (A). The peer multiple still beats
flat 0.25 for ranking purposes — it is the snapshot's own answer to what
the market pays per TVL dollar in each line of business — but neither
variant values anything precisely.

## C) Peer-multiple distribution per category (n ≥ 5)

Global median 0.2138 (n = 128 peers). Only 9 categories clear the n ≥ 5
bar; every other category falls back to the global median. No raw median
hits the [0.02, 1.0] clamp — the clamp never binds on the sealed snapshot.

| Category | Peers (n) | Median mcap/TVL |
|---|---|---|
| Lending | 15 | 0.1324 |
| Dexs | 11 | 0.3424 |
| Liquid Staking | 9 | 0.0406 |
| Yield | 9 | 0.1914 |
| CEX | 9 | 0.0748 |
| RWA | 9 | 0.2748 |
| Canonical Bridge | 8 | 0.7464 |
| Basis Trading | 7 | 0.6544 |
| Bridge | 6 | 0.5567 |

The spread is ~18x (Liquid Staking 0.0406 → Canonical Bridge 0.7464),
which is the whole case for peer multiples over the starter's flat 0.25 —
and also the reason the error in (A) stays large: within-category
dispersion dwarfs between-category differences. Categories with n < 5
(full list in `backtest.json`, `peerTableAllCategories`) all use the
global 0.2138, so their rows are ranked on TVL × 0.2138 × growth ×
maturity alone.

## Parent check (Top-100 sealed board vs public DefiLlama, 17 Nov 2026)

Method: took the sealed board's Top-100 slugs (`backtest.json`,
`board.top100Slugs`), fetched public `https://api.llama.fi/protocols`
(9,063 protocols, fetched 17 Nov 2026 ~15:20 WIB, no key), and checked
each row's `parentProtocol` field. 99/100 slugs were found in the live
data (`drakewell`, board rank 35, is missing from the live list —
delisted or renamed since the 14 Nov snapshot; not a parent finding,
noted here as a data caveat). (After this backtest ran, the coordinator's
`entry/out/board.json` appeared: 177 rows, top-100 slugs identical to the
board computed here, so the parent check below stands against the
shipped board too.) 19 of the 100 carry a `parentProtocol`
(`parent#<slug>` grouping key). A pair is listed as VERIFIED below only
where the parent's token is confirmed by a second source (sibling rows'
`symbol` in DefiLlama + a CoinGecko listing with market cap). The other
17 parents show symbol `-` on every sibling row and no CoinGecko coin —
checked, not verified, not listed as tokenised.

### VERIFIED — child of a tokenised parent (2 pairs)

| Board rank | Child slug | Parent | Token evidence |
|---|---|---|---|
| 89 | `gmx-solana` | GMX (`parent#gmx`) | DefiLlama live: `parentProtocol` = `parent#gmx`, `parentProtocolSlug` = `gmx`; sibling `gmx-evm` carries symbol `GMX`. CoinGecko `gmx`: token "GMX", market cap ~$79.4M at check time. |
| 60 | `apex-omni` | ApeX (`parent#apex-protocol`) | DefiLlama live: `parentProtocol` = `parent#apex-protocol`; sibling `apex-pro` carries symbol `APEX`, url `https://www.apex.exchange/`, same X account `OfficialApeXdex`. CoinGecko `apex-token-2`: token "APEX", homepage `https://apex.exchange/`, market cap ~$21.7M at check time. |

Notes for the coordinator (decision is yours; `lib/model.ts` NOT changed):

- `gmx-solana` slipped through the model's `KNOWN_TOKENIZED_PARENTS`
  check because that check is slug-exact (`gmx`), while the child slug is
  `gmx-solana`. Same pattern as the already-excluded `aster`/`gmx`/
  `circle` families — if the exclusion is meant to cover deployments,
  it needs a parent-aware rule, not one more slug. Caveat: the live
  `gmx-solana` row points at `https://gmtrade.xyz` / X `gmtrade_xyz`,
  not `gmx.io` — DefiLlama groups it under GMX, but the coordinator
  should confirm the deployment relationship before excluding on that
  basis alone.
- `apex-omni` is not in `KNOWN_TOKENIZED_PARENTS` at all. The parent is
  ApeX Pro / ApeX Omni (same exchange, same site and X account); the
  APEX token already trades.
- The other 17 Top-100 children with a `parentProtocol` were checked and
  are NOT verified as children of a tokenised parent: aegis-yusd (27) and
  liminal-basis (32), arrakis-modular (43), exponent-yield-exchange (50),
  ultrayield-curator (54), felix-vaults (57) + felix-cdp (97),
  vfat.io (59), hylo-protocol (67), tempo-stablecoin-dex (75),
  theo-network-thbill (82), avant-aveth (85), marginfi-lending (87),
  adrastea-validator (91), phoenix-perp (92), mystic-finance-lending
  (95), hyperbeat-earn (100). All siblings under each parent show
  symbol `-` in DefiLlama (no token attributed), and spot CoinGecko
  searches returned no matching governance-token coin for vfat, theo,
  or hylo (Hylo search returns only product tokens: HYUSD, XSOL,
  HYLOSOL). Absence of a listing is not proof a token will never exist —
  only that none is verified trading now.
- No Top-100 slug starts with another well-known tokenised stem
  (uniswap-/aave-/curve-/lido-/etc. — scanned, zero hits), so no further
  parent candidates were found by name.

## D) Log-log model (adopted 17 Nov 2026) — `radar-3-loglog`

Method (exact, see `LOGLOG.md` + `scripts/loglog-test.mjs` → `scripts/loglog.json`):
OLS `ln(mcap) = a + b·ln(TVL)` per category on the same 128 tokenised peers,
same deterministic split-half protocol as §A (peers sorted by slug, split
64/64, both directions, pooled so every peer is tested exactly once).
Shrinkage for 5 ≤ n < 10: `w = n/(n+5)`, `a* = w·a_cat + (1−w)·a_global`,
`b* = w·b_cat + (1−w)·b_global`; n ≥ 10 uses the category fit unshrunk;
n < 5 uses the global fit. Predicted ratio `exp(a* + b*·ln(TVL)) / TVL`
clamped to [0.02, 1.0], same clamp as the baseline. The shipped model is
log-log × growth × maturity; the TVL-only log-log row is the fair comparator
against the baseline TVL-only diagnostic.

| Model (pooled, n = 128) | Median err log10 | Faktor × | Median \|pct\| err | Within 2× | Within 3× | Within 5× |
|---|---:|---:|---:|---:|---:|---:|
| Baseline full (median-peer × growth × maturity) — §A | 0.6804 | 4.79× | 90.39% | 25.78% | 37.50% | 50.78% |
| Baseline tvlOnly (median-peer saja) | 0.6890 | 4.89× | 91.71% | 25.78% | 32.81% | 51.56% |
| **Log-log shrunk, tvlOnly** | **0.5904** | **3.89×** | **88.03%** | **28.13%** | **46.88%** | **58.59%** |
| **Log-log shrunk × growth × maturity (shipped)** | **0.5088** | **3.23×** | **88.27%** | **32.03%** | **46.09%** | **58.59%** |
| Log-log tanpa shrinkage, tvlOnly (diagnostik) | 0.5881 | 3.87× | 89.75% | 25.00% | 44.53% | 59.38% |

Adoption test (vs the fair comparator, baseline tvlOnly): median log10 error
down 14.31% relative (0.6890 → 0.5904, ≥10% ✓) and within-2× up 2.35 points
(25.78% → 28.13% ✓) — **ADOPT**. Log-log also wins the deterministic split
in both directions, and 20/20 seeded random split-half trials (mulberry32,
seed 20261114; mean median error 0.5708 vs baseline 0.7083).

**Target ≤3×: STILL NOT MET.** The shipped model is 3.23× (0.5088 log10),
TVL-only log-log 3.89×. Better than the 4.79× baseline, but do not claim
≤3× anywhere. The board remains a ranking signal.

What changed on the board (180 rows, same membership — only the model
changed): the new Top 10 is Bittensor dTAO $225,656,411; Steakhouse Financial
$71,161,725; Gauntlet $55,305,310; Veda $53,403,308; USDD $44,334,718;
Curvance $42,085,685; BitFi Basis $35,423,073; Upshift $33,058,891; Tydro
$30,823,385; Nado Spot $28,114,656 (was: Steakhouse $464,924,662 on top).
Most implied values fall sharply — slopes below 1 compress large-TVL rows —
while dTAO jumps to #1 because the Dexs slope (1.7762, n = 11, unshrunk)
pushes its predicted ratio onto the 1.0 clamp. That is the method working as
specified, not a data error, but it is a clamp artefact worth flagging: one
row sits exactly at the clamp ceiling. Full-data fits (fitted on all 128
peers at runtime): global a = 6.9646, b = 0.5223; Lending b = 1.4995 (n = 15),
Dexs b = 1.7762 (n = 11), Liquid Staking b = 0.5539, Yield b = 0.6415,
CEX b = 0.5372, RWA b = 0.4383, Canonical Bridge b = 0.5409, Basis Trading
b = 0.5201, Bridge b = 0.6503 (all n < 10 shrunk toward global).

Farm-plan calibration changed with the model (same section, `lib/model.ts`
`FARM`): P(qualify) 25%/10%/4%/1% by rank tier, allocation 0.02% of implied
value uncapped, thresholds unchanged (FARM EV > $50 and net > $10/hr).
Distribution on the new board: **FARM 56 (31.1%), THIN 64 (35.6%),
SKIP 60 (33.3%)** — vs FARM 175/180 under the old parameters. The task's
first suggestion (P 25/12/5/2, 0.1% uncapped, EV > $100, net > $15/hr)
was computed and gives FARM 100 (55.6%), still outside the 25–40% band,
so the allocation share is what had to move. All scenario assumptions,
stated in the plan.

## What this changes before submit

1. **Dossier/README must describe implied value as a ranking signal with
   the split-half error above (~4.8x median, 37.5% within 3x), not as a
   valuation.** Target ≤3x is NOT met on sealed data.
2. **Correct or justify the "about 3.3x" figure in `lib/model.ts`** — this
   deterministic backtest gives ~4.8x pooled / ~5.0x direction-average.
   **RESOLVED 17 Nov 2026 (~16:30 WIB):** the shipped model is now
   `radar-3-loglog` (§D), which quotes its own measured 0.5088 log10 ≈ 3.2×
   (within 2× 32.0%), with the old 4.8× figure kept only as the labelled
   baseline. The "about 3.3x" figure no longer appears as the model's number.
3. **Decide the two verified parent pairs** (`gmx-solana`, `apex-omni`):
   exclude them (parent-aware rule, not another slug) or keep them with a
   documented reason. The model file was not touched — this is the
   coordinator's call.
4. **Decide whether Polymarket / Sentora belong on the board at all.**
   They are currently unrankable by construction (above floor, not
   watchlisted); featuring them needs a watchlist/floor change, not a
   model tweak.
5. Nothing here unblocks submission: the keypair/API key is still missing
   (out of this backtest's scope), and the top-20 manual review is still
   outstanding.
