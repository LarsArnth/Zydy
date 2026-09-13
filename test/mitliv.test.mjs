// Kør:  PLAYWRIGHT=/Users/lars/Projekter/DungeonCrawler/node_modules/playwright/index.mjs node test/mitliv.test.mjs
// (kræver at en lokal server kører: python3 -m http.server 4186 -d public)
//
// Lever et liv igennem i «Mit liv»: lav en figur → flyt ind → sov, spis og gå
// på arbejde → byg om i huset → forfremmelse og topliste → huset huskes efter
// genindlæsning. API'erne kører i hukommelsen (test/api-mock.mjs).
import assert from 'node:assert/strict';
import { mockApi } from './api-mock.mjs';
const { chromium, devices } = await import(process.env.PLAYWRIGHT ?? 'playwright');
const BASE = process.env.BASE ?? 'http://localhost:4186';
const SHOTS = new URL('./shots/', import.meta.url).pathname;

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 13'] });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

// Tom topliste, så en ny formue altid kvalificerer
const sendte = [];
const api = await mockApi(page);
await page.route('**/api/highscore/**', async route => {
  const req = route.request();
  if (req.method() === 'POST') {
    const krop = req.postDataJSON(); sendte.push(krop);
    return route.fulfill({ json: { ok: true, id: 1, token: 'abc', placering: 1, liste: [{ id: 1, navn: krop.navn, score: krop.score, oprettet: '2026-09-13T12:00:00.000Z' }] } });
  }
  return route.fulfill({ json: { spil: 'mitliv', retning: 'desc', min: 1, maks: 1000000, unik: true, liste: [] } });
});

await page.goto(`${BASE}/spil/mitliv/?seed=7`);
await page.waitForFunction(() => !!window.GAME);
const state = () => page.evaluate(() => window.GAME.state);
const hjem = () => page.evaluate(() => window.GAME.hjem);
/** Lader spilminutter gå – som spillets egen løkke, bare uden at vente på rigtig tid. */
const tik = (min, trin = 5) => page.evaluate(([min, trin]) => {
  for (let t = 0; t < min; t += trin) window.GAME.tik(trin);
}, [min, trin]);
/** Trykker på et felt i huset gennem den rigtige skærm. */
async function trykFelt(x, y) {
  const boks = await page.locator('#laerred').boundingBox();
  const p = await page.evaluate(([x, y]) => window.GAME.punktFor(x, y), [x, y]);
  await page.mouse.click(boks.x + p.x, boks.y + p.y);
}

/* ---------- Startskærmen: lav din figur ---------- */
assert.equal(await page.locator('#start.on').isVisible(), true, 'startskærmen vises');
assert.ok(await page.locator('#vaelgere .vaelg').count() >= 4, 'man kan vælge hud, hår og tøj');
await page.waitForFunction(() => document.querySelector('#hsStart .hs-titel'), null, { timeout: 4000 });
assert.match(await page.locator('#hsStart').textContent(), /Rigeste liv/, 'toplisten står på startskærmen');
{
  // Spil-knappen skal kunne nås uden at rulle – startskærmen er den højeste i spillet
  const knap = await page.locator('#startBtn').boundingBox();
  const h = await page.evaluate(() => innerHeight);
  assert.ok(knap.y + knap.height <= h, `«Flyt ind» kan nås uden at rulle (${Math.round(knap.y + knap.height)} af ${h})`);
}
await page.click('#vaelgere .vaelg:nth-child(1) .prik:nth-child(3)');
await page.click('#vaelgere .vaelg:nth-child(4) .prik:nth-child(2)');
assert.equal((await state()).udseende.hud, 2, 'huden kan vælges');
assert.equal((await state()).udseende.troeje, 1, 'og trøjen');
await page.screenshot({ path: SHOTS + 'mitliv-start.png' });

await page.fill('#navnefelt', 'Selma');
await page.click('#startBtn');
await page.evaluate(() => window.GAME.pause());        // vi styrer selv tiden herfra

assert.equal(await page.locator('#spil.on').isVisible(), true, 'huset kommer frem');
assert.equal(await page.evaluate(() => localStorage.getItem('zydy.navn')), 'Selma', 'navnet huskes til de andre spil');
{
  const h = await hjem();
  assert.equal(h.navn, 'Selma');
  assert.equal(h.udseende.hud, 2);
  assert.ok(h.penge >= 500, 'man flytter ind med lidt penge');
  assert.ok(h.ting.length >= 4, 'og et møbleret hus');
  assert.equal(await page.locator('.maaler').count(), 6, 'der er en måler for hvert behov');
}

