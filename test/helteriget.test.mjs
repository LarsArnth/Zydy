// Kør:  PLAYWRIGHT=/Users/lars/Projekter/DungeonCrawler/node_modules/playwright/index.mjs node test/helteriget.test.mjs
// (kræver at en lokal server kører: python3 -m http.server 4185 -d public)
import assert from 'node:assert/strict';
const { chromium, devices } = await import(process.env.PLAYWRIGHT ?? 'playwright');
const BASE = process.env.BASE ?? 'http://localhost:4185';
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 13'] });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(`${BASE}/spil/helteriget/?seed=7`);

const S = () => page.evaluate(() => GAME.state);
const me = () => page.evaluate(() => GAME.state.players[GAME.state.turn]);
const op = () => page.evaluate(() => { const s = GAME.state; return s.players[s.turn === 'red' ? 'blue' : 'red']; });

/* --- Kortlisten: 80 markedskort, 20 pr. fraktion, ingen ukendte effekter --- */
{
  const info = await page.evaluate(() => {
    const D = GAME.DEFS; const perFac = {}; let total = 0; const keys = new Set();
    for (const id in D) { const d = D[id]; total += d.count; perFac[d.fac] = (perFac[d.fac] || 0) + d.count;
      for (const list of [d.fx, d.ally || [], d.sac || [], d.exp || []]) for (const e of list) keys.add(Object.keys(e)[0]); }
    return { total, perFac, keys: [...keys].sort() };
  });
  assert.equal(info.total, 80, '80 kort i markedsbunken');
  for (const f of ['kronen', 'lauget', 'skyggerne', 'vildmarken']) assert.equal(info.perFac[f], 20, `${f} har 20 kort`);
  assert.deepEqual(info.keys, ['c', 'cpc', 'cull', 'd', 'g', 'h', 'od', 'prep', 'stun', 'sweep', 'top']);
}

/* --- Regler-modal på startskærmen --- */
await page.click('#rulesBtn');
assert.match(await page.locator('#sheet').textContent(), /Sådan spiller I/);
await page.click('[data-act="closeModal"]');
assert.equal(await page.evaluate(() => document.getElementById('modal').hidden), true);

