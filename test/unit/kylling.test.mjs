// Kyllingejagt – gårdspladsen, bonden og kyllingerne. Ingen browser:
//   node --test test/unit/kylling.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TID, AREAL, MAAL_MIN, MAAL_MAKS, BONDE_R, KYLLING_R, FANG_R, BONDE_FART, FLUGT_FART,
  SKRAEK, SMUT_AFSTAND, SMUT_PAUSE, ANTAL, DOER_SKY, GULD,
  gaardMaal, doer, nyTur, tik, flugtFart, bot, koer,
} from '../../public/spil/kylling/kylling.mjs';

const SEEDS = [1, 2, 3, 7, 42, 99, 123];
const DT = 1 / 60;
const gns = a => a.reduce((x, y) => x + y, 0) / a.length;

/* ---------- Gårdspladsen ---------- */

test('gårdspladsen har samme areal på højkant og på tværs, men følger skærmens form', () => {
  for (const [w, h] of [[358, 600], [600, 600], [1000, 640], [320, 420], [100, 900], [900, 100]]) {
    const g = gaardMaal(w, h);
    assert.ok(Math.abs(g.b * g.h - AREAL) < 0.01, `${w}×${h}: arealet er ${g.b * g.h}`);
    assert.ok(g.b >= MAAL_MIN && g.b <= MAAL_MAKS && g.h >= MAAL_MIN && g.h <= MAAL_MAKS, `${w}×${h}: ${g.b}×${g.h}`);
    assert.equal(g.h >= g.b, h >= w, 'en høj skærm giver en høj gårdsplads');
  }
  const g = gaardMaal(0, 0);
  assert.ok(g.b > 0 && g.h > 0, 'uden mål får man stadig en gårdsplads');
});

test('en ny runde: fuld gårdsplads, ingen kylling er bange fra start, og samme frø giver samme runde', () => {
  for (const seed of SEEDS) {
    const s = nyTur(seed, 14, 22);
    assert.equal(s.kyllinger.length, ANTAL);
    assert.equal(s.fangst, 0);
    for (const k of s.kyllinger) {
      assert.ok(k.x > 0 && k.x < s.b && k.y > 0 && k.y < s.h, 'kyllingen står på gårdspladsen');
      assert.ok(Math.hypot(k.x - s.bonde.x, k.y - s.bonde.y) > SKRAEK, 'og ikke lige ved siden af bonden');
      assert.equal(k.slags, 'kylling', 'guldkyllingen kommer først senere');
    }
    const a = nyTur(seed, 14, 22), b = nyTur(seed, 14, 22);
    for (let i = 0; i < 300; i++) { tik(a, DT, { x: 1, y: -0.5 }); tik(b, DT, { x: 1, y: -0.5 }); }
    assert.deepEqual(a.kyllinger.map(k => [k.x, k.y]), b.kyllinger.map(k => [k.x, k.y]));
  }
  const x = nyTur(1).kyllinger.map(k => k.x).join(), y = nyTur(2).kyllinger.map(k => k.x).join();
  assert.notEqual(x, y, 'to frø må ikke give den samme gårdsplads');
});

/* ---------- Bonden ---------- */

