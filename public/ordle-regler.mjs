/*
  Reglerne bag Ordle-stimen på forsiden af zydy.dk.

  Ordle bor et andet sted (larsarnth.github.io/ordle) og kan derfor ikke selv
  sende en score herind, som spillene her på sitet gør. Derfor var Ordle det
  eneste kort på forsiden helt uden topliste — «highscore virker ikke», som
  ønsket lød. Løsningen er, at *forsiden* holder styr på stimen: hvor mange dage
  i træk man har klaret dagens ord. Man svarer selv ja, når man kommer tilbage
  fra Ordle, og stimen er scoren på toplisten (`/api/highscore/ordle`).

  Her ligger kun regnestykkerne, så de kan enhedstestes uden browser
  (test/unit/ordle.test.mjs). Selve kassen under kortet ligger i ordle.js.

  Tre valg er værd at kende:

  1. **Datoen er den lokale, ikke UTC.** «Dagens ord» skifter ved midnat dér,
     hvor man sidder — en kamp, der er spillet kl. 23 om aftenen, hører til den
     dag, barnet selv ville kalde det.
  2. **Der er ingen nej-knap.** Den anden knap hedder «Ikke endnu» og gemmer
     bare spørgsmålet resten af dagen. En stime brydes af *kalenderen* (man
     sprang en dag over), ikke af et tryk — ellers ville et kikset tryk koste
     børnene en stime på 20 dage.
  3. **Der spørges kun, når det giver mening:** enten har man trykket på
     Ordle-kortet i dag, eller også har man en stime i gang, som kan reddes.
     Ellers står der ikke andet under kortet end stimen, hvis der er en.
*/

/** Nøglen i localStorage. Én linje JSON, ligesom de andre `zydy.*`-nøgler. */
export const NOEGLE = 'zydy.ordle';

/** Grænsen for en troværdig stime — den samme som `maks` i public/spil/ordle/kort.json. */
export const STIME_MAKS = 3650;

/** Ingen stime, intet besøg, intet udskudt. Alle datoer er '' eller 'ÅÅÅÅ-MM-DD'. */
export const TOM = { klaret: '', stime: 0, besoegt: '', udskudt: '', sendt: '' };

const erDag = d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);

/** Den lokale dato som 'ÅÅÅÅ-MM-DD'. `new Date()` giver dagen i dag. */
export function dagFor(d) {
  const to = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + to(d.getMonth() + 1) + '-' + to(d.getDate());
}

/** Dagen før en dato. Regnes i UTC, så sommertid ikke kan springe et døgn over. */
export function dagenFoer(dag) {
  if (!erDag(dag)) return '';
  const [aar, maaned, d] = dag.split('-').map(Number);
  return new Date(Date.UTC(aar, maaned - 1, d - 1)).toISOString().slice(0, 10);
}

/** Læser det, der stod i localStorage. Er der noget galt med det, starter vi forfra. */
export function laes(raa) {
  let o = null;
  try { o = JSON.parse(raa); } catch (e) { o = null; }
  if (!o || typeof o !== 'object') return { ...TOM };
  const stime = Number.isInteger(o.stime) && o.stime > 0 ? Math.min(o.stime, STIME_MAKS) : 0;
  return {
    klaret: erDag(o.klaret) ? o.klaret : '',
    stime: erDag(o.klaret) ? stime : 0,
    besoegt: erDag(o.besoegt) ? o.besoegt : '',
    udskudt: erDag(o.udskudt) ? o.udskudt : '',
    sendt: typeof o.sendt === 'string' ? o.sendt.slice(0, 40) : '',
  };
}

export const skriv = s => JSON.stringify(s);

/**
 * Kvittering for at en stime er nået frem til toplisten: navn og antal dage.
 * Står den samme i `sendt`, behøver vi ikke sende igen — og gør den ikke
 * (fordi telefonen var offline, eller fordi der er kommet et nyt navn på
 * iPad'en), prøver kassen af sig selv næste gang forsiden tegnes.
 */
export const kvittering = (navn, antal) => String(navn).toLowerCase() + '|' + antal;

/** Skal stimen sendes til toplisten? Kun med et navn, og kun hvis den ikke er sendt før. */
export function skalSende(s, navn, antal) {
  return !!navn && antal > 0 && s.sendt !== kvittering(navn, antal);
}

/**
 * Stimen som den står lige nu. Den holder kun, hvis man klarede den i dag eller
 * i går — ellers er der sprunget en dag over, og stimen er brudt.
 */
export function stime(s, iDag) {
  if (!s.stime) return 0;
  return s.klaret === iDag || s.klaret === dagenFoer(iDag) ? s.stime : 0;
}

/** Skal kassen spørge «Klarede du dagens Ordle?» i dag? */
export function spoerg(s, iDag) {
  if (s.klaret === iDag) return false;          // allerede svaret ja i dag
  if (s.udskudt === iDag) return false;         // «Ikke endnu» gælder resten af dagen
  return s.besoegt === iDag || stime(s, iDag) > 0;
}

/** Man trykkede på Ordle-kortet: så ved vi, at der er noget at spørge om i dag. */
export function besoeg(s, iDag) {
  return { ...s, besoegt: iDag };
}

/** «Ikke endnu»: spørgsmålet gemmes resten af dagen, men stimen rører vi ikke. */
export function udskyd(s, iDag) {
  return { ...s, udskudt: iDag };
}

/**
 * «Ja, jeg klarede den!». Fortsatte man fra i går, vokser stimen; ellers
 * begynder en ny på 1. Har man allerede svaret ja i dag, sker der ingenting.
 * Returnerer { tilstand, stime, ny } — `ny` er falsk, hvis dagen var talt med.
 */
export function klaret(s, iDag) {
  if (s.klaret === iDag) return { tilstand: s, stime: s.stime, ny: false };
  const antal = Math.min(s.klaret === dagenFoer(iDag) && s.stime ? s.stime + 1 : 1, STIME_MAKS);
  return { tilstand: { ...s, klaret: iDag, stime: antal }, stime: antal, ny: true };
}

/** «4 dage i træk» / «1 dag i træk». */
export const stimeTekst = n => n + (n === 1 ? ' dag i træk' : ' dage i træk');
