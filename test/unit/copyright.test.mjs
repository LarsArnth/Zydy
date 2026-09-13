// Enhedstests for Copyrights regler:  node --test test/unit/copyright.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MOTIVER, POINT_RIGTIGT, POINT_NARRET, MIN_SPILLERE, MAKS_SPILLERE, RUNDER,
  nytSpil, gemTegning, saetGaet, manglerGaet, tilGaet, faerdigMedGaet,
  afsloeres, naesteAfsloering, naesteRunde, stilling, vindere, tomTegning,
  reneNavne, bland,
} from '../../public/spil/copyright/regler.mjs';

/** Fast tilfældighed, så et parti kan gentages. */
function frø(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const streg = f => [{ f, t: 2, p: [0.1, 0.1, 0.9, 0.9] }];

/** Alle tegner (en streg hver), så spillet er klar til gætterunden. */
function alleTegner(spil, rnd) {
  for (let i = 0; i < spil.spillere.length; i++) gemTegning(spil, streg(i), rnd);
  return spil;
}

test('navne bliver rene: tomme felter får et nummer, og to ens kan kendes fra hinanden', () => {
  assert.deepEqual(reneNavne(['Selma', '  ', 'Sofie']), ['Selma', 'Spiller 2', 'Sofie']);
  assert.deepEqual(reneNavne(['Selma', 'selma']), ['Selma', 'selma 2']);
  assert.deepEqual(reneNavne(['  Far  Mor ']), ['Far Mor']);
  assert.equal(reneNavne(['abcdefghijklmnopqrst'])[0].length, 14, 'navne klippes');
});

test('nytSpil kræver mindst tre spillere og giver alle det samme motiv', () => {
  assert.throws(() => nytSpil({ navne: ['Selma', 'Sofie'] }), /mindst 3/);
  const spil = nytSpil({ navne: ['Selma', 'Sofie', 'Far'], rnd: frø(4) });
  assert.equal(spil.spillere.length, 3);
  assert.equal(spil.fase, 'tegn');
  assert.equal(spil.runde, 1);
  assert.equal(spil.runder, RUNDER);
  assert.ok(MOTIVER.includes(spil.motiv), 'motivet er et af listens');
  assert.equal(spil.spillere.every(p => p.point === 0), true);
  assert.equal(MIN_SPILLERE, 3);
  assert.equal(MAKS_SPILLERE, 6);
});

test('et motiv kommer ikke to gange i det samme spil', () => {
  const rnd = frø(11);
  const spil = nytSpil({ navne: ['a', 'b', 'c'], runder: 6, rnd });
  const set = new Set([spil.motiv]);
  for (let r = 0; r < 5; r++) {
    alleTegner(spil, rnd);
    for (let g = 0; g < 3; g++) { svarTilfaeldigt(spil, rnd); faerdigMedGaet(spil, rnd); }
    while (spil.fase === 'afsloer') naesteAfsloering(spil);
    naesteRunde(spil, rnd);
    assert.equal(set.has(spil.motiv), false, 'nyt motiv hver runde');
    set.add(spil.motiv);
  }
});

/** Den aktuelle gætter svarer noget gyldigt på alle tegninger. */
function svarTilfaeldigt(spil, rnd) {
  tilGaet(spil).forEach(t => {
    const mulige = spil.spillere.map((_, i) => i).filter(i => i !== spil.gaetter);
    saetGaet(spil, t, mulige[Math.floor(rnd() * mulige.length)]);
  });
}

test('alle tegner på skift, og så blandes tegningerne til gætterunden', () => {
  const rnd = frø(7);
  const spil = nytSpil({ navne: ['Selma', 'Sofie', 'Far', 'Mor'], rnd });
  assert.equal(spil.tegner, 0);
  gemTegning(spil, streg(0), rnd);
  assert.equal(spil.tegner, 1, 'næste spiller tegner');
  assert.equal(spil.fase, 'tegn');
  gemTegning(spil, streg(1), rnd);
  gemTegning(spil, streg(2), rnd);
  assert.equal(spil.fase, 'tegn', 'der mangler én');
  gemTegning(spil, streg(3), rnd);
  assert.equal(spil.fase, 'gaet', 'alle har tegnet');
  assert.equal(spil.tegninger.length, 4);
  assert.deepEqual([...spil.raekkefoelge].sort(), [0, 1, 2, 3], 'alle tegninger er med');
  assert.equal(spil.gaetter, 0);
  assert.deepEqual(spil.tegninger.map(t => t.ejer), [0, 1, 2, 3]);
});

test('man gætter hverken på sin egen tegning eller på sig selv', () => {
  const rnd = frø(3);
  const spil = alleTegner(nytSpil({ navne: ['Selma', 'Sofie', 'Far'], rnd }), rnd);
  const min = spil.tegninger.findIndex(t => t.ejer === 0);        // Selma gætter først
  assert.equal(saetGaet(spil, min, 1), false, 'ens egen tegning kan ikke gættes');
  assert.deepEqual(tilGaet(spil).includes(min), false, 'og den vises ikke');
  const andres = tilGaet(spil)[0];
  assert.equal(saetGaet(spil, andres, 0), false, 'man kan ikke gætte sig selv');
  assert.equal(saetGaet(spil, andres, 9), false, 'ukendt spiller');
  assert.equal(saetGaet(spil, andres, 1), true);
  assert.equal(spil.gaet[0][andres], 1);
});

test('man kan ikke give enheden videre, før alle tegninger er gættet', () => {
  const rnd = frø(9);
  const spil = alleTegner(nytSpil({ navne: ['Selma', 'Sofie', 'Far'], rnd }), rnd);
  assert.equal(manglerGaet(spil).length, 2, 'to andres tegninger');
  assert.equal(faerdigMedGaet(spil, rnd), false);
  saetGaet(spil, tilGaet(spil)[0], 1);
  assert.equal(manglerGaet(spil).length, 1);
  assert.equal(faerdigMedGaet(spil, rnd), false);
  saetGaet(spil, tilGaet(spil)[1], 2);
  assert.equal(faerdigMedGaet(spil, rnd), true);
  assert.equal(spil.gaetter, 1, 'næste gætter');
  assert.equal(spil.fase, 'gaet');
});

test('point: 10 for et rigtigt gæt, 5 til tegneren pr. narret – men kun hvis nogen gættede rigtigt', () => {
  const rnd = frø(5);
  // Fire spillere: 0=Selma, 1=Sofie, 2=Far, 3=Mor
  const spil = alleTegner(nytSpil({ navne: ['Selma', 'Sofie', 'Far', 'Mor'], rnd }), rnd);
  const tegningAf = e => spil.tegninger.findIndex(t => t.ejer === e);

  // Selmas tegning: Sofie rammer, Far og Mor rammer ved siden af → Selma narrede 2.
  // Sofies tegning: ingen rammer → for godt gemt, ingen point til Sofie.
  // Fars og Mors tegninger: alle rammer → ingen narret.
  const svar = {
    1: { 0: 0, 2: 2, 3: 3 },        // Sofie gætter: Selmas=Selma, Fars=Far, Mors=Mor
    0: { 1: 2, 2: 2, 3: 3 },        // Selma gætter: Sofies=Far (forkert), Fars=Far, Mors=Mor
    2: { 0: 3, 1: 0, 3: 3 },        // Far gætter: Selmas=Mor (forkert), Sofies=Selma (forkert), Mors=Mor
    3: { 0: 1, 1: 0, 2: 2 },        // Mor gætter: Selmas=Sofie (forkert), Sofies=Selma (forkert), Fars=Far
  };
  for (let g = 0; g < 4; g++) {
    Object.entries(svar[spil.gaetter]).forEach(([ejer, valgt]) => saetGaet(spil, tegningAf(Number(ejer)), valgt));
    assert.equal(faerdigMedGaet(spil, rnd), true, `gætter ${g} blev færdig`);
  }
  assert.equal(spil.fase, 'afsloer');

  const selmas = spil.opgoer.find(o => o.ejer === 0);
  assert.equal(selmas.rigtige, 1);
  assert.equal(selmas.narrede, 2);
  assert.equal(selmas.ejerPoint, 2 * POINT_NARRET);

  const sofies = spil.opgoer.find(o => o.ejer === 1);
  assert.equal(sofies.rigtige, 0);
  assert.equal(sofies.narrede, 3);
  assert.equal(sofies.ejerPoint, 0, 'narrede alle – for godt gemt');

  const fars = spil.opgoer.find(o => o.ejer === 2);
  assert.equal(fars.rigtige, 3);
  assert.equal(fars.narrede, 0);
  assert.equal(fars.ejerPoint, 0);

  // Rigtige gæt: Selma 2, Sofie 3, Far 1, Mor 1
  assert.equal(spil.spillere[0].point, 2 * POINT_RIGTIGT + 2 * POINT_NARRET, 'Selma: to rigtige + to narrede');
  assert.equal(spil.spillere[1].point, 3 * POINT_RIGTIGT, 'Sofie: tre rigtige, men ingen fandt hendes');
  assert.equal(spil.spillere[2].point, 1 * POINT_RIGTIGT);
  assert.equal(spil.spillere[3].point, 1 * POINT_RIGTIGT);
});

test('afsløringen tager én tegning ad gangen og ender i stillingen', () => {
  const rnd = frø(13);
  const spil = alleTegner(nytSpil({ navne: ['Selma', 'Sofie', 'Far'], rnd }), rnd);
  for (let g = 0; g < 3; g++) { svarTilfaeldigt(spil, rnd); faerdigMedGaet(spil, rnd); }
  assert.equal(spil.fase, 'afsloer');
  assert.equal(spil.opgoer.length, 3);
  assert.equal(afsloeres(spil).tegning, spil.raekkefoelge[0], 'samme rækkefølge som i gætterunden');
  assert.equal(naesteAfsloering(spil), 'afsloer');
  assert.equal(naesteAfsloering(spil), 'afsloer');
  assert.equal(naesteAfsloering(spil), 'stilling', 'efter den sidste');
  assert.equal(afsloeres(spil), null);
});

test('en ny runde rydder tegningerne, men ikke pointene – og efter sidste runde er spillet slut', () => {
  const rnd = frø(21);
  const spil = nytSpil({ navne: ['Selma', 'Sofie', 'Far'], runder: 2, rnd });
  const spilRunde = () => {
    alleTegner(spil, rnd);
    for (let g = 0; g < 3; g++) { svarTilfaeldigt(spil, rnd); faerdigMedGaet(spil, rnd); }
    while (spil.fase === 'afsloer') naesteAfsloering(spil);
  };
  spilRunde();
  const efterEn = spil.spillere.map(p => p.point);
  assert.equal(naesteRunde(spil, rnd), true);
  assert.equal(spil.runde, 2);
  assert.equal(spil.fase, 'tegn');
  assert.equal(spil.tegninger.length, 0, 'tegningerne er ryddet');
  assert.equal(spil.tegner, 0);
  assert.equal(spil.gaetter, 0);
  assert.deepEqual(spil.spillere.map(p => p.point), efterEn, 'pointene står ved magt');
  spilRunde();
  assert.equal(naesteRunde(spil, rnd), false, 'sidste runde');
  assert.equal(spil.fase, 'slut');
});

test('stillingen sorterer efter point, og lige mange point giver samme plads', () => {
  const spil = nytSpil({ navne: ['Selma', 'Sofie', 'Far'], rnd: frø(2) });
  spil.spillere[0].point = 20; spil.spillere[1].point = 35; spil.spillere[2].point = 20;
  assert.deepEqual(stilling(spil).map(r => [r.navn, r.plads]), [['Sofie', 1], ['Selma', 2], ['Far', 2]]);
  assert.deepEqual(vindere(spil).map(r => r.navn), ['Sofie']);
  spil.spillere[0].point = 35;
  assert.deepEqual(vindere(spil).map(r => r.navn), ['Selma', 'Sofie'], 'uafgjort deler førstepladsen');
});

test('bland beholder alle elementer, og tomTegning kender den blanke side', () => {
  const b = bland([0, 1, 2, 3, 4, 5], frø(42));
  assert.deepEqual([...b].sort((x, y) => x - y), [0, 1, 2, 3, 4, 5]);
  assert.equal(tomTegning([]), true);
  assert.equal(tomTegning(null), true);
  assert.equal(tomTegning(streg(0)), false);
});
