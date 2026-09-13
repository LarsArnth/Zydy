/*
  Motoren bag «Mit liv» – huset, figuren, behovene, møblerne og arbejdet.

  Filen er ren JS uden DOM og uden canvas, så et helt liv kan spilles igennem
  uden browser (test/unit/mitliv.test.mjs). index.html tegner huset oppefra,
  tager imod fingrene og lader tiden gå.

  Fire ting styrer spillet:

  1. **Behovene falder med spiltiden.** Mæt, energi, toilet, ren, sjov og
     selskab er tal fra 0 til 100, der siver nedad time for time. Et møbel
     fylder ét behov op med en fart pr. time (FART), så hvor længe man sidder
     på toilettet afgøres af, hvor meget man manglede – ikke af et stopur.

  2. **Man trykker på et møbel, og figuren går selv derhen.** Ruten findes med
     en bredde-først-søgning gennem de tomme felter (vejTil), og møblet bruges,
     når figuren står ved siden af det. Derfor kan et møbel aldrig blive
     ubrugeligt, fordi man har spærret det inde – kan der ikke findes en vej,
     siger spillet nej med det samme i stedet for at gå i stå.

  3. **Lønnen følger humøret.** Man går på arbejde om morgenen, er væk i seks
     spiltimer og kommer hjem med penge. Har man passet sig selv, giver dagen
     både mere i løn og stjerner mod en forfremmelse; kommer man sulten og
     træt på arbejde, giver den næsten ingenting. Det er dét, der gør behovene
     værd at passe – ellers kunne man bare lade figuren sidde og kede sig.

  4. **Pynt tæller med i humøret** (hygge). En potteplante gør ikke noget ved
     et behov, men et hus uden noget på væggene trykker humøret – ellers ville
     der ikke være nogen grund til at købe andet end det allernødvendigste.
*/

/* ---------- Huset ---------- */
export const BREDDE = 10;          // felter på tværs
export const HOEJDE = 8;           // felter ned
export const DOER = { x: 4, y: HOEJDE - 1 };   // hoveddøren i bundvæggen

/* ---------- Behovene ---------- */
export const BEHOV = ['mad', 'energi', 'toilet', 'renhed', 'sjov', 'selskab'];

export const BEHOV_NAVN = {
  mad: 'Mæt', energi: 'Energi', toilet: 'Toilet',
  renhed: 'Ren', sjov: 'Sjov', selskab: 'Selskab',
};

/** Hvor mange point hvert behov falder pr. spiltime. */
export const FORFALD = { mad: 7, energi: 5.5, toilet: 8, renhed: 4.5, sjov: 6.5, selskab: 4 };

export const SOVE_FORFALD = 0.4;      // de andre behov siver langsommere, mens man sover
export const ARBEJDS_FORFALD = 0.6;   // og lidt langsommere på arbejde (man spiser frokost)

/* ---------- Tiden ---------- */
export const DAG = 24 * 60;                 // spilminutter på et døgn
export const START_MINUT = 8 * 60;          // spillet begynder dag 1 kl. 8
export const GANG_MIN_PR_FELT = 3;          // spilminutter om at gå ét felt
export const ARBEJDE_TIMER = 6;
export const ARBEJDE_AABNER = 6 * 60;       // man kan tage på arbejde mellem 6 …
export const ARBEJDE_LUKKER = 12 * 60;      // … og 12 (bredt nok til, at man ikke misser dagen)
export const GAEST_TIMER = 4;               // så længe bliver besøget
export const GAEST_VENTER = 20;             // spilminutter fra man ringer, til der bankes på

export const dagen = minut => Math.floor(minut / DAG) + 1;
export const paaUret = minut => ((minut % DAG) + DAG) % DAG;
export const klokken = minut => {
  const m = Math.floor(paaUret(minut));
  return `${String(Math.floor(m / 60)).padStart(2, '0')}.${String(m % 60).padStart(2, '0')}`;
};

/* ---------- Arbejdet ---------- */
/*
  Lønnen er sat efter møblernes priser: en god dag som avisbud giver knap 400
  kr., så fjernsynet til 600 kan købes efter et par dage. Går det langsommere
  end det, når et barn ikke at se noget ske, før telefonen bliver lagt væk.
*/
export const JOBS = [
  { navn: 'Avisbud', loen: 300, emoji: '📰' },
  { navn: 'Hundelufter', loen: 500, emoji: '🐕' },
  { navn: 'Iskiosk', loen: 800, emoji: '🍦' },
  { navn: 'Bager', loen: 1200, emoji: '🥐' },
  { navn: 'Dyrepasser', loen: 1700, emoji: '🦒' },
  { navn: 'Brandmand', loen: 2400, emoji: '🚒' },
  { navn: 'Popstjerne', loen: 3400, emoji: '🎤' },
  { navn: 'Astronaut', loen: 5000, emoji: '🚀' },
];
export const STJERNER_PR_NIVEAU = 4;   // så mange gode arbejdsdage koster en forfremmelse

