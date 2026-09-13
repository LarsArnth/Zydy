// Dybet – «spil sammen»: to helte i den samme labyrint (public/spil/dybet/sammen.mjs).
//
//   node --test test/unit/dybet-sammen.test.mjs
//
// Det, der skal holde, er at de to telefoner ender med præcis den samme
// stilling. Derfor går de fleste prøver gennem pak() → pakUd(), ligesom i drift:
// den ene regner, den anden får kun den lille kasse JSON og skal nå frem til
// det samme.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../../public/spil/dybet/motor.mjs';
import * as S from '../../public/spil/dybet/sammen.mjs';

const NAVNE = { vaert: 'Sofie', gaest: 'Selma' };
const nyt = (seed = 7) => S.nytSammen(seed, NAVNE);
/** Sender stillingen gennem rummet, som den anden telefon ville se den. */
const rundt = (spil, forrige = null) => S.pakUd(JSON.parse(JSON.stringify(S.pak(spil))), forrige);

/** Et valg af en bestemt slags på det felt, holdet står på. */
const findValg = (spil, ...typer) => {
  const m = M.muligheder(spil);
  for (const t of typer) { const v = m.find(x => x.type === t); if (v) return v; }
  return m.find(x => x.type !== 'vend') || m[0];
};

/** En lille bot, der går mod trappen og slår det ned, der spærrer vejen. */
function modTrappen(spil) {
  const d = spil.dungeon;
  const m = M.muligheder(spil);
  const v = m.find(x => x.type === 'trappe') || m.find(x => x.type === 'angrib') || m.find(x => x.type === 'kiste');
  if (v) return v;
  const afstand = M.bfs(d.grid, d.B, d.trappe);
  let bedst = m[0], kortest = Infinity;
  for (const x of m) { const a = afstand[x.y * d.B + x.x]; if (a >= 0 && a < kortest) { kortest = a; bedst = x; } }
  return bedst;
}

/** Spiller videre, til noget bestemt sker (eller vi giver op). */
function spilVidere(spil, indtil, maks = 300) {
  for (let i = 0; i < maks; i++) {
    if (indtil(spil)) return spil;
    if (spil.fase === 'slut') return spil;
    if (spil.fase === 'udforsk') S.udfoer(spil, spil.tur, findValg(spil, 'angrib', 'kiste', 'gaa'));
    else S.kampTur(spil, spil.tur, { type: 'angrib' });
  }
  return spil;
}

test('begge telefoner graver den samme labyrint ud af det samme tal', () => {
  const a = nyt(1234), b = nyt(1234), c = nyt(1235);
  assert.deepEqual(a.dungeon.grid, b.dungeon.grid, 'samme frø → samme labyrint');
  assert.deepEqual(a.dungeon.trappe, b.dungeon.trappe);
  assert.notDeepEqual(a.dungeon.grid, c.dungeon.grid, 'et andet frø giver en anden labyrint');
  // Og labyrinten må ikke afhænge af kampterningerne, som de to kaster hver for sig.
  const d = nyt(1234);
  for (let i = 0; i < 50; i++) d.rng.naeste();
  assert.deepEqual(S.dungeonFroe(1234, 3), S.dungeonFroe(1234, 3));
  assert.notEqual(S.dungeonFroe(1234, 3), S.dungeonFroe(1234, 4), 'hver dybde har sit eget frø');
});

test('værten begynder, og turen hopper over til den anden ved hvert valg', () => {
  const spil = nyt();
  assert.equal(spil.tur, 'vaert');
  assert.equal(S.minTur(spil, 'vaert'), true);
  assert.equal(S.minTur(spil, 'gaest'), false);
  assert.equal(S.udfoer(spil, 'gaest', findValg(spil, 'gaa')), null, 'man kan ikke gå uden for tur');

  const r = S.udfoer(spil, 'vaert', findValg(spil, 'gaa'));
  assert.ok(r && r.aendret);
  assert.equal(spil.tur, 'gaest', 'nu er det den andens tur');
  assert.ok(spil.vej.length > 0, 'vejen der blev gået følger med, så den anden kan animere den');
});

test('spillet går selv videre, til vejen deler sig', () => {
  const spil = nyt(3);
  S.udfoer(spil, 'vaert', findValg(spil, 'gaa'));
  assert.ok(spil.vej.filter(t => t < 4).length >= 1, 'der blev gået mindst ét felt');
  // Der stoppes først, hvor der er noget at vælge (eller hvor et monster spærrer).
  if (spil.fase === 'udforsk') {
    assert.equal(M.autoValg(M.muligheder(spil)), null, 'spillet ville ikke selv gå videre herfra');
    assert.ok(M.muligheder(spil).length >= 2, 'der er noget at vælge imellem');
  } else {
    assert.equal(spil.fase, 'kamp', 'ellers stoppede vi, fordi et monster spærrede');
  }
  assert.ok(spil.vej.length <= 60, 'og der gås ikke i det uendelige');
});

