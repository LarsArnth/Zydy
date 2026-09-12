// Kør:  PLAYWRIGHT=/Users/lars/Projekter/DungeonCrawler/node_modules/playwright/index.mjs node test/ordstige.test.mjs
// (kræver at en lokal server kører: python3 -m http.server 4184 -d public)
import assert from 'node:assert/strict';
const { chromium, devices } = await import(process.env.PLAYWRIGHT ?? 'playwright');
import { mockApi } from './api-mock.mjs';
const BASE = process.env.BASE ?? 'http://localhost:4184';
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 13'] });
const page = await ctx.newPage();
const errors = [];
const logs = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); else logs.push(m.text()); });

// zydy.dk's API'er i hukommelsen (aktivitet + topliste). Registreres først, så en
// mere specifik page.route nedenfor vinder over den.
const api = await mockApi(page);

await page.goto(`${BASE}/spil/ordstige/?seed=7`);
await page.waitForFunction(() => window.GAME && typeof window.GAME.buildMs === 'number');

// Graf-opbygning skal være hurtig
const buildMs = await page.evaluate(() => GAME.buildMs);
console.log(`graf bygget på ${buildMs.toFixed(1)} ms`);
assert.ok(buildMs < 1500, 'grafopbygning < 1,5 s');

// Startskærm: eksempel er rigtige ord der adskiller sig i ét bogstav
const example = await page.evaluate(() => [...document.querySelectorAll('#example .row')].map(r => r.textContent));
assert.equal(example.length, 4, 'eksempel har 4 ord');
for (const w of example) assert.ok(await page.evaluate(w => GAME.isWord(w), w), `eksempelord "${w}" findes`);
for (let i = 1; i < example.length; i++) {
  const d = [...example[i]].filter((c, k) => c !== example[i - 1][k]).length;
  assert.equal(d, 1, 'eksempel skifter ét bogstav pr. trin');
}

// Start tilfældig stige med URL-seed
await page.click('#btn-random');
let st = await page.evaluate(() => GAME.state);
assert.equal(st.seed, 7, 'seed fra URL bruges');
assert.equal(st.start.length, 5); assert.equal(st.target.length, 5);
assert.ok(st.par >= 4 && st.par <= 6, `par mellem 4 og 6 (var ${st.par})`);
assert.notEqual(st.start, st.target);
assert.deepEqual(st.steps, [st.start]);
assert.ok(await page.isVisible('#game'), 'spilskærm vises');
assert.equal(await page.textContent('#pill'), `Trin 0 · par ${st.par}`);
assert.equal(await page.$eval('#target', el => el.textContent), st.target, 'målord vises i toppen');

// Afvisninger: ikke-ord, to ændrede bogstaver, samme ord
const cur = st.start;
const nonWord = cur.slice(0, 4) + (cur[4] === 'q' ? 'x' : 'q');
let r = await page.evaluate(w => GAME.tryWord(w), nonWord);
if (await page.evaluate(w => GAME.isWord(w), nonWord)) console.log('(tilfældigvis et ord, springer notword over)');
else assert.deepEqual(r, { ok: false, reason: 'notword' });
r = await page.evaluate(w => GAME.tryWord(w), cur);
assert.deepEqual(r, { ok: false, reason: 'same' });
// Et rigtigt ord med to ændrede bogstaver: find et ord i afstand 2
const two = await page.evaluate(cur => {
  for (const n of GAME.neighbors(cur)) for (const m of GAME.neighbors(n)) {
    let d = 0; for (let i = 0; i < 5; i++) if (m[i] !== cur[i]) d++;
    if (d === 2) return m;
  }
  return null;
}, cur);
assert.ok(two, 'fandt ord i afstand 2');
r = await page.evaluate(w => GAME.tryWord(w), two);
assert.deepEqual(r, { ok: false, reason: 'diff' }, 'ord med 2 ændrede bogstaver afvises');
assert.equal((await page.evaluate(() => GAME.state)).steps.length, 1, 'ingen trin lagt');

// Skærmtastatur via DOM: vælg en position, tryk et bogstav -> nyt trin
const nb = await page.evaluate(cur => GAME.neighbors(cur)[0], cur);
const pos = [...nb].findIndex((c, i) => c !== cur[i]);
await page.click(`#ladder .row.current .tile[data-pos="${pos}"]`);
assert.equal(await page.evaluate(() => GAME.selected), pos, 'flise valgt');
assert.ok(await page.$(`#ladder .row.current .tile[data-pos="${pos}"].sel`), 'valgt flise har .sel');
await page.click(`.key[data-key="${nb[pos]}"]`);
st = await page.evaluate(() => GAME.state);
assert.deepEqual(st.steps, [cur, nb], 'skærmtastatur lagde et trin');
assert.equal(await page.$$eval('#ladder .row', rs => rs.length), 2, 'to rækker i stigen');
assert.equal(await page.textContent('#pill'), `Trin 1 · par ${st.par}`);

// Ugyldigt via tastatur: toast "Ikke et ord" (find et bogstav der ikke giver et ord)
const badLetter = await page.evaluate(([w, pos]) => {
  for (const ch of 'abcdefghijklmnopqrstuvwxyzæøå') {
    const c = w.slice(0, pos) + ch + w.slice(pos + 1);
    if (c !== w && !GAME.isWord(c)) return ch;
  }
  return null;
}, [nb, pos]);
await page.click(`#ladder .row.current .tile[data-pos="${pos}"]`);
await page.click(`.key[data-key="${badLetter}"]`);
assert.ok(await page.$eval('#toast', t => t.classList.contains('on') && t.textContent === 'Ikke et ord'), 'toast vises');
assert.equal((await page.evaluate(() => GAME.state)).steps.length, 2, 'ugyldigt ord lagde ikke trin');

