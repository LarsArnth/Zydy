// Tårnforsvars motor: stien, tårnene, monstrene og bølgerne.
//
// Kør:  node --test test/unit/taarnforsvar.test.mjs
//
// Det, der er værd at holde øje med, er balancen: spillet skal kunne klares de
// første bølger med et par tårne, men altid ende med at man taber — ellers er
// «hvor langt kom du» ikke noget at konkurrere om. De tre sidste prøver måler
// netop det ved at lade en doven og en dygtig spiller spille hele vejen.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FELT, KOLONNER, RAEKKER, RUTE, PORT, STI_LAENGDE, STI_FELTER, paaSti, punktPaaSti, midte,
  TAARNE, TAARN_VED, MAKS_NIVEAU, MONSTRE, START_GULD, START_LIV, BONUS_PR_SEK,
  nytSpil, byg, opgrader, saelg, salgspris, taarnPaa, startBoelge, tik, vaelgMaal,
  boelgePlan, boelgeVarsel, hpFaktor, byggeFelter, bedsteFelt, botTraek, botSpiller,
} from '../../public/spil/taarnforsvar/forsvar.mjs';

/** Spiller videre, til bølgen er ovre (eller man taber). */
function spolBoelge(spil, maksSek = 200) {
  const stop = spil.tid + maksSek;
  while (spil.fase === 'boelge' && spil.tid < stop) tik(spil, 1 / 60);
  return spil;
}

/*
  Monstrene har ingen x/y af sig selv — motoren regner dem ud fra `d`, hvor
  langt de er nået ad stien. Vil man stille en prøve op med et monster foran et
  tårn, skal man derfor vælge et sted på stien og bygge tårnet ved siden af det.
  (Sætter man i stedet monsteret hen til tårnet, flytter første skridt det
  tilbage på stien igen — og så rammer tårnet ingenting.)
*/
function taarnVedSti(spil, slags, d) {
  const p = punktPaaSti(d);
  let bedst = null, naermest = Infinity;
  for (const f of byggeFelter()) {
    if (taarnPaa(spil, f.kx, f.ky)) continue;
    const q = midte(f.kx, f.ky), afstand = Math.hypot(q.x - p.x, q.y - p.y);
    if (afstand < naermest) { naermest = afstand; bedst = f; }
  }
  return byg(spil, slags, bedst.kx, bedst.ky).taarn;
}

/** Et monster, der står `d` inde ad stien. `fart: 0` lader det stå stille. */
function monster(id, slags, d, hp, fart) {
  const m = MONSTRE[slags], p = punktPaaSti(d);
  return {
    id, slags, d, x: p.x, y: p.y, hp, maksHp: hp,
    fart: fart == null ? m.fart : fart, panser: m.panser, guld: m.guld,
    liv: m.liv, r: m.r, langsom: null, blink: 0, vinge: 0,
  };
}

test('stien hænger sammen, og porten ligger for enden', () => {
  assert.ok(STI_LAENGDE > 200, 'stien skal være lang nok til, at tårnene når at skyde');
  for (let i = 0; i < RUTE.length - 1; i++) {
    const [x0, y0] = RUTE[i], [x1, y1] = RUTE[i + 1];
    assert.ok(x0 === x1 || y0 === y1, 'stien går kun lige ud og ned – ingen skrå led');
  }
  const slut = punktPaaSti(STI_LAENGDE), port = midte(PORT[0], PORT[1]);
  assert.equal(Math.round(slut.x), Math.round(port.x), 'stien ender ved porten');
  assert.equal(Math.round(slut.y), Math.round(port.y));
  assert.ok(paaSti(RUTE[1][0], RUTE[1][1]), 'hjørnerne er en del af stien');
  assert.equal(paaSti(0, 0), false, 'og hjørnet af banen er ikke');
  // Stien begynder uden for banen (monstrene går ind), så ét stifelt tælles ikke med
  const stiPaaBanen = [...STI_FELTER].filter(n => Number(n.split(',')[1]) >= 0).length;
  assert.equal(byggeFelter().length, KOLONNER * RAEKKER - stiPaaBanen, 'alt der ikke er sti kan bebygges');
  assert.ok(byggeFelter().length > 90, 'der skal være rigeligt at bygge på');
});

