// Kør:  PLAYWRIGHT=/Users/lars/Projekter/DungeonCrawler/node_modules/playwright/index.mjs node test/fjolle.test.mjs
// (kræver at en lokal server kører: python3 -m http.server 4186 -d public)
//
// Spiller «Fjolle-Obby» igennem: startskærm → de tre knapper i bunden → en
// etape klaret med botten → et plask i buddingen, der ikke koster etapen →
// «Fortsæt» efter genindlæsning → hele banen klaret, så tiden ryger på
// toplisten. API'erne kører i hukommelsen (test/api-mock.mjs).
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

// Tom topliste, så enhver tid kvalificerer
const sendte = [];
await mockApi(page);
await page.route('**/api/highscore/**', async route => {
  const req = route.request();
  if (req.method() === 'POST') {
    const krop = req.postDataJSON(); sendte.push(krop);
    return route.fulfill({ json: { ok: true, id: 1, token: 'abc', placering: 1, liste: [{ id: 1, navn: krop.navn, score: krop.score, oprettet: '2026-09-15T12:00:00.000Z' }] } });
  }
  return route.fulfill({ json: { spil: 'fjolle', retning: 'asc', min: 30, maks: 5400, unik: true, liste: [] } });
});

await page.goto(`${BASE}/spil/fjolle/`);
await page.waitForFunction(() => !!window.GAME);
const tal = () => page.evaluate(() => window.GAME.tal);
const stand = () => page.evaluate(() => {
  const s = window.GAME.stand;
  return { x: s.x, y: s.y, vx: s.vx, vy: s.vy, paa: s.paa, vender: s.vender, doed: s.doed, iMaal: s.iMaal };
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
assert.equal(await page.locator('#fortsaetBtn').isVisible(), false, 'der er ikke noget at fortsætte på første besøg');
await page.waitForFunction(() => document.querySelector('#hsStart .hs-titel'), null, { timeout: 4000 });
{
  // Spil-knappen skal kunne nås uden at rulle – ellers finder et barn den ikke
  const knap = await page.locator('#startBtn').boundingBox();
  const h = await page.evaluate(() => innerHeight);
  assert.ok(knap.y + knap.height <= h, `«Spil» kan nås uden at rulle (${Math.round(knap.y + knap.height)} af ${h})`);
}
await page.screenshot({ path: SHOTS + 'fjolle-start.png' });

/* ---------- I gang: de tre knapper i bunden ---------- */
await page.click('#startBtn');
assert.equal(await page.locator('#styring').isVisible(), true, 'styringen kommer frem');
assert.equal(await fase(), 'spil');
assert.equal((await tal()).etapeNr, 1, 'man begynder på etape 1');
assert.equal((await tal()).antal, 9, 'der er ni etaper');
assert.equal(await page.locator('#etapeHud').textContent(), '1');
assert.match(await page.locator('#etapeNavn').textContent(), /Kom nu i gang/, 'etapens navn står i HUD\'en');
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
  await tik(140);
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
await page.screenshot({ path: SHOTS + 'fjolle.png' });

/* ---------- Et plask koster ikke etapen – man starter ved flaget ---------- */
{
  await page.evaluate(() => window.GAME.doedNu());
  assert.equal(await fase(), 'doed');
  assert.match(await page.locator('#raabStor').textContent(), /SPLASH/, 'skærmen siger splash');
  assert.match(await page.locator('#raabUnder').textContent(), /plask|budding/i, 'og hvad man landede i');
  await page.screenshot({ path: SHOTS + 'fjolle-plask.png' });
  await page.waitForFunction(() => window.GAME.fase === 'spil', null, { timeout: 4000 });
  const s = await stand();
  const t = await tal();
  assert.equal(t.etapeNr, 1, 'man er på den samme etape');
  assert.equal(t.fald, 1, 'plasket tælles');
  assert.equal(await page.locator('#faldHud').textContent(), '1 plask');
  assert.ok(s.paa === 0 && !s.doed, 'og står på pladen med flaget igen');
}

/* ---------- Etapen klaret: flaget er det nye checkpoint ---------- */
{
  /*
    «ETAPE 1 KLARET» skal læses i det *samme* evaluate som spolEtape(): den
    sætter `ventTil = 0`, så næste billede med det samme går videre til etape 2
    og skriver «ETAPE 2» i stedet. Henter man teksten i et kald for sig, når
    rAF at komme først, og prøven falder tilfældigt på den ene eller den anden.
  */
  const klaret = await page.evaluate(() => ({
    ok: window.GAME.spolEtape(),
    raab: document.getElementById('raabStor').textContent,
  }));
  assert.equal(klaret.ok, true, 'botten kan klare etape 1');
  assert.match(klaret.raab, /ETAPE 1 KLARET/);
  await page.waitForFunction(() => window.GAME.tal.etapeNr === 2, null, { timeout: 4000 });
  assert.equal(await page.locator('#etapeHud').textContent(), '2', 'HUD\'en tæller op');
  assert.match(await page.locator('#etapeNavn').textContent(), /Bananskrællen/, 'og etape 2 hedder noget andet');
  assert.deepEqual(sendte, [], 'ingen score endnu – tiden tæller først, når hele banen er klaret');
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('zydy.fjolle.gemt')).etape), 2,
    'etapen gemmes, så man kan fortsætte næste gang');
}

