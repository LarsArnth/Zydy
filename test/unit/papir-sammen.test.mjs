// Papirøen sammen (public/spil/papir/sammen.mjs): to venner på det samme
// stykke papir, én på hver telefon. Her spilles begge telefoner igennem i
// hukommelsen — «nettet» er send(), som pakker den ene halvdel og lægger den
// ind hos den anden, præcis som rummet gør i drift.
//
// Kør:  node --test test/unit/papir-sammen.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  N, FELTER, RESPAWN, VEN_FARVE, MIN_FARVE,
  nyBane, skridt, tik, erobre,
} from '../../public/spil/papir/papir.mjs';
import {
  TID, VEN, anden, pak, anvend, froe, maskeAf, pakMaske, udpakMaske, pakStreg, udpakStreg,
  nySammen, nulstilSammen, resultat, slutTitel, tidTekst, tidTilbage, tomHalv,
} from '../../public/spil/papir/sammen.mjs';

const KODE = 'K7QFD';

/** En telefon: banen, som den ser ud dér, og det rummet har fortalt indtil nu. */
function telefon(rolle, navn) {
  const bane = nyBane({ seed: froe(KODE, 1), navn, ven: 'Ven', vaert: rolle === 'vaert' });
  const sam = nulstilSammen(nySammen(KODE, rolle), bane, 1);
  return { rolle, bane, sam, mig: bane.spillere[0], ven: bane.spillere[1] };
}

const toTelefoner = () => [telefon('vaert', 'Sofie'), telefon('gaest', 'Selma')];

/** Den ene telefons halvdel op i rummet og ned igen hos den anden. */
function send(fra, til, ekstra = {}) {
  const halv = JSON.parse(JSON.stringify(pak(fra.bane, fra.mig, {
    runde: fra.sam.runde, tid: fra.bane.t,
    krav: fra.sam.krav, kravOk: fra.sam.behandlet, faerdig: fra.sam.minSlut ? 1 : 0,
    ...ekstra,
  })));
  return anvend(til.bane, til.sam, halv);
}

/** En rute uden at skulle køre hele vejen: [[retning, antal felter], …]. */
function rute(t, trin) {
  for (const [dir, antal] of trin) {
    t.mig.dir = dir;
    for (let i = 0; i < antal; i++) skridt(t.bane, t.mig, t.h = t.h || []);
  }
  return t.h || [];
}

/* ---------- Det samme papir på begge telefoner ---------- */

test('de to telefoner ruller det samme papir ud – og hver ser sig selv som den grønne', () => {
  const [a, b] = toTelefoner();
  assert.equal(a.mig.cx, b.ven.cx, 'værtens klat står det samme sted på begge skærme');
  assert.equal(a.mig.cy, b.ven.cy);
  assert.equal(a.ven.cx, b.mig.cx, 'og gæstens ligeså');
  assert.equal(a.ven.cy, b.mig.cy);
  assert.equal(a.mig.farve, MIN_FARVE);
  assert.equal(a.ven.farve, VEN_FARVE);
  assert.equal(b.mig.farve, MIN_FARVE, 'på sin egen telefon er man altid den grønne');
  assert.equal(a.bane.spillere.length, 2, 'ingen bots med, når to spiller sammen');
  assert.equal(a.ven.fjern, true, 'vennens klat flyttes af rummet, ikke af motoren');
  assert.equal(a.bane.sammen, true);
  assert.equal(a.mig.felter, 25);
  assert.equal(a.ven.felter, 25);
});

test('frøet kommer ud af rumkoden, så de to ikke skal sende papiret', () => {
  assert.equal(froe(KODE, 1), froe(KODE, 1));
  assert.notEqual(froe(KODE, 1), froe(KODE, 2), 'en ny runde er et nyt papir');
  assert.notEqual(froe(KODE, 1), froe('ABCDE', 1));
  assert.ok(Number.isInteger(froe(KODE, 3)) && froe(KODE, 3) >= 0);
});

test('vennens klat står ikke stille af sig selv – den flyttes kun af rummet', () => {
  const [a] = toTelefoner();
  const før = { x: a.ven.cx, y: a.ven.cy };
  tik(a.bane, 1);
  assert.deepEqual({ x: a.ven.cx, y: a.ven.cy }, før, 'motoren rører ikke vennens klat');
  assert.ok(a.bane.t > 0, 'men uret går');
});

/* ---------- Pakningen: papiret skal kunne være i 4000 tegn ---------- */

