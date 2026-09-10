import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { json, sbFetch, requireUser } from '../_lib.js';

// Buyurtmani A4 PDF (nakladnoy) ko'rinishida yasab, foydalanuvchining
// shaxsiy Telegram chatiga hujjat sifatida yuboradi. Brauzer print()
// Telegram WebView'ida ko'p hollarda ishlamagani uchun shu yo'l tanlandi.
//
// DejaVu Sans o'zbekcha (oʻ, gʻ) va ruscha (kirill) belgilarni ham qamrab
// oladi, shuning uchun ikkala interfeys tili uchun ham xavfsiz.

const LABELS = {
  uz: {
    nakladnoy: 'Nakladnoy №', sana: 'Sana', obyekt: 'Obyekt', buyurtmachi: 'Buyurtmachi',
    artikul: 'Artikul', nomi: 'Nomi', narx: 'Narx', son: 'Son', summa: 'Summa', jami: 'Jami', currency: "so'm",
    status: { yangi: 'Yangi', jarayonda: 'Jarayonda', yetkazilgan: 'Yetkazilgan', bekor_qilingan: 'Bekor qilingan' }
  },
  ru: {
    nakladnoy: 'Накладная №', sana: 'Дата', obyekt: 'Объект', buyurtmachi: 'Заказчик',
    artikul: 'Артикул', nomi: 'Наименование', narx: 'Цена', son: 'Кол-во', summa: 'Сумма', jami: 'Итого', currency: 'сум',
    status: { yangi: 'Новый', jarayonda: 'В процессе', yetkazilgan: 'Доставлен', bekor_qilingan: 'Отменён' }
  }
};

function fmtNum(n) { return Math.round(n || 0).toLocaleString('ru-RU'); }
function fmtDate(s) {
  if (!s) return '—';
  const d = new Date(s);
  return d.toLocaleDateString('ru-RU') + ' ' + d.toTimeString().slice(0, 5);
}

async function fetchAsset(request, env, path) {
  // Pages Functions'ning o'z static fayllariga (fontlar, logo) murojaat qilish
  // uchun ASSETS binding ishlatiladi — tashqi internetga chiqmasdan, to'g'ridan-to'g'ri
  // shu deploymentning statik fayllaridan o'qiydi.
  const res = await env.ASSETS.fetch(new URL(path, request.url));
  if (!res.ok) throw new Error(`Asset topilmadi: ${path}`);
  return res.arrayBuffer();
}

