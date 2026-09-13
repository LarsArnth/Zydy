// Weeee! – bakken, kælken og lavinen. Ren JS uden DOM, så index.html kun skal
// tegne, og fysikken kan enhedstestes med `node --test test/unit/weee.test.mjs`.
//
// Alt regnes i meter med y opad: bakken er en uendelig kurve h(x), der hælder
// nedad og bølger op og ned. Kælken kører mod højre og har to tilstande:
//
//   på jorden  – farten følger skråningen: nedad giver fart, opad tager fart.
//   i luften   – almindeligt kast, indtil man rammer bakken igen.
//
// Hele spillet er ét tryk, og det betyder to ting:
//
//   på jorden  – man trykker sig ned i sneen: mere fart ned ad bakken
//                (TUNG), men man letter ikke, så længe man holder.
//   i luften   – man dykker (TUNG) og kan nå at få næsen ned, så landingen
//                bliver parallel med bakken.
//
// Derfor er kunsten: **hold nede i dalene, slip på toppene**. Slipper man lige
// før en bakketop, letter man – og det er dér, man råber weeee. At flyve er
// hurtigere end at køre, fordi sneen bremser meget mere end luften; til gengæld
// koster en skæv landing det meste af farten. Derfor er `lettet`/`landet` de
// vigtigste hændelser her: de er både pynten og hele pointsystemet.
//
// Bagved kommer lavinen, som kun kan holdes væk med fart.

/* ---------- Tal man kan skrue på ---------- */
export const G = 20;               // tyngdekraft, m/s²
export const TUNG = 2.6;           // så meget tungere bliver man, mens man trykker sig ned
export const START_FART = 14;      // m/s ved afgang
export const MAKS_FART = 58;       // ingen kælk kører hurtigere end det (209 km/t)
export const JORD_GNID = 1.5;      // gnidning mod sneen, m/s²
export const JORD_MOD = 0.029;     // … og lidt mere, jo hurtigere man kører
export const LUFT_MOD = 0.002;     // luftmodstand i luften (meget mindre – derfor betaler det sig at flyve)
export const PERFEKT = 0.82;       // landingskvalitet der tæller som perfekt
export const PERFEKT_SKUB = 1.12;  // … og giver 12 % mere fart
export const LUFT_MIN = 0.3;       // så længe skal man være i luften, før hoppet tæller
export const HÆLD = 1.25;          // bjergsiden falder 1,25 m for hver meter frem – den er stejl

// Lavinen: starter langt bagude, bliver hurtigere og hurtigere, men sakker
// aldrig mere end LAV_HALE bagud – ellers ville et godt løb aldrig være farligt.
export const LAV_START_X = -70;
export const LAV_FART = 10;
export const LAV_STIGNING = 0.35;  // m/s hurtigere pr. sekund
export const LAV_MAKS = 60;
export const LAV_HALE = 70;

/** Bølgerne bakken er lavet af: [bølgelængde i meter, højde i meter]. */
const LAG = [[46, 7], [23, 0.8], [13, 0.25]];

/* ---------- Tilfældighed man kan gentage ---------- */
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- Bakken ---------- */

/**
 * En uendelig bakke ud fra et frø. Giver `h(x)` (højden), `hæld(x)`
 * (hældningen) og `krum(x)` (krumningen) – alle tre regnet ud analytisk, ingen
 * tilnærmelse. `krum` er den, der fortæller, om man står i en dal (positiv)
 * eller på vej over en top (negativ), og det er hele styringens hemmelighed.
 *
 * Bølgerne er med vilje små i forhold til, hvor meget bjerget falder (HÆLD):
 * det går nedad hele vejen, så man kan aldrig komme til at stå fast i en dal og
 * vente på lavinen. Det tjekker enhedstesten. Til gengæld skal bølgerne være
 * krumme nok til, at man kan lette på kanten af dem – det er balancen mellem
 * bølgehøjde og bølgelængde i LAG.
 *
 * Bakken forskydes, så x = 0 er det sted i de første 60 meter, hvor det går
 * stejlest nedad: så kommer man i gang med det samme.
 */
