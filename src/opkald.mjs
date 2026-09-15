// Ring til en ven: to venner taler sammen med rigtig lyd fra hver sin telefon.
//
// Selve lyden går direkte mellem de to telefoner (WebRTC, peer-to-peer) og
// rører aldrig serveren. Serveren er kun telefondamen fra gamle dage: hun
// stiller om. Den, der ringer op, lægger sit WebRTC-*tilbud* her; den, der
// tager telefonen, lægger sit *svar* — og så finder de to telefoner selv
// hinanden og taler udenom os. Serveren ved kun, om der ringes, tales eller er
// lagt på; den kan ikke høre noget, for lyden kommer her aldrig forbi.
//
//   POST /api/opkald            body { navn, ven, tilbud }
//        → { ok: true, opkald }        ring op (kun til en ven). `tilbud` er
//                                      WebRTC-tilbuddet, spillets egen kasse.
//   GET  /api/opkald?navn=Sofie
//        → { ok: true, navn, opkald: [ … ] }   mine åbne opkald (ringer + i gang)
//   GET  /api/opkald/<kode>?navn=Sofie
//        → { ok: true, opkald }        ét opkald som jeg ser det
//   POST /api/opkald/<kode>     body { navn, handling, svar? }
//        handling 'svar' → tag telefonen: læg WebRTC-svaret, og opkaldet er i gang
//        handling 'slut' → læg på, sig nej tak, eller fortryd et opkald
//        handling 'se'   → hent bare opkaldet igen (standard)
//        → { ok: true, opkald }
//
// Tilbud og svar er hemmelige mellem de to: den der ringer, ser aldrig sit eget
// tilbud igen (kun svaret), og den der svarer, ser kun tilbuddet — så ingen
// tredje kan hente dem, og ingen sender mere ned ad linjen end nødvendigt.
//
// Et opkald, ingen har taget inden RING_MS, regnes som ubesvaret: det står som
// 'slut' i alle svar, så en telefon, der først kigger senere, ikke ringer over
// noget, der er forbi. Værnet mod pjat er som resten af siden: man er det navn,
// man har skrevet på forsiden, og man kan kun ringe til sine venner.
//
// Samme opbygning som src/rum.mjs og src/beskeder.mjs: ren validering, et
// D1-lager (tabellen laves selv ved første kald, som beskeder) og en
// request-håndtering, så det kan testes uden Cloudflare
// (test/unit/opkald.test.mjs bytter D1 ud med et hukommelses-lager).
import { rensNavn } from './highscore.mjs';
import { noegle, rensPar } from './venner.mjs';
import { nyKode, rensKode } from './rum.mjs';

export const STATUS = ['ringer', 'igang', 'slut'];
export const HANDLINGER = ['se', 'svar', 'slut'];
export const RING_MS = 45_000;         // hvor længe et opkald ringer, før det er ubesvaret
export const OPKALD_TIMER = 1;         // et opkald glemmes helt efter så mange timer
export const SDP_MAKS = 20_000;        // hvor mange tegn et tilbud eller svar må fylde

/** Er `k` (en nøgle) med i opkaldet? */
export const erMed = (r, k) => r.fra === k || r.til === k;

/**
 * Det, status *er* lige nu: et opkald, ingen har taget inden RING_MS, er slut,
 * også selv om rækken stadig siger 'ringer' — ingen skriver den om, før nogen rører den.
 */
export const effektivStatus = (r, nu) =>
  (r.status === 'ringer' && nu - r.opdateret > RING_MS ? 'slut' : r.status);

/**
 * Opkaldet som én af de to ser det. Tilbuddet følger kun med til den, der skal
 * svare, og svaret kun til den, der ringede — den anden vej er de bare fyld.
 */
export function synligtOpkald(r, k, nu) {
  const ringerJeg = r.fra === k;
  const parse = t => { try { return t ? JSON.parse(t) : null; } catch (e) { return null; } };
  return {
    kode: r.kode,
    status: effektivStatus(r, nu),
    ringerJeg,
    jeg: ringerJeg ? r.fraNavn : r.tilNavn,
    ven: ringerJeg ? r.tilNavn : r.fraNavn,
    tilbud: ringerJeg ? null : parse(r.tilbud),
    svar: ringerJeg ? parse(r.svar) : null,
  };
}

/* ---------- Lager ---------- */

