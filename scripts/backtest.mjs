// Backtest — token-radar-01, sealed kit snapshot only.
//
//   node scripts/backtest.mjs  ->  scripts/backtest.json (raw numbers)
//
// Node stdlib only, offline, deterministic. Reads the SEALED snapshot at
// ../kit path (kit/extracted/token-radar-01-kit/input/snapshot.json) and
// re-implements lib/model.ts (radar-2-peer) in plain JS — the script does
// NOT import the TS model, so the numbers below are an independent
// re-derivation of the same rules. Any drift between this file and
// lib/model.ts is a bug to report, not to paper over.
//
// What it measures:
//   (A) Split-half peer validation: train median mcap/TVL per category on
//       half the tokenised peers (mcap_usd > 0, TVL >= $5M), test on the
//       other half, both directions. Primary metric is the FULL model
//       (peer multiple x growth x maturity) vs actual mcap; a TVL-only
//       diagnostic (multiple alone) is reported alongside so the reader
//       can see whether growth/maturity help or hurt.
//   (B) Sensitivity: the sealed board's top-20 under (i) the peer-multiple
//       model, (ii) flat multiple 0.25 (the starter), (iii) no growth,
//       (iv) no maturity — top-20 overlap vs baseline + rank moves for
//       Polymarket / Gauntlet / Sentora.
//   (C) Peer-multiple distribution per category (n >= 5).
//
// The sealed snapshot carries exactly 10 fields per protocol and NO fees
// field, so there is no fee leg here (unlike the 17 Nov public prototype,
// which blended a fee leg 50/50). Do not compare the two backtests' fee
// sections — the sealed one has none.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_PATH = join(
  HERE, '..', '..', 'kit', 'extracted', 'token-radar-01-kit', 'input', 'snapshot.json',
);
const OUT_PATH = join(HERE, 'backtest.json');

const MODEL = {
  peer_min_peers: 5,
  peer_multiple_floor: 0.02,
  peer_multiple_cap: 1.0,
  growth_weight: 0.5,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.6,
  maturity_range: 0.4,
  maturity_days: 1095,
  unknown_age_days: 365,
};
const EARLY_ROWS = 360;
const DAY_MS = 86_400_000;