test('man bygger for guld – og ikke hvor som helst', () => {
  const s = nytSpil();
  assert.equal(s.guld, START_GULD);
  assert.equal(byg(s, 'bue', RUTE[1][0], RUTE[1][1]).fejl, 'Ikke på stien');
  assert.equal(byg(s, 'bue', -1, 4).fejl, 'Uden for banen');
  assert.equal(byg(s, 'bue', KOLONNER, 4).fejl, 'Uden for banen');
  assert.equal(s.guld, START_GULD, 'et afvist tårn koster ingenting');

  const svar = byg(s, 'bue', 0, 0);
  assert.equal(svar.ok, true);
  assert.equal(s.guld, START_GULD - TAARN_VED.bue.pris, 'tårnet betales med det samme');
  assert.equal(taarnPaa(s, 0, 0), svar.taarn);
  assert.equal(byg(s, 'bue', 0, 0).fejl, 'Der står allerede et tårn');

  s.guld = 10;
  assert.equal(byg(s, 'trold', 3, 0).fejl, 'Ikke guld nok');
});

test('opgradering koster, og et salg giver det meste tilbage', () => {
  const s = nytSpil();
  const t = byg(s, 'bue', 0, 0).taarn;
  const pris = TAARN_VED.bue.niveauer[0].opgradering;
  s.guld = pris - 1;
  assert.equal(opgrader(s, t).fejl, 'Ikke guld nok');
  s.guld = 1000;
  assert.equal(opgrader(s, t).ok, true);
  assert.equal(t.niveau, 2);
  assert.ok(TAARN_VED.bue.niveauer[1].skade > TAARN_VED.bue.niveauer[0].skade, 'niveau 2 gør mere ondt');
  opgrader(s, t);
  assert.equal(t.niveau, MAKS_NIVEAU);
  assert.equal(opgrader(s, t).fejl, 'Tårnet er færdigbygget');

  const foer = s.guld, retur = salgspris(t);
  assert.ok(retur > 0 && retur < t.investeret, 'man får noget – men ikke det hele – retur');
  assert.equal(saelg(s, t).ok, true);
  assert.equal(s.guld, foer + retur);
  assert.equal(taarnPaa(s, 0, 0), null, 'feltet er frit igen');
  assert.equal(saelg(s, t).ok, false, 'man kan ikke sælge det samme tårn to gange');
});

test('bølgerne vokser, og de særlige monstre kommer på de rigtige tidspunkter', () => {
  const slags = nr => boelgePlan(nr).map(g => g.slags);
  assert.deepEqual(slags(1), ['slim'], 'bølge 1 er kun slim – man skal kunne nå at lære spillet');
  assert.ok(slags(3).includes('flagermus'), 'flagermusene kommer i bølge 3');
  assert.ok(!slags(4).includes('konge'), 'ingen konge i bølge 4');
  assert.ok(slags(5).includes('trold') && slags(5).includes('konge'), 'bølge 5 har både trolde og en konge');
  assert.ok(slags(10).includes('konge'), 'kongen kommer hver femte bølge');
  assert.match(boelgeVarsel(5), /konge/i, 'og bliver varslet på skærmen');
  assert.equal(boelgeVarsel(4), null, 'en helt almindelig bølge har intet varsel');

  const antal = nr => boelgePlan(nr).reduce((s, g) => s + g.antal, 0);
  assert.ok(antal(10) > antal(3), 'der kommer flere monstre, jo længere man når');
  assert.ok(hpFaktor(10) > hpFaktor(5) && hpFaktor(1) === 1, 'og de bliver sejere');
});

test('tårnet skyder det monster, der er nået længst', () => {
  const s = nytSpil();
  const t = byg(s, 'bue', 3, 4).taarn;
  s.monstre = [
    { id: 1, slags: 'slim', d: 10, x: t.x, y: t.y, hp: 10, maksHp: 10, r: 3, panser: 0 },
    { id: 2, slags: 'slim', d: 80, x: t.x + 5, y: t.y, hp: 10, maksHp: 10, r: 3, panser: 0 },
    { id: 3, slags: 'slim', d: 200, x: t.x + 500, y: t.y, hp: 10, maksHp: 10, r: 3, panser: 0 },
  ];
  assert.equal(vaelgMaal(s, t).id, 2, 'den længst fremme inden for rækkevidde – ikke den længst fremme i det hele taget');
});

