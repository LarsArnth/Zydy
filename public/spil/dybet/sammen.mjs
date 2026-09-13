/*
  Dybet – «spil sammen»: to venner ned i den samme labyrint på hver sin telefon.

  Rummet (public/spil/rum.js + src/rum.mjs) har kun plads til en lille kasse
  JSON, så hele labyrinten kan ikke sendes frem og tilbage. Det behøver den
  heller ikke: den er *genereret* ud fra ét tal. Begge telefoner laver den samme
  labyrint ud fra `seed` + dybden, og i rummet står kun det, der har flyttet
  sig — hvor holdet står, hvad monstrene har tilbage af liv, hvilke kister der
  er åbnet, og de to heltes egne tal. Det holder stillingen på et par tusind
  tegn, selv dybt nede.

  Reglerne er enkeltmands-Dybets (motor.mjs), med tre tilføjelser:
    · Holdet går sammen. Man skiftes til at vælge vej, når vejen deler sig —
      derimellem går spillet selv videre, præcis som når man spiller alene.
    · I kamp skiftes man til at slå, og monsteret slår igen på den, der lige slog.
    · Falder den ene, kæmper den anden videre og rejser makkeren op, når kampen
      er slut. Går begge ned, er turen slut, og begge nåede den samme dybde.

  Alt herinde er ren JavaScript uden DOM, så det kan enhedstestes med
  `node --test test/unit/dybet-sammen.test.mjs`.

  Overblik:
    nytSammen, dungeonFroe        – et nyt fælles spil, og labyrintens eget frø
    udfoer                        – vælg vej / åbn kiste / angrib, og gå selv videre
    kampTur                       – én spillers træk i kampen
    pak, pakUd                    – stillingen til og fra rummet
    omskriv                       – «Du angriber» → «Selma angriber», når man ser med
*/
import * as M from './motor.mjs';

export const ROLLER = ['vaert', 'gaest'];
export const anden = r => (r === 'vaert' ? 'gaest' : 'vaert');

/** Hvor mange skridt spillet højst går af sig selv, før vi giver op (værn mod løkker). */
const MAKS_SKRIDT = 400;

/**
 * Labyrintens eget frø på en dybde. Det er med vilje uafhængigt af
 * kampterningerne: to telefoner kaster ikke de samme terninger i samme
 * rækkefølge, men de skal lave nøjagtig den samme labyrint.
 */
export function dungeonFroe(seed, niveau) { return (seed + niveau * 2654435761) >>> 0; }

/** En frisk helt med et navn. Samme startudstyr som når man spiller alene. */
export function nyHelt(navn) {
  return { ...M.lavSpiller(), navn: navn || 'Helt', nede: false };
}

/** Den helt, det er tur til. Motorens funktioner regner på `spil.spiller`. */
function saetAktiv(spil) { spil.spiller = spil.helte[spil.tur]; return spil.spiller; }

/** Hvem skal have turen? Den ønskede – med mindre hen ligger ned. */
function naesteTur(spil, oensket) {
  return spil.helte[oensket].nede ? anden(oensket) : oensket;
}

export function minTur(spil, rolle) {
  return spil.tur === rolle && !spil.helte[rolle].nede && (spil.fase === 'udforsk' || spil.fase === 'kamp');
}

function nytNiveau(spil) {
  spil.dungeon = M.lavDungeon(spil.niveau, M.lavRng(dungeonFroe(spil.seed, spil.niveau)));
  spil.pos = { x: spil.dungeon.start.x, y: spil.dungeon.start.y };
  spil.retning = spil.dungeon.start.retning;
  spil.set = new Array(spil.dungeon.B * spil.dungeon.B).fill(0);
  spil.kamp = null;
  spil.fase = 'udforsk';
  saetAktiv(spil);
  M.markerSet(spil);
}

/** Et nyt fælles spil. `navne` er { vaert, gaest } – værten begynder. */
export function nytSammen(seed, navne = {}) {
  const spil = {
    seed: seed >>> 0, niveau: 1, tur: 'vaert', fase: 'udforsk',
    helte: { vaert: nyHelt(navne.vaert), gaest: nyHelt(navne.gaest) },
    // Kampterningerne har deres eget frø, så de ikke roder med labyrinten.
    rng: M.lavRng((seed ^ 0x5f356495) >>> 0),
    dungeon: null, pos: null, retning: 0, set: null, kamp: null,
    skridt: 0, vej: [], log: [], ned: 0, spiller: null,
  };
  nytNiveau(spil);
  return spil;
}

/* ---------- Bevægelse ---------- */

