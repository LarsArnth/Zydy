/*
  Motoren bag «Min kat» – killingen, dens behov og alt det, man kan købe til den.

  Filen er ren JS uden DOM og uden canvas, så hele husholdningen kan
  enhedstestes uden browser (test/unit/kat.test.mjs). index.html står for
  stuen, tegningen og fingrene på skærmen.

  To ting styrer spillet:

  1. **Behovene falder med tiden.** Mæt, glad, ren og energi er tal fra 0 til
     100, der siver nedad — også mens man er væk, for det er dét, der gør en
     kæledyrs-app levende. Der er et loft på, hvor længe fraværet tæller
     (FRAVAER_MAKS_TIMER), så man aldrig vender tilbage til en helt sørgelig
     kat efter en uge i sommerhus.

  2. **Man får kun løn for det, man faktisk fylder op.** plej() belønner
     forskellen mellem før og efter, ikke handlingen. Derfor giver det
     ingenting at proppe mad i en mæt kat, og børnene kan ikke tjene mønter
     ved at trykke i vilden sky — man skal passe katten, når den mangler noget.
*/

/* ---------- Behovene ---------- */
export const BEHOV = ['mad', 'leg', 'renhed', 'energi'];

export const BEHOV_NAVN = { mad: 'Mæt', leg: 'Glad', renhed: 'Ren', energi: 'Frisk' };

/** Hvor mange point hvert behov falder pr. time, mens katten er vågen. */
export const FORFALD = { mad: 9, leg: 11, renhed: 6, energi: 8 };

export const SOVE_FORFALD = 0.35;      // de andre behov falder langsommere, mens den sover
export const SOEVN_PR_SEK = 2.2;       // energi pr. sekund i søvne (en lur er ~45 sekunder)
export const FRAVAER_MAKS_TIMER = 18;  // så længe tæller et fravær højst
export const FRAVAER_BUND = 18;        // og et fravær trykker aldrig et behov længere ned end hertil

/* ---------- Hvad handlingerne giver ---------- */
export const MAD_PR_MAALTID = 34;      // én skål mad
export const LEG_PR_FANGST = 13;       // hver gang katten fanger garnnøglet
export const VASK_PR_STROEG = 7;       // ét strøg med børsten
export const KLAP_LOFT = 70;           // klap gør glad – men kan ikke erstatte leg

/* ---------- Point, niveauer og mønter ---------- */
export const XP_PR_POINT = 1 / 3;      // 34 point mad ≈ 11 point erfaring
export const MOENT_PR_POINT = 1 / 6;
export const MAKS_NIVEAU = 50;         // samme loft som toplistens `maks`
export const START_MOENTER = 20;

/** Samlet erfaring der skal til for at nå niveau n (niveau 1 er 0). */
export const xpTilNiveau = n => 30 * (n - 1) + 6 * (n - 1) * (n - 1);

/** Kattens niveau ved en given mængde erfaring. */
export function niveauFor(xp) {
  let n = 1;
  while (n < MAKS_NIVEAU && xp >= xpTilNiveau(n + 1)) n++;
  return n;
}

/** Hvor langt er katten på vej mod næste niveau? 0–1 (1 når den er helt oppe). */
export function niveauAndel(xp) {
  const n = niveauFor(xp);
  if (n >= MAKS_NIVEAU) return 1;
  const fra = xpTilNiveau(n), til = xpTilNiveau(n + 1);
  return Math.max(0, Math.min(1, (xp - fra) / (til - fra)));
}

/* ---------- Butikken ---------- */
/*
  `slags` er hvor tingen sidder: pelsen er kattens farve, hat og halsbånd kan
  tages på og af. De tre første pelse er gratis – det er dem, man vælger
  imellem, når man adopterer.
*/
export const TING = [
  { id: 'pels-orange', slags: 'pels', navn: 'Rødtot', pris: 0 },
  { id: 'pels-graa', slags: 'pels', navn: 'Grå Mis', pris: 0 },
  { id: 'pels-sort', slags: 'pels', navn: 'Sorte Sokker', pris: 0 },
  { id: 'pels-hvid', slags: 'pels', navn: 'Snehvid', pris: 45 },
  { id: 'pels-tiger', slags: 'pels', navn: 'Tigerstriber', pris: 80 },
  { id: 'pels-plettet', slags: 'pels', navn: 'Plettet', pris: 110 },
  { id: 'pels-lyseblaa', slags: 'pels', navn: 'Drømmeblå', pris: 150 },
  { id: 'hat-sloejfe', slags: 'hat', navn: 'Sløjfe', pris: 25 },
  { id: 'hat-hue', slags: 'hat', navn: 'Nissehue', pris: 40 },
  { id: 'hat-cowboy', slags: 'hat', navn: 'Cowboyhat', pris: 65 },
  { id: 'hat-blomst', slags: 'hat', navn: 'Blomst', pris: 55 },
  { id: 'hat-krone', slags: 'hat', navn: 'Guldkrone', pris: 130 },
  { id: 'hat-party', slags: 'hat', navn: 'Festhat', pris: 70 },
  { id: 'baand-roed', slags: 'halsbaand', navn: 'Rødt halsbånd', pris: 20 },
  { id: 'baand-groen', slags: 'halsbaand', navn: 'Grønt halsbånd', pris: 20 },
  { id: 'baand-klokke', slags: 'halsbaand', navn: 'Bånd med klokke', pris: 60 },
  { id: 'baand-guld', slags: 'halsbaand', navn: 'Guldkæde', pris: 95 },
];

