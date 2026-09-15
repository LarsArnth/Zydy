// Klaverregn – sangene, fliserne og reglerne. Ingen browser:
//   node --test test/unit/klaverregn.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BANER, HØJDE, FLISE_H, LIV, AFSTAND_MIN, START_FART, MAKS_FART, FART_PR_NODE,
  SANGE, baneFor, frekvens, nytSpil, fart, tik, tryk, naesteFlise, sangIGang, bot, koer,
  erSort, tonenavn, klaviatur, sangOmfang, nyEgenSang, egenNaeste, egetTryk,
} from '../../public/spil/klaverregn/noder.mjs';

/* ---------- Sangene ---------- */

test('sangene er hele og til at spille', () => {
  assert.ok(SANGE.length >= 4, 'der skal være noget at spille');
  const navne = new Set();
  for (const sang of SANGE) {
    assert.ok(sang.navn.length > 2);
    assert.ok(!navne.has(sang.navn), `${sang.navn} står to gange`);
    navne.add(sang.navn);
    assert.ok(sang.noder.length >= 20, `${sang.navn} er for kort til at kunne kendes`);
    for (const [midi, varighed] of sang.noder) {
      assert.ok(Number.isInteger(midi) && midi >= 48 && midi <= 84, `${sang.navn}: ${midi} er ikke en node på et klaver, børn kan høre`);
      assert.ok(varighed >= 0.25 && varighed <= 4, `${sang.navn}: varighed ${varighed}`);
    }
    const toner = new Set(sang.noder.map(n => n[0]));
    assert.ok(toner.size >= 4, `${sang.navn} bruger for få toner til at være en melodi`);
  }
});

test('Mester Jakob er den første sang og begynder med do-re-mi-do', () => {
  assert.equal(SANGE[0].navn, 'Mester Jakob');
  assert.deepEqual(SANGE[0].noder.slice(0, 4).map(n => n[0]), [60, 62, 64, 60]);
});

/* ---------- Banen følger tonehøjden ---------- */

test('alle noder får en bane mellem 0 og 3', () => {
  for (let s = 0; s < SANGE.length; s++) {
    for (let i = 0; i < SANGE[s].noder.length; i++) {
      const b = baneFor(s, i);
      assert.ok(b >= 0 && b < BANER, `sang ${s}, node ${i}: bane ${b}`);
    }
  }
});

test('dybe noder ligger til venstre for lyse – og samme tone i samme bane', () => {
  for (let s = 0; s < SANGE.length; s++) {
    const baner = SANGE[s].noder.map((n, i) => [n[0], baneFor(s, i)]);
    for (const [midiA, baneA] of baner) {
      for (const [midiB, baneB] of baner) {
        if (midiA < midiB) assert.ok(baneA <= baneB, `sang ${s}: ${midiA}→${baneA} men ${midiB}→${baneB}`);
        if (midiA === midiB) assert.equal(baneA, baneB);
      }
    }
    // Yderpunkterne skal bruge yderbanerne, ellers ser melodien flad ud.
    const brugte = new Set(baner.map(b => b[1]));
    assert.ok(brugte.has(0), `sang ${s} bruger aldrig venstre bane`);
    assert.ok(brugte.has(BANER - 1), `sang ${s} bruger aldrig højre bane`);
  }
});

test('frekvens: kammertonen er 440 Hz og midterste C ca. 261,6', () => {
  assert.equal(frekvens(69), 440);
  assert.ok(Math.abs(frekvens(60) - 261.63) < 0.01);
  assert.ok(Math.abs(frekvens(81) - 880) < 1e-9, 'en oktav op er det dobbelte');
});

/* ---------- Et frisk spil ---------- */

test('et frisk spil har tre hjerter og ingen fliser, og fliserne kommer af sig selv', () => {
  const spil = nytSpil();
  assert.equal(spil.liv, LIV);
  assert.equal(spil.score, 0);
  assert.equal(spil.fliser.length, 0);
  assert.equal(fart(spil), START_FART);
  tik(spil, 1 / 120);
  assert.ok(spil.fliser.length >= 2, 'skærmen fyldes med fliser');
  assert.equal(spil.fliser[0].sangNr, 0);
  assert.equal(spil.fliser[0].nodeNr, 0);
  assert.equal(sangIGang(spil).navn, 'Mester Jakob');
});

test('fliserne falder med farten og ligger i rækkefølge med rytmen imellem', () => {
  const spil = nytSpil();
  tik(spil, 1 / 120);
  const før = spil.fliser.map(f => f.y);
  tik(spil, 0.5);
  for (let i = 0; i < før.length; i++) {
    assert.ok(Math.abs(spil.fliser[i].y - (før[i] + fart(spil) * 0.5)) < 1e-9, 'flisen faldt ikke med farten');
  }
  for (let i = 1; i < spil.fliser.length; i++) {
    assert.ok(spil.fliser[i - 1].y - spil.fliser[i].y >= AFSTAND_MIN - 1e-9, 'to fliser klistrer sammen');
  }
});

