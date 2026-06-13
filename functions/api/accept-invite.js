import { json, sbFetch, verifyInitData } from '../_lib.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const { token, initData } = await request.json();
    if (!token || !initData) return json({ error: 'token va initData kerak' }, 400);

    const tgUser = await verifyInitData(initData, env.BOT_TOKEN);
    if (!tgUser) return json({ error: 'Telegram ma\'lumotlari tasdiqlanmadi' }, 401);

    // Taklifni topish
    const invites = await sbFetch(env, `/rest/v1/invites?token=eq.${token}&used=eq.false&select=*`);
    if (!invites.length) return json({ error: 'Taklif havolasi yaroqsiz yoki ishlatilgan' }, 404);
    const invite = invites[0];

    const fullName = [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' ') || ('Telegram ' + tgUser.id);

    // Profilni topish (telegram_id bo'yicha) yoki yaratish
    let profiles = await sbFetch(env, `/rest/v1/profiles?telegram_id=eq.${tgUser.id}&select=*`);
    let profile;
    if (profiles.length) {
      profile = profiles[0];
      // ism/avatar yangilanishi mumkin
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

    // Sessiya uchun bir martalik kod (magic link OTP)
    const link = await sbFetch(env, '/auth/v1/admin/generate_link', 'POST', {
      type: 'magiclink', email: profile.email
    });

    return json({ ok: true, email: profile.email, email_otp: link.email_otp || link.properties?.email_otp });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}
