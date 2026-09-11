// Kør:  PLAYWRIGHT=/Users/lars/Projekter/DungeonCrawler/node_modules/playwright/index.mjs node test/stenalder.test.mjs
// (kræver at en lokal server kører: python3 -m http.server 4182 -d public)
// Regelmotoren testes særskilt i test/unit/; her testes UI'et på iPhone-størrelse.
import assert from 'node:assert/strict';
const { chromium, devices } = await import(process.env.PLAYWRIGHT ?? 'playwright');
const BASE = process.env.BASE ?? 'http://localhost:4182';
const SHOT = '/Users/lars/Projekter/Zydy/test/shots/stenalder.png';

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 13'], reducedMotion: 'no-preference' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

const noScroll = async () => {
  const r = await page.evaluate(() => {
    const g = document.querySelector('#game');
    return { w: document.documentElement.scrollWidth, iw: innerWidth, gw: g.scrollWidth, gc: g.clientWidth,
      // intet kort må stikke ud over sin række
      ud: [...document.querySelectorAll('#braet .sted, #braet .kort')].filter(e => e.getBoundingClientRect().right > innerWidth - 8).length };
  });
  assert.ok(r.w <= r.iw, `ingen vandret scroll (${r.w} > ${r.iw})`);
  assert.ok(r.gw <= r.gc, `spilfladen scroller ikke vandret (${r.gw} > ${r.gc})`);
  assert.equal(r.ud, 0, 'ingen kort stikker ud af skærmen');
};
const st = () => page.evaluate(() => GAME.state);

await page.goto(`${BASE}/spil/stenalder/?seed=5`);
await page.waitForSelector('#start.on');
assert.deepEqual(errors, [], 'siden indlæses uden fejl');
await noScroll();

// Startskærm: vælg 2 spillere og navne
await page.click('#antalSpillere button[data-n="2"]');
assert.equal(await page.locator('#navne input').count(), 2);
await page.fill('#navne input[data-i="0"]', 'Anna');
await page.fill('#navne input[data-i="1"]', 'Bo');
await page.click('#btnStart');
await page.waitForSelector('#game.on');
let s = await st();
assert.equal(s.fase, 'placering');
assert.deepEqual(s.spillere.map(p => p.navn), ['Anna', 'Bo']);
assert.equal(s.bygningsstakke.length, 2);
assert.equal(await page.locator('#braet .sted').count(), 8, '5 terningsteder + 3 landsbysteder');
assert.equal(await page.locator('#braet .kort').count(), 6, '4 kort + 2 bygningsstakke');
assert.ok((await page.locator('#banner .who').textContent()).includes('Anna'));
await noScroll();

// Placér 3 i skoven via antal-dialogen
await page.click('.sted[data-sted="skov"]');
await page.waitForSelector('#dlg.on');
await page.click('#panel .antal button[data-n="3"]');
s = await st();
assert.deepEqual(s.braet.skov, [{ spiller: 0, antal: 3 }]);
assert.equal(s.aktiv, 1);
assert.ok((await page.locator('#banner .who').textContent()).includes('Bo'));

// Fortryd
assert.ok(await page.locator('#btnFortryd').isVisible());
await page.click('#btnFortryd');
s = await st();
assert.deepEqual(s.braet.skov, []);
assert.equal(s.aktiv, 0);

// Mark placeres direkte (præcis 1)
await page.click('.sted[data-sted="mark"]');
s = await st();
assert.deepEqual(s.braet.mark, [{ spiller: 0, antal: 1 }]);
// Ulovligt tryk (Bo på marken) giver info-dialog, ikke placering
await page.click('.sted[data-sted="mark"]');
await page.waitForSelector('#dlg.on');
assert.ok((await page.locator('#panel h2').textContent()).includes('Mark'));
await page.click('#panel [data-luk]');
s = await st();
assert.equal(s.braet.mark.length, 1);

// Genindlæs uden seed: spillet skal kunne fortsættes
await page.goto(`${BASE}/spil/stenalder/`);
await page.waitForSelector('#start.on');
assert.ok(await page.locator('#btnFortsaet').isVisible(), 'Fortsæt-knappen vises');
await page.click('#btnFortsaet');
await page.waitForSelector('#game.on');
s = await st();
assert.equal(s.braet.mark.length, 1, 'tilstanden overlevede genindlæsning');
assert.equal(s.spillere[0].navn, 'Anna');

