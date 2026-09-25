/**
 * Baseforsvar – motoren (SorteSlyngels ønske #58: «et spil hvor man bygger en
 * base og skal forsvare den fra fjender … mure, tårne som kan skyde og tropper
 * til at angribe … farms, hvor man skal træne bønder … fjenderne skal ikke komme
 * i faste bølger som i et Tower Defense-spil, men mere tilfældigt over tid» —
 * med Warcraft 3-banen «Zombie Defense» som forbillede).
 *
 * Ønske #59 byggede videre: bueskytter og præster, tropper man kan se og
 * opgradere, belejrere der kaster længere end tårnene, en større bane med
 * tilfældigt terræn for hver runde, træningskø uden loft, og tre helte med aura,
 * trylleformular og erfaring.
 *
 * Banen er et gitter på 13 × 17 felter à 10 enheder (130 × 170), som index.html
 * tegner i midten af fladen. Rådhuset står i det præcise midtpunkt (6,8). Rundt
 * om ligger klipper, søer og skov, som ingen kan gå igennem eller bygge på.
 * Zombierne kommer ind fra kanterne og går mod rådhuset. Falder det, er det slut.
 *
 * Seks greb er værd at huske, hvis spillet skal røres igen:
 *
 *   1) **Zombierne følger et vejkort, ikke en sti.** `vejKort()` regner for
 *      hvert felt ud, hvor dyrt der er til rådhuset (Dijkstra): et frit felt
 *      koster 1, et felt med en bygning koster 1 + bygningens liv / BIDE_PRIS,
 *      og terræn kan slet ikke betrædes. En zombie går altid til den nabo, der
 *      er billigst; står der en bygning dér, bider den sig igennem. Derfor går
 *      zombierne udenom en enkelt mur, hvis omvejen er kort, og æder sig
 *      igennem, hvis den er lang — og det er umuligt at lukke dem ude for evigt.
 *      Kortet regnes kun om, når der bygges, sælges, opgraderes eller falder
 *      noget (`spil.vejSnavs`).
 *
 *   2) **Terrænet kan aldrig lukke nogen inde.** `lavTerraen()` lægger klatter
 *      af klipper, sø og skov ud, fylder lommer, der ikke hænger sammen med
 *      rådhuset, og prøver forfra, hvis ringen udenom banen ikke kan nå huset.
 *      Felterne lige omkring rådhuset holdes altid fri.
 *
 *   3) **Tiden går i dage, ikke i bølger.** Hver dag er 36 sekunder, og
 *      `spawnPrSek(dag, nat)` er en sandsynlighed pr. sekund, ikke en liste.
 *      Om natten kommer der 2,4 gange så mange. Score = hele dage, basen holdt.
 *
 *   4) **Tilfældigheden ligger i ét frø.** `nytSpil(froeTal)` laver sin egen
 *      terning (`froe()`), så motoren aldrig rører `Math.random()`. Samme frø =
 *      samme terræn og samme uge.
 *
 *   5) **Tropperne henter deres tal fra `spil.tropNiv`, hver gang de bruges.**
 *      Opgraderer man «soldater», bliver alle soldater på banen stærkere med
 *      det samme (og får fyldt livet op). Bygningens eget niveau bestemmer i
 *      stedet, hvor mange den træner ad gangen (`samtidig`).
 *
 *   6) **Belejrerne kaster længere end alle tårne** (48 mod skydetårnets 38 på
 *      øverste niveau). Kun ballisten, tropper og helte kan nå dem — eller et
 *      tårn, der står i Jægerens aura. Det er meningen: man skal bygge mod dem.
 */

export const FELT = 10;
export const KOLONNER = 13;
export const RAEKKER = 17;
export const BREDDE = KOLONNER * FELT;      // 130
export const HOEJDE = RAEKKER * FELT;       // 170

/** Rådhuset står i midten – banen er lavet ulige stor, netop for at det kan passe. */
export const RAADHUS_FELT = { kx: (KOLONNER - 1) / 2, ky: (RAEKKER - 1) / 2 };

/** Feltets midte i enheder. */
export const midte = (kx, ky) => ({ x: (kx + 0.5) * FELT, y: (ky + 0.5) * FELT });
export const paaBanen = (kx, ky) => kx >= 0 && kx < KOLONNER && ky >= 0 && ky < RAEKKER;
export const feltVed = (x, y) => ({ kx: Math.floor(x / FELT), ky: Math.floor(y / FELT) });

