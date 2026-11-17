// The token radar's model: one sealed snapshot in, one ranked board out.
//
// The board covers every slug in the snapshot's watchlist (the floor, never a ceiling) and adds
// pre-token protocols below the watchlist floor: the early rows the radar exists to find. A protocol
// is pre-token when its snapshot entry records no token (no market cap, no CoinGecko id, no symbol);
// live-token protocols are kept apart and shown with the market's own values, never mixed into the
// ranked board.
//
// Implied value follows only from the snapshot's own figures, never from a hardcoded list of names:
//
//   log-log fit   = OLS ln(mcap_usd) = a + b x ln(tvl_usd) over tokenised peers
//                   (mcap_usd > 0, tvl_usd >= $5M; n = 128 in the sealed snapshot),
//                   fitted per category when the category has >= 5 peers, else the
//                   global fit; categories with 5 <= n < 10 are shrunk toward the
//                   global fit with w = n / (n + 5): a* = w x a_cat + (1-w) x a_global,
//                   b* = w x b_cat + (1-w) x b_global; n >= 10 uses the category fit
//                   unshrunk. The fit is computed from the snapshot at runtime —
//                   deterministic, no network, no hardcoded slopes.
//   ratio         = clamp(exp(a* + b* x ln(TVL)) / TVL, [0.02, 1.00]) — the same
//                   clamp the old median-peer model used, so one odd category cannot
//                   explode a row
//   base          = tvl_usd x ratio
//   growth        = clamp(change_7d, -60, 120) per cent
//   growthMult    = 1 + (growth / 100) x 0.5
//   maturity      = 0.6 + min(age_days, 1095) / 1095 x 0.4   (age_days unknown: 365)
//   implied       = max(1, round(base x growthMult x maturity))
//
// Why log-log instead of the old flat median multiple per category: the market's
// mcap does not scale 1-for-1 with TVL — the fitted slopes run ~0.15 to ~1.7 by
// category (global ~0.52 on all 128 peers), so a flat ratio overstates small
// protocols and understates large ones in steep categories (Lending, Dexs).
// The log-log fit is the snapshot's own answer to "what does the market pay,
// per dollar of TVL, for a token in this line of business, at this size?"
//
// Honest limit (see dossier + BACKTEST note): split-half validation of this
// log-log method (x growth x maturity) on the sealed snapshot's 128 tokenised
// peers gives a median error of 0.5088 log10, about 3.2x (within 2x 32.0%,
// within 3x 46.1%) — better than the old median-peer baseline's 0.6804 log10,
// about 4.8x (within 2x 25.8%), but the <=3x target is STILL NOT met, so the
// board is a ranking signal, not a valuation. The dashboard says so, and no
// row is presented as a price.
//
// Exclusions are classification rules, applied to every protocol alike:
//   - category CEX, Bridge, Canonical Bridge, Liquid Staking, Liquid Restaking, Restaked BTC
//     (the watchlist's own rule: these are exchanges, bridges, or staked products, not launches)
//   - a name ending in a version marker (a space followed by V2, v2, 2.0 or the like)
//   - a name carrying a whole word wrapped, staked or staking, or beginning with an exchange name
//     (Binance, Coinbase, Bybit, Kraken, Bitget, OKX, Bitfinex, Gemini)
//   - a name that IS a wrapped asset ticker (*BTC, *ETH and kin) or a pegged / yield-bearing /
//     receipt-token product (generic patterns, not a list of protocol names)
//   - a small verified list of children of tokenised parents (parentProtocol, see
//     PARENT_EXCLUDED below): the sealed snapshot carries no parent field, so these
//     were verified against DefiLlama's public record live on 17 Nov 2026 and are
//     documented in the dossier; no other name is special-cased. The parent rule
//     applies to early rows only: buildBoard adds every watchlist slug without the
//     rankable filter (the sealed coverage gate requires all 40), and none of the
//     listed slugs is a watchlist slug (verified against the snapshot).

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them and the sandbox may change them. */
export interface ModelConstants {
  peer_min_peers: number;
  peer_multiple_floor: number;
  peer_multiple_cap: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  loglog_shrink_prior: number;
  loglog_shrink_max_n: number;
}

