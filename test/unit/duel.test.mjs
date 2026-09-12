// Enhedstests for Duel-bottens hoved:  node --test test/unit/duel.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NIVEAUER, SVAERHED, svaerhed, iOmraade, forkertSvar, planlaeg }
  from '../../public/spil/duel/bot.mjs';

// Samme PRNG som spillet bruger, så tallene er de samme hver gang.
function mulberry32(a){ return function(){ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
const fast = v => () => v;   // en «tilfældighed» der altid giver samme tal

const VALG = { slags:'valg', korrekt: 88, muligheder: [12, 44, 88, 91] };

test('sværhedsgraderne bliver bedre op ad stigen', () => {
  assert.deepEqual(NIVEAUER, ['nem', 'mellem', 'svaer']);
  const [nem, mellem, svaer] = NIVEAUER.map(n => SVAERHED[n]);
  for(const felt of ['reaktion', 'taenk']){
    assert.ok(svaer[felt][0] < mellem[felt][0] && mellem[felt][0] < nem[felt][0], `${felt} bliver hurtigere`);
    assert.ok(svaer[felt][1] < mellem[felt][1] && mellem[felt][1] < nem[felt][1], `${felt} bliver hurtigere`);
  }
  assert.ok(svaer.fejl < mellem.fejl && mellem.fejl < nem.fejl, 'de dygtige bots fejler sjældnere');
  assert.ok(svaer.tyvstart < mellem.tyvstart && mellem.tyvstart < nem.tyvstart, 'og tyvstarter sjældnere');
  assert.equal(svaerhed('findes-ikke'), SVAERHED.mellem, 'ukendt niveau falder tilbage på mellem');
});

test('iOmraade holder sig inden for kanterne', () => {
  const rnd = mulberry32(7);
  for(let i = 0; i < 500; i++){
    const v = iOmraade([200, 400], rnd);
    assert.ok(v >= 200 && v <= 400 && Number.isInteger(v), `${v} er et helt tal i [200,400]`);
  }
  assert.equal(iOmraade([300, 900], fast(0)), 300);
  assert.equal(iOmraade([300, 900], fast(0.999999)), 900);
});

test('forkertSvar rammer altid ved siden af', () => {
  const rnd = mulberry32(3);
  const set = new Set();
  for(let i = 0; i < 200; i++){
    const s = forkertSvar(VALG, rnd);
    assert.notEqual(String(s), String(VALG.korrekt), 'aldrig det rigtige svar');
    assert.ok(VALG.muligheder.includes(s), 'men altid et af de viste svar');
    set.add(s);
  }
  assert.equal(set.size, 3, 'alle tre forkerte svar bliver brugt');
  // Er der kun ét svar at vælge imellem, må botten nødtvungent svare rigtigt.
  assert.equal(forkertSvar({ korrekt: 5, muligheder: [5] }, rnd), 5);
  assert.equal(forkertSvar({ korrekt: 5 }, rnd), 5, 'også uden muligheder');
});

test('valg-runder: botten tænker og svarer rigtigt eller forkert', () => {
  for(const niveau of NIVEAUER){
    const sv = SVAERHED[niveau];
    // rnd() = 0 → altid under fejl-grænsen → forkert svar
    const forkert = planlaeg(VALG, niveau, fast(0));
    assert.equal(forkert.tyvstart, false, 'man kan ikke tyvstarte, når svarene står der');
    assert.notEqual(String(forkert.svar), String(VALG.korrekt), `${niveau} svarer forkert ved rnd=0`);
    // rnd() = 0,999 → langt over fejl-grænsen → rigtigt svar, og langsomste tænketid
    const rigtigt = planlaeg(VALG, niveau, fast(0.999999));
    assert.equal(rigtigt.svar, VALG.korrekt, `${niveau} svarer rigtigt`);
    assert.equal(rigtigt.forsinkelse, sv.taenk[1], 'tænketiden ligger i intervallet');
  }
});

test('fejlprocenten passer nogenlunde, og botten er hurtigere jo bedre den er', () => {
  const snit = {};
  for(const niveau of NIVEAUER){
    const rnd = mulberry32(11);
    let fejl = 0, tid = 0;
    const N = 4000;
    for(let i = 0; i < N; i++){
      const p = planlaeg(VALG, niveau, rnd);
      if(String(p.svar) !== String(VALG.korrekt)) fejl++;
      tid += p.forsinkelse;
    }
    const andel = fejl / N;
    assert.ok(Math.abs(andel - SVAERHED[niveau].fejl) < 0.04, `${niveau}: ${andel.toFixed(2)} ≈ ${SVAERHED[niveau].fejl}`);
    snit[niveau] = tid / N;
  }
  assert.ok(snit.svaer < snit.mellem && snit.mellem < snit.nem, 'gennemsnitlig tænketid falder');
});

test('reaktions-runder: tyvstart kun når der er tid til at dumme sig', () => {
  for(const niveau of NIVEAUER){
    const sv = SVAERHED[niveau];
    // rnd() = 0 → under tyvstart-grænsen
    const tyv = planlaeg({ slags:'reaktion', vindue: 4000 }, niveau, fast(0));
    assert.equal(tyv.tyvstart, true, `${niveau} tyvstarter ved rnd=0`);
    assert.equal(tyv.svar, null);
    assert.ok(tyv.forsinkelse >= 300 && tyv.forsinkelse <= 4000 * 0.85, 'trykket falder før tid');
    // Kort vindue: der er ikke tid til en tyvstart
    const kort = planlaeg({ slags:'reaktion', vindue: 400 }, niveau, fast(0));
    assert.equal(kort.tyvstart, false, 'intet kort vindue-tyvstart');
    assert.equal(kort.forsinkelse, sv.reaktion[0], 'hurtigste reaktion ved rnd=0');
    // rnd() = 0,999 → ingen tyvstart, langsomste reaktion
    const pænt = planlaeg({ slags:'reaktion', vindue: 4000 }, niveau, fast(0.999999));
    assert.equal(pænt.tyvstart, false);
    assert.equal(pænt.forsinkelse, sv.reaktion[1]);
  }
});

test('tyvstart sker cirka så tit som lovet', () => {
  for(const niveau of NIVEAUER){
    const rnd = mulberry32(5);
    let tyv = 0;
    const N = 4000;
    for(let i = 0; i < N; i++) if(planlaeg({ slags:'reaktion', vindue: 3000 }, niveau, rnd).tyvstart) tyv++;
    const andel = tyv / N;
    assert.ok(Math.abs(andel - SVAERHED[niveau].tyvstart) < 0.03, `${niveau}: ${andel.toFixed(2)} ≈ ${SVAERHED[niveau].tyvstart}`);
  }
});
