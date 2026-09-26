// Kør:  PLAYWRIGHT=/sti/til/playwright/index.mjs node test/elementer.test.mjs
// (kræver at en lokal server kører, se test/run.mjs)
//
// Spiller «Elementløbet» igennem: startskærm → de fire elementknapper skifter
// form → det rigtige element klarer forhindringen → det forkerte koster et liv
// → botten viser at banen kan klares → tre fejl → slutskærm og topliste.
// API'erne kører i hukommelsen (test/api-mock.mjs).
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
    return route.fulfill({ json: { ok: true, id: 1, token: 'abc', placering: 1, liste: [{ id: 1, navn: krop.navn, score: krop.score, oprettet: '2026-09-15T12:00:00.000Z' }] } });
  }
  return route.fulfill({ json: { spil: 'elementer', retning: 'desc', min: 1, maks: 2000, liste: [] } });
});

await page.goto(`${BASE}/spil/elementer/?seed=9`);
await page.waitForFunction(() => !!window.GAME);
const state = () => page.evaluate(() => window.GAME.state);

/* ---------- Startskærmen ---------- */
assert.equal(await page.locator('#startScreen.on').isVisible(), true, 'startskærmen vises');
assert.equal((await state()).fase, 'menu');
assert.equal((await state()).seed, 9, '?seed styrer banen');
assert.equal(await page.locator('#styring:not([hidden])').count(), 0, 'knapperne venter til løbet går i gang');
await page.waitForFunction(() => document.querySelector('#hsStart .hs-titel'), null, { timeout: 4000 });
assert.match(await page.locator('#hsStart').textContent(), /Topliste/, 'toplisten hentes på startskærmen');

// Løb-knappen skal kunne nås uden at rulle
{
  const plads = await page.evaluate(() => {
    const b = document.getElementById('startBtn').getBoundingClientRect();
    return { bund: b.bottom, skaerm: innerHeight };
  });
  assert.ok(plads.bund <= plads.skaerm, `Løb-knappen ligger uden for skærmen (${plads.bund} > ${plads.skaerm})`);
}
await page.screenshot({ path: SHOTS + 'elementer-start.png' });

/* ---------- Elementknapperne skifter form ---------- */
await page.click('#startBtn');
assert.equal((await state()).fase, 'spil');
await page.evaluate(() => window.GAME.pause());

// Alle fire knapper står på skærmen, store nok til en tommelfinger
{
  const knapper = await page.evaluate(() => [...document.querySelectorAll('.elBtn')].map(b => {
    const r = b.getBoundingClientRect();
    return { el: b.dataset.element, h: r.height, synlig: r.bottom <= innerHeight && r.top >= 0 };
  }));
  assert.deepEqual(knapper.map(k => k.el), ['ild', 'jord', 'vand', 'vind'], 'i Sofies rækkefølge');
  for (const k of knapper) {
    assert.ok(k.synlig, `knappen ${k.el} er uden for skærmen`);
    assert.ok(k.h >= 44, `knappen ${k.el} er for lille (${k.h}px)`);
  }
}

assert.equal((await state()).element, 'jord', 'man starter som jord');
await page.click('.elBtn[data-element="vand"]');
await page.evaluate(() => window.GAME.tik(1 / 120));
assert.equal((await state()).element, 'vand', 'knappen skifter element');
assert.equal(await page.locator('.elBtn[data-element="vand"]').getAttribute('aria-pressed'), 'true', 'og knappen lyser op');
assert.equal(await page.locator('.elBtn[data-element="jord"]').getAttribute('aria-pressed'), 'false');

// Tastaturet gør det samme (til dem der spiller på computer)
await page.keyboard.press('Digit1');
await page.evaluate(() => window.GAME.tik(1 / 120));
assert.equal((await state()).element, 'ild', '1-tasten er ild');

