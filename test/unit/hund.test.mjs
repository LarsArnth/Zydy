// Motoren bag «Min hund»: behovene der siver, gåturen, hundeskolen, butikken
// og den gemte hund. Ingen browser – kør med
//   node --test test/unit/hund.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BEHOV, FORFALD, FRAVAER_MAKS_TIMER, FRAVAER_BUND, MAD_PR_MAALTID, KLAP_LOFT,
  MAKS_NIVEAU, START_MOENTER, TING, GRATIS_PELSE, TRICKS, MESTRET, MESTRET_BONUS,
  LAERT_OK, LAERT_FEJL, TUR_LAENGDE, TUR_PR_METER, TUR_BID, POSE_POINT,
  nyHund, forfald, plej, klap, koeb, tagPaa, ejer, tingen,
  nyTur, gaa, turStop, traen, trick, laert, kanTraene, kanTricks, trickChance,
  niveauFor, niveauAndel, xpTilNiveau, trivsel, humoer, mestTraengende,
  alderDage, serialiser, laes, velkomst, meterTekst,
} from '../../public/spil/hund/hund.mjs';

const TIME = 3600;

/** En lille terning med faste tal, så en test ikke afhænger af held. */
const terning = (...tal) => { let i = 0; return () => tal[Math.min(i++, tal.length - 1)]; };

test('en ny hvalp har det godt og har navn, pels og lommepenge', () => {
  const hund = nyHund('Selmas hund', 'pels-sort', 1000);
  assert.equal(hund.navn, 'Selmas hund');
  assert.equal(hund.pels, 'pels-sort');
  assert.equal(hund.moenter, START_MOENTER);
  assert.equal(niveauFor(hund.xp), 1);
  assert.equal(hund.meter, 0, 'kilometertælleren begynder på nul');
  assert.equal(kanTricks(hund), 0, 'og den kan ingen tricks endnu');
  assert.ok(trivsel(hund) > 55, 'den starter i godt humør');
  // Et tomt eller ukendt valg falder tilbage til noget fornuftigt
  assert.equal(nyHund('', 'pels-krone').navn, 'Vaks');
  assert.equal(nyHund('Vaks', 'pels-krone').pels, GRATIS_PELSE[0]);
  assert.equal(nyHund('Et alt for langt hundenavn').navn.length, 12);
});

test('behovene falder med den fart de skal – og «luftet» falder hurtigst', () => {
  const hund = nyHund('Vaks', 'pels-brun', 0);
  hund.behov = { mad: 100, leg: 100, renhed: 100, tur: 100 };
  forfald(hund, TIME);
  for (const b of BEHOV) assert.ok(Math.abs(hund.behov[b] - (100 - FORFALD[b])) < 1e-9, `${b} falder ${FORFALD[b]} pr. time`);
  assert.ok(FORFALD.tur > Math.max(FORFALD.mad, FORFALD.leg, FORFALD.renhed), 'en hund skal ud at gå');
  assert.equal(mestTraengende(hund), 'tur');
  // forfald() tæller højst FRAVAER_MAKS_TIMER ad gangen, så et døgn er flere kald
  for (let i = 0; i < 5; i++) forfald(hund, 24 * TIME);
  for (const b of BEHOV) assert.equal(hund.behov[b], 0, `${b} går ikke under nul`);
  assert.equal(humoer(hund), 'ked');
});

test('et langt fravær tæller kun med op til loftet – og hunden er der endnu', () => {
  const start = Date.UTC(2026, 8, 13, 8, 0, 0);
  const gemt = serialiser(nyHund('Vaks', 'pels-brun', start), start);
  const loft = laes(gemt, start + FRAVAER_MAKS_TIMER * TIME * 1000);
  const uge = laes(gemt, start + 7 * 24 * TIME * 1000);
  assert.equal(uge.vaekSek, loft.vaekSek, 'en uge væk tæller som FRAVAER_MAKS_TIMER');
  assert.deepEqual(uge.hund.behov, loft.hund.behov);
  for (const b of BEHOV) assert.equal(uge.hund.behov[b], FRAVAER_BUND, `${b}: fraværet trykker ikke hunden under bunden`);
  assert.match(velkomst(uge.hund, uge.vaekSek), /savnet dig/);
  assert.equal(velkomst(uge.hund, 20), null, 'man får ikke en hilsen, hvis man lige har været her');
});

