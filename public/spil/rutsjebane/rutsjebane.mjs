// Rutsjebanen – banen, rytterne, robotterne og hoppet i bassinet. Ren JS uden
// browser, så det hele kan enhedstestes:  node --test test/unit/rutsjebane.test.mjs
//
// Joannas ønske: «en lang lang rutschebane, hvor man kører hurtigere og
// hurtigere, og man skal styre personen der kører i rutsjebanen, og til sidst
// skal man prøve at ramme badebassinet uden at flyve ud over verden. Man skal
// spille imod nogle robotter, vinklen skal være bagfra, der skal være små penge
// rundt på rutsjebanen, og der skal være et sted med forhindringer, man skal
// styre uden om.»
//
// Koordinater i meter. Langs banen: s (hvor langt man er kommet) og u (til
// siden, positiv = til højre). Banen er en halvrør-rende: gulvet ligger i
// højden vaeg(u) = VAEG_H·(u/HALV)², så tyngdekraften trækker én ind mod midten,
// og i et sving skubber farten én op ad den ydre væg. Rammer man kanten, skraber
// man og mister fart – man falder ikke af.
//
// I verden: x til højre, y op, z frem (ved start). Banens retning er psi
// (0 = +z, positiv drejer mod højre), så frem = (sin psi, 0, cos psi) og
// højre = (cos psi, 0, −sin psi).
//
// Fire løfter holder løbet fair, og enhedstesten holder øje med dem:
//   1. **Farten afhænger af, hvor stejlt det er** – banen bliver stejlere hele
//      vejen, så topfarten stiger fra ~45 til ~90 km/t. Ingen kører hurtigere
//      end topfarten på stedet (sluttid(s)), og det er den, forhindringerne er
//      lagt efter.
//   2. **Der er altid et hul i en forhindringsrække**, og man kan nå fra det ene
//      hul til det næste med halv kraft (NAA) – den første række kan nås, uanset
//      hvor i renden man kom ind.
//   3. **Bassinet kan altid rammes** med fuld styring i luften, uanset om man
//      kom ned ad banen med topfart eller lidt under.
//   4. **Bassinet ligger aldrig lige ud for hoppet**: den, der ikke styrer,
//      rammer ikke. Det er dér, «styr personen» bliver til noget.

export const G = 20;                   // tyngdekraft
export const LAENGDE = 1100;           // banens længde til hoppet (meter)
export const RAMPE = 12;               // hopkanten til sidst
export const SLUT = LAENGDE + RAMPE;   // hvor man letter
export const HALV = 4;                 // halv bredde af renden
export const VAEG_H = 2.2;             // så højt væggen når op ude ved kanten
export const KANT = HALV * 0.96;       // så langt ud kan man komme, før man skraber
export const TRAEK = 0.012;            // luftmodstand – giver en topfart på hvert sted
export const STYR = 20;                // m/s² til siden med styringen helt ude
export const STYR_FOELG = 14;          // så hurtigt styringen følger fingeren (1/s)
export const DAEMP = 4;                // renden dæmper, at man svupper frem og tilbage
export const VAEG_TRAEK = 0.35;        // oppe ad væggen er der lidt længere vej – og lidt mere modstand
export const LUFT_STYR = 10;           // m/s² til siden i luften
export const HOP_H = 10;               // hopkanten ligger så højt over vandet
export const HOP_HAELD = 0.4;          // hopkantens hældning opad til sidst
export const SKUB = 8;                 // m/s², når to ryttere støder sammen (mindre end STYR)
export const NAA = 2.5;                // m/s til siden, forhindringerne regner med
export const REAKT = 0.45;             // sekunder, man får til at se en række
export const FORH_R = 0.6;             // forhindringernes radius
export const RYTTER_R = 0.35;          // rytterens radius
export const MOENT_R = 0.9;            // så tæt skal man forbi en mønt
export const RAMT_FART = 0.55;         // farten ganges med dette, når man rammer noget
export const START_FART = 5;          // m/s – man skubber sig i gang på KØR!
export const NEDTAELLING = 3;          // 3 – 2 – 1 – KØR!
export const POOL_HB = 3.5;            // bassinets halve bredde
export const POOL_HL = 8;              // bassinets halve længde
export const DAEK = 2.5;               // fliserne omkring bassinet
export const MIDT_R = 2.5;             // så tæt på midten giver ekstra point
export const PLADS_POINT = [50, 30, 20, 10];
export const PLASK_POINT = 20;
export const MIDT_POINT = 10;
export const SLOTS = [-3.2, -1.6, 0, 1.6, 3.2];   // pladserne i en forhindringsrække
export const DS = 0.5;                 // banens tabeller har et punkt for hver halve meter

