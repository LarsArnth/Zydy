/*
  Skriv med dine venner på forsiden af zydy.dk. Klassisk script, ingen build:

    <script src="/beskeder.js" defer></script>     (efter /ideer.js, før /venner.js)

  Man er det navn, man har skrevet på forsiden ('zydy.navn', se /ideer.js), og
  man kan kun skrive med dem, man er venner med — det passer serveren på
  (src/beskeder.mjs). Her er kun skærmen:

    • en samtale pr. ven, i en dialog med de samme farver som resten af siden,
    • fire faste beskeder ("Hej!", "Vil du spille?", 👍, ❤️) til dem, der ikke
      gider skrive på et tastatur på en iPad,
    • en oversigt, som /venner.js bruger til at sætte et 💬-mærke på vennen og
      lægge "Selma skrev …" øverst i panelet.

  Hvem der har læst hvad, står kun her på telefonen ('zydy.beskeder.set',
  gemt under den der læste, ligesom kælenavnene i /venner.js). Så kan ingen se,
  om den anden har læst beskeden — og det behøver serveren ikke at vide.

    Beskeder.aabn(ven)        åbn samtalen med en ven
    Beskeder.nye(ven)         hvor meget der er kommet, siden jeg sidst kiggede
    Beskeder.samtaler()       oversigten, nyeste først
    Beskeder.hent()           hent oversigten igen
    Beskeder.sidst(ven)       den sidste besked i samtalen, eller null

  Ændrer oversigten sig, sendes hændelsen 'zydy:beskeder', som /venner.js tegner
  panelet om efter. Alt fejler stille: uden forbindelse står der bare det, vi så
  sidst.
*/
(function () {
'use strict';

const API = '/api/beskeder';
const KEY_NAVN = 'zydy.navn';          // fælles med /ideer.js og /spil/highscore.js
const KEY_SET = 'zydy.beskeder.set';   // { "sofie": { "selma": 42 } } – kun på denne telefon
const TEKST_MAKS = 200;                // som TEKST_MAKS i src/beskeder.mjs
const OVERSIGT_MS = 15_000;            // hvor tit vi spørger, om der er kommet noget
const AABEN_MS = 2_500;                // … og mens samtalen står åben (det haster)

const laesNavn = () => {
  try { return (localStorage.getItem(KEY_NAVN) || '').trim(); } catch (e) { return ''; }
};
const smaa = s => String(s || '').toLocaleLowerCase('da-DK');

/** Vennens navn på skærmen: kælenavnet fra /venner.js, hvis hen har fået et. */
const visNavn = navn => (window.Venner && Venner.visNavn ? Venner.visNavn(navn) : navn);

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};
const knap = (cls, tekst, naar) => {
  const b = el('button', cls, tekst);
  b.type = 'button';
  b.addEventListener('click', naar);
  return b;
};

/* ---------- Hvad har jeg læst ---------- */
/*
  Det er *mit* mærke i samtalen, ikke vennens, og derfor ligger det her på
  telefonen — gemt under den, der læste, så en delt iPad ikke blander to børns
  ulæste beskeder sammen, når navnet skiftes med «Ikke Sofie, der spiller?».
*/

function alleSet() {
  try {
    const o = JSON.parse(localStorage.getItem(KEY_SET) || '{}');
    return o && typeof o === 'object' ? o : {};
  } catch (e) { return {}; }
}

/** Mine mærker: ven med små bogstaver → id'et på den sidste besked, jeg har set. */
function mitSet() {
  const o = alleSet()[smaa(laesNavn())];
  return o && typeof o === 'object' ? o : {};
}

const sidstSet = ven => Number(mitSet()[smaa(ven)]) || 0;

/** Husker, at jeg har set til og med `id`. Går aldrig baglæns. */
function saetSet(ven, id) {
  const mig = smaa(laesNavn());
  if (!mig || !smaa(ven) || !(id > sidstSet(ven))) return;
  const alle = alleSet();
  const mine = alle[mig] && typeof alle[mig] === 'object' ? alle[mig] : {};
  mine[smaa(ven)] = id;
  alle[mig] = mine;
  try { localStorage.setItem(KEY_SET, JSON.stringify(alle)); } catch (e) { /* fuld disk el.lign. */ }
}

/** Mærkerne som serveren vil have dem: 'selma:42,far:7'. */
function setParam() {
  const mine = mitSet();
  return Object.keys(mine).map(v => v + ':' + mine[v]).join(',');
}

/* ---------- Data ---------- */

let samtaler = [];                     // [{ ven, sidst: { id, navn, mig, tekst, tid }, nye }]
let aaben = null;                      // navnet på den ven, samtalen står åben med
let beskeder = [];                     // beskederne i den åbne samtale
let timer = null;                      // tikket, mens samtalen er åben

const find = ven => samtaler.find(s => smaa(s.ven) === smaa(ven)) || null;
const nye = ven => { const s = find(ven); return s ? s.nye : 0; };
const sidst = ven => { const s = find(ven); return s ? s.sidst : null; };

async function svaret(svar) {
  const d = await svar.json().catch(() => ({}));
  if (!svar.ok || !d || !d.ok) throw new Error((d && d.fejl) || 'Det gik ikke – prøv igen om lidt.');
  return d;
}

/** Det, der skal tegnes om: hvem, hvor langt, og hvor meget der er nyt. */
const maerke = liste => liste.map(s => [s.ven, s.sidst.id, s.nye].join('|')).join(',');

/** Henter oversigten. Fejler stille – så står der bare det samme som før. */
async function hent() {
  const navn = laesNavn();
  if (!navn) { if (samtaler.length) { samtaler = []; sig(); } return; }
  try {
    const d = await svaret(await fetch(
      API + '?navn=' + encodeURIComponent(navn) + '&set=' + encodeURIComponent(setParam()),
      { cache: 'no-store' }));
    const nyeSamtaler = d.samtaler || [];
    if (maerke(nyeSamtaler) !== maerke(samtaler)) { samtaler = nyeSamtaler; sig(); } else { samtaler = nyeSamtaler; }
  } catch (e) { /* prøver igen ved næste tik */ }
}

/** Fortæller resten af forsiden (/venner.js), at oversigten har flyttet sig. */
function sig() {
  document.dispatchEvent(new CustomEvent('zydy:beskeder', { detail: { samtaler } }));
}

/** Henter samtalen med en ven. `efter` er det sidste id, vi har. */
async function hentSamtale(ven, efter) {
  const navn = laesNavn();
  if (!navn) return [];
  const d = await svaret(await fetch(API + '?navn=' + encodeURIComponent(navn)
    + '&ven=' + encodeURIComponent(ven) + '&efter=' + (efter || 0), { cache: 'no-store' }));
  return d.beskeder || [];
}

async function skriv(ven, tekst) {
  const navn = laesNavn();
  const d = await svaret(await fetch(API, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ navn, ven, tekst }),
  }));
  return d.beskeder || [];
}

