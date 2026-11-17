// Log-log test — token-radar-01, sealed kit snapshot only (P4 research).
//
//   node scripts/loglog-test.mjs  ->  scripts/loglog.json (raw numbers)
//
// Node stdlib only, offline, deterministic. Reads the SEALED snapshot and
// re-implements the baseline (entry/scripts/backtest.mjs) plus a log-log
// variant, on the SAME split-half protocol as backtest.mjs:
//
//   * peers = protocols with mcap_usd > 0 and tvl_usd >= $5M (n = 128),
//     sorted by slug, split at the midpoint (64/64), BOTH directions,
//     pooled so every peer is tested exactly once (n = 128).
//   * NO seed, NO random trials in backtest.mjs — the split is fully
//     deterministic (slug order). The "20 trial" phrase in research
//     §4.3 does NOT match backtest.mjs; the primary comparison below
//     uses the script's exact protocol. A supplementary 20-trial
//     seeded random split-half (fixed seed 20261114, mulberry32) is
//     reported separately as a robustness check, clearly labelled.
//   * baseline: median mcap/TVL per category (n >= 5 peers) else
//     global median 0.2138, clamp [0.02, 1.0]; 'full' = multiple x
//     growth x maturity, 'tvlOnly' = multiple alone.
//   * log-log variant: OLS fit ln(mcap) = a + b*ln(TVL) per category
//     on the TRAIN half (n >= 5); categories with n < 5 use the
//     global fit. Shrinkage for 5 <= n < 10 (see fitLogLog):
//     w = n / (n + 5); b* = w*b_cat + (1-w)*b_global,
//     a* = w*a_cat + (1-w)*a_global. Categories with n >= 10 use
//     the category fit unshrunk. Predicted ratio
//     r = exp(a* + b* ln(TVL)) / TVL is clamped to [0.02, 1.0]
//     and implied = TVL * clamped r — the same clamp as the
//     baseline, so the two are comparable. The log-log variant is
//     TVL-only (no growth/maturity leg), so its fair comparator is
//     the baseline 'tvlOnly' diagnostic; the 'full' baseline is
//     shown alongside for reference.
//   * secondary diagnostic 'loglogFull': log-log ratio x growth x
//     maturity, to check whether the multipliers rescue the fit.
//   * metrics are IDENTICAL to backtest.mjs metricsFor(): median
//     absolute log10 error (+ factor 10^err), median abs pct error,
//     % within 2x / 3x / 5x.
//
// This script does NOT import the TS model and does NOT modify any
// model, board, dashboard or entry file. It only writes loglog.json.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_PATH = join(
  HERE, '..', '..', 'kit', 'extracted', 'token-radar-01-kit', 'input', 'snapshot.json',
);
const OUT_PATH = join(HERE, 'loglog.json');

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
const SHRINK_PRIOR = 5; // shrinkage pseudo-count: w = n / (n + 5)
const SHRINK_MAX_N = 10; // shrink only when 5 <= n < 10
const DAY_MS = 86_400_000;
const RANDOM_TRIALS = 20;
const RANDOM_SEED = 20261114;

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
// Deterministic PRNG (mulberry32) for the supplementary random trials only.
function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------- baseline (backtest.mjs)
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
function predictBaseline(p, asOf, trainPeers, mode) {
  const { multiple } = peerMultipleFor(p.category, trainPeers);
  if (mode === 'tvlOnly') return Math.max(1, Math.round(p.tvl_usd * multiple));
  const { growthMult, maturityMult } = multipliers(p, asOf);
  return Math.max(1, Math.round(p.tvl_usd * multiple * growthMult * maturityMult));
}

// ------------------------------------------------------------- log-log fit
// OLS fit of ln(mcap) = a + b * ln(TVL) on a list of peers.
// Returns null when the fit is degenerate (n < 2 or zero variance in x).
function olsLogLog(peers) {
  const n = peers.length;
  if (n < 2) return null;
  const xs = peers.map((p) => Math.log(p.tvl_usd));
  const ys = peers.map((p) => Math.log(p.mcap_usd));
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxx = 0, sxy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (xs[i] - mx) * (xs[i] - mx);
    sxy += (xs[i] - mx) * (ys[i] - my);
  }
  if (!(sxx > 0) || !Number.isFinite(sxx)) return null;
  const b = sxy / sxx;
  const a = my - b * mx;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return { a, b, n };
}

