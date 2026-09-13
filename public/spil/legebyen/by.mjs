/*
  Legebyen – motoren bag dukkehuset.

  Filen er ren JS uden DOM og uden canvas, så hele byen kan enhedstestes uden
  browser (test/unit/legebyen.test.mjs). index.html tegner rummene og tager
  imod fingrene.

  Tre ting er værd at vide, før man læser videre:

  1. **Der er ingen score og ingen måde at tabe på.** Det er et legetøj, ikke et
     spil: man flytter figurer rundt, giver dem mad og tøj på, og finder selv på
     historien. Alt hvad motoren gør, er derfor at sige ja til det, barnet
     prøver – og sørge for, at byen stadig giver mening bagefter.

  2. **Alt måles i «enheder» på et rum, der altid er BREDDE × HOEJDE.** Rummet
     lægges midt i skærmen med samme forhold på en iPhone på højkant og en iPad
     på tværs, præcis som i Miskmask. Så står sofaen det samme sted på begge.

  3. **Tingene er de samme overalt.** Et æble er et æble, uanset om det ligger i
     køkkenet eller i tasken – derfor er en løs ting kun {n, id, sted, x, y},
     og tasken bare en liste af id'er.
*/

/* ---------- Rummets mål ---------- */
export const BREDDE = 160;             // rummet er 160 × 100 enheder
export const HOEJDE = 100;
export const GULV = 82;                // y-linjen figurerne står på
export const LOFT = 26;                // så højt oppe må man sætte noget
export const KANT = 9;                 // figurer og ting holdes inden for kanten
export const SNAP = 11;                // så tæt på et sæde skal man slippe for at komme til at sidde

export const TASKE_MAKS = 6;           // der er plads til seks ting i tasken
export const TING_MAKS_PR_STED = 12;   // flere løse ting i ét rum rydder den ældste væk

/* ---------- Farver man kan klæde sig i ---------- */
export const HUD = ['#f6cfa8', '#e3ab79', '#b9784c', '#7d4d2c'];
export const HAAR_FARVER = ['#2f2118', '#8c5a2b', '#e7b04a', '#c14a2a', '#ede7da', '#7a5cf0'];
export const TOEJ_FARVER = ['#ff5c7a', '#5b8cff', '#5ee0a8', '#ffd447', '#b45fc4', '#ff9a3c', '#3ad0d6', '#f3f1ea'];
export const HAAR_STIL = ['kort', 'lang', 'krølle', 'tot'];

/** Hvad man kan skifte i «Klæd på»-arket: feltet og hvor mange valg der er. */
export const TOEJ_FELTER = [
  { felt: 'hud', navn: 'Hud', antal: HUD.length },
  { felt: 'haar', navn: 'Frisure', antal: HAAR_STIL.length },
  { felt: 'haarfarve', navn: 'Hårfarve', antal: HAAR_FARVER.length },
  { felt: 'troeje', navn: 'Trøje', antal: TOEJ_FARVER.length },
  { felt: 'buks', navn: 'Bukser', antal: TOEJ_FARVER.length },
];

/* ---------- Figurerne ---------- */
/*
  `mig` er barnets egen figur: den får navnet fra forsiden (zydy.navn), hvis vi
  kender det. De andre bor rundt omkring i byen fra begyndelsen, så der er nogen
  at finde, når man skifter rum – en tom by er ikke sjov at åbne.
*/
export const FIGURER = [
  { id: 'mig', navn: 'Mig', sted: 'stue', x: 62, hud: 0, haar: 'lang', haarfarve: 1, troeje: 0, buks: 1 },
  { id: 'noah', navn: 'Noah', sted: 'stue', x: 96, hud: 2, haar: 'kort', haarfarve: 0, troeje: 1, buks: 4 },
  { id: 'liv', navn: 'Liv', sted: 'koekken', x: 92, hud: 1, haar: 'krølle', haarfarve: 3, troeje: 2, buks: 1 },
  { id: 'zak', navn: 'Zak', sted: 'legeplads', x: 74, hud: 3, haar: 'tot', haarfarve: 0, troeje: 5, buks: 1 },
  { id: 'bedste', navn: 'Bedste', sted: 'butik', x: 74, hud: 0, haar: 'krølle', haarfarve: 4, troeje: 4, buks: 7 },
  { id: 'vaks', navn: 'Vaks', sted: 'legeplads', x: 116, dyr: true, hud: 1, haar: 'kort', haarfarve: 1, troeje: 3, buks: 3 },
];

