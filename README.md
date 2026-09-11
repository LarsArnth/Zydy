# zydy.dk – overblikssiden

Forsiden på **<https://zydy.dk>**: en liste med familiens apps, så børnene bare
skal huske ét domæne. Siden er én statisk HTML-fil uden build og uden
afhængigheder. Den linker kun videre — selve appsene bor andre steder.

| App | Hvor den kører | Kode |
|---|---|---|
| Ordle | <https://larsarnth.github.io/ordle/> (GitHub Pages) | `../Ordle` |
| Imposter | <https://larsarnth.github.io/Imposter/> (GitHub Pages) | `../Imposter` |
| KlaverLær | <https://klaver.zydy.dk> (Cloudflare Worker + Access) | `../KlaverApp` |

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
