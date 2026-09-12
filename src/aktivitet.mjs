// Aktivitet for spillene på zydy.dk: hvor tit et spil startes, og hvem der er
// på siden lige nu. Samme opbygning som src/highscore.mjs: ren validering, et
// D1-lager og en request-håndtering, så det kan testes med et hukommelses-lager
// (test/unit/aktivitet.test.mjs).
//
//   POST /api/aktivitet/<spil>   body { klient?, navn?, ny?, slut? }
//        <spil>     → et spil, eller 'forsiden' for dem der står på zydy.dk uden at spille
//        ny: true   → tæller én start af spillet (sendes én gang pr. sideindlæsning)
//        klient     → markerer klienten som aktiv i spillet lige nu (heartbeat hvert 30. sek.)
//        navn       → spillerens navn fra localStorage ('zydy.navn'), så de andre kan se hvem der er her
//        slut: true → fjerner klienten igen (siden lukkes)
//        → { ok: true, aktive }   (antal aktive i dette spil lige nu)
//
//   GET  /api/oversigt[?mig=<klient>]
//        → { spil: { taarn: { starter, nylig, aktive, navne, top: {…} | null }, … },
//            her:  { antal, navne } }
//        Forsiden bruger det til at sortere kortene efter popularitet, vise hvem
//        der spiller hvad, og hvem der er på siden i det hele taget. `starter` er
//        alle starter nogensinde, `nylig` de sidste 30 dage. `her` tæller alle —
//        både dem inde i et spil og dem der bare står på forsiden. `mig` er ens
//        eget klient-id og udelades af tællingen, så man ikke ser sig selv som gæst.
//
// Navnene er dem børnene selv har skrevet på forsiden, og de står i forvejen
// offentligt på toplisterne. De ligger kun i den flygtige `aktive`-tabel og er
// glemt 90 sekunder efter man lukker siden.
//
// Klienten er public/spil/aktivitet.js. Apps på andre domæner (Ordle, Taltræf,
// Imposter, KlaverLær) kan ikke sende heartbeats herfra; for dem tæller
// forsiden et tryk på kortet som en start.
import { SPIL as HS_SPIL, reglerFor, rensNavn } from './highscore.mjs';
import { KORT } from './spil-data.mjs';

/** Spil på forsiden der må tælles — alle kort, i forsidens rækkefølge. Listen
 *  er genereret ud fra public/spil/<id>/kort.json, så et nyt kort tæller med
 *  af sig selv. */
export const FORSIDE_SPIL = KORT.map(k => k.id);

export const AKTIV_TIMEOUT_MS = 90_000;   // uden heartbeat i 90 sek. regnes man for gået (klienten sender hvert 30. sek.)
export const NYLIG_DAGE = 30;

/** "Spillet" man er i, når man bare står på forsiden. Det er ikke et kort, så det
 *  får ingen plads i oversigtens `spil` – kun i `her`. */
export const FORSIDEN = 'forsiden';

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

/** Må der meldes aktivitet for dette id? Kendte spil – og forsiden selv. */
export const maaTaelles = spil => spil === FORSIDEN || kendteSpil().includes(spil);

export const rensKlient = k => (typeof k === 'string' && /^[a-z0-9]{6,40}$/.test(k)) ? k : null;
export const dagFor = ms => new Date(ms).toISOString().slice(0, 10);   // UTC-døgn, kun til optælling

/**
 * Tæller en flok aktive rækker: hvor mange personer, og hvilke navne vi kender.
 * Samme navn i to faner (iPad og telefon) er én person; rækker uden navn tæller
 * hver for sig, så en gæst der ikke har skrevet sit navn stadig er med i tallet.
 */
export function tael(raekker) {
  const navne = [];
  let antal = 0;
  for (const r of raekker) {
    if (r.navn) {
      if (navne.includes(r.navn)) continue;
      navne.push(r.navn);
    }
    antal++;
  }
  return { antal, navne };
}

