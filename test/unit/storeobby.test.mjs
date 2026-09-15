// Enhedstest for «Store Obby» (public/spil/storeobby/bane.mjs).
//
//   node --test test/unit/storeobby.test.mjs
//
// Det, der bliver prøvet af, er generatorens to løfter: at hvert eneste hop
// kan tages i det værst tænkelige øjeblik, og at et farligt bånd altid kan
// passeres. Beviset for, at det også hænger sammen i praksis, er botten: den
// spiller etaperne igennem med præcis de samme knapper som et barn.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SP_B, VX, G, H_HOP, VJ, GAB_MIN, SIKKER_KANT, BAAND_LUFT, FORSVIND, TILBAGE, FRA_ETAPE,
  mulberry32, tNed, raekkevidde, gabMaks, hopHoejde, naaes, opretBane, byggEtape,
  pladeX, pladeY, staarPaa, baandAktiv, baandSkifter, findes,
  nyStand, skridt, botSpiller, vjFra,
} from '../../public/spil/storeobby/bane.mjs';

const FRØ = [1, 2, 3, 7, 11, 42, 99, 123, 2026, 31337];
const etaper = (seed, til = 30) => {
  const bane = opretBane(seed);
  return Array.from({ length: til }, (_, i) => bane.etape(i + 1));
};

/* ---------- Fysikken ---------- */

test('hoppet når præcis den højde, det lover', () => {
  assert.ok(Math.abs(hopHoejde(VJ) - H_HOP) < 1e-9, 'H_HOP passer med afsættet');
  // Faldtiden: man er tilbage i afsætshøjden efter to gange opturen.
  assert.ok(Math.abs(tNed(0) - 2 * VJ / G) < 1e-9);
  assert.equal(tNed(H_HOP + 0.01), null, 'man kan ikke lande højere, end man kan hoppe');
  assert.ok(raekkevidde(-2) > raekkevidde(0), 'et hop nedad rækker længere');
  assert.ok(raekkevidde(2) < raekkevidde(0), 'og et hop opad kortere');
});

test('gabMaks holder sig under det, man faktisk kan nå', () => {
  for (let dy = -2.4; dy <= H_HOP - 0.3; dy += 0.1) {
    assert.ok(gabMaks(dy) <= raekkevidde(dy) + 1e-9, `dy=${dy.toFixed(1)}`);
    assert.ok(gabMaks(dy) >= GAB_MIN);
  }
});

test('en figur i frit fald lander på pladen under sig', () => {
  const etape = opretBane(5).etape(1);
  const st = nyStand(etape);
  for (let i = 0; i < 120; i++) skridt(st, { venstre: false, hoejre: false, hop: false }, 1 / 120, etape);
  assert.equal(st.paa, 0, 'man bliver stående på startpladen');
  assert.equal(st.doed, null);
});

test('man hopper kun, når man har fat i noget – og kun én gang pr. tryk', () => {
  const etape = opretBane(5).etape(1);
  const st = nyStand(etape);
  skridt(st, { hop: true }, 1 / 120, etape);
  const foerste = st.vy;
  assert.ok(foerste > 0, 'afsæt fra jorden');
  skridt(st, { hop: true }, 1 / 120, etape);        // knappen holdes nede
  assert.ok(st.vy < foerste, 'man kan ikke hoppe igen oppe i luften');
});

test('man dør af at falde i lavaen', () => {
  const etape = opretBane(5).etape(1);
  const st = nyStand(etape);
  st.x = etape.plader[0].x - 3;                      // ud over kanten, til venstre for banen
  st.paa = -1;
  for (let i = 0; i < 600 && !st.doed; i++) skridt(st, {}, 1 / 120, etape);
  assert.equal(st.doed, 'lava');
});

test('en plade, der forsvinder, er væk et stykke tid og kommer igen', () => {
  const p = { nr: 3, slags: 'forsvinder' };
  const st = { roert: { 3: 10 } };
  assert.equal(findes(p, st, 10 + FORSVIND - 0.05), true, 'den holder lige et øjeblik');
  assert.equal(findes(p, st, 10 + FORSVIND + 0.05), false, 'så falder den væk');
  assert.equal(findes(p, st, 10 + FORSVIND + TILBAGE + 0.05), true, 'og kommer igen');
});

