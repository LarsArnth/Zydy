// Baseforsvars motor: basen, terrænet, zombiernes vej, bønderne, tropperne,
// heltene, belejrerne og balancen.
//
// Kør:  node --test test/unit/baseforsvar.test.mjs
//
// Tre ting er vigtigere end resten. Det første er **vejen**: zombierne følger
// et vejkort, og prøverne holder fast i, at de altid kommer frem til rådhuset —
// uden om terrænet, igennem murene — og aldrig står fast. Det andet er
// **terrænet**: det må aldrig lukke nogen inde. Det tredje er **balancen**: en
// doven spiller skal tabe tidligt, en dygtig skal komme langt, de nye ting
// (tropper, helte, ballista) skal være deres pris værd — og alle ender med at tabe.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FELT, KOLONNER, RAEKKER, RAADHUS_FELT, midte, paaBanen, feltVed, froe, FRIRUM,
  BYGNINGER, BYGNING_VED, BYGGES, MAKS_NIVEAU, bygData, FJENDER, TERRAEN,
  TROPPER, TROP_MAKS, tropTal, tropOpgradering, opgraderTropper, KOE_MAKS, MAKS_TROPPER,
  HELTE, HELT_MAKS, HELT_GENOPSTAAR, heltTal, heltAf, hyrHelt, sendHelt, kast, trylleVenter, xpTil, aura,
  START_GULD, DAG_LAENGDE, BONDE_PRIS, BONDE_TID, SALG_DEL,
  dagNr, erNat, spawnPrSek, hpFaktor, guldFaktor, slagsVaegte, dagVarsel,
  nytSpil, lavTerraen, terraenPaa, fremkommelig, byg, opgrader, saelg, salgspris, bygningPaa,
  traen, traening, bemanding, farmIndtaegt, boenderIAlt, vaelgSkridt, vejKort, sendFjende, tik,
  ledigeFelter, felt, ringFelt, hjoerneFelt, soldaterFra, botTraek, botSpiller,
  traeningssted, traenHaer, haerOversigt,
} from '../../public/spil/baseforsvar/base.mjs';

const H = RAADHUS_FELT;

/** Et spil på en fri bane, hvor der ikke kommer flere zombier af sig selv – så prøven står stille. */
function stilleSpil(guld = 9999, valg = { terraen: false }) {
  const spil = nytSpil(1, valg);
  spil.rng = () => 0.999;          // terningen slår aldrig spawn-tærsklen
  spil.guld = guld;
  return spil;
}

/** Sætter terræn på et felt i hånden (og beder vejkortet regne om). */
function saetTerraen(spil, kx, ky, t = 'sten') {
  spil.terraen[ky * KOLONNER + kx] = t;
  spil.vejSnavs = true;
}

/** Følger vejkortet fra (kx,ky) uden bygninger undervejs og tæller skridtene til rådhuset. */
function gaaHjem(spil, kx, ky) {
  const set = new Set();
  for (let skridt = 0; skridt < 400; skridt++) {
    const valg = vaelgSkridt(spil, kx, ky);
    if (!valg) return { fejl: `intet træk fra (${kx},${ky})` };
    if (valg.slaa) return { slaa: valg.slaa, skridt };
    ({ kx, ky } = valg.gaa);
    if (!fremkommelig(spil, kx, ky)) return { fejl: `gik ind i terræn på (${kx},${ky})` };
    const n = `${kx},${ky}`;
    if (set.has(n)) return { fejl: `gik i ring ved (${kx},${ky})` };
    set.add(n);
  }
  return { fejl: 'kom aldrig frem' };
}

/* ---------- Banen og terrænet ---------- */

test('banen er større, med rådhuset i midten', () => {
  assert.equal(KOLONNER % 2, 1, 'ulige mange kolonner, så midten er et felt');
  assert.equal(RAEKKER % 2, 1, 'og ulige mange rækker');
  assert.ok(KOLONNER * RAEKKER > 11 * 15, 'banen er større end den første udgave');
  assert.deepEqual(H, { kx: 6, ky: 8 });
  const spil = nytSpil(1, { terraen: false });
  assert.equal(spil.bygninger.length, 1, 'kun rådhuset står der fra start');
  assert.equal(spil.raadhus.slags, 'raadhus');
  assert.equal(ledigeFelter(spil).length, KOLONNER * RAEKKER - 1, 'på en fri bane er resten ledigt');
  assert.equal(spil.guld, START_GULD);
});

test('terrænet er nyt for hver runde og ens for samme frø', () => {
  const a = nytSpil(11).terraen, b = nytSpil(11).terraen, c = nytSpil(12).terraen;
  assert.deepEqual(a, b, 'samme frø giver samme bane');
  assert.notDeepEqual(a, c, 'et andet frø giver en anden bane');
  for (let n = 1; n <= 30; n++) {
    const t = nytSpil(n).terraen;
    const antal = t.filter(Boolean).length;
    assert.ok(antal >= 8, `frø ${n}: der er terræn på banen (${antal} felter)`);
    assert.ok(antal <= KOLONNER * RAEKKER * 0.3, `frø ${n}: men højst 30 % af banen (${antal})`);
    for (const slags of t) assert.ok(slags === null || TERRAEN[slags], 'kun klipper, sø og skov');
  }
  // Alle tre slags dukker op, når man spiller nogle runder
  const slags = new Set();
  for (let n = 1; n <= 10; n++) for (const t of nytSpil(n).terraen) if (t) slags.add(t);
  assert.deepEqual([...slags].sort(), ['skov', 'sten', 'vand']);
});

