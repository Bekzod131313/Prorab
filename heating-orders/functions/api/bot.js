import { json, sbFetch, tgApi, genCode } from '../_lib.js';

// Telegram bot webhook.
//
// MUHIM: Telegram inline tugmalarida `web_app` turi FAQAT bot bilan shaxsiy
// (private) chatda ishlaydi, guruhda ishlamaydi. Shuning uchun oqim shunday:
//   1) Guruhda admin: /register Brigada nomi
//      -> bot brigadani saqlaydi va guruhga oddiy (url) tugma bilan javob beradi:
//         "Botga o'tish" -> https://t.me/<bot>?start=brig_<code>
//   2) Foydalanuvchi shu tugmani bosadi -> botning shaxsiy chatiga o'tadi va
//      /start brig_<code> yuboriladi (Telegram buni avtomatik qiladi)
//   3) Bot shaxsiy chatda web_app tugmasi bilan javob beradi -> mini-app ochiladi

export async function onRequestPost({ request, env }) {
  if (env.WEBHOOK_SECRET) {
    const secret = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
    if (secret !== env.WEBHOOK_SECRET) return json({ ok: false }, 401);
  }

  let update;
  try { update = await request.json(); } catch (e) { return json({ ok: true }); }

  const msg = update.message;
  if (!msg || !msg.text) return json({ ok: true });

  const chat = msg.chat;
  const text = msg.text.trim();
  const parts = text.split(/\s+/);
  const cmd = (parts[0] || '').split('@')[0];
  const isPrivate = chat.type === 'private';
  const isGroup = chat.type === 'group' || chat.type === 'supergroup';

  if (cmd === '/start') {
    const payload = parts[1] || '';

    if (isPrivate && payload.startsWith('brig_')) {
      const code = payload.slice('brig_'.length);
      const rows = await sbFetch(env, `/rest/v1/hs_brigades?code=eq.${encodeURIComponent(code)}&select=nomi`);
      const brigade = rows && rows[0];
      if (!brigade) {
        await tgApi(env, 'sendMessage', {
          chat_id: chat.id,
          text: 'Havola eskirgan yoki noto‘g‘ri. Guruh adminidan qaytadan /register qilishini so‘rang.'
        });
        return json({ ok: true });
      }
      const url = `${env.MINIAPP_URL}/?g=${code}`;
      await tgApi(env, 'sendMessage', {
        chat_id: chat.id,
        text: `👋 Salom! Siz <b>${brigade.nomi}</b> brigadasi nomidan buyurtma berasiz.\n\nTovar tanlash uchun pastdagi tugmani bosing 👇`,
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: [[{ text: '🛒 Katalog va buyurtma', web_app: { url } }]] }
      });
      return json({ ok: true });
    }

    await tgApi(env, 'sendMessage', {
      chat_id: chat.id,
      text:
        'Salom! Bu bot orqali brigada uchun otopleniya tovarlarini tanlab buyurtma berish mumkin.\n\n' +
        '1) Meni ustalar guruhingizga qo‘shing va admin qiling\n' +
        '2) Guruhda <code>/register Brigada nomi</code> deb yozing (buni guruh admini yozishi kerak)\n' +
        '3) Guruhda chiqqan havola orqali botga o‘ting va katalogni oching\n' +
        '4) Tovarlarni savatga yig‘ib buyurtma bering — Excel fayl avtomatik brigada guruhiga tushadi.',
      parse_mode: 'HTML'
    });
    return json({ ok: true });
  }

  if (cmd === '/register') {
    if (!isGroup) {
      await tgApi(env, 'sendMessage', {
        chat_id: chat.id,
        text: 'Bu buyruq faqat brigada guruhida ishlaydi. Botni ustalar guruhiga qo‘shib, shu yerda /register Brigada nomi deb yozing.'
      });
      return json({ ok: true });
    }

    // Faqat guruh admini ro'yxatdan o'tkaza oladi
    try {
      const member = await tgApi(env, 'getChatMember', { chat_id: chat.id, user_id: msg.from.id });
      const status = member && member.result && member.result.status;
      if (!member.ok || (status !== 'administrator' && status !== 'creator')) {
        await tgApi(env, 'sendMessage', {
          chat_id: chat.id,
          text: 'Faqat guruh admini brigadani ro‘yxatdan o‘tkaza oladi.'
        });
        return json({ ok: true });
      }
    } catch (e) {
      // getChatMember ishlamasa ham davom etamiz (ba'zi holatlarda bot huquqi cheklangan bo'lishi mumkin)
    }

    const nomi = parts.slice(1).join(' ').trim() || chat.title || 'Brigada';

    let brigade;
    const existing = await sbFetch(env, `/rest/v1/hs_brigades?chat_id=eq.${chat.id}&select=*`);
    if (existing && existing.length) {
      brigade = (await sbFetch(env, `/rest/v1/hs_brigades?id=eq.${existing[0].id}`, 'PATCH', { nomi }))[0];
    } else {
      brigade = (await sbFetch(env, '/rest/v1/hs_brigades', 'POST', { chat_id: chat.id, nomi, code: genCode() }))[0];
    }

    const deepLink = `https://t.me/${env.BOT_USERNAME}?start=brig_${brigade.code}`;
    await tgApi(env, 'sendMessage', {
      chat_id: chat.id,
      text: `✅ <b>${nomi}</b> brigadasi ro‘yxatdan o‘tdi.\n\nBrigada a'zolari buyurtma berish uchun pastdagi tugma orqali botga o‘tishi kerak (har bir usta buni bir marta bosadi):`,
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [[{ text: '🤖 Botga o‘tish va buyurtma berish', url: deepLink }]] }
    });
    return json({ ok: true });
  }

  return json({ ok: true });
}

export async function onRequestGet() {
  return json({ ok: true, info: 'Webhook faol' });
}
