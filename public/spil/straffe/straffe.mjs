// Straffespark – bolden, målet og målmanden. Ren JS uden DOM, så index.html kun
// skal tegne, og det hele kan enhedstestes med `node --test test/unit/straffe.test.mjs`.
//
// Jonas' ønske: «Man sparker og skal score på målmand». Man står på
// straffesparkspletten og swiper bolden af sted: retningen bestemmer hvor i
// målet man sigter, og swipe-farten hvor hårdt der sparkes. Målmanden vælger
// et hjørne og kaster sig – nogle gange det forkerte. Et hårdt spark er svært
// at nå, men spreder mere, så det kan ryge forbi; et blødt spark rammer hvor
// man sigter, men giver målmanden tid. Tre bolde, der ikke går ind, og kampen
// er slut. Scoren er antal mål, og målmanden bliver bedre for hvert andet mål.
//
// Alt regnes i meter i målets plan: x er sidelæns fra midten (positiv = højre),
// y er højden over græsset. Bolden sparkes fra 11 meter (straffesparkspletten).

/* ---------- Tal man kan skrue på ---------- */
export const MAAL = { bredde: 7.32, hoejde: 2.44 };  // et rigtigt fodboldmål
export const AFSTAND = 11;          // meter fra pletten til målet
export const LIV = 3;               // så mange bolde må man brænde
export const FART_MIN = 14;         // m/s ved det blødeste spark (kraft 0)
export const FART_MAKS = 30;        // m/s ved det hårdeste (kraft 1)
export const SPRED_MAKS = 1.05;     // meter bolden kan drille ved fuld kraft
export const STOLPE = 0.15;         // så tæt uden for kanten er det træværket
export const RAEKKE = 0.85;         // målmandens arme når så langt
export const KEEPER_START = { x: 0, y: 0.9 };  // hænderne står midt i målet
export const NIVEAU_MAKS = 12;      // bedre end det bliver målmanden ikke
export const MAAL_PR_NIVEAU = 2;    // så mange mål om at rykke et niveau op

/* ---------- Tilfældighed man kan gentage ---------- */
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const klem = (v, a, b) => Math.max(a, Math.min(b, v));

/* ---------- Målmanden ---------- */

/**
 * Målmanden til et niveau: hurtigere reaktion, længere spring og færre
 * fejlgæt, jo højere niveauet er. Niveau 1 er til at score på; niveau 12
 * kræver hårde spark helt ud i hjørnerne.
 */
export function keeperFor(niveau) {
  const n = klem(Math.round(niveau) || 1, 1, NIVEAU_MAKS);
  return {
    niveau: n,
    reaktion: Math.max(0.14, 0.32 - 0.016 * n),     // sekunder før han rører sig
    dykkefart: Math.min(9.5, 5.8 + 0.34 * n),       // m/s i springet
    fejlchance: Math.max(0.06, 0.5 - 0.045 * n),    // chancen for at gætte forkert side
  };
}

/* ---------- En kamp ---------- */

/** En frisk kamp: nul mål, tre bolde, målmanden på sit letteste niveau. */
export function nyKamp(seed) {
  return {
    seed: seed >>> 0,
    nr: 0,                          // nummer på næste spark (giver hvert spark sit eget frø)
    maal: 0, liv: LIV,
    niveau: 1,
    faerdig: false,
  };
}

/**
 * Ét spark. `sigte` er hvor i målets plan man sigter ({x, y} i meter), og
 * `kraft` 0-1 er hvor hårdt der sparkes. Hårdere = hurtigere (sværere at nå
 * for målmanden), men bolden spreder mere om sigtet. Giver hændelsen tilbage
 * til tegningen – hvor bolden endte, hvad målmanden gjorde, og hvad det blev
 * til: 'maal' | 'redning' | 'stolpe' | 'overligger' | 'forbi'.
 */
