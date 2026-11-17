# Log-log per kategori vs median-peer datar — token-radar-01 (P4 riset)

> **Rekomendasi: ADOPSI.** Log-log per kategori (dengan shrinkage) mengalahkan
> median-peer datar dengan jelas pada protokol split-half yang sama persis
> seperti `entry/scripts/backtest.mjs`, dan menang di **20/20** trial acak
> tambahan. Angka lengkap di bawah; reproduksi: `node scripts/loglog-test.mjs`
> → `scripts/loglog.json`.
>
> **Tetap jujur:** board masih sinyal ranking, bukan valuasi — median error
> log-log 3,89× (target ≤3× tetap belum tercapai; kombinasi log-log ×
> growth × maturity mencapai 3,23×, masih di atas 3×).

## 1. Metode persis

- **Input:** snapshot sealed yang sama (`kit/.../input/snapshot.json`, 758
  protokol, `as_of` 2026-11-14). Tidak ada network, Node stdlib saja.
- **Peer:** protokol bertoken, `mcap_usd > 0` dan `tvl_usd >= $5 jt` —
  **n = 128**, sama seperti backtest.
- **Split-half (protokol utama, mengikuti `backtest.mjs` persis):** peer
  diurutkan by slug, dibelah di titik tengah (64/64), **dua arah**
  (train half0 → test half1, dan sebaliknya), lalu **pooled** sehingga
  tiap peer diuji tepat sekali (n = 128). Metrik yang dilaporkan adalah
  pooled ini, persis seperti `backtest.json` (`splitHalf.pooled`).
- **Koreksi penting — tidak ada "20 trial" di `backtest.mjs`:** script
  backtest tidak memakai seed dan tidak melakukan 20 trial; split-nya
  satu belahan deterministik dari urutan slug. Frasa "20 trial" di riset
  §4.3 tidak cocok dengan script. Perbandingan utama di bawah memakai
  protokol script persis (tanpa seed). Sebagai robustness check tambahan,
  §5 melaporkan **20 trial split-half acak ber-seed** (mulberry32, seed
  tetap `20261114`, belahan 64/64, dua arah pooled per trial) — terpisah
  dari angka utama, dan hasilnya searah.
- **Baseline (dihitung ulang di script ini, bukan disalin):** median
  mcap/TVL per kategori bila n ≥ 5 peer, else median global **0,2138**,
  clamp **[0,02, 1,0]**. Dua bentuk: `full` (multiple × growth ×
  maturity, model yang dikirim) dan `tvlOnly` (multiple saja, diagnostik).
  **Verifikasi baseline:** hitung-ulang script ini mereproduksi
  `backtest.json` pooled **persis** (full 0,6804; tvlOnly 0,6890), dan
  run ulang `backtest.mjs` (salinan di /tmp, output dialihkan, file asli
  tidak disentuh) menghasilkan `splitHalf` yang identik dengan
  `backtest.json`. Angka baseline di bawah terverifikasi, bukan kutipan.
- **Varian log-log:** OLS `ln(mcap) = a + b·ln(TVL)` per kategori pada
  train half (kategori n ≥ 5); kategori n < 5 memakai fit global.
  **Shrinkage** (untuk 5 ≤ n < 10):
  `w = n / (n + 5)`; `b* = w·b_cat + (1−w)·b_global`;
  `a* = w·a_cat + (1−w)·a_global`. Kategori n ≥ 10 memakai fit kategori
  tanpa shrinkage; kategori n < 5 memakai fit global. Rasio prediksi
  `r = exp(a* + b*·ln(TVL)) / TVL` di-clamp ke **[0,02, 1,0]** (sama
  seperti baseline), lalu `implied = TVL × r`. Varian ini TVL-only
  (tanpa growth/maturity), jadi pembanding adilnya adalah baseline
  `tvlOnly`; baseline `full` ditampilkan sebagai referensi.
