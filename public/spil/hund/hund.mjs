/*
  Motoren bag «Min hund» – hvalpen, dens behov, gåturen og alle de tricks,
  den kan lære.

  Filen er ren JS uden DOM og uden canvas, så hele hundeholdet kan
  enhedstestes uden browser (test/unit/hund.test.mjs). index.html står for
  stuen, parken, tegningen og fingrene på skærmen.

  En hund er ikke en kat, og det er hele pointen med at bygge den her ved
  siden af «Min kat». Tre ting er anderledes:

  1. **Hunden skal luftes.** «Luftet» er det behov, der falder hurtigst, og
     det eneste, man ikke kan fylde op hjemme i stuen: man skal ud at gå. Hver
     meter tæller (gaa()), og undervejs er der lygtepæle at snuse til, pinde
     at hente, katte at gø ad – og mudderpytter, man skal nå at trække hunden
     væk fra, ellers skal den i bad bagefter.

  2. **Hunden kan lære tricks.** Sit, giv pote, dæk, snurr rundt, spring og
     dødsmand låses op efterhånden som hunden bliver klogere. Et trick sidder
     ikke fast med det samme: hver øvelse flytter det et stykke (traen()), og
     chancen for at den gør det rigtigt vokser med, hvor godt den kan det –
     og med hvor godt den har det. En sulten hund hører ikke efter.

  3. **Man får kun løn for det, man faktisk fylder op.** Præcis som i «Min
     kat»: plej() belønner forskellen mellem før og efter, og traen() belønner
     de point, tricket flyttede sig. Kan hunden allerede tricket, er det
     gratis sjov – men det giver hverken erfaring eller mønter, så børnene kan
     ikke trykke sig til en guldkrone.
*/

/* ---------- Behovene ---------- */
export const BEHOV = ['mad', 'leg', 'renhed', 'tur'];

export const BEHOV_NAVN = { mad: 'Mæt', leg: 'Glad', renhed: 'Ren', tur: 'Luftet' };

/** Hvor mange point hvert behov falder pr. time. «Luftet» falder hurtigst – det er en hund. */
export const FORFALD = { mad: 10, leg: 12, renhed: 5, tur: 14 };

export const FRAVAER_MAKS_TIMER = 18;  // så længe tæller et fravær højst
export const FRAVAER_BUND = 18;        // og et fravær trykker aldrig et behov længere ned end hertil

/* ---------- Hvad handlingerne giver ---------- */
export const MAD_PR_MAALTID = 36;      // én skål hundemad
export const LEG_PR_KAST = 12;         // hver gang hunden kommer tilbage med bolden
export const BAD_PR_STROEG = 8;        // ét strøg med sæben
export const KLAP_LOFT = 70;           // klap gør glad – men kan ikke erstatte leg

/* ---------- Gåturen ---------- */
export const TUR_LAENGDE = 120;        // meter pr. tur
export const TUR_FART = 6;             // meter pr. sekund (spil-meter – en tur tager ~20 sekunder)
export const TUR_PR_METER = 0.7;       // «luftet» pr. meter, så en hel tur næsten fylder måleren
export const TUR_BID = 12;             // der afregnes for 12 meter ad gangen, se gaa()
export const TUR_RAEKKEVIDDE = 9;      // hvor tæt på man skal være for at kunne trykke på noget
export const POSE_POINT = 18;          // for at samle op efter hunden

/*
  Det man møder på turen. `behov` + `giv` er hvad et tryk gør ved hunden.
  `undgaa: true` vender det om: dér er trykket en redning (man trækker i
  snoren), og det er dét at *lade være*, der koster.
*/
export const TUR_TING = {
  lygte: { navn: 'lygtepæl', em: '💡', behov: 'leg', giv: 6 },
  pind: { navn: 'pind', em: '🥢', behov: 'leg', giv: 9 },
  kat: { navn: 'kat', em: '🐈', behov: 'leg', giv: 10 },
  ven: { navn: 'hund', em: '🐩', behov: 'leg', giv: 12 },
  pyt: { navn: 'mudderpyt', em: '💦', behov: 'renhed', giv: -16, undgaa: true },
  pose: { navn: 'pose', em: '💩', behov: null, giv: 0 },
};