const TABEL = `CREATE TABLE IF NOT EXISTS opkald (
  kode      TEXT PRIMARY KEY,
  fra       TEXT    NOT NULL,
  fra_navn  TEXT    NOT NULL,
  til       TEXT    NOT NULL,
  til_navn  TEXT    NOT NULL,
  status    TEXT    NOT NULL,
  tilbud    TEXT,
  svar      TEXT,
  opdateret INTEGER NOT NULL
)`;

/** D1-udgaven. Testens hukommelses-udgave (huskOpkald i test/api-mock.mjs) har de samme metoder. */
export function d1Opkald(db) {
  const FELTER = 'kode, fra, fra_navn, til, til_navn, status, tilbud, svar, opdateret';
  const raekke = r => (r ? {
    kode: r.kode, fra: r.fra, fraNavn: r.fra_navn, til: r.til, tilNavn: r.til_navn,
    status: r.status, tilbud: r.tilbud, svar: r.svar, opdateret: r.opdateret,
  } : null);

  // Tabellen laves ved første kald i stedet for i en migrering — samme greb som
  // beskederne, så opkald virker uden at nogen skal køre schema.sql først.
  let klar = null;
  const sikr = () => (klar ||= (async () => {
    await db.prepare(TABEL).run();
    await db.prepare('CREATE INDEX IF NOT EXISTS opkald_fra ON opkald (fra, opdateret)').run();
    await db.prepare('CREATE INDEX IF NOT EXISTS opkald_til ON opkald (til, opdateret)').run();
  })().catch(e => { klar = null; throw e; }));

  return {
    async find(kode) {
      await sikr();
      return raekke(await db.prepare(`SELECT ${FELTER} FROM opkald WHERE kode = ?1`).bind(kode).first());
    },
    /** Mine opkald, der ikke er lagt på, nyeste først. */
    async mine(k, efter) {
      await sikr();
      const r = await db.prepare(`SELECT ${FELTER} FROM opkald WHERE (fra = ?1 OR til = ?1)
        AND status <> 'slut' AND opdateret >= ?2 ORDER BY opdateret DESC LIMIT 10`).bind(k, efter).all();
      return r.results.map(raekke);
    },
    async opret(r) {
      await sikr();
      await db.prepare(`INSERT INTO opkald (kode, fra, fra_navn, til, til_navn, status, tilbud, svar, opdateret)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, NULL, ?8)`)
        .bind(r.kode, r.fra, r.fraNavn, r.til, r.tilNavn, r.status, r.tilbud, r.opdateret).run();
    },
    async saetStatus(kode, status, nu) {
      await sikr();
      await db.prepare('UPDATE opkald SET status = ?2, opdateret = ?3 WHERE kode = ?1').bind(kode, status, nu).run();
    },
    /** Telefonen bliver taget: svaret lægges, og opkaldet er i gang. */
    async saetSvar(kode, svar, nu) {
      await sikr();
      await db.prepare("UPDATE opkald SET svar = ?2, status = 'igang', opdateret = ?3 WHERE kode = ?1")
        .bind(kode, svar, nu).run();
    },
    /** Alle opkald mellem to personer – der er kun ét ad gangen. */
    async sletPar(a, b) {
      await sikr();
      await db.prepare('DELETE FROM opkald WHERE (fra = ?1 AND til = ?2) OR (fra = ?2 AND til = ?1)').bind(a, b).run();
    },
    async ryd(foer) {
      await sikr();
      await db.prepare('DELETE FROM opkald WHERE opdateret < ?1').bind(foer).run();
    },
  };
}

/* ---------- API ---------- */

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});
const fejl = (status, besked) => json({ ok: false, fejl: besked }, status);

/** Tilbud og svar er WebRTC's egne kasser: vi kræver bare, at det er en lille pakke JSON. */
function rensPakke(raa) {
  if (!raa || typeof raa !== 'object') return null;
  let tekst;
  try { tekst = JSON.stringify(raa); } catch (e) { return null; }
  if (!tekst || tekst.length > SDP_MAKS) return null;
  return tekst;
}

/**
 * Håndterer /api/opkald og /api/opkald/<kode>. `lager` er d1Opkald(env.DB) i
 * drift, og `venner` er venne-lageret, for man kan kun ringe til sine venner.
 * Returnerer null hvis stien ikke er API'ets.
 */