/** Terningen. Samme frø giver altid den samme uge – se punkt 4 øverst. */
export function froe(tal) {
  let a = (tal >>> 0) || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ================= Terrænet ================= */
export const TERRAEN = {
  sten: { navn: 'Klipper', paa: 'på klipperne', farve: '#6d6a72' },
  vand: { navn: 'Sø', paa: 'i søen', farve: '#2f6fa8' },
  skov: { navn: 'Skov', paa: 'i skoven', farve: '#1f5130' },
};
const TERRAEN_SLAGS = Object.keys(TERRAEN);
/** Hvor mange felter omkring rådhuset, der altid er fri. */
export const FRIRUM = 2;

const NABOER = [[0, -1], [1, 0], [0, 1], [-1, 0]];
/* Det udvidede gitter tager ringen lige uden for banen med – dér står zombierne, når de kommer. */
const EK = KOLONNER + 2, ER = RAEKKER + 2;
const eIdx = (kx, ky) => (ky + 1) * EK + (kx + 1);
const iUdvidet = (kx, ky) => kx >= -1 && kx <= KOLONNER && ky >= -1 && ky <= RAEKKER;

/**
 * Lægger klipper, sø og skov ud med terningen. Svaret er en liste med én plads
 * pr. felt (`ky * KOLONNER + kx`): null for græs, ellers terrænets navn.
 * Med `antal: 0` bliver banen helt fri (bruges af prøver, der skal stå stille).
 */
export function lavTerraen(rng, antal = null) {
  const hus = RAADHUS_FELT;
  for (let forsoeg = 0; forsoeg < 40; forsoeg++) {
    const t = new Array(KOLONNER * RAEKKER).fill(null);
    const klatter = antal ?? 6 + Math.floor(rng() * 4);
    for (let i = 0; i < klatter; i++) {
      const slags = TERRAEN_SLAGS[Math.floor(rng() * TERRAEN_SLAGS.length)];
      let kx = Math.floor(rng() * KOLONNER), ky = Math.floor(rng() * RAEKKER);
      const stoerrelse = 3 + Math.floor(rng() * 6);
      for (let j = 0; j < stoerrelse; j++) {
        const fri = Math.max(Math.abs(kx - hus.kx), Math.abs(ky - hus.ky)) <= FRIRUM;
        if (paaBanen(kx, ky) && !fri) t[ky * KOLONNER + kx] = slags;
        const [dx, dy] = NABOER[Math.floor(rng() * 4)];
        kx = Math.max(0, Math.min(KOLONNER - 1, kx + dx));
        ky = Math.max(0, Math.min(RAEKKER - 1, ky + dy));
      }
    }
    // Hvad kan nås fra rådhuset? Lommer, der ikke kan, fyldes op
    const naaet = new Uint8Array(EK * ER);
    const koe = [[hus.kx, hus.ky]];
    naaet[eIdx(hus.kx, hus.ky)] = 1;
    while (koe.length) {
      const [kx, ky] = koe.pop();
      for (const [dx, dy] of NABOER) {
        const nx = kx + dx, ny = ky + dy;
        if (!iUdvidet(nx, ny) || naaet[eIdx(nx, ny)]) continue;
        if (paaBanen(nx, ny) && t[ny * KOLONNER + nx]) continue;
        naaet[eIdx(nx, ny)] = 1;
        koe.push([nx, ny]);
      }
    }
    if (!naaet[eIdx(-1, -1)]) continue;             // terrænet lukkede huset inde – prøv igen
    for (let ky = 0; ky < RAEKKER; ky++) for (let kx = 0; kx < KOLONNER; kx++) {
      if (!t[ky * KOLONNER + kx] && !naaet[eIdx(kx, ky)]) t[ky * KOLONNER + kx] = 'sten';
    }
    return t;
  }
  return new Array(KOLONNER * RAEKKER).fill(null);
}

/** Terrænet på feltet (null for græs og for alt uden for banen). */
export const terraenPaa = (spil, kx, ky) => (paaBanen(kx, ky) ? spil.terraen[ky * KOLONNER + kx] : null);
/** Kan man gå på feltet? Ringen udenom banen er altid fri. */
export const fremkommelig = (spil, kx, ky) => iUdvidet(kx, ky) && !terraenPaa(spil, kx, ky);

/* ================= Bygningerne ================= */
/*
  Otte slags bygninger, syv af dem kan man selv rejse. Alle har `hp` (zombierne
  bider i dem), og alle kan opgraderes fire niveauer op. Tallene:
    skade/fart/raekkevidde  – tårnenes skud (fart = skud pr. sekund, et felt = 10)
    splash                  – kanonens bombe rammer alt inden for så mange enheder
    pladser/indtaegt        – farmens bønder og hvad hver af dem giver ved daggry
    samtidig                – hvor mange kasernen og kirken træner på én gang
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
    id: 'ballista', navn: 'Ballista', tegn: '🎯', farve: '#ff7ac6', pris: 130, foretraekker: 'belejrer',
    om: 'Skyder længst af alle – og sigter først efter belejrerne.',
    niveauer: [
      { hp: 170, skade: 40, fart: 0.6, raekkevidde: 58, opgradering: 110 },
      { hp: 280, skade: 70, fart: 0.65, raekkevidde: 62, opgradering: 230 },
      { hp: 450, skade: 120, fart: 0.7, raekkevidde: 66, opgradering: 430 },
      { hp: 720, skade: 200, fart: 0.75, raekkevidde: 70, opgradering: 0 },
    ],
  },
  {
    id: 'farm', navn: 'Farm', tegn: '🌾', farve: '#b7e04b', pris: 90,
    om: 'Træn bønder her. Hver bonde giver guld, hver gang det bliver morgen.',
    niveauer: [
      { hp: 130, pladser: 2, indtaegt: 30, opgradering: 90 },
      { hp: 220, pladser: 3, indtaegt: 44, opgradering: 190 },
      { hp: 360, pladser: 4, indtaegt: 62, opgradering: 360 },
      { hp: 580, pladser: 5, indtaegt: 88, opgradering: 0 },
    ],
  },
  {
    id: 'kaserne', navn: 'Kaserne', tegn: '⚔️', farve: '#4d8dff', pris: 150,
    om: 'Træn soldater og bueskyttere – så mange du vil. Opgradér for at træne flere ad gangen.',
    niveauer: [
      { hp: 210, samtidig: 1, opgradering: 140 },
      { hp: 340, samtidig: 2, opgradering: 280 },
      { hp: 550, samtidig: 3, opgradering: 480 },
      { hp: 880, samtidig: 4, opgradering: 0 },
    ],
  },
  {
    id: 'kirke', navn: 'Kirke', tegn: '⛪', farve: '#f2f4f8', pris: 130,
    om: 'Træn præster, der heler dine tropper og helte.',
    niveauer: [
      { hp: 190, samtidig: 1, opgradering: 130 },
      { hp: 310, samtidig: 2, opgradering: 260 },
      { hp: 500, samtidig: 3, opgradering: 450 },
      { hp: 800, samtidig: 4, opgradering: 0 },
    ],
  },
  {
    id: 'raadhus', navn: 'Rådhus', tegn: '🏠', farve: '#ff9f43', pris: 0, kanBygges: false,
    om: 'Hele basens hjerte – her hyrer du helte. Falder det, er spillet slut.',
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

/* ================= Tropperne ================= */
/*
  Tre slags, der trænes i kasernen og kirken. `raekkevidde` er hvor langt de
  slår eller skyder, `angreb` sekunder mellem hug/skud/heling. Tallene her er
  niveau 1 – `tropTal()` regner resten ud (punkt 5 øverst).
*/
export const NAERKAMP = 5;              // hvor tæt man skal være for at slås
export const TROPPER = {
  soldat: {
    navn: 'Soldat', flertal: 'soldater', bygning: 'kaserne', pris: 40, tid: 6,
    hp: 160, skade: 16, fart: 11, raekkevidde: NAERKAMP, angreb: 1.0,
    om: 'Går tæt på og hugger. Holder zombierne væk fra de andre.',
  },
  bueskytte: {
    navn: 'Bueskytte', flertal: 'bueskytter', bygning: 'kaserne', pris: 50, tid: 7,
    hp: 80, skade: 14, fart: 11, raekkevidde: 28, angreb: 1.1,
    om: 'Skyder pile på afstand – men tåler ikke meget.',
  },
  praest: {
    navn: 'Præst', flertal: 'præster', bygning: 'kirke', pris: 70, tid: 8,
    hp: 60, heling: 9, fart: 10, raekkevidde: 26, angreb: 1.2,
    om: 'Heler den tropp eller helt, der har fået flest bank.',
  },
};
export const TROP_MAKS = 5;
/** Hvor mange tropper der højst kan være på banen og i kø på én gang (så telefonen kan følge med). */
export const MAKS_TROPPER = 80;
/** Hvor mange der kan stå i kø pr. bygning. */
export const KOE_MAKS = 12;
const TROP_VAEKST = 1.4;
const TROP_OPGRADERING = [1.5, 2.5, 4, 6];

/** Troppens tal på niveau `niv`. */
export function tropTal(slags, niv = 1) {
  const t = TROPPER[slags], f = Math.pow(TROP_VAEKST, niv - 1);
  return {
    hp: Math.round(t.hp * f),
    skade: t.skade ? Math.round(t.skade * f) : 0,
    heling: t.heling ? Math.round(t.heling * f) : 0,
    fart: t.fart + (niv - 1) * 0.5,
    raekkevidde: t.raekkevidde > NAERKAMP ? t.raekkevidde + (niv - 1) * 1.5 : NAERKAMP,
    angreb: t.angreb,
  };
}
/** Hvad det koster at løfte alle tropper af slagsen ét niveau (0 på toppen). */
export const tropOpgradering = (slags, niv) => (niv >= TROP_MAKS ? 0 : Math.round(TROPPER[slags].pris * TROP_OPGRADERING[niv - 1]));

/* ================= Heltene ================= */
/*
  Tre helte, der hyres på rådhuset – hver kun én gang. De får erfaring for
  hver zombie, der falder tæt på dem, og bliver stærkere for hvert niveau. Hver
  har en aura (virker af sig selv på dem, der står tæt på) og en trylleformular
  (man trykker selv, og så skal den lades op igen). Dør en helt, rejser han sig
  igen ved rådhuset efter HELT_GENOPSTAAR sekunder – med erfaringen i behold.
*/
export const HELT_MAKS = 10;
export const HELT_GENOPSTAAR = 20;
export const HELT_RAEKKE = 35;          // hvor langt en helt går væk fra sin vagtpost
export const HELT_XP_RAEKKE = 50;       // zombier, der falder så tæt på, giver erfaring
export const HELTE = {
  ridder: {
    navn: 'Ridderen', tegn: '🛡️', farve: '#9fb4d9', pris: 200,
    hp: 420, skade: 20, fart: 12, raekkevidde: NAERKAMP + 1, angreb: 0.9,
    om: 'Tåler en masse og står forrest.',
    aura: { navn: 'Mod', om: 'Tropper tæt på ham slår 30 % hårdere', r: 28, skade: 0.3 },
    trylle: { navn: 'Skjoldslag', om: 'Slår alle zombier tæt på og lammer dem i 2 sek.', skade: 60, r: 16, lam: 2, ventetid: 18 },
  },
  troldkvinde: {
    navn: 'Troldkvinden', tegn: '🔮', farve: '#c28bff', pris: 240,
    hp: 220, skade: 15, splash: 7, fart: 11, raekkevidde: 32, angreb: 1.2,
    om: 'Kaster ildkugler, der rammer flere på én gang.',
    aura: { navn: 'Ild i krudtet', om: 'Tårne tæt på hende skyder 25 % hurtigere', r: 32, fart: 0.25 },
    trylle: { navn: 'Ildregn', om: 'Et ildhav rammer alle zombier omkring hendes mål', skade: 130, r: 20, ventetid: 22 },
  },
  jaeger: {
    navn: 'Jægeren', tegn: '🏹', farve: '#7bd88f', pris: 220,
    hp: 260, skade: 26, fart: 13, raekkevidde: 40, angreb: 1.0,
    om: 'Skyder langt og hårdt – godt mod belejrerne.',
    aura: { navn: 'Falkeblik', om: 'Tårne og bueskyttere tæt på ham skyder 30 % længere', r: 30, raekkevidde: 0.3 },
    trylle: { navn: 'Pileregn', om: 'En pil i hver af de otte nærmeste zombier', skade: 70, antal: 8, r: 55, ventetid: 20 },
  },
};
export const HELT_IDER = Object.keys(HELTE);

/** Erfaring, der skal til for at komme fra `niv` til næste. */
export const xpTil = niv => 60 * niv * niv;
/** Heltens styrke vokser 10 % pr. niveau – auraen 5 %. */
export const heltFaktor = niv => 1 + 0.10 * (niv - 1);
export const auraFaktor = niv => 1 + 0.05 * (niv - 1);

export function heltTal(slags, niv = 1) {
  const h = HELTE[slags], f = heltFaktor(niv);
  return {
    hp: Math.round(h.hp * f), skade: Math.round(h.skade * f), fart: h.fart,
    raekkevidde: h.raekkevidde, angreb: h.angreb, splash: h.splash || 0,
    trylleSkade: Math.round(h.trylle.skade * f),
  };
}

/* ================= Zombierne ================= */
/*
  `panser` trækkes fra hvert eneste træffer (dog mindst 1 i skade), `skade` er
  hvad et bid koster, og `angrebFart` er sekunder mellem bidene. Belejreren har
  desuden `raekkevidde` og `kast`: den stiller sig og kaster sten efter den
  nærmeste bygning, så snart der er én inden for rækkevidde.
*/
export const FJENDER = {
  zombie: { navn: 'Zombie', tegn: '🧟', hp: 34, fart: 6.5, skade: 7, angrebFart: 1.2, guld: 8, panser: 0, r: 3.2, farve: '#7bd88f' },
  loeber: { navn: 'Løber', tegn: '🏃', hp: 24, fart: 13, skade: 6, angrebFart: 0.8, guld: 10, panser: 0, r: 2.7, farve: '#ffd447' },
  brute: { navn: 'Bæst', tegn: '🦍', hp: 140, fart: 5, skade: 22, angrebFart: 1.4, guld: 24, panser: 3, r: 4.2, farve: '#b18cff' },
  belejrer: { navn: 'Belejrer', tegn: '🪨', hp: 70, fart: 4.2, skade: 8, angrebFart: 2.6, guld: 34, panser: 2, r: 4.4, farve: '#c98a4b', raekkevidde: 48, kast: 24 },
  kaempe: { navn: 'Kæmpe', tegn: '👹', hp: 440, fart: 3.8, skade: 55, angrebFart: 1.8, guld: 70, panser: 7, r: 5.4, farve: '#ff4d5e' },
};

/**
 * Hvor meget mere liv zombierne har på dag `dag`. Vokser, til man ikke kan følge
 * med – og hurtigere efter dag 10, for ellers kunne en stor base med fulde farme
 * holde i en evighed.
 */
export const hpFaktor = dag => Math.pow(1.15, dag - 1) * Math.pow(1.06, Math.max(0, dag - 10));
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
  if (dag >= 6) v.push(['belejrer', Math.min(2.5, 0.6 + (dag - 6) * 0.25)]);
  if (dag >= 9) v.push(['kaempe', Math.min(5, 0.4 + (dag - 9) * 0.45)]);
  return v;
}

