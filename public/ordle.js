/*
  Ordles topliste på forsiden af zydy.dk. Modul uden build:

    <script type="module" src="/ordle.js"></script>

  Lars' ønske til Ordle lød «Highscore virker ikke», og det gjorde den ikke:
  Ordle bor på larsarnth.github.io og kan ikke sende en score ind til zydy.dk,
  så kortet var det eneste på forsiden helt uden topliste og uden 🏆-mærkat.

  Derfor tæller forsiden selv. Under Ordle-kortet står en lille kasse:

    «Klarede du dagens Ordle?»   [Ja!]  [Ikke endnu]

  Et ja lægger en dag til stimen, og stimen er scoren på `/api/highscore/ordle`
  — altså «flest dage i træk», ligesom Ordstige. Bagefter står der bare
  «🔥 4 dage i træk», og øverste navn på listen dukker op som 🏆-mærkat på
  kortet af sig selv, fordi `ordle` nu står i SPIL (public/spil/ordle/kort.json).

  Fire ting er værd at huske:

  1. **Der spørges kun, når der er noget at spørge om** — man har trykket på
     Ordle-kortet i dag, eller man har en stime i gang, der kan reddes. Ellers
     ville hele familien blive spurgt hver dag om et spil, de ikke spiller.
  2. **Vi tegner igen ved `pageshow`.** Man går til Ordle og trykker tilbage,
     og på iPhone kommer siden tilbage fra bfcache uden at køre scriptet igen.
     Uden det ville spørgsmålet først dukke op ved næste besøg.
  3. **Navnet spørges gennem /ideer.js** (`Ideer.spoergOmNavn`), så det er den
     samme dialog og den samme `zydy.navn`, som spillenes toplister bruger.
  4. **En stime, der ikke kom af sted, prøver igen.** Kvitteringen «navn|dage»
     står i localStorage, så en tur uden forbindelse — eller et nyt navn på
     iPad'en — bliver sendt, næste gang forsiden tegnes.

  Regnestykkerne (datoer, stime, hvornår der spørges) ligger i ordle-regler.mjs
  og er enhedstestet i test/unit/ordle.test.mjs.
*/
import {
  NOEGLE, dagFor, laes, skriv, stime, spoerg, besoeg, udskyd, klaret,
  stimeTekst, kvittering, skalSende,
} from './ordle-regler.mjs';

const SPIL = 'ordle';
const API = '/api/highscore/' + SPIL;
const KEY_NAVN = 'zydy.navn';               // fælles med /spil/highscore.js og /ideer.js

const el = (tag, cls, tekst) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (tekst != null) e.textContent = tekst;
  return e;
};

const hentRaa = k => { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } };
const gemRaa = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };

const iDag = () => dagFor(new Date());
const hentNavn = () => hentRaa(KEY_NAVN);

let tilstand = laes(hentRaa(NOEGLE));
let besked = '';                            // kvitteringen efter et ja, til den næste tegning

function gem(ny) {
  tilstand = ny;
  gemRaa(NOEGLE, skriv(ny));
}

/** Sender stimen til toplisten. Svaret er { placering, uaendret, score, … }. */
async function send(navn, antal) {
  const r = await fetch(API, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ navn, score: antal }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data.ok) throw new Error(data.fejl || 'Kunne ikke gemme (' + r.status + ')');
  return data;
}

/** Hvad der står, når stimen er nået frem til listen. */
function kvitteringsTekst(svar, antal) {
  if (svar.uaendret) return '🔥 ' + stimeTekst(antal) + ' · din rekord er ' + stimeTekst(svar.score);
  if (svar.placering === 1) return '🏆 ' + stimeTekst(antal) + ' – du har rekorden!';
  if (svar.placering) return '🔥 ' + stimeTekst(antal) + ' · du er nr. ' + svar.placering;
  return '🔥 ' + stimeTekst(antal);
}

/**
 * Prøver at få stimen på listen. Kaldes både efter et ja og ved hver tegning,
 * så en stime, der ikke kom af sted, kommer med næste gang. Uden navn eller
 * uden forbindelse sker der ingenting — stimen står der stadig lokalt.
 */
