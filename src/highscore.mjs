// Højscore-API'et for zydy.dk: validering, D1-lager og request-håndtering.
// Ligger for sig selv, fordi Workers-runtime kun tillader handler-eksporter fra
// hovedmodulet (src/worker.mjs) — og fordi det gør koden testbar uden Cloudflare
// (test/unit/highscore.test.mjs bytter D1 ud med et hukommelses-lager).
//
//   GET   /api/highscore/taarn           → { spil, retning, min, maks, unik, liste: [{ id, navn, score, oprettet }] }
//   POST  /api/highscore/taarn           body { navn, score }
//                                        → { ok: true, id, token, placering, ...regler, liste }
//                                          (uaendret: true hvis spilleren allerede stod bedre)
//   PATCH /api/highscore/taarn/<id>      body { navn, token }   – ret navnet på en række man selv har gemt
//                                        → { ok: true, id, placering, ...regler, liste }
//
// Klienten gemmer automatisk, når navnet er kendt, så hver spiller har som
// standard kun én række pr. spil (`unik`): den bedste. `token` er en hemmelighed
// klienten får ved gemning og skal vise for at rette navnet ("Ikke Sofie, der
// spiller?"). Tokens sendes aldrig med i listerne.
//
// API'et er åbent (ingen login) — det er et familie-site. Værnet mod pjat er
// derfor kun: kendte spil, fornuftige grænser og en trimning til de bedste
// 100 pr. spil. Skulle listen blive fyldt med skrald, så ryd op med
//   npx wrangler@4 d1 execute zydy-highscore --remote --command "DELETE FROM scores WHERE spil='taarn'"

/**
 * Spil der må gemme højscore. Nye spil: tilføj en linje.
 *   maks/min  – grænser for en gyldig score (min er 1, hvis den udelades)
 *   retning   – 'desc' (flest point vinder, standard) eller 'asc' (laveste tal vinder, fx tid i sekunder)
 *   unik      – kun én række pr. navn, den bedste (standard: true, fordi klienten gemmer automatisk
 *               efter hvert spil). Sæt unik: false hvis samme spiller må stå flere gange.
 * Et spil med flere tilstande bruger én nøgle pr. tilstand (saet-klassisk / saet-blitz).
 */
export const SPIL = {
  taarn: { maks: 2000 },
  dybet: { maks: 500 },                                             // score = dybde (niveau) nået
  obby: { maks: 10000, unik: true },                                // hop i træk uden at dø
  'saet-klassisk': { retning: 'asc', min: 20, maks: 3 * 3600 },   // sekunder for hele bunken
  'saet-blitz': { maks: 60 },                                       // sæt fundet på 2 minutter
  farvesortering: { maks: 10000 },                                  // højeste niveau løst
  ordstige: { maks: 5000 },                                         // dagens stige løst flest dage i træk
  duel: { retning: 'asc', min: 80, maks: 2000 },                    // hurtigste reaktion i ms (runden "Grønt lys")
  helteriget: { retning: 'asc', maks: 300 },                        // vandt på færrest ture
  stenalder: { maks: 2000 },                                        // vinderens point
};

/** Regler for et spil med standardværdier udfyldt. */
export function reglerFor(spil) {
  const r = SPIL[spil];
  return {
    retning: r.retning === 'asc' ? 'asc' : 'desc',
    min: r.min == null ? 1 : r.min,
    maks: r.maks,
    unik: r.unik !== false,
  };
}

export const LISTE_LAENGDE = 10;   // hvor mange der vises
const GEM_LAENGDE = 100;           // hvor mange der beholdes pr. spil
const NAVN_MAKS = 12;

/* ---------- Validering (ren, uden database) ---------- */

/** Usynlige tegn der ikke må indgå i et navn: kontroltegn, zero-width-tegn, linjeseparatorer og BOM. */
function usynlig(ch) {
  const c = ch.codePointAt(0);
  return c < 32 || (c >= 127 && c <= 159) || (c >= 8203 && c <= 8207) || c === 8232 || c === 8233 || c === 65279;
}

/** Renser et navn: fjerner usynlige tegn, samler mellemrum, trimmer og klipper til 12 tegn (kodepunkter). Null hvis tomt. */
export function rensNavn(navn) {
  if (typeof navn !== 'string') return null;
  const rent = Array.from(navn).filter(ch => !usynlig(ch)).join('').replace(/\s+/g, ' ').trim();
  if (!rent) return null;
  return Array.from(rent).slice(0, NAVN_MAKS).join('');
}

