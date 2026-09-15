// Enhedstest af gruppe-API'et i src/grupper.mjs – uden database og uden Cloudflare.
// Kør:  node --test test/unit/grupper.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  haandterGrupper, rensGruppeNavn, gruppeSamtale,
  GRUPPE_NAVN_MAKS, GRUPPER_MAKS, MEDLEM_MAKS,
} from '../../src/grupper.mjs';
import { haandterBeskeder, SPAM_MAKS } from '../../src/beskeder.mjs';
import { huskBeskeder, huskGrupper, huskVenner } from '../api-mock.mjs';

const BASE = 'https://zydy.dk';
const NU = Date.UTC(2026, 8, 15, 12, 0, 0);

const get = q => new Request(BASE + '/api/grupper?' + new URLSearchParams(q));
const post = krop => new Request(BASE + '/api/grupper', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: typeof krop === 'string' ? krop : JSON.stringify(krop),
});

/** Tre lagre, hvor de par, der nævnes, er venner i forvejen. */
function lagre(...par) {
  const venner = huskVenner(null, null);
  const beskeder = huskBeskeder();
  const grupper = huskGrupper();
  for (const [a, b] of par) {
    venner.rows.push({ fra: a.toLowerCase(), til: b.toLowerCase(), fraNavn: a, tilNavn: b, svaret: '2026-01-01' });
  }
  return { venner, beskeder, grupper };
}

const kald = (req, l, nu = NU) => haandterGrupper(req, l.grupper, l.beskeder, l.venner, nu);
const svarPaa = async (req, l, nu = NU) => (await kald(req, l, nu)).json();

/** Laver en gruppe og giver dens kode. */
async function lav(l, navn, gruppe, nu = NU) {
  return (await svarPaa(post({ navn, handling: 'lav', gruppe }), l, nu)).kode;
}
const tilfoej = (l, navn, kode, ven) => svarPaa(post({ navn, kode, handling: 'tilfoej', ven }), l);
const skriv = (l, navn, kode, tekst, nu = NU) => svarPaa(post({ navn, kode, tekst }), l, nu);
const mine = (l, navn, set) => svarPaa(get(set ? { navn, set } : { navn }), l);

/* ---------- Navnet ---------- */

test('rensGruppeNavn samler mellemrum og klipper de lange af', () => {
  assert.equal(rensGruppeNavn('  Familien   Arnth '), 'Familien Arnth');
  assert.equal(rensGruppeNavn('   '), null);
  assert.equal(rensGruppeNavn(7), null);
  assert.equal(Array.from(rensGruppeNavn('g'.repeat(80))).length, GRUPPE_NAVN_MAKS);
  assert.equal(rensGruppeNavn('Fodbold ⚽'), 'Fodbold ⚽', 'emoji må man godt');
});

/* ---------- Lav en gruppe og tag venner med ---------- */

test('man laver en gruppe, er selv med, og kan tage sine venner med ind', async () => {
  const l = lagre(['Sofie', 'Selma'], ['Sofie', 'Far']);
  const kode = await lav(l, 'Sofie', 'Familien');
  assert.match(kode, /^[A-Z2-9]{5}$/, 'koden er en rumkode, som et barn kan skrive af');

  const efterLav = await mine(l, 'Sofie');
  assert.equal(efterLav.grupper.length, 1);
  assert.deepEqual(efterLav.grupper[0].medlemmer, [{ navn: 'Sofie', mig: true }]);
  assert.equal(efterLav.grupper[0].jegLavede, true);
  assert.equal(efterLav.grupper[0].lavetAf, 'Sofie');

  await tilfoej(l, 'Sofie', kode, 'Selma');
  await tilfoej(l, 'Sofie', kode, 'Far');
  const g = (await mine(l, 'Sofie')).grupper[0];
  assert.deepEqual(g.medlemmer.map(m => m.navn), ['Sofie', 'Selma', 'Far'], 'i den rækkefølge de kom ind');

  // Og de andre kan se gruppen fra deres side.
  const hosSelma = (await mine(l, 'Selma')).grupper[0];
  assert.equal(hosSelma.kode, kode);
  assert.equal(hosSelma.jegLavede, false);
  assert.deepEqual(hosSelma.medlemmer.find(m => m.mig), { navn: 'Selma', mig: true });
});

test('vennens egen stavemåde bruges, også når man selv skriver navnet anderledes', async () => {
  const l = lagre(['Sofie', 'Selma']);
  const kode = await lav(l, 'Sofie', 'Familien');
  await tilfoej(l, 'Sofie', kode, 'SELMA');
  assert.deepEqual((await mine(l, 'Sofie')).grupper[0].medlemmer.map(m => m.navn), ['Sofie', 'Selma']);
});

