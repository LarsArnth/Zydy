// Kør:  PLAYWRIGHT=/Users/lars/Projekter/DungeonCrawler/node_modules/playwright/index.mjs node test/obby.test.mjs
// (kræver at en lokal server kører: python3 -m http.server <PORT> -d public)
// Højscore-API'et (/api/highscore/obby) mockes med page.route. Spillet køres med
// fysikken sat på pause (GAME.pause) og trinvis (GAME.tick), så en lille bot kan
// spille deterministisk: den hopper, når GAME.simJump() siger, at hoppet lander
// på en ny platform (eller på den anden side af laseren).
import assert from 'node:assert/strict';
const { chromium, devices } = await import(process.env.PLAYWRIGHT ?? 'playwright');
import { mockApi } from './api-mock.mjs';
const BASE = process.env.BASE ?? 'http://localhost:4181';
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 13'] });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

let liste = [
  { id: 1, navn: 'Simon', score: 40, oprettet: '2026-09-12T10:00:00.000Z' },
  { id: 2, navn: 'Far', score: 25, oprettet: '2026-09-12T10:01:00.000Z' },
  { id: 3, navn: 'Mor', score: 9, oprettet: '2026-09-12T10:02:00.000Z' },
];
const sendte = [], patchede = [];
// zydy.dk's API'er i hukommelsen (aktivitet + topliste). Registreres først, så en
// mere specifik page.route nedenfor vinder over den.
const api = await mockApi(page);

await page.route('**/api/highscore/**', async route => {
  const req = route.request();
  const regler = { retning: 'desc', min: 1, maks: 10000, unik: true };
  if (req.method() === 'POST') {
    const krop = req.postDataJSON(); sendte.push(krop);
    liste = liste.filter(r => r.navn.toLowerCase() !== krop.navn.toLowerCase());
    liste = [...liste, { id: 99, navn: krop.navn, score: krop.score, oprettet: '2026-09-12T12:00:00.000Z' }]
      .sort((a, b) => b.score - a.score).slice(0, 10);
    return route.fulfill({ json: { ok: true, id: 99, token: 'hemmelig', placering: liste.findIndex(r => r.id === 99) + 1, ...regler, liste } });
  }
  if (req.method() === 'PATCH') {
    const krop = req.postDataJSON(); patchede.push({ sti: new URL(req.url()).pathname, ...krop });
    if (krop.token !== 'hemmelig') return route.fulfill({ status: 403, json: { ok: false, fejl: 'Forkert token' } });
    liste = liste.map(r => r.id === 99 ? { ...r, navn: krop.navn } : r);
    return route.fulfill({ json: { ok: true, id: 99, placering: liste.findIndex(r => r.id === 99) + 1, ...regler, liste } });
  }
  return route.fulfill({ json: { spil: 'obby', ...regler, liste } });
});

await page.goto(`${BASE}/spil/obby/?seed=1`);

/* ---------- Startskærm: topliste øverst, Rekord og Name nedenunder ---------- */
assert.ok(await page.locator('#startScreen.on').isVisible(), 'startskærmen vises');
await page.waitForSelector('#hsListe .hs-liste');
assert.equal(await page.locator('#hsListe .hs-raekke').count(), 3, 'toplisten hentes og vises');
assert.equal(await page.locator('#hsListe .hs-raekke').first().locator('.hs-navn').textContent(), 'Simon');
const foer = await page.evaluate(() => {
  const a = document.getElementById('hsListe'), b = document.getElementById('rekordVal'), c = document.getElementById('nameBtn');
  return (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) && (b.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING);
});
assert.ok(foer, 'toplisten står før Rekord, og Rekord står før Name');
assert.equal(await page.locator('#rekordVal').textContent(), '0');
assert.equal(await page.locator('#nameBtn').textContent(), 'Name');

// Skriv navn
await page.locator('#nameBtn').click();
const input = page.locator('#nameInput');
await input.fill('Sofie');
await input.press('Space');                     // mellemrum i feltet må ikke starte spillet
assert.ok(await page.locator('#startScreen.on').isVisible(), 'mellemrum i navnefeltet starter ikke spillet');
await input.fill('Sofie');
await input.press('Enter');
assert.ok((await page.locator('#nameBtn').textContent()).startsWith('Sofie'), 'knappen viser navnet');
assert.equal(await page.evaluate(() => localStorage.getItem('zydy.navn')), 'Sofie', 'navnet huskes (fælles med de andre spil)');
await page.screenshot({ path: '/Users/lars/Projekter/Zydy/test/shots/obby-start.png' });