/* ---------- Tiden går, og behovene siver ---------- */
{
  const maaler = () => page.evaluate(() => parseFloat(document.querySelector('.maaler[data-b="mad"] i').style.width));
  const foer = (await hjem()).behov.mad, maalerFoer = await maaler();
  await tik(180);
  const efter = (await hjem()).behov.mad;
  assert.ok(efter < foer - 10, `man bliver sulten (${foer.toFixed(0)} → ${efter.toFixed(0)})`);
  assert.ok(await maaler() < maalerFoer, 'og måleren følger med ned');
  assert.match(await page.locator('#uret').textContent(), /Dag 1 · 11\.00/, 'uret er gået tre timer frem');
}

/* ---------- Tryk på et møbel: figuren går derhen og bruger det ---------- */
{
  await page.evaluate(() => { window.GAME.hjem.behov.energi = 15; window.GAME.opdater(); });
  const seng = (await hjem()).ting.find(t => t.id === 'seng');
  await trykFelt(seng.x, seng.y);
  assert.equal((await state()).hjem.figur.vej.length > 0, true, 'figuren er på vej hen til sengen');
  await tik(30);
  assert.equal((await hjem()).handling.slags, 'ting', 'og er gået i seng');
  await page.screenshot({ path: SHOTS + 'mitliv-sover.png' });
  await tik(180);
  assert.ok((await hjem()).behov.energi > 90, 'der bliver sovet ud');
}

/* ---------- På arbejde: væk i seks timer, hjem med penge ---------- */
{
  await page.evaluate(() => {
    const h = window.GAME.hjem;
    h.minut = 24 * 60 + 8 * 60;                    // dag 2, kl. 8
    h.job.sidsteDag = 1;
    for (const b of Object.keys(h.behov)) h.behov[b] = 95;
    window.GAME.opdater();
  });
  const penge = (await hjem()).penge;
  assert.equal(await page.locator('#arbejdBtn').isDisabled(), false, 'bussen kører om morgenen');
  await page.click('#arbejdBtn');
  assert.equal(await page.locator('#arbejdskort').isVisible(), true, 'man er på arbejde');
  await page.screenshot({ path: SHOTS + 'mitliv-arbejde.png' });
  assert.equal(await page.locator('#arbejdBtn').isDisabled(), true, 'og kan ikke tage af sted to gange');
  await tik(6 * 60);
  const h = await hjem();
  assert.equal(h.arbejde, null, 'hjemme igen');
  assert.ok(h.penge > penge, `med løn i lommen (${penge} → ${h.penge})`);
  assert.equal(h.job.stjerner, 2, 'og to stjerner for en god dag');
  assert.match(await page.locator('#besked').textContent(), /kr/, 'skærmen siger hvad man fik');
  assert.equal(await page.locator('#arbejdskort').isVisible(), false);
}

/* ---------- Byg om: køb, flyt og sælg ---------- */
{
  await page.evaluate(() => { window.GAME.hjem.penge = 3000; window.GAME.opdater(); });
  await page.click('#bygBtn');
  assert.equal(await page.locator('#bygbakke').isVisible(), true, 'byg-bakken glider frem');
  const varer = await page.locator('.vare').count();
  assert.ok(varer >= 15, `der er noget at vælge imellem (${varer} møbler)`);

  await page.click('.vare[data-vare="tv"]');
  assert.equal(await page.locator('.vare[data-vare="tv"].valgt').count(), 1, 'fjernsynet er valgt');
  await trykFelt(6, 5);
  {
    const h = await hjem();
    assert.equal(h.ting.some(t => t.id === 'tv' && t.x === 6 && t.y === 5), true, 'fjernsynet står på gulvet');
    assert.equal(h.penge, 3000 - 600, 'og er betalt');
  }
  await page.screenshot({ path: SHOTS + 'mitliv-byg.png' });

  // Flyt det: tryk på møblet (så ligger det i hånden) og tryk hvor det skal stå
  await page.click('.vare[data-vare="tv"]');                 // læg valget fra sig igen
  await trykFelt(6, 5);
  assert.ok((await state()).iHaanden, 'fjernsynet er taget op');
  await trykFelt(6, 3);
  assert.equal((await hjem()).ting.some(t => t.id === 'tv' && t.x === 6 && t.y === 3), true, 'og sat et nyt sted');

  // Sælg det igen for det halve
  await trykFelt(6, 3);
  assert.equal(await page.locator('#saelgBtn').isVisible(), true, '«Sælg» kommer frem, når man har noget i hånden');
  await page.click('#saelgBtn');
  {
    const h = await hjem();
    assert.equal(h.ting.some(t => t.id === 'tv'), false, 'fjernsynet er solgt');
    assert.equal(h.penge, 3000 - 600 + 300, 'for det halve');
  }

  // Man kan ikke stille noget i døren
  await page.click('.vare[data-vare="plante"]');
  await trykFelt(4, 7);
  assert.equal((await hjem()).ting.some(t => t.id === 'plante'), false, 'døren skal kunne bruges');
  assert.match(await page.locator('#besked').textContent(), /plads|dør/i);
  await page.click('#bygFaerdig');
  assert.equal(await page.locator('#bygbakke').isVisible(), false, 'byg-bakken kan lukkes igen');
}

