import { SB_URL, json, sbFetch } from '../_lib.js';

const SB_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRqcmVvdnZwb2pzaWNjbmRsZ3p1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0NzMzOTksImV4cCI6MjA5NTA0OTM5OX0.fgaat8STrBIj6WC_p98zYN3Tfp6kScDKYXuHk1lLDKk';

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const { ob_id, kasb, access_token } = await request.json();
    if (!ob_id || !access_token) return json({ error: 'ob_id va access_token kerak' }, 400);

    // Foydalanuvchini access_token orqali aniqlash
    const userRes = await fetch(SB_URL + '/auth/v1/user', {
      headers: { apikey: SB_ANON_KEY, Authorization: 'Bearer ' + access_token }
    });
    if (!userRes.ok) return json({ error: 'Sessiya yaroqsiz' }, 401);
    const user = await userRes.json();

    // Obyekt egasi ekanini tekshirish
    const obs = await sbFetch(env, `/rest/v1/obyektlar?id=eq.${ob_id}&select=id,owner_id`);
    if (!obs.length || obs[0].owner_id !== user.id) {
      return json({ error: 'Faqat obyekt egasi taklif yaratishi mumkin' }, 403);
    }

    const token = crypto.randomUUID().replace(/-/g, '');
    await sbFetch(env, '/rest/v1/invites', 'POST', {
      ob_id, token, kasb: kasb || null, created_by: user.id
    });

    return json({ token });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}
