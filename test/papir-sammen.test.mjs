// Papirøen sammen: to venner på det samme stykke papir, én på hver telefon
// (public/spil/papir/sammen.mjs + /spil/rum.js + src/rum.mjs).
//
// Kør:  PLAYWRIGHT=/Users/lars/Projekter/DungeonCrawler/node_modules/playwright/index.mjs node test/papir-sammen.test.mjs
// (kræver at en lokal server kører: python3 -m http.server 4193 -d public)
//
// Som test/rum.test.mjs og test/dybet-sammen.test.mjs er der to browsere: Sofie
// og Selma har hver sit localStorage, men deler API'et i hukommelsen, præcis
// som de ville dele databasen i drift.
//
// Papirøen kører i rigtig tid, og to browsere kan ikke spille et sekund i takt.
// Derfor køres der med ?frys=1: papiret står stille, til testen selv kalder
// GAME.frem(). Rummet kører imens som det plejer — det er netop det, der skal
// prøves: at vennens papir, streg og drab finder vej over nettet.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { mockApi } from './api-mock.mjs';
const { chromium, devices } = await import(process.env.PLAYWRIGHT ?? 'playwright');
const BASE = process.env.BASE ?? 'http://localhost:4193';
const shots = path.join(path.dirname(fileURLToPath(import.meta.url)), 'shots');

const browser = await chromium.launch();
const fejl = [];

async function spiller(navn, delMed) {
  const ctx = await browser.newContext({ ...devices['iPhone 13'] });
  const page = await ctx.newPage();
  page.on('pageerror', e => fejl.push(navn + ': ' + e));
  page.on('console', m => { if (m.type() === 'error') fejl.push(navn + ': ' + m.text()); });
  await page.addInitScript(n => { localStorage.setItem('zydy.navn', n); }, navn);
  const api = await mockApi(page, delMed ? { delMed } : {});
  return { navn, page, api };
}

const sofie = await spiller('Sofie');
const selma = await spiller('Selma', sofie.api);
const api = sofie.api;

// De to er venner i forvejen – det er venskabet, der giver lov til at invitere.
await api.venner.spoerg('sofie', 'selma', 'Sofie', 'Selma');
await api.venner.sigJa('sofie', 'selma', 'Selma');

const state = p => p.evaluate(() => window.GAME.state);
const igang = p => p.waitForFunction(() => {
  const s = window.GAME && window.GAME.state;
  return !!s && s.fase === 'spil' && s.sammen && s.sammen.status === 'igang';
}, null, { timeout: 20_000 });

/* ---------- Sofie inviterer Selma ud på papiret ---------- */
await sofie.page.goto(`${BASE}/`);
await sofie.page.waitForSelector('#venner .v-ven');
await sofie.page.click('#venner .v-ven');
await sofie.page.waitForSelector('.v-dlg[open]');
const papirKnap = sofie.page.locator('.v-sammen', { hasText: 'Papirøen' });
assert.equal(await papirKnap.count(), 1, 'Papirøen kan nu spilles sammen');

await papirKnap.click();
await sofie.page.waitForURL(/\/spil\/papir\/\?rum=[A-Z0-9]{5}/, { timeout: 10_000 });
const kode = new URL(sofie.page.url()).searchParams.get('rum');
assert.equal(api.rum.rows.length, 1, 'der er lavet ét rum');
assert.equal(api.rum.rows[0].spil, 'papir');

await sofie.page.waitForSelector('#ventScreen.on');
assert.match(await sofie.page.locator('#ventTitel').textContent(), /Venter på Selma/,
  'værten venter, til vennen hopper med');
await sofie.page.screenshot({ path: path.join(shots, 'papir-sammen-vent.png') });

// Resten køres i frys, så testen selv bestemmer, hvornår klatterne kører.
const adresse = `${BASE}/spil/papir/?rum=${kode}&frys=1`;
await sofie.page.goto(adresse);
await sofie.page.waitForSelector('#ventScreen.on');

/* ---------- Selma ser invitationen på forsiden og hopper med ---------- */
await selma.page.goto(`${BASE}/`);
await selma.page.waitForSelector('#venner .v-rum', { timeout: 10_000 });
assert.match(await selma.page.locator('#venner .v-rum .v-spoerg-tekst').textContent(),
  /Sofie vil spille Papirøen med dig/);
await selma.page.click('#venner .v-hopmed');
await selma.page.waitForURL(new RegExp('\\?rum=' + kode), { timeout: 10_000 });
await selma.page.goto(adresse);

await igang(selma.page);
await igang(sofie.page);
assert.equal(api.rum.rows[0].status, 'igang');

