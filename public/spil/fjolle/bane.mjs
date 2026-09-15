/*
  Motoren bag «Fjolle-Obby» – Alias ønske: «En sjov obby».

  Alia har allerede fået Store Obby, som er den *rigtige* forhindringsbane:
  procedurelt genererede etaper, pigge, snurrende bomme og lava. Den er svær og
  alvorlig. Ønsket her er en anden slags: en obby, hvor det er *sjovt* at spille
  – og næsten lige så sjovt at fejle. Derfor er dette spil bygget stik modsat:

  1. **Ingenting slår dig ihjel.** Der er hverken pigge eller lasere. Man kan kun
     lande i buddingen i bunden, og så starter man ved flaget igen. Alt det
     andet – bananskræl, gelé, prutteskyer, slim, rullebånd, høns og balloner –
     skubber, kaster og driller, men gør ikke fortræd.
  2. **Banen er den samme hver gang.** Ni håndlavede etaper, man kan lære
     udenad. Dét er pointen: scoren er *tiden*, det tager at komme hele vejen
     igennem, så man kan blive bedre til præcis den bane, man kender.

  Filen holder sig til tal og rene funktioner (ingen DOM, intet canvas), så
  banen, fysikken og botten kan enhedstestes uden browser – se
  test/unit/fjolle.test.mjs. Alt regnes i enheder, og 1 enhed = 1 meter:
  figuren er 1,3 m høj og løber 6 m/s.

  Det, generatoren lover, og som enhedstesten holder den fast på:

  - Hvert eneste spring kan tages. `naaes()` regner med det afsæt, pladen
    faktisk giver (fjeder, gelé eller prutteskyens raket), og med ballonen dér,
    hvor den er værst at komme *til* (nederst) og bedst at komme *fra* (øverst,
    for den stiger af sig selv, mens man står på den).
  - Botten spiller alle ni etaper igennem med nøjagtig de samme knapper som et
    barn. Klarer den dem ikke, kommer banen ikke på nettet.
*/

/* ---------- Figuren ---------- */
export const SP_B = 0.8, SP_H = 1.3;      // figurens kasse (bredde, højde)

/* ---------- Fysik ---------- */
export const VX = 6.0;                    // løbefart (enheder/sekund)
export const H_HOP = 2.8;                 // hoppets højde
export const T_OP = 0.40;                 // sekunder op til toppen
export const G = (2 * H_HOP) / (T_OP * T_OP);
export const VJ = G * T_OP;               // afsæt
export const COYOTE = 0.10;               // sekunder man stadig må hoppe efter kanten
export const BUFFER = 0.14;               // et tryk lige før landing gemmes
export const DT_MAKS = 1 / 50;            // største skridt, så en fane der har været væk ikke springer

/* ---------- Fjolleriet ---------- */
export const FJEDER = 1.32;               // fjederen ganger afsættet
export const GELE_LILLE = 1.0;            // gelé kaster én op af sig selv …
export const GELE_STOR = 1.45;            // … og meget højere, hvis man trykker HOP i landingen
export const PRUT_AF = 1.5;               // prutteskyens raket
export const PRUT_PERIODE = 2.4;          // sekunder mellem to prutter
export const PRUT_FARLIG = 0.32;          // så længe blæser den
export const HOENE_AF = 0.85;             // hønen vipper én op i luften
export const HOENE_FART = 1.5;            // og spankulerer med den fart
export const HOENE_B = 0.8, HOENE_H = 0.85;
export const SLIM_FART = 0.45;            // i slimet går man i slowmotion
export const BANAN_ACC = 7.5;             // på bananskræl kommer man langsomt op i fart …
export const BANAN_BREMSE = 2.2;          // … og endnu langsommere ned i fart igen
export const BALLON_OP = 1.15;            // ballonen stiger, mens man står på den
export const BALLON_NED = 0.9;            // og synker, når man er hoppet af
export const PUDDING_UNDER = 4.5;         // buddingen ligger så langt under den laveste plade

/* ---------- Banen ---------- */
export const GAB_K = 0.72;                // så meget af den frie rækkevidde tør vi bruge
export const GAB_MIN = 0.5;               // mindste afstand mellem to plader

