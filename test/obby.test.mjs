// Kør:  PLAYWRIGHT=/Users/lars/Projekter/DungeonCrawler/node_modules/playwright/index.mjs node test/obby.test.mjs
// (kræver at en lokal server kører: python3 -m http.server <PORT> -d public)
// Højscore-API'et (/api/highscore/obby) mockes med page.route. Spillet køres med
// fysikken sat på pause (GAME.pause) og trinvis (GAME.tick), så en lille bot kan
// spille deterministisk: den hopper, når GAME.simJump() siger, at hoppet lander
// på en ny platform (eller på den anden side af laseren).
import assert from 'node:assert/strict';
const { chromium, devices } = await import(process.env.PLAYWRIGHT ?? 'playwright');
import { mockApi } from './api-mock.mjs';
const BASE = process.env.BASE ?? 'http://localhost:4181';
const SHOTS = new URL('./shots/', import.meta.url).pathname;   // i den worktree testen køres fra
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 13'] });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

let liste = [
  { id: 1, navn: 'Simon', score: 40, oprettet: '2026-09-12T10:00:00.000Z' },
  { id: 2, navn: 'Far', score: 25, oprettet: '2026-09-12T10:01:00.000Z' },
  { id: 3, navn: 'Mor', score: 9, oprettet: '2026-09-12T10:02:00.000Z' },
];
const sendte = [], patchede = [];
// zydy.dk's API'er i hukommelsen (aktivitet + topliste). Registreres først, så en
// mere specifik page.route nedenfor vinder over den.
const api = await mockApi(page);

await page.route('**/api/highscore/**', async route => {
  const req = route.request();
  const regler = { retning: 'desc', min: 1, maks: 10000, unik: true };
  if (req.method() === 'POST') {
    const krop = req.postDataJSON(); sendte.push(krop);
    liste = liste.filter(r => r.navn.toLowerCase() !== krop.navn.toLowerCase());
    liste = [...liste, { id: 99, navn: krop.navn, score: krop.score, oprettet: '2026-09-12T12:00:00.000Z' }]
      .sort((a, b) => b.score - a.score).slice(0, 10);
    return route.fulfill({ json: { ok: true, id: 99, token: 'hemmelig', placering: liste.findIndex(r => r.id === 99) + 1, ...regler, liste } });
  }
  if (req.method() === 'PATCH') {
    const krop = req.postDataJSON(); patchede.push({ sti: new URL(req.url()).pathname, ...krop });
    if (krop.token !== 'hemmelig') return route.fulfill({ status: 403, json: { ok: false, fejl: 'Forkert token' } });
    liste = liste.map(r => r.id === 99 ? { ...r, navn: krop.navn } : r);
    return route.fulfill({ json: { ok: true, id: 99, placering: liste.findIndex(r => r.id === 99) + 1, ...regler, liste } });
  }
  return route.fulfill({ json: { spil: 'obby', ...regler, liste } });
});

await page.goto(`${BASE}/spil/obby/?seed=1`);

/* ---------- Startskærm: topliste øverst, Rekord og Name nedenunder ---------- */
assert.ok(await page.locator('#startScreen.on').isVisible(), 'startskærmen vises');
await page.waitForSelector('#hsListe .hs-liste');
assert.equal(await page.locator('#hsListe .hs-raekke').count(), 3, 'toplisten hentes og vises');
assert.equal(await page.locator('#hsListe .hs-raekke').first().locator('.hs-navn').textContent(), 'Simon');
const foer = await page.evaluate(() => {
  const a = document.getElementById('hsListe'), b = document.getElementById('rekordVal'), c = document.getElementById('nameBtn');
  return (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) && (b.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING);
});
assert.ok(foer, 'toplisten står før Rekord, og Rekord står før Name');
assert.equal(await page.locator('#rekordVal').textContent(), '0');
assert.equal(await page.locator('#nameBtn').textContent(), 'Name');

/* ---------- «Der skal stå hvem der har lavet spillet» (Sofies ønske) ---------- */
const lavetAf = page.locator('#lavetAf');
assert.ok(await lavetAf.isVisible(), 'startskærmen fortæller hvem der har lavet spillet');
const lavetTekst = (await lavetAf.textContent()).replace(/\s+/g, ' ');
assert.match(lavetTekst, /Lavet af/i, 'rulleteksten har en overskrift');
assert.match(lavetTekst, /Sofie/, 'Sofie står der som den, der fandt på spillet');
assert.match(lavetTekst, /Far/, 'den der har skrevet koden står der også');
// Den skal kunne ses uden at rulle ned – startskærmen er højere end en telefonskærm
const lavetPlads = await page.evaluate(() => {
  const el = document.getElementById('lavetAf'), kort = el.closest('.card');
  const b = el.getBoundingClientRect(), k = kort.getBoundingClientRect();
  const st = document.getElementById('startScreen').getBoundingClientRect();
  return {
    inde: b.left >= k.left - 1 && b.right <= k.right + 1,
    synlig: b.top >= st.top - 1 && b.bottom <= st.bottom + 1,
  };
});
assert.ok(lavetPlads.inde, 'teksten holder sig inden for startkortet');
assert.ok(lavetPlads.synlig, 'man kan se hvem der har lavet spillet uden at rulle ned');
const titelSynlig = await page.evaluate(() => {
  const h = document.querySelector('#startScreen h1').getBoundingClientRect();
  const st = document.getElementById('startScreen').getBoundingClientRect();
  return h.top >= st.top - 1 && h.bottom <= st.bottom + 1;
});
assert.ok(titelSynlig, 'titlen skubbes ikke ud over kanten af den ekstra linje');

