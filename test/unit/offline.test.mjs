// Listen over det, der skal ligge på telefonen, så zydy.dk virker uden
// internet (public/offline-filer.json, genereret af scripts/byg-forside.mjs —
// Selmas ønske #56).
//
// Det, der kan gå galt her, opdager man ikke på skærmen: en fil, der ikke kom
// med i listen, mangler først, den dag ungen sidder i bilen uden net. Derfor
// tjekkes både at listen er kørt igennem generatoren, at alt i den findes, og
// at de to halvdele er delt rigtigt.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { læsKort, byggetForside, byggetOffline } from '../../scripts/byg-forside.mjs';

const rod = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const offentlig = path.join(rod, 'public');
const fil = path.join(offentlig, 'offline-filer.json');
const liste = JSON.parse(readFileSync(fil, 'utf8'));

/** '/spil/obby/' → public/spil/obby/index.html; '/ideer.js' → public/ideer.js */
const tilFil = url => path.join(offentlig, url.endsWith('/') ? url.slice(1) + 'index.html' : url.slice(1));

test('generatoren har været kørt: offline-filer.json er i sync', () => {
  const bygget = byggetOffline({ '/index.html': byggetForside(læsKort()) });
  assert.equal(bygget, readFileSync(fil, 'utf8'),
    'public/offline-filer.json er forældet — kør `node scripts/byg-forside.mjs`');
});

test('alt på listen findes rent faktisk', () => {
  for (const url of [...liste.skal, ...liste.spil]) {
    assert.match(url, /^\//, `${url}: skal være en absolut sti, som browseren kan bede om`);
    assert.ok(existsSync(tilFil(url)), `${url} står på listen, men filen findes ikke`);
  }
});

test('ingen fil står to gange, og de to halvdele overlapper ikke', () => {
  const alle = [...liste.skal, ...liste.spil];
  assert.equal(new Set(alle).size, alle.length, 'samme fil står flere gange på listen');
});

test('skallen er forsiden og de fælles scripts – og ikke et eneste spil', () => {
  assert.ok(liste.skal.includes('/'), 'forsiden selv skal være med i skallen');
  // De filer, alle spil låner. Ligger de ikke i skallen, kan et spil, man har
  // hentet, alligevel ikke starte uden net.
  for (const f of ['/spil/aktivitet.js', '/spil/highscore.js', '/spil/rum.js', '/offline.js', '/nyheder.json']) {
    assert.ok(liste.skal.includes(f), `${f} hører til skallen`);
  }
  for (const url of liste.skal) {
    assert.ok(!/^\/spil\/[^/]+\//.test(url), `${url} er et spil og skal ligge i "spil", ikke i skallen`);
  }
});

test('hvert spil med en index.html står i "spil"', () => {
  const mapper = readdirSync(path.join(offentlig, 'spil'))
    .filter(m => existsSync(path.join(offentlig, 'spil', m, 'index.html')));
  assert.ok(mapper.length >= 30, 'der skulle være mindst 30 spilmapper');
  for (const m of mapper) {
    assert.ok(liste.spil.includes(`/spil/${m}/`),
      `/spil/${m}/ mangler i listen — så kan spillet ikke spilles uden internet`);
  }
  // Spillets øvrige filer (motor.mjs, data.mjs …) skal med, ellers står man med
  // en side, der ikke kan starte.
  assert.ok(liste.spil.includes('/spil/dybet/motor.mjs'), 'spillenes egne moduler skal også med');
});

test('spillenes sider står som mappen, ikke som index.html', () => {
  // Browseren beder om /spil/obby/, og service workeren slår op på adressen.
  // Stod der /spil/obby/index.html, ville opslaget aldrig ramme.
  for (const url of [...liste.skal, ...liste.spil]) {
    assert.ok(!url.endsWith('/index.html'), `${url}: skal stå som mappen (uden index.html)`);
  }
});

test('versionen følger indholdet – ellers opdager telefonen aldrig, at der er nyt', () => {
  const kort = læsKort();
  const html = byggetForside(kort);
  const en = JSON.parse(byggetOffline({ '/index.html': html }));
  const to = JSON.parse(byggetOffline({ '/index.html': html }));
  assert.equal(en.version, to.version, 'samme indhold skal give samme version');

  const aendret = JSON.parse(byggetOffline({ '/index.html': html + '<!-- noget nyt -->' }));
  assert.notEqual(aendret.version, en.version, 'ændret indhold skal give en ny version');
  assert.deepEqual(aendret.skal, en.skal, 'men filerne er de samme');
});

test('listen peger ikke på API\'et – det må aldrig lægges på telefonen', () => {
  for (const url of [...liste.skal, ...liste.spil]) {
    assert.ok(!url.startsWith('/api/'), `${url}: toplister og venner skal hentes friskt hver gang`);
  }
});
