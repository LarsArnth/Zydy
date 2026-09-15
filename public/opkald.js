/*
  Ring til en ven på forsiden af zydy.dk. Klassisk script, ingen build:

    <script src="/opkald.js" defer></script>     (efter /ideer.js, før /venner.js)

  Man er det navn, man har skrevet på forsiden ('zydy.navn', se /ideer.js), og
  man kan kun ringe til dem, man er venner med — det passer serveren på
  (src/opkald.mjs). Selve lyden går direkte mellem de to telefoner (WebRTC);
  serveren bærer kun tilbud og svar frem og tilbage, mens forbindelsen laves,
  og kan aldrig høre noget.

    Opkald.ring(ven)      ring op til en ven (knappen i venne-dialogen)
    Opkald.besvar(kode)   tag telefonen (knappen på ring-skærmen)
    Opkald.laegPaa()      læg på / fortryd / sig nej tak
    Opkald.hent()         kig efter opkald nu (testene beder selv om det)
    Opkald.kanRinge       har browseren mikrofon og WebRTC?

  Opkaldet er en lille boks nederst på skærmen: «Ringer til Selma …», så
  «I taler sammen · 1:23» med lyd-fra og en rød Læg på. Ringer nogen til dig,
  fylder boksen mere og spiller en ringetone (hvis browseren vil, ellers blinker
  den bare). Man skal være på forsiden for at høre telefonen — ligesom
  beskederne bor opkald ikke inde i spillene.

  Alt fejler stille: uden forbindelse, uden mikrofon eller uden WebRTC står der
  en venlig besked, og resten af forsiden er som før.
*/
(function () {
'use strict';

const API = '/api/opkald';
const KEY_NAVN = 'zydy.navn';        // fælles med /ideer.js og /spil/highscore.js
const KIG_MS = 2_000;                // hjerteslaget: hvor tit vi kigger efter noget nyt
const RING_MAKS_MS = 45_000;         // som RING_MS i src/opkald.mjs: så længe ringer vi
const FORBIND_MS = 15_000;           // svaret er lagt – så længe må forbindelsen være om at komme
const IS_MS = 1_800;                 // vent højst så længe på ICE-kandidater, send så det vi har
const BESKED_MS = 6_000;             // hvor længe «Selma lagde på» bliver stående

// Lyden går uden om serveren, men to telefoner på hver sit net skal bruge en
// STUN-server til at finde hinandens adresser. Cloudflares og Googles er gratis.
const RTC_OPS = { iceServers: [
  { urls: 'stun:stun.cloudflare.com:3478' },
  { urls: 'stun:stun.l.google.com:19302' },
] };

const laesNavn = () => {
  try { return (localStorage.getItem(KEY_NAVN) || '').trim(); } catch (e) { return ''; }
};

/** Vennens navn på skærmen: kælenavnet fra /venner.js, hvis hen har fået et. */
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

/** Kan denne browser overhovedet ringe? (iPhone og iPad kan.) */
const kanRinge = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.RTCPeerConnection);

/* ---------- API ---------- */

async function kald(sti, krop) {
  const svar = await fetch(API + sti, krop ? {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(krop),
  } : { cache: 'no-store' });
  const d = await svar.json().catch(() => ({}));
  if (!svar.ok || !d.ok) throw new Error((d && d.fejl) || 'Det gik ikke – prøv igen om lidt.');
  return d;
}

/* ---------- Ringetonen ---------- */
/*
  WebAudio, ingen lydfiler. Browseren vil tit kun spille lyd, når man har rørt
  siden — så virker den ikke, blinker boksen bare, og det er også et ringesignal.
*/

let lydKtx = null, ringTimer = null;

function toner() {
  try {
    lydKtx = lydKtx || new (window.AudioContext || window.webkitAudioContext)();
    if (lydKtx.resume) lydKtx.resume().catch(() => {});
    const nu = lydKtx.currentTime;
    [[880, 0], [660, 0.25]].forEach(([hz, t]) => {
      const o = lydKtx.createOscillator(), g = lydKtx.createGain();
      o.frequency.value = hz;
      g.gain.setValueAtTime(0.0001, nu + t);
      g.gain.exponentialRampToValueAtTime(0.12, nu + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, nu + t + 0.22);
      o.connect(g).connect(lydKtx.destination);
      o.start(nu + t);
      o.stop(nu + t + 0.25);
    });
  } catch (e) { /* så blinker boksen bare */ }
}

function startRing() {
  if (ringTimer) return;
  toner();
  if (navigator.vibrate) { try { navigator.vibrate([300, 200, 300]); } catch (e) {} }
  ringTimer = setInterval(() => {
    toner();
    if (navigator.vibrate) { try { navigator.vibrate([300, 200, 300]); } catch (e) {} }
  }, 2_500);
}

function stopRing() {
  if (ringTimer) { clearInterval(ringTimer); ringTimer = null; }
  if (navigator.vibrate) { try { navigator.vibrate(0); } catch (e) {} }
}

/* ---------- Samtalen (WebRTC) ---------- */

// Det ene opkald, denne telefon er i gang med — eller null.
//   fase: 'klargoer' → 'ringer' (kun den der ringer) → 'forbinder' → 'taler'
let session = null;
// Ringer nogen til mig, står opkaldet her, til jeg svarer eller det forsvinder.
let indkommende = null;
// «Selma lagde på» – en lille besked, der bliver stående et øjeblik.
let slutBesked = '', slutTid = 0;

// Vennens stemme kommer ud af det her element. playsinline: iPhone må ikke
// hoppe i fuld skærm over et telefonopkald.
let lydEl = null;
function lydElement() {
  if (!lydEl) {
    lydEl = document.createElement('audio');
    lydEl.autoplay = true;
    lydEl.setAttribute('playsinline', '');
    lydEl.style.display = 'none';
    document.body.appendChild(lydEl);
  }
  return lydEl;
}

/** Mikrofonen. Fejler med en besked, et barn kan bruge til noget. */
async function mikrofon() {
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  } catch (e) {
    throw new Error('Vi må ikke bruge mikrofonen. Tryk «Tillad», når telefonen spørger.');
  }
}

