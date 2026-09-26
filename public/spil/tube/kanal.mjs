/*
  ZydyTube – motoren bag spillet: kanalen, videoerne, visningerne,
  abonnenterne, udstyret og kommentarerne. Rører ikke DOM'en, så det hele
  kan enhedstestes (test/unit/tube.test.mjs).

  Tre greb bærer spillet:

  1. En video har et *potentiale* (visninger, abonnenter, likes), som regnes
     ud i det øjeblik, den uploades. Hvor meget af det, der er kommet ind,
     afhænger kun af videoens alder: det meste kommer det første minut
     (VISNING_TAU), og så en hale over det næste døgn. Alt det, man ser –
     abonnenter, visninger, penge – udledes af tiden, så intet skal "tælles
     op" i en løkke, og en telefon, der har ligget i tasken, regner rigtigt.
  2. Kvaliteten er to ting ganget sammen: hvor godt man optog (minispillet,
     0,2-1) og hvor godt udstyret er (1-2,9). Den første er ens egen, den
     anden køber man for pengene.
  3. Titlen kan lokke. En overdreven titel («KAGEN EKSPLODEREDE!!! 😱») giver
     flere klik, men skuffede seere abonnerer ikke – en ærlig titel giver
     færre klik, men flere, der bliver. Det er spillets eneste lille lektie.
*/

/* ================= Emnerne ================= */
export const EMNER = [
  { id: 'gaming', navn: 'Gaming', ikon: '🎮', farve: '#5b8cff',
    ting: ['🎮', '🕹️', '👾', '🏆', '💎'],
    titler: ['Jeg spiller et nyt spil', 'Kan jeg klare den sværeste bane?', 'JEG VANDT 1.000.000 DIAMANTER!!! 😱'],
    kommentarer: ['Hvilket spil er det?', 'Du er vildt god til det spil!', 'Spil det igen i morgen!'] },
  { id: 'kat', navn: 'Kattevideo', ikon: '🐱', farve: '#f0994a',
    ting: ['🐱', '🧶', '🐟', '🐾', '📦'],
    titler: ['Min kat leger med garn', 'Min kat gjorde noget helt vildt', 'MIN KAT KAN TALE!!! 😱'],
    kommentarer: ['Min kat gør også sådan!', 'Nuuuj hvor er den sød 😻', 'Hvad hedder din kat?'] },
  { id: 'bagning', navn: 'Bagning', ikon: '🧁', farve: '#ff8fb0',
    ting: ['🧁', '🍓', '🍫', '🥚', '🎂'],
    titler: ['Vi bager cupcakes', 'Jeg bagte den største kage nogensinde', 'KAGEN EKSPLODEREDE!!! 💥'],
    kommentarer: ['Jeg fik så meget lyst til kage 🤤', 'Kan du lave en med jordbær?', 'Jeg bagte den i går, den var lækker!'] },
  { id: 'dans', navn: 'Dans', ikon: '💃', farve: '#c77dff',
    ting: ['💃', '🎵', '⭐', '🕺', '🎶'],
    titler: ['Jeg lærer en ny dans', 'Dansen som alle snakker om', 'VERDENS SVÆRESTE DANS!!! 😱'],
    kommentarer: ['Jeg lærte dansen!! 💃', 'Du danser så godt', 'Lav en dans til min yndlingssang!'] },
  { id: 'slim', navn: 'Slim', ikon: '🟢', farve: '#5ee0a8',
    ting: ['🟢', '✨', '🧪', '💜', '💧'],
    titler: ['Sådan laver du slim', 'Jeg blandede alle farverne', '100 KILO SLIM I BADEKARRET!!! 😱'],
    kommentarer: ['Slim er det bedste i hele verden!!', 'Hvordan fik du den farve?', 'Min mor siger, jeg ikke må lave slim 😅'] },
  { id: 'tegning', navn: 'Tegning', ikon: '🎨', farve: '#ffd447',
    ting: ['🎨', '✏️', '🖍️', '🌈', '🖌️'],
    titler: ['Jeg tegner en enhjørning', 'Tegn med mig i ti minutter', 'JEG TEGNEDE MED LUKKEDE ØJNE!!! 😱'],
    kommentarer: ['Du tegner så flot 😍', 'Kan du tegne en drage næste gang?', 'Jeg tegnede med, se min!'] },
  { id: 'udfordring', navn: 'Udfordring', ikon: '🏆', farve: '#ff5c7a',
    ting: ['🏆', '⏱️', '🍋', '🎯', '💪'],
    titler: ['Citron-udfordringen', 'Hvem vinder: mig eller min lillebror?', '24 TIMER I EN PAPKASSE!!! 😱'],
    kommentarer: ['Jeg prøvede også, det var svært!', 'Lav en ny udfordring!', 'Haha din lillebror vandt næsten'] },
  { id: 'pakkeleg', navn: 'Pakkeleg', ikon: '🎁', farve: '#4fd1e8',
    ting: ['🎁', '📦', '🧸', '🎀', '🎈'],
    titler: ['Jeg pakker en overraskelse ud', 'Hvad er der i den mystiske kasse?', 'DET VAR IKKE DET, JEG TROEDE!!! 😱'],
    kommentarer: ['Hvad var der i?!', 'Jeg vil også have sådan en!', 'Pak en ud mere!'] },
];
export const emnet = id => EMNER.find(e => e.id === id) || EMNER[0];