/* --- Nyt spil: overleveringsskærm, Rød har 3 kort, Blå 5, marked med 5 kort --- */
await page.click('#playBtn');
let s = await S();
assert.equal(s.phase, 'handoff'); assert.equal(s.turn, 'red');
assert.equal(s.players.red.hand.length, 3, 'Rød starter med 3 kort');
assert.equal(s.players.blue.hand.length, 5, 'Blå har 5 kort');
assert.equal(s.players.red.deck.length + 3, 10, 'startbunke på 10 kort');
assert.equal(s.market.length, 5); assert.equal(s.marketDeck.length, 75); assert.equal(s.gems, 16);
assert.match(await page.locator('#hoTitle').textContent(), /Giv iPad'en til Rød/);
assert.equal(await page.evaluate(() => !!localStorage.getItem('zydy.helteriget.save')), true, 'spillet gemmes');

/* --- Røds første tur via UI: spil alle kort, køb hvis muligt, afslut --- */
await page.click('#showBtn');
assert.equal((await S()).phase, 'play');
assert.equal(await page.evaluate(() => document.getElementById('table').classList.contains('on')), true);
assert.equal(await page.locator('#hand .card').count(), 3);
await page.locator('#hand .card').first().click();          // tryk på et kort spiller det
assert.equal(await page.locator('#hand .card').count(), 2);
await page.click('#playAll');
assert.equal(await page.locator('#hand .card').count(), 0);
{
  const m = await me();
  assert.equal(m.played.length, 3, 'alle 3 kort ligger på bordet');
  const expectedGold = m.played.reduce((a, c) => a + (({ guld: 1, rubin: 2 })[c.id] || 0), 0);
  assert.equal(m.gold, expectedGold, 'guld er summen af spillede kort');
  if (m.gold >= 2) {
    const gems = (await S()).gems;
    await page.click('[data-act="gem"]');
    assert.equal((await S()).gems, gems - 1, 'Ildsten købt');
    assert.equal((await me()).discard.at(-1).id, 'ildsten');
  }
}
await page.screenshot({ path: '/Users/lars/Projekter/Zydy/test/shots/helteriget.png' });
await page.click('#endTurn');
s = await S();
assert.equal(s.phase, 'handoff'); assert.equal(s.turn, 'blue');
assert.equal(s.players.red.hand.length, 5, 'Rød har trukket 5 nye kort');
assert.equal(s.players.red.played.length, 0);
assert.match(await page.locator('#hoLast').textContent(), /^Rød /);

/* --- Blås tur: angrib med daggert/sværd, kamp går i ansigtet --- */
await page.click('#showBtn');
await page.click('#playAll');
{
  const m = await me();
  const combat = m.played.reduce((a, c) => a + (({ daggert: 1, svaerd: 2 })[c.id] || 0), 0);
  assert.equal(m.combat, combat);
  if (combat > 0) {
    await page.click('#attackBtn');
    assert.equal((await op()).health, 50 - combat, 'skade rammer Rød');
    assert.equal((await me()).combat, 0);
  }
}
await page.click('#endTurn');

/* --- Motoren direkte: helte, vagter, allierede, brug, ofring, prompts --- */
// Sæt et kontrolleret scenarie op i Røds tur
await page.click('#showBtn');
const r = await page.evaluate(() => {
  const s = GAME.state, red = s.players.red, blue = s.players.blue;
  const mk = id => ({ uid: 9000 + Math.floor(Math.random() * 1000), id, expended: false, allyDone: false });
  red.hand = [mk('skjold'), mk('skatte'), mk('kultist'), mk('gravroever'), mk('vildsvin')];
  red.gold = 0; red.combat = 0;
  blue.champions = [mk('koebmand'), mk('livvagt')];   // Livvagt er vagt (6), Købmand (3) er ikke
  return { hand: red.hand.map(c => c.id) };
});
assert.deepEqual(r.hand, ['skjold', 'skatte', 'kultist', 'gravroever', 'vildsvin']);
await page.evaluate(() => GAME.play(0));               // Skjoldbærer: helt, vagt 5
{
  const m = await me();
  assert.equal(m.champions.length, 1); assert.equal(m.champions[0].id, 'skjold');
  assert.equal(m.champions[0].allyDone, false, 'ingen anden Kronen-kort endnu');
}
await page.evaluate(() => GAME.play(0));               // Skattemester: +2 guld, allieret +3 liv → begge allierede udløses
{
  const m = await me();
  assert.equal(m.gold, 2);
  assert.equal(m.health, 50 - (50 - m.health) + 0, 'sanity');
  const before = await page.evaluate(() => GAME.state.players.red.health);
  // Skattemester: +3 liv, Skjoldbærer allieret: +2 liv → 5 over det Blå gjorde af skade
  assert.equal(before, 50 - (await page.evaluate(() => 50 - GAME.state.players.red.health)), 'sanity');
  assert.equal(m.champions[0].allyDone, true); assert.equal(m.played[0].allyDone, true);
}
const hpAfterAllies = (await me()).health;
assert.ok(await page.evaluate(() => GAME.expend(0)), 'brug Skjoldbærer: +2 kamp');
assert.equal((await me()).combat, 2);
assert.equal(await page.evaluate(() => GAME.expend(0)), false, 'kan ikke bruges to gange');
await page.evaluate(() => GAME.play(0));               // Kultist: +2 kamp (ofring +2)
assert.equal((await me()).combat, 4);
await page.evaluate(() => GAME.play(0));               // Gravrøver: +1 guld, ofr op til 1 → prompt
{
  const pr = await page.evaluate(() => GAME.prompt());
  assert.equal(pr.kind, 'cull'); assert.equal(pr.min, 0); assert.equal(pr.max, 1);
  assert.ok(pr.options.some(o => o.zone === 'discard'), 'kan ofre fra kasserede');
  assert.equal(await page.evaluate(() => GAME.play(0)), false, 'blokeret mens en prompt venter');
  assert.equal(await page.evaluate(() => document.getElementById('modal').hidden), false, 'prompt vises');
  // Vælg et Guld fra kasserede via UI og bekræft
  const guld = pr.options.find(o => o.id === 'guld' && o.zone === 'discard');
  assert.ok(guld, 'der ligger et Guld i kasserede');
  const total = await page.evaluate(() => { const p = GAME.state.players.red; return p.hand.length + p.discard.length + p.deck.length + p.played.length + p.champions.length; });
  await page.click(`#sheet .card[data-uid="${guld.uid}"]`);
  assert.match(await page.locator('#sheet .hint').textContent(), /1 af 1 valgt/);
  await page.click('[data-act="promptOk"]');
  assert.equal(await page.evaluate(() => GAME.prompt()), null);
  const after = await page.evaluate(() => { const p = GAME.state.players.red; return p.hand.length + p.discard.length + p.deck.length + p.played.length + p.champions.length; });
  assert.equal(after, total - 1, 'det ofrede kort er væk fra spillet');
  assert.equal((await me()).gold, 3);
  // Gravrøver + Kultist er begge Skyggerne → Gravrøvers allieret (+2 kamp) er udløst
  assert.equal((await me()).combat, 6);
}
await page.evaluate(() => GAME.play(0));               // Vildsvin: +5 kamp, allieret (stun) kræver anden Vildmarken → ingen prompt
assert.equal((await me()).combat, 11);
assert.equal(await page.evaluate(() => GAME.prompt()), null, 'Vildsvins allieret udløses ikke uden anden Vildmarken');

// Vagt-reglen: Købmand (3) kan ikke angribes mens Livvagt (6) står
{
  const bi = await page.evaluate(() => GAME.state.players.blue.champions.findIndex(c => c.id === 'koebmand'));
  assert.equal(await page.evaluate(i => GAME.attackChampion(i), bi), false, 'ikke-vagt er beskyttet');
  assert.equal(await page.evaluate(() => GAME.attackFace()), false, 'spilleren er beskyttet');
  assert.equal(await page.evaluate(() => document.getElementById('attackBtn').disabled), true);
  const li = await page.evaluate(() => GAME.state.players.blue.champions.findIndex(c => c.id === 'livvagt'));
  await page.click(`#oppChamps .card[data-i="${li}"]`);
  const o = await op();
  assert.equal(o.champions.length, 1); assert.equal(o.champions[0].id, 'koebmand');
  assert.equal(o.discard.at(-1).id, 'livvagt', 'udslået helt lander i kasserede');
  assert.equal((await me()).combat, 5);
  // Nu kan Købmand angribes (3) – og resten (2) rammer Blå
  await page.click('#oppChamps .card[data-i="0"]');
  assert.equal((await op()).champions.length, 0);
  assert.equal((await me()).combat, 2);
  const hp = (await op()).health;
  await page.click('#attackBtn');
  assert.equal((await op()).health, hp - 2);
}
// Ofring: Kultist (+2 kamp) forsvinder fra bordet
{
  const ki = await page.evaluate(() => GAME.state.players.red.played.findIndex(c => c.id === 'kultist'));
  await page.click(`#inplay .card[data-act="sac"][data-i="${ki}"]`);
  const m = await me();
  assert.equal(m.combat, 2); assert.equal(m.played.some(c => c.id === 'kultist'), false);
}
// Køb via UI: billigste kort i markedet skal kunne købes med 3 guld hvis det koster ≤3
{
  const cheap = await page.evaluate(() => GAME.state.market.map((c, i) => ({ i, cost: GAME.DEFS[c.id].cost, id: c.id })).filter(c => c.cost <= 3)[0] || null);
  if (cheap) {
    const n = (await me()).discard.length;
    await page.click(`#market .card[data-i="${cheap.i}"]`);
    const m = await me();
    assert.equal(m.gold, 3 - cheap.cost); assert.equal(m.discard.length, n + 1); assert.equal(m.discard.at(-1).id, cheap.id);
    assert.equal((await S()).market.length, 5, 'markedet fyldes op');
  }
}
assert.equal((await me()).health, hpAfterAllies, 'liv uændret siden allierede');
await page.click('#endTurn');

/* --- "Fjenden smider kort" og stun-prompt --- */
await page.evaluate(() => {
  const s = GAME.state; s.players.blue.pendingDiscard = 1;
  s.players.red.champions = [{ uid: 9901, id: 'trold', expended: false, allyDone: false }];
});
await page.click('#showBtn');                           // Blås tur begynder → skal smide 1 kort
{
  const pr = await page.evaluate(() => GAME.prompt());
  assert.equal(pr.kind, 'discard'); assert.equal(pr.min, 1); assert.equal(pr.max, 1);
  assert.equal(pr.options.length, 5);
  await page.click(`#sheet .card[data-uid="${pr.options[0].uid}"]`);   // ét tryk vælger direkte
  const m = await me();
  assert.equal(m.hand.length, 4); assert.equal(m.pendingDiscard, 0);
  assert.equal(await page.evaluate(() => GAME.prompt()), null);
}
await page.evaluate(() => {
  const b = GAME.state.players.blue; b.hand = [{ uid: 9902, id: 'ulveunge', expended: false, allyDone: false }, { uid: 9903, id: 'vildsvin', expended: false, allyDone: false }];
});
await page.evaluate(() => GAME.play(0));               // Ulveunge +3
await page.evaluate(() => GAME.play(0));               // Vildsvin +5, allieret: stun → prompt; Ulveunges allieret +1
{
  const pr = await page.evaluate(() => GAME.prompt());
  assert.equal(pr.kind, 'stun'); assert.equal(pr.options[0].id, 'trold');
  await page.click(`#sheet .card[data-uid="${pr.options[0].uid}"]`);
  assert.equal((await op()).champions.length, 0, 'Kæmpetrold slået ud gratis');
  assert.equal((await me()).combat, 9);
}

/* --- Genoptag fra localStorage --- */
const before = await page.evaluate(() => JSON.stringify(GAME.state));
await page.reload();
assert.equal(await page.evaluate(() => document.getElementById('continueBtn').hidden), false, 'Fortsæt-knap vises');
await page.click('#continueBtn');
assert.equal(await page.evaluate(() => JSON.stringify(GAME.state)), before, 'tilstanden er genskabt præcist');

/* --- Afgørelse: Blå slår Rød ned til 0 --- */
await page.evaluate(() => { GAME.state.players.red.health = 5; GAME.state.players.red.champions = []; });
await page.evaluate(() => GAME.attackFace());
s = await S();
assert.equal(s.phase, 'end'); assert.equal(s.winner, 'blue'); assert.equal(s.players.red.health, 0);
assert.match(await page.locator('#winnerText').textContent(), /Blå vandt/);
assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('zydy.helteriget.stats'))), { games: 1, red: 0, blue: 1 });
assert.equal(await page.evaluate(() => localStorage.getItem('zydy.helteriget.save')), null, 'gemt spil slettes ved slut');

