// Kør:  PLAYWRIGHT=/Users/lars/Projekter/DungeonCrawler/node_modules/playwright/index.mjs node test/tube.test.mjs
// (kræver at en lokal server kører: python3 -m http.server 4186 -d public)
//
// Spiller «ZydyTube» igennem: opret en kanal → vælg emne → optag med en
// rigtig finger → titel og miniature → upload → visninger, abonnenter og
// kommentarer kommer → udstyr → afspilningsknapper og topliste → kanalen
// huskes efter genindlæsning. API'erne kører i hukommelsen (test/api-mock.mjs).
import assert from 'node:assert/strict';
import { mockApi } from './api-mock.mjs';
const { chromium, devices } = await import(process.env.PLAYWRIGHT ?? 'playwright');
const BASE = process.env.BASE ?? 'http://localhost:4186';
const SHOTS = new URL('./shots/', import.meta.url).pathname;

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 13'] });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.addInitScript(() => { if (!localStorage.getItem('zydy.navn')) localStorage.setItem('zydy.navn', 'Selma'); });

// Tom topliste, så enhver kanal kommer med, og navnet kendes i forvejen
const sendte = [];
const api = await mockApi(page);
await page.route('**/api/highscore/**', async route => {
  const req = route.request();
  if (req.method() === 'POST') {
    const krop = req.postDataJSON(); sendte.push(krop);
    return route.fulfill({ json: { ok: true, id: 1, token: 'abc', placering: 1, liste: [{ id: 1, navn: krop.navn, score: krop.score, oprettet: '2026-09-26T12:00:00.000Z' }] } });
  }
  return route.fulfill({ json: { spil: 'tube', retning: 'desc', min: 1, maks: 1000000000, unik: true, liste: [] } });
});

await page.goto(`${BASE}/spil/tube/?seed=7`);
await page.waitForFunction(() => !!window.GAME);
const kanal = () => page.evaluate(() => window.GAME.kanal);
const synlig = sel => page.locator(sel).isVisible();

/** Optager en hel video med en rigtig finger: tryk på alle de gode øjeblikke (og evt. ét uheld). */
async function optagMedFinger({ uheld = 0 } = {}) {
  await page.evaluate(() => window.GAME.optagTik(1.7));            // nedtællingen
  let ramt = 0;
  for (let i = 0; i < 110; i++) {
    const punkter = await page.evaluate(() => window.GAME.fremmePunkter());
    for (const p of punkter) {
      if (p.god || ramt < uheld) {
        if (!p.god) ramt++;
        await page.mouse.click(p.x, p.y);
      }
    }
    const slut = await page.evaluate(() => { window.GAME.optagTik(0.1); window.GAME.tegnOptag(); return window.GAME.state.optag.slut; });
    if (slut) break;
  }
}
/** En hel video uden om skærmen – til at bygge kanalen op hurtigt. */
const hurtigVideo = (q = 1) => page.evaluate(q => {
  const G = window.GAME;
  G.startOptag(G.kanal.trend);
  G.optagTik(0.05);
  const c = document.querySelector('#laerred').getBoundingClientRect();
  let n = 0;
  while (!G.state.optag.slut) {
    for (const p of G.fremmePunkter()) if (p.god && n < q * 14) { G.trykOptag(p.x - c.left, p.y - c.top); n++; }
    G.optagTik(0.05);
  }
  G.tilKlip();
  G.uploadNu();
  G.spol(90);
}, q);

/* ---------- Startskærmen: opret en kanal ---------- */
{
  assert.equal(await synlig('#start.on'), true, 'startskærmen vises');
  assert.equal(await page.locator('#avatarer button').count(), 8, 'otte kanalbilleder at vælge imellem');
  assert.match(await page.getAttribute('#kanalNavn', 'placeholder'), /Selmas kanal/, 'navnet fra forsiden bliver foreslået');
  const knap = await page.locator('#opretBtn').boundingBox();
  assert.ok(knap.y + knap.height <= page.viewportSize().height, '«Opret kanal» kan nås uden at rulle');
  await page.waitForFunction(() => document.querySelector('#hsStart .hs-titel'), null, { timeout: 4000 });
  assert.match(await page.locator('#hsStart').textContent(), /Største kanaler/, 'toplisten står på startskærmen');
  await page.screenshot({ path: SHOTS + 'tube-start.png' });

  await page.click('#avatarer button:nth-child(5)');
  await page.click('#farver button:nth-child(2)');
  await page.fill('#kanalNavn', 'Selmas kanal');
  await page.click('#opretBtn');
  await page.evaluate(() => window.GAME.pause());                 // vi styrer selv tiden herfra
  assert.equal(await synlig('#kanal.on'), true, 'kanalen kommer frem');
  assert.equal(await page.locator('#kNavn').textContent(), 'Selmas kanal');
  assert.equal(await page.locator('#kAva').textContent(), '🦄');
  assert.equal(await page.locator('#kAbo').textContent(), '0');
  assert.match(await page.locator('#videoer').textContent(), /tom endnu/, 'en tom kanal siger, hvad man skal');
  assert.match(await page.locator('#trend').textContent(), /Seerne vil gerne se/, 'man kan se, hvad der er populært');
}

