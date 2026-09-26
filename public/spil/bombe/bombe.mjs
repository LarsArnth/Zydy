/*
  Pass or Die – bomben, reglerne og robotterne (Alias ønske #64).

  Ren JS uden browser, så det hele kan enhedstestes (test/unit/bombe.test.mjs).
  index.html tegner bare det, der står i `kamp`, og sender tryk ind med giv()
  og koeb() – præcis de samme to funktioner, robotterne bruger. Robotterne kan
  altså ikke snyde: de er bare hurtigere eller langsommere, klogere eller
  dummere.

  En runde:
    1) Bomben lander hos en tilfældig spiller («Klar…»), og lunten går.
    2) Den, der har bomben, giver den videre til en anden. Den skal først
       gribes (FANG_SEK), så man kan ikke bare slå den tilbage i samme nu.
    3) Bomben bliver rødere og rødere (varme 0 → 1), og når lunten er brændt
       ned, springer den. Den, der har den, er ude – de andre får en mønt.
    4) Så kommer der en ny bombe. Den sidste, der er tilbage, vinder runden og
       får mønter efter sværhedsgraden.

  Mønterne kan bruges midt i runden:
    ❄️ Frys   – en anden kan hverken give bomben videre eller købe noget i 6 sek.
    🛡️ Skjold – i 6 sek. kan ingen give dig bomben, og ingen kan fryse dig.
    ⚡ Lyn    – i 8 sek. er bomben grebet i samme nu, den lander hos dig.

  Alt går i faste skridt på DT sekunder, så en test kan spole en hel runde
  frem på et øjeblik, og det samme frø giver den samme runde.
*/

export const DT = 0.05;
export const KLAR_SEK = 1.2;      // bomben lander, før lunten går
export const FLYV_SEK = 0.3;      // bomben er i luften
export const FANG_SEK = 0.45;     // ... og skal gribes, før den kan gives videre
export const PAUSE_SEK = 2.4;     // efter et brag, før den næste bombe kommer
export const MØNT_OVERLEV = 1;    // hver gang en anden springer i luften

export const TING = {
  frys: { id: 'frys', tegn: '❄️', navn: 'Frys', pris: 4, sek: 6,
    om: 'Frys en af de andre i 6 sek. Har hen bomben, kan hen ikke komme af med den.' },
  skjold: { id: 'skjold', tegn: '🛡️', navn: 'Skjold', pris: 5, sek: 6,
    om: 'I 6 sek. kan ingen give dig bomben – og ingen kan fryse dig.' },
  lyn: { id: 'lyn', tegn: '⚡', navn: 'Lyn', pris: 3, sek: 8,
    om: 'I 8 sek. griber du bomben med det samme og kan kaste den videre i ét nu.' },
};
export const TING_RÆKKE = ['frys', 'skjold', 'lyn'];

/*
  Sværhedsgraderne. Et menneske, der trykker hurtigt, holder bomben i ca.
  FLYV + FANG + 0,35 sek. Easy-robotterne holder den tre gange så længe og
  glemmer den af og til (`nøl`), Hard-robotterne er næsten lige så hurtige som
  en hurtig finger, fryser den, der har bomben, når den er ved at springe, og
  giver helst bomben til en, der er frosset, eller til et menneske (`klog`).
  `køb` er chancen for, at en robot bruger sine mønter, når lejligheden er der.

  Målt i test/unit/bombe.test.mjs med en hurtig finger, der også bruger sine
  mønter, mod tre robotter (25 % ville være rent held): Easy ~58 %, Medium
  ~36 %, Hard ~20 %.
*/
export const NIVEAUER = {
  easy: { id: 'easy', navn: 'Easy', lunte: [14, 22], robot: [1.9, 3.1], nøl: 0.45, køb: 0.05, klog: 0, sejr: 3 },
  medium: { id: 'medium', navn: 'Medium', lunte: [10, 16], robot: [1.2, 1.9], nøl: 0.15, køb: 0.2, klog: 0.4, sejr: 4 },
  hard: { id: 'hard', navn: 'Hard', lunte: [7, 12], robot: [0.6, 1.05], nøl: 0.05, køb: 0.5, klog: 1, sejr: 5 },
};