/* ---------- Telefonen henter en ven på besøg ---------- */
{
  await page.evaluate(() => {
    const g = window.GAME;
    g.hjem.penge = 1000;
    g.hjem.behov.selskab = 10;
    g.byg(true); g.vaelgVare('telefon'); g.bygTryk(6, 6); g.byg(false);
  });
  const nr = await page.evaluate(() => window.GAME.hjem.ting.findIndex(t => t.id === 'telefon'));
  await trykFelt(6, 6);
  await tik(60);
  const g = (await hjem()).gaest;
  assert.ok(g && g.kommet, 'der kommer en ven på besøg');
  assert.ok(nr >= 0);
  await trykFelt(g.x, g.y);
  await tik(40);
  assert.ok((await hjem()).behov.selskab > 40, 'og så er man ikke ensom længere');
  await page.screenshot({ path: SHOTS + 'mitliv.png' });
}

/* ---------- Forfremmelse popper toplisten op ---------- */
{
  await page.evaluate(() => {
    const h = window.GAME.hjem;
    h.job.stjerner = 2;                            // én god dag fra næste trin
    h.minut = 3 * 24 * 60 + 8 * 60;
    h.job.sidsteDag = 2;
    for (const b of Object.keys(h.behov)) h.behov[b] = 95;
    window.GAME.opdater();
  });
  await page.click('#arbejdBtn');
  await tik(6 * 60);
  const h = await hjem();
  assert.equal(h.job.niveau, 1, 'man er blevet forfremmet');
  assert.equal(await page.locator('#toplisteArk.on').isVisible(), true, 'og toplisten popper op');
  assert.match(await page.locator('#hsTitel').textContent(), /Formue/);

  await page.waitForFunction(() => /Selma/.test(document.getElementById('hsPanel').textContent), null, { timeout: 4000 });
  assert.equal(sendte.length, 1, 'formuen er sendt ind én gang');
  assert.equal(sendte[0].navn, 'Selma');
  assert.equal(sendte[0].score, Math.round(h.bedste), 'og det er formuen, der måles');
  await page.screenshot({ path: SHOTS + 'mitliv-topliste.png' });
  await page.click('#hsLuk');
  assert.equal(await page.locator('#toplisteArk.on').isVisible(), false);
}

/* ---------- Huset huskes efter en genindlæsning ---------- */
{
  await page.evaluate(() => window.GAME.gemNu());
  const foer = await hjem();
  await page.reload();
  await page.waitForFunction(() => !!window.GAME);
  await page.evaluate(() => window.GAME.pause());
  assert.equal(await page.locator('#start.on').isVisible(), true, 'man lander på startskærmen');
  assert.match(await page.locator('#startTekst').textContent(), /Selma/, 'huset venter');
  assert.equal(await page.locator('#fortsaetBtn').isVisible(), true, 'og man kan gå direkte tilbage');
  await page.click('#fortsaetBtn');
  const nu = await hjem();
  assert.equal(nu.navn, 'Selma');
  assert.equal(nu.udseende.hud, 2, 'figuren ser ud som den gjorde');
  assert.equal(nu.penge, Math.round(foer.penge));
  assert.equal(nu.job.niveau, foer.job.niveau, 'jobbet er husket');
  assert.deepEqual(nu.ting.map(t => t.id).sort(), foer.ting.map(t => t.id).sort(), 'møblerne står der stadig');
}

/* ---------- Aktivitet meldt til forsiden ---------- */
assert.ok(api.log.aktivitet.some(a => a.spil === 'mitliv' && a.ny === true), 'spillet melder én start');

/* ---------- Passer på en iPad på tværs ---------- */
{
  const pad = await browser.newContext({ ...devices['iPad (gen 7) landscape'] });
  const p2 = await pad.newPage();
  await mockApi(p2);
  await p2.goto(`${BASE}/spil/mitliv/?seed=7`);
  await p2.waitForFunction(() => !!window.GAME);
  await p2.click('#startBtn');
  await p2.waitForTimeout(400);
  const knap = await p2.locator('#bygBtn').boundingBox();
  assert.ok(knap.height >= 44, 'knapperne er store nok til en finger');
  assert.ok(await p2.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'ingen vandret scroll på iPad');
  await p2.screenshot({ path: SHOTS + 'mitliv-ipad.png' });
  await pad.close();
}

/* ---------- Ingen vandret scroll, ingen fejl ---------- */
assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'ingen vandret scroll');
assert.deepEqual(errors, [], 'ingen console-fejl');
await browser.close();
console.log('OK mitliv');
