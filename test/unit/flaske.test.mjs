// Flaskehavet – flasken, havdyrene og farerne. Ingen browser:
//   node --test test/unit/flaske.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DYBDE, FLASKE_R, FART0, FART_MAKS, DYK, OPDRIFT, VY_MAKS, LIV, USAARLIG,
  STYKKE, HAV_FRA, ARTER, FARER,
  dyrY, stykke, naerStykker, nyTur, tik, naesteDyr, bot, koer,
} from '../../public/spil/flaske/flaske.mjs';

const SEEDS = [1, 2, 3, 7, 42, 99, 123];
const gns = a => a.reduce((x, y) => x + y, 0) / a.length;

/* ---------- Havet, stykke for stykke ---------- */

test('stykkerne er de samme hver gang med samme frø – og andre med et andet', () => {
  for (let n = 0; n < 20; n++) {
    assert.deepEqual(stykke(7, n), stykke(7, n));
  }
  const ens = [...Array(20).keys()].every(n =>
    JSON.stringify(stykke(7, n)) === JSON.stringify(stykke(8, n)));
  assert.equal(ens, false, 'to frø må ikke give det samme hav');
});

test('dyrene er rigtige havdyr og bor i vandet', () => {
  for (const seed of SEEDS) {
    for (let n = 0; n < 60; n++) {
      const st = stykke(seed, n);
      assert.ok(st.dyr.length <= 6, `frø ${seed} stykke ${n}: for mange dyr`);
      for (const d of st.dyr) {
        assert.ok(ARTER[d.art], `${d.art} er ikke en kendt art`);
        assert.ok(d.x >= st.x0 && d.x <= st.x0 + STYKKE, 'dyret bor i sit stykke');
        // Hele svømmeturen (y ± amp) skal ligge i vandet
        assert.ok(d.y - d.amp >= 1.5, `frø ${seed} stykke ${n}: ${d.art} svømmer op af vandet`);
        assert.ok(d.y + d.amp <= DYBDE - 0.5, `frø ${seed} stykke ${n}: ${d.art} graver sig ned`);
        if (ARTER[d.art].bund) assert.ok(d.y > DYBDE - 2.5, `${d.art} skal bo på bunden`);
      }
      const ids = [...st.dyr, ...st.farer].map(o => o.id);
      assert.equal(new Set(ids).size, ids.length, 'to ting med samme id');
    }
  }
});

test('farerne holder afstand – også hen over skellet mellem to stykker', () => {
  for (const seed of SEEDS) {
    let alle = [];
    for (let n = 0; n < 60; n++) {
      const st = stykke(seed, n);
      for (const f of st.farer) {
        assert.ok(FARER[f.slags], `${f.slags} er ikke en kendt fare`);
        if (f.slags === 'soepindsvin') assert.ok(f.y > DYBDE - 2, 'søpindsvin sidder på bunden');
        else {
          assert.ok(f.y - f.amp >= 1.8, `frø ${seed} stykke ${n}: brandmanden når op af vandet`);
          assert.ok(f.y + f.amp <= DYBDE - 1.8, `frø ${seed} stykke ${n}: brandmanden når ned i sandet`);
        }
        alle.push(f);
      }
    }
    alle.sort((a, b) => a.x - b.x);
    for (let i = 1; i < alle.length; i++) {
      assert.ok(alle[i].x - alle[i - 1].x >= 4,
        `frø ${seed}: to farer for tæt (${alle[i - 1].x.toFixed(1)} og ${alle[i].x.toFixed(1)})`);
    }
  }
});

test('der kommer flere farer, jo længere man driver ud', () => {
  for (const seed of SEEDS) {
    const naere = gns([...Array(3).keys()].map(n => stykke(seed, n).farer.length));
    const fjerne = gns([...Array(3).keys()].map(n => stykke(seed, n + 30).farer.length));
    assert.ok(fjerne > naere + 1, `frø ${seed}: havet bliver ikke farligere (${naere} → ${fjerne})`);
  }
});