/* ---------- Dialogen ---------- */

let dlg = null, indhold = null, liste = null, input = null, status = null;

/** Klokkeslættet på en besked. I dag: bare tiden; ellers dato og tid. */
function tidTekst(ms) {
  const d = new Date(ms);
  if (isNaN(d)) return '';
  const idag = new Date();
  const tid = d.toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit' });
  return d.toDateString() === idag.toDateString()
    ? tid
    : d.toLocaleDateString('da-DK', { day: 'numeric', month: 'short' }) + ' ' + tid;
}

/** Tegner beskederne. Kaldes hver gang der er kommet noget nyt. */
function tegnListe() {
  if (!liste) return;
  liste.innerHTML = '';
  if (!beskeder.length) {
    liste.appendChild(el('p', 'b-tom', 'I har ikke skrevet sammen endnu. Sig hej!'));
    return;
  }
  beskeder.forEach(b => {
    const boks = el('div', 'b-besked' + (b.mig ? ' mig' : ''));
    boks.appendChild(el('span', 'b-tekst', b.tekst));
    boks.appendChild(el('span', 'b-tid', tidTekst(b.tid)));
    liste.appendChild(boks);
  });
  liste.scrollTop = liste.scrollHeight;
}

/** Det sidste id, vi har set i den åbne samtale. */
const sidsteId = () => (beskeder.length ? beskeder[beskeder.length - 1].id : 0);

