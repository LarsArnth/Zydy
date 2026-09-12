// Kør:  PLAYWRIGHT=/Users/lars/Projekter/DungeonCrawler/node_modules/playwright/index.mjs node test/blokblast.test.mjs
// (kræver at en lokal server kører: python3 -m http.server 4195 -d public)
//
// Spiller «Blokblast» igennem: startskærm → en rigtig træk-og-slip med fingeren →
// en linje der blæser væk → brættet fyldes op → slutskærm og topliste.
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

// Tom topliste, så en hvilken som helst score kvalificerer
const sendte = [];
const api = await mockApi(page);
await page.route('**/api/highscore/**', async route => {
  const req = route.request();
  if (req.method() === 'POST') {
    const krop = req.postDataJSON(); sendte.push(krop);
    return route.fulfill({ json: { ok: true, id: 1, token: 'abc', placering: 1, liste: [{ id: 1, navn: krop.navn, score: krop.score, oprettet: '2026-09-12T12:00:00.000Z' }] } });
  }
  return route.fulfill({ json: { spil: 'blokblast', retning: 'desc', min: 1, maks: 200000, unik: true, liste: [] } });
});

await page.goto(`${BASE}/spil/blokblast/?seed=7`);
await page.waitForFunction(() => !!window.GAME);
const state = () => page.evaluate(() => window.GAME.state);

/* ---------- Startskærmen ---------- */
assert.equal(await page.locator('#startScreen.on').isVisible(), true, 'startskærmen vises');
assert.equal(await page.locator('#startBtn').textContent(), 'Spil', 'uden et gemt spil står der bare Spil');
assert.equal(await page.locator('#nytBtn').isVisible(), false, '«Start forfra» giver først mening med et gemt spil');
await page.waitForFunction(() => document.querySelector('#hsListe .hs-titel'), null, { timeout: 4000 });
assert.match(await page.locator('#hsListe').textContent(), /Topliste/, 'toplisten står på startskærmen');
assert.match(await page.locator('.lavet').textContent(), /Selma/, 'der står hvem der fandt på spillet');

// Spil-knappen skal kunne nås uden at rulle (startskærmen må ikke blive for høj)
{
  const plads = await page.evaluate(() => {
    const b = document.getElementById('startBtn').getBoundingClientRect();
    return { bund: b.bottom, skærm: innerHeight };
  });
  assert.ok(plads.bund <= plads.skærm, `Spil-knappen ligger uden for skærmen (${plads.bund} > ${plads.skærm})`);
}
await page.screenshot({ path: SHOTS + 'blokblast-start.png' });

// Navnet skrives på startskærmen (som i Obby), så rekorden kan sendes af sig selv
await page.click('#nameBtn');
await page.fill('#nameInput', 'Selma');
await page.click('#nameForm button[type=submit]');
assert.equal(await page.evaluate(() => localStorage.getItem('zydy.navn')), 'Selma', 'navnet huskes til de andre spil');

/* ---------- Spillet går i gang med tre brikker ---------- */
await page.click('#startBtn');
{
  const st = await state();
  assert.equal(st.fase, 'spil');
  assert.equal(st.score, 0);
  assert.equal(st.fyldte, 0, 'brættet starter tomt');
  assert.equal(st.brikker.filter(Boolean).length, 3, 'tre brikker i bakken');
  assert.equal(await page.locator('#startScreen.on').count(), 0, 'startskærmen er væk');
}

/* ---------- En rigtig træk-og-slip med fingeren ---------- */
{
  const start = await page.evaluate(() => window.GAME.baasPx(0));
  const slut = await page.evaluate(() => window.GAME.slipPunkt(0, 0, 0));
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(slut.x, slut.y - 40, { steps: 6 });
  // Undervejs holdes brikken over fingeren og viser, hvor den lander
  const undervejs = await state();
  assert.ok(undervejs.træk, 'brikken hænger i fingeren');
  assert.equal(undervejs.træk.nr, 0);
  await page.screenshot({ path: SHOTS + 'blokblast-traek.png' });
  await page.mouse.move(slut.x, slut.y, { steps: 4 });
  assert.equal((await state()).træk.gyldig, true, 'over brættet lyser den grønt');
  await page.mouse.up();

  const st = await state();
  assert.equal(st.brikker[0], null, 'brikken er lagt og væk fra bakken');
  assert.ok(st.fyldte >= 1, 'der ligger klodser på brættet');
  assert.equal(st.score, st.fyldte, 'ét point pr. felt, når der ikke ryddes noget');
  assert.equal(await page.locator('#scoreVal').textContent(), String(st.score), 'pointene står i toppen');
}

