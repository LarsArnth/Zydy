// Kapløb: to venner joiner hinanden i et helt almindeligt spil (Tårn) og spiller
// hver for sig med fælles stilling øverst på skærmen
// (public/venner.js + /spil/rum.js + /spil/kaploeb.js + src/rum.mjs).
//
// Kør:  PLAYWRIGHT=/Users/lars/Projekter/DungeonCrawler/node_modules/playwright/index.mjs node test/kaploeb.test.mjs
// (kræver at en lokal server kører: python3 -m http.server 4185 -d public)
//
// Repoets tredje test med to browsere: Sofie og Selma har hver sit vindue med
// sit eget localStorage, men deler API'et i hukommelsen (mockApi … { delMed }),
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

/** Et vindue med et navn i localStorage – som når man har skrevet det på forsiden. */
async function spiller(navn, delMed) {
  const ctx = await browser.newContext({ ...devices['iPhone 13'] });
  const page = await ctx.newPage();
  page.on('pageerror', e => fejl.push(navn + ': ' + e));
  page.on('console', m => { if (m.type() === 'error') fejl.push(navn + ': ' + m.text()); });
  await page.addInitScript(n => { localStorage.setItem('zydy.navn', n); }, navn);
  const api = await mockApi(page, delMed ? { delMed } : {});
  return { page, api };
}

const sofie = await spiller('Sofie');
const selma = await spiller('Selma', sofie.api);
const api = sofie.api;

// De to er venner i forvejen – det er venskabet, der giver lov til at invitere.
await api.venner.spoerg('sofie', 'selma', 'Sofie', 'Selma');
await api.venner.sigJa('sofie', 'selma', 'Selma');

const pille = p => p.locator('.kap-pille').textContent();
/** Venter på, at pillen øverst siger noget bestemt. */
const venterPaaPille = (p, re) => p.waitForFunction(m => {
  const e = document.querySelector('.kap-pille');
  return !!e && new RegExp(m).test(e.textContent);
}, re.source, { timeout: 15_000 });

/**
 * Én runde Tårn: `blokke` perfekte drops og så et helt ved siden af, så spillet
 * er slut og scoren går i kapløbet. Første gang trykkes der «Spil», siden «Spil igen».
 */
async function spilTaarn(page, blokke) {
  const igen = await page.locator('#againBtn').isVisible();
  await page.click(igen ? '#againBtn' : '#startBtn');
  await page.waitForFunction(() => window.GAME.state.running);
  await page.waitForTimeout(220);                         // forbi dobbelt-tryk-beskyttelsen
  for (let i = 0; i < blokke; i++) {
    await page.evaluate(() => {
      const s = window.GAME.state, top = s.blocks[s.blocks.length - 1];
      window.GAME.setMovingX(top.x); window.GAME.drop();
    });
  }
  await page.evaluate(() => {
    const s = window.GAME.state, top = s.blocks[s.blocks.length - 1];
    window.GAME.setMovingX(top.x + 1000); window.GAME.drop();   // helt forbi: slut
  });
  await page.waitForSelector('#overScreen.on', { timeout: 10_000 });
  assert.equal((await page.evaluate(() => window.GAME.state.score)), blokke, 'scoren blev ' + blokke);
}

/* ---------- Sofie udfordrer Selma i Tårn ---------- */
await sofie.page.goto(`${BASE}/`);
await sofie.page.waitForSelector('#venner .v-ven');
await sofie.page.click('#venner .v-ven');
await sofie.page.waitForSelector('.v-dlg[open]');

const kapKnapper = sofie.page.locator('.v-kap-spil');
assert.ok(await kapKnapper.count() >= 10, 'man kan tage et kapløb i alle spil med en score');
await sofie.page.screenshot({ path: path.join(shots, 'kaploeb-vaelg.png') });

// Præcis «Tårn» – ikke «Tårnforsvar», som også står på listen
await sofie.page.locator('.v-kap-spil', { hasText: /^Tårn$/ }).click();
await sofie.page.waitForURL(/\/spil\/taarn\/\?rum=[A-Z0-9]{5}/, { timeout: 10_000 });
const kode = new URL(sofie.page.url()).searchParams.get('rum');
assert.equal(api.rum.rows.length, 1, 'der er lavet ét rum');
assert.equal(api.rum.rows[0].spil, 'taarn');
assert.equal(api.rum.rows[0].status, 'inviteret');