test('området pakkes til ét bit pr. felt og kommer hele hjem igen', () => {
  const [a] = toTelefoner();
  const pakket = pakMaske(a.bane.ejer, 1);
  assert.ok(pakket.length <= 270, `masken fylder ${pakket.length} tegn`);
  const ud = udpakMaske(pakket);
  for (let i = 0; i < FELTER; i++) assert.equal(ud[i], a.bane.ejer[i] === 1 ? 1 : 0, 'felt ' + i);
  assert.deepEqual([...udpakMaske('')], [...new Uint8Array(FELTER)], 'noget vrøvl bliver til tomt papir');
});

test('stregen pakkes med rækkefølgen – ellers er det ikke en streg', () => {
  const [a] = toTelefoner();
  rute(a, [[0, 4], [1, 3], [2, 2]]);
  assert.ok(a.mig.streg.length >= 7, 'der skulle være en streg at pakke');
  assert.deepEqual(udpakStreg(pakStreg(a.mig.streg)), a.mig.streg);
  assert.deepEqual(udpakStreg(pakStreg([])), []);
  assert.deepEqual(udpakStreg('x'), [], 'og vrøvl giver ingen streg i stedet for et brag');
});

test('hele halvdelen kan være i rummet med god plads – også med en lang streg', () => {
  const [a] = toTelefoner();
  rute(a, [[0, 30], [1, 30]]);
  const tekst = JSON.stringify({ vaert: pak(a.bane, a.mig, { runde: 1, tid: 60, krav: [[1, 5]], kravOk: 0, faerdig: 0 }), gaest: tomHalv() });
  assert.ok(tekst.length < 1800, `stillingen fylder ${tekst.length} tegn (der er 4000)`);
});

/* ---------- Papiret flytter sig som ændringer, ikke som et facit ---------- */

test('vennens nye sløjfe farver papiret hos mig – også oven i mit eget', () => {
  const [a, b] = toTelefoner();
  send(a, b); send(b, a);                       // begge har set hinanden én gang

  // Værten kører en firkant ud og hjem igen, så sløjfen lukkes.
  const start = { x: a.mig.cx, y: a.mig.cy };
  rute(a, [[0, 6], [1, 6], [2, 6], [3, 6]]);
  assert.ok(a.mig.sløjfer >= 1, 'sløjfen blev lukket');
  assert.ok(a.mig.felter > 25, 'og papiret voksede');
  assert.deepEqual({ x: a.mig.cx, y: a.mig.cy }, start, 'og vi er hjemme igen');

  const før = b.ven.felter;
  send(a, b);
  assert.equal(b.ven.felter, a.mig.felter, 'gæstens skærm viser det samme område');
  assert.ok(b.ven.felter > før);
  for (let i = 0; i < FELTER; i++) {
    if (a.bane.ejer[i] === 1) assert.equal(b.bane.ejer[i], VEN, 'felt ' + i + ' burde være vennens');
  }
});

test('den, der erobrer sidst, får feltet – og de to skærme ender det samme sted', () => {
  const [a, b] = toTelefoner();
  send(a, b); send(b, a);

  // Gæsten tager et felt, værten tager det bagefter fra ham.
  const felt = b.mig.cx + b.mig.cy * N;
  send(b, a);
  assert.equal(a.bane.ejer[felt], VEN, 'værten kan se, at gæsten har feltet');
  a.bane.ejer[felt] = 1;                        // værtens sløjfe lagde sig oven i
  send(a, b);
  assert.equal(b.bane.ejer[felt], VEN, 'gæsten giver feltet fra sig til den nyeste sløjfe');
  send(b, a);
  assert.equal(a.bane.ejer[felt], 1, 'og værten beholder det: gæstens gamle maske tæller ikke');
});

test('det, vennen har mistet, bliver til tomt papir igen', () => {
  const [a, b] = toTelefoner();
  send(b, a);
  const felt = b.mig.cx + b.mig.cy * N;
  assert.equal(a.bane.ejer[felt], VEN);
  for (let i = 0; i < FELTER; i++) if (b.bane.ejer[i] === 1) b.bane.ejer[i] = 0;   // gæsten røg ud
  send(b, a);
  assert.equal(a.bane.ejer[felt], 0, 'vennens område forsvinder fra papiret');
});

/* ---------- Stregen og drabet ---------- */

