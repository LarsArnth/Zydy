// Skråningen – banen, kuglen og en bot. Ren JS uden browser, så det hele kan
// enhedstestes:  node --test test/unit/skraaning.test.mjs
//
// Lykkes ønske: «Et spil der minder lidt om slope måske». Som i forbilledet
// ruller en kugle af sig selv ned ad en neonbane, der hænger i luften. Man
// styrer kun til venstre og højre, farten stiger hele tiden, og man skal hverken
// falde ud over kanten eller ramme de røde klodser. Score = meter.
//
// Koordinater i meter: z er fremad (ned ad bakken), x er til siden og y er op.
// Banen er en række stykker efter hinanden. Hvert stykke har en midterlinje
// (x0 + dx·(z − z0), y0 + sl·(z − z0)), en bredde w og måske en hældning til
// siden (k). Et hul er et stykke uden gulv, og stykket efter ligger lavere.
//
// Tre løfter holder banen fair, og enhedstesten holder øje med dem:
//   1. **Farten afhænger kun af hvor langt man er nået** (fart(z)), så
//      banegeneratoren ved præcis, hvor hurtigt man kører på hvert sted.
//   2. **Man kan altid nå hen til hullet i en klodsrække**: to rækker ligger
//      aldrig så tæt, at man ikke kan styre fra det ene hul til det næste med
//      halv kraft (NAA), og den første række på et stykke kan nås, uanset hvor
//      på banen man kom ind.
//   3. **Et hul kan altid springes**: stykket bagefter ligger så meget lavere,
//      at kuglen når over kanten, selv ved den laveste fart på stedet.

export const R = 0.5;                  // kuglens radius
export const G = 26;                   // tyngdekraft (lidt mere end den rigtige – det føles bedre)
export const START_FART = 11;          // m/s ved start
export const MAKS_FART = 34;           // m/s, som man nærmer sig men aldrig når
export const FART_Z = 2500;            // meter, før farten er ~63 % af vejen op
export const SIDE_MAKS = 9;            // m/s til siden med styringen helt ude
export const STYR = 7;                 // så hurtigt følger kuglen styringen (1/s)
export const BANK_TRYK = 1;            // hvor meget en skrå bane skubber (brøkdel af G·k)
export const NAA = SIDE_MAKS * 0.5;    // m/s til siden, banen regner med at man kan
export const TRIN = 1.2;               // så højt et trin kan kuglen rulle op ad
export const TYK = 0.8;                // banens tykkelse – rammer man siden, er det slut
export const DOED_FALD = 9;            // meter under banen, før man er faldet af
export const SVAER_Z = 3000;           // meter, før banen er så svær som den bliver
export const START_Z = 2;
export const BLOK_H = 1.15;            // klodsernes højde – de kan ikke springes over

const klem = (v, a, b) => Math.max(a, Math.min(b, v));

/** Farten på et bestemt sted på banen. Stiger hele vejen, men når aldrig MAKS_FART. */
export function fart(z) {
  return START_FART + (MAKS_FART - START_FART) * (1 - Math.exp(-Math.max(0, z) / FART_Z));
}

/** 0 ved start, 1 fra SVAER_Z og frem. */
export const svaerhed = z => klem(z / SVAER_Z, 0, 1);

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- Et stykke bane ---------- */

export const midtX = (p, z) => p.x0 + (z - p.z0) * p.dx;
export const midtY = (p, z) => p.y0 + (z - p.z0) * p.sl;

/** Sidehældningen på et bestemt sted: den glider ind og ud, så der ikke kommer et trin. */
export function kVed(p, z) {
  if (!p.k) return 0;
  const u = (z - p.z0) / (p.z1 - p.z0);
  let r = u < 0.25 ? u / 0.25 : u > 0.75 ? (1 - u) / 0.25 : 1;
  r = klem(r, 0, 1);
  return p.k * r * r * (3 - 2 * r);
}

/** En klods' midte til siden – de glidende bevæger sig frem og tilbage med tiden. */
export const blokX = (bl, t) => bl.glid ? bl.x + bl.glid.amp * Math.sin(bl.glid.w * t + bl.glid.fase) : bl.x;

/* ---------- Banegeneratoren ---------- */

/**
 * Banen til et bestemt frø. Den bygges efterhånden (udvid), så den er uendelig
 * lang, men den er altid den samme for det samme frø.
 */