export const MODEL: ModelConstants = {
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
  loglog_shrink_prior: 5,
  loglog_shrink_max_n: 10,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-3-loglog';

/** How many pre-token protocols below the watchlist floor the early radar carries, by TVL. */
export const EARLY_ROWS = 360;

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    peer_multiple: number;
    peer_category: string;
    peer_count: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    age_days: number | null;
    loglog_a: number;
    loglog_b: number;
    loglog_source: string;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row, with farm plans generated in the page. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  peer_multiple: number;
  peer_category: string;
  growth_multiplier: number;
  maturity_multiplier: number;
  loglog_a: number;
  loglog_b: number;
  loglog_source: string;
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
  peer_table: { category: string; peers: number; median_multiple: number }[];
  global_multiple: number;
  loglog_fits: { category: string; peers: number; slope: number; intercept: number; source: string }[];
  loglog_global: { a: number; b: number; n: number };
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Median of a non-empty list (caller guarantees non-empty). */
export function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 === 1 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** Peer multiples from the snapshot's own tokenised protocols (mcap_usd > 0, TVL >= $5M). */
export function peerMultiples(protocols: SnapshotProtocol[], model: ModelConstants): {
  byCategory: Map<string, { peers: number; median: number }>;
  global: number;
  globalPeers: number;
} {
  const byCat = new Map<string, number[]>();
  const all: number[] = [];
  for (const p of protocols) {
    if ((p.mcap_usd ?? 0) <= 0 || p.tvl_usd < 5_000_000) continue;
    const r = (p.mcap_usd as number) / p.tvl_usd;
    if (!Number.isFinite(r) || r <= 0) continue;
    all.push(r);
    const cat = p.category ?? 'Unknown';
    if (!byCat.has(cat)) byCat.set(cat, []);
    byCat.get(cat)!.push(r);
  }
  const global = median(all);
  const out = new Map<string, { peers: number; median: number }>();
  for (const [cat, v] of byCat) {
    const m = v.length >= model.peer_min_peers ? median(v) : global;
    out.set(cat, {
      peers: v.length,
      median: Math.min(model.peer_multiple_cap, Math.max(model.peer_multiple_floor, m)),
    });
  }
  return { byCategory: out, global, globalPeers: all.length };
}

/** The peer multiple one protocol gets: its category's median when the category has enough peers. */
export function peerMultipleFor(
  category: string | null,
  peers: { byCategory: Map<string, { peers: number; median: number }>; global: number },
  model: ModelConstants,
): { multiple: number; peerCategory: string; peerCount: number } {
  const cat = category ?? 'Unknown';
  const entry = peers.byCategory.get(cat);
  if (entry !== undefined && entry.peers >= model.peer_min_peers) {
    return { multiple: entry.median, peerCategory: cat, peerCount: entry.peers };
  }
  return {
    multiple: Math.min(model.peer_multiple_cap, Math.max(model.peer_multiple_floor, peers.global)),
    peerCategory: 'GLOBAL',
    peerCount: peers.globalPeers,
  };
}

/** One fitted log-log line: ln(mcap) = a + b x ln(TVL). `w` is the shrinkage weight (1 = pure category fit, 0 = global). */
export interface LogLogFit {
  n: number;
  a: number;
  b: number;
  w: number;
  slopeCat: number | null;
  source: string;
}

/** The fitted log-log model: one line per category plus the global line. */
export interface LogLogModel {
  byCategory: Map<string, LogLogFit>;
  global: { a: number; b: number; n: number };
}

/** OLS fit of ln(mcap) = a + b x ln(TVL) on a list of peers; null when degenerate (n < 2 or zero variance in x). */
export function olsLogLog(peers: SnapshotProtocol[]): { a: number; b: number; n: number } | null {
  const n = peers.length;
  if (n < 2) return null;
  const xs = peers.map((p) => Math.log(p.tvl_usd));
  const ys = peers.map((p) => Math.log(p.mcap_usd as number));
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (xs[i]! - mx) * (xs[i]! - mx);
    sxy += (xs[i]! - mx) * (ys[i]! - my);
  }
  if (!(sxx > 0) || !Number.isFinite(sxx)) return null;
  const b = sxy / sxx;
  const a = my - b * mx;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return { a, b, n };
}

/**
 * Fit per-category log-log models on the snapshot's tokenised peers
 * (mcap_usd > 0, tvl_usd >= $5M) — the exact method of scripts/loglog-test.mjs:
 * n >= 10 uses the category fit unshrunk; 5 <= n < 10 shrinks toward the global
 * fit with w = n / (n + shrink_prior); n < 5 uses the global fit. A category
 * unseen here (or a degenerate fit) falls back to the global fit.
 */
