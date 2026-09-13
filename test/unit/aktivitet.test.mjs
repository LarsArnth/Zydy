// Enhedstest af aktivitets-API'et i src/aktivitet.mjs – uden database og uden
// Cloudflare. Kør:  node --test test/unit/aktivitet.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { haandterAktivitet, topNoegle, kendteSpil, maaTaelles, tael, rensKlient, FORSIDEN, AKTIV_TIMEOUT_MS } from '../../src/aktivitet.mjs';

/** Hukommelses-udgave af d1Aktivitet(). */
function huskAktivitet() {
  const starter = new Map();   // 'spil|dag' → antal
  const aktive = new Map();    // klient → { klient, spil, sidst, navn }
  return {
    starter, aktive,
    async taelStart(spil, dag) { const k = spil + '|' + dag; starter.set(k, (starter.get(k) || 0) + 1); },
    async markerAktiv(klient, spil, nu, navn = null) { aktive.set(klient, { klient, spil, sidst: nu, navn }); },
    async fjernAktiv(klient) { aktive.delete(klient); },
    async rydAktive(foer) { for (const [k, v] of aktive) if (v.sidst < foer) aktive.delete(k); },
    async aktiveNu(efter) {
      return [...aktive.values()].filter(v => v.sidst >= efter).sort((a, b) => a.sidst - b.sidst)
        .map(({ klient, spil, navn }) => ({ klient, spil, navn }));
    },
    async starterPrSpil(fraDag) {
      const ud = {};
      for (const [k, n] of starter) { const [spil, dag] = k.split('|'); if (!fraDag || dag >= fraDag) ud[spil] = (ud[spil] || 0) + n; }
      return ud;
    },
  };
}

/** Minimal højscore-lager: kun top() bruges af oversigten. */
function huskHs(rows = []) {
  return {
    async top(spil, n, retning) {
      const tegn = retning === 'asc' ? 1 : -1;
      return rows.filter(r => r.spil === spil).sort((a, b) => tegn * (a.score - b.score)).slice(0, n);
    },
  };
}

const BASE = 'https://zydy.dk';
const NU = Date.UTC(2026, 8, 12, 12, 0, 0);
const post = (sti, krop, akt, nu = NU) => haandterAktivitet(new Request(BASE + sti, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: typeof krop === 'string' ? krop : JSON.stringify(krop),
}), akt, huskHs(), nu);
const oversigt = (akt, hs, nu = NU, mig = null) =>
  haandterAktivitet(new Request(BASE + '/api/oversigt' + (mig ? '?mig=' + mig : '')), akt, hs, nu);

test('andre stier giver null, så højscore-API og filer overtager', async () => {
  assert.equal(await haandterAktivitet(new Request(BASE + '/'), huskAktivitet(), huskHs()), null);
  assert.equal(await haandterAktivitet(new Request(BASE + '/api/highscore/taarn'), huskAktivitet(), huskHs()), null);
  assert.equal(await haandterAktivitet(new Request(BASE + '/api/noget'), huskAktivitet(), huskHs()), null);
});

test('kendte spil: forsidens plus alle med topliste; topNoegle finder tilstanden', () => {
  const s = kendteSpil();
  for (const x of ['ordle', 'taltraef', 'imposter', 'klaver', 'taarn', 'saet', 'dybet', 'stenalder']) assert.ok(s.includes(x), x);
  assert.equal(topNoegle('taarn'), 'taarn');
  assert.equal(topNoegle('saet'), 'saet-klassisk', 'første tilstand bruges til rekordholderen');
  // Ordle bor et andet sted, men har alligevel en topliste: forsiden tæller selv
  // dage i træk og sender dem ind (public/ordle.js). Taltræf har ingen.
  assert.equal(topNoegle('ordle'), 'ordle');
  assert.equal(topNoegle('taltraef'), null, 'Taltræf har ingen topliste her');
  assert.equal(rensKlient('abc123'), 'abc123');
  assert.equal(rensKlient('ABC'), null);
  assert.equal(rensKlient('a'.repeat(41)), null);
  assert.equal(rensKlient(42), null);
  // Forsiden er ikke et kort, men må godt melde til – ellers kunne man ikke se
  // dem der bare står på zydy.dk uden at spille.
  assert.equal(s.includes(FORSIDEN), false, 'forsiden er ikke et spil på listen');
  assert.equal(maaTaelles(FORSIDEN), true);
  assert.equal(maaTaelles('taarn'), true);
  assert.equal(maaTaelles('findesikke'), false);
});

