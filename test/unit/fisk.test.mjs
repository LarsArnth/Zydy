// Motoren bag «Fiskedybet»: farvandene, kampen på baren, uhyrerne, økonomien
// og det gemte spil. Ingen browser – kør med `node --test test/unit/*.test.mjs`.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ZONER, ARTER, OPGRADERINGER, MAKS_NIVEAU, LAST_PLADSER, REPARATION_PRIS,
  arten, arterIZone, zonen, nytSpil, froe, traek, bidAf, vaerdiFor,
  nyKamp, kampSkridt, kampTryk, rammer, vindue, land, sejl, saelg, koeb, prisFor,
  reparer, reparationsPris, skade, laastOp, maksSkrog, maksLast, lastVaerdi,
  arterFanget, serialiser, laes, vaegtTekst, moentTekst,
} from '../../public/spil/fisk/hav.mjs';

/** Et spil, hvor alt er købt fri – så en test kan komme hurtigt i dybet. */
function rigtSpil(zone = 'sol') {
  const spil = nytSpil();
  for (const o of OPGRADERINGER) spil.opgradering[o.id] = MAKS_NIVEAU;
  spil.skrog = maksSkrog(spil);
  spil.moenter = 100000;
  spil.sted = zone;
  return spil;
}

/** Spiller en kamp færdig ved altid at trykke, når viseren er i det grønne. */
function spilKamp(kamp, r, maksSkridt = 20000) {
  for (let i = 0; i < maksSkridt && !kamp.slut; i++) {
    if (rammer(kamp)) kampTryk(kamp, r);
    else kampSkridt(kamp, 1 / 60);
  }
  return kamp.slut;
}

/* ---------- Farvandene og dyrene ---------- */

test('hvert farvand har dyr, og de dybe kræver en længere snøre', () => {
  ZONER.forEach((z, i) => {
    assert.equal(z.krav, i, `${z.id}: farvandene låses op ét ad gangen`);
    assert.ok(arterIZone(z.id).length >= 5, `${z.id} har for få dyr`);
  });
  assert.equal(ZONER[0].krav, 0, 'det første farvand er gratis');
});

test('dyrene er beskrevet, så både kampen og tegningen kan bruge dem', () => {
  assert.equal(new Set(ARTER.map(a => a.id)).size, ARTER.length, 'to arter med samme id');
  for (const a of ARTER) {
    assert.ok(zonen(a.zone), `${a.id}: ukendt farvand ${a.zone}`);
    assert.ok(a.navn.length > 2, `${a.id}: mangler navn`);
    assert.ok(a.pris > 0 && a.chance > 0, `${a.id}: pris og chance skal være positive`);
    assert.ok(a.vaegt[0] > 0 && a.vaegt[1] > a.vaegt[0], `${a.id}: vægtene skal give mening`);
    assert.ok(a.kamp >= 1 && a.kamp <= 5, `${a.id}: kampen skal være 1-5 rammere`);
    assert.ok(a.vindue > 0.05 && a.vindue < 0.6, `${a.id}: vinduet skal kunne rammes`);
  }
});

test('det bliver dyrere og farligere, jo længere man kommer ud', () => {
  const snit = z => arterIZone(z).reduce((s, a) => s + a.pris, 0) / arterIZone(z).length;
  for (let i = 1; i < ZONER.length; i++) {
    assert.ok(snit(ZONER[i].id) > snit(ZONER[i - 1].id) * 1.5,
      `${ZONER[i].id} betaler ikke nok til at det er værd at sejle derud`);
  }
  assert.equal(arterIZone('sol').some(a => a.uhyre), false, 'Solskinshavet er trygt');
  for (const z of ZONER.slice(1)) {
    assert.equal(arterIZone(z.id).filter(a => a.uhyre).length, 1, `${z.id} skal have ét uhyre`);
  }
});

test('værdien følger vægten: en stor fisk af samme art er mere værd', () => {
  const a = arten('torsk');
  assert.ok(vaerdiFor(a, a.vaegt[1]) > vaerdiFor(a, a.vaegt[0]) * 1.5);
  assert.ok(vaerdiFor(a, a.vaegt[0]) >= 1, 'selv den mindste er noget værd');
});

/* ---------- Hvad der hugger ---------- */