export function lavBane(seed) {
  const rnd = mulberry32((seed >>> 0) || 1);
  const stykker = [];
  const bane = { seed, stykker, slut: 0 };
  let y = 0, x = 0, w = 7, forrige = null;
  const mellem = (a, b) => a + (b - a) * rnd();

  function tilfoej(p) {
    p.blokke = p.blokke || [];
    p.raekker = p.raekker || [];
    p.nr = stykker.length;
    stykker.push(p);
    bane.slut = p.z1;
    if (!p.hul) { y = midtY(p, p.z1); x = midtX(p, p.z1); w = p.w; }
    forrige = p;
    return p;
  }

  /** Bredden på det næste stykke: smallere, jo længere man er nået – men aldrig et spring ind, man ikke kan nå. */
  function nyBredde(d) {
    const maal = 7.2 - 3.4 * d + mellem(-0.7, 0.7);
    return klem(maal, Math.max(3.4, w - 1.2), Math.min(8, w + 2));
  }

  function vaelgType(z0, d) {
    if (!forrige) return 'start';
    if (forrige.hul) return 'lige';                       // man skal kunne lande i ro
    const valg = [
      ['lige', 1],
      ['blokke', z0 < 60 ? 0 : 0.7 + 1.3 * d],
      ['skraa', z0 < 40 ? 0 : 0.6 + 0.4 * d],
      ['bank', z0 < 300 ? 0 : 0.25 + 0.5 * d],
      ['hul', z0 < 150 || forrige.type === 'hul' ? 0 : 0.3 + 0.5 * d],
    ];
    let sum = 0; for (const [, v] of valg) sum += v;
    let r = rnd() * sum;
    for (const [t, v] of valg) { if ((r -= v) < 0) return t; }
    return 'lige';
  }

  function nytStykke() {
    const z0 = bane.slut, d = svaerhed(z0), v = fart(z0);
    const type = vaelgType(z0, d);
    const sl = -(0.14 + 0.16 * rnd() + 0.1 * d);

    if (type === 'start') {
      return tilfoej({ type, z0, z1: 60, x0: 0, y0: 0, dx: 0, sl: -0.16, w: 7, k: 0 });
    }

    if (type === 'hul') {
      // Hvor længe man er i luften (sekunder) – og hvor meget lavere næste stykke så skal ligge.
      const tid = mellem(0.22, 0.34 + 0.1 * d);
      const len = tid * v;
      const vy0 = forrige.sl * v;                         // kuglen letter med bakkens fald
      const fald = -(vy0 * tid - 0.5 * G * tid * tid);    // så meget er den faldet ved den anden kant
      const drop = fald + 0.9 + rnd() * 0.8;              // … og lidt til, så den lander ovenpå
      const p = tilfoej({ type, hul: true, z0, z1: z0 + len, x0: x, y0: y, dx: 0, sl: -drop / len, w, k: 0 });
      y -= drop;
      return p;
    }

    const nw = nyBredde(d);
    if (type === 'skraa') {
      const len = mellem(14, 26);
      const dx = (rnd() < 0.5 ? -1 : 1) * mellem(0.35, 0.8) * NAA / v;
      const p = tilfoej({ type, z0, z1: z0 + len, x0: x, y0: y, dx, sl, w: nw, k: 0 });
      return p;
    }
    if (type === 'bank') {
      const len = mellem(22, 36);
      const k = (rnd() < 0.5 ? -1 : 1) * mellem(0.18, 0.36);
      return tilfoej({ type, z0, z1: z0 + len, x0: x, y0: y, dx: 0, sl, w: nw, k });
    }
    if (type === 'blokke') {
      const len = mellem(34, 60);
      const p = tilfoej({ type, z0, z1: z0 + len, x0: x, y0: y, dx: 0, sl, w: nw, k: 0 });
      lavRaekker(p, d);
      return p;
    }
    // lige (også efter et hul, hvor stykket er lidt længere og aldrig smallere)
    const len = forrige.hul ? mellem(16, 26) : mellem(12, 28);
    return tilfoej({ type: 'lige', z0, z1: z0 + len, x0: x, y0: y, dx: 0, sl, w: forrige.hul ? w : nw, k: 0 });
  }

  /**
   * Klodsrækker på et stykke. Hver række har et hul (fri) som man altid kan nå
   * fra den forrige rækkes hul; resten af rækken er helt eller delvist lukket.
   */
  function lavRaekker(p, d) {
    const halv = p.w / 2;
    const fri = 2.5 - 0.6 * d;                         // hullets bredde
    const Lmaks = Math.max(0, halv - fri / 2);
    let lane = null, z = p.z0;
    for (let n = 0; n < 12; n++) {
      const v = fart(z);
      const glid = d > 0.25 && rnd() < 0.15 + 0.3 * d && p.w - 3.6 >= 0.9;
      let L, dz;
      if (glid) {
        // En glidende klods: der er altid plads på den ene side, men hvilken skifter.
        L = 0;
        dz = Math.max(9, (p.w - 1) * v / NAA);
      } else if (lane === null) {
        // Farten ved rækken, ikke her – den er lidt højere, og så er der kortere tid
        L = mellem(-Lmaks, Lmaks);
        dz = Math.max(6, (halv + Math.abs(L)) * v / NAA);
        dz = Math.max(6, (halv + Math.abs(L)) * fart(z + dz) / NAA * 1.02);
      } else {
        dz = mellem(8, 15) * Math.sqrt(v / START_FART);
        const naa = NAA * dz / fart(z + dz);
        L = mellem(Math.max(-Lmaks, lane - naa), Math.min(Lmaks, lane + naa));
      }
      z += dz;
      const dybde = mellem(0.9, 1.4);
      if (z + dybde > p.z1 - 2) break;
      const yb = midtY(p, z + dybde / 2);
      const mx = midtX(p, z);
      if (glid) {
        const bb = Math.min(p.w - 3.6, mellem(1.2, 2.4));
        const amp = (p.w - bb) / 2 - 0.05;
        const w2 = Math.min(2.2, 2.6 / amp);
        p.blokke.push({ x: mx, z0: z, z1: z + dybde, b: bb, y: yb, h: BLOK_H,
          glid: { amp, w: w2, fase: rnd() * Math.PI * 2 } });
        p.raekker.push({ z0: z, z1: z + dybde, glid: true });
        lane = null;
        continue;
      }
      const venstre = [-halv, L - fri / 2], hoejre = [L + fri / 2, halv];
      // Mindst den ene side er helt lukket – ellers er det ikke en rigtig forhindring
      const fuld = rnd() < 0.5 ? 'v' : 'h';
      for (const [side, [a, b]] of [['v', venstre], ['h', hoejre]]) {
        const bred = b - a;
        if (bred < 0.35) continue;
        let a2 = a, b2 = b;
        if (side !== fuld && rnd() < 0.6) {
          // En enkelt klods lige op ad hullet, så der er en ekstra (ikke lovet) vej ude ved kanten
          const bb = Math.min(bred, mellem(0.9, 2));
          if (side === 'v') a2 = b - bb; else b2 = a + bb;
        }
        p.blokke.push({ x: mx + (a2 + b2) / 2, z0: z, z1: z + dybde, b: b2 - a2, y: yb, h: BLOK_H });
      }
      p.raekker.push({ z0: z, z1: z + dybde, fri: { x: mx + L, b: fri } });
      lane = L;
    }
  }

  bane.udvid = zTil => { while (bane.slut < zTil) nytStykke(); };

  /** Stykket, der ligger ved z (eller det første/sidste, hvis z er uden for). */
  bane.stykVed = z => {
    bane.udvid(z + 1);
    let lo = 0, hi = stykker.length - 1;
    while (lo < hi) {
      const m = (lo + hi + 1) >> 1;
      if (stykker[m].z0 <= z) lo = m; else hi = m - 1;
    }
    return stykker[lo];
  };

  bane.udvid(200);
  return bane;
}