/** Hedder dagen noget særligt? Bruges til varslet på skærmen. */
export function dagVarsel(dag) {
  if (dag === 3) return 'Løbere! De er hurtige';
  if (dag === 5) return 'Bæster – de har panser';
  if (dag === 6) return 'Belejrere! De kaster længere end tårnene';
  if (dag === 9) return 'Kæmper på vej…';
  if (dag % 10 === 0) return 'Det bliver kun værre herfra';
  return null;
}

/* ================= Spillet ================= */
export const START_GULD = 260;
export const DAG_LAENGDE = 36;          // sekunder pr. dag
export const NAT_START = 0.55;          // hvor langt inde i dagen det bliver mørkt
export const BONDE_PRIS = 30;
export const BONDE_TID = 5;
export const SALG_DEL = 0.5;            // halvdelen af det, bygningen har kostet, retur
export const REPARATION = 2.2;          // hp pr. sekund, om dagen, når ingen bider i den
export const RO_FOER_REPARATION = 3;    // sekunder uden bid, før håndværkerne tør gå derhen
export const TROP_RAEKKE = 40;          // hvor langt en tropp går væk fra sin bygning
export const BIDE_PRIS = 30;            // så meget liv svarer til ét felts omvej i vejkortet
const SKRIDT = 1 / 60;
const SKUD_FART = 95;
const STEN_FART = 55;

export const dagNr = tid => Math.floor(tid / DAG_LAENGDE) + 1;
export const erNat = tid => (tid % DAG_LAENGDE) / DAG_LAENGDE >= NAT_START;
export function spawnPrSek(dag, nat) {
  return (0.10 + (dag - 1) * 0.045) * (nat ? 2.4 : 1);
}

/**
 * Et nyt spil. `valg.terraen: false` giver en helt fri bane (til prøver, der
 * skal kende hvert felt); ellers lægges der nyt terræn ud med frøet.
 */
export function nytSpil(froeTal = 1, valg = {}) {
  const rng = froe(froeTal);
  const spil = {
    tid: 0, dag: 1, nat: false, fase: 'spil',
    guld: START_GULD, drab: 0, klarede: 0,
    bygninger: [], fjender: [], soldater: [], helte: [], skud: [], smaeld: [],
    tropNiv: { soldat: 1, bueskytte: 1, praest: 1 },
    naesteId: 1, slut: null, sidsteIndtaegt: 0, froeTal, rng,
    terraen: valg.terraen === false ? new Array(KOLONNER * RAEKKER).fill(null) : lavTerraen(rng),
    vej: null, vejSnavs: true,
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
    boender: 0, igang: [], koe: [], sidsteSkade: -99, blink: 0,
  };
  spil.bygninger.push(b);
  spil.vejSnavs = true;
  return b;
}

export const bygningPaa = (spil, kx, ky) => spil.bygninger.find(b => b.kx === kx && b.ky === ky) || null;