test('terrænet lukker aldrig nogen inde – og der er altid plads omkring rådhuset', () => {
  for (let n = 1; n <= 60; n++) {
    const spil = nytSpil(n);
    for (let dy = -FRIRUM; dy <= FRIRUM; dy++) for (let dx = -FRIRUM; dx <= FRIRUM; dx++) {
      assert.equal(terraenPaa(spil, H.kx + dx, H.ky + dy), null, `frø ${n}: felterne tæt på huset er fri`);
    }
    // Fra hvert eneste felt, man kan stå på – også ringen udenom – kommer man hjem
    for (let ky = -1; ky <= RAEKKER; ky++) for (let kx = -1; kx <= KOLONNER; kx++) {
      if (!fremkommelig(spil, kx, ky) || (kx === H.kx && ky === H.ky)) continue;
      const tur = gaaHjem(spil, kx, ky);
      assert.ok(!tur.fejl, `frø ${n}: ${tur.fejl}`);
      assert.equal(tur.slaa, spil.raadhus, `frø ${n}: fra (${kx},${ky}) ender vejen ved rådhuset`);
    }
  }
});

test('lavTerraen() uden klatter giver en fri bane', () => {
  assert.equal(lavTerraen(froe(3), 0).filter(Boolean).length, 0);
});

test('man kan ikke bygge på terræn', () => {
  const spil = stilleSpil();
  saetTerraen(spil, 1, 1, 'vand');
  assert.equal(byg(spil, 'mur', 1, 1).fejl, 'Man kan ikke bygge i søen');
  saetTerraen(spil, 2, 1, 'sten');
  assert.equal(byg(spil, 'mur', 2, 1).fejl, 'Man kan ikke bygge på klipperne');
  saetTerraen(spil, 3, 1, 'skov');
  assert.equal(byg(spil, 'mur', 3, 1).fejl, 'Man kan ikke bygge i skoven');
  assert.equal(ledigeFelter(spil).some(f => f.ky === 1 && f.kx <= 3 && f.kx >= 1), false, 'og felterne tæller ikke som ledige');
});

/* ---------- Bygningerne ---------- */

test('de syv bygninger kan vælges, rådhuset kan ikke', () => {
  assert.deepEqual(BYGGES.map(b => b.id), ['mur', 'taarn', 'kanon', 'ballista', 'farm', 'kaserne', 'kirke']);
  for (const type of BYGNINGER) {
    assert.equal(type.niveauer.length, MAKS_NIVEAU, `${type.navn} har ${MAKS_NIVEAU} niveauer`);
    assert.equal(type.niveauer[MAKS_NIVEAU - 1].opgradering, 0, `${type.navn} kan ikke opgraderes videre på toppen`);
    for (let i = 1; i < type.niveauer.length; i++) {
      assert.ok(type.niveauer[i].hp > type.niveauer[i - 1].hp, `${type.navn} bliver stærkere for hvert niveau`);
    }
  }
  const spil = stilleSpil();
  assert.equal(byg(spil, 'raadhus', 1, 1).ok, false, 'man kan ikke bygge et rådhus mere');
});

test('man bygger, opgraderer og sælger', () => {
  const spil = stilleSpil(200);
  assert.equal(byg(spil, 'taarn', H.kx, H.ky).fejl, 'Der står allerede noget');
  assert.equal(byg(spil, 'taarn', -1, 3).fejl, 'Uden for banen');

  const svar = byg(spil, 'taarn', H.kx - 1, H.ky - 1);
  assert.equal(svar.ok, true);
  assert.equal(spil.guld, 200 - BYGNING_VED.taarn.pris, 'tårnet kostede sin pris');
  const t = svar.bygning;
  assert.equal(t.hp, bygData(t).hp, 'og det står med fuldt liv');

  t.hp = 10;
  spil.guld = 1000;
  assert.equal(opgrader(spil, t).ok, true);
  assert.equal(t.niveau, 2);
  assert.equal(t.hp, bygData(t).hp, 'en opgradering sætter bygningen helt i stand igen');

  const foer = spil.guld;
  const pris = salgspris(t);
  assert.equal(saelg(spil, t).ok, true);
  assert.equal(spil.guld, foer + pris, 'man får halvdelen af det investerede retur');
  assert.equal(pris, Math.floor(t.investeret * SALG_DEL));
  assert.equal(bygningPaa(spil, H.kx - 1, H.ky - 1), null, 'og feltet er ledigt igen');
  assert.equal(saelg(spil, spil.raadhus).ok, false, 'rådhuset kan man ikke sælge');
});

test('ikke guld nok, og færdigbygget, siger spillet selv', () => {
  const spil = stilleSpil(10);
  assert.equal(byg(spil, 'taarn', 4, 6).fejl, 'Ikke guld nok');
  spil.guld = 99999;
  const t = byg(spil, 'taarn', 4, 6).bygning;
  for (let n = 1; n < MAKS_NIVEAU; n++) assert.equal(opgrader(spil, t).ok, true);
  assert.equal(opgrader(spil, t).fejl, 'Færdigbygget');
});

/* ---------- Zombiernes vej ---------- */

test('en mur sender zombien udenom – men fire mure om huset skal der bides i', () => {
  const spil = stilleSpil();
  const mur = byg(spil, 'mur', H.kx, H.ky - 1).bygning;       // mur lige nord for rådhuset
  // Lige nordfra: omvejen rundt om én mur er kortere end at bide sig igennem
  const tur = gaaHjem(spil, H.kx, H.ky - 3);
  assert.equal(tur.slaa, spil.raadhus, 'zombien går udenom og når huset');
  assert.ok(vaelgSkridt(spil, H.kx, H.ky - 2).gaa, 'den bider ikke i muren');

  // Alle fire indgange spærret: så skal der bides, uanset hvor man kommer fra
  for (const [dx, dy] of [[0, 1], [-1, 0], [1, 0]]) byg(spil, 'mur', H.kx + dx, H.ky + dy);
  for (const [kx, ky] of [[H.kx, -1], [KOLONNER, H.ky], [0, RAEKKER], [-1, 0]]) {
    const t = gaaHjem(spil, kx, ky);
    assert.equal(t.slaa && t.slaa.slags, 'mur', `fra (${kx},${ky}) ender vejen i en mur`);
  }
  assert.ok(mur);
});

