/*
  Venner på forsiden af zydy.dk. Klassisk script, ingen build:

    <script src="/venner.js" defer></script>     (efter /ideer.js)

  Man er det navn, man har skrevet på forsiden ('zydy.navn', se /ideer.js).
  Panelet øverst viser:

    • invitationer: "Selma vil spille Kryds og bolle med dig" — med Hop med!
    • dine venner, og om de er her lige nu ("Selma spiller Obby")
    • dem der har spurgt, om I skal være venner — med Ja tak / Nej tak
    • en knap til at finde en ven blandt de navne, vi har set på siden

  Trykker man på en ven, kan man give hen et kælenavn — og invitere hen til et
  spil, som to kan spille sammen over nettet (kortene med data-sammen, se
  scripts/byg-forside.mjs).

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
const RUM_MS = 5_000;                // … og efter invitationer til at spille sammen (de haster)

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
function hent() { kald(null).catch(() => {}); }

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
      sammen: li.hasAttribute('data-sammen'),      // kan spilles sammen over nettet
    };
  });
  return ud;
}

/** De spil to venner kan spille sammen, i den rækkefølge kortene står. */
const sammenSpil = () => Object.values(kortene()).filter(k => k.sammen && k.href);

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
    const hvem = visNavn(r.modspiller);          // kælenavnet, hvis vennen har fået et
    const raekke = el('div', 'v-spoerg v-rum');
    const svar = el('span', 'v-svar');

    if (r.status === 'igang') {
      raekke.appendChild(el('span', 'v-spoerg-tekst', '🎮 Du spiller ' + titel + ' med ' + hvem));
      svar.appendChild(knap('v-knap v-vigtig', 'Tilbage', () => gaaTilRum(r)));
      svar.appendChild(knap('v-knap', 'Stop', () => Rum.forlad(r.kode).then(hentRum).catch(() => {})));
    } else if (r.rolle === 'gaest') {
      raekke.appendChild(el('span', 'v-spoerg-tekst', hvem + ' vil spille ' + titel + ' med dig'));
      svar.appendChild(knap('v-knap v-vigtig v-hopmed', 'Hop med!', () => gaaTilRum(r)));
      svar.appendChild(knap('v-knap', 'Nej tak', () => Rum.forlad(r.kode).then(hentRum).catch(() => {})));
    } else {
      raekke.appendChild(el('span', 'v-spoerg-tekst', 'Venter på at ' + hvem + ' hopper med i ' + titel));
      svar.appendChild(knap('v-knap v-vigtig', 'Tilbage', () => gaaTilRum(r)));
      svar.appendChild(knap('v-knap', 'Afbryd', () => Rum.forlad(r.kode).then(hentRum).catch(() => {})));
    }

    raekke.appendChild(svar);
    kort.appendChild(raekke);
  });
}

/* ---------- Panelet ---------- */

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
  top.appendChild(knap('v-knap v-find', '＋ Find en ven', findDialog));
  kort.appendChild(top);

  // Allerøverst: "Selma vil spille Kryds og bolle med dig" – det haster mest.
  tegnRum(kort);

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
      liste.appendChild(b);
    });
    kort.appendChild(liste);
  } else if (!data.venter.length) {
    kort.appendChild(el('p', 'v-under', 'Du har ingen venner her endnu. Tryk på «Find en ven» og spørg en.'));
  }

  if (data.sendt.length) {
    kort.appendChild(el('p', 'v-venter', 'Venter på svar fra ' + data.sendt.map(v => v.navn).join(', ')));
  }

  rod.appendChild(kort);
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

