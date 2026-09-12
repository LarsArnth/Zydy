/*
  Fælles aktivitets-klient for zydy.dk. Klassisk script, ingen build:

    <script src="/spil/aktivitet.js" data-spil="taarn"></script>
    <script src="/spil/aktivitet.js" data-spil="forsiden"></script>   (selve forsiden)

  Ved indlæsning sendes én "start" til /api/aktivitet/<spil> (tæller i
  forsidens popularitet), og derefter et heartbeat hvert 30. sekund, så længe
  siden er synlig, så forsiden kan vise hvem der er her lige nu. Når siden
  lukkes, meldes der fra. Klient-id'et er tilfældigt og ligger i sessionStorage.

  Livstegnet tager navnet med, hvis man har skrevet det på forsiden
  (localStorage 'zydy.navn' – samme nøgle som toplisterne bruger), så de andre
  kan se hvem der er her. Navnet læses ved hvert kald, så det følger med, hvis
  det bliver skrevet eller skiftet undervejs; 'zydy:navn'-hændelsen fra
  /ideer.js sender et livstegn med det samme, så man ikke skal vente 30 sek.
  Uden navn tæller man med som anonym.

  Alt fejler stille: uden netværk eller API sker der bare ingenting.
  window.Aktivitet = { spil, klient, aktive, nu() } er til tests og til
  forsiden (aktive = seneste svar, nu() sender et livstegn med det samme).
*/
(function () {
'use strict';

const script = document.currentScript;
const spil = script && script.dataset.spil;
if (!spil) return;

const API = '/api/aktivitet/' + spil;
const INTERVAL = 30_000;
const KEY = 'zydy.klient';
const KEY_NAVN = 'zydy.navn';        // fælles med /ideer.js og /spil/highscore.js

function klientId() {
  let id = null;
  try { id = sessionStorage.getItem(KEY); } catch (e) {}
  if (!id || !/^[a-z0-9]{6,40}$/.test(id)) {
    id = Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
    try { sessionStorage.setItem(KEY, id); } catch (e) {}
  }
  return id;
}
function navn() {
  try { return localStorage.getItem(KEY_NAVN) || ''; } catch (e) { return ''; }
}
const klient = klientId();
const A = window.Aktivitet = { spil, klient, aktive: null, sendt: 0, nu: () => send() };

async function send(ekstra) {
  A.sendt++;
  try {
    const r = await fetch(API, {
      method: 'POST', keepalive: true,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(Object.assign({ klient, navn: navn() }, ekstra || {})),
    });
    if (r.ok) { const d = await r.json(); if (d && typeof d.aktive === 'number') A.aktive = d.aktive; }
  } catch (e) { /* ingen forbindelse – pyt */ }
}

let timer = null;
function start() { if (!timer) timer = setInterval(() => send(), INTERVAL); }
function stop() { if (timer) { clearInterval(timer); timer = null; } }

send({ ny: true });
start();

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') { send(); start(); }
  else stop();
});
window.addEventListener('pagehide', () => { stop(); send({ slut: true }); });

// Navnet blev skrevet eller skiftet på forsiden: meld det med det samme, og sig
// til bagefter, så forsiden kan hente en frisk oversigt med det nye navn i.
document.addEventListener('zydy:navn', () => {
  send().then(() => document.dispatchEvent(new CustomEvent('zydy:aktivitet')));
});
})();
