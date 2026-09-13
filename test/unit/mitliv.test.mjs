// Motoren bag «Mit liv»: behovene, vejene gennem huset, møblerne, arbejdet,
// uheldene og det gemte hus. Ingen browser – her spilles hele dage igennem på
// et øjeblik, så det kan prøves af, om et liv overhovedet kan leves.
//
// Kør:  node --test test/unit/mitliv.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BREDDE, HOEJDE, DOER, BEHOV, TING, JOBS, START_PENGE, STJERNER_PR_NIVEAU, ARBEJDE_TIMER,
  GAEST_VENTER, GAEST_TIMER, DAG,
  nytHjem, tingen, tik, tryk, brug, stop, koeb, saelg, flyt, kanBygges, frit, paaFeltet,
  vejenTil, vejenHenTil, kanArbejde, tagPaaArbejde, jobbet, stjernerFor, humoer, hygge, formue,
  mestTraengende, hvor, gaar, klokken, dagen, paaUret, serialiser, laes, ringTilVen, pudsUdseende,
} from '../../public/spil/mitliv/liv.mjs';

/** En forudsigelig terning, så gæstens småture ikke gør testen tilfældig. */
const fastRnd = () => 0.99;

/** Ét hjem med et bestemt møbel på et bestemt felt og intet andet i vejen. */
function hjemMed(id, x, y) {
  const hjem = nytHjem('Selma');
  hjem.ting = [{ id, x, y }];
  hjem.penge = 10000;
  return hjem;
}

/* ================= Huset og et nyt liv ================= */

test('et nyt liv har et navn, lidt penge og de nødvendigste møbler', () => {
  const hjem = nytHjem('  Selma  ');
  assert.equal(hjem.navn, 'Selma');
  assert.equal(hjem.penge, START_PENGE);
  assert.equal(dagen(hjem.minut), 1);
  assert.equal(klokken(hjem.minut), '08.00');
  assert.equal(hjem.job.niveau, 0);
  assert.ok(hjem.ting.length >= 4, 'man flytter ind i et møbleret hus');
  for (const b of BEHOV) assert.ok(hjem.behov[b] > 40 && hjem.behov[b] <= 100, `${b} starter et fornuftigt sted`);
  // Formuen er pengene plus alt det, huset er fyldt med
  const moebler = hjem.ting.reduce((s, m) => s + tingen(m.id).pris, 0);
  assert.equal(formue(hjem), START_PENGE + moebler);
});

test('et langt navn klippes af, og et tomt bliver til noget', () => {
  assert.equal(nytHjem('Abrakadabrasimsalabim').navn.length, 12);
  assert.equal(nytHjem('   ').navn, 'Mig');
});

test('et udseende peger altid på noget, der findes', () => {
  const u = pudsUdseende({ hud: 99, haar: -1, troeje: 'blå' });
  assert.equal(u.hud, 0);
  assert.equal(u.haar, 0);
  assert.equal(u.troeje, 0);
});

test('uret går rundt', () => {
  assert.equal(klokken(0), '00.00');
  assert.equal(klokken(23 * 60 + 59), '23.59');
  assert.equal(klokken(DAG + 9 * 60 + 5), '09.05');
  assert.equal(dagen(DAG * 2 + 60), 3);
  assert.equal(paaUret(DAG + 30), 30);
});

/* ================= Veje gennem huset ================= */

test('man går uden om møblerne og hen ved siden af det, man vil bruge', () => {
  const hjem = hjemMed('tv', 5, 5);
  const vej = vejenHenTil(hjem, { x: 1, y: 1 }, 5, 5);
  assert.ok(vej.length > 0, 'der er en vej');
  const sidste = vej[vej.length - 1];
  assert.equal(Math.abs(sidste.x - 5) + Math.abs(sidste.y - 5), 1, 'man ender ved siden af møblet');
  assert.ok(vej.every(f => frit(hjem, f.x, f.y)), 'og går kun på tomme felter');
  // Hvert skridt er ét felt til siden
  let p = { x: 1, y: 1 };
  for (const f of vej) {
    assert.equal(Math.abs(f.x - p.x) + Math.abs(f.y - p.y), 1, 'ét felt ad gangen');
    p = f;
  }
});

