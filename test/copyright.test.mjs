// Kør:  PLAYWRIGHT=/Users/lars/Projekter/DungeonCrawler/node_modules/playwright/index.mjs node test/copyright.test.mjs
// (kræver at en lokal server kører: python3 -m http.server 4197 -d public)
//
// Spiller et helt parti Copyright igennem med tre spillere og to runder:
// Selma tegner med en rigtig finger på lærredet, de to andre får deres streger
// sat direkte, og den tredje tegning stemples af uret. Så gættes der – ét tryk
// på en rigtig chip og resten gennem GAME – og til sidst tjekkes pointene,
// afsløringen («for godt gemt» giver ingenting) og toplisten.
import assert from 'node:assert/strict';
import { mockApi } from './api-mock.mjs';
const { chromium, devices } = await import(process.env.PLAYWRIGHT ?? 'playwright');
const BASE = process.env.BASE ?? 'http://localhost:4197';
const SHOTS = new URL('./shots/', import.meta.url).pathname;   // i den worktree testen køres fra

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 13'] });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

const api = await mockApi(page);
// Tom topliste, så vinderens point altid kvalificerer
const sendte = [];
await page.route('**/api/highscore/**', async route => {
  const req = route.request();
  if (req.method() === 'POST') {
    const krop = req.postDataJSON(); sendte.push(krop);
    return route.fulfill({ json: { ok: true, id: 1, token: 'abc', placering: 1, liste: [{ id: 1, navn: krop.navn, score: krop.score, oprettet: '2026-09-13T12:00:00.000Z' }] } });
  }
  return route.fulfill({ json: { spil: 'copyright', retning: 'desc', min: 1, maks: 1000, unik: true, liste: [] } });
});

await page.goto(`${BASE}/spil/copyright/?seed=5&runder=2`);
await page.waitForFunction(() => !!window.GAME);
const state = () => page.evaluate(() => window.GAME.state);
const skaerm = () => page.evaluate(() => window.GAME.skaerm);

/* ---------- Startskærmen ---------- */
assert.equal(await page.locator('#navne input').count(), 3, 'tre navnefelter fra start');
await page.click('#antalSpillere button[data-n="5"]');
assert.equal(await page.locator('#navne input').count(), 5, 'fem felter når man vælger fem');
await page.click('#antalSpillere button[data-n="3"]');
assert.equal(await page.locator('#navne input').count(), 3);

// Spil-knappen skal kunne nås uden at rulle – ellers finder børnene den ikke
{
  const knap = await page.locator('#btnStart').boundingBox();
  const h = await page.evaluate(() => innerHeight);
  assert.ok(knap.y + knap.height <= h, `Spil-knappen er synlig uden at rulle (${Math.round(knap.y + knap.height)} > ${h})`);
}
await page.screenshot({ path: SHOTS + 'copyright-start.png' });

const navne = ['Selma', 'Sofie', 'Far'];
for (let i = 0; i < navne.length; i++) await page.locator('#navne input').nth(i).fill(navne[i]);
await page.click('#btnStart');

/* ---------- Runde 1: Selma tegner med fingeren ---------- */
assert.equal(await skaerm(), 'giv', 'enheden gives videre, før man tegner');
assert.equal(await page.locator('#givNavn').textContent(), 'Selma');
await page.click('#btnKlar');
assert.equal(await skaerm(), 'tegn');
const motiv = await page.locator('#motiv').textContent();
assert.ok(motiv.length > 5, 'der står et motiv: ' + motiv);
assert.equal(await page.locator('#btnFaerdig').isDisabled(), true, 'man kan ikke stemple en blank side');

{
  // En rigtig finger: et hus i to streger
  const b = await page.locator('#lc').boundingBox();
  const traek = async punkter => {
    await page.mouse.move(b.x + punkter[0][0] * b.width, b.y + punkter[0][1] * b.height);
    await page.mouse.down();
    for (const [x, y] of punkter.slice(1)) await page.mouse.move(b.x + x * b.width, b.y + y * b.height, { steps: 4 });
    await page.mouse.up();
  };
  await traek([[.25, .75], [.25, .40], [.75, .40], [.75, .75], [.25, .75]]);
  await page.click('#farver button[data-f="1"]');
  await traek([[.20, .40], [.50, .18], [.80, .40]]);
}
assert.equal((await page.evaluate(() => window.GAME.streger.length)), 2, 'to streger blev tegnet');
assert.equal(await page.evaluate(() => window.GAME.streger[1].f), 1, 'taget-stregen fik den nye farve');
assert.equal(await page.locator('#btnFaerdig').isDisabled(), false, 'nu kan der stemples');
await page.screenshot({ path: SHOTS + 'copyright-tegn.png' });

await page.click('#btnFortryd');
assert.equal((await page.evaluate(() => window.GAME.streger.length)), 1, 'fortryd tager den sidste streg');
await page.evaluate(() => window.GAME.saetStreger([...window.GAME.streger, { f: 1, t: 3.6, p: [.2, .4, .5, .18, .8, .4] }]));