/* ---------- Tingene ---------- */
/*
  `slags` afgør, hvad der sker, når tingen havner oven på en figur:
    mad      – bliver spist og forsvinder
    hat      – sætter sig på hovedet (den gamle hat falder på gulvet)
    briller  – sætter sig på næsen
    haand    – figuren holder den (det man havde i hånden, falder på gulvet)
*/
export const TING = [
  { id: 'aeble', navn: 'Æble', slags: 'mad', farve: '#ff5c5c' },
  { id: 'banan', navn: 'Banan', slags: 'mad', farve: '#ffd447' },
  { id: 'gulerod', navn: 'Gulerod', slags: 'mad', farve: '#ff9a3c' },
  { id: 'kage', navn: 'Lagkage', slags: 'mad', farve: '#ff9fbd' },
  { id: 'pizza', navn: 'Pizza', slags: 'mad', farve: '#e8b45c' },
  { id: 'is', navn: 'Is', slags: 'mad', farve: '#ffe3f0' },
  { id: 'kasket', navn: 'Kasket', slags: 'hat', farve: '#5b8cff' },
  { id: 'krone', navn: 'Guldkrone', slags: 'hat', farve: '#ffd447' },
  { id: 'sloejfe', navn: 'Sløjfe', slags: 'hat', farve: '#ff5c7a' },
  { id: 'solbriller', navn: 'Solbriller', slags: 'briller', farve: '#2f2b4a' },
  { id: 'bold', navn: 'Bold', slags: 'haand', farve: '#5ee0a8' },
  { id: 'bamse', navn: 'Bamse', slags: 'haand', farve: '#c98a5c' },
  { id: 'ballon', navn: 'Ballon', slags: 'haand', farve: '#ff5c7a' },
  { id: 'aelling', navn: 'Badeand', slags: 'haand', farve: '#ffd447' },
  { id: 'saebe', navn: 'Sæbe', slags: 'haand', farve: '#8fd9ff', virkning: 'boble' },
  { id: 'bog', navn: 'Bog', slags: 'haand', farve: '#b45fc4' },
  { id: 'tandboerste', navn: 'Tandbørste', slags: 'haand', farve: '#3ad0d6', virkning: 'boble' },
];

