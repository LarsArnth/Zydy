// Motoren bag «Min kat»: behovene der siver, belønningen for at passe katten,
// butikken og den gemte kat. Ingen browser – kør med
//   node --test test/unit/kat.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BEHOV, FORFALD, SOEVN_PR_SEK, SOVE_FORFALD, FRAVAER_MAKS_TIMER, FRAVAER_BUND, MAD_PR_MAALTID,
  KLAP_LOFT, MAKS_NIVEAU, START_MOENTER, TING, GRATIS_PELSE,
  nyKat, forfald, plej, klap, beloen, koeb, tagPaa, ejer, tingen,
  niveauFor, niveauAndel, xpTilNiveau, trivsel, humoer, mestTraengende,
  alderDage, serialiser, laes, velkomst,
} from '../../public/spil/kat/kat.mjs';

const TIME = 3600;

test('en ny killing har det godt og har navn, pels og lommepenge', () => {
  const kat = nyKat('Selmas kat', 'pels-sort', 1000);
  assert.equal(kat.navn, 'Selmas kat');
  assert.equal(kat.pels, 'pels-sort');
  assert.equal(kat.moenter, START_MOENTER);
  assert.equal(niveauFor(kat.xp), 1);
  assert.ok(trivsel(kat) > 60, 'den starter i godt humør');
  assert.equal(humoer(kat), 'glad');
  // Et tomt eller ukendt valg falder tilbage til noget fornuftigt
  assert.equal(nyKat('', 'pels-krone').navn, 'Mis');
  assert.equal(nyKat('Mis', 'pels-krone').pels, GRATIS_PELSE[0]);
  assert.equal(nyKat('Et alt for langt kattenavn').navn.length, 12);
});

test('behovene falder med den fart de skal', () => {
  const kat = nyKat('Mis', 'pels-graa', 0);
  kat.behov = { mad: 100, leg: 100, renhed: 100, energi: 100 };
  forfald(kat, TIME);
  for (const b of BEHOV) assert.ok(Math.abs(kat.behov[b] - (100 - FORFALD[b])) < 1e-9, `${b} falder ${FORFALD[b]} pr. time`);
  // Ingen af dem går under nul, uanset hvor længe der går
  forfald(kat, 100 * TIME);
  for (const b of BEHOV) assert.equal(kat.behov[b], 0, `${b} går ikke under nul`);
});

test('et langt fravær tæller kun med op til loftet – og katten er der endnu', () => {
  const start = Date.UTC(2026, 8, 12, 8, 0, 0);
  const gemt = serialiser(nyKat('Mis', 'pels-graa', start), start);
  const loft = laes(gemt, start + FRAVAER_MAKS_TIMER * TIME * 1000);
  const uge = laes(gemt, start + 7 * 24 * TIME * 1000);
  assert.equal(uge.vaekSek, loft.vaekSek, 'en uge væk tæller som FRAVAER_MAKS_TIMER');
  assert.deepEqual(uge.kat.behov, loft.kat.behov);
  for (const b of BEHOV) {
    assert.equal(uge.kat.behov[b], FRAVAER_BUND, `${b}: fraværet trykker ikke katten under bunden`);
  }
  assert.equal(humoer(uge.kat), 'ked', 'men den er godt nok ked af det, når man endelig kommer');
});

test('mens katten sover, stiger energien og resten falder langsommere', () => {
  const kat = nyKat('Mis', 'pels-graa', 0);
  kat.behov = { mad: 80, leg: 80, renhed: 80, energi: 20 };
  forfald(kat, 10, true);
  assert.ok(Math.abs(kat.behov.energi - (20 + 10 * SOEVN_PR_SEK)) < 1e-9, 'energien stiger i søvne');
  const forventet = 80 - (10 * FORFALD.mad / 3600) * SOVE_FORFALD;
  assert.ok(Math.abs(kat.behov.mad - forventet) < 1e-9, 'sulten kommer langsommere, når den sover');
  forfald(kat, 1000, true);
  assert.equal(kat.behov.energi, 100, 'energien stopper ved 100');
});

test('man får kun løn for det, man faktisk fylder op', () => {
  const kat = nyKat('Mis', 'pels-graa', 0);
  kat.behov.mad = 20;
  const foerste = plej(kat, 'mad', MAD_PR_MAALTID);
  assert.equal(Math.round(kat.behov.mad), 54);
  assert.ok(foerste.xp > 0 && foerste.moenter > 0, 'en sulten kat giver erfaring og mønter');

  kat.behov.mad = 100;
  const xp = kat.xp, moenter = kat.moenter;
  const spild = plej(kat, 'mad', MAD_PR_MAALTID);
  assert.equal(spild.oeget, 0, 'en mæt kat kan ikke fyldes mere op');
  assert.equal(spild.xp, 0);
  assert.equal(kat.xp, xp, 'og der er intet at tjene ved at trykke igen');
  assert.equal(kat.moenter, moenter);

  kat.behov.mad = 95;
  const rest = plej(kat, 'mad', MAD_PR_MAALTID);
  assert.equal(Math.round(rest.oeget), 5, 'kun de sidste 5 point tæller');
  assert.ok(rest.moenter < foerste.moenter, 'og de giver mindre end et helt måltid');
});

