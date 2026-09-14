// Kør:  PLAYWRIGHT=/Users/lars/Projekter/DungeonCrawler/node_modules/playwright/index.mjs node test/slanger.test.mjs
// (kræver at en lokal server kører: python3 -m http.server 4191 -d public)
//
// Kører «Slanger» igennem: startskærm → de to store drejeknapper med en rigtig
// finger → perler, der spises → en hel runde og slutskærmen → og til sidst to
// browsere, hvor Sofie inviterer Selma ind på den samme plade. API'erne kører i
// hukommelsen (test/api-mock.mjs).
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

// Tom topliste, så en hvilken som helst længde kvalificerer
const sendte = [];
const api = await mockApi(page);
await page.route('**/api/highscore/**', async route => {
  const req = route.request();
  if (req.method() === 'POST') {
    const krop = req.postDataJSON(); sendte.push(krop);
    return route.fulfill({ json: { ok: true, id: 1, token: 'abc', placering: 1, liste: [{ id: 1, navn: krop.navn, score: krop.score, oprettet: '2026-09-14T12:00:00.000Z' }] } });
  }
  return route.fulfill({ json: { spil: 'slanger', retning: 'desc', min: 1, maks: 1024, unik: true, liste: [] } });
});

await page.goto(`${BASE}/spil/slanger/?seed=7&frys=1`);
await page.waitForFunction(() => !!window.GAME);
const state = () => page.evaluate(() => window.GAME.state);

/* ---------- Startskærmen ---------- */
assert.equal(await page.locator('#startScreen.on').isVisible(), true, 'startskærmen vises');
assert.equal((await state()).seed, 7, '?seed styrer pladen');
assert.equal((await state()).fase, 'menu');
await page.waitForFunction(() => document.querySelector('#hsListe .hs-titel'), null, { timeout: 4000 });
assert.match(await page.locator('#hsListe').textContent(), /Topliste/, 'toplisten står på startskærmen');
assert.match(await page.locator('.lavet').textContent(), /Far/, 'der står hvem der ønskede sig spillet');
assert.match(await page.locator('.regler').textContent(), /Nokia/, 'og at knapperne virker som på en Nokia');

// Spil-knappen skal kunne nås uden at rulle (reglerne står derfor under den)
{
  const plads = await page.evaluate(() => {
    const b = document.getElementById('startBtn').getBoundingClientRect();
    return { bund: b.bottom, skærm: innerHeight };
  });
  assert.ok(plads.bund <= plads.skærm, `Spil-knappen ligger uden for skærmen (${plads.bund} > ${plads.skærm})`);
}
await page.screenshot({ path: SHOTS + 'slanger-start.png' });

// Navnet skrives på startskærmen (som i Obby), så rekorden kan sendes af sig selv
await page.click('#nameBtn');
await page.fill('#nameInput', 'Selma');
await page.click('#nameForm button[type=submit]');
assert.equal(await page.evaluate(() => localStorage.getItem('zydy.navn')), 'Selma', 'navnet huskes til de andre spil');

/* ---------- Fire slanger glider ud – og knapperne er KÆMPE ---------- */
await page.click('#startBtn');
{
  const st = await state();
  assert.equal(st.fase, 'spil');
  assert.equal(await page.locator('#startScreen.on').count(), 0, 'startskærmen er væk');
  assert.equal(st.spillere.length, 4, 'mig og tre modstandere');
  assert.equal(st.spillere[0].mig, true);
  for (const p of st.spillere) assert.equal(p.laengde, 4, `${p.navn} starter med 4 led`);
  assert.equal(await page.locator('#rang .r').count(), 4, 'ranglisten har en linje pr. slange');
  assert.match(await page.locator('#rang').textContent(), /Dig[\s\S]*Otto[\s\S]*Mille[\s\S]*Aksel/);
  assert.match(await page.locator('#styrHint').textContent(), /drejer/, 'der står hvad knapperne gør');

  // Ønsket var «halvdelen af skærmen skal være knap»: de to drejeknapper skal
  // tilsammen fylde en stor bid af skærmen og kunne rammes i blinde.
  const knap = await page.evaluate(() => {
    const v = document.getElementById('vKnap').getBoundingClientRect();
    const h = document.getElementById('hKnap').getBoundingClientRect();
    return { v, h, skærm: { b: innerWidth, h: innerHeight } };
  });
  assert.ok(knap.v.height >= knap.skærm.h * 0.25, `venstre knap er for lav (${knap.v.height} af ${knap.skærm.h})`);
  assert.ok(knap.v.width + knap.h.width >= knap.skærm.b * 0.85, 'knapperne fylder næsten hele bredden');
  assert.ok(knap.v.left < knap.h.left, 'venstre knap står til venstre');
}

