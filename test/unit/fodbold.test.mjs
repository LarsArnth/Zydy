// Fodbold: banen, bolden, spillerne, træningen, ligaen og butikken (public/spil/fodbold/fodbold.mjs).
// Kør:  node --test test/unit/fodbold.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  B, L, R, RB, DT, KLAR_SEK, MAAL_PAUSE, KAMP_SEK, FORLAENGET_SEK, LIGA, TRAENING, BUTIK, EVNE_MAKS, AUTOPILOT,
  nyKamp, nyTraening, robotHold, tik, styr, trykSkyd, trykAflever, styret, spillerMedBold, alleSpillere,
  nyProfil, rensProfil, samledeEvner, koeb, giErfaring, krav, efterKamp, efterTraening,
} from '../../public/spil/fodbold/fodbold.mjs';

const mig = (evner = {}) => ({ navn: 'Alia', farve: '#e8413c', menneske: true, evner });

/** En liga-kamp, der lige er gået i gang, med menneskets hold nederst. */
function iGang(opt = {}) {
  const k = nyKamp({ hold: [mig(opt.evner), robotHold(opt.trin ?? 0)], seed: opt.seed ?? 3, forlænget: opt.forlænget ?? true });
  tik(k, KLAR_SEK + DT);
  assert.equal(k.fase, 'spil');
  k.hændelser.length = 0;
  return k;
}
/** Giver bolden til p og flytter alle andre af vejen. */
function medBold(k, p, x, y) {
  for (const q of alleSpillere(k)) if (q !== p) { q.x = q.h === 0 ? 5 : B - 5; q.y = q.rolle === 'keeper' ? (q.h === 0 ? L - 3 : 3) : L / 2 + q.i * 4; q.vx = q.vy = 0; }
  p.x = x; p.y = y; p.fx = 0; p.fy = -1; p.vx = p.vy = 0;
  k.bold.hos = { h: p.h, i: p.i }; k.bold.x = x; k.bold.y = y - (R + RB); k.bold.vx = k.bold.vy = 0;
  k.bold.modtager = null; k.bold.laast = 0;
  if (k.hold[p.h].menneske) k.styrer[p.h] = p.i;
  p.beskyttet = 5;
}
const typer = k => k.hændelser.map(e => e.type);
function spilKamp(a, b, seed) {
  const k = nyKamp({ hold: [a, b], seed, forlænget: false });
  let n = 0;
  while (k.fase !== 'slut' && n++ < 5000) { tik(k, 0.1); k.hændelser.length = 0; }
  return k.hold.map(o => o.mål);
}

test('en ny kamp: fire på hvert hold, og det ene hold har bolden på midten', () => {
  const k = nyKamp({ hold: [mig(), robotHold(0)], seed: 1 });
  assert.equal(k.hold[0].spillere.length, 4);
  assert.equal(k.hold[1].spillere.length, 4);
  assert.deepEqual(k.hold.map(o => o.spillere.filter(p => p.rolle === 'keeper').length), [1, 1]);
  assert.equal(k.fase, 'klar');
  const c = spillerMedBold(k);
  assert.ok(c, 'nogen har bolden ved afsparket');
  assert.ok(Math.abs(k.bold.x - B / 2) < 3 && Math.abs(k.bold.y - L / 2) < 3, 'bolden ligger på midten');
  // Alle står på egen halvdel
  for (const p of k.hold[0].spillere) assert.ok(p.y >= L / 2 - 0.1, 'hold 0 står nederst');
  for (const p of k.hold[1].spillere) assert.ok(p.y <= L / 2 + 0.1, 'hold 1 står øverst');
  tik(k, KLAR_SEK + DT);
  assert.equal(k.fase, 'spil');
});

test('joysticket flytter den, man styrer – og han tager bolden med', () => {
  const k = iGang();
  const p = k.hold[0].spillere[2];
  medBold(k, p, 30, 70);
  styr(k, 0, 0, -1);
  tik(k, 1);
  assert.ok(p.y < 62, `han løb opad (${p.y.toFixed(1)})`);
  assert.equal(spillerMedBold(k), p, 'han har stadig bolden');
  assert.ok(k.bold.y < p.y, 'bolden ligger foran ham');
  styr(k, 0, 1, 0);
  tik(k, 0.6);
  assert.ok(p.x > 33, 'og til højre');
  styr(k, 0, 5, 0);
  assert.ok(Math.abs(Math.hypot(k.input[0].x, k.input[0].y) - 1) < 1e-9, 'joysticket kan ikke give mere end fuld fart');
});