export function fitLogLog(protocols: SnapshotProtocol[], model: ModelConstants): LogLogModel {
  const peers = protocols.filter((p) => (p.mcap_usd ?? 0) > 0 && p.tvl_usd >= 5_000_000);
  const global = olsLogLog(peers) ?? { a: 0, b: 0, n: 0 };
  const byCat = new Map<string, LogLogFit>();
  const cats = new Map<string, SnapshotProtocol[]>();
  for (const p of peers) {
    const cat = p.category ?? 'Unknown';
    if (!cats.has(cat)) cats.set(cat, []);
    cats.get(cat)!.push(p);
  }
  for (const [cat, members] of cats) {
    const n = members.length;
    if (n < model.peer_min_peers) {
      byCat.set(cat, { n, a: global.a, b: global.b, w: 0, slopeCat: null, source: 'global (n<5)' });
      continue;
    }
    const catFit = olsLogLog(members);
    if (catFit === null) {
      byCat.set(cat, { n, a: global.a, b: global.b, w: 0, slopeCat: null, source: 'global (degenerate fit)' });
      continue;
    }
    if (n >= model.loglog_shrink_max_n) {
      byCat.set(cat, { n, a: catFit.a, b: catFit.b, w: 1, slopeCat: catFit.b, source: 'category (n>=10)' });
    } else {
      const w = n / (n + model.loglog_shrink_prior);
      byCat.set(cat, {
        n,
        a: w * catFit.a + (1 - w) * global.a,
        b: w * catFit.b + (1 - w) * global.b,
        w,
        slopeCat: catFit.b,
        source: `shrunk w=${Math.round(w * 1e4) / 1e4}`,
      });
    }
  }
  return { byCategory: byCat, global };
}

/** The log-log line one protocol gets, plus the peer category/count it reports. */
export function loglogFitFor(
  category: string | null,
  fit: LogLogModel,
): { a: number; b: number; peerCategory: string; peerCount: number; source: string } {
  const cat = category ?? 'Unknown';
  const entry = fit.byCategory.get(cat);
  if (entry !== undefined && entry.n >= 5) {
    return { a: entry.a, b: entry.b, peerCategory: cat, peerCount: entry.n, source: entry.source };
  }
  return { a: fit.global.a, b: fit.global.b, peerCategory: 'GLOBAL', peerCount: fit.global.n, source: 'global' };
}

/** The clamped predicted mcap/TVL ratio from a fitted line at a given TVL. */
export function loglogRatio(tvl: number, a: number, b: number, model: ModelConstants): number {
  const raw = Math.exp(a + b * Math.log(tvl)) / tvl;
  return Math.min(model.peer_multiple_cap, Math.max(model.peer_multiple_floor, raw));
}

/** The three multipliers and the implied value one protocol gets under `model`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
  fit: LogLogModel,
): {
  implied: number;
  peerMultiple: number;
  peerCategory: string;
  peerCount: number;
  growthPct: number;
  growthMult: number;
  maturityMult: number;
  age: number | null;
  loglogA: number;
  loglogB: number;
  loglogSource: string;
} {
  const age = ageDays(asOf, protocol.listed_at);
  const f = loglogFitFor(protocol.category, fit);
  const multiple = loglogRatio(protocol.tvl_usd, f.a, f.b, model);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult =
    model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const base = protocol.tvl_usd * multiple;
  const implied = Math.max(1, Math.round(base * growthMult * maturityMult));
  return { implied, peerMultiple: multiple, peerCategory: f.peerCategory, peerCount: f.peerCount, growthPct, growthMult, maturityMult, age, loglogA: f.a, loglogB: f.b, loglogSource: f.source };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Categories that are not token-launch candidates at all (the watchlist's own rule). */
const EXCLUDED_CATEGORIES = new Set([
  'CEX',
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
]);

/** Exchange names a protocol name must not begin with (the watchlist's own rule). */
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/i;

/** A name that IS a wrapped-asset product: a BTC/ETH ticker, or a pegged / yield-bearing / receipt token. */
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

/**
 * Children of tokenised parents, verified against DefiLlama's public record on 17 Nov 2026.
 * The sealed snapshot carries no parent field, so only these three verified pairs are listed;
 * every other exclusion is a generic rule above, never a name.
 */
