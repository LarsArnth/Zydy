// Kør:  PLAYWRIGHT=/Users/lars/Projekter/DungeonCrawler/node_modules/playwright/index.mjs node test/legebyen.test.mjs
// (kræver at en lokal server kører: python3 -m http.server 4186 -d public)
//
// Leger Legebyen igennem: hjælpen første gang → gå fra rum til rum → giv mad,
// hat og legetøj → træk figurerne rundt og sæt dem på møblerne → tasken, der
// tager ting med videre → klæd på → og at hele byen står der efter en
// genindlæsning. API'erne kører i hukommelsen (test/api-mock.mjs).
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

const api = await mockApi(page);
await page.goto(`${BASE}/spil/legebyen/?seed=5`);
await page.waitForFunction(() => !!window.GAME);

const by = () => page.evaluate(() => window.GAME.by);
const state = () => page.evaluate(() => window.GAME.state);
const besked = () => page.locator('#besked').textContent();
// Som spillets egen løkke: lad tiden gå i små trin og tegn bagefter.
const tik = (sek, trin = 1 / 60) => page.evaluate(([sek, trin]) => {
  for (let t = 0; t < sek; t += trin) window.GAME.tik(trin);
  window.GAME.tegn();
}, [sek, trin]);

/** Et punkt i rummets egne enheder om til et sted på skærmen. */
async function paa(x, y) {
  const boks = await page.locator('#laerred').boundingBox();
  const p = await page.evaluate(([x, y]) => window.GAME.tilSkaerm(x, y), [x, y]);
  return { x: boks.x + p.x, y: boks.y + p.y };
}
const tryk = async (x, y) => { const p = await paa(x, y); await page.mouse.click(p.x, p.y); };
async function traek(fra, til) {
  const a = await paa(fra[0], fra[1]), b = await paa(til[0], til[1]);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 10 });
  await page.mouse.up();
}
/** Figurens egen plads i rummet – dér hvor man kan trykke på den. */
const figur = async id => {
  const f = await page.evaluate(i => window.GAME.figur(i), id);
  return [f.x, f.y - 14];
};

/* ---------- Hjælpen står der første gang ---------- */
assert.equal(await page.locator('#hjaelpArk.on').isVisible(), true, 'hjælpen vises ved første besøg');
await page.screenshot({ path: SHOTS + 'legebyen-hjaelp.png' });
await page.click('#hjaelpOk');
assert.equal(await page.locator('#hjaelpArk.on').isVisible(), false, 'og kan lukkes igen');
assert.equal(await page.evaluate(() => localStorage.getItem('zydy.legebyen.hjaelp')), '1', 'den huskes, så den ikke står der hver gang');
await page.evaluate(() => window.GAME.pause());     // vi styrer selv tiden herfra

/* ---------- Stuen: fem rum at gå imellem ---------- */
assert.equal(await page.locator('.steder button').count(), 5, 'der er fem rum');
assert.equal((await by()).sted, 'stue');
assert.match(await page.locator('.steder button.on').textContent(), /Stuen/);
{
  const f = await by();
  assert.equal(f.figurer.mig.sted, 'stue', 'man selv står i stuen');
  assert.equal(f.figurer.zak.sted, 'legeplads', 'og vennerne er spredt ud i byen');
}
await tik(1);
await page.screenshot({ path: SHOTS + 'legebyen.png' });

/* ---------- Tryk på en figur: den siger noget. Tryk igen: klæd den på ---------- */
{
  await tryk(...await figur('noah'));
  assert.equal((await state()).valgt, 'noah', 'figuren er valgt');
  assert.equal((await state()).bobler.length, 1, 'og siger noget i en taleboble');
  assert.equal(await page.locator('#toejBtn').isDisabled(), false, '«klæd på» er nu til at trykke på');
  await tik(.3);

  await tryk(...await figur('noah'));
  assert.equal(await page.locator('#toejArk.on').isVisible(), true, 'andet tryk åbner tøjet');
  await page.click('#toejValg .farve[data-felt="troeje"][data-nr="3"]');
  assert.equal((await by()).figurer.noah.troeje, 3, 'trøjen skiftede farve');
  await page.click('#toejValg .stil[data-felt="haar"]:nth-child(3)');
  assert.equal((await by()).figurer.noah.haar, 'krølle', 'og frisuren');
  await page.screenshot({ path: SHOTS + 'legebyen-toej.png' });
  await page.click('#toejFaerdig');
  assert.equal(await page.locator('#toejArk.on').isVisible(), false);
}

