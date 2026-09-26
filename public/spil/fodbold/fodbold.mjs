// Fodbold – banen, bolden, spillerne og robotterne. Ren JS uden DOM, så
// index.html kun skal tegne og tage imod fingrene, og det hele kan
// enhedstestes med `node --test test/unit/fodbold.test.mjs`.
//
// Alias ønske (#66): «Lav et fodbold spil hvor man kan spille kamp og træne
// fodbold, man kan spille med både venner og mod robotter. Man kan blive bedre
// og tjene penge. Fx hvis man vinder mange kampe kommer man mod nogen svære.»
//
// Banen ses oppefra og står på højkant: 60 × 100 enheder, mål i begge ender og
// bander hele vejen rundt (som indendørs fodbold – bolden går aldrig ud). Hold 0
// spiller nedefra og op mod målet ved y = 0, hold 1 oppefra og ned. Hvert hold
// har en målmand og tre markspillere.
//
// Et menneske styrer altid den markspiller på sit hold, der er tættest på
// bolden (eller har den); de andre løber selv. Robotter og menneske-hold går
// gennem de samme funktioner – spark(), tackling og opsamling – så robotterne
// kan ikke snyde, og to robothold kan spille mod hinanden. Det er sådan,
// sværhedsgraderne i ligaen er målt (se enhedstesten).

/* ---------- Tal man kan skrue på ---------- */
export const B = 60;                // banens bredde
export const L = 100;               // banens længde
export const MAAL_B = 16;           // målets bredde
export const R = 1.7;               // en spillers radius
export const RB = 0.8;              // boldens radius
export const DT = 1 / 60;           // fast skridt – så kampen forløber ens, uanset billedhastighed
export const FART = 13;             // en spillers grundfart (enheder pr. sek.)
export const KAMP_SEK = 120;        // en kamp varer 2 minutter (uret viser 90 minutter)
export const FORLAENGET_SEK = 45;   // står det lige, spilles der forlænget: næste mål vinder
export const TRAENING_SEK = 40;     // en træning
export const KLAR_SEK = 1.1;        // før bolden er i spil
export const MAAL_PAUSE = 1.7;      // «MÅL!» står så længe, før der er afspark igen
export const EVNE_MAKS = 10;        // højeste niveau man kan træne sig op til

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
const afst = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function gauss(rnd) { return (rnd() + rnd() + rnd() - 1.5) * 2; }   // nogenlunde normalfordelt, ±3

/* ---------- Hvad evnerne betyder ---------- */
// Evnerne går fra 1 (nybegynder) til 10 (trænet helt op) – plus det, støvlerne giver.
// Robotholdene bruger de samme formler med deres egne tal.
export const fartFaktor = n => 1 + 0.035 * (n - 1);
export const skudFart = n => 27 + 1.3 * n;
export const skudSpred = n => Math.max(1.2, 5.2 - 0.35 * n);
export const afleverStoej = n => Math.max(0.02, 0.11 - 0.009 * n);

/* ---------- Retninger ---------- */
/** Den vej hold h angriber i y (−1 = op mod y = 0). */
export const frem = h => (h === 0 ? -1 : 1);
/** y for det mål, hold h skal score i. */
export const maalY = h => (h === 0 ? 0 : L);
/** Fra holdets egne koordinater (fx 0-1 hen over banen, fy 0 = eget mål, 1 = modstanderens) til banen. */
export function tilBane(h, fx, fy) {
  return h === 0 ? { x: fx * B, y: L - fy * L } : { x: B - fx * B, y: fy * L };
}
function fyFor(h, y) { return h === 0 ? (L - y) / L : y / L; }

/* ---------- Robotterne og ligaen ---------- */
// Hvor klog en robot er: tænk = hvor tit den tager en beslutning (sek.),
// tackle = chancen for at vinde bolden i et forsøg, keeper = målmandens chance
// for at redde, pres = hvor mange der løber efter bolden, sjusk = hvor tit en
// beslutning er dum, skudAfstand = hvor langt ude den tør skyde, klog = hvor tit
// den afleverer, når den er presset.
function robotAi(t) {
  return {
    tænk: 0.75 - 0.5 * t,
    tackle: 0.16 + 0.32 * t,
    keeper: 0.22 + 0.45 * t,
    pres: t >= 0.55 ? 2 : 1,
    sjusk: 0.4 - 0.36 * t,
    skudAfstand: 22 + 10 * t,
    klog: 0.2 + 0.6 * t,
  };
}
/** Menneskeholdets egne robotter: målmanden og de to, man ikke styrer lige nu. */
export const MENNESKE_AI = { tænk: 0.3, tackle: 0.42, keeper: 0.5, pres: 0, sjusk: 0.04, skudAfstand: 28, klog: 0.6 };
/**
 * En robot, der spiller menneskets plads: omtrent som et barn, der har fået
 * styr på knapperne. Det er målestokken i enhedstesten (kan man slå de første
 * hold uden at have trænet? og de sidste, når man har?), og testene i browseren
 * bruger den til at spille en hel kamp igennem (GAME.bot()).
 */
export const AUTOPILOT = { tænk: 0.35, tackle: 0.42, keeper: 0.5, pres: 1, sjusk: 0.08, skudAfstand: 28, klog: 0.55 };

/** De ti hold i ligaen, fra de letteste til de sværeste. */
export const LIGA = [
  { navn: 'Mormors Mopser', kort: 'Mopserne', farve: '#c9a57a', farve2: '#6b4a2e' },
  { navn: 'Sandkasse United', kort: 'Sandkassen', farve: '#f3d36b', farve2: '#8a6d12' },
  { navn: 'Skolegårdens Stjerner', kort: 'Stjernerne', farve: '#8fd3ff', farve2: '#1f5d86' },
  { navn: 'FC Regnvejr', kort: 'Regnvejr', farve: '#7f8ea8', farve2: '#2d3748' },
  { navn: 'Nabovejens Ninjaer', kort: 'Ninjaerne', farve: '#3a3f4b', farve2: '#e8e8e8' },
  { navn: 'AC Pølsevogn', kort: 'Pølsevognen', farve: '#e8713c', farve2: '#fff1c2' },
  { navn: 'Lynet IF', kort: 'Lynet', farve: '#ffe14d', farve2: '#1a1a1a' },
  { navn: 'Sportsklubben Tordenskjold', kort: 'Tordenskjold', farve: '#2f6fdf', farve2: '#ffffff' },
  { navn: 'Real Zydy', kort: 'Real Zydy', farve: '#f4f4f4', farve2: '#b8912f' },
  { navn: 'Verdensholdet', kort: 'Verdensholdet', farve: '#1e1e28', farve2: '#ffd447' },
];