await page.click('#btnFaerdig');
assert.equal(await skaerm(), 'stempel');
assert.equal(await page.locator('#stempelSegl').textContent(), '© Selma', 'stemplet bærer tegnerens navn');
await page.waitForTimeout(500);
await page.screenshot({ path: SHOTS + 'copyright-stempel.png' });
await page.click('#btnVidere');

/* ---------- Sofie tegner (streger sat direkte) ---------- */
const kruseduller = nr => Array.from({ length: 3 }, (_, i) => ({
  f: (nr + i) % 8, t: i % 2 ? 3.6 : 1.1,
  p: [.15 + i * .1, .2 + nr * .05, .5, .5 + i * .08, .85 - i * .1, .8 - nr * .05],
}));
assert.equal(await page.locator('#givNavn').textContent(), 'Sofie');
await page.click('#btnKlar');
await page.evaluate(s => window.GAME.saetStreger(s), kruseduller(1));
await page.click('#btnFaerdig');
assert.equal(await page.locator('#stempelSegl').textContent(), '© Sofie');
await page.click('#btnVidere');

/* ---------- Far tegner, men tiden løber ud ---------- */
assert.equal(await page.locator('#givNavn').textContent(), 'Far');
await page.click('#btnKlar');
assert.ok(await page.evaluate(() => window.GAME.tid) > 50, 'uret er fuldt ved en ny tegning');
await page.evaluate(s => window.GAME.saetStreger(s), kruseduller(2));
await page.evaluate(() => window.GAME.saetTid(0.2));
await page.waitForFunction(() => window.GAME.skaerm === 'stempel', null, { timeout: 3000 });
assert.equal(await page.locator('#stempelSegl').textContent(), '© Far', 'tiden stempler selv tegningen');
{
  const s = await state();
  assert.equal(s.fase, 'gaet', 'alle har tegnet');
  assert.deepEqual(s.tegninger.map(t => t.ejer), [0, 1, 2]);
  assert.equal(s.tegninger.every(t => t.streger.length > 0), true, 'alle tegninger har streger');
}
await page.click('#btnVidere');

/* ---------- Gætterunden ---------- */
assert.equal(await page.locator('#givNavn').textContent(), 'Selma', 'Selma gætter først');
await page.click('#btnKlar');
assert.equal(await skaerm(), 'gaet');
assert.equal(await page.locator('#gaetKort .kort').count(), 2, 'man ser de andres to tegninger, ikke sin egen');
assert.equal(await page.locator('#gaetKort .kort[data-t="0"]').count(), 0, 'ens egen tegning er ikke med');
assert.equal(await page.locator('#gaetKort .kort[data-t="1"] .chip').count(), 2, 'man kan vælge mellem de to andre');
assert.equal(await page.locator('#gaetKort .chip[data-s="0"]').count(), 0, 'man kan ikke gætte sig selv');
assert.equal(await page.locator('#btnGaetFaerdig').isDisabled(), true);
assert.match(await page.locator('#btnGaetFaerdig').textContent(), /Mangler 2/);

// Selma trykker på en rigtig chip: Sofies tegning er Sofies
await page.click('#gaetKort .chip[data-t="1"][data-s="1"]');
assert.ok(await page.locator('#gaetKort .chip[data-t="1"][data-s="1"]').evaluate(e => e.classList.contains('on')), 'chippen er valgt');
assert.match(await page.locator('#btnGaetFaerdig').textContent(), /Mangler 1/);
await page.evaluate(() => window.GAME.gaet(2, 1));        // Fars tegning gættes til Sofie (forkert)
assert.equal(await page.locator('#btnGaetFaerdig').isDisabled(), false);
await page.screenshot({ path: SHOTS + 'copyright-gaet.png' });
await page.click('#btnGaetFaerdig');

// Sofie: Selmas tegning er Selmas (rigtigt), Fars er Selmas (forkert)
assert.equal(await page.locator('#givNavn').textContent(), 'Sofie');
await page.click('#btnKlar');
await page.evaluate(() => { window.GAME.gaet(0, 0); window.GAME.gaet(2, 0); });
await page.click('#btnGaetFaerdig');

// Far rammer ved siden af begge gange
assert.equal(await page.locator('#givNavn').textContent(), 'Far');
await page.click('#btnKlar');
await page.evaluate(() => { window.GAME.gaet(0, 1); window.GAME.gaet(1, 0); });
await page.click('#btnGaetFaerdig');

/* ---------- Afsløringen ---------- */
assert.equal(await skaerm(), 'afsloer');
assert.equal(await page.locator('#afsloerSegl').textContent(), '©?', 'stemplet er dækket til');
assert.equal(await page.locator('#btnNaeste').isVisible(), false);