/* De ting, man ikke skal trykke på, mens man optager. */
export const UHELD = ['🐝', '🔔', '🕷️'];

/* Figurer til kanalbilledet og farver til kanalen og miniaturerne. */
export const AVATARER = ['😎', '🦊', '🐱', '🐼', '🦄', '🤖', '🐸', '👑'];
export const FARVER = ['#ff5c7a', '#5b8cff', '#5ee0a8', '#ffd447', '#c77dff', '#f0994a'];

/* ================= Udstyret ================= */
export const UDSTYR = [
  { id: 'kamera', navn: 'Kamera', ikon: '📷',
    trin: ['Gammel mobil', 'Ny mobil', 'Webkamera', 'Videokamera', 'Filmkamera'],
    maerke: ['480p', '720p', '1080p', '4K', '8K'] },
  { id: 'mikrofon', navn: 'Mikrofon', ikon: '🎙️',
    trin: ['Mobilens mikrofon', 'Clips-mikrofon', 'Bordmikrofon', 'Studiemikrofon', 'Guldmikrofon'] },
  { id: 'lys', navn: 'Lys', ikon: '💡',
    trin: ['Loftlampen', 'Bordlampe', 'Ringlys', 'Softbokse', 'Filmlys'] },
  { id: 'computer', navn: 'Computer', ikon: '💻',
    trin: ['Gammel bærbar', 'Ny bærbar', 'Gamercomputer', 'Klippestation', 'Supercomputer'] },
];
/** Hvad næste trin koster, når man står på trin i (0-3). */
export const PRISER = [60, 400, 3000, 25000];
/** Hvor meget hvert trin lægger til kvaliteten. Fuldt udstyr = 1 + 16 × 0,12 = 2,92. */
export const UDSTYR_TRIN = 0.12;
export const MAKS_TRIN = 4;

/* ================= Visninger og abonnenter ================= */
export const BASIS = 200;          // visninger en video får, selv uden abonnenter
export const RAEKKEVIDDE = 6;      // visninger pr. abonnent^EKSPONENT
export const EKSPONENT = 0.75;     // under 1, så en stor kanal vokser langsommere og ikke løber løbsk
export const KONVERTERING = 0.06;  // andel af seerne, der abonnerer (ved perfekt optagelse)
export const KR_PR_VISNING = 0.05; // 20 visninger = 1 kr.
export const VISNING_TAU = 20;     // sekunder: efter et minut er 95 % af visningerne kommet
export const HALE = 0.5;           // så kommer der halvt så mange til over det næste døgn
export const HALE_SEK = 24 * 3600;
export const TREND = 1.6;          // det, seerne ønsker sig lige nu
export const KEDER = 0.7;          // samme emne tre gange i træk
export const PASSER = 1.2;         // klistermærket på miniaturen passer til videoen
/** Hvad titlen gør: klik, og hvor mange af de klikkende der abonnerer og liker. */
export const LOKKER = [
  { navn: 'ærlig', klik: 1.0, abo: 1.3, likes: 1.2 },
  { navn: 'spændende', klik: 1.2, abo: 1.0, likes: 1.0 },
  { navn: 'overdrevet', klik: 1.5, abo: 0.5, likes: 0.55 },
];

