/*
  Papirøen – «spil sammen»: to venner på det samme stykke papir, én på hver telefon.

  Papirøen er ikke turbaseret som Kryds og bolle og Dybet: klatterne kører hele
  tiden, og rummet (public/spil/rum.js) henter og skriver et par gange i
  sekundet. Vennens klat er derfor altid et sekund bagud, og det er hele
  opgaven: reglerne skal kunne holde til det. Tre greb gør dem til det:

    1) **Hver telefon passer sin egen klat.** Min position, min streg, mit
       område og mit liv regnes her; vennens kommer færdigt fra rummet. Så er
       der aldrig to, der bestemmer det samme.
    2) **Papiret er *ændringer*, ikke et facit.** Vennens felter kommer som en
       maske (ét bit pr. felt), men kun det, der er *kommet til* siden sidst,
       tages – også fra mig. Så vinder den nyeste sløjfe, uden at de to skal
       blive enige om et ur, og de to skærme ender det samme sted.
    3) **Et drab er et krav, ikke en dom.** Kører jeg over vennens streg, kan
       jeg kun se den streg, hans telefon sendte for et sekund siden. Derfor
       *kræver* jeg ham ude, og hans telefon svarer: lå feltet stadig i hans
       streg, ryger han ud – var han nået hjem, skete der ingenting. Man kan
       altså ikke klippe det sidste stykke af en streg, men aldrig heller blive
       taget for en streg, man for længst har lukket.

  Der er ingen bots med, når to spiller sammen: de skulle simuleres på begge
  telefoner og ville drive fra hinanden med det samme. Til gengæld kommer man
  igen, når man ryger ud, og runden varer TID sekunder – den med mest papir til
  sidst har vundet.

  Alt herinde er ren JavaScript uden DOM, så det kan enhedstestes med
  `node --test test/unit/papir-sammen.test.mjs`.
*/
import { N, FELTER, taelFelter, doed } from './papir.mjs';

/** En runde varer to minutter. Så kan man nå et par gode sløjfer og et slagsmål. */
export const TID = 120;
/** Vennens klat har altid id 2 – min egen er 1 på begge telefoner. */
export const VEN = 2;

export const anden = r => (r === 'vaert' ? 'gaest' : 'vaert');

/* ---------- Pakning: papiret skal kunne være i 4000 tegn ---------- */

const TEGN = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+-';
const VÆRDI = (() => { const m = Object.create(null); for (let i = 0; i < 64; i++) m[TEGN[i]] = i; return m; })();
const tal6 = (s, n) => { const v = VÆRDI[s[n]]; return v === undefined ? 0 : v; };

/** Mit område som ét bit pr. felt: 1600 felter bliver til 267 tegn. */
export function pakMaske(ejer, id) {
  let ud = '', bit = 0, t = 0;
  for (let i = 0; i < FELTER; i++) {
    if (ejer[i] === id) t |= 1 << bit;
    if (++bit === 6) { ud += TEGN[t]; t = 0; bit = 0; }
  }
  return bit ? ud + TEGN[t] : ud;
}

/** … og tilbage igen. Ukendte tegn læses som tomt papir. */
export function udpakMaske(s) {
  const ud = new Uint8Array(FELTER);
  if (typeof s !== 'string') return ud;
  for (let i = 0; i < FELTER; i++) ud[i] = (tal6(s, (i / 6) | 0) >> (i % 6)) & 1;
  return ud;
}

/** Felterne i en maske, som Int8Array-banen bruger dem. */
export function maskeAf(ejer, id) {
  const ud = new Uint8Array(FELTER);
  for (let i = 0; i < FELTER; i++) if (ejer[i] === id) ud[i] = 1;
  return ud;
}

/**
 * Stregen: længden, startfeltet og så to bit pr. skridt. Rækkefølgen skal med –
 * det er den, der gør stregen til en streg og ikke en sky af felter.
 */