test('naerStykker finder stykkerne omkring x og ingen andre', () => {
  const r = naerStykker(7, HAV_FRA + STYKKE * 3 + 2);
  assert.ok(r.length >= 1);
  for (const st of r) assert.ok(Math.abs(st.x0 + STYKKE / 2 - (HAV_FRA + STYKKE * 3 + 2)) <= STYKKE / 2 + 6 + STYKKE);
  assert.deepEqual(naerStykker(7, 0), [], 'ved starten er der åbent vand');
});

/* ---------- Flaskens fysik ---------- */

test('en frisk tur ligger midt i vandet med fuld liv og tom flaske', () => {
  const s = nyTur(7);
  assert.equal(s.x, 0);
  assert.ok(s.y > 5 && s.y < DYBDE - 5);
  assert.equal(s.liv, LIV);
  assert.equal(s.fangst, 0);
  assert.equal(s.doed, false);
});

test('holder man, dykker flasken – slipper man, flyder den op', () => {
  const s = nyTur(7);
  const yFoer = s.y;
  for (let i = 0; i < 30; i++) tik(s, 1 / 60, true);
  assert.ok(s.y > yFoer + 1, 'flasken dykker, mens man holder');
  assert.ok(s.vy > 0 && s.vy <= VY_MAKS, 'og aldrig hurtigere end loftet');
  for (let i = 0; i < 60 * 5; i++) tik(s, 1 / 60, false);
  assert.ok(s.y < 2, 'slipper man længe nok, ender flasken i overfladen');
  assert.equal(s.vy, 0, 'hvor den bare ligger og vugger');
  for (let i = 0; i < 60 * 6; i++) tik(s, 1 / 60, true);
  assert.ok(Math.abs(s.y - (DYBDE - 0.9)) < 1e-9, 'og bunden er der også en bund på');
});

test('strømmen tager til hele turen, men aldrig over loftet – og turen er ens hver gang', () => {
  const a = nyTur(7), b = nyTur(7);
  for (let i = 0; i < 60 * 30; i++) { tik(a, 1 / 60, i % 60 < 30); tik(b, 1 / 60, i % 60 < 30); }
  assert.ok(a.fart > FART0 + 0.5, 'strømmen er taget til');
  assert.deepEqual({ x: a.x, y: a.y, fangst: a.fangst, liv: a.liv },
    { x: b.x, y: b.y, fangst: b.fangst, liv: b.liv }, 'samme frø, samme tur');
  for (let i = 0; i < 60 * 400 && !a.doed; i++) tik(a, 1 / 60, false);
  assert.ok(a.fart <= FART_MAKS + 1e-9, 'strømmen har et loft');
});

/* ---------- Fangst ---------- */

test('et havdyr svømmer ind i flasken – og kan ikke fanges to gange', () => {
  const s = nyTur(7);
  const d = stykke(7, 0).dyr[0];
  s.x = d.x - 0.2; s.y = dyrY(d, s.t + 1 / 60);
  const e = tik(s, 1 / 60, false);
  assert.equal(e.fanget, d.art, 'hændelsen siger hvad man fangede');
  assert.equal(s.fangst, 1);
  assert.equal(s.fanget[d.id], true);
  s.x = d.x - 0.2; s.y = dyrY(d, s.t + 1 / 60); s.vy = 0;
  const e2 = tik(s, 1 / 60, false);
  assert.equal(e2.fanget, null, 'dyret er allerede i flasken');
  assert.equal(s.fangst, 1);
});

test('naesteDyr peger på det nærmeste ufangede dyr forude', () => {
  const s = nyTur(7);
  s.x = HAV_FRA - 2;
  const d = naesteDyr(s);
  assert.ok(d, 'der er et dyr forude');
  assert.ok(d.x >= s.x - 1);
  const alle = naerStykker(7, s.x + 9, 13).flatMap(st => st.dyr).filter(x => x.x >= s.x - 1 && x.x <= s.x + 18);
  assert.equal(d.x, Math.min(...alle.map(x => x.x)), 'og det er det første, man møder');
  s.fanget[d.id] = true;
  assert.notEqual(naesteDyr(s)?.id, d.id, 'et fanget dyr jages ikke igen');
});

