// Pjattemaskinen – rullerne, tørke-reglen og albummet. Ingen browser:
//   node --test test/unit/pjat.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FIGURER, HANDLINGER, STEDER, ALM_VAEGT, GULD_VAEGT, TOERKE_MAKS,
  mulberry32, nytSpil, traek, saetning, alleFundet, gem, hent,
} from '../../public/spil/pjat/maskine.mjs';

/* ---------- Rullerne: listerne skal være i orden ---------- */

test('alle tre ruller er fyldte, uden dubletter og med emoji på alt', () => {
  assert.ok(FIGURER.length >= 20, 'mindst 20 figurer at samle på');
  assert.ok(HANDLINGER.length >= 15 && STEDER.length >= 15, 'nok pjat at blande');
  assert.equal(new Set(FIGURER.map(f => f.id)).size, FIGURER.length, 'figur-id\'er er unikke');
  assert.equal(new Set(HANDLINGER.map(h => h.tekst)).size, HANDLINGER.length);
  assert.equal(new Set(STEDER.map(st => st.tekst)).size, STEDER.length);
  for (const f of FIGURER) {
    assert.ok(f.emoji, f.id + ' mangler emoji');
    assert.ok(f.koen === 'den' || f.koen === 'det', f.id + ' skal have «den» eller «det»');
  }
  for (const x of [...HANDLINGER, ...STEDER]) assert.ok(x.emoji && x.tekst);
});

test('der er netop nogle få gyldne figurer – ellers er guld ikke sjældent', () => {
  const guld = FIGURER.filter(f => f.guld);
  assert.ok(guld.length >= 2 && guld.length <= 6, `fandt ${guld.length} gyldne`);
  assert.ok(GULD_VAEGT < ALM_VAEGT, 'de gyldne skal have færre lodder');
});

/* ---------- Grammatikken: hver eneste kombination skal være rigtig dansk ---------- */

test('alle sætninger begynder med Den/Det, ender med ! og har ingen dobbelte mellemrum', () => {
  for (const figur of FIGURER) {
    for (const handling of HANDLINGER) {
      for (const sted of STEDER) {
        const t = saetning({ figur, handling, sted });
        assert.match(t, /^(Den|Det) .+!$/, t);
        assert.ok(!t.includes('  '), 'dobbelt mellemrum i: ' + t);
      }
    }
  }
});

test('figurens eget den/det følger med: dovendyret er «det»', () => {
  const dovendyr = FIGURER.find(f => f.id === 'dovendyr');
  const t = saetning({ figur: dovendyr, handling: HANDLINGER[0], sted: STEDER[0] });
  assert.match(t, /^Det søvnige dovendyr /);
});

/* ---------- Trækket ---------- */

test('et træk lægger en ny figur i albummet og tæller drej op', () => {
  const s = nytSpil();
  const r = mulberry32(7);
  const t = traek(s, r);
  assert.equal(t.ny, true, 'den allerførste figur er altid ny');
  assert.equal(s.album.length, 1);
  assert.equal(s.album[0], t.figur.id);
  assert.equal(s.drej, 1);
  assert.equal(s.toerke, 0, 'en ny figur nulstiller tørken');
});

test('en figur man har mødt, giver ikke en ny plads i albummet', () => {
  const s = nytSpil();
  s.album = FIGURER.map(f => f.id);        // alt er fundet
  const foer = s.album.length;
  const r = mulberry32(3);
  const t = traek(s, r);
  assert.equal(t.ny, false);
  assert.equal(s.album.length, foer);
  assert.equal(s.toerke, 1, 'tørken tæller op');
});

test('tørke-reglen: efter TOERKE_MAKS tørre træk er den næste garanteret ny', () => {
  // Kun én figur mangler – og tørken er på maks. Uanset terningen skal netop
  // den figur komme nu.
  for (let seed = 1; seed <= 25; seed++) {
    const s = nytSpil();
    s.album = FIGURER.slice(1).map(f => f.id);
    s.toerke = TOERKE_MAKS;
    const t = traek(s, mulberry32(seed));
    assert.equal(t.figur.id, FIGURER[0].id, `seed ${seed} gav ${t.figur.id}`);
    assert.equal(t.ny, true);
  }
});

test('albummet bliver fuldt på et forudsigeligt antal træk – tørke-reglen sætter loftet', () => {
  const r = mulberry32(42);
  const s = nytSpil();
  const loft = FIGURER.length * (TOERKE_MAKS + 1);
  while (!alleFundet(s) && s.drej < loft + 1) traek(s, r);
  assert.ok(alleFundet(s), 'albummet kan fyldes');
  assert.ok(s.drej <= loft, `tog ${s.drej} træk – tørke-reglen lover højst ${loft}`);
});

test('de gyldne figurer ER sjældne – men ikke umulige', () => {
  const r = mulberry32(99);
  let guld = 0;
  const N = 20000;
  for (let i = 0; i < N; i++) {
    const s = nytSpil();                   // frisk spil hver gang: ingen tørke-hjælp
    if (traek(s, r).guld) guld++;
  }
  const andel = guld / N;
  // Fire gyldne à vægt 1 mod tyve almindelige à vægt 5 giver ~3,8 %.
  assert.ok(andel > 0.015, `kun ${(andel * 100).toFixed(1)} % guld – for sjældent`);
  assert.ok(andel < 0.08, `${(andel * 100).toFixed(1)} % guld – for almindeligt`);
});

test('handling og sted trækkes over hele posen', () => {
  const r = mulberry32(11);
  const seteHandlinger = new Set(), seteSteder = new Set();
  const s = nytSpil();
  for (let i = 0; i < 2000; i++) {
    const t = traek(s, r);
    seteHandlinger.add(t.handling.tekst);
    seteSteder.add(t.sted.tekst);
  }
  assert.equal(seteHandlinger.size, HANDLINGER.length, 'alle handlinger kommer i spil');
  assert.equal(seteSteder.size, STEDER.length, 'alle steder kommer i spil');
});

test('samme seed giver samme pjat – det er sådan, testene kan spille med', () => {
  const a = nytSpil(), b = nytSpil();
  const ra = mulberry32(1234), rb = mulberry32(1234);
  for (let i = 0; i < 50; i++) {
    assert.equal(saetning(traek(a, ra)), saetning(traek(b, rb)));
  }
});

/* ---------- Gem og hent ---------- */

test('gem og hent er hinandens modsatte', () => {
  const s = nytSpil();
  const r = mulberry32(5);
  for (let i = 0; i < 12; i++) traek(s, r);
  const t = hent(gem(s));
  assert.deepEqual(t.album, s.album);
  assert.equal(t.drej, s.drej);
  assert.equal(t.toerke, s.toerke);
});

test('skrald i localStorage bliver bare et nyt spil', () => {
  for (const skrald of ['', 'øh', '{"album":"NaN"}', '[]', '{"drej":-4}']) {
    const s = hent(skrald);
    assert.deepEqual(s.album, [], `«${skrald}» gav album ${JSON.stringify(s.album)}`);
    assert.ok(s.drej >= 0 && s.toerke >= 0);
  }
});

test('ukendte figurer og dubletter i et gemt album ryddes ved hentning', () => {
  const s = hent('{"album":["flodhest","yeti","flodhest","drage"],"drej":9,"toerke":3}');
  assert.deepEqual(s.album, ['flodhest', 'drage'], 'kun kendte figurer, hver én gang');
  assert.equal(s.drej, 9);
});
