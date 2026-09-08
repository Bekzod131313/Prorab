import { json, sbFetch, requireUser } from '../_lib.js';

// Bitta obyektning to'liq qarzdorlik tarixi (qarz + to'lov yozuvlari, vaqt bo'yicha)

export async function onRequestGet({ request, env }) {
  const user = await requireUser(request, env);
  if (!user) return json({ error: 'Ruxsat yo‘q' }, 401);

  const { searchParams } = new URL(request.url);
  const objectId = searchParams.get('object_id');
  if (!objectId) return json({ error: 'object_id kerak' }, 400);

  const rows = await sbFetch(env, `/rest/v1/hs_debt_entries?object_id=eq.${objectId}&select=*&order=created_at.desc`);
  return json(rows);
}
