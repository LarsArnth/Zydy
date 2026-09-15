// Baseforsvars motor: basen, zombiernes vej, bønderne, soldaterne og balancen.
//
// Kør:  node --test test/unit/baseforsvar.test.mjs
//
// To ting er vigtigere end resten. Det ene er **vejen**: der er ingen sti og
// ingen pathfinding, så prøverne holder fast i, at en zombie enten kommer
// tættere på rådhuset eller bider i det, der står i vejen — ellers kan de gå i
// ring eller stå fast. Det andet er **balancen**: en doven spiller skal tabe
// tidligt, og en dygtig skal komme langt, men alle skal ende med at tabe.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FELT, KOLONNER, RAEKKER, RAADHUS_FELT, midte, paaBanen, froe,
  BYGNINGER, BYGNING_VED, BYGGES, MAKS_NIVEAU, bygData, FJENDER,
  START_GULD, DAG_LAENGDE, BONDE_PRIS, SOLDAT_PRIS, SOLDAT_TID, BONDE_TID, SALG_DEL,
  dagNr, erNat, spawnPrSek, hpFaktor, guldFaktor, slagsVaegte, dagVarsel,
  nytSpil, byg, opgrader, saelg, salgspris, bygningPaa, traen, traening, bemanding,
  farmIndtaegt, boenderIAlt, vaelgSkridt, sendFjende, tik, ledigeFelter, felt, ringFelt,
  soldaterFra, botTraek, botSpiller,
} from '../../public/spil/baseforsvar/base.mjs';

/** Et spil, hvor der ikke kommer flere zombier af sig selv – så prøven står stille. */
function stilleSpil(guld = 9999) {
  const spil = nytSpil(1);
  spil.rng = () => 0.999;          // terningen slår aldrig spawn-tærsklen
  spil.guld = guld;
  return spil;
}

test('banen har rådhuset i midten, og alt andet kan bebygges', () => {
  assert.equal(KOLONNER % 2, 1, 'ulige mange kolonner, så midten er et felt');
  assert.equal(RAEKKER % 2, 1, 'og ulige mange rækker');
  assert.deepEqual(RAADHUS_FELT, { kx: 5, ky: 7 });
  const spil = nytSpil(1);
  assert.equal(spil.bygninger.length, 1, 'kun rådhuset står der fra start');
  assert.equal(spil.raadhus.slags, 'raadhus');
  assert.equal(ledigeFelter(spil).length, KOLONNER * RAEKKER - 1, 'resten af banen er ledig');
  assert.equal(spil.guld, START_GULD);
});

test('de fem bygninger kan vælges, rådhuset kan ikke', () => {
  assert.deepEqual(BYGGES.map(b => b.id), ['mur', 'taarn', 'kanon', 'farm', 'kaserne']);
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
  assert.equal(byg(spil, 'taarn', RAADHUS_FELT.kx, RAADHUS_FELT.ky).fejl, 'Der står allerede noget');
  assert.equal(byg(spil, 'taarn', -1, 3).fejl, 'Uden for banen');

  const svar = byg(spil, 'taarn', 4, 6);
  assert.equal(svar.ok, true);
  assert.equal(spil.guld, 200 - BYGNING_VED.taarn.pris, 'tårnet kostede sin pris');
  const t = svar.bygning;
  assert.equal(t.hp, bygData(t).hp, 'og det står med fuldt liv');
  assert.equal(bygningPaa(spil, 4, 6), t);

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
  assert.equal(bygningPaa(spil, 4, 6), null, 'og feltet er ledigt igen');
  assert.equal(saelg(spil, spil.raadhus).ok, false, 'rådhuset kan man ikke sælge');
});

test('ikke guld nok, og færdigbygget, siger spillet selv', () => {
  const spil = stilleSpil(10);
  assert.equal(byg(spil, 'taarn', 4, 6).fejl, 'Ikke guld nok');
  spil.guld = 99999;
  const t = byg(spil, 'taarn', 4, 6).bygning;
  for (let n = 1; n < MAKS_NIVEAU; n++) assert.equal(opgrader(spil, t).ok, true);
  assert.equal(t.niveau, MAKS_NIVEAU);
  assert.equal(opgrader(spil, t).fejl, 'Færdigbygget');
});

/* ---------- Zombiernes vej ---------- */

