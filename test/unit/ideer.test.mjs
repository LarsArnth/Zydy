// Enhedstest af idé-API'et i src/ideer.mjs – uden database og uden Cloudflare.
// Kør:  node --test test/unit/ideer.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { haandterIdeer, rensIde, rensTekst, TEKST_MAKS } from '../../src/ideer.mjs';
import { huskIdeer } from '../api-mock.mjs';

const BASE = 'https://zydy.dk';
const post = (krop, sti = '/api/ideer') => new Request(BASE + sti, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: typeof krop === 'string' ? krop : JSON.stringify(krop),
});

const NY = { slags: 'nyt', navn: 'Sofie', tekst: 'Et spil hvor man fanger stjerner med en kurv.' };

/* ---------- Rensning ---------- */

test('rensTekst fjerner usynlige tegn, men beholder linjeskift', () => {
  assert.equal(rensTekst('  et   spil​ med   kurv  '), 'et spil med kurv');
  assert.equal(rensTekst('linje et\n\n\n\nlinje to'), 'linje et\n\nlinje to');
  assert.equal(rensTekst('  \n  '), null, 'tom tekst er ikke en idé');
  assert.equal(rensTekst('ok'), null, 'for kort');
  assert.equal(rensTekst(42), null);
  assert.equal(Array.from(rensTekst('æ'.repeat(TEKST_MAKS + 50))).length, TEKST_MAKS, 'klippes til TEKST_MAKS tegn');
});

test('rensIde godtager en idé og et ønske, og afviser resten', () => {
  assert.deepEqual(rensIde(NY), { slags: 'nyt', spil: null, navn: 'Sofie', tekst: NY.tekst });
  assert.deepEqual(rensIde({ slags: 'oenske', spil: 'taarn', navn: 'Simon', tekst: 'Flere farver, tak' }),
    { slags: 'oenske', spil: 'taarn', navn: 'Simon', tekst: 'Flere farver, tak' });

  assert.match(rensIde({ ...NY, slags: 'noget' }).fejl, /slags/i);
  assert.match(rensIde({ slags: 'oenske', navn: 'Sofie', tekst: 'noget mangler' }).fejl, /spil/i, 'ønske uden spil');
  assert.match(rensIde({ slags: 'oenske', spil: 'findesikke', navn: 'Sofie', tekst: 'noget mangler' }).fejl, /spil/i);
  assert.match(rensIde({ ...NY, navn: '   ' }).fejl, /navn/i);
  assert.match(rensIde({ ...NY, tekst: 'nå' }).fejl, /mere/i);
  assert.match(rensIde(null).fejl, /slags/i);
});

test('et ønske til et spil uden topliste er også i orden', () => {
  // 'imposter' bor på GitHub Pages og har ingen topliste, men står på forsiden.
  assert.equal(rensIde({ slags: 'oenske', spil: 'imposter', navn: 'Far', tekst: 'Flere ord til de små' }).spil, 'imposter');
});

/* ---------- API ---------- */

test('POST /api/ideer gemmer og svarer med id', async () => {
  const lager = huskIdeer();
  const svar = await haandterIdeer(post(NY), lager);
  assert.equal(svar.status, 200);
  assert.deepEqual(await svar.json(), { ok: true, id: 1 });
  assert.deepEqual(lager.rows[0], {
    id: 1, slags: 'nyt', spil: null, navn: 'Sofie', tekst: NY.tekst,
    oprettet: lager.rows[0].oprettet,
  });

  await haandterIdeer(post({ slags: 'oenske', spil: 'dybet', navn: 'Sofie', tekst: 'Flere monstre' }), lager);
  assert.equal(lager.rows.length, 2);
  assert.equal((await lager.alle())[0].id, 2, 'nyeste først');
});

test('dårlige indsendelser afvises med en besked man kan vise', async () => {
  const lager = huskIdeer();
  for (const krop of [{ ...NY, slags: 'x' }, { ...NY, tekst: '' }, { ...NY, navn: '' }]) {
    const svar = await haandterIdeer(post(krop), lager);
    assert.equal(svar.status, 400);
    assert.equal((await svar.json()).ok, false);
  }
  const daarligJson = await haandterIdeer(post('{ikke json'), lager);
  assert.equal(daarligJson.status, 400);
  assert.equal(lager.rows.length, 0, 'intet gemt');
});

test('kun POST på /api/ideer; andre stier er ikke API\'ets', async () => {
  const lager = huskIdeer();
  const get = await haandterIdeer(new Request(BASE + '/api/ideer'), lager);
  assert.equal(get.status, 405);
  assert.equal(await haandterIdeer(new Request(BASE + '/api/highscore/taarn'), lager), null);
  assert.equal(await haandterIdeer(new Request(BASE + '/spil/taarn/'), lager), null);
});