/* ---------- Vælg emne ---------- */
const trend = (await kanal()).trend;
{
  await page.click('#nyVideoBtn');
  assert.equal(await synlig('#emne.on'), true);
  assert.equal(await page.locator('.emne').count(), 8, 'otte emner');
  assert.equal(await page.locator('.emne.trendy').count(), 1, 'ét emne er populært lige nu');
  assert.equal(await page.locator('.emne.trendy').getAttribute('data-emne'), trend);
  await page.click(`.emne[data-emne="${trend}"]`);
}

/* ---------- Optag med en finger ---------- */
{
  assert.equal(await synlig('#optag.on'), true, 'optagelsen begynder');
  assert.equal(await page.locator('#nedtael').textContent(), '', 'nedtællingen er ikke begyndt, før tiden går');
  await page.evaluate(() => window.GAME.optagTik(0.3));
  assert.equal(await page.locator('#nedtael').textContent(), '3', 'nedtælling: 3');
  await page.evaluate(() => window.GAME.optagTik(-0.3));
  // Et tryk ved siden af rammer ingenting
  const r = await page.locator('#laerred').boundingBox();
  await page.evaluate(() => window.GAME.optagTik(3));
  const foer = (await page.evaluate(() => window.GAME.state.optag.fanget));
  await page.mouse.click(r.x + 3, r.y + 3);
  assert.equal(await page.evaluate(() => window.GAME.state.optag.fanget), foer, 'et tryk i hjørnet fanger ikke noget');
  await page.evaluate(() => window.GAME.startOptag(window.GAME.state.optag.emne));   // forfra
  await page.evaluate(() => window.GAME.optagTik(3.5));
  await page.evaluate(() => window.GAME.tegnOptag());
  await page.screenshot({ path: SHOTS + 'tube-optag.png' });
  await page.evaluate(() => window.GAME.startOptag(window.GAME.state.optag.emne));

  await optagMedFinger();
  const o = await page.evaluate(() => ({ fanget: window.GAME.state.optag.fanget, uheld: window.GAME.state.optag.uheld, q: window.GAME.state.optag.kvalitet }));
  assert.equal(o.fanget, 14, `alle fjorten sjove øjeblikke blev fanget med fingeren (${o.fanget})`);
  assert.equal(o.uheld, 0);
  assert.equal(o.q, 1);
  assert.equal(await synlig('#resultat'), true, 'resultatet kommer frem');
  assert.equal(await page.locator('#resStj').textContent(), '⭐⭐⭐');
  assert.match(await page.locator('#resTekst').textContent(), /14 af 14/);
}

/* ---------- Klip: titel og miniature ---------- */
{
  await page.click('#tilKlipBtn');
  assert.equal(await synlig('#klip.on'), true);
  assert.equal(await page.locator('#forslag button').count(), 3, 'tre forslag til en titel');
  assert.equal(await page.locator('#stickers button').count(), 8, 'otte billeder at vælge imellem');
  assert.match(await page.locator('#forventet').textContent(), /🔥/, 'upload-skærmen siger, at emnet er populært');
  const passer = await page.evaluate(() => {
    const k = window.GAME.state.klip;
    return k.stickers.map(s => ({ s, ok: window.GAME.emneTing(k.emne).includes(s) }));
  });
  const forkert = passer.findIndex(p => !p.ok), rigtig = passer.findIndex(p => p.ok);
  assert.ok(forkert >= 0 && rigtig >= 0, 'både billeder der passer og nogle der ikke gør');
  await page.click(`#stickers button:nth-child(${forkert + 1})`);
  assert.match(await page.locator('#forventet').textContent(), /Tip/, 'et billede, der ikke passer, giver et tip');
  await page.click(`#stickers button:nth-child(${rigtig + 1})`);
  assert.match(await page.locator('#forventet').textContent(), /Billedet passer/);
  await page.click('#forslag button:nth-child(3)');
  assert.match(await page.locator('#forventet').textContent(), /lover mere/, 'en overdreven titel får en advarsel');
  await page.click('#thumbFarver button:nth-child(4)');
  await page.fill('#egenTitel', 'Min første video');
  assert.equal(await page.locator('#egenTitel.on').count(), 1, 'den selvskrevne titel er valgt');
  assert.match(await page.locator('#forventet').textContent(), /ærlig titel/);
  const btn = await page.locator('#uploadBtn').boundingBox();
  assert.ok(btn.y + btn.height <= page.viewportSize().height, 'upload-knappen kan nås uden at rulle');
  await page.screenshot({ path: SHOTS + 'tube-klip.png' });
  await page.click('#uploadBtn');
}

