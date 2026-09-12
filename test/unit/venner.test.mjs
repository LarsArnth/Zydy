// Enhedstest af venne-API'et i src/venner.mjs – uden database og uden Cloudflare.
// Kør:  node --test test/unit/venner.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { haandterVenner, rensPar, sorterRaekker, noegle, VENNER_MAKS } from '../../src/venner.mjs';
import { huskVenner, huskLager, huskAktivitet } from '../api-mock.mjs';

const BASE = 'https://zydy.dk';
const get = navn => new Request(BASE + '/api/venner?navn=' + encodeURIComponent(navn));
const post = krop => new Request(BASE + '/api/venner', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: typeof krop === 'string' ? krop : JSON.stringify(krop),
});

/** Et lager med de navne, der er sat rekorder under, og dem der er her nu. */
function lagerMed({ scores = [], aktive = [] } = {}) {
  const hs = huskLager(scores);
  const akt = huskAktivitet();
  aktive.forEach((navn, i) => akt.markerAktiv('klient' + i, 'taarn', 1000 + i, navn));
  return huskVenner(hs, akt);
}

const svarPaa = async (req, lager) => (await haandterVenner(req, lager)).json();

/* ---------- Rensning ---------- */

test('rensPar renser begge navne og afviser det umulige', () => {
  assert.deepEqual(rensPar('  Sofie ', 'Selma'), { mig: 'Sofie', dig: 'Selma' });
  assert.match(rensPar('', 'Selma').fejl, /dit navn/i);
  assert.match(rensPar('Sofie', '   ').fejl, /hvem/i);
  assert.match(rensPar('Sofie', 'sofie').fejl, /dig selv/i, 'man kan ikke være ven med sig selv');
  assert.equal(noegle('SoFiE'), 'sofie');
  assert.equal(noegle('SØREN'), 'søren', 'danske bogstaver skal også kunne skrives med små');
});

test('sorterRaekker deler op i venner, dem der har spurgt mig, og dem jeg har spurgt', () => {
  const raekker = [
    { fra: 'sofie', til: 'selma', fraNavn: 'Sofie', tilNavn: 'Selma', svaret: '2026-01-01' },
    { fra: 'far', til: 'sofie', fraNavn: 'Far', tilNavn: 'Sofie', svaret: null },
    { fra: 'sofie', til: 'simon', fraNavn: 'Sofie', tilNavn: 'Simon', svaret: null },
  ];
  assert.deepEqual(sorterRaekker(raekker, 'sofie'), {
    venner: [{ navn: 'Selma' }],
    venter: [{ navn: 'Far' }],
    sendt: [{ navn: 'Simon' }],
  });
});

/* ---------- At blive venner ---------- */

test('først spørger man, så siger den anden ja – og så er man venner begge veje', async () => {
  const lager = lagerMed();

  const spurgt = await svarPaa(post({ navn: 'Sofie', ven: 'Selma' }), lager);
  assert.equal(spurgt.status, 'sendt');
  assert.deepEqual(spurgt.sendt, [{ navn: 'Selma' }]);
  assert.deepEqual(spurgt.venner, [], 'man er ikke venner, før den anden har sagt ja');

  const selma = await svarPaa(get('Selma'), lager);
  assert.deepEqual(selma.venter, [{ navn: 'Sofie' }], 'Selma kan se spørgsmålet');
  assert.deepEqual(selma.venner, []);

  const ja = await svarPaa(post({ navn: 'Selma', ven: 'Sofie', handling: 'ja' }), lager);
  assert.equal(ja.status, 'venner');
  assert.deepEqual(ja.venner, [{ navn: 'Sofie' }]);
  assert.deepEqual(ja.venter, []);

  assert.deepEqual((await svarPaa(get('Sofie'), lager)).venner, [{ navn: 'Selma' }],
    'venskabet gælder også den anden vej');
});

test('spørger man en, der allerede har spurgt en selv, bliver man venner med det samme', async () => {
  const lager = lagerMed();
  await svarPaa(post({ navn: 'Selma', ven: 'Sofie' }), lager);
  const svar = await svarPaa(post({ navn: 'Sofie', ven: 'Selma' }), lager);
  assert.equal(svar.status, 'venner');
  assert.deepEqual(svar.venner, [{ navn: 'Selma' }]);
  assert.equal(lager.rows.length, 1, 'der laves ikke to rækker for det samme par');
});

test('store og små bogstaver er den samme person, og navnet vises som det blev skrevet', async () => {
  const lager = lagerMed();
  await svarPaa(post({ navn: 'sofie', ven: 'SELMA' }), lager);
  const svar = await svarPaa(post({ navn: 'Selma', ven: 'Sofie', handling: 'ja' }), lager);
  assert.deepEqual(svar.venner, [{ navn: 'sofie' }]);
  assert.deepEqual((await svarPaa(get('SoFiE'), lager)).venner, [{ navn: 'Selma' }],
    'ja\'et retter samtidig navnet til den stavemåde, personen selv bruger');
});

