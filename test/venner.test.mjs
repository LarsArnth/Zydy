// Venner på forsiden af zydy.dk (public/venner.js + src/venner.mjs): spørg en,
// sig ja, se hvem der er her lige nu, og fjern en ven igen.
//
// Kør:  PLAYWRIGHT=/Users/lars/Projekter/DungeonCrawler/node_modules/playwright/index.mjs node test/venner.test.mjs
// (kræver at en lokal server kører: python3 -m http.server 4185 -d public)
//
// Den anden part (Selma, Simon) spilles af testen selv: vi kalder venne-lageret
// i mocken direkte, ligesom forside-testen lader andre dukke op i aktiviteten.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { mockApi } from './api-mock.mjs';
const { chromium, devices } = await import(process.env.PLAYWRIGHT ?? 'playwright');
const BASE = process.env.BASE ?? 'http://localhost:4185';
const shots = path.join(path.dirname(fileURLToPath(import.meta.url)), 'shots');

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 13'] });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

// Selma og Simon er kendt af siden, fordi de står på toplisterne.
const api = await mockApi(page, {
  scores: [{ spil: 'taarn', navn: 'Selma', score: 42 }, { spil: 'dybet', navn: 'Simon', score: 5 }],
});

await page.goto(`${BASE}/`);

/* ---------- Uden navn kan man ikke have venner ---------- */
await page.waitForSelector('#venner .v-tom');
assert.match(await page.locator('#venner').textContent(), /Skriv dit navn/,
  'panelet forklarer, hvorfor der ikke er venner endnu');

// Navnet skrives i dialogen, siden selv åbner ved første besøg.
await page.waitForSelector('.id-dlg[open]');
await page.fill('.id-input', 'Sofie');
await page.click('.id-send');
await page.waitForSelector('#venner .v-kort:not(.v-tom)');
assert.match(await page.locator('#venner').textContent(), /Du har ingen venner her endnu/);

/* ---------- Den tomme liste siger, hvad man gør ---------- */
// Olivers ønske «Bliv venner» var et signal om, at funktionen var svær at finde:
// en ny spiller skal kunne spørge nogen uden først at gætte sig til en knap.
await page.waitForSelector('#venner .v-hurtig-navn');
assert.equal(await page.locator('#venner .v-find-stor').count(), 1, 'en stor knap, ikke kun mærket i hjørnet');
assert.deepEqual((await page.locator('#venner .v-hurtig-navn').allTextContents()).slice().sort(),
  ['Selma', 'Simon'], 'navnene kan trykkes direkte i panelet');
await page.screenshot({ path: path.join(shots, 'venner-tom.png') });

await page.locator('#venner .v-hurtig-navn', { hasText: 'Simon' }).click();
await page.waitForSelector('#venner .v-besked-linje:text-matches("Vi har spurgt Simon")');
assert.match(await page.locator('#venner .v-besked-linje').textContent(),
  /Simon skal sige ja, før I er venner/, 'man får at vide, hvad der nu sker');
assert.match(await page.locator('#venner .v-venter').textContent(), /Venter på svar fra Simon/);

// … og man kan fortryde igen. Uden den knap blev et navn, man havde stavet
// forkert, stående for evigt – ingen kunne svare på det, og pladsen var optaget.
await page.click('#venner .v-sendt .v-fortryd');
await page.waitForFunction(() => document.querySelectorAll('#venner .v-sendt').length === 0);
assert.deepEqual(api.venner.rows, [], 'spørgsmålet er væk igen');

/* ---------- Find en ven og spørg ---------- */
// Simon er på zydy.dk lige nu, så han skal stå først dér, hvor man leder.
await api.akt.markerAktiv('klientsimon', 'forsiden', Date.now(), 'Simon');
await page.evaluate(() => document.dispatchEvent(new CustomEvent('zydy:aktivitet')));
await page.waitForFunction(() => window.Venner.forslagFor('').some(f => f.online));

await page.click('.v-find');
await page.waitForSelector('.v-forslag');
assert.deepEqual(await page.locator('.v-forslag-navn').allTextContents(), ['Simon', 'Selma'],
  'dem vi har set på siden foreslås, og den der er her nu står først');
assert.ok(await page.locator('.v-forslag-navn').first().evaluate(b => b.classList.contains('online')));

