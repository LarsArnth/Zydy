// Enhedstests for Dybets motor:  node --test test/unit/dybet.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../../public/spil/dybet/motor.mjs';

const { lavRng, lavDungeon, bfs, nytSpil, muligheder, autoValg, gaa, vend, aabnKiste, gaaNed,
  startKamp, kampTur, kampMonster, stats, udstyr, brugTing, tilJson, genoptag, TING, MONSTRE, EVNER, RETNINGER, GULV } = M;

test('rng er deterministisk og kan gemmes/genskabes', () => {
  const a = lavRng(42), b = lavRng(42);
  assert.equal(a.naeste(), b.naeste());
  const t = a.tilstand; const x = a.naeste();
  b.tilstand = t; assert.equal(b.naeste(), x);
});

test('dungeon: alle gulvfelter kan nås fra start, trappen ligger langt væk', () => {
  for (let seed = 1; seed <= 60; seed++) for (const niveau of [1, 3, 7, 12, 20]) {
    const d = lavDungeon(niveau, lavRng(seed * 1000 + niveau));
    const afstand = bfs(d.grid, d.B, d.start);
    for (let i = 0; i < d.grid.length; i++) if (d.grid[i] === GULV) assert.ok(afstand[i] >= 0, `felt ${i} nås ikke (seed ${seed}, niveau ${niveau})`);
    assert.ok(afstand[d.trappe.y * d.B + d.trappe.x] >= d.B, 'trappen ligger mindst en brætbredde væk');
    assert.equal(d.hovedvej[0].x, d.start.x); assert.equal(d.hovedvej.at(-1).x, d.trappe.x);
    // Startretningen peger mod gulv, og ingen ting/kiste/monster på start eller trappe
    const r = RETNINGER[d.start.retning];
    assert.equal(d.grid[(d.start.y + r.dy) * d.B + d.start.x + r.dx], GULV);
    const paa = (x, y) => d.monstre.some(m => m.x === x && m.y === y) || d.kister.some(k => k.x === x && k.y === y) || d.ting.some(t => t.x === x && t.y === y);
    assert.ok(!paa(d.start.x, d.start.y) && !paa(d.trappe.x, d.trappe.y));
  }
});

test('dungeon: monstre står i passager, mindst ét spærrer hovedvejen, ingen to ved siden af hinanden', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const d = lavDungeon(4, lavRng(seed));
    assert.ok(d.monstre.length >= 3);
    for (const m of d.monstre) {
      assert.ok(!(m.x % 2 === 1 && m.y % 2 === 1), 'monster i en celle');
      assert.ok(!d.monstre.some(n => n !== m && Math.abs(n.x - m.x) + Math.abs(n.y - m.y) === 1), 'to monstre klods op ad hinanden');
      assert.ok(MONSTRE[m.type].fra <= 4, 'kun monstre der passer til niveauet');
    }
    assert.ok(d.monstre.some(m => d.hovedvej.some(p => p.x === m.x && p.y === m.y)), 'et monster på hovedvejen');
  }
});

test('dungeon: vogter på hvert femte niveau lige før trappen', () => {
  const d = lavDungeon(5, lavRng(7));
  const v = d.monstre.find(m => m.vogter);
  assert.ok(v, 'vogter findes');
  const foer = d.hovedvej.at(-2);
  assert.deepEqual({ x: v.x, y: v.y }, { x: foer.x, y: foer.y });
});

test('dungeon: kister foretrækker blindgyder og har indhold, tingene har rigtige id’er', () => {
  const d = lavDungeon(3, lavRng(11));
  assert.ok(d.kister.length >= 2);
  for (const k of d.kister) {
    assert.ok(k.indhold.length >= 1);
    for (const t of k.indhold) assert.ok(TING[t.id], 'kendt ting ' + t.id);
  }
  for (const t of d.ting) assert.ok(TING[t.id]);
});