/** Venter til ICE-kandidaterne er samlet – eller IS_MS er gået, så sender vi det, vi har. */
function ventPaaIs(pc) {
  return new Promise(res => {
    if (pc.iceGatheringState === 'complete') return res();
    const faerdig = () => { clearTimeout(t); pc.removeEventListener('icegatheringstatechange', tjek); res(); };
    const tjek = () => { if (pc.iceGatheringState === 'complete') faerdig(); };
    const t = setTimeout(faerdig, IS_MS);
    pc.addEventListener('icegatheringstatechange', tjek);
  });
}

/** En frisk forbindelse med min mikrofon på – og ørerne åbne for vennens. */
function nyForbindelse(stroem) {
  const pc = new RTCPeerConnection(RTC_OPS);
  stroem.getTracks().forEach(t => pc.addTrack(t, stroem));
  pc.addEventListener('track', e => {
    if (e.streams && e.streams[0]) lydElement().srcObject = e.streams[0];
  });
  pc.addEventListener('connectionstatechange', () => {
    if (!session || session.pc !== pc) return;
    if (pc.connectionState === 'connected') {
      if (session.forbindTimer) { clearTimeout(session.forbindTimer); session.forbindTimer = null; }
      session.fase = 'taler';
      session.startTid = Date.now();
      stopRing();
      tegn();
    } else if (['failed', 'disconnected', 'closed'].includes(pc.connectionState) && session.fase === 'taler') {
      sluk('Forbindelsen røg. Ring igen, hvis I ikke var færdige.');
    }
  });
  return pc;
}

/** Lukker og slukker: forbindelsen, mikrofonen, timerne – og siger evt. hvorfor. */
function sluk(besked, sigDetTilServeren = true) {
  const s = session;
  session = null;
  stopRing();
  if (s) {
    if (s.forbindTimer) clearTimeout(s.forbindTimer);
    if (s.ringTimer) clearTimeout(s.ringTimer);
    if (s.pc) { try { s.pc.close(); } catch (e) {} }
    if (s.stroem) { try { s.stroem.getTracks().forEach(t => t.stop()); } catch (e) {} }
    if (lydEl) lydEl.srcObject = null;
    if (sigDetTilServeren && s.kode) kald('/' + s.kode, { navn: laesNavn(), handling: 'slut' }).catch(() => {});
  }
  if (besked) { slutBesked = besked; slutTid = Date.now(); }
  tegn();
}

