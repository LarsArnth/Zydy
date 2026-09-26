// Kyllingejagt – gårdspladsen, bonden og kyllingerne. Ren JS uden browser, så
// det hele kan enhedstestes:  node --test test/unit/kylling.test.mjs
//
// Joannas ønske: «Lav et spil hvor man skal fange så mange kyllinger som muligt».
// Gårdspladsen ses oppefra, man løber rundt med et joystick, og kyllingerne
// flygter. Løber man ind i en, er den fanget og hopper hjem i hønsehuset. Man
// har TID sekunder, og scoren er antal fangede kyllinger.
//
// Tre ting gør det til et spil og ikke bare et løb:
//   1. Kyllingerne er langsommere end en selv, men de **slår smut**: kommer man
//      helt tæt på, springer de lynhurtigt til siden (SMUT_*), og så skal man
//      vende. Et smut kan først bruges igen efter SMUT_PAUSE sekunder – det er
//      dér, man skal slå til.
//   2. **Hegnet hjælper én**: en kylling, der løber mod hegnet, drejer langs
//      med det, og i et hjørne er der kun smuttet tilbage.
//   3. **Guldkyllingen** tæller GULD.vaerd, er hurtigere og kommer kun ud et
//      øjeblik, før den løber hjem i hønsehuset igen.
//
// Alt regnes i meter. Gårdspladsen er b × h meter (højden følger skærmen), og
// hønsehusets dør sidder midt på den øverste kant (y = 0). Står man lige ved
// døren, tør kyllingerne ikke komme ud – ellers kunne man bare stå dér og tage
// dem, efterhånden som de kom.

export const TID = 60;                 // sekunder pr. runde
export const MAAL_MIN = 12, MAAL_MAKS = 28;   // gårdspladsens sider i meter
export const BONDE_R = 0.55;           // bondens krop
export const KYLLING_R = 0.32;
export const FANG_R = BONDE_R + KYLLING_R + 0.08;
export const BONDE_FART = 6.2;         // m/s med joysticket helt ude
export const BONDE_ACC = 26;           // m/s² – så en vending koster lidt
export const GAA_FART = 0.9;           // kyllinger, der går og pikker
export const FLUGT_FART = 4.3;         // kyllinger på flugt
export const FLUGT_ACC = 22;
export const SKRAEK = 3.6;             // så tæt på bliver en kylling bange
export const SMUT_AFSTAND = 1.75;      // så tæt på slår den smut
export const SMUT_FART = 10.5, SMUT_TID = 0.22, SMUT_PAUSE = 1.6;
export const HEGN_SKY = 1.8;           // så langt fra hegnet begynder den at dreje
export const ANTAL = 6;                // almindelige kyllinger på pladsen ad gangen
export const UD_PAUSE = 0.7;           // sekunder mellem to kyllinger ud af døren
export const DOER_SKY = 3;             // står bonden nærmere døren, bliver de inde
export const OPTRAPNING = 0.008, OPTRAPNING_MAKS = 0.25;   // flugtfarten stiger med fangsten
export const GULD = {
  vaerd: 3,       // en guldkylling tæller for tre
  fart: 1.2,      // gange så hurtig
  pause: 1.0,     // sekunder mellem to smut (i stedet for SMUT_PAUSE)
  tid: 9,         // sekunder ude, før den løber hjem
  foerst: 12,     // første guldkylling kommer efter så mange sekunder
  hvert: 15,      // og den næste så længe efter, den forrige er væk
};

/** Lille, hurtig tilfældighedsgenerator med frø – samme frø, samme runde. */
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const klem = (v, a, b) => Math.max(a, Math.min(b, v));

/**
 * Gårdspladsens mål ud fra skærmens. Formen følger skærmen, men arealet er
 * altid det samme (AREAL m²), så en iPad på tværs og en iPhone på højkant har
 * lige langt mellem kyllingerne – ellers var toplisten ikke fair.
 */
export const AREAL = 300;
export function gaardMaal(skaermB, skaermH) {
  const forhold = skaermB > 0 && skaermH > 0 ? klem(skaermH / skaermB, 0.5, 2) : 1.6;
  const b = Math.sqrt(AREAL / forhold);
  return { b, h: b * forhold };
}

