// Kør:  PLAYWRIGHT=/Users/lars/Projekter/DungeonCrawler/node_modules/playwright/index.mjs node test/hund.test.mjs
// (kræver at en lokal server kører: python3 -m http.server 4186 -d public)
//
// Spiller «Min hund» igennem: hent en hvalp → mad, bold, bad → en hel gåtur med
// lygtepæl og mudderpyt → hundeskolen, hvor et trick sidder fast → butik →
// hunden huskes efter genindlæsning → niveau og topliste.
// API'erne kører i hukommelsen (test/api-mock.mjs).
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

// Tom topliste, så et nyt niveau altid kvalificerer og navnet skal skrives
const sendte = [];
const api = await mockApi(page);
await page.route('**/api/highscore/**', async route => {
  const req = route.request();
  if (req.method() === 'POST') {
    const krop = req.postDataJSON(); sendte.push(krop);
    return route.fulfill({ json: { ok: true, id: 1, token: 'abc', placering: 1, liste: [{ id: 1, navn: krop.navn, score: krop.score, oprettet: '2026-09-13T12:00:00.000Z' }] } });
  }
  return route.fulfill({ json: { spil: 'hund', retning: 'desc', min: 1, maks: 50, unik: true, liste: [] } });
});

await page.goto(`${BASE}/spil/hund/?seed=7`);
await page.waitForFunction(() => !!window.GAME);
const state = () => page.evaluate(() => window.GAME.state);
const hund = () => page.evaluate(() => window.GAME.hund);
// Som spillets egen løkke: lad tiden gå i små trin og tegn skærmen om bagefter.
const tik = (sek, trin = 1 / 60) => page.evaluate(([sek, trin]) => {
  for (let t = 0; t < sek; t += trin) window.GAME.tik(trin);
  window.GAME.opdater();
  window.GAME.tegn();
}, [sek, trin]);
const tegn = () => page.evaluate(() => { window.GAME.opdater(); window.GAME.tegn(); });
const lukArk = () => page.evaluate(() => document.querySelectorAll('.ark.on').forEach(a => a.classList.remove('on')));

/* ---------- Startskærmen: vælg en hvalp ---------- */
assert.equal(await page.locator('#start.on').isVisible(), true, 'startskærmen vises');
assert.equal(await page.locator('#hvalpe .hvalp').count(), 3, 'tre hvalpe at vælge imellem');
assert.equal(await page.locator('#fortsaetBtn').isVisible(), false, 'ingen «tilbage til hunden» på en frisk start');
await page.waitForFunction(() => document.querySelector('#hsStart .hs-titel'), null, { timeout: 4000 });
assert.match(await page.locator('#hsStart').textContent(), /Klogeste hunde/, 'toplisten står på startskærmen');
await page.screenshot({ path: SHOTS + 'hund-start.png' });

await page.click('#hvalpe .hvalp:nth-child(2)');
assert.equal((await state()).valgtPels, 'pels-sort', 'man kan vælge en anden hvalp');
await page.fill('#hundNavn', 'Trofast');
await page.click('#adopterBtn');
await page.evaluate(() => window.GAME.pause());          // vi styrer selv tiden herfra

assert.equal(await page.locator('#spil.on').isVisible(), true, 'spilskærmen kommer frem');
assert.equal(await page.locator('#hundBrand').textContent(), 'Trofast', 'hunden har fået sit navn');
{
  const h = await hund();
  assert.equal(h.navn, 'Trofast');
  assert.equal(h.pels, 'pels-sort');
  assert.equal(h.moenter, 20, 'man starter med lidt lommepenge');
}

/* ---------- Behovene siver, og «luftet» siver hurtigst ---------- */
{
  assert.equal(await page.locator('.maaler').count(), 4, 'der er en måler for hvert behov');
  const maaler = () => page.evaluate(() => parseFloat(document.querySelector('.maaler[data-b="tur"] i').style.width));
  const foer = (await hund()).behov, maalerFoer = await maaler();
  await tik(3600, 1);                                     // en time
  const efter = (await hund()).behov;
  assert.ok(efter.tur < foer.tur - 5, `Trofast trænger til en tur (${foer.tur.toFixed(0)} → ${efter.tur.toFixed(0)})`);
  assert.ok(foer.tur - efter.tur > foer.mad - efter.mad, 'og «luftet» falder hurtigere end sulten');
  assert.ok(await maaler() < maalerFoer, 'måleren følger med ned');
  assert.match(await page.locator('#besked').textContent(), /Trofast/, 'beskeden fortæller, hvad hunden mangler');
}