/* ---------- Regnestykker ---------- */

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

/** Pladens overside. Kun ballonen flytter sig, og hvor højt den er nået, står i standen. */
export const pladeY = (p, st) => p.y + (p.op && st && st.ballon ? (st.ballon[p.nr] || 0) : 0);

/** Står figuren (midten i `x`) på pladen? */
export const staarPaa = (p, x) => x >= p.x && x <= p.x + p.w;

/** Hvor hurtigt går man på pladen? Slim er det eneste, der holder én tilbage. */
export const fartPaa = p => (p && p.slags === 'slim' ? SLIM_FART : 1);

/** Afsættet fra pladen – fjederen sender én højere op. */
export const vjFra = p => VJ * (p && p.slags === 'fjeder' ? FJEDER : 1);

/* ---------- Prutteskyen ---------- */

/** Blæser skyen lige nu? */
export const prutAktiv = (p, t) => {
  if (!p.prut) return false;
  const u = ((t + p.prut.fase) % PRUT_PERIODE + PRUT_PERIODE) % PRUT_PERIODE;
  return u < PRUT_FARLIG;
};

/** Sekunder til skyen skifter (bruges af tegningen, så den kan puste sig op). */
export function prutSkifter(p, t) {
  const u = ((t + p.prut.fase) % PRUT_PERIODE + PRUT_PERIODE) % PRUT_PERIODE;
  return u < PRUT_FARLIG ? PRUT_FARLIG - u : PRUT_PERIODE - u;
}

/** Skyens midte i banens koordinater. */
export const prutX = p => p.x + p.prut.b0 + p.prut.bw / 2;

/** Står man i skyen? */
export const iPrut = (p, x) => x > p.x + p.prut.b0 - SP_B / 2 && x < p.x + p.prut.b0 + p.prut.bw + SP_B / 2;

/* ---------- Hønen ---------- */

/** Hønen spankulerer frem og tilbage mellem to punkter på sin plade. */
export function hoene(p, t) {
  const h = p.hoene;
  const v = p.x + h.fra, hoejre = p.x + h.til;
  const halv = (hoejre - v) / HOENE_FART;
  const u = ((t + h.fase) % (2 * halv) + 2 * halv) % (2 * halv);
  return u < halv
    ? { x: v + HOENE_FART * u, vender: 1 }
    : { x: hoejre - HOENE_FART * (u - halv), vender: -1 };
}

/* ---------- Kan man komme fra den ene plade til den næste? ---------- */

/**
 * Afsættene fra en plade: kanten (almindeligt hop) og – hvis der er en
 * pruttesky – skyen, som sender én meget højere op. Højden er pladens *bedste*:
 * ballonen stiger af sig selv, mens man står på den, så man kan altid komme af
 * sted fra toppen.
 */
export function afsaet(p) {
  const y = p.y + (p.op || 0);
  const ud = [{ x: p.x + p.w, y, vj: vjFra(p) * (p.slags === 'gele' ? GELE_LILLE : 1) }];
  if (p.prut) ud.push({ x: prutX(p), y, vj: VJ * PRUT_AF });
  return ud;
}

/** Kan man komme fra plade `a` til plade `b`? Ballonen regnes dér, hvor den er lavest. */
export function naaes(a, b) {
  return afsaet(a).some(({ x, y, vj }) => {
    const dy = b.y - y;
    return dy <= hopHoejde(vj) - 0.3 && b.x - x <= gabMaks(dy, vj) + 1e-9;
  });
}

