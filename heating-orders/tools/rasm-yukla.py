#!/usr/bin/env python3
"""Tovar rasmlarini Supabase'ga yuklaydi va hs_products.rasm ga yozadi.

Ishlatish:
    export SUPABASE_URL=https://xxxx.supabase.co
    export SUPABASE_SERVICE_ROLE_KEY=...            # Settings -> API -> service_role
    python3 tools/rasm-yukla.py rasmlar/            # papkadagi hamma rasm
    python3 tools/rasm-yukla.py rasmlar/ --dry      # hech narsa yozmay, moslikni ko'rsatadi

Fayl nomi artikul bo'lishi kerak:  AK001..jpg,  154aq.png,  Htem 211..webp
Nuqta, probel va katta-kichik harf farqi hisobga olinmaydi — "ak001.jpg" ham
"AK001." artikuliga tushadi.  Mos tovar topilmagan fayllar ro'yxati oxirida
chiqadi, ular yuklanmaydi.

Rasm Storage'dagi `katalog` bucket'iga `tovar/<artikul>.<kengaytma>` nomi bilan
tushadi (STORAGE_BUCKET bilan boshqa bucket ko'rsatish mumkin).  Bir xil fayl
qayta yuklansa ustiga yoziladi, ikkinchi nusxa paydo bo'lmaydi.
"""
import json, os, re, sys, unicodedata, urllib.error, urllib.parse, urllib.request

URL    = os.environ.get('SUPABASE_URL', '').rstrip('/')
KALIT  = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')
BUCKET = os.environ.get('STORAGE_BUCKET', 'katalog')

TURLAR = {'.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
          '.webp': 'image/webp', '.gif': 'image/gif'}


def sorov(yol, usul='GET', tana=None, turi='application/json', qoshimcha=None):
    so = urllib.request.Request(URL + yol, method=usul, data=tana)
    so.add_header('apikey', KALIT)
    so.add_header('Authorization', 'Bearer ' + KALIT)
    so.add_header('Content-Type', turi)
    for k, v in (qoshimcha or {}).items():
        so.add_header(k, v)
    with urllib.request.urlopen(so, timeout=60) as j:
        matn = j.read().decode('utf-8', 'replace')
    return json.loads(matn) if matn.strip().startswith(('[', '{')) else matn


def tovarlar():
    """Supabase bir javobda 1000 qator beradi — sahifalab o'qiymiz."""
    hammasi, offset = [], 0
    while True:
        qism = sorov(f'/rest/v1/hs_products?select=id,artikul,nomi,rasm&limit=1000&offset={offset}')
        if not qism:
            break
        hammasi += qism
        if len(qism) < 1000:
            break
        offset += 1000
    return hammasi


def kalitla(s):
    """Taqqoslash uchun soddalashtirilgan artikul: faqat harf va raqam."""
    s = unicodedata.normalize('NFKD', str(s or '')).lower()
    return re.sub(r'[^a-z0-9]', '', s)


def main():
    if not URL or not KALIT:
        sys.exit('SUPABASE_URL va SUPABASE_SERVICE_ROLE_KEY o‘rnatilmagan')
    if len(sys.argv) < 2:
        sys.exit(__doc__)

    papka = sys.argv[1]
    quruq = '--dry' in sys.argv[2:]

    fayllar = [f for f in sorted(os.listdir(papka))
               if os.path.splitext(f)[1].lower() in TURLAR]
    if not fayllar:
        sys.exit(f'{papka} ichida rasm topilmadi ({", ".join(TURLAR)})')

    print(f'Rasm: {len(fayllar)} ta.  Bazadan tovarlar o‘qilmoqda...')
    jadval = {}
    for t in tovarlar():
        k = kalitla(t['artikul'])
        if k and k not in jadval:          # bir xil kalitli ikkinchi tovar — chetda
            jadval[k] = t
    print(f'Bazada {len(jadval)} ta artikul.\n')

    yuklandi, topilmadi, xato = 0, [], []
    for fayl in fayllar:
        nom, keng = os.path.splitext(fayl)
        tovar = jadval.get(kalitla(nom))
        if not tovar:
            topilmadi.append(fayl)
            continue

        print(f'  {fayl:<34} -> {tovar["nomi"][:46]}')
        if quruq:
            yuklandi += 1
            continue

        try:
            with open(os.path.join(papka, fayl), 'rb') as f:
                bayt = f.read()
            obyekt = f'tovar/{kalitla(nom)}{keng.lower()}'
            sorov(f'/storage/v1/object/{urllib.parse.quote(BUCKET)}/{urllib.parse.quote(obyekt)}',
                  'POST', bayt, TURLAR[keng.lower()], {'x-upsert': 'true'})
            ochiq = f'{URL}/storage/v1/object/public/{urllib.parse.quote(BUCKET)}/{urllib.parse.quote(obyekt)}'
            sorov(f'/rest/v1/hs_products?id=eq.{tovar["id"]}', 'PATCH',
                  json.dumps({'rasm': ochiq}).encode(), qoshimcha={'Prefer': 'return=minimal'})
            yuklandi += 1
        except urllib.error.HTTPError as e:
            xato.append(f'{fayl}: {e.code} {e.read().decode("utf-8", "replace")[:120]}')
        except Exception as e:                      # tarmoq uzilishi va hokazo
            xato.append(f'{fayl}: {e}')

    print(f'\n{"Moslashdi" if quruq else "Yuklandi"}: {yuklandi} ta')
    if topilmadi:
        print(f'Artikuli topilmadi ({len(topilmadi)} ta): ' + ', '.join(topilmadi[:15]) +
              (' ...' if len(topilmadi) > 15 else ''))
    if xato:
        print(f'Xato ({len(xato)} ta):')
        for x in xato[:10]:
            print('   ' + x)


if __name__ == '__main__':
    main()