/*
  `spil.vej` er de skridt, der blev taget – så den anden telefon kan animere
  præcis den samme tur i stedet for at hoppe. Et tal 0-3 betyder «drej den vej
  og gå ét felt», 4-7 betyder «drej til (tallet − 4) uden at gå».
*/
const gaaet = r => r;
const drejet = r => r + 4;

function nedTrappen(spil) {
  spil.niveau++;
  for (const r of ROLLER) {
    const h = spil.helte[r], s = M.stats(h);
    h.nede = false;
    h.hp = Math.max(1, Math.min(s.maxHp, h.hp + Math.round(s.maxHp * 0.3)));
    h.mp = s.maxMp;
  }
  nytNiveau(spil);
  spil.ned = spil.niveau;
  spil.vej = [];              // vejen hertil lå på det forrige niveau
}

/**
 * Udfører ét valg for `rolle` og går derefter selv videre, indtil vejen deler
 * sig igen – nøjagtig som når man spiller alene. Returnerer
 * `{ log, aendret }`, eller null hvis det ikke var ens tur.
 */
export function udfoer(spil, rolle, valg) {
  if (spil.fase !== 'udforsk' || !minTur(spil, rolle) || !valg) return null;
  saetAktiv(spil);
  spil.vej = []; spil.log = []; spil.ned = 0;
  let v = valg;
  for (let n = 0; v && n < MAKS_SKRIDT; n++) {
    if (v.type === 'vend') {
      M.vend(spil);
      spil.vej.push(drejet(spil.retning));
    } else if (v.type === 'gaa' || v.type === 'trappe') {
      const h = M.gaa(spil, v.retning);
      if (!h) break;
      spil.vej.push(gaaet(v.retning));
      for (const e of h) spil.log.push({ ...e, af: rolle });
      if (v.type === 'trappe') nedTrappen(spil);
    } else if (v.type === 'kiste') {
      const loot = M.aabnKiste(spil, v.retning);
      spil.vej.push(drejet(spil.retning));
      if (loot) for (const e of loot) spil.log.push({ ...e, af: rolle });
    } else if (v.type === 'angrib') {
      spil.retning = v.retning;
      spil.vej.push(drejet(spil.retning));
      M.markerSet(spil);
      for (const e of startKamp(spil, v.monster)) spil.log.push(e);
      break;                                     // den, der går til angreb, slår først
    } else break;
    if (spil.fase !== 'udforsk') break;
    v = M.autoValg(M.muligheder(spil));
  }
  // Turen går videre, når holdet står stille igen. I kamp har den, der
  // angreb, allerede taget sin tur ved at vælge kampen.
  if (spil.fase === 'udforsk') spil.tur = naesteTur(spil, anden(spil.tur));
  saetAktiv(spil);
  return { log: spil.log, aendret: true };
}

/* ---------- Kamp ---------- */

export function startKamp(spil, monster) {
  const h = M.startKamp(spil, monster);
  // Skjold og gift hænger på den enkelte helt, ikke på kampen.
  spil.kamp.egen = { vaert: { skjold: 0, gift: 0 }, gaest: { skjold: 0, gift: 0 } };
  return h;
}

/** Læg den aktives egne virkninger ind, der hvor motoren leder efter dem. */
function ind(spil, rolle) {
  const e = spil.kamp.egen[rolle];
  spil.kamp.skjold = e.skjold; spil.kamp.gift = e.gift;
  spil.spiller = spil.helte[rolle];
}

/**
 * Én spillers træk i kampen. Motoren (M.kampTur) regner på `spil.spiller`, så
 * vi sætter den aktive helt ind og rydder op bagefter: falder hen, skal den
 * anden kunne kæmpe videre i stedet for at spillet er slut.
 * Returnerer `{ log, aendret }`, eller null hvis det ikke var ens tur.
 */
