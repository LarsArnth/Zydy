// Kør:  PLAYWRIGHT=/sti/til/playwright/index.mjs node test/baseforsvar.test.mjs
// (kræver at en lokal server kører, se test/run.mjs)
//
// Spiller «Baseforsvar» igennem: startskærm → en mur bygget med en rigtig
// finger → man kan ikke bygge oven på rådhuset → kassen med Træn/Opgradér/Sælg
// → en bonde trænet og guld ved daggry → et tårn skyder en zombie → natten
// falder på → rådhuset æder sit sidste liv, slutskærm og topliste.
// Spillet hentes med ?froe=1, så terningen slår det samme hver gang.
// API'erne kører i hukommelsen (test/api-mock.mjs).
import assert from 'node:assert/strict';
import { mockApi } from './api-mock.mjs';
const { chromium, devices } = await import(process.env.PLAYWRIGHT ?? 'playwright');
const BASE = process.env.BASE ?? 'http://localhost:4180';
const SHOTS = new URL('./shots/', import.meta.url).pathname;

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 13'] });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

// Navnet står i forvejen – som når man har skrevet det på forsiden
await page.addInitScript(() => localStorage.setItem('zydy.navn', 'Selma'));

// Tom topliste, så enhver runde kvalificerer
const sendte = [];
await mockApi(page);
await page.route('**/api/highscore/**', async route => {
  const req = route.request();
  if (req.method() === 'POST') {
    const krop = req.postDataJSON(); sendte.push(krop);
    return route.fulfill({ json: { ok: true, id: 1, token: 'abc', placering: 1, liste: [{ id: 1, navn: krop.navn, score: krop.score, oprettet: '2026-09-15T12:00:00.000Z' }] } });
  }
  return route.fulfill({ json: { spil: 'baseforsvar', retning: 'desc', min: 1, maks: 200, unik: true, liste: [] } });
});

await page.goto(`${BASE}/spil/baseforsvar/?froe=1`);
await page.waitForFunction(() => !!window.GAME);
const state = () => page.evaluate(() => window.GAME.state);
const klik = async p => { await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.up(); };
const knapPx = slags => page.evaluate(s => window.GAME.knapPx(s), slags);
const feltPx = (kx, ky) => page.evaluate(([x, y]) => window.GAME.feltPx(x, y), [kx, ky]);
const hus = () => page.evaluate(() => window.GAME.RAADHUS_FELT);
const HUS = await hus();

/* ---------- Startskærmen ---------- */
assert.equal(await page.locator('#startScreen.on').isVisible(), true, 'startskærmen vises');
assert.equal(await page.locator('#bund').isVisible(), false, 'ingen byggeknapper, før man spiller');
assert.match(await page.locator('.lavet').textContent(), /SorteSlyngel/, 'der står, hvem der ønskede sig spillet');
assert.equal((await state()).fase, 'menu');
await page.waitForFunction(() => document.querySelector('#hsStart .hs-titel'), null, { timeout: 4000 });
assert.match(await page.locator('#hsStart').textContent(), /Længst i Baseforsvar/, 'toplisten hentes på startskærmen');
{
  // Alle seks bygninger skal være forklaret – ellers er der knapper, man ikke
  // ved hvad gør, og et rådhus man ikke ved man skal passe på
  const liste = await page.locator('#bygliste').textContent();
  for (const navn of ['Mur', 'Skydetårn', 'Kanontårn', 'Farm', 'Kaserne', 'Rådhus']) {
    assert.ok(liste.includes(navn), `${navn} er forklaret på startskærmen`);
  }
}
{
  // Spil-knappen skal kunne nås uden at rulle – ellers finder et barn den ikke
  const knap = await page.locator('#startBtn').boundingBox();
  const h = await page.evaluate(() => innerHeight);
  assert.ok(knap.y + knap.height <= h, `«Spil» kan nås uden at rulle (${Math.round(knap.y + knap.height)} af ${h})`);
}
await page.screenshot({ path: SHOTS + 'baseforsvar-start.png' });

