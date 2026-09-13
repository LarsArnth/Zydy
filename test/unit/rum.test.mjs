// Enhedstest af "spil sammen"-API'et i src/rum.mjs – uden database og uden Cloudflare.
// Kør:  node --test test/unit/rum.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { haandterRum, rensKode, nyKode, synligtRum, RUM_TIMER, TILSTAND_MAKS } from '../../src/rum.mjs';
import { huskRum, huskVenner, huskLager, huskAktivitet } from '../api-mock.mjs';

const BASE = 'https://zydy.dk';
const get = (sti) => new Request(BASE + sti);
const post = (sti, krop) => new Request(BASE + sti, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: typeof krop === 'string' ? krop : JSON.stringify(krop),
});

/** To venner, der har sagt ja til hinanden – ellers kan de ikke invitere. */
function opsaetning({ venner = [['sofie', 'selma', 'Sofie', 'Selma']] } = {}) {
  const v = huskVenner(huskLager(), huskAktivitet());
  venner.forEach(([a, b, an, bn]) => {
    v.rows.push({ fra: a, til: b, fraNavn: an, tilNavn: bn, svaret: '2026-09-12T10:00:00Z' });
  });
  return { rum: huskRum(), venner: v };
}

const kald = async (req, o, nu) => {
  const svar = await haandterRum(req, o.rum, o.venner, nu);
  return { status: svar.status, krop: await svar.json() };
};

/* ---------- Koder ---------- */

test('koder er fem tegn og kan læses tilbage fra adressen', () => {
  let n = 0;
  const kode = nyKode(() => ((n++) * 7919 % 1000) / 1000);
  assert.equal(kode.length, 5);
  assert.equal(rensKode(kode), kode);
  assert.equal(rensKode(kode.toLowerCase()), kode, 'små bogstaver i adressen er i orden');
  assert.equal(rensKode('K7QF'), null, 'for kort');
  assert.equal(rensKode('K7QF!'), null, 'ukendt tegn');
  assert.equal(rensKode('K7QFO'), null, 'O bruger vi ikke – den ligner et nul');
});

test('synligtRum vender navnene rigtigt for hver af de to', () => {
  const r = { kode: 'ABCDE', spil: 'kryds', vaert: 'sofie', vaertNavn: 'Sofie', gaest: 'selma',
    gaestNavn: 'Selma', status: 'igang', version: 3, tilstand: '{"tur":"x"}' };
  assert.deepEqual(synligtRum(r, 'sofie'), { kode: 'ABCDE', spil: 'kryds', status: 'igang', version: 3,
    tilstand: { tur: 'x' }, rolle: 'vaert', jeg: 'Sofie', modspiller: 'Selma' });
  assert.deepEqual(synligtRum(r, 'selma').rolle, 'gaest');
  assert.deepEqual(synligtRum(r, 'selma').modspiller, 'Sofie');
});

/* ---------- Invitation ---------- */

test('en ven inviteres, hopper med og så er spillet i gang', async () => {
  const o = opsaetning();

  const inv = await kald(post('/api/rum', { navn: 'Sofie', ven: 'Selma', spil: 'kryds' }), o);
  assert.equal(inv.krop.ok, true);
  assert.equal(inv.krop.rum.status, 'inviteret');
  assert.equal(inv.krop.rum.rolle, 'vaert');
  assert.equal(inv.krop.rum.modspiller, 'Selma');
  const kode = inv.krop.rum.kode;

  // Selma kan se invitationen på forsiden …
  const hendes = await kald(get('/api/rum?navn=Selma'), o);
  assert.equal(hendes.krop.rum.length, 1);
  assert.equal(hendes.krop.rum[0].rolle, 'gaest');
  assert.equal(hendes.krop.rum[0].modspiller, 'Sofie');

  // … og hopper med.
  const kom = await kald(post('/api/rum/' + kode, { navn: 'Selma', handling: 'kom' }), o);
  assert.equal(kom.krop.rum.status, 'igang');
  const sofie = await kald(get('/api/rum/' + kode + '?navn=Sofie'), o);
  assert.equal(sofie.krop.rum.status, 'igang', 'værten kan se, at hun er hoppet med');
});

test('man kan kun invitere en ven til et spil, der kan spilles sammen', async () => {
  const o = opsaetning();
  const fremmed = await kald(post('/api/rum', { navn: 'Sofie', ven: 'Ukendt', spil: 'kryds' }), o);
  assert.equal(fremmed.status, 400);
  assert.match(fremmed.krop.fejl, /ikke venner/i);

  // Tårn *kan* man invitere til (et kapløb), men Min kat er hverken det ene
  // eller det andet – en killing, der vokser over uger, giver ingen runder.
  const kaploeb = await kald(post('/api/rum', { navn: 'Sofie', ven: 'Selma', spil: 'taarn' }), o);
  assert.equal(kaploeb.krop.ok, true, 'et kapløb i Tårn er i orden');

  const forkertSpil = await kald(post('/api/rum', { navn: 'Sofie', ven: 'Selma', spil: 'kat' }), o);
  assert.equal(forkertSpil.status, 400);
  assert.match(forkertSpil.krop.fejl, /sammen/i);

  const migSelv = await kald(post('/api/rum', { navn: 'Sofie', ven: 'sofie', spil: 'kryds' }), o);
  assert.equal(migSelv.status, 400);
});

