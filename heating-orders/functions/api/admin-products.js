import { json, sbFetch, checkAdmin } from '../_lib.js';

// Admin panel uchun tovarlar CRUD API. Barcha so'rovlar X-Admin-Token header talab qiladi.

function normalizeRow(r) {
  return {
    artikul: String(r.artikul || '').trim(),
    nomi: String(r.nomi || '').trim(),
    narx: Number(r.narx) || 0,
    birlik: String(r.birlik || 'dona').trim() || 'dona',
    kategoriya: String(r.kategoriya || 'Boshqa').trim() || 'Boshqa',
    faol: r.faol !== false
  };
}

export async function onRequestGet({ request, env }) {
  if (!checkAdmin(request, env)) return json({ error: 'Ruxsat yo‘q' }, 401);
  const data = await sbFetch(env, '/rest/v1/hs_products?select=*&order=kategoriya.asc,nomi.asc');
  return json(data);
}

export async function onRequestPost({ request, env }) {
  if (!checkAdmin(request, env)) return json({ error: 'Ruxsat yo‘q' }, 401);
  const body = await request.json();

  if (Array.isArray(body)) {
    const rows = body.map(normalizeRow).filter(r => r.nomi);
    if (!rows.length) return json({ error: 'Import uchun yaroqli qatorlar topilmadi' }, 400);
    const data = await sbFetch(env, '/rest/v1/hs_products', 'POST', rows);
    return json({ inserted: data.length });
  }

  const row = normalizeRow(body);
  if (!row.nomi) return json({ error: 'Nomi kiritilishi shart' }, 400);
  const data = await sbFetch(env, '/rest/v1/hs_products', 'POST', row);
  return json(data[0]);
}

export async function onRequestPut({ request, env }) {
  if (!checkAdmin(request, env)) return json({ error: 'Ruxsat yo‘q' }, 401);
  const body = await request.json();
  if (!body.id) return json({ error: 'id kerak' }, 400);
  const { id, ...rest } = normalizeRowPartial(body);
  const data = await sbFetch(env, `/rest/v1/hs_products?id=eq.${body.id}`, 'PATCH', rest);
  return json(data[0]);
}

function normalizeRowPartial(body) {
  const out = { id: body.id };
  if (body.artikul !== undefined) out.artikul = String(body.artikul).trim();
  if (body.nomi !== undefined) out.nomi = String(body.nomi).trim();
  if (body.narx !== undefined) out.narx = Number(body.narx) || 0;
  if (body.birlik !== undefined) out.birlik = String(body.birlik).trim() || 'dona';
  if (body.kategoriya !== undefined) out.kategoriya = String(body.kategoriya).trim() || 'Boshqa';
  if (body.faol !== undefined) out.faol = !!body.faol;
  return out;
}

export async function onRequestDelete({ request, env }) {
  if (!checkAdmin(request, env)) return json({ error: 'Ruxsat yo‘q' }, 401);
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return json({ error: 'id kerak' }, 400);
  await sbFetch(env, `/rest/v1/hs_products?id=eq.${id}`, 'DELETE');
  return json({ ok: true });
}