/* ---------- Møblerne: fjernsynet tænder ---------- */
{
  await tryk(108, 54);
  assert.equal((await by()).taendt.tv, true, 'fjernsynet er tændt');
  assert.match(await besked(), /Fjernsynet/);
  await tryk(108, 54);
  assert.equal((await by()).taendt.tv, false, 'og slukkes igen');
  await tryk(108, 54);
}

/* ---------- Træk en figur hen i sofaen ---------- */
{
  const sofa = (await by()).figurer.mig;
  await traek([sofa.x, sofa.y - 14], [42, 74]);
  const f = (await by()).figurer.mig;
  assert.equal(f.saede, 'sofa-v', 'figuren satte sig i sofaen');
  assert.equal(f.x, 42, 'og sidder præcis på pladsen');
  await tik(.5);
}

/* ---------- Bolden på gulvet kommer i tasken ---------- */
{
  const bold = (await by()).ting.find(t => t.sted === 'stue' && t.id === 'bold');
  assert.ok(bold, 'der ligger en bold i stuen fra begyndelsen');
  await tryk(bold.x, bold.y - 4);
  assert.deepEqual((await by()).taske, ['bold'], 'bolden kom i tasken');
  assert.match(await besked(), /tasken/i);
  await page.click('#faner [data-fane="taske"]');
  assert.equal(await page.locator('.chip[data-taske="bold"]').count(), 1, 'og står i tasken i bakken');
  assert.match(await page.locator('#faner [data-fane="taske"]').textContent(), /1\/6/);
}

/* ---------- Køkkenet: mad fra hylden og fra køleskabet ---------- */
{
  await page.click('.steder button:nth-child(2)');
  assert.equal((await by()).sted, 'koekken');
  await page.click('#faner [data-fane="ting"]');
  assert.ok(await page.locator('.chip[data-ting="aeble"]').count(), 'æblet står i bakken i køkkenet');

  // Tryk på æblet og så på Liv: hun spiser det
  await page.click('.chip[data-ting="aeble"]');
  assert.equal(await page.locator('#hint').isVisible(), true, 'der står, hvad man skal gøre nu');
  const foer = (await by()).ting.length;
  await tryk(...await figur('liv'));
  assert.match(await besked(), /Liv spiser æble/, 'Liv spiser æblet');
  assert.equal((await by()).ting.length, foer, 'og maden bliver ikke liggende bagefter');
  assert.equal((await state()).valgtTing, null, 'hånden er tom igen');
  assert.equal(await page.locator('#hint').isVisible(), false);
  await tik(.4);

  // Tryk på æblet og så på gulvet: det ligger dér
  await page.click('.chip[data-ting="aeble"]');
  await tryk(60, 80);
  const lagt = (await by()).ting.filter(t => t.sted === 'koekken' && t.id === 'aeble');
  assert.ok(lagt.some(t => Math.abs(t.x - 60) < 2), 'æblet ligger, hvor man trykkede');

  // Køleskabet giver noget frem
  const foerKoel = (await by()).ting.filter(t => t.sted === 'koekken').length;
  await tryk(20, 54);
  assert.equal((await by()).ting.filter(t => t.sted === 'koekken').length, foerKoel + 1, 'der kom noget ud af køleskabet');
  assert.match(await besked(), /køleskabet/i);
  await tik(.5);
  await page.screenshot({ path: SHOTS + 'legebyen-koekken.png' });
}

/* ---------- Tasken tager bolden med ind i køkkenet ---------- */
{
  await page.click('#faner [data-fane="taske"]');
  await page.click('.chip[data-taske="bold"]');
  await tryk(...await figur('liv'));
  assert.equal((await by()).figurer.liv.haand, 'bold', 'Liv har fået bolden i hånden');
  assert.deepEqual((await by()).taske, [], 'og tasken er tom igen');
}

