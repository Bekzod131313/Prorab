// Umumiy yordamchi funksiyalar — Cloudflare Pages Functions uchun

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  });
}

// Supabase REST API'ga service_role kalit bilan so'rov (RLS'ni chetlab o'tadi)
export async function sbFetch(env, path, method = 'GET', body) {
  const res = await fetch(env.SUPABASE_URL + path, {
    method,
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY,
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    },
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error((data && (data.message || data.msg)) || ('Supabase error: ' + res.status));
  return data;
}

// Telegram WebApp initData imzosini tekshirish
// https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
export async function verifyInitData(initData, botToken) {
  if (!initData || !botToken) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  const enc = new TextEncoder();
  const secretKey = await crypto.subtle.importKey(
    'raw', enc.encode('WebAppData'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const secret = await crypto.subtle.sign('HMAC', secretKey, enc.encode(botToken));
  const key = await crypto.subtle.importKey('raw', secret, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(dataCheckString));
  const hex = [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');

  if (hex !== hash) return null;

  // initData 24 soatdan eski bo'lsa rad etamiz
  const authDate = Number(params.get('auth_date') || 0);
  if (authDate && Date.now() / 1000 - authDate > 86400) return null;

  const userStr = params.get('user');
  return userStr ? JSON.parse(userStr) : null;
}

export async function tgApi(env, method, payload) {
  const res = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return res.json();
}

export function genCode(len = 6) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

export function checkAdmin(request, env) {
  const token = request.headers.get('X-Admin-Token');
  return !!(token && env.ADMIN_TOKEN && token === env.ADMIN_TOKEN);
}

// So'rov headeridan Telegram foydalanuvchisini tasdiqlab qaytaradi (yoki null)
export async function requireUser(request, env) {
  const initData = request.headers.get('X-Telegram-Init-Data') || '';
  return verifyInitData(initData, env.BOT_TOKEN);
}

// Buyurtma uchun ketma-ket raqam: OTP-2026-0001 ko'rinishida
export async function nextOrderNo(env) {
  return sbFetch(env, '/rest/v1/rpc/hs_next_order_no', 'POST', {});
}

// Foydalanuvchiga Telegram xabari yuboradi VA hs_notifications'ga yozadi
export async function notify(env, { telegram_id, turi, matn, order_id, object_id }) {
  try {
    await tgApi(env, 'sendMessage', { chat_id: telegram_id, text: matn, parse_mode: 'HTML' });
  } catch (e) {
    // Foydalanuvchi botni shaxsiy /start qilmagan bo'lishi mumkin — bildirishnoma
    // tarixda saqlanib qoladi, faqat Telegram push kelmaydi
  }
  try {
    await sbFetch(env, '/rest/v1/hs_notifications', 'POST', {
      telegram_id, turi, matn,
      order_id: order_id || null,
      object_id: object_id || null
    });
  } catch (e) {
    // bildirishnoma yozib bo'lmasa ham asosiy amal (buyurtma va h.k.) davom etishi kerak
  }
}
