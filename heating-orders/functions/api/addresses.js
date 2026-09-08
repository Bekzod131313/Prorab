import { json, sbFetch, requireUser } from '../_lib.js';

export async function onRequestGet({ request, env }) {
  const user = await requireUser(request, env);
  if (!user) return json({ error: 'Ruxsat yo‘q' }, 401);
  const rows = await sbFetch(env, `/rest/v1/hs_addresses?telegram_id=eq.${user.id}&select=*&order=created_at.desc`);
  return json(rows);
}

export async function onRequestPost({ request, env }) {
  const user = await requireUser(request, env);
  if (!user) return json({ error: 'Ruxsat yo‘q' }, 401);
  const body = await request.json();
  const nomi = String(body.nomi || '').trim();
  const manzil = String(body.manzil || '').trim();
  if (!nomi || !manzil) return json({ error: 'Nomi va manzil kiritilishi shart' }, 400);
  const rows = await sbFetch(env, '/rest/v1/hs_addresses', 'POST', { telegram_id: user.id, nomi, manzil });
  return json(rows[0]);
}

export async function onRequestDelete({ request, env }) {
  const user = await requireUser(request, env);
  if (!user) return json({ error: 'Ruxsat yo‘q' }, 401);
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return json({ error: 'id kerak' }, 400);
  await sbFetch(env, `/rest/v1/hs_addresses?id=eq.${id}&telegram_id=eq.${user.id}`, 'DELETE');
  return json({ ok: true });
}