/** Hønsehusets dør – midt på den øverste kant. */
export const doer = s => ({ x: s.b / 2, y: 0 });

/** En ny runde. b og h er gårdspladsens mål i meter. */
export function nyTur(seed = 1, b = 14, h = 22) {
  b = klem(b, MAAL_MIN, MAAL_MAKS); h = klem(h, MAAL_MIN, MAAL_MAKS);
  const s = {
    seed: seed >>> 0, rnd: mulberry32(seed >>> 0), b, h,
    t: 0, fangst: 0, antal: 0, guldFanget: 0, slut: false,
    bonde: { x: b / 2, y: h * 0.62, vx: 0, vy: 0, vendt: 1 },
    kyllinger: [], naesteId: 1,
    udTil: 0, guldTil: GULD.foerst,
  };
  // Pladsen er fuld fra start, så man kan gå i gang med det samme – men ingen
  // kylling står så tæt på bonden, at den allerede er bange.
  for (let i = 0; i < ANTAL; i++) {
    let x, y, forsoeg = 0;
    do {
      x = 1 + s.rnd() * (b - 2); y = 1.5 + s.rnd() * (h - 2.5);
      forsoeg++;
    } while (Math.hypot(x - s.bonde.x, y - s.bonde.y) < SKRAEK + 1.5 && forsoeg < 50);
    s.kyllinger.push(nyKylling(s, x, y, 'kylling'));
  }
  return s;
}

function nyKylling(s, x, y, slags) {
  return {
    id: s.naesteId++, slags, x, y, vx: 0, vy: 0,
    smut: 0, smutKlar: 0,              // sekunder tilbage af smuttet / til det næste
    vandre: 0, vx0: 0, vy0: 0,         // hvor den går hen, når den ikke er bange
    bange: false, hjem: false,
    ud: slags === 'guld' ? s.t + GULD.tid : 0,   // guldkyllingens tid ude
    fase: s.rnd() * 6.283,             // til tegningen: pik og vræl i hver sin takt
  };
}

/** Hvor meget plads der er omkring et punkt – afstanden til det nærmeste hegn. */
export function plads(s, x, y) {
  return Math.min(x, s.b - x, y, s.h - y);
}

/**
 * Kyllingens flugtfart lige nu (stiger lidt, jo flere man har fanget). Den når
 * aldrig bondens egen fart – så kan man altid indhente en kylling i fri bane,
 * og det er smuttene, der gør det svært.
 */
export function flugtFart(s, k) {
  const op = 1 + Math.min(OPTRAPNING_MAKS, s.fangst * OPTRAPNING);
  return Math.min(BONDE_FART * 0.92, FLUGT_FART * op * (k.slags === 'guld' ? GULD.fart : 1));
}

/** Skub væk fra hegnet – større, jo tættere på. Giver [x, y]. */
function hegnSkub(s, x, y) {
  let hx = 0, hy = 0;
  if (x < HEGN_SKY) hx += (HEGN_SKY - x) / HEGN_SKY;
  if (s.b - x < HEGN_SKY) hx -= (HEGN_SKY - (s.b - x)) / HEGN_SKY;
  if (y < HEGN_SKY) hy += (HEGN_SKY - y) / HEGN_SKY;
  if (s.h - y < HEGN_SKY) hy -= (HEGN_SKY - (s.h - y)) / HEGN_SKY;
  return [hx * 1.6, hy * 1.6];
}

function styrMod(k, mx, my, fart, acc, dt) {
  const l = Math.hypot(mx, my) || 1;
  const ønskVx = mx / l * fart, ønskVy = my / l * fart;
  let dvx = ønskVx - k.vx, dvy = ønskVy - k.vy;
  const dl = Math.hypot(dvx, dvy), maks = acc * dt;
  if (dl > maks) { dvx *= maks / dl; dvy *= maks / dl; }
  k.vx += dvx; k.vy += dvy;
}

/**
 * Ét skridt. styr er joysticket: { x, y } med længde 0-1 (eller null = stå stille).
 * Giver hændelserne i skridtet: { fanget: [...], ud: [...], hjem: [...], smut: [...], slut }.
 */
