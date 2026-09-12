// Blokblasts motor: brikkerne, rydningen, pointene og hvornår spillet er slut.
//   node --test test/unit/blokblast.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SIDE, BAKKE, FORMER, FORM, nytBræt, kanLægges, passerNogetsteds, nogenPasser,
  fuldeLinjer, pointFor, læg, trækBrikker, bedsteTræk,
} from '../../public/spil/blokblast/blokke.mjs';

/** En terning man kan regne med. */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Bræt med de opgivne felter fyldt. */
const brætMed = felter => {
  const b = nytBræt();
  for (const [x, y] of felter) b[y * SIDE + x] = '#4d8dff';
  return b;
};

test('brikkerne er foldet ud til deres drejninger og passer med bredde/højde', () => {
  assert.ok(FORMER.length > 20, 'der skal være noget at vælge imellem');
  const set = new Set();
  for (const f of FORMER) {
    assert.ok(f.celler.length >= 1 && f.celler.length <= 9, `${f.id}: mærkelig størrelse`);
    assert.equal(Math.max(...f.celler.map(c => c[0])) + 1, f.bredde, `${f.id}: bredde`);
    assert.equal(Math.max(...f.celler.map(c => c[1])) + 1, f.højde, `${f.id}: højde`);
    assert.ok(f.bredde <= SIDE && f.højde <= SIDE, `${f.id}: kan ikke være på brættet`);
    assert.ok(f.celler.every(([x, y]) => x >= 0 && y >= 0), `${f.id}: skal ligge i hjørnet (0,0)`);
    const nøgle = f.celler.map(c => c.join(',')).join(' ');
    assert.equal(set.has(nøgle), false, `${f.id} er den samme brik som en anden`);
    set.add(nøgle);
    assert.equal(FORM[f.id], f, `${f.id} kan ikke slås op`);
  }
  // Firkanten ser ens ud drejet, femmeren har to stillinger, hjørnet fire.
  assert.equal(FORMER.filter(f => f.navn === 'Firkant').length, 1);
  assert.equal(FORMER.filter(f => f.navn === 'Fem').length, 2);
  assert.equal(FORMER.filter(f => f.navn === 'Hjørne').length, 4);
});

test('en brik skal være inden for brættet og på tomme felter', () => {
  const bræt = brætMed([[3, 3]]);
  const tre = FORM['tre'];                        // tre i træk vandret
  assert.equal(kanLægges(bræt, tre, 0, 0), true);
  assert.equal(kanLægges(bræt, tre, 6, 0), false, 'stikker ud over kanten');
  assert.equal(kanLægges(bræt, tre, -1, 0), false, 'uden for brættet');
  assert.equal(kanLægges(bræt, tre, 2, 3), false, 'oven i en klods der ligger');
  assert.equal(kanLægges(bræt, tre, 4, 3), true, 'lige ved siden af er fint');
  assert.equal(læg(bræt, tre, 2, 3), null, 'et ulovligt træk ændrer ingenting');
});

test('en fuld række forsvinder – og brættet er et nyt, ikke det gamle', () => {
  const bræt = brætMed(Array.from({ length: SIDE - 1 }, (_, x) => [x, 3]));
  const r = læg(bræt, FORM['prik'], 7, 3);
  assert.equal(r.antalLinjer, 1);
  assert.deepEqual(r.linjer.rækker, [3]);
  assert.deepEqual(r.linjer.søjler, []);
  assert.equal(r.bræt.filter(Boolean).length, 0, 'rækken er væk');
  assert.equal(r.ryddede.length, SIDE, 'alle otte felter meldes til animationen');
  assert.equal(bræt.filter(Boolean).length, SIDE - 1, 'det gamle bræt er urørt');
});

test('række og søjle kan ryddes i samme træk', () => {
  const felter = [];
  for (let x = 0; x < SIDE - 1; x++) felter.push([x, 5]);        // rækken mangler ét felt
  for (let y = 0; y < SIDE; y++) if (y !== 5) felter.push([7, y]); // søjlen mangler det samme
  const r = læg(brætMed(felter), FORM['prik'], 7, 5);
  assert.equal(r.antalLinjer, 2);
  assert.deepEqual(r.linjer.rækker, [5]);
  assert.deepEqual(r.linjer.søjler, [7]);
  assert.equal(r.bræt.filter(Boolean).length, 0);
  assert.equal(r.ryddede.length, SIDE * 2 - 1, 'hjørnefeltet tælles kun én gang');
});

