// Aktivitet for spillene på zydy.dk: hvor tit et spil startes, og hvem der
// spiller lige nu. Samme opbygning som src/highscore.mjs: ren validering, et
// D1-lager og en request-håndtering, så det kan testes med et hukommelses-lager
// (test/unit/aktivitet.test.mjs).
//
//   POST /api/aktivitet/<spil>   body { klient?, ny?, slut? }
//        ny: true   → tæller én start af spillet (sendes én gang pr. sideindlæsning)
//        klient     → markerer klienten som aktiv i spillet lige nu (heartbeat hvert 30. sek.)
//        slut: true → fjerner klienten igen (siden lukkes)
//        → { ok: true, aktive }   (antal aktive i dette spil lige nu)
//
//   GET  /api/oversigt
//        → { spil: { taarn: { starter, nylig, aktive, top: { navn, score, retning } | null }, … } }
//        Forsiden bruger det til at sortere kortene efter popularitet, vise
//        "spiller nu" og rekordholderen. `starter` er alle starter nogensinde,
//        `nylig` de sidste 30 dage.
//
// Klienten er public/spil/aktivitet.js. Apps på andre domæner (Ordle, Taltræf,
// Imposter, KlaverLær) kan ikke sende heartbeats herfra; for dem tæller
// forsiden et tryk på kortet som en start.
import { SPIL as HS_SPIL, reglerFor } from './highscore.mjs';

/** Spil på forsiden der må tælles. Spil med topliste (SPIL i highscore.mjs) er automatisk med. */
export const FORSIDE_SPIL = ['ordle', 'taltraef', 'imposter', 'klaver',
  'taarn', 'saet', 'farvesortering', 'ordstige', 'duel', 'helteriget', 'stenalder', 'dybet', 'kryds'];

export const AKTIV_TIMEOUT_MS = 90_000;   // uden heartbeat i 90 sek. regnes man for gået (klienten sender hvert 30. sek.)
export const NYLIG_DAGE = 30;

/** Højscore-nøglen for et spil på forsiden: samme navn, eller første tilstand (saet → saet-klassisk). */
export function topNoegle(spil) {
  if (HS_SPIL[spil]) return spil;
  return Object.keys(HS_SPIL).find(k => k.startsWith(spil + '-')) || null;
}

/** Alle spil der kan tælles: forsidens plus dem med topliste (så et nyt spil i SPIL virker uden videre). */
export function kendteSpil() {
  const s = new Set(FORSIDE_SPIL);
  for (const k of Object.keys(HS_SPIL)) s.add(k.split('-')[0]);
  return [...s];
}

export const rensKlient = k => (typeof k === 'string' && /^[a-z0-9]{6,40}$/.test(k)) ? k : null;
export const dagFor = ms => new Date(ms).toISOString().slice(0, 10);   // UTC-døgn, kun til optælling

/* ---------- Lager ---------- */

/** D1-udgaven. Testens hukommelses-udgave har de samme metoder. */
export function d1Aktivitet(db) {
  return {
    async taelStart(spil, dag) {
      await db.prepare('INSERT INTO starter (spil, dag, antal) VALUES (?1, ?2, 1) ON CONFLICT(spil, dag) DO UPDATE SET antal = antal + 1')
        .bind(spil, dag).run();
    },
    async markerAktiv(klient, spil, nu) {
      await db.prepare('INSERT INTO aktive (klient, spil, sidst) VALUES (?1, ?2, ?3) ON CONFLICT(klient) DO UPDATE SET spil = excluded.spil, sidst = excluded.sidst')
        .bind(klient, spil, nu).run();
    },
    async fjernAktiv(klient) {
      await db.prepare('DELETE FROM aktive WHERE klient = ?1').bind(klient).run();
    },
    async rydAktive(foer) {
      await db.prepare('DELETE FROM aktive WHERE sidst < ?1').bind(foer).run();
    },
    /** { spil: antal } for klienter set efter `efter`. */
    async aktivePrSpil(efter) {
      const r = await db.prepare('SELECT spil, COUNT(*) AS n FROM aktive WHERE sidst >= ?1 GROUP BY spil').bind(efter).all();
      return Object.fromEntries(r.results.map(x => [x.spil, x.n]));
    },
    /** { spil: antal starter } fra og med dagen `fraDag` (udelades: alle). */
    async starterPrSpil(fraDag) {
      const r = fraDag
        ? await db.prepare('SELECT spil, SUM(antal) AS n FROM starter WHERE dag >= ?1 GROUP BY spil').bind(fraDag).all()
        : await db.prepare('SELECT spil, SUM(antal) AS n FROM starter GROUP BY spil').all();
      return Object.fromEntries(r.results.map(x => [x.spil, x.n]));
    },
  };
}

/* ---------- API ---------- */

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});
const fejl = (status, besked) => json({ ok: false, fejl: besked }, status);

/**
 * Håndterer /api/aktivitet/<spil> og /api/oversigt. `akt` er d1Aktivitet(env.DB),
 * `hs` er højscorens lager (til rekordholderen). `nu` kan gives i tests.
 * Returnerer null for alle andre stier.
 */
export async function haandterAktivitet(request, akt, hs, nu = Date.now()) {
  const url = new URL(request.url);

  if (url.pathname === '/api/oversigt') {
    if (request.method !== 'GET') return fejl(405, 'Brug GET');
    const fraDag = dagFor(nu - (NYLIG_DAGE - 1) * 86_400_000);
    const spil = kendteSpil();
    const [starter, nylig, aktive, tops] = await Promise.all([
      akt.starterPrSpil(),
      akt.starterPrSpil(fraDag),
      akt.aktivePrSpil(nu - AKTIV_TIMEOUT_MS),
      Promise.all(spil.map(async s => {
        const k = topNoegle(s);
        if (!k) return null;
        const regler = reglerFor(k);
        const [top] = await hs.top(k, 1, regler.retning);
        return top ? { navn: top.navn, score: top.score, retning: regler.retning, noegle: k } : null;
      })),
    ]);
    const ud = {};
    spil.forEach((s, i) => {
      ud[s] = { starter: starter[s] || 0, nylig: nylig[s] || 0, aktive: aktive[s] || 0, top: tops[i] };
    });
    return json({ spil: ud });
  }

  const m = url.pathname.match(/^\/api\/aktivitet\/([a-z0-9]{1,32})\/?$/);
  if (!m) return null;
  const spil = m[1];
  if (!kendteSpil().includes(spil)) return fejl(404, 'Ukendt spil');
  if (request.method !== 'POST') return fejl(405, 'Brug POST');

  let krop;
  try { krop = await request.json(); } catch (e) { return fejl(400, 'Kroppen skal være JSON'); }
  krop = krop && typeof krop === 'object' ? krop : {};
  const klient = rensKlient(krop.klient);

  if (krop.ny === true) await akt.taelStart(spil, dagFor(nu));
  if (klient) {
    if (krop.slut === true) await akt.fjernAktiv(klient);
    else await akt.markerAktiv(klient, spil, nu);
  }
  await akt.rydAktive(nu - AKTIV_TIMEOUT_MS);   // hold tabellen lille
  const aktive = await akt.aktivePrSpil(nu - AKTIV_TIMEOUT_MS);
  return json({ ok: true, aktive: aktive[spil] || 0 });
}
