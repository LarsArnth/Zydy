// Kør:  PLAYWRIGHT=/Users/lars/Projekter/DungeonCrawler/node_modules/playwright/index.mjs node test/weee.test.mjs
// (kræver at en lokal server kører: python3 -m http.server 4191 -d public)
//
// Kører «Weeee!» igennem: startskærm → en rigtig finger på skærmen → fingeren
// nede klæber kælken til sneen, fingeren oppe sender den i luften → en hel tur
// med botten → lavinen tager en → slutskærm og topliste.
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

// Tom topliste, så en hvilken som helst afstand kvalificerer
const sendte = [];
const api = await mockApi(page);
await page.route('**/api/highscore/**', async route => {
  const req = route.request();
  if (req.method() === 'POST') {
    const krop = req.postDataJSON(); sendte.push(krop);
    return route.fulfill({ json: { ok: true, id: 1, token: 'abc', placering: 1, liste: [{ id: 1, navn: krop.navn, score: krop.score, oprettet: '2026-09-13T12:00:00.000Z' }] } });
  }
  return route.fulfill({ json: { spil: 'weee', retning: 'desc', min: 1, maks: 20000, unik: true, liste: [] } });
});

await page.goto(`${BASE}/spil/weee/?seed=7`);
await page.waitForFunction(() => !!window.GAME);
const state = () => page.evaluate(() => window.GAME.state);
const nyTur = () => page.evaluate(() => window.GAME.start());

/* ---------- Startskærmen ---------- */
assert.equal(await page.locator('#startScreen.on').isVisible(), true, 'startskærmen vises');
assert.equal((await state()).seed, 7, '?seed styrer bjerget');
assert.equal((await state()).fase, 'menu');
await page.waitForFunction(() => document.querySelector('#hsListe .hs-titel'), null, { timeout: 4000 });
assert.match(await page.locator('#hsListe').textContent(), /Topliste/, 'toplisten står på startskærmen');
assert.match(await page.locator('.lavet').textContent(), /Selma/, 'der står hvem der fandt på spillet');

// Spil-knappen skal kunne nås uden at rulle (reglerne står derfor under den)
{
  const plads = await page.evaluate(() => {
    const b = document.getElementById('startBtn').getBoundingClientRect();
    return { bund: b.bottom, skærm: innerHeight };
  });
  assert.ok(plads.bund <= plads.skærm, `Spil-knappen ligger uden for skærmen (${plads.bund} > ${plads.skærm})`);
}
await page.screenshot({ path: SHOTS + 'weee-start.png' });

// Navnet skrives på startskærmen (som i Obby), så rekorden kan sendes af sig selv
await page.click('#nameBtn');
await page.fill('#nameInput', 'Selma');
await page.click('#nameForm button[type=submit]');
assert.equal(await page.evaluate(() => localStorage.getItem('zydy.navn')), 'Selma', 'navnet huskes til de andre spil');