/* ================= Banen ================= */
/*
  Ni håndlavede etaper. Hvert trin siger, hvor langt der er hen til pladen
  (`gab`), hvor meget højere den ligger (`dy`), og hvad den er lavet af. Alt
  andet regnes ud. Etapen begynder altid på en bred plade med flaget og slutter
  på en bred plade med det næste flag.
*/
export const ETAPER = [
  {
    navn: 'Kom nu i gang',
    tip: 'Løb til højre og hop. Falder du i buddingen, starter du bare her igen.',
    trin: [
      { slags: 'fast', w: 2.8, gab: 2.0, dy: 0 },
      { slags: 'fast', w: 2.4, gab: 2.4, dy: 0.8 },
      { slags: 'fjeder', w: 1.6, gab: 2.4, dy: -0.6 },
      { slags: 'fast', w: 2.6, gab: 3.2, dy: 2.6 },
      { slags: 'maal', w: 4.4, gab: 2.6, dy: -0.8 },
    ],
  },
  {
    navn: 'Bananskrællen',
    tip: 'På bananskræl kan du ikke bremse. Sæt farten ned i god tid!',
    trin: [
      { slags: 'banan', w: 4.2, gab: 1.8, dy: 0 },
      { slags: 'banan', w: 4.0, gab: 2.4, dy: 0.5 },
      { slags: 'fast', w: 2.2, gab: 2.6, dy: -0.5 },
      { slags: 'banan', w: 4.4, gab: 2.4, dy: 0 },
      { slags: 'maal', w: 4.4, gab: 2.6, dy: 0.6 },
    ],
  },
  {
    navn: 'Gelétårnet',
    tip: 'Gelé kaster dig op af sig selv – tryk HOP i selve landingen, så ryger du højt.',
    trin: [
      { slags: 'gele', w: 1.8, gab: 2.0, dy: 0 },
      { slags: 'gele', w: 1.8, gab: 2.4, dy: 1.2 },
      { slags: 'gele', w: 1.8, gab: 2.4, dy: 1.2 },
      { slags: 'fast', w: 2.4, gab: 2.2, dy: 1.0 },
      { slags: 'maal', w: 4.4, gab: 2.6, dy: -1.6 },
    ],
  },
  {
    navn: 'Prutteskyen',
    tip: 'Stil dig i den grønne sky og vent. PRRRT – så er du oppe!',
    trin: [
      { slags: 'fast', w: 3.4, gab: 2.0, dy: 0, prut: { b0: 1.1, bw: 1.1, fase: 0.6 } },
      { slags: 'fast', w: 2.8, gab: 1.6, dy: 4.0 },
      { slags: 'fast', w: 3.2, gab: 2.2, dy: -1.0, prut: { b0: 1.0, bw: 1.1, fase: 1.4 } },
      { slags: 'fast', w: 2.8, gab: 1.6, dy: 3.4 },
      { slags: 'maal', w: 4.4, gab: 2.4, dy: -2.0 },
    ],
  },
  {
    navn: 'Slimsøen',
    tip: 'I slimet går alting i slowmotion. Det koster tid, men ikke liv.',
    trin: [
      { slags: 'slim', w: 4.6, gab: 1.6, dy: 0 },
      { slags: 'fast', w: 2.0, gab: 2.4, dy: 0.6 },
      { slags: 'slim', w: 5.0, gab: 2.4, dy: -0.6 },
      { slags: 'fjeder', w: 1.6, gab: 2.2, dy: 0.4 },
      { slags: 'maal', w: 4.4, gab: 3.0, dy: 1.2 },
    ],
  },
  {
    navn: 'Rullebåndet',
    tip: 'Båndene trækker. Nogle med dig, nogle imod – kig på pilene.',
    trin: [
      { slags: 'baand', w: 4.6, band: 2.4, gab: 1.8, dy: 0 },
      { slags: 'baand', w: 4.6, band: -2.4, gab: 2.4, dy: 0.4 },
      { slags: 'fast', w: 2.2, gab: 2.4, dy: 0.4 },
      { slags: 'baand', w: 4.2, band: 2.6, gab: 2.4, dy: -0.8 },
      { slags: 'maal', w: 4.4, gab: 2.8, dy: 0.6 },
    ],
  },
  {
    navn: 'Hønsegården',
    tip: 'Løber du ind i en høne, vipper den dig op i luften. BAK BAK!',
    trin: [
      { slags: 'fast', w: 5.2, gab: 1.8, dy: 0, hoene: { fra: 1.4, til: 3.8, fase: 0 } },
      { slags: 'banan', w: 4.2, gab: 2.4, dy: 0.5 },
      { slags: 'fast', w: 5.2, gab: 2.4, dy: -0.5, hoene: { fra: 1.3, til: 3.9, fase: 1.1 } },
      { slags: 'maal', w: 4.4, gab: 2.6, dy: 0.8 },
    ],
  },
  {
    navn: 'Ballonfærden',
    tip: 'Ballonen stiger, så længe du står på den. Vent til den er højt nok oppe.',
    trin: [
      { slags: 'ballon', w: 2.4, op: 3.2, gab: 2.0, dy: 0 },
      { slags: 'fast', w: 2.8, gab: 2.2, dy: 3.0 },
      { slags: 'fast', w: 3.2, gab: 2.2, dy: 0, prut: { b0: 1.0, bw: 1.1, fase: 0.3 } },
      { slags: 'fast', w: 2.8, gab: 1.6, dy: 3.6 },
      { slags: 'maal', w: 4.4, gab: 2.6, dy: -2.4 },
    ],
  },
  {
    navn: 'Det store fjolleri',
    tip: 'Alt på én gang. For enden står den gyldne banan!',
    trin: [
      { slags: 'banan', w: 3.8, gab: 1.8, dy: 0 },
      { slags: 'gele', w: 1.8, gab: 2.6, dy: 0.6 },
      { slags: 'baand', w: 3.8, band: -2.4, gab: 2.4, dy: 0.8 },
      { slags: 'fast', w: 5.0, gab: 2.4, dy: -0.6, hoene: { fra: 1.3, til: 3.7, fase: 0.5 } },
      { slags: 'slim', w: 3.6, gab: 2.4, dy: 0.4 },
      { slags: 'fjeder', w: 1.6, gab: 2.2, dy: 0 },
      { slags: 'fast', w: 2.8, gab: 3.4, dy: 2.8 },
      { slags: 'maal', w: 5.2, gab: 2.6, dy: -1.0 },
    ],
  },
];

