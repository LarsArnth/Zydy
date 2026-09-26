/*
  Galgespil – reglerne, ordene og en lille bot. Ingen browser her, så det hele
  kan enhedstestes (test/unit/galge.test.mjs).

  Et ord er skjult bag streger. Man gætter ét bogstav ad gangen; er det med i
  ordet, kommer det frem alle de steder, det står. Er det ikke, tegnes en ny
  del af galgen og manden. Står hele manden der, før ordet er fundet, er det
  tabt – finder man ordet først, er manden reddet.

  Score = ord i træk. Jo længere stimen er, jo længere ord og jo mere af galgen
  står der allerede fra starten (færre forkerte gæt at give af).
*/

/** Alfabetet i den rækkefølge, børnene har lært det – også på tastaturet. */
export const BOGSTAVER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZÆØÅ';

/** Galgen og manden i den rækkefølge, de tegnes – én del pr. forkert gæt. */
export const DELE = ['jord', 'stolpe', 'bjaelke', 'reb', 'hoved', 'krop', 'armV', 'armH', 'benV', 'benH'];

/**
 * Niveauerne. `liv` er hvor mange forkerte gæt man har; resten af DELE står
 * der fra starten. Ordlængden går op, men ikke helt: lange ord er faktisk
 * lettere at gætte bogstav for bogstav, det svære ved dem er at stave dem.
 */
export const NIVEAUER = [
  { niveau: 1, fraStime: 0, min: 3, maks: 5, liv: 10 },
  { niveau: 2, fraStime: 3, min: 4, maks: 7, liv: 8 },
  { niveau: 3, fraStime: 6, min: 5, maks: 9, liv: 7 },
  { niveau: 4, fraStime: 10, min: 6, maks: 20, liv: 6 },
];

/** Liv, når en ven har fundet på ordet. */
export const VEN_LIV = 10;
export const VEN_MAKS = 20;             // bogstaver i et ord fra en ven

