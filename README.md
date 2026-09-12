# zydy.dk – overblikssiden

Forsiden på **<https://zydy.dk>**: en liste med familiens apps og spil, så
børnene bare skal huske ét domæne. Siden er statisk HTML uden build og uden
afhængigheder. De store apps bor i egne repoer og linkes til; otte spil
ligger direkte her under `public/spil/`. Den eneste server-kode er et lille
højscore-API (`src/`), se [Online topliste](#online-topliste).

| App | Hvor den kører | Kode |
|---|---|---|
| Ordle | <https://larsarnth.github.io/ordle/> (GitHub Pages) | `../Ordle` |
| Taltræf | <https://larsarnth.github.io/taltraef/> (GitHub Pages) | `../iPhoneSpil` |
| Imposter | <https://larsarnth.github.io/Imposter/> (GitHub Pages) | `../Imposter` |
| KlaverLær | <https://klaver.zydy.dk> (Cloudflare Worker + Access) | `../KlaverApp` |

## Spil der bor her

Ud over links til de andre apps huser repoet otte spil under `public/spil/<navn>/`
uden afhængigheder eller build (alle én HTML-fil, undtagen Stenalder og Dybet, der er tre). De udrulles sammen
med forsiden og ligger på `https://zydy.dk/spil/<navn>/`:

| Spil | Sti | Hvad |
|---|---|---|
| Tårn | `public/spil/taarn/` | Stack-arcade på canvas: tryk for at slippe blokken, overhæng skæres af, perfekte drops giver bonus. Et par sekunder efter slutskærmen svajer tårnet og falder fra hinanden (slås fra ved `prefers-reduced-motion`). Online topliste (top 10) med navn. |
| Sæt | `public/spil/saet/` | Kortspillet Set på dansk: find tre kort hvor antal, form, farve og fyld er helt ens eller helt forskellige. Klassisk og Blitz. |
| Farvesortering | `public/spil/farvesortering/` | Water sort: hæld farvet væske til hvert glas har én farve. Uendelige, solver-verificerede niveauer. |
| Ordstige | `public/spil/ordstige/` | Word ladder: skift ét bogstav ad gangen til et rigtigt dansk ord. Dagens stige + tilfældige. Ordlisten er Ordles (Stavekontrolden, GPL/LGPL/MPL). |
| Duel | `public/spil/duel/` | To spillere på én telefon, skærmen delt i to: fem reflex-minispil, først til 3/5/10 point. |
| Stenalder | `public/spil/stenalder/` | Hot-seat-udgave af brætspillet Stone Age for 2-4 spillere på én iPad. Tre filer uden build: `regler.mjs` (regelmotor, ren JS), `data.mjs` (kort og bygninger) og `index.html` (UI). Gemmer spillet i `localStorage`, så det kan genoptages. |
| Helteriget | `public/spil/helteriget/` | Deck-building-kortspil for to på én iPad (Hero Realms-mekanik, egne danske kort): 80 markedskort i fire fraktioner, helte med vagter, allierede og ofringer. Hot-seat med overleveringsskærm, så hænderne forbliver hemmelige; igangværende spil gemmes i `localStorage`. |
| Dybet | `public/spil/dybet/` | Dungeon crawler i Wolfenstein-3D-stil (raycaster på canvas) med Pokémon-agtig turbaseret kamp. Procedurelt genererede labyrinter (altid en vej til trappen), monstre der står stille og spærrer gange, kister med udstyr, evner og potioner; minimap viser kun det udforskede. Spillet går selv, indtil vejen deler sig, og viser så flydende valgknapper. Score = dybde nået, online topliste. Tre filer: `motor.mjs` (regler, enhedstestet), `sprites.mjs` (pixel-art som tekst), `index.html`. |

Alle spil gemmer highscore/fremskridt i `localStorage` under `zydy.<navn>.*`,
kan seedes med `?seed=123` og eksponerer `window.GAME` til tests.

### Online topliste

Slår man sig ind i top 10, kan man skrive sit navn og komme permanent på
listen, som alle kan se. Det kører på Cloudflares gratis tier og består af
tre dele:

| Del | Fil | Hvad |
|---|---|---|
| Database | Cloudflare **D1** `zydy-highscore` (SQLite), skema i `schema.sql` | Én tabel `scores(spil, navn, score, oprettet)`. Kun de bedste 100 pr. spil beholdes. |
| API | `src/worker.mjs` → `src/highscore.mjs` | `GET /api/highscore/<spil>` giver top 10, `POST` med `{navn, score}` gemmer og svarer med placering. Navne renses og klippes til 12 tegn, scoren skal være et heltal under spillets maks (`SPIL` i `highscore.mjs`). |
| Klient | `public/spil/highscore.js` | `Highscore.panel(el, { spil, score })` henter listen, viser navneformular hvis scoren kvalificerer, sender ind og viser listen med egen række fremhævet. Uden `score` vises bare listen. Navnet huskes i `localStorage` (`zydy.navn`) på tværs af spil. |

Worker'en rammer kun `/api/*` (`run_worker_first` i `wrangler.jsonc`); alt
andet serveres som før direkte fra `public/`. API'et er åbent uden login –
det er et familie-site – så værnet mod pjat er kun validering og trimning.
Skulle listen blive fyldt med skrald:

```bash
npx wrangler@4 d1 execute zydy-highscore --remote --command "DELETE FROM scores WHERE spil='taarn'"
```

**Tilføj topliste til et nyt spil:** (1) tilføj spillet i `SPIL` i
`src/highscore.mjs` med en fornuftig maks-score, (2) indlæs
`<script src="/spil/highscore.js"></script>` i spillet, (3) kald
`Highscore.panel(...)` på slutskærmen og evt. uden score på startskærmen.
Tårn er forbilledet. Skemaet skal kun køres én gang (er gjort):

```bash
npx wrangler@4 d1 execute zydy-highscore --remote --file schema.sql   # rigtig database
npx wrangler@4 d1 execute zydy-highscore --local  --file schema.sql   # til wrangler dev
```

### Stenalder – regelvalg

Reglerne følger den officielle regelbog (Rio Grande/Hans im Glück 2008),
inkl. begrænsningerne for 2 og 3 spillere, redskabernes faste rækkefølge og
terningkortet (6 = madsporet). Steder, hvor vi selv har valgt:

- **Bygningsbrikkerne er rekonstrueret.** Regelbogen oplyser kun 28 brikker,
  heraf 3 med "1-7" og 8 med fast antal/valgfri slags. Fordelingen i
  `data.mjs` (17 faste 3-ressourcebrikker, 8 variable som 4/5 ressourcer × 1-4
  slags) er et kvalificeret gæt. Ret listen, hvis æsken siger noget andet.
- Point kan ikke gå under 0 ved sult (pointsporet starter i 0).
- Fortryd gælder kun den seneste placering, og kun indtil næste spiller har
  placeret. Terningkast kan ikke fortrydes.
- Man kan afstå fra at betale for et kort eller en bygning (som i reglerne).
- Hjælpen forklarer *hvordan* man spiller, aldrig *hvad* man bør vælge.

### Test

```bash
PLAYWRIGHT=../DungeonCrawler/node_modules/playwright/index.mjs node test/run.mjs          # alle
PLAYWRIGHT=../DungeonCrawler/node_modules/playwright/index.mjs node test/run.mjs taarn    # ét spil
```

```bash
node --test test/unit/*.test.mjs     # Stenalders regelmotor, Dybets motor + højscore-API'et (ingen browser, ~1 sek.)
```

Tårn-testen mocker højscore-API'et med `page.route`, så den kører uden
Cloudflare. API'et selv testes i `test/unit/highscore.test.mjs` med et
hukommelses-lager i stedet for D1. Vil man prøve hele kæden lokalt mod en
lokal D1-database:

```bash
npx wrangler@4 dev --port 8790      # http://localhost:8790/spil/taarn/  (kør schema.sql --local først)
```

`test/run.mjs` starter en lokal server og kører `test/*.test.mjs` i headless
Chromium med iPhone 13-profil: hvert spil spilles igennem via UI og
`window.GAME`, der tjekkes for console-fejl og vandret scroll, og der gemmes et
screenshot i `test/shots/`. Har man `playwright` i `node_modules`, kan
`PLAYWRIGHT` udelades.

## Tilføj en app

Åbn `public/index.html`, kopiér en `<a class="app">…</a>`-blok og ret href,
ikon, navn og undertekst. Push til `main` — så er den live.

## Kør lokalt

```bash
npm run serve      # http://localhost:4175  (kun filerne; toplisten fejler pænt uden API)
npm run dev        # http://localhost:8787  (wrangler dev: filer + API mod lokal D1)
```

## Udrulning

Siden kører som en **Cloudflare Worker** med statiske filer og et lille
script til højscore-API'et (`wrangler.jsonc`), samme opsætning som KlaverApp —
men **uden** Cloudflare Access, for siden skal være åben. Custom domains `zydy.dk` og `www.zydy.dk` peger på workeren `zydy`;
DNS-records oprettes automatisk af wrangler.

**Automatisk:** hvert push til `main` kører
[.github/workflows/deploy.yml](.github/workflows/deploy.yml). Kræver
`CLOUDFLARE_API_TOKEN` som GitHub-secret — samme smalle token som KlaverApp
(Workers Scripts: Edit + Workers Routes: Edit på zonen zydy.dk). Fejler
udrulningen på D1-bindingen, så giv tokenet også `D1: Edit`:

```bash
gh secret set CLOUDFLARE_API_TOKEN --repo LarsArnth/Zydy
```

**Manuelt:**

```bash
export CLOUDFLARE_EMAIL=larsarnth@outlook.com
export CLOUDFLARE_API_KEY=<global API key fra ~/.dsh/skills/cloudflare/SKILL.md>
npm run deploy
```

Se `../KlaverApp/DEPLOY.md` for detaljer om Cloudflare-opsætningen.
