import { SB_URL, json, sbFetch, verifyInitData } from '../_lib.js';

const SB_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRqcmVvdnZwb2pzaWNjbmRsZ3p1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0NzMzOTksImV4cCI6MjA5NTA0OTM5OX0.fgaat8STrBIj6WC_p98zYN3Tfp6kScDKYXuHk1lLDKk';

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const { token, initData, access_token } = await request.json();
    if (!token || !initData) return json({ error: 'token va initData kerak' }, 400);

    const tgUser = await verifyInitData(initData, env.BOT_TOKEN);
    if (!tgUser) return json({ error: 'Telegram ma\'lumotlari tasdiqlanmadi' }, 401);

    // Taklifni topish
    const invites = await sbFetch(env, `/rest/v1/invites?token=eq.${token}&used=eq.false&select=*`);
    if (!invites.length) return json({ error: 'Taklif havolasi yaroqsiz yoki ishlatilgan' }, 404);
    const invite = invites[0];

    const fullName = [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' ') || ('Telegram ' + tgUser.id);
    let profile;
    let alreadyLoggedIn = false;

    if (access_token) {
      // Foydalanuvchi ilovaga allaqachon kirgan (o'z profili bor) — shu profilni ishlatamiz
      const userRes = await fetch(SB_URL + '/auth/v1/user', {
        headers: { apikey: SB_ANON_KEY, Authorization: 'Bearer ' + access_token }
      });
      if (!userRes.ok) return json({ error: 'Sessiya yaroqsiz' }, 401);
      const authUser = await userRes.json();
      const profiles = await sbFetch(env, `/rest/v1/profiles?id=eq.${authUser.id}&select=*`);
      profile = profiles[0] || { id: authUser.id };
      alreadyLoggedIn = true;
      // Telegram ma'lumotlarini (avatar, telegram_id) yangilab qo'yamiz, agar bo'sh bo'lsa
      try {
        await sbFetch(env, `/rest/v1/profiles?id=eq.${authUser.id}`, 'PATCH', {
          telegram_id: tgUser.id, avatar_url: tgUser.photo_url || profile.avatar_url || null
        });
      } catch (e) { /* telegram_id band bo'lsa e'tiborsiz qoldiramiz */ }
    } else {
      // Profilni topish (telegram_id bo'yicha) yoki yangi yaratish
      let profiles = await sbFetch(env, `/rest/v1/profiles?telegram_id=eq.${tgUser.id}&select=*`);
      if (profiles.length) {
        profile = profiles[0];
        await sbFetch(env, `/rest/v1/profiles?id=eq.${profile.id}`, 'PATCH', {
          full_name: fullName, avatar_url: tgUser.photo_url || profile.avatar_url
        });
      } else {
        const email = `tg${tgUser.id}@telegram.prorab.app`;
        const password = crypto.randomUUID();
        const authUsers = await sbFetch(env, '/auth/v1/admin/users', 'POST', {
          email, password, email_confirm: true,
          user_metadata: { full_name: fullName, telegram_id: tgUser.id }
        });
        const authUser = authUsers.user || authUsers;
        profile = {
          id: authUser.id, full_name: fullName, telegram_id: tgUser.id,
          avatar_url: tgUser.photo_url || null, email
        };
        await sbFetch(env, '/rest/v1/profiles', 'POST', profile);
      }
    }

    // Obyektga a'zo qilib qo'shish
    const existing = await sbFetch(env, `/rest/v1/ob_members?ob_id=eq.${invite.ob_id}&user_id=eq.${profile.id}&select=id`);
    if (!existing.length) {
      await sbFetch(env, '/rest/v1/ob_members', 'POST', {
        ob_id: invite.ob_id, user_id: profile.id, role: 'member', balance: 0,
        kasb: invite.kasb || null, added_by: invite.created_by
      });
    }

    // Taklifni ishlatilgan deb belgilash
    await sbFetch(env, `/rest/v1/invites?id=eq.${invite.id}`, 'PATCH', { used: true, used_by: profile.id });

    if (alreadyLoggedIn) {
      return json({ ok: true, already: true });
    }

    // Yangi profil uchun — sessiya o'rnatish uchun bir martalik kod (magic link OTP)
    const link = await sbFetch(env, '/auth/v1/admin/generate_link', 'POST', {
      type: 'magiclink', email: profile.email
    });

    return json({ ok: true, email: profile.email, email_otp: link.email_otp || link.properties?.email_otp });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}
