const Database = require('better-sqlite3');
const path = require('path');

const dbFile = process.env.DATABASE_FILE || './db/moviepoa.sqlite';
const dbPath = path.isAbsolute(dbFile) ? dbFile : path.join(process.cwd(), dbFile);

const db = new Database(dbPath);

db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    display_name TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS movies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    tmdb_id INTEGER,
    title TEXT NOT NULL,
    release_year INTEGER,
    overview TEXT,
    poster_path TEXT,
    rank INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  DROP INDEX IF EXISTS idx_movies_rank;
  CREATE UNIQUE INDEX IF NOT EXISTS idx_movies_user_rank ON movies(user_id, rank) WHERE rank IS NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_movies_tmdb_id ON movies(tmdb_id);
  CREATE INDEX IF NOT EXISTS idx_movies_user_id ON movies(user_id);
`);

const touchUpdatedAt = db.prepare(`
  UPDATE movies SET updated_at = datetime('now') WHERE id = ?;
`);

function columnExists(table, column) {
  const info = db.prepare(`PRAGMA table_info(${table});`).all();
  return info.some((col) => col.name === column);
}

if (!columnExists('movies', 'user_id')) {
  db.exec(`ALTER TABLE movies ADD COLUMN user_id INTEGER;`);
}

function withTx(fn) {
  const tx = db.transaction(fn);
  return tx;
}

module.exports = {
  db,
  touchUpdatedAt,
  withTx,
};