/* ---------- Det rigtige element klarer forhindringen ---------- */
{
  const f = await page.evaluate(() => window.GAME.naeste());
  await page.click(`.elBtn[data-element="${f.klares}"]`);
  await page.evaluate(x => window.GAME.placer(x), f.x - 0.1);
  await page.evaluate(() => window.GAME.tik(1 / 10));
  const st = await state();
  assert.equal(st.klaret, 1, 'forhindringen er klaret');
  assert.equal(st.liv, st.konst.LIV, 'uden at det kostede noget');
  assert.equal(await page.locator('#klaretEl').textContent(), '1', 'HUD\'en tæller med');
}

/* ---------- Det forkerte element koster et liv ---------- */
{
  const f = await page.evaluate(() => window.GAME.naeste());
  const forkert = ['ild', 'jord', 'vand', 'vind'].find(el => el !== f.klares);
  await page.evaluate(el => window.GAME.vaelg(el), forkert);
  await page.evaluate(x => window.GAME.placer(x), f.x - 0.1);
  await page.evaluate(() => window.GAME.tik(1 / 10));
  const st = await state();
  assert.equal(st.liv, st.konst.LIV - 1, 'et fejltrin koster et liv');
  assert.equal(st.stime, 0, 'og stimen er væk');
  assert.match(await page.locator('#livEl').textContent(), /🤍/, 'hjerterne i HUD\'en følger med');
  assert.match(await page.locator('#raabUnder').textContent(), /Ild|Vand|Vind|Jord/, 'og man får at vide, hvad man skulle have trykket');
}

/* ---------- Botten viser, at banen kan klares ---------- */
{
  await page.evaluate(() => window.GAME.start());
  await page.evaluate(() => window.GAME.pause());
  await page.evaluate(() => window.GAME.frem(5));
  await page.evaluate(() => window.GAME.resume());
  await page.waitForTimeout(250);                     // lad et par billeder blive tegnet
  await page.screenshot({ path: SHOTS + 'elementer.png' });
  await page.evaluate(() => window.GAME.pause());

  const st = await page.evaluate(() => window.GAME.botTur(40));
  assert.equal(st.doed, false, 'den perfekte bot overlever');
  assert.ok(st.klaret >= 10, `botten klarede kun ${st.klaret} på 40 sekunder`);
  assert.equal(st.liv, st.konst.LIV, 'uden at miste et liv');
}

