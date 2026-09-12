import { json, sbFetch, tgApi, escHtml, storageUpload } from '../_lib.js';

// Telegram bot webhook.
//
// Oqim (v3.1 — o'z-o'zidan ro'yxatdan o'tish):
//   1) Usta botni ochadi va /start bosadi
//   2) Bot xabar tagidagi tugmani VA yozuv maydoni yonidagi doimiy "Ochish"
//      tugmasini (setChatMenuButton) beradi — mini-app shu orqali ochiladi
//   3) Usta mini-appda O'ZI ro'yxatdan o'tadi: brigada nomi, login, parol
//   4) Shu login bilan kirgan HAR KIM o'sha brigada nomidan buyurtma beradi —
//      usta ham, shogirdlari ham; Excel bir xil guruhga tushadi
//
// Guruhni brigadaga bog'lashni FAQAT operator qiladi: guruhga kirib
// `/bogla <login>` deb yozadi (isOperator — ADMIN_CHAT_ID bo'yicha tekshiriladi).
// Guruh bog'lanmaguncha brigada buyurtma berolmaydi — shu sababli begona
// odamning ro'yxatdan o'tishi hech kimning guruhiga ta'sir qilmaydi.
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

  // Operator kategoriya rasmini shu yerga tashlaydi: rasm + izohda kategoriya nomi
  if (isPrivate && (msg.photo || (msg.document && /^image\//.test(msg.document.mime_type || '')))) {
    if (isOperator(env, msg.from)) {
      await handleCategoryPhoto(msg, env);
      return json({ ok: true });
    }
    await operatorEmas(env, msg);
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

  // Guruhni brigadaga bog'lash — FAQAT operator (ADMIN_CHAT_ID) uchun.
  // Usta o'zi mini-appda ro'yxatdan o'tadi, lekin qaysi guruhga buyurtma
  // tushishini faqat operator hal qiladi.
  if (cmd === '/bogla' || cmd === '/link') {
    if (!isOperator(env, msg.from)) { await operatorEmas(env, msg); return json({ ok: true }); }

    if (!isGroup) {
      await tgApi(env, 'sendMessage', {
        chat_id: chat.id,
        text: 'Bu buyruqni brigada guruhida yozing: <code>/bogla login</code>',
        parse_mode: 'HTML'
      });
      return json({ ok: true });
    }

    const login = (parts[1] || '').trim().toLowerCase();
    if (!login) {
      const cur = await sbFetch(env, `/rest/v1/hs_brigades?chat_id=eq.${chat.id}&select=nomi,login`);
      await tgApi(env, 'sendMessage', {
        chat_id: chat.id,
        text: cur && cur.length
          ? `Bu guruh <b>${escHtml(cur[0].nomi)}</b> (<code>${escHtml(cur[0].login)}</code>) brigadasiga bog‘langan.\n\nBoshqasiga bog‘lash: <code>/bogla yangi_login</code>`
          : 'Bu guruh hech qaysi brigadaga bog‘lanmagan.\n\nBog‘lash: <code>/bogla login</code>',
        parse_mode: 'HTML'
      });
      return json({ ok: true });
    }

    const rows = await sbFetch(env, `/rest/v1/hs_brigades?login=eq.${encodeURIComponent(login)}&select=id,nomi,chat_id`);
    const brigade = rows && rows[0];
    if (!brigade) {
      await tgApi(env, 'sendMessage', {
        chat_id: chat.id,
        text: `❌ <code>${escHtml(login)}</code> logini topilmadi. Usta ilovada ro‘yxatdan o‘tganini tekshiring.`,
        parse_mode: 'HTML'
      });
      return json({ ok: true });
    }

    // Bitta guruh — bitta brigada. Avvalgi egasini uzamiz, aks holda
    // chat_id unique cheklovi xato beradi.
    const band = await sbFetch(env, `/rest/v1/hs_brigades?chat_id=eq.${chat.id}&select=id,nomi`);
    for (const b of band || []) {
      if (b.id !== brigade.id) await sbFetch(env, `/rest/v1/hs_brigades?id=eq.${b.id}`, 'PATCH', { chat_id: null });
    }

    await sbFetch(env, `/rest/v1/hs_brigades?id=eq.${brigade.id}`, 'PATCH', { chat_id: chat.id });
    await tgApi(env, 'sendMessage', {
      chat_id: chat.id,
      text: `✅ Bu guruh <b>${escHtml(brigade.nomi)}</b> brigadasiga bog‘landi.\n\nEndi shu brigada bergan buyurtmalarning Excel fayli shu yerga tushadi.`,
      parse_mode: 'HTML'
    });
    return json({ ok: true });
  }

  // Operator uchun: hali guruhga bog'lanmagan brigadalar ro'yxati
  if (cmd === '/brigadalar') {
    if (!isOperator(env, msg.from)) { await operatorEmas(env, msg); return json({ ok: true }); }
    const rows = await sbFetch(env, '/rest/v1/hs_brigades?select=nomi,login,chat_id&order=created_at.desc&limit=50');
    const bosh = (rows || []).filter(b => b.chat_id == null);
    const bogli = (rows || []).filter(b => b.chat_id != null);
    const satr = b => `• <b>${escHtml(b.nomi)}</b> — <code>${escHtml(b.login || '—')}</code>`;
    await tgApi(env, 'sendMessage', {
      chat_id: chat.id,
      text:
        (bosh.length ? `⏳ <b>Guruh kutayotganlar (${bosh.length})</b>\n` + bosh.map(satr).join('\n') + '\n\n' : '') +
        (bogli.length ? `✅ <b>Bog‘langanlar (${bogli.length})</b>\n` + bogli.map(satr).join('\n') : '') ||
        'Hali brigada yo‘q.',
      parse_mode: 'HTML'
    });
    return json({ ok: true });
  }

  // Operator uchun: yozuv maydoni yonidagi doimiy "Ochish" tugmasini va bot
  // buyruqlarini hamma uchun o'rnatadi. Admin panelsiz ham ishlaydi.
  if (cmd === '/sozla') {
    if (!isOperator(env, msg.from)) { await operatorEmas(env, msg); return json({ ok: true }); }
    const url = env.MINIAPP_URL;
    const menu = await tgApi(env, 'setChatMenuButton', {
      menu_button: { type: 'web_app', text: 'Ochish', web_app: { url } }
    });
    const cmds = await tgApi(env, 'setMyCommands', { commands: BOT_COMMANDS });
    const ok = r => (r && r.ok ? '✅' : '❌ ' + ((r && r.description) || 'xato'));
    await tgApi(env, 'sendMessage', {
      chat_id: chat.id,
      text: `«Ochish» tugmasi: ${ok(menu)}\nBuyruqlar: ${ok(cmds)}\nURL: ${url}`
    });
    return json({ ok: true });
  }

  // Admin panelga bir bosishda kirish havolasi (faqat operatorga)
  if (cmd === '/admin') {
    if (!isOperator(env, msg.from)) { await operatorEmas(env, msg); return json({ ok: true }); }
    if (!isPrivate) {
      await tgApi(env, 'sendMessage', { chat_id: chat.id, text: 'Bu buyruqni menga shaxsiy chatda yozing.' });
      return json({ ok: true });
    }
    if (!env.ADMIN_TOKEN) {
      await tgApi(env, 'sendMessage', {
        chat_id: chat.id,
        text: 'ADMIN_TOKEN sozlanmagan. Cloudflare Pages → Settings → Environment variables bo‘limida <code>ADMIN_TOKEN</code> qo‘shing (istalgan uzun maxfiy so‘z) va qayta deploy qiling.',
        parse_mode: 'HTML'
      });
      return json({ ok: true });
    }
    const asos = String(env.MINIAPP_URL || '').replace(/\/+$/, '');
    await tgApi(env, 'sendMessage', {
      chat_id: chat.id,
      text:
        'Admin panel — tugmani bosing, parol so‘ramaydi:\n\n' +
        '• <b>Tovarlar</b> — Excel import, narx, aksiya\n' +
        '• <b>Buyurtmalar</b> — status o‘zgartirish\n' +
        '• <b>Obyektlar / To‘lovlar</b> — qarzni yopish\n' +
        '• <b>Kategoriyalar</b> — katalog daraxti va rasmlar\n' +
        '• <b>Brigadalar</b> — hisoblar va guruhlar\n\n' +
        '⚠️ Havolada maxfiy kalit bor — birovga uzatmang.',
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [[{ text: '⚙️ Admin panelni ochish', url: `${asos}/admin.html#token=${encodeURIComponent(env.ADMIN_TOKEN)}` }]] }
    });
    return json({ ok: true });
  }

  // Qaysi kategoriyalarda rasm yo'qligini ko'rsatadi
  if (cmd === '/rasm') {
    if (!isOperator(env, msg.from)) { await operatorEmas(env, msg); return json({ ok: true }); }
    const rows = await sbFetch(env, '/rest/v1/hs_categories?select=nomi,ota,rasm&order=ota.asc,tartib.asc');
    const yoq = (rows || []).filter(r => !r.rasm);
    const bor = (rows || []).filter(r => r.rasm);
    const nom = r => r.ota ? `${escHtml(r.ota)} ${escHtml(r.nomi)}` : `<b>${escHtml(r.nomi)}</b>`;
    await tgApi(env, 'sendMessage', {
      chat_id: chat.id,
      text:
        `🖼 Rasmi bor: ${bor.length} ta\nRasmi yo'q: ${yoq.length} ta\n\n` +
        (yoq.length
          ? yoq.slice(0, 60).map(nom).join('\n') + (yoq.length > 60 ? `\n… va yana ${yoq.length - 60} ta` : '')
          : 'Hammasiga rasm qo\u2018yilgan 👍') +
        `\n\nRasm qo'yish: rasmni shu yerga tashlang va izohiga kategoriya nomini yozing.\n` +
        `Masalan: <code>AKSESSUAR</code>\nBrend uchun: <code>ARMATURA GIACOMINI</code>`,
      parse_mode: 'HTML'
    });
    return json({ ok: true });
  }

  if (cmd === '/register') {
    await tgApi(env, 'sendMessage', {
      chat_id: chat.id,
      text: 'Ro‘yxatdan o‘tish ilovaning o‘zida: /start bosing va «Ro‘yxatdan o‘tish» ni tanlang.'
    });
    return json({ ok: true });
  }

  return json({ ok: true });
}

export const BOT_COMMANDS = [
  { command: 'start', description: 'Katalogni ochish' },
  { command: 'id', description: 'Guruh ID raqamini ko\u2018rsatish' },
  { command: 'bogla', description: 'Guruhni brigadaga bog\u2018lash (operator)' },
  { command: 'brigadalar', description: 'Brigadalar ro\u2018yxati (operator)' },
  { command: 'sozla', description: 'Botni sozlash (operator)' },
  { command: 'rasm', description: 'Kategoriya rasmlari holati (operator)' },
  { command: 'admin', description: 'Admin panelni ochish (operator)' }
];

// Kategoriya rasmi: operator botga rasm tashlaydi, izohida kategoriya nomi.
//   "AKSESSUAR"            -> kategoriya rasmi
//   "ARMATURA GIACOMINI"   -> shu kategoriyadagi brend rasmi
// Rasm Supabase Storage'ga tushadi, havolasi hs_categories.rasm ga yoziladi.
async function handleCategoryPhoto(msg, env) {
  const chatId = msg.chat.id;
  const izoh = String(msg.caption || '').trim();

  if (!izoh) {
    await tgApi(env, 'sendMessage', {
      chat_id: chatId,
      text: 'Rasm izohiga kategoriya nomini yozing.\nMasalan: <code>AKSESSUAR</code>\nBrend uchun: <code>ARMATURA GIACOMINI</code>\n\nRo\u2018yxatni ko\u2018rish: /rasm',
      parse_mode: 'HTML'
    });
    return;
  }

  const nishon = await topCategory(env, izoh);
  if (!nishon) {
    await tgApi(env, 'sendMessage', {
      chat_id: chatId,
      text: `❌ "${escHtml(izoh)}" topilmadi. /rasm buyrug\u2018i bilan ro\u2018yxatni ko\u2018ring.`,
      parse_mode: 'HTML'
    });
    return;
  }

  // Telegram rasmni bir nechta o'lchamda beradi — 500px dan katta eng
  // kichigini olamiz: sifati yetarli, hajmi kichik.
  let fileId;
  if (msg.photo && msg.photo.length) {
    const tartibli = [...msg.photo].sort((a, b) => a.width - b.width);
    fileId = (tartibli.find(p => p.width >= 500) || tartibli[tartibli.length - 1]).file_id;
  } else {
    fileId = msg.document.file_id;
  }

  try {
    const url = await rasmniYukla(env, fileId);
    const shart = nishon.ota
      ? `nomi=eq.${encodeURIComponent(nishon.nomi)}&ota=eq.${encodeURIComponent(nishon.ota)}`
      : `nomi=eq.${encodeURIComponent(nishon.nomi)}&ota=is.null`;
    await sbFetch(env, `/rest/v1/hs_categories?${shart}`, 'PATCH', { rasm: url });

    await tgApi(env, 'sendMessage', {
      chat_id: chatId,
      text: `✅ ${escHtml(nishon.ota ? nishon.ota + ' → ' + nishon.nomi : nishon.nomi)} rasmi saqlandi.`,
      parse_mode: 'HTML'
    });
  } catch (e) {
    await tgApi(env, 'sendMessage', { chat_id: chatId, text: '❌ ' + (e.message || 'Rasmni saqlab bo\u2018lmadi') });
  }
}

// Izohdagi matnni katalog daraxtidan topadi.
// Avval butun matnni kategoriya deb qaraymiz, keyin "KATEGORIYA BREND" deb.
async function topCategory(env, izoh) {
  const rows = await sbFetch(env, '/rest/v1/hs_categories?select=nomi,ota');
  const teng = (a, b) => String(a).trim().toLowerCase() === String(b).trim().toLowerCase();

  const kat = (rows || []).find(r => !r.ota && teng(r.nomi, izoh));
  if (kat) return kat;

  const bolaklar = izoh.split(/\s+/);
  for (let i = 1; i < bolaklar.length; i++) {
    const ota = bolaklar.slice(0, i).join(' ');
    const brend = bolaklar.slice(i).join(' ');
    const topildi = (rows || []).find(r => r.ota && teng(r.ota, ota) && teng(r.nomi, brend));
    if (topildi) return topildi;
  }
  // Kategoriyasiz yozilgan brend nomi — bittagina bo'lsa qabul qilamiz
  const brendlar = (rows || []).filter(r => r.ota && teng(r.nomi, izoh));
  return brendlar.length === 1 ? brendlar[0] : null;
}

// Telegram faylini Supabase Storage'ga ko'chiradi
async function rasmniYukla(env, fileId) {
  const info = await tgApi(env, 'getFile', { file_id: fileId });
  if (!info.ok) throw new Error('Faylni olib bo\u2018lmadi: ' + (info.description || ''));

  const res = await fetch(`https://api.telegram.org/file/bot${env.BOT_TOKEN}/${info.result.file_path}`);
  if (!res.ok) throw new Error('Faylni yuklab bo\u2018lmadi');
  const bytes = await res.arrayBuffer();

  const ext = (info.result.file_path.split('.').pop() || 'jpg').toLowerCase();
  const turi = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
  return storageUpload(env, bytes, turi, ext);
}

// Operator buyrug'i ishlamaganda sababini aytamiz — lekin faqat
// ADMIN_CHAT_ID umuman sozlanmagan bo'lsa. Sozlangan bo'lsa, begona odamga
// hech narsa demaymiz: bunday buyruq borligini ham bilmasin.
async function operatorEmas(env, msg) {
  if (env.ADMIN_CHAT_ID) return;
  await tgApi(env, 'sendMessage', {
    chat_id: msg.chat.id,
    text:
      '⚠️ Operator buyruqlari hali yoqilmagan.\n\n' +
      `Sizning Telegram ID raqamingiz: <code>${msg.from.id}</code>\n\n` +
      'Cloudflare Pages → Settings → Environment variables bo‘limida\n' +
      `<code>ADMIN_CHAT_ID</code> = <code>${msg.from.id}</code>\n` +
      'qo‘shing va qayta deploy qiling. Shundan keyin /sozla, /admin, ' +
      '/bogla, /brigadalar, /rasm ishlay boshlaydi.',
    parse_mode: 'HTML'
  });
}

// Operator — ADMIN_CHAT_ID da ko'rsatilgan shaxs (vergul bilan bir nechta
// bo'lishi ham mumkin). Faqat u guruhni brigadaga bog'lay oladi.
function isOperator(env, from) {
  if (!from || !env.ADMIN_CHAT_ID) return false;
  const ids = String(env.ADMIN_CHAT_ID).split(',').map(x => x.trim()).filter(Boolean);
  return ids.includes(String(from.id));
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
      'Pastdagi tugmani bosing:\n' +
      '• birinchi marta bo‘lsa — <b>«Ro‘yxatdan o‘tish»</b> ni tanlab, brigadangizga nom, login va parol o‘ylab toping;\n' +
      '• allaqachon ro‘yxatdan o‘tgan bo‘lsangiz — login va parolingiz bilan kiring.\n\n' +
      'So‘ng botni ustalar guruhingizga qo‘shing va operatorga login‘ingizni yuboring — u guruhni brigadangizga bog‘laydi, shundan keyin buyurtmalar shu guruhga tusha boshlaydi.',
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