/* Afspilningsknapperne. De tre store er dem, man kender fra de rigtige kanaler. */
export const MAERKER = [
  { n: 100, navn: 'De første 100', ikon: '🎉' },
  { n: 1000, navn: '1.000 abonnenter', ikon: '🥳' },
  { n: 10000, navn: 'Bronzeknappen', ikon: '🥉', knap: 'bronze' },
  { n: 100000, navn: 'Sølvknappen', ikon: '🥈', knap: 'soelv' },
  { n: 1000000, navn: 'Guldknappen', ikon: '🥇', knap: 'guld' },
  { n: 10000000, navn: 'Diamantknappen', ikon: '💎', knap: 'diamant' },
  { n: 100000000, navn: 'Rubinknappen', ikon: '❤️', knap: 'rubin' },
];

/* ================= Optagelsen (minispillet) ================= */
export const OPTAG_SEK = 10;
export const GODE = 14;
export const DAARLIGE = 4;
export const LEVETID = 1.5;        // sekunder et sjovt øjeblik står fremme

/** Seedbar tilfældighed, så en video altid har de samme kommentarer. */
export function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/**
 * Planen for en optagelse: hvornår og hvor de sjove øjeblikke (og uheldene)
 * dukker op. x og y er 0-1 inde i billedet. Samme frø = samme plan.
 */
export function optagPlan(emneId, frø) {
  const r = mulberry32(frø);
  const e = emnet(emneId);
  const plan = [];
  const trin = (OPTAG_SEK - LEVETID - 0.6) / (GODE - 1);
  for (let i = 0; i < GODE; i++) {
    const t = Math.min(OPTAG_SEK - LEVETID - 0.05, 0.6 + i * trin + (r() - 0.5) * trin * 0.6);
    plan.push({ nr: plan.length, t,
      x: 0.12 + r() * 0.76, y: 0.16 + r() * 0.62, ikon: e.ting[Math.floor(r() * e.ting.length)], god: true });
  }
  for (let i = 0; i < DAARLIGE; i++) {
    plan.push({ nr: plan.length, t: 1.5 + r() * (OPTAG_SEK - LEVETID - 2),
      x: 0.12 + r() * 0.76, y: 0.16 + r() * 0.62, ikon: UHELD[Math.floor(r() * UHELD.length)], god: false });
  }
  return plan.sort((a, b) => a.t - b.t).map((p, i) => ({ ...p, nr: i }));
}

/** Hvilke øjeblikke står fremme på tidspunktet t? */
export const fremme = (plan, t, taget = new Set()) =>
  plan.filter(p => !taget.has(p.nr) && t >= p.t && t < p.t + LEVETID);

/** Optagelsens kvalitet (0,2-1) ud fra hvor mange sjove øjeblikke man fangede. */
export function optagKvalitet(fanget, uheld) {
  const q = 0.25 + 0.75 * (fanget / GODE) - 0.15 * uheld;
  return Math.round(Math.max(0.2, Math.min(1, q)) * 100) / 100;
}
/** 1-3 stjerner for optagelsen. */
export const stjerner = q => (q >= 0.9 ? 3 : q >= 0.6 ? 2 : 1);

