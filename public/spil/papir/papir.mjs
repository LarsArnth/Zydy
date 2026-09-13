// Papirøen – reglerne bag Selmas ønske «Papir io 2».
//
// Man er en klat på et stykke ternet papir. Kører man ud fra sit eget område,
// trækker man en streg efter sig; kommer man hjem igen, bliver **hele sløjfen**
// ens – også det, andre havde farvet inde i den. Kører nogen over en streg, der
// er ude, dør den, stregen bliver væk, og området forsvinder fra papiret.
//
// Ren JS uden DOM, så index.html kun skal tegne, og reglerne kan enhedstestes
// med `node --test test/unit/papir.test.mjs`.
//
// Tre ting er hele spillet:
//
//   1) Erobringen er en flod udefra. Når sløjfen lukkes, farves stregen, og
//      derefter flyder vi ind fra papirets kant gennem alt, der *ikke* er mit.
//      Det, floden ikke kan nå, ligger inde i sløjfen og bliver mit. Så behøver
//      vi ikke vide, hvilken vej sløjfen gik – og huller i ens eget område
//      giver sig selv.
//   2) Man er kun sårbar, mens man er ude. Hjemme på sit eget område er der
//      ingen streg at køre over, og det er derfor, spillet handler om at turde
//      blive længe nok ude til, at sløjfen bliver stor.
//   3) Mister man hele sit område, er man ude. Ellers ville en spiller uden
//      hjem køre rundt for evigt uden nogensinde at kunne lukke en sløjfe.

/* ---------- Tal man kan skrue på ---------- */
export const N = 40;                 // papiret er N × N felter
export const FELTER = N * N;
export const FART = 7.4;             // felter i sekundet for spilleren
export const BOT_FART = [6.4, 6.9, 7.2, 6.6];
export const BASE = 2;               // radius: (2·BASE+1)² = 5 × 5 felter, når man kommer ind
export const SPREDNING = 14;         // felter mellem to klatter, når nogen kommer ind på papiret
export const RESPAWN = 2;            // sekunder før en bot kommer igen
export const JAGT_AFSTAND = 6;       // så tæt skal en fremmed streg være, før en jagende bot går efter den
export const JAGT_SKRIDT = 12;       // … og så længe holder den ved, før den går hjem igen

/** 0 = højre, 1 = ned, 2 = venstre, 3 = op. */
export const DX = [1, 0, -1, 0];
export const DY = [0, 1, 0, -1];
export const modsat = d => (d + 2) % 4;
export const drej = (d, v) => (d + v + 4) % 4;

export const MIN_FARVE = '#18c98a';
/** Modstanderne. `aggro` er chancen for, at en tur ud bliver en jagt på en fremmed streg. */
export const BOTTER = [
  { navn: 'Bo', farve: '#ff4d5e', aggro: 0.05 },
  { navn: 'Ida', farve: '#2f9ae0', aggro: 0.12 },
  { navn: 'Mikkel', farve: '#8f6bff', aggro: 0.2 },
];

/* ---------- Tilfældighed man kan gentage ---------- */
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- En ny bane ---------- */

function lavSpiller(id, navn, bot, fart, farve, aggro) {
  return {
    id, navn, farve,
    mig: id === 1,           // mennesket – ikke det samme som !bot: testen lader botten styre spilleren
    bot: !!bot,
    fart, aggro: aggro || 0,
    cx: 0, cy: 0, dir: 0, næste: null, t: 0,
    ude: false,              // er jeg ude fra mit eget område (og altså sårbar)?
    streg: [],               // felterne i stregen, i den rækkefølge de blev lagt
    levende: true, genfoedes: 0,
    felter: 0, bedste: 0, drab: 0, sløjfer: 0,
    // Bottens plan: ud i `maal` felter, om ad siden i `sideMaal`, og så hjem.
    fase: 'hjem', iFase: 0, maal: 4, sideMaal: 3, dreje: 1, jagt: false, jagtTilbage: 0,
  };
}

/** Et friskt stykke papir med spilleren og `bots` modstandere. */
export function nyBane({ seed = 1, bots = 3, navn = 'Dig' } = {}) {
  const s = {
    seed: seed >>> 0,
    r: mulberry32(seed >>> 0),
    ejer: new Int8Array(FELTER),      // 0 = tomt papir, ellers spillerens id
    spor: new Int8Array(FELTER),      // 0 = ingen streg, ellers stregens ejer
    spillere: [],
    t: 0,
    slut: null,                       // null | 'doed' | 'vundet'
    grund: null,                      // 'mur' | 'egen' | 'ramt' | 'overtaget'
  };
  s.spillere.push(lavSpiller(1, navn, false, FART, MIN_FARVE, 0));
  for (let i = 0; i < bots && i < BOTTER.length; i++) {
    const b = BOTTER[i];
    s.spillere.push(lavSpiller(i + 2, b.navn, true, BOT_FART[i], b.farve, b.aggro));
  }
  for (const p of s.spillere) saetBase(s, p);
  return s;
}

