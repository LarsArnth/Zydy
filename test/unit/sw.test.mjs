// Service workeren (public/sw.js) – den kode, der afgør, om zydy.dk virker
// uden internet (Selmas ønske #56).
//
// Den er svær at få øje på, når den går galt: fejler den, ser siden helt normal
// ud, så længe der er wifi, og svigter først den dag, der ikke er. Derfor køres
// den her igennem i en efterlignet service worker-verden — falske `caches`,
// `fetch` og `clients` — så install, «hent alle spil», opslag og opdatering kan
// prøves uden en browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const rod = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const kilde = readFileSync(path.join(rod, 'public/sw.js'), 'utf8');
const ORIGIN = 'https://zydy.dk';
const fuld = u => new URL(u, ORIGIN + '/').href;

/** Én cache, som den rigtige Cache API: nøglen er den fulde adresse. */
function lavCache() {
  const gemt = new Map();
  return {
    gemt,
    async match(k) { const r = gemt.get(fuld(typeof k === 'string' ? k : k.url)); return r ? r.clone() : undefined; },
    async put(k, v) { gemt.set(fuld(typeof k === 'string' ? k : k.url), v); },
    async keys() { return [...gemt.keys()].map(url => ({ url })); },
  };
}

/**
 * Bygger en verden, sw.js kan køre i.
 * `filer` er det, serveren svarer med; alt andet giver 404.
 * `net: false` er «ingen internet»: så kaster fetch, som i en rigtig browser.
 */
function lavVerden(filer = {}, { net = true } = {}) {
  const cacher = new Map();
  const beskeder = [];
  const hentede = [];
  const lyttere = {};

  const caches = {
    async keys() { return [...cacher.keys()]; },
    async open(navn) { if (!cacher.has(navn)) cacher.set(navn, lavCache()); return cacher.get(navn); },
    async delete(navn) { return cacher.delete(navn); },
  };

  const klient = { postMessage: d => beskeder.push(d) };

  const scope = {
    caches, Response, Request, URL, console, Promise, Math, JSON, Array, Object, Error,
    setTimeout, clearTimeout,
    async fetch(input, opt) {
      const url = typeof input === 'string' ? input : input.url;
      const sti = new URL(url, ORIGIN + '/').pathname;
      hentede.push(sti);
      if (!net) throw new TypeError('Failed to fetch');
      if (!(sti in filer)) return new Response('', { status: 404 });
      return new Response(filer[sti], { status: 200 });
    },
  };
  scope.self = scope;
  scope.location = { origin: ORIGIN };
  scope.self.addEventListener = (navn, fn) => { (lyttere[navn] ||= []).push(fn); };
  scope.self.skipWaiting = () => {};
  scope.self.clients = { matchAll: async () => [klient], claim: async () => {} };

  vm.createContext(scope);
  vm.runInContext(kilde, scope);

  /** Sender en hændelse ind i service workeren og venter på, den er færdig. */
  const send = async (navn, e = {}) => {
    const vent = [];
    const haendelse = { ...e, waitUntil: p => vent.push(p), respondWith: p => vent.push(haendelse._svar = p) };
    for (const fn of lyttere[navn] || []) fn(haendelse);
    await Promise.all(vent.map(p => Promise.resolve(p).catch(() => {})));
    return haendelse;
  };

  const besked = async (data, kilde = klient) => {
    const faerdig = new Promise(res => {
      const oprindelig = kilde.postMessage;
      kilde.postMessage = d => { oprindelig(d); if (d.type === 'status') res(d); };
    });
    await send('message', { data, source: kilde });
    return faerdig;
  };

  /** Et opslag, som browseren ville gøre det. */
  const opslag = async (sti, { mode = 'no-cors', method = 'GET' } = {}) => {
    const e = await send('fetch', { request: { url: fuld(sti), method, mode } });
    return e._svar ? await e._svar : null;      // null = «service workeren rørte den ikke»
  };

  return { scope, cacher, beskeder, hentede, send, besked, opslag, caches };
}

/** Den fil-liste, generatoren laver – her i det små. */
const liste = (version, skal, spil) => JSON.stringify({ version, skal, spil });

const FILER = {
  '/offline-filer.json': liste('v1', ['/', '/ideer.js'], ['/spil/kryds/', '/spil/kryds/motor.mjs']),
  '/': '<h1>zydy</h1>',
  '/ideer.js': 'ideer',
  '/spil/kryds/': '<h1>Kryds og bolle</h1>',
  '/spil/kryds/motor.mjs': 'motor',
};

test('install lægger skallen på telefonen – men ikke spillene', async () => {
  const v = lavVerden(FILER);
  await v.send('install');
  const cache = v.cacher.get('zydy-v1');
  assert.ok(cache, 'cachen hedder zydy-<version>, så en ny version kan smides væk i ét stykke');
  assert.ok(await cache.match('/'), 'forsiden ligger klar');
  assert.ok(await cache.match('/ideer.js'), 'de fælles scripts ligger klar');
  assert.equal(await cache.match('/spil/kryds/'), undefined,
    'spillene hentes først, når der bliver trykket på knappen — ellers koster første besøg alt');
});

