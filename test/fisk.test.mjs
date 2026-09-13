// Kør:  PLAYWRIGHT=/Users/lars/Projekter/DungeonCrawler/node_modules/playwright/index.mjs node test/fisk.test.mjs
// (kræver at en lokal server kører: python3 -m http.server 4191 -d public)
//
// Kører «Fiskedybet» igennem: startskærm → sejlkortet → et hug i Solskinshavet
// med en rigtig finger på baren → en fuld last → salg og opgradering i havnen →
// et uhyre i Hajvandet, både klippet og kæmpet → båden slæbt i havn → og til
// sidst fiskebogen. API'erne kører i hukommelsen (test/api-mock.mjs).
import assert from 'node:assert/strict';
import { mockApi } from './api-mock.mjs';
const { chromium, devices } = await import(process.env.PLAYWRIGHT ?? 'playwright');
const BASE = process.env.BASE ?? 'http://localhost:4191';
const SHOTS = new URL('./shots/', import.meta.url).pathname;

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 13'] });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

// Navnet kendes fra et andet spil, så nye arter sendes ind af sig selv
await page.addInitScript(() => localStorage.setItem('zydy.navn', 'Timo'));

// Tom topliste, så enhver samling kvalificerer
const sendte = [];
const api = await mockApi(page);
await page.route('**/api/highscore/**', async route => {
  const req = route.request();
  if (req.method() === 'POST') {
    const krop = req.postDataJSON(); sendte.push(krop);
    return route.fulfill({ json: { ok: true, id: 1, token: 'abc', placering: 1, liste: [{ id: 1, navn: krop.navn, score: krop.score, oprettet: '2026-09-13T12:00:00.000Z' }] } });
  }
  return route.fulfill({ json: { spil: 'fisk', retning: 'desc', min: 1, maks: 60, unik: true, liste: [] } });
});

// ?nyt=1 giver en frisk båd, så testen ikke afhænger af en gemt fangst
await page.goto(`${BASE}/spil/fisk/?seed=5&nyt=1`);
await page.waitForFunction(() => !!window.GAME);
const state = () => page.evaluate(() => window.GAME.state);

/** Hugger en bestemt art på og kæmper den hjem (eller mister den). */
const fang = art => page.evaluate(a => {
  window.GAME.tvingBid(a);
  window.GAME.kast();
  while (window.GAME.state.fase === 'venter') window.GAME.frem(1 / 60);
  return window.GAME.spilKamp();
}, art);

/** Hugger på og bliver stående ved valget (kun uhyrer). */
const hugPaa = art => page.evaluate(a => {
  window.GAME.tvingBid(a);
  window.GAME.kast();
  while (window.GAME.state.fase === 'venter') window.GAME.frem(1 / 60);
  return window.GAME.state;
}, art);

/* ---------- Startskærmen ---------- */
assert.equal(await page.locator('#startScreen.on').isVisible(), true, 'startskærmen vises');
assert.equal(await page.evaluate(() => window.GAME.seed), 5, '?seed styrer, hvad der hugger');
assert.equal((await state()).fase, 'menu');
assert.equal((await state()).sted, 'havn', 'man begynder i havnen');
await page.waitForFunction(() => document.querySelector('#hsListe .hs-titel'), null, { timeout: 4000 });
assert.match(await page.locator('#hsListe').textContent(), /Flest arter/, 'toplisten står på startskærmen');
assert.match(await page.locator('.lavet').textContent(), /Timo/, 'der står hvem der ønskede sig spillet');

// Knappen skal kunne nås uden at rulle (reglerne står derfor under den)
{
  const plads = await page.evaluate(() => {
    const b = document.getElementById('startBtn').getBoundingClientRect();
    return { bund: b.bottom, skærm: innerHeight };
  });
  assert.ok(plads.bund <= plads.skærm, `Sejl ud-knappen ligger uden for skærmen (${plads.bund} > ${plads.skærm})`);
}
await page.screenshot({ path: SHOTS + 'fisk-start.png' });

