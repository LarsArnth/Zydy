// Straffespark – bolden, målet og målmanden. Ingen browser:
//   node --test test/unit/straffe.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAAL, AFSTAND, LIV, FART_MIN, FART_MAKS, SPRED_MAKS, STOLPE, RAEKKE,
  KEEPER_START, NIVEAU_MAKS, MAAL_PR_NIVEAU,
  mulberry32, keeperFor, nyKamp, spark, bot, koer,
} from '../../public/spil/straffe/straffe.mjs';

// Ét spark på et bestemt niveau, uden at røre en rigtig kamp
function proev(seed, niveau, sigte, kraft) {
  const s = nyKamp(seed);
  s.niveau = niveau;
  return spark(s, sigte, kraft);
}

// Hvor tit bliver det mål? (andel over `n` frø)
function maalAndel(niveau, sigte, kraft, n = 500) {
  let m = 0;
  for (let i = 1; i <= n; i++) if (proev(i, niveau, sigte, kraft).resultat === 'maal') m++;
  return m / n;
}

/* ---------- Målet og målmanden ser rigtige ud ---------- */

test('målet har en rigtig størrelse, og målmanden står midt i det', () => {
  assert.equal(MAAL.bredde, 7.32);
  assert.equal(MAAL.hoejde, 2.44);
  assert.equal(AFSTAND, 11, 'straffespark tages fra 11 meter');
  assert.equal(KEEPER_START.x, 0);
  assert.ok(KEEPER_START.y < MAAL.hoejde);
});

test('målmanden bliver bedre med niveauet – og niveauet har loft og bund', () => {
  let forrige = keeperFor(1);
  for (let n = 2; n <= NIVEAU_MAKS; n++) {
    const k = keeperFor(n);
    assert.ok(k.reaktion <= forrige.reaktion, `niveau ${n} reagerer ikke hurtigere`);
    assert.ok(k.dykkefart >= forrige.dykkefart, `niveau ${n} springer ikke længere`);
    assert.ok(k.fejlchance <= forrige.fejlchance, `niveau ${n} gætter ikke bedre`);
    forrige = k;
  }
  assert.deepEqual(keeperFor(0), keeperFor(1), 'under 1 klemmes op');
  assert.deepEqual(keeperFor(99), keeperFor(NIVEAU_MAKS), 'over loftet klemmes ned');
  assert.ok(keeperFor(NIVEAU_MAKS).reaktion > 0, 'selv den bedste har en reaktionstid');
  assert.ok(keeperFor(NIVEAU_MAKS).fejlchance > 0, 'og kan stadig gætte forkert');
});

/* ---------- Sparket ---------- */

test('samme frø og samme spark giver nøjagtig samme resultat', () => {
  const a = proev(42, 3, { x: 2.5, y: 1.5 }, 0.7);
  const b = proev(42, 3, { x: 2.5, y: 1.5 }, 0.7);
  assert.deepEqual(a, b);
  // ... og to spark i træk i samme kamp er IKKE ens (hvert spark har sit eget frø)
  const s = nyKamp(42);
  const e1 = spark(s, { x: 2.5, y: 1.5 }, 0.7);
  const e2 = spark(s, { x: 2.5, y: 1.5 }, 0.7);
  assert.notDeepEqual({ x: e1.bold.x, y: e1.bold.y }, { x: e2.bold.x, y: e2.bold.y });
});

test('kraften styrer farten, og farten flyvetiden', () => {
  const blødt = proev(1, 1, { x: 0, y: 1 }, 0);
  const hårdt = proev(1, 1, { x: 0, y: 1 }, 1);
  assert.equal(blødt.fart, FART_MIN);
  assert.equal(hårdt.fart, FART_MAKS);
  assert.ok(hårdt.flyvetid < blødt.flyvetid, 'et hårdt spark er hurtigere fremme');
  assert.ok(Math.abs(blødt.flyvetid - AFSTAND / FART_MIN) < 1e-9);
  const udenfor = proev(1, 1, { x: 0, y: 1 }, 7);
  assert.equal(udenfor.fart, FART_MAKS, 'kraften klemmes til 0-1');
});

test('et blødt spark rammer hvor man sigter – et hårdt spreder', () => {
  for (let i = 1; i <= 50; i++) {
    const e = proev(i, 1, { x: 2, y: 1.2 }, 0);
    assert.equal(e.bold.x, 2, 'kraft 0 spreder ikke sidelæns');
    assert.equal(e.bold.y, 1.2, 'kraft 0 spreder ikke i højden');
  }
  let spredte = 0;
  for (let i = 1; i <= 50; i++) {
    const e = proev(i, 1, { x: 2, y: 1.2 }, 1);
    assert.ok(Math.abs(e.bold.x - 2) <= SPRED_MAKS + 1e-9, 'men aldrig mere end SPRED_MAKS');
    if (Math.abs(e.bold.x - 2) > 0.2) spredte++;
  }
  assert.ok(spredte > 10, 'fuld kraft driller for det meste');
});

test('bolden triller aldrig under græsset', () => {
  for (let i = 1; i <= 100; i++) {
    const e = proev(i, 1, { x: 0, y: 0 }, 1);
    assert.ok(e.bold.y >= 0.05);
  }
});

/* ---------- Resultaterne ---------- */

test('et spark langt forbi er forbi – uanset målmanden', () => {
  for (let i = 1; i <= 50; i++) {
    assert.equal(proev(i, 1, { x: 6, y: 1 }, 0.3).resultat, 'forbi');
    assert.equal(proev(i, NIVEAU_MAKS, { x: -6, y: 1 }, 0.3).resultat, 'forbi');
    assert.equal(proev(i, 1, { x: 0, y: 5 }, 0.3).resultat, 'forbi');
  }
});

