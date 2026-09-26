// Kør:  PLAYWRIGHT=/Users/lars/Projekter/DungeonCrawler/node_modules/playwright/index.mjs node test/slotskamp.test.mjs
// (kræver at en lokal server kører: python3 -m http.server 4195 -d public)
//
// Spiller «Slotskamp» igennem: startskærm → vælg et kort og sæt en tropp →
// modstanderen svarer igen → kongetårnet vælter → slutskærm, stime og topliste.
// API'erne kører i hukommelsen (test/api-mock.mjs).
import assert from 'node:assert/strict';
import { mockApi } from './api-mock.mjs';
const { chromium, devices } = await import(process.env.PLAYWRIGHT ?? 'playwright');
const BASE = process.env.BASE ?? 'http://localhost:4195';
const SHOTS = new URL('./shots/', import.meta.url).pathname;

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 13'] });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

// Tom topliste, så en hvilken som helst stime kvalificerer
const sendte = [];
const api = await mockApi(page);
await page.route('**/api/highscore/**', async route => {
  const req = route.request();
  if (req.method() === 'POST') {
    const krop = req.postDataJSON(); sendte.push(krop);
    return route.fulfill({ json: { ok: true, id: 1, token: 'abc', placering: 1, liste: [{ id: 1, navn: krop.navn, score: krop.score, oprettet: '2026-09-12T12:00:00.000Z' }] } });
  }
  return route.fulfill({ json: { spil: 'slotskamp', retning: 'desc', min: 1, maks: 200, unik: true, liste: [] } });
});

await page.goto(`${BASE}/spil/slotskamp/?seed=7`);
await page.waitForFunction(() => !!window.GAME);
const state = () => page.evaluate(() => window.GAME.state);
const tryk = async p => { await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.up(); };
const trykKort = async nr => tryk(await page.evaluate(n => window.GAME.kortPx(n), nr));
const trykBane = async (x, y) => tryk(await page.evaluate(([a, b]) => window.GAME.banePx(a, b), [x, y]));

/* ---------- Startskærmen ---------- */
assert.equal(await page.locator('#startScreen.on').isVisible(), true, 'startskærmen vises');
assert.equal(await page.locator('#haand').isVisible(), false, 'hånden kommer først, når kampen går i gang');
await page.waitForFunction(() => document.querySelector('#hsListe .hs-titel'), null, { timeout: 4000 });
assert.match(await page.locator('#hsListe').textContent(), /sejre i træk/i, 'toplisten står på startskærmen');
assert.match(await page.locator('.lavet').textContent(), /Selma/, 'der står hvem der fandt på spillet');
assert.equal(await page.locator('#modstanderVal').textContent(), 'Nybegynder', 'man begynder mod den nemme');
assert.equal((await page.locator('#kortliste div').count()), 8, 'alle otte kort er forklaret');

// Spil-knappen skal kunne nås uden at rulle (startskærmen må ikke blive for høj)
{
  const plads = await page.evaluate(() => {
    const b = document.getElementById('startBtn').getBoundingClientRect();
    return { bund: b.bottom, skærm: innerHeight };
  });
  assert.ok(plads.bund <= plads.skærm, `Spil-knappen ligger uden for skærmen (${plads.bund} > ${plads.skærm})`);
}
await page.screenshot({ path: SHOTS + 'slotskamp-start.png' });

// Navnet skrives på startskærmen (som i Obby), så rekorden kan sendes af sig selv
await page.click('#nameBtn');
await page.fill('#nameInput', 'Selma');
await page.click('#nameForm button[type=submit]');
assert.equal(await page.evaluate(() => localStorage.getItem('zydy.navn')), 'Selma', 'navnet huskes til de andre spil');

/* ---------- Kampen går i gang ---------- */
await page.click('#startBtn');
{
  const st = await state();
  assert.equal(st.fase, 'kamp');
  // Et billede kan nå at tikke mellem trykket og aflæsningen, når maskinen har travlt – så lidt over fem er også fem
  assert.ok(st.magi >= 5 && st.magi < 5.2, `man starter med fem magi (${st.magi})`);
  assert.equal(st.hånd.length, 4, 'fire kort på hånden');
  assert.equal(st.kroner.ned, 0);
  assert.equal(st.niveau, 0, 'den nemme modstander');
  assert.equal(await page.locator('#haand').isVisible(), true, 'hånden er fremme');
  assert.equal((await page.locator('.kortknap').count()), 4);
  assert.equal(await page.locator('#startScreen.on').count(), 0, 'startskærmen er væk');
}

