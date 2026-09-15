// Enhedstest af opkalds-API'et i src/opkald.mjs – uden database og uden Cloudflare.
// Kør:  node --test test/unit/opkald.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  haandterOpkald, synligtOpkald, effektivStatus,
  RING_MS, OPKALD_TIMER, SDP_MAKS,
} from '../../src/opkald.mjs';
import { huskOpkald, huskVenner } from '../api-mock.mjs';

const BASE = 'https://zydy.dk';
const NU = Date.UTC(2026, 8, 15, 12, 0, 0);
const TILBUD = { type: 'offer', sdp: 'v=0 fra Sofies telefon' };
const SVAR = { type: 'answer', sdp: 'v=0 fra Selmas telefon' };

const get = (sti, q) => new Request(BASE + '/api/opkald' + sti + '?' + new URLSearchParams(q));
const post = (sti, krop) => new Request(BASE + '/api/opkald' + sti, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: typeof krop === 'string' ? krop : JSON.stringify(krop),
});

/** To lagre, hvor de navne, der nævnes, er venner i forvejen. */
function lagre(...par) {
  const venner = huskVenner(null, null);
  const opkald = huskOpkald();
  for (const [a, b] of par) {
    venner.rows.push({ fra: a.toLowerCase(), til: b.toLowerCase(), fraNavn: a, tilNavn: b, svaret: '2026-01-01' });
  }
  return { venner, opkald };
}

const kald = (req, l, nu = NU) => haandterOpkald(req, l.opkald, l.venner, nu);
const svarPaa = async (req, l, nu = NU) => (await kald(req, l, nu)).json();
const ringOp = (l, navn, ven, nu = NU) => svarPaa(post('', { navn, ven, tilbud: TILBUD }), l, nu);

/* ---------- At ringe op ---------- */

test('man kan ringe til en ven, og vennen kan se opkaldet ringe', async () => {
  const l = lagre(['Sofie', 'Selma']);
  const d = await ringOp(l, 'Sofie', 'Selma');
  assert.equal(d.ok, true);
  assert.equal(d.opkald.status, 'ringer');
  assert.equal(d.opkald.ringerJeg, true);
  assert.equal(d.opkald.ven, 'Selma');
  assert.match(d.opkald.kode, /^[A-Z2-9]{5}$/);

  const hosSelma = await svarPaa(get('', { navn: 'Selma' }), l);
  assert.equal(hosSelma.opkald.length, 1);
  const o = hosSelma.opkald[0];
  assert.equal(o.status, 'ringer');
  assert.equal(o.ringerJeg, false);
  assert.equal(o.ven, 'Sofie');
  assert.deepEqual(o.tilbud, TILBUD, 'den, der skal svare, får tilbuddet med');
  assert.equal(o.svar, null);
});

test('tilbuddet følger kun med til den, der skal svare – og svaret kun tilbage', async () => {
  const l = lagre(['Sofie', 'Selma']);
  const kode = (await ringOp(l, 'Sofie', 'Selma')).opkald.kode;
  await svarPaa(post('/' + kode, { navn: 'Selma', handling: 'svar', svar: SVAR }), l);

  const hosSofie = await svarPaa(get('/' + kode, { navn: 'Sofie' }), l);
  assert.equal(hosSofie.opkald.tilbud, null, 'Sofie har selv sit tilbud');
  assert.deepEqual(hosSofie.opkald.svar, SVAR);

  const hosSelma = await svarPaa(get('/' + kode, { navn: 'Selma' }), l);
  assert.deepEqual(hosSelma.opkald.tilbud, TILBUD);
  assert.equal(hosSelma.opkald.svar, null, 'Selma har selv sit svar');
});

test('en fremmed kan hverken se eller røre opkaldet', async () => {
  const l = lagre(['Sofie', 'Selma']);
  const kode = (await ringOp(l, 'Sofie', 'Selma')).opkald.kode;
  assert.equal((await kald(get('/' + kode, { navn: 'Far' }), l)).status, 403);
  assert.equal((await kald(post('/' + kode, { navn: 'Far', handling: 'slut' }), l)).status, 403);
});