/* ---------- I gang ---------- */
await page.click('#startBtn');
await page.evaluate(() => window.GAME.saetOp({ roligt: true }));   // ro på, mens vi prøver knapperne
{
  const s = await state();
  assert.equal(s.fase, 'spil');
  assert.equal(s.guld, 260, 'man begynder med guld til et par bygninger');
  assert.equal(s.dag, 1, 'og på dag 1');
  assert.equal(s.nat, false, 'det er lyst');
  assert.equal(s.bygninger.length, 1, 'kun rådhuset står der');
  assert.equal(s.bygninger[0].slags, 'raadhus');
  assert.equal(s.husHp, s.husMaksHp, 'med fuldt liv');
}
assert.equal(await page.locator('#bund').isVisible(), true, 'byggeknapperne kommer frem');
{
  // Fem knapper i én række – og de skal alle kunne nås på en iPhone
  assert.equal(await page.locator('.byggeknap').count(), 5, 'der er en knap til hver af de fem bygninger');
  const h = await page.evaluate(() => innerHeight);
  const sidste = await page.locator('.byggeknap').last().boundingBox();
  assert.ok(sidste.y + sidste.height <= h, `den sidste knap er inde på skærmen (${Math.round(sidste.y + sidste.height)} af ${h})`);
  const g = await page.evaluate(() => window.GAME.geo());
  assert.ok(g.skala >= 2.5, `og banen er stadig stor nok (skala=${g.skala.toFixed(1)})`);
}
assert.equal(await page.locator('#guldVal').textContent(), '260');
assert.equal(await page.locator('#dagVal').textContent(), '1');
assert.match(await page.locator('#doegnTekst').textContent(), /Byg dit forsvar/, 'og der står hvad man skal');

/* ---------- En mur bygget med en rigtig finger ---------- */
{
  await klik(await knapPx('mur'));
  assert.equal((await state()).valgtSlags, 'mur', 'muren er valgt');
  assert.ok(await page.locator('.byggeknap.valgt').isVisible(), 'knappen lyser op');

  await klik(await feltPx(HUS.kx, HUS.ky - 1));      // lige nord for rådhuset
  const s = await state();
  assert.equal(s.bygninger.length, 2, 'muren står på banen');
  const mur = s.bygninger.find(b => b.slags === 'mur');
  assert.deepEqual({ kx: mur.kx, ky: mur.ky }, { kx: HUS.kx, ky: HUS.ky - 1 });
  assert.equal(s.guld, 240, 'og den kostede 20 guld');
  assert.equal(await page.locator('#guldVal').textContent(), '240', 'guldet i HUD\'en følger med');
}

/* ---------- Oven på rådhuset kan man ikke bygge ---------- */
{
  assert.equal((await state()).valgtSlags, 'mur', 'muren er stadig i hånden efter et byg');
  await klik(await feltPx(HUS.kx, HUS.ky));
  assert.match(await page.locator('#besked').textContent(), /Der står allerede noget/, 'spillet siger hvorfor');
  assert.equal(await page.locator('#besked.vis').isVisible(), true, 'og beskeden kan ses');
  assert.equal((await state()).bygninger.length, 2, 'der kom ikke noget nyt');
  await page.evaluate(() => window.GAME.vaelg(null));
}

/* ---------- Kassen med Opgradér og Sælg ---------- */
{
  assert.equal(await page.locator('#panel').isVisible(), false, 'kassen er væk, når intet er valgt');
  await klik(await feltPx(HUS.kx, HUS.ky - 1));
  assert.equal(await page.locator('#panel').isVisible(), true, 'kassen kommer frem');
  assert.match(await page.locator('#panelNavn').textContent(), /Mur · niveau 1\/4/, 'der er fire niveauer at gå efter');
  assert.equal(await page.locator('#traenBtn').isVisible(), false, 'en mur kan man ikke træne nogen i');

  await page.evaluate(() => window.GAME.saetOp({ guld: 5 }));
  assert.equal(await page.locator('#opgraderBtn').isDisabled(), true, 'uden guld kan man ikke opgradere');
  await page.evaluate(() => window.GAME.saetOp({ guld: 600 }));
  assert.equal(await page.locator('#opgraderBtn').isDisabled(), false, 'med guld nok kan man opgradere');
  const foerHp = (await state()).bygninger.find(b => b.slags === 'mur').maksHp;
  await page.click('#opgraderBtn');
  const mur = (await state()).bygninger.find(b => b.slags === 'mur');
  assert.equal(mur.niveau, 2, 'muren blev opgraderet');
  assert.ok(mur.maksHp > foerHp, 'og den kan holde til mere');
  assert.match(await page.locator('#panelNavn').textContent(), /niveau 2\/4/);

  // Hele vejen op: to opgraderinger mere, og så er den færdigbygget
  for (let n = 2; n < 4; n++) {
    assert.equal(await page.locator('#opgraderBtn').isDisabled(), false, `niveau ${n} kan opgraderes videre`);
    await page.click('#opgraderBtn');
  }
  assert.equal((await state()).bygninger.find(b => b.slags === 'mur').niveau, 4, 'muren er på øverste niveau');
  assert.match(await page.locator('#opgraderBtn').textContent(), /Færdig/, 'og så er der ikke mere at opgradere');
  assert.equal(await page.locator('#opgraderBtn').isDisabled(), true);

  const foer = (await state()).guld;
  await page.click('#saelgBtn');
  const s = await state();
  assert.equal(s.bygninger.length, 1, 'muren blev solgt');
  assert.ok(s.guld > foer, 'og man fik guld retur');
  assert.equal(await page.locator('#panel').isVisible(), false, 'kassen forsvinder igen');
}