/* ---------- Et ulovligt slip lægger ingenting ---------- */
{
  const før = await state();
  const start = await page.evaluate(() => window.GAME.baasPx(1));
  const ud = await page.evaluate(() => window.GAME.slipPunkt(1, -5, -5));
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(ud.x, ud.y, { steps: 4 });
  assert.equal((await state()).træk.gyldig, false, 'uden for brættet kan den ikke lægges');
  await page.mouse.up();
  const efter = await state();
  assert.equal(efter.fyldte, før.fyldte, 'brættet er uændret');
  assert.equal(efter.score, før.score, 'og der kom ingen point');
  assert.ok(efter.brikker[1], 'brikken ligger stadig i bakken');
}

/* ---------- En fuld række blæser væk ---------- */
{
  await page.evaluate(() => {
    const række = [];
    for (let x = 0; x < 7; x++) række.push([x, 3]);      // rækken mangler ét felt
    window.GAME.saetOp(række, ['prik', 'stor', 'firkant']);
  });
  await page.screenshot({ path: SHOTS + 'blokblast.png' });
  const slut = await page.evaluate(() => window.GAME.slipPunkt(0, 7, 3));
  const start = await page.evaluate(() => window.GAME.baasPx(0));
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(slut.x, slut.y, { steps: 6 });
  await page.mouse.up();

  const st = await state();
  assert.equal(st.fyldte, 0, 'hele rækken er blæst væk');
  assert.equal(st.score, 11, 'ét point for feltet og ti for linjen');
  assert.equal(st.stime, 1, 'første rydning i stimen');
  assert.deepEqual(st.fulde, { rækker: [], søjler: [] }, 'der står ingen fuld linje tilbage');
  await page.waitForTimeout(120);
  await page.screenshot({ path: SHOTS + 'blokblast-ryddet.png' });
}

/* ---------- To linjer på én gang giver meget mere ---------- */
{
  await page.evaluate(() => {
    const felter = [];
    for (let x = 0; x < 7; x++) felter.push([x, 5]);
    for (let y = 0; y < 8; y++) if (y !== 5) felter.push([7, y]);
    window.GAME.saetOp(felter, ['prik', 'prik', 'prik']);
  });
  assert.equal(await page.evaluate(() => window.GAME.laeg(0, 7, 5)), true, 'prikken lukker både rækken og søjlen');
  const st = await state();
  assert.equal(st.fyldte, 0);
  assert.equal(st.score, 41, 'to linjer på én gang: 1 + 40 point');
}

/* ---------- Bakken fyldes op, når alle tre brikker er brugt ---------- */
{
  await page.evaluate(() => window.GAME.start());
  const brugte = await page.evaluate(() => {
    const antal = [];
    for (let i = 0; i < 3; i++) {
      antal.push(window.GAME.state.brikker.filter(Boolean).length);
      window.GAME.bot();
    }
    return antal;
  });
  assert.deepEqual(brugte, [3, 2, 1], 'bakken tømmes én brik ad gangen');
  assert.equal((await state()).brikker.filter(Boolean).length, 3, 'og fyldes op igen bagefter');
}

/* ---------- En hel omgang med botten: pointene vokser, brættet holder ---------- */
{
  const træk = await page.evaluate(() => window.GAME.botSpiller(60));
  const st = await state();
  assert.ok(træk >= 40, `botten nåede kun ${træk} træk`);
  assert.ok(st.score > 100, `for få point efter ${træk} træk (${st.score})`);
  assert.ok(st.fyldte <= 64, 'brættet må ikke løbe over');
  assert.deepEqual(st.fulde, { rækker: [], søjler: [] }, 'fulde linjer bliver altid ryddet med det samme');
  await page.screenshot({ path: SHOTS + 'blokblast-spillet.png' });
}

/* ---------- Det gemte spil: man kan lukke fanen og komme tilbage ---------- */
{
  const før = (await state()).score;
  assert.ok(før > 0);
  await page.reload();
  await page.waitForFunction(() => !!window.GAME);
  assert.match(await page.locator('#startBtn').textContent(), new RegExp(`Fortsæt · ${før} point`), 'startskærmen tilbyder at fortsætte');
  assert.equal(await page.locator('#nytBtn').isVisible(), true, 'man kan også starte forfra');
  await page.click('#startBtn');
  const st = await state();
  assert.equal(st.score, før, 'pointene fulgte med');
  assert.ok(st.fyldte > 0, 'og klodserne står, hvor man forlod dem');

  await page.evaluate(() => window.GAME.tilMenu());
  await page.click('#nytBtn');
  assert.equal((await state()).score, 0, '«Start forfra» giver et blankt bræt');
  assert.equal((await state()).fyldte, 0);
}