/** "Find en ven": navnene vi kender, og et felt til et der ikke står på listen. */
function findDialog() {
  aabn(rod => {
    rod.appendChild(el('h2', 'id-titel', 'Find en ven'));
    rod.appendChild(el('p', 'id-under',
      'Tryk på et navn, så spørger vi. Når den anden siger ja, kan I se hinanden her på forsiden.'));

    const status = el('p', 'id-status', '');

    // Efter et tryk tegnes dialogen forfra med den nye liste (navnet er flyttet
    // fra forslagene over i "venter på svar"), og beskeden skrives i den nye.
    function spoerg(hvem) {
      status.textContent = 'Spørger ' + hvem + '…';
      kald({ ven: hvem, handling: 'spoerg' })
        .then(d => {
          findDialog();
          const p = indhold.querySelector('.id-status');
          if (p) p.textContent = d.status === 'venner'
            ? 'I er venner nu – ' + hvem + ' havde allerede spurgt dig!'
            : 'Vi har spurgt ' + hvem + '. Nu venter vi på svar.';
        })
        .catch(err => { status.textContent = err.message; });
    }

    if (data.kendte.length) {
      const liste = el('div', 'v-forslag');
      data.kendte.forEach(n => liste.appendChild(knap('v-knap v-forslag-navn', n, () => spoerg(n))));
      rod.appendChild(liste);
    } else {
      rod.appendChild(el('p', 'v-under', 'Vi kender ikke andre navne endnu – skriv det selv herunder.'));
    }

    const form = el('form', 'id-form v-form');
    const input = el('input', 'id-input v-input');
    input.type = 'text'; input.maxLength = NAVN_MAKS; input.placeholder = 'Skriv et navn';
    input.setAttribute('aria-label', 'Navnet på den du vil være venner med');
    input.autocapitalize = 'words'; input.spellcheck = false;
    input.setAttribute('enterkeyhint', 'done'); input.setAttribute('autocomplete', 'off');
    form.appendChild(input);
    const spoergKnap = el('button', 'v-knap v-vigtig v-spoerg-knap', 'Spørg');
    spoergKnap.type = 'submit';
    form.appendChild(spoergKnap);
    form.addEventListener('submit', e => {
      e.preventDefault();
      const n = input.value.trim();
      if (!n) { status.textContent = 'Skriv et navn først.'; input.focus(); return; }
      spoerg(n);
    });
    rod.appendChild(form);

    rod.appendChild(status);

    if (data.sendt.length) {
      rod.appendChild(el('p', 'v-venter', 'Venter på svar fra ' + data.sendt.map(v => v.navn).join(', ')));
    }

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

    // Det bedste: at spille *sammen* – ét spil, to telefoner. Vi laver et rum og
    // hopper derind; den anden får invitationen på forsiden og kan hoppe med.
    const status = el('p', 'id-status', '');
    const spil = sammenSpil();
    if (spil.length) {
      spil.forEach(s => {
        rod.appendChild(knap('id-knap v-sammen', '🎮 Spil ' + s.titel + ' sammen', () => {
          status.textContent = 'Spørger ' + vis + '…';
          Rum.inviter(hvem, s.id)
            .then(r => gaaTilRum(r))
            .catch(err => { status.textContent = err.message; });
        }));
      });
      rod.appendChild(el('p', 'v-under', 'Invitationen står og venter på forsiden, til ' + vis + ' kommer.'));
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
.v-forslag{display:flex;flex-wrap:wrap;gap:8px;margin:4px 0 14px}
.v-forslag-navn{background:rgba(255,255,255,.09);font-size:16px;padding:10px 16px;min-height:44px}
.v-form{display:flex;gap:8px;align-items:stretch}
.v-input{flex:1;min-width:0;font-size:17px;text-align:left;padding:12px 14px}
.v-spoerg-knap{flex:0 0 auto;font-size:16px;padding:0 18px}
.v-spil-med{display:block;margin-top:14px;text-align:center;text-decoration:none;line-height:24px;
  background:rgba(255,255,255,.09);color:var(--text,#fff7e6)}

/* Kælenavne: det rigtige navn står småt, så man kan se hvem "Smølfen" er */
.v-rigtigt-navn{margin:2px 0 0;color:var(--muted,#a9acd6);font-size:14px}
.v-kaele-titel{margin:18px 0 8px;font-size:16px;font-weight:800}
.v-kaele-hint{font-size:13px}
.v-kaele-status:empty{display:none}

/* Spil sammen: invitationen står øverst i panelet og lyser, så den ikke overses */
.v-rum{background:rgba(94,224,168,.14)}
.v-rum .v-hopmed{background:var(--mint,#5ee0a8);color:#10321f;animation:puls 1.8s ease-in-out infinite}
.v-sammen{display:block;width:100%;margin-top:14px;text-align:center;
  background:var(--sun,#ffd447);color:#1c1f4a;font-weight:800}
@media (prefers-reduced-motion:reduce){ .v-rum .v-hopmed{animation:none} }
@media (prefers-reduced-motion:reduce){ .v-ven.online .v-prik{animation:none} }
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
  // Navnet blev skrevet eller skiftet: så er det en anden persons venner, vi skal vise.
  document.addEventListener('zydy:navn', () => {
    data = { venner: [], venter: [], sendt: [], kendte: [] };
    rum = [];
    tegn(); hent(); hentRum();
  });
  setInterval(() => { if (document.visibilityState === 'visible') hent(); }, OPDATER_MS);
  // Invitationer hentes tiere: den anden står og venter på, at man hopper med.
  setInterval(() => { if (document.visibilityState === 'visible') hentRum(); }, RUM_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') { hent(); hentRum(); }
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();

window.Venner = {
  hent, tegn, hentRum, kaelenavn, saetKaelenavn, visNavn,
  get data() { return data; },
  get rum() { return rum; },
};
})();