export const TUR_SLAGS = Object.keys(TUR_TING);

/* ---------- Tricks ---------- */
/*
  `niveau` er det niveau, hunden skal være nået, før man kan begynde at øve
  tricket – ellers ville man kunne lære en nyadopteret hvalp dødsmand på
  ét minut, og så er der ikke noget at se frem til.
*/
export const TRICKS = [
  { id: 'sit', navn: 'Sit', ord: 'Sit!', em: '🐕', niveau: 1 },
  { id: 'pote', navn: 'Giv pote', ord: 'Giv pote!', em: '🤝', niveau: 2 },
  { id: 'daek', navn: 'Dæk', ord: 'Dæk!', em: '🛏️', niveau: 4 },
  { id: 'snurr', navn: 'Snurr rundt', ord: 'Snurr!', em: '🌀', niveau: 6 },
  { id: 'spring', navn: 'Spring', ord: 'Hop!', em: '⭐', niveau: 9 },
  { id: 'doed', navn: 'Dødsmand', ord: 'Pang!', em: '💫', niveau: 13 },
];

export const trick = id => TRICKS.find(t => t.id === id) || null;

export const MESTRET = 100;            // ved 100 kan hunden tricket
export const LAERT_OK = 9;             // et vellykket forsøg flytter tricket så meget
export const LAERT_FEJL = 3;           // og selv et mislykket forsøg lærer den lidt
export const MESTRET_BONUS = 45;       // ekstra point, første gang et trick sidder fast

/* ---------- Point, niveauer og mønter ---------- */
export const XP_PR_POINT = 1 / 3;
export const MOENT_PR_POINT = 1 / 6;
export const MAKS_NIVEAU = 50;         // samme loft som toplistens `maks`
export const START_MOENTER = 20;

/** Samlet erfaring der skal til for at nå niveau n (niveau 1 er 0). */
export const xpTilNiveau = n => 30 * (n - 1) + 6 * (n - 1) * (n - 1);

/** Hundens niveau ved en given mængde erfaring. */
export function niveauFor(xp) {
  let n = 1;
  while (n < MAKS_NIVEAU && xp >= xpTilNiveau(n + 1)) n++;
  return n;
}

/** Hvor langt er hunden på vej mod næste niveau? 0–1 (1 når den er helt oppe). */
export function niveauAndel(xp) {
  const n = niveauFor(xp);
  if (n >= MAKS_NIVEAU) return 1;
  const fra = xpTilNiveau(n), til = xpTilNiveau(n + 1);
  return Math.max(0, Math.min(1, (xp - fra) / (til - fra)));
}

/* ---------- Butikken ---------- */
/*
  `slags` er hvor tingen sidder: pelsen er hundens farve, hat og halsbånd kan
  tages på og af. De tre første pelse er gratis – det er dem, man vælger
  imellem, når man henter hvalpen.
*/
export const TING = [
  { id: 'pels-brun', slags: 'pels', navn: 'Vaks', pris: 0 },
  { id: 'pels-sort', slags: 'pels', navn: 'Sorte', pris: 0 },
  { id: 'pels-hvid', slags: 'pels', navn: 'Snefnug', pris: 0 },
  { id: 'pels-gylden', slags: 'pels', navn: 'Guldlok', pris: 50 },
  { id: 'pels-plettet', slags: 'pels', navn: 'Prikkeline', pris: 90 },
  { id: 'pels-graa', slags: 'pels', navn: 'Ulvegrå', pris: 120 },
  { id: 'pels-choko', slags: 'pels', navn: 'Chokolade', pris: 160 },
  { id: 'hat-sloejfe', slags: 'hat', navn: 'Sløjfe', pris: 25 },
  { id: 'hat-kasket', slags: 'hat', navn: 'Kasket', pris: 40 },
  { id: 'hat-hue', slags: 'hat', navn: 'Nissehue', pris: 45 },
  { id: 'hat-blomst', slags: 'hat', navn: 'Blomst', pris: 55 },
  { id: 'hat-fest', slags: 'hat', navn: 'Festhat', pris: 70 },
  { id: 'hat-krone', slags: 'hat', navn: 'Guldkrone', pris: 130 },
  { id: 'baand-roed', slags: 'halsbaand', navn: 'Rødt halsbånd', pris: 20 },
  { id: 'baand-blaa', slags: 'halsbaand', navn: 'Blåt halsbånd', pris: 20 },
  { id: 'baand-toerklaede', slags: 'halsbaand', navn: 'Tørklæde', pris: 45 },
  { id: 'baand-skilt', slags: 'halsbaand', navn: 'Navneskilt', pris: 60 },
  { id: 'baand-guld', slags: 'halsbaand', navn: 'Guldkæde', pris: 95 },
];

