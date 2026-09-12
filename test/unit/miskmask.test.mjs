// Motoren bag «Miskmask»: at alle 13 minispil kan vindes, at de kan tabes på
// de måder de skal, og at det går hurtigere, jo længere man når. Ingen browser:
//   node --test test/unit/miskmask.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LIV, TID_START, TID_MIN, MIKROSPIL, MIKRO, FARVER, RAMME,
  svaerhed, tidFor, pose, lavRunde, nyRunde, tryk, tik, facit, loes, feltUnder, pladser, raekke, bland,
} from '../../public/spil/miskmask/mikro.mjs';

/** Lille seedbar terning, så en fejl kan spilles igen. */
function terning(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const RUNDER = [1, 3, 8, 15, 30];      // begynder-runder og runder ved fuld fart

test('rammerne for spillet', () => {
  assert.equal(LIV, 3);
  assert.equal(MIKROSPIL.length, 13, 'posen har 13 forskellige minispil');
  assert.equal(new Set(MIKROSPIL.map(m => m.id)).size, 13, 'to minispil med samme id');
  for (const m of MIKROSPIL) {
    assert.ok(m.navn && m.navn.length < 30, `${m.id}: navnet vises på startskærmen`);
    assert.equal(typeof m.forbered, 'function', `${m.id}: mangler forbered()`);
  }
});

test('tiden bliver kortere, jo længere man når – men aldrig kortere end TID_MIN', () => {
  assert.equal(svaerhed(1), 0);
  assert.equal(svaerhed(21), 1);
  assert.equal(svaerhed(100), 1, 'sværheden stopper ved fuld fart');
  assert.equal(tidFor(1), TID_START);
  assert.equal(tidFor(21), TID_MIN);
  assert.ok(tidFor(10) < tidFor(3) && tidFor(10) > TID_MIN, 'og noget midtimellem undervejs');
  assert.ok(tidFor(1, 1.3) > tidFor(1), 'et langsomt minispil får ekstra tid');
});

test('hvert minispil kan vindes ved at gøre det rigtige – i alle sværhedsgrader', () => {
  for (const m of MIKROSPIL) {
    for (const seed of [1, 2, 3, 7, 99, 12345]) {
      for (const runde of RUNDER) {
        const rnd = terning(seed * 31 + runde);
        const r = lavRunde(m, rnd, runde);
        assert.ok(r.instruktion && r.instruktion.length > 2, `${m.id}: der skal stå hvad man skal gøre`);
        assert.ok(r.tid >= TID_MIN * 0.6, `${m.id}: urimeligt kort tid (${r.tid})`);
        assert.ok(r.felter.length >= 1, `${m.id}: ingen felter`);
        for (const f of r.felter) {
          assert.ok(f.w > 0 && f.h > 0, `${m.id}: et felt uden størrelse`);
          assert.ok(f.x >= -2 && f.x <= 102 && f.y >= -2 && f.y <= 102, `${m.id}: et felt uden for fladen (${f.x}, ${f.y})`);
        }
        if (r.vindVedTid) {
          assert.equal(facit(r).length, 0, `${m.id}: vent-runder har ingen tryk i facit`);
          assert.equal(tik(r, r.tid + 0.01), 'vandt', `${m.id}: man vinder ved at lade være`);
        } else {
          assert.ok(r.krav >= 1, `${m.id}: krav skal være mindst ét tryk`);
          assert.equal(loes(r), 'vandt', `${m.id}: kunne ikke vindes (seed ${seed}, runde ${runde})`);
          assert.ok(r.ramt >= r.krav, `${m.id}: vandt uden at have ramt nok`);
        }
      }
    }
  }
});

test('man taber, når tiden løber ud – undtagen i vent-runderne', () => {
  for (const m of MIKROSPIL) {
    const r = lavRunde(m, terning(5), 4);
    const status = tik(r, r.tid + 0.01);
    assert.equal(status, r.vindVedTid ? 'vandt' : 'tabte', `${m.id}: forkert udfald når tiden løber ud`);
    assert.equal(r.tilbage, 0);
    assert.equal(tik(r, 1), status, 'en afgjort runde ændrer sig ikke af, at der går mere tid');
  }
});

test('et tryk på et forkert felt koster runden', () => {
  for (const m of MIKROSPIL) {
    const r = lavRunde(m, terning(11), 6);
    const forkert = r.felter.find(f => !f.rigtig);
    if (!forkert) continue;                       // balloner og «tryk mange gange» har ingen fælder
    assert.equal(tryk(r, forkert.x, forkert.y), 'tabte', `${m.id}: det forkerte felt burde koste et liv`);
    assert.equal(r.forkert, forkert, `${m.id}: spillet skal kunne vise hvad man ramte`);
  }
});

test('mindst halvdelen af minispillene har noget, man kan ramme forkert', () => {
  const medFaelde = MIKROSPIL.filter(m => lavRunde(m, terning(3), 6).felter.some(f => !f.rigtig));
  assert.ok(medFaelde.length >= 7, `kun ${medFaelde.length} minispil kan tabes ved et forkert tryk`);
});

test('tryk i det tomme koster ikke noget', () => {
  const r = lavRunde(MIKRO.farve, terning(4), 2);
  // Hjørnet er tomt i «find farven» (fire cirkler i midten)
  assert.equal(tryk(r, 1, 1), 'spiller', 'et tryk ved siden af er ikke en fejl');
  assert.equal(r.ramt, 0);
});

test('man må ramme lidt ved siden af et rigtigt felt, men ikke ved siden af et forkert', () => {
  const r = lavRunde(MIKRO.farve, terning(8), 2);
  const rigtigt = r.felter.find(f => f.rigtig);
  const lidtVedSiden = rigtigt.x + rigtigt.w / 2 + RAMME * 0.6;
  assert.equal(feltUnder(r, lidtVedSiden, rigtigt.y), null, 'punktet er uden for selve feltet');
  assert.equal(tryk(r, lidtVedSiden, rigtigt.y), 'vandt', 'men tæller alligevel med');

  const r2 = lavRunde(MIKRO.farve, terning(8), 2);
  const forkert = r2.felter.find(f => !f.rigtig && Math.abs(f.x - r2.felter.find(q => q.rigtig).x) > 20);
  if (forkert) {
    assert.equal(tryk(r2, forkert.x, forkert.y - forkert.h / 2 - RAMME * 0.6), 'spiller', 'næsten-tryk på et forkert felt er gratis');
  }
});

test('«tryk mange gange» kræver lige så mange tryk, som der står', () => {
  const r = lavRunde(MIKRO.gentag, terning(2), 9);
  const antal = parseInt(r.instruktion.match(/\d+/)[0], 10);
  assert.equal(r.krav, antal, 'instruktionen og kravet siger det samme');
  const f = r.felter[0];
  for (let i = 1; i < antal; i++) {
    assert.equal(tryk(r, f.x, f.y), 'spiller', `tryk nr. ${i} er ikke nok`);
    assert.equal(r.ramt, i);
  }
  assert.equal(tryk(r, f.x, f.y), 'vandt', 'det sidste tryk vinder');
});

test('«1-2-3» skal trykkes i rækkefølge', () => {
  const r = lavRunde(MIKRO.orden, terning(6), 12);
  const sorteret = r.felter.slice().sort((a, b) => a.orden - b.orden);
  assert.ok(sorteret.length >= 3);
  assert.deepEqual(facit(r), sorteret.map(f => ({ x: f.x, y: f.y })), 'facit kommer i rækkefølge');
  assert.equal(tryk(r, sorteret[1].x, sorteret[1].y), 'tabte', 'toeren før etteren er en fejl');

  const r2 = lavRunde(MIKRO.orden, terning(6), 12);
  assert.equal(loes(r2), 'vandt', 'og i rækkefølge går det godt');
});

test('«hvor mange» har præcis ét rigtigt svar, og det passer med det, der er tegnet', () => {
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const r = lavRunde(MIKRO.tael, terning(seed), 10);
    const rigtige = r.felter.filter(f => f.rigtig);
    assert.equal(rigtige.length, 1, 'ét rigtigt svar');
    assert.equal(Number(rigtige[0].tekst), r.pynt.length, 'svaret er antallet af ting på skærmen');
    assert.equal(new Set(r.felter.map(f => f.tekst)).size, r.felter.length, 'ingen ens svarmuligheder');
  }
});

