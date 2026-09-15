/*
  Kapløb: «man kan joine hinanden i alle spil».

  To venner spiller det samme spil på hver sin telefon, i det samme rum, og
  stillingen står i en lille pille øverst på skærmen: «🏁 Du 420 · 👑 Selma 560».
  Den bedste runde tæller, og man må spille så mange runder man vil.

  Et spil kommer med sådan her — to linjer i <head> eller nederst ved de andre
  scripts (rum.js skal stå først, den er en almindelig fil og kører før):

    <script src="/spil/rum.js"></script>
    <script type="module" src="/spil/kaploeb.js"></script>

  og ét kald, hver gang en runde er slut (samme sted som Highscore-kaldet):

    if (window.Kaploeb) Kaploeb.slut(score, '420 m');       // flest vinder
    if (window.Kaploeb) Kaploeb.slut(sek, tidTekst(sek), 'asc');   // hurtigst vinder

  Resten passer sig selv: er der ikke noget ?rum=<kode> i adressen, sker der
  ingenting overhovedet, og spillet er som det plejer. Er der, henter vi rummet,
  hopper med (gæsten), viser pillen og skriver vores egen halvdel op i rummet.

  Regnestykkerne ligger i kaploeb-regler.mjs, så de kan testes uden browser.
*/
import {
  laes, side, tomSide, medRunde, medMig, flet, mangler, stilling,
  pilleTekst, rundeTekst, runderTekst, vis,
} from './kaploeb-regler.mjs';

const FREMHAEV_MS = 6000;      // hvor længe pillen lyser efter en runde
const FLUSH_MS = 3000;         // hvor tit vi prøver at få en score af sted, der ikke kom op

const kode = window.Rum ? Rum.kode() : null;

let rum = null;                // sidste svar fra /api/rum/<kode>
let retning = 'desc';          // 'asc' = laveste score vinder (tider)
let min = tomSide();           // min egen halvdel – den er jeg selv herre over
let gemmer = false;            // ét gem ad gangen, så vi ikke skriver oven i os selv
let pille = null, dlg = null, lyser = 0, flushTimer = null, stopFoelg = null;

/* ---------- Skærm ---------- */

const el = (tag, cls, tekst) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (tekst != null) e.textContent = tekst;
  return e;
};

const knap = (cls, tekst, naar) => {
  const b = el('button', cls, tekst);
  b.type = 'button';
  b.addEventListener('click', naar);
  return b;
};

/** Stillingen som jeg ser den lige nu. Min egen halvdel er altid den lokale:
 *  den er skrevet her på telefonen og er derfor aldrig bagud. */
function stand() {
  const rolle = rum ? rum.rolle : 'vaert';
  return stilling(medMig(rum ? rum.tilstand : null, rolle, min), rolle, retning);
}

function tegn() {
  if (!rum) return;
  if (!pille) {
    pille = knap('kap-pille', '', aabnPanel);
    pille.setAttribute('aria-label', 'Kapløbet: se stillingen');
    document.body.appendChild(pille);
  }
  pille.textContent = pilleTekst(stand(), rum.modspiller || 'vennen', rum.status);
  pille.classList.toggle('kap-lyser', Date.now() < lyser);
  pille.classList.toggle('kap-slut', rum.status === 'slut');
  if (dlg && dlg.open) tegnPanel();
}

/** Pillen lyser et stykke tid, når der er sket noget – ellers overses den. */
function blink() {
  lyser = Date.now() + FREMHAEV_MS;
  tegn();
  setTimeout(tegn, FREMHAEV_MS + 50);
}

