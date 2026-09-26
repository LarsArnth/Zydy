// Kør:  PLAYWRIGHT=/Users/lars/Projekter/DungeonCrawler/node_modules/playwright/index.mjs node test/skraaning.test.mjs
// (kræver at en lokal server kører: python3 -m http.server 4193 -d public)
//
// Spiller «Skråningen» igennem: startskærm → en rigtig finger på højre og
// venstre halvdel styrer kuglen → tasterne → ud over kanten og slutskærmen →
// botten ruller 600 m → topliste → igen og menu. Til sidst på en iPad på tværs.
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
    return route.fulfill({ json: { ok: true, id: 1, token: 'abc', placering: 1, liste: [{ id: 1, navn: krop.navn, score: krop.score, oprettet: '2026-09-26T12:00:00.000Z' }] } });
  }
  return route.fulfill({ json: { spil: 'skraaning', retning: 'desc', min: 1, maks: 100000, liste: [] } });
});

await page.goto(`${BASE}/spil/skraaning/?seed=7`);
await page.waitForFunction(() => !!window.GAME);
const state = () => page.evaluate(() => window.GAME.state);

/* ---------- Startskærmen ---------- */
assert.equal(await page.locator('#startScreen.on').isVisible(), true, 'startskærmen vises');
assert.equal((await state()).fase, 'menu');
await page.waitForFunction(() => document.querySelector('#hsStart .hs-titel'), null, { timeout: 4000 });
assert.match(await page.locator('#hsStart').textContent(), /Topliste/, 'toplisten hentes på startskærmen');
{
  const plads = await page.evaluate(() => {
    const b = document.getElementById('startBtn').getBoundingClientRect();
    return { bund: b.bottom, skaerm: innerHeight };
  });
  assert.ok(plads.bund <= plads.skaerm, `Rul-knappen ligger uden for skærmen (${plads.bund} > ${plads.skaerm})`);
}
await page.waitForTimeout(400);                       // botten ruller bag menuen
await page.screenshot({ path: SHOTS + 'skraaning-start.png' });

/* ---------- Fingeren på højre og venstre halvdel ---------- */
await page.click('#startBtn');
{
  const st = await state();
  assert.equal(st.fase, 'spil');
  assert.equal(st.seed, 7, '?seed styrer banen');
  assert.equal(st.meter, 0, 'turen begynder forfra');
}
await page.evaluate(() => window.GAME.pause());
const tik = (n, styr) => page.evaluate(([n, styr]) => { for (let i = 0; i < n; i++) window.GAME.tik(1 / 120, styr ?? undefined); }, [n, styr]);
const c = await page.locator('#c').boundingBox();
{
  const foer = await state();
  await page.mouse.move(c.x + c.width * 0.85, c.y + c.height * 0.6);
  await page.mouse.down();
  await tik(40);
  const efter = await state();
  assert.equal(efter.fingre, 1, 'fingeren er registreret');
  assert.equal(efter.styr, 1, 'højre halvdel styrer til højre');
  assert.ok(efter.x > foer.x + 1.5, `kuglen ruller til højre (${foer.x.toFixed(2)} → ${efter.x.toFixed(2)})`);
  assert.ok(efter.z > foer.z + 3, 'og fremad af sig selv');
  await page.waitForSelector('#pilH.tryk', { timeout: 2000 });   // pilen i hjørnet lyser op
  await page.mouse.up();
  assert.equal((await state()).fingre, 0, 'slipper man, styrer man ikke længere');
  // Venstre halvdel
  const midt = (await state()).x;
  await page.mouse.move(c.x + c.width * 0.15, c.y + c.height * 0.6);
  await page.mouse.down();
  await tik(60);                                     // først skal den vende
  const v = await state();
  assert.equal(v.styr, -1, 'venstre halvdel styrer til venstre');
  assert.ok(v.x < midt - 1.5, 'kuglen ruller til venstre');
  await page.mouse.up();
  await tik(60);
  assert.equal((await state()).doed, false, 'kuglen er stadig på banen');
}
// Tastaturet virker også (til dem, der spiller på computer)
{
  const foer = await state();
  await page.keyboard.down('ArrowRight');
  await tik(30);
  await page.keyboard.up('ArrowRight');
  assert.ok((await state()).x > foer.x + 0.8, 'pil højre styrer til højre');
}
// Et billede midt i en tur
await page.evaluate(() => { window.GAME.botTur(160); });
await page.evaluate(() => window.GAME.resume());
await page.waitForTimeout(250);
await page.screenshot({ path: SHOTS + 'skraaning.png' });
await page.evaluate(() => window.GAME.pause());
{
  const st = await state();
  assert.equal(st.fase, 'spil');
  assert.ok(st.meter >= 160, `botten nåede ${st.meter} m`);
  assert.equal(await page.locator('#meterEl').textContent(), String(st.meter), 'HUD\'en viser meterne');
  assert.match(await page.locator('#fartEl').textContent(), /^\d+ km\/t$/, 'og farten');
  // Kuglen kan ses på skærmen, i den nederste halvdel
  const k = await page.evaluate(() => { const s = window.GAME.state; return window.GAME.skaerm(s.x, s.y + 0.5, s.z); });
  assert.ok(k && k.x > 0 && k.x < c.width && k.y > c.height * 0.4 && k.y < c.height, `kuglen står ikke på skærmen: ${JSON.stringify(k)}`);
}

