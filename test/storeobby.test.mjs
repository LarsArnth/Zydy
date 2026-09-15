// Kør:  PLAYWRIGHT=/Users/lars/Projekter/DungeonCrawler/node_modules/playwright/index.mjs node test/storeobby.test.mjs
// (kræver at en lokal server kører: python3 -m http.server 4186 -d public)
//
// Spiller «Store Obby» igennem: startskærm → de tre knapper i bunden → en
// etape klaret med botten → flaget som checkpoint → et fald, der ikke koster
// etaperne → «Fortsæt» efter genindlæsning → toplisten. API'erne kører i
// hukommelsen (test/api-mock.mjs).
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

// Navnet står i forvejen – som når man har skrevet det på forsiden.
await page.addInitScript(() => localStorage.setItem('zydy.navn', 'Alia'));

// Tom topliste, så enhver etape kvalificerer
const sendte = [];
await mockApi(page);
await page.route('**/api/highscore/**', async route => {
  const req = route.request();
  if (req.method() === 'POST') {
    const krop = req.postDataJSON(); sendte.push(krop);
    return route.fulfill({ json: { ok: true, id: 1, token: 'abc', placering: 1, liste: [{ id: 1, navn: krop.navn, score: krop.score, oprettet: '2026-09-15T12:00:00.000Z' }] } });
  }
  return route.fulfill({ json: { spil: 'storeobby', retning: 'desc', min: 1, maks: 500, unik: true, liste: [] } });
});

await page.goto(`${BASE}/spil/storeobby/?seed=5`);
await page.waitForFunction(() => !!window.GAME);
const tal = () => page.evaluate(() => window.GAME.tal);
const stand = () => page.evaluate(() => {
  const s = window.GAME.stand;
  return { x: s.x, y: s.y, vy: s.vy, paa: s.paa, vender: s.vender, doed: s.doed, iMaal: s.iMaal };
});
const fase = () => page.evaluate(() => window.GAME.fase);
const tik = (n = 30) => page.evaluate(n => { for (let i = 0; i < n; i++) window.GAME.tik(1 / 120); }, n);
const tryk = async (id, ned) => {
  const b = await page.locator(id).boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  if (ned) await page.mouse.down(); else await page.mouse.up();
};

/* ---------- Startskærmen ---------- */
assert.equal(await page.locator('#startScreen.on').isVisible(), true, 'startskærmen vises');
assert.equal(await page.locator('#styring').isVisible(), false, 'ingen knapper, før man spiller');
assert.match(await page.locator('.lavetaf').textContent(), /Alia/, 'der står, hvem der ønskede sig spillet');
assert.equal(await page.locator('#navnBtn').textContent(), 'AliaTryk for at ændre navn', 'navnet fra forsiden står der');
assert.equal(await page.locator('#fortsaetBtn').isVisible(), false, 'der er ikke noget at fortsætte på første besøg');
await page.waitForFunction(() => document.querySelector('#hsListe .hs-titel'), null, { timeout: 4000 });
assert.match(await page.locator('#hsListe').textContent(), /Flest etaper/, 'toplisten hentes på startskærmen');
{
  // Spil-knappen skal kunne nås uden at rulle – ellers finder et barn den ikke
  const knap = await page.locator('#startBtn').boundingBox();
  const h = await page.evaluate(() => innerHeight);
  assert.ok(knap.y + knap.height <= h, `«Spil» kan nås uden at rulle (${Math.round(knap.y + knap.height)} af ${h})`);
}
await page.screenshot({ path: SHOTS + 'storeobby-start.png' });

/* ---------- I gang: de tre knapper i bunden ---------- */
await page.click('#startBtn');
assert.equal(await page.locator('#styring').isVisible(), true, 'styringen kommer frem');
assert.equal(await fase(), 'spil');
assert.equal((await tal()).etapeNr, 1, 'man begynder på etape 1');
assert.equal(await page.locator('#etapeHud').textContent(), '1');
await page.evaluate(() => window.GAME.pause());          // faste fysik-trin, mens knapperne prøves