test('klap gør glad, men kan ikke erstatte leg', () => {
  const kat = nyKat('Mis', 'pels-graa', 0);
  kat.behov.leg = 0;
  const xp = kat.xp, moenter = kat.moenter;
  let hjalp = 0;
  for (let i = 0; i < 200; i++) if (klap(kat)) hjalp++;
  assert.equal(kat.behov.leg, KLAP_LOFT, 'klap stopper ved loftet');
  assert.equal(hjalp, KLAP_LOFT, 'og efter loftet siger den fra');
  assert.equal(kat.xp, xp, 'klap giver ingen erfaring');
  assert.equal(kat.moenter, moenter, 'og ingen mønter');
  kat.sover = true;
  kat.behov.leg = 0;
  assert.equal(klap(kat), false, 'man klapper ikke en sovende kat');
});

test('niveauerne kommer i rækkefølge og stopper ved loftet', () => {
  assert.equal(niveauFor(0), 1);
  assert.equal(xpTilNiveau(1), 0);
  for (let n = 1; n < MAKS_NIVEAU; n++) {
    assert.ok(xpTilNiveau(n + 1) > xpTilNiveau(n), 'hvert niveau koster mere end det før');
    assert.equal(niveauFor(xpTilNiveau(n + 1)), n + 1, `${xpTilNiveau(n + 1)} erfaring = niveau ${n + 1}`);
    assert.equal(niveauFor(xpTilNiveau(n + 1) - 1), n, 'ét point fra er stadig det gamle niveau');
  }
  assert.equal(niveauFor(1e9), MAKS_NIVEAU, 'niveauet stopper ved toplistens maks');
  assert.equal(niveauAndel(xpTilNiveau(3)), 0);
  assert.ok(niveauAndel(xpTilNiveau(3) + 1) > 0);
  assert.equal(niveauAndel(1e9), 1);
});

test('beloen fortæller, når katten er steget et niveau', () => {
  const kat = nyKat('Mis', 'pels-graa', 0);
  kat.xp = xpTilNiveau(2) - 1;
  const r = beloen(kat, 30);
  assert.equal(r.nytNiveau, true);
  assert.equal(r.niveau, 2);
  assert.equal(beloen(kat, 0).nytNiveau, false, 'ingenting sker der ikke noget ved');
});

test('butikken: man kan ikke købe det, man ikke har råd til', () => {
  const kat = nyKat('Mis', 'pels-graa', 0);
  const krone = tingen('hat-krone');
  kat.moenter = krone.pris - 1;
  assert.equal(koeb(kat, 'hat-krone'), false, 'der mangler en mønt');
  assert.equal(kat.hat, null);
  kat.moenter = krone.pris;
  assert.equal(koeb(kat, 'hat-krone'), true);
  assert.equal(kat.moenter, 0, 'kronen er betalt');
  assert.equal(kat.hat, 'hat-krone', 'og taget på med det samme');
  assert.equal(koeb(kat, 'hat-krone'), false, 'man køber den ikke to gange');

  // Hat og halsbånd kan tages af igen; pelsen beholder katten
  tagPaa(kat, 'hat-krone');
  assert.equal(kat.hat, null, 'et tryk mere tager hatten af');
  tagPaa(kat, 'hat-krone');
  assert.equal(kat.hat, 'hat-krone');
  tagPaa(kat, GRATIS_PELSE[1]);
  assert.equal(kat.pels, GRATIS_PELSE[1]);
  tagPaa(kat, GRATIS_PELSE[1]);
  assert.equal(kat.pels, GRATIS_PELSE[1], 'pelsen kan man ikke tage af');
  assert.equal(tagPaa(kat, 'baand-guld'), false, 'man kan ikke tage noget på, man ikke ejer');
});

test('alle ting i butikken er hele, og de gratis pelse er der at vælge imellem', () => {
  const ider = new Set();
  for (const t of TING) {
    assert.match(t.id, /^[a-z-]+$/, 'id skal kunne stå i localStorage og i en test');
    assert.ok(['pels', 'hat', 'halsbaand'].includes(t.slags), `${t.id}: ukendt slags`);
    assert.ok(t.navn.length > 2 && t.navn.length < 20, `${t.id}: navnet skal kunne stå i butikken`);
    assert.ok(Number.isInteger(t.pris) && t.pris >= 0 && t.pris <= 200, `${t.id}: prisen skal kunne tjenes`);
    assert.equal(ider.has(t.id), false, `${t.id} står to gange`);
    ider.add(t.id);
  }
  assert.equal(GRATIS_PELSE.length, 3, 'tre killinger at vælge imellem på startskærmen');
  for (const id of GRATIS_PELSE) assert.equal(tingen(id).pris, 0);
  assert.equal(ejer(nyKat('Mis'), GRATIS_PELSE[2]), true, 'gratis ting ejer man altid');
  assert.equal(ejer(nyKat('Mis'), 'hat-krone'), false);
});