/* ---------- En rigtig finger på knapperne drejer slangen ---------- */
{
  let st = await state();
  const før = st.retning;
  await page.click('#hKnap');
  st = await page.evaluate(() => window.GAME.frem(0.3));
  assert.equal(st.retning, (før + 1) % 4, 'højre knap drejer med uret');
  await page.click('#vKnap');
  st = await page.evaluate(() => window.GAME.frem(0.3));
  assert.equal(st.retning, før, 'venstre knap drejer tilbage igen');

  // To hurtige tryk = to sving lige efter hinanden – hele Nokia-fidusen
  await page.click('#hKnap');
  await page.click('#hKnap');
  st = await page.evaluate(() => window.GAME.frem(0.5));
  assert.equal(st.retning, (før + 2) % 4, 'to hurtige tryk vender slangen 180° på to felter');
}

/* ---------- Perlerne spises, og slangerne vokser ---------- */
{
  await page.evaluate(() => window.GAME.start());
  const st = await page.evaluate(() => window.GAME.frem(25, () => window.GAME.botRetning()));
  assert.ok(st.mad >= 1, `slangen nåede ingen perler (${st.mad})`);
  assert.ok(st.laengde > 4, 'og den er vokset');
  assert.ok(st.bedste >= st.laengde, 'bedste længde følger med');
  assert.ok(st.spillere.some(p => !p.mig && p.bedste > 4), 'modstanderne spiser også');
  assert.equal(st.madPladser.length >= 24, true, 'der er altid perler på pladen');
  assert.ok(await page.evaluate(() => document.getElementById('flade').classList.contains('igang')),
    'minikortet og længden vises, mens man spiller');
  assert.match(await page.locator('#laengde').textContent(), /led/, 'længden står i hjørnet');
  await page.screenshot({ path: SHOTS + 'slanger.png' });
}

/* ---------- Væggen er slut: slutskærm og topliste ---------- */
{
  const st = await page.evaluate(() => window.GAME.frem(30, () => 3));   // op, til noget stopper os
  assert.equal(st.fase, 'slut', 'runden slutter, når man rammer noget');
  assert.equal(st.levende, false);
  assert.ok(['mur', 'egen', 'ramt'].includes(st.grund));

  assert.equal(await page.locator('#slutScreen.on').isVisible(), true, 'slutskærmen kommer frem');
  assert.match(await page.locator('#slutScore').textContent(), new RegExp(`^${st.score} led$`), 'længden står stort');
  assert.match(await page.locator('#slutSub').textContent(), /perle/, 'og hvor mange perler man nåede');
  assert.equal(await page.locator('#nyRekord').isVisible(), true, 'første runde er altid en ny rekord');
  assert.equal(await page.evaluate(() => localStorage.getItem('zydy.slanger.best')), String(st.score), 'rekorden huskes');

  await page.waitForFunction(() => /Selma/.test(document.getElementById('hsSlut').textContent), null, { timeout: 4000 });
  assert.ok(sendte.some(x => x.navn === 'Selma' && x.score === st.score), 'rekorden sendes selv til toplisten');
  assert.ok(sendte.every(x => Number.isInteger(x.score) && x.score >= 4 && x.score <= 1024), 'og det er altid en længde');
  await page.screenshot({ path: SHOTS + 'slanger-slut.png' });
}

/* ---------- Spil igen og menu ---------- */
{
  await page.click('#igenBtn');
  const st = await state();
  assert.equal(st.fase, 'spil', 'man er i gang med det samme');
  assert.equal(st.laengde, 4, 'med en frisk lille slange');
  assert.equal(await page.locator('#slutScreen.on').count(), 0, 'slutskærmen er væk');

  await page.evaluate(() => window.GAME.tilMenu());
  assert.equal(await page.locator('#startScreen.on').isVisible(), true, 'og man kan komme tilbage til menuen');
  assert.ok(Number(await page.locator('#rekordVal').textContent()) > 0, 'hvor rekorden står');
}

