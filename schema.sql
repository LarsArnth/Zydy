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
-- … og hvem der spiller lige nu (én række pr. browser-tab, heartbeat hvert 30. sek., glemt efter 90).
CREATE TABLE IF NOT EXISTS aktive (
  klient     TEXT    PRIMARY KEY,          -- tilfældigt id fra klienten (sessionStorage)
  spil       TEXT    NOT NULL,
  sidst      INTEGER NOT NULL              -- ms siden epoch
);
CREATE INDEX IF NOT EXISTS aktive_sidst ON aktive (sidst);