/* ---------- Banen ---------- */

test('hvert eneste hop kan tages – også i det værste øjeblik', () => {
  let hop = 0;
  for (const seed of FRØ) {
    for (const e of etaper(seed, 40)) {
      for (let i = 1; i < e.plader.length; i++) {
        assert.ok(naaes(e.plader[i - 1], e.plader[i]),
          `frø ${seed}, etape ${e.nr}, plade ${i}: hoppet kan ikke tages`);
        hop++;
      }
    }
  }
  assert.ok(hop > 2000, `der blev prøvet ${hop} hop`);
});

test('pladerne står aldrig oven i hinanden – heller ikke de glidende', () => {
  for (const seed of FRØ) {
    for (const e of etaper(seed, 40)) {
      for (let i = 1; i < e.plader.length; i++) {
        const a = e.plader[i - 1], b = e.plader[i];
        const aH = a.x + a.w + (a.slags === 'skyder' ? a.amp : 0);
        const bV = b.x - (b.slags === 'skyder' ? b.amp : 0);
        assert.ok(bV - aH >= GAB_MIN - 1e-9, `frø ${seed}, etape ${e.nr}, plade ${i}`);
      }
    }
  }
});

test('et farligt bånd har frit felt i begge ender og kan altid nås over', () => {
  let baand = 0;
  for (const seed of FRØ) {
    for (const e of etaper(seed, 40)) {
      for (const p of e.plader) {
        if (!p.baand) continue;
        baand++;
        const b = p.baand;
        assert.ok(b.b0 >= SIKKER_KANT - 1e-9, 'der er et frit felt før båndet');
        assert.ok(p.w - b.b0 - b.bw >= SIKKER_KANT - 1e-9, 'og et efter');
        const kryds = (b.bw + SP_B + 0.12) / VX;
        assert.ok(b.periode - b.farlig >= BAAND_LUFT * kryds,
          `frø ${seed}, etape ${e.nr}: båndet er kun sikkert i ${(b.periode - b.farlig).toFixed(2)} sek.`);
      }
    }
  }
  assert.ok(baand > 100, `der blev prøvet ${baand} bånd`);
});

test('båndets ur skifter frem og tilbage i takt', () => {
  const b = { periode: 3, farlig: 1, fase: 0 };
  assert.equal(baandAktiv(b, 0), true);
  assert.equal(baandAktiv(b, 0.99), true);
  assert.equal(baandAktiv(b, 1.01), false);
  assert.equal(baandAktiv(b, 3.01), true, 'og forfra hver periode');
  assert.ok(Math.abs(baandSkifter(b, 0.5) - 0.5) < 1e-9, 'et halvt sekund til den bliver ufarlig');
  assert.ok(Math.abs(baandSkifter(b, 2) - 1) < 1e-9, 'et sekund til den bliver farlig igen');
});

test('banen lærer sig selv: de svære plader kommer først senere', () => {
  for (const seed of FRØ) {
    for (const e of etaper(seed, 12)) {
      for (const p of e.plader) {
        for (const [slags, fra] of Object.entries(FRA_ETAPE)) {
          if (p.slags === slags) assert.ok(e.nr >= fra, `${slags} kom allerede i etape ${e.nr}`);
        }
        if (p.baand) assert.ok(e.nr >= FRA_ETAPE.pigge, 'pigge kommer først i etape ' + FRA_ETAPE.pigge);
        if (p.baand?.slags === 'snurrer') assert.ok(e.nr >= FRA_ETAPE.snurrer);
      }
    }
  }
});

