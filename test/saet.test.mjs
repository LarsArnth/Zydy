// Kør:  PLAYWRIGHT=/Users/lars/Projekter/DungeonCrawler/node_modules/playwright/index.mjs node test/saet.test.mjs
// (kræver at en lokal server kører: python3 -m http.server 4182 -d public)
import assert from 'node:assert/strict';
const { chromium, devices } = await import(process.env.PLAYWRIGHT ?? 'playwright');
const BASE = process.env.BASE ?? 'http://localhost:4182';
const SHOT = '/Users/lars/Projekter/Zydy/test/shots/saet.png';

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 13'], reducedMotion: 'no-preference' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

// Mock af højscore-API'et (én liste pr. tilstand). Klassisk: asc, Blitz: desc. Min for klassisk sættes
// højt (10 min.), så testens gennemspil aldrig kvalificerer, uanset hvor lang tid det tager.
const regler = { 'saet-klassisk': { retning: 'asc', min: 600, maks: 10800 }, 'saet-blitz': { retning: 'desc', min: 1, maks: 60 } };
const lister = { 'saet-klassisk': [{ id: 1, navn: 'Mor', score: 65, oprettet: '2026-09-12T10:00:00.000Z' }], 'saet-blitz': [] };
const sendte = [];
await page.route('**/api/highscore/**', async route => {
  const req = route.request(), spil = new URL(req.url()).pathname.split('/').pop();
  const r = regler[spil];
  if (!r) return route.fulfill({ status: 404, json: { ok: false, fejl: 'Ukendt spil' } });
  if (req.method() === 'POST') {
    const krop = req.postDataJSON(); sendte.push({ spil, ...krop });
    const ny = { id: 900 + sendte.length, navn: krop.navn, score: krop.score, oprettet: '2026-09-12T12:00:00.000Z' };
    const tegn = r.retning === 'asc' ? 1 : -1;
    lister[spil] = [...lister[spil], ny].sort((a, b) => tegn * (a.score - b.score)).slice(0, 10);
    return route.fulfill({ json: { ok: true, id: ny.id, placering: lister[spil].indexOf(ny) + 1, ...r, liste: lister[spil] } });
  }
  return route.fulfill({ json: { spil, ...r, liste: lister[spil] } });
});

await page.goto(`${BASE}/spil/saet/?seed=1`);
await page.waitForSelector('#start.on');

// Startskærmen: forklaring + eksempler + ingen scroll
assert.equal(await page.locator('#examples .ex').count(), 3, 'tre eksempler på startskærmen');
const noScroll = async () => {
  const r = await page.evaluate(() => ({
    w: document.documentElement.scrollWidth, iw: innerWidth,
    h: document.documentElement.scrollHeight, ih: innerHeight,
  }));
  assert.ok(r.w <= r.iw, `ingen vandret scroll (${r.w} > ${r.iw})`);
  return r;
};
await noScroll();
const startFit = await page.locator('#start').evaluate(el => ({ sh: el.scrollHeight, ch: el.clientHeight }));
assert.ok(startFit.sh <= startFit.ch, `startskærmen fylder skærmen uden scroll (${startFit.sh} > ${startFit.ch})`);

// isSet på håndlavede eksempler (id = antal + 3*form + 9*farve + 27*fyld)
const setChecks = await page.evaluate(() => {
  const c = (a, f, k, y) => a + 3 * f + 9 * k + 27 * y;
  return {
    sameColorFill: GAME.isSet(c(0,0,0,0), c(1,1,0,0), c(2,2,0,0)),          // gyldigt
    allDifferent:  GAME.isSet(c(0,0,0,0), c(1,1,1,1), c(2,2,2,2)),          // gyldigt
    allSameButOne: GAME.isSet(c(0,0,0,0), c(1,0,0,0), c(2,0,0,0)),          // gyldigt: kun antal varierer
    badColor:      GAME.isSet(c(0,0,0,0), c(1,0,1,0), c(2,0,1,0)),          // ugyldigt: farve 0,1,1
    badFill:       GAME.isSet(c(0,0,0,0), c(1,1,1,0), c(2,2,2,1)),          // ugyldigt: fyld 0,0,1
    duplicate:     GAME.isSet(5, 5, 7),                                     // ugyldigt: samme kort
    objects:       GAME.isSet(GAME.card(0), GAME.card(4), GAME.card(8)),    // objekter i stedet for id'er
    badAttrs:      GAME.badAttrs(c(0,0,0,0), c(1,0,1,0), c(2,0,1,0)),
  };
});
assert.equal(setChecks.sameColorFill, true);
assert.equal(setChecks.allDifferent, true);
assert.equal(setChecks.allSameButOne, true);
assert.equal(setChecks.badColor, false);
assert.equal(setChecks.badFill, false);
assert.equal(setChecks.duplicate, false);
assert.equal(setChecks.objects, true);
assert.deepEqual(setChecks.badAttrs, ['farve']);

