/*
  Motoren bag «Store Obby» – Alias ønske om «en god obby».

  En rigtig obby er en forhindringsbane delt op i **etaper** med et flag for
  enden af hver. Man løber, hopper, dør – og starter forfra på etapen, aldrig
  forfra på hele banen. Det er dét, der gør, at man bliver ved: hver etape er
  et lille problem, man kan lære udenad.

  Filen holder sig til tal og rene funktioner (ingen DOM, intet canvas), så
  både banen, fysikken og botten kan enhedstestes uden browser – se
  test/unit/storeobby.test.mjs. Alt regnes i enheder, og 1 enhed = 1 meter:
  figuren er 1,3 m høj og løber 6 m/s.

  Generatoren lover to ting, og enhedstesten holder den fast på dem:

  1. **Hvert hop kan tages i det værst tænkelige øjeblik.** `naaes()` regner
     med pladerne dér, hvor de er sværest at komme til: en plade, der glider
     frem og tilbage, regnes som om den står længst væk, og en, der hejser op
     og ned, som om den er højest. Er hoppet muligt dér, er det muligt altid,
     og så kan man aldrig komme til at stå og vente på et øjeblik, der ikke
     findes.
  2. **Et farligt bånd kan altid passeres.** Pigge og snurrende bomme fylder
     kun et bånd midt på en bred plade – der er mindst SIKKER_KANT frit i
     begge ender at stå og vente på – og båndet er sikkert mindst 2,2 gange så
     længe, som det tager at løbe over det.
*/

/* ---------- Figuren ---------- */
export const SP_B = 0.78, SP_H = 1.3;     // figurens kasse (bredde, højde)

/* ---------- Fysik ---------- */
export const VX = 6.0;                    // løbefart (enheder/sekund)
export const H_HOP = 2.75;                // hoppets højde
export const T_OP = 0.40;                 // sekunder op til toppen
export const G = (2 * H_HOP) / (T_OP * T_OP);
export const VJ = G * T_OP;               // afsæt
export const TRAMPOLIN = 1.3;             // trampolinen ganger afsættet
export const COYOTE = 0.10;               // sekunder man stadig må hoppe efter kanten
export const BUFFER = 0.14;               // et tryk lige før landing gemmes
export const DT_MAKS = 1 / 50;            // største skridt, så en fane der har været væk ikke springer

/* ---------- Banen ---------- */
export const GAB_K = 0.72;                // så meget af den frie rækkevidde tør vi bruge
export const GAB_MIN = 0.5;               // mindste afstand mellem to plader
export const SIKKER_KANT = 1.0;           // frit felt i begge ender af en plade med bånd
export const BAAND_LUFT = 2.2;            // båndet skal være sikkert så mange gange krydsetiden
export const FORSVIND = 1.0;              // sekunder fra man lander, til pladen falder væk
export const TILBAGE = 2.4;               // og så længe er den væk
export const LAVA_UNDER = 4.2;            // lavaen ligger så langt under den laveste plade

/* Hvornår kommer de forskellige plader i spil? En obby skal lære sig selv. */
export const FRA_ETAPE = {
  trampolin: 2, forsvinder: 3, pigge: 4, skyder: 5, snurrer: 6, hejs: 8,
};

/* ---------- Regnestykker ---------- */

/** Seedbar tilfældighed, så ?seed=123 giver den samme bane hver gang. */
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hvor højt når et hop med afsættet `vj`? */
export const hopHoejde = (vj = VJ) => (vj * vj) / (2 * G);

/**
 * Hvor lang tid går der, fra man sætter af, til man falder ned gennem højden
 * `dy` over afsættet? Det er dér, man lander. null hvis hoppet ikke når op.
 */
export function tNed(dy, vj = VJ) {
  const d = vj * vj - 2 * G * dy;
  return d < 0 ? null : (vj + Math.sqrt(d)) / G;
}

/** Hvor langt rækker et hop vandret, når det skal ende `dy` højere oppe? */
export function raekkevidde(dy, vj = VJ) {
  const t = tNed(dy, vj);
  return t == null ? 0 : VX * t;
}

/** Det største gab vi tør lave op til en plade `dy` højere. */
export const gabMaks = (dy, vj = VJ) => Math.max(GAB_MIN, GAB_K * raekkevidde(dy, vj));

/* ---------- Pladerne, som de står lige nu ---------- */

const ampX = p => (p.slags === 'skyder' ? p.amp : 0);
const ampY = p => (p.slags === 'hejs' ? p.amp : 0);
const svinger = (p, t) => Math.sin((2 * Math.PI * t) / p.periode + p.fase);