test('er man muret inde, findes der ingen vej', () => {
  const hjem = nytHjem('Selma');
  // Byg en mur af planter tværs over huset under figuren
  hjem.ting = [];
  for (let x = 0; x < BREDDE; x++) hjem.ting.push({ id: 'plante', x, y: 3 });
  assert.equal(vejenTil(hjem, { x: 1, y: 1 }, 1, 6), null, 'muren spærrer');
  assert.deepEqual(vejenTil(hjem, { x: 1, y: 1 }, 1, 1), [], 'man står allerede der');
});

/* ================= Behov og møbler ================= */

test('behovene siver, mens tiden går', () => {
  const hjem = nytHjem('Selma');
  const foer = { ...hjem.behov };
  tik(hjem, 240, fastRnd);                     // fire timer, hvor der ikke sker noget
  for (const b of BEHOV) assert.ok(hjem.behov[b] < foer[b], `${b} falder`);
  assert.equal(klokken(hjem.minut), '12.00');
});

test('man går selv hen til sengen og sover, til energien er fyldt', () => {
  const hjem = hjemMed('seng', 4, 2);
  hjem.behov.energi = 10;
  assert.equal(tryk(hjem, 4, 2), 'bruger');
  assert.ok(gaar(hjem), 'figuren er på vej');
  tik(hjem, 40, fastRnd);                      // gå derhen
  assert.equal(gaar(hjem), false);
  assert.equal(hjem.handling.slags, 'ting');
  const p = hvor(hjem);
  assert.equal(Math.abs(p.x - 4) + Math.abs(p.y - 2), 1, 'man ligger ved siden af sengen (feltet er sengens)');
  for (let i = 0; i < 20 && hjem.handling; i++) tik(hjem, 15, fastRnd);
  assert.ok(hjem.behov.energi > 99, `sovet ud (${hjem.behov.energi.toFixed(0)})`);
  assert.equal(hjem.handling, null, 'og står op af sig selv');
});

test('de andre behov siver langsommere, mens man sover', () => {
  const vaagen = hjemMed('bogreol', 4, 2);
  const sovende = hjemMed('seng', 4, 2);
  sovende.behov.energi = 10;                   // så sengen er i brug hele timen
  tryk(sovende, 4, 2);
  tik(sovende, 15, fastRnd);                   // hen i seng først
  assert.ok(tingen(sovende.ting[sovende.handling.ting].id).sover);
  const a = vaagen.behov.mad, b = sovende.behov.mad;
  tik(vaagen, 60, fastRnd);
  tik(sovende, 60, fastRnd);
  assert.ok(a - vaagen.behov.mad > (b - sovende.behov.mad) * 2, 'sult kommer langsommere i søvne');
});

test('et møbel fylder sit eget behov op – og lidt af naboens', () => {
  const hjem = hjemMed('badekar', 5, 4);
  hjem.behov.renhed = 20;
  hjem.behov.sjov = 30;
  brug(hjem, 0);
  tik(hjem, 60, fastRnd);
  assert.ok(hjem.behov.renhed > 90, `badet virker (${hjem.behov.renhed.toFixed(0)})`);
  assert.ok(hjem.behov.sjov > 30, 'og det er også lidt sjovt');
});

test('møbler kan ikke nås gennem en mur – så siger spillet nej med det samme', () => {
  const hjem = nytHjem('Selma');
  hjem.ting = [{ id: 'tv', x: 0, y: 0 }, { id: 'plante', x: 1, y: 0 }, { id: 'plante', x: 0, y: 1 }];
  assert.equal(brug(hjem, 0), null, 'fjernsynet er muret inde');
  assert.equal(hjem.handling, null);
});

test('«stop» afbryder det, man er i gang med', () => {
  const hjem = hjemMed('tv', 4, 4);
  hjem.behov.sjov = 10;
  brug(hjem, 0);
  tik(hjem, 30, fastRnd);
  assert.equal(hjem.handling.slags, 'ting');
  stop(hjem);
  assert.equal(hjem.handling, null);
  assert.equal(gaar(hjem), false);
});