export const ANTAL_ETAPER = ETAPER.length;

/** Bygger etape `nr` (1 og opefter) af ETAPER. */
export function byggEtape(nr) {
  const skabelon = ETAPER[Math.max(0, Math.min(ETAPER.length - 1, nr - 1))];
  const start = { nr: 0, slags: 'start', x: 0, y: 0, w: 4.6 };
  const plader = [start];
  for (const trin of skabelon.trin) {
    const forrige = plader[plader.length - 1];
    const p = {
      nr: plader.length,
      slags: trin.slags,
      x: forrige.x + forrige.w + trin.gab,
      y: forrige.y + (trin.dy || 0),
      w: trin.w,
    };
    if (trin.band) p.band = trin.band;
    if (trin.op) p.op = trin.op;
    if (trin.prut) p.prut = { ...trin.prut };
    if (trin.hoene) p.hoene = { ...trin.hoene };
    plader.push(p);
  }
  const maal = plader[plader.length - 1];
  return {
    nr,
    navn: skabelon.navn,
    tip: skabelon.tip,
    plader,
    pudding: Math.min(...plader.map(p => p.y)) - PUDDING_UNDER,
    maalNr: plader.length - 1,
    flagX: maal.x + maal.w / 2,
    laengde: maal.x + maal.w,
    sidste: nr >= ETAPER.length,
  };
}

/** Hele banen. Etaperne er nummereret fra 1 og bygges, når de skal bruges. */
export function opretBane() {
  const husket = new Map();
  return {
    antal: ETAPER.length,
    etape(nr) {
      if (!husket.has(nr)) husket.set(nr, byggEtape(nr));
      return husket.get(nr);
    },
  };
}

/* ================= Fysikken ================= */

/** En frisk figur på etapens første plade. */
export function nyStand(etape) {
  const p = etape.plader[0];
  return {
    t: 0, x: p.x + 1.2, y: p.y, vx: 0, vy: 0,
    paa: 0, sidst: 0, jordTid: 0, hopKoe: -99,
    vender: 1, loeber: false, doed: null, iMaal: false,
    ballon: {},             // ballonens nr → hvor højt den er nået
    gelePlask: -99,         // hvornår man sidst ramte gelé (til tegningen)
    bak: -99,               // hvornår en høne sidst vippede én op
    prutTid: -99,           // hvornår man sidst blev skudt af sted af en sky
  };
}

