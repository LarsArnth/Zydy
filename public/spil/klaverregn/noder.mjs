// Klaverregn – sangene, fliserne og reglerne. Ren JS uden DOM, så index.html
// kun skal tegne og spille lyd, og motoren kan enhedstestes med
// `node --test test/unit/klaverregn.test.mjs`.
//
// Spillet er Piano Tiles-agtigt: noderne i en rigtig sang falder ned gennem
// fire baner som fliser, og man trykker på dem i den rækkefølge, de kommer.
// Hvert rigtigt tryk spiller sangens næste node – så melodien kommer ud af
// ens egne fingre, og man «spiller klaver», selv om man kun rammer fliser.
//
// Tre regler bærer det hele:
//
//   1) Det er altid den NEDERSTE flise, der skal rammes. Rammer man dens bane,
//      lyder noden og flisen forsvinder; rammer man en anden bane, koster det
//      et hjerte (flisen bliver stående, så melodien ikke hopper et hak).
//   2) En flise, der når forbi bunden, koster også et hjerte – og springes
//      over, så sangen kommer videre og man ikke drukner i gamle fliser.
//   3) Banen følger tonehøjden: dybe noder til venstre, lyse til højre. Så kan
//      man SE melodien komme – op ad bakke i «Blinke, blinke» er fliser, der
//      vandrer mod højre – og det er dét, der gør det til et klaverspil og
//      ikke et reaktionsspil.
//
// Der er ingen tilfældighed overhovedet: sangene kommer i fast rækkefølge, og
// farten afhænger kun af hvor mange noder man har ramt. Samme spil for alle.

/* ---------- Tal man kan skrue på ---------- */
export const BANER = 4;            // fire baner, som i forbilledet
export const HØJDE = 100;          // spillefladen i enheder; 0 = top, 100 = bund
export const FLISE_H = 13;         // en flises højde i enheder
export const LIV = 3;              // tre hjerter
export const AFSTAND_PR_SLAG = 26; // enheder mellem to fliser pr. slag (fjerdedel = 1)
export const AFSTAND_MIN = FLISE_H + 4;  // ottendedele må ikke klistre sammen
export const PAUSE_SLAG = 3;       // luft mellem to sange
export const START_FART = 26;      // enheder/sekund fra første node …
export const FART_PR_NODE = 0.22;  // … og så meget hurtigere pr. ramt node
export const MAKS_FART = 75;       // loftet – ca. tre tryk i sekundet

/* ---------- Sangene ----------
   [midi, varighed] – varighed i slag (1 = fjerdedel). Alle melodier er
   folkemelodier eller så gamle, at ingen ejer dem længere. Rækkefølgen er
   også sværhedsgraden: Mester Jakob først, fødselsdagssangen (med store
   spring) til sidst. */
