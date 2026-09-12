// Klodsers verden, fysik og sigte – uden browser.
//
//   node --test test/unit/klodser.test.mjs
//
// Det, der er værd at holde fast i: verdenen skal være den samme hver gang for
// det samme frø (ellers kan man ikke gemme den som «frø + mine ændringer»),
// man skal kunne gå op ad en bakke uden at hoppe, man skal ikke kunne gå ud
// gennem kanten, og sigtet skal ramme dét, man kigger på.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BREDDE, HOEJDE, VAND_NIVEAU, GULD_ANTAL, LUFT, GRAES, STEN, VAND, SP_H, VJ,
  lavVerden, blok, saetBlok, overflade, erFast, nySpiller, flyt, sigt, kigRetning,
  kanBygge, rammer, iVand, serialiser, genskab, PALET, BLOKKE,
} from '../../public/spil/klodser/verden.mjs';

/** En flad prøveverden med græs i højde `h` – nemmere at regne på end en bakke. */
function fladVerden(h = 4) {
  const v = { seed: 0, b: new Uint8Array(BREDDE * HOEJDE * BREDDE), aendringer: new Map(), guld: [] };
  for (let z = 0; z < BREDDE; z++) {
    for (let x = 0; x < BREDDE; x++) {
      for (let y = 0; y <= h; y++) saetBlok(v, x, y, z, y === h ? GRAES : STEN);
    }
  }
  v.start = { x: 20.5, y: h + 1, z: 20.5 };
  v.aendringer.clear();
  return v;
}

const ganger = (v, s, ind, sekunder) => {
  for (let i = 0; i < Math.round(sekunder * 60); i++) flyt(v, s, ind, 1 / 60);
  return s;
};

/* ---------- Verdenen ---------- */
test('samme frø giver præcis samme verden', () => {
  const a = lavVerden(1234), b = lavVerden(1234), c = lavVerden(1235);
  assert.deepEqual([...a.b], [...b.b], 'to verdener med samme frø skal være ens');
  assert.deepEqual(a.start, b.start);
  assert.notDeepEqual([...a.b], [...c.b], 'et andet frø skal give en anden verden');
});

test('verdenen har fast bund, luft foroven og vand i lavningerne', () => {
  for (const frø of [1, 2, 7, 99]) {
    const v = lavVerden(frø);
    for (const [x, z] of [[0, 0], [BREDDE - 1, BREDDE - 1], [17, 23]]) {
      assert.ok(erFast(blok(v, x, 0, z)), 'bunden skal være fast overalt');
      assert.equal(blok(v, x, HOEJDE - 1, z), LUFT, 'der skal være luft øverst');
      assert.ok(overflade(v, x, z) > 0, 'hver søjle skal have en overflade');
    }
    let vand = 0;
    for (const t of v.b) if (t === VAND) vand++;
    assert.ok(vand > 0, `frø ${frø}: der skulle være mindst én sø`);
  }
});

test('startpladsen er tør, står på fast grund og har luft nok til at stå op', () => {
  for (const frø of [3, 11, 40, 2026]) {
    const v = lavVerden(frø);
    const { x, y, z } = v.start;
    assert.ok(erFast(blok(v, x, y - 1, z)), 'man skal stå på noget');
    assert.equal(blok(v, x, y, z), LUFT);
    assert.equal(blok(v, x, y + 1, z), LUFT, 'der skal være plads til hovedet');
    assert.ok(y > VAND_NIVEAU + 1, `frø ${frø}: man må ikke starte i vandet`);
    const s = nySpiller(v);
    assert.equal(rammer(v, s.x, s.y, s.z), false, 'spilleren må ikke stå inde i en klods');
    assert.equal(iVand(v, s), false);
  }
});

test('der er 12 guldklodser, og de ligger spredt ud på tør jord', () => {
  for (const frø of [5, 21, 777]) {
    const v = lavVerden(frø);
    assert.equal(v.guld.length, GULD_ANTAL, `frø ${frø}: der skal være ${GULD_ANTAL} guldklodser`);
    for (const g of v.guld) {
      assert.equal(g.taget, false);
      assert.equal(blok(v, g.x, g.y, g.z), LUFT, 'guldet må ikke stå inde i en klods');
      assert.ok(erFast(blok(v, g.x, g.y - 1, g.z)), 'guldet skal svæve lige over noget fast');
      assert.ok(g.y > VAND_NIVEAU + 1, 'ingen guldklodser under vand');
      assert.ok(Math.hypot(g.x - v.start.x, g.z - v.start.z) >= 6, 'ikke lige ved startpladsen');
    }
    for (let i = 0; i < v.guld.length; i++) {
      for (let j = i + 1; j < v.guld.length; j++) {
        const a = v.guld[i], b = v.guld[j];
        assert.ok(Math.hypot(a.x - b.x, a.z - b.z) >= 7, 'to guldklodser må ikke ligge oven i hinanden');
      }
    }
  }
});

