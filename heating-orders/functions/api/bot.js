import { json, sbFetch, tgApi, genCode, escHtml } from '../_lib.js';

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
//
// Obyekt lokatsiyasi: usta (yoki kimdir uning nomidan) botning shaxsiy
// chatiga lokatsiya (jonli yoki forward qilingan) yuboradi -> bot qaysi
// obyektga tegishli ekanini so'raydi (brigadaning obyektlar ro'yxati bilan)
// -> tugma bosilganda shu obyektga lat/lng saqlanadi.

export async function onRequestPost({ request, env }) {
  if (env.WEBHOOK_SECRET) {
    const secret = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
    if (secret !== env.WEBHOOK_SECRET) return json({ ok: false }, 401);
  }

  let update;
  try { update = await request.json(); } catch (e) { return json({ ok: true }); }

  if (update.callback_query) {
    await handleLocationCallback(update.callback_query, env);
    return json({ ok: true });
  }

  const msg = update.message;
  if (!msg) return json({ ok: true });

  const chat = msg.chat;
  const isPrivate = chat.type === 'private';
  const isGroup = chat.type === 'group' || chat.type === 'supergroup';

  if (msg.location && isPrivate) {
    await handleLocationMessage(msg, env);
    return json({ ok: true });
  }

  if (!msg.text) return json({ ok: true });
  const text = msg.text.trim();
  const parts = text.split(/\s+/);
  const cmd = (parts[0] || '').split('@')[0];

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
      const sendRes = await tgApi(env, 'sendMessage', {
        chat_id: chat.id,
        text: `👋 Salom! Siz <b>${escHtml(brigade.nomi)}</b> brigadasi nomidan buyurtma berasiz.\n\nTovar tanlash uchun pastdagi tugmani bosing 👇`,
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: [[{ text: '🛒 Katalog va buyurtma', web_app: { url } }]] }
      });
      if (!sendRes.ok) {
        await tgApi(env, 'sendMessage', {
          chat_id: chat.id,
          text: `⚠️ Diagnostika: tugmali xabar yuborib bo'lmadi.\nTelegram xatosi: ${sendRes.description || 'nomaʼlum'}\nURL: ${url}`
        });
      }
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
      text: `✅ <b>${escHtml(nomi)}</b> brigadasi ro‘yxatdan o‘tdi.\n\nBrigada a'zolari buyurtma berish uchun pastdagi tugma orqali botga o‘tishi kerak (har bir usta buni bir marta bosadi):`,
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [[{ text: '🤖 Botga o‘tish va buyurtma berish', url: deepLink }]] }
    });
    return json({ ok: true });
  }

  return json({ ok: true });
}

// Foydalanuvchi (yoki unga forward qilingan) lokatsiya yuborsa — brigadasining
// obyektlar ro'yxatini tugmalar bilan ko'rsatib, qaysi obyektga tegishli
// ekanini so'raymiz. Tanlanguncha lat/lng vaqtincha hs_pending_locations'da saqlanadi.
async function handleLocationMessage(msg, env) {
  const chatId = msg.chat.id;
  const { latitude, longitude } = msg.location;

  const userRows = await sbFetch(env, `/rest/v1/hs_users?telegram_id=eq.${msg.from.id}&select=brigade_id`);
  const brigadeId = userRows && userRows[0] && userRows[0].brigade_id;
  if (!brigadeId) {
    await tgApi(env, 'sendMessage', {
      chat_id: chatId,
      text: 'Avval mini-ilovani bir marta oching (guruhda /register qilingan havola orqali), keyin lokatsiyani qaytadan yuboring.'
    });
    return;
  }

  const objects = await sbFetch(env, `/rest/v1/hs_objects?brigade_id=eq.${brigadeId}&select=id,nomi&order=created_at.desc`);
  if (!objects || !objects.length) {
    await tgApi(env, 'sendMessage', {
      chat_id: chatId,
      text: 'Sizda hali obyekt yo‘q. Avval mini-ilovaning "Obyektlar" bo‘limida obyekt yarating, keyin lokatsiyani qaytadan yuboring.'
    });
    return;
  }

  const existing = await sbFetch(env, `/rest/v1/hs_pending_locations?telegram_id=eq.${msg.from.id}&select=telegram_id`);
  if (existing && existing.length) {
    await sbFetch(env, `/rest/v1/hs_pending_locations?telegram_id=eq.${msg.from.id}`, 'PATCH', { lat: latitude, lng: longitude });
  } else {
    await sbFetch(env, '/rest/v1/hs_pending_locations', 'POST', { telegram_id: msg.from.id, lat: latitude, lng: longitude });
  }

  await tgApi(env, 'sendMessage', {
    chat_id: chatId,
    text: '📍 Bu lokatsiya qaysi obyektga tegishli?',
    reply_markup: { inline_keyboard: objects.map(o => [{ text: o.nomi, callback_data: `setloc:${o.id}` }]) }
  });
}

// Obyekt tugmasi bosilganda — pending lokatsiyani shu obyektga yozadi.
async function handleLocationCallback(cq, env) {
  const data = cq.data || '';
  if (!data.startsWith('setloc:')) {
    await tgApi(env, 'answerCallbackQuery', { callback_query_id: cq.id });
    return;
  }
  const objectId = data.slice('setloc:'.length);

  const pending = await sbFetch(env, `/rest/v1/hs_pending_locations?telegram_id=eq.${cq.from.id}&select=lat,lng`);
  const loc = pending && pending[0];
  if (!loc) {
    await tgApi(env, 'answerCallbackQuery', {
      callback_query_id: cq.id,
      text: 'Lokatsiya muddati tugagan, qaytadan yuboring.',
      show_alert: true
    });
    return;
  }

  const userRows = await sbFetch(env, `/rest/v1/hs_users?telegram_id=eq.${cq.from.id}&select=brigade_id`);
  const brigadeId = userRows && userRows[0] && userRows[0].brigade_id;

  const rows = await sbFetch(env, `/rest/v1/hs_objects?id=eq.${objectId}&brigade_id=eq.${brigadeId}`, 'PATCH', { lat: loc.lat, lng: loc.lng });
  const obj = rows && rows[0];

  await sbFetch(env, `/rest/v1/hs_pending_locations?telegram_id=eq.${cq.from.id}`, 'DELETE');
  await tgApi(env, 'answerCallbackQuery', { callback_query_id: cq.id, text: obj ? '✅ Saqlandi' : '⚠️ Xatolik yuz berdi' });

  if (obj && cq.message) {
    await tgApi(env, 'editMessageText', {
      chat_id: cq.message.chat.id,
      message_id: cq.message.message_id,
      text: `✅ Lokatsiya <b>${obj.nomi}</b> obyektiga saqlandi.`,
      parse_mode: 'HTML'
    });
  }
}

export async function onRequestGet() {
  return json({ ok: true, info: 'Webhook faol' });
}