export const SANGE = [
  {
    navn: 'Mester Jakob',
    noder: [
      [60, 1], [62, 1], [64, 1], [60, 1], [60, 1], [62, 1], [64, 1], [60, 1],
      [64, 1], [65, 1], [67, 2], [64, 1], [65, 1], [67, 2],
      [67, 0.5], [69, 0.5], [67, 0.5], [65, 0.5], [64, 1], [60, 1],
      [67, 0.5], [69, 0.5], [67, 0.5], [65, 0.5], [64, 1], [60, 1],
      [60, 1], [55, 1], [60, 2], [60, 1], [55, 1], [60, 2],
    ],
  },
  {
    navn: 'Blinke, blinke, stjernelil',
    noder: [
      [60, 1], [60, 1], [67, 1], [67, 1], [69, 1], [69, 1], [67, 2],
      [65, 1], [65, 1], [64, 1], [64, 1], [62, 1], [62, 1], [60, 2],
      [67, 1], [67, 1], [65, 1], [65, 1], [64, 1], [64, 1], [62, 2],
      [67, 1], [67, 1], [65, 1], [65, 1], [64, 1], [64, 1], [62, 2],
      [60, 1], [60, 1], [67, 1], [67, 1], [69, 1], [69, 1], [67, 2],
      [65, 1], [65, 1], [64, 1], [64, 1], [62, 1], [62, 1], [60, 2],
    ],
  },
  {
    navn: 'Lille Peter Edderkop',
    noder: [
      [55, 0.5], [60, 1], [60, 0.5], [60, 1], [62, 0.5], [64, 1.5], [64, 1.5],
      [64, 0.5], [62, 1], [60, 0.5], [62, 1], [64, 0.5], [60, 3],
      [64, 1], [64, 0.5], [65, 1], [67, 1.5], [67, 1.5],
      [67, 0.5], [65, 1], [64, 0.5], [65, 1], [67, 0.5], [64, 3],
      [60, 1], [60, 0.5], [62, 1], [64, 1.5], [64, 1.5],
      [64, 0.5], [62, 1], [60, 0.5], [62, 1], [64, 0.5], [60, 3],
      [55, 0.5], [55, 0.5], [60, 1], [60, 0.5], [60, 1], [62, 0.5], [64, 1.5], [64, 1.5],
      [64, 0.5], [62, 1], [60, 0.5], [62, 1], [64, 0.5], [60, 3],
    ],
  },
  {
    navn: 'Jens Hansens bondegård',
    noder: [
      [60, 1], [60, 1], [60, 1], [55, 1], [57, 1], [57, 1], [55, 2],
      [64, 1], [64, 1], [62, 1], [62, 1], [60, 2],
      [55, 1], [60, 1], [60, 1], [60, 1], [55, 1], [57, 1], [57, 1], [55, 2],
      [64, 1], [64, 1], [62, 1], [62, 1], [60, 2],
      [55, 0.5], [55, 0.5], [60, 1], [60, 1], [60, 1],
      [55, 0.5], [55, 0.5], [60, 1], [60, 1], [60, 1],
      [60, 0.5], [60, 0.5], [60, 1], [60, 0.5], [60, 0.5], [60, 1],
      [60, 0.5], [60, 0.5], [60, 0.5], [60, 0.5], [60, 1], [60, 1],
      [60, 1], [60, 1], [60, 1], [55, 1], [57, 1], [57, 1], [55, 2],
      [64, 1], [64, 1], [62, 1], [62, 1], [60, 2],
    ],
  },
  {
    navn: 'Ode til glæden',
    noder: [
      [64, 1], [64, 1], [65, 1], [67, 1], [67, 1], [65, 1], [64, 1], [62, 1],
      [60, 1], [60, 1], [62, 1], [64, 1], [64, 1.5], [62, 0.5], [62, 2],
      [64, 1], [64, 1], [65, 1], [67, 1], [67, 1], [65, 1], [64, 1], [62, 1],
      [60, 1], [60, 1], [62, 1], [64, 1], [62, 1.5], [60, 0.5], [60, 2],
    ],
  },
  {
    navn: 'Fødselsdagssangen',
    noder: [
      [67, 0.5], [67, 0.5], [69, 1], [67, 1], [72, 1], [71, 2],
      [67, 0.5], [67, 0.5], [69, 1], [67, 1], [74, 1], [72, 2],
      [67, 0.5], [67, 0.5], [79, 1], [76, 1], [72, 1], [71, 1], [69, 2],
      [77, 0.5], [77, 0.5], [76, 1], [72, 1], [74, 1], [72, 2],
    ],
  },
];

/* ---------- Banen følger tonehøjden ---------- */

/**
 * Hvilken bane får node nr. `i` i sang nr. `sangNr`? Sangens toneomfang deles
 * i fire lige store bånd: dybeste fjerdedel = bane 0 (venstre), lyseste =
 * bane 3 (højre). Samme node giver altid samme bane, så en gentaget tone er
 * to fliser i samme spor – og melodiens bakker kan ses på skærmen.
 */
export function baneFor(sangNr, i) {
  const sang = SANGE[sangNr % SANGE.length];
  let lav = Infinity, høj = -Infinity;
  for (const [midi] of sang.noder) { lav = Math.min(lav, midi); høj = Math.max(høj, midi); }
  const spænd = Math.max(1, høj - lav + 1);
  return Math.min(BANER - 1, Math.floor(((sang.noder[i][0] - lav) / spænd) * BANER));
}

/** Frekvensen for en midi-node – 69 er kammertonen a' på 440 Hz. */
export const frekvens = midi => 440 * 2 ** ((midi - 69) / 12);

/* ---------- Et spil ---------- */

/** Et frisk spil: tre hjerter, ingen fliser endnu, Mester Jakob først. */
export function nytSpil() {
  return {
    fliser: [],        // på vej ned, ældste (nederste) først
    sangNr: 0,         // sangen den NÆSTE spawnede flise hører til
    nodeNr: 0,         // … og hvilken node i den
    score: 0,          // ramte noder i alt
    liv: LIV,
    sange: 0,          // sange man har spillet færdige (sidste flise ramt eller forbi)
    faerdig: false,
    t: 0,
  };
}