/* ---------- Møblerne ---------- */
/*
  `behov` er det, møblet fylder op, og `fart` er point pr. spiltime. `ogsaa` er
  de behov, der får lidt med på vejen (et bad er også lidt sjovt). `hygge` er
  pynteværdien, der tæller med i humøret. `sover` betyder, at figuren ligger
  ned og de andre behov siver langsommere.
*/
export const TING = [
  { id: 'seng', navn: 'Seng', pris: 400, rum: 'sove', behov: 'energi', fart: 55, sover: true, hygge: 1, gør: 'sover' },
  { id: 'himmelseng', navn: 'Himmelseng', pris: 1400, rum: 'sove', behov: 'energi', fart: 90, sover: true, hygge: 4, ogsaa: { sjov: 6 }, gør: 'sover som en prinsesse' },
  { id: 'sofa', navn: 'Sofa', pris: 400, rum: 'stue', behov: 'energi', fart: 26, hygge: 3, ogsaa: { sjov: 22 }, gør: 'slapper af' },
  { id: 'toilet', navn: 'Toilet', pris: 250, rum: 'bad', behov: 'toilet', fart: 260, hygge: 0, gør: 'er på toilettet' },
  { id: 'guldtoilet', navn: 'Guldtoilet', pris: 900, rum: 'bad', behov: 'toilet', fart: 420, hygge: 3, ogsaa: { sjov: 10 }, gør: 'sidder på guldtoilettet' },
  { id: 'brus', navn: 'Brusebad', pris: 350, rum: 'bad', behov: 'renhed', fart: 210, hygge: 1, gør: 'går i bad' },
  { id: 'badekar', navn: 'Badekar', pris: 950, rum: 'bad', behov: 'renhed', fart: 280, hygge: 3, ogsaa: { sjov: 25, energi: 8 }, gør: 'ligger i badekarret' },
  { id: 'koeleskab', navn: 'Køleskab', pris: 450, rum: 'koekken', behov: 'mad', fart: 150, hygge: 0, gør: 'spiser en mellemmad' },
  { id: 'komfur', navn: 'Komfur', pris: 550, rum: 'koekken', behov: 'mad', fart: 300, hygge: 1, ogsaa: { sjov: 6 }, gør: 'laver mad' },
  { id: 'bord', navn: 'Spisebord', pris: 220, rum: 'koekken', behov: 'selskab', fart: 40, hygge: 4, ogsaa: { mad: 20 }, gør: 'sidder ved bordet' },
  { id: 'tv', navn: 'Fjernsyn', pris: 600, rum: 'stue', behov: 'sjov', fart: 95, hygge: 2, gør: 'ser fjernsyn' },
  { id: 'computer', navn: 'Computer', pris: 1300, rum: 'stue', behov: 'sjov', fart: 140, hygge: 2, ogsaa: { selskab: 30 }, gør: 'spiller på computeren' },
  { id: 'bogreol', navn: 'Bogreol', pris: 450, rum: 'stue', behov: 'sjov', fart: 70, hygge: 5, gør: 'læser en bog' },
  { id: 'guitar', navn: 'Guitar', pris: 750, rum: 'stue', behov: 'sjov', fart: 115, hygge: 3, gør: 'spiller guitar' },
  { id: 'arkade', navn: 'Spillemaskine', pris: 1600, rum: 'stue', behov: 'sjov', fart: 180, hygge: 4, gør: 'spiller arkadespil' },
  { id: 'hoejttaler', navn: 'Højttaler', pris: 550, rum: 'stue', behov: 'sjov', fart: 85, hygge: 2, ogsaa: { selskab: 20, energi: 5 }, gør: 'danser' },
  { id: 'telefon', navn: 'Telefon', pris: 200, rum: 'stue', behov: 'selskab', fart: 90, hygge: 1, ringer: true, gør: 'snakker i telefon' },
  { id: 'plante', navn: 'Potteplante', pris: 120, rum: 'pynt', hygge: 5, gør: 'kigger på planten' },
  { id: 'lampe', navn: 'Lampe', pris: 150, rum: 'pynt', hygge: 6, gør: 'tænder lampen' },
  { id: 'taeppe', navn: 'Tæppe', pris: 100, rum: 'pynt', hygge: 4, gør: 'retter på tæppet' },
];

export const tingen = id => TING.find(t => t.id === id) || null;

/** Det, man har med fra begyndelsen – nok til at kunne klare sig den første dag. */
export const START_TING = [
  { id: 'seng', x: 1, y: 1 },
  { id: 'toilet', x: 8, y: 1 },
  { id: 'brus', x: 8, y: 3 },
  { id: 'koeleskab', x: 1, y: 5 },
];
export const START_PENGE = 600;