/* ---------- Ud over kanten: faldt af og slutskærm ---------- */
{
  const st = await page.evaluate(() => window.GAME.frem(8, 1));
  assert.equal(st.fase, 'slut', 'styrer man ud over kanten, er turen slut');
  assert.equal(st.aarsag, 'fald');
  assert.equal(await page.locator('#slutScreen.on').isVisible(), true, 'slutskærmen kommer frem');
  assert.match(await page.locator('#slutTitel').textContent(), /Faldt af/);
  assert.match(await page.locator('#slutMeter').textContent(), new RegExp(`^${st.meter} m$`));
  // Knapperne kan nås uden at rulle
  const b = await page.evaluate(() => document.getElementById('igenBtn').getBoundingClientRect().bottom);
  assert.ok(b <= await page.evaluate(() => innerHeight), '«Rul igen» ligger på skærmen');
  await page.waitForSelector('#hsSlut .hs-input', { timeout: 4000 });
  await page.fill('#hsSlut .hs-input', 'Lykke');
  await page.click('#hsSlut .hs-gem');
  await page.waitForFunction(() => /Lykke/.test(document.getElementById('hsSlut').textContent), null, { timeout: 4000 });
  assert.deepEqual(sendte, [{ navn: 'Lykke', score: st.meter }], 'meterne sendes til toplisten');
  assert.equal(await page.evaluate(() => localStorage.getItem('zydy.skraaning.best')), String(st.meter), 'rekorden huskes');
  await page.screenshot({ path: SHOTS + 'skraaning-slut.png' });
}

/* ---------- En rød klods ---------- */
{
  await page.click('#igenBtn');
  await page.evaluate(() => window.GAME.pause());
  const st0 = await state();
  assert.equal(st0.fase, 'spil', 'man ruller igen med det samme');
  assert.equal(st0.meter, 0);
  assert.equal(await page.locator('#slutScreen.on').count(), 0, 'slutskærmen er væk');
  // Ligeud på frø 7 går det galt ved den første klodsrække
  const st = await page.evaluate(() => window.GAME.frem(30, 0));
  assert.equal(st.aarsag, 'blok', 'ligeud rammer man en rød klods');
  assert.match(await page.locator('#slutTitel').textContent(), /rød klods/);
  await page.click('#tilbageBtn');
  assert.equal(await page.locator('#startScreen.on').isVisible(), true, 'og man kan komme tilbage til menuen');
  assert.match(await page.locator('#rekHud').textContent(), /Rekord \d+ m/);
}

/* ---------- Aktivitet meldt til forsiden ---------- */
assert.ok(api.log.aktivitet.some(a => a.spil === 'skraaning' && a.ny === true), 'spillet melder én start');

/* ---------- Passer på en iPad på tværs ---------- */
{
  const pad = await browser.newContext({ ...devices['iPad (gen 7) landscape'] });
  const p2 = await pad.newPage();
  const padFejl = [];
  p2.on('pageerror', e => padFejl.push(String(e)));
  p2.on('console', m => { if (m.type() === 'error') padFejl.push(m.text()); });
  await mockApi(p2);
  await p2.goto(`${BASE}/spil/skraaning/?seed=7`);
  await p2.waitForFunction(() => !!window.GAME);
  await p2.click('#startBtn');
  await p2.evaluate(() => { window.GAME.pause(); window.GAME.botTur(90); });
  const r = await p2.locator('#c').boundingBox();
  const k = await p2.evaluate(() => { const s = window.GAME.state; return window.GAME.skaerm(s.x, s.y + 0.5, s.z); });
  assert.ok(k && k.x > r.width * 0.3 && k.x < r.width * 0.7 && k.y > r.height * 0.4 && k.y < r.height, `kuglen står midt på iPad-skærmen: ${JSON.stringify(k)}`);
  // Højre halvdel af en iPad-skærm styrer også til højre
  const foer = await p2.evaluate(() => window.GAME.state.x);
  await p2.mouse.move(r.x + r.width * 0.9, r.y + r.height * 0.5);
  await p2.mouse.down();
  await p2.evaluate(() => { for (let i = 0; i < 30; i++) window.GAME.tik(1 / 120); });
  await p2.mouse.up();
  assert.ok(await p2.evaluate(() => window.GAME.state.x) > foer + 1, 'og kuglen ruller til højre dér');
  assert.ok(await p2.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'ingen vandret scroll på iPad');
  await p2.evaluate(() => window.GAME.resume());
  await p2.waitForTimeout(200);
  await p2.screenshot({ path: SHOTS + 'skraaning-ipad.png' });
  assert.deepEqual(padFejl, [], 'ingen fejl på iPad');
  await pad.close();
}

/* ---------- Ingen vandret scroll, ingen fejl ---------- */
assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'ingen vandret scroll');
assert.deepEqual(errors, [], 'ingen console-fejl');
await browser.close();
console.log('OK skraaning');