test('man får kun løn for det, man faktisk fylder op', () => {
  const hund = nyHund('Vaks', 'pels-brun', 0);
  hund.behov.mad = 20;
  const foerste = plej(hund, 'mad', MAD_PR_MAALTID);
  assert.ok(Math.abs(foerste.oeget - MAD_PR_MAALTID) < 1e-9);
  assert.ok(foerste.xp > 0 && foerste.moenter > 0, 'en sulten hund giver noget for maden');

  hund.behov.mad = 100;
  const anden = plej(hund, 'mad', MAD_PR_MAALTID);
  assert.equal(anden.oeget, 0);
  assert.equal(anden.xp, 0);
  assert.equal(anden.moenter, 0, 'en mæt hund giver ingenting – man kan ikke trykke sig til mønter');

  // Et klap gør glad op til loftet, men giver hverken erfaring eller mønter
  const moenter = hund.moenter, xp = hund.xp;
  hund.behov.leg = KLAP_LOFT - 0.5;
  assert.equal(klap(hund), true);
  assert.equal(klap(hund), false, 'over loftet hjælper et klap ikke mere');
  assert.equal(hund.moenter, moenter);
  assert.equal(hund.xp, xp);
});

test('gåturen: hver meter tæller, men der afregnes i bid', () => {
  const hund = nyHund('Vaks', 'pels-brun', 0);
  hund.behov.tur = 0;
  assert.equal(gaa(hund, TUR_BID - 1), null, 'et par meter giver ikke noget endnu');
  assert.equal(hund.meter, 0);
  const r = gaa(hund, 2);
  assert.ok(r, 'nu er der et helt bid');
  assert.equal(hund.meter, TUR_BID, 'kilometertælleren tæller kun det afregnede');
  assert.ok(Math.abs(hund.behov.tur - TUR_BID * TUR_PR_METER) < 1e-9);
  assert.ok(r.moenter > 0, 'og der er mønter i at gå tur');

  // En hel tur fylder næsten måleren – det er dét, en gåtur er til for
  const hund2 = nyHund('Vaks', 'pels-brun', 0);
  hund2.behov.tur = 0;
  for (let i = 0; i < TUR_LAENGDE; i++) gaa(hund2, 1);
  assert.ok(hund2.behov.tur > 75, `en hel tur lufter hunden (${hund2.behov.tur.toFixed(0)})`);
  assert.ok(hund2.meter >= TUR_LAENGDE - TUR_BID);
});

test('ruten ligger inden for turen og er den samme med samme seed', () => {
  const tal = [0.1, 0.5, 0.2, 0.9, 0.3, 0.4, 0.7, 0.05, 0.6, 0.8, 0.25, 0.45, 0.65, 0.15, 0.35, 0.55, 0.75, 0.95];
  const a = nyTur(terning(...tal));
  const b = nyTur(terning(...tal));
  assert.deepEqual(a, b, 'samme terning giver den samme tur');
  assert.ok(a.stop.length >= 3, `der sker noget undervejs (${a.stop.length} stop)`);
  for (const s of a.stop) {
    assert.ok(s.m > 0 && s.m < a.laengde, 'alt ligger inde på turen');
    assert.ok(!s.klaret && !s.forbi);
  }
  for (let i = 1; i < a.stop.length; i++) {
    assert.ok(a.stop[i].m - a.stop[i - 1].m >= 10, 'der er luft mellem tingene, så man kan nå dem');
  }
});

