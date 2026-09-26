// Kør:  PLAYWRIGHT=/Users/lars/Projekter/DungeonCrawler/node_modules/playwright/index.mjs node test/kylling.test.mjs
// (kræver at en lokal server kører: python3 -m http.server 4193 -d public)
//
// Spiller «Kyllingejagt» igennem: startskærm → joysticket med en rigtig finger
// får bonden til at løbe → en kylling fanges og flyver hjem → uret tæller ned
// → botten spiller resten af minuttet → slutskærm og topliste → igen og menu.
// Til sidst på en iPad på tværs. API'erne kører i hukommelsen (test/api-mock.mjs).
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

// Tom topliste, så enhver runde kvalificerer og navneformularen dukker op til sidst
const sendte = [];
const api = await mockApi(page);
await page.route('**/api/highscore/**', async route => {
  const req = route.request();
  if (req.method() === 'POST') {
    const krop = req.postDataJSON(); sendte.push(krop);
    return route.fulfill({ json: { ok: true, id: 1, token: 'abc', placering: 1, liste: [{ id: 1, navn: krop.navn, score: krop.score, oprettet: '2026-09-26T12:00:00.000Z' }] } });
  }
  return route.fulfill({ json: { spil: 'kylling', retning: 'desc', min: 1, maks: 500, liste: [] } });
});

await page.goto(`${BASE}/spil/kylling/?seed=7`);
await page.waitForFunction(() => !!window.GAME);
const state = () => page.evaluate(() => window.GAME.state);

/* ---------- Startskærmen ---------- */
assert.equal(await page.locator('#startScreen.on').isVisible(), true, 'startskærmen vises');
assert.equal((await state()).fase, 'menu');
assert.equal((await state()).seed, 7, '?seed styrer gårdspladsen');
await page.waitForFunction(() => document.querySelector('#hsStart .hs-titel'), null, { timeout: 4000 });
assert.match(await page.locator('#hsStart').textContent(), /Topliste/, 'toplisten hentes på startskærmen');
{
  const plads = await page.evaluate(() => {
    const b = document.getElementById('startBtn').getBoundingClientRect();
    return { bund: b.bottom, skaerm: innerHeight };
  });
  assert.ok(plads.bund <= plads.skaerm, `Fang-knappen ligger uden for skærmen (${plads.bund} > ${plads.skaerm})`);
}
{
  const st = await state();
  assert.ok(st.h > st.b, 'på en telefon på højkant er gårdspladsen høj');
  assert.ok(Math.abs(st.b * st.h - 300) < 1, 'og har det faste areal');
}
await page.screenshot({ path: SHOTS + 'kylling-start.png' });

/* ---------- Joysticket: fingeren ned og træk, så løber bonden ---------- */
await page.click('#startBtn');
assert.equal((await state()).fase, 'spil');
assert.equal(await page.locator('#tidEl').textContent(), '60', 'uret starter på et minut');
await page.evaluate(() => window.GAME.pause());
const tik = (n, j) => page.evaluate(([n, j]) => { for (let i = 0; i < n; i++) window.GAME.tik(1 / 120, j); }, [n, j]);

{
  const foer = (await state()).bonde;
  const c = await page.locator('#c').boundingBox();
  const mx = c.x + c.width / 2, my = c.y + c.height * 0.7;
  await page.mouse.move(mx, my);
  await page.mouse.down();
  await page.mouse.move(mx - 60, my, { steps: 4 });   // træk til venstre
  assert.equal((await state()).joy.aktiv, true, 'fingeren er et joystick');
  await tik(60);
  const efter = (await state()).bonde;
  assert.ok(efter.x < foer.x - 1, `bonden løber til venstre (${foer.x} → ${efter.x})`);
  assert.ok(Math.abs(efter.y - foer.y) < 0.5, 'og ikke op eller ned');
  await page.mouse.up();
  assert.equal((await state()).joy.aktiv, false);
  await tik(60);
  const staa = (await state()).bonde;
  assert.ok(Math.hypot(staa.vx, staa.vy) < 0.05, 'slipper man, stopper han');
}
// Tastaturet virker også (til dem, der spiller på computer)
{
  const foer = (await state()).bonde;
  await page.keyboard.down('ArrowUp');
  await tik(40);
  await page.keyboard.up('ArrowUp');
  assert.ok((await state()).bonde.y < foer.y - 0.5, 'pil op løber opad');
}

/* ---------- En kylling fanges og flyver hjem ---------- */
{
  const foer = await state();
  const k = foer.kyllinger[0];
  // Stil bonden lige ved siden af – kyllingen får ikke tid til at smutte
  await page.evaluate(k => {
    window.GAME.placerKylling(0, k.x, k.y);
    window.GAME.placer(k.x - 0.4, k.y);
  }, k);
  await tik(1);
  const efter = await state();
  assert.equal(efter.fangst, foer.fangst + 1, 'kyllingen er fanget');
  assert.ok(!efter.kyllinger.some(q => q.id === k.id), 'og væk fra gårdspladsen');
  assert.equal(await page.locator('#fangstEl').textContent(), String(efter.fangst), 'HUD\'en tæller med');
  await page.evaluate(() => window.GAME.resume());
  await page.waitForTimeout(250);                    // lad den flyve et stykke mod hønsehuset
  await page.screenshot({ path: SHOTS + 'kylling.png' });
  await page.evaluate(() => window.GAME.pause());
}

