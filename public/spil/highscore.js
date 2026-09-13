/*
  Fælles højscore-klient for spillene på zydy.dk. Klassisk script, ingen build:

    <script src="/spil/highscore.js"></script>
    ...
    Highscore.panel(document.getElementById('hs'), { spil: 'taarn', score });

  panel() henter toplisten fra /api/highscore/<spil> (src/highscore.mjs + D1).
  Kommer scoren på listen, spørges der om navn – men kun første gang. Navnet
  huskes i localStorage ('zydy.navn', fælles for alle spil), og derefter gemmes
  rekorder automatisk: "Sofie, du har slået rekorden!" med listen under og en
  knap "Ikke Sofie, der spiller?" til at skifte navn. Serveren holder én række
  pr. navn (den bedste), så listen ikke fyldes af samme spiller.

  Retningen (flest point eller laveste tid) og grænserne for en gyldig score
  bestemmes af serveren (SPIL i src/highscore.mjs) og følger med i svaret.
  Options til panel(): { spil, score, format(score) → tekst, titel, knap, onGemt }.

  Serveren sender hele listen (op til 100 navne), og alle, der har spillet, kommer
  med på den – ikke kun de ti bedste (Josephines ønske). Listen viser de ti øverste
  plus knappen «Vis alle 37», og står ens eget navn længere nede, hænges rækken
  nederst med sin rigtige placering, så man altid kan se sig selv.

  Stilen bruger spillenes CSS-variabler (--muted, --sun, --bg2, --text, --ink,
  --mint) med fornuftige fallbacks, og knappen får klassen `btn`, som alle spil
  har. Ret via option { knap: 'min-klasse' } om nødvendigt.
*/
(function () {
'use strict';

const API = '/api/highscore/';
const KEY_NAVN = 'zydy.navn';
const LAENGDE = 10;          // samme som LISTE_LAENGDE i Worker'en: så mange vises med det samme
const PLADSER = 100;         // samme som GEM_LAENGDE: så mange navne er der plads til i alt
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
  return data;                       // { ok, id, token, placering, uaendret?, score?, liste }
}

/** Retter navnet på en række man selv har gemt (kræver dens token). */
async function omdoeb(spil, id, token, n) {
  const r = await fetch(API + spil + '/' + id, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ navn: n, token }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data.ok) throw new Error(data.fejl || 'Kunne ikke skifte navn (' + r.status + ')');
  return data;
}

/** Er a bedre end b i den givne retning? */
const bedre = (a, b, retning) => retning === 'asc' ? a < b : a > b;

/**
 * Kommer scoren på listen? `top` er serverens svar ({ retning, min, maks, liste }).
 * Ja hvis scoren er gyldig, og der er plads på listen eller den slår den nederste.
 *
 * Listen er hele listen (op til PLADSER navne), ikke top 10 — Josephines ønske var,
 * at alle, der har spillet, kommer med. Før skulle man ind i top 10 for overhovedet
 * at blive gemt, så en ny spiller aldrig kunne komme på en liste, der var fuld.
 */
function kvalificerer(top, score) {
  if (!Number.isInteger(score) || score < (top.min == null ? 1 : top.min) || (top.maks != null && score > top.maks)) return false;
  const liste = top.liste || [];
  if (liste.length < PLADSER) return true;
  return bedre(score, liste[liste.length - 1].score, top.retning);
}

/** Er scoren god nok til de ti øverste? Bruges kun til at vælge ord ("Ny rekord!" vs. "Kom med"). */
function iTop(top, score) {
  const liste = top.liste || [];
  return liste.length < LAENGDE || bedre(score, liste[LAENGDE - 1].score, top.retning);
}

/* ---------- Tegning ---------- */
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};

/** Én række på listen. `plads` er den rigtige placering (1-baseret), også når rækken hænges nederst. */
function raekke(r, plads, mig, format) {
  const li = el('li', 'hs-raekke' + (mig ? ' hs-mig' : ''));
  li.appendChild(el('span', 'hs-nr', String(plads)));
  li.appendChild(el('span', 'hs-navn', r.navn));
  li.appendChild(el('span', 'hs-score', format ? format(r.score) : String(r.score)));
  return li;
}

/**
 * Tegner selve rækkerne i `boks`: de ti øverste, eller hele listen når `alle` er sat.
 * To ting gør, at man altid kan finde sig selv (Josephines ønske):
 *  - står ens egen række uden for de ti, hænges den nederst med «···» over og sin rigtige
 *    placering, så man kan se hvor man ligger uden at folde noget ud;
 *  - er der flere end ti, står knappen «Vis alle 37» under listen. Listen ruller i sig
 *    selv (max-height i CSS'en), så knapperne under den ikke skubbes ud af skærmen.
 */
