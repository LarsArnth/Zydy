// Enhedstest af højscore-API'et i src/highscore.mjs – uden database og uden
// Cloudflare. Lageret er en lille hukommelses-udgave med samme seks metoder som
// d1Lager(). Kør:  node --test test/unit/highscore.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { haandterApi, rensNavn, rensScore, reglerFor, LISTE_LAENGDE } from '../../src/highscore.mjs';

/** Hukommelses-lager: samme sortering som SQL'en (bedste først efter retning, ældst først ved lighed). */
function huskLager() {
  const rows = []; let naeste = 0;
  return {
    rows,
    async top(spil, n, retning) {
      const tegn = retning === 'asc' ? 1 : -1;
      return rows.filter(r => r.spil === spil)
        .sort((a, b) => tegn * (a.score - b.score) || a.oprettet.localeCompare(b.oprettet))
        .slice(0, n)
        .map(({ id, navn, score, oprettet }) => ({ id, navn, score, oprettet }));
    },
    async gem(spil, navn, score, retning, token) {
      const id = ++naeste;
      rows.push({ id, spil, navn, score, token, oprettet: new Date(Date.UTC(2026, 0, 1, 0, 0, id)).toISOString() });
      return id;
    },
    async sletNavn(spil, navn) {
      for (let i = rows.length - 1; i >= 0; i--) {
        if (rows[i].spil === spil && rows[i].navn.toLowerCase() === navn.toLowerCase()) rows.splice(i, 1);
      }
    },
    async omdoeb(spil, id, token, navn) {
      const r = rows.find(x => x.spil === spil && x.id === id && x.token === token);
      if (r) r.navn = navn;
      return !!r;
    },
    async slet(spil, id, token) {
      const i = rows.findIndex(x => x.spil === spil && x.id === id && x.token === token);
      if (i >= 0) rows.splice(i, 1);
      return i >= 0;
    },
    async sletId(spil, id) {
      const i = rows.findIndex(x => x.spil === spil && x.id === id);
      if (i >= 0) rows.splice(i, 1);
    },
  };
}

const BASE = 'https://zydy.dk';
const get = (sti, lager) => haandterApi(new Request(BASE + sti), lager);
const medKrop = (metode, sti, krop, lager) => haandterApi(new Request(BASE + sti, {
  method: metode, headers: { 'content-type': 'application/json' },
  body: typeof krop === 'string' ? krop : JSON.stringify(krop),
}), lager);
const post = (sti, krop, lager) => medKrop('POST', sti, krop, lager);
const patch = (sti, krop, lager) => medKrop('PATCH', sti, krop, lager);
const TAARN = { retning: 'desc', min: 1, maks: 2000, unik: true };

test('stier uden for /api/ giver null, så de statiske filer overtager', async () => {
  assert.equal(await get('/', huskLager()), null);
  assert.equal(await get('/spil/taarn/', huskLager()), null);
});

test('ukendt API-sti og ukendt spil giver 404', async () => {
  assert.equal((await get('/api/noget', huskLager())).status, 404);
  assert.equal((await get('/api/highscore/ukendt-spil', huskLager())).status, 404);
  assert.equal((await get('/api/highscore/Taarn', huskLager())).status, 404, 'kun små bogstaver');
});

test('GET på tomt spil giver tom liste plus spillets regler', async () => {
  const r = await get('/api/highscore/taarn', huskLager());
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await r.json(), { spil: 'taarn', ...TAARN, liste: [] });
});