/** Robotholdet på trin 0-9 i ligaen. */
export function robotHold(trin) {
  trin = klem(Math.floor(trin), 0, LIGA.length - 1);
  // Det sidste skridt op til Verdensholdet er målt til at være for stort, hvis
  // skalaen er lige – derfor er Verdensholdet «8,4» og ikke «9».
  const e = trin === LIGA.length - 1 ? trin - 0.6 : trin, t = e / (LIGA.length - 1);
  return {
    ...LIGA[trin], trin, robot: true,
    evner: { fart: -4.5 + 1.05 * e, skud: -1 + 1.1 * e, aflevering: -1 + 1.1 * e },
    ai: robotAi(t),
  };
}

/* ---------- Opstillingen ---------- */
// fx hen over banen, fy fra eget mål (0) til modstanderens (1).
const OPSTILLING = [
  { rolle: 'keeper', fx: 0.5, fy: 0.035 },
  { rolle: 'forsvar', fx: 0.5, fy: 0.24 },
  { rolle: 'venstre', fx: 0.27, fy: 0.5 },
  { rolle: 'hoejre', fx: 0.73, fy: 0.52 },
];

function nySpiller(h, i, rolle, x, y, hjem) {
  return { h, i, rolle, x, y, vx: 0, vy: 0, fx: 0, fy: frem(h), hjem, tackleUr: 0, tænkUr: 0, beskyttet: 0, sigte: null, holdUr: 0 };
}

/* ---------- En ny kamp ---------- */
/**
 * hold: to hold, hvert { navn, farve, menneske?: true, evner: {fart, skud, aflevering}, ai? }.
 * Et menneskehold uden ai får MENNESKE_AI til de spillere, man ikke selv styrer.
 */
export function nyKamp({ hold, seed = 1, længde = KAMP_SEK, forlænget = true } = {}) {
  const kamp = {
    type: 'kamp',
    rnd: mulberry32(seed >>> 0),
    hold: hold.map((o, h) => ({
      navn: o.navn, kort: o.kort || o.navn, farve: o.farve, farve2: o.farve2 || '#ffffff',
      menneske: !!o.menneske, trin: o.trin,
      evner: { fart: 1, skud: 1, aflevering: 1, ...(o.evner || {}) },
      ai: o.ai || (o.menneske ? MENNESKE_AI : robotAi(0.3)),
      mål: 0,
      spillere: OPSTILLING.map((s, i) => { const p = tilBane(h, s.fx, s.fy); return nySpiller(h, i, s.rolle, p.x, p.y, { fx: s.fx, fy: s.fy }); }),
    })),
    bold: nyBold(),
    fase: 'klar', ur: 0, tid: 0, længde, kanForlænge: forlænget, forlænget: false,
    styrer: [null, null], skiftUr: [0, 0],
    input: [{ x: 0, y: 0 }, { x: 0, y: 0 }],
    vinder: null, hændelser: [], rest: 0, skudNr: 0,
  };
  kamp.hold.forEach((o, h) => { if (o.menneske) kamp.styrer[h] = 2; });
  afspark(kamp, kamp.rnd() < 0.5 ? 0 : 1);
  return kamp;
}

function nyBold() {
  return { x: B / 2, y: L / 2, vx: 0, vy: 0, hos: null, laast: 0, laastAf: null, modtager: null, skud: null, sidst: null, drej: 0 };
}

/** Alle stiller op på egen halvdel, og hold h har bolden på midten. */
export function afspark(kamp, h) {
  for (const hold of kamp.hold) {
    for (const p of hold.spillere) {
      const fy = Math.min(p.hjem.fy, 0.42);
      const q = tilBane(p.h, p.hjem.fx, fy);
      p.x = q.x; p.y = q.y; p.vx = p.vy = 0; p.fx = 0; p.fy = frem(p.h);
      p.tackleUr = 0; p.beskyttet = 0; p.holdUr = 0; p.sigte = null;
    }
  }
  const b = kamp.bold;
  Object.assign(b, nyBold());
  const angriber = kamp.hold[h].spillere.find(p => p.rolle === 'venstre') || kamp.hold[h].spillere[0];
  angriber.x = B / 2 - 1; angriber.y = L / 2 - frem(h) * (R + RB + 0.2);
  giv(kamp, angriber);
  angriber.beskyttet = 1.2;
  if (kamp.hold[h].menneske) kamp.styrer[h] = angriber.i;
  kamp.fase = 'klar'; kamp.ur = 0;
}

/* ---------- Træning ---------- */
// Tre øvelser, én for hver evne. Hvert point i øvelsen er ét point erfaring i
// den evne. Man styrer altid den samme spiller.
export const TRAENING = {
  skud: { navn: 'Skudtræning', evne: 'skud', tegn: '🎯', om: 'Scor på målmanden så mange gange du kan.' },
  fart: { navn: 'Kegleløb', evne: 'fart', tegn: '⚡', om: 'Drible bolden hen til keglerne – en ad gangen, så hurtigt du kan.' },
  aflevering: { navn: 'Afleveringer', evne: 'aflevering', tegn: '🤝', om: 'Aflever til den makker, der lyser – han spiller den tilbage.' },
};

const MAKKER_STEDER = [{ x: 12, y: 36 }, { x: 48, y: 36 }, { x: 30, y: 16 }];

export function nyTraening({ type, evner, farve = '#e8413c', seed = 1, længde = TRAENING_SEK } = {}) {
  const rnd = mulberry32(seed >>> 0);
  const mig = { navn: 'Dig', farve, menneske: true, evner: { fart: 1, skud: 1, aflevering: 1, ...(evner || {}) }, ai: MENNESKE_AI, mål: 0, spillere: [] };
  const dem = { navn: 'Træner', farve: '#ffb000', farve2: '#553300', menneske: false, evner: { fart: 1, skud: 1, aflevering: 1 },
    ai: { ...MENNESKE_AI, keeper: 0.34 }, mål: 0, spillere: [] };
  mig.spillere.push(nySpiller(0, 0, 'solo', B / 2, 60, { fx: 0.5, fy: 0.4 }));
  if (type === 'skud') dem.spillere.push(nySpiller(1, 0, 'keeper', B / 2, 3.5, { fx: 0.5, fy: 0.035 }));
  if (type === 'aflevering') {
    MAKKER_STEDER.forEach((s, i) => mig.spillere.push(nySpiller(0, i + 1, 'makker', s.x, s.y, { fx: s.x / B, fy: fyFor(0, s.y) })));
  }
  const kamp = {
    type: 'traening', øvelse: type, rnd,
    hold: [mig, dem], bold: nyBold(),
    fase: 'klar', ur: 0, tid: 0, længde, kanForlænge: false, forlænget: false,
    styrer: [0, null], skiftUr: [0, 0], fastStyrer: true,
    input: [{ x: 0, y: 0 }, { x: 0, y: 0 }],
    vinder: null, hændelser: [], rest: 0, skudNr: 0,
    point: 0, kegle: null, lyser: null, nulstil: 0, maalLukket: type !== 'skud',
  };
  nyOpgave(kamp, true);
  return kamp;
}