/** Gulvets højde under (x, z) – eller null, hvis der er et hul eller man er ude over kanten. */
export function gulv(bane, x, z) {
  const p = bane.stykVed(z);
  if (!p || p.hul) return null;
  const c = midtX(p, z);
  if (Math.abs(x - c) > p.w / 2) return null;
  return midtY(p, z) + (x - c) * kVed(p, z);
}

/** Banens midterhøjde ved z – også over et hul. Bruges til kameraet og til «faldet af». */
export const banehoejde = (bane, z) => midtY(bane.stykVed(z), z);

/* ---------- Kuglen ---------- */

export function nyTur(seed) {
  const bane = lavBane(seed);
  const s = {
    seed, bane, t: 0,
    x: 0, z: START_Z, y: 0, vx: 0, vy: 0,
    paa: true, luft: 0, rul: 0,
    meter: 0, doed: false, aarsag: null,
  };
  s.y = gulv(bane, s.x, s.z);
  return s;
}

/** Kopi til botten: samme bane (den er den samme for alle), eget alt andet. */
const kopi = s => ({ ...s });

/**
 * Ét skridt. styr er −1 (venstre) … 1 (højre). Returnerer hvad der skete:
 * { land: faldhastighed eller 0, doed: 'blok' | 'fald' | 'kant' | null }.
 */