export function lavBakke(seed) {
  const r = mulberry32(seed >>> 0);
  const faser = LAG.map(() => r() * Math.PI * 2);
  const led = (x, i) => (2 * Math.PI * x) / LAG[i][0] + faser[i];
  const rå = x => {
    let y = -HÆLD * x;
    for (let i = 0; i < LAG.length; i++) y += LAG[i][1] * Math.sin(led(x, i));
    return y;
  };
  const råHæld = x => {
    let s = -HÆLD;
    for (let i = 0; i < LAG.length; i++) s += LAG[i][1] * ((2 * Math.PI) / LAG[i][0]) * Math.cos(led(x, i));
    return s;
  };
  const råKrum = x => {
    let k = 0;
    for (let i = 0; i < LAG.length; i++) k -= LAG[i][1] * ((2 * Math.PI) / LAG[i][0]) ** 2 * Math.sin(led(x, i));
    return k;
  };
  let start = 0;
  for (let x = 0; x < 60; x += 0.5) if (råHæld(x) < råHæld(start)) start = x;
  return {
    seed: seed >>> 0,
    h: x => rå(x + start),
    hæld: x => råHæld(x + start),
    krum: x => råKrum(x + start),
  };
}

/* ---------- En tur ---------- */

/** En frisk kælk øverst på bakken. */
export function nyTur(seed) {
  const bakke = lavBakke(seed);
  return {
    bakke,
    seed: bakke.seed,
    t: 0,                      // sekunder siden start
    x: 0, y: bakke.h(0),       // hvor kælken er
    vx: START_FART, vy: 0,
    paa: true,                 // står den på sneen?
    vinkel: Math.atan(bakke.hæld(0)),
    luft: 0,                   // sekunder i luften lige nu
    længsteLuft: 0,
    hop: 0,                    // hop der varede mindst LUFT_MIN
    perfekte: 0,
    lavine: LAV_START_X,
    meter: 0,
    doed: false,
  };
}

/** Farten langs skråningen, uanset om man er i luften eller ej. */
export const fart = s => Math.hypot(s.vx, s.vy);

/** Lavinens fart lige nu – den bliver ved med at stige, til den rammer loftet. */
export const lavineFart = t => Math.min(LAV_MAKS, LAV_FART + LAV_STIGNING * t);

/** Hvor godt en landing passer til bakken: 1 = helt parallelt, 0 = på tværs. */
export function landingsKvalitet(vx, vy, hældning) {
  const forskel = Math.abs(Math.atan2(vy, vx) - Math.atan(hældning));
  return Math.max(0, 1 - forskel / 0.95);
}

/**
 * Ét skridt på dt sekunder. `holder` er om fingeren er nede.
 * Giver hændelserne tilbage, så index.html kan lave lyd og pynt:
 *   { lettet, landet: {kvalitet, fart, luft, perfekt} | null, doed }
 */
export function tik(s, dt, holder) {
  const hændt = { lettet: false, landet: null, doed: false };
  if (s.doed) return hændt;
  s.t += dt;
  s.holder = !!holder;

  if (s.paa) jordSkridt(s, dt, !!holder, hændt);
  else luftSkridt(s, dt, G * (holder ? TUNG : 1), hændt);

  // Lavinen kommer bagfra – og bliver trukket med, hvis man er langt foran.
  s.lavine = Math.max(s.lavine + lavineFart(s.t) * dt, s.x - LAV_HALE);
  s.meter = Math.max(s.meter, Math.floor(s.x));
  if (s.lavine >= s.x) { s.doed = true; hændt.doed = true; }
  return hændt;
}

/**
 * På sneen: farten følger skråningen. Holder man fingeren nede, trækker bakken
 * hårdere (TUNG) – men man bliver også klæbet fast, så man ikke
 * letter. Slipper man, letter man i samme øjeblik bakken falder hurtigere væk,
 * end tyngdekraften kan trække en ned; det sker netop på toppene.
 */
function jordSkridt(s, dt, holder, hændt) {
  const g = G * (holder ? TUNG : 1);
  const hæld = s.bakke.hæld(s.x);
  const længde = Math.sqrt(1 + hæld * hæld);       // 1 m frem svarer til så mange meter skråning
  let v = s.vx * længde;                           // farten langs skråningen

  v += (-g * hæld / længde) * dt;                  // tyngdekraften langs bakken
  v -= Math.sign(v) * JORD_GNID * dt;              // gnidning …
  v -= JORD_MOD * v * Math.abs(v) * dt;            // … og modstand, der vokser med farten
  v = Math.max(-MAKS_FART, Math.min(MAKS_FART, v));

  const vx = v / længde, vy = (v * hæld) / længde;
  const nyX = s.x + vx * dt;
  const jordFald = s.bakke.h(nyX) - s.bakke.h(s.x);
  const friFald = vy * dt - 0.5 * G * dt * dt;
  if (!holder && jordFald < friFald && vx > 0) {
    s.vx = vx; s.vy = vy; s.paa = false; s.luft = 0;
    hændt.lettet = true;
    luftSkridt(s, dt, G, hændt);
    return;
  }
  s.x = nyX; s.y = s.bakke.h(nyX);
  s.vx = vx; s.vy = vy;
  s.vinkel = Math.atan(s.bakke.hæld(nyX));
}