test('etaperne bliver længere og pladerne smallere, jo længere man kommer', () => {
  const maal = nr => {
    let plader = 0, bredde = 0, antal = 0;
    for (const seed of FRØ) {
      const e = opretBane(seed).etape(nr);
      plader += e.plader.length;
      // Kun de nøgne plader – en plade med bånd er bred med vilje, fordi der
      // skal være et frit felt at vente på i begge ender.
      for (const p of e.plader) { if (p.slags === 'fast' && !p.baand) { bredde += p.w; antal++; } }
    }
    return { plader: plader / FRØ.length, bredde: bredde / Math.max(1, antal) };
  };
  const let_ = maal(1), svaer = maal(30);
  assert.ok(svaer.plader > let_.plader, `etape 30 er længere (${svaer.plader} > ${let_.plader})`);
  assert.ok(svaer.bredde < let_.bredde, `og pladerne smallere (${svaer.bredde.toFixed(2)} < ${let_.bredde.toFixed(2)})`);
});

test('den samme bane kommer igen med det samme frø', () => {
  const a = opretBane(2026).etape(9), b = opretBane(2026).etape(9);
  assert.deepEqual(a.plader, b.plader);
  assert.notDeepEqual(opretBane(2027).etape(9).plader, a.plader, 'et andet frø giver en anden bane');
  // Etaperne må ikke afhænge af hinanden – ellers ville «Fortsæt» give en ny bane.
  const bane = opretBane(5);
  assert.deepEqual(bane.etape(12).plader, byggEtape(12, mulberry32((5 + 12 * 0x9E3779B1) >>> 0)).plader);
});

/* ---------- Botten: beviset for at etaperne kan klares ---------- */

test('botten klarer 300 etaper uden at dø', () => {
  let tid = 0, antal = 0, laengst = 0;
  for (const seed of FRØ) {
    for (const e of etaper(seed, 30)) {
      const r = botSpiller(e, 90);
      assert.ok(r.klaret, `frø ${seed}, etape ${e.nr}: botten nåede ikke i mål (${r.doed || 'tiden løb ud'} efter ${r.tid.toFixed(1)} sek.)`);
      tid += r.tid; antal++; laengst = Math.max(laengst, r.tid);
      assert.equal(r.stand.fald, 0, 'og uden at falde');
    }
  }
  assert.ok(antal === 300 && laengst < 40, `${antal} etaper, længste tog ${laengst.toFixed(1)} sek.`);
});

test('en etape tager længere tid, jo længere man kommer', () => {
  const tid = nr => FRØ.reduce((s, seed) => s + botSpiller(opretBane(seed).etape(nr), 90).tid, 0) / FRØ.length;
  assert.ok(tid(30) > tid(1), 'etape 30 tager længere end etape 1');
});

test('en etape kan ikke klares ved bare at stå stille eller løbe lige ud', () => {
  const e = opretBane(3).etape(6);
  const doven = nyStand(e);
  for (let i = 0; i < 60 * 60; i++) skridt(doven, { hoejre: true }, 1 / 60, e);
  assert.ok(!doven.iMaal, 'man skal hoppe for at komme videre');
});

/* ---------- Pladerne, som de bevæger sig ---------- */

test('en glidende plade tager figuren med sig', () => {
  const e = opretBane(11).etape(20);
  const i = e.plader.findIndex(p => p.slags === 'skyder');
  assert.ok(i > 0, 'etape 20 har en glidende plade');
  const p = e.plader[i];
  const st = nyStand(e);
  st.paa = i; st.sidst = i;
  st.x = pladeX(p, 0) + p.w / 2; st.y = pladeY(p, 0);
  const afstand = st.x - pladeX(p, 0);
  for (let k = 0; k < 60; k++) skridt(st, {}, 1 / 120, e);
  assert.ok(Math.abs((st.x - pladeX(p, st.t)) - afstand) < 0.02, 'man står det samme sted på pladen');
  assert.equal(st.paa, i, 'og bliver stående');
  assert.ok(staarPaa(p, st.t, st.x));
});

test('trampolinen sender én højere op end en almindelig plade', () => {
  assert.ok(vjFra({ slags: 'trampolin' }) > vjFra({ slags: 'fast' }));
  assert.ok(hopHoejde(vjFra({ slags: 'trampolin' })) > H_HOP * 1.5);
});