/**
 * Giver spilleren et nyt 5 × 5-område et frit sted på papiret. Der ledes først
 * efter en plet med luft omkring og langt fra de andre; er papiret ved at være
 * fyldt, tages en plet uden. Er der slet ingen plads, svares `false`, og botten
 * prøver igen om lidt.
 */
export function saetBase(s, p) {
  const plads = (cx, cy, luft, spredning) => {
    for (let y = cy - luft; y <= cy + luft; y++) {
      for (let x = cx - luft; x <= cx + luft; x++) {
        if (x < 0 || y < 0 || x >= N || y >= N) return false;
        const i = x + y * N;
        if (s.ejer[i] || s.spor[i]) return false;
      }
    }
    // Langt fra de andre. Uden det kan to klatter starte side om side, og så
    // kører man over hinandens streger, før nogen har nået at lave en sløjfe.
    return !s.spillere.some(q => q !== p && q.levende
      && Math.abs(q.cx - cx) + Math.abs(q.cy - cy) < spredning);
  };
  const kant = BASE + 1;                       // aldrig klods op ad papirets kant
  let cx = -1, cy = -1;
  for (const [luft, spredning] of [[BASE + 2, SPREDNING], [BASE + 2, SPREDNING / 2], [BASE, 0]]) {
    for (let forsøg = 0; forsøg < 300 && cx < 0; forsøg++) {
      const x = kant + Math.floor(s.r() * (N - 2 * kant));
      const y = kant + Math.floor(s.r() * (N - 2 * kant));
      if (plads(x, y, luft, spredning)) { cx = x; cy = y; }
    }
    if (cx >= 0) break;
  }
  if (cx < 0) return false;

  for (let y = cy - BASE; y <= cy + BASE; y++) {
    for (let x = cx - BASE; x <= cx + BASE; x++) s.ejer[x + y * N] = p.id;
  }
  p.cx = cx; p.cy = cy;
  p.dir = Math.floor(s.r() * 4) % 4;
  p.næste = null; p.t = 0;
  p.ude = false; p.streg.length = 0;
  p.levende = true; p.genfoedes = 0;
  p.fase = 'hjem'; p.iFase = 0;
  taelFelter(s);
  return true;
}

/** Tæller alles felter op igen. Kaldes hver gang papiret har skiftet farve. */
export function taelFelter(s) {
  const tal = new Int32Array(s.spillere.length + 1);
  for (let i = 0; i < FELTER; i++) tal[s.ejer[i]]++;
  for (const p of s.spillere) {
    p.felter = tal[p.id];
    if (p.felter > p.bedste) p.bedste = p.felter;
  }
}

export const procent = p => (p.felter * 100) / FELTER;
/** Scoren på toplisten: hele procent af papiret, man har haft på ét tidspunkt. */
export const score = p => Math.floor((p.bedste * 100) / FELTER);

/* ---------- Spillets gang ---------- */

/**
 * Ét skridt på `dt` sekunder for alle. Giver hændelserne tilbage, så index.html
 * kan lave lyd og pynt: {slags: 'erobret'|'doed'|'genfoedt', id, …}.
 */
export function tik(s, dt) {
  const h = [];
  if (s.slut) return h;
  s.t += dt;
  for (const p of s.spillere) {
    if (!p.levende) {
      if (!p.bot) continue;                        // mennesket kommer ikke igen – runden er slut
      p.genfoedes -= dt;
      if (p.genfoedes <= 0) {
        if (saetBase(s, p)) h.push({ slags: 'genfoedt', id: p.id });
        else p.genfoedes = 1;                      // intet frit papir lige nu – prøv igen om lidt
      }
      continue;
    }
    p.t += p.fart * dt;
    let vagt = 0;
    while (p.t >= 1 && p.levende && !s.slut && vagt++ < 6) { p.t -= 1; skridt(s, p, h); }
    if (!p.levende) p.t = 0;
  }
  return h;
}

/**
 * Ét felt frem for én spiller: flyt, og gør så det, feltet siger. Kaldes af
 * tik() – og direkte af enhedstesten, som gerne vil køre en bestemt rute.
 */
