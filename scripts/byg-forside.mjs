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
//   public/index.html          kort-listen inde i <ul id="apps"> (mellem markøren og </ul>)
//   src/spil-data.mjs          KORT + SPIL, som Workeren bruger til topliste og aktivitet
//   public/offline-filer.json  alt hvad der skal ligge på telefonen, så siden
//                              virker uden internet (public/sw.js henter listen)
//
// Pointen er, at et nyt spil kun kræver en ny mappe. Før stod det samme spil
// tre steder i hånden — forsiden, SPIL i highscore.mjs og FORSIDE_SPIL i
// aktivitet.mjs — og fordi Lars kører flere Claude-sessioner samtidig, stødte
// de hele tiden sammen i præcis de tre filer. Nu er de genererede: støder to
// grene alligevel sammen, tager man bare den ene side og kører scriptet igen.
import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const rod = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OFFENTLIG = path.join(rod, 'public');
const SPIL_MAPPE = path.join(rod, 'public/spil');
const OFFLINE_FIL = 'offline-filer.json';
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
 *  <p> og data-noegleord. Genvejslinket fra "alternativ" skal stå EFTER
 *  <a class="app">, for flere scripts tager kortets link med querySelector('a')
 *  og regner med at få det første. */
function liFor(k, efterId) {
  const ikon = k.ikon.split('\n').map(l => (l ? '        ' + l : l)).join('\n');
  const noegleord = (k.nøgleord || []).join(', ');
  const mål = k.alternativ && efterId.get(k.alternativ.spil);
  const alt = k.alternativ
    ? `\n    <a class="alt" href="${mål.url}">${undvig(k.alternativ.tekst)}: <b>${undvig(mål.navn)}</b> ›</a>` : '';
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
    </a>${alt}</li>`;
}

/** index.html med kort-listen skiftet ud. */
export function byggetForside(kort) {
  const efterId = new Map(kort.map(k => [k.id, k]));
  // "alternativ" er et genvejslink under kortet til et spil her på sitet, der
  // kan det samme uden login — fx Klaverregn under KlaverLær, som beder om en
  // kode på mail, når man ikke er hjemme (Livas ønske #45).
  for (const k of kort) {
    if (!k.alternativ) continue;
    if (!k.alternativ.tekst) throw new Error(`${k.id}: "alternativ" mangler "tekst"`);
    if (!efterId.has(k.alternativ.spil)) throw new Error(`${k.id}: "alternativ" peger på "${k.alternativ.spil}", som ikke findes`);
  }
  const html = readFileSync(path.join(rod, 'public/index.html'), 'utf8');
  const start = html.indexOf('<ul class="apps" id="apps">');
  if (start < 0) throw new Error('public/index.html: fandt ikke <ul class="apps" id="apps">');
  const fra = html.indexOf('\n', start) + 1;
  const til = html.indexOf('  </ul>', fra);
  if (til < 0) throw new Error('public/index.html: fandt ikke </ul> efter kort-listen');
  return html.slice(0, fra) + MARKØR + '\n\n' + kort.map(k => liFor(k, efterId)).join('\n\n') + '\n' + html.slice(til);
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

/**
 * public/offline-filer.json — listen over alt under public/, som kan lægges på
 * telefonen, så siden virker uden internet (Selmas ønske #56).
 *
 * Listen er delt i to, fordi de to halvdele hentes på hvert sit tidspunkt:
 * `skal` er forsiden og de fælles scripts, som service workeren lægger ned med
 * det samme, og `spil` er de 34 spilmapper, som først hentes, når man trykker
 * «Hent alle spil». Et spil skal derfor stadig kun røre sin egen mappe — det
 * havner her af sig selv, næste gang generatoren køres.
 *
 * `version` er en hash af alt indholdet. Den er nøglen til, at siden kan
 * opdatere sig selv uden at hente noget som helst hver gang: service workeren
 * henter kun denne ene lille fil og kan se på versionen, om det, der ligger på
 * telefonen, stadig er det rigtige.
 *
 * `nyIndhold` er de filer, vi lige har bygget i samme kørsel (index.html), så
 * versionen regnes ud fra det, der bliver skrevet, og ikke det der lå før —
 * ellers ville `--tjek` sige forældet i én kørsel og i sync i den næste.
 */
export function byggetOffline(nyIndhold = {}) {
  const fundet = [];
  const gaa = (mappe, praefiks) => {
    for (const navn of readdirSync(mappe).sort()) {
      const fuld = path.join(mappe, navn);
      if (statSync(fuld).isDirectory()) { gaa(fuld, praefiks + navn + '/'); continue; }
      if (praefiks === '/' && navn === OFFLINE_FIL) continue;          // listen selv
      // Browseren beder om mappen, ikke om index.html, og cachen slår op på
      // adressen — så /spil/obby/index.html skal stå som /spil/obby/.
      const url = navn === 'index.html' ? praefiks : praefiks + navn;
      fundet.push({ url, sti: praefiks + navn });
    }
  };
  gaa(OFFENTLIG, '/');

  const hash = createHash('sha1');
  for (const { url, sti } of fundet) {
    hash.update(url + '\0');
    hash.update(nyIndhold[sti] ?? readFileSync(path.join(OFFENTLIG, sti.slice(1))));
    hash.update('\0');
  }

  // Alt inde i en spilmappe er et spil: /spil/obby/ og /spil/dybet/motor.mjs.
  // De fælles filer, der ligger løst i /spil/ (aktivitet.js, highscore.js,
  // rum.js …), hører til skallen sammen med forsiden. Bemærk at den afsluttende
  // skråstreg skal tælle med — ellers ryger spillenes egne sider (/spil/obby/)
  // over i skallen og bliver hentet ned hos alle, også dem der ikke bad om det.
  const erSpil = u => u.startsWith('/spil/') && u.slice('/spil/'.length).includes('/');
  const urler = fundet.map(f => f.url).sort();
  return JSON.stringify({
    _om: 'GENERERET af scripts/byg-forside.mjs — ret ikke i hånden. Alt hvad public/sw.js kan lægge på telefonen, så zydy.dk virker uden internet. "version" er en hash af indholdet: ændrer den sig, henter service workeren det nye ned.',
    version: hash.digest('hex').slice(0, 12),
    skal: urler.filter(u => !erSpil(u)),
    spil: urler.filter(erSpil),
  }, null, 2) + '\n';
}

const filer = () => {
  const kort = læsKort();
  const html = byggetForside(kort);
  return [
    [path.join(rod, 'public/index.html'), html],
    [path.join(rod, 'src/spil-data.mjs'), byggetData(kort)],
    // Skal stå sidst: versionen er en hash af de andre generede filers indhold.
    [path.join(OFFENTLIG, OFFLINE_FIL), byggetOffline({ '/index.html': html })],
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