// Skriv navn
await page.locator('#nameBtn').click();
const input = page.locator('#nameInput');
await input.fill('Sofie');
await input.press('Space');                     // mellemrum i feltet må ikke starte spillet
assert.ok(await page.locator('#startScreen.on').isVisible(), 'mellemrum i navnefeltet starter ikke spillet');
await input.fill('Sofie');
await input.press('Enter');
assert.ok((await page.locator('#nameBtn').textContent()).startsWith('Sofie'), 'knappen viser navnet');
assert.equal(await page.evaluate(() => localStorage.getItem('zydy.navn')), 'Sofie', 'navnet huskes (fælles med de andre spil)');
await page.screenshot({ path: SHOTS + 'obby-start.png' });

/* ---------- Banen: laser på hver anden, checkpoint på hver femte ---------- */
const st0 = await page.evaluate(() => window.GAME.state);
assert.equal(st0.phase, 'menu');
for (const pl of st0.platforms) {
  if (pl.i % 5 === 0) { assert.ok(pl.checkpoint, `platform ${pl.i} er checkpoint`); assert.ok(!pl.laser, 'checkpoints har ingen laser'); }
  else if (pl.i >= 3) assert.equal(pl.laser, pl.i % 2 === 1, `laser på hver anden (platform ${pl.i})`);
  assert.ok(pl.y >= 3 && pl.y <= 8, 'platformen ligger i båndet over lavaen');
}
// (om der faktisk *er* lasere, tjekkes efter bot-turen, hvor mange flere platforme er set)

/* ---------- Spil: bot hopper sig gennem 120 platforme ---------- */
await page.getByRole('button', { name: 'Spil', exact: true }).click();
let s = await page.evaluate(() => window.GAME.state);
assert.equal(s.phase, 'ready', 'spilleren står klar på første platform');
assert.equal(s.player.on, 0);
assert.ok(await page.locator('#readyHint.on').isVisible());
assert.ok(!(await page.locator('#menuBtn').isHidden()), 'Menu-knappen vises under spil');
assert.ok(!(await lavetAf.isVisible()), 'rulleteksten ligger ikke i vejen, når man spiller');

/* ---------- «Det her spil skal gå meget hurtigere» (Sofies ønske) ---------- */
// Tempoet spoler hele verdenen hurtigere, mens banen ser ud præcis som før.
// Det måles i *virkelige* sekunder med GAME.frem(sek), som er den samme kode,
// billedløkken kører – GAME.tick() nedenfor går derimod i spil-sekunder, så
// bot-turen stadig måler selve banen.
const maalFart = (sek) => page.evaluate(({ sek }) => {
  const G = window.GAME;
  G.pause();                                   // billedløkken må ikke også rykke figuren
  if (G.state.phase === 'ready') G.jump();     // første tryk sætter kun i gang
  const s0 = G.state, x0 = s0.player.x;
  G.frem(sek);
  return { tempo: s0.tempo, fart: s0.fart, faktor: s0.fartFaktor, langt: G.state.player.x - x0 };
}, { sek });

const start0 = await maalFart(0.25);
assert.ok(start0.tempo >= 1.2, `tempoet er over 1,2 fra første firkant (${start0.tempo})`);
assert.ok(Math.abs(start0.langt - start0.fart * start0.tempo * 0.25) < 0.06,
  'figuren flytter sig fart × tempo pr. virkeligt sekund');
assert.ok(start0.langt / 0.25 > 7,
  `det går over 7 enheder i sekundet fra start (${(start0.langt / 0.25).toFixed(1)}) – før var det 6,0`);
assert.equal(await page.locator('#fartHud').textContent(), '⚡ ×1,3', 'fartmåleren står i HUD\'en fra start');

const bot = (maal) => page.evaluate(({ maal }) => {
  const G = window.GAME, DT = 1 / 120;
  const lasere = new Set(), checkpoints = new Set();
  G.pause();
  if (G.state.phase === 'ready') G.jump();
  for (let n = 0; n < 400000; n++) {
    const s = G.state;
    if (s.phase === 'dead') return { doed: true, paa: s.player.on, streak: s.streak, x: s.player.x, lasere: [...lasere], checkpoints: [...checkpoints] };
    if (s.player.on !== null && s.player.on >= maal) return { doed: false, paa: s.player.on, streak: s.streak, checkpoint: s.checkpoint, lasere: [...lasere], checkpoints: [...checkpoints] };
    if (s.player.on !== null) {
      const cur = s.platforms.find(p => p.i === s.player.on);
      if (cur.laser) lasere.add(cur.i);
      if (cur.checkpoint) checkpoints.add(cur.i);
      const land = G.simJump();
      const laserForan = cur.laser && s.player.x + 1 < cur.x + cur.w / 2;
      if (land && (land.i > s.player.on || (laserForan && land.i === s.player.on && land.x > cur.x + cur.w / 2))) G.jump();
    }
    G.tick(DT);
  }
  return { timeout: true, lasere: [...lasere], checkpoints: [...checkpoints] };
}, { maal });

const fart0 = (await page.evaluate(() => window.GAME.state)).fart;
let r = await bot(120);
assert.ok(!r.timeout, 'botten blev færdig');
assert.ok(!r.doed, `botten døde på vej til platform ${r.paa} (x=${r.x}) – banen skal altid kunne gennemføres`);
assert.ok(r.streak >= 120, `mindst 120 hop talt (fik ${r.streak})`);
assert.equal(r.checkpoint, 120, 'seneste checkpoint er platform 120');
assert.ok(r.lasere.length > 20, `botten kom forbi mange laserplatforme (${r.lasere.length})`);
assert.ok(r.lasere.every(i => i % 2 === 1 && i % 5 !== 0), 'lasere sidder på hver anden, aldrig på et checkpoint');
assert.ok(r.checkpoints.every(i => i % 5 === 0), 'checkpoints er hver femte');
assert.equal(await page.locator('#hop').textContent(), String(r.streak), 'tælleren øverst til venstre følger med');
await page.screenshot({ path: SHOTS + 'obby.png' });

