// Stenalder – spildata: ressourcer, steder, civilisationskort og bygninger.
//
// Kortene (36 stk.) er verificeret mod den officielle regelbog og to
// uafhængige kortlister, og tallene stemmer (16 grønne, 20 sandfarvede,
// 10 terningkort, 7 madkort osv.).
//
// BYGNINGERNE er *rekonstrueret*: regelbogen siger 28 brikker, heraf 3 med
// "1-7 ressourcer", 8 med fast antal men valgfri slags, og resten (17) med
// faste priser. Den nøjagtige fordeling af de 17 faste og de 8 variable er
// ikke offentliggjort nogen steder, vi kunne finde. Ret listen BYGNINGER
// nedenfor, hvis den fysiske æske viser noget andet – motoren er ligeglad.

export const RESSOURCER = ['trae', 'ler', 'sten', 'guld'];
export const VAERDI = { mad: 2, trae: 3, ler: 4, sten: 5, guld: 6 };
export const NAVN = { mad: 'mad', trae: 'træ', ler: 'ler', sten: 'sten', guld: 'guld' };
export const IKON = { mad: '🍖', trae: '🪵', ler: '🧱', sten: '🪨', guld: '🪙' };

export const MAX_FOLK = 10;
export const MAX_LANDBRUG = 10;
export const MAX_REDSKAB = 4;     // hver af de tre redskabspladser
export const START_FOLK = 5;
export const START_MAD = 12;
export const KORTPLADSER = 4;
export const BYGNINGER_PR_STAK = 7;

// Steder på brættet. Kort og bygningsstakke hedder 'kort:0'..'kort:3' og
// 'bygning:0'..'bygning:3' og laves dynamisk.
export const STEDER = {
  jagt:          { navn: 'Jagt',          ressource: 'mad',  kapacitet: 99, type: 'terning', ikon: '🏹' },
  skov:          { navn: 'Skov',          ressource: 'trae', kapacitet: 7,  type: 'terning', ikon: '🌲' },
  lergrav:       { navn: 'Lergrav',       ressource: 'ler',  kapacitet: 7,  type: 'terning', ikon: '🧱' },
  stenbrud:      { navn: 'Stenbrud',      ressource: 'sten', kapacitet: 7,  type: 'terning', ikon: '⛰️' },
  flod:          { navn: 'Flod',          ressource: 'guld', kapacitet: 7,  type: 'terning', ikon: '🏞️' },
  mark:          { navn: 'Mark',          kapacitet: 1, type: 'landsby', ikon: '🌾', effekt: '+1 på madsporet' },
  redskabsmager: { navn: 'Redskabsmager', kapacitet: 1, type: 'landsby', ikon: '🪓', effekt: '+1 redskab' },
  hytte:         { navn: 'Hytte',         kapacitet: 2, type: 'landsby', ikon: '⛺', effekt: '+1 person (kræver 2 folk)' },
};
export const LANDSBY = ['mark', 'redskabsmager', 'hytte'];
export const TERNINGSTEDER = ['jagt', 'skov', 'lergrav', 'stenbrud', 'flod'];

// Kultursymboler (grønne kort) og specialister (sandfarvede kort).
export const KULTUR = {
  keramik:     { navn: 'Keramik',     ikon: '🏺' },
  skrift:      { navn: 'Skrift',      ikon: '📜' },
  kunst:       { navn: 'Kunst',       ikon: '🗿' },
  transport:   { navn: 'Transport',   ikon: '🛞' },
  vaevning:    { navn: 'Vævning',     ikon: '🧶' },
  laegekunst:  { navn: 'Lægekunst',   ikon: '🌿' },
  tidsregning: { navn: 'Tidsregning', ikon: '🌞' },
  musik:       { navn: 'Musik',       ikon: '🪈' },
};
export const SPECIALIST = {
  shaman:        { navn: 'Shaman',        flertal: 'shamaner',        ikon: '🧙', ganger: 'antal folk' },
  bonde:         { navn: 'Bonde',         flertal: 'bønder',          ikon: '👩‍🌾', ganger: 'madsporet' },
  redskabsmager: { navn: 'Redskabsmager', flertal: 'redskabsmagere',  ikon: '🔨', ganger: 'samlet redskabsværdi' },
  hyttebygger:   { navn: 'Hyttebygger',   flertal: 'hyttebyggere',    ikon: '🛖', ganger: 'antal bygninger' },
};

