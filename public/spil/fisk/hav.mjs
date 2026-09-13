/*
  Motoren bag «Fiskedybet» – havet, fiskene, båden og alt det, man kan købe.

  Filen er ren JS uden DOM og uden canvas, så hele fiskeriet kan enhedstestes
  uden browser (test/unit/fisk.test.mjs). index.html står for havet, tegningen
  og fingrene på skærmen.

  Fire ting styrer spillet:

  1. **Fem farvande i træk.** Solskinshavet er gratis; hvert af de dybere
     kræver en længere snøre (ZONER[i].krav === snøre-niveauet). Det er dét,
     der gør en opgradering til andet end et større tal: den åbner et nyt sted
     med nye dyr i.

  2. **Kampen er én bar.** En viser løber frem og tilbage, og et tryk tæller
     kun, hvis den er inde i det grønne felt. Feltet flytter sig, hver gang
     man rammer, så man ikke bare kan trykke i takt. Store dyr kræver flere
     rammere og tåler færre forbiere. Hele kampen ligger her (nyKamp,
     kampSkridt, kampTryk), så en test kan gennemspille den uden at vente.

  3. **Uhyrerne er et valg.** I de dybe farvande hugger der ting, man ikke
     bare kan hale ind: enten klipper man snøren (intet tabt, intet vundet),
     eller også tager man kampen – og taber man den, tager uhyret en bid af
     båden. Det er dét, der gør det farligt at blive dernede.

  4. **Fiskebogen og lasten er to forskellige ting.** Alt, hvad man fanger,
     står i bogen for altid (det er scoren), mens pengene ligger i lasten,
     til man har sejlet dem hjem til havnen. Går skroget i nul, bliver man
     slæbt i havn og mister *lasten* – aldrig bogen. Ellers ville et uheld i
     Afgrunden koste en samling, man har brugt en uge på.
*/

/* ---------- Farvandene ---------- */
/*
  `fare` er kun til stemningen (hvor mørkt der er, og hvad HUD'en siger) –
  hvor tit der hugger noget farligt, står i uhyrets egen `chance` nedenfor.
*/
export const ZONER = [
  { id: 'sol', navn: 'Solskinshavet', emoji: '🐟', krav: 0, dybde: 12, om: 'Almindelige fisk og nemme penge.' },
  { id: 'haj', navn: 'Hajvandet', emoji: '🦈', krav: 1, dybde: 60, om: 'Større fisk – og hajer, der gerne vil smage på båden.' },
  { id: 'dyb', navn: 'Dybhavet', emoji: '🌑', krav: 2, dybde: 400, om: 'Mørkt. Det, der lyser hernede, er levende.' },
  { id: 'afgrund', navn: 'Afgrunden', emoji: '🩸', krav: 3, dybde: 2400, om: 'Du begynder at fange ting, der ikke burde findes.' },
  { id: 'tomrum', navn: 'Tomrummet', emoji: '👁️', krav: 4, dybde: 9000, om: 'Næsten ingenting hugger. Det, der gør, er alt værd.' },
];

export const zonen = id => ZONER.find(z => z.id === id) || null;
export const zoneNr = id => ZONER.findIndex(z => z.id === id);

