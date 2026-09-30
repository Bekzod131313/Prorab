# ZODPRO — UFH Auto Routing Engine (теплый пол avtomatik yotqizish)

Loyiha hujjati — texnik topshiriqning 45-bo‘limi bo‘yicha. Kod yozishdan oldingi arxitektura,
ma'lumot modellari, algoritmlar, UI oqimi, testlar va 10 bosqichli reja. Topshiriqning har bir
bandi (1–44) quyidagi jadvalda qaysi bo‘lim/bosqichda bajarilishi ko‘rsatilgan — hech narsa sukut
bilan tashlab ketilmaydi (§17).

---

## 0. Hozirgi holat va nima o‘zgaradi

| Bor narsa (hozir) | Muammo | Yangi yechim |
|---|---|---|
| Xonaga "Pol isitish" beriladi, konturlar **har bir qayta hisoblashda** `engines/ufhlayout.js` bilan xona to‘g‘ri to‘rtburchaklaridan yasaladi | Konturlar saqlanmaydi (haqiqiy BIM obyekt emas), poligon/obstacle yo‘q, qamrov tekshirilmaydi | Zona (`ufh_zone`) va kontur (`ufh_loop`) — **saqlanadigan BIM elementlar**; geometriya faqat APPLY / REGENERATE da yaratiladi va deterministik |
| Kollektorda faqat chiqishlar soni (`outlets`) | Circuit identifikatori yo‘q | Kollektor → `circuits[]` (C01…C12), har birida supply + return connector |
| `ufhlayout.js`: to‘rtburchak slab + spiral/serpantin | Murakkab poligon, teshik (obstacle) yo‘q | Yangi `engines/ufh/` moduli: Clipper asosidagi geometriya, contour-parallel adaptive spiral, boustrophedon serpantin, region decomposition |
| 60 m tekshiruvi `refineWithLayout` da | Oldindan baholanadi | Qat'iy: har bir kontur aniq geometriyadan o‘lchanadi, >60,0 m bo‘lsa APPLY bloklanadi |
| Qamrov tekshiruvi yo‘q | Bo‘sh joy qolsa ham "OK" | Majburiy coverage analiz + xarita (yashil/qizil/kulrang/sariq) |

Eski xona-rejimi (xonaga "Pol isitish" berish) **o‘chirilmaydi**: xonada `ufh_zone` bo‘lmasa, avvalgidek
ishlaydi. "Avto issiq pol" buyrug‘i esa endi har bir xona uchun zona + kontur yaratadigan qilib
qayta ulanadi (6-bosqich), shuning uchun natija bitta dvigateldan chiqadi.

---

## 1. UFH moduli arxitekturasi

```
src/
  engines/ufh/                      ← sof funksiyalar, DOM yo‘q, Web Worker ichida ham ishlaydi
    geom.js          Clipper o‘rami: offset, union, difference, intersection, area, point-in-polygon,
                     segment intersection, epsilon/tolerance, orientatsiya, sanitize (self-intersection)
    area.js          HeatingArea = Zone ⊖ wallClearance ⊖ (Obstacles ⊕ obstacleClearance)
    decompose.js     region decomposition (orol/teshik bo‘yicha), loop splitting (teng maydonli kesish)
    spiral.js        Adaptive Spiral (contour-parallel, bifilar), keyhole U-turn
    serpentine.js    Boustrophedon serpentin (fallback / tanlov bo‘yicha)
    leads.js         kollektor circuit → zona kirishi: supply/return yo‘li (lead band + devor bo‘ylab)
    validate.js      60 m, coverage, clearance, obstacle, bend radius, spacing, topologiya
    coverage.js      qamrov: aniq maydon (Clipper) + ko‘rish uchun grid-xarita
    repair.js        Auto Repair strategiyalari
    engine.js        pipeline: generate(zone, ctx) → { loops, report } ; regenerate ; repair
    pipes.js         quvur turlari: OD×s, material, MIN_BEND_RADIUS, ichki diametr
  workers/ufh.worker.js             ← engine.js ni fonda ishga tushiradi, progress xabarlari
  core/model.js                     ← yangi kategoriyalar: ufh_zone, floor_obstacle, ufh_loop; collector circuits
  ui/ufhtool.js                     ← kollektor kontekst menyusi, SHLANKA OLISH, AVTO ТЕПЛЫЙ ПОЛ, preview paneli
  ui/plan2d.js                      ← zona/obstacle/kontur chizish, coverage overlay, yorliqlar
  ui/view3d.js                      ← ufh_loop elementlarini 3D quvur sifatida
vendor/clipper/clipper.mjs          ← clipper-lib 6.4.2 (Boost licence), ES modul qilib o‘ralgan
```

Qoidalar:
- **Deterministik** (§44 RULE 14–15): bir xil kirish → bir xil geometriya. Tasodifiy son yo‘q,
  tartiblash barqaror, barcha koordinatalar 0,1 mm butun songa (Clipper scale = 10 000/m) aylantiriladi.