test('muligheder: én udgang → autogå, blindgyde → vend, kryds → spørg', () => {
  const spil = nytSpil(5);
  // Byg et lille kunstigt kort: lodret gang fra (1,1) ned til (1,3), og kryds ved (1,3) med (0,3)/(2,3)
  const B = 5, grid = new Array(B * B).fill(0);
  const g = (x, y) => grid[y * B + x] = 1;
  g(1, 1); g(1, 2); g(1, 3); g(0, 3); g(2, 3); g(3, 3);
  spil.dungeon = { niveau: 1, B, grid, start: { x: 1, y: 1, retning: 2 }, trappe: { x: 3, y: 3 }, monstre: [], kister: [], ting: [], hovedvej: [] };
  spil.set = new Array(B * B).fill(0);
  spil.pos = { x: 1, y: 1 }; spil.retning = 2;
  let m = muligheder(spil);
  assert.equal(m.length, 1); assert.equal(m[0].type, 'gaa'); assert.equal(m[0].relativ, 'frem');
  assert.equal(autoValg(m), m[0]);
  gaa(spil, 2);                                   // til (1,2)
  m = muligheder(spil); assert.equal(autoValg(m).relativ, 'frem');
  gaa(spil, 2);                                   // til (1,3): kryds
  m = muligheder(spil);
  const typer = m.map(x => x.relativ).sort();
  assert.deepEqual(typer, ['hoejre', 'tilbage', 'venstre']);
  assert.equal(autoValg(m), null, 'spilleren skal vælge');
  // vestpå (relativ 'hoejre' når man vender mod syd) er blindgyde
  gaa(spil, 3);
  m = muligheder(spil);
  assert.equal(m.length, 1); assert.equal(m[0].type, 'vend'); assert.equal(autoValg(m).type, 'vend');
  vend(spil); assert.equal(spil.retning, 1);
  gaa(spil, 1); // tilbage i krydset, nu mod øst: ligeud eller til venstre (nord)
  m = muligheder(spil);
  assert.deepEqual(m.map(x => x.relativ).sort(), ['frem', 'tilbage', 'venstre']);
  assert.equal(autoValg(m), null);
  gaa(spil, 1); // (2,3): trappen ligger ligeud
  m = muligheder(spil);
  assert.ok(m.some(x => x.type === 'trappe' && x.relativ === 'frem'), 'trappen ses ligeud');
  assert.equal(autoValg(m), null, 'ved trappen stopper spillet og spørger');
  assert.ok(spil.set[3 * B + 3] === 1, 'gangen ligeud er markeret set');
});

test('monster spærrer, kiste åbnes én gang, ting samles op', () => {
  const spil = nytSpil(9);
  const B = 5, grid = new Array(B * B).fill(0);
  const g = (x, y) => grid[y * B + x] = 1;
  g(1, 1); g(2, 1); g(3, 1); g(1, 2); g(1, 3);
  spil.dungeon = { niveau: 1, B, grid, start: { x: 1, y: 1, retning: 1 }, trappe: { x: 3, y: 1 },
    monstre: [M.lavMonster('rotte', 1, 2, 1, 0)], kister: [{ x: 1, y: 3, aabnet: false, indhold: [{ id: 'oekse', antal: 1 }] }],
    ting: [{ x: 1, y: 2, id: 'potion' }], hovedvej: [] };
  spil.set = new Array(B * B).fill(0);
  spil.pos = { x: 1, y: 1 }; spil.retning = 1;
  let m = muligheder(spil);
  assert.ok(m.some(x => x.type === 'angrib' && x.relativ === 'frem'));
  assert.ok(m.some(x => x.type === 'gaa' && x.relativ === 'hoejre'));
  assert.equal(autoValg(m), null);
  assert.equal(gaa(spil, 1), null, 'kan ikke gå ind i et monster');
  const h = gaa(spil, 2);
  assert.equal(h[0].type, 'fundet');
  assert.equal(spil.spiller.taske.find(t => t.id === 'potion').antal, 3);
  m = muligheder(spil);
  assert.equal(m.find(x => x.type === 'kiste').relativ, 'frem');
  const loot = aabnKiste(spil, 2);
  assert.equal(loot[0].id, 'oekse');
  assert.ok(spil.spiller.taske.some(t => t.id === 'oekse'));
  assert.equal(aabnKiste(spil, 2), null, 'kan ikke åbnes igen');
  assert.equal(muligheder(spil).find(x => x.relativ === 'frem').type, 'gaa', 'åben kiste er bare gulv');
  assert.ok(udstyr(spil, 'oekse'));
  assert.equal(spil.spiller.udstyr.vaaben, 'oekse');
  assert.ok(spil.spiller.taske.some(t => t.id === 'kniv'), 'kniven ligger i tasken');
  assert.equal(stats(spil.spiller).angreb, 5 + 6);
});