// Man skal kunne finde en ven uden at kunne stave – børnene kan ikke.
await page.fill('.v-input', 'sim');
await page.waitForFunction(() => document.querySelectorAll('.v-forslag-navn').length === 1);
assert.deepEqual(await page.locator('.v-forslag-navn').allTextContents(), ['Simon'], 'begyndelsen er nok');
await page.fill('.v-input', 'selmq');
await page.waitForFunction(() =>
  document.querySelectorAll('.v-forslag-navn').length === 1
  && document.querySelector('.v-forslag-navn').textContent === 'Selma');
assert.deepEqual(await page.evaluate(() => window.Venner.forslagFor('SELMA ').map(f => f.navn)), ['Selma'],
  'store bogstaver og et mellemrum for meget er den samme person');
await page.fill('.v-input', '');
await page.waitForFunction(() => document.querySelectorAll('.v-forslag-navn').length === 2);
await page.screenshot({ path: path.join(shots, 'venner-find.png') });

await page.locator('.v-forslag-navn', { hasText: 'Selma' }).click();
await page.waitForSelector('.id-status:text-matches("Vi har spurgt Selma")');
assert.match(await page.locator('.v-dlg .id-status').textContent(),
  /Selma skal sige ja, før I er venner/, 'der står, at den anden skal sige ja');
assert.deepEqual(api.venner.rows.map(r => [r.fra, r.til, r.svaret]), [['sofie', 'selma', null]],
  'spørgsmålet er gemt, men der er ikke svaret endnu');
await page.click('.v-dlg .id-send');                       // "Luk"
await page.waitForSelector('.v-dlg[open]', { state: 'hidden' });
assert.match(await page.locator('#venner .v-venter').textContent(), /Venter på svar fra Selma/);

/* ---------- Selma siger ja ---------- */
await api.venner.sigJa('sofie', 'selma', 'Selma');
await page.evaluate(() => window.Venner.hent());
await page.waitForSelector('#venner .v-ven');
assert.equal(await page.locator('#venner .v-navn').textContent(), 'Selma');
assert.equal(await page.locator('#venner .v-hvor').textContent(), 'ikke her nu');
assert.equal(await page.locator('#venner .v-venter').count(), 0, 'der ventes ikke længere på svar');

/* ---------- … og dukker op i et spil ---------- */
await api.akt.markerAktiv('klientselma', 'obby', Date.now(), 'Selma');
await page.evaluate(() => document.dispatchEvent(new CustomEvent('zydy:aktivitet')));
await page.waitForSelector('#venner .v-ven.online');
assert.equal(await page.locator('#venner .v-hvor').textContent(), 'spiller Obby');
await page.screenshot({ path: path.join(shots, 'venner.png') });

await page.click('#venner .v-ven');
await page.waitForSelector('.v-dlg[open]');
assert.match(await page.locator('.v-dlg .id-under').textContent(), /Selma spiller Obby lige nu/);
assert.equal(await page.locator('.v-spil-med').getAttribute('href'), '/spil/obby/',
  'man kan hoppe med ind i det spil, vennen er i gang med');

/* ---------- Selma får et kælenavn ---------- */
await page.fill('.v-kaele-input', 'Smølfen');
await page.click('.v-kaele-gem');
await page.waitForSelector('.v-kaele-status:text-matches("Selma nu Smølfen")');
assert.equal(await page.locator('.v-dlg .id-titel').textContent(), 'Smølfen', 'dialogen bruger kælenavnet');
assert.equal(await page.locator('.v-rigtigt-navn').textContent(), 'hedder egentlig Selma',
  'man kan stadig se, hvem det er');
assert.match(await page.locator('.v-dlg .id-under').textContent(), /Smølfen spiller Obby lige nu/);
await page.screenshot({ path: path.join(shots, 'venner-kaelenavn.png') });
await page.click('.v-dlg .id-send');                       // "Luk"
await page.waitForSelector('.v-dlg[open]', { state: 'hidden' });

assert.equal(await page.locator('#venner .v-navn').textContent(), 'Smølfen', 'brikken hedder kælenavnet');
assert.equal(await page.locator('#venner .v-hvor').textContent(), 'Selma · spiller Obby',
  'det rigtige navn står småt nedenunder');

// Kælenavnet gælder også de andre steder på forsiden, hvor vennen nævnes.
await page.evaluate(() => document.dispatchEvent(new CustomEvent('zydy:aktivitet')));
await page.waitForFunction(() => /Smølfen/.test(document.getElementById('undertekst').textContent));
assert.equal(await page.locator('li[data-spil="obby"] .m.nu').textContent(), 'Smølfen spiller nu');