test('bonden løber med joysticket, skal have fart på og kan ikke komme ud over hegnet', () => {
  const s = nyTur(1, 14, 22);
  const x0 = s.bonde.x;
  tik(s, DT, { x: 1, y: 0 });
  assert.ok(s.bonde.vx > 0 && s.bonde.vx < BONDE_FART, 'en vending tager lidt tid');
  for (let i = 0; i < 60; i++) tik(s, DT, { x: 1, y: 0 });
  assert.ok(s.bonde.x > x0 + 2, 'bonden løber til højre');
  // Længere end 1 giver ikke ekstra fart
  const f = nyTur(1, 14, 22);
  for (let i = 0; i < 30; i++) tik(f, DT, { x: 5, y: 0 });
  assert.ok(Math.abs(f.bonde.vx - BONDE_FART) < 0.01, 'topfarten er BONDE_FART');
  // Løb ind i hegnet i alle fire retninger
  for (const [jx, jy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const h = nyTur(3, 14, 22);
    for (let i = 0; i < 400; i++) tik(h, DT, { x: jx, y: jy });
    assert.ok(h.bonde.x >= BONDE_R - 1e-9 && h.bonde.x <= h.b - BONDE_R + 1e-9, 'inden for hegnet vandret');
    assert.ok(h.bonde.y >= BONDE_R - 1e-9 && h.bonde.y <= h.h - BONDE_R + 1e-9, 'inden for hegnet lodret');
  }
  // Uden joystick bremser han op
  for (let i = 0; i < 60; i++) tik(s, DT, null);
  assert.ok(Math.hypot(s.bonde.vx, s.bonde.vy) < 0.01, 'slipper man, står bonden stille');
});

/* ---------- Kyllingerne ---------- */

test('kyllingerne bliver aldrig væk – de holder sig inden for hegnet, hvad der end sker', () => {
  for (const seed of SEEDS) {
    const s = nyTur(seed, 13.4, 22.4);
    let j = null, siden = 1;
    while (!s.slut) {
      siden += DT;
      if (siden >= 0.1) { j = bot(s); siden = 0; }
      tik(s, DT, j);
      for (const k of s.kyllinger) {
        assert.ok(k.x >= KYLLING_R - 1e-9 && k.x <= s.b - KYLLING_R + 1e-9, `frø ${seed}: kylling ${k.id} ude af siden`);
        assert.ok(k.y >= KYLLING_R - 1e-9 && k.y <= s.h - KYLLING_R + 1e-9, `frø ${seed}: kylling ${k.id} ude af enden`);
      }
    }
  }
});

test('en kylling flygter, når bonden kommer, og slår smut, når han er helt tæt på', () => {
  const s = nyTur(5, 14, 22);
  s.kyllinger = s.kyllinger.slice(0, 1);
  const k = s.kyllinger[0];
  Object.assign(k, { x: 7, y: 11, vx: 0, vy: 0 });
  Object.assign(s.bonde, { x: 7 - SKRAEK + 0.5, y: 11, vx: 0, vy: 0 });
  tik(s, DT, null);
  assert.equal(k.bange, true, 'kyllingen er bange');
  for (let i = 0; i < 20; i++) tik(s, DT, null);
  assert.ok(k.vx > 1, 'og løber væk fra bonden');

  // Helt tæt på: smut til siden
  Object.assign(k, { x: 7, y: 11, vx: 0, vy: 0, smutKlar: 0, smut: 0 });
  Object.assign(s.bonde, { x: 7 - SMUT_AFSTAND + 0.2, y: 11, vx: 0, vy: 0 });
  const e = tik(s, DT, null);
  assert.deepEqual(e.smut, [k.id], 'kyllingen slår smut');
  assert.ok(Math.abs(k.vy) > Math.abs(k.vx) * 0.8, 'mest til siden');
  assert.ok(Math.hypot(k.vx, k.vy) > BONDE_FART, 'og hurtigere end bonden');
  assert.ok(k.smutKlar > SMUT_PAUSE - 0.1, 'og så skal den hvile, før den kan igen');
  // Lige efter kan den ikke slå smut igen
  for (let i = 0; i < 20; i++) tik(s, DT, null);
  Object.assign(s.bonde, { x: k.x - 1.3, y: k.y, vx: 0, vy: 0 });
  assert.deepEqual(tik(s, DT, null).smut, [], 'det andet smut kommer ikke med det samme');
});

test('smuttet vælger den side, hvor der er plads – ikke ind i hegnet', () => {
  const s = nyTur(5, 14, 22);
  s.kyllinger = s.kyllinger.slice(0, 1);
  const k = s.kyllinger[0];
  // Kyllingen går langs det venstre hegn, bonden kommer nedefra
  Object.assign(k, { x: 1, y: 10, vx: 0, vy: 0, smutKlar: 0 });
  Object.assign(s.bonde, { x: 1, y: 10 + SMUT_AFSTAND - 0.2, vx: 0, vy: 0 });
  tik(s, DT, null);
  assert.ok(k.vx > 0, 'den smutter ud mod midten af gårdspladsen');
});

test('en kylling, der ikke er bange, går roligt rundt og pikker', () => {
  const s = nyTur(8, 14, 22);
  Object.assign(s.bonde, { x: 7, y: 21.4 });
  s.kyllinger = s.kyllinger.slice(0, 1);
  Object.assign(s.kyllinger[0], { x: 7, y: 4 });
  let maks = 0;
  for (let i = 0; i < 600; i++) {
    tik(s, DT, null);
    maks = Math.max(maks, Math.hypot(s.kyllinger[0].vx, s.kyllinger[0].vy));
  }
  assert.ok(maks < 1.5, `kyllingen løb ${maks} m/s uden at være bange`);
});

test('kyllingerne bliver lidt hurtigere, jo flere man har fanget – men kun lidt', () => {
  const s = nyTur(1);
  const k = { slags: 'kylling' }, g = { slags: 'guld' };
  assert.equal(flugtFart(s, k), FLUGT_FART);
  assert.ok(flugtFart(s, g) > flugtFart(s, k), 'guldkyllingen er hurtigere');
  s.fangst = 1000;
  assert.ok(flugtFart(s, k) <= FLUGT_FART * 1.25 + 1e-9, 'loftet holder');
  assert.ok(flugtFart(s, g) < BONDE_FART, 'selv guldkyllingen på fuld fart er langsommere end bonden');
});

/* ---------- Fang ---------- */

test('løber man ind i en kylling, er den fanget – og en ny kommer ud af hønsehuset', () => {
  const s = nyTur(4, 14, 22);
  const k = s.kyllinger[0];
  Object.assign(s.bonde, { x: k.x - FANG_R + 0.1, y: k.y });
  k.smutKlar = 99;                                     // ingen smut i denne test
  const e = tik(s, DT, null);
  assert.equal(e.fanget.length, 1);
  assert.equal(e.fanget[0].id, k.id);
  assert.equal(s.fangst, 1); assert.equal(s.antal, 1);
  assert.ok(!s.kyllinger.some(q => q.id === k.id), 'den fangede er væk fra gårdspladsen');
  // Bonden står væk fra døren – så kommer der en ny (måske allerede i samme skridt)
  Object.assign(s.bonde, { x: 2, y: s.h - 2 });
  let ud = e.ud;
  for (let i = 0; i < 120 && !ud.length; i++) ud = tik(s, DT, null).ud;
  assert.equal(ud.length, 1, 'en ny kylling kommer ud');
  const ny = s.kyllinger.find(q => q.id === ud[0].id);
  assert.ok(Math.abs(ny.x - doer(s).x) < 1 && ny.y < 1, 'ud ad hønsehusets dør');
  assert.equal(s.kyllinger.length, ANTAL);
});

test('står man ved døren, tør kyllingerne ikke komme ud – man kan ikke bare stå dér og tage dem', () => {
  const s = nyTur(4, 14, 22);
  s.kyllinger = [];
  const D = doer(s);
  Object.assign(s.bonde, { x: D.x, y: D.y + DOER_SKY - 0.5 });
  for (let i = 0; i < 600; i++) {
    const e = tik(s, DT, null);
    assert.equal(e.ud.length, 0, 'ingen kommer ud, mens bonden står ved døren');
  }
  assert.equal(s.fangst, 0);
  Object.assign(s.bonde, { x: 2, y: s.h - 2 });
  for (let i = 0; i < 60 * 8; i++) tik(s, DT, null);
  assert.equal(s.kyllinger.filter(k => k.slags === 'kylling').length, ANTAL, 'går man væk, kommer de ud igen');
});

test('en bonde, der står stille, fanger ingenting', () => {
  for (const seed of SEEDS) assert.equal(koer(seed, () => null).fangst, 0, `frø ${seed}`);
});

/* ---------- Guldkyllingen ---------- */

test('guldkyllingen kommer ud, tæller for tre – og løber hjem igen, hvis man ikke når den', () => {
  const s = nyTur(6, 14, 22);
  Object.assign(s.bonde, { x: 2, y: s.h - 1 });
  let ud = null;
  for (let i = 0; i < 60 * (GULD.foerst + 2) && !ud; i++) {
    const e = tik(s, DT, null);
    ud = e.ud.find(u => u.slags === 'guld') || null;
  }
  assert.ok(ud, 'guldkyllingen kommer ud');
  assert.ok(s.t >= GULD.foerst, 'men ikke før tid');
  // Den løber hjem igen, når dens tid er gået
  let hjem = null;
  for (let i = 0; i < 60 * (GULD.tid + 6) && !hjem; i++) hjem = tik(s, DT, null).hjem[0] || null;
  assert.ok(hjem, 'guldkyllingen løber hjem');
  assert.equal(hjem.id, ud.id);
  assert.ok(!s.kyllinger.some(k => k.slags === 'guld'), 'og er væk fra gårdspladsen');
  assert.equal(s.fangst, 0, 'uden at give noget');

  // Næste gang fanger vi den
  let g = null;
  for (let i = 0; i < 60 * (GULD.hvert + 2) && !g; i++) { tik(s, DT, null); g = s.kyllinger.find(k => k.slags === 'guld'); }
  assert.ok(g, 'der kommer en ny guldkylling');
  g.smutKlar = 99;
  Object.assign(s.bonde, { x: g.x, y: g.y + FANG_R - 0.1 });
  const e = tik(s, DT, null);
  assert.equal(e.fanget[0].vaerd, GULD.vaerd);
  assert.equal(s.fangst, GULD.vaerd, 'guldkyllingen tæller for tre');
  assert.equal(s.antal, 1, 'men er én kylling');
  assert.equal(s.guldFanget, 1);
});

/* ---------- Tiden ---------- */

test('runden varer TID sekunder, og derefter sker der ikke mere', () => {
  const s = nyTur(1);
  let slut = false, n = 0;
  while (!slut) { slut = tik(s, DT, null).slut; n++; }
  assert.ok(Math.abs(s.t - TID) < DT * 1.5, `runden sluttede efter ${s.t} sek`);
  assert.equal(s.slut, true);
  const foer = JSON.stringify(s.kyllinger);
  const e = tik(s, DT, { x: 1, y: 1 });
  assert.equal(e.slut, false, 'slut meldes kun én gang');
  assert.equal(JSON.stringify(s.kyllinger), foer, 'efter tiden står alt stille');
});

/* ---------- Balancen, målt med botten ---------- */

test('botten fanger mange, men langt fra alle – smuttene koster', () => {
  const tal = [];
  for (const seed of SEEDS) {
    for (const [w, h] of [[358, 600], [1000, 640]]) {
      const g = gaardMaal(w, h);
      tal.push(koer(seed, bot, g.b, g.h).fangst);
    }
  }
  const snit = gns(tal);
  assert.ok(Math.min(...tal) >= 10, `botten fangede kun ${Math.min(...tal)} på et minut`);
  assert.ok(snit < 45, `botten fanger ${snit} i snit – kyllingerne er for nemme`);
});

test('iPhone og iPad er omtrent lige svære (inden for en tredjedel)', () => {
  const a = gns(SEEDS.map(sd => { const g = gaardMaal(358, 600); return koer(sd, bot, g.b, g.h).fangst; }));
  const b = gns(SEEDS.map(sd => { const g = gaardMaal(1000, 640); return koer(sd, bot, g.b, g.h).fangst; }));
  assert.ok(Math.max(a, b) / Math.min(a, b) < 1.35, `højkant ${a} mod tværs ${b}`);
});
