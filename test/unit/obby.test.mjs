// Enhedstest for Obbys musik (public/spil/obby/musik.mjs) – Sofies ønske nr. 53:
// musik mens man er på banen, og en ny sang hver runde.
//
//   node --test test/unit/obby.test.mjs
//
// Selve spillet testes i browseren (test/obby.test.mjs); her tjekkes kun det,
// der kan regnes ud uden lyd: at sangene hænger sammen, at loopet folder sig
// rigtigt ud, og at posen af sange opfører sig som lovet.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SANGE, TROMMER, TAKT, frekvens, laengde, toner, nyPose, traekSang } from '../../public/spil/obby/musik.mjs';

test('sangene hænger sammen', () => {
  assert.ok(SANGE.length >= 4, `der er flere sange at trække imellem (${SANGE.length})`);
  assert.equal(new Set(SANGE.map(s => s.id)).size, SANGE.length, 'id\'erne er forskellige');
  assert.equal(new Set(SANGE.map(s => s.navn)).size, SANGE.length, 'navnene er forskellige – de står i HUD\'en');
  for (const s of SANGE) {
    assert.ok(s.bpm >= 90 && s.bpm <= 170, `${s.navn}: et tempo man kan hoppe til (${s.bpm})`);
    assert.ok(TROMMER[s.tromme], `${s.navn}: kender sit trommemønster`);
    const m = laengde(s), b = s.bas.reduce((sum, n) => sum + n[1], 0);
    assert.ok(m >= 8, `${s.navn}: loopet er langt nok til ikke at blive træls (${m} slag)`);
    assert.equal(b, m, `${s.navn}: bassen er lige så lang som melodien, ellers skrider loopet`);
    assert.equal(m % TAKT, 0, `${s.navn}: loopet går op i hele takter, så trommerne passer`);
    for (const [midi, l] of s.melodi) {
      assert.ok(l > 0, `${s.navn}: alle noder varer noget`);
      assert.ok(midi === 0 || (midi >= 60 && midi <= 96), `${s.navn}: melodien ligger i et lyst leje (${midi})`);
    }
    for (const [midi, l] of s.bas) {
      assert.ok(l > 0, `${s.navn}: alle basnoder varer noget`);
      assert.ok(midi === 0 || (midi >= 24 && midi <= 55), `${s.navn}: bassen ligger dybt (${midi})`);
    }
  }
});

test('frekvens er ren ligesvævende stemning', () => {
  assert.equal(frekvens(69), 440);
  assert.ok(Math.abs(frekvens(81) - 880) < 1e-9, 'en oktav op er det dobbelte');
  assert.ok(Math.abs(frekvens(60) - 261.6256) < 0.001, 'C4 er 261,63 Hz');
});

test('toner() giver melodi, bas og trommer i vinduet', () => {
  const sang = SANGE[0];
  const t = toner(sang, 0, TAKT);
  assert.ok(t.length > 0, 'der sker noget i den første takt');
  for (let i = 1; i < t.length; i++) assert.ok(t[i].slag >= t[i - 1].slag, 'tonerne kommer i rækkefølge');
  for (const n of t) assert.ok(n.slag >= 0 && n.slag < TAKT, 'ingen toner uden for vinduet');
  const stemmer = new Set(t.map(n => n.stemme));
  for (const s of ['melodi', 'bas', 'kick', 'hat']) assert.ok(stemmer.has(s), `${s} er med`);
  for (const n of t) {
    if (n.stemme === 'melodi' || n.stemme === 'bas') assert.ok(n.midi > 0, 'pauser sendes ikke videre som toner');
  }
});

test('toner() folder loopet ud og deler sig ikke op forskelligt', () => {
  const sang = SANGE[1], loop = laengde(sang);
  const foerste = toner(sang, 0, loop);
  const anden = toner(sang, loop, loop * 2);
  assert.ok(foerste.length > 0);
  assert.equal(anden.length, foerste.length, 'næste gennemspilning er den samme sang');
  assert.deepEqual(
    anden.map(n => [n.slag - loop, n.midi, n.stemme]),
    foerste.map(n => [n.slag, n.midi, n.stemme]),
    'og den ligger præcis ét loop senere');

  // Det samme vindue i småbidder skal give nøjagtig de samme toner som i ét hug
  const bidder = [];
  for (let a = 0; a < loop; a += 0.7) bidder.push(...toner(sang, a, Math.min(loop, a + 0.7)));
  assert.deepEqual(bidder.map(n => [n.slag, n.midi, n.stemme]), foerste.map(n => [n.slag, n.midi, n.stemme]),
    'planlægges der lidt ad gangen, kommer hverken dubletter eller huller');
});

test('toner() tager ikke fejl af et tomt eller bagvendt vindue', () => {
  const sang = SANGE[0];
  assert.deepEqual(toner(sang, 4, 4), []);
  assert.deepEqual(toner(sang, 8, 2), []);
  assert.deepEqual(toner(sang, -10, -1), []);
  assert.ok(toner(sang, -2, 1).every(n => n.slag >= 0), 'negative slag findes ikke');
});

test('hver runde får en ny sang – og alle sangene kommer', () => {
  // Fast «tilfældighed», så testen ikke kan være heldig eller uheldig
  let n = 0;
  const rnd = () => ((n = (n * 1103515245 + 12345) % 2147483648) / 2147483648);
  let pose = nyPose(), sidste = -1;
  const talt = new Map();
  for (let runde = 0; runde < 200; runde++) {
    const t = traekSang(pose, rnd);
    pose = { rest: t.rest, sidste: t.sidste };
    assert.ok(t.nr >= 0 && t.nr < SANGE.length, 'sangen findes');
    assert.notEqual(t.nr, sidste, 'aldrig den samme sang to runder i træk');
    sidste = t.nr;
    talt.set(t.nr, (talt.get(t.nr) || 0) + 1);
  }
  assert.equal(talt.size, SANGE.length, 'alle sangene kommer i spil');
  // Ingen sang bliver klemt ude: den, der lige har spillet, springes over, når
  // posen fyldes, så fordelingen er ikke helt flad – men i nærheden af sin del.
  const del = 200 / SANGE.length;
  const faerrest = Math.min(...talt.values()), flest = Math.max(...talt.values());
  assert.ok(faerrest > del * 0.6 && flest < del * 1.5, `sangene fordeler sig jævnt (${faerrest}-${flest} mod ${Math.round(del)} hver)`);

  // … og ingen sang kommer to gange, før de andre har været der (posen er sedler)
  let p = nyPose();
  const foerste = [];
  for (let i = 0; i < SANGE.length; i++) { const t = traekSang(p, rnd); p = { rest: t.rest, sidste: t.sidste }; foerste.push(t.nr); }
  assert.equal(new Set(foerste).size, SANGE.length, 'de første runder giver hver sin sang');
});

test('en fjollet pose vælter ikke lodtrækningen', () => {
  const t = traekSang({ rest: [99, -1, 'nej'], sidste: 42 }, () => 0.999999);
  assert.ok(t.nr >= 0 && t.nr < SANGE.length, 'ukendte numre smides væk, og der trækkes forfra');
  assert.ok(traekSang(null, () => 0).nr >= 0, 'ingen pose er også en pose');
  assert.ok(traekSang(nyPose(), () => 1).nr >= 0, 'et tal helt oppe ved 1 rammer stadig en sang');
});