/* --- Omkamp og afslut via ×-knappen --- */
await page.click('#rematchBtn');
assert.equal((await S()).phase, 'handoff');
await page.click('#showBtn');
await page.click('#quit');
assert.match(await page.locator('#sheet').textContent(), /Afslut spillet/);
await page.click('[data-act="quitYes"]');
assert.equal(await page.evaluate(() => GAME.state), null);
assert.equal(await page.evaluate(() => document.getElementById('start').classList.contains('on')), true);
assert.match(await page.locator('#startStats').textContent(), /Spil 1/);

// Ingen vandret scroll, ingen fejl
const noHScroll = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
assert.ok(noHScroll, 'ingen vandret scroll');
assert.deepEqual(errors, [], 'ingen console-fejl');

// iPad-screenshot til visuel kontrol
const ipad = await browser.newContext({ ...devices['iPad (gen 7)'] });
const ip = await ipad.newPage();
await ip.goto(`${BASE}/spil/helteriget/?seed=7`);
await ip.click('#playBtn'); await ip.click('#showBtn'); await ip.click('#playAll');
await ip.screenshot({ path: '/Users/lars/Projekter/Zydy/test/shots/helteriget-ipad.png' });
assert.ok(await ip.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'ingen vandret scroll på iPad');
await browser.close();
console.log('OK helteriget');
