// Legebyens motor: rummene, figurerne, tingene og hvad der sker, når de mødes.
// Ingen browser – alt her kan afgøres uden at tegne noget.
//
// Kør:  node --test test/unit/legebyen.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BREDDE, HOEJDE, GULV, LOFT, KANT, TASKE_MAKS, TING_MAKS_PR_STED,
  HUD, HAAR_FARVER, HAAR_STIL, TOEJ_FARVER, TOEJ_FELTER, STEDER, TING, FIGURER,
  stedet, tingen, moeblet, figurerI, tingI,
  nyBy, frem, flytTing, fjernTing, ryd, iTasken, afTasken,
  flytFigur, hentHertil, naermesteSaede, saetToej, puf, tagAf, brugPaa, brugMoebel,
  serialiser, laes,
} from '../../public/spil/legebyen/by.mjs';

/* ---------- Data: at byen hænger sammen ---------- */

test('stederne har det, spillet skal bruge, og alt peger på noget der findes', () => {
  assert.ok(STEDER.length >= 5, 'der skal være rum nok til at gå på besøg');
  assert.equal(new Set(STEDER.map(s => s.id)).size, STEDER.length, 'to steder med samme id');
  for (const s of STEDER) {
    assert.ok(s.navn && s.emoji, `${s.id}: mangler navn eller mærke`);
    assert.ok(s.hylde.length >= 3, `${s.id}: der skal være mindst tre ting at tage frem`);
    for (const id of s.hylde) assert.ok(tingen(id), `${s.id}: hylden har en ukendt ting «${id}»`);
    assert.equal(new Set(s.saeder.map(a => a.id)).size, s.saeder.length, `${s.id}: to sæder med samme id`);
    for (const sæde of s.saeder) {
      assert.ok(sæde.x >= KANT && sæde.x <= BREDDE - KANT, `${s.id}/${sæde.id}: sædet ligger uden for rummet`);
      assert.ok(sæde.y >= LOFT && sæde.y <= GULV, `${s.id}/${sæde.id}: man kan ikke sidde dér`);
    }
    for (const m of s.moebler) {
      assert.ok(m.navn && m.tekst.length >= 1, `${m.id}: et møbel skal kunne sige noget`);
      assert.ok(m.x > 0 && m.x < BREDDE && m.y > 0 && m.y < HOEJDE, `${m.id}: møblet står uden for rummet`);
      if (m.virkning === 'frem') for (const id of m.giver) assert.ok(tingen(id), `${m.id} kan give en ukendt ting «${id}»`);
      if (m.virkning === 'taend') assert.equal(m.tekst.length, 2, `${m.id}: en kontakt skal have tekst til både tændt og slukket`);
      if (m.virkning === 'gynge' || m.virkning === 'rutsje') {
        assert.ok(s.saeder.some(a => a.id === m.saede), `${m.id}: peger på et sæde, der ikke findes`);
        assert.equal(m.tekst.length, 2, `${m.id}: der skal også være en tekst til, når ingen sidder der`);
      }
    }
  }
});