test('«hent alle spil» tager spillene med', async () => {
  const v = lavVerden(FILER);
  await v.send('install');
  const status = await v.besked({ type: 'hentAlt' });
  assert.equal(status.alt, true, 'status siger, at alt ligger der');
  const cache = v.cacher.get('zydy-v1');
  assert.ok(await cache.match('/spil/kryds/'), 'spillets side');
  assert.ok(await cache.match('/spil/kryds/motor.mjs'), 'og spillets egne filer');
});

test('siden hentes fra telefonen, ikke fra nettet, når den først ligger der', async () => {
  const v = lavVerden(FILER);
  await v.send('install');
  v.hentede.length = 0;
  const svar = await v.opslag('/ideer.js');
  assert.ok(svar, 'service workeren svarer selv');
  assert.equal(await svar.text(), 'ideer');
  assert.deepEqual(v.hentede, [], 'og der blev ikke spurgt på nettet — det er dét, der ikke koster data');
});

test('API\'et bliver aldrig rørt', async () => {
  const v = lavVerden(FILER);
  await v.send('install');
  for (const sti of ['/api/oversigt', '/api/highscore/taarn', '/api/venner?navn=Sofie']) {
    assert.equal(await v.opslag(sti), null,
      `${sti}: toplister og venner skal gå direkte ud, ellers fryser de fast i noget gammelt`);
  }
  // Heller ikke indsendelser (POST) og ikke andre domæner (beaconen).
  assert.equal(await v.opslag('/', { method: 'POST' }), null, 'indsendelser går udenom');
  assert.equal(await v.opslag('https://static.cloudflareinsights.com/beacon.min.js'), null, 'og alt udefra');
  // Versionsfilen selv skal være frisk, ellers opdager vi aldrig noget nyt.
  assert.equal(await v.opslag('/offline-filer.json'), null, 'versionsfilen hentes friskt');
});

test('uden internet får man spillene – og en forklaring på dem, man ikke har', async () => {
  const v = lavVerden(FILER);
  await v.send('install');
  await v.besked({ type: 'hentAlt' });

  v.scope.fetch = async () => { throw new TypeError('Failed to fetch'); };   // nettet ryger
  const spil = await v.opslag('/spil/kryds/', { mode: 'navigate' });
  assert.equal(await spil.text(), '<h1>Kryds og bolle</h1>', 'det hentede spil virker uden net');

  const ukendt = await v.opslag('/spil/findes-ikke/', { mode: 'navigate' });
  assert.equal(ukendt.status, 200);
  assert.match(await ukendt.text(), /Ingen internet/, 'en side, vi ikke har, forklarer sig pænt');
});

test('en ny version henter det nye ned og smider det gamle væk', async () => {
  const v = lavVerden(FILER);
  await v.send('install');
  await v.besked({ type: 'hentAlt' });
  assert.deepEqual([...v.cacher.keys()], ['zydy-v1']);

  // Lars udruller noget nyt: samme filer, nyt indhold, ny version.
  v.scope.fetch = lavVerden({
    ...FILER,
    '/offline-filer.json': liste('v2', ['/', '/ideer.js'], ['/spil/kryds/', '/spil/kryds/motor.mjs']),
    '/ideer.js': 'ideer v2',
  }).scope.fetch;

  const status = await v.besked({ type: 'tjek' });
  assert.equal(status.version, 'v2', 'den nye version ligger nu');
  assert.equal(status.nyVersion, true, 'og siden får besked, så den kan sige «der er noget nyt»');
  assert.deepEqual([...v.cacher.keys()], ['zydy-v2'], 'den gamle cache er væk – ikke to udgaver blandet sammen');

  const cache = v.cacher.get('zydy-v2');
  assert.equal(await (await cache.match('/ideer.js')).text(), 'ideer v2', 'det nye indhold');
  assert.ok(await cache.match('/spil/kryds/'),
    'og spillene følger med uden at man skal trykke igen — man har jo allerede bedt om dem');
});

test('ingen internet ved install: så venter vi bare, uden at vælte', async () => {
  const v = lavVerden(FILER, { net: false });
  await v.send('install');
  assert.deepEqual([...v.cacher.keys()], [], 'der blev ikke lavet en halv cache');
  const svar = await v.opslag('/ideer.js');
  assert.equal(svar.status, 504, 'og et opslag fejler ærligt i stedet for at hænge');
});

test('«fjern fra telefonen» rydder op', async () => {
  const v = lavVerden(FILER);
  await v.send('install');
  await v.besked({ type: 'hentAlt' });
  const status = await v.besked({ type: 'glem' });
  assert.equal(status.klar, false);
  assert.deepEqual([...v.cacher.keys()], [], 'alt er væk igen');
});

test('siden får besked undervejs, så tælleren kan løbe', async () => {
  const v = lavVerden(FILER);
  await v.send('install');
  v.beskeder.length = 0;
  await v.besked({ type: 'hentAlt' });
  const undervejs = v.beskeder.filter(b => b.type === 'henter');
  assert.ok(undervejs.length >= 2, 'der kommer løbende besked om, hvor langt den er');
  assert.ok(undervejs.every(b => b.ialt > 0 && b.hentet <= b.ialt), 'og tallene giver mening');
});
