// Papirøens regler (public/spil/papir/papir.mjs): sløjfen der farver papiret,
// stregen man kan blive taget på, og de tre modstandere.
//
// Kør:  node --test test/unit/papir.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  N, FELTER, BASE, SPREDNING, BOTTER,
  nyBane, tik, skridt, styr, erobre, saetBase, taelFelter, botRetning, procent, score, kør,
} from '../../public/spil/papir/papir.mjs';

const felt = (s, x, y) => s.ejer[x + y * N];
const streg = (s, x, y) => s.spor[x + y * N];

/** Kører en rute: [[retning, antal felter], …]. Retningen sættes direkte,
 *  så ruten står læseligt i testen — spilleren selv bruger styr(). */
function rute(s, p, trin) {
  for (const [dir, antal] of trin) {
    p.dir = dir;
    for (let i = 0; i < antal; i++) skridt(s, p);
  }
}

/** Papiret og spillerne skal altid passe sammen — bruges efter de lange kørsler. */
function tjekBanen(s) {
  const tal = new Int32Array(s.spillere.length + 1);
  for (let i = 0; i < FELTER; i++) {
    tal[s.ejer[i]]++;
    const e = s.spor[i];
    if (!e) continue;
    const p = s.spillere[e - 1];
    assert.ok(p.levende, `en streg fra ${p.navn}, som ikke er med længere`);
    assert.ok(p.streg.includes(i), `${p.navn}s streg på papiret står ikke i spillerens egen liste`);
  }
  for (const p of s.spillere) {
    assert.equal(p.felter, tal[p.id], `${p.navn} har talt sine felter forkert`);
    for (const i of p.streg) assert.equal(s.spor[i], p.id, `${p.navn} har en streg, der ikke står på papiret`);
    assert.ok(p.cx >= 0 && p.cx < N && p.cy >= 0 && p.cy < N, `${p.navn} er kørt ud over papiret`);
    if (!p.levende) assert.equal(p.streg.length, 0, 'en der er ude, har ingen streg tilbage');
  }
}

/* ---------- Et friskt stykke papir ---------- */

test('alle kommer ind med hvert sit lille område, langt fra hinanden', () => {
  const s = nyBane({ seed: 3 });
  assert.equal(s.spillere.length, 1 + BOTTER.length);
  const side = 2 * BASE + 1;
  for (const p of s.spillere) {
    assert.equal(p.felter, side * side, `${p.navn} starter med ${side}×${side} felter`);
    assert.equal(felt(s, p.cx, p.cy), p.id, 'og står midt i sit eget');
    assert.equal(p.ude, false);
    assert.ok(p.cx > BASE && p.cy > BASE && p.cx < N - BASE - 1 && p.cy < N - BASE - 1, 'ikke klods op ad kanten');
  }
  for (const a of s.spillere) {
    for (const b of s.spillere) {
      if (a === b) continue;
      assert.ok(Math.abs(a.cx - b.cx) + Math.abs(a.cy - b.cy) >= SPREDNING,
        `${a.navn} og ${b.navn} startede oven i hinanden`);
    }
  }
  assert.equal(s.spor.some(v => v !== 0), false, 'ingen streger endnu');
  assert.equal(s.spillere[0].mig, true, 'spiller 1 er mennesket');
  assert.equal(s.spillere[0].bot, false);
});

test('samme frø giver det samme spil', () => {
  const a = kør(42, 30), b = kør(42, 30);
  assert.deepEqual(a.spillere.map(p => [p.cx, p.cy, p.felter, p.bedste]),
    b.spillere.map(p => [p.cx, p.cy, p.felter, p.bedste]));
  assert.equal(a.t.toFixed(6), b.t.toFixed(6));
});

/* ---------- Styringen ---------- */

test('man kan dreje, men ikke vende 180° – det ville være lige ind i sin egen streg', () => {
  const s = nyBane({ seed: 9, bots: 0 });
  const p = s.spillere[0];
  p.dir = 0;
  assert.equal(styr(p, 1), true);
  skridt(s, p);
  assert.equal(p.dir, 1, 'trykket slår igennem, når man når feltet');

  assert.equal(styr(p, 3), false, 'modsat vej er ikke et træk');
  assert.equal(styr(p, 1), false, 'og den vej man allerede kører, er ikke et skift');
  assert.equal(styr(p, 9), false);
  skridt(s, p);
  assert.equal(p.dir, 1);
});

/* ---------- Sløjfen ---------- */

