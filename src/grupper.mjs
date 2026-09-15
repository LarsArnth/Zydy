// Grupper på zydy.dk: en gruppe er dig og et par venner, der kan skrive sammen
// alle på én gang — i stedet for den samme besked til én ad gangen.
//
// Venner kan i forvejen se hinanden (src/venner.mjs), skrive to og to
// (src/beskeder.mjs), ringe (src/opkald.mjs) og spille sammen (src/rum.mjs).
// Her er den tredje slags samtale: mange i den samme.
//
//   GET  /api/grupper?navn=Sofie&set=k7qfd:42
//        → { ok: true, navn, nye, grupper: [{ kode, navn, medlemmer, lavetAf,
//            jegLavede, sidst, nye }] }
//        `set` er det, telefonen sidst har læst (kode:id, adskilt af komma) —
//        præcis som i src/beskeder.mjs, og af samme grund: hvem der har læst
//        hvad, hører til på telefonen og ikke i databasen.
//
//   GET  /api/grupper?navn=Sofie&kode=K7QFD&efter=42
//        → { ok: true, navn, gruppe, beskeder: [{ id, navn, mig, tekst, tid }] }
//
//   POST /api/grupper   body { navn, handling, … }
//        'lav'      { gruppe }        → lav en gruppe; du er med og har lavet den
//        'tilfoej'  { kode, ven }     → tag en af dine venner med ind
//        'fjern'    { kode, ven }     → tag en ud igen (kun den, der lavede gruppen)
//        'gaa'      { kode }          → gå selv ud; den sidste slukker lyset
//        'omdoeb'   { kode, gruppe }  → nyt navn (kun den, der lavede gruppen)
//        'skriv'    { kode, tekst }   → skriv til hele gruppen (standard)
//
// Værnet er det samme som resten af siden — der er hverken konti eller login, så
// man er det navn, man har skrevet på forsiden:
//
//   • man kan kun læse og skrive i en gruppe, man selv er med i,
//   • man kan kun tage sine *egne* venner med ind (ja begge veje i `venner`),
//     og ingen kan være i mere end GRUPPER_MAKS grupper eller have flere end
//     MEDLEM_MAKS med i én gruppe,
//   • kun den, der lavede gruppen, kan give den nyt navn eller tage nogen ud —
//     resten kan altid gå selv,
//   • går den sidste ud, forsvinder gruppen og alt, hvad der er skrevet i den.
//
// Beskederne ligger i den samme tabel som de to-og-to-samtaler (src/beskeder.mjs)
// under nøglen 'gruppe|<kode>'. Så arver gruppesnakken trimning, længdegrænse og
// spam-værn gratis — og en person har én fælles grænse for, hvor tit der må
// skrives, uanset hvor beskeden skal hen.
//
// Samme opbygning som src/venner.mjs og src/rum.mjs: ren validering, et
// D1-lager og en request-håndtering, så det kan testes uden Cloudflare
// (test/unit/grupper.test.mjs bytter D1 ud med et hukommelses-lager).
import { rensNavn } from './highscore.mjs';
import { noegle } from './venner.mjs';
import {
  GRUPPE_PRAEFIKS, HENT_MAKS, SPAM_MAKS, SPAM_VINDUE_MS,
  laesSet, rensBesked, synligBesked,
} from './beskeder.mjs';
import { nyKode, rensKode } from './rum.mjs';

export const GRUPPE_NAVN_MAKS = 24;    // hvor langt et gruppenavn må være
export const GRUPPER_MAKS = 12;        // hvor mange grupper én person kan være i
export const MEDLEM_MAKS = 12;         // hvor mange der kan være i én gruppe
export const HANDLINGER = ['skriv', 'lav', 'tilfoej', 'fjern', 'gaa', 'omdoeb'];

/** Samtalens nøgle i besked-tabellen: 'gruppe|K7QFD'. */
export const gruppeSamtale = kode => GRUPPE_PRAEFIKS + kode;

/** Renser et gruppenavn: som en besked, men kortere (det skal stå på en brik). */
export function rensGruppeNavn(tekst) {
  const rent = rensBesked(tekst);
  if (!rent) return null;
  return Array.from(rent).slice(0, GRUPPE_NAVN_MAKS).join('');
}

/** Gruppen som ét af medlemmerne (nøglen `k`) ser den. */
export function synligGruppe(g, medlemmer, k, ekstra = {}) {
  return {
    kode: g.kode,
    navn: g.navn,
    lavetAf: g.lavetAfNavn,
    jegLavede: g.lavetAf === k,
    medlemmer: medlemmer.map(m => ({ navn: m.navn, mig: m.medlem === k })),
    ...ekstra,
  };
}

