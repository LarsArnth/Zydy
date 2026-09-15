// Forsiden zydy.dk: navnet der huskes, "Mangler der noget?" under hvert kort og
// "Nyt spil?"-kortet nederst (public/ideer.js + src/ideer.mjs).
//
// Kør:  PLAYWRIGHT=/Users/lars/Projekter/DungeonCrawler/node_modules/playwright/index.mjs node test/forside.test.mjs
// (kræver at en lokal server kører: python3 -m http.server 4185 -d public)
import assert from 'node:assert/strict';
import { mockApi } from './api-mock.mjs';
const { chromium, devices } = await import(process.env.PLAYWRIGHT ?? 'playwright');
const BASE = process.env.BASE ?? 'http://localhost:4185';
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 13'] });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
const api = await mockApi(page, { scores: [{ spil: 'taarn', navn: 'Simon', score: 42 }] });

await page.goto(`${BASE}/`);

/* ---------- Første besøg: siden spørger om navnet ---------- */
await page.waitForSelector('.id-dlg[open]', { timeout: 3000 });
assert.match(await page.locator('.id-titel').textContent(), /Hvem spiller/, 'navnet spørges ved første besøg');
await page.screenshot({ path: '/Users/lars/Projekter/Zydy/test/shots/forside-navn.png' });

await page.fill('.id-input', 'Sofie');
await page.click('.id-send');
await page.waitForSelector('.id-dlg[open]', { state: 'hidden' });

assert.equal(await page.evaluate(() => localStorage.getItem('zydy.navn')), 'Sofie',
  'navnet gemmes under den nøgle spillenes toplister læser');
assert.match(await page.locator('#navnKnap').textContent(), /Hej Sofie/, 'navnet står i toppen');

/* ---------- Ønske til et spil ---------- */
const taarn = page.locator('li[data-spil="taarn"]');
assert.equal(await page.locator('#apps li[data-spil] .id-oenske').count(),
  await page.locator('#apps li[data-spil]').count(), 'hvert spilkort har en ønske-knap');

await taarn.locator('.id-oenske').click();
await page.waitForSelector('.id-dlg[open]');
assert.match(await page.locator('.id-titel').textContent(), /Mangler der noget i Tårn/);
assert.match(await page.locator('.id-fra').textContent(), /Fra Sofie/, 'navnet er kendt og skal ikke skrives igen');
await page.fill('.id-tekst', 'Der mangler en knap til at starte forfra uden at gå tilbage.');
await page.screenshot({ path: '/Users/lars/Projekter/Zydy/test/shots/forside-oenske.png' });
await page.click('.id-send');
await page.waitForSelector('.id-titel:text("Tak!")');

assert.equal(api.ideer.rows.length, 1);
assert.deepEqual({ ...api.ideer.rows[0], id: 0, oprettet: 0 }, {
  id: 0, oprettet: 0, slags: 'oenske', spil: 'taarn', navn: 'Sofie',
  tekst: 'Der mangler en knap til at starte forfra uden at gå tilbage.',
});
await page.click('.id-send');                       // "Luk"
await page.waitForSelector('.id-dlg[open]', { state: 'hidden' });

/* ---------- KlaverLær skal ikke bruge e-mail (Livas ønske #45) ---------- */
// KlaverLær beder om en kode på mail, når man ikke er hjemme, og det kan et
// barn ikke komme videre fra. Kortet siger det nu ærligt i mærkatet, og lige
// under sidder en grøn genvej til Klaverregn — klaveret her på sitet, som
// aldrig spørger om login eller mail.
{
  const klaver = page.locator('li[data-spil="klaver"]');
  assert.match(await klaver.locator('.tag').textContent(), /kode på mail/i,
    'mærkatet fortæller, at der skal en kode på mail til, når man er ude');
  const genvej = klaver.locator('a.alt');
  assert.equal(await genvej.count(), 1, 'KlaverLær-kortet har en genvej uden login');
  assert.match(await genvej.textContent(), /Uden login og mail.*Klaverregn/,
    'genvejen siger, hvad den er, og hvor den fører hen');
  assert.equal(await genvej.getAttribute('href'), '/spil/klaverregn/');
  assert.ok(await genvej.isVisible(), 'genvejen kan ses');
}

/* ---------- Idé til et helt nyt spil ---------- */
const nyt = page.locator('#nytSpilKort');
assert.equal(await nyt.isVisible(), true, '"Nyt spil?"-kortet står nederst');
assert.ok(await page.evaluate(() => {
  const ul = document.getElementById('apps').getBoundingClientRect();
  return document.getElementById('nytSpilKort').getBoundingClientRect().top >= ul.bottom - 1;
}), 'kortet ligger under alle spilkortene');

await nyt.click();
await page.waitForSelector('.id-dlg[open]');
assert.match(await page.locator('.id-titel').textContent(), /nyt spil/i);
await page.fill('.id-tekst', 'Et spil hvor man fanger faldende stjerner med en kurv, og det går hurtigere og hurtigere.');
await page.click('.id-send');
await page.waitForSelector('.id-titel:text("Tak!")');

