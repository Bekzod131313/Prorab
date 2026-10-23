#!/usr/bin/env python3
"""Rasmlarni ilova uchun tayyorlaydi: kvadrat, oq fon, webp.

    python3 tools/rasm-tayyorla.py xom/ public/assets/tovar-tur/

Har bir rasm:
  - shaffof joylari oq bilan to'ldiriladi,
  - kvadratga keltiriladi (cho'zilmaydi, yon tomoniga oq qo'shiladi),
  - 600x600 ga keltirilib, webp sifatida saqlanadi (~20-40 KB).

Fayl nomi o'zgarmaydi, faqat kengaytmasi .webp bo'ladi — ya'ni
`ostendorf-htem--truba.jpg` -> `ostendorf-htem--truba.webp`.
"""
import os, sys
from PIL import Image

OLCHAM = 600
KIRISH = {'.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp'}


def tayyorla(manba, maqsad):
    im = Image.open(manba)
    im = im.convert('RGBA') if im.mode in ('RGBA', 'LA', 'P') else im.convert('RGB')

    # shaffof fonni oqqa aylantiramiz
    if im.mode == 'RGBA':
        fon = Image.new('RGB', im.size, (255, 255, 255))
        fon.paste(im, mask=im.split()[3])
        im = fon

    # kvadratga keltiramiz — cho'zmasdan, chetiga oq qo'shib
    w, h = im.size
    if w != h:
        yon = max(w, h)
        kvadrat = Image.new('RGB', (yon, yon), (255, 255, 255))
        kvadrat.paste(im, ((yon - w) // 2, (yon - h) // 2))
        im = kvadrat

    im = im.resize((OLCHAM, OLCHAM), Image.LANCZOS)
    im.save(maqsad, 'WEBP', quality=82, method=6)
    return os.path.getsize(maqsad)


def main():
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    kirish, chiqish = sys.argv[1], sys.argv[2]
    os.makedirs(chiqish, exist_ok=True)

    fayllar = [f for f in sorted(os.listdir(kirish))
               if os.path.splitext(f)[1].lower() in KIRISH]
    if not fayllar:
        sys.exit(f'{kirish} ichida rasm yo‘q')

    jami = 0
    for f in fayllar:
        nom = os.path.splitext(f)[0] + '.webp'
        try:
            hajm = tayyorla(os.path.join(kirish, f), os.path.join(chiqish, nom))
            jami += hajm
            print(f'  {f:<40} -> {nom:<40} {hajm // 1024} KB')
        except Exception as e:
            print(f'  {f:<40} XATO: {e}')

    print(f'\n{len(fayllar)} ta rasm, jami {jami // 1024} KB')


if __name__ == '__main__':
    main()
