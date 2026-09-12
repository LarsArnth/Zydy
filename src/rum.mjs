// Spil sammen: to venner i det samme spil på hver sin telefon.
//
// Venner kan i forvejen se hinanden på forsiden (src/venner.mjs). Her kan de
// også *joine* hinanden: den ene inviterer, den anden hopper med, og så deler de
// ét "rum" — en lille kasse i databasen, som begge to skriver spillets stilling
// i, og som begge to kigger i et par gange i sekundet.
//
//   POST /api/rum               body { navn, ven, spil }
//        → { ok: true, rum }            inviter en ven til et spil
//   GET  /api/rum?navn=Sofie
//        → { ok: true, navn, rum: [ … ] }   mine åbne rum (invitationer + i gang)
//   GET  /api/rum/<kode>?navn=Sofie
//        → { ok: true, rum }            ét rum som jeg ser det
//   POST /api/rum/<kode>        body { navn, handling, tilstand?, version? }
//        handling 'kom'  → gæsten hopper med, og rummet går i gang
//        handling 'nej'  → nej tak, eller "jeg går" midt i et spil (rummet lukkes)
//        handling 'gem'  → skriv spillets stilling (kræver at `version` passer)
//        handling 'se'   → hent bare rummet igen (standard)
//        → { ok: true, rum, uaendret? }
//
// Serveren kender ikke spillets regler: `tilstand` er spillets egen JSON, som
// den selv finder ud af. Til gengæld passer serveren på, at de to ikke skriver
// oven i hinanden: hver skrivning skal oplyse den `version`, den bygger på, og
// den, der kommer for sent, får rummet tilbage og tegner det i stedet. Til et
// turbaseret spil som Kryds og bolle er det rigeligt.
//
// Værnet mod pjat er det samme som resten af siden: man er det navn, man har
// skrevet på forsiden, man kan kun invitere dem, man er venner med, og et rum
// glemmes efter RUM_TIMER timer uden aktivitet.
//
// Samme opbygning som src/venner.mjs: ren validering, et D1-lager og en
// request-håndtering, så det kan testes uden Cloudflare (test/unit/rum.test.mjs
// bytter D1 ud med et hukommelses-lager).
import { rensNavn } from './highscore.mjs';
import { noegle, rensPar } from './venner.mjs';
import { SAMMEN } from './spil-data.mjs';

export const STATUS = ['inviteret', 'igang', 'slut'];
export const HANDLINGER = ['se', 'kom', 'nej', 'gem'];
export const RUM_TIMER = 3;            // et rum glemmes efter så mange timer uden aktivitet
export const TILSTAND_MAKS = 4000;     // hvor mange tegn spillets egen JSON må fylde
export const MINE_MAKS = 20;           // hvor mange rum én person kan have åbne

// Kode uden I, O, 0 og 1: den skal kunne læses højt og skrives af et barn.
const KODE_TEGN = 'ABCDEFGHJKLMNPQRSTUVXYZ23456789';
const KODE_LAENGDE = 5;
const tilfaeldig = () => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;

/** En ny rumkode. `rnd` giver et tal i [0,1) – kan seedes i tests. */
export function nyKode(rnd = tilfaeldig) {
  let ud = '';
  for (let i = 0; i < KODE_LAENGDE; i++) ud += KODE_TEGN[Math.floor(rnd() * KODE_TEGN.length) % KODE_TEGN.length];
  return ud;
}

/** Renser en kode fra adresselinjen: store bogstaver, kun tegn vi selv bruger. */
export function rensKode(raa) {
  if (typeof raa !== 'string') return null;
  const kode = raa.trim().toUpperCase();
  if (kode.length !== KODE_LAENGDE) return null;
  return [...kode].every(c => KODE_TEGN.includes(c)) ? kode : null;
}

/** Er `k` (en nøgle) med i rummet? */
export const erMed = (r, k) => r.vaert === k || r.gaest === k;

/**
 * Rummet som én af de to ser det: hvem er jeg, hvem er den anden, og hvad står
 * der i spillets egen kasse. Værten er altid den, der inviterede.
 */
