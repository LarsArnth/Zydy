// Enhedstests for banen i «Gulvet er lava»:  node --test test/unit/lava.test.mjs
//
// Det vigtige er løftet om, at stuen altid kan klatres: hvert møbel skal kunne
// nås fra rækken under – også fra den *dårligste* af to muligheder – og en
// flyttekasse, der styrter i lavaen, må aldrig være den eneste vej videre.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  RUM, KANT, H_HOP, VX, VJ, G, SP_B, DY_MIN, DY_MAKS, PAR_GAB_MAKS, W_MIN,
  MOEBLER, tNed, raekkevidde, gabMellem, gabMaks, naaesFra, lavaFart, opretBane, gulvet, naesteRaekke, mulberry32,
} from '../../public/spil/lava/bane.mjs';

test('fysikken hænger sammen: hoppet når H_HOP og lander igen', () => {
  assert.ok(Math.abs(VJ * VJ / (2 * G) - H_HOP) < 1e-9, 'toppen af hoppet er H_HOP');
  assert.equal(tNed(H_HOP + 0.01), null, 'et hop kan ikke nå højere end H_HOP');
  assert.ok(tNed(0) > tNed(1) && tNed(1) > tNed(2), 'jo højere man skal, jo tidligere lander man');
  assert.ok(raekkevidde(DY_MAKS) > 2.5, 'selv det højeste spring rækker et par meter frem');
  // Et hop lige op skal kunne nå den værste række-afstand med luft til overs
  assert.ok(DY_MAKS < H_HOP - 0.2, 'der er margin op til toppen af hoppet');
});

test('gabMellem måler kanternes afstand', () => {
  const a = { x: 0, w: 2 }, b = { x: 3, w: 1 };
  assert.equal(gabMellem(a, b), 1);
  assert.equal(gabMellem(b, a), 1, 'rækkefølgen er ligegyldig');
  assert.equal(gabMellem(a, { x: 1, w: 2 }), 0, 'overlap giver 0');
});

test('lavaen stiger hurtigere, jo højere man kommer – men har et loft', () => {
  assert.ok(lavaFart(0) > 0.5 && lavaFart(0) < 1, 'roligt til at begynde med');
  assert.ok(lavaFart(80) > lavaFart(20), 'den tager til');
  assert.equal(lavaFart(1e6), 2.2, 'og topper, så et godt løb ikke bliver umuligt');
});

test('hvert møbel kan nås fra hele rækken under, i 40 forskellige stuer', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const bane = opretBane(seed).voksTil(200);
    for (let i = 1; i < bane.raekker.length; i++) {
      const under = bane.raekker[i - 1], her = bane.raekker[i];
      assert.ok(her.length === 1 || her.length === 2, `seed ${seed} række ${i}: 1-2 møbler`);
      const dy = her[0].y - under[0].y;
      assert.ok(dy >= DY_MIN - 1e-9 && dy <= DY_MAKS + 1e-9, `seed ${seed} række ${i}: afstanden op er ${dy}`);
      for (const b of her) {
        assert.equal(b.y, her[0].y, 'møbler i samme række står i samme højde');
        assert.ok(b.w >= W_MIN - 1e-9, `seed ${seed} række ${i}: ${b.slags} er ${b.w} bredt`);
        assert.ok(b.x >= KANT - 1e-9 && b.x + b.w <= RUM - KANT + 1e-9, `seed ${seed} række ${i}: ${b.slags} står i stuen`);
        for (const a of under) {
          assert.ok(naaesFra(a, b), `seed ${seed} række ${i}: kan ikke hoppe fra ${a.slags} til ${b.slags}`);
        }
      }
      if (her.length === 2) {
        const g = gabMellem(her[0], her[1]);
        assert.ok(g >= 0.6 - 1e-9, `seed ${seed} række ${i}: de to møbler klistrer sammen`);
        assert.ok(g <= PAR_GAB_MAKS + 1e-9, `seed ${seed} række ${i}: for langt mellem de to møbler`);
      }
    }
  }
});

test('en flyttekasse står aldrig alene – man skal kunne komme videre uden den', () => {
  let kasser = 0;
  for (let seed = 1; seed <= 40; seed++) {
    for (const r of opretBane(seed).voksTil(200).raekker) {
      const styrter = r.filter(p => p.styrter);
      kasser += styrter.length;
      if (styrter.length) assert.ok(r.length - styrter.length >= 1, 'der er stadig et møbel tilbage i rækken');
    }
  }
  assert.ok(kasser > 20, `der skulle komme flyttekasser undervejs (fandt ${kasser})`);
});

