-- ============================================================
--  AKSESSUAR kategoriyasi tovarlari (59 ta)
--  Manba: Aksessuar.xlsx  |  Narxlar dollarda
--
--  Supabase -> SQL Editor -> Run.
--  Qayta ishga tushirsangiz takrorlanmaydi: bir xil artikul topilsa
--  nomi va narxi yangilanadi.
--
--  Qo'shilmagani (narxi ko'rsatilmagan): AK044., AK046., AK055.
-- ============================================================

-- Bir xil artikulni ikki marta yozib qo'ymaslik uchun kalit
create unique index if not exists hs_products_artikul_key
  on hs_products (artikul) where artikul <> '';

insert into hs_products (artikul, nomi, narx, birlik, kategoriya) values
  ('AK001.', 'AKFIX Silikon germetik (prozrachniy)', 5.00, 'dona', 'AKSESSUAR'),
  ('AK002.', 'TITAN Silikon germetik (BELIY)', 6.25, 'dona', 'AKSESSUAR'),
  ('AK003.', 'SOMAFIX Penka montajnaya 60sec', 10.00, 'dona', 'AKSESSUAR'),
  ('AK004.', 'NAKLEYKA STIKER (DAFTAR)', 15.00, 'dona', 'AKSESSUAR'),
  ('AK005.', 'KREPLENIYA RAKOVINA', 1.88, 'dona', 'AKSESSUAR'),
  ('AK006.', 'KREPLENIYA UNITAZ', 1.88, 'dona', 'AKSESSUAR'),
  ('AK007.', 'KREPLENIYA ARISTON', 1.88, 'dona', 'AKSESSUAR'),
  ('AK008.', 'SHLANGI (SMESITEL) DN15 40ММ', 5.00, 'dona', 'AKSESSUAR'),
  ('AK009.', 'SHLANGI (SMESITEL) DN15 60ММ', 5.00, 'dona', 'AKSESSUAR'),
  ('AK010.', 'SHLANGI (UNITAZ) 15/15- 40ММ', 6.25, 'dona', 'AKSESSUAR'),
  ('AK011.', 'SHLANGI (UNITAZ) 15/15- 60ММ', 6.25, 'dona', 'AKSESSUAR'),
  ('AK012.', 'SHLANGI (UNITAZ) 15/15- 80ММ', 6.25, 'dona', 'AKSESSUAR'),
  ('AK013.', 'SIFON GOFRA (RAKOVINA) DN32', 7.50, 'dona', 'AKSESSUAR'),
  ('AK014.', 'SIFON GOFRA (RAKOVINA) DN40', 7.50, 'dona', 'AKSESSUAR'),
  ('AK014.1', 'SIFON VANNA VIR', 17.00, 'dona', 'AKSESSUAR'),
  ('AK015.', 'PODSIFON GOFRA (RAKOVINA) DN32', 6.25, 'dona', 'AKSESSUAR'),
  ('AK016.', 'PODSIFON GOFRA (RAKOVINA) DN40', 6.25, 'dona', 'AKSESSUAR'),
  ('AK017.', 'GOFRA UNITAZ', 18.75, 'dona', 'AKSESSUAR'),
  ('AK018.', 'VANYUCHKA  DN 50', 0.75, 'dona', 'AKSESSUAR'),
  ('AK019.', 'TEPLOOBMENNIK 30 KVT', 312.50, 'dona', 'AKSESSUAR'),
  ('AK020.', 'TEPLOOBMENNIK 40 KVT', 375.00, 'dona', 'AKSESSUAR'),
  ('AK021.', 'TEPLOOBMENNIK 50 KVT', 437.50, 'dona', 'AKSESSUAR'),
  ('AK022.', 'TEPLOOBMENNIK 60 KVT', 500.00, 'dona', 'AKSESSUAR'),
  ('AK023.', 'TEPLOOBMENNIK 70 KVT', 562.50, 'dona', 'AKSESSUAR'),
  ('AK024.', 'TEPLOOBMENNIK 80 KVT', 625.00, 'dona', 'AKSESSUAR'),
  ('AK025.', 'TEPLOOBMENNIK 90 KVT', 687.50, 'dona', 'AKSESSUAR'),
  ('AK026.', 'CANDAN apparat payochniy PPR', 100.00, 'dona', 'AKSESSUAR'),
  ('AK027.', 'FUSION apparat payochniy PPR', 100.00, 'dona', 'AKSESSUAR'),
  ('AK028.', 'NASADKA PPR 20', 7.50, 'dona', 'AKSESSUAR'),
  ('AK029.', 'NASADKA PPR 25', 8.75, 'dona', 'AKSESSUAR'),
  ('AK030.', 'NASADKA PPR 32', 10.00, 'dona', 'AKSESSUAR'),
  ('AK031.', 'NASADKA PPR 40', 11.25, 'dona', 'AKSESSUAR'),
  ('AK032.', 'NASADKA PPR 50', 12.50, 'dona', 'AKSESSUAR'),
  ('AK033.', 'NASADKA PPR 63', 21.25, 'dona', 'AKSESSUAR'),
  ('AK034.', 'NOJNITSA (QAYCHI PPR) 20-50', 16.25, 'dona', 'AKSESSUAR'),
  ('AK035.', 'NOJNITSA (QAYCHI PPR) 20-76', 32.50, 'dona', 'AKSESSUAR'),
  ('AK036.', 'SCHETCHIK XVS 3/4', 31.25, 'dona', 'AKSESSUAR'),
  ('AK037.', 'SCHETCHIK XVS 1*', 156.25, 'dona', 'AKSESSUAR'),
  ('AK037.1', 'SCHETCHIK XVS 1''1/4', 185.00, 'dona', 'AKSESSUAR'),
  ('AK038.', 'ANTIFRIZ -65C Propilenglikol', 4.38, 'dona', 'AKSESSUAR'),
  ('AK039.', 'ANTIFRIZ -35C Propilenglikol', 5.62, 'dona', 'AKSESSUAR'),
  ('AK040.', 'TUZ (TABLETIROVANNIY) UZB', 0.87, 'dona', 'AKSESSUAR'),
  ('AK041.', 'PAPLOVOK DN25', 14.00, 'dona', 'AKSESSUAR'),
  ('AK042.', 'Mini Fum lenta', 0.70, 'dona', 'AKSESSUAR'),
  ('AK043.', 'Fum lenta', 1.20, 'dona', 'AKSESSUAR'),
  ('AK045.', 'Dielektricheskiy mufta 3/4', 7.00, 'dona', 'AKSESSUAR'),
  ('AK047.', 'Kalibrator', 12.00, 'dona', 'AKSESSUAR'),
  ('AK049.', 'Yomkost vertikalniy 1t', 275.00, 'dona', 'AKSESSUAR'),
  ('AK050.', 'Poplovok elektronniy 1', 80.00, 'dona', 'AKSESSUAR'),
  ('AK051.', 'Sifon dlya konditsionera', 53.00, 'dona', 'AKSESSUAR'),
  ('AK052.', 'Ruchnoy opressovochniy nasos CANDAN', 225.00, 'dona', 'AKSESSUAR'),
  ('AK053.', 'Atlas filtr 1''', 120.00, 'dona', 'AKSESSUAR'),
  ('AK054', 'Yomkist 100 L', 125.00, 'dona', 'AKSESSUAR'),
  ('AK054.', 'Noj', 25.00, 'dona', 'AKSESSUAR'),
  ('AK056.', 'Nezamerzayushiy kran', 42.00, 'dona', 'AKSESSUAR'),
  ('AK057.', 'Kontroller TECH I3', 688.00, 'dona', 'AKSESSUAR'),
  ('AK059.', 'Ntc datchik dlya boylera', 30.00, 'dona', 'AKSESSUAR'),
  ('AK060.', 'Sushilka kran beliy 1/2', 13.25, 'dona', 'AKSESSUAR'),
  ('Porta 1', 'Porta chashagen max', 180.00, 'dona', 'AKSESSUAR')
on conflict (artikul) where artikul <> '' do update
  set nomi = excluded.nomi,
      narx = excluded.narx,
      kategoriya = excluded.kategoriya,
      faol = true;

notify pgrst, 'reload schema';

-- Tekshirish
select count(*) as aksessuar_tovarlari,
       min(narx) as eng_arzon,
       max(narx) as eng_qimmat
from hs_products where kategoriya = 'AKSESSUAR';
