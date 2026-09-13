// Reglerne bag Ordle-stimen på forsiden (public/ordle-regler.mjs).
//
// Det, der kan gå galt, er datoerne: en stime skal holde natten over, men ikke
// en sprunget dag, og et dobbelttryk må ikke tælle to gange.
//
//   node --test test/unit/ordle.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TOM, STIME_MAKS, dagFor, dagenFoer, laes, skriv, stime, spoerg,
  besoeg, udskyd, klaret, stimeTekst, kvittering, skalSende,
} from '../../public/ordle-regler.mjs';
import { SPIL } from '../../src/spil-data.mjs';

test('datoen er den lokale, ikke UTC', () => {
  // 1. januar kl. 00:30 lokal tid er stadig den 1. — i UTC ville det være den 31.
  assert.equal(dagFor(new Date(2026, 0, 1, 0, 30)), '2026-01-01');
  assert.equal(dagFor(new Date(2026, 8, 13, 23, 59)), '2026-09-13');
});

test('dagen før klarer måneds-, års- og sommertidsskift', () => {
  assert.equal(dagenFoer('2026-09-13'), '2026-09-12');
  assert.equal(dagenFoer('2026-09-01'), '2026-08-31');
  assert.equal(dagenFoer('2026-01-01'), '2025-12-31');
  assert.equal(dagenFoer('2026-03-01'), '2026-02-28');
  assert.equal(dagenFoer('2026-10-26'), '2026-10-25');   // dagen efter sommertiden slutter
  assert.equal(dagenFoer('sludder'), '');
});

test('en tom eller ødelagt nøgle starter bare forfra', () => {
  assert.deepEqual(laes(''), TOM);
  assert.deepEqual(laes('{ikke json'), TOM);
  assert.deepEqual(laes('null'), TOM);
  assert.deepEqual(laes('[1,2,3]'), TOM);
  assert.deepEqual(laes(skriv({ klaret: 'i går', stime: 9 })), TOM, 'en dato der ikke er en dato tælles ikke');
  assert.deepEqual(laes(skriv({ klaret: '2026-09-13', stime: -4 })), { ...TOM, klaret: '2026-09-13' });
  assert.equal(laes(skriv({ klaret: '2026-09-13', stime: 99999 })).stime, STIME_MAKS, 'stimen klippes til maks');
  assert.deepEqual(laes(skriv({ klaret: '2026-09-13', stime: 4, besoegt: '2026-09-13', udskudt: '', sendt: 'sofie|4' })),
    { klaret: '2026-09-13', stime: 4, besoegt: '2026-09-13', udskudt: '', sendt: 'sofie|4' });
});

test('stimen holder natten over, men ikke en sprunget dag', () => {
  const s = { ...TOM, klaret: '2026-09-12', stime: 4 };
  assert.equal(stime(s, '2026-09-12'), 4, 'klaret i dag');
  assert.equal(stime(s, '2026-09-13'), 4, 'klaret i går – stimen er stadig i live');
  assert.equal(stime(s, '2026-09-14'), 0, 'en dag sprunget over – stimen er brudt');
  assert.equal(stime(TOM, '2026-09-13'), 0);
});

test('et ja lægger en dag til – eller starter en ny stime', () => {
  const start = { ...TOM, klaret: '2026-09-12', stime: 4 };

  const dag2 = klaret(start, '2026-09-13');
  assert.equal(dag2.stime, 5);
  assert.equal(dag2.ny, true);
  assert.equal(dag2.tilstand.klaret, '2026-09-13');

  const igen = klaret(dag2.tilstand, '2026-09-13');
  assert.equal(igen.ny, false, 'to tryk samme dag tæller kun én gang');
  assert.equal(igen.stime, 5);

  const efterPause = klaret(start, '2026-09-15');
  assert.equal(efterPause.stime, 1, 'en sprunget dag begynder forfra på 1');

  const foerste = klaret(TOM, '2026-09-13');
  assert.equal(foerste.stime, 1);

  assert.equal(klaret({ ...TOM, klaret: '2026-09-12', stime: STIME_MAKS }, '2026-09-13').stime, STIME_MAKS,
    'stimen vokser ikke ud over maks');
});

test('der spørges kun, når der er noget at spørge om', () => {
  assert.equal(spoerg(TOM, '2026-09-13'), false, 'en der aldrig har rørt Ordle, bliver ikke spurgt');
  assert.equal(spoerg(besoeg(TOM, '2026-09-13'), '2026-09-13'), true, 'har man trykket på kortet i dag, spørger vi');
  assert.equal(spoerg(besoeg(TOM, '2026-09-12'), '2026-09-13'), false, 'et besøg i går er ikke nok i dag');

  const iGang = { ...TOM, klaret: '2026-09-12', stime: 4 };
  assert.equal(spoerg(iGang, '2026-09-13'), true, 'en stime i gang må gerne mindes om');
  assert.equal(spoerg(iGang, '2026-09-15'), false, 'en brudt stime nager ikke videre');

  const sagtJa = klaret(iGang, '2026-09-13').tilstand;
  assert.equal(spoerg(sagtJa, '2026-09-13'), false, 'der spørges ikke igen samme dag');
  assert.equal(spoerg(sagtJa, '2026-09-14'), true, 'men igen i morgen');

  const senere = udskyd(iGang, '2026-09-13');
  assert.equal(spoerg(senere, '2026-09-13'), false, '«Ikke endnu» gælder resten af dagen');
  assert.equal(stime(senere, '2026-09-13'), 4, '«Ikke endnu» rører ikke stimen');
  assert.equal(spoerg(senere, '2026-09-14'), false, 'kom man aldrig tilbage, er stimen brudt – så tier vi');

  // Udskydelsen gælder kun den dag, den blev trykket: dagen efter spørger vi igen,
  // så længe der er en stime at redde.
  const iMorgen = udskyd(sagtJa, '2026-09-13');
  assert.equal(spoerg(iMorgen, '2026-09-14'), true, 'i morgen spørger vi igen');
});

test('en stime sendes én gang – men igen hvis den vokser eller navnet skifter', () => {
  const s = { ...TOM, klaret: '2026-09-13', stime: 4 };
  assert.equal(skalSende(s, '', 4), false, 'uden navn kan den ikke stå på listen');
  assert.equal(skalSende(s, 'Sofie', 0), false, 'nul dage er ingen score');
  assert.equal(skalSende(s, 'Sofie', 4), true);

  const sendt = { ...s, sendt: kvittering('Sofie', 4) };
  assert.equal(skalSende(sendt, 'Sofie', 4), false, 'den er allerede kommet frem');
  assert.equal(skalSende(sendt, 'sofie', 4), false, 'store og små bogstaver er samme spiller');
  assert.equal(skalSende(sendt, 'Sofie', 5), true, 'en dag mere skal sendes');
  assert.equal(skalSende(sendt, 'Selma', 4), true, 'et nyt navn på iPad\'en skal med på listen');
});

test('stimen står i flertal, når der er mere end én dag', () => {
  assert.equal(stimeTekst(1), '1 dag i træk');
  assert.equal(stimeTekst(4), '4 dage i træk');
});

test('toplisten for ordle findes, og maks passer med reglerne', () => {
  assert.ok(SPIL.ordle, 'ordle mangler i SPIL – kør node scripts/byg-forside.mjs');
  assert.equal(SPIL.ordle.maks, STIME_MAKS, 'kort.json og ordle-regler.mjs skal være enige om maks');
  assert.ok(!SPIL.ordle.retning, 'flest dage i træk vinder (desc)');
});
