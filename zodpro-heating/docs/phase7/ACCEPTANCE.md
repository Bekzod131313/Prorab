# 7-bosqich — acceptance (sub-phase bo'yicha)

Spetsifikatsiya: `docs/phase7/SPEC.md`. Ketma-ketlik: 7.0 → 7A → 7B → 7C → 7D → 7E; har bir
sub-phase alohida qabul qilinadi. Phase 6 baseline: `06130b3` (muzlatilgan).

| Sub-phase | Holat |
|---|---|
| 7.0 Baseline guard + interfeys | ✅ ACCEPTED |
| 7A Kollektor modeli | — |
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