/* ---------- Bananskrællen skrider, og de andre fjollerier er der også ---------- */
{
  await page.evaluate(() => window.GAME.pause());
  const banan = await page.evaluate(() => {
    const p = window.GAME.etape.plader.find(q => q.slags === 'banan');
    const s = window.GAME.stand;
    s.paa = p.nr; s.sidst = p.nr; s.x = p.x + 0.4; s.y = p.y; s.vx = 0;
    return p.w;
  });
  assert.ok(banan > 3, 'bananpladerne er brede – man skal have plads til at skride');
  await page.evaluate(() => { window.GAME.ind.hoejre = true; });
  await tik(60);
  const fart = (await stand()).vx;
  await page.evaluate(() => { window.GAME.ind.hoejre = false; });
  await tik(12);
  const efter = await stand();
  assert.ok(efter.vx > fart * 0.7, `man skrider videre, når man slipper (${fart.toFixed(2)} → ${efter.vx.toFixed(2)})`);
  await page.evaluate(() => { window.GAME.ind.venstre = false; window.GAME.ind.hoejre = false; });
  await page.evaluate(() => window.GAME.fortsaet());
}

/* ---------- «Fortsæt» efter genindlæsning ---------- */
{
  await page.goto(`${BASE}/spil/fjolle/`);
  await page.waitForFunction(() => !!window.GAME);
  assert.equal(await page.locator('#fortsaetBtn').isVisible(), true, 'man kan fortsætte, hvor man slap');
  assert.match(await page.locator('#fortsaetBtn').textContent(), /etape 2/);
  assert.equal(await page.locator('#startBtn').textContent(), 'Start forfra', 'eller begynde forfra');
  await page.click('#fortsaetBtn');
  const t = await tal();
  assert.equal(t.etapeNr, 2, 'man fortsætter på etape 2');
  assert.equal(t.fald, 1, 'med de plask, man allerede har lavet');
}

/* ---------- Hele banen: botten spiller de sidste otte etaper igennem ---------- */
{
  for (let i = 2; i <= 9; i++) {
    const navn = await page.evaluate(() => window.GAME.etape.navn);
    assert.equal(await page.evaluate(() => window.GAME.spolEtape()), true, `botten kan klare etape ${i} «${navn}»`);
    if (i < 9) await page.waitForFunction(n => window.GAME.tal.etapeNr === n, i + 1, { timeout: 5000 });
  }
  await page.waitForSelector('#slutScreen.on');
  assert.equal(await fase(), 'slut');
  assert.match(await page.locator('#slutTitel').textContent(), /rekord|klarede/i, 'man får ros for at klare hele banen');
  assert.match(await page.locator('#slutTal').textContent(), /^\d+:\d\d$/, 'tiden står som minutter og sekunder');
  assert.match(await page.locator('#slutUnder').textContent(), /hele banen · 1 plask/);
  await page.waitForTimeout(400);
  assert.equal(sendte.length, 1, 'tiden sendes til toplisten, når hele banen er klaret');
  assert.equal(sendte[0].navn, 'Alia');
  assert.ok(sendte[0].score >= 30 && sendte[0].score <= 5400, `tiden er troværdig (${sendte[0].score} sek.)`);
  assert.equal(await page.evaluate(() => localStorage.getItem('zydy.fjolle.gemt')), null,
    'og der er ikke noget at fortsætte på – banen er klaret');
  assert.equal(await page.evaluate(() => +localStorage.getItem('zydy.fjolle.bedste')), sendte[0].score,
    'rekorden huskes på telefonen');
  await page.waitForFunction(() => /Alia/.test(document.getElementById('hsSlut').textContent), null, { timeout: 4000 });
  await page.screenshot({ path: SHOTS + 'fjolle-slut.png' });
}

/* ---------- Hønsegården: hønen går på pladen og kan ses ---------- */
{
  await page.goto(`${BASE}/spil/fjolle/?etape=7`);
  await page.waitForFunction(() => !!window.GAME);
  const h = await page.evaluate(() => {
    const p = window.GAME.etape.plader.find(q => q.hoene);
    const s = window.GAME.stand;
    s.x = p.x + 1;                                   // hen til hønen, så den kommer med på billedet
    return { x: p.x, fra: p.hoene.fra, til: p.hoene.til };
  });
  assert.ok(h.til > h.fra, 'hønen har en strækning at gå på');
  await page.waitForTimeout(500);
  await page.screenshot({ path: SHOTS + 'fjolle-hoens.png' });
}

/* ---------- iPad: alting kan ses og nås ---------- */
{
  const iPad = await browser.newContext({ ...devices['iPad (gen 7) landscape'] });
  const p2 = await iPad.newPage();
  p2.on('pageerror', e => errors.push('iPad: ' + e));
  p2.on('console', m => { if (m.type() === 'error') errors.push('iPad: ' + m.text()); });
  await mockApi(p2);
  await p2.route('**/api/highscore/**', r => r.fulfill({ json: { spil: 'fjolle', retning: 'asc', min: 30, maks: 5400, unik: true, liste: [] } }));
  await p2.goto(`${BASE}/spil/fjolle/?etape=4`);          // Prutteskyen – den med mest at kigge på
  await p2.waitForFunction(() => !!window.GAME);
  await p2.waitForTimeout(300);                           // et par billeder, så kameraet er på plads
  assert.equal(await p2.evaluate(() => window.GAME.tal.etapeNr), 4, '?etape=4 begynder på Prutteskyen');
  await tjekBillede(p2, 'iPad');
  await p2.screenshot({ path: SHOTS + 'fjolle-ipad.png' });
  const h = await p2.evaluate(() => innerHeight);
  const hop = await p2.locator('#hopBtn').boundingBox();
  assert.ok(hop.y + hop.height <= h, 'hop-knappen ligger inde på skærmen');
  assert.ok(await p2.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'ingen vandret scroll');
  await iPad.close();
}

assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'ingen vandret scroll');
assert.deepEqual(errors, [], 'ingen fejl i konsollen');
await browser.close();
console.log('OK fjolle-obby');