- Engine faqat **kirish ma'lumoti → natija** qaytaradi; model o‘zgarishi faqat APPLY da, bitta
  tranzaksiya (`store.apply(changeSet)`) bilan (§41 undo/redo).
- Hisob (`engines/calc.js`) saqlangan `ufh_loop` lardan uzunlik/diametrni oladi va gidravlikani
  qayta hisoblaydi (§33).

---

## 2. Kollektor connector arxitekturasi (§2, §3)

```js
collector = {
  id, cat: 'collector', kind: 'ufh', mark: 'COL-01',
  manufacturer, model, outlets: 12,           // circuit soni
  pipe: { dn: '16' }, flowM3h, tSupply, tReturn, // gidravlik natijalar hisobdan
  circuits: [                                   // saqlanadi; outlets o‘zgarsa qayta hosil qilinadi
    { id: 'C01', index: 0, loopId: null, label: '' },
    ...
  ]
}
```
- Connector joylashuvi hisoblanadi (saqlanmaydi): `collectorPort(col, index, 'supply'|'return')`
  (bor), yo‘nalishi = kollektor lokal +Y (xona tomoni). Yangi yordamchi:
  `circuitConnectors(col, circuitId) → { supply:{pos,dir}, return:{pos,dir} }`.
- Circuit bitta konturga band bo‘ladi (`loopId`). Band circuitga ikkinchi kontur ulanmaydi (§20).
- Kontur hech qachon "port raqami" orqali emas, **circuitId** orqali ulanadi; port indeksi
  circuitdan olinadi → ikki circuit aralashmaydi.

---

## 3. Heating Zone ma'lumot modeli (§38)

```js
ufh_zone = {
  id, cat: 'ufh_zone', levelId, name: 'ZONE-01', roomId?,     // roomId: agar xonadan olingan bo‘lsa
  polygon: [{x,y}, ...],             // yopiq, CCW ga normallashtiriladi, self-intersection rad etiladi
  obstacleIds: [],                    // qo‘lda bog‘langan; qo‘shimcha ravishda zona ichidagi floor_obstacle lar avtomatik olinadi
  spacing: 0.15,                      // 0.10 | 0.15 | 0.20 | 0.25 | 0.30
  wallClearance: 0.10,                // 0.05 | 0.075 | 0.10 | 0.15 | 0.20
  obstacleClearance: 0.10,
  pipeType: 'PERT-16x2.0',
  strategy: 'adaptive_spiral',        // spiral | serpentine | adaptive_spiral | adaptive_serpentine
  maxLoop: 60,                        // qat'iy yuqori chegara, 60 dan katta qo‘yib bo‘lmaydi
  coverageMin: 0.97,                  // foydalanuvchi o‘zgartiradi (§14)
  collectorId, circuitIds: ['C01', ...],  // zonaga ajratilgan circuitlar (split paytida qo‘shiladi)
  status: 'valid' | 'invalid' | 'stale',  // stale: zona/obstacle tahrirlandi, REGENERATE kerak
  report: { … oxirgi validatsiya natijasi … }
}
```

## 4. Obstacle ma'lumot modeli (§7, §9)

```js
floor_obstacle = {
  id, cat: 'floor_obstacle', levelId,
  kind: 'stair'|'column'|'bathtub'|'toilet'|'furniture'|'kitchen'|'equipment'|'structure'|'unheated',
  polygon: [{x,y}, ...], clearance: null   // null → zonaning obstacleClearance i
}
```
Mavjud `obstacle` (balka/kanal chizig‘i) bilan aralashmaydi — u 3D to‘qnashuv uchun qoladi.

## 4a. Loop va pipe modeli (§38)

```js
ufh_loop = {
  id, cat: 'ufh_loop', levelId, name: 'UFH-01', zoneId, collectorId, circuitId,
  manual: false,
  supplyPath: [{x,y}],   // kollektor supply connector → zona kirishi
  heatingPath: [{x,y}],  // bifilar spiral/serpantin (supply yarmi + U-burilish + return yarmi)
  split: 123,            // heatingPath dagi supply/return chegarasi
  returnPath: [{x,y}],   // zona chiqishi → return connector
  totalLength, supplyLength, heatingLength, returnLength,
  spacing, pipeType, coverage, minBendRadius,
  status: 'valid'|'invalid', errors: []
}
```
`UFHPipe` (§38) alohida saqlanmaydi — u `ufh_loop` dan hosil qilinadigan ko‘rinish:
`loopPipes(loop) → [{ id:`${loop.id}:S`, loopId, segmentId:'supply', geometry, diameter, material, length, system:'ufh_supply', connectorStart:{collectorId,circuitId,'supply'}, connectorEnd:{loopId,'in'} }, …heating, …return]`.
Shu orqali eksport (IFC/DXF/BOM) va xususiyatlar paneli "haqiqiy quvur" bilan ishlaydi, ma'lumot esa takrorlanmaydi.

---

## 5. Poligon geometriya konveyeri (§11, §30)