export const tingen = id => TING.find(t => t.id === id) || null;

/** De pelse man kan vælge imellem, når man henter hvalpen (dem der ikke koster noget). */
export const GRATIS_PELSE = TING.filter(t => t.slags === 'pels' && t.pris === 0).map(t => t.id);

/* ---------- Hunden ---------- */

/** En helt ny hvalp. `nu` er tidsstemplet i millisekunder (Date.now()). */
export function nyHund(navn, pels = GRATIS_PELSE[0], nu = 0) {
  return {
    navn: (navn || 'Vaks').trim().slice(0, 12) || 'Vaks',
    pels: GRATIS_PELSE.includes(pels) ? pels : GRATIS_PELSE[0],
    hat: null,
    halsbaand: null,
    ejer: [],                       // købte ting (de gratis pelse står ikke her)
    xp: 0,
    moenter: START_MOENTER,
    behov: { mad: 70, leg: 60, renhed: 85, tur: 55 },
    tricks: {},                     // id → hvor godt den kan det, 0–100
    meter: 0,                       // kilometertæller: alt hvad I har gået sammen
    pulje: 0,                       // meter der endnu ikke er afregnet, se gaa()
    foedt: nu,
    sidst: nu,
  };
}

/** Hundens alder i hele dage. */
export const alderDage = (hund, nu) => Math.max(0, Math.floor((nu - hund.foedt) / 86400000));

/** Gennemsnittet af de fire behov – hvor godt hunden har det, 0–100. */
export const trivsel = hund => BEHOV.reduce((s, b) => s + hund.behov[b], 0) / BEHOV.length;

/** Det behov der trænger mest (laveste værdi). */
export const mestTraengende = hund => BEHOV.reduce((a, b) => (hund.behov[b] < hund.behov[a] ? b : a));

/**
 * Hundens humør, som tegningen og teksterne retter sig efter. Gennemsnittet
 * alene dur ikke: en hund, der har det fint på tre ud af fire, er stadig ked
 * af det, hvis den sidste ting mangler helt.
 */
export function humoer(hund) {
  const lavest = hund.behov[mestTraengende(hund)];
  const t = trivsel(hund);
  if (lavest < 15) return 'ked';
  if (t >= 70 && lavest >= 40) return 'glad';
  if (t >= 40) return 'okay';
  return 'ked';
}

/**
 * Lader `sek` sekunder gå. Behovene falder, og der tælles højst
 * FRAVAER_MAKS_TIMER med, uanset hvor længe man har været væk.
 */
export function forfald(hund, sek) {
  const t = Math.max(0, Math.min(sek, FRAVAER_MAKS_TIMER * 3600));
  for (const b of BEHOV) {
    hund.behov[b] = Math.max(0, hund.behov[b] - t * (FORFALD[b] / 3600));
  }
  return hund;
}