/* ---------- Stederne ---------- */
/*
  Hvert sted har:
    hylde   – det man altid kan tage frem her (bakken nederst i spillet)
    saeder  – steder en figur «sætter sig», hvis man slipper den tæt nok på
    moebler – det man kan trykke på. `virkning`:
              frem  = lægger en tilfældig ting fra `giver` frem foran møblet
              taend = tænder og slukker (køkkenlampen, fjernsynet, vandet)
              sjov  = siger bare noget (spejlet)
              gynge / rutsje = flytter den figur, der sidder i sædet
*/
export const STEDER = [
  {
    id: 'stue', navn: 'Stuen', emoji: '🛋️', ude: false,
    hylde: ['bamse', 'bold', 'bog', 'kage'],
    saeder: [
      { id: 'sofa-v', x: 42, y: 76 },
      { id: 'sofa-h', x: 62, y: 76 },
      { id: 'stol', x: 132, y: 77 },
    ],
    moebler: [
      { id: 'tv', navn: 'Fjernsynet', x: 108, y: 54, r: 15, virkning: 'taend', tekst: ['Fjernsynet kører!', 'Så slukkede fjernsynet.'] },
      { id: 'lampe', navn: 'Lampen', x: 16, y: 40, r: 11, virkning: 'taend', tekst: ['Lyset er tændt.', 'Godnat, lampe.'] },
    ],
  },
  {
    id: 'koekken', navn: 'Køkkenet', emoji: '🍎', ude: false,
    hylde: ['aeble', 'banan', 'gulerod', 'kage'],
    saeder: [
      { id: 'stol-v', x: 104, y: 77 },
      { id: 'stol-h', x: 134, y: 77 },
    ],
    moebler: [
      { id: 'koeleskab', navn: 'Køleskabet', x: 20, y: 54, r: 17, virkning: 'frem', giver: ['aeble', 'banan', 'gulerod', 'is', 'kage'], tekst: ['Der var noget i køleskabet!'] },
      { id: 'komfur', navn: 'Komfuret', x: 58, y: 64, r: 13, virkning: 'frem', giver: ['pizza'], tekst: ['Pizzaen er færdig!'] },
    ],
  },
  {
    id: 'bad', navn: 'Badeværelset', emoji: '🛁', ude: false,
    hylde: ['saebe', 'aelling', 'tandboerste'],
    saeder: [{ id: 'kar', x: 46, y: 74 }],
    moebler: [
      { id: 'bruser', navn: 'Bruseren', x: 46, y: 42, r: 13, virkning: 'taend', tekst: ['Pladask! Vandet løber.', 'Vandet er lukket.'] },
      { id: 'spejl', navn: 'Spejlet', x: 122, y: 46, r: 13, virkning: 'sjov', tekst: ['Hvor ser du godt ud i dag!'] },
    ],
  },
  {
    id: 'butik', navn: 'Butikken', emoji: '🛒', ude: false,
    hylde: ['kasket', 'krone', 'solbriller', 'sloejfe'],
    saeder: [{ id: 'baenk', x: 20, y: 77 }],
    moebler: [
      { id: 'toejhylde', navn: 'Tøjhylden', x: 48, y: 48, r: 18, virkning: 'frem', giver: ['kasket', 'krone', 'sloejfe', 'solbriller'], tekst: ['Se, hvad der hang på hylden!'] },
      { id: 'kasse', navn: 'Kassen', x: 124, y: 62, r: 13, virkning: 'frem', giver: ['is', 'ballon', 'bold', 'bog'], tekst: ['Kiiing! Værsgo.'] },
    ],
  },
  {
    id: 'legeplads', navn: 'Legepladsen', emoji: '🌳', ude: true,
    hylde: ['bold', 'ballon', 'is'],
    saeder: [
      { id: 'gynge', x: 32, y: 64 },
      { id: 'rutsje', x: 104, y: 48 },
      { id: 'baenk', x: 70, y: 78 },
    ],
    moebler: [
      { id: 'gyngen', navn: 'Gyngen', x: 32, y: 64, r: 13, virkning: 'gynge', saede: 'gynge', tekst: ['Højere! Højere!', 'Sæt en med op i gyngen først.'] },
      { id: 'rutsjebanen', navn: 'Rutsjebanen', x: 104, y: 48, r: 13, virkning: 'rutsje', saede: 'rutsje', tekst: ['Wheeee!', 'Sæt en op øverst på rutsjebanen.'] },
    ],
  },
];

/* ---------- Opslag ---------- */
export const stedet = id => STEDER.find(s => s.id === id) || null;
export const tingen = id => TING.find(t => t.id === id) || null;
export const skabelonen = id => FIGURER.find(f => f.id === id) || null;
export const moeblet = (stedId, moebelId) => (stedet(stedId)?.moebler || []).find(m => m.id === moebelId) || null;

export const figurerI = (by, sted) => Object.values(by.figurer).filter(f => f.sted === sted);
export const tingI = (by, sted) => by.ting.filter(t => t.sted === sted);

const klem = (v, min, maks) => Math.max(min, Math.min(maks, v));
const tal = (v, fald, min, maks) => (typeof v === 'number' && Number.isFinite(v) ? klem(v, min, maks) : fald);
const rentNavn = n => (typeof n === 'string' ? n.replace(/\s+/g, ' ').trim().slice(0, 12) : '');

/* ---------- En ny by ---------- */

/** En helt ny by. `mitNavn` er navnet fra forsiden, som «Mig»-figuren får. */
export function nyBy(mitNavn = '') {
  const by = { v: 1, sted: 'stue', figurer: {}, ting: [], taske: [], taendt: {}, naeste: 1 };
  for (const f of FIGURER) {
    by.figurer[f.id] = {
      id: f.id,
      navn: (f.id === 'mig' && rentNavn(mitNavn)) || f.navn,
      dyr: !!f.dyr,
      hud: f.hud, haar: f.haar, haarfarve: f.haarfarve, troeje: f.troeje, buks: f.buks,
      sted: f.sted, x: f.x, y: GULV, saede: null,
      hat: null, briller: null, haand: null,
      humoer: 'glad',
    };
  }
  // Lidt der ligger fremme fra begyndelsen, så der er noget at tage fat i med det samme.
  frem(by, 'bold', 'stue', 80);
  frem(by, 'aeble', 'koekken', 68);
  frem(by, 'aelling', 'bad', 84);
  frem(by, 'ballon', 'legeplads', 138);
  return by;
}