test('tael: samme navn i to faner er én person, folk uden navn tæller stadig med', () => {
  assert.deepEqual(tael([]), { antal: 0, navne: [] });
  assert.deepEqual(tael([{ navn: 'Sofie' }, { navn: 'Sofie' }]), { antal: 1, navne: ['Sofie'] },
    'iPad og telefon med samme navn er én person');
  assert.deepEqual(tael([{ navn: 'Sofie' }, { navn: null }, { navn: 'Selma' }, { navn: '' }]),
    { antal: 4, navne: ['Sofie', 'Selma'] }, 'de anonyme tæller med, men har intet navn at vise');
});

test('ukendt spil giver 404, GET giver 405, ikke-JSON giver 400', async () => {
  const akt = huskAktivitet();
  assert.equal((await post('/api/aktivitet/ukendt', { ny: true }, akt)).status, 404);
  assert.equal((await haandterAktivitet(new Request(BASE + '/api/aktivitet/taarn'), akt, huskHs())).status, 405);
  assert.equal((await post('/api/aktivitet/taarn', '{ikke json', akt)).status, 400);
  assert.equal(akt.starter.size, 0);
});

test('ny: true tæller en start pr. dag; heartbeat uden ny tæller ikke', async () => {
  const akt = huskAktivitet();
  await post('/api/aktivitet/taarn', { ny: true, klient: 'klient1' }, akt);
  await post('/api/aktivitet/taarn', { ny: true }, akt);                       // tryk på forsiden (uden klient)
  await post('/api/aktivitet/taarn', { klient: 'klient1' }, akt, NU + 30_000); // heartbeat
  await post('/api/aktivitet/taarn', { ny: true }, akt, NU + 86_400_000);      // dagen efter
  assert.equal(akt.starter.get('taarn|2026-09-12'), 2);
  assert.equal(akt.starter.get('taarn|2026-09-13'), 1);
});

test('aktive: tæller klienter pr. spil, glemmer dem efter timeout og ved slut', async () => {
  const akt = huskAktivitet();
  let svar = await (await post('/api/aktivitet/taarn', { ny: true, klient: 'klient1' }, akt)).json();
  assert.deepEqual(svar, { ok: true, aktive: 1 });
  svar = await (await post('/api/aktivitet/taarn', { ny: true, klient: 'klient2' }, akt, NU + 1000)).json();
  assert.equal(svar.aktive, 2);
  svar = await (await post('/api/aktivitet/dybet', { ny: true, klient: 'klient3' }, akt, NU + 2000)).json();
  assert.equal(svar.aktive, 1, 'Dybet har kun én');
  // Samme klient skifter spil: flytter med, tæller ikke dobbelt
  svar = await (await post('/api/aktivitet/dybet', { klient: 'klient1' }, akt, NU + 3000)).json();
  assert.equal(svar.aktive, 2);
  assert.equal((await akt.aktiveNu(0)).filter(r => r.spil === 'taarn').length, 1);
  // Slut fjerner
  svar = await (await post('/api/aktivitet/dybet', { klient: 'klient1', slut: true }, akt, NU + 4000)).json();
  assert.equal(svar.aktive, 1);
  // Timeout: klient2 (sidst set NU+1000) er væk efter 90 sek.
  svar = await (await post('/api/aktivitet/taarn', { klient: 'klient9' }, akt, NU + 1000 + AKTIV_TIMEOUT_MS + 1)).json();
  assert.equal(svar.aktive, 1, 'kun klient9 er tilbage i Tårn');
  assert.equal(akt.aktive.has('klient2'), false, 'gamle rækker ryddes');
  // Ugyldigt klient-id ignoreres, men starten tælles stadig
  svar = await (await post('/api/aktivitet/taarn', { ny: true, klient: 'Ugyldigt Navn!' }, akt, NU + 200_000)).json();
  assert.equal(svar.ok, true);
  assert.equal(akt.aktive.has('Ugyldigt Navn!'), false);
});