/** Stiller næste opgave op i træningen. */
function nyOpgave(kamp, første = false) {
  const mig = kamp.hold[0].spillere[0], b = kamp.bold, rnd = kamp.rnd;
  if (kamp.øvelse === 'skud') {
    // Et nyt sted på modstanderens halvdel – nogle gange tæt på, nogle gange langt ude.
    mig.x = 10 + rnd() * 40; mig.y = 24 + rnd() * 24; mig.vx = mig.vy = 0; mig.fx = 0; mig.fy = -1;
    Object.assign(b, nyBold());
    b.x = mig.x; b.y = mig.y - (R + RB);
    giv(kamp, mig);
    const k = kamp.hold[1].spillere[0];
    k.x = B / 2; k.y = 3.5; k.vx = k.vy = 0; k.holdUr = 0;
  } else if (kamp.øvelse === 'fart') {
    if (første) { Object.assign(b, nyBold()); b.x = mig.x; b.y = mig.y - (R + RB); giv(kamp, mig); }
    let k;
    for (let n = 0; n < 40; n++) {
      k = { x: 8 + rnd() * (B - 16), y: 10 + rnd() * (L - 20) };
      if (afst(k, mig) > 24 && (!kamp.kegle || afst(k, kamp.kegle) > 18)) break;
    }
    kamp.kegle = k;
  } else if (kamp.øvelse === 'aflevering') {
    if (første) { Object.assign(b, nyBold()); b.x = mig.x; b.y = mig.y - (R + RB); giv(kamp, mig); }
    const før = kamp.lyser;
    let n = 1 + Math.floor(rnd() * 3);
    if (n === før) n = 1 + (n % 3);
    kamp.lyser = n;
  }
  if (første) { kamp.fase = 'klar'; kamp.ur = 0; }
}

/* ---------- Hjælpere ---------- */
export const alleSpillere = kamp => kamp.hold[0].spillere.concat(kamp.hold[1].spillere);
const markspillere = hold => hold.spillere.filter(p => p.rolle !== 'keeper');
export function spillerMedBold(kamp) {
  const hos = kamp.bold.hos;
  return hos ? kamp.hold[hos.h].spillere[hos.i] : null;
}
function holdMedBold(kamp) { return kamp.bold.hos ? kamp.bold.hos.h : null; }
function hæn(kamp, type, data = {}) { kamp.hændelser.push({ type, ...data }); }

function giv(kamp, p) {
  const b = kamp.bold;
  b.hos = { h: p.h, i: p.i }; b.vx = b.vy = 0; b.modtager = null; b.skud = null; b.sidst = { h: p.h, i: p.i };
  p.beskyttet = 0.45;
  p.tænkUr = Math.max(p.tænkUr, 0.25);     // en robot skal lige se sig om, før den gør noget
  if (p.rolle === 'keeper') p.holdUr = 0.9;
}

/** Den markspiller på hold h, der styres af et menneske (eller null). */
export function styret(kamp, h) {
  const i = kamp.styrer[h];
  return i == null ? null : kamp.hold[h].spillere[i];
}

/* ---------- At sparke ---------- */
/** Sparker bolden fra p mod punktet (tx, ty). støj er en vinkel i radianer. */
function spark(kamp, p, tx, ty, fart, støj, type) {
  const b = kamp.bold;
  let dx = tx - b.x, dy = ty - b.y;
  const l = Math.hypot(dx, dy) || 1;
  let v = Math.atan2(dy, dx) + gauss(kamp.rnd) * støj;
  b.hos = null;
  b.vx = Math.cos(v) * fart; b.vy = Math.sin(v) * fart;
  b.laast = 0.3; b.laastAf = { h: p.h, i: p.i };
  b.sidst = { h: p.h, i: p.i };
  b.modtager = null; b.skud = null;
  kamp.skudNr++;
  p.tænkUr = 0.3; p.holdUr = 0;
  hæn(kamp, type, { h: p.h, i: p.i, fart, afstand: l });
}

/** Hvor i målet der sigtes: side = −1..1 hen over målet (i banens x). */
function skyd(kamp, p, side) {
  const hold = kamp.hold[p.h];
  const ty = maalY(p.h) + frem(p.h) * 1.5;   // lidt inde bag linjen
  const tx = B / 2 + klem(side, -1, 1) * (MAAL_B / 2 - 2.2);
  const d = Math.hypot(tx - p.x, ty - p.y) || 1;
  const spred = skudSpred(hold.evner.skud);
  // Spredningen er en afstand ude ved målet, så den bliver en vinkel her.
  spark(kamp, p, tx, ty, skudFart(hold.evner.skud), Math.atan(spred / d) * 0.5, 'skud');
  kamp.bold.skud = { h: p.h, nr: kamp.skudNr, reddet: false, prøvet: false };
}

/** Siden af målet, der er længst fra målmanden (−1 eller 1), lidt blandet op. */
function vækFraKeeper(kamp, h) {
  const modstander = kamp.hold[1 - h].spillere.find(p => p.rolle === 'keeper');
  if (!modstander) return (kamp.rnd() - 0.5) * 1.2;
  return (modstander.x > B / 2 ? -1 : 1) * (0.55 + kamp.rnd() * 0.45);
}

/** Afleverer fra p til m med en fart, der passer til afstanden. */
function afleverTil(kamp, p, m) {
  const hold = kamp.hold[p.h], b = kamp.bold;
  const mål = { x: m.x + m.vx * 0.35, y: m.y + m.vy * 0.35 };
  const d = afst(mål, b);
  const fart = klem(13 + d * 0.75, 15, 31);
  spark(kamp, p, mål.x, mål.y, fart, afleverStoej(hold.evner.aflevering), 'aflevering');
  b.modtager = { h: m.h, i: m.i };
}

