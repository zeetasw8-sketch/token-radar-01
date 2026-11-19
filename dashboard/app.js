// Token Radar dashboard (radar-4-slope-median). Static page: reads window.RADAR from
// ../data.js, renders the ranked board, filters, a live-token tab, a per-protocol
// detail panel and the model panel. No network calls, no fetch, no framework.
(function () {
  'use strict';
  var DATA = window.RADAR;
  var app = document.getElementById('app');
  if (!DATA || !app) return;
  var M = DATA.model || {};
  var state = { q: '', category: 'all', tab: 'pre', sort: 'implied', dir: -1, sel: null };

  function money(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    var a = Math.abs(n);
    if (a >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (a >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
  }
  function pct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function age(n) {
    if (n === null || n === undefined) return 'unknown';
    if (n >= 365) return (n / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(n)) + 'd';
  }
  function mult(n) { return (n === null || n === undefined || !isFinite(n)) ? 'n/a' : 'x' + n.toFixed(4); }
  function esc(s) { return String(s == null ? '' : s); }

  // Recompute implied value from the snapshot figures, exactly as lib/model.ts
  // does: the row's own slope-median line (ln mcap = a + 0.55 x ln TVL, with a
  // the category's shrunk median intercept; coefficients stored at full
  // precision in data.js) gives a predicted mcap/TVL ratio clamped to
  // [floor, cap]; implied value is TVL x that ratio x growth multiplier x
  // maturity multiplier. The result is checked against the board's stored number.
  function recompute(r) {
    var g = r.change_7d === null || r.change_7d === undefined ? 0 : r.change_7d;
    g = Math.min(M.growth_cap, Math.max(M.growth_floor, g));
    var gm = 1 + (g / 100) * M.growth_weight;
    var a = (r.age_days === null || r.age_days === undefined) ? M.unknown_age_days : r.age_days;
    var mm = M.maturity_floor + (Math.min(Math.max(a, 0), M.maturity_days) / M.maturity_days) * M.maturity_range;
    var ratio;
    if (r.slope_a !== null && r.slope_a !== undefined && r.slope_b !== null && r.slope_b !== undefined) {
      var raw = Math.exp(r.slope_a + r.slope_b * Math.log(r.tvl_usd)) / r.tvl_usd;
      ratio = Math.min(M.peer_multiple_cap, Math.max(M.peer_multiple_floor, raw));
    } else {
      ratio = r.peer_multiple;
    }
    return { value: Math.max(1, Math.round(r.tvl_usd * ratio * gm * mm)), growth: g, gm: gm, mm: mm, ratio: ratio };
  }

  // Farm plan, derived from the protocol's own record (category, chains, TVL,
  // age) plus its implied value and rank — the same derivation lib/model.ts
  // writes into board.json, recomputed here step for step. No name is
  // special-cased. Economics are a stated scenario, not a measurement: gas
  // per tx by first chain (Ethereum $6, Solana $0.10, Binance/BSC $0.30,
  // cheap EVM L2s $0.50, other chains $2); P(qualify) by rank tier
  // (top 10: 25%, 11-40: 10%, 41-100: 4%, else 1%); allocation 0.02% of
  // implied value, uncapped; EV = P x allocation - total gas cost.
  // Verdict: FARM when EV > $50 and net > $10/hr, THIN when EV > $0, else SKIP.
  // Calibrated 17 Nov 2026: on this 180-row board that gives FARM 51 (28.3%),
  // THIN 77 (42.8%), SKIP 52 (28.9%) — the old parameters (P 35/25/15/8%,
  // 0.1% capped at $2,000) put 175/180 rows on FARM and barely discriminated.
  function chainOf(p) { return (p.chains && p.chains.length) ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdFor(a) { if (a === null || a === undefined) return 30; if (a < 180) return 60; if (a < 365) return 45; return 30; }
  var L2 = ['arbitrum', 'optimism', 'base', 'polygon', 'linea', 'scroll', 'zksync', 'blast', 'mantle', 'sonic', 'berachain', 'mode'];
  function gasPerTx(chain) {
    var c = String(chain).toLowerCase();
    if (c.indexOf('ethereum') >= 0) return 6;
    if (c.indexOf('solana') >= 0) return 0.1;
    if (c.indexOf('binance') >= 0 || c.indexOf('bsc') >= 0 || c.indexOf('bnb') >= 0) return 0.3;
    for (var i = 0; i < L2.length; i++) if (c.indexOf(L2[i]) >= 0) return 0.5;
    return 2;
  }
  function mechanismFor(p, cap, chain) {
    var c = (p.category || '').toLowerCase(), n = p.name;
    var passive = 'No weekly transaction is needed: the position counts by holding; check the points page once a week.';
    var active = 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.';
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0)
      return { setupTx: 2, weeklyTx: 1, action: 'Supply $' + cap + ' of USDC to ' + n + ' on ' + chain + ', then borrow a small amount against it and repay it, so both sides of the market are used.', weekly: active, risk: 'Main risk: the token may never launch, so the position earns no airdrop; supplied funds carry smart-contract risk.' };
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0)
      return { setupTx: 2, weeklyTx: 1, action: 'Provide $' + cap + ' of liquidity to ' + n + '\u2019s main pool on ' + chain + ' (equal parts of both assets) and keep the LP position open.', weekly: active, risk: 'Main risk: impermanent loss on the LP pair, plus no token launch; the pool can also thin out.' };
    if (c.indexOf('bridge') >= 0)
      return { setupTx: 1, weeklyTx: 0, action: 'Bridge $' + cap + ' of USDC to ' + chain + ' through ' + n + ' and use the bridged funds in its app.', weekly: passive, risk: 'Main risk: bridged funds can be delayed or lost if the bridge halts.' };
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0)
      return { setupTx: 2, weeklyTx: 0, action: 'Stake $' + cap + ' of the chain\u2019s staking asset through ' + n + ' and keep the receipt.', weekly: passive, risk: 'Main risk: the receipt token is not the protocol token, and unstaking can be slow.' };
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0)
      return { setupTx: 2, weeklyTx: 1, action: 'Deposit $' + cap + ' of USDC as margin on ' + n + ' on ' + chain + ' and open one small hedged position.', weekly: active, risk: 'Main risk: a leveraged position can be liquidated, and funding can eat the margin; size small.' };
    if (c.indexOf('prediction') >= 0)
      return { setupTx: 2, weeklyTx: 1, action: 'Fund $' + cap + ' and place one market position on ' + n + '.', weekly: active, risk: 'Main risk: a wrong market position loses the stake, and the token may never launch.' };
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0)
      return { setupTx: 2, weeklyTx: 0, action: 'Deposit $' + cap + ' into a ' + n + ' vault on ' + chain + ' and keep the vault shares.', weekly: passive, risk: 'Main risk: the vault strategy can underperform or the curator can change strategy; a vault token is a receipt, not the protocol token.' };
    if (c.indexOf('stable') >= 0)
      return { setupTx: 2, weeklyTx: 0, action: 'Mint or deposit $' + cap + ' of the stable asset through ' + n + ' on ' + chain + '.', weekly: passive, risk: 'Main risk: the stable asset can depeg, and the implied value here is for a hypothetical governance token, not the stablecoin.' };
    if (c.indexOf('rwa') >= 0)
      return { setupTx: 2, weeklyTx: 0, action: 'Mint $' + cap + ' of the protocol\u2019s yield-bearing asset on ' + chain + ' and hold it.', weekly: passive, risk: 'Main risk: the underlying real-world asset can default or depeg, and the token may never launch.' };
    if (c.indexOf('insurance') >= 0)
      return { setupTx: 1, weeklyTx: 0, action: 'Buy $' + cap + ' of cover from ' + n + ' on ' + chain + ' and keep the policy.', weekly: passive, risk: 'Main risk: cover may never pay out, and the token may never launch.' };
    return { setupTx: 2, weeklyTx: 1, action: 'Deposit $' + cap + ' of USDC into ' + n + ' on ' + chain + ' and keep the position open.', weekly: active, risk: 'Main risk: the token may never launch, so the position earns no airdrop; funds carry smart-contract risk.' };
  }
  function qualifyProb(rank) { if (rank <= 10) return 0.25; if (rank <= 40) return 0.10; if (rank <= 100) return 0.04; return 0.01; }
  function fmtMoney(n) { return (n < 0 ? '-$' : '$') + Math.round(Math.abs(n)).toLocaleString('en-US'); }
  function fmtUsd(n) {
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return fmtMoney(n);
  }
  function fmtGas(g) { return g < 1 ? '$' + g.toFixed(2) : '$' + g; }
  function farmEconomics(p) {
    var chain = chainOf(p), cap = capitalFor(p), hold = holdFor(p.age_days);
    var weeks = Math.ceil(hold / 7), mech = mechanismFor(p, cap, chain);
    var tx = mech.setupTx + mech.weeklyTx * weeks + 1;
    var gas = gasPerTx(chain), cost = tx * gas;
    var weeklyMin = mech.weeklyTx > 0 ? 10 : 5;
    var hours = (5 + 15 + weeklyMin * weeks + 5 + 10 + 5) / 60;
    var prob = qualifyProb(p.rank), alloc = p.implied_value_usd * 0.0002;
    var ev = prob * alloc - cost, net = ev / hours;
    var verdict = (ev > 50 && net > 10) ? 'FARM' : (ev > 0 ? 'THIN' : 'SKIP');
    return { chain: chain, cap: cap, hold: hold, weeks: weeks, tx: tx, gas: gas, cost: cost, hours: hours, prob: prob, alloc: alloc, ev: ev, net: net, verdict: verdict, mech: mech, weeklyMin: weeklyMin };
  }
  function farmSteps(p) {
    var e = farmEconomics(p);
    var raw = [
      { t: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', c: 'no on-chain cost', w: '5 minutes' },
      { t: e.mech.action, c: '$' + e.cap + ' of capital, plus gas (counted in the economics step)', w: '15 minutes to set up' },
      { t: e.mech.weekly + ' Hold the position for at least ' + e.hold + ' days so the activity is counted in more than one snapshot.', c: e.mech.weeklyTx > 0 ? 'about ' + fmtGas(e.gas) + ' of gas a week' : 'no weekly gas', w: e.weeklyMin + ' minutes a week' },
      { t: 'Netted economics (scenario, not measured): ' + e.tx + ' tx x ' + fmtGas(e.gas) + ' gas on ' + e.chain + ' = ' + fmtMoney(e.cost) + ' total; ' + e.hours.toFixed(1) + ' hrs active over a ' + e.hold + '-day hold. P(qualify) ' + Math.round(e.prob * 100) + '% x ' + fmtMoney(e.alloc) + ' allocation (0.02% of ' + fmtUsd(p.implied_value_usd) + ' implied value, uncapped) - ' + fmtMoney(e.cost) + ' = EV ' + fmtMoney(e.ev) + '; net ' + fmtMoney(e.net) + '/hr - verdict: ' + e.verdict + '.', c: fmtMoney(e.cost) + ' total gas', w: e.hours.toFixed(1) + ' hrs active' },
      { t: e.mech.risk, c: 'no extra fee', w: '5 minutes to read the docs' },
      { t: 'Before you withdraw, open the protocol\u2019s own points or rewards page and claim only from the link it publishes; write the wallet, the dates and every transaction in a farm log.', c: 'the claim is the 1 tx in the total above; the log costs nothing', w: '10 minutes to claim, 5 to log' }
    ];
    return raw.map(function (s) { return s.t + ' Cost: ' + s.c + '. Time: ' + s.w + '.'; });
  }
  function splitStep(s) {
    var at = s.indexOf(' Cost: ');
    if (at < 0) return { act: s, tail: '' };
    return { act: s.slice(0, at), tail: s.slice(at + 1) };
  }

  function el(tag, attrs) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') n.className = attrs[k];
      else if (k === 'text') n.textContent = attrs[k];
      else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== null && attrs[k] !== undefined) n.setAttribute(k, attrs[k]);
    });
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c === null || c === undefined) continue;
      if (Array.isArray(c)) c.forEach(function (x) { if (x) n.appendChild(x); });
      else if (typeof c === 'string') n.appendChild(document.createTextNode(c));
      else n.appendChild(c);
    }
    return n;
  }

  function readHash() {
    var h = window.location.hash.replace(/^#/, '');
    if (!h) return;
    var p = new URLSearchParams(h);
    if (p.get('q')) state.q = p.get('q');
    if (p.get('category')) state.category = p.get('category');
    if (p.get('tab')) state.tab = p.get('tab') === 'live' ? 'live' : 'pre';
    if (p.get('p')) state.sel = p.get('p');
  }
  function writeHash() {
    var p = new URLSearchParams();
    if (state.q) p.set('q', state.q);
    if (state.category !== 'all') p.set('category', state.category);
    if (state.tab === 'live') p.set('tab', 'live');
    if (state.sel) p.set('p', state.sel);
    var s = p.toString();
    window.history.replaceState(null, '', s ? '#' + s : window.location.pathname + window.location.search);
  }

  function filtered() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (!q) return true;
      return [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase().indexOf(q) >= 0;
    });
  }
  function sorted(list) {
    var k = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (k === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (k === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (k === 'growth') { av = (a.change_7d === null) ? -Infinity : a.change_7d; bv = (b.change_7d === null) ? -Infinity : b.change_7d; }
      else if (k === 'age') { av = (a.age_days === null) ? Infinity : a.age_days; bv = (b.age_days === null) ? Infinity : b.age_days; }
      else if (k === 'peer') { av = a.peer_multiple; bv = b.peer_multiple; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function sortTh(key, label) {
    return el('th', { scope: 'col' }, el('button', { type: 'button', onclick: function () {
      if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; }
      render();
    } }, label, state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' \u25bc' : ' \u25b2' }) : null));
  }

  function boardTable() {
    var list = sorted(filtered());
    if (!list.length) {
      return el('div', { class: 'card' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'btn go', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; writeHash(); render(); } })));
    }
    var max = 1; list.forEach(function (r) { if (r.implied_value_usd > max) max = r.implied_value_usd; });
    var tb = el('tbody');
    list.forEach(function (r) {
      var g = r.change_7d === null ? 'n/a' : pct(r.change_7d);
      var gc = r.change_7d === null ? '' : (r.change_7d >= 0 ? 'up' : 'down');
      tb.appendChild(el('tr', {
        'data-selected': state.sel === r.slug ? 'true' : 'false', 'class': state.sel === r.slug ? 'sel' : null,
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'who' }, el('b', { text: r.name }),
          el('span', { text: (r.category || 'Other') + ' \u00b7 ' + ((r.chains && r.chains.length) ? r.chains.slice(0, 2).join(', ') : 'chain n/a') }))),
        el('td', { class: 'num', text: money(r.tvl_usd) }),
        el('td', { class: 'num ' + gc, text: g }),
        el('td', { class: 'num', text: age(r.age_days) }),
        el('td', { class: 'num', text: mult(r.peer_multiple) }),
        el('td', null, el('div', { class: 'imp' },
          el('span', { class: 'meter', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round(r.implied_value_usd / max * 100)) + '%' })),
          el('span', { class: 'num', text: money(r.implied_value_usd) }))),
        el('td', null, el('span', { class: 'pill pre', text: 'no token' }))));
    });
    return el('div', { class: 'card' }, el('div', { class: 'scroll' }, el('table', { id: 'board-table' },
      el('caption', { text: 'Pre-token protocols, strongest implied value first. Select a row for its model inputs and farm plan.' }),
      el('thead', null, el('tr', null,
        sortTh('implied', 'Rank'), sortTh('name', 'Protocol'), sortTh('tvl', 'TVL'),
        sortTh('growth', '7d'), sortTh('age', 'Age'), sortTh('peer', 'Ratio \u00d7'), sortTh('implied', 'Implied value'),
        el('th', { scope: 'col', text: 'Token' }))),
      tb)));
  }

  function liveTable() {
    var tb = el('tbody');
    DATA.live.forEach(function (r) {
      var ratio = (r.mcap_usd && r.tvl_usd) ? (r.mcap_usd / r.tvl_usd).toFixed(2) + '\u00d7' : 'n/a';
      tb.appendChild(el('tr', null,
        el('td', null, el('span', { class: 'pill live', text: 'live' })),
        el('td', null, el('div', { class: 'who' }, el('b', { text: r.name }),
          el('span', { text: (r.category || 'Other') + ' \u00b7 ' + ((r.chains && r.chains.length) ? r.chains.slice(0, 2).join(', ') : 'chain n/a') }))),
        el('td', { class: 'num', text: money(r.tvl_usd) }),
        el('td', { class: 'num ' + ((r.change_7d !== null && r.change_7d >= 0) ? 'up' : 'down'), text: pct(r.change_7d) }),
        el('td', { class: 'num', text: money(r.mcap_usd) }),
        el('td', { class: 'num', text: ratio })));
    });
    return el('div', { class: 'card' }, el('div', { class: 'scroll' }, el('table', { id: 'board-table' },
      el('caption', { text: 'Already trading: market cap is a fact, not a model. These protocols are set aside from the pre-token ranking.' }),
      el('thead', null, el('tr', null,
        el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }),
        el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }),
        el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Mcap / TVL' }))),
      tb)));
  }

  function modelPanel() {
    var pt = el('tbody');
    (DATA.slope_fits || []).forEach(function (p) {
      pt.appendChild(el('tr', null,
        el('td', { text: p.category }),
        el('td', { class: 'num', text: String(p.peers) }),
        el('td', { class: 'num', text: p.slope.toFixed(4) }),
        el('td', { class: 'num', text: p.intercept.toFixed(4) }),
        el('td', { text: p.source })));
    });
    var g = DATA.slope_global || {};
    return el('section', { class: 'card model' },
      el('h2', { text: 'How implied value is computed \u2014 model ' + esc(DATA.model_version) }),
      el('p', { text: 'One function scores every row, from the snapshot\u2019s own figures. No protocol name is special-cased and no row is hand-picked.' }),
      el('div', { class: 'formula', text:
        'slope-median fit: ln(mcap) = a_cat + ' + M.slope_median_slope + ' \u00d7 ln(TVL), one slope for every category\n' +
        'a_cat = median of (ln(mcap) - ' + M.slope_median_slope + ' \u00d7 ln(TVL)) over the category\u2019s tokenised peers,\n' +
        'after trimming peers whose log(mcap/TVL) falls outside the central ' + Math.round((1 - 2 * M.slope_median_winsor_q) * 100) + '% (mcap > 0, TVL \u2265 $5M, n = 128 peers, ' + DATA.trimmed_peers + ' kept;\n' +
        'every category\u2019s intercept is shrunk toward the global intercept, w = n / (n + ' + M.slope_median_prior + '), however few peers it has; a category with no trimmed peer falls back to the global intercept)\n' +
        'predicted ratio = clamp(exp(a_cat + ' + M.slope_median_slope + ' \u00d7 ln(TVL)) / TVL, [' + M.peer_multiple_floor + ', ' + M.peer_multiple_cap + '])\n' +
        'growth multiplier = 1 + clamp(change_7d, ' + M.growth_floor + ', ' + M.growth_cap + ') / 100 \u00d7 ' + M.growth_weight + '\n' +
        'maturity multiplier = ' + M.maturity_floor + ' + min(age_days, ' + M.maturity_days + ') / ' + M.maturity_days + ' \u00d7 ' + M.maturity_range + '  (unknown age: ' + M.unknown_age_days + ' days)\n' +
        'implied value = round( TVL \u00d7 predicted ratio \u00d7 growth multiplier \u00d7 maturity multiplier )' }),
      el('div', { class: 'warn' }, el('b', { text: 'Honest limit: ' }),
        'implied value is a ranking signal, not a price. Validation of this method on the snapshot\u2019s tokenised peers: deterministic split-half median error 0.5147 log10, about 3.3\u00d7 (within 2\u00d7 27.3%, within 3\u00d7 47.7%); leave-one-out 0.5029 log10, about 3.2\u00d7; mean over 100 seeded split-half trials 0.520 log10 (3.3\u00d7) vs 0.565 (3.7\u00d7) for the old per-category log-log model \u2014 but the \u22643\u00d7 target is still not met. A high rank means \u201cworth a closer look\u201d, never \u201cthis token will be worth this much\u201d.'),
      el('h3', { text: 'Slope-median intercepts by category (from the snapshot itself)' }),
      el('table', { class: 'peer' },
        el('thead', null, el('tr', null,
          el('th', { scope: 'col', text: 'Category' }),
          el('th', { scope: 'col', class: 'num', text: 'Peers' }),
          el('th', { scope: 'col', class: 'num', text: 'Slope b' }),
          el('th', { scope: 'col', class: 'num', text: 'Intercept a' }),
          el('th', { scope: 'col', text: 'Fit' }))),
        pt),
      el('p', { text: 'Global intercept (categories with no trimmed peer fall back to it): ln(mcap) = ' + (g.a === undefined ? 'n/a' : g.a.toFixed(4)) + ' + ' + (g.b === undefined ? 'n/a' : g.b.toFixed(4)) + ' \u00d7 ln(TVL), n = ' + (g.n === undefined ? 'n/a' : g.n) + ' trimmed peers of ' + DATA.total_peers + ' tokenised peers.' }),
      el('p', { text: 'Why one slope + median intercepts, not a slope per category: the old model fitted a slope per category on 5\u201315 noisy peers, and its Dexs slope of about 1.78 sent Bittensor dTAO \u2014 56 days old, 7d \u22126.6% \u2014 to rank #1 at $226M with a raw ratio of 3.66 clamped to 1.00. A slope is not identifiable per category from this little data; a single cross-validated slope (0.55, grid 0.45\u20130.80, plateau 0.52\u20130.60) plus a robust median intercept per category removes that artefact \u2014 under this model no board row hits the clamp and dTAO ranks 21st at $16M.' }));
  }

  // Why some big names are not on this board (research section 4.4).
  // Sixteen early rows were removed because DefiLlama's live record
  // (checked 17 Nov 2026) gives each a parentProtocol: each is a
  // sub-product of a parent, not a standalone launch. The same reason
  // already removed gmx-solana (parent GMX) and apex-omni (parent ApeX).
  var PARENTS = [
    ['sentora-curator', 'Sentora'], ['polymarket-international', 'Polymarket'],
    ['cian-yield-layer', 'CIAN Protocol'], ['defi-saver-asset-management', 'Defi Saver'],
    ['mellow-core', 'Mellow Protocol'], ['theo-network-thusd', 'Theo'],
    ['figure-markets-prime', 'Figure Markets'], ['extended-perps', 'Extended'],
    ['avant-avusd', 'Avant Protocol'], ['ipor-fusion', 'IPOR'],
    ['circle-gateway', 'Circle'], ['loopscale-lending', 'Loopscale'],
    ['theo-network-thbill', 'Theo'], ['avant-aveth', 'Avant Protocol'],
    ['loopscale-curation', 'Loopscale'], ['aster-bridge', 'Astherus']
  ];
  function classificationPanel() {
    var ul = el('ul', { class: 'why' });
    PARENTS.forEach(function (pr) {
      ul.appendChild(el('li', null, el('b', { text: pr[0] }), ' \u2014 sub-product of ' + pr[1] + ', not a standalone launch.'));
    });
    return el('section', { class: 'card model' },
      el('h2', { text: 'Why some big names are not on this board' }),
      el('p', { text: 'The snapshot carries no parent field, so these were checked against DefiLlama\u2019s live record on 17 Nov 2026. A sub-product is not a launch candidate: ranking it would double-count value its parent\u2019s token already captures. The rule applies to early rows only \u2014 no watchlist slug is in this list.' }),
      ul,
      el('p', { text: 'Unit is out for a different reason: its parent is None, but its category is Bridge \u2014 it tokenises bitcoin as unitBTC, so the category rule (bridges are not launches) removes it, not a parent.' }),
      el('p', { text: 'USDD stays on the board because it is on the watchlist and its snapshot record is pre-token \u2014 but USDD is a stablecoin. Its implied value is the value of a hypothetical governance token, NOT the value of the stablecoin.' }),
      el('p', { text: 'Lightning Network and Bittensor dTAO also stay, for the same coverage reason: Lightning is Bitcoin\u2019s payments network and has no token by design, and dTAO is Bittensor\u2019s subnet system whose TAO token already trades. Both rows are flagged here rather than silently ranked \u2014 and under this model dTAO is no longer at the top: it ranks 21st at $16M, because a single slope plus a median intercept does not let one steep category fit put a 56-day-old protocol first.' }),
      el('p', { text: 'Flagged watchlist rows kept for coverage (manual review, TOP20.md): USDD, Bittensor dTAO, Plume Vaults, Hive Protocol and Lightning Network \u2014 each already has a live token or no token can ever exist, yet the sealed coverage gate requires all 40 watchlist slugs on the board.' }));
  }

  var panel = el('aside', { class: 'panel', id: 'detail', hidden: 'hidden', 'aria-label': 'Protocol detail' });

  function kv(k, v, cls) { return el('div', null, el('span', { text: k }), el('b', { class: cls || 'num', text: v })); }

  function openDetail(slug) {
    var r = null;
    DATA.rows.forEach(function (x) { if (x.slug === slug) r = x; });
    if (!r) return;
    state.sel = slug; writeHash();
    var c = recompute(r);
    // The slope-median coefficients are stored at full precision in data.js, so a
    // recompute from data.js lands exactly on the stored number (verified
    // 180/180 exact). A 0.1% tolerance is the honest check.
    var gap = Math.abs(c.value - r.implied_value_usd) / r.implied_value_usd;
    var ok = gap <= 0.001;
    panel.textContent = '';
    panel.appendChild(el('div', { class: 'p-head' },
      el('div', null,
        el('p', { class: 'kick', text: 'Rank ' + r.rank + ' of ' + DATA.board_size + ' \u00b7 pre-token' }),
        el('h2', { text: r.name }),
        el('p', { class: 'sub', text: (r.category || 'Other') + ' \u00b7 ' + ((r.chains && r.chains.length) ? r.chains.join(', ') : 'chain n/a') + (r.listed_at ? ' \u00b7 listed ' + r.listed_at : '') })),
      el('button', { class: 'x', type: 'button', 'aria-label': 'Close details', text: '\u2715', onclick: closeDetail })));
    panel.appendChild(el('section', { class: 'p-sec' },
      el('h3', { text: 'Implied value \u2014 the model\u2019s inputs' }),
      el('div', { class: 'kv' },
        kv('TVL', money(r.tvl_usd)),
        kv('Seven-day growth', pct(r.change_7d)),
        kv('Age with no token', age(r.age_days)),
        kv('Predicted mcap / TVL', mult(c.ratio) + ' (' + r.peer_category + ', ' + (r.slope_source || 'slope-median fit') + ')'),
        kv('Growth multiplier', 'x' + c.gm.toFixed(4)),
        kv('Maturity multiplier', 'x' + c.mm.toFixed(4)),
        kv('Implied value', money(r.implied_value_usd))),
      el('div', { class: 'check ' + (ok ? 'ok' : 'bad'), text: ok
        ? 'Recompute check: this page recomputes ' + money(c.value) + ' from the snapshot figures \u2014 within ' + (gap * 100).toFixed(3) + '% of the board\u2019s ' + money(r.implied_value_usd) + '.'
        : 'Recompute check: this page recomputes ' + money(c.value) + ', which differs from the board\u2019s ' + money(r.implied_value_usd) + ' by ' + (gap * 100).toFixed(2) + '% \u2014 the data would be stale.' }),
      el('p', { text: 'Implied value is a ranking signal, not a price.' })));
    panel.appendChild(el('section', { class: 'p-sec' },
      el('h3', { text: 'Farm plan \u2014 6 steps, netted (recomputed on this page)' }),
      el('ol', { class: 'steps' }, farmSteps(r).map(function (s) {
        var p2 = splitStep(s);
        return el('li', null, el('b', { text: p2.act }), el('span', { class: 'ct', text: p2.tail }));
      }))));
    panel.hidden = false;
  }
  function closeDetail() { state.sel = null; writeHash(); panel.hidden = true; panel.textContent = ''; render(); }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'wrap' });
    shell.appendChild(el('header', { class: 'mast' },
      el('div', null,
        el('p', { class: 'eyebrow', text: 'Token Radar \u00b7 ' + esc(DATA.model_version) }),
        el('h1', { text: 'Pre-token protocols, ranked by implied value' }),
        el('p', { text: 'The watchlist is the floor: every protocol with at least ' + money(DATA.floor_usd) + ' of TVL and no token on record. The early radar adds ' + DATA.early_size + ' pre-token protocols below that floor, by TVL.' })),
      el('div', { class: 'meta' },
        el('span', null, 'Snapshot ', el('b', { text: esc(DATA.as_of) })),
        el('span', null, 'Source ', el('b', { text: esc(DATA.source) })),
        el('span', null, 'Model ', el('b', { text: esc(DATA.model_version) })))));
    var st = el('div', { class: 'stats' });
    st.appendChild(el('div', { class: 'stat' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size }), el('small', { text: 'every watchlist slug scored' })));
    st.appendChild(el('div', { class: 'stat' }, el('span', { text: 'Pre-token rows' }), el('b', { text: String(DATA.board_size) }), el('small', { text: DATA.early_size + ' early rows below the floor' })));
    st.appendChild(el('div', { class: 'stat' }, el('span', { text: 'Live-token set aside' }), el('b', { text: String(DATA.live_size) }), el('small', { text: 'already trading, shown apart' })));
    st.appendChild(el('div', { class: 'stat' }, el('span', { text: 'Model slope' }), el('b', { text: DATA.slope_global ? ('x' + DATA.slope_global.b.toFixed(2)) : 'n/a' }), el('small', { text: 'one slope, cross-validated; median intercept per category' })));
    shell.appendChild(st);
    var cats = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, slug, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var select = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      cats.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); }));
    select.addEventListener('change', function () { state.category = select.value; writeHash(); render(); });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre' ? 'true' : 'false', text: 'Pre-token (' + DATA.board_size + ')', onclick: function () { state.tab = 'pre'; render(); } });
    var liv = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token (' + DATA.live_size + ')', onclick: function () { state.tab = 'live'; render(); } });
    shell.appendChild(el('div', { class: 'bar' },
      el('div', { class: 'field' }, el('label', { 'for': 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { 'for': 'category', text: 'Category' }), select),
      el('div', { class: 'field' }, el('label', { text: 'Token status' }), el('div', { class: 'seg' }, pre, liv)),
      el('span', { class: 'shown', text: state.tab === 'pre' ? filtered().length + ' of ' + DATA.board_size + ' rows shown' : DATA.live.length + ' live-token protocols' })));
    shell.appendChild(state.tab === 'pre' ? boardTable() : liveTable());
    if (state.tab === 'pre') { shell.appendChild(modelPanel()); shell.appendChild(classificationPanel()); }
    shell.appendChild(el('p', { class: 'foot', text: 'Static page, no network: every number on it comes from data.js, the sealed snapshot scored by model ' + esc(DATA.model_version) + '. Implied value is a ranking signal, not a price.' }));
    app.appendChild(shell);
    if (!panel.isConnected) app.appendChild(panel);
    app.setAttribute('aria-busy', 'false');
    if (state.sel) openDetail(state.sel);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !panel.hidden) closeDetail(); });
})();