let sender = false;
async function sendStimen(antal, siger) {
  const navn = hentNavn();
  if (sender || !skalSende(tilstand, navn, antal)) return;
  sender = true;
  try {
    const svar = await send(navn, antal);
    gem({ ...tilstand, sendt: kvittering(navn, antal) });
    if (siger) { besked = kvitteringsTekst(svar, antal); tegn(); }
  } catch (e) {
    if (siger) { besked = '🔥 ' + stimeTekst(antal) + ' · listen kunne ikke nås'; tegn(); }
  } finally {
    sender = false;
  }
}

/* ---------- Kassen under kortet ---------- */

let boks = null;

function spoergsmaal(antal) {
  boks.appendChild(el('p', 'or-tekst', antal
    ? 'Klarede du dagens Ordle? Du har ' + stimeTekst(antal) + '.'
    : 'Klarede du dagens Ordle?'));

  const raekke = el('div', 'or-knapper');
  const ja = el('button', 'or-knap or-ja', 'Ja!');
  ja.type = 'button';
  ja.addEventListener('click', () => {
    if (!hentNavn()) {
      // Uden navn kan stimen ikke stå på listen – samme dialog som de andre steder.
      if (window.Ideer && window.Ideer.spoergOmNavn) { window.Ideer.spoergOmNavn(false, sigJa); return; }
    }
    sigJa();
  });

  const nej = el('button', 'or-knap or-nej', 'Ikke endnu');
  nej.type = 'button';
  nej.addEventListener('click', () => { gem(udskyd(tilstand, iDag())); tegn(); });

  raekke.appendChild(ja);
  raekke.appendChild(nej);
  boks.appendChild(raekke);
}

function sigJa() {
  const r = klaret(tilstand, iDag());
  gem(r.tilstand);
  besked = '🔥 ' + stimeTekst(r.stime) + ' · gemmer…';
  tegn();
  sendStimen(r.stime, true);
}

function tegn() {
  const li = document.querySelector('#apps li[data-spil="' + SPIL + '"]');
  if (!li) return;
  if (!boks) {
    boks = el('div', 'or-boks');
    // Lige under kortet, så «Mangler der noget?» fra /ideer.js bliver stående nederst.
    (li.querySelector('a') || li).insertAdjacentElement('afterend', boks);
  }
  boks.innerHTML = '';

  const dag = iDag();
  const antal = stime(tilstand, dag);

  if (besked) {
    boks.appendChild(el('p', 'or-stime', besked));
  } else if (spoerg(tilstand, dag)) {
    spoergsmaal(antal);
  } else if (antal > 0) {
    boks.appendChild(el('p', 'or-stime', '🔥 ' + stimeTekst(antal)));
  }
  boks.hidden = !boks.firstChild;
}

/* ---------- Stil ---------- */

const css = `
.or-boks{margin:2px 8px 0;display:flex;flex-direction:column;gap:8px}
.or-boks[hidden]{display:none}
.or-tekst{margin:0;font-size:15px;line-height:1.35;color:var(--text,#fff7e6)}
.or-stime{margin:0;font-size:15px;font-weight:700;color:var(--sun,#ffd447)}
.or-knapper{display:flex;gap:8px}
.or-knap{font:inherit;font-size:15px;font-weight:800;border:0;border-radius:14px;
  padding:10px 16px;min-height:44px;cursor:pointer}
.or-ja{background:var(--sun,#ffd447);color:#1c1f4a}
.or-nej{background:rgba(255,255,255,.09);color:var(--muted,#a9acd6)}
.or-knap:focus-visible{outline:3px solid var(--sun,#ffd447);outline-offset:3px}
`;
const style = document.createElement('style');
style.textContent = css;
document.head.appendChild(style);

/* ---------- Start ---------- */

function start() {
  const li = document.querySelector('#apps li[data-spil="' + SPIL + '"]');
  if (!li) return;
  const link = li.querySelector('a');
  // Trykket på kortet er det eneste, vi ved om, at nogen har spillet Ordle i dag.
  if (link) link.addEventListener('click', () => gem(besoeg(tilstand, iDag())));
  tegn();
  sendStimen(stime(tilstand, iDag()), false);
}

// Tilbage fra Ordle: på iPhone kommer siden fra bfcache, og scriptet kører ikke
// igen. `pageshow` fyrer begge veje, så kassen er frisk, når man er tilbage.
window.addEventListener('pageshow', () => {
  tilstand = laes(hentRaa(NOEGLE));
  besked = '';
  tegn();
  sendStimen(stime(tilstand, iDag()), false);
});

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();

window.Ordle = { tegn, sigJa, tilstand: () => tilstand };
