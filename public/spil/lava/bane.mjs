/*
  Motoren bag «Gulvet er lava» – fysikken og stuen, der bliver ved opad.

  Alt regnes i enheder, og 1 enhed = 1 meter i spillet: stuen er 9 meter bred,
  spilleren er godt en meter høj, og højden man når, er den score der ryger på
  toplisten. Filen holder sig til tal og rene funktioner (ingen DOM og intet
  canvas), så banen kan enhedstestes uden browser – se test/unit/lava.test.mjs.

  Det vigtigste, generatoren lover: **hver eneste møbel kan nås fra rækken
  under**. Beviset ligger i gabMaks(): et hop lander, når man falder ned gennem
  den nye højde, og indtil da har man nået VX * tNed(dy) vandret. Man skal
  bruge en spillerbredde af den strækning bare på at komme fri af den ene kant
  og ind over den anden, så den trækkes fra – og af resten bruger vi kun 75 %
  (GAB_K), så der er luft til at ramme skævt.

  Er der to møbler i en række, må der højst være PAR_GAB_MAKS mellem dem.
  Det er ikke pynt: næste række skal kunne nås fra dem *begge*, og med den
  grænse findes der altid et sted at stille et møbel på W_MIN i bredden
  (PAR_GAB_MAKS ≤ W_MIN + 2·gabMaks(DY_MAKS)).
*/

/* ---------- Stuen og spilleren ---------- */
export const RUM = 9;               // stuens bredde
export const KANT = 0.35;           // luft ind til væggen
export const SP_B = 0.78, SP_H = 1.18;   // spillerens kasse

/* ---------- Fysik ---------- */
export const VX = 5.2;              // løbefart (enheder/sekund)
export const H_HOP = 2.6;           // hoppets højde
export const T_OP = 0.42;           // sekunder op til toppen af hoppet
export const G = (2 * H_HOP) / (T_OP * T_OP);
export const VJ = G * T_OP;         // afsæt
export const TRAMPOLIN = 1.45;      // puffen ganger afsættet
export const COYOTE = 0.09;         // sekunder man stadig må hoppe efter kanten
export const BUFFER = 0.13;         // et tryk lige før landing gemmes

/* ---------- Banen ---------- */
export const DY_MIN = 1.45, DY_MAKS = 2.15;   // afstand op til næste række
export const GAB_K = 0.75;          // hvor meget af den frie rækkevidde vi tør bruge
export const PAR_GAB_MAKS = 3.8;    // højst så langt mellem to møbler i samme række
export const W_MIN = 1.0;           // smalleste møbel generatoren nøjes med
export const KASSE_TID = 1.15;      // sekunder før en flyttekasse styrter i lavaen
export const FRYS_TID = 3.2;        // sekunder en isterning holder lavaen nede
export const IS_HOEJDE = 0.95;      // isterningen svæver så meget over møblet

/* ---------- Lavaen ---------- */
export const LAVA_START = -1.7;     // lavaen begynder under gulvet
// Lavaen sakker aldrig mere end LAVA_HALE bagud. Det er både spænding og
// tydelighed: den skal blive ved med at kunne ses i bunden af skærmen, ellers
// glemmer man, hvad man flygter fra. Til gengæld dør man af at falde så langt.
export const LAVA_HALE = 5.5;

/** Lavaens fart i enheder/sekund, når spilleren er nået `h` meter op. */
export const lavaFart = h => Math.min(2.2, 0.7 + 0.011 * Math.max(0, h));

