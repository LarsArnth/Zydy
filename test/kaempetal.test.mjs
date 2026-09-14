// Kør:  PLAYWRIGHT=/Users/lars/Projekter/DungeonCrawler/node_modules/playwright/index.mjs node test/kaempetal.test.mjs
// (kræver at en lokal server kører: python3 -m http.server 4180 -d public)
//
// Spiller «Kæmpetal» igennem: startskærm → klik på tallet → køb en hjælper →
// produktionen tæller selv → milepæl ryger på toplisten → det største tal nås
// med fest. Og så mødet med vennen (Selmas ønske): Sofie inviterer Selma, de
// tæller på hver sin telefon, ser hinandens tal – og når loftet SAMMEN.
// API'erne kører i hukommelsen (test/api-mock.mjs).
import assert from 'node:assert/strict';
import { mockApi } from './api-mock.mjs';
const { chromium, devices } = await import(process.env.PLAYWRIGHT ?? 'playwright');
const BASE = process.env.BASE ?? 'http://localhost:4180';
const SHOTS = new URL('./shots/', import.meta.url).pathname;
const MAKS = 9999999999999;

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
  return { page, ctx, api };
}

/* ================== Alene: klik, butik, milepæl og loftet ================== */
const milas = await spiller('Milas');
const page = milas.page, api = milas.api;

await page.goto(`${BASE}/spil/kaempetal/`);
await page.waitForFunction(() => !!window.GAME);
const state = () => page.evaluate(() => window.GAME.state);

/* ---------- Startskærmen ---------- */
assert.equal(await page.locator('#startScreen.on').isVisible(), true, 'startskærmen vises');
assert.equal(await page.locator('#startBtn').textContent(), 'Tæl!');
assert.equal(await page.inputValue('#navnFelt'), 'Milas', 'navnet fra forsiden står der i forvejen');
{
  // Tæl-knappen skal kunne nås uden at rulle
  const plads = await page.evaluate(() => {
    const b = document.getElementById('startBtn').getBoundingClientRect();
    return { bund: b.bottom, skaerm: innerHeight };
  });
  assert.ok(plads.bund <= plads.skaerm, `Tæl-knappen ligger uden for skærmen (${plads.bund} > ${plads.skaerm})`);
}
await page.screenshot({ path: SHOTS + 'kaempetal-start.png' });

/* ---------- Klik på tallet med en rigtig finger ---------- */
await page.click('#startBtn');
assert.equal(await page.locator('#spilSkaerm.on').isVisible(), true);
await page.evaluate(() => window.GAME.pause());   // ellers tæller musen med i de præcise tal nedenfor
for (let i = 0; i < 5; i++) await page.click('#talKnap');
assert.equal((await state()).point, 5, 'fem tryk giver fem point');
assert.equal(await page.locator('#talVis').textContent(), '5');
assert.match(await page.locator('#maalTekst').textContent(), /1\.000/, 'næste mål er det første tusind');

/* ---------- Butikken: køb en klikkemus ---------- */
await page.evaluate(() => window.GAME.saetOp({ point: 200, ialt: 200 }));
assert.equal(await page.locator('.vare[data-id="mus"]').isEnabled(), true, 'der er råd til musen');
assert.equal(await page.locator('.vare[data-id="hund"] .navn').textContent(), '???',
  'den næste hjælper er stadig hemmelig');
assert.equal(await page.locator('.vare.laast').count(), 1, 'og kun én «???» lokker');
assert.equal(await page.locator('.vare[data-id="robot"]').isVisible(), false, 'resten er helt skjult');
await page.click('.vare[data-id="mus"]');
{
  const s = await state();
  assert.equal(s.antal.mus, 1, 'musen er købt');
  assert.equal(s.point, 185, 'og betalt af banken');
  assert.equal(s.ialt, 200, 'uden at røre det samlede tal');
}
await page.screenshot({ path: SHOTS + 'kaempetal-butik.png' });

/* ---------- Produktionen tæller selv ---------- */
await page.evaluate(() => window.GAME.frem(10));
{
  const s = await state();
  assert.equal(s.point, 195, 'musen har tjent 10 på 10 sekunder');
  assert.equal(s.ialt, 210);
}
assert.match(await page.locator('#sekLinje').textContent(), /\+1 i sekundet/);

