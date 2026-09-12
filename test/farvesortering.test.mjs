// Kør:  PLAYWRIGHT=/Users/lars/Projekter/DungeonCrawler/node_modules/playwright/index.mjs node test/farvesortering.test.mjs
// (kræver at en lokal server kører: python3 -m http.server 4183 -d public)
import assert from 'node:assert/strict';
const { chromium, devices } = await import(process.env.PLAYWRIGHT ?? 'playwright');
import { mockApi } from './api-mock.mjs';
const BASE = process.env.BASE ?? 'http://localhost:4183';
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 13'] });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

// zydy.dk's API'er i hukommelsen (aktivitet + topliste). Registreres først, så en
// mere specifik page.route nedenfor vinder over den.
const api = await mockApi(page);

await page.goto(`${BASE}/spil/farvesortering/?seed=1`);
await page.waitForFunction(() => window.GAME);

// Startskærm → Spil
assert.equal(await page.textContent('#btnContinue'), 'Spil', 'uden fremskridt hedder knappen "Spil"');
await page.click('#btnContinue');
await page.waitForSelector('#game.on');
let st = await page.evaluate(() => JSON.parse(JSON.stringify(GAME.state)));
assert.equal(st.level, 1);
assert.equal(st.tubes.length, 5, 'niveau 1: 3 farver + 2 tomme');
assert.equal(await page.locator('.tube').count(), 5, '5 glas i DOM');

// Ulovligt træk: ændrer ikke tilstand
const illegal = await page.evaluate(() => {
  const before = JSON.stringify(GAME.state.tubes);
  const t = GAME.state.tubes;
  // find et par hvor topfarverne er forskellige
  let pair = null;
  for (let a = 0; a < t.length && !pair; a++) for (let b = 0; b < t.length && !pair; b++)
    if (a !== b && t[a].length && t[b].length && t[a][t[a].length - 1] !== t[b][t[b].length - 1]) pair = [a, b];
  const r1 = GAME.pour(pair[0], pair[1]);
  const r2 = GAME.pour(0, 0);
  const r3 = GAME.pour(4, 0); // fra tomt glas
  return { r1, r2, r3, same: before === JSON.stringify(GAME.state.tubes), moves: GAME.state.moves };
});
assert.equal(illegal.r1, false); assert.equal(illegal.r2, false); assert.equal(illegal.r3, false);
assert.ok(illegal.same, 'ulovligt træk ændrer ikke glassene');
assert.equal(illegal.moves, 0);

// Fortryd: ét lovligt træk og tilbage igen
const undoRes = await page.evaluate(() => {
  const before = JSON.stringify(GAME.state.tubes);
  const sol = GAME.solve();
  const ok = GAME.pour(sol[0][0], sol[0][1]);
  const changed = before !== JSON.stringify(GAME.state.tubes);
  const movesAfter = GAME.state.moves;
  const u = GAME.undo();
  return { ok, changed, movesAfter, u, restored: before === JSON.stringify(GAME.state.tubes), moves: GAME.state.moves };
});
assert.equal(undoRes.ok, true); assert.ok(undoRes.changed); assert.equal(undoRes.movesAfter, 1);
assert.equal(undoRes.u, true); assert.ok(undoRes.restored, 'fortryd genskaber tilstanden'); assert.equal(undoRes.moves, 0);

// Rigtig klik-interaktion: vælg ét glas, klik på et lovligt mål
const legal = await page.evaluate(() => {
  const s = GAME.solve(); return s[0];
});
await page.click(`.tube[data-i="${legal[0]}"]`);
assert.ok(await page.locator(`.tube[data-i="${legal[0]}"]`).evaluate(el => el.classList.contains('sel')), 'valgt glas løftes (.sel)');
await page.click(`.tube[data-i="${legal[1]}"]`);
await page.waitForTimeout(400);
st = await page.evaluate(() => JSON.parse(JSON.stringify(GAME.state)));
assert.equal(st.moves, 1, 'klik på to glas giver ét træk');
assert.equal(await page.locator('.tube.sel').count(), 0, 'valget fjernes efter hældning');
assert.equal((await page.textContent('#pillMoves')).trim(), '1 træk');