- **Metrik (identik dengan `backtest.mjs` `metricsFor`):** median
  |error| log10 (+ faktor 10^err), median |pct error|, % within 2×/3×/5×.
- **Kriteria adopsi (dari tugas):** ADOPSI bila median error log10 turun
  **≥10% relatif DAN** within-2× naik.

## 2. Hasil utama — pooled (n = 128, protokol backtest.mjs persis)

| Model | Median err log10 | Faktor × | Median \|pct\| err | Within 2× | Within 3× | Within 5× |
|---|---:|---:|---:|---:|---:|---:|
| Baseline full (multiple × growth × maturity) | 0,6804 | 4,79× | 90,39% | 25,78% | 37,50% | 50,78% |
| Baseline tvlOnly (multiple saja) | 0,6890 | 4,89× | 91,71% | 25,78% | 32,81% | 51,56% |
| **Log-log shrunk, tvlOnly** | **0,5904** | **3,89×** | **88,03%** | **28,13%** | **46,88%** | **58,59%** |
| Log-log shrunk × growth × maturity (diagnostik) | 0,5088 | 3,23× | 88,27% | 32,03% | 46,09% | 58,59% |
| Log-log tanpa shrinkage, tvlOnly (diagnostik) | 0,5881 | 3,87× | 89,75% | 25,00% | 44,53% | 59,38% |

**Uji adopsi (vs pembanding adil, baseline tvlOnly):**

- Median error log10: 0,6890 → 0,5904 = **turun 14,31% relatif** (≥10% ✓).
- Within-2×: 25,78% → 28,13% = **naik 2,35 poin** (✓).
- Bonus: within-3× naik 14,07 poin (32,81% → 46,88%), within-5× naik
  7,03 poin (51,56% → 58,59%).
- Vs baseline **full** pun lolos: 0,6804 → 0,5904 = turun 13,23% relatif,
  within-2× tetap naik 2,35 poin.

## 3. Per arah (bukan kebetulan satu arah)

| Arah | Baseline tvlOnly | Log-log shrunk | Baseline full | Log-log × growth × maturity |
|---|---:|---:|---:|---:|
| train half0 → test half1 (n=64) | 0,6519 (4,49×) | 0,4851 (3,06×) | 0,6288 (4,25×) | 0,5088 (3,23×) |
| train half1 → test half0 (n=64) | 0,7619 (5,78×) | 0,6108 (4,08×) | 0,7630 (5,79×) | 0,5467 (3,52×) |

Log-log menang di **kedua arah**, pada median error maupun (kecuali
within-2× arah pertama: 25,00% vs 28,13% baseline — satu-satunya sel
yang kalah) hampir semua metrik. Pooled-lah yang menentukan, dan pooled
menang di semua kolom.

## 4. Fit yang dipakai (train half) — kenapa log-log menang

Slope global ln(mcap) vs ln(TVL): **0,635** (train half0) dan **0,404**
(train half1) — konsisten dengan slope global ~0,52 di seluruh 128 peer
(riset §4.3). Slope per kategori (yang n ≥ 5 di train half):

| Kategori | n train | Slope kategori | Slope dipakai (setelah shrinkage) |
|---|---:|---:|---:|
| Lending (half0) | 11 | 1,66 | 1,66 (n ≥ 10, tanpa shrinkage) |
| Dexs (half1) | 7 | 1,73 | 1,18 (w = 0,58) |
| CEX (half0) | 5 | 1,34 | 0,99 (w = 0,50) |
| Yield (half0) | 6 | 0,76 | 0,70 (w = 0,55) |
| RWA (half1) | 6 | 0,50 | 0,46 (w = 0,55) |
| Liquid Staking (half1) | 5 | 0,52 | 0,46 (w = 0,50) |
| Canonical Bridge (half1) | 6 | 0,47 | 0,44 (w = 0,55) |
| Basis Trading (half1) | 5 | 0,15 | 0,27 (w = 0,50) |