let saaForGodtGemt = false;
for (let i = 0; ; i++) {
  const o = await page.evaluate(() => {
    const s = window.GAME.state;
    return s.opgoer[s.afsloer];
  });
  assert.equal(await page.locator('#afsloerSegl').textContent(), '©?');
  await page.click('#btnVis');
  const ejer = navne[o.ejer];
  assert.equal(await page.locator('#afsloerSegl').textContent(), `© ${ejer}`, 'stemplet afsløres');
  const tekst = await page.locator('#afsloerListe').textContent();
  assert.ok(tekst.includes(ejer), 'ejeren står i opgørelsen');
  if (o.rigtige === 0) {
    assert.match(tekst, /for godt gemt, ingen point/, 'ingen fandt tegneren');
    saaForGodtGemt = true;
  } else {
    assert.match(tekst, /\+10/, 'et rigtigt gæt gav point');
  }
  if (i === 0) await page.screenshot({ path: SHOTS + 'copyright-afsloer.png' });
  const s = await state();
  const sidste = s.afsloer >= s.opgoer.length - 1;
  await page.click('#btnNaeste');
  if (sidste) break;
}
assert.equal(saaForGodtGemt, true, 'Fars tegning fandt ingen – og gav ingen point');

/* ---------- Stillingen efter runde 1 ---------- */
assert.equal(await skaerm(), 'stilling');
{
  const point = (await state()).spillere.map(p => p.point);
  // Selma: et rigtigt gæt (10) + en narret (5). Sofie det samme. Far: ingen af delene.
  assert.deepEqual(point, [15, 15, 0], 'pointene er lagt sammen efter reglerne');
  assert.match(await page.locator('#stillingTitel').textContent(), /runde 1/);
  assert.match(await page.locator('#btnNaesteRunde').textContent(), /Runde 2 af 2/);
}
await page.screenshot({ path: SHOTS + 'copyright-stilling.png' });
const motiv1 = (await state()).motiv;
await page.click('#btnNaesteRunde');

/* ---------- Runde 2 ---------- */
{
  const s = await state();
  assert.equal(s.runde, 2);
  assert.equal(s.tegninger.length, 0, 'tegningerne er ryddet');
  assert.notEqual(s.motiv, motiv1, 'nyt motiv');
}
for (let i = 0; i < 3; i++) {
  assert.equal(await page.locator('#givNavn').textContent(), navne[i]);
  await page.click('#btnKlar');
  await page.evaluate(s => window.GAME.saetStreger(s), kruseduller(i + 3));
  await page.click('#btnFaerdig');
  await page.click('#btnVidere');
}
// Selma rammer begge, Sofie kun Fars, Far rammer begge
const gaetRunde2 = [[[1, 1], [2, 2]], [[0, 2], [2, 2]], [[0, 0], [1, 1]]];
for (let g = 0; g < 3; g++) {
  assert.equal(await page.locator('#givNavn').textContent(), navne[g]);
  await page.click('#btnKlar');
  await page.evaluate(par => par.forEach(([t, s]) => window.GAME.gaet(t, s)), gaetRunde2[g]);
  await page.click('#btnGaetFaerdig');
}
while (await skaerm() === 'afsloer') { await page.click('#btnVis'); await page.click('#btnNaeste'); }

/* ---------- Slut: vinder, stilling og topliste ---------- */
assert.equal(await skaerm(), 'slut', 'sidste runde ender på slutskærmen');
{
  const s = await state();
  assert.equal(s.fase, 'slut');
  // Runde 2: Selma +25 (to rigtige + en narret), Sofie +10, Far +20
  assert.deepEqual(s.spillere.map(p => p.point), [40, 25, 20]);
  assert.match(await page.locator('#slutTitel').textContent(), /Selma vandt/);
  assert.match(await page.locator('#slutListe').textContent(), /Selma/);
}
await page.waitForFunction(() => /Selma/.test(document.getElementById('hs').textContent), null, { timeout: 5000 });
assert.deepEqual(sendte, [{ navn: 'Selma', score: 40 }], 'vinderens point ryger på toplisten');
assert.match(await page.locator('#hs').textContent(), /nr. 1/);
await page.screenshot({ path: SHOTS + 'copyright-slut.png' });

/* ---------- Navnet huskes, og aktiviteten er meldt ---------- */
assert.equal(await page.evaluate(() => localStorage.getItem('zydy.navn')), 'Selma', 'spiller 1 lærer resten af zydy.dk sit navn');
assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('zydy.copyright.navne'))), navne, 'navnene huskes til næste gang');
assert.ok(api.log.aktivitet.some(a => a.spil === 'copyright' && a.ny === true), 'spillet melder én start');

/* ---------- Ingen vandret scroll, ingen fejl ---------- */
assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'ingen vandret scroll');
assert.deepEqual(errors, [], 'ingen console-fejl');
await browser.close();
console.log('OK copyright');