/* ---------- Badeværelset: vandet, badekarret og sæben ---------- */
{
  await page.click('.steder button:nth-child(3)');
  assert.equal((await by()).sted, 'bad');
  await tryk(46, 42);
  assert.equal((await by()).taendt.bruser, true, 'vandet løber');
  assert.match(await besked(), /vandet/i);

  // Hent Noah herind og sæt ham i badekarret
  await page.click('#faner [data-fane="venner"]');
  await page.click('.chip[data-figur="noah"]');
  assert.equal((await by()).figurer.noah.sted, 'bad');
  const noah = (await by()).figurer.noah;
  await traek([noah.x, noah.y - 14], [46, 73]);
  assert.equal((await by()).figurer.noah.saede, 'kar', 'Noah sidder i badekarret');

  await page.click('#faner [data-fane="ting"]');
  await page.click('.chip[data-ting="saebe"]');
  await tryk(...await figur('noah'));
  assert.match(await besked(), /Noah bliver helt ren/, 'sæben gør ham ren');
  assert.equal((await state()).gnister.some(g => g.slags === 'boble'), true, 'og der kommer sæbebobler');
  await tik(.5);
  await page.screenshot({ path: SHOTS + 'legebyen-bad.png' });

  await tryk(122, 46);
  assert.match(await besked(), /godt ud/, 'spejlet siger noget pænt');
  await traek([46, 73], [120, 80]);                   // op af karret igen
  assert.equal((await by()).figurer.noah.saede, null, 'op af karret igen');
}

/* ---------- Butikken: hat på Bedste, og hun sætter sig på bænken ---------- */
{
  await page.click('.steder button:nth-child(4)');
  assert.equal((await by()).sted, 'butik');
  await page.click('#faner [data-fane="ting"]');
  await page.click('.chip[data-ting="krone"]');
  await tryk(...await figur('bedste'));
  assert.equal((await by()).figurer.bedste.hat, 'krone', 'Bedste har fået kronen på');

  // Solbrillerne oveni – og den gamle hat bliver ikke væk
  await page.click('.chip[data-ting="solbriller"]');
  await tryk(...await figur('bedste'));
  assert.equal((await by()).figurer.bedste.briller, 'solbriller');
  await page.click('.chip[data-ting="kasket"]');
  await tryk(...await figur('bedste'));
  assert.equal((await by()).figurer.bedste.hat, 'kasket', 'kasketten erstattede kronen');
  assert.ok((await by()).ting.some(t => t.sted === 'butik' && t.id === 'krone'), 'og kronen ligger på gulvet i butikken');

  const baenk = (await by()).figurer.bedste;
  await traek([baenk.x, baenk.y - 14], [20, 76]);
  assert.equal((await by()).figurer.bedste.saede, 'baenk', 'Bedste hviler på bænken');
  await tik(.6);
  await page.screenshot({ path: SHOTS + 'legebyen-butik.png' });
}

/* ---------- Vennerne kan hentes ind i rummet ---------- */
{
  await page.click('#faner [data-fane="venner"]');
  assert.equal(await page.locator('.chip[data-figur]').count(), 6, 'alle seks står i bakken');
  await page.click('.chip[data-figur="zak"]');
  assert.equal((await by()).figurer.zak.sted, 'butik', 'Zak kom ind i butikken');
  assert.match(await besked(), /Zak kom ind/);
  assert.equal((await state()).valgt, 'zak');
  await tik(.4);
}