export const tingen = id => TING.find(t => t.id === id) || null;

/** De pelse man kan vælge imellem, når man adopterer (dem der ikke koster noget). */
export const GRATIS_PELSE = TING.filter(t => t.slags === 'pels' && t.pris === 0).map(t => t.id);

/* ---------- Katten ---------- */

/** En helt ny killing. `nu` er tidsstemplet i millisekunder (Date.now()). */
export function nyKat(navn, pels = GRATIS_PELSE[0], nu = 0) {
  return {
    navn: (navn || 'Mis').trim().slice(0, 12) || 'Mis',
    pels: GRATIS_PELSE.includes(pels) ? pels : GRATIS_PELSE[0],
    hat: null,
    halsbaand: null,
    ejer: [],                       // købte ting (de gratis pelse står ikke her)
    xp: 0,
    moenter: START_MOENTER,
    behov: { mad: 70, leg: 60, renhed: 85, energi: 80 },
    foedt: nu,
    sidst: nu,
    sover: false,
  };
}

/** Kattens alder i hele dage. */
export const alderDage = (kat, nu) => Math.max(0, Math.floor((nu - kat.foedt) / 86400000));

/** Gennemsnittet af de fire behov – hvor godt katten har det, 0–100. */
export const trivsel = kat => BEHOV.reduce((s, b) => s + kat.behov[b], 0) / BEHOV.length;

/**
 * Kattens humør, som tegningen og teksterne retter sig efter. Gennemsnittet
 * alene dur ikke: en kat, der har det fint på tre ud af fire, er stadig ked af
 * det, hvis den sidste ting mangler helt.
 */
export function humoer(kat) {
  if (kat.sover) return 'sover';
  const lavest = kat.behov[mestTraengende(kat)];
  const t = trivsel(kat);
  if (lavest < 15) return 'ked';
  if (t >= 70 && lavest >= 40) return 'glad';
  if (t >= 40) return 'okay';
  return 'ked';
}

/** Det behov der trænger mest (laveste værdi). */
export const mestTraengende = kat => BEHOV.reduce((a, b) => (kat.behov[b] < kat.behov[a] ? b : a));

/**
 * Lader `sek` sekunder gå. Behovene falder (energi stiger, hvis katten sover),
 * og der tælles højst FRAVAER_MAKS_TIMER med, uanset hvor længe man har været væk.
 */
export function forfald(kat, sek, sover = kat.sover) {
  const t = Math.max(0, Math.min(sek, FRAVAER_MAKS_TIMER * 3600));
  for (const b of BEHOV) {
    if (b === 'energi' && sover) {
      kat.behov.energi = Math.min(100, kat.behov.energi + t * SOEVN_PR_SEK);
    } else {
      const fart = (FORFALD[b] / 3600) * (sover ? SOVE_FORFALD : 1);
      kat.behov[b] = Math.max(0, kat.behov[b] - t * fart);
    }
  }
  return kat;
}

/** Erfaring og mønter for `point` opfyldt behov. Se filhovedet: kun det, der faktisk blev fyldt op. */
export function beloen(kat, point) {
  const foer = niveauFor(kat.xp);
  if (!(point > 0)) return { xp: 0, moenter: 0, niveau: foer, nytNiveau: false };
  const xp = Math.round(point * XP_PR_POINT);
  const moenter = Math.round(point * MOENT_PR_POINT);
  kat.xp += xp;
  kat.moenter += moenter;
  const niveau = niveauFor(kat.xp);
  return { xp, moenter, niveau, nytNiveau: niveau > foer };
}

/**
 * Fylder et behov op med `maengde` point og belønner forskellen.
 * Returnerer { oeget, xp, moenter, niveau, nytNiveau }.
 */
export function plej(kat, behov, maengde) {
  const foer = kat.behov[behov];
  kat.behov[behov] = Math.max(0, Math.min(100, foer + maengde));
  const oeget = kat.behov[behov] - foer;
  return { oeget, ...beloen(kat, oeget) };
}

/**
 * Et klap på katten. Gør en anelse glad, men kun op til KLAP_LOFT og uden
 * erfaring eller mønter – ellers ville man bare kunne trykke sig til alting.
 * Returnerer true, hvis klappet hjalp.
 */