/* ================= Kanalen ================= */
export function nyKanal(navn, avatar, farve, nu = Date.now(), frø = 1) {
  return {
    v: 1,
    navn: renNavn(navn) || 'Min kanal',
    avatar: AVATARER.includes(avatar) ? avatar : AVATARER[0],
    farve: FARVER.includes(farve) ? farve : FARVER[0],
    oprettet: nu,
    frø: frø >>> 0,
    udstyr: { kamera: 0, mikrofon: 0, lys: 0, computer: 0 },
    brugt: 0,             // kroner brugt på udstyr
    antal: 0,             // videoer i alt, også dem der er lagt i arkivet
    videoer: [],          // nyeste først
    arkiv: { visninger: 0, abo: 0, likes: 0 },
    maerker: [],          // de afspilningsknapper, man har fået (tal)
    trend: EMNER[(frø >>> 0) % EMNER.length].id,
    hjerter: [],          // kommentarer kanalen har givet et hjerte: "videoId:nr"
  };
}

export function renNavn(s) {
  return String(s ?? '').replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 18);
}
export function renTitel(s) {
  return String(s ?? '').replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);
}

/** Udstyrets samlede gange-faktor (1-2,92). */
export const udstyrFaktor = kanal =>
  1 + UDSTYR_TRIN * UDSTYR.reduce((s, u) => s + (kanal.udstyr[u.id] || 0), 0);

/** Pris for næste trin af en slags udstyr – null når det er på toppen. */
export function prisFor(kanal, id) {
  const trin = kanal.udstyr[id];
  return trin >= MAKS_TRIN ? null : PRISER[trin];
}

export function koebUdstyr(kanal, id, nu = Date.now()) {
  const pris = prisFor(kanal, id);
  if (pris == null || penge(kanal, nu) < pris) return false;
  kanal.udstyr[id]++;
  kanal.brugt += pris;
  return true;
}

/** Hvor stor en del af potentialet en video har fået ind i en given alder. */
export function andel(alderSek) {
  const a = Math.max(0, alderSek);
  return (1 - Math.exp(-a / VISNING_TAU)) + HALE * Math.min(1, a / HALE_SEK);
}
export const FULD = 1 + HALE;

const alder = (v, nu) => (nu - v.oprettet) / 1000;
export const visningerAf = (v, nu) => Math.floor(v.visninger * andel(alder(v, nu)));
export const likesAf = (v, nu) => Math.floor(v.likes * andel(alder(v, nu)));
export const aboAf = (v, nu) => v.abo * andel(alder(v, nu));

export function abonnenter(kanal, nu = Date.now()) {
  return Math.floor(kanal.arkiv.abo + kanal.videoer.reduce((s, v) => s + aboAf(v, nu), 0));
}
export function visningerIalt(kanal, nu = Date.now()) {
  return kanal.arkiv.visninger + kanal.videoer.reduce((s, v) => s + visningerAf(v, nu), 0);
}
export function penge(kanal, nu = Date.now()) {
  return Math.floor(visningerIalt(kanal, nu) * KR_PR_VISNING) - kanal.brugt;
}

/** Er samme emne blevet brugt i de to seneste videoer? Så keder seerne sig. */
export const keder = (kanal, emneId) =>
  kanal.videoer.length >= 2 && kanal.videoer[0].emne === emneId && kanal.videoer[1].emne === emneId;

/** Hvor meget en titel lokker (0-2). Forslagene har deres eget; det man selv skriver, gættes. */
export function lokkerFor(titel, emneId) {
  const e = emnet(emneId);
  const i = e.titler.indexOf(titel);
  if (i >= 0) return i;
  const t = String(titel);
  const bogstaver = t.replace(/[^a-zA-ZæøåÆØÅ]/g, '');
  const store = t.replace(/[^A-ZÆØÅ]/g, '').length;
  if (/!!|\?!|😱|💥/.test(t) || (bogstaver.length >= 6 && store / bogstaver.length > 0.6)) return 2;
  if (/[!?]/.test(t)) return 1;
  return 0;
}

/**
 * Hvad en video kan forvente sig, før tilfældet slår til. Bruges både ved
 * upload og på upload-skærmen ("ca. 800 visninger").
 */