/** Erfaring og mønter for `point`. Se filhovedet: kun for det, der faktisk blev fyldt op. */
export function beloen(hund, point) {
  const foer = niveauFor(hund.xp);
  if (!(point > 0)) return { xp: 0, moenter: 0, niveau: foer, nytNiveau: false };
  const xp = Math.round(point * XP_PR_POINT);
  const moenter = Math.round(point * MOENT_PR_POINT);
  hund.xp += xp;
  hund.moenter += moenter;
  const niveau = niveauFor(hund.xp);
  return { xp, moenter, niveau, nytNiveau: niveau > foer };
}

/**
 * Fylder et behov op med `maengde` point og belønner forskellen.
 * En negativ mængde (en mudderpyt) trækker fra og giver ingenting.
 * Returnerer { oeget, xp, moenter, niveau, nytNiveau }.
 */
export function plej(hund, behov, maengde) {
  const foer = hund.behov[behov];
  hund.behov[behov] = Math.max(0, Math.min(100, foer + maengde));
  const oeget = hund.behov[behov] - foer;
  return { oeget, ...beloen(hund, oeget) };
}

/**
 * Et klap på hunden. Gør en anelse glad, men kun op til KLAP_LOFT og uden
 * erfaring eller mønter – ellers ville man bare kunne trykke sig til alting.
 * Returnerer true, hvis klappet hjalp.
 */
export function klap(hund) {
  if (hund.behov.leg >= KLAP_LOFT) return false;
  hund.behov.leg = Math.min(KLAP_LOFT, hund.behov.leg + 1);
  return true;
}

/* ---------- Gåturen ---------- */

/**
 * En ny rute: hvor lang den er, og hvad man møder undervejs. `rnd` er en
 * funktion, der giver et tal mellem 0 og 1 (spillets seedbare tilfældighed),
 * så den samme seed altid giver den samme tur.
 */
export function nyTur(rnd, laengde = TUR_LAENGDE) {
  const stop = [];
  let m = 16;
  while (m < laengde - 8) {
    const slags = TUR_SLAGS[Math.min(TUR_SLAGS.length - 1, Math.floor(rnd() * TUR_SLAGS.length))];
    stop.push({ m: Math.round(m), slags, klaret: false, forbi: false });
    m += 14 + rnd() * 14;
  }
  return { laengde, m: 0, stop };
}

/**
 * Går `meter` frem. «Luftet» fyldes op pr. meter, men der afregnes først, når
 * der er TUR_BID meter på puljen: ellers ville erfaringen for en enkelt meter
 * runde ned til nul, og man ville gå en hel tur uden at få noget for det.
 * Returnerer belønningen for det afregnede bid – ellers null.
 */
export function gaa(hund, meter) {
  hund.pulje = (hund.pulje || 0) + Math.max(0, meter);
  if (hund.pulje < TUR_BID) return null;
  const bid = Math.floor(hund.pulje / TUR_BID) * TUR_BID;
  hund.pulje -= bid;
  hund.meter = (hund.meter || 0) + bid;
  return plej(hund, 'tur', bid * TUR_PR_METER);
}

/**
 * Noget på turen blev trykket på (`ramt`) eller passeret uden et tryk.
 * Returnerer { oeget, xp, moenter, niveau, nytNiveau, tekst } – eller null,
 * hvis der ikke skete noget (man missede en pind, og så er den bare væk).
 */
export function turStop(hund, slags, ramt = true) {
  const ting = TUR_TING[slags];
  if (!ting) return null;
  const navn = hund.navn;

  if (ting.undgaa) {
    // Mudderpytten: trykket er redningen, og det er dét at lade være, der koster
    if (ramt) return { oeget: 0, xp: 0, moenter: 0, niveau: niveauFor(hund.xp), nytNiveau: false, tekst: `Du nåede at trække i snoren – ${navn} gik udenom!` };
    const r = plej(hund, ting.behov, ting.giv);
    return { ...r, tekst: `Plask! ${navn} sprang lige i mudderpytten.` };
  }
  if (!ramt) return null;

  if (slags === 'pose') {
    const r = beloen(hund, POSE_POINT);
    return { oeget: 0, ...r, tekst: `Du samlede op efter ${navn}. Sådan gør en god hundeejer! +${r.moenter} 🪙` };
  }
  const r = plej(hund, ting.behov, ting.giv);
  const tekst = {
    lygte: `${navn} snuser grundigt til lygtepælen.`,
    pind: `${navn} fangede pinden!`,
    kat: `VUF! ${navn} gøede ad katten.`,
    ven: `${navn} hilste på en anden hund.`,
  }[slags] || `${navn} er glad.`;
  return { ...r, tekst };
}