test('stillingen overlever turen gennem rummet', () => {
  let spil = nyt(11);
  spilVidere(spil, s => s.fase === 'kamp');
  S.kampTur(spil, spil.tur, { type: 'angrib' });
  const kopi = rundt(spil);
  assert.equal(kopi.seed, spil.seed);
  assert.equal(kopi.niveau, spil.niveau);
  assert.equal(kopi.tur, spil.tur);
  assert.equal(kopi.fase, spil.fase);
  assert.deepEqual(kopi.pos, spil.pos);
  assert.equal(kopi.retning, spil.retning);
  assert.equal(kopi.rng.tilstand, spil.rng.tilstand, 'terningerne står samme sted');
  assert.deepEqual(kopi.dungeon.monstre.map(m => m.hp), spil.dungeon.monstre.map(m => m.hp));
  assert.deepEqual(kopi.dungeon.kister.map(k => k.aabnet), spil.dungeon.kister.map(k => k.aabnet));
  assert.deepEqual(kopi.dungeon.ting, spil.dungeon.ting);
  for (const r of S.ROLLER) assert.deepEqual(kopi.helte[r], spil.helte[r], r + ' er den samme helt');
  assert.ok(kopi.kamp && kopi.kamp.monsterId === spil.kamp.monsterId);
});

test('de to telefoner ender samme sted efter et helt spil', () => {
  let her = nyt(42);          // den der trykker
  let der = rundt(her);       // den der ser med
  for (let i = 0; i < 200 && her.fase !== 'slut' && her.niveau < 4; i++) {
    if (her.fase === 'udforsk') S.udfoer(her, her.tur, modTrappen(her));
    else S.kampTur(her, her.tur, { type: 'angrib' });
    der = rundt(her, der);
    assert.deepEqual(der.pos, her.pos, 'samme felt');
    assert.equal(der.tur, her.tur, 'samme tur');
    assert.equal(der.niveau, her.niveau, 'samme dybde');
    assert.deepEqual(der.helte.vaert.hp, her.helte.vaert.hp);
    assert.deepEqual(der.helte.gaest.hp, her.helte.gaest.hp);
  }
  assert.ok(her.niveau > 1 || her.fase === 'slut', 'der skete noget undervejs');
  assert.deepEqual(der.dungeon.grid, her.dungeon.grid, 'og til sidst står de i den samme labyrint');
});

test('stillingen er lille nok til rummet, også dybt nede', () => {
  const spil = nyt(9);
  // Fyld tasken op, som den ser ud efter mange kister.
  for (const r of S.ROLLER) {
    for (const id of Object.keys(M.TING)) M.laegITaske(spil.helte[r], id, 3);
  }
  spil.log = Array.from({ length: 8 }, (_, i) => ({ type: 'skade', maal: 'spiller', vaerdi: i, af: 'vaert',
    tekst: 'Et brutalt hug fra en meget lang monsternavn-ting! Du mister 12 liv.' }));
  const tegn = JSON.stringify(S.pak(spil)).length;
  assert.ok(tegn < 4000, `stillingen fylder ${tegn} tegn – rummet tager 4000`);
});

test('begge helte får erfaring for det monster, der bliver slået', () => {
  const spil = nyt(5);
  spilVidere(spil, s => s.fase === 'kamp');
  assert.equal(spil.fase, 'kamp');
  const m = M.kampMonster(spil);
  const foer = { vaert: spil.helte.vaert.xp, gaest: spil.helte.gaest.xp };
  for (let i = 0; i < 40 && spil.fase === 'kamp'; i++) S.kampTur(spil, spil.tur, { type: 'angrib' });
  assert.equal(spil.fase, 'udforsk', 'kampen sluttede');
  assert.ok(m.doed);
  for (const r of S.ROLLER) {
    const h = spil.helte[r];
    assert.ok(h.xp > foer[r] || h.level > 1, `${r} fik erfaring, selv om kun den ene slog det sidste slag`);
  }
});

test('falder den ene, kæmper den anden videre – og rejser makkeren op bagefter', () => {
  const spil = nyt(5);
  spilVidere(spil, s => s.fase === 'kamp');
  const m = M.kampMonster(spil);
  m.angreb = 500;                                 // det her monster slår hårdt
  const foerst = spil.tur;
  S.kampTur(spil, foerst, { type: 'angrib' });
  assert.equal(spil.helte[foerst].nede, true, 'den der slog, blev slået ud');
  assert.equal(spil.fase, 'kamp', 'kampen kører videre');
  assert.equal(spil.tur, S.anden(foerst), 'makkeren har turen');
  assert.equal(S.kampTur(spil, foerst, { type: 'angrib' }), null, 'man kan ikke slå, når man ligger ned');

  m.angreb = 0; m.hp = 1;                          // makkeren gør det af med den
  const r = S.kampTur(spil, spil.tur, { type: 'angrib' });
  assert.equal(spil.fase, 'udforsk');
  assert.equal(spil.helte[foerst].nede, false, 'makkeren er oppe igen');
  assert.ok(spil.helte[foerst].hp > 0);
  assert.ok(r.log.some(e => e.type === 'oprejst'), 'og der står det på skærmen');
});