test('point: felter for at lægge, meget mere for at rydde – og stimen ganger op', () => {
  assert.equal(pointFor(4, 0, 0), 4, 'uden rydning er det ét point pr. felt');
  assert.equal(pointFor(1, 1, 1), 1 + 10, 'én linje giver 10');
  assert.equal(pointFor(1, 2, 1), 1 + 40, 'to linjer på én gang giver fire gange så meget');
  assert.equal(pointFor(1, 3, 1), 1 + 90);
  assert.equal(pointFor(1, 1, 2), 1 + 15, 'anden rydning i træk: ×1,5');
  assert.equal(pointFor(1, 1, 4), 1 + 25, 'fjerde i træk: ×2,5');
  assert.equal(pointFor(1, 1, 9), 1 + 25, 'stimen stopper ved ×2,5');
});

test('stimen tælles op ved rydning og nulstilles, når man ikke rydder noget', () => {
  const næstenFuld = y => Array.from({ length: SIDE - 1 }, (_, x) => [x, y]);
  let r = læg(brætMed(næstenFuld(0)), FORM['prik'], 7, 0, 2);
  assert.equal(r.stime, 3, 'endnu en rydning i træk');
  assert.equal(r.point, pointFor(1, 1, 3));
  r = læg(nytBræt(), FORM['prik'], 0, 0, 3);
  assert.equal(r.stime, 0, 'et træk uden rydning slår stimen i stykker');
  assert.equal(r.point, 1);
});

test('fuldeLinjer ser både rækker og søjler', () => {
  const felter = [];
  for (let x = 0; x < SIDE; x++) felter.push([x, 2]);
  for (let y = 0; y < SIDE; y++) felter.push([4, y]);
  const l = fuldeLinjer(brætMed(felter));
  assert.deepEqual(l.rækker, [2]);
  assert.deepEqual(l.søjler, [4]);
});

test('spillet er slut, når ingen af brikkerne kan være nogen steder', () => {
  const alt = [];
  for (let y = 0; y < SIDE; y++) for (let x = 0; x < SIDE; x++) if (x > 1 || y > 1) alt.push([x, y]);
  const bræt = brætMed(alt);                       // kun et 2×2-hul i hjørnet
  assert.equal(passerNogetsteds(bræt, FORM['firkant']), true, 'en 2×2 kan lige være der');
  assert.equal(passerNogetsteds(bræt, FORM['stor']), false, 'en 3×3 kan ikke');
  assert.equal(nogenPasser(bræt, [FORM['stor'], FORM['stor'], FORM['stor']]), false, 'så er det slut');
  assert.equal(nogenPasser(bræt, [FORM['stor'], null, FORM['prik']]), true, 'en prik kan altid være der');
  assert.equal(nogenPasser(bræt, [null, null, null]), false, 'en tom bakke passer ikke nogen steder');
});

test('nye brikker: der kommer tre, og mindst én af dem kan lægges', () => {
  const rnd = mulberry32(5);
  for (let i = 0; i < 50; i++) {
    const brikker = trækBrikker(nytBræt(), rnd);
    assert.equal(brikker.length, BAKKE);
    assert.equal(nogenPasser(nytBræt(), brikker), true);
  }
  // Selv på et umuligt bræt kommer der brikker – så er spillet bare slut.
  const fuldt = [];
  for (let y = 0; y < SIDE; y++) for (let x = 0; x < SIDE; x++) fuldt.push([x, y]);
  const sidste = trækBrikker(brætMed(fuldt), rnd);
  assert.equal(sidste.length, BAKKE);
  assert.equal(nogenPasser(brætMed(fuldt), sidste), false);
});

test('bedsteTræk rydder linjen, når den kan', () => {
  const bræt = brætMed(Array.from({ length: SIDE - 1 }, (_, x) => [x, 0]));
  const t = bedsteTræk(bræt, [FORM['prik'], FORM['firkant'], null]);
  assert.equal(t.nr, 0, 'prikken er den, der fylder hullet');
  assert.deepEqual([t.x, t.y], [7, 0]);
  assert.equal(bedsteTræk(nytBræt(), [null, null, null]), null, 'ingen brikker, intet træk');
});

test('en hel omgang: den simple spiller holder brættet i gang i mange træk', () => {
  for (const seed of [1, 7, 42, 1234]) {
    const rnd = mulberry32(seed);
    let bræt = nytBræt(), brikker = trækBrikker(bræt, rnd), score = 0, stime = 0, træk = 0;
    while (træk < 2000) {
      const t = bedsteTræk(bræt, brikker);
      if (!t) break;
      const r = læg(bræt, t.form, t.x, t.y, stime);
      bræt = r.bræt; stime = r.stime; score += r.point;
      brikker[t.nr] = null;
      if (!brikker.some(Boolean)) brikker = trækBrikker(bræt, rnd);
      træk++;
    }
    assert.ok(træk >= 40, `seed ${seed}: kun ${træk} træk, før brættet var fyldt`);
    assert.ok(score >= 300, `seed ${seed}: kun ${score} point`);
    assert.ok(bræt.filter(Boolean).length <= SIDE * SIDE, 'brættet må ikke løbe over');
    assert.equal(nogenPasser(bræt, brikker), false, 'spillet stopper først, når intet passer');
  }
});
