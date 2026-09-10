import { json, sbFetch, requireUser, tgApi } from '../_lib.js';

// Obyektga biriktirilgan joylashuvni foydalanuvchining shaxsiy Telegram
// chatiga haqiqiy lokatsiya xabari sifatida yuboradi — shunda uni
// Telegram'ning o'zining native xarita ko'ruvchisi orqali ko'radi
// (bizning ilova ichida alohida xarita render qilishga hojat yo'q).

export async function onRequestGet({ request, env }) {
  const user = await requireUser(request, env);
  if (!user) return json({ error: 'Ruxsat yo‘q' }, 401);

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return json({ error: 'id kerak' }, 400);

  const rows = await sbFetch(env, `/rest/v1/hs_objects?id=eq.${id}&select=lat,lng,nomi`);
  const obj = rows && rows[0];
  if (!obj || obj.lat == null || obj.lng == null) return json({ error: 'Lokatsiya biriktirilmagan' }, 404);

  const res = await tgApi(env, 'sendLocation', { chat_id: user.id, latitude: obj.lat, longitude: obj.lng });
  if (!res.ok) return json({ error: 'Telegramga yuborishda xatolik: ' + (res.description || '') }, 502);

  return json({ ok: true });
}