export function skridt(s, p, h = []) {
  if (!p.levende || s.slut) return h;
  const nx = p.cx + DX[p.dir], ny = p.cy + DY[p.dir];
  if (nx < 0 || ny < 0 || nx >= N || ny >= N) { doed(s, p, 'mur', h, null); return h; }
  p.cx = nx; p.cy = ny;
  const i = nx + ny * N;

  const streg = s.spor[i];
  if (streg === p.id) { doed(s, p, 'egen', h, null); return h; }
  if (streg) doed(s, s.spillere[streg - 1], 'ramt', h, p);

  if (s.ejer[i] === p.id) {
    if (p.ude) {
      const vundet = erobre(s, p, h);
      p.ude = false; p.sløjfer++;
      h.push({ slags: 'erobret', id: p.id, felter: vundet });
      if (p.mig && p.felter >= FELTER) s.slut = 'vundet';
    }
  } else {
    s.spor[i] = p.id;
    p.streg.push(i);
    p.ude = true;
  }
  vaelgRetning(s, p);
  return h;
}

/** Retningen til det næste felt vælges, når man lander på et – aldrig midt imellem. */
function vaelgRetning(s, p) {
  if (p.bot) p.næste = botRetning(s, p);
  if (p.næste != null && p.næste !== modsat(p.dir)) p.dir = p.næste;
  p.næste = null;
}

/** Spillerens tryk. Vender man 180°, ville man køre ind i sin egen streg – så det gør man ikke. */
export function styr(p, dir) {
  if (dir == null || dir < 0 || dir > 3) return false;
  if (dir === modsat(p.dir) || dir === p.dir) return false;
  p.næste = dir;
  return true;
}

/**
 * Sløjfen lukkes: stregen bliver til område, og alt papir, der ikke kan nås
 * fra kanten uden at gå gennem mit, bliver mit. Giver antallet af nye felter.
 */
export function erobre(s, p, h = []) {
  let vundet = p.streg.length;
  for (const i of p.streg) { s.spor[i] = 0; s.ejer[i] = p.id; }
  p.streg.length = 0;

  // Floden udefra: alt mit spærrer.
  const naaet = new Uint8Array(FELTER);
  const stak = [];
  const prøv = i => { if (!naaet[i] && s.ejer[i] !== p.id) { naaet[i] = 1; stak.push(i); } };
  for (let x = 0; x < N; x++) { prøv(x); prøv(x + (N - 1) * N); }
  for (let y = 0; y < N; y++) { prøv(y * N); prøv(N - 1 + y * N); }
  while (stak.length) {
    const i = stak.pop(), x = i % N, y = (i / N) | 0;
    if (x > 0) prøv(i - 1);
    if (x < N - 1) prøv(i + 1);
    if (y > 0) prøv(i - N);
    if (y < N - 1) prøv(i + N);
  }
  for (let i = 0; i < FELTER; i++) {
    if (!naaet[i] && s.ejer[i] !== p.id) { s.ejer[i] = p.id; vundet++; }
  }
  taelFelter(s);

  // Tog jeg hele nogens område, er de ude – ellers kørte de rundt uden et hjem
  // at lukke sløjfen i.
  for (const q of s.spillere) if (q !== p && q.levende && q.felter === 0) doed(s, q, 'overtaget', h, p);
  return vundet;
}

/** Ude: stregen og hele området forsvinder fra papiret. */
function doed(s, p, grund, h, af) {
  if (!p.levende) return;
  p.levende = false;
  p.genfoedes = RESPAWN;
  p.ude = false;
  for (const i of p.streg) s.spor[i] = 0;
  p.streg.length = 0;
  for (let i = 0; i < FELTER; i++) if (s.ejer[i] === p.id) s.ejer[i] = 0;
  if (af) af.drab++;
  taelFelter(s);
  h.push({ slags: 'doed', id: p.id, grund, af: af ? af.id : 0 });
  if (p.mig) { s.slut = 'doed'; s.grund = grund; }
}

/* ---------- Modstanderne ---------- */

/** Kan man overhovedet gå den vej uden at dø i samme skridt? */
function trygt(s, p, d) {
  const x = p.cx + DX[d], y = p.cy + DY[d];
  if (x < 0 || y < 0 || x >= N || y >= N) return false;
  return s.spor[x + y * N] !== p.id;
}

/** … og er der stadig en vej videre bagefter? Uden det maler botten sig selv op i et hjørne. */
function frit(s, p, d) {
  const næste = { cx: p.cx + DX[d], cy: p.cy + DY[d], id: p.id };
  return [0, 1, 2, 3].some(d2 => d2 !== modsat(d) && trygt(s, næste, d2));
}