test('en ny invitation afløser den gamle mellem de samme to', async () => {
  const o = opsaetning();
  const en = await kald(post('/api/rum', { navn: 'Sofie', ven: 'Selma', spil: 'kryds' }), o);
  const to = await kald(post('/api/rum', { navn: 'Selma', ven: 'Sofie', spil: 'kryds' }), o);
  assert.notEqual(en.krop.rum.kode, to.krop.rum.kode);
  assert.equal(o.rum.rows.length, 1, 'der er kun ét rum ad gangen mellem to venner');
  const vaek = await kald(get('/api/rum/' + en.krop.rum.kode + '?navn=Sofie'), o);
  assert.equal(vaek.status, 404);
});

/* ---------- Spillet ---------- */

async function igangvaerende(o) {
  const inv = await kald(post('/api/rum', { navn: 'Sofie', ven: 'Selma', spil: 'kryds' }), o);
  const kode = inv.krop.rum.kode;
  await kald(post('/api/rum/' + kode, { navn: 'Selma', handling: 'kom' }), o);
  return kode;
}

test('træk gemmes med en version, så de to ikke skriver oven i hinanden', async () => {
  const o = opsaetning();
  const kode = await igangvaerende(o);

  const et = await kald(post('/api/rum/' + kode, { navn: 'Sofie', handling: 'gem', version: 0, tilstand: { braet: 'x........' } }), o);
  assert.equal(et.krop.rum.version, 1);
  assert.deepEqual(et.krop.rum.tilstand, { braet: 'x........' });

  // Selma trækker oven på version 1 – det går fint.
  const to = await kald(post('/api/rum/' + kode, { navn: 'Selma', handling: 'gem', version: 1, tilstand: { braet: 'xo.......' } }), o);
  assert.equal(to.krop.rum.version, 2);

  // Et træk bygget på en forældet version kommer for sent og får det rigtige tilbage.
  const sent = await kald(post('/api/rum/' + kode, { navn: 'Sofie', handling: 'gem', version: 0, tilstand: { braet: 'xx.......' } }), o);
  assert.equal(sent.krop.uaendret, true);
  assert.deepEqual(sent.krop.rum.tilstand, { braet: 'xo.......' }, 'rummet står stadig med Selmas træk');
});

test('der kan ikke trækkes, før den anden er hoppet med', async () => {
  const o = opsaetning();
  const inv = await kald(post('/api/rum', { navn: 'Sofie', ven: 'Selma', spil: 'kryds' }), o);
  const svar = await kald(post('/api/rum/' + inv.krop.rum.kode, { navn: 'Sofie', handling: 'gem', version: 0, tilstand: { braet: 'x........' } }), o);
  assert.equal(svar.krop.uaendret, true);
  assert.equal(svar.krop.rum.version, 0);
});

test('en for stor stilling afvises', async () => {
  const o = opsaetning();
  const kode = await igangvaerende(o);
  const svar = await kald(post('/api/rum/' + kode, { navn: 'Sofie', handling: 'gem', version: 0, tilstand: { fyld: 'x'.repeat(TILSTAND_MAKS) } }), o);
  assert.equal(svar.status, 400);
  assert.match(svar.krop.fejl, /for stor/i);
});

test('andre kan hverken kigge med eller spille i rummet', async () => {
  const o = opsaetning();
  const kode = await igangvaerende(o);
  const kig = await kald(get('/api/rum/' + kode + '?navn=Simon'), o);
  assert.equal(kig.status, 403);
  const traek = await kald(post('/api/rum/' + kode, { navn: 'Simon', handling: 'gem', version: 0, tilstand: { braet: 'x........' } }), o);
  assert.equal(traek.status, 403);
});

test('går den ene, er spillet slut for begge', async () => {
  const o = opsaetning();
  const kode = await igangvaerende(o);
  const farvel = await kald(post('/api/rum/' + kode, { navn: 'Selma', handling: 'nej' }), o);
  assert.equal(farvel.krop.rum.status, 'slut');

  const sofie = await kald(get('/api/rum/' + kode + '?navn=Sofie'), o);
  assert.equal(sofie.krop.rum.status, 'slut', 'den anden får det at vide');
  const mine = await kald(get('/api/rum?navn=Sofie'), o);
  assert.deepEqual(mine.krop.rum, [], 'og rummet står ikke længere på forsiden');
});

test('et glemt rum forsvinder af sig selv', async () => {
  const o = opsaetning();
  const nu = 1_700_000_000_000;
  const inv = await kald(post('/api/rum', { navn: 'Sofie', ven: 'Selma', spil: 'kryds' }), o, nu);
  const senere = nu + (RUM_TIMER + 1) * 3600_000;
  const vaek = await kald(get('/api/rum/' + inv.krop.rum.kode + '?navn=Sofie'), o, senere);
  assert.equal(vaek.status, 404);
  const mine = await kald(get('/api/rum?navn=Sofie'), o, senere);
  assert.deepEqual(mine.krop.rum, []);
});

/* ---------- Stier der ikke er vores ---------- */

test('andre stier lader vi ligge', async () => {
  const o = opsaetning();
  assert.equal(await haandterRum(get('/api/venner?navn=Sofie'), o.rum, o.venner), null);
  assert.equal(await haandterRum(get('/api/rum/ABCDE/mere?navn=Sofie'), o.rum, o.venner), null);
  const daarlig = await kald(get('/api/rum/hej?navn=Sofie'), o);
  assert.equal(daarlig.status, 400);
});
