/*
  Obbys skins – firkanten man hopper rundt som.

  Hver skin er en firkant med et ansigt og eventuelt en hat. Prisen er i coins.
  Klassisk er gratis og ejes fra start. De første 14 koster højst 100 (Sofies
  første regel); siden ønskede Sofie sig «flere skins og de må godt være dyre»
  (ønske #65), så der kom ti **dyre skins** til på 150-1000 coins. Et langt løb
  til firkant 100 giver 60 coins, så den dyreste kræver en snes gode løb: det er
  noget man sparer op til og kan vise frem, ikke noget man køber i forbifarten.
  Derfor ser de dyre også dyre ud: glød, glimt, stjerner, flammer og regnbue, og
  flere af dem er levende (tegnSkin får tiden med).

  tegnSkin() tegner i et 100 × 100-koordinatsystem (skaleret til siden `s`), så
  den samme kode bruges både til spilleren på canvas og til de små
  forhåndsvisninger i butikken. Hatte må højst gå 40 op over hovedet og 20 ud
  til siden, ellers bliver de klippet i butikken.

  Felter:
    krop     farven (eller gradientens øverste farve)
    krop2    gradientens nederste farve (valgfri)
    ansigt   smil · grin · overrasket · sov · sej · robot · pirat · vred · kat · stjerne
    hat      krone · kasket · nissehue · spids · sloejfe · blad · antenne ·
             pirathat · vikinghjelm · katteoerer · glorie · horn · flammer ·
             kaempekrone · enhjoerning
    moenster striber · lava · glimt · stjerner · regnbue
    gloed    farven på skæret rundt om kroppen
*/

/** Fra denne pris står en skin under «Dyre skins» i butikken. */
export const DYR_FRA = 150;

export const SKINS = [
  { id: 'klassisk',  navn: 'Klassisk',  pris: 0,   krop: '#ffd447', ansigt: 'smil' },
  { id: 'mynte',     navn: 'Mynte',     pris: 10,  krop: '#5ee0a8', ansigt: 'smil' },
  { id: 'himmel',    navn: 'Himmel',    pris: 10,  krop: '#5b8cff', ansigt: 'grin' },
  { id: 'koral',     navn: 'Koral',     pris: 15,  krop: '#ff5c7a', ansigt: 'overrasket' },
  { id: 'violet',    navn: 'Violet',    pris: 20,  krop: '#8f6bff', ansigt: 'sov' },
  { id: 'slik',      navn: 'Slik',      pris: 25,  krop: '#ff9ad5', ansigt: 'grin', hat: 'sloejfe' },
  { id: 'frosk',     navn: 'Frøen',     pris: 30,  krop: '#7bd34a', ansigt: 'grin', hat: 'blad' },
  { id: 'sej',       navn: 'Den seje',  pris: 40,  krop: '#2ec9c9', ansigt: 'sej' },
  { id: 'kasket',    navn: 'Kasketten', pris: 45,  krop: '#ff8a3d', ansigt: 'smil', hat: 'kasket' },
  { id: 'spoegelse', navn: 'Spøgelse',  pris: 55,  krop: '#eef0ff', ansigt: 'overrasket' },
  { id: 'nisse',     navn: 'Nissen',    pris: 60,  krop: '#e8413f', ansigt: 'smil', hat: 'nissehue' },
  { id: 'troldmand', navn: 'Troldmand', pris: 75,  krop: '#4a3fb0', ansigt: 'sov', hat: 'spids' },
  { id: 'robot',     navn: 'Robotten',  pris: 85,  krop: '#9aa7c7', ansigt: 'robot', hat: 'antenne' },
  { id: 'konge',     navn: 'Kongen',    pris: 100, krop: '#ffd447', ansigt: 'sej', hat: 'krone' },

  // De dyre (Sofies ønske #65)
  { id: 'pirat',     navn: 'Piraten',      pris: 150,  krop: '#c98a4b', krop2: '#9a6232', ansigt: 'pirat', hat: 'pirathat' },
  { id: 'viking',    navn: 'Vikingen',     pris: 200,  krop: '#f2b27a', krop2: '#d98e55', ansigt: 'grin', hat: 'vikinghjelm' },
  { id: 'tiger',     navn: 'Tigerkatten',  pris: 250,  krop: '#ffa23f', krop2: '#f07c1c', ansigt: 'kat', hat: 'katteoerer', moenster: 'striber' },
  { id: 'engel',     navn: 'Englen',       pris: 300,  krop: '#fffdf2', krop2: '#e9e4ff', ansigt: 'smil', hat: 'glorie', gloed: '#fff1a0' },
  { id: 'djaevel',   navn: 'Djævlen',      pris: 350,  krop: '#f0473f', krop2: '#a8182a', ansigt: 'vred', hat: 'horn' },
  { id: 'lava',      navn: 'Lavamonstret', pris: 450,  krop: '#ffc23a', krop2: '#e83a1f', ansigt: 'vred', hat: 'flammer', moenster: 'lava', gloed: '#ff6a2a' },
  { id: 'diamant',   navn: 'Diamanten',    pris: 550,  krop: '#d8faff', krop2: '#4fb8ff', ansigt: 'sej', moenster: 'glimt', gloed: '#8fe6ff' },
  { id: 'galakse',   navn: 'Galaksen',     pris: 700,  krop: '#3a1f8a', krop2: '#0c0a2e', ansigt: 'stjerne', moenster: 'stjerner', gloed: '#9b7bff' },
  { id: 'guldkonge', navn: 'Guldkongen',   pris: 850,  krop: '#ffe57a', krop2: '#d99a00', ansigt: 'sej', hat: 'kaempekrone', moenster: 'glimt', gloed: '#ffd447' },
  { id: 'regnbue',   navn: 'Enhjørningen', pris: 1000, krop: '#ff9ad5', ansigt: 'grin', hat: 'enhjoerning', moenster: 'regnbue', gloed: '#ff9ad5' },
];

