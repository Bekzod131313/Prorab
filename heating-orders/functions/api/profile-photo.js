import { json, sbFetch, requireUser, storageUpload } from '../_lib.js';

// Profil rasmi. Fayl ilovada 400x400 ga kichraytirilib yuboriladi,
// shuning uchun bu yerga kichik JPEG keladi.

const MAX = 1024 * 1024; // 1 MB

export async function onRequestPost({ request, env }) {
  const user = await requireUser(request, env);
  if (!user) return json({ error: 'Foydalanuvchini tasdiqlab bo‘lmadi.' }, 401);

  const form = await request.formData().catch(() => null);
  const file = form && form.get('file');
  if (!file || typeof file.arrayBuffer !== 'function') return json({ error: 'Fayl yuborilmadi' }, 400);

  const turi = file.type || 'image/jpeg';
  if (!/^image\/(jpeg|png|webp)$/.test(turi)) return json({ error: 'Faqat JPEG, PNG yoki WebP' }, 400);

  const bytes = await file.arrayBuffer();
  if (bytes.byteLength > MAX) return json({ error: 'Rasm 1 MB dan katta' }, 400);

  const ext = turi === 'image/png' ? 'png' : turi === 'image/webp' ? 'webp' : 'jpg';
  const url = await storageUpload(env, bytes, turi, ext);

  const rows = await sbFetch(env, `/rest/v1/hs_users?telegram_id=eq.${user.id}`, 'PATCH', {
    avatar: url, updated_at: new Date().toISOString()
  });
  return json(rows[0]);
}

// Rasmni olib tashlash
export async function onRequestDelete({ request, env }) {
  const user = await requireUser(request, env);
  if (!user) return json({ error: 'Foydalanuvchini tasdiqlab bo‘lmadi.' }, 401);
  const rows = await sbFetch(env, `/rest/v1/hs_users?telegram_id=eq.${user.id}`, 'PATCH', {
    avatar: null, updated_at: new Date().toISOString()
  });
  return json(rows[0]);
}
