// Kør:  PLAYWRIGHT=/Users/lars/Projekter/DungeonCrawler/node_modules/playwright/index.mjs node test/dybet.test.mjs
// (kræver at en lokal server kører: python3 -m http.server <PORT> -d public)
// Spiller Dybet igennem via UI og window.GAME med seed 3 og hurtige animationer:
// start → valg i kryds → kamp → taske → trappen → gem/genoptag → død → topliste (API'et mockes).
import assert from 'node:assert/strict';
const { chromium, devices } = await import(process.env.PLAYWRIGHT ?? 'playwright');
const BASE = process.env.BASE ?? 'http://localhost:4181';
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 13'] });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

// Tom topliste → enhver dybde kvalificerer, så navneformularen vises ved død
const sendte = [];
await page.route('**/api/highscore/**', async route => {
  const req = route.request();
  if (req.method() === 'POST') {
    const krop = req.postDataJSON(); sendte.push(krop);
    return route.fulfill({ json: { ok: true, id: 1, placering: 1, liste: [{ id: 1, navn: krop.navn, score: krop.score, oprettet: '2026-09-12T12:00:00.000Z' }] } });
  }
  return route.fulfill({ json: { spil: 'dybet', liste: [] } });
});

await page.goto(`${BASE}/spil/dybet/?seed=3&hastighed=0.05`);
assert.ok(await page.locator('#startScreen.on').isVisible(), 'startskærmen vises');
assert.equal(await page.locator('#fortsaetKnap').isHidden(), true, 'ingen gemt spil endnu');
await page.getByRole('button', { name: 'Nyt spil' }).click();

const state = () => page.evaluate(() => window.GAME.state);
/** Venter til spillet står stille og spørger, eller er i kamp/død. */
const vent = () => page.waitForFunction(() => {
  const s = window.GAME.state;
  return s.fase !== 'udforsk' || (!s.animerer && s.valg.length > 0);
}, null, { timeout: 15000 });
await vent();

// Første kryds (seed 3): rotte til venstre, gang til højre, vend om. Knapperne står i scenen.
let s = await state();
assert.equal(s.fase, 'udforsk'); assert.equal(s.dybde, 1);
assert.deepEqual(s.valg.map(v => v.type).sort(), ['angrib', 'gaa', 'vend']);
assert.equal(await page.locator('#valg .valg').count(), 3, 'tre flydende knapper');
assert.ok((await page.locator('#valg .valg.angrib').textContent()).includes('Angrib rotte'));
const kortSet = await page.evaluate(() => window.GAME.spil.set.filter(Boolean).length);
assert.ok(kortSet > 5 && kortSet < 11 * 11, 'kun det sete er markeret på kortet (brættet er 11×11 på dybde 1)');

// Gå til højre: spillet går selv gennem gangen til næste kryds
await page.locator('#valg .valg[data-relativ="hoejre"]').click();
await page.waitForFunction(() => window.GAME.state.animerer);
await vent();
s = await state();
assert.ok(s.pos.x !== 9 || s.pos.y !== 3, 'spilleren har flyttet sig');
assert.ok(s.valg.filter(v => v.type !== 'vend').length >= 2, 'stopper først hvor vejen deler sig');
await page.waitForTimeout(400);
await page.screenshot({ path: '/Users/lars/Projekter/Zydy/test/shots/dybet.png' });

// Ingen vandret scroll
assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'ingen vandret scroll');

/** Vælger den mulighed der fører mod målet (BFS gennem alt), angriber monstre på vejen, åbner kister. */
async function skridtMod(maal) {
  const v = await page.evaluate(maal => {
    const G = window.GAME, M = G.M, spil = G.spil, d = spil.dungeon;
    const afstand = M.bfs(d.grid, d.B, maal);
    const m = M.muligheder(spil);
    const kiste = m.find(x => x.type === 'kiste'); if (kiste) return kiste.relativ;
    const trappe = m.find(x => x.type === 'trappe'); if (trappe && maal.x === d.trappe.x && maal.y === d.trappe.y) return trappe.relativ;
    let bedst = null, ba = Infinity;
    for (const x of m) { const a = afstand[x.y * d.B + x.x]; if (a >= 0 && a < ba) { ba = a; bedst = x; } }
    return bedst ? bedst.relativ : m[0].relativ;
  }, maal);
  await page.evaluate(r => window.GAME.vaelg(r), v);
  await page.waitForTimeout(30);
  await vent();
}
async function kaempFaerdig(valgFn) {
  await page.waitForSelector('#kamp.on');
  for (let i = 0; i < 40; i++) {
    const st = await state();
    if (st.fase !== 'kamp') break;
    await page.waitForFunction(() => !window.GAME.state.afspiller);
    await page.evaluate(valgFn);
    await page.waitForTimeout(20);
  }
}

// Find et monster og slå det (kampskærmen bruges via knapperne første gang)
const foersteMonster = await page.evaluate(() => { const m = window.GAME.spil.dungeon.monstre[0]; return { x: m.x, y: m.y }; });
for (let i = 0; i < 40 && (await state()).fase === 'udforsk'; i++) await skridtMod(foersteMonster);
s = await state();
assert.equal(s.fase, 'kamp', 'kampen er startet');
assert.ok(await page.locator('#stage.ikamp').count(), 'HUD skjules i kamp');
await page.waitForFunction(() => !window.GAME.state.afspiller);
assert.equal(await page.locator('#menu button').count(), 4, 'Angrib/Evner/Taske/Flygt');
await page.getByRole('button', { name: 'Evner' }).click();
assert.ok((await page.locator('#menu').textContent()).includes('Kraftslag'));
await page.getByRole('button', { name: 'Tilbage' }).click();
await page.getByRole('button', { name: 'Angrib', exact: true }).click();
await page.waitForFunction(() => window.GAME.state.afspiller);
await page.screenshot({ path: '/Users/lars/Projekter/Zydy/test/shots/dybet-kamp.png' });
await kaempFaerdig(() => window.GAME.kamp({ type: 'angrib' }));
s = await state();
if (s.fase === 'udforsk') {
  const doede = await page.evaluate(() => window.GAME.spil.dungeon.monstre.filter(m => m.doed).length);
  assert.equal(doede, 1, 'monsteret er dødt');
  assert.ok(await page.evaluate(() => window.GAME.spil.spiller.xp > 0 || window.GAME.spil.spiller.level > 1), 'erfaring givet');
  assert.equal(await page.locator('#kamp.on').count(), 0, 'kampskærmen lukket');
} else assert.equal(s.fase, 'doed', 'ellers døde vi (uheldigt seed)');