/* ---------- Lager ---------- */

const TABEL_GRUPPER = `CREATE TABLE IF NOT EXISTS grupper (
  kode          TEXT PRIMARY KEY,
  navn          TEXT    NOT NULL,
  lavet_af      TEXT    NOT NULL,
  lavet_af_navn TEXT    NOT NULL,
  oprettet      INTEGER NOT NULL
)`;
const TABEL_MEDLEM = `CREATE TABLE IF NOT EXISTS gruppe_medlem (
  kode        TEXT    NOT NULL,
  medlem      TEXT    NOT NULL,
  medlem_navn TEXT    NOT NULL,
  kom         INTEGER NOT NULL,
  PRIMARY KEY (kode, medlem)
)`;

/** D1-udgaven. Testens hukommelses-udgave (huskGrupper i test/api-mock.mjs) har de samme metoder. */
export function d1Grupper(db) {
  const gruppe = r => (r ? {
    kode: r.kode, navn: r.navn, lavetAf: r.lavet_af, lavetAfNavn: r.lavet_af_navn, oprettet: r.oprettet,
  } : null);
  const medlem = r => ({ kode: r.kode, medlem: r.medlem, navn: r.medlem_navn, kom: r.kom });

  // Tabellerne laves ved første kald i stedet for i en migrering – som
  // beskederne og opkaldene. Så virker grupper, selv om schema.sql ikke er kørt
  // mod den rigtige database. Det sker én gang pr. worker.
  let klar = null;
  const sikr = () => (klar ||= (async () => {
    await db.prepare(TABEL_GRUPPER).run();
    await db.prepare(TABEL_MEDLEM).run();
    await db.prepare('CREATE INDEX IF NOT EXISTS gruppe_medlem_person ON gruppe_medlem (medlem, kom)').run();
  })().catch(e => { klar = null; throw e; }));

  return {
    async find(kode) {
      await sikr();
      return gruppe(await db.prepare('SELECT kode, navn, lavet_af, lavet_af_navn, oprettet FROM grupper WHERE kode = ?1')
        .bind(kode).first());
    },
    /** Grupperne jeg er med i, ældste først (den rækkefølge man kom ind i dem). */
    async mine(k) {
      await sikr();
      const r = await db.prepare(`SELECT g.kode, g.navn, g.lavet_af, g.lavet_af_navn, g.oprettet
        FROM grupper g JOIN gruppe_medlem m ON m.kode = g.kode WHERE m.medlem = ?1
        ORDER BY m.kom ASC LIMIT ?2`).bind(k, GRUPPER_MAKS).all();
      return r.results.map(gruppe);
    },
    async antalMine(k) {
      await sikr();
      const r = await db.prepare('SELECT COUNT(*) AS n FROM gruppe_medlem WHERE medlem = ?1').bind(k).first();
      return r ? r.n : 0;
    },
    async medlemmer(kode) {
      await sikr();
      const r = await db.prepare('SELECT kode, medlem, medlem_navn, kom FROM gruppe_medlem WHERE kode = ?1 ORDER BY kom ASC')
        .bind(kode).all();
      return r.results.map(medlem);
    },
    /** Medlemmerne i flere grupper på én gang: { kode: [ … ] }. */
    async medlemmerFlere(koder) {
      await sikr();
      const ud = {};
      if (!koder.length) return ud;
      const pladser = koder.map((_, i) => '?' + (i + 1)).join(', ');
      const r = await db.prepare(`SELECT kode, medlem, medlem_navn, kom FROM gruppe_medlem
        WHERE kode IN (${pladser}) ORDER BY kom ASC`).bind(...koder).all();
      for (const raa of r.results) (ud[raa.kode] ||= []).push(medlem(raa));
      return ud;
    },
    async opret(g) {
      await sikr();
      await db.prepare('INSERT INTO grupper (kode, navn, lavet_af, lavet_af_navn, oprettet) VALUES (?1, ?2, ?3, ?4, ?5)')
        .bind(g.kode, g.navn, g.lavetAf, g.lavetAfNavn, g.oprettet).run();
    },
    async tilfoej(kode, medlemNoegle, navn, nu) {
      await sikr();
      await db.prepare('INSERT OR IGNORE INTO gruppe_medlem (kode, medlem, medlem_navn, kom) VALUES (?1, ?2, ?3, ?4)')
        .bind(kode, medlemNoegle, navn, nu).run();
    },
    async fjern(kode, medlemNoegle) {
      await sikr();
      await db.prepare('DELETE FROM gruppe_medlem WHERE kode = ?1 AND medlem = ?2').bind(kode, medlemNoegle).run();
    },
    async omdoeb(kode, navn) {
      await sikr();
      await db.prepare('UPDATE grupper SET navn = ?2 WHERE kode = ?1').bind(kode, navn).run();
    },
    async slet(kode) {
      await sikr();
      await db.prepare('DELETE FROM gruppe_medlem WHERE kode = ?1').bind(kode).run();
      await db.prepare('DELETE FROM grupper WHERE kode = ?1').bind(kode).run();
    },
  };
}

