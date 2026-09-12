/*
  Fælles højscore-klient for spillene på zydy.dk. Klassisk script, ingen build:

    <script src="/spil/highscore.js"></script>
    ...
    Highscore.panel(document.getElementById('hs'), { spil: 'taarn', score });

  panel() henter toplisten fra /api/highscore/<spil> (src/highscore.mjs + D1),
  viser en navneformular hvis scoren kommer på listen, sender den ind og
  viser listen med den nye række fremhævet. Navnet huskes i localStorage
  ('zydy.navn'), så det er udfyldt næste gang – også i de andre spil.

  Retningen (flest point eller laveste tid) og grænserne for en gyldig score
  bestemmes af serveren (SPIL i src/highscore.mjs) og følger med i svaret.
  Options til panel(): { spil, score, format(score) → tekst, titel, knap, onGemt }.

  Stilen bruger spillenes CSS-variabler (--muted, --sun, --bg2, --text, --ink,
  --mint) med fornuftige fallbacks, og knappen får klassen `btn`, som alle spil
  har. Ret via option { knap: 'min-klasse' } om nødvendigt.
*/
(function () {
'use strict';

const API = '/api/highscore/';
const KEY_NAVN = 'zydy.navn';
const LAENGDE = 10;          // samme som LISTE_LAENGDE i Worker'en
const NAVN_MAKS = 12;

/* ---------- Navn (huskes på tværs af spil) ---------- */
const navn = {
  hent() { try { return localStorage.getItem(KEY_NAVN) || ''; } catch (e) { return ''; } },
  gem(n) { try { localStorage.setItem(KEY_NAVN, n); } catch (e) {} },
};

/* ---------- API ---------- */
/** Henter { spil, retning, min, maks, liste }. */
async function hent(spil) {
  const r = await fetch(API + spil, { cache: 'no-store' });
  if (!r.ok) throw new Error('Toplisten svarede ' + r.status);
  return r.json();
}

async function send(spil, n, score) {
  const r = await fetch(API + spil, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ navn: n, score }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data.ok) throw new Error(data.fejl || 'Kunne ikke gemme (' + r.status + ')');
  return data;                       // { ok, id, placering, liste }
}

/** Er a bedre end b i den givne retning? */
const bedre = (a, b, retning) => retning === 'asc' ? a < b : a > b;

/**
 * Kommer scoren på listen? `top` er serverens svar ({ retning, min, maks, liste }).
 * Ja hvis scoren er gyldig, og der er plads eller den slår den nederste.
 */
function kvalificerer(top, score) {
  if (!Number.isInteger(score) || score < (top.min == null ? 1 : top.min) || (top.maks != null && score > top.maks)) return false;
  const liste = top.liste || [];
  if (liste.length < LAENGDE) return true;
  return bedre(score, liste[liste.length - 1].score, top.retning);
}

/* ---------- Tegning ---------- */
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};

/** Tegner toplisten i `rod`. `fremhaevId` markerer spillerens egen række; `format` gør tal til tekst (fx tid). */
function tegnListe(rod, liste, fremhaevId, overskrift, format) {
  rod.innerHTML = '';
  rod.appendChild(el('div', 'hs-titel', overskrift || 'Topliste'));
  if (!liste.length) {
    rod.appendChild(el('p', 'hs-tom', 'Ingen på listen endnu – bliv den første!'));
    return;
  }
  const ol = el('ol', 'hs-liste');
  liste.forEach((r, i) => {
    const li = el('li', 'hs-raekke' + (r.id === fremhaevId ? ' hs-mig' : ''));
    li.appendChild(el('span', 'hs-nr', String(i + 1)));
    li.appendChild(el('span', 'hs-navn', r.navn));
    li.appendChild(el('span', 'hs-score', format ? format(r.score) : String(r.score)));
    ol.appendChild(li);
  });
  rod.appendChild(ol);
}

function tegnFejl(rod, besked) {
  rod.innerHTML = '';
  rod.appendChild(el('p', 'hs-fejl', besked || 'Toplisten kunne ikke hentes.'));
}

/**
 * Hele forløbet efter et spil. `score` udelades for bare at vise listen.
 * Options: { spil, score, format(score), titel = 'Topliste', knap = 'btn', onGemt(placering) }.
 */