test('man kan kun tage sine egne venner med ind i en gruppe', async () => {
  const l = lagre(['Sofie', 'Selma']);
  const kode = await lav(l, 'Sofie', 'Familien');

  const fremmed = await kald(post({ navn: 'Sofie', kode, handling: 'tilfoej', ven: 'Oliver' }), l);
  assert.equal(fremmed.status, 400);
  assert.match((await fremmed.json()).fejl, /ikke venner/);

  // Et ubesvaret spørgsmål er ikke nok.
  l.venner.rows.push({ fra: 'sofie', til: 'timo', fraNavn: 'Sofie', tilNavn: 'Timo', svaret: null });
  assert.equal((await kald(post({ navn: 'Sofie', kode, handling: 'tilfoej', ven: 'Timo' }), l)).status, 400);
  assert.equal((await mine(l, 'Sofie')).grupper[0].medlemmer.length, 1);
});

test('kun dem, der er med, kan læse og skrive i gruppen', async () => {
  const l = lagre(['Sofie', 'Selma'], ['Sofie', 'Oliver']);
  const kode = await lav(l, 'Sofie', 'Familien');
  await tilfoej(l, 'Sofie', kode, 'Selma');

  assert.equal((await kald(get({ navn: 'Oliver', kode }), l)).status, 403, 'Oliver er ikke med');
  assert.equal((await kald(post({ navn: 'Oliver', kode, tekst: 'hallo?' }), l)).status, 403);
  assert.equal((await mine(l, 'Oliver')).grupper.length, 0);
  assert.equal((await kald(get({ navn: 'Selma', kode }), l)).status, 200);
});

test('en ukendt kode giver ikke noget at vide', async () => {
  const l = lagre(['Sofie', 'Selma']);
  assert.equal((await kald(get({ navn: 'Sofie', kode: 'ZZZZZ' }), l)).status, 404);
  assert.equal((await kald(get({ navn: 'Sofie', kode: 'pjat' }), l)).status, 400);
});

/* ---------- At skrive sammen ---------- */

test('alle i gruppen ser den samme snak, og ved hvem der skrev hvad', async () => {
  const l = lagre(['Sofie', 'Selma'], ['Sofie', 'Far']);
  const kode = await lav(l, 'Sofie', 'Familien');
  await tilfoej(l, 'Sofie', kode, 'Selma');
  await tilfoej(l, 'Sofie', kode, 'Far');

  await skriv(l, 'Sofie', kode, 'Skal vi spille Obby?');
  await skriv(l, 'Selma', kode, 'Ja!', NU + 1000);

  const hosFar = await svarPaa(get({ navn: 'Far', kode }), l);
  assert.deepEqual(hosFar.beskeder.map(b => [b.navn, b.tekst, b.mig]),
    [['Sofie', 'Skal vi spille Obby?', false], ['Selma', 'Ja!', false]]);
  assert.equal(hosFar.gruppe.navn, 'Familien');

  const hosSelma = await svarPaa(get({ navn: 'Selma', kode }), l);
  assert.deepEqual(hosSelma.beskeder.map(b => b.mig), [false, true], 'sin egen besked står som ens egen');
});

test('gruppen tæller det, jeg ikke har læst – og aldrig mine egne beskeder', async () => {
  const l = lagre(['Sofie', 'Selma']);
  const kode = await lav(l, 'Sofie', 'Familien');
  await tilfoej(l, 'Sofie', kode, 'Selma');
  await skriv(l, 'Sofie', kode, 'hej alle sammen');
  await skriv(l, 'Sofie', kode, 'er I der?', NU + 1000);

  const hosSelma = await mine(l, 'Selma');
  assert.equal(hosSelma.nye, 2);
  assert.equal(hosSelma.grupper[0].nye, 2);
  assert.equal(hosSelma.grupper[0].sidst.tekst, 'er I der?');

  assert.equal((await mine(l, 'Sofie')).nye, 0, 'mine egne er ikke nye for mig selv');

  // Selma har læst den første.
  const foerste = (await svarPaa(get({ navn: 'Selma', kode }), l)).beskeder[0].id;
  const efter = await mine(l, 'Selma', kode.toLowerCase() + ':' + foerste);
  assert.equal(efter.grupper[0].nye, 1);
});