/* ---------- Det er det samme papir, set fra hver sin side ---------- */
{
  const a = await state(sofie.page), b = await state(selma.page);
  assert.equal(a.sammen.rolle, 'vaert', 'den der inviterede er vært');
  assert.equal(b.sammen.rolle, 'gaest');
  assert.equal(a.sammen.modspiller, 'Selma', 'hver ser sin vens navn');
  assert.equal(b.sammen.modspiller, 'Sofie');
  assert.equal(a.spillere.length, 2, 'ingen bots med, når to spiller sammen');
  assert.equal(a.sammen.ven.navn, 'Selma');
  assert.deepEqual({ x: a.x, y: a.y }, { x: b.sammen.ven.x, y: b.sammen.ven.y },
    'Sofies klat står det samme sted på begge skærme');
  assert.deepEqual({ x: b.x, y: b.y }, { x: a.sammen.ven.x, y: a.sammen.ven.y });
  assert.equal(a.felter, 25); assert.equal(a.sammen.ven.felter, 25);
  assert.equal(await sofie.page.locator('#rang .r').count(), 2, 'ranglisten har en linje til hver');
  assert.match(await sofie.page.locator('#rang').textContent(), /Dig[\s\S]*Selma/);
  assert.match(await selma.page.locator('#rang').textContent(), /Dig[\s\S]*Sofie/);
  assert.equal(await sofie.page.locator('#tidPill').isVisible(), true, 'uret tæller ned i toppen');
  assert.match(await sofie.page.locator('#tidVal').textContent(), /^2:0\d$/);
  assert.equal(await sofie.page.locator('#rekordPill').isVisible(), false, 'rekorden må vige for uret');
}

/* ---------- Sofies sløjfe farver papiret – også på Selmas skærm ---------- */
{
  // Spillets egen bot kører sløjfen: den finder selv en vej, der hverken går
  // over kanten eller over dens egen streg, uanset hvor på papiret man startede.
  let efter = await state(sofie.page);
  for (let i = 0; i < 25 && efter.sløjfer < 1; i++) {
    efter = await sofie.page.evaluate(() => window.GAME.frem(1, () => window.GAME.botRetning()));
  }
  assert.ok(efter.sløjfer >= 1, 'sløjfen blev lukket');
  assert.ok(efter.felter > 25, `papiret voksede ikke: ${efter.felter}`);

  await selma.page.waitForFunction(n => window.GAME.state.sammen.ven.felter === n,
    efter.felter, { timeout: 15_000 });
  assert.match(await selma.page.locator('#rang').textContent(), /Sofie/, 'og det kan ses på ranglisten');
  await selma.page.screenshot({ path: path.join(shots, 'papir-sammen.png') });
}

/* ---------- Selma klipper Sofies streg over ---------- */
{
  // Sofie kører ud på papiret og lader stregen ligge.
  let ud = await state(sofie.page);
  for (let i = 0; i < 25 && !(ud.ude && ud.stregCeller.length >= 4); i++) {
    ud = await sofie.page.evaluate(() => window.GAME.frem(0.3, () => window.GAME.botRetning()));
  }
  assert.ok(ud.stregCeller.length >= 4, `Sofie fik ingen streg at klippe i: ${ud.stregCeller.length}`);
  const felt = ud.stregCeller[1];

  // Selma skal kunne se stregen, før hun kan køre over den.
  await selma.page.waitForFunction(() => window.GAME.state.sammen.ven.streg > 2, null, { timeout: 15_000 });

  // Hen mod feltet: først på plads i x, så i y. Sådan en vej krydser aldrig sig
  // selv – og skal man den modsatte vej, drejes der først om ad siden, for man
  // kan ikke vende 180° i Papirøen.
  const maal = { x: felt % 40, y: Math.floor(felt / 40) };
  let ramte = false;
  for (let i = 0; i < 40 && !ramte; i++) {
    // Kravet er væk fra Selmas side, så snart Sofie har kvitteret – derfor skal
    // det fanges her og ikke bagefter.
    const s = await selma.page.evaluate(m => window.GAME.frem(0.4, p => {
      const ønsket = p.cx !== m.x ? (p.cx < m.x ? 0 : 2) : (p.cy !== m.y ? (p.cy < m.y ? 1 : 3) : null);
      if (ønsket === null) return null;
      return ønsket === (p.dir + 2) % 4 ? (p.dir + 1) % 4 : ønsket;
    }).sammen, maal);
    ramte = s.krav > 0 || s.drab > 0;
  }
  assert.ok(ramte, 'Selma nåede aldrig hen over stregen');

  // Sofies egen telefon dømmer: lå stregen der, er hun ude – og hun kommer igen.
  await sofie.page.waitForFunction(() => window.GAME.state.doede > 0, null, { timeout: 20_000 });
  const efter = await state(sofie.page);
  assert.equal(efter.levende, false, 'Sofie røg ud');
  assert.equal(efter.fase, 'spil', 'men runden kører videre, når man spiller sammen');
  assert.equal(efter.felter, 0, 'og området er væk');
  assert.match(await sofie.page.locator('#raabUnder').textContent(), /streg|område/,
    'der står hvorfor man røg ud');

  await selma.page.waitForFunction(() => window.GAME.state.sammen.drab > 0, null, { timeout: 20_000 });
  assert.match(await selma.page.locator('#raabUnder').textContent(), /Du tog Sofie/,
    'og Selma får at vide, at det var hende');

  // Man kommer igen på et frit stykke papir (botten holder hende fra kanten,
  // mens vi venter – en frisk klat kører lige ud, til nogen siger noget andet).
  let igen = await state(sofie.page);
  for (let i = 0; i < 25 && !igen.levende; i++) {
    igen = await sofie.page.evaluate(() => window.GAME.frem(0.3, () => window.GAME.botRetning()));
  }
  assert.equal(igen.levende, true, 'Sofie er med igen');
  assert.ok(igen.felter >= 25, 'på et frisk stykke papir');
}

