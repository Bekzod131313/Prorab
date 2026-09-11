-- ============================================================
-- Otopleniya buyurtma boti — Supabase schema (v2, to'liq tizim)
-- Supabase SQL Editor'da bir marta ishga tushiring.
-- Eslatma: v1'ni allaqachon ishga tushirgan bo'lsangiz ham xavfsiz —
-- barcha buyruqlar IF NOT EXISTS / IF EXISTS bilan yozilgan.
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- Brigadalar (Telegram guruhlari) ----------
create table if not exists hs_brigades (
  id          uuid primary key default gen_random_uuid(),
  nomi        text not null,
  chat_id     bigint unique not null,
  code        text unique not null,
  created_at  timestamptz default now()
);

-- ---------- Foydalanuvchilar (har bir usta/menejer) ----------
create table if not exists hs_users (
  telegram_id     bigint primary key,
  ism             text,
  telefon         text,
  kompaniya       text,
  brigade_id      uuid references hs_brigades(id),
  til             text default 'uz',
  tema            text default 'system',
  bildir_buyurtma boolean default true,
  bildir_qarz     boolean default true,
  bildir_aksiya   boolean default true,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- ---------- Manzillar ----------
create table if not exists hs_addresses (
  id           uuid primary key default gen_random_uuid(),
  telegram_id  bigint not null references hs_users(telegram_id) on delete cascade,
  nomi         text not null,
  manzil       text not null,
  created_at   timestamptz default now()
);
create index if not exists idx_hs_addresses_user on hs_addresses(telegram_id);

-- ---------- Tovarlar katalogi ----------
create table if not exists hs_products (
  id          uuid primary key default gen_random_uuid(),
  artikul     text not null default '',
  nomi        text not null,
  narx        numeric not null default 0,
  aksiya_narx numeric,
  ommabop     boolean default false,
  birlik      text default 'dona',
  kategoriya  text default 'Boshqa',
  faol        boolean default true,
  created_at  timestamptz default now()
);
alter table hs_products add column if not exists aksiya_narx numeric;
alter table hs_products add column if not exists ommabop boolean default false;
create index if not exists idx_hs_products_faol on hs_products(faol);
create index if not exists idx_hs_products_kategoriya on hs_products(kategoriya);

-- ---------- Obyektlar (qurilish/xizmat obyektlari) ----------
create table if not exists hs_objects (
  id          uuid primary key default gen_random_uuid(),
  brigade_id  uuid references hs_brigades(id) on delete cascade,
  nomi        text not null,
  manzil      text,
  lat         double precision,
  lng         double precision,
  created_by  bigint,
  created_at  timestamptz default now()
);
alter table hs_objects add column if not exists lat double precision;
alter table hs_objects add column if not exists lng double precision;
create index if not exists idx_hs_objects_brigade on hs_objects(brigade_id);

-- ---------- Buyurtma raqami uchun ketma-ketlik ----------
create sequence if not exists hs_order_seq;

create or replace function hs_next_order_no() returns text as $$
declare seq_val bigint;
begin
  seq_val := nextval('hs_order_seq');
  return 'OTP-' || to_char(now(), 'YYYY') || '-' || lpad(seq_val::text, 4, '0');
end;
$$ language plpgsql;

-- ---------- Buyurtmalar ----------
create table if not exists hs_orders (
  id            uuid primary key default gen_random_uuid(),
  order_no      text unique,
  brigade_id    uuid references hs_brigades(id) on delete cascade,
  object_id     uuid references hs_objects(id),
  telegram_id   bigint,
  telegram_name text,
  items         jsonb not null,
  total         numeric not null default 0,
  status        text not null default 'yangi',
  created_at    timestamptz default now()
);
alter table hs_orders add column if not exists order_no text;
alter table hs_orders add column if not exists object_id uuid references hs_objects(id);
alter table hs_orders add column if not exists status text not null default 'yangi';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'hs_orders_order_no_key') then
    alter table hs_orders add constraint hs_orders_order_no_key unique (order_no);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'hs_orders_status_check') then
    alter table hs_orders add constraint hs_orders_status_check
      check (status in ('yangi','jarayonda','yetkazilgan','bekor_qilingan'));
  end if;