/** Den bedste at aflevere til for en robot: fremme, fri og uden en modstander på vejen. */
function bedsteMakker(kamp, p, udenFor = null) {
  const hold = kamp.hold[p.h], mod = kamp.hold[1 - p.h];
  let bedst = null, score = -Infinity;
  for (const m of hold.spillere) {
    if (m === p || m.rolle === 'keeper' || m === udenFor) continue;
    let s = fyFor(p.h, m.y) * 30;
    const d = afst(m, p);
    if (d > 38) s -= 12;
    if (d < 7) s -= 8;
    for (const o of mod.spillere) {
      const od = afst(o, m);
      if (od < 7) s -= (7 - od) * 3;
      if (afstTilLinje(o, p, m) < 2.8 && prik(o, p, m) > 0) s -= 14;
    }
    if (s > score) { score = s; bedst = m; }
  }
  return bedst;
}
function afstTilLinje(o, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy || 1;
  const t = klem(((o.x - a.x) * dx + (o.y - a.y) * dy) / l2, 0, 1);
  return Math.hypot(a.x + dx * t - o.x, a.y + dy * t - o.y);
}
function prik(o, a, b) { return (o.x - a.x) * (b.x - a.x) + (o.y - a.y) * (b.y - a.y); }

/* ---------- Det menneskene kan gøre ---------- */
/** Joysticket for hold h: en vektor i banens retninger, længde 0-1. */
export function styr(kamp, h, x, y) {
  const l = Math.hypot(x, y);
  kamp.input[h] = l > 1 ? { x: x / l, y: y / l } : { x, y };
}

/**
 * «Skyd»: har man bolden, skydes der mod målet (joysticket til siden sigter
 * til siden). Har man den ikke, er det en tackling på den, der har.
 */
export function trykSkyd(kamp, h) {
  if (kamp.fase !== 'spil') return false;
  const p = styret(kamp, h);
  if (!p) return false;
  const b = kamp.bold;
  if (b.hos && b.hos.h === h && b.hos.i === p.i) {
    if (kamp.type === 'traening' && kamp.øvelse !== 'skud') {
      // Uden mål at skyde på: et langt spark i den retning, man løber.
      const [dx, dy] = retningFor(kamp, p);
      spark(kamp, p, b.x + dx * 30, b.y + dy * 30, 26, 0.04, 'spark');
      return true;
    }
    const inp = kamp.input[h];
    const side = Math.abs(inp.x) > 0.3 ? Math.sign(inp.x) * 0.85 : vækFraKeeper(kamp, h);
    skyd(kamp, p, side);
    return true;
  }
  const c = spillerMedBold(kamp);
  if (c && c.h !== h && c.rolle !== 'keeper' && afst(p, b) < R + RB + 2.2 && p.tackleUr <= 0) {
    p.tackleUr = 0.5;
    if (kamp.rnd() < 0.66) { tag(kamp, p, c); return true; }
    hæn(kamp, 'forbi', { h });
  }
  return false;
}

/**
 * «Aflever»: har man bolden, går den til den makker, joysticket peger mod
 * (ellers den bedste). Har man den ikke, skifter man til den makker, der er
 * tættest på bolden.
 */
export function trykAflever(kamp, h) {
  if (kamp.fase !== 'spil') return false;
  const p = styret(kamp, h);
  if (!p) return false;
  const b = kamp.bold, hold = kamp.hold[h];
  if (b.hos && b.hos.h === h && b.hos.i === p.i) {
    let m = null;
    if (kamp.type === 'traening' && kamp.øvelse === 'aflevering') m = makkerIRetning(kamp, p, 100) || hold.spillere[kamp.lyser];
    else m = makkerIRetning(kamp, p, 80) || bedsteMakker(kamp, p);
    if (!m) {
      const [dx, dy] = retningFor(kamp, p);
      spark(kamp, p, b.x + dx * 20, b.y + dy * 20, 19, 0.03, 'spark');
      return true;
    }
    afleverTil(kamp, p, m);
    if (!kamp.fastStyrer) kamp.styrer[h] = m.i;
    return true;
  }
  if (kamp.fastStyrer) return false;
  let bedst = null, d0 = Infinity;
  for (const m of markspillere(hold)) {
    if (m === p) continue;
    const d = afst(m, b);
    if (d < d0) { d0 = d; bedst = m; }
  }
  if (bedst) { kamp.styrer[h] = bedst.i; kamp.skiftUr[h] = 0.6; hæn(kamp, 'skift', { h }); }
  return !!bedst;
}

function retningFor(kamp, p) {
  const inp = kamp.input[p.h];
  const l = Math.hypot(inp.x, inp.y);
  if (l > 0.2) return [inp.x / l, inp.y / l];
  const f = Math.hypot(p.fx, p.fy) || 1;
  return [p.fx / f, p.fy / f];
}

/** Den makker, der ligger nærmest i den retning, joysticket peger (højst `grader` væk). */
function makkerIRetning(kamp, p, grader) {
  const inp = kamp.input[p.h];
  const l = Math.hypot(inp.x, inp.y);
  if (l < 0.3) return null;
  let bedst = null, v0 = grader * Math.PI / 180;
  for (const m of kamp.hold[p.h].spillere) {
    if (m === p || m.rolle === 'keeper') continue;
    const dx = m.x - p.x, dy = m.y - p.y, d = Math.hypot(dx, dy) || 1;
    const v = Math.acos(klem((dx * inp.x + dy * inp.y) / (d * l), -1, 1));
    if (v < v0) { v0 = v; bedst = m; }
  }
  return bedst;
}

/** c mister bolden til p. */
function tag(kamp, p, c) {
  giv(kamp, p);
  p.beskyttet = 0.55;
  c.tackleUr = 0.4;
  if (kamp.hold[p.h].menneske && !kamp.fastStyrer) kamp.styrer[p.h] = p.i;
  hæn(kamp, 'tackling', { h: p.h, i: p.i });
}

/* ---------- Tiden går ---------- */
/** Kører kampen dt sekunder frem i faste skridt. */
export function tik(kamp, dt) {
  kamp.rest = Math.min(kamp.rest + dt, 5);
  while (kamp.rest >= DT) { kamp.rest -= DT; skridt(kamp); }
}

function skridt(kamp) {
  if (kamp.fase === 'slut') return;
  kamp.ur += DT;
  if (kamp.fase === 'klar') {
    if (kamp.ur >= KLAR_SEK) { kamp.fase = 'spil'; kamp.ur = 0; hæn(kamp, 'fløjt'); }
    return;
  }
  if (kamp.fase === 'maal') {
    // Bolden ligger i nettet, og spillerne jubler lidt.
    for (const p of alleSpillere(kamp)) { p.x += p.vx * DT; p.y += p.vy * DT; p.vx *= 0.9; p.vy *= 0.9; }
    if (kamp.ur >= MAAL_PAUSE) {
      if (kamp.type === 'traening') { nyOpgave(kamp); kamp.fase = 'spil'; kamp.ur = 0; }
      else afspark(kamp, kamp.næsteAfspark);
    }
    return;
  }
  // fase === 'spil'
  kamp.tid += DT;
  if (kamp.tid >= kamp.længde) { tidenErGået(kamp); if (kamp.fase === 'slut') return; }
  for (const h of [0, 1]) if (kamp.skiftUr[h] > 0) kamp.skiftUr[h] -= DT;
  for (const h of [0, 1]) opdaterStyrer(kamp, h);
  for (const p of alleSpillere(kamp)) {
    if (p.tackleUr > 0) p.tackleUr -= DT;
    if (p.beskyttet > 0) p.beskyttet -= DT;
    if (p.tænkUr > 0) p.tænkUr -= DT;
    bevæg(kamp, p);
  }
  skilAd(kamp);
  bold(kamp);
  if (kamp.fase !== 'spil') return;
  tacklinger(kamp);
  målmænd(kamp);
  robotBeslutning(kamp);
  if (kamp.type === 'traening') træningsRegler(kamp);
}