/* ---------- Rådhuset kan opgraderes, men ikke sælges ---------- */
{
  await klik(await feltPx(HUS.kx, HUS.ky));
  assert.match(await page.locator('#panelNavn').textContent(), /Rådhus · niveau 1\/4/, 'rådhuset har også en kasse');
  assert.equal(await page.locator('#saelgBtn').isVisible(), false, 'men det kan man ikke sælge');
  await page.evaluate(() => window.GAME.saetOp({ guld: 900 }));
  await page.click('#opgraderBtn');
  const s = await state();
  assert.equal(s.bygninger[0].niveau, 2, 'rådhuset blev opgraderet');
  assert.equal(s.husHp, s.husMaksHp, 'og sat helt i stand');
  await page.evaluate(() => window.GAME.tryk(window.GAME.RAADHUS_FELT.kx, window.GAME.RAADHUS_FELT.ky));
}

/* ---------- Farmen: en bonde trænes, og der kommer guld ved daggry ---------- */
{
  await page.evaluate(() => window.GAME.saetOp({ guld: 900 }));
  await page.evaluate(() => window.GAME.vaelg('farm'));
  await klik(await feltPx(2, 2));
  await page.evaluate(() => window.GAME.vaelg(null));
  assert.ok((await state()).bygninger.some(b => b.slags === 'farm'), 'farmen står på banen');

  await klik(await feltPx(2, 2));
  assert.match(await page.locator('#panelNavn').textContent(), /Farm · niveau 1\/4/);
  assert.equal(await page.locator('#traenBtn').isVisible(), true, 'på en farm kan man træne bønder');
  assert.match(await page.locator('#traenBtn').textContent(), /Træn bonde/);
  assert.match(await page.locator('#panelTal').textContent(), /0\/2 bønder/, 'kassen siger, hvor mange der er plads til');

  await page.click('#traenBtn');
  assert.match(await page.locator('#panelTal').textContent(), /Træner bonde/, 'bonden er i skole');
  assert.equal(await page.locator('#traenBtn').isDisabled(), true, 'og man kan kun træne én ad gangen');
  assert.equal((await state()).boender, 0, 'han er der ikke endnu');

  await page.evaluate(() => window.GAME.frem(6));
  const medBonde = await state();
  assert.equal(medBonde.boender, 1, 'bonden er færdiguddannet');
  assert.ok(medBonde.indtaegt > 0, 'og farmen giver nu penge');
  assert.match(await page.locator('#panelTal').textContent(), /1\/2 bønder/);

  // Frem til daggry: farmen betaler, og det står i bunden
  const foer = (await state()).guld;
  await page.evaluate(() => window.GAME.spolDag());
  const morgen = await state();
  assert.equal(morgen.dag, 2, 'der er gået en dag');
  assert.equal(morgen.klarede, 1, 'og den tæller som overlevet');
  assert.ok(morgen.guld >= foer + morgen.indtaegt, 'farmen betalte ved daggry');
  assert.match(await page.locator('#doegnTekst').textContent(), /Farmene gav/, 'og det står i bunden');
  assert.match(await page.locator('#varselNr').textContent(), /DAG 2/, 'varslet siger, at en ny dag er begyndt');
}

