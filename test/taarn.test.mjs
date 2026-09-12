// Kør:  PLAYWRIGHT=/Users/lars/Projekter/DungeonCrawler/node_modules/playwright/index.mjs node test/taarn.test.mjs
// (kræver at en lokal server kører: python3 -m http.server <PORT> -d public)
// Højscore-API'et (/api/highscore/taarn) mockes med page.route, så testen ikke
// kræver wrangler dev eller netværk. Selve API'et testes i test/unit/highscore.test.mjs.
import assert from 'node:assert/strict';
const { chromium, devices } = await import(process.env.PLAYWRIGHT ?? 'playwright');
const BASE = process.env.BASE ?? 'http://localhost:4181';
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 13'] });
const page = await ctx.newPage();
const errors = [];
let forventetFejl = false;   // sættes når testen selv lader API'et svare 500
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => {
  if (m.type() !== 'error') return;
  if (forventetFejl && m.text().includes('500')) return;   // browserens egen "Failed to load resource"
  errors.push(m.text());
});

// Mock af højscore-API'et: starter med en fuld top 10 (scores 200..191), så score 4 ikke kvalificerer.
let liste = Array.from({ length: 10 }, (_, i) => ({ id: 100 + i, navn: 'Spiller ' + (i + 1), score: 200 - i, oprettet: '2026-09-12T10:00:00.000Z' }));
const sendte = [];
await page.route('**/api/highscore/**', async route => {
  const req = route.request();
  if (req.method() === 'POST') {
    const krop = req.postDataJSON(); sendte.push(krop);
    const ny = { id: 999, navn: krop.navn, score: krop.score, oprettet: '2026-09-12T12:00:00.000Z' };
    liste = [...liste, ny].sort((a, b) => b.score - a.score || a.oprettet.localeCompare(b.oprettet)).slice(0, 10);
    const idx = liste.findIndex(r => r.id === 999);
    return route.fulfill({ json: { ok: true, id: 999, placering: idx === -1 ? null : idx + 1, liste } });
  }
  return route.fulfill({ json: { spil: 'taarn', liste } });
});

await page.goto(`${BASE}/spil/taarn/?seed=1`);

// Startskærm og "Spil"
assert.ok(await page.locator('#startScreen.on').isVisible(), 'startskærmen vises');
await page.getByRole('button', { name: 'Spil', exact: true }).click();
await page.waitForFunction(() => window.GAME.state.running);
await page.waitForTimeout(200); // forbi dobbelt-tryk-beskyttelsen

const state = () => page.evaluate(() => window.GAME.state);
const W0 = (await state()).startWidth;

// Tre perfekte drops: moving.x = topblokkens x
for (let i = 0; i < 3; i++) {
  await page.evaluate(() => {
    const s = window.GAME.state, top = s.blocks[s.blocks.length - 1];
    window.GAME.setMovingX(top.x);
    window.GAME.drop();
  });
}
let s = await state();
assert.equal(s.score, 3, 'score efter 3 perfekte');
assert.equal(s.streak, 3, 'perfekt-streak 3');
assert.equal(s.blocks.length, 4);
assert.ok(Math.abs(s.blocks[3].w - W0) < 0.01, 'perfekt beholder bredden');
assert.equal(await page.locator('#score').textContent(), '3');
assert.ok((await page.locator('#streak').textContent()).includes('3'), 'streak vises i UI');
assert.ok(await page.locator('#streak').evaluate(el => el.classList.contains('on')));

// Ét skævt drop (30 px til højre) → bredden bliver 30 px mindre, streak nulstilles
await page.evaluate(() => {
  const s = window.GAME.state, top = s.blocks[s.blocks.length - 1];
  window.GAME.setMovingX(top.x + 30);
  window.GAME.drop();
});
s = await state();
assert.equal(s.score, 4);
assert.equal(s.streak, 0, 'streak nulstillet');
const topAfter = s.blocks[s.blocks.length - 1];
assert.ok(Math.abs(topAfter.w - (W0 - 30)) < 0.01, `bredden skæres til ${W0 - 30}, fik ${topAfter.w}`);
assert.ok(Math.abs(s.moving.w - topAfter.w) < 0.01, 'næste blok har den nye bredde');

// Screenshot midt i spillet (mens det afskårne stykke falder)
await page.waitForTimeout(250);
await page.screenshot({ path: '/Users/lars/Projekter/Zydy/test/shots/taarn.png' });

// Ingen vandret scroll
const noScroll = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
assert.ok(noScroll, 'ingen vandret scroll');