/* ---------- Dyrene ---------- */
/*
  `chance` er hvor tungt dyret vejer, når der trækkes lod om, hvad der hugger
  (inden for zonen). `kamp` er hvor mange gange man skal ramme det grønne
  felt, `fart` hvor hurtigt viseren løber, og `vindue` hvor bredt feltet er,
  før stangen gør det bredere. `form` og farverne er kun til tegningen.
*/
export const ARTER = [
  /* Solskinshavet */
  { id: 'stoevle', navn: 'Gummistøvle', zone: 'sol', form: 'skrald', farve: '#4b5a7a', farve2: '#2b3550', pris: 2, vaegt: [0.4, 1.2], kamp: 1, fart: 0.9, vindue: 0.34, chance: 10 },
  { id: 'sild', navn: 'Sild', zone: 'sol', form: 'fisk', farve: '#b9d4e8', farve2: '#6f93b5', pris: 6, vaegt: [0.15, 0.6], kamp: 1, fart: 1.0, vindue: 0.32, chance: 34 },
  { id: 'makrel', navn: 'Makrel', zone: 'sol', form: 'fisk', farve: '#5ee0a8', farve2: '#1f6f57', pris: 11, vaegt: [0.4, 1.6], kamp: 1, fart: 1.2, vindue: 0.3, chance: 26 },
  { id: 'rodspaette', navn: 'Rødspætte', zone: 'sol', form: 'flad', farve: '#c98a4b', farve2: '#7a4f28', pris: 17, vaegt: [0.5, 2.4], kamp: 2, fart: 1.0, vindue: 0.3, chance: 18 },
  { id: 'hornfisk', navn: 'Hornfisk', zone: 'sol', form: 'lang', farve: '#8fe3c8', farve2: '#2f7a63', pris: 24, vaegt: [0.6, 1.8], kamp: 2, fart: 1.5, vindue: 0.26, chance: 12 },
  { id: 'torsk', navn: 'Torsk', zone: 'sol', form: 'fisk', farve: '#9fb37a', farve2: '#5a6b3c', pris: 34, vaegt: [1.5, 9], kamp: 2, fart: 1.1, vindue: 0.28, chance: 9 },
  { id: 'havbars', navn: 'Havbars', zone: 'sol', form: 'fisk', farve: '#d8e6f2', farve2: '#4b6f96', pris: 60, vaegt: [2, 7], kamp: 3, fart: 1.3, vindue: 0.25, chance: 4 },

  /* Hajvandet */
  { id: 'blaeksprutte', navn: 'Blæksprutte', zone: 'haj', form: 'blaek', farve: '#e58fb5', farve2: '#8a3f65', pris: 70, vaegt: [1, 6], kamp: 2, fart: 1.3, vindue: 0.26, chance: 26 },
  { id: 'rokke', navn: 'Rokke', zone: 'haj', form: 'rokke', farve: '#a8b6c8', farve2: '#5a6a80', pris: 95, vaegt: [4, 22], kamp: 3, fart: 1.2, vindue: 0.25, chance: 20 },
  { id: 'tun', navn: 'Tun', zone: 'haj', form: 'fisk', farve: '#6cc5ff', farve2: '#26567f', pris: 140, vaegt: [30, 160], kamp: 3, fart: 1.6, vindue: 0.23, chance: 16 },
  { id: 'sverdfisk', navn: 'Sværdfisk', zone: 'haj', form: 'sverd', farve: '#8fa8d8', farve2: '#3a4d80', pris: 190, vaegt: [40, 210], kamp: 4, fart: 1.8, vindue: 0.21, chance: 10 },
  { id: 'pighaj', navn: 'Pighaj', zone: 'haj', form: 'haj', farve: '#7d8fa6', farve2: '#3d4a5e', pris: 240, vaegt: [5, 30], kamp: 3, fart: 1.7, vindue: 0.22, chance: 12 },
  { id: 'hvidhaj', navn: 'Hvidhajen', zone: 'haj', form: 'haj', farve: '#c4ccd8', farve2: '#40505f', pris: 520, vaegt: [300, 1100], kamp: 4, fart: 1.9, vindue: 0.2, chance: 6, uhyre: true, skade: 1, om: 'Den er større end båden.' },

  /* Dybhavet */
  { id: 'lanternefisk', navn: 'Lanternefisk', zone: 'dyb', form: 'fisk', farve: '#2f4a6b', farve2: '#16283f', pris: 210, vaegt: [0.1, 0.5], kamp: 2, fart: 1.5, vindue: 0.24, chance: 28, lys: '#8fe3ff' },
  { id: 'havtaske', navn: 'Havtaske', zone: 'dyb', form: 'lygte', farve: '#4a3b60', farve2: '#241b38', pris: 300, vaegt: [2, 18], kamp: 3, fart: 1.4, vindue: 0.22, chance: 22, lys: '#ffe6a0' },
  { id: 'pelikanaal', navn: 'Pelikanålen', zone: 'dyb', form: 'lang', farve: '#3a2f55', farve2: '#1c1730', pris: 380, vaegt: [1, 9], kamp: 3, fart: 1.7, vindue: 0.21, chance: 18, lys: '#ff8fd0' },
  { id: 'kaempekrabbe', navn: 'Kæmpekrabben', zone: 'dyb', form: 'krabbe', farve: '#d06a4a', farve2: '#7a3320', pris: 440, vaegt: [8, 40], kamp: 4, fart: 1.3, vindue: 0.21, chance: 14 },
  { id: 'vampyrblaek', navn: 'Vampyrblæksprutten', zone: 'dyb', form: 'blaek', farve: '#8a2f55', farve2: '#40122a', pris: 560, vaegt: [1, 12], kamp: 4, fart: 1.8, vindue: 0.19, chance: 10, lys: '#ff6ba8' },
  { id: 'kalmar', navn: 'Kæmpekalmaren', zone: 'dyb', form: 'blaek', farve: '#b04a7a', farve2: '#4a1030', pris: 1100, vaegt: [200, 900], kamp: 5, fart: 2.0, vindue: 0.18, chance: 8, uhyre: true, skade: 1, om: 'Armene er længere end masten.' },

  /* Afgrunden */
  { id: 'knoglefisken', navn: 'Knoglefisken', zone: 'afgrund', form: 'skelet', farve: '#e8e0d0', farve2: '#8a8070', pris: 900, vaegt: [3, 26], kamp: 3, fart: 1.7, vindue: 0.2, chance: 26 },
  { id: 'bleg', navn: 'Den Blege Ting', zone: 'afgrund', form: 'blob', farve: '#e6e6f0', farve2: '#9a9ab0', pris: 1150, vaegt: [10, 90], kamp: 4, fart: 1.6, vindue: 0.19, chance: 22, lys: '#ffffff' },
  { id: 'droemmeaal', navn: 'Drømmeålen', zone: 'afgrund', form: 'lang', farve: '#6a4ab0', farve2: '#2c1b55', pris: 1400, vaegt: [4, 40], kamp: 4, fart: 2.0, vindue: 0.18, chance: 18, lys: '#b78fff' },
  { id: 'tandmunden', navn: 'Tandmunden', zone: 'afgrund', form: 'mund', farve: '#3a1f2f', farve2: '#180a14', pris: 1700, vaegt: [20, 180], kamp: 5, fart: 1.9, vindue: 0.17, chance: 14, lys: '#ff4d5e' },
  { id: 'tusindoejet', navn: 'Tusindøjet', zone: 'afgrund', form: 'oeje', farve: '#2b3d72', farve2: '#101a3a', pris: 2100, vaegt: [30, 260], kamp: 5, fart: 2.1, vindue: 0.16, chance: 10, lys: '#ffd447' },
  { id: 'afgrundsmunden', navn: 'Afgrundsmunden', zone: 'afgrund', form: 'mund', farve: '#5a1020', farve2: '#1a0308', pris: 3600, vaegt: [800, 4000], kamp: 5, fart: 2.2, vindue: 0.16, chance: 8, uhyre: true, skade: 2, om: 'Den lukker ikke munden igen.' },

  /* Tomrummet */
  { id: 'stjernesluger', navn: 'Stjerneslugeren', zone: 'tomrum', form: 'blob', farve: '#1b2a56', farve2: '#070c1e', pris: 4200, vaegt: [40, 400], kamp: 4, fart: 2.0, vindue: 0.18, chance: 26, lys: '#ffd447' },
  { id: 'tidsfisken', navn: 'Tidsfisken', zone: 'tomrum', form: 'fisk', farve: '#7ad4ff', farve2: '#123a5a', pris: 5200, vaegt: [1, 30], kamp: 5, fart: 2.2, vindue: 0.17, chance: 22, lys: '#c9f4ff' },
  { id: 'detderkigger', navn: 'Det Der Kigger', zone: 'tomrum', form: 'oeje', farve: '#120c28', farve2: '#050310', pris: 6800, vaegt: [5, 120], kamp: 5, fart: 2.3, vindue: 0.16, chance: 16, lys: '#ff4d5e' },
  { id: 'dengamle', navn: 'Den Gamle', zone: 'tomrum', form: 'skelet', farve: '#4a4a5e', farve2: '#12121c', pris: 9000, vaegt: [500, 3000], kamp: 5, fart: 2.4, vindue: 0.15, chance: 10 },
  { id: 'tomrummetsoeje', navn: 'Tomrummets Øje', zone: 'tomrum', form: 'oeje', farve: '#e8e0ff', farve2: '#2a1b55', pris: 15000, vaegt: [2000, 9000], kamp: 5, fart: 2.5, vindue: 0.15, chance: 8, uhyre: true, skade: 2, om: 'Det har set dig hele tiden.' },
];