function tegnRaekker(boks, liste, mit, format, alle) {
  boks.innerHTML = '';
  const vis = alle ? liste.length : Math.min(LAENGDE, liste.length);
  const ol = el('ol', 'hs-liste');
  for (let i = 0; i < vis; i++) ol.appendChild(raekke(liste[i], i + 1, i === mit, format));
  if (mit >= vis) {
    ol.appendChild(el('li', 'hs-spring', '···'));
    ol.appendChild(raekke(liste[mit], mit + 1, true, format));
  }
  boks.appendChild(ol);
  if (liste.length > LAENGDE) {
    const knap = el('button', 'hs-flere', alle ? 'Vis kun de ' + LAENGDE + ' bedste' : 'Vis alle ' + liste.length);
    knap.type = 'button';
    knap.addEventListener('click', () => {
      tegnRaekker(boks, liste, mit, format, !alle);
      // Rul hen til ens egen række i stedet for at lade folk lede i en lang liste.
      // (scrollTop frem for scrollIntoView, så kun listen ruller – ikke hele skærmen.)
      const ny = boks.querySelector('.hs-liste'), mig = boks.querySelector('.hs-mig');
      if (!alle && mig) ny.scrollTop = Math.max(0, mig.offsetTop - ny.clientHeight / 2);
    });
    boks.appendChild(knap);
  }
}

/**
 * Tegner toplisten i `rod`. `fremhaev` markerer spillerens egen række: et id (tal) eller et navn (tekst,
 * uanset store/små bogstaver). `format` gør tal til tekst (fx tid som m:ss).
 */
function tegnListe(rod, liste, fremhaev, overskrift, format) {
  const erMig = r => typeof fremhaev === 'string'
    ? r.navn.toLowerCase() === fremhaev.toLowerCase()
    : r.id === fremhaev;
  rod.innerHTML = '';
  rod.appendChild(el('div', 'hs-titel', overskrift || 'Topliste'));
  if (!liste.length) {
    rod.appendChild(el('p', 'hs-tom', 'Ingen på listen endnu – bliv den første!'));
    return;
  }
  const boks = el('div', 'hs-boks');
  rod.appendChild(boks);
  tegnRaekker(boks, liste, fremhaev == null ? -1 : liste.findIndex(erMig), format, false);
}

function tegnFejl(rod, besked) {
  rod.innerHTML = '';
  rod.appendChild(el('p', 'hs-fejl', besked || 'Toplisten kunne ikke hentes.'));
}

/** Overskriften efter en gemning, med navnet på spilleren. */
function titelEfterGem(svar, n, format) {
  const f = v => format ? format(v) : String(v);
  if (svar.uaendret) return n + ', din rekord er stadig ' + f(svar.score);
  if (svar.placering === 1) return n + ', du har slået rekorden!';
  if (svar.placering) return n + ', du er nr. ' + svar.placering + '!';
  return n + ', listen var fuld denne gang';
}

/** Et navnefelt med knap. `onNavn(navn)` kaldes ved indsendelse; feltet er fokuseret, hvis det er tomt. */
function navneFormular(rod, opt, startVaerdi, knapTekst, onNavn) {
  const form = el('form', 'hs-form');
  form.setAttribute('autocomplete', 'off');
  const input = el('input', 'hs-input');
  input.type = 'text'; input.name = 'navn'; input.maxLength = NAVN_MAKS;
  input.placeholder = 'Dit navn'; input.setAttribute('aria-label', 'Dit navn');
  input.setAttribute('enterkeyhint', 'done'); input.autocapitalize = 'words'; input.spellcheck = false;
  input.value = startVaerdi || '';
  const knap = el('button', (opt.knap || 'btn') + ' hs-gem', knapTekst);
  knap.type = 'submit';
  form.appendChild(input); form.appendChild(knap);
  rod.appendChild(form);
  const status = el('p', 'hs-status', '');
  rod.appendChild(status);
  if (!input.value) setTimeout(() => input.focus({ preventScroll: true }), 50);
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const n = input.value.trim();
    if (!n) { input.focus(); return; }
    knap.disabled = true; status.textContent = 'Gemmer…';
    try { await onNavn(n); }
    catch (err) { knap.disabled = false; status.textContent = 'Kunne ikke gemme – prøv igen.'; }
  });
}