/* ---------- Udseende ---------- */
export const HUD = ['#f6d3b4', '#e8b98e', '#c68a5e', '#96603a', '#5f3a24'];
export const HAAR = ['kort', 'langt', 'tot', 'krøller', 'hestehale'];
export const HAARFARVER = ['#f2c14e', '#8d5524', '#3a2a22', '#d1462f', '#ffffff'];
export const TROEJER = ['#ff5c7a', '#5b8cff', '#5ee0a8', '#ffd447', '#b45fc4', '#fff7e6'];
export const BUKSER = ['#3a4a8c', '#45407a', '#2d6a4f', '#8c4a2f', '#2b2440'];

export const STANDARD_UDSEENDE = { hud: 0, haar: 0, haarfarve: 0, troeje: 0, bukser: 0 };

/** Retter et udseende til, så det altid peger på noget, der findes. */
export function pudsUdseende(u) {
  const klem = (v, liste) => (Number.isInteger(v) && v >= 0 && v < liste.length ? v : 0);
  const o = u && typeof u === 'object' ? u : {};
  return {
    hud: klem(o.hud, HUD), haar: klem(o.haar, HAAR), haarfarve: klem(o.haarfarve, HAARFARVER),
    troeje: klem(o.troeje, TROEJER), bukser: klem(o.bukser, BUKSER),
  };
}

/* ---------- Vennerne, der kan komme på besøg ---------- */
export const VENNER = ['Sofie', 'Selma', 'Emil', 'Alma', 'Noah', 'Freja', 'Oscar', 'Ida', 'Villads', 'Clara'];

/* ================= Et nyt hjem ================= */

export function nytHjem(navn, udseende) {
  return {
    navn: (navn || 'Mig').trim().slice(0, 12) || 'Mig',
    udseende: pudsUdseende(udseende),
    minut: START_MINUT,
    penge: START_PENGE,
    behov: { mad: 70, energi: 80, toilet: 75, renhed: 85, sjov: 60, selskab: 55 },
    ting: START_TING.map(t => ({ ...t })),
    pytter: [],                     // uheld på gulvet
    job: { niveau: 0, stjerner: 0, sidsteDag: 0 },
    figur: { x: DOER.x, y: DOER.y - 1, vej: [], andel: 0, retning: 'ned' },
    handling: null,                 // { slags, ting, pyt }
    venter: null,                   // handlingen der starter, når figuren er fremme
    arbejde: null,                  // { til, humoer }
    gaest: null,                    // { navn, x, y, kommer, gaar }
    bedste: 0,                      // højeste formue, vi har set (det er den, toplisten måler)
  };
}

/* ================= Felter og veje ================= */

export const indenfor = (x, y) => x >= 0 && y >= 0 && x < BREDDE && y < HOEJDE;

/** Møblet på feltet, eller null. */
export function paaFeltet(hjem, x, y) {
  const i = hjem.ting.findIndex(t => t.x === x && t.y === y);
  return i < 0 ? null : { ...hjem.ting[i], nr: i, ting: tingen(hjem.ting[i].id) };
}

/** Kan man gå på feltet? (Møbler spærrer, gulvet gør ikke.) */
export const frit = (hjem, x, y) => indenfor(x, y) && !hjem.ting.some(t => t.x === x && t.y === y);

/** Må der stilles møbler på feltet? Døren skal holdes fri, så man kan komme ud. */
export const kanBygges = (hjem, x, y) => frit(hjem, x, y) && !(x === DOER.x && y === DOER.y);

const naboer = p => [{ x: p.x + 1, y: p.y }, { x: p.x - 1, y: p.y }, { x: p.x, y: p.y + 1 }, { x: p.x, y: p.y - 1 }];

/**
 * Korteste vej fra `fra` til det første felt, `erMaal` siger ja til. Går kun
 * gennem tomme felter. Returnerer listen af felter man skal gå til (uden
 * startfeltet), [] hvis man allerede står der, eller null hvis der ikke er nogen vej.
 */
export function vejTil(hjem, fra, erMaal) {
  if (erMaal(fra.x, fra.y)) return [];
  const noegle = (x, y) => y * BREDDE + x;
  const kom = new Map([[noegle(fra.x, fra.y), null]]);
  const koe = [fra];
  while (koe.length) {
    const p = koe.shift();
    for (const n of naboer(p)) {
      if (!indenfor(n.x, n.y) || !frit(hjem, n.x, n.y)) continue;
      const k = noegle(n.x, n.y);
      if (kom.has(k)) continue;
      kom.set(k, p);
      if (erMaal(n.x, n.y)) {
        const vej = [];
        for (let q = n; q; q = kom.get(noegle(q.x, q.y))) vej.unshift(q);
        return vej.slice(1).map(f => ({ x: f.x, y: f.y }));
      }
      koe.push(n);
    }
  }
  return null;
}

