import { json, sbFetch, requireUser, hashPassword, safeEqual, randomSalt } from '../_lib.js';

// Brigadaning login/parolini o'zgartirish.
//
// Login va parol butun brigada uchun umumiy, ya'ni o'zgarish hammaga
// tegadi — shuning uchun joriy parolni bilish shart. Faqat shu brigadaga
// kirgan foydalanuvchi o'zgartira oladi.

const LOGIN_RE = /^[a-z0-9_.-]{3,32}$/;

export async function onRequestPost({ request, env }) {
  const user = await requireUser(request, env);
  if (!user) return json({ error: 'Foydalanuvchini tasdiqlab bo‘lmadi.' }, 401);

  const b = await request.json().catch(() => ({}));
  const joriy = String(b.joriy_parol || '');
  const yangiLogin = String(b.login || '').trim().toLowerCase();
  const yangiParol = String(b.parol || '');

  if (!joriy) return json({ error: 'Joriy parolni kiriting' }, 400);
  if (!yangiLogin && !yangiParol) return json({ error: 'Yangi login yoki parolni kiriting' }, 400);

  const userRows = await sbFetch(env, `/rest/v1/hs_users?telegram_id=eq.${user.id}&select=brigade_id`);
  const brigadeId = userRows && userRows[0] && userRows[0].brigade_id;
  if (!brigadeId) return json({ error: 'Siz brigadaga ulanmagansiz' }, 403);

  const rows = await sbFetch(env, `/rest/v1/hs_brigades?id=eq.${encodeURIComponent(brigadeId)}&select=id,login,parol_hash,parol_salt`);
  const brigade = rows && rows[0];
  if (!brigade) return json({ error: 'Brigada topilmadi' }, 404);

  const tekshir = await hashPassword(joriy, brigade.parol_salt || 'yoq');
  if (!brigade.parol_hash || !safeEqual(tekshir, brigade.parol_hash)) {
    return json({ error: 'Joriy parol noto‘g‘ri' }, 401);
  }

  const patch = {};
  if (yangiLogin && yangiLogin !== brigade.login) {
    if (!LOGIN_RE.test(yangiLogin)) return json({ error: 'Login 3–32 belgi: kichik lotin harflari, raqam, _ . -' }, 400);
    const band = await sbFetch(env, `/rest/v1/hs_brigades?login=eq.${encodeURIComponent(yangiLogin)}&select=id`);
    if (band && band.length && band[0].id !== brigadeId) return json({ error: 'Bu login band' }, 409);
    patch.login = yangiLogin;
  }
  if (yangiParol) {
    if (yangiParol.length < 5) return json({ error: 'Yangi parol kamida 5 belgi bo‘lsin' }, 400);
    const salt = randomSalt();
    patch.parol_salt = salt;
    patch.parol_hash = await hashPassword(yangiParol, salt);
  }
  if (!Object.keys(patch).length) return json({ error: 'O‘zgartirish yo‘q' }, 400);

  const yangilandi = await sbFetch(env, `/rest/v1/hs_brigades?id=eq.${encodeURIComponent(brigadeId)}`, 'PATCH', patch);
  return json({ ok: true, login: yangilandi[0].login });
}
