// Enhedstests for Stenalders regelmotor. Kør:  node --test test/unit/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  nytSpil, udfoer, lovligePlaceringer, slutscore, tilfaeldigHandling, kanBetaleBygning, hvemErPaa, alleSteder,
} from '../../public/spil/stenalder/regler.mjs';
import { KORT, BYGNINGER, RESSOURCER, VAERDI } from '../../public/spil/stenalder/data.mjs';

const spil = (n = 2, seed = 1) => nytSpil({ navne: Array.from({ length: n }, (_, i) => `S${i + 1}`), seed });
const steder = s => lovligePlaceringer(s).map(p => p.sted);
const r = (trae = 0, ler = 0, sten = 0, guld = 0) => ({ trae, ler, sten, guld });

// Sæt en spillers ressourcer direkte (testhjælper)
const giv = (s, i, felter) => { const k = JSON.parse(JSON.stringify(s)); Object.assign(k.spillere[i], felter); return k; };

test('data: 36 kort med rigtige fordelinger, 28 bygninger', () => {
  assert.equal(KORT.length, 36);
  assert.equal(KORT.filter(k => k.bund.type === 'kultur').length, 16);
  assert.equal(KORT.filter(k => k.top.type === 'terningkort').length, 10);
  assert.equal(KORT.filter(k => k.top.type === 'mad').length, 7);
  const sum = t => KORT.filter(k => k.bund.specialist === t).reduce((a, k) => a + k.bund.antal, 0);
  assert.deepEqual([sum('bonde'), sum('redskabsmager'), sum('hyttebygger'), sum('shaman')], [7, 8, 9, 7]);
  assert.equal(BYGNINGER.length, 28);
  assert.equal(BYGNINGER.filter(b => b.type === 'fri').length, 3);
  assert.equal(BYGNINGER.filter(b => b.type === 'antal').length, 8);
});

test('opsætning: 5 folk, 12 mad, kort udlagt, stakke = antal spillere', () => {
  const s = spil(3, 7);
  assert.equal(s.spillere.length, 3);
  assert.equal(s.bygningsstakke.length, 3);
  assert.ok(s.bygningsstakke.every(st => st.length === 7));
  assert.equal(s.kortudlagt.filter(k => k != null).length, 4);
  assert.equal(s.kortbunke.length, 32);
  for (const sp of s.spillere) { assert.equal(sp.folk, 5); assert.equal(sp.mad, 12); assert.deepEqual(sp.redskaber, [0, 0, 0]); }
  assert.equal(s.fase, 'placering');
  // samme seed → samme spil
  assert.deepEqual(spil(3, 7).kortbunke, s.kortbunke);
  assert.notDeepEqual(spil(3, 8).kortbunke, s.kortbunke);
});

test('placering: kapacitet, ikke to gange samme sted, hytten kræver 2', () => {
  let s = spil(4);
  assert.ok(steder(s).includes('skov'));
  assert.throws(() => udfoer(s, { type: 'placer', sted: 'skov', antal: 6 }), /mellem 1 og 5/);
  s = udfoer(s, { type: 'placer', sted: 'skov', antal: 3 });
  assert.equal(s.aktiv, 1);
  assert.equal(s.spillere[0].ledige, 2);
  s = udfoer(s, { type: 'placer', sted: 'skov', antal: 4 }); // 7 i alt → fuld
  s = udfoer(s, { type: 'placer', sted: 'jagt', antal: 1 });
  s = udfoer(s, { type: 'placer', sted: 'jagt', antal: 1 });
  // spiller 0 igen: skov er fuld, og han må ikke placere igen i skoven alligevel
  assert.equal(s.aktiv, 0);
  assert.ok(!steder(s).includes('skov'));
  assert.throws(() => udfoer(s, { type: 'placer', sted: 'hytte', antal: 1 }), /præcis 2/);
  s = udfoer(s, { type: 'placer', sted: 'hytte' });
  assert.equal(s.spillere[0].ledige, 0);
  assert.equal(s.braet.hytte[0].antal, 2);
  // spiller 2 må ikke gå på jagt igen
  assert.equal(s.aktiv, 1);
  s = udfoer(s, { type: 'placer', sted: 'mark' });
  assert.equal(s.aktiv, 2);
  assert.ok(!steder(s).includes('jagt'));
});

