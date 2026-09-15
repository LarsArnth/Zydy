// Hukommelses-udgave af zydy.dk's API'er til Playwright-testene, så de kan køre
// mod en almindelig filserver uden wrangler dev og uden Cloudflare.
//
// Den kalder den *rigtige* Worker-kode (src/highscore.mjs og src/aktivitet.mjs)
// med lagre i hukommelsen, så testene ser de samme svar som i drift.
//
//   import { mockApi } from './api-mock.mjs';
//   const api = await mockApi(page);          // FØR evt. mere specifikke page.route-kald,
//   ...                                       // for Playwright prøver ruterne nyeste først
//   api.log.aktivitet   → [{ spil, ny?, klient?, slut? }, …]
//   api.scores          → rækkerne i højscore-lageret
//   api.ideer.rows      → de idéer og ønsker der er sendt ind
//   api.venner.rows     → venskaberne, [{ fra, til, fraNavn, tilNavn, svaret }]
//   api.beskeder.rows   → det de har skrevet til hinanden
//   api.opkald.rows     → opkaldene mellem dem, der har ringet sammen
//
// Options: { scores: [{ spil, navn, score }] } lægger startrækker på toplisterne.
import { haandterApi } from '../src/highscore.mjs';
import { haandterAktivitet } from '../src/aktivitet.mjs';
import { haandterIdeer } from '../src/ideer.mjs';
import { haandterVenner } from '../src/venner.mjs';
import { haandterRum } from '../src/rum.mjs';
import { haandterBeskeder, SAMTALE_MAKS } from '../src/beskeder.mjs';
import { haandterOpkald } from '../src/opkald.mjs';

/** Højscore-lager i hukommelsen – samme seks metoder som d1Lager(). */
export function huskLager(start = []) {
  const rows = []; let naeste = 0;
  const tilfoej = r => { const id = ++naeste; rows.push({ id, oprettet: new Date(Date.UTC(2026, 0, 1, 0, 0, id)).toISOString(), ...r }); return id; };
  start.forEach(tilfoej);
  return {
    rows,
    async top(spil, n, retning) {
      const tegn = retning === 'asc' ? 1 : -1;
      return rows.filter(r => r.spil === spil)
        .sort((a, b) => tegn * (a.score - b.score) || a.oprettet.localeCompare(b.oprettet))
        .slice(0, n)
        .map(({ id, navn, score, oprettet }) => ({ id, navn, score, oprettet }));
    },
    async gem(spil, navn, score, retning, token) { return tilfoej({ spil, navn, score, token }); },
    async sletNavn(spil, navn) {
      for (let i = rows.length - 1; i >= 0; i--) {
        if (rows[i].spil === spil && rows[i].navn.toLowerCase() === navn.toLowerCase()) rows.splice(i, 1);
      }
    },
    async omdoeb(spil, id, token, navn) {
      const r = rows.find(x => x.spil === spil && x.id === id && x.token === token);
      if (r) r.navn = navn;
      return !!r;
    },
    async slet(spil, id, token) {
      const i = rows.findIndex(x => x.spil === spil && x.id === id && x.token === token);
      if (i >= 0) rows.splice(i, 1);
      return i >= 0;
    },
    async sletId(spil, id) {
      const i = rows.findIndex(x => x.spil === spil && x.id === id);
      if (i >= 0) rows.splice(i, 1);
    },
  };
}

/** Aktivitets-lager i hukommelsen – samme metoder som d1Aktivitet(). */
export function huskAktivitet() {
  const starter = new Map(), aktive = new Map();
  return {
    starter, aktive,
    async taelStart(spil, dag) { const k = spil + '|' + dag; starter.set(k, (starter.get(k) || 0) + 1); },
    async markerAktiv(klient, spil, nu, navn = null) { aktive.set(klient, { klient, spil, sidst: nu, navn }); },
    async fjernAktiv(klient) { aktive.delete(klient); },
    async rydAktive(foer) { for (const [k, v] of aktive) if (v.sidst < foer) aktive.delete(k); },
    async aktiveNu(efter) {
      return [...aktive.values()].filter(v => v.sidst >= efter).sort((a, b) => a.sidst - b.sidst)
        .map(({ klient, spil, navn }) => ({ klient, spil, navn }));
    },
    async starterPrSpil(fraDag) {
      const ud = {};
      for (const [k, n] of starter) { const [spil, dag] = k.split('|'); if (!fraDag || dag >= fraDag) ud[spil] = (ud[spil] || 0) + n; }
      return ud;
    },
  };
}