Barcha operatsiyalar `engines/ufh/geom.js` orqali, Clipper butun sonli koordinatalarida:
- `offset(polys, d, join='miter'|'round', miterLimit)` — ichkariga manfiy d.
- `union / difference / intersection` — `PolyTree` bilan (teshikli poligonlar).
- `area(polys)` (teshik ayiriladi), `pointInPolygon`, `segmentIntersect`, `closestPoint`.
- `sanitize(poly)`: takroriy nuqtalar, kollinear nuqtalar, orientatsiya (tashqi CCW, teshik CW),
  self-intersection → `SimplifyPolygon`; natija bo‘sh yoki > 1 bo‘lak bo‘lsa zona **invalid** (§35).
- Tolerance: `EPS_LEN = 1e-4 m`, `EPS_AREA = 1e-6 m²`, burchak `1e-6 rad`; Clipper scale 10 000.

## 6. Isitiladigan maydon hisobi (§8, §9)

```
U = offset(Zone, −wallClearance)
    ⊖ ⋃ offset(Obstacle_i, +clearance_i)        (zona ichidagi / kesishgan obstaclelar)
    ⊖ ⋃ offset(ExistingPipe_j, +spacing/2)       (§29 qo‘lda chizilgan quvurlar)
C = offset(U, −spacing/2)                         ← quvur o‘qi (centerline) yurishi mumkin bo‘lgan joy
```
- Quvur markazidan chetgacha `spacing/2` qolgani uchun quvur hech qachon devorga `wallClearance` dan,
  obstaclega `clearance` dan yaqin kelmaydi (RULE 05–06).
- `U` bir necha bo‘lakka bo‘linishi mumkin (obstacle zonani kesib o‘tsa) → har bir bo‘lak **region**.

## 7. Adaptive Spiral algoritmi (§12, §13)

Contour-parallel ("halqa-parallel") bifilar spiral — ixtiyoriy poligon va teshiklar uchun:
1. `C` ning halqalari: `R_k = boundary(offset(C, −2·s·k))`, k = 0,1,2,… bo‘sh bo‘lguncha.
   Har bir halqa `C` konturiga parallel → spiral xona shaklini takrorlaydi (L, U, obstacle atrofi).
2. Halqalar daraxti: offset paytida halqa ikkiga bo‘linsa (masalan obstacle ikki tomonida) —
   daraxt shoxlanadi. Har bir shox alohida **pastki region** (§12 "region decomposition").
3. Spiral o‘q chizig‘i: kirish nuqtasi `E` (R_0 da, kollektor tomonidagi eng yaqin nuqta) dan R_0
   bo‘ylab deyarli to‘liq aylanadi, `2s` masofada R_1 ga "ko‘prik" bilan o‘tadi, … eng ichki halqagacha.
   Ko‘prik joyi — halqalar orasidagi eng qisqa perpendikulyar, oldingi ko‘prikdan kamida `4s` narida
   (ko‘priklar bir chiziqqa yig‘ilmaydi).
4. Bifilar: o‘q chizig‘i `±s/2` ga offset qilinadi → supply va return quvurlari **aniq s** masofada,
   navbatma-navbat; markazda U-burilish (radius = max(s/2, Rmin); s/2 < Rmin bo‘lsa "keyhole"
   burilish) — ikkala uch kirishda yonma-yon (§21).
5. Burchaklar: o‘q chizig‘i burchaklari `R = s` bilan yoy (bor `filletPolyline`) → ichki quvur
   radiusi s/2, tashqisi 1,5·s; `s/2 < Rmin` bo‘lgan joyda yoy radiusi Rmin + s/2 gacha oshiriladi.
6. Oddiy to‘rtburchakda natija referensdagi to‘rtburchak spiralning aynan o‘zi bo‘ladi
   (hozirgi `spiralLoop` bilan solishtirish testi).

## 8. Serpentin (fallback / tanlov)

Boustrophedon: `C` ni "boustrophedon cell decomposition" bilan monoton kataklarga bo‘lish
(obstacle chetlari bo‘ylab), har bir katakda yo‘nalish bo‘yicha `2s` qadamli meander o‘q chizig‘i →
bifilar offset (bor `doubleSerpentineLoop` usuli). Kataklar ketma-ket, kirish tomondan ulanadi.
`adaptive_serpentine`: yo‘nalish (0°/90°) va kataklar tartibi eng kam burilish va eng ko‘p qamrov
bo‘yicha tanlanadi. Adaptive Spiral region uchun qamrov yoki bend talabini bajara olmasa, avtomatik
serpentinga o‘tiladi (va hisobotda yoziladi).

## 9. Region decomposition

- 1-daraja: `U` bo‘laklari (orollar).
- 2-daraja: offset daraxtining shoxlanishlari (7-bo‘lim 2-band).
- 3-daraja (loop splitting, 10-bo‘lim): region kollektor tomonidagi chetga **perpendikulyar**
  chiziqlar bilan teng maydonli qismlarga kesiladi, shunda har bir qism kirish chetiga tegib turadi
  → leadlar boshqa konturni kesmaydi (hozirgi slab tamoyili, endi poligon kesish bilan).

