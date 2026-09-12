// Slotskamp – reglerne. Ren JS uden DOM, så index.html kun skal tegne, og
// motoren kan enhedstestes med `node --test test/unit/slotskamp.test.mjs`.
//
// Banen er 100 × 180 enheder: modstanderen har den øverste halvdel, man har
// selv den nederste. Midt over ligger floden, og der er kun to steder at komme
// over — broerne. Hver side har et kongetårn i midten og to vagttårne foran.
//
// Man har 8 kort i sin bunke, fire af dem på hånden. Et kort koster magi, og
// magien fyldes op af sig selv. Tropperne går selv frem mod nærmeste tårn og
// slår på det, de møder på vejen. Vælter et vagttårn, giver det en krone;
// vælter kongetårnet, er kampen slut med det samme.
//
// Tre ting er værd at huske i motoren:
//   1) Alt går gennem `spilKort()` — også botten. Så spiller den efter præcis
//      de samme regler som et menneske (magi, hånden, egen halvdel).
//   2) `tik()` deler tiden op i små skridt (0,05 sek.), så kampen forløber ens
//      uanset om man tegner 60 gange i sekundet eller spoler frem i en test.
//   3) Tilfældigheden bor i `stand.rnd` (seedet), så den samme kamp kan spilles
//      igen — det er dét, der gør botten testbar.

/* ---------- Banen ---------- */
export const BREDDE = 100, HØJDE = 180;
export const FLOD_Y = 90, FLOD_H = 9;      // floden ligger om FLOD_Y
export const BRO_X = [26, 74];             // venstre og højre bro
export const EGEN_GRÆNSE = 6;              // så langt fra floden må man sætte tropper

/* ---------- Magi og tid ---------- */
export const MAGI_MAKS = 10, MAGI_START = 5, MAGI_TID = 2.8;   // sek. pr. magi
export const KAMP_TID = 120, FORLÆNGET_TID = 60, DOBBELT_FRA = 40;
export const SPAWN_TID = 0.9;              // tropperne står stille, mens de lander
export const SYN = 17;                     // så langt kan en tropp se en fjende

/* ---------- Kortene ---------- */
// `mål`: 'alle' slår på alt, 'tårne' går udenom tropperne, 'enheder' (kanonen)
// kan ikke ramme tårne. `splash` er hvor stort et område et slag rammer.
export const KORT = [
  { id: 'skeletter', navn: 'Skeletter', tegn: '💀', magi: 2, slags: 'tropp', antal: 4,
    hp: 80, skade: 45, takt: 1.0, fart: 11, rækkevidde: 2, radius: 1.5, mål: 'alle',
    om: 'Fire små, der løber stærkt. De dør af ingenting, men kan æde en Kæmpe.' },
  { id: 'bueskytter', navn: 'Bueskytter', tegn: '🏹', magi: 3, slags: 'tropp', antal: 2,
    hp: 170, skade: 55, takt: 1.1, fart: 7, rækkevidde: 17, radius: 1.8, mål: 'alle',
    om: 'To, der skyder langt. Sæt dem bag noget, der kan tage tæskene.' },
  { id: 'ridder', navn: 'Ridder', tegn: '⚔️', magi: 3, slags: 'tropp', antal: 1,
    hp: 750, skade: 95, takt: 1.2, fart: 7, rækkevidde: 3, radius: 2.4, mål: 'alle',
    om: 'Masser af liv. Ham sætter man foran, så han tager slagene.' },
  { id: 'troldmand', navn: 'Troldmand', tegn: '🔮', magi: 5, slags: 'tropp', antal: 1,
    hp: 350, skade: 110, takt: 1.4, fart: 7, rækkevidde: 19, radius: 2, mål: 'alle', splash: 7,
    om: 'Skyder ild, der rammer flere på én gang. Sprænger en flok skeletter.' },
  { id: 'kæmpe', navn: 'Kæmpe', tegn: '🗿', magi: 5, slags: 'tropp', antal: 1,
    hp: 1900, skade: 170, takt: 1.5, fart: 4.5, rækkevidde: 3.5, radius: 3.2, mål: 'tårne',
    om: 'Går kun efter tårnene og går udenom alt andet. Langsom, men svær at vælte.' },
  { id: 'kanon', navn: 'Kanon', tegn: '💣', magi: 3, slags: 'bygning', antal: 1,
    hp: 560, skade: 85, takt: 0.9, fart: 0, rækkevidde: 19, radius: 2.4, mål: 'enheder', levetid: 25,
    om: 'Står stille og skyder alt, der kommer forbi. Forsvinder efter 25 sekunder.' },
  { id: 'ildkugle', navn: 'Ildkugle', tegn: '🔥', magi: 4, slags: 'trylle', område: 9,
    skade: 400, tårnSkade: 120, om: 'Kastes hvor som helst. Brænder en hel flok – og svider tårne.' },
  { id: 'lyn', navn: 'Lyn', tegn: '⚡', magi: 2, slags: 'trylle', område: 7.5,
    skade: 180, tårnSkade: 40, om: 'Billigt og lynhurtigt. Rydder skeletter og bueskytter væk.' },
];

