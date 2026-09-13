/*
  Søgning på forsiden: reglerne for hvornår et kort passer til det, man skriver.

  Her ligger kun teksten og sammenligningen, så den kan enhedstestes uden
  browser (test/unit/soeg.test.mjs). Selve feltet og filtreringen af kortene
  ligger i soeg.js.

  Tre valg er hele hemmeligheden bag, at et barn kan finde et spil:

  1. **Æ, Ø og Å skrives også ae/oe/aa.** «saet» skal finde Sæt og «taarn» Tårn –
     børnene skriver tit uden de danske bogstaver, især på en iPad med engelsk
     tastatur.
  2. **Der søges i navnet, i nøgleordene og i beskrivelsen.** Nøgleordene i
     kort.json er det, spillet *også* hedder: «roblox» finder Klodser, «block
     blast» finder Blokblast, «my cat» finder Min kat, «tre på stribe» finder
     Kryds og bolle.
  3. **Hvert ord skal passe, og korte ord skal stå i starten af et ord.** Så kan
     der filtreres, mens man skriver («k» → «kl» → «klo»), og «min kat» finder
     det samme som «kat min». Måtte korte ord stå hvor som helst, ville «kat»
     også finde Dybet, fordi der står «skatte» på kortet — men lange ord må
     gerne, for ellers kunne man ikke finde Ordstige på «stige»: dansk sætter
     ordene sammen.
*/

/** Fra og med så mange bogstaver må et søgeord stå midt inde i et ord. */
export const LANGT_ORD = 4;

/** Små bogstaver, æ/ø/å som ae/oe/aa, accenter væk og alt andet end bogstaver og
 *  tal bliver til mellemrum. «Gulvet er lava!» → «gulvet er lava». */
export function normaliser(tekst) {
  return String(tekst == null ? '' : tekst)
    .normalize('NFC')
    .toLowerCase()
    .replace(/æ/g, 'ae').replace(/ø/g, 'oe').replace(/å/g, 'aa')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')      // é → e, ü → u
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Det, man har skrevet, delt op i ord. Tom søgning giver en tom liste. */
export function ord(soegning) {
  const n = normaliser(soegning);
  return n ? n.split(' ') : [];
}

/** Al teksten på ét kort, som der søges i: navn, nøgleord og beskrivelse. */
export function soegetekst(kort) {
  const noegleord = Array.isArray(kort.nøgleord) ? kort.nøgleord
    : Array.isArray(kort.noegleord) ? kort.noegleord
    : kort.noegleord ? [kort.noegleord] : [];
  return normaliser([kort.navn, noegleord.join(' '), kort.beskrivelse].join(' '));
}

/** Står søgeordet i teksten? Et kort ord skal begynde et ord («kl» → «klodser»),
 *  et langt må stå hvor som helst i det («stige» → «ordstige»). */
export function staarI(tekst, soegeord) {
  if (!soegeord) return true;
  if ((' ' + tekst).includes(' ' + soegeord)) return true;
  return soegeord.length >= LANGT_ORD && tekst.includes(soegeord);
}

/** Passer kortet til det, der er skrevet? Alle ord skal stå der. */
export function passer(kort, soegning) {
  const ordene = ord(soegning);
  if (!ordene.length) return true;                        // tom søgning = alt
  const tekst = soegetekst(kort);
  return ordene.every(o => staarI(tekst, o));
}

/** Kortene der passer, i den rækkefølge de kom ind. */
export function filtrer(kort, soegning) {
  return kort.filter(k => passer(k, soegning));
}
