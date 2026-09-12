// Blokblast – reglerne. Ren JS uden DOM, så index.html kun skal tegne, og
// motoren kan enhedstestes med `node --test test/unit/blokblast.test.mjs`.
//
// Brættet er ét fladt array på SIDE × SIDE felter. Et tomt felt er null, et
// fyldt felt er brikkens farve — så tegningen ikke skal slå noget op.
//
// Der er ingen tyngdekraft og ingen rotation: man får tre brikker ad gangen og
// lægger dem, som de er. Fylder man en hel række eller søjle, forsvinder den.
// Spillet er slut, når ingen af de brikker, der ligger fremme, kan være nogen
// steder — derfor er `nogenPasser` den vigtigste funktion her.

export const SIDE = 8;
export const BAKKE = 3;                 // så mange brikker ligger fremme ad gangen

/* ---------- Brikkerne ---------- */

const normaliser = celler => {
  const mx = Math.min(...celler.map(c => c[0])), my = Math.min(...celler.map(c => c[1]));
  return celler.map(([x, y]) => [x - mx, y - my]).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
};
/** Samme brik drejet en kvart omgang. */
const drej = celler => normaliser(celler.map(([x, y]) => [-y, x]));
const nøgle = celler => celler.map(c => c.join(',')).join(' ');

// Grundformerne. Hver af dem foldes ud til sine drejninger herunder, så et
// «hjørne» bliver til fire brikker. `vægt` er hvor tit formen trækkes: de små
// og de firkantede er de venlige, så dem er der flest af.
const GRUND = [
  { id: 'prik', navn: 'Prik', farve: '#ffd447', vægt: 6, celler: [[0, 0]] },
  { id: 'to', navn: 'To', farve: '#3ddc84', vægt: 8, celler: [[0, 0], [1, 0]] },
  { id: 'tre', navn: 'Tre', farve: '#4d8dff', vægt: 8, celler: [[0, 0], [1, 0], [2, 0]] },
  { id: 'fire', navn: 'Fire', farve: '#a97bff', vægt: 6, celler: [[0, 0], [1, 0], [2, 0], [3, 0]] },
  { id: 'fem', navn: 'Fem', farve: '#ff4d5e', vægt: 3, celler: [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]] },
  { id: 'firkant', navn: 'Firkant', farve: '#ff8a3d', vægt: 7, celler: [[0, 0], [1, 0], [0, 1], [1, 1]] },
  { id: 'stor', navn: 'Stor firkant', farve: '#ff5fa2', vægt: 2, celler: [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1], [0, 2], [1, 2], [2, 2]] },
  { id: 'plade', navn: 'Plade', farve: '#25c8c0', vægt: 3, celler: [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1]] },
  { id: 'hjørne', navn: 'Hjørne', farve: '#3ddc84', vægt: 8, celler: [[0, 0], [0, 1], [1, 1]] },
  { id: 'vinkel', navn: 'Vinkel', farve: '#4d8dff', vægt: 4, celler: [[0, 0], [0, 1], [0, 2], [1, 2], [2, 2]] },
  { id: 't', navn: 'T', farve: '#a97bff', vægt: 4, celler: [[0, 0], [1, 0], [2, 0], [1, 1]] },
  { id: 'trappe', navn: 'Trappe', farve: '#ff8a3d', vægt: 3, celler: [[1, 0], [2, 0], [0, 1], [1, 1]] },
];

/** Alle brikker: grundformerne foldet ud til deres drejninger. */
export const FORMER = [];
for (const g of GRUND) {
  let celler = normaliser(g.celler);
  const sete = new Set();
  for (let i = 0; i < 4; i++) {
    const n = nøgle(celler);
    if (!sete.has(n)) {
      sete.add(n);
      FORMER.push({
        id: sete.size === 1 ? g.id : `${g.id}-${sete.size - 1}`,
        navn: g.navn, farve: g.farve, vægt: g.vægt, celler,
        bredde: Math.max(...celler.map(c => c[0])) + 1,
        højde: Math.max(...celler.map(c => c[1])) + 1,
      });
    }
    celler = drej(celler);
  }
}