/* ---------- Møblerne ---------- */
/*
  `krop` er hvor højt møblet er tegnet under sin overside; den klippes til, så
  et møbel aldrig gror ned i det, der står under. `vaegt` er hvor tit møblet
  vælges — smalle møbler kommer mest, når det er blevet svært.
*/
export const MOEBLER = [
  { id: 'sofa',    min: 2.8, maks: 3.8, krop: 0.95, vaegt: 10 },
  { id: 'seng',    min: 3.0, maks: 3.9, krop: 0.80, vaegt: 5 },
  { id: 'bord',    min: 2.2, maks: 3.1, krop: 1.05, vaegt: 10 },
  { id: 'reol',    min: 1.8, maks: 2.6, krop: 1.85, vaegt: 9 },
  { id: 'kommode', min: 1.6, maks: 2.3, krop: 1.25, vaegt: 8 },
  { id: 'tvbord',  min: 2.0, maks: 2.7, krop: 0.75, vaegt: 6 },
  { id: 'klaver',  min: 2.4, maks: 3.0, krop: 1.35, vaegt: 4 },
  { id: 'stol',    min: 1.1, maks: 1.5, krop: 1.00, vaegt: 7, smal: true },
  { id: 'hylde',   min: 1.3, maks: 2.0, krop: 0.22, vaegt: 7, smal: true },
  { id: 'puf',     min: 1.4, maks: 1.9, krop: 0.60, vaegt: 4, smal: true, hopper: true },
  { id: 'kasse',   min: 1.2, maks: 1.8, krop: 0.90, vaegt: 6, smal: true, styrter: true, kunPar: true },
];

/* ---------- Regnestykker ---------- */

/** Seedbar tilfældighed, så ?seed=123 giver den samme stue hver gang. */
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Hvor lang tid går der, fra man sætter af, til man falder ned gennem højden
 * `dy` over afsættet? Det er dér, man lander på et møbel. null hvis hoppet
 * slet ikke når så højt op.
 */
export function tNed(dy) {
  const d = VJ * VJ - 2 * G * dy;
  return d < 0 ? null : (VJ + Math.sqrt(d)) / G;
}

/** Hvor langt rækker et hop vandret, når det skal ende `dy` højere oppe? */
export function raekkevidde(dy) {
  const t = tNed(dy);
  return t == null ? 0 : VX * t;
}

/** Vandret afstand mellem to møblers kanter (0 hvis de overlapper). */
export const gabMellem = (a, b) => Math.max(0, b.x - (a.x + a.w), a.x - (b.x + b.w));

/**
 * Hvor stort et gab tør vi lave op til en række, der ligger `dy` højere?
 * Spillerens egen bredde går fra, for man starter med venstre kant på kanten
 * af det ene møbel og skal have hele kroppen ind over det næste.
 */
export const gabMaks = dy => Math.max(0.4, GAB_K * raekkevidde(dy) - SP_B);

/** Kan man hoppe fra møblet `a` op på møblet `b`? */
export const naaesFra = (a, b) =>
  b.y - a.y <= H_HOP - 0.2 && gabMellem(a, b) <= gabMaks(b.y - a.y) + 1e-9;

/* ---------- Generatoren ---------- */

/** Det x-interval hvor et møbel på `w` i bredden kan nås fra hele rækken `forrige`. */
function omraade(forrige, w, gab) {
  let lo = KANT, hi = RUM - KANT - w;
  for (const p of forrige) {
    lo = Math.max(lo, p.x - w - gab);
    hi = Math.min(hi, p.x + p.w + gab);
  }
  return hi >= lo ? [lo, hi] : null;
}

/** Vælger et møbel efter vægt. Smalle møbler bliver hyppigere, jo sværere det er. */
function vaelgMoebel(rnd, diff, maaVaereKasse) {
  const kan = MOEBLER.filter(m => (m.kunPar ? maaVaereKasse : true));
  const vaegt = m => m.vaegt * (m.smal ? 0.45 + 0.9 * diff : 1.35 - 0.6 * diff);
  const sum = kan.reduce((s, m) => s + vaegt(m), 0);
  let r = rnd() * sum;
  for (const m of kan) { r -= vaegt(m); if (r <= 0) return m; }
  return kan[kan.length - 1];
}

