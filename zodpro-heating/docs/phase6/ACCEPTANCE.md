# 6-bosqich — LOOP LENGTH PLANNER: yakuniy acceptance (immutable baseline)

**Holat: YOPILGAN.** Ushbu hujjat va `docs/phase6/evidence/` — 6-bosqichning o'zgarmas
bazaviy natijasi. 6-bosqich algoritmi (`src/engines/ufh/loopplanner.js`, `loopproof.js`,
`partitionsearch.js` va ular tayangan generatorlar) shu baseline'dan keyin o'zgartirilmaydi;
keyingi bosqichlar uni faqat ishlatadi. Kerakli o'zgarish bo'lsa — alohida, qayta isbotlanadigan
yangi bosqich sifatida.

- Algoritm kodi: commit `06130b3` (branch `claude/vigilant-feynman-b6n5r4`)
- Baseline hujjati: shu faylni qo'shgan commit (git tarixida)
- Sana: 2026-10-05

## Status ta'riflari

| Status | Ma'nosi |
|---|---|
| `PROVEN_FEASIBLE` | qayta qurilgan (rebuilt) geometriya barcha muhandislik shartlari bilan valid. **Minimum isboti emas.** |
| `GRID_EXHAUSTIVE` | faqat e'lon qilingan modelda barcha variantlar tekshirilgan: 0.05 m kesish to'ri, regionning to'rtburchak bo'linishlari (≤ 4 — guillotine, ≤ 6 — leaf / slice / pinwheel), har bir halqa chiqishi region devorida. Uzluksiz (global) isbot emas. |
| `SEARCH_NOT_EXHAUSTIVE` | model barcha bo'linishlarni qamramagan yoki vaqt limiti tugagan |
| `PROVEN_INFEASIBLE` | faqat uzluksiz pastki chegaradan kichik k uchun (har qanday geometriya) |

"Search did not find a solution" va "solution is proven impossible" hech qachon bir xil status emas.

## Natijalar

| Case | k | Search model | Grid | Status | Feasible | Coverage | Largest gap | Min R | Max loop total, m | Min 60 m margin | Proof scope |
|---|---|---|---|---|---|---|---|---|---|---|---|
| LP7 | 3 | guillotine (≤ 4 → hammasi) | 0.05 | GRID_EXHAUSTIVE | yo'q | — | — | — | — | — | e'lon qilingan model |
| LP7 | 4 | planner + rebuild | — | PROVEN_FEASIBLE | ha | 96.40 % | 0.000 m² | 85.0 mm | 59.927251200 | 0.073 (LOW_MARGIN) | minimum within declared search model |
| 101 | 4 | guillotine (≤ 4 → hammasi) | 0.05 | GRID_EXHAUSTIVE | yo'q | — | — | — | — | — | e'lon qilingan model |
| 101 | 5 | planner + rebuild | — | PROVEN_FEASIBLE | ha | 93.47 % | 0.197 m² | 85.0 mm | 59.965529359 | 0.034 (LOW_MARGIN) | minimum within declared search model |
| LP11 | 2 | guillotine (≤ 4 → hammasi) | 0.05 | GRID_EXHAUSTIVE | yo'q | — | — | — | — | — | e'lon qilingan model |
| LP11 | 3 | planner + rebuild | — | PROVEN_FEASIBLE | ha | 98.34 % | 0.000 m² | 99.9 mm | 59.964833962 | 0.035 (LOW_MARGIN) | minimum within declared search model |
| LP8 | 5 | leaf / slice / pinwheel | 0.05 | GRID_EXHAUSTIVE | yo'q | — | — | — | — | — | e'lon qilingan model |
| LP8 | 6 | leaf / slice / pinwheel | 0.05 | GRID_EXHAUSTIVE | yo'q | — | — | — | — | — | e'lon qilingan model; 1350 / 1350 ildiz split + root leaf + pinwheel |
| LP8 | 7 | planner + rebuild | — | PROVEN_FEASIBLE | ha | 89.90 % | 0.500 m² (chegara ichida) | 95.0 mm | 59.884833962 | 0.115 (LOW_MARGIN) | **candidate_minimum = 7** |

