/**
 * Tårnforsvar – motoren (SorteSlyngels ønske #54: «et Tower Defense-stil spil,
 * hvor man kæmper om at komme længst, med forskellige tårne der skyder mod
 * monstre»).
 *
 * Banen er et gitter på 10 × 14 felter à 10 enheder — altså 100 × 140 enheder,
 * som index.html tegner i midten af fladen. Stien er den samme hver gang, og
 * det er med vilje: der er **ingen tilfældighed i motoren**. Alle møder
 * nøjagtig de samme bølger i den samme rækkefølge, så toplisten sammenligner
 * spillere og ikke held. Bølgerne fortsætter i det uendelige og bliver ved med
 * at blive stærkere, så spillet altid ender med, at man taber — pointen er,
 * hvor langt man nåede.
 *
 * Tre greb er værd at huske:
 *   1) Monstrene har ingen x/y af sig selv; de har `d` — hvor langt de er
 *      kommet ad stien. Alt andet (position, retning, hvem tårnet skal skyde
 *      på) regnes ud fra det tal, og «skyd på den, der er nået længst» er
 *      derfor bare det største `d`.
 *   2) Trolde og monsterkongen har `panser`, som trækkes fra hvert eneste
 *      træffer. Det er dét, der gør, at man ikke kan nøjes med bueskytter:
 *      mange små skud bliver til ingenting mod panser, og så skal der en kanon
 *      eller en troldmand til.
 *   3) `tik()` går altid i faste skridt på 1/60 sekund, uanset hvor stort et
 *      dt den får. Derfor kan en test spole ti bølger frem på et øjeblik og få
 *      præcis det samme resultat som en telefon, der tegner 60 billeder i
 *      sekundet.
 */

export const FELT = 10;
export const KOLONNER = 10;
export const RAEKKER = 14;
export const BREDDE = KOLONNER * FELT;      // 100
export const HOEJDE = RAEKKER * FELT;       // 140

/** Stiens hjørner i feltkoordinater. Den begynder uden for banen, så monstrene går ind. */
export const RUTE = [
  [2, -1], [2, 3], [7, 3], [7, 6], [1, 6], [1, 10], [5, 10], [5, 13],
];

/** Feltets midte i enheder. */
export const midte = (kx, ky) => ({ x: (kx + 0.5) * FELT, y: (ky + 0.5) * FELT });

/* ---------- Stien regnet ud én gang ---------- */
const PUNKTER = RUTE.map(([kx, ky]) => midte(kx, ky));
const LED = [];
{
  let start = 0;
  for (let i = 0; i < PUNKTER.length - 1; i++) {
    const a = PUNKTER[i], b = PUNKTER[i + 1];
    const laengde = Math.hypot(b.x - a.x, b.y - a.y);
    LED.push({ a, b, laengde, start });
    start += laengde;
  }
}
export const STI_LAENGDE = LED.reduce((s, l) => s + l.laengde, 0);
export const STI_LED = LED;

/** Punktet `d` enheder inde ad stien (plus hvilken vej der gås). */
export function punktPaaSti(d) {
  const k = Math.max(0, Math.min(STI_LAENGDE, d));
  let led = LED[LED.length - 1];
  for (const l of LED) if (k <= l.start + l.laengde) { led = l; break; }
  const t = led.laengde ? (k - led.start) / led.laengde : 0;
  return {
    x: led.a.x + (led.b.x - led.a.x) * t,
    y: led.a.y + (led.b.y - led.a.y) * t,
    dx: Math.sign(led.b.x - led.a.x),
    dy: Math.sign(led.b.y - led.a.y),
  };
}

/** Felterne stien løber hen over – dem må man ikke bygge på. */
export const STI_FELTER = (() => {
  const s = new Set();
  for (let i = 0; i < RUTE.length - 1; i++) {
    const [x0, y0] = RUTE[i], [x1, y1] = RUTE[i + 1];
    const tx = Math.sign(x1 - x0), ty = Math.sign(y1 - y0);
    let x = x0, y = y0;
    s.add(x + ',' + y);
    while (x !== x1 || y !== y1) { x += tx; y += ty; s.add(x + ',' + y); }
  }
  return s;
})();