/* ---------- Uret tæller ned og bliver rødt til sidst ---------- */
{
  // Til midt i et sekund, så afrundingen ikke kan vippe
  const st = await page.evaluate(() => window.GAME.frem(51.5 - window.GAME.state.t, null));
  assert.equal(st.fase, 'spil');
  assert.equal(await page.locator('#tidEl').textContent(), '9', 'uret står på 9');
  assert.equal(await page.locator('#tidEl.snart').count(), 1, 'de sidste ti sekunder er uret rødt');
}

/* ---------- Botten spiller resten – slutskærm og topliste ---------- */
{
  // Spol tilbage til start af en ny runde, så botten får et helt minut
  await page.evaluate(() => { window.GAME.start(); window.GAME.pause(); });
  const slut = await page.evaluate(() => window.GAME.botTur());
  assert.equal(slut.fase, 'slut');
  assert.ok(slut.fangst >= 10, `botten fangede kun ${slut.fangst} kyllinger på et minut`);
  assert.equal(await page.locator('#slutScreen.on').isVisible(), true, 'slutskærmen kommer frem');
  assert.match(await page.locator('#slutFangst').textContent(), new RegExp(`^${slut.fangst} kyllinger$`));
  assert.match(await page.locator('#slutTitel').textContent(), /Tiden er gået/);

  await page.waitForSelector('#hsSlut .hs-input', { timeout: 4000 });
  await page.fill('#hsSlut .hs-input', 'Joanna');
  await page.click('#hsSlut .hs-gem');
  await page.waitForFunction(() => /Joanna/.test(document.getElementById('hsSlut').textContent), null, { timeout: 4000 });
  assert.deepEqual(sendte, [{ navn: 'Joanna', score: slut.fangst }], 'fangsten sendes til toplisten');
  assert.equal(await page.evaluate(() => localStorage.getItem('zydy.kylling.best')), String(slut.fangst), 'rekorden huskes');
  await page.screenshot({ path: SHOTS + 'kylling-slut.png' });
}

/* ---------- Fang flere og menu ---------- */
{
  await page.click('#igenBtn');
  const st = await state();
  assert.equal(st.fase, 'spil', 'man fanger videre med det samme');
  assert.equal(st.fangst, 0);
  assert.ok(st.tilbage > 59, 'med et helt minut');
  assert.equal(await page.locator('#slutScreen.on').count(), 0, 'slutskærmen er væk');
  await page.click('#menuBtn');
  assert.equal(await page.locator('#startScreen.on').isVisible(), true, 'og man kan komme tilbage til menuen');
  assert.match(await page.locator('#rekHud').textContent(), /Rekord \d+/);
}

/* ---------- Aktivitet meldt til forsiden ---------- */
assert.ok(api.log.aktivitet.some(a => a.spil === 'kylling' && a.ny === true), 'spillet melder én start');

/* ---------- Passer på en iPad på tværs ---------- */
{
  const pad = await browser.newContext({ ...devices['iPad (gen 7) landscape'] });
  const p2 = await pad.newPage();
  const padFejl = [];
  p2.on('pageerror', e => padFejl.push(String(e)));
  await mockApi(p2);
  await p2.goto(`${BASE}/spil/kylling/?seed=7`);
  await p2.waitForFunction(() => !!window.GAME);
  await p2.click('#startBtn');
  await p2.evaluate(() => window.GAME.pause());
  const st = await p2.evaluate(() => window.GAME.state);
  assert.ok(st.b > st.h, 'på en iPad på tværs er gårdspladsen bred');
  assert.ok(Math.abs(st.b * st.h - 300) < 1, 'men har det samme areal som på telefonen');
  // Hele gårdspladsen kan ses
  const hjoerner = await p2.evaluate(() => {
    const s = window.GAME.state, a = window.GAME.skaerm(0, 0), b = window.GAME.skaerm(s.b, s.h);
    const r = document.getElementById('c').getBoundingClientRect();
    return { a, b, w: r.width, h: r.height };
  });
  assert.ok(hjoerner.a.x >= 0 && hjoerner.a.y >= 0 && hjoerner.b.x <= hjoerner.w && hjoerner.b.y <= hjoerner.h,
    'hele gårdspladsen er på skærmen');
  const efter = await p2.evaluate(() => window.GAME.frem(1, { x: 1, y: 0 }));
  assert.ok(efter.bonde.x > st.bonde.x + 2, 'og bonden løber også dér');
  assert.ok(await p2.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'ingen vandret scroll på iPad');
  await p2.evaluate(() => window.GAME.resume());
  await p2.waitForTimeout(150);
  await p2.screenshot({ path: SHOTS + 'kylling-ipad.png' });
  assert.deepEqual(padFejl, [], 'ingen fejl på iPad');
  await pad.close();
}

/* ---------- Ingen vandret scroll, ingen fejl ---------- */
assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'ingen vandret scroll');
assert.deepEqual(errors, [], 'ingen console-fejl');
await browser.close();
console.log('OK kylling');