/* ---------- Seerne kommer ---------- */
{
  assert.equal(await synlig('#kanal.on'), true, 'tilbage på kanalen');
  assert.equal(await page.locator('#videoer .video').count(), 1);
  assert.equal(await page.locator('#videoer .video .titel').textContent(), 'Min første video');
  assert.match(await page.locator('#videoer .video .meta').textContent(), /^0 visninger/, 'ingen har set den endnu');
  const v = (await kanal()).videoer[0];
  assert.equal(v.farve, '#ffd447', 'miniaturen har den valgte baggrund');
  assert.equal(v.lokker, 0);
  await page.evaluate(() => window.GAME.spol(60));
  const vis = await page.evaluate(() => window.GAME.visninger());
  const abo = await page.evaluate(() => window.GAME.abonnenter());
  assert.ok(vis > 200, `efter et minut er der kommet visninger (${vis})`);
  assert.ok(abo >= 10, `og abonnenter (${abo})`);
  assert.equal(await page.locator('#kAbo').textContent(), String(abo), 'tallet står øverst på kanalen');
  assert.match(await page.locator('#videoer .video .meta').textContent(), /[1-9]\d* visninger/);
  await page.screenshot({ path: SHOTS + 'tube-kanal.png' });
}

/* ---------- Videoen: kommentarer og hjerter ---------- */
{
  await page.click('#videoer .video');
  assert.equal(await synlig('#videoArk.on'), true);
  assert.match(await page.locator('#vaKom').textContent(), /farmor/i, 'farmor har set den første video');
  assert.ok(await page.locator('#vaKom .kom').count() >= 4, 'der er kommet kommentarer');
  const hjerte = page.locator('#vaKom .kom').last().locator('.hjerte');
  await hjerte.click();
  assert.equal(await page.locator('#vaKom .kom').last().locator('.hjerte').textContent(), '❤️', 'man kan give en kommentar et hjerte');
  await page.screenshot({ path: SHOTS + 'tube-video.png' });
  await page.click('#vaLuk');
  assert.equal(await synlig('#videoArk.on'), false);
}

/* ---------- Flere videoer → 100 abonnenter og udstyr ---------- */
{
  for (let i = 0; i < 12 && (await page.evaluate(() => window.GAME.abonnenter())) < 100; i++) await hurtigVideo();
  await page.evaluate(() => window.GAME.opdater());
  assert.equal(await synlig('#maerkeArk.on'), true, '100 abonnenter bliver fejret');
  assert.match(await page.locator('#mTitel').textContent(), /100 abonnenter/);
  await page.waitForFunction(() => document.querySelector('#mHs .hs-titel'), null, { timeout: 4000 });
  assert.ok(sendte.some(s => s.navn === 'Selma' && s.score >= 100), 'kanalen er sendt til toplisten under Selmas navn');
  await page.click('#mVidere');
  assert.equal(await synlig('#maerkeArk.on'), false);

  const k = await kanal();
  const penge = await page.evaluate(() => window.GAME.penge());
  assert.ok(penge >= 60, `der er tjent penge nok til en ny mobil (${penge} kr.)`);
  await page.click('#udstyrBtn');
  assert.equal(await page.locator('#udstyrListe .udstyr').count(), 4, 'fire slags udstyr');
  const kamera = page.locator('#udstyrListe .udstyr[data-id="kamera"] button');
  assert.match(await kamera.textContent(), /Ny mobil · 60 kr/);
  await kamera.click();
  assert.equal((await kanal()).udstyr.kamera, 1, 'kameraet er købt');
  assert.equal(await page.evaluate(() => window.GAME.penge()), penge - 60, 'og betalt');
  assert.match(await page.locator('#udstyrListe .udstyr[data-id="kamera"] b').textContent(), /Ny mobil \(720p\)/);
  assert.equal(await page.locator('#kKval').textContent(), '×1,12', 'videokvaliteten stiger');
  assert.match(await page.locator('#udstyrListe .udstyr[data-id="lys"] button').textContent(), /Bordlampe|Mangler/);
  await page.screenshot({ path: SHOTS + 'tube-udstyr.png' });
  await page.click('#uLuk');
  assert.ok(k.videoer.length >= 3);
}