export const paaSti = (kx, ky) => STI_FELTER.has(kx + ',' + ky);
export const paaBanen = (kx, ky) => kx >= 0 && kx < KOLONNER && ky >= 0 && ky < RAEKKER;
/** Porten, monstrene skal ind ad – det er her, man mister liv. */
export const PORT = RUTE[RUTE.length - 1];

/* ================= Tårnene ================= */
/*
  Otte tårne med hver sin rolle (SorteSlyngels ønske #57: «flere forskellige
  tårne og flere upgrades til hvert tårn»). `fart` er skud pr. sekund,
  `raekkevidde` måles i enheder (et felt er 10), og `opgradering` er, hvad det
  næste niveau koster (0 på sidste niveau). Priserne er valgt, så man kan bygge
  to bueskytter fra start, og så alt andet skal tjenes hjem.

  Hvert tårn har fem niveauer. De to sidste er med vilje dyre: et fuldt
  opgraderet tårn koster mere end tre nye, så man hele tiden skal vælge mellem
  «et tårn mere» og «et stærkere tårn» — og guldet er dét, spillet handler om.

  De fire slags virkning, motoren kender:
    langsom  – fryser monsteret (isbøssen)
    splash   – bomben rammer alle tæt på (kanonen)
    gift     – skade pr. sekund, som panser ikke kan stoppe (giftskyen)
    kaede    – lynet hopper videre til flere monstre (lynspolen)
    guld     – graver guld frem efter hver bølge i stedet for at skyde (guldminen)
  og `maal: 'staerkest'` får tårnet til at sigte efter det monster, der har mest
  liv tilbage, frem for det, der er nået længst (snigskytten).
*/
export const TAARNE = [
  {
    id: 'bue', navn: 'Bueskytte', tegn: '🏹', farve: '#3ddc84', pris: 50,
    om: 'Hurtig og billig. Begynd med et par stykker.',
    niveauer: [
      { skade: 7, fart: 1.5, raekkevidde: 26, opgradering: 40 },
      { skade: 12, fart: 1.8, raekkevidde: 29, opgradering: 75 },
      { skade: 20, fart: 2.1, raekkevidde: 32, opgradering: 130 },
      { skade: 30, fart: 2.4, raekkevidde: 34, opgradering: 210 },
      { skade: 46, fart: 2.8, raekkevidde: 36, opgradering: 0 },
    ],
  },
  {
    id: 'is', navn: 'Isbøsse', tegn: '❄️', farve: '#4d8dff', pris: 60,
    om: 'Fryser monstrene, så de andre tårne når flere skud.',
    niveauer: [
      { skade: 3, fart: 1.1, raekkevidde: 22, langsom: 0.55, langsomTid: 1.6, opgradering: 55 },
      { skade: 5, fart: 1.3, raekkevidde: 25, langsom: 0.45, langsomTid: 2.0, opgradering: 95 },
      { skade: 9, fart: 1.5, raekkevidde: 28, langsom: 0.35, langsomTid: 2.4, opgradering: 150 },
      { skade: 14, fart: 1.7, raekkevidde: 30, langsom: 0.28, langsomTid: 2.8, opgradering: 240 },
      { skade: 20, fart: 1.9, raekkevidde: 32, langsom: 0.22, langsomTid: 3.2, opgradering: 0 },
    ],
  },
  {
    id: 'gift', navn: 'Giftsky', tegn: '☠️', farve: '#b7e04b', pris: 75,
    om: 'Giften bliver ved med at gøre ondt – og panser hjælper ikke.',
    niveauer: [
      { skade: 2, fart: 0.8, raekkevidde: 24, gift: 7, giftTid: 3.0, opgradering: 65 },
      { skade: 3, fart: 0.9, raekkevidde: 26, gift: 12, giftTid: 3.4, opgradering: 110 },
      { skade: 5, fart: 1.0, raekkevidde: 28, gift: 20, giftTid: 3.8, opgradering: 175 },
      { skade: 7, fart: 1.1, raekkevidde: 30, gift: 32, giftTid: 4.2, opgradering: 270 },
      { skade: 10, fart: 1.2, raekkevidde: 32, gift: 50, giftTid: 4.6, opgradering: 0 },
    ],
  },
  {
    id: 'kanon', navn: 'Kanon', tegn: '💣', farve: '#ffd447', pris: 90,
    om: 'Bomben rammer hele klumpen på én gang.',
    niveauer: [
      { skade: 15, fart: 0.6, raekkevidde: 24, splash: 11, opgradering: 80 },
      { skade: 24, fart: 0.7, raekkevidde: 26, splash: 13, opgradering: 140 },
      { skade: 38, fart: 0.8, raekkevidde: 28, splash: 15, opgradering: 230 },
      { skade: 58, fart: 0.9, raekkevidde: 30, splash: 17, opgradering: 360 },
      { skade: 88, fart: 1.0, raekkevidde: 32, splash: 19, opgradering: 0 },
    ],
  },
  {
    id: 'mine', navn: 'Guldmine', tegn: '💰', farve: '#f0a500', pris: 100,
    om: 'Skyder ikke – graver guld frem efter hver bølge.',
    niveauer: [
      { skade: 0, fart: 0, raekkevidde: 0, guld: 22, opgradering: 90 },
      { skade: 0, fart: 0, raekkevidde: 0, guld: 38, opgradering: 150 },
      { skade: 0, fart: 0, raekkevidde: 0, guld: 60, opgradering: 240 },
      { skade: 0, fart: 0, raekkevidde: 0, guld: 90, opgradering: 370 },
      { skade: 0, fart: 0, raekkevidde: 0, guld: 130, opgradering: 0 },
    ],
  },
  {
    id: 'spole', navn: 'Lynspole', tegn: '⚡', farve: '#7fe8ff', pris: 110,
    om: 'Lynet hopper videre til flere monstre. Kort rækkevidde.',
    niveauer: [
      { skade: 9, fart: 1.0, raekkevidde: 20, kaede: 2, opgradering: 95 },
      { skade: 14, fart: 1.1, raekkevidde: 22, kaede: 2, opgradering: 160 },
      { skade: 21, fart: 1.2, raekkevidde: 24, kaede: 3, opgradering: 250 },
      { skade: 31, fart: 1.35, raekkevidde: 26, kaede: 3, opgradering: 390 },
      { skade: 46, fart: 1.5, raekkevidde: 28, kaede: 4, opgradering: 0 },
    ],
  },
  {
    id: 'trold', navn: 'Troldmand', tegn: '🔮', farve: '#c56cf0', pris: 130,
    om: 'Ét kæmpe lyn – det eneste, der rigtig bider på panser.',
    niveauer: [
      { skade: 36, fart: 0.5, raekkevidde: 34, opgradering: 120 },
      { skade: 58, fart: 0.55, raekkevidde: 37, opgradering: 200 },
      { skade: 95, fart: 0.6, raekkevidde: 40, opgradering: 320 },
      { skade: 145, fart: 0.65, raekkevidde: 43, opgradering: 500 },
      { skade: 220, fart: 0.7, raekkevidde: 46, opgradering: 0 },
    ],
  },
  {
    id: 'snig', navn: 'Snigskytte', tegn: '🎯', farve: '#ff7aa2', pris: 165,
    om: 'Rammer hele banen og sigter efter det stærkeste monster.',
    maal: 'staerkest',
    niveauer: [
      { skade: 40, fart: 0.35, raekkevidde: 200, opgradering: 150 },
      { skade: 65, fart: 0.4, raekkevidde: 200, opgradering: 250 },
      { skade: 105, fart: 0.45, raekkevidde: 200, opgradering: 400 },
      { skade: 165, fart: 0.5, raekkevidde: 200, opgradering: 620 },
      { skade: 260, fart: 0.55, raekkevidde: 200, opgradering: 0 },
    ],
  },
];
export const TAARN_VED = Object.fromEntries(TAARNE.map(t => [t.id, t]));
export const MAKS_NIVEAU = 5;
/** Hvor langt lynet hopper videre til det næste monster. */
export const KAEDE_RAEKKE = 16;

