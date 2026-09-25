// Kør:  PLAYWRIGHT=/sti/til/playwright/index.mjs node test/baseforsvar.test.mjs
// (kræver at en lokal server kører, se test/run.mjs)
//
// Spiller «Baseforsvar» igennem: startskærm → en mur bygget med en rigtig
// finger → man kan hverken bygge oven på rådhuset eller på terrænet → kassen
// med Opgradér/Sælg → bønder i kø og guld ved daggry → soldater og bueskyttere
// fra kasernen → en tropp trykket på, hans tal og en opgradering af hele
// slagsen → en helt hyret, sendt ud og hans trylleformular kastet → et tårn
// skyder zombier → en belejrer og en ballista → natten falder på → rådhuset
// æder sit sidste liv, slutskærm og topliste.
// Spillet hentes med ?froe=1, så terræn og terning er de samme hver gang.
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
const ledigt = (kx, ky) => page.evaluate(([x, y]) => window.GAME.ledigtFelt(x, y), [kx, ky]);
const HUS = await page.evaluate(() => window.GAME.RAADHUS_FELT);

/* ---------- Startskærmen ---------- */
assert.equal(await page.locator('#startScreen.on').isVisible(), true, 'startskærmen vises');
assert.equal(await page.locator('#bund').isVisible(), false, 'ingen byggeknapper, før man spiller');
assert.match(await page.locator('.lavet').textContent(), /SorteSlyngel/, 'der står, hvem der ønskede sig spillet');
assert.equal((await state()).fase, 'menu');
await page.waitForFunction(() => document.querySelector('#hsStart .hs-titel'), null, { timeout: 4000 });
assert.match(await page.locator('#hsStart').textContent(), /Længst i Baseforsvar/, 'toplisten hentes på startskærmen');
{
  // Alle bygninger, tropper og helte skal være forklaret – ellers er der
  // knapper, man ikke ved hvad gør
  const liste = await page.locator('#bygliste').textContent();
  for (const navn of ['Mur', 'Skydetårn', 'Kanontårn', 'Ballista', 'Farm', 'Kaserne', 'Kirke', 'Rådhus',
    'Soldat', 'Bueskytte', 'Præst', 'Ridderen', 'Troldkvinden', 'Jægeren', 'Belejrer']) {
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
  assert.ok(s.terraen >= 8, `der er klipper, sø og skov på banen (${s.terraen} felter)`);
  assert.equal(s.husHp, s.husMaksHp, 'med fuldt liv');
}
assert.equal(await page.locator('#bund').isVisible(), true, 'byggeknapperne kommer frem');
{
  // Syv knapper i én række og tre helte – og de skal alle kunne nås på en iPhone
  assert.equal(await page.locator('.byggeknap').count(), 7, 'der er en knap til hver af de syv bygninger');
  assert.equal(await page.locator('.heltknap').count(), 3, 'og tre helte');
  const h = await page.evaluate(() => innerHeight), w = await page.evaluate(() => innerWidth);
  const sidste = await page.locator('.byggeknap').last().boundingBox();
  assert.ok(sidste.y + sidste.height <= h, `den sidste knap er inde på skærmen (${Math.round(sidste.y + sidste.height)} af ${h})`);
  const helt = await page.locator('.heltknap').last().boundingBox();
  assert.ok(helt.x + helt.width <= w, 'den sidste helt er inde på skærmen');
  assert.ok(helt.height >= 34, 'og stor nok til en finger');
  const g = await page.evaluate(() => window.GAME.geo());
  assert.ok(g.skala >= 2.4, `og banen er stadig stor nok (skala=${g.skala.toFixed(2)})`);
}
assert.equal(await page.locator('#guldVal').textContent(), '260');
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

/* ---------- Hverken oven på rådhuset eller ude i terrænet ---------- */
{
  await klik(await feltPx(HUS.kx, HUS.ky));
  assert.match(await page.locator('#besked').textContent(), /Der står allerede noget/, 'spillet siger hvorfor');
  assert.equal(await page.locator('#besked.vis').isVisible(), true, 'og beskeden kan ses');
  const t = await page.evaluate(() => window.GAME.terraenFelt());
  assert.ok(t, 'der er terræn at trykke på');
  await klik(await feltPx(t.kx, t.ky));
  assert.match(await page.locator('#besked').textContent(), /Man kan ikke bygge (på|i) /, 'på terrænet kan man ikke bygge');
  assert.equal((await state()).bygninger.length, 2, 'der kom ikke noget nyt');
  await page.evaluate(() => window.GAME.vaelg(null));
}

/* ---------- Kassen med Opgradér og Sælg ---------- */
{
  assert.equal(await page.locator('#panel').isVisible(), false, 'kassen er væk, når intet er valgt');
  await klik(await feltPx(HUS.kx, HUS.ky - 1));
  assert.equal(await page.locator('#panel').isVisible(), true, 'kassen kommer frem');
  assert.match(await page.locator('#panelNavn').textContent(), /Mur · niveau 1\/4/, 'der er fire niveauer at gå efter');
  assert.equal(await page.locator('#panelKnapper .traen').count(), 0, 'en mur kan man ikke træne nogen i');

  await page.evaluate(() => window.GAME.saetOp({ guld: 5 }));
  assert.equal(await page.locator('#opgraderBtn').isDisabled(), true, 'uden guld kan man ikke opgradere');
  await page.evaluate(() => window.GAME.saetOp({ guld: 600 }));
  assert.equal(await page.locator('#opgraderBtn').isDisabled(), false, 'med guld nok kan man opgradere');
  await page.click('#opgraderBtn');
  assert.equal((await state()).bygninger.find(b => b.slags === 'mur').niveau, 2, 'muren blev opgraderet');
  for (let n = 2; n < 4; n++) await page.click('#opgraderBtn');
  assert.match(await page.locator('#opgraderBtn').textContent(), /Færdig/, 'og så er der ikke mere at opgradere');
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
  assert.equal(await page.locator('#saelgBtn').count(), 0, 'men det kan man ikke sælge');
  await page.click('#lukBtn');
  assert.equal(await page.locator('#panel').isVisible(), false, '✕ lukker kassen');
}

/* ---------- Farmen: bønder i kø, og guld ved daggry ---------- */
const FARM = await ledigt(2, 3);
{
  await page.evaluate(() => window.GAME.saetOp({ guld: 900 }));
  await page.evaluate(({ kx, ky }) => { window.GAME.vaelg('farm'); window.GAME.tryk(kx, ky); window.GAME.vaelg(null); }, FARM);
  await klik(await feltPx(FARM.kx, FARM.ky));
  assert.match(await page.locator('#panelNavn').textContent(), /Farm · niveau 1\/4/);
  assert.match(await page.locator('#traen-bonde').textContent(), /Træn bonde/, 'på en farm kan man træne bønder');
  assert.match(await page.locator('#panelTal').textContent(), /0\/2 bønder/, 'kassen siger, hvor mange der er plads til');

  await page.click('#traen-bonde');
  await page.click('#traen-bonde');
  assert.match(await page.locator('#traen-bonde').textContent(), /Fuldt hus/, 'to i kø fylder farmen');
  assert.equal(await page.locator('#traen-bonde').isDisabled(), true);
  assert.equal((await state()).boender, 0, 'de er der ikke endnu');

  await page.evaluate(() => window.GAME.frem(11));
  const medBonde = await state();
  assert.equal(medBonde.boender, 2, 'begge bønder er færdiguddannede');
  assert.match(await page.locator('#panelTal').textContent(), /2\/2 bønder/);

  const foer = (await state()).guld;
  await page.evaluate(() => window.GAME.spolDag());
  const morgen = await state();
  assert.equal(morgen.dag, 2, 'der er gået en dag');
  assert.ok(morgen.guld >= foer + morgen.indtaegt, 'farmen betalte ved daggry');
  assert.match(await page.locator('#doegnTekst').textContent(), /Farmene gav/, 'og det står i bunden');
  assert.match(await page.locator('#varselNr').textContent(), /DAG 2/, 'varslet siger, at en ny dag er begyndt');
  await page.click('#lukBtn');
}

/* ---------- Kasernen: soldater og bueskyttere, flere i kø ---------- */
const KAS = await ledigt(HUS.kx + 3, HUS.ky + 3);
{
  await page.evaluate(() => window.GAME.saetOp({ guld: 900 }));
  await page.evaluate(({ kx, ky }) => { window.GAME.vaelg('kaserne'); window.GAME.tryk(kx, ky); window.GAME.vaelg(null); window.GAME.tryk(kx, ky); }, KAS);
  assert.match(await page.locator('#traen-soldat').textContent(), /Træn soldat/, 'på kasernen træner man soldater');
  assert.match(await page.locator('#traen-bueskytte').textContent(), /Træn bueskytte/, 'og bueskyttere');
  await page.click('#traen-soldat');
  await page.click('#traen-soldat');
  await page.click('#traen-bueskytte');
  assert.match(await page.locator('#panelTal').textContent(), /3 undervejs/, 'tre i kø');
  assert.equal(await page.locator('#traen-soldat').isDisabled(), false, 'og man kan blive ved');
  await page.evaluate(() => window.GAME.frem(20));
  const s = await state();
  assert.equal(s.soldater, 3, 'alle tre er på benene');
  assert.deepEqual(s.tropper.map(t => t.slags).sort(), ['bueskytte', 'soldat', 'soldat']);
  assert.match(await page.locator('#panelTal').textContent(), /2 soldater · 1 bueskytte/);
  await page.click('#lukBtn');
}

/* ---------- En tropp: liv, tal og en opgradering ---------- */
{
  await page.evaluate(() => window.GAME.pause());
  const soldat = (await state()).tropper.find(t => t.slags === 'soldat');
  await klik(await page.evaluate(([x, y]) => window.GAME.punktPx(x, y), [soldat.x, soldat.y]));
  assert.equal((await state()).valgt?.art, 'tropp', 'et tryk på soldaten vælger ham');
  assert.match(await page.locator('#panelNavn').textContent(), /Soldat · niveau 1\/5/);
  assert.match(await page.locator('#panelTal').textContent(), /❤️ \d+\/\d+ · ⚔️ \d+ i hug/, 'hans liv og hug står i kassen');
  const foer = (await state()).tropper.find(t => t.id === soldat.id).maksHp;
  await page.click('#tropOpBtn');
  const s = await state();
  assert.equal(s.tropNiv.soldat, 2, 'alle soldater er opgraderet');
  assert.ok(s.tropper.find(t => t.id === soldat.id).maksHp > foer, 'og han tåler mere');
  assert.equal(s.tropNiv.bueskytte, 1, 'bueskytterne er ikke rørt');
  assert.match(await page.locator('#panelNavn').textContent(), /niveau 2\/5/);
  await page.click('#lukBtn');
  await page.evaluate(() => window.GAME.fortsaet());
}

/* ---------- En helt: hyret, sendt ud og en trylleformular ---------- */
{
  await page.evaluate(() => window.GAME.saetOp({ guld: 900 }));
  await page.click('.heltknap[data-helt="ridder"]');
  assert.match(await page.locator('#panelNavn').textContent(), /Ridderen/, 'kassen fortæller om helten');
  assert.match(await page.locator('#panelTal').textContent(), /Aura «Mod»/, 'og hans aura');
  const guld = (await state()).guld;
  await page.click('#hyrBtn');
  let s = await state();
  assert.equal(s.helte.length, 1, 'ridderen er hyret');
  assert.equal(s.guld, guld - 200);
  assert.match(await page.locator('#panelNavn').textContent(), /Ridderen · niveau 1\/10/);
  assert.match(await page.locator('.heltknap[data-helt="ridder"]').textContent(), /niv 1/, 'knappen viser hans niveau');

  // Et tryk på banen sender ham derhen
  const maal = await ledigt(HUS.kx - 3, HUS.ky - 3);
  await klik(await feltPx(maal.kx, maal.ky));
  s = await state();
  const vagt = s.helte[0].vagt;
  assert.ok(Math.abs(vagt.x - (maal.kx + 0.5) * 10) < 5 && Math.abs(vagt.y - (maal.ky + 0.5) * 10) < 5, 'vagtposten flyttede sig');
  await page.evaluate(() => window.GAME.frem(6));
  s = await state();
  assert.ok(Math.hypot(s.helte[0].x - vagt.x, s.helte[0].y - vagt.y) < 5, 'og han gik derhen');

  // Zombier tæt på – og skjoldslaget
  await page.evaluate(({ kx, ky }) => { for (let i = 0; i < 2; i++) window.GAME.sendZombie('brute', kx, ky - 1); }, maal);
  assert.match(await page.locator('#trylleBtn').textContent(), /Skjoldslag/);
  await page.click('#trylleBtn');
  s = await state();
  assert.ok(s.helte[0].venter > 0, 'skjoldslaget blev kastet og skal lades op igen');
  assert.equal(await page.locator('#trylleBtn').isDisabled(), true, 'så knappen er grå imens');
  await page.screenshot({ path: SHOTS + 'baseforsvar-helt.png' });
  await page.evaluate(() => window.GAME.frem(10));
  await page.click('#lukBtn');
}

/* ---------- Der bliver tegnet dér, hvor man kigger ---------- */
async function tjekBillede(p, hvem) {
  const g = await p.evaluate(() => window.GAME.geo());
  assert.ok(Math.abs(g.W - g.bredde) <= 2 && Math.abs(g.H - g.hoejde) <= 2,
    `${hvem}: der tegnes i ${g.W}×${g.H}, men lærredet fylder ${Math.round(g.bredde)}×${Math.round(g.hoejde)}`);
  assert.ok(Math.abs(g.lw - g.bredde * g.dpr) <= 2 && Math.abs(g.lh - g.hoejde * g.dpr) <= 2,
    `${hvem}: lærredets pixels passer med pladsen`);
  assert.ok(g.skala >= 2.4, `${hvem}: banen er tegnet stort nok til at ses (skala=${g.skala.toFixed(2)})`);
  assert.ok(g.ox >= -1 && g.oy >= -1, `${hvem}: hele banen er inde i billedet`);
  return g;
}
await tjekBillede(page, 'iPhone');

/* ---------- Et tårn skyder zombierne ned ---------- */
{
  await page.evaluate(() => window.GAME.saetOp({ guld: 900 }));
  await page.evaluate(() => {
    const h = window.GAME.RAADHUS_FELT;
    window.GAME.vaelg('taarn'); window.GAME.tryk(h.kx - 1, h.ky - 1); window.GAME.vaelg(null);
  });
  assert.ok((await state()).bygninger.some(b => b.slags === 'taarn'), 'tårnet står på banen');
  const foer = await state();
  await page.evaluate(() => {
    const h = window.GAME.RAADHUS_FELT;
    for (let i = 0; i < 3; i++) window.GAME.sendZombie('zombie', h.kx, h.ky - 2);
  });
  await page.screenshot({ path: SHOTS + 'baseforsvar.png' });
  await page.evaluate(() => window.GAME.frem(14));
  const efter = await state();
  assert.ok(efter.drab > foer.drab, 'tårnet (og tropperne) skød dem ned');
  assert.match(await page.locator('#drabVal').textContent(), /[1-9]/, 'tælleren i toppen følger med');
}

/* ---------- En belejrer – og ballisten, der når den ---------- */
{
  await page.evaluate(() => window.GAME.saetOp({ guld: 900 }));
  await klik(await knapPx('ballista'));
  await klik(await feltPx(HUS.kx + 1, HUS.ky - 1));
  await page.evaluate(() => window.GAME.vaelg(null));
  const s0 = await state();
  assert.ok(s0.bygninger.some(b => b.slags === 'ballista'), 'ballisten står på banen');
  const id = await page.evaluate(() => window.GAME.sendZombie('belejrer', window.GAME.RAADHUS_FELT.kx + 1, -1));
  await page.evaluate(() => window.GAME.frem(8));
  await page.screenshot({ path: SHOTS + 'baseforsvar-belejrer.png' });
  await page.evaluate(() => window.GAME.frem(30));
  assert.equal((await state()).fjender.some(f => f.id === id), false, 'belejreren blev skudt ned');
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
    window.GAME.saetOp({ husHp: 40, udenHaer: true });
    for (const b of window.GAME.state.bygninger) {
      if (b.slags === 'raadhus') continue;
      window.GAME.tryk(b.kx, b.ky);
      document.getElementById('saelgBtn').click();
    }
    const h = window.GAME.RAADHUS_FELT;
    for (let i = 0; i < 3; i++) window.GAME.sendZombie('brute', h.kx, h.ky - 1);
  });
  assert.equal((await state()).bygninger.length, 1, 'alt andet end rådhuset er solgt');
  await page.evaluate(() => window.GAME.frem(25));

  const s = await state();
  assert.equal(s.fase, 'slut', 'da rådhuset faldt, sluttede spillet');
  assert.ok(s.klarede >= 1, `man nåede ${s.klarede} dage`);
  await page.waitForSelector('#slutScreen.on');
  assert.equal(await page.locator('#slutTal').textContent(), s.klarede === 1 ? '1 dag' : s.klarede + ' dage');
  assert.match(await page.locator('#slutSub').textContent(), new RegExp(`Du nåede dag ${s.dag}`));
  assert.equal(await page.locator('#nyRekord').isVisible(), true, 'første runde er altid en rekord');
  assert.equal(await page.locator('#bund').isVisible(), false, 'byggeknapperne er væk på slutskærmen');

  await page.waitForTimeout(400);
  assert.equal(sendte.length, 1, 'dagene sendes til toplisten');
  assert.deepEqual({ navn: sendte[0].navn, score: sendte[0].score }, { navn: 'Selma', score: s.klarede });
  assert.equal(await page.evaluate(() => +localStorage.getItem('zydy.baseforsvar.bedste')), s.klarede,
    'rekorden huskes på telefonen');
  await page.waitForFunction(() => /Selma/.test(document.getElementById('hsSlut').textContent), null, { timeout: 4000 });
  await page.screenshot({ path: SHOTS + 'baseforsvar-slut.png' });
}