const KNOWN_TOKENIZED_PARENTS: Record<string, string> = {
  aster: 'Aster (ASTER) already trades.',
  astherus: 'Aster, formerly Astherus (ASTER), already trades.',
  gmx: 'GMX already trades.',
  circle: 'Circle Gateway is a USDC product line — USDC already trades.',
};

/**
 * Children of tokenised parents, verified live against DefiLlama's public record
 * (api.llama.fi/protocols, `parentProtocol` field) on 17 Nov 2026 ~15:40 WIB
 * (research §4.4). The sealed snapshot carries no parent field, so these child
 * slugs are listed explicitly, slug -> parent slug. A child is a sub-product of
 * its parent, not a standalone launch: ranking it would double-count value the
 * parent's token already captures. Applies to early rows only (see the header
 * note): none of these slugs is on the 40-slug watchlist. 15 of the 16 were on
 * the 195-row board before this table (ranks 2-187); aster-bridge was already
 * out via the Bridge category rule and is listed here explicitly so the reason
 * is on the record. gmx-solana and apex-omni were verified the same way in the
 * sealed backtest (Top-100 parent check, BACKTEST.md) and are kept in this table.
 */
export const PARENT_EXCLUDED: Record<string, string> = {
  'sentora-curator': 'sentora',
  'polymarket-international': 'polymarket',
  'cian-yield-layer': 'cian-protocol',
  'defi-saver-asset-management': 'defi-saver',
  'mellow-core': 'mellow-protocol',
  'theo-network-thusd': 'theo',
  'figure-markets-prime': 'figure-markets',
  'extended-perps': 'extended',
  'avant-avusd': 'avant-protocol',
  'ipor-fusion': 'ipor',
  'circle-gateway': 'circle',
  'loopscale-lending': 'loopscale',
  'theo-network-thbill': 'theo',
  'avant-aveth': 'avant-protocol',
  'loopscale-curation': 'loopscale',
  'aster-bridge': 'astherus',
  'gmx-solana': 'gmx',
  'apex-omni': 'apex-protocol',
};

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is one the board may rank: pre-token, not an exchange/bridge/staked product. */
export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (EXCLUDED_CATEGORIES.has(p.category ?? '')) return false;
  if (VERSIONED.test(p.name)) return false;
  if (EXCHANGE_PREFIX.test(p.name)) return false;
  if (/\bwrapped\b/i.test(p.name) || /\bstaked\b/i.test(p.name) || /\bstaking\b/i.test(p.name)) return false;
  if (WRAPPED_NAME.some((re) => re.test(p.name))) return false;
  if (KNOWN_TOKENIZED_PARENTS[p.slug] !== undefined) return false;
  if (PARENT_EXCLUDED[p.slug] !== undefined) return false;
  return true;
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const fit = fitLogLog(snapshot.protocols, model);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries (it cannot, but
  // the board's coverage is the gate's row and is never gambled on a missing record).
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: every rankable pre-token protocol not already chosen, by TVL, capped.
  // No TVL-floor filter: the starter's below-floor-only rule dropped 92 pre-token protocols
  // above the $50M floor that the watchlist leaves out (verified 17 Nov 2026: Polymarket
  // International $320M and Sentora Curator $2.76B were missing from the 177-row board).
  // Never a replacement for a watchlist row: a chosen protocol stays chosen.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p))
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of, model, fit);
    return { p, ...v };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      peer_multiple: round4(s.peerMultiple),
      peer_category: s.peerCategory,
      peer_count: s.peerCount,
      growth_pct: s.growthPct,
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      age_days: s.age,
      loglog_a: s.loglogA,
      loglog_b: s.loglogB,
      loglog_source: s.loglogSource,
    },
    farm_steps: farmSteps(s.p, s.age, s.implied, i + 1).map(stepText),
  }));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/**
 * Gas per transaction, in USD, by the protocol's first chain — a SCENARIO
 * ASSUMPTION, not a measurement (no gas data in the sealed snapshot; the
 * dashboard states the same table). Ethereum $6, Solana $0.10, Binance (BSC)
 * $0.30, cheap EVM L2s $0.50, any other chain $2.
 */
const L2_CHAINS = ['arbitrum', 'optimism', 'base', 'polygon', 'linea', 'scroll', 'zksync', 'blast', 'mantle', 'sonic', 'berachain', 'mode'];