/** Bygger. Svaret er `{ ok, fejl, bygning }` – fejlen er noget, man kan vise et barn. */
export function byg(spil, slags, kx, ky) {
  const type = BYGNING_VED[slags];
  if (!type || type.kanBygges === false || spil.fase === 'slut') return { ok: false, fejl: 'Ikke nu' };
  if (!paaBanen(kx, ky)) return { ok: false, fejl: 'Uden for banen' };
  const t = terraenPaa(spil, kx, ky);
  if (t) return { ok: false, fejl: `Man kan ikke bygge ${TERRAEN[t].paa}` };
  if (bygningPaa(spil, kx, ky)) return { ok: false, fejl: 'Der står allerede noget' };
  if (spil.guld < type.pris) return { ok: false, fejl: 'Ikke guld nok' };
  spil.guld -= type.pris;
  return { ok: true, bygning: rejs(spil, slags, kx, ky) };
}

/** Opgraderer ét niveau. Livet fyldes helt op. */
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
  spil.vejSnavs = true;
  return { ok: true, bygning: b };
}

export const salgspris = b => Math.floor(b.investeret * SALG_DEL);

/** Sælger en bygning igen. Rådhuset kan man ikke sælge. Det, der står i kø, får man fuldt retur. */
export function saelg(spil, b) {
  if (!b || b.slags === 'raadhus') return { ok: false, fejl: 'Rådhuset bliver stående' };
  const nr = spil.bygninger.indexOf(b);
  if (nr < 0) return { ok: false, fejl: 'Der er ikke noget at sælge' };
  spil.bygninger.splice(nr, 1);
  spil.vejSnavs = true;
  const retur = [...b.koe, ...b.igang].reduce((s, o) => s + o.pris, 0);
  const guld = salgspris(b) + retur;
  spil.guld += guld;
  return { ok: true, guld };
}

/* ---------- Træning ---------- */
/** Tropperne (af alle slags), der hører til bygningen. */
export const soldaterFra = (spil, b, slags = null) =>
  spil.soldater.filter(s => s.fra === b.id && (!slags || s.slags === slags)).length;

/** Hvad man kan træne i bygningen – en liste, for kasernen har to slags. */
export function traening(b) {
  if (b.slags === 'farm') return [{ slags: 'bonde', navn: 'bonde', pris: BONDE_PRIS, tid: BONDE_TID }];
  return Object.entries(TROPPER)
    .filter(([, t]) => t.bygning === b.slags)
    .map(([slags, t]) => ({ slags, navn: t.navn.toLowerCase(), pris: t.pris, tid: t.tid }));
}

/** Hvor mange der er, og hvor mange der er undervejs (i kø eller i gang). */
export function bemanding(spil, b) {
  const undervejs = b.igang.length + b.koe.length;
  if (b.slags === 'farm') return { har: b.boender, undervejs, plads: bygData(b).pladser };
  if (!traening(b).length) return null;
  return { har: soldaterFra(spil, b), undervejs, plads: Infinity };
}

/** Alle tropper på banen plus dem, der er undervejs. */
export const haerStoerrelse = spil => spil.soldater.length +
  spil.bygninger.reduce((s, b) => s + (b.slags === 'farm' ? 0 : b.igang.length + b.koe.length), 0);

/**
 * Sætter én i kø. Man kan trykke så mange gange, man vil (op til KOE_MAKS i
 * køen); bygningen træner `samtidig` ad gangen og tager den næste, når der
 * bliver plads. Farmen har stadig et loft: der er kun så mange pladser.
 */
export function traen(spil, b, slags = null) {
  const valg = b ? traening(b) : [];
  const t = slags ? valg.find(v => v.slags === slags) : valg[0];
  if (!t || spil.fase === 'slut') return { ok: false, fejl: 'Ikke nu' };
  const m = bemanding(spil, b);
  if (m.undervejs >= KOE_MAKS) return { ok: false, fejl: 'Køen er fuld' };
  if (b.slags === 'farm' && m.har + m.undervejs >= m.plads) return { ok: false, fejl: 'Ikke plads til flere – opgradér' };
  if (b.slags !== 'farm' && haerStoerrelse(spil) >= MAKS_TROPPER) return { ok: false, fejl: 'Hæren er fuld' };
  if (spil.guld < t.pris) return { ok: false, fejl: 'Ikke guld nok' };
  spil.guld -= t.pris;
  b.koe.push({ slags: t.slags, laengde: t.tid, pris: t.pris });
  startTraening(spil, b);
  return { ok: true };
}

/** Flytter fra køen og i gang, så længe bygningen har hænder til det. */
function startTraening(spil, b) {
  const samtidig = bygData(b).samtidig || 1;
  while (b.koe.length && b.igang.length < samtidig) {
    const o = b.koe.shift();
    b.igang.push({ ...o, til: spil.tid + o.laengde });
  }
}

/** Opgraderer alle tropper af én slags – også dem, der allerede står på banen. */
export function opgraderTropper(spil, slags) {
  if (!TROPPER[slags] || spil.fase === 'slut') return { ok: false, fejl: 'Ikke nu' };
  const niv = spil.tropNiv[slags];
  if (niv >= TROP_MAKS) return { ok: false, fejl: 'Færdigtrænet' };
  const pris = tropOpgradering(slags, niv);
  if (spil.guld < pris) return { ok: false, fejl: 'Ikke guld nok' };
  spil.guld -= pris;
  spil.tropNiv[slags] = niv + 1;
  const n = tropTal(slags, niv + 1);
  for (const s of spil.soldater) {
    if (s.slags !== slags) continue;
    s.maksHp = n.hp;
    s.hp = n.hp;
  }
  return { ok: true, niveau: niv + 1 };
}

/** Hvad farmene giver ved daggry. */
export const farmIndtaegt = spil => spil.bygninger
  .reduce((sum, b) => sum + (b.slags === 'farm' ? bygData(b).indtaegt * b.boender : 0), 0);

/** Alle bønder på basen – tallet i HUD'en. */
export const boenderIAlt = spil => spil.bygninger.reduce((sum, b) => sum + (b.boender || 0), 0);

/* ---------- Heltene ---------- */
export const heltAf = (spil, slags) => spil.helte.find(h => h.slags === slags) || null;

/** Hyrer en helt på rådhuset. Hver helt kan kun hyres én gang. */
export function hyrHelt(spil, slags) {
  const type = HELTE[slags];
  if (!type || spil.fase === 'slut') return { ok: false, fejl: 'Ikke nu' };
  if (heltAf(spil, slags)) return { ok: false, fejl: `${type.navn} er allerede hyret` };
  if (spil.guld < type.pris) return { ok: false, fejl: 'Ikke guld nok' };
  spil.guld -= type.pris;
  const hus = spil.raadhus;
  const n = heltTal(slags, 1);
  const h = {
    id: spil.naesteId++, slags, niv: 1, xp: 0, x: hus.x, y: hus.y + FELT * 0.8,
    hp: n.hp, maksHp: n.hp, ladt: 0, blink: 0, gang: 0, klar: spil.tid,
    vagt: { x: hus.x, y: hus.y }, doed: false, genopstaar: 0,
  };
  spil.helte.push(h);
  return { ok: true, helt: h };
}

/** Sender helten hen et sted, hvor han holder vagt. Terræn kan man ikke stå på. */
export function sendHelt(spil, h, x, y) {
  if (!h || h.doed) return { ok: false, fejl: 'Helten er faldet' };
  const { kx, ky } = feltVed(x, y);
  if (!paaBanen(kx, ky)) return { ok: false, fejl: 'Uden for banen' };
  if (terraenPaa(spil, kx, ky)) return { ok: false, fejl: `Man kan ikke stå ${TERRAEN[terraenPaa(spil, kx, ky)].paa}` };
  h.vagt = { x, y };
  return { ok: true };
}

