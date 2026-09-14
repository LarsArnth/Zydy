// Kør:  PLAYWRIGHT=/sti/til/playwright/index.mjs node test/klaverregn.test.mjs
// (kræver at en lokal server kører: python3 -m http.server 4191 -d public)
//
// Kører «Klaverregn» igennem: startskærm → en rigtig finger rammer fliserne og
// spiller Mester Jakobs første noder → en forkert bane koster et hjerte →
// botten spiller en hel sang færdig → fliserne får lov at falde forbi, til
// hjerterne slipper op → slutskærm og topliste.
// API'erne kører i hukommelsen (test/api-mock.mjs).
import assert from 'node:assert/strict';
import { mockApi } from './api-mock.mjs';
const { chromium, devices } = await import(process.env.PLAYWRIGHT ?? 'playwright');
const BASE = process.env.BASE ?? 'http://localhost:4191';
const SHOTS = new URL('./shots/', import.meta.url).pathname;

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 13'] });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

// Tom topliste, så en hvilken som helst score kvalificerer
const sendte = [];
await mockApi(page);
await page.route('**/api/highscore/**', async route => {
  const req = route.request();
  if (req.method() === 'POST') {
    const krop = req.postDataJSON(); sendte.push(krop);
    return route.fulfill({ json: { ok: true, id: 1, token: 'abc', placering: 1, liste: [{ id: 1, navn: krop.navn, score: krop.score, oprettet: '2026-09-14T12:00:00.000Z' }] } });
  }
  return route.fulfill({ json: { spil: 'klaverregn', retning: 'desc', min: 1, maks: 5000, unik: true, liste: [] } });
});

await page.goto(`${BASE}/spil/klaverregn/`);
await page.waitForFunction(() => !!window.GAME);
const state = () => page.evaluate(() => window.GAME.state);

/* ---------- Startskærmen ---------- */
assert.equal(await page.locator('#startScreen.on').isVisible(), true, 'startskærmen vises');
assert.equal((await state()).fase, 'menu');
await page.waitForFunction(() => document.querySelector('#hsListe .hs-titel'), null, { timeout: 4000 });
assert.match(await page.locator('#hsListe').textContent(), /Topliste/, 'toplisten står på startskærmen');
assert.match(await page.locator('.lavet').textContent(), /Liva/, 'der står hvem der fandt på spillet');

// Spil-knappen skal kunne nås uden at rulle (reglerne står derfor under den)
{
  const plads = await page.evaluate(() => {
    const b = document.getElementById('startBtn').getBoundingClientRect();
    return { bund: b.bottom, skærm: innerHeight };
  });
  assert.ok(plads.bund <= plads.skærm, `Spil-knappen ligger uden for skærmen (${plads.bund} > ${plads.skærm})`);
}
await page.screenshot({ path: SHOTS + 'klaverregn-start.png' });

// Navnet skrives på startskærmen (som i Obby), så rekorden kan sendes af sig selv
await page.click('#nameBtn');
await page.fill('#nameInput', 'Liva');
await page.click('#nameForm button[type=submit]');
assert.equal(await page.evaluate(() => localStorage.getItem('zydy.navn')), 'Liva', 'navnet huskes til de andre spil');

/* ---------- En rigtig finger rammer fliserne ---------- */
await page.click('#startBtn');
assert.equal((await state()).fase, 'spil');
assert.equal(await page.locator('#startScreen.on').count(), 0, 'startskærmen er væk');
assert.equal((await state()).sang, 'Mester Jakob', 'den første sang er Mester Jakob');
assert.match(await page.locator('#sangEl').textContent(), /Mester Jakob/, 'sangens navn står på skærmen');

// Tryk på de tre første fliser med en rigtig finger: klik i flisens bane.
// Banen følger tonehøjden, så Mester Jakobs do-re-mi skal vandre mod højre.
const boks = await page.locator('#c').boundingBox();
const baner = [];
for (let i = 0; i < 3; i++) {
  // Vent til flisen er kommet et stykke ned, så et menneske også kunne se den
  await page.waitForFunction(() => { const f = window.GAME.naeste(); return f && f.y > 15; });
  const f = await page.evaluate(() => window.GAME.naeste());
  baner.push(f.bane);
  await page.mouse.click(boks.x + (f.bane + 0.5) * boks.width / 4, boks.y + boks.height * 0.5);
  assert.equal((await state()).score, i + 1, `flise ${i + 1} blev ramt`);
}
// (C og D deler bane i Mester Jakob – banerne må aldrig gå mod venstre, når melodien går op)
assert.ok(baner[1] >= baner[0] && baner[2] > baner[0], `do-re-mi skal vandre mod højre (${baner.join(',')})`);
assert.equal((await state()).liv, 3, 'rigtige tryk koster ikke hjerter');

// En forkert bane koster et hjerte – og flisen bliver stående
{
  const f = await page.evaluate(() => window.GAME.naeste());
  const gal = (f.bane + 2) % 4;
  await page.mouse.click(boks.x + (gal + 0.5) * boks.width / 4, boks.y + boks.height * 0.5);
  const s = await state();
  assert.equal(s.liv, 2, 'en forkert bane koster et hjerte');
  assert.equal(s.score, 3, 'men scoren rører den ikke');
  assert.equal(s.naeste.midi, f.midi, 'melodien hopper ikke et hak ved en fejl');
}
await page.screenshot({ path: SHOTS + 'klaverregn-spil.png' });

/* ---------- Botten spiller en hel sang færdig ---------- */
{
  const s = await page.evaluate(() => window.GAME.frem(120, undefined));
  assert.equal(s.fase, 'spil', 'botten spiller fejlfrit');
  assert.ok(s.sange >= 1, 'mindst én hel sang på to minutter');
  assert.notEqual(s.sang, 'Mester Jakob', 'den næste sang er i gang');
  assert.ok(s.fart > 30, `farten er vokset (${s.fart})`);
  assert.ok(s.score > 30, `og scoren med (${s.score})`);
}

/* ---------- Rører man ikke skærmen, slipper hjerterne op ---------- */
{
  const s = await page.evaluate(() => window.GAME.frem(90, false));
  assert.equal(s.faerdig, true, 'to mistede fliser mere, og spillet er slut');
  assert.equal(s.liv, 0);
  assert.equal(s.fase, 'doed');
}
await page.waitForSelector('#slutScreen.on');
const slutScore = (await state()).score;
assert.match(await page.locator('#slutScore').textContent(), new RegExp(`${slutScore}\\s*noder`), 'slutskærmen viser noderne');
assert.match(await page.locator('#slutSub').textContent(), /sang/, 'og hvor mange sange man nåede');

// Rekorden er sendt af sig selv med navnet fra startskærmen
await page.waitForFunction(() => document.querySelector('#hsSlut .hs-titel'), null, { timeout: 4000 });
assert.equal(sendte.length, 1, 'én score blev sendt ind');
assert.equal(sendte[0].navn, 'Liva');
assert.equal(sendte[0].score, slutScore);
await page.screenshot({ path: SHOTS + 'klaverregn-slut.png' });

/* ---------- Spil igen-knappen ---------- */
await page.click('#igenBtn');
{
  const s = await state();
  assert.equal(s.fase, 'spil');
  assert.equal(s.score, 0);
  assert.equal(s.liv, 3);
  assert.equal(s.sang, 'Mester Jakob', 'man begynder forfra på den første sang');
}

assert.deepEqual(errors, [], 'ingen fejl i konsollen');
await browser.close();
console.log('klaverregn.test.mjs: alt godt');
