/*
  Dybet – spilmotor. Ren JavaScript uden DOM, så den kan enhedstestes med
  `node --test test/unit/dybet.test.mjs`. index.html står for tegning
  (raycaster, sprites, knapper) og kalder kun funktionerne herunder.

  Tilstanden er ét almindeligt objekt (`spil`), som kan gemmes som JSON og
  genoptages. Alle tilfældige valg går gennem `spil.rng`, som er seedet, så
  `?seed=123` giver samme dungeon hver gang (bruges af testene).

  Overblik:
    lavRng, nytSpil, genoptag           – tilstand og tilfældighed
    lavDungeon                          – labyrint med monstre, kister, ting og trappe
    muligheder, gaa, vend, gaaNed        – bevægelse: hvad kan man her, og skridt for skridt
    startKamp, kampTur                  – turbaseret kamp, returnerer hændelser til UI'et
    udstyr, brugTing                    – taske uden for kamp
*/

/* ---------- Tilfældighed (mulberry32, tilstanden kan gemmes) ---------- */
export function lavRng(seed) {
  let s = seed >>> 0;
  const r = {
    get tilstand() { return s; },
    set tilstand(v) { s = v >>> 0; },
    naeste() {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    heltal(n) { return Math.floor(r.naeste() * n); },
    mellem(a, b) { return a + r.naeste() * (b - a); },
    vaelg(arr) { return arr[r.heltal(arr.length)]; },
    chance(p) { return r.naeste() < p; },
    bland(arr) {
      for (let i = arr.length - 1; i > 0; i--) { const j = r.heltal(i + 1); [arr[i], arr[j]] = [arr[j], arr[i]]; }
      return arr;
    },
  };
  return r;
}

/* ---------- Retninger: 0 = nord (op på kortet), 1 = øst, 2 = syd, 3 = vest ---------- */
export const RETNINGER = [{ dx: 0, dy: -1 }, { dx: 1, dy: 0 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }];
export const VAEG = 0, GULV = 1;

/* ---------- Ting ---------- */
export const TING = {
  // Våben (slot vaaben). tier styrer hvornår de dukker op i kister.
  kniv:        { navn: 'Kniv',          slot: 'vaaben',   angreb: 2,  tier: 0, ikon: 'kniv' },
  kortsvaerd:  { navn: 'Kort sværd',    slot: 'vaaben',   angreb: 4,  tier: 1, ikon: 'svaerd' },
  oekse:       { navn: 'Økse',          slot: 'vaaben',   angreb: 6,  tier: 2, ikon: 'oekse' },
  langsvaerd:  { navn: 'Langsværd',     slot: 'vaaben',   angreb: 9,  tier: 3, ikon: 'svaerd' },
  krigshammer: { navn: 'Krigshammer',   slot: 'vaaben',   angreb: 12, tier: 4, ikon: 'hammer' },
  runeklinge:  { navn: 'Runeklinge',    slot: 'vaaben',   angreb: 16, tier: 5, ikon: 'svaerd' },
  dragetand:   { navn: 'Dragetand',     slot: 'vaaben',   angreb: 21, tier: 6, ikon: 'svaerd' },
  // Rustning (slot rustning)
  laedervest:  { navn: 'Lædervest',     slot: 'rustning', forsvar: 1,  tier: 0, ikon: 'rustning' },
  ringbrynje:  { navn: 'Ringbrynje',    slot: 'rustning', forsvar: 3,  tier: 1, ikon: 'rustning' },
  skaelpanser: { navn: 'Skælpanser',    slot: 'rustning', forsvar: 5,  tier: 3, ikon: 'rustning' },
  pladerust:   { navn: 'Pladerustning', slot: 'rustning', forsvar: 8,  tier: 4, ikon: 'rustning' },
  drageskind:  { navn: 'Drageskind',    slot: 'rustning', forsvar: 11, tier: 6, ikon: 'rustning' },
  // Smykker (slot smykke)
  livsring:    { navn: 'Livsring',      slot: 'smykke', maxHp: 12,  tier: 1, ikon: 'ring', tekst: '+12 liv' },
  manaamulet:  { navn: 'Mana-amulet',   slot: 'smykke', maxMp: 6,   tier: 2, ikon: 'amulet', tekst: '+6 mana' },
  lykkeamulet: { navn: 'Lykkeamulet',   slot: 'smykke', krit: 0.15, tier: 3, ikon: 'amulet', tekst: '+15 % kritiske slag' },
  // Forbrug (slot forbrug) – kan bruges i og uden for kamp
  potion:      { navn: 'Potion',        slot: 'forbrug', heal: 15,  tier: 0, ikon: 'potion', tekst: 'Helbreder 15 liv' },
  storpotion:  { navn: 'Stor potion',   slot: 'forbrug', heal: 40,  tier: 2, ikon: 'storpotion', tekst: 'Helbreder 40 liv' },
  manadrik:    { navn: 'Manadrik',      slot: 'forbrug', mana: 8,   tier: 1, ikon: 'manadrik', tekst: 'Giver 8 mana' },
  bombe:       { navn: 'Bombe',         slot: 'forbrug', skade: 14, tier: 1, ikon: 'bombe', tekst: '14 skade, kun i kamp', kunKamp: true },
  roegbombe:   { navn: 'Røgbombe',      slot: 'forbrug', flugt: true, tier: 1, ikon: 'roegbombe', tekst: 'Flygt uden at blive ramt', kunKamp: true },
};

/* ---------- Evner (læres ved spillerens niveau) ---------- */
export const EVNER = {
  kraftslag: { navn: 'Kraftslag', niveau: 1, mp: 3, tekst: 'Et tungt hug: 1,7× skade' },
  helbred:   { navn: 'Helbred',   niveau: 2, mp: 4, tekst: 'Helbreder 40 % af dit liv' },
  ildkugle:  { navn: 'Ildkugle',  niveau: 3, mp: 5, tekst: 'Magisk skade, ignorerer rustning' },
  skjold:    { navn: 'Skjold',    niveau: 5, mp: 3, tekst: 'Halv skade i to runder' },
  lyn:       { navn: 'Lyn',       niveau: 7, mp: 6, tekst: 'Stor skade, kan lamme fjenden' },
};

/* ---------- Monstre. `fra` er første dungeon-niveau de kan optræde på. ---------- */
export const MONSTRE = {
  rotte:     { navn: 'Rotte',      hp: 10, angreb: 4,  forsvar: 0, xp: 6,  fra: 1 },
  slim:      { navn: 'Slim',       hp: 14, angreb: 3,  forsvar: 1, xp: 7,  fra: 1 },
  flagermus: { navn: 'Flagermus',  hp: 9,  angreb: 5,  forsvar: 0, xp: 7,  fra: 2, undvig: 0.2 },
  skelet:    { navn: 'Skelet',     hp: 18, angreb: 6,  forsvar: 2, xp: 10, fra: 3 },
  edderkop:  { navn: 'Edderkop',   hp: 16, angreb: 6,  forsvar: 1, xp: 11, fra: 4, gift: 0.35 },
  goblin:    { navn: 'Goblin',     hp: 22, angreb: 7,  forsvar: 2, xp: 13, fra: 5 },
  spoegelse: { navn: 'Spøgelse',   hp: 20, angreb: 8,  forsvar: 1, xp: 15, fra: 7, gennemtraenger: 0.5 },
  ork:       { navn: 'Ork',        hp: 30, angreb: 9,  forsvar: 3, xp: 18, fra: 8, hug: { chance: 0.25, faktor: 1.5, navn: 'et brutalt hug' } },
  golem:     { navn: 'Golem',      hp: 40, angreb: 8,  forsvar: 6, xp: 24, fra: 10 },
  drage:     { navn: 'Drage',      hp: 48, angreb: 11, forsvar: 4, xp: 35, fra: 13, hug: { chance: 0.3, faktor: 1.6, navn: 'ildånde' } },
};

/* ---------- Spilleren ---------- */
export function xpTilNaeste(level) { return Math.round(15 * Math.pow(level, 1.25)); }

export function lavSpiller() {
  return {
    level: 1, xp: 0,
    hp: 30, maxHp: 30, mp: 10, maxMp: 10,
    grundAngreb: 5,
    udstyr: { vaaben: 'kniv', rustning: null, smykke: null },
    taske: [{ id: 'potion', antal: 2 }],
    evner: ['kraftslag'],
    draebt: 0,
  };
}

/** Samlede tal med udstyr. */
export function stats(sp) {
  const u = Object.values(sp.udstyr).map(id => id && TING[id]).filter(Boolean);
  const sum = k => u.reduce((a, t) => a + (t[k] || 0), 0);
  return {
    angreb: sp.grundAngreb + sum('angreb'),
    forsvar: sum('forsvar'),
    maxHp: sp.maxHp + sum('maxHp'),
    maxMp: sp.maxMp + sum('maxMp'),
    krit: 0.08 + sum('krit'),
  };
}

/* ---------- Dungeon (spil.niveau er dybden; spillerens eget niveau er spiller.level) ---------- */
/** Antal labyrint-celler pr. side på et niveau: 5 → 9. Brættet er 2·celler+1 felter. */
export function cellerPaaNiveau(niveau) { return Math.min(4 + Math.ceil(niveau / 2), 9); }

export function lavDungeon(niveau, rng) {
  const C = cellerPaaNiveau(niveau);
  const B = C * 2 + 1;
  const grid = new Array(B * B).fill(VAEG);
  const idx = (x, y) => y * B + x;
  const celle = (cx, cy) => ({ x: cx * 2 + 1, y: cy * 2 + 1 });

  // Recursive backtracker over cellerne → en perfekt labyrint (alle celler forbundet).
  const besoegt = new Array(C * C).fill(false);
  const stak = [{ cx: rng.heltal(C), cy: rng.heltal(C) }];
  besoegt[stak[0].cy * C + stak[0].cx] = true;
  { const p = celle(stak[0].cx, stak[0].cy); grid[idx(p.x, p.y)] = GULV; }
  while (stak.length) {
    const top = stak[stak.length - 1];
    const naboer = RETNINGER.map((d, r) => ({ cx: top.cx + d.dx, cy: top.cy + d.dy, r }))
      .filter(n => n.cx >= 0 && n.cy >= 0 && n.cx < C && n.cy < C && !besoegt[n.cy * C + n.cx]);
    if (!naboer.length) { stak.pop(); continue; }
    const n = rng.vaelg(naboer);
    besoegt[n.cy * C + n.cx] = true;
    const a = celle(top.cx, top.cy), b = celle(n.cx, n.cy);
    grid[idx((a.x + b.x) / 2, (a.y + b.y) / 2)] = GULV;
    grid[idx(b.x, b.y)] = GULV;
    stak.push(n);
  }

  // Nogle ekstra åbninger giver sløjfer, så man ikke altid skal hele vejen tilbage.
  const sloejfer = Math.floor(C * C * 0.06);
  for (let i = 0; i < sloejfer; i++) {
    const cx = rng.heltal(C - 1), cy = rng.heltal(C - 1);
    const a = celle(cx, cy);
    const b = rng.chance(0.5) ? celle(cx + 1, cy) : celle(cx, cy + 1);
    grid[idx((a.x + b.x) / 2, (a.y + b.y) / 2)] = GULV;
  }

  const gulv = (x, y) => x >= 0 && y >= 0 && x < B && y < B && grid[idx(x, y)] === GULV;
  const naboFelter = (x, y) => RETNINGER.filter(d => gulv(x + d.dx, y + d.dy)).length;

  // Start i en tilfældig celle, trappen i den celle der ligger længst væk (BFS i felter).
  const startCelle = celle(rng.heltal(C), rng.heltal(C));
  const afstand = bfs(grid, B, startCelle);
  let trappe = startCelle, laengst = -1;
  for (let cy = 0; cy < C; cy++) for (let cx = 0; cx < C; cx++) {
    const p = celle(cx, cy), a = afstand[idx(p.x, p.y)];
    if (a > laengst) { laengst = a; trappe = p; }
  }
  const hovedvej = stiTil(grid, B, afstand, trappe);   // felter fra start til trappe

  // Passager (felterne mellem to celler) har præcis to naboer – der stiller monstrene sig.
  const passager = [];
  for (let y = 1; y < B - 1; y++) for (let x = 1; x < B - 1; x++) {
    if (!gulv(x, y) || (x % 2 === 1 && y % 2 === 1)) continue;
    if (afstand[idx(x, y)] < 3) continue;                  // ikke lige ved starten
    passager.push({ x, y, hovedvej: hovedvej.some(p => p.x === x && p.y === y) });
  }
  const antalMonstre = Math.min(3 + Math.ceil(niveau * 0.6), 10);
  // De monstre der passer til niveauet: de nyeste, og ældre fader ud efter seks niveauer (altid mindst tre slags).
  const mulige = Object.entries(MONSTRE).filter(([, m]) => m.fra <= niveau).sort((a, b) => a[1].fra - b[1].fra).map(([id]) => id);
  const pulje = mulige.filter(id => MONSTRE[id].fra >= niveau - 6);
  while (pulje.length < 3 && pulje.length < mulige.length) pulje.unshift(mulige[mulige.length - 1 - pulje.length]);
  const monstre = [];
  const optaget = new Set([idx(startCelle.x, startCelle.y), idx(trappe.x, trappe.y)]);
  const ledig = (x, y) => !optaget.has(idx(x, y)) && !RETNINGER.some(d => optaget.has(idx(x + d.dx, y + d.dy)));
  const placerMonster = p => {
    const id = vaelgMonster(pulje, niveau, rng);
    monstre.push(lavMonster(id, niveau, p.x, p.y, monstre.length));
    optaget.add(idx(p.x, p.y));
  };
  // Mindst ét monster på hovedvejen, så man ikke kan snige sig ned uden kamp.
  const paaHovedvej = rng.bland(passager.filter(p => p.hovedvej));
  if (paaHovedvej.length) placerMonster(paaHovedvej[0]);
  for (const p of rng.bland(passager.slice())) {
    if (monstre.length >= antalMonstre) break;
    if (ledig(p.x, p.y)) placerMonster(p);
  }
  // På hvert femte niveau vogter et ekstra stærkt monster feltet lige før trappen.
  if (niveau % 5 === 0 && hovedvej.length >= 3) {
    const p = hovedvej[hovedvej.length - 2];
    const eksisterende = monstre.find(m => m.x === p.x && m.y === p.y);
    const vogter = eksisterende || lavMonster(pulje[pulje.length - 1], niveau, p.x, p.y, monstre.length);
    if (!eksisterende) monstre.push(vogter);
    vogter.navn = 'Vogteren'; vogter.vogter = true;
    vogter.maxHp = vogter.hp = Math.round(vogter.hp * 1.4); vogter.angreb += 1; vogter.xp *= 2;
    optaget.add(idx(p.x, p.y));
  }

  // Kister i blindgyder (celler med én åbning) – belønning for at udforske.
  const kister = [];
  const blindgyder = [];
  const andreCeller = [];
  for (let cy = 0; cy < C; cy++) for (let cx = 0; cx < C; cx++) {
    const p = celle(cx, cy);
    if (optaget.has(idx(p.x, p.y))) continue;
    (naboFelter(p.x, p.y) === 1 ? blindgyder : andreCeller).push(p);
  }
  const antalKister = 2 + Math.floor(niveau / 3);
  const kisteFelter = rng.bland(blindgyder).concat(rng.bland(andreCeller)).slice(0, antalKister);
  for (const p of kisteFelter) {
    kister.push({ x: p.x, y: p.y, aabnet: false, indhold: lavLoot(niveau, rng) });
    optaget.add(idx(p.x, p.y));
  }

  // Løse ting på gulvet (potioner), samles op når man går over dem.
  const ting = [];
  const frie = [];
  for (let cy = 0; cy < C; cy++) for (let cx = 0; cx < C; cx++) {
    const p = celle(cx, cy);
    if (!optaget.has(idx(p.x, p.y))) frie.push(p);
  }
  const antalTing = 1 + (rng.chance(0.5) ? 1 : 0);
  for (const p of rng.bland(frie).slice(0, antalTing)) {
    ting.push({ x: p.x, y: p.y, id: rng.chance(0.75) ? 'potion' : 'manadrik' });
  }

  // Startretning: mod den første åbning.
  const retning = RETNINGER.findIndex(d => gulv(startCelle.x + d.dx, startCelle.y + d.dy));
  return { niveau, B, grid, start: { ...startCelle, retning }, trappe, monstre, kister, ting, hovedvej };
}

/** Bredde-først-søgning fra `fra`; giver afstand pr. felt (−1 = ikke nået). */
export function bfs(grid, B, fra) {
  const afstand = new Array(B * B).fill(-1);
  const koe = [fra]; afstand[fra.y * B + fra.x] = 0;
  while (koe.length) {
    const p = koe.shift();
    for (const d of RETNINGER) {
      const x = p.x + d.dx, y = p.y + d.dy;
      if (x < 0 || y < 0 || x >= B || y >= B || grid[y * B + x] !== GULV || afstand[y * B + x] !== -1) continue;
      afstand[y * B + x] = afstand[p.y * B + p.x] + 1;
      koe.push({ x, y });
    }
  }
  return afstand;
}

function stiTil(grid, B, afstand, maal) {
  const sti = [maal];
  let p = maal;
  while (afstand[p.y * B + p.x] > 0) {
    const a = afstand[p.y * B + p.x];
    p = RETNINGER.map(d => ({ x: p.x + d.dx, y: p.y + d.dy }))
      .find(n => n.x >= 0 && n.y >= 0 && n.x < B && n.y < B && afstand[n.y * B + n.x] === a - 1);
    sti.push(p);
  }
  return sti.reverse();
}

function vaelgMonster(pulje, niveau, rng) {
  // Nyere monstre vægtes højere, så de gamle fader ud.
  const vaegte = pulje.map(id => 1 + Math.max(0, 6 - (niveau - MONSTRE[id].fra)));
  let r = rng.naeste() * vaegte.reduce((a, b) => a + b, 0);
  for (let i = 0; i < pulje.length; i++) { r -= vaegte[i]; if (r <= 0) return pulje[i]; }
  return pulje[pulje.length - 1];
}

export function lavMonster(id, niveau, x, y, nr) {
  const m = MONSTRE[id];
  const f = 1 + 0.10 * (niveau - 1);
  const hp = Math.round(m.hp * f);
  return {
    id: nr, type: id, navn: m.navn, x, y,
    hp, maxHp: hp,
    angreb: m.angreb + Math.floor((niveau - 1) * 0.6),
    forsvar: m.forsvar + Math.floor((niveau - 1) / 4),
    xp: Math.round(m.xp * (1 + 0.15 * (niveau - 1))),
    doed: false,
  };
}

/** Indholdet af en kiste: oftest ét stykke udstyr omkring niveauets tier, ellers forbrugsting. */
export function lavLoot(niveau, rng) {
  const tier = Math.floor((niveau - 1) / 2.5) + (rng.chance(0.3) ? 1 : 0);
  if (rng.chance(0.6)) {
    const slot = rng.vaelg(['vaaben', 'vaaben', 'rustning', 'rustning', 'smykke']);
    const kandidater = Object.entries(TING).filter(([, t]) => t.slot === slot && t.tier <= tier && t.tier >= tier - 2);
    if (kandidater.length) {
      kandidater.sort((a, b) => b[1].tier - a[1].tier);
      return [{ id: kandidater[0][0], antal: 1 }];
    }
  }
  const forbrug = Object.entries(TING).filter(([, t]) => t.slot === 'forbrug' && t.tier <= tier).map(([id]) => id);
  const a = rng.vaelg(forbrug), b = rng.vaelg(forbrug);
  return a === b ? [{ id: a, antal: 2 }] : [{ id: a, antal: 1 }, { id: b, antal: 1 }];
}

/* ---------- Spillet ---------- */
export function nytSpil(seed) {
  const rng = lavRng(seed);
  const spil = {
    seed, rng, niveau: 1, spiller: lavSpiller(),
    dungeon: null, pos: null, retning: 0, set: null, kamp: null, fase: 'udforsk',
    besked: null, skridt: 0,
  };
  nytNiveau(spil);
  return spil;
}

function nytNiveau(spil) {
  spil.dungeon = lavDungeon(spil.niveau, spil.rng);
  spil.pos = { x: spil.dungeon.start.x, y: spil.dungeon.start.y };
  spil.retning = spil.dungeon.start.retning;
  spil.set = new Array(spil.dungeon.B * spil.dungeon.B).fill(0);
  spil.kamp = null;
  spil.fase = 'udforsk';
  markerSet(spil);
}

/** Til localStorage: rng gemmes som sin tilstand. */
export function tilJson(spil) {
  const { rng, ...rest } = spil;
  return JSON.stringify({ ...rest, rngTilstand: rng.tilstand });
}

export function genoptag(json) {
  const data = JSON.parse(json);
  const rng = lavRng(data.seed);
  rng.tilstand = data.rngTilstand;
  delete data.rngTilstand;
  return { ...data, rng };
}

export function gulv(spil, x, y) {
  const B = spil.dungeon.B;
  return x >= 0 && y >= 0 && x < B && y < B && spil.dungeon.grid[y * B + x] === GULV;
}
export function monsterPaa(spil, x, y) { return spil.dungeon.monstre.find(m => !m.doed && m.x === x && m.y === y) || null; }
export function kistePaa(spil, x, y) { return spil.dungeon.kister.find(k => k.x === x && k.y === y) || null; }
export function tingPaa(spil, x, y) { return spil.dungeon.ting.find(t => t.x === x && t.y === y) || null; }

/** Markerer det man kan se: eget felt med naboer, og gangen ligeud til første væg. */
export function markerSet(spil) {
  const { B } = spil.dungeon, set = spil.set;
  const mark = (x, y) => { if (x >= 0 && y >= 0 && x < B && y < B) set[y * B + x] = 1; };
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) mark(spil.pos.x + dx, spil.pos.y + dy);
  const d = RETNINGER[spil.retning];
  let x = spil.pos.x + d.dx, y = spil.pos.y + d.dy;
  while (gulv(spil, x, y)) {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) mark(x + dx, y + dy);
    if (monsterPaa(spil, x, y)) break;     // et monster spærrer udsynet
    x += d.dx; y += d.dy;
  }
}