test('skyd: bolden flyver mod målet, og et mål giver afspark til de andre', () => {
  const k = iGang();
  k.hold[1].ai = { ...k.hold[1].ai, keeper: 0 };       // målmanden sover
  const p = k.hold[0].spillere[2];
  medBold(k, p, 30, 22);
  k.hold[1].spillere[0].x = 4;
  assert.equal(trykSkyd(k, 0), true);
  assert.ok(typer(k).includes('skud'));
  assert.ok(k.bold.vy < -20, 'bolden flyver op mod målet');
  assert.equal(k.bold.hos, null);
  let n = 0;
  while (k.fase === 'spil' && n++ < 200) tik(k, DT);
  assert.equal(k.fase, 'maal');
  assert.deepEqual(k.hold.map(o => o.mål), [1, 0]);
  assert.ok(typer(k).includes('mål'));
  tik(k, MAAL_PAUSE + DT);
  assert.equal(k.fase, 'klar');
  assert.equal(spillerMedBold(k).h, 1, 'de andre har afspark');
});

test('målmanden kan redde et skud', () => {
  let reddet = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const k = iGang({ seed });
    k.hold[1].ai = { ...k.hold[1].ai, keeper: 1 };
    const p = k.hold[0].spillere[2];
    medBold(k, p, 30, 20);
    k.hold[1].spillere[0].x = B / 2; k.hold[1].spillere[0].y = 2.6;
    styr(k, 0, 0, 0);
    trykSkyd(k, 0);
    let n = 0;
    while (k.fase === 'spil' && n++ < 90) { tik(k, DT); if (typer(k).includes('redning')) { reddet++; break; } }
  }
  assert.ok(reddet >= 5, `målmanden reddede ${reddet} af 20`);
});

test('aflever: bolden går til den makker, joysticket peger på, og man styrer ham bagefter', () => {
  const k = iGang();
  const p = k.hold[0].spillere[2], m = k.hold[0].spillere[3];
  medBold(k, p, 15, 60);
  m.x = 45; m.y = 60;
  styr(k, 0, 1, 0);                         // peg mod højre, hvor makkeren står
  assert.equal(trykAflever(k, 0), true);
  assert.ok(typer(k).includes('aflevering'));
  assert.deepEqual(k.bold.modtager, { h: 0, i: 3 });
  assert.equal(styret(k, 0), m, 'man styrer den, der skal have bolden');
  styr(k, 0, 0, 0);
  let n = 0;
  while (spillerMedBold(k) !== m && n++ < 180) tik(k, DT);
  assert.equal(spillerMedBold(k), m, 'makkeren fik bolden');
});

test('uden bold: «Aflever» skifter spiller, og «Skyd» er en tackling', () => {
  const k = iGang();
  const robot = k.hold[1].spillere[2];
  medBold(k, robot, 30, 50);
  robot.beskyttet = 0;
  const a = k.hold[0].spillere[2], b = k.hold[0].spillere[3];
  a.x = 10; a.y = 90; b.x = 32; b.y = 47;      // b står lige ved bolden
  k.styrer[0] = a.i;
  assert.equal(trykAflever(k, 0), true);
  assert.equal(styret(k, 0), b, 'skiftet til ham, der er tættest på bolden');
  k.rnd = () => 0;                               // tacklingen lykkes altid
  assert.equal(trykSkyd(k, 0), true);
  assert.equal(spillerMedBold(k), b, 'tacklingen gav ham bolden');
  assert.ok(typer(k).includes('tackling'));
});