/* ---------- Fysikken ---------- */
test('man falder ned og lander oven på overfladen', () => {
  const v = fladVerden(4);
  const s = { ...nySpiller(v), y: 14 };
  ganger(v, s, {}, 2);
  assert.equal(s.y, 5, 'fødderne skal ende oven på græsset i højde 4');
  assert.equal(s.paaJorden, true);
  assert.equal(s.vy, 0);
});

test('man går fremad med den fart der står i verden.mjs', () => {
  const v = fladVerden(4);
  const s = nySpiller(v);
  const z0 = s.z;
  ganger(v, s, { frem: 1 }, 1);
  assert.ok(Math.abs((z0 - s.z) - 4.6) < 0.2, 'ca. 4,6 meter på et sekund (yaw 0 = mod -z)');
  assert.equal(Math.round(s.x * 100) / 100, Math.round(v.start.x * 100) / 100, 'lige ud, ikke til siden');
});

test('en mur på to klodser stopper en; én klods træder man bare op på', () => {
  const v = fladVerden(4);
  const s = nySpiller(v);
  // Mur tværs over foran spilleren (yaw 0 peger mod -z)
  for (let x = 0; x < BREDDE; x++) { saetBlok(v, x, 5, 17, STEN); saetBlok(v, x, 6, 17, STEN); }
  ganger(v, s, { frem: 1 }, 2);
  assert.ok(s.z > 18, 'man skal stoppe foran muren, ikke gå igennem');
  assert.equal(s.y, 5, 'og blive stående på jorden');

  const v2 = fladVerden(4);
  const s2 = nySpiller(v2);
  for (let x = 0; x < BREDDE; x++) {                                  // en afsats, kun én klods høj
    for (let z = 0; z <= 17; z++) saetBlok(v2, x, 5, z, STEN);
  }
  ganger(v2, s2, { frem: 1 }, 2);
  assert.ok(s2.z < 16, 'ét trin op tager man selv');
  assert.equal(s2.y, 6, 'og så går man videre oven på afsatsen');
});

test('hoppet rækker en klods op, og man kan ikke hoppe i luften', () => {
  const v = fladVerden(4);
  const s = nySpiller(v);
  let top = s.y, ekstra = null;
  for (let i = 0; i < 90; i++) {
    const hop = i < 6;                                  // trykket slippes igen
    const vy0 = s.vy;
    flyt(v, s, { hop }, 1 / 60);
    top = Math.max(top, s.y);
    if (i === 20 && !s.paaJorden) {                     // prøv at hoppe igen midt i luften
      const foer = s.vy;
      flyt(v, s, { hop: true }, 1 / 60);
      ekstra = s.vy - foer;
    }
    assert.ok(i < 6 || s.paaJorden || s.vy <= vy0 + 1e-9, 'farten opad kan kun falde, når man er i luften');
  }
  assert.ok(top - 5 >= 1.05, `hoppet skal nå over en klods (nåede ${(top - 5).toFixed(2)})`);
  assert.ok(top - 5 < 2, 'men ikke to');
  assert.ok(ekstra !== null && ekstra < 0, 'et ekstra tryk i luften giver ikke et ekstra hop');
  assert.equal(s.y, 5, 'og man lander igen');
  assert.ok(VJ > 0);
});

test('kanten af verdenen er en usynlig mur, man ikke kan gå ud gennem', () => {
  const v = fladVerden(4);
  const s = { ...nySpiller(v), x: 1.5, z: 1.5 };
  ganger(v, s, { frem: 1, side: -1 }, 5);
  assert.ok(s.x > 0 && s.x < BREDDE, 'stadig inde i verdenen');
  assert.ok(s.z > 0 && s.z < BREDDE);
  assert.equal(rammer(v, s.x, s.y, s.z), false);
});

