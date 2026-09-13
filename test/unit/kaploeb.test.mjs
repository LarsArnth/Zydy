// Kapløb: reglerne bag «man kan joine hinanden i alle spil»
// (public/spil/kaploeb-regler.mjs), at API'et tager imod en invitation til et
// kapløbs-spil, og at de spil, der siger de kan det, også har ledningerne i.
//
// Kør:  node --test test/unit/kaploeb.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  laes, side, tomSide, medRunde, medMig, flet, mangler, stilling, bedre,
  pilleTekst, rundeTekst, runderTekst, vis, SLAGS,
} from '../../public/spil/kaploeb-regler.mjs';
import { haandterRum } from '../../src/rum.mjs';
import { KAPLOEB, SAMMEN, KORT } from '../../src/spil-data.mjs';
import { huskRum, huskVenner, huskLager, huskAktivitet } from '../api-mock.mjs';
import { læsKort } from '../../scripts/byg-forside.mjs';

const rod = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');

/* ---------- Stillingen ---------- */

test('en tom tilstand er to tomme halvdele', () => {
  const t = laes(null);
  assert.equal(t.slags, SLAGS);
  assert.deepEqual(t.vaert, tomSide());
  assert.deepEqual(t.gaest, tomSide());
  // Alt fra nettet kan være rod – det må ikke kunne vælte pillen.
  assert.deepEqual(laes({ vaert: 'pjat', gaest: { bedste: 'nul', runder: -3 } }).gaest, tomSide());
});

test('bedste runde tæller, og retningen bestemmer hvad «bedst» er', () => {
  let m = medRunde(tomSide(), 120, '120 m', 'desc');
  assert.deepEqual(m, { bedste: 120, sidste: 120, runder: 1, tekst: '120 m' });
  m = medRunde(m, 90, '90 m', 'desc');
  assert.deepEqual(m, { bedste: 120, sidste: 90, runder: 2, tekst: '120 m' }, 'en dårligere runde tæller med, men rører ikke rekorden');
  m = medRunde(m, 300, '300 m', 'desc');
  assert.deepEqual(m, { bedste: 300, sidste: 300, runder: 3, tekst: '300 m' });

  // Tider: laveste vinder, og teksten følger med den bedste.
  let t = medRunde(tomSide(), 62, '1:02', 'asc');
  t = medRunde(t, 45, '0:45', 'asc');
  assert.equal(t.bedste, 45);
  assert.equal(t.tekst, '0:45');
  t = medRunde(t, 99, '1:39', 'asc');
  assert.equal(t.bedste, 45, 'en langsommere tur er ikke en ny rekord');
  assert.equal(bedre(45, 62, 'asc'), true);
  assert.equal(bedre(45, 62, 'desc'), false);
});

test('hver skriver kun sin egen halvdel', () => {
  const start = laes({ gaest: { bedste: 500, sidste: 500, runder: 2, tekst: '500' } });
  const ny = medMig(start, 'vaert', medRunde(tomSide(), 300, '300', 'desc'));
  assert.equal(ny.gaest.bedste, 500, 'den andens halvdel står urørt');
  assert.equal(ny.vaert.bedste, 300);
});

test('stillingen ser rigtig ud fra begge sider', () => {
  const t = laes({ vaert: { bedste: 300, runder: 1, sidste: 300, tekst: '300 m' },
    gaest: { bedste: 500, runder: 3, sidste: 200, tekst: '500 m' } });
  const vaert = stilling(t, 'vaert', 'desc');
  assert.equal(vaert.foerer, 'ham');
  assert.equal(vis(vaert.min), '300 m');
  assert.equal(vis(vaert.hans), '500 m');
  const gaest = stilling(t, 'gaest', 'desc');
  assert.equal(gaest.foerer, 'mig');
  // Med tider vender det om.
  assert.equal(stilling(t, 'vaert', 'asc').foerer, 'mig');
  // Ingen har spillet endnu, eller kun den ene.
  assert.equal(stilling(null, 'vaert', 'desc').foerer, null);
  assert.equal(stilling({ vaert: { bedste: 10, runder: 1, sidste: 10 } }, 'vaert', 'desc').foerer, 'mig');
  assert.equal(stilling({ vaert: { bedste: 10, runder: 1, sidste: 10 }, gaest: { bedste: 10, runder: 1, sidste: 10 } },
    'vaert', 'desc').foerer, 'lige');
});