/* ---------- Løse ting i rummene ---------- */

/**
 * Lægger en ny ting i et rum og giver den tilbage. Ligger der allerede
 * TING_MAKS_PR_STED, forsvinder den ældste – ellers kan man fylde et rum, til
 * det ikke kan ses, hvad der er hvad.
 */
export function frem(by, tingId, sted, x, y = GULV) {
  if (!tingen(tingId) || !stedet(sted)) return null;
  const t = { n: by.naeste++, id: tingId, sted, x: klem(x, KANT, BREDDE - KANT), y: klem(y, LOFT, GULV) };
  by.ting.push(t);
  const her = tingI(by, sted);
  if (her.length > TING_MAKS_PR_STED) {
    const ældst = her[0];
    by.ting = by.ting.filter(a => a !== ældst);
  }
  return t;
}

/** Flytter en løs ting hen, hvor fingeren slap den. */
export function flytTing(by, n, x, y) {
  const t = by.ting.find(a => a.n === n);
  if (!t) return null;
  t.x = klem(x, KANT, BREDDE - KANT);
  t.y = klem(y, LOFT, GULV);
  return t;
}

export const fjernTing = (by, n) => {
  const foer = by.ting.length;
  by.ting = by.ting.filter(a => a.n !== n);
  return by.ting.length < foer;
};

/** Rydder op i et rum. Giver antallet af ting, der blev båret ud. */
export function ryd(by, sted) {
  const antal = tingI(by, sted).length;
  by.ting = by.ting.filter(t => t.sted !== sted);
  return antal;
}

/* ---------- Tasken ---------- */

/** Lægger en løs ting i tasken. Er der ikke plads, sker der ingenting. */
export function iTasken(by, n) {
  const t = by.ting.find(a => a.n === n);
  if (!t) return { ok: false, besked: '' };
  if (by.taske.length >= TASKE_MAKS) return { ok: false, besked: 'Tasken er helt fuld.' };
  by.taske.push(t.id);
  fjernTing(by, n);
  return { ok: true, besked: `${tingen(t.id).navn} kom i tasken.` };
}

/** Tager en ting op af tasken og lægger den i rummet. */
export function afTasken(by, tingId, sted, x, y = GULV) {
  const i = by.taske.indexOf(tingId);
  if (i < 0) return null;
  by.taske.splice(i, 1);
  return frem(by, tingId, sted, x, y);
}

/* ---------- Figurerne ---------- */

/** Er sædet optaget af en anden end `undtagen`? */
const optaget = (by, sted, saedeId, undtagen) =>
  figurerI(by, sted).some(f => f.saede === saedeId && f.id !== undtagen);

/** Det ledige sæde tættest på (x, y) – eller null, hvis man slap midt på gulvet. */
export function naermesteSaede(by, sted, x, y, undtagen = null) {
  let bedst = null, afstand = SNAP;
  for (const s of stedet(sted)?.saeder || []) {
    if (optaget(by, sted, s.id, undtagen)) continue;
    const d = Math.hypot(s.x - x, s.y - y);
    if (d <= afstand) { bedst = s; afstand = d; }
  }
  return bedst;
}

/**
 * Flytter en figur hen, hvor fingeren slap den. Slipper man tæt på et ledigt
 * sæde, sætter figuren sig; ellers lander den på gulvet – en figur, der bliver
 * hængende i luften, ser ud som en fejl.
 */
export function flytFigur(by, figurId, x, y, sted = null) {
  const f = by.figurer[figurId];
  if (!f) return null;
  if (sted && stedet(sted) && sted !== f.sted) { f.sted = sted; f.saede = null; }
  const px = klem(x, KANT, BREDDE - KANT);
  const py = klem(y, LOFT, GULV);
  const s = naermesteSaede(by, f.sted, px, py, f.id);
  if (s) { f.x = s.x; f.y = s.y; f.saede = s.id; } else { f.x = px; f.y = GULV; f.saede = null; }
  return f;
}

/** Henter en figur ind i det rum, man står i (fra «Venner»-bakken). */
export function hentHertil(by, figurId, sted = by.sted, x = BREDDE / 2) {
  if (!by.figurer[figurId] || !stedet(sted)) return null;
  return flytFigur(by, figurId, x, GULV, sted);
}