/** Idé-lager i hukommelsen – samme to metoder som d1Ideer(). */
export function huskIdeer() {
  const rows = [];
  return {
    rows,
    async gem(slags, spil, navn, tekst) {
      const id = rows.length + 1;
      rows.push({ id, slags, spil, navn, tekst, oprettet: new Date(Date.UTC(2026, 0, 1, 0, 0, id)).toISOString() });
      return id;
    },
    async alle(n = rows.length) { return rows.slice().reverse().slice(0, n); },
  };
}

/** Venne-lager i hukommelsen – samme metoder som d1Venner(). `hs`/`akt` er de
 *  to andre lagre, som navneforslagene hentes fra (toplisterne og dem der er her nu). */
export function huskVenner(hs, akt) {
  const rows = [];
  let n = 0;
  const find = (a, b) => rows.find(r => (r.fra === a && r.til === b) || (r.fra === b && r.til === a));
  return {
    rows,
    async mine(k) { return rows.filter(r => r.fra === k || r.til === k); },
    async par(a, b) { return find(a, b) || null; },
    async spoerg(fra, til, fraNavn, tilNavn) {
      if (!find(fra, til)) rows.push({ fra, til, fraNavn, tilNavn, svaret: null });
    },
    async sigJa(fra, til, tilNavn) {
      const r = rows.find(x => x.fra === fra && x.til === til && !x.svaret);
      if (r) { r.svaret = new Date(Date.UTC(2026, 0, 1, 0, 0, ++n)).toISOString(); r.tilNavn = tilNavn; }
    },
    async slet(a, b) { const i = rows.indexOf(find(a, b)); if (i >= 0) rows.splice(i, 1); },
    async kendteNavne() {
      const nu = akt ? [...akt.aktive.values()].map(v => v.navn).filter(Boolean) : [];
      const fra = hs ? hs.rows.slice().reverse().map(r => r.navn) : [];
      return [...nu, ...fra];
    },
  };
}

/** Rum-lager i hukommelsen – samme metoder som d1Rum(). */
export function huskRum() {
  const rows = [];
  return {
    rows,
    async find(kode) { return rows.find(r => r.kode === kode) || null; },
    async mine(k, efter) {
      return rows.filter(r => (r.vaert === k || r.gaest === k) && r.status !== 'slut' && r.opdateret >= efter)
        .sort((a, b) => b.opdateret - a.opdateret);
    },
    async opret(r) { rows.push({ ...r }); },
    async saetStatus(kode, status, nu) {
      const r = rows.find(x => x.kode === kode);
      if (r) { r.status = status; r.opdateret = nu; }
    },
    async gem(kode, tilstand, version, nu) {
      const r = rows.find(x => x.kode === kode);
      if (!r || r.version !== version) return false;
      r.tilstand = tilstand; r.version++; r.opdateret = nu;
      return true;
    },
    async sletPar(a, b) {
      for (let i = rows.length - 1; i >= 0; i--) {
        const r = rows[i];
        if ((r.vaert === a && r.gaest === b) || (r.vaert === b && r.gaest === a)) rows.splice(i, 1);
      }
    },
    async ryd(foer) { for (let i = rows.length - 1; i >= 0; i--) if (rows[i].opdateret < foer) rows.splice(i, 1); },
  };
}

/** Besked-lager i hukommelsen – samme metoder som d1Beskeder(). */
export function huskBeskeder() {
  const rows = [];
  let naeste = 0;
  return {
    rows,
    async gem(b) {
      const id = ++naeste;
      rows.push({ id, ...b });
      // Samme trimning som i D1: kun de nyeste SAMTALE_MAKS i hver samtale.
      const mine = rows.filter(r => r.samtale === b.samtale);
      for (const gammel of mine.slice(0, Math.max(0, mine.length - SAMTALE_MAKS))) {
        rows.splice(rows.indexOf(gammel), 1);
      }
      return id;
    },
    async hent(samtale, efter, n) {
      return rows.filter(r => r.samtale === samtale && r.id > efter).slice(-n);
    },
    async sidste(k, n) {
      const sidst = new Map();
      rows.filter(r => r.fra === k || r.til === k).forEach(r => sidst.set(r.samtale, r));
      return [...sidst.values()].sort((a, b) => b.id - a.id).slice(0, n);
    },
    async antalEfter(samtale, efter) {
      return rows.filter(r => r.samtale === samtale && r.id > efter).length;
    },
    async antalFra(fra, efter) {
      return rows.filter(r => r.fra === fra && r.oprettet >= efter).length;
    },
    async sletSamtale(samtale) {
      for (let i = rows.length - 1; i >= 0; i--) if (rows[i].samtale === samtale) rows.splice(i, 1);
    },
  };
}