test('en lang mur er billigere at bide sig igennem end at gå hele vejen udenom', () => {
  const spil = stilleSpil();
  for (let kx = 0; kx < KOLONNER; kx++) if (kx !== H.kx) saetTerraen(spil, kx, 3);   // en klippevæg med ét hul
  const mur = byg(spil, 'mur', H.kx, 3).bygning;                                   // og muren i hullet
  const t = gaaHjem(spil, H.kx, 0);
  assert.equal(t.slaa, mur, 'den eneste vej er gennem muren');
});

test('zombier går udenom terræn og kommer frem', () => {
  const spil = stilleSpil();
  // En klippevæg tværs over banen med et hul helt ude i siden
  for (let kx = 1; kx < KOLONNER; kx++) saetTerraen(spil, kx, 3);
  const z = sendFjende(spil, 'loeber', { kx: H.kx, ky: 0 });
  let paaTerraen = false, xMin = Infinity;
  for (let i = 0; i < 60 * 30 && spil.raadhus.hp === spil.raadhus.maksHp; i++) {
    tik(spil, 1 / 60);
    const f = feltVed(z.x, z.y);
    if (terraenPaa(spil, f.kx, f.ky)) paaTerraen = true;
    xMin = Math.min(xMin, z.x);
  }
  assert.equal(paaTerraen, false, 'den trådte aldrig på klipperne');
  assert.ok(xMin < FELT, 'den gik ud til hullet i siden');
  assert.ok(spil.raadhus.hp < spil.raadhus.maksHp, 'og nåede rådhuset');
});

test('zombierne bider sig igennem en mur og videre til rådhuset', () => {
  const spil = stilleSpil();
  for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) byg(spil, 'mur', H.kx + dx, H.ky + dy);
  const mur = bygningPaa(spil, H.kx, H.ky - 1);
  for (let i = 0; i < 3; i++) sendFjende(spil, 'brute', { kx: H.kx, ky: H.ky - 2 });
  tik(spil, 30);
  assert.equal(spil.bygninger.includes(mur), false, 'muren blev ædt');
  assert.ok(spil.raadhus.hp < spil.raadhus.maksHp, 'og så gik de i gang med rådhuset');
});

test('vejkortet regnes kun om, når der er sket noget', () => {
  const spil = stilleSpil();
  const a = vejKort(spil);
  assert.equal(vejKort(spil), a, 'uden ændringer er det det samme kort');
  byg(spil, 'mur', 2, 2);
  assert.notEqual(vejKort(spil), a, 'en ny bygning giver et nyt kort');
});

test('falder rådhuset, er spillet slut', () => {
  const spil = stilleSpil();
  spil.raadhus.hp = 30;
  sendFjende(spil, 'brute', { kx: H.kx, ky: H.ky - 1 });
  tik(spil, 20);
  assert.equal(spil.fase, 'slut');
  assert.equal(spil.slut.klarede, spil.klarede);
});

/* ---------- Tårnene ---------- */

test('et tårn skyder zombien ned, og der kommer guld for den', () => {
  const spil = stilleSpil();
  byg(spil, 'taarn', H.kx - 1, H.ky - 1);
  spil.guld = 0;
  const z = sendFjende(spil, 'zombie', { kx: H.kx, ky: H.ky - 2 });
  tik(spil, 10);
  assert.equal(spil.fjender.includes(z), false, 'zombien blev skudt');
  assert.equal(spil.drab, 1);
  assert.ok(spil.guld > 0, 'og den gav guld');
});

test('kanonens bombe rammer hele flokken, og panser trækkes fra hvert skud', () => {
  const spil = stilleSpil();
  const kanon = byg(spil, 'kanon', H.kx - 1, H.ky - 1).bygning;
  const flok = [0, 1, 2].map(() => sendFjende(spil, 'brute', { kx: H.kx, ky: H.ky - 2 }));
  for (const f of flok) f.fart = 0;
  const start = flok.map(f => f.hp);
  tik(spil, 1 / bygData(kanon).fart + 1);
  assert.ok(flok.every((f, i) => f.hp < start[i]), 'bomben ramte dem alle sammen');
  assert.equal(start[0] - flok[0].hp, bygData(kanon).skade - FJENDER.brute.panser, 'panseret bider af skaden');
});

test('en mur skyder ikke, og en farm heller ikke', () => {
  const spil = stilleSpil();
  const mur = byg(spil, 'mur', H.kx - 1, H.ky - 1).bygning;
  byg(spil, 'farm', H.kx + 1, H.ky - 1);
  const z = sendFjende(spil, 'zombie', { kx: H.kx, ky: H.ky - 2 });
  z.fart = 0;
  const hp = z.hp;
  tik(spil, 6);
  assert.equal(z.hp, hp, 'ingen af dem gør noget ved zombien');
  assert.equal(bygData(mur).fart, undefined);
});

/* ---------- Belejrerne og ballisten ---------- */

test('belejreren kaster længere end alle tårne rækker – men ballisten når den', () => {
  const tårne = BYGNINGER.filter(b => b.niveauer[0].raekkevidde && b.id !== 'ballista');
  const laengst = Math.max(...tårne.map(b => b.niveauer[MAKS_NIVEAU - 1].raekkevidde));
  assert.ok(FJENDER.belejrer.raekkevidde > laengst, `belejreren (${FJENDER.belejrer.raekkevidde}) kaster længere end ethvert tårn (${laengst})`);
  assert.ok(BYGNING_VED.ballista.niveauer[0].raekkevidde > FJENDER.belejrer.raekkevidde, 'ballisten rækker længere, allerede på niveau 1');
  assert.ok(slagsVaegte(5).every(v => v[0] !== 'belejrer'), 'belejrerne kommer ikke de første dage');
  assert.ok(slagsVaegte(6).some(v => v[0] === 'belejrer'), 'men fra dag 6');
  assert.match(dagVarsel(6), /Belejrere/);
});

