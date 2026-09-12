// public/nyheder.json — listen bag «Nyt på Zydy» på forsiden.
//
// Testen holder filen i orden, så en ny linje ikke går ubemærket galt: numrene
// er det, browseren husker som «sidst sete version», så de skal være unikke og
// stå i faldende rækkefølge, og et spilnavn skal være et spil, der findes.
//
//   node --test test/unit/nyheder.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { KORT } from '../../src/spil-data.mjs';

const rod = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const data = JSON.parse(readFileSync(path.join(rod, 'public', 'nyheder.json'), 'utf8'));
const nyheder = data.nyheder;

test('filen er en liste med nyeste først', () => {
  assert.ok(Array.isArray(nyheder) && nyheder.length > 0, 'der er nyheder i filen');
  for (let i = 1; i < nyheder.length; i++) {
    assert.ok(nyheder[i - 1].nr > nyheder[i].nr,
      `nr skal falde ned gennem filen (nr ${nyheder[i - 1].nr} står over nr ${nyheder[i].nr})`);
    assert.ok(nyheder[i - 1].dato >= nyheder[i].dato,
      `datoen skal også falde (${nyheder[i - 1].dato} står over ${nyheder[i].dato})`);
  }
});

test('hver nyhed har det, listen skal vise', () => {
  const ider = new Set(KORT.map(k => k.id));
  for (const n of nyheder) {
    const hvem = 'nr ' + n.nr;
    assert.ok(Number.isInteger(n.nr) && n.nr > 0, `${hvem}: nr er et helt tal over 0`);
    assert.match(n.dato, /^\d{4}-\d{2}-\d{2}$/, `${hvem}: dato skrives som 2026-09-12`);
    const [aar, maaned, dag] = n.dato.split('-').map(Number);
    const d = new Date(Date.UTC(aar, maaned - 1, dag));
    assert.equal(d.toISOString().slice(0, 10), n.dato, `${hvem}: datoen findes rigtigt`);
    assert.ok(n.titel && n.titel.length <= 60, `${hvem}: titlen er kort nok til en telefon`);
    assert.ok(n.hvad && n.hvad.length >= 20, `${hvem}: forklar hvad der blev lavet`);
    assert.ok(n.oensket, `${hvem}: skriv hvem der har ønsket sig det`);
    assert.ok(n.spil === '' || ider.has(n.spil),
      `${hvem}: '${n.spil}' er ikke et spil på forsiden (brug '' hvis det er hele siden)`);
  }
});

test('numrene er unikke', () => {
  const numre = nyheder.map(n => n.nr);
  assert.equal(new Set(numre).size, numre.length, 'to nyheder må ikke have samme nr');
});