// Start klassisk via knappen
await page.click('#btnKlassisk');
await page.waitForSelector('#game.on');
let st = await page.evaluate(() => GAME.state);
assert.equal(st.mode, 'klassisk');
assert.ok(st.board.length >= 12, 'mindst 12 kort på bordet');
assert.equal(st.board.length + st.deck, 81, 'bord + bunke = 81 kort');
assert.equal(await page.locator('#board .card').count(), st.board.length, 'DOM matcher bordet');
await noScroll();
// Bordet må ikke stikke ud under skærmen
const boardBox = await page.locator('#board').boundingBox();
const vp = page.viewportSize();
assert.ok(boardBox.y + boardBox.height <= vp.height, 'bordet er inden for skærmen');

// Find et sæt og vælg det via klik på DOM-elementerne
const sets = await page.evaluate(() => GAME.findSets());
assert.ok(sets.length > 0, 'der findes et sæt på bordet');
const deckBefore = st.deck;
for (const i of sets[0]) await page.click(`#board .card[data-i="${i}"]`);
st = await page.evaluate(() => GAME.state);
assert.equal(st.found, 1, 'ét sæt fundet');
// Bunken er 3 mindre – plus evt. 3 ekstra hvis der ikke var noget sæt efter opfyldning
const extra = st.board.length - 12;
assert.equal(st.deck, deckBefore - 3 - extra, 'bunken er 3 mindre (plus evt. ekstra kort)');
assert.ok(st.busy, 'animation kører');
// Kortene glimter mint
assert.equal(await page.locator('#board .card.good').count(), 3, 'tre kort markeret som rigtige');
await page.waitForFunction(() => !GAME.state.busy);
assert.equal(await page.locator('#board .card.enter').count(), 3 + extra, 'nye kort gled ind');
assert.equal(await page.locator('#board .card').count(), 12 + extra, 'bordet har 12 kort (plus evt. ekstra)');
if (extra) assert.match(await page.locator('#msg').innerText(), /Intet sæt/, 'besked om ekstra kort');

// Vælg bevidst tre kort der IKKE er et sæt, og tjek fejlbeskeden
const badTriple = await page.evaluate(() => {
  const b = GAME.state.board;
  for (let i = 0; i < b.length; i++) for (let j = i + 1; j < b.length; j++) for (let k = j + 1; k < b.length; k++)
    if (!GAME.isSet(b[i], b[j], b[k])) return [i, j, k];
  return null;
});
assert.ok(badTriple, 'der findes en ikke-sæt-kombination');
for (const i of badTriple) await page.click(`#board .card[data-i="${i}"]`);
const msg = await page.locator('#msg').evaluate(el => ({ text: el.textContent, cls: el.className }));
assert.ok(msg.cls.includes('bad') && msg.cls.includes('show'), 'fejlbesked vises');
assert.ok(/passer ikke|hverken ens/.test(msg.text), `fejlbeskeden forklarer egenskaben: "${msg.text}"`);
assert.equal(await page.locator('#board .card.bad').count(), 3, 'tre kort ryster');
await page.waitForFunction(() => !GAME.state.busy);
st = await page.evaluate(() => GAME.state);
assert.equal(st.found, 1, 'fejl gav ikke point');
assert.deepEqual(st.selected, [], 'valget er nulstillet efter fejl');

// Hint: ét kort fra et gyldigt sæt lyser
await page.click('#btnHint');
assert.equal(await page.locator('#board .card.hint').count(), 1, 'ét hint-kort lyser');
st = await page.evaluate(() => GAME.state);
assert.equal(st.hints, 1);
const hinted = await page.locator('#board .card.hint').getAttribute('data-i');
const hintOk = await page.evaluate(i => GAME.findSets().some(s => s.includes(i)), Number(hinted));
assert.ok(hintOk, 'hint-kortet er del af et sæt');

// Screenshot midt i spillet (med et par valgte kort)
const sets2 = await page.evaluate(() => GAME.findSets());
await page.click(`#board .card[data-i="${sets2[0][0]}"]`);
await page.click(`#board .card[data-i="${sets2[0][1]}"]`);
await page.waitForTimeout(250); // lad løft-animationen blive færdig
await page.screenshot({ path: SHOT });
await page.click(`#board .card[data-i="${sets2[0][0]}"]`); // fravælg igen
await page.click(`#board .card[data-i="${sets2[0][1]}"]`);
st = await page.evaluate(() => GAME.state);
assert.deepEqual(st.selected, [], 'fravalg virker');