/* ---------- Lager ---------- */

/** D1-udgaven. Testens hukommelses-udgave har de samme metoder. */
export function d1Aktivitet(db) {
  return {
    async taelStart(spil, dag) {
      await db.prepare('INSERT INTO starter (spil, dag, antal) VALUES (?1, ?2, 1) ON CONFLICT(spil, dag) DO UPDATE SET antal = antal + 1')
        .bind(spil, dag).run();
    },
    async markerAktiv(klient, spil, nu, navn = null) {
      await db.prepare('INSERT INTO aktive (klient, spil, sidst, navn) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(klient) DO UPDATE SET spil = excluded.spil, sidst = excluded.sidst, navn = excluded.navn')
        .bind(klient, spil, nu, navn).run();
    },
    async fjernAktiv(klient) {
      await db.prepare('DELETE FROM aktive WHERE klient = ?1').bind(klient).run();
    },
    async rydAktive(foer) {
      await db.prepare('DELETE FROM aktive WHERE sidst < ?1').bind(foer).run();
    },
    /** Én række pr. klient set efter `efter`: [{ klient, spil, navn }]. Der er
     *  højst en håndfuld ad gangen (rækkerne udløber efter 90 sek.), så det er
     *  billigere at tælle dem her end at bede databasen gruppere to gange. */
    async aktiveNu(efter) {
      const r = await db.prepare('SELECT klient, spil, navn FROM aktive WHERE sidst >= ?1 ORDER BY sidst ASC').bind(efter).all();
      return r.results;
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
    const mig = rensKlient(url.searchParams.get('mig'));   // den der spørger, tæller ikke sig selv med
    const [starter, nylig, alleAktive, tops] = await Promise.all([
      akt.starterPrSpil(),
      akt.starterPrSpil(fraDag),
      akt.aktiveNu(nu - AKTIV_TIMEOUT_MS),
      Promise.all(spil.map(async s => {
        const k = topNoegle(s);
        if (!k) return null;
        const regler = reglerFor(k);
        const [top] = await hs.top(k, 1, regler.retning);
        return top ? { navn: top.navn, score: top.score, retning: regler.retning, noegle: k } : null;
      })),
    ]);
    const aktive = alleAktive.filter(r => r.klient !== mig);
    const ud = {};
    spil.forEach((s, i) => {
      const { antal, navne } = tael(aktive.filter(r => r.spil === s));
      ud[s] = { starter: starter[s] || 0, nylig: nylig[s] || 0, aktive: antal, navne, top: tops[i] };
    });
    // `her` er alle på zydy.dk – både dem i et spil og dem der står på forsiden.
    return json({ spil: ud, her: tael(aktive) });
  }

  const m = url.pathname.match(/^\/api\/aktivitet\/([a-z0-9]{1,32})\/?$/);
  if (!m) return null;
  const spil = m[1];
  if (!maaTaelles(spil)) return fejl(404, 'Ukendt spil');
  if (request.method !== 'POST') return fejl(405, 'Brug POST');

  let krop;
  try { krop = await request.json(); } catch (e) { return fejl(400, 'Kroppen skal være JSON'); }
  krop = krop && typeof krop === 'object' ? krop : {};
  const klient = rensKlient(krop.klient);
  const navn = rensNavn(krop.navn);   // samme rensning som på toplisten; uden navn er man med som anonym

  if (krop.ny === true) await akt.taelStart(spil, dagFor(nu));
  if (klient) {
    if (krop.slut === true) await akt.fjernAktiv(klient);
    else await akt.markerAktiv(klient, spil, nu, navn);
  }
  await akt.rydAktive(nu - AKTIV_TIMEOUT_MS);   // hold tabellen lille
  const aktive = await akt.aktiveNu(nu - AKTIV_TIMEOUT_MS);
  return json({ ok: true, aktive: tael(aktive.filter(r => r.spil === spil)).antal });
}
