// Pass or Die: bomben, reglerne, butikken og robotterne (public/spil/bombe/bombe.mjs).
// Kør:  node --test test/unit/bombe.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DT, KLAR_SEK, FLYV_SEK, FANG_SEK, PAUSE_SEK, MØNT_OVERLEV, TING, NIVEAUER,
  nyKamp, nyRunde, tik, giv, kanGive, koeb, kanKoebe, varme, levende,
} from '../../public/spil/bombe/bombe.mjs';

const fire = (robotter = [false, true, true, true]) => robotter.map((robot, i) => ({ navn: 'S' + i, robot }));
const mennesker = n => Array.from({ length: n }, (_, i) => ({ navn: 'M' + i }));

/** Kamp, hvor bomben ligger hos `hos`, og lunten lige er gået i gang. */
function iGang(opt = {}) {
  const k = nyKamp({ spillere: opt.spillere ?? mennesker(4), niveau: opt.niveau ?? 'easy', seed: opt.seed ?? 3 });
  tik(k, KLAR_SEK + DT);
  assert.equal(k.fase, 'spil');
  if (opt.hos != null) { k.bombe.hos = opt.hos; k.bombe.fang = 0; k.bombe.flyv = 0; }
  if (opt.lunte != null) k.bombe.lunte = opt.lunte;
  k.hændelser.length = 0;
  return k;
}

/** En hurtig finger: giver bomben videre `reak` sek. efter, den er grebet. */
function spilMedFinger(k, reak, køber) {
  let ur = 0;
  while (k.fase !== 'slut') {
    const b = k.bombe, v = varme(k);
    if (køber && k.fase === 'spil' && b.hos !== 0 && v > 0.6 && !kanKoebe(k, 0, 'skjold')) koeb(k, 0, 'skjold');
    if (k.fase === 'spil' && b.hos === 0 && b.fang <= 0) {
      ur += DT;
      if (ur >= reak) {
        const m = levende(k).filter(p => p.nr && p.skjold <= 0);
        if (m.length) {
          const t = m[(k.runde * 7 + b.afleveringer) % m.length].nr;
          if (køber && v > 0.5 && !kanKoebe(k, 0, 'frys', t)) koeb(k, 0, 'frys', t);
          giv(k, 0, t);
        }
        ur = 0;
      }
    } else ur = 0;
    tik(k, DT);
    k.hændelser.length = 0;
    assert.ok(k.tid < 3600, 'en runde må ikke vare evigt');
  }
}

test('en ny kamp: bomben lander hos én, og lunten går først efter «Klar…»', () => {
  const k = nyKamp({ spillere: fire(), niveau: 'medium', seed: 1 });
  assert.equal(k.fase, 'klar');
  assert.equal(k.runde, 1);
  assert.ok(k.bombe.hos >= 0 && k.bombe.hos < 4);
  const [a, b] = NIVEAUER.medium.lunte;
  assert.ok(k.bombe.lunte >= a && k.bombe.lunte <= b, 'lunten følger sværhedsgraden');
  tik(k, KLAR_SEK - 0.2);
  assert.equal(k.bombe.tid, 0, 'lunten står stille, mens bomben lander');
  tik(k, 0.3);
  assert.equal(k.fase, 'spil');
  assert.throws(() => nyKamp({ spillere: [{ navn: 'Alene' }] }), /mindst to/);
  assert.throws(() => nyKamp({ spillere: fire(), niveau: 'umulig' }), /sværhedsgrad/);
});

test('bomben bliver rødere og rødere, og den springer, når lunten er brændt ned', () => {
  const k = iGang({ hos: 2, lunte: 5 });
  let før = varme(k);
  for (let i = 0; i < 120; i++) {
    tik(k, DT);
    if (k.fase !== 'spil') break;
    assert.ok(varme(k) >= før, 'varmen falder aldrig');
    før = varme(k);
  }
  assert.equal(k.fase, 'brag');
  const brag = k.hændelser.find(h => h.slags === 'brag');
  assert.equal(brag.hvem, 2, 'den, der havde bomben, springer i luften');
  assert.equal(k.spillere[2].ude, true);
  for (const p of k.spillere) assert.equal(p.penge, p.ude ? 0 : MØNT_OVERLEV, 'de overlevende får en mønt');
});