/* ---------- Tegningen: lys og skygge, ikke flade farver (Sofies ønske #63) ---------- */
{
  // Tæller farverne i et felt af canvas'et (4 bit pr. kanal, så kantudglatning
  // næsten ikke tæller) og finder gennemsnitsfarven. Flade figurer har en
  // håndfuld farver; figurer med lys, skygge og forløb har mange.
  const felt = (x0, y0, x1, y1) => page.evaluate(([x0, y0, x1, y1]) => {
    const c = document.getElementById('c'), k = c.width / c.clientWidth;
    const d = c.getContext('2d').getImageData(Math.round(x0 * k), Math.round(y0 * k), Math.round((x1 - x0) * k), Math.round((y1 - y0) * k)).data;
    const set = new Set(); let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) {
      set.add((d[i] >> 4) << 8 | (d[i + 1] >> 4) << 4 | (d[i + 2] >> 4));
      r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
    }
    return { farver: set.size, r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n) };
  }, [x0, y0, x1, y1]);
  const toBilleder = () => page.evaluate(() => new Promise(ok => requestAnimationFrame(() => requestAnimationFrame(ok))));

  // «LØB!»-råbet ligger oven på canvas'et – væk med det, så skærmbillederne viser figuren
  await page.evaluate(() => { window.GAME.start(); window.GAME.pause(); document.getElementById('raab').classList.remove('on'); });

  // De fire former: hver skal ligne sit element
  const former = {};
  for (const el of ['ild', 'jord', 'vand', 'vind']) {
    await page.evaluate(e => { window.GAME.vaelg(e); window.GAME.frem(0.2); }, el);  // forbi blinket
    await toBilleder();
    const { u, spiller } = await page.evaluate(() => window.GAME.tegning);
    const rc = await page.evaluate(() => { const r = document.getElementById('c').getBoundingClientRect(); return { x: r.left, y: r.top }; });
    former[el] = await felt(spiller.x - u * 0.6, spiller.y - u * 0.6, spiller.x + u * 0.6, spiller.y + u * 0.6);
    await page.screenshot({ path: SHOTS + `elementer-form-${el}.png`, clip: { x: rc.x + spiller.x - u * 1.6, y: rc.y + spiller.y - u * 1.4, width: u * 2.8, height: u * 2.4 } });
  }
  console.log('  former:', JSON.stringify(former));
  for (const [el, f] of Object.entries(former)) assert.ok(f.farver >= 40, `${el} er tegnet med for få farver (${f.farver}) – ser flad ud`);
  assert.ok(former.ild.r > former.ild.b + 60, `ilden skal være varm: ${JSON.stringify(former.ild)}`);
  assert.ok(former.vand.b > former.vand.r + 60, `vandet skal være blåt: ${JSON.stringify(former.vand)}`);
  assert.ok(former.jord.r > former.jord.b, `klippen skal være brun: ${JSON.stringify(former.jord)}`);

  // Forhindringerne, én af hver slags, stillet ude til højre på skærmen
  const forhindringer = {};
  for (const slags of ['krat', 'baal', 'flod', 'storm']) {
    const f = await page.evaluate(sl => {
      for (let n = 0; n < 60; n++) { const f = window.GAME.forhindring(n); if (f.slags === sl) return f; }
    }, slags);
    assert.ok(f, `banen har et ${slags}`);
    await page.evaluate(x => { const t = window.GAME.tegning; window.GAME.placer(x - 0.45 * t.W / t.u); }, f.x);
    await toBilleder();
    const { u, camX, grundY } = await page.evaluate(() => window.GAME.tegning);
    const px = (f.x - camX) * u;
    forhindringer[slags] =
      slags === 'flod' ? await felt(px - u * 1.2, grundY - u * 0.1, px + u * 1.2, grundY + u * 0.7)
      : slags === 'storm' ? await felt(px - u * 0.7, grundY - u * 2.6, px + u * 0.7, grundY - u * 0.3)
      : await felt(px - u * 0.7, grundY - u * 1.3, px + u * 0.7, grundY - u * 0.05);
    if (slags === 'baal') await page.screenshot({ path: SHOTS + 'elementer-baal.png' });
  }
  console.log('  forhindringer:', JSON.stringify(forhindringer));
  for (const [sl, f] of Object.entries(forhindringer)) assert.ok(f.farver >= 40, `${sl} er tegnet med for få farver (${f.farver}) – ser flad ud`);
  assert.ok(forhindringer.krat.g > forhindringer.krat.r && forhindringer.krat.g > forhindringer.krat.b, `krattet skal være grønt: ${JSON.stringify(forhindringer.krat)}`);
  assert.ok(forhindringer.baal.r > forhindringer.baal.b + 40, `bålet skal brænde: ${JSON.stringify(forhindringer.baal)}`);
  assert.ok(forhindringer.flod.b > forhindringer.flod.r + 30, `floden skal være blå: ${JSON.stringify(forhindringer.flod)}`);
}