test('placering: 2 spillere – kun én spiller pr. ressourcested, kun 2 landsbysteder', () => {
  let s = spil(2);
  s = udfoer(s, { type: 'placer', sted: 'skov', antal: 1 });
  assert.ok(!steder(s).includes('skov'), 'modstander må ikke også gå i skoven');
  assert.ok(steder(s).includes('jagt'), 'jagten er altid åben');
  s = udfoer(s, { type: 'placer', sted: 'mark' });
  s = udfoer(s, { type: 'placer', sted: 'redskabsmager' });
  assert.ok(!steder(s).includes('hytte'), 'tredje landsbysted er lukket');
});

test('placering: 3 spillere – højst to spillere pr. ressourcested', () => {
  let s = spil(3);
  s = udfoer(s, { type: 'placer', sted: 'flod', antal: 1 });
  s = udfoer(s, { type: 'placer', sted: 'flod', antal: 1 });
  assert.ok(!steder(s).includes('flod'));
  assert.ok(steder(s).includes('skov'));
});

test('fortryd: sidste placering kan tages tilbage, men kun én gang', () => {
  let s = spil(2);
  s = udfoer(s, { type: 'placer', sted: 'skov', antal: 2 });
  assert.equal(s.aktiv, 1);
  s = udfoer(s, { type: 'fortryd' });
  assert.equal(s.aktiv, 0);
  assert.equal(s.spillere[0].ledige, 5);
  assert.deepEqual(s.braet.skov, []);
  assert.throws(() => udfoer(s, { type: 'fortryd' }), /ikke noget at fortryde/);
});

// Spil placeringsfasen igennem med alle på jagt, undtagen de angivne.
function placerAlt(s, saerlige = {}) {
  while (s.fase === 'placering') {
    const sp = s.spillere[s.aktiv];
    const oensker = saerlige[s.aktiv] ?? [];
    const naeste = oensker.find(o => steder(s).includes(o.sted));
    if (naeste) { oensker.splice(oensker.indexOf(naeste), 1); s = udfoer(s, { type: 'placer', ...naeste }); continue; }
    if (steder(s).includes('jagt')) s = udfoer(s, { type: 'placer', sted: 'jagt', antal: sp.ledige });
    else { const m = lovligePlaceringer(s)[0]; s = udfoer(s, { type: 'placer', sted: m.sted, antal: m.min }); }
  }
  return s;
}

test('handling: terningkast, redskaber lægges til, hvert redskab én gang pr. runde', () => {
  let s = spil(2, 3);
  s = giv(s, 0, { redskaber: [2, 1, 0] });
  s = placerAlt(s, { 0: [{ sted: 'skov', antal: 2 }, { sted: 'jagt', antal: 3 }] });
  assert.equal(s.fase, 'handling');
  assert.equal(s.aktiv, 0);
  s = udfoer(s, { type: 'handling', sted: 'skov' });
  assert.equal(s.afventer.type, 'redskaber');
  assert.equal(s.afventer.kast.length, 2);
  const sum = s.afventer.sum;
  s = udfoer(s, { type: 'brugRedskaber', pladser: [0, 1] });
  assert.equal(s.spillere[0].ressourcer.trae, Math.floor((sum + 3) / 3));
  assert.deepEqual(s.spillere[0].brugte, [true, true, false]);
  assert.equal(s.afventer, null);
  s = udfoer(s, { type: 'handling', sted: 'jagt' });
  // ingen ledige redskaber → afgøres med det samme
  assert.equal(s.afventer, null);
  assert.equal(s.spillere[0].placeringer.length, 0);
});

test('handling: mark, redskabsmager og hytte; redskaber i fast rækkefølge', () => {
  let s = spil(4, 5);
  s = giv(s, 0, { redskaber: [1, 1, 1] });
  s = placerAlt(s, { 0: [{ sted: 'redskabsmager' }, { sted: 'mark' }, { sted: 'hytte' }] });
  s = udfoer(s, { type: 'handling', sted: 'redskabsmager' });
  assert.deepEqual(s.spillere[0].redskaber, [2, 1, 1]);
  s = udfoer(s, { type: 'handling', sted: 'mark' });
  assert.equal(s.spillere[0].landbrug, 1);
  s = udfoer(s, { type: 'handling', sted: 'hytte' });
  assert.equal(s.spillere[0].folk, 6);
});