/** Klokken på samtalen: 83 sekunder → «1:23». */
function tidTekst(ms) {
  const sek = Math.max(0, Math.floor(ms / 1000));
  return Math.floor(sek / 60) + ':' + String(sek % 60).padStart(2, '0');
}

/* ---------- Ring op ---------- */

async function ring(ven) {
  const navn = laesNavn();
  if (!navn || !ven || session) return;
  if (!kanRinge) { slutBesked = 'Din browser kan ikke ringe – prøv på en iPhone eller iPad.'; slutTid = Date.now(); tegn(); return; }
  indkommende = null;
  session = { kode: null, ven, retning: 'ud', fase: 'klargoer', pc: null, stroem: null, startTid: 0 };
  tegn();
  try {
    const stroem = await mikrofon();
    if (!session || session.ven !== ven) { stroem.getTracks().forEach(t => t.stop()); return; }
    session.stroem = stroem;
    const pc = nyForbindelse(stroem);
    session.pc = pc;
    await pc.setLocalDescription(await pc.createOffer());
    await ventPaaIs(pc);
    if (!session || session.pc !== pc) return;                 // nogen lagde på undervejs
    const d = await kald('', { navn, ven, tilbud: pc.localDescription });
    if (!session || session.pc !== pc) { kald('/' + d.opkald.kode, { navn, handling: 'slut' }).catch(() => {}); return; }
    session.kode = d.opkald.kode;
    session.fase = 'ringer';
    // Giver vennen op til RING_MAKS_MS til at tage den – så siger vi det, som det er.
    session.ringTimer = setTimeout(() => {
      if (session && session.fase === 'ringer') sluk(visNavn(ven) + ' svarede ikke. Prøv igen om lidt, eller skriv en besked.');
    }, RING_MAKS_MS);
    tegn();
  } catch (e) {
    sluk(e.message);
  }
}

/* ---------- Tag telefonen ---------- */

async function besvar(kode) {
  const navn = laesNavn();
  const o = indkommende;
  if (!navn || !o || o.kode !== kode || session) return;
  indkommende = null;
  stopRing();
  session = { kode, ven: o.ven, retning: 'ind', fase: 'klargoer', pc: null, stroem: null, startTid: 0 };
  tegn();
  try {
    const stroem = await mikrofon();
    if (!session || session.kode !== kode) { stroem.getTracks().forEach(t => t.stop()); return; }
    session.stroem = stroem;
    const pc = nyForbindelse(stroem);
    session.pc = pc;
    await pc.setRemoteDescription(o.tilbud);
    await pc.setLocalDescription(await pc.createAnswer());
    await ventPaaIs(pc);
    if (!session || session.pc !== pc) return;
    const d = await kald('/' + kode, { navn, handling: 'svar', svar: pc.localDescription });
    if (!session || session.pc !== pc) return;
    if (d.opkald.status === 'slut') { sluk(visNavn(o.ven) + ' nåede at lægge på.', false); return; }
    // Forbindelsen kan være kommet, allerede mens svaret var på vej op til
    // serveren – så er vi i gang, og fasen må ikke skrues tilbage.
    if (session.fase === 'klargoer') { session.fase = 'forbinder'; startForbindTimer(); }
    tegn();
  } catch (e) {
    sluk(e.message);
  }
}

/** Svaret er lagt – nu skal telefonerne selv finde hinanden inden FORBIND_MS. */
function startForbindTimer() {
  if (!session || session.forbindTimer) return;
  session.forbindTimer = setTimeout(() => {
    if (session && session.fase === 'forbinder') {
      sluk('Vi kunne ikke få lyden igennem mellem jer. Prøv igen – eller skriv sammen i stedet.');
    }
  }, FORBIND_MS);
}

function laegPaa() {
  if (indkommende) {
    // Nej tak til en, der ringer: sig det til serveren, så hen ikke står og venter.
    const o = indkommende;
    indkommende = null;
    stopRing();
    kald('/' + o.kode, { navn: laesNavn(), handling: 'slut' }).catch(() => {});
    tegn();
    return;
  }
  if (!session) return;
  const varighed = session.startTid ? Date.now() - session.startTid : 0;
  sluk(varighed ? 'I talte sammen i ' + tidTekst(varighed) + '.' : '');
}