test('der hugger kun dyr fra det farvand, båden ligger i', () => {
  const r = froe(7);
  for (const z of ZONER) {
    const spil = rigtSpil(z.id);
    for (let i = 0; i < 200; i++) {
      const bid = traek(spil, r);
      assert.equal(arten(bid.art).zone, z.id, `${bid.art} hører ikke til i ${z.id}`);
      assert.ok(bid.vaegt > 0 && bid.vaerdi > 0);
    }
  }
  assert.equal(traek(nytSpil(), r), null, 'i havnen hugger der ingenting');
});

test('de sjældne er sjældne, og de rigtig store er sjældnere end de små', () => {
  const r = froe(11);
  const spil = rigtSpil('sol');
  const tal = {};
  const vaegte = [];
  for (let i = 0; i < 4000; i++) {
    const bid = traek(spil, r);
    tal[bid.art] = (tal[bid.art] || 0) + 1;
    if (bid.art === 'torsk') vaegte.push(bid.vaegt);
  }
  assert.ok(tal.sild > tal.havbars * 4, 'sild skal være langt mere almindelige end havbars');
  const t = arten('torsk');
  const store = vaegte.filter(v => v > (t.vaegt[0] + t.vaegt[1]) / 2).length;
  assert.ok(store < vaegte.length / 3, 'de store torsk må ikke være hverdagskost');
});

test('det samme frø giver den samme tur', () => {
  const en = [], to = [];
  for (const liste of [en, to]) {
    const r = froe(99), spil = rigtSpil('dyb');
    for (let i = 0; i < 20; i++) liste.push(traek(spil, r));
  }
  assert.deepEqual(en, to);
});

/* ---------- Kampen ---------- */

test('viseren løber frem og tilbage inden for baren', () => {
  const r = froe(3);
  const kamp = nyKamp(rigtSpil('haj'), bidAf(arten('tun'), r), r);
  let vendt = 0, sidst = kamp.retning;
  for (let i = 0; i < 600; i++) {
    kampSkridt(kamp, 1 / 60);
    assert.ok(kamp.pos >= 0 && kamp.pos <= 1, 'viseren må ikke løbe ud over baren');
    if (kamp.retning !== sidst) { vendt++; sidst = kamp.retning; }
  }
  assert.ok(vendt >= 2, 'den skal vende ved enderne');
});

test('rammer man det grønne felt nok gange, er fisken hjemme', () => {
  const r = froe(5);
  const spil = rigtSpil('sol');
  const kamp = nyKamp(spil, bidAf(arten('makrel'), r), r);
  assert.equal(spilKamp(kamp, r), 'vundet');
  assert.equal(kamp.ramt, arten('makrel').kamp);
  assert.equal(kamp.fejl, 0, 'et tryk i det grønne er aldrig en fejl');
});

test('det grønne felt flytter sig, hver gang man rammer', () => {
  const r = froe(6);
  const spil = rigtSpil('haj');
  const kamp = nyKamp(spil, bidAf(arten('sverdfisk'), r), r);
  const maal = [kamp.maal];
  while (!kamp.slut) {
    if (rammer(kamp)) { kampTryk(kamp, r); maal.push(kamp.maal); }
    else kampSkridt(kamp, 1 / 60);
  }
  assert.ok(new Set(maal).size > 1, 'ellers kunne man bare trykke i takt');
});

test('for mange forbiere, og fisken slipper væk', () => {
  const r = froe(8);
  const spil = rigtSpil('sol');
  const kamp = nyKamp(spil, bidAf(arten('torsk'), r), r);
  let forbi = 0;
  while (!kamp.slut) {
    if (!rammer(kamp)) { assert.equal(kampTryk(kamp, r), 'forbi'); forbi++; }
    else kampSkridt(kamp, 1 / 60);
  }
  assert.equal(kamp.slut, 'tabt');
  assert.equal(forbi, kamp.maksFejl);
});

test('et uhyre tåler færre forbiere end en fisk', () => {
  const r = froe(9);
  const spil = rigtSpil('haj');
  const fisk = nyKamp(spil, bidAf(arten('tun'), r), r);
  const uhyre = nyKamp(spil, bidAf(arten('hvidhaj'), r), r);
  assert.ok(uhyre.maksFejl < fisk.maksFejl);
  assert.equal(uhyre.uhyre, true);
  assert.equal(fisk.uhyre, false);
});

test('kampen giver op af sig selv, hvis man aldrig trykker', () => {
  const r = froe(10);
  const kamp = nyKamp(rigtSpil('sol'), bidAf(arten('sild'), r), r);
  for (let i = 0; i < 60 * 60 && !kamp.slut; i++) kampSkridt(kamp, 1 / 60);
  assert.equal(kamp.slut, 'tabt', 'ellers ville spillet stå stille for evigt');
  assert.ok(kamp.t <= kamp.maksTid + 0.1);
});

