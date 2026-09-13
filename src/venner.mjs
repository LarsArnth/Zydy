// Venner på zydy.dk: man kan spørge en anden, om de skal være venner, og når
// den anden siger ja, kan man se hinanden på forsiden — hvem der er her lige nu,
// og hvad de spiller.
//
//   GET  /api/venner?navn=Sofie
//        → { ok: true, navn, venner: [{navn}], venter: [{navn}], sendt: [{navn}], kendte: [navn, …] }
//        venter  = de har spurgt mig, og jeg skal svare
//        sendt   = jeg har spurgt dem, og de har ikke svaret endnu
//        kendte  = andre navne vi har set på siden (toplisterne + dem der er her nu),
//                  minus mig selv og dem jeg allerede har et forhold til
//
//   POST /api/venner   body { navn, ven, handling }
//        handling 'spoerg' (standard) → spørg om I skal være venner. Har den
//                 anden allerede spurgt mig, bliver vi venner med det samme.
//        handling 'ja'                → sig ja til en der har spurgt mig
//        handling 'nej'               → sig nej tak, eller fjern en ven igen
//        → { ok: true, status: 'venner' | 'sendt' | 'væk', …samme felter som GET }
//
// Der er ingen login på zydy.dk — man er det navn, man har skrevet på forsiden
// ('zydy.navn'). Så et venskab er en aftale mellem to navne, ikke mellem to
// konti, og det er med vilje: siden er familiens egen, og navnene står i
// forvejen på toplisterne. Værnet mod pjat er, at *begge* skal sige ja, at man
// ikke kan være ven med sig selv, og at ingen kan have mere end VENNER_MAKS
// rækker. Skulle der komme skrald ind, så ryd op med
//   npx wrangler@4 d1 execute zydy-highscore --remote --command "DELETE FROM venner WHERE fra='pjat'"
//
// Samme opbygning som src/highscore.mjs, src/aktivitet.mjs og src/ideer.mjs:
// ren validering, et D1-lager og en request-håndtering, så det kan testes uden
// Cloudflare (test/unit/venner.test.mjs bytter D1 ud med et hukommelses-lager).
import { rensNavn } from './highscore.mjs';

export const VENNER_MAKS = 50;        // hvor mange venner + ubesvarede spørgsmål én person må have
export const KENDTE_MAKS = 30;        // hvor mange navne "Find en ven" foreslår

/** Nøglen et navn kendes på: små bogstaver, så "Sofie" og "sofie" er samme person. */
export const noegle = navn => navn.toLocaleLowerCase('da-DK');

/**
 * Validerer de to navne i en forespørgsel.
 * Returnerer { mig, dig } (rensede navne) eller { fejl } med en besked, der kan vises.
 */
export function rensPar(migRaa, digRaa) {
  const mig = rensNavn(migRaa);
  if (!mig) return { fejl: 'Skriv dit navn først' };
  const dig = rensNavn(digRaa);
  if (!dig) return { fejl: 'Hvem vil du være venner med?' };
  if (noegle(mig) === noegle(dig)) return { fejl: 'Du er allerede venner med dig selv' };
  return { mig, dig };
}

/** Den andens navn i en række, set fra `k` (som er en nøgle). */
const modpart = (r, k) => (r.fra === k ? r.tilNavn : r.fraNavn);

/**
 * Deler en persons rækker op i de tre lister forsiden viser.
 * `raekker` er alle rækker hvor personen indgår, `k` er personens nøgle.
 */
export function sorterRaekker(raekker, k) {
  const venner = [], venter = [], sendt = [];
  for (const r of raekker) {
    const navn = modpart(r, k);
    if (r.svaret) venner.push({ navn });
    else if (r.til === k) venter.push({ navn });     // de har spurgt mig
    else sendt.push({ navn });                       // jeg har spurgt dem
  }
  const efterNavn = (a, b) => a.navn.localeCompare(b.navn, 'da-DK');
  return { venner: venner.sort(efterNavn), venter, sendt: sendt.sort(efterNavn) };
}

/* ---------- Lager ---------- */