/** Rammer figuren hønen på pladen `p` lige nu? */
export function rammerHoene(p, st, t) {
  if (!p.hoene) return null;
  const h = hoene(p, t);
  const y = pladeY(p, st);
  if (Math.abs(st.x - h.x) > (SP_B + HOENE_B) / 2) return null;
  if (st.y > y + HOENE_H || st.y < y - 0.5) return null;
  return h;
}

/**
 * Ét skridt fremad. `ind` er knapperne: { venstre, hoejre, hop }, hvor `hop`
 * kun er sand i det øjeblik, knappen bliver trykket ned.
 */
export function skridt(st, ind, dt, etape) {
  if (st.doed || st.iMaal) return st;
  const t0 = st.t;
  const t = (st.t = t0 + Math.min(dt, DT_MAKS));
  const d = t - t0;
  const plader = etape.plader;

  // Ballonerne først, men gem højderne fra før: landingen nedenfor skal vide,
  // hvor pladen lå ved forrige billede, ellers kan man smutte igennem den.
  const toppeFoer = plader.map(p => pladeY(p, st));
  for (const p of plader) {
    if (!p.op) continue;
    const h = st.ballon[p.nr] || 0;
    st.ballon[p.nr] = st.paa === p.nr
      ? Math.min(p.op, h + BALLON_OP * d)
      : Math.max(0, h - BALLON_NED * d);
  }

  const staaendePaa = st.paa >= 0 ? plader[st.paa] : null;
  const retning = (ind.hoejre ? 1 : 0) - (ind.venstre ? 1 : 0);
  if (retning) st.vender = retning;
  st.loeber = retning !== 0;

  // Vandret. På bananskræl kommer man langsomt op i fart og endnu langsommere
  // ned igen – dét er hele vitsen. Alle andre steder (og i luften) styrer man
  // med det samme, ellers er et hop ikke til at rette op.
  const maalFart = retning * VX * fartPaa(staaendePaa);
  if (staaendePaa && staaendePaa.slags === 'banan') {
    const dv = maalFart - st.vx;
    const k = (retning ? BANAN_ACC : BANAN_BREMSE) * d;
    st.vx += Math.abs(dv) <= k ? dv : Math.sign(dv) * k;
  } else {
    st.vx = maalFart;
  }
  st.x += st.vx * d;
  if (staaendePaa && staaendePaa.band) st.x += staaendePaa.band * d;

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
    st.y = pladeY(p, st);
    st.vy = 0;
    if (!staarPaa(p, st.x)) st.paa = -1;              // ud over kanten
  } else {
    const yFoer = st.y;
    st.vy -= G * d;
    st.y += st.vy * d;
    if (st.vy <= 0) {
      for (let i = 0; i < plader.length; i++) {
        const p = plader[i];
        const top = pladeY(p, st), topFoer = toppeFoer[i];
        if (yFoer < topFoer - 0.06 || st.y > top + 1e-9 || !staarPaa(p, st.x)) continue;
        st.y = top; st.sidst = i;
        if (p.slags === 'gele') {
          // Gelé kaster én op af sig selv – og meget højere, hvis man nåede at
          // trykke HOP lige inden landingen. Man står aldrig stille på den.
          const stor = t - st.hopKoe <= BUFFER;
          st.vy = VJ * (stor ? GELE_STOR : GELE_LILLE);
          st.paa = -1; st.hopKoe = -99;
          st.gelePlask = t; st.geleStor = stor;
        } else {
          st.vy = 0; st.paa = i;
        }
        break;
      }
    }
  }

  // Prutteskyen skyder én op i luften, når den blæser, og man står i den.
  if (st.paa >= 0) {
    const p = plader[st.paa];
    if (p.prut && prutAktiv(p, t) && iPrut(p, st.x)) {
      st.vy = VJ * PRUT_AF;
      st.sidst = st.paa; st.paa = -1;
      st.prutTid = t;
    }
  }

  // Hønen: løber man ind i den, bliver man vippet op. Den gør ikke andet ondt.
  for (const p of plader) {
    if (!p.hoene) continue;
    const h = rammerHoene(p, st, t);
    if (!h || t - st.bak < 0.25) continue;
    st.vy = VJ * HOENE_AF;
    if (st.paa >= 0) st.sidst = st.paa;
    st.paa = -1;
    st.bak = t;
    break;
  }

  if (st.y < etape.pudding) st.doed = 'pudding';
  else if (st.paa === etape.maalNr) st.iMaal = true;
  return st;
}