function tegnPanel() {
  const st = stand(), hvem = rum.modspiller || 'vennen';
  const rod = dlg.firstChild;
  rod.innerHTML = '';
  rod.appendChild(el('h2', 'kap-titel', '🏁 Kapløb mod ' + hvem));
  rod.appendChild(el('p', 'kap-under', rundeTekst(st, hvem, rum.status)));

  const liste = el('div', 'kap-liste');
  [['Du', st.min, 'mig'], [hvem, st.hans, 'ham']].forEach(([navn, s, rolle]) => {
    const r = el('div', 'kap-raekke' + (st.foerer === rolle ? ' kap-foerer' : ''));
    const b = el('span', 'kap-navn-boks');
    b.appendChild(el('span', 'kap-navn', (st.foerer === rolle ? '👑 ' : '') + navn));
    b.appendChild(el('span', 'kap-runder', runderTekst(s)));
    r.appendChild(b);
    r.appendChild(el('span', 'kap-score', vis(s)));
    liste.appendChild(r);
  });
  rod.appendChild(liste);
  rod.appendChild(el('p', 'kap-hint', 'I spiller hver for sig – den bedste runde tæller. Spil løs!'));

  const raekke = el('div', 'kap-knapper');
  raekke.appendChild(knap('kap-knap kap-vigtig', 'Spil videre', () => dlg.close()));
  raekke.appendChild(knap('kap-knap', rum.status === 'slut' ? 'Luk kapløbet' : 'Stop kapløbet', stop));
  rod.appendChild(raekke);
  const hjem = el('a', 'kap-hjem', 'Til forsiden');
  hjem.href = '/';
  rod.appendChild(hjem);
}

function aabnPanel() {
  if (!rum) return;
  if (!dlg) {
    dlg = el('dialog', 'kap-dlg');
    dlg.appendChild(el('div', 'kap-indhold'));
    dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
    document.body.appendChild(dlg);
  }
  tegnPanel();
  if (!dlg.open) dlg.showModal();
}

/** Ud af kapløbet: vennen får besked, og adressen mister sin ?rum, så en
 *  genindlæsning bare er det almindelige spil. */
function stop() {
  if (dlg && dlg.open) dlg.close();
  if (stopFoelg) { stopFoelg(); stopFoelg = null; }
  if (flushTimer) { clearInterval(flushTimer); flushTimer = null; }
  if (rum && rum.status !== 'slut') Rum.forlad(kode).catch(() => {});
  rum = null;
  if (pille) { pille.remove(); pille = null; }
  try {
    const url = new URL(location.href);
    url.searchParams.delete('rum');
    history.replaceState(null, '', url.pathname + (url.search || '') + url.hash);
  } catch (e) { /* så står koden bare i adressen */ }
}

/* ---------- Rummet ---------- */

/** Min halvdel op i rummet. Kommer den anden os i forkøbet, skriver vi igen. */
async function gemMin() {
  if (gemmer || !rum || !kode) return;
  gemmer = true;
  try {
    for (let i = 0; i < 4; i++) {
      // Der kan først skrives, når begge er kommet ind. Indtil da venter scoren her.
      if (!rum || rum.status !== 'igang') break;
      const svar = await Rum.gem(kode, medMig(rum.tilstand, rum.rolle, min), rum.version);
      rum = svar.rum;
      min = flet(min, laes(rum.tilstand)[rum.rolle], retning);
      if (!svar.uaendret) break;
    }
  } catch (e) { /* prøver igen ved næste tik */ }
  gemmer = false;
  tegn();
}

/** Nyt svar fra serveren: den andens halvdel er ny, min egen fletter vi med. */
function fraServer(nyt, blinkVedNyt) {
  const foer = rum;
  rum = nyt;
  min = flet(min, laes(rum.tilstand)[rum.rolle], retning);
  const hansFoer = foer ? laes(foer.tilstand)[rum.rolle === 'vaert' ? 'gaest' : 'vaert'] : side(null);
  const hansNu = laes(rum.tilstand)[rum.rolle === 'vaert' ? 'gaest' : 'vaert'];
  if (blinkVedNyt && (hansNu.runder !== hansFoer.runder || (foer && foer.status !== rum.status))) blink();
  else tegn();
  if (mangler(min, laes(rum.tilstand)[rum.rolle])) gemMin();
}

async function start() {
  let foerste;
  try { foerste = await Rum.hent(kode); } catch (e) { return; }   // ikke mit rum, eller for gammelt
  // Gæsten hopper med det samme med: så kan begge spille uden at vente på noget.
  if (foerste.rolle === 'gaest' && foerste.status === 'inviteret') {
    try { foerste = await Rum.kom(kode); } catch (e) { /* så prøver vi ved næste tik */ }
  }
  fraServer(foerste, false);
  blink();
  stopFoelg = Rum.foelg(kode, r => fraServer(r, true));
  // Foelg melder kun fra, når rummet har flyttet sig – en score, der ikke kom op
  // (fordi vennen ikke var hoppet med endnu), skal vi selv prøve igen med.
  flushTimer = setInterval(() => {
    if (document.visibilityState !== 'visible' || !rum) return;
    if (mangler(min, laes(rum.tilstand)[rum.rolle])) gemMin();
  }, FLUSH_MS);
}

