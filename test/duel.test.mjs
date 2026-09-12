// Kør:  PLAYWRIGHT=/Users/lars/Projekter/DungeonCrawler/node_modules/playwright/index.mjs node test/duel.test.mjs
// (kræver at en lokal server kører: python3 -m http.server 4185 -d public)
import assert from 'node:assert/strict';
const { chromium, devices } = await import(process.env.PLAYWRIGHT ?? 'playwright');
import { mockApi } from './api-mock.mjs';
const BASE = process.env.BASE ?? 'http://localhost:4185';
const SHOTS = new URL('./shots/', import.meta.url).pathname;
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 13'] });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
// zydy.dk's API'er i hukommelsen (aktivitet + topliste). Registreres først, så en
// mere specifik page.route nedenfor vinder over den.
const api = await mockApi(page);

await page.goto(`${BASE}/spil/duel/?seed=1`);

const phase = () => page.evaluate(() => GAME.state.phase);
const waitPhase = p => page.waitForFunction(p => GAME.state.phase === p, p, { timeout: 5000 });
const scores = () => page.evaluate(() => ({ ...GAME.state.scores }));

// Startskærm: vælg "3 point" og tryk Spil
await page.evaluate(() => { GAME.fast = true; });
await page.click('#targetSeg button[data-target="3"]');
await page.click('#playBtn');
await waitPhase('play');
assert.equal(await page.evaluate(() => GAME.state.target), 3, 'target er 3');
assert.equal(await page.evaluate(() => document.getElementById('arena').hidden), false, 'spilfladen vises');

// Runde 1 (aktuel): rød svarer rigtigt
async function redCorrect() {
  const before = await scores();
  const info = await page.evaluate(() => {
    GAME.skipWait();                      // spring ventefase over (grønt lys / prikker / figurskift)
    const r = GAME.currentRound();
    GAME.press('red', r.correct);
    return { r, phase: GAME.state.phase };
  });
  assert.equal(info.phase, 'result', `runden ${info.r.type} afgøres straks i fast-mode`);
  const after = await scores();
  assert.equal(after.red, before.red + 1, `rød får point i ${info.r.type}`);
  assert.equal(after.blue, before.blue, 'blå får ikke point');
  return info.r.type;
}
const typesSeen = new Set();
typesSeen.add(await redCorrect());

// Næste runde: tving "Højeste tal", tag screenshot, og lad BLÅ svare forkert → rød får pointet
await page.evaluate(() => { GAME.forceType = 'numbers'; GAME.skipWait(); });
await waitPhase('play');
assert.equal((await page.evaluate(() => GAME.currentRound())).type, 'numbers');
assert.equal(await page.locator('.half.red .gbtn').count(), 6, 'seks tal-knapper i rød halvdel');
assert.equal(await page.locator('.half.blue .gbtn').count(), 6, 'seks tal-knapper i blå halvdel');
await page.screenshot({ path: SHOTS + 'duel.png' });
{
  const before = await scores();
  const res = await page.evaluate(() => {
    const r = GAME.currentRound();
    const wrong = [...document.querySelectorAll('.half.blue [data-v]')].map(b => b.dataset.v).find(v => v !== String(r.correct));
    GAME.press('blue', wrong);
    return { phase: GAME.state.phase, text: document.querySelector('.half.red .verdict .big').textContent };
  });
  assert.equal(res.phase, 'result');
  assert.match(res.text, /Blå trykkede forkert/);
  const after = await scores();
  assert.equal(after.red, before.red + 1, 'rød får pointet når blå svarer forkert');
}
typesSeen.add('numbers');

// Næste runde: tving "Grønt lys" og lav et rigtigt pointerdown (mus/touch) på blå halvdel FØR det bliver grønt
await page.evaluate(() => { GAME.forceType = 'green'; GAME.skipWait(); });
await waitPhase('play');
{
  const r = await page.evaluate(() => GAME.currentRound());
  assert.equal(r.type, 'green');
  assert.equal(r.ready, false, 'ikke grønt endnu');
  const before = await scores();
  const vp = page.viewportSize();
  await page.mouse.click(vp.width * 0.5, vp.height * 0.2);   // øverste halvdel = blå
  await waitPhase('result');
  const after = await scores();
  assert.equal(after.red, before.red + 1, 'blå trykkede for tidligt → rød får pointet');
  assert.match(await page.locator('.half.blue .verdict .big').textContent(), /Blå trykkede for tidligt/);
  typesSeen.add('green');
}