end $$;
create index if not exists idx_hs_orders_brigade on hs_orders(brigade_id);
create index if not exists idx_hs_orders_object on hs_orders(object_id);
create index if not exists idx_hs_orders_user on hs_orders(telegram_id);

-- ---------- Qarzdorlik tarixi (har buyurtma = qarz, har to'lov = tolov) ----------
create table if not exists hs_debt_entries (
  id          uuid primary key default gen_random_uuid(),
  object_id   uuid not null references hs_objects(id) on delete cascade,
  order_id    uuid references hs_orders(id),
  turi        text not null check (turi in ('qarz','tolov')),
  summa       numeric not null,
  izoh        text,
  created_by  bigint,
  created_at  timestamptz default now()
);
create index if not exists idx_hs_debt_object on hs_debt_entries(object_id);

-- ---------- Botga forward qilingan lokatsiya, obyekt tanlanmaguncha kutadi ----------
create table if not exists hs_pending_locations (
  telegram_id bigint primary key,
  lat         double precision not null,
  lng         double precision not null,
  created_at  timestamptz default now()
);

-- ---------- Bildirishnomalar (Telegram xabari bilan birga saqlanadi) ----------
create table if not exists hs_notifications (
  id          uuid primary key default gen_random_uuid(),
  telegram_id bigint not null,
  turi        text not null, -- buyurtma | qarzdorlik | tolov | aksiya | yangilik
  matn        text not null,
  order_id    uuid references hs_orders(id),
  object_id   uuid references hs_objects(id),
  oqilgan     boolean default false,
  created_at  timestamptz default now()
);
create index if not exists idx_hs_notif_user on hs_notifications(telegram_id, created_at desc);

alter table hs_brigades      enable row level security;
alter table hs_users         enable row level security;
alter table hs_addresses     enable row level security;
alter table hs_products      enable row level security;
alter table hs_objects       enable row level security;
alter table hs_orders        enable row level security;
alter table hs_debt_entries  enable row level security;
alter table hs_notifications  enable row level security;
alter table hs_pending_locations enable row level security;

-- Mini-app anon kalit bilan faqat faol tovarlarni o'qiy oladi.
-- Qolgan barcha o'qish/yozish (foydalanuvchilar, obyektlar, buyurtmalar,
-- qarzdorlik, bildirishnomalar, admin CRUD) faqat Cloudflare Functions
-- ichidan service_role kaliti orqali, Telegram initData tasdiqlangandan
-- keyin amalga oshadi va RLS'ni chetlab o'tadi — shuning uchun bu
-- jadvallar uchun boshqa policy shart emas.
drop policy if exists hs_products_public_read on hs_products;
create policy hs_products_public_read on hs_products for select using (faol = true);

-- ---------- v3: brigada login/parol (guruh uchun umumiy hisob) ----------
-- Endi usta va uning shogirdlari bitta login/parol bilan kiradi; barcha
-- buyurtmalar shu brigadaning guruhiga tushadi. Brigadani admin panelda
-- yaratamiz va guruhga o'zimiz bog'laymiz (chat_id).
alter table hs_brigades add column if not exists login       text;
alter table hs_brigades add column if not exists parol_hash  text;
alter table hs_brigades add column if not exists parol_salt  text;
alter table hs_brigades add column if not exists faol        boolean not null default true;
-- guruh keyinroq bog'lanishi mumkin, shuning uchun chat_id bo'sh bo'la oladi
alter table hs_brigades alter column chat_id drop not null;
create unique index if not exists hs_brigades_login_key on hs_brigades (lower(login)) where login is not null;

-- ---------- v3.1: ustaning o'zi ro'yxatdan o'tadi ----------
-- Brigadani endi ustaning o'zi mini-appda yaratadi (login/parol o'ylab topadi).
-- Guruh bilan bog'lashni (chat_id) faqat operator botdan qiladi.
alter table hs_brigades add column if not exists yaratgan_telegram_id bigint;

-- ---------- v3.2: ikki bosqichli katalog ----------
-- Kategoriya (ARMATURA) -> kichik kategoriya / brend (GIACOMINI) -> tovar
alter table hs_products add column if not exists kichik_kategoriya text;
create index if not exists hs_products_kat_idx on hs_products (kategoriya, kichik_kategoriya);
