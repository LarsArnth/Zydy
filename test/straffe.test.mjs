// Kør:  PLAYWRIGHT=/sti/til/playwright/index.mjs node test/straffe.test.mjs
// (kræver at en lokal server kører, se test/run.mjs)
//
// Spiller «Straffespark» igennem: startskærm → en rigtig swipe sparker bolden →
// mål tæller op og målmanden rykker niveau → brændte bolde koster liv → tre
// brændte → slutskærm og topliste. API'erne kører i hukommelsen (test/api-mock.mjs).
import assert from 'node:assert/strict';
import { mockApi } from './api-mock.mjs';
const { chromium, devices } = await import(process.env.PLAYWRIGHT ?? 'playwright');
const BASE = process.env.BASE ?? 'http://localhost:4194';
const SHOTS = new URL('./shots/', import.meta.url).pathname;

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 13'] });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

// Tom topliste, så enhver kamp kvalificerer og navneformularen dukker op til sidst
const sendte = [];
const api = await mockApi(page);
await page.route('**/api/highscore/**', async route => {
  const req = route.request();
  if (req.method() === 'POST') {
    const krop = req.postDataJSON(); sendte.push(krop);
    return route.fulfill({ json: { ok: true, id: 1, token: 'abc', placering: 1, liste: [{ id: 1, navn: krop.navn, score: krop.score, oprettet: '2026-09-15T12:00:00.000Z' }] } });
  }
  return route.fulfill({ json: { spil: 'straffe', retning: 'desc', min: 1, maks: 200, liste: [] } });
});

await page.goto(`${BASE}/spil/straffe/?seed=9`);
await page.waitForFunction(() => !!window.GAME);
const state = () => page.evaluate(() => window.GAME.state);

/* ---------- Startskærmen ---------- */
assert.equal(await page.locator('#startScreen.on').isVisible(), true, 'startskærmen vises');
assert.equal((await state()).fase, 'menu');
assert.equal((await state()).seed, 9, '?seed styrer kampen');
await page.waitForFunction(() => document.querySelector('#hsStart .hs-titel'), null, { timeout: 4000 });
assert.match(await page.locator('#hsStart').textContent(), /Topliste/, 'toplisten hentes på startskærmen');

// Spark-knappen skal kunne nås uden at rulle
{
  const plads = await page.evaluate(() => {
    const b = document.getElementById('startBtn').getBoundingClientRect();
    return { bund: b.bottom, skaerm: innerHeight };
  });
  assert.ok(plads.bund <= plads.skaerm, `Spark-knappen ligger uden for skærmen (${plads.bund} > ${plads.skaerm})`);
}
await page.screenshot({ path: SHOTS + 'straffe-start.png' });

/* ---------- En rigtig swipe sparker bolden ---------- */
await page.click('#startBtn');
assert.equal((await state()).fase, 'klar');
await page.evaluate(() => window.GAME.pause());

{
  // Fingeren trækker opad hen over fladen – som på en telefon
  await page.evaluate(() => {
    const st = document.getElementById('stage');
    const r = st.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height * 0.85;
    const ev = (type, x, y) => st.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, bubbles: true }));
    ev('pointerdown', cx, cy);
    ev('pointermove', cx + 20, cy - 60);
    ev('pointermove', cx + 45, cy - 140);
    ev('pointerup', cx + 45, cy - 140);
  });
  const st = await state();
  assert.equal(st.nr, 1, 'swipen blev til et spark');
  assert.equal(st.fase, 'flyver', 'og bolden er i luften');
  assert.ok(st.anim && st.anim.dur > 0, 'med en animation på');
  await page.evaluate(() => window.GAME.frem(3));
  const efter = await state();
  assert.ok(['klar', 'doed'].includes(efter.fase), 'bolden er landet, og der kan sparkes igen');
}

/* ---------- En swipe NEDAD sparker ikke ---------- */
{
  const foer = (await state()).nr;
  assert.equal(await page.evaluate(() => window.GAME.svirp(10, 40, 80)), null, 'nedad er ikke et spark');
  assert.equal((await state()).nr, foer, 'og bolden blev på pletten');
}

/* ---------- Mål tæller op, og målmanden rykker niveau ---------- */
{
  await page.evaluate(() => window.GAME.start());
  await page.evaluate(() => window.GAME.pause());
  // Godt hjørnespark til der er scoret to gange (deterministisk med fast frø)
  let maal = 0, forsoeg = 0;
  while (maal < 2 && forsoeg < 30) {
    forsoeg++;
    const e = await page.evaluate(() => window.GAME.spark({ x: 3.05, y: 1.75 }, 0.85));
    assert.ok(e, 'sparket blev taget imod');
    assert.ok(['maal', 'redning', 'stolpe', 'overligger', 'forbi'].includes(e.resultat));
    if (e.resultat === 'maal') maal = e.maal;
    const st = await page.evaluate(() => window.GAME.frem(3));
    if (st.fase === 'doed') break;
  }
  const st = await state();
  assert.ok(st.maal >= 2, `der burde være scoret to mål på ${forsoeg} hjørnespark (${st.maal})`);
  assert.equal(st.niveau, 1 + Math.floor(st.maal / 2), 'målmanden rykker niveau for hvert andet mål');
  assert.equal(await page.locator('#maalEl').textContent(), String(st.maal), 'HUD\'en tæller med');
  assert.match(await page.locator('#keeperHud').textContent(), new RegExp(`Niveau ${st.niveau}`), 'og viser målmandens niveau');
}

