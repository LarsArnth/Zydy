// Til søs! – vinden, båden, skærene og uvejret. Ingen browser:
//   node --test test/unit/sejl.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BREDDE, KYST, BAAD_R, MAKS_FART, ROR, VINDOEJE, VIND_RUM, LIV, USAARLIG,
  SKAER_FRA, RAEKKE, GAB, STORM_START, STORM_FART, STORM_MAKS, STORM_HALE,
  wrap, fartFor, opMod, raekkeSkaer, naerRaekker, nySejlads, tik, koer, bot, stormFart,
} from '../../public/spil/sejl/baad.mjs';

const SEEDS = [1, 2, 3, 7, 42, 99, 123];
const gns = a => a.reduce((x, y) => x + y, 0) / a.length;
const grader = g => (g * Math.PI) / 180;

/* ---------- Fartkurven: en rigtig sejlbåds ---------- */

test('lige op mod vinden ligger man næsten stille, halvvind er hurtigst', () => {
  assert.ok(fartFor(0) < 0.1, 'i vindøjet er der ingen fart');
  assert.ok(fartFor(grader(90)) > 0.95, 'halvvind er (næsten) fuld fart');
  assert.equal(fartFor(grader(100)), 1, 'og dér er toppen');
  assert.ok(fartFor(grader(180)) > 0.6 && fartFor(grader(180)) < 0.8, 'læns er pænt men ikke bedst');
  assert.ok(fartFor(grader(52)) > fartFor(grader(38)), 'jo mere man falder af, jo hurtigere');
});

test('fartkurven er glat nok: ingen hop og aldrig uden for [0,1]', () => {
  let sidst = fartFor(0);
  for (let g = 0; g <= 180; g += 0.5) {
    const f = fartFor(grader(g));
    assert.ok(f >= 0 && f <= 1, `fartFor(${g}°) = ${f}`);
    assert.ok(Math.abs(f - sidst) < 0.03, `hop ved ${g}°`);
    sidst = f;
  }
});

test('opMod måler vinklen til vindøjet begge veje', () => {
  assert.equal(opMod(0, 0), 0, 'stik mod vinden');
  assert.ok(Math.abs(opMod(grader(90), 0) - grader(90)) < 1e-9);
  assert.ok(Math.abs(opMod(grader(-90), 0) - grader(90)) < 1e-9, 'samme vinkel i begge sider');
  assert.ok(Math.abs(opMod(Math.PI, 0) - Math.PI) < 1e-9, 'lige væk fra vinden');
  assert.ok(Math.abs(opMod(grader(-170), grader(170)) - grader(20)) < 1e-9, 'og der foldes rigtigt om ±180°');
});

/* ---------- Skærene ---------- */

test('rækkerne er de samme hver gang med samme frø – og andre med et andet', () => {
  for (let n = 0; n < 20; n++) {
    assert.deepEqual(raekkeSkaer(7, n), raekkeSkaer(7, n));
  }
  const ens = [...Array(20).keys()].every(n => raekkeSkaer(7, n).gab === raekkeSkaer(8, n).gab);
  assert.equal(ens, false, 'to frø må ikke give det samme hav');
});

test('sejlrenden er altid fri og altid inde på havet', () => {
  for (const seed of SEEDS) {
    for (let n = 0; n < 120; n++) {
      const r = raekkeSkaer(seed, n);
      assert.ok(r.gab - GAB / 2 >= KYST, `frø ${seed} række ${n}: renden går ind i stranden`);
      assert.ok(r.gab + GAB / 2 <= BREDDE - KYST, `frø ${seed} række ${n}: renden går ind i stranden`);
      for (const k of r.skaer) {
        assert.ok(Math.abs(k.x - r.gab) >= GAB / 2 + k.r + BAAD_R,
          `frø ${seed} række ${n}: et skær spærrer sejlrenden`);
        assert.ok(Math.abs(k.y - r.y) <= 4.5 + 1e-9, 'skærene ligger ved deres række');
      }
      assert.equal(r.boejer.length, 2, 'renden er markeret med to sømærker');
      assert.equal(r.boejer[0].farve, 'roed');
      assert.equal(r.boejer[1].farve, 'groen');
      assert.ok(r.boejer[0].x < r.gab && r.boejer[1].x > r.gab, 'rødt til venstre, grønt til højre');
    }
  }
});

test('naerRaekker finder rækkerne omkring y og ingen andre', () => {
  const r = naerRaekker(7, SKAER_FRA + RAEKKE * 3);
  assert.ok(r.length >= 1);
  for (const x of r) assert.ok(Math.abs(x.y - (SKAER_FRA + RAEKKE * 3)) <= 16 + 1e-9);
  assert.deepEqual(naerRaekker(7, -50), [], 'ved starten er der åbent hav');
});