test('en sløjfe ud og hjem farver hele området – også det, der ligger inde i den', () => {
  const s = nyBane({ seed: 11, bots: 0 });
  const p = s.spillere[0];
  const { cx, cy } = p;
  const før = p.felter;

  // Op over kanten af mit område, fem til højre, ned forbi mit område igen og hjem.
  rute(s, p, [[3, 3]]);
  assert.equal(p.ude, true, 'ude af mit eget – nu er der en streg');
  assert.equal(streg(s, cx, cy - 3), p.id);
  rute(s, p, [[0, 5], [1, 3], [2, 3]]);

  assert.equal(p.ude, false, 'sløjfen er lukket');
  assert.equal(p.sløjfer, 1);
  assert.equal(p.streg.length, 0, 'stregen er væk');
  assert.equal(s.spor.some(v => v !== 0), false);
  assert.equal(felt(s, cx, cy - 3), p.id, 'stregen blev til område');
  assert.equal(felt(s, cx + 4, cy - 1), p.id, 'og hullet inde i sløjfen med');
  assert.ok(p.felter > før + 11, `for lidt nyt papir: ${før} → ${p.felter}`);
  assert.equal(p.bedste, p.felter);
});

test('erobringen tager også det, en anden havde farvet inde i sløjfen', () => {
  const s = nyBane({ seed: 5, bots: 1 });
  const mig = s.spillere[0], anden = s.spillere[1];
  s.ejer.fill(0); s.spor.fill(0);
  for (let x = 10; x <= 20; x++) { s.ejer[x + 10 * N] = mig.id; s.ejer[x + 20 * N] = mig.id; }
  for (let y = 10; y <= 20; y++) { s.ejer[10 + y * N] = mig.id; s.ejer[20 + y * N] = mig.id; }
  s.ejer[15 + 15 * N] = anden.id;
  s.ejer[16 + 15 * N] = anden.id;
  anden.cx = 15; anden.cy = 15;
  taelFelter(s);
  assert.equal(anden.felter, 2);

  const h = [];
  erobre(s, mig, h);
  assert.equal(mig.felter, 11 * 11, 'hele rammen og alt indeni');
  assert.equal(anden.felter, 0);
  assert.equal(anden.levende, false, 'mister man hele sit område, er man ude');
  assert.ok(h.some(e => e.slags === 'doed' && e.id === anden.id && e.grund === 'overtaget'));
  assert.equal(mig.drab, 1);
});

/* ---------- At blive taget ---------- */

test('kanten af papiret er slut', () => {
  const s = nyBane({ seed: 4, bots: 0 });
  const p = s.spillere[0];
  p.dir = 3;
  for (let i = 0; i < N && p.levende; i++) skridt(s, p);
  assert.equal(p.levende, false);
  assert.equal(s.slut, 'doed');
  assert.equal(s.grund, 'mur');
  assert.equal(p.felter, 0, 'området forsvinder fra papiret');
  assert.equal(s.spor.some(v => v !== 0), false, 'og stregen med');
});

test('kører man over sin egen streg, er man ude', () => {
  const s = nyBane({ seed: 6, bots: 0 });
  const p = s.spillere[0];
  // Langt ud i papiret og så en firkant, der lukker sig om sig selv ude i
  // ingenting – langt fra mit eget område, hvor sløjfen ellers ville blive lukket.
  rute(s, p, [[3, 8], [0, 3], [1, 3], [2, 3]]);
  assert.equal(p.levende, false, 'firkanten ramte sin egen streg');
  assert.equal(s.grund, 'egen');
});

test('kører man over en fremmed streg, er det den anden, der ryger ud', () => {
  const s = nyBane({ seed: 8, bots: 1 });
  const mig = s.spillere[0], anden = s.spillere[1];
  const i = (mig.cx + 3) + mig.cy * N;
  s.spor[i] = anden.id;
  anden.streg.push(i);
  anden.ude = true;
  const havde = anden.felter;
  assert.ok(havde > 0);

  mig.cx = mig.cx + 1; mig.dir = 0;
  const h = [];
  skridt(s, mig, h); skridt(s, mig, h);

  assert.equal(anden.levende, false, `${anden.navn} blev taget på stregen`);
  assert.equal(mig.levende, true);
  assert.equal(mig.drab, 1);
  assert.equal(anden.felter, 0, 'og området er væk fra papiret');
  assert.equal(anden.streg.length, 0, 'stregen er visket ud');
  assert.equal(s.spor[i], mig.id, 'nu er det min streg, der ligger dér');
  assert.ok(h.some(e => e.slags === 'doed' && e.id === anden.id && e.af === mig.id));
  assert.equal(s.slut, null, 'spillet kører videre – det var ikke mig');
});

test('en bot der ryger ud, kommer ind igen på frisk papir', () => {
  const s = nyBane({ seed: 13, bots: 1 });
  const bot = s.spillere[1];
  bot.cx = 0; bot.cy = 0; bot.dir = 2;                  // lige ud over kanten
  skridt(s, bot);
  assert.equal(bot.levende, false);

  let genfødt = false;
  for (let i = 0; i < 60 * 6 && !genfødt; i++) {
    genfødt = tik(s, 1 / 60).some(e => e.slags === 'genfoedt' && e.id === bot.id);
  }
  assert.equal(genfødt, true, 'botten kom igen');
  assert.equal(bot.levende, true);
  assert.equal(bot.felter, (2 * BASE + 1) ** 2);
  tjekBanen(s);
});