export function tik(s, dt, styr) {
  const e = { fanget: [], ud: [], hjem: [], smut: [], slut: false };
  if (s.slut) return e;
  s.t += dt;

  /* --- Bonden --- */
  const B = s.bonde;
  let jx = styr ? styr.x || 0 : 0, jy = styr ? styr.y || 0 : 0;
  const jl = Math.hypot(jx, jy);
  if (jl > 1) { jx /= jl; jy /= jl; }
  let dvx = jx * BONDE_FART - B.vx, dvy = jy * BONDE_FART - B.vy;
  const dl = Math.hypot(dvx, dvy), maks = BONDE_ACC * dt;
  if (dl > maks) { dvx *= maks / dl; dvy *= maks / dl; }
  B.vx += dvx; B.vy += dvy;
  B.x += B.vx * dt; B.y += B.vy * dt;
  if (B.x < BONDE_R) { B.x = BONDE_R; B.vx = Math.max(0, B.vx); }
  if (B.x > s.b - BONDE_R) { B.x = s.b - BONDE_R; B.vx = Math.min(0, B.vx); }
  if (B.y < BONDE_R) { B.y = BONDE_R; B.vy = Math.max(0, B.vy); }
  if (B.y > s.h - BONDE_R) { B.y = s.h - BONDE_R; B.vy = Math.min(0, B.vy); }
  if (Math.abs(B.vx) > 0.3) B.vendt = B.vx > 0 ? 1 : -1;

  /* --- Kyllingerne --- */
  const D = doer(s);
  for (const k of s.kyllinger) {
    const dx = k.x - B.x, dy = k.y - B.y, d = Math.hypot(dx, dy) || 0.001;
    k.smutKlar -= dt;
    if (k.slags === 'guld' && !k.hjem && s.t >= k.ud) k.hjem = true;
    k.bange = d < SKRAEK;

    if (k.smut > 0) {
      k.smut -= dt;                                  // smuttet kører til ende
    } else if (d < SMUT_AFSTAND && k.smutKlar <= 0) {
      // Smut: lynhurtigt til siden, væk fra bonden – mod den side, der er mest plads
      const px = -dy / d, py = dx / d;
      const pa = plads(s, k.x + px * 2, k.y + py * 2), pb = plads(s, k.x - px * 2, k.y - py * 2);
      const side = Math.abs(pa - pb) < 0.3 ? (s.rnd() < 0.5 ? 1 : -1) : (pa > pb ? 1 : -1);
      const mx = px * side * 0.85 + dx / d * 0.5, my = py * side * 0.85 + dy / d * 0.5;
      const ml = Math.hypot(mx, my);
      k.vx = mx / ml * SMUT_FART; k.vy = my / ml * SMUT_FART;
      k.smut = SMUT_TID;
      k.smutKlar = k.slags === 'guld' ? GULD.pause : SMUT_PAUSE;
      e.smut.push(k.id);
    } else if (k.hjem) {
      // Guldkyllingen løber hjem – og slår stadig smut, hvis man kommer for tæt på
      styrMod(k, D.x - k.x, D.y - k.y, flugtFart(s, k), FLUGT_ACC, dt);
    } else if (k.bange) {
      const [hx, hy] = hegnSkub(s, k.x, k.y);
      styrMod(k, dx / d + hx, dy / d + hy, flugtFart(s, k), FLUGT_ACC, dt);
    } else {
      // Går og pikker: en ny retning (eller en pause) hvert par sekunder
      k.vandre -= dt;
      if (k.vandre <= 0) {
        k.vandre = 1 + s.rnd() * 2;
        if (s.rnd() < 0.35) { k.vx0 = 0; k.vy0 = 0; }
        else {
          const a = s.rnd() * 6.283;
          k.vx0 = Math.cos(a) * GAA_FART; k.vy0 = Math.sin(a) * GAA_FART;
        }
      }
      const [hx, hy] = hegnSkub(s, k.x, k.y);
      const mx = k.vx0 + hx * GAA_FART, my = k.vy0 + hy * GAA_FART;
      styrMod(k, mx, my, Math.min(GAA_FART, Math.hypot(mx, my)), 6, dt);
    }

    k.x += k.vx * dt; k.y += k.vy * dt;
    if (k.x < KYLLING_R) { k.x = KYLLING_R; k.vx = Math.max(0, k.vx); }
    if (k.x > s.b - KYLLING_R) { k.x = s.b - KYLLING_R; k.vx = Math.min(0, k.vx); }
    if (k.y < KYLLING_R) { k.y = KYLLING_R; k.vy = Math.max(0, k.vy); }
    if (k.y > s.h - KYLLING_R) { k.y = s.h - KYLLING_R; k.vy = Math.min(0, k.vy); }
  }

  /* --- Fanget? --- */
  const tilbage = [];
  for (const k of s.kyllinger) {
    if (Math.hypot(k.x - B.x, k.y - B.y) < FANG_R) {
      const vaerd = k.slags === 'guld' ? GULD.vaerd : 1;
      s.fangst += vaerd; s.antal++;
      if (k.slags === 'guld') { s.guldFanget++; s.guldTil = s.t + GULD.hvert; }
      e.fanget.push({ id: k.id, slags: k.slags, x: k.x, y: k.y, vaerd });
    } else if (k.hjem && Math.hypot(k.x - D.x, k.y - D.y) < 0.6) {
      s.guldTil = s.t + GULD.hvert;
      e.hjem.push({ id: k.id, slags: k.slags, x: k.x, y: k.y });
    } else tilbage.push(k);
  }
  s.kyllinger = tilbage;

  /* --- Nye kyllinger ud af hønsehuset --- */
  const vedDoeren = Math.hypot(B.x - D.x, B.y - D.y) < DOER_SKY;
  if (!vedDoeren) {
    const almindelige = s.kyllinger.filter(k => k.slags === 'kylling').length;
    if (almindelige < ANTAL && s.t >= s.udTil) {
      const k = nyKylling(s, D.x + (s.rnd() - 0.5) * 0.8, KYLLING_R + 0.05, 'kylling');
      k.vy = GAA_FART * 2; k.vandre = 0.6; k.vx0 = 0; k.vy0 = GAA_FART;
      s.kyllinger.push(k); s.udTil = s.t + UD_PAUSE;
      e.ud.push({ id: k.id, slags: k.slags });
    }
    const harGuld = s.kyllinger.some(k => k.slags === 'guld');
    if (!harGuld && s.t >= s.guldTil && s.t < TID - 4) {
      const k = nyKylling(s, D.x, KYLLING_R + 0.05, 'guld');
      k.vy = GAA_FART * 2; k.vandre = 0.8; k.vx0 = 0; k.vy0 = GAA_FART;
      s.kyllinger.push(k); s.guldTil = Infinity;
      e.ud.push({ id: k.id, slags: k.slags });
    }
  }

  if (s.t >= TID) { s.slut = true; e.slut = true; }
  return e;
}