const klem = (v, a, b) => Math.max(a, Math.min(b, v));
export const vaeg = u => VAEG_H * (u / HALV) ** 2;
const FJEDER = G * 2 * VAEG_H / (HALV * HALV);   // hvor hårdt renden trækker ind mod midten (pr. meter)

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Banens hældning (dy/ds): stejlere og stejlere, og til sidst opad på hopkanten. */
export function haeld(s) {
  if (s < LAENGDE) return -(0.1 + 0.3 * klem(s, 0, LAENGDE) / LAENGDE);
  const u = klem((s - LAENGDE) / RAMPE, 0, 1);
  return -0.4 + (0.4 + HOP_HAELD) * u;
}

/** Topfarten på et sted: dér hvor tyngdekraften og luftmodstanden står lige. */
export const topfart = s => Math.sqrt(G * Math.max(0.01, -haeld(Math.min(s, LAENGDE - 1))) / TRAEK);

/* ---------- Banen ---------- */

/**
 * Banen til et frø: sving og lige stykker, én zone med forhindringer midtvejs,
 * og et langt lige stykke til sidst, så man kan sigte efter bassinet.
 */
export function lavSpor(seed) {
  const rnd = mulberry32((seed >>> 0) || 1);
  const mellem = (a, b) => a + (b - a) * rnd();
  const stykker = [];                  // { z0, z1, kap }
  let pos = 0, retning = rnd() < 0.5 ? -1 : 1;
  const lige = len => { stykker.push({ z0: pos, z1: pos + len, kap: 0 }); pos += len; };
  // Et sving må ikke løbe ind over det, der skal være lige (til) – så bliver det kortere
  const sving = (rMin, rMax, til) => {
    const r = mellem(rMin, rMax), vinkel = Math.min(mellem(0.9, 2.3), (til - pos) / r);
    if (rnd() < 0.72) retning = -retning;
    if (vinkel < 0.4) return;
    stykker.push({ z0: pos, z1: pos + r * vinkel, kap: retning / r }); pos += r * vinkel;
  };

  lige(45);
  const ZONE_FRA = LAENGDE * 0.4;
  while (pos < ZONE_FRA - 40) { sving(45, 90, ZONE_FRA + 40); lige(mellem(8, 26)); }
  lige(18);
  const zone = { fra: pos, til: pos + 250 };
  lige(250);
  lige(18);
  const SIDSTE = LAENGDE - 160;
  while (pos < SIDSTE - 50) { sving(35, 70, SIDSTE - 15); lige(mellem(6, 20)); }
  lige(SLUT + 5 - pos);

  // Tabeller med en halv meters mellemrum. Krumningen glattes over 20 m, så man
  // ikke får et ryk i siden, når et sving begynder.
  const N = Math.ceil((SLUT + 4) / DS) + 1;
  const raa = new Float64Array(N);
  let j = 0;
  for (let i = 0; i < N; i++) {
    const s = i * DS;
    while (j < stykker.length - 1 && stykker[j].z1 <= s) j++;
    raa[i] = stykker[j].kap;
  }
  const VIN = 20;
  const sum = new Float64Array(N + 1);
  for (let i = 0; i < N; i++) sum[i + 1] = sum[i] + raa[i];
  const kap = new Float64Array(N), psi = new Float64Array(N), X = new Float64Array(N), Y = new Float64Array(N), Z = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const a = Math.max(0, i - VIN), b = Math.min(N, i + VIN + 1);
    kap[i] = (sum[b] - sum[a]) / (b - a);
  }
  for (let i = 1; i < N; i++) {
    const s = (i - 0.5) * DS;
    psi[i] = psi[i - 1] + (kap[i - 1] + kap[i]) / 2 * DS;
    const pm = (psi[i - 1] + psi[i]) / 2;
    X[i] = X[i - 1] + Math.sin(pm) * DS;
    Z[i] = Z[i - 1] + Math.cos(pm) * DS;
    Y[i] = Y[i - 1] + haeld(s) * DS;
  }

  const spor = { seed, stykker, zone, kap, psi, X, Y, Z, N };
  /** Banen ved s: midtpunkt, retning, krumning og hældning. */
  spor.ved = s => {
    const f = klem(s / DS, 0, N - 1.000001), i = Math.floor(f), t = f - i;
    const l = (A) => A[i] + (A[i + 1] - A[i]) * t;
    return { x: l(X), y: l(Y), z: l(Z), psi: l(psi), kap: l(kap), sl: haeld(s) };
  };
  return spor;
}