export const skinMed = id => SKINS.find(s => s.id === id) || SKINS[0];
export const erDyr = skin => skin.pris >= DYR_FRA;
/** Skins der bevæger sig af sig selv – dem tegner butikken igen og igen. */
export const erLevende = skin => ['regnbue', 'glimt', 'stjerner', 'lava'].includes(skin.moenster) || skin.hat === 'flammer';

const MORK = '#1c1f4a';

/**
 * Tegner en skin i et kvadrat med hjørne (0,0) og siden `s`. `ctx` skal være
 * translateret på forhånd. `tid` (sekunder) får de levende skins til at bevæge sig.
 */
export function tegnSkin(ctx, s, skin, tid = 0) {
  const m = s / 100;
  const e = (x, y, r) => { ctx.beginPath(); ctx.arc(x * m, y * m, r * m, 0, 6.283); ctx.fill(); };

  // Hatten sidder oven på hovedet og tegnes før kroppen, så den ligger bagved kanten
  tegnHat(ctx, m, skin, tid, e);

  // Kroppen – med skær rundt om, hvis den har et
  ctx.save();
  if (skin.gloed) { ctx.shadowColor = skin.gloed; ctx.shadowBlur = 0.22 * s; }
  ctx.fillStyle = kropFyld(ctx, s, skin, tid);
  ctx.beginPath(); ctx.roundRect(0, 0, s, s, 0.22 * s); ctx.fill();
  ctx.restore();

  if (skin.moenster) {
    ctx.save();
    ctx.beginPath(); ctx.roundRect(0, 0, s, s, 0.22 * s); ctx.clip();
    tegnMoenster(ctx, m, skin, tid, e);
    ctx.restore();
  }

  tegnAnsigt(ctx, m, skin, e);
}

