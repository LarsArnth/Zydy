// «Spil uden internet» – service workeren (public/sw.js) og panelet nederst på
// forsiden (public/offline.js). Selmas ønske #56: «Gør at appen ikke koster
// internet».
//
// Kør:  PLAYWRIGHT=/Users/lars/Projekter/DungeonCrawler/node_modules/playwright/index.mjs node test/offline.test.mjs
// (kræver at en lokal server kører: python3 -m http.server 4185 -d public)
//
// Testen slukker rigtigt for nettet med ctx.setOffline(true) og prøver så at
// spille. Det er den eneste måde at være sikker på: et spil, der «ser hentet
// ud», men ikke er det, opdager man først i bilen uden wifi.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { mockApi } from './api-mock.mjs';
const { chromium, devices } = await import(process.env.PLAYWRIGHT ?? 'playwright');
const BASE = process.env.BASE ?? 'http://localhost:4185';

const here = path.dirname(fileURLToPath(import.meta.url));
const shots = path.join(here, 'shots');
const liste = JSON.parse(readFileSync(path.join(here, '..', 'public', 'offline-filer.json'), 'utf8'));

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 13'] });
// Vi er ikke ude efter navne-dialogen her – sig at vi er blevet spurgt.
await ctx.addInitScript(() => { try { localStorage.setItem('zydy.navn.spurgt', '1'); } catch (e) {} });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
const api = await mockApi(page);

await page.goto(`${BASE}/`);

/* ---------- Panelet tilbyder at hente spillene hjem ---------- */

await page.waitForSelector('#offline .off-knap', { timeout: 10000 });
assert.match(await page.locator('#offline .off-titel').textContent(), /uden internet/i,
  'panelet fortæller, hvad det handler om');
assert.match(await page.locator('#offline .off-knap').textContent(), /Hent alle spil/,
  'der er en knap, der henter det hele ned');
await page.screenshot({ path: path.join(shots, 'offline-hent.png') });

/* ---------- Service workeren tager over uden at spærre for API'et ---------- */
// Det farligste ved en service worker er, at den lægger sig mellem siden og
// /api/ og svarer med noget gammelt – så ville toplisten, vennerne og «hvem er
// her nu» fryse fast. Den skal lade dem gå urørt igennem.

await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 10000 });
const foer = api.log.aktivitet.length;
await page.reload();
await page.waitForFunction(() => !!navigator.serviceWorker.controller);
await page.waitForTimeout(600);
assert.ok(api.log.aktivitet.length > foer,
  'siden melder sig stadig til /api/aktivitet, selv om service workeren er tændt');

/* ---------- Hent alle spil ---------- */

await page.waitForSelector('#offline .off-knap:not([disabled])', { timeout: 10000 });
await page.click('#offline .off-knap');
await page.waitForFunction(
  () => /ligger på telefonen/.test(document.querySelector('#offline .off-titel')?.textContent || ''),
  null, { timeout: 60000 });
assert.match(await page.locator('#offline .off-under').textContent(), /koster ikke data/,
  'og så koster det ikke data mere');
await page.screenshot({ path: path.join(shots, 'offline-hentet.png') });

// Alt det, generatoren har skrevet på listen, ligger nu i cachen.
const cachet = await page.evaluate(async () => {
  const navne = (await caches.keys()).filter(n => n.startsWith('zydy-'));
  const cache = await caches.open(navne[0]);
  return (await cache.keys()).map(r => new URL(r.url).pathname);
});
for (const url of [...liste.skal, ...liste.spil]) {
  assert.ok(cachet.includes(url), `${url} blev ikke lagt på telefonen`);
}
assert.ok(!cachet.some(u => u.startsWith('/api/')), 'API-svar må aldrig ligge i cachen');

assert.deepEqual(errors, [], 'ingen fejl i konsollen, mens der er internet');

/* ---------- Så slukker vi for nettet ---------- */

await ctx.setOffline(true);

// Et spil, man aldrig har været inde i, skal kunne spilles alligevel.
await page.goto(`${BASE}/spil/kryds/`);
assert.equal(await page.locator('h1').first().textContent(), 'Kryds og bolle',
  'spillet starter uden internet');
await page.screenshot({ path: path.join(shots, 'offline-spil.png') });

// Og man kan faktisk spille det – ikke bare se på startskærmen.
await page.click('#tilstandSeg button[data-tilstand="pvp"]');
await page.click('#spilBtn');
assert.equal(await page.locator('.felt').count(), 9, 'brættet er der uden net');
await page.click('.felt[data-i="0"]');
assert.equal(await page.locator('.felt[data-i="0"]').isDisabled(), true,
  'man kan sætte et kryds uden internet');

/* ---------- Forsiden siger det ærligt, når der ikke er net ---------- */

await page.goto(`${BASE}/`);
await page.waitForSelector('#offline .off-titel', { timeout: 10000 });
await page.waitForFunction(
  () => /Du er uden internet/.test(document.querySelector('#offline .off-titel')?.textContent || ''),
  null, { timeout: 10000 });
assert.match(await page.locator('#offline .off-under').textContent(), /ligger på telefonen/,
  'og beroliger med, at spillene stadig er der');
assert.ok(await page.locator('#apps li[data-spil="kryds"]').count() > 0,
  'hele listen af spil er der stadig uden net');
await page.screenshot({ path: path.join(shots, 'offline-uden-net.png') });

/* ---------- Et spil, der ikke er hentet, får en pæn besked ---------- */

await page.goto(`${BASE}/spil/findes-ikke/`);
assert.match(await page.locator('body').textContent(), /Ingen internet/,
  'en side, vi ikke har, giver en forklaring i stedet for browserens fejlside');

await ctx.setOffline(false);

// Uden net kan hverken API'et eller beaconen nås, og det skriver browseren om
// i konsollen. Det er ventet – vi sorterer netværksstøjen fra og kræver, at
// der ikke er andet.
const uventet = errors.filter(e => !/Failed to load resource|net::ERR|Load failed|ERR_INTERNET_DISCONNECTED|504/i.test(e));
assert.deepEqual(uventet, [], 'ingen uventede fejl i konsollen');

await browser.close();
console.log('offline: OK');