/** Et punkt i renden (s, u) i verden – gulvet, plus løft over det. */
export function sporPunkt(spor, s, u, loeft = 0) {
  const p = spor.ved(s);
  const c = Math.cos(p.psi), sn = Math.sin(p.psi);
  return { x: p.x + u * c, y: p.y + vaeg(klem(u, -HALV, HALV)) + loeft, z: p.z - u * sn };
}

/* ---------- Forhindringer, mønter og bassinet ---------- */

function lavForhindringer(spor, rnd) {
  const mellem = (a, b) => a + (b - a) * rnd();
  const raekker = [];
  const { fra, til } = spor.zone;
  let s = fra, hul = null;
  const typer = ['and', 'bold', 'and', 'ring'];
  while (true) {
    const v = topfart(s + 40);
    // Hullet i rækken ligger inde i renden (−1,6 · 0 · 1,6), så man ikke skal op ad væggen
    const valg = [-1.6, 0, 1.6];
    const nyHul = valg[Math.floor(rnd() * 3)];
    let dz;
    if (hul === null) {
      // Den første række: man kan komme ind hvor som helst i renden
      dz = v * ((HALV + Math.abs(nyHul)) / NAA + REAKT);
    } else {
      dz = Math.max(v * (Math.abs(nyHul - hul) / NAA + REAKT), mellem(22, 40));
    }
    s += dz;
    if (s > til - 10) break;
    const dobbelt = rnd() < 0.55 - 0.25 * (s - fra) / (til - fra);
    const fri = new Set([nyHul]);
    if (dobbelt) fri.add(nyHul + (nyHul >= 1.6 ? -1.6 : nyHul <= -1.6 ? 1.6 : (rnd() < 0.5 ? -1.6 : 1.6)));
    // Ude på væggene er der af og til også en vej – men den er ikke lovet
    if (!dobbelt) for (const k of [-3.2, 3.2]) if (rnd() < 0.2) fri.add(k);
    const ting = [];
    for (const u of SLOTS) if (!fri.has(u)) ting.push({ u, type: typer[Math.floor(rnd() * typer.length)] });
    raekker.push({ s, hul: nyHul, fri: [...fri].sort((a, b) => a - b), ting });
    hul = nyHul;
  }
  return raekker;
}

function lavMoenter(spor, raekker, rnd) {
  const mellem = (a, b) => a + (b - a) * rnd();
  const moenter = [];
  // Én mønt i hvert lovet hul – en lille belønning for at ramme det
  for (const r of raekker) moenter.push({ s: r.s, u: r.hul });
  let s = 55;
  while (s < LAENGDE - 40) {
    if (s > spor.zone.fra - 20 && s < spor.zone.til + 10) { s = spor.zone.til + 12; continue; }
    const p = spor.ved(s + 8);
    if (Math.abs(p.kap) > 0.006) {
      // I et sving: en bue op ad den ydre væg (dér, hvor farten alligevel skubber én hen)
      const ud = p.kap > 0 ? -1 : 1, n = 7;
      for (let i = 0; i < n; i++) moenter.push({ s: s + i * 3, u: ud * 3.1 * Math.sin(Math.PI * (i + 0.5) / n) });
      s += n * 3 + mellem(22, 40);
    } else {
      const u = mellem(-2.6, 2.6), n = 5;
      for (let i = 0; i < n; i++) moenter.push({ s: s + i * 3, u });
      s += n * 3 + mellem(20, 38);
    }
  }
  return moenter.filter(m => m.s < LAENGDE - 5).sort((a, b) => a.s - b.s);
}

/** Farten, man letter med, hvis man kommer ned ad banen med v0 ved foden af hopkanten. */
export function farTilHop(v0) {
  let v = v0, s = LAENGDE;
  const dt = 1 / 240;
  while (s < SLUT) { v += (-G * haeld(s) - TRAEK * v * v) * dt; s += v * dt; }
  return v;
}