/** Pladens venstre kant til tiden `t`. */
export const pladeX = (p, t) => (p.slags === 'skyder' ? p.x + p.amp * svinger(p, t) : p.x);
/** Pladens overside til tiden `t`. */
export const pladeY = (p, t) => (p.slags === 'hejs' ? p.y + p.amp * svinger(p, t) : p.y);

/** Afsættets fart fra pladen – trampolinen sender én højere op. */
export const vjFra = p => VJ * (p.slags === 'trampolin' ? TRAMPOLIN : 1);

/** Står figuren (midten i `x`) på pladen? */
export const staarPaa = (p, t, x) => {
  const v = pladeX(p, t);
  return x >= v && x <= v + p.w;
};

/* Kanterne, som de er *sværest*: den plade man springer fra, tænkes så langt
   til venstre den kan komme, og den man skal hen til, så langt til højre. */
const kantHoejreVaerst = p => p.x + p.w - ampX(p);
const kantVenstreVaerst = p => p.x + ampX(p);

/** Kan man hoppe fra plade `a` til plade `b` – også i det værste øjeblik? */
export function naaes(a, b) {
  const vj = vjFra(a);
  const dy = (b.y + ampY(b)) - (a.y - ampY(a));
  if (dy > hopHoejde(vj) - 0.3) return false;
  return kantVenstreVaerst(b) - kantHoejreVaerst(a) <= gabMaks(dy, vj) + 1e-9;
}

/* ---------- Farlige bånd (pigge og snurrende bomme) ---------- */

/** Er båndet farligt lige nu? */
export const baandAktiv = (b, t) => ((t + b.fase) % b.periode + b.periode) % b.periode < b.farlig;

/** Hvor mange sekunder er der, til båndet skifter tilstand? */
export function baandSkifter(b, t) {
  const u = ((t + b.fase) % b.periode + b.periode) % b.periode;
  return u < b.farlig ? b.farlig - u : b.periode - u;
}

/** Båndets venstre og højre kant i banens koordinater. */
export const baandFra = (p, t) => pladeX(p, t) + p.baand.b0;
export const baandTil = (p, t) => pladeX(p, t) + p.baand.b0 + p.baand.bw;

/** Sekunder det tager at løbe fra `x` og helt fri af båndet. */
export const krydsTid = (p, t, x) => Math.max(0, baandTil(p, t) + SP_B / 2 + 0.12 - x) / VX;

/* ---------- Generatoren ---------- */

/** Vælger pladens slags efter vægt – og efter hvad der er lovligt lige her. */
function vaelgSlags(nr, forrige, rnd, diff) {
  const kan = [['fast', 10]];
  const maa = s => nr >= FRA_ETAPE[s];
  // En plade, der forsvinder under én, må aldrig efterfølges af noget, man
  // skal stå og vente på – så ville man stå og vente på en plade, der ikke er der.
  const efterForsvinder = forrige.slags === 'forsvinder';
  if (maa('trampolin')) kan.push(['trampolin', 3]);
  if (maa('forsvinder') && !efterForsvinder) kan.push(['forsvinder', 2 + 3 * diff]);
  if (maa('skyder') && !efterForsvinder) kan.push(['skyder', 2 + 4 * diff]);
  if (maa('hejs') && !efterForsvinder) kan.push(['hejs', 1 + 3 * diff]);
  const sum = kan.reduce((s, k) => s + k[1], 0);
  let r = rnd() * sum;
  for (const [s, v] of kan) { r -= v; if (r <= 0) return s; }
  return 'fast';
}

/** Lægger et farligt bånd midt på en bred plade – med frit felt i begge ender. */
function laegBaand(p, nr, rnd, diff) {
  const snurrerMaa = nr >= FRA_ETAPE.snurrer;
  const slags = snurrerMaa && rnd() < 0.45 ? 'snurrer' : 'pigge';
  const bw = 0.85 + 0.45 * rnd();
  const lo = SIKKER_KANT, hi = p.w - SIKKER_KANT - bw;
  if (hi < lo) return null;
  return {
    slags,
    b0: lo + rnd() * (hi - lo),
    bw,
    hoejde: slags === 'snurrer' ? 2.4 : 1.1,
    periode: 2.9 - 0.8 * diff,
    farlig: 0.8 + 0.3 * diff,
    fase: rnd() * 6,
  };
}

