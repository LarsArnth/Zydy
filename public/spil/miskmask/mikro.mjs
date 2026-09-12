/*
  Miskmask – motoren bag posen med blandede minispil.

  Selmas ønske lød «Vil du gerne lave en verity app», altså en *variety* app:
  én app med mange forskellige småting i. Det er blevet til 13 bittesmå spil,
  der kommer ét ad gangen med få sekunder til hvert: tryk på knappen, find den
  anderledes, prik ballonerne, lad være med at røre, tæl frugterne … Man har
  tre liv, og det går hurtigere, jo længere man når.

  Filen er ren JS uden DOM og uden canvas, så alle minispillene kan spilles
  igennem uden browser (test/unit/miskmask.test.mjs). index.html står for
  tegningen og fingrene på skærmen.

  To ting er værd at vide, før man tilføjer et minispil:

  1. **Alle minispil deler den samme regel.** Et minispil beskriver bare en
     håndfuld *felter*, hvor nogle er rigtige. Rammer man alle de rigtige
     (`krav`), har man vundet; rammer man et forkert, har man tabt; løber tiden
     ud, har man tabt – medmindre spillet vinder ved at vente (`vindVedTid`,
     som «RØR IKKE!» gør). Så skal hvert nyt minispil kun sige, hvad der står
     på skærmen, ikke hvordan man vinder.

  2. **Fladen er et kvadrat på 100 × 100 enheder** – x til højre, y nedad.
     Kvadratet, fordi en cirkel skal være rund både på en iPhone på højkant og
     en iPad på tværs; index.html lægger det midt i skærmen og har HUD'en
     udenfor. Et felt er et rektangel med centrum (x, y) og størrelsen (w, h),
     uanset hvad det er tegnet som – en finger er ikke spids.
*/

/* ---------- Regler for hele spillet ---------- */
export const LIV = 3;               // hjerter man starter med
export const TID_START = 5.0;       // sekunder til den første runde
export const TID_MIN = 2.2;         // og til runde 21 og frem
export const RUNDER_TIL_FULD_FART = 20;
export const RAMME = 3;             // enheder man må ramme ved siden af et rigtigt felt

/** 0 i første runde, 1 når der ikke skrues mere op. */
export const svaerhed = runde => Math.min(1, Math.max(0, (runde - 1) / RUNDER_TIL_FULD_FART));

/** Sekunder til en runde. `faktor` giver de langsomme minispil lidt mere luft. */
export const tidFor = (runde, faktor = 1) =>
  Math.round((TID_START - (TID_START - TID_MIN) * svaerhed(runde)) * faktor * 100) / 100;

/* ---------- Små hjælpere ---------- */
export const mellem = (rnd, a, b) => a + rnd() * (b - a);
export const heltal = (rnd, a, b) => a + Math.floor(rnd() * (b - a + 1));
export const vaelg = (rnd, liste) => liste[Math.floor(rnd() * liste.length)];

/** Blander listen på plads (Fisher-Yates) og returnerer den. */
export function bland(rnd, liste) {
  for (let i = liste.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [liste[i], liste[j]] = [liste[j], liste[i]];
  }
  return liste;
}

/** Farverne minispillene bruger. `navn` er den form, der passer i «TRYK PÅ DEN …». */
export const FARVER = [
  { id: 'roed', navn: 'RØDE', hex: '#ff4d5e' },
  { id: 'blaa', navn: 'BLÅ', hex: '#4d8dff' },
  { id: 'groen', navn: 'GRØNNE', hex: '#3ddc84' },
  { id: 'gul', navn: 'GULE', hex: '#ffd447' },
  { id: 'lilla', navn: 'LILLA', hex: '#a97bff' },
  { id: 'orange', navn: 'ORANGE', hex: '#ff8a3d' },
];

/**
 * n pladser spredt ud over fladen: et gitter med lidt slinger, så det ikke ser
 * stift ud, men heller aldrig lægger to ting oven i hinanden.
 * Hver plads har `plads` = hvor stor en ting, der kan være i cellen.
 */