// Fortryd
await page.click('#btn-undo');
st = await page.evaluate(() => GAME.state);
assert.deepEqual(st.steps, [cur], 'fortryd fjernede trinnet');
assert.ok(await page.$eval('#btn-undo', b => b.disabled), 'fortryd deaktiveret ved start');

// Fysisk tastatur: pile flytter valget, bogstav sætter
await page.click(`#ladder .row.current .tile[data-pos="0"]`);
await page.keyboard.press('ArrowRight');
assert.equal(await page.evaluate(() => GAME.selected), 1, 'pil højre flytter valg');
await page.keyboard.press('ArrowLeft');
assert.equal(await page.evaluate(() => GAME.selected), 0, 'pil venstre flytter valg');
await page.click(`#ladder .row.current .tile[data-pos="${pos}"]`);
await page.keyboard.press(nb[pos]);
st = await page.evaluate(() => GAME.state);
assert.deepEqual(st.steps, [cur, nb], 'fysisk tastatur lagde et trin');
await page.evaluate(() => GAME.undo());

// Gå løsningen med tryWord; det sidste ord skal vinde
const path = await page.evaluate(() => GAME.solve());
assert.equal(path.length, st.par, 'solve() giver par trin fra start');
for (let i = 0; i < path.length; i++) {
  if (i === Math.floor(path.length / 2)) {
    // Screenshot midt i spillet (vent på at toast og indgangsanimation er færdige)
    await page.waitForTimeout(1200);
    await page.screenshot({ path: '/Users/lars/Projekter/Zydy/test/shots/ordstige.png' });
  }
  const res = await page.evaluate(w => GAME.tryWord(w), path[i]);
  assert.ok(res.ok, `trin ${i + 1} (${path[i]}) accepteres`);
  if (i < path.length - 1) assert.equal(res.reason, 'step'); else assert.equal(res.reason, 'won');
}
st = await page.evaluate(() => GAME.state);
assert.equal(st.done, true); assert.equal(st.won, true);
await page.waitForSelector('#end.on', { timeout: 3000 });
assert.equal(await page.textContent('#end-title'), 'Perfekt!', 'par-løsning giver Perfekt!');
assert.match(await page.textContent('#end-sub'), new RegExp(`på ${st.par} trin \\(par ${st.par}\\)`));
let stats = await page.evaluate(() => JSON.parse(localStorage.getItem('zydy.ordstige.stats')));
assert.equal(stats.played, 1); assert.equal(stats.won, 1); assert.equal(stats.diffSum, 0);
assert.deepEqual(await page.evaluate(w => GAME.tryWord(w), st.start), { ok: false, reason: 'done' });

// Ingen vandret scroll
assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'ingen vandret scroll');

// Vis løsning = tabt
await page.click('#end-random');
assert.ok(!(await page.$eval('#end', e => e.classList.contains('on'))), 'overlay lukket ved nyt spil');
st = await page.evaluate(() => GAME.state);
assert.ok(st.par >= 4 && st.par <= 6);
await page.click('#btn-solve');
st = await page.evaluate(() => GAME.state);
assert.equal(st.done, true); assert.equal(st.won, false);
assert.equal(await page.$$eval('#ladder .row.solution', rs => rs.length), st.par, 'løsningen vises i dæmpede fliser');
await page.waitForSelector('#end.on', { timeout: 3000 });
stats = await page.evaluate(() => JSON.parse(localStorage.getItem('zydy.ordstige.stats')));
assert.equal(stats.played, 2); assert.equal(stats.won, 1);

// Dagens stige: spil færdig, genindlæs, resultatet vises igen og kan ikke spilles igen
await page.goto(`${BASE}/spil/ordstige/`);
await page.waitForFunction(() => window.GAME);
await page.click('#btn-daily');
st = await page.evaluate(() => GAME.state);
assert.equal(st.mode, 'daily');
assert.equal(st.day, await page.evaluate(() => GAME.dayNumber()));
const dpath = await page.evaluate(() => GAME.solve());
for (const w of dpath) await page.evaluate(w => GAME.tryWord(w), w);
await page.waitForSelector('#end.on', { timeout: 3000 });
stats = await page.evaluate(() => JSON.parse(localStorage.getItem('zydy.ordstige.stats')));
assert.equal(stats.streak, 1, 'streak 1 efter dagens');
const dailySaved = await page.evaluate(() => JSON.parse(localStorage.getItem('zydy.ordstige.daily')));
assert.equal(dailySaved.won, true);
await page.reload();
await page.waitForFunction(() => window.GAME);
assert.match(await page.textContent('#daily-note'), /spillet/);
await page.click('#btn-daily');
assert.ok(await page.$eval('#end', e => e.classList.contains('on')), 'resultat vises igen');
st = await page.evaluate(() => GAME.state);
assert.equal(st.done, true);
assert.deepEqual(st.steps, dailySaved.steps);
assert.equal(await page.$$eval('#ladder .row', rs => rs.length), dailySaved.steps.length);
stats = await page.evaluate(() => JSON.parse(localStorage.getItem('zydy.ordstige.stats')));
assert.equal(stats.played, 3, 'genåbning tæller ikke som nyt spil');

assert.deepEqual(errors, [], 'ingen console-fejl');
await browser.close();
console.log('OK ordstige');
