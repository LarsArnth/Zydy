// Elementløbet – banen, elementerne og reglerne. Ren JS uden DOM, så index.html
// kun skal tegne, og det hele kan enhedstestes med `node --test test/unit/elementer.test.mjs`.
//
// Sofies ønske: «et spil som handler om ild, jord, vand og vin[d] – de der fire
// elementer». Man løber automatisk fremad og ER et af de fire elementer; fire
// knapper skifter form. Hver forhindring klares af netop ét element:
// ild brænder tornekrattet, vand slukker bålet, vind flyver over floden, og
// jord står fast i hvirvelstormen. Forkert element koster et liv – tre liv, og
// løbet er slut. Det går hurtigere og hurtigere, og forhindringerne kommer
// tættere; scoren er hvor mange man klarede.
//
// Verden regnes i meter: x er hvor langt man er løbet. Banen genereres ud fra
// frøet alene og er ens hver gang – forhindringerne lægges med et fast antal
// SEKUNDERS mellemrum (ikke meter), så reaktionstiden er den samme, uanset hvor
// stærkt det går, og aldrig kortere end MELLEMRUM_MIN.

/* ---------- Tal man kan skrue på ---------- */
export const FART0 = 6;             // m/s fra start
export const FART_STIGNING = 0.045; // m/s² – det går hurtigere hele løbet
export const FART_MAKS = 15;        // farten har et loft
export const LIV = 3;
export const FRA_T = 3.5;           // første forhindring efter så mange sekunder
export const MELLEMRUM0 = 2.3;      // sekunder mellem forhindringer fra start
export const MELLEMRUM_MIN = 0.7;   // reaktionstiden bliver aldrig kortere end dette
export const MELLEMRUM_FALD = 0.018;// sekunder kortere pr. forhindring

/* ---------- De fire elementer (i Sofies rækkefølge) og forhindringerne ---------- */
export const ELEMENTER = {
  ild:  { navn: 'Ild',  tegn: '🔥' },
  jord: { navn: 'Jord', tegn: '🪨' },
  vand: { navn: 'Vand', tegn: '💧' },
  vind: { navn: 'Vind', tegn: '💨' },
};
export const RAEKKEFOELGE = ['ild', 'jord', 'vand', 'vind'];

// Hver forhindring klares af netop ét element. `raab` er ordet, der popper op.
export const FORHINDRINGER = {
  krat:  { klares: 'ild',  navn: 'tornekrattet',   raab: 'FUT!',   bredde: 1.6 },
  baal:  { klares: 'vand', navn: 'bålet',          raab: 'PSSSH!', bredde: 1.8 },
  flod:  { klares: 'vind', navn: 'floden',         raab: 'SUUUS!', bredde: 3.2 },
  storm: { klares: 'jord', navn: 'hvirvelstormen', raab: 'BOMP!',  bredde: 2.0 },
};
export const TYPER = Object.keys(FORHINDRINGER);

/* ---------- Tilfældighed man kan gentage ---------- */
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- Farten og hvor langt man er nået ---------- */

/** Farten til tiden t – stiger jævnt og rammer loftet. */
export const fartVedT = t => Math.min(FART_MAKS, FART0 + FART_STIGNING * t);

/** Hvor langt man er løbet efter t sekunder (integralet af farten). */
export function xVedT(t) {
  const tKnaek = (FART_MAKS - FART0) / FART_STIGNING;
  if (t <= tKnaek) return FART0 * t + 0.5 * FART_STIGNING * t * t;
  return FART0 * tKnaek + 0.5 * FART_STIGNING * tKnaek * tKnaek + (t - tKnaek) * FART_MAKS;
}

/* ---------- Banen, forhindring for forhindring ---------- */

// Forhindringerne genereres i rækkefølge ud fra frøet alene, så den samme bane
// kommer hver gang – og så en test kan kigge frem uden at ændre noget.
const husk = new Map();

/**
 * Forhindring nr. n (n ≥ 0): { n, t, x, slags, klares }. Mellemrummet mellem to
 * forhindringer måles i sekunder og skrumper med n, men aldrig under
 * MELLEMRUM_MIN – så der altid er tid til at nå knappen. To ens forhindringer
 * i træk undgås for det meste, så man faktisk skal skifte element.
 */
