// Kør:  PLAYWRIGHT=/Users/lars/Projekter/DungeonCrawler/node_modules/playwright/index.mjs node test/rutsjebane.test.mjs
// (kræver at en lokal server kører: python3 -m http.server 4193 -d public)
//
// Spiller «Rutsjebanen» igennem: startskærm → nedtælling → en rigtig finger på
// højre og venstre halvdel styrer → tasterne → botten kører gennem
// forhindringerne og hopper i bassinet → resultatet med plads, point og
// topliste → igen uden at styre, så man lander ved siden af → menu. Til sidst på
// en iPad på tværs. API'erne kører i hukommelsen (test/api-mock.mjs).
import assert from 'node:assert/strict';
import { mockApi } from './api-mock.mjs';
const { chromium, devices } = await import(process.env.PLAYWRIGHT ?? 'playwright');
const BASE = process.env.BASE ?? 'http://localhost:4193';
const SHOTS = new URL('./shots/', import.meta.url).pathname;

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 13'] });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

// Tom topliste, så enhver tur kvalificerer og navneformularen dukker op til sidst
const sendte = [];
const api = await mockApi(page);
await page.route('**/api/highscore/**', async route => {
  const req = route.request();
  if (req.method() === 'POST') {
    const krop = req.postDataJSON(); sendte.push(krop);
    return route.fulfill({ json: { ok: true, id: 1, token: 'abc', placering: 1, liste: [{ id: 1, navn: krop.navn, score: krop.score, oprettet: '2026-09-26T12:00:00.000Z' }] } });
  }
  return route.fulfill({ json: { spil: 'rutsjebane', retning: 'desc', min: 1, maks: 400, liste: [] } });
});

await page.goto(`${BASE}/spil/rutsjebane/?seed=7`);
await page.waitForFunction(() => !!window.GAME);
const state = () => page.evaluate(() => window.GAME.state);
const paaSkaerm = () => page.evaluate(() => { const s = window.GAME.state; return window.GAME.skaerm(s.x, s.y + 0.6, s.z); });

/* ---------- Startskærmen ---------- */
assert.equal(await page.locator('#startScreen.on').isVisible(), true, 'startskærmen vises');
assert.equal((await state()).fase, 'menu');
await page.waitForFunction(() => document.querySelector('#hsStart .hs-titel'), null, { timeout: 4000 });
assert.match(await page.locator('#hsStart').textContent(), /Topliste/, 'toplisten hentes på startskærmen');
{
  const plads = await page.evaluate(() => ({ bund: document.getElementById('startBtn').getBoundingClientRect().bottom, skaerm: innerHeight }));
  assert.ok(plads.bund <= plads.skaerm, `Kør-knappen ligger uden for skærmen (${plads.bund} > ${plads.skaerm})`);
}
await page.waitForTimeout(600);                       // botten kører bag menuen
await page.screenshot({ path: SHOTS + 'rutsjebane-start.png' });

/* ---------- Nedtælling ---------- */
await page.click('#startBtn');
await page.evaluate(() => window.GAME.pause());
{
  const st = await state();
  assert.equal(st.fase, 'spil');
  assert.equal(st.seed, 7, '?seed styrer banen');
  assert.ok(st.nedtael > 2.5, 'løbet begynder med en nedtælling');
  assert.equal(await page.locator('#raabTekst').textContent(), '3');
  assert.equal(st.robotter.length, 3, 'tre robotter');
}
const tik = (n, styr) => page.evaluate(([n, styr]) => { for (let i = 0; i < n; i++) window.GAME.tik(1 / 120, styr ?? undefined); }, [n, styr]);
await tik(120, 1);
assert.equal((await state()).s, 0, 'ingen kører før KØR!');
await tik(250);
assert.equal(await page.locator('#raabTekst').textContent(), 'KØR!');
assert.equal((await state()).nedtael, 0);

/* ---------- Fingeren på højre og venstre halvdel ---------- */
const c = await page.locator('#c').boundingBox();
{
  // Robotterne holder lidt tilbage, så ingen skubber til dig, mens fingeren prøves
  await page.evaluate(() => { for (const r of window.GAME.loeb.rytter.slice(1)) r.s = -30; });
  await tik(60);
  const foer = await state();
  await page.mouse.move(c.x + c.width * 0.85, c.y + c.height * 0.6);
  await page.mouse.down();
  await tik(50);
  const efter = await state();
  assert.equal(efter.fingre, 1, 'fingeren er registreret');
  assert.equal(efter.styr, 1, 'højre halvdel styrer til højre');
  assert.ok(efter.u > foer.u + 0.8, `rytteren glider til højre (${foer.u.toFixed(2)} → ${efter.u.toFixed(2)})`);
  assert.ok(efter.s > foer.s + 2, 'og ned ad banen af sig selv');
  await page.waitForSelector('#pilH.tryk', { timeout: 2000 });
  await page.mouse.up();
  assert.equal((await state()).fingre, 0, 'slipper man, styrer man ikke længere');
  const midt = (await state()).u;
  await page.mouse.move(c.x + c.width * 0.15, c.y + c.height * 0.6);
  await page.mouse.down();
  await tik(100);
  const v = await state();
  assert.equal(v.styr, -1, 'venstre halvdel styrer til venstre');
  assert.ok(v.u < midt - 0.8, 'rytteren glider til venstre');
  await page.mouse.up();
}
{
  await tik(60);
  const foer = await state();
  await page.keyboard.down('ArrowRight');
  await tik(40);
  await page.keyboard.up('ArrowRight');
  assert.ok((await state()).u > foer.u + 0.5, 'pil højre styrer til højre');
}