test('kamp: angreb, sejr, xp og niveau; død ender spillet', () => {
  const spil = nytSpil(3);
  const mon = spil.dungeon.monstre[0];
  let h = startKamp(spil, mon);
  assert.equal(h[0].type, 'start'); assert.equal(spil.fase, 'kamp');
  assert.equal(udstyr(spil, 'kniv'), false, 'kan ikke skifte udstyr i kamp');
  let runder = 0;
  while (spil.fase === 'kamp' && runder < 50) { h = kampTur(spil, { type: 'angrib' }); runder++; }
  assert.ok(runder < 50);
  const sidste = h.at(-1);
  assert.ok(['sejr', 'levelOp', 'nyEvne', 'doed'].includes(sidste.type), 'kampen slutter med sejr eller død, fik ' + sidste.type);
  if (spil.fase === 'udforsk') {
    assert.ok(mon.doed); assert.ok(spil.spiller.xp > 0 || spil.spiller.level > 1);
    assert.equal(muligheder(spil).filter(x => x.type === 'angrib').length, 0);
  } else assert.equal(spil.fase, 'doed');
});

test('kamp: evner koster mana, flugt koster et slag, røgbombe er gratis flugt', () => {
  const spil = nytSpil(21);
  const mon = spil.dungeon.monstre[0];
  startKamp(spil, mon);
  spil.spiller.mp = 2;
  let h = kampTur(spil, { type: 'evne', id: 'kraftslag' });
  assert.equal(h[0].tekst, 'Ikke nok mana!'); assert.equal(spil.kamp.runde, 0);
  spil.spiller.mp = 10;
  h = kampTur(spil, { type: 'evne', id: 'kraftslag' });
  assert.equal(spil.spiller.mp, 7);
  assert.ok(h.some(x => x.type === 'skade' || x.type === 'miss'));
  // Røgbombe
  spil.spiller.taske.push({ id: 'roegbombe', antal: 1 });
  const hpFoer = spil.spiller.hp;
  h = kampTur(spil, { type: 'ting', id: 'roegbombe' });
  assert.equal(h.at(-1).type, 'flugt'); assert.equal(spil.fase, 'udforsk'); assert.equal(spil.spiller.hp, hpFoer);
  assert.ok(!mon.doed, 'monsteret lever stadig og spærrer');
  // Almindelig flugt koster liv
  startKamp(spil, mon);
  h = kampTur(spil, { type: 'flygt' });
  assert.ok(h[0].type === 'skade' && h[0].maal === 'spiller');
  assert.ok(spil.spiller.hp < hpFoer);
});

test('potion uden for kamp og i kamp, ikke ved fuldt liv', () => {
  const spil = nytSpil(4);
  assert.equal(brugTing(spil, 'potion').type, 'intet');
  spil.spiller.hp = 10;
  const h = brugTing(spil, 'potion');
  assert.equal(h.type, 'heal'); assert.equal(spil.spiller.hp, 25);
  assert.equal(spil.spiller.taske.find(t => t.id === 'potion').antal, 1);
  assert.equal(brugTing(spil, 'bombe'), null, 'bombe kun i kamp');
});

test('trappe: nyt niveau, dybde tæller op, mana fyldes, og spillet kan gemmes/genoptages', () => {
  const spil = nytSpil(8);
  spil.spiller.mp = 1; spil.spiller.hp = 10;
  assert.equal(gaaNed(spil), 2);
  assert.equal(spil.niveau, 2); assert.equal(spil.spiller.mp, 10); assert.equal(spil.spiller.hp, 19);
  assert.equal(spil.dungeon.niveau, 2);
  const json = tilJson(spil);
  const igen = genoptag(json);
  assert.equal(igen.niveau, 2); assert.deepEqual(igen.pos, spil.pos);
  assert.equal(igen.rng.naeste(), spil.rng.naeste(), 'rng fortsætter samme sted');
});

test('data: alle evner og ting har navne; monstre dækker niveauerne', () => {
  for (const t of Object.values(TING)) assert.ok(t.navn && t.slot);
  for (const e of Object.values(EVNER)) assert.ok(e.navn && e.mp > 0);
  for (let n = 1; n <= 30; n++) assert.ok(Object.values(MONSTRE).filter(m => m.fra <= n).length >= 2, 'monstre på niveau ' + n);
  for (let n = 1; n <= 30; n += 7) assert.ok(lavDungeon(n, lavRng(n)).monstre.length >= 3, 'monstre placeres på niveau ' + n);
});

