import { json, sbFetch, requireUser } from '../_lib.js';

// Brigadadan chiqish — foydalanuvchi boshqa hisob bilan kira olsin.
// Profil (ism, telefon, sozlamalar) saqlanib qoladi, faqat brigada uziladi.

export async function onRequestPost({ request, env }) {
  const user = await requireUser(request, env);
  if (!user) return json({ error: 'Foydalanuvchini tasdiqlab bo‘lmadi.' }, 401);

  await sbFetch(env, `/rest/v1/hs_users?telegram_id=eq.${user.id}`, 'PATCH', {
    brigade_id: null,
    updated_at: new Date().toISOString()
  });
  return json({ ok: true });
}
