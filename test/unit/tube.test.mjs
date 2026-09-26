// Motoren bag «ZydyTube»: optagelsen, visningerne over tid, abonnenterne,
// titlen der lokker, udstyret, afspilningsknapperne, kommentarerne og den
// gemte kanal. Ingen browser – kør med
//   node --test test/unit/tube.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EMNER, emnet, AVATARER, FARVER, UDSTYR, PRISER, MAKS_TRIN, MAERKER, OPTAG_SEK, GODE, DAARLIGE, LEVETID,
  TREND, KEDER, PASSER, FULD, MAKS_VIDEOER, HALE_SEK,
  optagPlan, fremme, optagKvalitet, stjerner, nyKanal, udstyrFaktor, prisFor, koebUdstyr, andel,
  abonnenter, visningerIalt, penge, visningerAf, keder, lokkerFor, forventning, upload,
  nyeMaerker, naesteMaerke, kommentarer, synligeKommentarer, givHjerte, tal, siden, serialiser, laes, mensDuVarVaek,
} from '../../public/spil/tube/kanal.mjs';

const MIN = 60_000;
const video = (e, over = {}) => ({ emne: e.id, kvalitet: 0.8, titel: e.titler[1], farve: FARVER[0], klistermaerke: e.ting[0], ...over });

test('en ny kanal har navn, billede, farve og intet andet', () => {
  const k = nyKanal('Selmas kanal', '🦄', FARVER[2], 1000, 5);
  assert.equal(k.navn, 'Selmas kanal');
  assert.equal(k.avatar, '🦄');
  assert.equal(k.farve, FARVER[2]);
  assert.equal(abonnenter(k, 1000), 0);
  assert.equal(penge(k, 1000), 0);
  assert.equal(udstyrFaktor(k), 1);
  assert.ok(EMNER.some(e => e.id === k.trend), 'der er altid noget, seerne ønsker sig');
  // Tomt, ukendt eller for langt falder tilbage til noget fornuftigt
  assert.equal(nyKanal('').navn, 'Min kanal');
  assert.equal(nyKanal('x', '💩').avatar, AVATARER[0]);
  assert.equal(nyKanal('x', '😎', 'red').farve, FARVER[0]);
  assert.equal(nyKanal('En alt for lang kanal der bliver ved').navn.length, 18);
  assert.equal(nyKanal('<b>Hej</b>').navn, 'bHej/b');
});

test('optagelsen: samme frø giver samme plan, og alt står inde i billedet i tide', () => {
  const a = optagPlan('kat', 42), b = optagPlan('kat', 42);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, optagPlan('kat', 43));
  assert.equal(a.filter(p => p.god).length, GODE);
  assert.equal(a.filter(p => !p.god).length, DAARLIGE);
  for (const p of a) {
    assert.ok(p.t >= 0 && p.t + LEVETID <= OPTAG_SEK + 0.01, `øjeblik ${p.nr} når at forsvinde, før optagelsen slutter`);
    assert.ok(p.x > 0.1 && p.x < 0.9 && p.y > 0.1 && p.y < 0.8, 'og står et sted, man kan trykke');
    if (p.god) assert.ok(emnet('kat').ting.includes(p.ikon), 'de sjove øjeblikke passer til emnet');
  }
  // fremme() viser kun det, der står fremme nu, og ikke det, man har taget
  const p0 = a.find(p => p.god);
  assert.ok(fremme(a, p0.t + 0.1).some(p => p.nr === p0.nr));
  assert.ok(!fremme(a, p0.t + 0.1, new Set([p0.nr])).some(p => p.nr === p0.nr));
  assert.ok(!fremme(a, p0.t + LEVETID + 0.01).some(p => p.nr === p0.nr));
  // Højst tre sjove øjeblikke ad gangen, så det kan nås med én finger
  for (let t = 0; t < OPTAG_SEK; t += 0.1) assert.ok(fremme(a, t).filter(p => p.god).length <= 3);
});

test('optagelsens kvalitet følger det, man fangede – og uheld koster', () => {
  assert.equal(optagKvalitet(GODE, 0), 1);
  assert.equal(optagKvalitet(0, 0), 0.25);
  assert.equal(optagKvalitet(0, 4), 0.2, 'aldrig under 0,2');
  assert.ok(optagKvalitet(10, 1) < optagKvalitet(10, 0));
  assert.equal(stjerner(1), 3);
  assert.equal(stjerner(0.7), 2);
  assert.equal(stjerner(0.3), 1);
});

