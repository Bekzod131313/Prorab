-- ============================================================
-- Otopleniya buyurtma boti — Supabase schema
-- Supabase SQL Editor'da bir marta ishga tushiring.
-- ============================================================

create extension if not exists pgcrypto;

-- Har bir usta brigadasining Telegram guruhi
create table if not exists hs_brigades (
  id          uuid primary key default gen_random_uuid(),
  nomi        text not null,
  chat_id     bigint unique not null,
  code        text unique not null,
  created_at  timestamptz default now()
);

-- Tovarlar katalogi
create table if not exists hs_products (
  id          uuid primary key default gen_random_uuid(),
  artikul     text not null default '',
  nomi        text not null,
  narx        numeric not null default 0,
  birlik      text default 'dona',
  kategoriya  text default 'Boshqa',
  faol        boolean default true,
  created_at  timestamptz default now()
);
create index if not exists idx_hs_products_faol on hs_products(faol);
create index if not exists idx_hs_products_kategoriya on hs_products(kategoriya);

-- Yuborilgan buyurtmalar tarixi
create table if not exists hs_orders (
  id            uuid primary key default gen_random_uuid(),
  brigade_id    uuid references hs_brigades(id) on delete cascade,
  telegram_id   bigint,
  telegram_name text,
  items         jsonb not null,
  total         numeric not null default 0,
  created_at    timestamptz default now()
);
create index if not exists idx_hs_orders_brigade on hs_orders(brigade_id);

alter table hs_brigades enable row level security;
alter table hs_products enable row level security;
alter table hs_orders   enable row level security;

-- Mini-app anon kalit bilan faqat faol tovarlarni o'qiy oladi.
-- Qolgan barcha o'qish/yozishlar (brigadalar, buyurtmalar, admin CRUD)
-- faqat Cloudflare Functions ichidan service_role kaliti orqali amalga oshadi
-- va RLS'ni chetlab o'tadi — shuning uchun ular uchun policy shart emas.
drop policy if exists hs_products_public_read on hs_products;
create policy hs_products_public_read on hs_products for select using (faol = true);
