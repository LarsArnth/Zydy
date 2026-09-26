// Kør:  PLAYWRIGHT=/Users/lars/Projekter/DungeonCrawler/node_modules/playwright/index.mjs node test/bombe.test.mjs
// (kræver at en lokal server kører: python3 -m http.server 4195 -d public)
//
// Spiller «Pass or Die» igennem: startskærm → giv bomben videre med knappen og
// ved at trykke på en robot → frys en robot, der har bomben → skjold → bomben
// springer → vind runden (topliste og sejre i træk) → tab runden → to venner om
// den samme telefon → fire om en iPad, hvor panelerne ikke må ligge oven i
// hinanden. API'erne kører i hukommelsen (test/api-mock.mjs).
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
await mockApi(page);
await page.route('**/api/highscore/**', async route => {
  const req = route.request();
  if (req.method() === 'POST') {
    const krop = req.postDataJSON(); sendte.push(krop);
    return route.fulfill({ json: { ok: true, id: 1, token: 'abc', placering: 1, liste: [{ id: 1, navn: krop.navn, score: krop.score, oprettet: '2026-09-26T12:00:00.000Z' }] } });
  }
  return route.fulfill({ json: { spil: 'bombe', retning: 'desc', min: 1, maks: 500, unik: true, liste: [] } });
});

await page.goto(`${BASE}/spil/bombe/?seed=5`);
await page.waitForFunction(() => !!window.GAME);
const state = () => page.evaluate(() => window.GAME.state);
const sæt = opt => page.evaluate(o => window.GAME.saetOp(o), opt);
const frem = sek => page.evaluate(s => window.GAME.frem(s), sek);
const panel = (sted, plads = 0) => page.locator(`.panel[data-plads="${plads}"] ${sted}`);

/* ---------- Startskærmen ---------- */
assert.equal(await page.locator('#startScreen.on').isVisible(), true, 'startskærmen vises');
await page.waitForFunction(() => document.querySelector('#hsListe .hs-titel'), null, { timeout: 4000 });
assert.match(await page.locator('#hsListe').textContent(), /sejre i træk/i, 'toplisten står på startskærmen');
assert.match(await page.locator('.lavet').textContent(), /Alia/, 'der står hvem der fandt på spillet');
assert.equal(await page.locator('.saede').count(), 4, 'fire pladser om bordet');
assert.equal(await page.locator('#niveauValg button').count(), 3, 'Easy, Medium og Hard');
assert.equal(await page.locator('#tingliste div').count(), 3, 'butikken er forklaret');
assert.equal(await page.locator('#hvemValg [data-hvem="robotter"].on').count(), 1, 'man begynder mod robotterne');
{
  const plads = await page.evaluate(() => {
    const b = document.getElementById('startBtn').getBoundingClientRect();
    return { bund: b.bottom, skærm: innerHeight };
  });
  assert.ok(plads.bund <= plads.skærm, `Spil-knappen ligger uden for skærmen (${plads.bund} > ${plads.skærm})`);
}
await page.screenshot({ path: SHOTS + 'bombe-start.png' });

// Navnet skrives på den nederste plads og huskes til de andre spil
await page.locator('.saede[data-plads="0"] input').fill('Alia');
await page.locator('.saede[data-plads="0"] input').press('Enter');
assert.equal(await page.evaluate(() => localStorage.getItem('zydy.navn')), 'Alia');

// Sværhedsgraden huskes
await page.click('#niveauValg [data-niveau="hard"]');
assert.equal((await state()).valg.niveau, 'hard');
await page.click('#niveauValg [data-niveau="easy"]');
assert.equal((await state()).valg.niveau, 'easy');

// Uden et menneske kan man ikke gå i gang
await page.click('.saede[data-plads="0"] .type');     // menneske → robot
assert.equal(await page.locator('#startBtn').isDisabled(), true, 'kun robotter: knappen er slået fra');
assert.match(await page.locator('#startFejl').textContent(), /menneske/);
await page.click('.saede[data-plads="0"] .type');     // robot → ingen
await page.click('.saede[data-plads="0"] .type');     // ingen → menneske
assert.equal(await page.locator('#startBtn').isDisabled(), false);
assert.equal(await page.locator('.saede[data-plads="0"] input').inputValue(), 'Alia', 'navnet står der stadig');