export async function onRequestGet({ request, env }) {
  try {
    const user = await requireUser(request, env);
    if (!user) return json({ error: 'Foydalanuvchini tasdiqlab bo‘lmadi' }, 401);

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return json({ error: 'id kerak' }, 400);

    const [orderRows, userRows] = await Promise.all([
      sbFetch(env, `/rest/v1/hs_orders?id=eq.${encodeURIComponent(id)}&select=*,hs_objects(nomi,manzil)`),
      sbFetch(env, `/rest/v1/hs_users?telegram_id=eq.${user.id}&select=til,brigade_id`)
    ]);
    const order = orderRows && orderRows[0];
    if (!order) return json({ error: 'Buyurtma topilmadi' }, 404);
    const callerBrigadeId = userRows && userRows[0] && userRows[0].brigade_id;
    if (!callerBrigadeId || callerBrigadeId !== order.brigade_id) return json({ error: 'Buyurtma topilmadi' }, 404);

    const lang = (userRows && userRows[0] && userRows[0].til === 'ru') ? 'ru' : 'uz';
    const L = LABELS[lang];
    const objNomi = order.hs_objects ? order.hs_objects.nomi : '—';
    const items = order.items || [];

    const [regularBytes, boldBytes, logoBytes] = await Promise.all([
      fetchAsset(request, env, '/assets/fonts/DejaVuSans.ttf'),
      fetchAsset(request, env, '/assets/fonts/DejaVuSans-Bold.ttf'),
      fetchAsset(request, env, '/assets/logo.png').catch(() => null)
    ]);

    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(fontkit);
    const font = await pdfDoc.embedFont(regularBytes, { subset: true });
    const fontBold = await pdfDoc.embedFont(boldBytes, { subset: true });
    let logoImg = null, logoDims = null;
    if (logoBytes) {
      try { logoImg = await pdfDoc.embedPng(logoBytes); logoDims = logoImg.scale(90 / logoImg.width); } catch (e) {}
    }

    const M = 40;
    const PAGE_W = 595.28, PAGE_H = 841.89;
    const COLS = { art: M, nomi: M + 65, narx: M + 265, son: M + 355, summa: M + 415 };
    const COL_END = PAGE_W - M;
    const gray = rgb(0.42, 0.46, 0.44);
    const border = rgb(0.85, 0.87, 0.85);
    const ink = rgb(0.06, 0.08, 0.06);

    let page, y;
    function newPage() {
      page = pdfDoc.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - M;
    }
    function text(str, x, size, opts = {}) {
      page.drawText(String(str), { x, y, size, font: opts.bold ? fontBold : font, color: opts.color || ink });
    }
    function line() {
      page.drawLine({ start: { x: M, y }, end: { x: COL_END, y }, thickness: 0.7, color: border });
    }
    function tableHead() {
      const hy = y;
      page.drawText(L.artikul, { x: COLS.art, y: hy, size: 8, font: fontBold, color: gray });
      page.drawText(L.nomi, { x: COLS.nomi, y: hy, size: 8, font: fontBold, color: gray });
      page.drawText(L.narx, { x: COLS.narx, y: hy, size: 8, font: fontBold, color: gray });
      page.drawText(L.son, { x: COLS.son, y: hy, size: 8, font: fontBold, color: gray });
      page.drawText(L.summa, { x: COLS.summa, y: hy, size: 8, font: fontBold, color: gray });
      y -= 8; line(); y -= 14;
    }

    newPage();
    if (logoImg && logoDims) {
      page.drawImage(logoImg, { x: M, y: y - logoDims.height, width: logoDims.width, height: logoDims.height });
      y -= logoDims.height + 18;
    }
    text(`${L.nakladnoy} ${order.order_no}`, M, 15, { bold: true });
    y -= 16;
    text(fmtDate(order.created_at), M, 9.5, { color: gray });
    const statusStr = (L.status[order.status] || order.status || '').toUpperCase();
    page.drawText(statusStr, { x: COL_END - fontBold.widthOfTextAtSize(statusStr, 9), y: y + 16, size: 9, font: fontBold, color: gray });
    y -= 14; line(); y -= 18;

    text(`${L.obyekt}: `, M, 9.5, { color: gray });
    text(objNomi, M + fontBold.widthOfTextAtSize(`${L.obyekt}: `, 9.5), 9.5, { bold: true });
    y -= 14;
    text(`${L.buyurtmachi}: `, M, 9.5, { color: gray });
    text(order.telegram_name || '', M + fontBold.widthOfTextAtSize(`${L.buyurtmachi}: `, 9.5), 9.5, { bold: true });
    y -= 20;

    tableHead();
    for (const it of items) {
      if (y < 70) { newPage(); tableHead(); }
      text(it.artikul || '', COLS.art, 8.5);
      const nomiMax = 26;
      const nomiTxt = (it.nomi || '').length > nomiMax ? it.nomi.slice(0, nomiMax - 1) + '…' : (it.nomi || '');
      text(nomiTxt, COLS.nomi, 8.5);
      text(fmtNum(it.narx), COLS.narx, 8.5);
      text(`${it.miqdor} ${it.birlik || ''}`, COLS.son, 8.5);
      text(fmtNum(it.summa), COLS.summa, 8.5, { bold: true });
      y -= 10;
      page.drawLine({ start: { x: M, y }, end: { x: COL_END, y }, thickness: 0.5, color: border });
      y -= 12;
    }

    if (y < 60) newPage();
    y -= 6;
    text(L.jami, COLS.narx, 12, { bold: true });
    text(`${fmtNum(order.total)} ${L.currency}`, COLS.summa, 12, { bold: true });

    const pdfBytes = await pdfDoc.save();

    const fd = new FormData();
    fd.append('chat_id', String(user.id));
    fd.append('document', new Blob([pdfBytes], { type: 'application/pdf' }), `${order.order_no}.pdf`);
    fd.append('caption', `📄 ${order.order_no}`);

    const tgRes = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendDocument`, { method: 'POST', body: fd });
    const tgData = await tgRes.json();
    if (!tgData.ok) {
      return json({ error: 'Telegramga yuborishda xatolik: ' + (tgData.description || 'noma’lum xato') }, 502);
    }

    return json({ ok: true });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}
