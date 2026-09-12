/*
  Kryds og bolle – regler og computerspiller. Ren JS uden DOM, så den kan
  enhedstestes uden browser (test/unit/kryds.test.mjs).

  Brættet er et array med 9 felter i læseretning:

      0 1 2
      3 4 5
      6 7 8

  Hvert felt er '' (tomt), 'x' (kryds) eller 'o' (bolle).
*/

/** De otte rækker, kolonner og diagonaler der giver sejr. */
export const LINJER = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],   // rækker
  [0, 3, 6], [1, 4, 7], [2, 5, 8],   // kolonner
  [0, 4, 8], [2, 4, 6],              // diagonaler
];

export const nytBraet = () => Array(9).fill('');
export const modstander = s => (s === 'x' ? 'o' : 'x');
export const ledige = b => b.reduce((ud, v, i) => { if (!v) ud.push(i); return ud; }, []);
export const fuldt = b => b.every(v => v);

/** { spiller, linje } hvis nogen har tre på stribe, ellers null. */
export function vinder(b) {
  for (const linje of LINJER) {
    const [a, c, d] = linje;
    if (b[a] && b[a] === b[c] && b[a] === b[d]) return { spiller: b[a], linje };
  }
  return null;
}

/** 'x' | 'o' | 'lige' når partiet er slut, ellers null. */
export function resultat(b) {
  const v = vinder(b);
  if (v) return v.spiller;
  return fuldt(b) ? 'lige' : null;
}

/** Felter hvor `spiller` vinder med det samme. */
export function straksVinder(b, spiller) {
  return ledige(b).filter(i => {
    b[i] = spiller;
    const v = !!vinder(b);
    b[i] = '';
    return v;
  });
}

/* ---------- Perfekt spil (minimax) ----------
   Scoren er set fra `spiller`: positiv for sejr, negativ for nederlag, 0 for
   uafgjort – og jo flere tomme felter der er tilbage, jo større tal. Så
   foretrækker computeren den hurtige sejr og det sene nederlag ("kæmper imod"
   så længe den kan). Scoren afhænger kun af stillingen, så den kan huskes. */
const husket = new Map();   // braet+tur+spiller → score

function minimax(b, tur, spiller) {
  const v = vinder(b);
  if (v) {
    const vaerdi = ledige(b).length + 1;
    return v.spiller === spiller ? vaerdi : -vaerdi;
  }
  if (fuldt(b)) return 0;
  const noegle = b.map(v => v || '.').join('') + tur + spiller;   // '.' så tomme felter ikke forsvinder i nøglen
  const kendt = husket.get(noegle);
  if (kendt !== undefined) return kendt;
  let bedst = tur === spiller ? -Infinity : Infinity;
  for (const i of ledige(b)) {
    b[i] = tur;
    const s = minimax(b, modstander(tur), spiller);
    b[i] = '';
    bedst = tur === spiller ? Math.max(bedst, s) : Math.min(bedst, s);
  }
  husket.set(noegle, bedst);
  return bedst;
}

/** [{ felt, score }] for alle lovlige træk, set fra `spiller`. */
export function traekScorer(braet, spiller) {
  const b = braet.slice();
  return ledige(b).map(felt => {
    b[felt] = spiller;
    const score = minimax(b, modstander(spiller), spiller);
    b[felt] = '';
    return { felt, score };
  });
}

/** De træk der er lige gode og bedst mulige. */
export function bedsteTraekAlle(braet, spiller) {
  const scorer = traekScorer(braet, spiller);
  if (!scorer.length) return [];
  const bedst = Math.max(...scorer.map(s => s.score));
  return scorer.filter(s => s.score === bedst).map(s => s.felt);
}

/* ---------- Niveauerne ----------
   nem     – spiller for det meste tilfældigt, men tager en gevinst den kan se,
             og opdager kun hver tredje gang at den er ved at tabe.
   mellem  – vinder og blokerer altid, men vælger hvert andet træk tilfældigt,
             så den kan snydes med en dobbelttrussel.
   svaer   – perfekt minimax. Kan ikke slås; det bedste er uafgjort.  */
export const NIVEAUER = ['nem', 'mellem', 'svaer'];
const BLOKERER_NEM = 1 / 3;      // hvor tit Nem opdager en trussel
const TILFAELDIG_MELLEM = 0.5;   // hvor tit Mellem nøjes med et tilfældigt træk

/**
 * Computerens træk: feltnummer, eller null hvis brættet er fuldt.
 * `rnd` er en funktion der giver et tal i [0,1) – kan seedes i tests.
 */
export function bedsteTraek(braet, spiller, niveau = 'svaer', rnd = Math.random) {
  const felter = ledige(braet);
  if (!felter.length) return null;
  const vaelg = arr => arr[Math.floor(rnd() * arr.length)];
  const b = braet.slice();

  // Alle niveauer tager en sejr, der ligger lige for
  const vind = straksVinder(b, spiller);
  if (vind.length) return vaelg(vind);

  const trussel = straksVinder(b, modstander(spiller));
  if (niveau === 'nem') {
    if (trussel.length && rnd() < BLOKERER_NEM) return vaelg(trussel);
    return vaelg(felter);
  }
  // Blokér – har modstanderen to trusler, er partiet tabt uanset hvad
  if (trussel.length) return vaelg(trussel);
  if (niveau === 'mellem' && rnd() < TILFAELDIG_MELLEM) return vaelg(felter);
  return vaelg(bedsteTraekAlle(b, spiller));
}