/** Skifter en del af tøjet. `vaerdi` er nummeret i farve-/frisurelisten. */
export function saetToej(by, figurId, felt, vaerdi) {
  const f = by.figurer[figurId];
  const regel = TOEJ_FELTER.find(t => t.felt === felt);
  if (!f || !regel) return false;
  if (!Number.isInteger(vaerdi) || vaerdi < 0 || vaerdi >= regel.antal) return false;
  f[felt] = felt === 'haar' ? HAAR_STIL[vaerdi] : vaerdi;
  return true;
}

const SIGER = ['Hej!', 'Hvor er her fint.', 'Skal vi lege?', 'Hihi!', 'Jeg er sulten.', 'Kom, vi går ud!'];
const DYRET_SIGER = ['Vuf!', 'Vuf vuf!', 'Snus, snus …'];

/** Et puf til en figur: den hopper og siger noget. Rent pjat, og det er meningen. */
export function puf(by, figurId, rnd = Math.random) {
  const f = by.figurer[figurId];
  if (!f) return '';
  const liste = f.dyr ? DYRET_SIGER : SIGER;
  f.humoer = 'glad';
  return liste[Math.floor(rnd() * liste.length) % liste.length];
}

/* ---------- Når en ting møder en figur ---------- */

/** Tager en ting af figuren igen og lægger den på gulvet ved siden af. */
export function tagAf(by, figurId, plads) {
  const f = by.figurer[figurId];
  if (!f || !['hat', 'briller', 'haand'].includes(plads) || !f[plads]) return null;
  const t = frem(by, f[plads], f.sted, f.x + 9, GULV);
  f[plads] = null;
  return t;
}

/**
 * Giver en figur en ting. Maden bliver spist, tøjet taget på, og resten holder
 * figuren i hånden. Det, der sad der i forvejen, falder på gulvet – så er der
 * aldrig noget, der bare forsvinder.
 *
 * Giver { ok, virkning, besked }. Kalderen fjerner selv tingen der, hvor den
 * kom fra (hylden har uendeligt mange, tasken og gulvet har én).
 */
export function brugPaa(by, tingId, figurId) {
  const f = by.figurer[figurId];
  const t = tingen(tingId);
  if (!f || !t) return { ok: false, virkning: null, besked: '' };
  f.humoer = 'glad';
  if (t.slags === 'mad') {
    return { ok: true, virkning: 'spis', besked: `${f.navn} spiser ${t.navn.toLowerCase()}. Mums!` };
  }
  const plads = t.slags === 'briller' ? 'briller' : t.slags === 'hat' ? 'hat' : 'haand';
  if (f[plads] === tingId) {                 // den samme ting igen tager den af
    tagAf(by, figurId, plads);
    return { ok: true, virkning: 'af', besked: `${f.navn} lagde ${t.navn.toLowerCase()} fra sig.` };
  }
  if (f[plads]) tagAf(by, figurId, plads);   // det gamle falder på gulvet
  f[plads] = tingId;
  const besked = plads === 'haand'
    ? (t.virkning === 'boble' ? `${f.navn} bliver helt ren!` : `${f.navn} har fået ${t.navn.toLowerCase()}.`)
    : `${f.navn} tog ${t.navn.toLowerCase()} på.`;
  return { ok: true, virkning: t.virkning === 'boble' ? 'boble' : plads, besked };
}

/* ---------- Møblerne ---------- */

/**
 * Et tryk på et møbel. Giver { ok, besked, ny, taendt, figur } – `ny` er en
 * ting, der kom frem, og `figur` den, der gyngede eller rutsjede.
 */
export function brugMoebel(by, moebelId, rnd = Math.random) {
  const m = moeblet(by.sted, moebelId);
  if (!m) return { ok: false, besked: '' };
  if (m.virkning === 'taend') {
    by.taendt[moebelId] = !by.taendt[moebelId];
    return { ok: true, besked: by.taendt[moebelId] ? m.tekst[0] : m.tekst[1], taendt: by.taendt[moebelId] };
  }
  if (m.virkning === 'frem') {
    const id = m.giver[Math.floor(rnd() * m.giver.length) % m.giver.length];
    const ny = frem(by, id, by.sted, m.x, GULV);
    return { ok: true, besked: m.tekst[0], ny };
  }
  if (m.virkning === 'gynge' || m.virkning === 'rutsje') {
    const f = figurerI(by, by.sted).find(a => a.saede === m.saede);
    if (!f) return { ok: false, besked: m.tekst[1] };
    if (m.virkning === 'rutsje') {            // ned ad rutsjebanen og ud på gulvet
      f.saede = null; f.x = klem(m.x + 34, KANT, BREDDE - KANT); f.y = GULV;
    }
    f.humoer = 'glad';
    return { ok: true, besked: m.tekst[0], figur: f };
  }
  return { ok: true, besked: m.tekst[0] };    // sjov: spejlet siger bare noget
}