/** Farve, gradient eller (for Enhjørningen) en regnbue, der glider hen over kroppen. */
function kropFyld(ctx, s, skin, tid) {
  if (skin.moenster === 'regnbue') {
    const g = ctx.createLinearGradient(0, 0, s, s), skub = (tid * 60) % 360;
    for (let i = 0; i <= 6; i++) g.addColorStop(i / 6, `hsl(${(skub + i * 55) % 360},95%,68%)`);
    return g;
  }
  if (!skin.krop2) return skin.krop;
  const g = ctx.createLinearGradient(0, 0, 0, s);
  g.addColorStop(0, skin.krop); g.addColorStop(1, skin.krop2);
  return g;
}

/** En firtakket glimtestjerne med centrum (x,y) og radius r (i 100-enheder). */
function glimt(ctx, m, x, y, r) {
  ctx.beginPath();
  ctx.moveTo(x * m, (y - r) * m);
  ctx.quadraticCurveTo(x * m, y * m, (x + r) * m, y * m);
  ctx.quadraticCurveTo(x * m, y * m, x * m, (y + r) * m);
  ctx.quadraticCurveTo(x * m, y * m, (x - r) * m, y * m);
  ctx.quadraticCurveTo(x * m, y * m, x * m, (y - r) * m);
  ctx.fill();
}

/** En femtakket stjerne (øjnene på Galaksen). */
function stjerne(ctx, m, x, y, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const v = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo((x + Math.cos(v) * rr) * m, (y + Math.sin(v) * rr) * m);
  }
  ctx.closePath(); ctx.fill();
}

