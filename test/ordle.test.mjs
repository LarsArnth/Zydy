// Ordles topliste på forsiden (public/ordle.js + public/ordle-regler.mjs):
// kassen under Ordle-kortet, stimen som forsiden selv tæller, og rekordholderen
// der dukker op som 🏆-mærkat på kortet.
//
// Kør:  PLAYWRIGHT=/Users/lars/Projekter/DungeonCrawler/node_modules/playwright/index.mjs node test/ordle.test.mjs
// (kræver at en lokal server kører: python3 -m http.server 4185 -d public)
import assert from 'node:assert/strict';
import { mockApi } from './api-mock.mjs';
const { chromium, devices } = await import(process.env.PLAYWRIGHT ?? 'playwright');
const BASE = process.env.BASE ?? 'http://localhost:4185';
const SHOTS = new URL('./shots/', import.meta.url).pathname;   // i den worktree testen køres fra

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 13'] });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

// Selma står på listen i forvejen med seks dage i træk.
const api = await mockApi(page, { scores: [{ spil: 'ordle', navn: 'Selma', score: 6 }] });

// Ordle bor på GitHub Pages. Her svarer vi selv, så trykket på kortet kan følges
// hele vejen — ud i spillet og tilbage igen med telefonens tilbage-knap.
// Ruterne er pr. side, så hver ny fane skal have den med.
const stubOrdle = p => p.route('https://larsarnth.github.io/ordle/**', route => route.fulfill({
  status: 200, contentType: 'text/html; charset=utf-8',
  body: '<!doctype html><meta charset="utf-8"><title>Ordle</title><h1>Ordle</h1>',
}));
await stubOrdle(page);

const kort = page.locator('li[data-spil="ordle"]');
const boks = kort.locator('.or-boks');
const mineScorer = navn => api.scores.filter(r => r.spil === 'ordle' && r.navn === navn);

/** I dag og i går, som forsiden selv regner dem ud (lokal tid). */
const datoer = () => page.evaluate(() => {
  const to = n => String(n).padStart(2, '0');
  const dag = d => d.getFullYear() + '-' + to(d.getMonth() + 1) + '-' + to(d.getDate());
  const nu = new Date();
  return { iDag: dag(nu), iGaar: dag(new Date(nu.getFullYear(), nu.getMonth(), nu.getDate() - 1)) };
});

// Navnet er skrevet i forvejen, som hos et barn der har været på siden før.
await page.addInitScript(() => localStorage.setItem('zydy.navn', 'Sofie'));
await page.goto(`${BASE}/`);
await page.waitForSelector('li[data-spil="ordle"]');
const { iGaar } = await datoer();

/* ---------- Uden at have spillet bliver man ikke spurgt ---------- */
await page.waitForTimeout(500);
assert.equal(await boks.isVisible(), false, 'kassen er tom, når man ikke har rørt Ordle');

/* ---------- Ud i Ordle og tilbage igen ---------- */
await kort.locator('a').click();
await page.waitForURL(/larsarnth\.github\.io/);
await page.goBack();
await page.waitForSelector('li[data-spil="ordle"] .or-boks .or-ja');

assert.match(await boks.locator('.or-tekst').textContent(), /Klarede du dagens Ordle\?/,
  'tilbage fra Ordle spørger kortet, hvordan det gik');
await kort.scrollIntoViewIfNeeded();
await kort.screenshot({ path: SHOTS + 'ordle-spoerger.png' });

/* ---------- «Ikke endnu» gemmer spørgsmålet, men rører ikke stimen ---------- */
await boks.locator('.or-nej').click();
await page.waitForTimeout(200);
assert.equal(await boks.isVisible(), false, '«Ikke endnu» lukker spørgsmålet');
assert.equal(mineScorer('Sofie').length, 0, 'et «ikke endnu» kommer ikke på listen');

await page.reload();
await page.waitForTimeout(500);
assert.equal(await boks.isVisible(), false, 'og det bliver ved med at være lukket resten af dagen');

/* ---------- «Ja!» lægger en dag til og sender stimen ind ---------- */
// Som om der stod tre dage i træk til og med i går: så spørger kassen af sig
// selv, uden at man har trykket på kortet i dag.
await page.evaluate(d => localStorage.setItem('zydy.ordle',
  JSON.stringify({ klaret: d, stime: 3, besoegt: '', udskudt: '', sendt: '' })), iGaar);