{
  const foer = (await stand()).x;
  await tryk('#hBtn', true); await tik(40); await tryk('#hBtn', false);
  const efter = await stand();
  assert.ok(efter.x > foer + 0.8, `▶ løber til højre (${foer.toFixed(2)} → ${efter.x.toFixed(2)})`);
  assert.equal(efter.vender, 1, 'figuren vender mod højre');
}
{
  const foer = (await stand()).x;
  await tryk('#vBtn', true); await tik(40); await tryk('#vBtn', false);
  const efter = await stand();
  assert.ok(efter.x < foer - 0.8, '◀ løber til venstre');
  assert.equal(efter.vender, -1, 'figuren vender mod venstre');
}
{
  assert.ok((await stand()).paa >= 0, 'figuren står på en plade');
  await tryk('#hopBtn', true); await tik(6); await tryk('#hopBtn', false);
  const s = await stand();
  assert.equal(s.paa, -1, 'HOP løfter figuren fra pladen');
  assert.ok(s.vy > 0, 'og den er på vej opad');
  await tik(120);
  assert.ok((await stand()).paa >= 0, 'og lander igen');
}
await page.evaluate(() => window.GAME.fortsaet());

/* ---------- Der bliver tegnet dér, hvor man kigger ---------- */
/*
  Et canvas-spil kan bestå alle de andre prøver og alligevel være usynligt:
  passer lærredets egne pixels ikke med den plads, det fylder på skærmen, bliver
  hele banen strukket og skubbet uden for billedet. Derfor måles det efter.
*/
async function tjekBillede(p, hvem) {
  const g = await p.evaluate(() => {
    const c = document.getElementById('c'), r = c.getBoundingClientRect();
    return { ...window.GAME.geo(), bredde: r.width, hoejde: r.height, lw: c.width, lh: c.height };
  });
  assert.ok(Math.abs(g.W - g.bredde) <= 2 && Math.abs(g.H - g.hoejde) <= 2,
    `${hvem}: der tegnes i ${g.W}×${g.H}, men lærredet fylder ${Math.round(g.bredde)}×${Math.round(g.hoejde)}`);
  assert.ok(Math.abs(g.lw - g.bredde * g.dpr) <= 2 && Math.abs(g.lh - g.hoejde * g.dpr) <= 2,
    `${hvem}: lærredets pixels passer med pladsen`);
  assert.ok(g.x > 0 && g.x < g.bredde, `${hvem}: figuren står inde i billedet (x=${Math.round(g.x)} af ${Math.round(g.bredde)})`);
  assert.ok(g.y > g.hoejde * 0.25 && g.y < g.hoejde * 0.85,
    `${hvem}: figuren står i den midterste del af billedet (y=${Math.round(g.y)} af ${Math.round(g.hoejde)})`);
  assert.ok(g.S >= 20, `${hvem}: banen er tegnet stort nok til at ses (S=${g.S.toFixed(1)})`);
  return g;
}
await tjekBillede(page, 'iPhone');
await page.screenshot({ path: SHOTS + 'storeobby.png' });

/* ---------- Et fald koster ikke etaperne – man starter ved flaget ---------- */
{
  await page.evaluate(() => window.GAME.doedNu());
  assert.equal(await fase(), 'doed');
  assert.match(await page.locator('#raabStor').textContent(), /AV!/, 'skærmen siger av');
  assert.match(await page.locator('#raabUnder').textContent(), /lavaen/i, 'og hvad der gik galt');
  await page.screenshot({ path: SHOTS + 'storeobby-doed.png' });
  await page.waitForFunction(() => window.GAME.fase === 'spil', null, { timeout: 4000 });
  const s = await stand();
  const t = await tal();
  assert.equal(t.etapeNr, 1, 'man er på den samme etape');
  assert.equal(t.fald, 1, 'faldet tælles');
  assert.equal(await page.locator('#faldHud').textContent(), '1 fald');
  assert.ok(s.paa === 0 && !s.doed, 'og står på pladen med flaget igen');
}

/* ---------- Etapen klaret: flaget er det nye checkpoint ---------- */
{
  assert.equal(await page.evaluate(() => window.GAME.spolEtape()), true, 'botten kan klare etape 1');
  assert.match(await page.locator('#raabStor').textContent(), /ETAPE 1 KLARET/);
  await page.screenshot({ path: SHOTS + 'storeobby-flag.png' });
  await page.waitForFunction(() => window.GAME.tal.etapeNr === 2, null, { timeout: 4000 });
  const t = await tal();
  assert.equal(t.klaret, 1, 'én etape klaret');
  assert.equal(t.bedste, 1, 'og det er rekorden');
  assert.equal(await page.locator('#etapeHud').textContent(), '2', 'HUD\'en tæller op');
  assert.deepEqual(sendte, [{ navn: 'Alia', score: 1 }], 'rekorden sendes af sig selv ved flaget');
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('zydy.storeobby.gemt')).etape), 2,
    'og etapen gemmes, så man kan fortsætte næste gang');
}