/* ---------- Sejlkortet: kun så langt snøren rækker ---------- */
await page.click('#startBtn');
assert.equal(await page.locator('#sejlScreen.on').isVisible(), true, 'sejlkortet kommer frem, når man ligger i havn');
assert.equal(await page.locator('.sted').count(), 6, 'havnen og fem farvande');
assert.equal(await page.locator('.sted[data-sted="sol"]').isDisabled(), false, 'Solskinshavet er gratis');
assert.equal(await page.locator('.sted[data-sted="haj"]').isDisabled(), true, 'Hajvandet kræver en længere snøre');
assert.match(await page.locator('.sted[data-sted="tomrum"]').textContent(), /🔒/, 'og Tomrummet er godt låst');

await page.click('.sted[data-sted="sol"]');
{
  const st = await state();
  assert.equal(st.sted, 'sol');
  assert.equal(st.fase, 'klar');
  assert.equal(await page.locator('#sejlScreen.on').count(), 0, 'kortet lukker, når man har valgt');
  assert.match(await page.locator('#stedNavn').textContent(), /Solskinshavet/, 'HUD\'en siger hvor vi er');
  assert.equal(await page.locator('#kastBtn').isVisible(), true, 'og nu kan der fiskes');
}

/* ---------- Et hug: baren, og en rigtig finger på skærmen ---------- */
{
  const st = await hugPaa('torsk');
  assert.equal(st.fase, 'kamp', 'der hugger noget, når snøren har været ude');
  assert.equal(st.bid.art, 'torsk');
  assert.equal(await page.locator('#barWrap').isVisible(), true, 'baren kommer frem');
  const bar = await page.evaluate(() => ({
    felt: parseFloat(document.getElementById('felt').style.width),
    viser: parseFloat(document.getElementById('viser').style.left),
  }));
  assert.ok(bar.felt > 5 && bar.felt < 60, `det grønne felt fylder ${bar.felt} % af baren`);
  assert.ok(bar.viser >= 0 && bar.viser <= 100, 'og viseren står på baren');
  await page.screenshot({ path: SHOTS + 'fisk.png' });

  // Et tryk et vilkårligt sted på havet tæller som «hal ind» – vi venter, til
  // viseren er i det grønne, og trykker med musen ligesom en finger.
  await page.evaluate(() => { while (!window.GAME.state.kamp.rammer) window.GAME.frem(1 / 60); });
  const boks = await page.locator('#c').boundingBox();
  await page.mouse.click(boks.x + boks.width / 2, boks.y + boks.height * 0.45);
  {
    // Om trykket landede i det grønne, afhænger af, hvor viseren nåede hen
    // imens – at det *tæller*, er pointen her. Selve reglen for det grønne
    // felt står i test/unit/fisk.test.mjs.
    const k = (await state()).kamp;
    assert.ok(k && k.ramt + k.fejl >= 1, 'et tryk på havet tæller som «hal ind»');
  }

  const efter = await page.evaluate(() => window.GAME.spilKamp());
  assert.equal(efter.fase, 'klar', 'kampen er ovre');
  assert.equal(efter.last, 1, 'torsken ligger i lasten');
  assert.equal(efter.arter, 1, 'og står i fiskebogen');
  assert.ok(efter.lastVaerdi > 0, 'den er noget værd');
  assert.match(await page.locator('#lastEl').textContent(), /Last 1\/4/, 'HUD\'en tæller lasten');
  assert.match(await page.locator('#raabTekst').textContent(), /NY ART/, 'første torsk er en ny art');
}

/* ---------- En ny art sendes selv ind på toplisten ---------- */
await page.waitForFunction(() => true, null, { timeout: 200 }).catch(() => {});
assert.ok(sendte.some(x => x.navn === 'Timo' && x.score === 1), `ny art sendes ind (sendt: ${JSON.stringify(sendte)})`);