/** Viser resultatet af en gemning: overskrift med navn, listen med egen række fremhævet, og knappen til at skifte navn. */
function visGemt(rod, opt, svar, n) {
  tegnListe(rod, svar.liste || [], svar.id, titelEfterGem(svar, n, opt.format), opt.format);
  const skift = el('button', 'hs-skift', 'Ikke ' + n + ', der spiller?');
  skift.type = 'button';
  skift.addEventListener('click', () => {
    rod.innerHTML = '';
    rod.appendChild(el('div', 'hs-titel', 'Hvad hedder du så?'));
    navneFormular(rod, opt, '', 'Skift navn', async nyt => {
      navn.gem(nyt);
      if (svar.token && svar.id && !svar.uaendret) {
        // Rækken blev gemt lige før: ret navnet på den (serveren tjekker token).
        const ret = await omdoeb(opt.spil, svar.id, svar.token, nyt);
        if (ret.id === svar.id) ret.token = svar.token;   // så man kan skifte igen
        visGemt(rod, opt, ret, nyt);
      } else {
        // Ingen egen ny række (rekorden stod i forvejen under det gamle navn): gem forfra under det nye.
        await panel(rod, opt);
      }
    });
  });
  rod.appendChild(skift);
}

/**
 * Hele forløbet efter et spil. `score` udelades for bare at vise listen.
 * Options: { spil, score, format(score), titel = 'Topliste', knap = 'btn', onGemt(placering) }.
 */
async function panel(rod, opt) {
  const spil = opt.spil, score = opt.score, format = opt.format;
  rod.innerHTML = '';
  rod.appendChild(el('p', 'hs-venter', 'Henter toplisten…'));

  let top;
  try { top = await hent(spil); } catch (e) { tegnFejl(rod); return; }
  const liste = top.liste || [];
  const kendt = navn.hent();

  if (!kvalificerer(top, score)) { tegnListe(rod, liste, kendt || null, opt.titel, format); return; }

  const faerdig = (svar, n) => { visGemt(rod, opt, svar, n); if (opt.onGemt) opt.onGemt(svar.placering); };

  if (!kendt) {
    // Første gang: spørg om navn.
    rod.innerHTML = '';
    const erNr1 = !liste.length || bedre(score, liste[0].score, top.retning);
    rod.appendChild(el('div', 'hs-titel hs-jubel',
      erNr1 ? 'Ny rekord – hvad hedder du?'
        : iTop(top, score) ? 'Du er på toplisten – hvad hedder du?'
        : 'Kom med på listen – hvad hedder du?'));
    navneFormular(rod, opt, '', 'Gem på listen', async n => {
      const svar = await send(spil, n, score);
      navn.gem(n);
      faerdig(svar, n);
    });
    return;
  }

  // Navnet er kendt: gem med det samme.
  rod.innerHTML = '';
  rod.appendChild(el('p', 'hs-venter', 'Gemmer på toplisten…'));
  try { faerdig(await send(spil, kendt, score), kendt); }
  catch (e) { tegnFejl(rod, 'Kunne ikke gemme på toplisten.'); }
}

/* ---------- Standard-stil (kan overstyres af spillets CSS) ---------- */
const css = `
.hs-titel{font-weight:800;font-size:17px;margin:14px 0 8px;color:var(--text,#fff)}
.hs-jubel{color:var(--sun,#ffd447);font-size:20px}
.hs-liste{position:relative;list-style:none;margin:0;padding:0;max-height:38vh;overflow-y:auto;-webkit-overflow-scrolling:touch;
  background:var(--bg2,rgba(255,255,255,.06));border-radius:16px;text-align:left}
.hs-raekke{display:flex;align-items:center;gap:10px;padding:7px 14px;font-size:16px;color:var(--text,#fff)}
.hs-raekke+.hs-raekke{border-top:1px solid rgba(255,255,255,.06)}
.hs-spring{display:block;text-align:center;color:var(--muted,#aaa);padding:2px 14px;letter-spacing:3px;
  border-top:1px solid rgba(255,255,255,.06)}
.hs-spring+.hs-raekke{border-top:1px solid rgba(255,255,255,.06)}
.hs-nr{min-width:26px;color:var(--muted,#aaa);font-variant-numeric:tabular-nums;font-weight:700;flex:none}
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
.hs-skift{display:block;margin:6px auto 0;background:none;border:0;color:var(--muted,#aaa);font:inherit;font-size:14px;
  text-decoration:underline;padding:8px 12px;min-height:36px;cursor:pointer}
.hs-flere{display:block;margin:8px auto 0;background:none;border:0;color:var(--sun,#ffd447);font:inherit;font-size:14px;
  font-weight:700;text-decoration:underline;padding:8px 12px;min-height:36px;cursor:pointer}
`;
const style = document.createElement('style');
style.textContent = css;
document.head.appendChild(style);

window.Highscore = { hent, send, omdoeb, kvalificerer, iTop, tegnListe, tegnFejl, panel, navn, LAENGDE, PLADSER };
})();
