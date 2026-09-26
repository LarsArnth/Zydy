// Skråningen – banen, kuglen og botten. Ingen browser:
//   node --test test/unit/skraaning.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  R, G, START_FART, MAKS_FART, NAA, START_Z, SVAER_Z,
  fart, lavBane, gulv, midtX, midtY, kVed, blokX, banehoejde, nyTur, tik, koer, bot, botTur,
} from '../../public/spil/skraaning/skraaning.mjs';

const SEEDS = [1, 2, 3, 7, 42, 99, 123];
const LANG = 3500;

/* ---------- Farten ---------- */

test('farten stiger hele vejen, men når aldrig loftet', () => {
  assert.equal(fart(0), START_FART);
  let forrige = 0;
  for (let z = 0; z < 20000; z += 250) {
    const v = fart(z);
    assert.ok(v > forrige, `farten stiger ikke ved ${z} m`);
    assert.ok(v < MAKS_FART);
    forrige = v;
  }
  assert.ok(fart(SVAER_Z) > START_FART * 2, 'langt nede går det mere end dobbelt så stærkt');
});

/* ---------- Banen ---------- */

test('banen er den samme hver gang med samme frø – og en anden med et andet', () => {
  const a = lavBane(7), b = lavBane(7), c = lavBane(8);
  a.udvid(1500); b.udvid(1500); c.udvid(1500);
  assert.deepEqual(a.stykker.map(p => [p.type, p.z1, p.w]), b.stykker.map(p => [p.type, p.z1, p.w]));
  assert.notDeepEqual(a.stykker.map(p => p.type).slice(0, 30), c.stykker.map(p => p.type).slice(0, 30));
});

test('stykkerne hænger sammen: ingen spring i midterlinjen, undtagen ned efter et hul', () => {
  for (const seed of SEEDS) {
    const b = lavBane(seed); b.udvid(LANG);
    for (let i = 1; i < b.stykker.length; i++) {
      const p = b.stykker[i - 1], q = b.stykker[i];
      assert.ok(Math.abs(q.z0 - p.z1) < 1e-9, 'ingen mellemrum mellem stykkerne');
      if (p.hul) {
        assert.ok(q.y0 < p.y0, 'efter et hul ligger banen lavere');
        assert.ok(Math.abs(q.x0 - p.x0) < 1e-9, 'og lige ud for, hvor man sprang');
        assert.equal(q.hul, undefined, 'aldrig to huller i træk');
        continue;
      }
      assert.ok(Math.abs(midtX(p, p.z1) - q.x0) < 1e-9, `frø ${seed}: midterlinjen springer til siden ved ${q.z0}`);
      assert.ok(Math.abs(midtY(p, p.z1) - q.y0) < 1e-9, `frø ${seed}: midterlinjen springer op eller ned ved ${q.z0}`);
      assert.ok(q.w >= p.w - 1.2 - 1e-9, `frø ${seed}: banen bliver pludselig ${(p.w - q.w).toFixed(1)} m smallere`);
    }
  }
});

test('banen går altid nedad, og den er smallere langt nede', () => {
  for (const seed of SEEDS) {
    const b = lavBane(seed); b.udvid(LANG);
    for (const p of b.stykker) assert.ok(p.sl < 0, 'hvert stykke hælder nedad');
    const bredde = (z0, z1) => {
      const ps = b.stykker.filter(p => !p.hul && p.z0 >= z0 && p.z1 <= z1);
      return ps.reduce((s, p) => s + p.w, 0) / ps.length;
    };
    assert.ok(bredde(SVAER_Z - 600, SVAER_Z + 400) < bredde(0, 600) - 1.5, `frø ${seed}: banen bliver ikke smallere`);
  }
});

test('skrå banestykker hælder blødt ind og ud, så der ikke kommer et trin', () => {
  let set = 0;
  for (const seed of SEEDS) {
    const b = lavBane(seed); b.udvid(LANG);
    for (const p of b.stykker.filter(q => q.k)) {
      set++;
      assert.ok(Math.abs(kVed(p, p.z0)) < 1e-9);
      assert.ok(Math.abs(kVed(p, p.z1)) < 1e-9);
      assert.ok(Math.abs(kVed(p, (p.z0 + p.z1) / 2) - p.k) < 1e-9);
    }
  }
  assert.ok(set > 10, 'der er skrå stykker på banen');
});

