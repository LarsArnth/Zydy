/*
  Pjattemaskinen – motoren. Ren JS uden DOM, enhedstestet i test/unit/pjat.test.mjs.

  Alias ønske (#48) lød bare «Lav noget sjovt og randomt». Så det her ER en
  maskine, der laver noget sjovt og randomt: tre ruller – HVEM, GØR HVAD og
  HVOR – der tilsammen trækker en pjattet sætning som «Den fnisende flodhest
  danser ballet på månen!». Og for at der er noget at samle på, har maskinen
  et album: hver figur, man møder, sættes ind, og scoren på toplisten er hvor
  mange af dem man har mødt.

  Tre regler holder pjattet i skak:
    1) Grammatikken kan ikke gå i stykker: hver figur bærer selv sit «den/det»,
       og alle handlinger og steder er skrevet, så de passer efter hinanden i
       netop den rækkefølge. Enhedstesten prøver dem alle.
    2) De gyldne figurer er sjældne (vægt GULD_VAEGT mod ALM_VAEGT), så et
       guldtræk føles som en gevinst – men aldrig umuligt.
    3) Tørke-reglen: har man trukket TOERKE_MAKS gange uden en ny figur, er
       den næste GARANTERET ny. Uden den ville de sidste figurer i albummet
       tage timer, og så er samlingen ikke sjov længere.
*/

/* ---------- Rullerne ---------- */

// HVEM: hver figur har sit eget «den/det», så sætningen altid er rigtig dansk.
// De fire sidste er gyldne og sjældne – dem skal man være heldig at møde.
export const FIGURER = [
  { id: 'flodhest',   koen: 'den', navn: 'fnisende flodhest',    emoji: '🦛' },
  { id: 'drage',      koen: 'den', navn: 'prustende drage',      emoji: '🐉' },
  { id: 'blaeksprutte', koen: 'den', navn: 'kildne blæksprutte', emoji: '🐙' },
  { id: 'dovendyr',   koen: 'det', navn: 'søvnige dovendyr',     emoji: '🦥' },
  { id: 'ugle',       koen: 'den', navn: 'kloge ugle',           emoji: '🦉' },
  { id: 'pingvin',    koen: 'den', navn: 'fjollede pingvin',     emoji: '🐧' },
  { id: 'robot',      koen: 'den', navn: 'rustne robot',         emoji: '🤖' },
  { id: 'snemand',    koen: 'den', navn: 'smeltende snemand',    emoji: '⛄' },
  { id: 'kartoffel',  koen: 'den', navn: 'hoppende kartoffel',   emoji: '🥔' },
  { id: 'kaktus',     koen: 'den', navn: 'syngende kaktus',      emoji: '🌵' },
  { id: 'trex',       koen: 'den', navn: 'generte T-rex',        emoji: '🦖' },
  { id: 'skildpadde', koen: 'den', navn: 'turbohurtige skildpadde', emoji: '🐢' },
  { id: 'haj',        koen: 'den', navn: 'kræsne haj',           emoji: '🦈' },
  { id: 'flamingo',   koen: 'den', navn: 'svimle flamingo',      emoji: '🦩' },
  { id: 'hamster',    koen: 'den', navn: 'brølende hamster',     emoji: '🐹' },
  { id: 'kat',        koen: 'den', navn: 'usynlige kat',         emoji: '🐱' },
  { id: 'trold',      koen: 'den', navn: 'drilske trold',        emoji: '👹' },
  { id: 'zombie',     koen: 'den', navn: 'høflige zombie',       emoji: '🧟' },
  { id: 'papegoeje',  koen: 'den', navn: 'skrattende papegøje',  emoji: '🦜' },
  { id: 'spoegelse',  koen: 'det', navn: 'nysgerrige spøgelse',  emoji: '👻' },
  { id: 'enhjoerning', koen: 'den', navn: 'gyldne enhjørning',   emoji: '🦄', guld: true },
  { id: 'havfrue',    koen: 'den', navn: 'glitrende havfrue',    emoji: '🧜‍♀️', guld: true },
  { id: 'troldmand',  koen: 'den', navn: 'tusindårige troldmand', emoji: '🧙‍♂️', guld: true },
  { id: 'alien',      koen: 'den', navn: 'venlige alien',        emoji: '👽', guld: true },
];

// GØR HVAD: skrevet så det følger lige efter figuren.
export const HANDLINGER = [
  { tekst: 'danser ballet',                emoji: '🩰' },
  { tekst: 'spiser spaghetti med fingrene', emoji: '🍝' },
  { tekst: 'prutter i en megafon',         emoji: '💨' },
  { tekst: 'synger opera',                 emoji: '🎤' },
  { tekst: 'kilder en vandmelon',          emoji: '🍉' },
  { tekst: 'rider på en støvsuger',        emoji: '🧹' },
  { tekst: 'bager pandekager',             emoji: '🥞' },
  { tekst: 'laver kolbøtter',              emoji: '🤸' },
  { tekst: 'gemmer sig for en agurk',      emoji: '🥒' },
  { tekst: 'børster tænder på en løve',    emoji: '🦁' },
  { tekst: 'danser breakdance',            emoji: '🕺' },
  { tekst: 'spiller luftguitar',           emoji: '🎸' },
  { tekst: 'taber sine bukser',            emoji: '👖' },
  { tekst: 'jonglerer med frikadeller',    emoji: '🤹' },
  { tekst: 'snorker som en traktor',       emoji: '🚜' },
  { tekst: 'bøvser hele alfabetet',        emoji: '🔤' },
  { tekst: 'løber maraton baglæns',        emoji: '🏃' },
  { tekst: 'taler med en sok',             emoji: '🧦' },
  { tekst: 'holder fødselsdag for en sten', emoji: '🎂' },
  { tekst: 'bygger et slot af vingummi',   emoji: '🏰' },
  { tekst: 'nyser konfetti',               emoji: '🎉' },
  { tekst: 'spiller fodbold med et rugbrød', emoji: '⚽' },
];