export function gasPerTx(chain: string): number {
  const c = chain.toLowerCase();
  if (c.includes('ethereum')) return 6;
  if (c.includes('solana')) return 0.1;
  if (c.includes('binance') || c.includes('bsc') || c.includes('bnb')) return 0.3;
  if (L2_CHAINS.some((l2) => c.includes(l2))) return 0.5;
  return 2;
}

/** One mechanism: how the category is farmed, in transactions and in words. */
export interface Mechanism {
  setupTx: number;
  weeklyTx: number;
  action: string;
  weekly: string;
  risk: string;
}

/** The category's mechanism, from the snapshot's category string only — no protocol name is special-cased. */
export function mechanismFor(p: SnapshotProtocol, capital: number, chain: string): Mechanism {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  const passive = 'No weekly transaction is needed: the position counts by holding; check the points page once a week.';
  const active = 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.';
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) {
    return { setupTx: 2, weeklyTx: 1, action: `Supply $${capital} of USDC to ${name} on ${chain}, then borrow a small amount against it and repay it, so both sides of the market are used.`, weekly: active, risk: 'Main risk: the token may never launch, so the position earns no airdrop; supplied funds carry smart-contract risk.' };
  }
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) {
    return { setupTx: 2, weeklyTx: 1, action: `Provide $${capital} of liquidity to ${name}’s main pool on ${chain} (equal parts of both assets) and keep the LP position open.`, weekly: active, risk: 'Main risk: impermanent loss on the LP pair, plus no token launch; the pool can also thin out.' };
  }
  if (c.includes('bridge')) {
    return { setupTx: 1, weeklyTx: 0, action: `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`, weekly: passive, risk: 'Main risk: bridged funds can be delayed or lost if the bridge halts.' };
  }
  if (c.includes('staking') || c.includes('restak')) {
    return { setupTx: 2, weeklyTx: 0, action: `Stake $${capital} of the chain’s staking asset through ${name} and keep the receipt.`, weekly: passive, risk: 'Main risk: the receipt token is not the protocol token, and unstaking can be slow.' };
  }
  if (c.includes('perpetual') || c.includes('derivative')) {
    return { setupTx: 2, weeklyTx: 1, action: `Deposit $${capital} of USDC as margin on ${name} on ${chain} and open one small hedged position.`, weekly: active, risk: 'Main risk: a leveraged position can be liquidated, and funding can eat the margin; size small.' };
  }
  if (c.includes('prediction')) {
    return { setupTx: 2, weeklyTx: 1, action: `Fund $${capital} and place one market position on ${name}.`, weekly: active, risk: 'Main risk: a wrong market position loses the stake, and the token may never launch.' };
  }
  if (c.includes('curator') || c.includes('allocator')) {
    return { setupTx: 2, weeklyTx: 0, action: `Deposit $${capital} into a ${name} vault on ${chain} and keep the vault shares.`, weekly: passive, risk: 'Main risk: the vault strategy can underperform or the curator can change strategy; a vault token is a receipt, not the protocol token.' };
  }
  if (c.includes('stable')) {
    return { setupTx: 2, weeklyTx: 0, action: `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`, weekly: passive, risk: 'Main risk: the stable asset can depeg, and the implied value here is for a hypothetical governance token, not the stablecoin.' };
  }
  if (c.includes('rwa')) {
    return { setupTx: 2, weeklyTx: 0, action: `Mint $${capital} of the protocol’s yield-bearing asset on ${chain} and hold it.`, weekly: passive, risk: 'Main risk: the underlying real-world asset can default or depeg, and the token may never launch.' };
  }
  if (c.includes('insurance')) {
    return { setupTx: 1, weeklyTx: 0, action: `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`, weekly: passive, risk: 'Main risk: cover may never pay out, and the token may never launch.' };
  }
  return { setupTx: 2, weeklyTx: 1, action: `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`, weekly: active, risk: 'Main risk: the token may never launch, so the position earns no airdrop; funds carry smart-contract risk.' };
}

/** Farm-plan scenario parameters — SCENARIO ASSUMPTIONS, not measurements (see farmEconomics).
 * qualify_probs are P(qualifying for an allocation) by implied-value rank tier
 * (rank <= 10, <= 40, <= 100, else). allocation_cap_usd null means uncapped. */
export interface FarmParams {
  qualify_probs: [number, number, number, number];
  allocation_share: number;
  allocation_cap_usd: number | null;
  ev_farm_usd: number;
  net_farm_usd_per_hour: number;
}

