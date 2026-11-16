// Orqaga qaytganda ro'yxatning o'sha joyiga tushish (tepasiga sakrab ketmasin)
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = '/home/user/Prorab/heating-orders/public';
const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.css':'text/css', '.png':'image/png', '.webp':'image/webp', '.ttf':'font/ttf' };
const DIR = 'shots-scroll'; fs.mkdirSync(DIR, { recursive: true });

let otdi = 0, yiqildi = 0;
const ok = (n, c) => { if (c) { otdi++; console.log('✓ ' + n); } else { yiqildi++; console.log('✗ ' + n); } };

const uuid = n => `${String(n).padStart(8,'0')}-1111-1111-1111-111111111111`;
const PRODUCTS = Array.from({ length: 60 }, (_, i) => ({
  id: uuid(i+1), artikul: 'T'+(i+1), nomi: `Truba PP ${String(i+1).padStart(3,'0')} mm`,
  narx: 10+i, birlik:'dona', kategoriya:'KANALIZATSIYA', kichik_kategoriya:'OSTENDORF HTEM',
  faol:true, ommabop:false, rasm:null
}));

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname.startsWith('/assets/tovar-tur/')) { res.writeHead(404); return res.end(); }
  if (u.pathname.startsWith('/api/')) {
    for await (const c of req) {}
    res.writeHead(200, {'Content-Type':'application/json'});
    if (u.pathname === '/api/auth') return res.end(JSON.stringify({
      profile:{telegram_id:555, ism:'Test', til:'uz'},
      brigade:{id:'b1', nomi:'Test', login:'usta', chat_id:1}, objects:[] }));
    return res.end(JSON.stringify(['/api/notifications','/api/orders','/api/objects','/api/addresses'].includes(u.pathname) ? [] : {ok:true}));
  }
  const f = path.join(ROOT, u.pathname === '/' ? 'index.html' : u.pathname);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('404'); }
  res.writeHead(200, {'Content-Type': MIME[path.extname(f)] || 'application/octet-stream'});
  res.end(fs.readFileSync(f));
});
await new Promise(r => server.listen(8815, '127.0.0.1', r));

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome' });
const ctx = await browser.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2, isMobile:true, hasTouch:true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

await page.route('https://telegram.org/**', r => r.fulfill({ contentType:'text/javascript', body:`window.Telegram={WebApp:{initData:'x',initDataUnsafe:{user:{id:555,first_name:'Test'}},safeAreaInset:{top:0},contentSafeAreaInset:{top:0},ready(){},expand(){},requestFullscreen(){},disableVerticalSwipes(){},onEvent(){},close(){},setBackgroundColor(){},setHeaderColor(){},setBottomBarColor(){},HapticFeedback:{impactOccurred(){},notificationOccurred(){},selectionChanged(){}}}};` }));
await page.route('https://cdn.jsdelivr.net/**', r => r.fulfill({ contentType:'text/javascript', body:`
window.supabase = { createClient(){ return { from(jadval){
  const jadvallar = { hs_products: ${JSON.stringify(PRODUCTS)},
    hs_categories: [{nomi:'KANALIZATSIYA',ota:null,tartib:10,faol:true,rasm:null},
                    {nomi:'OSTENDORF HTEM',ota:'KANALIZATSIYA',tartib:10,faol:true,rasm:null}] };
  const c = { select(){return c}, eq(){return c}, order(){return c}, range(){return c},
    then(f){ return Promise.resolve({ data: jadvallar[jadval] || [], error:null }).then(f); } };
  return c;
} }; } };` }));
await page.route('https://fonts.googleapis.com/**', r => r.fulfill({ contentType:'text/css', body:'' }));
await page.route('https://fonts.gstatic.com/**', r => r.abort());

await page.goto('http://127.0.0.1:8815/', { waitUntil:'domcontentloaded' });
await page.waitForSelector('.navtab', { timeout: 12000 });
await page.waitForTimeout(500);

// KANALIZATSIYA -> OSTENDORF HTEM -> Truba (60 ta tovar)
await page.click('text=KANALIZATSIYA'); await page.waitForTimeout(400);
await page.click('.brand-row:has-text("OSTENDORF HTEM")'); await page.waitForTimeout(400);
const turBor = await page.$('.brand-row:has-text("Truba")');
if (turBor) { await turBor.click(); await page.waitForTimeout(400); }
ok('uzun ro‘yxat ochildi', (await page.$$('.pcard')).length > 20);

// pastga tushamiz
await page.evaluate(() => window.scrollTo(0, 2000));
await page.waitForTimeout(300);
const oldin = await page.evaluate(() => Math.round(window.scrollY));
ok(`ro‘yxatda pastga tushildi (${oldin}px)`, oldin > 1000);
await page.screenshot({ path: `${DIR}/1-pastda.png` });

// tovar ochamiz
const korinadigan = await page.evaluate(() => {
  const k = [...document.querySelectorAll('.pcard')].find(e => e.getBoundingClientRect().top > 100);
  return k ? k.querySelector('.name').textContent.trim() : '';
});
await page.click(`.pcard:has-text("${korinadigan}")`);
await page.waitForTimeout(500);
ok('tovar ekrani ochildi', await page.isVisible('.pd-photo'));
ok('tovar ekrani tepadan boshlandi', (await page.evaluate(() => Math.round(window.scrollY))) < 50);
await page.screenshot({ path: `${DIR}/2-tovar.png` });

// orqaga
await page.click('.plist-head .back');
await page.waitForTimeout(600);
const keyin = await page.evaluate(() => Math.round(window.scrollY));
await page.screenshot({ path: `${DIR}/3-qaytdi.png` });
ok(`orqaga qaytganda o‘sha joyda (${oldin} -> ${keyin})`, Math.abs(keyin - oldin) < 60);
ok('ro‘yxat o‘zi joyida', (await page.$$('.pcard')).length > 20);

// yana ichkariga kirib, bu safar surish bilan qaytamiz
await page.evaluate(() => window.scrollTo(0, 1200));
await page.waitForTimeout(250);
const oldin2 = await page.evaluate(() => Math.round(window.scrollY));
const k2 = await page.evaluate(() => {
  const k = [...document.querySelectorAll('.pcard')].find(e => e.getBoundingClientRect().top > 100);
  return k ? k.querySelector('.name').textContent.trim() : '';
});
await page.click(`.pcard:has-text("${k2}")`);
await page.waitForTimeout(400);
const cdp = await ctx.newCDPSession(page);
const y = 400;
await cdp.send('Input.dispatchTouchEvent', { type:'touchStart', touchPoints:[{x:8, y}] });
for (const x of [60, 140, 240, 330]) {
  await cdp.send('Input.dispatchTouchEvent', { type:'touchMove', touchPoints:[{x, y}] });
  await page.waitForTimeout(40);
}
await cdp.send('Input.dispatchTouchEvent', { type:'touchEnd', touchPoints:[] });
await page.waitForTimeout(800);
const keyin2 = await page.evaluate(() => Math.round(window.scrollY));
ok(`surib qaytganda ham o‘sha joyda (${oldin2} -> ${keyin2})`, Math.abs(keyin2 - oldin2) < 60);

// pastki menyudan bo'lim almashtirilsa — tepadan boshlansin
await page.click('.navtab[data-tab="profile"]');
await page.waitForTimeout(400);
ok('bo‘lim almashganda tepadan', (await page.evaluate(() => Math.round(window.scrollY))) < 50);

console.log(`\no'tdi=${otdi} yiqildi=${yiqildi}`);
console.log('ERRORS:', errors.join('\n') || "(yo'q)");
await browser.close(); server.close();