/** Lægger nye beskeder til og husker, at jeg har læst dem. */
function tilfoej(nye) {
  const kendte = new Set(beskeder.map(b => b.id));
  const friske = nye.filter(b => !kendte.has(b.id));
  if (!friske.length) return false;
  beskeder = beskeder.concat(friske);
  tegnListe();
  return true;
}

/** Mærker samtalen som læst og opdaterer 💬-mærket i venne-panelet med det samme. */
function markerLaest(ven) {
  const id = sidsteId();
  if (!id) return;
  saetSet(ven, id);
  const s = find(ven);
  if (s && s.nye) { s.nye = 0; sig(); }
}

function stopTik() { if (timer) { clearInterval(timer); timer = null; } }

/** Kigger efter svar, mens samtalen står åben. */
function startTik(ven) {
  stopTik();
  timer = setInterval(async () => {
    if (aaben !== ven || document.visibilityState !== 'visible') return;
    try {
      if (tilfoej(await hentSamtale(ven, sidsteId()))) markerLaest(ven);
    } catch (e) { /* prøver igen om lidt */ }
  }, AABEN_MS);
}

/** Åbner samtalen med en ven. */
async function aabn(ven) {
  if (!laesNavn() || !ven) return;
  aaben = ven;
  beskeder = [];

  if (!dlg) {
    dlg = el('dialog', 'id-dlg b-dlg');
    indhold = el('div', 'id-indhold');
    dlg.appendChild(indhold);
    dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
    dlg.addEventListener('close', () => { aaben = null; stopTik(); hent(); });
    document.body.appendChild(dlg);
  }

  const vis = visNavn(ven);
  indhold.innerHTML = '';
  indhold.appendChild(el('h2', 'id-titel', '💬 ' + vis));
  indhold.appendChild(el('p', 'id-under b-under', 'Kun du og ' + vis + ' kan læse det her.'));

  liste = el('div', 'b-liste');
  liste.appendChild(el('p', 'b-tom', 'Henter …'));
  indhold.appendChild(liste);

  status = el('p', 'id-status b-status', '');

  const form = el('form', 'b-form');
  input = el('input', 'id-input b-input');
  input.type = 'text';
  input.maxLength = TEKST_MAKS;
  input.placeholder = 'Skriv til ' + vis;
  input.setAttribute('aria-label', 'Skriv til ' + vis);
  input.autocapitalize = 'sentences';
  input.setAttribute('enterkeyhint', 'send');
  input.setAttribute('autocomplete', 'off');
  const send = el('button', 'v-knap v-vigtig b-send', 'Send');
  send.type = 'submit';
  form.appendChild(input);
  form.appendChild(send);
  form.addEventListener('submit', e => { e.preventDefault(); sendNu(input.value); });
  indhold.appendChild(form);

  // Faste beskeder: på en iPad er det tastaturet, der tager modet fra en.
  const hurtige = el('div', 'b-hurtige');
  ['Hej!', 'Vil du spille?', '👍', '❤️'].forEach(t => {
    hurtige.appendChild(knap('v-knap b-hurtig', t, () => sendNu(t)));
  });
  indhold.appendChild(hurtige);
  indhold.appendChild(status);

  const raekke = el('div', 'id-knapper');
  const rydKnap = knap('id-knap id-fortryd b-ryd', 'Ryd samtalen', () => ryd(ven, rydKnap));
  raekke.appendChild(rydKnap);
  raekke.appendChild(knap('id-knap id-send b-luk', 'Luk', () => dlg.close()));
  indhold.appendChild(raekke);

  if (!dlg.open) dlg.showModal();

  try {
    beskeder = await hentSamtale(ven, 0);
    tegnListe();
    markerLaest(ven);
  } catch (e) {
    liste.innerHTML = '';
    liste.appendChild(el('p', 'b-tom', e.message));
  }
  startTik(ven);
}

