// Kør:  PLAYWRIGHT=/Users/lars/Projekter/DungeonCrawler/node_modules/playwright/index.mjs node test/galge.test.mjs
// (kræver at en lokal server kører: python3 -m http.server 4193 -d public)
//
// Spiller «Galgespil» igennem: startskærm → et ord gættes med tasterne på
// skærmen og det rigtige tastatur → manden reddes → næste ord → et svært
// niveau, hvor galgen står fra start → manden bliver hængt → slutskærm og
// topliste → et ord fra en ven. Til sidst på en iPad på tværs.
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

// Tom topliste, så enhver stime kvalificerer og navneformularen dukker op til sidst
const sendte = [];
const api = await mockApi(page);
await page.route('**/api/highscore/**', async route => {
  const req = route.request();
  if (req.method() === 'POST') {
    const krop = req.postDataJSON(); sendte.push(krop);
    return route.fulfill({ json: { ok: true, id: 1, token: 'abc', placering: 1, liste: [{ id: 1, navn: krop.navn, score: krop.score, oprettet: '2026-09-26T12:00:00.000Z' }] } });
  }
  return route.fulfill({ json: { spil: 'galge', retning: 'desc', min: 1, maks: 1000, liste: [] } });
});

await page.goto(`${BASE}/spil/galge/?seed=3`);
await page.waitForFunction(() => !!window.GAME);
const state = () => page.evaluate(() => window.GAME.state);
const tast = b => page.click(`.tast[data-b="${b}"]`);
const felter = () => page.$$eval('#ordEl .felt', fs => fs.map(f => f.textContent));

/* ---------- Startskærmen ---------- */
assert.equal(await page.locator('#startScreen.on').isVisible(), true, 'startskærmen vises');
assert.equal((await state()).fase, 'menu');
await page.waitForFunction(() => document.querySelector('#hsStart .hs-titel'), null, { timeout: 4000 });
assert.match(await page.locator('#hsStart').textContent(), /Topliste/, 'toplisten hentes på startskærmen');
{
  const plads = await page.evaluate(() => ({
    start: document.getElementById('startBtn').getBoundingClientRect().bottom,
    ven: document.getElementById('venBtn').getBoundingClientRect().bottom,
    skaerm: innerHeight,
  }));
  assert.ok(plads.start <= plads.skaerm && plads.ven <= plads.skaerm,
    `begge knapper kan nås uden at rulle (${plads.start}/${plads.ven} > ${plads.skaerm})`);
}
await page.screenshot({ path: SHOTS + 'galge-start.png' });

/* ---------- Et ord: tasterne på skærmen ---------- */
await page.click('#startBtn');
{
  const st = await state();
  assert.equal(st.fase, 'spil');
  assert.equal(st.niveau, 1);
  assert.equal(st.liv, 10, 'på første niveau bygges hele galgen');
  assert.equal((await felter()).length, st.ord.length, 'én streg pr. bogstav');
  assert.ok((await felter()).every(f => f === ''), 'ordet er skjult');
  assert.match(await page.locator('#katEl').textContent(), /\S+ \S+/, 'kategorien står øverst');
  assert.equal(await page.locator('.tast').count(), 29, 'hele alfabetet med ÆØÅ');
}
// Et bestemt ord, så testen ved, hvad der er rigtigt
await page.evaluate(() => window.GAME.saetOrd('ELEFANT', 'dyr'));
assert.match(await page.locator('#katEl').textContent(), /Dyr/);
await tast('E');
assert.deepEqual(await felter(), ['E', '', 'E', '', '', '', ''], 'E kommer frem begge steder');
assert.equal(await page.locator('.tast[data-b="E"].rigtig:disabled').count(), 1, 'tasten bliver grøn og kan ikke trykkes igen');
assert.deepEqual((await state()).dele, [], 'et rigtigt bogstav tegner ingenting');
await tast('Q');
{
  const st = await state();
  assert.deepEqual(st.forkerte, ['Q']);
  assert.deepEqual(st.dele, ['jord']);
  assert.equal(await page.locator('#galge [data-del="jord"].vis').count(), 1, 'jorden er tegnet');
  assert.equal(await page.locator('#galge [data-del="stolpe"].vis').count(), 0, 'men ikke stolpen endnu');
  assert.equal(await page.locator('.tast[data-b="Q"].forkert:disabled').count(), 1);
  assert.equal((await page.locator('#hjerter .h').textContent()).length, 9, 'ni hjerter tilbage');
}
// Det rigtige tastatur virker også (til dem, der spiller på computer)
await page.keyboard.press('l');
assert.deepEqual(await felter(), ['E', 'L', 'E', '', '', '', '']);
await page.keyboard.press('q');
assert.equal((await state()).forkerte.length, 1, 'samme forkerte bogstav koster ikke to gange');

