import { json, sbFetch, checkAdmin, notify } from '../_lib.js';

// To'lov qayd etish — faqat admin (operator) tomonidan, admin.html orqali.
// Mijoz to'lovni naqd/bank orqali offline amalga oshiradi, operator shu
// yerda "qabul qilindi" deb belgilaydi va obyekt qarzi kamayadi.

export async function onRequestPost({ request, env }) {
  if (!checkAdmin(request, env)) return json({ error: 'Ruxsat yo‘q' }, 401);

  const body = await request.json();
  const objectId = body.object_id;
  const summa = Number(body.summa);
  if (!objectId) return json({ error: 'object_id kerak' }, 400);
  if (!summa || summa <= 0) return json({ error: 'Summa noto‘g‘ri' }, 400);

  const objRows = await sbFetch(env, `/rest/v1/hs_objects?id=eq.${objectId}&select=*`);
  const object = objRows && objRows[0];
  if (!object) return json({ error: 'Obyekt topilmadi' }, 404);

  const entry = (await sbFetch(env, '/rest/v1/hs_debt_entries', 'POST', {
    object_id: objectId,
    turi: 'tolov',
    summa,
    izoh: body.izoh || 'To‘lov qabul qilindi'
  }))[0];

  if (object.created_by) {
    await notify(env, {
      telegram_id: object.created_by,
      turi: 'tolov',
      matn: `💰 To‘lov qabul qilindi\nObyekt: ${object.nomi}\nSumma: ${summa.toLocaleString('ru-RU')} so'm`,
      object_id: objectId
    });
  }

  return json(entry);
}
