// Kør:  PLAYWRIGHT=/Users/lars/Projekter/DungeonCrawler/node_modules/playwright/index.mjs node test/lava.test.mjs
// (kræver at en lokal server kører: python3 -m http.server 4186 -d public)
//
// Spiller «Gulvet er lava» igennem: startskærm → knapperne i bunden → en bot,
// der klatrer op ad møblerne med den rigtige fysik → isterning → flyttekasse
// → død og topliste. API'erne kører i hukommelsen (test/api-mock.mjs).
import assert from 'node:assert/strict';
import { mockApi } from './api-mock.mjs';
const { chromium, devices } = await import(process.env.PLAYWRIGHT ?? 'playwright');
const BASE = process.env.BASE ?? 'http://localhost:4186';
const SHOTS = '/Users/lars/Projekter/Zydy/test/shots/';

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 13'] });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

// Tom topliste, så enhver højde kvalificerer og navneformularen dukker op ved død
const sendte = [];
const api = await mockApi(page);
await page.route('**/api/highscore/**', async route => {
  const req = route.request();
  if (req.method() === 'POST') {
    const krop = req.postDataJSON(); sendte.push(krop);
    return route.fulfill({ json: { ok: true, id: 1, token: 'abc', placering: 1, liste: [{ id: 1, navn: krop.navn, score: krop.score, oprettet: '2026-09-12T12:00:00.000Z' }] } });
  }
  return route.fulfill({ json: { spil: 'lava', retning: 'desc', min: 1, maks: 3000, liste: [] } });
});

await page.goto(`${BASE}/spil/lava/?seed=5`);
await page.waitForFunction(() => !!window.GAME);
const state = () => page.evaluate(() => window.GAME.state);

/* ---------- Startskærmen ---------- */
assert.equal(await page.locator('#startScreen.on').isVisible(), true, 'startskærmen vises');
assert.equal(await page.locator('#styring').isVisible(), false, 'ingen knapper før man spiller');
await page.waitForFunction(() => document.querySelector('#hsStart .hs-titel'), null, { timeout: 4000 });
assert.match(await page.locator('#hsStart').textContent(), /Topliste/, 'toplisten hentes på startskærmen');
{
  const s = await state();
  assert.equal(s.fase, 'menu');
  assert.equal(s.seed, 5, '?seed styrer stuen');
  assert.ok(s.raekker > 3, 'stuen er bygget op over gulvet');
}
await page.screenshot({ path: SHOTS + 'lava-start.png' });

/* ---------- Knapperne i bunden virker ---------- */
await page.click('#startBtn');
assert.equal(await page.locator('#styring').isVisible(), true, 'styringen kommer frem, når man spiller');
assert.equal((await state()).fase, 'spil');
await page.evaluate(() => { window.GAME.pause(); window.GAME.frysLava(true); });   // fast fysik-trin, og ro til at prøve knapperne

const tik = (n = 30) => page.evaluate(n => { for (let i = 0; i < n; i++) window.GAME.tik(1 / 120); }, n);
const tryk = async (id, ned) => {
  const b = await page.locator(id).boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  if (ned) await page.mouse.down(); else await page.mouse.up();
};

{
  const foer = (await state()).spiller.x;
  await tryk('#hBtn', true); await tik(40); await tryk('#hBtn', false);
  const efter = (await state()).spiller;
  assert.ok(efter.x > foer + 0.5, `▶ går til højre (${foer.toFixed(2)} → ${efter.x.toFixed(2)})`);
  assert.equal(efter.vend, 1, 'figuren vender mod højre');
}
{
  const foer = (await state()).spiller.x;
  await tryk('#vBtn', true); await tik(40); await tryk('#vBtn', false);
  const efter = (await state()).spiller;
  assert.ok(efter.x < foer - 0.5, '◀ går til venstre');
  assert.equal(efter.vend, -1, 'figuren vender mod venstre');
}
{
  assert.ok((await state()).spiller.paa, 'står på gulvet');
  await tryk('#hopBtn', true); await tik(6); await tryk('#hopBtn', false);
  const s = (await state()).spiller;
  assert.equal(s.paa, null, 'hop-knappen løfter figuren fra gulvet');
  assert.ok(s.vy > 0, 'og den er på vej op');
  await tik(120);
  assert.ok((await state()).spiller.paa, 'og lander igen');
}
// Tastaturet gør det samme (til dem der spiller på computer)
{
  const foer = (await state()).spiller.x;
  await page.keyboard.down('ArrowRight'); await tik(30); await page.keyboard.up('ArrowRight');
  assert.ok((await state()).spiller.x > foer + 0.3, 'piletast til højre virker');
}

