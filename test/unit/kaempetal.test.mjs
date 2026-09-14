// Kæmpetal – tallet, hjælperne og loftet. Ingen browser:
//   node --test test/unit/kaempetal.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAKS, VOKSER, FINGER_VOKSER, FRAVAER_MAKS, HJAELPERE,
  nytSpil, klik, klikVaerdi, tik, koeb, pris, produktion, fravaer,
  formater, kortTal, milepael, gem, hent, sammenSum,
} from '../../public/spil/kaempetal/tal.mjs';

/* ---------- Selve tallet ---------- */

test('et frisk spil står på nul, og et klik giver 1', () => {
  const s = nytSpil();
  assert.equal(s.point, 0);
  assert.equal(s.ialt, 0);
  assert.equal(klik(s), 1);
  assert.equal(s.point, 1);
  assert.equal(s.ialt, 1);
});

test('MAKS er præcis det tal, Selma skrev – og det er et sikkert heltal', () => {
  assert.equal(MAKS, 9999999999999);
  assert.ok(MAKS < Number.MAX_SAFE_INTEGER);
});

test('guldfingeren fordobler klikket for hver man ejer', () => {
  const s = nytSpil();
  assert.equal(klikVaerdi(s), 1);
  s.antal.finger = 3;
  assert.equal(klikVaerdi(s), 8);
  assert.equal(klik(s), 8);
});

/* ---------- Butikken ---------- */

test('prisen stiger for hver man ejer – og guldfingeren stiger stejlere', () => {
  const mus = HJAELPERE.find(h => h.id === 'mus');
  assert.equal(pris('mus', 0), mus.pris);
  assert.equal(pris('mus', 1), Math.ceil(mus.pris * VOKSER));
  assert.ok(pris('mus', 10) > pris('mus', 9));
  const finger = HJAELPERE.find(h => h.id === 'finger');
  assert.equal(pris('finger', 2), Math.ceil(finger.pris * FINGER_VOKSER * FINGER_VOKSER));
  assert.equal(pris('pjat', 0), null, 'ukendte varer har ingen pris');
});

test('køb trækker fra banken men aldrig fra det samlede tal', () => {
  const s = nytSpil();
  assert.equal(koeb(s, 'mus'), false, 'uden penge intet køb');
  s.point = 100; s.ialt = 100;
  assert.equal(koeb(s, 'mus'), true);
  assert.equal(s.antal.mus, 1);
  assert.equal(s.point, 100 - pris('mus', 0));
  assert.equal(s.ialt, 100, 'scoren er alt man har tjent – køb rører den ikke');
});

/* ---------- Produktionen ---------- */

test('hjælperne producerer deres sek-tal tilsammen', () => {
  const s = nytSpil();
  assert.equal(produktion(s), 0);
  s.antal.mus = 3; s.antal.kat = 2;
  assert.equal(produktion(s), 3 * 1 + 2 * 8);
});

test('tik samler brøkdele, til der er en hel', () => {
  const s = nytSpil();
  s.antal.mus = 1;                        // 1 point i sekundet
  assert.equal(tik(s, 0.4), 0);
  assert.equal(tik(s, 0.4), 0);
  assert.equal(tik(s, 0.4), 1, '3 × 0,4 sek. á 1/s er blevet til ét helt point');
  assert.equal(s.point, 1);
});

test('fravær giver produktion, men højst 8 timer', () => {
  const s = nytSpil();
  s.antal.mus = 10;                       // 10/s
  assert.equal(fravaer(s, 3600), 36000, 'en time væk giver en times produktion');
  const t = nytSpil();
  t.antal.mus = 10;
  assert.equal(fravaer(t, 100 * 3600), 10 * FRAVAER_MAKS, 'en uge væk giver kun loftet');
  assert.equal(fravaer(nytSpil(), -5), 0, 'tiden går ikke baglæns');
});

/* ---------- Loftet ---------- */

test('hverken klik, tik eller fravær kan komme over MAKS', () => {
  const s = nytSpil();
  s.point = MAKS - 2; s.ialt = MAKS - 2; s.antal.finger = 10;   // klik på 1024
  klik(s);
  assert.equal(s.point, MAKS);
  assert.equal(s.ialt, MAKS);
  s.antal.sorthul = 100;
  tik(s, 3600);
  assert.equal(s.ialt, MAKS, 'tallet står fast på loftet');
  fravaer(s, 3600);
  assert.equal(s.ialt, MAKS);
});

