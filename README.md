# zydy.dk – overblikssiden

Forsiden på **<https://zydy.dk>**: en liste med familiens apps og spil, så
børnene bare skal huske ét domæne. Siden er statisk HTML uden build og uden
afhængigheder. De store apps bor i egne repoer og linkes til; ti spil
ligger direkte her under `public/spil/`. Den eneste server-kode er to små
API'er (`src/`): en [online topliste](#online-topliste) og
[hvor tit spillene spilles](#populaere-spil-og-spiller-nu).

| App | Hvor den kører | Kode |
|---|---|---|
| Ordle | <https://larsarnth.github.io/ordle/> (GitHub Pages) | `../Ordle` |
| Taltræf | <https://larsarnth.github.io/taltraef/> (GitHub Pages) | `../iPhoneSpil` |
| Imposter | <https://larsarnth.github.io/Imposter/> (GitHub Pages) | `../Imposter` |
| KlaverLær | <https://klaver.zydy.dk> (Cloudflare Worker + Access) | `../KlaverApp` |

## Spil der bor her

Ud over links til de andre apps huser repoet ti spil under `public/spil/<navn>/`
uden afhængigheder eller build (alle én HTML-fil, undtagen Stenalder og Dybet, der er tre,
og Kryds og bolle, der er to). De udrulles sammen
med forsiden og ligger på `https://zydy.dk/spil/<navn>/`:

| Spil | Sti | Hvad |
|---|---|---|
| Tårn | `public/spil/taarn/` | Stack-arcade på canvas: tryk for at slippe blokken, overhæng skæres af, perfekte drops giver bonus. Et par sekunder efter slutskærmen svajer tårnet og falder fra hinanden (slås fra ved `prefers-reduced-motion`). Online topliste (top 10) med navn. |
| Sæt | `public/spil/saet/` | Kortspillet Set på dansk: find tre kort hvor antal, form, farve og fyld er helt ens eller helt forskellige. Klassisk og Blitz. Online topliste pr. tilstand (hurtigste tid / flest sæt). |
| Farvesortering | `public/spil/farvesortering/` | Water sort: hæld farvet væske til hvert glas har én farve. Uendelige, solver-verificerede niveauer. Online topliste: højeste niveau løst, sendt ind når man når et nyt personligt højeste. |
| Ordstige | `public/spil/ordstige/` | Word ladder: skift ét bogstav ad gangen til et rigtigt dansk ord. Dagens stige + tilfældige. Ordlisten er Ordles (Stavekontrolden, GPL/LGPL/MPL). Online topliste: flest dage i træk med dagens stige. |
| Duel | `public/spil/duel/` | To spillere på én telefon, skærmen delt i to: fem reflex-minispil, først til 3/5/10 point. Online topliste: hurtigste reaktion i «Grønt lys», målt fra skærmen bliver grøn til trykket lander (under 80 ms tæller ikke). |
| Stenalder | `public/spil/stenalder/` | Hot-seat-udgave af brætspillet Stone Age for 2-4 spillere på én iPad. Tre filer uden build: `regler.mjs` (regelmotor, ren JS), `data.mjs` (kort og bygninger) og `index.html` (UI). Gemmer spillet i `localStorage`, så det kan genoptages. Online topliste: vinderens point, gemt under det navn spilleren selv skrev på startskærmen. |
| Helteriget | `public/spil/helteriget/` | Deck-building-kortspil for to på én iPad (Hero Realms-mekanik, egne danske kort): 80 markedskort i fire fraktioner, helte med vagter, allierede og ofringer. Hot-seat med overleveringsskærm, så hænderne forbliver hemmelige; igangværende spil gemmes i `localStorage`. Online topliste: vundet på færrest ture. |
| Dybet | `public/spil/dybet/` | Dungeon crawler i Wolfenstein-3D-stil (raycaster på canvas) med Pokémon-agtig turbaseret kamp. Procedurelt genererede labyrinter (altid en vej til trappen), monstre der står stille og spærrer gange, kister med udstyr, evner og potioner; minimap viser kun det udforskede. Spillet går selv, indtil vejen deler sig, og viser så flydende valgknapper. Score = dybde nået, online topliste. Tre filer: `motor.mjs` (regler, enhedstestet), `sprites.mjs` (pixel-art som tekst), `index.html`. |
| Kryds og bolle | `public/spil/kryds/` | Klassisk tre på stribe, hot-seat for to på samme skærm eller mod computeren i tre sværhedsgrader: Nem (spiller mest tilfældigt og overser trusler), Mellem (vinder og blokerer, men vælger hvert andet træk tilfældigt) og Svær (perfekt minimax – kan ikke slås). Startspilleren skifter for hvert parti, så begge får fordelen. To filer: `motor.mjs` (regler + computerspiller, enhedstestet) og `index.html`. Ingen topliste – der er ikke noget at måle i. |
| Obby | `public/spil/obby/` | One-button-platformspil på canvas: hop fra flyvende firkant til flyvende firkant med mellemrum eller et tryk. Rød laser på hver anden firkant, lava i bunden, checkpoint på hver femte, og TRY AGAIN når man dør. Banen er uendelig og genereres, så hvert spring kan nås (bot-testet i `test/obby.test.mjs`) — også ved den høje fart, for farten stiger, jo længere man kommer, og banen genereres ud fra netop den fart. Man får 1 coin pr. ny firkant (vist i højre hjørne) og kan købe blandt 14 skins til højst 100 coins, nogle med hat; butikken kan åbnes midt i et løb og fryser spillet imens. Score = hop i træk uden at dø; navnet skrives på startskærmen, og en ny rekord ryger selv på toplisten. |

Alle spil gemmer highscore/fremskridt i `localStorage` under `zydy.<navn>.*`,
kan seedes med `?seed=123` og eksponerer `window.GAME` til tests.

### Online topliste

Slår man sig ind i top 10, kan man skrive sit navn og komme permanent på
listen, som alle kan se. Det kører på Cloudflares gratis tier og består af
tre dele:

| Del | Fil | Hvad |
|---|---|---|
| Database | Cloudflare **D1** `zydy-highscore` (SQLite), skema i `schema.sql` | Én tabel `scores(spil, navn, score, oprettet, token)`. Hvert navn står kun én gang pr. spil, med sin bedste score. Kun de bedste 100 pr. spil beholdes. `token` er den hemmelighed, klienten får ved gemning, og som kræves for at rette navnet bagefter; den kommer aldrig med ud i listerne. |
| API | `src/worker.mjs` → `src/highscore.mjs` | `GET /api/highscore/<spil>` giver top 10 plus spillets regler (`retning`, `min`, `maks`, `unik`). `POST` med `{navn, score}` gemmer og svarer med placering og `token`; står spilleren allerede bedre, gemmes intet, og svaret siger `uaendret` med den stående rekord. `PATCH /api/highscore/<spil>/<id>` med `{navn, token}` retter navnet på en række, man selv har gemt. Rækker fra før reglen om ét navn pr. liste (2026-09-12) filtreres fra ved læsning (`udenDubletter`), så gamle dubletter forsvandt fra listerne med det samme og ryddes i databasen, næste gang navnet gemmer. Navne renses og klippes til 12 tegn, scoren skal være et heltal inden for grænserne i `SPIL`. `retning: 'asc'` bruges når laveste tal vinder (Sæt klassisk: tid i sekunder). Et spil med flere tilstande har én nøgle pr. tilstand (`saet-klassisk`, `saet-blitz`). |
| Klient | `public/spil/highscore.js` | `Highscore.panel(el, { spil, score, format, titel })` henter listen og gemmer selv rekorden. Navnet spørges kun **første gang**; derefter huskes det i `localStorage` (`zydy.navn`, fælles for alle spil), og senere rekorder gemmes automatisk med overskriften «Sofie, du har slået rekorden!» og knappen «Ikke Sofie, der spiller?» til at skifte navn. Uden `score` vises bare listen; `format` gør tal til tekst (fx tid som m:ss). |

Worker'en rammer kun `/api/*` (`run_worker_first` i `wrangler.jsonc`); alt
andet serveres som før direkte fra `public/`. API'et er åbent uden login –
det er et familie-site – så værnet mod pjat er kun validering og trimning.

**Hvorfor auto-gem?** Børnene skulle før trykke «Gem» efter hvert spil, og
glemte man det, forsvandt rekorden. Nu skrives navnet én gang, og listen
passer sig selv. Fordi hvert navn kun står én gang, fylder den samme spiller
heller ikke hele toplisten. Skifter man navn på en række, man lige har gemt,
sendes `PATCH` med rækkens token – derfor kan man kun rette sin egen.

Skulle listen blive fyldt med skrald:

```bash
npx wrangler@4 d1 execute zydy-highscore --remote --command "DELETE FROM scores WHERE spil='taarn'"
```

**Tilføj topliste til et nyt spil:** (1) sæt `"højscore"` i spillets
[`kort.json`](#tilføj-en-app--et-nyt-kort-på-forsiden) med fornuftige grænser
(og `"retning": "asc"` hvis laveste tal vinder) og kør
`node scripts/byg-forside.mjs`, så `SPIL` bliver opdateret,
(2) indlæs `<script src="/spil/highscore.js"></script>` i spillet,
(3) kald `Highscore.panel(...)` på slutskærmen og evt. uden score på
startskærmen. Tårn er det enkle forbillede, Sæt viser to tilstande og
tidsformatering. Obby viser varianten uden formular: navnet skrives på
startskærmen, og spillet sender selv rekorden ind (`unik` holder styr på, at
hver spiller kun står én gang). Stenalder viser den tredje variant: dér kender
spillet allerede spillerens rigtige navn fra startskærmen, så det bruger
`Highscore.hent`/`send`/`tegnListe` direkte i stedet for `panel()` og spørger
ikke om navn igen. Alle spil har nu topliste. Skemaet skal kun køres
én gang (er gjort):

```bash
npx wrangler@4 d1 execute zydy-highscore --remote --file schema.sql   # rigtig database
npx wrangler@4 d1 execute zydy-highscore --local  --file schema.sql   # til wrangler dev
```

<a id="populaere-spil-og-spiller-nu"></a>

### Populære spil og «spiller nu»

Forsiden sorterer kortene efter, hvad der bliver spillet mest, og viser for
hvert spil hvor mange der er i gang lige nu og hvem der har rekorden. Det
bruger samme D1-database som toplisten:

| Del | Fil | Hvad |
|---|---|---|
| Database | `starter(spil, dag, antal)` og `aktive(klient, spil, sidst)` i `schema.sql` | `starter` tæller ét tal pr. spil pr. UTC-døgn. `aktive` har én række pr. åben fane med et tidsstempel; rækker uden livstegn i 90 sekunder ryddes ved næste kald, så tabellen aldrig vokser. |
| API | `src/worker.mjs` → `src/aktivitet.mjs` | `POST /api/aktivitet/<spil>` med `{ny: true}` tæller en start, `{klient}` melder «jeg spiller nu», `{slut: true}` melder fra. `GET /api/oversigt` giver for hvert spil `starter` (i alt), `nylig` (30 dage), `aktive` og `top` (rekordholderen fra toplisten). |
| Klient i spillene | `public/spil/aktivitet.js` | Ét script-tag pr. spil: `<script src="/spil/aktivitet.js" data-spil="taarn"></script>`. Tæller én start ved indlæsning og sender livstegn hvert 30. sekund, så længe fanen er synlig. |
| Klient på forsiden | scriptet nederst i `public/index.html` | Henter `/api/oversigt`, sorterer kortene (mest spillet de sidste 30 dage øverst) og tegner mærkaterne. Rækkefølgen sættes kun én gang pr. indlæsning; derefter opdateres tallene hvert halve minut, så kortene ikke hopper, mens man kigger. |

Klient-id'et er et tilfældigt tal i `sessionStorage` (`zydy.klient`). Der
gemmes hverken navne eller andet om spilleren, og alt fejler stille: uden
forbindelse ser siden og spillene ud præcis som før.

Apps der bor et andet sted (Ordle, Taltræf, Imposter, KlaverLær) kan ikke
melde til selv, for de ligger på et andet domæne. For dem tæller forsiden i
stedet trykket på kortet, og de har ingen rekordholder at vise. Skal de med
på toplisterne, kræver det CORS på API'et og en ændring i deres egne repoer.

**Tilføj et nyt spil:** tilføj `<script src="/spil/aktivitet.js" data-spil="<navn>">`
i spillet og `data-spil="<navn>"` på kortets `<li>` i `public/index.html`.
Spil med topliste er automatisk kendt; ellers skriv navnet i `FORSIDE_SPIL` i
`src/aktivitet.mjs`.

### Navnet, idéer og ønsker

Forsiden spørger «Hvem spiller?» ved første besøg og gemmer svaret i
`localStorage` under `zydy.navn` — **den samme nøgle, som spillenes toplister
bruger** (`Highscore.navn`). Derfor kender spillene navnet med det samme, og en
rekord bliver gemt uden at spørge igen. Bagefter står navnet som en knap i
toppen, hvor det kan skiftes. Siger man nej tak, huskes det i
`zydy.navn.spurgt`, og man bliver ikke spurgt igen.

Hvor virker navnet? Tårn, Sæt, Farvesortering, Ordstige, Duel, Helteriget og
Dybet bruger `Highscore.panel()` og får det gratis. Obby og Stenalder har deres
eget navnefelt på startskærmen, som nu står udfyldt med navnet fra forsiden
(Stenalder kun for spiller 1, og skriver man et navn dér uden at have et i
forvejen, læres det til resten af siden). Kryds og bolle har ingen topliste, og
Ordle, Taltræf, Imposter og KlaverLær bor på andre domæner og kan ikke læse
`localStorage` herfra — dér giver navnet ikke mening.

Samme sted kan man **foreslå spil og ønske sig ting**:

| Del | Fil | Hvad |
|---|---|---|
| Database | tabellen `ideer` i `schema.sql` | `ideer(slags, spil, navn, tekst, oprettet)`. `slags` er `'nyt'` (forslag til et helt nyt spil, `spil` er tom) eller `'oenske'` (ønske til et spil, der findes). Kun de nyeste 500 beholdes. |
| API | `src/worker.mjs` → `src/ideer.mjs` | `POST /api/ideer` med `{slags, spil?, navn, tekst}`. Navnet renses som på toplisten (12 tegn), teksten til 3-600 tegn, og `spil` skal være et kendt spil. |
| Klient | `public/ideer.js` | Navneknappen i toppen, «Mangler der noget?» under hvert spilkort og «Nyt spil?»-kortet nederst. Knapperne og kortet laves i JS, så nye kort i `index.html` automatisk får dem. Kender vi ikke navnet, spørges der først, og formularen fortsætter bagefter. |

Hent det ind, når der skal bygges videre:

```bash
export CLOUDFLARE_EMAIL=larsarnth@outlook.com          # se ~/.dsh/skills/cloudflare/SKILL.md
export CLOUDFLARE_API_KEY=<global API key>
npm run ideer                 # pænt overblik, nyeste først
npm run ideer -- --json       # rå JSON, fx til at give videre til en AI
npm run ideer -- --nyt        # kun forslag til nye spil
npm run ideer -- --oensker    # kun ønsker til de spil der findes
```

`scripts/ideer.mjs` spørger databasen direkte gennem wrangler, så der ikke
findes et offentligt endepunkt, som kan læse dem — man kan kun skrive. Er en
idé bygget færdig eller bare pjat, så slet den:

```bash
npx wrangler@4 d1 execute zydy-highscore --remote --command "DELETE FROM ideer WHERE id = 42"
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
node --test test/unit/*.test.mjs     # Stenalders regelmotor, Dybets motor, Kryds og bolles computerspiller, forsidens kort, højscore-, aktivitets- og idé-API'et (ingen browser, ~5 sek.)
```

Playwright-testene kører uden Cloudflare, fordi `test/api-mock.mjs` sætter
serveren op i hukommelsen: den kalder den **rigtige** Worker-kode
(`haandterApi` og `haandterAktivitet`) med lagre i hukommelsen i stedet for D1,
så testene ser de samme svar som i drift. Hver test begynder med

```js
const api = await mockApi(page);    // før testens egen page.route, som så vinder
```

og kan bagefter kigge i `api.log.aktivitet` og `api.scores`. Tårn, Sæt, Dybet
og Obby lægger deres egen `page.route('**/api/highscore/**')` ovenpå, når de
har brug for en bestemt startliste. API'erne testes desuden hver for sig i
`test/unit/highscore.test.mjs` og `test/unit/aktivitet.test.mjs`. Vil man prøve
hele kæden lokalt mod en lokal D1-database:

```bash
npx wrangler@4 dev --port 8790      # http://localhost:8790/spil/taarn/  (kør schema.sql --local først)
```

`test/run.mjs` starter en lokal server og kører `test/*.test.mjs` i headless
Chromium med iPhone 13-profil: hvert spil spilles igennem via UI og
`window.GAME`, der tjekkes for console-fejl og vandret scroll, og der gemmes et
screenshot i `test/shots/`. Har man `playwright` i `node_modules`, kan
`PLAYWRIGHT` udelades.

## Tilføj en app — et nyt kort på forsiden

Et kort beskriver sig selv i sin egen mappe, og forsiden bygges ud fra
mapperne. Tilføj derfor **ingenting i hånden i `public/index.html`**:

```
public/spil/<id>/kort.json    navn, beskrivelse, url, orden, evt. topliste-regler
public/spil/<id>/ikon.svg     ikonet (ét <svg viewBox="0 0 512 512">)
public/spil/<id>/index.html   selve spillet (kun spil der bor her)
```

```bash
node scripts/byg-forside.mjs    # skriver kortene ind i public/index.html og src/spil-data.mjs
```

```jsonc
{
  "navn": "Tårn",
  "beskrivelse": "Slip blokken i det rigtige øjeblik og byg tårnet så højt du kan.",
  "url": "/spil/taarn/",       // absolut https://… for apps der bor et andet sted, sammen med "ekstern": true
  "orden": 40,                 // placering før popularitets-sorteringen; vælg et tal ingen andre har
  "højscore": { "maks": 2000 } // udelad, hvis spillet ikke har en topliste
}
```

Generatoren skriver to filer, som **ikke må rettes i hånden**:

| Genereret | Bruges til |
|---|---|
| kort-listen i `public/index.html` (alt mellem markøren og `</ul>`) | selve forsiden |
| `src/spil-data.mjs` (`KORT` + `SPIL`) | Workerens topliste (`SPIL`) og aktivitetstælling (`FORSIDE_SPIL`) |

Før stod det samme spil tre steder i hånden — forsiden, `SPIL` i
`src/highscore.mjs` og `FORSIDE_SPIL` i `src/aktivitet.mjs`. Fordi flere
Claude-sessioner arbejder i repoet samtidig, stødte de hele tiden sammen i
præcis de tre filer, og et nyt spil kunne nå at være halvt tilføjet. Nu rører
et nyt spil kun sin egen mappe. Rammer to grene alligevel hinanden i en
genereret fil, tager man bare den ene side (`git checkout --theirs`) og kører
scriptet igen.

`test/unit/kort.test.mjs` fejler, hvis man har glemt at køre generatoren, hvis
et `kort.json` mangler noget, eller hvis et spil her på sitet ikke har en
`index.html` at linke til. `node scripts/byg-forside.mjs --tjek` svarer på det
samme uden at skrive noget.

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