/* ---------- Pladen for sig selv (?bots=0) og en død slange bliver perler ---------- */
{
  await page.goto(`${BASE}/spil/slanger/?seed=7&bots=0&frys=1`);
  await page.waitForFunction(() => !!window.GAME);
  assert.equal((await state()).spillere.length, 1, '?bots=0 giver pladen for sig selv');
  await page.click('#startBtn');
  const st = await page.evaluate(() => window.GAME.frem(30, () => 3));
  assert.equal(st.fase, 'slut');
  assert.equal(st.grund, 'mur', 'alene er det kun væggen (og en selv), der kan stoppe en');
  assert.match(await page.locator('#slutTitel').textContent(), /væggen/, 'slutskærmen siger hvorfor');
  assert.ok(st.ekstra > 0, 'liget blev til perler på pladen');
}

/* ---------- Aktivitet meldt til forsiden ---------- */
assert.ok(api.log.aktivitet.some(a => a.spil === 'slanger' && a.ny === true), 'spillet melder én start');

/* ---------- Passer på en iPad på tværs ---------- */
{
  const pad = await browser.newContext({ ...devices['iPad (gen 7) landscape'] });
  const p2 = await pad.newPage();
  const padFejl = [];
  p2.on('pageerror', e => padFejl.push(String(e)));
  await mockApi(p2);
  await p2.goto(`${BASE}/spil/slanger/?seed=7`);
  await p2.waitForFunction(() => !!window.GAME);
  await p2.click('#startBtn');
  const st = await p2.evaluate(() => window.GAME.frem(6, () => window.GAME.botRetning()));
  assert.equal(st.fase, 'spil', 'runden kører også på en iPad');
  assert.ok(await p2.evaluate(() => {
    const r = document.getElementById('c').getBoundingClientRect();
    return r.width > 600 && r.height > 150;
  }), 'pladen fylder skærmen');
  assert.ok(await p2.evaluate(() => {
    const k = document.getElementById('vKnap').getBoundingClientRect();
    return k.height >= 100;
  }), 'knapperne er også store på en iPad');
  assert.ok(await p2.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'ingen vandret scroll på iPad');
  await p2.screenshot({ path: SHOTS + 'slanger-ipad.png' });
  assert.deepEqual(padFejl, [], 'ingen fejl på iPad');
  await pad.close();
}

assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'ingen vandret scroll');
assert.deepEqual(errors, [], 'ingen console-fejl');
await ctx.close();

/* ================= Spil sammen: Sofie og Selma på den samme plade =================
   To browsere med hver sit localStorage, som deler API'et i hukommelsen –
   præcis som de ville dele databasen i drift (mønstret fra test/rum.test.mjs). */

const fejl = [];
async function spiller(navn, delMed) {
  const c = await browser.newContext({ ...devices['iPhone 13'] });
  const p = await c.newPage();
  p.on('pageerror', e => fejl.push(navn + ': ' + e));
  p.on('console', m => { if (m.type() === 'error') fejl.push(navn + ': ' + m.text()); });
  await p.addInitScript(n => { localStorage.setItem('zydy.navn', n); }, navn);
  const a = await mockApi(p, delMed ? { delMed } : {});
  return { navn, page: p, api: a };
}

const sofie = await spiller('Sofie');
const selma = await spiller('Selma', sofie.api);
const api2 = sofie.api;

// De to er venner i forvejen – det er venskabet, der giver lov til at invitere.
await api2.venner.spoerg('sofie', 'selma', 'Sofie', 'Selma');
await api2.venner.sigJa('sofie', 'selma', 'Selma');

/* ---------- Sofie inviterer Selma ind på pladen ---------- */
await sofie.page.goto(`${BASE}/`);
await sofie.page.waitForSelector('#venner .v-ven');
await sofie.page.click('#venner .v-ven');
await sofie.page.waitForSelector('.v-dlg[open]');
const slangerKnap = sofie.page.locator('.v-sammen', { hasText: 'Slanger' });
assert.equal(await slangerKnap.count(), 1, 'Slanger kan spilles sammen');

