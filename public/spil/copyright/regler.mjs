/*
  Copyright – reglerne (uden skærm, så de kan enhedstestes).

  Alle spillere tegner det *samme* motiv på skift på den samme iPad. Når man er
  færdig, sættes ens copyright-stempel på tegningen – men stemplet er dækket til,
  så de andre kun kan se «©?». Bagefter går enheden rundt igen, og hver spiller
  gætter, hvem der har copyright på hver af de andres tegninger.

  Point:
    - 10 point for hvert rigtigt gæt.
    -  5 point til tegneren for hver, hen narrede …
    - … men kun hvis mindst én gættede rigtigt. Narrer man alle, er tegningen
      for godt gemt (en klat er ikke en kunst), og så giver den ingenting.
      Det er den samme regel som i Dixit, og den er dét, der holder spillet i
      gang: man skal tegne, så én kan kende en, men ikke alle.
*/

/** Motiverne. Alle tegner det samme i en runde – ellers gætter man på motivet
 *  i stedet for på stregen, og så er det et helt andet spil. */
export const MOTIVER = [
  'en kat der spiller fodbold',
  'et hus på månen',
  'en banan med hat',
  'en drage der græder',
  'en robot på ski',
  'en is der smelter i solen',
  'en fisk på cykel',
  'et spøgelse med briller',
  'en elefant i en gynge',
  'en pizza med ben',
  'en snemand på stranden',
  'en hund der flyver med balloner',
  'et monster under sengen',
  'en fødselsdagskage med lys',
  'en frø med krone',
  'en raket på vej til Mars',
  'en edderkop der strikker',
  'en pingvin med paraply',
  'et træ fuldt af fugle',
  'en enhjørning på rulleskøjter',
];

export const POINT_RIGTIGT = 10;
export const POINT_NARRET = 5;
export const MIN_SPILLERE = 3;
export const MAKS_SPILLERE = 6;
export const RUNDER = 3;
export const TEGNETID = 60;        // sekunder pr. tegning
export const NAVN_MAKS = 14;