/** Sekunder til trylleformularen er klar igen (0 = klar). */
export const trylleVenter = (spil, h) => Math.max(0, h.klar - spil.tid);

/** Kaster heltens trylleformular. */
export function kast(spil, h) {
  if (!h || spil.fase === 'slut') return { ok: false, fejl: 'Ikke nu' };
  if (h.doed) return { ok: false, fejl: 'Helten er faldet' };
  if (trylleVenter(spil, h) > 0) return { ok: false, fejl: 'Ikke klar endnu' };
  const type = HELTE[h.slags], tr = type.trylle, n = heltTal(h.slags, h.niv);
  let ramte = 0;
  if (h.slags === 'ridder') {
    for (const f of spil.fjender) {
      if (Math.hypot(f.x - h.x, f.y - h.y) > tr.r + f.r) continue;
      f.hp -= n.trylleSkade; f.blink = 0.15; f.lammet = spil.tid + tr.lam; ramte++;
    }
    spil.smaeld.push({ x: h.x, y: h.y, r: tr.r, liv: 0.45, alder: 0, slags: 'skjold' });
  } else if (h.slags === 'troldkvinde') {
    const maal = naermesteFjende(spil, h.x, h.y, 45);
    if (!maal) return { ok: false, fejl: 'Ingen zombier tæt på' };
    for (const f of spil.fjender) {
      if (Math.hypot(f.x - maal.x, f.y - maal.y) > tr.r + f.r) continue;
      f.hp -= n.trylleSkade; f.blink = 0.15; ramte++;
    }
    spil.smaeld.push({ x: maal.x, y: maal.y, r: tr.r, liv: 0.6, alder: 0, slags: 'ild' });
  } else {
    const naer = spil.fjender
      .filter(f => f.hp > 0 && Math.hypot(f.x - h.x, f.y - h.y) <= tr.r + f.r)
      .sort((a, b) => Math.hypot(a.x - h.x, a.y - h.y) - Math.hypot(b.x - h.x, b.y - h.y))
      .slice(0, tr.antal);
    for (const f of naer) {
      f.hp -= gennemPanser(n.trylleSkade, f.panser); f.blink = 0.15; ramte++;
      spil.smaeld.push({ x: f.x, y: f.y, fx: h.x, fy: h.y, r: 2, liv: 0.35, alder: 0, slags: 'pilregn' });
    }
  }
  if (!ramte) return { ok: false, fejl: 'Ingen zombier tæt på' };
  h.klar = spil.tid + tr.ventetid;
  ryddDoede(spil);
  return { ok: true, ramte };
}

/** Summen af én slags aura, der rammer punktet (x,y). */
export function aura(spil, x, y, felt) {
  let sum = 0;
  for (const h of spil.helte) {
    if (h.doed) continue;
    const a = HELTE[h.slags].aura;
    if (!a[felt] || Math.hypot(h.x - x, h.y - y) > a.r) continue;
    sum += a[felt] * auraFaktor(h.niv);
  }
  return sum;
}

function giveXp(h, xp) {
  if (h.niv >= HELT_MAKS) return;
  h.xp += xp;
  while (h.niv < HELT_MAKS && h.xp >= xpTil(h.niv)) {
    h.xp -= xpTil(h.niv);
    h.niv += 1;
    const n = heltTal(h.slags, h.niv);
    h.maksHp = n.hp;
    h.hp = n.hp;                                 // et nyt niveau sætter helten i stand
    h.opNiveau = 1.2;                            // index.html tegner et lille lysglimt
  }
  if (h.niv >= HELT_MAKS) h.xp = 0;
}

/* ---------- Vejkortet ---------- */
/** Hvad det koster at gå ind på feltet: 1, plus bygningens liv omregnet til omvej. */
function feltPris(b) {
  if (!b) return 1;
  if (b.slags === 'raadhus') return 1;
  return 1 + b.maksHp / BIDE_PRIS;
}

/**
 * Dijkstra fra rådhuset over det udvidede gitter (punkt 1 øverst). Svaret er
 * en liste med prisen til rådhuset for hvert felt; Infinity, hvor man ikke kan
 * komme (terræn).
 */
export function vejKort(spil) {
  if (spil.vej && !spil.vejSnavs) return spil.vej;
  const n = EK * ER;
  const dist = new Float64Array(n).fill(Infinity);
  const faerdig = new Uint8Array(n);
  const byg = new Array(n).fill(null);
  for (const b of spil.bygninger) byg[eIdx(b.kx, b.ky)] = b;
  const hus = eIdx(RAADHUS_FELT.kx, RAADHUS_FELT.ky);
  dist[hus] = 0;
  for (;;) {
    let c = -1, bedst = Infinity;
    for (let i = 0; i < n; i++) if (!faerdig[i] && dist[i] < bedst) { bedst = dist[i]; c = i; }
    if (c < 0) break;
    faerdig[c] = 1;
    const kx = (c % EK) - 1, ky = Math.floor(c / EK) - 1;
    const ind = dist[c] + feltPris(byg[c]);          // det koster at gå ind på c
    for (const [dx, dy] of NABOER) {
      const nx = kx + dx, ny = ky + dy;
      if (!fremkommelig(spil, nx, ny)) continue;
      const m = eIdx(nx, ny);
      if (!faerdig[m] && ind < dist[m]) dist[m] = ind;
    }
  }
  spil.vej = { dist, byg };
  spil.vejSnavs = false;
  return spil.vej;
}

/**
 * Hvad gør en zombie, der står på (kx,ky)? Den går til den nabo, der er
 * billigst til rådhuset; står der en bygning, bider den i den i stedet.
 * Svaret er `{ gaa: {kx,ky} }` eller `{ slaa: bygning }`.
 */
export function vaelgSkridt(spil, kx, ky) {
  const { dist, byg } = vejKort(spil);
  let bedst = null, bedstPris = Infinity;
  for (const [dx, dy] of NABOER) {
    const nx = kx + dx, ny = ky + dy;
    if (!fremkommelig(spil, nx, ny)) continue;
    const m = eIdx(nx, ny);
    const pris = dist[m] + feltPris(byg[m]);
    if (pris < bedstPris - 1e-9) { bedstPris = pris; bedst = { kx: nx, ky: ny, b: byg[m] }; }
  }
  if (!bedst) return null;
  if (bedst.b) return { slaa: bedst.b };
  return { gaa: { kx: bedst.kx, ky: bedst.ky } };
}

/* ---------- Tropper og helte går udenom terrænet ---------- */
/** Kan man gå i lige linje fra a til b uden at træde på terræn? */
function friLinje(spil, x0, y0, x1, y1) {
  const d = Math.hypot(x1 - x0, y1 - y0), n = Math.ceil(d / 2.5);
  for (let i = 1; i <= n; i++) {
    const { kx, ky } = feltVed(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n);
    if (terraenPaa(spil, kx, ky)) return false;
  }
  return true;
}

