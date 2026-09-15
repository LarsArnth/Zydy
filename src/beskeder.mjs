// Beskeder på zydy.dk: to venner kan skrive sammen på forsiden.
//
// Venner kan i forvejen se hinanden (src/venner.mjs) og spille sammen
// (src/rum.mjs). Her kan de også *skrive* til hinanden — en lille chat pr. par
// venner, som står på forsiden og ikke andre steder.
//
//   GET  /api/beskeder?navn=Sofie&set=selma:42,far:7
//        → { ok: true, navn, nye, samtaler: [{ ven, sidst: { id, navn, mig, tekst, tid }, nye }] }
//        `set` er det, telefonen sidst har læst (ven:id, adskilt af komma), så
//        serveren kan tælle, hvor meget der er kommet til siden da.
//
//   GET  /api/beskeder?navn=Sofie&ven=Selma&efter=42
//        → { ok: true, navn, ven, beskeder: [{ id, navn, mig, tekst, tid }] }
//        `efter` udelades første gang; så kommer de nyeste HENT_MAKS.
//
//   POST /api/beskeder   body { navn, ven, tekst }
//        → { ok: true, besked, beskeder }     skriv en besked
//   POST /api/beskeder   body { navn, ven, handling: 'ryd' }
//        → { ok: true, beskeder: [] }         ryd samtalen (for jer begge)
//
// Værnet er det samme som resten af siden — der er hverken konti eller login, så
// man er det navn, man har skrevet på forsiden:
//
//   • man kan kun skrive med dem, man er venner med (ja begge veje), og kun
//     læse sine egne samtaler,
//   • en besked må fylde TEKST_MAKS tegn og står på én linje,
//   • man kan sende SPAM_MAKS beskeder i minuttet, så ingen kan fylde
//     databasen (eller en lillesøsters skærm) på et øjeblik,
//   • en samtale husker de nyeste SAMTALE_MAKS beskeder; resten glemmes.
//
// Hvem der har læst hvad, står *ikke* her, men på telefonen (zydy.beskeder.set,
// se public/beskeder.js) — ligesom kælenavnene. Så kan ingen se, om den anden
// har læst beskeden, og der er ikke noget at rydde op i.
//
// Samme opbygning som src/venner.mjs og src/rum.mjs: ren validering, et
// D1-lager og en request-håndtering, så det kan testes uden Cloudflare
// (test/unit/beskeder.test.mjs bytter D1 ud med et hukommelses-lager).
import { rensNavn } from './highscore.mjs';
import { noegle, rensPar } from './venner.mjs';

export const TEKST_MAKS = 200;         // hvor lang én besked må være
export const SAMTALE_MAKS = 200;       // hvor mange beskeder en samtale husker
export const HENT_MAKS = 50;           // hvor mange der sendes ned ad gangen
export const OVERSIGT_MAKS = 60;       // hvor mange samtaler oversigten tager med
export const SPAM_VINDUE_MS = 60_000;  // … og hvor tit man må skrive:
export const SPAM_MAKS = 20;           // højst så mange beskeder pr. vindue

// Grupperne (src/grupper.mjs) skriver i den samme tabel under 'gruppe|<kode>',
// så de arver trimning, længdegrænse og spam-værn. Oversigten her er kun de
// to-og-to-samtaler, så gruppesnak ikke dukker op som en «ven» med et gruppenavn.
export const GRUPPE_PRAEFIKS = 'gruppe|';

/** Nøglen på en samtale: de to navne med små bogstaver, altid i samme rækkefølge. */
export const samtaleNoegle = (a, b) => [a, b].sort().join('|');

/** Usynlige tegn, der ikke må stå i en besked: kontroltegn, zero-width og BOM. */
function usynlig(ch) {
  const c = ch.codePointAt(0);
  // Tabulator, linjeskift og vognretur får lov at slippe igennem her – de bliver
  // til et mellemrum i rensBesked. Ellers ville "to\nlinjer" blive "tolinjer".
  if (c === 9 || c === 10 || c === 13) return false;
  return c < 32 || (c >= 127 && c <= 159) || (c >= 8203 && c <= 8207) || c === 8232 || c === 8233 || c === 65279;
}

/**
 * Renser en besked: væk med de usynlige tegn, linjeskift og dobbelte mellemrum
 * bliver til ét (en besked er én linje), trim, og klip til TEKST_MAKS tegn.
 * Null, hvis der ikke er noget tilbage at sende.
 */
export function rensBesked(tekst) {
  if (typeof tekst !== 'string') return null;
  const rent = Array.from(tekst).filter(ch => !usynlig(ch)).join('').replace(/\s+/g, ' ').trim();
  if (!rent) return null;
  return Array.from(rent).slice(0, TEKST_MAKS).join('');
}

/**
 * Læser «hvad har jeg læst»-listen fra adressen: 'selma:42,far:7'
 * → { selma: 42, far: 7 }. Skrald springes over.
 */