/* ---------- Farten stiger, jo længere man kommer ---------- */
let s2 = await page.evaluate(() => window.GAME.state);
assert.ok(s2.fart > fart0 * 1.4, `farten stiger (fra ${fart0} til ${s2.fart})`);
assert.equal(s2.fart, s2.maksFart, 'ved platform 120 er man på maksfart');
assert.ok(s2.maksFart <= 12, 'maksfarten er stadig til at styre');

// … og tempoet oven i: langt inde går det mere end dobbelt så hurtigt som ved start
assert.equal(s2.tempo, s2.maksTempo, 'ved platform 120 er tempoet i top');
const startFart = start0.fart * start0.tempo;
assert.ok(s2.fartPrSekund > startFart * 2,
  `det går mere end dobbelt så stærkt som ved start (${s2.fartPrSekund.toFixed(1)} mod ${startFart.toFixed(1)} enheder/sek.)`);
assert.ok(s2.fartPrSekund > 9.5 * 1.5,
  `og langt hurtigere end de 9,5 enheder/sek., der var det hurtigste før (${s2.fartPrSekund.toFixed(1)})`);
assert.equal(await page.locator('#fartHud').textContent(), '⚡ ×2,9', 'fartmåleren er talt op');
assert.ok(await page.locator('#fartHud').isVisible(), 'fartmåleren kan ses, mens man spiller');
// Banen skal stadig kunne gennemføres ved det høje tempo – bot-turen ovenfor gik
// hele vejen til 120 uden at dø, og den bruger de samme regler som en spiller.

/* ---------- Coins: kun på checkpoints ---------- */
// Sofie: "gør så det kun var der man fik point eller coins for, ellers får man
// alt for mange coins for hurtigt". Checkpoint på hver 5. firkant.
const CP = s2.coinsPrCheckpoint;
assert.equal(CP, 3, '3 coins pr. checkpoint');
const efterLoeb = Math.floor(120 / 5) * CP;                 // 24 checkpoints
assert.equal(s2.coins, efterLoeb, `${CP} coins pr. checkpoint (ikke pr. firkant): ${efterLoeb} efter 120 platforme`);
assert.equal(s2.maksNaaet, 120);
assert.equal(await page.locator('#coins').textContent(), String(efterLoeb), 'coins vises i spillet');
// Balancen: et enkelt (meget) langt løb må ikke betale den dyreste skin
assert.ok(s2.coins < 100, `et løb til 120 firkanter giver ${s2.coins} coins – ikke nok til den dyreste skin (100)`);
assert.ok(s2.coins >= 40, `men det skal stadig batte noget (${s2.coins} coins)`);
const hjoerner = await page.evaluate(() => {
  const st = document.getElementById('stage').getBoundingClientRect();
  const h = document.getElementById('hop').getBoundingClientRect();
  const c = document.getElementById('coins').getBoundingClientRect();
  return { hopVenstre: h.left - st.left < st.width / 2, coinsHoejre: c.right > st.right - st.width / 2, sammeTop: Math.abs(h.top - c.top) < 40 };
});
assert.ok(hjoerner.hopVenstre, 'hop-tælleren står til venstre');
assert.ok(hjoerner.coinsHoejre, 'coins står i højre hjørne');
assert.ok(hjoerner.sammeTop, 'begge tællere står i toppen');

// Coins gives ikke igen for checkpoints man allerede har taget
await page.evaluate(() => { window.GAME.placer(60); for (let n = 0; n < 60; n++) window.GAME.tick(1 / 120); });
assert.equal((await page.evaluate(() => window.GAME.state)).coins, efterLoeb, 'ingen nye coins for gamle firkanter');
await page.evaluate(() => window.GAME.placer(120));

/* ---------- Skinbutikken ---------- */
const skins = await page.evaluate(() => window.GAME.skins);
assert.ok(skins.length >= 10, `der er mange skins at vælge mellem (${skins.length})`);
assert.ok(skins.every(k => k.pris <= 100), 'ingen skin koster over 100 coins');
assert.equal(skins.filter(k => k.pris === 0).length, 1, 'præcis én gratis skin at starte med');
assert.ok(skins.filter(k => k.hat).length >= 4, 'nogle af dem har hat');