export function spark(s, sigte, kraft) {
  if (s.faerdig) return null;
  const rng = mulberry32((s.seed ^ Math.imul(s.nr + 1, 2654435761)) >>> 0);
  s.nr++;

  kraft = klem(+kraft || 0, 0, 1);
  const fart = FART_MIN + (FART_MAKS - FART_MIN) * kraft;
  const flyvetid = AFSTAND / fart;

  // Bolden driller: jo hårdere spark, desto mere kan den vige fra sigtet
  const spred = SPRED_MAKS * kraft * kraft;
  const bold = {
    x: (+sigte.x || 0) + (rng() * 2 - 1) * spred,
    y: Math.max(0.05, (+sigte.y || 0) + (rng() * 2 - 1) * spred * 0.7),
  };

  // Målmanden læser sparket – eller gætter forkert og kaster sig den anden vej
  const k = keeperFor(s.niveau);
  const forkert = rng() < k.fejlchance;
  const retning = bold.x >= 0 ? 1 : -1;
  const dyk = forkert
    ? { x: -retning * Math.max(1.8, Math.abs(bold.x)), y: Math.min(bold.y, 1.2) }
    : { x: bold.x, y: bold.y };

  // Han når så langt, som springet rækker i den tid bolden er undervejs
  const naaDist = k.dykkefart * Math.max(0, flyvetid - k.reaktion);
  const dx = dyk.x - KEEPER_START.x, dy = dyk.y - KEEPER_START.y;
  const dist = Math.hypot(dx, dy);
  const andel = dist > 0 ? Math.min(1, naaDist / dist) : 1;
  const naaet = { x: KEEPER_START.x + dx * andel, y: KEEPER_START.y + dy * andel };

  // Hvad blev det til? Træværket måles uden på målet, redningen med armene.
  const bx = Math.abs(bold.x), B = MAAL.bredde / 2, H = MAAL.hoejde;
  let resultat;
  if (bx < B && bold.y < H) {
    resultat = Math.hypot(naaet.x - bold.x, naaet.y - bold.y) <= RAEKKE ? 'redning' : 'maal';
  } else if (bold.y >= H && bold.y < H + STOLPE && bx < B + STOLPE) {
    resultat = 'overligger';
  } else if (bx >= B && bx < B + STOLPE && bold.y < H) {
    resultat = 'stolpe';
  } else {
    resultat = 'forbi';
  }

  if (resultat === 'maal') {
    s.maal++;
    s.niveau = klem(1 + Math.floor(s.maal / MAAL_PR_NIVEAU), 1, NIVEAU_MAKS);
  } else {
    s.liv--;
    if (s.liv <= 0) { s.liv = 0; s.faerdig = true; }
  }

  return {
    resultat, bold, sigte: { x: +sigte.x || 0, y: +sigte.y || 0 },
    kraft, fart, flyvetid,
    keeper: { ...k, forkert, dyk, naaet },
    maal: s.maal, liv: s.liv, niveau: s.niveau, slut: s.faerdig,
  };
}

/* ---------- En spiller der kan spille selv (bruges af testene) ---------- */

/**
 * Botten sparker fladt og hårdt mod et hjørne – det spark, spillet gerne vil
 * lære børnene. Siden skifter, så målmanden ikke kan stille sig fast.
 */
export function bot(s) {
  const side = s.nr % 2 === 0 ? 1 : -1;
  return { sigte: { x: 3.05 * side, y: 1.75 }, kraft: 0.85 };
}

/**
 * Spiller en hel kamp igennem uden browser. `vaelg(s)` bestemmer sparket
 * (standard: botten). Giver kampen tilbage, når den er slut.
 */
export function koer(seed, vaelg = bot, maksSpark = 500) {
  const s = nyKamp(seed);
  for (let i = 0; i < maksSpark && !s.faerdig; i++) {
    const v = vaelg(s);
    spark(s, v.sigte, v.kraft);
  }
  return s;
}