/* ---------- Lavaen stiger og tager en, hvis man bliver stående ---------- */
await page.evaluate(() => { window.GAME.frysLava(false); window.GAME.start(); window.GAME.pause(); });
{
  const foer = (await state()).lava;
  await tik(120);
  const midt = await state();
  assert.ok(midt.lava > foer + 0.5, `lavaen stiger af sig selv (${foer.toFixed(2)} → ${midt.lava.toFixed(2)})`);
  assert.equal(midt.fase, 'spil', 'men man har et øjeblik til at komme væk');
  let n = 0;
  while ((await state()).fase === 'spil' && n < 40) { await tik(60); n++; }
  const s = await state();
  assert.equal(s.fase, 'doed', 'bliver man stående på gulvet, tager lavaen en');
  assert.equal(s.hoejde, 0, 'og man er ikke kommet nogen vegne');
  assert.equal(await page.locator('#slutScreen.on').isVisible(), true, 'slutskærmen vises');
  assert.equal(await page.locator('#styring').isVisible(), false, 'knapperne er væk, når man er død');
}

/* ---------- Isterningen holder lavaen nede ---------- */
await page.click('#igenBtn');
await page.evaluate(() => window.GAME.pause());
{
  const fundet = await page.evaluate(() => {
    for (let n = 6; n < 400; n++) {
      const r = window.GAME.raekke(n);
      const i = r.findIndex(p => p.is);
      if (i >= 0) return [n, i];
    }
    return null;
  });
  assert.ok(fundet, 'der ligger isterninger i stuen');
  const [n, i] = fundet;
  await page.evaluate(([n, i]) => window.GAME.placer(n, i), [n, i]);
  await tik(4);
  const s = await state();
  assert.ok(s.frys > 0, 'isterningen fryser lavaen');
  const lavaFoer = s.lava;
  await tik(120);
  const efter = await state();
  assert.equal(efter.lava, lavaFoer, 'og imens står lavaen helt stille');
  await tik(360);                                        // FRYS_TID er 3,2 sekunder
  const optoeet = await state();
  assert.equal(optoeet.frys, 0, 'frosten går af igen');
  assert.ok(optoeet.lava > lavaFoer, 'og så stiger lavaen igen');
  assert.equal(optoeet.fase, 'spil', 'man overlever at hente en isterning');
}

/* ---------- Flyttekassen styrter i lavaen, når man har stået på den ---------- */
{
  const fundet = await page.evaluate(() => {
    for (let n = 6; n < 400; n++) {
      const r = window.GAME.raekke(n);
      const i = r.findIndex(p => p.styrter);
      if (i >= 0) return [n, i, r.length];
    }
    return null;
  });
  assert.ok(fundet, 'der er flyttekasser i stuen');
  const [n, i, antal] = fundet;
  assert.equal(antal, 2, 'en flyttekasse står aldrig alene i rækken');
  await page.evaluate(([n, i]) => window.GAME.placer(n, i), [n, i]);
  assert.equal((await state()).spiller.paa.styrter, true, 'står på kassen');
  await tik(150);                                        // KASSE_TID er 1,15 sekund
  const s = await state();
  assert.equal(s.spiller.paa, null, 'kassen giver efter, og man falder');
  assert.ok(s.naere.some(p => p.nr === n && p.faldet), 'kassen er væk');
}