/* ---------- Spil igen begynder forfra ---------- */
{
  await page.click('#igenBtn');
  const s = await state();
  assert.equal(s.fase, 'spil');
  assert.deepEqual({ guld: s.guld, dag: s.dag, bygninger: s.bygninger.length, boender: s.boender, helte: s.helte.length, soldater: s.soldater },
    { guld: 260, dag: 1, bygninger: 1, boender: 0, helte: 0, soldater: 0 }, 'alting er som i begyndelsen');
  assert.deepEqual(s.tropNiv, { soldat: 1, bueskytte: 1, praest: 1 }, 'også tropperne');
  assert.ok(s.bedste >= 1, 'men rekorden står stadig');
}

/* ---------- iPad: alting kan ses og nås ---------- */
{
  const iPad = await browser.newContext({ ...devices['iPad (gen 7) landscape'] });
  const p2 = await iPad.newPage();
  p2.on('pageerror', e => errors.push('iPad: ' + e));
  p2.on('console', m => { if (m.type() === 'error') errors.push('iPad: ' + m.text()); });
  await mockApi(p2);
  await p2.route('**/api/highscore/**', r => r.fulfill({ json: { spil: 'baseforsvar', retning: 'desc', min: 1, maks: 200, unik: true, liste: [] } }));
  await p2.goto(`${BASE}/spil/baseforsvar/?spil=1&froe=2`);   // ?spil=1 springer startskærmen over
  await p2.waitForFunction(() => !!window.GAME);
  await p2.waitForTimeout(300);                                // et par billeder, så fladen er målt op
  assert.equal(await p2.evaluate(() => window.GAME.state.fase), 'spil', '?spil=1 går direkte i gang');
  await p2.evaluate(() => { window.GAME.saetOp({ guld: 3000, tid: 36 * 7 }); for (let i = 0; i < 30; i++) window.GAME.bot(); });
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
