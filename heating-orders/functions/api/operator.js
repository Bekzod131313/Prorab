import { json, requireUser, tgApi, escHtml } from '../_lib.js';

// Profil → Yordam → Operatorga yozish: foydalanuvchi xabarini admin/operator
// shaxsiy chatiga (ADMIN_CHAT_ID) forward qiladi.

export async function onRequestPost({ request, env }) {
  const user = await requireUser(request, env);
  if (!user) return json({ error: 'Ruxsat yo‘q' }, 401);
  if (!env.ADMIN_CHAT_ID) return json({ error: 'Operator ulanmagan (ADMIN_CHAT_ID sozlanmagan)' }, 500);

  const body = await request.json();
  const matn = String(body.matn || '').trim();
  if (!matn) return json({ error: 'Xabar bo‘sh bo‘lishi mumkin emas' }, 400);

  const name = [user.first_name, user.last_name].filter(Boolean).join(' ') || user.username || String(user.id);
  await tgApi(env, 'sendMessage', {
    chat_id: env.ADMIN_CHAT_ID,
    text: `✉️ <b>Yangi murojaat</b>\nKimdan: ${escHtml(name)} (id: ${user.id})\n\n${escHtml(matn)}`,
    parse_mode: 'HTML'
  });

  return json({ ok: true });
}