// Løs resten via solver og tjek overlay + lagring
const solved = await page.evaluate(() => {
  const sol = GAME.solve();
  const results = sol.map(([a, b]) => GAME.pour(a, b));
  return { n: sol.length, allOk: results.every(Boolean), solved: GAME.isSolved(), flag: GAME.state.solved };
});
assert.ok(solved.n > 0, 'solve() giver en liste af træk');
assert.ok(solved.allOk, 'alle solver-træk er lovlige');
assert.ok(solved.solved && solved.flag, 'niveauet er løst');
await page.waitForSelector('#overlay.on', { timeout: 5000 });
assert.match(await page.textContent('#ovTitle'), /Niveau 1 løst/);
const saved = await page.evaluate(() => ({
  level: localStorage.getItem('zydy.farvesortering.level'),
  best: JSON.parse(localStorage.getItem('zydy.farvesortering.best')),
}));
assert.equal(saved.level, '2', 'fremskridt gemt: næste niveau er 2');
assert.equal(saved.best['1'].moves, solved.n + 1, 'bedste antal træk gemt for niveau 1');
assert.equal(saved.best['1'].help, false);

// Efter løst niveau afvises træk
assert.equal(await page.evaluate(() => GAME.pour(0, 1)), false);

// Næste niveau via overlay
await page.click('#btnNext');
await page.waitForSelector('#game.on');
assert.equal(await page.evaluate(() => GAME.state.level), 2);
assert.equal(await page.locator('#overlay.on').count(), 0);

// Niveau 12 genereres hurtigt
const t12 = await page.evaluate(() => { const t0 = performance.now(); GAME.start(12); return performance.now() - t0; });
assert.ok(t12 < 2000, `niveau 12 genereret på ${t12.toFixed(0)} ms`);
st = await page.evaluate(() => JSON.parse(JSON.stringify(GAME.state)));
assert.equal(st.tubes.length, 9, 'niveau 12: 7 farver + 2 tomme');
assert.equal(st.tubes.flat().length, 28);

// Samme seed → samme niveau hver gang
const same = await page.evaluate(() => {
  const a = JSON.stringify(GAME.state.tubes); GAME.start(12); return a === JSON.stringify(GAME.state.tubes);
});
assert.ok(same, 'niveau 12 er deterministisk');

// + glas: ét ekstra tomt glas én gang pr. niveau
const extra = await page.evaluate(() => {
  const n = GAME.state.tubes.length; const a = GAME.extraTube(); const b = GAME.extraTube();
  return { a, b, n2: GAME.state.tubes.length - n, helped: GAME.state.helped };
});
assert.deepEqual(extra, { a: true, b: false, n2: 1, helped: true });
assert.ok(await page.locator('#btnExtra').isDisabled());

// Niveau 18: 11 glas – spil nogle træk og tag screenshot
await page.evaluate(() => GAME.start(18));
st = await page.evaluate(() => JSON.parse(JSON.stringify(GAME.state)));
assert.equal(st.tubes.length, 11, 'niveau 18: 9 farver + 2 tomme');
await page.evaluate(() => { const s = GAME.solve(); for (let i = 0; i < 6; i++) GAME.pour(s[i][0], s[i][1]); });
await page.waitForTimeout(1100);
await page.click('.tube[data-i="3"]'); // et valgt (løftet) glas på billedet
await page.waitForTimeout(300);
await page.screenshot({ path: '/Users/lars/Projekter/Zydy/test/shots/farvesortering.png' });

// Layout: glassene skal ligge inden for skærmen, ingen vandret scroll
const geom = await page.evaluate(() => {
  const rs = [...document.querySelectorAll('.tube')].map(e => e.getBoundingClientRect());
  return {
    scrollW: document.documentElement.scrollWidth, innerW: innerWidth,
    minX: Math.min(...rs.map(r => r.left)), maxX: Math.max(...rs.map(r => r.right)),
    minY: Math.min(...rs.map(r => r.top)), maxY: Math.max(...rs.map(r => r.bottom)), innerH: innerHeight,
    minW: Math.min(...rs.map(r => r.width)),
    ctrl: document.querySelector('.controls').getBoundingClientRect().bottom,
  };
});
assert.ok(geom.scrollW <= geom.innerW, 'ingen vandret scroll');
assert.ok(geom.minX >= 0 && geom.maxX <= geom.innerW, 'glas inden for bredden');
assert.ok(geom.minY >= 40 && geom.maxY <= geom.innerH, 'glas inden for højden');
assert.ok(geom.ctrl <= geom.innerH, 'knapper synlige uden scroll');
assert.ok(geom.minW >= 40, `glas er brede nok til at trykke på (${geom.minW}px)`);

// Startskærm efter reload viser "Fortsæt fra niveau 2"
await page.goto(`${BASE}/spil/farvesortering/?seed=1`);
await page.waitForFunction(() => window.GAME);
assert.equal((await page.textContent('#btnContinue')).trim(), 'Fortsæt fra niveau 2');
assert.ok(await page.locator('#btnFromOne').isVisible(), '"Start forfra" vises når der er fremskridt');

assert.deepEqual(errors, [], 'ingen console-fejl');
await browser.close();
console.log('OK farvesortering');
