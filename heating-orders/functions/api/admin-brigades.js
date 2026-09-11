import { json, sbFetch, checkAdmin, genCode, randomSalt, hashPassword } from '../_lib.js';

// Admin panel: brigadalarni (guruh hisoblarini) boshqarish.
//   GET    — ro'yxat (parol hech qachon qaytarilmaydi)
//   POST   — yangi brigada: nomi, login, parol, chat_id
//   PATCH  — nomi/login/chat_id/faol o'zgartirish, parolni yangilash
//   DELETE — brigadani o'chirish

const LOGIN_RE = /^[a-z0-9_.-]{3,32}$/;

function clean(row) {
  if (!row) return row;
  const { parol_hash, parol_salt, ...rest } = row;
  return { ...rest, parol_bor: !!parol_hash };
}

export async function onRequestGet({ request, env }) {
  if (!checkAdmin(request, env)) return json({ error: 'Ruxsat yo‘q' }, 401);
  const rows = await sbFetch(env, '/rest/v1/hs_brigades?select=*&order=created_at.desc');
  return json((rows || []).map(clean));
}

export async function onRequestPost({ request, env }) {
  if (!checkAdmin(request, env)) return json({ error: 'Ruxsat yo‘q' }, 401);
  const b = await request.json().catch(() => ({}));

  const nomi = String(b.nomi || '').trim();
  const login = String(b.login || '').trim().toLowerCase();
  const parol = String(b.parol || '');
  if (!nomi) return json({ error: 'Brigada nomi kerak' }, 400);
  if (!LOGIN_RE.test(login)) return json({ error: 'Login 3–32 belgi: kichik harf, raqam, _ . -' }, 400);
  if (parol.length < 5) return json({ error: 'Parol kamida 5 belgi bo‘lsin' }, 400);

  const taken = await sbFetch(env, `/rest/v1/hs_brigades?login=eq.${encodeURIComponent(login)}&select=id`);
  if (taken && taken.length) return json({ error: 'Bu login band' }, 409);

  const salt = randomSalt();
  const rows = await sbFetch(env, '/rest/v1/hs_brigades', 'POST', {
    nomi,
    login,
    parol_salt: salt,
    parol_hash: await hashPassword(parol, salt),
    chat_id: b.chat_id ? Number(b.chat_id) : null,
    code: genCode(),
    faol: true
  });
  return json(clean(rows[0]));
}

export async function onRequestPatch({ request, env }) {
  if (!checkAdmin(request, env)) return json({ error: 'Ruxsat yo‘q' }, 401);
  const b = await request.json().catch(() => ({}));
  const id = String(b.id || '');
  if (!id) return json({ error: 'id kerak' }, 400);

  const patch = {};
  if (b.nomi !== undefined) {
    const nomi = String(b.nomi).trim();
    if (!nomi) return json({ error: 'Brigada nomi bo‘sh bo‘lmasin' }, 400);
    patch.nomi = nomi;
  }
  if (b.login !== undefined) {
    const login = String(b.login).trim().toLowerCase();
    if (!LOGIN_RE.test(login)) return json({ error: 'Login 3–32 belgi: kichik harf, raqam, _ . -' }, 400);
    const taken = await sbFetch(env, `/rest/v1/hs_brigades?login=eq.${encodeURIComponent(login)}&select=id`);
    if (taken && taken.length && taken[0].id !== id) return json({ error: 'Bu login band' }, 409);
    patch.login = login;
  }
  if (b.chat_id !== undefined) patch.chat_id = b.chat_id === '' || b.chat_id === null ? null : Number(b.chat_id);
  if (b.faol !== undefined) patch.faol = !!b.faol;
  if (b.parol) {
    if (String(b.parol).length < 5) return json({ error: 'Parol kamida 5 belgi bo‘lsin' }, 400);
    const salt = randomSalt();
    patch.parol_salt = salt;
    patch.parol_hash = await hashPassword(String(b.parol), salt);
  }
  if (!Object.keys(patch).length) return json({ error: 'O‘zgartirish uchun maydon yo‘q' }, 400);

  const rows = await sbFetch(env, `/rest/v1/hs_brigades?id=eq.${encodeURIComponent(id)}`, 'PATCH', patch);
  return json(clean(rows[0]));
}

export async function onRequestDelete({ request, env }) {
  if (!checkAdmin(request, env)) return json({ error: 'Ruxsat yo‘q' }, 401);
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return json({ error: 'id kerak' }, 400);
  await sbFetch(env, `/rest/v1/hs_brigades?id=eq.${encodeURIComponent(id)}`, 'DELETE');
  return json({ ok: true });
}
