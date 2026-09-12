# Otopleniya buyurtma tizimi (Telegram mini-app)

Har bir usta brigadasi o'zining Telegram guruhida botdan foydalanadi: tovar
katalogidan tanlab savatga yig'adi, buyurtmani bir **obyektga** (qurilish/
xizmat manzili) bog'laydi va "Buyurtma berish"ni bosadi. Shu zahoti:

- tanlangan tovarlar (artikul, nomi, narx, miqdor, summa) **Excel fayl**
  ko'rinishida brigada guruhiga yuboriladi;
- buyurtma summasi avtomatik o'sha **obyektning qarziga** yoziladi (onlayn
  to'lov tizimi yo'q — barcha buyurtmalar qarzga ketadi, to'lovni operator
  keyinroq admin panelda qayd etadi).

Ilova to'liq: katalog, savat, buyurtmalar tarixi (nakladnoy/PDF bilan),
obyektlar va qarzdorlik boshqaruvi, profil, bildirishnomalar. Bu modul asosiy
Prorab ilovasidan (loyiha moliyasi) mustaqil, alohida bot va alohida mini-app
sifatida ishlaydi, lekin bitta GitHub repozitoriyda saqlanadi.

## Arxitektura

- **Frontend**: `public/index.html` — Telegram Mini App (5 bo'lim: Asosiy,
  Buyurtmalarim, Korzina, Obyektlar, Profil + Bildirishnomalar), `public/admin.html`
  — operator paneli (tovarlar, buyurtma statusi, to'lovlar).
- **Backend**: `functions/api/*.js` — Cloudflare Pages Functions.
- **Baza**: Supabase (Postgres). `schema.sql` faylida jadvallar.
- **Bot**: Telegram Bot API, webhook orqali (`functions/api/bot.js`).
- **Autentifikatsiya**: alohida login/parol yo'q — foydalanuvchi Telegram
  Mini App `initData` imzosi orqali tanilinadi (`telegram_id`), bu hech qachon
  soxtalashtirib bo'lmaydi, chunki server tomonda bot tokeni bilan tekshiriladi.

### Jadvallar (schema.sql)

| Jadval | Nima uchun |
|---|---|
| `hs_brigades` | Brigada = bitta guruh hisobi (nomi, login, parol xeshi, guruh `chat_id`) |
| `hs_users` | Har bir usta profili (ism, telefon, kompaniya, sozlamalar) |
| `hs_addresses` | Foydalanuvchining saqlangan manzillari |
| `hs_products` | Tovar katalogi (+ `aksiya_narx`, `ommabop` belgilari) |
| `hs_objects` | Obyektlar (qurilish/xizmat manzillari), brigadaga bog'liq |
| `hs_orders` | Buyurtmalar (`order_no`, `status`, `object_id` bilan) |
| `hs_debt_entries` | Qarzdorlik tarixi: har buyurtma = `qarz`, har to'lov = `tolov` |
| `hs_notifications` | Bildirishnomalar tarixi (Telegram xabari bilan birga yoziladi) |

## 1) Telegram bot yaratish

1. Telegram'da [@BotFather](https://t.me/BotFather) bilan yozishing.
2. `/newbot` — nomi va username bering. Sizga **BOT_TOKEN** beriladi, saqlab qo'ying.

## 2) Supabase sozlash

1. https://supabase.com — yangi loyiha yarating (yoki mavjudidan foydalaning).
2. **SQL Editor** bo'limida `schema.sql` faylidagi kodni to'liq ishga tushiring
   (v1'ni oldin ishga tushirgan bo'lsangiz ham xavfsiz — barcha buyruqlar
   `IF NOT EXISTS` bilan yozilgan, mavjud ma'lumotlar o'chmaydi).
3. **Project Settings → API** bo'limidan quyidagilarni oling:
   - `Project URL` → `SUPABASE_URL`
   - `anon public` kalit → `SUPABASE_ANON_KEY` (mini-app uchun, ochiq)
   - `service_role` kalit → `SUPABASE_SERVICE_ROLE_KEY` (**maxfiy**, faqat serverda)

## 3) Cloudflare Pages'ga joylash

1. Cloudflare Dashboard → **Pages** → **Create a project** → GitHub repo
   (`bekzod131313/prorab`) ni ulang.
2. **Root directory**: `heating-orders` deb ko'rsating (muhim — shu papka
   alohida loyiha bo'lib deploy qilinadi).
3. **Build output directory**: `public`
4. **Build command**: bo'sh qoldiring (build kerak emas).
5. **Environment variables** (Settings → Environment variables) qo'shing:
   - `BOT_TOKEN` — BotFather'dan olingan token
   - `BOT_USERNAME` — botning username'i, `@` belgisisiz (masalan `mening_otoplenia_bot`)
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `ADMIN_TOKEN` — admin panel uchun o'zingiz o'ylab topgan maxfiy parol
   - `ADMIN_CHAT_ID` — (ixtiyoriy) operatorning shaxsiy Telegram chat ID'si —
     Profil → "Operatorga yozish" orqali kelgan xabarlar shu yerga tushadi.
     Chat ID'ni bilish uchun [@userinfobot](https://t.me/userinfobot)'ga yozing.
   - `MINIAPP_URL` — deploy bo'lgandan keyingi to'liq manzil, masalan
     `https://heating-orders.pages.dev` (oxirida `/` bo'lmasin)
   - `WEBHOOK_SECRET` — (ixtiyoriy, tavsiya etiladi) tasodifiy maxfiy satr —
     webhook'ni faqat Telegram'dan kelayotganini tekshirish uchun
6. Deploy qiling. Deploydan keyingi domenni `MINIAPP_URL` ga qo'ying (agar
   oldindan bilmagan bo'lsangiz, deploydan keyin qayta kiriting va qayta deploy qiling).

## 4) Frontend konfiguratsiyasi

`public/index.html` faylining boshida:

```js
window.CONFIG = {
  SUPABASE_URL: 'https://YOUR-PROJECT.supabase.co',
  SUPABASE_ANON_KEY: 'YOUR-ANON-KEY'
};
```

shu joyga haqiqiy `SUPABASE_URL` va `SUPABASE_ANON_KEY` (anon, service_role
emas!) qiymatlarini yozing va commit/push qiling (yoki Cloudflare Pages'da
qayta deploy qiling).

## 5) Telegram webhook'ni ulash

Brauzer yoki terminalda (BOT_TOKEN, MINIAPP_URL, WEBHOOK_SECRET'ni almashtiring):

```bash
curl -X POST "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url":"<MINIAPP_URL>/api/bot","secret_token":"<WEBHOOK_SECRET>"}'
```

Javobda `"ok":true` chiqishi kerak.

### Baza yangilangan bo'lsin

Eng oson yo'li: **`heating-orders/baza.sql`** faylini to'liq nusxalab,
Supabase → SQL Editor → New query → Run. Unda hamma o'zgarish bor
(obyekt lokatsiyasi, brigada login/paroli, katalog daraxti, rasmlar) va
qayta ishga tushirilsa ham xato bermaydi.

Pastdagi `migration.sql` va `kategoriyalar.sql` — o'sha faylning
bo'laklari, alohida kerak bo'lsa ishlatiladi.

SQL haqiqiy PostgreSQL'da sinaladi (`pgserver`): toza bazada ham, allaqachon
qisman bajarilgan bazada ham xatosiz o'tadi va ikki marta ishga tushirilsa
yozuvlarni takrorlamaydi.

`baza.sql` qo'lda yozilmaydi — `tools/baza-yig.py` uni `migration.sql` va
`kategoriyalar.sql` dan yig'adi va qismlardagi birorta `alter`/`create`
tushib qolmaganini tekshiradi (ilgari shunday bir buyruq yo'qolib,
"Could not find the 'rasm' column" xatosiga olib kelgan edi).

Kod yangilanganda bazaga ham yangi ustunlar kerak bo'ladi. `migration.sql`
faylini butunlay nusxalab, Supabase → **SQL Editor** → **Run** qiling
(qayta ishga tushirsangiz ham xato bermaydi).

So'ng `kategoriyalar.sql` ni ham ishga tushiring — u katalog daraxtini
(22 kategoriya, 66 brend) bazaga yozadi.

Kategoriya rasmlari uchun Supabase → **Storage** → **New bucket** →
nomi `katalog`, **Public** belgisi yoqilgan holda yarating. Nomni boshqacha
yozgan bo'lsangiz (`Katalog`, `KATALOG`) ham ishlaydi — kod katta-kichik
harfga qaramay topadi; butunlay boshqa nom bo'lsa `STORAGE_BUCKET`
env o'zgaruvchisiga yozing.

**Muhim:** ilovadagi kategoriyalar ikki manbadan yig'iladi — `hs_categories`
jadvali va tovarlarning o'zi. Jadval tovarlardan mustaqil, shuning uchun
tovar hali yuklanmagan bo'lsa ham kategoriyalar ro'yxati ko'rinib turadi.
Kategoriyani o'zgartirish/qo'shish kerak bo'lsa, shu jadvalni tahrirlang.

Hammasi joyidami yoki yo'qmi — brauzerda **`<MINIAPP_URL>/api/health`** ni
oching: qaysi ustun yetishmayotgani va qaysi sozlama qo'yilmagani ko'rinadi.

## 6) Foydalanish

Brigadani **ustaning o'zi** mini-appda yaratadi. Faqat bitta narsa sizda
qoladi: qaysi guruhga buyurtma tushishini belgilash.

### Usta nima qiladi

1. Botni ochadi, `/start` bosadi (yoki yozuv maydoni yonidagi **«Ochish»**
   tugmasini bosadi) → mini-app ochiladi.
2. **«Ro'yxatdan o'tish»** ni tanlab, brigadasiga nom + login + parol o'ylab
   topadi.
3. Botni ustalar guruhiga qo'shadi va sizga login'ini yuboradi.
4. Siz guruhni bog'lagandan keyin: **Obyektlar** bo'limida obyekt yaratadi,
   Asosiy sahifadan tovar tanlab savatga qo'shadi, Korzina'da obyektni tanlab
   "Buyurtmani rasmiylashtirish"ni bosadi.

> **Bitta login butun brigada uchun.** Usta ham, shogirdlari ham o'z Telegram
> akkauntidan shu login bilan kiradi; buyurtma bir xil brigada nomidan, bir xil
> guruhga tushadi.

### Operator (siz) nima qiladi

Hammasi botdan — admin panel shart emas.

| Buyruq | Qayerda | Nima qiladi |
|---|---|---|
| `/admin` | shaxsiy chatda | Admin panelni bir bosishda ochadi (parol so'ramaydi) |
| `/sozla` | bot bilan shaxsiy chatda | «Ochish» tugmasi va bot buyruqlarini o'rnatadi (bir marta) |
| `/brigadalar` | shaxsiy chatda | Guruh kutayotgan va bog'langan brigadalar ro'yxati |
| `/bogla <login>` | brigada guruhida | Shu guruhni o'sha loginli brigadaga bog'laydi |
| `/bogla` | brigada guruhida | Guruh hozir qaysi brigadaga bog'langanini ko'rsatadi |
| `/id` | istalgan joyda | Chat ID raqamini chiqaradi |
| `/rasm` | shaxsiy chatda | Qaysi kategoriyada rasm yo'qligini ko'rsatadi |
| rasm + izoh | shaxsiy chatda | Rasmni kategoriyaga biriktiradi |

Bu buyruqlar faqat `ADMIN_CHAT_ID` da ko'rsatilgan Telegram ID uchun ishlaydi
(vergul bilan bir nechta ID yozsa ham bo'ladi). Boshqa hech kim guruhni
bog'lay olmaydi.

Yangi brigada ro'yxatdan o'tganda sizga bot avtomatik xabar yuboradi —
brigada nomi, login va tayyor `/bogla <login>` buyrug'i bilan.

**Kategoriya rasmlari.** Rasmni botga (shaxsiy chatda) tashlang va izohiga
kategoriya nomini yozing:

- `AKSESSUAR` — kategoriya rasmi
- `ARMATURA GIACOMINI` — brend rasmi

Bot rasmni Supabase Storage'ga yuklaydi va ilovada darrov ko'rinadi.
Brend nomi bitta kategoriyada bo'lsa, kategoriyasiz yozsa ham bo'ladi
(`GIACOMINI`); bir nechtasida bo'lsa (DANFOSS, FERRO) kategoriyani ham
yozish shart. Qaysi biri rasmsiz qolganini `/rasm` ko'rsatadi.

### Nima uchun bu xavfsiz

Guruh bog'lanmagan brigada **buyurtma berolmaydi** — ilovada sariq
ogohlantirish chiqadi va "Buyurtmani rasmiylashtirish" tugmasi o'chiq turadi.
Ya'ni begona odam ro'yxatdan o'tsa ham, na sizning guruhingizga fayl
yuboradi, na haqiqiy qarzdorlik yozadi.

### Qarzni yopish

Mijoz naqd/bank orqali offline to'laydi, operator buni admin panelda
("Obyektlar / To'lovlar" bo'limi) qayd etadi — qarzdorlik avtomatik kamayadi
va mijozga xabar boradi.

> Parol bazada ochiq saqlanmaydi — har brigadaga alohida tasodifiy salt bilan
> PBKDF2-SHA256 (100 000 iteratsiya) xeshi yoziladi.

## 7) Admin panel (`admin.html`)

Eng oson yo'li — botga **`/admin`** deb yozish: u tugmali havola beradi,
bosasiz va parol so'ramasdan kiradi (kalit havolaning `#` qismida ketadi,
serverga yuborilmaydi va brauzerda saqlanib qoladi — keyingi safar
to'g'ridan-to'g'ri ochiladi).

Qo'lda: `https://<MINIAPP_URL>/admin.html` sahifasini ochib, `ADMIN_TOKEN`ni
kiritasiz. Telefonda ham ishlaydi. Besh bo'lim:

> **Valyuta.** Narxlar **dollarda** saqlanadi va hamma joyda `$` bilan
> ko'rsatiladi: katalog, savat, buyurtma, qarzdorlik, guruhga ketadigan
> Excel va PDF nakladnoy. `narx` ustuni `numeric`, shuning uchun tiyinlar
> (5,00 / 1,88) yo'qolmaydi.

- **Tovarlar** — qo'lda qo'shish/tahrirlash, Excel import, aksiya narxi va
  "ommabop (TOP)" belgisini boshqarish. Katalog ikki bosqichli:
  **kategoriya** (ARMATURA, NASOS...) → **brend / kichik kategoriya**
  (GIACOMINI, WILO...). Excel'da mos ustunlar: `kategoriya` va `brend`.
  Brend bo'sh bo'lsa, tovar to'g'ridan-to'g'ri kategoriyada turadi.
- **Buyurtmalar** — barcha brigadalarning buyurtmalari, statusni o'zgartirish
  (Yangi → Jarayonda → Yetkazilgan, yoki Bekor qilingan) — o'zgarganda
  buyurtmachiga Telegram orqali avtomatik xabar boradi.
- **Obyektlar / To'lovlar** — har bir obyektning jami xaridi, to'langan
  summasi va joriy qarzdorligi; to'lov qabul qilinganda summani kiritib
  "To'lov qo'shish"ni bosasiz — qarz kamayadi, mijozga xabar boradi.
- **Kategoriyalar** — katalog daraxti: kategoriya qo'shish/o'chirish, brend
  qo'shish, tartibini o'zgartirish va har biriga **rasm yuklash**. Rasm
  brauzerda 500&times;500 ga kichrayadi va Supabase Storage'ning `katalog`
  paketiga tushadi. Rasmi yo'q kategoriya ilovada ikonka bilan chiqadi.
- **Brigadalar** — guruh hisoblari: nomi, login, parol va guruh `chat_id`.
  Kundalik ishda kerak emas (hammasi botdan qilinadi), lekin shu yerda parolni
  almashtirish, hisobni vaqtincha o'chirish (`faol` belgisi) va brigadani
  o'chirish mumkin.

## Xavfsizlik eslatmalari

- `SUPABASE_SERVICE_ROLE_KEY`, `BOT_TOKEN`, `ADMIN_TOKEN` — hech qachon
  frontend kodiga yozilmaydi, faqat Cloudflare muhit o'zgaruvchilarida turadi.
- Mini-app faqat `anon` kalit bilan va faqat `faol=true` tovarlarni o'qiy oladi
  (RLS orqali cheklangan). Foydalanuvchi, obyekt, buyurtma va qarzdorlik
  ma'lumotlariga har qanday kirish/yozish faqat Cloudflare Functions orqali,
  Telegram `initData` imzosi tasdiqlangandan keyin amalga oshadi.
- Buyurtma narxi har doim serverda bazadagi joriy narx bo'yicha qayta
  hisoblanadi — mijoz tomonidan yuborilgan narxga ishonilmaydi.
- Statusni o'zgartirish va to'lov qayd etish faqat `ADMIN_TOKEN` bilan mumkin
  — oddiy foydalanuvchi buyurtma statusini yoki qarzni o'zi o'zgartira olmaydi.

## Hozircha soddalashtirilgan / keyingi bosqichlar

- **Nakladnoy/PDF**: hozircha brauzer "Chop etish" (print-to-PDF) orqali
  ishlaydi (Buyurtmalarim → buyurtma → "PDF / Chop etish"). Rasmiy muhr/rekvizit
  bilan avtomatik PDF generatsiya kerak bo'lsa, alohida ishlab chiqiladi.
- **Til (uz/ru)**: sozlamada saqlanadi, lekin interfeys matnlari hozircha
  faqat o'zbek tilida — to'liq ikki tillilik keyingi bosqich.
- **Ommabop tovarlar**: hozircha admin qo'lda belgilaydi (`ommabop` katagi);
  avtomatik hisoblash (eng ko'p sotilganlar) keyinroq qo'shilishi mumkin.