export function synligtRum(r, k) {
  const vaert = r.vaert === k;
  let tilstand = null;
  try { tilstand = r.tilstand ? JSON.parse(r.tilstand) : null; } catch (e) { tilstand = null; }
  return {
    kode: r.kode,
    spil: r.spil,
    status: r.status,
    version: r.version,
    tilstand,
    rolle: vaert ? 'vaert' : 'gaest',
    jeg: vaert ? r.vaertNavn : r.gaestNavn,
    modspiller: vaert ? r.gaestNavn : r.vaertNavn,
  };
}

/* ---------- Lager ---------- */

/** D1-udgaven. Testens hukommelses-udgave (huskRum i test/api-mock.mjs) har de samme metoder. */
export function d1Rum(db) {
  const raekke = r => (r ? {
    kode: r.kode, spil: r.spil, vaert: r.vaert, vaertNavn: r.vaert_navn, gaest: r.gaest,
    gaestNavn: r.gaest_navn, status: r.status, version: r.version, tilstand: r.tilstand, opdateret: r.opdateret,
  } : null);
  const FELTER = 'kode, spil, vaert, vaert_navn, gaest, gaest_navn, status, version, tilstand, opdateret';
  return {
    async find(kode) {
      return raekke(await db.prepare(`SELECT ${FELTER} FROM rum WHERE kode = ?1`).bind(kode).first());
    },
    /** Mine åbne rum, nyeste først. */
    async mine(k, efter) {
      const r = await db.prepare(`SELECT ${FELTER} FROM rum WHERE (vaert = ?1 OR gaest = ?1) AND status <> 'slut'
        AND opdateret >= ?2 ORDER BY opdateret DESC LIMIT ?3`).bind(k, efter, MINE_MAKS).all();
      return r.results.map(raekke);
    },
    async opret(r) {
      await db.prepare(`INSERT INTO rum (kode, spil, vaert, vaert_navn, gaest, gaest_navn, status, version, tilstand, opdateret)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 0, NULL, ?8)`)
        .bind(r.kode, r.spil, r.vaert, r.vaertNavn, r.gaest, r.gaestNavn, r.status, r.opdateret).run();
    },
    async saetStatus(kode, status, nu) {
      await db.prepare('UPDATE rum SET status = ?2, opdateret = ?3 WHERE kode = ?1').bind(kode, status, nu).run();
    },
    /** Skriver kun, hvis rummet stadig står på `version` – ellers kom nogen os i forkøbet. */
    async gem(kode, tilstand, version, nu) {
      const r = await db.prepare('UPDATE rum SET tilstand = ?2, version = version + 1, opdateret = ?4 WHERE kode = ?1 AND version = ?3')
        .bind(kode, tilstand, version, nu).run();
      return (r.meta?.changes ?? 0) > 0;
    },
    /** Alle rum mellem to personer – der er kun ét ad gangen. */
    async sletPar(a, b) {
      await db.prepare('DELETE FROM rum WHERE (vaert = ?1 AND gaest = ?2) OR (vaert = ?2 AND gaest = ?1)').bind(a, b).run();
    },
    async ryd(foer) {
      await db.prepare('DELETE FROM rum WHERE opdateret < ?1').bind(foer).run();
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
 * Håndterer /api/rum og /api/rum/<kode>. `lager` er d1Rum(env.DB) i drift, og
 * `venner` er venne-lageret, for man kan kun invitere sine venner.
 * Returnerer null hvis stien ikke er API'ets.
 */
export async function haandterRum(request, lager, venner, nu = Date.now()) {
  const url = new URL(request.url);
  const dele = url.pathname.replace(/\/+$/, '').split('/');       // ['', 'api', 'rum', kode?]
  if (dele[1] !== 'api' || dele[2] !== 'rum' || dele.length > 4) return null;
  const kodeDel = dele[3] ? rensKode(dele[3]) : null;
  if (dele[3] && !kodeDel) return fejl(400, 'Den kode findes ikke');
  const gammelt = nu - RUM_TIMER * 3600_000;

  /* ----- Ét bestemt rum ----- */
  if (kodeDel) {
    const navn = rensNavn(request.method === 'GET' ? url.searchParams.get('navn') : null);
    let krop = {};
    if (request.method === 'POST') {
      try { krop = await request.json(); } catch (e) { return fejl(400, 'Kroppen skal være JSON'); }
      krop = krop && typeof krop === 'object' ? krop : {};
    } else if (request.method !== 'GET') return fejl(405, 'Brug GET eller POST');

    const mig = navn || rensNavn(krop.navn);
    if (!mig) return fejl(400, 'Skriv dit navn først');
    const k = noegle(mig);
    const rum = await lager.find(kodeDel);
    if (!rum || rum.opdateret < gammelt) return fejl(404, 'Spillet er slut');
    if (!erMed(rum, k)) return fejl(403, 'Det er ikke dit spil');

    const handling = HANDLINGER.includes(krop.handling) ? krop.handling : 'se';
    if (request.method === 'GET' || handling === 'se') return json({ ok: true, rum: synligtRum(rum, k) });

    if (handling === 'nej') {
      await lager.saetStatus(rum.kode, 'slut', nu);
      return json({ ok: true, rum: synligtRum({ ...rum, status: 'slut' }, k) });
    }

    if (rum.status === 'slut') return json({ ok: true, rum: synligtRum(rum, k) });

    if (handling === 'kom') {
      // Gæsten hopper med. Værten venter bare, til status skifter.
      if (rum.vaert === k) return json({ ok: true, rum: synligtRum(rum, k) });
      if (rum.status === 'inviteret') await lager.saetStatus(rum.kode, 'igang', nu);
      return json({ ok: true, rum: synligtRum({ ...rum, status: 'igang' }, k) });
    }

    // handling === 'gem': spillets egen stilling, med den version den blev tegnet ud fra.
    // Der kan først spilles, når den anden er hoppet med.
    if (rum.status !== 'igang') return json({ ok: true, uaendret: true, rum: synligtRum(rum, k) });
    let tekst;
    try { tekst = JSON.stringify(krop.tilstand ?? null); } catch (e) { tekst = null; }
    if (!tekst || tekst === 'null') return fejl(400, 'Der var ingen stilling at gemme');
    if (tekst.length > TILSTAND_MAKS) return fejl(400, 'Stillingen er for stor');
    const version = Number.isInteger(krop.version) ? krop.version : rum.version;
    const skrevet = await lager.gem(rum.kode, tekst, version, nu);
    if (!skrevet) {
      // Den anden nåede at skrive først: giv rummet tilbage, så skærmen kan tegnes forfra.
      const friskt = await lager.find(rum.kode);
      return json({ ok: true, uaendret: true, rum: synligtRum(friskt || rum, k) });
    }
    return json({ ok: true, rum: synligtRum({ ...rum, tilstand: tekst, version: version + 1 }, k) });
  }

  /* ----- Mine rum ----- */
  if (request.method === 'GET') {
    const navn = rensNavn(url.searchParams.get('navn'));
    if (!navn) return fejl(400, 'Skriv dit navn først');
    const k = noegle(navn);
    const mine = await lager.mine(k, gammelt);
    return json({ ok: true, navn, rum: mine.map(r => synligtRum(r, k)) });
  }
  if (request.method !== 'POST') return fejl(405, 'Brug GET eller POST');

  /* ----- Inviter en ven ----- */
  let krop;
  try { krop = await request.json(); } catch (e) { return fejl(400, 'Kroppen skal være JSON'); }
  krop = krop && typeof krop === 'object' ? krop : {};

  const { mig, dig, fejl: galt } = rensPar(krop.navn, krop.ven);
  if (galt) return fejl(400, galt);
  const spil = typeof krop.spil === 'string' ? krop.spil.trim() : '';
  if (!SAMMEN.includes(spil)) return fejl(400, 'Det spil kan man ikke spille sammen');

  const [a, b] = [noegle(mig), noegle(dig)];
  const venskab = await venner.par(a, b);
  if (!venskab || !venskab.svaret) return fejl(400, 'I er ikke venner endnu');

  await lager.ryd(gammelt);
  await lager.sletPar(a, b);                 // højst ét rum ad gangen mellem to venner
  let kode = null;
  for (let i = 0; i < 8 && !kode; i++) {
    const bud = nyKode();
    if (!(await lager.find(bud))) kode = bud;
  }
  if (!kode) return fejl(503, 'Prøv igen om lidt');

  const rum = { kode, spil, vaert: a, vaertNavn: mig, gaest: b, gaestNavn: dig, status: 'inviteret', version: 0, tilstand: null, opdateret: nu };
  await lager.opret(rum);
  return json({ ok: true, rum: synligtRum(rum, a) });
}