/* ================= Monstrene ================= */
/*
  `panser` trækkes fra hvert træffer (dog altid mindst 1 i skade), `liv` er
  hvor mange hjerter det koster, hvis monsteret når porten, og `r` er hvor
  stort det tegnes.
*/
export const MONSTRE = {
  slim: { navn: 'Slim', tegn: '🟢', hp: 26, fart: 12, guld: 6, liv: 1, panser: 0, r: 3.2, farve: '#7bd88f' },
  flagermus: { navn: 'Flagermus', tegn: '🦇', hp: 16, fart: 22, guld: 7, liv: 1, panser: 0, r: 2.8, farve: '#b18cff' },
  trold: { navn: 'Trold', tegn: '🗿', hp: 95, fart: 8, guld: 17, liv: 2, panser: 2, r: 4.2, farve: '#9aa4b8' },
  konge: { navn: 'Monsterkonge', tegn: '👹', hp: 520, fart: 7, guld: 75, liv: 5, panser: 5, r: 5.4, farve: '#ff4d5e' },
};

/** Hvor meget mere liv monstrene har i bølge `nr`. Vokser, indtil man ikke kan følge med. */
export const hpFaktor = nr => Math.pow(1.16, nr - 1);
/** Guldet vokser langsommere end monstrene – derfor ender alle med at tabe. */
export const guldFaktor = nr => 1 + (nr - 1) * 0.05;