// … men det er mit eget navn til hende: det er gemt her på telefonen, ikke sendt op.
assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('zydy.kaelenavne'))),
  { sofie: { selma: 'Smølfen' } }, 'kælenavnet er gemt under den, der har givet det');
assert.ok(api.venner.rows.every(r => !JSON.stringify(r).includes('Smølfen')), 'intet kælenavn i databasen');

// Det holder en genindlæsning ud, og kan fjernes igen med et tomt felt.
await page.reload();
await page.waitForSelector('#venner .v-ven');
assert.equal(await page.locator('#venner .v-navn').textContent(), 'Smølfen', 'kælenavnet huskes');
await page.click('#venner .v-ven');
await page.waitForSelector('.v-dlg[open]');
assert.equal(await page.inputValue('.v-kaele-input'), 'Smølfen', 'feltet står med det, der er givet');
await page.fill('.v-kaele-input', '   ');
await page.click('.v-kaele-gem');
await page.waitForSelector('.v-kaele-status:text-matches("væk igen")');
assert.equal(await page.locator('.v-dlg .id-titel').textContent(), 'Selma');
await page.click('.v-dlg .id-send');                       // "Luk"
await page.waitForSelector('.v-dlg[open]', { state: 'hidden' });
assert.equal(await page.locator('#venner .v-navn').textContent(), 'Selma');

/* ---------- Simon spørger, og Sofie siger ja ---------- */
await api.venner.spoerg('simon', 'sofie', 'Simon', 'Sofie');
await page.evaluate(() => window.Venner.hent());
await page.waitForSelector('#venner .v-spoerg');
assert.match(await page.locator('.v-spoerg-tekst').textContent(), /Simon vil være din ven/);
assert.equal(await page.locator('#venner .v-maerke').textContent(), '1 vil være din ven',
  'et spørgsmål må ikke kunne overses – mærkatet står ved overskriften');
await page.screenshot({ path: path.join(shots, 'venner-spoergsmaal.png') });

await page.locator('.v-spoerg .v-vigtig').click();         // "Ja tak"
await page.waitForFunction(() => document.querySelectorAll('#venner .v-ven').length === 2);
assert.equal(await page.locator('#venner .v-spoerg').count(), 0, 'spørgsmålet er besvaret');
assert.ok(api.venner.rows.every(r => r.svaret), 'begge venskaber er nu sagt ja til');

/* ---------- Og en ven kan fjernes igen ---------- */
await page.locator('.v-ven', { hasText: 'Simon' }).click();
await page.waitForSelector('.v-dlg[open]');
await page.click('.v-dlg .id-fortryd');                    // "Fjern ven"
await page.waitForFunction(() => document.querySelectorAll('#venner .v-ven').length === 1);
assert.deepEqual(api.venner.rows.map(r => r.til), ['selma']);

/* ---------- En der ikke står på listen, kan skrives ind ---------- */
await page.click('.v-find');
await page.waitForSelector('.v-form');
await page.fill('.v-input', 'Far');
await page.click('.v-spoerg-knap');
await page.waitForSelector('.id-status:text-matches("Vi har spurgt Far")');
assert.ok(api.venner.rows.some(r => r.til === 'far' && !r.svaret), 'Far er spurgt');
assert.match(await page.locator('.v-dlg .id-status').textContent(), /aldrig set Far her før/,
  'et navn, vi aldrig har set, er som regel stavet forkert – og så siger vi det');
await page.click('.v-dlg .id-send');                       // "Luk"
await page.waitForSelector('.v-dlg[open]', { state: 'hidden' });
assert.match(await page.locator('#venner .v-venter').textContent(), /Venter på svar fra Far/);

/* ---------- Navnet skiftes: så er det en andens venner ---------- */
await page.click('#navnKnap');
await page.waitForSelector('.id-dlg[open]:not(.v-dlg)');
// Begge dialoger har et .id-input – navnefeltet er det i navne-dialogen.
await page.fill('.id-dlg:not(.v-dlg) .id-input', 'Simon');
await page.click('.id-dlg:not(.v-dlg) .id-send');
await page.waitForFunction(() => /ingen venner her endnu/.test(document.getElementById('venner').textContent),
  null, { timeout: 5000 });

/* ---------- Ingen vandret scroll, ingen fejl ---------- */
assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'ingen vandret scroll');
assert.deepEqual(errors, [], 'ingen console-fejl');
await browser.close();
console.log('OK venner');