/** D1-udgaven. Testens hukommelses-udgave (huskVenner i test/api-mock.mjs) har de samme metoder. */
export function d1Venner(db) {
  const raekke = r => ({ fra: r.fra, til: r.til, fraNavn: r.fra_navn, tilNavn: r.til_navn, svaret: r.svaret });
  return {
    /** Alle rækker hvor personen indgår – både venner og ubesvarede spørgsmål. */
    async mine(k) {
      const r = await db.prepare('SELECT fra, til, fra_navn, til_navn, svaret FROM venner WHERE fra = ?1 OR til = ?1 ORDER BY oprettet ASC')
        .bind(k).all();
      return r.results.map(raekke);
    },
    /** Rækken mellem to personer, uanset hvem der spurgte – eller null. */
    async par(a, b) {
      const r = await db.prepare('SELECT fra, til, fra_navn, til_navn, svaret FROM venner WHERE (fra = ?1 AND til = ?2) OR (fra = ?2 AND til = ?1)')
        .bind(a, b).first();
      return r ? raekke(r) : null;
    },
    async spoerg(fra, til, fraNavn, tilNavn) {
      await db.prepare('INSERT OR IGNORE INTO venner (fra, til, fra_navn, til_navn) VALUES (?1, ?2, ?3, ?4)')
        .bind(fra, til, fraNavn, tilNavn).run();
    },
    /** Siger ja: sætter tidsstemplet, og retter samtidig det navn den anden kender os under. */
    async sigJa(fra, til, tilNavn) {
      await db.prepare("UPDATE venner SET svaret = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), til_navn = ?3 WHERE fra = ?1 AND til = ?2 AND svaret IS NULL")
        .bind(fra, til, tilNavn).run();
    },
    async slet(a, b) {
      await db.prepare('DELETE FROM venner WHERE (fra = ?1 AND til = ?2) OR (fra = ?2 AND til = ?1)').bind(a, b).run();
    },
    /** Navne vi har set på siden: toplisterne og dem der er her lige nu, nyeste først. */
    async kendteNavne() {
      const [s, a] = await Promise.all([
        db.prepare('SELECT navn FROM scores ORDER BY id DESC LIMIT 300').all(),
        db.prepare('SELECT navn FROM aktive WHERE navn IS NOT NULL ORDER BY sidst DESC').all(),
      ]);
      return [...a.results, ...s.results].map(r => r.navn).filter(Boolean);
    },
  };
}

/* ---------- API ---------- */

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});
const fejl = (status, besked) => json({ ok: false, fejl: besked }, status);

/** Bygger svaret til én person: de tre lister plus forslag til nye venner. */
async function status(lager, navn, ekstra = {}) {
  const k = noegle(navn);
  const raekker = await lager.mine(k);
  const lister = sorterRaekker(raekker, k);

  // Forslag: navne vi har set, minus mig selv og alle jeg allerede har et forhold til.
  const optaget = new Set([k, ...raekker.map(r => noegle(modpart(r, k)))]);
  const kendte = [];
  for (const n of await lager.kendteNavne()) {
    const nk = noegle(n);
    if (optaget.has(nk)) continue;
    optaget.add(nk);
    kendte.push(n);
    if (kendte.length >= KENDTE_MAKS) break;
  }

  return json({ ok: true, navn, ...lister, kendte, ...ekstra });
}

/**
 * Håndterer /api/venner. `lager` er d1Venner(env.DB) i drift og en
 * hukommelses-udgave i tests. `beskeder` er beskedlageret (src/beskeder.mjs),
 * som bruges til at rydde samtalen, når et venskab fjernes — den må gerne
 * udelades, så venskaberne kan testes for sig.
 * Returnerer null hvis stien ikke er API'ets.
 */
export async function haandterVenner(request, lager, beskeder = null) {
  const url = new URL(request.url);
  if (url.pathname !== '/api/venner' && url.pathname !== '/api/venner/') return null;

  if (request.method === 'GET') {
    const navn = rensNavn(url.searchParams.get('navn'));
    if (!navn) return fejl(400, 'Skriv dit navn først');
    return status(lager, navn);
  }
  if (request.method !== 'POST') return fejl(405, 'Brug GET eller POST');

  let krop;
  try { krop = await request.json(); } catch (e) { return fejl(400, 'Kroppen skal være JSON'); }
  krop = krop && typeof krop === 'object' ? krop : {};

  const { mig, dig, fejl: galt } = rensPar(krop.navn, krop.ven);
  if (galt) return fejl(400, galt);
  const [a, b] = [noegle(mig), noegle(dig)];
  const handling = ['spoerg', 'ja', 'nej'].includes(krop.handling) ? krop.handling : 'spoerg';
  const par = await lager.par(a, b);

  if (handling === 'nej') {
    // Samme knap siger nej tak til et spørgsmål og fjerner en ven igen – i begge
    // tilfælde skal rækken bare væk, og så kan man spørge forfra en anden dag.
    // Det, de to har skrevet til hinanden, følger med ud: man skal kunne gøre
    // rent efter sig, og en samtale uden et venskab kan ingen af dem læse.
    if (par) await lager.slet(a, b);
    // (nøglen er den samme som samtaleNoegle() i src/beskeder.mjs – skrevet ud
    //  her, så venner.mjs ikke skal importere beskeder.mjs, som selv bruger os)
    if (beskeder) await beskeder.sletSamtale([a, b].sort().join('|'));
    return status(lager, mig, { status: 'væk' });
  }

  if (par && par.svaret) return status(lager, mig, { status: 'venner' });   // allerede venner
  if (par && par.til === a) {                                              // de har spurgt mig
    await lager.sigJa(par.fra, par.til, mig);
    return status(lager, mig, { status: 'venner' });
  }
  if (handling === 'ja') return fejl(400, dig + ' har ikke spurgt dig');
  if (par) return status(lager, mig, { status: 'sendt' });                 // jeg har allerede spurgt

  const mine = await lager.mine(a);
  if (mine.length >= VENNER_MAKS) return fejl(400, 'Du har rigeligt med venner');
  const dine = await lager.mine(b);
  if (dine.length >= VENNER_MAKS) return fejl(400, dig + ' har rigeligt med venner');

  await lager.spoerg(a, b, mig, dig);
  return status(lager, mig, { status: 'sendt' });
}
