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

// Sangnavnet må ikke ligge hen over hjerterne (det gjorde det engang)
{
  const [sang, liv] = await page.evaluate(() => [
    document.getElementById('sangEl').getBoundingClientRect().toJSON(),
    document.getElementById('hjerter').getBoundingClientRect().toJSON(),
  ]);
  const overlapper = sang.left < liv.right && liv.left < sang.right && sang.top < liv.bottom && liv.top < sang.bottom;
  assert.equal(overlapper, false, 'sangens navn ligger hen over hjerterne');
}

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

/* ---------- Dit eget klaver (Livas ønske «På ens egen klaver») ---------- */
await page.evaluate(() => window.GAME.tilMenu());
assert.equal(await page.locator('#egetBtn').isVisible(), true, 'knappen står på startskærmen');
await page.click('#egetBtn');
await page.waitForSelector('#egetScreen.on');
assert.equal((await state()).fase, 'eget');

// Frit spil: et rigtigt klaviatur med hvide og sorte tangenter
assert.ok(await page.locator('.tangent:not(.sort)').count() >= 8, 'mindst en oktav hvide tangenter');
assert.ok(await page.locator('.tangent.sort').count() >= 5, 'og de sorte imellem');
await page.click('.tangent[data-midi="60"]');   // en tone for tonens skyld – ingen hjerter at miste
assert.match(await page.locator('#egetStatus').textContent(), /Spil løs/, 'frit spil er frit');
assert.equal(await page.locator('#egetSkift').isVisible(), true, 'dybere/lysere kan vælges i frit spil');

// Vælg Mester Jakob: klaveret følger sangen, og den næste tangent lyser
await page.click('#egetSange button:has-text("Mester Jakob")');
await page.waitForSelector('.tangent.naeste');
assert.equal(await page.locator('.tangent.naeste').getAttribute('data-midi'), '60', 'Mester Jakob begynder på C – og C lyser');
assert.equal(await page.locator('#egetSkift').isVisible(), false, 'i en sang bestemmer sangen klaveret');
assert.match(await page.locator('#egetStatus').textContent(), /node 1 af 32/, 'man kan se hvor langt man er');

// En forkert tangent giver bare sin tone – sangen flytter sig ikke
await page.click('.tangent[data-midi="64"]');
assert.equal(await page.locator('.tangent.naeste').getAttribute('data-midi'), '60', 'en forkert tangent flytter ikke sangen');
await page.screenshot({ path: SHOTS + 'klaverregn-eget.png' });

// Spil hele sangen i eget tempo: tryk på den lysende tangent, til den siger FLOT
for (let i = 0; i < 40 && await page.locator('.tangent.naeste').count(); i++) {
  await page.click('.tangent.naeste');
}
{
  const s = await page.evaluate(() => window.GAME.egetState);
  assert.equal(s.faerdig, true, 'hele sangen kom igennem');
  assert.equal(s.sang, 'Mester Jakob');
}
assert.match(await page.locator('#egetStatus').textContent(), /FLOT.*Mester Jakob/, 'der bliver sagt FLOT');

// Én gang til begynder forfra – og Menu-knappen fører hjem
await page.click('#egetIgen');
assert.equal(await page.locator('.tangent.naeste').getAttribute('data-midi'), '60', 'én gang til begynder forfra');
await page.click('#egetTilbage');
await page.waitForSelector('#startScreen.on');
assert.equal((await state()).fase, 'menu');

assert.deepEqual(errors, [], 'ingen fejl i konsollen');
await browser.close();
console.log('klaverregn.test.mjs: alt godt');
