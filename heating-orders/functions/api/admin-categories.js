import { json, sbFetch, checkAdmin } from '../_lib.js';

// Admin panel: katalog daraxtini (kategoriya -> brend) boshqarish.
//   GET    — butun daraxt
//   POST   — yangi kategoriya yoki brend qo'shish
//   PATCH  — nomi/tartib/rasm/faol o'zgartirish
//   DELETE — o'chirish (kategoriya o'chsa, brendlari ham o'chadi)
//
// Jadval kaliti (nomi, ota) — shuning uchun o'zgartirishda eski nomni
// `eski_nomi` orqali yuboramiz.

function key(nomi, ota) {
  const n = `nomi=eq.${encodeURIComponent(nomi)}`;
  return ota ? `${n}&ota=eq.${encodeURIComponent(ota)}` : `${n}&ota=is.null`;
}

export async function onRequestGet({ request, env }) {
  if (!checkAdmin(request, env)) return json({ error: 'Ruxsat yo‘q' }, 401);
  const rows = await sbFetch(env, '/rest/v1/hs_categories?select=*&order=ota.asc,tartib.asc,nomi.asc');
  return json(rows || []);
}

export async function onRequestPost({ request, env }) {
  if (!checkAdmin(request, env)) return json({ error: 'Ruxsat yo‘q' }, 401);
  const b = await request.json().catch(() => ({}));
  const nomi = String(b.nomi || '').trim();
  const ota = String(b.ota || '').trim() || null;
  if (!nomi) return json({ error: 'Nom kerak' }, 400);

  const bor = await sbFetch(env, `/rest/v1/hs_categories?${key(nomi, ota)}&select=nomi`);
  if (bor && bor.length) return json({ error: 'Bunday nom allaqachon bor' }, 409);

  const rows = await sbFetch(env, '/rest/v1/hs_categories', 'POST', {
    nomi, ota,
    tartib: Number.isFinite(Number(b.tartib)) ? Number(b.tartib) : 100,
    rasm: String(b.rasm || '').trim() || null,
    faol: true
  });
  return json(rows[0]);
}

export async function onRequestPatch({ request, env }) {
  if (!checkAdmin(request, env)) return json({ error: 'Ruxsat yo‘q' }, 401);
  const b = await request.json().catch(() => ({}));
  const eski = String(b.eski_nomi || b.nomi || '').trim();
  const ota = String(b.ota || '').trim() || null;
  if (!eski) return json({ error: 'nomi kerak' }, 400);

  const patch = {};
  if (b.nomi !== undefined && String(b.nomi).trim() !== eski) {
    const yangi = String(b.nomi).trim();
    if (!yangi) return json({ error: 'Nom bo‘sh bo‘lmasin' }, 400);
    patch.nomi = yangi;
  }
  if (b.tartib !== undefined && Number.isFinite(Number(b.tartib))) patch.tartib = Number(b.tartib);
  if (b.rasm !== undefined) patch.rasm = String(b.rasm).trim() || null;
  if (b.faol !== undefined) patch.faol = !!b.faol;
  if (!Object.keys(patch).length) return json({ error: 'O‘zgartirish yo‘q' }, 400);

  const rows = await sbFetch(env, `/rest/v1/hs_categories?${key(eski, ota)}`, 'PATCH', patch);

  // Kategoriya nomi o'zgarsa, brendlarining `ota` maydonini ham yangilaymiz
  if (patch.nomi && !ota) {
    await sbFetch(env, `/rest/v1/hs_categories?ota=eq.${encodeURIComponent(eski)}`, 'PATCH', { ota: patch.nomi });
  }
  return json(rows[0] || { ok: true });
}

export async function onRequestDelete({ request, env }) {
  if (!checkAdmin(request, env)) return json({ error: 'Ruxsat yo‘q' }, 401);
  const u = new URL(request.url);
  const nomi = (u.searchParams.get('nomi') || '').trim();
  const ota = (u.searchParams.get('ota') || '').trim() || null;
  if (!nomi) return json({ error: 'nomi kerak' }, 400);

  if (!ota) await sbFetch(env, `/rest/v1/hs_categories?ota=eq.${encodeURIComponent(nomi)}`, 'DELETE');
  await sbFetch(env, `/rest/v1/hs_categories?${key(nomi, ota)}`, 'DELETE');
  return json({ ok: true });
}