assert.equal(api.ideer.rows.length, 2);
assert.equal(api.ideer.rows[1].slags, 'nyt');
assert.equal(api.ideer.rows[1].spil, null, 'en idé til et nyt spil hører ikke til et spil');
assert.equal(api.ideer.rows[1].navn, 'Sofie');
await page.click('.id-send');
await page.waitForSelector('.id-dlg[open]', { state: 'hidden' });
await page.screenshot({ path: '/Users/lars/Projekter/Zydy/test/shots/forside.png', fullPage: true });

/* ---------- Navnet huskes til næste besøg og kan skiftes ---------- */
await page.reload();
await page.waitForTimeout(800);
assert.equal(await page.locator('.id-dlg[open]').count(), 0, 'der spørges ikke om navn igen');
assert.match(await page.locator('#navnKnap').textContent(), /Hej Sofie/);

await page.click('#navnKnap');
await page.waitForSelector('.id-dlg[open]');
assert.equal(await page.inputValue('.id-input'), 'Sofie', 'det gamle navn står klar');
await page.fill('.id-input', 'Simon');
await page.click('.id-send');
await page.waitForSelector('.id-dlg[open]', { state: 'hidden' });
assert.equal(await page.evaluate(() => localStorage.getItem('zydy.navn')), 'Simon');
assert.match(await page.locator('#navnKnap').textContent(), /Hej Simon/);

/* ---------- Hvem er her lige nu ---------- */
// Forsiden melder sig selv til ligesom spillene, så man tæller med, selv om man
// bare står og kigger – og navnet følger med, så de andre kan se hvem det er.
/** Venter (højst 5 sek.) på noget her i Node – fx at et kald er nået frem til mocken. */
const vent = async (naar, hvad) => {
  for (let i = 0; i < 100 && !naar(); i++) await page.waitForTimeout(50);
  assert.ok(naar(), hvad);
};
await vent(() => api.log.aktivitet.some(a => a.spil === 'forsiden' && a.ny === true),
  'forsiden tæller sig selv med som "her nu"');
await vent(() => api.log.aktivitet.some(a => a.spil === 'forsiden' && a.navn === 'Simon'),
  'det nye navn sendes med det samme, ikke først om 30 sekunder');

// Er man alene, står der som før bare "Tryk på et spil" – man er ikke gæst hos sig selv.
assert.equal(await page.locator('#undertekst').textContent(), 'Tryk på et spil for at spille');

// To andre dukker op: Selma spiller Tårn, og en gæst uden navn står på forsiden.
const nu = Date.now();
await api.akt.markerAktiv('klientselma', 'taarn', nu, 'Selma');
await api.akt.markerAktiv('klientgaest', 'forsiden', nu, null);
await page.evaluate(() => document.dispatchEvent(new CustomEvent('zydy:aktivitet')));
await page.waitForFunction(() => /er her nu/.test(document.getElementById('undertekst').textContent));

assert.equal(await page.locator('#undertekst').textContent(), 'Selma og 1 mere er her nu',
  'den navnløse gæst tæller med, men har intet navn at vise');
assert.equal(await page.locator('li[data-spil="taarn"] .m.nu').textContent(), 'Selma spiller nu');
await page.screenshot({ path: '/Users/lars/Projekter/Zydy/test/shots/forside-hvem-er-her.png' });

/* ---------- En gæst der ikke vil skrive navn, får lov at være i fred ---------- */
{
  const ctx2 = await browser.newContext({ ...devices['iPhone 13'] });
  const p2 = await ctx2.newPage();
  await mockApi(p2);
  await p2.goto(`${BASE}/`);
  await p2.waitForSelector('.id-dlg[open]');
  await p2.click('.id-fortryd');
  await p2.waitForSelector('.id-dlg[open]', { state: 'hidden' });
  assert.match(await p2.locator('#navnKnap').textContent(), /Hvem spiller/, 'knappen opfordrer stadig');
  await p2.reload();
  await p2.waitForTimeout(800);
  assert.equal(await p2.locator('.id-dlg[open]').count(), 0, 'der spørges ikke igen efter et nej');

  // Men skriver man et ønske uden navn, spørges der først – ellers ved vi ikke hvem det er fra.
  await p2.locator('li[data-spil="dybet"] .id-oenske').click();
  await p2.waitForSelector('.id-dlg[open]');
  assert.match(await p2.locator('.id-titel').textContent(), /Hvad hedder du/);
  await p2.fill('.id-input', 'Far');
  await p2.click('.id-send');
  await p2.waitForSelector('.id-tekst');
  assert.match(await p2.locator('.id-titel').textContent(), /Mangler der noget i Dybet/, 'ønsket fortsætter bagefter');
  await ctx2.close();
}

/* ---------- Ingen vandret scroll, ingen fejl ---------- */
assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'ingen vandret scroll');
assert.deepEqual(errors, [], 'ingen console-fejl');
await browser.close();
console.log('OK forside');
