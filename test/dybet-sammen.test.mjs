// Dybet sammen: to venner ned i den samme labyrint, én på hver telefon
// (public/spil/dybet/sammen.mjs + /spil/rum.js + src/rum.mjs).
//
// Kør:  PLAYWRIGHT=/Users/lars/Projekter/DungeonCrawler/node_modules/playwright/index.mjs node test/dybet-sammen.test.mjs
// (kræver at en lokal server kører: python3 -m http.server 4192 -d public)
//
// Som test/rum.test.mjs er der to browsere: Sofie og Selma har hver sit
// localStorage, men deler API'et i hukommelsen, præcis som de ville dele
// databasen i drift. Her spilles der et stykke af labyrinten igennem: turen
// skal hoppe frem og tilbage, de to skærme skal vise det samme felt, og kampen
// skal kunne ses fra begge sider.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { mockApi } from './api-mock.mjs';
const { chromium, devices } = await import(process.env.PLAYWRIGHT ?? 'playwright');
const BASE = process.env.BASE ?? 'http://localhost:4181';
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
  return { navn, page, api };
}

const sofie = await spiller('Sofie');
const selma = await spiller('Selma', sofie.api);
const api = sofie.api;

// De to er venner i forvejen – det er venskabet, der giver lov til at invitere.
await api.venner.spoerg('sofie', 'selma', 'Sofie', 'Selma');
await api.venner.sigJa('sofie', 'selma', 'Selma');

/* ---------- Sofie inviterer Selma ned i Dybet ---------- */
await sofie.page.goto(`${BASE}/`);
await sofie.page.waitForSelector('#venner .v-ven');
await sofie.page.click('#venner .v-ven');
await sofie.page.waitForSelector('.v-dlg[open]');
const dybetKnap = sofie.page.locator('.v-sammen', { hasText: 'Dybet' });
assert.equal(await dybetKnap.count(), 1, 'Dybet kan nu spilles sammen');

await dybetKnap.click();
await sofie.page.waitForURL(/\/spil\/dybet\/\?rum=[A-Z0-9]{5}/, { timeout: 10_000 });
const kode = new URL(sofie.page.url()).searchParams.get('rum');
assert.equal(api.rum.rows.length, 1, 'der er lavet ét rum');
assert.equal(api.rum.rows[0].spil, 'dybet');

await sofie.page.waitForSelector('#ventScreen.on');
assert.match(await sofie.page.locator('#ventTitel').textContent(), /Venter på Selma/,
  'værten venter, til vennen hopper med');

// Værten graver labyrinten, når gæsten hopper med – så her, mens der stadig
// ventes, sætter vi frøet og de hurtige animationer. Rumkoden står i adressen,
// så det er stadig det samme spil.
const hurtigt = `${BASE}/spil/dybet/?rum=${kode}&hastighed=0.05`;
await sofie.page.goto(hurtigt + '&seed=4');
await sofie.page.waitForSelector('#ventScreen.on');

/* ---------- Selma ser invitationen på forsiden og hopper med ---------- */
await selma.page.goto(`${BASE}/`);
await selma.page.waitForSelector('#venner .v-rum', { timeout: 10_000 });
assert.match(await selma.page.locator('#venner .v-rum .v-spoerg-tekst').textContent(),
  /Sofie vil spille Dybet med dig/);
await selma.page.click('#venner .v-hopmed');
await selma.page.waitForURL(new RegExp('\\?rum=' + kode), { timeout: 10_000 });
// Gæsten siger ja ved at være i spillet – så går rummet i gang, og værten
// opdager det selv og graver labyrinten.
await selma.page.waitForFunction(() => {
  const s = window.GAME && window.GAME.state.sammen;
  return !!s && s.status === 'igang';
}, null, { timeout: 15_000 });
assert.equal(api.rum.rows[0].status, 'igang');

await selma.page.goto(hurtigt);

/* ---------- Hjælpere ---------- */
const state = p => p.evaluate(() => window.GAME.state);
const rolig = p => p.waitForFunction(() => {
  const s = window.GAME.state;
  return !!s.sammen && s.sammen.status === 'igang' && !s.animerer && !s.afspiller && s.fase !== 'start';
}, null, { timeout: 25_000 });

