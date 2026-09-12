// Slotskamps motor: kortene, magien, tropperne, tårnene, tiden og botten.
//   node --test test/unit/slotskamp.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BREDDE, HØJDE, FLOD_Y, BRO_X, MAGI_MAKS, MAGI_START, MAGI_TID, KAMP_TID, FORLÆNGET_TID,
  DOBBELT_FRA, SPAWN_TID, KORT, KORT_VED, TÅRN, BOT_NIVEAUER, niveauFraStime,
  nytSpil, spilKort, tik, botTræk, kanPlacere, egenHalvdel, næsteKort, tårne,
} from '../../public/spil/slotskamp/kamp.mjs';

/** En kamp uden modstander, hvor testen selv styrer begge sider. */
const stille = (opt = {}) => nytSpil({ seed: 7, bot: false, ...opt });

/** Giver en side et bestemt kort på hånden og magi nok til det. */
function giv(stand, side, kortId, magi = MAGI_MAKS) {
  const s = stand.spillere[side];
  if (!s.hånd.includes(kortId)) s.hånd[0] = kortId;
  s.magi = magi;
  return s;
}

const tårnet = (stand, side, slags, bane = null) =>
  stand.tårne.find(t => t.side === side && t.slags === slags && (bane === null || t.bane === bane));

test('der er otte kort, og de koster mellem 2 og 5 magi', () => {
  assert.equal(KORT.length, 8);
  assert.equal(new Set(KORT.map(k => k.id)).size, 8, 'ingen id går igen');
  for (const k of KORT) {
    assert.ok(k.magi >= 2 && k.magi <= 5, `${k.id} koster ${k.magi}`);
    assert.ok(k.navn && k.tegn && k.om, `${k.id} mangler navn, tegn eller forklaring`);
    if (k.slags === 'trylle') assert.ok(k.område > 0 && k.skade > 0, `${k.id} skal ramme noget`);
    else assert.ok(k.hp > 0 && k.antal >= 1, `${k.id} skal have liv`);
  }
  // Der skal være noget at tage en Kæmpe med, og noget at rydde en flok med.
  assert.ok(KORT.some(k => k.slags === 'bygning'));
  assert.ok(KORT.some(k => k.splash > 0));
});

test('en ny kamp: seks tårne, fire kort på hånden og fem magi', () => {
  const s = nytSpil({ seed: 1 });
  assert.equal(s.tårne.length, 6);
  assert.equal(tårne(s, 'ned').length, 3);
  assert.equal(s.spillere.ned.hånd.length, 4);
  assert.equal(s.spillere.ned.kø.length, 4);
  assert.equal(new Set([...s.spillere.ned.hånd, ...s.spillere.ned.kø]).size, 8, 'alle otte kort er i bunken');
  assert.equal(s.spillere.ned.magi, MAGI_START);
  assert.equal(s.tid, KAMP_TID);
  assert.equal(s.fase, 'kamp');
  // Kongen sover, til der sker ham noget.
  assert.equal(tårnet(s, 'op', 'konge').vågen, false);
  assert.equal(tårnet(s, 'op', 'vagt', 0).vågen, true);
});

test('magien fylder op af sig selv, stopper ved ti og bliver dobbelt til sidst', () => {
  const s = stille();
  s.spillere.ned.magi = 0; s.spillere.op.magi = 0;
  tik(s, MAGI_TID * 2);
  assert.ok(Math.abs(s.spillere.ned.magi - 2) < 0.1, 'to magi på to takter');
  tik(s, MAGI_TID * 20);
  assert.equal(s.spillere.ned.magi, MAGI_MAKS, 'der er et loft');

  const t = stille({ tid: DOBBELT_FRA });
  t.spillere.ned.magi = 0;
  tik(t, MAGI_TID);
  assert.ok(t.spillere.ned.magi > 1.8, 'til sidst kommer magien dobbelt så hurtigt');
});

test('man må kun sætte tropper på sin egen halvdel – tryllekort rammer hele banen', () => {
  assert.equal(egenHalvdel('ned', 50, HØJDE - 20), true);
  assert.equal(egenHalvdel('ned', 50, FLOD_Y - 20), false, 'det er modstanderens side');
  assert.equal(egenHalvdel('ned', 50, FLOD_Y + 2), false, 'man kan ikke stå i floden');
  assert.equal(egenHalvdel('op', 50, 30), true);
  assert.equal(kanPlacere('ned', 'ridder', 50, 30), false);
  assert.equal(kanPlacere('ned', 'ildkugle', 50, 30), true, 'ilden kan kastes derover');
});

