# Narx ro'yxatlari (Excel) -> SQL. Ishlatish tartibi:
#   1) barcha .xlsx fayllarni bitta papkaga (xls_in/) qo'ying
#   2) xarita.json da har bir fayl qaysi kategoriya/brendga tushishini ko'rsating
#   3) python3 katalog.py   -> tovarlar.json (+ takror/narxsizlar hisoboti)
#   4) python3 sql_yoz.py   -> heating-orders/tovarlar-0*.sql
import json, re, sys, glob, os, openpyxl
from collections import defaultdict

XARITA = json.load(open('xarita.json', encoding='utf-8'))

def narxni_oqi(x):
    if x is None: return None
    if isinstance(x, (int, float)): return float(x)
    s = str(x).upper().replace('USD', '').replace('$', '').strip()
    s = s.replace('\xa0', '').replace("'", '').replace(' ', '')
    if not re.search(r'\d', s): return None
    if ',' in s and '.' in s:                 # 1.500,00  yoki  1,500.00
        s = s.replace('.', '').replace(',', '.') if s.rindex(',') > s.rindex('.') else s.replace(',', '')
    elif ',' in s:
        s = s.replace(',', '.')
    try: return float(s)
    except ValueError: return None

def artikulni_oqi(x):
    if x is None: return ''
    if isinstance(x, float) and x.is_integer(): return str(int(x))
    return str(x).strip()

tovarlar, narxsiz, bosh_artikul = [], [], []
for yol in sorted(glob.glob('xls_in/*.xlsx')):
    stem = re.sub(r'^[0-9a-f]+-', '', os.path.basename(yol))[:-5]
    if stem not in XARITA:
        print(f'!! xaritada yo\'q: {stem}', file=sys.stderr); continue
    kat, brend = XARITA[stem]
    ws = openpyxl.load_workbook(yol, data_only=True).worksheets[0]
    for r in ws.iter_rows(min_row=2, values_only=True):
        art, nomi, narx = artikulni_oqi(r[0]), (str(r[1]).strip() if r[1] else ''), narxni_oqi(r[2] if len(r) > 2 else None)
        if not nomi: continue
        if narx is None: narxsiz.append((stem, art, nomi)); continue
        if not art: bosh_artikul.append((stem, nomi))
        tovarlar.append({'artikul': art, 'nomi': nomi, 'narx': narx, 'kat': kat, 'brend': brend, 'fayl': stem})

# bir xil artikul bir necha marta uchrasa — SQL yiqiladi/ustiga yozadi
kor = defaultdict(list)
for t in tovarlar:
    if t['artikul']: kor[t['artikul']].append(t)
takror = {a: v for a, v in kor.items() if len(v) > 1}

print(f'Fayllar: {len({t["fayl"] for t in tovarlar})}, tovarlar: {len(tovarlar)}')
print(f'Narxsiz (tashlandi): {len(narxsiz)}')
print(f'Artikulsiz: {len(bosh_artikul)}')
print(f'Takrorlangan artikul: {len(takror)}')
for a, v in list(takror.items())[:20]:
    print('   ', a, '->', ' | '.join(f'{x["fayl"]}: {x["nomi"][:40]}' for x in v))
for f, a, n in narxsiz[:20]: print('   narxsiz:', f, a, n[:50])
json.dump(tovarlar, open('tovarlar.json','w',encoding='utf-8'), ensure_ascii=False)
