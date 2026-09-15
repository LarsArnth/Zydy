// Søgefeltet på forsiden (public/soeg.js + public/soeg-regler.mjs): at der
// filtreres mens man skriver, at et spil kan findes på det, det også hedder,
// at en forgæves søgning bliver til et ønske — og at Enter går ind i spillet.
//
// Kør:  PLAYWRIGHT=/Users/lars/Projekter/DungeonCrawler/node_modules/playwright/index.mjs node test/soeg.test.mjs
// (kræver at en lokal server kører: python3 -m http.server 4185 -d public)
import assert from 'node:assert/strict';
import { mockApi } from './api-mock.mjs';
const { chromium, devices } = await import(process.env.PLAYWRIGHT ?? 'playwright');
const BASE = process.env.BASE ?? 'http://localhost:4185';
const SHOTS = new URL('./shots/', import.meta.url).pathname;   // i den worktree testen køres fra
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 13'] });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await mockApi(page);
// Navnet er kendt, så "Hvem spiller?" ikke ligger hen over forsiden.
await page.addInitScript(() => { localStorage.setItem('zydy.navn', 'Sofie'); localStorage.setItem('zydy.navn.spurgt', '1'); });

await page.goto(`${BASE}/`);
await page.waitForSelector('#soegFelt');

const felt = page.locator('#soegFelt');
const alle = await page.locator('#apps li[data-spil]').count();
assert.ok(alle >= 14, 'der skulle være en hel del kort at søge i');
assert.equal(await page.locator('#apps li[data-spil]:visible').count(), alle, 'alle kort står der, før man skriver');
assert.equal(await page.locator('.sg-status').isVisible(), false, 'ingen status, når feltet er tomt');

/** Skriver i feltet og venter på, at kortene har flyttet sig. */
async function soeg(tekst) {
  await felt.fill(tekst);
  await page.waitForTimeout(120);
  return page.locator('#apps li[data-spil]:visible').evaluateAll(
    lis => lis.map(li => li.dataset.spil));
}

/* ---------- Der filtreres, mens man skriver ---------- */
assert.deepEqual(await soeg('kat'), ['kat'], '«kat» finder kun Min kat');
assert.equal(await page.locator('li[data-spil="taarn"]').isVisible(), false, 'de andre kort er væk');
assert.equal(await page.locator('.sg-status').textContent(), 'Ét spil');
await page.screenshot({ path: SHOTS + 'soeg.png' });

// Et bogstav ad gangen: «k» → «kl» → «klo» skal snævre ind, ikke springe.
const etBogstav = await soeg('k');
const toBogstaver = await soeg('kl');
assert.ok(etBogstav.length > toBogstaver.length, 'flere bogstaver giver færre kort');
assert.ok(toBogstaver.includes('klodser') && toBogstaver.includes('klaver'), '«kl» finder både Klodser og KlaverLær');

/* ---------- Spillene kan findes på det, de også hedder ---------- */
assert.ok((await soeg('roblox')).includes('klodser'), 'Selmas «roblox» finder Klodser');
assert.deepEqual(await soeg('block blast'), ['blokblast'], 'to ord, der står i nøgleordene');
assert.deepEqual(await soeg('clash royale'), ['slotskamp']);
assert.ok((await soeg('saet')).includes('saet'), 'Sæt kan findes uden æ');
assert.ok((await soeg('taarn')).includes('taarn'), 'Tårn kan findes uden å');
assert.deepEqual(await soeg('TRE PÅ STRIBE'), ['kryds'], 'store bogstaver er samme sag');

/* ---------- Ryd søgningen ---------- */
await page.click('.sg-ryd');
await page.waitForTimeout(120);
assert.equal(await page.locator('#apps li[data-spil]:visible').count(), alle, 'krydset giver alle kortene tilbage');
assert.equal(await page.locator('.sg-ryd').isVisible(), false, 'krydset gemmer sig selv igen');
assert.equal(await felt.inputValue(), '');

/* ---------- Fandt vi intet, bliver det til et ønske ---------- */
assert.deepEqual(await soeg('basketball'), [], 'vi har ikke noget basketballspil');
assert.match(await page.locator('.sg-status').textContent(), /Vi har ikke noget, der hedder «basketball»/);
await page.screenshot({ path: SHOTS + 'soeg-intet.png' });

await page.click('.sg-foreslaa');
await page.waitForSelector('.id-dlg[open]');
assert.match(await page.locator('.id-titel').textContent(), /nyt spil/i, 'søgningen tilbyder at ønske spillet');
assert.equal(await page.inputValue('.id-tekst'), 'basketball', 'det man ledte efter, står klar i feltet');
await page.click('.id-fortryd');
await page.waitForSelector('.id-dlg[open]', { state: 'hidden' });

/* ---------- Ønske-knappen og "Nyt spil?"-kortet virker stadig ---------- */
await page.click('.sg-ryd');
await page.waitForTimeout(120);
await page.click('#nytSpilKort');
await page.waitForSelector('.id-dlg[open]');
assert.equal(await page.inputValue('.id-tekst'), '', 'kortet nederst åbner stadig et tomt felt');
await page.click('.id-fortryd');
await page.waitForSelector('.id-dlg[open]', { state: 'hidden' });

/* ---------- Ingen vandret scroll, ingen fejl ---------- */
assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'ingen vandret scroll');
assert.deepEqual(errors, [], 'ingen console-fejl');

/* ---------- Enter går ind i det øverste spil, der er tilbage ---------- */
await soeg('min kat');
await felt.press('Enter');
await page.waitForURL('**/spil/kat/**', { timeout: 5000 });
assert.match(page.url(), /\/spil\/kat\//, 'retur åbner spillet');

await browser.close();
console.log('OK soeg');