/* ---------- Mad ---------- */
{
  await page.evaluate(() => { window.GAME.hund.behov.mad = 10; window.GAME.opdater(); });
  await page.click('#madBtn');
  assert.equal((await state()).madISkaal, true, 'maden kommer i skålen');
  await tik(10);                                          // gå derhen og spis op
  const h = await hund();
  assert.equal((await state()).tilstand, 'fri', 'hunden er færdig med at spise');
  assert.ok(h.behov.mad > 40, `Trofast blev mæt (${h.behov.mad.toFixed(0)})`);
  assert.ok(h.moenter > 20, `og der kom mønter i kassen (${h.moenter})`);
  await page.evaluate(() => { window.GAME.hund.behov.mad = 100; window.GAME.opdater(); });
  assert.equal(await page.locator('#madBtn').isDisabled(), true, 'knappen slår fra, når hunden er mæt');
}

/* ---------- Bolden: kast, hent, aflever ---------- */
{
  await lukArk();
  await page.evaluate(() => { window.GAME.hund.behov.leg = 20; window.GAME.opdater(); });
  await page.click('#boldBtn');
  assert.equal((await state()).tilstand, 'bold');
  assert.ok((await state()).bold, 'bolden ligger klar');

  const boks = await page.locator('#laerred').boundingBox();
  await page.mouse.click(boks.x + boks.width * 0.8, boks.y + boks.height * 0.5);
  assert.equal((await state()).bold.fase, 'flyver', 'bolden er kastet');
  const foer = (await hund()).behov.leg;
  await tegn();
  await page.screenshot({ path: SHOTS + 'hund-bold.png' });
  await tik(6);
  const efter = (await hund()).behov.leg;
  assert.ok(efter > foer, `Trofast henter bolden og bliver gladere (${foer.toFixed(0)} → ${efter.toFixed(0)})`);
  assert.equal((await state()).bold.fase, 'ligger', 'og afleverer den ved dine fødder');

  // Bolden bliver liggende, til man kaster igen – hunden henter ikke af sig selv
  const hvile = (await hund()).behov.leg;
  await tik(4);
  assert.equal((await hund()).behov.leg <= hvile, true, 'man kan ikke stå og få gratis point af en bold, der ligger stille');
  await tegn();
  await page.screenshot({ path: SHOTS + 'hund.png' });
  await lukArk();                                         // et nyt niveau kan have åbnet toplisten
  await page.click('#stopBtn');
  assert.equal((await state()).tilstand, 'fri', '«Færdig» stopper leget');
}

/* ---------- Badet ---------- */
{
  await lukArk();
  await page.evaluate(() => { window.GAME.hund.behov.renhed = 30; window.GAME.opdater(); });
  await page.click('#badBtn');
  assert.equal((await state()).tilstand, 'bad');
  const foer = (await hund()).behov.renhed;
  const r = await page.evaluate(() => window.GAME.saeb(3));
  assert.ok(r.oeget > 0, 'sæben gør hunden renere');
  assert.ok((await hund()).behov.renhed > foer + 10, 'pelsen blev pæn');
  await tegn();
  await page.screenshot({ path: SHOTS + 'hund-bad.png' });
  await lukArk();
  await page.click('#stopBtn');
  assert.equal((await state()).tilstand, 'fri');
  assert.match(await page.locator('#besked').textContent(), /ryster/, 'hunden ryster vandet af sig');
}

