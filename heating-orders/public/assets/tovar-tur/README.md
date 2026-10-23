# Tur rasmlari

Tovarning o'z rasmi (`hs_products.rasm`) bo'lmasa, ilova shu papkadan
brend + tur bo'yicha umumiy rasmni qidiradi:

    ostendorf-htem--truba.webp      OSTENDORF HTEM bo'limidagi hamma truba
    tiemme--kran.webp               TIEMME kranlari
    grundfos--nasos.webp            GRUNDFOS nasoslari

Fayl nomi: `<brend yoki kategoriya>--<tur>.webp` (kichik harf, probel va
nuqta o'rniga `-`). Kerakli fayllar ro'yxati va har biri nechta tovarni
qoplashi: `heating-orders/tur-rasmlar.csv`.

Fayl bo'lmasa hech narsa buzilmaydi — ilova tovar turining chizmasini
ko'rsatadi. Ya'ni rasmlarni bittadan qo'shib borish mumkin.

Rasm talabi: kvadrat, oq fon, 600x600 atrofida. `tools/rasm-tayyorla.py`
istalgan rasmni shu ko'rinishga keltiradi.
