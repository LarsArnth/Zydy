// Flaskehavet – flasken, havdyrene og farerne. Ren JS uden DOM, så index.html
// kun skal tegne, og det hele kan enhedstestes med `node --test test/unit/flaske.test.mjs`.
//
// Havet ses fra siden og regnes i meter: x er hvor langt flasken er drevet med
// strømmen (verden ruller mod venstre), y er dybden – 0 er vandspejlet og DYBDE
// er sandbunden. Flasken er en vandflaske: holder man på skærmen, dykker den,
// og slipper man, flyder den op igen – flasker flyder. Havdyrene svømmer ind i
// flasken, når man rammer dem, og bliver derinde; det er dem, der er scoren.
// Brandmænd og søpindsvin skal man uden om: tre stød, og flasken går i stykker.
//
// Strømmen tager til hele turen, og der kommer flere farer, jo længere man
// driver – det er dét, der til sidst gør turen færdig.

/* ---------- Tal man kan skrue på ---------- */
export const DYBDE = 30;           // havets dybde i meter
export const FLASKE_R = 1.1;       // flaskens radius ved fangst og sammenstød
export const FART0 = 5;            // m/s strømmen fører flasken med fra start
export const FART_STIGNING = 0.035;// m/s² – strømmen tager til hele turen
export const FART_MAKS = 16;       // så høj, at ingen kan blive ved – det er dét, der slutter turen
export const DYK = 26;             // m/s² nedad, mens man holder
export const OPDRIFT = 18;         // m/s² opad, når man slipper – flasker flyder
export const VY_MAKS = 10;         // flasken stiger og synker aldrig hurtigere
export const LIV = 3;
export const USAARLIG = 1.6;       // sekunder efter et stød, hvor det næste ikke koster
export const STYKKE = 24;          // havet genereres i stykker på så mange meter
export const HAV_FRA = 14;         // det første stykke begynder her – åbent vand først
export const SLOTS = 8;            // pladser pr. stykke: ét dyr eller én fare pr. plads

/* ---------- Dyrene og farerne ---------- */

// Havdyrene man kan fange. `bund: true` bor på sandet, resten svømmer frit.
export const ARTER = {
  fisk:         { r: 0.9,  navn: 'Fisk' },
  soehest:      { r: 0.85, navn: 'Søhest' },
  skildpadde:   { r: 1.25, navn: 'Skildpadde' },
  blaeksprutte: { r: 1.15, navn: 'Blæksprutte' },
  soestjerne:   { r: 0.8,  navn: 'Søstjerne', bund: true },
  krabbe:       { r: 0.85, navn: 'Krabbe', bund: true },
};
// Farerne. Brandmanden driver op og ned; søpindsvinet sidder på bunden.
export const FARER = {
  brandmand:   { r: 1.15, navn: 'brandmand' },
  soepindsvin: { r: 1.05, navn: 'søpindsvin' },
};

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

/** Hvor et dyr (eller en brandmand) er i højden lige nu – ren funktion af tiden. */
export const dyrY = (o, t) => o.y + Math.sin(o.fase + t * o.fq) * o.amp;

/* ---------- Havet, stykke for stykke ---------- */

// Stykkerne genereres ud fra frøet alene, så det samme hav kommer hver gang –
// og så botten (og en test) kan kigge frem uden at ændre noget.
const husk = new Map();

/**
 * Stykke nr. n af havet (n ≥ 0, fra x = HAV_FRA + n·STYKKE). Hver plads i
 * stykket har højst ét dyr eller én fare, og to farer står aldrig på
 * nabopladser – og aldrig på den sidste – så der altid er mindst ~4 meter
 * mellem to farer, også hen over skellet til næste stykke. Der kommer flere
 * farer, jo længere man kommer ud.
 */