/* ---------- Et brændt spark koster et liv ---------- */
{
  await page.evaluate(() => window.GAME.start());
  await page.evaluate(() => window.GAME.pause());
  const e = await page.evaluate(() => window.GAME.spark({ x: 9, y: 1 }, 0.5));
  assert.equal(e.resultat, 'forbi', 'langt forbi er forbi');
  const st = await page.evaluate(() => window.GAME.frem(3));
  assert.equal(st.liv, st.konst.LIV - 1, 'det kostede et liv');
  assert.equal(st.maal, 0, 'og gav ikke mål');
  assert.match(await page.locator('#livEl').textContent(), /▫️/, 'boldene i HUD\'en følger med');
}

/* ---------- Tre brændte – og slutskærmen med topliste ---------- */
{
  await page.evaluate(() => window.GAME.start());
  await page.evaluate(() => window.GAME.pause());
  // Ét mål først, så der er en score at sende til toplisten (0 kvalificerer ikke)
  const eMaal = await page.evaluate(() => window.GAME.spark({ x: 3.05, y: 1.75 }, 0.85));
  assert.equal(eMaal.resultat, 'maal', 'første hjørnespark går ind med frø 9');
  await page.evaluate(() => window.GAME.frem(3));
  let st = await state();
  while (!st.faerdig) {
    await page.evaluate(() => window.GAME.spark({ x: 9, y: 1 }, 0.5));
    st = await page.evaluate(() => window.GAME.frem(3));
  }
  assert.equal(st.fase, 'doed', 'tre brændte slutter kampen');
  assert.equal(st.liv, 0);
  assert.equal(await page.locator('#slutScreen.on').isVisible(), true, 'slutskærmen kommer frem');
  assert.match(await page.locator('#slutMaal').textContent(), new RegExp(`^${st.maal} mål$`), 'målene står stort');

  // Første gang spørges der om navn; derefter huskes det på tværs af spillene
  await page.waitForSelector('#hsSlut .hs-input', { timeout: 4000 });
  await page.fill('#hsSlut .hs-input', 'Jonas');
  await page.click('#hsSlut .hs-gem');
  await page.waitForFunction(() => /Jonas/.test(document.getElementById('hsSlut').textContent), null, { timeout: 4000 });
  assert.deepEqual(sendte, [{ navn: 'Jonas', score: st.maal }], 'scoren sendes til toplisten');
  assert.equal(await page.evaluate(() => localStorage.getItem('zydy.navn')), 'Jonas', 'navnet huskes til de andre spil');
  await page.screenshot({ path: SHOTS + 'straffe-slut.png' });
}

/* ---------- Spark igen og menu ---------- */
{
  await page.click('#igenBtn');
  const st = await state();
  assert.equal(st.fase, 'klar', 'man sparker videre med det samme');
  assert.equal(st.maal, 0, 'fra nul');
  assert.equal(st.liv, st.konst.LIV);
  assert.equal(st.niveau, 1, 'og målmanden er på sit letteste niveau igen');
  assert.equal(await page.locator('#slutScreen.on').count(), 0, 'slutskærmen er væk');

  await page.evaluate(() => window.GAME.tilMenu());
  assert.equal(await page.locator('#startScreen.on').isVisible(), true, 'og man kan komme tilbage til menuen');
  assert.match(await page.locator('#rekHud').textContent(), /\d+/, 'hvor rekorden står');
}

/* ---------- Aktivitet meldt til forsiden ---------- */
assert.ok(api.log.aktivitet.some(a => a.spil === 'straffe' && a.ny === true), 'spillet melder én start');

/* ---------- Passer på en iPad på tværs ---------- */
{
  const pad = await browser.newContext({ ...devices['iPad (gen 7) landscape'] });
  const p2 = await pad.newPage();
  const padFejl = [];
  p2.on('pageerror', e => padFejl.push(String(e)));
  await mockApi(p2);
  await p2.goto(`${BASE}/spil/straffe/?seed=9`);
  await p2.waitForFunction(() => !!window.GAME);
  await p2.click('#startBtn');
  await p2.evaluate(() => window.GAME.pause());
  await p2.evaluate(() => window.GAME.spark({ x: -3.05, y: 1.75 }, 0.85));
  const st = await p2.evaluate(() => window.GAME.frem(0.25));
  assert.ok(st.nr >= 1, 'der kan sparkes på en iPad');
  await p2.waitForTimeout(120);
  await p2.screenshot({ path: SHOTS + 'straffe-ipad.png' });
  assert.ok(await p2.evaluate(() => {
    const r = document.getElementById('c').getBoundingClientRect();
    return r.width > 600 && r.height > 200;
  }), 'fladen fylder skærmen');
  assert.ok(await p2.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'ingen vandret scroll på iPad');
  assert.deepEqual(padFejl, [], 'ingen fejl på iPad');
  await pad.close();
}

/* ---------- Ingen vandret scroll, ingen fejl ---------- */
assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'ingen vandret scroll');
assert.deepEqual(errors, [], 'ingen console-fejl');
await browser.close();
console.log('OK straffe');