test('man kan kun give bomben videre, når man har den, har grebet den og ikke er frosset', () => {
  const k = iGang({ hos: 0 });
  assert.equal(kanGive(k, 1, 2), 'Du har ikke bomben');
  assert.equal(kanGive(k, 0, 0), 'Ikke til ham');
  assert.equal(giv(k, 0, 1).ok, true);
  assert.equal(k.bombe.hos, 1);
  assert.equal(k.bombe.fra, 0);
  assert.equal(giv(k, 1, 0).fejl, 'Grib den først', 'man kan ikke slå den tilbage i samme nu');
  tik(k, FLYV_SEK + FANG_SEK + DT);
  assert.equal(giv(k, 1, 0).ok, true, '… men når den er grebet, kan man');
  tik(k, FLYV_SEK + FANG_SEK + DT);
  k.spillere[0].frys = 3;
  assert.equal(kanGive(k, 0, 2), 'Du er frosset');
  k.spillere[0].frys = 0;
  k.spillere[3].ude = true;
  assert.equal(kanGive(k, 0, 3), 'Ikke til ham', 'ikke til en, der er ude');
});

test('frys varer præcis 6 sekunder, og en frossen kan ikke komme af med bomben', () => {
  const k = iGang({ hos: 1, lunte: 60 });
  k.spillere[0].penge = 10;
  assert.equal(TING.frys.sek, 6);
  assert.equal(koeb(k, 0, 'frys', 1).ok, true);
  assert.equal(k.spillere[0].penge, 10 - TING.frys.pris);
  assert.equal(koeb(k, 0, 'frys', 1).fejl, 'Er allerede frosset');
  assert.equal(kanKoebe(k, 0, 'frys', 0), 'Vælg en anden', 'man kan ikke fryse sig selv');
  tik(k, 5.9);
  assert.equal(giv(k, 1, 2).fejl, 'Du er frosset');
  assert.equal(kanKoebe(k, 1, 'skjold'), 'Du er frosset', 'en frossen kan heller ikke købe noget');
  tik(k, 0.15);
  assert.equal(k.spillere[1].frys, 0);
  assert.ok(k.hændelser.some(h => h.slags === 'optoet' && h.hvem === 1));
  assert.equal(giv(k, 1, 2).ok, true, 'efter 6 sek. er man tøet op');
});

test('skjold: ingen kan give dig bomben eller fryse dig i 6 sekunder', () => {
  const k = iGang({ hos: 0, lunte: 60 });
  k.spillere[1].penge = 5;
  k.spillere[0].penge = 4;
  assert.equal(kanKoebe(k, 2, 'skjold'), 'Ikke nok mønter');
  assert.equal(koeb(k, 1, 'skjold').ok, true);
  assert.equal(k.spillere[1].penge, 0);
  assert.equal(giv(k, 0, 1).fejl, 'Har skjold');
  assert.equal(koeb(k, 0, 'frys', 1).fejl, 'Har skjold');
  tik(k, TING.skjold.sek + DT);
  assert.equal(giv(k, 0, 1).ok, true, 'skjoldet er væk igen');
});

test('lyn: bomben er grebet i samme nu, den lander', () => {
  const k = iGang({ hos: 0, lunte: 60 });
  k.spillere[1].penge = 3;
  assert.equal(koeb(k, 1, 'lyn').ok, true);
  giv(k, 0, 1);
  tik(k, FLYV_SEK + DT);
  assert.equal(giv(k, 1, 2).ok, true, 'med lyn skal den ikke gribes');
  tik(k, FLYV_SEK + DT);
  assert.equal(giv(k, 2, 3).fejl, 'Grib den først', 'uden lyn skal den');
});

test('runden: den sidste, der er tilbage, vinder og får mønter efter sværhedsgraden', () => {
  const k = iGang({ spillere: mennesker(3), niveau: 'hard', hos: 0, lunte: 1 });
  tik(k, 1.1);
  assert.equal(k.fase, 'brag');
  assert.equal(k.hændelser.find(h => h.slags === 'brag').sidste, false);
  tik(k, PAUSE_SEK + DT);
  assert.equal(k.fase, 'klar', 'en ny bombe lander');
  assert.ok(k.bombe.hos !== 0, 'ikke hos den, der er ude');
  tik(k, KLAR_SEK + DT);
  const offer = k.bombe.hos, vinder = [1, 2].find(n => n !== offer);
  k.bombe.lunte = k.bombe.tid + 0.2;
  tik(k, 0.3);
  assert.equal(k.hændelser.find(h => h.slags === 'brag' && h.hvem === offer).sidste, true);
  tik(k, PAUSE_SEK + DT);
  assert.equal(k.fase, 'slut');
  assert.equal(k.vinder, vinder);
  assert.equal(k.spillere[vinder].sejre, 1);
  assert.equal(k.spillere[vinder].penge, 2 * MØNT_OVERLEV + NIVEAUER.hard.sejr);
  // Næste runde: alle er med igen, mønterne bliver.
  nyRunde(k);
  assert.equal(k.runde, 2);
  assert.equal(levende(k).length, 3);
  assert.equal(k.spillere[vinder].penge, 2 * MØNT_OVERLEV + NIVEAUER.hard.sejr);
});