export const arten = id => ARTER.find(a => a.id === id) || null;
export const arterIZone = zone => ARTER.filter(a => a.zone === zone);

/* ---------- Butikken ---------- */
/*
  Fire ting at spare op til, fem niveauer hver. Priserne stiger hurtigt, så en
  opgradering altid koster nogle ture – og snøren er den, der åbner et helt
  nyt farvand, så den er den dyreste.
*/
export const OPGRADERINGER = [
  { id: 'snoer', navn: 'Snøren', ikon: '🪢', om: 'Længere snøre – du kan sejle et farvand dybere ud.', priser: [0, 90, 340, 1200, 4200] },
  { id: 'stang', navn: 'Stangen', ikon: '🎣', om: 'Bedre stang – det grønne felt bliver bredere i kampen.', priser: [0, 70, 220, 700, 2200] },
  { id: 'skrog', navn: 'Skroget', ikon: '🛶', om: 'Stærkere skrog – båden kan tåle flere bid.', priser: [0, 110, 320, 1000, 3000] },
  { id: 'koelerum', navn: 'Kølerummet', ikon: '🧊', om: 'Mere plads i lasten, så du kan blive længere ude.', priser: [0, 80, 260, 850, 2600] },
];

export const opgraderingen = id => OPGRADERINGER.find(o => o.id === id) || null;
export const MAKS_NIVEAU = 4;                 // niveau 0-4, altså fem trin
export const LAST_PLADSER = [4, 6, 9, 13, 18];
export const REPARATION_PRIS = 25;            // pr. hjerte
export const START_MOENTER = 15;

