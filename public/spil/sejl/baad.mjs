// Til søs! – vinden, båden, skærene og uvejret. Ren JS uden DOM, så index.html
// kun skal tegne, og det hele kan enhedstestes med `node --test test/unit/sejl.test.mjs`.
//
// Havet ses oppefra og regnes i meter: x går fra 0 til BREDDE (med strand i
// begge sider), y er hvor langt mod nord man er nået – det er scoren. Båden
// sejler altid fremad i sin kurs, og roret (◀ ▶) drejer den. Farten bestemmer
// vinden: sejler man lige op mod den, blafrer sejlet og båden ligger næsten
// stille; halvvind (vinden ind fra siden) er hurtigst; med vinden lige bagfra
// går det pænt men ikke bedst. Det er hele spillet: vinden drejer med jævne
// mellemrum, og så skal man finde en ny kurs, der både er hurtig og går uden om
// skærene. Sejlrenden mellem det røde og det grønne sømærke er altid fri.
//
// Bagfra kommer uvejret, som bliver hurtigere for hvert sekund. Det kan kun
// holdes væk med fart – og det er derfor, det gør noget, at man sejler rigtigt.

/* ---------- Tal man kan skrue på ---------- */
export const BREDDE = 44;          // havets bredde i meter
export const KYST = 3.5;           // strand i hver side – at gå på grund koster et liv
export const BAAD_R = 1.3;         // bådens radius ved sammenstød
export const MAKS_FART = 12;       // m/s på den bedste kurs (halvvind)
export const ROR = 1.8;            // rad/s roret drejer båden
export const TRAEGHED = 0.9;       // hvor hurtigt farten indstiller sig på kursen (pr. sekund)
export const VINDOEJE = (38 * Math.PI) / 180;  // tættere på vinden end det: sejlet blafrer
export const VIND_DREJ = 0.22;     // rad/s vinden drejer mod sit nye hjørne
export const VIND_SKIFT_MIN = 8;   // sekunder mellem to vindspring …
export const VIND_SKIFT_MAKS = 15; // … og højst
export const VIND_RUM = (150 * Math.PI) / 180; // vinden kommer aldrig helt agterfra
export const LIV = 3;
export const USAARLIG = 1.8;       // sekunder efter et skær, hvor det næste ikke koster
export const SKAER_FRA = 30;       // første række skær ligger her
export const RAEKKE = 26;          // meter mellem rækkerne af skær
export const GAB = 9;              // sejlrenden er altid mindst så bred
export const STORM_START = -70;    // uvejret begynder så langt bagude
export const STORM_FART = 5;
export const STORM_STIGNING = 0.035; // m/s² – uvejret tager til hele turen
export const STORM_MAKS = 11;      // … men bliver aldrig hurtigere end båden på sit bedste
export const STORM_HALE = 80;      // og sakker aldrig længere bagud end det

/* ---------- Tilfældighed man kan gentage ---------- */
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Vinkel foldet ind i ±π. */
export const wrap = a => {
  a = (a + Math.PI) % (2 * Math.PI);
  return (a < 0 ? a + 2 * Math.PI : a) - Math.PI;
};

/* ---------- Vinden ---------- */

/**
 * Fartkurven («polaren»): hvor stor en del af MAKS_FART båden gør, når kursen
 * ligger `op` radianer fra vindøjet. 0 = lige op mod vinden (næsten stille),
 * halvvind er hurtigst, og lænsen (vinden lige bagfra) er lidt langsommere –
 * præcis som på en rigtig sejlbåd. Grader → andel, med rette linjer imellem.
 */
const POLAR = [
  [0, 0.04], [30, 0.05], [38, 0.35], [52, 0.72], [75, 0.95],
  [100, 1], [130, 0.95], [160, 0.8], [180, 0.7],
];
export function fartFor(op) {
  const g = Math.min(180, Math.abs(op) * 180 / Math.PI);
  for (let i = 1; i < POLAR.length; i++) {
    if (g <= POLAR[i][0]) {
      const [g0, f0] = POLAR[i - 1], [g1, f1] = POLAR[i];
      return f0 + (f1 - f0) * ((g - g0) / (g1 - g0));
    }
  }
  return POLAR[POLAR.length - 1][1];
}

/** Hvor mange radianer kursen ligger fra vindøjet (0 = lige mod vinden). */
export const opMod = (kurs, vindFra) => Math.abs(wrap(kurs - vindFra));

/* ---------- Skærene ---------- */

// Rækkerne genereres ud fra frøet alene, så den samme tur altid har de samme
// skær – og så en bot (og en test) kan kigge frem uden at ændre noget.
const husk = new Map();