test('POST gemmer og svarer med placering, token og opdateret liste', async () => {
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
  assert.match(svar.token, /^[0-9a-f-]{36}$/, 'token er en UUID');
  assert.ok(svar.liste.every(x => x.token === undefined), 'tokens lækkes ikke i listen');
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

test('asc-spil (Sæt klassisk): laveste tid vinder, og for korte tider afvises', async () => {
  const lager = huskLager();
  assert.deepEqual(reglerFor('saet-klassisk'), { retning: 'asc', min: 20, maks: 10800, unik: true });
  await post('/api/highscore/saet-klassisk', { navn: 'Langsom', score: 300 }, lager);
  await post('/api/highscore/saet-klassisk', { navn: 'Hurtig', score: 95 }, lager);
  const r = await post('/api/highscore/saet-klassisk', { navn: 'Midt', score: 120 }, lager);
  const svar = await r.json();
  assert.equal(svar.retning, 'asc');
  assert.equal(svar.placering, 2);
  assert.deepEqual(svar.liste.map(x => x.navn), ['Hurtig', 'Midt', 'Langsom']);
  assert.equal((await post('/api/highscore/saet-klassisk', { navn: 'Snyd', score: 5 }, lager)).status, 400, 'under min');
  const g = await (await get('/api/highscore/saet-klassisk', lager)).json();
  assert.equal(g.min, 20);
  assert.equal(g.liste.length, 3);
});

test('unik (standard): kun én række pr. navn, og kun en bedre score erstatter den gamle', async () => {
  const lager = huskLager();
  assert.equal(reglerFor('taarn').unik, true, 'unik er standard');
  assert.equal(reglerFor('obby').unik, true);
  await post('/api/highscore/taarn', { navn: 'Sofie', score: 5 }, lager);
  await post('/api/highscore/taarn', { navn: 'Simon', score: 8 }, lager);
  // Dårligere score for samme navn (andre bogstaver): intet gemmes, svaret peger på den gamle række med dens score
  let svar = await (await post('/api/highscore/taarn', { navn: 'sofie', score: 3 }, lager)).json();
  assert.equal(svar.ok, true);
  assert.equal(svar.uaendret, true);
  assert.equal(svar.score, 5, 'den stående rekord følger med');
  assert.equal(svar.placering, 2);
  assert.equal(svar.token, undefined, 'ingen ny række, intet token');
  assert.equal(lager.rows.length, 2, 'ingen ny række');
  // Bedre score erstatter den gamle
  svar = await (await post('/api/highscore/taarn', { navn: 'Sofie', score: 12 }, lager)).json();
  assert.equal(svar.uaendret, undefined);
  assert.equal(svar.placering, 1);
  assert.deepEqual(svar.liste.map(x => [x.navn, x.score]), [['Sofie', 12], ['Simon', 8]]);
  assert.equal(lager.rows.length, 2, 'stadig én række pr. navn');
  // asc-spil: kun en lavere tid erstatter
  await post('/api/highscore/saet-klassisk', { navn: 'Mor', score: 300 }, lager);
  svar = await (await post('/api/highscore/saet-klassisk', { navn: 'Mor', score: 400 }, lager)).json();
  assert.equal(svar.uaendret, true);
  svar = await (await post('/api/highscore/saet-klassisk', { navn: 'Mor', score: 250 }, lager)).json();
  assert.deepEqual(svar.liste.map(x => x.score), [250]);
});

test('gamle dubletter i databasen (fra før unik-reglen) vises kun én gang, og forsvinder når navnet gemmer igen', async () => {
  const lager = huskLager();
  // Sofie har fem rækker fra før reglen kom til – som i klagen fra brugerne
  for (const sc of [5, 6, 7, 8, 9]) await lager.gem('taarn', 'Sofie', sc, 'desc', 't');
  await lager.gem('taarn', 'Simon', 4, 'desc', 't');
  await lager.gem('taarn', 'sofie', 3, 'desc', 't');
  let g = await (await get('/api/highscore/taarn', lager)).json();
  assert.deepEqual(g.liste.map(x => [x.navn, x.score]), [['Sofie', 9], ['Simon', 4]], 'kun Sofies bedste vises');
  // En dårligere score fra Sofie: uændret, men svaret er også uden dubletter og peger på den bedste række
  let svar = await (await post('/api/highscore/taarn', { navn: 'Sofie', score: 8 }, lager)).json();
  assert.equal(svar.uaendret, true);
  assert.equal(svar.score, 9);
  assert.equal(svar.placering, 1);
  assert.deepEqual(svar.liste.map(x => x.navn), ['Sofie', 'Simon']);
  assert.equal(lager.rows.length, 7, 'læsning rydder ikke op i databasen');
  // En bedre score: alle Sofies gamle rækker ryddes
  svar = await (await post('/api/highscore/taarn', { navn: 'Sofie', score: 10 }, lager)).json();
  assert.deepEqual(svar.liste.map(x => [x.navn, x.score]), [['Sofie', 10], ['Simon', 4]]);
  assert.equal(lager.rows.length, 2, 'dubletterne er slettet');
  // Simon kommer stadig med i top 10, selv om Sofie har flere rækker end der er plads til
  for (let i = 0; i < 12; i++) await lager.gem('dybet', 'Sofie', 20 + i, 'desc', 't');
  await lager.gem('dybet', 'Simon', 2, 'desc', 't');
  g = await (await get('/api/highscore/dybet', lager)).json();
  assert.deepEqual(g.liste.map(x => x.navn), ['Sofie', 'Simon']);
});

test('PATCH retter navnet på egen række – kun med det rigtige token', async () => {
  const lager = huskLager();
  const gemt = await (await post('/api/highscore/taarn', { navn: 'Sofie', score: 7 }, lager)).json();
  await post('/api/highscore/taarn', { navn: 'Far', score: 9 }, lager);
  const sti = `/api/highscore/taarn/${gemt.id}`;
  assert.equal((await patch(sti, { navn: 'Simon', token: 'forkert' }, lager)).status, 403);
  assert.equal((await patch(sti, { navn: 'Simon' }, lager)).status, 400, 'token mangler');
  assert.equal((await patch(sti, { navn: '', token: gemt.token }, lager)).status, 400, 'navn mangler');
  assert.equal((await patch('/api/highscore/taarn/9999', { navn: 'Simon', token: gemt.token }, lager)).status, 404);
  const svar = await (await patch(sti, { navn: 'Simon', token: gemt.token }, lager)).json();
  assert.equal(svar.ok, true);
  assert.equal(svar.id, gemt.id);
  assert.equal(svar.placering, 2);
  assert.deepEqual(svar.liste.map(x => x.navn), ['Far', 'Simon']);
  assert.equal(lager.rows.find(r => r.id === gemt.id).navn, 'Simon');
  assert.equal((await get(sti, lager)).status, 405, 'GET på en enkelt række findes ikke');
  assert.equal((await medKrop('DELETE', sti, {}, lager)).status, 405);
});

test('PATCH til et navn der allerede står på listen: kun den bedste af de to overlever', async () => {
  const lager = huskLager();
  const simon = await (await post('/api/highscore/taarn', { navn: 'Simon', score: 10 }, lager)).json();
  const a = await (await post('/api/highscore/taarn', { navn: 'Gæst', score: 15 }, lager)).json();
  // Gæst (15) omdøbes til Simon og er bedre end Simons 10 → Simons gamle række forsvinder
  let svar = await (await patch(`/api/highscore/taarn/${a.id}`, { navn: 'simon', token: a.token }, lager)).json();
  assert.equal(svar.id, a.id);
  assert.deepEqual(svar.liste.map(x => [x.navn, x.score]), [['simon', 15]]);
  assert.equal(lager.rows.length, 1);
  // Gæst (4) omdøbes til Simon men er dårligere → egen række slettes, svaret peger på Simons
  const b = await (await post('/api/highscore/taarn', { navn: 'Gæst', score: 4 }, lager)).json();
  svar = await (await patch(`/api/highscore/taarn/${b.id}`, { navn: 'Simon', token: b.token }, lager)).json();
  assert.equal(svar.uaendret, true);
  assert.equal(svar.id, a.id);
  assert.equal(svar.score, 15);
  assert.equal(lager.rows.length, 1);
  assert.equal(simon.ok, true);
});

test('PATCH til et navn med gamle dubletter rydder dem alle', async () => {
  const lager = huskLager();
  for (const sc of [5, 6, 7]) await lager.gem('taarn', 'Sofie', sc, 'desc', 't');
  const g = await (await post('/api/highscore/taarn', { navn: 'Gæst', score: 20 }, lager)).json();
  const svar = await (await patch(`/api/highscore/taarn/${g.id}`, { navn: 'Sofie', token: g.token }, lager)).json();
  assert.deepEqual(svar.liste.map(x => [x.navn, x.score]), [['Sofie', 20]]);
  assert.equal(lager.rows.length, 1, 'alle Sofies gamle rækker er væk');
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
