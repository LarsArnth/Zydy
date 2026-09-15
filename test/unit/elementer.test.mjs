// Elementløbet – banen, elementerne og reglerne. Ingen browser:
//   node --test test/unit/elementer.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FART0, FART_MAKS, FART_STIGNING, LIV, FRA_T, MELLEMRUM0, MELLEMRUM_MIN,
  ELEMENTER, RAEKKEFOELGE, FORHINDRINGER, TYPER,
  fartVedT, xVedT, forhindring, forhindringerFrem, nyTur, tik,
  naesteForhindring, bot, koer,
} from '../../public/spil/elementer/elementer.mjs';

const SEEDS = [1, 2, 3, 7, 42, 99, 123];
const gns = a => a.reduce((x, y) => x + y, 0) / a.length;

/* ---------- Elementerne og forhindringerne hænger sammen ---------- */

test('hver forhindring klares af netop ét element – og alle fire elementer bruges', () => {
  assert.deepEqual(RAEKKEFOELGE.slice().sort(), Object.keys(ELEMENTER).sort(), 'rækkefølgen nævner alle elementer');
  const brugte = new Set();
  for (const slags of TYPER) {
    const f = FORHINDRINGER[slags];
    assert.ok(ELEMENTER[f.klares], `${slags} klares af noget, der ikke er et element`);
    brugte.add(f.klares);
  }
  assert.equal(brugte.size, 4, 'hvert element skal have sin egen forhindring');
});

/* ---------- Farten ---------- */

test('farten stiger jævnt og rammer loftet – og xVedT er dens integral', () => {
  assert.equal(fartVedT(0), FART0);
  assert.ok(fartVedT(60) > FART0);
  assert.equal(fartVedT(10000), FART_MAKS);
  // Numerisk integration skal give det samme som formlen
  for (const t of [5, 50, (FART_MAKS - FART0) / FART_STIGNING + 30]) {
    let x = 0;
    const dt = 1 / 1000;
    for (let i = 0; i < t / dt; i++) x += fartVedT(i * dt) * dt;
    assert.ok(Math.abs(x - xVedT(t)) < 0.5, `xVedT(${t}) rammer ved siden af (${x.toFixed(1)} mod ${xVedT(t).toFixed(1)})`);
  }
});

/* ---------- Banen ---------- */

test('banen er den samme hver gang med samme frø – og en anden med et andet', () => {
  for (let n = 0; n < 50; n++) assert.deepEqual(forhindring(7, n), forhindring(7, n));
  const ens = [...Array(50).keys()].every(n => forhindring(7, n).slags === forhindring(8, n).slags);
  assert.equal(ens, false, 'to frø må ikke give den samme bane');
});

test('forhindringerne ligger fremad, med kendte slags, og aldrig tættere end MELLEMRUM_MIN sekunder', () => {
  for (const seed of SEEDS) {
    for (let n = 0; n < 400; n++) {
      const f = forhindring(seed, n);
      assert.equal(f.n, n);
      assert.ok(FORHINDRINGER[f.slags], `${f.slags} er ikke en kendt forhindring`);
      assert.equal(f.klares, FORHINDRINGER[f.slags].klares);
      assert.ok(Math.abs(f.x - xVedT(f.t)) < 1e-9, 'x og t skal følges ad');
      if (n === 0) assert.ok(f.t >= FRA_T - 1e-9, 'den første kommer ikke med det samme');
      else {
        const mellemrum = f.t - forhindring(seed, n - 1).t;
        assert.ok(mellemrum >= MELLEMRUM_MIN - 1e-9,
          `frø ${seed} nr. ${n}: kun ${mellemrum.toFixed(2)} s reaktionstid`);
      }
    }
  }
});

test('forhindringerne kommer tættere, jo længere man kommer', () => {
  for (const seed of SEEDS) {
    const gab = n => forhindring(seed, n + 1).t - forhindring(seed, n).t;
    const tidlige = gns([...Array(10).keys()].map(gab));
    const sene = gns([...Array(10).keys()].map(n => gab(n + 150)));
    assert.ok(sene < tidlige - 0.5, `frø ${seed}: banen bliver ikke sværere (${tidlige.toFixed(2)} → ${sene.toFixed(2)})`);
    assert.ok(tidlige > 1.6, `frø ${seed}: starten skal være rolig (${tidlige.toFixed(2)} s)`);
  }
});

test('to ens forhindringer i træk er sjældne – man skal faktisk skifte element', () => {
  for (const seed of SEEDS) {
    let ens = 0;
    for (let n = 1; n < 200; n++) {
      if (forhindring(seed, n).slags === forhindring(seed, n - 1).slags) ens++;
    }
    assert.ok(ens < 200 * 0.2, `frø ${seed}: ${ens} af 200 gentager sig selv`);
  }
});

test('forhindringerFrem giver dem fra `fra` og frem til tilX – og ikke flere', () => {
  const alle = forhindringerFrem(7, 0, 200);
  assert.ok(alle.length > 3);
  for (let i = 0; i < alle.length; i++) {
    assert.equal(alle[i].n, i);
    assert.ok(alle[i].x <= 200);
  }
  assert.ok(forhindring(7, alle.length).x > 200, 'den næste ligger forbi tilX');
  assert.equal(forhindringerFrem(7, 2, 200)[0].n, 2, '`fra` springer de første over');
});