Median datar (= slope 1 implisit pada rasio) meremehkan DEX/Lending
besar (slope 1,7) dan melebih-lebihkan yang kecil — persis seperti
diprediksi riset §4.3. Shrinkage vs tanpa shrinkage hampir seri pada
median error pooled (0,5904 vs 0,5881), tapi versi shrunk lebih baik
pada within-2× (28,13% vs 25,00%) dan within-3× (46,88% vs 44,53%);
shrinkage dipertahankan karena juga melindungi kategori n kecil saat
fit di seluruh data (bukan setengah).

## 5. Robustness — 20 trial split-half acak ber-seed (suplementer)

20 trial, belahan 64/64 acak (mulberry32, seed `20261114`), dua arah
pooled per trial; yang dibandingkan: baseline tvlOnly vs log-log shrunk.

| | Baseline tvlOnly | Log-log shrunk |
|---|---:|---:|
| Rata-rata median err log10 per trial | 0,7083 | **0,5708** |
| Median dari median err log10 | 0,7142 | **0,5773** |
| Rata-rata within-2× | 23,71% | **29,34%** |
| Trial yang dimenangi log-log (median err) | — | **20/20** |

Selisih median err per trial (log-log − baseline) selalu negatif:
−0,0588 sampai −0,2082, rata-rata **−0,1376**. Kemenangan pada split
deterministik bukan artefak satu belahan slug.

## 6. Rekomendasi — ADOPSI

1. **Ganti leg TVL model dari median datar menjadi log-log per kategori
   dengan shrinkage** (`w = n/(n+5)` untuk 5 ≤ n < 10, fit kategori
   murni untuk n ≥ 10, fit global untuk n < 5), clamp rasio tetap
   [0,02, 1,0]. Bukti: median error pooled turun 14,31% relatif
   (0,6890 → 0,5904 log10; 4,89× → 3,89×) dan within-2× naik
   (25,78% → 28,13%), lolos kriteria adopsi; menang di kedua arah dan
   20/20 trial acak.
2. **Pertahankan growth × maturity di atas rasio log-log** (jangan
   ship log-log TVL-only): kombinasi log-log × growth × maturity
   mencapai **0,5088 log10 (3,23×)**, within-2× **32,03%** — lebih baik
   dari baseline full (0,6804; 4,79×) di semua kolom. Menariknya,
   growth/maturity hampir tidak membantu median datar (0,6890 → 0,6804)
   tapi membantu besar log-log (0,5904 → 0,5088); itu temuan sekunder
   dari diagnostik ini, dihitung pada protokol yang sama.
3. **Jangan klaim target ≤3× tercapai:** 3,89× (TVL-only) dan 3,23×
   (dengan growth/maturity) masih di atas 3×. Tulis angka sebenarnya
   (3,89× / 3,23×) di dossier/dashboard, dan tetap framing board
   sebagai sinyal ranking.
4. **Catatan implementasi:** fit log-log harus dihitung ulang di
   `main.ts`/`lib/model.ts` dari snapshot (deterministik, tanpa network)
   — jangan hardcode slope/intercept di atas, karena itu slope dari
   train-half; slope final di-fit pada seluruh 128 peer. Kategori
   n < 5 tetap fallback global; kategori yang tidak muncul di train
   (tidak ada di fit) juga fallback global.

## 7. Reproduksi

```bash
node entry/scripts/loglog-test.mjs   # -> entry/scripts/loglog.json
```

Node stdlib saja, offline, deterministik (dua run menghasilkan
`loglog.json` identik kecuali `generatedAt`). File ini dan
`scripts/loglog-test.mjs` + `scripts/loglog.json` adalah satu-satunya
file baru/berubah dari tugas ini; `lib/model.ts`, `main.ts`,
`dashboard/`, `backtest.mjs`, dan `backtest.json` tidak disentuh.
