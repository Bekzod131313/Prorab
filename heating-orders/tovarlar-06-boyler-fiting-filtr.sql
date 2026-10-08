-- ============================================================
--  ZODPRO katalogi — 06-boyler-fiting-filtr
--  424 ta tovar. Narxlar dollarda.
--
--  Supabase -> SQL Editor -> New query -> to'liq nusxalang -> Run.
--  Qayta ishga tushirsangiz takrorlanmaydi (artikul bo'yicha yangilanadi).
-- ============================================================

create unique index if not exists hs_products_artikul_key
  on hs_products (artikul) where artikul <> '';


-- Katalog daraxtida xato yozilgan brend nomlari (ularda tovar yo'q edi)
delete from hs_categories where (nomi, ota) in (
  ('BTW SLIM','FILTR'), ('BWT WODA-PRUE','FILTR'), ('BWT-ZAPCHAST','FILTR'),
  ('COX GEELAN','DIMAXOD'), ('GRUNFOS','NASOS'), ('POLESAN','POLIV')
);

-- Brendlar katalog daraxtida tursin
insert into hs_categories (nomi, ota, tartib) values
  ('BWT SLIM', 'FILTR', 10),
  ('BWT SOFTNER', 'FILTR', 20),
  ('BWT WODA-PURE', 'FILTR', 30),
  ('BWT ZAPCHAST', 'FILTR', 40),
  ('GECA', 'GAZ', 10),
  ('MADAS', 'GAZ', 20),
  ('ISOTERM', 'KONVEKTOR', 10),
  ('RASHBAK', 'RASH.BAK', 10),
  ('REFLEX', 'RASH.BAK', 20)
on conflict (nomi, coalesce(ota, '')) do update set tartib = excluded.tartib, faol = true;


-- BOYLER  (82 ta)
insert into hs_products (artikul, nomi, narx, birlik, kategoriya, kichik_kategoriya) values
  ('Ariston 80.', 'Ariston Russia 80l', 200.00, 'dona', 'BOYLER', null),
  ('Ariston Velis 100.', 'Ariston VELIS EVO PW 100', 472.22, 'dona', 'BOYLER', null),
  ('Ariston Velis 50.', 'Ariston VELIS EVO PW 50', 416.66, 'dona', 'BOYLER', null),
  ('Ariston Velis 80.', 'Ariston VELIS EVO PW80', 444.45, 'dona', 'BOYLER', null),
  ('Ariston gorizontal 100.', 'Ariston Vodonagrevatel gorizontalniy 100l', 248.61, 'dona', 'BOYLER', null),
  ('Ariston gorizontal 80.', 'Ariston Vodonagrevatel gorizontalniy 80l', 231.95, 'dona', 'BOYLER', null),
  ('Ariston 10.', 'Ariston Vodonagrevatel Italiya 10l', 138.89, 'dona', 'BOYLER', null),
  ('Ariston 15.', 'Ariston Vodonagrevatel Italiya 15l', 145.84, 'dona', 'BOYLER', null),
  ('Ariston 30.', 'Ariston Vodonagrevatel Italiya 30l', 188.00, 'dona', 'BOYLER', null),
  ('Ariston 50.', 'Ariston Vodonagrevatel Italiya 50l', 208.34, 'dona', 'BOYLER', null),
  ('Buferniy 100', 'Buferniy yomkost 100', 475.00, 'dona', 'BOYLER', null),
  ('AK048', 'Buferniy yomkost 1t', 2650.00, 'dona', 'BOYLER', null),
  ('3070271.', 'CHAFFOTEAUX BOYLER 200 PROTECH', 1250.00, 'dona', 'BOYLER', null),
  ('3070493-1.', 'CHAFFOTEAUX BOYLER 300 PROTECH', 1812.50, 'dona', 'BOYLER', null),
  ('3201174-11.', 'CHAFFOTEAUX GAZOVIY TITAN 195 CF', 1212.50, 'dona', 'BOYLER', null),
  ('Fennex 100.', 'FENNEX Boyler kosvennogo nagreva s odnim teploobmennikom 100L (Flyantssiz, izolyatsiya paralon)', 395.84, 'dona', 'BOYLER', null),
  ('Fennex 160.', 'FENNEX Boyler kosvennogo nagreva s odnim teploobmennikom 160L (Flyantssiz, izolyatsiya paralon)', 486.11, 'dona', 'BOYLER', null),
  ('Fennex 200.', 'FENNEX Boyler kosvennogo nagreva s odnim teploobmennikom 200L (Flyantssiz, izolyatsiya paralon)', 555.55, 'dona', 'BOYLER', null),
  ('Fennex 300.', 'FENNEX Boyler kosvennogo nagreva s odnim teploobmennikom 300L (Flyantssiz, izolyatsiya paralon)', 722.22, 'dona', 'BOYLER', null),
  ('Fennex 500.', 'FENNEX Boyler kosvennogo nagreva s odnim teploobmennikom 500L (Flyanchlik, izolyatsiya paralon)', 1222.22, 'dona', 'BOYLER', null),
  ('Ferroli 100 1x.', 'FEROLLI  ECOUNIT F 100-1C (WN) Kosvenniy boyler', 500.00, 'dona', 'BOYLER', null),
  ('Ferroli 300 1x.', 'FEROLLI  ECOUNIT F 300-1C (WN) Kosvenniy boyler', 812.50, 'dona', 'BOYLER', null),
  ('Ferroli 500 2x.', 'FEROLLI  ECOUNIT F 500-2C (WN) Kosvenniy boyler', 1337.50, 'dona', 'BOYLER', null),
  ('Ferroli 200 1x.', 'FEROLLI ECOUNIT F 200-1C (WN) Kosvenniy boyler', 650.00, 'dona', 'BOYLER', null),
  ('Galmet Neptun 100.', 'GALMET Neptun Kombi SGW(S) + ten 1.5 kvt. 100L Navesnogo tipa (ruchnoy) (104670)', 800.00, 'dona', 'BOYLER', null),
  ('Galmet Neptun 120.', 'GALMET Neptun Kombi SGW(S) + ten 2,0 kvt. 120L Navesnogo tipa (ruchnoy) (124670)', 736.11, 'dona', 'BOYLER', null),
  ('Galmet Tower 500 2x.', 'GALMET Tower Biwal Sol Partner SGW(S) s dvumya teploobmennikami 500L (509000) (seraya obivka)', 2152.78, 'dona', 'BOYLER', null),
  ('Galmet Tower 200 2x.', 'GALMET Tower Biwal Sol Pratner SGW(S) s dvumya teploobmennikami 200L (209000) (seraya obivka)', 1152.77, 'dona', 'BOYLER', null),
  ('Galmet Tower 300 2x.', 'GALMET Tower Biwal Sol SGW(S) s dvumya teploobmennikami 300L (309000) (seraya obivka)', 1305.55, 'dona', 'BOYLER', null),
  ('Galmet Tower 200 1x.', 'GALMET Tower SGW(S) 200L s odnim teploobmennikom (208000) (seraya obivka)', 1041.66, 'dona', 'BOYLER', null),
  ('Galmet Tower 300 1x.', 'GALMET Tower SGW(S) 300L s odnim teploobmennikom (308000) (seraya obivka)', 1222.22, 'dona', 'BOYLER', null),
  ('Galmet Tower 500 1x.', 'GALMET Tower SGW(S) 500L s odnim teploobmennikom (504000) (seraya obivka)', 2013.89, 'dona', 'BOYLER', null),
  ('Galmet Vulcan 100 verxniy.', 'GALMET Vulcan Kombi SGW(S) Kwadro napolniy s verxnim podklyucheniem 100L (145500)', 785.00, 'dona', 'BOYLER', null),
  ('Galmet Vulcan 120 verxniy.', 'GALMET Vulcan Kombi SGW(S) Kwadro napolniy s verxnim podklyucheniem 120L (145500)', 833.34, 'dona', 'BOYLER', null),
  ('Galmet Vulcan 140 verxniy.', 'GALMET Vulcan Kombi SGW(S) Kwadro napolniy s verxnim podklyucheniem 140L (145500)', 902.77, 'dona', 'BOYLER', null),
  ('Power 100', 'Power boyler kosvennogo nagreva 100l', 387.50, 'dona', 'BOYLER', null),
  ('Rectam 1000 2x.', 'Rectam 1000l kosvenniy boyler s dvumya zmeevikom', 2569.45, 'dona', 'BOYLER', null),
  ('Rectam 120 verxniy.', 'Rectam 120l kosvenniy boyler s verxney podvodkoy', 833.34, 'dona', 'BOYLER', null),
  ('Rectam 160 1x.', 'Rectam 160l kosvenniy boyler s odnim zmeevikom', 750.00, 'dona', 'BOYLER', null),
  ('Rectam 160 verxniy.', 'Rectam 160l kosvenniy boyler s verxney podvodkoy', 881.95, 'dona', 'BOYLER', null),
  ('Rectam 200 2x.', 'Rectam 200l kosvenniy boyler s dvumya zmeevikom', 888.89, 'dona', 'BOYLER', null),
  ('Rectam 100 1x', 'Rectam 200l kosvenniy boyler s odnim zmeevikom', 870.00, 'dona', 'BOYLER', null),
  ('Rectam 300 2x.', 'Rectam 300l kosvenniy boyler s dvumya zmeevikom', 1041.66, 'dona', 'BOYLER', null),
  ('Rectam 300 1x.', 'Rectam 300l kosvenniy boyler s odnim zmeevikom', 1013.89, 'dona', 'BOYLER', null),
  ('Rectam 500 2x.', 'Rectam 500l kosvenniy boyler s dvumya zmeevikom', 1555.55, 'dona', 'BOYLER', null),
  ('Rectam 500 1x .', 'Rectam 500l kosvenniy boyler s odnim zmeevikom', 1388.89, 'dona', 'BOYLER', null),
  ('Reflex 200 2x.', 'REFLEX  -  Kosvenniy Boyler s dvumya teploobmenikami Storatherm Aqua AF 200/2M_A', 1944.45, 'dona', 'BOYLER', null),
  ('Reflex 300 2x.', 'REFLEX  -  Kosvenniy Boyler s dvumya teploobmenikami Storatherm Aqua AF 300/2M_A', 2083.34, 'dona', 'BOYLER', null),
  ('Reflex 500 2x.', 'REFLEX  -  Kosvenniy Boyler s dvumya teploobmenikami Storatherm Aqua AF 500/2M_A', 3055.55, 'dona', 'BOYLER', null),
  ('Reflex 150 1x.', 'REFLEX  -  Kosvenniy Boyler Storatherm Aqua AF 150/1M_A', 1597.22, 'dona', 'BOYLER', null),
  ('Reflex 200 1x.', 'REFLEX  -  Kosvenniy Boyler Storatherm Aqua AF 200/1M_A', 1666.66, 'dona', 'BOYLER', null),
  ('Reflex 300 1x.', 'REFLEX  -  Kosvenniy Boyler Storatherm Aqua AF 300/1M_A', 1944.45, 'dona', 'BOYLER', null),
  ('Reflex 500 1x.', 'REFLEX  -  Kosvenniy Boyler Storatherm Aqua AF 500/1M_A', 2638.89, 'dona', 'BOYLER', null),
  ('Aquatec 150 verxniy.', 'Royal Thermo AQUATEC INOX RTWX-T 150 napolniy verxnee podklyuchenie', 763.89, 'dona', 'BOYLER', null),
  ('Aquatec 100.', 'Royal Thermo AQUATEC RTWX-F 100', 520.84, 'dona', 'BOYLER', null),
  ('Aquatec 100 ten.', 'Royal Thermo AQUATEC RTWX-F 100.1 Suxoy TEN', 520.84, 'dona', 'BOYLER', null),
  ('Aquatec 100 ten black.', 'Royal Thermo AQUATEC RTWX-F 100.1 Suxoy TEN GRAFIT (cherniy matoviy)', 534.72, 'dona', 'BOYLER', null),
  ('Aquatec 200.', 'Royal Thermo AQUATEC RTWX-F 200', 833.34, 'dona', 'BOYLER', null),
  ('Aquatec 80.', 'Royal Thermo AQUATEC RTWX-F 80', 491.66, 'dona', 'BOYLER', null),
  ('STORM 11', 'Storm vodonagrevatel 100L (vertikal)', 210.00, 'dona', 'BOYLER', null),
  ('STORM 3', 'Storm vodonagrevatel 10L (pod moyka)', 93.75, 'dona', 'BOYLER', null),
  ('STORM 2', 'Storm vodonagrevatel 15L nijniy', 110.00, 'dona', 'BOYLER', null),
  ('STORM 7', 'Storm vodonagrevatel 30L (gorizontal)', 125.00, 'dona', 'BOYLER', null),
  ('STORM 4', 'Storm vodonagrevatel 30L (nad moyka)', 140.00, 'dona', 'BOYLER', null),
  ('STORM 1', 'Storm vodonagrevatel 30L (pod moyka)', 125.00, 'dona', 'BOYLER', null),
  ('STORM 8', 'Storm vodonagrevatel 30L (vertikal)', 125.00, 'dona', 'BOYLER', null),
  ('STORM 6', 'Storm vodonagrevatel 50L (gorizontal)', 149.00, 'dona', 'BOYLER', null),
  ('STORM 10', 'Storm vodonagrevatel 50L (vertikal)', 149.00, 'dona', 'BOYLER', null),
  ('STORM 5', 'Storm vodonagrevatel 80L (gorizontal)', 165.00, 'dona', 'BOYLER', null),
  ('STORM 9', 'Storm vodonagrevatel 80L (vertikal)', 165.00, 'dona', 'BOYLER', null),
  ('Thermex 100V', 'Thermex 100l Vertikal', 185.00, 'dona', 'BOYLER', null),
  ('Thermex 50G', 'Thermex gorizontalniy 50l', 170.00, 'dona', 'BOYLER', null),
  ('Thermex 80G', 'Thermex gorizontalniy 80l', 182.00, 'dona', 'BOYLER', null),
  ('Viessmann 500 2x serebristiy.', 'Viessmann Boyler Bivalentniy Vitocell 100-B CVB 500L serebristiy', 2777.77, 'dona', 'BOYLER', null),
  ('Viessmann 300 2x jemchujno-beliy.', 'Viessmann Boyler Bivalentniy Vitocell 100-W CVBC 300L jemchujno-beliy', 1944.45, 'dona', 'BOYLER', null),
  ('Viessmann 300 2x serebristiy.', 'Viessmann Boyler Bivalentniy Vitocell 100-W CVBC 300L serebristiy', 1875.00, 'dona', 'BOYLER', null),
  ('Viessmann 500 2x jemchujno-beliy.', 'Viessmann Boyler Vitocell 100-B CVB 500L jemchujno-beliy', 2777.77, 'dona', 'BOYLER', null),
  ('Viessmann 200 1x.', 'Viessmann Boyler Vitocell 100-V CVAA 200L', 1527.77, 'dona', 'BOYLER', null),
  ('Viessmann 100 1x.', 'Viessmann Boyler Vitocell 100-W CUGA 100L', 888.89, 'dona', 'BOYLER', null),
  ('Viessmann 150 1x.', 'Viessmann Boyler Vitocell 100-W CUGA 150L', 1069.45, 'dona', 'BOYLER', null),
  ('Viessmann 120 1x.', 'Viessmann Boyler Vitocell 100-W CUGB 120L', 1000.00, 'dona', 'BOYLER', null),
  ('Viessmann 300S', 'Бойлер 300л для солнечного коллектора', 2200.00, 'dona', 'BOYLER', null)
on conflict (artikul) where artikul <> '' do update
  set nomi = excluded.nomi, narx = excluded.narx,
      kategoriya = excluded.kategoriya, kichik_kategoriya = excluded.kichik_kategoriya,
      faol = true;


-- LATUN FITING  (73 ta)
insert into hs_products (artikul, nomi, narx, birlik, kategoriya, kichik_kategoriya) values
  ('latun052.', 'Metal Rakor 1''', 15.00, 'dona', 'LATUN FITING', null),
  ('latun054.', 'Metal Rakor 1''1/2', 50.00, 'dona', 'LATUN FITING', null),
  ('latun053.', 'Metal Rakor 1''1/4', 25.00, 'dona', 'LATUN FITING', null),
  ('latun050.', 'Metal Rakor 1/2', 6.25, 'dona', 'LATUN FITING', null),
  ('latun055.', 'Metal Rakor 2', 75.00, 'dona', 'LATUN FITING', null),
  ('latun051.', 'Metal Rakor 3/4', 8.75, 'dona', 'LATUN FITING', null),
  ('latun038.', 'Mufta latunnaya 1''', 5.00, 'dona', 'LATUN FITING', null),
  ('latun040.', 'Mufta latunnaya 1''1/2', 10.00, 'dona', 'LATUN FITING', null),
  ('latun039.', 'Mufta latunnaya 1''1/4', 8.75, 'dona', 'LATUN FITING', null),
  ('latun036.', 'Mufta latunnaya 1/2', 1.88, 'dona', 'LATUN FITING', null),
  ('latun041.', 'Mufta latunnaya 2', 12.50, 'dona', 'LATUN FITING', null),
  ('latun037.', 'Mufta latunnaya 3/4', 2.50, 'dona', 'LATUN FITING', null),
  ('latun003.', 'NIPEL 1 (Bochonok)', 3.12, 'dona', 'LATUN FITING', null),
  ('latun005.', 'NIPEL 1 1/2 (Bochonok)', 8.75, 'dona', 'LATUN FITING', null),
  ('latun004.', 'NIPEL 1 1/4 (Bochonok)', 10.70, 'dona', 'LATUN FITING', null),
  ('latun001.', 'NIPEL 1/2 (Bochonok)', 1.88, 'dona', 'LATUN FITING', null),
  ('latun006.', 'NIPEL 2 (Bochonok)', 12.50, 'dona', 'LATUN FITING', null),
  ('latun002.', 'NIPEL 3/4 (Bochonok)', 2.50, 'dona', 'LATUN FITING', null),
  ('latun011.', 'Nipel REDUKSIONNIY 1''1/4-1''1/2', 7.50, 'dona', 'LATUN FITING', null),
  ('latun010.', 'Nipel REDUKSIONNIY 1-1''1/4', 6.25, 'dona', 'LATUN FITING', null),
  ('latun007.', 'Nipel REDUKSIONNIY 1/2-3/4', 1.88, 'dona', 'LATUN FITING', null),
  ('latun009.', 'Nipel REDUKSIONNIY 3/4-1', 3.75, 'dona', 'LATUN FITING', null),
  ('latun008.', 'Nipel REDUKSIONNIYl 1/2-1', 3.12, 'dona', 'LATUN FITING', null),
  ('latun009.1', 'Nipel REDUKSIONNIYl 3/4-1''1/4', 5.00, 'dona', 'LATUN FITING', null),
  ('latun015.', 'Obratnaya reduktsiya 1''1/4-1''1/2', 20.00, 'dona', 'LATUN FITING', null),
  ('latun014.', 'Obratnaya reduktsiya 1-1''1/4', 6.25, 'dona', 'LATUN FITING', null),
  ('latun012.', 'Obratnaya reduktsiya 1/2-3/4', 1.88, 'dona', 'LATUN FITING', null),
  ('latun015.2', 'Obratnaya reduktsiya 2-1', 11.56, 'dona', 'LATUN FITING', null),
  ('latun15.0', 'Obratnaya reduktsiya 2-1''1/2', 10.35, 'dona', 'LATUN FITING', null),
  ('latun015.1', 'Obratnaya reduktsiya 2-1''1/4', 9.00, 'dona', 'LATUN FITING', null),
  ('latun013.', 'Obratnaya reduktsiya 3/4-1', 3.12, 'dona', 'LATUN FITING', null),
  ('latun013.1', 'Obratnaya reduktsiya 3/4-1''1/4', 16.80, 'dona', 'LATUN FITING', null),
  ('latun021.1', 'Reduktsiya 1''1/2-1''', 7.14, 'dona', 'LATUN FITING', null),
  ('latun022.', 'Reduktsiya 1''1/2-1''1/4', 6.25, 'dona', 'LATUN FITING', null),
  ('latun021.0', 'Reduktsiya 1''1/2-3/4', 5.87, 'dona', 'LATUN FITING', null),
  ('latun021.', 'Reduktsiya 1''1/4-1', 4.38, 'dona', 'LATUN FITING', null),
  ('latun020.1', 'Reduktsiya 1''1/4-1/2', 8.00, 'dona', 'LATUN FITING', null),
  ('latun019.', 'Reduktsiya 1-1/2', 3.12, 'dona', 'LATUN FITING', null),
  ('latun020.', 'Reduktsiya 1-3/4', 3.20, 'dona', 'LATUN FITING', null),
  ('latun016.', 'Reduktsiya 1/2-1/4', 1.25, 'dona', 'LATUN FITING', null),
  ('latun017.', 'Reduktsiya 1/2-3/8', 1.25, 'dona', 'LATUN FITING', null),
  ('latun023.', 'Reduktsiya 2-1''1/2', 10.00, 'dona', 'LATUN FITING', null),
  ('latun018.', 'Reduktsiya 3/4-1/2', 1.88, 'dona', 'LATUN FITING', null),
  ('latun025.', 'Troynik latunniy  3/4', 6.25, 'dona', 'LATUN FITING', null),
  ('latun026.', 'Troynik latunniy 1''', 8.75, 'dona', 'LATUN FITING', null),
  ('latun028.', 'Troynik latunniy 1''1/2', 30.00, 'dona', 'LATUN FITING', null),
  ('latun027.', 'Troynik latunniy 1''1/4', 17.50, 'dona', 'LATUN FITING', null),
  ('latun029.2', 'Troynik latunniy 1''1/4x3/4x1''1/4', 7.55, 'dona', 'LATUN FITING', null),
  ('latun029.1', 'Troynik latunniy 1''x1/2x1''', 11.96, 'dona', 'LATUN FITING', null),
  ('latun024.', 'Troynik latunniy 1/2', 3.75, 'dona', 'LATUN FITING', null),
  ('latun029.', 'Troynik latunniy 2', 40.00, 'dona', 'LATUN FITING', null),
  ('latun058.', 'Uglavoy metal rakor 1''', 18.75, 'dona', 'LATUN FITING', null),
  ('latun059.', 'Uglavoy metal rakor 1''1/4', 31.25, 'dona', 'LATUN FITING', null),
  ('latun056.', 'Uglavoy metal rakor 1/2', 8.75, 'dona', 'LATUN FITING', null),
  ('latun057.', 'Uglavoy metal rakor 3/4', 10.00, 'dona', 'LATUN FITING', null),
  ('latun032.', 'Ugolnik latunniy 1''', 7.50, 'dona', 'LATUN FITING', null),
  ('latun034.', 'Ugolnik latunniy 1''1/2', 27.50, 'dona', 'LATUN FITING', null),
  ('latun033.', 'Ugolnik latunniy 1''1/4', 16.25, 'dona', 'LATUN FITING', null),
  ('latun030.', 'Ugolnik latunniy 1/2', 3.75, 'dona', 'LATUN FITING', null),
  ('latun035.', 'Ugolnik latunniy 2', 40.00, 'dona', 'LATUN FITING', null),
  ('latun031.', 'Ugolnik latunniy 3/4', 5.00, 'dona', 'LATUN FITING', null),
  ('latun035.3', 'Ugolnik nr/vn 1', 8.00, 'dona', 'LATUN FITING', null),
  ('latun035.5', 'Ugolnik nr/vn 1''1/2', 10.00, 'dona', 'LATUN FITING', null),
  ('latun035.4', 'Ugolnik nr/vn 1''1/4', 9.00, 'dona', 'LATUN FITING', null),
  ('latun044.', 'Zaglushka narujnaya 1', 3.75, 'dona', 'LATUN FITING', null),
  ('latun045.1', 'Zaglushka narujnaya 1 1/2', 8.00, 'dona', 'LATUN FITING', null),
  ('latun045.', 'Zaglushka narujnaya 1 1/4', 6.25, 'dona', 'LATUN FITING', null),
  ('latun042.', 'Zaglushka narujnaya 1/2', 1.25, 'dona', 'LATUN FITING', null),
  ('latun043.', 'Zaglushka narujnaya 3/4', 2.50, 'dona', 'LATUN FITING', null),
  ('latun048.', 'Zaglushka vnutrennaya 1', 3.75, 'dona', 'LATUN FITING', null),
  ('latun049.', 'Zaglushka vnutrennaya 1 1/4', 6.25, 'dona', 'LATUN FITING', null),
  ('latun046.', 'Zaglushka vnutrennaya 1/2', 1.25, 'dona', 'LATUN FITING', null),
  ('latun047.', 'Zaglushka vnutrennaya 3/4', 2.50, 'dona', 'LATUN FITING', null)
on conflict (artikul) where artikul <> '' do update
  set nomi = excluded.nomi, narx = excluded.narx,
      kategoriya = excluded.kategoriya, kichik_kategoriya = excluded.kichik_kategoriya,
      faol = true;


-- FILTR / BWT SLIM  (8 ta)
insert into hs_products (artikul, nomi, narx, birlik, kategoriya, kichik_kategoriya) values
  ('125626936/6-318102.', 'BWT 005 SLIM-S Cartridge', 35.00, 'dona', 'FILTR', 'BWT SLIM'),
  ('125626935/6-318101.', 'BWT 101 SLIM-C Cartridge', 46.25, 'dona', 'FILTR', 'BWT SLIM'),
  ('125626939/6-318105.', 'BWT 105 SLIM-RS Cartridge', 41.25, 'dona', 'FILTR', 'BWT SLIM'),
  ('125626929/6-318002.', 'BWT Pure SLIM 2 UF', 268.75, 'dona', 'FILTR', 'BWT SLIM'),
  ('125696930/6-318003.', 'BWT Pure SLIM 3 - hard water', 337.50, 'dona', 'FILTR', 'BWT SLIM'),
  ('125626931/6-318004.', 'BWT Pure SLIM 3 - soft water', 331.25, 'dona', 'FILTR', 'BWT SLIM'),
  ('125626933/6-318005.', 'BWT Pure SLIM 4 - hard water', 525.00, 'dona', 'FILTR', 'BWT SLIM'),
  ('125626934/6-318006.', 'BWT Pure SLIM 4 - soft water', 412.50, 'dona', 'FILTR', 'BWT SLIM')
on conflict (artikul) where artikul <> '' do update
  set nomi = excluded.nomi, narx = excluded.narx,
      kategoriya = excluded.kategoriya, kichik_kategoriya = excluded.kichik_kategoriya,
      faol = true;


-- FILTR / BWT SOFTNER  (39 ta)
insert into hs_products (artikul, nomi, narx, birlik, kategoriya, kichik_kategoriya) values
  ('125501473 / 7-825413.', 'BWT AQA drink disinfection set', 50.00, 'dona', 'FILTR', 'BWT SOFTNER'),
  ('125255067 / 1-907044', 'BWT AQA drink Pro 60 UV LED 12 Watt', 500.00, 'dona', 'FILTR', 'BWT SOFTNER'),
  ('6-501163/11362.', 'BWT Aquadial Softline 25L Bio', 1750.00, 'dona', 'FILTR', 'BWT SOFTNER'),
  ('6-501161/11360.', 'BWT Aquadial Solftlife 10L Bio filtr-umyagchitel. Avto dezinfektsiya', 1125.00, 'dona', 'FILTR', 'BWT SOFTNER'),
  ('23393/6-180709.', 'BWT BEWADES BLUE 2.0 ULTRAFIOLET', 1750.00, 'dona', 'FILTR', 'BWT SOFTNER'),
  ('23395/6-180711.', 'BWT BEWADES BLUE 3.5 ULTRAFIOLET', 2125.00, 'dona', 'FILTR', 'BWT SOFTNER'),
  ('6-501303/11028.', 'BWT Bewamat  COMB 1 Filtratsiya + umyagchenie', 3018.75, 'dona', 'FILTR', 'BWT SOFTNER'),
  ('6-501360/125637467.', 'BWT Bewamat 10A Umyagchitel', 1500.00, 'dona', 'FILTR', 'BWT SOFTNER'),
  ('6-501178/11325.', 'BWT Bewamat 75 B', 3000.00, 'dona', 'FILTR', 'BWT SOFTNER'),
  ('10868/7-810868.', 'BWT Connection module 1 1/4 BEZ REDUKTOR', 143.75, 'dona', 'FILTR', 'BWT SOFTNER'),
  ('20861/7-820861.', 'BWT Connection module DR 1 1/4 S REDUKTOROM', 312.50, 'dona', 'FILTR', 'BWT SOFTNER'),
  ('11877/6-492031.', 'BWT Connection set DN 32/32 DVGW ShLANGI PODKLYuChENIYa', 206.25, 'dona', 'FILTR', 'BWT SOFTNER'),
  ('125596761 / 7-596761', 'BWT Connection-Modul 3/4 - 100mm', 131.25, 'dona', 'FILTR', 'BWT SOFTNER'),
  ('40385/7-840385.', 'BWT E1 HWS 1 Magistralniy filtr dlya ochistki S REDUKTOROM', 462.50, 'dona', 'FILTR', 'BWT SOFTNER'),
  ('125297204/7-825411.', 'BWT EasyCare Adapter', 31.25, 'dona', 'FILTR', 'BWT SOFTNER'),
  ('125640167 / 7-640167.', 'BWT INFINITY 2S AP Sz.1 (3/4- 1 1/4) Magistralniy filtr dlya ochistki', 1062.50, 'dona', 'FILTR', 'BWT SOFTNER'),
  ('10194/7-596324.', 'BWT INFINITY A Gr.1 (3/4 - 5/4) Magistralniy filtr dlya ochistki', 1150.00, 'dona', 'FILTR', 'BWT SOFTNER'),
  ('10191/7-596325.', 'BWT INFINITY A Gr.2 (1 1/2 - 2) (LF) Magistralniy filtr dlya ochistki', 1500.00, 'dona', 'FILTR', 'BWT SOFTNER'),
  ('10305/7-596315.', 'BWT INFINITY M 3/4 - 1 1/4 Magistralniy filtr dlya ochistki', 500.00, 'dona', 'FILTR', 'BWT SOFTNER'),
  ('125503659/6-680044.', 'BWT Loclean CT (таблетка)', 25.00, 'dona', 'FILTR', 'BWT SOFTNER'),
  ('125664416/7-664416', 'BWT MACH RSF 1 1/4"', 367.00, 'dona', 'FILTR', 'BWT SOFTNER'),
  ('125664415/7-664415', 'BWT MACH RSF 1"', 362.50, 'dona', 'FILTR', 'BWT SOFTNER'),
  ('125596762/7-596762', 'BWT Modul 1" - 100mm', 125.00, 'dona', 'FILTR', 'BWT SOFTNER'),
  ('125596766/7-596766', 'BWT Modul DR 1 1/4 - 130mm', 425.00, 'dona', 'FILTR', 'BWT SOFTNER'),
  ('13912/6-315043.', 'BWT MULTI 1000 C prednaznachen dlya udaleniya iz vodi', 1750.00, 'dona', 'FILTR', 'BWT SOFTNER'),
  ('6-315046/13919.', 'BWT MULTI 2000 S prednaznachen dlya udaleniya iz vodi+JELEZO', 2500.00, 'dona', 'FILTR', 'BWT SOFTNER'),
  ('6-315044/13921.', 'BWT MULTI 2000.2 C', 2062.50, 'dona', 'FILTR', 'BWT SOFTNER'),
  ('6-315045/13922.', 'BWT MULTI 3000.2 C', 2250.00, 'dona', 'FILTR', 'BWT SOFTNER'),
  ('6-315031/13901.', 'BWT MULTI 7000 C  prednaznachen dlya udaleniya iz vodi', 3062.50, 'dona', 'FILTR', 'BWT SOFTNER'),
  ('11601/6-500197.', 'BWT PERLA SETA Umyagchitel', 5500.00, 'dona', 'FILTR', 'BWT SOFTNER'),
  ('11020/6-501291.', 'BWT Perla Silk S BIO Umyagchitel', 1875.00, 'dona', 'FILTR', 'BWT SOFTNER'),
  ('11022/6-501293.', 'BWT Perla Silk XL BIO Umyagchitel', 2250.00, 'dona', 'FILTR', 'BWT SOFTNER'),
  ('40370/840370.', 'BWT R1 HWS 1 (LF) Magistralniy filtr dlya ochistki S REDUKTOROM', 475.00, 'dona', 'FILTR', 'BWT SOFTNER'),
  ('40371/7-840371.', 'BWT R1 HWS 5/4 (LF) Magistralniy filtr dlya ochistki S REDUKTOROM', 625.00, 'dona', 'FILTR', 'BWT SOFTNER'),
  ('40365/840365.', 'BWT R1 RSF 1 (LF) Magistralniy filtr dlya ochistki', 375.00, 'dona', 'FILTR', 'BWT SOFTNER'),
  ('40366/7-840366.', 'BWT R1 RSF 5/4 (LF) Magistralniy filtr dlya ochistki', 425.00, 'dona', 'FILTR', 'BWT SOFTNER'),
  ('94239/8-013004.', 'BWT Regeneration salt tabs 25kg sol', 78.75, 'dona', 'FILTR', 'BWT SOFTNER'),
  ('11552/6-512740.', 'BWT RONDOMAT DUO 3.2 Umyagchitel', 9375.00, 'dona', 'FILTR', 'BWT SOFTNER'),
  ('30999/7-830999.', 'MULTIBLOCK X 1''', 225.00, 'dona', 'FILTR', 'BWT SOFTNER')
on conflict (artikul) where artikul <> '' do update
  set nomi = excluded.nomi, narx = excluded.narx,
      kategoriya = excluded.kategoriya, kichik_kategoriya = excluded.kichik_kategoriya,
      faol = true;


-- FILTR / BWT WODA-PURE  (16 ta)
insert into hs_products (artikul, nomi, narx, birlik, kategoriya, kichik_kategoriya) values
  ('21100/7-821100.', 'BWT AQA drink Thero 90 blue', 1400.00, 'dona', 'FILTR', 'BWT WODA-PURE'),
  ('12827/7-812827.', 'BWT THERO', 1400.00, 'dona', 'FILTR', 'BWT WODA-PURE'),
  ('7-812828.', 'BWT Thero cartridge', 275.00, 'dona', 'FILTR', 'BWT WODA-PURE'),
  ('125595502/7-595502.', 'BWT Woda-Pure Mineralizer M Mg + Zinc', 275.00, 'dona', 'FILTR', 'BWT WODA-PURE'),
  ('125595500/7-595500.', 'BWT Woda-Pure Mineralizer M Mg+CUF CARE', 337.50, 'dona', 'FILTR', 'BWT WODA-PURE'),
  ('125595499/7-595499.', 'BWT Woda-Pure Mineralizer XL Mg+ CUF PROTECT', 375.00, 'dona', 'FILTR', 'BWT WODA-PURE'),
  ('12540/7-812540.', 'BWT Woda-Pure XL-CUF Cartr. single', 587.50, 'dona', 'FILTR', 'BWT WODA-PURE'),
  ('7-812580/12580.', 'Magnezium mineralization Filter Head (derjatel/golova dlya kartridj)', 112.50, 'dona', 'FILTR', 'BWT WODA-PURE'),
  ('7-812568/12568.', 'Woda Pure Clear Mineralizer M Cartridge 3800 l mineralizatsiya+ antioksidant', 250.00, 'dona', 'FILTR', 'BWT WODA-PURE'),
  ('7-812533/12533.', 'Woda Pure Filter held derjatel/golova dlya kartridj', 105.00, 'dona', 'FILTR', 'BWT WODA-PURE'),
  ('7-812561/12561.', 'Woda Pure S-C Cartridge antixlorin 12000litr (ochishaet zapax+vkus)', 112.50, 'dona', 'FILTR', 'BWT WODA-PURE'),
  ('7-812539/12539.', 'Woda Pure S-CUF Cartridge antibakteria, xlor, chastitsi 12000 litr', 375.00, 'dona', 'FILTR', 'BWT WODA-PURE'),
  ('7-812565/12565.', 'Woda Pure S-F1 Cartridge antichastitsi (pervaya ochistka gryaz+pesok)', 100.00, 'dona', 'FILTR', 'BWT WODA-PURE'),
  ('7-812538/12538.', 'Woda Pure S-F5 Cartidge antichastitsi (pervaya ochistka gryaz+pesok)', 143.75, 'dona', 'FILTR', 'BWT WODA-PURE'),
  ('7-812566/12566.', 'Woda Pure S-UF Cartride', 212.50, 'dona', 'FILTR', 'BWT WODA-PURE'),
  ('7-812563/12563.', 'Woda Pure Soft mini M Cartridge 10000 l mineralizatsiya', 212.50, 'dona', 'FILTR', 'BWT WODA-PURE')
on conflict (artikul) where artikul <> '' do update
  set nomi = excluded.nomi, narx = excluded.narx,
      kategoriya = excluded.kategoriya, kichik_kategoriya = excluded.kichik_kategoriya,
      faol = true;


-- FILTR / BWT ZAPCHAST  (8 ta)
insert into hs_products (artikul, nomi, narx, birlik, kategoriya, kichik_kategoriya) values
  ('18997E/6-541046.', 'BWT Aquatest hardness test', 25.00, 'dona', 'FILTR', 'BWT ZAPCHAST'),
  ('23855/6-181050.', 'BWT Bewades UV- Lamp 2.0', 275.00, 'dona', 'FILTR', 'BWT ZAPCHAST'),
  ('7-810376/10376.', 'BWT E1 filtering element 30mm', 43.75, 'dona', 'FILTR', 'BWT ZAPCHAST'),
  ('7-810386/10386.', 'BWT E1 filtering elemet 100 mm', 35.00, 'dona', 'FILTR', 'BWT ZAPCHAST'),
  ('2-060966.', 'BWT Filling Multipur 2000C ZASIPKA', 393.75, 'dona', 'FILTR', 'BWT ZAPCHAST'),
  ('2-060967.', 'BWT Filling Multipur 3000C ZASIPKA', 475.00, 'dona', 'FILTR', 'BWT ZAPCHAST'),
  ('10858/6-630049.', 'BWT Minox S 16kg ZASIPKA DLYa COMB1', 668.75, 'dona', 'FILTR', 'BWT ZAPCHAST'),
  ('1-905332.', 'BWT Thero kartridj', 281.25, 'dona', 'FILTR', 'BWT ZAPCHAST')
on conflict (artikul) where artikul <> '' do update
  set nomi = excluded.nomi, narx = excluded.narx,
      kategoriya = excluded.kategoriya, kichik_kategoriya = excluded.kichik_kategoriya,
      faol = true;


-- PRESS FITING  (61 ta)
insert into hs_products (artikul, nomi, narx, birlik, kategoriya, kichik_kategoriya) values
  ('press057.', 'Fiting press (kontsovka) 1-16x2.0 dlya kollektora', 8.57, 'dona', 'PRESS FITING', null),
  ('press053.', 'Montajnaya planka dlya press ushastika', 5.36, 'dona', 'PRESS FITING', null),
  ('press033.', 'Press adapter Nr 20-1/2', 9.82, 'dona', 'PRESS FITING', null),
  ('press034.', 'Press adapter Nr 20-3/4', 11.61, 'dona', 'PRESS FITING', null),
  ('press035.', 'Press adapter Nr 26-1*', 15.36, 'dona', 'PRESS FITING', null),
  ('press036.', 'Press adapter Nr 32-1*', 17.50, 'dona', 'PRESS FITING', null),
  ('press037.', 'Press adapter Nr 32-1,1/4', 38.39, 'dona', 'PRESS FITING', null),
  ('press042.', 'Press adapter vn 16-1/2', 6.70, 'dona', 'PRESS FITING', null),
  ('press043.', 'Press adapter vn 20-1/2', 10.45, 'dona', 'PRESS FITING', null),
  ('press044.', 'Press adapter vn 20-3/4', 9.11, 'dona', 'PRESS FITING', null),
  ('press045.', 'Press adapter vn 26-1*', 14.20, 'dona', 'PRESS FITING', null),
  ('press044.1', 'Press adapter vn 26-3/4', 13.00, 'dona', 'PRESS FITING', null),
  ('press046.', 'Press adapter vn 32-1*', 21.36, 'dona', 'PRESS FITING', null),
  ('press032.', 'Press Adaptor Nr 16-1/2', 7.14, 'dona', 'PRESS FITING', null),
  ('press059.', 'Press chrome kran 16/16', 45.00, 'dona', 'PRESS FITING', null),
  ('press025.', 'Press inegal troynik 16/16/20', 10.36, 'dona', 'PRESS FITING', null),
  ('press021.', 'Press inegal troynik 16/20/16', 10.36, 'dona', 'PRESS FITING', null),
  ('press026.', 'Press inegal troynik 20/16/20', 11.25, 'dona', 'PRESS FITING', null),
  ('press022.', 'Press inegal troynik 20/26/20', 15.54, 'dona', 'PRESS FITING', null),
  ('press023.', 'Press inegal troynik 20/32/20', 24.82, 'dona', 'PRESS FITING', null),
  ('press027.', 'Press inegal troynik 26/16/26', 15.18, 'dona', 'PRESS FITING', null),
  ('press028.', 'Press inegal troynik 26/20/26', 16.61, 'dona', 'PRESS FITING', null),
  ('press024.', 'Press inegal troynik 26/32/26', 23.57, 'dona', 'PRESS FITING', null),
  ('press029.', 'Press inegal troynik 32/16/32', 22.32, 'dona', 'PRESS FITING', null),
  ('press030.', 'Press inegal troynik 32/20/32', 25.18, 'dona', 'PRESS FITING', null),
  ('press031.', 'Press inegal troynik 32/26/32', 25.54, 'dona', 'PRESS FITING', null),
  ('press001.', 'Press mufta 16/16', 5.36, 'dona', 'PRESS FITING', null),
  ('press002.', 'Press mufta 20/20', 6.96, 'dona', 'PRESS FITING', null),
  ('press003.', 'Press mufta 26/26', 10.89, 'dona', 'PRESS FITING', null),
  ('press004.', 'Press mufta 32/32', 16.07, 'dona', 'PRESS FITING', null),
  ('press005.', 'Press otvod 16/16', 5.71, 'dona', 'PRESS FITING', null),
  ('press006.', 'Press otvod 20/20', 7.50, 'dona', 'PRESS FITING', null),
  ('press007.', 'Press otvod 26/26', 12.32, 'dona', 'PRESS FITING', null),
  ('press008.', 'Press otvod 32/32', 17.14, 'dona', 'PRESS FITING', null),
  ('press038.', 'Press otvod Nr 16-1/2', 9.11, 'dona', 'PRESS FITING', null),
  ('press039.', 'Press otvod Nr 20-1/2', 10.54, 'dona', 'PRESS FITING', null),
  ('press040.', 'Press otvod Nr 26-1*', 17.41, 'dona', 'PRESS FITING', null),
  ('press041.', 'Press otvod Nr 32-1*', 24.82, 'dona', 'PRESS FITING', null),
  ('press050.', 'Press otvod s udlinennim korpusom Vn 16-1/2', 9.82, 'dona', 'PRESS FITING', null),
  ('press046.1', 'Press otvod vn 16x1/2', 9.00, 'dona', 'PRESS FITING', null),
  ('press047.', 'Press otvod vn 26/3*1', 18.80, 'dona', 'PRESS FITING', null),
  ('press048.', 'Press otvod vn 32/3*1', 22.55, 'dona', 'PRESS FITING', null),
  ('press015.', 'Press perexodnik 16/20', 6.51, 'dona', 'PRESS FITING', null),
  ('press016.', 'Press perexodnik 16/26', 9.29, 'dona', 'PRESS FITING', null),
  ('press017.', 'Press perexodnik 16/32', 12.32, 'dona', 'PRESS FITING', null),
  ('press018.', 'Press perexodnik 20/26', 9.20, 'dona', 'PRESS FITING', null),
  ('press019.', 'Press perexodnik 20/32', 12.14, 'dona', 'PRESS FITING', null),
  ('press020.', 'Press perexodnik 26/32', 12.68, 'dona', 'PRESS FITING', null),
  ('press009.', 'Press poluotvod 26/26', 16.96, 'dona', 'PRESS FITING', null),
  ('press010.', 'Press poluotvod 32/32', 19.46, 'dona', 'PRESS FITING', null),
  ('press011.', 'Press troynik 16/16/16', 8.92, 'dona', 'PRESS FITING', null),
  ('press012.', 'Press troynik 20/20/20', 10.71, 'dona', 'PRESS FITING', null),
  ('press013.', 'Press troynik 26/26/26', 16.43, 'dona', 'PRESS FITING', null),
  ('press014.', 'Press troynik 32/32/32', 27.32, 'dona', 'PRESS FITING', null),
  ('press049.', 'Press Troynik Vn 16-1/2', 9.82, 'dona', 'PRESS FITING', null),
  ('press051.', 'Press Ushastik Vn 16-1/2', 10.71, 'dona', 'PRESS FITING', null),
  ('press052.', 'Press Ushastik Vn Dvoynoy 16-1/2', 25.00, 'dona', 'PRESS FITING', null),
  ('press056.', 'Press xromirovanniy kran 16/16', 48.21, 'dona', 'PRESS FITING', null),
  ('press058.', 'Smazka dlya press fitinga 50g', 26.79, 'dona', 'PRESS FITING', null),
  ('press054.', 'U-obrazniy press ushastik dlya retsirkulyatsionnoy sistemi Vn 16-1/2', 25.54, 'dona', 'PRESS FITING', null),
  ('press055.', 'U-obrazniy press ushastik dlya retsirkulyatsionnoy sistemi Vn 20-1/2', 32.14, 'dona', 'PRESS FITING', null)
on conflict (artikul) where artikul <> '' do update
  set nomi = excluded.nomi, narx = excluded.narx,
      kategoriya = excluded.kategoriya, kichik_kategoriya = excluded.kichik_kategoriya,
      faol = true;


-- RASH.BAK / RASHBAK  (27 ta)
insert into hs_products (artikul, nomi, narx, birlik, kategoriya, kichik_kategoriya) values
  ('Imera 2.', 'IMERA Italy Rasshiritelniy bak krasniy 12l (8 bar, D20)', 42.50, 'dona', 'RASH.BAK', 'RASHBAK'),
  ('Imera 3.', 'IMERA Italy Rasshiritelniy bak krasniy 18l (8 bar, D20)', 48.21, 'dona', 'RASH.BAK', 'RASHBAK'),
  ('Imera 4.', 'IMERA Italy Rasshiritelniy bak krasniy 24l (8 bar, D20)', 51.79, 'dona', 'RASH.BAK', 'RASHBAK'),
  ('Imera 5.', 'IMERA Italy Rasshiritelniy bak krasniy 35l (8 bar, D20)', 81.25, 'dona', 'RASH.BAK', 'RASHBAK'),
  ('Imera 5.1', 'IMERA Italy Rasshiritelniy bak krasniy 50l', 80.00, 'dona', 'RASH.BAK', 'RASHBAK'),
  ('Imera 1.', 'IMERA Italy Rasshiritelniy bak krasniy 8l (8 bar, D20)', 36.61, 'dona', 'RASH.BAK', 'RASHBAK'),
  ('Imera 9.', 'IMERA Italy Rasshiritelniy bak s nojkami krasniy 100l (8 bar, D25)', 191.08, 'dona', 'RASH.BAK', 'RASHBAK'),
  ('Imera 10.', 'IMERA Italy Rasshiritelniy bak s nojkami krasniy 150l (8 bar, D25)', 289.29, 'dona', 'RASH.BAK', 'RASHBAK'),
  ('Imera 11.', 'IMERA Italy Rasshiritelniy bak s nojkami krasniy 200l (8 bar, D25)', 353.57, 'dona', 'RASH.BAK', 'RASHBAK'),
  ('Imera 12.', 'IMERA Italy Rasshiritelniy bak s nojkami krasniy 300l (8 bar, D25)', 558.92, 'dona', 'RASH.BAK', 'RASHBAK'),
  ('Imera 6.', 'IMERA Italy Rasshiritelniy bak s nojkami krasniy 35l (8 bar, D20)', 83.04, 'dona', 'RASH.BAK', 'RASHBAK'),
  ('Imera 13.', 'IMERA Italy Rasshiritelniy bak s nojkami krasniy 500l (8 bar, D32)', 982.14, 'dona', 'RASH.BAK', 'RASHBAK'),
  ('Imera 7.', 'IMERA Italy Rasshiritelniy bak s nojkami krasniy 50l (8 bar, D20)', 98.21, 'dona', 'RASH.BAK', 'RASHBAK'),
  ('Imera 8.', 'IMERA Italy Rasshiritelniy bak s nojkami krasniy 80l (8 bar, D25)', 153.57, 'dona', 'RASH.BAK', 'RASHBAK'),
  ('Imera 20.', 'IMERA Italy Rasshiritelniy bak s nojkami siniy 100l (10 bar, D25)', 273.21, 'dona', 'RASH.BAK', 'RASHBAK'),
  ('Imera 21.', 'IMERA Italy Rasshiritelniy bak s nojkami siniy 300l (10 bar, D32)', 848.21, 'dona', 'RASH.BAK', 'RASHBAK'),
  ('Imera 17.1', 'IMERA Italy Rasshiritelniy bak s nojkami siniy 35l (10 bar, D25)', 95.00, 'dona', 'RASH.BAK', 'RASHBAK'),
  ('Imera 18.', 'IMERA Italy Rasshiritelniy bak s nojkami siniy 50l (10 bar, D25)', 144.64, 'dona', 'RASH.BAK', 'RASHBAK'),
  ('Imera 19.', 'IMERA Italy Rasshiritelniy bak s nojkami siniy 80l (10 bar, D25)', 214.29, 'dona', 'RASH.BAK', 'RASHBAK'),
  ('Imera 22.', 'IMERA Italy Rasshiritelniy bak seriy 12l (10 bar, D20)', 56.25, 'dona', 'RASH.BAK', 'RASHBAK'),
  ('Imera 23.', 'IMERA Italy Rasshiritelniy bak seriy 18l (10 bar, D20)', 58.92, 'dona', 'RASH.BAK', 'RASHBAK'),
  ('Imera 24.', 'IMERA Italy Rasshiritelniy bak seriy 24l (10 bar, D25)', 61.61, 'dona', 'RASH.BAK', 'RASHBAK'),
  ('Imera 25.', 'IMERA Italy Rasshiritelniy bak seriy 35l (10 bar, D25)', 104.46, 'dona', 'RASH.BAK', 'RASHBAK'),
  ('Imera 14.', 'IMERA Italy Rasshiritelniy bak siniy 12l (10 bar, D20)', 44.29, 'dona', 'RASH.BAK', 'RASHBAK'),
  ('Imera 15.', 'IMERA Italy Rasshiritelniy bak siniy 18l (10 bar, D20)', 53.21, 'dona', 'RASH.BAK', 'RASHBAK'),
  ('Imera 16.', 'IMERA Italy Rasshiritelniy bak siniy 24l (10 bar, D25)', 53.57, 'dona', 'RASH.BAK', 'RASHBAK'),
  ('Imera 17.', 'IMERA Italy Rasshiritelniy bak siniy 35l (10 bar, D25)', 89.29, 'dona', 'RASH.BAK', 'RASHBAK')
on conflict (artikul) where artikul <> '' do update
  set nomi = excluded.nomi, narx = excluded.narx,
      kategoriya = excluded.kategoriya, kichik_kategoriya = excluded.kichik_kategoriya,
      faol = true;


-- RASH.BAK / REFLEX  (32 ta)
insert into hs_products (artikul, nomi, narx, birlik, kategoriya, kichik_kategoriya) values
  ('REFLEX - Rasheritelniy bak 10 L ( dlya kotlov ).', 'REFLEX - Rasheritelniy bak 10 L ( dlya kotlov )', 125.00, 'dona', 'RASH.BAK', 'REFLEX'),
  ('REFLEX - Rasheritelniy bak 100 L ( Seriy ).', 'REFLEX - Rasheritelniy bak 100 L ( Seriy )', 281.25, 'dona', 'RASH.BAK', 'REFLEX'),
  ('REFLEX - Rasheritelniy bak 1000 L ( Seriy ).', 'REFLEX - Rasheritelniy bak 1000 L ( Seriy )', 2270.31, 'dona', 'RASH.BAK', 'REFLEX'),
  ('REFLEX - Rasheritelniy bak 12 L ( dlya kotlov ).', 'REFLEX - Rasheritelniy bak 12 L ( dlya kotlov )', 132.81, 'dona', 'RASH.BAK', 'REFLEX'),
  ('REFLEX - Rasheritelniy bak 18 L ( Seriy ).', 'REFLEX - Rasheritelniy bak 18 L ( Seriy )', 73.44, 'dona', 'RASH.BAK', 'REFLEX'),
  ('REFLEX Slim S18', 'REFLEX - Rasheritelniy bak 18 L (Slim Navesnoy ) ( Seriy )', 226.56, 'dona', 'RASH.BAK', 'REFLEX'),
  ('REFLEX - Rasheritelniy bak 200 L ( Seriy ).', 'REFLEX - Rasheritelniy bak 200 L ( Seriy )', 625.00, 'dona', 'RASH.BAK', 'REFLEX'),
  ('REFLEX - Rasheritelniy bak 25 L ( Seriy ).', 'REFLEX - Rasheritelniy bak 25 L ( Seriy )', 79.69, 'dona', 'RASH.BAK', 'REFLEX'),
  ('REFLEX Slim S25', 'REFLEX - Rasheritelniy bak 25 L (Slim Navesnoy ) ( Seriy )', 257.81, 'dona', 'RASH.BAK', 'REFLEX'),
  ('REFLEX - Rasheritelniy bak 300 L ( Seriy ).', 'REFLEX - Rasheritelniy bak 300 L ( Seriy )', 734.38, 'dona', 'RASH.BAK', 'REFLEX'),
  ('REFLEX - Rasheritelniy bak 35 L ( Seriy ).', 'REFLEX - Rasheritelniy bak 35 L ( Seriy )', 110.94, 'dona', 'RASH.BAK', 'REFLEX'),
  ('REFLEX Slim S35', 'REFLEX - Rasheritelniy bak 35 L (Slim Navesnoy ) ( Seriy )', 273.44, 'dona', 'RASH.BAK', 'REFLEX'),
  ('REFLEX - Rasheritelniy bak 50 L ( Seriy ).', 'REFLEX - Rasheritelniy bak 50 L ( Seriy )', 142.19, 'dona', 'RASH.BAK', 'REFLEX'),
  ('REFLEX - Rasheritelniy bak 500 L ( Seriy ).', 'REFLEX - Rasheritelniy bak 500 L ( Seriy )', 1156.25, 'dona', 'RASH.BAK', 'REFLEX'),
  ('REFLEX - Rasheritelniy bak 8 L ( dlya kotlov ).', 'REFLEX - Rasheritelniy bak 8 L ( dlya kotlov )', 109.38, 'dona', 'RASH.BAK', 'REFLEX'),
  ('REFLEX - Rasheritelniy bak 80 L ( Seriy ).', 'REFLEX - Rasheritelniy bak 80 L ( Seriy )', 223.44, 'dona', 'RASH.BAK', 'REFLEX'),
  ('REFLEX - Rasheritelniy bak 800 L ( Seriy ).', 'REFLEX - Rasheritelniy bak 800 L ( Seriy )', 1804.69, 'dona', 'RASH.BAK', 'REFLEX'),
  ('REFLEX Slim S50', 'REFLEX - Rasheritelniy bak dlya 50 L ( Seriy Slim Navesnoy )', 343.75, 'dona', 'RASH.BAK', 'REFLEX'),
  ('REFLEX - Rasheritelniy bak dlya GVS 100 L.', 'REFLEX - Rasheritelniy bak dlya GVS 100 L', 410.94, 'dona', 'RASH.BAK', 'REFLEX'),
  ('REFLEX - Rasheritelniy bak dlya GVS 18 L.', 'REFLEX - Rasheritelniy bak dlya GVS 18 L', 103.12, 'dona', 'RASH.BAK', 'REFLEX'),
  ('REFLEX Slim B18', 'REFLEX - Rasheritelniy bak dlya GVS 18 L (Slim Navesnoy )', 287.50, 'dona', 'RASH.BAK', 'REFLEX'),
  ('REFLEX - Rasheritelniy bak dlya GVS 200 L.', 'REFLEX - Rasheritelniy bak dlya GVS 200 L', 937.50, 'dona', 'RASH.BAK', 'REFLEX'),
  ('REFLEX - Rasheritelniy bak dlya GVS 25 L.', 'REFLEX - Rasheritelniy bak dlya GVS 25 L', 117.19, 'dona', 'RASH.BAK', 'REFLEX'),
  ('REFLEX Slim B25', 'REFLEX - Rasheritelniy bak dlya GVS 25 L (Slim Navesnoy )', 376.56, 'dona', 'RASH.BAK', 'REFLEX'),
  ('REFLEX - Rasheritelniy bak dlya GVS 300 L.', 'REFLEX - Rasheritelniy bak dlya GVS 300 L', 1000.00, 'dona', 'RASH.BAK', 'REFLEX'),
  ('REFLEX - Rasheritelniy bak dlya GVS 33 L.', 'REFLEX - Rasheritelniy bak dlya GVS 33 L', 150.00, 'dona', 'RASH.BAK', 'REFLEX'),
  ('REFLEX Slim B35', 'REFLEX - Rasheritelniy bak dlya GVS 35 L (Slim Navesnoy )', 453.12, 'dona', 'RASH.BAK', 'REFLEX'),
  ('REFLEX - Rasheritelniy bak dlya GVS 50 L.', 'REFLEX - Rasheritelniy bak dlya GVS 50 L', 267.19, 'dona', 'RASH.BAK', 'REFLEX'),
  ('REFLEX Slim B50', 'REFLEX - Rasheritelniy bak dlya GVS 50 L (Slim Navesnoy )', 687.50, 'dona', 'RASH.BAK', 'REFLEX'),
  ('REFLEX - Rasheritelniy bak dlya GVS 500 L.', 'REFLEX - Rasheritelniy bak dlya GVS 500 L', 1526.56, 'dona', 'RASH.BAK', 'REFLEX'),
  ('REFLEX - Rasheritelniy bak dlya GVS 80 L.', 'REFLEX - Rasheritelniy bak dlya GVS 80 L', 368.75, 'dona', 'RASH.BAK', 'REFLEX'),
  ('REFLEX Slim B80', 'REFLEX - Rasheritelniy bak dlya GVS 80 L (Slim Navesnoy )', 781.25, 'dona', 'RASH.BAK', 'REFLEX')
on conflict (artikul) where artikul <> '' do update
  set nomi = excluded.nomi, narx = excluded.narx,
      kategoriya = excluded.kategoriya, kichik_kategoriya = excluded.kichik_kategoriya,
      faol = true;


-- GAZ / GECA  (25 ta)
insert into hs_products (artikul, nomi, narx, birlik, kategoriya, kichik_kategoriya) values
  ('Geca G4.', 'GECA BOSTON Gazoanalizator O2+CO+NO', 2191.14, 'dona', 'GAZ', 'GECA'),
  ('Geca E7.', 'GECA Elektromagnitniy klapan (medl.otkr.) 360MBAR 2', 342.00, 'dona', 'GAZ', 'GECA'),
  ('Geca E3.', 'GECA Elektromagnitniy klapan gaza P.MAX 360MBAR 1', 101.56, 'dona', 'GAZ', 'GECA'),
  ('Geca E1.', 'GECA Elektromagnitniy klapan gaza P.MAX 360MBAR 1/2', 70.31, 'dona', 'GAZ', 'GECA'),
  ('Geca E5.', 'GECA Elektromagnitniy klapan gaza P.MAX 360MBAR 11/2', 226.56, 'dona', 'GAZ', 'GECA'),
  ('Geca E4.', 'GECA Elektromagnitniy klapan gaza P.MAX 360MBAR 11/4', 207.81, 'dona', 'GAZ', 'GECA'),
  ('Geca E6.', 'GECA Elektromagnitniy klapan gaza P.MAX 360MBAR 2', 249.99, 'dona', 'GAZ', 'GECA'),
  ('Geca E2.', 'GECA Elektromagnitniy klapan gaza P.MAX 360MBAR 3/4', 70.31, 'dona', 'GAZ', 'GECA'),
  ('Geca F3.', 'GECA Filtr dlya gaza R.MAX 6bar 1 DN25', 12.49, 'dona', 'GAZ', 'GECA'),
  ('Geca F1.', 'GECA Filtr dlya gaza R.MAX 6bar 1/2 DN15', 12.49, 'dona', 'GAZ', 'GECA'),
  ('Geca F5.', 'GECA Filtr dlya gaza R.MAX 6bar 11/2 DN40', 57.75, 'dona', 'GAZ', 'GECA'),
  ('Geca F4.', 'GECA Filtr dlya gaza R.MAX 6bar 11/4 DN32', 53.76, 'dona', 'GAZ', 'GECA'),
  ('Geca F6.', 'GECA Filtr dlya gaza R.MAX 6bar 2 DN50', 61.61, 'dona', 'GAZ', 'GECA'),
  ('Geca F2.', 'GECA Filtr dlya gaza R.MAX 6bar 3/4 DN20', 12.49, 'dona', 'GAZ', 'GECA'),
  ('Geca G3.', 'GECA Gazoviy Detektor AERIS FOR LPG', 154.69, 'dona', 'GAZ', 'GECA'),
  ('Geca G1.', 'GECA Gazoviy Detektor GAMMA 1/2 Pmax 550mbar', 171.88, 'dona', 'GAZ', 'GECA'),
  ('Geca G2.', 'GECA Gazoviy Detektor GAMMA 652/O FOR LPG', 171.88, 'dona', 'GAZ', 'GECA'),
  ('Geca G5.', 'GECA Gazoviy Detektor Rivelat SE235KG', 225.69, 'dona', 'GAZ', 'GECA'),
  ('Geca R3.', 'GECA Reduktor gaza R.MAX 1bar 1 DN25', 72.90, 'dona', 'GAZ', 'GECA'),
  ('Geca R1.', 'GECA Reduktor gaza R.MAX 1bar 1/2 DN15', 72.90, 'dona', 'GAZ', 'GECA'),
  ('Geca R5.', 'GECA Reduktor gaza R.MAX 1bar 11/2 DN40', 173.44, 'dona', 'GAZ', 'GECA'),
  ('Geca R4.', 'GECA Reduktor gaza R.MAX 1bar 11/4 DN32', 171.86, 'dona', 'GAZ', 'GECA'),
  ('Geca R6.', 'GECA Reduktor gaza R.MAX 1bar 2 DN50', 265.62, 'dona', 'GAZ', 'GECA'),
  ('Geca R2.', 'GECA Reduktor gaza R.MAX 1bar 3/4 DN20', 72.90, 'dona', 'GAZ', 'GECA'),
  ('Geca T1.', 'GECA Trexxodovoy kran dlya gaz. manometra M/F 1/4', 21.86, 'dona', 'GAZ', 'GECA')
on conflict (artikul) where artikul <> '' do update
  set nomi = excluded.nomi, narx = excluded.narx,
      kategoriya = excluded.kategoriya, kichik_kategoriya = excluded.kichik_kategoriya,
      faol = true;


-- GAZ / MADAS  (11 ta)
insert into hs_products (artikul, nomi, narx, birlik, kategoriya, kichik_kategoriya) values
  ('FM050000 B50.', 'Filtr dlya gaza FM DN 32 50?M P.MAX 6 BAR 1 PP-0015', 65.62, 'dona', 'GAZ', 'MADAS'),
  ('FMC02 A50.', 'Filtr dlya gaza P.MAX 2 bar DN 15', 14.85, 'dona', 'GAZ', 'MADAS'),
  ('FMC03A50.', 'Filtr dlya gaza P.MAX 2 bar DN 20', 14.85, 'dona', 'GAZ', 'MADAS'),
  ('FMC04 A50.', 'Filtr dlya gaza P.MAX 2 bar DN 25', 14.85, 'dona', 'GAZ', 'MADAS'),
  ('FM070000 B50.', 'Filtr gazoviy FM DN 50 50pM P.MAX 6 BAR 1 PP-0015', 82.81, 'dona', 'GAZ', 'MADAS'),
  ('FC02 020.', 'Reduktor dav. gaza P.MAX 1 bar DN 15', 93.51, 'dona', 'GAZ', 'MADAS'),
  ('FC03 020.', 'Reduktor dav. gaza P.MAX 1 bar DN 20', 93.51, 'dona', 'GAZ', 'MADAS'),
  ('FC04 020.', 'Reduktor dav. gaza P.MAX 1 bar DN 25', 93.51, 'dona', 'GAZ', 'MADAS'),
  ('FC05 030.', 'Reduktor dav. gaza P.MAX 1 bar DN 32 (20-36 MBAR PE)', 207.81, 'dona', 'GAZ', 'MADAS'),
  ('FC05 040.', 'Reduktor dav. gaza P.MAX 1 bar DN 32 (33-58 MBAR PE)', 207.81, 'dona', 'GAZ', 'MADAS'),
  ('FC06 030.', 'Reduktor dav. gaza P.MAX 1 bar DN 40 (20-36 MBAR PE)', 210.94, 'dona', 'GAZ', 'MADAS')
on conflict (artikul) where artikul <> '' do update
  set nomi = excluded.nomi, narx = excluded.narx,
      kategoriya = excluded.kategoriya, kichik_kategoriya = excluded.kichik_kategoriya,
      faol = true;


-- NERJAVEYKA  (27 ta)
insert into hs_products (artikul, nomi, narx, birlik, kategoriya, kichik_kategoriya) values
  ('CH15.', 'Chashka d15', 1.56, 'dona', 'NERJAVEYKA', null),
  ('10 FALD.', 'Gidrokollektor 10 FALD', 1484.38, 'dona', 'NERJAVEYKA', null),
  ('2 FALD.', 'Gidrokollektor 2 FALD', 312.50, 'dona', 'NERJAVEYKA', null),
  ('3 FALD.', 'Gidrokollektor 3 FALD', 445.31, 'dona', 'NERJAVEYKA', null),
  ('4 FALD.', 'Gidrokollektor 4 FALD', 593.75, 'dona', 'NERJAVEYKA', null),
  ('5 FALD.', 'Gidrokollektor 5 FALD', 742.19, 'dona', 'NERJAVEYKA', null),
  ('6 FALD.', 'Gidrokollektor 6 FALD', 890.62, 'dona', 'NERJAVEYKA', null),
  ('7 FALD.', 'Gidrokollektor 7 FALD', 1039.06, 'dona', 'NERJAVEYKA', null),
  ('8 FALD.', 'Gidrokollektor 8 FALD', 1187.50, 'dona', 'NERJAVEYKA', null),
  ('9 FALD.', 'Gidrokollektor 9 FALD', 1335.94, 'dona', 'NERJAVEYKA', null),
  ('40/25.', 'GIDROSTRELKA 40/25', 109.38, 'dona', 'NERJAVEYKA', null),
  ('60/32.', 'GIDROSTRELKA 60/40', 125.00, 'dona', 'NERJAVEYKA', null),
  ('80/32.', 'GIDROSTRELKA 80/32', 140.62, 'dona', 'NERJAVEYKA', null),
  ('Nerj Gofra', 'Gofrirovannaya nerjaveyushaya truba 3/4', 14.00, 'dona', 'NERJAVEYKA', null),
  ('FIRE 1.', 'Krepleniya dlya R/B (FIRE ) d-1', 8.60, 'dona', 'NERJAVEYKA', null),
  ('FIRE 3/4.', 'Krepleniya dlya R/B (FIRE ) d-3/4', 9.38, 'dona', 'NERJAVEYKA', null),
  ('LIST.', 'List nerjaveyka', 170.00, 'dona', 'NERJAVEYKA', null),
  ('Nerj udlenitel  1.1/4.', 'Nerj udlenitel  1.1/4', 23.44, 'dona', 'NERJAVEYKA', null),
  ('Nerj udlenitel 1.', 'Nerj udlenitel 1', 15.62, 'dona', 'NERJAVEYKA', null),
  ('Nerj udlenitel 1.1/2.', 'Nerj udlenitel 1.1/2', 31.25, 'dona', 'NERJAVEYKA', null),
  ('Nerj udlenitel 3/4.', 'Nerj udlenitel 3/4', 7.81, 'dona', 'NERJAVEYKA', null),
  ('Nojka R', 'Nojka dlya radiator', 12.00, 'dona', 'NERJAVEYKA', null),
  ('10 sm.', 'Udlinitel dlya raditor 10 sm', 3.90, 'dona', 'NERJAVEYKA', null),
  ('6 sm.', 'Udlinitel dlya raditor 6 sm', 3.12, 'dona', 'NERJAVEYKA', null),
  ('7 sm.', 'Udlinitel dlya raditor 7 sm', 3.12, 'dona', 'NERJAVEYKA', null),
  ('8 sm.', 'Udlinitel dlya raditor 8 sm', 3.12, 'dona', 'NERJAVEYKA', null),
  ('9 sm.', 'Udlinitel dlya raditor 9 sm', 3.90, 'dona', 'NERJAVEYKA', null)
on conflict (artikul) where artikul <> '' do update
  set nomi = excluded.nomi, narx = excluded.narx,
      kategoriya = excluded.kategoriya, kichik_kategoriya = excluded.kichik_kategoriya,
      faol = true;


-- KONVEKTOR / ISOTERM  (15 ta)
insert into hs_products (artikul, nomi, narx, birlik, kategoriya, kichik_kategoriya) values
  ('block 024.', 'Blok Pitaniya 220-24 V', 9.38, 'dona', 'KONVEKTOR', 'ISOTERM'),
  ('Radiator kran primoy.', 'Giacomini Radiator kran primoy obratka', 18.00, 'dona', 'KONVEKTOR', 'ISOTERM'),
  ('ISO termostat.', 'Komnatniy termostat sensorniy', 120.31, 'dona', 'KONVEKTOR', 'ISOTERM'),
  ('vent.', 'Ventilyator dlya konvektorov', 63.75, 'dona', 'KONVEKTOR', 'ISOTERM'),
  ('vent2.', 'Ventilyator dlya konvektorov dvoynoy', 120.31, 'dona', 'KONVEKTOR', 'ISOTERM'),
  ('240-80-1000.', 'Vnetripolniy konvektor 240-80-1000', 259.38, 'dona', 'KONVEKTOR', 'ISOTERM'),
  ('240-80-1200.', 'Vnetripolniy konvektor 240-80-1200', 298.82, 'dona', 'KONVEKTOR', 'ISOTERM'),
  ('240-80-1400.', 'Vnetripolniy konvektor 240-80-1400', 331.25, 'dona', 'KONVEKTOR', 'ISOTERM'),
  ('240-80-1600.', 'Vnetripolniy konvektor 240-80-1600', 378.12, 'dona', 'KONVEKTOR', 'ISOTERM'),
  ('240-80-1800.', 'Vnetripolniy konvektor 240-80-1800', 432.65, 'dona', 'KONVEKTOR', 'ISOTERM'),
  ('240-80-2000.', 'Vnetripolniy konvektor 240-80-2000', 451.56, 'dona', 'KONVEKTOR', 'ISOTERM'),
  ('240-80-2400.', 'Vnetripolniy konvektor 240-80-2400', 531.25, 'dona', 'KONVEKTOR', 'ISOTERM'),
  ('240-80-3000.', 'Vnetripolniy konvektor 240-80-3000', 731.25, 'dona', 'KONVEKTOR', 'ISOTERM'),
  ('240-80-600.', 'Vnetripolniy konvektor 240-80-600', 215.62, 'dona', 'KONVEKTOR', 'ISOTERM'),
  ('240-80-800.', 'Vnetripolniy konvektor 240-80-800', 216.49, 'dona', 'KONVEKTOR', 'ISOTERM')
on conflict (artikul) where artikul <> '' do update
  set nomi = excluded.nomi, narx = excluded.narx,
      kategoriya = excluded.kategoriya, kichik_kategoriya = excluded.kichik_kategoriya,
      faol = true;


notify pgrst, 'reload schema';

select count(*) as shu_bolakda from hs_products where (kategoriya, coalesce(kichik_kategoriya,'')) in (
  ('BOYLER', ''),
  ('LATUN FITING', ''),
  ('FILTR', 'BWT SLIM'),
  ('FILTR', 'BWT SOFTNER'),
  ('FILTR', 'BWT WODA-PURE'),
  ('FILTR', 'BWT ZAPCHAST'),
  ('PRESS FITING', ''),
  ('RASH.BAK', 'RASHBAK'),
  ('RASH.BAK', 'REFLEX'),
  ('GAZ', 'GECA'),
  ('GAZ', 'MADAS'),
  ('NERJAVEYKA', ''),
  ('KONVEKTOR', 'ISOTERM')
);
