// Kør:  PLAYWRIGHT=/sti/til/playwright/index.mjs node test/pjat.test.mjs
// (kræver at en lokal server kører, se test/run.mjs)
//
// Spiller «Pjattemaskinen» igennem: startskærm → et rigtigt træk med fingeren
// (rullerne snurrer og lander på en pjattet sætning) → albummet vokser og
// scoren ryger selv på toplisten → hele albummet fyldes med fest → og spillet
// huskes efter en genindlæsning. API'erne kører i hukommelsen (test/api-mock.mjs).
import assert from 'node:assert/strict';
import { mockApi } from './api-mock.mjs';
const { chromium, devices } = await import(process.env.PLAYWRIGHT ?? 'playwright');
const BASE = process.env.BASE ?? 'http://localhost:4180';
const SHOTS = new URL('./shots/', import.meta.url).pathname;

const browser = await chromium.launch();
const fejl = [];
const ctx = await browser.newContext({ ...devices['iPhone 13'] });
const page = await ctx.newPage();
page.on('pageerror', e => fejl.push(String(e)));
page.on('console', m => { if (m.type() === 'error') fejl.push(m.text()); });
await page.addInitScript(() => { localStorage.setItem('zydy.navn', 'Alia'); });
const api = await mockApi(page);

await page.goto(`${BASE}/spil/pjat/?seed=7`);
await page.waitForFunction(() => !!window.GAME);
const state = () => page.evaluate(() => window.GAME.state);
const ANTAL = await page.evaluate(() => window.GAME.ANTAL);

/** Venter på, at api'et (i Node) ser noget bestemt – fetch'en tager et øjeblik. */
async function venPaa(hvad, tekst) {
  for (let i = 0; i < 100 && !hvad(); i++) await page.waitForTimeout(100);
  assert.ok(hvad(), tekst);
}

/* ---------- Startskærmen ---------- */
assert.equal(await page.locator('#startScreen.on').isVisible(), true, 'startskærmen vises');
assert.equal(await page.locator('#startBtn').textContent(), 'Pjat løs!');
assert.equal(await page.inputValue('#navnFelt'), 'Alia', 'navnet fra forsiden står der i forvejen');
assert.match(await page.locator('.regler').textContent(), new RegExp('alle ' + ANTAL), 'reglerne nævner antallet');
{
  // Pjat-knappen skal kunne nås uden at rulle
  const plads = await page.evaluate(() => {
    const b = document.getElementById('startBtn').getBoundingClientRect();
    return { bund: b.bottom, skaerm: innerHeight };
  });
  assert.ok(plads.bund <= plads.skaerm, `Pjat-knappen ligger uden for skærmen (${plads.bund} > ${plads.skaerm})`);
}
await page.screenshot({ path: SHOTS + 'pjat-start.png' });

/* ---------- Et rigtigt træk med fingeren: rullerne snurrer og lander ---------- */
await page.click('#startBtn');
assert.equal(await page.locator('#spilSkaerm.on').isVisible(), true);
assert.equal(await page.locator('#albumBtn').textContent(), `📖 0/${ANTAL}`);
await page.click('#pjatBtn');
await page.waitForFunction(() => document.getElementById('bobleTekst').textContent.length > 0, null, { timeout: 5000 });
{
  const tekst = await page.locator('#bobleTekst').textContent();
  assert.match(tekst, /^(Den|Det) .+!$/, 'sætningen er rigtig dansk: ' + tekst);
  const s = await state();
  assert.equal(s.drej, 1, 'ét træk talt');
  assert.equal(s.album.length, 1, 'den første figur er i albummet');
  assert.equal(await page.locator('#nyBadge').isVisible(), true, 'NY FIGUR!-mærket vises');
  assert.equal(await page.locator('#albumBtn').textContent(), `📖 1/${ANTAL}`);
  assert.match(await page.locator('#drejTal').textContent(), /1 træk/, 'tælleren under knappen følger med');
  // Rullerne viser det samme som sætningen – og GAME.sidste er selve trækket.
  const sidsteSaetning = await page.evaluate(() => window.GAME.saetning(window.GAME.sidste));
  assert.equal(sidsteSaetning, tekst, 'boblen og trækket er enige');
}
await page.screenshot({ path: SHOTS + 'pjat-traek.png' });

/* ---------- Læs højt-knappen må ikke vælte noget ---------- */
if (await page.locator('#lydBtn').isVisible()) await page.click('#lydBtn');