/* ---------- Banen: laser på hver anden, checkpoint på hver femte ---------- */
const st0 = await page.evaluate(() => window.GAME.state);
assert.equal(st0.phase, 'menu');
for (const pl of st0.platforms) {
  if (pl.i % 5 === 0) { assert.ok(pl.checkpoint, `platform ${pl.i} er checkpoint`); assert.ok(!pl.laser, 'checkpoints har ingen laser'); }
  else if (pl.i >= 3) assert.equal(pl.laser, pl.i % 2 === 1, `laser på hver anden (platform ${pl.i})`);
  assert.ok(pl.y >= 3 && pl.y <= 8, 'platformen ligger i båndet over lavaen');
}
assert.ok(st0.platforms.some(pl => pl.laser), 'der er lasere i banen');

/* ---------- Spil: bot hopper sig gennem 120 platforme ---------- */
await page.getByRole('button', { name: 'Spil', exact: true }).click();
let s = await page.evaluate(() => window.GAME.state);
assert.equal(s.phase, 'ready', 'spilleren står klar på første platform');
assert.equal(s.player.on, 0);
assert.ok(await page.locator('#readyHint.on').isVisible());
assert.ok(!(await page.locator('#menuBtn').isHidden()), 'Menu-knappen vises under spil');

const bot = (maal) => page.evaluate(({ maal }) => {
  const G = window.GAME, DT = 1 / 120;
  G.pause();
  if (G.state.phase === 'ready') G.jump();
  for (let n = 0; n < 400000; n++) {
    const s = G.state;
    if (s.phase === 'dead') return { doed: true, paa: s.player.on, streak: s.streak, x: s.player.x };
    if (s.player.on !== null && s.player.on >= maal) return { doed: false, paa: s.player.on, streak: s.streak, checkpoint: s.checkpoint };
    if (s.player.on !== null) {
      const cur = s.platforms.find(p => p.i === s.player.on);
      const land = G.simJump();
      const laserForan = cur.laser && s.player.x + 1 < cur.x + cur.w / 2;
      if (land && (land.i > s.player.on || (laserForan && land.i === s.player.on && land.x > cur.x + cur.w / 2))) G.jump();
    }
    G.tick(DT);
  }
  return { timeout: true };
}, { maal });

let r = await bot(120);
assert.ok(!r.timeout, 'botten blev færdig');
assert.ok(!r.doed, `botten døde på vej til platform ${r.paa} (x=${r.x}) – banen skal altid kunne gennemføres`);
assert.ok(r.streak >= 120, `mindst 120 hop talt (fik ${r.streak})`);
assert.equal(r.checkpoint, 120, 'seneste checkpoint er platform 120');
assert.equal(await page.locator('#hop').textContent(), String(r.streak), 'tælleren øverst til venstre følger med');
await page.screenshot({ path: '/Users/lars/Projekter/Zydy/test/shots/obby.png' });

/* ---------- Laseren dræber, hvis man bare løber ---------- */
s = await page.evaluate(() => window.GAME.state);
const laserPl = s.platforms.find(p => p.laser && p.i > s.player.on);
r = await page.evaluate(({ i }) => {
  const G = window.GAME; G.placer(i);
  for (let n = 0; n < 600; n++) { G.tick(1 / 120); if (G.state.phase === 'dead') return G.state; }
  return G.state;
}, { i: laserPl.i });
assert.equal(r.phase, 'dead', 'man dør af laseren');
assert.ok(Math.abs(r.player.x + 0.5 - (laserPl.x + laserPl.w / 2)) < 0.8, 'døde ved laseren midt på platformen');
assert.ok(await page.locator('#tryAgain.on').isVisible(), 'TRY AGAIN vises');
assert.equal(await page.locator('#tryAgain .big').textContent(), 'TRY AGAIN');
assert.ok(await page.locator('#nyRekord').isVisible(), 'ny rekord vises');
const best = r.best;
assert.ok(best >= 120, 'rekorden er gemt');
assert.equal(await page.evaluate(() => localStorage.getItem('zydy.obby.best')), String(best));
assert.equal(await page.locator('#rekHud').textContent(), String(best));
await page.waitForFunction(() => document.querySelector('#hsListe .hs-mig'));
assert.deepEqual(sendte, [{ navn: 'Sofie', score: best }], 'rekorden sendes automatisk til toplisten med navnet');
assert.equal(await page.locator('#hsListe .hs-mig .hs-navn').textContent(), 'Sofie', 'egen række er fremhævet');
assert.equal(await page.locator('#hsListe .hs-raekke').first().locator('.hs-navn').textContent(), 'Sofie', 'Sofie er nr. 1 med 120+');
await page.screenshot({ path: '/Users/lars/Projekter/Zydy/test/shots/obby-tryagain.png' });