/* ---------- Ned ad banen med botten ---------- */
{
  const st = await page.evaluate(() => window.GAME.botTur(260));
  assert.ok(st.s >= 260 && st.rytter === 'bane');
  assert.ok(st.moenter > 0, 'botten har samlet penge på vejen');
  await page.evaluate(() => window.GAME.resume());
  await page.waitForTimeout(250);
  await page.evaluate(() => window.GAME.pause());
  await page.screenshot({ path: SHOTS + 'rutsjebane.png' });
  const nu = await state();
  assert.match(await page.locator('#pladsEl').textContent(), new RegExp(`^${nu.plads}\\. af 4$`), 'HUD\'en viser pladsen');
  assert.equal(await page.locator('#moentEl').textContent(), '🪙 ' + nu.moenter, 'og pengene');
  assert.match(await page.locator('#fartEl').textContent(), /^\d+ km\/t$/, 'og farten');
  const k = await paaSkaerm();
  assert.ok(k && k.x > 0 && k.x < c.width && k.y > c.height * 0.4 && k.y < c.height, `rytteren står ikke på skærmen: ${JSON.stringify(k)}`);
  assert.equal(await page.locator('#fremdrift .prik').count(), 4, 'fire prikker i fremdriften øverst');
}
{
  const z = (await state()).zone;
  await page.evaluate(fra => window.GAME.botTur(fra - 20), z.fra);
  assert.match(await page.locator('#raabTekst').textContent(), /Forhindringer/, 'der råbes, når forhindringerne kommer');
  await page.evaluate(fra => window.GAME.botTur(fra + 45), z.fra);
  await page.evaluate(() => window.GAME.resume());
  await page.waitForTimeout(200);
  await page.evaluate(() => window.GAME.pause());
  await page.screenshot({ path: SHOTS + 'rutsjebane-forhindringer.png' });
}
{
  await page.evaluate(() => window.GAME.botTur(1100 - 90));
  assert.match(await page.locator('#raabTekst').textContent(), /Sigt efter bassinet/, 'der siges til, når bassinet kommer');
  const side = (await state()).pool.ox < 0 ? /venstre/ : /højre/;
  assert.match(await page.locator('#raabUnder').textContent(), side, 'og til hvilken side det ligger');
}

/* ---------- Hoppet: PLASK og resultatet ---------- */
{
  // Botten flyver ud over hopkanten – stop midt i luften og tag et billede
  await page.evaluate(() => window.GAME.botTur(1112 - 0.5));
  await page.evaluate(() => { for (let i = 0; i < 200 && window.GAME.state.rytter !== 'luft'; i++) window.GAME.tik(1 / 120, 0); });
  await page.evaluate(() => { for (let i = 0; i < 60; i++) window.GAME.tik(1 / 120, Math.sign(window.GAME.state.pool.ox)); });
  assert.equal((await state()).rytter, 'luft', 'man flyver');
  const k = await paaSkaerm();
  assert.ok(k && k.y > 0 && k.y < c.height, 'man kan se sig selv i luften');
  await page.screenshot({ path: SHOTS + 'rutsjebane-hop.png' });
  const st = await page.evaluate(() => window.GAME.botTur());
  assert.equal(st.rytter, 'plask', 'botten rammer bassinet');
  assert.equal(st.fase, 'efter');
  assert.match(await page.locator('#raabTekst').textContent(), /PLASK/);
  await page.evaluate(() => window.GAME.frem(0.4));
  await page.screenshot({ path: SHOTS + 'rutsjebane-plask.png' });
  const slut = await page.evaluate(() => window.GAME.frem(5));
  assert.equal(slut.fase, 'slut', 'resultatet kommer frem');
  const res = await page.evaluate(() => window.GAME.resultat);
  assert.ok(res.plads >= 1 && res.plads <= 4);
  assert.equal(await page.locator('#slutScreen.on').isVisible(), true);
  assert.match(await page.locator('#slutTitel').textContent(), res.plads === 1 ? /vandt/ : new RegExp(`^${res.plads}\\. plads`));
  assert.equal(await page.locator('#slutPoint').textContent(), `${res.point} point`);
  assert.match(await page.locator('#slutDele').textContent(), new RegExp(`Penge ${res.dele.moenter}`));
  assert.match(await page.locator('#slutDele').textContent(), /Plask \+20/);
  assert.equal(await page.locator('#slutRaekke li').count(), 4, 'alle fire står i resultatet');
  assert.match(await page.locator('#slutRaekke li.mig').textContent(), new RegExp(`^${res.plads}\\.`), 'med dig på din plads');
  assert.match(await page.locator('#slutRaekke').textContent(), /Bolt/);
  const b = await page.evaluate(() => document.getElementById('igenBtn').getBoundingClientRect().bottom);
  assert.ok(b <= await page.evaluate(() => innerHeight), '«Kør igen» ligger på skærmen');
  await page.waitForSelector('#hsSlut .hs-input', { timeout: 4000 });
  await page.fill('#hsSlut .hs-input', 'Joanna');
  await page.click('#hsSlut .hs-gem');
  await page.waitForFunction(() => /Joanna/.test(document.getElementById('hsSlut').textContent), null, { timeout: 4000 });
  assert.deepEqual(sendte, [{ navn: 'Joanna', score: res.point }], 'pointene sendes til toplisten');
  assert.equal(await page.evaluate(() => localStorage.getItem('zydy.rutsjebane.best')), String(res.point), 'rekorden huskes');
  await page.screenshot({ path: SHOTS + 'rutsjebane-slut.png' });
}