/* ================= Uheld ================= */

test('når toilettet ikke kan vente, kommer der en pyt, man kan tørre op', () => {
  const hjem = hjemMed('tv', 9, 7);
  hjem.behov.toilet = 1;
  const h = tik(hjem, 60, fastRnd);
  assert.ok(h.some(e => e.slags === 'uheld'), 'der skete et uheld');
  assert.equal(hjem.pytter.length, 1);
  assert.ok(hjem.behov.toilet > 0, 'og så er der luft igen');

  const p = hjem.pytter[0];
  assert.equal(tryk(hjem, p.x, p.y), 'rydder');
  const ryddet = tik(hjem, 90, fastRnd);
  assert.equal(hjem.pytter.length, 0, 'pytten er væk');
  assert.ok(ryddet.some(e => e.slags === 'ryddet'));
});

test('en helt udkørt figur falder i søvn på gulvet og vågner igen', () => {
  const hjem = hjemMed('tv', 4, 4);
  hjem.behov.energi = 1;
  const h = tik(hjem, 30, fastRnd);
  assert.ok(h.some(e => e.slags === 'besvimet'));
  assert.equal(hjem.handling.slags, 'besvimet');
  assert.equal(tryk(hjem, 4, 4), null, 'man kan ikke styre en, der er faldet om');
  const op = tik(hjem, 120, fastRnd);
  assert.ok(op.some(e => e.slags === 'vaagnede'));
  assert.equal(hjem.handling, null);
});

/* ================= Arbejdet ================= */

test('bussen kører kun om morgenen, og kun én gang om dagen', () => {
  const hjem = nytHjem('Selma');
  assert.equal(kanArbejde(hjem), true, 'kl. 8 kan man tage af sted');
  assert.equal(tagPaaArbejde(hjem), true);
  assert.equal(kanArbejde(hjem), false, 'man er allerede af sted');
  tik(hjem, ARBEJDE_TIMER * 60, fastRnd);
  assert.equal(hjem.arbejde, null, 'hjemme igen');
  assert.equal(kanArbejde(hjem), false, 'og så er dagen brugt');
  tik(hjem, DAG - paaUret(hjem.minut) + 8 * 60, fastRnd);   // frem til næste morgen kl. 8
  assert.equal(klokken(hjem.minut), '08.00');
  assert.equal(kanArbejde(hjem), true, 'i morgen kører bussen igen');
});

test('lønnen følger humøret, og gode dage giver stjerner', () => {
  const glad = nytHjem('Selma');
  for (const b of BEHOV) glad.behov[b] = 100;
  glad.ting.push({ id: 'lampe', x: 5, y: 2 }, { id: 'bogreol', x: 6, y: 2 }, { id: 'taeppe', x: 5, y: 4 });
  const sur = nytHjem('Selma');
  for (const b of BEHOV) sur.behov[b] = 4;

  tagPaaArbejde(glad); tagPaaArbejde(sur);
  const a = tik(glad, ARBEJDE_TIMER * 60, fastRnd).find(e => e.slags === 'loen');
  const b = tik(sur, ARBEJDE_TIMER * 60, fastRnd).find(e => e.slags === 'loen');
  assert.ok(a.kr > b.kr, `en god dag giver mere i løn (${a.kr} > ${b.kr})`);
  assert.equal(a.stjerner, 2, 'og to stjerner');
  assert.equal(b.stjerner, 0, 'en elendig dag giver ingen');
  assert.equal(glad.penge, START_PENGE + a.kr);
});