/** Ét møbel: vælg slags og bredde, og skub bredden ned til der er plads. */
function byg(forrige, y, dy, gab, rnd, diff, nr, maaVaereKasse, undgaa) {
  const m = vaelgMoebel(rnd, diff, maaVaereKasse);
  let w = Math.max(W_MIN, (m.min + rnd() * (m.maks - m.min)) * (1 - 0.22 * diff));
  let valg = pladser(forrige, w, gab, undgaa);
  while (!valg.length && w > W_MIN + 1e-6) {
    w = Math.max(W_MIN, w - 0.3);
    valg = pladser(forrige, w, gab, undgaa);
  }
  if (!valg.length) return null;                 // kun muligt for møbel nr. 2 i rækken

  // Zigzag: sigt efter den side af stuen, man ikke kom fra.
  const midte = forrige.reduce((s, p) => s + p.x + p.w / 2, 0) / forrige.length;
  const modHoejre = midte < RUM / 2;
  const [lo, hi] = valg.length === 1 ? valg[0]
    : valg[modHoejre ? valg.length - 1 : 0];     // to muligheder (venstre/højre for makkeren)
  const t = modHoejre ? 0.45 + 0.55 * rnd() : 0.55 * rnd();
  const x = lo + t * (hi - lo);

  return {
    nr, x, w, y,
    slags: m.id,
    krop: Math.max(0.18, Math.min(m.krop, dy - 0.3)),
    hopper: !!m.hopper,
    styrter: !!m.styrter,
    is: false,
    f: rnd(),                                    // fast tilfældigt tal til pynt (farve, puder …)
  };
}

/** Mulige x-intervaller. Med `undgaa` skal møblet holde afstand til makkeren i rækken. */
function pladser(forrige, w, gab, undgaa) {
  const grund = omraade(forrige, w, gab);
  if (!grund) return [];
  if (!undgaa) return [grund];
  const [lo, hi] = grund;
  const ud = [];
  // Til venstre for makkeren – og ikke længere væk end PAR_GAB_MAKS
  const vLo = Math.max(lo, undgaa.x - PAR_GAB_MAKS - w), vHi = Math.min(hi, undgaa.x - 0.6 - w);
  if (vHi >= vLo) ud.push([vLo, vHi]);
  // Til højre for makkeren
  const hLo = Math.max(lo, undgaa.x + undgaa.w + 0.6), hHi = Math.min(hi, undgaa.x + undgaa.w + PAR_GAB_MAKS);
  if (hHi >= hLo) ud.push([hLo, hHi]);
  return ud;
}

/** Næste række møbler over `forrige`. Altid mindst ét, nogle gange to. */
export function naesteRaekke(forrige, nr, rnd) {
  const diff = Math.min(1, nr / 60);
  const dy = DY_MIN + rnd() * (DY_MAKS - DY_MIN) * (0.5 + 0.5 * diff);
  const y = forrige[0].y + dy;
  const gab = gabMaks(dy);
  const par = nr >= 4 && rnd() < 0.3;

  // Flyttekassen styrter, når man har stået på den, så den må aldrig være den
  // eneste vej videre – derfor kun i en række med to møbler, og kun som nr. 2.
  const raekke = [byg(forrige, y, dy, gab, rnd, diff, nr, false, null)];
  if (par) {
    const to = byg(forrige, y, dy, gab, rnd, diff, nr, rnd() < 0.45, raekke[0]);
    if (to) raekke.push(to);
  }
  if (nr >= 5 && rnd() < 0.15) raekke[Math.floor(rnd() * raekke.length)].is = true;
  return raekke;
}

/** Gulvet – det der bliver til lava. Række 0. */
export function gulvet() {
  return [{ nr: 0, x: 0, w: RUM, y: 0, slags: 'gulv', krop: 0.6, hopper: false, styrter: false, is: false, f: 0 }];
}

/**
 * En bane man kan vokse opad efter behov.
 *   const bane = opretBane(7);
 *   bane.voksTil(20);       // sørg for at der er møbler op til række 20
 *   bane.raekker[3]         // → [møbel, …]
 *   bane.alle               // alle møbler i én liste
 */
export function opretBane(seed) {
  const rnd = mulberry32(seed >>> 0);
  const raekker = [gulvet()];
  return {
    raekker,
    get top() { return raekker[raekker.length - 1]; },
    get alle() { return raekker.flat(); },
    voksTil(nr) {
      while (raekker.length <= nr) raekker.push(naesteRaekke(raekker[raekker.length - 1], raekker.length, rnd));
      return this;
    },
  };
}