// Øverste del af et kort (det man får med det samme eller senere).
const top = {
  mad: n => ({ type: 'mad', antal: n }),
  ress: (r, n = 1) => ({ type: 'ressource', ressource: r, antal: n }),
  terningkort: () => ({ type: 'terningkort' }),
  terninger: r => ({ type: 'terninger', ressource: r }),
  point: n => ({ type: 'point', antal: n }),
  redskab: () => ({ type: 'redskab' }),
  landbrug: () => ({ type: 'landbrug' }),
  traekKort: () => ({ type: 'traekKort' }),
  engangs: v => ({ type: 'engangsredskab', vaerdi: v }),
  valgfri2: () => ({ type: 'valgfri2' }),
};
const kultur = s => ({ type: 'kultur', symbol: s });
const spec = (s, n) => ({ type: 'specialist', specialist: s, antal: n });

export const KORT = [
  // 16 grønne kulturkort, 2 af hvert symbol
  { top: top.mad(7),          bund: kultur('keramik') },
  { top: top.terningkort(),   bund: kultur('keramik') },
  { top: top.traekKort(),     bund: kultur('skrift') },
  { top: top.terningkort(),   bund: kultur('skrift') },
  { top: top.redskab(),       bund: kultur('kunst') },
  { top: top.terninger('guld'), bund: kultur('kunst') },
  { top: top.ress('sten', 2), bund: kultur('transport') },
  { top: top.terningkort(),   bund: kultur('transport') },
  { top: top.mad(1),          bund: kultur('vaevning') },
  { top: top.mad(3),          bund: kultur('vaevning') },
  { top: top.mad(5),          bund: kultur('laegekunst') },
  { top: top.valgfri2(),      bund: kultur('laegekunst') },
  { top: top.landbrug(),      bund: kultur('tidsregning') },
  { top: top.terningkort(),   bund: kultur('tidsregning') },
  { top: top.point(3),        bund: kultur('musik') },
  { top: top.point(3),        bund: kultur('musik') },
  // 5 shamaner (7 i alt)
  { top: top.terninger('trae'), bund: spec('shaman', 2) },
  { top: top.ress('ler'),     bund: spec('shaman', 2) },
  { top: top.ress('guld'),    bund: spec('shaman', 1) },
  { top: top.ress('sten'),    bund: spec('shaman', 1) },
  { top: top.terninger('sten'), bund: spec('shaman', 1) },
  // 5 bønder (7 i alt)
  { top: top.mad(3),          bund: spec('bonde', 2) },
  { top: top.terningkort(),   bund: spec('bonde', 2) },
  { top: top.landbrug(),      bund: spec('bonde', 1) },
  { top: top.ress('sten'),    bund: spec('bonde', 1) },
  { top: top.terningkort(),   bund: spec('bonde', 1) },
  // 5 redskabsmagere (8 i alt)
  { top: top.engangs(2),      bund: spec('redskabsmager', 2) },
  { top: top.terningkort(),   bund: spec('redskabsmager', 2) },
  { top: top.terningkort(),   bund: spec('redskabsmager', 2) },
  { top: top.engangs(4),      bund: spec('redskabsmager', 1) },
  { top: top.engangs(3),      bund: spec('redskabsmager', 1) },
  // 5 hyttebyggere (9 i alt)
  { top: top.point(3),        bund: spec('hyttebygger', 3) },
  { top: top.mad(2),          bund: spec('hyttebygger', 2) },
  { top: top.terningkort(),   bund: spec('hyttebygger', 2) },
  { top: top.mad(4),          bund: spec('hyttebygger', 1) },
  { top: top.terningkort(),   bund: spec('hyttebygger', 1) },
].map((k, id) => ({ id, ...k }));

