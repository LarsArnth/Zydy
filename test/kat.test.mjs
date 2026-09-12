// Kør:  PLAYWRIGHT=/Users/lars/Projekter/DungeonCrawler/node_modules/playwright/index.mjs node test/kat.test.mjs
// (kræver at en lokal server kører: python3 -m http.server 4186 -d public)
//
// Spiller «Min kat» igennem: adopter en killing → mad, leg, børstning og søvn
// → mønter og butik → katten huskes efter genindlæsning → niveau og topliste.
// API'erne kører i hukommelsen (test/api-mock.mjs).
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

// Tom topliste, så et nyt niveau altid kvalificerer og navnet skal skrives
const sendte = [];
const api = await mockApi(page);
await page.route('**/api/highscore/**', async route => {
  const req = route.request();
  if (req.method() === 'POST') {
    const krop = req.postDataJSON(); sendte.push(krop);
    return route.fulfill({ json: { ok: true, id: 1, token: 'abc', placering: 1, liste: [{ id: 1, navn: krop.navn, score: krop.score, oprettet: '2026-09-12T12:00:00.000Z' }] } });
  }
  return route.fulfill({ json: { spil: 'kat', retning: 'desc', min: 1, maks: 50, unik: true, liste: [] } });
});

await page.goto(`${BASE}/spil/kat/?seed=7`);
await page.waitForFunction(() => !!window.GAME);
const state = () => page.evaluate(() => window.GAME.state);
const kat = () => page.evaluate(() => window.GAME.kat);
// Som spillets egen løkke: lad tiden gå i små trin og tegn skærmen om bagefter.
const tik = (sek, trin = 1 / 60) => page.evaluate(([sek, trin]) => {
  for (let t = 0; t < sek; t += trin) window.GAME.tik(trin);
  window.GAME.opdater();
  window.GAME.tegn();
}, [sek, trin]);
// Stuen tegnes normalt af billedløkken, som testen har sat på pause.
const tegn = () => page.evaluate(() => { window.GAME.opdater(); window.GAME.tegn(); });

/* ---------- Startskærmen: vælg en killing ---------- */
assert.equal(await page.locator('#start.on').isVisible(), true, 'startskærmen vises');
assert.equal(await page.locator('#killinger .killing').count(), 3, 'tre killinger at vælge imellem');
await page.waitForFunction(() => document.querySelector('#hsStart .hs-titel'), null, { timeout: 4000 });
assert.match(await page.locator('#hsStart').textContent(), /Største katte/, 'toplisten står på startskærmen');
await page.screenshot({ path: SHOTS + 'kat-start.png' });

await page.click('#killinger .killing:nth-child(2)');
assert.equal((await state()).valgtPels, 'pels-graa', 'man kan vælge en anden killing');
await page.fill('#katNavn', 'Tulle');
await page.click('#adopterBtn');
await page.evaluate(() => window.GAME.pause());          // vi styrer selv tiden herfra

assert.equal(await page.locator('#spil.on').isVisible(), true, 'spilskærmen kommer frem');
assert.equal(await page.locator('#katBrand').textContent(), 'Tulle', 'katten har fået sit navn');
{
  const k = await kat();
  assert.equal(k.navn, 'Tulle');
  assert.equal(k.pels, 'pels-graa');
  assert.equal(k.moenter, 20, 'man starter med lidt lommepenge');
}

/* ---------- Behovene siver, mens man kigger på ---------- */
{
  assert.equal(await page.locator('.maaler').count(), 4, 'der er en måler for hvert behov');
  const maaler = () => page.evaluate(() => parseFloat(document.querySelector('.maaler[data-b="mad"] i').style.width));
  const foer = (await kat()).behov.mad, maalerFoer = await maaler();
  await tik(3600, 1);                                     // en time
  const efter = (await kat()).behov.mad;
  assert.ok(efter < foer - 5, `katten bliver sulten med tiden (${foer.toFixed(0)} → ${efter.toFixed(0)})`);
  assert.ok(await maaler() < maalerFoer, 'og måleren følger med ned');
  assert.match(await page.locator('#besked').textContent(), /Tulle/, 'beskeden fortæller, hvad katten mangler');
}

/* ---------- Mad ---------- */
{
  await page.evaluate(() => { window.GAME.kat.behov.mad = 10; window.GAME.opdater(); });
  await page.click('#madBtn');
  assert.equal((await state()).madISkaal, true, 'maden kommer i skålen');
  await tik(8);                                           // gå derhen og spis op
  const k = await kat();
  assert.equal((await state()).tilstand, 'fri', 'katten er færdig med at spise');
  assert.ok(k.behov.mad > 40, `Tulle blev mæt (${k.behov.mad.toFixed(0)})`);
  assert.ok(k.moenter > 20, `og der kom mønter i kassen (${k.moenter})`);
  assert.equal(await page.locator('#madBtn').isDisabled(), false);
  // En mæt kat kan ikke spise mere
  await page.evaluate(() => { window.GAME.kat.behov.mad = 100; window.GAME.opdater(); });
  assert.equal(await page.locator('#madBtn').isDisabled(), true, 'knappen slår fra, når katten er mæt');
}