/** Vejen hen til feltet selv. */
export const vejenTil = (hjem, fra, x, y) => vejTil(hjem, fra, (a, b) => a === x && b === y);

/** Vejen hen til et felt ved siden af (x, y) – dér står man, når man bruger et møbel. */
export const vejenHenTil = (hjem, fra, x, y) =>
  vejTil(hjem, fra, (a, b) => Math.abs(a - x) + Math.abs(b - y) === 1);

/* ================= Figurens position ================= */

/** Hvor figuren står lige nu, som brøkdele af felter (til tegningen). */
export function hvor(hjem) {
  const f = hjem.figur;
  const naeste = f.vej[0];
  if (!naeste) return { x: f.x, y: f.y };
  return { x: f.x + (naeste.x - f.x) * f.andel, y: f.y + (naeste.y - f.y) * f.andel };
}

export const gaar = hjem => hjem.figur.vej.length > 0;

/* ================= Hvad man kan sætte i gang ================= */

/**
 * Et tryk på et felt. Er der et møbel, går figuren hen og bruger det; er der en
 * pyt, tørres den op; ellers går figuren bare derhen. Returnerer hvad der blev
 * sat i gang ('bruger' | 'gaar' | 'rydder' | 'snakker') eller null.
 */
export function tryk(hjem, x, y) {
  if (hjem.arbejde || !indenfor(x, y)) return null;
  if (hjem.handling?.slags === 'besvimet') return null;
  const g = hjem.gaest;
  if (g && g.kommet && g.x === x && g.y === y) return snak(hjem);
  const m = paaFeltet(hjem, x, y);
  if (m) return brug(hjem, m.nr);
  const pyt = hjem.pytter.findIndex(p => p.x === x && p.y === y);
  if (pyt >= 0) return ryd(hjem, pyt);
  const vej = vejenTil(hjem, hjem.figur, x, y);
  if (!vej) return null;
  saetVej(hjem, vej, null);
  return 'gaar';
}

/** Sætter figuren på vej og husker, hvad der skal ske, når den er fremme. */
function saetVej(hjem, vej, venter) {
  hjem.handling = null;
  hjem.figur.vej = vej;
  hjem.figur.andel = 0;
  hjem.venter = venter;
  if (!vej.length && venter) startHandling(hjem);
}

/** Bruger møbel nr. `nr`. Returnerer 'bruger' eller null, hvis der ikke er nogen vej derhen. */
export function brug(hjem, nr) {
  const m = hjem.ting[nr];
  if (!m || hjem.arbejde) return null;
  const vej = vejenHenTil(hjem, hjem.figur, m.x, m.y);
  if (!vej) return null;
  saetVej(hjem, vej, { slags: 'ting', ting: nr });
  return 'bruger';
}

/** Tørrer pyt nr. `nr` op. */
export function ryd(hjem, nr) {
  const p = hjem.pytter[nr];
  if (!p || hjem.arbejde) return null;
  const vej = vejenTil(hjem, hjem.figur, p.x, p.y) ?? vejenHenTil(hjem, hjem.figur, p.x, p.y);
  if (!vej) return null;
  saetVej(hjem, vej, { slags: 'ryd', pyt: nr });
  return 'rydder';
}

/** Går hen og snakker med gæsten. */
export function snak(hjem) {
  const g = hjem.gaest;
  if (!g || !g.kommet || hjem.arbejde) return null;
  const vej = vejenHenTil(hjem, hjem.figur, g.x, g.y);
  if (!vej) return null;
  saetVej(hjem, vej, { slags: 'snak' });
  return 'snakker';
}

/** Stopper det, figuren er i gang med (uden at flytte den). */
export function stop(hjem) {
  if (hjem.handling?.slags === 'besvimet') return false;
  hjem.handling = null;
  hjem.venter = null;
  hjem.figur.vej = [];
  hjem.figur.andel = 0;
  return true;
}

function startHandling(hjem) {
  const v = hjem.venter;
  hjem.venter = null;
  if (!v) return;
  if (v.slags === 'ting' && !hjem.ting[v.ting]) return;      // møblet er solgt imens
  if (v.slags === 'ryd' && !hjem.pytter[v.pyt]) return;
  if (v.slags === 'snak' && !hjem.gaest?.kommet) return;
  hjem.handling = { ...v, fra: hjem.minut };
  if (v.slags === 'ting') {
    const t = tingen(hjem.ting[v.ting].id);
    hjem.figur.retning = retningMod(hjem.figur, hjem.ting[v.ting]);
    if (t?.ringer && !hjem.gaest) ringTilVen(hjem);
  }
}

const retningMod = (fra, til) => {
  if (Math.abs(til.x - fra.x) >= Math.abs(til.y - fra.y)) return til.x > fra.x ? 'hoejre' : 'venstre';
  return til.y > fra.y ? 'ned' : 'op';
};

