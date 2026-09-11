import { json, sbFetch, tgApi, escHtml } from '../_lib.js';

// Telegram bot webhook.
//
// Oqim (v3 — login/parol):
//   1) Usta botni ochadi va /start bosadi
//   2) Bot xabar tagidagi tugmani VA yozuv maydoni yonidagi doimiy "Ochish"
//      tugmasini (setChatMenuButton) beradi — mini-app shu orqali ochiladi
//   3) Mini-app'da usta brigadaning login/parolini kiritadi
//      (login/parolni admin panelda biz yaratamiz)
//   4) Shu login bilan kirgan HAR KIM o'sha brigada nomidan buyurtma beradi —
//      usta ham, shogirdlari ham; Excel bir xil guruhga tushadi
//
// Guruhni brigadaga bog'lash: guruhga botni qo'shib /id deb yoziladi, chiqqan
// raqam admin panelda brigadaning chat_id maydoniga kiritiladi.
//
// MUHIM: Telegram inline tugmalarida `web_app` turi FAQAT bot bilan shaxsiy
// (private) chatda ishlaydi, guruhda ishlamaydi.
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
    if (!isPrivate) {
      await tgApi(env, 'sendMessage', {
        chat_id: chat.id,
        text: 'Buyurtma berish uchun bot bilan shaxsiy chatga o‘ting va u yerda /start bosing.'
      });
      return json({ ok: true });
    }

    await openMiniApp(env, chat.id);
    return json({ ok: true });
  }

  // Guruhni brigadaga bog'lash uchun chat_id ni ko'rsatadi.
  if (cmd === '/id') {
    await tgApi(env, 'sendMessage', {
      chat_id: chat.id,
      text: isGroup
        ? `Bu guruhning ID raqami:\n<code>${chat.id}</code>\n\nShu raqamni admin panelda brigadaning <b>chat_id</b> maydoniga kiriting.`
        : `Sizning ID raqamingiz: <code>${chat.id}</code>`,
      parse_mode: 'HTML'
    });
    return json({ ok: true });
  }

  // Eski /register oqimi olib tashlandi: brigadalarni login/parol bilan admin
  // panelda yaratamiz va guruhni o'zimiz bog'laymiz.
  if (cmd === '/register') {
    await tgApi(env, 'sendMessage', {
      chat_id: chat.id,
      text: isGroup
        ? `Endi brigada guruhda ro‘yxatdan o‘tmaydi.\n\nGuruhni bog‘lash uchun <code>/id</code> deb yozing va chiqqan raqamni operatorga yuboring — u sizga login va parol beradi.`
        : 'Login va parolni operator beradi. Kirgandan keyin /start bosib katalogni oching.',
      parse_mode: 'HTML'
    });
    return json({ ok: true });
  }

  return json({ ok: true });
}

// Mini-app'ni ochadigan ikkita tugmani beradi:
//   1) xabar tagidagi inline tugma
//   2) yozuv maydoni yonidagi doimiy menyu tugmasi ("Ochish") — foydalanuvchi
//      chatga har qaytganda ko'rinib turadi, eski xabarni qidirish shart emas
async function openMiniApp(env, chatId) {
  const url = env.MINIAPP_URL;

  await tgApi(env, 'setChatMenuButton', {
    chat_id: chatId,
    menu_button: { type: 'web_app', text: 'Ochish', web_app: { url } }
  });

  const sendRes = await tgApi(env, 'sendMessage', {
    chat_id: chatId,
    text:
      '👋 Salom! Bu ZODPRO — santexnika va otopleniya materiallariga buyurtma berish ilovasi.\n\n' +
      'Pastdagi tugmani bosing va brigadangizning <b>login</b> va <b>parol</b>ini kiriting.\n' +
      'Login/parolni operator beradi.',
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: [[{ text: '🛒 Katalogni ochish', web_app: { url } }]] }
  });

  if (!sendRes.ok) {
    await tgApi(env, 'sendMessage', {
      chat_id: chatId,
      text: `⚠️ Diagnostika: tugmali xabar yuborib bo'lmadi.\nTelegram xatosi: ${sendRes.description || 'noma\u02bclum'}\nURL: ${url}`
    });
  }
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
