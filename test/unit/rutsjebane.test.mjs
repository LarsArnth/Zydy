// Rutsjebanen – banen, rytterne, robotterne og hoppet. Ingen browser:
//   node --test test/unit/rutsjebane.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  G, LAENGDE, SLUT, HALV, KANT, NAA, REAKT, FORH_R, RYTTER_R, LUFT_STYR, POOL_HB, POOL_HL, NEDTAELLING,
  haeld, topfart, lavSpor, sporPunkt, farTilHop, hopLaengde, nytLoeb, tik, koerFaerdig, stilling, placering,
  resultat, botLoeb, iMaal, PLADS_POINT, PLASK_POINT, giveBot, botStyr,
} from '../../public/spil/rutsjebane/rutsjebane.mjs';

const SEEDS = Array.from({ length: 24 }, (_, i) => i + 1);
const DT = 1 / 120;

/** Kører et løb, hvor du styrer med en funktion af løbet (eller et fast tal). */
function koer(l, styr, sek = 200) {
  for (let t = 0; t < sek && !l.slut; t += DT) tik(l, DT, typeof styr === 'function' ? styr(l) : styr);
  return l;
}

/** Et løb uden robotter og uden nedtælling – så ingen skubber til én. */
function alene(seed) {
  const l = nytLoeb(seed);
  l.rytter = [l.rytter[0]]; l.nedtael = 0;
  return l;
}

/* ---------- Farten ---------- */

test('banen bliver stejlere hele vejen, så topfarten stiger fra ~45 til ~90 km/t', () => {
  let forrige = 0;
  for (let s = 0; s < LAENGDE; s += 50) {
    assert.ok(haeld(s) < 0, 'det går nedad');
    const v = topfart(s);
    assert.ok(v > forrige, `topfarten stiger ikke ved ${s} m`);
    forrige = v;
  }
  assert.ok(topfart(0) * 3.6 > 40 && topfart(0) * 3.6 < 50);
  assert.ok(topfart(LAENGDE) * 3.6 > 85 && topfart(LAENGDE) * 3.6 < 100);
  assert.ok(haeld(SLUT) > 0.3, 'hopkanten peger opad til sidst');
});

test('ingen kører hurtigere end topfarten på stedet – det er den, forhindringerne regner med', () => {
  const l = nytLoeb(3);
  let v = 0;
  koer(l, lb => {
    for (const r of lb.rytter) if (r.fase === 'bane' && r.s < LAENGDE) v = Math.max(v, r.v / topfart(r.s));
    return Math.sin(lb.t);
  });
  assert.ok(v <= 1.0001, `nogen kørte ${(v * 100).toFixed(1)} % af topfarten`);
});

test('man kommer hurtigt op i fart, og et løb tager omkring et minut', () => {
  const l = botLoeb(5);
  const mig = l.rytter[0];
  assert.equal(mig.fase, 'plask');
  assert.ok(mig.tid > 50 && mig.tid < 80, `løbet tog ${mig.tid.toFixed(1)} s`);
});

/* ---------- Banen ---------- */

test('banen er den samme hver gang med samme frø – og en anden med et andet', () => {
  const a = lavSpor(7), b = lavSpor(7), c = lavSpor(8);
  assert.deepEqual(a.stykker, b.stykker);
  assert.notDeepEqual(a.stykker.map(p => p.kap), c.stykker.map(p => p.kap));
  const la = nytLoeb(7), lb = nytLoeb(7);
  assert.deepEqual(la.raekker, lb.raekker);
  assert.deepEqual(la.pool, lb.pool);
});

test('banen svinger, men forhindringszonen og det sidste stykke er lige', () => {
  for (const seed of SEEDS) {
    const sp = lavSpor(seed);
    const sving = sp.stykker.filter(p => p.kap !== 0).length;
    assert.ok(sving >= 5, `frø ${seed}: kun ${sving} sving`);
    for (let s = sp.zone.fra; s <= sp.zone.til; s += 2) assert.ok(Math.abs(sp.ved(s).kap) < 1e-9, `frø ${seed}: sving i zonen ved ${s}`);
    for (let s = LAENGDE - 150; s <= SLUT; s += 2) assert.ok(Math.abs(sp.ved(s).kap) < 1e-9, `frø ${seed}: sving på det sidste stykke ved ${s}`);
    assert.ok(sp.zone.fra > LAENGDE * 0.3 && sp.zone.til < LAENGDE * 0.8, 'zonen ligger midtvejs');
    // Ingen ryk i banen: retningen ændrer sig blødt
    for (let i = 2; i < sp.N; i++) assert.ok(Math.abs(sp.kap[i] - sp.kap[i - 1]) < 0.003, `frø ${seed}: ryk i krumningen`);
  }
});

