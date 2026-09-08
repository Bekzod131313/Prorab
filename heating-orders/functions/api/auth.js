import { json, sbFetch, requireUser } from '../_lib.js';

// Mini-app ochilganda bir marta chaqiriladi: foydalanuvchini tasdiqlaydi,
// hs_users'da profilni yaratadi/yangilaydi, brigadaga ulaydi (agar ?g= kod
// bo'lsa) va profil + brigada + obyektlar ro'yxatini qaytaradi.

export async function onRequestPost({ request, env }) {
  const user = await requireUser(request, env);
  if (!user) return json({ error: 'Foydalanuvchini tasdiqlab bo‘lmadi. Ilovani Telegram ichida oching.' }, 401);

  const body = await request.json().catch(() => ({}));
  const code = (body.code || '').trim();

  let brigadeId = null;
  if (code) {
    const rows = await sbFetch(env, `/rest/v1/hs_brigades?code=eq.${encodeURIComponent(code)}&select=id`);
    if (rows && rows[0]) brigadeId = rows[0].id;
  }

  const existing = await sbFetch(env, `/rest/v1/hs_users?telegram_id=eq.${user.id}&select=*`);
  let profile;
  if (existing && existing.length) {
    const patch = { updated_at: new Date().toISOString() };
    if (brigadeId && !existing[0].brigade_id) patch.brigade_id = brigadeId;
    profile = (await sbFetch(env, `/rest/v1/hs_users?telegram_id=eq.${user.id}`, 'PATCH', patch))[0];
  } else {
    profile = (await sbFetch(env, '/rest/v1/hs_users', 'POST', {
      telegram_id: user.id,
      ism: [user.first_name, user.last_name].filter(Boolean).join(' ') || user.username || '',
      brigade_id: brigadeId
    }))[0];
  }

  let brigade = null;
  let objects = [];
  if (profile.brigade_id) {
    const brows = await sbFetch(env, `/rest/v1/hs_brigades?id=eq.${profile.brigade_id}&select=id,nomi,code`);
    brigade = brows && brows[0] || null;
    objects = await sbFetch(env, `/rest/v1/hs_objects?brigade_id=eq.${profile.brigade_id}&select=*&order=created_at.desc`);
  }

  return json({ profile, brigade, objects });
}