// Skins-knappen findes under spil og fryser spillet
assert.ok(await page.locator('#skinBtn').isVisible(), 'Skins-knappen vises under spil');
await page.locator('#skinBtn').click();
await page.waitForSelector('#shopScreen.on');
assert.equal((await page.evaluate(() => window.GAME.state)).butikAaben, true, 'spillet er frosset');
const foerFrys = await page.evaluate(() => window.GAME.state.player.x);
await page.waitForTimeout(400);
assert.equal(await page.evaluate(() => window.GAME.state.player.x), foerFrys, 'spilleren rører sig ikke, mens butikken er åben');
await page.locator('body').press('Space');
assert.equal(await page.evaluate(() => window.GAME.state.player.x), foerFrys, 'mellemrum hopper ikke i butikken');
assert.equal(await page.locator('#coinsShop').textContent(), String(efterLoeb), 'coins vises i butikken');
assert.match(await page.locator('#shopHint').textContent(), /checkpoint/i, 'butikken forklarer at coins kommer fra checkpoints');
assert.equal(await page.locator('.skin-kort').count(), skins.length, 'alle skins står i gitteret');
// Forhåndsvisningerne skal ligge inde i deres eget kort (den globale canvas-regel
// gjorde dem engang absolut placerede, så de stablede sig oven på titlen)
const billeder = await page.evaluate(() => [...document.querySelectorAll('.skin-kort')].map(kort => {
  const k = kort.getBoundingClientRect(), c = kort.querySelector('canvas');
  if (!c) return { mangler: true };
  const b = c.getBoundingClientRect();
  return { inde: b.left >= k.left - 1 && b.right <= k.right + 1 && b.top >= k.top - 1 && b.bottom <= k.bottom + 1, bredde: Math.round(b.width) };
}));
assert.ok(billeder.every(b => !b.mangler), 'hvert kort har en tegning');
assert.ok(billeder.every(b => b.inde), 'tegningen ligger inde i sit eget kort');
assert.ok(billeder.every(b => b.bredde > 20 && b.bredde < 120), 'tegningen har en fornuftig størrelse');
// Og de må ikke ligge oven i hinanden
const kasser = await page.evaluate(() => [...document.querySelectorAll('.skin-kort canvas')].map(c => { const b = c.getBoundingClientRect(); return [b.left, b.top]; }));
assert.equal(new Set(kasser.map(k => k.join(','))).size, kasser.length, 'tegningerne står hver for sig');
await page.screenshot({ path: SHOTS + 'obby-skins.png' });

// Køb: den dyreste skin, et langt løb rækker til
const dyr = skins.filter(k => k.pris > 0 && k.pris <= efterLoeb).sort((a, b) => b.pris - a.pris)[0];
assert.ok(dyr, `et løb til 120 firkanter rækker til mindst én skin (${efterLoeb} coins)`);
const rest = efterLoeb - dyr.pris;
await page.locator(`.skin-kort[data-skin="${dyr.id}"]`).click();
let st = await page.evaluate(() => window.GAME.state);
assert.equal(st.coins, rest, `${dyr.pris} coins trukket fra`);
assert.equal(st.skin, dyr.id, 'den købte skin er valgt');
assert.ok(st.ejet.includes(dyr.id));
assert.ok(await page.locator(`.skin-kort[data-skin="${dyr.id}"].valgt`).isVisible(), 'kortet er markeret som valgt');

// Uden råd sker der ingenting
const forDyr = skins.find(k => k.pris > rest && k.id !== dyr.id);
await page.locator(`.skin-kort[data-skin="${forDyr.id}"]`).click();
st = await page.evaluate(() => window.GAME.state);
assert.equal(st.coins, rest, 'ingen coins trukket for noget man ikke har råd til');
assert.ok(!st.ejet.includes(forDyr.id), 'skinnen blev ikke købt');
assert.equal(st.skin, dyr.id, 'valget er uændret');

// Man kan skifte gratis tilbage til en man ejer
await page.locator('.skin-kort[data-skin="klassisk"]').click();
st = await page.evaluate(() => window.GAME.state);
assert.equal(st.skin, 'klassisk');
assert.equal(st.coins, rest, 'det koster ikke noget at skifte mellem sine egne');
await page.locator(`.skin-kort[data-skin="${dyr.id}"]`).click();

// Tilbage til spillet: det kører videre, hvor det slap
await page.locator('#shopTilbageBtn').click();
assert.ok(await page.locator('#shopScreen.on').count() === 0, 'butikken er lukket');
st = await page.evaluate(() => window.GAME.state);
assert.equal(st.butikAaben, false);
assert.equal(st.phase, 'run', 'spillet kører videre efter butikken');
await page.evaluate(() => { const G = window.GAME; for (let n = 0; n < 12; n++) G.tick(1 / 120); });
assert.ok(await page.evaluate(() => window.GAME.state.player.x) > foerFrys, 'spilleren løber igen');

// Valg og coins overlever en genindlæsning
await page.reload();
await page.waitForSelector('#hsListe .hs-liste, #hsListe .hs-tom');
st = await page.evaluate(() => window.GAME.state);
assert.equal(st.coins, rest, 'coins huskes');
assert.equal(st.skin, dyr.id, 'den valgte skin huskes');
assert.ok(st.ejet.includes(dyr.id));
assert.equal(await page.locator('#coinsStart').textContent(), String(rest), 'coins vises på startskærmen');
assert.match(await page.locator('.regler').textContent(), /checkpoint/i, 'startskærmen fortæller om checkpoints og coins');
assert.match(await page.locator('.regler').textContent(), /hurtigere/i, 'startskærmen fortæller, at det går hurtigere og hurtigere');
await page.getByRole('button', { name: /Skins/ }).first().click();
await page.waitForSelector('#shopScreen.on');
assert.ok(await page.locator(`.skin-kort[data-skin="${dyr.id}"].ejet`).isVisible(), 'den købte skin er stadig ejet');
await page.locator('#shopTilbageBtn').click();
assert.ok(await page.locator('#startScreen.on').isVisible(), 'tilbage på startskærmen');

// Spil videre, så resten af testen kører som før (nyt spil fra platform 0).
// Undervejs: coins kommer KUN på checkpointene, aldrig på firkanterne imellem.
await page.getByRole('button', { name: 'Spil', exact: true }).click();
const mellem = [];
for (const maal of [4, 5, 9, 10]) {
  r = await bot(maal);
  assert.ok(!r.doed, `botten nåede firkant ${maal}`);
  mellem.push((await page.evaluate(() => window.GAME.state)).coins);
}
assert.deepEqual(mellem, [rest, rest + CP, rest + CP, rest + 2 * CP],
  'firkant 1-4 og 6-9 giver ingenting; kun checkpoint 5 og 10 udbetaler');
