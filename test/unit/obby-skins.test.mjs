// Enhedstest for Obbys skins (public/spil/obby/skins.mjs) – Sofies ønske #65:
// «Kan du add flere skins og de må godt være dyre».
//
//   node --test test/unit/obby-skins.test.mjs
//
// Butikken og købet testes i browseren (test/obby.test.mjs). Her tjekkes
// priserne, og at hver skin kan tegnes: tegnSkin() køres mod en falsk canvas,
// der husker hvert punkt, så vi kan se, at ingen hat stikker ud over kanten
// på butikkens lille forhåndsvisning.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SKINS, DYR_FRA, skinMed, erDyr, erLevende, tegnSkin } from '../../public/spil/obby/skins.mjs';

/** En canvas-kontekst, der ikke tegner, men husker alle punkter (i 100-enheder, når s = 100). */
function falskCanvas() {
  const punkter = [], kald = [];
  // Det, der tegnes efter clip() (mønstret på kroppen), kan ikke komme udenfor – det tæller ikke med
  const klip = [false];
  const p = (x, y) => { assert.ok(Number.isFinite(x) && Number.isFinite(y), 'punktet er et tal'); if (!klip.at(-1)) punkter.push([x, y]); };
  const ctx = {
    punkter, kald,
    moveTo: p, lineTo: p,
    quadraticCurveTo(cx, cy, x, y) { p(cx, cy); p(x, y); },
    arc(x, y, r) { p(x - r, y - r); p(x + r, y + r); },
    ellipse(x, y, rx, ry, rot = 0) {
      const c = Math.cos(rot), s = Math.sin(rot);
      const hx = Math.hypot(rx * c, ry * s), hy = Math.hypot(rx * s, ry * c);
      p(x - hx, y - hy); p(x + hx, y + hy);
    },
    rect(x, y, w, h) { p(x, y); p(x + w, y + h); },
    fillRect(x, y, w, h) { p(x, y); p(x + w, y + h); },
    roundRect(x, y, w, h) { p(x, y); p(x + w, y + h); },
    createLinearGradient() { return { stop: [], addColorStop(t, farve) { assert.ok(t >= 0 && t <= 1); assert.equal(typeof farve, 'string'); this.stop.push(farve); } }; },
  };
  // Gennemsigtigheden er det, der får stjerner og glimt til at blinke
  const alfa = [];
  Object.defineProperty(ctx, 'globalAlpha', { set(v) { assert.ok(v >= 0 && v <= 1, `globalAlpha ${v}`); alfa.push(v); }, get() { return alfa.at(-1) ?? 1; } });
  ctx.alfa = alfa;
  for (const navn of ['beginPath', 'closePath', 'fill', 'stroke']) ctx[navn] = () => kald.push(navn);
  ctx.save = () => { kald.push('save'); klip.push(klip.at(-1)); };
  ctx.restore = () => { kald.push('restore'); if (klip.length > 1) klip.pop(); };
  ctx.clip = () => { kald.push('clip'); klip[klip.length - 1] = true; };
  return ctx;
}