test('en bedre stang gør det grønne felt bredere – men ikke uendeligt', () => {
  const a = arten('tidsfisken');
  const daarlig = nytSpil(), god = rigtSpil();
  assert.ok(vindue(god, a) > vindue(daarlig, a));
  assert.ok(vindue(god, a) < 0.6);
});

/* ---------- Fangsten, bogen og lasten ---------- */

test('fangsten kommer i bogen og i lasten', () => {
  const r = froe(12);
  const spil = rigtSpil('sol');
  const kamp = nyKamp(spil, bidAf(arten('sild'), r), r);
  const et = land(spil, kamp);
  assert.deepEqual([et.nyArt, et.rekord, et.iLast], [true, true, true]);
  assert.equal(arterFanget(spil), 1);
  assert.equal(spil.last.length, 1);
  assert.equal(lastVaerdi(spil), kamp.vaerdi);

  const to = land(spil, { ...kamp, vaegt: kamp.vaegt - 0.01 });
  assert.equal(to.nyArt, false, 'anden sild er ikke en ny art');
  assert.equal(to.rekord, false, 'og den var mindre');
  assert.equal(spil.bog.sild.antal, 2);
});

test('en fuld last koster pengene, men aldrig arten i bogen', () => {
  const spil = nytSpil();                       // kølerum 0 = fire pladser
  spil.sted = 'sol';
  const r = froe(13);
  for (let i = 0; i < LAST_PLADSER[0]; i++) land(spil, nyKamp(spil, bidAf(arten('sild'), r), r));
  assert.equal(spil.last.length, maksLast(spil));
  const sidste = land(spil, nyKamp(spil, bidAf(arten('torsk'), r), r));
  assert.equal(sidste.iLast, false, 'der er ikke plads til flere');
  assert.equal(sidste.nyArt, true, 'men torsken står i bogen');
  assert.equal(spil.last.length, maksLast(spil));
});

/* ---------- Sejlads, salg og værksted ---------- */

test('man kan kun sejle så langt ud, som snøren rækker', () => {
  const spil = nytSpil();
  assert.equal(laastOp(spil, 'sol'), true);
  assert.equal(laastOp(spil, 'haj'), false);
  assert.equal(sejl(spil, 'haj'), false, 'Hajvandet kræver en længere snøre');
  assert.equal(sejl(spil, 'sol'), true);
  assert.equal(spil.ture, 1);
  spil.opgradering.snoer = 1;
  assert.equal(sejl(spil, 'haj'), true);
  assert.equal(sejl(spil, 'tomrum'), false, 'og der er lang vej til Tomrummet');
});

test('lasten sælges i havnen – ikke ude på vandet', () => {
  const r = froe(14);
  const spil = rigtSpil('haj');
  land(spil, nyKamp(spil, bidAf(arten('tun'), r), r));
  const vaerdi = lastVaerdi(spil);
  assert.deepEqual(saelg(spil), { antal: 0, moenter: 0 }, 'man kan ikke sælge midt på havet');
  spil.sted = 'havn';
  const foer = spil.moenter;
  const salg = saelg(spil);
  assert.equal(salg.antal, 1);
  assert.equal(salg.moenter, vaerdi);
  assert.equal(spil.moenter, foer + vaerdi);
  assert.equal(spil.tjent, vaerdi);
  assert.equal(spil.last.length, 0);
});

test('værkstedet lapper skroget for penge', () => {
  const spil = nytSpil();
  spil.moenter = 1000;
  assert.equal(reparationsPris(spil), 0, 'et helt skrog koster ingenting');
  assert.equal(reparer(spil), 0);
  skade(spil, 2);
  assert.equal(spil.skrog, 1);
  assert.equal(reparationsPris(spil), 2 * REPARATION_PRIS);
  spil.sted = 'sol';
  assert.equal(reparer(spil), 0, 'der er kun værksted i havnen');
  spil.sted = 'havn';
  assert.equal(reparer(spil), 2);
  assert.equal(spil.skrog, maksSkrog(spil));
  assert.equal(spil.moenter, 1000 - 2 * REPARATION_PRIS);
});