test('stjernerne giver forfremmelse, og til sidst er man astronaut', () => {
  const hjem = nytHjem('Selma');
  assert.equal(jobbet(hjem).navn, JOBS[0].navn);
  let forfremmelser = 0;
  for (let dag = 0; dag < 200 && hjem.job.niveau < JOBS.length - 1; dag++) {
    for (const b of BEHOV) hjem.behov[b] = 100;          // en perfekt dag
    assert.equal(tagPaaArbejde(hjem), true, `dag ${dag}`);
    const h = tik(hjem, ARBEJDE_TIMER * 60, fastRnd);
    forfremmelser += h.filter(e => e.slags === 'forfremmet').length;
    tik(hjem, DAG - ARBEJDE_TIMER * 60, fastRnd);        // videre til næste morgen
  }
  assert.equal(hjem.job.niveau, JOBS.length - 1);
  assert.equal(jobbet(hjem).navn, 'Astronaut');
  assert.equal(forfremmelser, JOBS.length - 1, 'ét trin ad gangen');
  // To stjerner om dagen: hvert trin koster STJERNER_PR_NIVEAU
  assert.ok(hjem.penge > START_PENGE * 5, 'og der er tjent penge undervejs');
});

test('stjerner pr. dag afhænger af humøret', () => {
  assert.equal(stjernerFor(100), 2);
  assert.equal(stjernerFor(65), 2);
  assert.equal(stjernerFor(40), 1);
  assert.equal(stjernerFor(10), 0);
});

test('man kan ikke bruge møbler, mens man er på arbejde', () => {
  const hjem = hjemMed('tv', 4, 4);
  tagPaaArbejde(hjem);
  assert.equal(tryk(hjem, 4, 4), null);
  assert.equal(brug(hjem, 0), null);
});

/* ================= Butikken og bygningen ================= */

test('man køber et møbel, stiller det på gulvet og betaler for det', () => {
  const hjem = nytHjem('Selma');
  hjem.penge = 1000;
  assert.equal(koeb(hjem, 'tv', 5, 5), true);
  assert.equal(hjem.penge, 1000 - tingen('tv').pris);
  assert.equal(paaFeltet(hjem, 5, 5).id, 'tv');
  assert.equal(koeb(hjem, 'tv', 5, 5), false, 'feltet er optaget');
  assert.equal(koeb(hjem, 'arkade', 6, 5), false, 'der er ikke råd');
  assert.equal(koeb(hjem, 'plante', DOER.x, DOER.y), false, 'døren skal kunne bruges');
  assert.equal(koeb(hjem, 'plante', -1, 2), false, 'uden for huset');
});

test('man kan ikke mure sine egne møbler inde', () => {
  const hjem = nytHjem('Selma');
  hjem.penge = 100000;
  hjem.ting = [{ id: 'seng', x: 0, y: 0 }];
  assert.equal(koeb(hjem, 'plante', 1, 0), true);
  assert.equal(koeb(hjem, 'plante', 0, 1), false, 'så kunne sengen ikke nås mere');
  assert.equal(paaFeltet(hjem, 0, 1), null);
  assert.equal(hjem.penge, 100000 - tingen('plante').pris, 'og der blev ikke betalt for den');
});

test('møbler kan flyttes og sælges for det halve', () => {
  const hjem = nytHjem('Selma');
  hjem.penge = 0;
  hjem.ting = [{ id: 'tv', x: 4, y: 4 }];
  assert.equal(flyt(hjem, 0, 6, 6), true);
  assert.equal(paaFeltet(hjem, 6, 6).id, 'tv');
  assert.equal(flyt(hjem, 0, DOER.x, DOER.y), false, 'ikke i døren');
  const kr = saelg(hjem, 0);
  assert.equal(kr, Math.round(tingen('tv').pris / 2));
  assert.equal(hjem.penge, kr);
  assert.equal(hjem.ting.length, 0);
});

test('bliver møblet solgt, mens man er på vej derhen, sker der ikke noget', () => {
  const hjem = hjemMed('tv', 4, 4);
  brug(hjem, 0);
  saelg(hjem, 0);
  tik(hjem, 60, fastRnd);
  assert.equal(hjem.handling, null, 'ingen usynlig handling');
});