test('bolden bliver på banen: banderne og stolperne sender den tilbage', () => {
  const k = iGang();
  const p = k.hold[0].spillere[2];
  medBold(k, p, 50, 50);
  k.bold.hos = null; k.bold.vx = 60; k.bold.vy = 3;
  tik(k, 0.5);
  assert.ok(k.bold.x <= B - RB + 1e-9 && k.bold.vx < 0, 'den kom tilbage fra banden');
  // En hel kamp mellem to robothold: alt holder sig inden for banen.
  const k2 = nyKamp({ hold: [robotHold(4), robotHold(5)], seed: 9 });
  let n = 0;
  while (k2.fase !== 'slut' && n++ < 20000) {
    tik(k2, DT * 3);
    for (const q of alleSpillere(k2)) assert.ok(q.x >= R - 1e-6 && q.x <= B - R + 1e-6 && q.y >= 0 && q.y <= L, 'spiller uden for banen');
    const b = k2.bold;
    assert.ok(b.x >= 0 && b.x <= B, 'bolden er uden for siden');
    assert.ok(b.y >= -2 && b.y <= L + 2, 'bolden er uden for enden');
    k2.hændelser.length = 0;
  }
  assert.equal(k2.fase, 'slut', 'kampen blev færdig');
});

test('står det lige, spilles der forlænget, og næste mål vinder', () => {
  const k = iGang();
  k.tid = KAMP_SEK - DT / 2;
  tik(k, DT * 2);
  assert.equal(k.forlænget, true);
  assert.equal(k.fase, 'spil');
  assert.equal(k.længde, KAMP_SEK + FORLAENGET_SEK);
  k.hold[1].ai = { ...k.hold[1].ai, keeper: 0 };
  const p = k.hold[0].spillere[2];
  medBold(k, p, 30, 18);
  k.hold[1].spillere[0].x = 4;
  trykSkyd(k, 0);
  let n = 0;
  while (k.fase === 'spil' && n++ < 200) tik(k, DT);
  assert.equal(k.fase, 'slut');
  assert.equal(k.vinder, 0);
  // Falder der intet mål i den forlængede, ender det uafgjort.
  const u = iGang();
  u.tid = KAMP_SEK + FORLAENGET_SEK - DT / 2; u.forlænget = true; u.længde = KAMP_SEK + FORLAENGET_SEK;
  u.hold[0].mål = u.hold[1].mål = 2;
  tik(u, DT * 2);
  assert.equal(u.fase, 'slut');
  assert.equal(u.vinder, null);
});

test('skudtræning: et mål er et point, og så kommer der en ny bold', () => {
  const k = nyTraening({ type: 'skud', seed: 4 });
  tik(k, KLAR_SEK + DT);
  assert.equal(k.fase, 'spil');
  assert.equal(k.hold[0].spillere.length, 1);
  assert.equal(k.hold[1].spillere.length, 1, 'kun en målmand');
  k.hold[1].ai = { ...k.hold[1].ai, keeper: 0 };
  const p = k.hold[0].spillere[0];
  p.x = 30; p.y = 16; k.bold.x = 30; k.bold.y = 16 - R - RB;
  k.hold[1].spillere[0].x = 4;
  assert.equal(trykSkyd(k, 0), true);
  let n = 0;
  while (k.point === 0 && n++ < 200) tik(k, DT);
  assert.equal(k.point, 1);
  tik(k, MAAL_PAUSE + DT);
  assert.equal(k.fase, 'spil');
  assert.equal(spillerMedBold(k), p, 'ny bold ved fødderne');
  // Uret løber ud
  k.tid = k.længde - DT / 2;
  tik(k, DT * 2);
  assert.equal(k.fase, 'slut');
});

test('kegleløb: drible hen til keglen, så er der et point og en ny kegle', () => {
  const k = nyTraening({ type: 'fart', seed: 2 });
  tik(k, KLAR_SEK + DT);
  const p = k.hold[0].spillere[0];
  assert.equal(spillerMedBold(k), p);
  const før = { ...k.kegle };
  let n = 0;
  while (k.point === 0 && n++ < 600) {
    const dx = k.kegle.x - p.x, dy = k.kegle.y - p.y;
    styr(k, 0, dx, dy);
    tik(k, DT);
  }
  assert.equal(k.point, 1, 'keglen blev nået');
  assert.notDeepEqual(k.kegle, før, 'en ny kegle');
  // Målene er lukket i kegleløbet: et spark mod målet giver ingen point.
  p.x = 30; p.y = 10; k.bold.hos = { h: 0, i: 0 }; styr(k, 0, 0, -1);
  trykSkyd(k, 0);
  tik(k, 2);
  assert.equal(k.fase, 'spil');
  assert.equal(k.point, 1);
});