/** Én plade efter `forrige`. Gabet vælges, så hoppet er muligt i det værste øjeblik. */
function naestePlade(forrige, nr, i, antal, rnd, diff, hoejde) {
  const sidste = i === antal - 1;
  const slags = sidste ? 'maal' : vaelgSlags(nr, forrige, rnd, diff);
  const p = {
    nr: i, slags, amp: 0, periode: 3, fase: rnd() * 6, baand: null, f: rnd(),
    w: 3.4, x: 0, y: 0,
  };

  // Pigge og bomme kræver en bred plade – der skal være et frit felt at vente
  // på i begge ender. Derfor bestemmes båndet *først*, og så får pladen den
  // bredde, det kræver; sværhedsgraden ligger i båndets rytme, ikke i bredden.
  const faarBaand = slags === 'fast' && nr >= FRA_ETAPE.pigge && rnd() < 0.18 + 0.32 * diff;
  if (slags === 'maal') p.w = 3.6;
  else if (faarBaand) p.w = 2.95 + 0.9 * rnd();
  else if (slags === 'trampolin') p.w = 1.5 + 0.6 * rnd();
  else p.w = Math.max(1.3, (1.7 + 2.2 * rnd()) * (1 - 0.32 * diff));

  if (slags === 'skyder') { p.amp = 0.7 + 1.1 * rnd() * (0.4 + 0.6 * diff); p.periode = 3.4 - 1.0 * diff; }
  if (slags === 'hejs') { p.amp = 0.6 + 1.0 * rnd() * (0.4 + 0.6 * diff); p.periode = 3.6 - 1.0 * diff; }

  // Højden: banen må gerne bølge, men ikke stikke af opad eller nedad. Begge
  // hejseplader tæller med i det værste øjeblik – den man springer fra kan stå
  // i sit laveste punkt, samtidig med at den man skal hen til står i sit højeste.
  const vj = vjFra(forrige);
  const maksOp = Math.min(2.25, 0.9 + 1.5 * diff, hopHoejde(vj) - 0.35 - ampY(p) - ampY(forrige));
  let dy = rnd() < 0.36 ? -(0.5 + 1.6 * rnd()) : rnd() * maksOp;
  if (hoejde + dy > 7) dy = -Math.abs(dy);
  if (hoejde + dy < -4.5) dy = Math.abs(dy) * 0.6;
  dy = Math.max(-2.4, Math.min(dy, maksOp));           // klemmes til sidst, så vendingerne ovenfor ikke kan snyde

  // To glidende plader kan i sig selv skubbe hinanden for langt fra hinanden:
  // de skal jo hverken støde sammen (GAB_MIN) eller stå uden for rækkevidde,
  // når de er længst fra hinanden. Går det ikke op, lægges pladen lavere – et
  // hop nedad rækker længere – og hjælper det ikke, mister den sin bevægelse.
  for (let vagt = 0; vagt < 60; vagt++) {
    const dyV = dy + ampY(p) + ampY(forrige);
    if (gabMaks(dyV, vj) - GAB_MIN - 2 * (ampX(p) + ampX(forrige)) >= 0) break;
    if (p.slags === 'skyder' && p.amp > 0.45) p.amp -= 0.12;
    else if (dy > -2.4) dy = Math.max(-2.4, dy - 0.15);
    else if (p.slags === 'skyder' || p.slags === 'hejs') { p.slags = 'fast'; p.amp = 0; }
    else break;
  }
  p.y = forrige.y + dy;

  // Gabet: aldrig større end det, der kan nås, når begge plader står værst.
  const dyVaerst = (p.y + ampY(p)) - (forrige.y - ampY(forrige));
  const minGab = GAB_MIN + ampX(p) + ampX(forrige);
  const maksGab = Math.max(minGab, gabMaks(dyVaerst, vj) - ampX(p) - ampX(forrige));
  const gab = minGab + rnd() * (maksGab - minGab) * (0.35 + 0.65 * diff);
  p.x = forrige.x + forrige.w + gab;

  if (faarBaand && p.slags === 'fast') p.baand = laegBaand(p, nr, rnd, diff);
  return p;
}

/**
 * Bygger etape `nr` (1 og opefter). Den begynder på en bred plade med
 * checkpoint-flaget og slutter på en bred plade med det næste flag.
 */