/* ---------- Endnu en etape: de samme knapper hele vejen ---------- */
{
  assert.equal(await page.evaluate(() => window.GAME.spolEtape()), true, 'botten kan også klare etape 2');
  await page.waitForFunction(() => window.GAME.tal.etapeNr === 3, null, { timeout: 4000 });
  assert.equal((await tal()).klaret, 2);
  assert.equal(sendte.length, 2, 'og rekorden bliver sendt igen');
}

/* ---------- Pause → stop → toplisten ---------- */
{
  await page.click('#pauseBtn');
  await page.waitForSelector('#pauseDlg[open]');
  assert.match(await page.locator('#pauseUnder').textContent(), /Etape 3 · 2 klaret/);
  await page.click('#stopBtn');
  await page.waitForSelector('#slutScreen.on');
  assert.equal(await page.locator('#slutTal').textContent(), '2');
  assert.match(await page.locator('#slutUnder').textContent(), /etaper klaret · 1 fald/);
  assert.match(await page.locator('#slutTitel').textContent(), /rekord/i, 'to etaper er en ny rekord');
  await page.waitForFunction(() => /Alia/.test(document.getElementById('hsSlut').textContent), null, { timeout: 4000 });
  await page.screenshot({ path: SHOTS + 'storeobby-slut.png' });
}

/* ---------- «Fortsæt» efter genindlæsning ---------- */
{
  await page.goto(`${BASE}/spil/storeobby/?seed=5`);
  await page.waitForFunction(() => !!window.GAME);
  assert.equal(await page.locator('#fortsaetBtn').isVisible(), true, 'man kan fortsætte, hvor man slap');
  assert.match(await page.locator('#fortsaetBtn').textContent(), /etape 3/);
  assert.equal(await page.locator('#startBtn').textContent(), 'Ny bane', 'og starte forfra på en frisk bane');
  await page.click('#fortsaetBtn');
  const t = await tal();
  assert.equal(t.etapeNr, 3, 'man fortsætter på etape 3');
  assert.equal(t.klaret, 2, 'med de etaper, man allerede har klaret');
  var tredje = await page.evaluate(() => window.GAME.etape.plader.map(p => [p.slags, +p.x.toFixed(3), +p.w.toFixed(3)]));
  assert.equal(await page.evaluate(() => window.GAME.spolEtape()), true, 'og etape 3 kan også klares');
}

/* ---------- Banen er den samme med det samme frø ---------- */
{
  await page.goto(`${BASE}/spil/storeobby/?seed=5`);
  await page.waitForFunction(() => !!window.GAME);
  await page.click('#fortsaetBtn');
  await page.evaluate(() => window.GAME.saetEtape(3));
  const igen = await page.evaluate(() => window.GAME.etape.plader.map(p => [p.slags, +p.x.toFixed(3), +p.w.toFixed(3)]));
  assert.deepEqual(igen, tredje, '?seed=5 giver den samme etape hver gang');
}

/* ---------- iPad: alting kan ses og nås ---------- */
{
  const iPad = await browser.newContext({ ...devices['iPad (gen 7) landscape'] });
  const p2 = await iPad.newPage();
  p2.on('pageerror', e => errors.push('iPad: ' + e));
  p2.on('console', m => { if (m.type() === 'error') errors.push('iPad: ' + m.text()); });
  await mockApi(p2);
  await p2.route('**/api/highscore/**', r => r.fulfill({ json: { spil: 'storeobby', retning: 'desc', min: 1, maks: 500, unik: true, liste: [] } }));
  await p2.goto(`${BASE}/spil/storeobby/?seed=9`);
  await p2.waitForFunction(() => !!window.GAME);
  const knap = await p2.locator('#startBtn').boundingBox();
  const h = await p2.evaluate(() => innerHeight);
  assert.ok(knap.y + knap.height <= h, 'Spil-knappen kan nås uden at rulle på iPad');
  await p2.click('#startBtn');
  await p2.waitForTimeout(300);                    // et par billeder, så kameraet er på plads
  await tjekBillede(p2, 'iPad');
  await p2.screenshot({ path: SHOTS + 'storeobby-ipad.png' });
  const hop = await p2.locator('#hopBtn').boundingBox();
  assert.ok(hop.y + hop.height <= h, 'og hop-knappen ligger inde på skærmen');
  assert.ok(await p2.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'ingen vandret scroll');
  await iPad.close();
}

assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'ingen vandret scroll');
assert.deepEqual(errors, [], 'ingen fejl i konsollen');
await browser.close();
console.log('OK store obby');