/* ---------- En rigtig finger på skærmen ---------- */
await page.click('#startBtn');
assert.equal((await state()).fase, 'spil');
assert.equal(await page.locator('#startScreen.on').count(), 0, 'startskærmen er væk');
{
  const boks = await page.locator('#c').boundingBox();
  await page.mouse.move(boks.x + boks.width / 2, boks.y + boks.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(500);
  const nede = await state();
  assert.equal(nede.holder, true, 'fingeren på skærmen holder kælken nede');
  assert.equal(nede.paa, true, 'og så klæber den til sneen');
  assert.ok(nede.fart > 10, 'farten tager til ned ad bjerget');
  await page.mouse.up();
  await page.waitForTimeout(60);
  assert.equal((await state()).holder, false, 'slipper man, slipper kælken også');
}

/* ---------- Fingeren nede = ingen hop. Fingeren oppe = i luften ---------- */
{
  await nyTur();
  const fast = await page.evaluate(() => window.GAME.frem(10, true));
  assert.equal(fast.paa, true, 'holder man hele vejen, kommer man aldrig i luften');
  assert.equal(fast.hop, 0);
  assert.ok(fast.fart > 20, `farten blev kun ${fast.fart.toFixed(1)} m/s`);

  await nyTur();
  const fri = await page.evaluate(() => window.GAME.frem(10, false));
  assert.ok(fri.hop > 0, 'slipper man, letter man på kanterne');
  assert.ok(fri.længsteLuft > 0.2, 'og man er rigtigt i luften');
}

/* ---------- Skærmen siger, hvad fingeren skal ---------- */
{
  await nyTur();
  await page.waitForFunction(() => {
    window.GAME.frem(0.03, false);
    return /SLIP/.test(document.getElementById('styr').textContent);
  }, null, { timeout: 6000 });
  assert.equal(await page.locator('#styr.slip').count(), 1, 'beskeden lyser gult, når man kan lette');
  assert.equal((await state()).kanLette, true, 'og det passer med bakken under kælken');
  await page.screenshot({ path: SHOTS + 'weee.png' });
}

/* ---------- Lavinen hænger i hælene og tager en til sidst ---------- */
{
  await nyTur();
  const halvvejs = await page.evaluate(() => window.GAME.frem(12));
  assert.ok(halvvejs.afstand > 0, 'lavinen er stadig bagude');
  assert.ok(halvvejs.afstand <= 70.001, 'men den sakker aldrig helt bagud');

  const slut = await page.evaluate(() => window.GAME.botTur());
  assert.equal(slut.doed, true, 'til sidst tager lavinen en');
  assert.equal(slut.fase, 'doed');
  assert.ok(slut.meter > 400, `botten nåede kun ${slut.meter} m`);
  assert.ok(slut.hop >= 5, `en god tur skal have hop i sig (${slut.hop})`);

  assert.equal(await page.locator('#slutScreen.on').isVisible(), true, 'slutskærmen kommer frem');
  assert.match(await page.locator('#slutMeter').textContent(), new RegExp(`^${slut.meter} m$`), 'meterne står stort');
  assert.match(await page.locator('#slutSub').textContent(), /hop · længste flyvetur/, 'og hvor længe man fløj');
  assert.equal(await page.locator('#nyRekord').isVisible(), true, 'første tur er altid en ny rekord');
  assert.equal(await page.evaluate(() => localStorage.getItem('zydy.weee.best')), String(slut.meter), 'rekorden huskes');

  await page.waitForFunction(() => /Selma/.test(document.getElementById('hsSlut').textContent), null, { timeout: 4000 });
  assert.ok(sendte.some(x => x.navn === 'Selma' && x.score === slut.meter), 'rekorden sendes selv til toplisten');
  assert.ok(sendte.every(x => Number.isInteger(x.score) && x.score > 0), 'og det er altid et rigtigt tal, der sendes');
  await page.screenshot({ path: SHOTS + 'weee-slut.png' });
}

/* ---------- Kør igen og menu ---------- */
{
  await page.click('#igenBtn');
  const st = await state();
  assert.equal(st.fase, 'spil', 'man kører videre med det samme');
  assert.equal(st.meter, 0, 'forfra oppe på bjerget');
  assert.equal(st.doed, false);
  assert.equal(await page.locator('#slutScreen.on').count(), 0, 'slutskærmen er væk');

  await page.evaluate(() => window.GAME.tilMenu());
  assert.equal(await page.locator('#startScreen.on').isVisible(), true, 'og man kan komme tilbage til menuen');
  assert.ok(Number(await page.locator('#rekordVal').textContent()) > 400, 'hvor rekorden står');
}

/* ---------- Aktivitet meldt til forsiden ---------- */
assert.ok(api.log.aktivitet.some(a => a.spil === 'weee' && a.ny === true), 'spillet melder én start');

/* ---------- Passer på en iPad på tværs ---------- */
{
  const pad = await browser.newContext({ ...devices['iPad (gen 7) landscape'] });
  const p2 = await pad.newPage();
  const padFejl = [];
  p2.on('pageerror', e => padFejl.push(String(e)));
  await mockApi(p2);
  await p2.goto(`${BASE}/spil/weee/?seed=7`);
  await p2.waitForFunction(() => !!window.GAME);
  await p2.click('#startBtn');
  const st = await p2.evaluate(() => window.GAME.frem(6));
  assert.equal(st.fase, 'spil', 'turen kører også på en iPad');
  assert.ok(st.meter > 50, 'og kælken kommer af sted');
  assert.ok(await p2.evaluate(() => {
    const r = document.getElementById('c').getBoundingClientRect();
    return r.width > 600 && r.height > 200;
  }), 'fladen fylder skærmen');
  assert.ok(await p2.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'ingen vandret scroll på iPad');
  await p2.screenshot({ path: SHOTS + 'weee-ipad.png' });
  assert.deepEqual(padFejl, [], 'ingen fejl på iPad');
  await pad.close();
}

/* ---------- Ingen vandret scroll, ingen fejl ---------- */
assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'ingen vandret scroll');
assert.deepEqual(errors, [], 'ingen console-fejl');
await browser.close();
console.log('OK weee');