test('den gruppe, der er snakket i sidst, står øverst', async () => {
  const l = lagre(['Sofie', 'Selma']);
  const en = await lav(l, 'Sofie', 'Aftensmad');
  const to = await lav(l, 'Sofie', 'Fodbold');
  await skriv(l, 'Sofie', en, 'hej');
  assert.deepEqual((await mine(l, 'Sofie')).grupper.map(g => g.navn), ['Aftensmad', 'Fodbold']);
  await skriv(l, 'Sofie', to, 'kamp i morgen', NU + 1000);
  assert.deepEqual((await mine(l, 'Sofie')).grupper.map(g => g.navn), ['Fodbold', 'Aftensmad']);
});

test('gruppesnak blander sig ikke med de to-og-to-samtaler', async () => {
  const l = lagre(['Sofie', 'Selma']);
  const kode = await lav(l, 'Sofie', 'Familien');
  await tilfoej(l, 'Sofie', kode, 'Selma');
  await skriv(l, 'Sofie', kode, 'hej gruppe');

  const beskedSvar = await haandterBeskeder(new Request(BASE + '/api/beskeder?navn=Selma'), l.beskeder, l.venner, NU);
  const oversigt = await beskedSvar.json();
  assert.deepEqual(oversigt.samtaler, [], 'gruppen står ikke som en «ven» i beskedoversigten');
  assert.equal(oversigt.nye, 0);

  // Og den anden vej: en almindelig besked står ikke i gruppen.
  await haandterBeskeder(new Request(BASE + '/api/beskeder', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ navn: 'Selma', ven: 'Sofie', tekst: 'kun til dig' }),
  }), l.beskeder, l.venner, NU);
  assert.deepEqual((await svarPaa(get({ navn: 'Sofie', kode }), l)).beskeder.map(b => b.tekst), ['hej gruppe']);
});

test('spam-grænsen er pr. person og deles med de almindelige beskeder', async () => {
  const l = lagre(['Sofie', 'Selma']);
  const kode = await lav(l, 'Sofie', 'Familien');
  for (let i = 0; i < SPAM_MAKS; i++) await skriv(l, 'Sofie', kode, 'spam ' + i);
  const nej = await kald(post({ navn: 'Sofie', kode, tekst: 'en til' }), l);
  assert.equal(nej.status, 429);

  const tilSelma = await haandterBeskeder(new Request(BASE + '/api/beskeder', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ navn: 'Sofie', ven: 'Selma', tekst: 'og en til dig' }),
  }), l.beskeder, l.venner, NU);
  assert.equal(tilSelma.status, 429, 'den samme grænse gælder, uanset hvor beskeden skal hen');
});

test('tomme beskeder afvises', async () => {
  const l = lagre(['Sofie', 'Selma']);
  const kode = await lav(l, 'Sofie', 'Familien');
  const tom = await kald(post({ navn: 'Sofie', kode, tekst: '   ' }), l);
  assert.equal(tom.status, 400);
  assert.match((await tom.json()).fejl, /Skriv noget/);
});

/* ---------- Ud og ind igen ---------- */

test('man kan altid gå selv, og den sidste slukker lyset', async () => {
  const l = lagre(['Sofie', 'Selma']);
  const kode = await lav(l, 'Sofie', 'Familien');
  await tilfoej(l, 'Sofie', kode, 'Selma');
  await skriv(l, 'Sofie', kode, 'hej');

  const ude = await svarPaa(post({ navn: 'Selma', kode, handling: 'gaa' }), l);
  assert.equal(ude.grupper.length, 0, 'Selma er ude');
  assert.equal((await mine(l, 'Sofie')).grupper[0].medlemmer.length, 1);
  assert.equal(l.beskeder.rows.length, 1, 'snakken står stadig hos dem, der er tilbage');

  await svarPaa(post({ navn: 'Sofie', kode, handling: 'gaa' }), l);
  assert.equal(l.grupper.rows.length, 0, 'gruppen er væk, da den sidste gik');
  assert.equal(l.beskeder.rows.length, 0, 'og snakken fulgte med ud');
});

