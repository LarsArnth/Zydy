/**
 * Baseforsvar – motoren (SorteSlyngels ønske #58: «et spil hvor man bygger en
 * base og skal forsvare den fra fjender … mure, tårne som kan skyde og tropper
 * til at angribe … farms, hvor man skal træne bønder … fjenderne skal ikke komme
 * i faste bølger som i et Tower Defense-spil, men mere tilfældigt over tid» —
 * med Warcraft 3-banen «Zombie Defense» som forbillede).
 *
 * Banen er et gitter på 11 × 15 felter à 10 enheder (110 × 150), som index.html
 * tegner i midten af fladen. Rådhuset står i det præcise midtpunkt (5,7), og
 * alle andre felter må bebygges. Zombierne kommer ind fra kanterne — hele vejen
 * rundt — og går mod rådhuset. Falder det, er det slut.
 *
 * Fem greb er værd at huske, hvis spillet skal røres igen:
 *
 *   1) **Der er ingen sti og ingen pathfinding.** En zombie kigger på sine fire
 *      naboer og går til det ledige felt, der kommer tættest på rådhuset. Er
 *      alle de felter, der kommer tættere på, spærret af en bygning, bider den
 *      sig i stedet igennem den nærmeste af dem. Den, der kommer skråt ind, går
 *      altså udenom en enkelt mur, mens den, der kommer lige imod, bider sig
 *      igennem — for et skridt til siden kommer ikke tættere på. Det er dét,
 *      der gør mure til noget værd, uden at nogen skal regne ruter ud, og det
 *      er umuligt at lukke zombierne ude for evigt: de æder sig altid ind.
 *
 *   2) **Tiden går i dage, ikke i bølger.** Hver dag er 36 sekunder, og
 *      zombierne kommer tilfældigt hele tiden: `spawnPrSek(dag, nat)` er en
 *      sandsynlighed pr. sekund, ikke en liste. Om natten kommer der 2,4 gange
 *      så mange. Score = hvor mange hele dage, basen holdt.
 *
 *   3) **Tilfældigheden ligger i ét frø.** `nytSpil(froeTal)` laver sin egen
 *      terning (`froe()`), så motoren aldrig rører `Math.random()`. En test kan
 *      derfor spille den samme uge igennem to gange og få nøjagtig det samme,
 *      mens en telefon får en ny base hver gang.
 *
 *   4) **Bønderne bor i farmen.** Man træner dem dér (det tager tid og koster
 *      guld), og hver bonde giver `indtaegt` guld ved daggry. Går farmen ned,
 *      ryger bønderne med — det er dét, der gør, at man også skal forsvare
 *      bagland og ikke kun rådhuset.
 *
 *   5) **Soldaterne henter deres tal fra kasernen, hver gang de bruges.**
 *      Derfor bliver de, der allerede står på banen, stærkere i samme øjeblik
 *      kasernen opgraderes (og får fyldt liv op). «Opgraderinger til tropper»
 *      er altså én pris ét sted i stedet for et opgraderingstræ pr. soldat.
 */

export const FELT = 10;
export const KOLONNER = 11;
export const RAEKKER = 15;
export const BREDDE = KOLONNER * FELT;      // 110
export const HOEJDE = RAEKKER * FELT;       // 150

/** Rådhuset står i midten – banen er lavet ulige stor, netop for at det kan passe. */
export const RAADHUS_FELT = { kx: (KOLONNER - 1) / 2, ky: (RAEKKER - 1) / 2 };

/** Feltets midte i enheder. */
export const midte = (kx, ky) => ({ x: (kx + 0.5) * FELT, y: (ky + 0.5) * FELT });
export const paaBanen = (kx, ky) => kx >= 0 && kx < KOLONNER && ky >= 0 && ky < RAEKKER;

