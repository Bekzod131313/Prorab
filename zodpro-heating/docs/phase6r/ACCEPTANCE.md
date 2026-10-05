# 6-bosqich QAYTA OCHILISHI — lead-aware spiral / terminal closure (holat: QABUL KUTILMOQDA)

Foydalanuvchi qarori (2026-10-05): 7B natijasi Phase 6 geometriyasi reference'ga mos emasligini ko'rsatdi →
Phase 6 qayta ochildi. 7A va 7B kodi o'zgartirilmagan. Eski baseline: `06130b3`
(`docs/phase6/ACCEPTANCE.md`, o'zgarmagan).

## O'zgarishlar (Phase 6 fayllari)

| Fayl | Eski SHA-256 | Yangi SHA-256 | Nima |
|---|---|---|---|
| `obstaclespiral.js` | `fad3bfe64446…` | `3f66d5e158ec…` | SIDE residual closure: ρ faqat supply'ning birinchi va return'ning oxirgi aylanmasi orasida, X tomonda (yakuniy o'tish yon polosani qoplaydi, keyin qaytadi); ρ = parallel tomonlar orasidagi har bir qoldiq en mod s (MIN ≤ ρ < s) |
| `closure.js` | `6ca1dbacb6a9…` | `b57168f5ab73…` | nomzodlar tartibi: limitlar → eng katta patch → (limit ichida) side closure markaziydan oldin → uncovered → residual → uzunlik → egilish; side closure har bir regionda sinaladi |
| `decompose.js` | `3ee5f555a254…` | `5a7090365c47…` | notched region (to'rtburchak ∩ maydon, notch atrofida bitta uzluksiz spiral); split har bir regioni o'z maydonining ≥ ENGINEERING_FINAL_COVERAGE ini qoplasa qabul |
| `criteria.js` | `ef07d88b6766…` | `53f1fb1dd854…` | KNOWN_LIMITATIONS dan L4b / U4b olib tashlandi (endi valid) |
| `leadaware.js` (yangi) | — | `2047c55f2c4f…` | lead-aware planner: kirish (nuqta), LEAD_CLEARANCE (leadSpacing), 60 m uchun aniq lead byudjeti (transfer + drop + xonadagi yo'l — input), endpoint + yo'nalish, entry / exit zonalari, DOOR_TRANSITION_ZONE, lead mosligi, NO_VALID_SPIRAL |

O'zgarmagan: `geom.js`, `spiralgen.js`, `rawcheck.js`, `loopplanner.js`, `loopproof.js`, `partitionsearch.js`.
Freeze testi yangi 11 fayl hash'iga yangilangan (`tests/ufh-phase6-freeze.test.js`).

## Eski / yangi (bir xil o'lchov: `tools/phase6r-eval.mjs`, `evidence/old-baseline.json` → `evidence/new-phase6.json`)

Reference holatlari (usable maydon to'g'ridan-to'g'ri):

| Holat | Kontur | Coverage eski → yangi | Eng katta gap eski → yangi, m² | Terminal closure eski → yangi | Min R eski → yangi, mm | Heating eski → yangi, m | Reference eski → yangi |
|---|---|---|---|---|---|---|---|
| right-residual 3.15×2.33 s0.2 | L1 | 97.6 → 97.4 % | 0.000 → 0.000 | centre → top | 90 → 100 | 36.08 → 36.32 | MISMATCH → OK |
| right-residual 2.95×2.33 s0.2 | L1 | 97.4 → 97.2 % | 0.000 → 0.000 | centre → top | 90 → 100 | 33.68 → 33.92 | MISMATCH → OK |
| right-residual 3.37×2.0 s0.2 | L1 | 97.4 → 97.5 % | 0.000 → 0.000 | — (yo'q) → right | 100 → 100 | 32.53 → 32.77 | NA → OK |
| exact 3.2×2.4 s0.2 | L1 | 97.3 → 97.3 % | 0.000 → 0.000 | — (yo'q) → — (yo'q) | 100 → 100 | 37.06 → 37.06 | NA → NA |
| residual 2.62×1.9 s0.15 | L1 | 96.1 → 95.4 % | 0.000 → 0.000 | — (yo'q) → bottom | 75 → 75 | 31.57 → 32.07 | NA → OK |

| Xona | Konturlar eski → yangi | Coverage eski | Coverage yangi | Gap max eski → yangi | Min R eski → yangi | Heating jami eski → yangi | Reference eski | Reference yangi |
|---|---|---|---|---|---|---|---|---|
| H | 3 → 3 | 93.4, 97.4, 91.6 | 91.4, 95.1, 90.9 | 0.000 → 0.000 | 75 → 100 | 43.73 → 46.05 | MISMATCH, MISMATCH, MISMATCH | OK, NA, OK |
| LR | 3 → 3 | 98.1, 94.1, 97.3 | 98.1, 93.9, 97.3 | 0.000 → 0.000 | 80 → 80 | 92.38 → 92.39 | MISMATCH, MISMATCH, MISMATCH | MISMATCH, OK, OK |
| BR1 | 3 → 2 | 96.2, 96.1, 88.3 | 98.3, 96.9 | 0.000 → 0.000 | 100 → 80 | 67.81 → 74.44 | NA, NA, NA | MISMATCH, MISMATCH |
| BA | 2 → 1 | 84.1, 88.2 | 91.3 | 0.000 → 0.024 | 75 → 75 | 22.26 → 23.62 | NA, NA | OK |
| BR2 | 1 → 1 | 96.0 | 96.0 | 0.215 → 0.215 | 100 → 100 | 57.59 → 57.59 | NA | NA |

Kvartira hash: eski `3e5932c0bcc59ffc…` → yangi `04c45ac354bc229e…` (7B pipeline'idagi Phase 6 chaqiruvi bilan);
lead-aware: `06b245a35dcfac23…`.

Reference mos kelmagan konturlar va sababi (yashirilmaydi):
- LR.L1 (3.80 × 2.242): qisqa o'q bo'yicha qoldiq 0.042 m < MIN_RESIDUAL 0.10 m, uzun o'q bo'yicha 0 → side
  residual geometrik jihatdan mumkin emas; yagona valid closure — markaziy.
- BR1.L1 (4.18 × 1.84): qisqa o'q qoldig'i 0.04 m < 0.10 m; uzun o'qdagi side varianti gap 0.596 m² (limitdan tashqari).
- BR1.L2 (notched): side varianti 0.390 m² gap qoldiradi, markaziy 0.000 → "katta polosa qoldirmaslik" qoidasi bo'yicha markaziy.

## Lead-aware kvartira (`evidence/lead-aware-apartment.json`)

7B transit koridori → U′ va har bir xona kirishigacha o'lchangan transfer (input) → `planLeadAware` →
7B ning o'zgarmagan routing kodi yangi uchlarga ulaydi. Kontur sonlari barqaror: H 3, LR 3, BR1 2, BA 1, BR2 2 (= 11).

| Ko'rsatkich | Eski Phase 6 (7B hisobotidan) | Yangi lead-aware |
|---|---|---|
| Lead ↔ lead kesishmalari | 42 | 19 |
| Lead ↔ heating to'qnashuvi (kontur) | 6 | 5 |
| 60 m (real lead + 2 × drop) | BR2.L1 74.05 m — FAIL | hammasi ≤ 60 (max 58.40, BR2.L2) — PASS |
| Topologiya | 12/12 VALID | 11/11 VALID |
| Phase 6 lead mosligi (o'z modeli) | — | LR, BR1, BR2 LEAD_AWARE_VALID; H, BA LEAD_INCOMPATIBLE |

## PASS / FAIL

| Shart | Natija |
|---|---|
| Eski Phase 1–5 testlari | PASS (to'liq regression 208/211: `evidence/regression.log`; 3 ta FAIL faqat 7B testlari, pastda) |
| Eski Phase 6 testlari | PASS — 4 ta test yangi xatti-harakatga yangilangan, printsipi saqlangan: closure terminal (side tarmog'i), C10 (markaziy closure hali ham mumkin emas, side valid), regions L4b/U4b (cheklov hal bo'ldi), U1 (1 notched region), U5 (kam region) |
| Reference regression (right-side residual) | PASS (`tests/ufh-phase6r.test.js` 6R-1, 6R-2) |
| Residual faqat terminal closure'da, MAX_RESIDUAL_RINGS = 1 | PASS |
| Multi-loop (overlap yo'q, har bir kontur valid) | PASS (6R-5) |
| Obstacle / notch (uzluksiz spiral) | PASS (6R-8; kvartira BA: 84.1 % → 91.3 %) |
| No serpentine / NO_VALID_SPIRAL | PASS (6R-9) |
| 60 m (lead-aware, real byudjet) | PASS (6R-7; kvartira max 58.40) |
| Determinizm | PASS (6R-10) |
| Reference match (kvartira, hammasi) | FAIL — LR.L1, BR1.L1, BR1.L2 (sabablari yuqorida) |
| Lead compatibility (7B routing bilan) | FAIL — 19 kesishma, 5 to'qnashuv (H kollektor fani, LR) |
| 7B testlari | 3 ta FAIL (7B-C, 7B-J, 7B-K): eski muzlatilgan Phase 6 natijasini kodlagan (BA.L1 < 85 %, markaziy closure) — 7B kodiga tegilmadi; 7B yangi Phase 6 ustida qayta qabul qilinadi |

Virtual chiqish yo'q. Serpantin yo'q. Yashirin relaxation yo'q.