/**
 * Hvad kan spilleren gøre her? Liste af { type, retning, x, y, relativ, tekst }.
 * type: 'gaa' | 'angrib' | 'kiste' | 'trappe' | 'vend'.
 * Feltet bag spilleren regnes ikke som en udgang (det er 'vend').
 */
export function muligheder(spil) {
  const ud = [];
  const bag = (spil.retning + 2) % 4;
  const RELATIV = ['frem', 'hoejre', 'tilbage', 'venstre'];
  for (let r = 0; r < 4; r++) {
    const d = RETNINGER[r];
    const x = spil.pos.x + d.dx, y = spil.pos.y + d.dy;
    if (!gulv(spil, x, y)) continue;
    const relativ = RELATIV[(r - spil.retning + 4) % 4];
    if (r === bag) { ud.push({ type: 'vend', retning: r, x, y, relativ, tekst: 'Vend om' }); continue; }
    const m = monsterPaa(spil, x, y);
    const k = kistePaa(spil, x, y);
    const retningsTekst = { frem: 'ligeud', hoejre: 'til højre', venstre: 'til venstre' }[relativ];
    if (m) ud.push({ type: 'angrib', retning: r, x, y, relativ, monster: m, tekst: `Angrib ${m.navn.toLowerCase()}` });
    else if (k && !k.aabnet) ud.push({ type: 'kiste', retning: r, x, y, relativ, kiste: k, tekst: 'Åbn kisten' });
    else if (spil.dungeon.trappe.x === x && spil.dungeon.trappe.y === y) ud.push({ type: 'trappe', retning: r, x, y, relativ, tekst: 'Gå ned ad trappen' });
    else ud.push({ type: 'gaa', retning: r, x, y, relativ, tekst: `Gå ${retningsTekst}` });
  }
  return ud;
}