/* ---------- Kampen går i gang ---------- */
await page.click('#startBtn');
{
  const st = await state();
  assert.equal(st.fase, 'spil');
  assert.equal(st.spillere.length, 4);
  assert.equal(st.spillere.filter(p => !p.robot).length, 1, 'ét menneske, tre robotter');
  assert.equal(st.spillere[0].navn, 'Alia');
  assert.equal(await page.locator('.panel').count(), 1, 'ét panel – mit eget');
  assert.equal(await panel('.giv').count(), 3, 'én knap pr. robot');
  assert.equal(await panel('.ting').count(), 3, 'frys, skjold og lyn');
  assert.equal(await page.locator('#startScreen.on').count(), 0);
}

/* ---------- Giv bomben videre med knappen ---------- */
// Billedsløjfen står stille, mens testen stiller situationer op – ellers brænder lunten imens.
await page.evaluate(() => window.GAME.pause(true));
await sæt({ robotter: false, klar: true, hos: 0, tid: 0, lunte: 999 });
assert.equal(await panel('.giv.klar').count(), 3, 'knapperne lyser, når man har bomben');
assert.match(await panel('.p-status').textContent(), /Giv den videre/);
await panel('[data-til="1"]').click();
assert.equal((await state()).bombe.hos, 1, 'Bip har bomben');
assert.equal(await panel('.giv.klar').count(), 0, 'nu har jeg den ikke');
await panel('[data-til="2"]').click();
assert.equal((await state()).bombe.hos, 1, 'man kan ikke give en bombe, man ikke har');
assert.match(await panel('.p-status').textContent(), /ikke bomben/);

/* ---------- ... eller ved at trykke på robotten ---------- */
await sæt({ hos: 0 });
{
  const p = await page.evaluate(() => window.GAME.spillerPx(2));
  await page.mouse.click(p.x, p.y);
}
assert.equal((await state()).bombe.hos, 2, 'et tryk på Zapp giver ham bomben');

/* ---------- Frys: Zapp har bomben og kan ikke komme af med den ---------- */
await sæt({ penge: { 0: 10 }, tid: 6, lunte: 9 });
await panel('[data-ting="frys"]').click();
assert.equal((await state()).frysVælger[0], true, 'nu skal jeg vælge, hvem der fryses');
assert.equal(await panel('.frysmaal').count(), 3);
await page.screenshot({ path: SHOTS + 'bombe-frys-vaelg.png' });
await panel('[data-frys="2"]').click();
{
  const st = await state();
  assert.ok(st.spillere[2].frys > 5.9, 'Zapp er frosset i 6 sek.');
  assert.equal(st.spillere[0].penge, 6, 'frys koster 4 mønter');
  assert.equal(st.frysVælger[0], false);
}
await sæt({ robotter: true });
await frem(2);
{
  const st = await state();
  assert.equal(st.bombe.hos, 2, 'en frossen robot kan ikke give bomben videre');
  assert.ok(st.spillere[2].frys > 3.5 && st.spillere[2].frys < 4.5);
}
await page.screenshot({ path: SHOTS + 'bombe-frosset.png' });
await frem(1.2);
{
  const st = await state();
  assert.equal(st.kampFase, 'brag', 'bomben sprang hos den frosne');
  assert.equal(st.spillere[2].ude, true, 'Zapp er ude');
  assert.equal(st.spillere[0].penge, 7, 'og jeg fik en mønt for at overleve');
}
await page.waitForTimeout(150);
await page.screenshot({ path: SHOTS + 'bombe-brag.png' });

