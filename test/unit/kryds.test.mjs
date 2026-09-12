// Enhedstests for Kryds og bolles motor:  node --test test/unit/kryds.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LINJER, nytBraet, vinder, resultat, ledige, fuldt, modstander,
  straksVinder, bedsteTraekAlle, bedsteTraek, NIVEAUER } from '../../public/spil/kryds/motor.mjs';

const braet = s => s.split('').map(c => (c === '.' ? '' : c));

test('vinder finder tre på stribe – og ikke andet', () => {
  assert.equal(vinder(nytBraet()), null);
  assert.deepEqual(vinder(braet('xxx.o.o..')), { spiller: 'x', linje: [0, 1, 2] });
  assert.deepEqual(vinder(braet('x.ox.ox..')), { spiller: 'x', linje: [0, 3, 6] });
  assert.deepEqual(vinder(braet('o.x.o.x.o')), { spiller: 'o', linje: [0, 4, 8] });
  assert.equal(vinder(braet('xoxxoxoxo')), null, 'fuldt bræt uden stribe');
  assert.equal(LINJER.length, 8);
});

test('resultat, ledige og fuldt', () => {
  assert.equal(resultat(braet('.........')), null);
  assert.equal(resultat(braet('xoxxoxoxo')), 'lige');
  assert.equal(resultat(braet('ooo.x.x..')), 'o');
  assert.deepEqual(ledige(braet('xo.......')), [2, 3, 4, 5, 6, 7, 8]);
  assert.equal(fuldt(braet('xoxxoxoxo')), true);
  assert.equal(modstander('x'), 'o');
});

test('straksVinder finder de felter der afgør partiet', () => {
  assert.deepEqual(straksVinder(braet('xx.oo....'), 'x'), [2]);
  assert.deepEqual(straksVinder(braet('xx.oo....'), 'o'), [5]);
  assert.deepEqual(straksVinder(braet('x...x...o'), 'x'), [], 'diagonalen er lukket af modstanderen');
});

test('alle niveauer tager en sejr der ligger lige for', () => {
  for (const niveau of NIVEAUER) {
    for (let i = 0; i < 50; i++) {
      assert.equal(bedsteTraek(braet('oo.xx....'), 'o', niveau), 2, `${niveau} vinder med det samme`);
    }
  }
});

test('mellem og svær blokerer en trussel', () => {
  for (const niveau of ['mellem', 'svaer']) {
    for (let i = 0; i < 50; i++) {
      assert.equal(bedsteTraek(braet('xx....o..'), 'o', niveau), 2, `${niveau} blokerer`);
    }
  }
});

test('svær åbner i et hjørne eller midten og tager midten som svar', () => {
  assert.deepEqual(bedsteTraekAlle(nytBraet(), 'x').sort((a, b) => a - b), [0, 1, 2, 3, 4, 5, 6, 7, 8],
    'et tomt bræt er uafgjort uanset åbningstræk');
  assert.deepEqual(bedsteTraekAlle(braet('x........'), 'o'), [4], 'midten er eneste redning mod et hjørne');
});

/* Den vigtigste egenskab: Svær kan ikke slås. Vi gennemspiller alle partier,
   hvor modstanderen prøver hvert eneste lovlige træk, og computeren svarer
   deterministisk (første af de bedste træk). */
function foersteBedste(b, spiller) { return bedsteTraekAlle(b, spiller)[0]; }

function spilAlle(b, tur, computer, set) {
  const r = resultat(b);
  if (r) { set.add(r); return; }
  if (tur === computer) {
    const i = foersteBedste(b, computer);
    b[i] = computer;
    spilAlle(b, modstander(tur), computer, set);
    b[i] = '';
    return;
  }
  for (const i of ledige(b)) {
    b[i] = tur;
    spilAlle(b, modstander(tur), computer, set);
    b[i] = '';
  }
}

test('svær taber aldrig – hverken som første eller anden spiller', () => {
  for (const computer of ['x', 'o']) {
    const set = new Set();
    spilAlle(nytBraet(), 'x', computer, set);
    assert.ok(!set.has(modstander(computer)), `computeren (${computer}) taber aldrig`);
    assert.ok(set.has(computer), `computeren (${computer}) vinder, når modstanderen fejler`);
  }
});

test('nem er til at slå, mellem er sværere, svær er uslåelig', () => {
  // Modstanderen spiller perfekt (som "svær") mod hvert niveau; tælles over mange partier
  // med en fast, seedet terning, så testen er deterministisk.
  const rng = (() => { let a = 12345; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; })();
  const tab = {};
  for (const niveau of NIVEAUER) {
    let tabte = 0;
    for (let parti = 0; parti < 60; parti++) {
      const b = nytBraet();
      let tur = parti % 2 ? 'x' : 'o';             // skiftevis hvem der starter
      while (!resultat(b)) {
        const i = tur === 'o' ? bedsteTraek(b, 'o', niveau, rng) : bedsteTraek(b, 'x', 'svaer', rng);
        b[i] = tur;
        tur = modstander(tur);
      }
      if (resultat(b) === 'x') tabte++;
    }
    tab[niveau] = tabte;
  }
  assert.equal(tab.svaer, 0, 'svær taber aldrig mod perfekt spil');
  assert.ok(tab.nem > tab.mellem, `nem (${tab.nem}) taber oftere end mellem (${tab.mellem})`);
  assert.ok(tab.mellem > 0, 'mellem kan slås');
});