/* ---------- Slut, rekord og topliste ---------- */
{
  await page.evaluate(() => {
    // Et bræt med præcis to huller i hver række og hver søjle (to ved siden af
    // hinanden, forskudt en plads for hver række). Så er ingen linje fuld, og
    // den prik man lægger, rydder ikke noget – men bagefter er der ikke plads
    // til nogen af de to store brikker, og spillet er slut.
    const hul = (x, y) => x === y || x === (y + 1) % 8;
    const felter = [];
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if (!hul(x, y)) felter.push([x, y]);
    window.GAME.saetOp(felter, ['prik', 'stor', 'stor'], 5000);
  });
  assert.equal(await page.evaluate(() => window.GAME.laeg(0, 0, 0)), true, 'prikken kan lige være der');
  const st = await state();
  assert.equal(st.fase, 'slut', 'så er der ikke plads til flere brikker');
  assert.equal(st.score, 5001);
  assert.equal(await page.locator('#slutScreen.on').isVisible(), true, 'slutskærmen kommer frem');
  assert.equal(await page.locator('#slutScore').textContent(), '5001', 'scoren står stort');
  assert.equal(await page.locator('#nyRekord').isVisible(), true, 'og det var en ny rekord');
  assert.equal(await page.evaluate(() => localStorage.getItem('zydy.blokblast.best')), '5001', 'rekorden huskes');
  assert.equal(await page.evaluate(() => localStorage.getItem('zydy.blokblast.gem')), null, 'det gemte spil er ryddet væk');
  await page.waitForFunction(() => /Selma/.test(document.getElementById('hsSlut').textContent), null, { timeout: 4000 });
  assert.ok(sendte.some(s => s.navn === 'Selma' && s.score === 5001), 'rekorden sendes selv til toplisten');
  assert.ok(sendte.every(s => Number.isInteger(s.score) && s.score > 0), 'og det er altid et rigtigt tal, der sendes');
  await page.screenshot({ path: SHOTS + 'blokblast-slut.png' });

  await page.click('#igenBtn');
  const st2 = await state();
  assert.equal(st2.score, 0, 'spil igen starter forfra');
  assert.equal(st2.fyldte, 0);
  assert.equal(st2.fase, 'spil');
  assert.equal(await page.locator('#slutScreen.on').count(), 0, 'slutskærmen er væk');
}

/* ---------- Aktivitet meldt til forsiden ---------- */
assert.ok(api.log.aktivitet.some(a => a.spil === 'blokblast' && a.ny === true), 'spillet melder én start');

/* ---------- Passer på en iPad på tværs ---------- */
{
  const pad = await browser.newContext({ ...devices['iPad (gen 7) landscape'] });
  const p2 = await pad.newPage();
  await mockApi(p2);
  await p2.goto(`${BASE}/spil/blokblast/?seed=7`);
  await p2.waitForFunction(() => !!window.GAME);
  await p2.click('#startBtn');
  const maal = await p2.evaluate(() => {
    const a = window.GAME.baasPx(0), b = window.GAME.slipPunkt(0, 2, 2);
    return { a, b, h: innerHeight, w: innerWidth };
  });
  assert.ok(maal.a.y < maal.h && maal.a.y > 0, 'bakken kan nås på en iPad');
  assert.ok(maal.b.x > 0 && maal.b.x < maal.w, 'brættet ligger inde i skærmen');
  await p2.mouse.move(maal.a.x, maal.a.y);
  await p2.mouse.down();
  await p2.mouse.move(maal.b.x, maal.b.y, { steps: 6 });
  await p2.mouse.up();
  assert.ok((await p2.evaluate(() => window.GAME.state.fyldte)) > 0, 'og man kan lægge en brik dér også');
  assert.ok(await p2.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'ingen vandret scroll på iPad');
  await p2.screenshot({ path: SHOTS + 'blokblast-ipad.png' });
  await pad.close();
}

/* ---------- Ingen vandret scroll, ingen fejl ---------- */
assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'ingen vandret scroll');
assert.deepEqual(errors, [], 'ingen console-fejl');
await browser.close();
console.log('OK blokblast');