test('bygninger: betalingsregler for de tre typer', () => {
  const fast = BYGNINGER.find(b => b.type === 'fast' && b.pris.trae === 2 && b.pris.ler === 1);
  assert.ok(kanBetaleBygning(fast, r(2, 1)));
  assert.ok(!kanBetaleBygning(fast, r(2, 0, 1)));
  const fire2 = BYGNINGER.find(b => b.type === 'antal' && b.antal === 4 && b.slags === 2);
  assert.ok(kanBetaleBygning(fire2, r(1, 0, 3)));
  assert.ok(!kanBetaleBygning(fire2, r(4)));
  assert.ok(!kanBetaleBygning(fire2, r(1, 1, 1, 1)));
  assert.ok(!kanBetaleBygning(fire2, r(2, 2, 1)));
  const fem4 = BYGNINGER.find(b => b.type === 'antal' && b.antal === 5 && b.slags === 4);
  assert.ok(kanBetaleBygning(fem4, r(2, 1, 1, 1)));
  const fri = BYGNINGER.find(b => b.type === 'fri');
  assert.ok(kanBetaleBygning(fri, r(0, 0, 0, 7)));
  assert.ok(!kanBetaleBygning(fri, r(8)));
  assert.ok(!kanBetaleBygning(fri, r()));
});

test('bygning: køb giver point = ressourceværdi, næste brik vendes, afstå er muligt', () => {
  let s = spil(2, 11);
  s.bygningsstakke[0] = [BYGNINGER.find(b => b.type === 'fri').id, ...s.bygningsstakke[0]];
  s = giv(s, 0, { ressourcer: r(0, 0, 2, 3) });
  s = placerAlt(s, { 0: [{ sted: 'bygning:0' }], 1: [{ sted: 'bygning:1' }] });
  s = udfoer(s, { type: 'handling', sted: 'bygning:0' });
  assert.equal(s.afventer.type, 'betalBygning');
  assert.throws(() => udfoer(s, { type: 'betal', ressourcer: r(0, 0, 3, 3) }), /ikke de ressourcer/);
  s = udfoer(s, { type: 'betal', ressourcer: r(0, 0, 2, 3) });
  assert.equal(s.spillere[0].point, 2 * 5 + 3 * 6);
  assert.equal(s.spillere[0].bygninger.length, 1);
  assert.equal(s.bygningsstakke[0].length, 7);
  // spiller 1 afstår
  while (s.aktiv === 0 && s.fase === 'handling') s = udfoer(s, tilfaeldigHandling(s));
  s = udfoer(s, { type: 'handling', sted: 'bygning:1' });
  s = udfoer(s, { type: 'afstaa' });
  assert.equal(s.spillere[1].bygninger.length, 0);
  assert.equal(s.bygningsstakke[1].length, 7);
});