function tidenErGået(kamp) {
  const [a, b] = kamp.hold.map(o => o.mål);
  if (kamp.type === 'kamp' && a === b && kamp.kanForlænge && !kamp.forlænget) {
    kamp.forlænget = true;
    kamp.længde += FORLAENGET_SEK;
    hæn(kamp, 'forlænget');
    return;
  }
  slut(kamp);
}

function slut(kamp) {
  kamp.fase = 'slut';
  const [a, b] = kamp.hold.map(o => o.mål);
  kamp.vinder = a > b ? 0 : b > a ? 1 : null;
  hæn(kamp, 'slut', { vinder: kamp.vinder });
}

/** Den, man styrer, skifter til den, der har bolden – eller er tættest på den. */
function opdaterStyrer(kamp, h) {
  if (kamp.styrer[h] == null || kamp.fastStyrer) return;
  const hold = kamp.hold[h], b = kamp.bold;
  if (b.hos && b.hos.h === h) {
    if (hold.spillere[b.hos.i].rolle !== 'keeper') kamp.styrer[h] = b.hos.i;
    return;
  }
  if (b.modtager && b.modtager.h === h) { kamp.styrer[h] = b.modtager.i; return; }
  if (kamp.skiftUr[h] > 0) return;
  const nu = styret(kamp, h);
  let bedst = nu, d0 = afst(nu, b);
  for (const m of markspillere(hold)) {
    const d = afst(m, b);
    if (d < d0 - 5) { d0 = d; bedst = m; }
  }
  if (bedst !== nu) { kamp.styrer[h] = bedst.i; kamp.skiftUr[h] = 0.5; }
}

/* ---------- Hvor spillerne vil hen ---------- */
function bevæg(kamp, p) {
  const hold = kamp.hold[p.h], b = kamp.bold;
  const harBold = b.hos && b.hos.h === p.h && b.hos.i === p.i;
  let fart = FART * fartFaktor(hold.evner.fart) * (harBold ? 0.9 : 1);
  if (p.rolle === 'keeper') fart = FART * 0.8;
  let tvx = 0, tvy = 0;
  const inp = kamp.input[p.h];
  const modtager = b.modtager && b.modtager.h === p.h && b.modtager.i === p.i;
  // Den, man styrer, løber selv bolden i møde, når en aflevering er på vej, og
  // man ikke rører joysticket – ellers ruller en lidt skæv aflevering forbi.
  if (styret(kamp, p.h) === p && !(modtager && Math.hypot(inp.x, inp.y) < 0.2)) {
    tvx = inp.x * fart; tvy = inp.y * fart;
  } else {
    const m = målFor(kamp, p);
    if (m) {
      const dx = m.x - p.x, dy = m.y - p.y, d = Math.hypot(dx, dy);
      const s = fart * (m.fart ?? 1) * Math.min(1, d / 2.5);
      if (d > 0.05) { tvx = dx / d * s; tvy = dy / d * s; }
    }
  }
  const a = Math.min(1, 9 * DT);
  p.vx += (tvx - p.vx) * a; p.vy += (tvy - p.vy) * a;
  p.x = klem(p.x + p.vx * DT, R, B - R);
  p.y = klem(p.y + p.vy * DT, R * 0.6, L - R * 0.6);
  const v = Math.hypot(p.vx, p.vy);
  if (v > 1.5) { p.fx = p.vx / v; p.fy = p.vy / v; }
}

/** Robothjernet for spillere uden en finger på: hvor skal han hen lige nu? */
function målFor(kamp, p) {
  const hold = kamp.hold[p.h], b = kamp.bold, ai = hold.ai;
  const harBold = b.hos && b.hos.h === p.h && b.hos.i === p.i;
  if (p.rolle === 'keeper') return keeperMål(kamp, p);
  if (p.rolle === 'makker') {
    if (b.modtager && b.modtager.h === p.h && b.modtager.i === p.i) return modtagerMål(kamp, p);
    return { x: MAKKER_STEDER[p.i - 1].x, y: MAKKER_STEDER[p.i - 1].y };
  }
  if (b.modtager && b.modtager.h === p.h && b.modtager.i === p.i) return modtagerMål(kamp, p);
  if (p.rolle === 'solo') return null;
  if (harBold) return dribleMål(kamp, p);

  const vores = holdMedBold(kamp) === p.h;
  // Jagerne: de nærmeste løber efter bolden (når vi ikke selv har den).
  if (!vores && ai.pres > 0) {
    const jagere = markspillere(hold).filter(m => styret(kamp, p.h) !== m)
      .sort((m, n) => afst(m, b) - afst(n, b)).slice(0, ai.pres);
    if (jagere.includes(p)) {
      // Robotterne ser bolden med en lille forsinkelse – de dårlige mere end de gode.
      if (!p.sigte || p.tænkUr <= 0) {
        p.sigte = { x: b.x + b.vx * 0.25, y: b.y + b.vy * 0.25 };
        p.tænkUr = ai.tænk * 0.45;
      }
      return p.sigte;
    }
  }
  // Resten holder deres plads og flytter sig med bolden.
  const bfx = b.x / B, bfy = fyFor(p.h, b.y);
  let fx = p.hjem.fx * 0.7 + (p.h === 0 ? bfx : 1 - bfx) * 0.3;
  let fy = p.hjem.fy + (bfy - 0.5) * 0.45 + (vores ? 0.1 : -0.06);
  if (p.rolle === 'forsvar') fy = Math.min(fy, vores ? 0.5 : 0.36);
  const q = tilBane(p.h, klem(fx, 0.1, 0.9), klem(fy, 0.08, 0.9));
  return { ...q, fart: 0.85 };
}

