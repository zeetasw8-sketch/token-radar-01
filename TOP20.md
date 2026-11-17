# Top-20 manual review — token-radar-01 board

## Update 17 Nov 2026 ~16:00 WIB — parent exclusion applied (board 195 → 180 rows)

`PARENT_EXCLUDED` in `lib/model.ts` (18 slugs, verified live against
DefiLlama `parentProtocol` 17 Nov 2026, research §4.4; early rows only,
none a watchlist slug) removed 15 rows from the 195-row board; aster-bridge
was already out via the Bridge category. Gate re-run: **7/7 PASS, 180 rows,
40/40 watchlist covered**. Rows removed (old rank → slug → parent):
#2 sentora-curator → Sentora, #9 polymarket-international → Polymarket,
#13 cian-yield-layer → CIAN Protocol, #17 defi-saver-asset-management →
Defi Saver, #23 mellow-core → Mellow Protocol, #30 theo-network-thusd →
Theo, #33 figure-markets-prime → Figure Markets, #38 extended-perps →
Extended, #42 avant-avusd → Avant Protocol, #47 ipor-fusion → IPOR,
#58 circle-gateway → Circle, #71 loopscale-lending → Loopscale,
#101 theo-network-thbill → Theo, #104 avant-aveth → Avant Protocol,
#187 loopscale-curation → Loopscale. gmx-solana and apex-omni were already
out under the same rule.