test('et hul kan altid springes: kuglen er over kanten, når den når den anden side', () => {
  let huller = 0;
  for (const seed of SEEDS) {
    const b = lavBane(seed); b.udvid(LANG);
    for (let i = 1; i < b.stykker.length - 1; i++) {
      const h = b.stykker[i];
      if (!h.hul) continue;
      huller++;
      // Læg en kugle på kanten lige før hullet og lad den rulle ligeud
      const s = nyTur(seed);
      const p = b.stykker[i - 1];
      s.bane = b;
      s.z = h.z0 - 0.5; s.x = midtX(p, s.z); s.y = gulv(b, s.x, s.z);
      s.vy = p.sl * fart(s.z); s.vx = 0;
      let landet = false;
      for (let n = 0; n < 240 && !s.doed; n++) {
        const e = tik(s, 1 / 120, 0);
        if (e.land) { landet = true; break; }
      }
      assert.ok(landet && !s.doed, `frø ${seed}: kuglen lander ikke efter hullet ved ${h.z0.toFixed(0)} m (${s.aarsag})`);
      assert.ok(s.z > h.z1, 'og den lander på den anden side');
    }
  }
  assert.ok(huller > 20, `der er huller på banen (${huller})`);
});

test('der er altid et hul i en klodsrække, stort nok til kuglen – og man kan nå det fra det forrige', () => {
  let raekker = 0, glidende = 0;
  for (const seed of SEEDS) {
    const b = lavBane(seed); b.udvid(LANG);
    for (const p of b.stykker) {
      let forrige = null;
      for (const r of p.raekker) {
        raekker++;
        assert.ok(r.z0 > p.z0 && r.z1 < p.z1, 'rækken ligger på sit eget stykke');
        if (r.glid) { glidende++; forrige = null; continue; }
        const { x, b: bred } = r.fri;
        assert.ok(bred >= 2 * R + 0.8, 'hullet er stort nok');
        assert.ok(x - bred / 2 >= midtX(p, r.z0) - p.w / 2 - 1e-9 && x + bred / 2 <= midtX(p, r.z0) + p.w / 2 + 1e-9, 'og ligger på banen');
        // Ingen klods står i hullet
        for (const bl of p.blokke) {
          if (bl.glid || bl.z0 !== r.z0) continue;
          assert.ok(bl.x + bl.b / 2 <= x - bred / 2 + 1e-9 || bl.x - bl.b / 2 >= x + bred / 2 - 1e-9, 'en klods står i hullet');
        }
        const v = fart(r.z0);
        if (forrige) {
          const tid = (r.z0 - forrige.z0) / v;
          assert.ok(Math.abs(x - forrige.fri.x) <= NAA * tid + 1e-9, `frø ${seed}: hullet ved ${r.z0.toFixed(0)} m kan ikke nås fra det forrige`);
        } else {
          // Første række: skal kunne nås fra begge kanter af banen
          const tid = (r.z0 - p.z0) / v;
          const vaerst = Math.abs(x - midtX(p, r.z0)) + p.w / 2;
          assert.ok(vaerst <= NAA * tid + 1e-9, `frø ${seed}: første række ved ${r.z0.toFixed(0)} m kommer for tæt på`);
        }
        forrige = r;
      }
    }
  }
  assert.ok(raekker > 100, `der er klodsrækker (${raekker})`);
  assert.ok(glidende > 5, `og nogle af dem glider (${glidende})`);
});

test('en glidende klods lader altid plads til kuglen på den ene side', () => {
  for (const seed of SEEDS) {
    const b = lavBane(seed); b.udvid(LANG);
    for (const p of b.stykker) for (const bl of p.blokke.filter(q => q.glid)) {
      const c = midtX(p, bl.z0);
      for (let t = 0; t < 10; t += 0.05) {
        const x = blokX(bl, t);
        assert.ok(x - bl.b / 2 >= c - p.w / 2 - 1e-9 && x + bl.b / 2 <= c + p.w / 2 + 1e-9, 'klodsen bliver på banen');
        const plads = Math.max(x - bl.b / 2 - (c - p.w / 2), c + p.w / 2 - (x + bl.b / 2));
        assert.ok(plads >= 2 * R + 0.7, 'der er plads forbi');
      }
      assert.ok(bl.glid.amp * bl.glid.w <= 2.61, 'og den glider ikke hurtigere, end man kan følge med');
    }
  }
});