r = await bot(120);
assert.ok(!r.doed, 'botten klarer banen igen efter genindlæsning');
assert.equal((await page.evaluate(() => window.GAME.state)).coins, rest + Math.floor(120 / 5) * CP,
  'hele løbet giver ét udbytte pr. checkpoint');

/* ---------- Laseren dræber, hvis man bare løber ---------- */
s = await page.evaluate(() => window.GAME.state);
const laserPl = s.platforms.find(p => p.laser && p.i > s.player.on);
r = await page.evaluate(({ i }) => {
  const G = window.GAME; G.placer(i);
  for (let n = 0; n < 600; n++) { G.tick(1 / 120); if (G.state.phase === 'dead') return G.state; }
  return G.state;
}, { i: laserPl.i });
assert.equal(r.phase, 'dead', 'man dør af laseren');
assert.ok(Math.abs(r.player.x + 0.5 - (laserPl.x + laserPl.w / 2)) < 0.8, 'døde ved laseren midt på platformen');
assert.ok(await page.locator('#tryAgain.on').isVisible(), 'TRY AGAIN vises');
assert.equal(await page.locator('#tryAgain .big').textContent(), 'TRY AGAIN');
// Sofie kunne ikke se, at checkpointet gjorde noget. Nu står der hvor man lander.
assert.equal(await page.locator('#tryAgainTekst').textContent(), 'Tryk – du fortsætter fra checkpoint 120',
  'TRY AGAIN fortæller hvilket checkpoint man fortsætter fra');
assert.ok(await page.locator('#nyRekord').isVisible(), 'ny rekord vises');
const best = r.best;
assert.ok(best >= 120, 'rekorden er gemt');
assert.equal(await page.evaluate(() => localStorage.getItem('zydy.obby.best')), String(best));
assert.equal(await page.locator('#rekHud').textContent(), String(best));
await page.waitForFunction(() => document.querySelector('#hsListe .hs-mig'));
assert.deepEqual(sendte, [{ navn: 'Sofie', score: best }], 'rekorden sendes automatisk til toplisten med navnet');
assert.equal(await page.locator('#hsListe .hs-mig .hs-navn').textContent(), 'Sofie', 'egen række er fremhævet');
assert.equal(await page.locator('#hsListe .hs-raekke').first().locator('.hs-navn').textContent(), 'Sofie', 'Sofie er nr. 1 med 120+');
await page.screenshot({ path: SHOTS + 'obby-tryagain.png' });

/* ---------- Genopstå på checkpointet ---------- */
r = await page.evaluate(() => { const G = window.GAME; G.jump(); return G.state; });
assert.equal(r.phase, 'dead', 'et tryk lige efter døden gør intet (man skal nå at se TRY AGAIN)');
r = await page.evaluate(() => { const G = window.GAME; for (let n = 0; n < 90; n++) G.tick(1 / 120); G.jump(); return G.state; });
assert.equal(r.phase, 'ready', 'tryk → man står klar igen');
assert.equal(r.player.on, 120, 'genopstået på checkpoint-platformen');
assert.equal(r.streak, 0, 'tælleren starter fra 0');
assert.equal(await page.locator('#hop').textContent(), '0');
assert.ok(!(await page.locator('#tryAgain').evaluate(el => el.classList.contains('on'))));
// … og man kan se, at man står på et checkpoint (tælleren er jo nulstillet)
assert.equal(await page.locator('#readyTekst').textContent(), 'Checkpoint 120 – tryk for at starte',
  'startteksten siger hvilket checkpoint man står på');
assert.ok(r.platforms.find(p => p.i === 120).active, 'checkpointet er markeret som taget');
const coinsFoerGentag = r.coins;

// Det første tryk starter kun løbet – det må ikke også hoppe. Hoppede det, ville
// et genstartet spil ved høj fart ende i lavaen med det samme, fordi hoppet er
// længere end den checkpoint-platform, man står på.
r = await page.evaluate(() => {
  const G = window.GAME;
  G.jump();                                   // ét tryk
  const straks = G.state;
  let paaPlatform = 0;
  for (let n = 0; n < 1000; n++) {            // hvor længe kan man løbe, før kanten?
    if (G.state.player.on === null || G.state.phase === 'dead') break;
    G.tick(1 / 120); paaPlatform++;
  }
  return { straks, sekunder: paaPlatform / 120, slut: G.state };
});
assert.equal(r.straks.phase, 'run', 'første tryk sætter spillet i gang');
assert.equal(r.straks.player.on, 120, 'man står stadig på platformen efter første tryk');
assert.equal(r.straks.player.vy, 0, 'første tryk hopper ikke');
assert.ok(r.straks.fart > 9, 'farten er høj på et checkpoint så langt inde');
assert.ok(r.sekunder > 0.8, `der er tid til at nå at trykke igen (${r.sekunder.toFixed(2)} sek.)`);
// … og den tid skal være virkelige sekunder: tiden går jo 1,8 gange så hurtigt her
assert.ok(r.sekunder / r.straks.tempo > 0.8,
  `også i virkelige sekunder (${(r.sekunder / r.straks.tempo).toFixed(2)} sek. ved tempo ${r.straks.tempo})`);
assert.ok(r.slut.phase !== 'dead', 'man dør ikke af selve starten');

assert.equal(r.slut.coins, coinsFoerGentag, 'man tjener ikke coins om igen på et checkpoint, man har taget før');

// Tilbage til klar-tilstand for resten af testen
await page.evaluate(() => window.GAME.spawn());