test('en zombie går altid tættere på rådhuset – eller bider i det, der spærrer', () => {
  const spil = stilleSpil();
  const tilHus = (kx, ky) => Math.hypot(kx - RAADHUS_FELT.kx, ky - RAADHUS_FELT.ky);
  // Fra hvert eneste felt på og omkring banen skal der være et svar
  for (let ky = -1; ky <= RAEKKER; ky++) for (let kx = -1; kx <= KOLONNER; kx++) {
    if (kx === RAADHUS_FELT.kx && ky === RAADHUS_FELT.ky) continue;
    const valg = vaelgSkridt(spil, kx, ky);
    assert.ok(valg, `der er et træk fra (${kx},${ky})`);
    if (valg.gaa) assert.ok(tilHus(valg.gaa.kx, valg.gaa.ky) < tilHus(kx, ky), 'skridtet kommer tættere på');
    else assert.equal(valg.slaa.slags, 'raadhus', 'ellers står rådhuset lige der');
  }
});

test('en mur sender den skrå zombie udenom, men den, der kommer lige imod, bider', () => {
  const { kx, ky } = RAADHUS_FELT;
  const spil = stilleSpil();
  const mur = byg(spil, 'mur', kx, ky - 1).bygning;       // mur lige nord for rådhuset

  // Skråt ovenfra: der er stadig en vej rundt om muren
  const skraat = vaelgSkridt(spil, kx - 1, ky - 2);
  assert.ok(skraat.gaa, 'den skrå zombie går udenom');
  assert.notDeepEqual(skraat.gaa, { kx, ky: ky - 1 }, 'og ikke ind i muren');

  // Lige nordfra: skridt til siden kommer ikke tættere på, så der er kun muren
  const ligeImod = vaelgSkridt(spil, kx, ky - 2);
  assert.ok(ligeImod.slaa, 'den, der kommer lige imod, bider i muren');
  assert.equal(ligeImod.slaa, mur);

  // Alle fire indgange spærret: så skal der bides, uanset hvor man kommer fra
  for (const [dx, dy] of [[0, 1], [-1, 0], [1, 0]]) byg(spil, 'mur', kx + dx, ky + dy);
  for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const valg = vaelgSkridt(spil, kx + dx, ky + dy);
    assert.ok(valg.slaa, `fra hjørnet (${dx},${dy}) er der kun mur at bide i`);
    assert.equal(valg.slaa.slags, 'mur');
  }
});

test('zombierne bider sig igennem en mur og videre til rådhuset', () => {
  const spil = stilleSpil();
  for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
    byg(spil, 'mur', RAADHUS_FELT.kx + dx, RAADHUS_FELT.ky + dy);
  }
  const mur = bygningPaa(spil, RAADHUS_FELT.kx, RAADHUS_FELT.ky - 1);
  // Tre bæster sat ned lige over muren
  for (let i = 0; i < 3; i++) sendFjende(spil, 'brute', { kx: RAADHUS_FELT.kx, ky: RAADHUS_FELT.ky - 2 });
  tik(spil, 30);
  assert.equal(spil.bygninger.includes(mur), false, 'muren blev ædt');
  assert.ok(spil.raadhus.hp < spil.raadhus.maksHp, 'og så gik de i gang med rådhuset');
});

test('falder rådhuset, er spillet slut', () => {
  const spil = stilleSpil();
  spil.raadhus.hp = 30;
  sendFjende(spil, 'brute', { kx: RAADHUS_FELT.kx, ky: RAADHUS_FELT.ky - 1 });
  tik(spil, 20);
  assert.equal(spil.fase, 'slut');
  assert.ok(spil.slut, 'og der står, hvor langt man nåede');
  assert.equal(spil.slut.klarede, spil.klarede);
});

/* ---------- Tårnene ---------- */

test('et tårn skyder zombien ned, og der kommer guld for den', () => {
  const spil = stilleSpil();
  byg(spil, 'taarn', RAADHUS_FELT.kx - 1, RAADHUS_FELT.ky - 1);
  spil.guld = 0;
  const z = sendFjende(spil, 'zombie', { kx: RAADHUS_FELT.kx, ky: RAADHUS_FELT.ky - 2 });
  tik(spil, 10);
  assert.equal(spil.fjender.includes(z), false, 'zombien blev skudt');
  assert.equal(spil.drab, 1);
  assert.ok(spil.guld > 0, 'og den gav guld');
});

test('kanonens bombe rammer hele flokken, og panser trækkes fra hvert skud', () => {
  const spil = stilleSpil();
  const kanon = byg(spil, 'kanon', RAADHUS_FELT.kx - 1, RAADHUS_FELT.ky - 1).bygning;
  const sted = { kx: RAADHUS_FELT.kx, ky: RAADHUS_FELT.ky - 2 };
  const flok = [0, 1, 2].map(() => sendFjende(spil, 'brute', sted));
  for (const f of flok) f.fart = 0;                 // hold dem stille, så bomben rammer dem alle
  const start = flok.map(f => f.hp);
  tik(spil, 1 / bygData(kanon).fart + 1);
  assert.ok(flok.every((f, i) => f.hp < start[i]), 'bomben ramte dem alle sammen');
  // Bæstet har panser 3, så et skud gør skade minus panser
  const tabt = start[0] - flok[0].hp;
  assert.equal(tabt, bygData(kanon).skade - FJENDER.brute.panser, 'panseret bider af skaden');
});