/** Farten lige nu – vokser med hver ramt node, til den rammer loftet. */
export const fart = spil => Math.min(MAKS_FART, START_FART + spil.score * FART_PR_NODE);

/** Sangen, der er i gang lige nu – den, den nederste flise hører til. */
export function sangIGang(spil) {
  const nr = spil.fliser.length ? spil.fliser[0].sangNr : spil.sangNr;
  return SANGE[nr % SANGE.length];
}

/** Den nederste flise, der ikke er ramt – den man skal trykke på. */
export const naesteFlise = spil => spil.fliser[0] ?? null;

/** Laver den næste flise og rykker sang/node-tælleren videre. */
function spawn(spil) {
  const sang = SANGE[spil.sangNr % SANGE.length];
  const [midi, varighed] = sang.noder[spil.nodeNr];
  const sidste = spil.fliser[spil.fliser.length - 1];
  // Afstanden ned til flisen foran er dén nodes varighed – sådan bliver
  // rytmen synlig – og mellem to sange er der en ekstra pause.
  const hul = sidste
    ? Math.max(AFSTAND_MIN, sidste.varighed * AFSTAND_PR_SLAG + (sidste.sidsteISang ? PAUSE_SLAG * AFSTAND_PR_SLAG : 0))
    : 0;
  const flise = {
    sangNr: spil.sangNr,
    nodeNr: spil.nodeNr,
    midi, varighed,
    bane: baneFor(spil.sangNr, spil.nodeNr),
    y: sidste ? sidste.y - hul : -FLISE_H,   // y er flisens TOP
    sidsteISang: spil.nodeNr === sang.noder.length - 1,
  };
  spil.fliser.push(flise);
  spil.nodeNr++;
  if (spil.nodeNr >= sang.noder.length) { spil.nodeNr = 0; spil.sangNr++; }
  return flise;
}

/** En flise forlader spillet (ramt eller forbi). Tæller sange og siger til. */
function forbi(spil, flise, h) {
  spil.fliser.shift();
  if (flise.sidsteISang) {
    spil.sange++;
    h.sangSlut = SANGE[flise.sangNr % SANGE.length].navn;
  }
}

/**
 * Ét skridt på dt sekunder: fliserne falder, nye kommer til foroven, og
 * fliser forbi bunden koster et hjerte. Giver hændelserne tilbage, så
 * index.html kan lave lyd og pynt:
 *   { mistede: [flise…], sangSlut: navn|null, faerdig }
 */
export function tik(spil, dt) {
  const h = { mistede: [], sangSlut: null, faerdig: false };
  if (spil.faerdig) return h;
  spil.t += dt;

  const v = fart(spil);
  for (const f of spil.fliser) f.y += v * dt;

  // Hold altid skærmen fuld af fliser plus én i baghånden over kanten.
  while (!spil.fliser.length || spil.fliser[spil.fliser.length - 1].y > -FLISE_H * 2) spawn(spil);

  // Den nederste flise er nået forbi bunden: et hjerte, og sangen går videre.
  while (spil.fliser.length && spil.fliser[0].y > HØJDE) {
    const f = spil.fliser[0];
    forbi(spil, f, h);
    h.mistede.push(f);
    spil.liv--;
    if (spil.liv <= 0) { spil.faerdig = true; h.faerdig = true; return h; }
  }
  return h;
}

/**
 * Et tryk i en bane. Rammer man den nederste flises bane, lyder noden og
 * flisen forsvinder; ellers koster det et hjerte, og flisen bliver stående.
 *   { ramt: flise|null, forkert, sangSlut: navn|null, faerdig }
 */
export function tryk(spil, bane) {
  const h = { ramt: null, forkert: false, sangSlut: null, faerdig: false };
  if (spil.faerdig || bane < 0 || bane >= BANER) return h;
  const f = naesteFlise(spil);
  if (f && f.bane === bane) {
    forbi(spil, f, h);
    spil.score++;
    h.ramt = f;
    return h;
  }
  h.forkert = true;
  spil.liv--;
  if (spil.liv <= 0) { spil.faerdig = true; h.faerdig = true; }
  return h;
}

