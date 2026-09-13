// Søgningen på forsiden (public/soeg-regler.mjs) og de nøgleord, kortene søges
// på. Testen kører mod de *rigtige* kort.json-filer, så et nyt spil, der glemmer
// sine nøgleord — eller et, man ikke kan finde på sit eget navn — falder her og
// ikke først, når et barn leder efter det.
//
// Kør:  node --test test/unit/soeg.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { normaliser, ord, soegetekst, staarI, passer, filtrer, LANGT_ORD } from '../../public/soeg-regler.mjs';
import { læsKort } from '../../scripts/byg-forside.mjs';

const rod = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const kort = læsKort();
const find = (id) => kort.find(k => k.id === id);
const ids = (s) => filtrer(kort, s).map(k => k.id);

/* ---------- Teksten ---------- */

test('æ, ø og å skrives også ae, oe og aa', () => {
  assert.equal(normaliser('Tårn'), 'taarn');
  assert.equal(normaliser('Sæt'), 'saet');
  assert.equal(normaliser('KÆLK'), 'kaelk');
  assert.equal(normaliser('Gulvet er lava!'), 'gulvet er lava');
  assert.equal(normaliser('Weeee!'), 'weeee');
  assert.equal(normaliser('  to   ord  '), 'to ord');
  assert.equal(normaliser('café'), 'cafe');          // accenter væk
  assert.equal(normaliser(null), '');
  assert.equal(normaliser(undefined), '');
});

test('søgningen deles op i ord; en tom søgning har ingen', () => {
  assert.deepEqual(ord('Min Kat'), ['min', 'kat']);
  assert.deepEqual(ord('   '), []);
  assert.deepEqual(ord(''), []);
  assert.deepEqual(ord('tre på stribe'), ['tre', 'paa', 'stribe']);
});

test('der søges i navn, nøgleord og beskrivelse', () => {
  const t = soegetekst({ navn: 'Klodser', beskrivelse: 'Din egen 3D-verden.', nøgleord: ['roblox', 'byg'] });
  assert.ok(t.includes('klodser') && t.includes('roblox') && t.includes('3d verden'));
  // Klienten læser nøgleordene som én streng fra data-noegleord.
  assert.ok(soegetekst({ navn: 'Klodser', beskrivelse: '', noegleord: 'roblox, byg' }).includes('roblox'));
  assert.equal(soegetekst({ navn: 'Tårn', beskrivelse: 'Stak blokkene.' }), 'taarn stak blokkene');
});

/* ---------- Hvad der passer ---------- */

test('en tom søgning viser alle kort', () => {
  assert.equal(filtrer(kort, '').length, kort.length);
  assert.equal(filtrer(kort, '   ').length, kort.length);
});

test('korte ord skal begynde et ord, lange må stå midt inde i et', () => {
  assert.equal(LANGT_ORD, 4);
  assert.ok(staarI('ordstige ordspil bogstaver', 'ord'), 'et kort ord i starten af et ord');
  assert.ok(!staarI('dungeon labyrint skatte', 'kat'), '«kat» er ikke Dybet, bare fordi der står «skatte»');
  assert.ok(staarI('ordstige ordspil bogstaver', 'stige'), 'lange ord må stå midt i et sammensat ord');
  assert.ok(staarI('blokblast block blast', 'blast'));
  assert.ok(!staarI('taarn stak blokkene', 'fodbold'));
  assert.ok(staarI('hvad som helst', ''), 'ingenting passer til alt');
});

test('alle ord skal passe, og rækkefølgen er ligegyldig', () => {
  const klodser = find('klodser');
  assert.ok(passer(klodser, 'klo'), 'der filtreres mens man skriver');
  assert.ok(passer(klodser, 'KLODSER'), 'store bogstaver er samme sag');
  assert.ok(passer(klodser, 'klodser roblox'), 'ordene må stå i hver sin ende');
  assert.ok(passer(klodser, 'roblox klodser'), 'rækkefølgen er ligegyldig');
  assert.ok(!passer(klodser, 'klodser fodbold'), 'et ord der ikke passer, slår kortet fra');
});

test('«kat» finder katten og kun den', () => {
  assert.deepEqual(ids('kat'), ['kat']);
  assert.deepEqual(ids('min kat'), ['kat']);
});

test('hvert spil kan findes på sit eget navn', () => {
  for (const k of kort) {
    assert.ok(ids(k.navn).includes(k.id), `${k.id} kan ikke findes på sit eget navn «${k.navn}»`);
    // ... også skrevet uden de danske bogstaver, som børnene tit gør.
    assert.ok(ids(normaliser(k.navn)).includes(k.id), `${k.id} kan ikke findes som «${normaliser(k.navn)}»`);
  }
});

test('spillene kan findes på det, de også hedder', () => {
  const forventet = {
    'roblox': 'klodser',            // Selma spurgte efter Roblox, og det blev Klodser
    'minecraft': 'klodser',
    'block blast': 'blokblast',
    'clash royale': 'slotskamp',
    'my cat': 'kat',
    'killing': 'kat',
    'wordle': 'ordle',
    'tre på stribe': 'kryds',
    'tic tac toe': 'kryds',
    'piano': 'klaver',
    'among us': 'imposter',
    'stone age': 'stenalder',
    'water sort': 'farvesortering',
    'number match': 'taltraef',
    'kælk': 'weee',
    'dungeon': 'dybet',
    'floor is lava': 'lava',
    'hero realms': 'helteriget',
    'minispil': 'miskmask',
    'word ladder': 'ordstige',
    'parkour': 'obby',
    'reflekser': 'duel',
    'tower': 'taarn',
    'kortspil': 'saet',
  };
  for (const [soegning, id] of Object.entries(forventet)) {
    assert.ok(ids(soegning).includes(id), `«${soegning}» burde finde ${id} (fandt: ${ids(soegning).join(', ') || 'ingenting'})`);
  }
});

test('en søgning på noget vi ikke har, giver ingenting', () => {
  assert.deepEqual(ids('fodbold'), []);
  assert.deepEqual(ids('zzzz'), []);
});

/* ---------- Nøgleordene på kortene ---------- */

test('hvert kort har nøgleord, og de er små og brugbare', () => {
  for (const k of kort) {
    assert.ok(Array.isArray(k.nøgleord), `${k.id}/kort.json mangler "nøgleord" (det spillet også hedder)`);
    assert.ok(k.nøgleord.length >= 3, `${k.id}: skriv mindst tre nøgleord, så spillet kan findes`);
    for (const o of k.nøgleord) {
      assert.equal(typeof o, 'string', `${k.id}: nøgleord skal være tekst`);
      assert.ok(normaliser(o).length >= 2, `${k.id}: «${o}» er for kort til at søge på`);
      assert.ok(o.length <= 30, `${k.id}: «${o}» er et helt nøgleord for langt`);
    }
  }
});

test('generatoren skriver nøgleordene ud på kortet, så klienten kan søge i dem', () => {
  const html = readFileSync(path.join(rod, 'public/index.html'), 'utf8');
  for (const k of kort) {
    const m = html.match(new RegExp(`<li data-spil="${k.id}"[^>]*data-noegleord="([^"]*)"`));
    assert.ok(m, `${k.id}: kortet i public/index.html mangler data-noegleord — kør node scripts/byg-forside.mjs`);
    // Klienten søger i den streng, der står i attributten – den skal kunne det samme.
    assert.ok(passer({ navn: k.navn, beskrivelse: k.beskrivelse, noegleord: m[1] }, k.nøgleord[0]),
      `${k.id}: nøgleordene nåede ikke helt ud på kortet`);
  }
});