export function kampTur(spil, rolle, valg) {
  if (spil.fase !== 'kamp' || !minTur(spil, rolle)) return null;
  const k = spil.kamp;
  const m = M.kampMonster(spil);
  const helt = spil.helte[rolle], makker = spil.helte[anden(rolle)];
  ind(spil, rolle);
  const raa = M.kampTur(spil, valg) || [];
  k.egen[rolle] = { skjold: k.skjold || 0, gift: k.gift || 0 };

  // «Ikke nok mana» og «du har allerede fuldt liv» er ikke et træk: intet er
  // sket, turen bliver hvor den er, og der er ikke noget at sende videre.
  if (raa.length === 1 && raa[0].type === 'intet') {
    saetAktiv(spil);
    return { log: raa.map(e => ({ ...e, af: rolle })), aendret: false };
  }

  spil.vej = []; spil.ned = 0;
  const log = [];
  for (const e of raa) {
    if (e.type === 'doed') continue;                     // vi skriver vores egen besked
    log.push({ ...e, af: rolle });
  }

  const faldt = helt.hp <= 0;
  if (faldt) {
    helt.nede = true; helt.hp = 0;
    log.push({ type: 'nede', af: null, tekst: `${helt.navn} er slået ud!` });
  }

  if (faldt && makker.nede) {
    spil.fase = 'slut';
    spil.kamp = k;
    log.push({ type: 'slut', af: null, dybde: spil.niveau, tekst: `I faldt begge på dybde ${spil.niveau}.` });
  } else if (faldt) {
    // Motoren nåede at kalde spillet slut – makkeren kæmper videre.
    spil.fase = 'kamp';
    spil.kamp = k;
    spil.tur = anden(rolle);
  } else if (spil.fase === 'kamp') {
    spil.tur = naesteTur(spil, anden(rolle));
  } else {
    // Kampen er slut (sejr eller flugt).
    if (m && m.doed) {
      // Erfaringen deles: begge var med, også den der lå ned.
      makker.mp = Math.min(M.stats(makker).maxMp, makker.mp + 2);
      for (const e of M.vindXp(makker, m.xp, makker.navn)) log.push({ ...e, af: null });
    }
    for (const r of ROLLER) {
      const h = spil.helte[r];
      if (!h.nede) continue;
      h.nede = false;
      h.hp = Math.max(1, Math.round(M.stats(h).maxHp * 0.3));
      log.push({ type: 'oprejst', af: null, tekst: `${spil.helte[anden(r)].navn} får ${h.navn} på benene igen.` });
    }
    spil.tur = naesteTur(spil, anden(rolle));
  }

  saetAktiv(spil);
  spil.log = log;
  return { log, aendret: true };
}

/* ---------- Tasken (kun uden for tur-skiftet: den koster ikke en tur) ---------- */

/**
 * Tag udstyr på eller drik en potion uden for kamp. Kun på egen tur, så de to
 * ikke skriver oven i hinanden. Returnerer `{ log, aendret }`.
 */
export function taske(spil, rolle, handling, id) {
  if (!minTur(spil, rolle)) return null;
  const foer = spil.spiller;
  spil.spiller = spil.helte[rolle];
  let e = null;
  if (handling === 'udstyr') e = M.udstyr(spil, id) ? { type: 'udstyr', tekst: `${M.TING[id].navn} er taget på.` } : null;
  else if (handling === 'brug') e = M.brugTing(spil, id);
  spil.spiller = foer;
  saetAktiv(spil);
  if (!e || e.type === 'intet') return { log: e ? [{ ...e, af: rolle }] : [], aendret: false };
  spil.log = [{ ...e, af: rolle }];
  spil.vej = []; spil.ned = 0;
  return { log: spil.log, aendret: true };
}

/* ---------- Stillingen til og fra rummet ---------- */

const pakHelt = h => ({
  n: h.navn, l: h.level, x: h.xp, hp: h.hp, mhp: h.maxHp, mp: h.mp, mmp: h.maxMp,
  a: h.grundAngreb, u: [h.udstyr.vaaben, h.udstyr.rustning, h.udstyr.smykke],
  t: h.taske.map(t => [t.id, t.antal]), e: h.evner, dr: h.draebt, ne: h.nede ? 1 : 0,
});

const pakUdHelt = d => ({
  navn: d.n, level: d.l, xp: d.x, hp: d.hp, maxHp: d.mhp, mp: d.mp, maxMp: d.mmp,
  grundAngreb: d.a, udstyr: { vaaben: d.u[0], rustning: d.u[1], smykke: d.u[2] },
  taske: d.t.map(([id, antal]) => ({ id, antal })), evner: d.e.slice(), draebt: d.dr, nede: !!d.ne,
});

/** Hvor mange tegn stillingen må fylde (src/rum.mjs siger 4000, vi holder luft). */
export const PLADS = 3400;

