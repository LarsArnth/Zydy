# zydy.dk – overblikssiden

Forsiden på **<https://zydy.dk>**: en liste med familiens apps og spil, så
børnene bare skal huske ét domæne. Siden er statisk HTML uden build og uden
afhængigheder. De store apps bor i egne repoer og linkes til; niogtyve spil
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

Ud over links til de andre apps huser repoet niogtyve spil under `public/spil/<navn>/`
uden afhængigheder eller build (alle én HTML-fil, undtagen Stenalder, der er tre,
Dybet, der er fire, og Kryds og bolle, Duel, Gulvet er lava, Klodser, Min kat, Min hund, Miskmask, Blokblast, Slotskamp, Weeee!, Legebyen, Mit liv, Papirøen, Fiskedybet, Copyright, Klaverregn, Til søs!, Flaskehavet, Slanger, Kæmpetal og Elementløbet, der er to). De udrulles sammen
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
| Obby | `public/spil/obby/` | One-button-platformspil på canvas: hop fra flyvende firkant til flyvende firkant med mellemrum eller et tryk. Rød laser på hver anden firkant, lava i bunden, checkpoint på hver femte, og TRY AGAIN når man dør. Banen er uendelig og genereres, så hvert spring kan nås (bot-testet i `test/obby.test.mjs`) — også ved den høje fart, for farten stiger, jo længere man kommer, og banen genereres ud fra netop den fart. **Hele verdenen spoles desuden hurtigere** (`TEMPO0` → `TEMPO_MAKS`, se «Obby: hurtigere uden at banen bliver grovere»), så det starter 25 % hurtigere end før og til sidst går næsten tre gange så hurtigt; ⚡-måleren i HUD'en tæller op fra ×1,3 til ×2,9, og fartstriberne i baggrunden bliver længere. Checkpointet har en høj flagstang (blå = ikke nået, grøn med flueben = nået), og både TRY AGAIN og «tryk for at starte» skriver hvilket checkpoint man fortsætter fra — før stod figuren oven på et lillebitte mærke, så det så ud som om checkpointet ikke gjorde noget. **Coins får man kun på checkpoints** (3 pr. nyt checkpoint, dvs. 3 for hver 5. firkant) og kan købe blandt 14 skins til højst 100 coins, nogle med hat; butikken kan åbnes midt i et løb og fryser spillet imens. Tallet 3 er valgt, så et godt løb til firkant 50 giver 30 coins og et langt løb til 100 giver 60: en dyr skin kan spares op på et par gode løb, men aldrig på ét. Score = hop i træk uden at dø (uafhængig af coins); navnet skrives på startskærmen, og en ny rekord ryger selv på toplisten. Øverst på startskærmen står **«Lavet af»** – Sofie fandt på spillet, Far og Claude byggede det – efter Sofies ønske om, at der skulle stå hvem der har lavet det. Den står lige under titlen og ikke nederst som en rulletekst: startskærmen er højere end en telefonskærm, så alt under Spil-knappen skal man rulle ned til. |
| Klodser | `public/spil/klodser/` | Selmas ønske om Roblox, oversat til noget der kan ligge her: en 3D-verden af klodser (WebGL på canvas, ingen biblioteker) med sin egen klodsefigur set bagfra. Verdenen er en ø på 40 × 40 klodser med bakker, søer, strande og træer, og havet uden om går ud til horisonten. Man løber rundt med joystick + HOP, kigger ved at trække på skærmen, bygger og river ned med ti farver klodser, og kan skifte til første person. 12 guldklodser er gemt rundt omkring – hver med en lysstråle op i luften, så de kan findes – og tiden det tager at samle dem alle er scoren på toplisten (laveste vinder). Verdenen gemmes i `localStorage` som «frø + de klodser du selv har ændret», så det man har bygget står der næste gang. Man træder automatisk op ad én klods, så bakker ikke kræver hop. To filer: `verden.mjs` (verden, fysik og sigte, enhedstestet) og `index.html`. |
| Miskmask | `public/spil/miskmask/` | Selmas ønske om «en verity app» – en *variety* app, altså én app med mange forskellige småting i. Det er blevet til 13 bittesmå spil i en pose: tryk på knappen, find den anderledes, prik ballonerne, fang den, det største tal, passer regnestykket, find farven, find bogstavet, hvor mange, tag stjernerne (ikke bomben), tryk N gange, tryk tallene i rækkefølge – og «RØR IKKE!», som man vinder ved at holde fingrene i skødet. Ét ad gangen, med 5 sekunder i starten og 2,2 ved fuld fart (runde 21), og tre liv. Alle minispil deler den samme regel – nogle felter er rigtige, resten er fælder – så et nyt minispil kun skal beskrive, hvad der står på skærmen. Posen trækkes som sedler, så alle 13 kommer, før nogen kommer igen. Score = antal klarede minispil, online topliste. To filer: `mikro.mjs` (de 13 spil og reglerne, enhedstestet) og `index.html`. Se «Miskmask – kvadratet og de 13 minispil» nedenfor. |
| Min kat | `public/spil/kat/` | Selmas ønske om «My Cat»: et kæledyr man passer. Man adopterer en killing, giver den et navn, og så har den fire behov – mæt, glad, ren og frisk – som siver nedad med tiden, også mens man er væk. Man giver mad i skålen, kaster garnnøglet (tryk på gulvet, katten løber efter det), børster pelsen med fingeren og putter den i kurven, hvor stuen bliver mørk og månen kommer frem. Katten tegnes på canvas (ingen billeder) og blinker, logrer, spinder når man klapper den, og får snavsede pletter, hvis den ikke bliver børstet. Man tjener mønter og erfaring for **det, man faktisk fylder op** – en mæt kat giver ingenting, så man kan ikke trykke sig til mønter – og køber pelse, hatte og halsbånd i butikken. Score = kattens niveau, online topliste. To filer: `kat.mjs` (behov, erfaring, butik og den gemte kat, enhedstestet) og `index.html`. |
| Min hund | `public/spil/hund/` | Selmas ønske, der bare lød «Min hund»: kæledyrsspillet ved siden af Min kat, men med det, der gør en hund til en hund. Man henter en hvalp, giver den et navn og passer fire behov – mæt, glad, ren og **luftet** – hvor «luftet» falder hurtigst og er det eneste, man ikke kan fylde op hjemme i stuen. Man giver mad i skålen, kaster bolden (hunden løber efter den og afleverer den ved dine fødder), sæber den ind i badekarret med fingeren – og går tur i parken, hvor lygtepæle, pinde, katte, en anden hund, mudderpytter og en pose kommer imod jer, og man skal nå at trykke på dem. Hunden kan desuden lære seks tricks i **hundeskolen** (sit, giv pote, dæk, snurr rundt, spring, dødsmand), som låses op efterhånden som den bliver klogere; et trick sidder ikke fast med det samme, og en hund, der er sulten og ikke har været ude, hører dårligere efter. Mønter og erfaring gives kun for **det, man faktisk fylder op**, så en mæt hund og et trick, den allerede kan, giver ingenting. Score = hundens niveau, online topliste. To filer: `hund.mjs` (behov, gåtur, tricks, butik og den gemte hund, enhedstestet) og `index.html`. Se «Min hund – gåturen og hundeskolen» nedenfor. |
| Blokblast | `public/spil/blokblast/` | Selmas ønske om «Block blast»: et bræt på 8 × 8 og tre brikker ad gangen, som man trækker ned på brættet – ingen drejning, ingen tyngdekraft. Fylder man en hel række eller søjle, blæser den væk. Ét point pr. felt man lægger, 10 × linjer² for det man rydder, og en stime, der ganger op til ×2,5, hvis man rydder flere gange i træk. Nye brikker kommer først, når alle tre er brugt, og der trækkes om, indtil mindst én af dem kan være på brættet. Spillet er slut, når ingen af de tre kan ligge nogen steder; brættet gemmes undervejs, så man kan lukke fanen og fortsætte. Score = point, online topliste. To filer: `blokke.mjs` (bræt, brikker, rydning og point, enhedstestet) og `index.html`. Se «Blokblast – brikken over fingeren» nedenfor. |

| Slotskamp | `public/spil/slotskamp/` | Selmas ønske om «Clash royale»: en kamp på to minutter mod en computermodstander. Banen er delt af en flod med to broer, og hver side har et kongetårn og to vagttårne. Man har otte kort i bunken, fire på hånden, og magi, der fylder op af sig selv (dobbelt de sidste 40 sekunder). Tropperne går selv frem, slår på det, de møder, og går efter tårnene; Kæmpen går udenom alt andet, Kanonen står stille, og Ildkugle og Lyn kan kastes hvor som helst. Et vagttårn giver én krone, kongetårnet vinder med det samme, og står det lige, spilles der forlænget, hvor det første tårn afgør det. Modstanderen bliver hårdere for hver anden sejr i træk (Nybegynder → Øvet → Skarp → Mester). Score = **sejre i træk**, online topliste. To filer: `kamp.mjs` (bane, kort, tropper, tårne og modstanderen, enhedstestet) og `index.html`. Se «Slotskamp – kampen og modstanderen» nedenfor. |
| Weeee! | `public/spil/weee/` | Selmas ønske, der bare lød «Weeee» – lyden man laver, når det går stærkt ned ad bakke. Det er blevet til en kælketur ned ad en uendelig bjergside med ét eneste tryk: holder man fingeren nede, trykker man sig ned i sneen og får mere fart, men klæber også fast; slipper man på kanten af en bølge, letter man og flyver. I luften dykker man ved at holde igen, så man kan lande parallelt med bakken og beholde farten – en landing på tværs koster det meste. Bagved kommer en lavine, der bliver hurtigere for hvert sekund, så den eneste vej er fremad. Den gule streg på sneen viser, hvor man ville lette lige nu, og HUD'en siger hvad fingeren skal. Score = meter, online topliste. To filer: `bakke.mjs` (bakke, fysik og lavine, enhedstestet) og `index.html`. Se «Weeee! – det ene tryk og bjerget» nedenfor. |

