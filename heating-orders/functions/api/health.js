import { json, sbFetch } from '../_lib.js';

// Tezkor diagnostika: brauzerda <MINIAPP_URL>/api/health ni ochsangiz,
// nima sozlanmaganini darrov ko'rsatadi.
//
// Hech qanday maxfiy qiymat qaytarilmaydi — faqat "bor / yo'q" belgisi.

const KERAK = {
  hs_brigades: ['login', 'parol_hash', 'parol_salt', 'faol', 'yaratgan_telegram_id'],
  hs_objects: ['lat', 'lng'],
  hs_products: ['kichik_kategoriya'],
  hs_pending_locations: ['telegram_id', 'lat', 'lng'],
  hs_categories: ['nomi', 'ota', 'tartib']
};

async function jadvalHolati(env, jadval, ustunlar) {
  try {
    await sbFetch(env, `/rest/v1/${jadval}?select=${ustunlar.join(',')}&limit=1`);
    return { ok: true };
  } catch (e) {
    return { ok: false, xato: String(e.message || e) };
  }
}

export async function onRequestGet({ env }) {
  const env_holati = {
    SUPABASE_URL: !!env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: !!env.SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_ANON_KEY: !!env.SUPABASE_ANON_KEY,
    BOT_TOKEN: !!env.BOT_TOKEN,
    MINIAPP_URL: env.MINIAPP_URL || null,
    ADMIN_TOKEN: !!env.ADMIN_TOKEN,
    ADMIN_CHAT_ID: !!env.ADMIN_CHAT_ID,
    WEBHOOK_SECRET: !!env.WEBHOOK_SECRET
  };

  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return json({ ok: false, sabab: 'Supabase sozlanmagan', env: env_holati }, 200);
  }

  const baza = {};
  for (const [jadval, ustunlar] of Object.entries(KERAK)) {
    baza[jadval] = await jadvalHolati(env, jadval, ustunlar);
  }
  const ok = Object.values(baza).every(x => x.ok);

  return json({
    ok,
    sabab: ok ? 'Hammasi joyida' : 'Baza yangilanmagan — schema.sql ni Supabase SQL Editor\'da ishga tushiring',
    baza,
    env: env_holati
  });
}