## 10. Loop splitting (§16–18, §24)

```
need(region) = area(region)/s + lead(region)          // taxmin
k = ceil(need / (maxLoop·0.95))
repeat:
  kesish chiziqlari: har bir qism uzunligi ≈ teng bo‘lishi uchun maydonlar og‘irlik bilan
    (uzoqdagi qismga lead uzunroq → maydoni kichikroq); kesish joyi binary search (maydon bo‘yicha)
  har bir qism → Adaptive Spiral → ANIQ uzunlik = supplyPath + heatingPath + returnPath
  agar max > maxLoop:  k += 1  (yoki kesishlarni qayta muvozanatlash, 3 iteratsiya)
  agar max − min > 15 %: kesishlarni uzunlik farqiga qarab surish (balans, §24)
until hammasi ≤ maxLoop  yoki k > circuits limit  → INVALID ("circuitlar yetmaydi")
```
60 m hisobiga (§16, RULE 02): kollektor supply connectoridan to return connectorigacha
**butun** yo‘l (`supplyPath + heatingPath + returnPath`), kollektor ichidagi tik tushish
(connector → pol, 2 × ~0,5 m) ham qo‘shiladi. Taqqoslash `> maxLoop + 1e-6` bilan.

## 11. 60 m validatsiyasi

`validate.loopLength(loop)`: uzunlik aniq poliliniya uzunligi (yoylar allaqachon diskret),
`> 60,0` bo‘lsa `ERROR UFH-02 length = 63.4 m — ACTION: Split zone or regenerate route.`
APPLY tugmasi bloklanadi (§35).

## 12. Coverage algoritmi (§14, §26)

- Aniq: `covered = area( U ∩ offset(allPipes, +s/2, round) )`, `coverage = covered / area(U)`.
  Quvur o‘qidan ikki tomonga s/2 — bir xil qadamli quvurlar maydonni to‘liq qoplaydi, bo‘sh joylar
  aniq ko‘rinadi.
- Xarita (faqat ko‘rish uchun, §31): 5 sm grid, har bir katak markazi: obstacle → kulrang,
  clearance tasmasi → sariq, qoplangan → yashil, qoplanmagan → qizil.
- `coverage < coverageMin` → ERROR (SUCCESS berilmaydi, RULE 09). Default 97 %, sozlanadi.

## 13. Auto Repair algoritmi (§15, §36)

| Xato | Aniqlash | Tuzatish ketma-ketligi |
|---|---|---|
| Loop > 60 m | `validate.loopLength` | shu region: kesishlarni qayta muvozanatlash → k+1 → strategiya almashtirish |
| Uncovered area | qizil katak klasterlari (> 0,05 m²) | 1) spiral ko‘prik joyini surish, 2) ichki halqa uchun "filler" (eng ichki halqani serpentin bilan yakunlash), 3) qolgan bo‘lakni qo‘shni konturga qo‘shish, 4) yangi kontur (circuit bo‘lsa) |
| Obstacle collision | quvur ∩ offset(obstacle) ≠ ∅ | `U` ni qayta hisoblash (clearance), regionni qayta yaratish |
| Invalid bend | 3-nuqtali radius < Rmin | yoyni kattalashtirish, U-burilishni keyhole ga, bo‘lmasa serpentin |
| Invalid spacing | qo‘shni parallel segmentlar masofasi ≠ s (± 2 mm) | o‘sha regionni qayta yaratish |
| Connection | uzilgan / noto‘g‘ri connector | circuitni qayta biriktirish, lead yo‘lini qayta yotqizish |
Har bir tuzatishdan keyin **butun** validatsiya qayta ishlaydi (RULE 13); 5 aylanishdan keyin ham
xato qolsa — aniq xabar bilan INVALID, APPLY bloklanadi.

## 14. Supply/Return topologiyasi (§19, §20, §39)

Graf: `COL.supply(Cxx) → supplyPath → heatingPath[0..split] → U-turn → heatingPath[split..] → returnPath → COL.return(Cxx)`.
Tekshiruvlar: uchlar connectorlar bilan ≤ 1 mm; supply yarmi supply connectorga, return yarmi
return connectorga; bir circuitda bitta kontur; kontur o‘z-o‘zini va boshqa konturni kesmaydi
(kollektor zonasi 0,6 m dan tashqarida); leadlar boshqa kontur spiralini kesmaydi. Uzilish → ERROR.

## 15. UI interaction flow (§3–5, §25–28)