/* ---------- Tiden løber ud, og begge skærme siger det samme ---------- */
{
  // Begge kører rundt i deres eget område, til uret er i bund: dér er der ingen
  // streg at blive taget på, så det er tiden og ikke tilfældet, der afgør det.
  const rundt = p => p.evaluate(() => window.GAME.frem(125, q => ((q.cx + q.cy) % 2 === 0 ? (q.dir + 1) % 4 : null)));
  await rundt(sofie.page);
  await rundt(selma.page);

  for (const p of [sofie.page, selma.page]) {
    await p.waitForFunction(() => window.GAME.state.fase === 'slut', null, { timeout: 10_000 });
    await p.waitForFunction(() => window.GAME.state.sammen.venSlut, null, { timeout: 20_000 });
  }
  const a = await state(sofie.page), b = await state(selma.page);
  assert.equal(a.sammen.venFelter, b.felter, 'Sofie kender Selmas sidste tal');
  assert.equal(b.sammen.venFelter, a.felter);
  const vinder = [a.sammen.resultat, b.sammen.resultat].sort().join(',');
  assert.ok(vinder === 'tabt,vundet' || vinder === 'lige,lige',
    `de to skærme er uenige om, hvem der vandt: ${vinder}`);

  assert.equal(await sofie.page.locator('#slutScreen.on').isVisible(), true, 'slutskærmen kommer frem');
  assert.match(await sofie.page.locator('#slutTitel').textContent(), /vandt|lige/);
  assert.match(await sofie.page.locator('#slutSub').textContent(), /Selma: \d+ %/, 'vennens procent står der');
  assert.match(await sofie.page.locator('#tidVal').textContent(), /^0:00$/, 'uret står i bund');
  await sofie.page.screenshot({ path: path.join(shots, 'papir-sammen-slut.png') });

  // «Spil igen» ruller et nyt papir ud hos os begge.
  await sofie.page.click('#igenBtn');
  await igang(sofie.page);
  assert.equal((await state(sofie.page)).sammen.runde, 2, 'Sofie er i gang med runde to');
  await selma.page.waitForFunction(() => window.GAME.state.sammen.runde === 2 && window.GAME.state.fase === 'spil',
    null, { timeout: 20_000 });
  const ny = await state(selma.page);
  assert.equal(ny.felter, 25, 'på et friskt stykke papir');
  assert.equal(ny.sammen.ven.felter, 25);
  assert.ok(ny.sammen.tilbage > 100, 'og med et helt ur');
}

/* ---------- Og det virker også i rigtig tid ---------- */
{
  // Uden ?frys kører papiret af sig selv, og rummet passer sig selv. Sofie
  // henter siden forfra midt i runde to – hen skal finde den samme runde igen
  // og begynde at rykke sig på Selmas skærm.
  await sofie.page.goto(`${BASE}/spil/papir/?rum=${kode}`);
  await igang(sofie.page);
  await sofie.page.waitForFunction(() => window.GAME.state.sammen.runde === 2, null, { timeout: 20_000 });
  const før = (await state(selma.page)).sammen.ven;
  await selma.page.waitForFunction(p => {
    const v = window.GAME.state.sammen.ven;
    return v.x !== p.x || v.y !== p.y;
  }, før, { timeout: 20_000 });
}

/* ---------- Går den ene, får den anden besked ---------- */
await selma.page.click('.back');
await selma.page.waitForURL(url => !url.search.includes('rum='), { timeout: 15_000 });
await sofie.page.waitForSelector('#ventScreen.on', { timeout: 20_000 });
assert.match(await sofie.page.locator('#ventTitel').textContent(), /Selma gik/);

/* ---------- Ingen vandret scroll, ingen fejl ---------- */
for (const p of [sofie.page, selma.page]) {
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'ingen vandret scroll');
}
assert.deepEqual(fejl, [], 'ingen console-fejl');
await browser.close();
console.log('OK papir sammen');