test('står figuren i vejen for et nyt møbel, bliver den skubbet ud', () => {
  const hjem = nytHjem('Selma');
  hjem.penge = 1000;
  const x = hjem.figur.x, y = hjem.figur.y;
  assert.equal(koeb(hjem, 'plante', x, y), true);
  assert.ok(hjem.figur.x !== x || hjem.figur.y !== y, 'figuren står ikke inde i planten');
  assert.equal(frit(hjem, hjem.figur.x, hjem.figur.y), true);
});

test('hygge tæller med i humøret', () => {
  const bart = nytHjem('Selma');
  const hyggeligt = nytHjem('Selma');
  for (const h of [bart, hyggeligt]) for (const b of BEHOV) h.behov[b] = 60;
  hyggeligt.ting.push({ id: 'lampe', x: 5, y: 1 }, { id: 'plante', x: 6, y: 1 }, { id: 'bogreol', x: 5, y: 3 }, { id: 'taeppe', x: 6, y: 3 });
  assert.ok(hygge(hyggeligt) > hygge(bart));
  assert.ok(humoer(hyggeligt) > humoer(bart), 'et pyntet hus er rarere at være i');
});

test('humøret trykkes af det behov, der mangler mest', () => {
  const hjem = nytHjem('Selma');
  for (const b of BEHOV) hjem.behov[b] = 90;
  const godt = humoer(hjem);
  hjem.behov.toilet = 0;
  assert.equal(mestTraengende(hjem), 'toilet');
  assert.ok(humoer(hjem) < godt - 10, 'ét tomt behov kan mærkes');
});

/* ================= Besøg ================= */

test('telefonen henter en ven på besøg, man kan snakke med', () => {
  const hjem = hjemMed('telefon', 5, 5);
  hjem.behov.selskab = 10;
  assert.equal(ringTilVen(hjem, 'Sofie'), 'Sofie');
  assert.equal(ringTilVen(hjem, 'Emil'), null, 'der kan kun være én ad gangen');

  const kom = tik(hjem, GAEST_VENTER + 10, fastRnd);
  assert.ok(kom.some(e => e.slags === 'gaest' && e.navn === 'Sofie'), 'der bliver banket på');
  assert.equal(hjem.gaest.kommet, true);

  assert.equal(tryk(hjem, hjem.gaest.x, hjem.gaest.y), 'snakker');
  tik(hjem, 40, fastRnd);
  assert.ok(hjem.behov.selskab > 40, `snakken hjælper (${hjem.behov.selskab.toFixed(0)})`);

  const gik = tik(hjem, GAEST_TIMER * 60, fastRnd);
  assert.ok(gik.some(e => e.slags === 'gaestGik'), 'gæsten går hjem igen');
  assert.equal(hjem.gaest, null);
});

test('man ringer ikke til sig selv', () => {
  const hjem = nytHjem('Sofie');
  for (let i = 0; i < 20; i++) {
    const h = nytHjem('Sofie');
    const navn = ringTilVen(h, null, () => i / 20);
    assert.notEqual(navn, 'Sofie');
  }
  assert.ok(hjem);
});

/* ================= Gem og hent ================= */

test('huset kan gemmes og hentes igen', () => {
  const hjem = nytHjem('Selma', { hud: 2, haar: 3, haarfarve: 1, troeje: 4, bukser: 2 });
  hjem.penge = 3210;
  koeb(hjem, 'tv', 5, 5);
  tagPaaArbejde(hjem);
  tik(hjem, ARBEJDE_TIMER * 60, fastRnd);
  const igen = laes(JSON.parse(JSON.stringify(serialiser(hjem))));
  assert.equal(igen.navn, 'Selma');
  assert.deepEqual(igen.udseende, hjem.udseende);
  assert.equal(igen.penge, Math.round(hjem.penge));
  assert.equal(Math.round(igen.minut), Math.round(hjem.minut));
  assert.deepEqual(igen.ting, hjem.ting);
  assert.deepEqual(igen.job, hjem.job);
  assert.equal(formue(igen), formue(hjem));
  assert.equal(igen.arbejde, null, 'man kommer hjem fra arbejde ved at lukke fanen');
});

