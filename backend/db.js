const { Pool } = require("pg");

const pool = new Pool({
  host: process.env.POSTGRES_HOST || "localhost",
  port: parseInt(process.env.POSTGRES_PORT || "5432"),
  database: process.env.POSTGRES_DB || "minerva",
  user: process.env.POSTGRES_USER || "minerva",
  password: process.env.POSTGRES_PASSWORD || "minerva_secret",
});

async function query(sql, params) {
  return pool.query(sql, params);
}

async function initDb() {
  console.log("Initializing PostgreSQL schema...");
  await pool.query(`
    CREATE TABLE IF NOT EXISTS games (
      id            SERIAL PRIMARY KEY,
      game_name     TEXT NOT NULL,
      filename      TEXT NOT NULL,
      full_path     TEXT NOT NULL UNIQUE,
      platform      TEXT NOT NULL DEFAULT '',
      group_name    TEXT NOT NULL DEFAULT '',
      region        TEXT NOT NULL DEFAULT '',
      size          TEXT NOT NULL DEFAULT '',
      size_bytes    BIGINT NOT NULL DEFAULT 0,
      magnet        TEXT NOT NULL DEFAULT '',
      torrent_file  TEXT NOT NULL DEFAULT '',
      so_id         INTEGER,
      md5           TEXT,
      sha1          TEXT,
      sha256        TEXT,
      crc32         TEXT,
      tags          TEXT[] NOT NULL DEFAULT '{}',
      description   TEXT,
      rating        NUMERIC(4,2),
      release_date  DATE,
      developer     TEXT,
      publisher     TEXT,
      genre         TEXT,
      images        TEXT[] NOT NULL DEFAULT '{}',
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_games_platform  ON games (platform);
    CREATE INDEX IF NOT EXISTS idx_games_group     ON games (group_name);
    CREATE INDEX IF NOT EXISTS idx_games_full_path ON games (full_path);

    CREATE TABLE IF NOT EXISTS search_logs (
      id          BIGSERIAL PRIMARY KEY,
      query       TEXT NOT NULL,
      results     INTEGER NOT NULL DEFAULT 0,
      searched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_search_logs_at    ON search_logs (searched_at);
    CREATE INDEX IF NOT EXISTS idx_search_logs_query ON search_logs (query);
  `);

  // Drop the legacy `download_url` column if upgrading from the pre-torrent
  // schema. Idempotent.
  await pool.query(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='games' AND column_name='download_url') THEN
        ALTER TABLE games DROP COLUMN download_url;
      END IF;
    END$$;
  `);

  await pool.query(
    `DELETE FROM search_logs WHERE searched_at < NOW() - INTERVAL '1 year'`,
  );

  console.log("PostgreSQL schema ready.");
}

async function logSearch(queryText, resultCount) {
  try {
    await pool.query(
      "INSERT INTO search_logs (query, results) VALUES ($1, $2)",
      [queryText.trim().toLowerCase(), resultCount],
    );
  } catch (_) {}
}

module.exports = { query, initDb, logSearch, pool };