test('afleveringstræning: aflever til den, der lyser – han spiller bolden tilbage', () => {
  const k = nyTraening({ type: 'aflevering', seed: 5 });
  tik(k, KLAR_SEK + DT);
  const p = k.hold[0].spillere[0];
  assert.equal(k.hold[0].spillere.length, 4, 'dig og tre makkere');
  const lys = k.hold[0].spillere[k.lyser];
  styr(k, 0, lys.x - p.x, lys.y - p.y);
  assert.equal(trykAflever(k, 0), true);
  styr(k, 0, 0, 0);
  assert.equal(styret(k, 0), p, 'man styrer stadig sig selv');
  let n = 0;
  while (k.point === 0 && n++ < 300) tik(k, DT);
  assert.equal(k.point, 1);
  n = 0;
  while (spillerMedBold(k) !== p && n++ < 400) tik(k, DT);
  assert.equal(spillerMedBold(k), p, 'bolden kom tilbage');
  // Til den forkerte makker: ingen point, men bolden kommer stadig tilbage.
  const forkert = k.hold[0].spillere.find(m => m.rolle === 'makker' && m.i !== k.lyser);
  styr(k, 0, forkert.x - p.x, forkert.y - p.y);
  trykAflever(k, 0);
  styr(k, 0, 0, 0);
  n = 0;
  while (!typer(k).includes('forkert') && n++ < 300) tik(k, DT);
  assert.ok(typer(k).includes('forkert'));
  assert.equal(k.point, 1);
});

test('erfaring: hvert point i træningen, og evnen stiger, når baren er fuld', () => {
  const p = nyProfil();
  assert.equal(p.evner.skud.n, 1);
  assert.equal(giErfaring(p, 'skud', krav(1) - 1), 0);
  assert.equal(giErfaring(p, 'skud', 1), 1);
  assert.equal(p.evner.skud.n, 2);
  assert.equal(p.evner.skud.xp, 0);
  const r = efterTraening(p, 'fart', 9);
  assert.equal(r.evne, 'fart');
  assert.equal(r.op, 1);
  assert.equal(r.penge, 4, 'en mønt for hvert andet point');
  giErfaring(p, 'aflevering', 100000);
  assert.equal(p.evner.aflevering.n, EVNE_MAKS, 'højere end 10 kommer man ikke');
  assert.equal(p.evner.aflevering.xp, 0);
  for (const [id, t] of Object.entries(TRAENING)) assert.ok(p.evner[t.evne], `${id} træner en evne, der findes`);
});

test('ligaen: sejr = næste hold og flere penge; nederlag = samme hold og stimen forfra', () => {
  const p = nyProfil();
  const s1 = efterKamp(p, 3, 1);
  assert.equal(s1.resultat, 'sejr');
  assert.equal(p.trin, 1);
  assert.equal(p.stime, 1);
  assert.ok(s1.penge >= 40 && p.penge === s1.penge);
  const u = efterKamp(p, 2, 2);
  assert.equal(u.resultat, 'uafgjort');
  assert.equal(p.trin, 1, 'uafgjort: samme hold igen');
  assert.equal(p.stime, 1, 'uafgjort: stimen står stille');
  const t = efterKamp(p, 0, 4);
  assert.equal(t.resultat, 'tab');
  assert.equal(p.stime, 0);
  assert.equal(p.best, 1);
  assert.equal(p.trin, 1, 'nederlag: samme hold igen');
  assert.ok(t.penge > 0 && t.penge < s1.penge, 'lidt penge for at have spillet');
  // Sejre højt oppe giver flere penge end sejre nede i bunden.
  const høj = nyProfil(); høj.trin = 7;
  assert.ok(efterKamp(høj, 1, 0).penge > efterKamp(nyProfil(), 1, 0).penge);
  // Det sidste hold: så er man mester, og bliver der.
  const m = nyProfil(); m.trin = LIGA.length - 1;
  const r = efterKamp(m, 2, 1);
  assert.equal(r.mester, true);
  assert.equal(m.trin, LIGA.length - 1);
  assert.equal(efterKamp(m, 2, 1).mester, false, 'mester-bonussen kommer kun én gang');
});