await sofie.page.waitForSelector('.kap-pille');
assert.match(await pille(sofie.page), /Venter på Selma/, 'værten kan spille, mens invitationen står og venter');

/* ---------- Man må gerne gå i gang, før vennen når at hoppe med ---------- */
await spilTaarn(sofie.page, 3);
await venterPaaPille(sofie.page, /Du 3 blokke/);
assert.equal(api.rum.rows[0].tilstand, null, 'stillingen kan ikke skrives, før begge er med');
assert.equal(await sofie.page.evaluate(() => window.Kaploeb.stand().min.runder), 1);

/* ---------- Selma ser udfordringen på forsiden og hopper med ---------- */
await selma.page.goto(`${BASE}/`);
await selma.page.waitForSelector('#venner .v-rum', { timeout: 10_000 });
assert.match(await selma.page.locator('#venner .v-rum .v-spoerg-tekst').textContent(),
  /Sofie udfordrer dig i Tårn/);
await selma.page.screenshot({ path: path.join(shots, 'kaploeb-invitation.png') });

await selma.page.click('#venner .v-hopmed');
await selma.page.waitForURL(new RegExp('\\?rum=' + kode), { timeout: 10_000 });
await selma.page.waitForSelector('.kap-pille');
// Sofies runde fra før lå og ventede – den kommer op af sig selv, når Selma er med.
await venterPaaPille(selma.page, /Sofie 3 blokke/);
assert.match(await pille(selma.page), /Du –/, 'Selma har ikke spillet endnu');
assert.equal(api.rum.rows[0].status, 'igang');

/* ---------- Selma spiller en bedre runde og fører ---------- */
await spilTaarn(selma.page, 5);
await venterPaaPille(selma.page, /👑Du 5 blokke/);
await venterPaaPille(sofie.page, /👑Selma 5 blokke/);
await sofie.page.screenshot({ path: path.join(shots, 'kaploeb-taarn.png') });

/* ---------- Pillen folder stillingen ud ---------- */
await sofie.page.click('.kap-pille');
await sofie.page.waitForSelector('.kap-dlg[open]');
assert.match(await sofie.page.locator('.kap-titel').textContent(), /Kapløb mod Selma/);
assert.match(await sofie.page.locator('.kap-under').textContent(), /Selma fører med 5 blokke/);
assert.equal(await sofie.page.locator('.kap-foerer .kap-score').textContent(), '5 blokke');
await sofie.page.screenshot({ path: path.join(shots, 'kaploeb-panel.png') });
await sofie.page.click('.kap-vigtig');                     // "Spil videre"
await sofie.page.waitForSelector('.kap-dlg[open]', { state: 'hidden' });

/* ---------- … og Sofie tager føringen tilbage i anden runde ---------- */
await spilTaarn(sofie.page, 7);
await venterPaaPille(sofie.page, /👑Du 7 blokke/);
await venterPaaPille(selma.page, /👑Sofie 7 blokke/);
assert.equal(await sofie.page.evaluate(() => window.Kaploeb.stand().min.runder), 2, 'begge runder tæller med');
assert.equal(await sofie.page.evaluate(() => window.Kaploeb.stand().min.bedste), 7, 'den bedste runde står');

/* ---------- En dårlig runde vælter ikke rekorden ---------- */
await spilTaarn(sofie.page, 1);
await sofie.page.waitForFunction(() => window.Kaploeb.stand().min.runder === 3, null, { timeout: 10_000 });
assert.equal(await sofie.page.evaluate(() => window.Kaploeb.stand().min.bedste), 7);
assert.match(await pille(sofie.page), /👑Du 7 blokke/);

/* ---------- Stopper den ene, får den anden besked ---------- */
await selma.page.click('.kap-pille');
await selma.page.waitForSelector('.kap-dlg[open]');
await selma.page.locator('.kap-knap', { hasText: 'Stop kapløbet' }).click();
await selma.page.waitForURL(url => !url.search.includes('rum='), { timeout: 10_000 });
assert.equal(await selma.page.locator('.kap-pille').count(), 0, 'pillen er væk hos den, der stoppede');
await venterPaaPille(sofie.page, /Selma stoppede kapløbet/);

/* ---------- Ingen vandret scroll, ingen fejl ---------- */
for (const p of [sofie.page, selma.page]) {
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'ingen vandret scroll');
}
assert.deepEqual(fejl, [], 'ingen console-fejl');
await browser.close();
console.log('OK kapløb (join hinanden i alle spil)');
