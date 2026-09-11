// Stenalder – regelmotor. Ren JavaScript uden DOM, så den kan testes i Node.
//
// Brug:  let s = nytSpil({ navne: ['Anna', 'Bo'], seed: 1 });
//        s = udfoer(s, { type: 'placer', sted: 'skov', antal: 2 });
// udfoer() returnerer en ny tilstand og kaster en Error med dansk tekst,
// hvis handlingen er ulovlig. Tilstanden er ren JSON og kan gemmes direkte.
//
// Faser:  placering → handling → fodring → (ny runde | slut)
// Når spillet venter på et valg midt i en handling (redskaber, betaling,
// terningkort, fodring), står det i s.afventer med feltet `spiller`, som
// siger hvem der skal vælge. UI'et viser en dialog ud fra afventer.type.

import {
  RESSOURCER, VAERDI, NAVN, STEDER, LANDSBY, TERNINGSTEDER, KORT, BYGNINGER,
  TERNINGKORT_GEVINST, MAX_FOLK, MAX_LANDBRUG, MAX_REDSKAB, START_FOLK, START_MAD,
  KORTPLADSER, BYGNINGER_PR_STAK,
} from './data.mjs';

export const FARVER = [
  { navn: 'Rød',  hex: '#e0533f' },
  { navn: 'Blå',  hex: '#3f7fe0' },
  { navn: 'Grøn', hex: '#4fb26b' },
  { navn: 'Gul',  hex: '#e9c13f' },
];

// ---- Tilfældighed (mulberry32, tilstanden ligger i s.rng) ---------------