export async function haandterOpkald(request, lager, venner, nu = Date.now()) {
  const url = new URL(request.url);
  const dele = url.pathname.replace(/\/+$/, '').split('/');       // ['', 'api', 'opkald', kode?]
  if (dele[1] !== 'api' || dele[2] !== 'opkald' || dele.length > 4) return null;
  const kodeDel = dele[3] ? rensKode(dele[3]) : null;
  if (dele[3] && !kodeDel) return fejl(400, 'Det opkald findes ikke');
  const gammelt = nu - OPKALD_TIMER * 3600_000;

  /* ----- Ét bestemt opkald ----- */
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
    const opkald = await lager.find(kodeDel);
    if (!opkald || opkald.opdateret < gammelt) return fejl(404, 'Det opkald er forbi');
    if (!erMed(opkald, k)) return fejl(403, 'Det er ikke dit opkald');

    const handling = HANDLINGER.includes(krop.handling) ? krop.handling : 'se';
    if (request.method === 'GET' || handling === 'se') return json({ ok: true, opkald: synligtOpkald(opkald, k, nu) });

    if (handling === 'slut') {
      // Læg på, nej tak og fortryd er det samme: opkaldet er forbi for dem begge.
      if (opkald.status !== 'slut') await lager.saetStatus(opkald.kode, 'slut', nu);
      return json({ ok: true, opkald: synligtOpkald({ ...opkald, status: 'slut' }, k, nu) });
    }

    // handling === 'svar': tag telefonen. Kun den, der bliver ringet op, kan det.
    if (opkald.til !== k) return fejl(400, 'Du kan ikke tage din egen telefon');
    if (opkald.status === 'igang') return json({ ok: true, opkald: synligtOpkald(opkald, k, nu) });
    if (effektivStatus(opkald, nu) === 'slut') {
      // For sent: den anden lagde på (eller gav op). Sig det, som det er.
      return json({ ok: true, opkald: synligtOpkald({ ...opkald, status: 'slut' }, k, nu) });
    }
    const svar = rensPakke(krop.svar);
    if (!svar) return fejl(400, 'Der var ikke noget svar at lægge');
    await lager.saetSvar(opkald.kode, svar, nu);
    return json({ ok: true, opkald: synligtOpkald({ ...opkald, svar, status: 'igang' }, k, nu) });
  }

  /* ----- Mine opkald ----- */
  if (request.method === 'GET') {
    const navn = rensNavn(url.searchParams.get('navn'));
    if (!navn) return fejl(400, 'Skriv dit navn først');
    const k = noegle(navn);
    // Ubesvarede opkald er 'slut', selv om rækken siger 'ringer' – ellers ringer
    // telefonen over noget, der er tre kvarter gammelt.
    const mine = (await lager.mine(k, gammelt)).filter(r => effektivStatus(r, nu) !== 'slut');
    return json({ ok: true, navn, opkald: mine.map(r => synligtOpkald(r, k, nu)) });
  }
  if (request.method !== 'POST') return fejl(405, 'Brug GET eller POST');

  /* ----- Ring op ----- */
  let krop;
  try { krop = await request.json(); } catch (e) { return fejl(400, 'Kroppen skal være JSON'); }
  krop = krop && typeof krop === 'object' ? krop : {};

  const { mig, dig, fejl: galt } = rensPar(krop.navn, krop.ven);
  if (galt) return fejl(400, galt);
  const [a, b] = [noegle(mig), noegle(dig)];
  const venskab = await venner.par(a, b);
  if (!venskab || !venskab.svaret) return fejl(400, 'I er ikke venner endnu');

  const tilbud = rensPakke(krop.tilbud);
  if (!tilbud) return fejl(400, 'Der var ikke noget tilbud at ringe med');

  await lager.ryd(gammelt);
  await lager.sletPar(a, b);                 // højst ét opkald ad gangen mellem to venner
  let kode = null;
  for (let i = 0; i < 8 && !kode; i++) {
    const bud = nyKode();
    if (!(await lager.find(bud))) kode = bud;
  }
  if (!kode) return fejl(503, 'Prøv igen om lidt');

  const opkald = { kode, fra: a, fraNavn: mig, til: b, tilNavn: dig, status: 'ringer', tilbud, svar: null, opdateret: nu };
  await lager.opret(opkald);
  return json({ ok: true, opkald: synligtOpkald(opkald, a, nu) });
}
