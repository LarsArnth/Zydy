// Grupper: et par venner skriver sammen alle på én gang på forsiden
// (public/grupper.js + src/grupper.mjs).
//
// Kør:  PLAYWRIGHT=/Users/lars/Projekter/DungeonCrawler/node_modules/playwright/index.mjs node test/grupper.test.mjs
// (kræver at en lokal server kører: python3 -m http.server 4185 -d public)
//
// Som test/beskeder.test.mjs har Sofie og Selma hver sit vindue med sit eget
// localStorage, men de deler API'et i hukommelsen (mockApi … { delMed }),
// præcis som de ville dele databasen i drift.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { mockApi } from './api-mock.mjs';
const { chromium, devices } = await import(process.env.PLAYWRIGHT ?? 'playwright');
const BASE = process.env.BASE ?? 'http://localhost:4185';
const shots = path.join(path.dirname(fileURLToPath(import.meta.url)), 'shots');

const browser = await chromium.launch();
const fejl = [];

/** Et vindue med et navn i localStorage – som når man har skrevet det på forsiden. */
async function telefon(navn, delMed) {
  const ctx = await browser.newContext({ ...devices['iPhone 13'] });
  const page = await ctx.newPage();
  page.on('pageerror', e => fejl.push(navn + ': ' + e));
  page.on('console', m => { if (m.type() === 'error') fejl.push(navn + ': ' + m.text()); });
  await page.addInitScript(n => { localStorage.setItem('zydy.navn', n); }, navn);
  const api = await mockApi(page, delMed ? { delMed } : {});
  return { page, api };
}

const sofie = await telefon('Sofie');
const selma = await telefon('Selma', sofie.api);
const api = sofie.api;

// De tre er venner i forvejen – det er venskabet, der giver lov til at tage nogen
// med ind i en gruppe.
for (const [a, b, A, B] of [['sofie', 'selma', 'Sofie', 'Selma'], ['sofie', 'far', 'Sofie', 'Far']]) {
  await api.venner.spoerg(a, b, A, B);
  await api.venner.sigJa(a, b, B);
}

/** Listen hentes hvert 15. sekund i drift – i testen beder vi selv om den. */
const kig = p => p.evaluate(() => window.Grupper.hent());

await sofie.page.goto(`${BASE}/`);
await selma.page.goto(`${BASE}/`);

/* ---------- Sofie laver en gruppe ---------- */
await sofie.page.waitForSelector('#grupper .g-ny-stor');
assert.match(await sofie.page.locator('#grupper .g-under').first().textContent(),
  /skriver sammen alle på én gang/, 'den tomme liste fortæller, hvad en gruppe er');
await sofie.page.click('#grupper .g-ny-stor');

await sofie.page.waitForSelector('.g-dlg[open] .g-input');
await sofie.page.fill('.g-dlg .g-input', 'Familien');
await sofie.page.click('.g-lav');

// Gruppen åbner sig selv, så man kan tage vennerne med med det samme.
await sofie.page.waitForSelector('.g-dlg[open] .g-medlemmer');
assert.equal(await sofie.page.locator('.g-dlg-titel').textContent(), '👥 Familien');
assert.deepEqual(await sofie.page.locator('.g-medlem-navn').allTextContents(), ['Dig']);
assert.equal(api.grupper.rows.length, 1);
const kode = api.grupper.rows[0].kode;

/* ---------- … og tager sine venner med ---------- */
// Vennerne står, som /api/venner giver dem: efter navn.
assert.deepEqual(await sofie.page.locator('.g-ven-navn').allTextContents(), ['＋ Far', '＋ Selma']);
await sofie.page.locator('.g-ven', { hasText: 'Selma' }).click();
await sofie.page.waitForSelector('.g-medlem-navn:text-is("Selma")');
await sofie.page.locator('.g-ven', { hasText: 'Far' }).click();
await sofie.page.waitForSelector('.g-medlem-navn:text-is("Far")');
assert.deepEqual(await sofie.page.locator('.g-medlem-navn').allTextContents(), ['Dig', 'Selma', 'Far']);
assert.equal(await sofie.page.locator('.g-venner').count(), 0, 'alle vennerne er med nu');
assert.deepEqual(api.grupper.medlemRows.map(m => m.navn), ['Sofie', 'Selma', 'Far']);

/* ---------- Sofie skriver til hele gruppen ---------- */
await sofie.page.fill('.g-skriv', 'Skal vi spille Obby i aften?');
await sofie.page.click('.g-send');
await sofie.page.waitForSelector('.g-dlg .b-besked.mig');
assert.equal(await sofie.page.locator('.g-dlg .b-tekst').textContent(), 'Skal vi spille Obby i aften?');
await sofie.page.screenshot({ path: path.join(shots, 'grupper.png') });

