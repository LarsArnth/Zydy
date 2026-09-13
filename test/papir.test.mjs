// Kør:  PLAYWRIGHT=/Users/lars/Projekter/DungeonCrawler/node_modules/playwright/index.mjs node test/papir.test.mjs
// (kræver at en lokal server kører: python3 -m http.server 4191 -d public)
//
// Kører «Papirøen» igennem: startskærm → en rigtig finger, der drejer klatten →
// modstanderne, der farver løs → en hel runde med botten ved rattet → og til
// sidst papiret for sig selv (?bots=0), hvor sløjfen og kanten kan prøves uden
// at nogen blander sig. API'erne kører i hukommelsen (test/api-mock.mjs).
import assert from 'node:assert/strict';
import { mockApi } from './api-mock.mjs';
const { chromium, devices } = await import(process.env.PLAYWRIGHT ?? 'playwright');
const BASE = process.env.BASE ?? 'http://localhost:4191';
const SHOTS = new URL('./shots/', import.meta.url).pathname;

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 13'] });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

// Tom topliste, så en hvilken som helst procent kvalificerer
const sendte = [];
const api = await mockApi(page);
await page.route('**/api/highscore/**', async route => {
  const req = route.request();
  if (req.method() === 'POST') {
    const krop = req.postDataJSON(); sendte.push(krop);
    return route.fulfill({ json: { ok: true, id: 1, token: 'abc', placering: 1, liste: [{ id: 1, navn: krop.navn, score: krop.score, oprettet: '2026-09-13T12:00:00.000Z' }] } });
  }
  return route.fulfill({ json: { spil: 'papir', retning: 'desc', min: 1, maks: 100, unik: true, liste: [] } });
});

await page.goto(`${BASE}/spil/papir/?seed=7`);
await page.waitForFunction(() => !!window.GAME);
const state = () => page.evaluate(() => window.GAME.state);

/* ---------- Startskærmen ---------- */
assert.equal(await page.locator('#startScreen.on').isVisible(), true, 'startskærmen vises');
assert.equal((await state()).seed, 7, '?seed styrer papiret');
assert.equal((await state()).fase, 'menu');
await page.waitForFunction(() => document.querySelector('#hsListe .hs-titel'), null, { timeout: 4000 });
assert.match(await page.locator('#hsListe').textContent(), /Topliste/, 'toplisten står på startskærmen');
assert.match(await page.locator('.lavet').textContent(), /Selma/, 'der står hvem der ønskede sig spillet');

// Spil-knappen skal kunne nås uden at rulle (reglerne står derfor under den)
{
  const plads = await page.evaluate(() => {
    const b = document.getElementById('startBtn').getBoundingClientRect();
    return { bund: b.bottom, skærm: innerHeight };
  });
  assert.ok(plads.bund <= plads.skærm, `Spil-knappen ligger uden for skærmen (${plads.bund} > ${plads.skærm})`);
}
await page.screenshot({ path: SHOTS + 'papir-start.png' });

// Navnet skrives på startskærmen (som i Obby), så rekorden kan sendes af sig selv
await page.click('#nameBtn');
await page.fill('#nameInput', 'Selma');
await page.click('#nameForm button[type=submit]');
assert.equal(await page.evaluate(() => localStorage.getItem('zydy.navn')), 'Selma', 'navnet huskes til de andre spil');

/* ---------- Alle fire klatter kommer ind med hvert sit lille område ---------- */
await page.click('#startBtn');
{
  const st = await state();
  assert.equal(st.fase, 'spil');
  assert.equal(await page.locator('#startScreen.on').count(), 0, 'startskærmen er væk');
  assert.equal(st.spillere.length, 4, 'mig og tre modstandere');
  assert.equal(st.spillere[0].mig, true);
  for (const p of st.spillere) assert.equal(p.felter, 25, `${p.navn} starter med 5×5 felter`);
  assert.equal(await page.locator('#rang .r').count(), 4, 'ranglisten har en linje pr. klat');
  assert.match(await page.locator('#rang').textContent(), /Dig/);
  assert.match(await page.locator('#styrHint').textContent(), /Træk fingeren/, 'der står hvad fingeren skal');
}