test('oversigt: starter i alt og seneste 30 dage, aktive og rekordholder pr. spil', async () => {
  const akt = huskAktivitet();
  const dag = ms => new Date(ms).toISOString().slice(0, 10);
  await akt.taelStart('taarn', dag(NU)); await akt.taelStart('taarn', dag(NU));
  await akt.taelStart('taarn', dag(NU - 40 * 86_400_000));       // for gammel til "nylig"
  await akt.taelStart('saet', dag(NU - 29 * 86_400_000));        // lige inden for 30 dage
  await akt.markerAktiv('k1', 'taarn', NU - 10_000);
  await akt.markerAktiv('k2', 'taarn', NU - 100_000);            // for gammel
  const hs = huskHs([
    { spil: 'taarn', id: 1, navn: 'Sofie', score: 40 }, { spil: 'taarn', id: 2, navn: 'Simon', score: 55 },
    { spil: 'saet-klassisk', id: 3, navn: 'Mor', score: 300 }, { spil: 'saet-klassisk', id: 4, navn: 'Far', score: 120 },
  ]);
  const r = await oversigt(akt, hs);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('cache-control'), 'no-store');
  const { spil } = await r.json();
  assert.deepEqual(spil.taarn, { starter: 3, nylig: 2, aktive: 1, navne: [], top: { navn: 'Simon', score: 55, retning: 'desc', noegle: 'taarn' } });
  assert.deepEqual(spil.saet, { starter: 1, nylig: 1, aktive: 0, navne: [], top: { navn: 'Far', score: 120, retning: 'asc', noegle: 'saet-klassisk' } }, 'laveste tid vinder i Sæt');
  assert.deepEqual(spil.ordle, { starter: 0, nylig: 0, aktive: 0, navne: [], top: null });
  assert.deepEqual(spil.dybet.top, null, 'ingen på listen endnu');
  assert.equal((await haandterAktivitet(new Request(BASE + '/api/oversigt', { method: 'POST' }), akt, hs)).status, 405);
});

test('navnet følger med livstegnet og kommer med ud i oversigten', async () => {
  const akt = huskAktivitet();
  await post('/api/aktivitet/taarn', { klient: 'klienta', navn: '  Sofie  ' }, akt);
  await post('/api/aktivitet/taarn', { klient: 'klientb', navn: 'Selma' }, akt, NU + 100);
  await post('/api/aktivitet/dybet', { klient: 'klientc' }, akt, NU + 200);          // gæst uden navn
  const { spil } = await (await oversigt(akt, huskHs())).json();
  assert.deepEqual(spil.taarn.navne, ['Sofie', 'Selma'], 'navnet renses som på toplisten');
  assert.equal(spil.taarn.aktive, 2);
  assert.deepEqual(spil.dybet, { starter: 0, nylig: 0, aktive: 1, navne: [], top: null },
    'uden navn tæller man med, men står ikke på listen');
  // Skifter man navn undervejs, følger rækken med (samme klient, ny værdi).
  await post('/api/aktivitet/taarn', { klient: 'klienta', navn: 'Sofia' }, akt, NU + 300);
  const igen = await (await oversigt(akt, huskHs(), NU + 300)).json();
  assert.deepEqual(igen.spil.taarn.navne, ['Selma', 'Sofia'], 'nyeste livstegn står sidst');
});

test('her: alle på zydy.dk, også dem på forsiden – og man tæller ikke sig selv med', async () => {
  const akt = huskAktivitet();
  await post('/api/aktivitet/' + FORSIDEN, { ny: true, klient: 'klientmig', navn: 'Simon' }, akt);
  await post('/api/aktivitet/' + FORSIDEN, { klient: 'klientfar', navn: 'Far' }, akt, NU + 100);
  await post('/api/aktivitet/taarn', { ny: true, klient: 'klientsof', navn: 'Sofie' }, akt, NU + 200);
  await post('/api/aktivitet/taarn', { klient: 'klientgst' }, akt, NU + 300);        // gæst uden navn

  const alle = await (await oversigt(akt, huskHs(), NU + 300)).json();
  assert.deepEqual(alle.her, { antal: 4, navne: ['Simon', 'Far', 'Sofie'] }, 'forsidens folk tæller med');
  assert.equal(alle.spil.taarn.aktive, 2, 'kun spillets egne står på kortet');
  assert.equal(alle.spil.forsiden, undefined, 'forsiden er ikke et kort');

  const uden = await (await oversigt(akt, huskHs(), NU + 300, 'klientmig')).json();
  assert.deepEqual(uden.her, { antal: 3, navne: ['Far', 'Sofie'] }, 'man ser ikke sig selv som gæst');
  const ukendtMig = await (await oversigt(akt, huskHs(), NU + 300, 'Ugyldigt!')).json();
  assert.equal(ukendtMig.her.antal, 4, 'et ugyldigt mig-id filtrerer ingenting fra');
});