export function byggEtape(nr, rnd) {
  const diff = Math.min(1, (nr - 1) / 22);
  const antal = 6 + Math.round(3 * diff) + Math.floor(rnd() * 3);
  const start = {
    nr: 0, slags: 'start', x: 0, y: 0, w: 4.2,
    amp: 0, periode: 3, fase: 0, baand: null, f: rnd(),
  };
  const plader = [start];
  let hoejde = 0;
  for (let i = 1; i < antal; i++) {
    const p = naestePlade(plader[i - 1], nr, i, antal, rnd, diff, hoejde);
    hoejde = p.y;
    plader.push(p);
  }
  const lavest = Math.min(...plader.map(p => p.y - ampY(p)));
  const maal = plader[plader.length - 1];
  return {
    nr, plader, diff,
    lava: lavest - LAVA_UNDER,
    maalNr: plader.length - 1,
    flagX: maal.x + maal.w / 2,
    laengde: maal.x + maal.w,
  };
}

/**
 * En bane man kan bygge etaper af efter behov. Etaperne er nummereret fra 1.
 *   const bane = opretBane(7);
 *   bane.etape(1);          // → { plader, lava, … }
 */
export function opretBane(seed) {
  const husket = new Map();
  return {
    seed: seed >>> 0,
    etape(nr) {
      if (!husket.has(nr)) {
        // Hver etape får sit eget frø ud fra banens, så etape 9 ser ens ud,
        // hvad enten man kom dertil i ét stræk eller hentede spillet frem igen.
        husket.set(nr, byggEtape(nr, mulberry32(((seed >>> 0) + nr * 0x9E3779B1) >>> 0)));
      }
      return husket.get(nr);
    },
  };
}

/* ================= Fysikken ================= */

/** En frisk figur på etapens første plade. */
export function nyStand(etape, fald = 0) {
  const p = etape.plader[0];
  return {
    t: 0, x: p.x + 1.1, y: p.y, vy: 0,
    paa: 0, sidst: 0, jordTid: 0, hopKoe: -99,
    vender: 1, loeber: false, doed: null, iMaal: false, fald,
    roert: {},            // forsvindende plader: pladens nr → hvornår man landede
  };
}

/** Er pladen der lige nu? En forsvindende plade er væk et stykke tid, efter man har stået på den. */
export function findes(p, st, t) {
  if (p.slags !== 'forsvinder') return true;
  const r = st.roert[p.nr];
  if (r == null) return true;
  const u = t - r;
  return u < FORSVIND || u >= FORSVIND + TILBAGE;
}

/** Rammer figuren et farligt bånd lige nu? Giver båndets slags eller null. */
export function rammer(st, etape, t) {
  for (const p of etape.plader) {
    const b = p.baand;
    if (!b || !baandAktiv(b, t)) continue;
    const y = pladeY(p, t);
    if (st.y > y - 0.35 && st.y < y + b.hoejde &&
        st.x > baandFra(p, t) - SP_B / 2 && st.x < baandTil(p, t) + SP_B / 2) return b.slags;
  }
  return null;
}

/**
 * Ét skridt fremad. `ind` er knapperne: { venstre, hoejre, hop }, hvor `hop`
 * kun er sand i det øjeblik, knappen bliver trykket ned.
 */
export function skridt(st, ind, dt, etape) {
  if (st.doed || st.iMaal) return st;
  const t0 = st.t;
  const t = (st.t = t0 + Math.min(dt, DT_MAKS));
  const plader = etape.plader;

  // Forsvundne plader kommer igen – og kan så falde væk en gang til.
  for (const nr of Object.keys(st.roert)) {
    if (st.roert[nr] != null && t - st.roert[nr] >= FORSVIND + TILBAGE) st.roert[nr] = null;
  }

  // Vandret: fuld styring, også i luften – ellers er et hop ikke til at rette op.
  const retning = (ind.hoejre ? 1 : 0) - (ind.venstre ? 1 : 0);
  if (retning) st.vender = retning;
  st.loeber = retning !== 0;                       // skærmen bruger den til løbe-animationen
  st.x += retning * VX * (t - t0);
  if (st.paa >= 0) {
    const p = plader[st.paa];
    st.x += pladeX(p, t) - pladeX(p, t0);          // man følger med den plade, man står på
  }

  // Hoppet: både coyote-tid og et tryk lige før landing tæller med.
  if (ind.hop) st.hopKoe = t;
  if (st.paa >= 0) st.jordTid = t;
  if (t - st.hopKoe <= BUFFER && t - st.jordTid <= COYOTE) {
    st.vy = vjFra(plader[st.paa >= 0 ? st.paa : st.sidst]);
    st.paa = -1;
    st.hopKoe = -99; st.jordTid = -99;
  }

  if (st.paa >= 0) {
    const p = plader[st.paa];
    st.y = pladeY(p, t);
    st.vy = 0;
    if (!staarPaa(p, t, st.x) || !findes(p, st, t)) st.paa = -1;   // ud over kanten, eller pladen faldt væk
  } else {
    const yFoer = st.y;
    st.vy -= G * (t - t0);
    st.y += st.vy * (t - t0);
    if (st.vy <= 0) {
      for (let i = 0; i < plader.length; i++) {
        const p = plader[i];
        if (!findes(p, st, t)) continue;
        const top = pladeY(p, t), topFoer = pladeY(p, t0);
        if (yFoer >= topFoer - 0.06 && st.y <= top + 1e-9 && staarPaa(p, t, st.x)) {
          st.y = top; st.vy = 0; st.paa = i; st.sidst = i;
          if (p.slags === 'forsvinder' && st.roert[p.nr] == null) st.roert[p.nr] = t;
          break;
        }
      }
    }
  }

  const traf = rammer(st, etape, t);
  if (traf) st.doed = traf;
  else if (st.y < etape.lava) st.doed = 'lava';
  else if (st.paa === etape.maalNr) st.iMaal = true;
  return st;
}