/* ---------- Tre fejl – og slutskærmen med topliste ---------- */
{
  await page.evaluate(() => window.GAME.start());
  await page.evaluate(() => window.GAME.pause());
  // Bliv som jord hele vejen: så rammer man alt, der ikke er en storm, og
  // taber inden længe – deterministisk med fast frø.
  const slut = await page.evaluate(() => window.GAME.frem(120, 'jord'));
  assert.equal(slut.doed, true, 'tre fejl slutter løbet');
  assert.equal(slut.fase, 'doed');
  assert.ok(['krat', 'baal', 'flod', 'storm'].includes(slut.aarsag), 'med en årsag på');

  assert.equal(await page.locator('#slutScreen.on').isVisible(), true, 'slutskærmen kommer frem');
  assert.match(await page.locator('#slutKlaret').textContent(), new RegExp(`^${slut.klaret} klaret$`), 'det klarede står stort');
  assert.equal(await page.locator('#styring:not([hidden])').count(), 0, 'knapperne er væk igen');

  // Første gang spørges der om navn; derefter huskes det på tværs af spillene
  await page.waitForSelector('#hsSlut .hs-input', { timeout: 4000 });
  await page.fill('#hsSlut .hs-input', 'Sofie');
  await page.click('#hsSlut .hs-gem');
  await page.waitForFunction(() => /Sofie/.test(document.getElementById('hsSlut').textContent), null, { timeout: 4000 });
  assert.deepEqual(sendte, [{ navn: 'Sofie', score: slut.klaret }], 'scoren sendes til toplisten');
  assert.equal(await page.evaluate(() => localStorage.getItem('zydy.navn')), 'Sofie', 'navnet huskes til de andre spil');
  assert.equal(await page.evaluate(() => localStorage.getItem('zydy.elementer.best')), String(slut.klaret), 'rekorden huskes');
  await page.screenshot({ path: SHOTS + 'elementer-slut.png' });
}

/* ---------- Løb igen og menu ---------- */
{
  await page.click('#igenBtn');
  const st = await state();
  assert.equal(st.fase, 'spil', 'man løber videre med det samme');
  assert.equal(st.klaret, 0, 'fra nul');
  assert.equal(st.liv, st.konst.LIV);
  assert.equal(st.element, 'jord', 'og som jord igen');
  assert.equal(await page.locator('#slutScreen.on').count(), 0, 'slutskærmen er væk');

  await page.evaluate(() => window.GAME.tilMenu());
  assert.equal(await page.locator('#startScreen.on').isVisible(), true, 'og man kan komme tilbage til menuen');
  assert.match(await page.locator('#rekHud').textContent(), /\d+/, 'hvor rekorden står');
}

/* ---------- Aktivitet meldt til forsiden ---------- */
assert.ok(api.log.aktivitet.some(a => a.spil === 'elementer' && a.ny === true), 'spillet melder én start');

/* ---------- Passer på en iPad på tværs ---------- */
{
  const pad = await browser.newContext({ ...devices['iPad (gen 7) landscape'] });
  const p2 = await pad.newPage();
  const padFejl = [];
  p2.on('pageerror', e => padFejl.push(String(e)));
  await mockApi(p2);
  await p2.goto(`${BASE}/spil/elementer/?seed=9`);
  await p2.waitForFunction(() => !!window.GAME);
  await p2.click('#startBtn');
  await p2.evaluate(() => window.GAME.pause());
  const st = await p2.evaluate(() => window.GAME.botTur(15));
  assert.equal(st.fase, 'spil', 'løbet kører også på en iPad');
  assert.ok(st.klaret >= 3, 'og botten klarer forhindringer');
  assert.ok(await p2.evaluate(() => {
    const r = document.getElementById('c').getBoundingClientRect();
    return r.width > 600 && r.height > 200;
  }), 'fladen fylder skærmen');
  assert.ok(await p2.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'ingen vandret scroll på iPad');
  await p2.screenshot({ path: SHOTS + 'elementer-ipad.png' });
  assert.deepEqual(padFejl, [], 'ingen fejl på iPad');
  await pad.close();
}

/* ---------- Ingen vandret scroll, ingen fejl ---------- */
assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'ingen vandret scroll');
assert.deepEqual(errors, [], 'ingen console-fejl');
await browser.close();
console.log('OK elementer');