| Legebyen | `public/spil/legebyen/` | Selmas ønske om «Toca boca»: et dukkehus med fem rum – stuen, køkkenet, badeværelset, butikken og legepladsen – og seks figurer (fem børn og voksne plus hunden Vaks), man trækker rundt med fingeren. Slipper man en ved sofaen, badekarret, gyngen eller rutsjebanen, sætter den sig. Fra bakken nederst tager man ting frem: mad der bliver spist, hatte og solbriller der bliver taget på, og legetøj figuren holder i hånden. Møblerne kan man trykke på – køleskabet giver mad, komfuret en pizza, fjernsynet og bruseren tænder, kassen i butikken sælger, gyngen svinger. Ting man trykker på, ryger i **tasken** og kan komme med ind i et andet rum, og hver figur kan klædes på med hud, frisure, hårfarve, trøje og bukser. **Ingen point og ingen måde at tabe på** – det er fri leg, og byen står, som man forlod den. To filer: `by.mjs` (rum, figurer, ting og hvad der sker, når de mødes, enhedstestet) og `index.html`. Se «Legebyen – dukkehuset» nedenfor. |
| Papirøen | `public/spil/papir/` | Selmas ønske om «Papir io 2»: et stort stykke ternet papir, hvor fire klatter farver hver sit område. Kører man ud fra sit eget, trækker man en streg efter sig – og kommer man hjem igen, bliver hele sløjfen ens, også det, en anden havde farvet inde i den. Men mens man er ude, er man i fare: kører Bo, Ida eller Mikkel over stregen, ryger man ud, og hele området forsvinder fra papiret. Det gælder begge veje, så man kan tage dem på deres streg – og tager man hele deres område, er de også ude. Kanten af papiret er lige så farlig. Man styrer med et lille joystick (træk fingeren dén vej, man vil køre), og minikortet i hjørnet viser hele papiret. Score = den største del af papiret, man nåede at have, i hele procent. `papir.mjs` (papiret, sløjfen og modstanderne) er enhedstestet. `?bots=0` giver papiret for sig selv. **Kan også spilles sammen med en ven**, én på hver telefon, på det samme stykke papir – se [Spil sammen](#spil-sammen) og [Papirøen sammen](#papir-sammen). Tre filer: `papir.mjs`, `sammen.mjs` (de to venner, enhedstestet) og `index.html`. Se «Papirøen – sløjfen og de tre modstandere» nedenfor. |
| Fiskedybet | `public/spil/fisk/` | Timos ønske om «Fish It: Abyss»: en lille båd, fem farvande og en fiskebog, der skal fyldes. Man kaster snøren, og når der hugger, løber en viser frem og tilbage over en bar – et tryk tæller kun i det grønne felt, og store fisk kræver flere rammere og tåler færre forbiere. Fangsten sejles hjem til havnen og sælges, og pengene går til snøren (åbner et farvand mere), stangen (bredere felt), skroget (flere hjerter) og kølerummet (større last). Solskinshavet er trygt; i Hajvandet, Dybhavet, Afgrunden og Tomrummet hugger der ét uhyre hvert sted, og så skal man vælge: klippe snøren, eller tage kampen – taber man, eller når man ikke at bestemme sig, tager det en bid af båden. Går skroget i nul, bliver man slæbt i havn og mister lasten, men aldrig fiskebogen. Score = antal arter i bogen, online topliste. To filer: `hav.mjs` (farvande, dyr, kamp, økonomi og det gemte spil, enhedstestet) og `index.html`. Se «Fiskedybet – baren, farvandene og uhyrerne» nedenfor. |
| Mit liv | `public/spil/mitliv/` | Selmas ønske om «The Sims»: et helt liv i ét hus, set oppefra. Man laver sin egen figur (hud, frisure, hårfarve, trøje, bukser), flytter ind med 600 kr. og fire møbler, og passer seks behov – mæt, energi, toilet, ren, sjov og selskab – der siver nedad, mens spiluret går (ét rigtigt sekund = fem spilminutter). Man trykker på et møbel, og figuren går selv derhen og bruger det, til behovet er fyldt. Om morgenen kører bussen på arbejde: man er væk i seks spiltimer og kommer hjem med løn, der følger humøret, og stjerner mod en forfremmelse – fra avisbud til astronaut i otte trin. Pengene bruges i **byg-tilstand**, hvor 20 møbler kan købes, flyttes og sælges for det halve. Når toilettet ikke kan vente, kommer der en pyt på gulvet, man skal tørre op, og telefonen henter en ven på besøg. Score = **formuen** (penge + alt i huset), online topliste. To filer: `liv.mjs` (behov, veje, møbler og arbejde, enhedstestet) og `index.html`. Se «Mit liv – huset, behovene og arbejdet» nedenfor. |
| Klaverregn | `public/spil/klaverregn/` | Livas ønske, der lød «Et klaver spil»: noderne i en rigtig børnesang falder ned gennem fire baner som fliser (Piano Tiles-agtigt), og man trykker på dem, nederste først. Hvert rigtigt tryk spiller sangens næste node med et lille WebAudio-klaver, så melodien kommer ud af ens egne fingre – Mester Jakob, Blinke blinke stjernelil, Lille Peter Edderkop, Jens Hansens bondegård, Ode til glæden og fødselsdagssangen, i ring og hurtigere og hurtigere. Banen følger tonehøjden (dybe toner til venstre), så man kan se melodien komme. Tre hjerter: en forkert bane eller en flise forbi bunden koster ét – men melodien hopper aldrig et hak ved en fejl. Score = ramte noder, online topliste og kapløb. Siden Livas andet ønske («På ens egen klaver») er der også **Dit eget klaver**: et rigtigt lille klaviatur med hvide og sorte tangenter, hvor man spiller frit eller følger en af sangene i sit eget tempo – den næste tangent lyser, og en forkert tangent giver bare sin egen tone. To filer: `noder.mjs` (sange, fliser og regler, enhedstestet) og `index.html` (canvas, lyd og skærmene). Se «Klaverregn – fliserne, sangene og lyden» nedenfor. |
| Til søs! | `public/spil/sejl/` | Milas' ønske, der bare lød «Betyder man skal sejle»: en sejlbåd set oppefra, som man drejer med ◀ ▶ – men farten bestemmer vinden. Lige op mod vinden blafrer sejlet, og båden ligger stille; halvvind er hurtigst, som på en rigtig sejlbåd. Pilen øverst viser, hvor vinden blæser hen, og den drejer undervejs, så kursen hele tiden skal findes forfra. Skærene skal man uden om (tre liv), men sejlrenden mellem det røde og det grønne sømærke er altid fri – og bagfra kommer et uvejr, der bliver hurtigere hele turen. Score = meter mod nord, online topliste og kapløb. To filer: `baad.mjs` (vind, fartkurve, skær, uvejr og en bot, enhedstestet) og `index.html` (canvas, HUD og skærmene). Se «Til søs! – vinden, skærene og uvejret» nedenfor. |
| Flaskehavet | `public/spil/flaske/` | Milas' ønske, der lød «Handler om en flaske vand havdyr»: en vandflaske driver med strømmen gennem havet, set fra siden. Hold på skærmen, og flasken dykker – slip, og den flyder op, for flasker flyder. Havdyrene – fisk, søheste, skildpadder, blæksprutter, søstjerner og krabber – svømmer ind i flasken, når man rammer dem, og svømmer med derinde, mens vandet i flasken stiger. Brandmænd og søpindsvin skal man uden om: tre stød, og flasken går i stykker. Strømmen bliver hurtigere hele turen, og der kommer flere farer, jo længere man driver ud – men to farer står aldrig tættere end fire meter, så der altid er en vej. Score = havdyr i flasken, online topliste. To filer: `flaske.mjs` (havet, fysikken, fangsten og en bot, enhedstestet) og `index.html` (canvas, HUD og skærmene). |
| Copyright | `public/spil/copyright/` | Selmas ønske om et spil, hvor man «copyrighter en tegning og gætter, hvem der har copyrighten». Et tegne- og gættespil for 3-6 på én iPad, der går rundt: alle tegner det **samme** motiv hver for sig, og når man er færdig, slås ens copyright-stempel på tegningen – men dækket til, så de andre kun ser «©?». Derefter går enheden rundt igen, og hver spiller gætter, hvem der har copyright på hver af de andres tegninger. Afsløringen tager én tegning ad gangen: stemplet vendes, og man kan se, hvem der ramte rigtigt. 10 point for et rigtigt gæt, 5 til tegneren pr. narret – men narrer man **alle**, giver tegningen ingenting. Tre runder med hvert sit motiv. Score = vinderens point, online topliste. To filer: `regler.mjs` (motiver, gæt, point og runder, enhedstestet) og `index.html`. Se «Copyright – stemplet, gættet og pointene» nedenfor. |
| Slanger | `public/spil/slanger/` | Lars' ønske om en Snake.io-klon i firkanter som Papirøen: en slange på en plade af 32 × 32 felter, der kun kan køre i fire retninger – og hele styringen er **to kæmpe drejeknapper** i bunden af skærmen, som 3- og 7-tasten på en gammel Nokia (venstre = mod uret, højre = med uret; trykkene lægges i kø, så to hurtige tryk giver to sving). Spis perlerne og bliv den længste; Otto, Mille og Aksel jager de samme perler, og en død slange bliver selv til perler. Score = længste længde, online topliste. **Kan også spilles sammen med en ven**, én på hver telefon — se [Spil sammen](#spil-sammen). To filer: `slange.mjs` (motor, enhedstestet) + `sammen.mjs` (den fælles plade, enhedstestet) og `index.html`. Se «Slanger – de to knapper og den fælles plade» nedenfor. |
| Elementløbet | `public/spil/elementer/` | Sofies ønske om «et spil som handler om ild, jord, vand og vin – de der fire elementer» (vin læst som vind). Man løber automatisk fremad og **er** et af de fire elementer: fire store knapper i bunden skifter form, og hver forhindring klares af netop ét element – ild brænder tornekrattet, vand slukker bålet, vind flyver over floden, og jord står fast i hvirvelstormen. En boble over forhindringen viser, hvilket element den vil have, så det er fingrene og ikke hukommelsen, der arbejder; tager man alligevel fejl, koster det et liv (af tre), og skærmen siger hvad man skulle have trykket. Forhindringerne lægges med et fast antal **sekunders** mellemrum (aldrig under 0,7 s), så reaktionstiden er den samme, uanset hvor stærkt det går – banen bliver hurtigere og tættere, men aldrig umulig (den perfekte bot i `elementer.mjs` overlever altid, enhedstestet). Score = klarede forhindringer, online topliste og kapløb. To filer: `elementer.mjs` (banen, farten og reglerne, enhedstestet) og `index.html` (canvas, knapperne og skærmene). |
| Kæmpetal | `public/spil/kaempetal/` | Selmas ønske, der lød «man kan møde sine venner man kan mindst Max 9999999999999»: et clicker-spil om at nå det største tal, **9.999.999.999.999**. Tallet selv er knappen – tryk, og det vokser – og i butikken køber man hjælpere (klikkemus, tællekat, talraket, sort hul …), der tæller videre af sig selv, også mens man er væk (dog højst 8 timer, en skoledag). Guldfingeren fordobler hvert tryk, og butikken viser kun de hjælpere, man har mødt, plus én hemmelig «???». Score = alt man har tjent – køb rører den ikke – og den ryger selv på toplisten, hver gang en tierpotens rundes. **Kan spilles sammen med en ven**, én på hver telefon: I ser hinandens tal live, og summen af jeres to tal kan nå loftet – så fejrer I det sammen. Se [Spil sammen](#spil-sammen) og «Kæmpetal – tallet, hjælperne og loftet» nedenfor. To filer: `tal.mjs` (tallet, hjælperne, priserne og loftet, enhedstestet) og `index.html`. |

Alle spil gemmer highscore/fremskridt i `localStorage` under `zydy.<navn>.*`,
kan seedes med `?seed=123` og eksponerer `window.GAME` til tests.

Alle spillene med en score — Tårn, Sæt, Farvesortering, Duel, Obby, Gulvet er
lava, Klodser, Miskmask, Blokblast, Slotskamp, Weeee!, Klaverregn, Til søs!, Flaskehavet og Elementløbet — kan desuden spilles som
et **kapløb** mod en ven: samme spil, hver sin telefon, og stillingen står øverst
på skærmen hele tiden. Se [Kapløb](#kaploeb).

### Online topliste

Har man spillet én gang, står man på listen, som alle kan se. Det kører på
Cloudflares gratis tier og består af tre dele:

| Del | Fil | Hvad |
|---|---|---|
| Database | Cloudflare **D1** `zydy-highscore` (SQLite), skema i `schema.sql` | Én tabel `scores(spil, navn, score, oprettet, token)`. Hvert navn står kun én gang pr. spil, med sin bedste score. Kun de bedste 100 pr. spil beholdes. `token` er den hemmelighed, klienten får ved gemning, og som kræves for at rette navnet bagefter; den kommer aldrig med ud i listerne. |
| API | `src/worker.mjs` → `src/highscore.mjs` | `GET /api/highscore/<spil>` giver **hele listen** (højst `GEM_LAENGDE` = 100 navne) plus spillets regler (`retning`, `min`, `maks`, `unik`). `POST` med `{navn, score}` gemmer og svarer med placering og `token`; står spilleren allerede bedre, gemmes intet, og svaret siger `uaendret` med den stående rekord. `PATCH /api/highscore/<spil>/<id>` med `{navn, token}` retter navnet på en række, man selv har gemt. Rækker fra før reglen om ét navn pr. liste (2026-09-12) filtreres fra ved læsning (`udenDubletter`), så gamle dubletter forsvandt fra listerne med det samme og ryddes i databasen, næste gang navnet gemmer. Navne renses og klippes til 12 tegn, scoren skal være et heltal inden for grænserne i `SPIL`. `retning: 'asc'` bruges når laveste tal vinder (Sæt klassisk: tid i sekunder). Et spil med flere tilstande har én nøgle pr. tilstand (`saet-klassisk`, `saet-blitz`). |
| Klient | `public/spil/highscore.js` | `Highscore.panel(el, { spil, score, format, titel })` henter listen og gemmer selv rekorden. Navnet spørges kun **første gang**; derefter huskes det i `localStorage` (`zydy.navn`, fælles for alle spil), og senere rekorder gemmes automatisk med overskriften «Sofie, du har slået rekorden!» og knappen «Ikke Sofie, der spiller?» til at skifte navn. Uden `score` vises bare listen; `format` gør tal til tekst (fx tid som m:ss). Listen viser de ti øverste og folder resten ud med «Vis alle 37» – se «Alle kommer med på listen» nedenfor. |

Worker'en rammer kun `/api/*` (`run_worker_first` i `wrangler.jsonc`); alt
andet serveres som før direkte fra `public/`. API'et er åbent uden login –
det er et familie-site – så værnet mod pjat er kun validering og trimning.

**Alle kommer med på listen** (Josephines ønske, 2026-09-13). Før skulle en
score ind i top 10, før den overhovedet blev gemt — så en ny spiller kunne
aldrig komme på en liste, der var fuld, og kunne heller ikke se sig selv.
Nu hænger tre ting sammen:

1. `kvalificerer()` i klienten spørger, om der er plads blandt de **100**
   (`PLADSER` = serverens `GEM_LAENGDE`), ikke blandt de ti. Alle spil bruger
   den som port foran `send()`, så alle får ændringen på én gang.
2. Serveren sender **hele listen** i `liste` — både på `GET` og i svaret på
   `POST`/`PATCH` — og `placering` er den rigtige placering i den (nr. 23),
   ikke `null` for alle uden for de ti. 100 rækker er ~6 KB.
3. `tegnListe()` viser de ti øverste. Står ens eget navn længere nede, hænges
   rækken nederst efter et «···» med sin rigtige placering, og under listen
   står «Vis alle 37», som folder resten ud (og ruller hen til ens egen
   række). Listen ruller i sig selv (`max-height:38vh`), så knapperne under
   den ikke skubbes ud af skærmen på en iPhone i højkant.

Det koster en `POST` mere pr. spilomgang for dem, der ikke er i top 10 — det
er billigt, og det er hele pointen: man kan se sig selv rykke op.
`Highscore.iTop(top, score)` findes stadig til ordvalg («Ny rekord!» over for
«Kom med på listen»). Testen er `test/topliste.test.mjs`.

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
ikke om navn igen. Alle spil undtagen Kryds og bolle og Legebyen har topliste
– de to har ikke noget at måle. Ordle bor et andet sted og har alligevel en:
se [Ordle](#ordle--en-topliste-for-et-spil-der-bor-et-andet-sted) nedenfor.

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

#### Ordle — en topliste for et spil, der bor et andet sted

Lars' ønske til Ordle lød «Highscore virker ikke», og det gjorde den ikke:
Ordle ligger på `larsarnth.github.io/ordle` i sit eget repo og kan ikke sende en
score ind til zydy.dk. Kortet var derfor det eneste på forsiden helt uden
topliste og uden 🏆-mærkat. At lade Ordle sende scoren selv ville kræve CORS her
*og* ændringer i det andet repo — så i stedet **tæller forsiden selv**.

Under Ordle-kortet står en lille kasse (`public/ordle.js`):

> Klarede du dagens Ordle? Du har 3 dage i træk. **[Ja!]** [Ikke endnu]

Et ja lægger en dag til stimen, og stimen er scoren på `/api/highscore/ordle`
— «flest dage i træk», ligesom Ordstige. Bagefter står der bare
«🔥 4 dage i træk», og rekordholderen dukker op som 🏆-mærkat på kortet af sig
selv, fordi `ordle` nu har `"højscore"` i sit `kort.json`.

Regnestykkerne ligger i `public/ordle-regler.mjs` (enhedstestet i
`test/unit/ordle.test.mjs`). Fire valg er værd at kende:

1. **Der spørges kun, når der er noget at spørge om:** man har trykket på
   Ordle-kortet i dag, eller man har en stime i gang, der kan reddes. Ellers
   ville hele familien blive spurgt hver dag om et spil, de ikke spiller.
2. **Der er ingen nej-knap.** Den anden knap hedder «Ikke endnu» og gemmer bare
   spørgsmålet resten af dagen. En stime brydes af *kalenderen* (en sprunget
   dag), ikke af et tryk — ellers kunne et kikset tryk koste en stime på 20 dage.
3. **Der tegnes igen ved `pageshow`.** Går man til Ordle og trykker tilbage,
   kommer siden på iPhone fra bfcache uden at køre scriptet igen; uden det ville
   spørgsmålet først dukke op ved næste besøg.
4. **En stime, der ikke kom af sted, prøver igen.** Kvitteringen «navn|dage»
   ligger i `localStorage` (`zydy.ordle`), så en tur uden forbindelse — eller et
   nyt navn på iPad'en — bliver sendt næste gang forsiden tegnes.

Det er tillid, ikke måling: man kan sagtens trykke «Ja!» uden at have spillet.
Det er samme slags tillid som resten af sitet (alle kan skrive et hvilket som
helst navn på en topliste), og alternativet var ingen topliste overhovedet.
Mønstret kan genbruges, hvis Taltræf eller Imposter en dag skal have en.

<a id="soeg"></a>

### Søg efter et spil

Over listen står et felt: **«🔍 Søg efter et spil»**. Skriver man i det, bliver
de kort, der ikke passer, skjult med det samme — der er over tyve spil på
forsiden nu, og skal man finde ét bestemt, er det en lang rulletur. Selma bad om
det gennem «Nyt spil?».

| Del | Fil | Hvad |
|---|---|---|
| Reglerne | `public/soeg-regler.mjs` | Ren JS uden browser: `normaliser`, `ord`, `soegetekst`, `staarI`, `passer` og `filtrer`. Enhedstestet i `test/unit/soeg.test.mjs` — mod de rigtige `kort.json`-filer. |
| Feltet | `public/soeg.js` (modul) | Laver feltet over `<ul id="apps">`, skjuler kortene med `hidden`, tæller dem, og tilbyder at ønske sig spillet, når der ikke var noget. |
| Det der søges i | `data-noegleord` på hvert kort | `scripts/byg-forside.mjs` skriver `"nøgleord"` fra spillets eget `kort.json` ud på kortet. |

Fire ting er værd at huske:

1. **Et spil hedder også noget andet.** Børnene leder efter forbilledet, ikke
   vores navn: «roblox» skal finde Klodser, «block blast» Blokblast, «clash
   royale» Slotskamp, «my cat» Min kat, «tre på stribe» Kryds og bolle. Derfor
   har hvert `kort.json` et `"nøgleord"`, og der søges i navn + nøgleord +
   beskrivelse. Et nyt spil bliver søgbart uden at nogen rører `soeg.js`.
2. **Æ, Ø og Å skrives også ae/oe/aa**, så «saet» finder Sæt og «taarn» Tårn.
   Det skrives tit uden de danske bogstaver, især på en iPad.
3. **Korte søgeord skal begynde et ord, lange må stå midt inde i et.** Måtte
   korte ord stå hvor som helst, ville «kat» også finde Dybet, fordi der står
   «skatte» på kortet. Lange ord må, for ellers kunne man ikke finde Ordstige på
   «stige» — dansk sætter ordene sammen. Grænsen er `LANGT_ORD` (4 bogstaver).
4. **Rækkefølgen bliver, som den er.** Vi filtrerer kun og sorterer ikke om, så
   det spil, man plejer at se øverst, står der stadig efter to bogstaver. Enter
   går ind i det øverste kort, der er tilbage, og finder vi ingenting, står der
   «Vi har ikke noget, der hedder «fodbold»» med en knap, der åbner «Nyt spil?»
   med ordet skrevet i forvejen (`Ideer.nytSpil(udkast)`).

Uden JavaScript er der intet felt, og listen ser ud som før.
Test: `test/soeg.test.mjs` + `test/unit/soeg.test.mjs`.

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
ven, kan man se hvor hen er, [skrive til hen](#skriv-med-en-ven), hoppe med ind
i det spil, hen er i gang med — og invitere hen til at spille *sammen*, se
[Spil sammen](#spil-sammen).

#### At blive venner — hvad en ny spiller ser

Oliver ønskede sig «Bliv venner», selv om funktionen fandtes: den var bare
svær at få øje på og besværlig at bruge. Fem ting løser det, og de er værd at
holde fast i, hvis panelet bygges om:

1. **Den tomme liste siger, hvad man gør.** Har man ingen venner endnu, står
   der ikke bare «du har ingen»: der står et par navne (`.v-hurtig-navn`), man
   kan trykke på og spørge med det samme, og en stor gul «＋ Find en ven»
   (`.v-find-stor`). Den lille knap oppe i hjørnet er nok for en, der kender
   panelet — ikke for en, der aldrig har set det.
2. **Man skal ikke kunne stave.** «Find en ven» er et *søgefelt*, ikke et
   skrivefelt: listen filtreres, mens man skriver. `form()` skærer store
   bogstaver, accenter, mellemrum, punktummer og emoji væk (`Søren B.` →
   `sorenb`), og `traef()` rangerer begyndelsen før midten før **én tastefejl**
   (Levenshtein ≤ 1 i navne på mindst fire bogstaver). Trykker man Spørg med et
   navn, vi kender, sendes hens egen stavemåde (`retStavemaade`), så ja'et
   lander det rigtige sted.
3. **De, der er her lige nu, står først** og har en grøn prik — det er dem, man
   kan nå at aftale det med. Det koster ingenting: hvem der er online, ligger
   allerede i `hvorErDe` fra forsidens `/api/oversigt`.
4. **Man får at vide, hvad der så sker**: «Vi har spurgt Selma. Selma skal sige
   ja, før I er venner – spørgsmålet står og venter, til Selma er på zydy.dk
   igen.» Og har vi aldrig set navnet på siden (`kendt: false` fra API'et), er
   det næsten altid en tastefejl — så står der også det, for ellers venter man
   på et svar, der aldrig kan komme.
5. **Man kan fortryde.** Hver «Venter på svar fra …» har en *Fortryd*
   (`handling: 'nej'`). Før kunne et forkert stavet navn hverken besvares eller
   fjernes og blev stående på en af de 50 pladser for evigt — det var den
   eneste rigtige blindgyde i flowet.

Dertil: et ubesvaret spørgsmål får et mærkat ved overskriften («1 vil være din
ven», `.v-maerke`) på samme måde som «✨ Nyt på Zydy», og mens nogen venter på
et ja — i den ene eller den anden retning — hentes listen hvert 12. sekund i
stedet for hvert minut, for dér sidder de to som regel ved siden af hinanden.

Der er **ingen konti og intet login** på zydy.dk, og det bliver der ikke. Man
er det navn, man har skrevet på forsiden (`zydy.navn`), så et venskab er en
aftale mellem to *navne*. Det er nok her: navnene står i forvejen offentligt på
toplisterne, familien kender hinanden, og alternativet — rigtige brugerkonti —
ville gøre siden meget tungere at bruge for et barn med en iPad.

| Del | Fil | Hvad |
|---|---|---|
| Database | tabellen `venner` i `schema.sql` | Én række pr. par: `venner(fra, til, fra_navn, til_navn, oprettet, svaret)`. `fra`/`til` er navnet med små bogstaver (nøglen), `fra_navn`/`til_navn` er stavemåden til visning. `svaret` er tomt, indtil den anden har sagt ja. |
| API | `src/worker.mjs` → `src/venner.mjs` | `GET /api/venner?navn=Sofie` giver `venner`, `venter` (de har spurgt mig), `sendt` (jeg har spurgt dem) og `kendte` (indtil `KENDTE_MAKS` = 60 navne, vi har set på siden — klienten søger selv i dem). `POST /api/venner` med `{navn, ven, handling}`: `'spoerg'` (standard), `'ja'` og `'nej'` (som også fortryder et spørgsmål og fjerner en ven igen). Et nyt spørgsmål svarer desuden `kendt: true|false` — har vi aldrig set navnet, er det som regel stavet forkert. |
| Klient | `public/venner.js` + `<section id="venner">` i `public/index.html` | Tegner panelet og henter listen hvert minut (hvert 12. sekund, mens nogen venter på et ja). Hvem der er online, kommer gratis fra forsidens eget kald til `/api/oversigt`, som sendes videre som hændelsen `zydy:oversigt` — så det samme ikke hentes to gange. Dialogen genbruger stilen fra `/ideer.js`, der altid indlæses først. `form`, `traef` og `forslagFor` ligger på `window.Venner`, så testen kan nå dem. |

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

<a id="skriv-med-en-ven"></a>

#### Skriv med en ven

Trykker man på en ven, står **«💬 Skriv til Selma»** øverst i dialogen, og så
kan de to skrive sammen — én samtale pr. par venner, på forsiden og ikke andre
steder. Har nogen skrevet, står der en linje øverst i venne-panelet
(«💬 Selma skrev: Hej! Skal vi spille?» med **Læs**) og et lille 💬-mærke på
vennen selv. Samtalen er en dialog med de samme farver som resten af siden:
mine beskeder til højre i gult, vennens til venstre, klokkeslæt under hver.
Under feltet står fire faste beskeder — «Hej!», «Vil du spille?», 👍 og ❤️ —
for på en iPad er tastaturet dét, der tager modet fra en.

| Del | Fil | Hvad |
|---|---|---|
| Database | tabellen `beskeder` i `schema.sql` | `beskeder(id, samtale, fra, fra_navn, til, til_navn, tekst, oprettet)`. `samtale` er de to navne med små bogstaver, sorteret og samlet med `\|` (`'selma\|sofie'`), så begge retninger havner samme sted. |
| API | `src/worker.mjs` → `src/beskeder.mjs` | `GET /api/beskeder?navn=Sofie&set=selma:42` giver oversigten (sidste besked + hvor meget der er nyt pr. samtale), `GET …&ven=Selma&efter=42` giver selve samtalen, og `POST {navn, ven, tekst}` skriver. `POST {…, handling: 'ryd'}` rydder samtalen for dem begge. |
| Klient | `public/beskeder.js` | Chatten, oversigten og 💬-mærket. Henter oversigten hvert 15. sekund — og hvert 2,5 sekund, mens samtalen står åben, for dér venter man på svar. Ændrer den sig, sendes hændelsen `zydy:beskeder`, som `public/venner.js` tegner panelet om efter. |

Fire ting er værd at huske:

1. **Man kan kun skrive med sine venner** (ja begge veje i `venner`) — også for
   at *læse*. Det er hele værnet, præcis som ved «spil sammen»: der er stadig
   hverken konti eller login, og et venskab er en aftale mellem to navne.
2. **Hvem der har læst hvad, ligger på telefonen**, ikke i databasen
   (`zydy.beskeder.set`, gemt under den der læste — samme mønster som
   kælenavnene). Klienten sender sine mærker med som `set=selma:42`, og
   serveren tæller, hvor meget der er kommet siden. Så kan ingen se, om den
   anden har læst beskeden, og der er ikke noget at rydde op i.
3. **Grænserne er der, fordi API'et er åbent**: en besked fylder højst 200 tegn
   og står på én linje, man kan sende 20 beskeder i minuttet (`SPAM_MAKS`), og
   en samtale husker de nyeste 200 beskeder. Fjerner man vennen igen, følger
   samtalen med ud — `handling: 'nej'` i `src/venner.mjs` rydder den, så en
   samtale uden et venskab ikke bliver liggende.
4. **Tabellen laver Worker'en selv** ved første besked (`d1Beskeder`), så
   beskeder virker, selv om `schema.sql` ikke er kørt mod den rigtige database.
   Det sker én gang pr. worker og koster derefter ingenting.

Skulle der komme skrald ind:

```bash
npx wrangler@4 d1 execute zydy-highscore --remote --command "DELETE FROM beskeder WHERE samtale='selma|sofie'"
```

Test: `test/beskeder.test.mjs` (repoets fjerde to-browser-test: Sofie skriver,
Selma får mærket på forsiden, læser og svarer med ét tryk, og svaret dukker op
hos Sofie) + `test/unit/beskeder.test.mjs`.

<a id="spil-sammen"></a>

### Spil sammen — venner kan joine hinanden

Der er to slags: de spil, hvor de to deler ét parti (her), og et **kapløb** i
alle de andre ([se nedenfor](#kaploeb)) — det er den, der gør, at man kan joine
hinanden i næsten alle spil uden at skulle skrive netværkskode i hvert enkelt.

Trykker man på en ven, står der en knap pr. spil, to kan spille sammen — i dag
**«🎮 Spil Kryds og bolle sammen»**, **«🎮 Spil Dybet sammen»**,
**«🎮 Spil Papirøen sammen»**, **«🎮 Spil Slanger sammen»** og
**«🎮 Spil Kæmpetal sammen»**. Så laves
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
Fjorten spil er med: Tårn, Sæt, Farvesortering, Duel, Obby, Gulvet er lava,
Klodser, Miskmask, Blokblast, Slotskamp, Weeee!, Klaverregn, Til søs! og
Flaskehavet.

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

Ikke alle spil er med, og det er med vilje: Kryds og bolle, Dybet og Papirøen
deler et rigtigt parti (bedre end et kapløb), Helteriget og Stenalder er hot-seat for to
på én iPad, Ordstige har én opgave om dagen, Min kat er en killing, der vokser
over uger, og Legebyen er fri leg — ingen af dem har en «runde», man kan måle
mod hinanden.

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

### Obby: hurtigere uden at banen bliver grovere

Sofie ønskede sig, at «det her spil skal gå meget hurtigere». Det nærliggende
var at skrue op for `VX0`/`VX_MAKS`, men de to tal er ikke bare en fart: hele
banen genereres ud fra dem. Et større tal giver længere spring, større huller
og bredere laserplatforme — verdenen bliver grovere, og på en iPhone kan man så
ikke nå at se den næste firkant, før man skal hoppe.

Derfor skruer vi på **tiden** i stedet. `TEMPO0 = 1.25`, `TEMPO_MAKS = 1.8` og
`tempoVed(i)` siger, hvor mange spil-sekunder der går pr. virkeligt sekund, og
`frem(sek)` ganger dem på, før den fodrer det faste fysik-trin:

```js
function frem(sek) {          // sek = virkelige sekunder (fra billedløkken)
  acc += sek * naaTempo();
  while (acc >= DT) { tick(DT); acc -= DT; }
}
```

Fysikken går altså stadig i trin på `DT`; der tages bare flere af dem. Hele
verdenen spoles hurtigere — figuren, hoppene, laserne, lavaen — mens banen ser
ud præcis som før: **samme spring, samme huller, bare meget mindre tid til
dem.** Bot-testen, der beviser at banen kan gennemføres, kører derfor uændret
på `GAME.tick()` (spil-sekunder), mens fart-testene bruger `GAME.frem()`
(virkelige sekunder). Sammen med den fart, der stiger med platformens nummer,
går det 7,5 enheder i sekundet ved start (mod 6,0 før) og 17,1 langt inde (mod
9,5 før) — ⚡-måleren i HUD'en viser hele forøgelsen og tæller fra ×1,3 til ×2,9.

Tre ting hænger sammen med det:

1. **Tempoet hænger på platformens nummer**, ikke på hop-tælleren — præcis som
   farten. Genopstår man på et checkpoint langt inde, er tælleren nulstillet,
   men banen er stadig bygget til høj fart, og så skal det også stadig gå stærkt.
2. **Alt, der er tålmodighed over for spilleren, skal ganges med tempoet**,
   ellers bliver det stjålet, når tiden går hurtigere. Trykbufferen (`BUFFER`)
   ganges ved trykket, og checkpoint-platformens bredde regner `REAKTION` som
   virkelige sekunder (`REAKTION * fartVed(i) * tempoVed(i)`) — uden det har man
   under et halvt sekund til at få fat i telefonen, når man genopstår.
   `COYOTE` er med vilje *ikke* ganget op: den bestemmer, hvor sent man kan
   hoppe ud over kanten, og et for stort vindue får hoppet til at flyve forbi
   den næste firkant, som banegeneratoren kun giver 0,6 enheders margen.
3. **Man skal kunne se det.** Figuren står jo det samme sted på skærmen, så
   farten ville ellers kun kunne mærkes: derfor fartstriber i baggrunden, der
   bliver længere og tydeligere med tempoet, ⚡-måleren, og et «⚡ Hurtigere!»
   der popper op, hver gang tempoet runder et nyt tiendedels-trin.

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

### Min hund – gåturen og hundeskolen

Ønsket lød bare «Min hund». Der var allerede et Min kat, så det oplagte var at
lave den samme slags spil – men en hund, der bare er en kat med slappe ører, er
ikke noget værd. To ting bærer forskellen, og de bor begge i `hund.mjs`:

**«Luftet» kan kun fyldes udenfor.** Det er det behov, der falder hurtigst
(`FORFALD.tur`), og hverken mad, bold eller bad rører det. Trykker man på
Gåtur, ruller parken forbi (`TUR_FART` spil-meter i sekundet, `TUR_LAENGDE`
meter i alt), og `gaa()` skriver meterne ind i hunden. Bemærk **TUR_BID**:
belønningen afregnes 12 meter ad gangen. Regnede vi pr. billede, ville
erfaringen for én meter runde ned til nul, og man kunne gå en hel tur uden at få
noget for den. Kilometertælleren (`hund.meter`) tæller kun det afregnede, så den
og «luftet» aldrig kommer i utakt.

Undervejs møder man seks slags ting (`TUR_TING`), og alle håndteres af den samme
`turStop(hund, slags, ramt)`. Fem af dem giver noget, hvis man **når at trykke**
– lygtepælen, pinden, katten, den anden hund og posen, man samler op efter
hunden. Mudderpytten er vendt om (`undgaa: true`): dér er trykket redningen, og
det er dét at lade være, der koster et bad. Det er den eneste ting i spillet,
man kan tabe på, og derfor den eneste, der er værd at holde øje med.

**Hundeskolen** er den anden halvdel. Seks tricks låses op efter niveau
(`TRICKS[i].niveau`), så en nyhentet hvalp ikke kan spille dødsmand samme
eftermiddag. Et trick sidder ikke fast med det samme: `traen()` flytter det
`LAERT_OK` point, når hunden gør det rigtigt, og `LAERT_FEJL`, når den ikke gør
– den lærer altså også af at kigge den anden vej – og ved `MESTRET` (100) kan
den det. Chancen for at den gør det rigtigt (`trickChance`) vokser med, hvor
godt den kan tricket, men **ganges med trivslen**: en sulten hund, der ikke har
været ude i to dage, hører ikke efter. Det er dét, der binder tricksene sammen
med resten af spillet i stedet for at være en knap for sig.

To ting i UI'et er værd at huske:

1. **Stuen løftes op, mens skolens ark er åbent.** Arket dækker den nederste
   halvdel af skærmen, og dér stod hunden – man kunne læse, at den satte sig,
   men ikke se det. Nu flytter `gulvY()` gulvlinjen op til 38 % af lærredet, så
   længe `#skole` er åben, og hele stuen følger med. Testen tjekker det ved at
   sammenligne gulvlinjen med arkets overkant.
2. **Bolden bliver liggende, til man kaster igen.** Bolden ved fødderne får
   mærket `hjemme`, og `boldFrem()` løber kun efter en bold uden det mærke. Det
   var først en afstandsregel (`b.x > MIG_X + 0.08`), men den gik i stykker, da
   afleveringspunktet flyttede sig: så hentede og afleverede hunden i ét væk af
   sig selv, hvert eneste billede, uden at man rørte en finger.

Som i Min kat gives mønter og erfaring kun for **forskellen** – `plej()`
belønner det, der faktisk blev fyldt op. En mæt hund giver ingenting for mere
mad, og et trick, hunden allerede kan, er gratis sjov uden løn. Ellers kunne
børnene trykke sig til en guldkrone.

### Mit liv – huset, behovene og arbejdet

Ønsket lød bare «The sims». Det er blevet et liv i ét hus set oppefra: behov,
der siver, møbler man trykker på, og et arbejde, man skal ud af døren til.
Reglerne bor i `liv.mjs`, som ikke rører DOM'en; `index.html` tegner huset og
tager imod fingrene.

**Huset er et gitter på 10 × 8 felter** med døren midt i bundvæggen. Et møbel
fylder ét felt og spærrer det, og figuren går rundt om – ruten findes med en
bredde-først-søgning gennem de tomme felter, og man ender *ved siden af* det,
man skal bruge. Gulvet er farvet i fire hjørner (soveværelse, bad, køkken,
stue), men det er kun en hjælp: møblerne må stå hvor som helst.

Fem valg er værd at huske:

1. **Møblerne virker med en fart pr. time, ikke i et bestemt antal sekunder.**
   Toilettet giver 260 point i timen, sengen 55 — så et toiletbesøg tager et
   øjeblik, og en nat tager timer, uden at noget af det står som en varighed
   nogen steder. Figuren holder selv op, når behovet er fyldt.
2. **Lønnen følger humøret** (`0,7 – 1,3 ×`), og en god arbejdsdag giver to
   stjerner mod næste trin, en middelmådig én og en elendig ingen. Uden det
   kunne man lade figuren sidde og kede sig og alligevel blive astronaut, og så
   var der ingen grund til at passe behovene.
3. **Pynt tæller med i humøret** (`hygge`, en fjerdedel af det). Ellers ville
   der ikke være nogen grund til at købe andet end det allernødvendigste — og
   halvdelen af fornøjelsen ved spillet er at indrette.
4. **Man kan ikke mure noget inde.** Før hvert køb og hver flytning prøver
   `spaerrerVejen`, om alle møbler stadig kan nås fra døren; kan de ikke, får
   man nej. En seng bag en række potteplanter ville ellers være enden på det
   liv. Står figuren selv i vejen, bliver den skubbet ud på nærmeste frie felt.
5. **Uheld er en del af det.** Når toilettet ikke kan vente, kommer der en pyt
   på gulvet (og renheden falder), og en helt udkørt figur falder i søvn, hvor
   den står. Begge dele kan rettes op — pytten tørres op med et tryk — og de er
   dét, der gør behovene til andet end seks søjler, der bare skal være fulde.

Tiden går fem spilminutter pr. rigtigt sekund, fire gange hurtigere mens man
sover og tolv gange mens man er på arbejde — ellers ville en nattesøvn eller en
arbejdsdag være spildtid, hvor man bare sad og kiggede. Efter kl. 21 bliver
huset mørkt.

Score er **formuen**: pengene plus prisen på alt i huset. Derfor koster det
ikke på listen at bruge pengene, og et pænt indrettet hus tæller lige så meget
som en fuld pung. Den højeste formue, man har haft, gemmes (`bedste`), og
toplisten popper op af sig selv ved hver forfremmelse.

Huset ligger i `localStorage` under `zydy.mitliv.v1`, og `laes()` prøver det
gemte af mod det, spillet kender i dag: et møbel vi har fjernet siden, to ting
på samme felt eller noget uden for gitteret falder bare ud. Tiden går **ikke**,
mens man er væk — det er et liv, man leger, ikke et kæledyr, der skal passes.

Test: `test/mitliv.test.mjs` (lever et liv igennem gennem skærmen) +
`test/unit/mitliv.test.mjs`.

### Papirøen – sløjfen og de tre modstandere

Ønsket lød «Papir io 2» – altså Paper.io, hvor man farver et stykke papir ved at
køre ud og hjem igen. Reglerne bor i `papir.mjs`, som ikke rører DOM'en;
`index.html` tegner papiret og tager imod fingeren.

**Erobringen er en flod udefra.** Når sløjfen lukkes, bliver stregen til
område, og derefter flyder vi ind fra papirets kant gennem alt, der *ikke* er
mit. Det, floden ikke kan nå, lå inde i sløjfen og bliver mit:

```js
for (let i = 0; i < FELTER; i++) if (!naaet[i] && s.ejer[i] !== p.id) s.ejer[i] = p.id;
```

Det er hele forklaringen på, hvorfor man ikke behøver vide, hvilken vej sløjfen
gik – og hvorfor et hul i ens eget område fyldes af sig selv, første gang man
kører en sløjfe om det. En anden spillers område inde i sløjfen bliver også
mit; det er dét, der gør, at man kan tage nogen helt ud.

**Man er kun sårbar, mens man er ude.** Hjemme på sit eget område er der ingen
streg at køre over, så dér kan ingen tage en. Derfor handler spillet om at turde
blive længe nok ude til, at sløjfen bliver stor. Til gengæld: **mister man hele
sit område, er man ude** – ellers ville en spiller uden hjem køre rundt for
evigt uden nogensinde at kunne lukke en sløjfe.

**Der drejes på feltets midte.** Trykket gemmes i `p.næste` og slår først
igennem, når klatten når næste felt (`vaelgRetning`). Ellers ville stregen
knække midt mellem to felter, og de felter, man havde kørt over, ville ikke
passe med det, man kunne se. En 180°-vending er ikke et træk: den ville være
lige ind i ens egen streg.

**Modstanderne er skruet sammen efter, hvor længe en runde skal vare.** Botten
tegner et rektangel (ud i `maal` felter, om ad siden i `sideMaal`, og så hjem
efter nærmeste eget felt) og kigger ét skridt frem, så den ikke maler sig op i
et hjørne. Tre tal afgør, hvor hårdt det er at være menneske:

| Tal | Hvorfor |
|---|---|
| `SPREDNING` (14 felter) | Der er mindst 14 felter mellem to klatter, når nogen kommer ind på papiret. Uden det startede to klatter side om side og kørte over hinandens streger, før nogen havde nået at lave en sløjfe – de første runder varede under to sekunder. |
| `aggro` (0,05 / 0,12 / 0,2) | Chancen for, at en tur ud bliver en *jagt* på en fremmed streg. Bo jager næsten aldrig, Mikkel hver femte tur. Ved 0,26 var Ida alene nok til at gøre spillet uspilleligt. |
| `JAGT_SKRIDT` (12) | Hvor længe en jagt holder ved, før botten går hjem igen. Uden loftet fulgte den efter for evigt. |

Målestokken er `kør(seed, sekunder)`, som lader bot-hjernen styre spillerens
egen klat: en gennemsnitlig runde skal vare **mere end 15 sekunder** for en bot,
der slet ikke viger udenom – så har et barn tid nok. Det tjekker enhedstesten.

`?bots=0` giver papiret for sig selv. Det er både til at øve sig og dét, testen
bruger, når den skal være sikker på, at det var sløjfen, der farvede papiret, og
kanten, der tog en – og ikke Bo.

Test: `test/papir.test.mjs` (en rigtig finger, der drejer klatten, en sløjfe der
farver, og en hel runde med botten ved rattet) + `test/unit/papir.test.mjs`.

<a id="papir-sammen"></a>

### Papirøen sammen — to venner på det samme stykke papir

Papirøen kan spilles af to venner på hver sin telefon: de er på det *samme*
papir, ser hinandens klat og streg, kan tage hinandens område — og klippe
hinandens streg over. Reglerne ligger i `public/spil/papir/sammen.mjs` (ren JS,
enhedstestet i `test/unit/papir-sammen.test.mjs`) oven på den almindelige
`papir.mjs`.

Det er det første «sammen»-spil, der ikke er turbaseret, og dét er hele
udfordringen: rummet (`public/spil/rum.js`) henter og skriver et par gange i
sekundet, så vennens klat er altid omkring et sekund bagud. Reglerne er skruet
sammen, så de kan holde til det:

1. **Hver telefon passer sin egen klat.** Min position, min streg, mit område og
   mit liv regnes her; vennens kommer færdigt fra rummet (`ven.fjern`, som
   `tik()` går uden om). Så er der aldrig to, der bestemmer det samme.
2. **Papiret sendes som *ændringer*, ikke som et facit.** Vennens felter kommer
   som en maske med ét bit pr. felt, men kun det, der er *kommet til* siden
   sidst, farves — også hvis feltet var mit. Så vinder den nyeste sløjfe, uden
   at de to skal blive enige om et ur, og de to skærme ender det samme sted
   (enhedstesten kører seks runder og kræver, at alle 1600 felter passer).
3. **Et drab er et krav, ikke en dom.** Kører jeg over vennens streg, ser jeg
   kun den streg, hans telefon sendte for et sekund siden. Derfor rejser jeg et
   *krav* (`{slags: 'krav', felt}`), og hans telefon svarer: lå feltet stadig i
   hans streg, ryger han ud — var han nået hjem, sker der ingenting. Man kan
   altså ikke klippe det allersidste stykke af en streg, men man bliver til
   gengæld aldrig taget for en streg, man for længst har lukket.
4. **Papiret genereres, det sendes ikke.** Frøet er `froe(rumkode, runde)`, så
   begge telefoner ruller det samme papir ud. Klatterne placeres i rollernes
   rækkefølge (`nyBane({ven, vaert})`) — ellers bytter de to plads, fordi man på
   sin egen telefon altid er nr. 1 og den grønne.

Runden varer **to minutter** (`TID`), og den med mest papir til sidst har
vundet. Ryger man ud, er runden ikke forbi: man kommer igen efter to sekunder
som modstanderne gør i enkeltmandsspillet — ellers sad den ene og kiggede på i
halvandet minut. Til gengæld koster det hele området, så et drab er stadig det
værste, der kan ske. Begge venter på vennens sidste tal, før resultatet skrives
(højst otte sekunder), så de to skærme siger det samme. Toplisten er den
samme som ellers: den største del af papiret, man nåede at have.

**Der er ingen bots med, når to spiller sammen.** De skulle simuleres på begge
telefoner, og eftersom de reagerer på begge spilleres streger, ville de to
udgaver drive fra hinanden i løbet af få sekunder.

Hele stillingen fylder omkring 1200 tegn (rummet har 4000): området er 267 tegn,
og stregen er sin længde, sit startfelt og så to bit pr. skridt — rækkefølgen
skal med, ellers er det en sky af felter og ikke en streg.

Papirøen er **ikke** længere et [kapløb](#kaploeb). Deler man et rigtigt papir,
er det bedre end at spille hver for sig, og `"sammen"` og `"kapløb"` kan ikke
være tændt samtidig: så ville forsiden tilbyde begge dele, og `?rum=`-koden
kunne betyde to ting.

Test: `test/papir-sammen.test.mjs` (repoets femte to-browser-test: Sofie
inviterer, begge farver papir, Selma klipper Sofies streg over og får sit drab,
uret løber ud, og de to skærme er enige om, hvem der vandt) +
`test/unit/papir-sammen.test.mjs`. Testen kører med `?frys=1`, som lader papiret
stå stille, til `GAME.frem()` kaldes — to browsere kan ikke spille et rigtigt
sekund i takt, men rummet kører imens, og det er dét, der skal prøves.

<a id="fiskedybet"></a>

### Fiskedybet – baren, farvandene og uhyrerne

Ønsket hed «FISH IT: ABYSS» og var skrevet på engelsk af Timo: en lille båd, der
fisker, sælger fangsten, køber opgraderinger og låser dybere farvande op —
med den tvist, at havet bliver mærkeligere, jo længere man kommer ned. Reglerne
bor i `hav.mjs`, som ikke rører DOM'en; `index.html` tegner havet og tager imod
fingeren. Fem ting er værd at kende:

**1. Kampen er én bar.** En viser løber frem og tilbage (0-1), og et tryk tæller
kun, hvis den er inde i det grønne felt. Feltet **flytter sig, hver gang man
rammer** — ellers kunne man bare trykke i takt og aldrig ramme forbi. Store dyr
kræver flere rammere (`kamp`, 1-5), løber hurtigere (`fart`) og har et smallere
felt (`vindue`); stangen gør feltet bredere med 17 % pr. niveau. Tre forbiere,
og fisken slipper væk (et uhyre tåler kun to). Kampen giver desuden op af sig
selv efter `maksTid` — uden den ville en telefon, man lagde fra sig midt i et
hug, stå i «kamp» for evigt.

**2. Uhyret er et valg, ikke en kamp.** I de fire dybe farvande hugger der ét
uhyre hvert sted. Så stopper spillet op: *klip snøren* (intet tabt, intet
vundet) eller *tag kampen* (svær, men dyret er 2-4 gange så meget værd som alt
andet i farvandet). **Gør man ingenting i 3,4 sekunder, bider det i båden** —
det er dét, der gør tøven farlig, og derfor er der en nedtællingsstribe under
teksten.

**3. Bogen og lasten er to forskellige ting.** Alt, hvad man fanger, står i
fiskebogen for altid — og det er bogen, der er scoren. Pengene ligger derimod i
lasten, til man har sejlet dem hjem i havn. Går skroget i nul, bliver man slæbt
i havn og mister **lasten**, aldrig bogen: et uheld i Afgrunden må gerne koste
en dyr tur, men ikke en samling, man har brugt en uge på. Af samme grund
noterer `land()` arten i bogen, selv når kølerummet er fuldt — så koster en fuld
last kun pengene.

**4. Snøren er den opgradering, der åbner noget nyt.** `ZONER[i].krav === i`, så
snørens niveau er præcis det farvand, man kan nå. De tre andre (stang, skrog,
kølerum) gør turen lettere; snøren er den, der giver nye dyr at fange, og derfor
den dyreste. Havnen er det eneste sted, man kan sælge, reparere og købe — ellers
ville der ikke være nogen risiko ved at blive dernede med en fuld last.

**5. Dyrene tegnes i hånden, ikke som emoji.** Hver art har en `form`
(`fisk`, `haj`, `blaek`, `lygte`, `skelet`, `mund`, `oeje` …), to farver og evt.
en `lys`-farve, der giver den en glød i mørket. `tegnDyr()` bruger de samme
former både i havet og på kortene i fiskebogen, hvor ufangede arter tegnes i
blåt med et «?» henover — så kan man se, hvad man mangler, uden at få det at
vide.

Score = antal arter i bogen. En ny art sendes ind på toplisten med det samme,
hvis vi kender navnet fra et andet spil (`zydy.navn`); gør vi ikke, venter den,
til man åbner fiskebogen, hvor `Highscore.panel()` spørger. Sådan bliver man
aldrig afbrudt midt i et hug. Spillet ligger i `localStorage` under
`zydy.fisk.spil`, og `?nyt=1` giver en frisk båd (det er dét, testen bruger).

Test: `test/fisk.test.mjs` (et hug med en rigtig finger på baren, en fuld last,
salg og opgradering i havnen, et uhyre både klippet og tabt, og båden slæbt i
havn) + `test/unit/fisk.test.mjs`.

### Legebyen – dukkehuset

Ønsket lød «Lav Toca boga» – altså Toca Boca, hvor man ikke vinder noget, men
bare leger med figurer i nogle rum. Det er hele pointen, og derfor er det
eneste spil her (ud over Kryds og bolle) **uden score, uden topliste og uden
slutskærm**. Reglerne bor i `by.mjs`, som ikke rører DOM'en; `index.html` tegner
rummene og tager imod fingrene.

**Rummet er altid 160 × 100 enheder**, og møblerne står på faste pladser i dem –
som i Miskmask, så en sofa står det samme sted på en iPhone på højkant og en
iPad på tværs. Den højde, der bliver til overs på en telefon, lægges 70 % over
møblerne som væg og 30 % under som gulv: midtstillede vi rummet, blev gulvet en
tredjedel af skærmen, og bundstillede vi det, blev væggen en tom flade. Derfor
er der også noget at se på højt oppe i hvert rum (hylden i stuen, overskabene i
køkkenet, håndklæderne på badet, vimplerne i butikken, himlen på legepladsen).

**Fingeren gør kun tre ting**, og de er de samme overalt:

| Man gør | Så sker der |
|---|---|
| trækker i en figur eller en ting | den flytter sig – og en figur, der slippes tæt på et sæde, sætter sig |
| trykker på en figur | den siger noget; én gang til åbner «klæd på» |
| trykker på en ting i bakken og så et sted | tingen lægges der – eller bruges, hvis man trykker på en figur |

Fire valg er værd at huske:

1. **Tryk-og-sæt frem for at trække fra bakken.** Bakken er almindelig HTML
   under lærredet, og et træk fra en rullende liste ned på et canvas er svært
   for en tommelfinger. I stedet vælger man tingen og trykker, hvor den skal
   hen – og det virker ens for hylden og for tasken.
2. **Figurer falder altid ned på gulvet** (`flytFigur`), medmindre de rammer et
   sæde. En figur, der bliver hængende i luften midt i rummet, ser ud som en
   fejl, og børnene prøvede at «rette» den.
3. **Intet forsvinder bare.** Giver man en ny hat på, falder den gamle på gulvet
   ved siden af, og den samme ting én gang til tager den af igen. Ellers er der
   ingen vej tilbage, når først kronen sidder fast.
4. **Sidder der en i gyngen, er et tryk på hende et skub.** Figuren dækker jo
   netop det møbel, man ville ramme – det gælder også rutsjebanen.

Tasken (`TASKE_MAKS` = 6) er den eneste måde at flytte ting mellem rum på: man
trykker på noget, der ligger, og det ryger i tasken. Et rum holder højst
`TING_MAKS_PR_STED` = 12 løse ting, så et rum ikke kan fyldes, til man ikke kan
se, hvad der er hvad – og `🧹` rydder det hele væk igen.

Hele byen ligger i `localStorage` under `zydy.legebyen.v1`, og `laes()` prøver
alt af mod det, spillet kender i dag: en ting eller en frisure, vi har fjernet
siden, falder bare ud, to figurer kan ikke arve det samme sæde, og en figur kan
ikke have en bold på hovedet. `mig`-figuren hedder det, der står i `zydy.navn`.

Test: `test/legebyen.test.mjs` (leger alle fem rum igennem gennem skærmen) +
`test/unit/legebyen.test.mjs`.

### Copyright – stemplet, gættet og pointene

Ønsket lød: «Lav et spil hvor man skal copyright en tegning også skal man gætte
hvem der er den der har copyrighten tegningen». Altså: man sætter sit mærke på
sin egen tegning, og bagefter skal det gættes, hvis mærke der sidder på hvad.
Spillet er hot-seat på én iPad, der går rundt – som Stenalder og Helteriget –
og en runde har tre dele: **tegn → gæt → afslør**. Reglerne bor i `regler.mjs`
uden DOM; `index.html` har lærredet, skærmene og stemplet.

Fem valg er værd at kende:

1. **Alle tegner det samme motiv.** Gør de ikke det, gætter man på *motivet*
   («Selma tegner altid heste») i stedet for på hånden, og så er spillet noget
   andet. Motivet trækkes fra `MOTIVER`, og det samme motiv kommer ikke to gange
   i ét spil.
2. **Narrer man alle, giver tegningen ingenting.** 10 point for et rigtigt gæt
   og 5 til tegneren pr. narret – men kun hvis mindst én ramte rigtigt. Uden den
   regel (den er fra Dixit) vinder en klat, for en klat kan ingen genkende. Nu
   skal man tegne, så én kan kende ens streg, men ikke alle.
3. **En tegning er streger, ikke et billede.** Hver streg gemmes som
   `{ f: farveindeks, t: tykkelse i procent af papirets bredde, p: [x,y,…] med
   0-1-koordinater }`. Derfor kan den samme tegning tegnes som frimærke i
   gættelisten og stort på afsløringsskærmen uden at blive grynet – og uden at
   der skal en `toDataURL()` gennem hukommelsen for hver tegning.
   Under selve tegningen males kun det nye stykke af stregen (ikke hele
   lærredet forfra), ellers hakker det på en iPad.
4. **Der er en «giv den videre»-skærm før hver eneste tur** – både før man
   tegner og før man gætter. Hemmeligheden *er* spillet, så enheden må aldrig gå
   fra den ene til den anden med noget stående på skærmen. Man kan hverken gætte
   på sin egen tegning (den vises ikke) eller på sig selv (ens eget navn er ikke
   blandt knapperne), og «Færdig» siger «Mangler 2», til der er taget stilling
   til alle.
5. **Uret stempler selv.** Man har 60 sekunder (`TEGNETID`); løber de ud,
   sættes stemplet på det, der er. Man kan ikke selv stemple en blank side, men
   uret er ligeglad – ellers kan én spiller holde hele bordet fanget.

Der er mindst tre spillere: med to er gættet «den anden», og det er ikke et
spil. Det er heller ikke et «spil sammen»-spil: rummet i `src/rum.mjs` har plads
til 4000 tegn, og tegninger fylder mere end det – men vigtigere er, at alle
venter på den, der tegner, og dét venter man hellere på, når man sidder ved
siden af hinanden. Score på toplisten er **vinderens point** efter tre runder,
gemt under det navn, spilleren skrev på startskærmen (samme mønster som
Stenalder, derfor `Highscore.hent/send/tegnListe` frem for `panel()`).

Test: `test/copyright.test.mjs` (tegner et hus med en rigtig finger, lader uret
stemple den tredje tegning, gætter både med et tryk på en chip og gennem
`GAME.gaet`, og tjekker point, afsløring og topliste) +
`test/unit/copyright.test.mjs`.

### Klaverregn – fliserne, sangene og lyden

Livas ønske lød bare «Et klaver spil». KlaverLær (klaver.zydy.dk) er en
*lære*-app bag Cloudflare Access, der kun virker hjemme – det her er et *spil*,
der virker alle vegne: Piano Tiles med rigtige børnesange. Reglerne bor i
`noder.mjs` uden DOM; `index.html` tegner, tager imod fingrene og laver lyden.

Fire ting er værd at huske:

1. **Banen følger tonehøjden.** Sangens toneomfang deles i fire lige store
   bånd: dybeste fjerdedel = venstre bane, lyseste = højre (`baneFor`). Så kan
   man *se* melodien komme – Mester Jakobs do-re-mi vandrer mod højre – og det
   er dét, der gør det til et klaverspil og ikke et reaktionsspil. Samme tone
   giver altid samme bane, og der er ingen tilfældighed overhovedet: sangene
   kommer i fast rækkefølge, og farten afhænger kun af antal ramte noder, så
   spillet er ens for alle.
2. **En fejl flytter ikke melodien.** Rammer man en forkert bane, koster det et
   hjerte, men flisen bliver stående – ellers lyder sangen pludselig forkert,
   og det er værre end at miste et hjerte. Kun en flise, der når forbi bunden,
   springes over (også et hjerte), for dér er alternativet, at gamle fliser
   hober sig op. Tre hjerter i alt; forbilledet dør ved første fejl, men det
   er for hårdt for en, der er seks.
3. **Rytmen ligger i afstanden.** Fliserne står med `varighed × AFSTAND_PR_SLAG`
   enheder imellem sig, så en halvnode giver dobbelt så meget luft som en
   fjerdedel – og spiller man i flisernes takt, kommer sangen ud med sin egen
   rytme. Mellem to sange er der en ekstra pause (`PAUSE_SLAG`), så «FLOT! Du
   spillede hele Mester Jakob» kan nå at stå der, før den næste begynder.
4. **Lyden laves ved første tryk og er kun pynt.** iPhone åbner ikke for
   WebAudio, før en finger har rørt skærmen, så `AudioContext` laves først i
   `lyd()` (Spil-knappen er det første tryk), og alle lydkald ligger i
   try/catch – uden lyd er det stadig et spil. Klaveret er to oscillatorer
   (grundtone som trekant + en svag oktav som sinus) gennem et lavpasfilter
   med hurtigt anslag og lang hale; `frekvens(midi)` er den rene
   ligesvævende stemning ud fra kammertonen.

Melodierne i `SANGE` er folkemelodier (og Beethoven), som ingen ejer længere.
Motoren kan spille sig selv: `bot()` trykker fejlfrit på den nederste flise, og
`koer()` spiller minutter igennem uden browser – det er dén, både enhedstesten
og browser-testens `GAME.frem()` bruger.

**Dit eget klaver** (Livas andet ønske, «På ens egen klaver») er en knap på
startskærmen: et rigtigt lille klaviatur med hvide og sorte tangenter i stedet
for de fire baner. Man spiller frit (med ‹Dybere/Lysere›-knapper, en oktav ad
gangen), eller vælger en af de seks sange og spiller den i sit eget tempo –
den næste tangent lyser gult med en ♪. Der er ingen hjerter og ingen fart, og
en forkert tangent er ikke en fejl: den giver bare sin egen tone, som på et
rigtigt klaver. Reglerne (`erSort`, `klaviatur`, `sangOmfang`, `nyEgenSang`,
`egetTryk`) bor i `noder.mjs` og er enhedstestede; `sangOmfang` trækker sangens
omfang ud til hvide yderpunkter og mindst en hel oktav, så Ode til glæden ikke
bliver fem tangenter. Tangenterne er DOM-knapper lagt i procent af klaviaturets
bredde, så de passer sig selv på både iPhone og iPad, og de hvide bærer danske
tonenavne (med H, ikke B).

Test: `test/klaverregn.test.mjs` (rammer de tre første fliser med en rigtig
finger og tjekker, at do-re-mi vandrer mod højre, at en forkert bane koster et
hjerte uden at flytte melodien, lader botten spille en hel sang og lader så
fliserne falde forbi, til slutskærmen kommer) + `test/unit/klaverregn.test.mjs`.

### Til søs! – vinden, skærene og uvejret

Milas' ønske lød bare «Betyder man skal sejle», og det er læst helt bogstaveligt:
et spil om at *sejle*, hvor vinden er hele spillet. Havet ses oppefra, roret er
to knapper, og fysikken bor i `baad.mjs` uden DOM, så den kan enhedstestes.

Fire ting er værd at huske:

1. **Farten kommer fra fartkurven (`POLAR`), ikke fra en gaspedal.** Kursens
   vinkel til vindøjet slås op i en rigtig sejlbåds polar: under 38°
   (`VINDOEJE`) blafrer sejlet og båden ligger næsten stille, halvvind er
   hurtigst, og læns er lidt langsommere. Det er dét, der gør, at man skal
   *krydse* op mod vinden – og pilen i toppen viser derfor hvor vinden blæser
   *hen*, for det er den, man skal holde sig fri af.
2. **Vindens spring ligger fast i en plan fra frøet** (`nySejlads` genererer
   den med det samme). Så er turen den samme hver gang med samme `?seed`, og –
   vigtigere – tilstanden kan kopieres med `{...s}`: bottens kig-frem og
   testene sejler kopier af spillet uden at en tilfældighedskilde følger med.
   Selve drejningen er blød (`VIND_DREJ`), så pilen kan ses dreje og ingen
   pludselig står i vindøjet uden varsel.
3. **Sejlrenden er en garanti, ikke et held**: `raekkeSkaer` lægger slet ikke
   et skær, hvis det ville nå ind i renden omkring `gab`, og renden er markeret
   med et rødt og et grønt sømærke. Enhedstesten tjekker 120 rækker over syv
   frø. Uden garantien kunne en række spærre hele havet, og så er det ikke ens
   egen skyld, at man rammer.
4. **Botten drejer et kort stykke og holder så kursen.** Den prøver tre ror
   (venstre/ligeud/højre) et par sekunder frem og vælger flest meter mod nord –
   men drejet varer kun `drejTid` (0,6 s) af horisonten. Holdt den roret i bund
   hele vejen, endte hvert drej i en spiral, og så så «lig stille» altid bedst
   ud – også i vindøjet, hvor man netop skal falde af. Med det på plads finder
   den selv ud af at krydse, og det er dén, der viser, at havet kan besejles
   (over 250 m på alle frø i enhedstesten).

Uvejret bagfra er Weeee!s lavine til søs: `STORM_MAKS` er med vilje mindre end
`MAKS_FART`, så man på en god kurs altid kan trække fra – presset kommer, når
vinden tvinger en op i øjet. Tre liv, fordi et skær ellers er en hård straf på
en iPad, hvor man ikke kan se hele havet frem.

Test: `test/sejl.test.mjs` (drejer med rigtige tryk på ror-knapperne, stamper i
vindøjet og flyver på halvvind, sejler ind i et skær og mister et hjerte, og
lader botten sejle hele turen, til uvejret tager den) + `test/unit/sejl.test.mjs`.

### Slanger – de to knapper og den fælles plade

Lars' ønske var en Snake.io-klon «i firkanter som paper io» — og med en pointe
om styringen: det værste ved snake på en telefon er touch, så man skal kunne
spille *uden at kigge*, som med 3- og 7-tasten på en gammel Nokia. Motoren bor
i `slange.mjs` uden DOM, sammen-reglerne i `sammen.mjs`; begge enhedstestes.

1. **Styringen er to drejninger, ikke fire retninger.** De to knapper fylder
   godt 40 % af skærmen (det *var* ønsket: «halvdelen af skærmen skal være
   knap») og drejer relativt: venstre mod uret, højre med uret. Trykkene lægges
   i en kø, der tømmes ét felt ad gangen (`sving()` i motoren), så to hurtige
   tryk giver to sving lige efter hinanden — uden køen kunne man ikke vende
   180° om et hjørne, og så føles styringen i stykker. Piletasterne virker
   stadig som faste retninger til dem, der spiller med tastatur.
2. **Maden bor i faste pladser, ikke i en liste.** Plads nr. j's position efter
   n spisninger er `madPos(seed, j, n)` — ren regning ud af frøet. Solo betyder
   det bare, at en spist perle «flytter sig»; sammen betyder det, at to
   telefoner kun skal blive enige om *tællerne*: hver sender sin egen
   spist-tæller pr. plads, og pladsens sande stilling er summen. Spiser begge
   den samme perle i samme nu, vokser begge, og tælleren hopper 2 — helt fint.
   Der sendes aldrig en madliste over nettet.
3. **Hver telefon dømmer kun sin egen død.** Vennens slange er et sekund bagud
   (som i Papirøen), men i snake er det den, der kører *ind* i noget, der dør —
   så kører jeg ind i vennens krop, som jeg ser den, er det min død, dømt på
   min telefon med mine data. Æren følger med i dødstallet (`doede` + `af`),
   så vennens skærm kan sige «Du tog Sofie!». Ingen krav-forhandling som på
   papiret. Døde slanger bliver til perler solo, men ikke sammen — de skulle
   holdes ens på to telefoner, og det er ikke det værd.

Runden sammen varer to minutter, man kommer igen når man dør, og den længste
(bedste længde) vinder. Test: `test/slanger.test.mjs` (drejeknapperne med en
rigtig finger, Nokia-dobbelttrykket, en hel runde til slutskærmen — og to
browsere, hvor Sofie inviterer Selma ind på den samme plade) +
`test/unit/slanger.test.mjs`.

### Kæmpetal – tallet, hjælperne og loftet

Selmas ønske #42 lød «Lav et spil hvor man kan mode Sine venner man kan mindst
Max 9999999999999» – læst som: et spil, hvor man kan **møde sine venner**, og
hvor man kan nå **9.999.999.999.999**. Det er blevet et clicker-spil, hvor
tallet selv er knappen. Motoren bor i `tal.mjs` (enhedstestet); fire ting er
værd at huske:

1. **Alt har et loft: MAKS = 9999999999999.** Det er præcis Selmas tal, det er
   under `Number.MAX_SAFE_INTEGER`, og både banken (`point`) og det samlede tal
   (`ialt`) klipper dér. Brøkdele fra produktionen samles i `rest`, til der er
   en hel, så der aldrig står kommatal på skærmen.
2. **Scoren er `ialt` – alt man nogensinde har tjent.** Køb koster af banken,
   men rører aldrig `ialt`, så toplisten kan kun gå fremad – og scoren sendes
   kun, når en ny tierpotens er rundet (`milepael`), ellers blev hvert klik til
   et API-kald.
3. **Mødet med vennen er kapløbs-mønstret, ikke tur-mønstret:** hver skriver
   kun sin egen halvdel af rummet (`{vaert, gaest}` med `ialt` og `sek`), hvert
   3. sekund og kun når tallet har flyttet sig. Vennens tal tikker levende på
   skærmen, fordi hens produktion (`sek`) følger med og regnes videre mellem
   opdateringerne. Summen af de to tal kan nå loftet – så fejres det SAMMEN,
   hos begge, også selv om ingen af dem er der alene.
4. **Balancen vogtes af en test:** en grådig spiller, der klikker tre gange i
   sekundet og altid køber den bedste hjælper, skal nå loftet på mellem en time
   og et døgns uafbrudt spil – i praksis nogle dages rigtigt spil, for
   hjælperne arbejder højst 8 timer alene (`FRAVAER_MAKS`, en skoledag, samme
   greb som Min kats fraværsloft).

Test: `test/kaempetal.test.mjs` (klik, butik, milepæl, loftet med fest – og to
browsere, hvor Sofie og Selma mødes og når loftet sammen) +
`test/unit/kaempetal.test.mjs`.

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
node --test test/unit/*.test.mjs     # Stenalders regelmotor, Dybets motor og «spil sammen»-lag, Kryds og bolles computerspiller, Duel-botten, Gulvet er lavas bane, Klodsers verden og fysik, Min kats behov og butik, Min hunds behov, gåtur og tricks, Mit livs behov, møbler og arbejde, Legebyens rum og figurer, Miskmasks 13 minispil, Blokblasts bræt og point, Slotskamps kamp og modstander, Weeee!s bakke og fysik, Papirøens sløjfe og modstandere, Papirøens to venner på ét papir, Fiskedybets farvande, kamp og økonomi, Copyrights motiver, gæt og point, Kæmpetals tal, hjælpere og loft, kapløbets stilling, forsidens kort og søgning, nyhedslisten, testserverens portvalg, højscore-, aktivitets-, idé-, venne-, rum- og besked-API'et (ingen browser, ~5 sek.)
```

**Flere testkørsler på én gang.** Kører to sessioner suiten samtidig, er de om
de samme porte, og dét har kostet tid nok til at fortjene et afsnit. Alle
worktrees serverer den samme forside, så et svar med `id="apps"` kan *ikke*
bruges til at afgøre, om serveren på porten er ens egen. Gør man det alligevel,
overtager man den anden sessions port — ens egen python er død stille, fordi
porten var optaget — og når den anden bliver færdig og lukker sin server,
fejler alle resterende tests med `ERR_CONNECTION_REFUSED`. Det ligner tyve
spilfejl, men er en portkollision. Derfor ligger portvalget i
`test/testserver.mjs`, som spørger om noget, der faktisk kan skelnes: **lever
vores egen python stadig?** (den afslutter med det samme, hvis porten er
optaget). `test/run.mjs` tjekker desuden mellem hver test, at serveren stadig
svarer, og rejser en ny, hvis den er faldet fra. Vælg stadig din egen port med
`PORT=419x`, men en kollision vælter ikke længere kørslen.

Playwright-testene kører uden Cloudflare, fordi `test/api-mock.mjs` sætter
serveren op i hukommelsen: den kalder den **rigtige** Worker-kode
(`haandterApi` og `haandterAktivitet`) med lagre i hukommelsen i stedet for D1,
så testene ser de samme svar som i drift. Hver test begynder med

```js
const api = await mockApi(page);    // før testens egen page.route, som så vinder
```

og kan bagefter kigge i `api.log.aktivitet`, `api.scores`, `api.ideer.rows`,
`api.venner.rows`, `api.rum.rows` og `api.beskeder.rows`. Tårn, Sæt, Dybet
og Obby lægger deres egen `page.route('**/api/highscore/**')` ovenpå, når de
har brug for en bestemt startliste. API'erne testes desuden hver for sig i
`test/unit/highscore.test.mjs`, `test/unit/aktivitet.test.mjs`,
`test/unit/ideer.test.mjs`, `test/unit/venner.test.mjs`,
`test/unit/rum.test.mjs` og `test/unit/beskeder.test.mjs`. Forsiden har seks
browser-tests: `test/forside.test.mjs` (navn, ønsker, «hvem er her»),
`test/soeg.test.mjs` (søgefeltet over listen),
`test/venner.test.mjs` (den tomme liste med navne til ét tryk, søg uden at
stave rigtigt, fortryd et spørgsmål, spørg, sig ja, se hvem der spiller hvad,
giv en ven et kælenavn, fjern en ven — den anden part spilles af testen selv
gennem `api.venner`),
`test/nyheder.test.mjs` («Nyt på Zydy», hvor en ekstra nyhed serveres gennem
`page.route('**/nyheder.json')`, så det kan prøves at der kommer noget til),
`test/beskeder.test.mjs` («skriv med en ven») og
`test/rum.test.mjs` («spil sammen»). De to sidste er blandt repoets syv tests
med **to browsere** (de andre er `test/dybet-sammen.test.mjs`,
`test/papir-sammen.test.mjs`, `test/kaploeb.test.mjs`, `test/slanger.test.mjs`
og `test/kaempetal.test.mjs`): Sofie og Selma har
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
svarer, og prøver ellers den næste port og siger det højt. 25 tests, der fejler
på én gang, er næsten altid dét og ikke 25 spilfejl.

## Tilføj en app — et nyt kort på forsiden

Et kort beskriver sig selv i sin egen mappe, og forsiden bygges ud fra
mapperne. Tilføj derfor **ingenting i hånden i `public/index.html`**:

```
public/spil/<id>/kort.json    navn, beskrivelse, nøgleord, url, orden, evt. topliste-regler
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
  "nøgleord": ["tower", "stable", "stak", "blokke"],   // det spillet *også* hedder – se Søg efter et spil
  "url": "/spil/taarn/",       // absolut https://… for apps der bor et andet sted, sammen med "ekstern": true
  "orden": 40,                 // placering før popularitets-sorteringen; vælg et tal ingen andre har
  "kapløb": true,              // to venner kan tage et kapløb i spillet – se Kapløb
  "højscore": { "maks": 2000 } // udelad, hvis spillet ikke har en topliste
}
```

To valgfrie felter mere: `"mærkat"` er en lille gul pille under beskrivelsen
(fx «Hjemme: uden login · ude: kode på mail» på KlaverLær), og `"alternativ"`
er en grøn genvej under kortet til et spil her på sitet, der kan det samme uden
login: `{ "spil": "klaverregn", "tekst": "🎹 Uden login og mail" }`. Den findes,
fordi KlaverLær bor bag Cloudflare Access og beder om en kode på mail, når man
ikke er hjemme — det kan et barn ikke komme videre fra, så kortet peger på
Klaverregn i stedet (Livas ønske #45). Generatoren fejler, hvis genvejen peger
på et spil, der ikke findes, og linket lægges *efter* `<a class="app">`, fordi
flere scripts tager kortets link med `querySelector('a')` og regner med det
første.

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
samme uden at skrive noget. `test/unit/soeg.test.mjs` fejler, hvis spillet ikke
har mindst tre `nøgleord` — eller ikke kan findes på sit eget navn.

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
