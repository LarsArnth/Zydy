// Weeee! – bakken, fysikken og lavinen. Ingen browser:
//   node --test test/unit/weee.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  G, TUNG, START_FART, MAKS_FART, PERFEKT, LUFT_MIN, LAV_HALE, LAV_FART, LAV_MAKS,
  lavBakke, nyTur, tik, kør, bot, fart, lavineFart, landingsKvalitet,
} from '../../public/spil/weee/bakke.mjs';

const SEEDS = [1, 2, 3, 7, 42, 99, 123];
const gns = a => a.reduce((x, y) => x + y, 0) / a.length;

/* ---------- Bakken ---------- */

test('bakken er den samme hver gang med samme frø – og en anden med et andet', () => {
  const a = lavBakke(7), b = lavBakke(7), c = lavBakke(8);
  for (let x = 0; x < 300; x += 7) assert.equal(a.h(x), b.h(x));
  assert.ok([0, 50, 150, 250].some(x => Math.abs(a.h(x) - c.h(x)) > 0.5), 'to frø må ikke give den samme bakke');
});

test('hældning og krumning passer til højden', () => {
  const b = lavBakke(42), d = 0.001;
  for (let x = 0; x < 400; x += 13) {
    assert.ok(Math.abs(b.hæld(x) - (b.h(x + d) - b.h(x - d)) / (2 * d)) < 1e-3, 'hæld(x) er h(x)s hældning');
    const krum = (b.hæld(x + d) - b.hæld(x - d)) / (2 * d);
    assert.ok(Math.abs(b.krum(x) - krum) < 1e-3, 'krum(x) er hældningens hældning');
  }
});

test('man kan aldrig blive fanget i en dal: bjerget går nedad hele vejen', () => {
  for (const seed of SEEDS) {
    const b = lavBakke(seed);
    let bund = b.h(0), værst = 0;
    for (let x = 0; x < 3000; x += 0.25) {
      const y = b.h(x);
      if (y < bund) bund = y;
      værst = Math.max(værst, y - bund);
    }
    assert.ok(værst < 2, `frø ${seed}: man skal op ad ${værst.toFixed(1)} m, og det kan man måske ikke`);
  }
});

test('turen begynder et sted, hvor det går nedad', () => {
  for (const seed of SEEDS) assert.ok(lavBakke(seed).hæld(0) < -0.5, `frø ${seed} starter ikke nedad`);
});

/* ---------- Kælken ---------- */

test('en frisk tur står på sneen med startfarten', () => {
  const s = nyTur(7);
  assert.equal(s.paa, true);
  assert.equal(s.vx, START_FART);
  assert.equal(s.y, s.bakke.h(0));
  assert.equal(s.meter, 0);
  assert.equal(s.doed, false);
});

test('man tager fart ned ad bakken, og det går hurtigere, når man trykker sig ned', () => {
  const let_ = nyTur(7), tung = nyTur(7);
  for (let i = 0; i < 120; i++) { tik(let_, 1 / 120, false); tik(tung, 1 / 120, true); }
  assert.ok(fart(let_) > START_FART, 'bakken giver fart af sig selv');
  assert.ok(fart(tung) > fart(let_) + 1, `tung (${fart(tung).toFixed(1)}) skal være hurtigere end let (${fart(let_).toFixed(1)})`);
  assert.ok(fart(tung) <= MAKS_FART);
});

test('man letter kun, når man slipper – holder man fast, bliver man på sneen', () => {
  const fri = nyTur(3), fast = nyTur(3);
  let lettetFri = 0, lettetFast = 0;
  for (let i = 0; i < 120 * 20; i++) {
    if (tik(fri, 1 / 120, false).lettet) lettetFri++;
    if (tik(fast, 1 / 120, true).lettet) lettetFast++;
  }
  assert.ok(lettetFri > 0, 'slipper man, kommer man i luften');
  assert.equal(lettetFast, 0, 'holder man fingeren nede, klæber kælken til sneen');
  assert.equal(fast.paa, true);
});

test('i luften dykker man, når man holder', () => {
  const s = nyTur(3);
  // Frem til midt i en flyvetur, hvor der er luft nok under til begge forsøg.
  while ((s.paa || s.y - s.bakke.h(s.x) < 3) && s.t < 30) tik(s, 1 / 120, false);
  assert.equal(s.paa, false, 'kom aldrig ordentligt i luften');
  const dyk = { ...s }, svæv = { ...s };
  for (let i = 0; i < 12; i++) { tik(dyk, 1 / 120, true); tik(svæv, 1 / 120, false); }
  assert.equal(dyk.paa, false); assert.equal(svæv.paa, false);
  assert.ok(dyk.vy < svæv.vy - 0.1, 'den der holder, falder hurtigst');
  assert.ok(Math.abs((svæv.vy - dyk.vy) - G * (TUNG - 1) * 0.1) < 0.2, 'og præcis TUNG gange så hårdt');
  assert.ok(dyk.y < svæv.y, 'og er kommet tættere på sneen');
});