await page.reload();
await page.waitForSelector('li[data-spil="ordle"] .or-boks .or-ja');
assert.match(await boks.locator('.or-tekst').textContent(), /3 dage i træk/,
  'en stime i gang bliver husket på, selv om man ikke har trykket på kortet i dag');

await boks.locator('.or-ja').click();
await page.waitForSelector('li[data-spil="ordle"] .or-stime');
await page.waitForFunction(() => { const e = document.querySelector('.or-stime'); return e && !/gemmer/.test(e.textContent); });

const linje = await boks.locator('.or-stime').textContent();
assert.match(linje, /4 dage i træk/, 'dagen blev lagt til stimen');
assert.match(linje, /nr\. 2/, 'fire dage er ikke nok mod Selmas seks – men man er på listen');
assert.deepEqual(mineScorer('Sofie').map(r => r.score), [4], 'stimen står på toplisten');
await kort.screenshot({ path: SHOTS + 'ordle-stime.png' });

/* ---------- Rekordholderen står på kortet ---------- */
await page.evaluate(() => document.dispatchEvent(new CustomEvent('zydy:aktivitet')));
await page.waitForSelector('li[data-spil="ordle"] .m.top');
assert.equal(await kort.locator('.m.top').textContent(), '🏆 Selma · 6 dage',
  'kortet viser hvem der har rekorden — det var dét, der manglede');

/* ---------- Der spørges ikke igen samme dag, og stimen bliver stående ---------- */
await page.reload();
await page.waitForSelector('li[data-spil="ordle"] .or-stime');
assert.equal(await boks.locator('.or-stime').textContent(), '🔥 4 dage i træk');
assert.equal(await boks.locator('.or-ja').count(), 0, 'der spørges ikke igen, når man har svaret i dag');
assert.deepEqual(mineScorer('Sofie').map(r => r.score), [4], 'og den sendes ikke ind én gang til');

/* ---------- En stime, der ikke kom af sted, prøver igen ---------- */
// Som om telefonen var uden forbindelse, da der blev svaret ja: stimen står
// lokalt, men kvitteringen mangler.
await page.evaluate(d => localStorage.setItem('zydy.ordle',
  JSON.stringify({ klaret: d, stime: 9, besoegt: '', udskudt: '', sendt: '' })), (await datoer()).iDag);
await page.reload();
await page.waitForSelector('li[data-spil="ordle"] .or-stime');
for (let i = 0; i < 60 && (mineScorer('Sofie')[0] || {}).score !== 9; i++) await page.waitForTimeout(50);
assert.deepEqual(mineScorer('Sofie').map(r => r.score), [9],
  'stimen kommer på listen ved næste besøg — og står kun én gang');

/* ---------- Uden navn spørges der først om det ---------- */
{
  const ctx2 = await browser.newContext({ ...devices['iPhone 13'] });
  const p2 = await ctx2.newPage();
  const api2 = await mockApi(p2);
  await stubOrdle(p2);
  await p2.addInitScript(() => localStorage.setItem('zydy.navn.spurgt', '1'));   // gæsten sagde nej til navnet
  await p2.goto(`${BASE}/`);
  await p2.waitForSelector('li[data-spil="ordle"]');
  await p2.click('li[data-spil="ordle"] a');
  await p2.waitForURL(/larsarnth\.github\.io/);
  await p2.goBack();
  await p2.waitForSelector('li[data-spil="ordle"] .or-boks .or-ja');
  await p2.click('li[data-spil="ordle"] .or-ja');

  await p2.waitForSelector('.id-dlg[open]');
  assert.match(await p2.locator('.id-titel').textContent(), /Hvad hedder du/,
    'uden navn kan stimen ikke stå på listen, så der spørges først');
  await p2.fill('.id-input', 'Far');
  await p2.click('.id-send');
  await p2.waitForSelector('li[data-spil="ordle"] .or-stime');
  await p2.waitForFunction(() => { const e = document.querySelector('.or-stime'); return e && !/gemmer/.test(e.textContent); });
  assert.deepEqual(api2.scores.filter(r => r.spil === 'ordle').map(r => [r.navn, r.score]), [['Far', 1]],
    'og bagefter kommer den første dag på listen');
  await ctx2.close();
}

/* ---------- Ingen vandret scroll, ingen fejl ---------- */
assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'ingen vandret scroll');
assert.deepEqual(errors, [], 'ingen console-fejl');
await browser.close();
console.log('OK ordle');