test('kort: pris efter plads, korteffekter, kortene rykker ved rundeskift', () => {
  let s = spil(2, 2);
  const madkort = KORT.find(k => k.top.type === 'mad' && k.top.antal === 7).id;
  const redskabskort = KORT.find(k => k.top.type === 'redskab').id;
  s.kortudlagt = [madkort, redskabskort, s.kortudlagt[2], s.kortudlagt[3]];
  s = giv(s, 0, { ressourcer: r(3, 0, 0, 0) });
  s = placerAlt(s, { 0: [{ sted: 'kort:0' }, { sted: 'kort:1' }] });
  s = udfoer(s, { type: 'handling', sted: 'kort:1' });
  assert.equal(s.afventer.pris, 2);
  assert.throws(() => udfoer(s, { type: 'betal', ressourcer: r(1) }), /præcis 2/);
  s = udfoer(s, { type: 'betal', ressourcer: r(2) });
  assert.deepEqual(s.spillere[0].redskaber, [1, 0, 0]);
  assert.equal(s.spillere[0].kort.length, 1);
  s = udfoer(s, { type: 'handling', sted: 'kort:0' });
  s = udfoer(s, { type: 'betal', ressourcer: r(1) });
  assert.equal(s.spillere[0].mad, 12 + 7);
  assert.deepEqual([s.kortudlagt[0], s.kortudlagt[1]], [null, null]);
  // spil resten af runden
  const bunkeFoer = s.kortbunke.length;
  const tilbage = [s.kortudlagt[2], s.kortudlagt[3]];
  while (s.runde === 1 && s.fase !== 'slut') s = udfoer(s, tilfaeldigHandling(s));
  assert.equal(s.runde, 2);
  assert.deepEqual([s.kortudlagt[0], s.kortudlagt[1]], tilbage, 'resterende kort rykker mod den billige ende');
  assert.equal(s.kortbunke.length, bunkeFoer - 2);
  assert.equal(s.startspiller, 1);
  assert.ok(s.spillere.every(sp => sp.ledige === sp.folk && sp.placeringer.length === 0));
});

test('kort: terningkortet lader alle vælge efter tur; 6 = madsporet', () => {
  let s = spil(3, 4);
  const tk = KORT.find(k => k.top.type === 'terningkort').id;
  s.kortudlagt[0] = tk;
  s = giv(s, 1, { ressourcer: r(1) });
  s = placerAlt(s, { 1: [{ sted: 'kort:0' }] });
  while (!(s.aktiv === 1 && s.fase === 'handling')) s = udfoer(s, tilfaeldigHandling(s));
  s = udfoer(s, { type: 'handling', sted: 'kort:0' });
  s = udfoer(s, { type: 'betal', ressourcer: r(1) });
  assert.equal(s.afventer.type, 'terningkort');
  assert.equal(s.afventer.terninger.length, 3);
  assert.equal(hvemErPaa(s), 1, 'køberen vælger først');
  s.afventer.terninger = [6, 5, 1];
  s = udfoer(s, { type: 'vaelgTerning', indeks: 0 });
  assert.equal(s.spillere[1].landbrug, 1);
  assert.equal(hvemErPaa(s), 2);
  s = udfoer(s, { type: 'vaelgTerning', indeks: 1 });
  assert.deepEqual(s.spillere[2].redskaber, [1, 0, 0]);
  assert.equal(hvemErPaa(s), 0);
  assert.throws(() => udfoer(s, { type: 'vaelgTerning', indeks: 1 }), /allerede taget/);
  s = udfoer(s, { type: 'vaelgTerning', indeks: 2 });
  assert.equal(s.spillere[0].ressourcer.trae, 1);
  assert.equal(s.afventer, null);
});

test('kort: 2 valgfri ressourcer kan gemmes og bruges senere; engangsredskab bruges op', () => {
  let s = spil(2, 6);
  const v2 = KORT.find(k => k.top.type === 'valgfri2').id;
  const e4 = KORT.find(k => k.top.type === 'engangsredskab' && k.top.vaerdi === 4).id;
  s.kortudlagt[0] = v2; s.kortudlagt[1] = e4;
  s = giv(s, 0, { ressourcer: r(3) });
  s = placerAlt(s, { 0: [{ sted: 'kort:0' }, { sted: 'kort:1' }, { sted: 'flod', antal: 1 }] });
  s = udfoer(s, { type: 'handling', sted: 'kort:0' });
  s = udfoer(s, { type: 'betal', ressourcer: r(1) });
  assert.equal(s.spillere[0].aabneKort.length, 1);
  s = udfoer(s, { type: 'handling', sted: 'kort:1' });
  s = udfoer(s, { type: 'betal', ressourcer: r(2) });
  assert.deepEqual(s.spillere[0].engangsredskaber, [{ kort: e4, vaerdi: 4 }]);
  s = udfoer(s, { type: 'brugValgfri2', ressourcer: r(0, 0, 0, 2) });
  assert.equal(s.spillere[0].ressourcer.guld, 2);
  assert.equal(s.spillere[0].aabneKort.length, 0);
  s = udfoer(s, { type: 'handling', sted: 'flod' });
  const sum = s.afventer.sum;
  s = udfoer(s, { type: 'brugRedskaber', engangs: [e4] });
  assert.equal(s.spillere[0].ressourcer.guld, 2 + Math.floor((sum + 4) / 6));
  assert.equal(s.spillere[0].engangsredskaber.length, 0);
});