/** Returnerer scoren som heltal, eller null hvis den er ugyldig for spillet. */
export function rensScore(score, spil) {
  const n = typeof score === 'string' ? Number(score) : score;
  const { min, maks } = reglerFor(spil);
  if (typeof n !== 'number' || !Number.isInteger(n) || n < min || n > maks) return null;
  return n;
}

const sammeNavn = (a, b) => a.toLowerCase() === b.toLowerCase();

/* ---------- Lager ---------- */

/** Sorteringen: bedste først, ved lige score den ældste. `retning` kommer fra reglerFor(), aldrig fra klienten. */
const orderBy = retning => 'ORDER BY score ' + (retning === 'asc' ? 'ASC' : 'DESC') + ', oprettet ASC';

/** Er a bedre end b i den givne retning? */
const bedre = (a, b, retning) => retning === 'asc' ? a < b : a > b;

/** D1-udgaven af lageret. Samme seks metoder findes i testens hukommelses-udgave. */
export function d1Lager(db) {
  return {
    /** De n bedste rækker – uden token. */
    async top(spil, n, retning) {
      const r = await db.prepare(
        'SELECT id, navn, score, oprettet FROM scores WHERE spil = ?1 ' + orderBy(retning) + ' LIMIT ?2'
      ).bind(spil, n).all();
      return r.results;
    },
    async gem(spil, navn, score, retning, token) {
      const r = await db.prepare(
        'INSERT INTO scores (spil, navn, score, token) VALUES (?1, ?2, ?3, ?4) RETURNING id'
      ).bind(spil, navn, score, token).first();
      // Hold tabellen lille: kun de bedste GEM_LAENGDE pr. spil overlever.
      await db.prepare(
        'DELETE FROM scores WHERE spil = ?1 AND id NOT IN (SELECT id FROM scores WHERE spil = ?1 ' + orderBy(retning) + ' LIMIT ?2)'
      ).bind(spil, GEM_LAENGDE).run();
      return r.id;
    },
    /** Fjerner alle rækker for et navn (uanset store/små bogstaver) – bruges af spil med `unik`. */
    async sletNavn(spil, navn) {
      await db.prepare('DELETE FROM scores WHERE spil = ?1 AND lower(navn) = lower(?2)').bind(spil, navn).run();
    },
    /** Retter navnet på én række, hvis token passer. Returnerer true hvis en række blev ændret. */
    async omdoeb(spil, id, token, navn) {
      const r = await db.prepare('UPDATE scores SET navn = ?4 WHERE spil = ?1 AND id = ?2 AND token = ?3')
        .bind(spil, id, token, navn).run();
      return r.meta.changes > 0;
    },
    /** Sletter én række, hvis token passer. Returnerer true hvis en række blev slettet. */
    async slet(spil, id, token) {
      const r = await db.prepare('DELETE FROM scores WHERE spil = ?1 AND id = ?2 AND token = ?3').bind(spil, id, token).run();
      return r.meta.changes > 0;
    },
    /** Sletter én række uden token-tjek – kun til serverens egen oprydning ved navneskift. */
    async sletId(spil, id) {
      await db.prepare('DELETE FROM scores WHERE spil = ?1 AND id = ?2').bind(spil, id).run();
    },
  };
}

/* ---------- API ---------- */

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});
const fejl = (status, besked) => json({ ok: false, fejl: besked }, status);

/** Beholder kun den første (= bedste, da rækkerne er sorterede) række pr. navn, uanset store/små bogstaver. */
export function udenDubletter(raekker) {
  const set = new Set(), ud = [];
  for (const r of raekker) {
    const k = r.navn.toLowerCase();
    if (set.has(k)) continue;
    set.add(k); ud.push(r);
  }
  return ud;
}

/**
 * Alle gemte rækker for et spil, bedste først – og for `unik`-spil ét navn én gang.
 * Dubletter kan stadig ligge i databasen fra før reglen kom til (2026-09-12); de
 * forsvinder her ved læsning og slettes af sletNavn() næste gang navnet gemmer en bedre score.
 */
async function alleRaekker(lager, spil, regler) {
  const alle = await lager.top(spil, GEM_LAENGDE, regler.retning);
  return regler.unik ? udenDubletter(alle) : alle;
}