// HVOR: skrevet så det følger lige efter handlingen.
export const STEDER = [
  { tekst: 'på månen',                       emoji: '🌙' },
  { tekst: 'i en svømmehal fuld af budding', emoji: '🍮' },
  { tekst: 'oven på Rundetårn',              emoji: '🗼' },
  { tekst: 'i farmors have',                 emoji: '🌷' },
  { tekst: 'på bunden af havet',             emoji: '🌊' },
  { tekst: 'i en elevator',                  emoji: '🛗' },
  { tekst: 'på en regnbue',                  emoji: '🌈' },
  { tekst: 'på et piratskib',                emoji: '🏴‍☠️' },
  { tekst: 'i den dybe jungle',              emoji: '🌴' },
  { tekst: 'på Nordpolen',                   emoji: '🧊' },
  { tekst: 'i en ostebutik',                 emoji: '🧀' },
  { tekst: 'under din seng',                 emoji: '🛏️' },
  { tekst: 'i et rumskib',                   emoji: '🚀' },
  { tekst: 'på en trampolin',                emoji: '🎪' },
  { tekst: 'midt i skolegården',             emoji: '🏫' },
  { tekst: 'i en spand popcorn',             emoji: '🍿' },
  { tekst: 'på kanten af en vulkan',         emoji: '🌋' },
  { tekst: 'i et tog fyldt med høns',        emoji: '🚂' },
  { tekst: 'på et løbehjul i fuld fart',     emoji: '🛴' },
  { tekst: 'i Legoland',                     emoji: '🧱' },
  { tekst: 'bag ved sofaen',                 emoji: '🛋️' },
  { tekst: 'i en kæmpe sok',                 emoji: '🧦' },
];

export const ALM_VAEGT = 5;      // almindelige figurers lod i posen
export const GULD_VAEGT = 1;     // de gyldnes – ét lod mod fem
export const TOERKE_MAKS = 8;    // så mange træk uden ny figur, før den næste garanteret er ny

/* ---------- Terningen ---------- */

/** Samme lille talstrøm som i de andre spil, så en test kan spille det samme igen. */
export function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/* ---------- Spillet ---------- */

/** Et frisk spil: tomt album, ingen træk. */
export function nytSpil() {
  return {
    album: [],     // id'er på de figurer, man har mødt – længden er scoren
    drej: 0,       // hvor mange gange der er trukket i alt
    toerke: 0,     // træk i træk uden en ny figur (nulstilles ved en ny)
  };
}

/** Vægtet lodtrækning blandt figurerne: de gyldne har færre lodder. */
function traekFigur(r) {
  let sum = 0;
  for (const f of FIGURER) sum += f.guld ? GULD_VAEGT : ALM_VAEGT;
  let lod = r() * sum;
  for (const f of FIGURER) {
    lod -= f.guld ? GULD_VAEGT : ALM_VAEGT;
    if (lod < 0) return f;
  }
  return FIGURER[FIGURER.length - 1];
}

/**
 * Ét træk i maskinen. Opdaterer spillet og svarer med, hvad rullerne landede
 * på: {figur, handling, sted, ny, guld}. Tørke-reglen: efter TOERKE_MAKS træk
 * uden en ny figur er den næste garanteret en, man ikke har mødt.
 */
export function traek(s, r) {
  const usete = FIGURER.filter(f => !s.album.includes(f.id));
  const figur = usete.length && s.toerke >= TOERKE_MAKS
    ? usete[Math.floor(r() * usete.length)]
    : traekFigur(r);
  const handling = HANDLINGER[Math.floor(r() * HANDLINGER.length)];
  const sted = STEDER[Math.floor(r() * STEDER.length)];
  const ny = !s.album.includes(figur.id);
  if (ny) { s.album.push(figur.id); s.toerke = 0; } else { s.toerke++; }
  s.drej++;
  return { figur, handling, sted, ny, guld: !!figur.guld };
}

/** Sætningen, rullerne blev til: «Den fnisende flodhest danser ballet på månen!» */
export function saetning(t) {
  const stort = t.figur.koen === 'det' ? 'Det' : 'Den';
  return stort + ' ' + t.figur.navn + ' ' + t.handling.tekst + ' ' + t.sted.tekst + '!';
}

/** Er hele albummet fyldt? Så er der fest. */
export function alleFundet(s) {
  return s.album.length >= FIGURER.length;
}

/* ---------- Gem og hent ---------- */

/** Spillet som tekst til localStorage. */
export function gem(s) {
  return JSON.stringify({ album: s.album, drej: s.drej, toerke: s.toerke });
}

/** Tekst tilbage til et spil. Skrald – eller ukendte figurer – bliver bare væk. */
export function hent(tekst) {
  const s = nytSpil();
  try {
    const d = JSON.parse(tekst);
    const kendte = new Set(FIGURER.map(f => f.id));
    if (Array.isArray(d.album)) {
      s.album = [...new Set(d.album.filter(id => kendte.has(id)))];
    }
    const tal = v => Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;
    s.drej = tal(d.drej);
    s.toerke = Math.min(TOERKE_MAKS, tal(d.toerke));
  } catch (e) { return nytSpil(); }
  return s;
}