/* ================= Botten ================= */
/*
  Botten er ikke en modstander – den er målestokken. Den spiller etaperne
  igennem i enhedstesten med præcis de samme knapper som et barn, så en etape,
  der ikke kan klares, aldrig kommer på nettet.
*/

/** Det sted på pladen, botten sigter efter. */
export const sigtePunkt = p => p.x + Math.min(0.9, p.w / 2);

/** Kan botten nå plade `b` fra plade `a`, sådan som de står lige nu? */
export function kanNaaNu(a, b, st) {
  const dy = pladeY(b, st) - pladeY(a, st);
  const vj = vjFra(a);
  const tf = tNed(dy, vj);
  if (tf == null) return false;
  return a.x + a.w - 0.1 + VX * tf >= b.x + 0.25;
}

/**
 * Kan botten nå plade `b`, sådan som den flyver lige nu? Det er ikke det samme
 * som `kanNaaNu`: man kommer også op i luften uden selv at have hoppet – en
 * høne kan vippe én op midt på pladen – og dér er svaret nej. Uden det spørgsmål
 * løb botten videre mod næste plade efter et hønseknald og landede i buddingen.
 */
export function naarILuften(st, b) {
  const dy = pladeY(b, st) - st.y;
  const disc = st.vy * st.vy - 2 * G * dy;
  if (disc < 0) return false;
  const tf = (st.vy + Math.sqrt(disc)) / G;
  return tf > 0 && st.x + VX * tf >= b.x + 0.25;
}

/** Hvad botten ville trykke på lige nu. */
export function botTryk(st, etape) {
  const ind = { venstre: false, hoejre: false, hop: false };
  const plader = etape.plader;
  if (st.doed || st.iMaal) return ind;

  const fra = st.paa >= 0 ? st.paa : st.sidst;
  const maal = plader[Math.min(etape.maalNr, fra + 1)];

  if (st.paa < 0) {
    // I luften: styr mod næste plade, hvis den kan nås herfra – ellers tilbage
    // på den, man kom fra, og prøv igen derfra.
    const her = plader[fra];
    const kan = naarILuften(st, maal);
    const sigte = kan ? sigtePunkt(maal)
      : Math.max(her.x + 0.5, Math.min(st.x, her.x + her.w - 0.5));
    if (st.x < sigte - 0.05) ind.hoejre = true;
    else if (st.x > sigte + 0.05) ind.venstre = true;
    return ind;
  }

  const a = plader[st.paa];
  if (st.paa === etape.maalNr) return ind;           // i mål – stå stille

  if (!kanNaaNu(a, maal, st)) {
    // Kan man ikke nå derover ved egen kraft, er der noget at vente på: en
    // pruttesky, der skal blæse, eller en ballon, der skal stige.
    if (a.prut) {
      const sigte = prutX(a);
      if (st.x < sigte - 0.06) ind.hoejre = true;
      else if (st.x > sigte + 0.06) ind.venstre = true;
    }
    return ind;
  }

  const kant = a.x + a.w - 0.12;
  if (st.x < kant - 0.04) { ind.hoejre = true; return ind; }
  ind.hop = true;
  return ind;
}

/**
 * Lader botten spille etapen igennem. Giver { klaret, tid, doed } – beviset for,
 * at etapen overhovedet kan gennemføres.
 */
export function botSpiller(etape, maksTid = 90, dt = 1 / 120) {
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