function tilfaeldig(s) {
  let t = (s.rng = (s.rng + 0x6D2B79F5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function terning(s) { return 1 + Math.floor(tilfaeldig(s) * 6); }
function bland(s, liste) {
  for (let i = liste.length - 1; i > 0; i--) {
    const j = Math.floor(tilfaeldig(s) * (i + 1));
    [liste[i], liste[j]] = [liste[j], liste[i]];
  }
  return liste;
}

const klon = x => JSON.parse(JSON.stringify(x));
const fejl = t => { throw new Error(t); };
const tomRess = () => ({ trae: 0, ler: 0, sten: 0, guld: 0 });
const sumRess = r => RESSOURCER.reduce((a, k) => a + (r[k] || 0), 0);
export const vaerdiAf = r => RESSOURCER.reduce((a, k) => a + (r[k] || 0) * VAERDI[k], 0);

export function alleSteder(s) {
  const st = [...TERNINGSTEDER, ...LANDSBY];
  for (let i = 0; i < KORTPLADSER; i++) st.push(`kort:${i}`);
  for (let i = 0; i < s.bygningsstakke.length; i++) st.push(`bygning:${i}`);
  return st;
}

// ---- Opsætning -----------------------------------------------------------

export function nytSpil({ navne, seed = Date.now() % 2147483647 } = {}) {
  if (!navne || navne.length < 2 || navne.length > 4) fejl('Stenalder spilles af 2-4 spillere.');
  const s = {
    version: 1,
    seed, rng: seed >>> 0,
    runde: 1,
    fase: 'placering',
    startspiller: 0,
    aktiv: 0,
    afventer: null,
    spillere: navne.map((navn, i) => ({
      navn: String(navn || `Spiller ${i + 1}`).slice(0, 14),
      farve: i,
      point: 0,
      folk: START_FOLK,
      ledige: START_FOLK,
      mad: START_MAD,
      landbrug: 0,
      ressourcer: tomRess(),
      redskaber: [0, 0, 0],
      brugte: [false, false, false],
      engangsredskaber: [],   // [{ kort, vaerdi }]
      kort: [],               // kort-id'er (slutscoring)
      aabneKort: [],          // kort-id'er med "2 valgfri ressourcer" der endnu ikke er brugt
      bygninger: [],          // bygnings-id'er
      placeringer: [],        // [{ sted, antal }] – folk på brættet, der endnu ikke er brugt
    })),
    braet: {},                // sted → [{ spiller, antal }]
    kortbunke: [],
    kortudlagt: Array(KORTPLADSER).fill(null),   // indeks 0 er billigst (pris 1)
    bygningsstakke: [],
    log: [],
    resultat: null,
    fortryd: null,            // tilstand før sidste placering (til "Fortryd")
  };
  s.kortbunke = bland(s, KORT.map(k => k.id));
  const brikker = bland(s, BYGNINGER.map(b => b.id));
  for (let i = 0; i < navne.length; i++) {
    s.bygningsstakke.push(brikker.slice(i * BYGNINGER_PR_STAK, (i + 1) * BYGNINGER_PR_STAK));
  }
  for (let i = KORTPLADSER - 1; i >= 0; i--) s.kortudlagt[i] = s.kortbunke.shift();
  for (const st of alleSteder(s)) s.braet[st] = [];
  logg(s, `Spillet begynder. ${s.spillere[0].navn} starter.`);
  return s;
}

function logg(s, tekst) {
  s.log.push(`R${s.runde}: ${tekst}`);
  if (s.log.length > 80) s.log.shift();
}

// ---- Hjælpere ------------------------------------------------------------

function optaget(s, sted) { return s.braet[sted].reduce((a, p) => a + p.antal, 0); }
function spillerePaa(s, sted) { return s.braet[sted].map(p => p.spiller); }
function kapacitet(s, sted) {
  if (sted.startsWith('kort:') || sted.startsWith('bygning:')) return 1;
  return STEDER[sted].kapacitet;
}
export function redskabsvaerdi(sp) { return sp.redskaber.reduce((a, b) => a + b, 0); }
export function ledigeRedskaber(sp) {
  return sp.redskaber.map((v, i) => ({ plads: i, vaerdi: v })).filter(r => r.vaerdi > 0 && !sp.brugte[r.plads]);
}

// Redskaber tildeles i fast rækkefølge (regelbogen): 1,1,1 → 2,2,2 → 3,3,3 → 4,4,4.
function tilfoejRedskab(s, sp) {
  const laveste = Math.min(...sp.redskaber);
  if (laveste >= MAX_REDSKAB) { logg(s, `${sp.navn} har allerede alle redskaber på ${MAX_REDSKAB}.`); return false; }
  const i = sp.redskaber.indexOf(laveste);
  sp.redskaber[i]++;
  return true;
}

function giv(s, sp, hvad, kilde) {
  switch (hvad.type) {
    case 'mad': sp.mad += hvad.antal; logg(s, `${sp.navn} får ${hvad.antal} mad${kilde}.`); break;
    case 'ressource': {
      const n = hvad.antal ?? 1;
      sp.ressourcer[hvad.ressource] += n;
      logg(s, `${sp.navn} får ${n} ${NAVN[hvad.ressource]}${kilde}.`); break;
    }
    case 'point': sp.point += hvad.antal; logg(s, `${sp.navn} får ${hvad.antal} point${kilde}.`); break;
    case 'redskab':
      if (tilfoejRedskab(s, sp)) logg(s, `${sp.navn} får et redskab${kilde}.`); break;
    case 'landbrug':
      if (sp.landbrug < MAX_LANDBRUG) { sp.landbrug++; logg(s, `${sp.navn} rykker op på madsporet${kilde}.`); }
      else logg(s, `${sp.navn} er allerede øverst på madsporet.`);
      break;
  }
}

// ---- Placering -----------------------------------------------------------

export function lovligePlaceringer(s, spillerIdx = s.aktiv) {
  if (s.fase !== 'placering') return [];
  const sp = s.spillere[spillerIdx];
  if (sp.ledige <= 0) return [];
  const n = s.spillere.length;
  const ud = [];
  const harPlaceret = sted => sp.placeringer.some(p => p.sted === sted);
  for (const sted of TERNINGSTEDER) {
    if (harPlaceret(sted)) continue;
    const plads = kapacitet(s, sted) - optaget(s, sted);
    if (plads <= 0) continue;
    if (sted !== 'jagt') {
      const andre = spillerePaa(s, sted).length;
      const maxSpillere = n === 2 ? 1 : n === 3 ? 2 : 4;
      if (andre >= maxSpillere) continue;
    }
    ud.push({ sted, min: 1, max: Math.min(plads, sp.ledige) });
  }
  const landsbyOptaget = LANDSBY.filter(st => optaget(s, st) > 0).length;
  const landsbyLukket = n <= 3 && landsbyOptaget >= 2;
  for (const sted of LANDSBY) {
    if (optaget(s, sted) > 0 || landsbyLukket) continue;
    const kraev = STEDER[sted].kapacitet; // mark 1, redskabsmager 1, hytte 2
    if (sp.ledige < kraev) continue;
    ud.push({ sted, min: kraev, max: kraev });
  }
  for (let i = 0; i < KORTPLADSER; i++) {
    const sted = `kort:${i}`;
    if (s.kortudlagt[i] == null || optaget(s, sted) > 0) continue;
    ud.push({ sted, min: 1, max: 1 });
  }
  for (let i = 0; i < s.bygningsstakke.length; i++) {
    const sted = `bygning:${i}`;
    if (!s.bygningsstakke[i].length || optaget(s, sted) > 0) continue;
    ud.push({ sted, min: 1, max: 1 });
  }
  return ud;
}

function placer(s, h) {
  const sp = s.spillere[s.aktiv];
  const regel = lovligePlaceringer(s).find(p => p.sted === h.sted);
  if (!regel) fejl('Der kan ikke placeres folk dér nu.');
  const antal = h.antal ?? regel.min;
  if (!Number.isInteger(antal) || antal < regel.min || antal > regel.max) {
    fejl(regel.min === regel.max ? `Der skal stå præcis ${regel.min} her.` : `Vælg mellem ${regel.min} og ${regel.max} folk.`);
  }
  s.fortryd = klon({ ...s, fortryd: null });
  s.braet[h.sted].push({ spiller: s.aktiv, antal });
  sp.placeringer.push({ sted: h.sted, antal });
  sp.ledige -= antal;
  logg(s, `${sp.navn} sætter ${antal} ${antal === 1 ? 'person' : 'folk'} på ${stedNavn(s, h.sted)}.`);
  naestePlacerer(s);
}

function naestePlacerer(s) {
  const n = s.spillere.length;
  for (let k = 1; k <= n; k++) {
    const i = (s.aktiv + k) % n;
    if (lovligePlaceringer(s, i).length) { s.aktiv = i; return; }
  }
  startHandlingsfase(s);
}

function fortrydPlacering(s) {
  if (!s.fortryd) fejl('Der er ikke noget at fortryde.');
  const f = s.fortryd;
  Object.assign(s, f, { fortryd: null });
}

export function stedNavn(s, sted) {
  if (sted.startsWith('kort:')) return `kort nr. ${Number(sted.slice(5)) + 1}`;
  if (sted.startsWith('bygning:')) return `bygningsstak ${Number(sted.slice(8)) + 1}`;
  return STEDER[sted].navn.toLowerCase();
}

// ---- Handlingsfase -------------------------------------------------------

function startHandlingsfase(s) {
  s.fase = 'handling';
  s.fortryd = null;
  s.aktiv = s.startspiller;
  s.afventer = null;
  logg(s, 'Alle folk er placeret. Handlingerne udføres.');
  naesteHandler(s);
}

// Går videre til næste spiller i rækkefølgen, der stadig har folk ude.
// Kaldes efter hver afsluttet handling; gør ingenting, hvis den aktive
// spiller stadig har folk på brættet eller et valg er i gang.
function naesteHandler(s) {
  if (s.afventer) return;
  const sp = s.spillere[s.aktiv];
  if (sp.placeringer.length) return;
  const n = s.spillere.length;
  const pos = (s.aktiv - s.startspiller + n) % n;
  for (let k = pos + 1; k < n; k++) {
    const i = (s.startspiller + k) % n;
    if (s.spillere[i].placeringer.length) { s.aktiv = i; return; }
  }
  startFodring(s);
}

function tagFolkHjem(s, sp, sted) {
  const idx = sp.placeringer.findIndex(p => p.sted === sted);
  const p = sp.placeringer[idx];
  sp.placeringer.splice(idx, 1);
  s.braet[sted] = s.braet[sted].filter(x => x.spiller !== s.aktiv);
  return p;
}

function handling(s, h) {
  if (s.afventer) fejl('Afslut først det igangværende valg.');
  const sp = s.spillere[s.aktiv];
  const p = sp.placeringer.find(x => x.sted === h.sted);
  if (!p) fejl('Du har ingen folk dér.');
  const sted = h.sted;
  if (TERNINGSTEDER.includes(sted)) {
    tagFolkHjem(s, sp, sted);
    const kast = Array.from({ length: p.antal }, () => terning(s));
    startRedskabsvalg(s, sp, { sted, ressource: STEDER[sted].ressource, kast });
  } else if (sted === 'mark') {
    tagFolkHjem(s, sp, sted); giv(s, sp, { type: 'landbrug' }, ' fra marken');
  } else if (sted === 'redskabsmager') {
    tagFolkHjem(s, sp, sted); giv(s, sp, { type: 'redskab' }, ' fra redskabsmageren');
  } else if (sted === 'hytte') {
    tagFolkHjem(s, sp, sted);
    if (sp.folk < MAX_FOLK) { sp.folk++; logg(s, `${sp.navn} får en ny person i hytten.`); }
  } else if (sted.startsWith('kort:')) {
    const plads = Number(sted.slice(5));
    s.afventer = { type: 'betalKort', spiller: s.aktiv, sted, plads, pris: plads + 1, kort: s.kortudlagt[plads] };
  } else if (sted.startsWith('bygning:')) {
    const stak = Number(sted.slice(8));
    s.afventer = { type: 'betalBygning', spiller: s.aktiv, sted, stak, bygning: s.bygningsstakke[stak][0] };
  } else fejl('Ukendt sted.');
  naesteHandler(s);
}

function startRedskabsvalg(s, sp, { sted, ressource, kast }) {
  const sum = kast.reduce((a, b) => a + b, 0);
  const kanBruge = ledigeRedskaber(sp).length + sp.engangsredskaber.length;
  const beskriv = sted ? stedNavn(s, sted) : 'kortet';
  logg(s, `${sp.navn} kaster ${kast.join('+')} = ${sum} på ${beskriv}.`);
  if (!kanBruge) { hoest(s, sp, ressource, sum, beskriv); return; }
  s.afventer = { type: 'redskaber', spiller: s.aktiv, sted: sted ?? null, ressource, kast, sum };
}

function hoest(s, sp, ressource, total, beskriv) {
  const n = Math.floor(total / VAERDI[ressource]);
  if (ressource === 'mad') sp.mad += n; else sp.ressourcer[ressource] += n;
  logg(s, `${sp.navn} får ${n} ${NAVN[ressource]} (${total} ÷ ${VAERDI[ressource]}).`);
}

function brugRedskaber(s, h) {
  const a = s.afventer;
  if (!a || a.type !== 'redskaber') fejl('Der er ikke noget terningkast at forbedre.');
  const sp = s.spillere[a.spiller];
  const pladser = [...new Set(h.pladser ?? [])];
  const engangs = [...new Set(h.engangs ?? [])];
  let bonus = 0;
  for (const i of pladser) {
    if (!(i in sp.redskaber) || sp.redskaber[i] === 0 || sp.brugte[i]) fejl('Det redskab kan ikke bruges nu.');
    bonus += sp.redskaber[i];
  }
  for (const kortId of engangs) {
    const e = sp.engangsredskaber.find(x => x.kort === kortId);
    if (!e) fejl('Det engangsredskab findes ikke.');
    bonus += e.vaerdi;
  }
  for (const i of pladser) sp.brugte[i] = true;
  sp.engangsredskaber = sp.engangsredskaber.filter(x => !engangs.includes(x.kort));
  if (bonus) logg(s, `${sp.navn} bruger redskaber for +${bonus}.`);
  s.afventer = null;
  hoest(s, sp, a.ressource, a.sum + bonus, a.sted ? stedNavn(s, a.sted) : 'kortet');
  fortsaetEfterValg(s);
}

// Efter et afsluttet valg: fortsæt den fase vi er i.
function fortsaetEfterValg(s) {
  if (s.afventer) return;
  if (s.fase === 'handling') naesteHandler(s);
  else if (s.fase === 'fodring') fodrVidere(s);
}

// ---- Betaling af kort og bygninger --------------------------------------

function harRess(sp, r) { return RESSOURCER.every(k => (r[k] || 0) <= sp.ressourcer[k]); }
function traekRess(sp, r) { for (const k of RESSOURCER) sp.ressourcer[k] -= (r[k] || 0); }
function normRess(r) {
  const ud = tomRess();
  for (const k of RESSOURCER) {
    const v = r?.[k] ?? 0;
    if (!Number.isInteger(v) || v < 0) fejl('Ugyldig betaling.');
    ud[k] = v;
  }
  return ud;
}

export function kanBetaleBygning(bygning, betaling) {
  const r = normRess(betaling);
  const antal = sumRess(r);
  const slags = RESSOURCER.filter(k => r[k] > 0).length;
  if (bygning.type === 'fast') return RESSOURCER.every(k => r[k] === bygning.pris[k]);
  if (bygning.type === 'antal') return antal === bygning.antal && slags === bygning.slags;
  return antal >= 1 && antal <= 7;
}

function betal(s, h) {
  const a = s.afventer;
  if (!a || (a.type !== 'betalKort' && a.type !== 'betalBygning')) fejl('Der er ikke noget at betale for.');
  const sp = s.spillere[a.spiller];
  const r = normRess(h.ressourcer);
  if (!harRess(sp, r)) fejl('Du har ikke de ressourcer.');
  if (a.type === 'betalKort') {
    if (sumRess(r) !== a.pris) fejl(`Kortet koster præcis ${a.pris} ressourcer.`);
    traekRess(sp, r);
    tagFolkHjem(s, sp, a.sted);
    const kort = KORT[a.kort];
    s.kortudlagt[a.plads] = null;
    sp.kort.push(kort.id);
    s.afventer = null;
    logg(s, `${sp.navn} køber kort nr. ${a.plads + 1} for ${beskrivRess(r)}.`);
    korteffekt(s, sp, kort);
  } else {
    const b = BYGNINGER[a.bygning];
    if (!kanBetaleBygning(b, r)) fejl('Betalingen passer ikke til bygningen.');
    traekRess(sp, r);
    tagFolkHjem(s, sp, a.sted);
    const point = vaerdiAf(r);
    sp.point += point;
    sp.bygninger.push(b.id);
    s.bygningsstakke[a.stak].shift();
    s.afventer = null;
    logg(s, `${sp.navn} bygger for ${beskrivRess(r)} og får ${point} point.`);
  }
  fortsaetEfterValg(s);
}

export function beskrivRess(r) {
  const dele = RESSOURCER.filter(k => r[k]).map(k => `${r[k]} ${NAVN[k]}`);
  return dele.length ? dele.join(', ') : 'ingenting';
}

function afstaa(s) {
  const a = s.afventer;
  if (!a || (a.type !== 'betalKort' && a.type !== 'betalBygning')) fejl('Der er ikke noget at afstå fra.');
  const sp = s.spillere[a.spiller];
  tagFolkHjem(s, sp, a.sted);
  s.afventer = null;
  logg(s, `${sp.navn} tager sin person hjem uden at betale.`);
  fortsaetEfterValg(s);
}

// ---- Korteffekter --------------------------------------------------------

function korteffekt(s, sp, kort) {
  const t = kort.top;
  switch (t.type) {
    case 'mad': case 'ressource': case 'point': case 'redskab': case 'landbrug':
      giv(s, sp, t, ' fra kortet'); break;
    case 'traekKort': {
      const id = s.kortbunke.shift();
      if (id != null) { sp.kort.push(id); logg(s, `${sp.navn} trækker et skjult kort til slutscoringen.`); }
      else logg(s, 'Kortbunken er tom, der er intet kort at trække.');
      break;
    }
    case 'engangsredskab':
      sp.engangsredskaber.push({ kort: kort.id, vaerdi: t.vaerdi });
      logg(s, `${sp.navn} får et engangsredskab +${t.vaerdi}.`); break;
    case 'valgfri2':
      sp.aabneKort.push(kort.id);
      logg(s, `${sp.navn} kan tage 2 valgfri ressourcer, nu eller senere.`); break;
    case 'terninger': {
      const kast = [terning(s), terning(s)];
      startRedskabsvalg(s, sp, { sted: null, ressource: t.ressource, kast });
      break;
    }
    case 'terningkort': {
      const n = s.spillere.length;
      const kast = Array.from({ length: n }, () => terning(s));
      logg(s, `Terningkort: ${sp.navn} kaster ${kast.join(', ')}.`);
      s.afventer = { type: 'terningkort', spiller: s.aktiv, koeber: s.aktiv, terninger: kast, taget: [] };
      break;
    }
  }
}

function vaelgTerning(s, h) {
  const a = s.afventer;
  if (!a || a.type !== 'terningkort') fejl('Der er ikke noget terningkort i spil.');
  const i = h.indeks;
  if (!(i in a.terninger) || a.taget.includes(i)) fejl('Den terning er allerede taget.');
  const sp = s.spillere[a.spiller];
  giv(s, sp, TERNINGKORT_GEVINST[a.terninger[i]], ' fra terningkortet');
  a.taget.push(i);
  if (a.taget.length >= a.terninger.length) { s.afventer = null; fortsaetEfterValg(s); return; }
  a.spiller = (a.spiller + 1) % s.spillere.length;
}

function brugValgfri2(s, h) {
  const idx = h.spiller ?? s.aktiv;
  const sp = s.spillere[idx];
  if (!sp.aabneKort.length) fejl('Du har ikke et kort med 2 valgfri ressourcer.');
  const a = s.afventer;
  const minTur = (s.fase === 'handling' && s.aktiv === idx && (!a || ((a.type === 'betalKort' || a.type === 'betalBygning') && a.spiller === idx)))
    || (s.fase === 'fodring' && a && a.type === 'fodring' && a.spiller === idx);
  if (!minTur) fejl('Kortet kan kun bruges, når det er din tur.');
  const r = normRess(h.ressourcer);
  if (sumRess(r) !== 2) fejl('Vælg præcis 2 ressourcer.');
  sp.aabneKort.shift();
  for (const k of RESSOURCER) sp.ressourcer[k] += r[k];
  logg(s, `${sp.navn} bruger sit kort og tager ${beskrivRess(r)}.`);
}

// ---- Fodring -------------------------------------------------------------

function startFodring(s) {
  s.fase = 'fodring';
  s.afventer = null;
  s.aktiv = s.startspiller;
  s.fodret = 0;
  logg(s, 'Folkene skal have mad.');
  fodrVidere(s);
}

function fodrVidere(s) {
  const n = s.spillere.length;
  while (s.fodret < n) {
    const i = (s.startspiller + s.fodret) % n;
    const sp = s.spillere[i];
    s.aktiv = i;
    if (!sp.fodringStartet) {
      sp.fodringStartet = true;
      sp.mad += sp.landbrug;
    }
    if (sp.mad >= sp.folk) {
      sp.mad -= sp.folk;
      logg(s, `${sp.navn} fodrer ${sp.folk} folk.`);
      delete sp.fodringStartet;
      s.fodret++;
      continue;
    }
    const mangler = sp.folk - sp.mad;
    if (sumRess(sp.ressourcer) === 0) {
      sp.mad = 0;
      sult(s, sp);
      delete sp.fodringStartet;
      s.fodret++;
      continue;
    }
    s.afventer = { type: 'fodring', spiller: i, mangler, mad: sp.mad };
    return;
  }
  delete s.fodret;
  afslutRunde(s);
}

function sult(s, sp) {
  sp.point = Math.max(0, sp.point - 10);
  logg(s, `${sp.navn} kan ikke fodre alle og mister 10 point.`);
}

function fodr(s, h) {
  const a = s.afventer;
  if (!a || a.type !== 'fodring') fejl('Der er ingen fodring i gang.');
  const sp = s.spillere[a.spiller];
  const mangler = sp.folk - sp.mad;
  const r = normRess(h.ressourcer);
  if (sumRess(r) !== mangler) fejl(`Du mangler præcis ${mangler} mad.`);
  if (!harRess(sp, r)) fejl('Du har ikke de ressourcer.');
  traekRess(sp, r);
  sp.mad = 0;
  logg(s, `${sp.navn} fodrer med ${beskrivRess(r)} i stedet for mad.`);
  delete sp.fodringStartet;
  s.fodret++;
  s.afventer = null;
  fodrVidere(s);
}

function sultFrivilligt(s) {
  const a = s.afventer;
  if (!a || a.type !== 'fodring') fejl('Der er ingen fodring i gang.');
  const sp = s.spillere[a.spiller];
  sp.mad = 0;
  sult(s, sp);
  delete sp.fodringStartet;
  s.fodret++;
  s.afventer = null;
  fodrVidere(s);
}

// ---- Rundeskift og slut --------------------------------------------------

function afslutRunde(s) {
  if (s.bygningsstakke.some(st => st.length === 0)) {
    logg(s, 'En bygningsstak er tom. Spillet er slut.');
    return slutspil(s);
  }
  // Kortene rykker mod den billige ende, og nye lægges fra den dyre ende.
  const rest = s.kortudlagt.filter(k => k != null);
  s.kortudlagt = Array(KORTPLADSER).fill(null);
  rest.forEach((k, i) => { s.kortudlagt[i] = k; });
  for (let i = KORTPLADSER - 1; i >= 0; i--) {
    if (s.kortudlagt[i] != null) continue;
    if (!s.kortbunke.length) {
      logg(s, 'Der er ikke kort nok til en ny runde. Spillet er slut.');
      return slutspil(s);
    }
    s.kortudlagt[i] = s.kortbunke.shift();
  }
  for (const sp of s.spillere) {
    sp.brugte = [false, false, false];
    sp.ledige = sp.folk;
    sp.placeringer = [];
  }
  for (const st of alleSteder(s)) s.braet[st] = [];
  s.startspiller = (s.startspiller + 1) % s.spillere.length;
  s.aktiv = s.startspiller;
  s.runde++;
  s.fase = 'placering';
  logg(s, `Ny runde. ${s.spillere[s.startspiller].navn} starter.`);
}

function slutspil(s) {
  s.fase = 'slut';
  s.afventer = null;
  s.resultat = slutscore(s);
}

export function slutscore(s) {
  const rk = s.spillere.map((sp, i) => {
    const kort = sp.kort.map(id => KORT[id]);
    const kulturTal = {};
    for (const k of kort) if (k.bund.type === 'kultur') kulturTal[k.bund.symbol] = (kulturTal[k.bund.symbol] || 0) + 1;
    let kultur = 0;
    const saet = [];
    while (true) {
      const symboler = Object.keys(kulturTal).filter(k => kulturTal[k] > 0);
      if (!symboler.length) break;
      saet.push(symboler.length);
      kultur += symboler.length ** 2;
      for (const k of symboler) kulturTal[k]--;
    }
    const antal = t => kort.filter(k => k.bund.type === 'specialist' && k.bund.specialist === t).reduce((a, k) => a + k.bund.antal, 0);
    const boender = antal('bonde') * sp.landbrug;
    const redskabsmagere = antal('redskabsmager') * redskabsvaerdi(sp);
    const hyttebyggere = antal('hyttebygger') * sp.bygninger.length;
    const shamaner = antal('shaman') * sp.folk;
    const ressourcer = sumRess(sp.ressourcer);
    const total = sp.point + kultur + boender + redskabsmagere + hyttebyggere + shamaner + ressourcer;
    return {
      spiller: i, navn: sp.navn, farve: sp.farve,
      undervejs: sp.point, kultur, kulturSaet: saet,
      boender, redskabsmagere, hyttebyggere, shamaner, ressourcer, total,
      tiebreak: sp.landbrug + redskabsvaerdi(sp) + sp.folk,
      antalKort: { bonde: antal('bonde'), redskabsmager: antal('redskabsmager'), hyttebygger: antal('hyttebygger'), shaman: antal('shaman') },
    };
  });
  const sorteret = [...rk].sort((a, b) => b.total - a.total || b.tiebreak - a.tiebreak);
  return { spillere: rk, raekkefoelge: sorteret.map(r => r.spiller), vinder: sorteret[0].spiller };
}

// ---- Indgang -------------------------------------------------------------

export function udfoer(tilstand, h) {
  const s = klon(tilstand);
  if (s.fase === 'slut') fejl('Spillet er slut.');
  switch (h.type) {
    case 'placer':
      if (s.fase !== 'placering') fejl('Det er ikke placeringsfasen.');
      placer(s, h); break;
    case 'fortryd':
      if (s.fase !== 'placering') fejl('Der kan kun fortrydes placeringer.');
      fortrydPlacering(s); break;
    case 'handling':
      if (s.fase !== 'handling') fejl('Det er ikke handlingsfasen.');
      handling(s, h); break;
    case 'brugRedskaber': brugRedskaber(s, h); break;
    case 'betal': betal(s, h); break;
    case 'afstaa': afstaa(s); break;
    case 'vaelgTerning': vaelgTerning(s, h); break;
    case 'brugValgfri2': brugValgfri2(s, h); break;
    case 'fodr': fodr(s, h); break;
    case 'sult': sultFrivilligt(s); break;
    default: fejl(`Ukendt handling: ${h.type}`);
  }
  if (h.type !== 'placer' && h.type !== 'fortryd') s.fortryd = null;
  return s;
}

// Hvem skal gøre noget lige nu? (bruges af UI og tests)
export function hvemErPaa(s) {
  if (s.fase === 'slut') return null;
  return s.afventer ? s.afventer.spiller : s.aktiv;
}

// ---- Tilfældig lovlig handling (til tests og en evt. fremtidig bot) -----

export function tilfaeldigHandling(s, rnd = Math.random) {
  const vaelg = liste => liste[Math.floor(rnd() * liste.length)];
  const a = s.afventer;
  if (a) {
    const sp = s.spillere[a.spiller];
    switch (a.type) {
      case 'redskaber': {
        const brug = rnd() < 0.5;
        return { type: 'brugRedskaber', pladser: brug ? ledigeRedskaber(sp).map(r => r.plads) : [], engangs: brug ? sp.engangsredskaber.map(e => e.kort) : [] };
      }
      case 'betalKort': {
        const r = tomRess();
        const pulje = RESSOURCER.flatMap(k => Array(sp.ressourcer[k]).fill(k));
        if (pulje.length < a.pris || rnd() < 0.15) return { type: 'afstaa' };
        for (let i = 0; i < a.pris; i++) r[pulje.splice(Math.floor(rnd() * pulje.length), 1)[0]]++;
        return { type: 'betal', ressourcer: r };
      }
      case 'betalBygning': {
        const b = BYGNINGER[a.bygning];
        const r = tomRess();
        if (b.type === 'fast') {
          if (!harRess(sp, b.pris) || rnd() < 0.1) return { type: 'afstaa' };
          return { type: 'betal', ressourcer: { ...b.pris } };
        }
        const slagsMedNoget = RESSOURCER.filter(k => sp.ressourcer[k] > 0);
        if (b.type === 'antal') {
          if (slagsMedNoget.length < b.slags || sumRess(sp.ressourcer) < b.antal) return { type: 'afstaa' };
          // prøv nogle gange at finde en gyldig fordeling
          for (let t = 0; t < 30; t++) {
            const valgte = [...slagsMedNoget].sort(() => rnd() - 0.5).slice(0, b.slags);
            const rr = tomRess();
            valgte.forEach(k => rr[k] = 1);
            let rest = b.antal - b.slags;
            while (rest > 0) {
              const k = vaelg(valgte);
              if (rr[k] < sp.ressourcer[k]) { rr[k]++; rest--; } else if (valgte.every(x => rr[x] >= sp.ressourcer[x])) break;
            }
            if (rest === 0 && kanBetaleBygning(b, rr) && harRess(sp, rr)) return { type: 'betal', ressourcer: rr };
          }
          return { type: 'afstaa' };
        }
        const total = sumRess(sp.ressourcer);
        if (!total) return { type: 'afstaa' };
        const pulje = RESSOURCER.flatMap(k => Array(sp.ressourcer[k]).fill(k));
        const antal = Math.min(7, total, 1 + Math.floor(rnd() * 7));
        for (let i = 0; i < antal; i++) r[pulje.splice(Math.floor(rnd() * pulje.length), 1)[0]]++;
        return { type: 'betal', ressourcer: r };
      }
      case 'terningkort':
        return { type: 'vaelgTerning', indeks: vaelg(a.terninger.map((_, i) => i).filter(i => !a.taget.includes(i))) };
      case 'fodring': {
        if (rnd() < 0.3) return { type: 'sult' };
        const mangler = sp.folk - sp.mad;
        const pulje = RESSOURCER.flatMap(k => Array(sp.ressourcer[k]).fill(k));
        if (pulje.length < mangler) return { type: 'sult' };
        const r = tomRess();
        for (let i = 0; i < mangler; i++) r[pulje.splice(Math.floor(rnd() * pulje.length), 1)[0]]++;
        return { type: 'fodr', ressourcer: r };
      }
    }
  }
  if (s.fase === 'placering') {
    const m = vaelg(lovligePlaceringer(s));
    return { type: 'placer', sted: m.sted, antal: m.min + Math.floor(rnd() * (m.max - m.min + 1)) };
  }
  if (s.fase === 'handling') {
    const sp = s.spillere[s.aktiv];
    if (sp.aabneKort.length && rnd() < 0.5) {
      const r = tomRess(); r[vaelg(RESSOURCER)]++; r[vaelg(RESSOURCER)]++;
      return { type: 'brugValgfri2', ressourcer: r };
    }
    return { type: 'handling', sted: vaelg(sp.placeringer).sted };
  }
  return null;
}
