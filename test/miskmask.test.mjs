// Kør:  PLAYWRIGHT=/Users/lars/Projekter/DungeonCrawler/node_modules/playwright/index.mjs node test/miskmask.test.mjs
// (kræver at en lokal server kører: python3 -m http.server 4191 -d public)
//
// Spiller «Miskmask» igennem: startskærm → et rigtigt fingertryk på fladen →
// 20 runder klaret i træk → tre liv tabt → slutskærm og topliste.
// API'erne kører i hukommelsen (test/api-mock.mjs).
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

// Tom topliste, så en hvilken som helst score kvalificerer
const sendte = [];
const api = await mockApi(page);
await page.route('**/api/highscore/**', async route => {
  const req = route.request();
  if (req.method() === 'POST') {
    const krop = req.postDataJSON(); sendte.push(krop);
    return route.fulfill({ json: { ok: true, id: 1, token: 'abc', placering: 1, liste: [{ id: 1, navn: krop.navn, score: krop.score, oprettet: '2026-09-12T12:00:00.000Z' }] } });
  }
  return route.fulfill({ json: { spil: 'miskmask', retning: 'desc', min: 1, maks: 500, unik: true, liste: [] } });
});

await page.goto(`${BASE}/spil/miskmask/?seed=7`);
await page.waitForFunction(() => !!window.GAME);
const state = () => page.evaluate(() => window.GAME.state);

/* ---------- Startskærmen ---------- */
assert.equal(await page.locator('#startScreen.on').isVisible(), true, 'startskærmen vises');
assert.equal((await state()).antalMikrospil, 13, 'posen har 13 minispil');
assert.equal(await page.locator('#blanding span').count(), 13, 'og de står alle sammen på startskærmen');
await page.waitForFunction(() => document.querySelector('#hsListe .hs-titel'), null, { timeout: 4000 });
assert.match(await page.locator('#hsListe').textContent(), /Topliste/, 'toplisten står på startskærmen');
await page.screenshot({ path: SHOTS + 'miskmask-start.png' });

// Navnet skrives på startskærmen (som i Obby), så rekorden kan sendes af sig selv
await page.click('#nameBtn');
await page.fill('#nameInput', 'Selma');
await page.click('#nameForm button[type=submit]');
assert.equal(await page.evaluate(() => localStorage.getItem('zydy.navn')), 'Selma', 'navnet huskes til de andre spil');

/* ---------- Første runde: rundens overskrift kommer før man må trykke ---------- */
await page.click('#startBtn');
await page.evaluate(() => window.GAME.pause());          // vi styrer selv tiden herfra
{
  const st = await state();
  assert.equal(st.fase, 'kort', 'man får at vide hvad man skal, før tiden går');
  assert.equal(st.runde, 1);
  assert.equal(st.liv, 3, 'tre liv');
  assert.ok(st.instruktion.length > 2, 'der står hvad man skal gøre');
  assert.equal(await page.locator('#kortMsg.on').isVisible(), true, 'overskriften vises midt på fladen');
  assert.equal(await page.locator('#instruktion').textContent(), st.instruktion, 'og står i HUD’en');
}

// Et tryk under overskriften må ikke kunne koste et liv
await page.evaluate(() => window.GAME.tryk(50, 50));
assert.equal((await state()).liv, 3, 'man kan ikke nå at dumme sig, før runden er gået i gang');

/* ---------- Et rigtigt fingertryk på fladen vinder en runde ---------- */
{
  await page.evaluate(() => window.GAME.videre());        // spring overskriften over
  assert.equal((await state()).fase, 'spil');
  await page.screenshot({ path: SHOTS + 'miskmask.png' });

  // Regn facit om til skærmkoordinater og tryk med musen – så er hele vejen
  // fra finger til felt afprøvet, ikke kun window.GAME.tryk().
  const maal = await page.evaluate(() => {
    const punkt = window.GAME.facit()[0];
    const f = window.GAME.flade;
    return punkt ? { x: f.x + punkt.x / 100 * f.side, y: f.y + punkt.y / 100 * f.side } : null;
  });
  if (maal) {
    await page.mouse.click(maal.x, maal.y);
    const st = await state();
    assert.ok(st.fase === 'dom' || st.ramt > 0, 'trykket landede på det rigtige felt');
  } else {
    // «RØR IKKE!»: lad tiden gå i stedet
    await page.evaluate(() => window.GAME.lad_tiden_gaa());
  }
  await page.evaluate(() => { while (window.GAME.state.fase !== 'spil' && window.GAME.state.fase !== 'slut') window.GAME.videre(); });
  assert.equal((await state()).score >= 1, true, 'runden gav et point');
}

/* ---------- 20 runder klaret i træk: alle 13 minispil kommer forbi ---------- */
{
  const set = await page.evaluate(() => {
    const sete = [];
    for (let i = 0; i < 20 && window.GAME.state.fase !== 'slut'; i++) {
      sete.push(window.GAME.state.mikro);
      window.GAME.klar();       // spiller runden rigtigt igennem
      window.GAME.videre();     // og videre til den næste
    }
    return sete;
  });
  const st = await state();
  assert.equal(st.liv, 3, 'man mister ikke liv, når man gør det rigtige');
  assert.ok(st.score >= 20, `21 runder skulle give mindst 20 point (fik ${st.score})`);
  assert.equal(new Set(set).size >= 12, true, `der kom kun ${new Set(set).size} forskellige minispil i 20 runder`);
  assert.ok(st.tid < 5, `tiden skal være strammet til i runde ${st.runde} (${st.tid}s)`);
  assert.match(await page.locator('#rundeVal').textContent(), /Runde \d+/, 'HUD’en tæller runder');
  assert.equal(await page.locator('#scoreVal').textContent(), String(st.score), 'pointene står i toppen');
}

