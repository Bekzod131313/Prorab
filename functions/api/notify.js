import { json } from '../_lib.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const { telegram_id, text } = await request.json();
    if (!telegram_id || !text) return json({ error: 'telegram_id va text kerak' }, 400);
    const res = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: telegram_id, text, parse_mode: 'HTML' })
    });
    const data = await res.json();
    return json(data);
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}