export function stykke(seed, n) {
  const noegle = seed + ':' + n;
  if (husk.has(noegle)) return husk.get(noegle);
  const r = mulberry32((seed + Math.imul(n + 1, 0x9E3779B9)) >>> 0);
  const x0 = HAV_FRA + n * STYKKE;
  const bredde = STYKKE / SLOTS;
  const pladsX = slot => x0 + (slot + 0.2 + r() * 0.6) * bredde;

  // Farerne først: bland pladserne (uden den sidste) og tag dem, der holder afstand.
  const antalFarer = Math.min(5, Math.floor(n / 3) + (r() < 0.7 ? 1 : 0));
  const kandidater = [...Array(SLOTS - 1).keys()];
  for (let i = kandidater.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [kandidater[i], kandidater[j]] = [kandidater[j], kandidater[i]];
  }
  const fareSlots = [];
  for (const slot of kandidater) {
    if (fareSlots.length >= antalFarer) break;
    if (fareSlots.every(s2 => Math.abs(s2 - slot) >= 2)) fareSlots.push(slot);
  }
  const farer = fareSlots.map((slot, i) => {
    const x = pladsX(slot);
    if (r() < 0.45) {
      return { id: n + ':f' + i, slags: 'soepindsvin', x, y: DYBDE - 1.0,
        r: FARER.soepindsvin.r, amp: 0, fq: 0, fase: 0, froe: r() };
    }
    const amp = 2.5 + r() * 3.5;
    const y = 2.2 + amp + r() * (DYBDE - 4.4 - 2 * amp);
    // Langt ude pulserer brandmændene hurtigere, så de er sværere at time.
    const tempo = 1 + Math.min(1, n * 0.02);
    return { id: n + ':f' + i, slags: 'brandmand', x, y,
      r: FARER.brandmand.r, amp, fq: (0.35 + r() * 0.35) * tempo, fase: r() * Math.PI * 2, froe: r() };
  });

  // Så dyrene på de pladser, der er tilbage. Et dyr må ikke stå som lokkemad
  // lige oven i en fare – så vælger vi en anden højde (eller en anden art).
  const iFaelde = (x, y) => farer.some(f =>
    Math.abs(f.x - x) < 3.5 && Math.abs(f.y - y) < f.amp + 2.6);
  const dyrSlots = [...Array(SLOTS).keys()].filter(s2 => !fareSlots.includes(s2));
  for (let i = dyrSlots.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [dyrSlots[i], dyrSlots[j]] = [dyrSlots[j], dyrSlots[i]];
  }
  const antalDyr = Math.min(dyrSlots.length, 3 + Math.floor(r() * 3));
  const arterFrit = Object.keys(ARTER).filter(a => !ARTER[a].bund);
  const dyr = [];
  for (let i = 0; i < antalDyr; i++) {
    const x = pladsX(dyrSlots[i]);
    let art = r() < 0.34 ? 'fisk' : Object.keys(ARTER)[Math.floor(r() * 6)];
    if (ARTER[art].bund) {
      const y = DYBDE - 1.3 - r() * 0.5;
      if (iFaelde(x, y)) art = arterFrit[Math.floor(r() * arterFrit.length)];
      else {
        dyr.push({ id: n + ':d' + i, art, x, y, r: ARTER[art].r,
          amp: 0.1 + r() * 0.15, fq: 1.2 + r(), fase: r() * Math.PI * 2, froe: r() });
        continue;
      }
    }
    const amp = 0.5 + r() * 1.6;
    let y = 0;
    for (let forsoeg = 0; forsoeg < 8; forsoeg++) {
      y = 2.5 + amp + r() * (DYBDE - 6 - 2 * amp);
      if (!iFaelde(x, y)) break;
    }
    if (iFaelde(x, y)) continue;                       // pladsen er for farlig – så hellere tom
    dyr.push({ id: n + ':d' + i, art, x, y, r: ARTER[art].r,
      amp, fq: 0.8 + r() * 1.4, fase: r() * Math.PI * 2, froe: r() });
  }

  const ud = { n, x0, dyr, farer };
  if (husk.size > 4000) husk.clear();
  husk.set(noegle, ud);
  return ud;
}

/** Stykkerne tæt nok på x til at kunne ses eller svømmes ind i. */
export function naerStykker(seed, x, margen = 6) {
  const fra = Math.max(0, Math.floor((x - margen - HAV_FRA) / STYKKE));
  const til = Math.floor((x + margen - HAV_FRA) / STYKKE);
  const ud = [];
  for (let n = fra; n <= til; n++) ud.push(stykke(seed, n));
  return ud;
}

/* ---------- En tur ---------- */

/** En frisk flaske midt i vandet. Tilstanden kan kopieres med {...s, fanget: {...s.fanget}}. */
export function nyTur(seed) {
  return {
    seed: seed >>> 0, t: 0,
    x: 0, y: DYBDE * 0.45, vy: 0, fart: FART0,
    liv: LIV, usaarlig: 0, ramt: 0,
    fangst: 0, fanget: {},          // id → true for de dyr, der er i flasken
    doed: false, aarsag: null,      // 'brandmand' | 'soepindsvin'
  };
}