```
Kollektor bosiladi (select) ─▶ suzuvchi panel kollektor yonida:
    [ SHLANKA OLISH ]  [ AVTO ТЕПЛЫЙ ПОЛ ]  [ PROPERTIES ]  [ CIRCUITS ]

SHLANKA OLISH:  circuit tanlash (bo‘sh circuitlar ro‘yxati) → chizish rejimi supply connectordan
   CLICK=bend/davom · ENTER/2×CLICK=tugatish (return connectorga snap bo‘lsa kontur yopiladi)
   · ESC=bekor · Backspace=oxirgi nuqtani olib tashlash · burchaklar Rmin bilan yumaloqlanadi
   → ufh_loop (manual:true) — bitta tranzaksiya.

AVTO ТЕПЛЫЙ ПОЛ: circuit(lar) tanlash → "Теплый пол zonasini chizing" → poligon (CLICK… yoki
   birinchi nuqtaga bosish / ENTER yopadi; xonani bosish = xona konturini olish)
   → parametrlar dialogi (§34) → Web Worker: progress qatorlari (§40)
   → PREVIEW: plan ustida quvurlar + coverage xaritasi + panel:
        ZONE, COLLECTOR, CIRCUIT(S), PIPE, SPACING, LOOPS, UFH-xx uzunliklari ✓/✗,
        COVERAGE, WALL/OBSTACLE CLEARANCE, BEND, CONNECTION
        [ APPLY ] [ REGENERATE ] [ AUTO REPAIR ] [ CANCEL ]
   APPLY faqat validatsiya toza bo‘lsa faol.

Kontur ustiga bosish → xususiyatlar (§27); yorliq "UFH-01 · Ø16×2.0 · 57.4 m · 150 mm" (§28).
Zona tahrirlanganda (vertex, obstacle) zona `stale` bo‘ladi → [ REGENERATE ] (§32).
```

## 16. Test arxitekturasi (§42)

- `tests/ufh/geom.test.js` — offset/boolean/area/orientatsiya/epsilon.
- `tests/ufh/engine.test.js` — TEST 01–15 (quyida), har biri: 60 m, coverage, spacing,
  clearance, bend, topologiya, determinizm (ikki marta ishga tushirish → bir xil JSON).
- `tests/ufh/fuzz.test.js` — 300 ta tasodifiy (lekin **urug‘li**, deterministik) poligon +
  obstacle: hech bir kontur > 60 m, zona tashqarisiga chiqmaydi, obstaclega kirmaydi, kesishmaydi.
- `tests/ufh/ui.smoke.cjs` — Playwright: kollektor → AVTO → zona → preview → APPLY → undo → redo.

| Test | Kirish | Qabul mezoni |
|---|---|---|
| 01 | 4×3 m to‘rtburchak, s=0,15, kollektor 1 m | 1 kontur, ≤ 60 m, coverage ≥ 97 % |
| 02 | 10×8 m | ≥ 2 kontur, har biri ≤ 60 m, balans farqi ≤ 15 % |
| 03 | L-shakl | coverage ≥ 97 %, zona tashqarisi 0 |
| 04 | U-shakl | adaptive, coverage ≥ 97 % |
| 05 | 6×5 m, markazda 2×1,2 m zina | quvur zina+clearance ichiga kirmaydi, atrofi qoplangan |
| 06 | 7 burchakli nomuntazam poligon | valid |
| 07 | kollektor zonadan 12 m uzoqda | lead uzunligi 60 m ga qo‘shilgan, kerak bo‘lsa ko‘proq kontur |
| 08 | ~120 m quvur talab qiladigan zona | avtomatik ≥ 3 kontur (lead bilan), har biri ≤ 60 m |
| 09 | supply/return | har bir kontur o‘z circuitining S va R connectorida |
| 10 | 3 zona, 1 kollektor | circuitlar takrorlanmaydi, kesishma yo‘q |
| 11 | s=0,10, Rmin=0,08 | U-burilish keyhole, barcha radiuslar ≥ Rmin |
| 12 | s=0,15 | qo‘shni parallel segmentlar masofasi 0,150 ± 0,002 |
| 13 | wallClearance 0,10 | quvur tashqi cheti devordan ≥ 0,10 |
| 14 | obstacleClearance 0,10 | obstacledan ≥ 0,10 |
| 15 | ataylab 60 m dan uzun kontur | AUTO REPAIR → valid, validatsiya qayta ishlagan |

---

## 17. Bosqichlar (Phase 1–10)

Har bir bosqich alohida commit, testlar yashil bo‘lmaguncha keyingisiga o‘tilmaydi.

### PHASE 1 — Collector + Shlanka olish
- **Vazifalar:** kollektorda `circuits[]` (outlets bilan sinxron); `circuitConnectors()`;
  suzuvchi kontekst panel (4 tugma); CIRCUITS paneli (band/bo‘sh, kontur nomi); SHLANKA OLISH
  chizish rejimi (supply connectordan boshlanadi, return connectorga snap, Rmin yumaloqlash,
  ENTER/2×CLICK/ESC/Backspace); `ufh_loop` (manual) yaratish; plan va 3D da chizish; xususiyatlar.
- **Fayllar:** `core/model.js`, `engines/ufh/pipes.js`, `ui/ufhtool.js`, `ui/plan2d.js`,
  `ui/view3d.js`, `ui/panels.js`, `engines/calc.js` (loop gidravlikasi).