export const KORT_VED = Object.fromEntries(KORT.map(k => [k.id, k]));

/* ---------- Tårnene ---------- */
export const TÅRN = {
  vagt: { hp: 1450, skade: 62, takt: 0.8, rækkevidde: 22, radius: 5 },
  konge: { hp: 2500, skade: 75, takt: 1.0, rækkevidde: 24, radius: 6 },
};

// Pladserne set fra den øverste side; den nederste spejles i midten.
const PLADSER = [
  { slags: 'konge', bane: null, x: 50, y: 14 },
  { slags: 'vagt', bane: 0, x: BRO_X[0], y: 44 },
  { slags: 'vagt', bane: 1, x: BRO_X[1], y: 44 },
];

/* ---------- Botten ---------- */
// Modstanderen bliver hårdere, jo flere sejre man har i træk: den tøver mindre,
// forsvarer sig oftere, bruger tryllekort og venter ikke så længe på magi.
// `nøl` er sekunder mellem beslutningerne, `forsvar` hvor tit den svarer på et
// angreb, og `sjusk` hvor tit den bare smider et tilfældigt kort et tilfældigt
// sted hen. Det er sjusket, der gør Nybegynder til en modstander, man kan slå.
export const BOT_NIVEAUER = [
  { navn: 'Nybegynder', nøl: 3.2, forsvar: 0.35, sjusk: 0.6, trylle: false, magiKrav: 5 },
  { navn: 'Øvet', nøl: 2.2, forsvar: 0.6, sjusk: 0.3, trylle: false, magiKrav: 5 },
  { navn: 'Skarp', nøl: 1.4, forsvar: 0.85, sjusk: 0.1, trylle: true, magiKrav: 6 },
  { navn: 'Mester', nøl: 0.9, forsvar: 1, sjusk: 0, trylle: true, magiKrav: 6 },
];

/** Hvor hård modstanderen er, når man har vundet `stime` gange i træk. */
export const niveauFraStime = stime => Math.min(BOT_NIVEAUER.length - 1, Math.floor(Math.max(0, stime) / 2));

/* ---------- Små hjælpere ---------- */
export const klem = (v, lav, høj) => (v < lav ? lav : v > høj ? høj : v);
const afst = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const modpart = side => (side === 'ned' ? 'op' : 'ned');

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Er punktet på `side`s egen halvdel? Tropperne må kun sættes der. */
export function egenHalvdel(side, x, y) {
  if (x < 4 || x > BREDDE - 4) return false;
  return side === 'ned'
    ? y > FLOD_Y + EGEN_GRÆNSE && y < HØJDE - 4
    : y < FLOD_Y - EGEN_GRÆNSE && y > 4;
}