async function panel(rod, opt) {
  const spil = opt.spil, score = opt.score, knapKlasse = opt.knap || 'btn', format = opt.format;
  rod.innerHTML = '';
  rod.appendChild(el('p', 'hs-venter', 'Henter toplisten…'));

  let top;
  try { top = await hent(spil); } catch (e) { tegnFejl(rod); return; }
  const liste = top.liste || [];

  if (!kvalificerer(top, score)) { tegnListe(rod, liste, null, opt.titel, format); return; }

  // Scoren kommer på listen: bed om navn.
  rod.innerHTML = '';
  const erNr1 = !liste.length || bedre(score, liste[0].score, top.retning);
  rod.appendChild(el('div', 'hs-titel hs-jubel', erNr1 ? 'Ny rekord – du er nr. 1!' : 'Du er på toplisten!'));
  const form = el('form', 'hs-form');
  form.setAttribute('autocomplete', 'off');
  const input = el('input', 'hs-input');
  input.type = 'text'; input.name = 'navn'; input.maxLength = NAVN_MAKS;
  input.placeholder = 'Dit navn'; input.setAttribute('aria-label', 'Dit navn');
  input.setAttribute('enterkeyhint', 'done'); input.autocapitalize = 'words'; input.spellcheck = false;
  input.value = navn.hent();
  const gem = el('button', knapKlasse + ' hs-gem', 'Gem på listen');
  gem.type = 'submit';
  form.appendChild(input); form.appendChild(gem);
  rod.appendChild(form);
  const status = el('p', 'hs-status', '');
  rod.appendChild(status);
  if (!input.value) setTimeout(() => input.focus({ preventScroll: true }), 50);

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const n = input.value.trim();
    if (!n) { input.focus(); return; }
    gem.disabled = true; status.textContent = 'Gemmer…';
    try {
      const svar = await send(spil, n, score);
      navn.gem(n);
      tegnListe(rod, svar.liste, svar.id,
        svar.placering === 1 ? 'Du er nr. 1!' : svar.placering ? 'Gemt som nr. ' + svar.placering : 'Gemt', format);
      if (opt.onGemt) opt.onGemt(svar.placering);
    } catch (err) {
      gem.disabled = false; status.textContent = 'Kunne ikke gemme – prøv igen.';
    }
  });
}

/* ---------- Standard-stil (kan overstyres af spillets CSS) ---------- */
const css = `
.hs-titel{font-weight:800;font-size:17px;margin:14px 0 8px;color:var(--text,#fff)}
.hs-jubel{color:var(--sun,#ffd447);font-size:20px}
.hs-liste{list-style:none;margin:0;padding:0;max-height:38vh;overflow-y:auto;-webkit-overflow-scrolling:touch;
  background:var(--bg2,rgba(255,255,255,.06));border-radius:16px;text-align:left}
.hs-raekke{display:flex;align-items:center;gap:10px;padding:7px 14px;font-size:16px;color:var(--text,#fff)}
.hs-raekke+.hs-raekke{border-top:1px solid rgba(255,255,255,.06)}
.hs-nr{width:26px;color:var(--muted,#aaa);font-variant-numeric:tabular-nums;font-weight:700;flex:none}
.hs-raekke:first-child .hs-nr{color:var(--sun,#ffd447)}
.hs-navn{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}
.hs-score{font-weight:800;font-variant-numeric:tabular-nums}
.hs-mig{background:rgba(255,212,71,.16);color:var(--sun,#ffd447)}
.hs-mig .hs-nr{color:var(--sun,#ffd447)}
.hs-form{display:flex;flex-direction:column;gap:8px}
.hs-form .hs-gem{margin-top:0}
.hs-input{font:inherit;font-size:20px;font-weight:700;text-align:center;padding:14px;border-radius:16px;border:2px solid transparent;
  background:var(--bg2,rgba(255,255,255,.08));color:var(--text,#fff);outline:none;width:100%;
  -webkit-user-select:text;user-select:text}
.hs-input:focus{border-color:var(--sun,#ffd447)}
.hs-input::placeholder{color:var(--muted,#aaa);font-weight:500}
.hs-status,.hs-venter,.hs-tom,.hs-fejl{color:var(--muted,#aaa);font-size:15px;margin:6px 0 0;min-height:1.2em}
.hs-fejl{color:var(--coral,#ff5c7a)}
`;
const style = document.createElement('style');
style.textContent = css;
document.head.appendChild(style);

window.Highscore = { hent, send, kvalificerer, tegnListe, tegnFejl, panel, navn, LAENGDE };
})();
