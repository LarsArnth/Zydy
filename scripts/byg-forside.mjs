// Bygger forsidens kort og spil-registret ud fra ét kort pr. mappe.
//
//   node scripts/byg-forside.mjs          skriver de genererede filer
//   node scripts/byg-forside.mjs --tjek   siger fra hvis de er forældede (bruges af testen)
//
// Sandheden om et spil bor i spillets egen mappe:
//
//   public/spil/<id>/kort.json   navn, beskrivelse, nøgleord, url, orden og evt. topliste-regler
//   public/spil/<id>/ikon.svg    ikonet på forsidens kort
//
// og herfra genereres:
//
//   public/index.html   kort-listen inde i <ul id="apps"> (mellem markøren og </ul>)
//   src/spil-data.mjs   KORT + SPIL, som Workeren bruger til topliste og aktivitet
//
// Pointen er, at et nyt spil kun kræver en ny mappe. Før stod det samme spil
// tre steder i hånden — forsiden, SPIL i highscore.mjs og FORSIDE_SPIL i
// aktivitet.mjs — og fordi Lars kører flere Claude-sessioner samtidig, stødte
// de hele tiden sammen i præcis de tre filer. Nu er de genererede: støder to
// grene alligevel sammen, tager man bare den ene side og kører scriptet igen.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const rod = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SPIL_MAPPE = path.join(rod, 'public/spil');
const MARKØR = '    <!-- Kortene herunder er genereret af scripts/byg-forside.mjs ud fra public/spil/*/kort.json — ret ikke i hånden. -->';

/** Læser alle kort.json + ikon.svg, sorteret efter orden (og id ved uafgjort). */
export function læsKort() {
  const kort = [];
  for (const id of readdirSync(SPIL_MAPPE).sort()) {
    const fil = path.join(SPIL_MAPPE, id, 'kort.json');
    if (!existsSync(fil)) continue;                       // mappe uden kort (fx aktivitet.js ligger løst)
    const k = JSON.parse(readFileSync(fil, 'utf8'));
    const ikon = path.join(SPIL_MAPPE, id, 'ikon.svg');
    if (!existsSync(ikon)) throw new Error(`${id}: kort.json uden ikon.svg`);
    for (const felt of ['navn', 'beskrivelse', 'url']) {
      if (!k[felt]) throw new Error(`${id}/kort.json mangler "${felt}"`);
    }
    kort.push({ id, ...k, ikon: readFileSync(ikon, 'utf8').trimEnd() });
  }
  kort.sort((a, b) => (a.orden ?? 999) - (b.orden ?? 999) || a.id.localeCompare(b.id));
  return kort;
}

const undvig = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Ét <li> som det står i index.html. Formen skal blive: /ideer.js hænger sine
 *  knapper på li[data-spil] og læser titlen i <h2>, og /soeg.js søger i <h2>,
 *  <p> og data-noegleord. */
function liFor(k) {
  const ikon = k.ikon.split('\n').map(l => (l ? '        ' + l : l)).join('\n');
  const noegleord = (k.nøgleord || []).join(', ');
  return `    <li data-spil="${k.id}"${k.ekstern ? ' data-ekstern' : ''}${k.sammen ? ' data-sammen' : ''}${k.kapløb ? ' data-kaploeb' : ''}${noegleord ? ` data-noegleord="${undvig(noegleord).replace(/"/g, '&quot;')}"` : ''}><a class="app" href="${k.url}">
      <span class="icon" aria-hidden="true">