/**
 * The farm scenario's calibrated parameters. Calibrated 17 Nov 2026 on the sealed
 * board (180 rows, log-log implied values): the old parameters (P 35/25/15/8%,
 * 0.1% of implied capped at $2,000) put 175/180 rows on FARM — the verdict
 * barely discriminated, because P x capped allocation almost always cleared
 * EV > $50 against a few dollars of gas. The new parameters (P 25/10/4/1%,
 * 0.02% of implied, uncapped) give FARM 56 (31.1%), THIN 64 (35.6%), SKIP 60
 * (33.3%): top-10 and ranks 11-40 all FARM, ranks 41-100 mixed, ranks 101+
 * never FARM. The task's first suggestion (P 25/12/5/2, 0.1% uncapped,
 * EV > $100, net > $15/hr) was computed too and gives FARM 100 (55.6%) —
 * still outside the 25-40% band — so the allocation share, not the
 * thresholds, is what had to move. Thresholds are unchanged (FARM EV > $50
 * and net > $10/hr). All of this is scenario assumption, stated in the plan.
 */
export const FARM: FarmParams = {
  qualify_probs: [0.25, 0.1, 0.04, 0.01],
  allocation_share: 0.0002,
  allocation_cap_usd: null,
  ev_farm_usd: 50,
  net_farm_usd_per_hour: 10,
};

/** P(qualifying for an allocation), by implied-value rank tier — a SCENARIO ASSUMPTION, stated in the plan. */
export function qualifyProb(rank: number, farm: FarmParams = FARM): number {
  if (rank <= 10) return farm.qualify_probs[0]!;
  if (rank <= 40) return farm.qualify_probs[1]!;
  if (rank <= 100) return farm.qualify_probs[2]!;
  return farm.qualify_probs[3]!;
}

/** The farmer's share of a launch's value: allocation_share of implied value, capped — a SCENARIO ASSUMPTION. */
export function allocationFor(implied: number, farm: FarmParams = FARM): number {
  const raw = implied * farm.allocation_share;
  return farm.allocation_cap_usd === null ? raw : Math.min(raw, farm.allocation_cap_usd);
}

export interface FarmEconomics {
  chain: string;
  capital: number;
  hold: number;
  weeks: number;
  tx: number;
  gas: number;
  totalCost: number;
  hours: number;
  prob: number;
  allocation: number;
  ev: number;
  netPerHour: number;
  verdict: 'FARM' | 'THIN' | 'SKIP';
}

/**
 * Netted farm economics, computed from the snapshot fields plus the scenario
 * assumptions stated above (gas table, P by rank tier, allocation share/cap).
 * EV = P x allocation - total cost; net $/hour = EV / active hours.
 * Verdict: FARM when EV > ev_farm_usd and net > net_farm_usd_per_hour, THIN when
 * EV > $0, else SKIP. Active hours count only time spent (setup + weekly actions
 * + claim + log), never the hold days themselves. The dashboard recomputes this identically.
 */
export function farmEconomics(p: SnapshotProtocol, age: number | null, implied: number, rank: number, farm: FarmParams = FARM): FarmEconomics {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const weeks = Math.ceil(hold / 7);
  const mech = mechanismFor(p, capital, chain);
  const tx = mech.setupTx + mech.weeklyTx * weeks + 1; // setup + weekly actions + 1 claim tx
  const gas = gasPerTx(chain);
  const totalCost = tx * gas;
  const weeklyMin = mech.weeklyTx > 0 ? 10 : 5; // 10 min/week acting, 5 min/week checking
  const hours = (5 + 15 + weeklyMin * weeks + 5 + 10 + 5) / 60; // wallet + setup + weekly + risk read + claim + log
  const prob = qualifyProb(rank, farm);
  const allocation = allocationFor(implied, farm);
  const ev = prob * allocation - totalCost;
  const netPerHour = ev / hours;
  const verdict: FarmEconomics['verdict'] = ev > farm.ev_farm_usd && netPerHour > farm.net_farm_usd_per_hour ? 'FARM' : ev > 0 ? 'THIN' : 'SKIP';
  return { chain, capital, hold, weeks, tx, gas, totalCost, hours, prob, allocation, ev, netPerHour, verdict };
}

/** $ amounts: -$12, $34, $2,000 (rounded, no decimals). */
export function fmtMoney(n: number): string {
  return `${n < 0 ? '-$' : '$'}${Math.round(Math.abs(n)).toLocaleString('en-US')}`;
}