/* ---------- Gem og hent ---------- */

/** Byen som almindeligt objekt, klar til JSON.stringify. */
export function serialiser(by) {
  const figurer = {};
  for (const f of Object.values(by.figurer)) {
    figurer[f.id] = {
      navn: f.navn, hud: f.hud, haar: f.haar, haarfarve: f.haarfarve, troeje: f.troeje, buks: f.buks,
      sted: f.sted, x: Math.round(f.x * 10) / 10, y: Math.round(f.y * 10) / 10, saede: f.saede,
      hat: f.hat, briller: f.briller, haand: f.haand,
    };
  }
  return {
    v: 1,
    sted: by.sted,
    figurer,
    ting: by.ting.map(t => ({ id: t.id, sted: t.sted, x: Math.round(t.x * 10) / 10, y: Math.round(t.y * 10) / 10 })),
    taske: by.taske.slice(),
    taendt: { ...by.taendt },
  };
}

/**
 * Læser en gemt by. Alt bliver prøvet af mod det, spillet kender i dag: en ting
 * eller en frisure, vi har fjernet siden, falder bare ud, og resten står, som
 * barnet efterlod det. En gemt by må aldrig kunne vælte spillet.
 */
export function laes(data, mitNavn = '') {
  if (!data || typeof data !== 'object' || !data.figurer) return null;
  const by = nyBy(mitNavn);
  by.ting = [];
  by.naeste = 1;
  by.sted = stedet(data.sted) ? data.sted : 'stue';

  for (const f of Object.values(by.figurer)) {
    const g = data.figurer[f.id];
    if (!g || typeof g !== 'object') continue;
    const navn = rentNavn(g.navn);
    if (navn) f.navn = navn;
    f.hud = tal(g.hud, f.hud, 0, HUD.length - 1) | 0;
    f.haarfarve = tal(g.haarfarve, f.haarfarve, 0, HAAR_FARVER.length - 1) | 0;
    f.troeje = tal(g.troeje, f.troeje, 0, TOEJ_FARVER.length - 1) | 0;
    f.buks = tal(g.buks, f.buks, 0, TOEJ_FARVER.length - 1) | 0;
    if (HAAR_STIL.includes(g.haar)) f.haar = g.haar;
    if (stedet(g.sted)) f.sted = g.sted;
    f.x = tal(g.x, f.x, KANT, BREDDE - KANT);
    f.y = tal(g.y, GULV, LOFT, GULV);
    const s = (stedet(f.sted)?.saeder || []).find(a => a.id === g.saede);
    if (s && !optaget(by, f.sted, s.id, f.id)) { f.saede = s.id; f.x = s.x; f.y = s.y; }
    else { f.saede = null; f.y = GULV; }
    for (const plads of ['hat', 'briller', 'haand']) {
      const t = tingen(g[plads]);
      const passer = t && (plads === 'haand' ? t.slags === 'haand' : t.slags === plads);
      f[plads] = passer ? t.id : null;
    }
  }

  if (Array.isArray(data.ting)) {
    for (const t of data.ting.slice(0, STEDER.length * TING_MAKS_PR_STED)) {
      if (t && tingen(t.id) && stedet(t.sted)) frem(by, t.id, t.sted, tal(t.x, BREDDE / 2, KANT, BREDDE - KANT), tal(t.y, GULV, LOFT, GULV));
    }
  }
  by.taske = Array.isArray(data.taske) ? data.taske.filter(id => !!tingen(id)).slice(0, TASKE_MAKS) : [];
  by.taendt = {};
  if (data.taendt && typeof data.taendt === 'object') {
    for (const s of STEDER) for (const m of s.moebler) if (data.taendt[m.id]) by.taendt[m.id] = true;
  }
  return by;
}
