# 7-bosqich — acceptance (sub-phase bo'yicha)

Spetsifikatsiya: `docs/phase7/SPEC.md`. Ketma-ketlik: 7.0 → 7A → 7B → 7C → 7D → 7E; har bir
sub-phase alohida qabul qilinadi. Phase 6 baseline: `06130b3` (muzlatilgan).

| Sub-phase | Holat |
|---|---|
| 7.0 Baseline guard + interfeys | ✅ ACCEPTED (foydalanuvchi, 2026-10-05; commit `cf1104e`) |
| 7A Kollektor modeli | ✅ ACCEPTED (foydalanuvchi, 2026-10-05) |
| 7B Transfer lead'lar + real ulanish | ❌ QABUL QILINMAGAN — Phase 6 reference mismatch, real-lead 60 m, coverage, kesishmalar (pastda) |
| 7C Lead geometriyasi | boshlanmagan |
| 7D Haqiqiy uzunlik + qayta rejalash | boshlanmagan |
| 7E Integratsiyalangan validatsiya | boshlanmagan |

## 7.0 — Baseline guard va interfeys shartnomasi

| # | Shart | Holat | Dalil |
|---|---|---|---|
| 1 | Phase 6 fayllari hash 10/10 (SHA-256, `06130b3`) | ✅ | `tests/ufh-phase6-freeze.test.js`; mutatsiya tekshiruvi: `criteria.js` ga 1 bayt qo'shilganda test qizil |
| 2 | Phase 6 regression 169/169, o'zgarishsiz | ✅ | to'liq to'plam 175/175 = 169 + 6 yangi (453 s) |
| 3 | Interfeys shartnomasi hujjatlangan va testlangan | ✅ | `src/engines/ufh/collectorcontract.js` (`checkCollectorInput`, `checkZoneReport`), `tests/ufh-collector-contract.test.js` (4 test) |
| 4 | Koridor qarori shartnomada: `U − corridor = U′` (1e-4 m²), `coverage = heated / U′` (1e-12), Σ koridor = `corridor_m2`, coverage qabuli tolerance 0 | ✅ | contract testi: har bir qoida o'z buzilishini ushlaydi |
| 5 | Statuslar: 12 blocking + `LOW_MARGIN` warning, `ROUTED_VALID` | ✅ | `src/engines/ufh/leadcriteria.js` |
| 6 | Drop uchun yashirin default yo'q (`dropPerPipe_m` majburiy) | ✅ | contract testi |

## 7A — Kollektor modeli (`src/engines/ufh/collector.js`)

| # | Shart (SPEC §9 7A) | Holat | Dalil |
|---|---|---|---|
| 1 | Har bir port juftligi: supply ↔ return = `portPitch_m` (±1e-9) | ✅ | `tests/ufh-collector.test.js` #1 (1/2/6/12 chiqish × 3 yo'nalish), #2 |
| 2 | `ports.length === outlets` har doim; port soni hech bir funksiya tomonidan oshirilmaydi | ✅ | #1, #3 (9 kontur → kollektor obyekti o'zgarmagan, 6 port), #6 |
| 3 | `requiredLoops > outlets` → `OUTLET_SHORTAGE`, zona `HYDRAULIC_LOOP_INVALID`; 101–109 (C-01): 9 > 6, status o'zgarmagan | ✅ | #6: `run101` → 9 / 6, `HYDRAULIC_LOOP_INVALID (outlet_shortage)`; `capacity` → missing 3; tayinlash 0 (qisman yoki virtual tayinlash yo'q) |
| 4 | Drop: `total` ga aniq `2 · dropPerPipe_m` (drop 0 va 0.4 farqi = 0.8 ± 1e-12) | ✅ | #5 |
| 5 | 60 m: drop bilan 60.000000000 VALID, 60.000000001 INVALID (muzlatilgan `validateLoopLength` / `lengthOk`, 1e-12) | ✅ | #5 |
| 6 | Port tayinlash 1:1: supply → supply porti, return → return porti, port bir marta | ✅ | #4 |
| 7 | Noto'g'ri portlar (soni, pitch, ustma-ust, indeks, drop yo'q) → `MANIFOLD_PORTS_INVALID` | ✅ | #2 |
| 8 | Phase 6 fayllari o'zgarmagan (freeze 10/10), regression | ✅ | 181/181 (`evidence/7A-regression-181.log`, 489 s) |

7A natijasi 101–109 uchun (`evidence/7A-101-109-drop.log`; drop 2 × 0.40 m — test taxmini, lead'lar hali
Phase 6 taxmini):

| Kontur | Phase 6 total, m | + 2 × 0.40 m drop | Holat |
|---|---|---|---|
| 101 L1 | 52.056 | 52.856 | LOOP_VALID |
| 101 L2 | 59.537 | 60.337 | LOOP_INVALID |
| 101 L3 | 59.966 | 60.766 | LOOP_INVALID |
| 101 L4 | 57.361 | 58.161 | LOOP_VALID |
| 101 L5 | 55.261 | 56.061 | LOOP_VALID |
| 107 L1 | 37.743 | 38.543 | LOOP_VALID |
| 107 L2 | 59.646 | 60.446 | LOOP_INVALID |
| 107 L3 | 51.009 | 51.809 | LOOP_VALID |
| 108 L1 | 58.737 | 59.537 | LOOP_VALID |

Muhim: `tests/fixtures/collectors.json` dagi C-01 qiymatlari (facing +y, port pitch 0.05 m, drop
0.40 m) faqat 7A test fixture'i — REAL PROJECT CONSTANT emas; real qiymatlar loyiha kirishidan keladi.

Bu 7D ning vazifasi (haqiqiy lead + drop bilan qayta rejalash); 7A faqat hisobni aniq qiladi va
konturlarni o'zgartirmaydi. Kollektor sig'imi: 9 kerak, 6 bor, yetishmaydi 3 — tavsiya: ≥ 9
chiqishli fizik kollektor yoki zonani bir necha kollektorga bo'lish (modelga hech narsa qo'shilmaydi).

