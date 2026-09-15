// Forsiden zydy.dk: «Nyt på Zydy» — listen over hvad der er lavet, og knappen
// der lyser op, når der er kommet noget til siden sidst (public/nyheder.js +
// public/nyheder.json).
//
// Kør:  PLAYWRIGHT=/Users/lars/Projekter/DungeonCrawler/node_modules/playwright/index.mjs node test/nyheder.test.mjs
// (kræver at en lokal server kører: python3 -m http.server 4185 -d public)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { mockApi } from './api-mock.mjs';
const { chromium, devices } = await import(process.env.PLAYWRIGHT ?? 'playwright');
const BASE = process.env.BASE ?? 'http://localhost:4185';

const here = path.dirname(fileURLToPath(import.meta.url));
const shots = path.join(here, 'shots');
const data = JSON.parse(readFileSync(path.join(here, '..', 'public', 'nyheder.json'), 'utf8'));
const nyheder = data.nyheder;

const browser = await chromium.launch();
// Uden service worker. Testen her bytter /nyheder.json ud med page.route for at
// se, hvad der sker, når der kommer en nyhed til — og service workeren (sw.js)
// serverer med vilje den rigtige fil fra telefonen uden at spørge nettet, så
// ombytningen aldrig ville nå frem. At filen ligger i cachen, og hvordan den
// bliver frisk igen, hører hjemme i test/offline.test.mjs.
const ctx = await browser.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block' });
// Vi er ikke ude efter navne-dialogen her – sig at vi er blevet spurgt.
await ctx.addInitScript(() => { try { localStorage.setItem('zydy.navn.spurgt', '1'); } catch (e) {} });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await mockApi(page);

await page.goto(`${BASE}/`);
const knap = page.locator('#nyhedKnap');

/* ---------- Første besøg: alt er nyt, og knappen lyser ---------- */
await knap.waitFor({ timeout: 5000 });
assert.match(await knap.textContent(), /Nyt på Zydy/, 'knappen står i toppen');
assert.match(await knap.textContent(), new RegExp(nyheder.length + ' nye'),
  'har man aldrig været inde, er alle nyhederne nye');
assert.ok(await knap.evaluate(e => e.classList.contains('ny-lyser')), 'knappen lyser op');
await page.screenshot({ path: path.join(shots, 'forside-nyt-knap.png') });

/* ---------- Listen: hvornår, hvad og hvem der ønskede sig det ---------- */
await knap.click();
await page.waitForSelector('.ny-dlg[open]');
assert.equal(await page.locator('.ny-rad').count(), nyheder.length, 'alle nyheder står på listen');
assert.equal(await page.locator('.ny-rad.ny-frisk').count(), nyheder.length, 'og alle er markeret som nye');

const foerste = page.locator('.ny-rad').first();
assert.equal(await foerste.locator('.ny-titel').textContent(), nyheder[0].titel, 'nyeste øverst');
assert.ok((await foerste.locator('.ny-dato').textContent()).length > 0, 'der står hvornår det blev lavet');