export const KATEGORIER = [
  { id: 'dyr', navn: 'Dyr', emoji: '🐾', ord: [
    'KAT', 'HUND', 'GRIS', 'HEST', 'FÅR', 'GED', 'MUS', 'ULV', 'ÆSEL', 'RÆV', 'BJØRN', 'LØVE',
    'TIGER', 'ZEBRA', 'GIRAF', 'ABE', 'ELEFANT', 'KAMEL', 'PINGVIN', 'DELFIN', 'HVAL', 'HAJ',
    'FISK', 'KRABBE', 'BLÆKSPRUTTE', 'SNEGL', 'FRØ', 'SLANGE', 'KROKODILLE', 'PAPEGØJE', 'UGLE',
    'ØRN', 'AND', 'GÅS', 'HØNE', 'KYLLING', 'HAMSTER', 'KANIN', 'EGERN', 'PINDSVIN', 'ELG',
    'HJORT', 'SÆL', 'ISBJØRN', 'FLODHEST', 'NÆSEHORN', 'KÆNGURU', 'KOALA', 'PANDA',
    'SOMMERFUGL', 'MARIEHØNE', 'MYRE', 'EDDERKOP', 'DINOSAUR', 'FLAMINGO', 'STRUDS', 'GORILLA',
    'LEOPARD', 'ODDER', 'BÆVER', 'MULDVARP', 'FLAGERMUS', 'HVALROS', 'PÅFUGL', 'SKILDPADDE',
    'GULDFISK', 'SØHEST', 'VANDMAND', 'SØSTJERNE', 'KALV', 'FØL', 'LAM',
  ] },
  { id: 'mad', navn: 'Mad', emoji: '🍕', ord: [
    'OST', 'BRØD', 'KAGE', 'SUPPE', 'PIZZA', 'BURGER', 'PASTA', 'RIS', 'MÆLK', 'SAFT', 'JUICE',
    'ÆBLE', 'PÆRE', 'BANAN', 'CITRON', 'APPELSIN', 'JORDBÆR', 'HINDBÆR', 'BLÅBÆR', 'KIRSEBÆR',
    'VANDMELON', 'ANANAS', 'DRUE', 'GULEROD', 'AGURK', 'TOMAT', 'KARTOFFEL', 'LØG', 'MAJS',
    'ÆRTER', 'POMFRITTER', 'FRIKADELLE', 'PANDEKAGE', 'VAFFEL', 'SLIK', 'CHOKOLADE', 'POPCORN',
    'SMØR', 'HONNING', 'MARMELADE', 'PØLSE', 'SPAGHETTI', 'LAKRIDS', 'BOLLE', 'KRINGLE',
    'YOGHURT', 'HAVREGRYN', 'SANDWICH', 'RUGBRØD', 'LEVERPOSTEJ', 'NUDLER', 'SUSHI', 'TACO',
    'FLØDEBOLLE', 'SODAVAND', 'KAKAO',
  ] },
  { id: 'hjem', navn: 'Derhjemme', emoji: '🏠', ord: [
    'BORD', 'STOL', 'SENG', 'SOFA', 'LAMPE', 'DØR', 'VINDUE', 'TÆPPE', 'PUDE', 'DYNE', 'SKAB',
    'REOL', 'SPEJL', 'KOP', 'TALLERKEN', 'GAFFEL', 'KNIV', 'SKE', 'GRYDE', 'STEGEPANDE',
    'KØLESKAB', 'KOMFUR', 'OVN', 'VASK', 'BADEKAR', 'TOILET', 'HÅNDKLÆDE', 'SÆBE', 'TANDBØRSTE',
    'FJERNSYN', 'COMPUTER', 'TELEFON', 'NØGLE', 'BOG', 'BLYANT', 'SAKS', 'VISKELÆDER', 'LINEAL',
    'SKOLETASKE', 'PARAPLY', 'STØVSUGER', 'KOST', 'SPAND', 'VASKEMASKINE', 'TRAPPE', 'GARDIN',
    'KLAVER', 'GUITAR', 'TROMME', 'BAMSE', 'DUKKE', 'KLODSER', 'PUSLESPIL', 'BALLON', 'VÆKKEUR',
    'KURV', 'KRUS',
  ] },
  { id: 'natur', navn: 'Naturen', emoji: '🌳', ord: [
    'SOL', 'MÅNE', 'STJERNE', 'SKY', 'REGN', 'SNE', 'VIND', 'LYN', 'TORDEN', 'REGNBUE', 'HAV',
    'STRAND', 'SAND', 'STEN', 'BJERG', 'BAKKE', 'SKOV', 'TRÆ', 'BLAD', 'BLOMST', 'ROSE',
    'TULIPAN', 'MÆLKEBØTTE', 'GRÆS', 'MOS', 'SVAMP', 'KOGLE', 'FLOD', 'VULKAN', 'ØRKEN',
    'JUNGLE', 'ISBJERG', 'BØLGE', 'HIMMEL', 'PLANET', 'KOMET', 'VANDFALD', 'HULE', 'MARK', 'ENG',
    'SOLSIKKE', 'EGETRÆ', 'GRAN', 'KASTANJE', 'SNEFNUG', 'ISTAP', 'TÅGE', 'MUDDER', 'VANDPYT',
    'REGNORM', 'MUSLING',
  ] },
  { id: 'leg', navn: 'Sport og leg', emoji: '⚽', ord: [
    'BOLD', 'MÅL', 'FODBOLD', 'HÅNDBOLD', 'TENNIS', 'GOLF', 'SVØMNING', 'LØB', 'HOP', 'DANS',
    'GYNGE', 'RUTSJEBANE', 'SANDKASSE', 'TRAMPOLIN', 'SKATEBOARD', 'LØBEHJUL', 'RULLESKØJTER',
    'SKØJTER', 'SKI', 'KÆLK', 'DRAGE', 'SJIPPETOV', 'KLATRESTATIV', 'BADMINTON', 'BASKETBALL',
    'GYMNASTIK', 'KARATE', 'RIDNING', 'MEDALJE', 'POKAL', 'SEJR', 'HOLD', 'FLØJTE', 'TERNING',
    'SKAK', 'KORT', 'GEMMELEG', 'FANGELEG', 'VOLLEYBALL', 'HULAHOPRING', 'VANDPISTOL',
    'SNEBOLD', 'SNEMAND', 'HOPPEBORG', 'SÆBEBOBLER',
  ] },
  { id: 'trafik', navn: 'Ting der kører', emoji: '🚗', ord: [
    'BIL', 'BUS', 'TOG', 'FLY', 'BÅD', 'TAXA', 'TRAKTOR', 'LASTBIL', 'CYKEL', 'KNALLERT',
    'MOTORCYKEL', 'SKIB', 'FÆRGE', 'RAKET', 'HELIKOPTER', 'UBÅD', 'AMBULANCE', 'BRANDBIL',
    'POLITIBIL', 'SPORVOGN', 'METRO', 'KANO', 'KAJAK', 'SEJLBÅD', 'ROBÅD', 'LUFTBALLON',
    'GRAVKO', 'CAMPINGVOGN', 'SKRALDEBIL', 'TANDEM', 'TRÆKVOGN', 'BARNEVOGN',
    'ISBRYDER', 'GOKART',
  ] },
  { id: 'toej', navn: 'Tøj', emoji: '👕', ord: [
    'HUE', 'SOK', 'SKO', 'BLUSE', 'TRØJE', 'BUKSER', 'KJOLE', 'NEDERDEL', 'JAKKE', 'FRAKKE',
    'VANTER', 'HANDSKER', 'HALSTØRKLÆDE', 'STØVLER', 'GUMMISTØVLER', 'SANDALER', 'KASKET', 'HAT',
    'SHORTS', 'PYJAMAS', 'BADEDRAGT', 'BRILLER', 'SOLBRILLER', 'BÆLTE', 'SLIPS', 'REGNTØJ',
    'FLYVERDRAGT', 'HÆTTETRØJE', 'UNDERBUKSER', 'STRØMPEBUKSER', 'RING', 'ARMBÅND',
    'HALSKÆDE', 'HÅRSPÆNDE', 'SLÅBROK', 'TØFLER',
  ] },
  { id: 'krop', navn: 'Kroppen', emoji: '💪', ord: [
    'ARM', 'BEN', 'HÅND', 'FOD', 'NÆSE', 'MUND', 'ØRE', 'ØJE', 'HÅR', 'HOVED', 'MAVE', 'RYG',
    'KNÆ', 'ALBUE', 'SKULDER', 'HALS', 'TAND', 'TUNGE', 'LÆBE', 'FINGER', 'TOMMELFINGER',
    'NAVLE', 'HJERTE', 'SKÆG', 'KIND', 'PANDE', 'HAGE', 'ØJENBRYN', 'NEGL', 'HÆL', 'FREGNE',
    'SMIL', 'TÆER', 'NAKKE', 'HJERNE', 'SKELET', 'ØJENVIPPE',
  ] },
];

