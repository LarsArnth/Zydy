/*
  Slanger – «spil sammen»: to venner på den samme plade, én på hver telefon.

  Som Papirøen er spillet ikke turbaseret: slangerne kører hele tiden, og rummet
  (public/spil/rum.js) henter og skriver et par gange i sekundet. Vennens slange
  er derfor altid et sekund bagud, og reglerne skal kunne holde til det:

    1) **Hver telefon passer sin egen slange.** Min krop, min længde og mit liv
       regnes her; vennens kommer færdigt fra rummet. Kører jeg ind i vennens
       krop, som *jeg* ser den, er det mig, der dør – min egen død dømmer jeg
       selv, så der er ingen krav at forhandle.
    2) **Maden er tællere, ikke positioner.** Pladerne er de samme, fordi frøet
       er det samme (froe(kode, runde)), og madplads nr. j's position afhænger
       kun af, hvor mange gange den er spist (madPos i slange.mjs). Hver telefon
       sender sin egen spist-tæller pr. plads, og pladsens sande stilling er
       summen – spiser begge den samme perle i samme nu, vokser begge, og
       tælleren hopper 2. Det er præcis, hvad man vil have.
    3) **Æren for et drab står i dødstallet.** Dør jeg, sender jeg doede+1 og
       hvem det var (af: 2 betyder vennen – slangerne er nummereret spejlvendt,
       man er selv 1 på begge telefoner). Vennens telefon ser tallet hoppe og
       tager æren, hvis af peger på hen.

  Der er ingen bots og ingen perler fra døde, når to spiller sammen: begge dele
  skulle simuleres ens på to telefoner og ville drive fra hinanden. Til gengæld
  kommer man igen, når man dør, og runden varer TID sekunder – den længste
  slange (bedste længde) har vundet.

  Alt herinde er ren JavaScript uden DOM, så det kan enhedstestes med
  `node --test test/unit/slanger.test.mjs`.
*/
import { N, FELTER, MAD } from './slange.mjs';

/** En runde varer to minutter. Nok til at blive lang – og til et par ulykker. */
export const TID = 120;
/** Vennens slange har altid id 2 – min egen er 1 på begge telefoner. */
export const VEN = 2;

export const anden = r => (r === 'vaert' ? 'gaest' : 'vaert');

/* ---------- Pakning: kroppen skal kunne være i rummet ---------- */

const TEGN = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+-';
const VÆRDI = (() => { const m = Object.create(null); for (let i = 0; i < 64; i++) m[TEGN[i]] = i; return m; })();
const tal6 = (s, n) => { const v = VÆRDI[s[n]]; return v === undefined ? 0 : v; };

/**
 * Kroppen: længden, hovedfeltet og så to bit pr. led. Leddene ligger altid
 * felt om felt, så en slange på 100 felter fylder ~37 tegn.
 */
export function pakKrop(krop) {
  if (!krop || !krop.length) return '';
  const to = v => TEGN[v & 63] + TEGN[(v >> 6) & 63];
  let ud = to(krop.length) + to(krop[0]), t = 0, n = 0;
  for (let k = 1; k < krop.length; k++) {
    const d = krop[k] - krop[k - 1];
    t |= (d === 1 ? 0 : d === N ? 1 : d === -1 ? 2 : 3) << (n * 2);
    if (++n === 3) { ud += TEGN[t]; t = 0; n = 0; }
  }
  return n ? ud + TEGN[t] : ud;
}

export function udpakKrop(s) {
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
 * Sådan ser jeg ud for vennen. `ekstra` er runden, uret og om jeg er færdig –
 * resten kommer fra min egen slange og mine mad-tællere.
 */
export function pak(bane, mig, sam, ekstra = {}) {
  return {
    krop: pakKrop(mig.krop),
    d: mig.dir,
    liv: mig.levende ? 1 : 0,
    laengde: mig.krop.length, bedste: mig.bedste,
    doede: mig.doede, af: mig.sidsteAf | 0,
    spist: Array.from(sam.mineSpist),
    ...ekstra,
  };
}

/** Det, der skal huskes mellem to svar fra rummet. */
export function nySammen(kode, rolle) {
  return {
    kode, rolle,
    runde: 1,
    mineSpist: new Array(MAD).fill(0),   // mine tryk på hver madplads
    venSpist: new Array(MAD).fill(0),    // vennens, som vi sidst så dem
    venDoede: 0, venBedste: 0, venLaengde: 0, venSlut: false, venTid: 0,
    minSlut: false,
  };
}

/** Runden begynder forfra: den samme plade, men ingen gammel snak med. */
export function nulstilSammen(sam, runde) {
  sam.runde = runde;
  sam.mineSpist = new Array(MAD).fill(0);
  sam.venSpist = new Array(MAD).fill(0);
  sam.venDoede = 0; sam.venBedste = 0; sam.venLaengde = 0;
  sam.venSlut = false; sam.venTid = 0;
  sam.minSlut = false;
  return sam;
}

/* ---------- Vennens halvdel ind på pladen ---------- */

/**
 * Skriver vennens halvdel ind i banen og svarer med de hændelser, skærmen skal
 * vide noget om: `{slags: 'doed'|'venUde'}`.
 */
export function anvend(bane, sam, halv) {
  const h = [];
  const ven = bane.spillere[VEN - 1];
  if (!ven || !halv || typeof halv !== 'object') return h;
  const mig = bane.spillere[0];

  // 1) Vennens slange, som hans telefon så den sidst
  ven.krop = udpakKrop(halv.krop);
  ven.dir = heltal(halv.d, 0, 3, ven.dir);
  ven.levende = halv.liv !== 0;
  ven.bedste = heltal(halv.bedste, 0, FELTER, ven.bedste);

  // 2) Maden: vennens tællere går kun opad, og pladsens stilling er summen
  const ny = Array.isArray(halv.spist) ? halv.spist : [];
  for (let j = 0; j < MAD; j++) {
    sam.venSpist[j] = Math.max(sam.venSpist[j], heltal(ny[j], 0, 1e6, 0));
    bane.spist[j] = sam.mineSpist[j] + sam.venSpist[j];
  }

  // 3) Røg vennen ud – var det så mig, der tog hen?
  const doede = heltal(halv.doede, 0, 1e9, 0);
  if (doede > sam.venDoede) {
    // Slangerne er nummereret spejlvendt: på hver telefon er man selv 1 og
    // vennen 2. Står der «af: 2», siger vennen altså, at det var mig.
    const minFortjeneste = heltal(halv.af, 0, 9, 0) === VEN;
    if (minFortjeneste) mig.drab++;
    sam.venDoede = doede;
    h.push({ slags: 'venUde', af: minFortjeneste ? mig.id : 0 });
  }

  sam.venLaengde = heltal(halv.laengde, 0, FELTER, sam.venLaengde);
  sam.venBedste = Math.max(sam.venBedste, heltal(halv.bedste, 0, FELTER, 0));
  sam.venTid = Number.isFinite(halv.tid) ? halv.tid : sam.venTid;
  sam.venSlut = halv.faerdig === 1;
  return h;
}

/* ---------- Runden ---------- */

/**
 * Frøet til en runde. Begge telefoner regner det samme ud af rumkoden, så
 * pladen, maden og de to startpladser er ens uden at skulle sendes.
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
