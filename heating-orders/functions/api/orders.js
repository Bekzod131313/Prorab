import { json, sbFetch, requireUser, checkAdmin } from '../_lib.js';

// Buyurtmalarim: joriy foydalanuvchining brigadasiga tegishli buyurtmalar
// ro'yxati (?object_id= bilan bitta obyektga filtrlash mumkin) yoki
// bitta buyurtma tafsiloti (?id=).
// Admin panel X-Admin-Token bilan kirsa — brigadadan qat'iy nazar
// BARCHA buyurtmalarni ko'ra oladi (status boshqarish uchun).

export async function onRequestGet({ request, env }) {
  const isAdmin = checkAdmin(request, env);
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  const objectId = searchParams.get('object_id');

  if (id) {
    const rows = await sbFetch(env, `/rest/v1/hs_orders?id=eq.${id}&select=*,hs_objects(nomi,manzil)`);
    const order = rows && rows[0];
    if (!order) return json({ error: 'Buyurtma topilmadi' }, 404);
    if (!isAdmin) {
      const user = await requireUser(request, env);
      if (!user) return json({ error: 'Ruxsat yo‘q' }, 401);
    }
    return json(order);
  }

  if (isAdmin) {
    let path = `/rest/v1/hs_orders?select=*,hs_objects(nomi),hs_brigades(nomi)&order=created_at.desc&limit=200`;
    if (objectId) path += `&object_id=eq.${objectId}`;
    return json(await sbFetch(env, path));
  }

  const user = await requireUser(request, env);
  if (!user) return json({ error: 'Ruxsat yo‘q' }, 401);

  const userRows = await sbFetch(env, `/rest/v1/hs_users?telegram_id=eq.${user.id}&select=brigade_id`);
  const brigadeId = userRows && userRows[0] && userRows[0].brigade_id;
  if (!brigadeId) return json([]);

  let path = `/rest/v1/hs_orders?brigade_id=eq.${brigadeId}&select=*,hs_objects(nomi)&order=created_at.desc&limit=100`;
  if (objectId) path += `&object_id=eq.${objectId}`;

  const orders = await sbFetch(env, path);
  return json(orders);
}
