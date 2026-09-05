import * as XLSX from 'xlsx';
import { json, sbFetch, verifyInitData } from '../_lib.js';

// Savatni qabul qiladi, narxlarni bazadan qayta hisoblaydi (mijozdan kelgan
// narxga ishonmaymiz), Excel fayl yasaydi va brigada guruhiga yuboradi.

export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json();
    const { initData, code, items } = body;

    if (!code || !Array.isArray(items) || !items.length) {
      return json({ error: 'Savat bo‘sh' }, 400);
    }

    const user = await verifyInitData(initData, env.BOT_TOKEN);
    if (!user) {
      return json({ error: 'Foydalanuvchini tasdiqlab bo‘lmadi. Ilovani Telegram ichida oching.' }, 401);
    }

    const brigades = await sbFetch(env, `/rest/v1/hs_brigades?code=eq.${encodeURIComponent(code)}&select=*`);
    const brigade = brigades && brigades[0];
    if (!brigade) return json({ error: 'Brigada topilmadi. Guruhda qaytadan /register qiling.' }, 404);

    const ids = [...new Set(items.map(i => i.id).filter(Boolean))];
    if (!ids.length) return json({ error: 'Tovarlar noto‘g‘ri' }, 400);
    const orFilter = ids.map(id => `id.eq.${id}`).join(',');
    const dbProducts = await sbFetch(env, `/rest/v1/hs_products?or=(${orFilter})&faol=eq.true&select=*`);
    const byId = Object.fromEntries(dbProducts.map(p => [p.id, p]));

    const rows = [];
    let total = 0;
    for (const it of items) {
      const p = byId[it.id];
      if (!p) continue;
      const miqdor = Math.max(1, Number(it.miqdor) || 1);
      const summa = p.narx * miqdor;
      total += summa;
      rows.push({ id: p.id, artikul: p.artikul, nomi: p.nomi, narx: p.narx, birlik: p.birlik, miqdor, summa });
    }
    if (!rows.length) return json({ error: 'Tanlangan tovarlar topilmadi (ehtimol o‘chirilgan)' }, 400);

    const buyerName = [user.first_name, user.last_name].filter(Boolean).join(' ') || user.username || String(user.id);

    const inserted = await sbFetch(env, '/rest/v1/hs_orders', 'POST', {
      brigade_id: brigade.id,
      telegram_id: user.id,
      telegram_name: buyerName,
      items: rows,
      total
    });
    const order = inserted[0];

    const aoa = [
      ['Artikul', 'Nomi', 'Narx', 'Birlik', 'Miqdor', 'Summa'],
      ...rows.map(r => [r.artikul, r.nomi, r.narx, r.birlik, r.miqdor, r.summa]),
      ['', '', '', '', 'Jami:', total]
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{ wch: 14 }, { wch: 34 }, { wch: 12 }, { wch: 8 }, { wch: 8 }, { wch: 14 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Buyurtma');
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

    const fd = new FormData();
    fd.append('chat_id', String(brigade.chat_id));
    fd.append(
      'caption',
      `🛒 Yangi buyurtma\nUsta: ${buyerName}\nBrigada: ${brigade.nomi}\nJami: ${total.toLocaleString('ru-RU')} so'm`
    );
    fd.append('document', blob, `buyurtma-${new Date().toISOString().slice(0, 10)}-${order.id.slice(0, 8)}.xlsx`);

    const tgRes = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendDocument`, { method: 'POST', body: fd });
    const tgData = await tgRes.json();
    if (!tgData.ok) {
      return json({ error: 'Telegramga yuborishda xatolik: ' + (tgData.description || 'noma’lum xato') }, 502);
    }

    return json({ ok: true, order_id: order.id, total, brigade: brigade.nomi });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}
