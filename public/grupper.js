/*
  Grupper på forsiden af zydy.dk. Klassisk script, ingen build:

    <script src="/grupper.js" defer></script>     (efter /beskeder.js og /venner.js)

  En gruppe er dig og et par af dine venner, der kan skrive sammen alle på én
  gang — Selmas ønske «Lav grupper». Man er stadig det navn, man har skrevet på
  forsiden ('zydy.navn', se /ideer.js), og man kan kun tage sine egne venner med
  ind i en gruppe; det passer serveren på (src/grupper.mjs). Her er kun skærmen:

    • panelet «Dine grupper» under vennerne: én brik pr. gruppe med hvem der er
      med, hvem der skrev sidst, og et 💬-mærke, når der er kommet noget nyt,
    • en dialog pr. gruppe: snakken, medlemmerne, «Tag en ven med» og en vej ud,
    • de samme fire faste beskeder som i en to-og-to-samtale — på en iPad er det
      tastaturet, der tager modet fra en.

  Snakken ser ud som i /beskeder.js, fordi den genbruger stilen derfra (.b-liste,
  .b-besked …); til gengæld står afsenderens navn over beskeden, for i en gruppe
  er der mere end én, der kan have skrevet den.

  Hvem der har læst hvad, står kun her på telefonen ('zydy.grupper.set', gemt
  under den der læste — ligesom kælenavnene og beskederne). Hvem der er online,
  kommer gratis fra forsidens eget kald til /api/oversigt (hændelsen
  'zydy:oversigt'), og kælenavnene fra /venner.js, hvis den er indlæst.

    Grupper.hent()          hent listen igen
    Grupper.aabn(kode)      åbn en gruppe
    Grupper.nyDialog()      «Ny gruppe»
    Grupper.grupper()       mine grupper, som serveren ser dem
    Grupper.nye()           hvor meget der er kommet, siden jeg sidst kiggede

  Alt fejler stille: uden forbindelse står der bare det, vi så sidst.
*/
(function () {
'use strict';

const API = '/api/grupper';
const KEY_NAVN = 'zydy.navn';           // fælles med /ideer.js og /spil/highscore.js
const KEY_SET = 'zydy.grupper.set';     // { "sofie": { "K7QFD": 42 } } – kun på denne telefon
const TEKST_MAKS = 200;                 // som TEKST_MAKS i src/beskeder.mjs
const NAVN_MAKS = 24;                   // som GRUPPE_NAVN_MAKS i src/grupper.mjs
const OVERSIGT_MS = 15_000;             // hvor tit vi spørger, om der er kommet noget
const AABEN_MS = 2_500;                 // … og mens gruppen står åben (det haster)

const laesNavn = () => {
  try { return (localStorage.getItem(KEY_NAVN) || '').trim(); } catch (e) { return ''; }
};
const smaa = s => String(s || '').toLocaleLowerCase('da-DK');

/** Et navn på skærmen: kælenavnet fra /venner.js, hvis vennen har fået et. */
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

/** «Sofie, Selma og Far» – en liste, der kan læses højt. */
function navneliste(navne) {
  if (!navne.length) return '';
  if (navne.length === 1) return navne[0];
  return navne.slice(0, -1).join(', ') + ' og ' + navne[navne.length - 1];
}

/* ---------- Hvad har jeg læst ---------- */
/*
  Samme greb som i /beskeder.js: mærket er *mit*, så det ligger på telefonen og
  er gemt under den, der læste — en delt iPad må ikke blande to børns ulæste
  beskeder sammen, når navnet skiftes med «Ikke Sofie, der spiller?».
*/

function alleSet() {
  try {
    const o = JSON.parse(localStorage.getItem(KEY_SET) || '{}');
    return o && typeof o === 'object' ? o : {};
  } catch (e) { return {}; }
}

function mitSet() {
  const o = alleSet()[smaa(laesNavn())];
  return o && typeof o === 'object' ? o : {};
}

const sidstSet = kode => Number(mitSet()[kode]) || 0;

/** Husker, at jeg har set til og med `id` i en gruppe. Går aldrig baglæns. */
function saetSet(kode, id) {
  const mig = smaa(laesNavn());
  if (!mig || !kode || !(id > sidstSet(kode))) return;
  const alle = alleSet();
  const mine = alle[mig] && typeof alle[mig] === 'object' ? alle[mig] : {};
  mine[kode] = id;
  alle[mig] = mine;
  try { localStorage.setItem(KEY_SET, JSON.stringify(alle)); } catch (e) { /* fuld disk el.lign. */ }
}

/** Mærkerne som serveren vil have dem: 'k7qfd:42,m3xpq:7'. */
function setParam() {
  const mine = mitSet();
  return Object.keys(mine).map(k => k.toLowerCase() + ':' + mine[k]).join(',');
}

/* ---------- Data ---------- */

let grupper = [];          // [{ kode, navn, medlemmer, lavetAf, jegLavede, sidst, nye }]
let aaben = null;          // koden på den gruppe, der står åben
let beskeder = [];         // beskederne i den åbne gruppe
let timer = null;          // tikket, mens gruppen er åben
let online = {};           // navn med små bogstaver → true, fra /api/oversigt

const find = kode => grupper.find(g => g.kode === kode) || null;
const nye = () => grupper.reduce((n, g) => n + (g.nye || 0), 0);

async function svaret(svar) {
  const d = await svar.json().catch(() => ({}));
  if (!svar.ok || !d || !d.ok) throw new Error((d && d.fejl) || 'Det gik ikke – prøv igen om lidt.');
  return d;
}

/** Det, der skal tegnes om: hvem, hvor mange, hvor langt, og hvor meget er nyt. */
const maerke = liste => liste.map(g =>
  [g.kode, g.navn, g.medlemmer.map(m => m.navn).join('+'), g.sidst ? g.sidst.id : 0, g.nye].join('|')).join(',');

/** Henter listen. Fejler stille – så står der bare det samme som før. */
async function hent() {
  const navn = laesNavn();
  if (!navn) { if (grupper.length) { grupper = []; tegn(); } return; }
  try {
    const d = await svaret(await fetch(
      API + '?navn=' + encodeURIComponent(navn) + '&set=' + encodeURIComponent(setParam()),
      { cache: 'no-store' }));
    saetListe(d.grupper || []);
  } catch (e) { /* prøver igen ved næste tik */ }
}

/** Tager imod en ny liste og tegner kun om, hvis der faktisk er sket noget. */
function saetListe(liste) {
  const anderledes = maerke(liste) !== maerke(grupper);
  grupper = liste;
  if (anderledes) tegn();
}

/** POST til API'et. Svaret er altid hele min liste igen (undtagen ved «skriv»). */
async function send(krop) {
  const navn = laesNavn();
  if (!navn) return null;
  const d = await svaret(await fetch(API, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(Object.assign({ navn, set: setParam() }, krop)),
  }));
  if (d.grupper) saetListe(d.grupper);
  return d;
}

/** Henter snakken i én gruppe. `efter` er det sidste id, vi har. */
async function hentGruppe(kode, efter) {
  const navn = laesNavn();
  if (!navn) return { beskeder: [] };
  return svaret(await fetch(API + '?navn=' + encodeURIComponent(navn)
    + '&kode=' + encodeURIComponent(kode) + '&efter=' + (efter || 0), { cache: 'no-store' }));
}

/* ---------- Hvem er her nu ---------- */
/*
  Forsiden henter /api/oversigt hvert halve minut og sender resultatet videre som
  'zydy:oversigt' – /venner.js bruger det samme. Her skal vi kun bruge, *om*
  nogen er her, så en gruppe kan lyse, når der er nogen at skrive til.
*/
function laesOversigt(svar) {
  const navne = {};
  Object.keys(svar.spil || {}).forEach(spil => {
    ((svar.spil[spil] || {}).navne || []).forEach(n => { navne[smaa(n)] = true; });
  });
  ((svar.her && svar.her.navne) || []).forEach(n => { navne[smaa(n)] = true; });
  online = navne;
  tegn();
}

/** De i gruppen, der er på zydy.dk lige nu – mig selv ikke medregnet. */
const andreOnline = g => g.medlemmer.filter(m => !m.mig && online[smaa(m.navn)]);

/* ---------- Panelet ---------- */

function tegn() {
  const rod = document.getElementById('grupper');
  if (!rod) return;
  rod.innerHTML = '';
  // Uden navn ved vi ikke, hvem du er. Venne-panelet lige over spørger om det,
  // så her siger vi ingenting i stedet for at spørge en gang til.
  if (!laesNavn()) return;

  const kort = el('div', 'g-kort');
  const top = el('div', 'g-top');
  top.appendChild(el('h2', 'g-titel', 'Dine grupper'));
  const ulaest = nye();
  if (ulaest) top.appendChild(el('span', 'g-maerke', '💬 ' + ulaest + (ulaest === 1 ? ' ny' : ' nye')));
  top.appendChild(knap('v-knap g-ny', '＋ Ny gruppe', () => nyDialog()));
  kort.appendChild(top);

  if (!grupper.length) {
    kort.appendChild(el('p', 'g-under',
      'En gruppe er dig og et par af dine venner, der skriver sammen alle på én gang – '
      + 'familien, dem du spiller med, eller hvem du har lyst til.'));
    kort.appendChild(knap('v-knap v-vigtig g-ny-stor', '＋ Lav en gruppe', () => nyDialog()));
    rod.appendChild(kort);
    return;
  }

  const liste = el('div', 'g-liste');
  grupper.forEach(g => {
    const her = andreOnline(g);
    const b = knap('g-gruppe' + (her.length ? ' online' : ''), null, () => aabn(g.kode));
    const boks = el('span', 'g-navn-boks');
    boks.appendChild(el('span', 'g-navn', '👥 ' + g.navn));
    // Under navnet: det sidste, der blev sagt – ellers hvem der er med.
    const andre = g.medlemmer.filter(m => !m.mig).map(m => visNavn(m.navn));
    boks.appendChild(el('span', 'g-under-linje', g.sidst
      ? (g.sidst.mig ? 'Du' : visNavn(g.sidst.navn)) + ': ' + g.sidst.tekst
      : (andre.length ? navneliste(andre) + ' er med' : 'Kun dig – tag en ven med')));
    if (her.length) boks.appendChild(el('span', 'g-her', navneliste(her.map(m => visNavn(m.navn)))
      + (her.length === 1 ? ' er her nu' : ' er her nu')));
    b.appendChild(boks);
    if (g.nye) b.appendChild(el('span', 'g-nyt', '💬 ' + g.nye));
    liste.appendChild(b);
  });
  kort.appendChild(liste);
  rod.appendChild(kort);
}

/* ---------- Dialoger (samme stil som /ideer.js og /beskeder.js) ---------- */

let dlg = null, indhold = null;

function sikrDialog() {
  if (dlg) return;
  dlg = el('dialog', 'id-dlg g-dlg');
  indhold = el('div', 'id-indhold');
  dlg.appendChild(indhold);
  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
  dlg.addEventListener('close', () => { aaben = null; stopTik(); hent(); });
  document.body.appendChild(dlg);
}

/** «Ny gruppe»: et navn, og så er den lavet – vennerne tages med bagefter. */
function nyDialog() {
  if (!laesNavn()) return;
  sikrDialog();
  aaben = null;
  stopTik();
  indhold.innerHTML = '';
  indhold.appendChild(el('h2', 'id-titel', '👥 Ny gruppe'));
  indhold.appendChild(el('p', 'id-under',
    'Giv gruppen et navn. Bagefter kan du tage dine venner med ind – og så kan I skrive sammen alle sammen.'));

  const status = el('p', 'id-status g-status', '');
  const form = el('form', 'id-form g-form');
  const input = el('input', 'id-input g-input');
  input.type = 'text'; input.maxLength = NAVN_MAKS; input.placeholder = 'Fx Familien';
  input.setAttribute('aria-label', 'Hvad skal gruppen hedde?');
  input.autocapitalize = 'sentences'; input.spellcheck = false;
  input.setAttribute('enterkeyhint', 'done'); input.setAttribute('autocomplete', 'off');
  const gem = el('button', 'v-knap v-vigtig g-lav', 'Lav gruppen');
  gem.type = 'submit';
  form.appendChild(input);
  form.appendChild(gem);
  form.addEventListener('submit', e => {
    e.preventDefault();
    const navn = input.value.trim();
    if (!navn) { status.textContent = 'Skriv et navn først.'; input.focus(); return; }
    status.textContent = 'Laver gruppen …';
    send({ handling: 'lav', gruppe: navn })
      .then(d => { if (d && d.kode) aabn(d.kode); })       // ind i gruppen med det samme
      .catch(err => { status.textContent = err.message; });
  });
  indhold.appendChild(form);
  indhold.appendChild(status);

  const raekke = el('div', 'id-knapper');
  raekke.appendChild(knap('id-knap id-send g-luk', 'Luk', () => dlg.close()));
  indhold.appendChild(raekke);

  if (!dlg.open) dlg.showModal();
  input.focus();
}

/* ---------- Gruppens egen dialog ---------- */

let liste = null, input = null, status = null;

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

/** Tegner snakken. Afsenderens navn står over beskeden – der er jo flere om den. */
function tegnListe() {
  if (!liste) return;
  liste.innerHTML = '';
  if (!beskeder.length) {
    liste.appendChild(el('p', 'b-tom', 'Der er ikke skrevet noget i gruppen endnu. Sig hej!'));
    return;
  }
  beskeder.forEach((b, i) => {
    const boks = el('div', 'b-besked' + (b.mig ? ' mig' : ''));
    const foer = beskeder[i - 1];
    if (!b.mig && (!foer || foer.navn !== b.navn || foer.mig)) boks.appendChild(el('span', 'g-hvem', visNavn(b.navn)));
    boks.appendChild(el('span', 'b-tekst', b.tekst));
    boks.appendChild(el('span', 'b-tid', tidTekst(b.tid)));
    liste.appendChild(boks);
  });
  liste.scrollTop = liste.scrollHeight;
}

const sidsteId = () => (beskeder.length ? beskeder[beskeder.length - 1].id : 0);

/** Lægger nye beskeder til. Giver true, hvis der faktisk kom noget. */
function tilfoejBeskeder(nye) {
  const kendte = new Set(beskeder.map(b => b.id));
  const friske = (nye || []).filter(b => !kendte.has(b.id));
  if (!friske.length) return false;
  beskeder = beskeder.concat(friske);
  tegnListe();
  return true;
}

/** Mærker gruppen som læst og fjerner 💬-mærket i panelet med det samme. */
function markerLaest(kode) {
  const id = sidsteId();
  if (!id) return;
  saetSet(kode, id);
  const g = find(kode);
  if (g && g.nye) { g.nye = 0; tegn(); }
}

function stopTik() { if (timer) { clearInterval(timer); timer = null; } }

/** Kigger efter nye beskeder, mens gruppen står åben. */
function startTik(kode) {
  stopTik();
  timer = setInterval(async () => {
    if (aaben !== kode || document.visibilityState !== 'visible') return;
    try {
      const d = await hentGruppe(kode, sidsteId());
      if (d.gruppe) opdaterGruppe(d.gruppe);
      if (tilfoejBeskeder(d.beskeder)) markerLaest(kode);
    } catch (e) {
      // Er man taget ud af gruppen, er der ikke mere at se på her.
      if (/ikke med i/.test(e.message) || /findes ikke/.test(e.message)) { dlg.close(); hent(); }
    }
  }, AABEN_MS);
}

/** Retter navn og medlemmer i min egen liste, når serveren har nyere besked. */
function opdaterGruppe(frisk) {
  const g = find(frisk.kode);
  if (!g) return;
  const foer = [g.navn, g.medlemmer.map(m => m.navn).join('+')].join('|');
  g.navn = frisk.navn;
  g.medlemmer = frisk.medlemmer;
  g.jegLavede = frisk.jegLavede;
  g.lavetAf = frisk.lavetAf;
  if (foer !== [g.navn, g.medlemmer.map(m => m.navn).join('+')].join('|')) { tegn(); if (aaben === g.kode) tegnDialog(g); }
}

/** Åbner en gruppe: snakken, medlemmerne og vejen ud. */
async function aabn(kode) {
  if (!laesNavn() || !kode) return;
  sikrDialog();
  aaben = kode;
  beskeder = [];
  const g = find(kode) || { kode, navn: '…', medlemmer: [], jegLavede: false, lavetAf: '' };
  tegnDialog(g);
  if (!dlg.open) dlg.showModal();

  try {
    const d = await hentGruppe(kode, 0);
    if (aaben !== kode) return;
    if (d.gruppe) { opdaterGruppe(d.gruppe); if (!find(kode)) { grupper.push({ ...d.gruppe, sidst: null, nye: 0 }); tegnDialog(d.gruppe); } }
    beskeder = d.beskeder || [];
    tegnListe();
    markerLaest(kode);
  } catch (e) {
    if (liste) { liste.innerHTML = ''; liste.appendChild(el('p', 'b-tom', e.message)); }
  }
  startTik(kode);
}

/** Hele dialogens indhold for én gruppe. Tegnes forfra, når noget flytter sig. */
function tegnDialog(g) {
  indhold.innerHTML = '';
  indhold.appendChild(el('h2', 'id-titel g-dlg-titel', '👥 ' + g.navn));

  const andre = g.medlemmer.filter(m => !m.mig);
  indhold.appendChild(el('p', 'id-under g-med', andre.length
    ? navneliste(andre.map(m => visNavn(m.navn))) + ' er med i gruppen – og dig.'
    : 'Du er den eneste i gruppen indtil videre.'));

  liste = el('div', 'b-liste g-snak');
  liste.appendChild(el('p', 'b-tom', 'Henter …'));
  indhold.appendChild(liste);

  status = el('p', 'id-status g-status', '');

  const form = el('form', 'b-form g-skriv-form');
  input = el('input', 'id-input b-input g-skriv');
  input.type = 'text';
  input.maxLength = TEKST_MAKS;
  input.placeholder = 'Skriv til gruppen';
  input.setAttribute('aria-label', 'Skriv til ' + g.navn);
  input.autocapitalize = 'sentences';
  input.setAttribute('enterkeyhint', 'send');
  input.setAttribute('autocomplete', 'off');
  const send = el('button', 'v-knap v-vigtig b-send g-send', 'Send');
  send.type = 'submit';
  form.appendChild(input);
  form.appendChild(send);
  form.addEventListener('submit', e => { e.preventDefault(); sendNu(g.kode, input.value); });
  indhold.appendChild(form);

  const hurtige = el('div', 'b-hurtige');
  ['Hej!', 'Skal vi spille?', '👍', '❤️'].forEach(t => {
    hurtige.appendChild(knap('v-knap b-hurtig g-hurtig', t, () => sendNu(g.kode, t)));
  });
  indhold.appendChild(hurtige);
  indhold.appendChild(status);

  tegnMedlemmer(g);

  const raekke = el('div', 'id-knapper');
  const udKnap = knap('id-knap id-fortryd g-gaa', 'Gå ud af gruppen', () => gaaUd(g, udKnap));
  raekke.appendChild(udKnap);
  raekke.appendChild(knap('id-knap id-send g-luk', 'Luk', () => dlg.close()));
  indhold.appendChild(raekke);
}

/** «Hvem er med» med mulighed for at tage flere venner ind (og ud, hvis det er min gruppe). */
function tegnMedlemmer(g) {
  indhold.appendChild(el('h3', 'g-afsnit', 'Hvem er med'));
  const med = el('div', 'g-medlemmer');
  g.medlemmer.forEach(m => {
    const her = !m.mig && online[smaa(m.navn)];
    const brik = el('span', 'g-medlem' + (her ? ' online' : ''));
    if (her) brik.appendChild(el('span', 'v-prik'));
    brik.appendChild(el('span', 'g-medlem-navn', m.mig ? 'Dig' : visNavn(m.navn)));
    // Kun den, der lavede gruppen, kan tage andre ud – resten kan gå selv.
    if (g.jegLavede && !m.mig) {
      brik.appendChild(knap('g-ud', '✕', () => {
        status.textContent = 'Tager ' + visNavn(m.navn) + ' ud …';
        send({ handling: 'fjern', kode: g.kode, ven: m.navn })
          .then(() => { const frisk = find(g.kode); if (frisk) tegnDialog(frisk); })
          .catch(err => { status.textContent = err.message; });
      }));
    }
    med.appendChild(brik);
  });
  indhold.appendChild(med);

  // Vennerne, der ikke er med endnu. Listen kommer fra /venner.js, som altid
  // indlæses før den her fil – serveren siger alligevel nej til fremmede.
  const alle = (window.Venner && Venner.data && Venner.data.venner) || [];
  const i = new Set(g.medlemmer.map(m => smaa(m.navn)));
  const kan = alle.filter(v => !i.has(smaa(v.navn)));
  indhold.appendChild(el('h3', 'g-afsnit', 'Tag en ven med'));
  if (!alle.length) {
    indhold.appendChild(el('p', 'g-under g-ingen-venner',
      'Du er ikke venner med nogen endnu. Bliv venner oppe i «Dine venner», så kan du tage dem med herind.'));
  } else if (!kan.length) {
    indhold.appendChild(el('p', 'g-under', 'Alle dine venner er allerede med i gruppen.'));
  } else {
    const boks = el('div', 'g-venner');
    kan.forEach(v => {
      const b = knap('v-knap g-ven' + (online[smaa(v.navn)] ? ' online' : ''), null, () => {
        status.textContent = 'Tager ' + visNavn(v.navn) + ' med …';
        send({ handling: 'tilfoej', kode: g.kode, ven: v.navn })
          .then(() => {
            const frisk = find(g.kode);
            if (frisk) tegnDialog(frisk);
            if (status) status.textContent = visNavn(v.navn) + ' er med i gruppen nu.';
          })
          .catch(err => { status.textContent = err.message; });
      });
      if (online[smaa(v.navn)]) b.appendChild(el('span', 'v-prik'));
      b.appendChild(el('span', 'g-ven-navn', '＋ ' + visNavn(v.navn)));
      boks.appendChild(b);
    });
    indhold.appendChild(boks);
  }

  // Den, der lavede gruppen, kan give den et andet navn.
  if (g.jegLavede) {
    indhold.appendChild(el('h3', 'g-afsnit', 'Gruppens navn'));
    const form = el('form', 'id-form g-form g-omdoeb');
    const felt = el('input', 'id-input g-input g-navn-input');
    felt.type = 'text'; felt.maxLength = NAVN_MAKS; felt.value = g.navn;
    felt.setAttribute('aria-label', 'Nyt navn til gruppen');
    felt.autocapitalize = 'sentences'; felt.spellcheck = false;
    felt.setAttribute('enterkeyhint', 'done'); felt.setAttribute('autocomplete', 'off');
    const gem = el('button', 'v-knap v-vigtig g-omdoeb-gem', 'Gem');
    gem.type = 'submit';
    form.appendChild(felt);
    form.appendChild(gem);
    form.addEventListener('submit', e => {
      e.preventDefault();
      const nyt = felt.value.trim();
      if (!nyt) { status.textContent = 'Skriv et navn først.'; return; }
      send({ handling: 'omdoeb', kode: g.kode, gruppe: nyt })
        .then(() => {
          const frisk = find(g.kode);
          if (frisk) { tegnDialog(frisk); hentOgTegn(frisk.kode); }
        })
        .catch(err => { status.textContent = err.message; });
    });
    indhold.appendChild(form);
  } else {
    indhold.appendChild(el('p', 'g-under g-lavet-af', g.lavetAf + ' lavede gruppen.'));
  }
}

/** Efter et navneskift: hent snakken igen, så dialogen ikke står tom. */
async function hentOgTegn(kode) {
  try {
    const d = await hentGruppe(kode, 0);
    beskeder = d.beskeder || [];
    tegnListe();
  } catch (e) { /* så står der bare det, vi havde */ }
}

/** Sender en besked til gruppen og tegner den med det samme. */
function sendNu(kode, tekst) {
  const rent = String(tekst || '').replace(/\s+/g, ' ').trim();
  if (!rent || aaben !== kode) { if (input) input.focus(); return; }
  input.value = '';
  status.textContent = '';
  send({ handling: 'skriv', kode, tekst: rent, efter: 0 })
    .then(d => {
      if (aaben !== kode || !d) return;
      // Svaret er hele snakken igen, så en besked fra en anden, der kom i samme
      // nu, også kommer med.
      beskeder = d.beskeder || beskeder;
      tegnListe();
      markerLaest(kode);
      hent();
    })
    .catch(err => { status.textContent = err.message; input.value = rent; });
}

/**
 * Går ud af gruppen. Der skal trykkes to gange: er man den sidste, forsvinder
 * gruppen og hele snakken, og det skal ikke kunne ske med en tommelfinger.
 */
function gaaUd(g, knappen) {
  if (knappen && !knappen.dataset.klar) {
    knappen.dataset.klar = '1';
    knappen.textContent = 'Helt sikker?';
    status.textContent = g.medlemmer.length <= 1
      ? 'Du er den eneste i gruppen – går du, forsvinder den og alt, I har skrevet.'
      : 'Tryk en gang til, så er du ude af gruppen.';
    return;
  }
  send({ handling: 'gaa', kode: g.kode })
    .then(() => { dlg.close(); })
    .catch(err => { status.textContent = err.message; });
}

/* ---------- Stil ---------- */

const css = `
#grupper:empty{display:none}
.g-kort{background:var(--bg2,#1b1f42);border-radius:var(--r,26px);padding:16px 18px;margin-bottom:18px}
.g-top{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.g-titel{margin:0;font-size:20px;font-weight:800;letter-spacing:-.5px;flex:1}
.g-under{margin:8px 0 0;color:var(--muted,#a9acd6);font-size:15px;line-height:1.35}
/* "💬 2 nye" ved siden af overskriften – samme greb som i venne-panelet */
.g-maerke{flex:0 0 auto;font-size:13px;font-weight:800;border-radius:999px;padding:3px 10px;
  background:var(--sun,#ffd447);color:#1c1f4a;animation:puls 1.8s ease-in-out infinite}
.g-ny-stor{display:block;width:100%;margin-top:14px;font-size:17px;padding:14px;min-height:52px}

/* Grupperne som brikker, der kan trykkes på – som vennerne, men bredere */
.g-liste{display:flex;flex-direction:column;gap:8px;margin-top:12px}
.g-gruppe{display:flex;align-items:center;gap:10px;font:inherit;text-align:left;cursor:pointer;
  border:0;border-radius:18px;padding:10px 14px;min-height:52px;width:100%;
  background:rgba(255,255,255,.07);color:var(--muted,#a9acd6)}
.g-gruppe:hover{background:rgba(255,255,255,.13)}
.g-gruppe:focus-visible{outline:3px solid var(--sun,#ffd447);outline-offset:3px}
.g-gruppe.online{background:rgba(94,224,168,.16)}
.g-navn-boks{display:flex;flex-direction:column;line-height:1.25;flex:1;min-width:0}
.g-navn{font-weight:800;font-size:17px;color:var(--text,#fff7e6)}
.g-under-linje{font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.g-her{font-size:12px;color:#7cf0c0;font-weight:700}
.g-nyt{flex:0 0 auto;font-size:12px;font-weight:800;border-radius:999px;padding:3px 8px;
  background:var(--sun,#ffd447);color:#1c1f4a}

/* Dialogen: snakken genbruger .b-* fra /beskeder.js, så en gruppe ser ud som en samtale */
.g-dlg .id-indhold{display:flex;flex-direction:column;max-height:min(86vh,720px)}
.g-dlg .g-snak{max-height:38vh}
.g-med{margin-bottom:10px;font-size:14px}
.g-hvem{font-size:12px;font-weight:800;color:var(--sun,#ffd447)}
.g-afsnit{margin:18px 0 8px;font-size:16px;font-weight:800}
.g-medlemmer,.g-venner{display:flex;flex-wrap:wrap;gap:8px}
.g-medlem{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:7px 12px;min-height:38px;
  background:rgba(255,255,255,.09);color:var(--text,#fff7e6);font-size:15px;font-weight:700}
.g-medlem.online{background:rgba(94,224,168,.18);color:#bff7e0}
.g-medlem .v-prik{opacity:1;animation:puls 1.8s ease-in-out infinite}
.g-ud{font:inherit;font-size:13px;line-height:1;cursor:pointer;border:0;border-radius:50%;
  width:26px;height:26px;background:rgba(0,0,0,.25);color:inherit}
.g-ud:hover{background:rgba(255,120,120,.4)}
.g-ven{display:inline-flex;align-items:center;gap:8px;font-size:15px;padding:9px 14px}
.g-ven.online{background:rgba(94,224,168,.18);color:#bff7e0}
.g-ven .v-prik{opacity:1;animation:puls 1.8s ease-in-out infinite}
.g-form{display:flex;gap:8px;align-items:stretch}
.g-input{flex:1;min-width:0;font-size:17px;text-align:left;padding:12px 14px}
.g-lav,.g-omdoeb-gem{flex:0 0 auto;font-size:16px;padding:0 18px}
.g-lavet-af{font-size:13px}
.g-status:empty{display:none}
@media (prefers-reduced-motion:reduce){ .g-maerke,.g-medlem .v-prik,.g-ven .v-prik{animation:none} }
`;
const style = document.createElement('style');
style.textContent = css;
document.head.appendChild(style);

/* ---------- Start ---------- */

function start() {
  tegn();
  hent();
  setInterval(() => { if (document.visibilityState === 'visible' && !aaben) hent(); }, OVERSIGT_MS);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') hent(); });
  // Forsiden henter /api/oversigt hvert halve minut – vi får resultatet gratis.
  document.addEventListener('zydy:oversigt', e => { if (e.detail) laesOversigt(e.detail); });
  // Navnet blev skrevet eller skiftet: så er det en anden persons grupper.
  document.addEventListener('zydy:navn', () => {
    if (dlg && dlg.open) dlg.close();
    grupper = []; beskeder = []; aaben = null;
    tegn(); hent();
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();

window.Grupper = {
  hent, aabn, nyDialog, tegn, nye,
  grupper: () => grupper,
  get aaben() { return aaben; },
};
})();
