// Kør:  PLAYWRIGHT=/Users/lars/Projekter/DungeonCrawler/node_modules/playwright/index.mjs node test/topliste.test.mjs
// (kræver at en lokal server kører: python3 -m http.server <PORT> -d public)
//
// Den fælles topliste-klient (public/spil/highscore.js) efter Josephines ønske om,
// at alle navne kommer med på listen. Testen bruger Tårns «Topliste»-skærm, fordi
// den tegner listen med panel() uden score – men koden er den samme i alle spil.
import assert from 'node:assert/strict';
const { chromium, devices } = await import(process.env.PLAYWRIGHT ?? 'playwright');
import { mockApi } from './api-mock.mjs';
const BASE = process.env.BASE ?? 'http://localhost:4181';
const SHOTS = new URL('./shots/', import.meta.url).pathname;   // i den worktree testen køres fra

// 11 bedre spillere og Josephine nederst: hun er nr. 12 og skal kunne se sig selv.
const scores = Array.from({ length: 11 }, (_, i) => ({ spil: 'taarn', navn: 'Spiller ' + (i + 1), score: 200 - i }));
scores.push({ spil: 'taarn', navn: 'Josephine', score: 12 });

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 13'] });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

await mockApi(page, { scores });
await ctx.addInitScript(() => localStorage.setItem('zydy.navn', 'Josephine'));
await page.goto(`${BASE}/spil/taarn/?seed=1`);

/* ---------- Top 10 plus ens egen række nederst ---------- */
await page.getByRole('button', { name: 'Topliste' }).click();
await page.waitForSelector('#listScreen.on .hs-liste');
const liste = page.locator('#hsListe');
assert.equal(await liste.locator('.hs-raekke').count(), 11, 'de ti bedste plus ens egen række');
assert.equal(await liste.locator('.hs-spring').count(), 1, '«···» viser at der er noget imellem');
assert.equal(await liste.locator('.hs-raekke').nth(9).locator('.hs-navn').textContent(), 'Spiller 10');
const mig = liste.locator('.hs-mig');
assert.equal(await mig.count(), 1, 'kun ens egen række er fremhævet');
assert.equal(await mig.locator('.hs-navn').textContent(), 'Josephine');
assert.equal(await mig.locator('.hs-nr').textContent(), '12', 'med sin rigtige placering, ikke nr. 11');
assert.equal(await mig.locator('.hs-score').textContent(), '12');
// Egen række står nederst – efter nr. 10
const nederst = await liste.evaluate(rod => {
  const r = [...rod.querySelectorAll('.hs-raekke')];
  return r[r.length - 1].classList.contains('hs-mig');
});
assert.ok(nederst, 'ens egen række hænger nederst i listen');
await page.screenshot({ path: SHOTS + 'topliste-egen-raekke.png' });

/* ---------- «Vis alle 12» folder resten ud ---------- */
const flere = liste.locator('.hs-flere');
assert.equal(await flere.textContent(), 'Vis alle 12');
await flere.click();
assert.equal(await liste.locator('.hs-raekke').count(), 12, 'hele listen');
assert.equal(await liste.locator('.hs-spring').count(), 0, 'intet spring, når alt vises');
assert.equal(await liste.locator('.hs-mig .hs-nr').textContent(), '12');
assert.equal(await liste.locator('.hs-raekke').nth(10).locator('.hs-navn').textContent(), 'Spiller 11',
  'nr. 11 kom frem – den man ikke kunne se før');
assert.equal(await flere.textContent(), 'Vis kun de 10 bedste');

/* ---------- Listen ruller i sig selv – knapperne skubbes ikke ud af skærmen ---------- */
const plads = await page.evaluate(() => {
  const ol = document.querySelector('#hsListe .hs-liste');
  const tilbage = [...document.querySelectorAll('#listScreen button')].find(b => b.textContent.trim() === 'Tilbage');
  const skaerm = document.getElementById('listScreen').getBoundingClientRect();
  return {
    ruller: ol.scrollHeight > ol.clientHeight + 2,
    hoejde: ol.getBoundingClientRect().height,
    tilbageSynlig: tilbage.getBoundingClientRect().bottom <= skaerm.bottom + 1,
  };
});
assert.ok(plads.ruller, 'den lange liste ruller i stedet for at vokse');
assert.ok(plads.hoejde <= 0.45 * 844, 'listen fylder højst omkring 38 % af en iPhone-skærm');
assert.ok(plads.tilbageSynlig, '«Tilbage» kan stadig nås uden at rulle');

/* ---------- Tilbage til de ti bedste ---------- */
await flere.click();
assert.equal(await liste.locator('.hs-raekke').count(), 11);
assert.equal(await flere.textContent(), 'Vis alle 12');

/* ---------- Er man selv i top 10, er der hverken spring eller dobbelt række ---------- */
await page.evaluate(() => localStorage.setItem('zydy.navn', 'Spiller 3'));
await page.reload();
await page.getByRole('button', { name: 'Topliste' }).click();
await page.waitForSelector('#listScreen.on .hs-liste');
assert.equal(await liste.locator('.hs-raekke').count(), 10, 'kun de ti bedste');
assert.equal(await liste.locator('.hs-spring').count(), 0);
assert.equal(await liste.locator('.hs-mig .hs-navn').textContent(), 'Spiller 3');
assert.equal(await liste.locator('.hs-mig .hs-nr').textContent(), '3');

assert.deepEqual(errors, [], 'ingen fejl i konsollen');
await browser.close();
console.log('topliste: OK');