/* ---------- Vinden og roret ---------- */

test('en frisk tur ligger midt på havet med kursen mod nord', () => {
  const s = nySejlads(7);
  assert.equal(s.x, BREDDE / 2);
  assert.equal(s.y, 0);
  assert.equal(s.kurs, 0);
  assert.equal(s.liv, LIV);
  assert.equal(s.doed, false);
  assert.ok(Math.abs(s.vindFra) >= Math.PI / 3 && Math.abs(s.vindFra) <= Math.PI / 2,
    'vinden starter ind fra siden, så starten er hurtig');
});

test('roret drejer båden – og turen er den samme hver gang', () => {
  const a = nySejlads(7), b = nySejlads(7);
  for (let i = 0; i < 300; i++) { tik(a, 1 / 60, 1); tik(b, 1 / 60, 1); }
  assert.ok(a.kurs > 0.5, 'roret drejer mod højre');
  assert.deepEqual({ x: a.x, y: a.y, kurs: a.kurs, vindFra: a.vindFra }, { x: b.x, y: b.y, kurs: b.kurs, vindFra: b.vindFra });
  const c = nySejlads(7);
  for (let i = 0; i < 300; i++) tik(c, 1 / 60, -1);
  assert.ok(c.kurs < -0.5, 'og mod venstre');
});

test('vinden drejer roligt mod sin plan og holder sig i vindrummet', () => {
  const s = nySejlads(42);
  let stoersteSkridt = 0, sidst = s.vindFra, skift = 0;
  for (let i = 0; i < 60 * 120; i++) {
    if (tik(s, 1 / 60, 0).vindskifte) skift++;
    stoersteSkridt = Math.max(stoersteSkridt, Math.abs(wrap(s.vindFra - sidst)));
    sidst = s.vindFra;
    if (s.doed) break;
  }
  assert.ok(skift >= 3, 'vinden springer med jævne mellemrum');
  assert.ok(stoersteSkridt < 0.01, 'men den drejer roligt – aldrig i hop');
  assert.ok(Math.abs(s.vindMaal) <= VIND_RUM + 1e-9, 'og aldrig helt agterfra');
});

test('i vindøjet blafrer sejlet og farten dør; halvvind giver fuld fart', () => {
  const stampe = nySejlads(7);
  stampe.vindFra = stampe.vindMaal = 0; stampe.plan = [];
  for (let i = 0; i < 60 * 8; i++) tik(stampe, 1 / 60, 0);
  assert.equal(stampe.blafrer, true);
  assert.ok(stampe.blafT > 7, 'blafretiden tæller op');
  assert.ok(stampe.fart < 1, `man ligger og stamper (${stampe.fart.toFixed(2)} m/s)`);

  const halv = nySejlads(7);
  halv.vindFra = halv.vindMaal = Math.PI / 2; halv.plan = [];
  for (let i = 0; i < 60 * 8; i++) tik(halv, 1 / 60, 0);
  assert.equal(halv.blafrer, false);
  assert.ok(halv.fart > MAKS_FART * 0.9, `halvvind giver næsten fuld fart (${halv.fart.toFixed(1)} m/s)`);
  assert.ok(halv.y > stampe.y * 5, 'og man kommer faktisk af sted');
});

/* ---------- Skader ---------- */

test('et skær koster et liv og farten – og lige efter er man usårlig', () => {
  const s = nySejlads(7);
  // Find et skær og sejl lige ind i det.
  const k = naerRaekker(7, SKAER_FRA)[0].skaer[0];
  s.x = k.x; s.y = k.y - k.r - BAAD_R - 0.5; s.kurs = 0; s.fart = 10;
  s.vindFra = s.vindMaal = Math.PI; s.plan = [];   // medvind, så kursen holder
  let e = null;
  for (let i = 0; i < 200 && !e; i++) { const h = tik(s, 1 / 60, 0); if (h.ramt) e = h; }
  assert.equal(e.ramt, 'skaer');
  assert.equal(s.liv, LIV - 1);
  assert.ok(s.usaarlig > 0 && s.usaarlig <= USAARLIG);
  assert.ok(s.fart < 4, 'sammenstødet tager farten');
  assert.ok(Math.hypot(s.x - k.x, s.y - k.y) >= k.r + BAAD_R - 1e-6, 'og båden skubbes ud af skæret');
  // Mens man er usårlig, koster det næste ikke.
  const livFoer = s.liv;
  s.x = k.x; s.y = k.y;
  tik(s, 1 / 60, 0);
  assert.equal(s.liv, livFoer, 'lige efter et skær er man usårlig et øjeblik');
});

