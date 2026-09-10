import { json, sbFetch, requireUser } from '../_lib.js';

// Bitta obyektning to'liq qarzdorlik tarixi (qarz + to'lov yozuvlari, vaqt bo'yicha)

export async function onRequestGet({ request, env }) {
  const user = await requireUser(request, env);
  if (!user) return json({ error: 'Ruxsat yo‘q' }, 401);

  const { searchParams } = new URL(request.url);
  const objectId = searchParams.get('object_id');
  if (!objectId) return json({ error: 'object_id kerak' }, 400);
  const encId = encodeURIComponent(objectId);

  // Obyekt so'rovchi foydalanuvchining o'z brigadasiga tegishli ekanini
  // tekshiramiz — aks holda har qanday usta boshqa brigadaning qarzdorlik
  // tarixini object_id'ni bilib olib ko'rishi mumkin edi.
  const userRows = await sbFetch(env, `/rest/v1/hs_users?telegram_id=eq.${user.id}&select=brigade_id`);
  const brigadeId = userRows && userRows[0] && userRows[0].brigade_id;
  if (!brigadeId) return json([]);

  const objRows = await sbFetch(env, `/rest/v1/hs_objects?id=eq.${encId}&brigade_id=eq.${brigadeId}&select=id`);
  if (!objRows || !objRows.length) return json({ error: 'Obyekt topilmadi' }, 404);

  const rows = await sbFetch(env, `/rest/v1/hs_debt_entries?object_id=eq.${encId}&select=*&order=created_at.desc`);
  return json(rows);
}