/* ---------- Lasten kan blive fuld – men bogen husker alligevel arten ---------- */
{
  for (const a of ['sild', 'makrel', 'rodspaette']) await fang(a);
  let st = await state();
  assert.equal(st.last, st.maksLast, 'kølerummet er fuldt');
  assert.equal(st.arter, 4);

  st = await fang('hornfisk');
  assert.equal(st.last, st.maksLast, 'der er ikke plads til flere');
  assert.equal(st.arter, 5, 'men hornfisken står i bogen');
  assert.match(await page.locator('#raab').textContent(), /lasten er fuld/i, 'og spillet siger det højt');
}

/* ---------- Havnen: salg og en bedre båd ---------- */
{
  await page.evaluate(() => window.GAME.sejl('havn'));
  let st = await state();
  assert.equal(st.sted, 'havn');
  assert.equal(await page.locator('#kastBtn').count(), 1);
  assert.equal(await page.locator('#kastBtn').isVisible(), false, 'i havnen kan man ikke fiske');
  assert.equal(await page.locator('#saelgBtn').isVisible(), true);
  const vaerdi = st.lastVaerdi, foer = st.moenter;
  await page.click('#saelgBtn');
  st = await state();
  assert.equal(st.last, 0, 'lasten er tom');
  assert.equal(st.moenter, foer + vaerdi, 'og pengene er i kassen');
  assert.equal(st.tjent, vaerdi);

  await page.evaluate(() => window.GAME.saetMoenter(5000));
  await page.click('#butikBtn');
  assert.equal(await page.locator('#butikScreen.on').isVisible(), true, 'butikken åbner');
  assert.equal(await page.locator('.vare').count(), 4, 'fire ting at spare op til');
  await page.click('.vare[data-vare="snoer"]');
  st = await state();
  assert.equal(st.opgradering.snoer, 1, 'snøren er blevet længere');
  assert.ok(st.moenter < 5000, 'og den kostede penge');
  await page.click('#butikLuk');

  await page.click('#sejlBtn');
  assert.equal(await page.locator('.sted[data-sted="haj"]').isDisabled(), false, 'nu rækker snøren ud i Hajvandet');
  await page.click('.sted[data-sted="haj"]');
  assert.equal((await state()).sted, 'haj');
}

/* ---------- Uhyret: klip snøren, eller tag kampen ---------- */
{
  let st = await hugPaa('hvidhaj');
  assert.equal(st.fase, 'valg', 'et uhyre er et valg, ikke en kamp med det samme');
  assert.equal(st.bid.uhyre, true);
  assert.equal(await page.locator('#valgWrap').isVisible(), true);
  assert.match(await page.locator('#valgUnder').textContent(), /større end båden/i, 'der står hvad man har fat i');
  const skrogFoer = st.skrog;

  await page.click('#klipBtn');
  st = await state();
  assert.equal(st.fase, 'klar', 'snøren er klippet');
  assert.equal(st.skrog, skrogFoer, 'og båden er hel');
  assert.equal(st.arter, 5, 'man får ingen art for det, man slipper');

  // Noget i lasten, som kan gå tabt, når båden synker
  await fang('blaeksprutte');
  assert.equal((await state()).last, 1);

  // Og så tabes kampen med vilje: der trykkes kun, når viseren er UDEN FOR feltet
  const tabKampen = () => page.evaluate(() => {
    window.GAME.tagKampen();
    while (window.GAME.state.fase === 'kamp') {
      if (!window.GAME.state.kamp.rammer) window.GAME.tryk();
      else window.GAME.frem(1 / 60);
    }
    return window.GAME.state;
  });
  await hugPaa('hvidhaj');
  st = await tabKampen();
  assert.equal(st.skrog, skrogFoer - 1, 'hajen tog en bid af båden');
  assert.match(await page.locator('#raabTekst').textContent(), /AV/, 'og det kan mærkes');
  assert.match(await page.locator('#skrogEl').textContent(), /🖤/, 'HUD\'en viser hullet i skroget');

  // Resten af skroget ryger, og så bliver man slæbt i havn – uden lasten
  for (let i = 0; i < skrogFoer - 1; i++) { await hugPaa('hvidhaj'); st = await tabKampen(); }
  assert.equal(st.sted, 'havn', 'båden bliver slæbt i havn');
  assert.equal(st.last, 0, 'og lasten er væk');
  assert.equal(st.skrog, st.maksSkrog, 'men båden er lappet igen');
  assert.equal(st.arter, 6, 'fiskebogen husker alt, man har fanget');
  assert.match(await page.locator('#raabTekst').textContent(), /SLÆBT I HAVN/);
}