/* ---------- Ens eget klaver ----------
   Livas andet ønske lød «På ens egen klaver»: ikke kun fire baner, men et
   rigtigt lille klaver med hvide og sorte tangenter. Ingen fliser, ingen
   hjerter og ingen fart – man spiller frit, eller følger en af sangene i sit
   eget tempo, hvor den næste tangent lyser. En forkert tangent er ikke en
   fejl: den giver bare sin egen tone, som på et rigtigt klaver. */

/** Er midi-noden en sort tangent? (cis, dis, fis, gis og ais i hver oktav) */
export const erSort = midi => [1, 3, 6, 8, 10].includes(((midi % 12) + 12) % 12);

/** Tonens danske navn – med H for det, englænderne kalder B. */
const TONENAVNE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'B', 'H'];
export const tonenavn = midi => TONENAVNE[((midi % 12) + 12) % 12];

/**
 * Tangenterne fra `lav` til `høj` – begge trukket ud til nærmeste hvide, så
 * klaveret aldrig begynder eller slutter på en sort. Hver tangent er
 * { midi, sort, navn }, og de ligger i ubrudt rækkefølge.
 */
export function klaviatur(lav, høj) {
  while (erSort(lav)) lav--;
  while (erSort(høj)) høj++;
  const taster = [];
  for (let m = lav; m <= høj; m++) taster.push({ midi: m, sort: erSort(m), navn: tonenavn(m) });
  return taster;
}

/**
 * Klaveret, en sang skal spilles på: sangens omfang trukket ud til hvide
 * tangenter og mindst en hel oktav – ellers er Ode til glæden fem tangenter,
 * og det ligner ikke et klaver.
 */
export function sangOmfang(sangNr) {
  const sang = SANGE[sangNr % SANGE.length];
  let lav = Infinity, høj = -Infinity;
  for (const [midi] of sang.noder) { lav = Math.min(lav, midi); høj = Math.max(høj, midi); }
  while (erSort(lav)) lav--;
  while (erSort(høj)) høj++;
  for (let side = 0; høj - lav < 12; side++) {
    if (side % 2) { høj++; while (erSort(høj)) høj++; }
    else { lav--; while (erSort(lav)) lav--; }
  }
  return { lav, høj };
}

/** En sang på ens eget klaver – i ens eget tempo, uden hjerter. */
export function nyEgenSang(sangNr) {
  return { sangNr: sangNr % SANGE.length, nodeNr: 0, rigtige: 0, faerdig: false };
}

/** Den tangent, der skal trykkes på nu – eller null, når sangen er færdig. */
export const egenNaeste = s => (s.faerdig ? null : SANGE[s.sangNr].noder[s.nodeNr][0]);

/**
 * Et tryk på tangenten `midi`. Den rigtige tangent flytter sangen et hak;
 * en forkert gør ingenting ud over sin egen tone – det er ens eget klaver.
 *   { rigtig, faerdig, sangSlut: navn|null }
 */
export function egetTryk(s, midi) {
  const h = { rigtig: false, faerdig: false, sangSlut: null };
  if (s.faerdig || midi !== egenNaeste(s)) return h;
  h.rigtig = true;
  s.nodeNr++; s.rigtige++;
  if (s.nodeNr >= SANGE[s.sangNr].noder.length) {
    s.faerdig = true; h.faerdig = true; h.sangSlut = SANGE[s.sangNr].navn;
  }
  return h;
}

/* ---------- En spiller der kan spille selv (bruges af testene) ---------- */

/**
 * Hvilken bane skal der trykkes på lige nu – eller null for at vente?
 * Botten trykker på den nederste flise, når den er kommet et godt stykke ned,
 * men i god tid før bunden. Den spiller fejlfrit; den er en målestok, ikke en
 * modstander.
 */
export function bot(spil, zone = 60) {
  const f = naesteFlise(spil);
  return f && f.y >= zone ? f.bane : null;
}

/**
 * Spiller `sekunder` igennem uden browser. `vælg(spil)` bestemmer fingrene
 * (standard: botten). Giver spillet tilbage, når tiden er gået eller
 * hjerterne er sluppet op.
 */
export function koer(spil, sekunder, vælg = bot, dt = 1 / 120) {
  for (let i = 0; i < Math.round(sekunder / dt) && !spil.faerdig; i++) {
    tik(spil, dt);
    const bane = vælg(spil);
    if (bane != null && !spil.faerdig) tryk(spil, bane);
  }
  return spil;
}