test('visningerne kommer over tid: det meste det første minut, resten over et døgn', () => {
  assert.equal(andel(0), 0);
  assert.ok(andel(60) > 0.95 && andel(60) < 1.01);
  assert.ok(Math.abs(andel(HALE_SEK) - FULD) < 1e-6);
  assert.equal(andel(10 * HALE_SEK), FULD, 'og så stopper det');
  for (let s = 0; s < 200; s += 5) assert.ok(andel(s + 5) >= andel(s), 'det går kun opad');

  const k = nyKanal('Test', '😎', FARVER[0], 0, 3);
  const v = upload(k, video(emnet('kat')), 0);
  assert.equal(visningerAf(v, 0), 0, 'ingen har set den i det øjeblik, den kommer op');
  const etMin = visningerAf(v, MIN);
  assert.ok(etMin > 150 && etMin < 800, `første video får et par hundrede visninger (${etMin})`);
  assert.ok(abonnenter(k, MIN) >= 5, `og de første abonnenter (${abonnenter(k, MIN)})`);
  assert.ok(visningerAf(v, 12 * 3600_000) > etMin, 'visningerne bliver ved med at komme i løbet af dagen');
  assert.ok(penge(k, MIN) > 0, 'og der kommer penge ind');
});

test('trenden, gentagelsen og miniaturen ændrer, hvor mange der klikker', () => {
  const k = nyKanal('Test', '😎', FARVER[0], 0, 3);
  const e = EMNER.find(x => x.id !== k.trend), tr = emnet(k.trend);
  const base = forventning(k, video(e), 0).visninger;
  assert.ok(Math.abs(forventning(k, video(tr), 0).visninger - base * TREND) < 1e-6, '🔥 trenden giver flere seere');
  assert.ok(Math.abs(forventning(k, video(e, { klistermaerke: '🚗' }), 0).visninger * PASSER - base) < 1e-6,
    'et billede, der ikke passer, giver færre klik');
  // To videoer om det samme – den tredje keder seerne
  upload(k, video(e), 0); upload(k, video(e), 0);
  assert.equal(keder(k, e.id), true);
  const f = forventning(k, video(e), 0);
  assert.equal(f.keder, true);
  const andet = EMNER.find(x => x.id !== e.id && x.id !== k.trend);
  assert.ok(Math.abs(f.visninger / forventning(k, video(andet), 0).visninger - KEDER) < 1e-6);
  assert.equal(keder(k, andet.id), false);
});

test('trenden skifter, når man har lavet den', () => {
  const k = nyKanal('Test', '😎', FARVER[0], 0, 11);
  const foer = k.trend;
  const v = upload(k, video(emnet(foer)), 0);
  assert.equal(v.trend, true);
  assert.notEqual(k.trend, foer, 'seerne vil have noget nyt');
});

test('en overdreven titel giver flere klik men færre abonnenter', () => {
  const k = nyKanal('Test', '😎', FARVER[0], 0, 3);
  const e = EMNER.find(x => x.id !== k.trend);
  const aerlig = forventning(k, video(e, { titel: e.titler[0] }), 0);
  const vild = forventning(k, video(e, { titel: e.titler[2] }), 0);
  assert.equal(aerlig.lokker, 0);
  assert.equal(vild.lokker, 2);
  assert.ok(vild.visninger > aerlig.visninger, 'flere klikker');
  assert.ok(vild.abo < aerlig.abo, 'men færre abonnerer');
  // Egne titler gættes ud fra, hvor meget de råber
  assert.equal(lokkerFor('Min kat sover', 'kat'), 0);
  assert.equal(lokkerFor('Min kat sover!', 'kat'), 1);
  assert.equal(lokkerFor('MIN KAT ER SKØR', 'kat'), 2);
  assert.equal(lokkerFor('Hvad sker der?!', 'kat'), 2);
  assert.equal(lokkerFor('Wow 😱', 'kat'), 2);
});

test('udstyret koster penge og gør videoerne bedre', () => {
  const k = nyKanal('Test', '😎', FARVER[0], 0, 3);
  assert.equal(prisFor(k, 'kamera'), PRISER[0]);
  assert.equal(koebUdstyr(k, 'kamera', 0), false, 'uden penge, intet kamera');
  // Tjen lidt
  let t = 0;
  while (penge(k, t) < PRISER[0]) { upload(k, video(emnet(k.trend)), t); t += MIN; }
  const foer = forventning(k, video(emnet('dans')), t).visninger;
  const pengeFoer = penge(k, t);
  assert.equal(koebUdstyr(k, 'kamera', t), true);
  assert.equal(k.udstyr.kamera, 1);
  assert.equal(penge(k, t), pengeFoer - PRISER[0], 'pengene er brugt');
  assert.ok(forventning(k, video(emnet('dans')), t).visninger > foer, 'og det kan ses på seerne');
  // Toppen
  for (const u of UDSTYR) k.udstyr[u.id] = MAKS_TRIN;
  assert.equal(prisFor(k, 'lys'), null);
  k.brugt = -1e9;
  assert.equal(koebUdstyr(k, 'lys', t), false, 'man kan ikke komme over toppen');
  assert.ok(Math.abs(udstyrFaktor(k) - 2.92) < 1e-9);
});