test('der er mange flere skins, og de nye er dyre', () => {
  assert.equal(new Set(SKINS.map(s => s.id)).size, SKINS.length, 'id\'erne er forskellige – de gemmes i localStorage');
  assert.equal(new Set(SKINS.map(s => s.navn)).size, SKINS.length, 'navnene er forskellige');
  assert.equal(SKINS.filter(s => s.pris === 0).length, 1, 'præcis én gratis skin');
  assert.equal(SKINS[0].id, 'klassisk', 'Klassisk er den, man starter med');

  const almindelige = SKINS.filter(s => !erDyr(s)), dyre = SKINS.filter(erDyr);
  assert.equal(almindelige.length, 14, 'de 14 gamle skins er der stadig (nogen har købt dem)');
  assert.ok(almindelige.every(s => s.pris <= 100), 'de almindelige koster stadig højst 100');
  assert.ok(dyre.length >= 8, `mange nye dyre skins (${dyre.length})`);
  assert.ok(dyre.every(s => s.pris >= DYR_FRA), `de dyre koster mindst ${DYR_FRA}`);
  assert.ok(Math.max(...dyre.map(s => s.pris)) >= 1000, 'den dyreste koster mindst 1000 – noget at spare op til');

  // Sorteret efter pris, så butikken går fra billig til dyr
  const priser = SKINS.map(s => s.pris);
  assert.deepEqual(priser, [...priser].sort((a, b) => a - b), 'skins står i prisorden');

  // Et langt løb til firkant 100 giver 60 coins: den dyreste må ikke kunne købes på ét
  // eller to løb, men heller ikke kræve et halvt år
  const dyreste = Math.max(...priser);
  assert.ok(dyreste / 60 >= 10 && dyreste / 60 <= 30, `den dyreste kræver ${Math.round(dyreste / 60)} lange løb`);
});

test('de dyre skins ser dyre ud', () => {
  for (const s of SKINS.filter(erDyr)) {
    const saerlig = s.hat || s.moenster || s.gloed || s.krop2;
    assert.ok(saerlig, `${s.navn} har hat, mønster, glød eller gradient`);
  }
  assert.ok(SKINS.filter(erDyr).filter(s => s.gloed).length >= 4, 'flere af dem gløder');
  assert.ok(SKINS.filter(erLevende).length >= 4, 'flere af dem bevæger sig');
  assert.ok(SKINS.filter(s => !erDyr(s)).every(s => !erLevende(s)), 'de almindelige er stille – det levende er de dyres');
});

test('hver skin kan tegnes og holder sig inde i forhåndsvisningen', () => {
  // Butikken tegner kroppen 70 % af kortets canvas med 15 % luft til venstre og
  // 29 % over hovedet: i 100-enheder er der 21 til hver side og 41 opad (43 med
  // en halv pixels slæk – Nissens kvast har altid strejfet kanten).
  for (const skin of SKINS) {
    for (const tid of [0, 0.37, 2.5]) {
      const ctx = falskCanvas();
      tegnSkin(ctx, 100, skin, tid);
      assert.ok(ctx.kald.includes('fill'), `${skin.navn} tegner noget`);
      assert.equal(ctx.kald.filter(k => k === 'save').length, ctx.kald.filter(k => k === 'restore').length, `${skin.navn}: save og restore går op`);
      for (const [x, y] of ctx.punkter) {
        assert.ok(x >= -21 && x <= 121, `${skin.navn}: x=${x.toFixed(1)} bliver klippet i butikken`);
        assert.ok(y >= -43 && y <= 101, `${skin.navn}: y=${y.toFixed(1)} bliver klippet i butikken`);
      }
    }
  }
});

test('en levende skin ændrer sig med tiden, en stille gør ikke', () => {
  const spor = (skin, tid) => {
    const ctx = falskCanvas(), farver = [];
    const lav = ctx.createLinearGradient;
    ctx.createLinearGradient = () => { const g = lav(); farver.push(g.stop); return g; };
    tegnSkin(ctx, 100, skin, tid);
    return JSON.stringify([ctx.punkter, farver, ctx.alfa]);
  };
  for (const skin of SKINS.filter(erLevende)) assert.notEqual(spor(skin, 0), spor(skin, 0.4), `${skin.navn} bevæger sig`);
  for (const skin of SKINS.filter(s => !erLevende(s) && s.hat !== 'glorie')) assert.equal(spor(skin, 0), spor(skin, 0.4), `${skin.navn} står stille`);
});

test('skinMed falder tilbage til Klassisk', () => {
  assert.equal(skinMed('regnbue').navn, 'Enhjørningen');
  assert.equal(skinMed('findes-ikke').id, 'klassisk', 'en gammel eller forkert gemt skin giver Klassisk');
});
