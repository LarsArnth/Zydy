# zydy.dk – overblikssiden

Forsiden på **<https://zydy.dk>**: en liste med familiens apps og spil, så
børnene bare skal huske ét domæne. Siden er statisk HTML uden build og uden
afhængigheder. De store apps bor i egne repoer og linkes til; fem små spil
ligger direkte her under `public/spil/`.

| App | Hvor den kører | Kode |
|---|---|---|
| Ordle | <https://larsarnth.github.io/ordle/> (GitHub Pages) | `../Ordle` |
| Taltræf | <https://larsarnth.github.io/taltraef/> (GitHub Pages) | `../iPhoneSpil` |
| Imposter | <https://larsarnth.github.io/Imposter/> (GitHub Pages) | `../Imposter` |
| KlaverLær | <https://klaver.zydy.dk> (Cloudflare Worker + Access) | `../KlaverApp` |

## Spil der bor her

Ud over links til de andre apps huser repoet fem små spil, hver som én
HTML-fil under `public/spil/<navn>/` uden afhængigheder. De udrulles sammen
med forsiden og ligger på `https://zydy.dk/spil/<navn>/`:

| Spil | Sti | Hvad |
|---|---|---|
| Tårn | `public/spil/taarn/` | Stack-arcade på canvas: tryk for at slippe blokken, overhæng skæres af, perfekte drops giver bonus. |
| Sæt | `public/spil/saet/` | Kortspillet Set på dansk: find tre kort hvor antal, form, farve og fyld er helt ens eller helt forskellige. Klassisk og Blitz. |
| Farvesortering | `public/spil/farvesortering/` | Water sort: hæld farvet væske til hvert glas har én farve. Uendelige, solver-verificerede niveauer. |
| Ordstige | `public/spil/ordstige/` | Word ladder: skift ét bogstav ad gangen til et rigtigt dansk ord. Dagens stige + tilfældige. Ordlisten er Ordles (Stavekontrolden, GPL/LGPL/MPL). |
| Duel | `public/spil/duel/` | To spillere på én telefon, skærmen delt i to: fem reflex-minispil, først til 3/5/10 point. |

Alle spil gemmer highscore/fremskridt i `localStorage` under `zydy.<navn>.*`,
kan seedes med `?seed=123` og eksponerer `window.GAME` til tests.

### Test

```bash
PLAYWRIGHT=../DungeonCrawler/node_modules/playwright/index.mjs node test/run.mjs          # alle
PLAYWRIGHT=../DungeonCrawler/node_modules/playwright/index.mjs node test/run.mjs taarn    # ét spil
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
npm run serve      # http://localhost:4175
```

## Udrulning

Siden kører som en **Cloudflare Worker** med statiske filer (`wrangler.jsonc`),
samme opsætning som KlaverApp — men **uden** Cloudflare Access, for siden skal
være åben. Custom domains `zydy.dk` og `www.zydy.dk` peger på workeren `zydy`;
DNS-records oprettes automatisk af wrangler.

**Automatisk:** hvert push til `main` kører
[.github/workflows/deploy.yml](.github/workflows/deploy.yml). Kræver
`CLOUDFLARE_API_TOKEN` som GitHub-secret — samme smalle token som KlaverApp
(Workers Scripts: Edit + Workers Routes: Edit på zonen zydy.dk):

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