test('renden trækker ind mod midten, og i et sving skubber farten én udad', () => {
  const l = alene(4);
  const mig = l.rytter[0];
  mig.s = 100; mig.v = topfart(100); mig.u = 3; mig.du = 0;
  for (let i = 0; i < 240; i++) tik(l, DT, 0);
  assert.ok(Math.abs(mig.u) < 0.8, `uden styring glider man ned mod midten (u = ${mig.u.toFixed(2)})`);
  // Find et skarpt sving og kør igennem det uden at styre: man ender ude på den ydre side
  const sp = l.spor;
  let sS = null;
  for (let s = 300; s < LAENGDE - 200; s += 1) if (Math.abs(sp.ved(s).kap) > 0.012) { sS = s; break; }
  assert.ok(sS, 'der er et skarpt sving');
  const l2 = alene(4);
  const r = l2.rytter[0];
  r.s = sS; r.v = topfart(sS); r.u = 0;
  let ud = 0;
  for (let i = 0; i < 120; i++) { tik(l2, DT, 0); ud = Math.max(ud, -r.u * Math.sign(sp.ved(r.s).kap)); }
  assert.ok(ud > 0.5, `svinget skubber udad (${ud.toFixed(2)} m)`);
});

test('styringen virker – og man kan ikke komme længere ud end kanten', () => {
  const l = alene(2);
  const mig = l.rytter[0];
  mig.s = 60; mig.v = topfart(60);
  for (let i = 0; i < 120; i++) tik(l, DT, 1);
  assert.ok(mig.u > 2, `fuld styring til højre flytter én til højre (u = ${mig.u.toFixed(2)})`);
  for (let i = 0; i < 240; i++) tik(l, DT, -1);
  assert.ok(mig.u < -2, 'og til venstre');
  for (const seed of [1, 2, 3]) {
    const lb = nytLoeb(seed);
    koer(lb, lx => (lx.t % 4 < 2 ? 1 : -1));
    for (const r of lb.rytter) if (r.fase === 'bane') assert.ok(Math.abs(r.u) <= KANT + 1e-9);
  }
});

/* ---------- Forhindringerne ---------- */

test('der er altid et hul i en forhindringsrække, og man kan nå fra hul til hul', () => {
  for (const seed of SEEDS) {
    const l = nytLoeb(seed);
    assert.ok(l.raekker.length >= 4, `frø ${seed}: kun ${l.raekker.length} rækker`);
    let forrige = null;
    for (const rk of l.raekker) {
      assert.ok(rk.s > l.spor.zone.fra && rk.s < l.spor.zone.til, 'rækken ligger i zonen');
      assert.ok(rk.fri.includes(rk.hul), 'hullet er frit');
      assert.ok(Math.abs(rk.hul) <= 1.6, 'hullet ligger inde i renden');
      assert.ok(rk.ting.length >= 2, 'der står noget i vejen');
      // Hullet er bredt nok: ingen ting står tættere end en rytter kan komme forbi
      for (const tg of rk.ting) assert.ok(Math.abs(tg.u - rk.hul) >= FORH_R + RYTTER_R + 0.5, 'ting i hullet');
      const v = topfart(rk.s);
      if (forrige === null) {
        assert.ok(rk.s - l.spor.zone.fra >= v * ((HALV + Math.abs(rk.hul)) / NAA + REAKT) * 0.95, `frø ${seed}: den første række kommer for tidligt`);
      } else {
        const tid = (rk.s - forrige.s) / v;
        assert.ok(tid >= Math.abs(rk.hul - forrige.hul) / NAA + REAKT - 1e-9, `frø ${seed}: kan ikke nå fra hul til hul ved ${rk.s.toFixed(0)} m`);
      }
      forrige = rk;
    }
  }
});

test('rammer man en forhindring, mister man farten – og kan køre videre', () => {
  const l = nytLoeb(6); l.nedtael = 0;
  const mig = l.rytter[0];
  const rk = l.raekker[0], tg = rk.ting[0];
  mig.s = rk.s - 3; mig.u = tg.u; mig.du = 0; mig.v = 20;
  // Hold rytteren på sporet mod tingen
  let ramt = false;
  for (let i = 0; i < 60 && !ramt; i++) { mig.u = tg.u; mig.du = 0; ramt = tik(l, DT, 0).ramt; }
  assert.ok(ramt, 'forhindringen blev ramt');
  assert.ok(mig.v < 12, `farten faldt (${mig.v.toFixed(1)} m/s)`);
  assert.equal(mig.ramt, 1);
  assert.equal(mig.fase, 'bane', 'man kører videre');
});