/** Alle ord med deres kategori. */
export const ALLE_ORD = KATEGORIER.flatMap(k => k.ord.map(ord => ({ ord, kategori: k.id })));

export const kategori = id => KATEGORIER.find(k => k.id === id) || null;

/** Et lille, forudsigeligt tilfældighedsværk (mulberry32), så ?seed= kan styre ordene. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Antal bogstaver i et ord (mellemrum tæller ikke). */
export const laengde = ord => [...ord].filter(b => b !== ' ').length;

/** Niveauet til en given stime. */
export function niveauFraStime(stime) {
  let n = NIVEAUER[0];
  for (const x of NIVEAUER) if (stime >= x.fraStime) n = x;
  return n;
}

/** De ord, der passer til et niveau. */
export const ordTilNiveau = n => ALLE_ORD.filter(o => laengde(o.ord) >= n.min && laengde(o.ord) <= n.maks);

/**
 * Trækker et ord til niveauet. `brugte` er ord, man har haft for nylig – de
 * springes over, så længe der er andre at tage af.
 */
export function vaelgOrd(rand, niveau, brugte = new Set()) {
  const alle = ordTilNiveau(niveau);
  const friske = alle.filter(o => !brugte.has(o.ord));
  const pulje = friske.length ? friske : alle;
  return pulje[Math.floor(rand() * pulje.length) % pulje.length];
}

/**
 * Renser et ord, en ven har skrevet: store bogstaver, kun A-Å og enkelte
 * mellemrum. Accenter skrælles af (é → E), resten smides væk. Giver null,
 * hvis der ikke er mindst to bogstaver tilbage.
 */
export function rensOrd(tekst) {
  const s = String(tekst ?? '')
    .toUpperCase()
    .replace(/[ÉÈÊË]/g, 'E').replace(/[ÁÀÂÄ]/g, 'A').replace(/[ÓÒÔÖ]/g, 'Ø').replace(/Ü/g, 'Y')
    .replace(/[ÍÌÎÏ]/g, 'I').replace(/[ÚÙÛ]/g, 'U')
    .replace(/[^A-ZÆØÅ ]/g, '')
    .replace(/ +/g, ' ').trim();
  const kun = [...s].filter(b => b !== ' ');
  if (kun.length < 2) return null;
  // Klip til VEN_MAKS bogstaver, uden at et mellemrum bliver hængende til sidst
  let n = 0, ud = '';
  for (const b of s) { if (b !== ' ') n++; if (n > VEN_MAKS) break; ud += b; }
  return ud.trim();
}

