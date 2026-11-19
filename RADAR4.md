# Slope-median, not per-category slopes — token-radar-01 (radar-4)

> **Rekomendasi: ADOPSI.** Satu slope (0,55) + intercept median per kategori
> (dengan shrinkage untuk SEMUA kategori) mengalahkan log-log per kategori
> (radar-3) pada leave-one-out dan pada 200 seeded split-half trial — dan
> menghapus artefak clamp di baris #1. Angka lengkap di bawah; reproduksi:
> `node scripts/backtest.mjs` → `scripts/backtest.json`.
>
> **Tetap jujur:** board masih sinyal ranking, bukan valuasi — median error
> LOO 3,18×, split-half deterministik 3,27×, rata-rata trial 3,31–3,32×
> (target ≤3× tetap belum tercapai).

## 1. Metode persis

- **Input:** snapshot sealed yang sama (`kit/.../input/snapshot.json`, 758
  protokol, `as_of` 2026-11-14). Tidak ada network, Node stdlib saja.
- **Peer:** protokol bertoken, `mcap_usd > 0` dan `tvl_usd >= $5 jt` —
  **n = 128**, sama seperti semua backtest sebelumnya.
- **radar-4:** `ln(mcap) = a_cat + 0,55 × ln(TVL)`.
  - Trimming: peer yang log(mcap/TVL)-nya di luar 60% tengah (q = 0,20 di
    kedua ekor) dikeluarkan dari fitting — 78 dari 128 peer dipertahankan.
    Yang dibuang adalah outlier rasio ekstrem (sampai 400×) yang akan
    menyeret fit berbasis mean.
  - Slope 0,55 adalah SATU angka untuk semua kategori, dipilih dari grid
    cross-validation 0,45–0,80 pada 100 seeded split-half trial; plateau
    0,52–0,60 datar dalam noise dan 0,55 adalah titik tengahnya. Slope
    dari OLS global pada peer yang di-trim (0,80) TIDAK dipakai — ia
    kalah di validasi (lihat §4).
  - `a_cat` = median dari `(ln(mcap) − 0,55 × ln(TVL))` atas peer ter-trim
    kategori itu, di-shrink ke intercept median global dengan
    `w = n / (n + 10)` — untuk SEMUA kategori, berapa pun kecil n-nya.
    Kategori tanpa peer ter-trim sama sekali memakai intercept global.
  - Rasio prediksi `r = exp(a_cat + 0,55·ln(TVL)) / TVL` di-clamp ke
    **[0,02, 1,0]**, lalu `implied = TVL × r × growth × maturity`
    (growth/maturity sama persis seperti radar-3).
- **Baseline (radar-3):** OLS log-log per kategori dengan shrinkage,
  seperti `LOGLOG.md` — dihitung ulang di script ini, bukan disalin.

## 2. Hasil utama

| Protokol | radar-4 | radar-3 |
|---|---:|---:|
| Split-half deterministik pooled (n = 128) | **0,5147 log10 (3,27×)**, within-2× 27,3%, within-3× 47,7% | 0,5088 (3,23×), within-2× 32,0%, within-3× 46,1% |
| Leave-one-out (train 127, uji 1) | **0,5029 (3,18×)**, within-2× 28,1%, within-3× 48,4% | 0,6139 (4,11×), within-2× 28,9%, within-3× 44,5% |
| 100 trial split-half acak (seed tuning) | **mean 0,5197 (3,31×)**, paired diff −0,0449 ± 0,0034, menang 91/100 | mean 0,5646 (3,67×) |
| 100 trial FRESH (seed lain, tak dipakai tuning) | **mean 0,5217 (3,32×)**, paired diff −0,0376 ± 0,0033, menang 88/100 | mean 0,5592 (3,62×) |

**Cara membaca:** pada SATU split deterministik keduanya seri dalam noise
(selisih 0,006 log10; SE median satu split ≈ 0,03–0,04). Bukti radar-4
adalah rata-rata atas banyak split: LOO lebih baik 0,111 log10, dan
200 trial ber-seed menang 179/200 dengan selisih berpasangan yang
interval 95%-nya tidak menyentuh nol di kedua set trial. Perbaikan ini
nyata tapi SEDANG (~7% relatif) — bukan lompatan ke bawah 3×.

## 3. Kenapa slope per kategori kalah — slope bukan teridentifikasi

Dengan 5–15 peer per kategori dan residu log yang SD-nya ≈ 1,2, SE slope
per kategori ≈ 0,2–0,36. Slope Dexs radar-3 (1,78) dan Lending (1,66)
adalah noise yang tampak seperti sinyal. Bukti paling telanjang adalah
board-nya sendiri (§5), bukan hanya metriknya.

## 4. Bug yang ditemukan saat menulis ulang backtest (systematic debugging)

Saat `backtest.mjs` ditulis ulang untuk radar-4, angka trial-nya TIDAK
cocok dengan eksperimen `/tmp` (−0,0247 vs −0,0376 pada trial fresh),
padahal baseline radar-3 cocok persis (0,5592). Penyelidikan per
komponen (bandingkan prediksi per peer pada split yang sama, lalu
intercept per kategori) menemukan akar penyebabnya: dua implementasi
memperlakukan kategori kecil secara berbeda.

- Eksperimen `/tmp`: intercept kategori di-shrink untuk SEMUA n,
  `w = n/(n+10)` — kategori 1-peer tetap menyumbang mediannya dengan
  bobot 1/11.
- `backtest.mjs`/model.ts awal: kategori dengan n < 5 di-trim langsung
  dibuang ke intercept global (w = 0).