/* ---------- Fiskebogen ---------- */
{
  await page.click('#bogBtn');
  assert.equal(await page.locator('#bogScreen.on').isVisible(), true);
  assert.match(await page.locator('#bogArter').textContent(), /^6\/\d+$/, 'seks arter i bogen');
  assert.equal(await page.locator('.art[data-art="torsk"].ukendt').count(), 0, 'torsken er kendt');
  assert.equal(await page.locator('.art[data-art="dengamle"].ukendt').count(), 1, 'Den Gamle har vi til gode');
  assert.match(await page.locator('.art[data-art="torsk"]').textContent(), /Torsk/);
  assert.match(await page.locator('.art[data-art="dengamle"]').textContent(), /\?\?\?/, 'ukendte arter er hemmelige');
  await page.waitForFunction(() => /Timo/.test(document.getElementById('hsBog').textContent), null, { timeout: 4000 });
  await page.screenshot({ path: SHOTS + 'fisk-bog.png' });
  await page.click('#bogLuk');
  assert.equal(await page.locator('#bogScreen.on').count(), 0);
}

/* ---------- Spillet huskes til næste gang ---------- */
{
  const foer = await state();
  await page.goto(`${BASE}/spil/fisk/?seed=5`);       // uden ?nyt=1: båden hentes op af localStorage
  await page.waitForFunction(() => !!window.GAME);
  const st = await state();
  assert.equal(st.arter, foer.arter, 'fiskebogen står der stadig');
  assert.equal(st.moenter, foer.moenter, 'og pengene');
  assert.equal(st.opgradering.snoer, 1, 'og den længere snøre');
}

/* ---------- Aktivitet meldt til forsiden ---------- */
assert.ok(api.log.aktivitet.some(a => a.spil === 'fisk' && a.ny === true), 'spillet melder én start');

/* ---------- Passer på en iPad på tværs ---------- */
{
  const pad = await browser.newContext({ ...devices['iPad (gen 7) landscape'] });
  const p2 = await pad.newPage();
  const padFejl = [];
  p2.on('pageerror', e => padFejl.push(String(e)));
  await mockApi(p2);
  await p2.goto(`${BASE}/spil/fisk/?seed=5&nyt=1`);
  await p2.waitForFunction(() => !!window.GAME);
  await p2.click('#startBtn');
  await p2.click('.sted[data-sted="sol"]');
  const st = await p2.evaluate(() => {
    window.GAME.tvingBid('makrel');
    window.GAME.kast();
    while (window.GAME.state.fase === 'venter') window.GAME.frem(1 / 60);
    return window.GAME.spilKamp();
  });
  assert.equal(st.arter, 1, 'man kan også fiske på en iPad');
  assert.ok(await p2.evaluate(() => {
    const r = document.getElementById('c').getBoundingClientRect();
    return r.width > 600 && r.height > 200;
  }), 'havet fylder skærmen');
  assert.ok(await p2.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'ingen vandret scroll på iPad');
  await p2.screenshot({ path: SHOTS + 'fisk-ipad.png' });
  assert.deepEqual(padFejl, [], 'ingen fejl på iPad');
  await pad.close();
}

/* ---------- Ingen vandret scroll, ingen fejl ---------- */
assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'ingen vandret scroll');
assert.deepEqual(errors, [], 'ingen console-fejl');
await browser.close();
console.log('OK fisk');