test('belejreren stiller sig uden for tårnets rækkevidde og smadrer det', () => {
  const spil = stilleSpil();
  const taarn = byg(spil, 'taarn', H.kx, H.ky - 1).bygning;
  for (let i = 1; i < MAKS_NIVEAU; i++) opgrader(spil, taarn);   // selv på øverste niveau
  const b = sendFjende(spil, 'belejrer', { kx: H.kx, ky: -1 });
  const hp = b.hp;
  tik(spil, 120);
  assert.equal(spil.bygninger.includes(taarn), false, 'tårnet blev smadret med sten');
  assert.equal(b.hp, hp, 'uden at tårnet nogensinde kunne ramme belejreren');
});

test('ballisten sigter først efter belejreren – og skyder den ned', () => {
  const spil = stilleSpil();
  const ballista = byg(spil, 'ballista', H.kx, H.ky - 1).bygning;
  const zombie = sendFjende(spil, 'zombie', { kx: H.kx - 1, ky: H.ky - 3 });
  zombie.fart = 0;
  const b = sendFjende(spil, 'belejrer', { kx: H.kx, ky: -1 });
  const zHp = zombie.hp;
  tik(spil, 40);
  assert.equal(spil.fjender.includes(b), false, 'belejreren faldt');
  assert.ok(spil.bygninger.includes(ballista), 'og ballisten står endnu');
  assert.ok(zombie.hp === zHp || spil.fjender.includes(zombie) === false, 'zombien kom bagefter');
});

/* ---------- Bønder og penge ---------- */

test('bønder trænes på farmen og giver guld ved daggry', () => {
  const spil = stilleSpil(1000);
  const farm = byg(spil, 'farm', 2, 2).bygning;
  assert.deepEqual(bemanding(spil, farm), { har: 0, undervejs: 0, plads: bygData(farm).pladser });
  assert.equal(traening(farm)[0].slags, 'bonde');

  const foer = spil.guld;
  assert.equal(traen(spil, farm).ok, true);
  assert.equal(spil.guld, foer - BONDE_PRIS, 'bonden kostede sin pris med det samme');
  assert.equal(traen(spil, farm).ok, true, 'man kan sætte flere i kø');
  assert.equal(traen(spil, farm).fejl, 'Ikke plads til flere – opgradér', 'men ikke flere, end der er plads til');
  tik(spil, BONDE_TID + 0.1);
  assert.equal(farm.boender, 1, 'én ad gangen: den første er færdig');
  tik(spil, BONDE_TID);
  assert.equal(farm.boender, 2, 'og så den næste');
  assert.equal(boenderIAlt(spil), 2);
  assert.equal(farmIndtaegt(spil), bygData(farm).indtaegt * 2);

  const guldFoer = spil.guld, indtaegt = farmIndtaegt(spil);
  tik(spil, DAG_LAENGDE - (spil.tid % DAG_LAENGDE) + 0.1);
  assert.equal(spil.dag, 2, 'der er gået en dag');
  assert.equal(spil.klarede, 1, 'og den tæller som overlevet');
  assert.equal(spil.guld, guldFoer + indtaegt, 'farmen betalte');
});

test('en farm uden bønder giver ingenting – og bønderne ryger med, når den falder', () => {
  const spil = stilleSpil(1000);
  const farm = byg(spil, 'farm', H.kx, H.ky - 1).bygning;
  for (const [dx, dy] of [[0, 1], [-1, 0], [1, 0]]) byg(spil, 'mur', H.kx + dx, H.ky + dy);
  assert.equal(farmIndtaegt(spil), 0, 'en tom farm er ren udgift');
  traen(spil, farm); tik(spil, BONDE_TID + 0.1);
  assert.ok(farmIndtaegt(spil) > 0);
  for (let i = 0; i < 4; i++) sendFjende(spil, 'brute', { kx: H.kx, ky: H.ky - 2 });
  tik(spil, 25);
  assert.equal(spil.bygninger.includes(farm), false, 'farmen blev ædt');
  assert.equal(boenderIAlt(spil), 0, 'og bønderne med');
});

/* ---------- Tropperne ---------- */

test('kasernen træner soldater og bueskyttere – så mange man vil, i kø', () => {
  const spil = stilleSpil(99999);
  const kaserne = byg(spil, 'kaserne', H.kx - 1, H.ky).bygning;
  assert.deepEqual(traening(kaserne).map(t => t.slags), ['soldat', 'bueskytte']);
  for (let i = 0; i < 4; i++) assert.equal(traen(spil, kaserne, 'soldat').ok, true, 'man kan trykke flere gange');
  assert.equal(traen(spil, kaserne, 'bueskytte').ok, true);
  assert.equal(kaserne.igang.length, 2, 'allerede på niveau 1 trænes to ad gangen (ønske #60)');
  assert.equal(kaserne.koe.length, 3, 'resten står i kø');
  tik(spil, TROPPER.soldat.tid * 4 + TROPPER.bueskytte.tid + 0.5);
  assert.equal(soldaterFra(spil, kaserne, 'soldat'), 4);
  assert.equal(soldaterFra(spil, kaserne, 'bueskytte'), 1);
  assert.equal(bemanding(spil, kaserne).plads, Infinity, 'kasernen har ikke noget loft');
  for (let i = 0; i < 10; i++) traen(spil, kaserne, 'soldat');
  tik(spil, TROPPER.soldat.tid * 10 + 1);
  assert.equal(soldaterFra(spil, kaserne), 15, 'der kan komme mange flere fra den samme kaserne');
});

