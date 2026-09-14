// Kør:  PLAYWRIGHT=/Users/lars/Projekter/DungeonCrawler/node_modules/playwright/index.mjs node test/flaske.test.mjs
// (kræver at en lokal server kører: python3 -m http.server 4193 -d public)
//
// Spiller «Flaskehavet» igennem: startskærm → hold dykker flasken, slip flyder
// op → et havdyr svømmer ind i flasken → en brandmand koster et liv → en hel
// tur med botten → flasken går i stykker → slutskærm og topliste.
// API'erne kører i hukommelsen (test/api-mock.mjs).
import assert from 'node:assert/strict';
import { mockApi } from './api-mock.mjs';
const { chromium, devices } = await import(process.env.PLAYWRIGHT ?? 'playwright');
const BASE = process.env.BASE ?? 'http://localhost:4193';
const SHOTS = new URL('./shots/', import.meta.url).pathname;

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 13'] });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

// Tom topliste, så enhver tur kvalificerer og navneformularen dukker op til sidst
const sendte = [];
const api = await mockApi(page);
await page.route('**/api/highscore/**', async route => {
  const req = route.request();
  if (req.method() === 'POST') {
    const krop = req.postDataJSON(); sendte.push(krop);
    return route.fulfill({ json: { ok: true, id: 1, token: 'abc', placering: 1, liste: [{ id: 1, navn: krop.navn, score: krop.score, oprettet: '2026-09-14T12:00:00.000Z' }] } });
  }
  return route.fulfill({ json: { spil: 'flaske', retning: 'desc', min: 1, maks: 2000, liste: [] } });
});

await page.goto(`${BASE}/spil/flaske/?seed=9`);
await page.waitForFunction(() => !!window.GAME);
const state = () => page.evaluate(() => window.GAME.state);

/* ---------- Startskærmen ---------- */
assert.equal(await page.locator('#startScreen.on').isVisible(), true, 'startskærmen vises');
assert.equal((await state()).fase, 'menu');
assert.equal((await state()).seed, 9, '?seed styrer havet');
await page.waitForFunction(() => document.querySelector('#hsStart .hs-titel'), null, { timeout: 4000 });
assert.match(await page.locator('#hsStart').textContent(), /Topliste/, 'toplisten hentes på startskærmen');

// Dyk-knappen skal kunne nås uden at rulle
{
  const plads = await page.evaluate(() => {
    const b = document.getElementById('startBtn').getBoundingClientRect();
    return { bund: b.bottom, skaerm: innerHeight };
  });
  assert.ok(plads.bund <= plads.skaerm, `Dyk-knappen ligger uden for skærmen (${plads.bund} > ${plads.skaerm})`);
}
await page.screenshot({ path: SHOTS + 'flaske-start.png' });

/* ---------- Hold dykker, slip flyder op ---------- */
await page.click('#startBtn');
assert.equal((await state()).fase, 'spil');
await page.evaluate(() => window.GAME.pause());

const tik = (n = 30) => page.evaluate(n => { for (let i = 0; i < n; i++) window.GAME.tik(1 / 120); }, n);

{
  // Fingeren på havet: flasken dykker
  const foer = (await state()).y;
  const c = await page.locator('#c').boundingBox();
  await page.mouse.move(c.x + c.width / 2, c.y + c.height / 2);
  await page.mouse.down();
  assert.equal((await state()).ind.hold, true, 'fingeren på skærmen holder');
  await tik(60);
  const nede = await state();
  assert.ok(nede.y > foer + 0.5, 'flasken dykker, mens man holder');
  assert.ok(nede.vy > 0, 'nedad med fart på');
  // Slip: flasken flyder op igen – flasker flyder
  await page.mouse.up();
  assert.equal((await state()).ind.hold, false);
  await tik(240);
  assert.ok((await state()).y < nede.y - 1, 'slipper man, flyder flasken op');
}
// Tastaturet gør det samme (til dem der spiller på computer)
{
  await tik(360);                                     // lad flasken lægge sig til rette i overfladen
  const foer = (await state()).y;
  await page.keyboard.down('Space'); await tik(60); await page.keyboard.up('Space');
  assert.ok((await state()).y > foer + 0.3, 'mellemrum dykker også');
}

/* ---------- Et havdyr svømmer ind i flasken ---------- */
{
  const st = await page.evaluate(() => window.GAME.stykke(0));
  assert.ok(st.dyr.length >= 1, 'der er havdyr i havet');
  const foer = await state();
  await page.evaluate(() => {
    const p = window.GAME.dyrPos(0, 0);
    window.GAME.placer(p.x - 0.2, p.y);
  });
  await tik(2);
  const efter = await state();
  assert.equal(efter.fangst, foer.fangst + 1, 'havdyret er fanget');
  assert.equal(efter.iFlasken, efter.fangst, 'og svømmer med inde i flasken');
  assert.equal(await page.locator('#fangstEl').textContent(), String(efter.fangst), 'HUD\'en tæller med');
}