/** Hvad figuren laver lige nu, som en linje man kan vise. */
export function laver(hjem) {
  if (hjem.arbejde) return `${hjem.navn} er på arbejde`;
  const h = hjem.handling;
  if (h?.slags === 'besvimet') return `${hjem.navn} faldt i søvn på gulvet …`;
  if (h?.slags === 'ryd') return `${hjem.navn} tørrer op`;
  if (h?.slags === 'snak') return `${hjem.navn} snakker med ${hjem.gaest?.navn ?? 'gæsten'}`;
  if (h?.slags === 'ting') {
    const t = tingen(hjem.ting[h.ting]?.id);
    if (t) return `${hjem.navn} ${t.gør}`;
  }
  if (gaar(hjem)) return `${hjem.navn} går …`;
  return `${hjem.navn} venter på en god idé`;
}

/* ================= Tiden går ================= */

const klem = v => Math.max(0, Math.min(100, v));

/**
 * Lader `min` spilminutter gå: behovene siver, figuren går, møblet virker,
 * arbejdsdagen skrider frem, og uheld sker. Returnerer en liste af hændelser,
 * som skærmen kan sige noget om.
 *
 * `rnd` bruges kun til gæstens småture, så en test kan gøre det forudsigeligt.
 */
export function tik(hjem, min, rnd = Math.random) {
  const haendelser = [];
  let rest = Math.max(0, Math.min(min, 24 * 60));
  while (rest > 0) {
    const skridt = Math.min(rest, 5);
    etSkridt(hjem, skridt, haendelser, rnd);
    rest -= skridt;
  }
  const f = formue(hjem);
  if (f > hjem.bedste) hjem.bedste = f;
  return haendelser;
}

function etSkridt(hjem, min, ud, rnd) {
  hjem.minut += min;
  const timer = min / 60;

  // 1. Behovene siver
  const h = hjem.handling;
  const paaTing = h?.slags === 'ting' ? tingen(hjem.ting[h.ting]?.id) : null;
  const sover = !!(paaTing?.sover) || h?.slags === 'besvimet';
  const fart = hjem.arbejde ? ARBEJDS_FORFALD : sover ? SOVE_FORFALD : 1;
  for (const b of BEHOV) hjem.behov[b] = klem(hjem.behov[b] - FORFALD[b] * fart * timer);

  // 2. Arbejdsdagen
  if (hjem.arbejde) {
    if (hjem.minut >= hjem.arbejde.til) hjemFraArbejde(hjem, ud);
    return;                                     // resten sker jo ikke, mens man er væk
  }

  // 3. Gang
  if (hjem.figur.vej.length) {
    let tilbage = min / GANG_MIN_PR_FELT;
    while (tilbage > 0 && hjem.figur.vej.length) {
      hjem.figur.retning = retningMod(hjem.figur, hjem.figur.vej[0]);
      const brugt = Math.min(tilbage, 1 - hjem.figur.andel);
      hjem.figur.andel += brugt;
      tilbage -= brugt;
      if (hjem.figur.andel >= 1 - 1e-9) {
        const n = hjem.figur.vej.shift();
        hjem.figur.x = n.x; hjem.figur.y = n.y; hjem.figur.andel = 0;
      }
    }
    if (!hjem.figur.vej.length) startHandling(hjem);
  }

  // 4. Møblet (eller snakken) virker
  virk(hjem, timer, ud);

  // 5. Gæsten
  gaestenLever(hjem, ud, rnd);

  // 6. Uheld
  uheld(hjem, ud);
}

/** Det, figuren er i gang med, fylder behovene op. */
function virk(hjem, timer, ud) {
  const h = hjem.handling;
  if (!h) return;
  if (h.slags === 'besvimet') {
    hjem.behov.energi = klem(hjem.behov.energi + 45 * timer);
    if (hjem.behov.energi >= 45) { hjem.handling = null; ud.push({ slags: 'vaagnede' }); }
    return;
  }
  if (h.slags === 'ryd') {
    const p = hjem.pytter[h.pyt];
    if (!p) { hjem.handling = null; return; }
    p.rest = (p.rest ?? 1) - timer / 0.33;                 // en pyt tager 20 spilminutter
    if (p.rest <= 0) {
      hjem.pytter.splice(h.pyt, 1);
      hjem.handling = null;
      hjem.behov.renhed = klem(hjem.behov.renhed + 6);
      ud.push({ slags: 'ryddet' });
    }
    return;
  }
  if (h.slags === 'snak') {
    const g = hjem.gaest;
    if (!g?.kommet) { hjem.handling = null; return; }
    hjem.figur.retning = retningMod(hjem.figur, g);
    hjem.behov.selskab = klem(hjem.behov.selskab + 200 * timer);
    hjem.behov.sjov = klem(hjem.behov.sjov + 70 * timer);
    if (hjem.behov.selskab >= 100) { hjem.handling = null; ud.push({ slags: 'faerdig', hvad: 'snakken' }); }
    return;
  }
  const m = hjem.ting[h.ting];
  const t = tingen(m?.id);
  if (!t) { hjem.handling = null; return; }
  if (!t.behov) {                                          // ren pynt: man kigger lidt på den
    hjem.behov.sjov = klem(hjem.behov.sjov + 25 * timer);
    if (hjem.minut - h.fra >= 30) { hjem.handling = null; ud.push({ slags: 'faerdig', hvad: t.navn }); }
    return;
  }
  hjem.behov[t.behov] = klem(hjem.behov[t.behov] + t.fart * timer);
  for (const [b, f] of Object.entries(t.ogsaa || {})) hjem.behov[b] = klem(hjem.behov[b] + f * timer);
  if (hjem.behov[t.behov] >= 100) { hjem.handling = null; ud.push({ slags: 'faerdig', hvad: t.navn }); }
}