/* ---------- Mønterne ---------- */

test('der ligger mønter hele vejen, og dem man kører igennem, tæller', () => {
  for (const seed of SEEDS.slice(0, 6)) {
    const l = nytLoeb(seed);
    assert.ok(l.moenter.length >= 60, `frø ${seed}: kun ${l.moenter.length} mønter`);
    for (const m of l.moenter) assert.ok(Math.abs(m.u) <= 3.2 && m.s > 0 && m.s < LAENGDE, 'mønten ligger i renden');
    const f = l.moenter.filter(m => m.s < LAENGDE / 3).length, b = l.moenter.filter(m => m.s > LAENGDE * 2 / 3).length;
    assert.ok(f > 10 && b > 10, 'både i starten og i slutningen');
  }
  // En rytter, der følger mønterne, samler dem
  const l = nytLoeb(9);
  const mig = l.rytter[0];
  koer(l, lb => {
    if (mig.fase !== 'bane') return 0;
    const m = lb.moenter.find(x => !x.taget && x.s > mig.s - 0.5);
    const maal = m && m.s - mig.s < mig.v * 1.2 ? m.u : 0;
    return Math.max(-1, Math.min(1, 1.5 * (maal - mig.u) + mig.u * 0.35 - 0.4 * mig.du));
  });
  assert.ok(mig.moenter >= 25, `kun ${mig.moenter} mønter`);
  const r = resultat(l);
  assert.equal(r.dele.moenter, mig.moenter, 'mønterne tæller med i pointene');
});

/* ---------- Hoppet og bassinet ---------- */

test('bassinet kan altid rammes med styring i luften – også lidt under topfart', () => {
  const vTop = farTilHop(topfart(LAENGDE));
  for (const seed of SEEDS) {
    const l = nytLoeb(seed);
    const P = l.pool;
    for (const f of [1, 0.86]) {
      const { b, t } = hopLaengde(vTop * f);
      assert.ok(Math.abs(b - P.zc) < POOL_HL - 1, `frø ${seed}: ved ${f * 100} % af topfarten lander man ${b.toFixed(1)} m fremme (bassinet ${P.zc.toFixed(1)} ± ${POOL_HL})`);
      // Fra midten af renden, med fuld styring i luften, når man bassinets midte
      const naar = 0.5 * LUFT_STYR * t * t;
      assert.ok(naar > Math.abs(P.ox) + 1, `frø ${seed}: man når kun ${naar.toFixed(1)} m til siden, bassinet er ${P.ox.toFixed(1)} m ude`);
    }
  }
});

test('bassinet ligger aldrig lige ud for hoppet: den, der ikke styrer, rammer ikke', () => {
  for (const seed of SEEDS) {
    const l = nytLoeb(seed);
    assert.ok(Math.abs(l.pool.ox) >= POOL_HB + 3, 'bassinet ligger ude til siden');
    koer(l, 0);
    const mig = l.rytter[0];
    assert.ok(iMaal(mig));
    assert.notEqual(mig.fase, 'plask', `frø ${seed}: ramte bassinet uden at styre`);
  }
});

test('lander man i bassinet, er det PLASK; ved siden af er det fliserne eller ud over verden', () => {
  const l = botLoeb(11);
  const mig = l.rytter[0];
  assert.equal(mig.fase, 'plask');
  assert.ok(Math.abs(mig.land.a - l.pool.ox) <= POOL_HB && Math.abs(mig.land.b - l.pool.zc) <= POOL_HL);
  assert.ok(mig.tid > 0);
  // Styrer man hele vejen den forkerte vej i luften, flyver man ud over verden
  const l2 = nytLoeb(11);
  const r = l2.rytter[0];
  koer(l2, lb => r.fase === 'luft' ? -Math.sign(lb.pool.ox) : 0);
  assert.equal(r.fase, 'ude', 'ud over verden');
  const res = resultat(l2);
  assert.equal(res.plads, null, 'ingen plads uden plask');
  assert.equal(res.dele.plads + res.dele.plask, 0);
});

/* ---------- Robotterne, placeringen og pointene ---------- */