// Et drop helt forbi → game over, best gemt
const miss = () => page.evaluate(() => {
  const s = window.GAME.state, top = s.blocks[s.blocks.length - 1];
  window.GAME.setMovingX(top.x + top.w + 60);
  window.GAME.drop();
});
await miss();
s = await state();
assert.equal(s.running, false, 'spillet kører ikke efter miss');
assert.equal(s.score, 4, 'score uændret ved miss');
await page.waitForSelector('#overScreen.on', { timeout: 4000 });
assert.equal(await page.locator('#overScore').textContent(), '4');
assert.equal(await page.locator('#overBest').textContent(), 'Bedste: 4');
assert.ok(await page.locator('#rekord.on').isVisible(), '"Ny rekord!" vises første gang');
const stored = await page.evaluate(() => localStorage.getItem('zydy.taarn.best'));
assert.equal(stored, '4', 'highscore gemt i localStorage');
assert.equal(await page.locator('#bestPill').textContent(), 'Bedste: 4');

// Toplisten er fuld med højere scorer → ingen navneformular, bare listen med 10 rækker
await page.waitForSelector('#hs .hs-liste');
assert.equal(await page.locator('#hs .hs-raekke').count(), 10, 'top 10 vises');
assert.equal(await page.locator('#hs .hs-form').count(), 0, 'score 4 kvalificerer ikke til en fuld liste');
assert.equal(await page.locator('#hs .hs-raekke').first().locator('.hs-navn').textContent(), 'Spiller 1');
assert.equal(sendte.length, 0, 'intet sendt til API\'et');

// Spil igen → nyt spil, best bevaret
await page.getByRole('button', { name: 'Spil igen' }).click();
await page.waitForFunction(() => window.GAME.state.running);
s = await state();
assert.equal(s.score, 0);
assert.equal(s.best, 4);
assert.equal(s.blocks.length, 1);

// Runde 2 med kun tre på listen: score 2 kvalificerer → navneformular → gem → fremhævet på listen
liste = liste.slice(0, 3);
await page.waitForTimeout(200);
for (let i = 0; i < 2; i++) {
  await page.evaluate(() => {
    const s = window.GAME.state, top = s.blocks[s.blocks.length - 1];
    window.GAME.setMovingX(top.x);
    window.GAME.drop();
  });
}
await miss();
await page.waitForSelector('#overScreen.on', { timeout: 4000 });
assert.equal(await page.locator('#overScore').textContent(), '2');
assert.equal(await page.locator('#rekord.on').count(), 0, 'ikke personlig rekord (best er 4)');
await page.waitForSelector('#hs .hs-form');
assert.ok((await page.locator('#hs .hs-titel').textContent()).includes('toplisten'), 'forklarer at man er på listen');
const input = page.locator('#hs .hs-input');
assert.equal(await input.inputValue(), '', 'intet navn husket endnu');
await input.fill('Sofie');
// Mellemrum i feltet må ikke starte et nyt spil
await input.press('Space');
assert.equal((await state()).running, false, 'mellemrum i navnefeltet starter ikke spillet');
await input.fill('Sofie');
await page.getByRole('button', { name: 'Gem på listen' }).click();
await page.waitForSelector('#hs .hs-mig');
assert.deepEqual(sendte, [{ navn: 'Sofie', score: 2 }], 'navn og score sendt til API\'et');
assert.equal(await page.locator('#hs .hs-mig .hs-navn').textContent(), 'Sofie');
assert.equal(await page.locator('#hs .hs-mig .hs-nr').textContent(), '4', 'nr. 4 efter de tre på 200, 199, 198');
assert.equal(await page.locator('#hs .hs-titel').textContent(), 'Gemt som nr. 4');
assert.equal(await page.locator('#hs .hs-raekke').count(), 4);
assert.equal(await page.evaluate(() => localStorage.getItem('zydy.navn')), 'Sofie', 'navnet huskes til næste gang');
await page.screenshot({ path: '/Users/lars/Projekter/Zydy/test/shots/taarn-topliste.png' });

// Genindlæs: best læses fra localStorage; "Topliste" på startskærmen viser listen (nu 4 rækker)
await page.reload();
assert.equal(await page.locator('#bestPill').textContent(), 'Bedste: 4');
await page.getByRole('button', { name: 'Topliste' }).click();
await page.waitForSelector('#listScreen.on .hs-liste');
assert.equal(await page.locator('#hsListe .hs-raekke').count(), 4);
assert.equal(await page.locator('#hsListe .hs-form').count(), 0, 'ingen formular uden score');
await page.getByRole('button', { name: 'Tilbage' }).click();
assert.ok(await page.locator('#startScreen.on').isVisible(), 'tilbage på startskærmen');

// Fejl fra API'et må ikke vælte spillet
forventetFejl = true;
await page.unroute('**/api/highscore/**');
await page.route('**/api/highscore/**', route => route.fulfill({ status: 500, json: { ok: false, fejl: 'test' } }));
await page.getByRole('button', { name: 'Topliste' }).click();
await page.waitForSelector('#hsListe .hs-fejl');

assert.deepEqual(errors, [], 'ingen console-fejl');
await browser.close();
console.log('OK taarn');