/* ---------- Tal som tekst ---------- */

test('formater sætter punktummer som på dansk', () => {
  assert.equal(formater(0), '0');
  assert.equal(formater(999), '999');
  assert.equal(formater(1000), '1.000');
  assert.equal(formater(1234567), '1.234.567');
  assert.equal(formater(MAKS), '9.999.999.999.999');
});

test('kortTal forkorter store tal med danske navne', () => {
  assert.equal(kortTal(999), '999');
  assert.equal(kortTal(15000), '15.000');
  assert.equal(kortTal(1500000), '1,5 mio.');
  assert.equal(kortTal(2000000000), '2 mia.');
  assert.equal(kortTal(1200000000000), '1,2 bio.');
  assert.equal(kortTal(555000000), '555 mio.');
});

test('milepæle er tierpotenser – og til sidst selve MAKS', () => {
  assert.equal(milepael(999), 0);
  assert.equal(milepael(1000), 1000);
  assert.equal(milepael(999999), 100000);
  assert.equal(milepael(1e12 + 5), 1e12);
  assert.equal(milepael(MAKS), MAKS);
});

/* ---------- Gem og hent ---------- */

test('gem og hent er hinandens modsatte', () => {
  const s = nytSpil();
  s.point = 1234; s.ialt = 5678; s.antal.mus = 4; s.antal.finger = 2; s.fejret = true;
  const t = hent(gem(s));
  assert.equal(t.point, 1234);
  assert.equal(t.ialt, 5678);
  assert.equal(t.antal.mus, 4);
  assert.equal(t.antal.finger, 2);
  assert.equal(t.fejret, true);
});

test('skrald i localStorage bliver bare et nyt spil', () => {
  for (const skrald of ['', 'øh', '{"point":"NaN"}', '[]', '{"point":-4,"ialt":1e20}']) {
    const s = hent(skrald);
    assert.ok(s.point >= 0 && s.point <= MAKS, `«${skrald}» gav point ${s.point}`);
    assert.ok(s.ialt >= 0 && s.ialt <= MAKS);
    assert.equal(typeof s.antal.mus, 'number');
  }
  const snyd = hent('{"point": 999999999999999999}');
  assert.equal(snyd.point, MAKS, 'over loftet klippes til loftet');
});

test('banken kan aldrig hentes større end det tjente', () => {
  const s = hent('{"point": 500, "ialt": 10}');
  assert.ok(s.ialt >= s.point);
});

/* ---------- Sammen ---------- */

test('to venners tal lægges sammen – med samme loft', () => {
  assert.equal(sammenSum(100, 200), 300);
  assert.equal(sammenSum(MAKS, MAKS), MAKS, 'heller ikke to venner kommer over loftet');
  assert.equal(sammenSum(NaN, 50), 50, 'skrald tæller som nul');
  assert.equal(sammenSum(-10, 50), 50);
});

/* ---------- Balancen: loftet skal kunne nås, men ikke på en eftermiddag ---------- */

test('en flittig spiller når det største tal på nogle dages spil', () => {
  const s = nytSpil();
  let sek = 0;
  const DT = 30;
  // Flittig: ~3 klik i sekundet, og køber altid den hjælper der giver mest for pengene.
  while (s.ialt < MAKS && sek < 60 * 24 * 3600) {
    for (let i = 0; i < 3 * DT; i++) klik(s);
    tik(s, DT);
    sek += DT;
    let bedst = null, vaerdi = 0;
    for (const h of HJAELPERE) {
      const p = pris(h.id, s.antal[h.id]);
      if (s.point >= p) {
        const v = h.id === 'finger' ? 2 / p : h.sek / p;
        if (v > vaerdi) { vaerdi = v; bedst = h.id; }
      }
    }
    if (bedst) koeb(s, bedst);
  }
  assert.equal(s.ialt, MAKS, 'loftet kan nås');
  assert.ok(sek > 3600, `men ikke på under en time (tog ${(sek / 3600).toFixed(1)} t)`);
  assert.ok(sek < 24 * 3600, `og heller ikke over et døgns uafbrudt spil (tog ${(sek / 3600).toFixed(1)} t)`);
});