/** Fisher-Yates med spillets egen tilfældighed, så en seed giver samme parti. */
export function bland(liste, rnd = Math.random) {
  const a = [...liste];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Tomme felter bliver «Spiller 2», og to ens navne får et nummer – ellers kan
 *  man ikke se forskel på de to Selma'er, når man skal gætte. */
export function reneNavne(navne) {
  const ud = [];
  (navne || []).forEach((n, i) => {
    let navn = String(n == null ? '' : n).trim().replace(/\s+/g, ' ').slice(0, NAVN_MAKS) || `Spiller ${i + 1}`;
    if (ud.some(a => a.toLowerCase() === navn.toLowerCase())) {
      let nr = 2;
      while (ud.some(a => a.toLowerCase() === `${navn} ${nr}`.toLowerCase())) nr++;
      navn = `${navn} ${nr}`;
    }
    ud.push(navn);
  });
  return ud;
}

/** Et motiv der ikke har været brugt i dette spil. */
export function nytMotiv(spil, rnd = Math.random) {
  if (spil.brugte.length >= MOTIVER.length) spil.brugte = [];
  let nr;
  do { nr = Math.floor(rnd() * MOTIVER.length); } while (spil.brugte.includes(nr));
  spil.brugte.push(nr);
  spil.motivNr = nr;
  spil.motiv = MOTIVER[nr];
  return spil.motiv;
}

/**
 * Nyt spil. `navne` er 3-6 spillere i den rækkefølge, de sidder.
 * Faser: 'tegn' → 'gaet' → 'afsloer' → 'stilling' → (ny runde eller 'slut').
 */
export function nytSpil({ navne, runder = RUNDER, rnd = Math.random } = {}) {
  const rene = reneNavne(navne).slice(0, MAKS_SPILLERE);
  if (rene.length < MIN_SPILLERE) throw new Error(`Der skal være mindst ${MIN_SPILLERE} spillere`);
  const spil = {
    spillere: rene.map(navn => ({ navn, point: 0 })),
    runder: Math.max(1, Math.floor(runder) || 1),
    runde: 1,
    motiv: '', motivNr: -1, brugte: [],
    fase: 'tegn',
    tegner: 0,                 // hvem tegner nu
    tegninger: [],             // [{ ejer, streger }] i den rækkefølge de blev tegnet
    raekkefoelge: [],          // blandet visningsrækkefølge, så man ikke kan tælle sig frem
    gaetter: 0,                // hvem gætter nu
    gaet: [],                  // gaet[gætter][tegning] = spillerindeks eller null
    opgoer: null,              // udregnes når alle har gættet
    afsloer: 0,                // hvor langt afsløringen er nået (indeks i raekkefoelge)
  };
  nytMotiv(spil, rnd);
  return spil;
}

/** Gemmer den tegning, den aktuelle tegner lige har lavet, og går videre. */
export function gemTegning(spil, streger, rnd = Math.random) {
  if (spil.fase !== 'tegn') return false;
  spil.tegninger.push({ ejer: spil.tegner, streger: Array.isArray(streger) ? streger : [] });
  if (spil.tegninger.length >= spil.spillere.length) startGaet(spil, rnd);
  else spil.tegner++;
  return true;
}

/** Alle har tegnet: bland tegningerne og lad den første gætte. */
export function startGaet(spil, rnd = Math.random) {
  spil.fase = 'gaet';
  spil.raekkefoelge = bland(spil.tegninger.map((_, i) => i), rnd);
  spil.gaetter = 0;
  spil.gaet = spil.spillere.map(() => spil.tegninger.map(() => null));
  return spil;
}

/** De tegninger, den aktuelle gætter skal tage stilling til (sin egen er ikke med). */
export function tilGaet(spil) {
  return spil.raekkefoelge.filter(t => spil.tegninger[t].ejer !== spil.gaetter);
}

/** Dem der mangler et gæt. Tom liste = klar til at give enheden videre. */
export function manglerGaet(spil) {
  return tilGaet(spil).filter(t => spil.gaet[spil.gaetter][t] == null);
}

/** Sæt et gæt. Man kan hverken gætte på sin egen tegning eller på sig selv. */
export function saetGaet(spil, tegning, spiller) {
  if (spil.fase !== 'gaet') return false;
  const t = spil.tegninger[tegning];
  if (!t || t.ejer === spil.gaetter) return false;
  if (!(spiller >= 0 && spiller < spil.spillere.length) || spiller === spil.gaetter) return false;
  spil.gaet[spil.gaetter][tegning] = spiller;
  return true;
}

/** Gætteren er færdig: giv enheden videre, eller gør runden op. */
export function faerdigMedGaet(spil, rnd = Math.random) {
  if (spil.fase !== 'gaet' || manglerGaet(spil).length) return false;
  spil.gaetter++;
  if (spil.gaetter >= spil.spillere.length) goerOp(spil);
  return true;
}

/**
 * Regner runden ud og lægger pointene til. Resultatet er én post pr. tegning i
 * afsløringsrækkefølge: { tegning, ejer, svar: [{ gaetter, valgt, rigtigt }],
 * rigtige, narrede, ejerPoint }.
 */
export function goerOp(spil) {
  const opgoer = spil.raekkefoelge.map(t => {
    const ejer = spil.tegninger[t].ejer;
    const svar = [];
    spil.spillere.forEach((_, g) => {
      if (g === ejer) return;
      const valgt = spil.gaet[g] ? spil.gaet[g][t] : null;
      if (valgt == null) return;
      svar.push({ gaetter: g, valgt, rigtigt: valgt === ejer });
    });
    const rigtige = svar.filter(s => s.rigtigt).length;
    const narrede = svar.length - rigtige;
    // Narrede man alle, giver tegningen ingenting – se forklaringen øverst.
    const ejerPoint = rigtige > 0 ? narrede * POINT_NARRET : 0;
    return { tegning: t, ejer, svar, rigtige, narrede, ejerPoint };
  });
  opgoer.forEach(o => {
    o.svar.forEach(s => { if (s.rigtigt) spil.spillere[s.gaetter].point += POINT_RIGTIGT; });
    spil.spillere[o.ejer].point += o.ejerPoint;
  });
  spil.opgoer = opgoer;
  spil.afsloer = 0;
  spil.fase = 'afsloer';
  return opgoer;
}

/** Den tegning, afsløringen står på lige nu. */
export function afsloeres(spil) {
  return spil.opgoer ? spil.opgoer[spil.afsloer] || null : null;
}

/** Videre til næste tegning – eller til rundens stilling. */
export function naesteAfsloering(spil) {
  if (spil.fase !== 'afsloer') return spil.fase;
  spil.afsloer++;
  if (spil.afsloer >= spil.opgoer.length) spil.fase = 'stilling';
  return spil.fase;
}

/** Ny runde med nyt motiv. Var det den sidste, slutter spillet. */
export function naesteRunde(spil, rnd = Math.random) {
  if (spil.fase !== 'stilling') return false;
  if (spil.runde >= spil.runder) { spil.fase = 'slut'; return false; }
  spil.runde++;
  spil.tegninger = []; spil.raekkefoelge = []; spil.gaet = [];
  spil.opgoer = null; spil.afsloer = 0; spil.tegner = 0; spil.gaetter = 0;
  spil.fase = 'tegn';
  nytMotiv(spil, rnd);
  return true;
}

/** Stillingen, bedste først. Lige mange point giver samme plads. */
export function stilling(spil) {
  const raekker = spil.spillere.map((p, i) => ({ i, navn: p.navn, point: p.point }));
  raekker.sort((a, b) => b.point - a.point || a.i - b.i);
  let plads = 0, sidst = null;
  raekker.forEach((r, n) => {
    if (r.point !== sidst) { plads = n + 1; sidst = r.point; }
    r.plads = plads;
  });
  return raekker;
}

/** Alle med førstepladsen – som regel én, men uafgjort kan ske. */
export function vindere(spil) {
  return stilling(spil).filter(r => r.plads === 1);
}

/** Har spilleren overhovedet sat en streg? En blank side kan ikke stemples. */
export function tomTegning(streger) {
  return !Array.isArray(streger) || streger.length === 0;
}