/* ---------- Leg med garnnøglet ---------- */
{
  await page.evaluate(() => { window.GAME.kat.behov.leg = 20; window.GAME.opdater(); });
  await page.click('#legBtn');
  assert.equal((await state()).tilstand, 'leger');
  assert.ok((await state()).garn, 'garnnøglet ligger på gulvet');

  // Kast nøglet ved at trykke på gulvet, og lad katten løbe efter det
  const boks = await page.locator('#laerred').boundingBox();
  await page.mouse.click(boks.x + boks.width * 0.2, boks.y + boks.height * 0.9);
  const foer = (await kat()).behov.leg;
  await tik(5);
  const efter = (await kat()).behov.leg;
  assert.ok(efter > foer, `katten fanger nøglet og bliver gladere (${foer.toFixed(0)} → ${efter.toFixed(0)})`);
  assert.equal((await state()).garn, null, 'nøglet er fanget');
  await tegn();
  await page.screenshot({ path: SHOTS + 'kat.png' });
  await page.click('#legStop');
  assert.equal((await state()).tilstand, 'fri', '«Færdig» stopper legen');
}

/* ---------- Børstning ---------- */
{
  await page.evaluate(() => { window.GAME.kat.behov.renhed = 30; window.GAME.opdater(); });
  await page.click('#vaskBtn');
  assert.equal((await state()).tilstand, 'vasker');
  const foer = (await kat()).behov.renhed;
  const r = await page.evaluate(() => window.GAME.boerst(3));
  assert.ok(r.oeget > 0, 'børsten gør katten renere');
  const efter = (await kat()).behov.renhed;
  assert.ok(efter > foer + 10, `pelsen blev pæn (${foer.toFixed(0)} → ${efter.toFixed(0)})`);
  await page.click('#legStop');
  assert.equal((await state()).tilstand, 'fri');
}

/* ---------- Søvn ---------- */
{
  await page.evaluate(() => { window.GAME.kat.behov.energi = 20; window.GAME.opdater(); });
  await page.click('#sovBtn');
  assert.equal((await state()).tilstand, 'sover');
  assert.equal((await kat()).sover, true);
  assert.equal(await page.locator('#madBtn').isDisabled(), true, 'man giver ikke en sovende kat mad');
  await tegn();
  await page.screenshot({ path: SHOTS + 'kat-sover.png' });
  await tik(60);
  const k = await kat();
  assert.ok(k.behov.energi > 99, `katten har sovet ud (${k.behov.energi.toFixed(1)})`);
  assert.equal((await state()).tilstand, 'fri', 'og er vågnet af sig selv');
  assert.equal(k.sover, false);
}

/* ---------- Klap: gør glad, men kan ikke erstatte leg ---------- */
{
  // En lang lur kan i sig selv give et nyt niveau, og så er toplisten glidet op.
  await page.evaluate(() => document.querySelectorAll('.ark.on').forEach(a => a.classList.remove('on')));
  await page.evaluate(() => { window.GAME.kat.behov.leg = 40; });
  const foer = (await kat()).behov.leg, moenter = (await kat()).moenter;
  const boks = await page.locator('#laerred').boundingBox();
  const x = await page.evaluate(() => window.GAME.state.x);
  await page.mouse.click(boks.x + boks.width * (0.14 + 0.72 * x), boks.y + boks.height * 0.7);
  const efter = await kat();
  assert.ok(efter.behov.leg > foer, 'et klap gør katten lidt gladere');
  assert.equal(efter.moenter, moenter, 'men man kan ikke klappe sig til mønter');
  assert.match(await page.locator('#besked').textContent(), /spinder/);
}

/* ---------- Butikken ---------- */
{
  await page.click('#butikBtn');
  assert.equal(await page.locator('#butik.on').isVisible(), true, 'butikken glider op');
  const varer = await page.locator('.vare').count();
  assert.ok(varer >= 15, `der er noget at vælge imellem (${varer} ting)`);

  // For dyr til at begynde med
  await page.evaluate(() => { window.GAME.kat.moenter = 5; window.GAME.opdater(); });
  await page.click('.vare[data-ting="hat-krone"]');
  assert.equal((await kat()).hat, null, 'kronen koster mere, end man har');
  assert.match(await page.locator('#besked').textContent(), /mangler/);

  // Med mønter nok kan man købe og tage på og af
  await page.evaluate(() => { window.GAME.kat.moenter = 200; window.GAME.opdater(); });
  await page.click('.vare[data-ting="hat-krone"]');
  const efterKoeb = await kat();
  assert.equal(efterKoeb.hat, 'hat-krone', 'kronen er købt og taget på');
  assert.equal(efterKoeb.moenter, 70, 'og betalt (200 − 130)');
  await page.screenshot({ path: SHOTS + 'kat-butik.png' });
  await page.click('.vare[data-ting="hat-krone"]');
  assert.equal((await kat()).hat, null, 'et tryk mere tager den af igen');
  await page.click('.vare[data-ting="hat-krone"]');
  await page.click('.vare[data-ting="pels-hvid"]');
  assert.equal((await kat()).pels, 'pels-hvid', 'pelsen kan skiftes');
  await page.click('#butikLuk');
  assert.equal(await page.locator('#butik.on').isVisible(), false, 'butikken kan lukkes igen');
}