/* ---------- En rigtig finger på skærmen styrer klatten ---------- */
{
  const boks = await page.locator('#c').boundingBox();
  const midtX = boks.x + boks.width / 2, midtY = boks.y + boks.height / 2;
  // Retningerne regnes ud fra den, klatten kører i lige nu – så testen ikke
  // afhænger af, hvilken vej frøet sendte den af sted.
  const træk = async d => {
    const [dx, dy] = [[70, 0], [0, 70], [-70, 0], [0, -70]][d];
    await page.mouse.move(midtX, midtY);
    await page.mouse.down();
    await page.mouse.move(midtX + dx, midtY + dy, { steps: 4 });
    await page.mouse.up();
    // Retningen slår først igennem, når klatten når midten af næste felt.
    return page.evaluate(() => window.GAME.frem(0.3));
  };

  let st = await state();
  const højre = (st.retning + 1) % 4;
  st = await træk(højre);
  assert.equal(st.retning, højre, 'et træk til den ene side drejer klatten');
  const venstre = (st.retning + 3) % 4;
  st = await træk(venstre);
  assert.equal(st.retning, venstre, 'og et træk til den anden side drejer den tilbage');
  st = await træk((st.retning + 2) % 4);
  assert.equal(st.retning, venstre, 'men man kan ikke vende 180° – det ville være lige ind i sin egen streg');
}

/* ---------- Modstanderne farver også løs ---------- */
{
  await page.evaluate(() => window.GAME.start());
  // Vi kører rundt i en lille firkant inde i vores eget område imens: uden en
  // streg ude på papiret kan ingen tage os, så her er det kun de andre, der
  // sker noget for.
  const st = await page.evaluate(() => window.GAME.frem(10, p => ((p.cx + p.cy) % 2 === 0 ? (p.dir + 1) % 4 : null)));
  assert.equal(st.fase, 'spil', 'man er i sikkerhed, så længe man bliver hjemme');
  assert.equal(st.ude, false, 'og der er ingen streg at tage os på');
  const bots = st.spillere.filter(p => !p.mig);
  assert.ok(bots.some(p => p.felter > 25), 'mindst én modstander har taget nyt papir');
  assert.ok(await page.evaluate(() => document.getElementById('stage').classList.contains('igang')),
    'minikortet og procenten vises, mens man spiller');
  assert.ok(await page.evaluate(() => {
    // Er mit grønne område tegnet ind på minikortet?
    const c = document.getElementById('mini');
    if (!c.width) return false;
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    for (let i = 0; i < d.length; i += 4) if (d[i] < 100 && d[i + 1] > 150 && d[i + 1] > d[i + 2] + 40) return true;
    return false;
  }), 'minikortet viser hele papiret med mit område på');
  assert.match(await page.locator('#rang').textContent(), /Bo[\s\S]*Ida[\s\S]*Mikkel/, 'de står på ranglisten');
  assert.match(await page.locator('#procent').textContent(), /%/, 'og procenten står i hjørnet');
  await page.screenshot({ path: SHOTS + 'papir.png' });
}

/* ---------- En hel runde med botten ved rattet: slutskærm og topliste ---------- */
{
  await page.evaluate(() => window.GAME.start());
  const st = await page.evaluate(() => window.GAME.botTur(240));
  assert.equal(st.fase, 'slut', 'runden slutter af sig selv');
  assert.ok(st.sløjfer >= 2, `botten nåede kun ${st.sløjfer} sløjfer`);
  assert.ok(st.bedste > 25, 'og den tog mere papir end sit lille startområde');

  assert.equal(await page.locator('#slutScreen.on').isVisible(), true, 'slutskærmen kommer frem');
  assert.match(await page.locator('#slutScore').textContent(), new RegExp(`^${st.score} %$`), 'procenten står stort');
  assert.match(await page.locator('#slutSub').textContent(), /sløjfe/, 'og hvor mange sløjfer man nåede');
  assert.equal(await page.locator('#nyRekord').isVisible(), true, 'første runde er altid en ny rekord');
  assert.equal(await page.evaluate(() => localStorage.getItem('zydy.papir.best')), String(st.score), 'rekorden huskes');

  await page.waitForFunction(() => /Selma/.test(document.getElementById('hsSlut').textContent), null, { timeout: 4000 });
  assert.ok(sendte.some(x => x.navn === 'Selma' && x.score === st.score), 'rekorden sendes selv til toplisten');
  assert.ok(sendte.every(x => Number.isInteger(x.score) && x.score > 0 && x.score <= 100), 'og det er altid hele procent');
  await page.screenshot({ path: SHOTS + 'papir-slut.png' });
}

