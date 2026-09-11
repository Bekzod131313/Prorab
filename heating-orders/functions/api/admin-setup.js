import { json, tgApi, checkAdmin } from '../_lib.js';
import { BOT_COMMANDS } from './bot.js';

// Bir martalik sozlash: webhook + hamma uchun standart "Ochish" tugmasi.
//
// Telegram'da yozuv maydoni yonidagi tugma — bu chat menu button. Uni global
// qilib qo'ysak, bot bilan chatni ochgan har kim (hatto /start bosmasdan ham)
// "Ochish" tugmasini ko'radi.

export async function onRequestPost({ request, env }) {
  if (!checkAdmin(request, env)) return json({ error: 'Ruxsat yo‘q' }, 401);

  const url = env.MINIAPP_URL;
  if (!url) return json({ error: 'MINIAPP_URL sozlanmagan' }, 400);

  const menu = await tgApi(env, 'setChatMenuButton', {
    menu_button: { type: 'web_app', text: 'Ochish', web_app: { url } }
  });

  const commands = await tgApi(env, 'setMyCommands', { commands: BOT_COMMANDS });

  const webhook = await tgApi(env, 'setWebhook', {
    url: `${url.replace(/\/+$/, '')}/api/bot`,
    secret_token: env.WEBHOOK_SECRET || undefined,
    allowed_updates: ['message', 'callback_query']
  });

  return json({ menu_button: menu, commands, webhook });
}