/** Gæsten banker på, går lidt rundt og tager hjem igen. */
function gaestenLever(hjem, ud, rnd) {
  const g = hjem.gaest;
  if (!g) return;
  if (!g.kommet) {
    if (hjem.minut >= g.kommer) {
      const plads = vejTil(hjem, { x: DOER.x, y: DOER.y }, (x, y) => y <= HOEJDE - 3 && frit(hjem, x, y));
      const felt = plads?.length ? plads[plads.length - 1] : { x: DOER.x, y: DOER.y - 1 };
      g.kommet = true; g.x = felt.x; g.y = felt.y;
      ud.push({ slags: 'gaest', navn: g.navn });
    }
    return;
  }
  if (hjem.minut >= g.gaar) {
    hjem.gaest = null;
    if (hjem.handling?.slags === 'snak') hjem.handling = null;
    ud.push({ slags: 'gaestGik', navn: g.navn });
    return;
  }
  // En lille tur rundt i stuen nu og da – men ikke mens vi står og snakker
  if (hjem.handling?.slags !== 'snak' && rnd() < 0.02) {
    const kan = naboer(g).filter(n => frit(hjem, n.x, n.y) && n.y <= HOEJDE - 2);
    if (kan.length) {
      const n = kan[Math.floor(rnd() * kan.length) % kan.length];
      g.x = n.x; g.y = n.y;
    }
  }
}

/** Toilettet kan ikke vente i det uendelige, og en træt figur falder i søvn. */
function uheld(hjem, ud) {
  const brugt = hjem.handling?.slags === 'ting' ? tingen(hjem.ting[hjem.handling.ting]?.id) : null;
  // Man når ikke altid derud – men ikke midt i et toiletbesøg, og ikke i søvne.
  if (hjem.behov.toilet <= 0 && brugt?.behov !== 'toilet' && !brugt?.sover) {
    const f = { x: hjem.figur.x, y: hjem.figur.y, rest: 1 };
    if (!hjem.pytter.some(p => p.x === f.x && p.y === f.y)) hjem.pytter.push(f);
    hjem.behov.toilet = 55;
    hjem.behov.renhed = klem(hjem.behov.renhed - 25);
    hjem.behov.sjov = klem(hjem.behov.sjov - 10);
    stop(hjem);
    ud.push({ slags: 'uheld' });
  }
  if (hjem.behov.energi <= 0 && hjem.handling?.slags !== 'besvimet' && !brugt?.sover) {
    stop(hjem);
    hjem.handling = { slags: 'besvimet', fra: hjem.minut };
    ud.push({ slags: 'besvimet' });
  }
}

/* ================= Arbejdet ================= */

export const jobbet = hjem => JOBS[Math.max(0, Math.min(JOBS.length - 1, hjem.job.niveau))];

/** Kan man tage på arbejde lige nu? (Morgen, og ikke allerede været af sted i dag.) */
export function kanArbejde(hjem) {
  if (hjem.arbejde) return false;
  const t = paaUret(hjem.minut);
  return t >= ARBEJDE_AABNER && t < ARBEJDE_LUKKER && hjem.job.sidsteDag !== dagen(hjem.minut);
}

/** Hvorfor man ikke kan tage på arbejde – en linje til skærmen. */
export function arbejdeBesked(hjem) {
  if (hjem.arbejde) return 'Du er på arbejde.';
  if (hjem.job.sidsteDag === dagen(hjem.minut)) return 'Du har været på arbejde i dag. Bussen kører igen i morgen kl. 7.';
  const t = paaUret(hjem.minut);
  if (t < ARBEJDE_AABNER) return `Bussen kører kl. ${klokken(ARBEJDE_AABNER)}. Sov lidt endnu.`;
  if (t >= ARBEJDE_LUKKER) return 'Bussen er kørt for i dag. Prøv i morgen tidlig.';
  return 'Af sted!';
}

