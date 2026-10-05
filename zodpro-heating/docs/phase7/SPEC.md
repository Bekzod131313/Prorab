# 7-bosqich — COLLECTOR INTEGRATION + REAL LEAD ROUTING: texnik spetsifikatsiya

Holat: **SPECIFICATION (implement qilinmagan)**. Asos: 6-bosqich baseline — acceptance commit
`6a8a025`, muzlatilgan algoritm `06130b3`, regression 169/169 (`docs/phase6/ACCEPTANCE.md`).

Nomlash: bu hujjatdagi "Phase N" — UFH Coverage Router bosqichlari (commitlar "UFH Coverage
Router step 1…6"). `docs/UFH_AUTO_ROUTING_DESIGN.md` dagi eski 10 bosqichli reja (eski
`layout.js` dvigateli) boshqa raqamlash; uning "PHASE 7 — Coverage validation" bandi bu hujjatga
tegishli emas.

---

## 1. Asosiy maqsad

6-bosqich har bir kontur uchun **taxminiy** lead'lar bilan ishlaydi: `leadTo(p)` = kollektordan
(yoki eshiklar zanjiri orqali) nuqtagacha Manhattan masofa, `estimatedLead: true`. Bu taxmin:

- kollektordagi tik tushishni (port → pol, supply + return) hisobga olmaydi;
- lead boshqa konturlarning isitish maydoni ustidan o'tishi mumkinligini tekshirmaydi;
- eshik va devor bo'ylab yo'lak sig'imini, lead'lar o'zaro kesishmasligini, egilish radiusini
  tekshirmaydi;
- konturni aniq bir **fizik** kollektor chiqishiga (supply porti + return porti) bog'lamaydi.

**7-bosqich maqsadi:** har bir konturni kollektorning aniq fizik chiqish juftligiga ulash va
supply / return lead'larini haqiqiy geometriya sifatida (polyline, yoy bilan) yotqizish; keyin
60 m qoidasini **haqiqiy** uzunlik bo'yicha (`heating + supply + return + drops`) qayta tekshirish
va kerak bo'lsa konturlarni muzlatilgan 6-bosqich planneri bilan qayta rejalash.
7-bosqichdan keyin hech bir konturda `estimatedLead: true` qolmaydi.

## 2. 6-bosqichdan olinadigan inputlar

| Input | Manba (muzlatilgan) | Shakli |
|---|---|---|
| Usable heating area `U` | 6-bosqich chaqiruvchisi (zona − devor clearance − obstacle ⊕ clearance) | `shape[]` |
| Spiral regionlar | `spiralRegions(U, s, {toward})` — `decompose.js` | `res.regions[]` |
| Kontur rejasi | `planLoops(res, U, s, ctx)` — `loopplanner.js` | `plan.loops[]`: `spiral.path`, `spiral.supply`, `spiral.ret`, `leadIn`, `leadOut`, `heatingLength`, `regionId`, `shape` |
| Kontur statuslari | `validateLoopLength`, `assessHydraulics` | `LOOP_VALID`, `HYDRAULIC_LOOP_VALID / INVALID`, `reasons[]` |
| Minimum kontur soni dalili | `proveLoopCount` — `loopproof.js` | `candidate_minimum`, statuslar |
| Qoidalar | `criteria.js` | `MAX_LOOP_M` = 60, `LOOP_LENGTH_EPS` = 1e-12, `RMIN_CHECK` = 0.068, `SPACING_TOL`, `LOOP_LOW_MARGIN_M` = 0.25, `ENGINEERING_COVERAGE_TOLERANCE` = 0, `GEOMETRY_NUMERICAL_TOLERANCE` |