/* ---------- Kasernen træner soldater ---------- */
{
  await page.evaluate(() => window.GAME.saetOp({ guld: 900 }));
  await page.evaluate(() => { window.GAME.vaelg('kaserne'); window.GAME.tryk(8, 12); window.GAME.vaelg(null); });
  await page.evaluate(() => window.GAME.tryk(8, 12));
  assert.match(await page.locator('#traenBtn').textContent(), /Træn soldat/, 'på kasernen træner man soldater');
  await page.click('#traenBtn');
  await page.evaluate(() => window.GAME.frem(8));
  assert.equal((await state()).soldater, 1, 'soldaten er på benene');
  assert.match(await page.locator('#panelTal').textContent(), /1\/2 soldater/);
  await page.evaluate(() => window.GAME.tryk(8, 12));
}

/* ---------- Der bliver tegnet dér, hvor man kigger ---------- */
/*
  Et canvas-spil kan bestå alle de andre prøver og alligevel være usynligt:
  passer lærredets egne pixels ikke med den plads, det fylder på skærmen, bliver
  hele banen strukket og skubbet uden for billedet. Derfor måles det efter.
*/
async function tjekBillede(p, hvem) {
  const g = await p.evaluate(() => window.GAME.geo());
  assert.ok(Math.abs(g.W - g.bredde) <= 2 && Math.abs(g.H - g.hoejde) <= 2,
    `${hvem}: der tegnes i ${g.W}×${g.H}, men lærredet fylder ${Math.round(g.bredde)}×${Math.round(g.hoejde)}`);
  assert.ok(Math.abs(g.lw - g.bredde * g.dpr) <= 2 && Math.abs(g.lh - g.hoejde * g.dpr) <= 2,
    `${hvem}: lærredets pixels passer med pladsen`);
  assert.ok(g.skala >= 2.5, `${hvem}: banen er tegnet stort nok til at ses (skala=${g.skala.toFixed(1)})`);
  assert.ok(g.ox >= -1 && g.oy >= -1, `${hvem}: hele banen er inde i billedet`);
  return g;
}
await tjekBillede(page, 'iPhone');

/* ---------- Et tårn skyder zombierne ned ---------- */
{
  await page.evaluate(() => window.GAME.saetOp({ guld: 900 }));
  await page.evaluate(() => {
    const h = window.GAME.RAADHUS_FELT;
    window.GAME.vaelg('taarn');
    window.GAME.tryk(h.kx - 1, h.ky - 1);
    window.GAME.vaelg(null);
  });
  assert.ok((await state()).bygninger.some(b => b.slags === 'taarn'), 'tårnet står på banen');

  const foer = await state();
  await page.evaluate(() => {
    const h = window.GAME.RAADHUS_FELT;
    for (let i = 0; i < 3; i++) window.GAME.sendZombie('zombie', h.kx, h.ky - 3);
  });
  assert.equal((await state()).zombier, 3, 'tre zombier er på vej ind');
  await page.screenshot({ path: SHOTS + 'baseforsvar.png' });

  await page.evaluate(() => window.GAME.frem(14));
  const efter = await state();
  assert.ok(efter.drab > foer.drab, 'tårnet skød dem ned');
  assert.ok(efter.guld > 0, 'og de gav guld');
  assert.match(await page.locator('#drabVal').textContent(), /[1-9]/, 'tælleren i toppen følger med');
}

/* ---------- Natten falder på ---------- */
{
  await page.evaluate(() => { const s = window.GAME.state; window.GAME.saetOp({ tid: (s.dag - 1) * 36 + 30 }); });
  await page.evaluate(() => window.GAME.frem(0.2));
  assert.equal((await state()).nat, true, 'nu er det nat');
  assert.match(await page.locator('#dagPill').textContent(), /🌙/, 'og det står i HUD\'en');
  assert.match(await page.locator('#doegnTekst').textContent(), /Nat/, 'med en advarsel om, at der kommer flere');
  await page.screenshot({ path: SHOTS + 'baseforsvar-nat.png' });
}

