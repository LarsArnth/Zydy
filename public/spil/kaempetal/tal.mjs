/*
  Kæmpetal – motoren. Ren JS uden DOM, enhedstestet i test/unit/kaempetal.test.mjs.

  Selmas ønske (#42) lød «Lav et spil hvor man kan mode Sine venner man kan
  mindst Max 9999999999999». Så det her er et clicker-spil om at nå det
  største tal, 9.999.999.999.999: man trykker på tallet, køber hjælpere, der
  tæller videre af sig selv, og kan møde en ven i det samme spil (rummet
  ligger i index.html – motoren her kender kun tallene).

  Tre regler holder tallene i skak:
    1) Alt er hele tal, og alt har et loft: MAKS. Både banken (point) og det
       samlede tal (ialt) stopper dér – 9.999.999.999.999 er under
       Number.MAX_SAFE_INTEGER, så der regnes aldrig med flydende komma på
       selve pointene. Brøkdele fra produktionen samles i `rest`, til der er
       en hel.
    2) Scoren på toplisten er `ialt` – alt hvad man nogensinde har tjent.
       At købe en hjælper koster point, men gør aldrig scoren mindre, så
       toplisten kan kun gå fremad.
    3) Hjælperne arbejder også, mens man er væk – men højst FRAVAER_MAKS
       (8 timer, en skoledag), så en nat ikke gør resten af spillet ligegyldig.
*/

export const MAKS = 9999999999999;      // det største tal – præcis som i ønsket
export const VOKSER = 1.15;             // prisen stiger 15 % for hver man ejer
export const FINGER_VOKSER = 8;         // guldfingeren er dyrere at forbedre
export const FRAVAER_MAKS = 8 * 3600;   // hjælperne arbejder højst 8 timer alene

/*
  Hjælperne: hver giver `sek` point i sekundet pr. styk. Guldfingeren er den
  særlige første række: den giver ingen produktion, men fordobler klikket for
  hver man ejer (klikVaerdi = 2^antal). Priserne er stemt af, så en flittig
  spiller kan nå MAKS på nogle dages spil – enhedstesten vogter over det.
*/
export const HJAELPERE = [
  { id: 'finger',  navn: 'Guldfinger',  emoji: '👆', sek: 0,         pris: 100,         om: 'Hvert tryk tæller dobbelt' },
  { id: 'mus',     navn: 'Klikkemus',   emoji: '🐭', sek: 1,         pris: 15,          om: 'Piler rundt og tæller' },
  { id: 'kat',     navn: 'Tællekat',    emoji: '🐱', sek: 8,         pris: 120,         om: 'Tæller mus … og videre' },
  { id: 'hund',    navn: 'Regnehund',   emoji: '🐶', sek: 45,        pris: 1000,        om: 'Apporterer tal' },
  { id: 'robot',   navn: 'Robot',       emoji: '🤖', sek: 260,       pris: 9000,        om: 'Bip bop, flere tal' },
  { id: 'fabrik',  navn: 'Talfabrik',   emoji: '🏭', sek: 1600,      pris: 80000,       om: 'Tal på samlebånd' },
  { id: 'raket',   navn: 'Talraket',    emoji: '🚀', sek: 10000,     pris: 700000,      om: 'Tæller helt til vejrs' },
  { id: 'maane',   navn: 'Månebase',    emoji: '🌙', sek: 65000,     pris: 6000000,     om: 'Tæller også om natten' },
  { id: 'planet',  navn: 'Talplanet',   emoji: '🪐', sek: 450000,    pris: 55000000,    om: 'En hel planet af tal' },
  { id: 'stjerne', navn: 'Superstjerne', emoji: '🌟', sek: 3200000,  pris: 520000000,   om: 'Brænder tal i massevis' },
  { id: 'galakse', navn: 'Galakse',     emoji: '🌌', sek: 24000000,  pris: 5000000000,  om: 'Milliarder af stjerner' },
  { id: 'sorthul', navn: 'Sort hul',    emoji: '🕳️', sek: 200000000, pris: 55000000000, om: 'Suger tal til sig' },
];

const HJAELPER = Object.fromEntries(HJAELPERE.map(h => [h.id, h]));

/** Et frisk spil: nul på alt. */
export function nytSpil() {
  return {
    point: 0,                  // banken – det man kan købe for
    ialt: 0,                   // alt man nogensinde har tjent = scoren
    antal: Object.fromEntries(HJAELPERE.map(h => [h.id, 0])),
    rest: 0,                   // brøkdele af point fra produktionen
    fejret: false,             // har vi holdt festen for MAKS?
  };
}

/** Hvad ét tryk giver: 1, fordoblet for hver Guldfinger. */
export function klikVaerdi(s) {
  return Math.min(MAKS, Math.pow(2, s.antal.finger || 0));
}

