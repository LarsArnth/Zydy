/*
  Kapløb: reglerne for «man kan joine hinanden i alle spil».

  Kryds og bolle og Dybet deler ét parti mellem to telefoner — det kræver, at
  spillet selv kan sende sin stilling frem og tilbage, og det er en hel del
  arbejde pr. spil. Et kapløb er den lette udgave, som virker i *alle* spil, der
  har en score: man spiller hver sit spil, men i det samme rum, og stillingen
  står øverst på skærmen hele tiden. Den bedste runde tæller.

  Her ligger kun regnestykkerne, så de kan enhedstestes uden browser
  (test/unit/kaploeb.test.mjs). Skærm og netværk ligger i kaploeb.js.

  Rummets `tilstand` er en lille kasse med en halvdel til hver:

    { slags: 'kaploeb',
      vaert: { bedste: 420, sidste: 310, runder: 3, tekst: '420 m' },
      gaest: { … } }

  Hver spiller skriver kun sin egen halvdel, så de to aldrig skændes om det
  samme felt; kommer man for sent (rummet har skiftet version), skriver man bare
  sin halvdel oven i den friske kasse igen.
*/

export const SLAGS = 'kaploeb';

/** Ingen runder spillet endnu. */
export const tomSide = () => ({ bedste: null, sidste: null, runder: 0, tekst: '' });

const tal = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const antal = v => (Number.isInteger(v) && v >= 0 ? v : 0);
const kortTekst = v => (typeof v === 'string' ? v.slice(0, 24) : '');

/** Én halvdel, renset – alt fra nettet kan være noget rod. */
export function side(x) {
  if (!x || typeof x !== 'object') return tomSide();
  const s = { bedste: tal(x.bedste), sidste: tal(x.sidste), runder: antal(x.runder), tekst: kortTekst(x.tekst) };
  if (s.bedste == null) { s.runder = s.runder && s.sidste != null ? s.runder : 0; }
  return s;
}

/** Rummets tilstand læst som et kapløb – også når der intet står endnu. */
export function laes(tilstand) {
  const t = tilstand && typeof tilstand === 'object' ? tilstand : {};
  return { slags: SLAGS, vaert: side(t.vaert), gaest: side(t.gaest) };
}

/** Er a en bedre score end b? 'asc' = laveste vinder (tider). */
export const bedre = (a, b, retning) => (retning === 'asc' ? a < b : a > b);

export const modpart = rolle => (rolle === 'vaert' ? 'gaest' : 'vaert');

/** Én runde lagt til min halvdel. Teksten følger den bedste score. */
export function medRunde(min, score, tekst, retning) {
  const m = side(min);
  const nyBedste = m.bedste == null || bedre(score, m.bedste, retning);
  return {
    bedste: nyBedste ? score : m.bedste,
    sidste: score,
    runder: m.runder + 1,
    tekst: nyBedste ? kortTekst(tekst || String(score)) : m.tekst,
  };
}

/** Min halvdel skrevet ind i rummets tilstand. Den andens halvdel røres ikke. */
export function medMig(tilstand, rolle, min) {
  const t = laes(tilstand);
  t[rolle] = side(min);
  return t;
}

/**
 * Min egen halvdel er jeg selv herre over – men står der mere på serveren end
 * her (jeg har genindlæst siden, eller spillet i en anden fane), så tager vi det
 * bedste af de to i stedet for at tabe runder på gulvet.
 */
export function flet(min, fraServer, retning) {
  const a = side(min), b = side(fraServer);
  if (!a.runder) return b;
  if (!b.runder) return a;
  const serverBedst = a.bedste == null || (b.bedste != null && bedre(b.bedste, a.bedste, retning));
  return {
    bedste: serverBedst ? b.bedste : a.bedste,
    tekst: serverBedst ? b.tekst : a.tekst,
    sidste: a.sidste != null ? a.sidste : b.sidste,
    runder: Math.max(a.runder, b.runder),
  };
}

/** Er der noget hos mig, serveren ikke har hørt om endnu? */
export function mangler(min, fraServer) {
  const a = side(min), b = side(fraServer);
  return a.runder > b.runder || a.bedste !== b.bedste;
}

/** Stillingen set fra den ene: mig, den anden, og hvem der fører. */
export function stilling(tilstand, rolle, retning) {
  const t = laes(tilstand);
  const min = t[rolle], hans = t[modpart(rolle)];
  let foerer = null;
  if (min.bedste != null && hans.bedste != null) {
    foerer = min.bedste === hans.bedste ? 'lige' : (bedre(min.bedste, hans.bedste, retning) ? 'mig' : 'ham');
  } else if (min.bedste != null) foerer = 'mig';
  else if (hans.bedste != null) foerer = 'ham';
  return { min, hans, foerer };
}

/** Scoren som den skal stå på skærmen: spillets egen tekst, ellers tallet. */
export const vis = s => (s.runder ? (s.tekst || String(s.bedste)) : '–');

/**
 * Teksten i pillen øverst på skærmen. Kronen står ved den, der fører, så man kan
 * se stillingen i et glimt midt i et spil.
 */
export function pilleTekst(st, modspiller, status) {
  if (status === 'slut') return '🏁 ' + modspiller + ' stoppede kapløbet';
  // Mens vennen ikke er hoppet med endnu, må man gerne spille – og så skal ens
  // egen score stå der, ellers ser det ud som om runden gik tabt.
  if (status === 'inviteret') {
    return '🏁 ' + (st.min.runder ? 'Du ' + vis(st.min) + ' · venter på ' + modspiller + '…'
      : 'Venter på ' + modspiller + '…');
  }
  const krone = hvem => (st.foerer === hvem ? '👑' : '');
  return '🏁 ' + krone('mig') + 'Du ' + vis(st.min) + ' · ' + krone('ham') + modspiller + ' ' + vis(st.hans);
}

/** Den store besked, lige når en runde er slut. */
export function rundeTekst(st, modspiller, status) {
  if (status === 'inviteret') return 'Din score venter på, at ' + modspiller + ' hopper med.';
  if (status === 'slut') return modspiller + ' stoppede kapløbet.';
  if (!st.hans.runder) return modspiller + ' er ikke i mål endnu.';
  if (st.foerer === 'lige') return 'Helt lige! ' + vis(st.min) + ' til jer begge.';
  if (st.foerer === 'mig') return 'Du fører: ' + vis(st.min) + ' mod ' + vis(st.hans) + '.';
  return modspiller + ' fører med ' + vis(st.hans) + ' – prøv igen!';
}

/** «3 runder» / «endnu ingen runder» under hvert navn i panelet. */
export const runderTekst = s =>
  (!s.runder ? 'ingen runder endnu' : s.runder === 1 ? '1 runde' : s.runder + ' runder');