test('kører jeg over vennens streg, er det et krav – ikke en dom', () => {
  const [a, b] = toTelefoner();
  // Værten kører ud og lader stregen ligge.
  rute(a, [[0, 5]]);
  send(a, b);
  assert.equal(b.ven.streg.length, a.mig.streg.length, 'stregen kan ses hos gæsten');
  const felt = a.mig.streg[2];
  assert.equal(b.bane.spor[felt], VEN, 'og den ligger på papiret, så man kan køre over den');

  // Gæsten stiller sig ved siden af stregen og kører hen over den.
  b.mig.cx = (felt % N) - 1; b.mig.cy = (felt / N) | 0;
  const h = rute(b, [[0, 1]]);
  const krav = h.filter(e => e.slags === 'krav');
  assert.equal(krav.length, 1, 'der blev rejst ét krav');
  assert.equal(krav[0].felt, felt);
  assert.equal(b.ven.levende, true, 'vennen er ikke ude, før hans egen telefon siger det');

  // Kravet med i rummet – og værtens telefon dømmer.
  b.sam.krav.push([b.sam.naeste++, felt]);
  const hos = send(b, a);
  assert.equal(a.mig.levende, false, 'værten kørte med en streg, der blev klippet over');
  assert.equal(a.mig.sidsteGrund, 'ramt');
  assert.equal(a.mig.sidsteAf, VEN);
  assert.ok(hos.some(e => e.slags === 'doed'));
  assert.equal(a.bane.slut, null, 'men runden er ikke slut – man kommer igen');

  // … og gæsten får at vide, at det var hans fortjeneste.
  const tilbage = send(a, b);
  assert.ok(tilbage.some(e => e.slags === 'venUde' && e.af === 1), 'gæsten får sit drab');
  assert.equal(b.mig.drab, 1);
  assert.equal(b.ven.levende, false);
  send(b, a);
  assert.deepEqual(a.sam.behandlet >= 1, true);
  assert.deepEqual(b.sam.krav, [], 'kravet er kvitteret og ryddet af vejen');
});

test('et krav på en streg, der er lukket, gør ingenting', () => {
  const [a, b] = toTelefoner();
  rute(a, [[0, 4]]);
  const felt = a.mig.streg[1];
  send(a, b);
  // Værten når hjem og lukker sløjfen, før kravet er nået frem.
  rute(a, [[1, 4], [2, 4], [3, 4]]);
  assert.equal(a.mig.streg.length, 0, 'sløjfen er lukket');
  b.sam.krav.push([1, felt]);
  send(b, a);
  assert.equal(a.mig.levende, true, 'man kan ikke blive taget på en streg, man har lukket');
  assert.equal(b.mig.drab, 0);
});

test('tager vennen hele mit område, er jeg ude – det opdager min egen telefon', () => {
  const [a, b] = toTelefoner();
  send(a, b); send(b, a);
  // Gæstens sløjfe sluger værtens 5×5.
  for (let i = 0; i < FELTER; i++) if (b.bane.ejer[i] === VEN) b.bane.ejer[i] = 1;
  const h = send(b, a);
  assert.equal(a.mig.levende, false);
  assert.equal(a.mig.sidsteGrund, 'overtaget');
  assert.ok(h.some(e => e.slags === 'doed' && e.grund === 'overtaget'));
});

/* ---------- Man kommer igen ---------- */

test('at ryge ud slutter ikke runden, når man spiller sammen', () => {
  const [a] = toTelefoner();
  rute(a, [[0, 5]]);                            // ud af sit eget område, så der ligger en streg bagved
  a.mig.dir = 2;
  skridt(a.bane, a.mig);                        // lige ind i sin egen streg
  assert.equal(a.mig.levende, false);
  assert.equal(a.mig.doede, 1);
  assert.equal(a.bane.slut, null, 'runden kører videre');
  assert.equal(a.mig.felter, 0, 'men området er væk');

  tik(a.bane, RESPAWN + 0.1);
  assert.equal(a.mig.levende, true, 'man kommer igen på et frit stykke papir');
  assert.equal(a.mig.felter, 25);
  assert.equal(a.mig.ude, false);
});

test('alene på papiret slutter runden stadig, når man ryger ud', () => {
  const s = nyBane({ seed: 5, bots: 0 });
  const p = s.spillere[0];
  p.dir = 0;
  for (let i = 0; i < 5; i++) skridt(s, p);
  p.dir = 2;
  skridt(s, p);
  assert.equal(s.slut, 'doed', 'det almindelige spil er uændret');
});

/* ---------- Runden og resultatet ---------- */