/**
 * Skal spillet selv gå videre uden at spørge? Ja når der er præcis én udgang
 * (ud over at vende om) og den er almindeligt gulv. Blindgyde → vend om.
 * Returnerer den mulighed der skal udføres, eller null når spilleren skal vælge.
 */
export function autoValg(muligheder) {
  const frem = muligheder.filter(m => m.type !== 'vend');
  if (frem.length === 1 && frem[0].type === 'gaa') return frem[0];
  if (frem.length === 0) return muligheder.find(m => m.type === 'vend') || null;
  return null;
}

/** Ét skridt i en retning (feltet skal være gulv og uden levende monster). Samler ting op. */
export function gaa(spil, retning) {
  const d = RETNINGER[retning];
  const x = spil.pos.x + d.dx, y = spil.pos.y + d.dy;
  if (!gulv(spil, x, y) || monsterPaa(spil, x, y)) return null;
  spil.retning = retning;
  spil.pos = { x, y };
  spil.skridt++;
  const haendelser = [];
  const t = tingPaa(spil, x, y);
  if (t) {
    spil.dungeon.ting = spil.dungeon.ting.filter(u => u !== t);
    laegITaske(spil.spiller, t.id, 1);
    haendelser.push({ type: 'fundet', id: t.id, tekst: `Du fandt en ${TING[t.id].navn.toLowerCase()}!` });
  }
  markerSet(spil);
  return haendelser;
}