export function pladser(rnd, n, { top = 10, bund = 90, venstre = 10, hoejre = 90 } = {}) {
  const kol = Math.ceil(Math.sqrt(n));
  const raek = Math.ceil(n / kol);
  const celler = [];
  for (let r = 0; r < raek; r++) for (let k = 0; k < kol; k++) celler.push({ r, k });
  bland(rnd, celler);
  const bredde = (hoejre - venstre) / kol, hoejde = (bund - top) / raek;
  return celler.slice(0, n).map(c => ({
    x: venstre + bredde * (c.k + 0.5) + (rnd() - 0.5) * bredde * 0.28,
    y: top + hoejde * (c.r + 0.5) + (rnd() - 0.5) * hoejde * 0.28,
    plads: Math.min(bredde, hoejde),
  }));
}

/** n ting på række i midten – til svarknapper, hvor rækkefølgen skal kunne læses. */
export function raekke(n, y, { venstre = 8, hoejre = 92 } = {}) {
  const bredde = (hoejre - venstre) / n;
  return Array.from({ length: n }, (_, i) => ({ x: venstre + bredde * (i + 0.5), y, plads: bredde }));
}

/* ---------- De 13 minispil ---------- */
/*
  Hvert minispil har:
    id, navn        – navnet vises på slutskærmen («du tabte på …»)
    tidFaktor       – ganges på rundens tid; under 1 = skal gå tjept
    forbered(rnd, sv) → { instruktion, felter, pynt?, krav?, vindVedTid?, raekkefoelge? }
    bevaeg?(r, dt)  – hvis felterne flytter sig

  Et felt: { x, y, w, h, rigtig, slags, farve, tekst?, orden?, gentag? }
  `slags` bestemmer kun, hvordan index.html tegner det.
*/
export const MIKROSPIL = [
  {
    id: 'tryk', navn: 'Tryk!', tidFaktor: 0.7,
    forbered(rnd, sv) {
      const w = 48 - 20 * sv, h = w * 0.6;
      return {
        instruktion: 'TRYK!',
        felter: [{
          x: mellem(rnd, w / 2 + 4, 96 - w / 2), y: mellem(rnd, h / 2 + 8, 92 - h / 2),
          w, h, rigtig: true, slags: 'knap', farve: '#ffd447', tekst: 'TRYK',
        }],
      };
    },
  },

  {
    id: 'roer', navn: 'Rør ikke!', tidFaktor: 0.85, vindVedTid: true,
    forbered() {
      // Hele fladen er ét forkert felt: her vinder man ved at holde fingrene i skødet.
      // Feltet er med vilje større end de 100 × 100, så et tryk uden for kvadratet
      // også tæller – ellers ville kanten af skærmen være et frirum.
      return {
        instruktion: 'RØR IKKE!',
        felter: [{ x: 50, y: 50, w: 400, h: 400, rigtig: false, slags: 'fristelse', farve: '#ff4d5e', tekst: 'TRYK MIG' }],
      };
    },
  },

  {
    id: 'anderledes', navn: 'Find den anderledes',
    forbered(rnd, sv) {
      const n = 4 + Math.round(5 * sv);
      const a = vaelg(rnd, FARVER);
      let b = vaelg(rnd, FARVER);
      while (b.id === a.id) b = vaelg(rnd, FARVER);
      const form = vaelg(rnd, ['cirkel', 'firkant', 'stjerne', 'hjerte']);
      const p = pladser(rnd, n);
      const anderledes = Math.floor(rnd() * n);
      return {
        instruktion: 'FIND DEN ANDERLEDES',
        felter: p.map((q, i) => ({
          x: q.x, y: q.y, w: q.plads * 0.74, h: q.plads * 0.74,
          rigtig: i === anderledes, slags: form, farve: i === anderledes ? b.hex : a.hex,
        })),
      };
    },
  },

  {
    id: 'balloner', navn: 'Prik ballonerne', tidFaktor: 1.3,
    forbered(rnd, sv) {
      const n = 3 + Math.round(3 * sv);
      const p = pladser(rnd, n, { top: 22, bund: 88 });
      const farver = bland(rnd, FARVER.slice());
      return {
        instruktion: 'PRIK ALLE BALLONERNE',
        felter: p.map((q, i) => ({
          x: q.x, y: q.y, w: 18, h: 21, rigtig: true, slags: 'ballon',
          farve: farver[i % farver.length].hex, fart: 6 + 10 * sv + rnd() * 5,
        })),
      };
    },
    bevaeg(r, dt) {
      // Ballonerne stiger. Slipper en ud foroven, kommer der en ny nedefra.
      for (const f of r.felter) {
        if (f.taget) continue;
        f.y -= f.fart * dt;
        if (f.y < -12) f.y = 104;
      }
    },
  },

  {
    id: 'fang', navn: 'Fang den!', tidFaktor: 1.15,
    forbered(rnd, sv) {
      const fart = 32 + 46 * sv, v = rnd() * Math.PI * 2, s = 22 - 7 * sv;
      return {
        instruktion: 'FANG DEN!',
        felter: [{
          x: mellem(rnd, 30, 70), y: mellem(rnd, 30, 70), w: s, h: s,
          rigtig: true, slags: 'dyr', farve: '#ffd447',
          vx: Math.cos(v) * fart, vy: Math.sin(v) * fart,
        }],
      };
    },
    bevaeg(r, dt) {
      for (const f of r.felter) {
        f.x += f.vx * dt; f.y += f.vy * dt;
        const mx = f.w / 2 + 2, my = f.h / 2 + 2;
        if (f.x < mx) { f.x = mx; f.vx = Math.abs(f.vx); }
        if (f.x > 100 - mx) { f.x = 100 - mx; f.vx = -Math.abs(f.vx); }
        if (f.y < my) { f.y = my; f.vy = Math.abs(f.vy); }
        if (f.y > 100 - my) { f.y = 100 - my; f.vy = -Math.abs(f.vy); }
      }
    },
  },

  {
    id: 'stoerst', navn: 'Det største tal', tidFaktor: 0.95,
    forbered(rnd, sv) {
      const loft = 9 + Math.round(80 * sv);
      const tal = [];
      while (tal.length < 3) { const t = heltal(rnd, 1, loft); if (!tal.includes(t)) tal.push(t); }
      const maks = Math.max(...tal);
      const p = raekke(3, 54);
      return {
        instruktion: 'TRYK PÅ DET STØRSTE TAL',
        felter: p.map((q, i) => ({
          x: q.x, y: q.y, w: q.plads * 0.82, h: q.plads * 0.82,
          rigtig: tal[i] === maks, slags: 'tal', farve: '#5b8cff', tekst: String(tal[i]),
        })),
      };
    },
  },

  {
    id: 'regne', navn: 'Passer det?', tidFaktor: 1.25,
    forbered(rnd, sv) {
      const a = heltal(rnd, 2, 5 + Math.round(12 * sv));
      const b = heltal(rnd, 1, 4 + Math.round(9 * sv));
      const plus = rnd() < 0.6 || a <= b;
      const svaret = plus ? a + b : a - b;
      const skalPasse = rnd() < 0.5;
      const skaev = heltal(rnd, 1, 3) * (rnd() < 0.5 && svaret > 4 ? -1 : 1);
      const vist = skalPasse ? svaret : svaret + skaev;
      const p = raekke(2, 74, { venstre: 16, hoejre: 84 });
      return {
        instruktion: 'PASSER DET?',
        pynt: [{ x: 50, y: 38, w: 84, h: 26, slags: 'stykke', farve: '#fff7e6', tekst: `${a} ${plus ? '+' : '−'} ${b} = ${vist}` }],
        felter: [
          { x: p[0].x, y: p[0].y, w: 30, h: 24, rigtig: skalPasse, slags: 'knap', farve: '#3ddc84', tekst: 'JA' },
          { x: p[1].x, y: p[1].y, w: 30, h: 24, rigtig: !skalPasse, slags: 'knap', farve: '#ff4d5e', tekst: 'NEJ' },
        ],
      };
    },
  },

  {
    id: 'farve', navn: 'Find farven',
    forbered(rnd) {
      const valgte = bland(rnd, FARVER.slice()).slice(0, 4);
      const maal = vaelg(rnd, valgte);
      const p = pladser(rnd, 4, { top: 22, bund: 86, venstre: 16, hoejre: 84 });
      return {
        instruktion: `TRYK PÅ DEN ${maal.navn}`,
        felter: p.map((q, i) => ({
          x: q.x, y: q.y, w: q.plads * 0.8, h: q.plads * 0.8,
          rigtig: valgte[i].id === maal.id, slags: 'cirkel', farve: valgte[i].hex,
        })),
      };
    },
  },

  {
    id: 'bogstav', navn: 'Find bogstavet', tidFaktor: 1.05,
    forbered(rnd, sv) {
      const n = 5 + Math.round(4 * sv);
      const p = pladser(rnd, n);
      const hvor = Math.floor(rnd() * n);
      const bogstav = vaelg(rnd, [...'ABDEFGHKMPRSTÆØÅ']);
      return {
        instruktion: 'FIND BOGSTAVET',
        felter: p.map((q, i) => ({
          x: q.x, y: q.y, w: q.plads * 0.72, h: q.plads * 0.72,
          rigtig: i === hvor, slags: 'tegn', farve: i === hvor ? '#a97bff' : '#4d8dff',
          tekst: i === hvor ? bogstav : String(heltal(rnd, 0, 9)),
        })),
      };
    },
  },

  {
    id: 'tael', navn: 'Hvor mange?', tidFaktor: 1.35,
    forbered(rnd, sv) {
      const n = heltal(rnd, 3, 6 + Math.round(4 * sv));
      const form = vaelg(rnd, ['cirkel', 'stjerne', 'hjerte', 'firkant']);
      const farve = vaelg(rnd, FARVER).hex;
      const p = pladser(rnd, n, { top: 12, bund: 58 });
      // Svarmulighederne ligger tæt om det rigtige tal, så man er nødt til at tælle efter.
      const svar = new Set([n]);
      for (let d = 1; svar.size < 3; d++) { if (n - d >= 1) svar.add(n - d); if (svar.size < 3) svar.add(n + d); }
      const valg = [...svar].sort((a, b) => a - b);
      const q = raekke(valg.length, 80);
      return {
        instruktion: 'HVOR MANGE?',
        pynt: p.map(o => ({ x: o.x, y: o.y, w: o.plads * 0.6, h: o.plads * 0.6, slags: form, farve })),
        felter: valg.map((v, i) => ({
          x: q[i].x, y: q[i].y, w: q[i].plads * 0.78, h: 22,
          rigtig: v === n, slags: 'tal', farve: '#5b8cff', tekst: String(v),
        })),
      };
    },
  },

  {
    id: 'bombe', navn: 'Pas på bomben', tidFaktor: 1.25,
    forbered(rnd, sv) {
      const stjerner = 2 + Math.round(3 * sv);
      const p = pladser(rnd, stjerner + 1);
      const bombe = Math.floor(rnd() * p.length);
      return {
        instruktion: 'TAG STJERNERNE – IKKE BOMBEN',
        felter: p.map((q, i) => ({
          x: q.x, y: q.y, w: q.plads * 0.7, h: q.plads * 0.7,
          rigtig: i !== bombe, slags: i === bombe ? 'bombe' : 'stjerne',
          farve: i === bombe ? '#2b2f66' : '#ffd447',
        })),
      };
    },
  },

  {
    id: 'gentag', navn: 'Tryk igen og igen', tidFaktor: 1.15,
    forbered(rnd, sv) {
      const antal = 3 + Math.round(4 * sv);
      return {
        instruktion: `TRYK ${antal} GANGE`,
        krav: antal,
        felter: [{
          x: 50, y: 54, w: 52, h: 40, rigtig: true, gentag: true,
          slags: 'knap', farve: '#ff8a3d', tekst: 'TRYK',
        }],
      };
    },
  },

  {
    id: 'orden', navn: '1-2-3', tidFaktor: 1.35, raekkefoelge: true,
    forbered(rnd, sv) {
      const n = 3 + Math.round(2 * sv);
      const p = pladser(rnd, n);
      return {
        instruktion: 'TRYK PÅ TALLENE I RÆKKEFØLGE',
        felter: p.map((q, i) => ({
          x: q.x, y: q.y, w: q.plads * 0.72, h: q.plads * 0.72, rigtig: true, orden: i + 1,
          slags: 'tal', farve: FARVER[i % FARVER.length].hex, tekst: String(i + 1),
        })),
      };
    },
  },
];