// Spil videre indtil slut (rød svarer rigtigt hver gang). Første til 3 → rød har allerede 3 nu.
await page.evaluate(() => GAME.skipWait());
await waitPhase('end');
const s = await scores();
assert.equal(s.red, 3, 'rød vandt med 3 point');
assert.equal(s.blue, 0);
assert.match(await page.locator('#winnerText').textContent(), /Rød vandt/);
assert.equal(await page.locator('#scoreText').textContent(), '3–0');
const stats1 = await page.evaluate(() => JSON.parse(localStorage.getItem('zydy.duel.stats')));
assert.deepEqual(stats1, { games: 1, red: 1, blue: 0 }, 'stats gemt i localStorage');
assert.match(await page.locator('#endStats').textContent(), /Kampe 1/);

// Omkamp: gennemløb de resterende rundetyper via GAME.press og lad blå vinde 3–1
await page.click('#rematchBtn');
await waitPhase('play');
// Første (tilfældige) runde tager rød, og næste runde tvinges til stroop
await page.evaluate(() => { GAME.forceType = 'stroop'; });
typesSeen.add(await redCorrect());
await page.evaluate(() => GAME.skipWait());
await waitPhase('play');
const seq = ['stroop', 'dots', 'same'];
for (let i = 0; i < seq.length; i++) {
  const next = seq[i + 1] ?? null;
  const info = await page.evaluate(next => {
    if (next) GAME.forceType = next;
    GAME.skipWait();                      // gør runden klar (prikkerne væk / figurerne ens)
    const r = GAME.currentRound();
    GAME.press('blue', r.correct);
    return { type: r.type, phase: GAME.state.phase, ready: r.ready, matching: r.matching };
  }, next);
  assert.equal(info.type, seq[i], `runde ${i + 2} er ${seq[i]}`);
  assert.equal(info.phase, 'result', `blå får point i ${info.type}`);
  if (info.type === 'same') assert.equal(info.matching, true, 'figurerne var ens efter skipWait');
  typesSeen.add(info.type);
  await page.evaluate(() => GAME.skipWait());
  await page.waitForFunction(() => GAME.state.phase === 'play' || GAME.state.phase === 'end');
}
for (const t of ['green', 'numbers', 'stroop', 'dots', 'same']) assert.ok(typesSeen.has(t), `rundetype ${t} blev spillet`);
await waitPhase('end');
assert.match(await page.locator('#winnerText').textContent(), /Blå vandt/);
assert.equal(await page.locator('#scoreText').textContent(), '3–1');
const stats2 = await page.evaluate(() => JSON.parse(localStorage.getItem('zydy.duel.stats')));
assert.deepEqual(stats2, { games: 2, red: 1, blue: 1 });

// "Til start" og at stats vises på startskærmen
await page.click('#menuBtn');
assert.equal(await phase(), 'idle');
assert.match(await page.locator('#startStats').textContent(), /Kampe 2/);

// ===== Mod botten (Selmas ønske) =====
// Vælg botten på startskærmen: sværhedsgraderne dukker op, og tegningen skifter
assert.equal(await page.locator('#botSeg').isVisible(), false, 'sværhedsgraderne er skjult for to spillere');
await page.click('#modeSeg button[data-mode="bot"]');
assert.equal(await page.locator('#botSeg').isVisible(), true, 'sværhedsgraden vises');
assert.equal(await page.locator('#demoTop').textContent(), '🤖 BOT');
assert.equal(await page.locator('#demoBot').textContent(), 'DIG');
assert.match(await page.locator('#lead').textContent(), /mod computeren/);
await page.click('#botSeg button[data-niveau="svaer"]');
assert.ok(await page.evaluate(() => document.getElementById('playBtn').getBoundingClientRect().bottom <= innerHeight),
  'Spil-knappen kan ses uden at rulle, også når bot-valgene er fremme');
assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('zydy.duel.bot'))),
  { mode: 'bot', niveau: 'svaer', kampe: 0, dig: 0, bot: 0 }, 'valget huskes');

// Spil til 10 point, så der er plads til at prøve det hele. Botten sættes på pause,
// så testen selv bestemmer, hvornår den svarer.
await page.evaluate(() => { GAME.botPause = true; });
await page.click('#targetSeg button[data-target="10"]');
await page.click('#playBtn');
await waitPhase('play');
{
  const ui = await page.evaluate(() => ({
    solo: document.getElementById('arena').classList.contains('solo'),
    mark: document.getElementById('botmark').hidden ? null : document.getElementById('botmark').textContent,
    vendt: getComputedStyle(document.querySelector('.half.blue')).transform,
  }));
  assert.equal(ui.solo, true, 'spilfladen er i solo-tilstand');
  assert.equal(ui.mark, '🤖 Bot · Svær', 'bottens halvdel er mærket');
  assert.equal(ui.vendt, 'none', 'bottens halvdel vendes ikke på hovedet – der sidder ingen overfor');
}