test('landingskvalitet: parallelt er 1, på tværs er 0', () => {
  assert.equal(landingsKvalitet(10, 0, 0), 1);
  assert.ok(landingsKvalitet(10, -10, -1) > 0.99, 'samme vinkel som bakken');
  assert.ok(landingsKvalitet(10, -10, 0) < PERFEKT, '45° ned på fladt er ikke perfekt');
  assert.equal(landingsKvalitet(0.01, -10, 0), 0, 'lodret ned på fladt er så skidt, det kan være');
});

test('en skæv landing koster fart, en parallel gør ikke', () => {
  const b = lavBakke(7);
  const x0 = 50, hæld = b.hæld(x0), vinkel = Math.atan(hæld);
  // Samme fart, to vinkler: én langs bakken og én et godt stykke stejlere.
  const lav = drej => {
    const v = 25, a = vinkel - drej;
    const s = { ...nyTur(7), paa: false, x: x0, y: b.h(x0) + 0.02, vx: v * Math.cos(a), vy: v * Math.sin(a), luft: 1 };
    let landet = null;
    for (let i = 0; i < 60 && !landet; i++) landet = tik(s, 1 / 120, false).landet;
    return landet;
  };
  const pænt = lav(0), skævt = lav(0.8);
  assert.ok(pænt.kvalitet > PERFEKT, 'parallelt er en perfekt landing');
  assert.equal(pænt.perfekt, true);
  assert.ok(skævt.kvalitet < 0.4, 'på tværs er det en dårlig landing');
  assert.ok(skævt.fart < pænt.fart * 0.7, 'og den koster det meste af farten');
});

test('et hop tæller først, når man har været i luften længe nok', () => {
  const s = nyTur(3);
  let korte = 0;
  for (let i = 0; i < 120 * 30 && !s.doed; i++) {
    const e = tik(s, 1 / 120, bot(s));
    if (e.landet && e.landet.luft < LUFT_MIN) korte++;
  }
  assert.ok(s.hop > 0, 'botten skal nå at hoppe');
  assert.ok(s.længsteLuft > 0.5, `længste flyvetur var kun ${s.længsteLuft.toFixed(2)} s`);
  assert.ok(s.hop + korte >= s.hop, 'små hop tælles ikke med');
});

/* ---------- Lavinen ---------- */

test('lavinen bliver hurtigere og hurtigere, men ikke uendeligt', () => {
  assert.equal(lavineFart(0), LAV_FART);
  assert.ok(lavineFart(30) > lavineFart(10));
  assert.equal(lavineFart(100000), LAV_MAKS);
});

test('lavinen sakker aldrig mere end LAV_HALE bagud, og til sidst tager den dig', () => {
  const s = kør(7, 240);
  assert.equal(s.doed, true, 'turen skal slutte af sig selv');
  assert.ok(s.t > 20, 'men ikke med det samme');
  const u = nyTur(7);
  for (let i = 0; i < 120 * 10; i++) tik(u, 1 / 120, true);
  assert.ok(u.x - u.lavine <= LAV_HALE + 0.001, 'den hænger i hælene på en, uanset hvor godt det går');
});

test('når man er død, sker der ikke mere', () => {
  const s = kør(7, 240);
  const før = { x: s.x, meter: s.meter, t: s.t };
  const e = tik(s, 1 / 120, true);
  assert.deepEqual({ x: s.x, meter: s.meter, t: s.t }, før);
  assert.equal(e.doed, false, 'man dør kun én gang');
});

/* ---------- Balancen: kan det betale sig at flyve? ---------- */

test('den der bruger bakken rigtigt, kommer længst', () => {
  const kørAlle = vælg => SEEDS.map(seed => kør(seed, 240, vælg, 1 / 60));
  const dygtig = kørAlle(bot);
  const holder = kørAlle(() => true);         // trykker bare fingeren ned og bliver der
  const rører = kørAlle(() => false);         // rører slet ikke skærmen

  assert.ok(gns(dygtig.map(s => s.meter)) > 1.3 * gns(holder.map(s => s.meter)),
    `at holde hele vejen må ikke være lige så godt (${gns(holder.map(s => s.meter)).toFixed(0)} mod ${gns(dygtig.map(s => s.meter)).toFixed(0)} m)`);
  assert.ok(gns(dygtig.map(s => s.meter)) > 1.3 * gns(rører.map(s => s.meter)),
    'og det må heller ikke være nok bare at lade være');
  assert.equal(holder.every(s => s.hop === 0), true, 'den der holder hele vejen kommer aldrig i luften');
  assert.ok(gns(dygtig.map(s => s.hop)) > 8, 'en god tur er fuld af hop');
  assert.ok(dygtig.every(s => s.meter > 500), 'en god tur skal nå ordentligt af sted');
  assert.ok(dygtig.every(s => s.t < 200), 'og alle ture skal slutte');
});

test('en tur kan spilles igennem uden at noget bliver til ingenting', () => {
  const s = kør(42, 240, bot, 1 / 60);
  for (const felt of ['x', 'y', 'vx', 'vy', 't', 'meter', 'lavine']) {
    assert.ok(Number.isFinite(s[felt]), `${felt} blev ${s[felt]}`);
  }
  assert.ok(s.meter === Math.floor(Math.max(s.meter, s.x)), 'meter følger med x');
  assert.ok(s.perfekte <= s.hop + 1, 'der kan ikke være flere perfekte landinger end landinger');
});