/* ---------- Selma ser gruppen og mærket på forsiden ---------- */
await kig(selma.page);
await selma.page.waitForSelector('#grupper .g-gruppe');
assert.equal(await selma.page.locator('#grupper .g-navn').textContent(), '👥 Familien');
assert.equal(await selma.page.locator('#grupper .g-under-linje').textContent(), 'Sofie: Skal vi spille Obby i aften?');
assert.equal(await selma.page.locator('#grupper .g-nyt').textContent(), '💬 1');
assert.equal(await selma.page.locator('#grupper .g-maerke').textContent(), '💬 1 ny');
await selma.page.screenshot({ path: path.join(shots, 'grupper-nyt.png') });

/* ---------- … åbner den, ser hvem der skrev, og svarer med ét tryk ---------- */
await selma.page.click('#grupper .g-gruppe');
await selma.page.waitForSelector('.g-dlg[open] .b-besked');
assert.equal(await selma.page.locator('.g-dlg .g-hvem').textContent(), 'Sofie',
  'i en gruppe skal man kunne se, hvem der skrev');
assert.equal(await selma.page.locator('.g-dlg .b-besked.mig').count(), 0);
assert.match(await selma.page.locator('.g-med').textContent(), /Sofie og Far er med i gruppen – og dig\./);
assert.equal(await selma.page.locator('.g-lavet-af').textContent(), 'Sofie lavede gruppen.');
assert.equal(await selma.page.locator('.g-omdoeb').count(), 0, 'kun Sofie kan give gruppen nyt navn');
assert.equal(await selma.page.locator('.g-ud').count(), 0, '… og kun Sofie kan tage nogen ud');

await selma.page.locator('.g-hurtig', { hasText: '👍' }).click();
await selma.page.waitForSelector('.g-dlg .b-besked.mig');
assert.deepEqual(await selma.page.locator('.g-dlg .b-tekst').allTextContents(),
  ['Skal vi spille Obby i aften?', '👍']);

// Læst: mærket forsvinder, og hvad hun har set, står kun på telefonen.
await selma.page.waitForFunction(() => document.querySelectorAll('#grupper .g-nyt').length === 0);
assert.deepEqual(await selma.page.evaluate(() => JSON.parse(localStorage.getItem('zydy.grupper.set'))),
  { selma: { [kode]: 2 } }, 'mærket er gemt under den, der læste – som beskederne');
await selma.page.click('.g-dlg .g-luk');
await selma.page.waitForSelector('.g-dlg[open]', { state: 'hidden' });

/* ---------- Svaret dukker op hos Sofie, mens hun har gruppen åben ---------- */
await sofie.page.waitForSelector('.g-dlg .b-besked:not(.mig)', { timeout: 15_000 });
assert.deepEqual(await sofie.page.locator('.g-dlg .b-tekst').allTextContents(),
  ['Skal vi spille Obby i aften?', '👍']);
assert.equal(await sofie.page.locator('.g-dlg .g-hvem').textContent(), 'Selma');

/* ---------- Sofie giver gruppen et nyt navn og tager Far ud ---------- */
await sofie.page.fill('.g-navn-input', 'Obby-holdet');
await sofie.page.click('.g-omdoeb-gem');
await sofie.page.waitForSelector('.g-dlg-titel:text-is("👥 Obby-holdet")');
assert.equal(api.grupper.rows[0].navn, 'Obby-holdet');

await sofie.page.locator('.g-medlem', { hasText: 'Far' }).locator('.g-ud').click();
await sofie.page.waitForFunction(() => document.querySelectorAll('.g-medlem').length === 2);
assert.deepEqual(api.grupper.medlemRows.map(m => m.navn), ['Sofie', 'Selma']);

/* ---------- Selma går ud – der skal trykkes to gange ---------- */
await kig(selma.page);
await selma.page.click('#grupper .g-gruppe');
await selma.page.waitForSelector('.g-dlg[open] .g-gaa');
await selma.page.click('.g-gaa');
assert.equal(await selma.page.locator('.g-gaa').textContent(), 'Helt sikker?');
assert.equal(api.grupper.medlemRows.length, 2, 'ingen er gået endnu');
await selma.page.click('.g-gaa');
await selma.page.waitForFunction(() => document.querySelectorAll('#grupper .g-gruppe').length === 0);
assert.deepEqual(api.grupper.medlemRows.map(m => m.navn), ['Sofie']);
assert.equal(api.beskeder.rows.length, 2, 'snakken står stadig hos Sofie');

/* ---------- Den sidste slukker lyset ---------- */
await sofie.page.click('.g-gaa');
await sofie.page.click('.g-gaa');
await sofie.page.waitForSelector('.g-dlg[open]', { state: 'hidden' });
await sofie.page.waitForSelector('#grupper .g-ny-stor');
assert.equal(api.grupper.rows.length, 0, 'gruppen er væk, da den sidste gik');
assert.equal(api.beskeder.rows.length, 0, 'og snakken fulgte med ud');

/* ---------- Ingen vandret scroll, ingen fejl ---------- */
for (const p of [sofie.page, selma.page]) {
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'ingen vandret scroll');
}
assert.deepEqual(fejl, [], 'ingen console-fejl');
await browser.close();
console.log('OK grupper');
