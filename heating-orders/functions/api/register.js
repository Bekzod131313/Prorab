import { json, sbFetch, requireUser, genCode, randomSalt, hashPassword, tgApi, escHtml } from '../_lib.js';

// Ustaning o'zi ro'yxatdan o'tadi: brigada nomi + login + parol o'ylab topadi.
//
// Bu yerda guruh bog'lanmaydi — yangi brigada `chat_id` siz yaratiladi.
// Guruhni brigadaga faqat operator bog'laydi (botda /bogla buyrug'i bilan),
// shuning uchun tasodifiy ro'yxatdan o'tgan odam hech kimning guruhiga
// buyurtma yuborolmaydi.

const LOGIN_RE = /^[a-z0-9_.-]{3,32}$/;

export async function onRequestPost({ request, env }) {
  const user = await requireUser(request, env);
  if (!user) return json({ error: 'Foydalanuvchini tasdiqlab bo‘lmadi. Ilovani Telegram ichida oching.' }, 401);

  const body = await request.json().catch(() => ({}));
  const nomi = String(body.nomi || '').trim();
  const login = String(body.login || '').trim().toLowerCase();
  const parol = String(body.parol || '');

  if (nomi.length < 2 || nomi.length > 80) return json({ error: 'Brigada nomini kiriting (2–80 belgi)' }, 400);
  if (!LOGIN_RE.test(login)) return json({ error: 'Login 3–32 belgi bo‘lsin: kichik lotin harflari, raqam, _ . -' }, 400);
  if (parol.length < 5) return json({ error: 'Parol kamida 5 belgi bo‘lsin' }, 400);

  const taken = await sbFetch(env, `/rest/v1/hs_brigades?login=eq.${encodeURIComponent(login)}&select=id`);
  if (taken && taken.length) return json({ error: 'Bu login band — boshqasini tanlang' }, 409);

  const salt = randomSalt();
  const rows = await sbFetch(env, '/rest/v1/hs_brigades', 'POST', {
    nomi,
    login,
    parol_salt: salt,
    parol_hash: await hashPassword(parol, salt),
    chat_id: null,
    code: genCode(),
    faol: true,
    yaratgan_telegram_id: user.id
  });
  const brigade = rows[0];

  const existing = await sbFetch(env, `/rest/v1/hs_users?telegram_id=eq.${user.id}&select=telegram_id`);
  const profileRows = (existing && existing.length)
    ? await sbFetch(env, `/rest/v1/hs_users?telegram_id=eq.${user.id}`, 'PATCH', {
        brigade_id: brigade.id, updated_at: new Date().toISOString()
      })
    : await sbFetch(env, '/rest/v1/hs_users', 'POST', {
        telegram_id: user.id,
        ism: [user.first_name, user.last_name].filter(Boolean).join(' ') || user.username || '',
        brigade_id: brigade.id
      });

  // Operatorga xabar: yangi brigada guruh kutyapti
  if (env.ADMIN_CHAT_ID) {
    try {
      await tgApi(env, 'sendMessage', {
        chat_id: env.ADMIN_CHAT_ID,
        text:
          `🆕 Yangi brigada ro‘yxatdan o‘tdi\n\n` +
          `Nomi: <b>${escHtml(nomi)}</b>\n` +
          `Login: <code>${escHtml(login)}</code>\n` +
          `Kim: ${escHtml([user.first_name, user.last_name].filter(Boolean).join(' '))}` +
          (user.username ? ` (@${escHtml(user.username)})` : '') + `\n\n` +
          `Guruhga bog‘lash: guruhga kirib <code>/bogla ${escHtml(login)}</code> deb yozing.`,
        parse_mode: 'HTML'
      });
    } catch (e) { /* xabar ketmasa ham ro'yxatdan o'tish bekor bo'lmasin */ }
  }

  const objects = await sbFetch(env, `/rest/v1/hs_objects?brigade_id=eq.${brigade.id}&select=*&order=created_at.desc`);

  return json({
    profile: profileRows[0],
    brigade: { id: brigade.id, nomi: brigade.nomi, code: brigade.code, login: brigade.login, guruh_bogli: false },
    objects: objects || []
  });
}