test('en opgraderet kaserne træner flere ad gangen', () => {
  const spil = stilleSpil(99999);
  const kaserne = byg(spil, 'kaserne', 3, 3).bygning;
  for (let i = 1; i < MAKS_NIVEAU; i++) opgrader(spil, kaserne);
  for (let i = 0; i < 6; i++) traen(spil, kaserne, 'soldat');
  assert.equal(kaserne.igang.length, bygData(kaserne).samtidig, `${bygData(kaserne).samtidig} ad gangen`);
  tik(spil, TROPPER.soldat.tid + 0.1);
  assert.equal(soldaterFra(spil, kaserne), bygData(kaserne).samtidig, 'og de blev færdige samtidig');
});

test('hæren samlet: træn fra oversigten, og køen fordeles på kasernerne (ønske #60)', () => {
  const spil = stilleSpil(99999);
  assert.equal(traenHaer(spil, 'soldat').fejl, 'Byg først en kaserne', 'uden kaserne ingen soldater');
  assert.equal(traenHaer(spil, 'praest').fejl, 'Byg først en kirke');
  const a = byg(spil, 'kaserne', 3, 3).bygning;
  const b = byg(spil, 'kaserne', 9, 3).bygning;
  opgrader(spil, b);                                    // b træner tre ad gangen, a to
  const svar = traenHaer(spil, 'soldat', 5);
  assert.deepEqual(svar, { ok: true, antal: 5, fejl: null });
  assert.equal(a.igang.length + a.koe.length, 2, 'den lille kaserne fik to');
  assert.equal(b.igang.length + b.koe.length, 3, 'den store fik tre');
  assert.equal(a.koe.length + b.koe.length, 0, 'så alle fem trænes på én gang');
  traenHaer(spil, 'bueskytte', 2);
  let o = haerOversigt(spil);
  const soldat = o.find(x => x.slags === 'soldat'), bue = o.find(x => x.slags === 'bueskytte');
  assert.equal(soldat.undervejs, 5);
  assert.equal(bue.undervejs, 2);
  assert.equal(soldat.bygninger, 2);
  assert.equal(soldat.samtidig, 5, 'to plus tre ad gangen');
  assert.equal(soldat.paaBanen, 0);
  assert.ok(Math.abs(soldat.naeste - TROPPER.soldat.tid) < 1e-9, 'næste er klar om en hel træningstid');
  assert.equal(o.find(x => x.slags === 'praest').bygninger, 0);
  assert.equal(o.find(x => x.slags === 'praest').kanTraenes, false);
  tik(spil, TROPPER.soldat.tid + 0.1);
  o = haerOversigt(spil);
  assert.equal(o.find(x => x.slags === 'soldat').paaBanen, 5, 'alle fem kom ud samtidig');
  assert.equal(o.find(x => x.slags === 'soldat').niveau, 1);
  opgraderTropper(spil, 'soldat');
  assert.equal(haerOversigt(spil).find(x => x.slags === 'soldat').niveau, 2);
});

test('hæren samlet: løber guldet tør, kommer der færre i kø – og man betaler kun for dem', () => {
  const spil = stilleSpil(99999);
  byg(spil, 'kaserne', 3, 3);
  spil.guld = TROPPER.soldat.pris * 3 + 5;
  const svar = traenHaer(spil, 'soldat', 5);
  assert.equal(svar.ok, true);
  assert.equal(svar.antal, 3);
  assert.equal(svar.fejl, 'Ikke guld nok');
  assert.equal(spil.guld, 5);
  assert.equal(traenHaer(spil, 'soldat').ok, false, 'og så er der ikke til flere');
});

test('hæren samlet: er alle køer fulde, er der intet træningssted', () => {
  const spil = stilleSpil(999999);
  const k = byg(spil, 'kaserne', 3, 3).bygning;
  assert.equal(traeningssted(spil, 'soldat'), k);
  assert.equal(traenHaer(spil, 'soldat', KOE_MAKS + 3).antal, KOE_MAKS);
  assert.equal(traeningssted(spil, 'soldat'), null);
  assert.equal(traenHaer(spil, 'soldat').fejl, 'Køen er fuld');
  assert.equal(haerOversigt(spil).find(x => x.slags === 'soldat').kanTraenes, false);
});

test('køen har en ende, og hæren har et loft, så telefonen kan følge med', () => {
  const spil = stilleSpil(999999);
  const k = byg(spil, 'kaserne', 3, 3).bygning;
  for (let i = 0; i < KOE_MAKS; i++) assert.equal(traen(spil, k).ok, true);
  assert.equal(traen(spil, k).fejl, 'Køen er fuld');
  assert.ok(MAKS_TROPPER >= 60, 'men loftet er højt');
});

test('sælger man en kaserne med en kø, får man køen retur', () => {
  const spil = stilleSpil(1000);
  const k = byg(spil, 'kaserne', 3, 3).bygning;
  traen(spil, k, 'soldat'); traen(spil, k, 'soldat');
  const foer = spil.guld;
  const svar = saelg(spil, k);
  assert.equal(svar.guld, salgspris(k) + TROPPER.soldat.pris * 2);
  assert.equal(spil.guld, foer + svar.guld);
});

