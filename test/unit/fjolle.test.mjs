// Enhedstest for «Fjolle-Obby» (public/spil/fjolle/bane.mjs).
//
//   node --test test/unit/fjolle.test.mjs
//
// Banen er håndlavet, så her er der to ting at passe på: at hvert eneste
// spring rent faktisk kan tages (også det, der kræver en pruttesky eller en
// ballon), og at ingen af de fjollede forhindringer kan slå én ihjel. Beviset
// for, at det hænger sammen i praksis, er botten: den spiller alle ni etaper
// igennem med præcis de samme knapper som et barn.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SP_B, VX, G, H_HOP, VJ, GAB_MIN, PUDDING_UNDER, ANTAL_ETAPER, ETAPER,
  FJEDER, GELE_LILLE, GELE_STOR, PRUT_AF, PRUT_PERIODE, PRUT_FARLIG, SLIM_FART,
  HOENE_AF, BALLON_OP, BANAN_BREMSE,
  hopHoejde, tNed, raekkevidde, gabMaks, naaes, afsaet, opretBane, byggEtape,
  pladeY, staarPaa, fartPaa, vjFra, prutAktiv, prutX, iPrut, hoene,
  nyStand, skridt, botTryk, botSpiller, kanNaaNu,
} from '../../public/spil/fjolle/bane.mjs';

const bane = opretBane();
const alle = Array.from({ length: ANTAL_ETAPER }, (_, i) => bane.etape(i + 1));
const stille = { venstre: false, hoejre: false, hop: false };

/* ---------- Fysikken ---------- */

