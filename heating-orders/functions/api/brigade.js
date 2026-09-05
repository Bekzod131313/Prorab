import { json, sbFetch } from '../_lib.js';

// Mini-app ochilganda brigada nomini ko'rsatish uchun ochiq (lekin xavfsiz) endpoint.
// chat_id kabi ichki ma'lumotlarni qaytarmaydi — faqat nomi.

export async function onRequestGet({ request, env }) {
  const { searchParams } = new URL(request.url);
  const code = (searchParams.get('code') || '').trim();
  if (!code) return json({ error: 'code kerak' }, 400);

  const rows = await sbFetch(env, `/rest/v1/hs_brigades?code=eq.${encodeURIComponent(code)}&select=nomi`);
  if (!rows || !rows.length) return json({ error: 'Brigada topilmadi' }, 404);
  return json({ nomi: rows[0].nomi });
}