// ---------------------------------------------------------------- helpers
function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 === 1 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function clamp(x, lo, hi) { return Math.min(hi, Math.max(lo, x)); }
function round4(n) { return Math.round(n * 1e4) / 1e4; }
function ageDays(asOf, listedAt) {
  if (listedAt === null || listedAt === undefined) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

// ------------------------------------------------- model.ts, re-derived
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const EXCLUDED_CATEGORIES = new Set([
  'CEX', 'Bridge', 'Canonical Bridge',
  'Liquid Staking', 'Liquid Restaking', 'Restaked BTC',
]);
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/i;
const WRAPPED_NAME = [
  /\bwrapped\b/i,
  /\b\w*btc\b/i,
  /\bbitcoin\b/i,
  /\b(s|w|cb|r|we|e)eth\b/i,
  /\bpegged\b/i,
  /yield[- ]bearing/i,
  /receipt token/i,
  /backed 1:1 by bitcoin/i,
  /represents bitcoin/i,
];
const KNOWN_TOKENIZED_PARENTS = new Set(['aster', 'astherus', 'gmx', 'circle']);

function isPreToken(p) {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}
function isRankable(p) {
  if (!isPreToken(p)) return false;
  if (EXCLUDED_CATEGORIES.has(p.category ?? '')) return false;
  if (VERSIONED.test(p.name)) return false;
  if (EXCHANGE_PREFIX.test(p.name)) return false;
  if (/\bwrapped\b/i.test(p.name) || /\bstaked\b/i.test(p.name) || /\bstaking\b/i.test(p.name)) return false;
  if (WRAPPED_NAME.some((re) => re.test(p.name))) return false;
  if (KNOWN_TOKENIZED_PARENTS.has(p.slug)) return false;
  return true;
}

// Peer multiples from a given peer list (same rule as peerMultiples()).
function peerMultiplesFrom(peers) {
  const byCat = new Map();
  const all = [];
  for (const p of peers) {
    const r = p.mcap_usd / p.tvl_usd;
    if (!Number.isFinite(r) || r <= 0) continue;
    all.push(r);
    const cat = p.category ?? 'Unknown';
    if (!byCat.has(cat)) byCat.set(cat, []);
    byCat.get(cat).push(r);
  }
  const global = median(all);
  const byCategory = new Map();
  for (const [cat, v] of byCat) {
    const raw = v.length >= MODEL.peer_min_peers ? median(v) : global;
    byCategory.set(cat, {
      peers: v.length,
      median_raw: raw,
      median: clamp(raw, MODEL.peer_multiple_floor, MODEL.peer_multiple_cap),
    });
  }
  return { byCategory, global, globalPeers: all.length };
}

function peerMultipleFor(category, peers) {
  const cat = category ?? 'Unknown';
  const entry = peers.byCategory.get(cat);
  if (entry !== undefined && entry.peers >= MODEL.peer_min_peers) {
    return { multiple: entry.median, peerCategory: cat, peerCount: entry.peers };
  }
  return {
    multiple: clamp(peers.global, MODEL.peer_multiple_floor, MODEL.peer_multiple_cap),
    peerCategory: 'GLOBAL',
    peerCount: peers.globalPeers,
  };
}

function multipliers(p, asOf) {
  const age = ageDays(asOf, p.listed_at);
  const rawGrowth = typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : 0;
  const growthPct = clamp(rawGrowth, MODEL.growth_floor, MODEL.growth_cap);
  const growthMult = 1 + (growthPct / 100) * MODEL.growth_weight;
  const ageForModel = age ?? MODEL.unknown_age_days;
  const maturityMult = MODEL.maturity_floor
    + (Math.min(Math.max(ageForModel, 0), MODEL.maturity_days) / MODEL.maturity_days) * MODEL.maturity_range;
  return { age, growthPct, growthMult, maturityMult };
}

// Implied value under a variant. variant: 'peer' | 'flat025' | 'noGrowth' | 'noMaturity'
function impliedValue(p, asOf, peers, variant) {
  const { growthMult, maturityMult } = multipliers(p, asOf);
  let multiple;
  if (variant === 'flat025') {
    multiple = 0.25;
  } else {
    multiple = peerMultipleFor(p.category, peers).multiple;
  }
  const g = variant === 'noGrowth' ? 1 : growthMult;
  const m = variant === 'noMaturity' ? 1 : maturityMult;
  return Math.max(1, Math.round(p.tvl_usd * multiple * g * m));
}

// Board construction, same as buildBoard(): watchlist is the floor (every
// watchlist slug, rankability NOT re-checked), plus the early radar —
// rankable pre-token protocols below the floor, top EARLY_ROWS by TVL.
function buildBoard(snapshot, peers, variant) {
  const index = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const chosen = new Map();
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const p of early) chosen.set(p.slug, p);
  const scored = [...chosen.values()].map((p) => ({ slug: p.slug, implied: impliedValue(p, snapshot.as_of, peers, variant) }));
  scored.sort((a, b) => b.implied - a.implied || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  return scored.map((s, i) => ({ rank: i + 1, slug: s.slug, implied_value_usd: s.implied }));
}

// ------------------------------------------------------------- metrics
function metricsFor(pairs) {
  // pairs: [{ pred, actual }] with pred>0, actual>0
  const logErrs = [];
  const pctErrs = [];
  let w2 = 0, w3 = 0, w5 = 0;
  for (const { pred, actual } of pairs) {
    const ratio = pred / actual;
    logErrs.push(Math.abs(Math.log10(ratio)));
    pctErrs.push(Math.abs(pred - actual) / actual * 100);
    if (ratio >= 1 / 2 && ratio <= 2) w2++;
    if (ratio >= 1 / 3 && ratio <= 3) w3++;
    if (ratio >= 1 / 5 && ratio <= 5) w5++;
  }
  const n = pairs.length;
  const medLog = median(logErrs);
  return {
    n,
    medianAbsLog10Error: round4(medLog),
    medianAbsLog10Error_x: round4(Math.pow(10, medLog)),
    medianAbsPctError: round4(median(pctErrs)),
    within2x: round4(w2 / n),
    within3x: round4(w3 / n),
    within5x: round4(w5 / n),
  };
}

// Predict a tokenised peer's mcap from a TRAINED peer table.
// mode 'full' = multiple x growth x maturity (the shipped model);
// mode 'tvlOnly' = multiple alone (diagnostic).
function predictPeer(p, asOf, trainPeers, mode) {
  const { multiple } = peerMultipleFor(p.category, trainPeers);
  if (mode === 'tvlOnly') return Math.max(1, Math.round(p.tvl_usd * multiple));
  const { growthMult, maturityMult } = multipliers(p, asOf);
  return Math.max(1, Math.round(p.tvl_usd * multiple * growthMult * maturityMult));
}

// ------------------------------------------------------------------ main
const snapshot = JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8'));
const { protocols, watchlist, as_of, floor_usd } = snapshot;

const peers = protocols
  .filter((p) => (p.mcap_usd ?? 0) > 0 && p.tvl_usd >= 5_000_000)
  .sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
const fullPeers = peerMultiplesFrom(peers);

// ---- (A) split-half -------------------------------------------------
const half = Math.floor(peers.length / 2);
const half0 = peers.slice(0, half);
const half1 = peers.slice(half);
function runSplitHalf(train, test, label) {
  const trainPeers = peerMultiplesFrom(train);
  const fullPairs = test.map((p) => ({ pred: predictPeer(p, as_of, trainPeers, 'full'), actual: p.mcap_usd }));
  const tvlPairs = test.map((p) => ({ pred: predictPeer(p, as_of, trainPeers, 'tvlOnly'), actual: p.mcap_usd }));
  return {
    label,
    nTrain: train.length,
    nTest: test.length,
    fullModel: metricsFor(fullPairs),
    tvlOnly: metricsFor(tvlPairs),
  };
}
const dirA = runSplitHalf(half0, half1, 'trainHalf0_testHalf1');
const dirB = runSplitHalf(half1, half0, 'trainHalf1_testHalf0');
// Pooled: every peer tested exactly once, full model.
const pooledPairs = [
  ...half1.map((p) => ({ pred: predictPeer(p, as_of, peerMultiplesFrom(half0), 'full'), actual: p.mcap_usd })),
  ...half0.map((p) => ({ pred: predictPeer(p, as_of, peerMultiplesFrom(half1), 'full'), actual: p.mcap_usd })),
];
const pooledPairsTvl = [
  ...half1.map((p) => ({ pred: predictPeer(p, as_of, peerMultiplesFrom(half0), 'tvlOnly'), actual: p.mcap_usd })),
  ...half0.map((p) => ({ pred: predictPeer(p, as_of, peerMultiplesFrom(half1), 'tvlOnly'), actual: p.mcap_usd })),
];
const splitHalf = {
  peerDefinition: 'mcap_usd > 0 and tvl_usd >= $5M; peers sorted by slug, split at midpoint',
  nPeers: peers.length,
  directions: [dirA, dirB],
  pooled: { fullModel: metricsFor(pooledPairs), tvlOnly: metricsFor(pooledPairsTvl) },
  averageOfDirections: {
    fullModel: {
      nTest: peers.length,
      medianAbsLog10Error: round4((dirA.fullModel.medianAbsLog10Error + dirB.fullModel.medianAbsLog10Error) / 2),
      medianAbsLog10Error_x: round4((dirA.fullModel.medianAbsLog10Error_x + dirB.fullModel.medianAbsLog10Error_x) / 2),
      medianAbsPctError: round4((dirA.fullModel.medianAbsPctError + dirB.fullModel.medianAbsPctError) / 2),
      within2x: round4((dirA.fullModel.within2x + dirB.fullModel.within2x) / 2),
      within3x: round4((dirA.fullModel.within3x + dirB.fullModel.within3x) / 2),
      within5x: round4((dirA.fullModel.within5x + dirB.fullModel.within5x) / 2),
    },
    tvlOnly: {
      nTest: peers.length,
      medianAbsLog10Error: round4((dirA.tvlOnly.medianAbsLog10Error + dirB.tvlOnly.medianAbsLog10Error) / 2),
      medianAbsLog10Error_x: round4((dirA.tvlOnly.medianAbsLog10Error_x + dirB.tvlOnly.medianAbsLog10Error_x) / 2),
      medianAbsPctError: round4((dirA.tvlOnly.medianAbsPctError + dirB.tvlOnly.medianAbsPctError) / 2),
      within2x: round4((dirA.tvlOnly.within2x + dirB.tvlOnly.within2x) / 2),
      within3x: round4((dirA.tvlOnly.within3x + dirB.tvlOnly.within3x) / 2),
      within5x: round4((dirA.tvlOnly.within5x + dirB.tvlOnly.within5x) / 2),
    },
  },
};

// ---- (B) sensitivity ------------------------------------------------
// NOTE: fullPeers is trained on ALL 128 peers, exactly as buildBoard does.
const variants = {
  peerMultiple_baseline: buildBoard(snapshot, fullPeers, 'peer'),
  flat025: buildBoard(snapshot, fullPeers, 'flat025'),
  noGrowth: buildBoard(snapshot, fullPeers, 'noGrowth'),
  noMaturity: buildBoard(snapshot, fullPeers, 'noMaturity'),
};
const baselineTop20 = variants.peerMultiple_baseline.slice(0, 20).map((r) => r.slug);
const baselineTop20Set = new Set(baselineTop20);
const tracked = ['polymarket-international', 'gauntlet', 'sentora-curator'];
function rankOf(board, slug) {
  const row = board.find((r) => r.slug === slug);
  return row ? row.rank : null;
}
const sensitivity = {};
for (const [name, board] of Object.entries(variants)) {
  const top20 = board.slice(0, 20).map((r) => r.slug);
  const overlap = top20.filter((s) => baselineTop20Set.has(s)).length;
  sensitivity[name] = {
    boardSize: board.length,
    top20OverlapWithBaseline: `${overlap}/20`,
    top20: board.slice(0, 20).map((r) => ({ rank: r.rank, slug: r.slug, implied_value_usd: r.implied_value_usd })),
    trackedRanks: Object.fromEntries(tracked.map((s) => [s, rankOf(board, s)])),
  };
}

// ---- (C) peer-multiple distribution ---------------------------------
const peerTable = [...fullPeers.byCategory.entries()]
  .filter(([, v]) => v.peers >= MODEL.peer_min_peers)
  .map(([category, v]) => ({
    category,
    peers: v.peers,
    median_multiple_raw: round4(v.median_raw),
    median_multiple_used: round4(v.median),
  }))
  .sort((a, b) => b.peers - a.peers);
const peerTableAll = [...fullPeers.byCategory.entries()]
  .map(([category, v]) => ({ category, peers: v.peers, median_multiple_raw: round4(v.median_raw) }))
  .sort((a, b) => b.peers - a.peers);

// ---- board summary (baseline) ---------------------------------------
const baseline = variants.peerMultiple_baseline;
const boardTop100 = baseline.slice(0, 100).map((r) => r.slug);

const out = {
  generatedAt: new Date().toISOString(),
  generator: 'entry/scripts/backtest.mjs (Node stdlib only, offline, deterministic)',
  input: {
    snapshot: 'kit/extracted/token-radar-01-kit/input/snapshot.json (SEALED)',
    as_of,
    floor_usd,
    protocols: protocols.length,
    watchlistSize: watchlist.length,
    note: 'Sealed snapshot carries exactly 10 fields per protocol and NO fees field; there is no fee leg in this backtest.',
  },
  model: { ...MODEL, version: 'radar-2-peer' },
  tokenizedPeers: peers.length,
  globalMultiple: round4(fullPeers.global),
  globalPeers: fullPeers.globalPeers,
  splitHalf,
  sensitivity,
  peerTable,
  peerTableAllCategories: peerTableAll,
  board: {
    baselineSize: baseline.length,
    baselineTop20: sensitivity.peerMultiple_baseline.top20,
    top100Slugs: boardTop100,
  },
  interpretation: [
    'Split-half (n=128 tokenised peers, mcap_usd>0 and tvl_usd>=$5M, sorted by slug, split 64/64, both directions pooled): the FULL peer-multiple model (multiple x growth x maturity) predicts held-out mcap with median error 0.6804 in log10, i.e. a factor of 4.79x; median absolute pct error 90.4%; only 25.8% within 2x, 37.5% within 3x, 50.8% within 5x. TARGET median error <=3x NOT ACHIEVED on the sealed snapshot.',
    'Direction average is slightly worse (0.6959 log10, 5.02x). The sealed result is slightly worse than the 17 Nov public prototype (0.639 log10, ~3.35x, within 3x 38.2%), and it does NOT reproduce the "about 3.3x" figure quoted in lib/model.ts — the coordinator should correct or justify that figure; this deterministic split-half gives ~4.8x.',
    'Growth and maturity barely move accuracy: TVL-only (multiple alone) pooled median error is 0.6890 log10 (4.89x) vs 0.6804 for the full model; within 3x 32.8% vs 37.5%. The multipliers are a small refinement on top of the peer multiple, not the source of the error — the error is the dispersion of mcap/TVL itself within categories.',
    'Sensitivity: the sealed top-20 is fairly stable across variants — flat 0.25 overlaps 17/20 with the peer-multiple baseline, no-growth 19/20, no-maturity 19/20. The top 5 (steakhouse-financial, gauntlet, veda, usdd, upshift) appear in every variant; only their order shifts. Gauntlet is rank 2 (baseline/flat/no-maturity) and 3 (no-growth). No variant rescues the valuation error above — stability of the ranking is not accuracy of the values.',
    'Polymarket and Sentora are NOT on the sealed board at all: polymarket-international (TVL $320,193,439) and sentora-curator (TVL $2,757,585,593) sit above the $50M floor and are not in the 40-slug watchlist, so buildBoard never selects them. Any sensitivity "rank" for them is N/A, not 0 — the board simply does not cover above-floor non-watchlist protocols.',
    'Board is a RANKING SIGNAL, not a valuation: a typical implied value is wrong by a factor of ~5. The dossier/dashboard must say so and must not quote implied values as if they were prices. Peer multiples vary ~18x across categories with n>=5 (Liquid Staking 0.0406 to Canonical Bridge 0.7464), which is why the peer multiple beats a flat 0.25 for ranking even though neither values anything precisely.',
  ],
};

writeFileSync(OUT_PATH, JSON.stringify(out, null, 2) + '\n');
console.log(JSON.stringify({
  peers: peers.length,
  globalMultiple: round4(fullPeers.global),
  splitHalfPooledFull: splitHalf.pooled.fullModel,
  splitHalfPooledTvlOnly: splitHalf.pooled.tvlOnly,
  boardSize: baseline.length,
  baselineTop5: baseline.slice(0, 5).map((r) => r.slug),
  trackedBaseline: sensitivity.peerMultiple_baseline.trackedRanks,
  sensitivityOverlap: Object.fromEntries(Object.entries(sensitivity).map(([k, v]) => [k, v.top20OverlapWithBaseline])),
}, null, 2));