/** Terningen. Samme frø giver altid den samme uge – se punkt 3 øverst. */
export function froe(tal) {
  let a = (tal >>> 0) || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ================= Bygningerne ================= */
/*
  Seks slags bygninger, fem af dem kan man selv rejse. Alle har `hp` (zombierne
  bider i dem), og alle kan opgraderes fire niveauer op. Tallene:
    skade/fart/raekkevidde  – tårnenes skud (fart = skud pr. sekund, et felt = 10)
    splash                  – kanonens bombe rammer alt inden for så mange enheder
    pladser/indtaegt        – farmens bønder og hvad hver af dem giver ved daggry
    pladser/soldat*         – kasernens soldater og deres tal
*/
export const MAKS_NIVEAU = 4;

export const BYGNINGER = [
  {
    id: 'mur', navn: 'Mur', tegn: '🧱', farve: '#8d9aa8', pris: 20,
    om: 'Zombierne går udenom – eller bider sig igennem. Begge dele tager tid.',
    niveauer: [
      { hp: 170, opgradering: 25 },
      { hp: 360, opgradering: 65 },
      { hp: 720, opgradering: 150 },
      { hp: 1400, opgradering: 0 },
    ],
  },
  {
    id: 'taarn', navn: 'Skydetårn', tegn: '🏹', farve: '#3ddc84', pris: 70,
    om: 'Skyder hurtigt på den nærmeste zombie. Byg de første tæt på rådhuset.',
    niveauer: [
      { hp: 150, skade: 11, fart: 1.5, raekkevidde: 30, opgradering: 60 },
      { hp: 250, skade: 19, fart: 1.8, raekkevidde: 32, opgradering: 130 },
      { hp: 410, skade: 33, fart: 2.1, raekkevidde: 35, opgradering: 270 },
      { hp: 680, skade: 56, fart: 2.5, raekkevidde: 38, opgradering: 0 },
    ],
  },
  {
    id: 'kanon', navn: 'Kanontårn', tegn: '💣', farve: '#ffd447', pris: 140,
    om: 'Langsom, men bomben rammer hele flokken – og går gennem panser.',
    niveauer: [
      { hp: 200, skade: 34, fart: 0.6, raekkevidde: 26, splash: 11, opgradering: 120 },
      { hp: 330, skade: 58, fart: 0.7, raekkevidde: 28, splash: 13, opgradering: 250 },
      { hp: 540, skade: 98, fart: 0.8, raekkevidde: 30, splash: 15, opgradering: 460 },
      { hp: 880, skade: 165, fart: 0.9, raekkevidde: 32, splash: 17, opgradering: 0 },
    ],
  },
  {
    id: 'farm', navn: 'Farm', tegn: '🌾', farve: '#b7e04b', pris: 90,
    om: 'Træn bønder her. Hver bonde giver guld, hver gang det bliver morgen.',
    niveauer: [
      { hp: 130, pladser: 2, indtaegt: 22, opgradering: 90 },
      { hp: 220, pladser: 3, indtaegt: 34, opgradering: 190 },
      { hp: 360, pladser: 4, indtaegt: 52, opgradering: 360 },
      { hp: 580, pladser: 5, indtaegt: 78, opgradering: 0 },
    ],
  },
  {
    id: 'kaserne', navn: 'Kaserne', tegn: '⚔️', farve: '#4d8dff', pris: 160,
    om: 'Træn soldater, der selv går ud og slås. De følger kasernens niveau.',
    niveauer: [
      { hp: 210, pladser: 2, soldatHp: 80, soldatSkade: 10, soldatFart: 11, opgradering: 140 },
      { hp: 340, pladser: 3, soldatHp: 140, soldatSkade: 17, soldatFart: 12, opgradering: 290 },
      { hp: 550, pladser: 4, soldatHp: 230, soldatSkade: 29, soldatFart: 13, opgradering: 520 },
      { hp: 880, pladser: 5, soldatHp: 380, soldatSkade: 48, soldatFart: 14, opgradering: 0 },
    ],
  },
  {
    id: 'raadhus', navn: 'Rådhus', tegn: '🏠', farve: '#ff9f43', pris: 0, kanBygges: false,
    om: 'Hele basens hjerte. Falder det, er spillet slut – så opgradér det i tide.',
    niveauer: [
      { hp: 1400, opgradering: 130 },
      { hp: 2300, opgradering: 300 },
      { hp: 3600, opgradering: 560 },
      { hp: 5400, opgradering: 0 },
    ],
  },
];

export const BYGNING_VED = Object.fromEntries(BYGNINGER.map(b => [b.id, b]));
/** Dem man kan vælge i bunden af skærmen (rådhuset står der i forvejen). */
export const BYGGES = BYGNINGER.filter(b => b.kanBygges !== false);

export const bygData = b => BYGNING_VED[b.slags].niveauer[b.niveau - 1];

/* ================= Zombierne ================= */
/*
  `panser` trækkes fra hvert eneste træffer (dog mindst 1 i skade), `skade` er
  hvad et bid koster, og `angrebFart` er sekunder mellem bidene.
*/
export const FJENDER = {
  zombie: { navn: 'Zombie', tegn: '🧟', hp: 34, fart: 6.5, skade: 7, angrebFart: 1.2, guld: 8, panser: 0, r: 3.2, farve: '#7bd88f' },
  loeber: { navn: 'Løber', tegn: '🏃', hp: 24, fart: 13, skade: 6, angrebFart: 0.8, guld: 10, panser: 0, r: 2.7, farve: '#ffd447' },
  brute: { navn: 'Bæst', tegn: '🦍', hp: 140, fart: 5, skade: 22, angrebFart: 1.4, guld: 24, panser: 3, r: 4.2, farve: '#b18cff' },
  kaempe: { navn: 'Kæmpe', tegn: '👹', hp: 440, fart: 3.8, skade: 55, angrebFart: 1.8, guld: 70, panser: 7, r: 5.4, farve: '#ff4d5e' },
};

/** Hvor meget mere liv zombierne har på dag `dag`. Vokser, til man ikke kan følge med. */
export const hpFaktor = dag => Math.pow(1.15, dag - 1);
/** Guldet vokser langsommere end zombierne – derfor ender alle med at tabe. */
export const guldFaktor = dag => 1 + (dag - 1) * 0.06;

/**
 * Hvilke slags zombier der kan komme på dag `dag`, og hvor tit. Der er ingen
 * bølgeplan: vægtene bestemmer bare, hvad terningen kan finde på at trække.
 */
export function slagsVaegte(dag) {
  const v = [['zombie', 10]];
  if (dag >= 3) v.push(['loeber', Math.min(9, 2 + (dag - 3))]);
  if (dag >= 5) v.push(['brute', Math.min(8, 1 + (dag - 5) * 0.9)]);
  if (dag >= 8) v.push(['kaempe', Math.min(5, 0.6 + (dag - 8) * 0.45)]);
  return v;
}

/** Hedder dagen noget særligt? Bruges til varslet på skærmen. */
export function dagVarsel(dag) {
  if (dag === 3) return 'Løbere! De er hurtige';
  if (dag === 5) return 'Bæster – de har panser';
  if (dag === 8) return 'Kæmper på vej…';
  if (dag % 10 === 0) return 'Det bliver kun værre herfra';
  return null;
}

/* ================= Spillet ================= */
export const START_GULD = 260;
export const DAG_LAENGDE = 36;          // sekunder pr. dag
export const NAT_START = 0.55;          // hvor langt inde i dagen det bliver mørkt
export const BONDE_PRIS = 35;
export const BONDE_TID = 5;
export const SOLDAT_PRIS = 45;
export const SOLDAT_TID = 7;
export const SALG_DEL = 0.5;            // halvdelen af det, bygningen har kostet, retur
export const REPARATION = 2.2;          // hp pr. sekund, om dagen, når ingen bider i den
export const RO_FOER_REPARATION = 3;    // sekunder uden bid, før håndværkerne tør gå derhen
export const NAERKAMP = 5;              // hvor tæt man skal være for at slås
export const SOLDAT_RAEKKE = 55;        // hvor langt en soldat går væk fra sin kaserne
export const SOLDAT_ANGREB = 1.0;       // sekunder mellem en soldats hug
const SKRIDT = 1 / 60;
const SKUD_FART = 95;

export const dagNr = tid => Math.floor(tid / DAG_LAENGDE) + 1;
export const erNat = tid => (tid % DAG_LAENGDE) / DAG_LAENGDE >= NAT_START;
export function spawnPrSek(dag, nat) {
  return (0.10 + (dag - 1) * 0.045) * (nat ? 2.4 : 1);
}

export function nytSpil(froeTal = 1) {
  const spil = {
    tid: 0, dag: 1, nat: false, fase: 'spil',
    guld: START_GULD, drab: 0, klarede: 0,
    bygninger: [], fjender: [], soldater: [], skud: [], smaeld: [],
    naesteId: 1, slut: null, sidsteIndtaegt: 0, froeTal, rng: froe(froeTal),
  };
  spil.raadhus = rejs(spil, 'raadhus', RAADHUS_FELT.kx, RAADHUS_FELT.ky);
  return spil;
}

/** Sætter en bygning op uden at spørge om pris – byg() og nytSpil() bruger den. */
function rejs(spil, slags, kx, ky) {
  const type = BYGNING_VED[slags];
  const p = midte(kx, ky);
  const b = {
    id: spil.naesteId++, slags, kx, ky, x: p.x, y: p.y, niveau: 1,
    hp: type.niveauer[0].hp, maksHp: type.niveauer[0].hp,
    investeret: type.pris, ladt: 0, vinkel: -Math.PI / 2,
    boender: 0, traener: null, sidsteSkade: -99, blink: 0,
  };
  spil.bygninger.push(b);
  return b;
}

export const bygningPaa = (spil, kx, ky) => spil.bygninger.find(b => b.kx === kx && b.ky === ky) || null;

/** Bygger. Svaret er `{ ok, fejl, bygning }` – fejlen er noget, man kan vise et barn. */
export function byg(spil, slags, kx, ky) {
  const type = BYGNING_VED[slags];
  if (!type || type.kanBygges === false || spil.fase === 'slut') return { ok: false, fejl: 'Ikke nu' };
  if (!paaBanen(kx, ky)) return { ok: false, fejl: 'Uden for banen' };
  if (bygningPaa(spil, kx, ky)) return { ok: false, fejl: 'Der står allerede noget' };
  if (spil.guld < type.pris) return { ok: false, fejl: 'Ikke guld nok' };
  spil.guld -= type.pris;
  return { ok: true, bygning: rejs(spil, slags, kx, ky) };
}

/**
 * Opgraderer ét niveau. Livet fyldes helt op — og er det en kaserne, følger
 * soldaterne med op og bliver stærkere med det samme (se punkt 5 øverst).
 */
export function opgrader(spil, b) {
  if (!b || spil.fase === 'slut') return { ok: false, fejl: 'Ikke nu' };
  if (b.niveau >= MAKS_NIVEAU) return { ok: false, fejl: 'Færdigbygget' };
  const pris = bygData(b).opgradering;
  if (spil.guld < pris) return { ok: false, fejl: 'Ikke guld nok' };
  spil.guld -= pris;
  b.investeret += pris;
  b.niveau += 1;
  const n = bygData(b);
  b.maksHp = n.hp;
  b.hp = n.hp;
  if (b.slags === 'kaserne') {
    for (const s of spil.soldater) {
      if (s.fra !== b.id) continue;
      s.niveau = b.niveau;
      s.maksHp = n.soldatHp;
      s.hp = n.soldatHp;
    }
  }
  return { ok: true, bygning: b };
}

export const salgspris = b => Math.floor(b.investeret * SALG_DEL);

/** Sælger en bygning igen. Rådhuset kan man ikke sælge. */
export function saelg(spil, b) {
  if (!b || b.slags === 'raadhus') return { ok: false, fejl: 'Rådhuset bliver stående' };
  const nr = spil.bygninger.indexOf(b);
  if (nr < 0) return { ok: false, fejl: 'Der er ikke noget at sælge' };
  spil.bygninger.splice(nr, 1);
  const guld = salgspris(b);
  spil.guld += guld;
  return { ok: true, guld };
}

/** Hvor mange levende soldater kasernen har ude. */
export const soldaterFra = (spil, b) => spil.soldater.filter(s => s.fra === b.id).length;

/** Hvad man kan træne i bygningen – og hvad det koster. */
export function traening(b) {
  if (b.slags === 'farm') return { slags: 'bonde', navn: 'bonde', pris: BONDE_PRIS, tid: BONDE_TID };
  if (b.slags === 'kaserne') return { slags: 'soldat', navn: 'soldat', pris: SOLDAT_PRIS, tid: SOLDAT_TID };
  return null;
}

/** Hvor mange der er plads til, og hvor mange der er nu. */
export function bemanding(spil, b) {
  const n = bygData(b);
  if (b.slags === 'farm') return { har: b.boender, plads: n.pladser };
  if (b.slags === 'kaserne') return { har: soldaterFra(spil, b), plads: n.pladser };
  return null;
}

/** Sætter en bonde eller en soldat i træning. Én ad gangen pr. bygning. */
export function traen(spil, b) {
  const t = b && traening(b);
  if (!t || spil.fase === 'slut') return { ok: false, fejl: 'Ikke nu' };
  if (b.traener) return { ok: false, fejl: 'Der trænes allerede' };
  const m = bemanding(spil, b);
  if (m.har >= m.plads) return { ok: false, fejl: 'Ikke plads til flere – opgradér' };
  if (spil.guld < t.pris) return { ok: false, fejl: 'Ikke guld nok' };
  spil.guld -= t.pris;
  b.traener = { slags: t.slags, til: spil.tid + t.tid, laengde: t.tid };
  return { ok: true };
}

/** Hvad farmene giver ved daggry. */
export const farmIndtaegt = spil => spil.bygninger
  .reduce((sum, b) => sum + (b.slags === 'farm' ? bygData(b).indtaegt * b.boender : 0), 0);

/** Alle bønder på basen – tallet i HUD'en. */
export const boenderIAlt = spil => spil.bygninger.reduce((sum, b) => sum + (b.boender || 0), 0);

/* ---------- Zombiernes vej ---------- */
const NABOER = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const tilRaadhus = (kx, ky) => Math.hypot(kx - RAADHUS_FELT.kx, ky - RAADHUS_FELT.ky);

/**
 * Hvad gør en zombie, der står på (kx,ky)? Den går til det **ledige** nabofelt,
 * der kommer tættest på rådhuset — og kun hvis det kommer tættere på. Er alle
 * de felter spærret af bygninger, bider den i den nærmeste af dem. Det er hele
 * «pathfindingen», og den kan hverken gå i ring eller stå fast: enten kommer
 * den tættere på, eller også æder den det, der er i vejen.
 */
export function vaelgSkridt(spil, kx, ky) {
  const d0 = tilRaadhus(kx, ky);
  let fri = null, friD = d0, spaerret = null, spaerretD = d0;
  for (const [dx, dy] of NABOER) {
    const nx = kx + dx, ny = ky + dy;
    if (nx < -1 || nx > KOLONNER || ny < -1 || ny > RAEKKER) continue;
    const d = tilRaadhus(nx, ny);
    if (d >= d0) continue;                       // skal komme tættere på
    const b = paaBanen(nx, ny) ? bygningPaa(spil, nx, ny) : null;
    if (b) { if (d < spaerretD) { spaerret = b; spaerretD = d; } }
    else if (d < friD) { fri = { kx: nx, ky: ny }; friD = d; }
  }
  if (fri) return { gaa: fri };
  if (spaerret) return { slaa: spaerret };
  return null;
}

/* ---------- Zombierne ind på banen ---------- */
/** Trækker en slags efter vægtene for dagen. */
function traekSlags(spil, dag) {
  const v = slagsVaegte(dag);
  const sum = v.reduce((s, [, w]) => s + w, 0);
  let r = spil.rng() * sum;
  for (const [slags, w] of v) { r -= w; if (r <= 0) return slags; }
  return v[0][0];
}

/** Et tilfældigt sted lige uden for kanten, hele vejen rundt om basen. */
function kantFelt(spil) {
  const side = Math.floor(spil.rng() * 4);
  const kx = Math.floor(spil.rng() * KOLONNER), ky = Math.floor(spil.rng() * RAEKKER);
  if (side === 0) return { kx, ky: -1 };
  if (side === 1) return { kx: KOLONNER, ky };
  if (side === 2) return { kx, ky: RAEKKER };
  return { kx: -1, ky };
}

/** Sender én zombie ind. `slags` og stedet kan gives, så en test kan stille den op. */
export function sendFjende(spil, slags = null, sted = null) {
  const art = slags || traekSlags(spil, spil.dag);
  const f = FJENDER[art];
  const felt = sted || kantFelt(spil);
  const p = midte(felt.kx, felt.ky);
  const hp = Math.round(f.hp * hpFaktor(spil.dag));
  const fjende = {
    id: spil.naesteId++, slags: art, kx: felt.kx, ky: felt.ky, x: p.x, y: p.y,
    mx: p.x, my: p.y, hp, maksHp: hp, fart: f.fart, skade: f.skade,
    angrebFart: f.angrebFart, panser: f.panser, r: f.r,
    guld: Math.round(f.guld * guldFaktor(spil.dag)),
    ladt: 0, blink: 0, gang: spil.rng() * 6, slaar: null,
  };
  spil.fjender.push(fjende);
  return fjende;
}

/* ---------- Skade ---------- */
const gennemPanser = (skade, panser) => Math.max(1, skade - panser);

function skadPaaBygning(spil, b, skade) {
  b.hp -= skade;
  b.sidsteSkade = spil.tid;
  b.blink = 0.12;
}

function ryddDoede(spil) {
  for (let i = spil.fjender.length - 1; i >= 0; i--) {
    const f = spil.fjender[i];
    if (f.hp > 0) continue;
    spil.guld += f.guld;
    spil.drab += 1;
    spil.smaeld.push({ x: f.x, y: f.y, r: f.r, liv: 0.3, alder: 0, slags: 'doed' });
    spil.fjender.splice(i, 1);
  }
  for (let i = spil.soldater.length - 1; i >= 0; i--) {
    const s = spil.soldater[i];
    if (s.hp > 0) continue;
    spil.smaeld.push({ x: s.x, y: s.y, r: 3, liv: 0.3, alder: 0, slags: 'soldat' });
    spil.soldater.splice(i, 1);
  }
  for (let i = spil.bygninger.length - 1; i >= 0; i--) {
    const b = spil.bygninger[i];
    if (b.hp > 0) continue;
    spil.smaeld.push({ x: b.x, y: b.y, r: 6, liv: 0.45, alder: 0, slags: 'ruin' });
    spil.bygninger.splice(i, 1);
    // Bygningen er væk – zombierne, der bed i den, skal finde noget nyt
    for (const f of spil.fjender) if (f.slaar === b.id) f.slaar = null;
    if (b.slags === 'raadhus') {
      spil.fase = 'slut';
      spil.slut = { dag: spil.dag, klarede: spil.klarede, drab: spil.drab };
      return;
    }
  }
}

/* ---------- Ét fast skridt ---------- */
function etSkridt(spil, dt) {
  spil.tid += dt;

  /* --- Dag, nat og daggry --- */
  const dag = dagNr(spil.tid);
  if (dag !== spil.dag) {
    spil.dag = dag;
    spil.klarede = dag - 1;
    spil.sidsteIndtaegt = farmIndtaegt(spil);
    spil.guld += spil.sidsteIndtaegt;
  }
  spil.nat = erNat(spil.tid);

  /* --- Nye zombier, tilfældigt hen over tiden --- */
  if (spil.rng() < spawnPrSek(spil.dag, spil.nat) * dt) sendFjende(spil);

  /* --- Træning --- */
  for (const b of spil.bygninger) {
    if (!b.traener || b.traener.til > spil.tid) continue;
    const t = b.traener;
    b.traener = null;
    if (t.slags === 'bonde') { b.boender += 1; continue; }
    const n = bygData(b);
    const vinkel = spil.rng() * Math.PI * 2;
    spil.soldater.push({
      id: spil.naesteId++, fra: b.id, niveau: b.niveau,
      x: b.x + Math.cos(vinkel) * FELT * 0.7, y: b.y + Math.sin(vinkel) * FELT * 0.7,
      hp: n.soldatHp, maksHp: n.soldatHp, ladt: 0, blink: 0, gang: 0,
    });
  }

  /* --- Zombierne --- */
  for (const f of spil.fjender) {
    if (f.blink > 0) f.blink -= dt;
    f.gang += dt;
    f.ladt += dt;

    // 1) Står der en soldat lige foran? Så slås vi med ham først.
    const soldat = naermesteSoldat(spil, f, NAERKAMP + f.r);
    if (soldat) {
      f.slaar = null;
      if (f.ladt >= f.angrebFart) {
        f.ladt = 0;
        soldat.hp -= f.skade;
        soldat.blink = 0.12;
        spil.smaeld.push({ x: soldat.x, y: soldat.y, r: 2.5, liv: 0.18, alder: 0, slags: 'hug' });
      }
      continue;
    }

    // 2) Bider vi i en bygning? Så bliver vi ved, til den falder.
    if (f.slaar != null) {
      const b = spil.bygninger.find(x => x.id === f.slaar);
      if (b) {
        if (f.ladt >= f.angrebFart) {
          f.ladt = 0;
          skadPaaBygning(spil, b, f.skade);
          spil.smaeld.push({ x: b.x, y: b.y, r: 3, liv: 0.18, alder: 0, slags: 'hug' });
        }
        continue;
      }
      f.slaar = null;
    }

    // 3) Ellers går vi mod rådhuset, ét felt ad gangen.
    const naaet = Math.hypot(f.mx - f.x, f.my - f.y) < 0.4;
    if (naaet) {
      const valg = vaelgSkridt(spil, f.kx, f.ky);
      if (!valg) continue;                          // kan ikke ske i praksis – rådhuset spærrer altid
      if (valg.slaa) { f.slaar = valg.slaa.id; continue; }
      f.kx = valg.gaa.kx; f.ky = valg.gaa.ky;
      const p = midte(f.kx, f.ky);
      f.mx = p.x; f.my = p.y;
    }
    const dx = f.mx - f.x, dy = f.my - f.y;
    const afstand = Math.hypot(dx, dy);
    const skridt = f.fart * dt;
    if (afstand <= skridt) { f.x = f.mx; f.y = f.my; }
    else { f.x += dx / afstand * skridt; f.y += dy / afstand * skridt; f.retning = Math.atan2(dy, dx); }
  }

  /* --- Soldaterne --- */
  for (const s of spil.soldater) {
    if (s.blink > 0) s.blink -= dt;
    s.ladt += dt;
    const hjem = spil.bygninger.find(b => b.id === s.fra) || spil.raadhus;
    const n = kaserneNiveau(spil, s);
    const maal = naermesteFjende(spil, hjem.x, hjem.y, SOLDAT_RAEKKE, s);
    if (maal) {
      const dx = maal.x - s.x, dy = maal.y - s.y;
      const afstand = Math.hypot(dx, dy);
      if (afstand > NAERKAMP) {
        const skridt = Math.min(afstand, n.soldatFart * dt);
        s.x += dx / afstand * skridt; s.y += dy / afstand * skridt;
        s.gang += dt;
      } else if (s.ladt >= SOLDAT_ANGREB) {
        s.ladt = 0;
        maal.hp -= gennemPanser(n.soldatSkade, maal.panser);
        maal.blink = 0.12;
        spil.smaeld.push({ x: maal.x, y: maal.y, r: 2.5, liv: 0.18, alder: 0, slags: 'hug' });
      }
      continue;
    }
    // Ingen at slås med: gå tilbage til kasernen og hold vagt
    const dx = hjem.x - s.x, dy = hjem.y - s.y;
    const afstand = Math.hypot(dx, dy);
    if (afstand > FELT) {
      const skridt = Math.min(afstand, n.soldatFart * dt);
      s.x += dx / afstand * skridt; s.y += dy / afstand * skridt;
      s.gang += dt;
    }
  }

  /* --- Tårnene skyder --- */
  for (const b of spil.bygninger) {
    const n = bygData(b);
    if (b.blink > 0) b.blink -= dt;
    if (!n.fart) continue;                         // mure, farme, kaserner og rådhus skyder ikke
    b.ladt += dt;
    const maal = naermesteFjende(spil, b.x, b.y, n.raekkevidde);
    if (maal) b.vinkel = Math.atan2(maal.y - b.y, maal.x - b.x);
    if (!maal || b.ladt < 1 / n.fart) continue;
    b.ladt = 0;
    spil.skud.push({
      x: b.x, y: b.y, maal: maal.id, mx: maal.x, my: maal.y, slags: b.slags,
      skade: n.skade, splash: n.splash || 0, fart: SKUD_FART, alder: 0,
    });
  }

  /* --- Skuddene flyver --- */
  for (let i = spil.skud.length - 1; i >= 0; i--) {
    const s = spil.skud[i];
    s.alder += dt;
    const maal = spil.fjender.find(f => f.id === s.maal);
    if (maal) { s.mx = maal.x; s.my = maal.y; }     // skuddet følger med, til det rammer
    const dx = s.mx - s.x, dy = s.my - s.y;
    const afstand = Math.hypot(dx, dy);
    const skridt = s.fart * dt;
    if (afstand > skridt && s.alder < 3) {
      s.x += dx / afstand * skridt; s.y += dy / afstand * skridt;
      continue;
    }
    s.x = s.mx; s.y = s.my;
    if (s.splash) {
      spil.smaeld.push({ x: s.x, y: s.y, r: s.splash, liv: 0.25, alder: 0, slags: 'bomb' });
      for (const f of spil.fjender) {
        if (Math.hypot(f.x - s.x, f.y - s.y) <= s.splash + f.r) {
          f.hp -= gennemPanser(s.skade, f.panser);
          f.blink = 0.12;
        }
      }
    } else if (maal) {
      maal.hp -= gennemPanser(s.skade, maal.panser);
      maal.blink = 0.12;
    }
    spil.skud.splice(i, 1);
  }

  /* --- Håndværkerne lapper om dagen, når ingen bider --- */
  if (!spil.nat) {
    for (const b of spil.bygninger) {
      if (b.hp >= b.maksHp || spil.tid - b.sidsteSkade < RO_FOER_REPARATION) continue;
      b.hp = Math.min(b.maksHp, b.hp + REPARATION * dt);
    }
  }

  ryddDoede(spil);

  /* --- Smæld falmer --- */
  for (let i = spil.smaeld.length - 1; i >= 0; i--) {
    const s = spil.smaeld[i];
    s.alder += dt;
    if (s.alder >= s.liv) spil.smaeld.splice(i, 1);
  }
}

/** Kasernens tal for den soldat – står kasernen der ikke længere, bruges hans eget niveau. */
function kaserneNiveau(spil, s) {
  const b = spil.bygninger.find(x => x.id === s.fra);
  if (b && b.slags === 'kaserne') return bygData(b);
  return BYGNING_VED.kaserne.niveauer[Math.min(MAKS_NIVEAU, s.niveau) - 1];
}

/** Den nærmeste zombie inden for rækkevidde af et punkt. */
export function naermesteFjende(spil, x, y, raekkevidde, fra = null) {
  let bedst = null, bedstAfstand = Infinity;
  for (const f of spil.fjender) {
    if (f.hp <= 0) continue;
    if (Math.hypot(f.x - x, f.y - y) > raekkevidde + f.r) continue;
    const afstand = fra ? Math.hypot(f.x - fra.x, f.y - fra.y) : Math.hypot(f.x - x, f.y - y);
    if (afstand < bedstAfstand) { bedstAfstand = afstand; bedst = f; }
  }
  return bedst;
}

/** Den nærmeste soldat inden for rækkevidde af en zombie. */
function naermesteSoldat(spil, f, raekkevidde) {
  let bedst = null, bedstAfstand = raekkevidde;
  for (const s of spil.soldater) {
    if (s.hp <= 0) continue;
    const afstand = Math.hypot(s.x - f.x, s.y - f.y);
    if (afstand < bedstAfstand) { bedstAfstand = afstand; bedst = s; }
  }
  return bedst;
}

/**
 * Spolen: et vilkårligt dt deles op i faste skridt på 1/60 sekund, så en test
 * får nøjagtig det samme som en telefon, der tegner 60 billeder i sekundet. Der
 * klippes med vilje *ikke* i dt her — den, der tegner, klipper selv sit.
 */
export function tik(spil, dt) {
  let rest = Math.max(0, dt);
  while (rest > 1e-9 && spil.fase !== 'slut') {
    const d = Math.min(SKRIDT, rest);
    etSkridt(spil, d);
    rest -= d;
  }
  return spil;
}

/* ================= Felter ================= */
/** Alle ledige felter. */
export function ledigeFelter(spil) {
  const liste = [];
  for (let ky = 0; ky < RAEKKER; ky++) for (let kx = 0; kx < KOLONNER; kx++) {
    if (!bygningPaa(spil, kx, ky)) liste.push({ kx, ky });
  }
  return liste;
}

/** Det ledige felt, der ligger tættest på rådhuset (og længst fra, med `vend`). */
export function felt(spil, vend = false) {
  let bedst = null, bedstV = vend ? -1 : Infinity;
  for (const f of ledigeFelter(spil)) {
    const d = tilRaadhus(f.kx, f.ky);
    if (vend ? d > bedstV : d < bedstV) { bedstV = d; bedst = f; }
  }
  return bedst;
}

/**
 * Et ledigt felt i ringen `afstand` felter ude om rådhuset – det af dem, der
 * ligger tættest på. Ringen tælles i skridt hen over brættet (Chebyshev), men
 * vælges efter almindelig afstand, så de fire felter, zombierne *skal* igennem
 * (lige over, under og ved siden af rådhuset), kommer før hjørnerne.
 */
export function ringFelt(spil, afstand) {
  let bedst = null, naermest = Infinity;
  for (const f of ledigeFelter(spil)) {
    const dx = Math.abs(f.kx - RAADHUS_FELT.kx), dy = Math.abs(f.ky - RAADHUS_FELT.ky);
    if (Math.max(dx, dy) !== afstand) continue;
    const d = tilRaadhus(f.kx, f.ky);
    if (d < naermest) { naermest = d; bedst = f; }
  }
  return bedst;
}

/* ================= Botten ================= */
/*
  Botten er en målestok, ikke en modstander: enhedstesten bruger den til at
  spille hele uger igennem og holde øje med, at kurven hverken er for nem eller
  for hård.

  Det vigtige ved den er, at den **sparer op**. `naesteOenske()` giver ét ønske
  ad gangen i en fast rækkefølge, og kan det ikke betales, gør botten ingenting
  og venter. En tidligere udgave brugte bare pengene på det billigste, den havde
  råd til lige nu — og den endte med tyve mure, ét tårn og ingen bønder, fordi
  guldet aldrig nåede op på de 70, et tårn koster. Den slags ødelægger målingen:
  spillet så håbløst ud, mens det i virkeligheden var botten, der var dum.
*/

/** Det næste, botten gerne vil købe – `{ pris, goer() }` – eller null. */
function naesteOenske(spil) {
  const mine = slags => spil.bygninger.filter(b => b.slags === slags);
  const vilByg = (slags, f) => f && {
    pris: BYGNING_VED[slags].pris,
    goer: () => (byg(spil, slags, f.kx, f.ky).ok ? { hvad: 'byg', slags, ...f } : null),
  };
  const vilTraene = slags => {
    for (const b of spil.bygninger) {
      if (b.slags !== slags || b.traener) continue;
      const m = bemanding(spil, b);
      if (m.har >= m.plads) continue;
      const t = traening(b);
      return { pris: t.pris, goer: () => (traen(spil, b).ok ? { hvad: t.slags, id: b.id } : null) };
    }
    return null;
  };
  const vilOpgradere = kun => {
    let bedst = null, pris = Infinity;
    for (const b of spil.bygninger) {
      if (b.niveau >= MAKS_NIVEAU || !kun(b)) continue;
      const p = bygData(b).opgradering;
      if (p < pris) { pris = p; bedst = b; }
    }
    return bedst && { pris, goer: () => (opgrader(spil, bedst).ok ? { hvad: 'opgrader', slags: bedst.slags, id: bedst.id, niveau: bedst.niveau } : null) };
  };
  const vaaben = b => b.slags === 'taarn' || b.slags === 'kanon' || b.slags === 'mur';

  // Åbningen: fire mure klos op ad rådhuset. De fire felter er de eneste, en
  // zombie kan stå på og nå huset fra, så en mur dér er den billigste tid, der
  // findes — og den holder tårnene fri, så de ikke selv bliver ædt.
  const plan = [
    mine('mur').length < 4 && (() => vilByg('mur', ringFelt(spil, 1))),
    mine('taarn').length < 1 && (() => vilByg('taarn', felt(spil))),
    mine('farm').length < 1 && (() => vilByg('farm', felt(spil))),
    () => vilTraene('farm'),
    mine('taarn').length < 2 && (() => vilByg('taarn', felt(spil))),
    mine('farm').length < 2 && (() => vilByg('farm', felt(spil))),
    () => vilTraene('farm'),
    // Et opgraderet tårn er flere skud for pengene end et nyt – og rådhusets
    // og murenes opgraderinger er billig tid
    () => vilOpgradere(b => vaaben(b) || b.slags === 'raadhus'),
    mine('kaserne').length < 1 && (() => vilByg('kaserne', felt(spil))),
    () => vilTraene('kaserne'),
    mine('taarn').length < 3 && (() => vilByg('taarn', felt(spil))),
    mine('farm').length < 3 && (() => vilByg('farm', felt(spil))),
    () => vilTraene('farm'),
    mine('kanon').length < 1 && (() => vilByg('kanon', felt(spil))),
    () => vilOpgradere(() => true),
    mine('mur').length < 12 && (() => vilByg('mur', ringFelt(spil, 2))),
    mine('taarn').length < 6 && (() => vilByg('taarn', felt(spil))),
    () => vilByg('kanon', felt(spil)),
  ];
  for (const skridt of plan) {
    if (!skridt) continue;
    const oenske = skridt();
    if (oenske) return oenske;
  }
  return null;
}

/** Ét bot-træk: køber det næste på listen, hvis der er råd. Ellers spares der op. */
export function botTraek(spil) {
  if (spil.fase === 'slut') return null;
  const oenske = naesteOenske(spil);
  if (!oenske || spil.guld < oenske.pris) return null;
  return oenske.goer();
}

/** Lader botten spille, til rådhuset falder (eller til `maksDage` er nået). */
export function botSpiller(maksDage = 25, froeTal = 1) {
  const spil = nytSpil(froeTal);
  let vagt = 0;
  while (spil.fase !== 'slut' && spil.klarede < maksDage && vagt < 60 * 60 * 60) {
    while (botTraek(spil)) { /* byg så meget, der er råd til */ }
    tik(spil, SKRIDT);
    vagt++;
  }
  return spil;
}
