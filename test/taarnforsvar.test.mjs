// Kør:  PLAYWRIGHT=/sti/til/playwright/index.mjs node test/taarnforsvar.test.mjs
// (kræver at en lokal server kører, se test/run.mjs)
//
// Spiller «Tårnforsvar» igennem: startskærm → et tårn bygget med en rigtig
// finger → stien kan man ikke bygge på → kassen med Opgradér/Sælg → en bølge
// sendt af sted og klaret → hjerterne væk, slutskærm og topliste.
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
  return route.fulfill({ json: { spil: 'taarnforsvar', retning: 'desc', min: 1, maks: 200, unik: true, liste: [] } });
});

await page.goto(`${BASE}/spil/taarnforsvar/`);
await page.waitForFunction(() => !!window.GAME);
const state = () => page.evaluate(() => window.GAME.state);
const klik = async p => { await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.up(); };
const knapPx = slags => page.evaluate(s => window.GAME.knapPx(s), slags);
const feltPx = (kx, ky) => page.evaluate(([x, y]) => window.GAME.feltPx(x, y), [kx, ky]);

/* ---------- Startskærmen ---------- */
assert.equal(await page.locator('#startScreen.on').isVisible(), true, 'startskærmen vises');
assert.equal(await page.locator('#bund').isVisible(), false, 'ingen tårnknapper, før man spiller');
assert.match(await page.locator('.lavet').textContent(), /SorteSlyngel/, 'der står, hvem der ønskede sig spillet');
assert.equal((await state()).fase, 'menu');
await page.waitForFunction(() => document.querySelector('#hsStart .hs-titel'), null, { timeout: 4000 });
assert.match(await page.locator('#hsStart').textContent(), /Længst i Tårnforsvar/, 'toplisten hentes på startskærmen');
assert.match(await page.locator('#taarnliste').textContent(), /Bueskytte[\s\S]*Troldmand/, 'alle fire tårne er forklaret');
{
  // Spil-knappen skal kunne nås uden at rulle – ellers finder et barn den ikke
  const knap = await page.locator('#startBtn').boundingBox();
  const h = await page.evaluate(() => innerHeight);
  assert.ok(knap.y + knap.height <= h, `«Spil» kan nås uden at rulle (${Math.round(knap.y + knap.height)} af ${h})`);
}
await page.screenshot({ path: SHOTS + 'taarnforsvar-start.png' });

/* ---------- I gang ---------- */
await page.click('#startBtn');
{
  const s = await state();
  assert.equal(s.fase, 'spil');
  assert.equal(s.liv, 20, 'man begynder med tyve hjerter');
  assert.equal(s.guld, 140, 'og guld til to tårne');
  assert.equal(s.boelge, 0, 'bølgerne er ikke begyndt');
  assert.equal(s.spilFase, 'pause', 'der er en pause til at bygge i');
}
assert.equal(await page.locator('#bund').isVisible(), true, 'tårnknapperne kommer frem');
assert.equal(await page.locator('#livVal').textContent(), '20');
assert.equal(await page.locator('#guldVal').textContent(), '140');
assert.match(await page.locator('#boelgeTekst').textContent(), /Byg dine tårne/, 'og der står hvad man skal');
assert.equal(await page.locator('#sendBtn').isVisible(), true, 'man kan sende bølgen af sted før tid');

/* ---------- Et tårn bygget med en rigtig finger ---------- */
{
  await klik(await knapPx('bue'));
  assert.equal((await state()).valgtSlags, 'bue', 'bueskytten er valgt');
  assert.ok(await page.locator('.taarnknap.valgt').isVisible(), 'knappen lyser op');

  await klik(await feltPx(3, 2));
  const s = await state();
  assert.equal(s.taarne.length, 1, 'tårnet står på banen');
  assert.deepEqual({ slags: s.taarne[0].slags, kx: s.taarne[0].kx, ky: s.taarne[0].ky }, { slags: 'bue', kx: 3, ky: 2 });
  assert.equal(s.guld, 90, 'og det kostede 50 guld');
  assert.equal(await page.locator('#guldVal').textContent(), '90', 'guldet i HUD\'en følger med');
}