// Lava: løb ud over kanten fra klar-tilstand og lad være med at hoppe
r = await page.evaluate(() => {
  const G = window.GAME; G.jump();
  for (let n = 0; n < 1200; n++) { G.tick(1 / 120); if (G.state.phase === 'dead') return G.state; }
  return G.state;
});
assert.equal(r.phase, 'dead', 'man dør i lavaen, når man ikke hopper videre');
assert.ok(r.player.y < 0.1, 'spilleren nåede lavaen');
assert.equal(sendte.length, 1, 'ingen ny post uden ny rekord');

// Skifter man navn bagefter, rettes ens egen række på listen (PATCH med kvitteringen fra gemningen)
await page.locator('#menuBtn').click();
await page.locator('#nameBtn').click();
await page.locator('#nameInput').fill('Sofie B');
await page.locator('#nameInput').press('Enter');
await page.waitForFunction(() => document.querySelector('#hsListe .hs-raekke .hs-navn') && document.querySelector('#hsListe .hs-raekke').textContent.includes('Sofie B'));
assert.deepEqual(patchede, [{ sti: '/api/highscore/obby/99', navn: 'Sofie B', token: 'hemmelig' }], 'navneskift retter egen række');
assert.equal(await page.locator('#hsListe .hs-mig .hs-navn').textContent(), 'Sofie B');
await page.locator('#nameBtn').click();
await page.locator('#nameInput').fill('Sofie');
await page.locator('#nameInput').press('Enter');
await page.waitForTimeout(150);
assert.equal(patchede.length, 2);
await page.getByRole('button', { name: 'Spil', exact: true }).click();

// Menu → toplisten hentes igen, Spil → tilbage på checkpointet
await page.locator('#menuBtn').click();
assert.ok(await page.locator('#startScreen.on').isVisible());
assert.ok(await page.locator('#menuBtn').isHidden());
assert.equal(await page.locator('#rekordVal').textContent(), String(best), 'Rekord på startskærmen');
await page.getByRole('button', { name: 'Spil', exact: true }).click();
r = await page.evaluate(() => window.GAME.state);
assert.equal(r.phase, 'ready'); assert.equal(r.player.on, 120);

// Ingen vandret scroll
assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'ingen vandret scroll');

// Genindlæs: rekord og navn huskes; en ny bane med samme seed er identisk
await page.reload();
await page.waitForSelector('#hsListe .hs-liste');
assert.equal(await page.locator('#rekordVal').textContent(), String(best));
assert.ok((await page.locator('#nameBtn').textContent()).startsWith('Sofie'));
const st1 = await page.evaluate(() => window.GAME.state);
assert.deepEqual(st1.platforms.slice(0, 6).map(p => [p.i, p.x, p.w, p.y]), st0.platforms.slice(0, 6).map(p => [p.i, p.x, p.w, p.y]), 'samme seed giver samme bane');

/* ---------- EASY · HARD · IMPOSIBOL (Sofies ønske nr. 51) ---------- */
// «easy skal gå meget langsomt, hard hurtigere og imposibol mega fkn hurtig».
// Graden ganges på tempoet – altså på tiden – så det er den samme bane i alle
// tre, bare med mere eller mindre tid til hvert hop.
const gradNavne = await page.evaluate(() => [...document.querySelectorAll('#grader .grad')].map(b => b.firstChild.textContent));
assert.deepEqual(gradNavne, ['EASY', 'HARD', 'IMPOSIBOL'], 'de tre grader står med Sofies egne navne');
// Startskærmen har altid været højere end en telefonskærm (toplisten fylder),
// så valget står højt oppe – lige under «Lavet af» og over toplisten. Stod det
// nede ved Spil-knappen, skulle man rulle for overhovedet at opdage det.
const gradPlads = await page.evaluate(() => {
  const g = document.getElementById('grader').getBoundingClientRect();
  const hs = document.getElementById('hsListe').getBoundingClientRect();
  const kort = document.querySelector('#startScreen .card').getBoundingClientRect();
  const st = document.getElementById('startScreen').getBoundingClientRect();
  return {
    synlig: g.top >= st.top - 1 && g.bottom <= st.bottom + 1,
    inde: g.left >= kort.left - 1 && g.right <= kort.right + 1,
    overListen: g.bottom <= hs.top + 1,
    paaEnRaekke: g.height < 90,
    knapHoej: document.querySelector('#grader .grad').getBoundingClientRect().height >= 44,
  };
});
assert.ok(gradPlads.synlig, 'knapperne kan ses uden at rulle');
assert.ok(gradPlads.inde, 'de holder sig inden for startkortet');
assert.ok(gradPlads.overListen, 'de står før toplisten, altså i toppen af skærmen');
assert.ok(gradPlads.paaEnRaekke, 'de tre står på én række');
assert.ok(gradPlads.knapHoej, 'hver knap er stor nok til en finger');

let gs = await page.evaluate(() => window.GAME.state);
assert.equal(gs.grad, 'svaer', 'HARD er standard – det er det spil, børnene kender');
assert.equal(gs.gradTempo, 1, 'HARD er uændret');
assert.equal(await page.locator('#grader .grad.valgt').getAttribute('data-grad'), 'svaer');
assert.ok(await page.locator('#gradNote').isHidden(), 'HARD behøver ingen forklaring');
await page.screenshot({ path: SHOTS + 'obby-grader.png' });

