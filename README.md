# zydy.dk – overblikssiden

Forsiden på **<https://zydy.dk>**: en liste med familiens apps og spil, så
børnene bare skal huske ét domæne. Siden er statisk HTML uden build og uden
afhængigheder. De store apps bor i egne repoer og linkes til; femten spil
ligger direkte her under `public/spil/`. Den eneste server-kode er tre små
API'er (`src/`): en [online topliste](#online-topliste),
[hvem der er på siden, og hvor tit spillene spilles](#populaere-spil-og-spiller-nu)
og [venner](#venner).

| App | Hvor den kører | Kode |
|---|---|---|
| Ordle | <https://larsarnth.github.io/ordle/> (GitHub Pages) | `../Ordle` |
| Taltræf | <https://larsarnth.github.io/taltraef/> (GitHub Pages) | `../iPhoneSpil` |
| Imposter | <https://larsarnth.github.io/Imposter/> (GitHub Pages) | `../Imposter` |
| KlaverLær | <https://klaver.zydy.dk> (Cloudflare Worker + Access) | `../KlaverApp` |

## Spil der bor her

Ud over links til de andre apps huser repoet femten spil under `public/spil/<navn>/`
uden afhængigheder eller build (alle én HTML-fil, undtagen Stenalder og Dybet, der er tre,
og Kryds og bolle, Duel, Gulvet er lava, Klodser, Min kat, Miskmask og Blokblast, der er to). De udrulles sammen
med forsiden og ligger på `https://zydy.dk/spil/<navn>/`:

| Spil | Sti | Hvad |
|---|---|---|
| Tårn | `public/spil/taarn/` | Stack-arcade på canvas: tryk for at slippe blokken, overhæng skæres af, perfekte drops giver bonus. Et par sekunder efter slutskærmen svajer tårnet og falder fra hinanden (slås fra ved `prefers-reduced-motion`). Online topliste (top 10) med navn. **Points** lægges sammen på tværs af alle spil (10 pr. blok, 20 mere pr. perfekt gange stimen, højst ×5) og gemmes i `zydy.taarn.point`; for hver hele tusinde er der konfetti. |
| Sæt | `public/spil/saet/` | Kortspillet Set på dansk: find tre kort hvor antal, form, farve og fyld er helt ens eller helt forskellige. Klassisk og Blitz. Online topliste pr. tilstand (hurtigste tid / flest sæt). |
| Farvesortering | `public/spil/farvesortering/` | Water sort: hæld farvet væske til hvert glas har én farve. Uendelige, solver-verificerede niveauer. Online topliste: højeste niveau løst, sendt ind når man når et nyt personligt højeste. «🏆 Sofie har rekorden · niveau 42» står på startskærmen og på slutkortet, og trykker man på linjen, foldes hele top 10 ud. |
| Ordstige | `public/spil/ordstige/` | Word ladder: skift ét bogstav ad gangen til et rigtigt dansk ord. Dagens stige + tilfældige. Ordlisten er Ordles (Stavekontrolden, GPL/LGPL/MPL). Online topliste: flest dage i træk med dagens stige. |
| Duel | `public/spil/duel/` | To spillere på én telefon, skærmen delt i to: fem reflex-minispil, først til 3/5/10 point. Kan også spilles **alene mod botten** i tre sværhedsgrader – så vendes den øverste halvdel rigtigt, og man holder fingrene fra den. Bottens hoved bor i `bot.mjs` (enhedstestet). Online topliste: hurtigste reaktion i «Grønt lys», målt fra skærmen bliver grøn til trykket lander (under 80 ms tæller ikke) – bottens reaktioner tæller ikke med. |
| Stenalder | `public/spil/stenalder/` | Hot-seat-udgave af brætspillet Stone Age for 2-4 spillere på én iPad. Tre filer uden build: `regler.mjs` (regelmotor, ren JS), `data.mjs` (kort og bygninger) og `index.html` (UI). Gemmer spillet i `localStorage`, så det kan genoptages. Online topliste: vinderens point, gemt under det navn spilleren selv skrev på startskærmen. |
| Helteriget | `public/spil/helteriget/` | Deck-building-kortspil for to på én iPad (Hero Realms-mekanik, egne danske kort): 80 markedskort i fire fraktioner, helte med vagter, allierede og ofringer. Hot-seat med overleveringsskærm, så hænderne forbliver hemmelige; igangværende spil gemmes i `localStorage`. Online topliste: vundet på færrest ture. |
| Dybet | `public/spil/dybet/` | Dungeon crawler i Wolfenstein-3D-stil (raycaster på canvas) med Pokémon-agtig turbaseret kamp. Procedurelt genererede labyrinter (altid en vej til trappen), monstre der står stille og spærrer gange, kister med udstyr, evner og potioner; minimap viser kun det udforskede. Spillet går selv, indtil vejen deler sig, og viser så flydende valgknapper. Score = dybde nået, online topliste. Tre filer: `motor.mjs` (regler, enhedstestet), `sprites.mjs` (pixel-art som tekst), `index.html`. |
| Kryds og bolle | `public/spil/kryds/` | Klassisk tre på stribe, hot-seat for to på samme skærm eller mod computeren i tre sværhedsgrader: Nem (spiller mest tilfældigt og overser trusler), Mellem (vinder og blokerer, men vælger hvert andet træk tilfældigt) og Svær (perfekt minimax – kan ikke slås). Startspilleren skifter for hvert parti, så begge får fordelen. To filer: `motor.mjs` (regler + computerspiller, enhedstestet) og `index.html`. Ingen topliste – der er ikke noget at måle i. |
| Gulvet er lava | `public/spil/lava/` | Selmas idé: stuen set fra siden, hvor gulvet bliver til lava, og lavaen stiger nedefra. Man går til venstre og højre og hopper op ad sofaen, bordet, reolen, klaveret og flyttekasserne, mens de bliver smallere og længere fra hinanden. Trampolinpuffen skyder en ekstra højt op, flyttekasser styrter i lavaen kort efter man er landet på dem, og isterninger holder lavaen nede i tre sekunder. Score = hvor højt man nåede i meter, online topliste. To filer: `bane.mjs` (fysik og banegenerator, enhedstestet) og `index.html`. Se «Gulvet er lava – styring og bane» nedenfor. |
| Obby | `public/spil/obby/` | One-button-platformspil på canvas: hop fra flyvende firkant til flyvende firkant med mellemrum eller et tryk. Rød laser på hver anden firkant, lava i bunden, checkpoint på hver femte, og TRY AGAIN når man dør. Banen er uendelig og genereres, så hvert spring kan nås (bot-testet i `test/obby.test.mjs`) — også ved den høje fart, for farten stiger, jo længere man kommer, og banen genereres ud fra netop den fart. Checkpointet har en høj flagstang (blå = ikke nået, grøn med flueben = nået), og både TRY AGAIN og «tryk for at starte» skriver hvilket checkpoint man fortsætter fra — før stod figuren oven på et lillebitte mærke, så det så ud som om checkpointet ikke gjorde noget. **Coins får man kun på checkpoints** (3 pr. nyt checkpoint, dvs. 3 for hver 5. firkant) og kan købe blandt 14 skins til højst 100 coins, nogle med hat; butikken kan åbnes midt i et løb og fryser spillet imens. Tallet 3 er valgt, så et godt løb til firkant 50 giver 30 coins og et langt løb til 100 giver 60: en dyr skin kan spares op på et par gode løb, men aldrig på ét. Score = hop i træk uden at dø (uafhængig af coins); navnet skrives på startskærmen, og en ny rekord ryger selv på toplisten. Øverst på startskærmen står **«Lavet af»** – Sofie fandt på spillet, Far og Claude byggede det – efter Sofies ønske om, at der skulle stå hvem der har lavet det. Den står lige under titlen og ikke nederst som en rulletekst: startskærmen er højere end en telefonskærm, så alt under Spil-knappen skal man rulle ned til. |
| Klodser | `public/spil/klodser/` | Selmas ønske om Roblox, oversat til noget der kan ligge her: en 3D-verden af klodser (WebGL på canvas, ingen biblioteker) med sin egen klodsefigur set bagfra. Verdenen er en ø på 40 × 40 klodser med bakker, søer, strande og træer, og havet uden om går ud til horisonten. Man løber rundt med joystick + HOP, kigger ved at trække på skærmen, bygger og river ned med ti farver klodser, og kan skifte til første person. 12 guldklodser er gemt rundt omkring – hver med en lysstråle op i luften, så de kan findes – og tiden det tager at samle dem alle er scoren på toplisten (laveste vinder). Verdenen gemmes i `localStorage` som «frø + de klodser du selv har ændret», så det man har bygget står der næste gang. Man træder automatisk op ad én klods, så bakker ikke kræver hop. To filer: `verden.mjs` (verden, fysik og sigte, enhedstestet) og `index.html`. |
| Miskmask | `public/spil/miskmask/` | Selmas ønske om «en verity app» – en *variety* app, altså én app med mange forskellige småting i. Det er blevet til 13 bittesmå spil i en pose: tryk på knappen, find den anderledes, prik ballonerne, fang den, det største tal, passer regnestykket, find farven, find bogstavet, hvor mange, tag stjernerne (ikke bomben), tryk N gange, tryk tallene i rækkefølge – og «RØR IKKE!», som man vinder ved at holde fingrene i skødet. Ét ad gangen, med 5 sekunder i starten og 2,2 ved fuld fart (runde 21), og tre liv. Alle minispil deler den samme regel – nogle felter er rigtige, resten er fælder – så et nyt minispil kun skal beskrive, hvad der står på skærmen. Posen trækkes som sedler, så alle 13 kommer, før nogen kommer igen. Score = antal klarede minispil, online topliste. To filer: `mikro.mjs` (de 13 spil og reglerne, enhedstestet) og `index.html`. Se «Miskmask – kvadratet og de 13 minispil» nedenfor. |
| Min kat | `public/spil/kat/` | Selmas ønske om «My Cat»: et kæledyr man passer. Man adopterer en killing, giver den et navn, og så har den fire behov – mæt, glad, ren og frisk – som siver nedad med tiden, også mens man er væk. Man giver mad i skålen, kaster garnnøglet (tryk på gulvet, katten løber efter det), børster pelsen med fingeren og putter den i kurven, hvor stuen bliver mørk og månen kommer frem. Katten tegnes på canvas (ingen billeder) og blinker, logrer, spinder når man klapper den, og får snavsede pletter, hvis den ikke bliver børstet. Man tjener mønter og erfaring for **det, man faktisk fylder op** – en mæt kat giver ingenting, så man kan ikke trykke sig til mønter – og køber pelse, hatte og halsbånd i butikken. Score = kattens niveau, online topliste. To filer: `kat.mjs` (behov, erfaring, butik og den gemte kat, enhedstestet) og `index.html`. |
| Blokblast | `public/spil/blokblast/` | Selmas ønske om «Block blast»: et bræt på 8 × 8 og tre brikker ad gangen, som man trækker ned på brættet – ingen drejning, ingen tyngdekraft. Fylder man en hel række eller søjle, blæser den væk. Ét point pr. felt man lægger, 10 × linjer² for det man rydder, og en stime, der ganger op til ×2,5, hvis man rydder flere gange i træk. Nye brikker kommer først, når alle tre er brugt, og der trækkes om, indtil mindst én af dem kan være på brættet. Spillet er slut, når ingen af de tre kan ligge nogen steder; brættet gemmes undervejs, så man kan lukke fanen og fortsætte. Score = point, online topliste. To filer: `blokke.mjs` (bræt, brikker, rydning og point, enhedstestet) og `index.html`. Se «Blokblast – brikken over fingeren» nedenfor. |

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
ikke om navn igen. Alle spil undtagen Kryds og bolle har topliste.

**Vis hvem der har rekorden.** Et spil, hvor listen kun dukker op, når man selv
slår en rekord, kan man spille i ugevis uden at opdage, at der er andre med.
Derfor henter Farvesortering listen ved indlæsning og skriver øverste række som
én linje – «🏆 Sofie har rekorden · niveau 42», eller «Du har rekorden», hvis
det er ens eget navn. Linjen står både på startskærmen og på kortet efter et
løst niveau, og den er en knap: trykker man på den, tegnes hele top 10 med
`panel()` uden score. Kan listen ikke hentes (ingen forbindelse), står der
ingenting, og skærmen ser ud som før.

Skemaet skal kun køres én gang (er gjort):

```bash
npx wrangler@4 d1 execute zydy-highscore --remote --file schema.sql   # rigtig database
npx wrangler@4 d1 execute zydy-highscore --local  --file schema.sql   # til wrangler dev
```

`CREATE TABLE IF NOT EXISTS` rører ikke en tabel, der findes i forvejen, så nye
kolonner skal tilføjes med `ALTER TABLE`. Begge er kørt på den rigtige database
og mangler altså ikke — de står her (og i `schema.sql`), så den næste ikke er i
tvivl:

| Kolonne | Kom til | Migrering (kørt) |
|---|---|---|
| `scores.token` | 2026-09-12 | `ALTER TABLE scores ADD COLUMN token TEXT` |
| `aktive.navn` | 2026-09-12 | `ALTER TABLE aktive ADD COLUMN navn TEXT` |

Har du en lokal D1 til `wrangler dev`, skal de køres dér med `--local` — eller
bare drop den flygtige `aktive`-tabel og kør `schema.sql` igen.

<a id="populaere-spil-og-spiller-nu"></a>

### Populære spil, «spiller nu» og hvem der er her

Forsiden sorterer kortene efter, hvad der bliver spillet mest, og viser for
hvert spil hvem der er i gang lige nu og hvem der har rekorden. Øverst står
hvem der ellers er på zydy.dk — «Sofie og Selma er her nu» — også dem der bare
står på forsiden uden at spille. Det bruger samme D1-database som toplisten:

| Del | Fil | Hvad |
|---|---|---|
| Database | `starter(spil, dag, antal)` og `aktive(klient, spil, sidst, navn)` i `schema.sql` | `starter` tæller ét tal pr. spil pr. UTC-døgn. `aktive` har én række pr. åben fane med et tidsstempel og spillerens navn; rækker uden livstegn i 90 sekunder ryddes ved næste kald, så tabellen aldrig vokser. |
| API | `src/worker.mjs` → `src/aktivitet.mjs` | `POST /api/aktivitet/<spil>` med `{ny: true}` tæller en start, `{klient, navn}` melder «jeg er her nu», `{slut: true}` melder fra. `GET /api/oversigt?mig=<klient>` giver for hvert spil `starter` (i alt), `nylig` (30 dage), `aktive`, `navne` og `top` (rekordholderen fra toplisten) — plus `her: {antal, navne}` med alle på siden. `mig` er ens eget klient-id, som holdes uden for tællingen. |
| Klient i spillene | `public/spil/aktivitet.js` | Ét script-tag pr. spil: `<script src="/spil/aktivitet.js" data-spil="taarn"></script>`. Tæller én start ved indlæsning og sender livstegn hvert 30. sekund, så længe fanen er synlig. |
| Klient på forsiden | samme script med `data-spil="forsiden"` + scriptet nederst i `public/index.html` | Forsiden melder sig selv til på præcis samme måde, så man tæller med uden at spille. Scriptet henter `/api/oversigt`, sorterer kortene (mest spillet de sidste 30 dage øverst) og tegner mærkaterne. Rækkefølgen sættes kun én gang pr. indlæsning; derefter opdateres tallene hvert halve minut, så kortene ikke hopper, mens man kigger. |

Klient-id'et er et tilfældigt tal i `sessionStorage` (`zydy.klient`).
**Navnet** er det, man selv har skrevet på forsiden (`localStorage`
`zydy.navn`, samme nøgle som toplisterne) — det står i forvejen offentligt på
toplisterne, og det ligger kun i den flygtige `aktive`-tabel, altså glemt 90
sekunder efter man lukker siden. Har man ikke skrevet noget navn, tæller man
med som anonym («Sofie og 1 mere er her nu»). Der vises højst tre navne i
toppen og to pr. kort, så en telefonskærm ikke sprænges.

Man tæller ikke sig selv med: forsiden sender sit eget klient-id som `?mig=…`,
så teksten i toppen handler om de andre — ellers ville man læse sit eget navn
og tro, der var nogen. Er man alene, står der som før «Tryk på et spil for at
spille». Skriver eller skifter man navn, sender `/ideer.js` hændelsen
`zydy:navn`, aktivitets-klienten melder det med det samme, og forsiden henter
en frisk oversigt (`zydy:aktivitet`), så man ikke skal vente et halvt minut.

Alt fejler stille: uden forbindelse ser siden og spillene ud præcis som før.

Selma spurgte gennem «Nyt spil?» både om at kunne se hvem der er på siden **og
om venner**. Begge dele er nu bygget — venner uden konti og login, se
[Venner](#venner).

Apps der bor et andet sted (Ordle, Taltræf, Imposter, KlaverLær) kan ikke
melde til selv, for de ligger på et andet domæne. For dem tæller forsiden i
stedet trykket på kortet, og de har ingen rekordholder at vise. Skal de med
på toplisterne, kræver det CORS på API'et og en ændring i deres egne repoer.

**Tilføj et nyt spil:** tilføj `<script src="/spil/aktivitet.js" data-spil="<navn>">`
i spillet. Resten kommer af sig selv, fordi kortene genereres ud fra
`public/spil/<navn>/kort.json` (se «Tilføj en app — et nyt kort på forsiden»).

### Navnet, idéer og ønsker

Forsiden spørger «Hvem spiller?» ved første besøg og gemmer svaret i
`localStorage` under `zydy.navn` — **den samme nøgle, som spillenes toplister
bruger** (`Highscore.navn`). Derfor kender spillene navnet med det samme, og en
rekord bliver gemt uden at spørge igen. Bagefter står navnet som en knap i
toppen, hvor det kan skiftes. Siger man nej tak, huskes det i
`zydy.navn.spurgt`, og man bliver ikke spurgt igen. Navnet er også det, de
andre ser i «Sofie er her nu» (se afsnittet ovenfor); skiftes det, sendes
hændelsen `zydy:navn`, så aktivitets-klienten melder det med det samme.

Hvor virker navnet? Tårn, Sæt, Farvesortering, Ordstige, Duel, Helteriget,
Dybet, Gulvet er lava og Klodser bruger `Highscore.panel()` og får det gratis. Obby og Stenalder har deres
eget navnefelt på startskærmen, som nu står udfyldt med navnet fra forsiden
(Stenalder kun for spiller 1, og skriver man et navn dér uden at have et i
forvejen, læres det til resten af siden). Kryds og bolle har ingen topliste, og
Ordle, Taltræf, Imposter og KlaverLær bor på andre domæner og kan ikke læse
`localStorage` herfra — dér giver navnet ikke mening.

Samme sted kan man **foreslå spil og ønske sig ting**:

| Del | Fil | Hvad |
|---|---|---|
| Database | tabellen `ideer` i `schema.sql` | `ideer(slags, spil, navn, tekst, oprettet, loest, loesning)`. `slags` er `'nyt'` (forslag til et helt nyt spil, `spil` er tom) eller `'oenske'` (ønske til et spil, der findes). Kun de nyeste 500 beholdes. `loest` er tom, indtil ønsket er bygget færdig; så står tidsstemplet dér og `loesning` fortæller hvad der blev lavet (eller `afvist: …`). |
| API | `src/worker.mjs` → `src/ideer.mjs` | `POST /api/ideer` med `{slags, spil?, navn, tekst}`. Navnet renses som på toplisten (12 tegn), teksten til 3-600 tegn, og `spil` skal være et kendt spil. |
| Klient | `public/ideer.js` | Navneknappen i toppen, «Mangler der noget?» under hvert spilkort og «Nyt spil?»-kortet nederst. Knapperne og kortet laves i JS, så nye kort i `index.html` automatisk får dem. Kender vi ikke navnet, spørges der først, og formularen fortsætter bagefter. |

Hent det ind, når der skal bygges videre:

```bash
export CLOUDFLARE_EMAIL=larsarnth@outlook.com          # se ~/.dsh/skills/cloudflare/SKILL.md
export CLOUDFLARE_API_KEY=<global API key>
npm run ideer                 # pænt overblik over de uløste, nyeste først
npm run ideer -- --alle       # også dem der er løst, med ✓ og hvad der blev lavet
npm run ideer -- --json       # rå JSON, fx til at give videre til en AI
npm run ideer -- --nyt        # kun forslag til nye spil
npm run ideer -- --oensker    # kun ønsker til de spil der findes
```

`scripts/ideer.mjs` spørger databasen direkte gennem wrangler, så der ikke
findes et offentligt endepunkt, som kan læse dem — man kan kun skrive. Er en
idé bygget færdig eller bare pjat, så markér den i stedet for at slette den, så
man kan se hvad der er svaret på hvad:

```bash
node ../zydy-feedback-loop.mjs --loest 42 "kort beskrivelse af hvad der blev lavet"
node ../zydy-feedback-loop.mjs --afvist 42 "hvorfor det ikke kan lade sig gøre"
```

<a id="venner"></a>

### Venner

Øverst på forsiden står **«Dine venner»**: hvem du er venner med, og om de er
på zydy.dk lige nu («Selma spiller Obby»). Spørger nogen, om I skal være
venner, står spørgsmålet samme sted med *Ja tak* / *Nej*. Trykker man på en
ven, kan man se hvor hen er — og hoppe direkte med ind i det spil, hen er i
gang med.

Der er **ingen konti og intet login** på zydy.dk, og det bliver der ikke. Man
er det navn, man har skrevet på forsiden (`zydy.navn`), så et venskab er en
aftale mellem to *navne*. Det er nok her: navnene står i forvejen offentligt på
toplisterne, familien kender hinanden, og alternativet — rigtige brugerkonti —
ville gøre siden meget tungere at bruge for et barn med en iPad.

| Del | Fil | Hvad |
|---|---|---|
| Database | tabellen `venner` i `schema.sql` | Én række pr. par: `venner(fra, til, fra_navn, til_navn, oprettet, svaret)`. `fra`/`til` er navnet med små bogstaver (nøglen), `fra_navn`/`til_navn` er stavemåden til visning. `svaret` er tomt, indtil den anden har sagt ja. |
| API | `src/worker.mjs` → `src/venner.mjs` | `GET /api/venner?navn=Sofie` giver `venner`, `venter` (de har spurgt mig), `sendt` (jeg har spurgt dem) og `kendte` (navne vi har set på siden, som forslag). `POST /api/venner` med `{navn, ven, handling}`: `'spoerg'` (standard), `'ja'` og `'nej'` (som også fjerner en ven igen). |
| Klient | `public/venner.js` + `<section id="venner">` i `public/index.html` | Tegner panelet og henter listen hvert minut. Hvem der er online, kommer gratis fra forsidens eget kald til `/api/oversigt`, som sendes videre som hændelsen `zydy:oversigt` — så det samme ikke hentes to gange. Dialogen genbruger stilen fra `/ideer.js`, der altid indlæses først. |

Værnet mod pjat er, at **begge** skal sige ja, at man ikke kan være ven med sig
selv, og at ingen kan have mere end 50 rækker (`VENNER_MAKS`). Store og små
bogstaver er samme person, og siger man ja, retter det samtidig navnet til den
stavemåde, personen selv bruger. Uden navn viser panelet bare en opfordring til
at skrive et; uden forbindelse står der det, vi så sidst.

Skulle der komme skrald ind:

```bash
npx wrangler@4 d1 execute zydy-highscore --remote --command "DELETE FROM venner WHERE fra='pjat' OR til='pjat'"
```

### Feedback-loopet

`../zydy-feedback-loop.mjs` (i `Projekter/`, ikke i dette repo) kan stå og køre
i baggrunden: hvert 30. sekund spørger den databasen om uløste ønsker, og er der
et, laver den en git-worktree ud fra `origin/main` og sætter en Claude-arbejder
til at bygge, teste, committe og pushe det — og først derefter markere ønsket
som løst. Det er arbejderen, ikke loopet, der sætter `loest`, og loopet tjekker
bagefter i databasen, om det rent faktisk skete; gjorde det ikke, prøver den
igen (tre gange, så springer den ønsket over). Se filens hoved for flag.

### Gulvet er lava – styring og bane

Spillet er bygget efter et forslag fra Selma gennem «Nyt spil?»-kortet, hvor
hele beskrivelsen lød «Floor is lava». To valg er værd at kende:

**Styringen er tre faste knapper i bunden** – ◀ ▶ i venstre hjørne og en stor
rund HOP i højre. Alternativet var «tryk øverst på skærmen for at hoppe», men
på en iPad kan man slet ikke nå toppen af skærmen, mens man holder den, og på
en telefon hviler tommelfingrene i forvejen i de nederste hjørner. Knapperne er
halvgennemsigtige, så man kan se stuen bagved, og mindst 74 × 74 px. Piletaster
og mellemrum gør det samme, så spillet også kan prøves på en computer.

**Banen kan altid klatres.** `bane.mjs` regner ud, hvor langt et hop rækker:
man lander, når man falder ned gennem den nye højde, så rækkevidden er
`VX · tNed(dy)`. Spillerens egen bredde går fra (man skal fri af den ene kant
og helt ind over den næste), og af resten bruges kun 75 %. Rækkerne ligger
1,45–2,15 m fra hinanden, altid under hoppets 2,6 m, så et lodret hop også
virker. Er der to møbler i en række, må der højst være 3,8 m mellem dem – ikke
pynt, men netop den grænse der sikrer, at næste række kan stå et sted, hvor
begge kan nå den. `test/unit/lava.test.mjs` går 40 stuer × 200 rækker igennem
og tjekker løftet, og `test/lava.test.mjs` lader en bot klatre 80 m op med den
rigtige fysik.

Lavaen sakker aldrig mere end 5,5 m bagud (`LAVA_HALE`). Det er både spænding
og tydelighed: den skal blive ved med at kunne ses i bunden af skærmen. Prisen
er, at et fald på mere end et par møbler koster livet.

Flyttekassen styrter i lavaen 1,15 sekund efter, man er landet på den. Derfor
laver generatoren den kun i en række med to møbler – ellers kunne den fjerne
den eneste vej videre.

### Miskmask – kvadratet og de 13 minispil

Spillet kom af Selmas ønske «Vil du gerne lave en verity app». Læst som
*variety* er det én app med mange forskellige småting i – derfor en pose med 13
bittesmå spil frem for ét stort.

**Alle minispil deler den samme regel.** Et minispil i `mikro.mjs` beskriver
kun, hvad der står på skærmen, og en håndfuld *felter*, hvor nogle er rigtige:

```js
{ id: 'farve', navn: 'Find farven',
  forbered(rnd, sv) { return { instruktion: 'TRYK PÅ DEN RØDE', felter: [ … ] }; } }
```

Motoren gør resten: ram alle de rigtige (`krav`), og du har vundet; ram et
forkert, og runden er tabt; løb tiden ud, og den er også tabt – medmindre
spillet vindes ved at vente (`vindVedTid`, som «RØR IKKE!»). Et minispil med
felter, der flytter sig, får en `bevaeg(r, dt)`. Et nyt minispil er derfor et
objekt i `MIKROSPIL` – og testen spiller det automatisk igennem, fordi
`facit(r)` kan udlede de rigtige tryk af felterne.

**Fladen er et kvadrat på 100 × 100 enheder**, som `index.html` lægger midt i
rammen. Det er derfor, en cirkel er rund både på en iPhone på højkant og en
iPad på tværs, og det er derfor, HUD'en (hjerter, instruktion, tidslinje)
ligger *uden for* fladen: alt inde på fladen må man trykke på, alt udenfor er
noget, man kun skal læse.

**Det skal være sjovt, ikke fælder.** Rammer man op til 3 enheder ved siden af
et rigtigt felt, tæller det med (`RAMME`) – men et næsten-tryk på et forkert
felt koster ingenting. Under rundens overskrift (det første sekund) tager
spillet slet ikke imod tryk, så man ikke kan nå at dumme sig, før man har læst,
hvad der står. Tiden falder fra 5 sekunder til 2,2 over 20 runder.

Minispillene trækkes som sedler af en pose (`pose()`): alle 13 kommer, før
nogen kommer igen. Med en almindelig terning kom det samme spil tit to gange i
træk, og så føles det ikke som en blandet pose.

`window.GAME.tvingRunde('bombe')` sætter et bestemt minispil i gang – brugt af
testen til at spille alle 13 igennem gennem skærmen og til at se på dem.

### Blokblast – brikken over fingeren

Spillet kom af Selmas ønske «Block blast» – mobilspillet, hvor man lægger
brikker på et 8 × 8-bræt og rydder rækker og søjler. Reglerne er de samme, og
de bor i `blokke.mjs`, som ikke rører DOM'en: `kanLægges`, `læg` (giver et nyt
bræt, point og hvilke felter der forsvandt), `nogenPasser` (spillet er slut) og
`trækBrikker`.

**Brikken løftes op over fingeren, mens man trækker** (`LØFT`, halvanden
feltbredde). Uden det ligger brikken under tommelfingeren, og på en telefon kan
man så hverken se, hvad man har fat i, eller hvor den lander. Feltet, brikken
lander på, regnes ud fra brikkens *øverste venstre hjørne*, ikke fra fingeren,
og skyggen på brættet viser det hele tiden: farvet når den kan være der, rød
ramme når den ikke kan. Slipper man et ulovligt sted, bliver brikken i bakken.

**De rækker og søjler, der ville blive ryddet, lyser gult**, mens man holder
brikken over dem. Det er den eneste hjælp i spillet – og den, der gør, at man
tør satse på to linjer på én gang, som giver fire gange så meget (10 × linjer²).

**Nye brikker først, når alle tre er brugt.** Sådan er det i forbilledet, og
det er dét, der gør spillet til et puslespil: man skal have plads til alle tre.
Der trækkes om op til 20 gange, indtil mindst én af de tre kan være på brættet,
så spillet aldrig slutter i samme nu, brikkerne kommer.

Brættet, brikkerne og pointene gemmes i `localStorage` (`zydy.blokblast.gem`)
efter hvert træk, så startskærmen kan tilbyde «Fortsæt · 340 point». Ved
slutskærmen ryddes det gemte spil væk. `bedsteTræk()` er en lille
computerspiller (ryd linjer, luk ikke huller inde, pak brikkerne sammen); både
enhedstesten og Playwright-testen spiller spillet igennem med den.

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
node --test test/unit/*.test.mjs     # Stenalders regelmotor, Dybets motor, Kryds og bolles computerspiller, Duel-botten, Gulvet er lavas bane, Klodsers verden og fysik, Min kats behov og butik, Miskmasks 13 minispil, Blokblasts bræt og point, forsidens kort, højscore-, aktivitets-, idé- og venne-API'et (ingen browser, ~5 sek.)
```

Playwright-testene kører uden Cloudflare, fordi `test/api-mock.mjs` sætter
serveren op i hukommelsen: den kalder den **rigtige** Worker-kode
(`haandterApi` og `haandterAktivitet`) med lagre i hukommelsen i stedet for D1,
så testene ser de samme svar som i drift. Hver test begynder med

```js
const api = await mockApi(page);    // før testens egen page.route, som så vinder
```

og kan bagefter kigge i `api.log.aktivitet`, `api.scores`, `api.ideer.rows` og
`api.venner.rows`. Tårn, Sæt, Dybet
og Obby lægger deres egen `page.route('**/api/highscore/**')` ovenpå, når de
har brug for en bestemt startliste. API'erne testes desuden hver for sig i
`test/unit/highscore.test.mjs`, `test/unit/aktivitet.test.mjs`,
`test/unit/ideer.test.mjs` og `test/unit/venner.test.mjs`. Forsiden har to
browser-tests: `test/forside.test.mjs` (navn, ønsker, «hvem er her») og
`test/venner.test.mjs` (spørg, sig ja, se hvem der spiller hvad, fjern en ven —
den anden part spilles af testen selv gennem `api.venner`). Vil man prøve
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
