// Slangernes regler uden browser:  node --test test/unit/slanger.test.mjs
//
// Motoren (public/spil/slanger/slange.mjs) og sammen-reglerne (sammen.mjs)
// prøves her: køen med drejninger, maden i faste pladser, kollisionerne,
// perlerne fra døde slanger – og pakningen, når to venner deler en plade.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  N, FELTER, MAD, START_LAENGDE, VOKS_PR_MAD, DX, DY, modsat, drej,
  nyBane, saetSlange, tik, skridt, sving, styr, doed, madPos, alleMad,
  botRetning, kør, score,
} from '../../public/spil/slanger/slange.mjs';
import {
  TID, VEN, anden, pakKrop, udpakKrop, pak, anvend, nySammen, nulstilSammen,
  froe, resultat, slutTitel, tidTekst,
} from '../../public/spil/slanger/sammen.mjs';

/** En plade uden bots, hvor slangen ligger et kendt sted. */
function egenBane(hovedX, hovedY, dir, laengde = START_LAENGDE) {
  const s = nyBane({ seed: 5, bots: 0 });
  const p = s.spillere[0];
  p.krop = [];
  for (let k = 0; k < laengde; k++) {
    p.krop.push(hovedX - DX[dir] * k + (hovedY - DY[dir] * k) * N);
  }
  p.dir = dir; p.koe = []; p.voks = 0; p.bedste = laengde;
  return { s, p };
}

test('nyBane: fire slanger med hver sin plads og START_LAENGDE led', () => {
  const s = nyBane({ seed: 7 });
  assert.equal(s.spillere.length, 4);
  assert.deepEqual(s.spillere.map(p => p.id), [1, 2, 3, 4]);
  assert.equal(s.spillere[0].mig, true);
  const brugte = new Set();
  for (const p of s.spillere) {
    assert.equal(p.krop.length, START_LAENGDE, `${p.navn} starter med ${START_LAENGDE} led`);
    for (let k = 1; k < p.krop.length; k++) {
      const d = Math.abs(p.krop[k] - p.krop[k - 1]);
      assert.ok(d === 1 || d === N, 'kroppen ligger felt om felt');
    }
    for (const i of p.krop) {
      assert.ok(!brugte.has(i), 'to slanger deler ikke et felt');
      brugte.add(i);
    }
  }
});

test('nyBane er ens for det samme frø', () => {
  const a = nyBane({ seed: 42 }), b = nyBane({ seed: 42 });
  assert.deepEqual(a.spillere.map(p => p.krop), b.spillere.map(p => p.krop));
});

test('madPos: deterministisk og aldrig helt op ad kanten', () => {
  for (let j = 0; j < MAD; j++) {
    for (const n of [0, 1, 7]) {
      const a = madPos(9, j, n), b = madPos(9, j, n);
      assert.deepEqual(a, b);
      assert.ok(a.x >= 1 && a.x <= N - 2 && a.y >= 1 && a.y <= N - 2);
      assert.equal(a.felt, a.x + a.y * N);
    }
  }
  assert.notDeepEqual(madPos(9, 0, 0), madPos(9, 0, 1), 'pladsen flytter sig, når den er spist');
});

test('skridt: hovedet ét felt frem, og halen følger med i samme skridt', () => {
  const { s, p } = egenBane(10, 10, 0);
  const hale = p.krop[p.krop.length - 1];
  skridt(s, p);
  assert.equal(p.krop[0], 11 + 10 * N, 'hovedet flyttede sig');
  assert.equal(p.krop.length, START_LAENGDE, 'længden er den samme');
  assert.ok(!p.krop.includes(hale), 'det bageste felt er sluppet');
  assert.equal(p.levende, true);
});

test('mad: perlen gør slangen VOKS_PR_MAD led længere og flytter pladsen', () => {
  const s = nyBane({ seed: 5, bots: 0 });
  const p = s.spillere[0];
  const m = madPos(s.seed, 0, 0);
  // Læg slangen lige vest for perlen, på vej mod den. Pladen er ryddet for
  // resten, så intet andet blander sig.
  p.krop = [m.felt - 1, m.felt - 2, m.felt - 3, m.felt - 4];
  p.dir = 0; p.koe = []; p.voks = 0;
  const h = skridt(s, p);
  assert.ok(h.some(e => e.slags === 'mad' && e.id === 1 && e.slot === 0), 'der meldes «mad» for plads 0');
  assert.equal(s.spist[0], 1, 'pladsens tæller gik ét op');
  assert.equal(p.mad, 1);
  assert.equal(p.krop.length, START_LAENGDE + 1, 'første skridt vokser med det samme');
  skridt(s, p);
  assert.equal(p.krop.length, START_LAENGDE + VOKS_PR_MAD, 'og næste skridt vokser resten');
  skridt(s, p);
  assert.equal(p.krop.length, START_LAENGDE + VOKS_PR_MAD, 'så er væksten brugt op');
  assert.equal(p.bedste, START_LAENGDE + VOKS_PR_MAD, 'bedste længde følger med');
  assert.ok(!alleMad(s).some(x => x.felt === m.felt && x.slot === 0), 'perlen ligger et nyt sted');
});