/* ---------- Gåturen: den eneste måde at få «luftet» op ---------- */
{
  await lukArk();
  await page.evaluate(() => { window.GAME.hund.behov.tur = 10; window.GAME.hund.behov.leg = 30; window.GAME.opdater(); });
  await page.click('#turBtn');
  assert.equal((await state()).tilstand, 'tur');
  assert.equal(await page.locator('#turMaal').isVisible(), true, 'meterne tælles på skærmen');
  assert.equal(await page.locator('#madBtn').isDisabled(), true, 'man fodrer ikke hunden midt på gaden');
  const rute = (await state()).tur;
  assert.ok(rute.stop.length >= 3, `der sker noget undervejs (${rute.stop.length} stop)`);

  // Gå et stykke: meterne tæller, «luftet» fyldes op, og der er mønter i det
  const foer = await hund();
  await tik(4);
  const efter = await hund();
  assert.ok(efter.behov.tur > foer.behov.tur + 5, `turen lufter hunden (${foer.behov.tur.toFixed(0)} → ${efter.behov.tur.toFixed(0)})`);
  assert.ok(efter.meter >= 12, `kilometertælleren tæller med (${efter.meter} m)`);
  assert.match(await page.locator('#meterPill').textContent(), /m/);

  // Tryk på noget undervejs – det står lige foran hunden, når vi er ved det
  const slags = await page.evaluate(() => {
    const t = window.GAME.state.tur;
    let s = t.stop.find(s => !s.klaret && !s.forbi && ['lygte', 'pind', 'kat', 'ven'].includes(s.slags) && s.m > t.m);
    // Ruten er tilfældig, så resten af den kan i princippet være lutter pytter
    if (!s) { s = { m: t.m + 6, slags: 'pind', klaret: false, forbi: false }; t.stop.push(s); }
    t.m = s.m;
    window.GAME.tegn();
    return s.slags;
  });
  const legFoer = (await hund()).behov.leg;
  const boks = await page.locator('#laerred').boundingBox();
  await tegn();
  await page.screenshot({ path: SHOTS + 'hund-tur.png' });
  await page.mouse.click(boks.x + boks.width * 0.34, boks.y + boks.height * 0.6);
  assert.ok((await hund()).behov.leg > legFoer, `et tryk på ${slags} gør hunden glad`);

  // Mudderpytten: den man ikke når at trække hunden væk fra, koster et bad
  await page.evaluate(() => {
    const t = window.GAME.state.tur;
    window.GAME.hund.behov.renhed = 90;
    t.stop.push({ m: t.m - 3, slags: 'pyt', klaret: false, forbi: false });
  });
  await tik(0.1);
  assert.ok((await hund()).behov.renhed < 80, 'så ryger den i pytten');
  assert.match(await page.locator('#besked').textContent(), /Plask/);

  // Resten af turen, og så hjem
  await page.evaluate(() => { window.GAME.state.tur.m = window.GAME.state.tur.laengde - 3; });
  await tik(2);
  assert.equal((await state()).tilstand, 'fri', 'turen slutter hjemme igen');
  assert.equal((await state()).tur, null);
  assert.equal(await page.locator('#turMaal').isVisible(), false);
  assert.match(await page.locator('#besked').textContent(), /Hjemme igen/);
}