/* ---------- Vælg et kort og sæt troppen ---------- */
await page.evaluate(() => window.GAME.saetOp({ hånd: ['ridder', 'skeletter', 'ildkugle', 'kanon'], magi: 10 }));
{
  await trykKort(0);
  assert.equal((await state()).valgt, 'ridder', 'kortet er valgt');
  assert.equal(await page.locator('.kortknap.valgt').count(), 1, 'og det kan ses på knappen');

  await trykBane(26, 140);                      // egen halvdel, venstre bane
  const st = await state();
  assert.equal(st.enheder.length, 1, 'Ridderen står på banen');
  assert.equal(st.enheder[0].side, 'ned');
  assert.ok(Math.abs(st.enheder[0].x - 26) < 4 && Math.abs(st.enheder[0].y - 140) < 4, 'der hvor man trykkede');
  assert.equal(st.magi, 7, 'og han kostede tre magi');
  assert.equal(st.valgt, null, 'kortet slap hånden');
  assert.notEqual(st.hånd[0], 'ridder', 'et nyt kort tog pladsen');
  assert.equal(await page.locator('#magiTal').textContent(), '7', 'magien står i bjælken');
}

/* ---------- Man kan ikke sætte tropper på modstanderens halvdel ---------- */
{
  await page.evaluate(() => window.GAME.saetOp({ hånd: ['ridder', 'skeletter', 'ildkugle', 'kanon'], magi: 10 }));
  const før = (await state()).enheder.length;
  await trykKort(0);
  await trykBane(26, 40);                       // ovre hos modstanderen
  assert.equal((await state()).enheder.length, før, 'der kom ingen tropp');
  assert.match(await page.locator('#besked').textContent(), /egen halvdel/, 'og man får det at vide');
  assert.equal((await state()).valgt, 'ridder', 'kortet er der stadig, så man kan prøve igen');
}

/* ---------- Et tryllekort må gerne kastes derover ---------- */
{
  await trykKort(2);                            // ildkugle
  assert.equal((await state()).valgt, 'ildkugle');
  const konge = await page.evaluate(() => window.GAME.state.tårne.find(t => t.side === 'op' && t.slags === 'konge'));
  await trykBane(50, 14);
  const st = await state();
  const efter = st.tårne.find(t => t.side === 'op' && t.slags === 'konge');
  assert.ok(efter.hp < konge.hp, 'ilden ramte kongetårnet');
  assert.equal(efter.vågen, true, 'og vækkede kongen');
}

/* ---------- Uden et valgt kort sker der ingenting ---------- */
{
  const før = (await state()).enheder.length;
  await trykBane(50, 150);
  assert.equal((await state()).enheder.length, før, 'et tryk uden kort sætter ingenting');
  assert.match(await page.locator('#besked').textContent(), /Vælg et kort/, 'man bliver mindet om at vælge et kort');
}

/* ---------- Tiden går, magien fyldes, og modstanderen svarer igen ---------- */
{
  await page.evaluate(() => window.GAME.saetOp({ magi: 0 }));
  let sågBot = false;
  for (let i = 0; i < 12 && !sågBot; i++) {
    const st = await page.evaluate(() => window.GAME.frem(5));
    sågBot = st.enheder.some(e => e.side === 'op') || st.kroner.op > 0;
  }
  assert.ok(sågBot, 'modstanderen sætter selv tropper ind');
  const st = await state();
  assert.ok(st.magi > 0, 'magien er fyldt op undervejs');
  assert.ok(st.tid < 120, 'uret går');
  assert.match(await page.locator('#tidVal').textContent(), /^\d:\d\d$/, 'tiden står i toppen');
  await page.screenshot({ path: SHOTS + 'slotskamp.png' });
}

