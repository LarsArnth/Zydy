// Obby – musikken på banen. Sofies ønske nr. 53: «nå du er på banen kommer der
// sange, på en ny sang være runde» – altså musik, mens man løber, og en ny sang
// hver gang man starter forfra.
//
// Der ligger ingen lydfiler på zydy.dk (og skal ikke: en mp3 pr. sang ville veje
// mere end hele resten af siden). Sangene er derfor *noder*, som index.html
// spiller med WebAudio – en lille chiptune-maskine med melodi, bas og trommer.
// Filen her er ren JS uden DOM, så den kan enhedstestes med
// `node --test test/unit/obby.test.mjs`.
//
// Tre ting bærer det:
//
//   1) En sang er to stemmer i slag, ikke i sekunder: [midi, slag]. Så kan den
//      samme melodi spilles i et hvilket som helst tempo, og index.html skal
//      bare regne slag om til sekunder med sangens bpm.
//   2) Sangen looper, så længe runden varer. `toner()` svarer på «hvad skal der
//      lyde mellem slag A og slag B» og tæller selv loopene med, så den, der
//      spiller, kun skal holde styr på ét tal: hvor langt frem den har planlagt.
//   3) Sangene trækkes som sedler af en pose (som minispillene i Miskmask):
//      alle sangene kommer, før nogen kommer igen, og aldrig den samme to runder
//      i træk – ellers ville de korte runder, man dør i, lyde ens hver gang.

/* ---------- Tal man kan skrue på ---------- */
export const KAMMERTONE = 440;     // A4 = midi 69
export const TAKT = 4;             // trommerne gentager sig hver 4. slag

/** Frekvensen for et midi-nummer i ren ligesvævende stemning. */
export function frekvens(midi) {
  return KAMMERTONE * Math.pow(2, (midi - 69) / 12);
}

/* ---------- Trommerne ----------
   Hvert mønster er ét takt-slag ad gangen: hvornår i takten der er stortromme,
   klap og hi-hat. `hat` er den, der bærer farten, `kick` bunden. */
export const TROMMER = {
  rock:  { kick: [0, 2],          klap: [1, 3], hat: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5] },
  disko: { kick: [0, 1, 2, 3],    klap: [1, 3], hat: [0.5, 1.5, 2.5, 3.5] },
  rolig: { kick: [0, 2.5],        klap: [2],    hat: [1, 3] },
  turbo: { kick: [0, 0.75, 2, 3], klap: [1, 3], hat: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5] },
};

/* ---------- Sangene ----------
   `melodi` og `bas` er lister af [midi, slag]; midi 0 er en pause. Begge
   stemmer er lige lange, så loopet går op (det tjekker enhedstesten).
   Melodierne er skrevet til lejligheden – korte riff, der tåler at blive
   gentaget, og som ikke skal vindes over i højttaleren på en iPhone. */
export const SANGE = [
  {
    id: 'lavaloeb',
    navn: 'Lavaløb',
    bpm: 138,
    tromme: 'rock',
    melodi: [
      [72, .5], [75, .5], [79, .5], [75, .5], [77, 1], [72, 1],
      [70, .5], [72, .5], [75, 1], [74, .5], [72, .5], [70, 1],
      [72, .5], [75, .5], [79, .5], [82, .5], [84, 1], [82, 1],
      [79, .5], [75, .5], [77, 1], [72, 1], [0, 1],
    ],
    bas: [
      [36, 1], [36, .5], [43, .5], [36, 1], [39, 1],
      [32, 1], [32, .5], [39, .5], [32, 1], [36, 1],
      [36, 1], [36, .5], [43, .5], [36, 1], [39, 1],
      [43, 1], [43, .5], [38, .5], [36, 1], [36, 1],
    ],
  },
  {
    id: 'hoppehop',
    navn: 'Hoppe-hop',
    bpm: 124,
    tromme: 'rock',
    melodi: [
      [72, .5], [76, .5], [79, 1], [76, .5], [72, .5], [74, 1],
      [74, .5], [77, .5], [81, 1], [79, .5], [77, .5], [76, 1],
      [72, .5], [76, .5], [79, 1], [84, .5], [81, .5], [79, 1],
      [77, .5], [76, .5], [74, 1], [72, 2],
    ],
    bas: [
      [36, 1], [43, 1], [36, 1], [43, 1],
      [38, 1], [45, 1], [38, 1], [45, 1],
      [41, 1], [48, 1], [41, 1], [43, 1],
      [36, 1], [43, 1], [36, 2],
    ],
  },
  {
    id: 'stjernehop',
    navn: 'Stjernehop',
    bpm: 108,
    tromme: 'rolig',
    melodi: [
      [76, 1], [79, 1], [83, 1.5], [81, .5],
      [79, 1], [76, 1], [74, 2],
      [74, 1], [77, 1], [81, 1.5], [79, .5],
      [77, 1], [74, 1], [72, 2],
    ],
    bas: [
      [40, 2], [47, 2],
      [36, 2], [43, 2],
      [38, 2], [45, 2],
      [43, 2], [36, 2],
    ],
  },
  {
    id: 'turbo',
    navn: 'Turbo',
    bpm: 152,
    tromme: 'turbo',
    melodi: [
      [79, .25], [79, .25], [82, .5], [79, .5], [75, .5], [72, 1], [74, 1],
      [75, .25], [75, .25], [79, .5], [75, .5], [72, .5], [70, 1], [72, 1],
      [79, .25], [79, .25], [82, .5], [86, .5], [84, .5], [82, 1], [79, 1],
      [77, .5], [75, .5], [74, .5], [72, .5], [72, 2],
    ],
    bas: [
      [36, .5], [36, .5], [36, .5], [43, .5], [36, .5], [36, .5], [39, 1],
      [34, .5], [34, .5], [34, .5], [41, .5], [34, .5], [34, .5], [36, 1],
      [36, .5], [36, .5], [36, .5], [43, .5], [36, .5], [36, .5], [39, 1],
      [41, .5], [41, .5], [43, .5], [43, .5], [36, 2],
    ],
  },
  {
    id: 'diskoobby',
    navn: 'Disko-obby',
    bpm: 126,
    tromme: 'disko',
    melodi: [
      [74, .5], [0, .5], [74, .5], [77, .5], [81, 1], [79, 1],
      [77, .5], [0, .5], [77, .5], [74, .5], [72, 1], [74, 1],
      [76, .5], [0, .5], [76, .5], [79, .5], [83, 1], [81, 1],
      [79, .5], [77, .5], [76, .5], [74, .5], [72, 2],
    ],
    bas: [
      [38, .5], [38, .5], [45, .5], [38, .5], [50, 1], [45, 1],
      [36, .5], [36, .5], [43, .5], [36, .5], [48, 1], [43, 1],
      [40, .5], [40, .5], [47, .5], [40, .5], [52, 1], [47, 1],
      [43, .5], [43, .5], [38, .5], [38, .5], [36, 2],
    ],
  },
  {
    id: 'natteloeb',
    navn: 'Natteløb',
    bpm: 116,
    tromme: 'rolig',
    melodi: [
      [69, 1], [72, .5], [74, .5], [76, 1], [74, 1],
      [72, 1], [69, .5], [67, .5], [69, 2],
      [76, 1], [79, .5], [81, .5], [83, 1], [81, 1],
      [79, 1], [76, .5], [74, .5], [72, 2],
    ],
    bas: [
      [33, 2], [40, 2],
      [36, 2], [31, 2],
      [33, 2], [40, 2],
      [38, 2], [33, 2],
    ],
  },
];

