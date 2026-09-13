/*
  Søg på spil på forsiden af zydy.dk. Modul uden build:

    <script type="module" src="/soeg.js"></script>

  Selmas ønske: «Gør at man kan søge på spil». Der er efterhånden over tyve kort
  på forsiden, og skal man finde ét bestemt, er man nødt til at rulle forbi dem
  alle sammen. Feltet her ligger lige over listen og skjuler de kort, der ikke
  passer, mens man skriver.

  Fire ting er værd at vide:

  1. **Kortene læses fra siden, ikke fra en liste her.** Navn, beskrivelse og
     nøgleord står i hvert kort (<h2>, <p> og data-noegleord, som
     scripts/byg-forside.mjs skriver ud fra spillets eget kort.json), så et nyt
     spil kan søges frem uden at nogen rører denne fil.
  2. **Rækkefølgen bliver som den er.** Forsiden sorterer kortene efter, hvad der
     bliver spillet mest, og vi filtrerer kun — så det spil, man plejer at finde
     øverst, står stadig øverst, når man har skrevet to bogstaver.
  3. **Enter går ind i det øverste spil, der er tilbage.** Skriver man «kat» og
     trykker retur, er man i spillet — uden at ramme et kort med fingeren.
  4. **Finder vi ingenting, foreslår vi det som et nyt spil.** Så bliver en
     forgæves søgning til et ønske i stedet for en blindgyde (/ideer.js).

  Reglerne for hvad der passer til hvad, ligger i soeg-regler.mjs (enhedstestet).
*/
import { passer, ord } from './soeg-regler.mjs';

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};

/** Ét kort på forsiden læst som noget, der kan søges i. */
function kortFra(li) {
  return {
    li,
    id: li.dataset.spil,
    navn: (li.querySelector('h2') || {}).textContent || '',
    beskrivelse: (li.querySelector('.text p') || {}).textContent || '',
    noegleord: li.dataset.noegleord || '',
    link: li.querySelector('a'),
  };
}

function start() {
  const liste = document.getElementById('apps');
  if (!liste || document.getElementById('soegFelt')) return;
  const kort = Array.prototype.slice.call(liste.querySelectorAll('li[data-spil]')).map(kortFra);
  if (!kort.length) return;

  const boks = el('section', 'sg');
  const form = el('form', 'sg-form');
  form.setAttribute('role', 'search');

  const ikon = el('span', 'sg-ikon', '🔍');
  ikon.setAttribute('aria-hidden', 'true');
  form.appendChild(ikon);

  const felt = el('input', 'sg-felt');
  felt.id = 'soegFelt';
  felt.type = 'search';
  felt.name = 'soeg';
  felt.placeholder = 'Søg efter et spil';
  felt.setAttribute('aria-label', 'Søg efter et spil');
  felt.autocomplete = 'off';
  felt.spellcheck = false;
  felt.setAttribute('enterkeyhint', 'search');
  form.appendChild(felt);

  const ryd = el('button', 'sg-ryd', '×');
  ryd.type = 'button';
  ryd.hidden = true;
  ryd.setAttribute('aria-label', 'Ryd søgningen');
  form.appendChild(ryd);

  const status = el('p', 'sg-status');
  status.setAttribute('aria-live', 'polite');
  status.hidden = true;

  boks.appendChild(form);
  boks.appendChild(status);
  liste.insertAdjacentElement('beforebegin', boks);

  /** Kortene, der er tilbage efter det, der står i feltet – i sidens egen rækkefølge. */
  let tilbage = kort.slice();

  function tegn() {
    const soegning = felt.value;
    const soeger = ord(soegning).length > 0;
    tilbage = [];
    kort.forEach(k => {
      const med = passer(k, soegning);
      k.li.hidden = !med;
      if (med) tilbage.push(k);
    });
    // Rækkefølgen på skærmen kan være en anden end den, vi læste kortene i
    // (forsiden sorterer efter popularitet), så Enter skal følge skærmen.
    tilbage.sort((a, b) => (a.li.compareDocumentPosition(b.li) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));

    ryd.hidden = !soegning;
    status.hidden = !soeger;
    status.innerHTML = '';
    if (!soeger) return;

    if (tilbage.length) {
      status.className = 'sg-status';
      status.textContent = tilbage.length === 1 ? 'Ét spil' : tilbage.length + ' spil';
      return;
    }
    // Ingenting. Så spørger vi, om det skal laves – teksten står klar i feltet.
    status.className = 'sg-status sg-intet';
    status.appendChild(document.createTextNode('Vi har ikke noget, der hedder «' + soegning.trim() + '». '));
    const knap = el('button', 'sg-foreslaa', 'Ønsk dig det som nyt spil');
    knap.type = 'button';
    knap.addEventListener('click', () => {
      if (window.Ideer && window.Ideer.nytSpil) window.Ideer.nytSpil(soegning.trim());
    });
    status.appendChild(knap);
  }

  felt.addEventListener('input', tegn);
  felt.addEventListener('search', tegn);          // det lille kryds i Safaris søgefelt
  felt.addEventListener('keydown', e => {
    if (e.key === 'Escape' && felt.value) { e.preventDefault(); felt.value = ''; tegn(); }
  });
  ryd.addEventListener('click', () => { felt.value = ''; tegn(); felt.focus(); });

  // Retur går ind i det øverste spil, der er tilbage. Er der ingen, sker der
  // ingenting – men tastaturet lukker, så man kan se hvad der skete.
  form.addEventListener('submit', e => {
    e.preventDefault();
    felt.blur();
    const foerste = tilbage[0];
    if (foerste && foerste.link) foerste.link.click();
  });

  tegn();
  window.Soeg = { felt, tegn, tilbage: () => tilbage.map(k => k.id) };
}