// Fit per-category log-log models on the TRAIN peers, with shrinkage.
//   n >= 10 : category fit as-is.
//   5 <= n < 10 : w = n/(n+5); a* = w*a_cat + (1-w)*a_global,
//                 b* = w*b_cat + (1-w)*b_global.
//   n < 5 : global fit (no category fit attempted).
// Returns { byCategory: Map(cat -> {n, a, b, w, slopeCat, slopeGlobal}),
//           global: {a, b, n} }.
function fitLogLog(train) {
  const global = olsLogLog(train);
  const byCat = new Map();
  const cats = new Map();
  for (const p of train) {
    const cat = p.category ?? 'Unknown';
    if (!cats.has(cat)) cats.set(cat, []);
    cats.get(cat).push(p);
  }
  for (const [cat, members] of cats) {
    const n = members.length;
    if (n < MODEL.peer_min_peers) {
      byCat.set(cat, { n, a: global.a, b: global.b, w: 0, slopeCat: null, slopeGlobal: global.b, source: 'global (n<5)' });
      continue;
    }
    const catFit = olsLogLog(members);
    if (catFit === null) {
      byCat.set(cat, { n, a: global.a, b: global.b, w: 0, slopeCat: null, slopeGlobal: global.b, source: 'global (degenerate fit)' });
      continue;
    }
    if (n >= SHRINK_MAX_N) {
      byCat.set(cat, { n, a: catFit.a, b: catFit.b, w: 1, slopeCat: catFit.b, slopeGlobal: global.b, source: 'category (n>=10)' });
    } else {
      const w = n / (n + SHRINK_PRIOR);
      byCat.set(cat, {
        n,
        a: w * catFit.a + (1 - w) * global.a,
        b: w * catFit.b + (1 - w) * global.b,
        w: round4(w),
        slopeCat: round4(catFit.b),
        slopeGlobal: round4(global.b),
        source: `shrunk w=${round4(w)}`,
      });
    }
  }
  return { byCategory: byCat, global }; // global kept unrounded; round only when reporting
}

// Predicted implied mcap for a protocol under a fitted log-log model.
// mode 'tvlOnly': implied = TVL * clamp(exp(a + b ln TVL)/TVL, 0.02, 1.0)
// mode 'full': same ratio, then x growth x maturity (diagnostic only).
function predictLogLog(p, asOf, fit, mode) {
  const cat = p.category ?? 'Unknown';
  // Category unseen in train (or n<5) falls back to the global fit.
  const f = fit.byCategory.get(cat) ?? { a: fit.global.a, b: fit.global.b };
  const ratioRaw = Math.exp(f.a + f.b * Math.log(p.tvl_usd)) / p.tvl_usd;
  const ratio = clamp(ratioRaw, MODEL.peer_multiple_floor, MODEL.peer_multiple_cap);
  if (mode === 'tvlOnly') return Math.max(1, Math.round(p.tvl_usd * ratio));
  const { growthMult, maturityMult } = multipliers(p, asOf);
  return Math.max(1, Math.round(p.tvl_usd * ratio * growthMult * maturityMult));
}

// ---------------------------------------------------------------- metrics
function metricsFor(pairs) {
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

// -------------------------------------------------------------------- main
const snapshot = JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8'));
const { protocols, as_of } = snapshot;

const peers = protocols
  .filter((p) => (p.mcap_usd ?? 0) > 0 && p.tvl_usd >= 5_000_000)
  .sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));

// One split-half run: train on one half, test on the other.
// Returns metrics for baseline full/tvlOnly, log-log (shrunk, tvlOnly),
// log-log full (diagnostic) and log-log no-shrinkage (diagnostic).
function runOneSplit(train, test, label) {
  const trainPeers = peerMultiplesFrom(train);
  const fit = fitLogLog(train);
  const baseFull = test.map((p) => ({ pred: predictBaseline(p, as_of, trainPeers, 'full'), actual: p.mcap_usd }));
  const baseTvl = test.map((p) => ({ pred: predictBaseline(p, as_of, trainPeers, 'tvlOnly'), actual: p.mcap_usd }));
  const llTvl = test.map((p) => ({ pred: predictLogLog(p, as_of, fit, 'tvlOnly'), actual: p.mcap_usd }));
  const llFull = test.map((p) => ({ pred: predictLogLog(p, as_of, fit, 'full'), actual: p.mcap_usd }));
  // No-shrinkage diagnostic: pure category fits (n>=5), else global.
  const pure = fitLogLogPure(train, fit.global);
  const llNoShrink = test.map((p) => ({ pred: predictLogLog(p, as_of, pure, 'tvlOnly'), actual: p.mcap_usd }));
  return {
    label,
    nTrain: train.length,
    nTest: test.length,
    baselineFull: metricsFor(baseFull),
    baselineTvlOnly: metricsFor(baseTvl),
    loglogShrunkTvlOnly: metricsFor(llTvl),
    loglogShrunkFull: metricsFor(llFull),
    loglogNoShrinkTvlOnly: metricsFor(llNoShrink),
    fits: [...fit.byCategory.entries()]
      .filter(([, f]) => f.n >= MODEL.peer_min_peers)
      .map(([category, f]) => ({ category, nTrain: f.n, slopeCat: f.slopeCat, slopeGlobal: f.slopeGlobal, w: f.w, slopeUsed: round4(f.b), interceptUsed: round4(f.a), source: f.source }))
      .sort((a, b) => b.nTrain - a.nTrain),
    globalFit: { a: round4(fit.global.a), b: round4(fit.global.b), n: fit.global.n },
  };
}