test('løbet starter med en nedtælling, og alle fire kører', () => {
  const l = nytLoeb(1);
  assert.equal(l.rytter.length, 4);
  assert.deepEqual(l.rytter.map(r => r.robot), [false, true, true, true]);
  for (let t = 0; t < NEDTAELLING - 0.1; t += DT) tik(l, DT, 1);
  assert.ok(l.rytter.every(r => r.s === 0), 'ingen kører før KØR!');
  let startet = false;
  for (let i = 0; i < 30; i++) startet = tik(l, DT, 0).start || startet;
  assert.ok(startet, 'KØR!');
  for (let i = 0; i < 240; i++) tik(l, DT, 0);
  assert.ok(l.rytter.every(r => r.s > 5), 'alle er kørt');
});

test('robotterne kommer i mål – de bedste oftest i bassinet og hurtigst', () => {
  const plask = { Bip: 0, Bop: 0, Bolt: 0 }, tid = { Bip: 0, Bop: 0, Bolt: 0 }, n = { Bip: 0, Bop: 0, Bolt: 0 };
  for (const seed of SEEDS) {
    const l = koer(nytLoeb(seed), 0);
    koerFaerdig(l);
    assert.ok(l.slut, 'løbet blev færdigt');
    for (const r of l.rytter.slice(1)) {
      assert.ok(iMaal(r));
      if (r.fase === 'plask') { plask[r.navn]++; tid[r.navn] += r.tid; n[r.navn]++; }
    }
  }
  assert.ok(plask.Bolt >= plask.Bip && plask.Bop >= plask.Bip, 'de dygtige rammer oftere');
  assert.ok(plask.Bip >= SEEDS.length * 0.6, 'selv Bip rammer det meste af tiden');
  assert.ok(plask.Bip < SEEDS.length, 'men Bip rammer ved siden af en gang imellem');
  assert.ok(tid.Bolt / n.Bolt < tid.Bop / n.Bop && tid.Bop / n.Bop < tid.Bip / n.Bip, 'Bolt er hurtigst, Bip langsomst');
});

test('en dygtig spiller vinder tit, men ikke altid – og den, der sjusker, taber til Bolt', () => {
  const plads = s => resultat(botLoeb(s.seed, s.skill, s.binaer)).plads;
  let vundet = 0, sjusk = 0;
  for (const seed of SEEDS) {
    if (plads({ seed, skill: 1, binaer: true }) === 1) vundet++;
    if (plads({ seed, skill: 0.4, binaer: true }) === 1) sjusk++;
  }
  // En dygtig finger (kun helt til venstre, helt til højre eller ingenting)
  assert.ok(vundet >= SEEDS.length * 0.4 && vundet < SEEDS.length, `en dygtig spiller vandt ${vundet} af ${SEEDS.length}`);
  assert.ok(sjusk < vundet, `den sjuskede vandt ${sjusk}, den dygtige ${vundet}`);
});

test('pointene: mønter + plads + plask (+ midt i)', () => {
  const l = botLoeb(2);
  const r = resultat(l);
  assert.equal(r.fase, 'plask');
  assert.ok(r.plads >= 1 && r.plads <= 4);
  assert.equal(r.dele.plads, PLADS_POINT[r.plads - 1]);
  assert.equal(r.dele.plask, PLASK_POINT);
  assert.equal(r.point, r.dele.moenter + r.dele.plads + r.dele.plask + r.dele.midt);
  assert.equal(r.raekke.length, 4);
  assert.equal(r.raekke[r.plads - 1], l.rytter[0], 'rækken står i den rigtige rækkefølge');
  assert.equal(placering(l), r.plads, 'placeringen følger rækken');
  assert.equal(stilling(l)[0].fase, 'plask');
});

test('pengene koster fart: den, der kører efter dem, får flere – men kommer senere i mål', () => {
  let penge = 0, uden = 0, tidP = 0, tidU = 0;
  for (const seed of SEEDS.slice(0, 10)) {
    for (const p of [true, false]) {
      const l = nytLoeb(seed);
      const mig = giveBot(l.rytter[0], 1, seed, p);
      koer(l, lb => (lb.nedtael > 0 ? 0 : botStyr(lb, mig, DT)));
      assert.equal(mig.fase, 'plask');
      if (p) { penge += mig.moenter; tidP += mig.tid; } else { uden += mig.moenter; tidU += mig.tid; }
    }
  }
  assert.ok(penge > uden * 1.6, `penge-botten fik ${penge}, den anden ${uden}`);
  assert.ok(tidP > tidU, 'og kom senere i mål');
});