export function laesSet(raa) {
  const ud = {};
  if (typeof raa !== 'string') return ud;
  for (const del of raa.split(',')) {
    const i = del.lastIndexOf(':');
    if (i <= 0) continue;
    const n = Number(del.slice(i + 1));
    if (Number.isInteger(n) && n >= 0) ud[noegle(del.slice(0, i).trim())] = n;
  }
  return ud;
}

/** Én besked, som den der spørger (nøglen `k`) skal se den. `navn` er afsenderen. */
export const synligBesked = (r, k) => ({
  id: r.id,
  navn: r.fraNavn,
  mig: r.fra === k,
  tekst: r.tekst,
  tid: r.oprettet,
});

/* ---------- Lager ---------- */

const TABEL = `CREATE TABLE IF NOT EXISTS beskeder (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  samtale    TEXT    NOT NULL,
  fra        TEXT    NOT NULL,
  fra_navn   TEXT    NOT NULL,
  til        TEXT    NOT NULL,
  til_navn   TEXT    NOT NULL,
  tekst      TEXT    NOT NULL,
  oprettet   INTEGER NOT NULL
)`;

/** D1-udgaven. Testens hukommelses-udgave (huskBeskeder i test/api-mock.mjs) har de samme metoder. */
export function d1Beskeder(db) {
  const FELTER = 'id, samtale, fra, fra_navn, til, til_navn, tekst, oprettet';
  const raekke = r => (r ? {
    id: r.id, samtale: r.samtale, fra: r.fra, fraNavn: r.fra_navn,
    til: r.til, tilNavn: r.til_navn, tekst: r.tekst, oprettet: r.oprettet,
  } : null);

  // Tabellen laves ved første kald i stedet for i en migrering: så virker
  // beskeder også, hvis nogen glemmer at køre schema.sql mod den rigtige
  // database. Det sker én gang pr. worker, og koster derefter ingenting.
  let klar = null;
  const sikr = () => (klar ||= (async () => {
    await db.prepare(TABEL).run();
    await db.prepare('CREATE INDEX IF NOT EXISTS beskeder_samtale ON beskeder (samtale, id)').run();
    await db.prepare('CREATE INDEX IF NOT EXISTS beskeder_fra ON beskeder (fra, oprettet)').run();
  })().catch(e => { klar = null; throw e; }));

  return {
    async gem(b) {
      await sikr();
      const r = await db.prepare(`INSERT INTO beskeder (samtale, fra, fra_navn, til, til_navn, tekst, oprettet)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7) RETURNING id`)
        .bind(b.samtale, b.fra, b.fraNavn, b.til, b.tilNavn, b.tekst, b.oprettet).first();
      // Hold samtalen kort: kun de nyeste SAMTALE_MAKS beskeder overlever.
      await db.prepare(`DELETE FROM beskeder WHERE samtale = ?1 AND id NOT IN
        (SELECT id FROM beskeder WHERE samtale = ?1 ORDER BY id DESC LIMIT ?2)`)
        .bind(b.samtale, SAMTALE_MAKS).run();
      return r.id;
    },
    /** De nyeste beskeder i en samtale (efter et id, hvis der er et) – ældste først. */
    async hent(samtale, efter, n) {
      await sikr();
      const r = await db.prepare(`SELECT ${FELTER} FROM beskeder WHERE samtale = ?1 AND id > ?2
        ORDER BY id DESC LIMIT ?3`).bind(samtale, efter, n).all();
      return r.results.map(raekke).reverse();
    },
    /**
     * Den sidste besked i hver af mine to-og-to-samtaler, nyeste først.
     * Gruppesnakken holdes udenfor (den har sin egen oversigt i src/grupper.mjs),
     * så en livlig gruppe ikke kan skubbe en vens besked ud af listen.
     */
    async sidste(k, n) {
      await sikr();
      const r = await db.prepare(`SELECT b.id, b.samtale, b.fra, b.fra_navn, b.til, b.til_navn, b.tekst, b.oprettet
        FROM beskeder b JOIN (SELECT samtale, MAX(id) AS id FROM beskeder WHERE (fra = ?1 OR til = ?1)
        AND samtale NOT LIKE '${GRUPPE_PRAEFIKS}%' GROUP BY samtale) s ON s.id = b.id
        ORDER BY b.id DESC LIMIT ?2`).bind(k, n).all();
      return r.results.map(raekke);
    },
    /** Den sidste besked i én bestemt samtale – det, en gruppe viser på brikken. */
    async sidsteI(samtale) {
      await sikr();
      return raekke(await db.prepare(`SELECT ${FELTER} FROM beskeder WHERE samtale = ?1 ORDER BY id DESC LIMIT 1`)
        .bind(samtale).first());
    },
    /** Hvor meget er der kommet i samtalen, siden telefonen sidst så efter? */
    async antalEfter(samtale, efter) {
      await sikr();
      const r = await db.prepare('SELECT COUNT(*) AS n FROM beskeder WHERE samtale = ?1 AND id > ?2')
        .bind(samtale, efter).first();
      return r ? r.n : 0;
    },
    /** Hvor mange beskeder én person har sendt siden `efter` – værnet mod spam. */
    async antalFra(fra, efter) {
      await sikr();
      const r = await db.prepare('SELECT COUNT(*) AS n FROM beskeder WHERE fra = ?1 AND oprettet >= ?2')
        .bind(fra, efter).first();
      return r ? r.n : 0;
    },
    async sletSamtale(samtale) {
      await sikr();
      await db.prepare('DELETE FROM beskeder WHERE samtale = ?1').bind(samtale).run();
    },
  };
}

