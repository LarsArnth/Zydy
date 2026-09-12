/*
  Klodser – verdenen, fysikken og sigtet.

  Alt her er ren JS uden browser og uden WebGL, så det kan enhedstestes med
  `node --test test/unit/klodser.test.mjs`. index.html står for at tegne det.

  Verdenen er et gitter af klodser på BREDDE × HOEJDE × BREDDE. Én klods er
  én meter. Uden for gitteret i x/z (og under y=0) er der sten: en usynlig mur,
  så man aldrig kan falde ud af verdenen – børnene skal ikke miste deres hus,
  fordi de gik ud over kanten.

  Koordinater: y er opad, spillerens (x, y, z) er *fødderne*, og yaw måles i
  radianer, hvor 0 kigger mod -z (samme som kameraet i index.html).
*/

export const BREDDE = 40;          // verdenen i x og z
export const HOEJDE = 28;          // og opad
export const VAND_NIVEAU = 8;      // alt under dette fyldes med vand

/* ---------- Klodserne ---------- */
/** id = pladsen i listen. fast = man kan stå på den; gennemsigtig = man kan se igennem. */
export const BLOKKE = [
  { id: 'luft', navn: 'Luft', farve: '#000000', fast: false, gennemsigtig: true },
  { id: 'graes', navn: 'Græs', farve: '#63b356', fast: true, side: '#7a5a34' },
  { id: 'jord', navn: 'Jord', farve: '#7a5a34', fast: true },
  { id: 'sten', navn: 'Sten', farve: '#8e9099', fast: true },
  { id: 'sand', navn: 'Sand', farve: '#e3d193', fast: true },
  { id: 'vand', navn: 'Vand', farve: '#3d7fd6', fast: false, gennemsigtig: true, vaeske: true },
  { id: 'stamme', navn: 'Træ', farve: '#6f4a2a', fast: true },
  { id: 'loev', navn: 'Løv', farve: '#3f9a4e', fast: true },
  { id: 'planke', navn: 'Planke', farve: '#c9954f', fast: true },
  { id: 'mursten', navn: 'Mursten', farve: '#bd5040', fast: true },
  { id: 'blaa', navn: 'Blå', farve: '#4a7cf0', fast: true },
  { id: 'gul', navn: 'Gul', farve: '#ffd447', fast: true },
  { id: 'lyseroed', navn: 'Lyserød', farve: '#ff7ab8', fast: true },
  { id: 'mint', navn: 'Mint', farve: '#5ee0a8', fast: true },
  { id: 'sort', navn: 'Sort', farve: '#2a2438', fast: true },
  { id: 'hvid', navn: 'Hvid', farve: '#f2f0ff', fast: true },
];
export const LUFT = 0, GRAES = 1, JORD = 2, STEN = 3, SAND = 4, VAND = 5, STAMME = 6, LOEV = 7;

/** Klodserne man kan bygge med, i den rækkefølge de står i paletten. */
export const PALET = [8, 3, 1, 9, 10, 11, 12, 13, 15, 14];

export const erFast = t => !!BLOKKE[t] && BLOKKE[t].fast;
export const erVaeske = t => !!BLOKKE[t] && !!BLOKKE[t].vaeske;
export const erGennemsigtig = t => !BLOKKE[t] || !!BLOKKE[t].gennemsigtig;