/** Hvad bølge `nr` består af. Flagermusene kommer fra bølge 3, troldene fra 5, kongen hver femte. */
export function boelgePlan(nr) {
  const plan = [];
  plan.push({
    slags: 'slim', antal: 5 + Math.round(nr * 1.1),
    mellemrum: Math.max(0.4, 0.85 - nr * 0.02), forsinkelse: 0,
  });
  if (nr >= 3) plan.push({ slags: 'flagermus', antal: 2 + Math.round((nr - 2) * 0.9), mellemrum: 0.5, forsinkelse: 3 });
  if (nr >= 5) plan.push({ slags: 'trold', antal: 1 + Math.floor((nr - 4) / 2), mellemrum: 1.6, forsinkelse: 6 });
  if (nr % 5 === 0) plan.push({ slags: 'konge', antal: Math.floor(nr / 15) + 1, mellemrum: 4, forsinkelse: 9 });
  return plan;
}

/** Hedder bølgen noget særligt? Bruges til varslet på skærmen. */
export function boelgeVarsel(nr) {
  if (nr % 5 === 0) return 'Monsterkongen kommer!';
  if (nr === 3) return 'Flagermus – de er hurtige';
  if (nr === 5) return 'Trolde – de har panser';
  return null;
}

/* ================= Spillet ================= */
export const START_GULD = 140;
export const START_LIV = 20;
export const FOERSTE_PAUSE = 12;      // god tid til at bygge de første tårne
export const PAUSE = 6;
export const BONUS_PR_SEK = 2;        // «Send nu» betaler for hvert sekund, man sprang over
export const SALG_DEL = 0.6;          // man får 60 % af det, tårnet har kostet, retur
const SKRIDT = 1 / 60;
const SKUD_FART = 95;

export function nytSpil() {
  return {
    tid: 0, fase: 'pause', pauseTid: FOERSTE_PAUSE,
    guld: START_GULD, liv: START_LIV, boelge: 0, klarede: 0, drab: 0,
    taarne: [], monstre: [], skud: [], smaeld: [], koe: [],
    naesteId: 1, slut: null, sidsteBonus: 0, sidsteMine: 0,
  };
}

const niveauet = t => TAARN_VED[t.slags].niveauer[t.niveau - 1];
export const taarnData = niveauet;

/** Bygger et tårn. Svaret er `{ ok, fejl, taarn }` – fejlen er noget, man kan vise et barn. */
export function byg(spil, slags, kx, ky) {
  const type = TAARN_VED[slags];
  if (!type || spil.fase === 'slut') return { ok: false, fejl: 'Ikke nu' };
  if (!paaBanen(kx, ky)) return { ok: false, fejl: 'Uden for banen' };
  if (paaSti(kx, ky)) return { ok: false, fejl: 'Ikke på stien' };
  if (spil.taarne.some(t => t.kx === kx && t.ky === ky)) return { ok: false, fejl: 'Der står allerede et tårn' };
  if (spil.guld < type.pris) return { ok: false, fejl: 'Ikke guld nok' };
  spil.guld -= type.pris;
  const p = midte(kx, ky);
  const taarn = {
    id: spil.naesteId++, slags, kx, ky, x: p.x, y: p.y,
    niveau: 1, investeret: type.pris, ladt: 0, vinkel: Math.PI / 2, drab: 0,
  };
  spil.taarne.push(taarn);
  return { ok: true, taarn };
}