test('at spille et kort koster magi, kører hånden rundt og sætter tropperne', () => {
  const s = stille();
  giv(s, 'ned', 'bueskytter', 6);
  const før = s.spillere.ned.hånd.slice(), næsteFør = næsteKort(s.spillere.ned);

  assert.equal(spilKort(s, 'ned', 'bueskytter', 40, 120).ok, true);
  assert.equal(s.spillere.ned.magi, 6 - KORT_VED.bueskytter.magi);
  assert.equal(s.enheder.length, 2, 'der kommer to bueskytter');
  assert.ok(s.enheder.every(e => e.side === 'ned' && e.venter > 0), 'de skal lige lande først');
  assert.equal(s.spillere.ned.hånd.includes('bueskytter'), false, 'kortet er væk fra hånden');
  assert.equal(s.spillere.ned.hånd[før.indexOf('bueskytter')], næsteFør, 'det næste kort tog pladsen');
  assert.equal(s.spillere.ned.kø[s.spillere.ned.kø.length - 1], 'bueskytter', 'og selv røg det bagerst i køen');
});

test('et kort man ikke har råd til, ikke har på hånden eller sætter forkert bliver afvist', () => {
  const s = stille();
  giv(s, 'ned', 'kæmpe', 1);
  assert.deepEqual(spilKort(s, 'ned', 'kæmpe', 50, 120), { ok: false, fejl: 'Ikke magi nok' });
  s.spillere.ned.magi = MAGI_MAKS;
  assert.deepEqual(spilKort(s, 'ned', 'kæmpe', 50, 30), { ok: false, fejl: 'Kun på din egen halvdel' });
  const ukendt = s.spillere.ned.kø[0];
  s.spillere.ned.hånd = s.spillere.ned.hånd.filter(id => id !== ukendt);
  assert.equal(spilKort(s, 'ned', ukendt, 50, 120).ok, false);
  assert.equal(s.enheder.length, 0, 'intet af det satte noget på banen');
  assert.equal(s.spillere.ned.magi, MAGI_MAKS, 'og det kostede ingen magi');
});

test('tropperne går over broen – de svømmer ikke', () => {
  const s = stille();
  giv(s, 'ned', 'ridder');
  spilKort(s, 'ned', 'ridder', 50, 150);         // midt på banen, langt fra begge broer
  tik(s, SPAWN_TID + 6);
  const r = s.enheder[0];
  assert.ok(Math.abs(r.x - BRO_X[1]) < Math.abs(50 - BRO_X[1]), 'han er på vej hen mod sin bro');
  tik(s, 25);
  assert.ok(r.y < FLOD_Y, `han kom over floden (y = ${r.y.toFixed(1)})`);
  assert.ok(Math.abs(r.x - BRO_X[1]) < 12, 'og han kom over ved broen');
});

test('en Kæmpe går udenom tropperne og slår kun på tårnet', () => {
  const s = stille();
  giv(s, 'ned', 'kæmpe');
  spilKort(s, 'ned', 'kæmpe', BRO_X[0], 110);
  giv(s, 'op', 'skeletter');
  spilKort(s, 'op', 'skeletter', BRO_X[0], 80);     // lige i vejen for ham
  const kæmpe = s.enheder.find(e => e.kort === 'kæmpe');
  const vagt = tårnet(s, 'op', 'vagt', 0);
  tik(s, 6);
  assert.equal(kæmpe.målNr, vagt.nr, 'han går efter tårnet, ikke efter dem der hakker i ham');
  const skeletter = s.enheder.filter(e => e.kort === 'skeletter');
  assert.equal(skeletter.length, 4, 'de lever alle sammen');
  assert.ok(skeletter.every(e => e.hp === e.maxHp), 'han har ikke slået på en eneste af dem');
});

test('en Kæmpe, der får lov at gå i fred, vælter et vagttårn', () => {
  const s = stille();
  giv(s, 'ned', 'kæmpe');
  spilKort(s, 'ned', 'kæmpe', BRO_X[0], 130);
  const vagt = tårnet(s, 'op', 'vagt', 0);
  tik(s, 32);                                      // han er ca. 30 sekunder om det
  assert.equal(vagt.hp, 0, 'tårnet faldt');
  assert.equal(s.kroner.ned, 1);
  const kæmpe = s.enheder.find(e => e.kort === 'kæmpe');
  assert.ok(kæmpe, 'han står der endnu');
  assert.ok(kæmpe.hp < kæmpe.maxHp * 0.7, 'men tårnet nåede at give ham nogle på hatten');
});

test('fire skeletter kan æde en Kæmpe, hvis han ikke får hjælp', () => {
  const s = stille();
  giv(s, 'op', 'kæmpe');
  spilKort(s, 'op', 'kæmpe', BRO_X[0], 70);
  giv(s, 'ned', 'skeletter');
  spilKort(s, 'ned', 'skeletter', BRO_X[0], 100);
  tik(s, 30);
  assert.equal(s.enheder.some(e => e.kort === 'kæmpe'), false, 'Kæmpen faldt');
});

