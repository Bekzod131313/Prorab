// Umumiy yordamchi funksiyalar — Cloudflare Pages Functions uchun

// Bildirishnoma matniga foydalanuvchi kiritgan qiymatlar (obyekt nomi va h.k.)
// qo'shilganda ishlatiladi: Telegram'ga parse_mode=HTML bilan yuborilganda
// yaroqsiz teglar xatolikka olib kelmasligi, va mini-app'da bildirishnoma
// matni innerHTML sifatida chiqarilganda skript ishga tushmasligi uchun.
export function escHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Narxlar dollarda — tiyinlar yo'qolmasligi uchun har doim 2 xona
export function pul(n) {
  return (Number(n) || 0).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

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

// ---- Brigada paroli (PBKDF2-SHA256, 100k iteratsiya) ----
// Parol hech qachon ochiq saqlanmaydi: har brigadaga tasodifiy salt beriladi.
export function randomSalt(bytes = 16) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return [...a].map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function hashPassword(parol, salt) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(parol), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: enc.encode(salt), iterations: 100000, hash: 'SHA-256' },
    key, 256
  );
  return [...new Uint8Array(bits)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// Vaqt bo'yicha teng taqqoslash (parolni bit-bit topishga yo'l qo'ymaslik uchun)
export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ---- Supabase Storage ----
// Bucket nomi STORAGE_BUCKET env'idan olinadi, bo'lmasa "katalog".
// Supabase bucket nomlarida katta-kichik harf farq qiladi, shuning uchun
// topilmasa bir marta ro'yxatdan katta-kichik harfga qaramay qidiramiz —
// "Katalog" deb yaratilgan bo'lsa ham ishlaydi.
export async function storageUpload(env, bytes, contentType, ext) {
  const nom = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
  const kerakli = env.STORAGE_BUCKET || 'katalog';

  const yubor = async (bucket) => {
    const res = await fetch(`${env.SUPABASE_URL}/storage/v1/object/${encodeURIComponent(bucket)}/${nom}`, {
      method: 'POST',
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY,
        'Content-Type': contentType,
        'x-upsert': 'true'
      },
      body: bytes
    });
    return { ok: res.ok, matn: res.ok ? '' : await res.text() };
  };

  let bucket = kerakli;
  let r = await yubor(bucket);

  if (!r.ok && /bucket not found/i.test(r.matn)) {
    const topilgan = await bucketTop(env, kerakli);
    if (topilgan && topilgan !== bucket) {
      bucket = topilgan;
      r = await yubor(bucket);
    }
  }

  if (!r.ok) {
    if (/bucket not found/i.test(r.matn)) {
      throw new Error(`Supabase Storage'da "${kerakli}" nomli ochiq (public) bucket yarating.`);
    }
    throw new Error('Storage xatosi: ' + r.matn.slice(0, 150));
  }

  return `${env.SUPABASE_URL}/storage/v1/object/public/${encodeURIComponent(bucket)}/${nom}`;
}

// Bucket ro'yxatidan nomni katta-kichik harfga qaramay topadi
async function bucketTop(env, nom) {
  try {
    const res = await fetch(`${env.SUPABASE_URL}/storage/v1/bucket`, {
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY
      }
    });
    if (!res.ok) return null;
    const royxat = await res.json();
    const mos = (royxat || []).find(b => String(b.name).toLowerCase() === String(nom).toLowerCase());
    return mos ? mos.name : null;
  } catch (e) {
    return null;
  }
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