/* ---------- Reglerne ---------- */

/** Stiller løberen lige foran forhindring nr. `n` med elementet `el`. */
function moed(s, n, el) {
  const f = forhindring(s.seed, n);
  s.naeste = n;
  s.x = f.x - 0.01;
  return tik(s, 0.01, el);
}

test('en frisk tur starter som jord med fuld liv og nul klaret', () => {
  const s = nyTur(7);
  assert.equal(s.element, 'jord');
  assert.equal(s.liv, LIV);
  assert.equal(s.klaret, 0);
  assert.equal(s.doed, false);
  assert.equal(naesteForhindring(s).n, 0);
});

test('det rigtige element klarer forhindringen – og stimen tæller', () => {
  const s = nyTur(7);
  const f = forhindring(7, 0);
  const e = moed(s, 0, f.klares);
  assert.equal(e.klaret.n, 0, 'hændelsen siger hvad man klarede');
  assert.equal(e.ramt, null);
  assert.equal(s.klaret, 1);
  assert.equal(s.stime, 1);
  assert.equal(s.liv, LIV, 'og det koster ikke noget');
  assert.equal(s.loest[0], true);
  assert.equal(s.naeste, 1, 'man er forbi den nu');
});

test('forkert element koster et liv og nulstiller stimen', () => {
  const s = nyTur(7);
  const f = forhindring(7, 0);
  const forkert = RAEKKEFOELGE.find(el => el !== f.klares);
  const e = moed(s, 0, forkert);
  assert.equal(e.ramt.n, 0);
  assert.equal(e.klaret, null);
  assert.equal(s.liv, LIV - 1);
  assert.equal(s.stime, 0);
  assert.equal(s.loest[0], false);
  assert.equal(s.doed, false, 'ét fejltrin er ikke slut');
});

test('tre fejl og løbet er slut – med årsagen på', () => {
  const s = nyTur(7);
  let e = null;
  for (let i = 0; i < LIV; i++) {
    const f = forhindring(7, i);
    e = moed(s, i, RAEKKEFOELGE.find(el => el !== f.klares));
  }
  assert.equal(s.liv, 0);
  assert.equal(s.doed, true);
  assert.equal(e.slut, true);
  assert.equal(s.aarsag, forhindring(7, LIV - 1).slags);
});

test('når løbet er slut, sker der ikke mere', () => {
  const s = nyTur(7);
  s.doed = true; s.aarsag = 'krat';
  const foer = { x: s.x, t: s.t, klaret: s.klaret, liv: s.liv };
  const e = tik(s, 1, 'ild');
  assert.deepEqual({ x: s.x, t: s.t, klaret: s.klaret, liv: s.liv }, foer);
  assert.ok(!e.klaret && !e.ramt && !e.slut);
});

test('valget skifter elementet – og pjat ignoreres', () => {
  const s = nyTur(7);
  tik(s, 0.01, 'vand');
  assert.equal(s.element, 'vand');
  tik(s, 0.01, null);
  assert.equal(s.element, 'vand', 'null betyder bliv som du er');
  tik(s, 0.01, 'lava');
  assert.equal(s.element, 'vand', 'et ukendt element ignoreres');
});

test('samme frø, samme løb – tik er deterministisk', () => {
  const a = nyTur(42), b = nyTur(42);
  for (let i = 0; i < 60 * 30; i++) {
    const el = RAEKKEFOELGE[Math.floor(i / 120) % 4];
    tik(a, 1 / 60, el); tik(b, 1 / 60, el);
  }
  assert.deepEqual(
    { x: a.x, klaret: a.klaret, liv: a.liv, doed: a.doed },
    { x: b.x, klaret: b.klaret, liv: b.liv, doed: b.doed });
});

/* ---------- Balancen: kan det spilles? ---------- */

test('botten klarer banen – der er altid tid til at nå knappen', () => {
  for (const seed of SEEDS) {
    const s = koer(seed, 90);
    assert.equal(s.doed, false, `frø ${seed}: selv botten døde (efter ${s.klaret} klaret)`);
    assert.ok(s.klaret >= 30, `frø ${seed}: kun ${s.klaret} klaret på 90 sekunder`);
    assert.equal(s.liv, LIV, 'og uden at miste et liv');
  }
});

test('den der aldrig skifter element, taber hurtigt', () => {
  for (const seed of SEEDS) {
    const s = koer(seed, 120, () => 'jord');
    assert.equal(s.doed, true, `frø ${seed}: man skal ikke kunne stå stille i jord`);
    assert.ok(s.t < 60, `frø ${seed}: men det tog ${s.t.toFixed(0)} sekunder`);
    assert.ok(s.t > FRA_T, 'dog ikke før den første forhindring');
  }
});

test('en langsom finger taber til sidst – banen bliver for hurtig for den', () => {
  // En bot, der kun kigger op hvert 1,2 sekund, når det ikke, når mellemrummene
  // er nede omkring det halve – så slutter løbet af sig selv for den.
  for (const seed of SEEDS) {
    const s = koer(seed, 900, bot, 1 / 60, 1.2);
    assert.equal(s.doed, true, `frø ${seed}: den langsomme bot burde tabe til sidst`);
    assert.ok(s.klaret >= 10, `frø ${seed}: men først efter en pæn tur (${s.klaret} klaret)`);
  }
});