/** Point i sekundet fra hjælperne. */
export function produktion(s) {
  let sum = 0;
  for (const h of HJAELPERE) sum += (s.antal[h.id] || 0) * h.sek;
  return sum;
}

/** Lægger tjente point i både banken og det samlede tal – med loft på MAKS. */
function tjen(s, n) {
  const foer = s.ialt;
  s.ialt = Math.min(MAKS, s.ialt + n);
  s.point = Math.min(MAKS, s.point + n);
  return s.ialt - foer;               // det, der faktisk kom ind (0 ved loftet)
}

/** Et tryk på tallet. Returnerer hvad det gav. */
export function klik(s) {
  return tjen(s, klikVaerdi(s));
}

/**
 * Tiden går: dt sekunder produktion. Brøkdele samles i `rest`, så
 * 0,5 point/sek. også bliver til point – bare hvert andet sekund.
 */
export function tik(s, dt) {
  s.rest += produktion(s) * dt;
  const hele = Math.floor(s.rest);
  if (hele <= 0) return 0;
  s.rest -= hele;
  return tjen(s, hele);
}

/** Hjælperne har arbejdet, mens man var væk – men højst FRAVAER_MAKS sekunder. */
export function fravaer(s, sek) {
  if (!(sek > 0)) return 0;
  return tik(s, Math.min(sek, FRAVAER_MAKS));
}

/** Prisen på den næste af slagsen, når man ejer `ejet` i forvejen. */
export function pris(id, ejet) {
  const h = HJAELPER[id];
  if (!h) return null;
  const vokser = id === 'finger' ? FINGER_VOKSER : VOKSER;
  return Math.min(MAKS, Math.ceil(h.pris * Math.pow(vokser, ejet || 0)));
}

/** Køber én, hvis der er råd. Koster point, men rører aldrig `ialt`. */
export function koeb(s, id) {
  const p = pris(id, s.antal[id]);
  if (p == null || s.point < p) return false;
  s.point -= p;
  s.antal[id]++;
  return true;
}

/* ---------- Tal som tekst ---------- */

/** Hele tallet med punktummer: 9999999999999 → «9.999.999.999.999». */
export function formater(n) {
  const cifre = String(Math.floor(Math.abs(n)));
  let ud = '';
  for (let i = 0; i < cifre.length; i++) {
    if (i && (cifre.length - i) % 3 === 0) ud += '.';
    ud += cifre[i];
  }
  return (n < 0 ? '-' : '') + ud;
}

/** Kort tal til priserne: 1.500 → «1.500», 2.300.000 → «2,3 mio.». */
export function kortTal(n) {
  const trin = [
    [1e12, 'bio.'],
    [1e9, 'mia.'],
    [1e6, 'mio.'],
  ];
  for (const [vaerdi, navn] of trin) {
    if (n >= vaerdi) {
      const tal = n / vaerdi;
      const tekst = tal >= 100 ? String(Math.floor(tal))
        : (Math.floor(tal * 10) / 10).toLocaleString('da-DK');
      return tekst + ' ' + navn;
    }
  }
  return formater(n);
}

/**
 * Den største milepæl, tallet har rundet: 1.000, 10.000, … 1.000.000.000.000
 * og til sidst MAKS. Toplisten får kun besked, når man runder en ny – ellers
 * ville hvert klik blive til et kald.
 */
export function milepael(n) {
  if (n >= MAKS) return MAKS;
  let m = 0;
  for (let t = 1000; t <= 1e12; t *= 10) if (n >= t) m = t;
  return m;
}

/* ---------- Gem og hent ---------- */

/** Spillet som tekst til localStorage. */
export function gem(s) {
  return JSON.stringify({ point: s.point, ialt: s.ialt, antal: s.antal, fejret: s.fejret });
}

/** Tekst tilbage til et spil. Skrald eller gamle formater bliver et nyt spil. */
export function hent(tekst) {
  const s = nytSpil();
  try {
    const d = JSON.parse(tekst);
    const tal = v => Number.isFinite(v) && v >= 0 ? Math.min(MAKS, Math.floor(v)) : 0;
    s.point = tal(d.point);
    s.ialt = Math.max(tal(d.ialt), s.point);   // banken kan aldrig være større end det tjente
    for (const h of HJAELPERE) s.antal[h.id] = Math.min(2000, tal(d.antal && d.antal[h.id]));
    s.fejret = !!d.fejret;
  } catch (e) { return nytSpil(); }
  return s;
}

/* ---------- Sammen: to venner tæller mod det samme loft ---------- */

/** De to venners tal lagt sammen – med samme loft som alt andet. */
export function sammenSum(a, b) {
  return Math.min(MAKS, (Number.isFinite(a) && a > 0 ? a : 0) + (Number.isFinite(b) && b > 0 ? b : 0));
}