/* ---------- API ---------- */

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});
const fejl = (status, besked) => json({ ok: false, fejl: besked }, status);

/** Er de to venner? Man kan kun skrive med dem, der har sagt ja begge veje. */
async function erVenner(venner, a, b) {
  const par = await venner.par(a, b);
  return !!(par && par.svaret);
}

/** Samtalen som den ene af de to ser den. */
async function samtaleSvar(lager, mig, dig, efter, ekstra = {}) {
  const k = noegle(mig);
  const raekker = await lager.hent(samtaleNoegle(k, noegle(dig)), efter, HENT_MAKS);
  return json({ ok: true, navn: mig, ven: dig, beskeder: raekker.map(r => synligBesked(r, k)), ...ekstra });
}

/**
 * Håndterer /api/beskeder. `lager` er d1Beskeder(env.DB) i drift, og `venner` er
 * venne-lageret, for man kan kun skrive med sine venner.
 * Returnerer null, hvis stien ikke er API'ets.
 */
export async function haandterBeskeder(request, lager, venner, nu = Date.now()) {
  const url = new URL(request.url);
  if (url.pathname !== '/api/beskeder' && url.pathname !== '/api/beskeder/') return null;

  /* ----- Læs ----- */
  if (request.method === 'GET') {
    const mig = rensNavn(url.searchParams.get('navn'));
    if (!mig) return fejl(400, 'Skriv dit navn først');
    const k = noegle(mig);
    const venRaa = url.searchParams.get('ven');

    if (venRaa) {
      // Én samtale: alt det, jeg ikke har set endnu.
      const { dig, fejl: galt } = rensPar(mig, venRaa);
      if (galt) return fejl(400, galt);
      if (!(await erVenner(venner, k, noegle(dig)))) return fejl(403, 'I er ikke venner endnu');
      const efter = Number(url.searchParams.get('efter'));
      return samtaleSvar(lager, mig, dig, Number.isInteger(efter) && efter > 0 ? efter : 0);
    }

    // Oversigten: den sidste besked i hver samtale, og hvor meget der er nyt.
    const set = laesSet(url.searchParams.get('set'));
    const samtaler = [];
    let nye = 0;
    for (const r of await lager.sidste(k, OVERSIGT_MAKS)) {
      const mit = r.fra === k;
      const ven = mit ? r.tilNavn : r.fraNavn;
      const sidstSet = set[noegle(ven)] || 0;
      // Kun den andens beskeder kan være «nye» – mine egne har jeg selv skrevet.
      const antal = mit || r.id <= sidstSet ? 0 : await lager.antalEfter(r.samtale, sidstSet);
      nye += antal;
      samtaler.push({ ven, sidst: synligBesked(r, k), nye: antal });
    }
    return json({ ok: true, navn: mig, nye, samtaler });
  }

  if (request.method !== 'POST') return fejl(405, 'Brug GET eller POST');

  /* ----- Skriv (eller ryd) ----- */
  let krop;
  try { krop = await request.json(); } catch (e) { return fejl(400, 'Kroppen skal være JSON'); }
  krop = krop && typeof krop === 'object' ? krop : {};

  const { mig, dig, fejl: galt } = rensPar(krop.navn, krop.ven);
  if (galt) return fejl(400, galt);
  const [a, b] = [noegle(mig), noegle(dig)];
  if (!(await erVenner(venner, a, b))) return fejl(403, 'I er ikke venner endnu');
  const samtale = samtaleNoegle(a, b);

  if (krop.handling === 'ryd') {
    // Samtalen ryddes for jer begge – det er jeres fælles.
    await lager.sletSamtale(samtale);
    return json({ ok: true, navn: mig, ven: dig, beskeder: [] });
  }

  const tekst = rensBesked(krop.tekst);
  if (!tekst) return fejl(400, 'Skriv noget først');
  if ((await lager.antalFra(a, nu - SPAM_VINDUE_MS)) >= SPAM_MAKS) return fejl(429, 'Du skriver for hurtigt – vent lidt');

  const id = await lager.gem({ samtale, fra: a, fraNavn: mig, til: b, tilNavn: dig, tekst, oprettet: nu });
  const efter = Number.isInteger(krop.efter) && krop.efter > 0 ? krop.efter : 0;
  return samtaleSvar(lager, mig, dig, efter, { id });
}
