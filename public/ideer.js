/*
  Idéer, ønsker og navnet på forsiden af zydy.dk. Klassisk script, ingen build:

    <script src="/ideer.js" defer></script>

  Tre ting, som alle hænger sammen med navnet:

  1. Navnet. Første gang man er på zydy.dk, spørger siden "Hvem spiller?", og
     svaret gemmes i localStorage under 'zydy.navn' — den samme nøgle som
     /spil/highscore.js bruger. Derfor kender spillene navnet med det samme, og
     en rekord bliver gemt uden at spørge igen. Bagefter står navnet som en lille
     knap i toppen, hvor man kan skifte det.

  2. "Mangler der noget?" under hvert spilkort. Knapperne laves her i JS, så et
     nyt kort i index.html automatisk får en.

  3. "Nyt spil?"-kortet nederst, formet som de andre kort.

  Begge dele sendes til POST /api/ideer (src/ideer.mjs) og lander i D1, hvor de
  hentes ned med `npm run ideer`. Uden forbindelse siger dialogen det og lader
  teksten stå, så man kan prøve igen.
*/
(function () {
'use strict';

const API = '/api/ideer';
const KEY_NAVN = 'zydy.navn';        // fælles med /spil/highscore.js
const KEY_SPURGT = 'zydy.navn.spurgt';
const NAVN_MAKS = 12;
const TEKST_MAKS = 600;              // samme som TEKST_MAKS i src/ideer.mjs

const gem = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
const laes = k => { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } };
const navn = {
  hent: () => laes(KEY_NAVN),
  // Sig til, når navnet er skrevet eller skiftet: /spil/aktivitet.js sender med
  // det samme et livstegn med det nye navn, så "Sofie er her nu" står der straks.
  gem: n => { gem(KEY_NAVN, n); document.dispatchEvent(new CustomEvent('zydy:navn', { detail: n })); },
};

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};

/* ---------- Dialogen ---------- */

let dlg = null, indhold = null;

function sikrDialog() {
  if (dlg) return dlg;
  dlg = el('dialog', 'id-dlg');
  indhold = el('div', 'id-indhold');
  dlg.appendChild(indhold);
  // Tryk uden for kassen lukker – ligesom i spillene.
  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
  document.body.appendChild(dlg);
  return dlg;
}

function aabn(tegn) {
  sikrDialog();
  indhold.innerHTML = '';
  tegn(indhold);
  if (!dlg.open) dlg.showModal();
}

/** Overskrift + brødtekst i dialogen. */
function hoved(rod, titel, under) {
  rod.appendChild(el('h2', 'id-titel', titel));
  if (under) rod.appendChild(el('p', 'id-under', under));
}

/** Knapperækken nederst: [annuller] [send]. `send` er teksten på den gule knap. */
function knapper(rod, sendTekst, onAnnuller, fortrydTekst) {
  const raekke = el('div', 'id-knapper');
  const fortryd = el('button', 'id-knap id-fortryd', fortrydTekst || 'Fortryd');
  fortryd.type = 'button';
  fortryd.addEventListener('click', () => (onAnnuller ? onAnnuller() : dlg.close()));
  const send = el('button', 'id-knap id-send', sendTekst);
  send.type = 'submit';
  raekke.appendChild(fortryd);
  raekke.appendChild(send);
  rod.appendChild(raekke);
  return send;
}

/* ---------- Navnet ---------- */

/** Knappen i toppen: "Sofie · skift navn", eller en opfordring hvis vi ikke ved det. */
function tegnNavneknap() {
  const knap = document.getElementById('navnKnap');
  if (!knap) return;
  const n = navn.hent();
  knap.classList.toggle('tom', !n);
  knap.innerHTML = '';
  if (n) {
    knap.appendChild(el('span', 'id-hej', 'Hej ' + n));
    knap.appendChild(el('span', 'id-skift', 'skift navn'));
  } else {
    knap.appendChild(el('span', 'id-hej', 'Hvem spiller?'));
    knap.appendChild(el('span', 'id-skift', 'skriv dit navn'));
  }
}

/**
 * Spørger om navnet. `foerste` er det første besøg (så teksten forklarer hvorfor),
 * `naar` kaldes med navnet bagefter – fx for at fortsætte en idé, man var i gang med.
 */
