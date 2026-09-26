// Kør:  PLAYWRIGHT=/Users/lars/Projekter/DungeonCrawler/node_modules/playwright/index.mjs node test/fodbold.test.mjs
// (kræver at en lokal server kører: python3 -m http.server 4195 -d public)
//
// Spiller «Fodbold» igennem: menuen (navn, næste hold, topliste) → kegleløb med
// en rigtig finger på joysticket → træningen giver erfaring → en hel kamp i
// ligaen (autopiloten spiller) giver penge, næste hold og en rekord på
// toplisten → butikken (støvler og trøje) → to venner om den samme telefon, hvor
// den øverste har sit eget joystick → iPad på tværs. API'erne kører i
// hukommelsen (test/api-mock.mjs).
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

// Tom topliste, så en hvilken som helst stime kvalificerer
const sendte = [];
await mockApi(page);
await page.route('**/api/highscore/**', async route => {
  const req = route.request();
  if (req.method() === 'POST') {
    const krop = req.postDataJSON(); sendte.push(krop);
    return route.fulfill({ json: { ok: true, id: 1, token: 'abc', placering: 1, liste: [{ id: 1, navn: krop.navn, score: krop.score, oprettet: '2026-09-26T12:00:00.000Z' }] } });
  }
  return route.fulfill({ json: { spil: 'fodbold', retning: 'desc', min: 1, maks: 200, unik: true, liste: [] } });
});

await page.goto(`${BASE}/spil/fodbold/?seed=11`);
await page.waitForFunction(() => !!window.GAME);
const state = () => page.evaluate(() => window.GAME.state);
const frem = sek => page.evaluate(s => window.GAME.frem(s), sek);
const synlig = sel => page.locator(sel).isVisible();

/* ---------- Menuen ---------- */
assert.equal(await synlig('#startScreen.on'), true, 'menuen vises');
await page.waitForFunction(() => document.querySelector('#hsListe .hs-titel'), null, { timeout: 4000 });
assert.match(await page.locator('#hsListe').textContent(), /sejre i træk/i, 'toplisten står i menuen');
assert.match(await page.locator('.lavet').textContent(), /Alia/, 'der står hvem der fandt på spillet');
assert.match(await page.locator('#naeste').textContent(), /Mormors Mopser/, 'man begynder mod det letteste hold');
assert.match(await page.locator('#naeste').textContent(), /hold 1 af 10/i);
assert.equal(await page.locator('#evner .bar').count(), 3, 'fart, skud og aflevering');
{
  const plads = await page.evaluate(() => {
    const b = document.getElementById('kampBtn').getBoundingClientRect();
    const t = document.getElementById('venBtn').getBoundingClientRect();
    return { bund: Math.max(b.bottom, t.bottom), skærm: innerHeight };
  });
  assert.ok(plads.bund <= plads.skærm, `knapperne ligger uden for skærmen (${plads.bund} > ${plads.skærm})`);
}
await page.screenshot({ path: SHOTS + 'fodbold-start.png' });

// Navnet huskes til de andre spil
await page.locator('#navnInput').fill('Alia');
await page.locator('#navnInput').press('Enter');
assert.equal(await page.evaluate(() => localStorage.getItem('zydy.navn')), 'Alia');

/* ---------- Træning: kegleløb med en rigtig finger ---------- */
await page.click('#traenBtn');
assert.equal(await synlig('#traenScreen.on'), true);
assert.equal(await page.locator('.oevelse').count(), 3, 'tre øvelser');
await page.click('[data-oevelse="fart"]');
{
  const s = await state();
  assert.equal(s.tilstand, 'traening');
  assert.equal(s.kamp.øvelse, 'fart');
  assert.ok(s.kamp.kegle, 'der står en kegle');
}
await page.evaluate(() => window.GAME.pause());
await frem(1.2);                                   // «klar» er forbi
assert.equal(await page.locator('.styr').count(), 1, 'ét styrepanel');
assert.match(await page.locator('.styr .s-stilling').textContent(), /0 point/);

// Træk på joysticket hen mod keglen, indtil den er nået.
const stik = await page.locator('.styr .stik').boundingBox();
const o = { x: stik.x + stik.width / 2, y: stik.y + stik.height / 2 };
await page.mouse.move(o.x, o.y);
await page.mouse.down();
await page.mouse.move(o.x, o.y - 38, { steps: 3 });
assert.ok((await state()).kamp.input[0].y < -0.8, 'træk opad = løb opad');
for (let n = 0; n < 120 && (await state()).kamp.point < 2; n++) {
  const s = (await state()).kamp;
  const dx = s.kegle.x - s.mig.x, dy = s.kegle.y - s.mig.y, d = Math.hypot(dx, dy) || 1;
  await page.mouse.move(o.x + dx / d * 36, o.y + dy / d * 36);
  await frem(0.1);
}
await page.mouse.up();
assert.equal((await state()).kamp.input[0].x, 0, 'slip joysticket = stå stille');
assert.ok((await state()).kamp.point >= 2, 'to kegler nået med fingeren');
assert.match(await page.locator('.styr .s-stilling').textContent(), /[2-9] point/);
await page.screenshot({ path: SHOTS + 'fodbold-traening.png' });