/** Hvor langt fremme man lander (i vandets højde), når man letter midt i renden med farten v. */
export function hopLaengde(v) {
  const n = Math.hypot(1, HOP_HAELD);
  const vf = v / n, vy = v * HOP_HAELD / n;
  const t = (vy + Math.sqrt(vy * vy + 2 * G * HOP_H)) / G;
  return { b: vf * t, t };
}

function lavPool(spor, rnd) {
  const vTop = farTilHop(topfart(LAENGDE));
  const lang = hopLaengde(vTop).b, kort = hopLaengde(vTop * 0.86).b;
  const side = rnd() < 0.5 ? -1 : 1;
  const ox = side * (POOL_HB + 3.2 + rnd() * 1.5);
  const e = spor.ved(SLUT);
  const O = { x: e.x, y: e.y, z: e.z };
  const F = { x: Math.sin(e.psi), z: Math.cos(e.psi) }, Rv = { x: Math.cos(e.psi), z: -Math.sin(e.psi) };
  return { ox, zc: (lang + kort) / 2, hb: POOL_HB, hl: POOL_HL, vand: e.y - HOP_H, daek: e.y - HOP_H + 0.35, O, F, R: Rv };
}

/** (a, b) i hoppets egne koordinater: a til siden, b frem fra hopkanten. */
export function lokal(pool, x, z) {
  const dx = x - pool.O.x, dz = z - pool.O.z;
  return { a: dx * pool.R.x + dz * pool.R.z, b: dx * pool.F.x + dz * pool.F.z };
}
/** Tilbage til verden. */
export function verden(pool, a, b, y) {
  return { x: pool.O.x + a * pool.R.x + b * pool.F.x, y, z: pool.O.z + a * pool.R.z + b * pool.F.z };
}

/* ---------- Rytterne og løbet ---------- */

/** De tre robotter. skill 0-1 afgør hvor langt frem de ser, og hvor tit de sjusker. */
export const ROBOTTER = [
  { navn: 'Bip', farve: '#3ddc84', skill: 0.55, traek: 1.06 },
  { navn: 'Bop', farve: '#b06cff', skill: 0.76, traek: 1.03 },
  { navn: 'Bolt', farve: '#ff5a4f', skill: 0.88, traek: 1.015 },
];
const START_U = [-0.9, -2.7, 0.9, 2.7];   // du står som nr. 2 fra venstre

function nyRytter(navn, farve, robot, i, seed) {
  return {
    navn, farve, robot: !!robot, nr: i,
    skill: robot ? robot.skill : 1, traek: robot ? robot.traek : 1,
    s: 0, u: START_U[i], du: 0, v: START_FART,
    fase: 'bane',                      // bane | luft | plask | fliser | ude
    x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
    tid: null, land: null, ramt: 0, skrab: 0, immun: 0, moenter: 0, styr: 0, glat: 0,
    bot: robot ? { rnd: mulberry32(((seed >>> 0) * 31 + i * 7919) >>> 0 || 1), siden: 9, maal: 0, set: -1, ignorer: false, fejl: 0 } : null,
  };
}

export function nytLoeb(seed) {
  const spor = lavSpor(seed);
  const rnd = mulberry32(((seed >>> 0) ^ 0x9e3779b9) >>> 0 || 7);
  const raekker = lavForhindringer(spor, rnd);
  const moenter = lavMoenter(spor, raekker, rnd).map(m => ({ ...m, taget: false }));
  const pool = lavPool(spor, rnd);
  const rytter = [nyRytter('Du', '#ffd23f', null, 0, seed)];
  ROBOTTER.forEach((r, i) => rytter.push(nyRytter(r.navn, r.farve, r, i + 1, seed)));
  for (const r of rytter) if (r.bot) r.bot.fejl = gauss(r.bot.rnd) * (1 - r.skill) * 4.5;
  const l = { seed, spor, raekker, moenter, pool, rytter, t: 0, nedtael: NEDTAELLING, slut: false };
  for (const r of rytter) placer(l, r);
  return l;
}

function gauss(rnd) {
  const a = Math.max(1e-9, rnd()), b = rnd();
  return Math.sqrt(-2 * Math.log(a)) * Math.cos(2 * Math.PI * b);
}

