/*
  Spil sammen: den lille klient til /api/rum (src/rum.mjs), som et spil bruger,
  når to venner spiller med hinanden på hver sin telefon.

    <script src="/spil/rum.js"></script>      (før spillets eget script)

  Man kommer ind i et rum via adressen — forsiden sender vennerne herhen med
  ?rum=<kode>, når den ene har inviteret og den anden har trykket «Hop med».

    Rum.kode()                     koden fra adressen, eller null
    Rum.navn()                     mit navn ('zydy.navn', fælles med resten af siden)
    Rum.hent(kode)                 → rum
    Rum.kom(kode)                  → rum   (gæsten hopper med, så spillet går i gang)
    Rum.forlad(kode)               → rum   (jeg går – den anden får besked)
    Rum.gem(kode, tilstand, version)
        → { rum, uaendret }  uaendret: true betyder, at den anden nåede at skrive
          først; så er `rum` det, der faktisk står, og skærmen skal tegnes efter det.
    Rum.foelg(kode, naar)          kigger efter ændringer et par gange i sekundet;
                                   `naar(rum)` kaldes kun når noget har flyttet sig.
                                   Returnerer en funktion, der stopper igen.

  Et rum ser sådan ud, set fra den der spørger:

    { kode, spil, status: 'inviteret' | 'igang' | 'slut', version,
      tilstand,            spillets egen kasse (null indtil første træk)
      rolle: 'vaert' | 'gaest',   værten er den, der inviterede
      jeg, modspiller }    navnene, som de skal skrives på skærmen

  Serveren kender ikke spillets regler. Den passer kun på, at de to ikke skriver
  oven i hinanden: hver skrivning oplyser den version, den bygger på.
*/
(function () {
'use strict';

const API = '/api/rum';
const KEY_NAVN = 'zydy.navn';        // fælles med /ideer.js og /spil/highscore.js
const TIK_MS = 1200;                 // hvor tit vi kigger efter den andens træk

const navn = () => {
  try { return (localStorage.getItem(KEY_NAVN) || '').trim(); } catch (e) { return ''; }
};

/** Koden fra adressen: /spil/kryds/?rum=K7QFD */
function kode() {
  try {
    const k = (new URLSearchParams(location.search).get('rum') || '').trim().toUpperCase();
    return k || null;
  } catch (e) { return null; }
}

async function svaret(svar) {
  const d = await svar.json().catch(() => ({}));
  if (!svar.ok || !d || !d.ok) throw new Error((d && d.fejl) || 'Det gik ikke – prøv igen om lidt.');
  return d;
}

const sti = k => API + '/' + encodeURIComponent(k);

async function hent(k) {
  return (await svaret(await fetch(sti(k) + '?navn=' + encodeURIComponent(navn()), { cache: 'no-store' }))).rum;
}

async function send(k, krop) {
  return svaret(await fetch(sti(k), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(Object.assign({ navn: navn() }, krop)),
  }));
}

const kom = k => send(k, { handling: 'kom' }).then(d => d.rum);
const forlad = k => send(k, { handling: 'nej' }).then(d => d.rum);
const gem = (k, tilstand, version) =>
  send(k, { handling: 'gem', tilstand, version }).then(d => ({ rum: d.rum, uaendret: !!d.uaendret }));

/** Inviterer en ven til et spil. Bruges af forsiden (/venner.js). */
async function inviter(ven, spil) {
  const svar = await fetch(API, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ navn: navn(), ven, spil }),
  });
  return (await svaret(svar)).rum;
}

/** Mine åbne rum: invitationer jeg har fået, og dem jeg selv har sendt. */
async function mine() {
  const n = navn();
  if (!n) return [];
  const svar = await fetch(API + '?navn=' + encodeURIComponent(n), { cache: 'no-store' });
  return (await svaret(svar)).rum || [];
}

/**
 * Kigger efter ændringer i rummet, så længe fanen er fremme. `naar(rum)` kaldes
 * kun, når der faktisk er sket noget (status eller version har flyttet sig), så
 * spillet ikke tegner sig selv om hvert sekund. Fejl er lige meget: så prøver vi
 * bare igen ved næste tik, og skærmen står med det, vi så sidst.
 */
function foelg(k, naar, ms) {
  let sidst = '', stoppet = false, timer = null;
  const tik = async () => {
    if (stoppet) return;
    if (document.visibilityState === 'visible') {
      try {
        const rum = await hent(k);
        const naa = rum.status + ':' + rum.version;
        if (naa !== sidst) { sidst = naa; naar(rum); }
      } catch (e) { /* prøver igen om lidt */ }
    }
    if (!stoppet) timer = setTimeout(tik, ms || TIK_MS);
  };
  timer = setTimeout(tik, ms || TIK_MS);
  // Kom man tilbage til fanen, skal man ikke vente på næste tik.
  const vaagn = () => { if (document.visibilityState === 'visible' && !stoppet) { clearTimeout(timer); tik(); } };
  document.addEventListener('visibilitychange', vaagn);
  return () => {
    stoppet = true;
    clearTimeout(timer);
    document.removeEventListener('visibilitychange', vaagn);
  };
}

window.Rum = { kode, navn, hent, send, kom, forlad, gem, inviter, mine, foelg, TIK_MS };
})();