// Spil hele bunken igennem via GAME
await page.evaluate(() => localStorage.removeItem('zydy.saet.bestKlassisk'));
let rounds = 0, sawExtra = false;
while (rounds++ < 60) {
  const s = await page.evaluate(() => GAME.state);
  if (s.over) break;
  if (s.board.length > 12) sawExtra = true;
  const found = await page.evaluate(() => GAME.findSets());
  assert.ok(found.length > 0 || s.deck === 0, 'der er altid et sæt mens bunken ikke er tom');
  if (!found.length) break;
  await page.evaluate(set => set.forEach(i => GAME.select(i)), found[0]);
  await page.waitForFunction(() => !GAME.state.busy);
}
st = await page.evaluate(() => GAME.state);
assert.ok(st.over, 'spillet er slut');
assert.equal(st.deck, 0, 'bunken er tom');
assert.ok(st.found >= 20, `mange sæt fundet (${st.found})`);
assert.equal(await page.evaluate(() => GAME.findSets().length), 0, 'ingen sæt tilbage');
await page.waitForSelector('#end.on');
const endText = await page.locator('#end .panel').innerText();
assert.match(endText, /Bunken er tom/);
assert.match(endText, /Ny rekord/);
assert.ok(await page.locator('#confetti i').count() > 0, 'konfetti ved rekord');
const best = await page.evaluate(() => localStorage.getItem('zydy.saet.bestKlassisk'));
assert.ok(best != null && Number(best) >= 0, 'bedste tid gemt');
assert.equal(await page.locator('#endHints').innerText(), '1', 'hints vises i resultatet');
// Toplisten (Klassisk): testens tid er under mockens min, så ingen formular – bare listen med Mors tid som m:ss
await page.waitForSelector('#end .hs-liste');
assert.equal(await page.locator('#end .hs-form').count(), 0, 'for kort tid kvalificerer ikke');
assert.equal(await page.locator('#end .hs-raekke .hs-score').first().innerText(), '1:05', 'tid formateres m:ss');
assert.equal(await page.locator('#end .hs-titel').innerText(), 'Topliste · Klassisk');
console.log(`  klassisk: ${st.found} sæt, ekstra kort set: ${sawExtra}, bedste=${best}s`);

// Blitz: start, find ét sæt, tjek nedtælling og at slutskærmen gemmer bedste antal
await page.click('#btnMenu');
await page.waitForSelector('#start.on');
await page.evaluate(() => localStorage.removeItem('zydy.saet.bestBlitz'));
await page.click('#btnBlitz');
await page.waitForSelector('#game.on');
st = await page.evaluate(() => GAME.state);
assert.equal(st.mode, 'blitz');
assert.match(await page.locator('#timePill').innerText(), /^[12]:[0-5]\d$/, 'nedtælling vises');
const bs = await page.evaluate(() => GAME.findSets());
await page.evaluate(set => set.forEach(i => GAME.select(i)), bs[0]);
await page.waitForFunction(() => !GAME.state.busy);
// Snyd tiden frem: flyt starttidspunktet via en kunstig performance.now-offset
await page.evaluate(() => { const o = performance.now; performance.now = () => o.call(performance) + 130000; });
await page.waitForSelector('#end.on', { timeout: 3000 });
const bBest = await page.evaluate(() => localStorage.getItem('zydy.saet.bestBlitz'));
assert.equal(bBest, '1', 'bedste blitz-antal gemt');
assert.match(await page.locator('#end .panel').innerText(), /Tiden er gået/);
// Toplisten (Blitz): tom liste → ét sæt kvalificerer → navn → gemt som nr. 1
await page.waitForSelector('#end .hs-form');
assert.equal(await page.locator('#end .hs-jubel').innerText(), 'Ny rekord – du er nr. 1!');
await page.fill('#end .hs-input', 'Simon');
await page.click('#end .hs-gem');
await page.waitForSelector('#end .hs-mig');
assert.deepEqual(sendte, [{ spil: 'saet-blitz', navn: 'Simon', score: 1 }], 'sendt til blitz-listen');
assert.equal(await page.locator('#end .hs-titel').innerText(), 'Du er nr. 1!');
assert.equal(await page.locator('#end .hs-mig .hs-score').innerText(), '1', 'antal sæt formateres ikke som tid');

// Spil igen-knappen starter samme tilstand
await page.click('#btnAgain');
await page.waitForSelector('#game.on');
assert.equal(await page.evaluate(() => GAME.state.mode), 'blitz');
await noScroll();

// Startskærmens "Topliste" viser begge lister
await page.click('#btnStop');
await page.waitForSelector('#start.on');
await page.click('#btnListe');
await page.waitForSelector('#hsK .hs-liste');
await page.waitForSelector('#hsB .hs-liste');
assert.equal(await page.locator('#hsK .hs-titel').innerText(), 'Klassisk · hurtigste tid');
assert.equal(await page.locator('#hsB .hs-mig').count(), 0, 'ingen fremhævning uden ny score');
assert.equal(await page.locator('#hsB .hs-navn').first().innerText(), 'Simon');
await noScroll();

assert.deepEqual(errors, [], 'ingen console-fejl');
await browser.close();
console.log('OK saet');