/* ---------- Nyt niveau ryger på toplisten ---------- */
{
  await page.evaluate(() => {
    const k = window.GAME.kat;
    k.xp = 29;                     // ét point fra niveau 2 (xpTilNiveau(2) = 30)
    k.behov.mad = 10;
    window.GAME.opdater();
  });
  await page.click('#madBtn');
  await tik(8);
  assert.equal(await page.evaluate(() => window.GAME.niveau()), 2, 'katten er steget et niveau');
  assert.equal(await page.locator('#toplisteArk.on').isVisible(), true, 'toplisten popper op ved nyt niveau');
  assert.match(await page.locator('#hsTitel').textContent(), /Niveau 2/);

  await page.waitForSelector('#hsPanel .hs-input', { timeout: 4000 });
  await page.fill('#hsPanel .hs-input', 'Selma');
  await page.click('#hsPanel .hs-gem');
  await page.waitForFunction(() => /Selma/.test(document.getElementById('hsPanel').textContent), null, { timeout: 4000 });
  assert.deepEqual(sendte, [{ navn: 'Selma', score: 2 }], 'niveauet sendes til toplisten');
  assert.equal(await page.evaluate(() => localStorage.getItem('zydy.navn')), 'Selma', 'navnet huskes til de andre spil');
  await page.screenshot({ path: SHOTS + 'kat-topliste.png' });
  await page.click('#hsLuk');
}

/* ---------- Katten huskes – også at tiden går, mens man er væk ---------- */
{
  const foer = await kat();
  await page.evaluate(() => window.GAME.gemNu());
  // Skru uret tilbage i det gemte, så det ser ud som om, der er gået to timer
  await page.evaluate(() => {
    const g = JSON.parse(localStorage.getItem('zydy.kat.v1'));
    g.sidst -= 2 * 3600 * 1000;
    g.behov.mad = 90;
    localStorage.setItem('zydy.kat.v1', JSON.stringify(g));
    window.GAME.state.kat = null;    // ellers gemmer siden hen over vores pillede data, når den lukkes
  });
  await page.reload();
  await page.waitForFunction(() => !!window.GAME);
  await page.evaluate(() => window.GAME.pause());
  assert.equal(await page.locator('#start.on').isVisible(), true, 'man lander på startskærmen');
  assert.match(await page.locator('#startTekst').textContent(), /Tulle/, 'startskærmen hilser fra katten');
  assert.match(await page.locator('#startPill').textContent(), /Niveau 2/, 'niveauet er husket');
  assert.equal(await page.locator('#fortsaetBtn').isVisible(), true, 'man kan gå direkte tilbage til katten');

  await page.click('#fortsaetBtn');
  const k = await kat();
  assert.equal(k.navn, 'Tulle', 'det er den samme kat');
  assert.equal(k.pels, 'pels-hvid', 'med den pels, den fik i butikken');
  assert.deepEqual(k.ejer.sort(), ['hat-krone', 'pels-hvid'], 'og det købte er stadig købt');
  assert.equal(k.moenter, foer.moenter, 'mønterne er der også');
  assert.ok(k.behov.mad < 80 && k.behov.mad > 65, `sulten er kommet, mens vi var væk (${k.behov.mad.toFixed(0)})`);
}

/* ---------- Aktivitet meldt til forsiden ---------- */
assert.ok(api.log.aktivitet.some(a => a.spil === 'kat' && a.ny === true), 'spillet melder én start');

/* ---------- Passer på en iPad på tværs ---------- */
{
  const pad = await browser.newContext({ ...devices['iPad (gen 7) landscape'] });
  const p2 = await pad.newPage();
  await mockApi(p2);
  await p2.goto(`${BASE}/spil/kat/?seed=7`);
  await p2.waitForFunction(() => !!window.GAME);
  await p2.click('#adopterBtn');
  await p2.waitForTimeout(400);
  const knap = await p2.locator('#madBtn').boundingBox();
  assert.ok(knap.height >= 44, 'knapperne er store nok til en finger');
  assert.ok(await p2.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'ingen vandret scroll på iPad');
  await p2.screenshot({ path: SHOTS + 'kat-ipad.png' });
  await pad.close();
}

/* ---------- Ingen vandret scroll, ingen fejl ---------- */
assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'ingen vandret scroll');
assert.deepEqual(errors, [], 'ingen console-fejl');
await browser.close();
console.log('OK kat');