function spoergOmNavn(foerste, naar) {
  aabn(rod => {
    const form = el('form', 'id-form');
    hoved(form, foerste ? 'Hvem spiller?' : 'Hvad hedder du?',
      'Så ved spillene, hvem der skal stå på toplisten – du skal kun skrive det én gang.');

    const input = el('input', 'id-input');
    input.type = 'text'; input.name = 'navn'; input.maxLength = NAVN_MAKS;
    input.placeholder = 'Dit navn'; input.setAttribute('aria-label', 'Dit navn');
    input.autocapitalize = 'words'; input.spellcheck = false;
    input.setAttribute('enterkeyhint', 'done'); input.setAttribute('autocomplete', 'off');
    input.value = navn.hent();
    form.appendChild(input);

    const status = el('p', 'id-status', '');
    form.appendChild(status);
    // Et nej huskes (KEY_SPURGT), så en gæst ikke bliver spurgt ved hvert besøg.
    knapper(form, 'Gem navn', () => { gem(KEY_SPURGT, '1'); dlg.close(); }, foerste ? 'Ikke nu' : 'Fortryd');

    form.addEventListener('submit', e => {
      e.preventDefault();
      const n = input.value.trim();
      if (!n) { status.textContent = 'Skriv lige dit navn først.'; input.focus(); return; }
      navn.gem(n);
      gem(KEY_SPURGT, '1');
      tegnNavneknap();
      dlg.close();
      if (naar) naar(n);
    });

    rod.appendChild(form);
    setTimeout(() => input.focus({ preventScroll: true }), 50);
  });
}

/* ---------- Idéer og ønsker ---------- */

async function send(krop) {
  const r = await fetch(API, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(krop),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data.ok) throw new Error(data.fejl || 'Kunne ikke sende (' + r.status + ')');
  return data;
}

function tak(besked) {
  aabn(rod => {
    hoved(rod, 'Tak!', besked);
    const luk = el('button', 'id-knap id-send', 'Luk');
    luk.type = 'button';
    luk.addEventListener('click', () => dlg.close());
    const raekke = el('div', 'id-knapper');
    raekke.appendChild(luk);
    rod.appendChild(raekke);
    setTimeout(() => luk.focus({ preventScroll: true }), 50);
  });
}

/**
 * Skriveformularen. `opt` = { slags, spil, titel, under, plads, sendTekst, takTekst }.
 * Kender vi ikke navnet, spørges der om det først, og formularen åbner bagefter.
 */
function skriv(opt, udkast) {
  if (!navn.hent()) { spoergOmNavn(false, () => skriv(opt, udkast)); return; }

  aabn(rod => {
    const form = el('form', 'id-form');
    hoved(form, opt.titel, opt.under);

    const felt = el('textarea', 'id-tekst');
    felt.name = 'tekst'; felt.rows = 5; felt.maxLength = TEKST_MAKS;
    felt.placeholder = opt.plads; felt.setAttribute('aria-label', opt.titel);
    felt.value = udkast || '';
    form.appendChild(felt);

    const fra = el('p', 'id-fra');
    fra.appendChild(document.createTextNode('Fra ' + navn.hent() + ' · '));
    const skiftNavn = el('button', 'id-link', 'ikke dig?');
    skiftNavn.type = 'button';
    skiftNavn.addEventListener('click', () => spoergOmNavn(false, () => skriv(opt, felt.value)));
    fra.appendChild(skiftNavn);
    form.appendChild(fra);

    const status = el('p', 'id-status', '');
    form.appendChild(status);
    const sendKnap = knapper(form, opt.sendTekst);

    form.addEventListener('submit', async e => {
      e.preventDefault();
      const tekst = felt.value.trim();
      if (tekst.length < 3) { status.textContent = 'Skriv lidt mere, så vi kan forstå det.'; felt.focus(); return; }
      sendKnap.disabled = true; status.textContent = 'Sender…';
      try {
        await send({ slags: opt.slags, spil: opt.spil, navn: navn.hent(), tekst });
        tak(opt.takTekst);
      } catch (err) {
        sendKnap.disabled = false;
        status.textContent = 'Det gik ikke – prøv igen om lidt.';   // teksten bliver stående i feltet
      }
    });

    rod.appendChild(form);
    setTimeout(() => felt.focus({ preventScroll: true }), 50);
  });
}