test('møblerne bliver ikke tegnet ned i det der står under', () => {
  for (let seed = 1; seed <= 10; seed++) {
    const bane = opretBane(seed).voksTil(120);
    for (let i = 1; i < bane.raekker.length; i++) {
      const dy = bane.raekker[i][0].y - bane.raekker[i - 1][0].y;
      for (const p of bane.raekker[i]) assert.ok(p.krop <= dy - 0.3 + 1e-9, `${p.slags}s krop er højere end der er plads til`);
    }
  }
});

test('alle møbelslags dukker op, og trampolinpuffen giver et ekstra skub', () => {
  const set = new Set();
  for (let seed = 1; seed <= 30; seed++) for (const p of opretBane(seed).voksTil(200).alle) set.add(p.slags);
  for (const m of MOEBLER) assert.ok(set.has(m.id), `møblet ${m.id} kom aldrig med`);
  assert.ok(set.has('gulv'), 'gulvet er række 0');
  for (const p of opretBane(3).voksTil(200).alle) {
    if (p.slags === 'puf') assert.equal(p.hopper, true);
    if (p.slags === 'kasse') assert.equal(p.styrter, true);
  }
});

test('isterninger kommer, men ikke i hobetal', () => {
  const bane = opretBane(9).voksTil(300);
  const is = bane.alle.filter(p => p.is).length;
  assert.ok(is > 8 && is < 120, `${is} isterninger på 300 rækker`);
});

test('samme seed giver samme stue, et andet seed giver en anden', () => {
  const a = opretBane(42).voksTil(30).alle.map(p => [p.slags, p.x.toFixed(4), p.y.toFixed(4)].join());
  const b = opretBane(42).voksTil(30).alle.map(p => [p.slags, p.x.toFixed(4), p.y.toFixed(4)].join());
  const c = opretBane(43).voksTil(30).alle.map(p => [p.slags, p.x.toFixed(4), p.y.toFixed(4)].join());
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
});

test('et hop rækker over gabet plus spilleren selv', () => {
  // Gabet er målt mellem møblernes kanter, men man skal også have sin egen
  // bredde med over. Regnestykket skal holde helt op til den højeste række.
  for (const dy of [DY_MIN, 1.8, DY_MAKS]) {
    assert.ok(gabMaks(dy) + SP_B < raekkevidde(dy), `dy ${dy}: hoppet rækker ikke`);
    assert.ok(gabMaks(dy) > 0.8, `dy ${dy}: gabet må gerne være til at se`);
  }
  assert.ok(gabMaks(DY_MIN) > gabMaks(DY_MAKS), 'et lavt spring må være længere');
  assert.ok(PAR_GAB_MAKS <= W_MIN + 2 * gabMaks(DY_MAKS) + 1e-9, 'to møbler kan stå så langt fra hinanden, at næste række ikke kan nås');
});

test('værste tænkelige række: to møbler så langt fra hinanden som tilladt', () => {
  // Den grænse PAR_GAB_MAKS er sat efter: er der PAR_GAB_MAKS mellem to møbler,
  // skal næste række stadig kunne stå et sted, hvor begge kan nå den.
  const rnd = mulberry32(1);
  const a = { nr: 1, x: KANT, w: W_MIN, y: 3, slags: 'stol', krop: 1, hopper: false, styrter: false, is: false, f: 0 };
  const b = { ...a, x: a.x + a.w + PAR_GAB_MAKS };
  assert.ok(b.x + b.w <= RUM - KANT + 1e-9, 'de kan overhovedet stå i stuen');
  for (let n = 0; n < 500; n++) {
    const raekke = naesteRaekke([a, b], 90, rnd);
    for (const p of raekke) for (const under of [a, b]) assert.ok(naaesFra(under, p), `${p.slags} kan ikke nås fra begge`);
  }
});

test('gulvet fylder hele stuen', () => {
  const [g] = gulvet();
  assert.equal(g.x, 0);
  assert.equal(g.w, RUM);
  assert.equal(g.y, 0);
  assert.ok(VX > 0);
});