/** Opgraderer et tårn ét niveau. */
export function opgrader(spil, taarn) {
  if (!taarn || spil.fase === 'slut') return { ok: false, fejl: 'Ikke nu' };
  if (taarn.niveau >= MAKS_NIVEAU) return { ok: false, fejl: 'Tårnet er færdigbygget' };
  const pris = niveauet(taarn).opgradering;
  if (spil.guld < pris) return { ok: false, fejl: 'Ikke guld nok' };
  spil.guld -= pris;
  taarn.investeret += pris;
  taarn.niveau += 1;
  return { ok: true, taarn };
}

export const salgspris = taarn => Math.floor(taarn.investeret * SALG_DEL);

/** Sælger et tårn igen – man får det meste af guldet tilbage. */
export function saelg(spil, taarn) {
  const nr = spil.taarne.indexOf(taarn);
  if (nr < 0) return { ok: false, fejl: 'Der er ikke noget at sælge' };
  spil.taarne.splice(nr, 1);
  const guld = salgspris(taarn);
  spil.guld += guld;
  return { ok: true, guld };
}

/** Tårnet på feltet, eller null. */
export const taarnPaa = (spil, kx, ky) => spil.taarne.find(t => t.kx === kx && t.ky === ky) || null;

/** Sender den næste bølge af sted. `tidligt` giver guld for de sekunder, man sprang over. */
export function startBoelge(spil, tidligt = false) {
  if (spil.fase !== 'pause') return false;
  if (tidligt) spil.guld += Math.ceil(Math.max(0, spil.pauseTid)) * BONUS_PR_SEK;
  spil.boelge += 1;
  spil.fase = 'boelge';
  spil.pauseTid = 0;
  const f = hpFaktor(spil.boelge), g = guldFaktor(spil.boelge);
  spil.koe = [];
  for (const gruppe of boelgePlan(spil.boelge)) {
    const m = MONSTRE[gruppe.slags];
    for (let i = 0; i < gruppe.antal; i++) {
      spil.koe.push({
        slags: gruppe.slags,
        naar: spil.tid + gruppe.forsinkelse + i * gruppe.mellemrum,
        hp: Math.round(m.hp * f),
        guld: Math.round(m.guld * g),
      });
    }
  }
  spil.koe.sort((a, b) => a.naar - b.naar);
  return true;
}

/** Monsteret fylder `hp` af sin egen slags, så livbjælken kan tegnes. */
const skadePaa = (m, skade) => Math.max(1, skade - m.panser);

function ramt(spil, m, skud) {
  m.hp -= skadePaa(m, skud.skade);
  if (skud.langsom) {
    // Det stærkeste og længste is-greb vinder – to isbøsser skal ikke ophæve hinanden.
    if (!m.langsom || skud.langsom < m.langsom.faktor) m.langsom = { faktor: skud.langsom, til: spil.tid + skud.langsomTid };
    else if (m.langsom && spil.tid + skud.langsomTid > m.langsom.til) m.langsom.til = spil.tid + skud.langsomTid;
  }
  if (skud.gift) {
    // Samme regel for giften: den stærkeste sky vinder, og den længste varer ved.
    if (!m.gift || skud.gift > m.gift.dps) m.gift = { dps: skud.gift, til: spil.tid + skud.giftTid };
    else if (spil.tid + skud.giftTid > m.gift.til) m.gift.til = spil.tid + skud.giftTid;
  }
  m.blink = 0.12;
}

function doedeMonstre(spil) {
  for (let i = spil.monstre.length - 1; i >= 0; i--) {
    const m = spil.monstre[i];
    if (m.hp > 0) continue;
    spil.guld += m.guld;
    spil.drab += 1;
    spil.smaeld.push({ x: m.x, y: m.y, r: m.r, liv: 0.3, alder: 0, slags: 'doed' });
    spil.monstre.splice(i, 1);
  }
}