test('afspilningsknapperne gives én gang hver, når grænsen rundes', () => {
  const k = nyKanal('Test', '😎', FARVER[0], 0, 3);
  assert.deepEqual(nyeMaerker(k, 0), []);
  k.arkiv.abo = 150;
  assert.deepEqual(nyeMaerker(k, 0).map(m => m.n), [100]);
  assert.deepEqual(nyeMaerker(k, 0), [], 'ikke to gange');
  k.arkiv.abo = 2_000_000;
  assert.deepEqual(nyeMaerker(k, 0).map(m => m.navn), ['1.000 abonnenter', 'Bronzeknappen', 'Sølvknappen', 'Guldknappen']);
  assert.equal(naesteMaerke(2_000_000).navn, 'Diamantknappen');
  assert.equal(naesteMaerke(1e9), null);
});

test('kommentarerne er de samme hver gang og kommer frem efterhånden', () => {
  const k = nyKanal('Test', '😎', FARVER[0], 0, 3);
  const v = upload(k, video(emnet('kat')), 0);
  const a = kommentarer(v, k), b = kommentarer(v, k);
  assert.deepEqual(a, b);
  assert.match(a[0].tekst, /farmor/i, 'farmor ser altid den første video');
  assert.ok(a.some(c => /Første/.test(c.tekst)));
  assert.ok(a.some(c => c.tekst.includes(emnet(k.trend).navn.toLowerCase())), 'en seer fortæller, hvad der er populært');
  assert.equal(synligeKommentarer(v, k, 0).length, 0);
  assert.ok(synligeKommentarer(v, k, 5000).length < a.length, 'kun nogle efter fem sekunder');
  assert.equal(synligeKommentarer(v, k, 2 * MIN).length, a.length, 'alle efter et par minutter');
  assert.equal(new Set(a.map(c => c.tekst)).size, a.length, 'ingen står der to gange');
  // En overdreven titel får nogen til at sige det højt
  let snyd = 0;
  for (let i = 0; i < 20; i++) {
    const w = upload(k, video(emnet('slim'), { titel: emnet('slim').titler[2] }), 0);
    if (kommentarer(w, k).some(c => /Titlen|Snyd|slet ikke/.test(c.tekst))) snyd++;
  }
  assert.ok(snyd >= 8, `seerne siger fra over for overdrevne titler (${snyd} af 20)`);
  // Hjerter
  assert.equal(givHjerte(k, v.id, 1), true);
  assert.ok(k.hjerter.includes(`${v.id}:1`));
  assert.equal(givHjerte(k, v.id, 1), false, 'et tryk mere tager det igen');
});

test('gamle videoer lægges i arkivet uden at abonnenterne forsvinder', () => {
  const k = nyKanal('Test', '😎', FARVER[0], 0, 3);
  let t = 0;
  for (let i = 0; i < MAKS_VIDEOER + 10; i++) { upload(k, video(EMNER[i % EMNER.length]), t); t += HALE_SEK / 4; }
  assert.equal(k.videoer.length, MAKS_VIDEOER);
  assert.equal(k.antal, MAKS_VIDEOER + 10);
  const S = abonnenter(k, t), V = visningerIalt(k, t);
  upload(k, video(emnet('dans')), t);
  assert.ok(abonnenter(k, t) >= S, 'ingen abonnenter forsvinder, når en video arkiveres');
  assert.ok(visningerIalt(k, t) >= V);
});

test('kanalen kan gemmes og hentes – og skrald bliver ikke til en kanal', () => {
  const k = nyKanal('Selmas kanal', '🐼', FARVER[3], 0, 9);
  let t = 0;
  for (let i = 0; i < 6; i++) { upload(k, video(EMNER[i]), t); t += MIN; }
  k.udstyr.lys = 2; k.brugt = 30; nyeMaerker(k, t);
  const igen = laes(serialiser(k));
  assert.deepEqual(igen, k);
  assert.equal(abonnenter(igen, t), abonnenter(k, t));
  assert.equal(laes('pjat'), null);
  assert.equal(laes('{"v":2,"videoer":[]}'), null);
  // Det, der ikke passer, rettes eller falder fra
  const d = JSON.parse(serialiser(k));
  d.udstyr.kamera = 99; d.videoer[0].emne = 'raketter'; d.maerker.push(7); d.brugt = 'mange';
  const r = laes(JSON.stringify(d));
  assert.equal(r.udstyr.kamera, MAKS_TRIN);
  assert.equal(r.videoer.length, 5);
  assert.ok(!r.maerker.includes(7));
  assert.equal(r.brugt, 0);
});

