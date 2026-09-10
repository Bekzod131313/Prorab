import { json, sbFetch, requireUser } from '../_lib.js';

// Mini-app ochilganda bir marta chaqiriladi: foydalanuvchini tasdiqlaydi,
// hs_users'da profilni yaratadi/yangilaydi, brigadaga ulaydi (agar ?g= kod
// bo'lsa) va profil + brigada + obyektlar ro'yxatini qaytaradi.

export async function onRequestPost({ request, env }) {
  const user = await requireUser(request, env);
  if (!user) return json({ error: 'Foydalanuvchini tasdiqlab bo‘lmadi. Ilovani Telegram ichida oching.' }, 401);

  const body = await request.json().catch(() => ({}));
  const code = (body.code || '').trim();

  // Round 1: kod bo'yicha brigada va mavjud foydalanuvchini parallel so'raymiz
  // (bir-biriga bog'liq emas) — sekvensial so'rovlar sonini kamaytirish uchun.
  const [codeRows, existing] = await Promise.all([
    code ? sbFetch(env, `/rest/v1/hs_brigades?code=eq.${encodeURIComponent(code)}&select=id`) : Promise.resolve(null),
    sbFetch(env, `/rest/v1/hs_users?telegram_id=eq.${user.id}&select=*`)
  ]);
  const codeBrigadeId = codeRows && codeRows[0] ? codeRows[0].id : null;
  // Mavjud foydalanuvchi allaqachon biror brigadaga ulangan bo'lsa, u saqlanadi
  // (kod boshqa brigadaga tegishli bo'lsa ham); aks holda kod bo'yicha brigada olinadi.
  const existingBrigadeId = (existing && existing.length && existing[0].brigade_id) || null;
  const effectiveBrigadeId = existingBrigadeId || codeBrigadeId;

  // Round 2: profilni yozish bilan bir vaqtda (agar brigada ma'lum bo'lsa)
  // brigada va obyektlarni ham parallel olib kelamiz.
  const upsertP = (existing && existing.length)
    ? (() => {
        const patch = { updated_at: new Date().toISOString() };
        if (codeBrigadeId && !existing[0].brigade_id) patch.brigade_id = codeBrigadeId;
        return sbFetch(env, `/rest/v1/hs_users?telegram_id=eq.${user.id}`, 'PATCH', patch);
      })()
    : sbFetch(env, '/rest/v1/hs_users', 'POST', {
        telegram_id: user.id,
        ism: [user.first_name, user.last_name].filter(Boolean).join(' ') || user.username || '',
        brigade_id: effectiveBrigadeId
      });

  const [upserted, brows, objects] = await Promise.all([
    upsertP,
    effectiveBrigadeId ? sbFetch(env, `/rest/v1/hs_brigades?id=eq.${effectiveBrigadeId}&select=id,nomi,code`) : Promise.resolve(null),
    effectiveBrigadeId ? sbFetch(env, `/rest/v1/hs_objects?brigade_id=eq.${effectiveBrigadeId}&select=*&order=created_at.desc`) : Promise.resolve([])
  ]);

  const profile = upserted[0];
  const brigade = (brows && brows[0]) || null;

  return json({ profile, brigade, objects: objects || [] });
}
