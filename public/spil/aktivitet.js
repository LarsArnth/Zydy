/*
  Fælles aktivitets-klient for spillene på zydy.dk. Klassisk script, ingen build:

    <script src="/spil/aktivitet.js" data-spil="taarn"></script>

  Ved indlæsning sendes én "start" til /api/aktivitet/<spil> (tæller i
  forsidens popularitet), og derefter et heartbeat hvert 30. sekund, så længe
  siden er synlig, så forsiden kan vise hvor mange der spiller lige nu. Når
  siden lukkes, meldes der fra. Klient-id'et er tilfældigt og ligger i
  sessionStorage – der gemmes ingen navne og intet andet om spilleren.

  Alt fejler stille: uden netværk eller API sker der bare ingenting.
  window.Aktivitet = { spil, klient, aktive } er til tests (aktive = seneste svar).
*/
(function () {
'use strict';

const script = document.currentScript;
const spil = script && script.dataset.spil;
if (!spil) return;

const API = '/api/aktivitet/' + spil;
const INTERVAL = 30_000;
const KEY = 'zydy.klient';

function klientId() {
  let id = null;
  try { id = sessionStorage.getItem(KEY); } catch (e) {}
  if (!id || !/^[a-z0-9]{6,40}$/.test(id)) {
    id = Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
    try { sessionStorage.setItem(KEY, id); } catch (e) {}
  }
  return id;
}
const klient = klientId();
const A = window.Aktivitet = { spil, klient, aktive: null, sendt: 0 };

async function send(ekstra) {
  A.sendt++;
  try {
    const r = await fetch(API, {
      method: 'POST', keepalive: true,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(Object.assign({ klient }, ekstra || {})),
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
})();