test('flet: en genindlæsning må ikke tabe runder på gulvet', () => {
  const lokal = medRunde(tomSide(), 200, '200', 'desc');
  const paaServer = { bedste: 400, sidste: 400, runder: 2, tekst: '400' };
  assert.deepEqual(flet(tomSide(), paaServer, 'desc'), paaServer, 'frisk fane tager det, der står i rummet');
  const f = flet(lokal, paaServer, 'desc');
  assert.equal(f.bedste, 400, 'serverens bedre rekord vinder');
  assert.equal(f.runder, 2);
  assert.equal(flet(lokal, tomSide(), 'desc').bedste, 200, 'serveren har intet: min egen står ved magt');
  assert.equal(flet(medRunde(lokal, 900, '900', 'desc'), paaServer, 'desc').bedste, 900);
});

test('mangler: en score, der ikke kom op i rummet, bliver prøvet igen', () => {
  const min = medRunde(tomSide(), 200, '200', 'desc');
  assert.equal(mangler(min, tomSide()), true);
  assert.equal(mangler(min, side(min)), false);
  assert.equal(mangler(min, { bedste: 200, sidste: 200, runder: 5, tekst: '200' }), false);
});

/* ---------- Teksterne på skærmen ---------- */

test('pillen siger hvor man står, i alle tre tilstande', () => {
  const st = stilling({ vaert: { bedste: 300, runder: 1, sidste: 300, tekst: '300 m' },
    gaest: { bedste: 500, runder: 2, sidste: 500, tekst: '500 m' } }, 'vaert', 'desc');
  assert.equal(pilleTekst(st, 'Selma', 'igang'), '🏁 Du 300 m · 👑Selma 500 m');
  // Venter man stadig på vennen, står ens egen score der alligevel – ellers ser
  // det ud, som om runden gik tabt.
  assert.equal(pilleTekst(st, 'Selma', 'inviteret'), '🏁 Du 300 m · venter på Selma…');
  assert.equal(pilleTekst(stilling(null, 'vaert', 'desc'), 'Selma', 'inviteret'), '🏁 Venter på Selma…');
  assert.match(pilleTekst(st, 'Selma', 'slut'), /Selma stoppede/);
  // Ingen af dem er i mål endnu.
  assert.equal(pilleTekst(stilling(null, 'vaert', 'desc'), 'Selma', 'igang'), '🏁 Du – · Selma –');
});

test('beskeden efter en runde passer til stillingen', () => {
  const lav = { vaert: { bedste: 100, runder: 1, sidste: 100, tekst: '100' },
    gaest: { bedste: 500, runder: 1, sidste: 500, tekst: '500' } };
  assert.match(rundeTekst(stilling(lav, 'vaert', 'desc'), 'Selma', 'igang'), /Selma fører med 500/);
  assert.match(rundeTekst(stilling(lav, 'gaest', 'desc'), 'Sofie', 'igang'), /Du fører: 500 mod 100/);
  assert.match(rundeTekst(stilling({ vaert: { bedste: 7, runder: 1, sidste: 7 } }, 'vaert', 'desc'), 'Selma', 'igang'),
    /Selma er ikke i mål endnu/);
  assert.match(rundeTekst(stilling(null, 'vaert', 'desc'), 'Selma', 'inviteret'), /venter på, at Selma hopper med/);
  const lige = { vaert: { bedste: 9, runder: 1, sidste: 9, tekst: '9' }, gaest: { bedste: 9, runder: 4, sidste: 9, tekst: '9' } };
  assert.match(rundeTekst(stilling(lige, 'vaert', 'desc'), 'Selma', 'igang'), /Helt lige/);
  assert.equal(runderTekst(tomSide()), 'ingen runder endnu');
  assert.equal(runderTekst({ runder: 1 }), '1 runde');
  assert.equal(runderTekst({ runder: 4 }), '4 runder');
});

/* ---------- API'et ---------- */

const BASE = 'https://zydy.dk';
const post = (sti, krop) => new Request(BASE + sti, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(krop),
});

function toVenner() {
  const v = huskVenner(huskLager(), huskAktivitet());
  v.rows.push({ fra: 'sofie', til: 'selma', fraNavn: 'Sofie', tilNavn: 'Selma', svaret: '2026-09-13T10:00:00Z' });
  return { rum: huskRum(), venner: v };
}
const kald = async (req, o) => {
  const svar = await haandterRum(req, o.rum, o.venner);
  return { status: svar.status, krop: await svar.json() };
};