export const maksSkrog = spil => 3 + spil.opgradering.skrog;
export const maksLast = spil => LAST_PLADSER[spil.opgradering.koelerum];
export const dybestZone = spil => ZONER[Math.min(ZONER.length - 1, spil.opgradering.snoer)];
export const laastOp = (spil, zoneId) => spil.opgradering.snoer >= (zonen(zoneId)?.krav ?? 99);

/** Hvad næste niveau af en opgradering koster – null, hvis den er på toppen. */
export function prisFor(spil, id) {
  const o = opgraderingen(id);
  const n = spil.opgradering[id];
  if (!o || n >= MAKS_NIVEAU) return null;
  return o.priser[n + 1];
}

/** Køber næste niveau, hvis der er råd. Returnerer true ved køb. */
export function koeb(spil, id) {
  const pris = prisFor(spil, id);
  if (pris == null || spil.moenter < pris) return false;
  spil.moenter -= pris;
  spil.opgradering[id]++;
  if (id === 'skrog') spil.skrog++;            // et nyt dæk er helt, ikke halvt
  return true;
}

/* ---------- Terningen ---------- */
/** Lille deterministisk generator (mulberry32), så ?seed= giver den samme tur. */
export function froe(seed) {
  let t = (seed >>> 0) || 1;
  return function () {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- Båden ---------- */
export function nytSpil() {
  return {
    v: 1,
    sted: 'havn',                              // 'havn' eller et zone-id
    moenter: START_MOENTER,
    tjent: 0,
    opgradering: { snoer: 0, stang: 0, skrog: 0, koelerum: 0 },
    skrog: 3,
    last: [],                                  // [{ art, vaegt, vaerdi }]
    bog: {},                                   // artId → { antal, bedste }
    ture: 0,
  };
}

/** Hvor mange forskellige arter man har i bogen – det er scoren. */
export const arterFanget = spil => Object.keys(spil.bog).length;

/** Hvad lasten er værd lige nu. */
export const lastVaerdi = spil => spil.last.reduce((s, f) => s + f.vaerdi, 0);

/** Sejler til havnen eller et farvand, man har snøre nok til. */
export function sejl(spil, sted) {
  if (sted !== 'havn' && !laastOp(spil, sted)) return false;
  if (sted !== 'havn' && !zonen(sted)) return false;
  if (spil.sted === sted) return false;
  spil.sted = sted;
  if (sted !== 'havn') spil.ture++;
  return true;
}

/** Sælger hele lasten. Kan kun lade sig gøre i havnen. */
export function saelg(spil) {
  if (spil.sted !== 'havn' || !spil.last.length) return { antal: 0, moenter: 0 };
  const moenter = lastVaerdi(spil), antal = spil.last.length;
  spil.moenter += moenter;
  spil.tjent += moenter;
  spil.last = [];
  return { antal, moenter };
}

/** Hvad det koster at lappe skroget helt op. */
export const reparationsPris = spil => (maksSkrog(spil) - spil.skrog) * REPARATION_PRIS;

/** Lapper skroget i havnen, hvis der er råd. Returnerer antal lappede hjerter. */
export function reparer(spil) {
  const pris = reparationsPris(spil);
  if (spil.sted !== 'havn' || pris <= 0 || spil.moenter < pris) return 0;
  const hjerter = maksSkrog(spil) - spil.skrog;
  spil.moenter -= pris;
  spil.skrog = maksSkrog(spil);
  return hjerter;
}

/**
 * Et bid af båden. Går skroget i nul, bliver man slæbt i havn og mister
 * lasten – men aldrig fiskebogen.
 */
export function skade(spil, n = 1) {
  spil.skrog -= n;
  if (spil.skrog > 0) return { skrog: spil.skrog, slaebt: false, tabt: 0, vaerdi: 0 };
  const tabt = spil.last.length, vaerdi = lastVaerdi(spil);
  spil.last = [];
  spil.skrog = maksSkrog(spil);
  spil.sted = 'havn';
  return { skrog: spil.skrog, slaebt: true, tabt, vaerdi };
}

/* ---------- Hvad der hugger ---------- */
export const vaerdiFor = (art, vaegt) => {
  const [a, b] = art.vaegt;
  const andel = b > a ? Math.max(0, Math.min(1, (vaegt - a) / (b - a))) : 0.5;
  return Math.max(1, Math.round(art.pris * (0.65 + 0.7 * andel)));
};

/** Trækker lod om, hvad der hugger i det farvand, båden ligger i. */
export function traek(spil, r) {
  const pulje = arterIZone(spil.sted);
  if (!pulje.length) return null;
  let sum = 0;
  for (const a of pulje) sum += a.chance;
  let v = r() * sum;
  let art = pulje[pulje.length - 1];
  for (const a of pulje) { v -= a.chance; if (v <= 0) { art = a; break; } }
  return bidAf(art, r);
}

/** Gør en art til et konkret bid med vægt og værdi. */
export function bidAf(art, r) {
  const [a, b] = art.vaegt;
  // To lodtrækninger ganget sammen: så er de rigtig store sjældne.
  const andel = r() * r();
  const vaegt = Math.round((a + (b - a) * andel) * 100) / 100;
  return { art: art.id, navn: art.navn, uhyre: !!art.uhyre, vaegt, vaerdi: vaerdiFor(art, vaegt) };
}

/* ---------- Kampen ---------- */
export const MAKS_FEJL = 3;                   // så mange forbiere tåler en almindelig fisk
export const UHYRE_FEJL = 2;                  // et uhyre er mindre tålmodigt

/** Hvor bredt det grønne felt er (andel af baren) for denne art med den stang. */
export function vindue(spil, art) {
  const bonus = 1 + 0.17 * spil.opgradering.stang;
  return Math.max(0.08, Math.min(0.6, art.vindue * bonus));
}

/**
 * Starter kampen om et bid. Viseren løber frem og tilbage over baren (0-1),
 * og det grønne felt ligger mellem `maal` og `maal + bredde`.
 */
export function nyKamp(spil, bid, r) {
  const art = arten(bid.art);
  const bredde = vindue(spil, art);
  return {
    art: art.id, navn: art.navn, uhyre: !!art.uhyre, vaegt: bid.vaegt, vaerdi: bid.vaerdi,
    kraevet: art.kamp, ramt: 0,
    fejl: 0, maksFejl: art.uhyre ? UHYRE_FEJL : MAKS_FEJL,
    fart: art.fart, bredde,
    maal: r() * (1 - bredde),
    pos: 0, retning: 1, t: 0,
    maksTid: 4 + art.kamp * 3,                // giver op af sig selv, så spillet aldrig står stille
    slut: null,                               // 'vundet' | 'tabt'
  };
}

export const rammer = kamp => kamp.pos >= kamp.maal && kamp.pos <= kamp.maal + kamp.bredde;

/** Lader `dt` sekunder gå: viseren flytter sig og vender ved enderne. */
export function kampSkridt(kamp, dt) {
  if (kamp.slut) return kamp;
  kamp.t += dt;
  let p = kamp.pos + kamp.retning * kamp.fart * dt;
  while (p < 0 || p > 1) {                    // vend, også hvis et skridt var langt
    if (p < 0) { p = -p; kamp.retning = 1; }
    else { p = 2 - p; kamp.retning = -1; }
  }
  kamp.pos = p;
  if (kamp.t >= kamp.maksTid) kamp.slut = 'tabt';
  return kamp;
}

/**
 * Et tryk. Rammer man det grønne felt, tæller det – og feltet flytter sig, så
 * man ikke bare kan trykke i takt. Returnerer 'ramt' eller 'forbi'.
 */
export function kampTryk(kamp, r) {
  if (kamp.slut) return kamp.slut;
  if (rammer(kamp)) {
    kamp.ramt++;
    if (kamp.ramt >= kamp.kraevet) { kamp.slut = 'vundet'; return 'ramt'; }
    kamp.maal = r() * (1 - kamp.bredde);
    kamp.fart *= 1.08;                        // den kæmper hårdere, jo tættere man er
    return 'ramt';
  }
  kamp.fejl++;
  if (kamp.fejl >= kamp.maksFejl) kamp.slut = 'tabt';
  return 'forbi';
}

/* ---------- Fangsten ---------- */
/**
 * Noterer fangsten i bogen og lægger den i lasten, hvis der er plads.
 * Bogen får den altid – den er en dagbog over, hvad man har fanget, og en
 * fuld last skal ikke kunne koste en sjælden art.
 * Returnerer { nyArt, rekord, iLast }.
 */
export function land(spil, kamp) {
  const f = spil.bog[kamp.art] || { antal: 0, bedste: 0 };
  const nyArt = f.antal === 0;
  const rekord = kamp.vaegt > f.bedste;
  spil.bog[kamp.art] = { antal: f.antal + 1, bedste: Math.max(f.bedste, kamp.vaegt) };
  const plads = spil.last.length < maksLast(spil);
  if (plads) spil.last.push({ art: kamp.art, vaegt: kamp.vaegt, vaerdi: kamp.vaerdi });
  return { nyArt, rekord, iLast: plads };
}

/* ---------- Gem og hent ---------- */
export function serialiser(spil) {
  return {
    v: 1,
    sted: spil.sted, moenter: spil.moenter, tjent: spil.tjent,
    opgradering: { ...spil.opgradering }, skrog: spil.skrog,
    last: spil.last.map(f => ({ ...f })),
    bog: JSON.parse(JSON.stringify(spil.bog)),
    ture: spil.ture,
  };
}

const tal = (v, fald, min = 0, maks = 1e9) =>
  (typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.min(maks, v)) : fald);

/**
 * Læser et gemt spil. Er der noget galt med data, falder vi tilbage til
 * fornuftige værdier i stedet for at miste båden.
 */
export function laes(data) {
  if (!data || typeof data !== 'object') return null;
  const spil = nytSpil();
  for (const o of OPGRADERINGER) {
    spil.opgradering[o.id] = Math.round(tal(data.opgradering?.[o.id], 0, 0, MAKS_NIVEAU));
  }
  spil.moenter = Math.round(tal(data.moenter, START_MOENTER, 0, 1e9));
  spil.tjent = Math.round(tal(data.tjent, 0, 0, 1e12));
  spil.ture = Math.round(tal(data.ture, 0, 0, 1e7));
  spil.skrog = Math.round(tal(data.skrog, maksSkrog(spil), 1, maksSkrog(spil)));
  spil.sted = data.sted === 'havn' || (zonen(data.sted) && laastOp(spil, data.sted)) ? data.sted : 'havn';
  if (Array.isArray(data.last)) {
    spil.last = data.last
      .filter(f => f && arten(f.art))
      .slice(0, maksLast(spil))
      .map(f => ({ art: f.art, vaegt: tal(f.vaegt, 1, 0, 1e5), vaerdi: Math.round(tal(f.vaerdi, 1, 0, 1e7)) }));
  }
  if (data.bog && typeof data.bog === 'object') {
    for (const [id, f] of Object.entries(data.bog)) {
      if (!arten(id) || !f) continue;
      spil.bog[id] = { antal: Math.round(tal(f.antal, 1, 1, 1e6)), bedste: tal(f.bedste, 0, 0, 1e5) };
    }
  }
  return spil;
}

/* ---------- Småting til skærmen ---------- */
/** Vægten som tekst: under et kilo i gram, ellers med ét decimal. */
export function vaegtTekst(kg) {
  if (kg < 1) return Math.round(kg * 1000) + ' g';
  if (kg < 100) return (Math.round(kg * 10) / 10).toString().replace('.', ',') + ' kg';
  return Math.round(kg) + ' kg';
}

/** Mønter med tusindtalspunktum, så 12400 kan læses. */
export const moentTekst = n => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