// Pure (unshrunk) category fits, for the no-shrinkage diagnostic.
function fitLogLogPure(train, globalRounded) {
  const global = olsLogLog(train);
  const byCat = new Map();
  const cats = new Map();
  for (const p of train) {
    const cat = p.category ?? 'Unknown';
    if (!cats.has(cat)) cats.set(cat, []);
    cats.get(cat).push(p);
  }
  for (const [cat, members] of cats) {
    const n = members.length;
    if (n < MODEL.peer_min_peers) {
      byCat.set(cat, { n, a: global.a, b: global.b, w: 0, slopeCat: null, slopeGlobal: global.b, source: 'global (n<5)' });
      continue;
    }
    const catFit = olsLogLog(members);
    if (catFit === null) {
      byCat.set(cat, { n, a: global.a, b: global.b, w: 0, slopeCat: null, slopeGlobal: global.b, source: 'global (degenerate fit)' });
      continue;
    }
    byCat.set(cat, { n, a: catFit.a, b: catFit.b, w: 1, slopeCat: round4(catFit.b), slopeGlobal: round4(global.b), source: 'category pure' });
  }
  return { byCategory: byCat, global: globalRounded };
}

// ---- PRIMARY: exact backtest.mjs protocol (deterministic slug split) ----
const half = Math.floor(peers.length / 2);
const half0 = peers.slice(0, half);
const half1 = peers.slice(half);
const dirA = runOneSplit(half0, half1, 'trainHalf0_testHalf1');
const dirB = runOneSplit(half1, half0, 'trainHalf1_testHalf0');

// Pooled: every peer tested exactly once.
function pooledMetrics(trainA, testA, trainB, testB, predict) {
  const pairs = [
    ...testA.map((p) => ({ pred: predict(p, trainA), actual: p.mcap_usd })),
    ...testB.map((p) => ({ pred: predict(p, trainB), actual: p.mcap_usd })),
  ];
  return metricsFor(pairs);
}
const pooled = {
  baselineFull: pooledMetrics(half0, half1, half1, half0,
    (p, tr) => predictBaseline(p, as_of, peerMultiplesFrom(tr), 'full')),
  baselineTvlOnly: pooledMetrics(half0, half1, half1, half0,
    (p, tr) => predictBaseline(p, as_of, peerMultiplesFrom(tr), 'tvlOnly')),
  loglogShrunkTvlOnly: pooledMetrics(half0, half1, half1, half0,
    (p, tr) => predictLogLog(p, as_of, fitLogLog(tr), 'tvlOnly')),
  loglogShrunkFull: pooledMetrics(half0, half1, half1, half0,
    (p, tr) => predictLogLog(p, as_of, fitLogLog(tr), 'full')),
  loglogNoShrinkTvlOnly: pooledMetrics(half0, half1, half1, half0,
    (p, tr) => predictLogLog(p, as_of, fitLogLogPure(tr, fitLogLog(tr).global), 'tvlOnly')),
};