/* ---------- Scoren ---------- */

test('scoren er hele procent af papiret – det bedste man har haft', () => {
  const s = nyBane({ seed: 2, bots: 0 });
  const p = s.spillere[0];
  assert.equal(procent(p).toFixed(2), (25 * 100 / FELTER).toFixed(2));
  assert.equal(score(p), 1);
  p.felter = FELTER / 2; p.bedste = FELTER / 2;
  assert.equal(score(p), 50);
  p.felter = 0;
  assert.equal(score(p), 50, 'man beholder sit resultat, selv om papiret bliver tomt, når man ryger ud');
});

/* ---------- Modstanderne ---------- */

test('en bot alene på papiret bliver ved med at tage nyt land', () => {
  const s = nyBane({ seed: 21, bots: 1 });
  const mig = s.spillere[0], bot = s.spillere[1];
  mig.levende = false;                                  // lad botten få papiret for sig selv
  for (let i = 0; i < 60 * 40; i++) tik(s, 1 / 60);
  assert.ok(bot.sløjfer >= 5, `botten lavede kun ${bot.sløjfer} sløjfer`);
  assert.ok(bot.bedste > 150, `botten nåede kun ${bot.bedste} felter`);
  tjekBanen(s);
});

test('botterne bliver taget af hinanden – de kører næsten aldrig ind i sig selv', () => {
  const grunde = [];
  for (let seed = 1; seed <= 12; seed++) {
    const s = nyBane({ seed, navn: 'Bot' });
    s.spillere[0].bot = true;
    for (let i = 0; i < 60 * 180 && !s.slut; i++) {
      for (const e of tik(s, 1 / 60)) if (e.slags === 'doed') grunde.push(e.grund);
    }
  }
  assert.ok(grunde.length > 20, `kun ${grunde.length} klatter røg ud i tolv runder`);
  // De kan blive lukket inde op ad kanten – men det skal være sjældent, ellers
  // ser det ud, som om modstanderne bare begår selvmord.
  const selvmål = grunde.filter(g => g === 'mur' || g === 'egen').length;
  assert.ok(selvmål / grunde.length < 0.1, `${selvmål} af ${grunde.length} kørte ind i kanten eller sig selv`);
});

test('en hel runde med fire klatter holder papiret i orden', () => {
  const s = nyBane({ seed: 12, navn: 'Bot' });
  s.spillere[0].bot = true;
  let erobringer = 0, drab = 0;
  for (let i = 0; i < 60 * 120 && !s.slut; i++) {
    for (const e of tik(s, 1 / 60)) {
      if (e.slags === 'erobret') erobringer++;
      if (e.slags === 'doed') drab++;
    }
    if (i % 60 === 0) tjekBanen(s);
  }
  tjekBanen(s);
  assert.ok(erobringer > 20, `kun ${erobringer} sløjfer på to minutter`);
  assert.ok(drab > 0, 'nogen skulle gerne blive taget undervejs');
  assert.ok(s.spillere.some(p => p.bedste > 200), 'nogen skulle gerne nå at fylde noget på papiret');
});

test('botten som spiller: en runde varer længe nok til at være sjov', () => {
  const tider = [];
  for (let seed = 1; seed <= 12; seed++) {
    const s = kør(seed, 240);
    tider.push(s.slut ? s.t : 240);
  }
  tider.sort((a, b) => a - b);
  const median = tider[tider.length >> 1];
  assert.ok(median > 15, `en gennemsnitlig runde varer kun ${median.toFixed(1)} sek. – botterne er for hårde`);
  assert.ok(tider[0] < 240, 'man skal også kunne blive taget');
});

test('botRetning vælger altid et felt, man kan køre til', () => {
  const s = nyBane({ seed: 33 });
  const p = s.spillere[1];
  for (let i = 0; i < 400; i++) {
    const d = botRetning(s, p);
    assert.ok(d >= 0 && d <= 3);
    const x = p.cx + [1, 0, -1, 0][d], y = p.cy + [0, 1, 0, -1][d];
    const iFelt = x + y * N;
    const kanDø = x < 0 || y < 0 || x >= N || y >= N || s.spor[iFelt] === p.id;
    if (kanDø) {
      // Den må kun vælge sin død, hvis alle veje er lukkede.
      const veje = [0, 1, 2, 3].filter(d2 => d2 !== (p.dir + 2) % 4).filter(d2 => {
        const ax = p.cx + [1, 0, -1, 0][d2], ay = p.cy + [0, 1, 0, -1][d2];
        return ax >= 0 && ay >= 0 && ax < N && ay < N && s.spor[ax + ay * N] !== p.id;
      });
      assert.equal(veje.length, 0, 'botten valgte at dø, selv om der var en vej');
    }
    p.dir = d;
    skridt(s, p);
    if (!p.levende) saetBase(s, p);
  }
});