/* ---------- Legepladsen: op i gyngen og ned ad rutsjebanen ---------- */
{
  await page.click('.steder button:nth-child(5)');
  assert.equal((await by()).sted, 'legeplads');
  const vaks = (await by()).figurer.vaks;
  assert.equal(vaks.sted, 'legeplads', 'Vaks er ude at lege');

  // Ingen i gyngen endnu
  await tryk(32, 64);
  assert.match(await besked(), /gyngen/i);

  await page.click('#faner [data-fane="venner"]');
  await page.click('.chip[data-figur="mig"]');       // hent mig selv herud
  const mig = (await by()).figurer.mig;
  await traek([mig.x, mig.y - 14], [32, 64]);
  assert.equal((await by()).figurer.mig.saede, 'gynge', 'jeg sidder i gyngen');
  // Når der sidder en i gyngen, dækker hun møblet – så er trykket på hende et skub
  await tryk(...await figur('mig'));
  assert.equal((await state()).anim.some(a => a.slags === 'gynge'), true, 'gyngen svinger');
  await tik(.6);
  await page.screenshot({ path: SHOTS + 'legebyen-legeplads.png' });

  // Op på rutsjebanen og ned igen
  await traek([32, 64], [104, 48]);
  assert.equal((await by()).figurer.mig.saede, 'rutsje', 'jeg sidder øverst på rutsjebanen');
  await tryk(...await figur('mig'));
  const efter = (await by()).figurer.mig;
  assert.equal(efter.saede, null, 'og ryger ned');
  assert.ok(efter.x > 104, 'ud for enden af banen');
  assert.equal((await state()).anim.some(a => a.slags === 'rutsje'), true, 'turen ned animeres');
  await tik(1);
}

/* ---------- Ryd op ---------- */
{
  await page.click('.steder button:nth-child(4)');
  assert.ok((await by()).ting.filter(t => t.sted === 'butik').length > 0, 'der ligger noget i butikken');
  await page.click('#rydBtn');
  assert.equal((await by()).ting.filter(t => t.sted === 'butik').length, 0, 'nu er der ryddet op');
  assert.match(await besked(), /ryddet/);
  await page.click('#rydBtn');
  assert.match(await besked(), /ryddeligt/, 'og der er ikke mere at rydde');
}

/* ---------- Alt står der efter en genindlæsning ---------- */
{
  const foer = await by();
  await page.evaluate(() => window.GAME.gemNu());
  await page.reload();
  await page.waitForFunction(() => !!window.GAME);
  await page.evaluate(() => window.GAME.pause());
  assert.equal(await page.locator('#hjaelpArk.on').isVisible(), false, 'hjælpen kommer ikke igen');
  const nu = await by();
  assert.equal(nu.sted, foer.sted, 'man er i det samme rum');
  assert.equal(nu.figurer.bedste.hat, 'kasket', 'kasketten sidder der endnu');
  assert.equal(nu.figurer.bedste.saede, 'baenk', 'Bedste sidder stadig på bænken');
  assert.equal(nu.figurer.noah.troeje, 3, 'Noahs trøje er den, vi valgte');
  assert.equal(nu.figurer.liv.haand, 'bold', 'Liv har stadig bolden');
  assert.equal(nu.figurer.zak.sted, 'butik', 'Zak er blevet i butikken');
  assert.equal(nu.taendt.tv, true, 'og fjernsynet kører stadig i stuen');
}

/* ---------- Aktivitet meldt til forsiden ---------- */
assert.ok(api.log.aktivitet.some(a => a.spil === 'legebyen' && a.ny === true), 'spillet melder én start');

/* ---------- Passer på en iPad på tværs ---------- */
{
  const pad = await browser.newContext({ ...devices['iPad (gen 7) landscape'] });
  const p2 = await pad.newPage();
  await mockApi(p2);
  await p2.goto(`${BASE}/spil/legebyen/?seed=5`);
  await p2.waitForFunction(() => !!window.GAME);
  await p2.click('#hjaelpOk');
  await p2.waitForTimeout(400);
  const knap = await p2.locator('#rydBtn').boundingBox();
  assert.ok(knap.height >= 44, 'knapperne er store nok til en finger');
  const rum = await p2.locator('#rum').boundingBox();
  assert.ok(rum.height > 200, 'rummet fylder stadig noget på en iPad');
  assert.ok(await p2.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'ingen vandret scroll på iPad');
  await p2.screenshot({ path: SHOTS + 'legebyen-ipad.png' });
  await pad.close();
}

/* ---------- Ingen vandret scroll, ingen fejl ---------- */
assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'ingen vandret scroll');
assert.deepEqual(errors, [], 'ingen console-fejl');
await browser.close();
console.log('OK legebyen');