// Bot-simulering: en simpel spiller der altid går mod trappen, slår monstre på vejen,
// drikker potion under 40 % liv og tager bedste udstyr på. Printer hvor dybt den kommer,
// så sværhedsgraden kan tunes. Tjekker bare at den hverken dør på niveau 1 hver gang
// eller lever evigt.
test('balance: en simpel bot kommer et rimeligt stykke ned', () => {
  const dybder = [];
  for (let seed = 1; seed <= 40; seed++) {
    const spil = nytSpil(seed);
    let skridt = 0;
    while (spil.fase !== 'doed' && spil.niveau <= 60 && skridt++ < 20000) {
      const sp = spil.spiller, s = stats(sp);
      // Udstyr: bedste i tasken
      for (const slot of ['vaaben', 'rustning', 'smykke']) {
        const bedst = sp.taske.filter(t => TING[t.id].slot === slot).sort((a, b) => (TING[b.id].angreb || TING[b.id].forsvar || TING[b.id].maxHp || 0) - (TING[a.id].angreb || TING[a.id].forsvar || TING[a.id].maxHp || 0))[0];
        const nu = sp.udstyr[slot] ? TING[sp.udstyr[slot]] : null;
        if (bedst && (!nu || (TING[bedst.id].angreb || TING[bedst.id].forsvar || 0) > (nu.angreb || nu.forsvar || 0))) udstyr(spil, bedst.id);
      }
      if (sp.hp < s.maxHp * 0.5 && sp.taske.some(t => t.id === 'storpotion')) brugTing(spil, 'storpotion');
      else if (sp.hp < s.maxHp * 0.5 && sp.taske.some(t => t.id === 'potion')) brugTing(spil, 'potion');
      // Gå mod nærmeste uåbnede kiste, ellers trappen, ad korteste vej gennem alt (monstre kæmpes)
      const d = spil.dungeon;
      const fraMig = bfs(d.grid, d.B, spil.pos);
      const kister = d.kister.filter(k => !k.aabnet).sort((a, b) => fraMig[a.y * d.B + a.x] - fraMig[b.y * d.B + b.x]);
      const maal = kister[0] || d.trappe;
      const afstand = bfs(d.grid, d.B, maal);
      const m = muligheder(spil);
      const kiste = m.find(x => x.type === 'kiste');
      if (kiste) { aabnKiste(spil, kiste.retning); continue; }
      const trappe = m.find(x => x.type === 'trappe');
      if (trappe) { gaaNed(spil); continue; }
      let bedst = null, ba = Infinity;
      for (const r of RETNINGER.map((_, i) => i)) {
        const x = spil.pos.x + RETNINGER[r].dx, y = spil.pos.y + RETNINGER[r].dy;
        if (!M.gulv(spil, x, y)) continue;
        const a = afstand[y * d.B + x];
        if (a < ba) { ba = a; bedst = r; }
      }
      const mon = M.monsterPaa(spil, spil.pos.x + RETNINGER[bedst].dx, spil.pos.y + RETNINGER[bedst].dy);
      if (mon) {
        startKamp(spil, mon);
        while (spil.fase === 'kamp') {
          const s2 = stats(sp);
          if (sp.hp < s2.maxHp * 0.45 && sp.taske.some(t => t.id === 'potion')) kampTur(spil, { type: 'ting', id: 'potion' });
          else if (sp.hp < s2.maxHp * 0.45 && sp.evner.includes('helbred') && sp.mp >= 4) kampTur(spil, { type: 'evne', id: 'helbred' });
          else if (sp.evner.includes('lyn') && sp.mp >= 6) kampTur(spil, { type: 'evne', id: 'lyn' });
          else if (sp.evner.includes('ildkugle') && sp.mp >= 5) kampTur(spil, { type: 'evne', id: 'ildkugle' });
          else if (sp.mp >= 3) kampTur(spil, { type: 'evne', id: 'kraftslag' });
          else kampTur(spil, { type: 'angrib' });
        }
      } else gaa(spil, bedst);
    }
    dybder.push(spil.niveau);
  }
  dybder.sort((a, b) => a - b);
  const median = dybder[Math.floor(dybder.length / 2)];
  console.log('  bot-dybder:', dybder.join(' '), '| median', median);
  assert.ok(median >= 3, 'boten bør nå mindst niveau 3 (median ' + median + ')');
  assert.ok(median <= 25, 'boten bør ikke leve evigt (median ' + median + ')');
});