test('uret og resultatet regnes ens på begge telefoner', () => {
  const [a] = toTelefoner();
  assert.equal(tidTilbage(a.bane), TID);
  tik(a.bane, 20);
  assert.equal(Math.round(tidTilbage(a.bane)), TID - 20);
  assert.equal(tidTekst(90), '1:30');
  assert.equal(tidTekst(0), '0:00');
  assert.equal(tidTekst(-3), '0:00');

  assert.equal(resultat(300, 200), 'vundet');
  assert.equal(resultat(200, 300), 'tabt');
  assert.equal(resultat(200, 200), 'lige');
  assert.equal(slutTitel('vundet', 'Selma'), 'Du vandt!');
  assert.equal(slutTitel('tabt', 'Selma'), 'Selma vandt!');
  assert.equal(slutTitel('lige', 'Selma'), 'Helt lige!');
});

test('vennens sidste tal følger med, så begge skærme siger det samme', () => {
  const [a, b] = toTelefoner();
  rute(b, [[0, 6], [1, 6], [2, 6], [3, 6]]);
  b.sam.minSlut = true;
  send(b, a);
  assert.equal(a.sam.venSlut, true, 'værten kan se, at gæsten er færdig');
  assert.equal(a.sam.venFelter, b.mig.felter);
  assert.equal(resultat(a.mig.felter, a.sam.venFelter), resultat(b.sam.venFelter || 0, b.mig.felter) === 'vundet' ? 'tabt' : resultat(a.mig.felter, a.sam.venFelter),
    'de to er enige om, hvem der førte');
});

test('en ny runde rydder krav og gammelt papir af vejen', () => {
  const [a] = toTelefoner();
  a.sam.krav.push([1, 5]); a.sam.behandlet = 4; a.sam.minSlut = true; a.sam.venDoede = 2;
  const bane = nyBane({ seed: froe(KODE, 2), navn: 'Sofie', ven: 'Selma', vaert: true });
  nulstilSammen(a.sam, bane, 2);
  assert.equal(a.sam.runde, 2);
  assert.deepEqual(a.sam.krav, []);
  assert.equal(a.sam.behandlet, 0);
  assert.equal(a.sam.minSlut, false);
  assert.equal(a.sam.venDoede, 0);
  assert.deepEqual([...a.sam.venMaske], [...maskeAf(bane.ejer, VEN)], 'vennens felter tælles forfra');
});

test('anden() og en tom halvdel', () => {
  assert.equal(anden('vaert'), 'gaest');
  assert.equal(anden('gaest'), 'vaert');
  const [a] = toTelefoner();
  assert.deepEqual(anvend(a.bane, a.sam, null), [], 'ingen halvdel er ingen ulykke');
  assert.deepEqual(anvend(a.bane, a.sam, tomHalv()).filter(e => e.slags === 'venUde'), []);
});

test('vrøvl fra rummet vælter ikke papiret', () => {
  const [a] = toTelefoner();
  anvend(a.bane, a.sam, { omraade: 42, streg: {}, x: 1e9, y: NaN, d: 'op', liv: 'ja', krav: 'nej', felter: -5 });
  assert.ok(a.ven.cx >= 0 && a.ven.cx < N, 'vennens klat bliver på papiret');
  assert.ok(a.ven.cy >= 0 && a.ven.cy < N);
  assert.ok(a.ven.dir >= 0 && a.ven.dir <= 3);
  assert.equal(a.mig.levende, true);
});

/* ---------- Hele vejen igennem ---------- */

test('to telefoner, der skiftes til at køre, ender med det samme papir', () => {
  const [a, b] = toTelefoner();
  for (let runde = 0; runde < 6; runde++) {
    rute(a, [[0, 3], [1, 3], [2, 3], [3, 3]]);
    send(a, b);
    rute(b, [[1, 3], [2, 3], [3, 3], [0, 3]]);
    send(b, a);
    send(a, b);
  }
  assert.equal(a.mig.felter, b.ven.felter, 'værtens område er det samme på begge skærme');
  assert.equal(b.mig.felter, a.ven.felter, 'og gæstens ligeså');
  assert.ok(a.mig.felter > 25 && b.mig.felter > 25, 'begge nåede at farve noget papir');
  let ens = 0;
  for (let i = 0; i < FELTER; i++) {
    const hosA = a.bane.ejer[i], hosB = b.bane.ejer[i] === 1 ? VEN : b.bane.ejer[i] === VEN ? 1 : 0;
    if (hosA === hosB) ens++;
  }
  assert.equal(ens, FELTER, 'de to skærme viser nøjagtig det samme papir');
});
