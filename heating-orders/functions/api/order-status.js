import { json, sbFetch, checkAdmin, notify } from '../_lib.js';

const STATUSES = ['yangi', 'jarayonda', 'yetkazilgan', 'bekor_qilingan'];
const LABELS = { yangi: 'Yangi', jarayonda: 'Jarayonda', yetkazilgan: 'Yetkazilgan', bekor_qilingan: 'Bekor qilingan' };

// Buyurtma statusini o'zgartirish — faqat admin (operator).

export async function onRequestPost({ request, env }) {
  if (!checkAdmin(request, env)) return json({ error: 'Ruxsat yo‘q' }, 401);

  const body = await request.json();
  if (!body.id) return json({ error: 'id kerak' }, 400);
  if (!STATUSES.includes(body.status)) return json({ error: 'status noto‘g‘ri' }, 400);

  const rows = await sbFetch(env, `/rest/v1/hs_orders?id=eq.${body.id}`, 'PATCH', { status: body.status });
  const order = rows && rows[0];
  if (!order) return json({ error: 'Buyurtma topilmadi' }, 404);

  if (order.telegram_id) {
    await notify(env, {
      telegram_id: order.telegram_id,
      turi: 'buyurtma',
      matn: `📦 Buyurtma holati o‘zgardi: <b>${order.order_no || order.id}</b>\nYangi status: <b>${LABELS[body.status]}</b>`,
      order_id: order.id,
      object_id: order.object_id
    });
  }

  return json(order);
}
