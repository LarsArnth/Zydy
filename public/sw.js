/*
  Service worker for zydy.dk — så siden virker uden internet og ikke koster
  data hver gang (Selmas ønske #56: «Gør at appen ikke koster internet»).

  Uden den henter telefonen hele forsiden og hele spillet forfra, hver eneste
  gang der bliver trykket på et kort. Med den ligger filerne på telefonen:
  andet besøg koster ingenting, og har man trykket «Hent alle spil», kan man
  spille i bilen, i sommerhuset og alle de steder, hvor der ikke er wifi.

  Tre regler, og de er værd at kende, før man retter her:

  1. /api/* bliver ALDRIG rørt. Toplister, venner, beskeder og «hvem er her nu»
     skal være friske, og de skal fejle ærligt, når der ikke er net. Service
     workeren svarer slet ikke på dem — den lader dem gå direkte ud, præcis som
     om den ikke var her. Det er også dét, der gør, at Playwright-testenes
     page.route på /api/ stadig fanger dem.
     (Og pas på med at skrive et Playwright-mønster med stjerner her i en
     blok-kommentar: stjerne-skråstreg lukker kommentaren midt i sætningen, og
     så er hele filen pludselig ugyldig og service workeren registreres aldrig.)

  2. Alt andet på vores eget domæne er «cache først»: ligger filen, bruges den,
     og der bliver ikke spurgt nettet om lov. Det er hele pointen — et opslag
     til nettet for at høre, om filen er ny, koster næsten lige så meget som
     filen selv.

  3. Så hvordan kommer nyt så ind? Via ét lille opslag pr. sideindlæsning:
     /offline-filer.json med en `version`, der er en hash af alt indholdet
     (genereret af scripts/byg-forside.mjs). Er versionen en anden, end den der
     ligger, henter vi det nye ned i baggrunden og siger til siden, at der er
     noget nyt. Cachen hedder «zydy-<version>», så den gamle kan smides væk i
     ét stykke, og de to udgaver aldrig blandes sammen.

  Selve knapperne og teksten står i public/offline.js.
*/
'use strict';

const LISTE = '/offline-filer.json';
const PRAEFIKS = 'zydy-';
// Et lille mærke, vi selv lægger i cachen: «her er hentet ALT, ikke kun
// skallen». Så ved vi, at vi også skal hente spillene igen ved en ny version.
const ALT_MAERKE = '/__alt-hentet';
const SAMTIDIGE = 6;                 // hvor mange filer vi henter ad gangen

/* ---------- Cachen og dens version ---------- */

/** Navnet på den cache, der ligger nu (der er højst én). */
async function nuvaerende() {
  const navne = await caches.keys();
  return navne.filter(n => n.startsWith(PRAEFIKS)).sort().pop() || null;
}

const versionAf = navn => (navn ? navn.slice(PRAEFIKS.length) : null);

/** Smider alle andre zydy-cacher væk end `behold`. */
async function ryd(behold) {
  for (const navn of await caches.keys()) {
    if (navn.startsWith(PRAEFIKS) && navn !== behold) await caches.delete(navn);
  }
}

/** Har vi hentet hele molevitten, eller kun skallen? */
async function altHentet(cache) {
  return !!(await cache.match(ALT_MAERKE));
}

/* ---------- Hentning ---------- */

/**
 * Henter `urler` ned i `cache`, nogle stykker ad gangen, og melder undervejs.
 * En fil, der ikke kan hentes, springes over — så mister vi den ene fil i
 * stedet for hele hentningen.
 */
async function hentNed(cache, urler, meld) {
  let hentet = 0, fejl = 0;
  const koe = urler.slice();
  const arbejder = async () => {
    for (let url = koe.shift(); url !== undefined; url = koe.shift()) {
      try {
        // no-store: vi vil have fat i det rigtige svar, ikke browserens egen
        // gamle kopi af det — cachen her er den, der skal gælde.
        const svar = await fetch(url, { cache: 'no-store' });
        if (svar && svar.ok) await cache.put(url, svar.clone());
        else fejl++;
      } catch (e) { fejl++; }
      hentet++;
      if (meld) meld(hentet, urler.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(SAMTIDIGE, urler.length) }, arbejder));
  return { hentet, fejl };
}

/** Listen over filer, frisk fra nettet. Kaster, hvis der ikke er net. */
async function hentListen() {
  const svar = await fetch(LISTE, { cache: 'no-store' });
  if (!svar.ok) throw new Error('offline-filer.json: ' + svar.status);
  return svar.json();
}

/**
 * Tjekker om der er en ny version, og henter den i så fald ned.
 * `ogsaaSpil` tvinger spillene med (det er «Hent alle spil»-knappen).
 * Returnerer status til siden.
 */