/* ---------- API ---------- */

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});
const fejl = (status, besked) => json({ ok: false, fejl: besked }, status);

/** Alle mine grupper med den sidste besked og hvor meget der er kommet, siden jeg kiggede. */
async function status(lager, beskeder, navn, set = {}, ekstra = {}) {
  const k = noegle(navn);
  const mine = await lager.mine(k);
  const alle = await lager.medlemmerFlere(mine.map(g => g.kode));
  const grupper = [];
  let nye = 0;
  for (const g of mine) {
    const samtale = gruppeSamtale(g.kode);
    const sidst = await beskeder.sidsteI(samtale);
    const sidstSet = set[g.kode.toLowerCase()] || 0;
    // Mine egne beskeder er aldrig «nye» for mig selv – som i src/beskeder.mjs.
    const antal = !sidst || sidst.fra === k || sidst.id <= sidstSet ? 0 : await beskeder.antalEfter(samtale, sidstSet);
    nye += antal;
    grupper.push(synligGruppe(g, alle[g.kode] || [], k, {
      sidst: sidst ? synligBesked(sidst, k) : null,
      nye: antal,
    }));
  }
  // Den gruppe, der er snakket i sidst, står øverst; de tavse står efter navn.
  grupper.sort((a, b) => (b.sidst ? b.sidst.id : 0) - (a.sidst ? a.sidst.id : 0)
    || a.navn.localeCompare(b.navn, 'da-DK'));
  return json({ ok: true, navn, nye, grupper, ...ekstra });
}

/** Gruppens beskeder, som ét af medlemmerne ser dem. */
async function samtaleSvar(beskeder, g, medlemmer, navn, efter, ekstra = {}) {
  const k = noegle(navn);
  const raekker = await beskeder.hent(gruppeSamtale(g.kode), efter, HENT_MAKS);
  return json({
    ok: true,
    navn,
    gruppe: synligGruppe(g, medlemmer, k),
    beskeder: raekker.map(r => synligBesked(r, k)),
    ...ekstra,
  });
}

/**
 * Håndterer /api/grupper. `lager` er d1Grupper(env.DB) i drift, `beskeder` er
 * besked-lageret (gruppesnakken bor i den samme tabel), og `venner` er
 * venne-lageret, for man kan kun tage sine egne venner med ind.
 * Returnerer null, hvis stien ikke er API'ets.
 */
