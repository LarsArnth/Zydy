// Venner på forsiden af zydy.dk (public/venner.js + src/venner.mjs): spørg en,
// sig ja, se hvem der er her lige nu, og fjern en ven igen.
//
// Kør:  PLAYWRIGHT=/Users/lars/Projekter/DungeonCrawler/node_modules/playwright/index.mjs node test/venner.test.mjs
// (kræver at en lokal server kører: python3 -m http.server 4185 -d public)
//
// Den anden part (Selma, Simon) spilles af testen selv: vi kalder venne-lageret
// i mocken direkte, ligesom forside-testen lader andre dukke op i aktiviteten.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { mockApi } from './api-mock.mjs';
const { chromium, devices } = await import(process.env.PLAYWRIGHT ?? 'playwright');
const BASE = process.env.BASE ?? 'http://localhost:4185';
const shots = path.join(path.dirname(fileURLToPath(import.meta.url)), 'shots');

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 13'] });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

// Selma og Simon er kendt af siden, fordi de står på toplisterne.
const api = await mockApi(page, {
  scores: [{ spil: 'taarn', navn: 'Selma', score: 42 }, { spil: 'dybet', navn: 'Simon', score: 5 }],
});

await page.goto(`${BASE}/`);

/* ---------- Uden navn kan man ikke have venner ---------- */
await page.waitForSelector('#venner .v-tom');
assert.match(await page.locator('#venner').textContent(), /Skriv dit navn/,
  'panelet forklarer, hvorfor der ikke er venner endnu');

// Navnet skrives i dialogen, siden selv åbner ved første besøg.
await page.waitForSelector('.id-dlg[open]');
await page.fill('.id-input', 'Sofie');
await page.click('.id-send');
await page.waitForSelector('#venner .v-kort:not(.v-tom)');
assert.match(await page.locator('#venner').textContent(), /Du har ingen venner her endnu/);

/* ---------- Find en ven og spørg ---------- */
await page.click('.v-find');
await page.waitForSelector('.v-forslag');
const forslag = await page.locator('.v-forslag-navn').allTextContents();
assert.deepEqual(forslag.slice().sort(), ['Selma', 'Simon'], 'dem vi har set på siden foreslås');
await page.screenshot({ path: path.join(shots, 'venner-find.png') });

await page.locator('.v-forslag-navn', { hasText: 'Selma' }).click();
await page.waitForSelector('.id-status:text-matches("Vi har spurgt Selma")');
assert.deepEqual(api.venner.rows.map(r => [r.fra, r.til, r.svaret]), [['sofie', 'selma', null]],
  'spørgsmålet er gemt, men der er ikke svaret endnu');
await page.click('.v-dlg .id-send');                       // "Luk"
await page.waitForSelector('.v-dlg[open]', { state: 'hidden' });
assert.match(await page.locator('#venner .v-venter').textContent(), /Venter på svar fra Selma/);

/* ---------- Selma siger ja ---------- */
await api.venner.sigJa('sofie', 'selma', 'Selma');
await page.evaluate(() => window.Venner.hent());
await page.waitForSelector('#venner .v-ven');
assert.equal(await page.locator('#venner .v-navn').textContent(), 'Selma');
assert.equal(await page.locator('#venner .v-hvor').textContent(), 'ikke her nu');
assert.equal(await page.locator('#venner .v-venter').count(), 0, 'der ventes ikke længere på svar');

/* ---------- … og dukker op i et spil ---------- */
await api.akt.markerAktiv('klientselma', 'obby', Date.now(), 'Selma');
await page.evaluate(() => document.dispatchEvent(new CustomEvent('zydy:aktivitet')));
await page.waitForSelector('#venner .v-ven.online');
assert.equal(await page.locator('#venner .v-hvor').textContent(), 'spiller Obby');
await page.screenshot({ path: path.join(shots, 'venner.png') });

await page.click('#venner .v-ven');
await page.waitForSelector('.v-dlg[open]');
assert.match(await page.locator('.v-dlg .id-under').textContent(), /Selma spiller Obby lige nu/);
assert.equal(await page.locator('.v-spil-med').getAttribute('href'), '/spil/obby/',
  'man kan hoppe med ind i det spil, vennen er i gang med');
await page.click('.v-dlg .id-send');                       // "Luk"
await page.waitForSelector('.v-dlg[open]', { state: 'hidden' });

/* ---------- Simon spørger, og Sofie siger ja ---------- */
await api.venner.spoerg('simon', 'sofie', 'Simon', 'Sofie');
await page.evaluate(() => window.Venner.hent());
await page.waitForSelector('#venner .v-spoerg');
assert.match(await page.locator('.v-spoerg-tekst').textContent(), /Simon vil være din ven/);
await page.screenshot({ path: path.join(shots, 'venner-spoergsmaal.png') });

await page.locator('.v-spoerg .v-vigtig').click();         // "Ja tak"
await page.waitForFunction(() => document.querySelectorAll('#venner .v-ven').length === 2);
assert.equal(await page.locator('#venner .v-spoerg').count(), 0, 'spørgsmålet er besvaret');
assert.ok(api.venner.rows.every(r => r.svaret), 'begge venskaber er nu sagt ja til');

/* ---------- Og en ven kan fjernes igen ---------- */
await page.locator('.v-ven', { hasText: 'Simon' }).click();
await page.waitForSelector('.v-dlg[open]');
await page.click('.v-dlg .id-fortryd');                    // "Fjern ven"
await page.waitForFunction(() => document.querySelectorAll('#venner .v-ven').length === 1);
assert.deepEqual(api.venner.rows.map(r => r.til), ['selma']);

/* ---------- En der ikke står på listen, kan skrives ind ---------- */
await page.click('.v-find');
await page.waitForSelector('.v-form');
await page.fill('.v-input', 'Far');
await page.click('.v-spoerg-knap');
await page.waitForSelector('.id-status:text-matches("Vi har spurgt Far")');
assert.ok(api.venner.rows.some(r => r.til === 'far' && !r.svaret), 'Far er spurgt');
await page.click('.v-dlg .id-send');                       // "Luk"
await page.waitForSelector('.v-dlg[open]', { state: 'hidden' });
assert.match(await page.locator('#venner .v-venter').textContent(), /Venter på svar fra Far/);

/* ---------- Navnet skiftes: så er det en andens venner ---------- */
await page.click('#navnKnap');
await page.waitForSelector('.id-dlg[open]:not(.v-dlg)');
await page.fill('.id-input', 'Simon');
await page.click('.id-dlg:not(.v-dlg) .id-send');
await page.waitForFunction(() => /ingen venner her endnu/.test(document.getElementById('venner').textContent),
  null, { timeout: 5000 });

/* ---------- Ingen vandret scroll, ingen fejl ---------- */
assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'ingen vandret scroll');
assert.deepEqual(errors, [], 'ingen console-fejl');
await browser.close();
console.log('OK venner');