- **Tuzilmalar:** `collector.circuits`, `ufh_loop`.
- **Algoritmlar:** snap (connector, ortho, 45°), fillet (Rmin), uzunlik.
- **Testlar:** circuit sinxroni; manual loop uzunligi; band circuitga ikkinchi loop rad etiladi;
  undo/redo bitta qadam.
- **DoD:** kollektor bosilganda panel chiqadi; qo‘lda kontur chizilib, uzunligi, diametri,
  gidravlikasi (sarf, Δp) ko‘rinadi; undo/redo ishlaydi.

### PHASE 2 — Zone drawing
- **Vazifalar:** `ufh_zone` va `floor_obstacle` elementlari; poligon chizish (CLICK…, yopish,
  xonani bosib konturini olish); vertex tahriri (surish/qo‘shish/o‘chirish); sanitize +
  yopiqlik/self-intersection tekshiruvi; zona maydoni; stale holati.
- **Fayllar:** `core/model.js`, `engines/ufh/geom.js`, `vendor/clipper/clipper.mjs`, `ui/plan2d.js`, `ui/ufhtool.js`.
- **Testlar:** geom.test.js (offset/boolean/area), yaroqsiz poligon rad etiladi.
- **DoD:** zona va obstacle chiziladi, tahrirlanadi, saqlanadi (.zph), maydoni to‘g‘ri.

### PHASE 3 — Basic Auto UFH
- **Vazifalar:** `area.js` (U, C); to‘rtburchak/oddiy zona uchun bifilar spiral (mavjud usul
  poligon asosida); lead (kollektor → zona) yo‘li; preview (APPLY/CANCEL); bitta tranzaksiya.
- **Fayllar:** `engines/ufh/area.js`, `spiral.js`, `leads.js`, `engine.js`, `ui/ufhtool.js`.
- **Testlar:** TEST 01, 09, 12, 13.
- **DoD:** kollektor → AVTO → to‘rtburchak zona → preview → APPLY → saqlangan kontur.

### PHASE 4 — Adaptive routing
- **Vazifalar:** contour-parallel adaptive spiral (halqalar daraxti, ko‘priklar, bifilar, keyhole);
  serpentin + adaptive serpentin; region decomposition (orollar, shoxlanish).
- **Fayllar:** `spiral.js`, `serpentine.js`, `decompose.js`.
- **Testlar:** TEST 03, 04, 06, 11.
- **DoD:** L/U/nomuntazam zonalar spiral bilan to‘ladi, tanlangan strategiya ishlaydi.

### PHASE 5 — Obstacle avoidance
- **Vazifalar:** obstacle ⊕ clearance ayirish; obstacle atrofida halqalar; mavjud qo‘lda
  chizilgan quvurlarni to‘siq sifatida hisobga olish (§29).
- **Testlar:** TEST 05, 14; fuzz (obstacle kesishmasi 0).
- **DoD:** quvur obstaclega kirmaydi, atrofida katta bo‘sh joy qolmaydi.

### PHASE 6 — 60 m loop splitting
- **Vazifalar:** teng maydonli perpendikulyar kesish, lead og‘irligi, iterativ k, balans,
  circuitlarni avtomatik ajratish; "Avto issiq pol" (xonalar) shu dvigatelga ulanadi.
- **Testlar:** TEST 02, 07, 08, 10.
- **DoD:** hech bir kontur 60 m dan oshmaydi; farq ≤ 15 % (geometriya imkon bersa).

### PHASE 7 — Coverage validation
- **Vazifalar:** aniq coverage, xarita overlay, threshold sozlamasi, hard validation (§35) va
  APPLY blokirovkasi, xato xabarlari.
- **Testlar:** coverage < threshold → APPLY bloklangan; har bir xato turi uchun xabar.
- **DoD:** preview da yashil/qizil/kulrang/sariq xarita va aniq foiz.

### PHASE 8 — Auto Repair
- **Vazifalar:** 13-bo‘lim jadvali; takroriy validatsiya; natija hisobi ("3 ta xato tuzatildi").
- **Testlar:** TEST 15 + har bir xato turiga sun'iy holat.
- **DoD:** tuzatib bo‘ladigan holatlar valid bo‘ladi, bo‘lmaydiganlarga aniq sabab.

### PHASE 9 — Hydraulic integration
- **Vazifalar:** calc `ufh_loop` lardan: uzunlik, ichki diametr, sarf (zona yukidan), tezlik,
  Δp, balanslash (rotametr sozlamasi); kontur xususiyatlarida; spetsifikatsiya (BOM) va
  chizmalar (yorliq, sxema) saqlangan konturlardan.
- **Testlar:** integratsiya: sarf yig‘indisi = kollektor sarfi; Δp monoton uzunlik bilan.
- **DoD:** APPLY dan keyin gidravlika avtomatik qayta hisoblanadi.

