// Slanger – reglerne bag Lars' ønske «Snake.io-klon i firkanter som Papirøen».
//
// Man er en slange på en plade af N × N felter og kan kun køre i fire
// retninger. Perlerne gør en længere, de andre slanger er farlige: kører man
// hovedet ind i en krop – sin egen eller en andens – er man færdig. Dør en
// slange, bliver dens krop til perler, som de andre kan spise.
//
// Ren JS uden DOM, så index.html kun skal tegne, og reglerne kan enhedstestes
// med `node --test test/unit/slanger.test.mjs`.
//
// Tre ting er hele spillet:
//
//   1) **Styringen er to drejninger, ikke fire retninger.** sving(p, ±1) lægger
//      en drejning i køen, og køen tømmes ét felt ad gangen – så to hurtige
//      tryk giver to sving lige efter hinanden, som på en gammel Nokia. Det er
//      derfor, køen er en liste og ikke bare «næste retning».
//   2) **Maden bor i faste pladser.** Plads nr. j's n'te position regnes ud af
//      frøet med madPos(seed, j, n) – så når to venner spiller sammen, skal de
//      kun blive enige om, *hvor mange gange* hver plads er spist, ikke om
//      hvor maden ligger. s.spist[j] er det tal.
//   3) **Halen flytter sig i samme skridt som hovedet.** Feltet, ens egen hale
//      lige forlader, må man gerne køre ind i – ellers kan en kort slange ikke
//      engang køre i ring. Alle andres felter, også haler, er død.
/* ---------- Tal man kan skrue på ---------- */
export const N = 32;                  // pladen er N × N felter
export const FELTER = N * N;
export const FART = 7;                // felter i sekundet for spilleren
export const BOT_FART = [6.3, 6.8, 7.2];
export const START_LAENGDE = 4;
export const VOKS_PR_MAD = 2;         // felter længere pr. perle
export const MAD = 24;                // faste madpladser på pladen
export const EKSTRA_MAKS = 240;       // højst så mange perler fra døde slanger
export const RESPAWN = 2;             // sekunder før en bot kommer igen
export const SPREDNING = 10;          // felter mellem to hoveder, når en slange sættes ind

/** 0 = højre, 1 = ned, 2 = venstre, 3 = op. */
export const DX = [1, 0, -1, 0];
export const DY = [0, 1, 0, -1];
export const modsat = d => (d + 2) % 4;
/** drej(d, 1) er med uret (højre-knappen), drej(d, 3) er mod uret (venstre-knappen). */
export const drej = (d, v) => (d + v + 4) % 4;