/* ---------- Tricks ---------- */

/** Hvor godt hunden kan et trick, 0–100. */
export const laert = (hund, id) => hund.tricks?.[id] || 0;

/** Kan tricket øves endnu? Der er et niveau-krav på hvert trick. */
export function kanTraene(hund, id) {
  const t = trick(id);
  return !!t && niveauFor(hund.xp) >= t.niveau;
}

/**
 * Chancen for at hunden gør det rigtigt. Den vokser med, hvor godt den kan
 * tricket – men ganges med hvor godt den har det: en sulten hund, der ikke
 * har været ude i to dage, hører ikke efter.
 */
export function trickChance(hund, id) {
  const l = laert(hund, id);
  const t = trivsel(hund);
  return Math.max(0.05, Math.min(0.95, (0.2 + 0.0075 * l) * (0.55 + 0.45 * (t / 100))));
}

/**
 * Én øvelse. `held` er et tal mellem 0 og 1 (spillets terning), så motoren er
 * forudsigelig i en test. Returnerer { ok, laert, mestret, xp, moenter,
 * niveau, nytNiveau } – eller null, hvis tricket ikke er låst op endnu.
 */
export function traen(hund, id, held = 0.5) {
  if (!kanTraene(hund, id)) return null;
  const foer = laert(hund, id);
  const ok = held < trickChance(hund, id);
  const nu = Math.min(MESTRET, foer + (ok ? LAERT_OK : LAERT_FEJL));
  hund.tricks[id] = nu;
  const mestret = nu >= MESTRET && foer < MESTRET;

  // At øve er også leg – og som alt andet her belønnes kun det, der blev fyldt op
  const leg = plej(hund, 'leg', ok ? 4 : 2);
  const r = beloen(hund, (nu - foer) + (mestret ? MESTRET_BONUS : 0));
  return {
    ok, laert: nu, mestret,
    xp: r.xp + leg.xp,
    moenter: r.moenter + leg.moenter,
    niveau: r.niveau,
    nytNiveau: r.nytNiveau || leg.nytNiveau,
  };
}

/** Hvor mange tricks hunden kan helt. */
export const kanTricks = hund => TRICKS.filter(t => laert(hund, t.id) >= MESTRET).length;

/** De tricks hunden kan vise frem lige nu (dem der er låst op). */
export const aabneTricks = hund => TRICKS.filter(t => kanTraene(hund, t.id));

/* ---------- Gem og hent ---------- */

/** Hunden som almindeligt objekt, klar til JSON.stringify. */
export function serialiser(hund, nu = hund.sidst) {
  return {
    v: 1,
    navn: hund.navn, pels: hund.pels, hat: hund.hat, halsbaand: hund.halsbaand,
    ejer: hund.ejer.slice(), xp: hund.xp, moenter: hund.moenter,
    behov: { ...hund.behov },
    tricks: { ...hund.tricks },
    meter: Math.round(hund.meter || 0),
    foedt: hund.foedt, sidst: nu,
  };
}

const tal = (v, fald, min = 0, maks = 100) =>
  (typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.min(maks, v)) : fald);

/**
 * Læser en gemt hund og lader tiden siden `sidst` gå. Er der noget galt med
 * data, falder vi tilbage til fornuftige værdier i stedet for at miste hunden.
 * Returnerer { hund, vaekSek } – hvor længe man har været væk (afkortet).
 */