/** "Mangler der noget?" under ét spilkort. */
function oenske(spil, titel) {
  skriv({
    slags: 'oenske', spil,
    titel: 'Mangler der noget i ' + titel + '?',
    under: 'Skriv hvad du savner, eller hvad der driller. Vi læser det hele.',
    plads: 'Fx: der mangler flere baner, og musikken er for høj…',
    sendTekst: 'Send ønske',
    takTekst: 'Dit ønske er gemt. Vi kigger på det, næste gang vi bygger videre på ' + titel + '.',
  });
}

/** "Nyt spil?"-kortet nederst. `udkast` er tekst, der skal stå klar i feltet —
 *  søgefeltet (/soeg.js) sender det, man ledte forgæves efter, med. */
function nytSpil(udkast) {
  skriv({
    slags: 'nyt', spil: null,
    titel: 'Foreslå et nyt spil',
    under: 'Beskriv spillet: hvad går det ud på, hvordan spiller man, og hvorfor er det sjovt?',
    plads: 'Fx: et spil hvor man fanger faldende stjerner med en kurv, og det går hurtigere og hurtigere…',
    sendTekst: 'Send idé',
    takTekst: 'Din idé er gemt. Måske er den næste spil på zydy.dk!',
  }, udkast);
}

/* ---------- Sådan sættes det på siden ---------- */

function knapUnderKortene() {
  document.querySelectorAll('#apps li[data-spil]').forEach(li => {
    if (li.querySelector('.id-oenske')) return;
    const titel = (li.querySelector('h2') || {}).textContent || 'spillet';
    const knap = el('button', 'id-oenske', 'Mangler der noget?');
    knap.type = 'button';
    knap.setAttribute('aria-label', 'Mangler der noget i ' + titel + '?');
    knap.addEventListener('click', () => oenske(li.dataset.spil, titel));
    li.appendChild(knap);
  });
}

/** Kortet ligger uden for <ul>, så forsidens sortering efter popularitet ikke flytter det op. */
function nytSpilKort() {
  const apps = document.getElementById('apps');
  if (!apps || document.getElementById('nytSpilKort')) return;
  const knap = el('button', 'app id-nyt');
  knap.type = 'button';
  knap.id = 'nytSpilKort';

  const ikon = el('span', 'icon id-plus');
  ikon.setAttribute('aria-hidden', 'true');
  ikon.textContent = '+';
  knap.appendChild(ikon);

  const tekst = el('span', 'text');
  tekst.appendChild(el('h2', null, 'Nyt spil?'));
  tekst.appendChild(el('p', null, 'Har du en idé til et spil, vi skal lave? Fortæl om det her.'));
  knap.appendChild(tekst);

  const pil = el('span', 'go', '›');
  pil.setAttribute('aria-hidden', 'true');
  knap.appendChild(pil);

  knap.addEventListener('click', () => nytSpil());   // uden argument: tomt felt, ikke selve klikket
  apps.insertAdjacentElement('afterend', knap);
}

/* ---------- Stil ---------- */