test('noget vrøvl i det gemte koster højst et møbel – ikke hele huset', () => {
  const hjem = nytHjem('Selma');
  const data = serialiser(hjem);
  data.ting = [
    { id: 'tv', x: 5, y: 5 },
    { id: 'flyvendetaeppe', x: 2, y: 2 },     // et møbel vi ikke har mere
    { id: 'tv', x: 5, y: 5 },                 // to ting på samme felt
    { id: 'plante', x: 99, y: 0 },            // uden for huset
    { id: 'plante', x: DOER.x, y: DOER.y },   // i døren
  ];
  data.behov.mad = 'meget';
  data.penge = -50;
  data.job = { niveau: 99, stjerner: 99 };
  const igen = laes(data);
  assert.deepEqual(igen.ting, [{ id: 'tv', x: 5, y: 5 }]);
  assert.equal(igen.behov.mad, 60);
  assert.equal(igen.penge, 0);
  assert.equal(igen.job.niveau, JOBS.length - 1);
  assert.equal(igen.job.stjerner, STJERNER_PR_NIVEAU);
  assert.equal(laes(null), null);
  assert.equal(laes({ navn: 42 }), null);
});

test('stod man inde i et møbel i det gemte, flyttes man ud', () => {
  const hjem = nytHjem('Selma');
  const data = serialiser(hjem);
  data.ting = [{ id: 'tv', x: 3, y: 3 }];
  data.figur = { x: 3, y: 3 };
  const igen = laes(data);
  assert.equal(frit(igen, igen.figur.x, igen.figur.y), true);
});

/* ================= Butikken som helhed ================= */

test('alle møbler har pris, ikon-navn og noget, de gør', () => {
  assert.ok(TING.length >= 15, 'der skal være noget at bruge pengene på');
  const ids = new Set();
  for (const t of TING) {
    assert.match(t.id, /^[a-z]+$/, `${t.id}: id`);
    assert.equal(ids.has(t.id), false, `to møbler hedder ${t.id}`);
    ids.add(t.id);
    assert.ok(t.navn.length > 2 && t.pris > 0, `${t.id}: navn og pris`);
    assert.ok(typeof t.gør === 'string' && t.gør.length > 2, `${t.id}: mangler en linje om hvad man laver`);
    if (t.behov) {
      assert.ok(BEHOV.includes(t.behov), `${t.id}: ukendt behov`);
      assert.ok(t.fart > 0, `${t.id}: skal virke hurtigere end behovet falder`);
    } else {
      assert.ok(t.hygge > 0, `${t.id}: pynt skal i det mindste pynte`);
    }
  }
  for (const b of BEHOV) {
    assert.ok(TING.some(t => t.behov === b || t.ogsaa?.[b]), `der findes ikke noget, der fylder «${b}» op`);
  }
});

test('et helt døgn kan leves igennem uden at gå i stå', () => {
  const hjem = nytHjem('Selma');
  hjem.penge = 5000;
  koeb(hjem, 'tv', 5, 5);
  koeb(hjem, 'telefon', 6, 5);
  koeb(hjem, 'komfur', 1, 6);
  const efterIndkoeb = hjem.penge;
  tagPaaArbejde(hjem);
  for (let i = 0; i < 96; i++) {                 // 24 timer i kvarter
    tik(hjem, 15, fastRnd);
    if (!hjem.arbejde && !hjem.handling && !gaar(hjem)) {
      // Pas det, der trænger mest – ligesom et barn ville gøre
      const mangler = mestTraengende(hjem);
      const nr = hjem.ting.findIndex(m => {
        const t = tingen(m.id);
        return t.behov === mangler || t.ogsaa?.[mangler];
      });
      if (nr >= 0) brug(hjem, nr);
    }
  }
  assert.equal(dagen(hjem.minut), 2, 'der er gået et døgn');
  assert.ok(hjem.penge > efterIndkoeb, 'lønnen er kommet ind');
  assert.ok(humoer(hjem) > 20, `og man har det nogenlunde (${humoer(hjem)})`);
  assert.ok(hjem.bedste >= formue(hjem) - 1, 'den bedste formue er husket');
});