test('fodring: madsporet giver mad, mangel betales med ressourcer eller koster 10 point', () => {
  let s = spil(2, 9);
  s = giv(s, 0, { mad: 2, landbrug: 1, ressourcer: r(1, 1), point: 15 });
  s = giv(s, 1, { mad: 0, ressourcer: r(), point: 5 });
  // Ingen går på jagt, så madmanglen er forudsigelig
  s = placerAlt(s, { 0: [{ sted: 'mark' }, { sted: 'skov', antal: 3 }, { sted: 'lergrav', antal: 1 }],
                     1: [{ sted: 'redskabsmager' }, { sted: 'flod', antal: 4 }] });
  while (s.fase === 'handling') s = udfoer(s, tilfaeldigHandling(s));
  assert.equal(s.fase, 'fodring');
  assert.equal(s.afventer.type, 'fodring');
  assert.equal(s.afventer.spiller, 0);
  // 5 folk, 2 mad + 2 fra sporet (1 + marken) → mangler 1
  assert.equal(s.afventer.mangler, 1);
  assert.throws(() => udfoer(s, { type: 'fodr', ressourcer: r(0, 0, 0, 0) }), /præcis/);
  assert.throws(() => udfoer(s, { type: 'fodr', ressourcer: r(0, 0, 1) }), /ikke de ressourcer/);
  s = udfoer(s, { type: 'fodr', ressourcer: r(1) });
  assert.equal(s.spillere[0].point, 15);
  assert.equal(s.spillere[0].mad, 0);
  assert.deepEqual(s.spillere[0].ressourcer.trae, s.spillere[0].ressourcer.trae); // træ fra skoven er tilfældigt
  // spiller 1 havde ingen mad; fik han guld i floden, skal han vælge, ellers sulter han automatisk
  if (s.afventer?.type === 'fodring') { assert.equal(s.afventer.spiller, 1); s = udfoer(s, { type: 'sult' }); }
  assert.equal(s.spillere[1].point, 0, '5 - 10 stopper ved 0');
  assert.equal(s.runde, 2);
});

test('fodring: man må vælge at sulte selvom man har ressourcer', () => {
  let s = spil(2, 9);
  s = giv(s, 0, { mad: 0, ressourcer: r(5, 5), point: 30 });
  s = placerAlt(s, { 0: [{ sted: 'mark' }, { sted: 'redskabsmager' }, { sted: 'skov', antal: 3 }] });
  while (s.fase === 'handling') s = udfoer(s, tilfaeldigHandling(s));
  if (s.afventer?.type === 'fodring' && s.afventer.spiller === 0) {
    s = udfoer(s, { type: 'sult' });
    assert.equal(s.spillere[0].point, 20);
    assert.equal(s.spillere[0].mad, 0);
  } else assert.fail('spiller 0 burde mangle mad');
});