export function laes(data, nu) {
  if (!data || typeof data !== 'object' || typeof data.navn !== 'string') return null;
  const hund = nyHund(data.navn, data.pels, nu);
  if (tingen(data.pels)?.slags === 'pels') hund.pels = data.pels;
  hund.ejer = Array.isArray(data.ejer) ? data.ejer.filter(id => !!tingen(id)) : [];
  hund.xp = Math.max(0, Math.round(tal(data.xp, 0, 0, xpTilNiveau(MAKS_NIVEAU))));
  hund.moenter = Math.max(0, Math.round(tal(data.moenter, START_MOENTER, 0, 1e7)));
  hund.hat = ejer(hund, data.hat) && tingen(data.hat).slags === 'hat' ? data.hat : null;
  hund.halsbaand = ejer(hund, data.halsbaand) && tingen(data.halsbaand).slags === 'halsbaand' ? data.halsbaand : null;
  for (const b of BEHOV) hund.behov[b] = tal(data.behov?.[b], 50);
  for (const t of TRICKS) hund.tricks[t.id] = Math.round(tal(data.tricks?.[t.id], 0, 0, MESTRET));
  hund.meter = Math.max(0, Math.round(tal(data.meter, 0, 0, 1e9)));
  hund.foedt = typeof data.foedt === 'number' && data.foedt > 0 && data.foedt <= nu ? data.foedt : nu;

  const sidst = typeof data.sidst === 'number' && data.sidst > 0 ? data.sidst : nu;
  const vaekSek = Math.max(0, Math.min((nu - sidst) / 1000, FRAVAER_MAKS_TIMER * 3600));
  const foer = { ...hund.behov };
  forfald(hund, vaekSek);
  // Et fravær må gerne kunne ses på hunden, men den skal ikke være helt i bund,
  // når man kommer hjem fra skole – så er der ingen fornøjelse ved at komme tilbage.
  for (const b of BEHOV) hund.behov[b] = Math.max(hund.behov[b], Math.min(foer[b], FRAVAER_BUND));
  hund.sidst = nu;
  return { hund, vaekSek };
}

/* ---------- Butikken ---------- */

/** Ejer hunden tingen? Gratis ting ejer man altid. */
export function ejer(hund, id) {
  const t = tingen(id);
  return !!t && (t.pris === 0 || hund.ejer.includes(id));
}

/** Køber en ting, hvis der er råd, og tager den på. Returnerer true ved køb. */
export function koeb(hund, id) {
  const t = tingen(id);
  if (!t || ejer(hund, id) || hund.moenter < t.pris) return false;
  hund.moenter -= t.pris;
  hund.ejer.push(id);
  tagPaa(hund, id);
  return true;
}

/**
 * Tager en ting på. Hat og halsbånd kan tages af igen ved at trykke på den,
 * man allerede har på; pelsen skal hunden jo beholde.
 */
export function tagPaa(hund, id) {
  const t = tingen(id);
  if (!t || !ejer(hund, id)) return false;
  if (t.slags === 'pels') hund.pels = id;
  else hund[t.slags] = hund[t.slags] === id ? null : id;
  return true;
}

/* ---------- Tekster ---------- */

/** En linje om, hvordan det gik, mens man var væk. Null hvis man lige har været her. */
export function velkomst(hund, vaekSek) {
  if (vaekSek < 90) return null;
  const timer = vaekSek / 3600;
  const hvornaar = timer >= 1.5 ? `${Math.round(timer)} timer` : `${Math.round(vaekSek / 60)} minutter`;
  const mangel = mestTraengende(hund);
  const savn = {
    mad: 'og er godt sulten',
    leg: 'og vil så gerne lege',
    renhed: 'og trænger til et bad',
    tur: 'og står med snoren i munden',
  }[mangel];
  if (hund.behov[mangel] > 60) return `${hund.navn} har haft det fint i ${hvornaar}.`;
  return `${hund.navn} har savnet dig i ${hvornaar} ${savn}.`;
}

/** Kilometertælleren, skrevet så et barn kan læse den. */
export function meterTekst(meter) {
  const m = Math.round(meter || 0);
  return m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1).replace('.', ',')} km`;
}