/* ---------- En bot klatrer op ad møblerne med den rigtige fysik ---------- */
await page.evaluate(() => window.GAME.start());
await page.evaluate(() => window.GAME.pause());
const løb = await page.evaluate(() => {
  /*
    Botten gør det, et barn gør: gå hen til det sted på møblet, der er tættest
    på det næste, hop lige op og styr i luften. Den beviser, at stuen faktisk
    kan klatres – og at man kan nå det, før lavaen kommer.
  */
  const K = window.GAME.state.konst;
  const klem = (v, a, b) => Math.max(a, Math.min(b, v));
  let maal = null, hoppede = 0, is = 0, faldne = 0, hoejest = 0;
  for (let n = 0; n < 40000; n++) {
    const s = window.GAME.state;
    if (s.fase !== 'spil' || s.hoejde >= 80) break;      // 80 m er rigeligt til at vise, at stuen kan klatres
    hoejest = Math.max(hoejest, s.hoejde);
    if (s.frys > 0) is++;
    faldne = Math.max(faldne, s.naere.filter(p => p.faldet).length);
    const sp = s.spiller;
    if (sp.paa) {
      const op = window.GAME.raekke(sp.paa.nr + 1);
      const midte = sp.x + K.SP_B / 2;
      maal = op.reduce((a, b) => Math.abs(b.x + b.w / 2 - midte) < Math.abs(a.x + a.w / 2 - midte) ? b : a);
      // Nærmeste sted på næste møbel og nærmeste afsæt på det her – kortest muligt hop
      const bLo = maal.x + 0.05, bHi = Math.max(bLo, maal.x + maal.w - K.SP_B - 0.05);
      const aLo = sp.paa.x + 0.05, aHi = Math.max(aLo, sp.paa.x + sp.paa.w - K.SP_B - 0.05);
      const land = klem(klem(sp.x, aLo, aHi), bLo, bHi);
      const afsaet = klem(land, aLo, aHi);
      maal = { ...maal, land };
      const d = afsaet - sp.x;
      if (Math.abs(d) > 0.06) window.GAME.styr(Math.sign(d));
      else { window.GAME.styr(0); window.GAME.hop(); hoppede++; }
    } else if (maal) {
      const d = maal.land - sp.x;
      window.GAME.styr(Math.abs(d) > 0.04 ? Math.sign(d) : 0);
    }
    window.GAME.tik(1 / 120);
  }
  window.GAME.styr(0);
  const s = window.GAME.state;
  return { hoejest, hoejde: s.hoejde, fase: s.fase, hoppede, is, faldne, raekke: s.spiller.paa ? s.spiller.paa.nr : null };
});
assert.ok(løb.hoejde >= 80, `botten klatrer højt op (nåede ${løb.hoejde} m efter ${løb.hoppede} hop)`);
assert.ok(løb.is > 0, 'botten samlede mindst én isterning op undervejs');
assert.equal(løb.fase, 'spil', 'og den var i live hele vejen – lavaen kan holdes bag sig');
await page.evaluate(() => window.GAME.resume());
await page.waitForTimeout(220);                          // lad et par billeder blive tegnet
await page.screenshot({ path: SHOTS + 'lava.png' });
await page.evaluate(() => window.GAME.pause());

/* ---------- Død, topliste og navn ---------- */
{
  const hoejde = (await state()).hoejde;
  await page.evaluate(() => window.GAME.doedNu());
  const s = await state();
  assert.equal(s.fase, 'doed');
  assert.equal(s.best, hoejde, 'rekorden gemmes');
  assert.match(await page.locator('#slutTitel').textContent(), /Ny rekord|Lavaen tog dig/);
  assert.match(await page.locator('#slutHoejde').textContent(), new RegExp(`^${hoejde} m$`), 'højden står på slutskærmen');

  // Første gang spørges der om navn; derefter huskes det på tværs af spillene
  await page.waitForSelector('#hsSlut .hs-input', { timeout: 4000 });
  await page.fill('#hsSlut .hs-input', 'Selma');
  await page.click('#hsSlut .hs-gem');
  await page.waitForFunction(() => /Selma/.test(document.getElementById('hsSlut').textContent), null, { timeout: 4000 });
  assert.deepEqual(sendte, [{ navn: 'Selma', score: hoejde }], 'højden sendes til toplisten');
  assert.equal(await page.evaluate(() => localStorage.getItem('zydy.navn')), 'Selma', 'navnet huskes til de andre spil');
  assert.equal(await page.evaluate(() => localStorage.getItem('zydy.lava.best')), String(hoejde));
  await page.screenshot({ path: SHOTS + 'lava-slut.png' });
}

/* ---------- Tilbage til menuen ---------- */
await page.click('#tilbageBtn');
assert.equal(await page.locator('#startScreen.on').isVisible(), true, 'Menu fører tilbage til startskærmen');
assert.equal((await state()).fase, 'menu');
assert.match(await page.locator('#rekHud').textContent(), /\d+ m/, 'rekorden står i hjørnet');

/* ---------- Aktivitet meldt til forsiden ---------- */
assert.ok(api.log.aktivitet.some(a => a.spil === 'lava' && a.ny === true), 'spillet melder én start');

/* ---------- Passer på en iPad på langs ---------- */
{
  const pad = await browser.newContext({ ...devices['iPad (gen 7) landscape'] });
  const p2 = await pad.newPage();
  await mockApi(p2);
  await p2.goto(`${BASE}/spil/lava/?seed=5`);
  await p2.waitForFunction(() => !!window.GAME);
  await p2.click('#startBtn');
  await p2.waitForTimeout(400);
  const knap = await p2.locator('#hopBtn').boundingBox();
  assert.ok(knap.width >= 80 && knap.height >= 80, 'hop-knappen er stor nok til en tommelfinger');
  assert.ok(await p2.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'ingen vandret scroll på iPad');
  await p2.screenshot({ path: SHOTS + 'lava-ipad.png' });
  await pad.close();
}

/* ---------- Ingen vandret scroll, ingen fejl ---------- */
assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'ingen vandret scroll');
assert.deepEqual(errors, [], 'ingen console-fejl');
await browser.close();
console.log('OK lava');