// «Spark» sparker bolden af sted i kegleløbet
await page.locator('.styr .knap.skyd').dispatchEvent('pointerdown');
assert.equal((await state()).kamp.harBold, false, 'bolden er sparket væk');

// Tiden løber ud: erfaring i fart
const pointFør = (await state()).kamp.point;
await frem(45);
{
  const s = await state();
  assert.equal(s.tilstand, 'slut');
  assert.equal(await synlig('#slutScreen.on'), true);
  assert.match(await page.locator('#slutTitel').textContent(), /Træning slut/);
  assert.match(await page.locator('#slutSub').textContent(), /erfaring i fart/);
  assert.equal(s.sidsteResultat.xp, pointFør, 'ét point erfaring for hver kegle');
  assert.ok(s.profil.evner.fart.xp === pointFør || s.profil.evner.fart.n > 1, 'erfaringen er lagt til fart');
  const gemt = await page.evaluate(() => JSON.parse(localStorage.getItem('zydy.fodbold.profil')));
  assert.deepEqual(gemt.evner.fart, s.profil.evner.fart, 'profilen er gemt i localStorage');
}
assert.equal(await page.locator('#igenBtn').textContent(), 'Træn igen');
await page.click('#menuBtn');
assert.equal(await synlig('#startScreen.on'), true);

/* ---------- Afleveringstræning: knappen afleverer til den, der lyser ---------- */
await page.click('#traenBtn');
await page.click('[data-oevelse="aflevering"]');
await frem(1.2);
assert.equal((await state()).kamp.harBold, true);
await page.locator('.styr .knap.aflever').dispatchEvent('pointerdown');
for (let n = 0; n < 40 && (await state()).kamp.point < 1; n++) await frem(0.1);
assert.equal((await state()).kamp.point, 1, 'afleveringen til den lysende makker gav et point');
await page.click('#stopBtn');
assert.equal(await synlig('#startScreen.on'), true, '✕ Stop går tilbage til menuen');
assert.equal((await state()).profil.evner.aflevering.xp, 0, 'en stoppet træning tæller ikke');

