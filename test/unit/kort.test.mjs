// Kortene på forsiden: at hvert kort.json er brugbart, og at de genererede
// filer (public/index.html og src/spil-data.mjs) er kørt igennem generatoren,
// efter nogen har rettet et kort. Glemmer man det, er forsiden og Workeren
// uenige om, hvilke spil der findes — og det ville man først opdage live.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { læsKort, byggetForside, byggetData } from '../../scripts/byg-forside.mjs';
import { KORT, SPIL } from '../../src/spil-data.mjs';

const rod = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const kort = læsKort();

test('generatoren har været kørt: de genererede filer er i sync med kortene', () => {
  const besked = 'kør `node scripts/byg-forside.mjs`';
  assert.equal(byggetForside(kort), readFileSync(path.join(rod, 'public/index.html'), 'utf8'), `public/index.html er forældet — ${besked}`);
  assert.equal(byggetData(kort), readFileSync(path.join(rod, 'src/spil-data.mjs'), 'utf8'), `src/spil-data.mjs er forældet — ${besked}`);
});

test('hvert kort har det, forsiden skal bruge', () => {
  assert.ok(kort.length >= 14, 'der skulle være mindst 14 kort');
  for (const k of kort) {
    assert.match(k.id, /^[a-z0-9-]{1,32}$/, `${k.id}: id skal kunne stå i en URL og i data-spil`);
    assert.ok(k.navn.length && k.navn.length < 40, `${k.id}: navnet skal fylde noget, men ikke sprænge kortet`);
    assert.ok(k.beskrivelse.length > 20, `${k.id}: skriv en linje om hvad spillet går ud på`);
    assert.match(k.ikon, /^<svg[\s\S]*<\/svg>$/, `${k.id}/ikon.svg skal være ét <svg>-element`);
    assert.ok(typeof k.orden === 'number', `${k.id}: mangler "orden" (placering før popularitets-sorteringen)`);
  }
  assert.equal(new Set(kort.map(k => k.id)).size, kort.length, 'to kort med samme id');
  assert.equal(new Set(kort.map(k => k.orden)).size, kort.length, 'to kort med samme orden — så er rækkefølgen tilfældig');
});

test('spil her på sitet har en side at linke til; eksterne peger ud', () => {
  for (const k of kort) {
    if (k.ekstern) {
      assert.match(k.url, /^https:\/\//, `${k.id}: et eksternt kort skal have en absolut https-URL`);
    } else {
      assert.equal(k.url, `/spil/${k.id}/`, `${k.id}: et spil her på sitet skal ligge på /spil/<id>/`);
      assert.ok(existsSync(path.join(rod, 'public/spil', k.id, 'index.html')), `${k.id}: mangler index.html`);
    }
  }
});

test('toplisternes regler kommer med over i SPIL', () => {
  for (const k of kort) {
    if (!k.højscore) {
      assert.ok(!Object.keys(SPIL).some(n => n === k.id || n.startsWith(k.id + '-')), `${k.id} har ingen topliste i kort.json, men står i SPIL`);
      continue;
    }
    const flerTilstand = Object.values(k.højscore).every(v => v && typeof v === 'object');
    const nøgler = flerTilstand ? Object.keys(k.højscore).map(t => `${k.id}-${t}`) : [k.id];
    for (const n of nøgler) {
      assert.ok(SPIL[n], `${n} mangler i SPIL`);
      assert.ok(SPIL[n].maks > 0, `${n}: maks skal være et positivt tal`);
      if (SPIL[n].retning) assert.ok(['asc', 'desc'].includes(SPIL[n].retning), `${n}: retning skal være asc eller desc`);
    }
  }
});

test('KORT og forsidens markup viser de samme spil i samme rækkefølge', () => {
  const html = readFileSync(path.join(rod, 'public/index.html'), 'utf8');
  const iHtml = [...html.matchAll(/<li data-spil="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(iHtml, KORT.map(k => k.id));
  // /ideer.js hænger sine knapper på li[data-spil] og læser titlen i <h2>.
  for (const k of KORT) assert.match(html, new RegExp(`data-spil="${k.id}"[\\s\\S]{0,4000}?<h2>`), `${k.id}: kortet mangler et <h2>`);
});
