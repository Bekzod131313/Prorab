import * as XLSX from 'xlsx';
import { json, sbFetch, requireUser, nextOrderNo, notify, tgApi, escHtml, pul} from '../_lib.js';

// Savatni qabul qiladi, narxlarni bazadan qayta hisoblaydi, buyurtmani
// tanlangan OBYEKTGA bog'laydi va uning qarziga yozadi (to'lov tizimi yo'q —
// har bir buyurtma to'g'ridan-to'g'ri qarzdorlik hosil qiladi), Excel fayl
// yasab brigada guruhiga yuboradi.

export async function onRequestPost({ request, env }) {
  try {
    const user = await requireUser(request, env);
    if (!user) return json({ error: 'Foydalanuvchini tasdiqlab bo‘lmadi. Ilovani Telegram ichida oching.' }, 401);

    const body = await request.json();
    const { object_id, items } = body;
    const telefon = String(body.telefon || '').trim().slice(0, 32);

    if (!object_id) return json({ error: 'Obyekt tanlanmagan' }, 400);
    if (!Array.isArray(items) || !items.length) return json({ error: 'Savat bo‘sh' }, 400);
    // Yetkazib berish uchun bog'lanadigan raqam — kamida 7 ta raqam bo'lsin
    if ((telefon.match(/\d/g) || []).length < 7) return json({ error: 'Telefon raqamini to‘g‘ri kiriting' }, 400);

    // Brigada har doim initData bilan tasdiqlangan foydalanuvchining o'z
    // a'zoligidan olinadi — mijoz yuborgan `code`ga hech qachon ishonilmaydi,
    // aks holda boshqa brigadaning kodini bilgan har kim uning nomidan
    // buyurtma berib, uning obyekt qarziga yozib qo'yishi mumkin edi.
    const userRows = await sbFetch(env, `/rest/v1/hs_users?telegram_id=eq.${user.id}&select=brigade_id`);
    const userBrigadeId = userRows && userRows[0] && userRows[0].brigade_id;
    if (!userBrigadeId) return json({ error: 'Avval brigadaga kiring yoki ro‘yxatdan o‘ting' }, 400);

    const brigades = await sbFetch(env, `/rest/v1/hs_brigades?id=eq.${encodeURIComponent(userBrigadeId)}&select=*`);
    const brigade = brigades && brigades[0];
    if (!brigade) return json({ error: 'Brigada topilmadi. Ilovadan chiqib, qaytadan login qiling.' }, 404);

    const objRows = await sbFetch(env, `/rest/v1/hs_objects?id=eq.${encodeURIComponent(object_id)}&brigade_id=eq.${brigade.id}&select=*`);
    const object = objRows && objRows[0];
    if (!object) return json({ error: 'Obyekt topilmadi' }, 404);

    // PostgREST'ning or=(...) filtri o'zining mini-tilida vergul/nuqtani
    // ajratuvchi sifatida ishlatadi — URL-encoding bu yerda yetarli emas
    // (dekodlangach original belgi qaytadi), shuning uchun id'lar UUID
    // formatiga qat'iy mos kelishi tekshiriladi.
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const ids = [...new Set(items.map(i => i.id).filter(id => typeof id === 'string' && UUID_RE.test(id)))];
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
      const narx = p.aksiya_narx != null ? p.aksiya_narx : p.narx;
      const summa = narx * miqdor;
      total += summa;
      rows.push({ id: p.id, artikul: p.artikul, nomi: p.nomi, narx, birlik: p.birlik, miqdor, summa });
    }
    if (!rows.length) return json({ error: 'Tanlangan tovarlar topilmadi (ehtimol o‘chirilgan)' }, 400);

    const buyerName = [user.first_name, user.last_name].filter(Boolean).join(' ') || user.username || String(user.id);
    const orderNo = await nextOrderNo(env);

    const inserted = await sbFetch(env, '/rest/v1/hs_orders', 'POST', {
      order_no: orderNo,
      brigade_id: brigade.id,
      object_id: object.id,
      telegram_id: user.id,
      telegram_name: buyerName,
      telefon,
      items: rows,
      total,
      status: 'yangi'
    });
    const order = inserted[0];

    // Keyingi buyurtmada qayta yozmasin
    try {
      await sbFetch(env, `/rest/v1/hs_users?telegram_id=eq.${user.id}`, 'PATCH', { telefon });
    } catch (e) { /* profil yangilanmasa ham buyurtma bekor bo'lmasin */ }

    // Tovar faqat qarzdorlikka yoziladi — to'lov qadam yo'q
    await sbFetch(env, '/rest/v1/hs_debt_entries', 'POST', {
      object_id: object.id,
      order_id: order.id,
      turi: 'qarz',
      summa: total,
      izoh: `Buyurtma ${orderNo}`,
      created_by: user.id
    });

    const aoa = [
      ['Artikul', 'Nomi', 'Narx, $', 'Birlik', 'Miqdor', 'Summa, $'],
      ...rows.map(r => [r.artikul, r.nomi, r.narx, r.birlik, r.miqdor, r.summa]),
      ['', '', '', '', 'Jami:', total],
      [],
      ['Usta:', buyerName],
      ['Telefon:', telefon],
      ['Obyekt:', object.nomi]
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{ wch: 14 }, { wch: 34 }, { wch: 12 }, { wch: 8 }, { wch: 8 }, { wch: 14 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Buyurtma');
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

    // Guruh bog'lanmagan bo'lsa buyurtma yo'qolmasin — faylni ustaning
    // o'ziga yuboramiz, u qo'lda uzatadi. Operatorga ham xabar ketadi.
    const guruhBor = !!brigade.chat_id;
    const qabulQiluvchi = guruhBor ? brigade.chat_id : user.id;

    const fd = new FormData();
    fd.append('chat_id', String(qabulQiluvchi));
    fd.append(
      'caption',
      `🛒 Yangi buyurtma ${orderNo}\nUsta: ${buyerName}\nTelefon: ${telefon}\nObyekt: ${object.nomi}\nJami: ${pul(total)} $ (qarzga yozildi)` +
      (guruhBor ? '' : '\n\n⚠️ Brigadangiz guruhga bog‘lanmagan — fayl shu yerga yuborildi. Operator guruhni bog‘lagach, buyurtmalar to‘g‘ridan-to‘g‘ri guruhga tushadi.')
    );
    fd.append('document', blob, `${orderNo}.xlsx`);

    // Bu yerga kelganda buyurtma va qarzdorlik yozuvi allaqachon bazaga
    // yozilgan (yuqorida) — shuning uchun Telegramga yuborishda xatolik
    // bo'lsa ham foydalanuvchiga xatolik qaytarmaymiz: aks holda u "qayta
    // urinib ko'raman" deb tugmani yana bossa, xuddi shu buyurtma va qarz
    // ikkinchi marta yozilib, obyekt qarzi ikki baravar bo'lib qoladi.
    // O'rniga yetkazib berilmaganini operatorga xabar qilamiz.
    try {
      const tgRes = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendDocument`, { method: 'POST', body: fd });
      const tgData = await tgRes.json();
      if (!tgData.ok) throw new Error(tgData.description || 'noma’lum xato');
    } catch (e) {
      if (env.ADMIN_CHAT_ID) {
        try {
          await tgApi(env, 'sendMessage', {
            chat_id: env.ADMIN_CHAT_ID,
            text: `⚠️ Buyurtma ${orderNo} bazaga yozildi, lekin Excel fayl yuborilmadi.\nBrigada: ${brigade.nomi}\nXato: ${e.message}\nIltimos, buyurtmani qo'lda tekshiring/yuboring.`
          });
        } catch (e2) {}
      }
    }

    // Guruhi yo'q brigadadan buyurtma kelsa — operator bilib tursin
    if (!guruhBor && env.ADMIN_CHAT_ID) {
      try {
        await tgApi(env, 'sendMessage', {
          chat_id: env.ADMIN_CHAT_ID,
          text:
            `📦 Guruhsiz brigadadan buyurtma: <b>${escHtml(brigade.nomi)}</b> (<code>${escHtml(brigade.login || '—')}</code>)\n` +
            `${orderNo} · ${escHtml(buyerName)} · ${escHtml(telefon)}\nObyekt: ${escHtml(object.nomi)} · ${pul(total)} $\n\n` +
            `Guruhga bog‘lash: guruhda <code>/bogla ${escHtml(brigade.login || '')}</code>`,
          parse_mode: 'HTML'
        });
      } catch (e) {}
    }

    // Obyektga joylashuv (lokatsiya) biriktirilgan bo'lsa, buyurtma bilan birga
    // guruhga haqiqiy Telegram lokatsiya sifatida ham yuboramiz (xarita bilan).
    if (object.lat != null && object.lng != null) {
      try {
        await tgApi(env, 'sendLocation', { chat_id: qabulQiluvchi, latitude: object.lat, longitude: object.lng });
      } catch (e) {
        // Lokatsiya yuborilmasa ham buyurtmaning o'zi bekor bo'lmasligi kerak
      }
    }

    await notify(env, {
      telegram_id: user.id,
      turi: 'buyurtma',
      matn: `✅ Buyurtmangiz qabul qilindi: <b>${orderNo}</b>\nObyekt: ${escHtml(object.nomi)}\nJami: ${pul(total)} $\n\nStatus: Yangi`,
      order_id: order.id,
      object_id: object.id
    });

    return json({
      ok: true, order_id: order.id, order_no: orderNo, total,
      brigade: brigade.nomi, object: object.nomi,
      guruhga: guruhBor          // fayl guruhga ketdimi yoki ustaning chatigami
    });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}