test('bueskytten skyder fra afstand, soldaten går helt hen', () => {
  const spil = stilleSpil(99999);
  const kaserne = byg(spil, 'kaserne', H.kx - 2, H.ky).bygning;
  traen(spil, kaserne, 'bueskytte');
  tik(spil, TROPPER.bueskytte.tid + 0.1);
  const bue = spil.soldater[0];
  const z = sendFjende(spil, 'brute', { kx: H.kx - 2, ky: H.ky - 3 });
  z.fart = 0; z.skade = 0;
  let naermest = Infinity;
  for (let i = 0; i < 60 * 8; i++) { tik(spil, 1 / 60); naermest = Math.min(naermest, Math.hypot(bue.x - z.x, bue.y - z.y)); }
  assert.ok(z.hp < z.maksHp, 'pilene ramte');
  assert.ok(naermest > 10, `bueskytten blev på afstand (${naermest.toFixed(1)})`);
});

test('opgraderer man soldaterne, bliver dem på banen stærkere med det samme', () => {
  const spil = stilleSpil(99999);
  const kaserne = byg(spil, 'kaserne', 3, 3).bygning;
  traen(spil, kaserne, 'soldat'); tik(spil, TROPPER.soldat.tid + 0.1);
  const s = spil.soldater[0];
  const foer = s.maksHp;
  s.hp = 1;
  const pris = tropOpgradering('soldat', 1);
  const guld = spil.guld;
  assert.equal(opgraderTropper(spil, 'soldat').ok, true);
  assert.equal(spil.guld, guld - pris);
  assert.equal(spil.tropNiv.soldat, 2);
  assert.ok(s.maksHp > foer, 'soldaten på banen fik det nye niveau');
  assert.equal(s.hp, s.maksHp, 'og blev sat i stand');
  assert.ok(tropTal('soldat', 2).skade > tropTal('soldat', 1).skade, 'og slår hårdere');
  assert.equal(spil.tropNiv.bueskytte, 1, 'bueskytterne er ikke rørt');
  for (let n = 2; n < TROP_MAKS; n++) opgraderTropper(spil, 'soldat');
  assert.equal(opgraderTropper(spil, 'soldat').fejl, 'Færdigtrænet');
});

test('præsten heler den, der har fået bank', () => {
  const spil = stilleSpil(99999);
  const kaserne = byg(spil, 'kaserne', 3, 3).bygning;
  const kirke = byg(spil, 'kirke', 4, 3).bygning;
  assert.deepEqual(traening(kirke).map(t => t.slags), ['praest']);
  traen(spil, kaserne, 'soldat'); traen(spil, kirke, 'praest');
  tik(spil, Math.max(TROPPER.soldat.tid, TROPPER.praest.tid) + 0.1);
  const soldat = spil.soldater.find(s => s.slags === 'soldat');
  soldat.hp = 10;
  tik(spil, 6);
  assert.ok(soldat.hp > 10 + 20, `soldaten blev helet (${soldat.hp})`);
});

test('tropperne går udenom terræn og står aldrig i det', () => {
  const spil = stilleSpil(99999);
  for (let kx = 0; kx < KOLONNER - 1; kx++) saetTerraen(spil, kx, 4, 'vand');   // en sø med en vej rundt i højre side
  const kaserne = byg(spil, 'kaserne', 2, 5).bygning;
  traen(spil, kaserne, 'soldat'); tik(spil, TROPPER.soldat.tid + 0.1);
  const s = spil.soldater[0];
  const z = sendFjende(spil, 'zombie', { kx: 2, ky: 2 });
  z.fart = 0;
  let iVand = false;
  for (let i = 0; i < 60 * 20 && spil.fjender.includes(z); i++) {
    tik(spil, 1 / 60);
    const f = feltVed(s.x, s.y);
    if (terraenPaa(spil, f.kx, f.ky)) iVand = true;
  }
  assert.equal(iVand, false, 'soldaten gik aldrig ud i søen');
  assert.equal(spil.fjender.includes(z), false, 'men kom rundt og fik fat i zombien');
});

/* ---------- Heltene ---------- */

test('tre helte, der hver kan hyres én gang', () => {
  assert.equal(Object.keys(HELTE).length, 3);
  for (const h of Object.values(HELTE)) {
    assert.ok(h.aura && h.aura.navn && h.aura.r > 0, `${h.navn} har en aura`);
    assert.ok(h.trylle && h.trylle.navn && h.trylle.ventetid > 0, `${h.navn} har en trylleformular`);
  }
  const spil = stilleSpil(1000);
  const foer = spil.guld;
  const svar = hyrHelt(spil, 'ridder');
  assert.equal(svar.ok, true);
  assert.equal(spil.guld, foer - HELTE.ridder.pris);
  assert.equal(heltAf(spil, 'ridder'), svar.helt);
  assert.match(hyrHelt(spil, 'ridder').fejl, /allerede hyret/);
  spil.guld = 0;
  assert.equal(hyrHelt(spil, 'jaeger').fejl, 'Ikke guld nok');
});

test('helten får erfaring for zombier, der falder tæt på, og stiger i niveau', () => {
  const spil = stilleSpil(1000);
  const h = hyrHelt(spil, 'ridder').helt;
  const hp1 = h.maksHp;
  for (let i = 0; i < 30 && h.niv < 3; i++) {
    const z = sendFjende(spil, 'kaempe', feltVed(h.x, h.y - 6));
    z.hp = 0;
    tik(spil, 1 / 60);
  }
  assert.ok(h.niv >= 3, `ridderen steg i niveau (niveau ${h.niv})`);
  assert.ok(h.maksHp > hp1, 'og tåler mere');
  assert.ok(heltTal('ridder', 5).skade > heltTal('ridder', 1).skade, 'og slår hårdere');
  assert.ok(xpTil(5) > xpTil(1), 'hvert niveau kræver mere');
  h.niv = HELT_MAKS - 1; h.xp = 0;
  for (let i = 0; i < 200 && h.niv < HELT_MAKS; i++) { const z = sendFjende(spil, 'kaempe', feltVed(h.x, h.y - 6)); z.hp = 0; tik(spil, 1 / 60); }
  assert.equal(h.niv, HELT_MAKS, 'og der er et loft');
});