/* ---------- En milepæl sender scoren på toplisten af sig selv ---------- */
/** Venter på, at api'et (i Node) ser noget bestemt – fetch'en tager et øjeblik. */
async function venPaa(hvad, tekst) {
  for (let i = 0; i < 100 && !hvad(); i++) await page.waitForTimeout(100);
  assert.ok(hvad(), tekst);
}
assert.equal(api.scores.filter(r => r.spil === 'kaempetal').length, 0, 'endnu ingen række');
await page.evaluate(() => window.GAME.saetOp({ point: 5000, ialt: 5000 }));
await venPaa(() => api.scores.some(r => r.spil === 'kaempetal'), 'milepælen kom på listen');
{
  const raekker = api.scores.filter(r => r.spil === 'kaempetal');
  assert.equal(raekker.length, 1, 'milepælen 1.000 blev rundet: én række');
  assert.equal(raekker[0].navn, 'Milas');
  assert.equal(raekker[0].score, 5000, 'scoren er tallet, ikke milepælen');
}

/* ---------- Det største tal: loftet og festen ---------- */
await page.evaluate(m => window.GAME.saetOp({ point: m - 2, ialt: m - 2 }), MAKS);
await page.click('#talKnap');
await page.click('#talKnap');
await page.waitForSelector('#fest', { state: 'visible', timeout: 5000 });
{
  const s = await state();
  assert.equal(s.ialt, MAKS, 'tallet står præcis på 9.999.999.999.999');
  assert.equal(s.point, MAKS, 'og kommer ikke over');
  assert.equal(s.fejret, true);
}
assert.equal(await page.locator('#talVis').textContent(), '9.999.999.999.999');
assert.match(await page.locator('#maalTekst').textContent(), /DET STØRSTE TAL/);
await page.screenshot({ path: SHOTS + 'kaempetal-fest.png' });
await page.click('#festLuk');
assert.equal(await page.locator('#fest').isVisible(), false, 'festen kan lukkes, og man tæller videre');
await venPaa(() => api.scores.find(r => r.spil === 'kaempetal').score === MAKS, 'rekorden fulgte med op');

/* ---------- Spillet huskes, og rekordlinjen står på startskærmen ---------- */
await page.goto(`${BASE}/spil/kaempetal/`);
await page.waitForFunction(() => !!window.GAME);
assert.match(await page.locator('#startBtn').textContent(), /Videre · 9\.999\.999\.999\.999/, 'man fortsætter, hvor man slap');
assert.equal(await page.locator('#nulstilBtn').isVisible(), true, 'og kan starte forfra');
await page.waitForSelector('#rekordLinje:not([hidden])', { timeout: 5000 });
assert.match(await page.locator('#rekordLinje').textContent(), /Du har rekorden · 9\.999\.999\.999\.999/);
await page.click('#rekordLinje');
assert.equal(await page.locator('#listeSkaerm.on').isVisible(), true, 'linjen folder toplisten ud');
assert.match(await page.locator('#hsListe').textContent(), /Milas/);
await page.click('#tilbageBtn');
assert.equal(await page.locator('#startScreen.on').isVisible(), true);

/* ---------- Aktivitet meldt til forsiden ---------- */
assert.ok(api.log.aktivitet.some(a => a.spil === 'kaempetal' && a.ny === true), 'spillet melder én start');
assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'ingen vandret scroll');
await milas.ctx.close();

/* ================== Sammen: mød en ven og nå loftet SAMMEN ================== */
const sofie = await spiller('Sofie', api);
const selma = await spiller('Selma', api);

// De to er venner i forvejen – det er venskabet, der giver lov til at invitere.
await api.venner.spoerg('sofie', 'selma', 'Sofie', 'Selma');
await api.venner.sigJa('sofie', 'selma', 'Selma');

const pille = p => p.locator('#sammenPille').textContent();
const venterPaaPille = (p, re) => p.waitForFunction(m => {
  const e = document.getElementById('sammenPille');
  return !!e && !e.hidden && new RegExp(m).test(e.textContent);
}, re.source, { timeout: 15_000 });