test('mod robotter er runden slut, så snart det sidste menneske er ude', () => {
  const k = iGang({ spillere: fire(), hos: 0, lunte: 0.5 });
  tik(k, 0.6 + PAUSE_SEK + DT);
  assert.equal(k.fase, 'slut');
  assert.equal(k.vinder, null, 'robotterne vandt – ingen enkelt vinder');
});

test('robotterne spiller selv: en kamp med kun robotter får altid en vinder', () => {
  for (const niveau of Object.keys(NIVEAUER)) {
    for (let seed = 1; seed <= 12; seed++) {
      const k = nyKamp({ spillere: fire([true, true, true, true]), niveau, seed });
      let afleveringer = 0;
      while (k.fase !== 'slut') {
        tik(k, 1);
        afleveringer += k.hændelser.filter(h => h.slags === 'giv').length;
        k.hændelser.length = 0;
        assert.ok(k.tid < 600, `${niveau}/${seed}: runden kom aldrig til ende`);
      }
      assert.ok(k.vinder !== null, `${niveau}/${seed}: der skal være en vinder`);
      assert.equal(levende(k).length, 1);
      assert.ok(afleveringer > 5, `${niveau}/${seed}: robotterne gav bomben videre (${afleveringer})`);
    }
  }
});

test('det samme frø giver den samme runde', () => {
  const kør = () => {
    const k = nyKamp({ spillere: fire([true, true, true, true]), niveau: 'medium', seed: 42 });
    const log = [];
    while (k.fase !== 'slut') { tik(k, 0.5); log.push(...k.hændelser.map(h => h.slags + (h.til ?? h.hvem ?? ''))); k.hændelser.length = 0; }
    return log.join(',');
  };
  assert.equal(kør(), kør());
});

test('robotterne bruger deres mønter – mest på Hard', () => {
  const køb = {};
  for (const niveau of Object.keys(NIVEAUER)) {
    køb[niveau] = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const k = nyKamp({ spillere: fire([true, true, true, true]), niveau, seed });
      for (const p of k.spillere) p.penge = 12;
      while (k.fase !== 'slut') {
        tik(k, 0.5);
        for (const h of k.hændelser) if (h.slags === 'koeb') {
          køb[niveau]++;
          assert.ok(TING[h.ting]);
        }
        k.hændelser.length = 0;
      }
      for (const p of k.spillere) assert.ok(p.penge >= 0, 'ingen kommer i minus');
    }
  }
  assert.ok(køb.hard > køb.medium && køb.medium > køb.easy, `køb: ${JSON.stringify(køb)}`);
});

test('sværhedsgraderne: en hurtig finger vinder oftest på Easy og sjældnest på Hard', () => {
  const sejre = {};
  for (const niveau of Object.keys(NIVEAUER)) {
    let vundet = 0, runder = 0;
    for (let seed = 1; seed <= 25; seed++) {
      const k = nyKamp({ spillere: fire(), niveau, seed: 500 + seed });
      for (let r = 0; r < 6; r++) {
        if (r) nyRunde(k);
        spilMedFinger(k, 0.35, true);
        runder++;
        if (k.vinder === 0) vundet++;
      }
    }
    sejre[niveau] = vundet / runder;
  }
  const tekst = JSON.stringify(sejre);
  assert.ok(sejre.easy > sejre.medium && sejre.medium > sejre.hard, `Easy > Medium > Hard: ${tekst}`);
  assert.ok(sejre.easy >= 0.4, `på Easy skal man vinde tit: ${tekst}`);
  assert.ok(sejre.hard >= 0.08, `selv på Hard kan man vinde: ${tekst}`);
  assert.ok(sejre.hard <= 0.35, `Hard skal være svært: ${tekst}`);
});