/* ---------- Kuglen ---------- */

test('en frisk tur ligger på banen og ruller med startfarten', () => {
  const s = nyTur(7);
  assert.equal(s.paa, true);
  assert.equal(s.z, START_Z);
  assert.equal(s.y, gulv(s.bane, 0, START_Z));
  const z0 = s.z;
  tik(s, 0.1, 0);
  assert.ok(Math.abs(s.z - z0 - START_FART * 0.1) < 0.01, 'den ruller af sig selv');
  assert.ok(s.y < gulv(s.bane, 0, z0) + 1e-9 && s.paa, 'ned ad bakken og på banen');
});

test('styringen flytter kuglen til siden – og slipper man, holder den op', () => {
  const v = nyTur(7), h = nyTur(7);
  koer(v, 0.5, -1); koer(h, 0.5, 1);
  assert.ok(v.x < -2 && h.x > 2, `venstre ${v.x.toFixed(2)}, højre ${h.x.toFixed(2)}`);
  koer(h, 0.6, 0);
  assert.ok(Math.abs(h.vx) < 0.3, 'uden styring glider den ikke videre');
});

test('styrer man ud over kanten, falder man af', () => {
  const s = nyTur(7);
  koer(s, 4, 1);
  assert.equal(s.doed, true);
  assert.equal(s.aarsag, 'fald');
  assert.ok(s.y < banehoejde(s.bane, s.z) - 5, 'og kuglen er faldet langt ned');
});

test('rammer man en rød klods, er det slut', () => {
  const b = lavBane(7); b.udvid(2000);
  const p = b.stykker.find(q => q.blokke.some(bl => !bl.glid));
  const bl = p.blokke.find(q => !q.glid);
  const s = nyTur(7);
  s.z = bl.z0 - 3; s.x = bl.x; s.y = gulv(b, s.x, s.z);
  koer(s, 1, 0);
  assert.equal(s.doed, true);
  assert.equal(s.aarsag, 'blok');
  assert.ok(Math.abs(s.z - bl.z0) < 1, 'lige ved klodsen');
});

test('en skrå bane skubber kuglen ned mod den lave side', () => {
  const b = lavBane(42); b.udvid(3000);
  const p = b.stykker.find(q => q.k && q.z1 - q.z0 > 24 && q.w > 4);
  const s = nyTur(42);
  s.z = (p.z0 + p.z1) / 2 - 3; s.x = midtX(p, s.z); s.y = gulv(b, s.x, s.z);
  const x0 = s.x;
  koer(s, 0.25, 0);
  assert.ok(Math.sign(s.x - x0) === -Math.sign(p.k), 'kuglen glider mod den lave side');
});

test('ruller man bare ligeud, kommer man ikke langt', () => {
  for (const seed of SEEDS) {
    const s = koer(nyTur(seed), 120, 0);
    assert.equal(s.doed, true);
    assert.ok(s.meter < 400, `frø ${seed}: ligeud nåede ${s.meter} m`);
    assert.ok(s.meter > 50, `frø ${seed}: men de første meter er lette (${s.meter} m)`);
  }
});

/* ---------- Botten: målestokken ---------- */

test('botten kommer langt – banen kan klares, også når det går stærkt', () => {
  const resultater = SEEDS.map(seed => botTur(seed, 3000));
  const klaret = resultater.filter(s => s.meter >= 3000).length;
  assert.ok(klaret >= SEEDS.length - 2, `botten klarede kun 3000 m på ${klaret} af ${SEEDS.length} baner: ${resultater.map(s => s.meter + (s.aarsag ? ' ' + s.aarsag : '')).join(', ')}`);
  for (const s of resultater) assert.ok(s.meter > 800, `frø ${s.seed}: botten døde allerede ved ${s.meter} m (${s.aarsag})`);
});

test('botten vælger en retning mellem −1 og 1', () => {
  const s = nyTur(3);
  for (let i = 0; i < 20; i++) {
    const v = bot(s);
    assert.ok(v >= -1 && v <= 1);
    koer(s, 0.1, v);
  }
  assert.equal(s.doed, false);
});