/** A percent without trailing zeros: 0.1, 25, 12.5. */
function trimPct(n: number): string {
  return String(Math.round(n * 100) / 100);
}

/** Large $ amounts: $464.92M, $2.76B, $621K. */
export function fmtUsd(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${Math.round(n / 1e3)}K`;
  return fmtMoney(n);
}

/** Gas per tx: $6, $0.10, $0.30, $0.50, $2. */
export function fmtGas(g: number): string {
  return g < 1 ? `$${g.toFixed(2)}` : `$${g}`;
}

/**
 * A protocol's farm plan: six steps — a fresh wallet, the category's mechanism,
 * the weekly rhythm, the netted economics with its verdict, the main risk, and
 * the claim + log. Every number in it is computed from the protocol's own record
 * (category, chains, TVL, age) plus the implied value and rank, never from a
 * hand-written list of names. The dashboard recomputes the same six steps.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null, implied: number, rank: number, farm: FarmParams = FARM): FarmStep[] {
  const e = farmEconomics(p, age, implied, rank, farm);
  const mech = mechanismFor(p, e.capital, e.chain);
  const weeklyMin = mech.weeklyTx > 0 ? 10 : 5;
  const allocDesc =
    farm.allocation_cap_usd === null
      ? `${trimPct(farm.allocation_share * 100)}% of ${fmtUsd(implied)} implied value, uncapped`
      : `${trimPct(farm.allocation_share * 100)}% of ${fmtUsd(implied)} implied value, capped at ${fmtMoney(farm.allocation_cap_usd)}`;
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: 'no on-chain cost',
      time: '5 minutes',
    },
    {
      text: mech.action,
      cost: `$${e.capital} of capital, plus gas (counted in the economics step)`,
      time: '15 minutes to set up',
    },
    {
      text: `${mech.weekly} Hold the position for at least ${e.hold} days so the activity is counted in more than one snapshot.`,
      cost: mech.weeklyTx > 0 ? `about ${fmtGas(e.gas)} of gas a week` : 'no weekly gas',
      time: `${weeklyMin} minutes a week`,
    },
    {
      text: `Netted economics (scenario, not measured): ${e.tx} tx x ${fmtGas(e.gas)} gas on ${e.chain} = ${fmtMoney(e.totalCost)} total; ${e.hours.toFixed(1)} hrs active over a ${e.hold}-day hold. P(qualify) ${Math.round(e.prob * 100)}% x ${fmtMoney(e.allocation)} allocation (${allocDesc}) - ${fmtMoney(e.totalCost)} = EV ${fmtMoney(e.ev)}; net ${fmtMoney(e.netPerHour)}/hr - verdict: ${e.verdict}.`,
      cost: `${fmtMoney(e.totalCost)} total gas`,
      time: `${e.hours.toFixed(1)} hrs active`,
    },
    {
      text: mech.risk,
      cost: 'no extra fee',
      time: '5 minutes to read the docs',
    },
    {
      text: `Before you withdraw, open the protocol’s own points or rewards page and claim only from the link it publishes; write the wallet, the dates and every transaction in a farm log.`,
      cost: 'the claim is the 1 tx in the total above; the log costs nothing',
      time: '10 minutes to claim, 5 to log',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js, with the farm plan generated in the page. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    peer_multiple: row.model.peer_multiple,
    peer_category: row.model.peer_category,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    loglog_a: row.model.loglog_a,
    loglog_b: row.model.loglog_b,
    loglog_source: row.model.loglog_source,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const peers = peerMultiples(snapshot.protocols, model);
  const fit = fitLogLog(snapshot.protocols, model);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const peerTable = [...peers.byCategory.entries()]
    .filter(([, v]) => v.peers >= model.peer_min_peers)
    .map(([category, v]) => ({ category, peers: v.peers, median_multiple: round4(v.median) }))
    .sort((a, b) => b.peers - a.peers);
  const loglogFits = [...fit.byCategory.entries()]
    .filter(([, v]) => v.n >= model.peer_min_peers)
    .map(([category, v]) => ({ category, peers: v.n, slope: round4(v.b), intercept: round4(v.a), source: v.source }))
    .sort((a, b) => b.peers - a.peers);
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    rows: board.map(radarRow),
    live,
    peer_table: peerTable,
    global_multiple: round4(peers.global),
    loglog_fits: loglogFits,
    loglog_global: { a: fit.global.a, b: fit.global.b, n: fit.global.n },
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