test('kun den, der lavede gruppen, kan tage andre ud eller give den nyt navn', async () => {
  const l = lagre(['Sofie', 'Selma'], ['Sofie', 'Far']);
  const kode = await lav(l, 'Sofie', 'Familien');
  await tilfoej(l, 'Sofie', kode, 'Selma');
  await tilfoej(l, 'Sofie', kode, 'Far');

  const nej = await kald(post({ navn: 'Selma', kode, handling: 'fjern', ven: 'Far' }), l);
  assert.equal(nej.status, 403);
  assert.match((await nej.json()).fejl, /Kun Sofie/);
  assert.equal((await kald(post({ navn: 'Selma', kode, handling: 'omdoeb', gruppe: 'Selmas gruppe' }), l)).status, 403);

  // Men Selma kan gå selv – også gennem «fjern» med sit eget navn.
  await svarPaa(post({ navn: 'Selma', kode, handling: 'fjern', ven: 'Selma' }), l);
  assert.equal((await mine(l, 'Sofie')).grupper[0].medlemmer.length, 2);

  await svarPaa(post({ navn: 'Sofie', kode, handling: 'fjern', ven: 'Far' }), l);
  await svarPaa(post({ navn: 'Sofie', kode, handling: 'omdoeb', gruppe: 'Kun mig' }), l);
  const g = (await mine(l, 'Sofie')).grupper[0];
  assert.equal(g.navn, 'Kun mig');
  assert.deepEqual(g.medlemmer.map(m => m.navn), ['Sofie']);
});

test('den samme ven kan ikke komme med to gange', async () => {
  const l = lagre(['Sofie', 'Selma']);
  const kode = await lav(l, 'Sofie', 'Familien');
  await tilfoej(l, 'Sofie', kode, 'Selma');
  const igen = await tilfoej(l, 'Sofie', kode, 'selma');
  assert.equal(igen.ok, true);
  assert.equal(igen.grupper[0].medlemmer.length, 2);
  assert.equal((await kald(post({ navn: 'Sofie', kode, handling: 'tilfoej', ven: 'Sofie' }), l)).status, 400,
    'og man kan ikke tage sig selv med');
});

/* ---------- Grænserne ---------- */

test('ingen kan være i mere end GRUPPER_MAKS grupper', async () => {
  const l = lagre(['Sofie', 'Selma']);
  for (let i = 0; i < GRUPPER_MAKS; i++) await lav(l, 'Sofie', 'Gruppe ' + i);
  const nej = await kald(post({ navn: 'Sofie', handling: 'lav', gruppe: 'En til' }), l);
  assert.equal(nej.status, 400);
  assert.match((await nej.json()).fejl, /rigeligt med grupper/);

  // … og man kan heller ikke trækkes ind i flere af en ven.
  const selmas = await lav(l, 'Selma', 'Selmas gruppe');
  for (let i = 0; i < GRUPPER_MAKS; i++) await lav(l, 'Selma', 'Egen ' + i);
  const fuld = await kald(post({ navn: 'Selma', kode: selmas, handling: 'tilfoej', ven: 'Sofie' }), l);
  assert.equal(fuld.status, 400);
  assert.match((await fuld.json()).fejl, /Sofie er med i rigeligt/);
});

test('der er højst MEDLEM_MAKS i én gruppe', async () => {
  const venskaber = [];
  for (let i = 0; i < MEDLEM_MAKS + 2; i++) venskaber.push(['Sofie', 'Ven' + i]);
  const l = lagre(...venskaber);
  const kode = await lav(l, 'Sofie', 'Hele klassen');
  for (let i = 0; i < MEDLEM_MAKS - 1; i++) await tilfoej(l, 'Sofie', kode, 'Ven' + i);

  const nej = await kald(post({ navn: 'Sofie', kode, handling: 'tilfoej', ven: 'Ven' + MEDLEM_MAKS }), l);
  assert.equal(nej.status, 400);
  assert.match((await nej.json()).fejl, /ikke plads til flere/);
  assert.equal((await mine(l, 'Sofie')).grupper[0].medlemmer.length, MEDLEM_MAKS);
});

/* ---------- Fejl ---------- */

test('uden navn, uden gruppenavn, med forkert metode eller fremmed sti afvises pænt', async () => {
  const l = lagre(['Sofie', 'Selma']);
  assert.equal((await kald(new Request(BASE + '/api/grupper'), l)).status, 400);
  assert.equal((await kald(post({ navn: 'Sofie', handling: 'lav', gruppe: '   ' }), l)).status, 400);
  assert.equal((await kald(new Request(BASE + '/api/grupper', { method: 'PUT' }), l)).status, 405);
  assert.equal(await kald(new Request(BASE + '/api/andet'), l), null, 'andre stier er ikke vores');
  assert.equal((await kald(post('ikke json'), l)).status, 400);
});

test('samtalens nøgle hører til gruppen', () => {
  assert.equal(gruppeSamtale('K7QFD'), 'gruppe|K7QFD');
});
