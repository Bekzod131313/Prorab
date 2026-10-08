# Narx ro'yxatlari (Excel) -> SQL. Ishlatish tartibi:
#   1) barcha .xlsx fayllarni bitta papkaga (xls_in/) qo'ying
#   2) xarita.json da har bir fayl qaysi kategoriya/brendga tushishini ko'rsating
#   3) python3 katalog.py   -> tovarlar.json (+ takror/narxsizlar hisoboti)
#   4) python3 sql_yoz.py   -> heating-orders/tovarlar-0*.sql
import json, re
from collections import defaultdict, Counter

T = json.load(open('tovarlar.json', encoding='utf-8'))
R = '/home/user/Prorab/heating-orders/'
esc = lambda s: s.replace("'", "''")

guruh = defaultdict(list)                    # (kategoriya, brend) -> tovarlar
for t in T: guruh[(t['kat'], t['brend'])].append(t)
for k in guruh: guruh[k].sort(key=lambda t: t['nomi'].lower())

kat_soni = Counter(t['kat'] for t in T)

# --- bo'laklarga bo'lish: har bir faylda ~700 tagacha tovar ---
# ARMATURA o'zi 1200 dan oshadi, shuning uchun brendlari bo'yicha bo'linadi.
BOLAKLAR = [
    ("01-armatura-1",  [("ARMATURA", b) for b in ["AQUER","CALEFFI","CARLO POLETTI","FAR","FERRO","GIACOMINI","HERZ","IVAR","KAN THERM","KAS"]]),
    ("02-armatura-2",  [("ARMATURA", b) for b in ["OVENTROP","POWER","RBM","REFLEX","S-PRESS","SITEM","TDS","TIEMME"]]),
    ("03-kanalizatsiya-ppr", [("KANALIZATSIYA", None), ("PPR", None)]),
    ("04-radiator-nasos-poliv", [("RADIATOR", None), ("NASOS", None), ("POLIV", None)]),
    ("05-dimaxod-izolyatsiya-katyol", [("DIMAXOD", None), ("IZOLYATSIYA", None), ("KATYOL", None), ("SANTEXNIKA", None), ("AVTOMATIKA", None)]),
    ("06-boyler-fiting-filtr", [("BOYLER", None), ("LATUN FITING", None), ("FILTR", None), ("PRESS FITING", None),
                                ("RASH.BAK", None), ("GAZ", None), ("NERJAVEYKA", None), ("KONVEKTOR", None)]),
]

def kalitlar(spec):
    """(kat, brend) juftligi; brend None bo'lsa — shu kategoriyadagi hammasi."""
    chiq = []
    for kat, brend in spec:
        if brend is None:
            chiq += sorted([k for k in guruh if k[0] == kat], key=lambda k: (k[1] or '').lower())
        else:
            if (kat, brend) in guruh: chiq.append((kat, brend))
            else: print('!! yo\'q:', kat, brend)
    return chiq

BOSH = """-- ============================================================
--  ZODPRO katalogi — {nom}
--  {jami} ta tovar. Narxlar dollarda.
--
--  Supabase -> SQL Editor -> New query -> to'liq nusxalang -> Run.
--  Qayta ishga tushirsangiz takrorlanmaydi (artikul bo'yicha yangilanadi).
-- ============================================================

create unique index if not exists hs_products_artikul_key
  on hs_products (artikul) where artikul <> '';
"""

TOZALASH = """
-- Katalog daraxtida xato yozilgan brend nomlari (ularda tovar yo'q edi)
delete from hs_categories where (nomi, ota) in (
  ('BTW SLIM','FILTR'), ('BWT WODA-PRUE','FILTR'), ('BWT-ZAPCHAST','FILTR'),
  ('COX GEELAN','DIMAXOD'), ('GRUNFOS','NASOS'), ('POLESAN','POLIV')
);
"""

jami_yozilgan = 0
for nom, spec in BOLAKLAR:
    kl = kalitlar(spec)
    rows_all = [t for k in kl for t in guruh[k]]
    q = [BOSH.format(nom=nom, jami=len(rows_all))]
    if nom.startswith('06'): q.append(TOZALASH)

    brendlar = defaultdict(list)
    for kat, brend in kl:
        if brend: brendlar[kat].append(brend)
    if brendlar:
        satr = []
        for kat in sorted(brendlar):
            for i, b in enumerate(sorted(brendlar[kat], key=str.lower), 1):
                satr.append(f"  ('{esc(b)}', '{esc(kat)}', {i*10})")
        q.append("-- Brendlar katalog daraxtida tursin\ninsert into hs_categories (nomi, ota, tartib) values\n"
                 + ",\n".join(satr) +
                 "\non conflict (nomi, coalesce(ota, '')) do update set tartib = excluded.tartib, faol = true;\n")

    for kat, brend in kl:
        rows = guruh[(kat, brend)]
        kk = f"'{esc(brend)}'" if brend else "null"
        body = ",\n".join(
            f"  ('{esc(t['artikul'])}', '{esc(t['nomi'])}', {t['narx']:.2f}, 'dona', '{esc(kat)}', {kk})"
            for t in rows)
        q.append(f"""
-- {kat}{' / ' + brend if brend else ''}  ({len(rows)} ta)
insert into hs_products (artikul, nomi, narx, birlik, kategoriya, kichik_kategoriya) values
{body}
on conflict (artikul) where artikul <> '' do update
  set nomi = excluded.nomi, narx = excluded.narx,
      kategoriya = excluded.kategoriya, kichik_kategoriya = excluded.kichik_kategoriya,
      faol = true;
""")
    q.append("\nnotify pgrst, 'reload schema';\n\nselect count(*) as shu_bolakda from hs_products where (kategoriya, coalesce(kichik_kategoriya,'')) in (\n"
             + ",\n".join(f"  ('{esc(k)}', '{esc(b or '')}')" for k, b in kl) + "\n);\n")
    fayl = f'tovarlar-{nom}.sql'
    open(R + fayl, 'w', encoding='utf-8').write("\n".join(q))
    jami_yozilgan += len(rows_all)
    print(f'{fayl:<42} {len(rows_all):>5} tovar  {len("".join(q))//1024:>4} KB')

print('JAMI yozildi:', jami_yozilgan, 'dan', len(T))
assert jami_yozilgan == len(T), 'ba\'zi tovarlar bo\'lakka tushmay qolgan!'
