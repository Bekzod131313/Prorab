# 7-bosqich — acceptance (sub-phase bo'yicha)

Spetsifikatsiya: `docs/phase7/SPEC.md`. Ketma-ketlik: 7.0 → 7A → 7B → 7C → 7D → 7E; har bir
sub-phase alohida qabul qilinadi. Phase 6 baseline: `06130b3` (muzlatilgan).

| Sub-phase | Holat |
|---|---|
| 7.0 Baseline guard + interfeys | ✅ checklist PASS (commit `cf1104e`) |
| 7A Kollektor modeli | ✅ checklist PASS — tasdiqlash kutilmoqda |
| 7B Xonalar grafi + koridorlar | boshlanmagan |
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

Bu 7D ning vazifasi (haqiqiy lead + drop bilan qayta rejalash); 7A faqat hisobni aniq qiladi va
konturlarni o'zgartirmaydi. Kollektor sig'imi: 9 kerak, 6 bor, yetishmaydi 3 — tavsiya: ≥ 9
chiqishli fizik kollektor yoki zonani bir necha kollektorga bo'lish (modelga hech narsa qo'shilmaydi).