- LP8: faqat `candidate_minimum = 7` (k = 7 ning PROVEN_FEASIBLE natijasi asosida; k = 5, 6
  e'lon qilingan modelda GRID_EXHAUSTIVE). Bu uzluksiz geometriya bo'yicha isbot emas.
- 101–109: kerak 9 halqa (101 = 5, 107 = 3, 108 = 1), C-01 fizik chiqishlari 6, virtual 0 →
  `RAW_GEOMETRY_VALID` / `HYDRAULIC_LOOP_INVALID` (`outlet_shortage`). 107 va 108 ham rebuilt
  geometriyada PROVEN_FEASIBLE (`evidence/rebuilt-101-109.log`).
- Min R: qabul sharti `actual_min_radius ≥ RMIN` (`RMIN_CHECK` = 68 mm); jadvaldagi mm — o'lchangan
  qiymat, qabul mezoni emas.
- Eslatma: `proof-LP7/101/LP11` loglari status nomlari ajratilishidan oldin yozilgan va u yerda
  `PROVEN_INFEASIBLE` yorlig'i bor. Natija (qidiruv ≤ k guillotine bo'linishlarni to'liq tekshirgan,
  yechim yo'q) joriy ta'rif bo'yicha `GRID_EXHAUSTIVE`; joriy kod shu holatni `GRID_EXHAUSTIVE` deb
  chiqaradi (`tests/ufh-loopproof.test.js`).

## Acceptance checklist

| # | Shart | Holat | Dalil |
|---|---|---|---|
| 1 | LP7: k=3 GRID_EXHAUSTIVE, k=4 PROVEN_FEASIBLE | ✅ | `proof-LP7-k3-grid0.05.log`, `rebuilt-LP7-k4.log` |
| 2 | 101: k=4 GRID_EXHAUSTIVE, k=5 PROVEN_FEASIBLE | ✅ | `proof-101-k4-grid0.05.log`, `rebuilt-101-109.log` |
| 3 | LP11: k=2 GRID_EXHAUSTIVE, k=3 PROVEN_FEASIBLE | ✅ | `proof-LP11-k2-grid0.05.log`, `rebuilt-LP11-k3.log` |
| 4 | LP8: k=5, k=6 GRID_EXHAUSTIVE, k=7 PROVEN_FEASIBLE, faqat candidate_minimum = 7 | ✅ | `proof-LP8-k5-grid0.05.log`, `proof-LP8-k6-*`, `rebuilt-LP8-k7.log` |
| 5 | 60 m: rebuilt geometriyadan heating + supply + return; total ≤ 60.000000000 m; 60.000000001 m INVALID; tolerance 1e-12 m | ✅ | `LOOP_LENGTH_EPS = 1e-12`; `tests/ufh-loops.test.js`; rebuilt loglar (planner bilan farq ≤ 7e-14 m) |
| 6 | Coverage: `ENGINEERING_COVERAGE_TOLERANCE = 0`; `GEOMETRY_NUMERICAL_TOLERANCE` 1e-4 m² faqat numerical consistency | ✅ | `criteria.js`; `tests/ufh-loopproof.test.js` |
| 7 | Virtual outlet yo'q; fizik chiqish cheklovi saqlangan | ✅ | 101–109: 9 > 6 → outlet_shortage |
| 8 | Har bir loop mustaqil ikki yo'lli spiral, zmeyka yo'q, intersection = 0 | ✅ | rebuilt loglar: `cross 0`, `LOOP_VALID` |
| 9 | Regression 169 / 169 PASS | ✅ | `regression-169.log` |
| 10 | LP8 k=6: 1350 / 1350 root split, leaf / slice / pinwheel to'liq, GRID_EXHAUSTIVE | ✅ | `proof-LP8-k6-root-progress.jsonl` (1350 split + leaf + pinwheel yozuvlari), `proof-LP8-k6-grid0.05-round3-shard3.log` |

## Qidiruv modeli va xavfsizligi (qisqacha)

- Bo'linish modeli: LEAF / SLICE / PINWHEEL daraxtlari. ≤ 6 to'rtburchakli har qanday bo'linish
  shu daraxt (6 × 6 panjaradagi barcha 82 538 bo'linishda tekshirilgan;
  `tests/ufh-partitionsearch.test.js`).
- Pruning qoidalari P1–P7 (`partitionsearch.js` boshida matematik asos bilan) har biri alohida va
  birgalikda brute force bilan solishtirilgan; noto'g'ri (10 % past) bound testda ushlanadi.
- P7 (lead access): pinwheel markazi devorga tegmaydi → uning halqasi kollektorga boshqa
  halqalarni kesmasdan / < S oraliqdan o'tmasdan yetolmaydi → yaroqsiz; hamma qismi devorga
  tegadigan har bir ≤ 6 bo'linish guillotine (test bilan tekshirilgan).

## Qayta ishlab chiqarish

```
node --max-old-space-size=8000 tools/ufh-proof-run.mjs LP8 7 0.05 - 5 default <cacheDir>
for i in 0 1 2 3; do node --max-old-space-size=3200 tools/ufh-proof-run.mjs LP8 7 0.05 6900 6 default <cacheDir> $i/4 & done
```

Ildiz progressi `<cacheDir>/root-….jsonl` da yig'iladi; k = 6 barcha ildiz split'lari, root leaf va
pinwheel yozilganda `GRID_EXHAUSTIVE` deb chiqadi (bir necha raund / shard bo'ylab).