test('man kan kun ringe til sine venner', async () => {
  const l = lagre();                                    // ingen er venner
  const nej = await kald(post('', { navn: 'Sofie', ven: 'Selma', tilbud: TILBUD }), l);
  assert.equal(nej.status, 400);
  assert.match((await nej.json()).fejl, /ikke venner/);
  assert.equal(l.opkald.rows.length, 0);

  // Et spørgsmål, der ikke er svaret på, er heller ikke nok.
  l.venner.rows.push({ fra: 'sofie', til: 'selma', fraNavn: 'Sofie', tilNavn: 'Selma', svaret: null });
  assert.equal((await kald(post('', { navn: 'Sofie', ven: 'Selma', tilbud: TILBUD }), l)).status, 400);
});

test('uden tilbud, med kæmpe tilbud eller til sig selv kan der ikke ringes', async () => {
  const l = lagre(['Sofie', 'Selma']);
  assert.equal((await kald(post('', { navn: 'Sofie', ven: 'Selma' }), l)).status, 400);
  assert.equal((await kald(post('', { navn: 'Sofie', ven: 'Selma', tilbud: 'bare en tekst' }), l)).status, 400);
  assert.equal((await kald(post('', { navn: 'Sofie', ven: 'Selma', tilbud: { sdp: 'x'.repeat(SDP_MAKS) } }), l)).status, 400);
  assert.equal((await kald(post('', { navn: 'Sofie', ven: 'sofie', tilbud: TILBUD }), l)).status, 400);
});

test('ringer man igen, erstatter det nye opkald det gamle mellem de to', async () => {
  const l = lagre(['Sofie', 'Selma']);
  const foerste = (await ringOp(l, 'Sofie', 'Selma')).opkald.kode;
  const andet = (await ringOp(l, 'Sofie', 'Selma', NU + 5_000)).opkald.kode;
  assert.notEqual(foerste, andet);
  assert.equal(l.opkald.rows.length, 1, 'højst ét opkald ad gangen mellem to venner');
  const hosSelma = await svarPaa(get('', { navn: 'Selma' }), l, NU + 6_000);
  assert.deepEqual(hosSelma.opkald.map(o => o.kode), [andet]);
});

/* ---------- At tage telefonen ---------- */

test('vennen tager den: svaret lægges, og opkaldet er i gang', async () => {
  const l = lagre(['Sofie', 'Selma']);
  const kode = (await ringOp(l, 'Sofie', 'Selma')).opkald.kode;
  const d = await svarPaa(post('/' + kode, { navn: 'Selma', handling: 'svar', svar: SVAR }), l, NU + 3_000);
  assert.equal(d.opkald.status, 'igang');

  const hosSofie = await svarPaa(get('/' + kode, { navn: 'Sofie' }), l, NU + 4_000);
  assert.equal(hosSofie.opkald.status, 'igang');
  assert.deepEqual(hosSofie.opkald.svar, SVAR);
});

test('kun den, der bliver ringet op, kan tage den – og ikke uden et svar', async () => {
  const l = lagre(['Sofie', 'Selma']);
  const kode = (await ringOp(l, 'Sofie', 'Selma')).opkald.kode;
  const selv = await kald(post('/' + kode, { navn: 'Sofie', handling: 'svar', svar: SVAR }), l);
  assert.equal(selv.status, 400);
  assert.match((await selv.json()).fejl, /din egen telefon/);
  assert.equal((await kald(post('/' + kode, { navn: 'Selma', handling: 'svar' }), l)).status, 400);
});

test('tager man den, efter den anden har lagt på, får man bare «slut» at vide', async () => {
  const l = lagre(['Sofie', 'Selma']);
  const kode = (await ringOp(l, 'Sofie', 'Selma')).opkald.kode;
  await svarPaa(post('/' + kode, { navn: 'Sofie', handling: 'slut' }), l, NU + 2_000);
  const forSent = await svarPaa(post('/' + kode, { navn: 'Selma', handling: 'svar', svar: SVAR }), l, NU + 3_000);
  assert.equal(forSent.ok, true);
  assert.equal(forSent.opkald.status, 'slut');
  assert.equal(l.opkald.rows[0].svar, null, 'svaret blev aldrig lagt');
});

