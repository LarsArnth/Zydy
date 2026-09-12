// Kør:  PLAYWRIGHT=/Users/lars/Projekter/DungeonCrawler/node_modules/playwright/index.mjs node test/kryds.test.mjs
// (kræver at en lokal server kører: python3 -m http.server 4185 -d public)
import assert from 'node:assert/strict';
import { mockApi } from './api-mock.mjs';
const { chromium, devices } = await import(process.env.PLAYWRIGHT ?? 'playwright');
const BASE = process.env.BASE ?? 'http://localhost:4185';
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 13'] });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
const api = await mockApi(page);        // aktivitets-API'et i hukommelsen
await page.goto(`${BASE}/spil/kryds/?seed=7`);

const s = () => page.evaluate(() => ({ ...GAME.state, braet: [...GAME.state.braet] }));
const traek = i => page.evaluate(i => GAME.traek(i), i);
const ventTur = () => page.waitForFunction(() => GAME.state.faerdig || !GAME.state.venter, null, { timeout: 5000 });

await page.evaluate(() => { GAME.fast = true; });   // ingen tænkepause for computeren

/* ---------- Startskærmen ---------- */
assert.equal(await page.locator('#niveauBoks').isVisible(), true, 'sværhedsgrad vises for "Mod computeren"');
assert.match(await page.locator('#forklaring').textContent(), /blokerer/, 'Mellem er valgt fra start');
await page.screenshot({ path: '/Users/lars/Projekter/Zydy/test/shots/kryds-start.png' });
await page.click('#tilstandSeg button[data-tilstand="pvp"]');
assert.equal(await page.locator('#niveauBoks').isVisible(), false, 'sværhedsgrad skjules i to-spiller-tilstand');

/* ---------- To spillere: kryds vinder øverste række ---------- */
await page.click('#spilBtn');
assert.equal(await page.locator('#spil').isVisible(), true, 'spilskærmen vises');
assert.equal(await page.locator('.felt').count(), 9, 'ni felter');
assert.match(await page.locator('#status').textContent(), /Kryds/, 'kryds begynder');

await page.click('.felt[data-i="0"]');                       // x
assert.match(await page.locator('#status').textContent(), /Bolle/, 'turen skifter efter et tryk');
assert.equal(await page.locator('.felt[data-i="0"]').isDisabled(), true, 'et optaget felt kan ikke trykkes igen');
await page.click('.felt[data-i="3"]');                       // o
await page.click('.felt[data-i="1"]');                       // x
await page.click('.felt[data-i="4"]');                       // o
await page.click('.felt[data-i="2"]');                       // x vinder 0-1-2

{
  const st = await s();
  assert.equal(st.faerdig, true, 'partiet er slut');
  assert.equal(st.resultat, 'x');
  assert.deepEqual(st.linje, [0, 1, 2]);
  assert.match(await page.locator('#status').textContent(), /Kryds vandt/);
  await page.waitForFunction(() => { const e = document.getElementById('streg'); return !e.hidden && parseFloat(e.style.width) > 0; },
    null, { timeout: 2000 });   // stregen tegnes i næste frame
  assert.match(await page.locator('#spilStilling').textContent(), /Kryds 1/);
  await page.waitForTimeout(500);                            // lad stregen og brikkerne blive tegnet færdig
  await page.screenshot({ path: '/Users/lars/Projekter/Zydy/test/shots/kryds.png' });
  assert.equal(await page.locator('.felt[data-i="5"]').isDisabled(), true, 'brættet er låst efter sejr');
}

// Nyt spil: brættet ryddes, og bolle begynder denne gang
await page.click('#igenBtn');
{
  const st = await s();
  assert.deepEqual(st.braet, Array(9).fill(''), 'brættet er ryddet');
  assert.equal(st.starter, 'o', 'startspilleren skifter');
  assert.equal(st.tur, 'o');
  assert.equal(await page.evaluate(() => document.getElementById('streg').hidden), true, 'stregen er væk');
}

// Spil uafgjort: o x o / o x x / x o x
for (const i of [0, 4, 2, 1, 7, 6, 3, 5, 8]) await page.click(`.felt[data-i="${i}"]`);
{
  const st = await s();
  assert.equal(st.resultat, 'lige', 'uafgjort');
  assert.equal(st.linje, null);
  assert.match(await page.locator('#status').textContent(), /Uafgjort/);
  assert.match(await page.locator('#spilStilling').textContent(), /Uafgjort 1/);
}

/* ---------- Mod computeren på Svær: den kan ikke slås ---------- */
await page.click('#menuBtn');
assert.equal(await page.locator('#start').isVisible(), true, 'tilbage på startskærmen');
await page.click('#tilstandSeg button[data-tilstand="ai"]');
await page.click('#niveauSeg button[data-niveau="svaer"]');
assert.match(await page.locator('#forklaring').textContent(), /perfekt/);
await page.click('#spilBtn');
assert.match(await page.locator('#spilPill').textContent(), /Svær/);

for (let parti = 0; parti < 4; parti++) {
  if (parti) await page.click('#igenBtn');
  await ventTur();
  while (!(await s()).faerdig) {
    // Spilleren vælger et tilfældigt ledigt felt; computeren svarer af sig selv
    const felt = await page.evaluate(() => {
      const l = GAME.ledige();
      return l[Math.floor(Math.random() * l.length)];
    });
    await traek(felt);
    await ventTur();
  }
  const st = await s();
  assert.notEqual(st.resultat, 'x', `Svær taber ikke (parti ${parti + 1})`);
  assert.ok(st.resultat === 'o' || st.resultat === 'lige');
  if (parti === 0) assert.equal(st.starter, 'x', 'du begynder det første parti mod computeren');
  if (parti === 1) assert.equal(st.starter, 'o', 'computeren begynder det næste');
}
assert.equal(await page.evaluate(() => GAME.state.stilling.x), 0, 'ingen sejre mod Svær');
assert.match(await page.locator('#spilStilling').textContent(), /Dig 0/);

/* ---------- Nem kan slås ---------- */
await page.click('#menuBtn');
await page.click('#niveauSeg button[data-niveau="nem"]');
await page.click('#spilBtn');
let sejre = 0;
for (let parti = 0; parti < 12; parti++) {
  if (parti) await page.click('#igenBtn');
  await ventTur();
  while (!(await s()).faerdig) {
    // Spilleren spiller perfekt (samme minimax som Svær bruger)
    const felt = await page.evaluate(async () => {
      const m = await import('/spil/kryds/motor.mjs');
      return m.bedsteTraek(GAME.state.braet, 'x', 'svaer');
    });
    await traek(felt);
    await ventTur();
  }
  if ((await s()).resultat === 'x') sejre++;
}
assert.ok(sejre > 0, `Nem kan slås (vundet ${sejre} af 12)`);

/* ---------- Statistik gemmes ---------- */
const stats = await page.evaluate(() => JSON.parse(localStorage.getItem('zydy.kryds.stats')));
assert.equal(stats.partier, 2 + 4 + 12, 'alle partier er talt med');
assert.equal(stats.sejre, sejre, 'sejre mod computeren er talt');

/* ---------- Aktivitet meldt til forsiden ---------- */
assert.ok(api.log.aktivitet.some(a => a.spil === 'kryds' && a.ny === true), 'spillet melder én start');

/* ---------- Ingen vandret scroll, ingen fejl ---------- */
assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'ingen vandret scroll');
assert.deepEqual(errors, [], 'ingen console-fejl');
await browser.close();
console.log('OK kryds');