function modtagerMål(kamp, p) {
  const b = kamp.bold, v = Math.hypot(b.vx, b.vy);
  if (v < 2) return { x: b.x, y: b.y };
  // Løb hen til det sted på boldens vej, der er tættest på.
  const dx = b.vx / v, dy = b.vy / v;
  const t = Math.max(0, (p.x - b.x) * dx + (p.y - b.y) * dy);
  return { x: b.x + dx * t, y: b.y + dy * t };
}

function keeperMål(kamp, p) {
  const b = kamp.bold, eget = maalY(1 - p.h);
  const harBold = b.hos && b.hos.h === p.h && b.hos.i === p.i;
  if (harBold) return { x: p.x, y: p.y };
  // Løs bold tæt på eget mål: gå ud og tag den.
  const tæt = Math.abs(b.y - eget) < 15 && Math.abs(b.x - B / 2) < 16;
  if (tæt && !b.hos && Math.hypot(b.vx, b.vy) < 12) return { x: b.x, y: b.y };
  // Ellers: stå på stregen, hvor bolden vil ramme den.
  let x = b.x;
  if (!b.hos && Math.sign(b.vy) === -frem(p.h) && Math.abs(b.vy) > 3) {
    const t = (eget - b.y) / b.vy;
    if (t > 0 && t < 2.5) x = b.x + b.vx * t;
  }
  return { x: klem(x, B / 2 - MAAL_B / 2 + 1.2, B / 2 + MAAL_B / 2 - 1.2), y: eget + frem(p.h) * 2.6 };
}

/** Hvor en robot med bolden løber hen: mod målet, uden om den, der står i vejen. */
function dribleMål(kamp, p) {
  const mod = kamp.hold[1 - p.h].spillere;
  let tx = B / 2, ty = maalY(p.h) - frem(p.h) * 4;
  let nær = null, d0 = 10;
  for (const o of mod) {
    const foran = (o.y - p.y) * frem(p.h);
    const d = afst(o, p);
    if (foran > 0 && d < d0) { d0 = d; nær = o; }
  }
  if (nær) {
    const side = p.x < nær.x ? -1 : 1;
    tx = klem(p.x + side * 12, 5, B - 5);
    ty = p.y + frem(p.h) * 10;
  }
  return { x: tx, y: ty };
}

/** Spillerne må ikke stå oven i hinanden. */
function skilAd(kamp) {
  const alle = alleSpillere(kamp);
  for (let a = 0; a < alle.length; a++) {
    for (let c = a + 1; c < alle.length; c++) {
      const p = alle[a], q = alle[c];
      const dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy);
      if (d > 0 && d < R * 2) {
        const s = (R * 2 - d) / 2;
        p.x -= dx / d * s; p.y -= dy / d * s; q.x += dx / d * s; q.y += dy / d * s;
      }
    }
  }
}

/* ---------- Bolden ---------- */
function bold(kamp) {
  const b = kamp.bold;
  if (b.laast > 0) b.laast -= DT;
  const c = spillerMedBold(kamp);
  if (c) {
    // Bolden ligger foran fødderne på den, der har den.
    const f = Math.hypot(c.fx, c.fy) || 1;
    b.x = klem(c.x + c.fx / f * (R + RB), RB, B - RB);
    b.y = klem(c.y + c.fy / f * (R + RB), RB, L - RB);
    b.vx = c.vx; b.vy = c.vy;
    b.drej += Math.hypot(c.vx, c.vy) * DT;
    return;
  }
  // Friktion: bolden triller ud.
  const v = Math.hypot(b.vx, b.vy);
  b.drej += v * DT;
  const tab = Math.max(0, 1 - 0.55 * DT);
  b.vx *= tab; b.vy *= tab;
  if (v < 0.6) { b.vx *= 0.9; b.vy *= 0.9; }
  b.x += b.vx * DT; b.y += b.vy * DT;

  // Banderne
  if (b.x < RB) { b.x = RB; b.vx = Math.abs(b.vx) * 0.6; hæn(kamp, 'bande'); }
  if (b.x > B - RB) { b.x = B - RB; b.vx = -Math.abs(b.vx) * 0.6; hæn(kamp, 'bande'); }
  // I træningen er der kun et mål at skyde på – det øverste.
  const iMålet = Math.abs(b.x - B / 2) < MAAL_B / 2 - RB * 0.5 && !kamp.maalLukket;
  const åbentTop = iMålet, åbentBund = iMålet && kamp.type !== 'traening';
  if (b.y < RB && !åbentTop) { b.y = RB; b.vy = Math.abs(b.vy) * 0.6; hæn(kamp, 'bande'); }
  if (b.y > L - RB && !åbentBund) { b.y = L - RB; b.vy = -Math.abs(b.vy) * 0.6; hæn(kamp, 'bande'); }
  // Stolperne
  for (const py of [0, L]) for (const px of [B / 2 - MAAL_B / 2, B / 2 + MAAL_B / 2]) {
    const dx = b.x - px, dy = b.y - py, d = Math.hypot(dx, dy);
    if (d < RB + 0.35 && d > 0) {
      const nx = dx / d, ny = dy / d, vn = b.vx * nx + b.vy * ny;
      if (vn < 0) { b.vx -= 1.6 * vn * nx; b.vy -= 1.6 * vn * ny; hæn(kamp, 'stolpe'); }
      b.x = px + nx * (RB + 0.36); b.y = py + ny * (RB + 0.36);
    }
  }
  // Mål!
  if (b.y < 0 && åbentTop) return mål(kamp, 0);
  if (b.y > L && åbentBund) return mål(kamp, 1);
  if (kamp.fase !== 'spil') return;

  // Nogen tager bolden
  const fart = Math.hypot(b.vx, b.vy);
  let bedst = null, d0 = Infinity;
  for (const p of alleSpillere(kamp)) {
    if (b.laast > 0 && b.laastAf && b.laastAf.h === p.h && b.laastAf.i === p.i) continue;
    const d = afst(p, b);
    if (d > R + RB + 0.5) continue;
    const modtager = b.modtager && b.modtager.h === p.h && b.modtager.i === p.i;
    if (p.rolle === 'keeper') continue;                 // målmænd griber i målmænd()
    const grænse = modtager ? 45 : 21;
    if (fart > grænse) continue;
    if (d < d0) { d0 = d; bedst = p; }
  }
  if (bedst) {
    const før = b.sidst;
    giv(kamp, bedst);
    if (før && før.h !== bedst.h) hæn(kamp, 'erobret', { h: bedst.h });
    if (kamp.hold[bedst.h].menneske && !kamp.fastStyrer) kamp.styrer[bedst.h] = bedst.i;
  } else if (b.modtager && fart < 1.5) b.modtager = null;
}

