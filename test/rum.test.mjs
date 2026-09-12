// Spil sammen: to venner joiner hinanden og spiller det samme parti Kryds og
// bolle på hver sin telefon (public/venner.js + public/spil/rum.js + src/rum.mjs).
//
// Kør:  PLAYWRIGHT=/Users/lars/Projekter/DungeonCrawler/node_modules/playwright/index.mjs node test/rum.test.mjs
// (kræver at en lokal server kører: python3 -m http.server 4185 -d public)
//
// Testen er den eneste med to browsere: Sofie og Selma har hver sit vindue med
// sit eget localStorage, men deler API'et i hukommelsen (mockApi … { delMed }),
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
async function spiller(navn, delMed) {
  const ctx = await browser.newContext({ ...devices['iPhone 13'] });
  const page = await ctx.newPage();
  page.on('pageerror', e => fejl.push(navn + ': ' + e));
  page.on('console', m => { if (m.type() === 'error') fejl.push(navn + ': ' + m.text()); });
  await page.addInitScript(n => { localStorage.setItem('zydy.navn', n); }, navn);
  const api = await mockApi(page, delMed ? { delMed } : {});
  return { page, api };
}

const sofie = await spiller('Sofie');
const selma = await spiller('Selma', sofie.api);
const api = sofie.api;

// De to er venner i forvejen – det er venskabet, der giver lov til at invitere.
await api.venner.spoerg('sofie', 'selma', 'Sofie', 'Selma');
await api.venner.sigJa('sofie', 'selma', 'Selma');

/** Venter på, at et felt på den *andens* skærm får det mærke, vi satte her. */
const vent = (p, i, v) => p.waitForFunction(
  ([i, v]) => window.GAME && GAME.state.braet[i] === v, [i, v], { timeout: 10_000 });

/* ---------- Sofie inviterer Selma ---------- */
await sofie.page.goto(`${BASE}/`);
await sofie.page.waitForSelector('#venner .v-ven');
await sofie.page.click('#venner .v-ven');
await sofie.page.waitForSelector('.v-dlg[open]');
assert.match(await sofie.page.locator('.v-sammen').textContent(), /Spil Kryds og bolle sammen/,
  'man kan invitere en ven til de spil, to kan spille sammen');
await sofie.page.screenshot({ path: path.join(shots, 'rum-inviter.png') });

await sofie.page.click('.v-sammen');
await sofie.page.waitForURL(/\/spil\/kryds\/\?rum=[A-Z0-9]{5}/, { timeout: 10_000 });
const kode = new URL(sofie.page.url()).searchParams.get('rum');
assert.equal(api.rum.rows.length, 1, 'der er lavet ét rum');
assert.equal(api.rum.rows[0].status, 'inviteret');

await sofie.page.waitForSelector('#vent.on');
assert.match(await sofie.page.locator('#ventTitel').textContent(), /Venter på Selma/,
  'værten venter, til vennen hopper med');
await sofie.page.screenshot({ path: path.join(shots, 'rum-venter.png') });

/* ---------- Selma ser invitationen på forsiden og hopper med ---------- */
await selma.page.goto(`${BASE}/`);
await selma.page.waitForSelector('#venner .v-rum', { timeout: 10_000 });
assert.match(await selma.page.locator('#venner .v-rum .v-spoerg-tekst').textContent(),
  /Sofie vil spille Kryds og bolle med dig/);
await selma.page.screenshot({ path: path.join(shots, 'rum-invitation.png') });

await selma.page.click('#venner .v-hopmed');
await selma.page.waitForURL(new RegExp('\\?rum=' + kode), { timeout: 10_000 });
await selma.page.waitForSelector('#spil.on', { timeout: 10_000 });
await sofie.page.waitForSelector('#spil.on', { timeout: 10_000 });   // værten opdager det selv
assert.equal(api.rum.rows[0].status, 'igang');
assert.match(await sofie.page.locator('#spilPill').textContent(), /Mod Selma/);
assert.match(await selma.page.locator('#spilPill').textContent(), /Mod Sofie/);

/* ---------- Kun den, det er tur til, kan trække ---------- */
assert.match(await sofie.page.locator('#status').textContent(), /Din tur/, 'værten er kryds og begynder');
assert.match(await selma.page.locator('#status').textContent(), /Sofies tur/);
assert.equal(await selma.page.evaluate(() => GAME.traek(8)), false, 'man kan ikke trække uden for tur');

/* ---------- Et helt parti på tværs af de to telefoner ---------- */
await sofie.page.click('.felt[data-i="0"]');                 // x
await vent(selma.page, 0, 'x');
assert.match(await selma.page.locator('#status').textContent(), /Din tur/, 'turen er hoppet med over');

await selma.page.click('.felt[data-i="4"]');                 // o
await vent(sofie.page, 4, 'o');
await sofie.page.click('.felt[data-i="1"]');                 // x
await vent(selma.page, 1, 'x');
await selma.page.click('.felt[data-i="5"]');                 // o
await vent(sofie.page, 5, 'o');
await sofie.page.click('.felt[data-i="2"]');                 // x vinder 0-1-2

await selma.page.waitForFunction(() => GAME.state.faerdig, null, { timeout: 10_000 });
assert.match(await sofie.page.locator('#status').textContent(), /Du vandt/);
assert.match(await selma.page.locator('#status').textContent(), /Sofie vandt/);
assert.match(await sofie.page.locator('#spilStilling').textContent(), /Dig 1/);
assert.match(await selma.page.locator('#spilStilling').textContent(), /Sofie 1/);
assert.equal(await selma.page.evaluate(() => GAME.state.stilling.x), 1, 'stillingen tælles kun én gang');
await sofie.page.waitForTimeout(500);
await sofie.page.screenshot({ path: path.join(shots, 'rum-spil.png') });

/* ---------- Nyt parti deles også ---------- */
await sofie.page.click('#igenBtn');
await vent(selma.page, 0, '');
assert.equal(await selma.page.evaluate(() => GAME.state.starter), 'o', 'nu begynder Selma');
assert.match(await selma.page.locator('#status').textContent(), /Din tur/);

/* ---------- Går den ene, får den anden besked ---------- */
await selma.page.click('#menuBtn');                          // "Slut spillet"
await selma.page.waitForURL(url => !url.search.includes('rum='), { timeout: 10_000 });
await sofie.page.waitForSelector('#vent.on', { timeout: 10_000 });
assert.match(await sofie.page.locator('#ventTitel').textContent(), /Selma gik/);

/* ---------- Ingen vandret scroll, ingen fejl ---------- */
for (const p of [sofie.page, selma.page]) {
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'ingen vandret scroll');
}
assert.deepEqual(fejl, [], 'ingen console-fejl');
await browser.close();
console.log('OK rum (spil sammen)');