test('Lyn rydder skeletter, men en Ridder ryster den af sig', () => {
  const s = stille();
  giv(s, 'op', 'skeletter');
  spilKort(s, 'op', 'skeletter', 40, 60);
  giv(s, 'op', 'ridder');
  spilKort(s, 'op', 'ridder', 40, 60);
  giv(s, 'ned', 'lyn');
  assert.equal(spilKort(s, 'ned', 'lyn', 40, 60).ok, true);
  tik(s, 0.1);
  assert.equal(s.enheder.filter(e => e.kort === 'skeletter').length, 0, 'skeletterne er væk');
  const ridder = s.enheder.find(e => e.kort === 'ridder');
  assert.ok(ridder && ridder.hp > 0, 'Ridderen står endnu');
  assert.ok(ridder.hp < ridder.maxHp, 'men han mærkede det');
});

test('en Ildkugle svider også tårne og vækker kongen', () => {
  const s = stille();
  const konge = tårnet(s, 'op', 'konge');
  giv(s, 'ned', 'ildkugle');
  spilKort(s, 'ned', 'ildkugle', konge.x, konge.y);
  assert.equal(konge.hp, konge.maxHp - KORT_VED.ildkugle.tårnSkade);
  assert.equal(konge.vågen, true, 'man skal ikke vække kongen uden grund');
});

test('et væltet vagttårn giver en krone og vækker kongen bagved', () => {
  const s = stille();
  const vagt = tårnet(s, 'op', 'vagt', 0), konge = tårnet(s, 'op', 'konge');
  vagt.hp = 1;
  giv(s, 'ned', 'lyn');
  spilKort(s, 'ned', 'lyn', vagt.x, vagt.y);
  tik(s, 0.1);
  assert.equal(vagt.hp, 0);
  assert.equal(s.kroner.ned, 1, 'én krone');
  assert.equal(konge.vågen, true, 'nu er kongen vågen');
  assert.equal(s.fase, 'kamp', 'men kampen er ikke slut');
  assert.ok(s.hændelser.some(h => h.slags === 'tårn-væltet' && h.side === 'op'));
});

test('vælter kongetårnet, er kampen slut med tre kroner', () => {
  const s = stille();
  const konge = tårnet(s, 'op', 'konge');
  konge.hp = 1;
  giv(s, 'ned', 'ildkugle');
  spilKort(s, 'ned', 'ildkugle', konge.x, konge.y);
  tik(s, 0.1);
  assert.equal(s.fase, 'slut');
  assert.deepEqual(s.slut, { vinder: 'ned', grund: 'konge', kroner: { ned: 3, op: 0 } });
  // Efter slut sker der ikke mere.
  const enheder = s.enheder.length;
  tik(s, 10);
  assert.equal(s.enheder.length, enheder);
  assert.equal(spilKort(s, 'ned', s.spillere.ned.hånd[0], 50, 120).ok, false);
});

test('løber tiden ud, vinder flest kroner – står det lige, spilles der forlænget', () => {
  const s = stille({ tid: 1 });
  s.kroner.ned = 1;
  tik(s, 2);
  assert.equal(s.slut.vinder, 'ned');
  assert.equal(s.slut.grund, 'tid');

  const lige = stille({ tid: 1 });
  tik(lige, 2);
  assert.equal(lige.fase, 'forlænget');
  assert.ok(lige.tid > FORLÆNGET_TID - 2 && lige.tid <= FORLÆNGET_TID, 'uret starter forfra');
  assert.ok(lige.hændelser.some(h => h.slags === 'forlænget'));

  // I forlænget spilletid vinder det første tårn, der falder.
  const vagt = tårnet(lige, 'ned', 'vagt', 1);
  vagt.hp = 1;
  giv(lige, 'op', 'lyn');
  spilKort(lige, 'op', 'lyn', vagt.x, vagt.y);
  tik(lige, 0.1);
  assert.equal(lige.slut.vinder, 'op');
  assert.equal(lige.slut.grund, 'pludselig');
});

test('falder der intet i forlænget spilletid, vinder det mindst forslåede tårn', () => {
  const s = stille({ tid: 0.5 });
  tik(s, 1);
  assert.equal(s.fase, 'forlænget');
  tårnet(s, 'ned', 'vagt', 0).hp = 900;         // vores værste tårn står bedre end deres
  tårnet(s, 'op', 'vagt', 0).hp = 200;
  s.tid = 0.5;
  tik(s, 1);
  assert.equal(s.slut.vinder, 'ned');
  assert.equal(s.slut.grund, 'liv');
});