/** Sender figuren på arbejde. Returnerer false, hvis bussen ikke kører nu. */
export function tagPaaArbejde(hjem) {
  if (!kanArbejde(hjem)) return false;
  stop(hjem);
  hjem.figur.x = DOER.x; hjem.figur.y = DOER.y;
  hjem.arbejde = { til: hjem.minut + ARBEJDE_TIMER * 60, humoer: humoer(hjem) };
  hjem.job.sidsteDag = dagen(hjem.minut);
  return true;
}

/** Hvor mange stjerner en arbejdsdag med det humør giver. */
export const stjernerFor = h => (h >= 65 ? 2 : h >= 35 ? 1 : 0);

function hjemFraArbejde(hjem, ud) {
  const job = jobbet(hjem);
  const hum = hjem.arbejde.humoer;
  const kr = Math.round((job.loen * (0.7 + 0.6 * (hum / 100))) / 10) * 10;
  hjem.penge += kr;
  hjem.arbejde = null;
  hjem.figur.x = DOER.x; hjem.figur.y = DOER.y;
  hjem.figur.vej = []; hjem.figur.andel = 0; hjem.figur.retning = 'op';
  const stjerner = stjernerFor(hum);
  hjem.job.stjerner += stjerner;
  ud.push({ slags: 'loen', kr, job: job.navn, stjerner, humoer: hum });
  while (hjem.job.stjerner >= STJERNER_PR_NIVEAU && hjem.job.niveau < JOBS.length - 1) {
    hjem.job.stjerner -= STJERNER_PR_NIVEAU;
    hjem.job.niveau++;
    ud.push({ slags: 'forfremmet', job: jobbet(hjem).navn, niveau: hjem.job.niveau });
  }
  if (hjem.job.niveau >= JOBS.length - 1) hjem.job.stjerner = Math.min(hjem.job.stjerner, STJERNER_PR_NIVEAU);
}

/* ================= Butikken og bygningen ================= */

/** Køber en ting og stiller den på feltet. Returnerer false, hvis der ikke er råd eller plads. */
export function koeb(hjem, id, x, y) {
  const t = tingen(id);
  if (!t || hjem.penge < t.pris || !kanBygges(hjem, x, y)) return false;
  hjem.ting.push({ id, x, y });
  if (spaerrerVejen(hjem)) { hjem.ting.pop(); return false; }
  hjem.penge -= t.pris;
  skubFiguren(hjem);
  return true;
}

/** Står figuren (eller gæsten) inde i et møbel, skubbes den ud på nærmeste frie felt. */
function skubFiguren(hjem) {
  for (const en of [hjem.figur, hjem.gaest]) {
    if (!en || frit(hjem, en.x, en.y)) continue;
    const vej = vejTil(hjem, { x: DOER.x, y: DOER.y }, (x, y) => Math.abs(x - en.x) + Math.abs(y - en.y) === 1);
    const felt = vej?.length ? vej[vej.length - 1] : naboer(en).find(n => frit(hjem, n.x, n.y));
    if (!felt) continue;
    en.x = felt.x; en.y = felt.y;
    if (en.vej) { en.vej = []; en.andel = 0; }
    if (en === hjem.figur) { hjem.handling = null; hjem.venter = null; }
  }
}

/** Sælger møbel nr. `nr` for det halve. Returnerer beløbet (0 hvis der ikke var noget). */
export function saelg(hjem, nr) {
  const m = hjem.ting[nr];
  if (!m) return 0;
  const kr = Math.round((tingen(m.id)?.pris || 0) / 2);
  hjem.ting.splice(nr, 1);
  hjem.penge += kr;
  if (hjem.handling?.slags === 'ting') hjem.handling = null;
  if (hjem.venter?.slags === 'ting') hjem.venter = null;
  return kr;
}

/** Flytter møbel nr. `nr` til et andet felt. */
export function flyt(hjem, nr, x, y) {
  const m = hjem.ting[nr];
  if (!m || !kanBygges(hjem, x, y)) return false;
  const gammel = { x: m.x, y: m.y };
  m.x = x; m.y = y;
  if (spaerrerVejen(hjem)) { m.x = gammel.x; m.y = gammel.y; return false; }
  skubFiguren(hjem);
  return true;
}

/**
 * Er huset spærret af, som det står nu? Vi tjekker, at man fra døren kan nå
 * hvert eneste møbel – ellers kunne man mure sengen (eller sig selv) inde med
 * en række potteplanter, og så er der ikke andet at gøre end at begynde forfra.
 */
export function spaerrerVejen(hjem) {
  const fra = { x: DOER.x, y: DOER.y };
  if (!frit(hjem, fra.x, fra.y)) return true;
  return hjem.ting.some(m => !vejenHenTil(hjem, fra, m.x, m.y));
}

/* ================= Humør, formue og gæster ================= */

