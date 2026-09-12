// Kør:  PLAYWRIGHT=/Users/lars/Projekter/DungeonCrawler/node_modules/playwright/index.mjs node test/klodser.test.mjs
// (kræver at en lokal server kører: python3 -m http.server <PORT> -d public)
//
// Spiller «Klodser» igennem i en rigtig browser: at WebGL-motoren faktisk
// tegner noget, at man kan gå, hoppe, bygge og rive ned, at guldklodserne kan
// samles (her ved at teleportere hen til dem), og at verdenen – inklusive det
// man har bygget – står der igen efter en genindlæsning.
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mockApi } from './api-mock.mjs';
const { chromium, devices } = await import(process.env.PLAYWRIGHT ?? 'playwright');
const BASE = process.env.BASE ?? 'http://localhost:4180';
const SHOTS = path.join(path.dirname(fileURLToPath(import.meta.url)), 'shots');

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 13'] });
await ctx.addInitScript(() => { try { localStorage.setItem('zydy.navn', 'Selma'); } catch (e) {} });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

// Tom topliste, så tiden altid kvalificerer
const sendte = [];
const api = await mockApi(page);
await page.route('**/api/highscore/**', async route => {
  const req = route.request();
  const regler = { spil: 'klodser', retning: 'asc', min: 1, maks: 3600, unik: true };
  if (req.method() === 'POST') {
    const krop = req.postDataJSON(); sendte.push(krop);
    return route.fulfill({ json: { ok: true, id: 7, token: 'abc', placering: 1, ...regler, liste: [{ id: 7, navn: krop.navn, score: krop.score, oprettet: '2026-09-12T12:00:00.000Z' }] } });
  }
  return route.fulfill({ json: { ...regler, liste: [] } });
});

const state = () => page.evaluate(() => window.GAME.state);
const tik = (n = 30) => page.evaluate(n => { for (let i = 0; i < n; i++) window.GAME.tik(1 / 60); }, n);

await page.goto(`${BASE}/spil/klodser/?seed=3`);
await page.waitForFunction(() => !!window.GAME);

/* ---------- Startskærmen og 3D-motoren ---------- */
assert.equal(await page.locator('#startScreen.on').isVisible(), true, 'startskærmen vises');
assert.equal(await page.locator('#styring').isVisible(), false, 'ingen knapper før man spiller');
await page.waitForFunction(() => document.querySelector('#hsStart .hs-titel'), null, { timeout: 4000 });
assert.match(await page.locator('#hsStart').textContent(), /Topliste/, 'toplisten hentes på startskærmen');
assert.equal(await page.locator('.toej button').count(), 8, 'otte sæt tøj at vælge imellem');

{
  const s = await state();
  assert.equal(s.fase, 'menu');
  assert.equal(s.seed, 3, '?seed styrer verdenen');
  assert.equal(s.webgl, true, 'WebGL er i gang');
  assert.ok(s.net.fast > 5000, `verdenen er bygget om til trekanter (${s.net.fast} hjørner)`);
  assert.ok(s.net.vand > 0, 'og vandet er sin egen flade');
  assert.equal(s.ialt, 12, '12 guldklodser');
  assert.equal(s.taget, 0);
}
await page.waitForFunction(() => window.GAME.state.billeder > 2, null, { timeout: 4000 });
await page.screenshot({ path: path.join(SHOTS, 'klodser-start.png') });

/* ---------- I gang: gå, hop, kig ---------- */
await page.click('#startBtn');
assert.equal(await page.locator('#styring').isVisible(), true, 'styringen kommer frem');
assert.equal(await page.locator('#palet').isVisible(), true, 'paletten kommer frem');
assert.equal(await page.locator('#palet button').count(), 10, 'ti klodser at bygge med');
assert.equal((await state()).fase, 'spil');
await page.evaluate(() => window.GAME.pause());        // fast fysik-trin herfra

{
  const foer = (await state()).spiller;
  await page.evaluate(() => window.GAME.styr({ frem: 1 }));
  await tik(60);
  const efter = (await state()).spiller;
  const gik = Math.hypot(efter.x - foer.x, efter.z - foer.z);
  assert.ok(gik > 2, `man går fremad (kom ${gik.toFixed(1)} m)`);
  await page.evaluate(() => window.GAME.styr({}));
  await tik(20);
}

{
  const foer = (await state()).spiller;
  assert.equal(foer.paaJorden, true, 'man står på jorden');
  await page.evaluate(() => window.GAME.styr({ hop: true }));
  await tik(12);
  const oppe = (await state()).spiller;
  assert.ok(oppe.y > foer.y + 0.5, 'hoppet løfter en');
  await page.evaluate(() => window.GAME.styr({}));
  await tik(90);
  assert.equal((await state()).spiller.paaJorden, true, 'og man lander igen');
}

{
  const foer = (await state()).spiller;
  await page.evaluate(() => window.GAME.kig(0.4, -0.2));
  const efter = (await state()).spiller;
  assert.ok(Math.abs(efter.yaw - foer.yaw - 0.4) < 1e-6, 'man kan dreje sig');
  assert.ok(efter.pitch < foer.pitch, 'og kigge ned');
}