/** Brikkerne slået op på id — bruges når et gemt spil hentes frem igen. */
export const FORM = Object.fromEntries(FORMER.map(f => [f.id, f]));

const VÆGT_I_ALT = FORMER.reduce((s, f) => s + f.vægt, 0);

/* ---------- Brættet ---------- */

export const nytBræt = () => new Array(SIDE * SIDE).fill(null);
export const felt = (bræt, x, y) => bræt[y * SIDE + x];

/** Kan brikken ligge med sit øverste venstre hjørne i (x, y)? */
export function kanLægges(bræt, form, x, y) {
  if (!form) return false;
  for (const [cx, cy] of form.celler) {
    const nx = x + cx, ny = y + cy;
    if (nx < 0 || ny < 0 || nx >= SIDE || ny >= SIDE) return false;
    if (bræt[ny * SIDE + nx] !== null) return false;
  }
  return true;
}

/** Er der overhovedet plads til brikken? */
export function passerNogetsteds(bræt, form) {
  if (!form) return false;
  for (let y = 0; y + form.højde <= SIDE; y++)
    for (let x = 0; x + form.bredde <= SIDE; x++)
      if (kanLægges(bræt, form, x, y)) return true;
  return false;
}

/** Kan mindst én af brikkerne i bakken lægges? Ellers er spillet slut. */
export const nogenPasser = (bræt, brikker) => brikker.some(f => f && passerNogetsteds(bræt, f));

/** De rækker og søjler, der er helt fyldte. */
export function fuldeLinjer(bræt) {
  const rækker = [], søjler = [];
  for (let y = 0; y < SIDE; y++) {
    let fuld = true;
    for (let x = 0; x < SIDE; x++) if (bræt[y * SIDE + x] === null) { fuld = false; break; }
    if (fuld) rækker.push(y);
  }
  for (let x = 0; x < SIDE; x++) {
    let fuld = true;
    for (let y = 0; y < SIDE; y++) if (bræt[y * SIDE + x] === null) { fuld = false; break; }
    if (fuld) søjler.push(x);
  }
  return { rækker, søjler };
}

/**
 * Point for ét træk: ét point pr. felt man lægger, og 10 × linjer² for det man
 * rydder, ganget op med stimen (to rydninger i træk giver ×1,5, fire i træk
 * ×2,5). Derfor er det hele kunsten at rydde to linjer på én gang — og at
 * blive ved.
 */
export function pointFor(antalFelter, antalLinjer, stime) {
  if (!antalLinjer) return antalFelter;
  const faktor = 1 + Math.min(Math.max(stime, 1) - 1, 3) * 0.5;
  return antalFelter + Math.round(10 * antalLinjer * antalLinjer * faktor);
}

/**
 * Lægger brikken og rydder de linjer, der blev fulde. Giver et *nyt* bræt
 * tilbage sammen med point, stime og hvilke felter der forsvandt (til
 * animationen). Passer brikken ikke, kommer der null.
 */
export function læg(bræt, form, x, y, stime = 0) {
  if (!kanLægges(bræt, form, x, y)) return null;
  const nyt = bræt.slice();
  for (const [cx, cy] of form.celler) nyt[(y + cy) * SIDE + (x + cx)] = form.farve;

  const linjer = fuldeLinjer(nyt);
  const antalLinjer = linjer.rækker.length + linjer.søjler.length;
  const ryddede = [];
  const fjern = (fx, fy) => {
    if (nyt[fy * SIDE + fx] === null) return;
    ryddede.push({ x: fx, y: fy, farve: nyt[fy * SIDE + fx] });
    nyt[fy * SIDE + fx] = null;
  };
  for (const r of linjer.rækker) for (let i = 0; i < SIDE; i++) fjern(i, r);
  for (const s of linjer.søjler) for (let i = 0; i < SIDE; i++) fjern(s, i);

  const nyStime = antalLinjer ? stime + 1 : 0;
  return {
    bræt: nyt, linjer, antalLinjer, ryddede, stime: nyStime,
    point: pointFor(form.celler.length, antalLinjer, nyStime),
  };
}

