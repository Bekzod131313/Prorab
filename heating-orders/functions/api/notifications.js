import { json, sbFetch, requireUser } from '../_lib.js';

export async function onRequestGet({ request, env }) {
  const user = await requireUser(request, env);
  if (!user) return json({ error: 'Ruxsat yo‘q' }, 401);
  const rows = await sbFetch(env, `/rest/v1/hs_notifications?telegram_id=eq.${user.id}&select=*&order=created_at.desc&limit=100`);
  return json(rows);
}

export async function onRequestPatch({ request, env }) {
  const user = await requireUser(request, env);
  if (!user) return json({ error: 'Ruxsat yo‘q' }, 401);
  const body = await request.json();

  if (body.mark_all) {
    await sbFetch(env, `/rest/v1/hs_notifications?telegram_id=eq.${user.id}&oqilgan=eq.false`, 'PATCH', { oqilgan: true });
    return json({ ok: true });
  }
  if (!body.id) return json({ error: 'id kerak' }, 400);
  const rows = await sbFetch(env, `/rest/v1/hs_notifications?id=eq.${encodeURIComponent(body.id)}&telegram_id=eq.${user.id}`, 'PATCH', { oqilgan: true });
  return json(rows[0] || { ok: true });
}