/* ---------- En fare koster et liv ---------- */
{
  const fare = await page.evaluate(() => {
    for (let n = 0; n < 30; n++) {
      const st = window.GAME.stykke(n);
      if (st.farer.length) return { n, slags: st.farer[0].slags };
    }
    return null;
  });
  assert.ok(fare, 'der ligger farer i havet');
  await page.evaluate(n => {
    const p = window.GAME.farePos(n, 0);
    window.GAME.saetUsaarlig(0);
    window.GAME.placer(p.x - 0.2, p.y);
  }, fare.n);
  await tik(2);
  const efter = await state();
  assert.equal(efter.liv, efter.konst.LIV - 1, 'et stød koster et liv');
  assert.ok(efter.usaarlig > 0, 'og lige efter er man usårlig et øjeblik');
  assert.match(await page.locator('#livEl').textContent(), /🤍/, 'hjerterne i HUD\'en følger med');
}

/* ---------- En hel tur med botten – flasken går i stykker til sidst ---------- */
{
  await page.evaluate(() => window.GAME.start());
  await page.evaluate(() => window.GAME.pause());
  await page.evaluate(() => window.GAME.frem(6));
  await page.evaluate(() => window.GAME.resume());
  await page.waitForTimeout(250);                     // lad et par billeder blive tegnet
  await page.screenshot({ path: SHOTS + 'flaske.png' });
  await page.evaluate(() => window.GAME.pause());

  // 2000 og ikke standard-500: de 250 ms realtid ovenfor giver et løst antal
  // rigtige frames, og med nogle af dem overlever botten forbi 500 spilsekunder
  // (målt: seneste død t ≈ 765). Med 2000 dør den altid, uanset maskinlast.
  const slut = await page.evaluate(() => window.GAME.botTur(2000));
  assert.equal(slut.doed, true, 'til sidst går flasken i stykker');
  assert.equal(slut.fase, 'doed');
  assert.ok(slut.fangst > 25, `botten fangede kun ${slut.fangst} havdyr`);
  assert.ok(['brandmand', 'soepindsvin'].includes(slut.aarsag), 'og det var en fare, der gjorde det');

  assert.equal(await page.locator('#slutScreen.on').isVisible(), true, 'slutskærmen kommer frem');
  assert.match(await page.locator('#slutFangst').textContent(), new RegExp(`^${slut.fangst} havdyr$`), 'fangsten står stort');
  assert.match(await page.locator('#slutTitel').textContent(), /Flasken gik i stykker/);

  // Første gang spørges der om navn; derefter huskes det på tværs af spillene
  await page.waitForSelector('#hsSlut .hs-input', { timeout: 4000 });
  await page.fill('#hsSlut .hs-input', 'Milas');
  await page.click('#hsSlut .hs-gem');
  await page.waitForFunction(() => /Milas/.test(document.getElementById('hsSlut').textContent), null, { timeout: 4000 });
  assert.deepEqual(sendte, [{ navn: 'Milas', score: slut.fangst }], 'fangsten sendes til toplisten');
  assert.equal(await page.evaluate(() => localStorage.getItem('zydy.navn')), 'Milas', 'navnet huskes til de andre spil');
  assert.equal(await page.evaluate(() => localStorage.getItem('zydy.flaske.best')), String(slut.fangst), 'rekorden huskes');
  await page.screenshot({ path: SHOTS + 'flaske-slut.png' });
}

/* ---------- Fang flere og menu ---------- */
{
  await page.click('#igenBtn');
  const st = await state();
  assert.equal(st.fase, 'spil', 'man fisker videre med det samme');
  assert.equal(st.fangst, 0, 'med en tom flaske');
  assert.equal(st.liv, st.konst.LIV);
  assert.equal(await page.locator('#slutScreen.on').count(), 0, 'slutskærmen er væk');

  await page.evaluate(() => window.GAME.tilMenu());
  assert.equal(await page.locator('#startScreen.on').isVisible(), true, 'og man kan komme tilbage til menuen');
  assert.match(await page.locator('#rekHud').textContent(), /\d+/, 'hvor rekorden står');
}

/* ---------- Aktivitet meldt til forsiden ---------- */
assert.ok(api.log.aktivitet.some(a => a.spil === 'flaske' && a.ny === true), 'spillet melder én start');

/* ---------- Passer på en iPad på tværs ---------- */
{
  const pad = await browser.newContext({ ...devices['iPad (gen 7) landscape'] });
  const p2 = await pad.newPage();
  const padFejl = [];
  p2.on('pageerror', e => padFejl.push(String(e)));
  await mockApi(p2);
  await p2.goto(`${BASE}/spil/flaske/?seed=9`);
  await p2.waitForFunction(() => !!window.GAME);
  await p2.click('#startBtn');
  await p2.evaluate(() => window.GAME.pause());
  const st = await p2.evaluate(() => window.GAME.frem(3, true));
  assert.equal(st.fase, 'spil', 'turen kører også på en iPad');
  assert.ok(st.y > 10, 'og flasken dykker');
  assert.ok(await p2.evaluate(() => {
    const r = document.getElementById('c').getBoundingClientRect();
    return r.width > 600 && r.height > 200;
  }), 'fladen fylder skærmen');
  assert.ok(await p2.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'ingen vandret scroll på iPad');
  await p2.screenshot({ path: SHOTS + 'flaske-ipad.png' });
  assert.deepEqual(padFejl, [], 'ingen fejl på iPad');
  await pad.close();
}

/* ---------- Ingen vandret scroll, ingen fejl ---------- */
assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'ingen vandret scroll');
assert.deepEqual(errors, [], 'ingen console-fejl');
await browser.close();
console.log('OK flaske');
