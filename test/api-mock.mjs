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
//
// Options: { scores: [{ spil, navn, score }] } lægger startrækker på toplisterne.
import { haandterApi } from '../src/highscore.mjs';
import { haandterAktivitet } from '../src/aktivitet.mjs';

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
    async markerAktiv(klient, spil, nu) { aktive.set(klient, { spil, sidst: nu }); },
    async fjernAktiv(klient) { aktive.delete(klient); },
    async rydAktive(foer) { for (const [k, v] of aktive) if (v.sidst < foer) aktive.delete(k); },
    async aktivePrSpil(efter) {
      const ud = {};
      for (const v of aktive.values()) if (v.sidst >= efter) ud[v.spil] = (ud[v.spil] || 0) + 1;
      return ud;
    },
    async starterPrSpil(fraDag) {
      const ud = {};
      for (const [k, n] of starter) { const [spil, dag] = k.split('|'); if (!fraDag || dag >= fraDag) ud[spil] = (ud[spil] || 0) + n; }
      return ud;
    },
  };
}

/** Sætter mocken op på `page`. Returnerer lagrene og en log over aktivitets-kald. */
export async function mockApi(page, opt = {}) {
  const hs = huskLager(opt.scores || []);
  const akt = huskAktivitet();
  const log = { aktivitet: [], highscore: [] };

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
    const svar = (await haandterAktivitet(request, akt, hs)) || (await haandterApi(request, hs));
    if (!svar) return route.fulfill({ status: 404, contentType: 'application/json', body: '{"ok":false,"fejl":"Ikke API (mock)"}' });
    return route.fulfill({
      status: svar.status,
      headers: Object.fromEntries(svar.headers),
      body: await svar.text(),
    });
  });

  return { hs, akt, log, get scores() { return hs.rows; } };
}