test('en faldet helt rejser sig igen ved rådhuset – med sit niveau i behold', () => {
  const spil = stilleSpil(1000);
  const h = hyrHelt(spil, 'jaeger').helt;
  h.niv = 4;
  h.hp = 0;
  tik(spil, 0.1);
  assert.equal(h.doed, true);
  assert.equal(kast(spil, h).fejl, 'Helten er faldet');
  tik(spil, HELT_GENOPSTAAR);
  assert.equal(h.doed, false, 'han er tilbage');
  assert.equal(h.hp, h.maksHp);
  assert.equal(h.niv, 4);
});

test('helten kan sendes ud – men ikke ud i søen', () => {
  const spil = stilleSpil(1000);
  const h = hyrHelt(spil, 'ridder').helt;
  saetTerraen(spil, 1, 1, 'vand');
  assert.equal(sendHelt(spil, h, 15, 15).fejl, 'Man kan ikke stå i søen');
  const maal = midte(2, 12);
  assert.equal(sendHelt(spil, h, maal.x, maal.y).ok, true);
  tik(spil, 10);
  assert.ok(Math.hypot(h.x - maal.x, h.y - maal.y) < 4, 'han gik derhen');
});

test('Ridderens skjoldslag lammer, Troldkvindens ildregn rammer flokken, Jægerens pileregn otte', () => {
  const spil = stilleSpil(9999);
  const r = hyrHelt(spil, 'ridder').helt, t = hyrHelt(spil, 'troldkvinde').helt, j = hyrHelt(spil, 'jaeger').helt;
  assert.equal(kast(spil, r).fejl, 'Ingen zombier tæt på', 'uden zombier bliver formularen ikke brugt');
  assert.equal(trylleVenter(spil, r), 0, 'og så skal den ikke lades op igen');

  const flok = [0, 1, 2].map(() => sendFjende(spil, 'kaempe', feltVed(r.x, r.y - 8)));
  for (const f of flok) f.fart = 0;
  assert.equal(kast(spil, r).ok, true);
  assert.ok(flok.every(f => f.lammet > spil.tid), 'skjoldslaget lammede dem');
  assert.ok(trylleVenter(spil, r) > 0, 'og skal lades op igen');
  assert.equal(kast(spil, r).fejl, 'Ikke klar endnu');

  const foer = flok.map(f => f.hp);
  assert.equal(kast(spil, t).ok, true);
  assert.ok(flok.every((f, i) => f.hp < foer[i]), 'ildregnen ramte hele flokken');

  for (let i = 0; i < 9; i++) sendFjende(spil, 'zombie', feltVed(j.x + 10, j.y - 10)).fart = 0;
  assert.equal(kast(spil, j).ramte, HELTE.jaeger.trylle.antal, 'pileregnen ramte otte');
});

test('auraerne: Ridderen giver mod, Troldkvinden fart, Jægeren rækkevidde', () => {
  const spil = stilleSpil(9999);
  const r = hyrHelt(spil, 'ridder').helt;
  assert.ok(aura(spil, r.x, r.y, 'skade') > 0, 'tæt på ridderen slår man hårdere');
  assert.equal(aura(spil, r.x + 100, r.y, 'skade'), 0, 'langt væk gør auraen ingenting');
  hyrHelt(spil, 'troldkvinde');
  assert.ok(aura(spil, r.x, r.y, 'fart') > 0);

  // Jægeren står ved et skydetårn på øverste niveau: nu rækker det en belejrer
  const spil2 = stilleSpil(9999);
  const taarn = byg(spil2, 'taarn', H.kx, H.ky - 1).bygning;
  for (let i = 1; i < MAKS_NIVEAU; i++) opgrader(spil2, taarn);
  const rk = bygData(taarn).raekkevidde;
  const j = hyrHelt(spil2, 'jaeger').helt;
  j.x = taarn.x; j.y = taarn.y; j.vagt = { x: taarn.x, y: taarn.y };
  assert.ok(rk * (1 + aura(spil2, taarn.x, taarn.y, 'raekkevidde')) > FJENDER.belejrer.raekkevidde,
    'med Jægerens aura rækker tårnet længere end belejreren kaster');
});

/* ---------- Dag, nat og tilfældighed ---------- */

test('dagene går, og natten er den halve dag', () => {
  assert.equal(dagNr(0), 1);
  assert.equal(dagNr(DAG_LAENGDE), 2);
  assert.equal(erNat(0), false);
  assert.equal(erNat(DAG_LAENGDE * 0.9), true);
  assert.equal(erNat(DAG_LAENGDE * 1.1), false);
});

test('der kommer flere og stærkere zombier, jo længere man når', () => {
  assert.ok(spawnPrSek(5, false) > spawnPrSek(1, false));
  assert.ok(spawnPrSek(3, true) > spawnPrSek(3, false) * 2);
  assert.equal(hpFaktor(1), 1);
  assert.ok(hpFaktor(10) > 3);
  assert.ok(guldFaktor(10) < hpFaktor(10), 'guldet følger ikke med – derfor taber alle til sidst');
  assert.deepEqual(slagsVaegte(1).map(v => v[0]), ['zombie']);
  assert.ok(slagsVaegte(5).some(v => v[0] === 'brute'));
  assert.ok(slagsVaegte(10).some(v => v[0] === 'kaempe'));
  assert.equal(dagVarsel(3), 'Løbere! De er hurtige');
  assert.equal(dagVarsel(2), null);
});