/* ---------- Genopstå på checkpointet ---------- */
r = await page.evaluate(() => { const G = window.GAME; G.jump(); return G.state; });
assert.equal(r.phase, 'dead', 'et tryk lige efter døden gør intet (man skal nå at se TRY AGAIN)');
r = await page.evaluate(() => { const G = window.GAME; for (let n = 0; n < 90; n++) G.tick(1 / 120); G.jump(); return G.state; });
assert.equal(r.phase, 'ready', 'tryk → man står klar igen');
assert.equal(r.player.on, 120, 'genopstået på checkpoint-platformen');
assert.equal(r.streak, 0, 'tælleren starter fra 0');
assert.equal(await page.locator('#hop').textContent(), '0');
assert.ok(!(await page.locator('#tryAgain').evaluate(el => el.classList.contains('on'))));

// Lava: hop ud i det tomme fra klar-tilstand og lad være med at hoppe igen
r = await page.evaluate(() => {
  const G = window.GAME; G.jump();
  for (let n = 0; n < 1200; n++) { G.tick(1 / 120); if (G.state.phase === 'dead') return G.state; }
  return G.state;
});
assert.equal(r.phase, 'dead', 'man dør i lavaen, når man ikke hopper videre');
assert.ok(r.player.y < 0.1, 'spilleren nåede lavaen');
assert.equal(sendte.length, 1, 'ingen ny post uden ny rekord');

// Skifter man navn bagefter, rettes ens egen række på listen (PATCH med kvitteringen fra gemningen)
await page.locator('#menuBtn').click();
await page.locator('#nameBtn').click();
await page.locator('#nameInput').fill('Sofie B');
await page.locator('#nameInput').press('Enter');
await page.waitForFunction(() => document.querySelector('#hsListe .hs-raekke .hs-navn') && document.querySelector('#hsListe .hs-raekke').textContent.includes('Sofie B'));
assert.deepEqual(patchede, [{ sti: '/api/highscore/obby/99', navn: 'Sofie B', token: 'hemmelig' }], 'navneskift retter egen række');
assert.equal(await page.locator('#hsListe .hs-mig .hs-navn').textContent(), 'Sofie B');
await page.locator('#nameBtn').click();
await page.locator('#nameInput').fill('Sofie');
await page.locator('#nameInput').press('Enter');
await page.waitForTimeout(150);
assert.equal(patchede.length, 2);
await page.getByRole('button', { name: 'Spil', exact: true }).click();

// Menu → toplisten hentes igen, Spil → tilbage på checkpointet
await page.locator('#menuBtn').click();
assert.ok(await page.locator('#startScreen.on').isVisible());
assert.ok(await page.locator('#menuBtn').isHidden());
assert.equal(await page.locator('#rekordVal').textContent(), String(best), 'Rekord på startskærmen');
await page.getByRole('button', { name: 'Spil', exact: true }).click();
r = await page.evaluate(() => window.GAME.state);
assert.equal(r.phase, 'ready'); assert.equal(r.player.on, 120);

// Ingen vandret scroll
assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'ingen vandret scroll');

// Genindlæs: rekord og navn huskes; en ny bane med samme seed er identisk
await page.reload();
await page.waitForSelector('#hsListe .hs-liste');
assert.equal(await page.locator('#rekordVal').textContent(), String(best));
assert.ok((await page.locator('#nameBtn').textContent()).startsWith('Sofie'));
const st1 = await page.evaluate(() => window.GAME.state);
assert.deepEqual(st1.platforms.slice(0, 6).map(p => [p.i, p.x, p.w, p.y]), st0.platforms.slice(0, 6).map(p => [p.i, p.x, p.w, p.y]), 'samme seed giver samme bane');

// API-fejl må ikke vælte spillet
await page.unroute('**/api/highscore/**');
await page.route('**/api/highscore/**', route => route.fulfill({ status: 500, json: { ok: false, fejl: 'test' } }));
await page.goto(`${BASE}/spil/obby/?seed=2`);
await page.waitForSelector('#hsListe .hs-fejl');
await page.getByRole('button', { name: 'Spil', exact: true }).click();
assert.equal((await page.evaluate(() => window.GAME.state)).phase, 'ready');

const relevante = errors.filter(e => !e.includes('500'));
assert.deepEqual(relevante, [], 'ingen console-fejl');
await browser.close();
console.log('OK obby');
