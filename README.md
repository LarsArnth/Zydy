# zydy.dk – overblikssiden

Forsiden på **<https://zydy.dk>**: en liste med familiens apps og spil, så
børnene bare skal huske ét domæne. Siden er statisk HTML uden build og uden
afhængigheder. De store apps bor i egne repoer og linkes til; sytten spil
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

Ud over links til de andre apps huser repoet sytten spil under `public/spil/<navn>/`
uden afhængigheder eller build (alle én HTML-fil, undtagen Stenalder, der er tre,
Dybet, der er fire, og Kryds og bolle, Duel, Gulvet er lava, Klodser, Min kat, Miskmask, Blokblast, Slotskamp og Weeee!, der er to). De udrulles sammen
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
| Dybet | `public/spil/dybet/` | Dungeon crawler i Wolfenstein-3D-stil (raycaster på canvas) med Pokémon-agtig turbaseret kamp. Procedurelt genererede labyrinter (altid en vej til trappen), monstre der står stille og spærrer gange, kister med udstyr, evner og potioner; minimap viser kun det udforskede. Spillet går selv, indtil vejen deler sig, og viser så flydende valgknapper. Score = dybde nået, online topliste. **Kan også spilles sammen med en ven**, én på hver telefon — se [Spil sammen](#spil-sammen) og [Dybet sammen](#dybet-sammen). Fire filer: `motor.mjs` (regler, enhedstestet), `sammen.mjs` (to helte i den samme labyrint, enhedstestet), `sprites.mjs` (pixel-art som tekst), `index.html`. |
| Kryds og bolle | `public/spil/kryds/` | Klassisk tre på stribe, hot-seat for to på samme skærm eller mod computeren i tre sværhedsgrader: Nem (spiller mest tilfældigt og overser trusler), Mellem (vinder og blokerer, men vælger hvert andet træk tilfældigt) og Svær (perfekt minimax – kan ikke slås). Startspilleren skifter for hvert parti, så begge får fordelen. **Kan også spilles mod en ven over nettet**, én på hver telefon — se [Spil sammen](#spil-sammen). To filer: `motor.mjs` (regler + computerspiller, enhedstestet) og `index.html`. Ingen topliste – der er ikke noget at måle i. |
| Gulvet er lava | `public/spil/lava/` | Selmas idé: stuen set fra siden, hvor gulvet bliver til lava, og lavaen stiger nedefra. Man går til venstre og højre og hopper op ad sofaen, bordet, reolen, klaveret og flyttekasserne, mens de bliver smallere og længere fra hinanden. Trampolinpuffen skyder en ekstra højt op, flyttekasser styrter i lavaen kort efter man er landet på dem, og isterninger holder lavaen nede i tre sekunder. Score = hvor højt man nåede i meter, online topliste. To filer: `bane.mjs` (fysik og banegenerator, enhedstestet) og `index.html`. Se «Gulvet er lava – styring og bane» nedenfor. |
| Obby | `public/spil/obby/` | One-button-platformspil på canvas: hop fra flyvende firkant til flyvende firkant med mellemrum eller et tryk. Rød laser på hver anden firkant, lava i bunden, checkpoint på hver femte, og TRY AGAIN når man dør. Banen er uendelig og genereres, så hvert spring kan nås (bot-testet i `test/obby.test.mjs`) — også ved den høje fart, for farten stiger, jo længere man kommer, og banen genereres ud fra netop den fart. Checkpointet har en høj flagstang (blå = ikke nået, grøn med flueben = nået), og både TRY AGAIN og «tryk for at starte» skriver hvilket checkpoint man fortsætter fra — før stod figuren oven på et lillebitte mærke, så det så ud som om checkpointet ikke gjorde noget. **Coins får man kun på checkpoints** (3 pr. nyt checkpoint, dvs. 3 for hver 5. firkant) og kan købe blandt 14 skins til højst 100 coins, nogle med hat; butikken kan åbnes midt i et løb og fryser spillet imens. Tallet 3 er valgt, så et godt løb til firkant 50 giver 30 coins og et langt løb til 100 giver 60: en dyr skin kan spares op på et par gode løb, men aldrig på ét. Score = hop i træk uden at dø (uafhængig af coins); navnet skrives på startskærmen, og en ny rekord ryger selv på toplisten. Øverst på startskærmen står **«Lavet af»** – Sofie fandt på spillet, Far og Claude byggede det – efter Sofies ønske om, at der skulle stå hvem der har lavet det. Den står lige under titlen og ikke nederst som en rulletekst: startskærmen er højere end en telefonskærm, så alt under Spil-knappen skal man rulle ned til. |
| Klodser | `public/spil/klodser/` | Selmas ønske om Roblox, oversat til noget der kan ligge her: en 3D-verden af klodser (WebGL på canvas, ingen biblioteker) med sin egen klodsefigur set bagfra. Verdenen er en ø på 40 × 40 klodser med bakker, søer, strande og træer, og havet uden om går ud til horisonten. Man løber rundt med joystick + HOP, kigger ved at trække på skærmen, bygger og river ned med ti farver klodser, og kan skifte til første person. 12 guldklodser er gemt rundt omkring – hver med en lysstråle op i luften, så de kan findes – og tiden det tager at samle dem alle er scoren på toplisten (laveste vinder). Verdenen gemmes i `localStorage` som «frø + de klodser du selv har ændret», så det man har bygget står der næste gang. Man træder automatisk op ad én klods, så bakker ikke kræver hop. To filer: `verden.mjs` (verden, fysik og sigte, enhedstestet) og `index.html`. |
| Miskmask | `public/spil/miskmask/` | Selmas ønske om «en verity app» – en *variety* app, altså én app med mange forskellige småting i. Det er blevet til 13 bittesmå spil i en pose: tryk på knappen, find den anderledes, prik ballonerne, fang den, det største tal, passer regnestykket, find farven, find bogstavet, hvor mange, tag stjernerne (ikke bomben), tryk N gange, tryk tallene i rækkefølge – og «RØR IKKE!», som man vinder ved at holde fingrene i skødet. Ét ad gangen, med 5 sekunder i starten og 2,2 ved fuld fart (runde 21), og tre liv. Alle minispil deler den samme regel – nogle felter er rigtige, resten er fælder – så et nyt minispil kun skal beskrive, hvad der står på skærmen. Posen trækkes som sedler, så alle 13 kommer, før nogen kommer igen. Score = antal klarede minispil, online topliste. To filer: `mikro.mjs` (de 13 spil og reglerne, enhedstestet) og `index.html`. Se «Miskmask – kvadratet og de 13 minispil» nedenfor. |
| Min kat | `public/spil/kat/` | Selmas ønske om «My Cat»: et kæledyr man passer. Man adopterer en killing, giver den et navn, og så har den fire behov – mæt, glad, ren og frisk – som siver nedad med tiden, også mens man er væk. Man giver mad i skålen, kaster garnnøglet (tryk på gulvet, katten løber efter det), børster pelsen med fingeren og putter den i kurven, hvor stuen bliver mørk og månen kommer frem. Katten tegnes på canvas (ingen billeder) og blinker, logrer, spinder når man klapper den, og får snavsede pletter, hvis den ikke bliver børstet. Man tjener mønter og erfaring for **det, man faktisk fylder op** – en mæt kat giver ingenting, så man kan ikke trykke sig til mønter – og køber pelse, hatte og halsbånd i butikken. Score = kattens niveau, online topliste. To filer: `kat.mjs` (behov, erfaring, butik og den gemte kat, enhedstestet) og `index.html`. |
| Blokblast | `public/spil/blokblast/` | Selmas ønske om «Block blast»: et bræt på 8 × 8 og tre brikker ad gangen, som man trækker ned på brættet – ingen drejning, ingen tyngdekraft. Fylder man en hel række eller søjle, blæser den væk. Ét point pr. felt man lægger, 10 × linjer² for det man rydder, og en stime, der ganger op til ×2,5, hvis man rydder flere gange i træk. Nye brikker kommer først, når alle tre er brugt, og der trækkes om, indtil mindst én af dem kan være på brættet. Spillet er slut, når ingen af de tre kan ligge nogen steder; brættet gemmes undervejs, så man kan lukke fanen og fortsætte. Score = point, online topliste. To filer: `blokke.mjs` (bræt, brikker, rydning og point, enhedstestet) og `index.html`. Se «Blokblast – brikken over fingeren» nedenfor. |

| Slotskamp | `public/spil/slotskamp/` | Selmas ønske om «Clash royale»: en kamp på to minutter mod en computermodstander. Banen er delt af en flod med to broer, og hver side har et kongetårn og to vagttårne. Man har otte kort i bunken, fire på hånden, og magi, der fylder op af sig selv (dobbelt de sidste 40 sekunder). Tropperne går selv frem, slår på det, de møder, og går efter tårnene; Kæmpen går udenom alt andet, Kanonen står stille, og Ildkugle og Lyn kan kastes hvor som helst. Et vagttårn giver én krone, kongetårnet vinder med det samme, og står det lige, spilles der forlænget, hvor det første tårn afgør det. Modstanderen bliver hårdere for hver anden sejr i træk (Nybegynder → Øvet → Skarp → Mester). Score = **sejre i træk**, online topliste. To filer: `kamp.mjs` (bane, kort, tropper, tårne og modstanderen, enhedstestet) og `index.html`. Se «Slotskamp – kampen og modstanderen» nedenfor. |
| Weeee! | `public/spil/weee/` | Selmas ønske, der bare lød «Weeee» – lyden man laver, når det går stærkt ned ad bakke. Det er blevet til en kælketur ned ad en uendelig bjergside med ét eneste tryk: holder man fingeren nede, trykker man sig ned i sneen og får mere fart, men klæber også fast; slipper man på kanten af en bølge, letter man og flyver. I luften dykker man ved at holde igen, så man kan lande parallelt med bakken og beholde farten – en landing på tværs koster det meste. Bagved kommer en lavine, der bliver hurtigere for hvert sekund, så den eneste vej er fremad. Den gule streg på sneen viser, hvor man ville lette lige nu, og HUD'en siger hvad fingeren skal. Score = meter, online topliste. To filer: `bakke.mjs` (bakke, fysik og lavine, enhedstestet) og `index.html`. Se «Weeee! – det ene tryk og bjerget» nedenfor. |

Alle spil gemmer highscore/fremskridt i `localStorage` under `zydy.<navn>.*`,
kan seedes med `?seed=123` og eksponerer `window.GAME` til tests.

Alle spillene med en score — Tårn, Sæt, Farvesortering, Duel, Obby, Gulvet er
lava, Klodser, Miskmask, Blokblast, Slotskamp og Weeee! — kan desuden spilles som
et **kapløb** mod en ven: samme spil, hver sin telefon, og stillingen står øverst
på skærmen hele tiden. Se [Kapløb](#kaploeb).

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
ven, kan man se hvor hen er, hoppe med ind i det spil, hen er i gang med — og
invitere hen til at spille *sammen*, se [Spil sammen](#spil-sammen).

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

#### Kælenavne — dit eget navn til en ven

Trykker man på en ven, kan man give hen et **kælenavn**: «Selma» bliver til
«Smølfen» overalt, hvor hun nævnes — på brikken i panelet, i invitationerne til
at spille sammen, og i «spiller nu»/«er her nu» på forsiden (`navneliste()` i
`public/index.html` spørger `Venner.visNavn`, hvis den findes). Det rigtige navn
står småt under kælenavnet, så man altid kan se hvem det er. Et tomt felt
fjerner kælenavnet igen.

Kælenavnet er **mit navn til vennen, ikke vennens navn**, og derfor:

- Det ligger kun i `localStorage` under `zydy.kaelenavne`, aldrig i databasen —
  vennen kan hverken se eller ændre det, og der er ikke noget at rydde op i,
  hvis det bliver til drilleri.
- Det er gemt under den, der gav det (`{ "sofie": { "selma": "Smølfen" } }`), så
  en delt iPad ikke blander to børns kælenavne sammen, når navnet skiftes med
  «Ikke Sofie, der spiller?».
- Toplisterne rører vi ikke: dér står det navn, man selv har skrevet. Ellers
  ville en rekord kunne stå under et navn, ingen andre kender.

Koden er `kaelenavn`/`saetKaelenavn`/`visNavn` øverst i `public/venner.js`
(også på `window.Venner`, så testen kan nå dem).

<a id="spil-sammen"></a>

### Spil sammen — venner kan joine hinanden

Der er to slags: de spil, hvor de to deler ét parti (her), og et **kapløb** i
alle de andre ([se nedenfor](#kaploeb)) — det er den, der gør, at man kan joine
hinanden i næsten alle spil uden at skulle skrive netværkskode i hvert enkelt.

Trykker man på en ven, står der en knap pr. spil, to kan spille sammen — i dag
**«🎮 Spil Kryds og bolle sammen»** og **«🎮 Spil Dybet sammen»**. Så laves
der et *rum*, man selv sendes ind i (`/spil/kryds/?rum=K7QFD`), og vennen får
invitationen øverst på forsiden: «Sofie vil spille Kryds og bolle med dig» med
knappen **«Hop med!»**. Begge lander i det samme spil på hver sin telefon: den
der inviterede er vært og begynder, man kan kun trykke, når det er ens tur, og
starter den ene forfra, følger den anden med. Går den ene, får den anden det at
vide («Selma gik») i stedet for at sidde og vente.

| Del | Fil | Hvad |
|---|---|---|
| Database | tabellen `rum` i `schema.sql` | Ét rum pr. par: `rum(kode, spil, vaert, vaert_navn, gaest, gaest_navn, status, version, tilstand, opdateret)`. `status` er `'inviteret'`, `'igang'` eller `'slut'`. `tilstand` er spillets egen JSON. Rum uden aktivitet i tre timer ryddes (`RUM_TIMER`). |
| API | `src/worker.mjs` → `src/rum.mjs` | `POST /api/rum {navn, ven, spil}` inviterer (kun en ven, og kun til et spil i `SAMMEN` eller `KAPLOEB`). `GET /api/rum?navn=` giver mine invitationer og igangværende spil. `GET`/`POST /api/rum/<kode>` med `handling`: `'kom'` (hop med), `'nej'` (nej tak / jeg går), `'gem'` (skriv stillingen), `'se'`. |
| Klient i spillene | `public/spil/rum.js` | `Rum.kode()`, `hent`, `kom`, `forlad`, `gem` og `foelg(kode, naar)`, som kigger efter den andens træk hvert 1,2 sekund, mens fanen er fremme. |
| Klient på forsiden | `public/venner.js` | Invitationerne øverst i venne-panelet (hentes hvert 5. sekund — de haster) og «Spil … sammen»-knapperne i venne-dialogen. |

Tre ting er værd at huske:

1. **Serveren kender ikke spillets regler.** `tilstand` er spillets egen kasse,
   og i stedet for at dømme trækkene passer serveren på, at de to ikke skriver
   oven i hinanden: hver skrivning oplyser den `version`, den blev tegnet ud
   fra, og den, der kommer for sent, får rummet tilbage og tegner det i stedet.
   Til et turbaseret spil er det rigeligt, og næste spil kan bruge det samme.
2. **Man kan kun invitere sine venner** (`venner`-tabellen skal have et ja
   begge veje), og kun til et spil, der siger, det kan spilles sammen. Det er
   hele værnet — der er stadig hverken konti eller login.
3. **Invitationen venter.** Er vennen ikke på siden, står den bare på forsiden,
   til hen kommer. Derfor sendes værten ind i spillet med det samme og får en
   venteskærm; det er nemmere at forstå end en knap, der ikke sker noget ved.

**Gør et nyt spil «sammen»-klar:** skriv `"sammen": true` i spillets
`kort.json` og kør `node scripts/byg-forside.mjs` (så kommer det med i `SAMMEN`
i `src/spil-data.mjs` og får `data-sammen` på kortet). Indlæs
`<script src="/spil/rum.js"></script>` i spillet, og lad det hente rummet, når
`Rum.kode()` giver en kode: tegn brættet efter `rum.tilstand`, send din egen
stilling med `Rum.gem(kode, tilstand, version)`, og følg med i den andens træk
med `Rum.foelg`. Kryds og bolle er det enkle forbilledet
(`public/spil/kryds/index.html`, afsnittet «Spil sammen: rummet»); Dybet viser,
hvordan man gør det med et spil, der er alt for stort til at sende — se
nedenfor.

<a id="kaploeb"></a>

### Kapløb — join hinanden i alle de andre spil

At dele ét parti er dejligt, men det koster netværkskode i hvert enkelt spil, og
de fleste af spillene her er alene-spil, hvor der slet ikke er noget parti at
dele. Et **kapløb** er den lette udgave, som virker alle vegne: de to spiller
hver sit spil på hver sin telefon i det samme rum, og stillingen står i en lille
pille øverst på skærmen hele tiden:

```
🏁 Du 420 m · 👑Selma 560 m
```

Den **bedste runde** tæller, man må spille så mange runder man vil, og trykker
man på pillen, folder hele stillingen sig ud med «Stop kapløbet» og en vej hjem.
Elleve spil er med: Tårn, Sæt, Farvesortering, Duel, Obby, Gulvet er lava,
Klodser, Miskmask, Blokblast, Slotskamp og Weeee!

| Del | Fil | Hvad |
|---|---|---|
| Reglerne | `public/spil/kaploeb-regler.mjs` | Ren JS uden browser: stillingen, «bedste runde», fletning og teksterne. Enhedstestet i `test/unit/kaploeb.test.mjs`. |
| Skærm og netværk | `public/spil/kaploeb.js` | Modul, der henter rummet, hopper med som gæst, tegner pillen og panelet, og skriver min halvdel op med `Rum.gem`. |
| Rummet | `src/rum.mjs` (uændret) | Et kapløb er et helt almindeligt rum — serveren kender stadig ingen regler. |
| Forsiden | `public/venner.js` | «🏁 Tag et kapløb» i venne-dialogen: ét mærke pr. spil med `data-kaploeb`. |

**Gør et spil kapløbs-klar** — tre ting, og ingen delte filer:

```jsonc
// public/spil/<id>/kort.json
{ "kapløb": true, "højscore": { "maks": 2000 } }   // og kør node scripts/byg-forside.mjs
```

```html
<script src="/spil/rum.js"></script>
<script type="module" src="/spil/kaploeb.js"></script>
```

```js
// dér hvor runden er slut (samme sted som Highscore-kaldet)
if (window.Kaploeb) Kaploeb.slut(score, score + ' blokke');
if (window.Kaploeb) Kaploeb.slut(sek, tidTekst(sek), 'asc');   // hurtigst vinder
```

Fire ting er værd at huske:

1. **Hver skriver kun sin egen halvdel** af `tilstand` (`vaert`/`gaest`), så de
   to aldrig skændes om det samme felt. Kommer man for sent (rummet har skiftet
   version), skriver man bare sin halvdel oven i det friske rum og er færdig —
   ingen fletning af andres data, ingen tabte runder.
2. **Min egen halvdel er den lokale**, ikke serverens: pillen viser min score i
   samme nu, runden er slut, uanset om nettet er med. Ved genindlæsning fletter
   `flet()` med det, der står i rummet, så en tidligere runde ikke forsvinder.
3. **Man må spille, før vennen hopper med.** Værten sendes ind i spillet med det
   samme, og en score, der ikke kunne skrives endnu (rummet står på
   `'inviteret'`), bliver liggende og prøves igen hvert 3. sekund — derfor står
   der «🏁 Du 3 blokke · venter på Selma…» og ikke bare «venter».
4. **Pillen ligger oven på spillets egen top.** Den er med vilje lille og kun
   der, mens man er i et kapløb; `?rum=` i adressen er hele kontakten, så uden
   den kører spillet præcis som før. Stopper man kapløbet, fjernes `?rum=` fra
   adressen, så en genindlæsning bare er det almindelige spil.

Ikke alle spil er med, og det er med vilje: Kryds og bolle og Dybet deler et
rigtigt parti (bedre end et kapløb), Helteriget og Stenalder er hot-seat for to
på én iPad, Ordstige har én opgave om dagen, og Min kat er en killing, der vokser
over uger — ingen af dem har en «runde», man kan måle mod hinanden.

Test: `test/kaploeb.test.mjs` (repoets tredje to-browser-test: Sofie udfordrer
Selma i Tårn, begge spiller rigtige runder, føringen skifter, og den ene stopper)
+ `test/unit/kaploeb.test.mjs`, som også fejler, hvis et spil siger `"kapløb":
true` uden at have ledningerne i.

<a id="dybet-sammen"></a>

### Dybet sammen — to helte i den samme labyrint

Dybet kan spilles af to venner på hver sin telefon. Reglerne ligger i
`public/spil/dybet/sammen.mjs` (ren JS, enhedstestet i
`test/unit/dybet-sammen.test.mjs`) oven på den almindelige `motor.mjs`:

- **Holdet går sammen.** Man skiftes til at vælge vej, hver gang vejen deler
  sig; derimellem går spillet selv videre, præcis som når man spiller alene.
- **I kamp skiftes man til at slå**, og monsteret slår igen på den, der lige
  slog. Falder den ene, kæmper den anden videre og rejser makkeren op, når
  kampen er slut. Går begge ned, er turen slut på den samme dybde.
- **Erfaringen deles**: begge helte får den for hvert monster, også den der lå
  ned. Kisternes indhold ryger derimod i tasken hos den, der åbnede dem — og
  eftersom man skiftes, går det lige op.

Fire ting er værd at huske:

1. **Labyrinten sendes ikke — den genereres.** Rummet har plads til 4000 tegn,
   og et helt Dybet-niveau er langt større. Men labyrinten kommer ud af ét tal,
   så begge telefoner graver den samme ud af `seed` + dybden
   (`dungeonFroe`). I rummet står kun det, der har flyttet sig: hvor holdet
   står, monstrenes liv, hvilke kister der er åbnet, og de to heltes egne tal.
   Dybt nede fylder stillingen omkring 1500 tegn.
2. **Kampterningerne har deres eget frø.** Ellers ville labyrinten på næste
   dybde afhænge af, hvor mange slag der blev byttet på denne — og de to
   telefoner kaster ikke terningerne i samme rækkefølge. Kun den, det er tur
   til, regner; resultatet sendes færdigt.
3. **Den gåede vej følger med** (`spil.vej`: 0-3 = «gå ét felt den vej», 4-7 =
   «drej på stedet»), så makkerens skærm animerer den samme tur ned ad gangen i
   stedet for at hoppe. Uden den ville det se ud, som om man teleporterede.
4. **Beskederne skrives om ved læsningen, ikke ved skrivningen.** Motoren siger
   «Du angriber med kniv»; hændelsen får bare et `af: 'vaert'` med, og
   `tekstFor()` gør den til «Sofie angriber med kniv» hos den, der ser med. Så
   er der kun ét sæt tekster at vedligeholde.

Test: `test/dybet-sammen.test.mjs` (to browsere, hele vejen fra invitationen på
forsiden til en kamp, hvor begge slår) + `test/unit/dybet-sammen.test.mjs`.

### Feedback-loopet

`../zydy-feedback-loop.mjs` (i `Projekter/`, ikke i dette repo) kan stå og køre
i baggrunden: hvert 30. sekund spørger den databasen om uløste ønsker, og er der
et, laver den en git-worktree ud fra `origin/main` og sætter en Claude-arbejder
til at bygge, teste, committe og pushe det — og først derefter markere ønsket
som løst. Det er arbejderen, ikke loopet, der sætter `loest`, og loopet tjekker
bagefter i databasen, om det rent faktisk skete; gjorde det ikke, prøver den
igen (tre gange, så springer den ønsket over). Se filens hoved for flag.

<a id="nyt-paa-zydy"></a>

### Nyt på Zydy — release notes

Øverst på forsiden står knappen **«✨ Nyt på Zydy»**. Den åbner listen over
hvad der er lavet på siden: hvornår, hvad, hvilket spil det handler om, og
**hvem der havde ønsket sig det** — for næsten alt her er bygget, fordi nogen
skrev et ønske i «Mangler der noget?». Knappen **lyser op med et antal**, når
der er kommet noget til, siden man sidst kiggede.

| Del | Fil | Hvad |
|---|---|---|
| Listen | `public/nyheder.json` | `{nyheder: [{nr, dato, spil, titel, hvad, oensket}, …]}`, nyeste først. `nr` tæller opad og er den «version», browseren husker. `spil` er mappenavnet under `public/spil/` — eller `""`, hvis det er hele siden. |
| Klient | `public/nyheder.js` | Knappen i toppen (ved siden af navneknappen) og dialogen med listen. Spillenes navne og links slås op i kortene på forsiden, så et spil kun hedder noget ét sted. |

Der er **ingen server og ingen database** i det: filen udrulles sammen med
resten, og «sidst set» er det højeste `nr`, man har åbnet listen med, gemt i
`localStorage` under `zydy.nyheder.set`. Har man aldrig været inde, er alt nyt.
Mærkaterne bliver stående, mens dialogen er åben, men knappen holder op med at
lyse med det samme — ellers ser det ud, som om man overså noget. Kan filen ikke
hentes, er der ingen knap, og forsiden ser ud som før.

**Har du lavet noget? Skriv det på listen.** Det er hele pointen — ellers står
der ikke noget nyt, næste gang børnene kigger:

```jsonc
{ "nr": 14,                      // det højeste nr i filen + 1
  "dato": "2026-09-13",          // i dag
  "spil": "obby",                // mappenavnet, eller "" for hele siden
  "titel": "Kort og forståeligt", // højst 60 tegn
  "hvad": "En sætning eller to om hvad man nu kan – skrevet til et barn.",
  "oensket": "Sofie" }           // den der bad om det
```

Listen begynder 2026-09-12; det, der blev lavet før, står kun i git.
`test/unit/nyheder.test.mjs` fejler, hvis en linje mangler noget, hvis to har
samme `nr`, eller hvis `spil` ikke er et spil, der findes.

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

### Slotskamp – kampen og modstanderen

Spillet kom af Selmas ønske «Clash royale». Det er ikke en kopi – der er ingen
konti, ingen kister og ingen at spille mod online – men de fem ting, spillet
handler om, er der: **magi der fylder op**, **fire kort på hånden**, **tropper
der går selv**, **broerne** og **tårnene**. Reglerne bor i `kamp.mjs`, som ikke
rører DOM'en; `index.html` tegner dem og tager imod fingeren.

**Alt går gennem `spilKort()` – også modstanderen.** Botten har sin egen hånd,
sin egen magi og sin egen halvdel, og den spiller ved at kalde den samme
funktion som et menneske. Derfor kan den ikke snyde, og derfor kan den spille
mod sig selv: `botTræk(stand, side, niveau, bane)` er skrevet for begge sider,
og enhedstesten bruger netop det til at måle, at Mester slår Nybegynder klart
oftere end omvendt. Sværhedsgraderne er skruet sammen af fire tal: hvor længe
den nøler, hvor tit den svarer på et angreb, hvor tit den **sjusker** (smider et
tilfældigt kort et tilfældigt sted hen), og hvor meget magi den vil have, før
den selv angriber. Det er sjusket, der gør Nybegynder til en modstander, man kan
vinde over — en bot, der bare reagerer langsomt, spiller stadig rigtigt.

**Modstanderen følger stimen.** Man vælger ikke sværhedsgrad: den stiger for
hver anden sejr i træk (`niveauFraStime`), og det er også sejre i træk, der står
på toplisten. Taber man, starter stimen forfra – så er man tilbage ved
Nybegynder, og det er meningen: det er dér, man kan vinde igen.

**`tik(stand, dt)` deler tiden op i faste skridt på 0,05 sekunder.** Derfor
forløber kampen ens, uanset om der tegnes 60 gange i sekundet eller spoles to
minutter frem på et øjeblik i en test (`GAME.frem(sek)`). Den, der tegner, skal
selv sørge for ikke at komme med et kæmpe spring – billedsløjfen klipper `dt`
til 0,1 sekund og står stille, mens fanen er skjult.

**Pathing uden pathfinding:** en tropp går lige mod sit mål, med én undtagelse –
ligger målet på den anden side af floden, går den først mod broen i sin egen
bane. Det er hele forklaringen på, hvorfor tropperne klumper sig sammen ved
broerne, præcis som i forbilledet. En tropp går efter vagttårnet i sin egen
bane; er det væltet, går den efter kongen.

**Tiden:** 2 minutter, dobbelt magi de sidste 40 sekunder. Står det lige, når
uret er ude, spilles der forlænget i 60 sekunder, hvor det første tårn, der
falder, afgør det. Falder der intet, vinder den, hvis mest forslåede tårn står
bedst – ellers ville alt for mange kampe ende i ingenting.

### Weeee! – det ene tryk og bjerget

Ønsket var ét ord: «Weeee». Det er lyden, man laver, når det går stærkt ned ad
bakke – så spillet er en kælketur, og alt i det handler om at genskabe netop den
lyd. Fysikken bor i `bakke.mjs` (ren JS, enhedstestet); `index.html` tegner den.

**Ét tryk med to betydninger.** På sneen trykker man sig ned: bakken trækker
`TUNG` (2,6) gange hårdere, så man tager fart – men man **letter ikke**, mens
man holder. I luften dykker man med den samme faktor. Kunsten er derfor «hold
nede på det stejle, slip på kanten», og det er dét, hele spillet er bygget op
om. Prisen for at holde hele vejen er, at man aldrig kommer i luften — og
luften er hurtigere end sneen, fordi `LUFT_MOD` er en brøkdel af `JORD_MOD`.
Enhedstesten måler netop dét: en spiller, der bare holder fingeren nede hele
turen, kommer ~30 % kortere end den, der bruger kanterne.

**Man letter, når bakken falder væk under en.** Betingelsen i `jordSkridt` er,
at jorden falder mere på det næste skridt, end et frit fald ville: `jordFald <
vy·dt − ½g·dt²`. Det svarer til, at farten i anden gange bakkens krumning slår
tyngdekraften, og det er derfor `lavBakke` også giver `krum(x)`. To ting faldt
ud af det undervejs:

- **Luftskridtet skal bruge nøjagtig den samme formel.** Regner man højden som
  `vy·dt` (og trækker tyngdekraften fra farten først), falder man dobbelt så
  meget i det første skridt som betingelsen for at lette regnede med – og så
  lander man i samme skridt, man lettede. Hoppene blev ét skridt lange, og
  spillet så ud, som om det slet ikke virkede.
- **Bølgerne skal være krumme nok, ikke høje nok.** Krumningen er
  `højde·(2π/bølgelængde)²`, så korte bølger giver kant. Til gengæld må bølgerne
  ikke være så høje, at man kan komme til at skulle *op* ad bakke: bjerget
  falder 1,25 m pr. meter (`HÆLD`), mere end bølgerne kan hæve det, så det går
  nedad hele vejen. Enhedstesten går 3 km igennem og fejler, hvis man nogen
  steder skal mere end 2 m op – ellers kunne man stå fast i en dal og vente på
  lavinen uden selv at have gjort noget forkert.

**Landingen er en vinkel.** `landingsKvalitet` sammenligner farten
retning med bakkens hældning: helt parallelt beholder man farten (og får
`PERFEKT_SKUB` oveni), på tværs mister man det meste. Det er både straffen for
at flyve i blinde og grunden til, at man holder igen i luften for at få næsen
ned.

**Lavinen er uret.** Den starter 70 m bagude, bliver 0,35 m/s hurtigere for hvert
sekund og sakker aldrig mere end `LAV_HALE` (70 m) bagud. Derfor slutter alle
ture – en god på 60-80 sekunder, en dårlig på 40 – og derfor er der noget på
spil ved at køre langsomt. Score = meter.

**Botten er en målestok, ikke en regel.** `bot(s)` spiller turen videre to
gange – én hvor den holder, én hvor den slipper – og vælger det, der bringer den
længst efter 2,5 sekunder. Den er hverken klog eller pæn, men den er
uafhængig af, hvad vi *tror* er den rigtige måde at spille på, og det er
netop dét, der gør den brugbar til at afgøre, om det kan betale sig at flyve.
Playwright-testen bruger den samme bot til at køre en hel tur igennem med
`GAME.botTur()`.

**Den gule streg** på sneen viser, hvor man ville lette, hvis man slap nu. Uden
den kan man ikke gætte, hvornår man skal slippe – men den skal være **kort**:
ved høj fart ville man teknisk set lette på hele den stejle side, så `KANT` i
index.html kræver, at krumningen også er der. Ellers lyser det halve bjerg, og
stregen holder op med at betyde «slip her».

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
node --test test/unit/*.test.mjs     # Stenalders regelmotor, Dybets motor og «spil sammen»-lag, Kryds og bolles computerspiller, Duel-botten, Gulvet er lavas bane, Klodsers verden og fysik, Min kats behov og butik, Miskmasks 13 minispil, Blokblasts bræt og point, Slotskamps kamp og modstander, Weeee!s bakke og fysik, kapløbets stilling, forsidens kort, nyhedslisten, højscore-, aktivitets-, idé-, venne- og rum-API'et (ingen browser, ~5 sek.)
```

Playwright-testene kører uden Cloudflare, fordi `test/api-mock.mjs` sætter
serveren op i hukommelsen: den kalder den **rigtige** Worker-kode
(`haandterApi` og `haandterAktivitet`) med lagre i hukommelsen i stedet for D1,
så testene ser de samme svar som i drift. Hver test begynder med

```js
const api = await mockApi(page);    // før testens egen page.route, som så vinder
```

og kan bagefter kigge i `api.log.aktivitet`, `api.scores`, `api.ideer.rows`,
`api.venner.rows` og `api.rum.rows`. Tårn, Sæt, Dybet
og Obby lægger deres egen `page.route('**/api/highscore/**')` ovenpå, når de
har brug for en bestemt startliste. API'erne testes desuden hver for sig i
`test/unit/highscore.test.mjs`, `test/unit/aktivitet.test.mjs`,
`test/unit/ideer.test.mjs`, `test/unit/venner.test.mjs` og
`test/unit/rum.test.mjs`. Forsiden har fire
browser-tests: `test/forside.test.mjs` (navn, ønsker, «hvem er her»),
`test/venner.test.mjs` (spørg, sig ja, se hvem der spiller hvad, giv en ven et
kælenavn, fjern en ven — den anden part spilles af testen selv gennem
`api.venner`),
`test/nyheder.test.mjs` («Nyt på Zydy», hvor en ekstra nyhed serveres gennem
`page.route('**/nyheder.json')`, så det kan prøves at der kommer noget til) og
`test/rum.test.mjs` («spil sammen»). Den sidste er én af repoets tre tests med
**to browsere** (de to andre er `test/dybet-sammen.test.mjs` og
`test/kaploeb.test.mjs`): Sofie og Selma har
hver sit vindue med sit eget `localStorage`, men deler API'et
(`mockApi(side, { delMed: api })`), så et helt parti Kryds og bolle — eller en
tur ned i Dybet — kan spilles på tværs af to telefoner, præcis som i drift.
Vil man prøve
hele kæden lokalt mod en lokal D1-database:

```bash
npx wrangler@4 dev --port 8790      # http://localhost:8790/spil/taarn/  (kør schema.sql --local først)
```

`test/run.mjs` starter en lokal server og kører `test/*.test.mjs` i headless
Chromium med iPhone 13-profil: hvert spil spilles igennem via UI og
`window.GAME`, der tjekkes for console-fejl og vandret scroll, og der gemmes et
screenshot i `test/shots/`. Har man `playwright` i `node_modules`, kan
`PLAYWRIGHT` udelades.

Serveren tager port 4180 (`PORT=4190 node test/run.mjs` vælger en anden, når
flere sessioner kører på én gang). Er porten allerede optaget — af en anden
session eller af en server, der er blevet hængende fra en worktree, som siden er
fjernet — så fejler `python3 -m http.server` stille, og *alle* tests rammer den
fremmede server. Derfor tjekker `run.mjs`, at det er vores egen forside, der
svarer, og prøver ellers den næste port og siger det højt. 23 tests, der fejler
på én gang, er næsten altid dét og ikke 22 spilfejl.

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
  "kapløb": true,              // to venner kan tage et kapløb i spillet – se Kapløb
  "højscore": { "maks": 2000 } // udelad, hvis spillet ikke har en topliste
}
```

Generatoren skriver to filer, som **ikke må rettes i hånden**:

| Genereret | Bruges til |
|---|---|
| kort-listen i `public/index.html` (alt mellem markøren og `</ul>`) | selve forsiden |
| `src/spil-data.mjs` (`KORT` + `SPIL` + `SAMMEN` + `KAPLOEB`) | Workerens topliste (`SPIL`), aktivitetstælling (`FORSIDE_SPIL`) og hvad man må invitere en ven til (`SAMMEN`/`KAPLOEB`) |

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

Til sidst: skriv spillet på nyhedslisten i `public/nyheder.json`, så det lyser
op på forsiden hos dem, der har været her før — se [Nyt på Zydy](#nyt-paa-zydy).

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