export function vend(spil) { spil.retning = (spil.retning + 2) % 4; markerSet(spil); }

/** Åbner kisten på nabofeltet i `retning` og flytter spilleren ind på feltet. */
export function aabnKiste(spil, retning) {
  const d = RETNINGER[retning];
  const k = kistePaa(spil, spil.pos.x + d.dx, spil.pos.y + d.dy);
  if (!k || k.aabnet) return null;
  k.aabnet = true;
  for (const t of k.indhold) laegITaske(spil.spiller, t.id, t.antal);
  spil.retning = retning;
  return k.indhold.map(t => ({ type: 'fundet', id: t.id, antal: t.antal,
    tekst: t.antal > 1 ? `Du fandt ${t.antal} × ${TING[t.id].navn.toLowerCase()}!` : `Du fandt: ${TING[t.id].navn}!` }));
}

/** Ned ad trappen: nyt niveau, lidt liv og al mana tilbage. */
export function gaaNed(spil) {
  const sp = spil.spiller, s = stats(sp);
  spil.niveau++;
  sp.hp = Math.min(s.maxHp, sp.hp + Math.round(s.maxHp * 0.3));
  sp.mp = s.maxMp;
  nytNiveau(spil);
  return spil.niveau;
}

/* ---------- Taske ---------- */
export function laegITaske(sp, id, antal = 1) {
  const t = sp.taske.find(x => x.id === id);
  if (t && TING[id].slot === 'forbrug') t.antal += antal;
  else sp.taske.push({ id, antal });
}