export const MIKRO = Object.fromEntries(MIKROSPIL.map(m => [m.id, m]));

/* ---------- Posen: alle minispil kommer, før nogen kommer igen ---------- */
/**
 * Trækker minispil som sedler af en pose. Så ser man alle 13, før nogen
 * gentager sig – med almindelig terning ville det samme spil ofte komme to
 * gange lige efter hinanden, og så føles det slet ikke som en blandet pose.
 */
export function pose(rnd) {
  let rest = [];
  let sidste = null;
  return {
    naeste() {
      if (!rest.length) {
        rest = bland(rnd, MIKROSPIL.map(m => m.id));
        // Byt, hvis posen begynder med det samme som sidst.
        if (rest.length > 1 && rest[0] === sidste) [rest[0], rest[1]] = [rest[1], rest[0]];
      }
      sidste = rest.shift();
      return MIKRO[sidste];
    },
  };
}

/* ---------- En runde ---------- */
/** Gør et minispils beskrivelse til en runde, man kan spille. */
export function lavRunde(mikro, rnd, runde) {
  const sv = svaerhed(runde);
  const s = mikro.forbered(rnd, sv);
  const felter = s.felter.map((f, i) => ({ w: 18, h: 18, rigtig: false, slags: 'cirkel', farve: '#ffd447', taget: false, i, ...f }));
  const r = {
    id: mikro.id, navn: mikro.navn, instruktion: s.instruktion,
    felter, pynt: s.pynt || [],
    krav: s.krav ?? felter.filter(f => f.rigtig).length,
    vindVedTid: !!(s.vindVedTid ?? mikro.vindVedTid),
    raekkefoelge: !!(s.raekkefoelge ?? mikro.raekkefoelge),
    tid: s.tid ?? tidFor(runde, mikro.tidFaktor ?? 1),
    runde, sv, gaaet: 0, ramt: 0, status: 'spiller', forkert: null,
  };
  r.tilbage = r.tid;
  return r;
}