/** Ét fast skridt. Kald `tik()` – den deler et vilkårligt dt op i sådan nogle her. */
function etSkridt(spil, dt) {
  spil.tid += dt;

  if (spil.fase === 'pause') {
    spil.pauseTid -= dt;
    if (spil.pauseTid <= 0) startBoelge(spil);
    return;
  }
  if (spil.fase !== 'boelge') return;

  /* --- Monstre ind på banen --- */
  while (spil.koe.length && spil.koe[0].naar <= spil.tid) {
    const k = spil.koe.shift();
    const m = MONSTRE[k.slags];
    const p = punktPaaSti(0);
    spil.monstre.push({
      id: spil.naesteId++, slags: k.slags, d: 0, x: p.x, y: p.y,
      hp: k.hp, maksHp: k.hp, fart: m.fart, panser: m.panser, guld: k.guld,
      liv: m.liv, r: m.r, langsom: null, blink: 0, vinge: 0,
    });
  }

  /* --- Monstrene går --- */
  for (let i = spil.monstre.length - 1; i >= 0; i--) {
    const m = spil.monstre[i];
    if (m.langsom && m.langsom.til <= spil.tid) m.langsom = null;
    if (m.gift) {
      // Giften tikker af sig selv og går uden om panseret – den er svaret på trolde
      if (m.gift.til <= spil.tid) m.gift = null;
      else m.hp -= m.gift.dps * dt;
    }
    if (m.hp <= 0) continue;        // giften nåede det først – doedeMonstre() rydder op sidst i skridtet
    m.d += m.fart * (m.langsom ? m.langsom.faktor : 1) * dt;
    const p = punktPaaSti(m.d);
    m.x = p.x; m.y = p.y; m.dx = p.dx; m.dy = p.dy;
    if (m.blink > 0) m.blink -= dt;
    m.vinge += dt;
    if (m.d >= STI_LAENGDE) {
      spil.liv -= m.liv;
      spil.monstre.splice(i, 1);
      if (spil.liv <= 0) {
        spil.liv = 0;
        spil.fase = 'slut';
        spil.slut = { boelge: spil.boelge, klarede: spil.klarede, drab: spil.drab };
        return;
      }
    }
  }

  /* --- Tårnene skyder --- */
  for (const t of spil.taarne) {
    const n = niveauet(t);
    if (!n.fart) continue;                        // guldminen skyder ikke – den graver
    t.ladt += dt;
    const maal = vaelgMaal(spil, t, n);
    if (maal) t.vinkel = Math.atan2(maal.y - t.y, maal.x - t.x);
    if (!maal || t.ladt < 1 / n.fart) continue;
    t.ladt = 0;
    spil.skud.push({
      x: t.x, y: t.y, maal: maal.id, mx: maal.x, my: maal.y, slags: t.slags, fra: t.id,
      skade: n.skade, splash: n.splash || 0, langsom: n.langsom || 0, langsomTid: n.langsomTid || 0,
      gift: n.gift || 0, giftTid: n.giftTid || 0, kaede: n.kaede || 0,
      fart: t.slags === 'trold' || t.slags === 'spole' || t.slags === 'snig' ? SKUD_FART * 2.6 : SKUD_FART, alder: 0,
    });
  }

  /* --- Skuddene flyver --- */
  for (let i = spil.skud.length - 1; i >= 0; i--) {
    const s = spil.skud[i];
    s.alder += dt;
    const maal = spil.monstre.find(m => m.id === s.maal);
    if (maal) { s.mx = maal.x; s.my = maal.y; }     // skuddet følger med, til det rammer
    const dx = s.mx - s.x, dy = s.my - s.y;
    const afstand = Math.hypot(dx, dy);
    const skridt = s.fart * dt;
    if (afstand > skridt && s.alder < 3) {
      s.x += dx / afstand * skridt; s.y += dy / afstand * skridt;
      continue;
    }
    s.x = s.mx; s.y = s.my;
    if (s.splash) {
      spil.smaeld.push({ x: s.x, y: s.y, r: s.splash, liv: 0.25, alder: 0, slags: 'bomb' });
      for (const m of spil.monstre) {
        if (Math.hypot(m.x - s.x, m.y - s.y) <= s.splash + m.r) ramt(spil, m, s);
      }
    } else if (maal) {
      ramt(spil, maal, s);
      if (s.kaede) {
        // Lynet hopper videre til de nærmeste – ét hop pr. «kaede», og aldrig tilbage til det samme
        const naeste = spil.monstre
          .filter(m => m !== maal && Math.hypot(m.x - s.x, m.y - s.y) <= KAEDE_RAEKKE)
          .sort((a, b) => Math.hypot(a.x - s.x, a.y - s.y) - Math.hypot(b.x - s.x, b.y - s.y))
          .slice(0, s.kaede);
        const punkter = [{ x: s.x, y: s.y }];
        for (const m of naeste) { ramt(spil, m, s); punkter.push({ x: m.x, y: m.y }); }
        spil.smaeld.push({ x: s.x, y: s.y, r: 4, liv: 0.22, alder: 0, slags: 'kaede', punkter });
      }
      if (s.slags === 'trold') spil.smaeld.push({ x: s.x, y: s.y, r: 5, liv: 0.2, alder: 0, slags: 'lyn' });
      if (s.gift) spil.smaeld.push({ x: s.x, y: s.y, r: 5, liv: 0.3, alder: 0, slags: 'gift' });
    }
    spil.skud.splice(i, 1);
  }
  doedeMonstre(spil);

  /* --- Smæld falmer --- */
  for (let i = spil.smaeld.length - 1; i >= 0; i--) {
    const s = spil.smaeld[i];
    s.alder += dt;
    if (s.alder >= s.liv) spil.smaeld.splice(i, 1);
  }

  /* --- Bølgen klaret --- */
  if (!spil.koe.length && !spil.monstre.length) {
    spil.klarede += 1;
    const mine = mineGuld(spil);
    spil.guld += boelgeBonus(spil.boelge) + mine;
    spil.fase = 'pause';
    spil.pauseTid = PAUSE;
    spil.sidsteBonus = boelgeBonus(spil.boelge);
    spil.sidsteMine = mine;
  }
}

