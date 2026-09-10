import { json, sbFetch, requireUser, checkAdmin } from '../_lib.js';

async function getUserBrigadeId(env, telegramId) {
  const rows = await sbFetch(env, `/rest/v1/hs_users?telegram_id=eq.${telegramId}&select=brigade_id`);
  return rows && rows[0] && rows[0].brigade_id;
}

function summarize(debtRows) {
  const byObj = {};
  for (const d of debtRows) {
    if (!byObj[d.object_id]) byObj[d.object_id] = { jami: 0, tolangan: 0 };
    if (d.turi === 'qarz') byObj[d.object_id].jami += Number(d.summa);
    else byObj[d.object_id].tolangan += Number(d.summa);
  }
  return byObj;
}

export async function onRequestGet({ request, env }) {
  const isAdmin = checkAdmin(request, env);
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  let brigadeId = null;
  if (!isAdmin) {
    const user = await requireUser(request, env);
    if (!user) return json({ error: 'Ruxsat yo‘q' }, 401);
    brigadeId = await getUserBrigadeId(env, user.id);
    if (!brigadeId) return json(id ? { error: 'Obyekt topilmadi' } : [], id ? 404 : 200);
  }

  if (id) {
    const encId = encodeURIComponent(id);
    const filter = isAdmin ? `id=eq.${encId}` : `id=eq.${encId}&brigade_id=eq.${brigadeId}`;
    const rows = await sbFetch(env, `/rest/v1/hs_objects?${filter}&select=*`);
    const obj = rows && rows[0];
    if (!obj) return json({ error: 'Obyekt topilmadi' }, 404);

    const debt = await sbFetch(env, `/rest/v1/hs_debt_entries?object_id=eq.${encId}&select=turi,summa`);
    const sum = summarize(debt)[id] || { jami: 0, tolangan: 0 };
    const orderCountRes = await sbFetch(env, `/rest/v1/hs_orders?object_id=eq.${encId}&select=id,created_at&order=created_at.desc`);
    return json({
      ...obj,
      jami: sum.jami,
      tolangan: sum.tolangan,
      qarzdorlik: sum.jami - sum.tolangan,
      orders_count: orderCountRes.length,
      last_order_at: orderCountRes[0] ? orderCountRes[0].created_at : null
    });
  }

  const listPath = isAdmin
    ? `/rest/v1/hs_objects?select=*,hs_brigades(nomi)&order=created_at.desc`
    : `/rest/v1/hs_objects?brigade_id=eq.${brigadeId}&select=*&order=created_at.desc`;
  const objects = await sbFetch(env, listPath);
  if (!objects.length) return json([]);

  const ids = objects.map(o => o.id);
  const orFilter = ids.map(i => `object_id.eq.${i}`).join(',');
  const debt = await sbFetch(env, `/rest/v1/hs_debt_entries?or=(${orFilter})&select=object_id,turi,summa`);
  const sums = summarize(debt);

  return json(objects.map(o => {
    const s = sums[o.id] || { jami: 0, tolangan: 0 };
    return { ...o, jami: s.jami, tolangan: s.tolangan, qarzdorlik: s.jami - s.tolangan };
  }));
}

export async function onRequestPost({ request, env }) {
  const user = await requireUser(request, env);
  if (!user) return json({ error: 'Ruxsat yo‘q' }, 401);

  const brigadeId = await getUserBrigadeId(env, user.id);
  if (!brigadeId) return json({ error: 'Avval brigadaga ulaning (guruhda /register)' }, 400);

  const body = await request.json();
  const nomi = String(body.nomi || '').trim();
  if (!nomi) return json({ error: 'Obyekt nomi kiritilishi shart' }, 400);

  const lat = Number(body.lat);
  const lng = Number(body.lng);

  const rows = await sbFetch(env, '/rest/v1/hs_objects', 'POST', {
    brigade_id: brigadeId,
    nomi,
    manzil: String(body.manzil || '').trim() || null,
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
    created_by: user.id
  });
  return json(rows[0]);
}

export async function onRequestPatch({ request, env }) {
  const user = await requireUser(request, env);
  if (!user) return json({ error: 'Ruxsat yo‘q' }, 401);

  const brigadeId = await getUserBrigadeId(env, user.id);
  if (!brigadeId) return json({ error: 'Avval brigadaga ulaning (guruhda /register)' }, 400);

  const body = await request.json();
  if (!body.id) return json({ error: 'id kerak' }, 400);

  const patch = {};
  if (body.nomi !== undefined) patch.nomi = String(body.nomi).trim();
  if (body.manzil !== undefined) patch.manzil = String(body.manzil).trim();
  if (body.lat !== undefined) { const n = Number(body.lat); patch.lat = Number.isFinite(n) ? n : null; }
  if (body.lng !== undefined) { const n = Number(body.lng); patch.lng = Number.isFinite(n) ? n : null; }

  const rows = await sbFetch(env, `/rest/v1/hs_objects?id=eq.${encodeURIComponent(body.id)}&brigade_id=eq.${brigadeId}`, 'PATCH', patch);
  if (!rows || !rows.length) return json({ error: 'Obyekt topilmadi' }, 404);
  return json(rows[0]);
}