/** Opdaterer x, y, z for en rytter på banen. */
function placer(l, r) {
  const p = sporPunkt(l.spor, r.s, r.u);
  r.x = p.x; r.y = p.y; r.z = p.z;
}

export const iMaal = r => r.fase === 'plask' || r.fase === 'fliser' || r.fase === 'ude';
export const du = l => l.rytter[0];

/**
 * Ét skridt for hele løbet. styr er spillerens styring (−1 … 1); robotterne
 * styrer selv. Returnerer hvad der skete for spilleren:
 * { moent, ramt, skrab, hop, plask, fliser, ude } (tal/bool) og `robotRamt`.
 */
export function tik(l, dt, styr = 0) {
  const e = { moent: 0, ramt: false, skrab: false, hop: false, plask: false, fliser: false, ude: false, start: false };
  if (l.slut) return e;
  if (l.nedtael > 0) {
    l.nedtael -= dt;
    if (l.nedtael <= 0) { l.nedtael = 0; e.start = true; }
    return e;
  }
  l.t += dt;
  for (const r of l.rytter) {
    const st = r.robot ? botStyr(l, r, dt) : klem(styr, -1, 1);
    r.styr = st;
    const hv = trin(l, r, dt, st);
    if (!r.robot) Object.assign(e, hv);
  }
  skub(l, dt);
  if (l.rytter.every(iMaal)) l.slut = true;
  return e;
}

function trin(l, r, dt, st) {
  const e = {};
  if (r.fase === 'bane') {
    const p = l.spor.ved(r.s);
    // Styringen følger fingeren blødt – ellers svupper man fra side til side med en tænd/sluk-finger
    r.glat += (st - r.glat) * Math.min(1, STYR_FOELG * dt);
    const acc = STYR * r.glat - FJEDER * r.u - r.v * r.v * p.kap - DAEMP * r.du;
    r.du += acc * dt;
    r.u += r.du * dt;
    if (Math.abs(r.u) > KANT) {
      const sg = Math.sign(r.u);
      r.u = sg * KANT;
      if (r.du * sg > 0) r.du = -r.du * 0.2;
      r.v *= 1 - 0.9 * dt;
      r.skrab = 0.2; e.skrab = true;
    } else r.skrab = Math.max(0, r.skrab - dt);
    const tr = TRAEK * r.traek * (1 + VAEG_TRAEK * (r.u / HALV) ** 2);
    r.v += (-G * p.sl - tr * r.v * r.v) * dt;
    r.v = Math.max(1, r.v);
    const s0 = r.s;
    // Inderst i et sving er vejen kortere (radius R − u), yderst er den længere
    r.s += r.v * dt / klem(1 - p.kap * r.u, 0.6, 1.6);
    r.immun = Math.max(0, r.immun - dt);

    // Forhindringerne
    for (const rk of l.raekker) {
      if (rk.s < s0 - 1.5) continue;
      if (rk.s > r.s + 1.5) break;
      for (const tg of rk.ting) {
        if (tg.vaek) continue;
        if (Math.hypot(r.s - rk.s, r.u - tg.u) < FORH_R + RYTTER_R && r.immun <= 0) {
          r.v *= RAMT_FART; r.immun = 0.7; r.ramt++;
          r.du += (r.u >= tg.u ? 1 : -1) * 3;
          e.ramt = true; e.ramtTing = tg;
        }
      }
    }
    // Mønterne (kun dine)
    if (!r.robot) {
      for (const m of l.moenter) {
        if (m.taget || m.s < s0 - 1 || m.s > r.s + 1) continue;
        if (m.s >= s0 - 0.6 && m.s <= r.s + 0.6 && Math.abs(m.u - r.u) < MOENT_R) {
          m.taget = true; r.moenter++; e.moent = (e.moent || 0) + 1;
        }
      }
    }
    if (r.s >= SLUT) letter(l, r), e.hop = true;
    else placer(l, r);
    return e;
  }
  if (r.fase === 'luft') {
    const P = l.pool;
    r.vx += LUFT_STYR * st * P.R.x * dt;
    r.vz += LUFT_STYR * st * P.R.z * dt;
    r.vy -= G * dt;
    r.x += r.vx * dt; r.y += r.vy * dt; r.z += r.vz * dt;
    const { a, b } = lokal(P, r.x, r.z);
    const iPool = Math.abs(a - P.ox) <= P.hb - RYTTER_R && Math.abs(b - P.zc) <= P.hl - RYTTER_R;
    const paaOe = Math.abs(a - P.ox) <= P.hb + DAEK && Math.abs(b - P.zc) <= P.hl + DAEK;
    if (iPool && r.y <= P.vand) {
      r.fase = 'plask'; r.tid = l.t; r.y = P.vand; r.land = { a, b };
      e.plask = true;
    } else if (paaOe && !iPool && r.y <= P.daek && r.y > P.daek - 1.5) {
      r.fase = 'fliser'; r.y = P.daek; r.land = { a, b };
      e.fliser = true;
    } else if (r.y < P.vand - 30) {
      r.fase = 'ude'; r.land = { a, b };
      e.ude = true;
    }
    return e;
  }
  return e;
}

