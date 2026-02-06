require('dotenv').config();

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

const { db, touchUpdatedAt, withTx } = require('./db');
const { MAX_RANK, validateMoviePayload, validateRankPayload } = require('./validators');
const { searchMovies, getMovie } = require('./tmdb');

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));

const listAllStmt = db.prepare(`
  SELECT * FROM movies
  ORDER BY CASE WHEN rank IS NULL THEN 1 ELSE 0 END, rank ASC, title ASC;
`);

const listRankedStmt = db.prepare(`
  SELECT * FROM movies
  WHERE rank IS NOT NULL
  ORDER BY rank ASC;
`);

const getByIdStmt = db.prepare('SELECT * FROM movies WHERE id = ?;');
const insertStmt = db.prepare(`
  INSERT INTO movies (tmdb_id, title, release_year, overview, poster_path, rank)
  VALUES (@tmdb_id, @title, @release_year, @overview, @poster_path, @rank);
`);
const updateStmt = db.prepare(`
  UPDATE movies
  SET tmdb_id = @tmdb_id,
      title = @title,
      release_year = @release_year,
      overview = @overview,
      poster_path = @poster_path,
      rank = @rank,
      updated_at = datetime('now')
  WHERE id = @id;
`);
const deleteStmt = db.prepare('DELETE FROM movies WHERE id = ?;');

const shiftRanksStmt = db.prepare(`
  UPDATE movies
  SET rank = rank + 1,
      updated_at = datetime('now')
  WHERE rank >= @fromRank AND rank <= @toRank;
`);

const clearOverflowRanksStmt = db.prepare(`
  UPDATE movies
  SET rank = NULL,
      updated_at = datetime('now')
  WHERE rank > @maxRank;
`);

const setRankStmt = db.prepare(`
  UPDATE movies
  SET rank = @rank,
      updated_at = datetime('now')
  WHERE id = @id;
`);

function ensureRankSpace(rank, excludeId = null) {
  const tx = withTx(() => {
    const fromRank = rank;
    const toRank = MAX_RANK;

    if (excludeId) {
      db.prepare(`
        UPDATE movies
        SET rank = NULL,
            updated_at = datetime('now')
        WHERE id = @excludeId AND rank = @rank;
      `).run({ excludeId, rank });
    }

    shiftRanksStmt.run({ fromRank, toRank });
    clearOverflowRanksStmt.run({ maxRank: MAX_RANK });
  });
  tx();
}

app.get('/health', (req, res) => {
  res.json({ ok: true });
});

app.get('/movies', (req, res) => {
  const movies = listAllStmt.all();
  res.json({ count: movies.length, movies });
});

app.get('/movies/top', (req, res) => {
  const movies = listRankedStmt.all();
  res.json({ count: movies.length, movies });
});

app.get('/movies/:id', (req, res) => {
  const movie = getByIdStmt.get(req.params.id);
  if (!movie) return res.status(404).json({ error: 'Movie not found' });
  res.json(movie);
});

app.post('/movies', (req, res) => {
  const { errors, movie } = validateMoviePayload(req.body);
  if (errors.length) return res.status(400).json({ errors });

  const tx = withTx(() => {
    if (movie.rank) {
      ensureRankSpace(movie.rank);
    }

    const result = insertStmt.run(movie);
    touchUpdatedAt.run(result.lastInsertRowid);
    return result.lastInsertRowid;
  });

  const id = tx();
  const created = getByIdStmt.get(id);
  res.status(201).json(created);
});

app.put('/movies/:id', (req, res) => {
  const existing = getByIdStmt.get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Movie not found' });

  const { errors, movie } = validateMoviePayload(req.body);
  if (errors.length) return res.status(400).json({ errors });

  const updated = {
    id: existing.id,
    tmdb_id: movie.tmdb_id ?? existing.tmdb_id,
    title: movie.title ?? existing.title,
    release_year: movie.release_year ?? existing.release_year,
    overview: movie.overview ?? existing.overview,
    poster_path: movie.poster_path ?? existing.poster_path,
    rank: movie.rank ?? existing.rank,
  };

  const tx = withTx(() => {
    if (movie.rank && movie.rank !== existing.rank) {
      ensureRankSpace(movie.rank, existing.id);
    }
    updateStmt.run(updated);
  });

  tx();
  res.json(getByIdStmt.get(existing.id));
});

app.patch('/movies/:id/rank', (req, res) => {
  const existing = getByIdStmt.get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Movie not found' });

  const { errors, rank } = validateRankPayload(req.body);
  if (errors.length) return res.status(400).json({ errors });

  const tx = withTx(() => {
    if (rank !== existing.rank) {
      ensureRankSpace(rank, existing.id);
    }
    setRankStmt.run({ id: existing.id, rank });
  });

  tx();
  res.json(getByIdStmt.get(existing.id));
});

app.delete('/movies/:id', (req, res) => {
  const existing = getByIdStmt.get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Movie not found' });

  deleteStmt.run(existing.id);
  res.status(204).send();
});

app.get('/tmdb/search', async (req, res) => {
  const query = (req.query.q || '').toString().trim();
  const page = Number(req.query.page || 1);

  if (!query) return res.status(400).json({ error: 'q query param is required' });
  if (!Number.isInteger(page) || page < 1 || page > 50) {
    return res.status(400).json({ error: 'page must be an integer between 1 and 50' });
  }

  try {
    const data = await searchMovies(query, page);
    res.json({
      page: data.page,
      total_pages: data.total_pages,
      total_results: data.total_results,
      results: data.results,
    });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, details: err.details });
  }
});

app.get('/tmdb/movie/:tmdbId', async (req, res) => {
  const tmdbId = Number(req.params.tmdbId);
  if (!Number.isInteger(tmdbId)) {
    return res.status(400).json({ error: 'tmdbId must be an integer' });
  }

  try {
    const data = await getMovie(tmdbId);
    res.json(data);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, details: err.details });
  }
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  console.log(`Moviepoa API running on http://localhost:${port}`);
});