test('et kapløb er et helt almindeligt rum – serveren kender ikke reglerne', async () => {
  const o = toVenner();
  const inv = await kald(post('/api/rum', { navn: 'Sofie', ven: 'Selma', spil: 'weee' }), o);
  assert.equal(inv.krop.ok, true);
  const kode = inv.krop.rum.kode;
  await kald(post('/api/rum/' + kode, { navn: 'Selma', handling: 'kom' }), o);

  // Sofie skriver sin halvdel, Selma sin – ingen af dem rører den andens.
  const sofie = await kald(post('/api/rum/' + kode, { navn: 'Sofie', handling: 'gem', version: 0,
    tilstand: medMig(null, 'vaert', medRunde(tomSide(), 300, '300 m', 'desc')) }), o);
  assert.equal(sofie.krop.rum.tilstand.vaert.bedste, 300);

  const selma = await kald(post('/api/rum/' + kode, { navn: 'Selma', handling: 'gem', version: 1,
    tilstand: medMig(sofie.krop.rum.tilstand, 'gaest', medRunde(tomSide(), 500, '500 m', 'desc')) }), o);
  assert.equal(selma.krop.rum.tilstand.vaert.bedste, 300, 'Sofies halvdel står stadig');
  assert.equal(selma.krop.rum.tilstand.gaest.bedste, 500);
  assert.equal(stilling(selma.krop.rum.tilstand, 'gaest', 'desc').foerer, 'mig');
});

test('kommer man for sent, skriver man sin halvdel oven i det friske rum', async () => {
  const o = toVenner();
  const kode = (await kald(post('/api/rum', { navn: 'Sofie', ven: 'Selma', spil: 'taarn' }), o)).krop.rum.kode;
  await kald(post('/api/rum/' + kode, { navn: 'Selma', handling: 'kom' }), o);

  // Begge tegner ud fra version 0 og skriver samtidig.
  await kald(post('/api/rum/' + kode, { navn: 'Sofie', handling: 'gem', version: 0,
    tilstand: medMig(null, 'vaert', medRunde(tomSide(), 12, '12 blokke', 'desc')) }), o);
  const forSent = await kald(post('/api/rum/' + kode, { navn: 'Selma', handling: 'gem', version: 0,
    tilstand: medMig(null, 'gaest', medRunde(tomSide(), 30, '30 blokke', 'desc')) }), o);
  assert.equal(forSent.krop.uaendret, true, 'Sofie nåede det først');
  assert.equal(forSent.krop.rum.tilstand.vaert.bedste, 12, 'og vi får det friske rum tilbage');

  // Selma skriver igen oven i det, hun fik tilbage – sådan gør kaploeb.js.
  const igen = await kald(post('/api/rum/' + kode, { navn: 'Selma', handling: 'gem',
    version: forSent.krop.rum.version,
    tilstand: medMig(forSent.krop.rum.tilstand, 'gaest', medRunde(tomSide(), 30, '30 blokke', 'desc')) }), o);
  assert.equal(igen.krop.uaendret, undefined);
  assert.deepEqual([igen.krop.rum.tilstand.vaert.bedste, igen.krop.rum.tilstand.gaest.bedste], [12, 30]);
});

/* ---------- Ledningerne i spillene ---------- */

test('hvert kapløbs-spil har rum.js, kaploeb.js og et Kaploeb.slut-kald', () => {
  const kort = læsKort();
  assert.ok(KAPLOEB.length >= 10, 'der skulle være kapløb i mindst 10 spil');
  for (const k of kort) {
    const html = k.ekstern ? null : readFileSync(path.join(rod, 'public/spil', k.id, 'index.html'), 'utf8');
    if (!k.kapløb) {
      if (html) assert.ok(!html.includes('Kaploeb.slut('), `${k.id}: kalder Kaploeb.slut uden "kapløb": true i kort.json`);
      continue;
    }
    assert.ok(!k.ekstern, `${k.id}: et kapløb kræver, at spillet bor her`);
    assert.ok(k.højscore, `${k.id}: et kapløb måler på scoren, så spillet skal have en topliste`);
    assert.match(html, /<script src="\/spil\/rum\.js"><\/script>/, `${k.id}: mangler /spil/rum.js`);
    assert.match(html, /<script type="module" src="\/spil\/kaploeb\.js"><\/script>/, `${k.id}: mangler /spil/kaploeb.js`);
    assert.match(html, /if \(window\.Kaploeb[^)]*\) Kaploeb\.slut\(/, `${k.id}: siger runden er slut til Kaploeb`);
  }
});

test('KAPLOEB og SAMMEN er de spil, kortene siger, og de overlapper ikke', () => {
  const kort = læsKort();
  assert.deepEqual(KAPLOEB, kort.filter(k => k.kapløb).map(k => k.id));
  assert.deepEqual(SAMMEN, kort.filter(k => k.sammen).map(k => k.id));
  for (const id of KAPLOEB) {
    assert.ok(!SAMMEN.includes(id), `${id}: deler man ét parti, er et kapløb bare forvirrende`);
    assert.ok(KORT.some(k => k.id === id), `${id}: står ikke på forsiden`);
  }
  // Forsiden kender dem på mærket på kortet.
  const html = readFileSync(path.join(rod, 'public/index.html'), 'utf8');
  for (const id of KAPLOEB) assert.match(html, new RegExp(`data-spil="${id}" data-kaploeb`), `${id}: mangler data-kaploeb`);
});
