/*
  «Nyt på Zydy» – listen over hvad der er lavet på siden. Klassisk script,
  ingen build:

    <script src="/nyheder.js" defer></script>     (efter /ideer.js)

  Selve listen står i /nyheder.json, nyeste først. Hver linje fortæller
  hvornår, hvad der blev lavet, hvilket spil det handler om, og hvem der havde
  ønsket sig det — for næsten alt her på siden er bygget, fordi nogen skrev et
  ønske i «Mangler der noget?».

  Knappen i toppen lyser op, når der er kommet noget til, siden man sidst
  kiggede: hver nyhed har et nummer (`nr`), og det højeste, man har set, huskes
  i localStorage under 'zydy.nyheder.set' — det er «hvilken version jeg sidst
  har set». Er der intet gemt (første besøg), er alt nyt. Listen begynder
  2026-09-12; det, der blev lavet før, står kun i git.

  Spillenes navne og links slår vi op i kortene på forsiden, så et spil kun
  hedder noget ét sted. Alt fejler stille: kan filen ikke hentes, er der ingen
  knap, og siden ser ud som før.

  Tilføj en nyhed: læg et objekt øverst i public/nyheder.json med nr = det
  højeste + 1. Se README «Nyt på Zydy».
*/
(function () {
'use strict';

const FIL = '/nyheder.json';
const KEY = 'zydy.nyheder.set';      // højeste nr man har set

const laes = () => { try { return parseInt(localStorage.getItem(KEY), 10) || 0; } catch (e) { return 0; } };
const gem = n => { try { localStorage.setItem(KEY, String(n)); } catch (e) {} };

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};

let nyheder = [];                    // som i filen: nyeste først
let set = laes();                    // hvad vi havde set, da siden blev åbnet
let dlg = null, knap = null;

/* ---------- Datoen, skrevet som man siger den ---------- */

const dagensDato = () => {
  const d = new Date();
  return [d.getFullYear(), d.getMonth() + 1, d.getDate()];
};

/** '2026-09-12' → 'i dag', 'i går' eller '12. september' (med årstal hvis det er et andet år). */
function skrivDato(iso) {
  const dele = String(iso || '').split('-').map(Number);
  if (dele.length !== 3 || dele.some(isNaN)) return '';
  const [aar, maaned, dag] = dele;
  const [nuAar, nuMaaned, nuDag] = dagensDato();
  const doegn = Math.round((Date.UTC(nuAar, nuMaaned - 1, nuDag) - Date.UTC(aar, maaned - 1, dag)) / 86400000);
  if (doegn === 0) return 'i dag';
  if (doegn === 1) return 'i går';
  const dato = new Date(aar, maaned - 1, dag);
  try {
    return dato.toLocaleDateString('da-DK', aar === nuAar
      ? { day: 'numeric', month: 'long' }
      : { day: 'numeric', month: 'long', year: 'numeric' });
  } catch (e) { return dag + '/' + maaned; }
}

/* ---------- Knappen i toppen ---------- */

function uset() { return nyheder.filter(n => n.nr > set).length; }

function tegnKnap() {
  if (!knap) return;
  const antal = uset();
  knap.innerHTML = '';
  knap.classList.toggle('ny-lyser', antal > 0);
  knap.appendChild(el('span', 'ny-ikon', '✨'));
  knap.appendChild(el('span', 'ny-tekst', 'Nyt på Zydy'));
  if (antal > 0) knap.appendChild(el('span', 'ny-antal', antal === 1 ? '1 ny' : antal + ' nye'));
  knap.setAttribute('aria-label', antal > 0
    ? 'Nyt på Zydy – ' + antal + (antal === 1 ? ' ny ting' : ' nye ting') + ' siden sidst'
    : 'Nyt på Zydy – se hvad vi har lavet');
}

function sikrKnap() {
  if (knap) return;
  const hoved = document.querySelector('header');
  if (!hoved) return;
  knap = el('button', 'ny-knap');
  knap.type = 'button';
  knap.id = 'nyhedKnap';
  knap.addEventListener('click', aabn);
  const navneknap = document.getElementById('navnKnap');
  if (navneknap) navneknap.insertAdjacentElement('afterend', knap);
  else hoved.appendChild(knap);
}

/* ---------- Listen ---------- */

/** Spillets navn og link hentes fra kortet på forsiden, så det kun står ét sted. */
function spilKort(id) {
  if (!id) return null;
  const li = document.querySelector('#apps li[data-spil="' + id + '"]');
  if (!li) return null;
  const h2 = li.querySelector('h2');
  const a = li.querySelector('a');
  return h2 && a ? { navn: h2.textContent, url: a.getAttribute('href') } : null;
}

function tegnNyhed(n, erNy) {
  const rad = el('li', 'ny-rad' + (erNy ? ' ny-frisk' : ''));

  const top = el('div', 'ny-top');
  if (erNy) top.appendChild(el('span', 'ny-mark', 'NYT'));
  top.appendChild(el('span', 'ny-dato', skrivDato(n.dato)));
  rad.appendChild(top);

  rad.appendChild(el('h3', 'ny-titel', n.titel));
  rad.appendChild(el('p', 'ny-hvad', n.hvad));

  const fod = el('p', 'ny-fod');
  const kort = spilKort(n.spil);
  if (kort) {
    const link = el('a', 'ny-spil', kort.navn);
    link.href = kort.url;
    fod.appendChild(link);
  } else {
    fod.appendChild(el('span', 'ny-spil ny-hele', 'Hele siden'));
  }
  if (n.oensket) fod.appendChild(el('span', 'ny-oensket', 'ønsket af ' + n.oensket));
  rad.appendChild(fod);
  return rad;
}

function aabn() {
  if (!nyheder.length) return;
  const friske = new Set(nyheder.filter(n => n.nr > set).map(n => n.nr));

  if (!dlg) {
    dlg = el('dialog', 'ny-dlg');
    dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
    document.body.appendChild(dlg);
  }
  dlg.innerHTML = '';
  const kasse = el('div', 'ny-indhold');
  kasse.appendChild(el('h2', 'ny-overskrift', 'Nyt på Zydy'));
  kasse.appendChild(el('p', 'ny-under',
    friske.size ? 'Det med gult er kommet til, siden du sidst var inde.'
                : 'Alt det vi har lavet – og hvem der ønskede sig det.'));

  const liste = el('ul', 'ny-liste');
  nyheder.forEach(n => liste.appendChild(tegnNyhed(n, friske.has(n.nr))));
  kasse.appendChild(liste);

  const luk = el('button', 'ny-luk', 'Luk');
  luk.type = 'button';
  luk.addEventListener('click', () => dlg.close());
  kasse.appendChild(luk);
  dlg.appendChild(kasse);
  dlg.showModal();

  // Set nu: mærkaterne bliver stående, mens man kigger, men knappen holder op
  // med at lyse med det samme – ellers ser det ud som om man overså noget.
  const hoejeste = nyheder.reduce((m, n) => Math.max(m, n.nr), 0);
  if (hoejeste > set) { set = hoejeste; gem(set); }
  tegnKnap();
  setTimeout(() => luk.focus({ preventScroll: true }), 50);
}

/* ---------- Stil ---------- */

const css = `
.ny-knap{display:inline-flex;align-items:center;gap:8px;margin:12px 4px 0;font:inherit;cursor:pointer;
  background:rgba(255,255,255,.07);color:var(--text,#fff7e6);border:0;border-radius:999px;padding:8px 16px;min-height:40px}
.ny-knap:hover{background:rgba(255,255,255,.13)}
.ny-knap:focus-visible{outline:3px solid var(--sun,#ffd447);outline-offset:3px}
.ny-knap .ny-tekst{font-weight:800;font-size:16px}
.ny-knap.ny-lyser{background:rgba(255,212,71,.16);color:var(--sun,#ffd447);animation:ny-puls 2.4s ease-in-out infinite}
.ny-antal{font-size:13px;font-weight:800;color:#1c1f4a;background:var(--sun,#ffd447);border-radius:999px;padding:2px 9px}
@keyframes ny-puls{0%,100%{box-shadow:0 0 0 0 rgba(255,212,71,0)}50%{box-shadow:0 0 0 6px rgba(255,212,71,.16)}}

.ny-dlg{border:0;padding:0;background:transparent;color:var(--text,#fff7e6);
  max-width:min(540px,calc(100vw - 24px));width:100%}
.ny-dlg::backdrop{background:rgba(6,8,20,.72)}
.ny-indhold{background:var(--bg2,#1b1f42);border-radius:26px;padding:22px 18px calc(18px + env(safe-area-inset-bottom));
  box-shadow:0 24px 60px rgba(0,0,0,.5)}
.ny-overskrift{margin:0 0 4px;font-size:24px;line-height:1.15;letter-spacing:-.5px;font-weight:800}
.ny-under{margin:0 0 14px;color:var(--muted,#a9acd6);font-size:15px;line-height:1.35}
.ny-liste{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px;
  max-height:min(60vh,460px);overflow:auto;-webkit-overflow-scrolling:touch}
.ny-rad{background:rgba(255,255,255,.06);border-radius:18px;padding:14px 16px;border:2px solid transparent}
.ny-rad.ny-frisk{background:rgba(255,212,71,.12);border-color:rgba(255,212,71,.5)}
.ny-top{display:flex;align-items:center;gap:8px;margin-bottom:4px}
.ny-mark{font-size:12px;font-weight:800;letter-spacing:.5px;color:#1c1f4a;background:var(--sun,#ffd447);
  border-radius:999px;padding:2px 8px}
.ny-dato{font-size:13px;color:var(--muted,#a9acd6);font-weight:700}
.ny-titel{margin:0 0 4px;font-size:18px;line-height:1.2;font-weight:800}
.ny-hvad{margin:0;font-size:15px;line-height:1.4;color:var(--text,#fff7e6);opacity:.92}
.ny-fod{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:10px 0 0;font-size:13px}
.ny-spil{font-weight:800;color:var(--sun,#ffd447);background:rgba(255,212,71,.12);border-radius:999px;
  padding:3px 10px;text-decoration:none}
.ny-spil.ny-hele{color:var(--muted,#a9acd6);background:rgba(255,255,255,.07)}
a.ny-spil:hover{background:rgba(255,212,71,.24)}
.ny-oensket{color:var(--muted,#a9acd6)}
.ny-luk{width:100%;margin-top:14px;font:inherit;font-size:17px;font-weight:800;border:0;border-radius:16px;
  padding:14px;min-height:52px;cursor:pointer;background:var(--sun,#ffd447);color:#1c1f4a}
.ny-luk:focus-visible{outline:3px solid var(--sun,#ffd447);outline-offset:3px}
@media (prefers-reduced-motion:reduce){ .ny-knap.ny-lyser{animation:none} }
`;
const style = document.createElement('style');
style.textContent = css;
document.head.appendChild(style);

/* ---------- Start ---------- */

async function start() {
  try {
    const svar = await fetch(FIL, { cache: 'no-cache' });
    if (!svar.ok) return;
    const data = await svar.json();
    nyheder = (data.nyheder || []).filter(n => n && typeof n.nr === 'number');
    nyheder.sort((a, b) => b.nr - a.nr);
  } catch (e) { return; }         // ingen liste, ingen knap – siden virker som før
  if (!nyheder.length) return;
  sikrKnap();
  tegnKnap();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();

window.Nyheder = { aabn, uset: () => uset(), alle: () => nyheder, skrivDato };
})();
