// Galgespil – ordene, reglerne og botten. Ingen browser:
//   node --test test/unit/galge.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BOGSTAVER, DELE, NIVEAUER, VEN_LIV, VEN_MAKS, KATEGORIER, ALLE_ORD, HYPPIGE,
  rng, laengde, niveauFraStime, ordTilNiveau, vaelgOrd, rensOrd, nytSpil, maske,
  forkerteTilbage, synligeDele, gaet, botGaet, botSpil,
} from '../../public/spil/galge/galge.mjs';

/* ---------- Ordene ---------- */

test('alfabetet er det danske med ÆØÅ til sidst, og den dumme bot kender alle bogstaver', () => {
  assert.equal(BOGSTAVER.length, 29);
  assert.ok(BOGSTAVER.endsWith('ÆØÅ'));
  assert.equal([...HYPPIGE].sort().join(''), [...BOGSTAVER].sort().join(''));
});

test('alle ord er rene store bogstaver, mindst tre lange, og hvert ord står kun ét sted', () => {
  const set = new Set();
  for (const k of KATEGORIER) {
    assert.ok(k.navn && k.emoji && k.ord.length >= 30, `${k.id} har ${k.ord.length} ord`);
    for (const o of k.ord) {
      assert.match(o, /^[A-ZÆØÅ]{3,}$/, `${k.id}: «${o}»`);
      assert.ok(!set.has(o), `«${o}» står to gange`);
      set.add(o);
    }
  }
  assert.equal(ALLE_ORD.length, set.size);
});

test('hvert niveau har rigeligt med ord, og hver kategori er med på de første', () => {
  for (const n of NIVEAUER) {
    const ord = ordTilNiveau(n);
    assert.ok(ord.length >= 80, `niveau ${n.niveau}: kun ${ord.length} ord`);
    for (const o of ord) assert.ok(laengde(o.ord) >= n.min && laengde(o.ord) <= n.maks);
    if (n.niveau <= 2) {
      for (const k of KATEGORIER) assert.ok(ord.some(o => o.kategori === k.id), `niveau ${n.niveau} mangler ${k.navn}`);
    }
  }
});

/* ---------- Niveauerne ---------- */

test('stimen gør det sværere: længere ord og mere af galgen fra start', () => {
  assert.equal(niveauFraStime(0).niveau, 1);
  assert.equal(niveauFraStime(2).niveau, 1);
  assert.equal(niveauFraStime(3).niveau, 2);
  assert.equal(niveauFraStime(6).niveau, 3);
  assert.equal(niveauFraStime(10).niveau, 4);
  assert.equal(niveauFraStime(500).niveau, 4);
  for (let i = 1; i < NIVEAUER.length; i++) {
    assert.ok(NIVEAUER[i].liv <= NIVEAUER[i - 1].liv, 'aldrig flere liv på et sværere niveau');
    assert.ok(NIVEAUER[i].min >= NIVEAUER[i - 1].min);
    assert.ok(NIVEAUER[i].liv >= 6, 'hele manden skal kunne tegnes – hoved, krop, to arme og to ben');
  }
  assert.equal(NIVEAUER[0].liv, DELE.length, 'på første niveau bygges hele galgen');
});

test('vaelgOrd følger frøet og undgår ord, man har haft', () => {
  const n = NIVEAUER[0];
  const a = rng(5), b = rng(5);
  for (let i = 0; i < 20; i++) assert.deepEqual(vaelgOrd(a, n), vaelgOrd(b, n));
  const r = rng(9), brugte = new Set();
  const antal = ordTilNiveau(n).length;
  for (let i = 0; i < antal; i++) {
    const o = vaelgOrd(r, n, brugte);
    assert.ok(!brugte.has(o.ord), `«${o.ord}» kom igen efter ${i} ord`);
    brugte.add(o.ord);
  }
  assert.ok(vaelgOrd(r, n, brugte), 'er alle brugt, tager den bare et igen');
});

/* ---------- Reglerne ---------- */