/** Svar med top 10 og placeringen (1-baseret) af rækken `id` i den, eller null. */
async function svarMedListe(lager, spil, regler, id, ekstra) {
  const liste = (await alleRaekker(lager, spil, regler)).slice(0, LISTE_LAENGDE);
  const idx = liste.findIndex(r => r.id === id);
  return json({ ok: true, id, placering: idx === -1 ? null : idx + 1, ...ekstra, ...regler, liste });
}

async function laesJson(request) {
  try { return await request.json(); } catch (e) { return undefined; }
}

/**
 * Håndterer /api/highscore/<spil>[/<id>]. `lager` er d1Lager(env.DB) i drift og en
 * hukommelses-udgave i tests. Returnerer null hvis stien ikke er API'ets.
 */
export async function haandterApi(request, lager) {
  const url = new URL(request.url);
  const m = url.pathname.match(/^\/api\/highscore\/([a-z0-9-]{1,32})(?:\/(\d{1,12}))?\/?$/);
  if (!m) return url.pathname.startsWith('/api/') ? fejl(404, 'Ukendt API-sti') : null;
  const spil = m[1], id = m[2] == null ? null : Number(m[2]);
  if (!SPIL[spil]) return fejl(404, 'Ukendt spil');
  const regler = reglerFor(spil);   // klienten får retning/min/maks/unik med, så den kan afgøre om en score kvalificerer

  if (request.method === 'GET' && id === null) {
    return json({ spil, ...regler, liste: (await alleRaekker(lager, spil, regler)).slice(0, LISTE_LAENGDE) });
  }

  if (request.method === 'POST' && id === null) {
    const krop = await laesJson(request);
    if (krop === undefined) return fejl(400, 'Kroppen skal være JSON');
    const navn = rensNavn(krop && krop.navn);
    const score = rensScore(krop && krop.score, spil);
    if (!navn) return fejl(400, 'Navnet mangler');
    if (score === null) return fejl(400, 'Ugyldig score');

    if (regler.unik) {
      // Én række pr. navn: en dårligere eller lige så god score ændrer intet, en bedre erstatter de gamle.
      const alle = await alleRaekker(lager, spil, regler);
      const egen = alle.find(r => sammeNavn(r.navn, navn));
      if (egen && !bedre(score, egen.score, regler.retning)) {
        return svarMedListe(lager, spil, regler, egen.id, { uaendret: true, score: egen.score });
      }
      if (egen) await lager.sletNavn(spil, navn);
    }

    const token = crypto.randomUUID();
    const nyId = await lager.gem(spil, navn, score, regler.retning, token);
    return svarMedListe(lager, spil, regler, nyId, { token });
  }

  if (request.method === 'PATCH' && id !== null) {
    const krop = await laesJson(request);
    if (krop === undefined) return fejl(400, 'Kroppen skal være JSON');
    const navn = rensNavn(krop && krop.navn);
    const token = krop && typeof krop.token === 'string' ? krop.token : '';
    if (!navn) return fejl(400, 'Navnet mangler');
    if (!token) return fejl(400, 'Token mangler');

    // Her ses der på de rå rækker (ikke udenDubletter), så en gammel dublet også kan omdøbes.
    const raa = await lager.top(spil, GEM_LAENGDE, regler.retning);
    const egen = raa.find(r => r.id === id);
    if (!egen) return fejl(404, 'Rækken findes ikke');

    if (regler.unik) {
      // Det nye navn står måske allerede på listen: kun den bedste af de to overlever.
      // `raa` er sorteret, så den første med navnet er den bedste; resten er gamle dubletter.
      const andre = raa.filter(r => r.id !== id && sammeNavn(r.navn, navn));
      if (andre.length) {
        if (bedre(egen.score, andre[0].score, regler.retning)) {
          // Egen række er bedst: omdøb den (tjekker token) og fjern de gamle rækker med navnet.
          if (!(await lager.omdoeb(spil, id, token, navn))) return fejl(403, 'Forkert token');
          for (const r of andre) await lager.sletId(spil, r.id);
          return svarMedListe(lager, spil, regler, id, {});
        }
        // Den anden står bedre: egen række forsvinder, og svaret peger på den andens.
        if (!(await lager.slet(spil, id, token))) return fejl(403, 'Forkert token');
        return svarMedListe(lager, spil, regler, andre[0].id, { uaendret: true, score: andre[0].score });
      }
    }
    if (!(await lager.omdoeb(spil, id, token, navn))) return fejl(403, 'Forkert token');
    return svarMedListe(lager, spil, regler, id, {});
  }

  return fejl(405, id === null ? 'Brug GET eller POST' : 'Brug PATCH');
}
