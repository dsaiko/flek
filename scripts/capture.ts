/**
 * capture.ts — snímek úvodní obrazovky pro README a obrázek náhledu odkazu
 * (`make capture`)
 *
 * Obrázek v README musí jít kdykoli přegenerovat, jinak po první změně designu
 * ukazuje něco, co v aplikaci není. Scéna je proto deterministická: pevný seed
 * (`?seed=…`) a **pevná sada dekoračních karet** — ty se jinak losují přes
 * `Math.random` při každém příchodu na úvodní obrazovku, takže by se snímek
 * lišil běh od běhu a v gitu by vznikal šum.
 */

import { chromium } from 'playwright';
import { join } from 'node:path';
import sharp from 'sharp';

// anglicky: obrázek jde do anglického README
const url = process.argv[2] ?? 'http://127.0.0.1:8083/?seed=1993&lang=en';
/*
 * JPEG, ne PNG: půlku snímku tvoří fotografické skeny historických karet,
 * na kterých PNG vyrobí skoro megabajt. Obrázek se verzuje v repu, takže
 * kvalita 90 je dobrý kompromis mezi ostrostí textu a velikostí.
 */
const out = process.argv[3] ?? join('docs', 'screenshot-intro.jpg');

const browser = await chromium.launch();
const page = await browser.newPage({
  /*
   * 1×: GitHub README zobrazuje obrázek zhruba 900 px široko, takže 1354 px
   * je dost ostré. Vyšší DPI dělá ze skenů historických karet násobně větší
   * soubor a ten se verzuje — velikost je součást zadání.
   */
  viewport: { width: 1440, height: 1000 },
  deviceScaleFactor: 1,
});

// deterministické „náhodné" karty na úvodní obrazovce
await page.addInitScript({
  content: 'Math.random = (function () { let s = 42; return function () { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; }; })();',
});

await page.goto(url);
await page.waitForSelector('#intro-panel', { state: 'visible', timeout: 10000 });
// dekorační karty mají nástupní animaci (.55 s) — bez počkání se chytí rozmazané
await page.waitForTimeout(1200);

const frame = await page.locator('.table-frame').boundingBox();
if (frame === null) {
  console.error('CHYBA: rám stolu se nevykreslil, snímek by byl prázdný');
  await browser.close();
  process.exit(1);
}
await page.screenshot({ path: out, clip: frame, type: 'jpeg', quality: 90 });
console.log(`OK: úvodní obrazovka → ${out} (${Math.round(frame.width)}×${Math.round(frame.height)} px)`);

/*
 * Náhled odkazu (Open Graph, `public/og-image.jpg`): co ukáže WhatsApp,
 * Messenger nebo Slack, když někdo pošle adresu. 1200×630 je poměr 1,9 : 1 —
 * tvar úvodu na telefonu na šířku (§48: vlevo vějíř a titulek, vpravo varianty
 * a „Rozdat"). To rozložení platí jen do výšky 500 px, proto okno 960×500
 * s hustotou 1,25 (1200×625) a dorovnání na 1200×630 ořezem po stranách.
 * Česky: hru si budou posílat hlavně Češi a crawlery JavaScript nespouštějí,
 * takže náhled má jeden jazyk tak jako tak. Lišta s ikonami se schová —
 * v náhledu nejde na nic kliknout.
 */
const og = await browser.newPage({ viewport: { width: 960, height: 500 }, deviceScaleFactor: 1.25 });
await og.addInitScript({
  content: 'Math.random = (function () { let s = 42; return function () { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; }; })();',
});
const ogUrl = new URL(url);
ogUrl.searchParams.set('lang', 'cs');
await og.goto(ogUrl.toString());
await og.waitForSelector('#intro-panel', { state: 'visible', timeout: 10000 });
await og.addStyleTag({ content: '.game-controls { display: none !important; }' });
await og.waitForTimeout(1200);
const ogOut = process.argv[4] ?? join('public', 'og-image.jpg');
// telefonní rozložení opravdu naskočilo? (jinak by v náhledu byl desktopový rám s bílým okolím)
if (!(await og.evaluate(`matchMedia('(max-height: 500px) and (orientation: landscape)').matches`))) {
  console.error('CHYBA: náhled odkazu nevznikl v rozložení telefonu na šířku');
  await browser.close();
  process.exit(1);
}
const shot = await og.screenshot({ type: 'png' });
await sharp(shot).resize(1200, 630, { fit: 'cover' }).jpeg({ quality: 85, mozjpeg: true }).toFile(ogOut);
await browser.close();
console.log(`OK: náhled odkazu → ${ogOut} (1200×630 px)`);