export const boelgeBonus = nr => 18 + nr * 5;
/** Hvad guldminerne graver frem, når en bølge er klaret. */
export const mineGuld = spil => spil.taarne.reduce((sum, t) => sum + (niveauet(t).guld || 0), 0);

/**
 * Hvem skal tårnet skyde på? Den, der er nået længst ad stien, inden for
 * rækkevidde — eller, for snigskytten (`maal: 'staerkest'`), den med mest liv
 * tilbage. Isbøssen og giftskyen springer dem over, der allerede er frosne
 * eller forgiftede – ellers bruger de hele bølgen på det samme monster.
 */
export function vaelgMaal(spil, taarn, n = niveauet(taarn)) {
  const staerkest = TAARN_VED[taarn.slags] && TAARN_VED[taarn.slags].maal === 'staerkest';
  const vaerdi = m => (staerkest ? m.hp : m.d);
  let bedst = null, bedstV = -Infinity, nødløsning = null, nødV = -Infinity;
  for (const m of spil.monstre) {
    if (Math.hypot(m.x - taarn.x, m.y - taarn.y) > n.raekkevidde + m.r) continue;
    if (vaerdi(m) > nødV) { nødløsning = m; nødV = vaerdi(m); }
    if (n.langsom && m.langsom) continue;
    if (n.gift && m.gift) continue;
    if (vaerdi(m) > bedstV) { bedst = m; bedstV = vaerdi(m); }
  }
  return bedst || nødløsning;
}

/**
 * Spolen: et vilkårligt dt deles op i faste skridt, så en test får det samme
 * som en telefon. Der klippes med vilje *ikke* i dt her — så ville `tik(spil, 8)`
 * stille og roligt kun spille ét sekund, og en test ville tro, at tårnene ikke
 * skød. Den, der tegner, klipper selv sit dt (index.html: højst 0,1 sek.).
 */
export function tik(spil, dt) {
  let rest = Math.max(0, dt);
  while (rest > 1e-9 && spil.fase !== 'slut') {
    const d = Math.min(SKRIDT, rest);
    etSkridt(spil, d);
    rest -= d;
  }
  return spil;
}

/* ================= Felter og dækning ================= */
/** Alle felter, man må bygge på. */
export function byggeFelter() {
  const liste = [];
  for (let ky = 0; ky < RAEKKER; ky++) for (let kx = 0; kx < KOLONNER; kx++) {
    if (!paaSti(kx, ky)) liste.push({ kx, ky });
  }
  return liste;
}