/** Opkalds-lager i hukommelsen – samme metoder som d1Opkald(). */
export function huskOpkald() {
  const rows = [];
  return {
    rows,
    async find(kode) { return rows.find(r => r.kode === kode) || null; },
    async mine(k, efter) {
      return rows.filter(r => (r.fra === k || r.til === k) && r.status !== 'slut' && r.opdateret >= efter)
        .sort((a, b) => b.opdateret - a.opdateret).slice(0, 10);
    },
    async opret(r) { rows.push({ ...r }); },
    async saetStatus(kode, status, nu) {
      const r = rows.find(x => x.kode === kode);
      if (r) { r.status = status; r.opdateret = nu; }
    },
    async saetSvar(kode, svar, nu) {
      const r = rows.find(x => x.kode === kode);
      if (r) { r.svar = svar; r.status = 'igang'; r.opdateret = nu; }
    },
    async sletPar(a, b) {
      for (let i = rows.length - 1; i >= 0; i--) {
        const r = rows[i];
        if ((r.fra === a && r.til === b) || (r.fra === b && r.til === a)) rows.splice(i, 1);
      }
    },
    async ryd(foer) { for (let i = rows.length - 1; i >= 0; i--) if (rows[i].opdateret < foer) rows.splice(i, 1); },
  };
}

/**
 * Sætter mocken op på `page`. Returnerer lagrene og en log over aktivitets-kald.
 * `opt.delMed` er et tidligere svar fra mockApi: så deler de to sider database,
 * og man kan spille to spillere mod hinanden i to faner (test/rum.test.mjs).
 */
export async function mockApi(page, opt = {}) {
  const delt = opt.delMed || null;
  const hs = delt ? delt.hs : huskLager(opt.scores || []);
  const akt = delt ? delt.akt : huskAktivitet();
  const ideer = delt ? delt.ideer : huskIdeer();
  const venner = delt ? delt.venner : huskVenner(hs, akt);
  const rum = delt ? delt.rum : huskRum();
  const beskeder = delt ? delt.beskeder : huskBeskeder();
  const opkald = delt ? delt.opkald : huskOpkald();
  const log = delt ? delt.log : { aktivitet: [], highscore: [] };

  // Cloudflare Web Analytics-beaconen holdes ude af testene. Den hører ikke til
  // spillene, og fra localhost afviser cloudflareinsights.com indrapporteringen
  // med en CORS-fejl, der ellers vælter "ingen console-fejl"-assertionen i hver
  // eneste test. Scriptet svares som tomt, så beaconen aldrig kører.
  await page.route('**/static.cloudflareinsights.com/**',
    route => route.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
  await page.route('**/cdn-cgi/rum**', route => route.fulfill({ status: 204, body: '' }));

  await page.route('**/api/**', async route => {
    const req = route.request();
    const metode = req.method();
    const krop = metode === 'GET' || metode === 'HEAD' ? undefined : (req.postData() ?? undefined);
    const sti = new URL(req.url()).pathname;
    if (sti.startsWith('/api/aktivitet/')) {
      let k = {}; try { k = JSON.parse(krop || '{}'); } catch (e) {}
      log.aktivitet.push({ spil: sti.split('/')[3], ...k });
    } else if (sti.startsWith('/api/highscore/') && metode !== 'GET') {
      let k = {}; try { k = JSON.parse(krop || '{}'); } catch (e) {}
      log.highscore.push({ spil: sti.split('/')[3], metode, ...k });
    }

    const request = new Request(req.url(), { method: metode, headers: req.headers(), body: krop });
    const svar = (await haandterAktivitet(request, akt, hs))
      || (await haandterIdeer(request, ideer))
      || (await haandterVenner(request, venner, beskeder))
      || (await haandterRum(request, rum, venner))
      || (await haandterBeskeder(request, beskeder, venner))
      || (await haandterOpkald(request, opkald, venner))
      || (await haandterApi(request, hs));
    if (!svar) return route.fulfill({ status: 404, contentType: 'application/json', body: '{"ok":false,"fejl":"Ikke API (mock)"}' });
    return route.fulfill({
      status: svar.status,
      headers: Object.fromEntries(svar.headers),
      body: await svar.text(),
    });
  });

  return { hs, akt, ideer, venner, rum, beskeder, opkald, log, get scores() { return hs.rows; } };
}
