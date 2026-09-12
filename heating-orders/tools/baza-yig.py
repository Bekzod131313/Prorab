# baza.sql ni qismlardan yig'adi VA hech bir DDL tushib qolmaganini tekshiradi
import re, sys

def kes(matn, belgi):
    return matn.split(belgi)[0].rstrip()

mig = open('migration.sql', encoding='utf-8').read()
kat = open('kategoriyalar.sql', encoding='utf-8').read()

mig_tana = kes(mig, "-- ============================================================\n--  Tekshirish:")
mig_tana = mig_tana.split("-- ============================================================\n")[-1].lstrip()

kat_tana = kat.replace("""-- ============================================================
--  ZODPRO — katalog daraxti (kategoriya -> brend)
--  Supabase -> SQL Editor -> Run. Qayta ishga tushirsa ham xato bermaydi.
--  Bu ro'yxat tovarlardan mustaqil: tovar hali yuklanmagan bo'lsa ham
--  ilovada kategoriyalar ko'rinib turadi.
-- ============================================================
""", "")
kat_tana = kes(kat_tana, "-- Tekshirish: 22 ta kategoriya")

out = """-- ============================================================
--  ZODPRO — BAZANI YANGILASH (hammasi bitta faylda)
--
--  Supabase -> SQL Editor -> New query -> shu faylni to'liq nusxalang
--  -> Run. Qayta ishga tushirsangiz ham xato bermaydi.
--
--  Shundan keyin qo'lda qiladigan bitta ish qoladi:
--    Supabase -> Storage -> New bucket -> nomi "katalog", Public yoqilgan
--    (kategoriya rasmlari shu yerga tushadi)
-- ============================================================

""" + mig_tana + """

-- ============================================================
--  KATALOG DARAXTI (22 kategoriya, 66 brend)
-- ============================================================
""" + kat_tana + """

-- ============================================================
--  TEKSHIRISH — quyidagilar xatosiz chiqishi kerak
-- ============================================================
select 'brigadalar' as jadval, count(*) from hs_brigades
union all select 'kategoriyalar', count(*) from hs_categories where ota is null
union all select 'brendlar',      count(*) from hs_categories where ota is not null;

select id, nomi, login, faol, chat_id from hs_brigades limit 1;
"""
open('baza.sql', 'w', encoding='utf-8').write(out)

# --- nazorat: qismlardagi har bir DDL baza.sql da bo'lishi shart ---
DDL = re.compile(r'^\s*(alter table|create table|create index|create unique index|create policy|drop policy)\b.*?;',
                 re.M | re.S | re.I)
yoq = []
for nom, matn in [('migration.sql', mig), ('kategoriyalar.sql', kat)]:
    for st in DDL.findall(matn):
        pass
for nom, matn in [('migration.sql', mig), ('kategoriyalar.sql', kat)]:
    for m in DDL.finditer(matn):
        st = ' '.join(m.group(0).split())
        if st not in ' '.join(out.split()):
            yoq.append(f'{nom}: {st[:80]}')

if yoq:
    print('!! baza.sql ga tushmagan buyruqlar:')
    for x in yoq: print('  ', x)
    sys.exit(1)
print('baza.sql yig‘ildi — barcha DDL joyida')