test('en mur skyder ikke, og en farm heller ikke', () => {
  const spil = stilleSpil();
  const mur = byg(spil, 'mur', RAADHUS_FELT.kx - 1, RAADHUS_FELT.ky - 1).bygning;
  byg(spil, 'farm', RAADHUS_FELT.kx + 1, RAADHUS_FELT.ky - 1);
  const z = sendFjende(spil, 'zombie', { kx: RAADHUS_FELT.kx, ky: RAADHUS_FELT.ky - 2 });
  z.fart = 0;
  const hp = z.hp;
  tik(spil, 6);
  assert.equal(z.hp, hp, 'ingen af dem gør noget ved zombien');
  assert.equal(bygData(mur).fart, undefined);
});

/* ---------- Bønder og penge ---------- */

test('bønder trænes på farmen og giver guld ved daggry', () => {
  const spil = stilleSpil(1000);
  const farm = byg(spil, 'farm', 2, 2).bygning;
  assert.deepEqual(bemanding(spil, farm), { har: 0, plads: bygData(farm).pladser });
  assert.equal(traening(farm).slags, 'bonde');

  const foer = spil.guld;
  assert.equal(traen(spil, farm).ok, true);
  assert.equal(spil.guld, foer - BONDE_PRIS, 'bonden kostede sin pris med det samme');
  assert.equal(traen(spil, farm).fejl, 'Der trænes allerede', 'én ad gangen');
  tik(spil, BONDE_TID + 0.1);
  assert.equal(farm.boender, 1, 'bonden er færdiguddannet');
  assert.equal(boenderIAlt(spil), 1);
  assert.equal(farmIndtaegt(spil), bygData(farm).indtaegt, 'og han giver sin indtægt');

  // Fyld farmen op og prøv en til
  while (bemanding(spil, farm).har < bygData(farm).pladser) { traen(spil, farm); tik(spil, BONDE_TID + 0.1); }
  assert.equal(traen(spil, farm).fejl, 'Ikke plads til flere – opgradér');

  // Ved daggry falder pengene
  const guldFoer = spil.guld, indtaegt = farmIndtaegt(spil);
  const tilDaggry = DAG_LAENGDE - (spil.tid % DAG_LAENGDE) + 0.1;
  tik(spil, tilDaggry);
  assert.equal(spil.dag, 2, 'der er gået en dag');
  assert.equal(spil.klarede, 1, 'og den tæller som overlevet');
  assert.equal(spil.sidsteIndtaegt, indtaegt);
  assert.equal(spil.guld, guldFoer + indtaegt, 'farmen betalte');
});

test('en farm uden bønder giver ingenting – og bønderne ryger med, når den falder', () => {
  const spil = stilleSpil(1000);
  const farm = byg(spil, 'farm', RAADHUS_FELT.kx, RAADHUS_FELT.ky - 1).bygning;
  assert.equal(farmIndtaegt(spil), 0, 'en tom farm er ren udgift');
  traen(spil, farm); tik(spil, BONDE_TID + 0.1);
  assert.ok(farmIndtaegt(spil) > 0);

  for (let i = 0; i < 4; i++) sendFjende(spil, 'brute', { kx: RAADHUS_FELT.kx, ky: RAADHUS_FELT.ky - 2 });
  tik(spil, 25);
  assert.equal(spil.bygninger.includes(farm), false, 'farmen blev ædt');
  assert.equal(farmIndtaegt(spil), 0, 'og bønderne med');
  assert.equal(boenderIAlt(spil), 0);
});

test('opgraderet farm har plads til flere bønder og betaler bedre', () => {
  const spil = stilleSpil(99999);
  const farm = byg(spil, 'farm', 2, 2).bygning;
  const en = bygData(farm);
  opgrader(spil, farm);
  const to = bygData(farm);
  assert.ok(to.pladser > en.pladser && to.indtaegt > en.indtaegt);
});

/* ---------- Soldaterne ---------- */