Kategori kecil ternyata membawa sinyal nyata (mis. Canonical Bridge:
intercept 7,115 vs global 6,638 — multiple bridge memang tinggi).
Setelah aturan diseragamkan ke shrink-untuk-semua, `backtest.mjs`
mereproduksi angka eksperimen persis (tuning −0,0449/91, fresh
−0,0376/88, LOO 0,5029, det 0,5147). Varian yang diuji sesudah perbaikan:
shrink-all prior 5 (tuning −0,0488, fresh −0,0416, det 0,5223, LOO
0,5050) dan prior 20 (det 0,5004 — satu-satunya varian yang mengalahkan
det radar-3 — tapi tuning/fresh lebih lemah dari prior 10). Prior 10
dipilih sebagai titik tengah yang seimbang di keempat protokol, bukan
yang terbaik di satu protokol saja.

Varian lain yang dicoba dan KALAH dari radar-4 pada LOO + kedua set
trial: slope dari OLS global pada peer ter-trim (0,80; fresh +0,0226 —
lebih buruk dari radar-3), slope fitted-all 0,522 (fresh −0,0251),
LAD log-log, Huber log-log, kNN (k = 5/10/20), blend log-log +
median-multiple, feature OLS (growth/umur/rantai sebagai regresor),
offset bucket umur/growth (median residual per bucket), winsorized OLS
global, dan log-log tanpa shrinkage. Tidak ada yang mendekati.

## 5. Board: artefak #1 hilang

| | radar-3 (submitted) | radar-4 |
|---|---|---|
| #1 | Bittensor dTAO $225,7M — raw ratio 3,66, **mentok clamp 1,00**; 3,2× baris #2 | Steakhouse Financial $80,4M |
| #2 | Steakhouse $71,2M | Gauntlet $61,5M |
| #3 | Gauntlet $55,3M | Veda $59,4M |
| #4 | Veda $53,4M | USDD $46,9M |
| #5 | USDD $44,3M | Upshift $35,6M |
| dTAO | rank 1 | **rank 21, $16,1M, raw ratio 0,071, tidak kena clamp** |
| Baris kena clamp | 1 (persis baris #1) | **0** |
| Overlap top-20 / top-100 vs radar-3 | — | 15/20, 96/100 |

dTAO berumur 56 hari dengan 7d −6,56% — di bawah radar-3 ia #1 dengan
rasio yang harus dipotong paksa di clamp; di bawah radar-4 ia #21. Board
tetap 180 baris, 40/40 watchlist, dan farm verdicts tetap membedakan:
**FARM 51 (28,3%), THIN 77 (42,8%), SKIP 52 (28,9%)** (radar-3: 56/64/60).

## 6. Batas yang mengikat — kenapa tidak bisa jauh di bawah 3×

In-sample headroom (fit pada semua 128 peer, uji pada peer yang sama):
median error terbaik keluarga model ini ≈ 0,46 log10 (2,9×). Out-of-sample
0,50 sudah dekat dengan batas itu. Dispersi mcap/TVL di dalam kategori
sendiri mencapai ~100×, dan snapshot sealed hanya punya 10 field (TVL,
growth 7d, umur, kategori, chains) — tidak ada fees, volume, revenue,
atau user. Tanpa field baru, tidak ada estimator dari keluarga ini yang
akan menembus 3× secara meyakinkan; klaim sebaliknya adalah overfitting
pada satu split.

## 7. Reproduksi

```bash
node entry/scripts/backtest.mjs   # -> entry/scripts/backtest.json
```

Node stdlib saja, offline, deterministik (seed tetap untuk kedua set
trial). File baru/berubah dari tugas ini: `lib/model.ts`,
`dashboard/app.js`, `main.ts` (komentar), `scripts/backtest.mjs`,
`scripts/backtest.json`, `BACKTEST.md` (§E), `README.md`, `TOP20.md`,
`RADAR4.md` ini, dan `screenshots/` (di-render ulang dari dashboard
baru dengan Playwright + Chromium 1187 — screenshot lama menampilkan
dTAO #1 dan TIDAK BOLEH dipakai lagi).

## 8. Grid growth_weight — DITOLAK (19 Nov ~01:10 WIB)

Grid {0,25; 0,5; 0,75; 1,0; 1,25} pada 100 trial tuning + 100 trial
fresh yang sama (paired, vs gw=0,5):

| gw | tuning mean | diff vs 0,5 (95% CI) | fresh diff (95% CI) | LOO | det split-half |
|----|-------------|----------------------|---------------------|-----|----------------|
| 0,25 | 0,5245 | +0,0048 [+0,0032, +0,0064] | +0,0049 | 0,5083 | 0,5120 |
| 0,5 | 0,5197 | — | — | 0,5029 | 0,5147 |
| 0,75 | 0,5158 | −0,0039 [−0,0055, −0,0024] | −0,0030 | 0,4874 | 0,5123 |
| 1,0 | 0,5150 | −0,0047 [−0,0072, −0,0023] | −0,0049 | **0,4744 (2,98×)** | 0,5224 |
| 1,25 | 0,5212 | +0,0015 [−0,0017, +0,0047] | +0,0003 | 0,4967 | 0,5489 |

Kurva berbentuk U dengan minimum di 0,75–1,0, tapi gain trial
terbaik hanya −0,005 — jauh di bawah ambang adopsi −0,01. LOO
mendukung 1,0 (0,4744 = 2,98×, satu-satunya protokol yang menyentuh
<3×), tapi det split-half justru memburuk di 1,0 (0,5224 vs 0,5147):
sinyalnya tidak konsisten antar protokol. **Keputusan: growth_weight
tetap 0,5.** Grid ini menutup satu-satunya tuning yang tersisa dari
brief; jalur ke ≤3× yang konsisten belum ditemukan — lihat §6.