/* ---------- Uden at styre: ved siden af bassinet ---------- */
{
  await page.click('#igenBtn');
  await page.evaluate(() => window.GAME.pause());
  const st0 = await state();
  assert.equal(st0.fase, 'spil', 'man kører igen med det samme');
  assert.equal(st0.s, 0);
  assert.equal(st0.moenter, 0);
  assert.equal(await page.locator('#slutScreen.on').count(), 0, 'resultatet er væk');
  const st = await page.evaluate(() => window.GAME.frem(120, 0));
  assert.equal(st.fase, 'slut');
  assert.ok(st.rytter === 'fliser' || st.rytter === 'ude', `uden at styre rammer man ikke bassinet (${st.rytter})`);
  assert.match(await page.locator('#slutTitel').textContent(), /fliserne|verden/);
  assert.match(await page.locator('#slutDele').textContent(), /Ingen plads/);
  assert.match(await page.locator('#slutRaekke li.mig').textContent(), /–/, 'og ingen plads i rækken');
  await page.click('#tilbageBtn');
  assert.equal(await page.locator('#startScreen.on').isVisible(), true, 'og man kan komme tilbage til menuen');
}

/* ---------- Aktivitet meldt til forsiden ---------- */
assert.ok(api.log.aktivitet.some(a => a.spil === 'rutsjebane' && a.ny === true), 'spillet melder én start');

/* ---------- Passer på en iPad på tværs ---------- */
{
  const pad = await browser.newContext({ ...devices['iPad (gen 7) landscape'] });
  const p2 = await pad.newPage();
  const padFejl = [];
  p2.on('pageerror', e => padFejl.push(String(e)));
  p2.on('console', m => { if (m.type() === 'error') padFejl.push(m.text()); });
  await mockApi(p2);
  await p2.goto(`${BASE}/spil/rutsjebane/?seed=7`);
  await p2.waitForFunction(() => !!window.GAME);
  await p2.click('#startBtn');
  await p2.evaluate(() => { window.GAME.pause(); window.GAME.botTur(180); });
  const r = await p2.locator('#c').boundingBox();
  const k = await p2.evaluate(() => { const s = window.GAME.state; return window.GAME.skaerm(s.x, s.y + 0.6, s.z); });
  assert.ok(k && k.x > r.width * 0.25 && k.x < r.width * 0.75 && k.y > r.height * 0.4 && k.y < r.height, `rytteren står midt på iPad-skærmen: ${JSON.stringify(k)}`);
  const foer = await p2.evaluate(() => window.GAME.state.u);
  await p2.mouse.move(r.x + r.width * 0.9, r.y + r.height * 0.5);
  await p2.mouse.down();
  await p2.evaluate(() => { for (let i = 0; i < 50; i++) window.GAME.tik(1 / 120); });
  await p2.mouse.up();
  assert.ok(await p2.evaluate(() => window.GAME.state.u) > foer + 0.5, 'højre halvdel styrer til højre dér');
  assert.ok(await p2.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'ingen vandret scroll på iPad');
  await p2.evaluate(() => window.GAME.resume());
  await p2.waitForTimeout(200);
  await p2.screenshot({ path: SHOTS + 'rutsjebane-ipad.png' });
  assert.deepEqual(padFejl, [], 'ingen fejl på iPad');
  await pad.close();
}

/* ---------- Ingen vandret scroll, ingen fejl ---------- */
assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'ingen vandret scroll');
assert.deepEqual(errors, [], 'ingen console-fejl');
await browser.close();
console.log('OK rutsjebane');