test('kasernen træner soldater, der går ud og slås', () => {
  const spil = stilleSpil(1000);
  const kaserne = byg(spil, 'kaserne', RAADHUS_FELT.kx - 1, RAADHUS_FELT.ky).bygning;
  assert.equal(traening(kaserne).slags, 'soldat');
  assert.equal(traen(spil, kaserne).ok, true);
  tik(spil, SOLDAT_TID + 0.1);
  assert.equal(soldaterFra(spil, kaserne), 1, 'soldaten er på benene');
  const s = spil.soldater[0];
  assert.equal(s.hp, bygData(kaserne).soldatHp);

  const z = sendFjende(spil, 'zombie', { kx: RAADHUS_FELT.kx - 2, ky: RAADHUS_FELT.ky });
  z.fart = 0;
  tik(spil, 12);
  assert.ok(z.hp < z.maksHp || !spil.fjender.includes(z), 'soldaten gik hen og huggede løs');
});

test('opgraderes kasernen, bliver soldaterne stærkere med det samme', () => {
  const spil = stilleSpil(99999);
  const kaserne = byg(spil, 'kaserne', 3, 3).bygning;
  traen(spil, kaserne); tik(spil, SOLDAT_TID + 0.1);
  const s = spil.soldater[0];
  const foer = s.maksHp;
  s.hp = 1;
  opgrader(spil, kaserne);
  assert.ok(s.maksHp > foer, 'soldaten på banen fik kasernens nye niveau');
  assert.equal(s.hp, s.maksHp, 'og blev sat i stand');
  assert.equal(s.niveau, kaserne.niveau);
});

test('kasernen har kun plads til et bestemt antal soldater', () => {
  const spil = stilleSpil(99999);
  const kaserne = byg(spil, 'kaserne', 3, 3).bygning;
  const plads = bygData(kaserne).pladser;
  for (let i = 0; i < plads; i++) { assert.equal(traen(spil, kaserne).ok, true); tik(spil, SOLDAT_TID + 0.1); }
  assert.equal(soldaterFra(spil, kaserne), plads);
  assert.equal(traen(spil, kaserne).fejl, 'Ikke plads til flere – opgradér');
});

/* ---------- Dag, nat og tilfældighed ---------- */

test('dagene går, og natten er den halve dag', () => {
  assert.equal(dagNr(0), 1);
  assert.equal(dagNr(DAG_LAENGDE - 0.01), 1);
  assert.equal(dagNr(DAG_LAENGDE), 2);
  assert.equal(erNat(0), false);
  assert.equal(erNat(DAG_LAENGDE * 0.9), true);
  assert.equal(erNat(DAG_LAENGDE * 1.1), false, 'næste morgen er det lyst igen');
});

test('der kommer flere og stærkere zombier, jo længere man når', () => {
  assert.ok(spawnPrSek(5, false) > spawnPrSek(1, false), 'flere for hver dag');
  assert.ok(spawnPrSek(3, true) > spawnPrSek(3, false) * 2, 'og mange flere om natten');
  assert.equal(hpFaktor(1), 1);
  assert.ok(hpFaktor(10) > 3, 'zombierne vokser eksponentielt');
  assert.ok(guldFaktor(10) < hpFaktor(10), 'men guldet følger ikke med – derfor taber alle til sidst');
  assert.deepEqual(slagsVaegte(1).map(v => v[0]), ['zombie'], 'dag 1 er der kun almindelige zombier');
  assert.ok(slagsVaegte(5).some(v => v[0] === 'brute'), 'bæsterne kommer på dag 5');
  assert.ok(slagsVaegte(9).some(v => v[0] === 'kaempe'), 'og kæmperne senere');
  assert.equal(dagVarsel(3), 'Løbere! De er hurtige');
  assert.equal(dagVarsel(2), null);
});

test('samme frø giver den samme uge – to gange', () => {
  const spil1 = nytSpil(7), spil2 = nytSpil(7);
  tik(spil1, 120); tik(spil2, 120);
  assert.equal(spil1.fjender.length, spil2.fjender.length);
  assert.deepEqual(spil1.fjender.map(f => [f.slags, Math.round(f.x), Math.round(f.y)]),
    spil2.fjender.map(f => [f.slags, Math.round(f.x), Math.round(f.y)]));
  const andet = nytSpil(8);
  tik(andet, 120);
  assert.notDeepEqual(andet.fjender.map(f => [f.slags, f.x]), spil1.fjender.map(f => [f.slags, f.x]));
});

test('zombierne kommer fra alle fire sider, ikke ad en sti', () => {
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
  sendFjende(a, 'zombie', { kx: 5, ky: 0 });
  sendFjende(b, 'zombie', { kx: 5, ky: 0 });
  tik(a, 3);
  for (let i = 0; i < 180; i++) tik(b, 1 / 60);
  assert.ok(Math.abs(a.fjender[0].y - b.fjender[0].y) < 0.01, 'ét stort dt giver det samme som mange små');
  assert.ok(a.fjender[0].y > 5, 'og zombien er faktisk gået fremad');
});