/* ---------- Flere træk: albummet vokser, og scoren sendes af sig selv ---------- */
await page.evaluate(() => { for (let i = 0; i < 10; i++) window.GAME.spin(); });
{
  const s = await state();
  assert.equal(s.drej, 11, 'ti hurtige træk mere');
  assert.ok(s.album.length >= 2 && s.album.length <= 11, `albummet vokser (${s.album.length})`);
  assert.equal(await page.locator('#albumBtn').textContent(), `📖 ${s.album.length}/${ANTAL}`);
}
await venPaa(() => api.scores.some(r => r.spil === 'pjat'), 'scoren kom på toplisten af sig selv');
{
  const raekker = api.scores.filter(r => r.spil === 'pjat');
  assert.equal(raekker.length, 1, 'ét navn står kun én gang');
  assert.equal(raekker[0].navn, 'Alia');
  const s = await state();
  await venPaa(() => api.scores.find(r => r.spil === 'pjat').score === s.album.length,
    'scoren er antallet af figurer i albummet');
}

/* ---------- Albummet: fundne figurer og «???» ---------- */
await page.click('#albumBtn');
assert.equal(await page.locator('#albumSkaerm.on').isVisible(), true);
{
  const s = await state();
  assert.equal(await page.locator('.figKort').count(), ANTAL, 'én plads pr. figur');
  assert.equal(await page.locator('.figKort:not(.mangler)').count(), s.album.length, 'de fundne står fremme');
  assert.equal((await page.locator('.figKort.mangler .fe').first().textContent()), '❔', 'de ukendte er «❔»');
}
await page.screenshot({ path: SHOTS + 'pjat-album.png' });
await page.click('#albumTilbage');
assert.equal(await page.locator('#spilSkaerm.on').isVisible(), true);

/* ---------- Hele albummet fyldes – tørke-reglen lover, at det kan lade sig gøre ---------- */
await page.evaluate(() => {
  let vagt = window.GAME.ANTAL * (window.GAME.TOERKE_MAKS + 1) + 5;
  while (window.GAME.state.album.length < window.GAME.ANTAL && vagt-- > 0) window.GAME.spin();
});
{
  const s = await state();
  assert.equal(s.album.length, ANTAL, 'alle figurer er mødt');
}
await page.waitForSelector('#fest', { state: 'visible', timeout: 5000 });
assert.match(await page.locator('#fest h2').textContent(), /MØDT DEM ALLE/);
await page.screenshot({ path: SHOTS + 'pjat-fest.png' });
await page.click('#festLuk');
assert.equal(await page.locator('#fest').isVisible(), false, 'festen kan lukkes, og man pjatter videre');
await venPaa(() => api.scores.find(r => r.spil === 'pjat').score === ANTAL, 'rekorden fulgte med op');

/* ---------- Spillet huskes, og rekordlinjen står på startskærmen ---------- */
await page.goto(`${BASE}/spil/pjat/?seed=7`);
await page.waitForFunction(() => !!window.GAME);
assert.equal((await state()).album.length, ANTAL, 'albummet er gemt');
assert.match(await page.locator('#startBtn').textContent(), new RegExp(`Videre · ${ANTAL}/${ANTAL}`),
  'man fortsætter, hvor man slap');
assert.equal(await page.locator('#nulstilBtn').isVisible(), true, 'og kan starte forfra');
await page.waitForSelector('#rekordLinje:not([hidden])', { timeout: 5000 });
assert.match(await page.locator('#rekordLinje').textContent(),
  new RegExp(`Du har rekorden · ${ANTAL} af ${ANTAL} figurer`));
await page.click('#rekordLinje');
assert.equal(await page.locator('#listeSkaerm.on').isVisible(), true, 'linjen folder toplisten ud');
assert.match(await page.locator('#hsListe').textContent(), /Alia/);
await page.click('#tilbageBtn');
assert.equal(await page.locator('#startScreen.on').isVisible(), true);

/* ---------- Festen holdes kun én gang ---------- */
await page.click('#startBtn');
await page.evaluate(() => window.GAME.spin());
await page.waitForTimeout(200);
assert.equal(await page.locator('#fest').isVisible(), false, 'et fuldt album fejres ikke igen');

/* ---------- Aktivitet, skærmen og ro i konsollen ---------- */
assert.ok(api.log.aktivitet.some(a => a.spil === 'pjat' && a.ny === true), 'spillet melder én start');
assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'ingen vandret scroll');
assert.deepEqual(fejl, [], 'ingen console-fejl');
await browser.close();
console.log('OK pjat');
