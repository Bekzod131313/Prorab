# ZODPRO Heating BIM

Faqat **isitish tizimlarini loyihalash** uchun Revit uslubidagi BIM/CAD/muhandislik dasturi.
Brauzerda ishlaydi, o‘rnatish shart emas, internet bo‘lmasa ham ishlaydi.

## Ishga tushirish

```bash
cd zodpro-heating
python3 -m http.server 8080      # yoki istalgan statik server
# brauzerda: http://localhost:8080
```

ES modullar `file://` orqali ochilmaydi — statik server kerak (GitHub Pages ham bo‘ladi).

Testlar (Node ≥ 20):

```bash
npm test
```

## Nima bor

- **2D reja (CAD + BIM):** devor, xona (avto aniqlash), deraza, eshik, radiator, ta’minot/qaytish quvuri
  (konnektorga yopishish, troynik), stoyak, kollektor, pol isitish kollektori, qozon, nasos, termostat,
  to‘siqlar; chiziq/polilinya/aylana/yoy/shtrix/matn/o‘lcham; ko‘chirish, nusxa, burish, oyna, massiv,
  offset, trim, extend, bo‘lish, fillet; snap, orto, to‘r, qatlamlar, grip, buyruq qatori (W, RAD, PS…).
- **Hisob zanjiri (avtomatik):** issiqlik yo‘qotish → radiator tanlash / pol isitish → tarmoq grafi →
  sarf → diametr → gidravlika → balanslash → nasos → qozon → kengaytirish baki → BOM → smeta → tekshiruv.
- **3D:** orbit, kesik ko‘rinish, karkas, shaffof, izolyatsiya, o‘lchash, oqim strelkalari.
- **Chizmalar:** prinsipial sxema (haqiqiy topologiyadan), stoyak sxemasi, aksonometriya, kesimlar,
  varaqlar (A-001, H-001…) shtamp va reviziyalar bilan, PDF.
- **Jadvallar:** radiatorlar, quvurlar, gidravlika, balanslash, uskunalar, pol isitish, material spetsifikatsiyasi,
  smeta (UZS/USD/RUB/EUR/TJS), Excel/CSV.
- **Eksport/Import:** `.zph` (versiyali, migratsiya), DXF, IFC4, SVG, PNG, Excel, CSV; DXF import, rasm/PDF podloshka
  va kalibrlash, mahsulot CSV import.
- **Boshqalar:** nazorat paneli (OK/WARNING/ERROR/CRITICAL), to‘qnashuvlar, o‘rnatish rejimi va As-Built,
  QR kod, muammolar, AI-yordamchi (o‘zbek/rus/ingliz buyruqlar), SAP/ombor taqchilligi, Telegram, tijorat taklifi,
  plaginlar, rollar, uz/ru/en, yorug‘/qorong‘i mavzu, avto-saqlash va tiklash.

Talablar bo‘yicha to‘liq holat: [docs/REQUIREMENTS_MATRIX.md](docs/REQUIREMENTS_MATRIX.md) ·
reja: [docs/BACKLOG.md](docs/BACKLOG.md) · arxitektura: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

> Muhim: mahsulot katalogi va iqlim qiymatlari namunaviy. Hujjat chiqarishdan oldin ishlab chiqaruvchi
> ma’lumotlari (Kutubxona → Import) va amaldagi standart (KMK/SP) bilan tekshiring.