// Spilleren tager et point
typesSeen.add(await redCorrect());
await page.evaluate(() => GAME.skipWait());
await waitPhase('play');

// Botten tager et point, og resultatet kalder den ved navn
{
  const before = await scores();
  const res = await page.evaluate(() => {
    GAME.skipWait();                         // gør runden klar (grønt lys / prikker / ens figurer)
    const ok = GAME.botNu(true);
    return { ok, phase: GAME.state.phase, text: document.querySelector('.half.red .verdict .big').textContent };
  });
  assert.equal(res.ok, true, 'GAME.botNu virker kun mod botten');
  assert.equal(res.phase, 'result');
  assert.equal((await scores()).blue, before.blue + 1, 'botten får pointet');
  assert.match(res.text, /Botten tog pointet/);
}
await page.evaluate(() => { GAME.forceType = 'numbers'; GAME.skipWait(); });
await waitPhase('play');

// Spilleren må ikke kunne trykke på bottens halvdel
{
  const before = await scores();
  const vp = page.viewportSize();
  await page.mouse.click(vp.width * 0.5, vp.height * 0.25);   // øverste halvdel = bottens
  assert.equal(await phase(), 'play', 'tryk på bottens halvdel gør ingenting');
  assert.deepEqual(await scores(), before);
}

// Slip botten løs: den svarer selv, og pointet falder – rigtigt eller forkert
{
  const before = await scores();
  await page.evaluate(() => { GAME.botPause = false; });
  await waitPhase('result');
  const after = await scores();
  assert.equal(after.red + after.blue, before.red + before.blue + 1, 'botten spillede runden færdig af sig selv');
  assert.match(await page.locator('.half.red .verdict .big').textContent(), /Botten/, 'resultatet handler om botten');
  await page.evaluate(() => { GAME.botPause = true; GAME.forceType = 'green'; GAME.skipWait(); });
  await waitPhase('play');
}

// "Grønt lys": spillerens reaktion tæller til toplisten – bottens gør ikke
{
  await page.evaluate(() => { GAME.skipWait(); });              // nu er det grønt
  await new Promise(r => setTimeout(r, 150));
  await page.evaluate(() => GAME.press('red', null));
  const min = await page.evaluate(() => GAME.state.hurtigst);
  assert.equal(min.side, 'red');
  assert.ok(min.ms >= 100, `spillerens reaktion blev målt (${min.ms} ms)`);
  await page.evaluate(() => { GAME.forceType = 'green'; GAME.skipWait(); });
  await waitPhase('play');
  await page.evaluate(() => { GAME.skipWait(); });
  await new Promise(r => setTimeout(r, 150));
  await page.evaluate(() => GAME.botNu(true));
  assert.deepEqual(await page.evaluate(() => GAME.state.hurtigst), min, 'bottens reaktion ryger ikke på toplisten');
}

// Spil kampen færdig: spilleren tager resten
await page.evaluate(() => GAME.skipWait());
await page.waitForFunction(() => GAME.state.phase === 'play' || GAME.state.phase === 'end');
while (await phase() !== 'end') {
  await page.evaluate(() => {
    GAME.skipWait();
    const r = GAME.currentRound();
    GAME.press('red', r.correct);
  });
  await page.evaluate(() => GAME.skipWait());
  await page.waitForFunction(() => GAME.state.phase === 'play' || GAME.state.phase === 'end');
}
{
  const s = await scores();
  assert.equal(s.red, 10, 'spilleren vandt kampen mod botten');
  assert.equal(await page.locator('#winnerText').textContent(), 'Du vandt!');
  const b = await page.evaluate(() => JSON.parse(localStorage.getItem('zydy.duel.bot')));
  assert.deepEqual(b, { mode: 'bot', niveau: 'svaer', kampe: 1, dig: 1, bot: 0 }, 'bot-stillingen gemmes');
  const s2 = await page.evaluate(() => JSON.parse(localStorage.getItem('zydy.duel.stats')));
  assert.deepEqual(s2, { games: 2, red: 1, blue: 1 }, 'kampe mod botten blandes ikke ind i Rød/Blå');
  assert.match(await page.locator('#endStats').textContent(), /Mod botten 1–0/);
  assert.match(await page.locator('#endStats').textContent(), /Kampe 3/);
}
await page.screenshot({ path: SHOTS + 'duel-bot.png' });
await page.click('#menuBtn');
assert.equal(await phase(), 'idle');
assert.equal(await page.evaluate(() => document.getElementById('arena').classList.contains('solo')), false,
  'solo-tilstanden ryddes, når man går til start');

// Ingen vandret scroll, ingen fejl
const noHScroll = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
assert.ok(noHScroll, 'ingen vandret scroll');
assert.deepEqual(errors, [], 'ingen console-fejl');
await browser.close();
console.log('OK duel');