test('det man møder på turen: pinde gør glad, pytten koster kun hvis man sover i timen', () => {
  const hund = nyHund('Vaks', 'pels-brun', 0);
  hund.behov.leg = 30;
  const pind = turStop(hund, 'pind', true);
  assert.ok(pind.oeget > 0 && pind.xp > 0);
  assert.match(pind.tekst, /Vaks/);
  assert.equal(turStop(hund, 'pind', false), null, 'missede man den, sker der ingenting');

  // Mudderpytten er vendt om: trykket er redningen
  hund.behov.renhed = 90;
  const reddet = turStop(hund, 'pyt', true);
  assert.equal(hund.behov.renhed, 90, 'man nåede at trække i snoren');
  assert.equal(reddet.moenter, 0, 'men der er ingen gevinst i at undgå noget');
  const plask = turStop(hund, 'pyt', false);
  assert.ok(hund.behov.renhed < 80, 'ellers ryger den i pytten');
  assert.equal(plask.moenter, 0);
  assert.match(plask.tekst, /Plask/);

  // Posen giver mønter, men fylder ingen behov
  const foer = { ...hund.behov };
  const pose = turStop(hund, 'pose', true);
  assert.ok(pose.moenter > 0 && pose.xp > 0, `det betaler sig at samle op (${POSE_POINT} point)`);
  assert.deepEqual(hund.behov, foer, 'men hunden får det ikke bedre af det');
  assert.equal(turStop(hund, 'findes-ikke', true), null);
});

test('tricks låses op efterhånden, som hunden bliver klogere', () => {
  const hund = nyHund('Vaks', 'pels-brun', 0);
  assert.equal(kanTraene(hund, 'sit'), true, 'sit kan man med det samme');
  assert.equal(kanTraene(hund, 'doed'), false, 'dødsmand skal man op i niveau til');
  assert.equal(traen(hund, 'doed', 0), null, 'og kan ikke øves endnu');
  hund.xp = xpTilNiveau(trick('doed').niveau);
  assert.equal(kanTraene(hund, 'doed'), true);
  for (const t of TRICKS) assert.ok(t.niveau >= 1 && t.ord.length > 0);
});

test('en øvelse flytter tricket – og en hund, der har det skidt, hører dårligere efter', () => {
  const hund = nyHund('Vaks', 'pels-brun', 0);
  const godt = trickChance(hund, 'sit');
  hund.behov = { mad: 5, leg: 5, renhed: 5, tur: 5 };
  assert.ok(trickChance(hund, 'sit') < godt, 'en sulten og ulykkelig hund hører ikke efter');
  hund.behov = { mad: 90, leg: 90, renhed: 90, tur: 90 };
  hund.tricks.sit = 80;
  assert.ok(trickChance(hund, 'sit') > trickChance(nyHund('A'), 'sit'), 'jo mere den kan, jo oftere gør den det');

  // held = 0 lykkes altid, held = 1 mislykkes altid – men den lærer lidt af begge dele
  const a = traen(hund, 'sit', 0);
  assert.equal(a.ok, true);
  assert.equal(laert(hund, 'sit'), 80 + LAERT_OK);
  const b = traen(hund, 'sit', 1);
  assert.equal(b.ok, false);
  assert.equal(laert(hund, 'sit'), 80 + LAERT_OK + LAERT_FEJL, 'selv et mislykket forsøg lærer den lidt');
  assert.ok(b.xp >= 0);
});

test('når tricket sidder fast, er der bonus – og bagefter er det gratis sjov', () => {
  const hund = nyHund('Vaks', 'pels-brun', 0);
  hund.behov = { mad: 100, leg: 100, renhed: 100, tur: 100 };   // intet behov at fylde op
  hund.tricks.sit = MESTRET - LAERT_OK;
  const r = traen(hund, 'sit', 0);
  assert.equal(r.mestret, true);
  assert.equal(laert(hund, 'sit'), MESTRET);
  assert.equal(kanTricks(hund), 1);
  assert.ok(r.xp >= Math.round((LAERT_OK + MESTRET_BONUS) / 3), 'der er bonus, første gang det sidder fast');

  const xp = hund.xp, moenter = hund.moenter;
  const igen = traen(hund, 'sit', 0);
  assert.equal(igen.mestret, false);
  assert.equal(hund.xp, xp, 'et trick, den kan, giver ingen erfaring');
  assert.equal(hund.moenter, moenter, 'og ingen mønter – ellers kunne man trykke sig til en guldkrone');
});

