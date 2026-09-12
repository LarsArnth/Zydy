// Enhedstest af højscore-API'et i src/highscore.mjs – uden database og uden
// Cloudflare. Lageret er en lille hukommelses-udgave med samme to metoder som
// d1Lager(). Kør:  node --test test/unit/highscore.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { haandterApi, rensNavn, rensScore, LISTE_LAENGDE } from '../../src/highscore.mjs';

/** Hukommelses-lager: samme sortering som SQL'en (score faldende, ældst først ved lighed). */
function huskLager() {
  const rows = []; let naeste = 0;
  return {
    rows,
    async top(spil, n) {
      return rows.filter(r => r.spil === spil)
        .sort((a, b) => b.score - a.score || a.oprettet.localeCompare(b.oprettet))
        .slice(0, n)
        .map(({ id, navn, score, oprettet }) => ({ id, navn, score, oprettet }));
    },
    async gem(spil, navn, score) {
      const id = ++naeste;
      rows.push({ id, spil, navn, score, oprettet: new Date(Date.UTC(2026, 0, 1, 0, 0, id)).toISOString() });
      return id;
    },
  };
}

const BASE = 'https://zydy.dk';
const get = (sti, lager) => haandterApi(new Request(BASE + sti), lager);
const post = (sti, krop, lager) => haandterApi(new Request(BASE + sti, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: typeof krop === 'string' ? krop : JSON.stringify(krop),
}), lager);

test('stier uden for /api/ giver null, så de statiske filer overtager', async () => {
  assert.equal(await get('/', huskLager()), null);
  assert.equal(await get('/spil/taarn/', huskLager()), null);
});

test('ukendt API-sti og ukendt spil giver 404', async () => {
  assert.equal((await get('/api/noget', huskLager())).status, 404);
  assert.equal((await get('/api/highscore/ukendt-spil', huskLager())).status, 404);
  assert.equal((await get('/api/highscore/Taarn', huskLager())).status, 404, 'kun små bogstaver');
});

test('GET på tomt spil giver tom liste', async () => {
  const r = await get('/api/highscore/taarn', huskLager());
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await r.json(), { spil: 'taarn', liste: [] });
});

test('POST gemmer og svarer med placering og opdateret liste', async () => {
  const lager = huskLager();
  await post('/api/highscore/taarn', { navn: 'Sofie', score: 12 }, lager);
  await post('/api/highscore/taarn', { navn: 'Simon', score: 30 }, lager);
  const r = await post('/api/highscore/taarn', { navn: 'Far', score: 20 }, lager);
  assert.equal(r.status, 200);
  const svar = await r.json();
  assert.equal(svar.ok, true);
  assert.equal(svar.placering, 2, 'Far med 20 ligger mellem 30 og 12');
  assert.deepEqual(svar.liste.map(x => x.navn), ['Simon', 'Far', 'Sofie']);
  assert.equal(svar.liste[1].id, svar.id);
});

test('ved lige score kommer den ældste først', async () => {
  const lager = huskLager();
  await post('/api/highscore/taarn', { navn: 'Først', score: 9 }, lager);
  const r = await post('/api/highscore/taarn', { navn: 'Sidst', score: 9 }, lager);
  const svar = await r.json();
  assert.equal(svar.placering, 2);
  assert.deepEqual(svar.liste.map(x => x.navn), ['Først', 'Sidst']);
});

test('listen viser højst LISTE_LAENGDE rækker, og placering er null uden for den', async () => {
  const lager = huskLager();
  for (let i = 0; i < LISTE_LAENGDE; i++) await post('/api/highscore/taarn', { navn: 'S' + i, score: 100 + i }, lager);
  const r = await post('/api/highscore/taarn', { navn: 'Lille', score: 1 }, lager);
  const svar = await r.json();
  assert.equal(svar.liste.length, LISTE_LAENGDE);
  assert.equal(svar.placering, null);
  assert.equal(svar.ok, true, 'den gemmes stadig, bare uden for top 10');
});

test('POST afviser ugyldigt navn og score', async () => {
  const lager = huskLager();
  const ugyldige = [
    [{ navn: '', score: 5 }, 'tomt navn'],
    [{ navn: '   ', score: 5 }, 'kun mellemrum'],
    [{ score: 5 }, 'navn mangler'],
    [{ navn: 'A', score: 0 }, 'score 0'],
    [{ navn: 'A', score: -3 }, 'negativ'],
    [{ navn: 'A', score: 2.5 }, 'decimal'],
    [{ navn: 'A', score: 999999 }, 'over maks for spillet'],
    [{ navn: 'A', score: 'abc' }, 'ikke et tal'],
    [{ navn: 'A' }, 'score mangler'],
  ];
  for (const [krop, hvorfor] of ugyldige) {
    const r = await post('/api/highscore/taarn', krop, lager);
    assert.equal(r.status, 400, hvorfor);
  }
  assert.equal((await post('/api/highscore/taarn', '{ikke json', lager)).status, 400, 'kroppen er ikke JSON');
  assert.equal(lager.rows.length, 0, 'intet blev gemt');
});

test('andre metoder end GET/POST giver 405', async () => {
  const r = await haandterApi(new Request(BASE + '/api/highscore/taarn', { method: 'DELETE' }), huskLager());
  assert.equal(r.status, 405);
});

test('rensNavn: trimmer, samler mellemrum, fjerner usynlige tegn, klipper til 12 kodepunkter', () => {
  assert.equal(rensNavn('  Sofie   A  '), 'Sofie A');
  assert.equal(rensNavn('So' + String.fromCodePoint(8203) + 'fie' + String.fromCharCode(7)), 'Sofie');
  assert.equal(rensNavn('ABCDEFGHIJKLMNOP'), 'ABCDEFGHIJKL');
  const emoji = String.fromCodePoint(0x1F600);
  assert.equal(rensNavn(emoji.repeat(13)), emoji.repeat(12), 'emoji tæller som ét tegn');
  assert.equal(rensNavn('Æbleflæsk Øl'), 'Æbleflæsk Øl');
  assert.equal(rensNavn(''), null);
  assert.equal(rensNavn(42), null);
  assert.equal(rensNavn(undefined), null);
});

test('rensScore: heltal inden for spillets grænse, også som streng', () => {
  assert.equal(rensScore(7, 'taarn'), 7);
  assert.equal(rensScore('7', 'taarn'), 7);
  assert.equal(rensScore(2000, 'taarn'), 2000);
  assert.equal(rensScore(2001, 'taarn'), null);
  assert.equal(rensScore(0, 'taarn'), null);
  assert.equal(rensScore(1.5, 'taarn'), null);
  assert.equal(rensScore(NaN, 'taarn'), null);
  assert.equal(rensScore(null, 'taarn'), null);
});