export function pakStreg(streg) {
  if (!streg || !streg.length) return '';
  const to = v => TEGN[v & 63] + TEGN[(v >> 6) & 63];
  let ud = to(streg.length) + to(streg[0]), t = 0, n = 0;
  for (let k = 1; k < streg.length; k++) {
    const d = streg[k] - streg[k - 1];
    t |= (d === 1 ? 0 : d === N ? 1 : d === -1 ? 2 : 3) << (n * 2);
    if (++n === 3) { ud += TEGN[t]; t = 0; n = 0; }
  }
  return n ? ud + TEGN[t] : ud;
}

export function udpakStreg(s) {
  if (typeof s !== 'string' || s.length < 4) return [];
  const laengde = tal6(s, 0) | (tal6(s, 1) << 6);
  let felt = tal6(s, 2) | (tal6(s, 3) << 6);
  if (laengde < 1 || laengde > FELTER || felt < 0 || felt >= FELTER) return [];
  const ud = [felt];
  for (let k = 1; k < laengde; k++) {
    const r = (tal6(s, 4 + (((k - 1) / 3) | 0)) >> (((k - 1) % 3) * 2)) & 3;
    felt += [1, N, -1, -N][r];
    if (felt < 0 || felt >= FELTER) break;
    ud.push(felt);
  }
  return ud;
}

/* ---------- Min halvdel af rummet ---------- */

const heltal = (v, lav, høj, ellers) =>
  (Number.isFinite(v) ? Math.max(lav, Math.min(høj, Math.round(v))) : ellers);

/**
 * Sådan ser jeg ud for vennen. `ekstra` er runden, uret og de krav, jeg har
 * rejst – resten kommer fra min egen klat.
 */
export function pak(bane, mig, ekstra = {}) {
  return {
    omraade: pakMaske(bane.ejer, mig.id),
    streg: pakStreg(mig.streg),
    x: mig.cx, y: mig.cy, d: mig.dir,
    liv: mig.levende ? 1 : 0,
    felter: mig.felter, bedste: mig.bedste, sloejfer: mig.sløjfer,
    doede: mig.doede, af: mig.sidsteAf | 0,
    ...ekstra,
  };
}

/** En tom halvdel, så resten kan regne uden at kigge efter null hele vejen. */
export const tomHalv = () => ({
  omraade: '', streg: '', x: 0, y: 0, d: 0, liv: 1,
  felter: 0, bedste: 0, sloejfer: 0, doede: 0, af: 0, runde: 1, tid: 0, krav: [], kravOk: 0, faerdig: 0,
});

/** Det, der skal huskes mellem to svar fra rummet. */
export function nySammen(kode, rolle) {
  return {
    kode, rolle,
    runde: 1,
    venMaske: new Uint8Array(FELTER),   // vennens felter, som vi lagde dem ind sidst
    venDoede: 0, venFelter: 0, venSlut: false, venTid: 0,
    krav: [], naeste: 1, behandlet: 0,  // mine krav mod vennen – og hans mod mig
    minSlut: false,
  };
}

/** Runden begynder forfra: det samme papir, men ingen gammel snak med. */
export function nulstilSammen(sam, bane, runde) {
  sam.runde = runde;
  sam.venMaske = maskeAf(bane.ejer, VEN);
  sam.venDoede = 0; sam.venFelter = bane.spillere[1] ? bane.spillere[1].felter : 0;
  sam.venSlut = false; sam.venTid = 0;
  sam.krav = []; sam.naeste = 1; sam.behandlet = 0;
  sam.minSlut = false;
  return sam;
}

/* ---------- Vennens halvdel ind på papiret ---------- */

/**
 * Skriver vennens halvdel ind i banen og svarer med de hændelser, skærmen skal
 * vide noget om: `{slags: 'doed'|'venUde'}`. Kun det, der har flyttet sig,
 * røres – se hovedet på filen.
 */