test('sving: to hurtige tryk giver to sving lige efter hinanden', () => {
  const { s, p } = egenBane(10, 10, 0, 6);
  assert.equal(sving(p, 1), true);
  assert.equal(sving(p, 1), true);
  assert.deepEqual(p.koe, [1, 2], 'køen husker begge drejninger');
  skridt(s, p);
  assert.equal(p.dir, 1, 'første skridt drejer med uret');
  skridt(s, p);
  assert.equal(p.dir, 2, 'og næste skridt drejer igen – 180° på to felter');
  assert.equal(sving(p, 0), false, 'kun -1 og 1 er drejninger');
});

test('drej: højre-knappen er med uret, venstre mod uret', () => {
  // 0 = højre, 1 = ned, 2 = venstre, 3 = op
  assert.equal(drej(3, 1), 0, 'op + med uret = højre');
  assert.equal(drej(2, 1), 3, 'venstre + med uret = op');
  assert.equal(drej(3, 3), 2, 'op + mod uret = venstre');
  assert.equal(drej(0, 3), 3, 'højre + mod uret = op');
  assert.equal(modsat(0), 2);
});

test('styr: aldrig baglæns ind i sin egen hals', () => {
  const { p } = egenBane(10, 10, 0);
  assert.equal(styr(p, 2), false, 'baglæns afvises');
  assert.equal(styr(p, 0), false, 'samme vej er ikke et sving');
  assert.equal(styr(p, 3), true);
  assert.equal(styr(p, 3), false, 'samme vej som det sidste i køen afvises også');
  assert.deepEqual(p.koe, [3]);
});

test('mur: væggen er slut for mennesket', () => {
  const { s, p } = egenBane(N - 2, 10, 0);
  skridt(s, p);          // til x = N-1
  const h = skridt(s, p); // ud over kanten
  assert.equal(p.levende, false);
  assert.equal(s.slut, 'doed');
  assert.equal(s.grund, 'mur');
  assert.ok(h.some(e => e.slags === 'doed' && e.grund === 'mur'));
});

test('egen hale: en firkant på fire sving er død', () => {
  const { s, p } = egenBane(10, 10, 0, 6);
  sving(p, -1); sving(p, -1); sving(p, -1);
  skridt(s, p); skridt(s, p);
  assert.equal(p.levende, true, 'de to første sving er fri');
  skridt(s, p);
  assert.equal(p.levende, false);
  assert.equal(p.sidsteGrund, 'egen');
});

test('ramt: den, man kører ind i, får æren – og liget bliver til perler', () => {
  const s = nyBane({ seed: 5, bots: 1 });
  const [mig, bot] = s.spillere;
  // Botten ligger vandret; jeg kommer nordfra og kører lige ind i den.
  bot.krop = [20 + 20 * N, 19 + 20 * N, 18 + 20 * N, 17 + 20 * N];
  bot.dir = 0;
  mig.krop = [19 + 17 * N, 19 + 16 * N, 19 + 15 * N, 19 + 14 * N];
  mig.dir = 1; mig.koe = [];
  const foerEkstra = s.ekstra.length;
  skridt(s, mig); skridt(s, mig);
  assert.equal(mig.levende, true, 'lige indtil feltet med botten');
  const h = skridt(s, mig);
  assert.equal(mig.levende, false);
  assert.equal(mig.sidsteGrund, 'ramt');
  assert.equal(mig.sidsteAf, bot.id);
  assert.equal(bot.drab, 1, 'botten får æren');
  assert.ok(h.some(e => e.slags === 'doed' && e.id === 1 && e.af === bot.id));
  assert.equal(s.ekstra.length, foerEkstra + Math.ceil(4 / 2), 'hvert andet led blev en perle');
  assert.equal(s.slut, 'doed', 'runden er slut, når mennesket dør');
});