export function tagFraTaske(sp, id, antal = 1) {
  const i = sp.taske.findIndex(x => x.id === id);
  if (i === -1) return false;
  sp.taske[i].antal -= antal;
  if (sp.taske[i].antal <= 0) sp.taske.splice(i, 1);
  return true;
}

/** Tag et stykke udstyr på (kun uden for kamp). Det gamle lægges i tasken. */
export function udstyr(spil, id) {
  const t = TING[id];
  if (!t || t.slot === 'forbrug' || spil.fase === 'kamp') return false;
  const sp = spil.spiller;
  if (!tagFraTaske(sp, id)) return false;
  const gammel = sp.udstyr[t.slot];
  sp.udstyr[t.slot] = id;
  if (gammel) laegITaske(sp, gammel, 1);
  const s = stats(sp);
  sp.hp = Math.min(sp.hp, s.maxHp); sp.mp = Math.min(sp.mp, s.maxMp);
  return true;
}

/** Brug en forbrugsting. Uden for kamp: kun helbredende. Returnerer en hændelse eller null. */
export function brugTing(spil, id) {
  const t = TING[id], sp = spil.spiller, s = stats(sp);
  if (!t || t.slot !== 'forbrug') return null;
  if (t.kunKamp && spil.fase !== 'kamp') return null;
  if (!sp.taske.some(x => x.id === id)) return null;
  if (t.heal) {
    if (sp.hp >= s.maxHp) return { type: 'intet', tekst: 'Du har allerede fuldt liv.' };
    tagFraTaske(sp, id);
    const foer = sp.hp; sp.hp = Math.min(s.maxHp, sp.hp + t.heal);
    return { type: 'heal', maal: 'spiller', vaerdi: sp.hp - foer, tekst: `Du drikker en ${t.navn.toLowerCase()} og får ${sp.hp - foer} liv.` };
  }
  if (t.mana) {
    if (sp.mp >= s.maxMp) return { type: 'intet', tekst: 'Du har allerede fuld mana.' };
    tagFraTaske(sp, id);
    const foer = sp.mp; sp.mp = Math.min(s.maxMp, sp.mp + t.mana);
    return { type: 'mana', vaerdi: sp.mp - foer, tekst: `Du drikker en ${t.navn.toLowerCase()} og får ${sp.mp - foer} mana.` };
  }
  return null;
}