test('slut: tom bygningsstak slutter spillet efter runden; slutscore regnes rigtigt', () => {
  let s = spil(2, 12);
  s.bygningsstakke[0] = [BYGNINGER.find(b => b.type === 'fast').id];
  const b = BYGNINGER[s.bygningsstakke[0][0]];
  s = giv(s, 0, { ressourcer: { ...b.pris, guld: b.pris.guld + 2 }, landbrug: 3, redskaber: [2, 1, 0], folk: 6, ledige: 6,
    kort: [
      KORT.find(k => k.bund.type === 'kultur' && k.bund.symbol === 'musik').id,
      KORT.filter(k => k.bund.type === 'kultur' && k.bund.symbol === 'musik')[1].id,
      KORT.find(k => k.bund.type === 'kultur' && k.bund.symbol === 'skrift').id,
      KORT.find(k => k.bund.specialist === 'bonde' && k.bund.antal === 2).id,
      KORT.find(k => k.bund.specialist === 'redskabsmager' && k.bund.antal === 2).id,
      KORT.find(k => k.bund.specialist === 'hyttebygger' && k.bund.antal === 3).id,
      KORT.find(k => k.bund.specialist === 'shaman' && k.bund.antal === 1).id,
    ] });
  s = giv(s, 1, { mad: 40 });
  s = giv(s, 0, { mad: 40 });
  s = placerAlt(s, { 0: [{ sted: 'bygning:0' }, { sted: 'mark' }] });
  s = udfoer(s, { type: 'handling', sted: 'bygning:0' });
  s = udfoer(s, { type: 'betal', ressourcer: b.pris });
  while (s.fase !== 'slut') s = udfoer(s, tilfaeldigHandling(s));
  assert.equal(s.fase, 'slut');
  const res = s.resultat.spillere[0];
  const sp = s.spillere[0];
  assert.equal(res.kultur, 2 * 2 + 1 * 1, 'to sæt kultur: {musik, skrift} og {musik}');
  assert.deepEqual(res.kulturSaet, [2, 1]);
  assert.equal(res.boender, 2 * sp.landbrug);
  assert.equal(res.redskabsmagere, 2 * 3);
  assert.equal(res.hyttebyggere, 3 * 1);
  assert.equal(res.shamaner, 1 * sp.folk);
  assert.equal(res.ressourcer, RESSOURCER.reduce((a, k) => a + sp.ressourcer[k], 0));
  assert.equal(res.total, res.undervejs + res.kultur + res.boender + res.redskabsmagere + res.hyttebyggere + res.shamaner + res.ressourcer);
  assert.throws(() => udfoer(s, { type: 'placer', sted: 'jagt', antal: 1 }), /slut/);
});

test('slut: tom kortbunke slutter spillet, når der ikke kan fyldes op', () => {
  let s = spil(2, 13);
  s.kortbunke = [];
  s = giv(s, 0, { ressourcer: r(4) });
  s = placerAlt(s, { 0: [{ sted: 'kort:0' }] });
  s = udfoer(s, { type: 'handling', sted: 'kort:0' });
  s = udfoer(s, { type: 'betal', ressourcer: r(1) });
  while (s.fase !== 'slut') s = udfoer(s, tilfaeldigHandling(s));
  assert.equal(s.runde, 1);
  assert.ok(s.resultat);
});

test('tilfældige hele spil: 200 spil med 2-4 spillere afsluttes uden fejl og invarianter holder', () => {
  let rundeSum = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const n = 2 + (seed % 3);
    let s = spil(n, seed * 7919);
    let rng = seed;
    const rnd = () => { rng = (rng * 48271) % 2147483647; return rng / 2147483647; };
    let skridt = 0;
    while (s.fase !== 'slut') {
      const h = tilfaeldigHandling(s, rnd);
      assert.ok(h, `ingen handling i seed ${seed}: ${s.fase} ${JSON.stringify(s.afventer)}`);
      s = udfoer(s, h);
      if (++skridt > 20000) assert.fail(`spil ${seed} slutter aldrig`);
      for (const sp of s.spillere) {
        assert.ok(sp.mad >= 0 && sp.point >= 0 && sp.folk <= 10 && sp.landbrug <= 10, `invariant brudt i seed ${seed}`);
        assert.ok(RESSOURCER.every(k => sp.ressourcer[k] >= 0));
        assert.ok(sp.redskaber.every(v => v >= 0 && v <= 4));
        if (s.fase === 'placering') {
          const paaBraet = alleSteder(s).reduce((a, st) => a + s.braet[st].filter(p => p.spiller === s.spillere.indexOf(sp)).reduce((x, p) => x + p.antal, 0), 0);
          assert.equal(paaBraet + sp.ledige, sp.folk, `folk forsvinder i seed ${seed}`);
        }
      }
    }
    rundeSum += s.runde;
    const res = s.resultat;
    assert.equal(res.spillere.length, n);
    assert.equal(res.raekkefoelge.length, n);
    assert.equal(slutscore(s).spillere[0].total, res.spillere[0].total);
  }
  assert.ok(rundeSum / 200 > 5, `spil er urealistisk korte: ${rundeSum / 200} runder i snit`);
});