New Top 10 (implied value unchanged for survivors — the model did not
change, only the board's membership): 1 Steakhouse Financial $464,924,662;
2 Gauntlet $276,897,852; 3 Veda $266,216,989; 4 USDD $183,214,585;
5 BitFi Basis $111,164,270; 6 Upshift $95,509,574; 7 Bittensor dTAO
$77,272,598; 8 OnRe $66,090,736; 9 Nonce Capital $64,417,968;
10 OpenTrade $56,510,731. BitFi Basis (old #11 area) enters the Top 10;
USDD, Bittensor dTAO, OnRe, Plume Vaults (#11 now), Hive Protocol and
Lightning Network stay flagged watchlist rows — see the dashboard's new
"Why some big names are not on this board" panel. The verdict table below
is the pre-exclusion review and still stands for the surviving rows.

Farm-plan verdicts on the new 180-row board under the OLD median-peer model
(netted scenario economics): FARM 171, THIN 7, SKIP 2 — the verdict barely
discriminates, because the specified scenario caps allocation at $2,000 while
P(qualify) is ≥8%, so almost every row clears EV > $50. That is a property of
the stated scenario assumptions, not a bug in the arithmetic; a future revision
should revisit the allocation cap or the P tiers if the verdict is meant
to separate rows. (Superseded ~16:30 WIB by the log-log model + recalibration
above: FARM 56, THIN 64, SKIP 60.)

## Update 17 Nov 2026 ~16:30 WIB — model log-log adopted + farm verdicts recalibrated (board still 180 rows)

Model `radar-2-peer` (median-peer) → **`radar-3-loglog`**: implied value now
comes from an OLS `ln(mcap) = a + b·ln(TVL)` fit per category with shrinkage
(`w = n/(n+5)` for 5 ≤ n < 10), fitted on all 128 tokenised peers at runtime;
ratio clamped [0.02, 1.0], growth × maturity unchanged. Backtest (split-half
pooled, n = 128, `LOGLOG.md` / `BACKTEST.md` §D): **0.5088 log10 ≈ 3.2×,
within 2× 32.0%, within 3× 46.1%** — better than the old baseline (0.6804
log10 ≈ 4.8×, within 2× 25.8%), but the **≤3× target is still NOT met**.
Board membership is unchanged (same 180 rows, 40/40 watchlist); only the
values and ranks moved. Gate re-run: **7/7 PASS**.

New Top 10 (implied value): 1 Bittensor dTAO $225,656,411; 2 Steakhouse
Financial $71,161,725; 3 Gauntlet $55,305,310; 4 Veda $53,403,308; 5 USDD
$44,334,718; 6 Curvance $42,085,685; 7 BitFi Basis $35,423,073; 8 Upshift
$33,058,891; 9 Tydro $30,823,385; 10 Nado Spot $28,114,656. New Top 11–20:
Symbiotic $22,527,999; Nonce Capital $21,990,022; OnRe $21,963,725;
OpenTrade $21,563,920; Plume Vaults $20,552,282; Hive Protocol $20,327,749;
RockawayX $18,899,178; Hyperithm $18,875,865; K3 Capital $17,824,504;
Tori Finance $17,583,412. Vs the old Top 10: most values fall sharply
(slopes < 1 compress large-TVL rows — old #1 Steakhouse $464,924,662 is now
$71,161,725 at #2); Curvance, Tydro and Nado Spot enter the Top 10; OnRe,
Nonce Capital and OpenTrade drop to #13/#12/#14. R25 (#25), Axis (#24),
Lightning Network (#22) and Lofty (#21) drop out of the Top 20.

Flag — dTAO at #1 is a clamp artefact, not a data error: the Dexs slope is
1.7762 (n = 11, unshrunk), which pushes dTAO's predicted mcap/TVL ratio
onto the 1.0 clamp — the only row on the board at the clamp ceiling. Its
$225.7M is the method working as specified, and it should be read with the
same scepticism as every other implied value (median error 3.2×).

Farm-plan verdicts on the new board (recalibrated scenario, `lib/model.ts`
`FARM`): **FARM 56 (31.1%), THIN 64 (35.6%), SKIP 60 (33.3%)** — vs FARM 171,
THIN 7, SKIP 2 before. Parameters: P(qualify) 25%/10%/4%/1% by rank tier
(≤10/≤40/≤100/else), allocation 0.02% of implied value uncapped, thresholds
unchanged (FARM EV > $50 and net > $10/hr). Top 10 and ranks 11–40 are all
FARM; ranks 41–100 are mixed (16 FARM / 39 THIN / 5 SKIP); ranks 101+ are
never FARM (25 THIN / 55 SKIP). The task's first suggestion (P 25/12/5/2,
0.1% uncapped, EV > $100, net > $15/hr) was computed and gives FARM 100
(55.6%) — still outside the 25–40% band — so the allocation share is what
had to move. All scenario assumptions, stated in the plan and dashboard.

The verdict table below is the pre-log-log review (old board ranks) and
still stands for the surviving rows as a manual review: the five flagged
watchlist rows are now at new ranks — dTAO #1 EXCLUDE, USDD #5 EXCLUDE,
Plume Vaults #15 EXCLUDE, Hive Protocol #16 EXCLUDE, Lightning Network #22
EXCLUDE — and stay on the board because the sealed coverage gate requires
all 40 watchlist slugs. Screenshots in `screenshots/` are still from the
old board and need a re-render (separate task).

Board: `entry/out/board.json`, built 17 Nov 2026 ~15:20 WIB from the sealed
snapshot (`as_of` 2026-11-14, 758 protocols, watchlist 40). Reviewed 17 Nov
2026 ~15:30–16:00 WIB against the snapshot's own 10 fields plus public
sources checked the same day (CoinGecko/CoinPaprika pages, DefiLlama,
project docs and press, via web search).

Verdicts: **OK** = no token of the protocol's own trades and a future
protocol-token launch is the standard farm thesis. **RAGU** = the
protocol's main product is itself a token that already trades, so the
"launch" thesis is weak and the farm plan points at an already-live asset.
**EXCLUDE** = the token unambiguously already trades, or no token can
ever exist — the row should not be presented as a launch candidate.

## The structural finding (read first)

**All 20 rows below are watchlist rows.** The gate's coverage check
(`boardIssue` in `lib/model.ts`) requires every one of the 40 watchlist
slugs on the board, and `buildBoard` adds watchlist slugs without the
`isRankable` filter. So a flagged watchlist row **cannot be excluded
without failing the sealed coverage gate**. No exclusion was applied and
no re-run was needed: the board is unchanged from the 7/7 gate run.

That means 5 of the top 20 are rows the review says should not be there —
#4 USDD, #6 Bittensor dTAO, #10 Plume Vaults, #13 Hive Protocol,
#18 Lightning Network — and they stay on the board because the watchlist
forces them there. The snapshot's 10 fields cannot see the problem: for
all five, `mcap_usd`, `gecko_id` and `symbol` are all null, so the model
reads them as pre-token. The data gap is real (DefiLlama's protocol
entries do not always carry the token's market data), and the coordinator
should carry it as a known limitation in the dossier/README rather than
pretend the top 20 is clean. A future model version could add these five
to the verified list in `lib/model.ts` — but only if the coverage rule is
also revisited, or the list would be dead code for watchlist slugs.

## Verdicts

| # | Slug | Verdict | Reason (one line) |
|---|------|---------|-------------------|
| 1 | steakhouse-financial | OK | Morpho curator, ~$2.5B; no protocol token. |
| 2 | gauntlet | OK | Risk manager/curator; no token, earns fees. |
| 3 | veda | OK | Vault infra (BoringVault); no token. |
| 4 | usdd | EXCLUDE | USDD stablecoin trades (mcap ~$1.4B, CoinGecko #56–57); snapshot's null mcap is a data gap. |
| 5 | upshift | OK | Vault platform (August); receipt tokens per vault only, no protocol token found. |
| 6 | bittensor-dtao | EXCLUDE | TAO trades since 2023 (Coinbase Feb 2025); dTAO's 128 subnet alpha tokens all trade in AMM pools. No separate dTAO token to launch. |
| 7 | onre | RAGU | ONyc + ONe yield tokens already live (ONyc ~$168M, 9,500+ holders, Kamino market); $ONRE is only mentioned as future upside. |
| 8 | nonce-capital | OK | Risk curator; no token found in sources checked. |
| 9 | opentrade | OK | RWA yield; no protocol token found. |
| 10 | plume-vaults | EXCLUDE | Child of tokenised parent: PLUME TGE 21 Jan 2025, trades on Bybit/HTX/KuCoin; vaults are a Plume product line. Same pattern as the model's circle entry. |
| 11 | symbiotic | OK | No token; points since mid-2024, no confirmed launch (the honest pre-token bet). |
| 12 | rockawayx | OK | Investment firm / curator arm; no token. |
| 13 | hive-protocol | EXCLUDE | "Stake BTC, receive $B2": B2 IDO 30 Apr 2025 (Binance Wallet), trading on major exchanges; Hive pays out the already-live B2. |
| 14 | hyperithm | OK | Asset manager / curator; no token. |
| 15 | r25 | RAGU | rcUSD + rcUSDp product tokens live on Sui (Oct 2026); no R25 protocol token announced. |
| 16 | k3-capital | OK | Risk curator; no token found in sources checked. |
| 17 | tori-finance | RAGU | trUSD synthetic dollar + strUSD yield receipt already live (Pendle PT/YT); no TORI governance token announced. |
| 18 | lightning-network | EXCLUDE | Bitcoin's payments network: no token by design, value accrues to BTC. A "Lightning token launch" cannot happen. |
| 19 | axis | OK | "Has not yet issued tokens" (Jul 2026); USDx/sUSDx are product tokens, and a protocol-token public sale is on its published roadmap. |
| 20 | lofty | RAGU | No LOFTY protocol token, but its product IS tokens: per-property LLC shares (ASAs) already trade on its marketplace; one directory also reports the company told investors in Jul 2026 it is winding down (unconfirmed, conflicts with other sources). |

## Per-row notes

- **#1 Steakhouse Financial** (Risk Curators, TVL $2,753,981,495,
  implied $464,924,662). OK. Largest Morpho curator (~$2.5B per Oct 2026
  analysis); Coinbase routes $500M+ USDC lending through its vaults. No
  token, no token announcement. Vault shares are ERC-4626 receipts, not a
  protocol token.
- **#2 Gauntlet** (Risk Curators, $1,577,685,462 → $276,897,852). OK.
  Risk manager for Aave/Compound plus $1.6B curated vaults. No token.
- **#3 Veda** (Onchain Capital Allocator, $1,563,415,482 →
  $266,216,989). OK. BoringVault infrastructure; Kraken DeFi Earn runs on
  Veda vaults. No token.
- **#4 USDD** (CDP, $1,055,793,606 → $183,214,585). **EXCLUDE.** USDD is
  TRON DAO Reserve's over-collateralised stablecoin, trading on HTX, Gate,
  KuCoin, Kraken and SunSwap; CoinGecko mcap ~$1.44B (rank #56) on
  17 Nov 2026, ~$2M daily volume. A stablecoin pegged to $1 has no
  "launch value" in this board's sense, and its implied $183M is
  meaningless. The snapshot records no mcap/gecko/symbol for the DefiLlama
  `usdd` protocol entry, which is why the model ranked it.
- **#5 Upshift** (Onchain Capital Allocator, $499,083,733 →
  $95,509,574). OK. Vault platform on August infra; deposits mint
  per-vault receipt tokens (upUSDC, upSBRWA, …). No UPSHIFT protocol token
  found in its docs or press.
- **#6 Bittensor dTAO** (Dexs, $376,026,255 → $77,272,598).
  **EXCLUDE.** dTAO is not a protocol awaiting a token: it is the
  mechanism by which TAO — trading since 2023, listed on Coinbase
  20 Feb 2025, ~$83M daily volume — is staked into 128 subnets, each with
  its own alpha token trading in an on-chain AMM pool since dTAO went live
  13 Feb 2025. There is no separate "dTAO token" to launch; the row's
  implied value double-counts value that already accrues to TAO.
- **#7 OnRe** (RWA, $308,882,355 → $66,090,736). **RAGU.** OnRe's ONyc
  tokenised-reinsurance token is live (~$168M TVL, 9,500+ holders,
  transferable, Kamino lending market) and its ONe accumulating token for
  LPs launched with the Ethena partnership; OnRe's own release mentions
  "token incentives from sUSDe and the $ONRE protocol token" only as future
  upside. The farm plan ("mint the protocol's yield asset and hold it")
  describes buying ONyc, which already exists. A future $ONRE governance
  token is unconfirmed.
- **#8 Nonce Capital** (Risk Curators, $513,783,671 → $64,417,968). OK.
  Morpho curator (~$485–590M TVL). No token found in sources checked.
- **#9 OpenTrade** (RWA, $241,501,527 → $56,510,731). OK. RWA yield
  (tokenised Treasuries/credit). No protocol token found.
- **#10 Plume Vaults** (RWA, $211,537,977 → $49,997,400). **EXCLUDE.**
  Plume Vaults is a product line of Plume Network, whose PLUME token had
  its TGE on 21 Jan 2025 and trades on Bybit, HTX, KuCoin, Binance,
  Coinbase and others (10B max supply). This is the same "child of a
  tokenised parent" pattern the model already handles for circle
  (Circle Gateway / USDC); Plume Vaults belongs in that verified list, but
  as a watchlist slug the list cannot remove it from the board.
- **#11 Symbiotic** (Collateral Markets, $253,923,299 → $47,128,117).
  OK. Restaking, points since mid-2024, explicitly no token and no
  commitment to one (prediction market ~62% by end-2027). The classic
  pre-token candidate; the board's implied value is a ranking signal, not
  a promise.
- **#12 RockawayX** (Risk Curators, $292,506,628 → $42,300,854). OK.
  Investment firm (manages $1.5B+) and curator; incubated OnRe, curates
  vaults. No token.
- **#13 Hive Protocol** (Chain, $198,776,765 → $37,830,837).
  **EXCLUDE.** DefiLlama's own description: "Stake BTC, safeguard B²,
  and receive $B2 Tokens." B2 is the native token of B² Network, IDO
  30 Apr 2025 at $0.0714 via Binance Wallet, trading on major exchanges
  (67.35M circulating of 210M max, ~$0.41 on 16 Nov 2026). Hive is the
  staking product that pays out the already-trading B2 — there is no Hive
  token to launch.
- **#14 Hyperithm** (Risk Curators, $221,638,535 → $37,004,167). OK.
  Crypto asset manager (Japan/Korea) running curated vaults. No token.
- **#15 R25** (RWA, $198,206,607 → $36,691,803). **RAGU.** RWA vault
  infra on Pharos/Sui; its rcUSD (RWA-backed dollar) and rcUSDp
  (yield-bearing receipt) launched on Sui 29 Oct 2026. No R25 protocol
  token announced. (Pharos's own chain token is PROS — a different asset.)
- **#16 K3 Capital** (Risk Curators, $207,711,162 → $33,876,308). OK.
  Morpho curator. No token found in sources checked.
- **#17 Tori Finance** (Basis Trading, $77,392,441 → $33,799,711).
  **RAGU.** Tori's trUSD synthetic dollar and strUSD staked receipt are
  live (trUSD on Pendle PT/YT, maturing 26 Nov 2026; ~$64–77M TVL). No
  TORI governance token announced. Same shape as OnRe: the farmable asset
  already exists; only an unconfirmed governance token is missing.
- **#18 Lightning Network** (Payments, $217,862,346 → $32,425,831).
  **EXCLUDE.** The Lightning Network is Bitcoin's Layer-2 payments
  network. It has no token and cannot have one; its economic value
  accrues to BTC. Ranking it as a token-launch candidate with a $32M
  implied value is a category error, and its farm plan ("bridge USDC …
  through Lightning") is nonsense for a Bitcoin payments network. The
  snapshot's null mcap is correct here (there is no token) but the
  conclusion is wrong.
- **#19 Axis** (Basis Trading, $70,145,354 → $29,322,655). OK. Quant
  yield protocol (founded 2025); press 29 Jul 2026: "has not yet issued
  tokens". Its USDx synthetic dollar and sUSDx yield certificate are
  product tokens; its published roadmap has a protocol-token public sale
  after the Origin Vault phase. Genuinely pre-token for the thesis the
  board measures.
- **#20 Lofty** (RWA, $101,135,900 → $27,793,601). **RAGU.** Lofty AI's
  fractional real-estate marketplace (Algorand, since 2021) has no LOFTY
  protocol token, but every property is already tokenised as Algorand
  Standard Assets that trade on its own marketplace (settled in USD
  Lofty / USDL). There is no single protocol token to launch. Extra
  caution: one directory (checked 13 Nov 2026) reports the company told
  investors in July 2026 it is winding down; other sources from Sep–Oct
  2026 describe it as alive and growing. Unresolved — treat as RAGU
  either way.

## Exclusion changes applied

**None.** All five EXCLUDE-flagged rows and all four RAGU rows are
watchlist slugs, and the sealed coverage gate requires all 40 watchlist
slugs on the board. Applying an exclusion in `lib/model.ts` would change
nothing for these rows (`buildBoard` adds watchlist slugs without the
`isRankable` filter) and would only affect early rows below the floor —
none of the flagged slugs is an early row. So `lib/model.ts` was left
untouched (no bug found) and **no re-run was performed**; the board and
the 7/7 gate result stand as run.

Recommended follow-up for the coordinator (not this subagent's scope):
record the five EXCLUDE rows as a known limitation in the dossier/README,
and consider, for a future model version, a verified "live token despite
null snapshot mcap" list (usdd, bittensor-dtao, plume-vaults,
hive-protocol, lightning-network) paired with a coverage rule that
exempts verified-live watchlist slugs — the current gate as written
forbids that.

## Screenshots — PLACEHOLDER warning

The three screenshots in `entry/screenshots/` (and therefore in
`entry/out/screenshots/`) are the **kit starter's screenshots**
(`starter/screenshots/*.png`, 1440x900), copied as placeholders so the
run and the gate check could execute. They show the **starter dashboard,
not this entry's dashboard**, and are **NOT for submit**. They must be
replaced with screenshots of this entry's real dashboard (board, detail,
filtered view) before submit. The gate check passes on them only because
they are whole PNGs within the size/dimension caps.

## Method note

"Pre-token" here is judged on public record as of 17 Nov 2026, not on
the snapshot alone: the snapshot's null `mcap_usd`/`gecko_id`/`symbol`
is necessary but not sufficient evidence, as #4, #6, #10, #13 and #18
show. Vault/curator receipt tokens (ERC-4626 shares) and per-product
tokens (trUSD, ONyc, rcUSD, USDx) were not counted as "the protocol's
token" — except where the product token IS the whole economic asset
(USDD, B2, TAO, PLUME), which is the EXCLUDE line. Counts: OK 11,
RAGU 4, EXCLUDE 5.