/* ---------- Kamp ---------- */
export function startKamp(spil, monster) {
  spil.kamp = { monsterId: monster.id, runde: 0, skjold: 0, stun: 0, gift: 0 };
  spil.fase = 'kamp';
  return [{ type: 'start', tekst: monster.vogter ? `${monster.navn} spærrer vejen til trappen!` : `En ${monster.navn.toLowerCase()} spærrer vejen!` }];
}

export function kampMonster(spil) { return spil.dungeon.monstre.find(m => m.id === spil.kamp.monsterId); }

function skade(rng, angreb, forsvar, faktor = 1) {
  const raa = angreb * rng.mellem(0.85, 1.15) * faktor - forsvar * 0.6;
  return Math.max(1, Math.round(raa));
}

/**
 * Én kamprunde: spillerens valg og derefter monsterets svar.
 * valg: { type: 'angrib' } | { type: 'evne', id } | { type: 'ting', id } | { type: 'flygt' }
 * Returnerer hændelser i rækkefølge, som UI'et afspiller én ad gangen.
 */
export function kampTur(spil, valg) {
  const sp = spil.spiller, s = stats(sp), rng = spil.rng, k = spil.kamp, m = kampMonster(spil);
  const h = [];
  if (!k || !m || m.doed || spil.fase !== 'kamp') return h;
  k.runde++;
  let monsterMaaSvare = true;

  const ramMonster = (vaerdi, tekst, magisk) => {
    m.hp = Math.max(0, m.hp - vaerdi);
    h.push({ type: 'skade', maal: 'monster', vaerdi, magisk: !!magisk, tekst });
  };
  const almindeligtAngreb = (faktor, navn) => {
    const mdef = MONSTRE[m.type];
    if (mdef.undvig && rng.chance(mdef.undvig)) { h.push({ type: 'miss', maal: 'monster', tekst: `${m.navn} undviger!` }); return; }
    if (rng.chance(0.04)) { h.push({ type: 'miss', maal: 'monster', tekst: 'Du rammer ikke!' }); return; }
    const krit = rng.chance(s.krit);
    const v = skade(rng, s.angreb, m.forsvar, faktor * (krit ? 1.5 : 1));
    ramMonster(v, `${navn} ${krit ? 'Kritisk slag! ' : ''}${m.navn} mister ${v} liv.`);
  };

  if (valg.type === 'angrib') {
    almindeligtAngreb(1, `Du angriber med ${TING[sp.udstyr.vaaben].navn.toLowerCase()}.`);
  } else if (valg.type === 'evne') {
    const e = EVNER[valg.id];
    if (!e || !sp.evner.includes(valg.id)) return h;
    if (sp.mp < e.mp) { k.runde--; return [{ type: 'intet', tekst: 'Ikke nok mana!' }]; }
    sp.mp -= e.mp;
    if (valg.id === 'kraftslag') almindeligtAngreb(1.7, 'Kraftslag!');
    else if (valg.id === 'helbred') {
      const foer = sp.hp; sp.hp = Math.min(s.maxHp, sp.hp + Math.round(s.maxHp * 0.4));
      h.push({ type: 'heal', maal: 'spiller', vaerdi: sp.hp - foer, tekst: `Du helbreder dig selv og får ${sp.hp - foer} liv.` });
    } else if (valg.id === 'ildkugle') {
      const v = Math.round((8 + 2 * sp.level) * rng.mellem(0.9, 1.1));
      ramMonster(v, `Ildkugle! ${m.navn} brænder og mister ${v} liv.`, true);
    } else if (valg.id === 'skjold') {
      k.skjold = 2;
      h.push({ type: 'skjold', tekst: 'Et magisk skjold omgiver dig.' });
    } else if (valg.id === 'lyn') {
      const v = Math.round((12 + 2.5 * sp.level) * rng.mellem(0.9, 1.1));
      ramMonster(v, `Lyn! ${m.navn} mister ${v} liv.`, true);
      if (m.hp > 0 && rng.chance(0.5)) { k.stun = 1; h.push({ type: 'stun', tekst: `${m.navn} er lammet!` }); }
    }
  } else if (valg.type === 'ting') {
    const t = TING[valg.id];
    if (!t || !sp.taske.some(x => x.id === valg.id)) return h;
    if (t.skade) {
      tagFraTaske(sp, valg.id);
      ramMonster(t.skade, `Du kaster en bombe! ${m.navn} mister ${t.skade} liv.`, true);
    } else if (t.flugt) {
      tagFraTaske(sp, valg.id);
      h.push({ type: 'flugt', tekst: 'Du kaster en røgbombe og slipper væk!' });
      afsluttKamp(spil);
      return h;
    } else {
      const r = brugTing(spil, valg.id);
      if (!r) return h;
      if (r.type === 'intet') { k.runde--; return [r]; }
      h.push(r);
    }
  } else if (valg.type === 'flygt') {
    // Flugt lykkes altid, men monsteret får ét frit slag i ryggen.
    const v = skade(rng, m.angreb, s.forsvar, 0.8);
    sp.hp = Math.max(0, sp.hp - v);
    h.push({ type: 'skade', maal: 'spiller', vaerdi: v, tekst: `Du flygter, men ${m.navn.toLowerCase()} rammer dig i ryggen for ${v}.` });
    if (sp.hp <= 0) { h.push(doed(spil)); return h; }
    h.push({ type: 'flugt', tekst: 'Du slap væk.' });
    afsluttKamp(spil);
    return h;
  } else return h;

  if (m.hp <= 0) { h.push(...sejr(spil, m)); return h; }

  // Monsterets tur
  if (k.stun > 0) { k.stun--; h.push({ type: 'intet', tekst: `${m.navn} er lammet og kan ikke angribe.` }); monsterMaaSvare = false; }
  if (monsterMaaSvare) {
    const mdef = MONSTRE[m.type];
    if (rng.chance(0.08)) h.push({ type: 'miss', maal: 'spiller', tekst: `${m.navn} angriber, men rammer ikke!` });
    else {
      let faktor = 1, navn = `${m.navn} angriber.`;
      if (mdef.hug && rng.chance(mdef.hug.chance)) { faktor = mdef.hug.faktor; navn = `${m.navn} bruger ${mdef.hug.navn}!`; }
      const forsvar = mdef.gennemtraenger ? s.forsvar * (1 - mdef.gennemtraenger) : s.forsvar;
      let v = skade(rng, m.angreb, forsvar, faktor);
      if (k.skjold > 0) { v = Math.max(1, Math.round(v / 2)); navn += ' Skjoldet tager halvdelen.'; }
      sp.hp = Math.max(0, sp.hp - v);
      h.push({ type: 'skade', maal: 'spiller', vaerdi: v, tekst: `${navn} Du mister ${v} liv.` });
      if (mdef.gift && sp.hp > 0 && k.gift === 0 && rng.chance(mdef.gift)) { k.gift = 3; h.push({ type: 'gift', tekst: 'Du er forgiftet!' }); }
    }
  }
  if (k.skjold > 0) k.skjold--;
  if (k.gift > 0 && sp.hp > 0) {
    k.gift--;
    const v = Math.min(sp.hp, 2);
    sp.hp -= v;
    h.push({ type: 'skade', maal: 'spiller', vaerdi: v, gift: true, tekst: `Giften gør ${v} skade.` });
  }
  if (sp.hp <= 0) h.push(doed(spil));
  return h;
}