test('humøret følger med, når noget mangler', () => {
  const kat = nyKat('Mis', 'pels-graa', 0);
  kat.behov = { mad: 90, leg: 90, renhed: 90, energi: 90 };
  assert.equal(humoer(kat), 'glad');
  kat.behov.leg = 50;
  assert.equal(humoer(kat), 'glad', 'et behov halvvejs nede ødelægger ikke dagen');
  kat.behov.leg = 30;
  assert.equal(humoer(kat), 'okay', 'men gennemsnittet alene bestemmer ikke humøret');
  assert.equal(mestTraengende(kat), 'leg');
  kat.behov.leg = 10;
  assert.equal(humoer(kat), 'ked', 'ét behov i bund er nok til at katten bliver ked af det');
  kat.sover = true;
  assert.equal(humoer(kat), 'sover');
});

test('katten kan gemmes og hentes igen – og tiden er gået imens', () => {
  const start = Date.UTC(2026, 8, 12, 12, 0, 0);
  const kat = nyKat('Mis', 'pels-sort', start);
  kat.moenter = 300;
  koeb(kat, 'hat-krone');
  koeb(kat, 'baand-klokke');
  plej(kat, 'leg', 20);

  const gemt = JSON.parse(JSON.stringify(serialiser(kat, start)));
  const senere = start + 3 * 3600 * 1000;
  const { kat: hentet, vaekSek } = laes(gemt, senere);
  assert.equal(vaekSek, 3 * 3600, 'tre timer er gået');
  assert.equal(hentet.navn, 'Mis');
  assert.equal(hentet.pels, 'pels-sort');
  assert.equal(hentet.hat, 'hat-krone');
  assert.equal(hentet.halsbaand, 'baand-klokke');
  assert.deepEqual(hentet.ejer, kat.ejer);
  assert.equal(hentet.xp, kat.xp);
  assert.equal(hentet.moenter, kat.moenter);
  assert.ok(Math.abs(hentet.behov.mad - (kat.behov.mad - 3 * FORFALD.mad)) < 1e-6, 'sulten er kommet imens');
  assert.equal(alderDage(hentet, senere + 86400000), 1, 'katten har fødselsdag');
});

test('en sovende kat sover ud, mens man er væk', () => {
  const start = Date.UTC(2026, 8, 12, 12, 0, 0);
  const kat = nyKat('Mis', 'pels-graa', start);
  kat.behov.energi = 10;
  kat.sover = true;
  const { kat: hentet } = laes(serialiser(kat, start), start + 3600 * 1000);
  assert.equal(hentet.behov.energi, 100, 'den er udhvilet');
  assert.equal(hentet.sover, false, 'og er stået op igen');
});

test('ødelagte gemte data koster ikke katten livet', () => {
  const nu = Date.UTC(2026, 8, 12, 12, 0, 0);
  assert.equal(laes(null, nu), null);
  assert.equal(laes({}, nu), null);
  assert.equal(laes('pjat', nu), null);
  const { kat } = laes({
    navn: 'Mis', pels: 'ukendt-pels', hat: 'hat-krone', halsbaand: 'findes-ikke',
    ejer: ['hat-hue', 'sludder'], xp: 'nej', moenter: -5,
    behov: { mad: 'x', leg: 300, renhed: -50 }, foedt: nu + 1e9, sidst: 'i går',
  }, nu);
  assert.equal(kat.pels, GRATIS_PELSE[0], 'ukendt pels bliver til standardpelsen');
  assert.equal(kat.hat, null, 'man kan ikke snyde sig til en krone, man ikke ejer');
  assert.equal(kat.halsbaand, null);
  assert.deepEqual(kat.ejer, ['hat-hue'], 'ting der ikke findes, ryger ud');
  assert.equal(kat.xp, 0);
  assert.equal(kat.moenter, 0);
  assert.equal(kat.behov.mad, 50);
  assert.equal(kat.behov.leg, 100);
  assert.equal(kat.behov.renhed, 0);
  assert.equal(kat.foedt, nu, 'en fødselsdag ude i fremtiden er ikke til at bruge');
});

test('velkomsten fortæller, hvordan det er gået', () => {
  const nu = Date.UTC(2026, 8, 12, 12, 0, 0);
  const kat = nyKat('Mis', 'pels-graa', nu);
  assert.equal(velkomst(kat, 10), null, 'har man lige været her, siges der ingenting');
  kat.behov = { mad: 80, leg: 80, renhed: 80, energi: 80 };
  assert.match(velkomst(kat, 3 * 3600), /Mis har haft det fint i 3 timer/);
  kat.behov.mad = 12;
  assert.match(velkomst(kat, 4 * 3600), /Mis har savnet dig i 4 timer og er godt sulten/);
  kat.behov.mad = 12;
  assert.match(velkomst(kat, 600), /10 minutter/);
});