/* ---------- Falder rådhuset, er det slut ---------- */
{
  await page.evaluate(() => {
    for (const b of window.GAME.state.bygninger) {
      if (b.slags === 'raadhus') continue;
      window.GAME.tryk(b.kx, b.ky); window.GAME.saelgValgte();
    }
    window.GAME.saetOp({ husHp: 40 });
    const h = window.GAME.RAADHUS_FELT;
    for (let i = 0; i < 3; i++) window.GAME.sendZombie('brute', h.kx, h.ky - 1);
  });
  assert.equal((await state()).bygninger.length, 1, 'alt andet end rådhuset er solgt');
  await page.evaluate(() => window.GAME.frem(25));

  const s = await state();
  assert.equal(s.fase, 'slut', 'da rådhuset faldt, sluttede spillet');
  assert.equal(s.klarede, 1, 'man nåede én dag');
  await page.waitForSelector('#slutScreen.on');
  assert.equal(await page.locator('#slutTal').textContent(), '1 dag');
  assert.match(await page.locator('#slutSub').textContent(), /Du nåede dag 2/);
  assert.equal(await page.locator('#nyRekord').isVisible(), true, 'første runde er altid en rekord');
  assert.equal(await page.locator('#bund').isVisible(), false, 'byggeknapperne er væk på slutskærmen');

  await page.waitForTimeout(400);
  assert.equal(sendte.length, 1, 'dagene sendes til toplisten');
  assert.deepEqual({ navn: sendte[0].navn, score: sendte[0].score }, { navn: 'Selma', score: 1 });
  assert.equal(await page.evaluate(() => +localStorage.getItem('zydy.baseforsvar.bedste')), 1,
    'rekorden huskes på telefonen');
  await page.waitForFunction(() => /Selma/.test(document.getElementById('hsSlut').textContent), null, { timeout: 4000 });
  await page.screenshot({ path: SHOTS + 'baseforsvar-slut.png' });
}

/* ---------- Spil igen begynder forfra ---------- */
{
  await page.click('#igenBtn');
  const s = await state();
  assert.equal(s.fase, 'spil');
  assert.deepEqual({ guld: s.guld, dag: s.dag, bygninger: s.bygninger.length, boender: s.boender },
    { guld: 260, dag: 1, bygninger: 1, boender: 0 }, 'alting er som i begyndelsen');
  assert.equal(s.husHp, s.husMaksHp, 'og rådhuset er helt igen');
  assert.equal(s.bedste, 1, 'men rekorden står stadig');
}

/* ---------- iPad: alting kan ses og nås ---------- */
{
  const iPad = await browser.newContext({ ...devices['iPad (gen 7) landscape'] });
  const p2 = await iPad.newPage();
  p2.on('pageerror', e => errors.push('iPad: ' + e));
  p2.on('console', m => { if (m.type() === 'error') errors.push('iPad: ' + m.text()); });
  await mockApi(p2);
  await p2.route('**/api/highscore/**', r => r.fulfill({ json: { spil: 'baseforsvar', retning: 'desc', min: 1, maks: 200, unik: true, liste: [] } }));
  await p2.goto(`${BASE}/spil/baseforsvar/?spil=1&froe=1`);   // ?spil=1 springer startskærmen over
  await p2.waitForFunction(() => !!window.GAME);
  await p2.waitForTimeout(300);                                // et par billeder, så fladen er målt op
  assert.equal(await p2.evaluate(() => window.GAME.state.fase), 'spil', '?spil=1 går direkte i gang');
  await p2.evaluate(() => { window.GAME.saetOp({ guld: 1200 }); for (let i = 0; i < 10; i++) window.GAME.bot(); });
  const bygget = await p2.evaluate(() => window.GAME.state);
  assert.ok(bygget.bygninger.length >= 6, 'botten fik bygget en base');
  await p2.evaluate(() => window.GAME.frem(30));
  await tjekBillede(p2, 'iPad');
  await p2.screenshot({ path: SHOTS + 'baseforsvar-ipad.png' });
  const h = await p2.evaluate(() => innerHeight);
  const rk = await p2.locator('.byggerække').boundingBox();
  assert.ok(rk.y + rk.height <= h, 'byggeknapperne ligger inde på skærmen');
  assert.ok(await p2.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'ingen vandret scroll');
  await iPad.close();
}

assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'ingen vandret scroll');
assert.deepEqual(errors, [], 'ingen fejl i konsollen');
await browser.close();
console.log('OK baseforsvar');
