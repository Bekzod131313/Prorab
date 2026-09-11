// Barcha /api/* so'rovlari uchun umumiy xatolik ushlagich.
//
// Ilgari endpoint ichida tashlangan xato ushlanmasdan qolib, mijozga faqat
// bo'sh "500" ketardi — sababini bilib bo'lmasdi. Endi xatoning haqiqiy
// matni JSON bo'lib qaytadi va mini-app uni ekranda ko'rsatadi.

// Supabase/PostgREST xatolarini odam tushunadigan tilga o'giramiz.
function odamchaXato(matn) {
  const m = String(matn || '');

  // Migratsiya bajarilmagan: jadvalda yangi ustun yo'q
  if (/schema cache|does not exist|could not find the/i.test(m)) {
    return `Baza yangilanmagan: ${m}. Supabase SQL Editor'da schema.sql'ning oxirgi qismini ishga tushiring.`;
  }
  // chat_id hali NOT NULL: `alter table hs_brigades alter column chat_id drop not null;` bajarilmagan
  if (/null value in column "chat_id"/i.test(m)) {
    return 'Baza yangilanmagan: hs_brigades.chat_id hali majburiy. Supabase SQL Editor\'da schema.sql\'ning oxirgi qismini ishga tushiring.';
  }
  if (/duplicate key|unique constraint/i.test(m)) {
    return 'Bunday yozuv allaqachon bor (login yoki guruh band).';
  }
  return m || 'Server xatosi';
}

export async function onRequest(context) {
  try {
    return await context.next();
  } catch (e) {
    const matn = odamchaXato(e && e.message);
    return new Response(JSON.stringify({ error: matn }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}