export async function haandterGrupper(request, lager, beskeder, venner, nu = Date.now()) {
  const url = new URL(request.url);
  if (url.pathname !== '/api/grupper' && url.pathname !== '/api/grupper/') return null;

  /* ----- Læs ----- */
  if (request.method === 'GET') {
    const mig = rensNavn(url.searchParams.get('navn'));
    if (!mig) return fejl(400, 'Skriv dit navn først');
    const k = noegle(mig);
    const kodeRaa = url.searchParams.get('kode');

    if (kodeRaa) {
      const kode = rensKode(kodeRaa);
      if (!kode) return fejl(400, 'Den gruppe findes ikke');
      const g = await lager.find(kode);
      if (!g) return fejl(404, 'Den gruppe findes ikke');
      const medl = await lager.medlemmer(kode);
      if (!medl.some(m => m.medlem === k)) return fejl(403, 'Du er ikke med i den gruppe');
      const efter = Number(url.searchParams.get('efter'));
      return samtaleSvar(beskeder, g, medl, mig, Number.isInteger(efter) && efter > 0 ? efter : 0);
    }

    return status(lager, beskeder, mig, laesSet(url.searchParams.get('set')));
  }

  if (request.method !== 'POST') return fejl(405, 'Brug GET eller POST');

  /* ----- Skriv ----- */
  let krop;
  try { krop = await request.json(); } catch (e) { return fejl(400, 'Kroppen skal være JSON'); }
  krop = krop && typeof krop === 'object' ? krop : {};

  const mig = rensNavn(krop.navn);
  if (!mig) return fejl(400, 'Skriv dit navn først');
  const k = noegle(mig);
  const handling = HANDLINGER.includes(krop.handling) ? krop.handling : 'skriv';
  const set = laesSet(krop.set);

  if (handling === 'lav') {
    const gruppeNavn = rensGruppeNavn(krop.gruppe);
    if (!gruppeNavn) return fejl(400, 'Giv gruppen et navn');
    if ((await lager.antalMine(k)) >= GRUPPER_MAKS) return fejl(400, 'Du er med i rigeligt med grupper');

    let kode = null;
    for (let i = 0; i < 8 && !kode; i++) {
      const bud = nyKode();
      if (!(await lager.find(bud))) kode = bud;
    }
    if (!kode) return fejl(503, 'Prøv igen om lidt');

    await lager.opret({ kode, navn: gruppeNavn, lavetAf: k, lavetAfNavn: mig, oprettet: nu });
    await lager.tilfoej(kode, k, mig, nu);
    return status(lager, beskeder, mig, set, { kode });
  }

  // Resten handler om én bestemt gruppe, som jeg skal være med i.
  const kode = rensKode(krop.kode);
  if (!kode) return fejl(400, 'Den gruppe findes ikke');
  const g = await lager.find(kode);
  if (!g) return fejl(404, 'Den gruppe findes ikke');
  const medl = await lager.medlemmer(kode);
  if (!medl.some(m => m.medlem === k)) return fejl(403, 'Du er ikke med i den gruppe');

  if (handling === 'gaa' || (handling === 'fjern' && noegle(rensNavn(krop.ven) || '') === k)) {
    await lager.fjern(kode, k);
    // Den sidste slukker lyset: en gruppe uden nogen i er der ikke nogen, der
    // kan læse – så den og snakken forsvinder i stedet for at blive liggende.
    if (medl.length <= 1) {
      await lager.slet(kode);
      await beskeder.sletSamtale(gruppeSamtale(kode));
    }
    return status(lager, beskeder, mig, set, { status: 'ude' });
  }

  if (handling === 'tilfoej') {
    const dig = rensNavn(krop.ven);
    if (!dig) return fejl(400, 'Hvem vil du have med?');
    const b = noegle(dig);
    if (b === k) return fejl(400, 'Du er selv med i forvejen');
    if (medl.some(m => m.medlem === b)) return status(lager, beskeder, mig, set, { status: 'med' });
    if (medl.length >= MEDLEM_MAKS) return fejl(400, 'Der er ikke plads til flere i gruppen');

    const venskab = await venner.par(k, b);
    if (!venskab || !venskab.svaret) return fejl(400, 'I er ikke venner endnu – så kan du ikke tage ' + dig + ' med');
    if ((await lager.antalMine(b)) >= GRUPPER_MAKS) return fejl(400, dig + ' er med i rigeligt med grupper');

    // Skriv navnet, som vennen selv staver det – ikke som den her telefon skrev det.
    const stavning = (venskab.fra === b ? venskab.fraNavn : venskab.tilNavn) || dig;
    await lager.tilfoej(kode, b, stavning, nu);
    return status(lager, beskeder, mig, set, { status: 'med', tilfoejet: stavning });
  }

  if (handling === 'fjern') {
    const dig = rensNavn(krop.ven);
    if (!dig) return fejl(400, 'Hvem vil du tage ud?');
    if (g.lavetAf !== k) return fejl(403, 'Kun ' + g.lavetAfNavn + ' kan tage nogen ud af gruppen');
    await lager.fjern(kode, noegle(dig));
    return status(lager, beskeder, mig, set, { status: 'ude' });
  }

  if (handling === 'omdoeb') {
    if (g.lavetAf !== k) return fejl(403, 'Kun ' + g.lavetAfNavn + ' kan give gruppen et nyt navn');
    const nytNavn = rensGruppeNavn(krop.gruppe);
    if (!nytNavn) return fejl(400, 'Giv gruppen et navn');
    await lager.omdoeb(kode, nytNavn);
    return status(lager, beskeder, mig, set, { status: 'omdoebt' });
  }

  // handling === 'skriv': en besked til hele gruppen.
  const tekst = rensBesked(krop.tekst);
  if (!tekst) return fejl(400, 'Skriv noget først');
  if ((await beskeder.antalFra(k, nu - SPAM_VINDUE_MS)) >= SPAM_MAKS) return fejl(429, 'Du skriver for hurtigt – vent lidt');

  const id = await beskeder.gem({
    samtale: gruppeSamtale(kode),
    fra: k, fraNavn: mig,
    til: kode.toLowerCase(), tilNavn: g.navn,
    tekst, oprettet: nu,
  });
  const efter = Number.isInteger(krop.efter) && krop.efter > 0 ? krop.efter : 0;
  return samtaleSvar(beskeder, g, medl, mig, efter, { id });
}