test('at spørge to gange ændrer ingenting', async () => {
  const lager = lagerMed();
  await svarPaa(post({ navn: 'Sofie', ven: 'Selma' }), lager);
  const igen = await svarPaa(post({ navn: 'Sofie', ven: 'Selma' }), lager);
  assert.equal(igen.status, 'sendt');
  assert.equal(lager.rows.length, 1);
});

test('man kan sige nej tak – og spørge igen bagefter', async () => {
  const lager = lagerMed();
  await svarPaa(post({ navn: 'Sofie', ven: 'Selma' }), lager);
  const nej = await svarPaa(post({ navn: 'Selma', ven: 'Sofie', handling: 'nej' }), lager);
  assert.equal(nej.status, 'væk');
  assert.equal(lager.rows.length, 0);
  assert.deepEqual((await svarPaa(get('Sofie'), lager)).sendt, [], 'spørgsmålet er væk igen');

  await svarPaa(post({ navn: 'Sofie', ven: 'Selma' }), lager);
  assert.equal(lager.rows.length, 1, 'man må gerne spørge en anden dag');
});

test('en ven kan fjernes igen, og så er begge fri', async () => {
  const lager = lagerMed();
  await svarPaa(post({ navn: 'Sofie', ven: 'Selma' }), lager);
  await svarPaa(post({ navn: 'Selma', ven: 'Sofie', handling: 'ja' }), lager);
  await svarPaa(post({ navn: 'Sofie', ven: 'Selma', handling: 'nej' }), lager);
  assert.deepEqual((await svarPaa(get('Selma'), lager)).venner, []);
  assert.deepEqual((await svarPaa(get('Sofie'), lager)).venner, []);
});

test('man kan ikke sige ja til en, der ikke har spurgt', async () => {
  const lager = lagerMed();
  const svar = await haandterVenner(post({ navn: 'Sofie', ven: 'Selma', handling: 'ja' }), lager);
  assert.equal(svar.status, 400);
  assert.match((await svar.json()).fejl, /har ikke spurgt/);
  assert.equal(lager.rows.length, 0);
});

/* ---------- Forslag til nye venner ---------- */

test('forslagene er navne, vi har set på siden – uden mig selv og dem jeg kender', async () => {
  const lager = lagerMed({
    scores: [{ spil: 'taarn', navn: 'Sofie', score: 10 }, { spil: 'taarn', navn: 'Simon', score: 20 }],
    aktive: ['Selma', 'Far'],
  });
  const svar = await svarPaa(get('Sofie'), lager);
  assert.ok(!svar.kendte.includes('Sofie'), 'man foreslås ikke sig selv');
  assert.deepEqual(svar.kendte.slice().sort(), ['Far', 'Selma', 'Simon']);

  await svarPaa(post({ navn: 'Sofie', ven: 'Selma' }), lager);
  assert.ok(!(await svarPaa(get('Sofie'), lager)).kendte.includes('Selma'),
    'en vi allerede har spurgt, foreslås ikke igen');
});

test('det samme navn foreslås kun én gang, uanset hvor mange rekorder det har', async () => {
  const lager = lagerMed({
    scores: [{ spil: 'taarn', navn: 'Selma', score: 10 }, { spil: 'dybet', navn: 'selma', score: 3 }],
    aktive: ['Selma'],
  });
  assert.deepEqual((await svarPaa(get('Sofie'), lager)).kendte, ['Selma']);
});

/* ---------- Grænser og fejl ---------- */

test('GET uden navn og forkerte metoder afvises pænt', async () => {
  const lager = lagerMed();
  assert.equal((await haandterVenner(new Request(BASE + '/api/venner'), lager)).status, 400);
  assert.equal((await haandterVenner(new Request(BASE + '/api/venner', { method: 'PUT' }), lager)).status, 405);
  assert.equal(await haandterVenner(new Request(BASE + '/api/andet'), lager), null, 'andre stier er ikke vores');
  assert.equal((await haandterVenner(post('ikke json'), lager)).status, 400);
});

test('ingen kan samle mere end VENNER_MAKS rækker', async () => {
  const lager = lagerMed();
  for (let i = 0; i < VENNER_MAKS; i++) await svarPaa(post({ navn: 'Sofie', ven: 'Ven' + i }), lager);
  const svar = await haandterVenner(post({ navn: 'Sofie', ven: 'Endnu en' }), lager);
  assert.equal(svar.status, 400);
  assert.match((await svar.json()).fejl, /rigeligt/);

  // Og den anden vej: en der selv er fuld, kan man heller ikke spørge.
  const svar2 = await haandterVenner(post({ navn: 'Selma', ven: 'Sofie' }), lager);
  assert.equal(svar2.status, 400);
  assert.match((await svar2.json()).fejl, /Sofie har rigeligt/);
});