test('lige uden for kanten er det stolpe og overligger', () => {
  const stolpe = proev(1, 1, { x: MAAL.bredde / 2 + STOLPE / 2, y: 1 }, 0);
  assert.equal(stolpe.resultat, 'stolpe');
  const over = proev(1, 1, { x: 0, y: MAAL.hoejde + STOLPE / 2 }, 0);
  assert.equal(over.resultat, 'overligger');
  // ... og de brænder bolden ligesom forbi
  const s = nyKamp(1);
  spark(s, { x: MAAL.bredde / 2 + STOLPE / 2, y: 1 }, 0);
  assert.equal(s.maal, 0);
  assert.equal(s.liv, LIV - 1);
});

test('målmanden redder det, han kan nå – og bliver snydt, når han gætter forkert', () => {
  // Et blødt spark lige midt i målet: gætter han rigtigt, står han jo dér
  for (let i = 1; i <= 200; i++) {
    const e = proev(i, 6, { x: 0, y: KEEPER_START.y }, 0);
    if (e.keeper.forkert) {
      assert.equal(e.resultat, 'maal', `frø ${i}: han sprang forkert og bolden gik midt i`);
      assert.ok(e.keeper.dyk.x !== 0, 'det forkerte spring går til en side');
    } else {
      assert.equal(e.resultat, 'redning', `frø ${i}: han stod dér og skal redde den`);
    }
  }
});

test('redningen måles med armene: naaet-punktet er højst RAEKKE fra bolden', () => {
  for (let i = 1; i <= 300; i++) {
    const e = proev(i, 8, { x: 2.2, y: 1.2 }, 0.6);
    const afstand = Math.hypot(e.keeper.naaet.x - e.bold.x, e.keeper.naaet.y - e.bold.y);
    if (e.resultat === 'redning') assert.ok(afstand <= RAEKKE + 1e-9, `frø ${i}: redning uden at nå bolden`);
    if (e.resultat === 'maal') assert.ok(afstand > RAEKKE, `frø ${i}: mål selvom han nåede den`);
  }
});

/* ---------- Balancen: til at score på, men sværere og sværere ---------- */

test('et godt hjørnespark scorer næsten altid på niveau 1', () => {
  assert.ok(maalAndel(1, { x: 3.05, y: 1.75 }, 0.85) >= 0.7);
});

test('den bedste målmand redder det meste – men ikke alt', () => {
  const let1 = maalAndel(1, { x: 3.05, y: 1.75 }, 0.85);
  const svaer = maalAndel(NIVEAU_MAKS, { x: 3.05, y: 1.75 }, 0.85);
  assert.ok(svaer <= let1 - 0.3, `niveau ${NIVEAU_MAKS} (${svaer}) er ikke klart sværere end 1 (${let1})`);
  assert.ok(svaer >= 0.05, 'men man kan stadig score');
});

test('et blødt spark midt i målet dur ikke mod en god målmand', () => {
  assert.ok(maalAndel(NIVEAU_MAKS, { x: 0, y: 0.8 }, 0.2) <= 0.2);
});

/* ---------- Kampen ---------- */

test('mål tæller op, brændte bolde koster liv, og tre brændte slutter kampen', () => {
  const s = nyKamp(7);
  assert.equal(s.liv, LIV);
  assert.equal(s.niveau, 1);
  // Tre spark langt forbi = kampen er slut
  for (let i = 0; i < LIV; i++) {
    assert.equal(s.faerdig, false);
    spark(s, { x: 9, y: 1 }, 0.5);
  }
  assert.equal(s.liv, 0);
  assert.equal(s.faerdig, true);
  assert.equal(spark(s, { x: 0, y: 1 }, 0.5), null, 'en færdig kamp tager ikke imod spark');
});

test('målmanden rykker et niveau op for hvert andet mål – med loft', () => {
  const s = nyKamp(3);
  let sikret = 0;
  // Sparker med fast sigte til der ér scoret nok – forbi-spark ruller vi tilbage
  while (s.maal < MAAL_PR_NIVEAU * (NIVEAU_MAKS + 2) && sikret < 10000) {
    sikret++;
    const foer = { ...s };
    const e = spark(s, { x: 3.05, y: 1.75 }, 0.85);
    if (e.resultat !== 'maal') Object.assign(s, foer, { nr: s.nr });   // behold nr, glem livet
    assert.equal(s.niveau, Math.min(NIVEAU_MAKS, 1 + Math.floor(s.maal / MAAL_PR_NIVEAU)));
  }
  assert.equal(s.niveau, NIVEAU_MAKS, 'loftet er nået');
});

/* ---------- Botten ---------- */

test('botten spiller en hel kamp og scorer pænt – så spillet KAN spilles', () => {
  const scorer = [];
  for (let i = 1; i <= 40; i++) scorer.push(koer(i).maal);
  const gns = scorer.reduce((a, b) => a + b, 0) / scorer.length;
  assert.ok(gns >= 8, `botten scorer for lidt (gns ${gns})`);
  assert.ok(scorer.every(m => m <= 60), 'og kampen slutter altid');
  const b = bot(nyKamp(1));
  assert.ok(Math.abs(b.sigte.x) < MAAL.bredde / 2, 'botten sigter inden for målet');
  assert.ok(b.sigte.y < MAAL.hoejde);
});

test('mulberry32 er deterministisk', () => {
  const a = mulberry32(123), b = mulberry32(123);
  for (let i = 0; i < 10; i++) assert.equal(a(), b());
});
