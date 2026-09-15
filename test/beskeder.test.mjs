// Skriv med en ven: to venner skriver sammen på forsiden fra hver sin telefon
// (public/beskeder.js + public/venner.js + src/beskeder.mjs).
//
// Kør:  PLAYWRIGHT=/Users/lars/Projekter/DungeonCrawler/node_modules/playwright/index.mjs node test/beskeder.test.mjs
// (kræver at en lokal server kører: python3 -m http.server 4185 -d public)
//
// Som test/rum.test.mjs har Sofie og Selma hver sit vindue med sit eget
// localStorage, men de deler API'et i hukommelsen (mockApi … { delMed }),
// præcis som de ville dele databasen i drift.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { mockApi } from './api-mock.mjs';
const { chromium, devices } = await import(process.env.PLAYWRIGHT ?? 'playwright');
const BASE = process.env.BASE ?? 'http://localhost:4185';
const shots = path.join(path.dirname(fileURLToPath(import.meta.url)), 'shots');

const browser = await chromium.launch();
const fejl = [];

/**
 * Et vindue med et navn i localStorage – som når man har skrevet det på forsiden.
 *
 * Uden service worker (som test/nyheder.test.mjs): her er der to forsider oppe
 * på én gang, og service workeren henter hele skallen ned i baggrunden ved hver
 * sideindlæsning. Tolv samtidige hentninger mod den lille testserver gav
 * ind imellem ERR_CONNECTION_RESET på den ene telefon, og så faldt testen på
 * «ingen console-fejl» uden at der var noget galt med beskederne. At filerne
 * lægger sig på telefonen, hører hjemme i test/offline.test.mjs.
 */
async function telefon(navn, delMed) {
  const ctx = await browser.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block' });
  const page = await ctx.newPage();
  page.on('pageerror', e => fejl.push(navn + ': ' + e));
  page.on('console', m => { if (m.type() === 'error') fejl.push(navn + ': ' + m.text()); });
  await page.addInitScript(n => { localStorage.setItem('zydy.navn', n); }, navn);
  const api = await mockApi(page, delMed ? { delMed } : {});
  return { page, api };
}

const sofie = await telefon('Sofie');
const selma = await telefon('Selma', sofie.api);
const api = sofie.api;

// De to er venner i forvejen – det er venskabet, der giver lov til at skrive.
await api.venner.spoerg('sofie', 'selma', 'Sofie', 'Selma');
await api.venner.sigJa('sofie', 'selma', 'Selma');

/** Oversigten hentes hvert 15. sekund i drift – i testen beder vi selv om den. */
const kig = async p => {
  await p.waitForFunction(() => !!window.Beskeder);     // scripts er indlæst
  return p.evaluate(() => window.Beskeder.hent());
};

await sofie.page.goto(`${BASE}/`);
await selma.page.goto(`${BASE}/`);

/* ---------- Sofie skriver til Selma ---------- */
await sofie.page.waitForSelector('#venner .v-ven');
await sofie.page.click('#venner .v-ven');
await sofie.page.waitForSelector('.v-dlg[open]');
assert.equal(await sofie.page.locator('.v-skriv').textContent(), '💬 Skriv til Selma');
await sofie.page.click('.v-skriv');

await sofie.page.waitForSelector('.b-dlg[open]');
assert.equal(await sofie.page.locator('.v-dlg[open]').count(), 0, 'venne-dialogen lukker, så de ikke ligger oven på hinanden');
await sofie.page.waitForSelector('.b-tom:text-matches("ikke skrevet sammen endnu")');

await sofie.page.fill('.b-input', 'Hej Selma! Er du der?');
await sofie.page.click('.b-send');
await sofie.page.waitForSelector('.b-besked.mig');
assert.equal(await sofie.page.locator('.b-besked .b-tekst').textContent(), 'Hej Selma! Er du der?');
assert.equal(await sofie.page.inputValue('.b-input'), '', 'feltet er tomt igen, så man kan skrive videre');
assert.deepEqual(api.beskeder.rows.map(r => [r.fra, r.til, r.tekst]), [['sofie', 'selma', 'Hej Selma! Er du der?']]);
await sofie.page.screenshot({ path: path.join(shots, 'beskeder.png') });