// Bygninger. type 'fast': betal præcis 'pris'. type 'antal': præcis `antal`
// ressourcer af præcis `slags` forskellige slags. type 'fri': 1-7 valgfri.
const fast = (trae, ler, sten, guld) => ({ type: 'fast', pris: { trae, ler, sten, guld } });
export const BYGNINGER = [
  // 17 faste: alle kombinationer af 3 ressourcer med mindst 2 forskellige
  // slags (16 stk.) + én ekstra af den billigste (2 træ + 1 ler).
  fast(2, 1, 0, 0), fast(2, 0, 1, 0), fast(2, 0, 0, 1),
  fast(1, 2, 0, 0), fast(0, 2, 1, 0), fast(0, 2, 0, 1),
  fast(1, 0, 2, 0), fast(0, 1, 2, 0), fast(0, 0, 2, 1),
  fast(1, 0, 0, 2), fast(0, 1, 0, 2), fast(0, 0, 1, 2),
  fast(1, 1, 1, 0), fast(1, 1, 0, 1), fast(1, 0, 1, 1), fast(0, 1, 1, 1),
  fast(2, 1, 0, 0),
  // 8 med fast antal (4 eller 5) og fast antal slags (1-4)
  { type: 'antal', antal: 4, slags: 1 }, { type: 'antal', antal: 4, slags: 2 },
  { type: 'antal', antal: 4, slags: 3 }, { type: 'antal', antal: 4, slags: 4 },
  { type: 'antal', antal: 5, slags: 1 }, { type: 'antal', antal: 5, slags: 2 },
  { type: 'antal', antal: 5, slags: 3 }, { type: 'antal', antal: 5, slags: 4 },
  // 3 frie
  { type: 'fri' }, { type: 'fri' }, { type: 'fri' },
].map((b, id) => ({ id, ...b }));

// Terningkortet: øjne → gevinst
export const TERNINGKORT_GEVINST = {
  1: { type: 'ressource', ressource: 'trae' },
  2: { type: 'ressource', ressource: 'ler' },
  3: { type: 'ressource', ressource: 'sten' },
  4: { type: 'ressource', ressource: 'guld' },
  5: { type: 'redskab' },
  6: { type: 'landbrug' },
};

// ---- Tekster -------------------------------------------------------------

export function beskrivTop(t) {
  switch (t.type) {
    case 'mad': return `${t.antal} mad`;
    case 'ressource': return `${t.antal} ${NAVN[t.ressource]}`;
    case 'terningkort': return 'Terningkort: alle får noget';
    case 'terninger': return `Kast 2 terninger efter ${NAVN[t.ressource]}`;
    case 'point': return `${t.antal} point`;
    case 'redskab': return '+1 redskab';
    case 'landbrug': return '+1 på madsporet';
    case 'traekKort': return 'Træk et kort (kun til slutscoring)';
    case 'engangsredskab': return `Engangsredskab +${t.vaerdi}`;
    case 'valgfri2': return '2 valgfri ressourcer (nu eller senere)';
  }
  return '?';
}
export function topIkon(t) {
  switch (t.type) {
    case 'mad': return `${IKON.mad}${t.antal}`;
    case 'ressource': return `${IKON[t.ressource]}${t.antal > 1 ? t.antal : ''}`;
    case 'terningkort': return '🎲👥';
    case 'terninger': return `🎲🎲${IKON[t.ressource]}`;
    case 'point': return `⭐${t.antal}`;
    case 'redskab': return '🪓+1';
    case 'landbrug': return '🌾+1';
    case 'traekKort': return '🃏';
    case 'engangsredskab': return `🪓${t.vaerdi}×1`;
    case 'valgfri2': return '❓❓';
  }
  return '?';
}
export function beskrivBund(b) {
  if (b.type === 'kultur') return `Kultur: ${KULTUR[b.symbol].navn}`;
  const s = SPECIALIST[b.specialist];
  return `${b.antal} × ${s.navn.toLowerCase()} (ganges med ${s.ganger})`;
}
export function bundIkon(b) {
  if (b.type === 'kultur') return KULTUR[b.symbol].ikon;
  return `${SPECIALIST[b.specialist].ikon}×${b.antal}`;
}
export function beskrivBygning(b) {
  if (b.type === 'fast') {
    const dele = RESSOURCER.filter(r => b.pris[r]).map(r => `${b.pris[r]} ${NAVN[r]}`);
    return `Betal ${dele.join(', ')} → ${bygningPointFast(b)} point`;
  }
  if (b.type === 'antal') return `Betal præcis ${b.antal} ressourcer af præcis ${b.slags} forskellig${b.slags > 1 ? 'e' : ''} slags. Point = ressourcernes værdi.`;
  return 'Betal 1-7 ressourcer, valgfri slags. Point = ressourcernes værdi.';
}
export function bygningIkon(b) {
  if (b.type === 'fast') return RESSOURCER.flatMap(r => Array(b.pris[r]).fill(IKON[r])).join('');
  if (b.type === 'antal') return `${b.antal}×❓ · ${b.slags} slags`;
  return '1–7 × ❓';
}
export function bygningPointFast(b) {
  return RESSOURCER.reduce((s, r) => s + b.pris[r] * VAERDI[r], 0);
}