export const MIN_FARVE = '#18c98a';
/** Vennens slange, når to spiller sammen. Hver ser sig selv som den grønne. */
export const VEN_FARVE = '#ff8f3a';
export const BOTTER = [
  { navn: 'Otto', farve: '#ff4d5e' },
  { navn: 'Mille', farve: '#2f9ae0' },
  { navn: 'Aksel', farve: '#8f6bff' },
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

/* ---------- Maden ---------- */

/**
 * Hvor ligger madplads nr. `j`, efter den er spist `n` gange? Regnes ud af
 * frøet alene, så to telefoner altid er enige uden at sende positioner rundt.
 * Aldrig helt op ad kanten – dér er det for farligt at skulle hente den.
 */
export function madPos(seed, j, n) {
  const r = mulberry32((((seed >>> 0) ^ Math.imul(j + 1, 2654435761)) + Math.imul(n + 1, 40503)) >>> 0);
  const x = 1 + Math.floor(r() * (N - 2));
  const y = 1 + Math.floor(r() * (N - 2));
  return { x, y, felt: x + y * N };
}

/** Al mad på pladen lige nu: de faste pladser plus perlerne fra døde slanger. */
export function alleMad(s) {
  const ud = [];
  for (let j = 0; j < MAD; j++) {
    const m = madPos(s.seed, j, s.spist[j]);
    ud.push({ x: m.x, y: m.y, felt: m.felt, slot: j });
  }
  for (const i of s.ekstra) ud.push({ x: i % N, y: (i / N) | 0, felt: i, slot: -1 });
  return ud;
}

/* ---------- En ny plade ---------- */

function lavSlange(id, navn, bot, fart, farve) {
  return {
    id, navn, farve,
    mig: id === 1,            // mennesket – ikke det samme som !bot: testen lader botten styre spilleren
    bot: !!bot,
    fjern: false,             // vennens slange, når to spiller sammen: den kommer fra rummet
    fart,
    krop: [],                 // felterne, hovedet først
    dir: 0, t: 0,
    koe: [],                  // retninger der venter på næste felt (højst 3)
    voks: 0,                  // så mange skridt vokser halen ikke med
    levende: true, genfoedes: 0,
    bedste: START_LAENGDE, mad: 0, drab: 0,
    doede: 0, sidsteGrund: null, sidsteAf: 0,
  };
}

/**
 * En frisk plade med spilleren og `bots` modstandere.
 *
 * `ven` er navnet på en ven, man spiller sammen med: så er der ingen bots, og
 * slange nr. 2 er vennens – den flyttes ikke her, men af sammen.mjs. `vaert`
 * siger, om det er mig, der inviterede; de to slanger skal sættes ind i den
 * samme rækkefølge på begge telefoner, ellers bytter de plads.
 */
export function nyBane({ seed = 1, bots = 3, navn = 'Dig', ven = null, vaert = true } = {}) {
  const s = {
    seed: seed >>> 0,
    r: mulberry32(seed >>> 0),
    spist: new Int32Array(MAD),       // så mange gange er hver madplads spist
    ekstra: [],                       // perler fra døde slanger (felter)
    spillere: [],
    sammen: !!ven,
    t: 0,
    slut: null,                       // null | 'doed'
    grund: null,                      // 'mur' | 'egen' | 'ramt'
  };
  s.spillere.push(lavSlange(1, navn, false, FART, MIN_FARVE));
  if (ven) {
    const v = lavSlange(2, ven, false, FART, VEN_FARVE);
    v.fjern = true;
    s.spillere.push(v);
  } else {
    for (let i = 0; i < bots && i < BOTTER.length; i++) {
      const b = BOTTER[i];
      s.spillere.push(lavSlange(i + 2, b.navn, true, BOT_FART[i], b.farve));
    }
  }
  const orden = ven && !vaert ? [s.spillere[1], s.spillere[0]] : s.spillere;
  for (const p of orden) saetSlange(s, p);
  return s;
}

/** Alle felter, der er slange på lige nu. */
function optagne(s) {
  const brugt = new Set();
  for (const q of s.spillere) if (q.levende) for (const i of q.krop) brugt.add(i);
  return brugt;
}

/**
 * Sætter slangen ind et frit sted: hovedet med luft omkring og langt fra de
 * andre, kroppen strakt ud bag hovedet. Er pladen ved at være fyldt, tages en
 * plads uden luftkrav. Helt umuligt? Så svares `false`, og botten prøver igen.
 */
export function saetSlange(s, p) {
  const brugt = optagne(s);
  const prøv = (cx, cy, dir, spredning) => {
    // Kroppen bagud og et par felter frem skal være fri – ellers dør man i
    // det samme sekund, man kommer ind.
    for (let k = -2; k < START_LAENGDE; k++) {
      const x = cx - DX[dir] * k, y = cy - DY[dir] * k;
      if (x < 1 || y < 1 || x >= N - 1 || y >= N - 1) return false;
      if (brugt.has(x + y * N)) return false;
    }
    return !s.spillere.some(q => q !== p && q.levende && q.krop.length
      && Math.abs(q.krop[0] % N - cx) + Math.abs(((q.krop[0] / N) | 0) - cy) < spredning);
  };
  let fundet = null;
  for (const spredning of [SPREDNING, SPREDNING / 2, 0]) {
    for (let forsøg = 0; forsøg < 300 && !fundet; forsøg++) {
      const cx = 3 + Math.floor(s.r() * (N - 6));
      const cy = 3 + Math.floor(s.r() * (N - 6));
      const dir = Math.floor(s.r() * 4) % 4;
      if (prøv(cx, cy, dir, spredning)) fundet = { cx, cy, dir };
    }
    if (fundet) break;
  }
  if (!fundet) return false;
  p.krop = [];
  for (let k = 0; k < START_LAENGDE; k++) {
    p.krop.push(fundet.cx - DX[fundet.dir] * k + (fundet.cy - DY[fundet.dir] * k) * N);
  }
  p.dir = fundet.dir;
  p.t = 0; p.koe = []; p.voks = 0;
  p.levende = true; p.genfoedes = 0;
  return true;
}

/** Scoren på toplisten: den længste, slangen har været. */
export const score = p => p.bedste;

/* ---------- Spillets gang ---------- */

/**
 * Ét skridt på `dt` sekunder for alle. Giver hændelserne tilbage, så
 * index.html kan lave lyd og pynt: {slags: 'mad'|'doed'|'genfoedt', id, …}.
 */
export function tik(s, dt) {
  const h = [];
  if (s.slut) return h;
  s.t += dt;
  for (const p of s.spillere) {
    if (p.fjern) continue;                        // vennens slange kommer fra rummet
    if (!p.levende) {
      if (!p.bot && !s.sammen) continue;          // mennesket kommer ikke igen – runden er slut
      p.genfoedes -= dt;
      if (p.genfoedes <= 0) {
        if (saetSlange(s, p)) h.push({ slags: 'genfoedt', id: p.id });
        else p.genfoedes = 1;                     // ingen plads lige nu – prøv igen om lidt
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
 * Ét felt frem for én slange. Kaldes af tik() – og direkte af enhedstesten,
 * som gerne vil køre en bestemt rute.
 */
export function skridt(s, p, h = []) {
  if (!p.levende || s.slut) return h;

  // Retningen fra køen – men aldrig baglæns ind i sin egen hals.
  while (p.koe.length) {
    const d = p.koe.shift();
    if (d !== p.dir && d !== modsat(p.dir)) { p.dir = d; break; }
  }

  const hx = p.krop[0] % N + DX[p.dir], hy = ((p.krop[0] / N) | 0) + DY[p.dir];
  if (hx < 0 || hy < 0 || hx >= N || hy >= N) { doed(s, p, 'mur', h, null); return h; }
  const c = hx + hy * N;

  // Slange på feltet? Ens egen hale flytter sig i samme skridt og er undtaget.
  for (const q of s.spillere) {
    if (!q.levende || !q.krop.length) continue;
    const k = q.krop.indexOf(c);
    if (k < 0) continue;
    if (q === p && k === q.krop.length - 1 && p.voks === 0) continue;
    doed(s, p, q === p ? 'egen' : 'ramt', h, q === p ? null : q);
    return h;
  }

  p.krop.unshift(c);

  // Mad: de faste pladser og perlerne fra døde slanger
  let spiste = 0;
  for (let j = 0; j < MAD; j++) {
    if (madPos(s.seed, j, s.spist[j]).felt === c) {
      s.spist[j]++; spiste++;
      h.push({ slags: 'mad', id: p.id, slot: j });
    }
  }
  const e = s.ekstra.indexOf(c);
  if (e >= 0) {
    s.ekstra.splice(e, 1); spiste++;
    h.push({ slags: 'mad', id: p.id, slot: -1 });
  }
  if (spiste) { p.voks += spiste * VOKS_PR_MAD; p.mad += spiste; }

  if (p.voks > 0) p.voks--;
  else p.krop.pop();
  if (p.krop.length > p.bedste) p.bedste = p.krop.length;

  if (p.bot) {
    const d = botRetning(s, p);
    if (d !== modsat(p.dir)) p.dir = d;
  }
  return h;
}

/**
 * Spillerens tryk på en drejeknap: `v` er 1 (med uret, højre-knappen) eller
 * -1 (mod uret, venstre-knappen). Lægges i kø, så to hurtige tryk giver to
 * sving lige efter hinanden – det er hele Nokia-fidusen.
 */
export function sving(p, v) {
  if (v !== 1 && v !== -1) return false;
  if (p.koe.length >= 3) return false;
  const basis = p.koe.length ? p.koe[p.koe.length - 1] : p.dir;
  p.koe.push(drej(basis, v === 1 ? 1 : 3));
  return true;
}

/** Et tryk med en fast retning (piletasterne). Baglæns er lige ind i halsen – nej. */
export function styr(p, dir) {
  if (dir == null || dir < 0 || dir > 3) return false;
  const basis = p.koe.length ? p.koe[p.koe.length - 1] : p.dir;
  if (dir === basis || dir === modsat(basis)) return false;
  if (p.koe.length >= 3) return false;
  p.koe.push(dir);
  return true;
}

/**
 * Slangen er død: kroppen bliver til perler (hvert andet felt), som de andre
 * kan spise. Spiller man sammen med en ven, springes perlerne over – de skulle
 * ellers holdes ens på to telefoner, og det er ikke det værd.
 */
export function doed(s, p, grund, h = [], af = null) {
  if (!p.levende) return h;
  p.levende = false;
  p.genfoedes = RESPAWN;
  if (!s.sammen) {
    for (let k = 0; k < p.krop.length; k += 2) {
      if (s.ekstra.length >= EKSTRA_MAKS) break;
      if (!s.ekstra.includes(p.krop[k])) s.ekstra.push(p.krop[k]);
    }
  }
  p.krop = [];
  p.koe = []; p.voks = 0;
  if (af) af.drab++;
  p.doede++;
  p.sidsteGrund = grund;
  p.sidsteAf = af ? af.id : 0;
  h.push({ slags: 'doed', id: p.id, grund, af: af ? af.id : 0 });
  if (p.mig && !s.sammen) { s.slut = 'doed'; s.grund = grund; }
  return h;
}

/* ---------- Modstanderne ---------- */

/** Kan man overhovedet gå den vej uden at dø i samme skridt? */
function trygt(s, p, hoved, d) {
  const x = hoved % N + DX[d], y = ((hoved / N) | 0) + DY[d];
  if (x < 0 || y < 0 || x >= N || y >= N) return false;
  const c = x + y * N;
  for (const q of s.spillere) {
    if (!q.levende || !q.krop.length) continue;
    const k = q.krop.indexOf(c);
    if (k < 0) continue;
    if (q === p && k === q.krop.length - 1 && p.voks === 0) continue;
    return false;
  }
  return true;
}

/** … og er der stadig en vej videre bagefter? Uden det kører botten i blindgyder. */
function frit(s, p, hoved, d) {
  const næste = hoved + DX[d] + DY[d] * N;
  return [0, 1, 2, 3].some(d2 => d2 !== modsat(d) && trygt(s, p, næste, d2));
}

/** Retningen hen mod et felt – den akse der er længst fra. */
function modFelt(p, felt) {
  const hoved = p.krop[0];
  const dx = felt % N - hoved % N, dy = ((felt / N) | 0) - ((hoved / N) | 0);
  if (Math.abs(dx) >= Math.abs(dy)) return dx === 0 ? (dy > 0 ? 1 : 3) : (dx > 0 ? 0 : 2);
  return dy > 0 ? 1 : 3;
}

/** Nærmeste mad (Manhattan-afstand), eller -1 hvis der ingen er. */
function naermesteMad(s, p) {
  const hoved = p.krop[0], hx = hoved % N, hy = (hoved / N) | 0;
  let bedst = -1, bedstD = 1e9;
  for (const m of alleMad(s)) {
    const d = Math.abs(m.x - hx) + Math.abs(m.y - hy);
    if (d < bedstD) { bedstD = d; bedst = m.felt; }
  }
  return bedst;
}

/**
 * Hvad botten gør: hen mod den nærmeste perle, uden at køre ind i noget – og
 * med ét skridt frem i tankerne, så den ikke maler sig selv op i et hjørne.
 * Bruges også af testene til at lade en bot spille spillerens slange.
 */
export function botRetning(s, p) {
  const hoved = p.krop[0], bag = modsat(p.dir);
  const kan = [0, 1, 2, 3].filter(d => d !== bag && trygt(s, p, hoved, d));
  if (!kan.length) return p.dir;                 // ingen vej ud – så kører den ind i det
  const gode = kan.filter(d => frit(s, p, hoved, d));
  const valg = gode.length ? gode : kan;

  const mål = naermesteMad(s, p);
  const ønsket = mål >= 0 ? modFelt(p, mål) : p.dir;
  // Et lille lune gør, at to bots ikke kører i takt efter den samme perle.
  if (valg.includes(ønsket) && s.r() < 0.92) return ønsket;
  if (valg.includes(p.dir) && s.r() < 0.8) return p.dir;
  return valg[Math.floor(s.r() * valg.length)];
}

/* ---------- Til testene ---------- */

/** Kører en hel runde uden browser, hvor alle slanger styres af botten. */
export function kør(seed, sekunder, dt = 1 / 60) {
  const s = nyBane({ seed, navn: 'Bot' });
  s.spillere[0].bot = true;
  for (let i = 0; i < Math.round(sekunder / dt) && !s.slut; i++) tik(s, dt);
  return s;
}