test('hoppet når præcis den højde, det lover', () => {
  assert.ok(Math.abs(hopHoejde(VJ) - H_HOP) < 1e-9, 'H_HOP passer med afsættet');
  assert.ok(Math.abs(tNed(0) - 2 * VJ / G) < 1e-9, 'man er nede igen efter to gange opturen');
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

test('fjeder, gelé og pruttesky sender én forskelligt højt op', () => {
  assert.ok(hopHoejde(VJ * FJEDER) > H_HOP * 1.5, 'fjederen er meget bedre end et hop');
  assert.ok(hopHoejde(VJ * GELE_LILLE) >= H_HOP - 1e-9, 'gelé kaster mindst som et almindeligt hop');
  assert.ok(hopHoejde(VJ * GELE_STOR) > hopHoejde(VJ * FJEDER), 'og et velrettet tryk i gelé endnu højere');
  assert.ok(hopHoejde(VJ * PRUT_AF) > 5.5, 'prutteskyen er en raket');
});

test('en figur i frit fald lander på pladen under sig', () => {
  const e = bane.etape(1);
  const st = nyStand(e);
  for (let i = 0; i < 120; i++) skridt(st, stille, 1 / 120, e);
  assert.equal(st.paa, 0, 'man bliver stående på startpladen');
  assert.equal(st.doed, null);
});

test('man hopper kun, når man har fat i noget – og kun én gang pr. tryk', () => {
  const e = bane.etape(1);
  const st = nyStand(e);
  skridt(st, { ...stille, hop: true }, 1 / 120, e);
  const foerste = st.vy;
  assert.ok(foerste > 0, 'afsæt fra jorden');
  skridt(st, { ...stille, hop: true }, 1 / 120, e);        // knappen holdes nede
  assert.ok(st.vy < foerste, 'man kan ikke hoppe igen oppe i luften');
});

test('man kan kun dø af at lande i buddingen', () => {
  const e = bane.etape(1);
  const st = nyStand(e);
  st.x = e.plader[0].x - 3;                                 // ud over kanten til venstre
  st.paa = -1;
  for (let i = 0; i < 600 && !st.doed; i++) skridt(st, stille, 1 / 120, e);
  assert.equal(st.doed, 'pudding');
  // Og buddingen ligger langt under den laveste plade – man skal have tid til at ærgre sig.
  for (const etape of alle) {
    assert.equal(etape.pudding, Math.min(...etape.plader.map(p => p.y)) - PUDDING_UNDER);
  }
});

/* ---------- Fjolleriet, én forhindring ad gangen ---------- */

test('slim gør én langsom, men kun mens man står i det', () => {
  assert.equal(fartPaa({ slags: 'slim' }), SLIM_FART);
  assert.equal(fartPaa({ slags: 'fast' }), 1);
  const e = byggEtape(5);
  const slim = e.plader.findIndex(p => p.slags === 'slim');
  assert.ok(slim > 0, 'Slimsøen har slim');
  const st = nyStand(e);
  st.paa = slim; st.sidst = slim; st.x = e.plader[slim].x + 0.5; st.y = e.plader[slim].y;
  skridt(st, { ...stille, hoejre: true }, 1 / 60, e);
  assert.ok(Math.abs(st.vx - VX * SLIM_FART) < 1e-9, 'i slimet går man i slowmotion');
});

test('på bananskræl kan man hverken sætte i gang eller bremse', () => {
  const e = byggEtape(2);
  const nr = e.plader.findIndex(p => p.slags === 'banan');
  const p = e.plader[nr];
  const paaPladen = (vx = 0) => {
    const st = nyStand(e);
    st.paa = nr; st.sidst = nr; st.x = p.x + 0.3; st.y = p.y; st.vx = vx;
    return st;
  };

  const start = paaPladen();
  for (let i = 0; i < 6; i++) skridt(start, { ...stille, hoejre: true }, 1 / 60, e);
  assert.ok(start.vx < VX * 0.5, 'man kommer langsomt i gang – fødderne skrider');

  const bremser = paaPladen(VX);
  for (let i = 0; i < 12; i++) skridt(bremser, stille, 1 / 60, e);      // slipper knappen i 0,2 sek.
  assert.equal(bremser.paa, nr, 'man er stadig på pladen');
  assert.ok(bremser.vx > VX - BANAN_BREMSE * 0.25, 'farten falder kun langsomt');
  assert.ok(bremser.x > p.x + 1.3, 'så man skrider et godt stykke videre');

  // Til sammenligning: på en almindelig plade står man stille med det samme.
  const fast = e.plader.findIndex(q => q.slags === 'fast');
  const st = nyStand(e);
  st.paa = fast; st.sidst = fast; st.x = e.plader[fast].x + 0.3; st.y = e.plader[fast].y; st.vx = VX;
  skridt(st, stille, 1 / 60, e);
  assert.equal(st.vx, 0, 'på fast grund stopper man, når man slipper');
});

test('gelé kaster én op af sig selv – og højere, hvis man trykker i landingen', () => {
  const e = byggEtape(3);
  const gele = e.plader.findIndex(p => p.slags === 'gele');
  const fald = (medTryk) => {
    const st = nyStand(e);
    const p = e.plader[gele];
    // Falder ned mod geléen uden at have jord under fødderne (jordTid langt
    // tilbage), så et tryk ikke bliver til et almindeligt hop undervejs.
    st.paa = -1; st.sidst = 0; st.jordTid = -99;
    st.x = p.x + p.w / 2; st.y = p.y + 1.2; st.vy = -1;
    for (let i = 0; i < 120 && st.gelePlask < 0; i++) {
      skridt(st, { ...stille, hop: medTryk }, 1 / 120, e);
    }
    return st;
  };
  const lille = fald(false), stor = fald(true);
  assert.ok(lille.vy > 0 && lille.paa === -1, 'man bliver kastet op med det samme');
  assert.ok(stor.vy > lille.vy * 1.3, 'og meget højere med et tryk i landingen');
});

test('prutteskyen blæser i takt og skyder én til vejrs', () => {
  const p = { x: 0, w: 3.4, y: 0, prut: { b0: 1.1, bw: 1.1, fase: 0 } };
  assert.equal(prutAktiv(p, 0), true);
  assert.equal(prutAktiv(p, PRUT_FARLIG + 0.01), false);
  assert.equal(prutAktiv(p, PRUT_PERIODE + 0.01), true, 'og forfra hver periode');
  assert.ok(Math.abs(prutX(p) - 1.65) < 1e-9);
  assert.equal(iPrut(p, 1.65), true);
  assert.equal(iPrut(p, 3.2), false, 'i den anden ende af pladen sker der ingenting');

  const e = byggEtape(4);
  const sky = e.plader.findIndex(q => q.prut);
  const st = nyStand(e);
  const q = e.plader[sky];
  st.paa = sky; st.sidst = sky; st.x = prutX(q); st.y = q.y;
  let skudt = false;
  for (let i = 0; i < 120 * 3 && !skudt; i++) { skridt(st, stille, 1 / 120, e); skudt = st.paa < 0 && st.vy > 0; }
  assert.ok(skudt, 'står man i skyen, ryger man op inden for én periode');
  assert.ok(st.vy > VJ, 'og det går hurtigere end et almindeligt hop');
});

test('hønen spankulerer frem og tilbage og vipper én op – uden at gøre fortræd', () => {
  const e = byggEtape(7);
  const nr = e.plader.findIndex(p => p.hoene);
  const p = e.plader[nr];
  let mindst = Infinity, mest = -Infinity;
  for (let t = 0; t < 12; t += 0.02) {
    const h = hoene(p, t);
    mindst = Math.min(mindst, h.x); mest = Math.max(mest, h.x);
  }
  assert.ok(mindst >= p.x + p.hoene.fra - 1e-9 && mest <= p.x + p.hoene.til + 1e-9,
    'hønen holder sig på sin plade');
  assert.ok(mest - mindst > 1.5, 'og går frem og tilbage');

  const st = nyStand(e);
  st.paa = nr; st.sidst = nr; st.y = p.y;
  let vippet = false;
  for (let i = 0; i < 120 * 6 && !vippet; i++) {
    const h = hoene(p, st.t);
    st.x = h.x;                                    // vi stiller os i vejen for den
    skridt(st, stille, 1 / 120, e);
    vippet = st.vy > 0;
  }
  assert.ok(vippet, 'løber man ind i hønen, bliver man vippet op i luften');
  assert.ok(Math.abs(st.vy - VJ * HOENE_AF) < VJ * 0.2, 'et lille hop, ikke en katastrofe');
  assert.equal(st.doed, null, 'hønen slår ikke ihjel');
});

test('rullebåndet trækker én med, også når man står stille', () => {
  const e = byggEtape(6);
  const nr = e.plader.findIndex(p => p.band > 0);
  const p = e.plader[nr];
  const st = nyStand(e);
  st.paa = nr; st.sidst = nr; st.x = p.x + 0.5; st.y = p.y;
  const foer = st.x;
  for (let i = 0; i < 60; i++) skridt(st, stille, 1 / 120, e);
  assert.ok(Math.abs((st.x - foer) - p.band * 0.5) < 0.05, 'båndet flytter én med sin egen fart');
});

test('ballonen stiger, mens man står på den, og synker igen', () => {
  const e = byggEtape(8);
  const nr = e.plader.findIndex(p => p.op);
  const p = e.plader[nr];
  const st = nyStand(e);
  st.paa = nr; st.sidst = nr; st.x = p.x + p.w / 2; st.y = p.y;
  for (let i = 0; i < 120; i++) skridt(st, stille, 1 / 120, e);
  assert.ok(Math.abs(st.ballon[p.nr] - BALLON_OP) < 0.05, 'den stiger et stykke på et sekund');
  assert.ok(Math.abs(st.y - pladeY(p, st)) < 1e-9, 'og man følger med op');
  for (let i = 0; i < 120 * 6; i++) skridt(st, stille, 1 / 120, e);
  assert.ok(Math.abs(st.ballon[p.nr] - p.op) < 1e-6, 'til sidst er den helt oppe og bliver dér');
  st.paa = 0; st.sidst = 0;                        // tilbage på startpladen ved siden af
  st.x = e.plader[0].x + 1; st.y = e.plader[0].y;
  for (let i = 0; i < 120 * 6; i++) skridt(st, stille, 1 / 120, e);
  assert.equal(st.ballon[p.nr], 0, 'hopper man af, synker den ned igen');
});

/* ---------- Banen ---------- */

test('de ni etaper har flag i begge ender og plader, der ikke rører hinanden', () => {
  assert.equal(ANTAL_ETAPER, 9);
  for (const e of alle) {
    assert.equal(e.plader[0].slags, 'start', `etape ${e.nr} begynder ved flaget`);
    assert.equal(e.plader[e.maalNr].slags, 'maal', `etape ${e.nr} slutter ved det næste flag`);
    assert.ok(e.plader.length >= 5, `etape ${e.nr} er ikke bare to plader`);
    assert.ok(e.navn && e.tip, `etape ${e.nr} har navn og et tip`);
    for (let i = 1; i < e.plader.length; i++) {
      const a = e.plader[i - 1], b = e.plader[i];
      assert.ok(b.x - (a.x + a.w) >= GAB_MIN - 1e-9,
        `etape ${e.nr}, plade ${i}: pladerne står for tæt`);
    }
  }
  assert.equal(alle[8].sidste, true, 'den sidste etape ved, at den er den sidste');
});

test('hvert eneste spring kan tages', () => {
  let hop = 0;
  for (const e of alle) {
    for (let i = 1; i < e.plader.length; i++) {
      assert.ok(naaes(e.plader[i - 1], e.plader[i]),
        `etape ${e.nr} «${e.navn}», plade ${i}: springet kan ikke tages`);
      hop++;
    }
  }
  assert.ok(hop >= 45, `der blev prøvet ${hop} spring`);
});

test('de spring, der kræver en pruttesky, kan ikke tages uden', () => {
  let kraevet = 0;
  for (const e of alle) {
    for (let i = 1; i < e.plader.length; i++) {
      const a = e.plader[i - 1], b = e.plader[i];
      if (!a.prut) continue;
      const kant = afsaet(a)[0];
      const udenSky = b.y - kant.y <= hopHoejde(kant.vj) - 0.3 &&
        b.x - kant.x <= gabMaks(b.y - kant.y, kant.vj);
      if (!udenSky) kraevet++;
    }
  }
  assert.ok(kraevet >= 3, `${kraevet} spring kan kun tages med prutteskyen`);
});

test('alle ni fjollerier er med på banen', () => {
  const slags = new Set();
  for (const e of alle) for (const p of e.plader) {
    slags.add(p.slags);
    if (p.prut) slags.add('prut');
    if (p.hoene) slags.add('hoene');
  }
  for (const s of ['fast', 'fjeder', 'banan', 'gele', 'slim', 'baand', 'ballon', 'prut', 'hoene']) {
    assert.ok(slags.has(s), `${s} mangler på banen`);
  }
});

test('banen er den samme hver gang – der er ikke noget at være heldig med', () => {
  assert.deepEqual(byggEtape(4).plader, byggEtape(4).plader);
  assert.deepEqual(opretBane().etape(7).plader, byggEtape(7).plader);
  assert.notDeepEqual(byggEtape(4).plader, byggEtape(5).plader);
  assert.equal(byggEtape(1).navn, ETAPER[0].navn);
});

/* ---------- Botten: beviset for at banen kan klares ---------- */

test('botten klarer alle ni etaper uden at falde i buddingen', () => {
  let tid = 0;
  for (const e of alle) {
    const r = botSpiller(e);
    assert.ok(r.klaret,
      `etape ${e.nr} «${e.navn}»: botten nåede ikke i mål (${r.doed || 'tiden løb ud'} efter ${r.tid.toFixed(1)} sek. ved x=${r.stand.x.toFixed(1)}, plade ${r.stand.sidst})`);
    assert.ok(r.tid < 45, `etape ${e.nr} tog ${r.tid.toFixed(1)} sek.`);
    tid += r.tid;
  }
  assert.ok(tid > 40, `hele banen tager ${tid.toFixed(1)} sek. for en bot, der ikke laver fejl`);
  assert.ok(tid < 220, `og ikke en hel eftermiddag (${tid.toFixed(1)} sek.)`);
});

test('man kan ikke bare løbe lige ud eller stå stille', () => {
  for (const e of alle) {
    const doven = nyStand(e);
    for (let i = 0; i < 60 * 40 && !doven.doed; i++) skridt(doven, { ...stille, hoejre: true }, 1 / 60, e);
    assert.ok(!doven.iMaal, `etape ${e.nr}: man skal hoppe for at komme videre`);
    const stiv = nyStand(e);
    for (let i = 0; i < 60 * 10; i++) skridt(stiv, stille, 1 / 60, e);
    assert.ok(!stiv.iMaal && !stiv.doed, `etape ${e.nr}: står man stille, sker der ingenting`);
  }
});

test('botten venter på prutteskyen i stedet for at løbe ud over kanten', () => {
  const e = byggEtape(4);
  const sky = e.plader.findIndex(p => p.prut);
  const st = nyStand(e);
  const p = e.plader[sky];
  st.paa = sky; st.sidst = sky; st.x = p.x + p.w - 0.2; st.y = p.y;
  assert.equal(kanNaaNu(p, e.plader[sky + 1], st), false, 'næste plade er for høj til et almindeligt hop');
  const ind = botTryk(st, e);
  assert.equal(ind.hop, false, 'så botten hopper ikke');
  assert.equal(ind.venstre, true, 'den går tilbage til skyen og venter');
});

test('figuren står altid på en plade, den kan stå på', () => {
  for (const e of alle) {
    const r = botSpiller(e);
    const st = r.stand;
    assert.ok(staarPaa(e.plader[st.paa >= 0 ? st.paa : st.sidst], st.x), `etape ${e.nr}`);
    assert.ok(vjFra(e.plader[0]) === VJ, 'startpladen er en helt almindelig plade');
    assert.ok(st.x > SP_B, 'og man er kommet et stykke fra start');
  }
});