/**
 * I luften: almindeligt kast, indtil sneen er der igen. Højden regnes med
 * `vy·dt − ½g·dt²` og ikke bare `vy·dt` – præcis den samme formel som
 * `friFald` i jordSkridt. Ellers falder man i det første skridt dobbelt så
 * meget, som betingelsen for at lette regnede med, og så lander man med det
 * samme igen: hoppene blev ét enkelt skridt lange, og man kom aldrig i luften.
 */
function luftSkridt(s, dt, g, hændt) {
  s.vx -= LUFT_MOD * s.vx * Math.abs(s.vx) * dt;
  s.x += s.vx * dt;
  s.y += s.vy * dt - 0.5 * g * dt * dt;
  s.vy -= g * dt;
  // Samme fartgrænse i luften som på sneen, så tallet i HUD'en betyder det samme.
  const v = Math.hypot(s.vx, s.vy);
  if (v > MAKS_FART) { s.vx *= MAKS_FART / v; s.vy *= MAKS_FART / v; }
  s.luft += dt;
  s.længsteLuft = Math.max(s.længsteLuft, s.luft);
  s.vinkel = Math.atan2(s.vy, s.vx);
  const jord = s.bakke.h(s.x);
  if (s.y > jord) return;
  land(s, jord, hændt);
}

/** Landingen: jo mere parallelt med bakken, jo mere af farten får man med videre. */
function land(s, jord, hændt) {
  const hæld = s.bakke.hæld(s.x);
  const kvalitet = landingsKvalitet(s.vx, s.vy, hæld);
  const perfekt = kvalitet >= PERFEKT && s.luft >= LUFT_MIN;
  let v = fart(s) * (0.5 + 0.5 * kvalitet);
  if (perfekt) { v *= PERFEKT_SKUB; s.perfekte++; }
  v = Math.min(MAKS_FART, v);

  const længde = Math.sqrt(1 + hæld * hæld);
  s.y = jord;
  s.vx = v / længde;
  s.vy = (v * hæld) / længde;
  s.paa = true;
  s.vinkel = Math.atan(hæld);
  if (s.luft >= LUFT_MIN) s.hop++;
  hændt.landet = { kvalitet, fart: v, luft: s.luft, perfekt };
  s.luft = 0;
}

/* ---------- En spiller der kan køre selv (bruges af testene) ---------- */

/**
 * Skal fingeren være nede lige nu? Botten kigger et par sekunder frem: den
 * spiller turen videre to gange – én hvor den holder, og én hvor den slipper –
 * og vælger det, der bringer den længst. Intet klogere end det.
 *
 * Det er med vilje ikke en håndskreven regel («hold i dalene, slip på toppene»):
 * en regel kan være god eller dårlig, mens et kig fremad er en målestok. Det er
 * dén, `test/unit/weee.test.mjs` bruger til at vise, at det kan betale sig at
 * flyve – en spiller, der bare holder fingeren nede hele vejen, kommer kortere.
 */
export function bot(s, horisont = 2.5, dt = 1 / 60) {
  const skridt = Math.round(horisont / dt);
  const prøv = holder => {
    const k = { ...s };
    for (let i = 0; i < skridt && !k.doed; i++) tik(k, dt, holder);
    return k.x;
  };
  return prøv(true) > prøv(false);
}

/**
 * Kører en hel tur igennem uden browser. `vælg(s)` bestemmer fingeren
 * (standard: botten). Giver turen tilbage, når den er død, eller tiden er gået.
 */
export function kør(seed, sekunder, vælg = bot, dt = 1 / 120) {
  const s = nyTur(seed);
  for (let i = 0; i < Math.round(sekunder / dt) && !s.doed; i++) tik(s, dt, !!vælg(s));
  return s;
}