test('«passer det?» regner rigtigt', () => {
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const r = lavRunde(MIKRO.regne, terning(seed), 7);
    const [, a, tegn, b, vist] = r.pynt[0].tekst.match(/(\d+) ([+−]) (\d+) = (-?\d+)/);
    const svar = tegn === '+' ? Number(a) + Number(b) : Number(a) - Number(b);
    const passer = svar === Number(vist);
    const ja = r.felter.find(f => f.tekst === 'JA'), nej = r.felter.find(f => f.tekst === 'NEJ');
    assert.equal(ja.rigtig, passer, `${r.pynt[0].tekst}: JA er ${passer ? 'rigtigt' : 'forkert'}`);
    assert.equal(nej.rigtig, !passer);
  }
});

test('«find den anderledes» har netop én, der stikker ud', () => {
  for (const seed of [1, 5, 9, 13]) {
    const r = lavRunde(MIKRO.anderledes, terning(seed), 14);
    const rigtige = r.felter.filter(f => f.rigtig);
    assert.equal(rigtige.length, 1);
    const andre = new Set(r.felter.filter(f => !f.rigtig).map(f => f.farve));
    assert.equal(andre.size, 1, 'alle de andre har samme farve');
    assert.ok(!andre.has(rigtige[0].farve), 'og den ene har en anden');
  }
});