/** Bredde først fra målet: hvilken nabo til `fra` kommer nærmest? */
function naesteFeltMod(spil, fra, til) {
  const dist = new Int16Array(EK * ER).fill(-1);
  const koe = [til];
  dist[eIdx(til.kx, til.ky)] = 0;
  const start = eIdx(fra.kx, fra.ky);
  for (let i = 0; i < koe.length && dist[start] < 0; i++) {
    const c = koe[i], d = dist[eIdx(c.kx, c.ky)];
    for (const [dx, dy] of NABOER) {
      const nx = c.kx + dx, ny = c.ky + dy;
      if (!fremkommelig(spil, nx, ny) || dist[eIdx(nx, ny)] >= 0) continue;
      dist[eIdx(nx, ny)] = d + 1;
      koe.push({ kx: nx, ky: ny });
    }
  }
  let bedst = null, bedstD = dist[start] < 0 ? Infinity : dist[start];
  for (const [dx, dy] of NABOER) {
    const nx = fra.kx + dx, ny = fra.ky + dy;
    if (!iUdvidet(nx, ny)) continue;
    const d = dist[eIdx(nx, ny)];
    if (d >= 0 && d < bedstD) { bedstD = d; bedst = { kx: nx, ky: ny }; }
  }
  return bedst;
}

/**
 * Går et stykke mod (tx,ty). Er der terræn i vejen, går man i stedet mod
 * midten af det næste felt på den korteste vej rundt (regnes kun om, når man
 * skifter felt eller mål). Returnerer afstanden, der var tilbage.
 */
function gaaMod(spil, e, tx, ty, fart, dt) {
  let mx = tx, my = ty;
  if (!friLinje(spil, e.x, e.y, tx, ty)) {
    const fra = feltVed(e.x, e.y), til = feltVed(tx, ty);
    const noegle = `${fra.kx},${fra.ky}>${til.kx},${til.ky}`;
    if (!e.rute || e.rute.noegle !== noegle) e.rute = { noegle, naeste: naesteFeltMod(spil, fra, til) };
    if (e.rute.naeste) { const p = midte(e.rute.naeste.kx, e.rute.naeste.ky); mx = p.x; my = p.y; }
  }
  const dx = mx - e.x, dy = my - e.y;
  const afstand = Math.hypot(dx, dy);
  if (afstand < 1e-6) return 0;
  const skridt = Math.min(afstand, fart * dt);
  const nx = e.x + dx / afstand * skridt, ny = e.y + dy / afstand * skridt;
  const f = feltVed(nx, ny);
  if (terraenPaa(spil, f.kx, f.ky)) return afstand;   // aldrig ind i terrænet
  e.x = nx; e.y = ny;
  e.gang = (e.gang || 0) + dt;
  return Math.hypot(tx - e.x, ty - e.y);
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
    raekkevidde: f.raekkevidde || 0, kast: f.kast || 0,
    guld: Math.round(f.guld * guldFaktor(spil.dag)),
    ladt: 0, blink: 0, gang: spil.rng() * 6, slaar: null, lammet: 0,
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
    for (const h of spil.helte) {
      if (!h.doed && Math.hypot(h.x - f.x, h.y - f.y) <= HELT_XP_RAEKKE) giveXp(h, f.guld);
    }
    spil.smaeld.push({ x: f.x, y: f.y, r: f.r, liv: 0.3, alder: 0, slags: 'doed' });
    spil.fjender.splice(i, 1);
  }
  for (let i = spil.soldater.length - 1; i >= 0; i--) {
    const s = spil.soldater[i];
    if (s.hp > 0) continue;
    spil.smaeld.push({ x: s.x, y: s.y, r: 3, liv: 0.3, alder: 0, slags: 'soldat' });
    spil.soldater.splice(i, 1);
  }
  for (const h of spil.helte) {
    if (h.doed || h.hp > 0) continue;
    h.doed = true;
    h.hp = 0;
    h.genopstaar = spil.tid + HELT_GENOPSTAAR;
    spil.smaeld.push({ x: h.x, y: h.y, r: 4, liv: 0.5, alder: 0, slags: 'soldat' });
  }
  for (let i = spil.bygninger.length - 1; i >= 0; i--) {
    const b = spil.bygninger[i];
    if (b.hp > 0) continue;
    spil.smaeld.push({ x: b.x, y: b.y, r: 6, liv: 0.45, alder: 0, slags: 'ruin' });
    spil.bygninger.splice(i, 1);
    spil.vejSnavs = true;
    // Bygningen er væk – zombierne, der bed i den, skal finde noget nyt
    for (const f of spil.fjender) if (f.slaar === b.id) f.slaar = null;
    if (b.slags === 'raadhus') {
      spil.fase = 'slut';
      spil.slut = { dag: spil.dag, klarede: spil.klarede, drab: spil.drab };
      return;
    }
  }
}