/**
 * Hvor mange enheder af stien et felt kan nå med den rækkevidde. Det er dét
 * tal, botten bygger efter – og det, der gør et hjørne bedre end en lige linje.
 */
export function daekning(kx, ky, raekkevidde) {
  const p = midte(kx, ky);
  let sum = 0;
  for (let d = 0; d <= STI_LAENGDE; d += 2) {
    const q = punktPaaSti(d);
    if (Math.hypot(q.x - p.x, q.y - p.y) <= raekkevidde) sum += 2;
  }
  return sum;
}

/* ================= Botten ================= */
/*
  Botten er en målestok, ikke en modstander: den bruges af testene til at spille
  spillet igennem og til at holde øje med, at kurven hverken er for nem eller
  for hård. Den bygger efter en fast plan og opgraderer, når der ikke er flere
  tårne i planen.
*/
export const BOT_PLAN = [
  'bue', 'bue', 'is', 'kanon', 'bue', 'mine', 'gift', 'trold', 'spole', 'is',
  'kanon', 'snig', 'bue', 'trold', 'gift', 'kanon', 'mine', 'spole',
];

/** Det bedste ledige felt til et tårn med den rækkevidde. */
export function bedsteFelt(spil, raekkevidde) {
  let bedst = null, bedstVaerdi = -1;
  for (const f of byggeFelter()) {
    if (spil.taarne.some(t => t.kx === f.kx && t.ky === f.ky)) continue;
    const v = daekning(f.kx, f.ky, raekkevidde);
    if (v > bedstVaerdi) { bedstVaerdi = v; bedst = f; }
  }
  return bedst;
}

/**
 * Det ledige felt, der dækker mindst af stien. Guldminen skyder ikke, så den
 * skal ud i hjørnet og ikke stå og spilde den bedste plads ved stien.
 */
export function ringesteFelt(spil) {
  let bedst = null, mindst = Infinity;
  for (const f of byggeFelter()) {
    if (spil.taarne.some(t => t.kx === f.kx && t.ky === f.ky)) continue;
    const v = daekning(f.kx, f.ky, 30);
    if (v < mindst) { mindst = v; bedst = f; }
  }
  return bedst;
}

/** Ét bot-træk: bygger eller opgraderer, hvis der er råd. Svarer hvad den gjorde. */
export function botTraek(spil) {
  if (spil.fase === 'slut') return null;
  const byggeTraek = () => {
    // Følger planen, så længe den rækker – og bliver så ved forfra, som et barn
    // også ville gøre, når guldet hober sig op og alting er opgraderet.
    const slags = BOT_PLAN[spil.taarne.length % BOT_PLAN.length];
    const type = TAARN_VED[slags];
    if (spil.guld < type.pris) return null;
    const rk = type.niveauer[0].raekkevidde;
    const f = rk ? bedsteFelt(spil, rk) : ringesteFelt(spil);
    if (!f || !byg(spil, slags, f.kx, f.ky).ok) return null;
    return { hvad: 'byg', slags, ...f };
  };
  if (spil.taarne.length < BOT_PLAN.length) return byggeTraek();

  // Alle planens tårne står: opgradér det billigste, der kan opgraderes.
  let bedst = null, pris = Infinity;
  for (const t of spil.taarne) {
    if (t.niveau >= MAKS_NIVEAU) continue;
    const p = niveauet(t).opgradering;
    if (p < pris) { pris = p; bedst = t; }
  }
  if (bedst && spil.guld >= pris && opgrader(spil, bedst).ok) return { hvad: 'opgrader', id: bedst.id, niveau: bedst.niveau };
  // Intet at opgradere – så bygger vi et tårn mere, hvis der er plads.
  return byggeTraek();
}

/**
 * Lader botten spille, til den taber (eller til `maksBoelger` er nået).
 * Bruges af enhedstesten til at måle, hvor svært spillet er.
 */
export function botSpiller(maksBoelger = 40) {
  const spil = nytSpil();
  let vagt = 0;
  while (spil.fase !== 'slut' && spil.klarede < maksBoelger && vagt < 60 * 60 * 60) {
    while (botTraek(spil)) { /* byg så meget, der er råd til */ }
    if (spil.fase === 'pause') startBoelge(spil, true);
    tik(spil, SKRIDT);
    vagt++;
  }
  return spil;
}