/* ---------- Hundeskolen ---------- */
{
  await lukArk();
  await page.click('#skoleBtn');
  assert.equal(await page.locator('#skole.on').isVisible(), true, 'hundeskolen glider op');
  assert.equal(await page.locator('.trick').count(), 6, 'seks tricks at lære');
  assert.equal(await page.locator('.trick[data-trick="sit"]').isDisabled(), false, 'sit kan man med det samme');
  assert.equal(await page.locator('.trick[data-trick="doed"]').isDisabled(), true, 'dødsmand er låst til et højere niveau');

  // Stuen løftes op over arket – ellers kan man ikke se hunden gøre tricket
  const plads = await page.evaluate(() => {
    window.GAME.tegn();
    const l = document.querySelector('#laerred').getBoundingClientRect();
    return { gulv: l.top + window.GAME.gulvY(), ark: document.querySelector('#skole .kort').getBoundingClientRect().top };
  });
  assert.ok(plads.gulv < plads.ark, `hunden står oven over arket (gulv ${plads.gulv.toFixed(0)} < ark ${plads.ark.toFixed(0)})`);

  // Ét forsøg, der lykkes: hunden sætter sig, og tricket rykker sig
  const foer = await page.evaluate(() => window.GAME.hund.tricks.sit || 0);
  const r = await page.evaluate(() => window.GAME.sigTrick('sit', 0));
  assert.equal(r.ok, true);
  assert.ok(r.laert > foer, `tricket rykker sig (${foer} → ${r.laert})`);
  assert.equal((await state()).tilstand, 'trick');
  assert.equal((await state()).trick.id, 'sit');
  assert.match(await page.locator('#skoleSvar').textContent(), /Dygtig/);
  await tegn();
  await page.screenshot({ path: SHOTS + 'hund-skole.png' });

  // Et forsøg, der mislykkes, lærer den stadig lidt
  const b = await page.evaluate(() => window.GAME.sigTrick('sit', 1));
  assert.equal(b.ok, false);
  assert.ok(b.laert > r.laert, 'selv et mislykket forsøg tæller med');
  assert.match(await page.locator('#skoleSvar').textContent(), /igen/);

  // Øv videre, til det sidder fast
  await page.evaluate(() => { window.GAME.hund.tricks.sit = 91; });
  const sidste = await page.evaluate(() => window.GAME.sigTrick('sit', 0));
  assert.equal(sidste.mestret, true);
  assert.equal(await page.evaluate(() => window.GAME.kanTricks()), 1, 'Trofast kan sit');
  await page.evaluate(() => document.querySelector('#skole').classList.add('on'));
  assert.match(await page.locator('.trick[data-trick="sit"]').textContent(), /kan det/);
  assert.match(await page.locator('#skolePill').textContent(), /1 trick/);

  // Et trick, den kan, er gratis sjov – men giver ikke mønter
  await page.evaluate(() => { window.GAME.hund.behov.leg = 100; window.GAME.opdater(); });
  const moenter = (await hund()).moenter;
  await page.evaluate(() => window.GAME.sigTrick('sit', 0));
  assert.equal((await hund()).moenter, moenter, 'man kan ikke trykke sig til mønter');
  // Et nyt niveau undervejs i skolen popper toplisten op oven på arket
  await page.evaluate(() => document.querySelector('#toplisteArk').classList.remove('on'));
  await page.click('#skoleLuk');
  assert.equal(await page.locator('#skole.on').isVisible(), false);
}

/* ---------- Butikken ---------- */
{
  await lukArk();
  await page.click('#butikBtn');
  assert.equal(await page.locator('#butik.on').isVisible(), true, 'butikken glider op');
  const varer = await page.locator('.vare').count();
  assert.ok(varer >= 15, `der er noget at vælge imellem (${varer} ting)`);

  await page.evaluate(() => { window.GAME.hund.moenter = 5; window.GAME.opdater(); });
  await page.click('.vare[data-ting="hat-krone"]');
  assert.equal((await hund()).hat, null, 'kronen koster mere, end man har');
  assert.match(await page.locator('#besked').textContent(), /mangler/);

  await page.evaluate(() => { window.GAME.hund.moenter = 200; window.GAME.opdater(); });
  await page.click('.vare[data-ting="hat-krone"]');
  const efterKoeb = await hund();
  assert.equal(efterKoeb.hat, 'hat-krone', 'kronen er købt og taget på');
  assert.equal(efterKoeb.moenter, 70, 'og betalt (200 − 130)');
  await page.screenshot({ path: SHOTS + 'hund-butik.png' });
  await page.click('.vare[data-ting="hat-krone"]');
  assert.equal((await hund()).hat, null, 'et tryk mere tager den af igen');
  await page.click('.vare[data-ting="hat-krone"]');
  await page.click('.vare[data-ting="pels-gylden"]');
  assert.equal((await hund()).pels, 'pels-gylden', 'pelsen kan skiftes');
  await page.click('#butikLuk');
  assert.equal(await page.locator('#butik.on').isVisible(), false, 'butikken kan lukkes igen');
}