// Datoen skrives som man siger den. Vi regner dagen ud her, så testen også
// virker i morgen: i dag → "i dag", i går → "i går", ellers "12. september".
const somDato = d => [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
const iDag = new Date();
const iGaar = new Date(iDag.getFullYear(), iDag.getMonth(), iDag.getDate() - 1);
const skriv = iso => page.evaluate(s => window.Nyheder.skrivDato(s), iso);
assert.equal(await skriv(somDato(iDag)), 'i dag');
assert.equal(await skriv(somDato(iGaar)), 'i går');
assert.equal(await skriv('2025-09-12'), '12. september 2025', 'et andet år får årstallet med');
assert.match(await foerste.locator('.ny-oensket').textContent(), new RegExp('ønsket af ' + nyheder[0].oensket));
assert.equal(await foerste.locator('.ny-mark').textContent(), 'NYT');

// En nyhed om et spil linker til spillet, med spillets navn fra kortet på forsiden.
const obby = page.locator('.ny-rad', { has: page.locator('a[href="/spil/obby/"]') }).first();
assert.equal(await obby.locator('.ny-spil').textContent(), 'Obby', 'spillets navn hentes fra kortet');
await page.screenshot({ path: path.join(shots, 'forside-nyheder.png') });

// Knappen holder op med at lyse med det samme, mens mærkaterne bliver stående.
assert.equal(await knap.evaluate(e => e.classList.contains('ny-lyser')), false);
assert.equal(await page.locator('.ny-rad.ny-frisk').count(), nyheder.length, 'mærkaterne bliver stående');

await page.click('.ny-luk');
await page.waitForSelector('.ny-dlg[open]', { state: 'hidden' });

/* ---------- Næste besøg: intet nyt ---------- */
assert.equal(await page.evaluate(() => localStorage.getItem('zydy.nyheder.set')), String(nyheder[0].nr),
  'den sidst sete version huskes');
await page.reload();
await knap.waitFor();
assert.equal(await knap.evaluate(e => e.classList.contains('ny-lyser')), false, 'knappen lyser ikke uden nyt');
assert.doesNotMatch(await knap.textContent(), /\d/, 'og der står ikke et antal');
await knap.click();
await page.waitForSelector('.ny-dlg[open]');
assert.equal(await page.locator('.ny-rad.ny-frisk').count(), 0, 'ingen af dem er markeret som nye');
assert.equal(await page.locator('.ny-rad').count(), nyheder.length, 'men hele listen kan stadig ses');
await page.click('.ny-luk');
await page.waitForSelector('.ny-dlg[open]', { state: 'hidden' });

/* ---------- Der kommer en nyhed til: kun den lyser op ---------- */
const ekstra = { nr: nyheder[0].nr + 1, dato: '2026-09-13', spil: 'obby', titel: 'En ny ting i Obby',
  hvad: 'Noget vi lavede, efter du sidst var inde på siden.', oensket: 'Sofie' };
await page.route('**/nyheder.json', route =>
  route.fulfill({ contentType: 'application/json', body: JSON.stringify({ nyheder: [ekstra, ...nyheder] }) }));
await page.reload();
await knap.waitFor();
assert.match(await knap.textContent(), /1 ny/, 'der er kommet én til');
assert.ok(await knap.evaluate(e => e.classList.contains('ny-lyser')));

await knap.click();
await page.waitForSelector('.ny-dlg[open]');
assert.equal(await page.locator('.ny-rad.ny-frisk').count(), 1, 'kun den nye er markeret');
assert.equal(await page.locator('.ny-rad.ny-frisk .ny-titel').textContent(), ekstra.titel);
await page.click('.ny-luk');
await page.waitForSelector('.ny-dlg[open]', { state: 'hidden' });
assert.equal(await page.evaluate(() => localStorage.getItem('zydy.nyheder.set')), String(ekstra.nr));

/* ---------- Uden filen sker der ingenting ---------- */
{
  const ctx2 = await browser.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block' });
  await ctx2.addInitScript(() => { try { localStorage.setItem('zydy.navn.spurgt', '1'); } catch (e) {} });
  const p2 = await ctx2.newPage();
  const fejl2 = [];
  p2.on('pageerror', e => fejl2.push(String(e)));
  await mockApi(p2);
  await p2.route('**/nyheder.json', route => route.fulfill({ status: 404, body: '' }));
  await p2.goto(`${BASE}/`);
  await p2.waitForTimeout(500);
  assert.equal(await p2.locator('#nyhedKnap').count(), 0, 'ingen liste, ingen knap');
  assert.deepEqual(fejl2, [], 'og ingen fejl på siden');
  await ctx2.close();
}

/* ---------- Ingen vandret scroll, ingen fejl ---------- */
assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'ingen vandret scroll');
assert.deepEqual(errors, [], 'ingen console-fejl');
await browser.close();
console.log('OK nyheder');