export function tik(s, dt, styr = 0) {
  const e = { land: 0, doed: null };
  if (s.doed) return e;
  const b = s.bane;
  const vz = fart(s.z);
  b.udvid(s.z + 220);
  s.t += dt;

  // Til siden: kuglen følger styringen, og en skrå bane skubber den nedad
  const p0 = b.stykVed(s.z);
  const bank = s.paa && !p0.hul ? -G * kVed(p0, s.z) * BANK_TRYK : 0;
  s.vx += (klem(styr, -1, 1) * SIDE_MAKS - s.vx) * Math.min(1, STYR * dt) + bank * dt;
  const x0 = s.x, z0 = s.z;
  s.x += s.vx * dt;
  s.z += vz * dt;
  s.rul += vz * dt / R;

  const f = gulv(b, s.x, s.z);
  if (s.paa) {
    if (f === null || f < s.y - 0.35) {
      s.paa = false;                                    // ud over kanten, ned i et hul eller ned ad et trin
    } else if (f - s.y > TRIN) {
      return doed(s, e, 'kant');
    } else {
      // Følger gulvet – og husker, hvor hurtigt det faldt, til den dag man letter
      const f0 = gulv(b, x0, z0);
      s.vy = f0 !== null ? (f - f0) / dt : s.vy;
      s.y = f;
    }
  }
  if (!s.paa) {
    s.luft += dt;
    s.vy -= G * dt;
    s.y += s.vy * dt;
    if (f !== null && s.y <= f) {
      if (s.y >= f - (0.35 + Math.abs(s.vy) * dt)) {
        e.land = -s.vy;
        s.paa = true; s.luft = 0; s.y = f;
      } else if (s.y > f - TYK - 2 * R) {
        return doed(s, e, 'kant');                       // ind i siden af banen
      }
    }
    if (s.y < banehoejde(b, s.z) - DOED_FALD || s.luft > 4) return doed(s, e, 'fald');
  }

  // De røde klodser
  const p = b.stykVed(s.z);
  for (const bl of p.blokke) {
    if (bl.z1 < s.z - R || bl.z0 > s.z + R) continue;
    const bx = blokX(bl, s.t);
    const nx = klem(s.x, bx - bl.b / 2, bx + bl.b / 2), nz = klem(s.z, bl.z0, bl.z1);
    if (Math.hypot(s.x - nx, s.z - nz) < R * 0.9 && s.y < bl.y + bl.h) return doed(s, e, 'blok');
  }

  s.meter = Math.max(s.meter, Math.floor(s.z - START_Z));
  return e;
}

function doed(s, e, aarsag) {
  s.doed = true; s.aarsag = aarsag; e.doed = aarsag;
  return e;
}

/** Kører en hel tur med en fast styring (eller en funktion af tilstanden). Bruges af tests. */
export function koer(s, sek, styr = 0, dt = 1 / 120) {
  const n = Math.round(sek / dt);
  for (let i = 0; i < n && !s.doed; i++) tik(s, dt, typeof styr === 'function' ? styr(s) : styr);
  return s;
}

/* ---------- Botten – en målestok, ikke en del af spillet ---------- */

const PLANER = [];
for (const a of [-1, -0.5, 0, 0.5, 1]) PLANER.push([a, a]);
for (const a of [-1, 1]) for (const b of [0, -a]) PLANER.push([a, b]);
for (const a of [0]) for (const b of [-1, 1]) PLANER.push([a, b]);

/**
 * Prøver en håndfuld planer («styr sådan i et kvart sekund, så sådan») et
 * stykke frem i tiden og vælger den, der holder længst og ender tættest på
 * midten. Den er ikke perfekt – det skal den heller ikke være.
 */
export function bot(s, horisont = 0.8, forrige = 0) {
  const dt = 1 / 60;
  let bedst = 0, bedstV = -Infinity;
  for (const [a, b] of PLANER) {
    const k = kopi(s);
    let t = 0;
    while (t < horisont && !k.doed) {
      tik(k, dt, t < 0.25 ? a : b); t += dt;
      // Er kuglen på vej ned under banen, er den tabt – også selvom den ikke er død endnu
      if (!k.paa && k.y < banehoejde(k.bane, k.z) - 1.5) break;
    }
    const tabt = k.doed || t < horisont - 1e-9;
    let v = t;
    if (!tabt) {
      const p = k.bane.stykVed(k.z);
      const midt = p.hul ? 0 : Math.abs(k.x - midtX(p, k.z)) / (p.w / 2);
      v += 1 - 0.6 * midt + (k.paa ? 0.1 : 0);
    }
    v -= Math.abs(a - forrige) * 0.02;
    if (v > bedstV) { bedstV = v; bedst = a; }
  }
  return bedst;
}

/** Lader botten køre, til den dør eller når maksMeter. Returnerer tilstanden. */
export function botTur(seed, maksMeter = 3000, dt = 1 / 120) {
  const s = nyTur(seed);
  let styr = 0, siden = 1;
  while (!s.doed && s.meter < maksMeter) {
    siden += dt;
    if (siden >= 0.1) { styr = bot(s, 0.8, styr); siden = 0; }
    tik(s, dt, styr);
  }
  return s;
}
