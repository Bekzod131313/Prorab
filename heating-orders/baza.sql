-- ============================================================
--  ZODPRO — BAZANI YANGILASH (hammasi bitta faylda)
--
--  Supabase -> SQL Editor -> New query -> shu faylni to'liq nusxalang
--  -> Run. Qayta ishga tushirsangiz ham xato bermaydi.
--
--  Shundan keyin qo'lda qiladigan bitta ish qoladi:
--    Supabase -> Storage -> New bucket -> nomi "katalog", Public yoqilgan
--    (kategoriya rasmlari shu yerga tushadi)
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
--  KATALOG DARAXTI (22 kategoriya, 66 brend)
-- ============================================================

create table if not exists hs_categories (
  nomi       text not null,
  ota        text,                      -- null = yuqori kategoriya, aks holda brend
  tartib     int  not null default 100,
  faol       boolean not null default true,
  created_at timestamptz default now()
);

-- MUHIM: (nomi, ota) ni primary key qilib bo'lmaydi — PostgreSQL primary key
-- ustunlarini majburan NOT NULL qiladi, yuqori kategoriyalarda esa `ota` bo'sh.
-- Shuning uchun kalit sifatida ifodali (expression) unique indeks ishlatamiz:
-- unda null'lar ham taqqoslanadi, ya'ni bir xil nom ikki marta tushmaydi.
alter table hs_categories drop constraint if exists hs_categories_pkey;
alter table hs_categories alter column ota drop not null;
create unique index if not exists hs_categories_key
  on hs_categories (nomi, coalesce(ota, ''));

-- Kategoriya rasmi (botga tashlansa yoki admin panelda yuklansa shu yerga yoziladi)
alter table hs_categories add column if not exists rasm text;

-- PostgREST ustunlar ro'yxatini keshlaydi — yangi ustun darrov ko'rinishi uchun
-- keshni yangilashni so'raymiz (aks holda "Could not find the 'rasm' column"
-- xatosi bir necha daqiqa davom etishi mumkin).
notify pgrst, 'reload schema';

-- Ilova anon kalit bilan faqat o'qiydi
alter table hs_categories enable row level security;
drop policy if exists hs_categories_public_read on hs_categories;
create policy hs_categories_public_read on hs_categories for select using (faol = true);

-- Eski ro'yxatni tozalab, yangisini yozamiz
delete from hs_categories;

insert into hs_categories (nomi, ota, tartib) values
  ('AKSESSUAR', null, 10),
  ('ARMATURA', null, 20),
  ('BARBERI', 'ARMATURA', 10),
  ('CALEFFI', 'ARMATURA', 20),
  ('CARLO POLETTI', 'ARMATURA', 30),
  ('DANFOSS', 'ARMATURA', 40),
  ('FAR', 'ARMATURA', 50),
  ('FERRO', 'ARMATURA', 60),
  ('GIACOMINI', 'ARMATURA', 70),
  ('HERZ', 'ARMATURA', 80),
  ('IVAR', 'ARMATURA', 90),
  ('KAN THERM', 'ARMATURA', 100),
  ('KAS', 'ARMATURA', 110),
  ('OVENTROP', 'ARMATURA', 120),
  ('POWER', 'ARMATURA', 130),
  ('RBM', 'ARMATURA', 140),
  ('REFLEX', 'ARMATURA', 150),
  ('S-PRESS', 'ARMATURA', 160),
  ('SITEM', 'ARMATURA', 170),
  ('TDS', 'ARMATURA', 180),
  ('TIEMME', 'ARMATURA', 190),
  ('AVTOMATIKA', null, 30),
  ('CLIMATE HOUSE', 'AVTOMATIKA', 10),
  ('DANFOSS', 'AVTOMATIKA', 20),
  ('Neptun', 'AVTOMATIKA', 30),
  ('Smartheat', 'AVTOMATIKA', 40),
  ('BOYLER', null, 40),
  ('DIMAXOD', null, 50),
  ('A.D.M', 'DIMAXOD', 10),
  ('COX GEELAN', 'DIMAXOD', 20),
  ('FILTR', null, 60),
  ('BTW SLIM', 'FILTR', 10),
  ('BWT SOFTNER', 'FILTR', 20),
  ('BWT WODA-PRUE', 'FILTR', 30),
  ('BWT-ZAPCHAST', 'FILTR', 40),
  ('GAZ', null, 70),
  ('GECA', 'GAZ', 10),
  ('MADAS', 'GAZ', 20),
  ('IZOLYATSIYA', null, 80),
  ('ENERGOFLEX', 'IZOLYATSIYA', 10),
  ('TONLOS', 'IZOLYATSIYA', 20),
  ('KANALIZATSIYA', null, 90),
  ('OSTENDORF HTEM', 'KANALIZATSIYA', 10),
  ('OSTENDORF KG-2000', 'KANALIZATSIYA', 20),
  ('OSTENDORF KGEM', 'KANALIZATSIYA', 30),
  ('OSTENDORF SKEM', 'KANALIZATSIYA', 40),
  ('KATYOL', null, 100),
  ('KONVEKTOR', null, 110),
  ('ISOTERM', 'KONVEKTOR', 10),
  ('LATUN FITING', null, 120),
  ('NASOS', null, 130),
  ('CALPEDA', 'NASOS', 10),
  ('DAB', 'NASOS', 20),
  ('FERRO', 'NASOS', 30),
  ('GRUNFOS', 'NASOS', 40),
  ('LEO', 'NASOS', 50),
  ('PEDROLLO', 'NASOS', 60),
  ('WILO', 'NASOS', 70),
  ('NERJAVEYKA', null, 140),
  ('POLIV', null, 150),
  ('HUNTER', 'POLIV', 10),
  ('POLESAN', 'POLIV', 20),
  ('PPR', null, 160),
  ('PILSA', 'PPR', 10),
  ('PRESS FITING', null, 170),
  ('RADIATOR', null, 180),
  ('Akfa', 'RADIATOR', 10),
  ('ARBONIA', 'RADIATOR', 20),
  ('CALIDO', 'RADIATOR', 30),
  ('Global', 'RADIATOR', 40),
  ('IDMAR', 'RADIATOR', 50),
  ('IMAS', 'RADIATOR', 60),
  ('IRSAP', 'RADIATOR', 70),
  ('Royal P', 'RADIATOR', 80),
  ('Royal S', 'RADIATOR', 90),
  ('RASH.BAK', null, 190),
  ('RASHBAK', 'RASH.BAK', 10),
  ('REFLEX', 'RASH.BAK', 20),
  ('SANTEXNIKA', null, 200),
  ('ALCAPLAST', 'SANTEXNIKA', 10),
  ('CHINA', 'SANTEXNIKA', 20),
  ('FRENDO', 'SANTEXNIKA', 30),
  ('GEBERIT', 'SANTEXNIKA', 40),
  ('GROHE', 'SANTEXNIKA', 50),
  ('HKSC', 'SANTEXNIKA', 60),
  ('VIEGA', 'SANTEXNIKA', 70),
  ('SHLANG', null, 210),
  ('VENTILYATSIYA', null, 220)
on conflict (nomi, coalesce(ota, '')) do update set tartib = excluded.tartib, faol = true;

-- ============================================================
--  TEKSHIRISH — quyidagilar xatosiz chiqishi kerak
-- ============================================================
select 'brigadalar' as jadval, count(*) from hs_brigades
union all select 'kategoriyalar', count(*) from hs_categories where ota is null
union all select 'brendlar',      count(*) from hs_categories where ota is not null;

select id, nomi, login, faol, chat_id from hs_brigades limit 1;