test('en død bot kommer igen efter RESPAWN sekunder', () => {
  const s = nyBane({ seed: 11 });
  // Mennesket lægges i dvale, så det ikke selv når at køre ind i væggen og
  // slutte runden, mens vi venter på botten.
  s.spillere[0].levende = false; s.spillere[0].krop = [];
  const bot = s.spillere[1];
  doed(s, bot, 'mur');
  assert.equal(bot.levende, false);
  const h = [];
  for (let i = 0; i < 60 * 3; i++) h.push(...tik(s, 1 / 60));
  assert.equal(bot.levende, true);
  assert.ok(h.some(e => e.slags === 'genfoedt' && e.id === bot.id));
});

test('bots: de finder maden og vokser', () => {
  const s = kør(3, 30);
  const spist = [...s.spist].reduce((a, b) => a + b, 0);
  assert.ok(spist >= 3, `der blev kun spist ${spist} perler på 30 sekunder`);
  assert.ok(s.spillere.some(p => p.bedste > START_LAENGDE), 'mindst én slange er vokset');
  assert.ok(s.t > 1, 'runden kom i gang');
});

test('botRetning kører aldrig frivilligt ind i noget', () => {
  const s = nyBane({ seed: 13 });
  const p = s.spillere[1];
  for (let i = 0; i < 200 && !s.slut; i++) {
    const d = botRetning(s, p);
    assert.ok(d >= 0 && d <= 3);
    tik(s, 1 / 30);
  }
  assert.ok(p.doede <= 1, `botten døde ${p.doede} gange på 200 kig`);
});

/* ---------- Sammen: to venner på den samme plade ---------- */

test('pakKrop/udpakKrop: kroppen kommer helskindet igennem', () => {
  const { p } = egenBane(10, 10, 0, 9);
  assert.deepEqual(udpakKrop(pakKrop(p.krop)), p.krop);
  assert.deepEqual(udpakKrop(pakKrop([517])), [517], 'en slange på ét led');
  assert.deepEqual(udpakKrop(''), [], 'tomt er tomt');
  assert.deepEqual(udpakKrop(null), []);
  assert.deepEqual(udpakKrop('!!!!'), [], 'snavs læses som ingenting');
});

test('vaert og gaest sætter slangerne spejlvendt, så pladen er den samme', () => {
  const seed = froe('K7QFD', 1);
  const vaert = nyBane({ seed, navn: 'Sofie', ven: 'Selma', vaert: true });
  const gaest = nyBane({ seed, navn: 'Selma', ven: 'Sofie', vaert: false });
  assert.deepEqual(vaert.spillere[0].krop, gaest.spillere[1].krop, 'værtens slange står samme sted hos begge');
  assert.deepEqual(vaert.spillere[1].krop, gaest.spillere[0].krop, 'og gæstens gør også');
  assert.equal(vaert.sammen, true);
  assert.equal(vaert.spillere[1].fjern, true, 'vennens slange flyttes ikke af motoren');
});

test('anvend: vennens slange og mad-tællere lander på min plade', () => {
  const seed = froe('K7QFD', 1);
  const mineSide = nyBane({ seed, navn: 'Sofie', ven: 'Selma', vaert: true });
  const hansSide = nyBane({ seed, navn: 'Selma', ven: 'Sofie', vaert: false });
  const sam = nySammen('K7QFD', 'vaert');
  const hansSam = nySammen('K7QFD', 'gaest');

  // Selma spiser perlen på plads 3 på sin egen telefon
  const selma = hansSide.spillere[0];
  const m = madPos(seed, 3, 0);
  selma.krop = [m.felt - 1, m.felt - 2, m.felt - 3, m.felt - 4];
  selma.dir = 0;
  skridt(hansSide, selma);
  hansSam.mineSpist[3]++;                       // det gør index.html på «mad»-hændelsen

  const halv = pak(hansSide, selma, hansSam, { runde: 1, tid: 2, faerdig: 0 });
  const h = anvend(mineSide, sam, halv);
  const ven = mineSide.spillere[1];
  assert.deepEqual(ven.krop, selma.krop, 'vennens krop står, hvor hans telefon så den');
  assert.equal(ven.dir, selma.dir);
  assert.equal(mineSide.spist[3], 1, 'pladsens stilling er summen af de to tællere');
  assert.equal(sam.venSpist[3], 1);
  assert.deepEqual(h, [], 'ingen døde – ingen hændelser');
  assert.ok(!alleMad(mineSide).some(x => x.slot === 3 && x.felt === m.felt),
    'perlen er også flyttet på min telefon');
});

