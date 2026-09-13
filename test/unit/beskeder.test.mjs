// Enhedstest af besked-API'et i src/beskeder.mjs – uden database og uden Cloudflare.
// Kør:  node --test test/unit/beskeder.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  haandterBeskeder, rensBesked, laesSet, samtaleNoegle,
  TEKST_MAKS, SAMTALE_MAKS, SPAM_MAKS, SPAM_VINDUE_MS,
} from '../../src/beskeder.mjs';
import { haandterVenner } from '../../src/venner.mjs';
import { huskBeskeder, huskVenner } from '../api-mock.mjs';

const BASE = 'https://zydy.dk';
const NU = Date.UTC(2026, 8, 13, 12, 0, 0);

const get = (q) => new Request(BASE + '/api/beskeder?' + new URLSearchParams(q));
const post = krop => new Request(BASE + '/api/beskeder', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: typeof krop === 'string' ? krop : JSON.stringify(krop),
});

/** To lagre, hvor de navne, der nævnes, er venner i forvejen. */
function lagre(...par) {
  const venner = huskVenner(null, null);
  const beskeder = huskBeskeder();
  for (const [a, b] of par) {
    venner.rows.push({ fra: a.toLowerCase(), til: b.toLowerCase(), fraNavn: a, tilNavn: b, svaret: '2026-01-01' });
  }
  return { venner, beskeder };
}

const kald = (req, l, nu = NU) => haandterBeskeder(req, l.beskeder, l.venner, nu);
const svarPaa = async (req, l, nu = NU) => (await kald(req, l, nu)).json();
const skriv = (l, navn, ven, tekst, nu = NU) => svarPaa(post({ navn, ven, tekst }), l, nu);

/* ---------- Rensning ---------- */

test('rensBesked samler mellemrum, fjerner det usynlige og klipper de lange af', () => {
  assert.equal(rensBesked('  hej   Selma '), 'hej Selma');
  assert.equal(rensBesked('to\nlinjer'), 'to linjer', 'en besked er én linje');
  assert.equal(rensBesked('hej​'), 'hej', 'usynlige tegn ryger ud');
  assert.equal(rensBesked('   '), null);
  assert.equal(rensBesked(42), null);
  assert.equal(Array.from(rensBesked('a'.repeat(400))).length, TEKST_MAKS);
  assert.equal(rensBesked('🎮👍'), '🎮👍', 'emoji må man skrive');
});

test('laesSet læser «hvad har jeg læst» fra adressen og springer skrald over', () => {
  assert.deepEqual(laesSet('selma:42,Far:7'), { selma: 42, far: 7 });
  assert.deepEqual(laesSet('selma:hej,:3,uden-id'), {});
  assert.deepEqual(laesSet(null), {});
});

test('samtalen har samme nøgle, uanset hvem der spørger', () => {
  assert.equal(samtaleNoegle('sofie', 'selma'), samtaleNoegle('selma', 'sofie'));
});

/* ---------- At skrive sammen ---------- */

test('en besked kan skrives og læses af dem begge', async () => {
  const l = lagre(['Sofie', 'Selma']);

  const sendt = await skriv(l, 'Sofie', 'Selma', 'Hej Selma!');
  assert.equal(sendt.ok, true);
  assert.deepEqual(sendt.beskeder.map(b => [b.navn, b.tekst, b.mig]), [['Sofie', 'Hej Selma!', true]]);

  const hosSelma = await svarPaa(get({ navn: 'Selma', ven: 'Sofie' }), l);
  assert.deepEqual(hosSelma.beskeder.map(b => [b.navn, b.tekst, b.mig]), [['Sofie', 'Hej Selma!', false]],
    'hos Selma er den fra Sofie – ikke fra hende selv');
  assert.equal(hosSelma.beskeder[0].tid, NU);

  await skriv(l, 'Selma', 'Sofie', 'Hej! Skal vi spille?');
  const samtale = (await svarPaa(get({ navn: 'Sofie', ven: 'Selma' }), l)).beskeder;
  assert.deepEqual(samtale.map(b => b.tekst), ['Hej Selma!', 'Hej! Skal vi spille?'],
    'begges beskeder står i den samme samtale, ældste først');
});

test('efter= giver kun det, telefonen ikke har set endnu', async () => {
  const l = lagre(['Sofie', 'Selma']);
  await skriv(l, 'Sofie', 'Selma', 'en');
  const id = (await skriv(l, 'Sofie', 'Selma', 'to')).beskeder.slice(-1)[0].id;
  await skriv(l, 'Selma', 'Sofie', 'tre');

  const nye = (await svarPaa(get({ navn: 'Sofie', ven: 'Selma', efter: id }), l)).beskeder;
  assert.deepEqual(nye.map(b => b.tekst), ['tre']);
});

test('store og små bogstaver er den samme samtale', async () => {
  const l = lagre(['Sofie', 'Selma']);
  await skriv(l, 'sofie', 'SELMA', 'hej');
  assert.deepEqual((await svarPaa(get({ navn: 'Selma', ven: 'Sofie' }), l)).beskeder.map(b => b.tekst), ['hej']);
});

/* ---------- Oversigten ---------- */