async function opdater({ ogsaaSpil = false } = {}) {
  const gammel = await nuvaerende();
  let liste;
  try {
    liste = await hentListen();
  } catch (e) {
    // Intet net. Det er ikke en fejl — det er hele grunden til, at vi er her.
    return status({ offline: true });
  }

  const navn = PRAEFIKS + liste.version;
  const nyVersion = navn !== gammel;
  const cache = await caches.open(navn);
  // Skal vi have spillene med? Ja hvis der bliver bedt om det, eller hvis de
  // lå der i forvejen — så mister man dem ikke, bare fordi der kom en ny version.
  const spilMed = ogsaaSpil || (nyVersion && gammel ? await altHentet(await caches.open(gammel)) : await altHentet(cache));

  const mangler = async urler => {
    const ud = [];
    for (const url of urler) if (!(await cache.match(url))) ud.push(url);
    return ud;
  };
  const skal = await mangler(liste.skal);
  const spil = spilMed ? await mangler(liste.spil) : [];
  const alle = skal.concat(spil);

  if (alle.length) {
    // `spil` fortæller siden, om det er spillene der hentes, eller bare skallen
    // i baggrunden ved første besøg – det sidste skal ikke stå på skærmen som
    // «Henter spillene ned», for det er ikke det, der sker.
    besked({ type: 'henter', hentet: 0, ialt: alle.length, spil: spilMed });
    await hentNed(cache, alle, (hentet, ialt) => besked({ type: 'henter', hentet, ialt, spil: spilMed }));
  }
  if (spilMed) await cache.put(ALT_MAERKE, new Response('ja'));
  await ryd(navn);

  const ud = await status({ nyVersion: nyVersion && !!gammel });
  besked(ud);
  return ud;
}

/** Fjerner det hele igen — «Fjern fra telefonen». */
async function glem() {
  await ryd(null);
  const ud = await status();
  besked(ud);
  return ud;
}

/* ---------- Status til siden ---------- */

/** Hvad ligger der lige nu? Det er dét, offline.js skriver på skærmen. */
async function status(ekstra = {}) {
  const navn = await nuvaerende();
  const cache = navn ? await caches.open(navn) : null;
  return {
    type: 'status',
    version: versionAf(navn),
    klar: !!navn,                                   // skallen ligger
    alt: cache ? await altHentet(cache) : false,    // spillene ligger også
    antal: cache ? (await cache.keys()).length : 0,
    ...ekstra,
  };
}

/** Siger det samme til alle åbne faner. */
async function besked(data) {
  for (const klient of await self.clients.matchAll({ includeUncontrolled: true })) klient.postMessage(data);
}

/* ---------- Livscyklus ---------- */

self.addEventListener('install', e => {
  self.skipWaiting();                 // ingen grund til at vente på, at fanen lukkes
  // Hentningen må gerne fejle (ingen net) — så er vi bare ikke klar endnu.
  e.waitUntil(opdater().catch(() => {}));
});

self.addEventListener('activate', e => {
  e.waitUntil(self.clients.claim());
});

self.addEventListener('message', e => {
  const d = e.data || {};
  const svar = ud => { if (e.source) e.source.postMessage(ud); };
  if (d.type === 'tjek') e.waitUntil(opdater().then(svar).catch(() => {}));
  else if (d.type === 'hentAlt') e.waitUntil(opdater({ ogsaaSpil: true }).then(svar).catch(() => {}));
  else if (d.type === 'glem') e.waitUntil(glem().then(svar).catch(() => {}));
  else if (d.type === 'status') e.waitUntil(status().then(svar).catch(() => {}));
});

/* ---------- Selve opslaget ---------- */

/** Adressen som cachen kender den: uden ?rum=… og uden #. */
const noegle = url => url.origin + url.pathname;

/** Siden man får, når man er offline og ikke har hentet den, man bad om. */
const offlineSide = () => new Response(
  `<!DOCTYPE html><html lang="da"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Ingen internet</title>
<style>html,body{margin:0;height:100%;display:flex;align-items:center;justify-content:center;
background:#11142a;color:#fff7e6;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Rounded",sans-serif;
text-align:center;padding:24px}h1{font-size:28px;margin:0 0 10px}p{color:#a9acd6;margin:0 0 20px;font-size:17px}
a{display:inline-block;background:#ffd447;color:#11142a;font-weight:800;text-decoration:none;
padding:14px 22px;border-radius:16px;font-size:17px}</style></head>
<body><div><h1>📴 Ingen internet</h1>
<p>Det her spil er ikke hentet ned endnu.<br>Gå tilbage til forsiden og tryk «Hent alle spil»,<br>næste gang du er på wifi.</p>
<a href="/">Til forsiden</a></div></body></html>`,
  { headers: { 'Content-Type': 'text/html; charset=utf-8' } });

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;                       // kun opslag, aldrig indsendelser
  let url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.origin !== self.location.origin) return;        // beaconen og alt andet udefra
  if (url.pathname.startsWith('/api/')) return;           // regel 1: API'et er vores ikke
  if (url.pathname === LISTE) return;                     // versions-opslaget skal være friskt

  e.respondWith(svarFra(req, url));
});

/** Cache først, nettet bagefter — og en ærlig besked, hvis ingen af delene kan. */
async function svarFra(req, url) {
  const navn = await nuvaerende();
  const cache = navn ? await caches.open(navn) : null;
  const laagt = cache ? await cache.match(noegle(url)) : null;
  if (laagt) return laagt;

  try {
    const svar = await fetch(req);
    // Læg den på telefonen med det samme, så den er der næste gang. Kun hele,
    // gode svar — en halv fil i cachen er værre end ingen.
    if (cache && svar && svar.ok && svar.status === 200 && svar.type !== 'opaque') {
      cache.put(noegle(url), svar.clone()).catch(() => {});
    }
    return svar;
  } catch (e) {
    if (req.mode === 'navigate') return offlineSide();
    return new Response('', { status: 504, statusText: 'Ingen internet' });
  }
}