/** Stillingen, som den ligger i rummet. Alt andet kan regnes ud af `s` og `n`. */
export function pak(spil) {
  const d = spil.dungeon;
  const data = {
    v: 1, s: spil.seed, n: spil.niveau, r: spil.rng.tilstand,
    p: [spil.pos.x, spil.pos.y], d: spil.retning, sk: spil.skridt,
    tur: spil.tur, f: spil.fase,
    mhp: d.monstre.map(m => m.hp),
    ki: d.kister.map(k => (k.aabnet ? 1 : 0)).join(''),
    ti: d.ting.map(t => [t.x, t.y, t.id]),
    kamp: spil.kamp ? { m: spil.kamp.monsterId, r: spil.kamp.runde, st: spil.kamp.stun || 0, e: spil.kamp.egen } : null,
    h: { vaert: pakHelt(spil.helte.vaert), gaest: pakHelt(spil.helte.gaest) },
    vej: spil.vej || [], ned: spil.ned || 0, log: spil.log || [],
  };
  // Bliver tasken lang nok til at presse pladsen, ryger beskederne først: de er
  // kun til at se hvad der skete, mens stillingen skal være rigtig.
  if (JSON.stringify(data).length > PLADS) data.log = data.log.slice(-3);
  if (JSON.stringify(data).length > PLADS) data.log = [];
  return data;
}

/**
 * Stillingen tilbage til et spil. `forrige` er det spil, vi allerede havde:
 * er det den samme labyrint, beholder vi kortet over det udforskede og
 * markerer de felter, holdet gik forbi undervejs.
 */
export function pakUd(data, forrige = null) {
  const seed = data.s >>> 0;
  const samme = !!forrige && forrige.seed === seed && forrige.niveau === data.n;
  const dungeon = samme ? forrige.dungeon : M.lavDungeon(data.n, M.lavRng(dungeonFroe(seed, data.n)));
  dungeon.monstre.forEach((m, i) => {
    const hp = data.mhp[i];
    if (typeof hp === 'number') { m.hp = hp; m.doed = hp <= 0; }
  });
  dungeon.kister.forEach((k, i) => { k.aabnet = (data.ki || '')[i] === '1'; });
  dungeon.ting = (data.ti || []).map(([x, y, id]) => ({ x, y, id }));

  const spil = {
    seed, niveau: data.n, tur: data.tur, fase: data.f,
    rng: M.lavRng(0), dungeon,
    pos: { x: data.p[0], y: data.p[1] }, retning: data.d, skridt: data.sk || 0,
    set: samme ? forrige.set : new Array(dungeon.B * dungeon.B).fill(0),
    kamp: null,
    helte: { vaert: pakUdHelt(data.h.vaert), gaest: pakUdHelt(data.h.gaest) },
    vej: data.vej || [], ned: data.ned || 0, log: data.log || [], spiller: null,
  };
  spil.rng.tilstand = data.r;
  if (data.kamp) {
    spil.kamp = {
      monsterId: data.kamp.m, runde: data.kamp.r, stun: data.kamp.st || 0, skjold: 0, gift: 0,
      egen: data.kamp.e || { vaert: { skjold: 0, gift: 0 }, gaest: { skjold: 0, gift: 0 } },
    };
  }
  saetAktiv(spil);

  // Kortet: gå turen igennem igen, så gangen man lige løb ned ad også står der.
  // Vi ved kun hvor turen begyndte, hvis vi selv stod der før (`samme`), eller
  // hvis holdet lige er kommet ned ad en trappe og altså startede ved trappen.
  const spor = samme
    ? { dungeon, set: spil.set, pos: { ...forrige.pos }, retning: forrige.retning }
    : spil.ned ? { dungeon, set: spil.set, pos: { x: dungeon.start.x, y: dungeon.start.y }, retning: dungeon.start.retning }
      : null;
  if (spor) {
    M.markerSet(spor);
    for (const t of spil.vej) {
      if (t >= 4) spor.retning = t - 4;
      else { spor.retning = t; const d = M.RETNINGER[t]; spor.pos = { x: spor.pos.x + d.dx, y: spor.pos.y + d.dy }; }
      M.markerSet(spor);
    }
  }
  M.markerSet(spil);
  return spil;
}

/* ---------- Tekster ---------- */

/**
 * Motorens beskeder er skrevet til den, der trykker: «Du angriber med kniv.»
 * Ser man med over skulderen, skal der stå et navn i stedet.
 */
export function omskriv(tekst, navn) {
  return String(tekst)
    .replace(/\bdig selv\b/g, 'sig selv')
    .replace(/\bDu\b/g, navn)
    .replace(/\bdu\b/g, navn)
    .replace(/\bdig\b/g, navn)
    .replace(/\bdin\b/g, navn + 's')
    .replace(/\bdit\b/g, navn + 's');
}

/** Beskeden som `rolle` skal læse den: «Du …» om sig selv, ellers navnet. */
export function tekstFor(spil, e, rolle) {
  if (!e.af || e.af === rolle) return e.tekst;
  return omskriv(e.tekst, spil.helte[e.af].navn);
}