/** Alle, zombierne kan slås med: tropper og levende helte. */
function *forsvarere(spil) {
  for (const s of spil.soldater) if (s.hp > 0) yield s;
  for (const h of spil.helte) if (!h.doed && h.hp > 0) yield h;
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
    if (!b.igang.length) continue;
    for (let i = b.igang.length - 1; i >= 0; i--) {
      const o = b.igang[i];
      if (o.til > spil.tid) continue;
      b.igang.splice(i, 1);
      if (o.slags === 'bonde') { b.boender += 1; continue; }
      const n = tropTal(o.slags, spil.tropNiv[o.slags]);
      const vinkel = spil.rng() * Math.PI * 2;
      spil.soldater.push({
        id: spil.naesteId++, slags: o.slags, fra: b.id,
        x: b.x + Math.cos(vinkel) * FELT * 0.7, y: b.y + Math.sin(vinkel) * FELT * 0.7,
        hp: n.hp, maksHp: n.hp, ladt: 0, blink: 0, gang: 0,
      });
    }
    startTraening(spil, b);
  }

  /* --- Zombierne --- */
  for (const f of spil.fjender) {
    if (f.blink > 0) f.blink -= dt;
    if (f.lammet > spil.tid) continue;               // Ridderens skjoldslag
    f.gang += dt;
    f.ladt += dt;

    // 1) Står der en tropp eller helt lige foran? Så slås vi med ham først.
    const soldat = naermesteForsvarer(spil, f, NAERKAMP + f.r);
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

    // 2) En belejrer stiller sig og kaster, så snart en bygning er inden for rækkevidde
    if (f.raekkevidde) {
      const maal = naermesteBygning(spil, f.x, f.y, f.raekkevidde);
      if (maal) {
        f.retning = Math.atan2(maal.y - f.y, maal.x - f.x);
        if (f.ladt >= f.angrebFart) {
          f.ladt = 0;
          spil.skud.push({
            x: f.x, y: f.y, maalBygning: maal.id, mx: maal.x, my: maal.y, slags: 'sten',
            skade: f.kast, fart: STEN_FART, alder: 0, fjende: true, sx: f.x, sy: f.y,
          });
        }
        continue;
      }
    }

    // 3) Bider vi i en bygning? Så bliver vi ved, til den falder.
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

    // 4) Ellers går vi mod rådhuset, ét felt ad gangen efter vejkortet.
    const naaet = Math.hypot(f.mx - f.x, f.my - f.y) < 0.4;
    if (naaet) {
      const valg = vaelgSkridt(spil, f.kx, f.ky);
      if (!valg) continue;
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

  /* --- Tropperne --- */
  for (const s of spil.soldater) {
    if (s.blink > 0) s.blink -= dt;
    s.ladt += dt;
    const hjem = spil.bygninger.find(b => b.id === s.fra) || spil.raadhus;
    const n = tropTal(s.slags, spil.tropNiv[s.slags]);
    if (s.slags === 'praest') { praestSkridt(spil, s, n, hjem, dt); continue; }
    const rk = n.raekkevidde * (1 + (s.slags === 'bueskytte' ? aura(spil, s.x, s.y, 'raekkevidde') : 0));
    const maal = naermesteFjende(spil, hjem.x, hjem.y, TROP_RAEKKE, s);
    if (maal) {
      const afstand = Math.hypot(maal.x - s.x, maal.y - s.y);
      if (afstand > rk + (s.slags === 'soldat' ? 0 : maal.r)) gaaMod(spil, s, maal.x, maal.y, n.fart, dt);
      else if (s.ladt >= n.angreb) {
        s.ladt = 0;
        const skade = Math.round(n.skade * (1 + aura(spil, s.x, s.y, 'skade')));
        if (s.slags === 'soldat') {
          maal.hp -= gennemPanser(skade, maal.panser);
          maal.blink = 0.12;
          spil.smaeld.push({ x: maal.x, y: maal.y, r: 2.5, liv: 0.18, alder: 0, slags: 'hug' });
        } else {
          spil.skud.push({ x: s.x, y: s.y, maal: maal.id, mx: maal.x, my: maal.y, slags: 'pil', skade, splash: 0, fart: SKUD_FART, alder: 0 });
        }
      }
      continue;
    }
    // Ingen at slås med: gå tilbage til bygningen og hold vagt
    if (Math.hypot(hjem.x - s.x, hjem.y - s.y) > FELT) gaaMod(spil, s, hjem.x, hjem.y, n.fart, dt);
  }

  /* --- Heltene --- */
  for (const h of spil.helte) {
    if (h.opNiveau > 0) h.opNiveau -= dt;
    if (h.doed) {
      if (spil.tid >= h.genopstaar) {
        h.doed = false; h.hp = h.maksHp;
        h.x = spil.raadhus.x; h.y = spil.raadhus.y + FELT * 0.8;
        h.vagt = { x: spil.raadhus.x, y: spil.raadhus.y };
      }
      continue;
    }
    if (h.blink > 0) h.blink -= dt;
    h.ladt += dt;
    const n = heltTal(h.slags, h.niv);
    const maal = naermesteFjende(spil, h.vagt.x, h.vagt.y, HELT_RAEKKE, h);
    if (maal) {
      const afstand = Math.hypot(maal.x - h.x, maal.y - h.y);
      if (afstand > n.raekkevidde + (h.slags === 'ridder' ? 0 : maal.r)) gaaMod(spil, h, maal.x, maal.y, n.fart, dt);
      else if (h.ladt >= n.angreb) {
        h.ladt = 0;
        if (h.slags === 'ridder') {
          maal.hp -= gennemPanser(n.skade, maal.panser);
          maal.blink = 0.12;
          spil.smaeld.push({ x: maal.x, y: maal.y, r: 3, liv: 0.2, alder: 0, slags: 'hug' });
        } else {
          spil.skud.push({
            x: h.x, y: h.y, maal: maal.id, mx: maal.x, my: maal.y,
            slags: h.slags === 'troldkvinde' ? 'magi' : 'pil', skade: n.skade, splash: n.splash, fart: SKUD_FART, alder: 0,
          });
        }
      }
      continue;
    }
    if (Math.hypot(h.vagt.x - h.x, h.vagt.y - h.y) > 3) gaaMod(spil, h, h.vagt.x, h.vagt.y, n.fart, dt);
  }

  /* --- Tårnene skyder --- */
  for (const b of spil.bygninger) {
    const n = bygData(b);
    if (b.blink > 0) b.blink -= dt;
    if (!n.fart) continue;                         // mure, farme, kaserner og rådhus skyder ikke
    b.ladt += dt;
    const rk = n.raekkevidde * (1 + aura(spil, b.x, b.y, 'raekkevidde'));
    const type = BYGNING_VED[b.slags];
    const maal = (type.foretraekker && naermesteFjende(spil, b.x, b.y, rk, null, type.foretraekker))
      || naermesteFjende(spil, b.x, b.y, rk);
    if (maal) b.vinkel = Math.atan2(maal.y - b.y, maal.x - b.x);
    if (!maal || b.ladt < 1 / (n.fart * (1 + aura(spil, b.x, b.y, 'fart')))) continue;
    b.ladt = 0;
    spil.skud.push({
      x: b.x, y: b.y, maal: maal.id, mx: maal.x, my: maal.y, slags: b.slags,
      skade: n.skade, splash: n.splash || 0, fart: b.slags === 'ballista' ? SKUD_FART * 1.4 : SKUD_FART, alder: 0,
    });
  }

  /* --- Skuddene flyver --- */
  for (let i = spil.skud.length - 1; i >= 0; i--) {
    const s = spil.skud[i];
    s.alder += dt;
    const maal = s.fjende ? spil.bygninger.find(b => b.id === s.maalBygning) : spil.fjender.find(f => f.id === s.maal);
    if (maal) { s.mx = maal.x; s.my = maal.y; }     // skuddet følger med, til det rammer
    const dx = s.mx - s.x, dy = s.my - s.y;
    const afstand = Math.hypot(dx, dy);
    const skridt = s.fart * dt;
    if (afstand > skridt && s.alder < 3) {
      s.x += dx / afstand * skridt; s.y += dy / afstand * skridt;
      continue;
    }
    s.x = s.mx; s.y = s.my;
    if (s.fjende) {
      if (maal) {
        skadPaaBygning(spil, maal, s.skade);
        spil.smaeld.push({ x: s.x, y: s.y, r: 3.5, liv: 0.25, alder: 0, slags: 'ruin' });
      }
    } else if (s.splash) {
      spil.smaeld.push({ x: s.x, y: s.y, r: s.splash, liv: 0.25, alder: 0, slags: s.slags === 'magi' ? 'ild' : 'bomb' });
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

/** Præsten finder den, der har fået flest bank, og heler ham. */
function praestSkridt(spil, s, n, hjem, dt) {
  let bedst = null, laveste = 0.999;
  for (const v of forsvarere(spil)) {
    if (v === s && laveste < 0.999) continue;
    const del = v.hp / v.maksHp;
    if (del >= laveste) continue;
    if (Math.hypot(v.x - hjem.x, v.y - hjem.y) > TROP_RAEKKE + n.raekkevidde) continue;
    laveste = del; bedst = v;
  }
  if (bedst) {
    const afstand = Math.hypot(bedst.x - s.x, bedst.y - s.y);
    if (afstand > n.raekkevidde) gaaMod(spil, s, bedst.x, bedst.y, n.fart, dt);
    else if (s.ladt >= n.angreb) {
      s.ladt = 0;
      bedst.hp = Math.min(bedst.maksHp, bedst.hp + n.heling);
      spil.smaeld.push({ x: bedst.x, y: bedst.y, fx: s.x, fy: s.y, r: 3, liv: 0.35, alder: 0, slags: 'heling' });
    }
    return;
  }
  if (Math.hypot(hjem.x - s.x, hjem.y - s.y) > FELT) gaaMod(spil, s, hjem.x, hjem.y, n.fart, dt);
}

/**
 * Den nærmeste zombie inden for rækkevidde af et punkt. Med `fra` vælges den,
 * der er nærmest `fra` (tropperne leder omkring deres bygning, men går efter
 * den, der er nærmest dem selv); med `slags` kun den slags.
 */
export function naermesteFjende(spil, x, y, raekkevidde, fra = null, slags = null) {
  let bedst = null, bedstAfstand = Infinity;
  for (const f of spil.fjender) {
    if (f.hp <= 0 || (slags && f.slags !== slags)) continue;
    if (Math.hypot(f.x - x, f.y - y) > raekkevidde + f.r) continue;
    const afstand = fra ? Math.hypot(f.x - fra.x, f.y - fra.y) : Math.hypot(f.x - x, f.y - y);
    if (afstand < bedstAfstand) { bedstAfstand = afstand; bedst = f; }
  }
  return bedst;
}

function naermesteBygning(spil, x, y, raekkevidde) {
  let bedst = null, bedstAfstand = raekkevidde;
  for (const b of spil.bygninger) {
    const afstand = Math.hypot(b.x - x, b.y - y);
    if (afstand <= bedstAfstand) { bedstAfstand = afstand; bedst = b; }
  }
  return bedst;
}

/** Den nærmeste tropp eller helt inden for rækkevidde af en zombie. */
function naermesteForsvarer(spil, f, raekkevidde) {
  let bedst = null, bedstAfstand = raekkevidde;
  for (const s of forsvarere(spil)) {
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
const tilRaadhus = (kx, ky) => Math.hypot(kx - RAADHUS_FELT.kx, ky - RAADHUS_FELT.ky);

/** Alle ledige felter – uden bygning og uden terræn. */
export function ledigeFelter(spil) {
  const liste = [];
  for (let ky = 0; ky < RAEKKER; ky++) for (let kx = 0; kx < KOLONNER; kx++) {
    if (!terraenPaa(spil, kx, ky) && !bygningPaa(spil, kx, ky)) liste.push({ kx, ky });
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

/**
 * Et ledigt felt skråt ud fra rådhuset (så langt fra de fire lige veje ind som
 * muligt) – dér går zombierne mindst forbi. Botten stiller kasernen og kirken dér.
 */
export function hjoerneFelt(spil) {
  let bedst = null, bedstV = -Infinity;
  for (const f of ledigeFelter(spil)) {
    const dx = Math.abs(f.kx - RAADHUS_FELT.kx), dy = Math.abs(f.ky - RAADHUS_FELT.ky);
    if (Math.max(dx, dy) > 3) continue;
    const v = Math.min(dx, dy) * 10 - Math.hypot(dx, dy);
    if (v > bedstV) { bedstV = v; bedst = f; }
  }
  return bedst || felt(spil);
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

  `brug` vælger, hvad botten må røre: { helte, tropper, ballista } – så en
  prøve kan måle, hvor meget hver ting er værd.
*/

/** Det næste, botten gerne vil købe – `{ pris, goer() }` – eller null. */
function naesteOenske(spil, brug) {
  const mine = slags => spil.bygninger.filter(b => b.slags === slags);
  const vilByg = (slags, f) => f && {
    pris: BYGNING_VED[slags].pris,
    goer: () => (byg(spil, slags, f.kx, f.ky).ok ? { hvad: 'byg', slags, ...f } : null),
  };
  const vilTraene = (bygning, slags, hoejst) => {
    if (hoejst != null && spil.soldater.filter(s => s.slags === slags).length + ventende(slags) >= hoejst) return null;
    for (const b of spil.bygninger) {
      if (b.slags !== bygning || b.koe.length) continue;
      const m = bemanding(spil, b);
      if (b.slags === 'farm' && m.har + m.undervejs >= m.plads) continue;
      const t = traening(b).find(v => !slags || v.slags === slags);
      return { pris: t.pris, goer: () => (traen(spil, b, t.slags).ok ? { hvad: t.slags, id: b.id } : null) };
    }
    return null;
  };
  const ventende = slags => spil.bygninger.reduce((s, b) => s + [...b.igang, ...b.koe].filter(o => o.slags === slags).length, 0);
  const vilOpgradere = kun => {
    let bedst = null, pris = Infinity;
    for (const b of spil.bygninger) {
      if (b.niveau >= MAKS_NIVEAU || !kun(b)) continue;
      const p = bygData(b).opgradering;
      if (p < pris) { pris = p; bedst = b; }
    }
    return bedst && { pris, goer: () => (opgrader(spil, bedst).ok ? { hvad: 'opgrader', slags: bedst.slags, id: bedst.id, niveau: bedst.niveau } : null) };
  };
  const vilHyre = slags => !heltAf(spil, slags) && {
    pris: HELTE[slags].pris, goer: () => (hyrHelt(spil, slags).ok ? { hvad: 'helt', slags } : null),
  };
  const vilTropNiv = (slags, til) => spil.tropNiv[slags] < til && {
    pris: tropOpgradering(slags, spil.tropNiv[slags]),
    goer: () => (opgraderTropper(spil, slags).ok ? { hvad: 'tropniveau', slags } : null),
  };
  const vaaben = b => b.slags === 'taarn' || b.slags === 'kanon' || b.slags === 'mur' || b.slags === 'ballista';

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
    // Belejrerne kommer på dag 6 – så skal der stå en ballista
    brug.ballista && spil.dag >= 4 && mine('ballista').length < 1 && (() => vilByg('ballista', felt(spil))),
    // Et opgraderet tårn er flere skud for pengene end et nyt – og rådhusets
    // og murenes opgraderinger er billig tid
    () => vilOpgradere(b => (vaaben(b) || b.slags === 'raadhus') && b.niveau < 2),
    brug.tropper && mine('kaserne').length < 1 && (() => vilByg('kaserne', hjoerneFelt(spil))),
    brug.tropper && (() => vilTraene('kaserne', 'soldat', 3)),
    brug.helte && (() => vilHyre('ridder')),
    mine('taarn').length < 3 && (() => vilByg('taarn', felt(spil))),
    mine('farm').length < 3 && (() => vilByg('farm', felt(spil))),
    () => vilTraene('farm'),
    () => vilOpgradere(b => b.slags === 'farm' && b.niveau < 3),
    () => vilTraene('farm'),
    brug.tropper && (() => vilTraene('kaserne', 'bueskytte', 3)),
    () => vilOpgradere(b => (vaaben(b) || b.slags === 'raadhus') && b.niveau < 3),
    mine('kanon').length < 1 && (() => vilByg('kanon', felt(spil))),
    brug.helte && (() => vilHyre('jaeger')),
    brug.tropper && mine('kirke').length < 1 && (() => vilByg('kirke', hjoerneFelt(spil))),
    brug.tropper && (() => vilTraene('kirke', 'praest', 2)),
    brug.ballista && spil.dag >= 8 && mine('ballista').length < 2 && (() => vilByg('ballista', felt(spil))),
    brug.helte && (() => vilHyre('troldkvinde')),
    brug.tropper && (() => vilTropNiv('soldat', 3)),
    brug.tropper && (() => vilTropNiv('bueskytte', 3)),
    () => vilOpgradere(() => true),
    brug.tropper && (() => vilTraene('kaserne', 'soldat', 6)),
    brug.tropper && (() => vilTraene('kaserne', 'bueskytte', 6)),
    brug.tropper && (() => vilTropNiv('soldat', TROP_MAKS)),
    brug.tropper && (() => vilTropNiv('bueskytte', TROP_MAKS)),
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

const ALT = { helte: true, tropper: true, ballista: true };

/** Ét bot-træk: køber det næste på listen, hvis der er råd. Ellers spares der op. */
export function botTraek(spil, brug = ALT) {
  if (spil.fase === 'slut') return null;
  // Heltene kaster, så snart der er noget at ramme
  for (const h of spil.helte) if (!h.doed && trylleVenter(spil, h) === 0 && naermesteFjende(spil, h.x, h.y, 18)) kast(spil, h);
  const oenske = naesteOenske(spil, brug);
  if (!oenske || spil.guld < oenske.pris) return null;
  return oenske.goer();
}

/** Lader botten spille, til rådhuset falder (eller til `maksDage` er nået). */
export function botSpiller(maksDage = 25, froeTal = 1, brug = ALT) {
  const spil = nytSpil(froeTal);
  let vagt = 0;
  while (spil.fase !== 'slut' && spil.klarede < maksDage && vagt < 60 * 60 * 80) {
    while (botTraek(spil, brug)) { /* byg så meget, der er råd til */ }
    tik(spil, SKRIDT);
    vagt++;
  }
  return spil;
}