test('et rigtigt bogstav kommer frem alle steder, et forkert tegner en ny del', () => {
  const s = nytSpil('ELEFANT', { liv: 10, kategori: 'dyr' });
  assert.deepEqual(maske(s), [null, null, null, null, null, null, null]);
  assert.deepEqual(synligeDele(s), []);
  assert.deepEqual(gaet(s, 'e'), { gyldig: true, rigtig: true, antal: 2 }, 'små bogstaver virker også');
  assert.deepEqual(maske(s), ['E', null, 'E', null, null, null, null]);
  assert.deepEqual(gaet(s, 'Q'), { gyldig: true, rigtig: false, antal: 0 });
  assert.deepEqual(synligeDele(s), ['jord']);
  assert.equal(forkerteTilbage(s), 9);
  assert.equal(gaet(s, 'E').gyldig, false, 'samme bogstav to gange tæller ikke');
  assert.equal(gaet(s, 'Q').gyldig, false, 'heller ikke et forkert');
  assert.equal(gaet(s, '3').gyldig, false, 'og tal er ikke bogstaver');
  assert.equal(gaet(s, 'AB').gyldig, false);
  assert.equal(s.forkerte.length, 1, 'ugyldige gæt koster ikke noget');
  for (const b of 'LFANT') gaet(s, b);
  assert.equal(s.status, 'vundet');
  assert.equal(gaet(s, 'Z').gyldig, false, 'når ordet er fundet, er det slut');
});

test('når hele manden står der, er det tabt – og ordet vises', () => {
  const s = nytSpil('KAT', { liv: 6 });
  assert.deepEqual(synligeDele(s), ['jord', 'stolpe', 'bjaelke', 'reb'], 'på et svært niveau står galgen fra start');
  for (const b of 'BCDEFG') gaet(s, b);
  assert.equal(s.status, 'tabt');
  assert.deepEqual(synligeDele(s), DELE, 'hele manden er tegnet');
  assert.deepEqual(maske(s), ['K', 'A', 'T'], 'ordet kan ses, når det er tabt');
  assert.equal(gaet(s, 'K').gyldig, false);
});

test('et ord fra en ven renses: store bogstaver, ÆØÅ, mellemrum og intet andet', () => {
  assert.equal(rensOrd('pingvin'), 'PINGVIN');
  assert.equal(rensOrd('  Rød   bil! '), 'RØD BIL');
  assert.equal(rensOrd('café'), 'CAFE');
  assert.equal(rensOrd('blåbær-is 2'), 'BLÅBÆRIS');
  assert.equal(rensOrd('a'), null, 'ét bogstav er for lidt');
  assert.equal(rensOrd('123 !!'), null);
  assert.equal(rensOrd(null), null);
  const langt = rensOrd('abcdefghij klmnopqrst uvwxyz');
  assert.equal(laengde(langt), VEN_MAKS);
  assert.ok(!langt.endsWith(' '));
  const s = nytSpil('RØD BIL', { liv: VEN_LIV });
  assert.deepEqual(maske(s), [null, null, null, ' ', null, null, null], 'mellemrummet er ikke noget, man skal gætte');
  for (const b of 'RØDBIL') gaet(s, b);
  assert.equal(s.status, 'vundet');
});

/* ---------- Botten: er det for svært? ---------- */

test('sværhedsgraden: den kloge bot redder altid manden, et barn-agtigt gæt bliver presset efterhånden', () => {
  const andel = (n, klog) => {
    const ord = ordTilNiveau(n);
    return ord.filter(o => botSpil(nytSpil(o.ord, { liv: n.liv, kategori: o.kategori }), { klog }).status === 'vundet').length / ord.length;
  };
  const barn = NIVEAUER.map(n => andel(n, 1 / 3));
  for (const n of NIVEAUER) assert.ok(andel(n, 1) >= 0.95, `niveau ${n.niveau}: den kloge bot taber for tit`);
  assert.ok(barn[0] >= 0.85, `niveau 1 er for svært: ${Math.round(barn[0] * 100)} %`);
  for (let i = 1; i < barn.length; i++) assert.ok(barn[i] < barn[i - 1], `niveau ${i + 1} er ikke sværere end ${i}: ${barn.map(x => x.toFixed(2))}`);
  assert.ok(barn.at(-1) >= 0.25 && barn.at(-1) <= 0.65, `det sidste niveau: ${Math.round(barn.at(-1) * 100)} %`);
  assert.ok(andel(NIVEAUER[0], 0) < barn[0], 'at gætte i blinde er dårligere end at tænke');
});

test('botten gætter aldrig det samme to gange og klarer også et ord uden kategori', () => {
  const s = nytSpil('ZYDY', { liv: VEN_LIV });
  const set = new Set();
  while (s.status === 'spil') {
    const b = botGaet(s);
    assert.ok(!set.has(b));
    set.add(b);
    gaet(s, b);
  }
  assert.ok(['vundet', 'tabt'].includes(s.status));
});
