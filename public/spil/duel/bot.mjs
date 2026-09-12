/* Duel-botten – modstanderen, når man er alene om telefonen.
   Ren logik uden DOM, så den kan enhedstestes (test/unit/duel.test.mjs).

   Botten kigger ikke på skærmen. Spillet fortæller den, hvad runden går ud på
   – enten «tryk når du må» (grønt lys, ens figurer) eller «vælg det rigtige
   blandt de her svar» (højeste tal, farve-ikke-ord, tæl prikkerne) – og botten
   svarer med, hvor længe den er om det, og hvad den trykker på. Selve trykket
   sender index.html gennem den helt almindelige press(), så botten spiller
   efter præcis de samme regler som et menneske. */

export const NIVEAUER = ['nem', 'mellem', 'svaer'];

/* reaktion: ms fra man må trykke, til botten trykker (grønt lys, ens figurer).
   taenk:    ms fra svarene er på skærmen, til botten vælger.
   fejl:     hvor tit den vælger et forkert svar.
   tyvstart: hvor tit den trykker før tid og forærer pointet væk. */
export const SVAERHED = {
  nem:    { navn: 'Nem',    reaktion: [520, 980], taenk: [1100, 2000], fejl: 0.35, tyvstart: 0.20 },
  mellem: { navn: 'Mellem', reaktion: [330, 560], taenk: [700, 1300],  fejl: 0.16, tyvstart: 0.08 },
  svaer:  { navn: 'Svær',   reaktion: [210, 340], taenk: [420, 800],   fejl: 0.05, tyvstart: 0.02 },
};

export function svaerhed(niveau){ return SVAERHED[niveau] || SVAERHED.mellem; }

// Et helt tal i [a,b], begge med.
export function iOmraade([a, b], rnd){ return Math.round(a + rnd() * (b - a)); }

// Et forkert svar blandt mulighederne. Er der ingen forkerte, må botten svare rigtigt.
export function forkertSvar(opgave, rnd){
  const forkerte = (opgave.muligheder || []).filter(m => String(m) !== String(opgave.korrekt));
  if(!forkerte.length) return opgave.korrekt;
  return forkerte[Math.floor(rnd() * forkerte.length)];
}

/* planlaeg(opgave, niveau, rnd) → { tyvstart, forsinkelse, svar }

   opgave.slags === 'reaktion': { vindue } er ms, til der må trykkes.
     Uden tyvstart måles forsinkelsen fra det øjeblik, man må trykke;
     med tyvstart måles den fra rundens start – og så er pointet tabt.
   opgave.slags === 'valg': { korrekt, muligheder }.
     Forsinkelsen måles fra svarene kom på skærmen. */
export function planlaeg(opgave, niveau, rnd){
  const sv = svaerhed(niveau);
  if(opgave.slags === 'reaktion'){
    const vindue = opgave.vindue || 0;
    // Kun tyvstart, hvis der er tid nok til at nå at dumme sig.
    if(vindue > 700 && rnd() < sv.tyvstart){
      return { tyvstart: true, forsinkelse: iOmraade([300, Math.round(vindue * 0.85)], rnd), svar: null };
    }
    return { tyvstart: false, forsinkelse: iOmraade(sv.reaktion, rnd), svar: null };
  }
  const rigtigt = rnd() >= sv.fejl;
  return {
    tyvstart: false,
    forsinkelse: iOmraade(sv.taenk, rnd),
    svar: rigtigt ? opgave.korrekt : forkertSvar(opgave, rnd),
  };
}