export function forventning(kanal, { emne, kvalitet, titel, klistermaerke }, nu = Date.now()) {
  const S = abonnenter(kanal, nu);
  const lok = LOKKER[lokkerFor(titel, emne)];
  const passer = emnet(emne).ting.includes(klistermaerke) ? PASSER : 1;
  const trend = kanal.trend === emne ? TREND : 1;
  const ked = keder(kanal, emne) ? KEDER : 1;
  const samlet = kvalitet * udstyrFaktor(kanal);
  const visninger = (BASIS + RAEKKEVIDDE * Math.pow(S, EKSPONENT)) * samlet * lok.klik * passer * trend * ked;
  return {
    visninger,
    abo: visninger * KONVERTERING * kvalitet * lok.abo,
    likes: visninger * (0.03 + 0.09 * kvalitet) * lok.likes,
    lokker: lokkerFor(titel, emne), passer: passer > 1, trend: trend > 1, keder: ked < 1,
  };
}

/**
 * Lægger en ny video op. Returnerer videoen. Trenden skifter bagefter,
 * hvis man lige lavede den – seerne vil have noget nyt.
 */
export function upload(kanal, { emne, kvalitet, titel, farve, klistermaerke }, nu = Date.now()) {
  emne = emnet(emne).id;
  kvalitet = Math.max(0.2, Math.min(1, Number(kvalitet) || 0.2));
  titel = renTitel(titel) || emnet(emne).titler[0];
  const r = mulberry32((kanal.frø ^ Math.imul(kanal.antal + 1, 2654435761)) >>> 0);
  const f = forventning(kanal, { emne, kvalitet, titel, klistermaerke }, nu);
  const held = 0.85 + 0.3 * r();       // lidt tilfældighed, som på de rigtige kanaler
  const video = {
    id: kanal.antal + 1,
    emne, titel, kvalitet,
    farve: FARVER.includes(farve) ? farve : FARVER[0],
    klistermaerke: String(klistermaerke || emnet(emne).ikon).slice(0, 4),
    lokker: f.lokker,
    kamera: kanal.udstyr.kamera,   // så videoen bliver ved med at stå som «480p», selv om kameraet skiftes
    oprettet: nu,
    frø: Math.floor(r() * 2 ** 31),
    visninger: Math.round(f.visninger * held),
    abo: f.abo * held,
    likes: Math.round(f.likes * held),
    trend: f.trend,
  };
  kanal.videoer.unshift(video);
  kanal.antal++;
  if (f.trend || r() < 0.35) kanal.trend = nyTrend(kanal, r);
  arkiver(kanal, nu);
  return video;
}

function nyTrend(kanal, r) {
  const andre = EMNER.filter(e => e.id !== kanal.trend);
  return andre[Math.floor(r() * andre.length)].id;
}

/** Højst så mange videoer gemmes enkeltvis; de ældste lægges i arkivet. */
export const MAKS_VIDEOER = 40;
function arkiver(kanal, nu) {
  while (kanal.videoer.length > MAKS_VIDEOER) {
    const v = kanal.videoer.pop();
    // Arkivet får videoens fulde potentiale: dens hale kommer altså ind på én gang.
    kanal.arkiv.visninger += Math.floor(v.visninger * FULD);
    kanal.arkiv.abo += v.abo * FULD;
    kanal.arkiv.likes += Math.floor(v.likes * FULD);
  }
}

/** Nye afspilningsknapper siden sidst. Markerer dem som modtaget. */
export function nyeMaerker(kanal, nu = Date.now()) {
  const S = abonnenter(kanal, nu);
  const nye = MAERKER.filter(m => S >= m.n && !kanal.maerker.includes(m.n));
  for (const m of nye) kanal.maerker.push(m.n);
  return nye;
}
/** Næste mål at stræbe efter. */
export const naesteMaerke = S => MAERKER.find(m => m.n > S) || null;

/* ================= Kommentarer ================= */
const BRUGERE = ['Slimdronningen', 'GamerGeden', 'Kattefan2015', 'Pandapigen', 'Mathias_07', 'Enhjørning123',
  'FodboldFreja', 'Kagemonsteret', 'DanseDitte', 'KlodseKarl', 'Kiwi_9', 'Superhelten', 'BamseBent', 'Lillemus',
  'RaketRasmus', 'Stjernestøv'];
