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
  { id: 'lava', navn: 'Gulvet er lava', url: '/spil/lava/' },
  { id: 'kryds', navn: 'Kryds og bolle', url: '/spil/kryds/' },
  { id: 'klodser', navn: 'Klodser', url: '/spil/klodser/' },
  { id: 'kat', navn: 'Min kat', url: '/spil/kat/' },
  { id: 'klaver', navn: 'KlaverLær', url: 'https://klaver.zydy.dk/', ekstern: true },
];

/** Spil med online topliste. Nøglen er spillets id, eller <id>-<tilstand> hvis
 *  spillet har flere lister. retning 'asc' = laveste score vinder; min/maks er
 *  grænserne for en troværdig score; unik: false tillader samme navn flere gange. */
export const SPIL = {
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
  lava: { maks: 3000 },
  klodser: { retning: 'asc', min: 10, maks: 3600 },
  kat: { maks: 50 },
};