/** Man letter fra hopkanten: farten peger frem og op, og det, man havde til siden, beholder man. */
function letter(l, r) {
  const P = l.pool;
  const p = sporPunkt(l.spor, SLUT, r.u);
  const n = Math.hypot(1, HOP_HAELD);
  const vf = r.v / n;
  r.fase = 'luft';
  r.x = p.x; r.y = p.y; r.z = p.z;
  r.vx = P.F.x * vf + P.R.x * r.du;
  r.vz = P.F.z * vf + P.R.z * r.du;
  r.vy = r.v * HOP_HAELD / n;
  r.s = SLUT;
}

/** Ryttere, der kører ind i hinanden, skubber hinanden til siden. */
function skub(l, dt) {
  const rs = l.rytter;
  for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
    const a = rs[i], b = rs[j];
    if (a.fase !== 'bane' || b.fase !== 'bane') continue;
    const ds = b.s - a.s, dd = b.u - a.u;
    // Blødt – man skal kunne mase sig forbi, ellers sidder man fast mellem to robotter
    if (Math.abs(ds) < 1.2 && Math.abs(dd) < 0.8) {
      const sg = dd !== 0 ? Math.sign(dd) : 1;
      a.du -= SKUB * sg * dt; b.du += SKUB * sg * dt;
    }
  }
}

/* ---------- Placering og point ---------- */

/** Rækkefølgen lige nu: de færdige efter tid, så dem der stadig kører efter hvor langt de er. */
export function stilling(l) {
  const vaerdi = r => r.fase === 'plask' ? 1e6 - r.tid : r.fase === 'luft' ? SLUT + 50 + lokal(l.pool, r.x, r.z).b : iMaal(r) ? -1e6 + r.s : r.s;
  return [...l.rytter].sort((a, b) => vaerdi(b) - vaerdi(a));
}

/** Din placering lige nu (1-4). */
export const placering = l => stilling(l).indexOf(l.rytter[0]) + 1;

/**
 * Pointene for spilleren, når løbet er slut: mønter + plads + plask (+ midt i).
 * Kun dem, der landede i bassinet, får en plads.
 */
export function resultat(l) {
  const i = l.rytter.filter(r => r.fase === 'plask').sort((a, b) => a.tid - b.tid);
  const mig = l.rytter[0];
  const plads = mig.fase === 'plask' ? i.indexOf(mig) + 1 : null;
  const midt = mig.fase === 'plask' && Math.hypot(mig.land.a - l.pool.ox, mig.land.b - l.pool.zc) <= MIDT_R;
  const dele = { moenter: mig.moenter, plads: plads ? PLADS_POINT[plads - 1] : 0, plask: mig.fase === 'plask' ? PLASK_POINT : 0, midt: midt ? MIDT_POINT : 0 };
  return { plads, midt, fase: mig.fase, dele, point: dele.moenter + dele.plads + dele.plask + dele.midt, raekke: i.concat(l.rytter.filter(r => r.fase !== 'plask')) };
}

/** Kører resten af løbet færdigt uden spilleren (til resultatlisten). */
export function koerFaerdig(l, dt = 1 / 120, maksSek = 120) {
  for (let t = 0; t < maksSek && !l.slut; t += dt) tik(l, dt, 0);
  return l;
}

/* ---------- Robotternes hoved – og en målestok til testene ---------- */

