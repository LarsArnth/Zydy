/*
  Venner på forsiden af zydy.dk. Klassisk script, ingen build:

    <script src="/venner.js" defer></script>     (efter /ideer.js)

  Man er det navn, man har skrevet på forsiden ('zydy.navn', se /ideer.js).
  Panelet øverst viser:

    • invitationer: "Selma vil spille Kryds og bolle med dig" — med Hop med!
    • dine venner, og om de er her lige nu ("Selma spiller Obby")
    • dem der har spurgt, om I skal være venner — med Ja tak / Nej tak
    • dem du selv har spurgt, med Fortryd
    • en knap til at finde en ven blandt de navne, vi har set på siden

  Har man ingen venner endnu, står der i stedet, hvad man gør: et par navne man
  kan trykke på med det samme, og en stor "Find en ven". Det er hele grunden til,
  at panelet findes — «Bliv venner» var Olivers ønske, og funktionen var der
  allerede; den var bare svær at få øje på.

  I "Find en ven" *søger* man: man skal ikke kunne stave vennens navn rigtigt,
  for det kan børnene ikke. Se `form()` og `traef()` nedenfor.

  Trykker man på en ven, kan man skrive til hen (/beskeder.js), give hen et
  kælenavn — og invitere hen til at spille sammen. Der er to slags: de spil, hvor man deler ét parti (data-sammen:
  Kryds og bolle, Dybet), og et **kapløb** i alle de andre (data-kaploeb), hvor
  man spiller hver sit spil og deler stillingen. Se scripts/byg-forside.mjs.

  Invitationen er et "rum" i /api/rum (src/rum.mjs), og begge sendes ind i
  spillet med ?rum=<kode>; selve kaldene ligger i /spil/rum.js, som deles med
  spillene.

  Kælenavnene ligger kun i localStorage ('zydy.kaelenavne'), altså her på
  telefonen: vennen får dem aldrig at vide, og de kommer aldrig på toplisterne.

  Selve venne-listen kommer fra /api/venner (src/venner.mjs). Hvem der er online,
  kommer derimod gratis fra forsidens eget kald til /api/oversigt: scriptet
  nederst i index.html sender resultatet videre som hændelsen 'zydy:oversigt',
  så vi ikke henter det samme to gange.

  Dialogen genbruger stilen fra /ideer.js (.id-dlg, .id-knap …), som altid
  indlæses før denne fil. Alt fejler stille: uden forbindelse står panelet bare
  med det, vi så sidst.
*/
(function () {
'use strict';

const API = '/api/venner';
const KEY_NAVN = 'zydy.navn';        // fælles med /ideer.js og /spil/highscore.js
const KEY_KAELE = 'zydy.kaelenavne'; // { "sofie": { "selma": "Smølfen" } } – kun på denne telefon
const NAVN_MAKS = 12;
const KAELE_MAKS = 16;
const OPDATER_MS = 60_000;           // hvor tit vi spørger efter nye venner og spørgsmål
const HURTIG_MS = 12_000;            // … men tiere, mens nogen venter på et ja (så sidder man tit sammen)
const RUM_MS = 5_000;                // … og efter invitationer til at spille sammen (de haster)
const FORSLAG_MAKS = 14;             // hvor mange navne der vises ad gangen i "Find en ven"
const BESKED_MS = 20_000;            // hvor længe "Vi har spurgt Selma …" står i panelet

const laesNavn = () => {
  try { return (localStorage.getItem(KEY_NAVN) || '').trim(); } catch (e) { return ''; }
};
const smaa = s => String(s || '').toLocaleLowerCase('da-DK');

/* ---------- Kælenavne ---------- */
/*
  Et kælenavn er *mit* navn til en ven — ikke vennens navn. Derfor står det kun
  her på telefonen og er gemt under den, der har givet det: skifter man navn på
  forsiden ("Ikke Sofie, der spiller?"), er det den nye persons kælenavne, der
  gælder. Vennen kan hverken se eller ændre det, og toplisterne rører vi ikke.
*/

/** Hele lageret: { "sofie": { "selma": "Smølfen" } }. Kan ikke læses → tomt. */
function alleKaelenavne() {
  try {
    const o = JSON.parse(localStorage.getItem(KEY_KAELE) || '{}');
    return o && typeof o === 'object' ? o : {};
  } catch (e) { return {}; }
}

/** Mine kælenavne: ven med små bogstaver → kælenavn. */
function mineKaelenavne() {
  const o = alleKaelenavne()[smaa(laesNavn())];
  return o && typeof o === 'object' ? o : {};
}

/** Kælenavnet til en ven, eller '' hvis hen ikke har fået et. */
function kaelenavn(navn) {
  const k = mineKaelenavne()[smaa(navn)];
  return typeof k === 'string' ? k : '';
}

/** Sætter (eller fjerner, med tom tekst) et kælenavn. Giver det, der blev gemt. */
function saetKaelenavn(navn, nyt) {
  const mig = smaa(laesNavn());
  if (!mig || !smaa(navn)) return '';
  const rent = String(nyt || '').replace(/\s+/g, ' ').trim().slice(0, KAELE_MAKS);
  const alle = alleKaelenavne();
  const mine = alle[mig] && typeof alle[mig] === 'object' ? alle[mig] : {};
  if (rent) mine[smaa(navn)] = rent; else delete mine[smaa(navn)];
  alle[mig] = mine;
  try { localStorage.setItem(KEY_KAELE, JSON.stringify(alle)); } catch (e) { /* fuld disk el.lign. */ }
  return rent;
}

/** Det, en ven hedder på skærmen: kælenavnet, hvis der er et. */
const visNavn = navn => kaelenavn(navn) || navn;

/* ---------- At finde en ven uden at stave rigtigt ---------- */
/*
  Før kunne man kun trykke på et navn i en uordnet bunke eller skrive det
  *præcis* rigtigt i et felt. Skrev man forkert, blev spørgsmålet sendt til et
  navn, ingen bruger — og så skete der aldrig noget. Derfor sammenlignes navne
  på en form uden store bogstaver, accenter, mellemrum og tegn, og der er plads
  til én tastefejl i et navn på mindst fire bogstaver.
*/

/** Navnet som det sammenlignes: "Søren B." og "soren b" er det samme. */
function form(s) {
  return String(s || '')
    .toLocaleLowerCase('da-DK')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')       // é → e, å → a
    .replace(/ø/g, 'o').replace(/æ/g, 'ae')
    .replace(/[^a-z0-9]/g, '');                            // mellemrum, punktummer, emoji
}

/** Levenshtein-afstand, men kun op til `maks` – derover er svaret lige meget. */
function afstand(a, b, maks) {
  if (Math.abs(a.length - b.length) > maks) return maks + 1;
  let forrige = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const raekke = [i];
    let mindst = i;
    for (let j = 1; j <= b.length; j++) {
      raekke[j] = Math.min(forrige[j] + 1, raekke[j - 1] + 1, forrige[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (raekke[j] < mindst) mindst = raekke[j];
    }
    if (mindst > maks) return maks + 1;                    // hele rækken er for langt væk
    forrige = raekke;
  }
  return forrige[b.length];
}

/** Hvor godt et navn passer på det, man har skrevet. 0 er bedst, null = passer ikke. */
function traef(navn, soegt) {
  const n = form(navn), s = form(soegt);
  if (!s || n === s) return 0;
  if (n.startsWith(s)) return 1;
  if (n.includes(s)) return 2;
  if (s.length >= 4 && afstand(n, s, 1) <= 1) return 3;    // én tastefejl er tilgivet
  return null;
}

/**
 * Forslagene til "Find en ven": bedste træf først, så dem der er på zydy.dk
 * lige nu (dem kan man nå at aftale det med), og til sidst alfabetisk.
 * `soegt` må være tomt – så er det hele listen.
 */
function forslagFor(soegt) {
  return (data.kendte || [])
    .map(navn => ({ navn, rang: traef(navn, soegt), online: hvor(navn).online }))
    .filter(f => f.rang !== null)
    .sort((a, b) => a.rang - b.rang || (b.online - a.online) || a.navn.localeCompare(b.navn, 'da-DK'));
}

/** Det navn, vi kender, som er stavet som `soegt` – ellers teksten selv. */
function retStavemaade(soegt) {
  const f = (data.kendte || []).find(n => form(n) === form(soegt));
  return f || soegt;
}

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

/* ---------- Data ---------- */

// Sidste svar fra /api/venner og sidste oversigt over hvem der er hvor.
let data = { venner: [], venter: [], sendt: [], kendte: [] };
let hvorErDe = {};                   // navn med små bogstaver → spillets titel, eller '' for forsiden
let rum = [];                        // mine åbne spil-sammen-rum fra /api/rum

async function kald(krop) {
  const navn = laesNavn();
  if (!navn) return null;
  const svar = krop
    ? await fetch(API, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(Object.assign({ navn }, krop)),
      })
    : await fetch(API + '?navn=' + encodeURIComponent(navn), { cache: 'no-store' });
  const d = await svar.json().catch(() => ({}));
  if (!svar.ok || !d.ok) throw new Error(d.fejl || 'Det gik ikke – prøv igen om lidt.');
  data = d;
  tegn();
  return d;
}

/** Henter listen igen; fejl er lige meget her, så står der bare det samme som før. */
let sidstHentet = 0;
function hent() { sidstHentet = Date.now(); kald(null).catch(() => {}); }

/* ---------- Hvem er hvor ---------- */

/** Kortene på forsiden: 'obby' → { titel: 'Obby', href: '/spil/obby/', sammen }. */
function kortene() {
  const ud = {};
  document.querySelectorAll('#apps li[data-spil]').forEach(li => {
    const h = li.querySelector('h2'), a = li.querySelector('a');
    if (h) ud[li.dataset.spil] = {
      id: li.dataset.spil,
      titel: h.textContent,
      href: a ? a.getAttribute('href') : null,
      sammen: li.hasAttribute('data-sammen'),      // ét parti delt mellem to telefoner
      kaploeb: li.hasAttribute('data-kaploeb'),    // hver sit spil, fælles stilling
    };
  });
  return ud;
}

/** De spil to venner kan spille sammen, i den rækkefølge kortene står. */
const sammenSpil = () => Object.values(kortene()).filter(k => k.sammen && k.href);

/** De spil man kan tage et kapløb i (alle de andre, med en score). */
const kaploebSpil = () => Object.values(kortene()).filter(k => k.kaploeb && k.href);

/**
 * Laver navn → hvor, ud fra forsidens /api/oversigt. Navne i et spil får
 * spillets kort; resten af dem der er her, får null (de står bare på forsiden).
 */
function laesOversigt(svar) {
  const navne = {}, k = kortene();
  Object.keys(svar.spil || {}).forEach(spil => {
    (svar.spil[spil].navne || []).forEach(n => { navne[smaa(n)] = k[spil] || { titel: spil, href: null }; });
  });
  ((svar.her && svar.her.navne) || []).forEach(n => { if (!(smaa(n) in navne)) navne[smaa(n)] = null; });
  hvorErDe = navne;
  tegn();
}

/** Hvor en ven er: teksten under navnet, og spillet hen er i gang med (hvis noget). */
function hvor(navn) {
  const k = smaa(navn);
  if (!(k in hvorErDe)) return { tekst: 'ikke her nu', online: false, spil: null };
  const spil = hvorErDe[k];
  return { tekst: spil ? 'spiller ' + spil.titel : 'er her nu', online: true, spil };
}

/* ---------- Spil sammen (rum) ---------- */

/** Det, der skal tegnes om: hvem, hvilket spil, og hvor langt det er. */
const rumMaerke = liste => liste.map(r => [r.kode, r.status, r.rolle, r.spil, r.modspiller].join('|')).join(',');

/** Henter mine invitationer og igangværende spil. Fejler stille som resten. */
async function hentRum() {
  if (!window.Rum || !laesNavn()) { if (rum.length) { rum = []; tegn(); } return; }
  try {
    const nye = await Rum.mine();
    if (rumMaerke(nye) !== rumMaerke(rum)) { rum = nye; tegn(); } else { rum = nye; }
  } catch (e) { /* så står der bare det samme som før */ }
}

/** Sender begge parter ind i spillet. Værten er allerede på vej, når han inviterer. */
function gaaTilRum(r) {
  const kort = kortene()[r.spil];
  location.href = (kort && kort.href ? kort.href : '/') + '?rum=' + encodeURIComponent(r.kode);
}

/** Invitationer og igangværende spil øverst i panelet – det haster mest. */
function tegnRum(kort) {
  const k = kortene();
  rum.forEach(r => {
    const titel = (k[r.spil] && k[r.spil].titel) || r.spil;
    const kap = !!(k[r.spil] && k[r.spil].kaploeb && !k[r.spil].sammen);   // kapløb eller delt parti
    const hvem = visNavn(r.modspiller);          // kælenavnet, hvis vennen har fået et
    const raekke = el('div', 'v-spoerg v-rum');
    const svar = el('span', 'v-svar');

    if (r.status === 'igang') {
      raekke.appendChild(el('span', 'v-spoerg-tekst', kap
        ? '🏁 Du er i kapløb med ' + hvem + ' i ' + titel
        : '🎮 Du spiller ' + titel + ' med ' + hvem));
      svar.appendChild(knap('v-knap v-vigtig', 'Tilbage', () => gaaTilRum(r)));
      svar.appendChild(knap('v-knap', 'Stop', () => Rum.forlad(r.kode).then(hentRum).catch(() => {})));
    } else if (r.rolle === 'gaest') {
      raekke.appendChild(el('span', 'v-spoerg-tekst', kap
        ? hvem + ' udfordrer dig i ' + titel
        : hvem + ' vil spille ' + titel + ' med dig'));
      svar.appendChild(knap('v-knap v-vigtig v-hopmed', 'Hop med!', () => gaaTilRum(r)));
      svar.appendChild(knap('v-knap', 'Nej tak', () => Rum.forlad(r.kode).then(hentRum).catch(() => {})));
    } else {
      raekke.appendChild(el('span', 'v-spoerg-tekst',
        (kap ? 'Venter på at ' + hvem + ' tager kapløbet i ' : 'Venter på at ' + hvem + ' hopper med i ') + titel));
      svar.appendChild(knap('v-knap v-vigtig', 'Tilbage', () => gaaTilRum(r)));
      svar.appendChild(knap('v-knap', 'Afbryd', () => Rum.forlad(r.kode).then(hentRum).catch(() => {})));
    }

    raekke.appendChild(svar);
    kort.appendChild(raekke);
  });
}

/* ---------- Beskeder ---------- */
/*
  Selve chatten ligger i /beskeder.js; her er kun det, panelet skal vise: en
  linje øverst, når nogen har skrevet, og et 💬-mærke på vennen. Er filen ikke
  indlæst, sker der bare ingenting.
*/

/** Samtaler med noget ulæst i, nyeste først. */
const nyeBeskeder = () =>
  (window.Beskeder ? Beskeder.samtaler() : []).filter(s => s.nye > 0);

/** Hvor meget en bestemt ven har skrevet, siden jeg sidst kiggede. */
const ulaest = navn => (window.Beskeder ? Beskeder.nye(navn) : 0);

/** "Selma skrev: hej!" øverst i panelet – lige under invitationerne. */
function tegnBeskeder(kort) {
  nyeBeskeder().forEach(s => {
    const hvem = visNavn(s.ven);
    const raekke = el('div', 'v-spoerg v-besked');
    raekke.appendChild(el('span', 'v-spoerg-tekst',
      '💬 ' + hvem + ' skrev: ' + s.sidst.tekst));
    const svar = el('span', 'v-svar');
    svar.appendChild(knap('v-knap v-vigtig v-laes', 'Læs', () => Beskeder.aabn(s.ven)));
    raekke.appendChild(svar);
    kort.appendChild(raekke);
  });
}

/* ---------- Panelet ---------- */

// Svaret på det seneste tryk ("Vi har spurgt Selma …"). Det står i panelet, fordi
// man kan spørge derfra – og forsvinder af sig selv, så det ikke står i morgen.
let besked = '', beskedTid = 0;
function sigTil(tekst) { besked = tekst; beskedTid = Date.now(); tegn(); }

/**
 * Spørger `hvem`, om I skal være venner, og fortæller hvad der så sker.
 * `naar` får beskeden (dialogen viser den selv); uden den står den i panelet.
 */
function spoergOm(hvem, naar) {
  const vis = t => (naar ? naar(t) : sigTil(t));
  vis('Spørger ' + hvem + '…');
  kald({ ven: hvem, handling: 'spoerg' })
    .then(d => {
      if (d.status === 'venner') { vis('I er venner nu – ' + hvem + ' havde allerede spurgt dig!'); return; }
      // Det vigtigste er, at man ikke står og venter på noget, der allerede er sket:
      // den anden skal sige ja, og spørgsmålet står, til hen er her igen.
      let t = 'Vi har spurgt ' + hvem + '. ' + hvem + ' skal sige ja, før I er venner'
        + ' – spørgsmålet står og venter, til ' + hvem + ' er på zydy.dk igen.';
      if (d.kendt === false) {
        t += ' Men vi har aldrig set ' + hvem + ' her før: er navnet stavet, som ' + hvem + ' selv skriver det?';
      }
      vis(t);
    })
    .catch(err => vis(err.message));
}

/**
 * "Venter på svar fra Far · Fortryd". Fortryd-knappen er vigtig: uden den blev
 * et navn, man havde stavet forkert, stående for evigt og optog en af de 50
 * pladser, uden at nogen nogensinde kunne svare på det.
 */
function sendtRaekke(navn, efter) {
  const raekke = el('div', 'v-spoerg v-sendt');
  raekke.appendChild(el('span', 'v-spoerg-tekst v-venter', 'Venter på svar fra ' + navn));
  const svar = el('span', 'v-svar');
  svar.appendChild(knap('v-knap v-fortryd', 'Fortryd', () => {
    kald({ ven: navn, handling: 'nej' })
      .then(() => { besked = ''; tegn(); if (efter) efter(); })   // «Vi har spurgt …» passer ikke længere
      .catch(() => {});
  }));
  raekke.appendChild(svar);
  return raekke;
}

function tegn() {
  const rod = document.getElementById('venner');
  if (!rod) return;
  rod.innerHTML = '';
  const navn = laesNavn();

  if (!navn) {
    // Uden navn ved vi ikke hvem du er, og så giver venner ikke mening endnu.
    const kort = el('div', 'v-kort v-tom');
    kort.appendChild(el('h2', 'v-titel', 'Venner'));
    kort.appendChild(el('p', 'v-under', 'Skriv dit navn, så kan du blive venner med de andre på zydy.dk.'));
    kort.appendChild(knap('v-knap v-vigtig', 'Skriv dit navn', () => {
      if (window.Ideer) window.Ideer.spoergOmNavn(false, () => { tegn(); hent(); });
    }));
    rod.appendChild(kort);
    return;
  }

  const kort = el('div', 'v-kort');
  const top = el('div', 'v-top');
  top.appendChild(el('h2', 'v-titel', 'Dine venner'));
  // Et spørgsmål må ikke kunne overses – mærkatet lyser ligesom "✨ Nyt på Zydy".
  if (data.venter.length) {
    top.appendChild(el('span', 'v-maerke', data.venter.length === 1
      ? '1 vil være din ven'
      : data.venter.length + ' vil være dine venner'));
  }
  top.appendChild(knap('v-knap v-find', '＋ Find en ven', () => findDialog()));
  kort.appendChild(top);

  // Allerøverst: "Selma vil spille Kryds og bolle med dig" – det haster mest.
  tegnRum(kort);
  // Og lige efter: "Selma skrev …", hvis nogen har skrevet til mig.
  tegnBeskeder(kort);

  // Dernæst: dem der har spurgt mig. Det skal man kunne svare på med ét tryk.
  data.venter.forEach(v => {
    const raekke = el('div', 'v-spoerg');
    raekke.appendChild(el('span', 'v-spoerg-tekst', v.navn + ' vil være din ven'));
    const svar = el('span', 'v-svar');
    svar.appendChild(knap('v-knap v-vigtig', 'Ja tak', () => kald({ ven: v.navn, handling: 'ja' }).catch(() => {})));
    svar.appendChild(knap('v-knap', 'Nej', () => kald({ ven: v.navn, handling: 'nej' }).catch(() => {})));
    raekke.appendChild(svar);
    kort.appendChild(raekke);
  });

  if (data.venner.length) {
    const liste = el('div', 'v-liste');
    data.venner.forEach(v => {
      const h = hvor(v.navn);
      const kn = kaelenavn(v.navn);
      const b = knap('v-ven' + (h.online ? ' online' : ''), null, () => venDialog(v.navn));
      b.appendChild(el('span', 'v-prik'));
      const t = el('span', 'v-navn-boks');
      t.appendChild(el('span', 'v-navn', kn || v.navn));
      // Med kælenavn står det rigtige navn småt nedenunder, så man altid kan se hvem det er.
      t.appendChild(el('span', 'v-hvor', kn ? v.navn + ' · ' + h.tekst : h.tekst));
      b.appendChild(t);
      const nye = ulaest(v.navn);
      if (nye) b.appendChild(el('span', 'v-nyt', '💬 ' + nye));
      liste.appendChild(b);
    });
    kort.appendChild(liste);
  } else if (!data.venter.length) {
    // Den vigtigste skærm på hele panelet: en der aldrig har set det før, skal
    // kunne se hvad man gør – og helst kunne gøre det med ét tryk.
    kort.appendChild(el('p', 'v-under',
      'Du har ingen venner her endnu. Bliv venner med en, der også spiller – så kan I se '
      + 'hinanden på forsiden, skrive sammen og spille sammen.'));
    const hurtige = forslagFor('').slice(0, 4);
    if (hurtige.length) {
      kort.appendChild(el('p', 'v-under v-hurtig-titel', 'Er en af dem her din ven? Tryk, så spørger vi:'));
      const liste = el('div', 'v-hurtige');
      hurtige.forEach(f => liste.appendChild(navneKnap(f, 'v-hurtig-navn', () => spoergOm(f.navn))));
      kort.appendChild(liste);
    }
    kort.appendChild(knap('v-knap v-vigtig v-find-stor', '＋ Find en ven', () => findDialog()));
  }

  // Dem jeg selv har spurgt – med en vej ud, hvis jeg skrev navnet forkert.
  data.sendt.forEach(v => kort.appendChild(sendtRaekke(v.navn)));

  if (besked && Date.now() - beskedTid < BESKED_MS) kort.appendChild(el('p', 'v-under v-besked-linje', besked));
  else besked = '';

  rod.appendChild(kort);
}

/** Et navn man kan trykke på for at spørge. Grøn prik = hen er her lige nu. */
function navneKnap(f, cls, naar) {
  const b = knap('v-knap ' + cls + (f.online ? ' online' : ''), null, naar);
  if (f.online) {
    const prik = el('span', 'v-prik');
    prik.setAttribute('aria-hidden', 'true');
    b.appendChild(prik);
  }
  b.appendChild(el('span', 'v-forslag-tekst', f.navn));
  if (f.online) b.setAttribute('aria-label', f.navn + ' (er her nu)');
  return b;
}

/* ---------- Dialoger (samme stil som /ideer.js) ---------- */

let dlg = null, indhold = null;

function aabn(tegnIndhold) {
  if (!dlg) {
    dlg = el('dialog', 'id-dlg v-dlg');
    indhold = el('div', 'id-indhold');
    dlg.appendChild(indhold);
    dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
    document.body.appendChild(dlg);
  }
  indhold.innerHTML = '';
  tegnIndhold(indhold);
  if (!dlg.open) dlg.showModal();
}

/**
 * "Find en ven": et søgefelt og de navne, vi har set på siden.
 *
 * Listen filtreres, mens man skriver, og man behøver ikke ramme stavemåden
 * (`traef()`). Kun listen og "venter på svar" tegnes om undervejs, så feltet
 * beholder tastaturet og markøren — det var ellers det, der gjorde det
 * besværligt at lede efter nogen på en telefon.
 */
function findDialog() {
  let soegt = '';
  aabn(rod => {
    rod.appendChild(el('h2', 'id-titel', 'Find en ven'));
    rod.appendChild(el('p', 'id-under',
      'Tryk på et navn, så spørger vi. I er venner, når den anden siger ja – og så kan I se '
      + 'hinanden på forsiden, skrive sammen og spille sammen.'));

    const status = el('p', 'id-status', '');
    const liste = el('div', 'v-forslag');
    const sendtBoks = el('div', 'v-sendt-liste');

    const tegnSendt = () => {
      sendtBoks.innerHTML = '';
      data.sendt.forEach(v => sendtBoks.appendChild(sendtRaekke(v.navn, () => { tegnSendt(); tegnListe(); })));
    };

    function spoerg(hvem) {
      spoergOm(hvem, t => { status.textContent = t; tegnListe(); tegnSendt(); });
    }

    function tegnListe() {
      liste.innerHTML = '';
      const fundet = forslagFor(soegt);
      fundet.slice(0, FORSLAG_MAKS).forEach(f =>
        liste.appendChild(navneKnap(f, 'v-forslag-navn', () => spoerg(f.navn))));
      if (!fundet.length) {
        liste.appendChild(el('p', 'v-under v-intet', soegt
          ? 'Vi kender ingen, der hedder noget i retning af «' + soegt + '». Tryk på Spørg, '
            + 'hvis du er sikker på, at det er sådan, hen skriver sit navn.'
          : 'Vi har ikke set andre navne på siden endnu. Skriv navnet herunder, så spørger vi.'));
      } else if (fundet.length > FORSLAG_MAKS) {
        liste.appendChild(el('p', 'v-under v-flere', 'Og ' + (fundet.length - FORSLAG_MAKS)
          + ' til – skriv lidt af navnet, så finder vi det.'));
      }
    }

    // Søgefeltet er også feltet, man skriver et helt nyt navn i: har man skrevet
    // en, vi kender, spørger vi med *hens* stavemåde, så ja'et lander rigtigt.
    const form = el('form', 'id-form v-form');
    const input = el('input', 'id-input v-input');
    input.type = 'text'; input.maxLength = NAVN_MAKS; input.placeholder = 'Søg efter et navn';
    input.setAttribute('aria-label', 'Søg efter den du vil være venner med');
    input.autocapitalize = 'words'; input.spellcheck = false;
    input.setAttribute('enterkeyhint', 'search'); input.setAttribute('autocomplete', 'off');
    input.addEventListener('input', () => { soegt = input.value; tegnListe(); });
    form.appendChild(input);
    const spoergKnap = el('button', 'v-knap v-vigtig v-spoerg-knap', 'Spørg');
    spoergKnap.type = 'submit';
    form.appendChild(spoergKnap);
    form.addEventListener('submit', e => {
      e.preventDefault();
      const n = input.value.trim();
      if (!n) { status.textContent = 'Skriv et navn først, eller tryk på et af navnene.'; input.focus(); return; }
      spoerg(retStavemaade(n));
    });
    rod.appendChild(form);

    rod.appendChild(liste);
    rod.appendChild(status);
    rod.appendChild(sendtBoks);
    tegnListe();
    tegnSendt();

    const raekke = el('div', 'id-knapper');
    raekke.appendChild(knap('id-knap id-send', 'Luk', () => dlg.close()));
    rod.appendChild(raekke);
  });
}

/**
 * Trykker man på en ven: hvor hen er, muligheden for at følge med, at give hen
 * et kælenavn – og for at fjerne venskabet.
 *
 * `hvem` er altid det rigtige navn (nøglen); `vis` er det, der står på skærmen.
 */
function venDialog(hvem) {
  aabn(rod => {
    const h = hvor(hvem);
    const kn = kaelenavn(hvem);
    const vis = kn || hvem;
    rod.appendChild(el('h2', 'id-titel', vis));
    if (kn) rod.appendChild(el('p', 'v-rigtigt-navn', 'hedder egentlig ' + hvem));
    rod.appendChild(el('p', 'id-under', h.online
      ? (h.spil ? vis + ' spiller ' + h.spil.titel + ' lige nu.' : vis + ' er på zydy.dk lige nu.')
      : vis + ' er ikke på zydy.dk lige nu.'));

    // Det nemmeste først: at skrive. Vennen behøver ikke at være her nu –
    // beskeden står og venter, til hen kommer. Chatten har sin egen dialog, så
    // vi lukker den her først; ellers ligger de to oven på hinanden.
    if (window.Beskeder) {
      const n = ulaest(hvem);
      rod.appendChild(knap('id-knap v-skriv', n ? '💬 Læs de ' + n + ' nye' : '💬 Skriv til ' + vis, () => {
        dlg.close();
        Beskeder.aabn(hvem);
      }));
    }

    // Det bedste: at spille *sammen* – ét spil, to telefoner. Vi laver et rum og
    // hopper derind; den anden får invitationen på forsiden og kan hoppe med.
    const status = el('p', 'id-status', '');
    const inviter = (s, siger) => {
      status.textContent = 'Spørger ' + vis + '…';
      Rum.inviter(hvem, s.id)
        .then(r => gaaTilRum(r))
        .catch(err => { status.textContent = err.message; });
      return siger;
    };

    const spil = sammenSpil();
    if (spil.length) {
      spil.forEach(s => {
        rod.appendChild(knap('id-knap v-sammen', '🎮 Spil ' + s.titel + ' sammen', () => inviter(s)));
      });
      rod.appendChild(el('p', 'v-under', 'Invitationen står og venter på forsiden, til ' + vis + ' kommer.'));
    }

    // Og i alle de andre spil: et kapløb. Hver sit spil, samme stilling øverst
    // på skærmen – så kan man joine hinanden, uanset hvad man har lyst til.
    const kap = kaploebSpil();
    if (kap.length) {
      rod.appendChild(el('h3', 'v-kaele-titel', '🏁 Tag et kapløb'));
      rod.appendChild(el('p', 'v-under',
        'I spiller hver for sig på hver sin telefon, og stillingen står øverst på skærmen. Den bedste runde vinder.'));
      const liste = el('div', 'v-kaploeb');
      kap.forEach(s => liste.appendChild(knap('v-knap v-kap-spil', s.titel, () => inviter(s))));
      rod.appendChild(liste);
    }
    rod.appendChild(status);

    // Ellers kan man bare hoppe med ind i det spil, vennen er i gang med.
    if (h.spil && h.spil.href) {
      const gaa = el('a', 'id-knap v-spil-med', 'Spil ' + h.spil.titel + ' med');
      gaa.href = h.spil.href;
      rod.appendChild(gaa);
    }

    // Kælenavnet: dit eget navn til vennen. Feltet står med det, der allerede er
    // givet, så «Gem» retter det, og et tomt felt fjerner det igen.
    const kaeleStatus = el('p', 'id-status v-kaele-status', '');
    const form = el('form', 'id-form v-form v-kaele');
    const input = el('input', 'id-input v-input v-kaele-input');
    input.type = 'text'; input.maxLength = KAELE_MAKS; input.value = kn;
    input.placeholder = 'Kælenavn til ' + hvem;
    input.setAttribute('aria-label', 'Kælenavn til ' + hvem);
    input.autocapitalize = 'words'; input.spellcheck = false;
    input.setAttribute('enterkeyhint', 'done'); input.setAttribute('autocomplete', 'off');
    const gem = el('button', 'v-knap v-vigtig v-kaele-gem', 'Gem');
    gem.type = 'submit';
    form.appendChild(input);
    form.appendChild(gem);
    form.addEventListener('submit', e => {
      e.preventDefault();
      const nyt = saetKaelenavn(hvem, input.value);
      tegn();                                   // brikken i panelet skifter navn med det samme
      venDialog(hvem);                          // dialogen tegnes forfra med det nye navn
      const p = indhold.querySelector('.v-kaele-status');
      if (p) p.textContent = nyt ? 'Hos dig hedder ' + hvem + ' nu ' + nyt + '.' : 'Kælenavnet er væk igen.';
    });
    rod.appendChild(el('h3', 'v-kaele-titel', kn ? 'Kælenavn' : 'Giv ' + hvem + ' et kælenavn'));
    rod.appendChild(form);
    rod.appendChild(el('p', 'v-under v-kaele-hint',
      'Kælenavnet står kun på din telefon. ' + hvem + ' kan ikke se det, og på toplisterne står det rigtige navn.'));
    rod.appendChild(kaeleStatus);

    const raekke = el('div', 'id-knapper');
    raekke.appendChild(knap('id-knap id-fortryd', 'Fjern ven', () => {
      kald({ ven: hvem, handling: 'nej' }).then(() => dlg.close()).catch(() => dlg.close());
    }));
    raekke.appendChild(knap('id-knap id-send', 'Luk', () => dlg.close()));
    rod.appendChild(raekke);
  });
}

/* ---------- Stil ---------- */

const css = `
#venner:empty{display:none}
.v-kort{background:var(--bg2,#1b1f42);border-radius:var(--r,26px);padding:16px 18px;margin-bottom:18px}
.v-top{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.v-titel{margin:0;font-size:20px;font-weight:800;letter-spacing:-.5px;flex:1}
.v-under{margin:8px 0 0;color:var(--muted,#a9acd6);font-size:15px;line-height:1.35}
.v-venter{margin:10px 0 0;color:var(--muted,#a9acd6);font-size:13px}
.v-knap{font:inherit;font-size:14px;font-weight:700;cursor:pointer;border:0;border-radius:999px;
  padding:8px 14px;min-height:40px;background:rgba(255,255,255,.09);color:var(--text,#fff7e6)}
.v-knap:hover{background:rgba(255,255,255,.16)}
.v-knap:focus-visible{outline:3px solid var(--sun,#ffd447);outline-offset:3px}
.v-vigtig{background:var(--sun,#ffd447);color:#1c1f4a}
.v-tom{text-align:left}
.v-tom .v-knap{margin-top:12px}

/* "2 vil være dine venner" ved siden af overskriften – samme greb som "3 nye" i ✨ Nyt på Zydy */
.v-maerke{flex:0 0 auto;font-size:13px;font-weight:800;border-radius:999px;padding:3px 10px;
  background:var(--sun,#ffd447);color:#1c1f4a;animation:puls 1.8s ease-in-out infinite}

/* Den tomme liste: her skal en ny spiller kunne se, hvad man gør */
.v-hurtig-titel{margin-top:12px;font-size:14px}
.v-hurtige{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}
.v-hurtig-navn{font-size:16px;padding:10px 16px;min-height:44px}
.v-find-stor{display:block;width:100%;margin-top:14px;font-size:17px;padding:14px;min-height:52px}
.v-besked-linje{margin-top:12px;color:var(--text,#fff7e6);background:rgba(255,212,71,.12);
  border-radius:16px;padding:10px 12px;font-size:14px}

/* "Selma vil være din ven" – skal kunne besvares med ét tryk */
.v-spoerg{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:12px;
  background:rgba(255,212,71,.12);border-radius:18px;padding:10px 12px}
.v-spoerg-tekst{flex:1;min-width:150px;font-weight:700;font-size:15px}
.v-svar{display:flex;gap:8px}

/* Vennerne som brikker der kan trykkes på */
.v-liste{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
.v-ven{display:inline-flex;align-items:center;gap:8px;font:inherit;text-align:left;cursor:pointer;
  border:0;border-radius:16px;padding:8px 14px;min-height:48px;
  background:rgba(255,255,255,.07);color:var(--muted,#a9acd6)}
.v-ven:hover{background:rgba(255,255,255,.13)}
.v-ven:focus-visible{outline:3px solid var(--sun,#ffd447);outline-offset:3px}
.v-ven.online{background:rgba(94,224,168,.16);color:#7cf0c0}
.v-prik{width:8px;height:8px;border-radius:50%;background:currentColor;opacity:.35;flex:0 0 auto}
.v-ven.online .v-prik{opacity:1;animation:puls 1.8s ease-in-out infinite}
.v-navn-boks{display:flex;flex-direction:column;line-height:1.15}
.v-navn{font-weight:800;font-size:16px;color:var(--text,#fff7e6)}
.v-ven.online .v-navn{color:#bff7e0}
.v-hvor{font-size:12px}

/* Dialogen "Find en ven" */
.v-forslag{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0 4px;max-height:38vh;overflow-y:auto;
  -webkit-overflow-scrolling:touch}
.v-forslag-navn{background:rgba(255,255,255,.09);font-size:16px;padding:10px 16px;min-height:44px}
/* Dem der er her lige nu, står først og lyser – dem kan man nå at aftale det med */
.v-forslag-navn.online,.v-hurtig-navn.online{background:rgba(94,224,168,.18);color:#bff7e0}
.v-forslag-navn.online:hover,.v-hurtig-navn.online:hover{background:rgba(94,224,168,.3)}
.v-forslag-navn,.v-hurtig-navn{display:inline-flex;align-items:center;gap:8px}
.v-forslag-navn .v-prik,.v-hurtig-navn .v-prik{opacity:1;animation:puls 1.8s ease-in-out infinite}
.v-intet,.v-flere{flex:1 0 100%;margin:0}
.v-form{display:flex;gap:8px;align-items:stretch}
.v-input{flex:1;min-width:0;font-size:17px;text-align:left;padding:12px 14px}
.v-spoerg-knap{flex:0 0 auto;font-size:16px;padding:0 18px}

/* "Venter på svar fra Far · Fortryd" – roligere end et spørgsmål, man skal svare på */
.v-sendt{background:rgba(255,255,255,.06)}
.v-sendt .v-venter{margin:0;font-size:14px;font-weight:600;color:var(--muted,#a9acd6)}
.v-fortryd{font-size:13px;padding:6px 12px;min-height:36px}
.v-spil-med{display:block;margin-top:14px;text-align:center;text-decoration:none;line-height:24px;
  background:rgba(255,255,255,.09);color:var(--text,#fff7e6)}

/* Kælenavne: det rigtige navn står småt, så man kan se hvem "Smølfen" er */
.v-rigtigt-navn{margin:2px 0 0;color:var(--muted,#a9acd6);font-size:14px}
.v-kaele-titel{margin:18px 0 8px;font-size:16px;font-weight:800}
.v-kaele-hint{font-size:13px}
.v-kaele-status:empty{display:none}

/* Beskeder: "Selma skrev …" øverst, og et 💬-mærke på vennen selv */
.v-besked{background:rgba(124,240,192,.12)}
.v-besked .v-spoerg-tekst{font-weight:600;overflow-wrap:anywhere}
.v-nyt{flex:0 0 auto;font-size:12px;font-weight:800;border-radius:999px;padding:3px 8px;
  background:var(--sun,#ffd447);color:#1c1f4a}
.v-skriv{display:block;width:100%;margin-top:4px;text-align:center;
  background:rgba(255,255,255,.09);color:var(--text,#fff7e6)}

/* Spil sammen: invitationen står øverst i panelet og lyser, så den ikke overses */
.v-rum{background:rgba(94,224,168,.14)}
.v-rum .v-hopmed{background:var(--mint,#5ee0a8);color:#10321f;animation:puls 1.8s ease-in-out infinite}
.v-sammen{display:block;width:100%;margin-top:14px;text-align:center;
  background:var(--sun,#ffd447);color:#1c1f4a;font-weight:800}

/* Kapløb: ét mærke pr. spil, så listen kan være der uden at fylde hele dialogen */
.v-kaploeb{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;max-height:34vh;overflow-y:auto;
  -webkit-overflow-scrolling:touch}
.v-kap-spil{background:rgba(94,224,168,.16);color:#bff7e0;font-size:15px;padding:10px 14px}
.v-kap-spil:hover{background:rgba(94,224,168,.28)}
@media (prefers-reduced-motion:reduce){ .v-rum .v-hopmed{animation:none} }
@media (prefers-reduced-motion:reduce){ .v-ven.online .v-prik,.v-forslag-navn .v-prik,
  .v-hurtig-navn .v-prik,.v-maerke{animation:none} }
`;
const style = document.createElement('style');
style.textContent = css;
document.head.appendChild(style);

/* ---------- Start ---------- */

function start() {
  tegn();
  hent();
  hentRum();
  // Forsiden henter /api/oversigt hvert halve minut – vi får resultatet gratis.
  document.addEventListener('zydy:oversigt', e => { if (e.detail) laesOversigt(e.detail); });
  // Er der kommet en besked (/beskeder.js), skal mærket og linjen øverst med.
  document.addEventListener('zydy:beskeder', () => tegn());
  // Navnet blev skrevet eller skiftet: så er det en anden persons venner, vi skal vise.
  document.addEventListener('zydy:navn', () => {
    data = { venner: [], venter: [], sendt: [], kendte: [] };
    rum = [];
    tegn(); hent(); hentRum();
  });
  // Venter nogen på et ja – enten mig eller den anden – kigger vi tiere efter:
  // det er lige dér, de to som regel sidder ved siden af hinanden og prøver.
  setInterval(() => {
    if (document.visibilityState !== 'visible') return;
    const hvornaar = data.venter.length || data.sendt.length ? HURTIG_MS : OPDATER_MS;
    if (Date.now() - sidstHentet >= hvornaar) hent();
  }, 5_000);
  // Invitationer hentes tiere: den anden står og venter på, at man hopper med.
  setInterval(() => { if (document.visibilityState === 'visible') hentRum(); }, RUM_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') { hent(); hentRum(); }
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();

window.Venner = {
  hent, tegn, hentRum, kaelenavn, saetKaelenavn, visNavn, ulaest,
  form, traef, forslagFor, findDialog, spoergOm,
  get data() { return data; },
  get rum() { return rum; },
};
})();