/** Vælg en grad på startskærmen, start, og mål hvor stærkt det så går (enheder pr. virkeligt sekund). */
async function maalGrad(id) {
  await page.evaluate(() => window.GAME.tilMenu());
  await page.locator(`#grader .grad[data-grad="${id}"]`).click();
  const menu = await page.evaluate(() => window.GAME.state);
  await page.getByRole('button', { name: 'Spil', exact: true }).click();
  const m = await maalFart(0.25);
  return { menu, spil: await page.evaluate(() => window.GAME.state), enhederPrSek: m.langt / 0.25 };
}

const let_ = await maalGrad('let');
assert.equal(let_.menu.grad, 'let');
assert.equal(let_.menu.checkpoint, 0, 'en ny grad begynder forfra på banen');
assert.equal(let_.menu.best, 0, 'EASY har sin egen rekord – HARD-rekorden bliver stående');
assert.equal(await page.locator('#gradHud').textContent(), 'EASY', 'HUD\'en siger hvad man spiller');
assert.ok(let_.enhederPrSek < 5, `EASY går meget langsomt (${let_.enhederPrSek.toFixed(1)} enheder/sek.)`);

// Banen kan stadig gennemføres – den er den samme, uret går bare langsommere
let br = await bot(40);
assert.ok(!br.doed, `botten klarer EASY (nåede ${br.paa})`);
const coinsEasy = (await page.evaluate(() => window.GAME.state)).coins;
assert.ok(coinsEasy > 0, 'der er også coins at hente på EASY');

// EASY tæller ikke med på den fælles topliste: et hop dér er nemmere end et hop
// i HARD, og listen er den samme som før sværhedsgraderne.
const foerSendte = sendte.length;
const easyStreak = (await page.evaluate(() => window.GAME.state)).streak;
await page.evaluate(() => window.GAME.die());
assert.ok(await page.locator('#nyRekord').isVisible(), 'EASY har sin egen personlige rekord');
await page.waitForTimeout(250);
assert.equal(sendte.length, foerSendte, 'EASY-hop ryger ikke på toplisten');
assert.equal(await page.evaluate(() => localStorage.getItem('zydy.obby.best.let')), String(easyStreak),
  'EASY-rekorden gemmes for sig');
assert.equal(await page.evaluate(() => localStorage.getItem('zydy.obby.best')), String(best),
  'HARD-rekorden er urørt');
gs = await page.evaluate(() => window.GAME.state);
assert.equal(gs.taellerMed, false);
// (målt på selve elementet – startskærmen ligger jo bag TRY AGAIN lige nu)
const noteSkjult = () => page.evaluate(() => document.getElementById('gradNote').hidden);
assert.equal(await noteSkjult(), false, 'EASY forklarer, at hoppene ikke kommer på listen');
assert.match(await page.locator('#gradNote').textContent(), /toplisten/i);

const hard = await maalGrad('svaer');
assert.ok(hard.enhederPrSek > let_.enhederPrSek * 1.6,
  `HARD går markant hurtigere end EASY (${hard.enhederPrSek.toFixed(1)} mod ${let_.enhederPrSek.toFixed(1)})`);
assert.ok(hard.enhederPrSek > 7, 'HARD er som før: over 7 enheder/sek. fra start');
assert.equal(hard.menu.best, best, 'HARD-rekorden står der stadig');

const umulig = await maalGrad('umulig');
assert.equal(await page.locator('#gradHud').textContent(), 'IMPOSIBOL');
assert.ok(umulig.enhederPrSek > hard.enhederPrSek * 1.35,
  `IMPOSIBOL går mega hurtigt (${umulig.enhederPrSek.toFixed(1)} mod HARDs ${hard.enhederPrSek.toFixed(1)})`);
assert.ok(umulig.enhederPrSek > let_.enhederPrSek * 2.5, 'og mere end dobbelt så hurtigt som EASY');
assert.equal(await noteSkjult(), true, 'IMPOSIBOL er sværere end HARD og tæller med');
assert.equal(umulig.spil.taellerMed, true);

// Checkpointet skal være bredere, jo hurtigere uret går – ellers har man ikke tid
// til at reagere, når man genopstår langt inde.
const cpBredde = g => g.platforms.find(p => p.i === 0).w;   // startplatformen er også et checkpoint
assert.ok(cpBredde(umulig.menu) > cpBredde(let_.menu),
  'checkpoint-platformene vokser med tempoet, så der stadig er tid til at reagere');

br = await bot(45);
assert.ok(!br.doed, `botten klarer også IMPOSIBOL (nåede ${br.paa})`);
await page.evaluate(() => window.GAME.die());
await page.waitForTimeout(250);
assert.equal(sendte.length, foerSendte + 1, 'IMPOSIBOL-hop kommer derimod på den fælles topliste');
assert.equal(sendte[sendte.length - 1].navn, 'Sofie');

// Valget huskes til næste gang
await page.reload();
await page.waitForSelector('#hsListe .hs-liste');
gs = await page.evaluate(() => window.GAME.state);
assert.equal(gs.grad, 'umulig', 'sværhedsgraden huskes');
assert.equal(await page.locator('#grader .grad.valgt').getAttribute('data-grad'), 'umulig');
await page.locator('#grader .grad[data-grad="svaer"]').click();
assert.equal((await page.evaluate(() => window.GAME.state)).grad, 'svaer');

// Midt i et løb kan man ikke skrue ned for farten
await page.getByRole('button', { name: 'Spil', exact: true }).click();
await page.evaluate(() => window.GAME.vaelgGrad('let'));
assert.equal((await page.evaluate(() => window.GAME.state)).grad, 'svaer', 'graden kan kun skiftes på startskærmen');