/**
 * Styringen for en robot (eller for botten, der spiller for dig i testene).
 * Den kigger et stykke frem: kommer der en forhindringsrække, sigter den efter
 * det nærmeste hul; ellers holder den sig lidt inde i svingene, og til sidst
 * lægger den sig over mod bassinets side. I luften sigter den efter bassinet –
 * med en lille fejl, der er større, jo mindre dygtig robotten er.
 */
export function botStyr(l, r, dt, binaer = false) {
  const b = r.bot;
  const P = l.pool;
  let ud;
  if (r.fase === 'luft') {
    const h = r.y - P.vand;
    const tRest = (r.vy + Math.sqrt(Math.max(0, r.vy * r.vy + 2 * G * h))) / G;
    const { a } = lokal(P, r.x, r.z);
    const va = r.vx * P.R.x + r.vz * P.R.z;
    const maalA = P.ox + b.fejl;
    const slutA = a + va * Math.max(0.05, tRest);
    ud = klem(1.4 * 2 * (maalA - slutA) / Math.max(0.1, tRest) ** 2 / LUFT_STYR, -1, 1);
    return binaer ? (Math.abs(ud) < 0.25 ? 0 : Math.sign(ud)) : ud;
  }
  if (r.fase !== 'bane') return 0;
  b.siden += dt;
  const reakt = 0.08 + 0.25 * (1 - r.skill);
  if (b.siden >= reakt) {
    b.siden = 0;
    const kig = r.v * (0.55 + 0.6 * r.skill);
    let maal = null;
    const rk = l.raekker.find(x => x.s > r.s - 0.3);
    if (rk && rk.s - r.s < kig) {
      if (b.set !== rk.s) { b.set = rk.s; b.ignorer = b.rnd() < (1 - r.skill) * 0.6; }
      if (!b.ignorer) {
        let bedst = null, bv = Infinity;
        for (const f of rk.fri) { const v = Math.abs(f - r.u) + 0.5 * Math.abs(f); if (v < bv) { bv = v; bedst = f; } }
        maal = bedst;
      }
    }
    if (maal === null && b.penge && r.s < LAENGDE - 110) {
      // Spillerens bot (menuen og testene) kører også efter pengene
      const m = l.moenter.find(x => !x.taget && x.s > r.s + 0.5);
      if (m && m.s - r.s < r.v * 1.1 && Math.abs(m.u) <= 2.8) maal = m.u;
    }
    if (maal === null) {
      if (r.s > LAENGDE - 110) maal = klem(P.ox * 0.4, -2.6, 2.6);
      else {
        const k = l.spor.ved(r.s + r.v * 0.5).kap;
        maal = Math.abs(k) > 0.004 ? Math.sign(k) * Math.min(1.4, Math.abs(k) * 90) * r.skill : 0;
      }
    }
    b.maal = maal;
  }
  const p = l.spor.ved(r.s);
  const oensket = 10 * (b.maal - r.u) - 5 * r.du;
  ud = klem((oensket + FJEDER * r.u + r.v * r.v * p.kap + DAEMP * r.du) / STYR, -1, 1);
  return binaer ? (Math.abs(ud) < 0.3 ? 0 : Math.sign(ud)) : ud;
}

/**
 * Giver spilleren et bot-hoved (til tests og til menuen). Med penge = true kører
 * den også efter mønterne – det koster lidt fart, så en bot, der vil vinde, lader være.
 */
export function giveBot(r, skill = 1, seed = 1, penge = false) {
  r.bot = { rnd: mulberry32(seed >>> 0 || 1), siden: 9, maal: 0, set: -1, ignorer: false, fejl: 0, penge };
  r.skill = skill;
  return r;
}

/**
 * Et helt løb, hvor spilleren styres af en bot med en bestemt dygtighed.
 * binaer = true styrer som en finger: helt til venstre, helt til højre eller slet ikke.
 */
export function botLoeb(seed, skill = 1, binaer = false, dt = 1 / 120) {
  const l = nytLoeb(seed);
  const mig = giveBot(l.rytter[0], skill, seed * 13 + 5);
  if (skill < 1) mig.bot.fejl = gauss(mig.bot.rnd) * (1 - skill) * 4.5;
  for (let t = 0; t < 200 && !l.slut; t += dt) tik(l, dt, l.nedtael > 0 ? 0 : botStyr(l, mig, dt, binaer));
  return l;
}