## 7B — Transfer lead'lar, real ulanish, topologiya (holat: QABUL QILINMAGAN)

Arxitektura (foydalanuvchi qarori, 2026-10-05): **Phase 6 output = IMMUTABLE INPUT.** Phase 6 planner
`U'` da (transit koridori ayirilgan, SPEC §5) bir marta chaqiriladi; uning heating geometriyasi, kontur
soni / ID lari, bo'linishi va terminal closure'i 7B da o'zgarmaydi. 7B faqat: lead'larni muzlatilgan
spiral uchlariga yotqizadi, topologiyani tekshiradi, o'lchaydi va xatolarni nomlab hisobot qiladi.
Oldingi WIP dagi replanning (corner variantlar, xonani qayta spirallash, extra loop, routed `leadTo`,
fixture o'zgartirish) olib tashlangan (commit `7432a50`).

| Savol | Javob |
|---|---|
| Phase 6 input geometry hash (asosiy kvartira, 50 mm) | `3e5932c0bcc59ffc…` |
| Phase 6 geometry 7B tomonidan o'zgartirildimi | YO'Q (hash oldin = keyin = mustaqil Phase 6 chaqiruvi; test 7B-L) |
| Kontur soni 7B da o'zgardimi | YO'Q (H 3, LR 3, BR1 3, BA 2, BR2 1 = 12) |
| Extra loop yaratildimi | YO'Q |
| Corner replanning bajarildimi | YO'Q |

Natija — asosiy fixture `apartment-7b.json` (2cfaf70 dagi bilan bir xil), leadSpacing 50 mm
(`evidence/7B-apartment-0.05-metrics.json`, `pictures/7B-apartment-leadSpacing50*.png`):

| Xona | Kontur | Heating | Supply | Return | Drop | Total | Coverage (7B dan oldin) | Gap m² | Residual | Min R | Lead chuqurligi | Topologiya | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| H | H.L1 | 6.58 | 15.79 | 15.55 | 0.80 | 38.72 | 97.2 % (93.4) | 0 | 150 mm | 75 mm | 50 mm | VALID | LEAD_HEATING_CLASH, PHASE6_REFERENCE_MISMATCH |
| H | H.L2 | 27.01 | 10.95 | 11.09 | 0.80 | 49.85 | 97.5 % (97.4) | 0 | 180 mm | 100 mm | 50 mm | VALID | LEAD_HEATING_CLASH, PHASE6_REFERENCE_MISMATCH |
| H | H.L3 | 10.15 | 6.52 | 6.50 | 0.80 | 23.97 | 92.5 % (91.6) | 0 | 170 mm | 85 mm | 208 mm | VALID | LEAD_HEATING_CLASH, PHASE6_REFERENCE_MISMATCH |
| LR | LR.L1 | 43.33 | 2.92 | 3.27 | 0.80 | 50.33 | 98.2 % (98.1) | 0 | 160 mm | 80 mm | 150 mm | VALID | LEAD_HEATING_CLASH, PHASE6_REFERENCE_MISMATCH |
| LR | LR.L2 | 14.79 | 11.38 | 10.93 | 0.80 | 37.89 | 94.1 % (94.1) | 0 | 180 mm | 90 mm | 50 mm | VALID | PHASE6_REFERENCE_MISMATCH |
| LR | LR.L3 | 34.27 | 6.82 | 6.77 | 0.80 | 48.65 | 97.7 % (97.3) | 0 | 190 mm | 95 mm | 108 mm | VALID | LEAD_HEATING_CLASH, PHASE6_REFERENCE_MISMATCH |
| BR1 | BR1.L1 | 28.67 | 2.79 | 2.54 | 0.80 | 34.79 | 96.6 % (96.2) | 0 | — | 100 mm | 100 mm | VALID | LEAD_HEATING_CLASH |
| BR1 | BR1.L2 | 28.68 | 6.90 | 6.36 | 0.80 | 42.74 | 96.1 % (96.1) | 0 | — | 100 mm | 50 mm | VALID | LOOP_VALID |
| BR1 | BR1.L3 | 10.46 | 9.16 | 9.21 | 0.80 | 29.64 | 88.4 % (88.3) | 0 | — | 100 mm | 50 mm | VALID | LOOP_VALID |
| BA (150) | BA.L1 | 4.76 | 8.91 | 9.26 | 0.80 | 23.74 | 84.0 % (84.1) | 0 | — | 75 mm | 50 mm | VALID | PHASE6_COVERAGE_INSUFFICIENT |
| BA (150) | BA.L2 | 17.49 | 7.51 | 7.17 | 0.80 | 32.97 | 88.2 % (88.2) | 0 | — | 75 mm | 150 mm | VALID | LOOP_VALID |
| BR2 | BR2.L1 | 57.59 | 7.86 | 7.80 | 0.80 | 74.05 | 96.0 % (96.0) | 0.215 | — | 100 mm | 50 mm | VALID | REAL_LEAD_LENGTH_INVALID |

Xonalar (U, C, U′, H, coverage(U′); 7B dan oldingi = Phase 6 `U'` dagi): H 12.08 / 3.62 / 8.47 / 7.62 /
90.0 % (85.5 %), LR 18.80 / 0.44 / 18.36 / 17.87 / 97.3 % (97.1), BR1 14.50 / 0.17 / 14.33 / 13.63 /
95.1 % (94.8), BA 3.91 / 0.01 / 3.89 / 3.40 / 87.3 % (87.3), BR2 12.08 / 0 / 12.08 / 11.61 / 96.0 % (96.0).
Heating geometriyasi bir xil; H va U′ farqi — 7B dagi xona ichidagi lead'lar koridori (U′ kichrayadi,
heating band'ining bir qismi koridor ichida = LEAD_HEATING_CLASH).

Lead'lar: devordan 50.0 mm (o'lchangan), lead kesishmalari 42 (asosan connection oyoqlari: muzlatilgan
spiral uchlari lead bundle chetida / ichida — heating o'z lead'lari uchun joy qoldirilmasdan
rejalangan), leadSpacing 100 mm → `CORRIDOR_CAPACITY_EXCEEDED` (D1 1.2 m > 0.9 m ham).

