const Database = require('better-sqlite3');
const path = require('path');

const dbFile = process.env.DATABASE_FILE || './db/moviepoa.sqlite';
const dbPath = path.isAbsolute(dbFile) ? dbFile : path.join(process.cwd(), dbFile);

const db = new Database(dbPath);

db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS movies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tmdb_id INTEGER,
    title TEXT NOT NULL,
    release_year INTEGER,
    overview TEXT,
    poster_path TEXT,
    rank INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_movies_rank ON movies(rank) WHERE rank IS NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_movies_tmdb_id ON movies(tmdb_id);
`);

const touchUpdatedAt = db.prepare(`
  UPDATE movies SET updated_at = datetime('now') WHERE id = ?;
`);

function withTx(fn) {
  const tx = db.transaction(fn);
  return tx;
}

module.exports = {
  db,
  touchUpdatedAt,
  withTx,
};