/**
 * En lille computerspiller: løber efter den kylling, der er billigst at nå
 * (guld tæller tre gange så meget), og sigter lidt foran den. Den er en
 * målestok i testene, ikke en del af spillet. Giver et joystick { x, y }.
 */
export function bot(s) {
  const B = s.bonde;
  let bedst = null, bedstPris = Infinity;
  for (const k of s.kyllinger) {
    const d = Math.hypot(k.x - B.x, k.y - B.y);
    const pris = d / (k.slags === 'guld' ? GULD.vaerd : 1) + (k.smutKlar > 0 ? 0 : 1.2);
    if (pris < bedstPris) { bedstPris = pris; bedst = k; }
  }
  if (!bedst) {
    // Ingen kyllinger: gå væk fra døren, så de kan komme ud
    const D = doer(s);
    return { x: 0, y: B.y - D.y < DOER_SKY + 1 ? 1 : 0 };
  }
  const d = Math.hypot(bedst.x - B.x, bedst.y - B.y);
  const frem = Math.min(0.35, d / BONDE_FART);
  const mx = bedst.x + bedst.vx * frem - B.x, my = bedst.y + bedst.vy * frem - B.y;
  const l = Math.hypot(mx, my) || 1;
  return { x: mx / l, y: my / l };
}

/** Spiller en hel runde med en given styring (til tests). Giver den færdige runde. */
export function koer(seed, styring = bot, b = 14, h = 22, dt = 1 / 60) {
  const s = nyTur(seed, b, h);
  let joy = null, siden = 1;
  while (!s.slut) {
    siden += dt;
    if (siden >= 0.1) { joy = styring(s); siden = 0; }
    tik(s, dt, joy);
  }
  return s;
}