test('isbøssen fryser, og den springer den frosne over', () => {
  const s = nytSpil();
  s.guld = 1000;
  const t = taarnVedSti(s, 'is', 50);
  s.fase = 'boelge';
  s.monstre = [monster(1, 'slim', 55, 400), monster(2, 'slim', 45, 400)];
  tik(s, 1.6);
  const frossen = s.monstre.find(m => m.id === 1), fri = s.monstre.find(m => m.id === 2);
  assert.ok(frossen.langsom, 'den forreste bliver frosset');
  assert.ok(frossen.d - 55 < fri.d - 45, 'og når kortere på den samme tid end den, der ikke er frosset');
  assert.equal(vaelgMaal(s, t).id, 2, 'næste skud går til den, der ikke er frosset i forvejen');
});

test('panser går hårdest ud over de små skud – derfor er troldmanden svaret på trolde', () => {
  // Hvor stor en del af skaden slipper igennem panseret? Mange små skud taber
  // meget mere end ét stort, og det er dét, der gør, at man ikke kan nøjes med
  // bueskytter, når troldene kommer.
  const skadePaa = (slags, monsterSlags) => {
    const s = nytSpil();
    s.guld = 1000;
    taarnVedSti(s, slags, 50);
    s.fase = 'boelge';
    s.monstre = [monster(1, monsterSlags, 50, 4000, 0)];      // står stille og kan ikke nå at dø
    tik(s, 8);
    return 4000 - s.monstre[0].hp;
  };
  const bueAndel = skadePaa('bue', 'trold') / skadePaa('bue', 'slim');
  const troldAndel = skadePaa('trold', 'trold') / skadePaa('trold', 'slim');
  assert.ok(bueAndel < 0.85, `bueskyttens skud bliver ædt af panseret (${(bueAndel * 100).toFixed(0)} %)`);
  assert.ok(troldAndel > bueAndel + 0.1,
    `troldmandens lyn mærker knap nok panseret (${(troldAndel * 100).toFixed(0)} % mod ${(bueAndel * 100).toFixed(0)} %)`);
});

test('kanonens bombe rammer alle, der står tæt sammen', () => {
  const s = nytSpil();
  s.guld = 1000;
  taarnVedSti(s, 'kanon', 50);
  s.fase = 'boelge';
  s.monstre = [monster(1, 'slim', 50, 900, 0), monster(2, 'slim', 46, 900, 0), monster(3, 'slim', 12, 900, 0)];
  tik(s, 3);
  const hp = id => s.monstre.find(m => m.id === id).hp;
  assert.ok(hp(1) < 900 && hp(2) < 900, 'begge de to, der stod tæt, fik af bomben');
  assert.equal(hp(3), 900, 'men ikke den, der stod langt væk');
});

test('monstre, der når porten, koster hjerter – og til sidst er det slut', () => {
  const s = nytSpil();
  assert.equal(s.liv, START_LIV);
  startBoelge(s);
  assert.equal(s.fase, 'boelge');
  assert.equal(s.boelge, 1);
  spolBoelge(s);                                   // ingen tårne: alt går igennem
  assert.ok(s.liv < START_LIV, 'uden tårne mister man hjerter');

  s.liv = 1;
  s.fase = 'pause'; s.pauseTid = 0.1;
  tik(s, 0.2);
  spolBoelge(s);
  assert.equal(s.fase, 'slut', 'da hjerterne var væk, sluttede spillet');
  assert.equal(s.liv, 0);
  assert.ok(s.slut && s.slut.klarede === s.klarede, 'og resultatet står i slut');
});