/* ---------- Sofie inviterer Selma fra forsiden ---------- */
await sofie.page.goto(`${BASE}/`);
await sofie.page.waitForSelector('#venner .v-ven');
await sofie.page.click('#venner .v-ven');
await sofie.page.waitForSelector('.v-dlg[open]');
const sammenKnap = sofie.page.locator('.v-sammen', { hasText: 'Kæmpetal' });
assert.equal(await sammenKnap.count(), 1, 'Kæmpetal kan spilles sammen');
await sammenKnap.click();
await sofie.page.waitForURL(/\/spil\/kaempetal\/\?rum=[A-Z0-9]{5}/, { timeout: 10_000 });
const kode = new URL(sofie.page.url()).searchParams.get('rum');
assert.equal(api.rum.rows.length, 1, 'der er lavet ét rum');
assert.equal(api.rum.rows[0].status, 'inviteret');

// Værten sendes direkte ind og må gerne tælle, mens invitationen venter.
await sofie.page.waitForSelector('#spilSkaerm.on', { timeout: 10_000 });
await venterPaaPille(sofie.page, /Venter på Selma/);
for (let i = 0; i < 3; i++) await sofie.page.click('#talKnap');
assert.equal(await sofie.page.evaluate(() => window.GAME.state.point), 3);

/* ---------- Selma ser invitationen og hopper med ---------- */
await selma.page.goto(`${BASE}/`);
await selma.page.waitForSelector('#venner .v-rum', { timeout: 10_000 });
assert.match(await selma.page.locator('#venner .v-rum .v-spoerg-tekst').textContent(),
  /Sofie vil spille Kæmpetal med dig/);
await selma.page.click('#venner .v-hopmed');
await selma.page.waitForURL(new RegExp('\\?rum=' + kode), { timeout: 10_000 });
await selma.page.waitForSelector('#spilSkaerm.on', { timeout: 10_000 });

/* ---------- De ser hinandens tal ---------- */
// Sofies tre klik fra før når frem, når hendes halvdel skrives op (hvert 3. sekund).
await venterPaaPille(selma.page, /Sofie: 3/);
await selma.page.click('#talKnap');
await selma.page.click('#talKnap');
await venterPaaPille(selma.page, /I har 5 sammen/);
await venterPaaPille(sofie.page, /Selma: 2/);
await venterPaaPille(sofie.page, /I har 5 sammen/);
await sofie.page.screenshot({ path: SHOTS + 'kaempetal-sammen.png' });

/* ---------- Loftet nås SAMMEN: Sofies tal + Selmas tal = MAKS ---------- */
await sofie.page.evaluate(m => window.GAME.saetOp({ point: m - 2, ialt: m - 2 }), MAKS);
await sofie.page.waitForSelector('#fest', { state: 'visible', timeout: 10_000 });
assert.match(await sofie.page.locator('#festTekst').textContent(), /sammen, dig og Selma/i,
  'Sofie fejrer, at de nåede det sammen');
assert.ok((await sofie.page.evaluate(() => window.GAME.state.ialt)) < MAKS,
  'Sofie er ikke selv ved loftet – det er summen, der er');
await selma.page.waitForSelector('#fest', { state: 'visible', timeout: 10_000 });
assert.match(await selma.page.locator('#festTekst').textContent(), /sammen, dig og Sofie/i);
await selma.page.screenshot({ path: SHOTS + 'kaempetal-sammen-fest.png' });

/* ---------- Går den ene, får den anden besked ---------- */
await selma.page.click('#festLuk');
await selma.page.click('#hjemBtn');
await selma.page.waitForURL(url => !url.search.includes('rum='), { timeout: 10_000 });
await sofie.page.click('#festLuk');
await venterPaaPille(sofie.page, /Selma gik/);

/* ---------- Ingen vandret scroll, ingen fejl ---------- */
for (const p of [sofie.page, selma.page]) {
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'ingen vandret scroll');
}
assert.deepEqual(fejl, [], 'ingen console-fejl');
await browser.close();
console.log('OK kaempetal');