// Spil resten igennem: dialogerne betjenes via UI'et, resten tilfældigt
let skridt = 0, setDialoger = new Set(), redskabsBrug = 0;
while (true) {
  s = await st();
  if (s.fase === 'slut') break;
  assert.ok(++skridt < 4000, 'spillet slutter aldrig');
  const a = s.afventer;
  if (a) {
    await page.waitForSelector('#dlg.on');
    setDialoger.add(a.type);
    if (a.type === 'redskaber') {
      assert.equal(await page.locator('#panel .die').count(), a.kast.length, 'terningerne vises');
      const chips = page.locator('#panel .chip');
      const n = await chips.count();
      for (let i = 0; i < n; i++) await chips.nth(i).click();
      if (n) redskabsBrug++;
      await page.click('#btnTag');
    } else if (a.type === 'betalKort' || a.type === 'betalBygning') {
      // Prøv at betale via +-knapperne, ellers afstå
      const foer = s.spillere[a.spiller].kort.length + s.spillere[a.spiller].bygninger.length;
      for (let i = 0; i < 8; i++) {
        const knap = page.locator('#panel .stp button[data-inc]:not([disabled])').first();
        if (!(await knap.count())) break;
        await knap.click();
        if (!(await page.locator('#btnBetal').isDisabled())) break;
      }
      if (!(await page.locator('#btnBetal').isDisabled())) {
        await page.click('#btnBetal');
        const efter = await st();
        // "Træk et kort"-kortet giver to kort på én gang
        assert.ok(efter.spillere[a.spiller].kort.length + efter.spillere[a.spiller].bygninger.length >= foer + 1, 'købet gik igennem');
      } else await page.click('#btnAfstaa');
    } else if (a.type === 'terningkort') {
      assert.ok((await page.locator('#banner .who').textContent()).includes(s.spillere[a.spiller].navn), 'banneret viser, hvem der vælger');
      await page.click('#panel .valg button:not([disabled])');
    } else if (a.type === 'fodring') {
      if (skridt % 2) await page.click('#btnSult');
      else {
        for (let i = 0; i < 12 && await page.locator('#btnFodr').isDisabled(); i++) {
          const knap = page.locator('#panel .stp button[data-inc]:not([disabled])').first();
          if (!(await knap.count())) break;
          await knap.click();
        }
        if (await page.locator('#btnFodr').isDisabled()) await page.click('#btnSult'); else await page.click('#btnFodr');
      }
    }
    continue;
  }
  if (s.fase === 'placering' && skridt % 3 === 0) {
    // Tryk på et lovligt sted i UI'et
    const lovlige = await page.evaluate(() => GAME.lovligePlaceringer());
    const m = lovlige[0];
    await page.click(`[data-sted="${m.sted}"]`);
    if (m.min !== m.max) await page.click(`#panel .antal button[data-n="${m.min}"]`);
    continue;
  }
  if (s.fase === 'handling' && skridt % 3 === 0) {
    const sted = s.spillere[s.aktiv].placeringer[0].sted;
    await page.click(`[data-sted="${sted}"]`);
    continue;
  }
  assert.ok(await page.evaluate(() => GAME.tilfaeldig()), 'tilfældig handling lykkedes');
  if (skridt % 40 === 0) await noScroll();
}
assert.ok(s.runde >= 4, `et rigtigt spil tager flere runder (${s.runde})`);
assert.ok(setDialoger.has('redskaber') && setDialoger.has('fodring'), `dialoger set: ${[...setDialoger]}`);
await page.waitForSelector('#dlg.on .vinder');
const vinder = await page.locator('#panel .vinder').textContent();
assert.ok(vinder.includes(s.spillere[s.resultat.vinder].navn));
assert.equal(await page.locator('#panel .slutscore tbody tr').count(), 8, 'syv scorelinjer + i alt');
await noScroll();
await page.screenshot({ path: SHOT, fullPage: false });

// Efter slut er det gemte spil slettet, og "Nyt spil" giver startskærmen
await page.click('#btnNyt');
await page.waitForSelector('#start.on');
assert.ok(!(await page.locator('#btnFortsaet').isVisible()));

assert.deepEqual(errors, [], 'ingen fejl i konsollen');
await browser.close();
console.log(`stenalder OK (${skridt} skridt, ${s.runde} runder, redskaber brugt ${redskabsBrug} gange)`);
