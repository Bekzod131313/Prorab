-- ============================================================
--  ZODPRO — baza yangilash (Supabase → SQL Editor → Run)
--  Bu faylni butunlay nusxalab, bir marta ishga tushiring.
--  Qayta ishga tushirsangiz ham xato bermaydi.
-- ============================================================

-- ---- Obyekt joylashuvi (xaritadagi nuqta) ----
alter table hs_objects add column if not exists lat double precision;
alter table hs_objects add column if not exists lng double precision;

-- ---- Botga yuborilgan lokatsiya, obyekt tanlanmaguncha kutib turadi ----
create table if not exists hs_pending_locations (
  telegram_id bigint primary key,
  lat         double precision not null,
  lng         double precision not null,
  created_at  timestamptz default now()
);
alter table hs_pending_locations enable row level security;

-- ---- Brigada hisobi: login / parol ----
alter table hs_brigades add column if not exists login       text;
alter table hs_brigades add column if not exists parol_hash  text;
alter table hs_brigades add column if not exists parol_salt  text;
alter table hs_brigades add column if not exists faol        boolean not null default true;
alter table hs_brigades add column if not exists yaratgan_telegram_id bigint;

-- Guruh keyinroq bog'lanadi, shuning uchun chat_id bo'sh bo'lishi mumkin
alter table hs_brigades alter column chat_id drop not null;

-- Bitta login — bitta brigada
create unique index if not exists hs_brigades_login_key
  on hs_brigades (lower(login)) where login is not null;

-- ---- Ikki bosqichli katalog: kategoriya -> brend/kichik kategoriya ----
alter table hs_products add column if not exists kichik_kategoriya text;
create index if not exists hs_products_kat_idx on hs_products (kategoriya, kichik_kategoriya);

-- ============================================================
--  Tekshirish: quyidagi so'rov xatosiz ishlashi kerak
-- ============================================================
select id, nomi, login, faol, chat_id from hs_brigades limit 1;