/**
 * Række nr. n af skær (n ≥ 0, ved y = SKAER_FRA + n·RAEKKE). Sejlrenden – GAB
 * meter omkring `gab` – er garanteret fri: et skær, der ville nå ind i den,
 * bliver slet ikke lagt. Renden er markeret med et rødt og et grønt sømærke.
 */
export function raekkeSkaer(seed, n) {
  const noegle = seed + ':' + n;
  if (husk.has(noegle)) return husk.get(noegle);
  const r = mulberry32((seed + Math.imul(n + 1, 0x9E3779B9)) >>> 0);
  const y = SKAER_FRA + n * RAEKKE;
  const gab = KYST + GAB / 2 + r() * (BREDDE - 2 * KYST - GAB);
  const skaer = [];
  const antal = 2 + Math.floor(r() * 3);
  for (let i = 0; i < antal; i++) {
    const sr = 1.8 + r() * 2.4;
    const sx = KYST - 2 + r() * (BREDDE - 2 * KYST + 4);
    const sy = y + (r() - 0.5) * 9;
    const froe = r();
    // Skær i sejlrenden lægges ikke – det er dét, der gør renden til en garanti.
    if (Math.abs(sx - gab) < GAB / 2 + sr + BAAD_R + 0.6) continue;
    skaer.push({ x: sx, y: sy, r: sr, froe });
  }
  const raekke = {
    n, y, gab, skaer,
    boejer: [
      { x: gab - GAB / 2 + 0.7, y, farve: 'roed' },
      { x: gab + GAB / 2 - 0.7, y, farve: 'groen' },
    ],
  };
  if (husk.size > 4000) husk.clear();
  husk.set(noegle, raekke);
  return raekke;
}

/** Rækkerne tæt nok på y til at kunne ses eller sejles ind i. */
export function naerRaekker(seed, y, margen = 16) {
  const fra = Math.max(0, Math.ceil((y - SKAER_FRA - margen) / RAEKKE));
  const til = Math.max(-1, Math.floor((y - SKAER_FRA + margen) / RAEKKE));
  const ud = [];
  for (let n = fra; n <= til; n++) ud.push(raekkeSkaer(seed, n));
  return ud;
}

/* ---------- En tur ---------- */

/**
 * En frisk båd nederst på havet. Vindens spring ligger fast i en plan, der
 * genereres af frøet med det samme – så er turen den samme hver gang, og
 * tilstanden kan kopieres med {...s}, uden at en tilfældighedskilde følger med.
 */
export function nySejlads(seed) {
  seed = seed >>> 0;
  const r = mulberry32(seed);
  const side = r() < 0.5 ? -1 : 1;
  const start = side * (Math.PI / 3 + r() * (Math.PI / 6));  // ind fra siden, så starten er hurtig
  const plan = [];
  let tid = VIND_SKIFT_MIN + r() * (VIND_SKIFT_MAKS - VIND_SKIFT_MIN);
  for (let i = 0; i < 80; i++) {
    plan.push({ tid, maal: (r() * 2 - 1) * VIND_RUM });
    tid += VIND_SKIFT_MIN + r() * (VIND_SKIFT_MAKS - VIND_SKIFT_MIN);
  }
  return {
    seed, t: 0,
    x: BREDDE / 2, y: 0,       // hvor båden er
    kurs: 0,                   // 0 = mod nord, positiv = mod højre
    fart: 4,
    vindFra: start,            // hvor vinden kommer FRA (0 = fra nord)
    vindMaal: start, plan, planI: 0,
    liv: LIV, usaarlig: 0, ramt: 0,
    blafrer: false, blafT: 0,
    storm: STORM_START,
    meter: 0,
    doed: false, aarsag: null, // 'skaer' | 'uvejr'
  };
}

/** Uvejrets fart lige nu – den stiger hele turen, til den rammer loftet. */
export const stormFart = t => Math.min(STORM_MAKS, STORM_FART + STORM_STIGNING * t);

/**
 * Ét skridt på dt sekunder. `ror` er -1 (drej venstre), 0 eller 1 (drej højre).
 * Giver hændelserne tilbage, så index.html kan lave lyd og pynt:
 *   { vindskifte, ramt: 'skaer'|'grund'|null, sunket, taget }
 */
