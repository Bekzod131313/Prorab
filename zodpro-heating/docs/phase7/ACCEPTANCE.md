# 7-bosqich — acceptance (sub-phase bo'yicha)

Spetsifikatsiya: `docs/phase7/SPEC.md`. Ketma-ketlik: 7.0 → 7A → 7B → 7C → 7D → 7E; har bir
sub-phase alohida qabul qilinadi. Phase 6 baseline: `06130b3` (muzlatilgan).

| Sub-phase | Holat |
|---|---|
| 7.0 Baseline guard + interfeys | ✅ ACCEPTED (foydalanuvchi, 2026-10-05; commit `cf1104e`) |
| 7A Kollektor modeli | ✅ ACCEPTED (foydalanuvchi, 2026-10-05) |
| 7B Transfer lead'lar + koridorlar | ⏳ testlar PASS, foydalanuvchi ko'rib chiqishi kutilmoqda — QABUL QILINMAGAN |
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

## 7B — Transfer lead'lar, fizik koridor, U′ (holat: QABUL QILINMAGAN, ko'rib chiqish kutilmoqda)

Engine: `src/engines/ufh/roomgraph.js`, `src/engines/ufh/corridor.js` (`planTransfers`); render va
pipeline: `tools/ufh-transfer-debug.mjs` (muzlatilgan Phase 6 planner U′ ustida). Fixture'lar:
`tests/fixtures/apartment-7b.json` (real loyiha turidagi kvartira: noto'g'ri shakldagi xonalar, ichki devorlar, eshiklar, kollektor xonasi, 4 target xona, vanna to'sig'i; heating 200 mm, hammom 150 mm), `tests/fixtures/zone-101-109-m12-7b.json`
(101–109 xonalari, 12 chiqishli e'lon qilingan test kollektori).

| # | Shart | Holat | Dalil |
|---|---|---|---|
| 1 | Parametrlar alohida, default / fallback yo'q | ✅ | test 7B-1 |
| 2 | 12 lead: span (N−1)·S, eni span + OD, N·S emas (50 / 100 mm) | ✅ | test 7B-2 |
| 3 | Maydon hisobi: C bir marta, U′ = U − C, rawcheck maxraji U′, coverage = H / U′ | ✅ | test 7B-3 |
| 4 | Bog'langanlik: bo'linish / sliver yo'q, transition target U′ chegarasida | ✅ | test 7B-4 |
| 5 | Lead geometriyasi: kesishma 0, devordan 50 mm, lead ↔ lead ≥ S | ✅ | test 7B-5 |
| 6 | 101–109: 100 mm eshik sig'imsiz, 50 mm o'tadi, 108 hisoboti, devor bo'ylab | ✅ | test 7B-6 |
| 7 | Determinizm | ✅ | test 7B-7 (hash) |
| 8 | Phase 6 freeze 10/10, regression | ✅ | 188/188 (`evidence/7B-regression-188.log`, 382 s) |
| 9 | Engine render: devorlar, eshiklar, kollektor, fizik chiqishlar, supply / return, lead yo'llari, o'lchangan 50 mm offset, heating qadami (o'lchangan), konturlar + ID + uzunlik, koridor, xona ID, coverage | ✅ | `pictures/7B-*.png` |

Kvartira, leadSpacing 50 mm (`evidence/7B-apartment-0.05-metrics.json`): `TRANSFERS_OK`, kesishma 0.

| Xona | Rol | U | C | U′ | H | coverage(U′) | Kontur | Bundle (lead / eni) |
|---|---|---|---|---|---|---|---|---|
| H | kollektor xonasi | 12.08 | 1.95 | 10.13 | 8.66 | 85.5 % | 3 | 10 / 0.466 → D2, D3; 8 / 0.366 → D1 |
| LR | tranzit + target | 18.80 | 0.03 | 18.77 | 18.23 | 97.1 % | 3 | 2 / 0.066 → D4 |
| BR1 | target | 14.50 | 0 | 14.50 | 13.75 | 94.8 % | 3 | — |
| BA (150 mm) | target | 3.91 | 0 | 3.91 | 3.41 | 87.3 % | 2 | — |
| BR2 | target | 12.08 | 0 | 12.08 | 11.60 | 96.0 % | 1 | — |

Ochiq masalalar (qabuldan oldin qaror kerak):
- `leadSpacing` real qiymati (100 mm da kvartirada kollektor xonasi bundle'i burchakka sig'maydi va H 81.9 %);
- 101–109: C-01 eksportda devordan 0.40 m — bundle ichida → `LEAD_ORDER_INFEASIBLE`; kollektorning devordagi real joyi kerak;
- kollektor xonasining o'z konturlari va lead → kontur chiqishi ulanishi — 7C.