/* ---------- Farerne ---------- */

function foersteFare(seed, slags = null) {
  for (let n = 0; n < 40; n++) {
    for (const f of stykke(seed, n).farer) if (!slags || f.slags === slags) return f;
  }
  return null;
}

test('en brandmand koster et liv – og lige efter er man usårlig', () => {
  const s = nyTur(7);
  const f = foersteFare(7);
  s.x = f.x - 0.2; s.y = dyrY(f, s.t + 1 / 60);
  const e = tik(s, 1 / 60, false);
  assert.equal(e.ramt, f.slags);
  assert.equal(s.liv, LIV - 1);
  assert.ok(s.usaarlig > 0 && s.usaarlig <= USAARLIG);
  // Mens man er usårlig, koster det næste ikke.
  s.x = f.x - 0.2; s.y = dyrY(f, s.t + 1 / 60); s.vy = 0;
  tik(s, 1 / 60, false);
  assert.equal(s.liv, LIV - 1, 'lige efter et stød er man usårlig et øjeblik');
});

test('tre stød og flasken går i stykker', () => {
  const s = nyTur(7);
  const f = foersteFare(7);
  let knust = false;
  for (let n = 0; n < LIV; n++) {
    s.usaarlig = 0;
    s.x = f.x - 0.2; s.y = dyrY(f, s.t + 1 / 60); s.vy = 0;
    knust = tik(s, 1 / 60, false).knust;
  }
  assert.equal(s.liv, 0);
  assert.equal(s.doed, true);
  assert.equal(knust, true);
  assert.equal(s.aarsag, f.slags);
});

test('når flasken er gået i stykker, sker der ikke mere', () => {
  const s = nyTur(7);
  s.doed = true; s.aarsag = 'brandmand';
  const foer = { x: s.x, y: s.y, fangst: s.fangst, liv: s.liv, t: s.t };
  const e = tik(s, 1 / 60, true);
  assert.deepEqual({ x: s.x, y: s.y, fangst: s.fangst, liv: s.liv, t: s.t }, foer);
  assert.ok(!e.knust && !e.ramt && !e.fanget, 'flasken går kun i stykker én gang');
});

/* ---------- Balancen: kan det spilles? ---------- */

test('botten fanger havdyr – så havet kan faktisk fiskes', () => {
  const ture = SEEDS.map(seed => koer(seed, 90));
  for (const s of ture) {
    assert.ok(s.fangst >= 8, `frø ${s.seed}: botten fangede kun ${s.fangst} havdyr`);
    assert.ok(Number.isFinite(s.x) && Number.isFinite(s.y), 'ingenting bliver til ingenting');
  }
  assert.ok(gns(ture.map(s => s.fangst)) > 15,
    `en almindelig tur skal give en pæn fangst (${gns(ture.map(s => s.fangst)).toFixed(0)})`);
});

test('den der dykker efter dyrene, fanger mere end den der bare flyder i overfladen', () => {
  const dygtige = SEEDS.map(seed => koer(seed, 60).fangst);
  const dovne = SEEDS.map(seed => koer(seed, 60, () => false).fangst);
  assert.ok(gns(dygtige) > 2 * gns(dovne),
    `det skal kunne betale sig at dykke (${gns(dovne).toFixed(1)} mod ${gns(dygtige).toFixed(1)})`);
});

test('til sidst tager havet flasken – farerne bliver for mange', () => {
  const ture = SEEDS.map(seed => koer(seed, 600));
  const doede = ture.filter(s => s.doed).length;
  assert.ok(doede >= SEEDS.length - 1, `en tur skal slutte af sig selv (${doede} af ${SEEDS.length} gjorde)`);
  for (const s of ture.filter(s => s.doed)) {
    assert.ok(s.t > 20, `men ikke med det samme (frø ${s.seed} døde efter ${s.t.toFixed(0)} s)`);
  }
});