/* ---------- Vælter man kongetårnet, er kampen vundet ---------- */
{
  await page.evaluate(() => {
    window.GAME.saetOp({ side: 'op', kongeHp: 80, hånd: ['ildkugle', 'lyn', 'ridder', 'kanon'], magi: 10 });
  });
  await trykKort(0);
  await trykBane(50, 14);
  await page.waitForTimeout(150);
  const st = await state();
  assert.equal(st.fase, 'slut');
  assert.equal(st.slut.vinder, 'ned');
  assert.equal(st.kroner.ned, 3, 'kongetårnet giver alle tre kroner');
  assert.equal(st.stime, 1, 'første sejr i træk');
  assert.equal(await page.locator('#slutScreen.on').isVisible(), true, 'slutskærmen kommer frem');
  assert.equal(await page.locator('#slutTitel').textContent(), 'Du vandt!');
  assert.match(await page.locator('#slutKroner').textContent(), /3 – 0/, 'kronerne står på slutskærmen');
  assert.equal(await page.locator('#nyRekord').isVisible(), true, 'og det var en ny rekord');
  assert.equal(await page.evaluate(() => localStorage.getItem('zydy.slotskamp.best')), '1', 'rekorden huskes');
  assert.equal(await page.locator('#haand').isVisible(), false, 'hånden pakkes væk');
  await page.waitForFunction(() => /Selma/.test(document.getElementById('hsSlut').textContent), null, { timeout: 4000 });
  assert.ok(sendte.some(s => s.navn === 'Selma' && s.score === 1), 'stimen sendes selv til toplisten');
  assert.ok(sendte.every(s => Number.isInteger(s.score) && s.score > 0), 'og det er altid et rigtigt tal, der sendes');
  await page.screenshot({ path: SHOTS + 'slotskamp-slut.png' });
}

/* ---------- Løber tiden ud med færrest kroner, taber man, og stimen starter forfra ---------- */
{
  await page.click('#igenBtn');
  assert.equal((await state()).fase, 'kamp', 'ny kamp');
  await page.evaluate(() => window.GAME.saetOp({ tid: 1, kroner: { ned: 0, op: 1 } }));
  await page.evaluate(() => window.GAME.frem(2));
  const st = await state();
  assert.equal(st.slut.vinder, 'op');
  assert.equal(st.slut.grund, 'tid', 'tiden løb ud');
  assert.equal(st.stime, 0, 'stimen starter forfra');
  assert.equal(await page.locator('#slutTitel').textContent(), 'Du tabte');
  assert.equal(await page.locator('#nyRekord').isVisible(), false, 'ingen ny rekord af at tabe');
}

/* ---------- Modstanderen bliver hårdere, jo længere stimen er ---------- */
{
  await page.click('#menuBtn');
  assert.equal(await page.locator('#startScreen.on').isVisible(), true, 'tilbage i menuen');
  assert.equal(await page.locator('#stimeVal').textContent(), '0');
  await page.evaluate(() => window.GAME.saetOp({ stime: 4 }));
  assert.equal(await page.locator('#modstanderVal').textContent(), 'Skarp', 'fire sejre i træk giver en hårdere modstander');
  await page.click('#startBtn');
  assert.equal((await state()).niveau, 2, 'og kampen sættes op mod den');
}

/* ---------- Aktivitet meldt til forsiden ---------- */
assert.ok(api.log.aktivitet.some(a => a.spil === 'slotskamp' && a.ny === true), 'spillet melder én start');

/* ---------- Passer på en iPad på tværs ---------- */
{
  const pad = await browser.newContext({ ...devices['iPad (gen 7) landscape'] });
  const p2 = await pad.newPage();
  await mockApi(p2);
  await p2.goto(`${BASE}/spil/slotskamp/?seed=7`);
  await p2.waitForFunction(() => !!window.GAME);
  await p2.click('#startBtn');
  await p2.evaluate(() => window.GAME.saetOp({ hånd: ['ridder', 'skeletter', 'ildkugle', 'kanon'], magi: 10 }));
  const maal = await p2.evaluate(() => ({
    kort: window.GAME.kortPx(0), bane: window.GAME.banePx(26, 140), h: innerHeight, w: innerWidth,
  }));
  assert.ok(maal.kort.y < maal.h && maal.kort.y > 0, 'hånden kan nås på en iPad');
  assert.ok(maal.bane.x > 0 && maal.bane.x < maal.w, 'banen ligger inde i skærmen');
  await p2.mouse.click(maal.kort.x, maal.kort.y);
  await p2.mouse.click(maal.bane.x, maal.bane.y);
  assert.ok((await p2.evaluate(() => window.GAME.state.enheder.length)) > 0, 'og man kan sætte en tropp dér også');
  assert.ok(await p2.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'ingen vandret scroll på iPad');
  await p2.evaluate(() => window.GAME.frem(20));
  await p2.screenshot({ path: SHOTS + 'slotskamp-ipad.png' });
  await pad.close();
}

/* ---------- Ingen vandret scroll, ingen fejl ---------- */
assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'ingen vandret scroll');
assert.deepEqual(errors, [], 'ingen console-fejl');
await browser.close();
console.log('OK slotskamp');