test('«find farven» beder om en farve, der faktisk ligger på fladen', () => {
  for (const seed of [2, 4, 8, 16]) {
    const r = lavRunde(MIKRO.farve, terning(seed), 5);
    const maal = FARVER.find(f => r.instruktion.endsWith(f.navn));
    assert.ok(maal, `instruktionen «${r.instruktion}» nævner ingen kendt farve`);
    assert.equal(r.felter.filter(f => f.farve === maal.hex).length, 1, 'kun én cirkel i den farve');
    assert.equal(r.felter.find(f => f.farve === maal.hex).rigtig, true, 'og det er den rigtige');
  }
});

test('ballonerne stiger og kommer igen nedefra', () => {
  const r = lavRunde(MIKRO.balloner, terning(3), 8);
  const foer = r.felter.map(f => f.y);
  tik(r, 0.4);
  assert.ok(r.felter.every((f, i) => f.y < foer[i]), 'alle balloner er steget');
  tik(r, 30);                                    // runden er for længst tabt, men ballonerne skal stadig være på fladen
  assert.ok(r.felter.every(f => f.y > -13 && f.y < 105), 'ingen balloner er forsvundet ud i ingenting');
});

test('den der skal fanges bliver inden for fladen', () => {
  const r = lavRunde(MIKRO.fang, terning(9), 20);
  for (let i = 0; i < 600; i++) tik(r, 1 / 60);
  const f = r.felter[0];
  assert.ok(f.x > 0 && f.x < 100 && f.y > 0 && f.y < 100, `den løb af skærmen (${f.x}, ${f.y})`);
});

test('posen giver alle 13 minispil, før nogen kommer igen', () => {
  const rnd = terning(42);
  const posen = pose(rnd);
  const foerste = Array.from({ length: 13 }, () => posen.naeste().id);
  assert.equal(new Set(foerste).size, 13, 'de 13 første runder er 13 forskellige spil');
  const naeste = Array.from({ length: 13 }, () => posen.naeste().id);
  assert.equal(new Set(naeste).size, 13, 'og så kommer de alle sammen igen');
  assert.notEqual(naeste[0], foerste[12], 'men aldrig det samme to gange i træk');
});

test('en hel omgang kan spilles igennem – 25 runder i træk uden at tabe', () => {
  const rnd = terning(2026);
  const posen = pose(rnd);
  let vundet = 0;
  for (let runde = 1; runde <= 25; runde++) {
    const r = nyRunde(posen, rnd, runde);
    const status = r.vindVedTid ? tik(r, r.tid + 0.01) : loes(r);
    assert.equal(status, 'vandt', `runde ${runde} (${r.id}) kunne ikke vindes`);
    vundet++;
  }
  assert.equal(vundet, 25);
});

test('hjælperne opfører sig ordentligt', () => {
  const rnd = terning(1);
  const p = pladser(rnd, 6);
  assert.equal(p.length, 6);
  for (const q of p) assert.ok(q.x > 0 && q.x < 100 && q.y > 0 && q.y < 100 && q.plads > 5);
  const rk = raekke(3, 50);
  assert.ok(rk[0].x < rk[1].x && rk[1].x < rk[2].x, 'rækken kommer fra venstre mod højre');
  assert.deepEqual(bland(terning(7), [1, 2, 3, 4, 5]).sort(), [1, 2, 3, 4, 5], 'blanding taber ikke noget');
});