/** Må kortet lægges her? Tryllekort må ramme hele banen, tropper kun egen side. */
export function kanPlacere(side, kortId, x, y) {
  const k = KORT_VED[kortId];
  if (!k) return false;
  if (k.slags === 'trylle') return x >= 0 && x <= BREDDE && y >= 0 && y <= HØJDE;
  return egenHalvdel(side, x, y);
}

/* ---------- Opsætning ---------- */
function blandet(rnd, liste) {
  const a = liste.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function nySpiller(rnd) {
  const bunke = blandet(rnd, KORT.map(k => k.id));
  return { magi: MAGI_START, hånd: bunke.slice(0, 4), kø: bunke.slice(4) };
}

function nyeTårne() {
  const t = [];
  let nr = 1;
  for (const side of ['op', 'ned'])
    for (const p of PLADSER) {
      const s = TÅRN[p.slags];
      t.push({
        nr: nr++, side, slags: p.slags, bane: p.bane,
        x: p.x, y: side === 'op' ? p.y : HØJDE - p.y,
        hp: s.hp, maxHp: s.hp, radius: s.radius, koel: 0,
        // Kongen sover, til et vagttårn falder, eller til han selv bliver ramt.
        vågen: p.slags !== 'konge',
      });
    }
  return t;
}

/**
 * En ny kamp. `niveau` er bottens sværhedsgrad (0-3), `bot: false` slår
 * modstanderen fra, så en test selv kan styre begge sider.
 */
export function nytSpil(opt = {}) {
  const seed = Number.isFinite(opt.seed) ? opt.seed >>> 0 : 12345;
  const rnd = mulberry32(seed);
  return {
    seed, rnd,
    fase: 'kamp',                     // kamp | forlænget | slut
    tid: opt.tid ?? KAMP_TID,
    nr: 1,
    enheder: [],
    tårne: nyeTårne(),
    effekter: [],
    hændelser: [],                    // tømmes af den, der tegner
    kroner: { ned: 0, op: 0 },
    spillere: { ned: nySpiller(rnd), op: nySpiller(rnd) },
    bot: opt.bot === false ? null : {
      niveau: klem(Math.round(opt.niveau ?? 0), 0, BOT_NIVEAUER.length - 1),
      ur: 1.5, bane: rnd() < 0.5 ? 0 : 1, baneUr: 20,
    },
    slut: null,
  };
}

/* ---------- At spille et kort ---------- */
const OPSTILLING = {
  1: [[0, 0]],
  2: [[-3, 0], [3, 0]],
  3: [[0, -3], [-3, 2], [3, 2]],
  4: [[-3, -3], [3, -3], [-3, 3], [3, 3]],
};

function nyEnhed(stand, side, k, x, y) {
  return {
    nr: stand.nr++, side, kort: k.id, navn: k.navn, tegn: k.tegn, slags: k.slags,
    x: klem(x, 2, BREDDE - 2), y: klem(y, 2, HØJDE - 2),
    hp: k.hp, maxHp: k.hp, skade: k.skade, takt: k.takt, fart: k.fart,
    rækkevidde: k.rækkevidde, radius: k.radius, mål: k.mål, splash: k.splash || 0,
    koel: 0, venter: SPAWN_TID, levetid: k.levetid ?? null,
    bane: x < BREDDE / 2 ? 0 : 1, målNr: null,
  };
}

/** Rammer et tryllekort ned: skade til alle fjender i området, mindre til tårne. */
function tryl(stand, side, k, x, y) {
  const fj = modpart(side);
  for (const e of stand.enheder)
    if (e.side === fj && e.hp > 0 && afst(e, { x, y }) <= k.område + e.radius) e.hp -= k.skade;
  for (const t of stand.tårne)
    if (t.side === fj && t.hp > 0 && afst(t, { x, y }) <= k.område + t.radius) {
      t.hp -= k.tårnSkade;
      t.vågen = true;                 // kongen vågner, hvis man vækker ham
    }
  stand.effekter.push({ slags: k.id, x, y, r: k.område, t: 0 });
}

/**
 * Spiller et kort fra hånden. Giver { ok } eller { ok: false, fejl }.
 * Hånden kører rundt som i forbilledet: det spillede kort ryger bagerst i køen,
 * og det forreste i køen tager dets plads.
 */
export function spilKort(stand, side, kortId, x, y) {
  if (stand.fase === 'slut') return { ok: false, fejl: 'Kampen er slut' };
  const spiller = stand.spillere[side];
  const k = KORT_VED[kortId];
  if (!k) return { ok: false, fejl: 'Det kort findes ikke' };
  const plads = spiller.hånd.indexOf(kortId);
  if (plads < 0) return { ok: false, fejl: 'Kortet er ikke på hånden' };
  if (spiller.magi < k.magi) return { ok: false, fejl: 'Ikke magi nok' };
  if (!kanPlacere(side, kortId, x, y)) return { ok: false, fejl: 'Kun på din egen halvdel' };

  spiller.magi -= k.magi;
  spiller.hånd[plads] = spiller.kø.shift();
  spiller.kø.push(kortId);

  if (k.slags === 'trylle') {
    tryl(stand, side, k, x, y);
  } else {
    const opstilling = OPSTILLING[k.antal] || OPSTILLING[1];
    for (const [dx, dy] of opstilling) {
      const e = nyEnhed(stand, side, k, x + dx, y + dy);
      if (!egenHalvdel(side, e.x, e.y)) {
        // Kanten af opstillingen må ikke skubbe en tropp over på fjendens side.
        e.y = side === 'ned' ? Math.max(e.y, FLOD_Y + EGEN_GRÆNSE + 1) : Math.min(e.y, FLOD_Y - EGEN_GRÆNSE - 1);
        e.x = klem(e.x, 4, BREDDE - 4);
      }
      stand.enheder.push(e);
    }
    stand.effekter.push({ slags: 'landing', x, y, r: 5, t: 0 });
  }
  return { ok: true };
}

/** Det næste kort, der kommer ind på hånden. */
export const næsteKort = spiller => spiller.kø[0];

/* ---------- Mål og bevægelse ---------- */

/** Det tårn en tropp går efter: vagttårnet i sin egen bane, ellers kongen. */
function målTårn(stand, e) {
  const fj = modpart(e.side);
  const vagt = stand.tårne.find(t => t.side === fj && t.slags === 'vagt' && t.bane === e.bane && t.hp > 0);
  if (vagt) return vagt;
  const andre = stand.tårne.filter(t => t.side === fj && t.hp > 0);
  andre.sort((a, b) => afst(e, a) - afst(e, b));
  return andre[0] || null;
}

/** Hvad slår troppen på lige nu? Nærmeste fjende inden for synsvidde, ellers tårnet. */
function findMål(stand, e) {
  const fj = modpart(e.side);
  if (e.mål !== 'tårne') {
    let bedst = null, bedstD = Infinity;
    for (const a of stand.enheder) {
      if (a.side !== fj || a.hp <= 0) continue;
      const d = afst(e, a) - a.radius;
      if (d <= SYN && d < bedstD) { bedstD = d; bedst = a; }
    }
    if (bedst) return bedst;
  }
  if (e.mål === 'enheder') return null;      // kanonen kan ikke skyde på tårne
  return målTårn(stand, e);
}

/**
 * Hvor troppen går hen for at nå sit mål. Ligger målet på den anden side af
 * floden, går den først hen mod sin bro — man kan ikke svømme.
 */
function gåMod(e, mål) {
  const hverSinSide = (e.y - FLOD_Y) * (mål.y - FLOD_Y) < 0;
  if (!hverSinSide) return { x: mål.x, y: mål.y };
  const broX = BRO_X[e.bane];
  const over = mål.y < e.y ? -1 : 1;         // hvilken vej over floden
  return { x: broX, y: FLOD_Y + over * (FLOD_H / 2 + 3) };
}

/** Skade på ét mål (og på naboerne, hvis slaget er et splash-slag). */
function slå(stand, e, mål) {
  const fj = modpart(e.side);
  mål.hp -= e.skade;
  if (mål.slags === 'konge') mål.vågen = true;      // slår man på kongen, vågner han
  if (e.splash) {
    for (const a of stand.enheder)
      if (a !== mål && a.side === fj && a.hp > 0 && afst(a, mål) <= e.splash + a.radius) a.hp -= e.skade;
  }
  stand.effekter.push({ slags: 'slag', x: mål.x, y: mål.y, r: e.splash || 1.5, t: 0, side: e.side });
}

/* ---------- Botten ---------- */
const harRåd = (spiller, id) => spiller.hånd.includes(id) && KORT_VED[id].magi <= spiller.magi;

/** Klemmer et punkt ind på `side`s egen halvdel, så en tropp kan sættes der. */
const egenPlads = (side, x, y) => ({
  x: klem(x, 6, BREDDE - 6),
  y: side === 'ned'
    ? klem(y, FLOD_Y + EGEN_GRÆNSE + 2, HØJDE - 8)
    : klem(y, 8, FLOD_Y - EGEN_GRÆNSE - 2),
});

/**
 * Ét botte-træk for `side`. Den ser på, om der er noget på vej mod dens egne
 * tårne: er der det, forsvarer den sig med det, der passer (kanon mod Kæmpen,
 * troldmand mod flokken); ellers sparer den op og sender selv noget over broen.
 *
 * Den er skrevet for begge sider, så den kan spille mod sig selv — det er sådan
 * sværhedsgraderne er skruet sammen (se test/unit/slotskamp.test.mjs).
 */
export function botTræk(stand, side, n, bane) {
  const mig = stand.spillere[side];
  const fj = modpart(side);
  const frem = side === 'ned' ? -1 : 1;         // den vej, fjenden ligger
  const kan = id => harRåd(mig, id) && (n.trylle || KORT_VED[id].slags !== 'trylle');

  // Sjusk: smid et tilfældigt kort et tilfældigt sted på egen halvdel.
  if (stand.rnd() < (n.sjusk || 0)) {
    const valg = mig.hånd.filter(kan);
    if (!valg.length) return false;
    const id = valg[Math.floor(stand.rnd() * valg.length)];
    const p = egenPlads(side, 10 + stand.rnd() * (BREDDE - 20), FLOD_Y - frem * (10 + stand.rnd() * 60));
    return spilKort(stand, side, id, p.x, p.y).ok;
  }

  const trusler = stand.enheder.filter(e => e.side === fj && e.hp > 0 && (e.y - FLOD_Y) * frem < 16);
  if (trusler.length && stand.rnd() < n.forsvar) {
    const tung = trusler.find(e => e.mål === 'tårne') || trusler.slice().sort((a, b) => b.hp - a.hp)[0];
    const sværm = trusler.length >= 3;
    const ønsker = sværm
      ? ['troldmand', 'lyn', 'ildkugle', 'bueskytter', 'ridder', 'kanon']
      : tung.mål === 'tårne'
        ? ['kanon', 'skeletter', 'ridder', 'bueskytter', 'troldmand']
        : ['ridder', 'bueskytter', 'kanon', 'skeletter', 'troldmand'];
    const valg = ønsker.find(kan);
    if (valg) {
      const k = KORT_VED[valg];
      if (k.slags === 'trylle') {
        if (spilKort(stand, side, valg, tung.x, tung.y).ok) return true;
      } else {
        const p = egenPlads(side, tung.x + (stand.rnd() - 0.5) * 6, tung.y - frem * 12);
        if (spilKort(stand, side, valg, p.x, p.y).ok) return true;
      }
    }
  }

  if (mig.magi >= n.magiKrav) {
    const valg = ['kæmpe', 'ridder', 'troldmand', 'bueskytter', 'skeletter'].find(id => harRåd(mig, id));
    if (valg) {
      const p = egenPlads(side, BRO_X[bane] + (stand.rnd() - 0.5) * 10, FLOD_Y - frem * (12 + stand.rnd() * 10));
      return spilKort(stand, side, valg, p.x, p.y).ok;
    }
  }
  return false;
}

/** Modstanderens ur: vælger angrebsside og lader `botTræk` handle med mellemrum. */
export function botTænker(stand, dt) {
  const b = stand.bot;
  if (!b || stand.fase === 'slut') return;
  b.baneUr -= dt;
  if (b.baneUr <= 0) {                        // skift angrebsside en gang imellem
    b.baneUr = 15 + stand.rnd() * 15;
    b.bane = stand.rnd() < 0.5 ? 0 : 1;
    const hul = stand.tårne.find(t => t.side === 'ned' && t.slags === 'vagt' && t.hp <= 0);
    if (hul) b.bane = hul.bane;                // hellere hullet end det hele tårn
  }
  b.ur -= dt;
  if (b.ur > 0) return;
  const n = BOT_NIVEAUER[b.niveau];
  b.ur = n.nøl * (0.7 + 0.6 * stand.rnd());
  botTræk(stand, 'op', n, b.bane);
}

/* ---------- Et skridt i kampen ---------- */
function magiTakt(stand) {
  return stand.fase === 'forlænget' || stand.tid <= DOBBELT_FRA ? 2 : 1;
}

function ryddOp(stand) {
  for (const e of stand.enheder)
    if (e.hp <= 0) stand.effekter.push({ slags: 'død', x: e.x, y: e.y, r: e.radius, t: 0, side: e.side });
  stand.enheder = stand.enheder.filter(e => e.hp > 0);

  for (const t of stand.tårne) {
    if (t.hp > 0 || t.væltet) continue;
    t.væltet = true;
    t.hp = 0;
    stand.kroner[modpart(t.side)] += t.slags === 'konge' ? 3 - stand.kroner[modpart(t.side)] : 1;
    stand.hændelser.push({ slags: 'tårn-væltet', side: t.side, tårn: t.slags });
    stand.effekter.push({ slags: 'væltet', x: t.x, y: t.y, r: t.radius * 1.6, t: 0 });
    // Falder et vagttårn, vågner kongen bagved.
    if (t.slags === 'vagt') for (const k of stand.tårne) if (k.side === t.side && k.slags === 'konge') k.vågen = true;
    if (t.slags === 'konge') afslut(stand, modpart(t.side), 'konge');
    else if (stand.fase === 'forlænget') afslut(stand, modpart(t.side), 'pludselig');
  }
}

function afslut(stand, vinder, grund) {
  if (stand.slut) return;
  stand.fase = 'slut';
  stand.slut = { vinder, grund, kroner: { ...stand.kroner } };
  stand.hændelser.push({ slags: 'slut', vinder, grund });
}

function skridt(stand, dt) {
  if (stand.fase === 'slut') return;

  /* Tiden og magien */
  stand.tid = Math.max(0, stand.tid - dt);
  const takt = magiTakt(stand);
  for (const side of ['ned', 'op']) {
    const s = stand.spillere[side];
    s.magi = Math.min(MAGI_MAKS, s.magi + (dt / MAGI_TID) * takt);
  }
  botTænker(stand, dt);

  /* Tropperne */
  for (const e of stand.enheder) {
    if (e.hp <= 0) continue;
    if (e.venter > 0) { e.venter -= dt; continue; }
    if (e.levetid != null) {
      e.levetid -= dt;
      if (e.levetid <= 0) { e.hp = 0; continue; }
    }
    e.koel = Math.max(0, e.koel - dt);

    const mål = findMål(stand, e);
    e.målNr = mål ? mål.nr : null;
    if (!mål) continue;

    const d = afst(e, mål) - mål.radius;
    if (d <= e.rækkevidde + e.radius) {
      if (e.koel <= 0) { slå(stand, e, mål); e.koel = e.takt; }
      continue;
    }
    if (!e.fart) continue;                      // bygninger bliver stående

    const punkt = gåMod(e, mål);
    const dx = punkt.x - e.x, dy = punkt.y - e.y;
    const l = Math.hypot(dx, dy) || 1;
    e.x = klem(e.x + (dx / l) * e.fart * dt, 1, BREDDE - 1);
    e.y = klem(e.y + (dy / l) * e.fart * dt, 1, HØJDE - 1);
  }

  /* Tropperne står ikke oven i hinanden */
  for (let i = 0; i < stand.enheder.length; i++)
    for (let j = i + 1; j < stand.enheder.length; j++) {
      const a = stand.enheder[i], b = stand.enheder[j];
      if (!a.fart && !b.fart) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      const mindst = a.radius + b.radius;
      if (d >= mindst) continue;
      const skub = (mindst - d) * 0.5;
      const ux = d < 0.001 ? 1 : dx / d, uy = d < 0.001 ? 0 : dy / d;
      if (a.fart) { a.x -= ux * skub; a.y -= uy * skub; }
      if (b.fart) { b.x += ux * skub; b.y += uy * skub; }
    }

  /* Tårnene skyder */
  for (const t of stand.tårne) {
    if (t.hp <= 0 || !t.vågen) continue;
    const s = TÅRN[t.slags];
    t.koel = Math.max(0, t.koel - dt);
    if (t.koel > 0) continue;
    const fj = modpart(t.side);
    let bedst = null, bedstD = Infinity;
    for (const e of stand.enheder) {
      if (e.side !== fj || e.hp <= 0 || e.venter > 0) continue;
      const d = afst(t, e);
      if (d <= s.rækkevidde + e.radius && d < bedstD) { bedstD = d; bedst = e; }
    }
    if (!bedst) continue;
    bedst.hp -= s.skade;
    t.koel = s.takt;
    stand.effekter.push({ slags: 'skud', x: bedst.x, y: bedst.y, r: 1.5, t: 0, fra: { x: t.x, y: t.y }, side: t.side });
  }

  ryddOp(stand);

  /* Pynten ældes */
  for (const f of stand.effekter) f.t += dt;
  stand.effekter = stand.effekter.filter(f => f.t < 0.6);

  /* Tiden løb ud */
  if (stand.fase === 'kamp' && stand.tid <= 0) {
    if (stand.kroner.ned !== stand.kroner.op) {
      afslut(stand, stand.kroner.ned > stand.kroner.op ? 'ned' : 'op', 'tid');
    } else {
      stand.fase = 'forlænget';
      stand.tid = FORLÆNGET_TID;
      stand.hændelser.push({ slags: 'forlænget' });
    }
  } else if (stand.fase === 'forlænget' && stand.tid <= 0) {
    // Faldt der intet tårn i forlænget spilletid, vinder den, hvis mest
    // forslåede tårn står bedst — ellers ville alt for mange kampe ende i ingenting.
    const svagest = side => Math.min(...tårne(stand, side).map(t => t.hp / t.maxHp));
    const ned = svagest('ned'), op = svagest('op');
    afslut(stand, Math.abs(ned - op) < 0.001 ? null : (ned > op ? 'ned' : 'op'),
      Math.abs(ned - op) < 0.001 ? 'uafgjort' : 'liv');
  }
}

/**
 * Spoler kampen `dt` sekunder frem i små, faste skridt. Den, der tegner, skal
 * selv sørge for ikke at komme med et kæmpe spring (et skjult faneblad) — her
 * spoles der villigt så langt frem, som der bliver bedt om.
 */
export function tik(stand, dt) {
  let rest = Math.max(0, dt);
  while (rest > 0 && stand.fase !== 'slut') {
    const s = Math.min(0.05, rest);
    skridt(stand, s);
    rest -= s;
  }
  return stand;
}

/** Tårnene på en side, til tegning og til testene. */
export const tårne = (stand, side) => stand.tårne.filter(t => t.side === side);
