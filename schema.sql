-- Højscoreliste for spillene på zydy.dk (Cloudflare D1 = SQLite).
--
-- Kør mod den rigtige database (én gang, og igen hvis skemaet ændres):
--   npx wrangler@4 d1 execute zydy-highscore --remote --file schema.sql
-- Lokalt til `wrangler dev`:
--   npx wrangler@4 d1 execute zydy-highscore --local --file schema.sql
CREATE TABLE IF NOT EXISTS scores (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  spil       TEXT    NOT NULL,             -- fx 'taarn'
  navn       TEXT    NOT NULL,             -- 1-12 tegn, renset i Worker'en
  score      INTEGER NOT NULL,
  oprettet   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  token      TEXT                                -- hemmelighed som klienten får ved gemning; kræves for at rette navnet
);
-- Kolonnen token kom til 2026-09-12. Databaser oprettet før det blev opdateret med:
--   npx wrangler@4 d1 execute zydy-highscore --remote --command "ALTER TABLE scores ADD COLUMN token TEXT"
CREATE INDEX IF NOT EXISTS scores_spil_score ON scores (spil, score DESC, oprettet ASC);

-- Aktivitet (src/aktivitet.mjs): hvor tit hvert spil startes, pr. UTC-døgn …
CREATE TABLE IF NOT EXISTS starter (
  spil       TEXT    NOT NULL,
  dag        TEXT    NOT NULL,             -- 'YYYY-MM-DD'
  antal      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (spil, dag)
);
-- … og hvem der er på siden lige nu (én række pr. browser-tab, heartbeat hvert 30. sek., glemt efter 90).
CREATE TABLE IF NOT EXISTS aktive (
  klient     TEXT    PRIMARY KEY,          -- tilfældigt id fra klienten (sessionStorage)
  spil       TEXT    NOT NULL,             -- spillets id, eller 'forsiden' for dem der bare står på zydy.dk
  sidst      INTEGER NOT NULL,             -- ms siden epoch
  navn       TEXT                          -- spillerens navn fra localStorage ('zydy.navn'), tomt hvis man ikke har skrevet det
);
-- Kolonnen navn kom til 2026-09-12. Databaser oprettet før det blev opdateret med:
--   npx wrangler@4 d1 execute zydy-highscore --remote --command "ALTER TABLE aktive ADD COLUMN navn TEXT"
CREATE INDEX IF NOT EXISTS aktive_sidst ON aktive (sidst);

-- Venner (src/venner.mjs): hvem der har sagt ja til hinanden på forsiden.
-- Én række pr. par. Der er ingen login på zydy.dk, så et venskab er en aftale
-- mellem to navne: `fra`/`til` er navnet med små bogstaver (nøglen), og
-- `fra_navn`/`til_navn` er navnet som det blev skrevet, til visning.
CREATE TABLE IF NOT EXISTS venner (
  fra        TEXT    NOT NULL,             -- den der spurgte (nøgle, små bogstaver)
  til        TEXT    NOT NULL,             -- den der blev spurgt
  fra_navn   TEXT    NOT NULL,             -- som skrevet, fx 'Sofie'
  til_navn   TEXT    NOT NULL,
  oprettet   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  svaret     TEXT,                         -- tidsstempel for ja'et (NULL = der er ikke svaret endnu)
  PRIMARY KEY (fra, til)
);
CREATE INDEX IF NOT EXISTS venner_til ON venner (til);

-- Spil sammen (src/rum.mjs): ét rum pr. par venner, der spiller det samme spil
-- på hver sin telefon. Serveren kender ikke spillets regler – `tilstand` er
-- spillets egen JSON, og `version` tælles op ved hver skrivning, så de to ikke
-- kan skrive oven i hinanden. Rum uden aktivitet i tre timer ryddes.
CREATE TABLE IF NOT EXISTS rum (
  kode       TEXT    PRIMARY KEY,          -- fx 'K7QFD', står i adressen: /spil/kryds/?rum=K7QFD
  spil       TEXT    NOT NULL,             -- fx 'kryds'
  vaert      TEXT    NOT NULL,             -- den der inviterede (nøgle, små bogstaver)
  vaert_navn TEXT    NOT NULL,             -- som skrevet, fx 'Sofie'
  gaest      TEXT    NOT NULL,             -- den der blev inviteret
  gaest_navn TEXT    NOT NULL,
  status     TEXT    NOT NULL DEFAULT 'inviteret',   -- 'inviteret' | 'igang' | 'slut'
  version    INTEGER NOT NULL DEFAULT 0,
  tilstand   TEXT,                         -- spillets egen JSON (NULL indtil første træk)
  opdateret  INTEGER NOT NULL              -- ms siden epoch
);
CREATE INDEX IF NOT EXISTS rum_vaert ON rum (vaert, opdateret DESC);
CREATE INDEX IF NOT EXISTS rum_gaest ON rum (gaest, opdateret DESC);