/* ---------- Man kan tabe: tiden løber ud tre gange ---------- */
{
  const foer = (await state()).score;
  for (let i = 0; i < 6; i++) {
    const slut = await page.evaluate(() => {
      window.GAME.videre();                 // frem til selve runden
      if (window.GAME.state.vindVedTid) { window.GAME.klar(); window.GAME.videre(); return false; }
      window.GAME.lad_tiden_gaa();          // lad være med at gøre noget
      window.GAME.videre();
      return window.GAME.state.fase === 'slut';
    });
    if (slut) break;
  }
  const st = await state();
  assert.equal(st.fase, 'slut', 'tre tabte runder slutter spillet');
  assert.equal(st.liv, 0, 'alle tre liv er væk');
  assert.equal(st.score, foer, 'en tabt runde giver ingen point');
}

/* ---------- Slutskærm, rekord og topliste ---------- */
{
  const st = await state();
  assert.equal(await page.locator('#slutScreen.on').isVisible(), true, 'slutskærmen kommer frem');
  assert.equal(await page.locator('#slutScore').textContent(), String(st.score), 'scoren står stort');
  assert.equal(await page.locator('#nyRekord').isVisible(), true, 'første omgang er altid ny rekord');
  assert.equal(await page.evaluate(() => localStorage.getItem('zydy.miskmask.best')), String(st.score), 'rekorden huskes');
  await page.waitForFunction(() => /Selma/.test(document.getElementById('hsSlut').textContent), null, { timeout: 4000 });
  assert.deepEqual(sendte, [{ navn: 'Selma', score: st.score }], 'rekorden sendes selv til toplisten');
  await page.screenshot({ path: SHOTS + 'miskmask-slut.png' });

  await page.click('#igenBtn');
  const st2 = await state();
  assert.equal(st2.runde, 1, 'spil igen starter forfra');
  assert.equal(st2.score, 0);
  assert.equal(st2.liv, 3);
  assert.equal(await page.locator('#slutScreen.on').count(), 0, 'slutskærmen er væk');
}

/* ---------- Alle 13 minispil kan tegnes og vindes gennem skærmen ---------- */
{
  await page.evaluate(() => window.GAME.tilMenu());
  const ider = ['tryk', 'roer', 'anderledes', 'balloner', 'fang', 'stoerst', 'regne', 'farve', 'bogstav', 'tael', 'bombe', 'gentag', 'orden'];
  for (const id of ider) {
    const instruktion = await page.evaluate(id => window.GAME.tvingRunde(id, 6), id);
    assert.ok(instruktion && instruktion.length > 2, `${id}: ingen instruktion`);
    assert.equal(await page.locator('#instruktion').textContent(), instruktion, `${id}: instruktionen står i HUD’en`);
    const st = await state();
    assert.equal(st.mikro, id);
    assert.ok(st.felter.length >= 1, `${id}: ingen felter tegnet`);
    if (['balloner', 'bombe', 'roer', 'tael'].includes(id)) {
      await page.waitForTimeout(60);
      await page.screenshot({ path: SHOTS + `miskmask-${id}.png` });
    }
    // Spil den igennem gennem det rigtige tryk-api
    const dom = await page.evaluate(() => (window.GAME.state.vindVedTid ? window.GAME.lad_tiden_gaa() : window.GAME.klar()));
    assert.equal(dom, 'vandt', `${id}: kunne ikke vindes gennem skærmen`);
  }
  await page.evaluate(() => window.GAME.tilMenu());
}

/* ---------- Aktivitet meldt til forsiden ---------- */
assert.ok(api.log.aktivitet.some(a => a.spil === 'miskmask' && a.ny === true), 'spillet melder én start');

/* ---------- Passer på en iPad på tværs ---------- */
{
  const pad = await browser.newContext({ ...devices['iPad (gen 7) landscape'] });
  const p2 = await pad.newPage();
  await mockApi(p2);
  await p2.goto(`${BASE}/spil/miskmask/?seed=7`);
  await p2.waitForFunction(() => !!window.GAME);
  await p2.click('#startBtn');
  await p2.evaluate(() => { window.GAME.pause(); window.GAME.videre(); });
  const flade = await p2.evaluate(() => window.GAME.flade);
  assert.ok(flade.side > 300, 'spillefladen fylder skærmen ud på en iPad');
  assert.ok(await p2.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'ingen vandret scroll på iPad');
  await p2.screenshot({ path: SHOTS + 'miskmask-ipad.png' });
  await pad.close();
}

/* ---------- Ingen vandret scroll, ingen fejl ---------- */
assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'ingen vandret scroll');
assert.deepEqual(errors, [], 'ingen console-fejl');
await browser.close();
console.log('OK miskmask');