test('velkomsten fortæller, hvad der er sket, mens man var væk', () => {
  const k = nyKanal('Test', '😎', FARVER[0], 0, 3);
  upload(k, video(emnet('kat')), 0);
  assert.equal(mensDuVarVaek(k, 0, 30_000), null, 'et halvt minut tæller ikke');
  const v = mensDuVarVaek(k, 0, 5 * MIN);
  assert.ok(v.visninger > 100 && v.abo > 0);
});

test('tal og tid skrives, som børnene kender det', () => {
  assert.equal(tal(0), '0');
  assert.equal(tal(1234), '1.234');
  assert.equal(tal(999_999), '999.999');
  assert.equal(tal(1_250_000), '1,2 mio.');
  assert.equal(tal(12_900_000), '12 mio.');
  assert.equal(tal(250_000_000), '250 mio.');
  assert.equal(siden(10_000), 'lige nu');
  assert.equal(siden(5 * MIN), 'for 5 min. siden');
  assert.equal(siden(3600_000), 'for 1 time siden');
  assert.equal(siden(3 * 86400_000), 'for 3 dage siden');
});

/**
 * En bot, der laver videoer med en fast optagekvalitet, tager trenden (når
 * den vil), køber det billigste udstyr, den har råd til, og venter et
 * minut mellem hver video. Returnerer hvilken video hver grænse blev rundet på.
 */
function bot({ q, titel = 1, trend = true, videoer = 160, frø = 7 }) {
  const k = nyKanal('Bot', '🤖', FARVER[0], 0, frø);
  let t = 0; const rundet = {};
  for (let i = 1; i <= videoer; i++) {
    const e = trend ? emnet(k.trend) : EMNER[i % EMNER.length];
    upload(k, video(e, { kvalitet: q, titel: e.titler[titel] }), t);
    t += MIN;
    for (;;) {
      const billigst = UDSTYR.map(u => ({ id: u.id, p: prisFor(k, u.id) })).filter(x => x.p != null).sort((a, b) => a.p - b.p)[0];
      if (!billigst || !koebUdstyr(k, billigst.id, t)) break;
    }
    const S = abonnenter(k, t);
    for (const m of MAERKER) if (S >= m.n && !rundet[m.n]) rundet[m.n] = i;
  }
  return { k, t, rundet };
}

test('balancen: de første abonnenter kommer hurtigt, Guldknappen kræver en god kanal', () => {
  const god = bot({ q: 0.8 });
  assert.ok(god.rundet[100] <= 6, `100 abonnenter efter et par videoer (${god.rundet[100]})`);
  assert.ok(god.rundet[1000] <= 20, `1.000 inden for 20 videoer (${god.rundet[1000]})`);
  assert.ok(god.rundet[100000] >= 35 && god.rundet[100000] <= 75, `Sølvknappen efter 35-75 videoer (${god.rundet[100000]})`);
  assert.ok(god.rundet[1000000] >= 60 && god.rundet[1000000] <= 120, `Guldknappen efter 60-120 videoer (${god.rundet[1000000]})`);
  assert.ok(!god.rundet[100000000], 'Rubinknappen er næsten umulig');
  assert.ok(UDSTYR.every(u => god.k.udstyr[u.id] === MAKS_TRIN), 'udstyret kan købes færdigt undervejs');

  const sjusk = bot({ q: 0.4 });
  assert.ok((sjusk.rundet[100000] ?? Infinity) > god.rundet[100000] + 20, 'en sjusket optagelse tager meget længere tid');

  // Ærlige titler betaler sig på den lange bane, overdrevne gør ikke
  const aerlig = bot({ q: 0.8, titel: 0, videoer: 60 });
  const spaendende = bot({ q: 0.8, titel: 1, videoer: 60 });
  const vild = bot({ q: 0.8, titel: 2, videoer: 60 });
  assert.ok(abonnenter(aerlig.k, aerlig.t) > abonnenter(spaendende.k, spaendende.t), 'den ærlige titel giver flest abonnenter');
  assert.ok(visningerIalt(spaendende.k, spaendende.t) > visningerIalt(aerlig.k, aerlig.t), 'den spændende flere visninger');
  assert.ok(abonnenter(aerlig.k, aerlig.t) > abonnenter(vild.k, vild.t) * 1.5,
    'og overdrevne titler giver langt færre abonnenter i længden');

  // Trenden hjælper, men man kan sagtens klare sig uden
  const utrendy = bot({ q: 0.8, trend: false, videoer: 120 });
  assert.ok(utrendy.rundet[100000] && utrendy.rundet[100000] > god.rundet[100000], 'uden trenden går det langsommere, men det går');
});