/* ---------- Musik på banen (Sofies ønske nr. 53) ---------- */
// «Kan du add så at nå du er på banen kommer der sange på en ny sang være runde»
// – musik, mens man er på banen, og en ny sang for hver runde.
const sange = await page.evaluate(() => window.GAME.sange);
assert.ok(sange.length >= 4, `der er flere sange at trække imellem (${sange.length})`);
assert.equal(new Set(sange.map(s => s.navn)).size, sange.length, 'sangene har hver sit navn');

await page.evaluate(() => window.GAME.tilMenu());
let mus = (await page.evaluate(() => window.GAME.state)).musik;
assert.equal(mus.spiller, false, 'der er stille på startskærmen – musikken hører til på banen');
assert.ok(await page.locator('#sangHud').isHidden(), 'og så står der ingen sang i HUD\'en');
assert.equal(mus.antal, sange.length);

// Første runde: start fra menuen. Derefter en runde ad gangen: dø, vent, tryk.
await page.getByRole('button', { name: 'Spil', exact: true }).click();
const spilleliste = [];
for (let runde = 0; runde < 6; runde++) {
  if (runde > 0) {
    await page.evaluate(() => window.GAME.die());
    await page.evaluate(() => { const G = window.GAME; for (let n = 0; n < 120; n++) G.tick(1 / 120); G.jump(); });
  }
  mus = (await page.evaluate(() => window.GAME.state)).musik;
  assert.ok(mus.sang, `runde ${runde + 1} har en sang`);
  assert.equal(mus.spiller, true, `runde ${runde + 1} spiller musik, mens man er på banen`);
  assert.equal(await page.locator('#sangHud').textContent(), '♪ ' + mus.sang, 'HUD\'en siger hvad der spiller');
  assert.ok(await page.locator('#sangHud').isVisible(), 'sangens navn kan ses, mens man løber');
  if (runde > 0) assert.notEqual(mus.sang, spilleliste[runde - 1], 'ny runde = ny sang – aldrig den samme to gange i træk');
  spilleliste.push(mus.sang);
}
assert.ok(new Set(spilleliste).size >= 4, `seks runder giver mange forskellige sange (${new Set(spilleliste).size})`);
assert.ok(spilleliste.every(n => sange.some(s => s.navn === n)), 'sangene kommer fra musik.mjs');
await page.screenshot({ path: SHOTS + 'obby-musik.png' });

// Dør man, holder musikken op – TRY AGAIN skal være stille, og næste runde har sin egen sang
await page.evaluate(() => window.GAME.die());
mus = (await page.evaluate(() => window.GAME.state)).musik;
assert.equal(mus.spiller, false, 'musikken stopper, når man dør');
assert.ok(await page.locator('#sangHud').isHidden(), 'og sangen forsvinder fra HUD\'en');
await page.evaluate(() => { const G = window.GAME; for (let n = 0; n < 120; n++) G.tick(1 / 120); G.jump(); });

// 🔊-knappen slår musikken fra – og valget huskes
const lydKnap = page.locator('#lydBtn');
assert.ok(await lydKnap.isVisible(), 'lydknappen står i toppen, hvor man kan finde den');
const lydPlads = await lydKnap.boundingBox();
assert.ok(lydPlads.width >= 44 && lydPlads.height >= 32, 'knappen er stor nok til en finger');
assert.equal(await lydKnap.textContent(), '🔊');
await lydKnap.click();
mus = (await page.evaluate(() => window.GAME.state)).musik;
assert.equal(mus.til, false, 'musikken er slået fra');
assert.equal(mus.spiller, false);
assert.equal(await lydKnap.textContent(), '🔇');
assert.equal(await lydKnap.getAttribute('aria-pressed'), 'false');
assert.ok(await page.locator('#sangHud').isHidden(), 'ingen sang i HUD\'en, når der ikke er musik');
assert.equal(await page.evaluate(() => localStorage.getItem('zydy.obby.musik')), 'false', 'valget huskes');
// … og spillet kører videre uden lyd (et tryk sætter figuren i gang som altid)
await page.evaluate(() => { const G = window.GAME; G.jump(); for (let n = 0; n < 60; n++) G.tick(1 / 120); });
assert.equal((await page.evaluate(() => window.GAME.state)).phase, 'run', 'spillet er upåvirket af, at musikken er slået fra');
await page.evaluate(() => { const G = window.GAME; G.die(); for (let n = 0; n < 120; n++) G.tick(1 / 120); G.jump(); });
mus = (await page.evaluate(() => window.GAME.state)).musik;
assert.equal(mus.spiller, false, 'en ny runde begynder heller ikke at spille');
assert.ok(mus.sang, 'men runden har stadig sin sang klar til man skruer op igen');

await page.reload();
await page.waitForSelector('#hsListe .hs-liste, #hsListe .hs-fejl');
assert.equal(await lydKnap.textContent(), '🔇', 'musikken er stadig slået fra efter en genindlæsning');
await lydKnap.click();
assert.equal((await page.evaluate(() => window.GAME.state)).musik.til, true, 'og kan slås til igen');
assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'lydknappen giver ikke vandret scroll');

// API-fejl må ikke vælte spillet
await page.unroute('**/api/highscore/**');
await page.route('**/api/highscore/**', route => route.fulfill({ status: 500, json: { ok: false, fejl: 'test' } }));
await page.goto(`${BASE}/spil/obby/?seed=2`);
await page.waitForSelector('#hsListe .hs-fejl');
await page.getByRole('button', { name: 'Spil', exact: true }).click();
assert.equal((await page.evaluate(() => window.GAME.state)).phase, 'ready');

const relevante = errors.filter(e => !e.includes('500'));
assert.deepEqual(relevante, [], 'ingen console-fejl');
await browser.close();
console.log('OK obby');