### PHASE 10 — Production QA
- **Vazifalar:** Web Worker + progress (§40), katta zonalarda tezlik (< 2 s), fuzz 300, UI smoke,
  undo/redo, saqlash/ochish, hujjat (yordam), eski xona-rejimidan ko‘chirish.
- **DoD:** 43-bo‘limdagi barcha katakchalar ✓.

---

## 18. Topshiriq bandlari → bosqich (hech narsa tashlab ketilmaydi)

| § | Talab | Bosqich |
|---|---|---|
| 1–3 | Workflow, collector BIM, kontekst panel | 1 |
| 4 | Shlanka olish (qo‘lda) | 1 |
| 5–6 | Avto: circuit → zona poligon → preview | 2–3 |
| 7, 9 | Obstacle + clearance | 5 |
| 8, 10 | Wall clearance, spacing (sozlanadigan) | 3 |
| 11–13 | Pipeline, strategiyalar, referens ko‘rinishi | 3–4 |
| 14, 26 | Coverage + xarita | 7 |
| 15, 36 | Auto Repair | 8 |
| 16–18 | 60 m, geometrik splitting | 6 |
| 19–20 | Supply/return, cross-connection yo‘q | 3, 7 |
| 21 | Bend radius | 1, 4 |
| 22 | Crossingdan qochish | 3–6 |
| 23–24 | Prioritet, balans | 6 |
| 25, 27–28 | Preview, kontur ma'lumoti, yorliq | 3, 7 |
| 29 | Manual + auto birga | 5 |
| 30–31 | Geometriya dvigateli, grid emas | 2, 4 |
| 32 | Zona/obstacle tahriri + regenerate | 2 |
| 33 | Gidravlika | 9 |
| 34 | Parametrlar dialogi | 3 |
| 35 | Hard validation | 7 |
| 37 | Multi-zone | 6 |
| 38–39 | Data model, topologiya | 1–3 |
| 40 | Worker + progress | 10 |
| 41 | Undo/redo | 1, 3 |
| 42–43 | Testlar, acceptance | har bosqich, 10 |

---

## 19. Amalga oshirish holati (implementation status)

| Bosqich | Holat | Fayllar |
|---|---|---|
| 1. Collector + Shlanka olish | ✅ kollektor menyusi (4 tugma), CIRCUITS dialog/panel, qo‘lda quvur (supply → nuqtalar → return, Rmin yoy, Backspace/Esc/Enter), `ufh_loop` (manual) | `ui/ufhtool.js`, `core/ufhmodel.js`, `ui/plan2d.js`, `ui/panels.js` |
| 2. Zone drawing | ✅ zona poligoni (bosish / birinchi nuqta / Enter, Shift+bosish = xona konturi), to‘siq (pol) poligoni 10 turdagi, grip bilan tahrir, zona `stale` → REGENERATE; ⚠ yangi vertex qo‘shish/o‘chirish hali yo‘q (mavjudlarini surish mumkin) | `ui/plan2d.js`, `core/store.js` (kaskad o‘chirish) |
| 3. Basic Auto UFH | ✅ usable area (Clipper, round clearance), preview, APPLY (bitta undo) | `engines/ufh/layout.js`, `engine.js` |
| 4. Adaptive routing | ✅ contour-parallel spiral (klassik burchak o‘tishi, 75° jog, spine, keyhole), serpentin, strip decomposition, slit (teshikli zona) | `engines/ufh/spiral.js`, `loop.js` |
| 5. Obstacle avoidance | ✅ obstacle ⊕ clearance ayiriladi, mavjud quvurlar (§29) to‘siq sifatida; ⚠ murakkab to‘siqlarda ba’zan egilish/qamrov xatosi qoladi → APPLY bloklanadi, AUTO REPAIR boshqa variantlarni sinaydi | `layout.js`, `spiral.js` |
| 6. 60 m splitting | ✅ strip ulushlari iterativ balanslash, eni toq·s ga snap, n avtomatik oshiriladi, lead + kollektor tik (2×0.4 m) hisobga | `layout.js` |
| 7. Coverage validation | ✅ aniq qamrov (Clipper), xarita (yashil/qizil/kulrang/sariq), min qamrov % va maks. bo‘sh joy m² sozlanadi, hard validation | `coverage.js`, `validate.js` |
| 8. Auto Repair | ✅ variantlar qidiruvi: kirish tomoni (3), +1 kontur, boshqa strategiya; eng kam og‘irlikdagi xato tanlanadi; ⚠ lokal (nuqtaviy) tuzatishlar hali yo‘q | `engine.js` |
| 9. Hydraulic integration | ✅ har kontur: Q (zona talabi/quvvati, isitish uzunligi ulushi), sarf, tezlik, Δp (Darcy + burilishlar ζ); kollektor iste’molchisi; BOM (quvur turi bo‘yicha m, qisqich, izolyatsiya, demfer lenta); validatsiya R25–R28 | `engines/calc.js`, `bom.js`, `validation.js` |
| 10. Production QA | ✅ Web Worker + progress, deterministik, testlar (`tests/ufh-engine.test.js`: geom, loop, TEST 01–15, determinizm), E2E UI skripti; ⚠ fuzz-300 hali yo‘q | `workers/ufh.worker.js` |