function afsluttKamp(spil) { spil.kamp = null; spil.fase = 'udforsk'; }

function sejr(spil, m) {
  const sp = spil.spiller, h = [];
  m.doed = true; sp.draebt++;
  h.push({ type: 'sejr', xp: m.xp, tekst: `${m.navn} er besejret! Du får ${m.xp} erfaring.` });
  sp.xp += m.xp;
  sp.mp = Math.min(stats(sp).maxMp, sp.mp + 2);
  while (sp.xp >= xpTilNaeste(sp.level)) {
    sp.xp -= xpTilNaeste(sp.level);
    sp.level++;
    sp.maxHp += 6; sp.maxMp += 2; sp.grundAngreb += 1;
    sp.hp = Math.min(stats(sp).maxHp, sp.hp + 6);
    h.push({ type: 'levelOp', level: sp.level, tekst: `Du er nu niveau ${sp.level}! Mere liv, mana og styrke.` });
    for (const [id, e] of Object.entries(EVNER)) {
      if (e.niveau === sp.level && !sp.evner.includes(id)) { sp.evner.push(id); h.push({ type: 'nyEvne', id, tekst: `Ny evne: ${e.navn}! ${e.tekst}.` }); }
    }
  }
  afsluttKamp(spil);
  markerSet(spil);
  return h;
}

function doed(spil) {
  spil.fase = 'doed';
  spil.kamp = null;
  return { type: 'doed', dybde: spil.niveau, tekst: `Du faldt på dybde ${spil.niveau}.` };
}