test('går skroget i nul, bliver man slæbt i havn og mister lasten', () => {
  const r = froe(15);
  const spil = rigtSpil('afgrund');
  land(spil, nyKamp(spil, bidAf(arten('tandmunden'), r), r));
  const arter = arterFanget(spil);
  spil.skrog = 2;
  assert.equal(skade(spil, 1).slaebt, false);
  const sidste = skade(spil, 1);
  assert.equal(sidste.slaebt, true);
  assert.equal(sidste.tabt, 1, 'fisken i lasten gik tabt');
  assert.ok(sidste.vaerdi > 0, 'og den var noget værd');
  assert.equal(spil.sted, 'havn');
  assert.equal(spil.skrog, maksSkrog(spil), 'båden er lappet, når man vågner i havnen');
  assert.equal(spil.last.length, 0);
  assert.equal(arterFanget(spil), arter, 'men bogen husker alt, man har fanget');
});

/* ---------- Butikken ---------- */

test('opgraderinger koster penge og giver mere båd', () => {
  const spil = nytSpil();
  assert.equal(koeb(spil, 'snoer'), false, 'der er ikke råd fra start');
  spil.moenter = 100000;
  const foerSkrog = maksSkrog(spil), foerLast = maksLast(spil);
  assert.equal(koeb(spil, 'skrog'), true);
  assert.equal(maksSkrog(spil), foerSkrog + 1);
  assert.equal(spil.skrog, foerSkrog + 1, 'det nye dæk er helt med det samme');
  assert.equal(koeb(spil, 'koelerum'), true);
  assert.ok(maksLast(spil) > foerLast);
  for (let i = 0; i < MAKS_NIVEAU; i++) koeb(spil, 'snoer');
  assert.equal(spil.opgradering.snoer, MAKS_NIVEAU);
  assert.equal(prisFor(spil, 'snoer'), null, 'snøren kan ikke blive længere');
  assert.equal(koeb(spil, 'snoer'), false);
  assert.equal(laastOp(spil, 'tomrum'), true, 'nu rækker den helt ud i Tomrummet');
});

test('priserne stiger for hvert trin', () => {
  for (const o of OPGRADERINGER) {
    assert.equal(o.priser.length, MAKS_NIVEAU + 1, `${o.id}: der skal være en pris pr. niveau`);
    assert.equal(o.priser[0], 0, `${o.id}: det første niveau har man i forvejen`);
    for (let i = 2; i <= MAKS_NIVEAU; i++) {
      assert.ok(o.priser[i] > o.priser[i - 1], `${o.id}: niveau ${i} skal koste mere end ${i - 1}`);
    }
  }
});

/* ---------- Gem og hent ---------- */

test('et gemt spil kommer tilbage, som man forlod det', () => {
  const r = froe(16);
  const spil = rigtSpil('afgrund');
  spil.moenter = 4321;
  land(spil, nyKamp(spil, bidAf(arten('bleg'), r), r));
  spil.skrog = 2;
  const igen = laes(JSON.parse(JSON.stringify(serialiser(spil))));
  assert.equal(igen.moenter, 4321);
  assert.equal(igen.sted, 'afgrund');
  assert.equal(igen.skrog, 2);
  assert.equal(igen.last.length, 1);
  assert.equal(arterFanget(igen), 1);
  assert.deepEqual(igen.opgradering, spil.opgradering);
});

test('noget vrøvl i localStorage koster ikke båden', () => {
  assert.equal(laes(null), null);
  assert.equal(laes('nej'), null);
  const spil = laes({ moenter: 'mange', skrog: 99, sted: 'tomrum', opgradering: { snoer: 12 }, last: [{ art: 'findes-ikke' }], bog: { sild: { antal: 'to' }, ost: { antal: 3 } } });
  assert.equal(spil.moenter, 15, 'et ulæseligt beløb bliver til startbeløbet');
  assert.equal(spil.opgradering.snoer, MAKS_NIVEAU, 'og et alt for højt niveau klippes til');
  assert.ok(spil.skrog <= maksSkrog(spil));
  assert.equal(spil.last.length, 0, 'ukendte fisk smides ud');
  assert.equal(arterFanget(spil), 1, 'og kun arter, der findes, står i bogen');
});

test('et gemt sted, man ikke længere kan nå, bliver til havnen', () => {
  const spil = laes({ sted: 'tomrum', opgradering: { snoer: 0 } });
  assert.equal(spil.sted, 'havn');
});

/* ---------- Tekst ---------- */

test('vægt og mønter kan læses af et barn', () => {
  assert.equal(vaegtTekst(0.24), '240 g');
  assert.equal(vaegtTekst(2.35), '2,4 kg');
  assert.equal(vaegtTekst(430.2), '430 kg');
  assert.equal(moentTekst(12400), '12.400');
  assert.equal(moentTekst(7), '7');
});