function tegnHat(ctx, m, skin, tid, e) {
  const hat = skin.hat;
  if (hat === 'krone') {
    ctx.fillStyle = '#ffcc2e';
    ctx.beginPath();
    ctx.moveTo(18 * m, -4 * m); ctx.lineTo(30 * m, -24 * m); ctx.lineTo(44 * m, -10 * m);
    ctx.lineTo(58 * m, -28 * m); ctx.lineTo(72 * m, -10 * m); ctx.lineTo(84 * m, -24 * m);
    ctx.lineTo(84 * m, 2 * m); ctx.lineTo(18 * m, 2 * m); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ff5c7a'; e(51, -6, 5);
  } else if (hat === 'kasket') {
    ctx.fillStyle = '#2b6be0';
    ctx.beginPath(); ctx.ellipse(50 * m, -6 * m, 32 * m, 22 * m, 0, Math.PI, 0); ctx.fill();
    ctx.fillRect(18 * m, -8 * m, 64 * m, 9 * m);
    ctx.fillStyle = '#1e4fa8'; ctx.fillRect(50 * m, -8 * m, 44 * m, 8 * m);   // skyggen
  } else if (hat === 'nissehue') {
    ctx.fillStyle = '#d8342f';
    ctx.beginPath(); ctx.moveTo(16 * m, 0); ctx.lineTo(62 * m, -34 * m); ctx.lineTo(84 * m, 0); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillRect(12 * m, -8 * m, 76 * m, 9 * m); e(62, -34, 8);
  } else if (hat === 'spids') {
    ctx.fillStyle = '#6a5ae0';
    ctx.beginPath(); ctx.moveTo(12 * m, 2 * m); ctx.lineTo(50 * m, -40 * m); ctx.lineTo(88 * m, 2 * m); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#4b3fb5'; ctx.fillRect(10 * m, -8 * m, 80 * m, 10 * m);   // skygge under skyggen
    ctx.fillStyle = '#ffd447'; e(50, -24, 5); e(36, -10, 4); e(64, -12, 3);
  } else if (hat === 'sloejfe') {
    ctx.fillStyle = '#ff4f9a';
    ctx.beginPath(); ctx.moveTo(50 * m, -6 * m); ctx.lineTo(22 * m, -22 * m); ctx.lineTo(22 * m, 4 * m); ctx.closePath();
    ctx.moveTo(50 * m, -6 * m); ctx.lineTo(78 * m, -22 * m); ctx.lineTo(78 * m, 4 * m); ctx.closePath(); ctx.fill();
    e(50, -7, 8);
  } else if (hat === 'blad') {
    ctx.fillStyle = '#3f9e2f';
    ctx.beginPath(); ctx.ellipse(60 * m, -14 * m, 20 * m, 9 * m, -0.5, 0, 6.283); ctx.fill();
    ctx.strokeStyle = '#2c7320'; ctx.lineWidth = 4 * m; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(46 * m, 2 * m); ctx.lineTo(58 * m, -14 * m); ctx.stroke();
  } else if (hat === 'antenne') {
    ctx.strokeStyle = '#6f7b98'; ctx.lineWidth = 5 * m; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(50 * m, 4 * m); ctx.lineTo(50 * m, -20 * m); ctx.stroke();
    ctx.fillStyle = '#ff5c7a'; e(50, -25, 9);
  } else if (hat === 'pirathat') {
    // Trekantet hat med guldkant og et lille dødningehoved
    ctx.fillStyle = '#1f2233';
    ctx.beginPath(); ctx.moveTo(-6 * m, 6 * m);
    ctx.quadraticCurveTo(4 * m, -16 * m, 24 * m, -12 * m);
    ctx.quadraticCurveTo(50 * m, -40 * m, 76 * m, -12 * m);
    ctx.quadraticCurveTo(96 * m, -16 * m, 106 * m, 6 * m);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#ffcc2e'; ctx.lineWidth = 3 * m; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-2 * m, 3 * m); ctx.quadraticCurveTo(50 * m, -8 * m, 102 * m, 3 * m); ctx.stroke();
    ctx.fillStyle = '#fff'; e(50, -18, 7); ctx.fillRect(46 * m, -13 * m, 8 * m, 5 * m);
    ctx.fillStyle = '#1f2233'; e(47, -19, 2); e(53, -19, 2);
  } else if (hat === 'vikinghjelm') {
    // Horn først (de stikker ud under hjelmen), så selve hjelmen med nitter
    ctx.fillStyle = '#fff2d6';
    for (const side of [1, -1]) {
      const x = v => 50 + side * (v - 50);
      ctx.beginPath(); ctx.moveTo(x(20) * m, -2 * m);
      ctx.quadraticCurveTo(x(-2) * m, -8 * m, x(-4) * m, -36 * m);
      ctx.quadraticCurveTo(x(12) * m, -16 * m, x(30) * m, -14 * m);
      ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = '#9aa3b5';
    ctx.beginPath(); ctx.ellipse(50 * m, 2 * m, 36 * m, 28 * m, 0, Math.PI, 0); ctx.fill();
    ctx.fillStyle = '#6f7b98'; ctx.fillRect(12 * m, -6 * m, 76 * m, 9 * m); ctx.fillRect(46 * m, -26 * m, 8 * m, 22 * m);
    ctx.fillStyle = '#d7dde8'; e(24, -2, 2.5); e(40, -2, 2.5); e(60, -2, 2.5); e(76, -2, 2.5);
  } else if (hat === 'katteoerer') {
    // Ørerne har kroppens farve og lyserødt indeni
    for (const side of [1, -1]) {
      const x = v => 50 + side * (v - 50);
      ctx.fillStyle = skin.krop;
      ctx.beginPath(); ctx.moveTo(x(8) * m, 8 * m); ctx.lineTo(x(18) * m, -30 * m); ctx.lineTo(x(46) * m, 6 * m); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffb3c7';
      ctx.beginPath(); ctx.moveTo(x(16) * m, 4 * m); ctx.lineTo(x(20) * m, -18 * m); ctx.lineTo(x(36) * m, 4 * m); ctx.closePath(); ctx.fill();
    }
  } else if (hat === 'glorie') {
    // En glorie svæver lidt op og ned over hovedet
    const y = -20 + Math.sin(tid * 2.4) * 3;
    ctx.save();
    ctx.shadowColor = '#fff1a0'; ctx.shadowBlur = 14 * m;
    ctx.strokeStyle = '#ffd447'; ctx.lineWidth = 7 * m;
    ctx.beginPath(); ctx.ellipse(50 * m, y * m, 30 * m, 8 * m, 0, 0, 6.283); ctx.stroke();
    ctx.restore();
  } else if (hat === 'horn') {
    ctx.fillStyle = '#3a1420';
    for (const side of [1, -1]) {
      const x = v => 50 + side * (v - 50);
      ctx.beginPath(); ctx.moveTo(x(14) * m, 4 * m);
      ctx.quadraticCurveTo(x(6) * m, -16 * m, x(16) * m, -30 * m);
      ctx.quadraticCurveTo(x(24) * m, -12 * m, x(38) * m, 4 * m);
      ctx.closePath(); ctx.fill();
    }
  } else if (hat === 'flammer') {
    // Fem flammetunger, der blafrer hver i sin takt
    for (let i = 0; i < 5; i++) {
      const x = 14 + i * 18, h = (i % 2 ? 22 : 30) + Math.sin(tid * 9 + i * 1.7) * 6;
      ctx.fillStyle = '#ff6a2a'; flamme(ctx, m, x, h, 10);
      ctx.fillStyle = '#ffd447'; flamme(ctx, m, x, h * 0.6, 5.5);
    }
  } else if (hat === 'kaempekrone') {
    // Høj guldkrone med tre ædelsten og en lille kugle på hver takt
    ctx.fillStyle = '#e0a100';
    ctx.beginPath();
    ctx.moveTo(8 * m, 4 * m); ctx.lineTo(10 * m, -28 * m); ctx.lineTo(30 * m, -12 * m); ctx.lineTo(50 * m, -34 * m);
    ctx.lineTo(70 * m, -12 * m); ctx.lineTo(90 * m, -28 * m); ctx.lineTo(92 * m, 4 * m); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffd447';
    ctx.beginPath();
    ctx.moveTo(13 * m, 2 * m); ctx.lineTo(14 * m, -20 * m); ctx.lineTo(30 * m, -6 * m); ctx.lineTo(50 * m, -26 * m);
    ctx.lineTo(70 * m, -6 * m); ctx.lineTo(86 * m, -20 * m); ctx.lineTo(87 * m, 2 * m); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fff4b8'; e(10, -29, 4); e(50, -35, 4.5); e(90, -29, 4);
    ctx.fillStyle = '#ff3b6b'; e(50, -8, 6);
    ctx.fillStyle = '#3fa7ff'; e(28, -4, 4.5);
    ctx.fillStyle = '#36d17a'; e(72, -4, 4.5);
  } else if (hat === 'enhjoerning') {
    // Et snoet guldhorn midt i panden og en lyserød manke
    ctx.fillStyle = '#c77dff'; e(26, 2, 10); e(40, -2, 9);
    ctx.fillStyle = '#ff9ad5'; e(62, -2, 9); e(76, 2, 10);
    ctx.fillStyle = '#ffe9a8';
    ctx.beginPath(); ctx.moveTo(40 * m, 4 * m); ctx.lineTo(50 * m, -40 * m); ctx.lineTo(60 * m, 4 * m); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#e8b64a'; ctx.lineWidth = 2.5 * m; ctx.lineCap = 'round';
    ctx.beginPath();
    for (const y of [-26, -14, -2]) { const b = (y + 40) / 44 * 10; ctx.moveTo((50 - b) * m, (y + 2) * m); ctx.lineTo((50 + b) * m, (y - 3) * m); }
    ctx.stroke();
  }
}

/** En flammetunge med bund ved y=4 og spids ved y=-h. */
function flamme(ctx, m, x, h, b) {
  ctx.beginPath(); ctx.moveTo((x - b) * m, 4 * m);
  ctx.quadraticCurveTo((x - b) * m, -h * 0.45 * m, x * m, -h * m);
  ctx.quadraticCurveTo((x + b) * m, -h * 0.45 * m, (x + b) * m, 4 * m);
  ctx.closePath(); ctx.fill();
}

/** Mønstret på kroppen (klippet til den runde firkant af tegnSkin). */
function tegnMoenster(ctx, m, skin, tid, e) {
  const mo = skin.moenster;
  if (mo === 'striber') {
    ctx.fillStyle = '#b3520c';
    for (const x of [30, 50, 70]) {
      ctx.beginPath(); ctx.moveTo((x - 6) * m, 0); ctx.lineTo(x * m, 18 * m); ctx.lineTo((x + 6) * m, 0); ctx.closePath(); ctx.fill();
    }
    for (const y of [58, 76]) for (const side of [1, -1]) {
      const x = v => 50 + side * (v - 50);
      ctx.beginPath(); ctx.moveTo(x(0) * m, (y - 6) * m); ctx.lineTo(x(18) * m, y * m); ctx.lineTo(x(0) * m, (y + 6) * m); ctx.closePath(); ctx.fill();
    }
  } else if (mo === 'lava') {
    // Mørke revner, og lyset i dem pulserer
    ctx.strokeStyle = '#8a1f12'; ctx.lineWidth = 4 * m; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(4 * m, 70 * m); ctx.lineTo(18 * m, 80 * m); ctx.lineTo(14 * m, 96 * m);
    ctx.moveTo(18 * m, 80 * m); ctx.lineTo(34 * m, 84 * m);
    ctx.moveTo(96 * m, 64 * m); ctx.lineTo(82 * m, 76 * m); ctx.lineTo(88 * m, 92 * m);
    ctx.moveTo(82 * m, 76 * m); ctx.lineTo(66 * m, 86 * m);
    ctx.moveTo(8 * m, 8 * m); ctx.lineTo(18 * m, 18 * m);
    ctx.moveTo(90 * m, 6 * m); ctx.lineTo(84 * m, 18 * m);
    ctx.stroke();
    ctx.globalAlpha = 0.45 + 0.35 * Math.sin(tid * 4);
    ctx.fillStyle = '#fff2a0'; e(18, 80, 3); e(82, 76, 3);
    ctx.globalAlpha = 1;
  } else if (mo === 'glimt') {
    // Et blankt skråt skin og glimtestjerner, der tænder og slukker
    ctx.fillStyle = 'rgba(255,255,255,.35)';
    ctx.beginPath(); ctx.moveTo(8 * m, 0); ctx.lineTo(30 * m, 0); ctx.lineTo(0, 30 * m); ctx.lineTo(0, 8 * m); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.18)';
    ctx.beginPath(); ctx.moveTo(100 * m, 58 * m); ctx.lineTo(100 * m, 76 * m); ctx.lineTo(76 * m, 100 * m); ctx.lineTo(58 * m, 100 * m); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fff';
    for (const [x, y, r, fase] of [[82, 16, 9, 0], [14, 84, 7, 2.1], [88, 86, 6, 4.2]]) {
      const lys = 0.5 + 0.5 * Math.sin(tid * 3 + fase);
      ctx.globalAlpha = 0.25 + 0.75 * lys; glimt(ctx, m, x, y, r * (0.6 + 0.4 * lys));
    }
    ctx.globalAlpha = 1;
  } else if (mo === 'stjerner') {
    // Rummet: en lyserød tåge og små stjerner, der blinker
    ctx.fillStyle = 'rgba(255,110,200,.28)'; e(78, 78, 30);
    ctx.fillStyle = 'rgba(90,200,255,.22)'; e(18, 20, 24);
    ctx.fillStyle = '#fff';
    const pr = [[12, 10], [30, 22], [86, 12], [70, 26], [8, 58], [92, 52], [22, 88], [46, 92], [80, 94], [60, 8]];
    pr.forEach(([x, y], i) => { ctx.globalAlpha = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(tid * 2.5 + i * 1.9)); e(x, y, i % 3 ? 1.6 : 2.6); });
    ctx.globalAlpha = 1;
  } else if (mo === 'regnbue') {
    ctx.fillStyle = 'rgba(255,255,255,.3)';
    ctx.beginPath(); ctx.moveTo(8 * m, 0); ctx.lineTo(30 * m, 0); ctx.lineTo(0, 30 * m); ctx.lineTo(0, 8 * m); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fff';
    const lys = 0.5 + 0.5 * Math.sin(tid * 3);
    ctx.globalAlpha = 0.4 + 0.6 * lys; glimt(ctx, m, 84, 84, 6 + 3 * lys);
    ctx.globalAlpha = 1;
  }
}