/** Et nyt ord at gætte. `liv` = forkerte gæt, man har (resten af galgen står der). */
export function nytSpil(ord, { liv = 10, kategori = null } = {}) {
  return { ord, kategori, liv, gaettet: [], forkerte: [], status: 'spil' };
}

/** Ordet med de bogstaver, man har fundet – null for dem, man mangler. */
export function maske(spil) {
  return [...spil.ord].map(b => (b === ' ' ? ' ' : spil.gaettet.includes(b) || spil.status === 'tabt' ? b : null));
}

export const forkerteTilbage = spil => spil.liv - spil.forkerte.length;

/** De dele af galgen og manden, der er tegnet lige nu. */
export function synligeDele(spil) {
  const forud = DELE.length - spil.liv;
  return DELE.slice(0, Math.min(DELE.length, forud + spil.forkerte.length));
}

/**
 * Gætter ét bogstav. Giver { gyldig, rigtig, antal } – `gyldig` er falsk, hvis
 * bogstavet er gættet før, ikke er et bogstav, eller spillet er slut; så sker
 * der ingenting, og det koster heller ikke et liv.
 */
export function gaet(spil, bogstav) {
  const b = String(bogstav ?? '').toUpperCase();
  if (spil.status !== 'spil' || b.length !== 1 || !BOGSTAVER.includes(b) ||
      spil.gaettet.includes(b) || spil.forkerte.includes(b)) {
    return { gyldig: false, rigtig: false, antal: 0 };
  }
  const antal = [...spil.ord].filter(x => x === b).length;
  if (antal) {
    spil.gaettet.push(b);
    if (maske(spil).every(x => x !== null)) spil.status = 'vundet';
  } else {
    spil.forkerte.push(b);
    if (forkerteTilbage(spil) <= 0) spil.status = 'tabt';
  }
  return { gyldig: true, rigtig: antal > 0, antal };
}

/* ---------- Botten ---------- */

/** Hvor tit bogstaverne står i danske børneord – den dumme bot gætter i den rækkefølge. */
export const HYPPIGE = 'ERNTASLIODGKMBUVHFPÆØÅJYCZWXQ';

/**
 * Den kloge bot kender kategorien og ordlisten: den kigger på de ord, der
 * stadig kan passe, og tager det bogstav, der står i flest af dem. Den dumme
 * gætter bare efter HYPPIGE – det gør den kloge også ved et ord fra en ven,
 * som ikke står på listen.
 */
export function botGaet(spil, { klog = true } = {}) {
  const brugt = new Set([...spil.gaettet, ...spil.forkerte]);
  if (klog) {
    const m = maske(spil);
    const kat = kategori(spil.kategori);
    const kandidater = (kat ? kat.ord : []).filter(o => {
      if (o.length !== m.length) return false;
      for (let i = 0; i < o.length; i++) {
        if (m[i] === null ? brugt.has(o[i]) : m[i] !== o[i]) return false;
      }
      return true;
    });
    if (kandidater.length) {
      const taelling = new Map();
      for (const o of kandidater) for (const b of new Set(o)) if (!brugt.has(b)) taelling.set(b, (taelling.get(b) || 0) + 1);
      let bedst = null, n = 0;
      for (const b of HYPPIGE) if ((taelling.get(b) || 0) > n) { bedst = b; n = taelling.get(b); }
      if (bedst) return bedst;
    }
  }
  return [...HYPPIGE].find(b => !brugt.has(b)) || null;
}

/**
 * Spiller et helt ord igennem med botten og giver spillet tilbage. `klog` er
 * hvor stor en del af gættene, der er kloge (0-1) – ⅓ er målestokken for et
 * barn, der kender ordene, men ikke tænker hvert gæt igennem. De kloge gæt
 * spredes jævnt ud, så resultatet ikke afhænger af tilfældigheder.
 */
export function botSpil(spil, { klog = 1 } = {}) {
  const k = klog === true ? 1 : klog === false ? 0 : klog;
  for (let i = 0; spil.status === 'spil'; i++) {
    const b = botGaet(spil, { klog: Math.floor((i + 1) * k) > Math.floor(i * k) });
    if (!b) break;
    gaet(spil, b);
  }
  return spil;
}