6-bosqich planneri ikki joydan **tashqaridan sozlanadi** va 7-bosqich faqat shular orqali ta'sir
qiladi (6-bosqich kodi o'zgarmaydi):

- `ctx.leadTo(point)`: 7-bosqich taxminiy Manhattan o'rniga **marshrut bo'yicha** masofani beradi.
- `U`: 7-bosqich lead koridorlarini `U` dan exclusion sifatida ayiradi, so'ng `spiralRegions` /
  `planLoops` ni qayta chaqiradi.

Yangi inputlar (7-bosqich uchun majburiy):

| Input | Shakli | Izoh |
|---|---|---|
| Kollektor | `{ id, at, outlets, ports: [{ index, supply: {x,y}, ret: {x,y} }], portPitch_m, dropPerPipe_m, facing }` | faqat fizik chiqishlar; `ports.length === outlets` |
| Xonalar | `[{ id, poly }]` | ichki devor yuzalari |
| Eshiklar | `[{ id, between: [roomA, roomB], at, width_m, wallAxis }]` | `width_m` — toza o'tish kengligi |
| Parametrlar | `TRANSIT_PITCH_M` (default 0.10), `DOOR_MARGIN_M` (0.05), `FAN_RADIUS_M` (0.60), `LEAD_BEND_R_M` (= quvur `minBend`, 0.08) | hammasi `criteria`ga emas, yangi `leadcriteria.js` ga |

`dropPerPipe_m` majburiy kirish (sukut bo'yicha qiymat faqat test fixture'larida; eski dvigatel
0.40 m ishlatgan — `layout.js`, `drop = 0.8` = 2 × 0.4).

## 3. 7-bosqich oxirida paydo bo'ladigan capability

1. Har bir kontur **bitta fizik port juftligiga** bog'langan (`collectorId`, `portIndex`),
   supply → supply porti, return → return porti; bitta portga bitta kontur.
2. Har bir kontur uchun **haqiqiy supply va return lead polyline'lari**: port → manifold fan →
   transit koridor → eshik(lar) → kontur chiqishi (spiralning region devoridagi uchi), barcha
   burilishlar `R ≥ RMIN`.
3. Kontur uzunligi **qayta qurilgan geometriyadan**:
   `total = heatingLength + supplyRouted + returnRouted + 2 · dropPerPipe_m`,
   `estimatedLead: false`.
4. 60 m qoidasi buzilsa: muzlatilgan planner marshrut masofasi bilan qayta chaqiriladi va natija
   qayta yotqiziladi; bu jarayon yaqinlashguncha (yoki aniq failure statusi bilan) davom etadi.
5. Zona bo'yicha yagona hisobot: konturlar, lead'lar, port tayinlash, koridorlar, statuslar,
   kollektor sig'imi va (yetmasa) **faqat tavsiya** sifatida — kerakli fizik chiqishlar soni.

## 4. Hal qilinadigan muhandislik muammosi

6-bosqichdagi 60 m tekshiruvi to'g'ri, lekin lead uzunligi taxminiy. Taxmin real yo'ldan
**qisqa** bo'lishi mumkin (tik tushish yo'q, devor bo'ylab aylanib o'tish yo'q). Baseline'da
`LOW_MARGIN` (< 0.25 m) bo'lgan konturlar bor: LP7 L2 0.073 m, 101 L3 0.034 m, LP11 L1 0.035 m,
LP8 L6 0.115 m. Ularda faqat 2 × 0.40 m tik tushishning o'zi ham 60 m dan oshiradi. 7-bosqich shu
xavfni yopadi: obyektga chiqadigan har bir kontur uzunligi haqiqiy yo'l bo'yicha ≤ 60.000000000 m.

Ikkinchi muammo — **jismoniy bajarilishi mumkinligi**: lead'lar boshqa kontur ustidan o'tmasligi,
eshikka sig'ishi, bir-birini kesmasligi, kollektor portlariga kesishmasdan kelishi kerak.

## 5. Input → processing → output oqimi

```
inputs: zona/xonalar U, kollektor (fizik portlar), eshiklar, s, parametrlar
  │
  ├─ 7A  kollektor modeli: portlar, drop, sig'im (requiredLoops ≤ outlets)  ── yetmasa → OUTLET_SHORTAGE (stop)
  │
  ├─ 7B  xonalar grafi + transit koridorlar:
  │        Dijkstra (eshiklar) → har xona uchun eshiklar zanjiri
  │        koridor eni = nLeads · TRANSIT_PITCH_M ; eshik sig'imi ; devor bo'ylab lane
  │        U' = U ⊖ koridorlar (exclusion)
  │
  ├─ 7D.1  rejalash: res' = spiralRegions(U', s) ; plan' = planLoops(res', U', s, { leadTo: routedDistance })   ← MUZLATILGAN 6-bosqich
  │
  ├─ 7C  lead geometriyasi: port tartibi (kesishmaydigan), fan, koridor lane'lari, eshik slotlari,
  │        kontur chiqishiga ulanish, R ≥ RMIN yoylar → supplyPath[], returnPath[]
  │
  ├─ 7D.2  haqiqiy uzunlik: total = heating + |supplyPath| + |returnPath| + 2·drop
  │        biror total > 60 + 1e-12 → routedDistance ni o'lchangan farq bilan tuzatish → 7D.1 (≤ 5 iteratsiya)
  │
  └─ 7E  integratsiyalangan validatsiya (kesishma 0, spacing, egilish, topologiya, coverage, port↔kontur)
           → ZoneReport { loops[{…, supplyPath, returnPath, portIndex, estimatedLead:false}], corridors, status, reasons }
```

## 6. O'zgaradigan / yangi modullar

Yangi (hammasi `src/engines/ufh/`):

| Modul | Vazifa |
|---|---|
| `leadcriteria.js` | 7-bosqich parametrlari va statuslari (`TRANSIT_PITCH_M`, `DOOR_MARGIN_M`, `FAN_RADIUS_M`, `LEAD_*` kodlari) |
| `collector.js` | fizik port modeli, port koordinatalari, drop, sig'im tekshiruvi, portlarni tayinlash |
| `roomgraph.js` | xonalar / eshiklar grafi, Dijkstra, eshiklar zanjiri, eshik va lane sig'imi |
| `corridor.js` | transit koridor poligonlari (devor bo'ylab, eshikdan), `U' = U ⊖ koridor` |
| `leadroute.js` | lead polyline'lari: fan, lane, eshik sloti, kontur chiqishiga ulanish, yoylar; `routedDistance(p)` |
| `collectorplan.js` | orkestrator: 7A → 7B → 7D.1 → 7C → 7D.2 → 7E, iteratsiya, yakuniy `ZoneReport` |
| `leadcheck.js` | 7E validatsiyasi (kesishma, spacing, egilish, topologiya, uzunlik qayta hisobi) |

Yangi asboblar: `tools/ufh-collector-debug.mjs` (SVG: konturlar + lead'lar + koridorlar + portlar).

O'zgarmaydigan, lekin chaqiriladigan: `spiralRegions`, `planLoops`, `validateLoopLength`,
`assessHydraulics`, `proveLoopCount`, `G.*` (geom.js).

**Yangi geometriya yordamchilari `geom.js` ga qo'shilmaydi** (fayl muzlatilgan) — kerak bo'lsa
`leadroute.js` ichida yoki yangi `leadgeom.js` da.

Eski dvigatel (`layout.js`, `rooms.js`, `engine.js`, `validate.js`, UI) 7-bosqichda o'zgarmaydi;
router UI ga 9-bosqichda ulanadi.

## 7. Immutable qismlar (6-bosqich baseline)

Quyidagi fayllar `06130b3` holatida qoladi; 7-bosqichning birinchi testi ularning SHA-256 ini
tekshiradi (`tests/ufh-phase6-freeze.test.js`). Bitta bayt o'zgarsa test qizil bo'ladi.

| Fayl | SHA-256 (16 belgi) @ 06130b3 |
|---|---|
| `src/engines/ufh/geom.js` | `8712da7dafb5c82b` |
| `src/engines/ufh/spiralgen.js` | `96fe45dc50ff43db` |
| `src/engines/ufh/decompose.js` | `3ee5f555a254e981` |
| `src/engines/ufh/obstaclespiral.js` | `fad3bfe6444644af` |
| `src/engines/ufh/closure.js` | `6ca1dbacb6a9df05` |
| `src/engines/ufh/rawcheck.js` | `425a7530ee30cb04` |
| `src/engines/ufh/criteria.js` | `ef07d88b67664fc8` |
| `src/engines/ufh/loopplanner.js` | `15ebdce4ea041cdb` |
| `src/engines/ufh/loopproof.js` | `3f9dd622593bc34c` |
| `src/engines/ufh/partitionsearch.js` | `de6aaeb050313a55` |

Shuningdek o'zgarmaydi: 6-bosqichning barcha testlari va `docs/phase6/**`. 6-bosqich natijalari
(LP7/101/LP11/LP8 statuslari, `candidate_minimum = 7`) **taxminiy lead modeli** uchun e'lon
qilingan. 7-bosqichning haqiqiy lead'li natijalari alohida hisobotda beriladi va ularni
almashtirmaydi.

## 8. Yangi testlar

| Fayl | Testlar |
|---|---|
| `tests/ufh-phase6-freeze.test.js` | 10 ta muzlatilgan faylning SHA-256 i baseline bilan teng |
| `tests/ufh-collector.test.js` | port koordinatalari, `ports.length === outlets`; drop uzunligi totalga 2 marta qo'shiladi; `requiredLoops > outlets` → `OUTLET_SHORTAGE`, lead yotqizilmaydi; virtual port yaratilmaydi (portlar soni hech qachon oshmaydi) |
| `tests/ufh-roomgraph.test.js` | Dijkstra eshiklar zanjiri (101→D-04→108→D-03→107); eshiksiz xona → `LEAD_ROUTE_NOT_FOUND`; eshik sig'imi: `width − 2·DOOR_MARGIN ≥ n·pitch`, aks holda `DOOR_CAPACITY_EXCEEDED` |
| `tests/ufh-corridor.test.js` | koridor eni = n·pitch; `U' ⊆ U`; `area(U) − area(U') = Σ koridor maydoni` (1e-4 m²); koridor eshik o'qidan o'tadi |
| `tests/ufh-leadroute.test.js` | har bir lead port → kontur chiqishi uzluksiz (uchlar ≤ 1e-6 m); burilishlar R ≥ RMIN; lead↔lead, lead↔heating kesishma 0; lane ichida qadam ≥ pitch − SPACING_TOL; fan zonasidan tashqarida lead↔heating ≥ s/2 + pitch/2 − SPACING_TOL; port tartibi kesishmaydi |
| `tests/ufh-routedlength.test.js` | `total` geometriyadan qayta hisoblangan (farq ≤ 1e-9 m); 60.000000000 VALID, 60.000000001 INVALID (sintetik lead bilan); routed ≥ Manhattan taxmini; re-plan ≤ 5 iteratsiyada yaqinlashadi yoki `REPLAN_NOT_CONVERGED` |
| `tests/ufh-collectorplan.test.js` | qabul holatlari: LP1–LP12 (kollektor M0, 12 port), 101–109 (C-01, 6 port → `OUTLET_SHORTAGE`), 101–109-M10 (bir xil geometriya, **e'lon qilingan fizik 10 portli** kollektor bilan test varianti) → to'liq yotqizilgan va valid; determinizm (ikki marta → bir xil JSON hash) |

## 9. Acceptance criteria (o'lchanadigan)

Har bir sub-phase o'z checklisti bilan yopiladi; 7-bosqich hamma sub-phase yopilganda yopiladi.

### 7.0 — Baseline guard va interfeys
- [ ] `ufh-phase6-freeze.test.js`: 10/10 hash mos.
- [ ] 169 ta 6-bosqich testi o'zgarishsiz PASS.
- [ ] `collectorplan.js` interfeysi (input / `ZoneReport` JSON sxemasi) hujjatlangan va sxema testi bor.

### 7A — Kollektor modeli
- [ ] Har bir port juftligi: supply va return orasidagi masofa = `portPitch_m` (±1e-9).
- [ ] `ports.length === outlets` har doim; port soni hech bir funksiya tomonidan oshirilmaydi (test).
- [ ] `requiredLoops > outlets` → `OUTLET_SHORTAGE`, zona `HYDRAULIC_LOOP_INVALID`; 101–109 (C-01): 9 > 6, status o'zgarmagan.
- [ ] Drop: `total` ga aniq `2 · dropPerPipe_m` qo'shiladi (test: drop 0 va 0.4 m farqi = 0.8 m ± 1e-12).

### 7B — Xonalar grafi va koridorlar
- [ ] Eshiklar zanjiri 101→108→107 (fixture) va har bir LP holati uchun (bitta xona) bo'sh zanjir.
- [ ] Koridor eni = `nLeads · TRANSIT_PITCH_M` (±1e-9); eshik sig'imi formulasi bo'yicha tekshiriladi.
- [ ] `area(U) − area(U')` = koridor maydonlari yig'indisi (≤ 1e-4 m² farq) va har xona uchun hisobotda.
- [ ] Koridor hech bir obstacle exclusion bilan kesishmaydi (maydon 0).

### 7C — Lead geometriyasi
- [ ] Har bir kontur: 1 supply + 1 return polyline, uchlari port va kontur chiqishi bilan ≤ 1e-6 m.
- [ ] Lead'larning barcha burilishlari `R ≥ RMIN_CHECK` (o'lchangan, 3 nuqtali radius).
- [ ] Kesishmalar: lead↔lead = 0, lead↔heating (har qanday kontur) = 0, lead↔o'z spirali (uchdan tashqari) = 0.
- [ ] Spacing: bir lane ichida lead↔lead ≥ `TRANSIT_PITCH_M − SPACING_TOL`; `FAN_RADIUS_M` dan tashqarida lead↔heating ≥ `s/2 + pitch/2 − SPACING_TOL`.
- [ ] Lead faqat o'z koridori, eshik slotlari, fan zonasi va o'z regioni chegarasida yotadi (tashqarisi 0 m).

### 7D — Haqiqiy uzunlik va qayta rejalash
- [ ] Har bir kontur: `estimatedLead === false`.
- [ ] `total` qayta qurilgan polyline'lardan: `|total − (heating + |S| + |R| + 2·drop)| ≤ 1e-9`.
- [ ] Har bir kontur `total ≤ 60 + 1e-12`; 60.000000001 INVALID (test).
- [ ] `margin = 60 − total` va `LOW_MARGIN` (< 0.25 m) har konturda hisobotda (ogohlantirish).
- [ ] Qayta rejalash ≤ 5 iteratsiyada yaqinlashadi; aks holda `REPLAN_NOT_CONVERGED` (yashirilmaydi).
- [ ] 6-bosqichga nisbatan kontur soni o'zgarishi (Δk) har holat uchun hisobotda; minimum soni bo'yicha da'vo yo'q (`candidate` faqat).

### 7E — Integratsiyalangan validatsiya va hisobot
- [ ] Topologiya: har bir kontur ↔ bitta port; supply → supply porti, return → return porti; band portga ikkinchi kontur yo'q.
- [ ] Coverage `U'` bo'yicha ≥ `ENGINEERING_FINAL_COVERAGE` (0.85), `ENGINEERING_COVERAGE_TOLERANCE = 0`; largest gap ≤ `MAX_LARGEST_GAP`; koridor maydoni alohida qatorda (yashirilmaydi).
- [ ] Har bir kontur mustaqil ikki yo'lli spiral, zmeyka yo'q, intersection = 0 (6-bosqich tekshiruvlari qayta ishga tushadi).
- [ ] Qabul holatlari: LP1–LP12 va 101–109-M10 → `ROUTED_VALID`; 101–109 (C-01) → `OUTLET_SHORTAGE`; LP10 (3 port) → `OUTLET_SHORTAGE`.
- [ ] Determinizm: bir xil input → bir xil `ZoneReport` JSON (SHA-256 teng).
- [ ] Unumdorlik: har bir LP / 101 holati `collectorplan` bilan ≤ 3 × (6-bosqich planner vaqti); to'liq test to'plami ≤ 15 daqiqa.

### Koridor maydoni — QABUL QILINGAN QAROR (2026-10-05)

1. Lead koridorlari `U` dan exclusion sifatida ayiriladi: `U' = U − corridor_exclusion`.
2. `coverage = heated_area / area(U')`.
3. Koridor exclusion heating uchun usable area hisoblanmaydi.
4. Hisobotda alohida metrikalar: `U_m2` (original usable area), `corridor_m2` (exclusion),
   `Uprime_m2` (final usable heating area), `heated_m2`, `coverageUprime`.
   Muvofiqlik: `|U_m2 − corridor_m2 − Uprime_m2| ≤ GEOMETRY_NUMERICAL_TOLERANCE.area_m2` va
   `coverageUprime = heated_m2 / Uprime_m2`.
5. Koridor — haqiqiy fizik koridor: uning poligoni o'zidagi lead polyline'larini aynan o'rab oladi
   (lead'lar koridor ichida, koridor eni = lead'lar soni × pitch); statistik maydon emas.
6. Koridor boshqa heating regionlarini noto'g'ri yopmaydi: koridor faqat lead'lari o'tadigan
   xonalar / eshiklar yo'lida, region bo'linishi `U'` dan qayta quriladi (yopilgan region yo'q).
7. Koridor ∩ heating geometriyasi = 0; yagona istisno — kontur chiqishining ruxsat etilgan
   ulanish segmenti (connection segment), hisobotda ro'yxat bilan.
8. `ENGINEERING_COVERAGE_TOLERANCE = 0`; `GEOMETRY_NUMERICAL_TOLERANCE` (1e-4 m²) faqat
   raqamli muvofiqlik uchun.

Ketma-ketlik: 7.0 → 7A → 7B → 7C → 7D → 7E; har bir sub-phase alohida acceptance qilinmasdan
keyingisiga o'tilmaydi.

### REAL UFH LEAD ROUTING RULES (2026-10-05, qat'iy — 7B dan boshlab)

1. **Collector room.** Kollektor turgan xonaning heating zone'i tanlangan `heatingPitch` bilan
   quriladi: 0.15 m yoki 0.20 m (input). Bu kollektor port pitchidan mustaqil.
2. **Inter-room transfer.** Boshqa xonaga ketadigan supply / return lead'lari devor bo'ylab yuradi;
   lead centerline devordan `leadWallOffset` (real loyiha: 0.05 m) masofada. Bu heating pitch emas.
3. **Door transition.** Lead devor bo'ylab `leadWallOffset` ni saqlab eshikdan o'tadi (eshik
   tirgaklaridan ham `leadWallOffset`); eshikdan keyin target room heating zone'iga transition.
4. **Target room.** Target room heating loop'lari yana tanlangan `heatingPitch` bilan (0.15 / 0.20 m).
5. **Corridor is physical geometry.** Koridor — real geometrik exclusion: `U' = U − corridor_exclusion`.
6. **Coverage.** `coverage(U') = heated_area / area(U')`, `ENGINEERING_COVERAGE_TOLERANCE = 0`.
7. **No collision.** Koridor ∩ heating geometriyasi = 0; faqat ruxsat etilgan connection /
   transition segmentlari (target room'dagi eshikdan keyingi kirish) bundan mustasno.
8. **Supply / return** lead'lari juft holda koridordan o'tadi; haqiqiy centerline geometriyasi 7C da.
9. **Terminologiya — uchta alohida parametr, umumiy "pitch" yo'q:**
   - `collectorPortPitch` — kollektor ulanishlari orasidagi masofa (7A modelida `collector.portPitch_m`,
     yagona manba);
   - `leadWallOffset` — lead centerline ↔ devor (va eshik tirgagi);
   - `heatingPitch` — heating quvurlari qadami (xona bo'yicha `room.heatingPitch`, aks holda zona qiymati).
10. **Default yo'q.** `heatingPitch`, `leadWallOffset` va `leadSpacing` majburiy input. `heatingPitch`
    faqat {0.15, 0.20} m. Real loyiha modeli uchun `leadWallOffset = 0.05 m`; `collectorPortPitch`
    mustaqil ravishda 0.05 m bo'lishi mumkin.

Qo'shimcha parametr (spetsifikatsiyada nomi aniq, qiymati loyihadan): **`leadSpacing`** — bir
koridordagi yonma-yon lead centerline'lari orasidagi masofa. Default yo'q (majburiy input). 7.0 dagi
`TRANSIT_PITCH_M` konstantasi 7B da ishlatilmaydi.

### 7B acceptance contract (yuqoridagi qoidalar asosida; 2-tahrir — real lead geometriyasi)

Parametrlar (hammasi majburiy, birortasi boshqasi uchun fallback emas): `heatingPitch` {0.15, 0.20},
`leadWallOffset` (real loyiha 0.05), `leadSpacing` (default yo'q), `pipeType` (OD katalogdan),
`wallClearance`; `collectorPortPitch` = `collector.portPitch_m` (7A).

Lead geometriyasi (engine `src/engines/ufh/corridor.js` → `planTransfers`):
- har bir transfer kontur = 2 lead (supply + return), kollektordagi qo'shni port juftidan;
- port → devor bo'ylab slot (`leadWallOffset + j·leadSpacing`, j = 0 devor yonida) → eshik
  (tirgakdan `leadWallOffset`, lead'lar `leadSpacing` oralig'ida) → keyingi xona devori → target
  room'da devordan `wallClearance` gacha transition (heating zone chegarasi);
- kesishmasiz tartib: chiqish eshigiga ichki lead birinchi buriladi; kirishda yo'l bo'ylab eng uzoq
  kelgan lead eng ichki slotga; xonaning o'z lead'lari bundle orqasida to'g'ri kiradi; chiqishdan
  keyin qolgan lead'lar bo'shagan ichki slotlarga pog'onama-pog'ona suriladi (devordan doim
  `leadWallOffset`, cho'ntak qolmaydi); kollektor portlari bundle'ning devor tomonida
  (≤ `leadWallOffset`) yoki undan chuqurroqda turishi kerak — bundle ichida bo'lsa
  `LEAD_ORDER_INFEASIBLE`;
- burchakka bundle chuqurligidan yaqin bo'lgan devor bo'lagi → `CORRIDOR_CAPACITY_EXCEEDED`.

Fizik koridor exclusion: lead centerline'lari quvur radiusi (OD/2) bilan buferlanadi, qo'shni lead'lar
orasi va devor ↔ birinchi lead orasi yopiladi (closing, `leadSpacing/2`). Bundle o'lchamlari:
centerline span `(N − 1)·S`, fizik eni `(N − 1)·S + OD` (hech qachon `N·S` emas), devordan
chuqurligi `leadWallOffset + (N − 1)·S + OD/2`; eshik talabi `2·leadWallOffset + (N − 1)·S`.
`C = U ∩ koridor`, `U' = U − C`; heating — muzlatilgan Phase 6 planner `U'` ustida.

O'lchanadigan shartlar (7B) — `tests/ufh-corridor.test.js`:
- [ ] 1 parametrlar alohida: har biri yo'qligida `INPUT_INVALID`; port pitch yoki wall offset o'zgarishi heating pitchni o'zgartirmaydi; heating spacing o'lchangan 200 mm.
- [ ] 2 12 lead: 50 mm → span 0.55, eni 0.566, chuqurlik 0.608, eshik 0.65; 100 mm → 1.1 / 1.116 / 1.158 / 1.2; koridor hech qayerda bundle chuqurligidan chuqur emas.
- [ ] 3 `C` bir marta (`area(U ∩ K)`), `U' ∩ K = 0`, `U − C = U'` (1e-4), rawcheck usable = `U'`, `H + uncovered = U'`, `coverage = H / U'`; 7.0 contract PASS; heating ↔ koridor ≥ `heatingPitch/2`.
- [ ] 4 bog'langanlik: komponentlar oldin = keyin, sliver yo'q, transition oxiri target `U'` chegarasida; 100 mm sig'imsizlik xabar qilinadi.
- [ ] lead geometriyasi: kesishma 0; port → eshiklar zanjiri; supply/return bitta chiqishda; devordan o'lchangan `leadWallOffset`; lead ↔ lead ≥ `leadSpacing` (fan va eshiklardan tashqari).
- [ ] 101–109 (12 chiqishli test varianti): D-03 100 mm → 1.2 m > 0.9 m `DOOR_CAPACITY_EXCEEDED`; 50 mm → 0.65 m o'tadi; 108 bundle hisoboti; lead'lar devor bo'ylab (108 dagi teng yo'llar regressiyasi); C-01 0.40 m → `LEAD_ORDER_INFEASIBLE`; 6 chiqish → `OUTLET_SHORTAGE`.
- [ ] determinizm: bir xil input → bir xil hash (transfers va to'liq pipeline).
- [ ] engine render: `tools/ufh-transfer-debug.mjs` (har bir chiziq engine qaytargan geometriya), `docs/phase7/pictures/7B-*`.
- [ ] Phase 6 freeze 10/10, 7.0 / 7A o'zgarmagan, to'liq regression PASS.

### 7B acceptance contract — 3-tahrir (FINAL CORRECTION: har bir kontur bitta fizik yo'l)

Kontur = bitta uzluksiz fizik yo'l: `COLLECTOR SUPPLY PORT → SUPPLY LEAD → (eshiklar) → TARGET ROOM →
HEATING START → uzluksiz ikki yo'lli spiral (Phase 6, muzlatilgan) → terminal / residual closure →
HEATING END → RETURN LEAD → (eshiklar) → o'sha juftning COLLECTOR RETURN PORT`. Serpantin yo'q.

Engine (Phase 6 fayllariga tegilmaydi; spiral faqat Phase 6 public API orqali olinadi):
- `corridor.js` `planTransfers({ …, loopExits })`: `loopExits[loopId] = { a, b, ha, hb }` — muzlatilgan
  planner bergan spiral uchlari (`spiral.supply`, `spiral.ret`) va uch stub'lari. Konturning juft
  lead'i xona devori bo'ylab (o'z eshigidan yoki kollektordan) spiral uchigacha boradi: juft
  bundle'ning xona tomonida, tashqi lead oldin buriladi (≥ S), uchlarga tayinlash va oyoq shakli
  (to'g'ri / uchlar ortidan aylanib / to'g'ri burchakli) kesishmasiz variant bo'yicha tanlanadi; uch
  kirish eshigi oldida bo'lsa — eshikdan to'g'ridan-to'g'ri. Bundle → spiral uchi kesmasi
  "connection segment" (koridor emas). Xona ichidagi umumiy distribution yo'li = devor bo'ylab
  bundle (alohida tunnel yo'q).
- `looptopology.js` — har bir kontur uchun geometriya bo'yicha (1e-6 m) bayroqlar:
  `collectorSupplyConnected, supplyLeadConnected (eshik ochiqlarini kesib o'tadi),
  heatingStartConnected, heatingGeometryContinuous (heating = spiral path ichida uzluksiz),
  heatingEndConnected, returnLeadConnected, collectorReturnConnected, wholeLoopConnected` (port →
  lead → spiral → lead → port zanjiri). Bitta false → `LOOP_DISCONNECTED`; lead boshqa konturning
  spiraliga, ikki lead bitta uchga yoki supply/return turli chiqish juftlarida →
  `LOOP_CONNECTION_INVALID`. Rang yoki yaqinlik ulanish emas.
- `loopreport.js` — yakuniy geometriyadan har bir kontur: heating (Phase 6), supply / return =
  routed lead + spiral uch stub'i, `total = heating + supply + return + 2·drop` (7A `loopTotal` →
  muzlatilgan 60 m tekshiruvi, 60.000000000 VALID / 60.000000001 INVALID, `LOW_MARGIN` < 0.25 m
  ogohlantirish), o'z regioni ∩ `U'` dagi coverage va eng katta gap (raw check bilan bir xil band /
  opening), residual spacing (o'lchangan), min radius, kesishmalar, lead clearance, lead chuqurligi,
  topologiya, status.
- Pipeline (`tools/ufh-transfer-debug.mjs`, `connect: true`): muzlatilgan planner `ctx.leadTo`
  interfeysi orqali haqiqiy uzunlikni hisobga oladi (port → xona kirishigacha o'lchangan transfer +
  drop + kirishdan devor bo'ylab yo'l); lead'lar spiral uchlariga yotqiziladi; spiral biror lead
  run'iga `leadSpacing` dan yaqin bo'lsa (o'z lead'lari faqat o'z uchlari atrofida) — shu kontur
  o'z regionida (devor envelope'i chiqarilgan) yoki xona butunlay qayta rejalanadi; har bir raund
  ikki usul, eng yaxshi holat saqlanadi; o'z regionida 85 % dan past kontur boshqa start burchagi
  (`toward`) bilan qayta spirallanadi. Hisobot: `converged`, `convergence`.

O'lchanadigan shartlar — `tests/ufh-7b-loops.test.js` (§18 ro'yxati):
- [ ] 1 to'g'ri burchakli xona · 2 noto'g'ri shakl (L) · 3 1 konturli · 4 2 konturli (alohida
  subregion, mustaqil uzluksiz spiral) · 5 3 konturli (kvartira H, LR, BR1) · 6 o'ng tomondagi
  qoldiq en (yon polosa qoplangan, gap 0) · 7 markaziy residual closure (o'lchangan residual ≥ 0.1)
  · 8 o'ng tomonda to'siq · 9 leadSpacing 50 (kvartira: TRANSFERS_OK, devordan 50.0 mm, qadam
  o'lchangan 200 / 150 mm) · 10 leadSpacing 100 → `CORRIDOR_CAPACITY_EXCEEDED` (majburlanmaydi) ·
  11 heating start / end 10 mm siljigan → `LOOP_DISCONNECTED` · 12 return port'dan 10 mm →
  `LOOP_DISCONNECTED` · 13 supply / return boshqa konturga → `LOOP_CONNECTION_INVALID` · 14 real
  kvartira fixture'i (determinizm bilan).
- [ ] har bir kontur: topologiya VALID (8/8 bayroq), coverage ≥ 85 %, kesishma 0, clearance ≥ S,
  radius ≥ RMIN, total ≤ 60 m; har bir xona `U − C = U'`, `H / U' ≥ 85 %`.
- [ ] render faqat engine geometriyasidan: residual / terminal qism, heating start ● / end ○,
  har bir kontur ID / chiqish / uzunlik / coverage, o'lchangan qadam va devor offset chiziqlari,
  detail: kollektor → lead → eshik → xona → spiral → terminal closure → return.

Cheklov (muzlatilgan Phase 6): spiral shakli, terminal closure joyi (Phase 6 generatori residual'ni
doim markazga yaqin qo'yadi — skanerda 0.38…0.60 en bo'yicha) va region bo'linishi Phase 6 niki;
7B ularni o'lchaydi va faqat Phase 6 public parametrlari (`region`, `toward`, `leadTo`) bilan
qayta chaqiradi.

## 10. Failure statuslari

| Status | Shart | Bloklaydimi |
|---|---|---|
| `OUTLET_SHORTAGE` | `requiredLoops > outlets` | ha (lead yotqizilmaydi) |
| `MANIFOLD_PORTS_INVALID` | port koordinatalari / soni noto'g'ri, `ports.length ≠ outlets` | ha |
| `LEAD_ROUTE_NOT_FOUND` | xonaga eshiklar zanjiri yo'q | ha |
| `DOOR_CAPACITY_EXCEEDED` | `width − 2·DOOR_MARGIN < n·pitch` | ha |
| `CORRIDOR_CAPACITY_EXCEEDED` | devor bo'ylab lane koridorga sig'maydi (obstacle / tor joy) | ha |
| `LEAD_ORDER_INFEASIBLE` | portlar tartibi kesishmasiz bo'lishi mumkin emas | ha |
| `LEAD_BEND_RADIUS` | lead burilishi < RMIN | ha |
| `LEAD_SPACING` | lane yoki lead↔heating spacing buzilgan | ha |
| `LEAD_INTERSECTION` | har qanday kesishma > 0 | ha |
| `LOOP_LENGTH_EXCEEDED_ROUTED` | qayta rejalashdan keyin ham `total > 60` | ha |
| `REPLAN_NOT_CONVERGED` | 5 iteratsiyada barqaror reja yo'q | ha |
| `COVERAGE_BELOW_LIMIT` | `U'` bo'yicha coverage < 0.85 yoki gap > limit | ha |
| `LOOP_DISCONNECTED` | kontur yo'lining biror bo'g'ini geometrik ulanmagan (7B, `looptopology.js`) | ha |
| `LOOP_CONNECTION_INVALID` | lead boshqa kontur spiraliga / supply va return turli juftda (7B) | ha |
| `LOW_MARGIN` | `margin < 0.25 m` | yo'q (ogohlantirish) |
| `ROUTED_VALID` | hammasi o'tdi | — |

"Search did not find a solution" va "impossible" ajratilgan holda qoladi: `LEAD_ROUTE_NOT_FOUND`
— grafda yo'l yo'qligi (isbot); `REPLAN_NOT_CONVERGED` — qidiruv tugamagani (isbot emas).

## 11. Regression talablari

1. 6-bosqichning 169 ta testi o'zgartirilmasdan PASS (hech biri o'chirilmaydi, skip qilinmaydi).
2. `ufh-phase6-freeze.test.js` PASS (10 fayl hash).
3. 6-bosqich dalillari qayta tekshiriladi: mavjud `tests/ufh-loopproof.test.js` (LP8 k=5 @0.2,
   LP11 k=2 @0.05, LP4 PROVEN_FEASIBLE) — o'zgarishsiz PASS.
4. Yangi testlar bilan to'liq to'plam ≥ 169 + 7-bosqich testlari, hammasi PASS, ≤ 15 daqiqa.
5. Har bir sub-phase commiti oldidan to'liq to'plam ishga tushadi; natija commit xabarida.

## 12. 7-bosqich qachon CLOSED

- 7.0, 7A, 7B, 7C, 7D, 7E checklistlarining hamma bandlari ✅.
- To'liq regression PASS (6-bosqich 169 + yangi testlar), freeze testi PASS.
- `docs/phase7/ACCEPTANCE.md` + `docs/phase7/evidence/` (har holat uchun `ZoneReport` JSON,
  lead SVG, regression log) commit qilingan; commit hash hisobotda.
- 7-bosqich muzlatiladi (o'z fayllari hash ro'yxati 8-bosqich freeze testiga qo'shiladi).

## 13. Roadmap

| Bosqich | Nomi | Mazmuni | O'lchanadigan yakun |
|---|---|---|---|
| **7** | Collector integration + real leads | yuqoridagi spetsifikatsiya | §12 |
| **8** | Hydraulic balancing | har kontur: sarf (xona issiqlik yo'qotishi / kontur ulushi), ΔT, tezlik, Δp (heating + lead'lar + drop, `hydraulics.js`), balans klapani presetlari, kollektor jami sarfi va Δp, nasos boshi | Σ kontur sarfi = kollektor sarfi (1e-9); har kontur tezlik chegarada; eng og'ir kontur Δp ≤ mavjud bosim; preset jadvali; `OUTLET_SHORTAGE` holatlari uchun kollektor tanlash tavsiyasi |
| **9** | Engine / BIM / UI integratsiyasi | router `engine.js` + Web Worker ga feature flag bilan; `ufh_loop` (supplyPath / heatingPath / returnPath, `circuitId`), preview, APPLY / undo, saqlash; eski `layout.js` bilan yonma-yon va migratsiya | E2E: kollektor → AVTO → preview → APPLY → saqlash → ochish → bir xil geometriya; eski 169+ test va UI smoke PASS |
| **10** | Production QA | 300 ta urug'li fuzz zona (obstacle, eshik, kollektor), real loyihalar korpusi, unumdorlik byudjeti, determinizm, hujjat | fuzz: 0 kesishma, 0 ta > 60 m, 0 virtual port; tipik zona ≤ 2 s (worker); hujjat to'liq |

Production-ready versiyagacha **4 bosqich qoldi: 7, 8, 9, 10**. 7-bosqich ichida 6 ta sub-phase
(7.0, 7A–7E).

Ko'lamdan tashqari (7-bosqichda qilinmaydi): gidravlik balans (8), UI / BIM (9), kollektor
joyini avtomatik tanlash yoki qo'shimcha kollektor qo'shish (faqat tavsiya, 8), virtual port
(hech qachon), 6-bosqich kodini o'zgartirish (hech qachon — freeze).