function tegnAnsigt(ctx, m, skin, e) {
  const a = skin.ansigt;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (a === 'sej') {
    ctx.fillStyle = '#15182e';
    ctx.beginPath(); ctx.roundRect(16 * m, 30 * m, 68 * m, 22 * m, 6 * m); ctx.fill();
    ctx.fillRect(46 * m, 34 * m, 8 * m, 8 * m);
    ctx.fillStyle = '#fff'; ctx.globalAlpha = .35;
    ctx.beginPath(); ctx.moveTo(22 * m, 48 * m); ctx.lineTo(34 * m, 33 * m); ctx.lineTo(40 * m, 33 * m); ctx.lineTo(28 * m, 48 * m); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = MORK; ctx.lineWidth = 7 * m;
    ctx.beginPath(); ctx.arc(50 * m, 62 * m, 16 * m, 0.25, Math.PI - 0.25); ctx.stroke();
  } else if (a === 'robot') {
    ctx.fillStyle = '#15182e';
    ctx.beginPath(); ctx.roundRect(20 * m, 32 * m, 22 * m, 16 * m, 4 * m); ctx.roundRect(58 * m, 32 * m, 22 * m, 16 * m, 4 * m); ctx.fill();
    ctx.fillStyle = '#5ee0a8'; ctx.fillRect(25 * m, 36 * m, 12 * m, 8 * m); ctx.fillRect(63 * m, 36 * m, 12 * m, 8 * m);
    ctx.strokeStyle = MORK; ctx.lineWidth = 6 * m;
    ctx.beginPath(); ctx.moveTo(30 * m, 68 * m); ctx.lineTo(70 * m, 68 * m); ctx.stroke();
  } else if (a === 'sov') {
    ctx.strokeStyle = MORK; ctx.lineWidth = 6 * m;
    ctx.beginPath(); ctx.arc(34 * m, 42 * m, 12 * m, Math.PI * 0.15, Math.PI * 0.85);
    ctx.arc(70 * m, 42 * m, 12 * m, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke();
    ctx.beginPath(); ctx.arc(50 * m, 70 * m, 10 * m, Math.PI * 1.2, Math.PI * 1.8); ctx.stroke();
  } else if (a === 'pirat') {
    // Ét øje og en klap for det andet, med snoren skråt op over panden
    ctx.strokeStyle = '#15182e'; ctx.lineWidth = 3 * m;
    ctx.beginPath(); ctx.moveTo(8 * m, 20 * m); ctx.lineTo(92 * m, 34 * m); ctx.stroke();
    ctx.fillStyle = '#15182e';
    ctx.beginPath(); ctx.ellipse(70 * m, 42 * m, 15 * m, 13 * m, 0, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#fff'; e(34, 42, 14);
    ctx.fillStyle = MORK; e(38, 44, 7);
    ctx.strokeStyle = MORK; ctx.lineWidth = 6 * m;
    ctx.beginPath(); ctx.arc(50 * m, 58 * m, 18 * m, 0.25, Math.PI - 0.25); ctx.stroke();
    ctx.fillStyle = '#ffd447'; e(22, 76, 4);                          // guldtand-glimt i mundvigen
  } else if (a === 'vred') {
    // Frække øjne med skrå bryn og et bredt grin
    ctx.fillStyle = '#fff'; e(34, 44, 13); e(66, 44, 13);
    ctx.fillStyle = MORK; e(37, 47, 6); e(63, 47, 6);
    ctx.strokeStyle = MORK; ctx.lineWidth = 6 * m;
    ctx.beginPath(); ctx.moveTo(18 * m, 26 * m); ctx.lineTo(44 * m, 34 * m); ctx.moveTo(82 * m, 26 * m); ctx.lineTo(56 * m, 34 * m); ctx.stroke();
    ctx.fillStyle = MORK;
    ctx.beginPath(); ctx.moveTo(24 * m, 64 * m); ctx.quadraticCurveTo(50 * m, 92 * m, 76 * m, 64 * m); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.moveTo(32 * m, 66 * m); ctx.lineTo(37 * m, 73 * m); ctx.lineTo(42 * m, 67 * m); ctx.closePath();
    ctx.moveTo(58 * m, 67 * m); ctx.lineTo(63 * m, 73 * m); ctx.lineTo(68 * m, 66 * m); ctx.closePath(); ctx.fill();
  } else if (a === 'kat') {
    // Grønne katteøjne med smalle pupiller, lyserød næse, W-mund og knurhår
    ctx.fillStyle = '#b9f36b'; e(33, 42, 13); e(67, 42, 13);
    ctx.fillStyle = '#15182e';
    ctx.beginPath(); ctx.ellipse(33 * m, 42 * m, 4 * m, 11 * m, 0, 0, 6.283); ctx.ellipse(67 * m, 42 * m, 4 * m, 11 * m, 0, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#ff7aa2';
    ctx.beginPath(); ctx.moveTo(44 * m, 58 * m); ctx.lineTo(56 * m, 58 * m); ctx.lineTo(50 * m, 65 * m); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = MORK; ctx.lineWidth = 4 * m;
    ctx.beginPath(); ctx.moveTo(50 * m, 65 * m); ctx.quadraticCurveTo(44 * m, 74 * m, 38 * m, 68 * m);
    ctx.moveTo(50 * m, 65 * m); ctx.quadraticCurveTo(56 * m, 74 * m, 62 * m, 68 * m); ctx.stroke();
    ctx.lineWidth = 2.5 * m;
    ctx.beginPath();
    ctx.moveTo(30 * m, 64 * m); ctx.lineTo(-8 * m, 58 * m); ctx.moveTo(30 * m, 69 * m); ctx.lineTo(-8 * m, 72 * m);
    ctx.moveTo(70 * m, 64 * m); ctx.lineTo(108 * m, 58 * m); ctx.moveTo(70 * m, 69 * m); ctx.lineTo(108 * m, 72 * m);
    ctx.stroke();
  } else if (a === 'stjerne') {
    // Stjerneøjne og en lys mund, så ansigtet kan ses på den mørke krop
    ctx.fillStyle = '#fff4b8'; stjerne(ctx, m, 33, 42, 15); stjerne(ctx, m, 67, 42, 15);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 6 * m;
    ctx.beginPath(); ctx.arc(50 * m, 58 * m, 16 * m, 0.25, Math.PI - 0.25); ctx.stroke();
  } else {
    // Øjne med hvid baggrund (smil, grin, overrasket)
    ctx.fillStyle = '#fff'; e(36, 40, 15); e(70, 40, 15);
    ctx.fillStyle = MORK; e(40, 42, 7); e(74, 42, 7);
    if (a === 'grin') {
      ctx.fillStyle = MORK;
      ctx.beginPath(); ctx.arc(52 * m, 60 * m, 20 * m, 0.1, Math.PI - 0.1); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillRect(34 * m, 60 * m, 36 * m, 6 * m);
    } else if (a === 'overrasket') {
      ctx.fillStyle = MORK; e(52, 68, 11);
    } else {
      ctx.strokeStyle = MORK; ctx.lineWidth = 6 * m;
      ctx.beginPath(); ctx.arc(52 * m, 58 * m, 16 * m, 0.2, Math.PI - 0.2); ctx.stroke();
    }
  }
}