/** Venter til begge skærme står stille på den samme version af stillingen. */
async function ITakt() {
  for (let i = 0; i < 80; i++) {
    await rolig(sofie.page); await rolig(selma.page);
    const a = await state(sofie.page), b = await state(selma.page);
    if (a.sammen.version === b.sammen.version && !a.animerer && !b.animerer && !a.afspiller && !b.afspiller) return [a, b];
    await sofie.page.waitForTimeout(100);
  }
  throw new Error('de to skærme kom aldrig i takt');
}

/** Den af de to, det er tur til. */
async function iTur() { return (await state(sofie.page)).sammen.minTur ? sofie : selma; }

/** Gør ét træk for den, det er tur til: slå, åbn kisten, eller gå videre. */
async function traek() {
  const hvem = await iTur();
  if ((await state(hvem.page)).sammen.spilFase === 'kamp') {
    await hvem.page.evaluate(() => window.GAME.kamp({ type: 'angrib' }));
  } else {
    // Gå mod det nærmeste levende monster – ellers kan man gå i ring i en labyrint.
    await hvem.page.evaluate(() => {
      const G = window.GAME, M = G.M, spil = G.spil, d = spil.dungeon;
      const m = M.muligheder(spil);
      const v = m.find(x => x.type === 'angrib') || m.find(x => x.type === 'kiste');
      if (v) return void G.vaelg(v.relativ);
      const afstand = M.bfs(d.grid, d.B, spil.pos);
      let maal = null, naermest = Infinity;
      for (const mo of d.monstre) {
        const a = afstand[mo.y * d.B + mo.x];
        if (!mo.doed && a >= 0 && a < naermest) { naermest = a; maal = mo; }
      }
      const til = M.bfs(d.grid, d.B, maal || d.trappe);
      let bedst = m.find(x => x.type !== 'vend') || m[0], kortest = Infinity;
      for (const x of m) { const a = til[x.y * d.B + x.x]; if (a >= 0 && a < kortest) { kortest = a; bedst = x; } }
      G.vaelg(bedst.relativ);
    });
  }
  return [hvem, await ITakt()];
}

/* ---------- Begge står i den samme labyrint ---------- */
let [s1, s2] = await ITakt();
assert.equal(s1.sammen.rolle, 'vaert', 'den der inviterede er vært');
assert.equal(s2.sammen.rolle, 'gaest');
assert.deepEqual(s1.pos, s2.pos, 'de står på det samme felt');
assert.equal(s1.dybde, s2.dybde);
assert.equal(s1.sammen.mig.navn, 'Sofie');
assert.equal(s1.sammen.ven.navn, 'Selma', 'hver ser sin makkers navn');
assert.equal(s2.sammen.mig.navn, 'Selma');
assert.equal(s2.sammen.ven.navn, 'Sofie');

// Værten begynder, og kun hen kan trykke.
assert.equal(s1.sammen.minTur, true, 'værten begynder');
assert.equal(s2.sammen.minTur, false);
assert.match(await sofie.page.locator('#bestPill').textContent(), /Din tur/);
assert.match(await selma.page.locator('#bestPill').textContent(), /Sofies tur/);
assert.ok(await sofie.page.locator('#valg .valg').count() > 0, 'værten har knapper at vælge imellem');
assert.equal(await selma.page.locator('#valg .valg:not(.venter)').count(), 0, 'gæsten har ingen');
assert.match(await selma.page.locator('#valg .venter').textContent(), /Sofie vælger vej/);
assert.equal(await selma.page.evaluate(() => window.GAME.vaelg('frem')), false, 'man kan ikke gå uden for tur');
assert.equal(await selma.page.locator('#taskeKnap').isDisabled(), true, 'og tasken er lukket uden for tur');
assert.equal(await selma.page.locator('#venNavn').textContent(), 'Sofie', 'makkerens liv står i HUD\'en');