export function klap(kat) {
  if (kat.sover || kat.behov.leg >= KLAP_LOFT) return false;
  kat.behov.leg = Math.min(KLAP_LOFT, kat.behov.leg + 1);
  return true;
}

/* ---------- Butikken ---------- */

/** Ejer katten tingen? Gratis ting ejer man altid. */
export function ejer(kat, id) {
  const t = tingen(id);
  return !!t && (t.pris === 0 || kat.ejer.includes(id));
}

/** Køber en ting, hvis der er råd, og tager den på. Returnerer true ved køb. */
export function koeb(kat, id) {
  const t = tingen(id);
  if (!t || ejer(kat, id) || kat.moenter < t.pris) return false;
  kat.moenter -= t.pris;
  kat.ejer.push(id);
  tagPaa(kat, id);
  return true;
}

/**
 * Tager en ting på. Hat og halsbånd kan tages af igen ved at trykke på den,
 * man allerede har på; pelsen skal katten jo beholde.
 */
export function tagPaa(kat, id) {
  const t = tingen(id);
  if (!t || !ejer(kat, id)) return false;
  if (t.slags === 'pels') kat.pels = id;
  else kat[t.slags] = kat[t.slags] === id ? null : id;
  return true;
}

/* ---------- Gem og hent ---------- */

/** Katten som almindeligt objekt, klar til JSON.stringify. */
export function serialiser(kat, nu = kat.sidst) {
  return {
    v: 1,
    navn: kat.navn, pels: kat.pels, hat: kat.hat, halsbaand: kat.halsbaand,
    ejer: kat.ejer.slice(), xp: kat.xp, moenter: kat.moenter,
    behov: { ...kat.behov },
    foedt: kat.foedt, sidst: nu, sover: kat.sover,
  };
}

const tal = (v, fald, min = 0, maks = 100) =>
  (typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.min(maks, v)) : fald);

/**
 * Læser en gemt kat og lader tiden siden `sidst` gå. Er der noget galt med
 * data, falder vi tilbage til fornuftige værdier i stedet for at miste katten.
 * Returnerer { kat, vaekSek } – hvor længe man har været væk (afkortet).
 */
export function laes(data, nu) {
  if (!data || typeof data !== 'object' || typeof data.navn !== 'string') return null;
  const kat = nyKat(data.navn, data.pels, nu);
  if (tingen(data.pels)?.slags === 'pels') kat.pels = data.pels;
  kat.ejer = Array.isArray(data.ejer) ? data.ejer.filter(id => !!tingen(id)) : [];
  kat.xp = Math.max(0, Math.round(tal(data.xp, 0, 0, xpTilNiveau(MAKS_NIVEAU))));
  kat.moenter = Math.max(0, Math.round(tal(data.moenter, START_MOENTER, 0, 1e7)));
  kat.hat = ejer(kat, data.hat) && tingen(data.hat).slags === 'hat' ? data.hat : null;
  kat.halsbaand = ejer(kat, data.halsbaand) && tingen(data.halsbaand).slags === 'halsbaand' ? data.halsbaand : null;
  for (const b of BEHOV) kat.behov[b] = tal(data.behov?.[b], 50);
  kat.foedt = typeof data.foedt === 'number' && data.foedt > 0 && data.foedt <= nu ? data.foedt : nu;
  kat.sover = !!data.sover;

  const sidst = typeof data.sidst === 'number' && data.sidst > 0 ? data.sidst : nu;
  const vaekSek = Math.max(0, Math.min((nu - sidst) / 1000, FRAVAER_MAKS_TIMER * 3600));
  const foer = { ...kat.behov };
  forfald(kat, vaekSek);
  // Et fravær må gerne kunne ses på katten, men den skal ikke være helt i bund,
  // når man kommer hjem fra skole – så er der ingen fornøjelse ved at komme tilbage.
  for (const b of BEHOV) kat.behov[b] = Math.max(kat.behov[b], Math.min(foer[b], FRAVAER_BUND));
  if (kat.sover && kat.behov.energi >= 100) kat.sover = false;   // den har sovet ud imens
  kat.sidst = nu;
  return { kat, vaekSek };
}

/** En linje om, hvordan det gik, mens man var væk. Null hvis man lige har været her. */
export function velkomst(kat, vaekSek) {
  if (vaekSek < 90) return null;
  const timer = vaekSek / 3600;
  const hvornaar = timer >= 1.5 ? `${Math.round(timer)} timer` : `${Math.round(vaekSek / 60)} minutter`;
  const mangel = mestTraengende(kat);
  const savn = { mad: 'og er godt sulten', leg: 'og vil gerne lege', renhed: 'og trænger til en børstning', energi: 'og er godt træt' }[mangel];
  if (kat.behov[mangel] > 60) return `${kat.navn} har haft det fint i ${hvornaar}.`;
  return `${kat.navn} har savnet dig i ${hvornaar} ${savn}.`;
}
