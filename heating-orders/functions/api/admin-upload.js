import { json, checkAdmin, storageUpload } from '../_lib.js';

// Rasmni Supabase Storage'ga yuklaydi va ochiq havolasini qaytaradi.
// Faylning o'zi admin panelda 500x500 ga kichraytirilib, JPEG qilib
// yuboriladi — bu yerga allaqachon kichik fayl keladi.

const MAX = 1024 * 1024; // 1 MB

export async function onRequestPost({ request, env }) {
  if (!checkAdmin(request, env)) return json({ error: 'Ruxsat yo‘q' }, 401);

  const form = await request.formData().catch(() => null);
  const file = form && form.get('file');
  if (!file || typeof file.arrayBuffer !== 'function') return json({ error: 'Fayl yuborilmadi' }, 400);

  const turi = file.type || 'image/jpeg';
  if (!/^image\/(jpeg|png|webp)$/.test(turi)) return json({ error: 'Faqat JPEG, PNG yoki WebP' }, 400);

  const bytes = await file.arrayBuffer();
  if (bytes.byteLength > MAX) return json({ error: 'Fayl 1 MB dan katta' }, 400);

  const kengaytma = turi === 'image/png' ? 'png' : turi === 'image/webp' ? 'webp' : 'jpg';

  try {
    return json({ url: await storageUpload(env, bytes, turi, kengaytma) });
  } catch (e) {
    return json({ error: e.message }, 400);
  }
}