/* ---------- Manden reddes ---------- */
for (const b of 'FAN') await tast(b);
await page.keyboard.press('t');
{
  const st = await state();
  assert.equal(st.status, 'vundet');
  assert.equal(st.fase, 'vundet');
  assert.equal(st.stime, 1);
  assert.equal(await page.locator('#bjaelke').isVisible(), true, 'bjælken kommer frem over tasterne');
  assert.match(await page.locator('#bjTitel').textContent(), /reddede ham/);
  assert.match(await page.locator('#bjUnder').textContent(), /1 ord i træk/);
  assert.equal(await page.locator('#galge.fri').count(), 1, 'manden er fri');
  assert.equal(await page.getAttribute('#galge', 'data-ansigt'), 'fri');
  assert.equal(await page.evaluate(() => localStorage.getItem('zydy.galge.best')), '1', 'rekorden huskes');
  assert.match(await page.locator('#stimeEl').textContent(), /I træk 1/);
  await page.waitForTimeout(600);
  await page.screenshot({ path: SHOTS + 'galge.png' });
}

/* ---------- Næste ord ---------- */
await page.click('#bjVidere');
{
  const st = await state();
  assert.equal(st.fase, 'spil');
  assert.equal(st.stime, 1, 'stimen fortsætter');
  assert.notEqual(st.ord, 'ELEFANT');
  assert.equal(await page.locator('#bjaelke').isVisible(), false);
  assert.equal(await page.locator('#galge.fri').count(), 0);
  const brugt = await page.evaluate(() => JSON.parse(localStorage.getItem('zydy.galge.brugt')));
  assert.ok(brugt.includes(st.ord), 'ordet huskes, så det ikke kommer igen lige med det samme');
}

/* ---------- Et langt ord kan være på skærmen ---------- */
await page.evaluate(() => window.GAME.saetOrd('STRØMPEBUKSER', 'toej'));
{
  const b = await page.evaluate(() => {
    const o = document.getElementById('ordEl').getBoundingClientRect();
    const fs = [...document.querySelectorAll('#ordEl .felt')].map(f => f.getBoundingClientRect());
    return { venstre: Math.min(...fs.map(f => f.left)), hoejre: Math.max(...fs.map(f => f.right)), o, raekker: new Set(fs.map(f => Math.round(f.top))).size };
  });
  assert.ok(b.venstre >= b.o.left - 1 && b.hoejre <= b.o.right + 1, 'et langt ord går ikke ud over kanten');
  assert.equal(b.raekker, 1, 'og står på én linje');
}

/* ---------- Et svært niveau: galgen står der fra start ---------- */
await page.evaluate(() => { window.GAME.saetStime(10); window.GAME.saetOrd('KAT', 'dyr'); });
{
  const st = await state();
  assert.equal(st.niveau, 4);
  assert.equal(st.liv, 6);
  assert.deepEqual(st.dele, ['jord', 'stolpe', 'bjaelke', 'reb'], 'kun manden mangler');
  assert.equal(await page.locator('#galge [data-del="reb"].vis').count(), 1);
  assert.equal((await page.locator('#hjerter .h').textContent()).length, 6);
}

/* ---------- Manden bliver hængt – slutskærm og topliste ---------- */
for (const b of 'BCDEF') await tast(b);
assert.equal(await page.getAttribute('#galge', 'data-ansigt'), 'bange', 'han bliver bange, når der er få forsøg tilbage');
assert.equal(await page.locator('#galge.spil').count(), 1, 'og hænger og svinger');
await page.waitForTimeout(450);                    // lad de sidste dele tone frem
await page.screenshot({ path: SHOTS + 'galge-haenger.png' });
await tast('G');
{
  const st = await state();
  assert.equal(st.status, 'tabt');
  assert.deepEqual(st.dele, st.konst.DELE, 'hele manden er tegnet');
  assert.deepEqual(await felter(), ['K', 'A', 'T'], 'ordet vises');
  assert.equal(await page.locator('#ordEl .felt.mangler').count(), 3, 'med røde bogstaver');
  assert.equal(await page.getAttribute('#galge', 'data-ansigt'), 'tabt');
  assert.equal(await page.locator('.tast:disabled').count(), 29, 'man kan ikke gætte mere');
}
await page.waitForSelector('#slutScreen.on', { timeout: 4000 });
assert.match(await page.locator('#slutOrd').textContent(), /Ordet var KAT/);
assert.match(await page.locator('#slutStime').textContent(), /^10 ord i træk$/);
await page.waitForSelector('#hsSlut .hs-input', { timeout: 4000 });
await page.fill('#hsSlut .hs-input', 'Megi');
await page.click('#hsSlut .hs-gem');
await page.waitForFunction(() => /Megi/.test(document.getElementById('hsSlut').textContent), null, { timeout: 4000 });
assert.deepEqual(sendte, [{ navn: 'Megi', score: 10 }], 'stimen sendes til toplisten');
await page.screenshot({ path: SHOTS + 'galge-slut.png' });

/* ---------- Prøv igen ---------- */
await page.click('#igenBtn');
{
  const st = await state();
  assert.equal(st.fase, 'spil');
  assert.equal(st.stime, 0, 'forfra med en ny stime');
  assert.equal(st.niveau, 1);
  assert.equal(await page.locator('#slutScreen.on').count(), 0);
}