/* ---------- Selma får det at vide på forsiden ---------- */
await kig(selma.page);
await selma.page.waitForSelector('#venner .v-besked');
assert.match(await selma.page.locator('#venner .v-besked .v-spoerg-tekst').textContent(),
  /💬 Sofie skrev: Hej Selma! Er du der\?/);
assert.equal(await selma.page.locator('#venner .v-nyt').textContent(), '💬 1', 'mærket står på vennen');
await selma.page.screenshot({ path: path.join(shots, 'beskeder-nye.png') });

/* ---------- … læser den og svarer med ét tryk ---------- */
await selma.page.click('#venner .v-laes');
await selma.page.waitForSelector('.b-dlg[open] .b-besked');
assert.equal(await selma.page.locator('.b-besked.mig').count(), 0, 'beskeden er fra Sofie, ikke fra Selma selv');
assert.equal(await selma.page.locator('.b-dlg .id-titel').textContent(), '💬 Sofie');

// De faste beskeder er til dem, der ikke gider skrive på en iPad.
await selma.page.locator('.b-hurtig', { hasText: '👍' }).click();
await selma.page.waitForSelector('.b-besked.mig');
assert.deepEqual(await selma.page.locator('.b-tekst').allTextContents(), ['Hej Selma! Er du der?', '👍']);

// Det er læst nu: mærket forsvinder, og hvad hun har set, står kun på telefonen.
await selma.page.waitForFunction(() => document.querySelectorAll('#venner .v-nyt').length === 0);
assert.deepEqual(await selma.page.evaluate(() => JSON.parse(localStorage.getItem('zydy.beskeder.set'))),
  { selma: { sofie: 2 } }, 'mærket er gemt under den, der læste – som kælenavnene');
assert.deepEqual(Object.keys(api.beskeder.rows[0]).sort(),
  ['fra', 'fraNavn', 'id', 'oprettet', 'samtale', 'tekst', 'til', 'tilNavn'],
  'serveren gemmer ikke, hvem der har læst hvad');

// Selma lægger telefonen fra sig igen.
await selma.page.click('.b-luk');
await selma.page.waitForSelector('.b-dlg[open]', { state: 'hidden' });

/* ---------- Svaret dukker op hos Sofie, mens hun har samtalen åben ---------- */
await sofie.page.waitForSelector('.b-besked:not(.mig)', { timeout: 15_000 });
assert.deepEqual(await sofie.page.locator('.b-tekst').allTextContents(), ['Hej Selma! Er du der?', '👍']);

/* ---------- Samtalen kan ryddes – men der skal trykkes to gange ---------- */
await sofie.page.click('.b-ryd');
assert.equal(await sofie.page.locator('.b-ryd').textContent(), 'Slet alt?');
assert.equal(await sofie.page.locator('.b-besked').count(), 2, 'intet er slettet endnu');
await sofie.page.click('.b-ryd');
await sofie.page.waitForFunction(() => document.querySelectorAll('.b-besked').length === 0);
assert.equal(api.beskeder.rows.length, 0, 'samtalen er væk for dem begge');

/* ---------- Fjerner man vennen, følger samtalen med ud ---------- */
await sofie.page.fill('.b-input', 'Vi ses i morgen!');
await sofie.page.click('.b-send');
await sofie.page.waitForSelector('.b-besked.mig');
assert.equal(api.beskeder.rows.length, 1);

await sofie.page.click('.b-luk');
await sofie.page.waitForSelector('.b-dlg[open]', { state: 'hidden' });
await sofie.page.click('#venner .v-ven');
await sofie.page.waitForSelector('.v-dlg[open]');
await sofie.page.click('.v-dlg .id-fortryd');                  // "Fjern ven"
await sofie.page.waitForFunction(() => document.querySelectorAll('#venner .v-ven').length === 0);
assert.equal(api.beskeder.rows.length, 0, 'uden venskab er der heller ingen samtale');

/* ---------- Ingen vandret scroll, ingen fejl ---------- */
for (const p of [sofie.page, selma.page]) {
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'ingen vandret scroll');
}
assert.deepEqual(fejl, [], 'ingen console-fejl');
await browser.close();
console.log('OK beskeder');