/* ================= Botten ================= */
/*
  Botten er ikke en modstander – den er målestokken. Den spiller etaperne
  igennem i enhedstesten med præcis de samme knapper som et barn, så en etape,
  der ikke kan klares, falder igennem, før den kommer på nettet.
*/

/** Det sted på pladen, botten sigter efter: foran båndet, hvis der er et. */
export function sigtePunkt(p, t) {
  const v = pladeX(p, t);
  if (p.baand) return v + Math.max(0.3, Math.min(p.baand.b0 - 0.35, p.baand.b0 / 2));
  return v + Math.min(0.85, p.w / 2);
}

/** Kan botten nå plade `b` fra plade `a`, sådan som de står lige nu? */
export function kanNaaNu(a, b, t) {
  const vj = vjFra(a);
  let dy = pladeY(b, t) - pladeY(a, t), tf = null;
  for (let k = 0; k < 3; k++) {
    tf = tNed(dy, vj);
    if (tf == null) return false;
    dy = pladeY(b, t + tf) - pladeY(a, t);
  }
  tf = tNed(dy, vj);
  if (tf == null) return false;
  const naar = pladeX(a, t) + a.w - 0.1 + VX * tf;
  return naar >= pladeX(b, t + tf) + 0.25;
}

/** Er der frit løb forbi pladens bånd fra `x` og fremad? */
function frivej(p, t, x) {
  const b = p.baand;
  if (!b || x > baandTil(p, t) + SP_B / 2) return true;
  if (baandAktiv(b, t)) return false;
  return baandSkifter(b, t) > krydsTid(p, t, x) + 0.05;
}

/** Hvad botten ville trykke på lige nu. */
export function botTryk(st, etape) {
  const ind = { venstre: false, hoejre: false, hop: false };
  const plader = etape.plader;
  if (st.doed || st.iMaal) return ind;

  const fra = st.paa >= 0 ? st.paa : st.sidst;
  const maal = plader[Math.min(etape.maalNr, fra + 1)];

  if (st.paa < 0) {                                   // i luften: styr mod sigtepunktet
    const sigte = sigtePunkt(maal, st.t);
    if (st.x < sigte - 0.05) ind.hoejre = true;
    else if (st.x > sigte + 0.05) ind.venstre = true;
    return ind;
  }

  const a = plader[st.paa];
  if (st.paa === etape.maalNr) return ind;            // i mål – stå stille
  if (!frivej(a, st.t, st.x)) return ind;             // vent på, at båndet bliver sikkert

  const kant = pladeX(a, st.t) + a.w - 0.1;
  if (st.x < kant - 0.04) { ind.hoejre = true; return ind; }
  if (kanNaaNu(a, maal, st.t)) ind.hop = true;
  return ind;
}

/**
 * Lader botten spille etapen igennem. Giver { klaret, tid, doed } – bruges i
 * enhedstesten, hvor den er beviset for, at etapen overhovedet kan gennemføres.
 */
export function botSpiller(etape, maksTid = 60, dt = 1 / 120) {
  const st = nyStand(etape);
  let tidligere = { hop: false };
  while (st.t < maksTid && !st.doed && !st.iMaal) {
    const ind = botTryk(st, etape);
    // Knappen skal slippes mellem to hop – ellers hopper man ikke to gange.
    const hop = ind.hop && !tidligere.hop;
    tidligere = ind;
    skridt(st, { ...ind, hop }, dt, etape);
  }
  return { klaret: st.iMaal, tid: st.t, doed: st.doed, stand: st };
}