/** Pynten i huset, 0–100. Et tomt hus er ikke rart at være i. */
export const hygge = hjem =>
  Math.min(100, hjem.ting.reduce((s, m) => s + (tingen(m.id)?.hygge || 0), 0) * 5 - hjem.pytter.length * 10);

/**
 * Humøret, 0–100. Gennemsnittet af behovene alene dur ikke: mangler ét behov
 * helt, er man ikke i godt humør, selv om resten er fyldt. Hyggen tæller med
 * som en fjerdedel, så det kan betale sig at pynte op.
 */
export function humoer(hjem) {
  const vaerdier = BEHOV.map(b => hjem.behov[b]);
  const snit = vaerdier.reduce((a, b) => a + b, 0) / vaerdier.length;
  const lavest = Math.min(...vaerdier);
  const behovsdel = snit * 0.7 + lavest * 0.3;
  return Math.round(Math.max(0, Math.min(100, behovsdel * 0.75 + Math.max(0, hygge(hjem)) * 0.25)));
}

/** Det behov, der trænger mest. */
export const mestTraengende = hjem => BEHOV.reduce((a, b) => (hjem.behov[b] < hjem.behov[a] ? b : a));

/** Formuen: pengene plus alt, huset er fyldt med. Det er den, toplisten måler. */
export const formue = hjem =>
  Math.round(hjem.penge + hjem.ting.reduce((s, m) => s + (tingen(m.id)?.pris || 0), 0));

/** Ringer efter en ven, der kommer på besøg lidt efter. Returnerer navnet eller null. */
export function ringTilVen(hjem, navn, rnd = Math.random) {
  if (hjem.gaest) return null;
  const mulige = VENNER.filter(v => v.toLowerCase() !== hjem.navn.toLowerCase());
  const valgt = navn || mulige[Math.floor(rnd() * mulige.length) % mulige.length];
  hjem.gaest = {
    navn: valgt, x: DOER.x, y: DOER.y, kommet: false,
    kommer: hjem.minut + GAEST_VENTER, gaar: hjem.minut + GAEST_VENTER + GAEST_TIMER * 60,
  };
  return valgt;
}

/* ================= Gem og hent ================= */

export function serialiser(hjem) {
  return {
    v: 1,
    navn: hjem.navn, udseende: { ...hjem.udseende },
    minut: Math.round(hjem.minut), penge: Math.round(hjem.penge),
    behov: { ...hjem.behov },
    ting: hjem.ting.map(t => ({ id: t.id, x: t.x, y: t.y })),
    job: { ...hjem.job },
    figur: { x: hjem.figur.x, y: hjem.figur.y },
    bedste: Math.round(hjem.bedste),
  };
}

const tal = (v, fald, min, maks) =>
  (typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.min(maks, v)) : fald);

/**
 * Læser et gemt hjem. Alt prøves af mod det, spillet kender i dag: et møbel vi
 * har fjernet siden, eller to møbler på samme felt, falder bare ud – så mister
 * man et møbel i stedet for hele huset.
 */
export function laes(data) {
  if (!data || typeof data !== 'object' || typeof data.navn !== 'string') return null;
  const hjem = nytHjem(data.navn, data.udseende);
  hjem.minut = tal(data.minut, START_MINUT, 0, 1e9);
  hjem.penge = Math.round(tal(data.penge, START_PENGE, 0, 1e9));
  for (const b of BEHOV) hjem.behov[b] = tal(data.behov?.[b], 60, 0, 100);

  hjem.ting = [];
  if (Array.isArray(data.ting)) {
    for (const m of data.ting.slice(0, BREDDE * HOEJDE)) {
      if (!tingen(m?.id) || !Number.isInteger(m.x) || !Number.isInteger(m.y)) continue;
      if (!kanBygges(hjem, m.x, m.y)) continue;               // uden for gitteret, i døren eller optaget
      hjem.ting.push({ id: m.id, x: m.x, y: m.y });
    }
  }
  hjem.job = {
    niveau: Math.round(tal(data.job?.niveau, 0, 0, JOBS.length - 1)),
    stjerner: Math.round(tal(data.job?.stjerner, 0, 0, STJERNER_PR_NIVEAU)),
    sidsteDag: Math.round(tal(data.job?.sidsteDag, 0, 0, 1e7)),
  };
  const fx = Math.round(tal(data.figur?.x, DOER.x, 0, BREDDE - 1));
  const fy = Math.round(tal(data.figur?.y, DOER.y - 1, 0, HOEJDE - 1));
  const staa = frit(hjem, fx, fy) ? { x: fx, y: fy } : naboer({ x: fx, y: fy }).find(n => frit(hjem, n.x, n.y)) || { x: DOER.x, y: DOER.y };
  hjem.figur = { ...staa, vej: [], andel: 0, retning: 'ned' };
  hjem.bedste = Math.max(Math.round(tal(data.bedste, 0, 0, 1e9)), formue(hjem));
  return hjem;
}