const GODE_ORD = ['Den bedste video nogensinde!!', 'Jeg har set den fem gange 😂', 'Mere af det her!',
  'Du er så sjov 😄', 'Wow, hvor er den flot filmet', 'Jeg abonnerede med det samme'];
const MIDDEL_ORD = ['Fin video 👍', 'Hej fra Aarhus!', 'Hvornår kommer den næste?', 'Hvem ser med i dag?', 'Godt lavet'];
const DAARLIGE_ORD = ['Lyden var lidt mærkelig', 'Den var lidt kedelig', 'Man kunne næsten ikke se noget', 'Den var for kort'];
const SNYD_ORD = ['Titlen passer jo slet ikke 😒', 'Det skete slet ikke!', 'Snyd! Jeg troede, der ville ske noget'];

/**
 * En videos kommentarer, udledt af dens frø – så de er de samme, hver gang man
 * kigger. `ved` er den andel af visningerne, hvor kommentaren dukker op.
 */
export function kommentarer(video, kanal) {
  const r = mulberry32(video.frø);
  const vaelg = liste => liste[Math.floor(r() * liste.length)];
  const e = emnet(video.emne);
  const ud = [];
  const antal = 3 + Math.round(video.kvalitet * 4);
  const brugt = new Set();
  const navn = () => {
    let n = vaelg(BRUGERE);
    for (let i = 0; i < 5 && brugt.has(n); i++) n = vaelg(BRUGERE);
    brugt.add(n); return n;
  };
  if (video.id === 1) ud.push({ navn: 'Farmor', tekst: 'Hvor er du dygtig, skat! ❤️ Kærlig hilsen farmor' });
  ud.push({ navn: navn(), tekst: 'Første! 🥇' });
  while (ud.length < antal) {
    const x = r();
    let tekst;
    if (video.lokker === 2 && x < 0.3) tekst = vaelg(SNYD_ORD);
    else if (x < 0.55) tekst = vaelg(e.kommentarer);
    else if (video.kvalitet >= 0.6) tekst = vaelg(x < 0.8 ? GODE_ORD : MIDDEL_ORD);
    else tekst = vaelg(x < 0.8 ? DAARLIGE_ORD : MIDDEL_ORD);
    if (ud.some(k => k.tekst === tekst)) continue;
    ud.push({ navn: navn(), tekst });
  }
  // Én seer ønsker sig altid det, der er populært lige nu – sådan finder man trenden.
  if (kanal && kanal.trend && kanal.trend !== video.emne && kanal.videoer[0] === video) {
    ud.push({ navn: navn(), tekst: `Lav en video om ${emnet(kanal.trend).navn.toLowerCase()}! 🔥` });
  }
  return ud.map((k, i) => ({ ...k, nr: i, ved: i === 0 ? 0.02 : Math.min(0.9, 0.05 + (i / ud.length) * 0.8) }));
}

/** De kommentarer, der er kommet frem nu. */
export function synligeKommentarer(video, kanal, nu = Date.now()) {
  const a = andel((nu - video.oprettet) / 1000);
  return kommentarer(video, kanal).filter(k => a >= k.ved);
}

export function givHjerte(kanal, videoId, nr) {
  const noegle = `${videoId}:${nr}`;
  const i = kanal.hjerter.indexOf(noegle);
  if (i >= 0) kanal.hjerter.splice(i, 1); else kanal.hjerter.push(noegle);
  if (kanal.hjerter.length > 400) kanal.hjerter.splice(0, kanal.hjerter.length - 400);
  return i < 0;
}

/* ================= Tal som tekst ================= */
/** 1.234 · 12.345 · 1,2 mio. · 12 mio. */
export function tal(n) {
  n = Math.floor(n);
  if (n < 1e6) return n.toLocaleString('da-DK');
  const m = n / 1e6;
  const tekst = m < 10 ? (Math.floor(m * 10) / 10).toString().replace('.', ',') : Math.floor(m).toLocaleString('da-DK');
  return `${tekst} mio.`;
}