/* ---------- På stien må man ikke bygge ---------- */
{
  // Tårnet bliver i hånden, så man kan sætte flere op i træk uden at vælge igen
  assert.equal((await state()).valgtSlags, 'bue', 'bueskytten er stadig valgt efter et byg');
  await klik(await feltPx(2, 2));                       // midt på stien
  assert.match(await page.locator('#besked').textContent(), /Ikke på stien/, 'spillet siger hvorfor');
  assert.equal(await page.locator('#besked.vis').isVisible(), true, 'og beskeden kan ses');
  assert.equal((await state()).taarne.length, 1, 'der kom ikke noget tårn');
  await page.evaluate(() => window.GAME.vaelg(null));
}

/* ---------- Kassen med Opgradér og Sælg ---------- */
{
  assert.equal(await page.locator('#taarnPanel').isVisible(), false, 'kassen er væk, når intet er valgt');
  await klik(await feltPx(3, 2));                       // tryk på tårnet
  assert.equal(await page.locator('#taarnPanel').isVisible(), true, 'kassen kommer frem');
  assert.match(await page.locator('#panelNavn').textContent(), /Bueskytte · niveau 1/);
  assert.match(await page.locator('#opgraderBtn').textContent(), /40/, 'opgraderingen koster 40 guld');

  await page.evaluate(() => window.GAME.saetOp({ guld: 10 }));
  assert.equal(await page.locator('#opgraderBtn').isDisabled(), true, 'uden guld kan man ikke opgradere');
  await page.evaluate(() => window.GAME.saetOp({ guld: 600 }));
  assert.equal(await page.locator('#opgraderBtn').isDisabled(), false, 'med guld nok kan man opgradere');
  await page.click('#opgraderBtn');
  assert.equal((await state()).taarne[0].niveau, 2, 'tårnet blev opgraderet');
  assert.match(await page.locator('#panelNavn').textContent(), /niveau 2/);

  const foer = (await state()).guld;
  await page.click('#saelgBtn');
  const s = await state();
  assert.equal(s.taarne.length, 0, 'tårnet blev solgt');
  assert.ok(s.guld > foer, 'og man fik guld retur');
  assert.equal(await page.locator('#taarnPanel').isVisible(), false, 'kassen forsvinder igen');
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

/* ---------- En bølge sendt af sted og klaret ---------- */
{
  await page.evaluate(() => { window.GAME.saetOp({ guld: 700 }); for (let i = 0; i < 5; i++) window.GAME.bot(); });
  const bygget = await state();
  assert.equal(bygget.taarne.length, 5, 'botten byggede fem tårne til forsvaret');

  const guldFoer = bygget.guld;
  const rest = Math.ceil(bygget.pauseTid);
  await page.click('#sendBtn');
  const s = await state();
  assert.equal(s.boelge, 1, 'bølge 1 er i gang');
  assert.equal(s.spilFase, 'boelge');
  assert.equal(s.guld, guldFoer + rest * 2, 'man fik betaling for de sekunder, man sprang over');
  assert.equal(await page.locator('#varsel.vis').isVisible(), true, 'varslet siger, at bølgen kommer');
  assert.match(await page.locator('#varselNr').textContent(), /BØLGE 1/);
  assert.equal(await page.locator('#sendBtn').isVisible(), false, 'og man kan ikke sende to bølger oven i hinanden');

  // Lidt inde i bølgen: monstrene er på banen, og tårnene er begyndt at skyde
  await page.evaluate(() => window.GAME.frem(8));
  const midt = await state();
  assert.ok(midt.monstre.length > 0, 'der er monstre på stien');
  assert.ok(midt.monstre.some(m => m.d > 0), 'og de er på vej ind mod porten');
  assert.match(await page.locator('#boelgeTekst').textContent(), /monstre tilbage/, 'HUD\'en tæller dem');
  await page.screenshot({ path: SHOTS + 'taarnforsvar.png' });

  // Resten af bølgen – og kun den, for pausen er kort nok til at næste bølge
  // ellers ville nå at gå i gang undervejs
  await page.evaluate(() => window.GAME.spolBoelge());
  const efter = await state();
  assert.equal(efter.klarede, 1, 'bølgen blev klaret');
  assert.equal(efter.boelge, 1, 'og den næste er ikke begyndt endnu');
  assert.equal(efter.spilFase, 'pause', 'og så er der pause igen');
  assert.equal(efter.liv, 20, 'fem tårne holdt alt ude');
  assert.ok(efter.drab > 0, 'monstrene blev nedlagt');
  assert.ok(efter.guld > 0, 'og de gav guld');
  assert.match(await page.locator('#boelgeTekst').textContent(), /Bølge 1 klaret/);
}

/* ---------- Uden tårne slipper monstrene ind – og så er det slut ---------- */
{
  await page.evaluate(() => {
    for (const t of window.GAME.state.taarne) { window.GAME.tryk(t.kx, t.ky); window.GAME.saelgValgte(); }
    window.GAME.saetOp({ liv: 1 });
  });
  assert.equal((await state()).taarne.length, 0, 'alle tårne er solgt igen');
  await page.evaluate(() => window.GAME.sendNu());
  await page.evaluate(() => window.GAME.frem(90));

  const s = await state();
  assert.equal(s.fase, 'slut', 'da hjertet var væk, sluttede spillet');
  assert.equal(s.liv, 0);
  assert.equal(s.klarede, 1, 'man nåede én bølge');
  await page.waitForSelector('#slutScreen.on');
  assert.equal(await page.locator('#slutTal').textContent(), '1 bølge');
  assert.match(await page.locator('#slutSub').textContent(), /Du nåede bølge 2/);
  assert.equal(await page.locator('#nyRekord').isVisible(), true, 'første runde er altid en rekord');
  assert.equal(await page.locator('#bund').isVisible(), false, 'tårnknapperne er væk på slutskærmen');

  await page.waitForTimeout(400);
  assert.equal(sendte.length, 1, 'bølgerne sendes til toplisten');
  assert.deepEqual({ navn: sendte[0].navn, score: sendte[0].score }, { navn: 'Selma', score: 1 });
  assert.equal(await page.evaluate(() => +localStorage.getItem('zydy.taarnforsvar.bedste')), 1,
    'rekorden huskes på telefonen');
  await page.waitForFunction(() => /Selma/.test(document.getElementById('hsSlut').textContent), null, { timeout: 4000 });
  await page.screenshot({ path: SHOTS + 'taarnforsvar-slut.png' });
}

/* ---------- Spil igen begynder forfra ---------- */
{
  await page.click('#igenBtn');
  const s = await state();
  assert.equal(s.fase, 'spil');
  assert.deepEqual({ liv: s.liv, guld: s.guld, boelge: s.boelge, taarne: s.taarne.length },
    { liv: 20, guld: 140, boelge: 0, taarne: 0 }, 'alting er som i begyndelsen');
  assert.equal(s.bedste, 1, 'men rekorden står stadig');
}

/* ---------- iPad: alting kan ses og nås ---------- */
{
  const iPad = await browser.newContext({ ...devices['iPad (gen 7) landscape'] });
  const p2 = await iPad.newPage();
  p2.on('pageerror', e => errors.push('iPad: ' + e));
  p2.on('console', m => { if (m.type() === 'error') errors.push('iPad: ' + m.text()); });
  await mockApi(p2);
  await p2.route('**/api/highscore/**', r => r.fulfill({ json: { spil: 'taarnforsvar', retning: 'desc', min: 1, maks: 200, unik: true, liste: [] } }));
  await p2.goto(`${BASE}/spil/taarnforsvar/?spil=1`);   // ?spil=1 springer startskærmen over
  await p2.waitForFunction(() => !!window.GAME);
  await p2.waitForTimeout(300);                          // et par billeder, så fladen er målt op
  assert.equal(await p2.evaluate(() => window.GAME.state.fase), 'spil', '?spil=1 går direkte i gang');
  await p2.evaluate(() => { window.GAME.saetOp({ guld: 700 }); for (let i = 0; i < 6; i++) window.GAME.bot(); });
  await p2.evaluate(() => { window.GAME.sendNu(); window.GAME.frem(14); });
  await tjekBillede(p2, 'iPad');
  await p2.screenshot({ path: SHOTS + 'taarnforsvar-ipad.png' });
  const h = await p2.evaluate(() => innerHeight);
  const rk = await p2.locator('.taarnrække').boundingBox();
  assert.ok(rk.y + rk.height <= h, 'tårnknapperne ligger inde på skærmen');
  assert.ok(await p2.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'ingen vandret scroll');
  await iPad.close();
}

assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'ingen vandret scroll');
assert.deepEqual(errors, [], 'ingen fejl i konsollen');
await browser.close();
console.log('OK taarnforsvar');
