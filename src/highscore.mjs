// Højscore-API'et for zydy.dk: validering, D1-lager og request-håndtering.
// Ligger for sig selv, fordi Workers-runtime kun tillader handler-eksporter fra
// hovedmodulet (src/worker.mjs) — og fordi det gør koden testbar uden Cloudflare
// (test/unit/highscore.test.mjs bytter D1 ud med et hukommelses-lager).
//
//   GET  /api/highscore/taarn            → { spil, liste: [{ id, navn, score, oprettet }] }
//   POST /api/highscore/taarn            body { navn, score }
//                                        → { ok: true, id, placering, liste }
//
// API'et er åbent (ingen login) — det er et familie-site. Værnet mod pjat er
// derfor kun: kendte spil, fornuftige grænser og en trimning til de bedste
// 100 pr. spil. Skulle listen blive fyldt med skrald, så ryd op med
//   npx wrangler@4 d1 execute zydy-highscore --remote --command "DELETE FROM scores WHERE spil='taarn'"

/** Spil der må gemme højscore, med den højeste score der giver mening. Nye spil: tilføj en linje. */
export const SPIL = {
  taarn: { maks: 2000 },
  dybet: { maks: 500 },      // score = dybde (niveau) nået
};

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
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 1) return null;
  if (n > SPIL[spil].maks) return null;
  return n;
}

/* ---------- Lager ---------- */

/** D1-udgaven af lageret. Samme to metoder findes i testens hukommelses-udgave. */
export function d1Lager(db) {
  return {
    async top(spil, n) {
      const r = await db.prepare(
        'SELECT id, navn, score, oprettet FROM scores WHERE spil = ?1 ORDER BY score DESC, oprettet ASC LIMIT ?2'
      ).bind(spil, n).all();
      return r.results;
    },
    async gem(spil, navn, score) {
      const r = await db.prepare(
        'INSERT INTO scores (spil, navn, score) VALUES (?1, ?2, ?3) RETURNING id'
      ).bind(spil, navn, score).first();
      // Hold tabellen lille: kun de bedste GEM_LAENGDE pr. spil overlever.
      await db.prepare(
        'DELETE FROM scores WHERE spil = ?1 AND id NOT IN (SELECT id FROM scores WHERE spil = ?1 ORDER BY score DESC, oprettet ASC LIMIT ?2)'
      ).bind(spil, GEM_LAENGDE).run();
      return r.id;
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
 * Håndterer /api/highscore/<spil>. `lager` er d1Lager(env.DB) i drift og en
 * hukommelses-udgave i tests. Returnerer null hvis stien ikke er API'ets.
 */
export async function haandterApi(request, lager) {
  const url = new URL(request.url);
  const m = url.pathname.match(/^\/api\/highscore\/([a-z0-9-]{1,32})\/?$/);
  if (!m) return url.pathname.startsWith('/api/') ? fejl(404, 'Ukendt API-sti') : null;
  const spil = m[1];
  if (!SPIL[spil]) return fejl(404, 'Ukendt spil');

  if (request.method === 'GET') {
    return json({ spil, liste: await lager.top(spil, LISTE_LAENGDE) });
  }

  if (request.method === 'POST') {
    let krop;
    try { krop = await request.json(); } catch (e) { return fejl(400, 'Kroppen skal være JSON'); }
    const navn = rensNavn(krop && krop.navn);
    const score = rensScore(krop && krop.score, spil);
    if (!navn) return fejl(400, 'Navnet mangler');
    if (score === null) return fejl(400, 'Ugyldig score');

    const id = await lager.gem(spil, navn, score);
    const liste = await lager.top(spil, LISTE_LAENGDE);
    const idx = liste.findIndex(r => r.id === id);
    return json({ ok: true, id, placering: idx === -1 ? null : idx + 1, liste });
  }

  return fejl(405, 'Brug GET eller POST');
}