/** Hvor gammel en video er, sagt som på de rigtige kanaler. */
export function siden(ms) {
  const s = Math.max(0, ms / 1000);
  if (s < 60) return 'lige nu';
  if (s < 3600) return `for ${Math.floor(s / 60)} min. siden`;
  if (s < 86400) { const t = Math.floor(s / 3600); return `for ${t} ${t === 1 ? 'time' : 'timer'} siden`; }
  const d = Math.floor(s / 86400); return `for ${d} ${d === 1 ? 'dag' : 'dage'} siden`;
}

/* ================= Gem og hent ================= */
export const serialiser = kanal => JSON.stringify(kanal);

/**
 * Læser en gemt kanal og retter det, der ikke længere passer: ukendte emner,
 * udstyr ud over toppen, tal der ikke er tal. Returnerer null, hvis der ikke
 * er noget at bygge på.
 */
export function laes(tekst) {
  let d;
  try { d = JSON.parse(tekst); } catch { return null; }
  if (!d || typeof d !== 'object' || d.v !== 1 || !Array.isArray(d.videoer)) return null;
  const k = nyKanal(d.navn, d.avatar, d.farve, Number.isFinite(d.oprettet) ? d.oprettet : Date.now(), Number(d.frø) || 1);
  for (const u of UDSTYR) k.udstyr[u.id] = Math.max(0, Math.min(MAKS_TRIN, Math.floor(Number(d.udstyr?.[u.id]) || 0)));
  const tal0 = x => (Number.isFinite(Number(x)) && Number(x) >= 0 ? Number(x) : 0);
  k.brugt = tal0(d.brugt);
  k.antal = Math.floor(tal0(d.antal));
  k.arkiv = { visninger: Math.floor(tal0(d.arkiv?.visninger)), abo: tal0(d.arkiv?.abo), likes: Math.floor(tal0(d.arkiv?.likes)) };
  k.videoer = d.videoer.filter(v => v && EMNER.some(e => e.id === v.emne) && Number.isFinite(v.oprettet))
    .slice(0, MAKS_VIDEOER).map(v => ({
      id: Math.floor(tal0(v.id)), emne: v.emne, titel: renTitel(v.titel) || emnet(v.emne).titler[0],
      kvalitet: Math.max(0.2, Math.min(1, tal0(v.kvalitet) || 0.2)),
      farve: FARVER.includes(v.farve) ? v.farve : FARVER[0],
      klistermaerke: String(v.klistermaerke || emnet(v.emne).ikon).slice(0, 4),
      lokker: [0, 1, 2].includes(v.lokker) ? v.lokker : 0,
      kamera: Math.max(0, Math.min(MAKS_TRIN, Math.floor(tal0(v.kamera)))),
      oprettet: v.oprettet, frø: Math.floor(tal0(v.frø)),
      visninger: Math.floor(tal0(v.visninger)), abo: tal0(v.abo), likes: Math.floor(tal0(v.likes)), trend: !!v.trend,
    }));
  k.antal = Math.max(k.antal, k.videoer.length);
  k.maerker = Array.isArray(d.maerker) ? d.maerker.filter(n => MAERKER.some(m => m.n === n)) : [];
  k.trend = EMNER.some(e => e.id === d.trend) ? d.trend : k.trend;
  k.hjerter = Array.isArray(d.hjerter) ? d.hjerter.filter(h => typeof h === 'string').slice(-400) : [];
  return k;
}

/** Hvad der er sket, mens man var væk – til velkomsten på startskærmen. */
export function mensDuVarVaek(kanal, fra, til) {
  if (fra == null || til - fra < 60_000) return null;
  const v = visningerIalt(kanal, til) - visningerIalt(kanal, fra);
  const a = abonnenter(kanal, til) - abonnenter(kanal, fra);
  if (v <= 0) return null;
  return { visninger: v, abo: a };
}
