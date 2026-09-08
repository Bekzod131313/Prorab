import { json, sbFetch, requireUser } from '../_lib.js';

const EDITABLE = ['ism', 'telefon', 'kompaniya', 'til', 'tema', 'bildir_buyurtma', 'bildir_qarz', 'bildir_aksiya'];

export async function onRequestGet({ request, env }) {
  const user = await requireUser(request, env);
  if (!user) return json({ error: 'Ruxsat yo‘q' }, 401);
  const rows = await sbFetch(env, `/rest/v1/hs_users?telegram_id=eq.${user.id}&select=*`);
  if (!rows || !rows.length) return json({ error: 'Profil topilmadi. Avval /api/auth chaqiring.' }, 404);
  return json(rows[0]);
}

export async function onRequestPatch({ request, env }) {
  const user = await requireUser(request, env);
  if (!user) return json({ error: 'Ruxsat yo‘q' }, 401);
  const body = await request.json();

  const patch = { updated_at: new Date().toISOString() };
  for (const k of EDITABLE) if (body[k] !== undefined) patch[k] = body[k];

  const rows = await sbFetch(env, `/rest/v1/hs_users?telegram_id=eq.${user.id}`, 'PATCH', patch);
  if (!rows || !rows.length) return json({ error: 'Profil topilmadi' }, 404);
  return json(rows[0]);
}