/* ---------- Papiret for sig selv: sløjfen og kanten ---------- */
// ?bots=0 er både til at øve sig og til testen: her kan vi være sikre på, at
// det var sløjfen, der farvede papiret, og kanten, der tog os – og ikke Bo.
await page.goto(`${BASE}/spil/papir/?seed=7&bots=0`);
await page.waitForFunction(() => !!window.GAME);
assert.equal((await state()).spillere.length, 1, '?bots=0 giver papiret for sig selv');

/* En sløjfe ud og hjem farver papiret */
{
  await page.click('#startBtn');
  const start = await state();
  const før = start.felter;
  // Et rektangel: ligeud, og så tre drej til samme side, så vi ender hjemme
  // igen. Der køres i faste skridt, så det er den samme tur hver gang,
  // uanset hvor hurtigt maskinen tegner.
  const rute = [[start.retning, 0.8], [(start.retning + 1) % 4, 0.8],
    [(start.retning + 2) % 4, 0.9], [(start.retning + 3) % 4, 0.9]];
  for (const [retning, sek] of rute) {
    await page.evaluate(([r, s]) => window.GAME.frem(s, () => r), [retning, sek]);
  }
  const st = await state();
  assert.equal(st.levende, true, 'sløjfen må ikke koste livet');
  assert.equal(st.ude, false, 'vi er hjemme igen, og sløjfen er lukket');
  assert.equal(st.streg, 0, 'stregen er blevet til område');
  assert.ok(st.sløjfer >= 1, 'mindst én sløjfe blev lukket');
  assert.ok(st.felter > før + 15, `papiret voksede for lidt: ${før} → ${st.felter}`);
  assert.ok(st.procent > 1, 'og det kan ses på procenten');
}

/* Kanten af papiret er slut */
{
  await page.evaluate(() => window.GAME.start());
  const st = await page.evaluate(() => window.GAME.frem(20, () => 3));   // lige ud, til papiret slipper op
  assert.equal(st.fase, 'slut', 'man er ude, når man kører ud over kanten');
  assert.equal(st.grund, 'mur');
  assert.equal(st.levende, false);
  assert.match(await page.locator('#slutTitel').textContent(), /kanten/, 'slutskærmen siger hvorfor');
  assert.equal(await page.locator('#nyRekord').isVisible(), false, 'en dårligere runde er ingen ny rekord');
}

/* ---------- Spil igen og menu ---------- */
{
  await page.click('#igenBtn');
  const st = await state();
  assert.equal(st.fase, 'spil', 'man er i gang med det samme');
  assert.equal(st.felter, 25, 'på et friskt stykke papir');
  assert.equal(st.levende, true);
  assert.equal(await page.locator('#slutScreen.on').count(), 0, 'slutskærmen er væk');

  await page.evaluate(() => window.GAME.tilMenu());
  assert.equal(await page.locator('#startScreen.on').isVisible(), true, 'og man kan komme tilbage til menuen');
  assert.ok(Number(await page.locator('#rekordVal').textContent()) > 0, 'hvor rekorden står');
}

/* ---------- Aktivitet meldt til forsiden ---------- */
assert.ok(api.log.aktivitet.some(a => a.spil === 'papir' && a.ny === true), 'spillet melder én start');

/* ---------- Passer på en iPad på tværs ---------- */
{
  const pad = await browser.newContext({ ...devices['iPad (gen 7) landscape'] });
  const p2 = await pad.newPage();
  const padFejl = [];
  p2.on('pageerror', e => padFejl.push(String(e)));
  await mockApi(p2);
  await p2.goto(`${BASE}/spil/papir/?seed=7`);
  await p2.waitForFunction(() => !!window.GAME);
  await p2.click('#startBtn');
  const st = await p2.evaluate(() => window.GAME.frem(6, () => window.GAME.botRetning()));
  assert.equal(st.fase, 'spil', 'runden kører også på en iPad');
  assert.ok(await p2.evaluate(() => {
    const r = document.getElementById('c').getBoundingClientRect();
    return r.width > 600 && r.height > 200;
  }), 'papiret fylder skærmen');
  assert.ok(await p2.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'ingen vandret scroll på iPad');
  await p2.screenshot({ path: SHOTS + 'papir-ipad.png' });
  assert.deepEqual(padFejl, [], 'ingen fejl på iPad');
  await pad.close();
}

/* ---------- Ingen vandret scroll, ingen fejl ---------- */
assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'ingen vandret scroll');
assert.deepEqual(errors, [], 'ingen console-fejl');
await browser.close();
console.log('OK papir');