/* ---------- Skjold ---------- */
await frem(2.6);   // pausen efter braget – en ny bombe lander
assert.equal((await state()).kampFase, 'klar');
await sæt({ robotter: false, klar: true, hos: 1, tid: 0, lunte: 999, penge: { 0: 5 } });
await panel('[data-ting="skjold"]').click();
{
  const st = await state();
  assert.ok(st.spillere[0].skjold > 5.9, 'skjoldet er slået til');
  assert.equal(st.spillere[0].penge, 0);
}
assert.match(await panel('.p-status').textContent(), /🛡️/);

/* ---------- Vind runden ---------- */
for (let i = 0; i < 5 && (await state()).kampFase !== 'slut'; i++) {
  const st = await state();
  const robot = st.spillere.find(p => p.robot && !p.ude);
  await sæt({ klar: true, hos: robot.nr, tid: 0, lunte: 0.2 });
  await frem(0.3);
  await frem(2.6);
}
{
  const st = await state();
  assert.equal(st.fase, 'slut');
  assert.equal(st.vinder, 0, 'jeg vandt');
  assert.equal(st.stime, 1, 'én sejr i træk');
  assert.equal(await page.locator('#slutScreen.on').isVisible(), true);
  assert.match(await page.locator('#slutTitel').textContent(), /Du vandt runden/);
  assert.match(await page.locator('#slutSub').textContent(), /Sejre i træk: 1/);
  assert.equal(await page.locator('#nyRekord').isVisible(), true, 'ny rekord');
  assert.equal(await page.locator('#stilling div').count(), 4);
  assert.ok(st.spillere[0].penge >= 3 + 2, `sejren giver mønter (${st.spillere[0].penge})`);
}
await page.waitForFunction(() => document.querySelector('#hsSlut .hs-raekke'), null, { timeout: 4000 });
assert.deepEqual(sendte.map(s => [s.navn, s.score]), [['Alia', 1]], 'rekorden sendes af sig selv');
assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('zydy.bombe.penge')).alia),
  (await state()).spillere[0].penge, 'mønterne gemmes på navnet');
await page.screenshot({ path: SHOTS + 'bombe-vundet.png' });

/* ---------- Næste runde: alle er med igen, mønterne bliver ---------- */
{
  const penge = (await state()).spillere[0].penge;
  await page.click('#igenBtn');
  const st = await state();
  assert.equal(st.runde, 2);
  assert.equal(st.spillere.filter(p => p.ude).length, 0, 'alle er med igen');
  assert.equal(st.spillere[0].penge, penge);
}

/* ---------- Tab runden ---------- */
await sæt({ robotter: false, klar: true, hos: 0, tid: 0, lunte: 0.2 });
await frem(0.3);
assert.equal((await state()).kampFase, 'brag');
await frem(2.6);
{
  const st = await state();
  assert.equal(st.fase, 'slut', 'når jeg er ude, er runden slut');
  assert.equal(st.stime, 0, 'stimen starter forfra');
  assert.match(await page.locator('#slutTitel').textContent(), /BOOM/);
}

/* ---------- I rigtig tid: robotterne spiller selv ---------- */
await page.click('#igenBtn');
await sæt({ robotter: true });
await page.evaluate(() => window.GAME.pause(false));
await page.waitForFunction(() => window.GAME.state.fase === 'slut' || window.GAME.state.bombe.tid > 0.5,
  null, { timeout: 8000 });
await page.evaluate(() => window.GAME.pause(true));
{
  // Uden at vente: spol frem, til noget er sket.
  let st = await state();
  for (let i = 0; i < 40 && st.fase === 'spil' && st.bombe.fra === null && !st.spillere.some(p => p.ude); i++) st = await frem(0.5);
  assert.ok(st.bombe.fra !== null || st.spillere.some(p => p.ude) || st.fase === 'slut', 'robotterne gav bomben videre');
}