test('butikken: køb, tag på og tag af igen', () => {
  const hund = nyHund('Vaks', 'pels-brun', 0);
  assert.equal(ejer(hund, 'pels-hvid'), true, 'de gratis hvalpe ejer man');
  assert.equal(ejer(hund, 'hat-krone'), false);
  hund.moenter = 10;
  assert.equal(koeb(hund, 'hat-krone'), false, 'der skal være råd');
  hund.moenter = 200;
  assert.equal(koeb(hund, 'hat-krone'), true);
  assert.equal(hund.moenter, 200 - tingen('hat-krone').pris);
  assert.equal(hund.hat, 'hat-krone', 'det købte kommer på med det samme');
  tagPaa(hund, 'hat-krone');
  assert.equal(hund.hat, null, 'og kan tages af igen');
  tagPaa(hund, 'pels-graa');
  assert.equal(hund.pels, 'pels-brun', 'en pels man ikke ejer, kan ikke tages på');
  assert.ok(TING.filter(t => t.slags === 'pels').length >= 6);
  assert.ok(TING.every(t => ['pels', 'hat', 'halsbaand'].includes(t.slags)));
});

test('hunden huskes – med tricks, kilometer og det hele', () => {
  const start = Date.UTC(2026, 8, 13, 8, 0, 0);
  const hund = nyHund('Tulle', 'pels-hvid', start);
  hund.moenter = 200;
  koeb(hund, 'hat-krone');
  hund.tricks.sit = 55;
  gaa(hund, 240);
  hund.xp = 90;
  const to_timer = start + 2 * TIME * 1000;
  const { hund: igen, vaekSek } = laes(serialiser(hund, start), to_timer);
  assert.equal(igen.navn, 'Tulle');
  assert.equal(igen.pels, 'pels-hvid');
  assert.equal(igen.hat, 'hat-krone');
  assert.equal(igen.tricks.sit, 55);
  assert.equal(igen.meter, 240);
  assert.equal(igen.xp, 90);
  assert.equal(vaekSek, 2 * TIME);
  assert.ok(igen.behov.tur < hund.behov.tur, 'den har trængt til en tur imens');
  assert.equal(alderDage(igen, start + 3 * 24 * TIME * 1000), 3);

  // Skrald i det gemte må ikke koste hunden livet
  assert.equal(laes(null, start), null);
  assert.equal(laes({ navn: 42 }, start), null);
  const rod = laes({ navn: 'Rod', xp: 'mange', moenter: -5, behov: { mad: 'nej' }, tricks: { sit: 900 }, meter: -3, hat: 'hat-krone' }, start).hund;
  assert.equal(rod.xp, 0);
  assert.equal(rod.moenter, 0);
  assert.equal(rod.behov.mad, 50);
  assert.equal(rod.tricks.sit, MESTRET, 'et tal uden for skalaen klippes til');
  assert.equal(rod.meter, 0);
  assert.equal(rod.hat, null, 'man kan ikke få en krone, man ikke har købt');
});

test('niveauerne er jævne og har et loft', () => {
  assert.equal(niveauFor(0), 1);
  assert.equal(niveauFor(xpTilNiveau(2)), 2);
  assert.equal(niveauFor(xpTilNiveau(2) - 1), 1);
  assert.equal(niveauFor(1e9), MAKS_NIVEAU, 'toplistens loft kan ikke overskrides');
  assert.equal(niveauAndel(xpTilNiveau(MAKS_NIVEAU)), 1);
  assert.ok(niveauAndel(xpTilNiveau(2) / 2) > 0.4 && niveauAndel(xpTilNiveau(2) / 2) < 0.6);
  for (let n = 2; n <= MAKS_NIVEAU; n++) {
    assert.ok(xpTilNiveau(n) > xpTilNiveau(n - 1), `niveau ${n} koster mere end ${n - 1}`);
  }
});

test('kilometertælleren skrives, så et barn kan læse den', () => {
  assert.equal(meterTekst(0), '0 m');
  assert.equal(meterTekst(940), '940 m');
  assert.equal(meterTekst(1200), '1,2 km');
  assert.equal(meterTekst(undefined), '0 m');
});