const css = `
.sg{width:100%;margin:0 0 16px}
.sg-form{display:flex;align-items:center;gap:10px;background:var(--bg2,#1b1f42);
  border:2px solid transparent;border-radius:999px;padding:6px 8px 6px 16px;min-height:56px}
.sg-form:focus-within{border-color:var(--sun,#ffd447)}
.sg-ikon{font-size:20px;line-height:1;opacity:.85}
.sg-felt{flex:1;min-width:0;font:inherit;font-size:18px;font-weight:700;background:none;border:0;
  color:var(--text,#fff7e6);outline:none;padding:8px 0;-webkit-appearance:none;appearance:none}
.sg-felt::placeholder{color:var(--muted,#a9acd6);font-weight:500}
.sg-felt::-webkit-search-decoration,.sg-felt::-webkit-search-cancel-button{-webkit-appearance:none}
.sg-ryd{flex:0 0 auto;width:40px;height:40px;border:0;border-radius:50%;cursor:pointer;
  background:rgba(255,255,255,.09);color:var(--text,#fff7e6);font:inherit;font-size:24px;line-height:1;padding:0}
.sg-ryd:hover{background:rgba(255,255,255,.16)}
.sg-ryd[hidden]{display:none}
/* Feltet viser selv, at det er i brug, ved at hele pillen bliver gul
   (:focus-within) – en ekstra ramme om selve feltet bliver til en kasse i en kasse. */
.sg-ryd:focus-visible{outline:3px solid var(--sun,#ffd447);outline-offset:3px}
.sg-status{margin:10px 6px 0;color:var(--muted,#a9acd6);font-size:15px;line-height:1.4}
.sg-status[hidden]{display:none}
.sg-intet{color:var(--text,#fff7e6)}
.sg-foreslaa{background:none;border:0;padding:0;font:inherit;font-size:15px;color:var(--sun,#ffd447);
  text-decoration:underline;cursor:pointer}
/* Kortene skjules med hidden. /ideer.js sætter display:flex på li[data-spil],
   og en author-regel slår browserens egen [hidden] – derfor står den her. */
#apps li[data-spil][hidden]{display:none}
`;
const style = document.createElement('style');
style.textContent = css;
document.head.appendChild(style);

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();