/* ---------- To venner om den samme telefon ---------- */
await page.evaluate(() => window.GAME.tilMenu());
await page.click('#hvemValg [data-hvem="venner"]');
assert.equal(await page.locator('.saede[data-plads="1"] input').count(), 1, 'plads to er et menneske');
await page.locator('.saede[data-plads="1"] input').fill('Sofie');
await page.locator('.saede[data-plads="1"] input').press('Enter');
assert.equal(await page.locator('#rekordRow').isVisible(), false, 'sejre i træk tæller kun mod robotterne');
await page.click('#startBtn');
await page.evaluate(() => window.GAME.pause(true));
{
  const st = await state();
  assert.deepEqual(st.spillere.map(p => p.navn), ['Alia', 'Sofie']);
  assert.equal(await page.locator('.panel').count(), 2, 'et panel til hver');
  const drej = await page.locator('.panel[data-plads="1"]').evaluate(el => el.style.transform);
  assert.match(drej, /rotate\(180deg\)/, 'Sofies panel vender mod hende');
  assert.equal(await page.locator('#pengePill').isVisible(), false, 'mønterne står i hvert panel');
}
await sæt({ robotter: false, klar: true, hos: 1, tid: 0, lunte: 999 });
await panel('[data-til="1"]', 0).click();
assert.equal((await state()).bombe.hos, 1, 'Alia kan ikke give Sofies bombe væk');
await panel('[data-til="0"]', 1).click();
assert.equal((await state()).bombe.hos, 0, 'Sofie giver den til Alia fra sit eget panel');
await page.screenshot({ path: SHOTS + 'bombe-venner.png' });
await sæt({ hos: 1, tid: 0, lunte: 0.2 });
await frem(0.3);
await frem(2.6);
{
  const st = await state();
  assert.equal(st.fase, 'slut');
  assert.equal(st.vinder, 0);
  assert.match(await page.locator('#slutTitel').textContent(), /Alia vandt runden/);
  assert.equal(await page.locator('#hsSlut').isVisible(), false, 'ingen topliste med to om telefonen');
  assert.equal(sendte.length, 1, 'og intet sendt');
}

/* ---------- Ingen vandret scroll, ingen fejl ---------- */
assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'ingen vandret scroll');

/* ---------- Fire om en iPad ---------- */
{
  const ipad = await browser.newContext({ ...devices['iPad (gen 7)'] });
  const side = await ipad.newPage();
  side.on('pageerror', e => errors.push(String(e)));
  side.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await mockApi(side);
  await side.goto(`${BASE}/spil/bombe/?seed=9`);
  await side.waitForFunction(() => !!window.GAME);
  await side.evaluate(() => window.GAME.start({ typer: ['menneske', 'menneske', 'menneske', 'menneske'], navne: ['', 'Sofie', 'Selma', 'Timo'], niveau: 'medium' }));
  assert.equal(await side.locator('.panel').count(), 4);
  const kasser = await side.evaluate(() => {
    const s = document.getElementById('stage').getBoundingClientRect();
    return { stage: [s.left, s.top, s.right, s.bottom],
      paneler: [...document.querySelectorAll('.panel')].map(el => { const r = el.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; }) };
  });
  const [sl, st, sr, sb] = kasser.stage;
  for (const [l, t, r, b] of kasser.paneler) {
    assert.ok(l >= sl - 1 && t >= st - 1 && r <= sr + 1 && b <= sb + 1, `et panel stikker ud af skærmen: ${[l, t, r, b].map(Math.round)}`);
  }
  for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
    const a = kasser.paneler[i], b = kasser.paneler[j];
    const fælles = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
    assert.ok(fælles < 2, `panel ${i} og ${j} ligger oven i hinanden`);
  }
  // Selma (venstre) har bomben og giver den til Timo (højre) fra sit eget panel.
  await side.evaluate(() => window.GAME.saetOp({ robotter: false, klar: true, hos: 2, tid: 5, lunte: 999 }));
  await side.locator('.panel[data-plads="2"] [data-til="3"]').click();
  assert.equal(await side.evaluate(() => window.GAME.state.bombe.hos), 3);
  await side.waitForTimeout(400);
  await side.screenshot({ path: SHOTS + 'bombe-ipad.png' });
  assert.ok(await side.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'ingen vandret scroll på iPad');
  await ipad.close();
}

assert.deepEqual(errors, [], 'ingen console-fejl');
await browser.close();
console.log('OK pass or die');