/* ---------- Sølvknappen ---------- */
{
  await page.evaluate(() => { window.GAME.kanal.arkiv.abo = 100500; window.GAME.opdater(); });
  const titler = [];
  for (let i = 0; i < 5 && await synlig('#maerkeArk.on'); i++) {
    titler.push(await page.locator('#mTitel').textContent());
    if (/Sølvknappen/.test(titler.at(-1))) break;
    await page.click('#mVidere');
  }
  assert.deepEqual(titler, ['1.000 abonnenter!', 'Du har fået Bronzeknappen!', 'Du har fået Sølvknappen!'], 'knapperne kommer i rækkefølge');
  assert.equal(await page.locator('#mBillede .knap.soelv').count(), 1, 'sølvknappen er tegnet');
  await page.screenshot({ path: SHOTS + 'tube-soelvknap.png' });
  await page.click('#mVidere');
  assert.equal(await page.locator('#hylde .knap').count(), 2, 'bronze og sølv hænger på kanalen');
  assert.match(await page.locator('#maalNavn').textContent(), /Guldknappen/, 'næste mål er Guldknappen');
}

/* ---------- Toplisten ---------- */
{
  await page.click('#toplisteBtn');
  assert.equal(await synlig('#toplisteArk.on'), true);
  await page.waitForFunction(() => document.querySelector('#hsPanel .hs-titel'), null, { timeout: 4000 });
  assert.ok(sendte.some(s => s.score > 100000), 'den store kanal er sendt ind');
  await page.click('#hsLuk');
}

/* ---------- Kanalen huskes – og seerne kom, mens man var væk ---------- */
{
  const foer = await kanal();
  // En ny video lige før man lægger telefonen …
  await page.evaluate(() => {
    const G = window.GAME;
    G.startOptag('dans'); G.optagTik(12); G.tilKlip(); G.uploadNu();
  });
  // … og så tager man den frem igen ti minutter senere. Siden gemmer selv,
  // når den lukkes, så uret skrues tilbage først, når den er ved at åbne igen.
  await page.addInitScript(() => {
    if (sessionStorage.getItem('spolet')) return;
    sessionStorage.setItem('spolet', '1');
    const d = JSON.parse(localStorage.getItem('zydy.tube.v1') || 'null');
    if (!d) return;
    d.sidst -= 600000;
    for (const v of d.kanal.videoer) v.oprettet -= 600000;
    localStorage.setItem('zydy.tube.v1', JSON.stringify(d));
  });
  await page.reload();
  await page.waitForFunction(() => !!window.GAME);
  assert.equal(await synlig('#gemt'), true, 'startskærmen kender kanalen');
  assert.equal(await page.locator('#gemtNavn').textContent(), 'Selmas kanal');
  assert.equal(await synlig('#velkomst'), true, 'og fortæller, hvad der er sket');
  assert.match(await page.locator('#velkomst').textContent(), /Mens du var væk: \+[\d.]+ visninger/);
  await page.click('#fortsaetBtn');
  const efter = await kanal();
  assert.equal(efter.antal, foer.antal + 1, 'alle videoerne er der');
  assert.equal(efter.udstyr.kamera, 1, 'og kameraet');
  assert.deepEqual(efter.maerker, foer.maerker, 'og knapperne');
  assert.equal(await synlig('#maerkeArk.on'), false, 'knapperne fejres ikke igen');
}

/* ---------- Aktivitet meldt til forsiden ---------- */
assert.ok(api.log.aktivitet.some(a => a.spil === 'tube' && a.ny === true), 'spillet melder én start');

/* ---------- Passer på en iPad på tværs ---------- */
{
  const pad = await browser.newContext({ ...devices['iPad (gen 7) landscape'] });
  const p2 = await pad.newPage();
  await mockApi(p2);
  await p2.goto(`${BASE}/spil/tube/?seed=3`);
  await p2.waitForFunction(() => !!window.GAME);
  await p2.click('#opretBtn');
  assert.match(await p2.locator('#kNavn').textContent(), /kanal/i, 'uden navn får kanalen et alligevel');
  const knap = await p2.locator('#nyVideoBtn').boundingBox();
  assert.ok(knap.height >= 44, 'knapperne er store nok til en finger');
  await p2.click('#nyVideoBtn');
  await p2.click('.emne');
  await p2.evaluate(() => { window.GAME.pause(); window.GAME.optagTik(4); window.GAME.tegnOptag(); });
  assert.ok(await p2.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'ingen vandret scroll på iPad');
  await p2.screenshot({ path: SHOTS + 'tube-ipad.png' });
  await pad.close();
}

/* ---------- Ingen vandret scroll, ingen fejl ---------- */
assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'ingen vandret scroll');
assert.deepEqual(errors, [], 'ingen console-fejl');
await browser.close();
console.log('OK tube');
