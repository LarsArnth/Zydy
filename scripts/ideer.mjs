// Henter idéer og ønsker fra zydy.dk ned i terminalen:
//
//   npm run ideer                 pænt overblik over de uløste, nyeste først
//   npm run ideer -- --alle       også dem der er løst (med ✓ og hvad der blev lavet)
//   npm run ideer -- --json       rå JSON (fx til at give videre til en AI)
//   npm run ideer -- --nyt        kun forslag til nye spil
//   npm run ideer -- --oensker    kun ønsker til de spil der findes
//   npm run ideer -- --antal 50   højst 50 (standard: alle, dvs. op til 500)
//
// Kolonnen `loest` sættes af feedback-loopet i rodmappen (../zydy-feedback-loop.mjs),
// som selv sender en Claude-arbejder afsted på de uløste ønsker.
//
// Data kommer fra tabellen `ideer` i D1-databasen zydy-highscore (skrevet af
// src/ideer.mjs). Scriptet går uden om Worker'en og spørger databasen direkte
// med wrangler, så der ikke skal være et offentligt endepunkt, der kan læse dem.
//
// Kræver Cloudflare-legitimation i miljøet – de samme som til deploy:
//   export CLOUDFLARE_EMAIL=...    (se ~/.dsh/skills/cloudflare)
//   export CLOUDFLARE_API_KEY=...
//
// Er en idé bygget færdig eller bare pjat, så slet den:
//   npx wrangler@4 d1 execute zydy-highscore --remote --command "DELETE FROM ideer WHERE id = 42"
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const har = f => args.includes(f);
const vaerdi = (f, standard) => { const i = args.indexOf(f); return i === -1 ? standard : args[i + 1]; };

const antal = Math.max(1, Math.min(500, Number(vaerdi('--antal', 500)) || 500));
const kunNyt = har('--nyt');
const kunOensker = har('--oensker') || har('--ønsker');
const ogsaaLoeste = har('--alle');
const krav = [];
if (kunNyt) krav.push("slags = 'nyt'");
if (kunOensker) krav.push("slags = 'oenske'");
if (!ogsaaLoeste) krav.push('loest IS NULL');
const hvor = krav.length ? `WHERE ${krav.join(' AND ')} ` : '';
const sql = `SELECT id, slags, spil, navn, tekst, oprettet, loest, loesning FROM ideer ${hvor}ORDER BY id DESC LIMIT ${antal}`;

let ud;
try {
  ud = execFileSync('npx', ['--yes', 'wrangler@4', 'd1', 'execute', 'zydy-highscore', '--remote', '--json', '--command', sql],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
} catch (e) {
  console.error('\nKunne ikke spørge databasen. Har du CLOUDFLARE_EMAIL og CLOUDFLARE_API_KEY i miljøet?');
  process.exit(1);
}

// wrangler skriver af og til en linje eller to før JSON'en; find selve svaret.
const start = ud.indexOf('[');
let raekker;
try {
  const svar = JSON.parse(ud.slice(start === -1 ? 0 : start));
  raekker = (Array.isArray(svar) ? svar : [svar]).flatMap(s => s.results || []);
} catch (e) {
  console.error('Uventet svar fra wrangler:\n' + ud);
  process.exit(1);
}

if (har('--json')) {
  console.log(JSON.stringify(raekker, null, 2));
  process.exit(0);
}

const dato = s => {
  const d = new Date(s);
  return isNaN(d) ? s : d.toLocaleString('da-DK', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};
const stort = s => s.charAt(0).toUpperCase() + s.slice(1);

function skriv(titel, liste, medSpil) {
  console.log(`\n\x1b[1m${titel} (${liste.length})\x1b[0m`);
  if (!liste.length) { console.log('  – ingen endnu –'); return; }
  for (const r of liste) {
    const hoved = [medSpil ? stort(r.spil || '?') : null, r.navn, dato(r.oprettet)].filter(Boolean).join(' · ');
    console.log(`\n  \x1b[33m#${r.id}\x1b[0m  ${hoved}`);
    for (const linje of String(r.tekst).split('\n')) console.log('    ' + linje);
    if (r.loest) console.log(`    \x1b[32m✓ ${dato(r.loest)}: ${r.loesning || 'løst'}\x1b[0m`);
  }
}

if (!kunOensker) skriv('Idéer til nye spil', raekker.filter(r => r.slags === 'nyt'), false);
if (!kunNyt) skriv('Ønsker til spillene', raekker.filter(r => r.slags === 'oenske'), true);
console.log('');