test('en klaret bølge giver guld og en pause – «send nu» betaler for ventetiden', () => {
  const s = nytSpil();
  s.guld = 2000;
  // Tre opgraderede troldmænd tager den første bølge uden problemer
  for (const [kx, ky] of [[3, 1], [3, 5], [3, 8]]) {
    const t = byg(s, 'trold', kx, ky).taarn;
    opgrader(s, t); opgrader(s, t);
  }
  const foerGuld = s.guld;
  startBoelge(s);
  spolBoelge(s);
  assert.equal(s.fase, 'pause', 'bølgen er ovre');
  assert.equal(s.klarede, 1);
  assert.equal(s.liv, START_LIV, 'og intet slap forbi');
  assert.ok(s.guld > foerGuld, 'man tjener guld på monstrene og en bonus for bølgen');

  const guldFoer = s.guld, rest = s.pauseTid;
  assert.ok(rest > 1, 'der er en pause til at bygge i');
  assert.equal(startBoelge(s, true), true);
  assert.equal(s.guld, guldFoer + Math.ceil(rest) * BONUS_PR_SEK, 'man får betaling for de sekunder, man sprang over');
  assert.equal(s.boelge, 2);
  assert.equal(startBoelge(s, true), false, 'man kan ikke sende to bølger oven i hinanden');
});

test('botten bygger på de felter, der dækker mest af stien', () => {
  const s = nytSpil();
  const f = bedsteFelt(s, TAARN_VED.bue.niveauer[0].raekkevidde);
  assert.ok(f && !paaSti(f.kx, f.ky), 'feltet er ledigt og ikke på stien');
  const t = botTraek(s);
  assert.equal(t.hvad, 'byg');
  assert.equal(s.taarne.length, 1);
  // Det valgte felt skal ligge klods op ad stien – ellers rammer tårnet ingenting
  const p = midte(t.kx, t.ky);
  let naermest = Infinity;
  for (let d = 0; d <= STI_LAENGDE; d += 1) {
    const q = punktPaaSti(d);
    naermest = Math.min(naermest, Math.hypot(q.x - p.x, q.y - p.y));
  }
  assert.ok(naermest <= FELT, `botten byggede ${naermest.toFixed(1)} enheder fra stien`);
});

test('de første bølger kan klares med to tårne – men så skal der bygges mere', () => {
  const s = nytSpil();
  botTraek(s); botTraek(s);                        // to bueskytter for startguldet
  assert.equal(s.taarne.length, 2);
  for (let i = 0; i < 2; i++) { startBoelge(s, true); spolBoelge(s); }
  assert.equal(s.klarede, 2, 'de to første bølger er til at komme igennem');
  assert.equal(s.liv, START_LIV, 'uden at miste et eneste hjerte');
  assert.ok(s.guld >= TAARNE[0].pris, 'og man har tjent til flere tårne undervejs');

  // Bølge 3 er den, hvor flagermusene kommer, og hvor to bueskytter ikke rækker
  startBoelge(s, true); spolBoelge(s);
  assert.ok(s.liv < START_LIV, 'fra bølge 3 slipper der noget forbi, hvis man ikke bygger mere');
});

test('spillet slutter altid – også for den, der spiller perfekt', () => {
  // Botten bygger og opgraderer alt, hvad den har råd til, og sender hver bølge
  // med det samme. Den skal komme langt, men monstrene vokser hurtigere end
  // guldet, så den taber til sidst.
  const dygtig = botSpiller(45);
  assert.equal(dygtig.fase, 'slut', 'selv en perfekt spiller løber tør for forsvar til sidst');
  assert.ok(dygtig.klarede >= 15, `en dygtig spiller skal kunne nå langt (nåede ${dygtig.klarede})`);
  assert.ok(dygtig.klarede <= 45, 'men ikke i det uendelige');
  assert.ok(dygtig.drab > 200, 'der er nedlagt masser af monstre undervejs');
});

test('en doven spiller kommer ikke lige så langt som en flittig', () => {
  // Tre bueskytter, ingen opgraderinger, og pausen ventes ud hver gang.
  const s = nytSpil();
  let vagt = 0;
  while (s.fase !== 'slut' && vagt < 60 * 60 * 30) {
    if (s.taarne.length < 3 && s.guld >= TAARN_VED.bue.pris) {
      const f = bedsteFelt(s, TAARN_VED.bue.niveauer[0].raekkevidde);
      byg(s, 'bue', f.kx, f.ky);
    }
    tik(s, 1 / 60);
    vagt++;
  }
  assert.ok(s.klarede >= 3, `man skal nå et par bølger, før det går galt (nåede ${s.klarede})`);
  assert.ok(s.klarede < 12, `men uden opgraderinger skal det ikke række langt (nåede ${s.klarede})`);
});