function mål(kamp, h) {
  const b = kamp.bold;
  b.y = h === 0 ? -1.6 : L + 1.6;
  b.vx *= 0.1; b.vy = 0;
  b.hos = null; b.modtager = null;
  kamp.hold[h].mål++;
  kamp.næsteAfspark = 1 - h;
  kamp.fase = 'maal'; kamp.ur = 0;
  hæn(kamp, 'mål', { h, af: b.sidst });
  if (kamp.type === 'traening') { kamp.point++; hæn(kamp, 'point', { point: kamp.point }); }
  // Den, der scorede, jubler: han løber lidt videre.
  for (const p of alleSpillere(kamp)) { p.vx *= 0.5; p.vy *= 0.5; }
  if (kamp.forlænget && kamp.type === 'kamp') slut(kamp);   // næste mål vinder
}

/* ---------- Tacklinger ---------- */
function tacklinger(kamp) {
  const c = spillerMedBold(kamp);
  if (!c || c.rolle === 'keeper' || c.beskyttet > 0) return;
  const b = kamp.bold;
  for (const o of kamp.hold[1 - c.h].spillere) {
    if (o.rolle === 'keeper' || o.tackleUr > 0) continue;
    if (afst(o, b) > R + RB + 0.9) continue;
    o.tackleUr = 0.55;
    const hold = kamp.hold[o.h];
    const menneske = styret(kamp, o.h) === o;
    const chance = menneske ? 0.46 : hold.ai.tackle;
    if (kamp.rnd() < chance) { tag(kamp, o, c); return; }
  }
}

/* ---------- Målmændene ---------- */
function målmænd(kamp) {
  const b = kamp.bold;
  for (const hold of kamp.hold) {
    const k = hold.spillere.find(p => p.rolle === 'keeper');
    if (!k) continue;
    if (b.hos && b.hos.h === k.h && b.hos.i === k.i) {
      k.holdUr -= DT;
      if (k.holdUr <= 0) {
        if (kamp.type === 'traening') { kamp.fase = 'maal'; kamp.ur = MAAL_PAUSE - 0.6; b.hos = null; b.vx = b.vy = 0; return; }
        const m = bedsteMakker(kamp, k);
        if (m) afleverTil(kamp, k, m);
        else spark(kamp, k, B / 2, L / 2, 24, 0.1, 'aflevering');
      }
      continue;
    }
    if (b.hos) continue;
    if (b.laast > 0 && b.laastAf && b.laastAf.h === k.h && b.laastAf.i === k.i) continue;
    const d = afst(k, b);
    if (d > R + RB + 1.3) continue;
    const fart = Math.hypot(b.vx, b.vy);
    if (fart < 14) { const før = b.sidst; giv(kamp, k); if (før && før.h !== k.h) hæn(kamp, 'grebet', { h: k.h }); continue; }
    // Et skud: målmanden får ét forsøg på at redde det.
    const nr = kamp.skudNr;
    if (k.forsøgt === nr) continue;
    k.forsøgt = nr;
    const chance = hold.ai.keeper * (1 - klem((fart - 22) / 40, 0, 0.45));
    if (kamp.rnd() < chance) {
      giv(kamp, k);
      hæn(kamp, 'redning', { h: k.h });
    }
  }
}

/* ---------- Robotternes beslutninger med bolden ---------- */
function robotBeslutning(kamp) {
  const c = spillerMedBold(kamp);
  if (!c || c.rolle === 'keeper' || c.rolle === 'makker' || c.rolle === 'solo') return;
  if (styret(kamp, c.h) === c) return;
  const hold = kamp.hold[c.h], ai = hold.ai, rnd = kamp.rnd;
  if (c.tænkUr > 0) return;
  c.tænkUr = ai.tænk * (0.6 + rnd() * 0.8);
  const målP = { x: B / 2, y: maalY(c.h) };
  const d = afst(c, målP);
  // Sjusk: en dum beslutning (skyder ude fra midten, afleverer blindt).
  if (rnd() < ai.sjusk * 0.5) {
    if (rnd() < 0.5) skyd(kamp, c, (rnd() - 0.5) * 2.4);
    else { const ms = markspillere(hold).filter(m => m !== c); if (ms.length) afleverTil(kamp, c, ms[Math.floor(rnd() * ms.length)]); }
    return;
  }
  if (d < 13 || (d < ai.skudAfstand && Math.abs(c.x - B / 2) < 20 && rnd() < 0.65)) {
    skyd(kamp, c, vækFraKeeper(kamp, c.h));
    return;
  }
  // Presset? Så aflever – hvis der er en fri makker.
  let pres = Infinity;
  for (const o of kamp.hold[1 - c.h].spillere) pres = Math.min(pres, afst(o, c));
  if (pres < 5.5 && rnd() < ai.klog) {
    const m = bedsteMakker(kamp, c);
    if (m && fyFor(c.h, m.y) > fyFor(c.h, c.y) - 0.2) afleverTil(kamp, c, m);
  }
}

/* ---------- Træningens regler ---------- */
function træningsRegler(kamp) {
  const mig = kamp.hold[0].spillere[0], b = kamp.bold;
  if (kamp.øvelse === 'fart' && kamp.kegle) {
    const harBold = b.hos && b.hos.h === 0 && b.hos.i === 0;
    if (harBold && afst(mig, kamp.kegle) < R + 2.6) {
      kamp.point++;
      hæn(kamp, 'point', { point: kamp.point });
      nyOpgave(kamp);
    }
  }
  if (kamp.øvelse === 'aflevering') {
    const c = spillerMedBold(kamp);
    if (c && c.rolle === 'makker') {
      if (c.holdUr === 0 && !c.talt) {
        c.talt = true;
        if (c.i === kamp.lyser) { kamp.point++; hæn(kamp, 'point', { point: kamp.point }); nyOpgave(kamp); }
        else hæn(kamp, 'forkert');
        c.holdUr = 0.55;
      }
      c.holdUr -= DT;
      if (c.holdUr <= 0) { c.talt = false; afleverTil(kamp, c, mig); c.holdUr = 0; }
    }
  }
  if (kamp.øvelse === 'skud') {
    // Triller bolden død langt fra målet, får man en ny.
    const fart = Math.hypot(b.vx, b.vy);
    if (!b.hos && fart < 1 && b.y > 55) nyOpgave(kamp);
  }
}

/* ======================================================================
   Profilen: evner, penge, butik og ligaen. Gemmes i index.html.
   ====================================================================== */

/** Erfaring, der skal til for at gå fra niveau n til n+1. */
export const krav = n => 4 + 2 * n;