/* ---------- Tryk ---------- */

test('rammer man den nederste flises bane, lyder noden og scoren stiger', () => {
  const spil = nytSpil();
  tik(spil, 1 / 120);
  const f = naesteFlise(spil);
  const h = tryk(spil, f.bane);
  assert.equal(h.ramt.midi, 60, 'Mester Jakob begynder på C');
  assert.equal(h.forkert, false);
  assert.equal(spil.score, 1);
  assert.equal(spil.liv, LIV, 'et rigtigt tryk koster ikke noget');
  assert.notEqual(naesteFlise(spil), f, 'flisen er væk');
});

test('den rigtige spiller spiller melodien: tryk efter tryk kommer noderne i sangens rækkefølge', () => {
  const spil = nytSpil();
  tik(spil, 1 / 120);
  const hørt = [];
  for (let i = 0; i < 8; i++) {
    tik(spil, 1 / 120);
    hørt.push(tryk(spil, naesteFlise(spil).bane).ramt.midi);
  }
  assert.deepEqual(hørt, SANGE[0].noder.slice(0, 8).map(n => n[0]));
});

test('et tryk i en forkert bane koster et hjerte, og flisen bliver stående', () => {
  const spil = nytSpil();
  tik(spil, 1 / 120);
  const f = naesteFlise(spil);
  const forkertBane = (f.bane + 1) % BANER;
  const h = tryk(spil, forkertBane);
  assert.equal(h.forkert, true);
  assert.equal(h.ramt, null);
  assert.equal(spil.liv, LIV - 1);
  assert.equal(naesteFlise(spil), f, 'melodien hopper ikke et hak ved en fejl');
  assert.equal(spil.score, 0);
});

test('tre forkerte tryk, og spillet er slut', () => {
  const spil = nytSpil();
  tik(spil, 1 / 120);
  for (let i = 0; i < LIV; i++) {
    const gal = (naesteFlise(spil).bane + 1) % BANER;
    tryk(spil, gal);
  }
  assert.equal(spil.liv, 0);
  assert.equal(spil.faerdig, true);
  assert.deepEqual(tryk(spil, 0), { ramt: null, forkert: false, sangSlut: null, faerdig: false }, 'efter slut sker der ikke mere');
});

/* ---------- Forbi bunden ---------- */

test('en flise forbi bunden koster et hjerte og springes over', () => {
  const spil = nytSpil();
  tik(spil, 1 / 120);
  const første = naesteFlise(spil);
  // Lad den falde helt forbi uden at røre skærmen.
  const h = tik(spil, (HØJDE + FLISE_H + 2) / fart(spil));
  assert.ok(h.mistede.length >= 1);
  assert.equal(h.mistede[0].nodeNr, første.nodeNr);
  assert.ok(spil.liv < LIV);
  assert.ok(naesteFlise(spil).nodeNr !== første.nodeNr, 'sangen er kommet videre');
});

test('rører man aldrig skærmen, er spillet slut efter tre mistede fliser', () => {
  const spil = koer(nytSpil(), 120, () => null);
  assert.equal(spil.faerdig, true);
  assert.equal(spil.liv, 0);
  assert.equal(spil.score, 0);
  assert.ok(spil.t < 60, 'og det må ikke tage evigheder');
});

/* ---------- Farten ---------- */

test('farten stiger med hver ramt node og rammer et loft', () => {
  const spil = nytSpil();
  assert.equal(fart(spil), START_FART);
  spil.score = 50;
  assert.ok(Math.abs(fart(spil) - (START_FART + 50 * FART_PR_NODE)) < 1e-9);
  spil.score = 100000;
  assert.equal(fart(spil), MAKS_FART);
});

/* ---------- En hel omgang ---------- */

test('botten spiller fejlfrit: hele sange kommer igennem, og farten vokser', () => {
  const spil = koer(nytSpil(), 180);
  assert.equal(spil.faerdig, false, 'en fejlfri spiller dør ikke');
  assert.equal(spil.liv, LIV);
  assert.ok(spil.score > 100, `kun ${spil.score} noder på tre minutter`);
  assert.ok(spil.sange >= 1, 'mindst én sang skal være spillet færdig');
  assert.ok(fart(spil) > START_FART + 20, 'farten skal kunne mærkes');
});

test('når en sang er færdig, siger motoren til – og den næste går i gang', () => {
  const spil = nytSpil();
  let slut = null;
  const langt = SANGE[0].noder.length * 4;   // rigeligt til hele Mester Jakob
  for (let i = 0; i < 120 * langt && !slut; i++) {
    const h = tik(spil, 1 / 120);
    if (h.sangSlut) slut = h.sangSlut;
    const bane = bot(spil);
    if (bane != null) {
      const t = tryk(spil, bane);
      if (t.sangSlut) slut = t.sangSlut;
    }
  }
  assert.equal(slut, 'Mester Jakob');
  assert.equal(spil.sange, 1);
  assert.equal(sangIGang(spil).navn, SANGE[1].navn, 'den næste sang er i gang');
});