/* ---------- En kamp i ligaen ---------- */
await page.click('#kampBtn');
{
  const s = await state();
  assert.equal(s.tilstand, 'liga');
  assert.deepEqual(s.kamp.navne, ['Alia', 'Mormors Mopser']);
  assert.match(await page.locator('.styr .s-stilling').textContent(), /0 – 0 Mopserne/);
  assert.match(await page.locator('.styr .s-tid').textContent(), /0'/);
}
await frem(1.2);
{
  const s = await state();
  const label = await page.locator('.styr .knap.skyd span').textContent();
  assert.equal(label, s.kamp.harBold ? 'SKYD' : 'TACKL', 'knappen siger, hvad den gør');
}
await page.evaluate(() => window.GAME.pause(false));
await page.waitForTimeout(700);
await page.screenshot({ path: SHOTS + 'fodbold-kamp.png' });
await page.evaluate(() => window.GAME.pause());
await page.evaluate(() => window.GAME.bot());
const pengeFør = (await state()).profil.penge;
await frem(200);
{
  const s = await state();
  assert.equal(s.tilstand, 'slut', 'kampen blev færdig');
  const [a, b] = s.kamp.mål;
  assert.ok(a > b, `autopiloten skulle slå Mopserne (${a}-${b})`);
  assert.match(await page.locator('#slutTitel').textContent(), /Du vandt/);
  assert.equal(s.profil.trin, 1, 'videre til næste hold');
  assert.equal(s.profil.stime, 1);
  assert.ok(s.profil.penge > pengeFør, 'kampen gav penge');
  assert.match(await page.locator('#slutSub').textContent(), /\+\d+ 🪙/);
  assert.match(await page.locator('#slutNy').textContent(), /Sandkasse United/, 'næste hold står der');
  assert.equal(await page.locator('#pengeVal').textContent(), String(s.profil.penge));
}
await page.waitForFunction(() => document.querySelector('#hsSlut .hs-mig'), null, { timeout: 4000 });
assert.deepEqual(sendte.map(x => [x.navn, x.score]), [['Alia', 1]], 'rekorden er sendt til toplisten');
await page.screenshot({ path: SHOTS + 'fodbold-slut.png' });
await page.click('#menuBtn');
assert.match(await page.locator('#naeste').textContent(), /Sandkasse United/);
assert.equal(await page.locator('#stimeVal').textContent(), '1');

/* ---------- Butikken ---------- */
await page.evaluate(() => window.GAME.saetOp({ profil: { penge: 500 } }));
await page.click('#butikBtn');
assert.equal(await synlig('#butikScreen.on'), true);
assert.equal(await page.locator('#butikPenge').textContent(), '500');
await page.click('[data-ting="guldstoevler"]');
assert.match(await page.locator('#butikBesked').textContent(), /mangler/, 'for dyre');
await page.click('[data-ting="lyn"]');
assert.match(await page.locator('#butikBesked').textContent(), /Købt/);
assert.equal(await page.locator('#butikPenge').textContent(), '350');
await page.click('[data-ting="groen"]');
assert.equal((await state()).profil.troeje, 'groen');
assert.equal(await page.locator('.ting.valgt').getAttribute('data-ting'), 'groen');
await page.screenshot({ path: SHOTS + 'fodbold-butik.png' });
await page.click('#butikScreen [data-tilbage]');
assert.match(await page.locator('#evner').textContent(), /\+1👟/, 'støvlerne står ved evnerne');

/* ---------- To venner om den samme telefon ---------- */
await page.click('#venBtn');
assert.equal(await page.locator('#venNavn0').inputValue(), 'Alia');
await page.locator('#venNavn1').fill('Sofie');
await page.click('#venStartBtn');
{
  const s = await state();
  assert.equal(s.tilstand, 'ven');
  assert.deepEqual(s.kamp.navne, ['Alia', 'Sofie']);
  assert.equal(await page.locator('.styr').count(), 2, 'et panel til hver');
  assert.equal(await page.locator('.styr.oppe').count(), 1, 'det øverste er vendt');
  assert.match(await page.locator('.styr.oppe').evaluate(el => getComputedStyle(el).transform), /matrix\(-1/, 'drejet 180°');
  // Banen ligger mellem de to paneler
  const k = await page.evaluate(() => {
    const [a, b] = [...document.querySelectorAll('.styr')].map(el => el.getBoundingClientRect());
    const øverst = a.top < b.top ? a : b, nederst = a.top < b.top ? b : a;
    return { top: window.GAME.px(0, 0).y, bund: window.GAME.px(60, 100).y, panelTop: øverst.bottom, panelBund: nederst.top };
  });
  assert.ok(k.top >= k.panelTop - 1 && k.bund <= k.panelBund + 1, `banen ligger under et panel: ${JSON.stringify(k)}`);
}
await frem(1.2);
// Sofie (øverst) trækker «op» set fra sin side – det er nedad på skærmen, mod Alias mål.
{
  const zone = await page.locator('.styr.oppe .stik').boundingBox();
  const c = { x: zone.x + zone.width / 2, y: zone.y + zone.height / 2 };
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await page.mouse.move(c.x, c.y + 38, { steps: 3 });
  const s = await state();
  assert.ok(s.kamp.input[1].y > 0.8, 'Sofies joystick styrer hold 1 nedad');
  assert.equal(s.kamp.input[0].y, 0, 'Alias hold rører sig ikke');
  await page.mouse.up();
}
await page.screenshot({ path: SHOTS + 'fodbold-ven.png' });
await frem(170);
{
  const s = await state();
  assert.equal(s.tilstand, 'slut');
  assert.ok(s.kamp.forlænget, 'lige efter 90 minutter: forlænget');
  assert.equal(await page.locator('#igenBtn').textContent(), 'Omkamp');
  assert.equal(s.profil.stime, 1, 'en kamp mod en ven rører ikke ligaen');
}
await page.click('#menuBtn');
assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'ingen vandret scroll');

/* ---------- iPad på tværs ---------- */
{
  const ipad = await browser.newContext({ ...devices['iPad (gen 7) landscape'] });
  const side = await ipad.newPage();
  side.on('pageerror', e => errors.push(String(e)));
  side.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await mockApi(side);
  await side.goto(`${BASE}/spil/fodbold/?seed=3`);
  await side.waitForFunction(() => !!window.GAME);
  await side.evaluate(() => window.GAME.ven());
  await side.evaluate(() => window.GAME.frem(1.5));
  const k = await side.evaluate(() => {
    const st = document.getElementById('stage').getBoundingClientRect();
    const ps = [...document.querySelectorAll('.styr')].map(el => el.getBoundingClientRect());
    const a = window.GAME.px(0, 0), b = window.GAME.px(60, 100);
    return { st: [st.left, st.top, st.right, st.bottom], ps: ps.map(r => [r.left, r.top, r.right, r.bottom]), bane: [a.x, a.y, b.x, b.y] };
  });
  for (const [l, t, r, b] of k.ps) assert.ok(l >= k.st[0] - 1 && t >= k.st[1] - 1 && r <= k.st[2] + 1 && b <= k.st[3] + 1, 'panel uden for skærmen');
  assert.ok(k.bane[2] - k.bane[0] > 150, 'banen er stor nok til at se');
  await side.waitForTimeout(300);
  await side.screenshot({ path: SHOTS + 'fodbold-ipad.png' });
  assert.ok(await side.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'ingen vandret scroll på iPad');
  await ipad.close();
}

assert.deepEqual(errors, [], 'ingen console-fejl');
await browser.close();
console.log('OK fodbold');
