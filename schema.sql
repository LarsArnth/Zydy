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
  oprettet   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS scores_spil_score ON scores (spil, score DESC, oprettet ASC);