test('samme frø giver den samme uge – to gange', () => {
  const spil1 = nytSpil(7), spil2 = nytSpil(7);
  tik(spil1, 120); tik(spil2, 120);
  assert.deepEqual(spil1.fjender.map(f => [f.slags, Math.round(f.x), Math.round(f.y)]),
    spil2.fjender.map(f => [f.slags, Math.round(f.x), Math.round(f.y)]));
  const andet = nytSpil(8);
  tik(andet, 120);
  assert.notDeepEqual(andet.fjender.map(f => [f.slags, f.x]), spil1.fjender.map(f => [f.slags, f.x]));
});

test('zombierne kommer fra alle fire sider', () => {
  const spil = nytSpil(3);
  const sider = new Set();
  for (let i = 0; i < 200; i++) {
    const f = sendFjende(spil);
    if (f.ky < 0) sider.add('nord');
    else if (f.ky >= RAEKKER) sider.add('syd');
    else if (f.kx < 0) sider.add('vest');
    else sider.add('øst');
  }
  assert.deepEqual([...sider].sort(), ['nord', 'syd', 'vest', 'øst']);
});

test('tik deler et stort dt op i faste skridt', () => {
  const a = stilleSpil(); const b = stilleSpil();
  sendFjende(a, 'zombie', { kx: H.kx, ky: 0 });
  sendFjende(b, 'zombie', { kx: H.kx, ky: 0 });
  tik(a, 3);
  for (let i = 0; i < 180; i++) tik(b, 1 / 60);
  assert.ok(Math.abs(a.fjender[0].y - b.fjender[0].y) < 0.01);
  assert.ok(a.fjender[0].y > 5, 'og zombien er faktisk gået fremad');
});

test('bygninger lappes om dagen, men ikke om natten', () => {
  const spil = stilleSpil();
  const mur = byg(spil, 'mur', 2, 2).bygning;
  mur.hp = 10;
  tik(spil, 5);
  assert.ok(mur.hp > 10);
  const nat = stilleSpil();
  const mur2 = byg(nat, 'mur', 2, 2).bygning;
  mur2.hp = 10;
  nat.tid = DAG_LAENGDE * 0.8;
  tik(nat, 5);
  assert.equal(mur2.hp, 10);
});

/* ---------- Felter og botten ---------- */

test('felt(), ringFelt() og hjoerneFelt() finder de rigtige pladser', () => {
  const spil = stilleSpil();
  assert.equal(Math.hypot(felt(spil).kx - H.kx, felt(spil).ky - H.ky), 1, 'lige ved siden af huset');
  const ring = ringFelt(spil, 1);
  assert.equal(Math.hypot(ring.kx - H.kx, ring.ky - H.ky), 1, 'ringen begynder med de fire indgange');
  assert.equal(paaBanen(ring.kx, ring.ky), true);
  const h = hjoerneFelt(spil);
  assert.ok(Math.abs(h.kx - H.kx) >= 1 && Math.abs(h.ky - H.ky) >= 1, 'hjørnefeltet ligger skråt ud fra huset');
});

test('botten sparer op i stedet for at bruge løs på det billigste', () => {
  const spil = nytSpil(1);
  spil.rng = () => 0.999;
  spil.guld = 0;
  assert.equal(botTraek(spil), null);
  spil.guld = 10;
  assert.equal(botTraek(spil), null);
  spil.guld = BYGNING_VED.mur.pris;
  assert.ok(botTraek(spil));
});

test('balancen: gør man ingenting, falder basen hurtigt', () => {
  const spil = nytSpil(1);
  let vagt = 0;
  while (spil.fase !== 'slut' && vagt++ < 60 * 60 * 20) tik(spil, 1 / 60);
  assert.equal(spil.fase, 'slut');
  assert.ok(spil.klarede <= 3, `uden forsvar holder basen højst tre dage (den holdt ${spil.klarede})`);
});

test('balancen: to tårne og ingenting andet rækker ikke langt', () => {
  const spil = nytSpil(1);
  byg(spil, 'taarn', H.kx - 1, H.ky);
  byg(spil, 'taarn', H.kx + 1, H.ky);
  let vagt = 0;
  while (spil.fase !== 'slut' && vagt++ < 60 * 60 * 30) tik(spil, 1 / 60);
  assert.ok(spil.klarede < 12, `den dovne spiller skal tabe før den dygtige (nåede ${spil.klarede})`);
});

test('balancen: en spiller, der bygger fornuftigt, kommer langt – men taber til sidst', () => {
  // Botten bygger mure ved huset, tårne, en ballista, farme med bønder, en
  // kaserne og en kirke, hyrer helte og opgraderer, når der er råd. Den er en
  // målestok: bliver tallene her skæve, er spillet trivielt eller håbløst.
  const frø = [1, 2, 3, 4, 5, 6];
  const alt = frø.map(n => botSpiller(60, n));
  for (const spil of alt) {
    assert.equal(spil.fase, 'slut', 'også en dygtig spiller ender med at tabe');
    assert.ok(spil.klarede >= 8, `botten skal nå mindst otte dage (nåede ${spil.klarede})`);
    assert.ok(spil.klarede <= 45, `men ikke i det uendelige (nåede ${spil.klarede})`);
    assert.ok(spil.drab > 100, 'og der bliver nedlagt en masse zombier undervejs');
  }
  assert.ok(Math.max(...alt.map(s => s.klarede)) >= 15, 'den bedste runde når mindst dag 15');
  assert.ok(alt.some(s => s.helte.some(h => h.niv >= 3)), 'heltene når at stige i niveau');

  // De nye ting skal være deres pris værd: med tropper, helte og ballista
  // kommer botten længere end uden
  const uden = frø.map(n => botSpiller(60, n, {}));
  const snit = l => l.reduce((s, x) => s + x.klarede, 0) / l.length;
  assert.ok(snit(alt) > snit(uden), `med det hele (${snit(alt).toFixed(1)} dage) skal man nå længere end uden (${snit(uden).toFixed(1)})`);
});