test('går begge ned, er turen slut – og så kan ingen af dem gøre mere', () => {
  const spil = nyt(5);
  spilVidere(spil, s => s.fase === 'kamp');
  const m = M.kampMonster(spil);
  m.angreb = 500; m.maxHp = m.hp = 9999;
  S.kampTur(spil, spil.tur, { type: 'angrib' });
  const r = S.kampTur(spil, spil.tur, { type: 'angrib' });
  assert.equal(spil.fase, 'slut');
  assert.ok(r.log.some(e => e.type === 'slut' && e.dybde === spil.niveau));
  assert.equal(S.kampTur(spil, 'vaert', { type: 'angrib' }), null);
  assert.equal(S.udfoer(spil, 'gaest', { type: 'gaa', retning: 0 }), null);
  assert.equal(rundt(spil).fase, 'slut', 'og det står også i rummet');
});

test('trappen tager begge med ned, og vejen begynder forfra på det nye niveau', () => {
  let spil = nyt(11);
  for (let i = 0; i < 200 && spil.niveau === 1 && spil.fase !== 'slut'; i++) {
    if (spil.fase === 'kamp') S.kampTur(spil, spil.tur, { type: 'angrib' });
    else S.udfoer(spil, spil.tur, modTrappen(spil));
  }
  assert.equal(spil.niveau, 2, 'holdet kom ned');
  assert.equal(spil.ned, 2, 'og siger til den anden telefon, at der skal en overgang på');
  assert.ok(spil.helte.vaert.hp > 0 && spil.helte.gaest.hp > 0, 'begge fik liv med ned');
  const kopi = rundt(spil);
  assert.equal(kopi.niveau, 2);
  assert.deepEqual(kopi.dungeon.grid, spil.dungeon.grid, 'samme nye labyrint på begge telefoner');
  assert.deepEqual(kopi.pos, spil.pos);
});

test('tasken passer man selv – men kun på sin egen tur', () => {
  const spil = nyt(7);
  M.laegITaske(spil.helte.vaert, 'oekse', 1);
  spil.helte.vaert.hp = 5;
  assert.equal(S.taske(spil, 'gaest', 'udstyr', 'oekse'), null, 'ikke uden for tur');
  const r = S.taske(spil, 'vaert', 'udstyr', 'oekse');
  assert.ok(r.aendret);
  assert.equal(spil.helte.vaert.udstyr.vaaben, 'oekse');
  assert.equal(spil.tur, 'vaert', 'at rode i tasken koster ikke sin tur');
  const p = S.taske(spil, 'vaert', 'brug', 'potion');
  assert.ok(p.aendret && spil.helte.vaert.hp > 5, 'potionen virker');
  const igen = rundt(spil);
  assert.equal(igen.helte.vaert.udstyr.vaaben, 'oekse', 'og makkeren ser det');
});

test('beskederne skrives om, når man ser med over skulderen', () => {
  assert.equal(S.omskriv('Du angriber med kniv. Slim mister 6 liv.', 'Selma'),
    'Selma angriber med kniv. Slim mister 6 liv.');
  assert.equal(S.omskriv('Du helbreder dig selv og får 12 liv.', 'Selma'),
    'Selma helbreder sig selv og får 12 liv.');
  assert.equal(S.omskriv('Slim angriber. Du mister 3 liv.', 'Sofie'),
    'Slim angriber. Sofie mister 3 liv.');
  const spil = nyt();
  const e = { type: 'skade', af: 'vaert', tekst: 'Du angriber.' };
  assert.equal(S.tekstFor(spil, e, 'vaert'), 'Du angriber.', 'om mig selv står der stadig «du»');
  assert.equal(S.tekstFor(spil, e, 'gaest'), 'Sofie angriber.');
  assert.equal(S.tekstFor(spil, { af: null, tekst: 'Sofie er slået ud!' }, 'gaest'), 'Sofie er slået ud!');
});

test('at spille alene er urørt', () => {
  const spil = M.nytSpil(3);
  assert.equal(spil.niveau, 1);
  assert.equal(spil.spiller.hp, 30);
  // vindXp er trukket ud af sejr() – den skal stadig sige «Du», når man er alene.
  const sp = M.lavSpiller();
  const h = M.vindXp(sp, 500);
  assert.ok(h.some(e => e.type === 'levelOp' && e.tekst.startsWith('Du er nu niveau')));
  const sp2 = M.lavSpiller();
  const h2 = M.vindXp(sp2, 500, 'Selma');
  assert.ok(h2.some(e => e.tekst.startsWith('Selma er nu niveau')));
  assert.ok(h2.every(e => !/\bdit\b/.test(e.tekst)), 'makkerens beskeder taler ikke til mig');
});