export function anvend(bane, sam, halv) {
  const h = [];
  const ven = bane.spillere[VEN - 1];
  if (!ven || !halv || typeof halv !== 'object') return h;
  const mig = bane.spillere[0];

  // 1) Papiret: vennens nye felter tages – også fra mig – og det, han har
  //    mistet, bliver til tomt papir igen.
  const ny = udpakMaske(halv.omraade);
  for (let i = 0; i < FELTER; i++) {
    if (ny[i] && !sam.venMaske[i]) bane.ejer[i] = VEN;
    else if (!ny[i] && sam.venMaske[i] && bane.ejer[i] === VEN) bane.ejer[i] = 0;
  }
  sam.venMaske = ny;

  // 2) Stregen ligger på papiret, så jeg kan køre over den
  for (const i of ven.streg) if (bane.spor[i] === VEN) bane.spor[i] = 0;
  ven.streg = udpakStreg(halv.streg).filter(i => bane.ejer[i] !== VEN);
  for (const i of ven.streg) if (!bane.spor[i]) bane.spor[i] = VEN;

  // 3) Hvor vennen står
  ven.cx = heltal(halv.x, 0, N - 1, ven.cx);
  ven.cy = heltal(halv.y, 0, N - 1, ven.cy);
  ven.dir = heltal(halv.d, 0, 3, ven.dir);
  ven.levende = halv.liv !== 0;
  ven.ude = ven.streg.length > 0;
  ven.sløjfer = heltal(halv.sloejfer, 0, 9999, ven.sløjfer);
  taelFelter(bane);

  // 4) Vennens krav: kørte han over min streg, mens den lå der?
  for (const k of Array.isArray(halv.krav) ? halv.krav : []) {
    const nr = heltal(k && k[0], 1, 1e9, 0), felt = heltal(k && k[1], 0, FELTER - 1, -1);
    if (!nr || felt < 0 || nr <= sam.behandlet) continue;
    sam.behandlet = nr;
    if (mig.levende && mig.streg.includes(felt)) doed(bane, mig, 'ramt', h, ven);
  }
  // … og mine krav er nået frem, når han har svaret på dem
  const kvitteret = heltal(halv.kravOk, 0, 1e9, 0);
  if (kvitteret) sam.krav = sam.krav.filter(k => k[0] > kvitteret);

  // 5) Tog vennen hele mit område, har jeg ikke noget hjem at lukke sløjfen i
  if (mig.levende && mig.felter === 0) doed(bane, mig, 'overtaget', h, ven);

  // 6) Og røg vennen ud – var det så mig, der tog ham?
  const doede = heltal(halv.doede, 0, 1e9, 0);
  if (doede > sam.venDoede) {
    // Klatterne er nummereret spejlvendt: på hver telefon er man selv 1 og
    // vennen 2. Står der «af: 2» i vennens halvdel, siger han altså, at det var
    // mig, der tog ham.
    const minFortjeneste = heltal(halv.af, 0, 9, 0) === VEN;
    if (minFortjeneste) mig.drab++;
    sam.venDoede = doede;
    h.push({ slags: 'venUde', af: minFortjeneste ? mig.id : 0 });
  }

  sam.venFelter = heltal(halv.felter, 0, FELTER, sam.venFelter);
  sam.venTid = Number.isFinite(halv.tid) ? halv.tid : sam.venTid;
  sam.venSlut = halv.faerdig === 1;
  return h;
}

/* ---------- Runden ---------- */

/**
 * Frøet til en runde. Begge telefoner regner det samme ud af rumkoden, så
 * papiret og de to startområder er ens uden at skulle sendes.
 */
export function froe(kode, runde) {
  let h = 2166136261;
  for (const c of String(kode || '')) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return (h + runde * 2654435761) >>> 0;
}

export const tidTilbage = bane => Math.max(0, TID - bane.t);

export const tidTekst = sek =>
  Math.floor(Math.max(0, sek) / 60) + ':' + String(Math.floor(Math.max(0, sek) % 60)).padStart(2, '0');

/** Hvem vandt? Begge telefoner regner det ud af de samme to tal. */
export function resultat(mine, dens) {
  if (mine > dens) return 'vundet';
  if (mine < dens) return 'tabt';
  return 'lige';
}

/** Overskriften på slutskærmen. */
export function slutTitel(res, navn) {
  if (res === 'vundet') return 'Du vandt!';
  if (res === 'tabt') return (navn || 'Vennen') + ' vandt!';
  return 'Helt lige!';
}