await slangerKnap.click();
await sofie.page.waitForURL(/\/spil\/slanger\/\?rum=[A-Z0-9]{5}/, { timeout: 10_000 });
const kode = new URL(sofie.page.url()).searchParams.get('rum');
assert.equal(api2.rum.rows.length, 1, 'der er lavet ét rum');
assert.equal(api2.rum.rows[0].spil, 'slanger');

await sofie.page.waitForSelector('#ventScreen.on');
assert.match(await sofie.page.locator('#ventTitel').textContent(), /Venter på Selma/,
  'værten venter, til vennen hopper med');

// ?frys=1, så pladerne står stille, og testen selv kan spole frem – to browsere
// kan ikke spille et rigtigt sekund i takt.
await sofie.page.goto(`${BASE}/spil/slanger/?rum=${kode}&frys=1`);
await sofie.page.waitForSelector('#ventScreen.on');

/* ---------- Selma ser invitationen på forsiden og hopper med ---------- */
await selma.page.goto(`${BASE}/`);
await selma.page.waitForSelector('#venner .v-rum', { timeout: 10_000 });
assert.match(await selma.page.locator('#venner .v-rum .v-spoerg-tekst').textContent(),
  /Sofie vil spille Slanger med dig/);
await selma.page.click('#venner .v-hopmed');
await selma.page.waitForURL(new RegExp('\\?rum=' + kode), { timeout: 10_000 });
await selma.page.goto(`${BASE}/spil/slanger/?rum=${kode}&frys=1`);

for (const s of [sofie, selma]) {
  await s.page.waitForFunction(() => {
    const x = window.GAME && window.GAME.sammen;
    return !!x && x.status === 'igang';
  }, null, { timeout: 15_000 });
}
assert.equal(api2.rum.rows[0].status, 'igang');

/* ---------- Den samme plade på begge telefoner ---------- */
{
  const hos = async s => s.page.evaluate(() => ({
    seed: window.GAME.state.seed,
    mad: window.GAME.state.madPladser,
    fase: window.GAME.state.fase,
    rolle: window.GAME.sammen.rolle,
    modspiller: window.GAME.sammen.modspiller,
  }));
  const [hosSofie, hosSelma] = [await hos(sofie), await hos(selma)];
  assert.equal(hosSofie.fase, 'spil'); assert.equal(hosSelma.fase, 'spil');
  assert.equal(hosSofie.seed, hosSelma.seed, 'frøet regnes ud af rumkoden – det samme hos begge');
  assert.deepEqual(hosSofie.mad, hosSelma.mad, 'perlerne ligger de samme steder');
  assert.equal(hosSofie.rolle, 'vaert'); assert.equal(hosSelma.rolle, 'gaest');
  assert.equal(hosSofie.modspiller, 'Selma'); assert.equal(hosSelma.modspiller, 'Sofie');
  assert.match(await sofie.page.locator('#rang').textContent(), /Selma/, 'vennen står på ranglisten');
}

/* ---------- Sofies slange glider ind på Selmas skærm ---------- */
{
  await sofie.page.evaluate(() => window.GAME.frem(3, () => window.GAME.botRetning()));
  await selma.page.waitForFunction(() => {
    const s = window.GAME.sammen;
    return !!s.ven && s.ven.krop >= 4;
  }, null, { timeout: 15_000 });
  const ven = await selma.page.evaluate(() => window.GAME.sammen.ven);
  assert.equal(ven.navn, 'Sofie');
  assert.ok(ven.krop >= 4, 'Sofies slange kan ses hos Selma');
  await selma.page.screenshot({ path: SHOTS + 'slanger-sammen.png' });
}

/* ---------- Sofie går – Selma får det at vide ---------- */
await sofie.page.click('.back');
await selma.page.waitForFunction(() =>
  document.getElementById('ventScreen').classList.contains('on')
  && /gik/.test(document.getElementById('ventTitel').textContent), null, { timeout: 15_000 });
assert.equal((await api2.rum.rows[0]).status, 'slut', 'rummet er lukket');

assert.deepEqual(fejl, [], 'ingen console-fejl hos Sofie og Selma');
await browser.close();
console.log('OK slanger');