A–D tasnifi:
- A (Phase 6 reference'ga mos) — YO'Q: residual / terminal closure'li 6 konturda closure markazda
  (`PHASE6_REFERENCE_MISMATCH`); Phase 6 generatori residual'ni o'lchamlar skanerida doim
  0.38…0.60 en bo'yicha qo'yadi — reference'dagi "oxirgi o'tish yon polosani qoplaydi" bajarilmaydi.
- B (reference'ga mos emas) — HA → Phase 6 qayta ochilishi kerak; 7B heating'ni o'zgartirmaydi.
- C (coverage < 85 %) — BA.L1 84.0 % (`PHASE6_COVERAGE_INSUFFICIENT`), yashirilmagan.
- D (real lead) — topologiya 12/12 VALID; lead ↔ lead kesishma va lead ↔ heating to'qnashuvi
  muzlatilgan uchlar joyidan kelib chiqadi; 7B faqat yo'nalishni (exitSide) almashtira oladi.
- 60 m: BR2.L1 real lead bilan 74.05 m (`REAL_LEAD_LENGTH_INVALID`; 7D qayta rejalaydi).

Variant `apartment-7b-bathtub-endwall.json` (faqat vanna joyi; alohida hisobot,
`evidence/7B-apartment-bathtub-endwall-0.05-metrics.json`): Phase 6 hash `9ad81f49…`, BA 1 kontur
97.2 %, lead kesishmalari 12, BR2.L1 74.05 m — asosiy fixture o'rnini bosmaydi.

Testlar: `tests/ufh-7b-loops.test.js` A–L 12/12, `tests/ufh-corridor.test.js` 7/7, freeze 2/2;
to'liq regression — `evidence/7B-regression-full.log`.
