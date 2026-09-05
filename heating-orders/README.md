# Otopleniya buyurtma boti (Telegram mini-app)

Har bir usta brigadasi o'zining Telegram guruhida botdan foydalanadi:
tovarlarni katalogdan tanlab savatga yig'adi, "Buyurtma berish" tugmasini
bosadi — va tanlangan tovarlar (artikul, nomi, narx, miqdor, summa) **Excel
fayl** ko'rinishida avtomatik o'sha guruhga tushadi.

Bu modul asosiy Prorab ilovasidan (loyiha moliyasi) mustaqil, alohida bot va
alohida mini-app sifatida ishlaydi, lekin bitta GitHub repozitoriyda saqlanadi.

## Arxitektura

- **Frontend**: `public/index.html` — Telegram Mini App (tovar katalogi, savat),
  `public/admin.html` — tovarlarni boshqarish paneli (qo'lda qo'shish + Excel import).
- **Backend**: `functions/api/*.js` — Cloudflare Pages Functions.
- **Baza**: Supabase (Postgres). `schema.sql` faylida jadvallar.
- **Bot**: Telegram Bot API, webhook orqali (`functions/api/bot.js`).

## 1) Telegram bot yaratish

1. Telegram'da [@BotFather](https://t.me/BotFather) bilan yozishing.
2. `/newbot` — nomi va username bering. Sizga **BOT_TOKEN** beriladi, saqlab qo'ying.

## 2) Supabase sozlash

1. https://supabase.com — yangi loyiha yarating (yoki mavjudidan foydalaning).
2. **SQL Editor** bo'limida `schema.sql` faylidagi kodni ishga tushiring.
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

## 6) Foydalanish

1. Botni brigada Telegram guruhiga qo'shing va **admin** qiling.
2. Guruhda admin: `/register Brigada nomi` deb yozadi (masalan `/register Anvar brigadasi`).
3. Bot guruhga "🤖 Botga o'tish va buyurtma berish" tugmasi bilan xabar yuboradi
   (Telegram cheklovi tufayli mini-app tugmasi guruhda emas, faqat botning
   shaxsiy chatida ishlaydi — shu sababli oraliq qadam kerak).
4. Har bir brigada a'zosi shu tugmani **bir marta** bosadi → botning shaxsiy
   chatiga o'tadi → bot u yerda "🛒 Katalog va buyurtma" (mini-app) tugmasini yuboradi.
5. Usta tugmani bosadi → mini-app ochiladi → tovarlarni tanlab savatga
   qo'shadi → "Buyurtma berish"ni bosadi.
6. Excel fayl (artikul, nomi, narx, birlik, miqdor, summa) avtomatik brigada
   guruhiga yuboriladi, buyurtma `hs_orders` jadvaliga ham yoziladi.

## 7) Tovarlar katalogini to'ldirish

`https://<MINIAPP_URL>/admin.html` sahifasini oching, `ADMIN_TOKEN`ni kiriting.

- Qo'lda bitta-bitta tovar qo'shishingiz mumkin.
- Yoki tayyor narxlar ro'yxatingiz (Excel/.xlsx yoki .csv) bo'lsa, **"Faylni
  tanlash"** tugmasi orqali yuklang. Ustunlar nomi: `artikul`, `nomi`, `narx`,
  `birlik`, `kategoriya` (katta-kichik harf farqi yo'q, tartib muhim emas).

## Xavfsizlik eslatmalari

- `SUPABASE_SERVICE_ROLE_KEY`, `BOT_TOKEN`, `ADMIN_TOKEN` — hech qachon
  frontend kodiga yozilmaydi, faqat Cloudflare muhit o'zgaruvchilarida turadi.
- Mini-app faqat `anon` kalit bilan va faqat `faol=true` tovarlarni o'qiy oladi
  (RLS orqali cheklangan).
- Buyurtma narxi har doim serverda bazadagi joriy narx bo'yicha qayta
  hisoblanadi — mijoz tomonidan yuborilgan narxga ishonilmaydi.
- Telegram Mini App foydalanuvchisi `initData` imzosi orqali tasdiqlanadi.