**Katta zona (> 12 kontur).** Dvigatel avval sig‘imni tekshiradi: taxminiy kontur soni
(maydon / qadam + lead + tik, 60 m × 0.92 ga) kollektordagi bo‘sh chiqishdan ko‘p bo‘lsa, 60 m dan uzun
konturlar chizilmaydi — `UFH-CIRC` xatosi (kerak / bo‘sh soni bilan) qaytadi. Preview panelida
**«Kollektorlarga bo‘lish»** tugmasi: zona uzun o‘q bo‘yicha sig‘im ulushida kesiladi (birinchi qism —
mavjud kollektor tomoni), har qo‘shimcha qism uchun yangi kollektor (12 chiqish) qismning **uzun
tashqi devori** o‘rtasiga, chiqishlari xonaga qaragan holda qo‘yiladi. Hamma qismlar ketma-ket
hisoblanadi, bitta APPLY (bitta undo) bilan saqlanadi.

**Tuzatishlar (maydon hisoboti, 149 m² xona).** Kollektor zona uchida, kirish devoridan uzoqda
tursa, fan burchaklari zona burchagi bissektrisasida (eng tashqi lead devor bo‘ylab burchakka, qolganlari
ichida — isitilmagan uchburchak yo‘q), portlar nurlar yo‘nalishi tartibida beriladi (kesishish yo‘q).
Qisqa S-burilishlar (lead + spiral jog) uzunroq diagonal bilan almashtiriladi — ikkala yoy to‘liq
radiusda. Guruhlar orasidagi tirqish ≤ s/2 suriladi, chekka strip ham toq·s bo‘ladi (markazda bo‘sh
chiziq qolmaydi). Bo‘sh strip (daraxt < 1 m) kontur bo‘lmaydi.

**Kollektor zona ichida (ichki devorda).** Kollektor chiqishlar qatori bo'yicha zona ikkiga kesiladi
(kesimda clearance yo'q, quvurlar kesimdan s/2 da — ikki tomon orasida aniq s). Har qism o'z
chiqishlari bilan, kollektor uning chetida turgan oddiy holat kabi hisoblanadi; har qism uchun eng
yaxshi kirish tomoni (0/1/2) alohida tanlanadi.

**Strip enlari.** Hamma strip s ning toq karrasi bo'lishi kerak (aks holda spiral markazida bo'sh
chiziq qoladi): chekka strip qoldig'i guruhdagi tirqishlarga (≤ 1,3 s), kollektor yo'lagiga yoki
tashqi devor clearance'iga (≤ 0,65 s) taqsimlanadi; toq kombinatsiyalar maydon bo'yicha qidiriladi.
Zona keskin kengaysa/torayса (yo'lak → xona) birinchi strip o'sha joyda tugaydigan variant ham
sinaladi.

**Egilishni mahalliy tuzatish.** Tayyor quvurda radius < Rmin bo'lgan har joy ikki urinma va Rmin
yoy bilan qayta egiladi; kvadrat U-burilish yarim aylana bilan almashtiriladi.

**Xonalar bo'yicha qatlash (loyihachi shablonlaridan).** Zona bir necha xonani qamrasa:
1. Kontur o'z xonasidan chiqmaydi; devordan faqat ikki lead quvuri o'tadi va faqat **eshikdan**.
2. Lead'lar kollektordan zich to'plam (tranzit, 100 mm) bo'lib, oraliq xonalarning devori bo'ylab va
   eshiklari orqali o'z xonasigacha boradi (eshik kengligida har lead'ga joy ajratiladi).
3. Har xona alohida qatlanadi: eshik uning "kollektori"; strip/spirallar shu eshikdan.
4. Kollektor xonasi o'z chiqishlari bilan isitiladi; tranzit to'plamlar uning isitish maydonidan
   chiqarib tashlanadi (to'plam o'zi isitadi); tekshiruvda tranzit (fan kabi) oraliq talabidan ozod.
5. Yo'l: xonalar grafi (eshiklar) bo'yicha eng qisqa yo'l (Dijkstra); eshiksiz qo'shni xonalar uchun
   devor orqali "virtual o'tish" — faqat boshqa yo'l bo'lmasa, ogohlantirish bilan.
6. Kollektor xonasida lead'lar ichma-ich "L" bo'lib devor bo'ylab ketadi (uzoq strip lead'i eng
   tashqarida), birinchi strip to'plam ostida.

Egilish radiusi siyosati: quvur jadvali 5×OD (16 mm → 80 mm) beradi; tekshiruv 15 % tolerantlik bilan
(≥ 68 mm, prujina/yo‘naltirgich bilan egish), dvigatel esa 7.5 % bilan loyihalaydi (zaxira). Hammasi
bitta joyda (`validate.js UFH_RULES.bendTol`) va preview panelida ko‘rsatiladi.