const css = `
/* Navneknappen i toppen */
.navn-knap{display:inline-flex;align-items:baseline;gap:8px;margin-top:12px;font:inherit;cursor:pointer;
  background:rgba(255,255,255,.07);color:var(--text,#fff7e6);border:0;border-radius:999px;padding:8px 16px;min-height:40px}
.navn-knap:hover{background:rgba(255,255,255,.13)}
.navn-knap:focus-visible{outline:3px solid var(--sun,#ffd447);outline-offset:3px}
.navn-knap.tom{background:rgba(255,212,71,.14);color:var(--sun,#ffd447)}
.navn-knap .id-hej{font-weight:800;font-size:16px}
.navn-knap .id-skift{font-size:13px;color:var(--muted,#a9acd6)}
.navn-knap.tom .id-skift{color:var(--sun,#ffd447);opacity:.8}

/* "Mangler der noget?" under hvert kort */
#apps li[data-spil]{display:flex;flex-direction:column}
.id-oenske{align-self:flex-end;margin:6px 8px 0;background:none;border:0;cursor:pointer;
  font:inherit;font-size:13px;color:var(--muted,#a9acd6);text-decoration:underline;padding:6px 8px;min-height:34px}
.id-oenske:hover{color:var(--sun,#ffd447)}
.id-oenske:focus-visible{outline:2px solid var(--sun,#ffd447);outline-offset:2px;border-radius:8px}

/* "Nyt spil?"-kortet: samme form som de andre, men stiplet og uden farve */
.id-nyt{display:flex;width:100%;margin-top:14px;text-align:left;cursor:pointer;font:inherit;
  background:transparent;border:2px dashed rgba(255,255,255,.22);color:var(--muted,#a9acd6)}
.id-nyt:hover{background:rgba(255,255,255,.05);border-color:var(--sun,#ffd447);color:var(--text,#fff7e6)}
.id-nyt .text h2{color:var(--text,#fff7e6)}
.id-plus{display:grid;place-items:center;font-size:44px;font-weight:800;color:var(--sun,#ffd447);
  background:rgba(255,212,71,.12);box-shadow:none;line-height:1}
.id-nyt .go{background:rgba(255,212,71,.2);color:var(--sun,#ffd447)}

/* Dialogen */
.id-dlg{border:0;padding:0;background:transparent;color:var(--text,#fff7e6);max-width:min(520px,calc(100vw - 32px));width:100%}
.id-dlg::backdrop{background:rgba(6,8,20,.72)}
.id-indhold{background:var(--bg2,#1b1f42);border-radius:26px;padding:24px 22px calc(20px + env(safe-area-inset-bottom));
  box-shadow:0 24px 60px rgba(0,0,0,.5)}
.id-titel{margin:0 0 6px;font-size:24px;line-height:1.15;letter-spacing:-.5px;font-weight:800}
.id-under{margin:0 0 14px;color:var(--muted,#a9acd6);font-size:15px;line-height:1.35}
.id-form{display:block}
.id-input,.id-tekst{font:inherit;width:100%;padding:14px;border-radius:16px;border:2px solid transparent;
  background:rgba(255,255,255,.08);color:var(--text,#fff7e6);outline:none;-webkit-user-select:text;user-select:text}
.id-input{font-size:20px;font-weight:700;text-align:center}
.id-tekst{font-size:17px;line-height:1.4;resize:vertical;min-height:120px}
.id-input:focus,.id-tekst:focus{border-color:var(--sun,#ffd447)}
.id-input::placeholder,.id-tekst::placeholder{color:var(--muted,#a9acd6);font-weight:500}
.id-fra{margin:10px 0 0;color:var(--muted,#a9acd6);font-size:14px}
.id-link{background:none;border:0;padding:0;font:inherit;font-size:14px;color:var(--sun,#ffd447);
  text-decoration:underline;cursor:pointer}
.id-status{color:var(--muted,#a9acd6);font-size:15px;margin:8px 0 0;min-height:1.2em}
.id-knapper{display:flex;gap:10px;margin-top:14px}
.id-knap{flex:1;font:inherit;font-size:17px;font-weight:800;border:0;border-radius:16px;padding:14px;min-height:52px;cursor:pointer}
.id-fortryd{background:rgba(255,255,255,.09);color:var(--text,#fff7e6)}
.id-send{background:var(--sun,#ffd447);color:#1c1f4a}
.id-send[disabled]{opacity:.6}
.id-knap:focus-visible{outline:3px solid var(--sun,#ffd447);outline-offset:3px}
`;
const style = document.createElement('style');
style.textContent = css;
document.head.appendChild(style);

/* ---------- Start ---------- */

function start() {
  const knap = document.getElementById('navnKnap');
  if (knap) knap.addEventListener('click', () => spoergOmNavn(false));
  tegnNavneknap();
  knapUnderKortene();
  nytSpilKort();
  // Første besøg: spørg om navnet med det samme, så spillene kender det bagefter.
  if (!navn.hent() && !laes(KEY_SPURGT)) setTimeout(() => spoergOmNavn(true), 400);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();

window.Ideer = { navn, spoergOmNavn, oenske, nytSpil, send };
})();