/* ---------- Et træk flytter begge hold, og turen hopper over ---------- */
const foerVersion = s1.sammen.version;
let [gik] = await traek();
assert.equal(gik, sofie, 'det var Sofie, der havde turen');
[s1, s2] = await ITakt();
assert.deepEqual(s1.pos, s2.pos, 'begge skærme viser det samme felt bagefter');
assert.ok(s1.sammen.version > foerVersion, 'stillingen blev delt med den anden telefon');
assert.ok(await sofie.page.evaluate(() => window.GAME.spil.vej.length) > 0, 'holdet gik eller drejede');
assert.equal(s2.sammen.minTur, true, 'nu er det Selmas tur');
assert.equal(s1.sammen.minTur, false);
assert.match(await selma.page.locator('#bestPill').textContent(), /Din tur/);

/* ---------- Videre, til der står et monster i vejen ---------- */
for (let i = 0; i < 40 && s1.sammen.spilFase !== 'kamp'; i++) {
  [, [s1, s2]] = await traek();
  assert.deepEqual(s1.pos, s2.pos, 'de to følges ad hele vejen');
  assert.equal(s1.dybde, s2.dybde);
}
assert.equal(s1.sammen.spilFase, 'kamp', 'holdet løb ind i et monster');
assert.ok(await sofie.page.locator('#kamp.on').isVisible(), 'kampskærmen er åben hos begge');
assert.ok(await selma.page.locator('#kamp.on').isVisible());
assert.equal(await sofie.page.locator('#venBoksNavn').textContent(), 'Selma', 'makkeren står med i kampen');
assert.equal(await selma.page.locator('#venBoksNavn').textContent(), 'Sofie');

/* ---------- I kampen skiftes de to til at slå ---------- */
const monsterHp = () => sofie.page.evaluate(() => window.GAME.M.kampMonster(window.GAME.spil).hp);
const hpFoer = await monsterHp();
const slaar = await iTur();
const ser = slaar === sofie ? selma : sofie;
// Den der ser med, skal kunne læse hvem der slog – derfor i almindelig fart.
await ser.page.evaluate(() => window.GAME.saetHastighed(1));
await slaar.page.evaluate(() => window.GAME.kamp({ type: 'angrib' }));
await ser.page.waitForFunction(n => document.getElementById('besked').textContent.includes(n),
  slaar.navn, { timeout: 20_000 });
await ser.page.evaluate(() => window.GAME.saetHastighed(0.05));
[s1, s2] = await ITakt();
assert.ok(await monsterHp() < hpFoer, 'monsteret mistede liv');
assert.equal(
  await selma.page.evaluate(() => window.GAME.M.kampMonster(window.GAME.spil).hp),
  await monsterHp(), 'og begge skærme viser det samme liv');
assert.equal(s1.sammen.minTur, !s2.sammen.minTur, 'turen ligger præcis ét sted');
await sofie.page.screenshot({ path: path.join(shots, 'dybet-sammen.png') });
await selma.page.screenshot({ path: path.join(shots, 'dybet-sammen-ven.png') });

// Slå monsteret ned, og se at begge to får erfaring for det.
const xpFoer = [s1.sammen.mig, s2.sammen.mig].map(h => h.hp);
for (let i = 0; i < 40 && s1.sammen.spilFase === 'kamp'; i++) [, [s1, s2]] = await traek();
assert.notEqual(s1.sammen.spilFase, 'kamp', 'kampen blev afgjort');
if (s1.sammen.spilFase === 'udforsk') {
  assert.deepEqual(s1.pos, s2.pos, 'og så går de videre sammen');
  const niveauer = await sofie.page.evaluate(() => [window.GAME.spil.helte.vaert.xp + window.GAME.spil.helte.vaert.level * 1000,
    window.GAME.spil.helte.gaest.xp + window.GAME.spil.helte.gaest.level * 1000]);
  assert.equal(niveauer[0], niveauer[1], 'begge helte har fået den samme erfaring');
}

/* ---------- Går den ene, får den anden besked ---------- */
await selma.page.click('.back');
await selma.page.waitForURL(url => !url.search.includes('rum='), { timeout: 10_000 });
await sofie.page.waitForSelector('#ventScreen.on', { timeout: 15_000 });
assert.match(await sofie.page.locator('#ventTitel').textContent(), /Selma gik/);

/* ---------- Ingen vandret scroll, ingen fejl ---------- */
for (const p of [sofie.page, selma.page]) {
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'ingen vandret scroll');
}
assert.deepEqual(fejl, [], 'ingen console-fejl');
await browser.close();
console.log('OK dybet sammen');