/** Lyd fra/til på min egen mikrofon. */
function lydFraTil() {
  if (!session || !session.stroem) return;
  session.stroem.getAudioTracks().forEach(t => { t.enabled = !t.enabled; });
  tegn();
}

/* ---------- Kig efter opkald ---------- */

/**
 * Hjerteslaget. Har jeg et opkald i gang, følger vi det (svaret, eller at den
 * anden lagde på); ellers kigger vi efter, om nogen ringer til mig.
 */
async function hent() {
  const navn = laesNavn();
  if (!navn) return;

  if (session && session.kode) {
    try {
      const d = await kald('/' + session.kode + '?navn=' + encodeURIComponent(navn));
      const o = d.opkald;
      if (!session || session.kode !== o.kode) return;
      if (o.status === 'slut') {
        const var_ = session.startTid ? Date.now() - session.startTid : 0;
        sluk(session.fase === 'ringer'
          ? visNavn(session.ven) + ' tog den ikke.'
          : visNavn(session.ven) + ' lagde på.' + (var_ ? ' I talte sammen i ' + tidTekst(var_) + '.' : ''), false);
        return;
      }
      // Svaret er kommet: læg det på forbindelsen (én gang), og vent på lyden.
      if (session.retning === 'ud' && session.fase === 'ringer' && o.svar) {
        session.fase = 'forbinder';
        if (session.ringTimer) { clearTimeout(session.ringTimer); session.ringTimer = null; }
        startForbindTimer();
        tegn();
        try { await session.pc.setRemoteDescription(o.svar); } catch (e) { sluk('Det gik i kludder – prøv at ringe igen.'); }
      }
    } catch (e) { /* prøver igen ved næste hjerteslag */ }
    return;
  }

  try {
    const d = await kald('?navn=' + encodeURIComponent(navn));
    const liste = d.opkald || [];
    // En rest fra en side, der blev lukket midt i en samtale: læg den på, så
    // ingen af telefonerne står og venter på en samtale, der ikke findes.
    if (!session) {
      liste.filter(o => o.status === 'igang').forEach(o => {
        kald('/' + o.kode, { navn, handling: 'slut' }).catch(() => {});
      });
    }
    const nyt = liste.find(o => o.status === 'ringer' && !o.ringerJeg && o.tilbud) || null;
    if (nyt && (!indkommende || indkommende.kode !== nyt.kode)) {
      if (kanRinge && !session) {
        indkommende = nyt;
        // Ring-skærmen skal kunne ses: luk dialoger, der ligger ovenpå.
        document.querySelectorAll('dialog[open]').forEach(dlg => { try { dlg.close(); } catch (e) {} });
        startRing();
        tegn();
      }
    } else if (!nyt && indkommende) {
      // Den, der ringede, gav op, før jeg tog den.
      const hvem = visNavn(indkommende.ven);
      indkommende = null;
      stopRing();
      slutBesked = '📞 ' + hvem + ' ringede til dig lige før.';
      slutTid = Date.now();
      tegn();
    }
  } catch (e) { /* prøver igen ved næste hjerteslag */ }
}

/* ---------- Boksen på skærmen ---------- */

let boks = null;