/** Sangens længde i slag (de to stemmer er lige lange – se enhedstesten). */
export function laengde(sang) {
  return sang.melodi.reduce((sum, n) => sum + n[1], 0);
}

/** Lægger én stemmes noder i vinduet [fra, til) ned i `ud`, loopet så tit det skal. */
function stemme(raekke, loop, fra, til, navn, ud) {
  if (loop <= 0) return;
  for (let start = Math.floor(fra / loop) * loop; start < til; start += loop) {
    let t = start;
    for (const [midi, l] of raekke) {
      if (midi > 0 && t >= fra && t < til) ud.push({ slag: t, midi, laengde: l, stemme: navn });
      t += l;
    }
  }
}

/** Trommeslagene i vinduet – de gentager sig hver TAKT, uafhængigt af sangens længde. */
function trommer(sang, fra, til, ud) {
  const m = TROMMER[sang.tromme];
  if (!m) return;
  for (let takt = Math.floor(fra / TAKT) * TAKT; takt < til; takt += TAKT) {
    for (const navn of ['kick', 'klap', 'hat']) {
      for (const o of m[navn]) {
        const t = takt + o;
        if (t >= fra && t < til) ud.push({ slag: t, midi: 0, laengde: 0.25, stemme: navn });
      }
    }
  }
}

/**
 * Alt, der skal lyde mellem slag `fra` (med) og slag `til` (uden) – melodi, bas
 * og trommer, sorteret efter tid. Slagene tælles fra sangens begyndelse og
 * bliver ved med at vokse; funktionen folder selv loopet ud, så den der spiller
 * kun skal huske, hvor langt frem den har planlagt.
 */
export function toner(sang, fra, til) {
  const ud = [];
  if (!sang || !(til > 0)) return ud;
  const a = Math.max(0, fra);
  if (til <= a) return ud;
  const loop = laengde(sang);
  stemme(sang.melodi, loop, a, til, 'melodi', ud);
  stemme(sang.bas, loop, a, til, 'bas', ud);
  trommer(sang, a, til, ud);
  return ud.sort((x, y) => x.slag - y.slag);
}

/** En tom pose: ingen sedler trukket endnu, ingen sang spillet endnu. */
export function nyPose() {
  return { rest: [], sidste: -1 };
}

/**
 * Trækker næste sang som en seddel af posen. Er posen tom, fyldes den med alle
 * sangene undtagen den, der lige har spillet – så kommer alle sangene, før
 * nogen kommer igen, og man hører aldrig den samme to runder i træk.
 * Giver `{ nr, rest, sidste }`; `rest` og `sidste` er posen til næste gang.
 */
export function traekSang(pose, rnd = Math.random) {
  const sidste = pose && Number.isInteger(pose.sidste) ? pose.sidste : -1;
  let rest = (pose && Array.isArray(pose.rest) ? pose.rest : [])
    .filter(n => Number.isInteger(n) && n >= 0 && n < SANGE.length);
  if (!rest.length) {
    rest = SANGE.map((_, i) => i).filter(i => SANGE.length < 2 || i !== sidste);
  }
  const k = Math.min(rest.length - 1, Math.max(0, Math.floor(rnd() * rest.length)));
  const nr = rest[k];
  return { nr, rest: rest.filter((_, i) => i !== k), sidste: nr };
}