/* ---------- Byg og riv ned ---------- */
/** Drejer rundt om sig selv, til sigtet rammer jorden (man kan stå på en klippekant). */
async function sigtMod(pitch = -0.9) {
  for (let i = 0; i < 12; i++) {
    await page.evaluate(a => {
      const s = window.GAME.state.spiller;
      window.GAME.placer(s.x, s.y, s.z, a.yaw, a.pitch);
    }, { yaw: (i * Math.PI) / 6, pitch });
    await tik(2);
    const s = await state();
    if (s.sigtet) return s.sigtet;
  }
  return null;
}

{
  const maal = await sigtMod();
  assert.ok(maal, 'man sigter på en klods, når man kigger ned foran sig');

  await page.evaluate(() => window.GAME.vaelg(11));     // gul
  const nettoFoer = (await state()).net.bygget;
  const byggede = await page.evaluate(() => window.GAME.byg());
  assert.equal(byggede, true, 'klodsen bliver sat');
  const ny = { x: maal.x + maal.nx, y: maal.y + maal.ny, z: maal.z + maal.nz };
  assert.equal(await page.evaluate(p => window.GAME.blok(p.x, p.y, p.z), ny), 11, 'den gule klods står der');
  assert.equal((await state()).net.bygget, nettoFoer + 1, 'verdenen er bygget om til trekanter igen');

  await tik(2);
  assert.deepEqual([(await state()).sigtet.x, (await state()).sigtet.y, (await state()).sigtet.z],
    [ny.x, ny.y, ny.z], 'nu sigter man på den nye klods');
  assert.equal(await page.evaluate(() => window.GAME.fjern()), true);
  assert.equal(await page.evaluate(p => window.GAME.blok(p.x, p.y, p.z), ny), 0, 'og så er den væk igen');
}

// Paletten og øje-knappen virker med fingeren
await page.locator('#palet button').nth(3).click();
assert.equal((await state()).valgt, 9, 'man vælger klods i paletten');
assert.equal(await page.locator('#palet button').nth(3).getAttribute('aria-pressed'), 'true');
await page.click('#oejeBtn');
assert.equal((await state()).person, 1, 'øje-knappen skifter til første person');
await page.click('#oejeBtn');
assert.equal((await state()).person, 3, 'og tilbage igen');
await page.screenshot({ path: path.join(SHOTS, 'klodser.png') });

/* ---------- Guldklodserne ---------- */
{
  for (let i = 0; i < 12; i++) {
    const foer = (await state()).taget;
    await page.evaluate(i => window.GAME.tilGuld(i), i);
    await tik(3);
    const s = await state();
    assert.equal(s.taget, foer + 1, `guldklods nr. ${i + 1} blev samlet op`);
    assert.equal(s.guld[i].taget, true);
    if (i < 11) assert.equal(s.fase, 'spil', 'spillet kører, til den sidste er fundet');
  }
  const s = await state();
  assert.equal(s.fase, 'faerdig');
  assert.equal(await page.locator('#slutScreen.on').isVisible(), true, 'slutskærmen kommer frem');
  assert.equal(await page.locator('#styring').isVisible(), false, 'og styringen forsvinder');
  assert.match(await page.locator('#slutTid').textContent(), /^\d+:\d\d$/, 'tiden vises som m:ss');
  await page.waitForFunction(() => document.querySelector('#hsSlut .hs-liste'), null, { timeout: 4000 });
  assert.equal(sendte.length, 1, 'tiden sendes selv ind på toplisten');
  assert.equal(sendte[0].navn, 'Selma', 'under navnet fra forsiden');
  assert.ok(sendte[0].score >= 1, 'og med tiden i sekunder');
  await page.screenshot({ path: path.join(SHOTS, 'klodser-slut.png') });
}

/* ---------- Verdenen gemmes ---------- */
{
  await page.click('#byggeBtn');
  assert.equal((await state()).fase, 'spil', 'man kan bygge videre bagefter');
  await page.evaluate(() => window.GAME.vaelg(12));
  const maal = await sigtMod();
  assert.ok(maal, 'der er noget at bygge på');
  assert.equal(await page.evaluate(() => window.GAME.byg()), true);
  const ny = { x: maal.x + maal.nx, y: maal.y + maal.ny, z: maal.z + maal.nz };
  await page.click('#menuBtn');
  assert.equal(await page.locator('#pauseScreen.on').isVisible(), true, 'Menu sætter spillet på pause');

  await page.goto(`${BASE}/spil/klodser/`);            // uden ?seed: den gemte verden hentes
  await page.waitForFunction(() => !!window.GAME);
  const s = await state();
  assert.equal(s.seed, 3, 'det er den samme verden');
  assert.equal(s.taget, 12, 'guldklodserne står som samlet');
  assert.equal(await page.evaluate(p => window.GAME.blok(p.x, p.y, p.z), ny), 12, 'og klodsen man satte, står der stadig');
  assert.equal(await page.locator('#startBtn').textContent(), 'Byg videre');
  assert.equal(await page.locator('#nyBtn').isVisible(), true, 'man kan begynde forfra på en ny verden');

  await page.click('#nyBtn');
  const ny2 = await state();
  assert.equal(ny2.taget, 0, 'en ny verden har alle guldklodser igen');
  assert.equal(ny2.fase, 'spil');
}

/* ---------- Rammerne ---------- */
assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'ingen vandret scroll');
assert.ok((await state()).billeder > 5, 'der bliver tegnet billeder hele vejen igennem');
assert.deepEqual(errors, [], 'ingen console-fejl');
assert.ok(api.log.aktivitet.some(a => a.spil === 'klodser'), 'spillet melder sig til aktivitets-API\'et');

await browser.close();
console.log('OK klodser');