test('butikken: trøjer og støvler koster penge, og støvlerne gør holdet bedre', () => {
  const p = nyProfil();
  assert.equal(koeb(p, 'lyn').ok, false, 'uden penge kan man ikke købe');
  assert.match(koeb(p, 'lyn').grund, /mangler/);
  p.penge = 1000;
  assert.equal(koeb(p, 'lyn').ok, true);
  assert.equal(p.penge, 1000 - BUTIK.find(t => t.id === 'lyn').pris);
  assert.equal(koeb(p, 'lyn').ok, false, 'to par af de samme kan man ikke');
  assert.deepEqual(samledeEvner(p), { fart: 2, skud: 1, aflevering: 1 });
  assert.equal(koeb(p, 'guldstoevler').ok, true);
  assert.deepEqual(samledeEvner(p), { fart: 3, skud: 2, aflevering: 2 });
  assert.equal(koeb(p, 'groen').ok, true);
  assert.equal(p.troeje, 'groen', 'en ny trøje tages på med det samme');
  assert.equal(koeb(p, 'roed').ok, true, 'en trøje man har, kan man tage på igen');
  assert.equal(p.troeje, 'roed');
  assert.equal(koeb(p, 'findes-ikke').ok, false);
});

test('en gemt profil, der er gammel eller ødelagt, vælter ikke spillet', () => {
  assert.deepEqual(rensProfil(null), nyProfil());
  assert.deepEqual(rensProfil('rod'), nyProfil());
  const p = rensProfil({ penge: '55', evner: { fart: { n: 99, xp: 5 }, skud: { n: 3, xp: 1e9 } }, ejer: ['lyn', 'hax'], troeje: 'lyn', trin: 42, stime: -3 });
  assert.equal(p.penge, 55);
  assert.equal(p.evner.fart.n, EVNE_MAKS);
  assert.equal(p.evner.skud.n, 3);
  assert.ok(p.evner.skud.xp < krav(3));
  assert.ok(p.ejer.includes('lyn') && !p.ejer.includes('hax'));
  assert.equal(p.troeje, 'roed', 'støvler kan man ikke have på som trøje');
  assert.equal(p.trin, LIGA.length - 1);
  assert.equal(p.stime, 0);
});

test('ligaen bliver sværere: de sidste hold slår de første', () => {
  let sejre = 0;
  for (let s = 1; s <= 10; s++) { const [a, b] = spilKamp(robotHold(9), robotHold(0), s * 7919); if (a > b) sejre++; }
  assert.ok(sejre >= 9, `Verdensholdet slog Mopserne ${sejre} af 10 gange`);
  let midt = 0;
  for (let s = 1; s <= 10; s++) { const [a, b] = spilKamp(robotHold(6), robotHold(2), s * 7919); if (a > b) midt++; }
  assert.ok(midt >= 6, `hold 7 slog hold 3 ${midt} af 10 gange`);
});

test('en nybegynder kan slå de første hold – men skal træne for at slå de sidste', () => {
  const spiller = n => ({ navn: 'Dig', farve: '#e8413c', evner: { fart: n, skud: n, aflevering: n }, ai: AUTOPILOT });
  const mål = { goals: 0 };
  let v0 = 0, v9 = 0, v9trænet = 0;
  for (let s = 1; s <= 10; s++) {
    const [a, b] = spilKamp(spiller(1), robotHold(0), s * 7919); if (a > b) v0++; mål.goals += a + b;
    const [c, d] = spilKamp(spiller(1), robotHold(9), s * 7919); if (c > d) v9++;
    const [e, f] = spilKamp(spiller(11), robotHold(9), s * 7919); if (e > f) v9trænet++;
  }
  assert.ok(v0 >= 8, `utrænet mod Mopserne: ${v0} sejre af 10`);
  assert.ok(v9 <= 1, `utrænet mod Verdensholdet: ${v9} sejre af 10`);
  assert.ok(v9trænet >= 2, `trænet helt op mod Verdensholdet: ${v9trænet} sejre af 10`);
  assert.ok(mål.goals / 10 >= 1.5, `der skal falde mål (${(mål.goals / 10).toFixed(1)} pr. kamp)`);
});