// Tasken: potion kan bruges når man mangler liv, udstyr kan tages på
await page.evaluate(() => { window.GAME.spil.spiller.hp = 5; });
await page.locator('#taskeKnap').click();
await page.waitForSelector('#taskeScreen.on');
assert.ok((await page.locator('#statsGrid').textContent()).includes('Angreb'));
const potionKnap = page.locator('#tingListe .ting', { hasText: 'Potion' }).locator('button');
await potionKnap.click();
assert.equal(await page.evaluate(() => window.GAME.spil.spiller.hp), 20, 'potion gav 15 liv');
await page.screenshot({ path: '/Users/lars/Projekter/Zydy/test/shots/dybet-taske.png' });
await page.locator('#taskeLuk').click();
assert.equal(await page.locator('#taskeScreen.on').count(), 0);

// Ned ad trappen: gå mod trappen, kæmp mod det der spærrer
const trappe = await page.evaluate(() => window.GAME.spil.dungeon.trappe);
for (let i = 0; i < 200; i++) {
  s = await state();
  if (s.dybde === 2 || s.fase === 'doed') break;
  if (s.fase === 'kamp') { await kaempFaerdig(() => window.GAME.kamp(window.GAME.spil.spiller.mp >= 3 ? { type: 'evne', id: 'kraftslag' } : { type: 'angrib' })); continue; }
  await page.evaluate(() => { const sp = window.GAME.spil.spiller; sp.hp = Math.max(sp.hp, 25); });  // testen handler om flowet, ikke held
  await skridtMod(trappe);
}
await page.waitForFunction(() => window.GAME.state.dybde === 2 && window.GAME.state.fase === 'udforsk' && !window.GAME.state.animerer, null, { timeout: 15000 });
await vent();
s = await state();
assert.equal(s.dybde, 2);
assert.equal(await page.locator('#dybde').textContent(), 'Dybde 2');
assert.equal(await page.evaluate(() => window.GAME.spil.spiller.mp), await page.evaluate(() => window.GAME.M.stats(window.GAME.spil.spiller).maxMp), 'mana fyldt op på ny dybde');
const gemt = await page.evaluate(() => JSON.parse(localStorage.getItem('zydy.dybet.spil')));
assert.equal(gemt.niveau, 2, 'spillet gemmes');

// Genindlæs: Fortsæt genoptager samme sted
await page.reload();
await page.waitForSelector('#fortsaetKnap:not([hidden])');
await page.getByRole('button', { name: 'Fortsæt' }).click();
await vent();
const s2 = await state();
assert.equal(s2.dybde, 2); assert.deepEqual(s2.pos, s.pos);

// Død: 1 liv og ind i den nærmeste kamp uden at slå tilbage
await page.evaluate(() => { const sp = window.GAME.spil.spiller; sp.hp = 1; sp.taske = []; sp.grundAngreb = -100; });   // vi rammer for 1, monsteret vinder
const monster2 = await page.evaluate(() => { const m = window.GAME.spil.dungeon.monstre.find(m => !m.doed); return { x: m.x, y: m.y }; });
for (let i = 0; i < 80 && (await state()).fase === 'udforsk'; i++) { await page.evaluate(() => { window.GAME.spil.spiller.hp = 1; }); await skridtMod(monster2); }
assert.equal((await state()).fase, 'kamp');
await kaempFaerdig(() => window.GAME.kamp({ type: 'angrib' }));
await page.waitForSelector('#overScreen.on', { timeout: 5000 });
assert.equal(await page.locator('#overDybde').textContent(), '2');
assert.ok(await page.locator('#rekord:not([hidden])').count(), 'ny rekord første gang');
assert.equal(await page.evaluate(() => localStorage.getItem('zydy.dybet.best')), '2', 'bedste dybde gemt');
assert.equal(await page.evaluate(() => localStorage.getItem('zydy.dybet.spil')), null, 'gemt spil slettet ved død');
assert.equal(await page.locator('#bestPill').textContent(), 'Bedste: dybde 2');

// Toplisten: tom liste → navneformular → gem
await page.waitForSelector('#hs .hs-form');
await page.locator('#hs .hs-input').fill('Simon');
await page.getByRole('button', { name: 'Gem på listen' }).click();
await page.waitForSelector('#hs .hs-mig');
assert.deepEqual(sendte, [{ navn: 'Simon', score: 2 }]);
await page.screenshot({ path: '/Users/lars/Projekter/Zydy/test/shots/dybet-slut.png' });

// Spil igen → nyt spil på dybde 1 med fuldt liv
await page.getByRole('button', { name: 'Spil igen' }).click();
await vent();
s = await state();
assert.equal(s.dybde, 1); assert.equal(s.hp, 30);

assert.deepEqual(errors, [], 'ingen console-fejl');
await browser.close();
console.log('OK dybet');