/* ---------- Nye brikker ---------- */

function trækForm(rnd) {
  let t = rnd() * VÆGT_I_ALT;
  for (const f of FORMER) { t -= f.vægt; if (t <= 0) return f; }
  return FORMER[FORMER.length - 1];
}

/**
 * Tre nye brikker til bakken. Vi prøver op til 20 gange at trække et sæt, hvor
 * mindst én brik kan være på brættet: ellers kunne spillet slutte i samme nu,
 * brikkerne kom, og det føles som snyd. Er brættet så fyldt, at intet passer,
 * kommer det sidste sæt alligevel — så er det slut, og det er ens egen skyld.
 */
export function trækBrikker(bræt, rnd, antal = BAKKE) {
  let første = null;
  for (let forsøg = 0; forsøg < 20; forsøg++) {
    const sæt = Array.from({ length: antal }, () => trækForm(rnd));
    if (!første) første = sæt;
    if (nogenPasser(bræt, sæt)) return sæt;
  }
  return første;
}

/* ---------- En simpel spiller (bruges af testene) ---------- */

/** Tomme felter, der er lukket inde til alle sider – dem vil man helst undgå. */
function huller(bræt) {
  let n = 0;
  for (let y = 0; y < SIDE; y++)
    for (let x = 0; x < SIDE; x++) {
      if (bræt[y * SIDE + x] !== null) continue;
      const fri = (fx, fy) => fx >= 0 && fy >= 0 && fx < SIDE && fy < SIDE && bræt[fy * SIDE + fx] === null;
      if (!fri(x - 1, y) && !fri(x + 1, y) && !fri(x, y - 1) && !fri(x, y + 1)) n++;
    }
  return n;
}

/** Hvor mange af brikkens kanter der lander op ad noget – pakket er godt. */
function naboer(bræt, form, x, y) {
  const egen = new Set(form.celler.map(([cx, cy]) => `${x + cx},${y + cy}`));
  let n = 0;
  for (const [cx, cy] of form.celler) {
    const fx = x + cx, fy = y + cy;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = fx + dx, ny = fy + dy;
      if (egen.has(`${nx},${ny}`)) continue;
      if (nx < 0 || ny < 0 || nx >= SIDE || ny >= SIDE) { n++; continue; }
      if (bræt[ny * SIDE + nx] !== null) n++;
    }
  }
  return n;
}

/**
 * Det træk en fornuftig spiller ville lave: ryd linjer, lad være med at lukke
 * huller inde, og pak brikkerne op ad hinanden. Testen spiller spillet igennem
 * med den, og index.html bruger den til knappen «Vis mig et træk».
 * Giver { nr, form, x, y, værdi } eller null, hvis intet passer.
 */
export function bedsteTræk(bræt, brikker) {
  let bedst = null;
  for (let nr = 0; nr < brikker.length; nr++) {
    const form = brikker[nr];
    if (!form) continue;
    for (let y = 0; y + form.højde <= SIDE; y++)
      for (let x = 0; x + form.bredde <= SIDE; x++) {
        if (!kanLægges(bræt, form, x, y)) continue;
        const r = læg(bræt, form, x, y);
        const værdi = 200 * r.antalLinjer - 6 * huller(r.bræt) + 2 * naboer(bræt, form, x, y);
        if (!bedst || værdi > bedst.værdi) bedst = { nr, form, x, y, værdi };
      }
  }
  return bedst;
}
