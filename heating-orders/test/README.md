# Ilova sinovlari

Haqiqiy brauzerda (Playwright) ishlaydi: soxta Supabase va soxta API bilan
`public/index.html` ochiladi, tugmalar bosiladi, natija tekshiriladi.

    cd heating-orders/test
    npm i playwright
    node scroll.mjs

Chromium yo'li skript ichida ko'rsatilgan (`executablePath`) — muhitda
boshqa joyda bo'lsa, o'sha qatorni to'g'rilang.

`scroll.mjs` — uzun ro'yxatda tovar ochib, orqaga qaytganda o'sha joyga
tushishini tekshiradi (tugma bilan ham, chapdan surish bilan ham).
