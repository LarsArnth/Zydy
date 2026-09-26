// GENERERET af scripts/byg-forside.mjs ud fra public/spil/*/kort.json — ret ikke i hånden.
// Kør `node scripts/byg-forside.mjs` efter du har ændret et kort.json.

/** Kortene på forsiden, i den rækkefølge de står før popularitets-sorteringen. */
export const KORT = [
  { id: 'ordle', navn: 'Ordle', url: 'https://larsarnth.github.io/ordle/', ekstern: true },
  { id: 'taltraef', navn: 'Taltræf', url: 'https://larsarnth.github.io/taltraef/', ekstern: true },
  { id: 'imposter', navn: 'Imposter', url: 'https://larsarnth.github.io/Imposter/', ekstern: true },
  { id: 'taarn', navn: 'Tårn', url: '/spil/taarn/' },
  { id: 'saet', navn: 'Sæt', url: '/spil/saet/' },
  { id: 'farvesortering', navn: 'Farvesortering', url: '/spil/farvesortering/' },
  { id: 'ordstige', navn: 'Ordstige', url: '/spil/ordstige/' },
  { id: 'duel', navn: 'Duel', url: '/spil/duel/' },
  { id: 'helteriget', navn: 'Helteriget', url: '/spil/helteriget/' },
  { id: 'stenalder', navn: 'Stenalder', url: '/spil/stenalder/' },
  { id: 'dybet', navn: 'Dybet', url: '/spil/dybet/' },
  { id: 'obby', navn: 'Obby', url: '/spil/obby/' },
  { id: 'storeobby', navn: 'Store Obby', url: '/spil/storeobby/' },
  { id: 'lava', navn: 'Gulvet er lava', url: '/spil/lava/' },
  { id: 'kryds', navn: 'Kryds og bolle', url: '/spil/kryds/' },
  { id: 'klodser', navn: 'Klodser', url: '/spil/klodser/' },
  { id: 'kat', navn: 'Min kat', url: '/spil/kat/' },
  { id: 'miskmask', navn: 'Miskmask', url: '/spil/miskmask/' },
  { id: 'blokblast', navn: 'Blokblast', url: '/spil/blokblast/' },
  { id: 'klaver', navn: 'KlaverLær', url: 'https://klaver.zydy.dk/', ekstern: true },
  { id: 'slotskamp', navn: 'Slotskamp', url: '/spil/slotskamp/' },
  { id: 'weee', navn: 'Weeee!', url: '/spil/weee/' },
  { id: 'legebyen', navn: 'Legebyen', url: '/spil/legebyen/' },
  { id: 'mitliv', navn: 'Mit liv', url: '/spil/mitliv/' },
  { id: 'papir', navn: 'Papirøen', url: '/spil/papir/' },
  { id: 'hund', navn: 'Min hund', url: '/spil/hund/' },
  { id: 'fisk', navn: 'Fiskedybet', url: '/spil/fisk/' },
  { id: 'copyright', navn: 'Copyright', url: '/spil/copyright/' },
  { id: 'klaverregn', navn: 'Klaverregn', url: '/spil/klaverregn/' },
  { id: 'sejl', navn: 'Til søs!', url: '/spil/sejl/' },
  { id: 'flaske', navn: 'Flaskehavet', url: '/spil/flaske/' },
  { id: 'slanger', navn: 'Slanger', url: '/spil/slanger/' },
  { id: 'kaempetal', navn: 'Kæmpetal', url: '/spil/kaempetal/' },
  { id: 'elementer', navn: 'Elementløbet', url: '/spil/elementer/' },
  { id: 'pjat', navn: 'Pjattemaskinen', url: '/spil/pjat/' },
  { id: 'straffe', navn: 'Straffespark', url: '/spil/straffe/' },
  { id: 'fjolle', navn: 'Fjolle-Obby', url: '/spil/fjolle/' },
  { id: 'taarnforsvar', navn: 'Tårnforsvar', url: '/spil/taarnforsvar/' },
  { id: 'baseforsvar', navn: 'Baseforsvar', url: '/spil/baseforsvar/' },
  { id: 'tube', navn: 'ZydyTube', url: '/spil/tube/' },
  { id: 'bombe', navn: 'Pass or Die', url: '/spil/bombe/' },
];

/** Spil med online topliste. Nøglen er spillets id, eller <id>-<tilstand> hvis
 *  spillet har flere lister. retning 'asc' = laveste score vinder; min/maks er
 *  grænserne for en troværdig score; unik: false tillader samme navn flere gange. */
export const SPIL = {
  ordle: { maks: 3650 },
  taarn: { maks: 2000 },
  'saet-klassisk': { retning: 'asc', min: 20, maks: 10800 },
  'saet-blitz': { maks: 60 },
  farvesortering: { maks: 10000 },
  ordstige: { maks: 5000 },
  duel: { retning: 'asc', min: 80, maks: 2000 },
  helteriget: { retning: 'asc', maks: 300 },
  stenalder: { maks: 2000 },
  dybet: { maks: 500 },
  obby: { maks: 10000, unik: true },
  storeobby: { maks: 500, unik: true },
  lava: { maks: 3000 },
  klodser: { retning: 'asc', min: 10, maks: 3600 },
  kat: { maks: 50 },
  miskmask: { maks: 500, unik: true },
  blokblast: { maks: 200000, unik: true },
  slotskamp: { maks: 200, unik: true },
  weee: { maks: 20000, unik: true },
  mitliv: { maks: 1000000, unik: true },
  papir: { maks: 100, unik: true },
  hund: { maks: 50 },
  fisk: { maks: 60, unik: true },
  copyright: { maks: 1000 },
  klaverregn: { maks: 5000, unik: true },
  sejl: { maks: 20000 },
  flaske: { maks: 2000 },
  slanger: { maks: 1024, unik: true },
  kaempetal: { maks: 9999999999999, unik: true },
  elementer: { maks: 2000 },
  pjat: { maks: 24, unik: true },
  straffe: { maks: 200, unik: true },
  fjolle: { retning: 'asc', min: 30, maks: 5400, unik: true },
  taarnforsvar: { maks: 200, unik: true },
  baseforsvar: { maks: 200, unik: true },
  tube: { maks: 1000000000, unik: true },
  bombe: { maks: 500, unik: true },
};

/** Spil to venner kan spille sammen over nettet ("sammen": true i kort.json).
 *  src/rum.mjs bruger listen, og forsiden kender dem på data-sammen på kortet. */
export const SAMMEN = ['dybet', 'kryds', 'papir', 'slanger', 'kaempetal'];

/** Spil to venner kan tage et kapløb i: samme spil, hver sin telefon, bedste
 *  runde vinder ("kapløb": true i kort.json). Forsiden kender dem på
 *  data-kaploeb, og de må inviteres til gennem /api/rum ligesom SAMMEN. */
export const KAPLOEB = ['taarn', 'saet', 'farvesortering', 'duel', 'obby', 'storeobby', 'lava', 'klodser', 'miskmask', 'blokblast', 'slotskamp', 'weee', 'klaverregn', 'sejl', 'flaske', 'elementer', 'straffe', 'fjolle', 'taarnforsvar', 'baseforsvar', 'bombe'];