-- Beskeder (src/beskeder.mjs): to venner der skriver sammen på forsiden.
-- `samtale` er de to navne med små bogstaver, sorteret og samlet med '|'
-- ('selma|sofie'), så begge retninger havner i den samme samtale. Tiden er ms
-- siden epoch. Hvem der har læst hvad, står ikke her, men på telefonen.
-- Tabellen laves også af Worker'en selv ved første besked (d1Beskeder), så den
-- virker, selv om denne fil ikke er kørt mod den rigtige database.
CREATE TABLE IF NOT EXISTS beskeder (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  samtale    TEXT    NOT NULL,             -- 'selma|sofie'
  fra        TEXT    NOT NULL,             -- afsenderen (nøgle, små bogstaver)
  fra_navn   TEXT    NOT NULL,             -- som skrevet, fx 'Sofie'
  til        TEXT    NOT NULL,
  til_navn   TEXT    NOT NULL,
  tekst      TEXT    NOT NULL,             -- 1-200 tegn, renset i Worker'en
  oprettet   INTEGER NOT NULL              -- ms siden epoch
);
CREATE INDEX IF NOT EXISTS beskeder_samtale ON beskeder (samtale, id);
CREATE INDEX IF NOT EXISTS beskeder_fra ON beskeder (fra, oprettet);

-- Opkald (src/opkald.mjs): to venner der ringer sammen. Lyden går peer-to-peer
-- (WebRTC) og rører aldrig serveren; her står kun tilbud/svar, mens forbindelsen
-- laves, og om der ringes, tales eller er lagt på. Tabellen laves også af
-- Worker'en selv ved første opkald (d1Opkald), som beskeder.
CREATE TABLE IF NOT EXISTS opkald (
  kode      TEXT PRIMARY KEY,              -- som rummets koder: 5 tegn uden I, O, 0 og 1
  fra       TEXT    NOT NULL,              -- den der ringer op (nøgle, små bogstaver)
  fra_navn  TEXT    NOT NULL,              -- som skrevet, fx 'Sofie'
  til       TEXT    NOT NULL,
  til_navn  TEXT    NOT NULL,
  status    TEXT    NOT NULL,              -- 'ringer', 'igang' eller 'slut'
  tilbud    TEXT,                          -- WebRTC-tilbuddet fra den, der ringer (JSON)
  svar      TEXT,                          -- WebRTC-svaret fra den, der tager den (JSON)
  opdateret INTEGER NOT NULL               -- ms siden epoch
);
CREATE INDEX IF NOT EXISTS opkald_fra ON opkald (fra, opdateret);
CREATE INDEX IF NOT EXISTS opkald_til ON opkald (til, opdateret);

-- Grupper (src/grupper.mjs): en gruppe venner, der skriver sammen alle på én
-- gang. Selve snakken ligger i `beskeder` under samtalen 'gruppe|<kode>', så
-- gruppen arver trimning, længdegrænse og spam-værn derfra. Koden er en
-- rumkode (5 tegn uden I, O, 0 og 1). Tabellerne laves også af Worker'en selv
-- ved første gruppe (d1Grupper), som beskeder og opkald.
CREATE TABLE IF NOT EXISTS grupper (
  kode          TEXT PRIMARY KEY,            -- fx 'K7QFD'
  navn          TEXT    NOT NULL,            -- 1-24 tegn, renset i Worker'en
  lavet_af      TEXT    NOT NULL,            -- den der lavede den (nøgle, små bogstaver)
  lavet_af_navn TEXT    NOT NULL,            -- som skrevet, fx 'Selma'
  oprettet      INTEGER NOT NULL             -- ms siden epoch
);
CREATE TABLE IF NOT EXISTS gruppe_medlem (
  kode        TEXT    NOT NULL,
  medlem      TEXT    NOT NULL,              -- nøgle, små bogstaver
  medlem_navn TEXT    NOT NULL,              -- som personen selv staver det
  kom         INTEGER NOT NULL,              -- ms siden epoch – rækkefølgen i gruppen
  PRIMARY KEY (kode, medlem)
);
CREATE INDEX IF NOT EXISTS gruppe_medlem_person ON gruppe_medlem (medlem, kom);

-- Idéer og ønsker (src/ideer.mjs): forslag til nye spil og ting der mangler i
-- dem der findes. Hentes ned med `npm run ideer`.
CREATE TABLE IF NOT EXISTS ideer (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  slags      TEXT    NOT NULL,             -- 'nyt' (forslag til nyt spil) eller 'oenske' (ønske til et spil)
  spil       TEXT,                         -- kun ved 'oenske', fx 'taarn'
  navn       TEXT    NOT NULL,             -- 1-12 tegn, renset i Worker'en
  tekst      TEXT    NOT NULL,             -- 3-600 tegn
  oprettet   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  loest      TEXT,                         -- tidsstempel, når ønsket er håndteret (NULL = uløst)
  loesning   TEXT                          -- hvad der blev lavet, eller 'afvist: …'
);
CREATE INDEX IF NOT EXISTS ideer_slags ON ideer (slags, id DESC);
-- loest/loesning kom til 2026-09-12 sammen med feedback-loopet i rodmappen
-- (../zydy-feedback-loop.mjs). Loopet tilføjer dem selv, hvis de mangler:
--   npx wrangler@4 d1 execute zydy-highscore --remote --command "ALTER TABLE ideer ADD COLUMN loest TEXT"
--   npx wrangler@4 d1 execute zydy-highscore --remote --command "ALTER TABLE ideer ADD COLUMN loesning TEXT"