/* ---------- Ubesvaret og lagt på ---------- */

test('et opkald, ingen tager inden RING_MS, er ubesvaret – og ringer ikke mere', async () => {
  const l = lagre(['Sofie', 'Selma']);
  const kode = (await ringOp(l, 'Sofie', 'Selma')).opkald.kode;

  const lige = await svarPaa(get('', { navn: 'Selma' }), l, NU + RING_MS - 1);
  assert.equal(lige.opkald.length, 1, 'lige inden grænsen ringer den stadig');

  const senere = await svarPaa(get('', { navn: 'Selma' }), l, NU + RING_MS + 1);
  assert.deepEqual(senere.opkald, [], 'bagefter er den væk fra listen');
  assert.equal((await svarPaa(get('/' + kode, { navn: 'Sofie' }), l, NU + RING_MS + 1)).opkald.status, 'slut');
  // … men et opkald, der allerede taler sammen, bliver ikke afbrudt af tiden.
  assert.equal(effektivStatus({ status: 'igang', opdateret: NU }, NU + RING_MS * 3), 'igang');
});

test('læg på virker for dem begge – uanset hvem der gør det', async () => {
  const l = lagre(['Sofie', 'Selma']);
  const kode = (await ringOp(l, 'Sofie', 'Selma')).opkald.kode;
  await svarPaa(post('/' + kode, { navn: 'Selma', handling: 'svar', svar: SVAR }), l, NU + 2_000);
  const d = await svarPaa(post('/' + kode, { navn: 'Selma', handling: 'slut' }), l, NU + 60_000);
  assert.equal(d.opkald.status, 'slut');
  assert.equal((await svarPaa(get('/' + kode, { navn: 'Sofie' }), l, NU + 61_000)).opkald.status, 'slut');
  assert.deepEqual((await svarPaa(get('', { navn: 'Sofie' }), l, NU + 61_000)).opkald, []);
});

test('gamle opkald glemmes helt, når der ringes igen', async () => {
  const l = lagre(['Sofie', 'Selma'], ['Sofie', 'Far']);
  await ringOp(l, 'Sofie', 'Selma');
  const senere = NU + OPKALD_TIMER * 3600_000 + 1;
  await ringOp(l, 'Sofie', 'Far', senere);
  assert.equal(l.opkald.rows.length, 1, 'det timegamle opkald er ryddet op');
  assert.equal(l.opkald.rows[0].til, 'far');
});

/* ---------- synligtOpkald og fejl ---------- */

test('synligtOpkald tåler skrald i tilbud og svar', () => {
  const r = { kode: 'ABCDE', fra: 'sofie', fraNavn: 'Sofie', til: 'selma', tilNavn: 'Selma',
    status: 'ringer', tilbud: 'ikke json{', svar: null, opdateret: NU };
  assert.equal(synligtOpkald(r, 'selma', NU).tilbud, null);
});

test('GET uden navn, forkerte metoder, ukendte koder og fremmede stier afvises pænt', async () => {
  const l = lagre(['Sofie', 'Selma']);
  assert.equal((await kald(new Request(BASE + '/api/opkald'), l)).status, 400);
  assert.equal((await kald(new Request(BASE + '/api/opkald', { method: 'PUT' }), l)).status, 405);
  assert.equal((await kald(get('/QQQQQ', { navn: 'Sofie' }), l)).status, 404);
  assert.equal((await kald(get('/ip', { navn: 'Sofie' }), l)).status, 400, 'en kode har fem tegn');
  assert.equal(await kald(new Request(BASE + '/api/andet'), l), null, 'andre stier er ikke vores');
  assert.equal((await kald(post('', 'ikke json'), l)).status, 400);
});
