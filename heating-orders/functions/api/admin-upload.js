import { json, checkAdmin } from '../_lib.js';

// Rasmni Supabase Storage'ning ochiq "katalog" paketiga yuklaydi va
// ochiq havolasini qaytaradi. Faylning o'zi admin panelda 400x400 ga
// kichraytirilib, JPEG qilib yuboriladi — bu yerga allaqachon kichik
// fayl keladi.

const MAX = 1024 * 1024; // 1 MB
const BUCKET = 'katalog';

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
  // Nomni o'zimiz yasaymiz — foydalanuvchi bergan nom yo'lni buzmasligi uchun
  const nom = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${kengaytma}`;

  const res = await fetch(`${env.SUPABASE_URL}/storage/v1/object/${BUCKET}/${nom}`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY,
      'Content-Type': turi,
      'x-upsert': 'true'
    },
    body: bytes
  });

  if (!res.ok) {
    const matn = await res.text();
    if (/bucket not found/i.test(matn)) {
      return json({ error: `Supabase Storage'da "${BUCKET}" nomli ochiq (public) bucket yarating.` }, 400);
    }
    return json({ error: 'Yuklab bo‘lmadi: ' + matn.slice(0, 200) }, 500);
  }

  return json({ url: `${env.SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${nom}` });
}