${ikon}
      </span>
      <span class="text">
        <h2>${undvig(k.navn)}</h2>
        <p>${undvig(k.beskrivelse)}</p>${k.mærkat ? `\n        <span class="tag">${undvig(k.mærkat)}</span>` : ''}
        <span class="meta"></span>
      </span>
      <span class="go" aria-hidden="true">›</span>
    </a></li>`;
}

/** index.html med kort-listen skiftet ud. */
export function byggetForside(kort) {
  const html = readFileSync(path.join(rod, 'public/index.html'), 'utf8');
  const start = html.indexOf('<ul class="apps" id="apps">');
  if (start < 0) throw new Error('public/index.html: fandt ikke <ul class="apps" id="apps">');
  const fra = html.indexOf('\n', start) + 1;
  const til = html.indexOf('  </ul>', fra);
  if (til < 0) throw new Error('public/index.html: fandt ikke </ul> efter kort-listen');
  return html.slice(0, fra) + MARKØR + '\n\n' + kort.map(liFor).join('\n\n') + '\n' + html.slice(til);
}

/** src/spil-data.mjs — det Workeren har brug for. */
export function byggetData(kort) {
  const spil = {};
  for (const k of kort) {
    if (!k.højscore) continue;
    // Ét spil med flere tilstande får én nøgle pr. tilstand: saet → saet-klassisk, saet-blitz.
    const flerTilstand = Object.values(k.højscore).every(v => v && typeof v === 'object');
    if (flerTilstand) for (const [t, regler] of Object.entries(k.højscore)) spil[`${k.id}-${t}`] = regler;
    else spil[k.id] = k.højscore;
  }
  // Enkeltcitationstegn og navngivne nøgler, så den genererede fil ligner resten af src/.
  const str = s => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  const værdi = v => (typeof v === 'string' ? str(v) : String(v));
  const nøgle = n => (/^[a-zæøå][a-zæøå0-9]*$/.test(n) ? n : str(n));
  const linje = ([navn, regler]) =>
    `  ${nøgle(navn)}: { ${Object.entries(regler).map(([k, v]) => `${k}: ${værdi(v)}`).join(', ')} },`;
  return `// GENERERET af scripts/byg-forside.mjs ud fra public/spil/*/kort.json — ret ikke i hånden.
// Kør \`node scripts/byg-forside.mjs\` efter du har ændret et kort.json.

/** Kortene på forsiden, i den rækkefølge de står før popularitets-sorteringen. */
export const KORT = [
${kort.map(k => `  { id: ${str(k.id)}, navn: ${str(k.navn)}, url: ${str(k.url)}${k.ekstern ? ', ekstern: true' : ''} },`).join('\n')}
];

/** Spil med online topliste. Nøglen er spillets id, eller <id>-<tilstand> hvis
 *  spillet har flere lister. retning 'asc' = laveste score vinder; min/maks er
 *  grænserne for en troværdig score; unik: false tillader samme navn flere gange. */
export const SPIL = {
${Object.entries(spil).map(linje).join('\n')}
};

/** Spil to venner kan spille sammen over nettet ("sammen": true i kort.json).
 *  src/rum.mjs bruger listen, og forsiden kender dem på data-sammen på kortet. */
export const SAMMEN = [${kort.filter(k => k.sammen).map(k => str(k.id)).join(', ')}];

/** Spil to venner kan tage et kapløb i: samme spil, hver sin telefon, bedste
 *  runde vinder ("kapløb": true i kort.json). Forsiden kender dem på
 *  data-kaploeb, og de må inviteres til gennem /api/rum ligesom SAMMEN. */
export const KAPLOEB = [${kort.filter(k => k.kapløb).map(k => str(k.id)).join(', ')}];
`;
}

const filer = () => {
  const kort = læsKort();
  return [
    [path.join(rod, 'public/index.html'), byggetForside(kort)],
    [path.join(rod, 'src/spil-data.mjs'), byggetData(kort)],
  ];
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const tjek = process.argv.includes('--tjek');
  let forældede = 0;
  for (const [fil, indhold] of filer()) {
    const nuværende = existsSync(fil) ? readFileSync(fil, 'utf8') : null;
    if (nuværende === indhold) continue;
    if (tjek) { console.error(`FORÆLDET: ${path.relative(rod, fil)} — kør: node scripts/byg-forside.mjs`); forældede++; }
    else { writeFileSync(fil, indhold); console.log(`skrevet: ${path.relative(rod, fil)}`); }
  }
  if (tjek && forældede) process.exit(1);
  if (tjek) console.log('Forsiden og spil-data er i sync med kortene.');
}