test('oversigten viser den sidste besked og tæller det, jeg ikke har læst', async () => {
  const l = lagre(['Sofie', 'Selma'], ['Sofie', 'Far']);
  await skriv(l, 'Selma', 'Sofie', 'hej');
  await skriv(l, 'Selma', 'Sofie', 'er du der?');
  await skriv(l, 'Far', 'Sofie', 'aftensmad!');

  const alt = await svarPaa(get({ navn: 'Sofie' }), l);
  assert.equal(alt.nye, 3, 'intet er læst endnu');
  assert.deepEqual(alt.samtaler.map(s => [s.ven, s.sidst.tekst, s.nye]),
    [['Far', 'aftensmad!', 1], ['Selma', 'er du der?', 2]], 'nyeste samtale øverst');

  // Sofie har læst Selmas første besked.
  const foerste = (await svarPaa(get({ navn: 'Sofie', ven: 'Selma' }), l)).beskeder[0].id;
  const efter = await svarPaa(get({ navn: 'Sofie', set: 'selma:' + foerste }), l);
  assert.equal(efter.samtaler.find(s => s.ven === 'Selma').nye, 1);
  assert.equal(efter.nye, 2);
});

test('mine egne beskeder er aldrig «nye» for mig selv', async () => {
  const l = lagre(['Sofie', 'Selma']);
  await skriv(l, 'Sofie', 'Selma', 'hej');
  const hosSofie = await svarPaa(get({ navn: 'Sofie' }), l);
  assert.equal(hosSofie.nye, 0);
  assert.equal(hosSofie.samtaler[0].sidst.mig, true);
  assert.equal((await svarPaa(get({ navn: 'Selma' }), l)).nye, 1, '… men Selma har fået en');
});

/* ---------- Værnet ---------- */

test('man kan kun skrive med sine venner', async () => {
  const l = lagre();                                   // ingen er venner
  const nej = await kald(post({ navn: 'Sofie', ven: 'Selma', tekst: 'hej' }), l);
  assert.equal(nej.status, 403);
  assert.match((await nej.json()).fejl, /ikke venner/);
  assert.equal(l.beskeder.rows.length, 0);

  // Et spørgsmål, der ikke er svaret på, er heller ikke nok.
  l.venner.rows.push({ fra: 'sofie', til: 'selma', fraNavn: 'Sofie', tilNavn: 'Selma', svaret: null });
  assert.equal((await kald(post({ navn: 'Sofie', ven: 'Selma', tekst: 'hej' }), l)).status, 403);
  assert.equal((await kald(get({ navn: 'Sofie', ven: 'Selma' }), l)).status, 403, 'og man kan ikke læse med');
});

test('man kan ikke skrive til sig selv, og tomme beskeder afvises', async () => {
  const l = lagre(['Sofie', 'Selma']);
  assert.equal((await kald(post({ navn: 'Sofie', ven: 'sofie', tekst: 'hej' }), l)).status, 400);
  const tom = await kald(post({ navn: 'Sofie', ven: 'Selma', tekst: '   ' }), l);
  assert.equal(tom.status, 400);
  assert.match((await tom.json()).fejl, /Skriv noget/);
});

test('ingen kan sende mere end SPAM_MAKS beskeder i minuttet', async () => {
  const l = lagre(['Sofie', 'Selma']);
  for (let i = 0; i < SPAM_MAKS; i++) await skriv(l, 'Sofie', 'Selma', 'spam ' + i);
  const nej = await kald(post({ navn: 'Sofie', ven: 'Selma', tekst: 'en til' }), l);
  assert.equal(nej.status, 429);
  assert.match((await nej.json()).fejl, /for hurtigt/);

  // Selma må gerne skrive – grænsen er pr. person …
  assert.equal((await kald(post({ navn: 'Selma', ven: 'Sofie', tekst: 'slap af' }), l)).status, 200);
  // … og når minuttet er gået, må Sofie igen.
  assert.equal((await kald(post({ navn: 'Sofie', ven: 'Selma', tekst: 'hej igen' }), l, NU + SPAM_VINDUE_MS + 1)).status, 200);
});

test('en samtale husker kun de nyeste SAMTALE_MAKS beskeder', async () => {
  const l = lagre(['Sofie', 'Selma']);
  for (let i = 0; i < SAMTALE_MAKS + 20; i++) {
    // Én pr. minut, så spam-grænsen ikke er den, vi måler.
    await skriv(l, 'Sofie', 'Selma', 'nr ' + i, NU + i * 60_000);
  }
  assert.equal(l.beskeder.rows.length, SAMTALE_MAKS);
  assert.equal(l.beskeder.rows[0].tekst, 'nr 20', 'de ældste er glemt');
});

/* ---------- Ryd op ---------- */

test('samtalen kan ryddes, og den er væk for dem begge', async () => {
  const l = lagre(['Sofie', 'Selma']);
  await skriv(l, 'Sofie', 'Selma', 'ups');
  const ryddet = await svarPaa(post({ navn: 'Selma', ven: 'Sofie', handling: 'ryd' }), l);
  assert.deepEqual(ryddet.beskeder, []);
  assert.deepEqual((await svarPaa(get({ navn: 'Sofie', ven: 'Selma' }), l)).beskeder, []);
});

test('fjerner man en ven, følger det, I har skrevet, med ud', async () => {
  const l = lagre(['Sofie', 'Selma']);
  await skriv(l, 'Sofie', 'Selma', 'hej');
  const nej = new Request(BASE + '/api/venner', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ navn: 'Sofie', ven: 'Selma', handling: 'nej' }),
  });
  await haandterVenner(nej, l.venner, l.beskeder);
  assert.equal(l.beskeder.rows.length, 0);
});

/* ---------- Fejl ---------- */

test('GET uden navn, forkerte metoder og fremmede stier afvises pænt', async () => {
  const l = lagre(['Sofie', 'Selma']);
  assert.equal((await kald(new Request(BASE + '/api/beskeder'), l)).status, 400);
  assert.equal((await kald(new Request(BASE + '/api/beskeder', { method: 'PUT' }), l)).status, 405);
  assert.equal(await kald(new Request(BASE + '/api/andet'), l), null, 'andre stier er ikke vores');
  assert.equal((await kald(post('ikke json'), l)).status, 400);
});
