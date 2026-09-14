// Kør:  PLAYWRIGHT=/Users/lars/Projekter/DungeonCrawler/node_modules/playwright/index.mjs node test/sejl.test.mjs
// (kræver at en lokal server kører: python3 -m http.server 4193 -d public)
//
// Sejler «Til søs!» igennem: startskærm → ror-knapperne drejer båden → vindøjet
// får sejlet til at blafre, halvvind giver fart → et skær koster et liv → en
// hel tur med botten → uvejret tager en → slutskærm og topliste.
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

// Tom topliste, så enhver tur kvalificerer og navneformularen dukker op ved død
const sendte = [];
const api = await mockApi(page);
await page.route('**/api/highscore/**', async route => {
  const req = route.request();
  if (req.method() === 'POST') {
    const krop = req.postDataJSON(); sendte.push(krop);
    return route.fulfill({ json: { ok: true, id: 1, token: 'abc', placering: 1, liste: [{ id: 1, navn: krop.navn, score: krop.score, oprettet: '2026-09-14T12:00:00.000Z' }] } });
  }
  return route.fulfill({ json: { spil: 'sejl', retning: 'desc', min: 1, maks: 20000, liste: [] } });
});

await page.goto(`${BASE}/spil/sejl/?seed=9`);
await page.waitForFunction(() => !!window.GAME);
const state = () => page.evaluate(() => window.GAME.state);

/* ---------- Startskærmen ---------- */
assert.equal(await page.locator('#startScreen.on').isVisible(), true, 'startskærmen vises');
assert.equal(await page.locator('#styring').isVisible(), false, 'ingen knapper før man sejler');
assert.equal((await state()).fase, 'menu');
assert.equal((await state()).seed, 9, '?seed styrer havet');
await page.waitForFunction(() => document.querySelector('#hsStart .hs-titel'), null, { timeout: 4000 });
assert.match(await page.locator('#hsStart').textContent(), /Topliste/, 'toplisten hentes på startskærmen');

// Sejl-knappen skal kunne nås uden at rulle
{
  const plads = await page.evaluate(() => {
    const b = document.getElementById('startBtn').getBoundingClientRect();
    return { bund: b.bottom, skaerm: innerHeight };
  });
  assert.ok(plads.bund <= plads.skaerm, `Sejl-knappen ligger uden for skærmen (${plads.bund} > ${plads.skaerm})`);
}
await page.screenshot({ path: SHOTS + 'sejl-start.png' });

/* ---------- Ror-knapperne drejer båden ---------- */
await page.click('#startBtn');
assert.equal(await page.locator('#styring').isVisible(), true, 'styringen kommer frem, når man sejler');
assert.equal((await state()).fase, 'spil');
await page.evaluate(() => window.GAME.pause());

const tik = (n = 30) => page.evaluate(n => { for (let i = 0; i < n; i++) window.GAME.tik(1 / 120); }, n);
const tryk = async (id, ned) => {
  const b = await page.locator(id).boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  if (ned) await page.mouse.down(); else await page.mouse.up();
};

{
  const foer = (await state()).kurs;
  await tryk('#hBtn', true); await tik(40); await tryk('#hBtn', false);
  assert.ok((await state()).kurs > foer + 0.3, '▶ drejer båden mod højre');
}
{
  const foer = (await state()).kurs;
  await tryk('#vBtn', true); await tik(40); await tryk('#vBtn', false);
  assert.ok((await state()).kurs < foer - 0.3, '◀ drejer mod venstre');
}
// Tastaturet gør det samme (til dem der sejler på computer)
{
  const foer = (await state()).kurs;
  await page.keyboard.down('ArrowRight'); await tik(30); await page.keyboard.up('ArrowRight');
  assert.ok((await state()).kurs > foer + 0.2, 'piletast til højre virker');
}

/* ---------- Vinden: i vindøjet blafrer sejlet, halvvind giver fart ---------- */
{
  await page.evaluate(() => { window.GAME.saetVind(0); window.GAME.saetKurs(0); });
  const stampe = await page.evaluate(() => window.GAME.frem(3, 0));
  assert.equal(stampe.blafrer, true, 'lige mod vinden blafrer sejlet');
  assert.ok(stampe.fart < 2, `og båden ligger næsten stille (${stampe.fart.toFixed(1)} m/s)`);
  assert.equal(await page.evaluate(() => document.getElementById('vindEl').classList.contains('blaf')), true,
    'vind-uret advarer, når sejlet blafrer');

  await page.evaluate(() => window.GAME.saetVind(Math.PI / 2));
  const halv = await page.evaluate(() => window.GAME.frem(4, 0));
  assert.equal(halv.blafrer, false);
  assert.ok(halv.fart > halv.konst.MAKS_FART * 0.85, `halvvind giver næsten fuld fart (${halv.fart.toFixed(1)} m/s)`);
  assert.ok(halv.meter > stampe.meter + 20, 'og så kommer man af sted');
}