test('tårnene skyder det, der kommer inden for rækkevidde', () => {
  const s = stille();
  const vagt = tårnet(s, 'op', 'vagt', 0);
  giv(s, 'ned', 'skeletter');
  spilKort(s, 'ned', 'skeletter', BRO_X[0], 100);
  tik(s, SPAWN_TID + 12);
  assert.ok(s.enheder.length < 4, 'tårnet har pillet nogle af dem');
  assert.ok(vagt.hp < vagt.maxHp || s.enheder.length === 0);
});

test('modstanderen bliver hårdere for hver anden sejr i træk', () => {
  assert.equal(niveauFraStime(0), 0);
  assert.equal(niveauFraStime(1), 0);
  assert.equal(niveauFraStime(2), 1);
  assert.equal(niveauFraStime(4), 2);
  assert.equal(niveauFraStime(6), 3);
  assert.equal(niveauFraStime(99), BOT_NIVEAUER.length - 1, 'der er et loft');
});

/** Spiller en hel kamp, hvor begge sider styres af botten. */
function botKamp(seed, spillerNiveau, botNiveau) {
  const s = nytSpil({ seed, niveau: botNiveau });
  const n = BOT_NIVEAUER[spillerNiveau];
  let ur = n.nøl, runder = 0;
  while (s.fase !== 'slut' && runder++ < 5000) {
    tik(s, 0.1);
    ur -= 0.1;
    if (ur <= 0) { ur = n.nøl * (0.7 + 0.6 * s.rnd()); botTræk(s, 'ned', n, s.rnd() < 0.5 ? 0 : 1); }
  }
  return s;
}

test('botten spiller efter reglerne og løber ikke tør for magi', () => {
  const s = nytSpil({ seed: 42, niveau: 3 });
  const set = new Set();
  let sat = 0;
  for (let i = 0; i < 600 && s.fase !== 'slut'; i++) {
    tik(s, 0.2);
    assert.ok(s.spillere.op.magi >= 0 && s.spillere.op.magi <= MAGI_MAKS, 'magien holder sig inden for skiven');
    for (const e of s.enheder) {
      if (e.side !== 'op' || set.has(e.nr)) continue;
      set.add(e.nr); sat++;
      // Nye tropper skal være kommet ned på bottens egen halvdel (bagefter må de gå, hvor de vil).
      assert.ok(e.y < FLOD_Y, `botten satte en ${e.kort} på y = ${e.y.toFixed(1)}`);
    }
  }
  assert.ok(sat > 5, `botten spillede kun ${sat} tropper på en hel kamp`);
});

test('en hel kamp bliver altid afgjort', () => {
  for (const seed of [3, 11, 500]) {
    const s = botKamp(seed, 1, 1);
    assert.equal(s.fase, 'slut', `kampen med seed ${seed} kørte aldrig færdig`);
    assert.ok(['konge', 'tid', 'pludselig', 'liv', 'uafgjort'].includes(s.slut.grund));
    assert.ok(s.kroner.ned <= 3 && s.kroner.op <= 3, 'højst tre kroner hver');
  }
});

test('en skarp spiller slår en nybegynder klart oftere end omvendt', () => {
  let skarpe = 0, nybegyndere = 0;
  for (let i = 0; i < 16; i++) {
    const a = botKamp(1000 + i * 13, 3, 0);      // Mester spiller nedefra mod Nybegynder
    if (a.slut.vinder === 'ned') skarpe++;
    const b = botKamp(2000 + i * 13, 0, 3);      // og omvendt
    if (b.slut.vinder === 'ned') nybegyndere++;
  }
  assert.ok(skarpe >= 11, `Mester vandt kun ${skarpe} af 16 mod Nybegynder`);
  assert.ok(nybegyndere <= 5, `Nybegynder vandt ${nybegyndere} af 16 mod Mester`);
});

test('den samme seed giver den samme kamp', () => {
  const a = botKamp(777, 2, 2), b = botKamp(777, 2, 2);
  assert.deepEqual(a.slut, b.slut);
  assert.deepEqual(a.kroner, b.kroner);
});

test('banen og tårnene står symmetrisk', () => {
  const s = nytSpil({ seed: 5 });
  for (const t of tårne(s, 'op')) {
    const spejl = tårne(s, 'ned').find(u => u.slags === t.slags && u.bane === t.bane);
    assert.ok(spejl, `${t.slags} mangler i bunden`);
    assert.equal(spejl.x, t.x);
    assert.equal(spejl.y, HØJDE - t.y);
    assert.equal(spejl.maxHp, TÅRN[t.slags].hp);
  }
  assert.ok(BRO_X.every(x => x > 0 && x < BREDDE));
});