function tegn() {
  if (!boks) {
    boks = el('div', 'o-boks');
    boks.id = 'opkald';
    document.body.appendChild(boks);
  }
  boks.innerHTML = '';
  boks.hidden = true;
  boks.classList.remove('o-ringer-ind');

  if (indkommende) {
    // Nogen ringer! Stor og tydelig, med to knapper et barn kan ramme.
    boks.hidden = false;
    boks.classList.add('o-ringer-ind');
    boks.appendChild(el('div', 'o-tekst o-stor', '📞 ' + visNavn(indkommende.ven) + ' ringer til dig!'));
    const raekke = el('div', 'o-knapper');
    raekke.appendChild(knap('o-knap o-svar', '✅ Svar', () => besvar(indkommende && indkommende.kode)));
    raekke.appendChild(knap('o-knap o-afvis', 'Nej tak', () => laegPaa()));
    boks.appendChild(raekke);
    return;
  }

  if (session) {
    boks.hidden = false;
    const vis = visNavn(session.ven);
    const raekke = el('div', 'o-knapper');
    if (session.fase === 'klargoer') {
      boks.appendChild(el('div', 'o-tekst', '📞 Gør klar til at ringe … sig ja til mikrofonen.'));
    } else if (session.fase === 'ringer') {
      boks.appendChild(el('div', 'o-tekst', '📞 Ringer til ' + vis + ' … ' + vis + ' skal være på forsiden for at høre det.'));
    } else if (session.fase === 'forbinder') {
      boks.appendChild(el('div', 'o-tekst', '📞 ' + vis + ' tog den! Finder lyden …'));
    } else {
      const t = el('div', 'o-tekst', '📞 Du taler med ' + vis + ' · ');
      const tid = el('span', 'o-tid', tidTekst(Date.now() - session.startTid));
      t.appendChild(tid);
      boks.appendChild(t);
      const taendt = session.stroem && session.stroem.getAudioTracks().some(tr => tr.enabled);
      raekke.appendChild(knap('o-knap o-lydfra', taendt ? '🎤 Lyd fra' : '🔇 Lyd til', () => lydFraTil()));
    }
    raekke.appendChild(knap('o-knap o-laegpaa', session.fase === 'taler' ? 'Læg på' : 'Fortryd', () => laegPaa()));
    boks.appendChild(raekke);
    return;
  }

  if (slutBesked && Date.now() - slutTid < BESKED_MS) {
    boks.hidden = false;
    boks.appendChild(el('div', 'o-tekst o-slut', slutBesked));
    boks.appendChild(knap('o-knap o-ok', 'OK', () => { slutBesked = ''; tegn(); }));
  } else {
    slutBesked = '';
  }
}

/* ---------- Stil ---------- */

const css = `
.o-boks{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:120;
  width:min(440px,calc(100vw - 24px));box-sizing:border-box;
  background:var(--bg2,#1b1f42);color:var(--text,#fff7e6);border-radius:22px;
  padding:14px 16px;box-shadow:0 10px 40px rgba(0,0,0,.5);border:1px solid rgba(255,255,255,.14)}
.o-boks[hidden]{display:none}
.o-tekst{font-size:15px;font-weight:700;line-height:1.35}
.o-stor{font-size:19px}
.o-tid{font-variant-numeric:tabular-nums}
.o-slut{font-weight:600;color:var(--muted,#a9acd6)}
.o-knapper{display:flex;gap:10px;margin-top:10px;flex-wrap:wrap}
.o-knap{font:inherit;font-size:16px;font-weight:800;cursor:pointer;border:0;border-radius:999px;
  padding:10px 18px;min-height:48px;flex:1;background:rgba(255,255,255,.09);color:var(--text,#fff7e6)}
.o-knap:focus-visible{outline:3px solid var(--sun,#ffd447);outline-offset:3px}
.o-svar{background:var(--mint,#5ee0a8);color:#10321f}
.o-laegpaa,.o-afvis{background:#e4574d;color:#fff}
.o-ok{flex:0 0 auto}
.o-ringer-ind{animation:o-puls 1.2s ease-in-out infinite}
@keyframes o-puls{0%,100%{box-shadow:0 10px 40px rgba(0,0,0,.5)}50%{box-shadow:0 0 0 10px rgba(255,212,71,.25)}}
@media (prefers-reduced-motion:reduce){ .o-ringer-ind{animation:none} }
`;
const style = document.createElement('style');
style.textContent = css;
document.head.appendChild(style);

/* ---------- Start ---------- */

let slag = 0;
function start() {
  setInterval(() => {
    if (document.visibilityState !== 'visible') return;
    slag++;
    // Uret i «I taler sammen» skal gå, uden at vi tegner hele boksen om.
    if (session && session.fase === 'taler' && boks) {
      const tid = boks.querySelector('.o-tid');
      if (tid) tid.textContent = tidTekst(Date.now() - session.startTid);
    }
    // Midt i noget (opkald eller ringen) kigger vi hvert slag; ellers hvert andet.
    if (session && session.kode) { hent(); return; }
    if (!session && (indkommende || slag % 2 === 0)) hent();
  }, KIG_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') hent();
  });
  // Navnet blev skiftet: så er en samtale i en andens navn forbi.
  document.addEventListener('zydy:navn', () => {
    indkommende = null;
    stopRing();
    if (session) sluk('');
  });
  hent();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();

window.Opkald = {
  ring, besvar, laegPaa, hent, lydFraTil, kanRinge,
  get session() { return session; },
  get indkommende() { return indkommende; },
};
})();