// ---- SUPPLEMENTARY: 20 seeded random split-half trials (robustness) ----
// Same 64/64 sizes, both directions pooled per trial; fixed seed.
const rng = mulberry32(RANDOM_SEED);
const trialRows = [];
for (let t = 0; t < RANDOM_TRIALS; t++) {
  const shuffled = [...peers];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const tr = shuffled.slice(0, half);
  const te = shuffled.slice(half);
  const mBase = pooledMetrics(tr, te, te, tr,
    (p, train) => predictBaseline(p, as_of, peerMultiplesFrom(train), 'tvlOnly'));
  const mLl = pooledMetrics(tr, te, te, tr,
    (p, train) => predictLogLog(p, as_of, fitLogLog(train), 'tvlOnly'));
  trialRows.push({
    trial: t + 1,
    baselineTvlOnly_medLog10: mBase.medianAbsLog10Error,
    baselineTvlOnly_within2x: mBase.within2x,
    loglog_medLog10: mLl.medianAbsLog10Error,
    loglog_within2x: mLl.within2x,
    loglogMinusBaseline_medLog10: round4(mLl.medianAbsLog10Error - mBase.medianAbsLog10Error),
  });
}
function mean(xs) { return xs.reduce((a, b) => a + b, 0) / xs.length; }
const randomTrials = {
  method: `20 random 64/64 split-half trials, both directions pooled per trial, mulberry32 seed ${RANDOM_SEED}`,
  trials: trialRows,
  summary: {
    nTrials: RANDOM_TRIALS,
    baselineTvlOnly_meanMedLog10: round4(mean(trialRows.map((r) => r.baselineTvlOnly_medLog10))),
    baselineTvlOnly_medianMedLog10: round4(median(trialRows.map((r) => r.baselineTvlOnly_medLog10))),
    baselineTvlOnly_meanWithin2x: round4(mean(trialRows.map((r) => r.baselineTvlOnly_within2x))),
    loglog_meanMedLog10: round4(mean(trialRows.map((r) => r.loglog_medLog10))),
    loglog_medianMedLog10: round4(median(trialRows.map((r) => r.loglog_medLog10))),
    loglog_meanWithin2x: round4(mean(trialRows.map((r) => r.loglog_within2x))),
    trialsWhereLoglogWinsMedLog10: trialRows.filter((r) => r.loglogMinusBaseline_medLog10 < 0).length,
    meanDeltaMedLog10_loglogMinusBaseline: round4(mean(trialRows.map((r) => r.loglogMinusBaseline_medLog10))),
  },
};

// ---- adoption test (primary protocol, pooled, vs tvlOnly baseline) -----
const b = pooled.baselineTvlOnly;
const l = pooled.loglogShrunkTvlOnly;
const relImprovement = (b.medianAbsLog10Error - l.medianAbsLog10Error) / b.medianAbsLog10Error;
const adoption = {
  criterion: 'ADOPT only if pooled median log10 error falls >=10% relative AND within-2x rises, vs the tvlOnly baseline (the log-log variant has no growth/maturity leg)',
  medianLog10_relativeChange: round4(relImprovement),
  within2x_change_pp: round4((l.within2x - b.within2x) * 100),
  verdict: (relImprovement >= 0.10 && l.within2x > b.within2x) ? 'ADOPT' : 'REJECT',
};

const out = {
  generatedAt: new Date().toISOString(),
  generator: 'entry/scripts/loglog-test.mjs (Node stdlib only, offline, deterministic)',
  input: {
    snapshot: 'kit/extracted/token-radar-01-kit/input/snapshot.json (SEALED)',
    as_of,
    protocols: protocols.length,
    note: 'Same sealed snapshot as backtest.mjs. backtest.mjs uses NO seed and NO 20 trials: its split is one deterministic slug-sorted 64/64 split, both directions, pooled. The primary comparison below follows that exact protocol; the 20 random trials are a supplementary robustness check only.',
  },
  model: {
    ...MODEL,
    shrinkage: `w = n/(n+${SHRINK_PRIOR}) applied when 5 <= n < ${SHRINK_MAX_N}; n >= ${SHRINK_MAX_N} uses the category fit unshrunk; n < 5 uses the global fit`,
    clamp: '[0.02, 1.0] on the predicted mcap/TVL ratio, same as baseline',
  },
  tokenizedPeers: peers.length,
  splitHalfDeterministic: {
    peerDefinition: 'mcap_usd > 0 and tvl_usd >= $5M; peers sorted by slug, split at midpoint',
    nPeers: peers.length,
    directions: [dirA, dirB],
    pooled,
  },
  randomTrials20: randomTrials,
  adoption,
  interpretation: [
    'Primary (exact backtest.mjs protocol, pooled n=128): see pooled numbers in this file. The verdict is computed from them, not from the random trials.',
    'Supplementary (20 seeded random splits): mean/median of the per-trial pooled median log10 error, for baseline tvlOnly vs log-log. If log-log wins the deterministic split but loses most random trials (or vice versa), the deterministic result is a split artefact, not a model win.',
  ],
};

writeFileSync(OUT_PATH, JSON.stringify(out, null, 2) + '\n');
console.log(JSON.stringify({
  peers: peers.length,
  pooledBaselineFull: pooled.baselineFull,
  pooledBaselineTvlOnly: pooled.baselineTvlOnly,
  pooledLoglogShrunkTvlOnly: pooled.loglogShrunkTvlOnly,
  pooledLoglogShrunkFull: pooled.loglogShrunkFull,
  pooledLoglogNoShrinkTvlOnly: pooled.loglogNoShrinkTvlOnly,
  randomTrialsSummary: randomTrials.summary,
  adoption,
}, null, 2));
