// Kør:  PLAYWRIGHT=/Users/lars/Projekter/DungeonCrawler/node_modules/playwright/index.mjs node test/taarn.test.mjs
// (kræver at en lokal server kører: python3 -m http.server <PORT> -d public)
import assert from 'node:assert/strict';
const { chromium, devices } = await import(process.env.PLAYWRIGHT ?? 'playwright');
const BASE = process.env.BASE ?? 'http://localhost:4181';
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 13'] });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
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
await page.evaluate(() => {
  const s = window.GAME.state, top = s.blocks[s.blocks.length - 1];
  window.GAME.setMovingX(top.x + top.w + 60);
  window.GAME.drop();
});
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

// Efter et par sekunder vælter tårnet: det svajer, og blokkene falder fra hinanden.
// tumbleNow() springer ventetiden over, så testen ikke skal vente 3 s.
assert.equal((await state()).tumble, null, 'tårnet står stille lige efter game over');
await page.evaluate(() => window.GAME.tumbleNow());
await page.waitForFunction(() => window.GAME.state.tumble === 'wobble', null, { timeout: 2000 });
await page.waitForFunction(() => window.GAME.state.tumble === 'fall', null, { timeout: 4000 });
await page.waitForTimeout(500);
await page.screenshot({ path: '/Users/lars/Projekter/Zydy/test/shots/taarn-vaelter.png' });
s = await state();
assert.equal(s.score, 4, 'score uændret mens tårnet vælter');
assert.equal(s.blocks.length, 5, 'blokkene i state er uændrede');
await page.waitForFunction(() => window.GAME.state.tumble === 'done', null, { timeout: 8000 });

// Spil igen → nyt spil, best bevaret
await page.getByRole('button', { name: 'Spil igen' }).click();
await page.waitForFunction(() => window.GAME.state.running);
s = await state();
assert.equal(s.score, 0);
assert.equal(s.best, 4);
assert.equal(s.blocks.length, 1);
assert.equal(s.tumble, null, 'væltet er nulstillet ved nyt spil');

// Genindlæs: best læses fra localStorage
await page.reload();
assert.equal(await page.locator('#bestPill').textContent(), 'Bedste: 4');

assert.deepEqual(errors, [], 'ingen console-fejl');
await browser.close();
console.log('OK taarn');