export function tik(s, dt, ror) {
  const haendt = { vindskifte: false, ramt: null, sunket: false, taget: false };
  if (s.doed) return haendt;
  s.t += dt;

  // Vinden: spring i planen, og drej så roligt mod målet.
  while (s.planI < s.plan.length && s.t >= s.plan[s.planI].tid) {
    s.vindMaal = s.plan[s.planI].maal;
    s.planI++;
    haendt.vindskifte = true;
  }
  const drej = wrap(s.vindMaal - s.vindFra);
  const skridt = VIND_DREJ * dt;
  s.vindFra = Math.abs(drej) <= skridt ? s.vindMaal : wrap(s.vindFra + Math.sign(drej) * skridt);

  // Roret og farten.
  s.kurs = wrap(s.kurs + (ror | 0) * ROR * dt);
  const op = opMod(s.kurs, s.vindFra);
  s.blafrer = op < VINDOEJE;
  s.blafT = s.blafrer ? s.blafT + dt : 0;
  const maalFart = MAKS_FART * fartFor(op);
  s.fart += (maalFart - s.fart) * Math.min(1, TRAEGHED * dt);

  // Fremad.
  s.x += Math.sin(s.kurs) * s.fart * dt;
  s.y += Math.cos(s.kurs) * s.fart * dt;
  s.usaarlig = Math.max(0, s.usaarlig - dt);

  // På grund? Stranden skubber en ind igen og koster et liv.
  const inderst = KYST + BAAD_R, yderst = BREDDE - KYST - BAAD_R;
  if (s.x < inderst || s.x > yderst) {
    s.x = Math.max(inderst, Math.min(yderst, s.x));
    skade(s, haendt, 'grund');
  }

  // Skær?
  for (const raekke of naerRaekker(s.seed, s.y)) {
    for (const k of raekke.skaer) {
      const dx = s.x - k.x, dy = s.y - k.y;
      const afstand = Math.hypot(dx, dy), fri = k.r + BAAD_R;
      if (afstand >= fri) continue;
      // Skub båden ud af skæret, så den ikke hænger fast i det.
      const l = afstand || 0.001;
      s.x += (dx / l) * (fri - afstand + 0.05);
      s.y += (dy / l) * (fri - afstand + 0.05);
      skade(s, haendt, 'skaer');
    }
  }
  if (s.doed) { haendt.sunket = true; return haendt; }

  // Uvejret bagfra – det sakker aldrig helt agterud.
  s.storm = Math.max(s.storm + stormFart(s.t) * dt, s.y - STORM_HALE);
  s.meter = Math.max(s.meter, Math.floor(s.y));
  if (s.storm >= s.y) { s.doed = true; s.aarsag = 'uvejr'; haendt.taget = true; }
  return haendt;
}

/** Et sammenstød: koster et liv og det meste af farten – men kun, når man ikke lige har ramt. */
function skade(s, haendt, slags) {
  if (s.usaarlig > 0) return;
  s.liv--; s.ramt++;
  s.usaarlig = USAARLIG;
  s.fart *= 0.3;
  haendt.ramt = slags;
  if (s.liv <= 0) { s.doed = true; s.aarsag = 'skaer'; }
}

/* ---------- En spiller der kan sejle selv (bruges af testene) ---------- */

/**
 * Hvad skal roret lige nu? Botten kigger et par sekunder frem: den sejler turen
 * videre tre gange – drej venstre et kort stykke og hold så kursen, hold bare
 * kursen, drej højre og hold – og vælger det, der bringer den længst mod nord
 * uden at ramme noget. Drejet skal være *kort* (drejTid) og resten ligeud:
 * holdt man roret i bund hele horisonten, ville alle drej ende i en spiral, og
 * så ser det altid bedst ud at ligge stille – også i vindøjet, hvor man netop
 * skal falde af. Med det på plads finder botten selv ud af at krydse op mod
 * vinden: et ben på kryds giver simpelthen flere meter end at stampe.
 */
export function bot(s, horisont = 2.2, dt = 1 / 30, drejTid = 0.6) {
  const skridt = Math.round(horisont / dt);
  const drejSkridt = Math.round(drejTid / dt);
  const proev = ror => {
    const k = { ...s };
    let straf = 0;
    for (let i = 0; i < skridt && !k.doed; i++) {
      if (tik(k, dt, i < drejSkridt ? ror : 0).ramt) straf += 30;
    }
    if (k.doed) straf += 400;
    return k.y - straf;
  };
  const v = proev(-1), lige = proev(0), h = proev(1);
  if (v > lige && v >= h) return -1;
  if (h > lige) return 1;
  return 0;
}

/**
 * Sejler en hel tur igennem uden browser. `vaelg(s)` bestemmer roret (standard:
 * botten, spurgt hvert `beslutHver` sekund, så det ikke koster en formue).
 * Giver turen tilbage, når den er slut, eller tiden er gået.
 */
export function koer(seed, sekunder, vaelg = bot, dt = 1 / 60, beslutHver = 0.1) {
  const s = nySejlads(seed);
  let ror = 0, siden = Infinity;
  const N = Math.round(sekunder / dt);
  for (let i = 0; i < N && !s.doed; i++) {
    siden += dt;
    if (siden >= beslutHver) { ror = vaelg(s); siden = 0; }
    tik(s, dt, ror);
  }
  return s;
}