test('anvend: æren for et drab står i dødstallet', () => {
  const seed = froe('K7QFD', 1);
  const bane = nyBane({ seed, navn: 'Sofie', ven: 'Selma', vaert: true });
  const sam = nySammen('K7QFD', 'vaert');
  const mig = bane.spillere[0];
  // Vennen siger: jeg er død én gang, og det var nummer 2 – altså dig.
  const h = anvend(bane, sam, { krop: pakKrop([100, 99]), d: 0, liv: 0, laengde: 2, bedste: 9, doede: 1, af: VEN, spist: [] });
  assert.equal(mig.drab, 1, 'jeg får æren');
  assert.ok(h.some(e => e.slags === 'venUde' && e.af === mig.id));
  assert.equal(sam.venDoede, 1);
  assert.equal(sam.venBedste, 9);
  const h2 = anvend(bane, sam, { krop: '', d: 0, liv: 0, laengde: 0, bedste: 9, doede: 1, af: VEN, spist: [] });
  assert.equal(mig.drab, 1, 'det samme dødstal tæller ikke to gange');
  assert.deepEqual(h2, []);
});

test('anvend: kollision med vennens krop dømmes hos mig selv', () => {
  const seed = froe('K7QFD', 1);
  const bane = nyBane({ seed, navn: 'Sofie', ven: 'Selma', vaert: true });
  const sam = nySammen('K7QFD', 'vaert');
  const mig = bane.spillere[0];
  mig.krop = [10 + 10 * N, 9 + 10 * N, 8 + 10 * N, 7 + 10 * N];
  mig.dir = 0; mig.koe = [];
  anvend(bane, sam, { krop: pakKrop([12 + 9 * N, 12 + 10 * N, 12 + 11 * N]), d: 3, liv: 1, laengde: 3, bedste: 4, doede: 0, af: 0, spist: [] });
  skridt(bane, mig);                 // 11,10 – fri
  const h = skridt(bane, mig);       // 12,10 – vennens krop
  assert.equal(mig.levende, false);
  assert.equal(mig.sidsteGrund, 'ramt');
  assert.equal(mig.sidsteAf, VEN, 'af: 2 fortæller vennen, at æren er hans');
  assert.ok(h.some(e => e.slags === 'doed' && e.id === 1));
  assert.equal(bane.slut, null, 'i sammen er runden ikke slut af den grund');
  assert.equal(bane.ekstra.length, 0, 'ingen perler fra døde, når man spiller sammen');
  // … og man kommer igen af sig selv
  for (let i = 0; i < 60 * 3; i++) tik(bane, 1 / 60);
  assert.equal(mig.levende, true, 'mennesket kommer igen i sammen');
});

test('nulstilSammen glemmer den gamle snak', () => {
  const sam = nySammen('K7QFD', 'vaert');
  sam.mineSpist[2] = 5; sam.venDoede = 3; sam.venSlut = true; sam.minSlut = true; sam.venBedste = 12;
  nulstilSammen(sam, 2);
  assert.equal(sam.runde, 2);
  assert.equal(sam.mineSpist[2], 0);
  assert.equal(sam.venDoede, 0);
  assert.equal(sam.venBedste, 0);
  assert.equal(sam.venSlut, false);
  assert.equal(sam.minSlut, false);
});

test('froe, resultat og småtingene', () => {
  assert.equal(froe('K7QFD', 1), froe('K7QFD', 1));
  assert.notEqual(froe('K7QFD', 1), froe('K7QFD', 2), 'en ny runde er en ny plade');
  assert.notEqual(froe('K7QFD', 1), froe('AAAAA', 1));
  assert.equal(anden('vaert'), 'gaest');
  assert.equal(anden('gaest'), 'vaert');
  assert.equal(resultat(10, 7), 'vundet');
  assert.equal(resultat(7, 10), 'tabt');
  assert.equal(resultat(7, 7), 'lige');
  assert.equal(slutTitel('vundet'), 'Du vandt!');
  assert.equal(slutTitel('tabt', 'Selma'), 'Selma vandt!');
  assert.equal(slutTitel('lige'), 'Helt lige!');
  assert.equal(tidTekst(119), '1:59');
  assert.equal(tidTekst(0), '0:00');
  assert.ok(TID >= 60 && TID <= 300);
  assert.equal(typeof score(nyBane({ seed: 1 }).spillere[0]), 'number');
  assert.ok(FELTER === N * N);
});