/** Nærmeste felt jeg selv ejer (Manhattan-afstand), eller -1 hvis jeg intet har. */
function naermesteHjem(s, p) {
  let bedst = -1, bedstD = 1e9;
  for (let i = 0; i < FELTER; i++) {
    if (s.ejer[i] !== p.id) continue;
    const d = Math.abs((i % N) - p.cx) + Math.abs(((i / N) | 0) - p.cy);
    if (d < bedstD) { bedstD = d; bedst = i; }
  }
  return bedst;
}

/** Nærmeste fremmede streg inden for JAGT_AFSTAND, eller -1. */
function naermesteStreg(s, p) {
  let bedst = -1, bedstD = JAGT_AFSTAND + 1;
  for (let i = 0; i < FELTER; i++) {
    const e = s.spor[i];
    if (!e || e === p.id) continue;
    const d = Math.abs((i % N) - p.cx) + Math.abs(((i / N) | 0) - p.cy);
    if (d < bedstD) { bedstD = d; bedst = i; }
  }
  return bedst;
}

/** Retningen hen mod et felt – den akse der er længst fra. */
function modFelt(p, i) {
  if (i < 0) return p.dir;
  const dx = (i % N) - p.cx, dy = ((i / N) | 0) - p.cy;
  if (Math.abs(dx) >= Math.abs(dy)) return dx === 0 ? (dy > 0 ? 1 : 3) : (dx > 0 ? 0 : 2);
  return dy > 0 ? 1 : 3;
}

/** En ny tur ud: hvor langt ud, hvor langt om ad siden, hvilken vej rundt – og jager vi? */
function nyPlan(s, p) {
  p.fase = 'ud'; p.iFase = 0;
  p.maal = 3 + Math.floor(s.r() * 6);
  p.sideMaal = 2 + Math.floor(s.r() * 5);
  p.dreje = s.r() < 0.5 ? 1 : 3;
  p.jagt = s.r() < p.aggro;
  p.jagtTilbage = JAGT_SKRIDT;
}

/**
 * Hvad botten gør. Den tegner et rektangel: ud i papiret, om ad siden og hjem
 * igen – og den kigger ét skridt frem, så den ikke kører ind i sin egen streg.
 * Er `jagt` slået til for turen, går den efter en fremmed streg, den kommer
 * tæt på. Bruges også af testene til at lade en bot spille spillerens klat.
 */
export function botRetning(s, p) {
  const bag = modsat(p.dir);
  const kan = [0, 1, 2, 3].filter(d => d !== bag && trygt(s, p, d));
  if (!kan.length) return p.dir;                 // ingen vej ud – så kører den ind i det
  const gode = kan.filter(d => frit(s, p, d));
  const valg = gode.length ? gode : kan;

  let ønsket;
  if (!p.ude) {
    if (p.fase !== 'ud') nyPlan(s, p);
    ønsket = p.dir;                               // lige ud, til vi er ude af vores eget
  } else {
    p.iFase++;
    const bytte = p.jagt && p.jagtTilbage > 0 ? naermesteStreg(s, p) : -1;
    if (bytte >= 0) {
      p.jagtTilbage--;
      if (p.jagtTilbage <= 0) { p.jagt = false; p.fase = 'hjem'; p.iFase = 0; }
      ønsket = modFelt(p, bytte);
    } else if (p.fase === 'ud' && p.iFase >= p.maal) {
      p.fase = 'side'; p.iFase = 0;
      ønsket = drej(p.dir, p.dreje);
    } else if (p.fase === 'side' && p.iFase >= p.sideMaal) {
      p.fase = 'hjem'; p.iFase = 0;
      ønsket = drej(p.dir, p.dreje);
    } else if (p.fase === 'hjem') {
      ønsket = modFelt(p, naermesteHjem(s, p));
    } else {
      ønsket = p.dir;
    }
  }
  if (valg.includes(ønsket)) return ønsket;
  if (valg.includes(p.dir)) return p.dir;
  return valg[0];
}

/* ---------- Til testene ---------- */

/** Kører en hel runde uden browser, hvor alle fire klatter styres af botten. */
export function kør(seed, sekunder, dt = 1 / 60) {
  const s = nyBane({ seed, navn: 'Bot' });
  s.spillere[0].bot = true;
  for (let i = 0; i < Math.round(sekunder / dt) && !s.slut; i++) tik(s, dt);
  return s;
}