export function forhindring(seed, n) {
  const noegle = seed >>> 0;
  let bane = husk.get(noegle);
  if (!bane) {
    bane = { r: mulberry32(noegle), liste: [] };
    if (husk.size > 64) husk.clear();
    husk.set(noegle, bane);
  }
  while (bane.liste.length <= n) {
    const i = bane.liste.length;
    const forrige = bane.liste[i - 1];
    const basis = Math.max(MELLEMRUM_MIN, MELLEMRUM0 - i * MELLEMRUM_FALD);
    const mellemrum = Math.max(MELLEMRUM_MIN, basis * (0.9 + bane.r() * 0.35));
    const t = i === 0 ? FRA_T : forrige.t + mellemrum;
    let slags = TYPER[Math.floor(bane.r() * TYPER.length)];
    if (forrige && slags === forrige.slags && bane.r() < 0.8) {
      slags = TYPER[(TYPER.indexOf(slags) + 1 + Math.floor(bane.r() * (TYPER.length - 1))) % TYPER.length];
    }
    bane.liste.push({ n: i, t, x: xVedT(t), slags, klares: FORHINDRINGER[slags].klares });
  }
  return bane.liste[n];
}

/** Forhindringerne fra nr. `fra` og frem, så langt øjet rækker (til tegning). */
export function forhindringerFrem(seed, fra, tilX) {
  const ud = [];
  for (let n = Math.max(0, fra); ; n++) {
    const f = forhindring(seed, n);
    if (f.x > tilX) break;
    ud.push(f);
  }
  return ud;
}

/* ---------- Et løb ---------- */

/** Et frisk løb. Man starter som jord – tungt og trygt. */
export function nyTur(seed) {
  return {
    seed: seed >>> 0, t: 0,
    x: 0, fart: FART0,
    element: 'jord',
    liv: LIV, klaret: 0, stime: 0, bedsteStime: 0,
    naeste: 0,                      // nr. på den forhindring, man møder næste gang
    loest: {},                      // n → true (klaret) / false (ramt) – til tegningen
    doed: false, aarsag: null,      // 'krat' | 'baal' | 'flod' | 'storm'
  };
}

/**
 * Ét skridt på dt sekunder. `valg` er det element, knapperne peger på lige nu
 * (null = bliv som du er). Giver hændelserne tilbage, så index.html kan lave
 * pynt: { klaret: forhindring|null, ramt: forhindring|null, slut }
 */
export function tik(s, dt, valg = null) {
  const e = { klaret: null, ramt: null, slut: false };
  if (s.doed) return e;
  if (valg && ELEMENTER[valg]) s.element = valg;
  s.t += dt;
  s.fart = fartVedT(s.t);
  s.x += s.fart * dt;

  while (!s.doed) {
    const f = forhindring(s.seed, s.naeste);
    if (s.x < f.x) break;
    if (s.element === f.klares) {
      s.klaret++;
      s.stime++;
      s.bedsteStime = Math.max(s.bedsteStime, s.stime);
      s.loest[f.n] = true;
      e.klaret = f;
    } else {
      s.liv--;
      s.stime = 0;
      s.loest[f.n] = false;
      e.ramt = f;
      if (s.liv <= 0) { s.doed = true; s.aarsag = f.slags; e.slut = true; }
    }
    s.naeste++;
  }
  return e;
}

/** Den forhindring, man møder næste gang – det er dén, botten (og HUD'en) ser på. */
export const naesteForhindring = s => forhindring(s.seed, s.naeste);

/* ---------- En spiller der kan spille selv (bruges af testene) ---------- */

/**
 * Botten ser den næste forhindring og svarer med det rigtige element. Den er
 * perfekt med vilje: kaldt tit nok viser den, at banen altid KAN klares –
 * begrænsningen ligger i, hvor tit `koer` spørger den (beslutHver).
 */
export const bot = s => naesteForhindring(s).klares;

/**
 * Spiller et løb igennem uden browser. `vaelg(s)` bestemmer elementet
 * (standard: botten, spurgt hvert `beslutHver` sekund – som en finger, der ikke
 * kan være alle steder på én gang). Giver løbet tilbage, når det er slut,
 * eller tiden er gået.
 */
export function koer(seed, sekunder, vaelg = bot, dt = 1 / 60, beslutHver = 0.25) {
  const s = nyTur(seed);
  let valg = null, siden = Infinity;
  const N = Math.round(sekunder / dt);
  for (let i = 0; i < N && !s.doed; i++) {
    siden += dt;
    if (siden >= beslutHver) { valg = vaelg(s); siden = 0; }
    tik(s, dt, valg);
  }
  return s;
}