/* ---------- Det spillene kalder ---------- */

/**
 * En runde er slut. `tekst` er scoren som den skal stå på skærmen («420 m»,
 * «1:23»), og `nyRetning` er 'asc' i de spil, hvor den laveste score vinder.
 */
function slut(score, tekst, nyRetning) {
  if (nyRetning === 'asc' || nyRetning === 'desc') retning = nyRetning;
  if (!rum || !kode) return false;
  const tal = Math.round(Number(score));
  if (!Number.isFinite(tal)) return false;
  min = medRunde(min, tal, tekst, retning);
  blink();
  gemMin();
  return true;
}

/* ---------- Stil ---------- */

const css = `
/* Pillen ligger oven på spillets egen top – derfor så lille som den kan læses i.
   Den er der kun, mens man er i et kapløb. */
.kap-pille{position:fixed;left:50%;top:calc(env(safe-area-inset-top,0px) + 3px);transform:translateX(-50%);
  z-index:2147483000;max-width:84vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
  font:inherit;font-size:12.5px;font-weight:800;line-height:1;cursor:pointer;border:0;
  padding:7px 11px;min-height:29px;border-radius:999px;background:rgba(14,16,40,.82);color:#fff7e6;
  box-shadow:0 2px 10px rgba(0,0,0,.35);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px)}
.kap-pille:focus-visible{outline:3px solid #ffd447;outline-offset:2px}
.kap-lyser{background:#ffd447;color:#1c1f4a;animation:kap-puls 1.6s ease-in-out infinite}
.kap-slut{background:rgba(255,92,122,.9);color:#fff}
/* Pulsen ligger i glødet og ikke i en scale(): pillen er en knap, man skal kunne
   ramme, mens den lyser – og en knap, der bliver ved med at ændre størrelse,
   hopper både under fingeren og under en test, der venter på, at den står stille. */
@keyframes kap-puls{0%,100%{box-shadow:0 2px 10px rgba(0,0,0,.35)}
  50%{box-shadow:0 0 0 7px rgba(255,212,71,.32),0 2px 10px rgba(0,0,0,.35)}}
@media (prefers-reduced-motion:reduce){.kap-lyser{animation:none}}

.kap-dlg{border:0;padding:0;background:none;color:#fff7e6;max-width:min(92vw,380px);width:100%}
.kap-dlg::backdrop{background:rgba(6,8,24,.72)}
.kap-indhold{background:#1b1f42;border-radius:24px;padding:18px 20px;text-align:left;
  font:inherit;font-size:16px;box-shadow:0 18px 50px rgba(0,0,0,.5)}
.kap-titel{margin:0;font-size:20px;font-weight:800}
.kap-under{margin:6px 0 0;font-size:15px;color:#ffd447;font-weight:700}
.kap-liste{margin:14px 0 0;display:flex;flex-direction:column;gap:8px}
.kap-raekke{display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:16px;
  background:rgba(255,255,255,.07)}
.kap-foerer{background:rgba(255,212,71,.16)}
.kap-navn-boks{flex:1;display:flex;flex-direction:column;line-height:1.15;min-width:0}
.kap-navn{font-weight:800;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.kap-runder{font-size:12px;color:#a9acd6}
.kap-score{font-weight:800;font-variant-numeric:tabular-nums}
.kap-hint{margin:12px 0 0;font-size:13px;color:#a9acd6}
.kap-knapper{display:flex;gap:8px;margin-top:16px}
.kap-knap{flex:1;font:inherit;font-size:15px;font-weight:700;cursor:pointer;border:0;border-radius:999px;
  padding:12px 14px;min-height:46px;background:rgba(255,255,255,.09);color:#fff7e6}
.kap-vigtig{background:#ffd447;color:#1c1f4a}
.kap-hjem{display:block;margin:12px 0 0;text-align:center;font-size:14px;color:#a9acd6}
`;
const style = document.createElement('style');
style.textContent = css;
document.head.appendChild(style);

window.Kaploeb = {
  slut,
  stop,
  aktiv: () => !!rum,
  kode: () => kode,
  /** Til testene: stillingen som skærmen ser den. */
  stand: () => (rum ? { status: rum.status, modspiller: rum.modspiller, ...stand() } : null),
};

if (kode && window.Rum) start();