/** '#63b356' → [0.39, 0.70, 0.34] (WebGL vil have 0-1). */
export function rgb(hex) {
  return [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
}

/* ---------- Spilleren ---------- */
export const SP_B = 0.6;           // spillerens bredde og dybde
export const SP_H = 1.7;           // og højde (fødder til isse)
export const OEJE = 1.6;           // øjenhøjde over fødderne
export const FART = 4.6;           // m/s på landjorden
export const FART_VAND = 2.4;      // langsommere i vandet
export const G = 26;               // tyngdekraft (m/s²) – lidt hårdere end virkeligheden
export const VJ = 8.2;             // hop: rækker godt en klods op (og lidt til)
export const SVOEM = 3.4;          // opad i vand, når man holder hop
export const MAKS_FALD = 28;       // faldet stopper her, så man ikke kan falde igennem

/* ---------- Tilfældighed ---------- */
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Blød værdistøj: et groft gitter af tilfældige tal, blødt interpoleret. */
function lavStoej(rng, celler) {
  const g = celler + 2;
  const v = new Float32Array(g * g);
  for (let i = 0; i < v.length; i++) v[i] = rng();
  const blod = t => t * t * (3 - 2 * t);
  return (x, z) => {
    const fx = (x / BREDDE) * celler, fz = (z / BREDDE) * celler;
    const x0 = Math.floor(fx), z0 = Math.floor(fz);
    const tx = blod(fx - x0), tz = blod(fz - z0);
    const a = v[z0 * g + x0], b = v[z0 * g + x0 + 1];
    const c = v[(z0 + 1) * g + x0], d = v[(z0 + 1) * g + x0 + 1];
    return (a + (b - a) * tx) * (1 - tz) + (c + (d - c) * tx) * tz;
  };
}

/* ---------- Opslag ---------- */
const indeks = (x, y, z) => (y * BREDDE + z) * BREDDE + x;
const indenfor = (x, y, z) =>
  x >= 0 && x < BREDDE && z >= 0 && z < BREDDE && y >= 0 && y < HOEJDE;

/** Klodsen på (x,y,z). Uden for verdenen: sten nedad og til siderne, luft opad. */
export function blok(v, x, y, z) {
  x = Math.floor(x); y = Math.floor(y); z = Math.floor(z);
  if (y >= HOEJDE) return LUFT;
  if (y < 0) return STEN;
  if (x < 0 || x >= BREDDE || z < 0 || z >= BREDDE) return STEN;   // den usynlige mur
  return v.b[indeks(x, y, z)];
}

/** Sætter en klods og husker ændringen, så verdenen kan gemmes. Sandt hvis noget skete. */
export function saetBlok(v, x, y, z, t) {
  x = Math.floor(x); y = Math.floor(y); z = Math.floor(z);
  if (!indenfor(x, y, z)) return false;
  const i = indeks(x, y, z);
  if (v.b[i] === t) return false;
  v.b[i] = t;
  v.aendringer.set(i, t);
  return true;
}

/** Højeste faste klods i søjlen (x,z); -1 hvis søjlen er tom. */
export function overflade(v, x, z) {
  for (let y = HOEJDE - 1; y >= 0; y--) if (erFast(blok(v, x, y, z))) return y;
  return -1;
}

/* ---------- Verdenen ---------- */
/** Bygger en ny verden ud fra et frø: bakker, søer, strande, træer og guldklodser. */
export function lavVerden(seed) {
  const rng = mulberry32(seed >>> 0);
  const v = { seed: seed >>> 0, b: new Uint8Array(BREDDE * HOEJDE * BREDDE), aendringer: new Map(), guld: [] };
  const bakker = lavStoej(rng, 4), detalje = lavStoej(rng, 9);

  const hoejder = new Int16Array(BREDDE * BREDDE);
  for (let z = 0; z < BREDDE; z++) {
    for (let x = 0; x < BREDDE; x++) {
      const raa = Math.round(3 + bakker(x, z) * 13 + detalje(x, z) * 4);
      const h = Math.max(1, Math.min(HOEJDE - 9, raa));      // plads til træer og luft over toppen
      hoejder[z * BREDDE + x] = h;
      for (let y = 0; y <= h; y++) {
        let t = STEN;
        if (y === h) t = h <= VAND_NIVEAU + 1 ? SAND : GRAES;
        else if (y > h - 3) t = JORD;
        v.b[indeks(x, y, z)] = t;
      }
      for (let y = h + 1; y <= VAND_NIVEAU; y++) v.b[indeks(x, y, z)] = VAND;
    }
  }

  // Træer på græsset, men ikke helt ude ved kanten (så løvet ikke bliver klippet)
  for (let z = 2; z < BREDDE - 2; z++) {
    for (let x = 2; x < BREDDE - 2; x++) {
      const h = hoejder[z * BREDDE + x];
      if (v.b[indeks(x, h, z)] !== GRAES || rng() > 0.035) continue;
      if (h + 7 >= HOEJDE) continue;
      const stamme = 3 + Math.floor(rng() * 3);
      for (let i = 1; i <= stamme; i++) v.b[indeks(x, h + i, z)] = STAMME;
      const top = h + stamme;
      for (let dy = -1; dy <= 2; dy++) {
        const r = dy >= 1 ? 1 : 2;
        for (let dz = -r; dz <= r; dz++) {
          for (let dx = -r; dx <= r; dx++) {
            if (Math.abs(dx) === r && Math.abs(dz) === r && dy < 1) continue;   // runde hjørner
            const nx = x + dx, ny = top + dy, nz = z + dz;
            if (!indenfor(nx, ny, nz)) continue;
            if (v.b[indeks(nx, ny, nz)] === LUFT) v.b[indeks(nx, ny, nz)] = LOEV;
          }
        }
      }
    }
  }

  // Startpladsen: midt i verdenen, oven på overfladen (og aldrig i en sø)
  const midt = Math.floor(BREDDE / 2);
  let sx = midt, sz = midt;
  for (let r = 0; r < BREDDE / 2 && overflade(v, sx, sz) < VAND_NIVEAU + 1; r++) {
    sx = midt + Math.round((rng() - 0.5) * r * 2);
    sz = midt + Math.round((rng() - 0.5) * r * 2);
    sx = Math.max(2, Math.min(BREDDE - 3, sx)); sz = Math.max(2, Math.min(BREDDE - 3, sz));
  }
  // Gør plads over hovedet, hvis man tilfældigvis lander under et træ
  for (let y = overflade(v, sx, sz) + 1; y <= overflade(v, sx, sz) + 3; y++) {
    if (indenfor(sx, y, sz)) v.b[indeks(sx, y, sz)] = LUFT;
  }
  v.start = { x: sx + 0.5, y: overflade(v, sx, sz) + 1, z: sz + 0.5 };

  v.guld = lavGuld(v, rng);
  return v;
}

export const GULD_ANTAL = 12;

/** Lægger guldklodserne ud: oven på overfladen, aldrig i vand og aldrig oven i hinanden. */
function lavGuld(v, rng) {
  const guld = [];
  for (let forsoeg = 0; forsoeg < 600 && guld.length < GULD_ANTAL; forsoeg++) {
    const x = 1 + Math.floor(rng() * (BREDDE - 2));
    const z = 1 + Math.floor(rng() * (BREDDE - 2));
    const y = overflade(v, x, z) + 1;
    if (y <= VAND_NIVEAU + 1 || y >= HOEJDE - 1) continue;          // ikke i søen
    if (blok(v, x, y, z) !== LUFT) continue;
    const p = { x: x + 0.5, y: y + 0.5, z: z + 0.5, taget: false };
    const langtFra = (a, b, mindst) => Math.hypot(a.x - b.x, a.z - b.z) >= mindst;
    if (!langtFra(p, v.start, 6)) continue;
    if (guld.some(g => !langtFra(p, g, 7))) continue;
    guld.push(p);
  }
  return guld;
}

/* ---------- Retninger ---------- */
/** Enhedsvektoren man kigger i. yaw 0 = mod -z, positiv yaw drejer mod -x. */
export function kigRetning(yaw, pitch) {
  const cp = Math.cos(pitch);
  return { x: -cp * Math.sin(yaw), y: Math.sin(pitch), z: -cp * Math.cos(yaw) };
}

/** Fremad og til højre på jorden – det bevægelsen regnes ud fra. */
export function gangRetning(yaw) {
  return {
    frem: { x: -Math.sin(yaw), z: -Math.cos(yaw) },
    hoejre: { x: Math.cos(yaw), z: -Math.sin(yaw) },
  };
}

/* ---------- Sigtet (hvilken klods kigger man på?) ---------- */
/**
 * Klodsen strålen fra `fra` i retningen `ret` rammer først.
 * Giver { x, y, z, nx, ny, nz }, hvor n… peger ud mod den tomme side
 * (dér en ny klods skal sættes), eller null hvis strålen ikke ramte noget.
 */
export function sigt(v, fra, ret, raekkevidde = 6) {
  let x = Math.floor(fra.x), y = Math.floor(fra.y), z = Math.floor(fra.z);
  const skridt = [Math.sign(ret.x), Math.sign(ret.y), Math.sign(ret.z)];
  const delta = [Math.abs(1 / ret.x), Math.abs(1 / ret.y), Math.abs(1 / ret.z)];
  const naeste = (p, i, s) => (s > 0 ? (Math.floor(p) + 1 - p) : s < 0 ? (p - Math.floor(p)) : Infinity) * delta[i];
  let t = [naeste(fra.x, 0, skridt[0]), naeste(fra.y, 1, skridt[1]), naeste(fra.z, 2, skridt[2])];
  let n = [0, 0, 0];

  for (let i = 0; i < 200; i++) {
    if (erFast(blok(v, x, y, z))) {
      if (!indenfor(x, y, z)) return null;          // den usynlige mur er ikke en klods
      return { x, y, z, nx: n[0], ny: n[1], nz: n[2] };
    }
    const akse = t[0] <= t[1] && t[0] <= t[2] ? 0 : t[1] <= t[2] ? 1 : 2;
    if (t[akse] > raekkevidde) return null;
    if (akse === 0) { x += skridt[0]; n = [-skridt[0], 0, 0]; }
    else if (akse === 1) { y += skridt[1]; n = [0, -skridt[1], 0]; }
    else { z += skridt[2]; n = [0, 0, -skridt[2]]; }
    t[akse] += delta[akse];
  }
  return null;
}

/* ---------- Fysik ---------- */
/** Rammer spillerens kasse (fødder i x,y,z) en fast klods? */
export function rammer(v, x, y, z) {
  const r = SP_B / 2;
  for (let bx = Math.floor(x - r); bx <= Math.floor(x + r - 1e-6); bx++) {
    for (let bz = Math.floor(z - r); bz <= Math.floor(z + r - 1e-6); bz++) {
      for (let by = Math.floor(y); by <= Math.floor(y + SP_H - 1e-6); by++) {
        if (erFast(blok(v, bx, by, bz))) return true;
      }
    }
  }
  return false;
}

/** Står spilleren i vand (målt ved brystet)? */
export function iVand(v, s) {
  return erVaeske(blok(v, s.x, s.y + SP_H * 0.55, s.z));
}

/** Ny spiller på verdenens startplads. */
export function nySpiller(v) {
  return { x: v.start.x, y: v.start.y, z: v.start.z, vy: 0, yaw: 0, pitch: -0.28, paaJorden: true, gang: 0 };
}

/**
 * Kan man bare træde op på klodsen foran i stedet for at gå ind i den?
 * Uden det ville hver eneste bakke kræve et hop, og så bliver det en plage at
 * gå rundt med tommelfingeren på en iPad. Præcis én klods op, aldrig mere.
 */
function trinOp(v, s, x, z) {
  const op = Math.floor(s.y + 1e-6) + 1;
  if (op - s.y > 1.01) return 0;
  if (rammer(v, x, op, z) || rammer(v, s.x, op, s.z)) return 0;   // ingen plads deroppe
  return op - s.y;
}

/** Flytter ét skridt ad gangen og standser mod klodser. */
function skub(v, s, dx, dy, dz, maaTrinOp) {
  if (dy) {
    const ny = s.y + dy;
    if (rammer(v, s.x, ny, s.z)) {
      if (dy < 0) { s.y = Math.ceil(ny - 1e-6); s.paaJorden = true; }
      else s.y = Math.floor(ny + SP_H) - SP_H - 1e-4;
      s.vy = 0;
    } else s.y = ny;
  }
  for (const [ax, az] of [[dx, 0], [0, dz]]) {
    if (!ax && !az) continue;
    const nx = s.x + ax, nz = s.z + az;
    if (!rammer(v, nx, s.y, nz)) { s.x = nx; s.z = nz; continue; }
    const op = maaTrinOp ? trinOp(v, s, nx, nz) : 0;
    if (op) { s.y += op; s.trin = (s.trin || 0) + op; s.x = nx; s.z = nz; s.paaJorden = true; }
  }
}

/**
 * Ét fysik-trin. `ind` er { frem, side, hop } hvor frem/side er -1…1.
 * Mutérer spilleren og giver den tilbage.
 */
export function flyt(v, s, ind, dt) {
  const vand = iVand(v, s);
  const { frem, hoejre } = gangRetning(s.yaw);
  let dx = (ind.frem || 0) * frem.x + (ind.side || 0) * hoejre.x;
  let dz = (ind.frem || 0) * frem.z + (ind.side || 0) * hoejre.z;
  const laengde = Math.hypot(dx, dz);
  if (laengde > 1) { dx /= laengde; dz /= laengde; }
  const fart = vand ? FART_VAND : FART;

  if (vand) {
    s.vy = ind.hop ? SVOEM : Math.max(-3, s.vy - G * 0.25 * dt);
    s.paaJorden = false;
  } else {
    if (ind.hop && s.paaJorden) { s.vy = VJ; s.paaJorden = false; }
    s.vy = Math.max(-MAKS_FALD, s.vy - G * dt);
  }

  // Antag at vi svæver, indtil et nedadgående skridt siger andet
  const stodImod = s.paaJorden;
  s.paaJorden = false;
  const ialt = Math.max(Math.abs(s.vy * dt), Math.hypot(dx, dz) * fart * dt);
  const trin = Math.max(1, Math.ceil(ialt / 0.2));            // aldrig mere end 20 cm ad gangen
  const maaTrinOp = stodImod || vand;                         // kun gående eller svømmende
  for (let i = 0; i < trin; i++) {
    skub(v, s, dx * fart * dt / trin, (s.vy * dt) / trin, dz * fart * dt / trin, maaTrinOp);
  }
  // Stod man stille på jorden, bliver man stående (et nul-skridt nedad rammer ingenting)
  if (!s.paaJorden && stodImod && s.vy <= 0 && rammer(v, s.x, s.y - 1e-3, s.z)) s.paaJorden = true;
  // Det automatiske skridt op tegnes blødt ud, så kameraet ikke hopper
  if (s.trin) s.trin = Math.max(0, s.trin - dt * 6);

  s.gang += laengde > 0.05 && (s.paaJorden || vand) ? dt * 9 : 0;
  if (laengde <= 0.05 && s.paaJorden) s.gang = 0;
  return s;
}

/* ---------- Bygge og rive ned ---------- */
/** Må der stå en klods dér – altså er feltet tomt og ikke inde i spilleren? */
export function kanBygge(v, s, x, y, z) {
  if (!indenfor(x, y, z)) return false;
  const t = blok(v, x, y, z);
  if (t !== LUFT && !erVaeske(t)) return false;
  const r = SP_B / 2;
  const overlap = (a1, a2, b1, b2) => a1 < b2 - 1e-6 && b1 < a2 - 1e-6;
  return !(overlap(x, x + 1, s.x - r, s.x + r) &&
           overlap(z, z + 1, s.z - r, s.z + r) &&
           overlap(y, y + 1, s.y, s.y + SP_H));
}

/* ---------- Gem og hent ---------- */
/** Verdenen som noget der kan stå i localStorage: frøet plus det man selv har ændret. */
export function serialiser(v, ekstra = {}) {
  return {
    version: 1,
    seed: v.seed,
    aendringer: [...v.aendringer].flat(),        // [indeks, type, indeks, type, …]
    guld: v.guld.map(g => (g.taget ? 1 : 0)),
    ...ekstra,
  };
}

/** Bygger verdenen op igen fra serialiser(). Kaster ved noget uforståeligt. */
export function genskab(gemt) {
  if (!gemt || gemt.version !== 1 || !Number.isFinite(gemt.seed)) throw new Error('ukendt gemt verden');
  const v = lavVerden(gemt.seed);
  const a = gemt.aendringer || [];
  for (let i = 0; i + 1 < a.length; i += 2) {
    const idx = a[i], t = a[i + 1];
    if (idx >= 0 && idx < v.b.length && BLOKKE[t]) { v.b[idx] = t; v.aendringer.set(idx, t); }
  }
  (gemt.guld || []).forEach((taget, i) => { if (v.guld[i]) v.guld[i].taget = !!taget; });
  return v;
}
