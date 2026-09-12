// Idéer og ønsker fra dem der bruger zydy.dk: forslag til nye spil ("Nyt spil?"
// nederst på forsiden) og ønsker til de spil der findes ("Mangler der noget?"
// under hvert kort). Alt havner i D1-tabellen `ideer` og hentes ned bagefter med
//   npm run ideer                 (pænt overblik i terminalen)
//   npm run ideer -- --json       (rå JSON, fx til at give videre til en AI)
//
//   POST /api/ideer   body { slags, spil?, navn, tekst }
//        slags: 'nyt'     → forslag til et helt nyt spil (spil udelades)
//        slags: 'oenske'  → ønske til et spil der findes (spil skal være kendt)
//        → { ok: true, id }
//
// Samme opbygning som src/highscore.mjs og src/aktivitet.mjs: ren validering, et
// D1-lager og en request-håndtering, så det kan testes uden Cloudflare
// (test/unit/ideer.test.mjs bytter D1 ud med et hukommelses-lager).
//
// API'et er åbent ligesom toplisten — det er et familie-site. Værnet mod pjat er
// grænser på længden og en trimning til de nyeste GEM_ANTAL. Skulle der komme
// skrald ind, så ryd op med
//   npx wrangler@4 d1 execute zydy-highscore --remote --command "DELETE FROM ideer WHERE id = 42"
import { rensNavn } from './highscore.mjs';
import { kendteSpil } from './aktivitet.mjs';

export const SLAGS = ['nyt', 'oenske'];
export const TEKST_MIN = 3;
export const TEKST_MAKS = 600;
const GEM_ANTAL = 500;          // hvor mange idéer der beholdes i alt

/* ---------- Validering (ren, uden database) ---------- */

/** Usynlige tegn der ikke må stå i en tekst: kontroltegn (undtagen linjeskift), zero-width og BOM. */
function usynlig(ch) {
  const c = ch.codePointAt(0);
  if (c === 10) return false;                                   // linjeskift må gerne blive
  return c < 32 || (c >= 127 && c <= 159) || (c >= 8203 && c <= 8207) || c === 8232 || c === 8233 || c === 65279;
}

/**
 * Renser en beskrivelse: fjerner usynlige tegn, samler tomme linjer og mellemrum,
 * trimmer og klipper til TEKST_MAKS tegn. Null hvis den er for kort til at sige noget.
 */
export function rensTekst(tekst) {
  if (typeof tekst !== 'string') return null;
  const rent = Array.from(tekst).filter(ch => !usynlig(ch)).join('')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n').map(l => l.trim()).join('\n')
    .trim();
  if (Array.from(rent).length < TEKST_MIN) return null;
  return Array.from(rent).slice(0, TEKST_MAKS).join('');
}

/**
 * Validerer en indsendelse. Returnerer { slags, spil, navn, tekst } eller
 * { fejl } med en besked, der kan vises til den der skrev.
 */
export function rensIde(krop) {
  const k = krop && typeof krop === 'object' ? krop : {};
  const slags = SLAGS.includes(k.slags) ? k.slags : null;
  if (!slags) return { fejl: 'Ukendt slags' };

  let spil = null;
  if (slags === 'oenske') {
    if (typeof k.spil !== 'string' || !kendteSpil().includes(k.spil)) return { fejl: 'Ukendt spil' };
    spil = k.spil;
  }

  const navn = rensNavn(k.navn);
  if (!navn) return { fejl: 'Navnet mangler' };
  const tekst = rensTekst(k.tekst);
  if (!tekst) return { fejl: 'Skriv lidt mere' };

  return { slags, spil, navn, tekst };
}

/* ---------- Lager ---------- */

/** D1-udgaven. Testens hukommelses-udgave har de samme to metoder. */
export function d1Ideer(db) {
  return {
    async gem(slags, spil, navn, tekst) {
      const r = await db.prepare('INSERT INTO ideer (slags, spil, navn, tekst) VALUES (?1, ?2, ?3, ?4) RETURNING id')
        .bind(slags, spil, navn, tekst).first();
      // Hold tabellen lille: kun de nyeste GEM_ANTAL overlever.
      await db.prepare('DELETE FROM ideer WHERE id NOT IN (SELECT id FROM ideer ORDER BY id DESC LIMIT ?1)')
        .bind(GEM_ANTAL).run();
      return r.id;
    },
    /** Alle idéer, nyeste først – kun til hentning (scripts/ideer.mjs går uden om Worker'en). */
    async alle(n = GEM_ANTAL) {
      const r = await db.prepare('SELECT id, slags, spil, navn, tekst, oprettet FROM ideer ORDER BY id DESC LIMIT ?1').bind(n).all();
      return r.results;
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
 * Håndterer POST /api/ideer. `lager` er d1Ideer(env.DB) i drift og en
 * hukommelses-udgave i tests. Returnerer null hvis stien ikke er API'ets.
 */
export async function haandterIdeer(request, lager) {
  const url = new URL(request.url);
  if (url.pathname !== '/api/ideer' && url.pathname !== '/api/ideer/') return null;
  if (request.method !== 'POST') return fejl(405, 'Brug POST');

  let krop;
  try { krop = await request.json(); } catch (e) { return fejl(400, 'Kroppen skal være JSON'); }

  const ide = rensIde(krop);
  if (ide.fejl) return fejl(400, ide.fejl);

  const id = await lager.gem(ide.slags, ide.spil, ide.navn, ide.tekst);
  return json({ ok: true, id });
}
