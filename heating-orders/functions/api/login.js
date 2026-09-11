import { json, sbFetch, requireUser, hashPassword, safeEqual } from '../_lib.js';

// Brigada login/parol bilan kirish.
//
// Bitta brigadaning login/paroli guruhdagi hamma uchun umumiy: usta va uning
// shogirdlari o'z Telegram akkauntidan kiradi, lekin buyurtma bir xil
// brigada nomidan ketadi va bir xil guruhga tushadi.
//
// Login/parolni admin panelda biz o'zimiz yaratamiz — botda ro'yxatdan
// o'tish yo'q.

export async function onRequestPost({ request, env }) {
  const user = await requireUser(request, env);
  if (!user) return json({ error: 'Foydalanuvchini tasdiqlab bo‘lmadi. Ilovani Telegram ichida oching.' }, 401);

  const body = await request.json().catch(() => ({}));
  const login = String(body.login || '').trim().toLowerCase();
  const parol = String(body.parol || '');
  if (!login || !parol) return json({ error: 'Login va parolni kiriting' }, 400);

  const rows = await sbFetch(
    env,
    `/rest/v1/hs_brigades?login=eq.${encodeURIComponent(login)}&select=id,nomi,code,faol,parol_hash,parol_salt`
  );
  const brigade = rows && rows[0];

  // Login topilmasa ham parolni hisoblaymiz — javob vaqti bo'yicha mavjud
  // loginlarni ajratib olishning oldini oladi.
  const salt = (brigade && brigade.parol_salt) || 'yoq';
  const hash = await hashPassword(parol, salt);

  if (!brigade || !brigade.parol_hash || !safeEqual(hash, brigade.parol_hash)) {
    return json({ error: 'Login yoki parol noto‘g‘ri' }, 401);
  }
  if (brigade.faol === false) {
    return json({ error: 'Bu hisob vaqtincha o‘chirilgan. Operator bilan bog‘laning.' }, 403);
  }

  const existing = await sbFetch(env, `/rest/v1/hs_users?telegram_id=eq.${user.id}&select=telegram_id`);
  const profileRows = (existing && existing.length)
    ? await sbFetch(env, `/rest/v1/hs_users?telegram_id=eq.${user.id}`, 'PATCH', {
        brigade_id: brigade.id,
        updated_at: new Date().toISOString()
      })
    : await sbFetch(env, '/rest/v1/hs_users', 'POST', {
        telegram_id: user.id,
        ism: [user.first_name, user.last_name].filter(Boolean).join(' ') || user.username || '',
        brigade_id: brigade.id
      });

  const objects = await sbFetch(
    env,
    `/rest/v1/hs_objects?brigade_id=eq.${brigade.id}&select=*&order=created_at.desc`
  );

  return json({
    profile: profileRows[0],
    brigade: { id: brigade.id, nomi: brigade.nomi, code: brigade.code },
    objects: objects || []
  });
}