/** Næste runde fra posen. */
export const nyRunde = (posen, rnd, runde) => lavRunde(posen.naeste(), rnd, runde);

/** Feltet under fingeren – det øverste, altså det sidst tegnede. */
export function feltUnder(r, x, y, pad = 0, kunRigtige = false) {
  for (let i = r.felter.length - 1; i >= 0; i--) {
    const f = r.felter[i];
    if (kunRigtige && !f.rigtig) continue;
    if (Math.abs(x - f.x) <= f.w / 2 + pad && Math.abs(y - f.y) <= f.h / 2 + pad) return f;
  }
  return null;
}

/**
 * Et tryk på (x, y). Returnerer rundens status bagefter.
 * Rammer man lige ved siden af et rigtigt felt, tæller det med (RAMME) – men
 * et næsten-tryk på et forkert felt koster ikke et liv. Børnefingre er brede,
 * og det skal være sjovt, ikke fælder.
 */
export function tryk(r, x, y) {
  if (r.status !== 'spiller') return r.status;
  const f = feltUnder(r, x, y) || feltUnder(r, x, y, RAMME, true);
  if (!f || f.taget) return r.status;
  const iOrden = !r.raekkefoelge || f.orden === r.ramt + 1;
  if (!f.rigtig || !iOrden) {
    f.ramtForkert = true;
    r.forkert = f;
    r.status = 'tabte';
    return r.status;
  }
  if (!f.gentag) f.taget = true;
  r.ramt++;
  if (r.ramt >= r.krav) r.status = 'vandt';
  return r.status;
}

/** Lader dt sekunder gå. Returnerer rundens status bagefter. */
export function tik(r, dt) {
  if (r.status !== 'spiller') return r.status;
  r.gaaet += dt;
  r.tilbage = Math.max(0, r.tid - r.gaaet);
  const m = MIKRO[r.id];
  if (m && m.bevaeg) m.bevaeg(r, dt);
  if (r.tilbage <= 0) r.status = r.vindVedTid ? 'vandt' : 'tabte';
  return r.status;
}

/** De tryk der mangler for at vinde, i den rækkefølge de skal komme. Tom = vent. */
export function facit(r) {
  const rest = r.felter.filter(f => f.rigtig && !f.taget);
  if (r.raekkefoelge) rest.sort((a, b) => (a.orden || 0) - (b.orden || 0));
  return rest.map(f => ({ x: f.x, y: f.y }));
}

/** Spiller runden rigtigt igennem (bruges af testene). Vent-runder skal have tid i stedet. */
export function loes(r) {
  for (let i = 0; i < 200 && r.status === 'spiller'; i++) {
    const punkter = facit(r);
    if (!punkter.length) break;
    tryk(r, punkter[0].x, punkter[0].y);
  }
  return r.status;
}
