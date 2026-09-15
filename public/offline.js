/*
  «Spil uden internet» – panelet nederst på forsiden, og det der tænder
  service workeren (public/sw.js). Klassisk script, ingen build:

    <script src="/offline.js" defer></script>

  Selmas ønske #56 lød «Gør at appen ikke koster internet». Det er læst som to
  ting, der hænger sammen: spillene skal virke, når der ikke er wifi, og de
  skal ikke koste data forfra hver eneste gang.

  Service workeren klarer det hele; her er kun knapperne og teksten:

    «📥 Hent alle spil»   henter alle 34 spil ned på én gang, med en tæller
                          undervejs. Ét tryk på wifi, og så er man fri.
    «✨ Der er noget nyt»  når der er kommet en ny version, mens man var her.
    «Fjern fra telefonen» hvis man vil have pladsen tilbage.

  Alt fejler stille: kan browseren ikke service workers (gammel iOS, privat
  vindue), er der ikke noget panel, og siden ser ud præcis som før.

  Filerne, der hentes, står i /offline-filer.json, som genereres af
  scripts/byg-forside.mjs — et nyt spil kommer med af sig selv.
*/
(function () {
'use strict';

if (!('serviceWorker' in navigator)) return;

const MB = 1024 * 1024;

let sw = null;                  // den registrerede service worker
let sidste = null;              // sidste status fra den
let panel = null, tekst = null, knap = null, linje = null, ekstra = null;
let henter = null;              // { hentet, ialt } mens der hentes

/* ---------- Panelet ---------- */

const el = (tag, cls, txt) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (txt != null) e.textContent = txt;
  return e;
};

/** Laver panelet, første gang der er noget at vise. */
function sikrPanel() {
  if (panel) return panel;
  const vaert = document.getElementById('offline');
  if (!vaert) return null;
  panel = el('div', 'off-kort');
  const top = el('div', 'off-top');
  top.appendChild(el('span', 'off-ikon', '📴'));
  const midt = el('div', 'off-midt');
  tekst = el('div', 'off-titel');
  linje = el('div', 'off-under');
  midt.appendChild(tekst);
  midt.appendChild(linje);
  top.appendChild(midt);
  panel.appendChild(top);
  knap = el('button', 'off-knap');
  knap.type = 'button';
  panel.appendChild(knap);
  ekstra = el('button', 'off-lille');
  ekstra.type = 'button';
  panel.appendChild(ekstra);
  vaert.appendChild(panel);
  return panel;
}

/** Skriver panelet ud fra den seneste status. */
function tegn() {
  if (!sikrPanel()) return;
  const s = sidste || {};
  const paaNettet = navigator.onLine !== false;

  knap.hidden = true;
  ekstra.hidden = true;
  knap.disabled = false;
  panel.classList.toggle('off-klar', !!s.alt);

  if (henter) {
    // Undervejs. Tælleren er det eneste, børnene kigger på.
    const pct = henter.ialt ? Math.round((henter.hentet / henter.ialt) * 100) : 0;
    tekst.textContent = 'Henter spillene ned …';
    linje.textContent = `${henter.hentet} af ${henter.ialt} filer · ${pct}%`;
    knap.hidden = false;
    knap.disabled = true;
    knap.textContent = pct + ' %';
    return;
  }

  if (!paaNettet) {
    tekst.textContent = '📴 Du er uden internet';
    linje.textContent = s.alt
      ? 'Men alle spillene ligger på telefonen — spil løs.'
      : (s.klar ? 'Forsiden ligger på telefonen. De spil, du har været inde i, virker også.'
                : 'Der er ikke hentet noget ned endnu.');
    if (s.alt) panel.classList.add('off-klar');
    return;
  }

  if (s.alt) {
    tekst.textContent = '✅ Alle spil ligger på telefonen';
    linje.textContent = 'De virker uden internet og koster ikke data mere.';
    ekstra.hidden = false;
    ekstra.textContent = 'Fjern fra telefonen';
    ekstra.onclick = () => { if (sw) sw.postMessage({ type: 'glem' }); };
    return;
  }

  tekst.textContent = 'Spil uden internet';
  linje.textContent = 'Hent spillene hjem, mens du er på wifi. Så virker de i bilen og i sommerhuset — og koster ikke data bagefter.';
  knap.hidden = false;
  knap.textContent = '📥 Hent alle spil';
  knap.onclick = () => {
    if (!sw) return;
    henter = { hentet: 0, ialt: 0 };
    tegn();
    sw.postMessage({ type: 'hentAlt' });
  };
}

/** «Der er kommet noget nyt» — vises kun, når vi selv har hentet det ned. */
function visNyt() {
  if (!sikrPanel()) return;
  ekstra.hidden = false;
  ekstra.textContent = '✨ Der er noget nyt — hent siden igen';
  ekstra.onclick = () => location.reload();
}

/* ---------- Beskeder fra service workeren ---------- */

navigator.serviceWorker.addEventListener('message', e => {
  const d = e.data || {};
  if (d.type === 'henter') {
    henter = { hentet: d.hentet, ialt: d.ialt };
    tegn();
  } else if (d.type === 'status') {
    henter = null;
    sidste = d;
    tegn();
    if (d.nyVersion) visNyt();
  }
});

window.addEventListener('online', tegn);
window.addEventListener('offline', tegn);

/* ---------- Start ---------- */

async function start() {
  let reg;
  try {
    reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  } catch (e) { return; }                     // fx privat vindue – så er der bare ikke noget panel
  sw = reg.active || reg.waiting || reg.installing || navigator.serviceWorker.controller;
  await navigator.serviceWorker.ready.catch(() => {});
  sw = reg.active || navigator.serviceWorker.controller || sw;
  if (!sw) return;
  // Ét lille opslag: er der kommet en ny version? Det er den eneste netværks-
  // trafik, et gensyn med siden koster.
  sw.postMessage({ type: 'tjek' });
  sw.postMessage({ type: 'status' });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();

/* ---------- Stilen ---------- */

const css = `
#offline{margin-top:18px}
.off-kort{background:var(--bg2,#1b1f42);border-radius:var(--r,26px);padding:16px 18px}
.off-top{display:flex;gap:14px;align-items:flex-start}
.off-ikon{font-size:30px;line-height:1.1}
.off-midt{flex:1;min-width:0}
.off-titel{font-size:19px;font-weight:800;letter-spacing:-.3px}
.off-under{margin-top:4px;color:var(--muted,#a9acd6);font-size:15px;line-height:1.35}
.off-kort.off-klar .off-titel{color:#7cf0c0}
.off-knap{width:100%;margin-top:14px;font:inherit;font-size:17px;font-weight:800;border:0;border-radius:16px;
  padding:14px;min-height:52px;cursor:pointer;background:var(--sun,#ffd447);color:#1c1f4a}
.off-knap:disabled{background:rgba(255,212,71,.3);color:var(--text,#fff7e6);cursor:default}
.off-knap:focus-visible,.off-lille:focus-visible{outline:3px solid var(--sun,#ffd447);outline-offset:3px}
.off-lille{width:100%;margin-top:10px;font:inherit;font-size:15px;font-weight:700;border:0;border-radius:14px;
  padding:11px;min-height:44px;cursor:pointer;background:rgba(255,255,255,.07);color:var(--muted,#a9acd6)}
.off-lille:hover{background:rgba(255,255,255,.12)}
[hidden]{display:none!important}
`;
const style = document.createElement('style');
style.textContent = css;
document.head.appendChild(style);

window.Offline = {
  status: () => sidste,
  hentAlt: () => sw && sw.postMessage({ type: 'hentAlt' }),
  glem: () => sw && sw.postMessage({ type: 'glem' }),
  tjek: () => sw && sw.postMessage({ type: 'tjek' }),
};
})();