/* ---------- Sejlrenden og skærene ---------- */
{
  const r = await page.evaluate(() => window.GAME.raekke(0));
  assert.equal(r.boejer.length, 2, 'sejlrenden er markeret med to sømærker');
  assert.equal(r.boejer[0].farve, 'roed');
  assert.equal(r.boejer[1].farve, 'groen');
  const st = await state();
  for (const k of r.skaer) {
    assert.ok(Math.abs(k.x - r.gab) >= st.konst.GAB / 2 + k.r + st.konst.BAAD_R, 'ingen skær i sejlrenden');
  }

  // Sejl lige ind i et skær: det koster et liv, og hjerterne følger med
  const raekkeMedSkaer = await page.evaluate(() => {
    for (let n = 0; n < 30; n++) { const r = window.GAME.raekke(n); if (r.skaer.length) return r; }
    return null;
  });
  assert.ok(raekkeMedSkaer, 'der ligger skær i havet');
  const k = raekkeMedSkaer.skaer[0];
  await page.evaluate(([x, y]) => {
    window.GAME.placer(x, y, 0);
    window.GAME.saetVind(Math.PI);                    // medvind, så kursen holder
  }, [k.x, k.y - k.r - 3]);
  const efter = await page.evaluate(() => window.GAME.frem(2, 0));
  assert.equal(efter.liv, efter.konst.LIV - 1, 'et skær koster et liv');
  assert.ok(efter.usaarlig > 0, 'og lige efter er man usårlig et øjeblik');
  assert.match(await page.locator('#livEl').textContent(), /🤍/, 'hjerterne i HUD\'en følger med');
}

/* ---------- En hel tur med botten – uvejret tager en til sidst ---------- */
{
  await page.evaluate(() => window.GAME.start());
  await page.evaluate(() => window.GAME.pause());
  const midt = await page.evaluate(() => window.GAME.frem(10, 0));
  assert.ok(midt.afstand > 0, 'uvejret er stadig bagude');
  await page.evaluate(() => window.GAME.resume());
  await page.waitForTimeout(250);                     // lad et par billeder blive tegnet
  await page.screenshot({ path: SHOTS + 'sejl.png' });
  await page.evaluate(() => window.GAME.pause());

  const slut = await page.evaluate(() => window.GAME.botTur());
  assert.equal(slut.doed, true, 'til sidst slutter turen');
  assert.equal(slut.fase, 'doed');
  assert.ok(slut.meter > 200, `botten nåede kun ${slut.meter} m`);

  assert.equal(await page.locator('#slutScreen.on').isVisible(), true, 'slutskærmen kommer frem');
  assert.equal(await page.locator('#styring').isVisible(), false, 'knapperne er væk, når man er død');
  assert.match(await page.locator('#slutMeter').textContent(), new RegExp(`^${slut.meter} m$`), 'meterne står stort');
  assert.match(await page.locator('#slutTitel').textContent(), /Uvejret tog dig|Båden sank/);

  // Første gang spørges der om navn; derefter huskes det på tværs af spillene
  await page.waitForSelector('#hsSlut .hs-input', { timeout: 4000 });
  await page.fill('#hsSlut .hs-input', 'Milas');
  await page.click('#hsSlut .hs-gem');
  await page.waitForFunction(() => /Milas/.test(document.getElementById('hsSlut').textContent), null, { timeout: 4000 });
  assert.deepEqual(sendte, [{ navn: 'Milas', score: slut.meter }], 'turen sendes til toplisten');
  assert.equal(await page.evaluate(() => localStorage.getItem('zydy.navn')), 'Milas', 'navnet huskes til de andre spil');
  assert.equal(await page.evaluate(() => localStorage.getItem('zydy.sejl.best')), String(slut.meter), 'rekorden huskes');
  await page.screenshot({ path: SHOTS + 'sejl-slut.png' });
}

/* ---------- Sejl igen og menu ---------- */
{
  await page.click('#igenBtn');
  const st = await state();
  assert.equal(st.fase, 'spil', 'man sejler videre med det samme');
  assert.equal(st.meter, 0, 'forfra nede sydfra');
  assert.equal(st.liv, st.konst.LIV);
  assert.equal(await page.locator('#slutScreen.on').count(), 0, 'slutskærmen er væk');

  await page.evaluate(() => window.GAME.tilMenu());
  assert.equal(await page.locator('#startScreen.on').isVisible(), true, 'og man kan komme tilbage til menuen');
  assert.match(await page.locator('#rekHud').textContent(), /\d+ m/, 'hvor rekorden står');
}

/* ---------- Aktivitet meldt til forsiden ---------- */
assert.ok(api.log.aktivitet.some(a => a.spil === 'sejl' && a.ny === true), 'spillet melder én start');

/* ---------- Passer på en iPad på tværs ---------- */
{
  const pad = await browser.newContext({ ...devices['iPad (gen 7) landscape'] });
  const p2 = await pad.newPage();
  const padFejl = [];
  p2.on('pageerror', e => padFejl.push(String(e)));
  await mockApi(p2);
  await p2.goto(`${BASE}/spil/sejl/?seed=9`);
  await p2.waitForFunction(() => !!window.GAME);
  await p2.click('#startBtn');
  await p2.evaluate(() => window.GAME.pause());
  const st = await p2.evaluate(() => { window.GAME.saetVind(Math.PI / 2); return window.GAME.frem(6, 0); });
  assert.equal(st.fase, 'spil', 'turen sejler også på en iPad');
  assert.ok(st.meter > 30, 'og båden kommer af sted');
  const knap = await p2.locator('#hBtn').boundingBox();
  assert.ok(knap.width >= 80 && knap.height >= 80, 'ror-knappen er stor nok til en tommelfinger');
  assert.ok(await p2.evaluate(() => {
    const r = document.getElementById('c').getBoundingClientRect();
    return r.width > 600 && r.height > 200;
  }), 'fladen fylder skærmen');
  assert.ok(await p2.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'ingen vandret scroll på iPad');
  await p2.screenshot({ path: SHOTS + 'sejl-ipad.png' });
  assert.deepEqual(padFejl, [], 'ingen fejl på iPad');
  await pad.close();
}

/* ---------- Ingen vandret scroll, ingen fejl ---------- */
assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'ingen vandret scroll');
assert.deepEqual(errors, [], 'ingen console-fejl');
await browser.close();
console.log('OK sejl');