/** Et lille seedbart tilfældighedstal (mulberry32). */
export function tilfældig(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const mellem = (r, [a, b]) => a + (b - a) * r();

/**
 * Laver en ny kamp. `spillere` er en liste med {navn, robot, penge, plads}.
 * Kampen varer, så længe man vil – én runde ad gangen med nyRunde().
 */
export function nyKamp({ spillere, niveau = 'easy', seed = 1 }) {
  if (!Array.isArray(spillere) || spillere.length < 2) throw new Error('Der skal være mindst to spillere');
  if (!NIVEAUER[niveau]) throw new Error('Ukendt sværhedsgrad: ' + niveau);
  const kamp = {
    niveau,
    r: tilfældig(seed),
    tid: 0,
    rest: 0,
    runde: 0,
    fase: 'klar',            // klar | spil | brag | slut
    klar: 0,
    pause: 0,
    vinder: null,
    harMennesker: spillere.some(s => !s.robot),
    spillere: spillere.map((s, nr) => ({
      nr,
      navn: s.navn || 'Spiller ' + (nr + 1),
      robot: !!s.robot,
      plads: s.plads ?? nr,
      penge: Math.max(0, Math.floor(s.penge || 0)),
      sejre: 0,
      ude: false,
      frys: 0, skjold: 0, lyn: 0,
      ur: 0,                 // robot: hvornår den giver bomben videre
      tænk: 0,               // robot: hvornår den overvejer at købe noget
    })),
    bombe: null,
    hændelser: [],
    robotterSover: false,  // kun til testene: så står robotterne stille
  };
  nyRunde(kamp);
  return kamp;
}

/** Alle er med igen, og den første bombe lander. */
export function nyRunde(kamp) {
  kamp.runde += 1;
  kamp.vinder = null;
  for (const p of kamp.spillere) p.ude = false;
  kamp.hændelser.push({ slags: 'runde', runde: kamp.runde });
  nyBombe(kamp);
}

function nyBombe(kamp) {
  const levende = kamp.spillere.filter(p => !p.ude);
  for (const p of kamp.spillere) { p.frys = 0; p.skjold = 0; p.lyn = 0; p.ur = 0; p.tænk = 0.6 + kamp.r() * 0.8; }
  const hos = levende[Math.floor(kamp.r() * levende.length)].nr;
  kamp.bombe = {
    hos, fra: null, tid: 0,
    lunte: mellem(kamp.r, NIVEAUER[kamp.niveau].lunte),
    flyv: 0, fang: 0, afleveringer: 0,
  };
  kamp.fase = 'klar';
  kamp.klar = KLAR_SEK;
  robotFår(kamp, kamp.spillere[hos]);
  kamp.hændelser.push({ slags: 'ny', hos });
}

/** Hvor rød bomben er: 0 = lige tændt, 1 = springer nu. */
export function varme(kamp) {
  const b = kamp.bombe;
  return b ? Math.min(1, b.tid / b.lunte) : 0;
}

export const levende = kamp => kamp.spillere.filter(p => !p.ude);

/** Giver en grund, hvis `fra` ikke må give bomben til `til` lige nu – ellers null. */
export function kanGive(kamp, fra, til) {
  const b = kamp.bombe, p = kamp.spillere[fra], t = kamp.spillere[til];
  if (kamp.fase !== 'spil') return 'Vent lige';
  if (!p || p.ude) return 'Du er ude';
  if (b.hos !== fra) return 'Du har ikke bomben';
  if (p.frys > 0) return 'Du er frosset';
  if (b.fang > 0) return 'Grib den først';
  if (!t || t.ude || til === fra) return 'Ikke til ham';
  if (t.skjold > 0) return 'Har skjold';
  return null;
}

/** Bomben kastes fra `fra` til `til`. */
export function giv(kamp, fra, til) {
  const fejl = kanGive(kamp, fra, til);
  if (fejl) return { ok: false, fejl };
  const b = kamp.bombe, t = kamp.spillere[til];
  b.fra = fra;
  b.hos = til;
  b.flyv = FLYV_SEK;
  b.fang = FLYV_SEK + (t.lyn > 0 ? 0 : FANG_SEK);
  b.afleveringer += 1;
  robotFår(kamp, t);
  kamp.hændelser.push({ slags: 'giv', fra, til });
  return { ok: true };
}

/** Giver en grund, hvis `hvem` ikke kan købe `ting` (til `maal`) – ellers null. */
export function kanKoebe(kamp, hvem, ting, maal) {
  const p = kamp.spillere[hvem], t = TING[ting];
  if (!t) return 'Ukendt ting';
  if (kamp.fase !== 'spil' && kamp.fase !== 'klar') return 'Vent lige';
  if (!p || p.ude) return 'Du er ude';
  if (p.frys > 0) return 'Du er frosset';
  if (p.penge < t.pris) return 'Ikke nok mønter';
  if (ting === 'frys') {
    const m = kamp.spillere[maal];
    if (!m || m.ude || maal === hvem) return 'Vælg en anden';
    if (m.skjold > 0) return 'Har skjold';
    if (m.frys > 0) return 'Er allerede frosset';
  }
  if (ting === 'skjold' && p.skjold > 0) return 'Har allerede skjold';
  if (ting === 'lyn' && p.lyn > 0) return 'Har allerede lyn';
  return null;
}

/** Køber og bruger en ting med det samme. */
export function koeb(kamp, hvem, ting, maal = null) {
  const fejl = kanKoebe(kamp, hvem, ting, maal);
  if (fejl) return { ok: false, fejl };
  const p = kamp.spillere[hvem], t = TING[ting];
  p.penge -= t.pris;
  if (ting === 'frys') kamp.spillere[maal].frys = t.sek;
  else if (ting === 'skjold') p.skjold = t.sek;
  else if (ting === 'lyn') {
    p.lyn = t.sek;
    // Er bomben allerede landet og ved at blive grebet, er den grebet nu.
    if (kamp.bombe.hos === hvem) kamp.bombe.fang = Math.min(kamp.bombe.fang, kamp.bombe.flyv);
  }
  kamp.hændelser.push({ slags: 'koeb', hvem, ting, maal: ting === 'frys' ? maal : hvem });
  return { ok: true };
}

/** Kører kampen `sek` sekunder frem i faste skridt. */
export function tik(kamp, sek) {
  kamp.rest += sek;
  while (kamp.rest >= DT - 1e-9) {
    kamp.rest -= DT;
    skridt(kamp);
  }
}

function skridt(kamp) {
  kamp.tid += DT;
  if (kamp.fase === 'slut') return;
  if (kamp.fase === 'brag') {
    kamp.pause -= DT;
    if (kamp.pause <= 0) {
      if (færdig(kamp)) slutRunde(kamp);
      else nyBombe(kamp);
    }
    return;
  }
  if (kamp.fase === 'klar') {
    kamp.klar -= DT;
    if (kamp.klar <= 0) { kamp.fase = 'spil'; kamp.hændelser.push({ slags: 'nu' }); }
    return;
  }

  // Frys, skjold og lyn brænder ned.
  for (const p of kamp.spillere) {
    if (p.frys > 0) {
      p.frys = Math.max(0, p.frys - DT);
      if (p.frys === 0) kamp.hændelser.push({ slags: 'optoet', hvem: p.nr });
    }
    if (p.skjold > 0) p.skjold = Math.max(0, p.skjold - DT);
    if (p.lyn > 0) p.lyn = Math.max(0, p.lyn - DT);
  }

  const b = kamp.bombe;
  b.tid += DT;
  b.flyv = Math.max(0, b.flyv - DT);
  b.fang = Math.max(0, b.fang - DT);
  if (b.tid >= b.lunte) { brag(kamp); return; }

  robotter(kamp);
}

function brag(kamp) {
  const b = kamp.bombe, offer = kamp.spillere[b.hos];
  offer.ude = true;
  for (const p of kamp.spillere) {
    p.frys = 0; p.skjold = 0; p.lyn = 0;
    if (!p.ude) p.penge += MØNT_OVERLEV;
  }
  kamp.fase = 'brag';
  kamp.pause = PAUSE_SEK;
  kamp.hændelser.push({ slags: 'brag', hvem: offer.nr, sidste: færdig(kamp) });
}

/** Runden er slut, når der kun er én tilbage – eller når alle menneskerne er ude. */
function færdig(kamp) {
  const tilbage = levende(kamp);
  return tilbage.length <= 1 || (kamp.harMennesker && !tilbage.some(p => !p.robot));
}

function slutRunde(kamp) {
  const tilbage = levende(kamp);
  kamp.fase = 'slut';
  kamp.vinder = tilbage.length === 1 ? tilbage[0].nr : null;
  const bonus = NIVEAUER[kamp.niveau].sejr;
  if (kamp.vinder !== null) {
    const v = kamp.spillere[kamp.vinder];
    v.sejre += 1;
    v.penge += bonus;
  }
  kamp.hændelser.push({ slags: 'slut', vinder: kamp.vinder, bonus });
}

/* ---------- Robotterne ---------- */

/** En robot har lige fået bomben: hvor længe tøver den? */
function robotFår(kamp, p) {
  if (!p.robot) return;
  const niv = NIVEAUER[kamp.niveau];
  let ur = mellem(kamp.r, niv.robot);
  if (kamp.r() < niv.nøl) ur += 0.8 + kamp.r() * 1.2;       // den kigger den anden vej
  if (niv.klog && varme(kamp) > 0.65) ur *= 1 - 0.4 * niv.klog; // den kan se, at bomben er rød
  p.ur = ur;
}

/** Hvem skal have bomben? Null, hvis ingen kan få den. */
export function vælgMål(kamp, p) {
  const niv = NIVEAUER[kamp.niveau], b = kamp.bombe, r = kamp.r;
  const mulige = kamp.spillere.filter(t => !t.ude && t.nr !== p.nr && t.skjold <= 0);
  if (!mulige.length) return null;
  const tag = liste => liste[Math.floor(r() * liste.length)].nr;
  const frosne = mulige.filter(t => t.frys > 0);
  if (frosne.length && r() < niv.klog * 0.9) return tag(frosne);   // en frossen kan ikke give den tilbage
  const mennesker = mulige.filter(t => !t.robot);
  if (mennesker.length && r() < niv.klog * 0.3) return tag(mennesker);
  if (mulige.length > 1 && b.fra !== null && r() < niv.klog * 0.7) {
    const andre = mulige.filter(t => t.nr !== b.fra);           // ikke lige tilbage til den, der kastede
    if (andre.length) return tag(andre);
  }
  return tag(mulige);
}

function robotter(kamp) {
  if (kamp.robotterSover) return;
  const niv = NIVEAUER[kamp.niveau], b = kamp.bombe, r = kamp.r;
  const v = varme(kamp);
  for (const p of kamp.spillere) {
    if (!p.robot || p.ude || p.frys > 0) continue;

    if (b.hos === p.nr) {
      p.ur -= DT;
      if (b.fang > 0 || p.ur > 0) continue;
      const til = vælgMål(kamp, p);
      if (til === null) { p.ur = 0.3; continue; }
      // Det gemene trick: frys den, du giver bomben til, når den er ved at springe.
      if (v > 0.65 && r() < niv.køb * niv.klog * 0.15 && !kanKoebe(kamp, p.nr, 'frys', til)) koeb(kamp, p.nr, 'frys', til);
      giv(kamp, p.nr, til);
      if (b.hos !== p.nr) return;   // bomben er væk – de andre robotter tænker i næste skridt
      continue;
    }

    p.tænk -= DT;
    if (p.tænk > 0) continue;
    p.tænk = 0.8 + r() * 0.6;
    if (r() >= niv.køb) continue;
    const holder = kamp.spillere[b.hos];
    if (v > 0.75 && niv.klog >= 1 && r() < 0.35 && !kanKoebe(kamp, p.nr, 'frys', holder.nr)) {
      koeb(kamp, p.nr, 'frys', holder.nr);               // så bliver den dér
    } else if (v > 0.65 && !kanKoebe(kamp, p.nr, 'skjold')) {
      koeb(kamp, p.nr, 'skjold');
    } else if (v < 0.4 && p.penge >= 9 && !kanKoebe(kamp, p.nr, 'lyn')) {
      koeb(kamp, p.nr, 'lyn');
    }
  }
}