test('tre skær og båden synker', () => {
  const s = nySejlads(7);
  const k = naerRaekker(7, SKAER_FRA)[0].skaer[0];
  for (let n = 0; n < LIV; n++) {
    s.usaarlig = 0;
    s.x = k.x; s.y = k.y; s.fart = 8;
    tik(s, 1 / 60, 0);
  }
  assert.equal(s.liv, 0);
  assert.equal(s.doed, true);
  assert.equal(s.aarsag, 'skaer');
});

test('stranden koster også – og skubber en ind på havet igen', () => {
  const s = nySejlads(7);
  s.kurs = Math.PI / 2; s.fart = 10;                 // stik mod højre strand
  s.vindFra = s.vindMaal = -Math.PI / 2; s.plan = []; // medvind derover
  let e = null;
  for (let i = 0; i < 60 * 6 && !e; i++) { const h = tik(s, 1 / 60, 0); if (h.ramt) e = h; }
  assert.equal(e.ramt, 'grund');
  assert.equal(s.liv, LIV - 1);
  assert.ok(s.x <= BREDDE - KYST - BAAD_R + 1e-9, 'båden står ikke oppe på stranden');
});

/* ---------- Uvejret ---------- */

test('uvejret tager til, men bliver aldrig hurtigere end båden på sit bedste', () => {
  assert.equal(stormFart(0), STORM_FART);
  assert.ok(stormFart(60) > stormFart(10));
  assert.equal(stormFart(100000), STORM_MAKS);
  assert.ok(STORM_MAKS < MAKS_FART, 'på den perfekte kurs kan man holde sig foran');
});

test('bliver man liggende, tager uvejret en – og det sakker aldrig helt agterud', () => {
  const s = nySejlads(7);
  s.vindFra = s.vindMaal = 0; s.plan = [];           // vindøjet: båden kommer ingen vegne
  let taget = false;
  for (let i = 0; i < 60 * 120 && !taget; i++) taget = tik(s, 1 / 60, 0).taget;
  assert.equal(taget, true, 'uvejret skal nå en, når man ligger stille');
  assert.equal(s.aarsag, 'uvejr');
  assert.ok(s.t > 8, 'men ikke med det samme – der er et forspring');

  const u = nySejlads(7);
  u.vindFra = u.vindMaal = Math.PI / 2; u.plan = [];
  let vaerst = 0;
  for (let i = 0; i < 60 * 30 && !u.doed; i++) { tik(u, 1 / 60, 0); vaerst = Math.max(vaerst, u.y - u.storm); }
  assert.ok(vaerst <= STORM_HALE + 1, 'uvejret hænger i hælene, uanset hvor godt det går');
});

test('når man er død, sker der ikke mere', () => {
  const s = koer(7, 400);
  assert.equal(s.doed, true, 'turen skal slutte af sig selv');
  const foer = { x: s.x, y: s.y, meter: s.meter, liv: s.liv };
  const e = tik(s, 1 / 60, 1);
  assert.deepEqual({ x: s.x, y: s.y, meter: s.meter, liv: s.liv }, foer);
  assert.equal(e.taget || e.sunket, false, 'man dør kun én gang');
});

/* ---------- Balancen: kan det sejles? ---------- */

test('botten sejler langt – så havet kan faktisk besejles', () => {
  const ture = SEEDS.map(seed => koer(seed, 400));
  for (const s of ture) {
    assert.equal(s.doed, true, 'alle ture skal slutte af sig selv');
    assert.ok(s.meter > 250, `frø ${s.seed}: botten nåede kun ${s.meter} m`);
    assert.ok(Number.isFinite(s.x) && Number.isFinite(s.y) && Number.isFinite(s.fart), 'ingenting bliver til ingenting');
  }
  assert.ok(gns(ture.map(s => s.meter)) > 400, `en almindelig tur skal være et godt stykke (${gns(ture.map(s => s.meter)).toFixed(0)} m)`);
});

test('den der bruger vinden, kommer længere end den der bare sejler ligeud', () => {
  const dygtige = SEEDS.map(seed => koer(seed, 400).meter);
  const ligeud = SEEDS.map(seed => koer(seed, 400, () => 0).meter);
  assert.ok(gns(dygtige) > 1.15 * gns(ligeud),
    `det skal kunne betale sig at styre (${gns(ligeud).toFixed(0)} mod ${gns(dygtige).toFixed(0)} m)`);
});

test('meter følger med bådens y og går aldrig baglæns', () => {
  const s = nySejlads(3);
  let sidst = 0;
  for (let i = 0; i < 60 * 60 && !s.doed; i++) {
    tik(s, 1 / 60, bot(s, 1.2));
    assert.ok(s.meter >= sidst);
    sidst = s.meter;
  }
  assert.equal(s.meter, Math.max(s.meter, Math.floor(s.y)));
});