test('sangene går rundt: efter den sidste kommer den første igen', () => {
  const spil = nytSpil();
  spil.sangNr = SANGE.length - 1;
  spil.nodeNr = SANGE[SANGE.length - 1].noder.length - 1;
  tik(spil, 1 / 120);
  assert.ok(spil.fliser.some(f => f.sangNr >= SANGE.length || f.sangNr === SANGE.length - 1));
  const efter = spil.fliser.find(f => f.sangNr === SANGE.length);
  assert.ok(efter, 'der spawnes fliser fra runde to');
  assert.equal(efter.nodeNr, 0, '… og de begynder forfra på den første sang');
});

/* ---------- Dit eget klaver (Livas ønske «På ens egen klaver») ---------- */

test('tangenterne ligger som på et rigtigt klaver – og hedder det, de hedder på dansk', () => {
  assert.equal(erSort(60), false, 'C er hvid');
  assert.equal(erSort(61), true, 'cis er sort');
  assert.equal(erSort(64), false);
  assert.equal(erSort(65), false, 'mellem e og f er der ingen sort');
  assert.equal(tonenavn(60), 'C');
  assert.equal(tonenavn(69), 'A');
  assert.equal(tonenavn(71), 'H', 'på dansk hedder tonen H, ikke B');
  assert.equal(tonenavn(70), 'B', '… og B er den sorte under H');
});

test('klaviaturet er ubrudt og begynder og slutter altid på en hvid tangent', () => {
  const taster = klaviatur(61, 70);   // sorte yderpunkter trækkes ud til hvide
  assert.equal(taster[0].midi, 60);
  assert.equal(taster[taster.length - 1].midi, 71);
  assert.equal(taster[0].sort, false);
  assert.equal(taster[taster.length - 1].sort, false);
  for (let i = 1; i < taster.length; i++) assert.equal(taster[i].midi, taster[i - 1].midi + 1, 'et hul i klaviaturet');
  const oktav = klaviatur(60, 72);
  assert.equal(oktav.filter(t => !t.sort).length, 8, 'en oktav C-C har otte hvide');
  assert.equal(oktav.filter(t => t.sort).length, 5, '… og fem sorte');
});

test('hver sang får et klaver, der dækker den, er mindst en oktav og ender på hvide', () => {
  for (let s = 0; s < SANGE.length; s++) {
    const { lav, høj } = sangOmfang(s);
    assert.equal(erSort(lav), false, `sang ${s}: dybeste tangent er sort`);
    assert.equal(erSort(høj), false, `sang ${s}: lyseste tangent er sort`);
    assert.ok(høj - lav >= 12, `sang ${s}: klaveret er under en oktav`);
    for (const [midi] of SANGE[s].noder) assert.ok(midi >= lav && midi <= høj, `sang ${s}: node ${midi} er uden for klaveret`);
  }
});

test('på ens eget klaver flytter kun den rigtige tangent sangen – en forkert koster ingenting', () => {
  const s = nyEgenSang(0);
  assert.equal(egenNaeste(s), 60, 'Mester Jakob begynder på C');
  const gal = egetTryk(s, 64);
  assert.equal(gal.rigtig, false);
  assert.equal(s.nodeNr, 0, 'en forkert tangent flytter ikke sangen');
  const god = egetTryk(s, 60);
  assert.equal(god.rigtig, true);
  assert.equal(egenNaeste(s), 62, 'og så er det re');
});

test('en hel sang på ens eget klaver: hver node i rækkefølge og FLOT til sidst', () => {
  const s = nyEgenSang(0);
  let slut = null;
  while (!s.faerdig) {
    const h = egetTryk(s, egenNaeste(s));
    assert.equal(h.rigtig, true);
    if (h.sangSlut) slut = h.sangSlut;
  }
  assert.equal(slut, 'Mester Jakob');
  assert.equal(s.rigtige, SANGE[0].noder.length);
  assert.equal(egenNaeste(s), null);
  assert.deepEqual(egetTryk(s, 60), { rigtig: false, faerdig: false, sangSlut: null }, 'efter FLOT sker der ikke mere');
});

test('et langt spil bliver ikke til ingenting', () => {
  const spil = koer(nytSpil(), 300);
  for (const f of spil.fliser) {
    assert.ok(Number.isFinite(f.y));
    assert.ok(f.bane >= 0 && f.bane < BANER);
  }
  assert.ok(Number.isFinite(spil.t) && Number.isFinite(spil.score));
  assert.equal(fart(spil), MAKS_FART, 'efter fem minutter kører det for fuld fart');
});