/* ---------- Find på et ord til en ven ---------- */
await page.click('#menuBtn');
assert.equal(await page.locator('#startScreen.on').isVisible(), true);
await page.click('#venBtn');
assert.equal(await page.locator('#venScreen.on').isVisible(), true);
await page.click('#venStart');
assert.match(await page.locator('#venFejl').textContent(), /mindst to bogstaver/, 'uden ord kan man ikke starte');
await page.fill('#venOrd', 'Rød bil!');
assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById('venOrd')).webkitTextSecurity), 'disc', 'ordet er skjult, mens man skriver');
await page.click('#venVis');
assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById('venOrd')).webkitTextSecurity), 'none', '«Vis ordet» viser det');
await page.fill('#venHjaelp', 'noget der kører');
await page.click('#venStart');
{
  const st = await state();
  assert.equal(st.tilstand, 'ven');
  assert.equal(st.ord, 'RØD BIL', 'ordet er renset');
  assert.equal(st.liv, 10);
  assert.deepEqual(await felter(), ['', '', '', '', '', '', '']);
  assert.equal(await page.locator('#ordEl .felt.mellemrum').count(), 1, 'mellemrummet er ikke en streg');
  assert.match(await page.locator('#katEl').textContent(), /noget der kører/, 'hintet står øverst');
  assert.equal(await page.locator('#stimeEl').isVisible(), false, 'ingen stime, når en ven har fundet på ordet');
}
for (const b of 'RØDBIL') await tast(b);
{
  const st = await state();
  assert.equal(st.status, 'vundet');
  assert.match(await page.locator('#bjUnder').textContent(), /Uden et eneste forkert/);
  assert.equal(await page.locator('#bjMenu').isVisible(), true);
  assert.equal(await page.locator('#bjVidere').textContent(), 'Nyt ord');
  assert.deepEqual(sendte.length, 1, 'et ord fra en ven kommer ikke på toplisten');
}
await page.click('#bjVidere');
assert.equal(await page.locator('#venScreen.on').isVisible(), true, '«Nyt ord» går tilbage til den hemmelige skrivning');
assert.equal(await page.inputValue('#venOrd'), '', 'og det gamle ord er væk');
await page.fill('#venOrd', 'zydy');
await page.press('#venOrd', 'Enter');
await page.press('#venHjaelp', 'Enter');
assert.equal((await state()).ord, 'ZYDY', 'Enter starter også');
{
  const st = await page.evaluate(() => window.GAME.bot());
  assert.ok(['vundet', 'tabt'].includes(st.status));
  assert.equal(await page.locator('#bjaelke').isVisible(), true, 'også et tabt ord fra en ven får bjælken');
}

/* ---------- Tasterne kan nås, galgen har plads ---------- */
await page.click('#bjMenu');
await page.click('#startBtn');
{
  const m = await page.evaluate(() => {
    const t = [...document.querySelectorAll('.tast')].map(x => x.getBoundingClientRect());
    const g = document.getElementById('galge').getBoundingClientRect();
    return { bund: Math.max(...t.map(r => r.bottom)), mindst: Math.min(...t.map(r => Math.min(r.width, r.height))), galge: g.height, h: innerHeight };
  });
  assert.ok(m.bund <= m.h, `tasterne går ud over skærmen (${m.bund} > ${m.h})`);
  assert.ok(m.mindst >= 36, `tasterne er for små til en finger (${m.mindst})`);
  assert.ok(m.galge >= 150, `galgen er for lille (${m.galge})`);
}

/* ---------- Aktivitet meldt til forsiden ---------- */
assert.ok(api.log.aktivitet.some(a => a.spil === 'galge' && a.ny === true), 'spillet melder én start');

/* ---------- Passer på en iPad på tværs ---------- */
{
  const pad = await browser.newContext({ ...devices['iPad (gen 7) landscape'] });
  const p2 = await pad.newPage();
  const padFejl = [];
  p2.on('pageerror', e => padFejl.push(String(e)));
  await mockApi(p2);
  await p2.goto(`${BASE}/spil/galge/?seed=3`);
  await p2.waitForFunction(() => !!window.GAME);
  await p2.click('#startBtn');
  await p2.evaluate(() => window.GAME.saetOrd('PINGVIN', 'dyr'));
  for (const b of 'PIXZ') await p2.click(`.tast[data-b="${b}"]`);
  const m = await p2.evaluate(() => {
    const t = [...document.querySelectorAll('.tast')].map(x => x.getBoundingClientRect());
    return { bund: Math.max(...t.map(r => r.bottom)), h: innerHeight, sw: document.documentElement.scrollWidth, w: innerWidth };
  });
  assert.ok(m.bund <= m.h, 'tasterne kan nås på iPad');
  assert.ok(m.sw <= m.w, 'ingen vandret scroll på iPad');
  await p2.waitForTimeout(400);
  await p2.screenshot({ path: SHOTS + 'galge-ipad.png' });
  assert.deepEqual(padFejl, [], 'ingen fejl på iPad');
  await pad.close();
}

/* ---------- Ingen vandret scroll, ingen fejl ---------- */
assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'ingen vandret scroll');
assert.deepEqual(errors, [], 'ingen console-fejl');
await browser.close();
console.log('OK galge');