export const BUTIK = [
  { id: 'roed', type: 'trøje', navn: 'Rød trøje', pris: 0, farve: '#e8413c', farve2: '#ffffff' },
  { id: 'blaa', type: 'trøje', navn: 'Blå trøje', pris: 0, farve: '#2f7bf0', farve2: '#ffffff' },
  { id: 'groen', type: 'trøje', navn: 'Grøn trøje', pris: 40, farve: '#1fae5b', farve2: '#ffffff' },
  { id: 'lilla', type: 'trøje', navn: 'Lilla trøje', pris: 70, farve: '#9b5cff', farve2: '#ffe14d' },
  { id: 'lyseroed', type: 'trøje', navn: 'Lyserød trøje', pris: 90, farve: '#ff77b7', farve2: '#ffffff' },
  { id: 'sort', type: 'trøje', navn: 'Sort og guld', pris: 160, farve: '#1c1c22', farve2: '#ffd447' },
  { id: 'guld', type: 'trøje', navn: 'Guldtrøje', pris: 400, farve: '#ffc933', farve2: '#8a5a00' },
  { id: 'lyn', type: 'støvler', navn: 'Lynstøvler', pris: 150, evne: 'fart', plus: 1, om: '+1 fart' },
  { id: 'kanon', type: 'støvler', navn: 'Kanonstøvler', pris: 150, evne: 'skud', plus: 1, om: '+1 skud' },
  { id: 'praecis', type: 'støvler', navn: 'Præcisionsstøvler', pris: 150, evne: 'aflevering', plus: 1, om: '+1 aflevering' },
  { id: 'guldstoevler', type: 'støvler', navn: 'Guldstøvler', pris: 600, evne: 'alle', plus: 1, om: '+1 til det hele' },
];
export const EVNER = ['fart', 'skud', 'aflevering'];

export function nyProfil() {
  return {
    penge: 0,
    evner: { fart: { n: 1, xp: 0 }, skud: { n: 1, xp: 0 }, aflevering: { n: 1, xp: 0 } },
    ejer: ['roed', 'blaa'], troeje: 'roed',
    trin: 0, mester: false, stime: 0, best: 0, sejre: 0, uafgjort: 0, tab: 0,
  };
}

/** Retter en gemt profil til, så en gammel eller ødelagt ikke vælter spillet. */
export function rensProfil(p) {
  const ny = nyProfil();
  if (!p || typeof p !== 'object') return ny;
  const tal = (v, min = 0, maks = 1e9) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? klem(n, min, maks) : min; };
  ny.penge = tal(p.penge);
  for (const e of EVNER) {
    const q = p.evner && p.evner[e];
    if (q) { ny.evner[e].n = tal(q.n, 1, EVNE_MAKS); ny.evner[e].xp = ny.evner[e].n >= EVNE_MAKS ? 0 : tal(q.xp, 0, krav(ny.evner[e].n) - 1); }
  }
  if (Array.isArray(p.ejer)) for (const id of p.ejer) if (BUTIK.some(t => t.id === id) && !ny.ejer.includes(id)) ny.ejer.push(id);
  if (ny.ejer.includes(p.troeje) && BUTIK.find(t => t.id === p.troeje).type === 'trøje') ny.troeje = p.troeje;
  ny.trin = tal(p.trin, 0, LIGA.length - 1);
  ny.mester = !!p.mester;
  for (const k of ['stime', 'best', 'sejre', 'uafgjort', 'tab']) ny[k] = tal(p[k]);
  return ny;
}

/** Evnerne med støvlerne lagt oveni – det er dem, kampen bruger. */
export function samledeEvner(profil) {
  const e = {};
  for (const k of EVNER) e[k] = profil.evner[k].n;
  for (const t of BUTIK) {
    if (t.type !== 'støvler' || !profil.ejer.includes(t.id)) continue;
    for (const k of EVNER) if (t.evne === k || t.evne === 'alle') e[k] += t.plus;
  }
  return e;
}

export function troeje(profil) { return BUTIK.find(t => t.id === profil.troeje) || BUTIK[0]; }

/** Køber en ting. Svarer med en grund, hvis det ikke kan lade sig gøre. */
export function koeb(profil, id) {
  const t = BUTIK.find(x => x.id === id);
  if (!t) return { ok: false, grund: 'Den findes ikke' };
  if (profil.ejer.includes(id)) {
    if (t.type === 'trøje') { profil.troeje = id; return { ok: true, valgt: true }; }
    return { ok: false, grund: 'Du har dem allerede' };
  }
  if (profil.penge < t.pris) return { ok: false, grund: `Du mangler ${t.pris - profil.penge} 🪙` };
  profil.penge -= t.pris;
  profil.ejer.push(id);
  if (t.type === 'trøje') profil.troeje = id;
  return { ok: true };
}

/** Lægger erfaring til en evne og svarer med hvor mange niveauer, den steg. */
export function giErfaring(profil, evne, xp) {
  const e = profil.evner[evne];
  let op = 0;
  e.xp += Math.max(0, Math.floor(xp));
  while (e.n < EVNE_MAKS && e.xp >= krav(e.n)) { e.xp -= krav(e.n); e.n++; op++; }
  if (e.n >= EVNE_MAKS) e.xp = 0;
  return op;
}

/** Efter en træning: erfaring for hvert point, og en mønt for hvert andet. */
export function efterTraening(profil, øvelse, point) {
  const evne = TRAENING[øvelse].evne;
  const op = giErfaring(profil, evne, point);
  const penge = Math.floor(point / 2);
  profil.penge += penge;
  return { evne, xp: point, op, penge, niveau: profil.evner[evne].n };
}

/**
 * Efter en kamp i ligaen. Sejr: videre til næste hold (og flere penge, jo
 * længere oppe man er). Uafgjort: samme hold igen, stimen står stille. Nederlag:
 * samme hold igen, og stimen starter forfra.
 */
export function efterKamp(profil, mine, deres) {
  const trin = profil.trin;
  let resultat, penge;
  if (mine > deres) {
    resultat = 'sejr';
    penge = 40 + 12 * trin + 5 * mine;
    profil.sejre++; profil.stime++;
  } else if (mine === deres) {
    resultat = 'uafgjort';
    penge = 15 + 4 * trin + 5 * mine;
    profil.uafgjort++;
  } else {
    resultat = 'tab';
    penge = 5 + 5 * mine;
    profil.tab++; profil.stime = 0;
  }
  let mester = false, rykOp = false;
  if (resultat === 'sejr') {
    if (trin < LIGA.length - 1) { profil.trin++; rykOp = true; }
    else if (!profil.mester) { profil.mester = true; mester = true; penge += 200; }
  }
  const rekord = profil.stime > profil.best;
  if (rekord) profil.best = profil.stime;
  profil.penge += penge;
  return { resultat, penge, rykOp, mester, rekord, trin: profil.trin, stime: profil.stime };
}