/**
 * Ét skridt på dt sekunder. `hold` er true, mens fingeren er på skærmen.
 * Giver hændelserne tilbage, så index.html kan lave lyd og pynt:
 *   { fanget: art|null, ramt: slags|null, knust }
 */
export function tik(s, dt, hold) {
  const e = { fanget: null, ramt: null, knust: false };
  if (s.doed) return e;
  s.t += dt;

  // Strømmen fører flasken – hurtigere og hurtigere.
  s.fart = Math.min(FART_MAKS, FART0 + FART_STIGNING * s.t);
  s.x += s.fart * dt;

  // Holder man, dykker flasken; slipper man, flyder den op.
  s.vy = klem(s.vy + (hold ? DYK : -OPDRIFT) * dt, -VY_MAKS, VY_MAKS);
  s.y += s.vy * dt;
  if (s.y < 1.0) { s.y = 1.0; if (s.vy < 0) s.vy = 0; }             // vandspejlet
  if (s.y > DYBDE - 0.9) { s.y = DYBDE - 0.9; if (s.vy > 0) s.vy = 0; } // sandbunden
  s.usaarlig = Math.max(0, s.usaarlig - dt);

  for (const st of naerStykker(s.seed, s.x, 5)) {
    for (const d of st.dyr) {
      if (s.fanget[d.id] || Math.abs(d.x - s.x) > 4) continue;
      if (Math.hypot(d.x - s.x, dyrY(d, s.t) - s.y) < FLASKE_R + d.r) {
        s.fanget[d.id] = true;
        s.fangst++;
        e.fanget = d.art;
      }
    }
    for (const f of st.farer) {
      if (Math.abs(f.x - s.x) > 4 || s.usaarlig > 0) continue;
      if (Math.hypot(f.x - s.x, dyrY(f, s.t) - s.y) < FLASKE_R * 0.85 + f.r) {
        s.liv--; s.ramt++;
        s.usaarlig = USAARLIG;
        e.ramt = f.slags;
        if (s.liv <= 0) { s.doed = true; s.aarsag = f.slags; e.knust = true; }
      }
    }
  }
  return e;
}

/* ---------- En spiller der kan spille selv (bruges af testene) ---------- */

/** Det nærmeste ufangede dyr forude – det er dét, botten svømmer efter. */
export function naesteDyr(s, raekkevidde = 18) {
  let bedst = null;
  for (const st of naerStykker(s.seed, s.x + raekkevidde / 2, raekkevidde / 2 + 4)) {
    for (const d of st.dyr) {
      if (s.fanget[d.id] || d.x < s.x - 1 || d.x > s.x + raekkevidde) continue;
      if (!bedst || d.x < bedst.x) bedst = d;
    }
  }
  return bedst;
}

/**
 * Skal fingeren holde lige nu? Botten prøver turen et lille stykke frem tre
 * gange – slip hele vejen, hold halvdelen, hold hele vejen – og vælger det, der
 * fanger mest og støder mindst; står det lige, trækker den mod det nærmeste
 * ufangede dyr. Det er nok til både at jage dyr og dykke under en brandmand.
 */
export function bot(s, horisont = 1.5, dt = 1 / 30) {
  const N = Math.round(horisont / dt);
  const maal = naesteDyr(s);
  const proev = andel => {
    const k = { ...s, fanget: { ...s.fanget } };
    const holdSkridt = Math.round(andel * N);
    let v = 0;
    for (let i = 0; i < N && !k.doed; i++) {
      const e = tik(k, dt, i < holdSkridt);
      if (e.fanget) v += 120;
      if (e.ramt) v -= 300;
    }
    if (k.doed) v -= 900;
    if (maal && !k.fanget[maal.id]) v -= Math.abs(dyrY(maal, k.t) - k.y) * 6;
    return v;
  };
  const slip = proev(0), lidt = proev(0.5), hold = proev(1);
  return Math.max(lidt, hold) > slip;
}

/**
 * Spiller en hel tur igennem uden browser. `vaelg(s)` bestemmer fingeren
 * (standard: botten, spurgt hvert `beslutHver` sekund, så det ikke koster en
 * formue). Giver turen tilbage, når den er slut, eller tiden er gået.
 */
export function koer(seed, sekunder, vaelg = bot, dt = 1 / 60, beslutHver = 0.1) {
  const s = nyTur(seed);
  let hold = false, siden = Infinity;
  const N = Math.round(sekunder / dt);
  for (let i = 0; i < N && !s.doed; i++) {
    siden += dt;
    if (siden >= beslutHver) { hold = vaelg(s); siden = 0; }
    tik(s, dt, hold);
  }
  return s;
}