/** Sender en besked og tegner den med det samme. */
function sendNu(tekst) {
  const ven = aaben;
  const rent = String(tekst || '').replace(/\s+/g, ' ').trim();
  if (!ven || !rent) { if (input) input.focus(); return; }
  input.value = '';
  status.textContent = '';
  skriv(ven, rent)
    .then(nye => {
      if (aaben !== ven) return;
      // Svaret er hele samtalen igen, så en besked fra den anden, der kom i
      // samme nu, også kommer med.
      tilfoej(nye);
      markerLaest(ven);
      hent();
    })
    .catch(err => { status.textContent = err.message; input.value = rent; });
}

/**
 * Rydder samtalen – for jer begge, for den er jeres fælles. Der skal trykkes to
 * gange: første tryk spørger på selve knappen, så en tommelfinger ikke kan slette
 * det hele ved et uheld.
 */
function ryd(ven, knappen) {
  if (knappen && !knappen.dataset.klar) {
    knappen.dataset.klar = '1';
    knappen.textContent = 'Slet alt?';
    status.textContent = 'Tryk en gang til, så er det væk for jer begge.';
    return;
  }
  fetch(API, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ navn: laesNavn(), ven, handling: 'ryd' }),
  }).then(svaret)
    .then(() => {
      beskeder = [];
      tegnListe();
      status.textContent = 'Samtalen er ryddet.';
      if (knappen) { delete knappen.dataset.klar; knappen.textContent = 'Ryd samtalen'; }
      hent();
    })
    .catch(err => { status.textContent = err.message; });
}

/* ---------- Stil ---------- */

const css = `
.b-dlg .id-indhold{display:flex;flex-direction:column;max-height:min(86vh,720px)}
.b-under{margin-bottom:10px;font-size:14px}
/* Listen fylder kun det, den har brug for (men mindst en besked eller to), og
   ruller, når samtalen bliver lang – ellers står dialogen med et stort hul. */
.b-liste{flex:0 1 auto;overflow-y:auto;-webkit-overflow-scrolling:touch;min-height:72px;max-height:46vh;
  display:flex;flex-direction:column;gap:8px;padding:4px 2px 2px}
.b-tom{margin:12px 2px;color:var(--muted,#a9acd6);font-size:15px}
.b-besked{align-self:flex-start;max-width:82%;background:rgba(255,255,255,.09);border-radius:16px 16px 16px 6px;
  padding:9px 13px;display:flex;flex-direction:column;gap:2px}
.b-besked.mig{align-self:flex-end;background:var(--sun,#ffd447);color:#1c1f4a;border-radius:16px 16px 6px 16px}
.b-tekst{font-size:16px;line-height:1.35;overflow-wrap:anywhere}
.b-tid{font-size:11px;color:var(--muted,#a9acd6);align-self:flex-end}
.b-besked.mig .b-tid{color:rgba(28,31,74,.65)}
.b-form{display:flex;gap:8px;align-items:stretch;margin-top:12px}
.b-input{flex:1;min-width:0;font-size:17px;font-weight:500;text-align:left;padding:12px 14px}
.b-send{flex:0 0 auto;font-size:16px;padding:0 18px}
.b-hurtige{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
.b-hurtig{font-size:15px;padding:8px 14px}
.b-status:empty{display:none}
`;
const style = document.createElement('style');
style.textContent = css;
document.head.appendChild(style);

/* ---------- Start ---------- */

function start() {
  hent();
  setInterval(() => { if (document.visibilityState === 'visible' && !aaben) hent(); }, OVERSIGT_MS);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') hent(); });
  // Navnet blev skrevet eller skiftet: så er det en anden persons beskeder.
  document.addEventListener('zydy:navn', () => {
    if (dlg && dlg.open) dlg.close();
    samtaler = []; beskeder = []; aaben = null;
    sig(); hent();
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();

window.Beskeder = {
  aabn, hent, nye, sidst, skriv, hentSamtale,
  samtaler: () => samtaler,
  get aaben() { return aaben; },
};
})();
