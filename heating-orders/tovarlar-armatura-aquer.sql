-- ============================================================
--  ARMATURA / AQUER brendi tovarlari (13 ta)
--  Manba: Aquer.xlsx  |  Narxlar dollarda
--
--  Supabase -> SQL Editor -> New query -> shu faylni to'liq nusxalang -> Run.
--  Qayta ishga tushirsangiz takrorlanmaydi: bir xil artikul topilsa
--  nomi, narxi va kategoriyasi yangilanadi.
-- ============================================================

-- Brend katalog daraxtida ham tursin (ARMATURA ichida, ro'yxatda birinchi)
insert into hs_categories (nomi, ota, tartib) values ('AQUER', 'ARMATURA', 5)
on conflict (nomi, coalesce(ota, '')) do update set tartib = excluded.tartib, faol = true;

-- Bir xil artikulni ikki marta yozib qo'ymaslik uchun kalit
create unique index if not exists hs_products_artikul_key
  on hs_products (artikul) where artikul <> '';

insert into hs_products (artikul, nomi, narx, birlik, kategoriya, kichik_kategoriya) values
  ('Aquer 13', 'Aquer rasxodamerniy kollektor v komplekte 13 fall', 552.50, 'dona', 'ARMATURA', 'AQUER'),
  ('Aquer 2', 'Aquer rasxodamerniy kollektor v komplekte 2 fall', 137.50, 'dona', 'ARMATURA', 'AQUER'),
  ('Aquer 3', 'Aquer rasxodamerniy kollektor v komplekte 3 fall', 175.00, 'dona', 'ARMATURA', 'AQUER'),
  ('1510aq', 'Latunniy rasxodamerniy kollektor v komplekte 10 fall', 422.50, 'dona', 'ARMATURA', 'AQUER'),
  ('1511aq', 'Latunniy rasxodamerniy kollektor v komplekte 11 fall', 454.00, 'dona', 'ARMATURA', 'AQUER'),
  ('1512aq', 'Latunniy rasxodamerniy kollektor v komplekte 12 fall', 500.00, 'dona', 'ARMATURA', 'AQUER'),
  ('154aq', 'Latunniy rasxodamerniy kollektor v komplekte 4 fall', 205.00, 'dona', 'ARMATURA', 'AQUER'),
  ('155aq', 'Latunniy rasxodamerniy kollektor v komplekte 5 fall', 243.00, 'dona', 'ARMATURA', 'AQUER'),
  ('156aq', 'Latunniy rasxodamerniy kollektor v komplekte 6 fall', 277.50, 'dona', 'ARMATURA', 'AQUER'),
  ('157aq', 'Latunniy rasxodamerniy kollektor v komplekte 7 fall', 297.00, 'dona', 'ARMATURA', 'AQUER'),
  ('158aq', 'Latunniy rasxodamerniy kollektor v komplekte 8 fall', 350.00, 'dona', 'ARMATURA', 'AQUER'),
  ('159aq', 'Latunniy rasxodamerniy kollektor v komplekte 9 fall', 388.75, 'dona', 'ARMATURA', 'AQUER'),
  ('aq-servoprivod', 'Servoprivod dlya latunniy kollektor', 28.75, 'dona', 'ARMATURA', 'AQUER')
on conflict (artikul) where artikul <> '' do update
  set nomi = excluded.nomi,
      narx = excluded.narx,
      kategoriya = excluded.kategoriya,
      kichik_kategoriya = excluded.kichik_kategoriya,
      faol = true;

notify pgrst, 'reload schema';

-- Tekshirish: 13 ta tovar chiqishi kerak
select count(*) as aquer_tovarlari,
       min(narx) as eng_arzon,
       max(narx) as eng_qimmat
from hs_products where kategoriya = 'ARMATURA' and kichik_kategoriya = 'AQUER';