/* ---------- Håndværkerne ---------- */

test('bygninger lappes om dagen, men ikke om natten', () => {
  const spil = stilleSpil();
  const mur = byg(spil, 'mur', 2, 2).bygning;
  mur.hp = 10;
  spil.tid = 0;                                   // morgen
  tik(spil, 5);
  assert.ok(mur.hp > 10, 'om dagen bliver der repareret');

  const nat = stilleSpil();
  const mur2 = byg(nat, 'mur', 2, 2).bygning;
  mur2.hp = 10;
  nat.tid = DAG_LAENGDE * 0.8;                    // midt om natten
  tik(nat, 5);
  assert.equal(mur2.hp, 10, 'om natten står håndværkerne stille');
});

/* ---------- Felter og botten ---------- */

test('felt() finder pladsen tættest på rådhuset, ringFelt() de fire indgange', () => {
  const spil = stilleSpil();
  const naer = felt(spil);
  assert.equal(Math.hypot(naer.kx - RAADHUS_FELT.kx, naer.ky - RAADHUS_FELT.ky), 1, 'lige ved siden af huset');
  const fjern = felt(spil, true);
  assert.ok(Math.hypot(fjern.kx - RAADHUS_FELT.kx, fjern.ky - RAADHUS_FELT.ky) > 5, 'og den anden vej ude i hjørnet');
  const ring = ringFelt(spil, 1);
  assert.equal(Math.hypot(ring.kx - RAADHUS_FELT.kx, ring.ky - RAADHUS_FELT.ky), 1,
    'ringen ét felt ude begynder med de fire, zombierne skal igennem');
  assert.equal(paaBanen(ring.kx, ring.ky), true);
});

test('botten sparer op i stedet for at bruge løs på det billigste', () => {
  const spil = nytSpil(1);
  spil.rng = () => 0.999;
  spil.guld = 0;
  assert.equal(botTraek(spil), null, 'uden guld gør den ingenting');
  spil.guld = 10;
  assert.equal(botTraek(spil), null, 'og med for lidt venter den – den køber ikke bare noget andet');
  spil.guld = BYGNING_VED.mur.pris;
  assert.ok(botTraek(spil), 'med penge nok til ønsket bygger den');
});

test('balancen: gør man ingenting, falder basen hurtigt', () => {
  const spil = nytSpil(1);
  let vagt = 0;
  while (spil.fase !== 'slut' && vagt++ < 60 * 60 * 20) tik(spil, 1 / 60);
  assert.equal(spil.fase, 'slut');
  assert.ok(spil.klarede <= 3, `uden forsvar holder basen højst tre dage (den holdt ${spil.klarede})`);
});

test('balancen: en spiller, der bygger fornuftigt, kommer langt – men taber til sidst', () => {
  // Botten bygger mure ved huset, tårne, farme med bønder og en kaserne, og
  // opgraderer, når der er råd. Den er en målestok: bliver tallene her skæve,
  // er spillet enten blevet trivielt eller håbløst.
  const resultater = [1, 2, 3].map(nr => botSpiller(60, nr));
  for (const spil of resultater) {
    assert.equal(spil.fase, 'slut', 'også en dygtig spiller ender med at tabe');
    assert.ok(spil.klarede >= 8, `botten skal nå mindst otte dage (nåede ${spil.klarede})`);
    assert.ok(spil.klarede <= 40, `men ikke i det uendelige (nåede ${spil.klarede})`);
    assert.ok(spil.drab > 100, 'og der bliver nedlagt en masse zombier undervejs');
  }
  const bedst = Math.max(...resultater.map(s => s.klarede));
  assert.ok(bedst >= 12, `den bedste af tre runder skal nå mindst dag 12 (nåede ${bedst})`);
});

test('balancen: to tårne og ingenting andet rækker ikke langt', () => {
  const spil = nytSpil(1);
  byg(spil, 'taarn', RAADHUS_FELT.kx - 1, RAADHUS_FELT.ky);
  byg(spil, 'taarn', RAADHUS_FELT.kx + 1, RAADHUS_FELT.ky);
  let vagt = 0;
  while (spil.fase !== 'slut' && vagt++ < 60 * 60 * 30) tik(spil, 1 / 60);
  assert.ok(spil.klarede < 12, `den dovne spiller skal tabe før den dygtige (nåede ${spil.klarede})`);
});