/* ---------- Nyt niveau ryger på toplisten ---------- */
{
  await lukArk();
  await page.evaluate(() => {
    const h = window.GAME.hund;
    h.xp = 29;              // ét point fra niveau 2 (xpTilNiveau(2) = 30)
    h.behov.mad = 10;
    window.GAME.opdater();
  });
  await page.click('#madBtn');
  await tik(10);
  assert.equal(await page.evaluate(() => window.GAME.niveau()), 2, 'hunden er steget et niveau');
  assert.equal(await page.locator('#toplisteArk.on').isVisible(), true, 'toplisten popper op ved nyt niveau');
  assert.match(await page.locator('#hsTitel').textContent(), /Niveau 2/);

  await page.waitForSelector('#hsPanel .hs-input', { timeout: 4000 });
  await page.fill('#hsPanel .hs-input', 'Selma');
  await page.click('#hsPanel .hs-gem');
  await page.waitForFunction(() => /Selma/.test(document.getElementById('hsPanel').textContent), null, { timeout: 4000 });
  assert.deepEqual(sendte, [{ navn: 'Selma', score: 2 }], 'niveauet sendes til toplisten');
  assert.equal(await page.evaluate(() => localStorage.getItem('zydy.navn')), 'Selma', 'navnet huskes til de andre spil');
  await page.screenshot({ path: SHOTS + 'hund-topliste.png' });
  await page.click('#hsLuk');
}

/* ---------- Hunden huskes – også at tiden går, mens man er væk ---------- */
{
  const foer = await hund();
  await page.evaluate(() => window.GAME.gemNu());
  // Skru uret tilbage i det gemte, så det ser ud som om, der er gået to timer
  await page.evaluate(() => {
    const g = JSON.parse(localStorage.getItem('zydy.hund.v1'));
    g.sidst -= 2 * 3600 * 1000;
    g.behov.tur = 90;
    localStorage.setItem('zydy.hund.v1', JSON.stringify(g));
    window.GAME.state.hund = null;   // ellers gemmer siden hen over vores pillede data, når den lukkes
  });
  await page.reload();
  await page.waitForFunction(() => !!window.GAME);
  await page.evaluate(() => window.GAME.pause());
  assert.equal(await page.locator('#start.on').isVisible(), true, 'man lander på startskærmen');
  assert.match(await page.locator('#startTekst').textContent(), /Trofast/, 'startskærmen hilser fra hunden');
  assert.match(await page.locator('#startPill').textContent(), /Niveau 2/, 'niveauet er husket');
  assert.equal(await page.locator('#fortsaetBtn').isVisible(), true, 'man kan gå direkte tilbage til hunden');

  await page.click('#fortsaetBtn');
  const h = await hund();
  assert.equal(h.navn, 'Trofast', 'det er den samme hund');
  assert.equal(h.pels, 'pels-gylden', 'med den pels, den fik i butikken');
  assert.deepEqual(h.ejer.sort(), ['hat-krone', 'pels-gylden'], 'og det købte er stadig købt');
  assert.equal(h.moenter, foer.moenter, 'mønterne er der også');
  assert.equal(h.tricks.sit, 100, 'og den kan stadig sit');
  assert.equal(h.meter, foer.meter, 'kilometertælleren står, hvor vi slap');
  assert.ok(h.behov.tur < 80 && h.behov.tur > 55, `den trænger til en tur efter to timer (${h.behov.tur.toFixed(0)})`);
}

/* ---------- Aktivitet meldt til forsiden ---------- */
assert.ok(api.log.aktivitet.some(a => a.spil === 'hund' && a.ny === true), 'spillet melder én start');

/* ---------- Passer på en iPad på tværs ---------- */
{
  const pad = await browser.newContext({ ...devices['iPad (gen 7) landscape'] });
  const p2 = await pad.newPage();
  await mockApi(p2);
  await p2.goto(`${BASE}/spil/hund/?seed=7`);
  await p2.waitForFunction(() => !!window.GAME);
  await p2.click('#adopterBtn');
  await p2.waitForTimeout(400);
  const knap = await p2.locator('#turBtn').boundingBox();
  assert.ok(knap.height >= 44, 'knapperne er store nok til en finger');
  assert.ok(await p2.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'ingen vandret scroll på iPad');
  await p2.screenshot({ path: SHOTS + 'hund-ipad.png' });
  await pad.close();
}

/* ---------- Ingen vandret scroll, ingen fejl ---------- */
assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'ingen vandret scroll');
assert.deepEqual(errors, [], 'ingen console-fejl');
await browser.close();
console.log('OK hund');