test('tingene har en slags, spillet kender', () => {
  assert.equal(new Set(TING.map(t => t.id)).size, TING.length, 'to ting med samme id');
  for (const t of TING) {
    assert.ok(['mad', 'hat', 'briller', 'haand'].includes(t.slags), `${t.id}: ukendt slags «${t.slags}»`);
    assert.match(t.farve, /^#[0-9a-f]{6}$/i, `${t.id}: mangler en farve at tegne med`);
    assert.ok(t.navn.length > 1 && t.navn.length < 16, `${t.id}: navnet skal kunne stå på en lille brik`);
  }
  // Der skal være noget af hver slags – ellers er der en hylde, der ikke giver mening.
  for (const slags of ['mad', 'hat', 'briller', 'haand']) {
    assert.ok(TING.some(t => t.slags === slags), `der er ingen ting af slagsen ${slags}`);
  }
});

test('figurerne bor i rum, der findes, og har lovligt tøj på', () => {
  for (const f of FIGURER) {
    assert.ok(stedet(f.sted), `${f.id}: bor i et rum, der ikke findes`);
    assert.ok(HAAR_STIL.includes(f.haar), `${f.id}: ukendt frisure`);
    assert.ok(f.hud < HUD.length && f.haarfarve < HAAR_FARVER.length, `${f.id}: farve uden for listen`);
    assert.ok(f.troeje < TOEJ_FARVER.length && f.buks < TOEJ_FARVER.length, `${f.id}: tøjfarve uden for listen`);
  }
  assert.ok(new Set(FIGURER.map(f => f.sted)).size >= 3, 'figurerne skal være spredt ud, så der er nogen at finde');
  assert.equal(TOEJ_FELTER.length, 5, 'der er fem ting, man kan skifte');
});

/* ---------- En ny by ---------- */

test('en ny by har alle figurer, lidt legetøj fremme og en tom taske', () => {
  const by = nyBy();
  assert.equal(Object.keys(by.figurer).length, FIGURER.length);
  assert.equal(by.sted, 'stue');
  assert.equal(by.taske.length, 0);
  assert.ok(by.ting.length >= 3, 'der ligger noget fremme fra begyndelsen');
  assert.equal(by.figurer.mig.navn, 'Mig');
  assert.equal(by.figurer.vaks.dyr, true);
  for (const f of Object.values(by.figurer)) assert.equal(f.y, GULV, `${f.id} står på gulvet`);
});

test('«Mig» får navnet fra forsiden, hvis vi kender det', () => {
  assert.equal(nyBy('Selma').figurer.mig.navn, 'Selma');
  assert.equal(nyBy('   ').figurer.mig.navn, 'Mig', 'mellemrum er ikke et navn');
  assert.equal(nyBy('Etmegetlangtnavn').figurer.mig.navn, 'Etmegetlangt', 'navnet klippes til 12 tegn som på toplisten');
});

/* ---------- Løse ting ---------- */

test('en ting lægges dér, hvor fingeren slap den – men aldrig uden for rummet', () => {
  const by = nyBy();
  const t = frem(by, 'aeble', 'stue', 400, -50);
  assert.equal(t.x, BREDDE - KANT, 'x holdes inden for kanten');
  assert.equal(t.y, LOFT, 'y holdes under loftet');
  assert.equal(frem(by, 'findes-ikke', 'stue', 40), null);
  assert.equal(frem(by, 'aeble', 'månen', 40), null);
});

test('for mange ting i ét rum rydder den ældste væk', () => {
  const by = nyBy();
  ryd(by, 'butik');
  for (let i = 0; i < TING_MAKS_PR_STED + 5; i++) frem(by, 'bold', 'butik', 20 + i);
  assert.equal(tingI(by, 'butik').length, TING_MAKS_PR_STED, 'der ligger højst så mange, man kan se');
  assert.equal(tingI(by, 'stue').length, 1, 'de andre rum er urørte');
});

test('ryd op tømmer ét rum og ikke de andre', () => {
  const by = nyBy();
  frem(by, 'bold', 'stue', 40);
  const iStuen = tingI(by, 'stue').length;
  assert.equal(ryd(by, 'stue'), iStuen);
  assert.equal(tingI(by, 'stue').length, 0);
  assert.ok(tingI(by, 'bad').length > 0, 'badeværelset er som før');
});

/* ---------- Tasken ---------- */

test('tasken kan tage ting med ind i et andet rum – og bliver ikke bundløs', () => {
  const by = nyBy();
  const t = frem(by, 'kage', 'koekken', 50);
  const svar = iTasken(by, t.n);
  assert.equal(svar.ok, true);
  assert.match(svar.besked, /Lagkage/);
  assert.deepEqual(by.taske, ['kage']);
  assert.equal(by.ting.some(a => a.n === t.n), false, 'den ligger ikke længere i køkkenet');

  const ny = afTasken(by, 'kage', 'legeplads', 60);
  assert.equal(ny.sted, 'legeplads');
  assert.deepEqual(by.taske, []);
  assert.equal(afTasken(by, 'kage', 'legeplads', 60), null, 'man kan ikke tage den op to gange');

  for (let i = 0; i < TASKE_MAKS + 2; i++) {
    const x = frem(by, 'bold', 'stue', 30 + i);
    iTasken(by, x.n);
  }
  assert.equal(by.taske.length, TASKE_MAKS, 'der er kun plads til seks');
  const sidst = frem(by, 'bold', 'stue', 99);
  assert.match(iTasken(by, sidst.n).besked, /fuld/);
  assert.ok(by.ting.some(a => a.n === sidst.n), 'den bliver liggende, når tasken er fuld');
});

/* ---------- Figurerne ---------- */

test('en figur, man slipper midt på gulvet, lander på gulvet', () => {
  const by = nyBy();
  const f = flytFigur(by, 'mig', 90, 40);
  assert.equal(f.x, 90);
  assert.equal(f.y, GULV, 'ingen bliver hængende i luften');
  assert.equal(f.saede, null);
  assert.equal(flytFigur(by, 'mig', 999, 999).x, BREDDE - KANT, 'også inden for kanten');
});

test('slipper man tæt på et sæde, sætter figuren sig – men ikke i skødet på en anden', () => {
  const by = nyBy();
  const sofa = stedet('stue').saeder[0];
  const f = flytFigur(by, 'mig', sofa.x + 3, sofa.y + 2);
  assert.equal(f.saede, sofa.id);
  assert.equal(f.x, sofa.x);
  assert.equal(f.y, sofa.y);

  const anden = flytFigur(by, 'noah', sofa.x, sofa.y);
  assert.notEqual(anden.saede, sofa.id, 'sofapladsen var optaget');
  assert.equal(naermesteSaede(by, 'stue', sofa.x, sofa.y), null, 'og der er ikke noget ledigt sæde lige dér');

  // Flytter den første væk, bliver pladsen ledig igen
  flytFigur(by, 'mig', 100, GULV);
  assert.equal(by.figurer.mig.saede, null);
  assert.equal(naermesteSaede(by, 'stue', sofa.x, sofa.y).id, sofa.id);
});

test('man kan hente en ven ind i det rum, man står i', () => {
  const by = nyBy();
  assert.equal(by.figurer.zak.sted, 'legeplads');
  hentHertil(by, 'zak', 'koekken', 70);
  assert.equal(by.figurer.zak.sted, 'koekken');
  assert.equal(figurerI(by, 'koekken').some(f => f.id === 'zak'), true);
  assert.equal(hentHertil(by, 'findes-ikke'), null);
});

test('tøjet kan skiftes – men kun til noget, der findes', () => {
  const by = nyBy();
  assert.equal(saetToej(by, 'mig', 'troeje', 4), true);
  assert.equal(by.figurer.mig.troeje, 4);
  assert.equal(saetToej(by, 'mig', 'haar', 2), true);
  assert.equal(by.figurer.mig.haar, HAAR_STIL[2]);
  assert.equal(saetToej(by, 'mig', 'troeje', TOEJ_FARVER.length), false, 'uden for listen');
  assert.equal(saetToej(by, 'mig', 'troeje', -1), false);
  assert.equal(saetToej(by, 'mig', 'næse', 0), false, 'der findes ikke et sådant felt');
  assert.equal(saetToej(by, 'ingen', 'troeje', 1), false);
});

test('et puf får figuren til at sige noget – og hunden siger vuf', () => {
  const by = nyBy();
  assert.ok(puf(by, 'mig', () => 0).length > 1);
  assert.match(puf(by, 'vaks', () => 0), /[Vv]uf/);
  assert.equal(puf(by, 'ingen'), '');
  assert.equal(by.figurer.mig.humoer, 'glad');
});

/* ---------- Når en ting møder en figur ---------- */

test('mad bliver spist og forsvinder', () => {
  const by = nyBy();
  const svar = brugPaa(by, 'aeble', 'mig');
  assert.equal(svar.ok, true);
  assert.equal(svar.virkning, 'spis');
  assert.match(svar.besked, /Mig spiser æble/);
  assert.equal(by.figurer.mig.haand, null, 'maden bliver ikke hængende i hånden');
});

test('hat, briller og legetøj sætter sig, hvor de hører hjemme', () => {
  const by = nyBy();
  assert.equal(brugPaa(by, 'krone', 'mig').virkning, 'hat');
  assert.equal(by.figurer.mig.hat, 'krone');
  assert.equal(brugPaa(by, 'solbriller', 'mig').virkning, 'briller');
  assert.equal(by.figurer.mig.briller, 'solbriller');
  assert.equal(brugPaa(by, 'bold', 'mig').virkning, 'haand');
  assert.equal(by.figurer.mig.haand, 'bold');
  assert.equal(brugPaa(by, 'saebe', 'mig').virkning, 'boble', 'sæben giver bobler');
  assert.equal(brugPaa(by, 'findes-ikke', 'mig').ok, false);
  assert.equal(brugPaa(by, 'bold', 'ingen').ok, false);
});

test('det, man havde på i forvejen, falder på gulvet – intet forsvinder bare', () => {
  const by = nyBy();
  by.sted = 'stue';
  flytFigur(by, 'mig', 60, GULV);
  ryd(by, 'stue');
  brugPaa(by, 'krone', 'mig');
  brugPaa(by, 'kasket', 'mig');
  assert.equal(by.figurer.mig.hat, 'kasket');
  assert.deepEqual(tingI(by, 'stue').map(t => t.id), ['krone'], 'kronen ligger på gulvet i stuen');
});

test('den samme ting én gang til tager den af igen', () => {
  const by = nyBy();
  ryd(by, 'stue');
  brugPaa(by, 'kasket', 'mig');
  const svar = brugPaa(by, 'kasket', 'mig');
  assert.equal(svar.virkning, 'af');
  assert.equal(by.figurer.mig.hat, null);
  assert.deepEqual(tingI(by, 'stue').map(t => t.id), ['kasket']);
});

test('tagAf lægger tingen ved siden af figuren', () => {
  const by = nyBy();
  ryd(by, 'stue');
  brugPaa(by, 'bamse', 'mig');
  const t = tagAf(by, 'mig', 'haand');
  assert.equal(t.id, 'bamse');
  assert.equal(t.sted, 'stue');
  assert.equal(by.figurer.mig.haand, null);
  assert.equal(tagAf(by, 'mig', 'haand'), null, 'der er ikke mere at tage af');
  assert.equal(tagAf(by, 'mig', 'næse'), null);
});

/* ---------- Møblerne ---------- */

test('køleskabet giver noget at spise, komfuret en pizza', () => {
  const by = nyBy();
  by.sted = 'koekken';
  const foer = tingI(by, 'koekken').length;
  const svar = brugMoebel(by, 'koeleskab', () => 0);
  assert.equal(svar.ok, true);
  assert.ok(svar.ny, 'der kom noget frem');
  assert.equal(tingen(svar.ny.id).slags, 'mad');
  assert.equal(tingI(by, 'koekken').length, foer + 1);
  assert.equal(brugMoebel(by, 'komfur', () => .99).ny.id, 'pizza');
  assert.equal(brugMoebel(by, 'tv', () => 0).ok, false, 'fjernsynet står ikke i køkkenet');
});

test('en kontakt tænder og slukker', () => {
  const by = nyBy();
  by.sted = 'stue';
  const paa = brugMoebel(by, 'tv');
  assert.equal(paa.taendt, true);
  assert.equal(by.taendt.tv, true);
  assert.equal(brugMoebel(by, 'tv').taendt, false);
  assert.equal(by.taendt.tv, false);
});

test('gyngen og rutsjebanen kræver, at der sidder en', () => {
  const by = nyBy();
  by.sted = 'legeplads';
  const tom = brugMoebel(by, 'gyngen');
  assert.equal(tom.ok, false);
  assert.match(tom.besked, /gyngen/i);

  const gynge = stedet('legeplads').saeder.find(s => s.id === 'gynge');
  flytFigur(by, 'zak', gynge.x, gynge.y);
  assert.equal(by.figurer.zak.saede, 'gynge');
  assert.equal(brugMoebel(by, 'gyngen').figur.id, 'zak');

  const top = stedet('legeplads').saeder.find(s => s.id === 'rutsje');
  flytFigur(by, 'mig', top.x, top.y, 'legeplads');
  assert.equal(by.figurer.mig.saede, 'rutsje');
  const ned = brugMoebel(by, 'rutsjebanen');
  assert.equal(ned.ok, true);
  assert.equal(by.figurer.mig.saede, null, 'man ender på jorden');
  assert.equal(by.figurer.mig.y, GULV);
  assert.ok(by.figurer.mig.x > top.x, 'og et stykke længere henne');
});

test('spejlet siger bare noget pænt', () => {
  const by = nyBy();
  by.sted = 'bad';
  const svar = brugMoebel(by, 'spejl');
  assert.equal(svar.ok, true);
  assert.equal(svar.besked, moeblet('bad', 'spejl').tekst[0]);
  assert.equal(brugMoebel(by, 'findes-ikke').ok, false);
});

/* ---------- Gem og hent ---------- */

test('byen kan gemmes og hentes igen, præcis som den stod', () => {
  const by = nyBy('Selma');
  by.sted = 'butik';
  brugPaa(by, 'krone', 'bedste');
  brugPaa(by, 'bold', 'zak');
  saetToej(by, 'mig', 'troeje', 6);
  hentHertil(by, 'vaks', 'butik', 40);
  const baenk = stedet('butik').saeder[0];
  flytFigur(by, 'bedste', baenk.x, baenk.y);
  const t = frem(by, 'is', 'butik', 88);
  iTasken(by, t.n);
  brugMoebel(by, 'tv', () => 0);           // står i stuen, så den skal ikke tændes herfra
  by.sted = 'stue';
  brugMoebel(by, 'tv', () => 0);

  const igen = laes(JSON.parse(JSON.stringify(serialiser(by))), 'Selma');
  assert.equal(igen.sted, 'stue');
  assert.equal(igen.figurer.mig.navn, 'Selma');
  assert.equal(igen.figurer.mig.troeje, 6);
  assert.equal(igen.figurer.bedste.hat, 'krone');
  assert.equal(igen.figurer.bedste.saede, baenk.id);
  assert.equal(igen.figurer.zak.haand, 'bold');
  assert.equal(igen.figurer.vaks.sted, 'butik');
  assert.deepEqual(igen.taske, ['is']);
  assert.equal(igen.taendt.tv, true);
  assert.deepEqual(
    igen.ting.map(t => [t.id, t.sted, t.x]).sort(),
    by.ting.map(t => [t.id, t.sted, t.x]).sort(),
    'alt det løse ligger samme sted som før');
});

test('en gemt by, der er noget galt med, vælter ikke spillet', () => {
  assert.equal(laes(null), null);
  assert.equal(laes('pjat'), null);
  assert.equal(laes({}), null);

  const by = laes({
    sted: 'et sted der ikke findes',
    figurer: {
      mig: { navn: '', sted: 'månen', x: 'ni', y: -400, haar: 'punk', troeje: 99, hud: -3, hat: 'bold', haand: 'krone', briller: 'aeble', saede: 'sofa-v' },
      ukendt: { navn: 'Spøgelse', sted: 'stue' },
    },
    ting: [{ id: 'aeble', sted: 'stue', x: 40, y: GULV }, { id: 'noget-fjams', sted: 'stue', x: 1 }, null],
    taske: ['bold', 'fis', 'bold', 'bold', 'bold', 'bold', 'bold', 'bold'],
    taendt: { tv: true, ingenting: true },
  });
  assert.equal(by.sted, 'stue', 'et ukendt rum bliver til stuen');
  assert.equal(by.figurer.mig.navn, 'Mig', 'et tomt navn falder tilbage til standarden');
  assert.equal(by.figurer.mig.sted, 'stue');
  assert.ok(by.figurer.mig.x >= KANT && by.figurer.mig.x <= BREDDE - KANT);
  assert.ok(HAAR_STIL.includes(by.figurer.mig.haar));
  assert.ok(by.figurer.mig.troeje < TOEJ_FARVER.length && by.figurer.mig.hud >= 0);
  assert.equal(by.figurer.mig.hat, null, 'en bold er ikke en hat');
  assert.equal(by.figurer.mig.haand, null, 'en krone er ikke noget, man holder i hånden');
  assert.equal(by.figurer.mig.briller, null);
  assert.equal(by.figurer.mig.saede, 'sofa-v', 'sædet var lovligt og huskes');
  assert.equal(by.figurer.ukendt, undefined, 'en figur, vi ikke har, kommer ikke med');
  assert.deepEqual(by.ting.map(t => t.id), ['aeble'], 'ukendte ting falder fra');
  assert.deepEqual(by.taske, ['bold', 'bold', 'bold', 'bold', 'bold', 'bold'], 'tasken klippes til seks');
  assert.deepEqual(Object.keys(by.taendt), ['tv'], 'kun møbler, der findes, kan stå tændt');
});

test('to figurer kan ikke arve det samme sæde ved indlæsning', () => {
  const by = laes({
    sted: 'stue',
    figurer: { mig: { sted: 'stue', saede: 'sofa-v' }, noah: { sted: 'stue', saede: 'sofa-v' } },
    ting: [], taske: [], taendt: {},
  });
  const paaSofaen = figurerI(by, 'stue').filter(f => f.saede === 'sofa-v');
  assert.equal(paaSofaen.length, 1, 'kun én kan sidde der');
  const staaende = figurerI(by, 'stue').find(f => f.saede === null && ['mig', 'noah'].includes(f.id));
  assert.equal(staaende.y, GULV, 'den anden står på gulvet');
});

test('en ting, der fjernes, er væk – og fjernTing siger til, hvis der ikke var noget', () => {
  const by = nyBy();
  const t = frem(by, 'bog', 'stue', 40);
  assert.equal(fjernTing(by, t.n), true);
  assert.equal(fjernTing(by, t.n), false);
  assert.equal(flytTing(by, t.n, 10, 10), null);
});