test('i vand synker man langsomt og kan svømme op', () => {
  const v = fladVerden(4);
  for (let y = 5; y <= 9; y++) for (let x = 18; x <= 22; x++) for (let z = 18; z <= 22; z++) saetBlok(v, x, y, z, VAND);
  const s = { ...nySpiller(v), y: 8 };
  assert.equal(iVand(v, s), true);
  const faldt = [];
  for (let i = 0; i < 30; i++) { const y0 = s.y; flyt(v, s, {}, 1 / 60); faldt.push(y0 - s.y); }
  assert.ok(Math.max(...faldt) < 0.06, 'man synker langsommere end man falder i luft');
  const y1 = s.y;
  ganger(v, s, { hop: true }, 0.5);
  assert.ok(s.y > y1 + 0.5, 'med hop svømmer man opad');
});

/* ---------- Sigtet ---------- */
test('sigtet rammer klodsen man kigger på og peger ud mod den tomme side', () => {
  const v = fladVerden(4);
  const s = nySpiller(v);
  const ned = sigt(v, { x: s.x, y: s.y + 1.6, z: s.z }, kigRetning(0, -Math.PI / 2), 6);
  assert.ok(ned, 'kigger man lige ned, rammer man jorden');
  assert.deepEqual([ned.x, ned.y, ned.z], [20, 4, 20]);
  assert.deepEqual([ned.nx, ned.ny, ned.nz], [0, 1, 0], 'normalen peger op – dér skal en ny klods stå');

  saetBlok(v, 20, 5, 18, STEN);
  const frem = sigt(v, { x: 20.5, y: 5.6, z: 20.5 }, kigRetning(0, 0), 6);
  assert.deepEqual([frem.x, frem.y, frem.z], [20, 5, 18]);
  assert.deepEqual([frem.nx, frem.ny, frem.nz], [0, 0, 1], 'man rammer klodsens bagside set fra +z');

  assert.equal(sigt(v, { x: 20.5, y: 6, z: 20.5 }, kigRetning(0, Math.PI / 2), 6), null, 'himlen er ikke en klods');
  assert.equal(sigt(v, { x: s.x, y: s.y + 1.6, z: s.z }, kigRetning(0, -Math.PI / 2), 0.5), null, 'rækkevidden holdes');
});

test('man kan ikke bygge inde i sig selv eller oven i en klods', () => {
  const v = fladVerden(4);
  const s = nySpiller(v);
  assert.equal(kanBygge(v, s, 20, 5, 20), false, 'dér står man selv');
  assert.equal(kanBygge(v, s, 20, 4, 20), false, 'dér er der allerede græs');
  assert.equal(kanBygge(v, s, 20, 5, 18), true);
  assert.equal(kanBygge(v, s, -1, 5, 20), false, 'uden for verdenen');
  assert.equal(kanBygge(v, s, 20, 7, 20), true, 'over hovedet er i orden');
});

/* ---------- Gem og hent ---------- */
test('verdenen gemmes som frø + ændringer og kommer hel tilbage', () => {
  const v = lavVerden(42);
  saetBlok(v, 5, 12, 5, PALET[0]);
  saetBlok(v, 5, 13, 5, PALET[3]);
  saetBlok(v, Math.floor(v.start.x), Math.floor(v.start.y) - 1, Math.floor(v.start.z), LUFT);
  v.guld[0].taget = true;
  v.guld[4].taget = true;

  const gemt = JSON.parse(JSON.stringify(serialiser(v, { tid: 61.5 })));
  assert.equal(gemt.tid, 61.5, 'ekstra felter følger med');
  assert.ok(gemt.aendringer.length <= 6, 'kun det man selv har ændret gemmes – ikke hele verdenen');

  const igen = genskab(gemt);
  assert.deepEqual([...igen.b], [...v.b], 'verdenen er den samme igen');
  assert.deepEqual(igen.guld.map(g => g.taget), v.guld.map(g => g.taget));
  assert.equal(igen.guld.length, GULD_ANTAL);
  assert.throws(() => genskab({ version: 9, seed: 1 }), /ukendt gemt verden/);
  assert.throws(() => genskab(null), /ukendt gemt verden/);
});

test('paletten peger på klodser, der findes og kan bygges med', () => {
  assert.ok(PALET.length >= 8, 'der skal være farver nok at bygge med');
  for (const t of PALET) {
    assert.ok(BLOKKE[t], 'palet-klods ' + t + ' findes');
    assert.equal(BLOKKE[t].fast, true, BLOKKE[t].navn + ' skal kunne stås på');
  }
  assert.equal(new Set(PALET).size, PALET.length, 'ingen dubletter i paletten');
  assert.ok(SP_H > 1.5 && SP_H < 2, 'figuren er cirka mandshøj');
});
